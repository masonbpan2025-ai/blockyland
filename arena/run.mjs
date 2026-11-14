#!/usr/bin/env node
// Run a team battle: the arena, its round server, and one Claude Code session per player.
//
//   node arena/run.mjs --out arena-runs/game1 [--model sonnet] [--seed 20261102] [--round-wait 150]
//   node arena/run.mjs --out arena-runs/test --scripted     scripted players instead of AI, to test the arena quickly
//
// Writes into --out: events.jsonl (every plan with its thinking, every result, hit, death and chat, as they happen),
// agents/<name>.jsonl (each Claude session's own stream), recording.json (the replay for the film, saved every round)
// and summary.json at the end.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { ArenaSim } from './sim.js';
import { createArenaServer } from './server.js';
import { systemPrompt } from './agentGuide.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const OUT = resolve(opt('out', `arena-runs/game-${new Date().toISOString().replace(/[:.]/g, '-')}`));
const MODEL = opt('model', 'sonnet');
const PORT = Number(opt('port', 47700));
const SEED = Number(opt('seed', 20261102));
const ROUND_WAIT = Number(opt('round-wait', 150)) * 1000;
const MAX_ROUNDS = Number(opt('max-rounds', 60));
const SCRIPTED = args.includes('--scripted');
const shell = process.platform === 'win32';

mkdirSync(join(OUT, 'agents'), { recursive: true });
const t0 = Date.now();
const say = (...a) => { const line = `[${((Date.now() - t0) / 1000).toFixed(0).padStart(5)}s] ${a.join(' ')}`; console.log(line); appendFileSync(join(OUT, 'run.log'), `${line}\n`); };

const TEAMS = [
  { name: 'Red', color: '#e5484d', players: ['Ash', 'Bree', 'Cole', 'Dara', 'Eli'] },
  { name: 'Blue', color: '#3e63dd', players: ['Fay', 'Gus', 'Hana', 'Ivo', 'Juno'] },
];
const sim = new ArenaSim({ seed: SEED, teams: TEAMS });
sim.onLog = (entry) => appendFileSync(join(OUT, 'events.jsonl'), `${JSON.stringify(entry)}\n`);
// The game logged its start before this writer was attached.
for (const e of sim.events) appendFileSync(join(OUT, 'events.jsonl'), `${JSON.stringify(e)}\n`);
const saveRecording = () => writeFileSync(join(OUT, 'recording.json'), JSON.stringify(sim.recording()));

const server = createArenaServer(sim, {
  port: PORT, roundWaitMs: ROUND_WAIT, log: say,
  onRound: (s) => {
    saveRecording();
    const alive = TEAMS.map(t => `${t.name} ${s.players.filter(e => e.team.name === t.name && e.alive).length}`).join(', ');
    say(`round ${s.round} played (game time ${Math.round(s.time)} s): ${alive}; border ${s.borderRadius()}`);
    if (!s.over && s.round >= MAX_ROUNDS) {
      // A draw is decided by who has more players standing, then by health.
      const score = t => s.players.filter(e => e.team.name === t.name && e.alive).reduce((n, e) => n + 100 + e.player.health, 0);
      const [a, b] = TEAMS.map(score);
      s.over = { winner: a === b ? null : a > b ? TEAMS[0].name : TEAMS[1].name, round: s.round, time: +s.time.toFixed(1), byTimeLimit: true, survivors: s.players.filter(e => e.alive).map(e => e.name) };
      s.log('game_over', s.over);
    }
  },
});
await server.listen();
say(`arena on http://127.0.0.1:${PORT}, writing to ${OUT}`);

const children = new Map();
const stopAll = () => { for (const c of children.values()) try { c.kill(); } catch { /* gone */ } };
process.on('SIGINT', () => { stopAll(); saveRecording(); process.exit(1); });

/** One Claude Code session playing one player. Restarted if it ends before the game does. */
function startAgent(name, attempt = 1) {
  const team = TEAMS.find(t => t.players.includes(name));
  const enemy = TEAMS.find(t => t !== team);
  const configPath = join(OUT, 'agents', `${name}.mcp.json`);
  writeFileSync(configPath, JSON.stringify({ mcpServers: { arena: { command: 'node', args: [resolve('arena/mcp.mjs')], env: { ARENA_URL: `http://127.0.0.1:${PORT}`, ARENA_PLAYER: name } } } }, null, 2));
  const prompt = `${systemPrompt({ name, team: team.name, teammates: team.players.filter(n => n !== name), captain: team.players[0], enemyTeam: enemy.name })}
${attempt > 1 ? '\nYou were reconnected partway through the game. Call look to see where things stand, then carry on.\n' : ''}
Begin now: call look, then act every round until the game is over.`;
  const child = spawn('claude', ['-p', '--model', MODEL, '--mcp-config', configPath, '--strict-mcp-config',
    '--allowedTools', 'mcp__arena__look,mcp__arena__act', '--output-format', 'stream-json', '--verbose', '--max-turns', '400'],
    { shell, cwd: OUT, env: { ...process.env, MCP_TOOL_TIMEOUT: '900000', MCP_TIMEOUT: '60000' } });
  child.stdin.end(prompt);
  children.set(name, child);
  const stream = join(OUT, 'agents', `${name}.jsonl`);
  createInterface({ input: child.stdout }).on('line', (line) => {
    appendFileSync(stream, `${line}\n`);
    try {
      const m = JSON.parse(line);
      if (m.type === 'result') say(`${name}: session ended (${m.num_turns} turns, $${(m.total_cost_usd ?? 0).toFixed(2)})`);
    } catch { /* not JSON */ }
  });
  child.stderr.on('data', (d) => appendFileSync(join(OUT, 'agents', `${name}.err`), String(d)));
  child.on('exit', (code) => {
    children.delete(name);
    const entry = sim.byName(name);
    if (!sim.over && entry.alive && attempt < 6) {
      say(`${name}: session exited (${code}) mid-game; restarting`);
      setTimeout(() => startAgent(name, attempt + 1), 3000);
    }
  });
}

/** A scripted player, for testing the arena without AI: gear up, then hunt the nearest enemy. */
async function scriptedAgent(name) {
  const post = (body) => fetch(`http://127.0.0.1:${PORT}/act`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ player: name, ...body }) }).then(r => r.json());
  const plans = [['acquire 1 stone_pickaxe'], ['mine 3 iron_ore', 'mine 2 coal_ore'], ['acquire 3 iron_ingot'], ['acquire 1 iron_sword', 'equip iron_sword'], ['attack cow', 'eat beef']];
  for (let turn = 0; ; turn++) {
    const view = (await (await fetch(`http://127.0.0.1:${PORT}/look?player=${name}`)).json());
    if (view.over || !view.you.alive) return;
    const enemy = view.enemies.find(e => e.alive && e.seen !== false) ?? view.enemies.find(e => e.alive);
    // A long step still under way is left to finish.
    if (view.you.still_working && turn > 0 && turn <= plans.length) { turn--; const res = await post({ thought: 'still working', plan: ['continue'] }); if (res.game_over || res.eliminated) return; continue; }
    const plan = turn < plans.length ? plans[turn] : enemy ? [`attack player ${enemy.name}`] : ['guard'];
    const res = await post({ thought: `turn ${turn}: ${plan.join(', ')}`, plan, chat: turn === 0 ? `${name} here, gearing up.` : '' });
    if (res.game_over || res.eliminated) return;
  }
}

for (const team of TEAMS) for (const name of team.players) {
  if (SCRIPTED) scriptedAgent(name).catch((e) => say(`${name}: ${e.message}`));
  else startAgent(name);
}

// Done when the game is over and every session has had its last answer.
await new Promise((done) => {
  const check = setInterval(() => {
    if (!sim.over) return;
    clearInterval(check);
    setTimeout(done, SCRIPTED ? 500 : 60_000);
  }, 1000);
});
stopAll();
saveRecording();
const summary = {
  over: sim.over, rounds: sim.round, gameSeconds: Math.round(sim.time), realSeconds: Math.round((Date.now() - t0) / 1000), model: SCRIPTED ? 'scripted' : MODEL,
  players: sim.players.map(e => ({ name: e.name, team: e.team.name, alive: e.alive, killedBy: e.killedBy, kills: e.kills, damageDealt: Math.round(e.damageDealt) })),
  // What went wrong most, to find the arena's rough edges.
  failures: Object.entries(sim.events.filter(e => e.kind === 'result' && !e.ok).reduce((m, e) => { const k = String(e.message).slice(0, 48); m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 12),
  results: { ok: sim.events.filter(e => e.kind === 'result' && e.ok).length, failed: sim.events.filter(e => e.kind === 'result' && !e.ok).length },
};
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
say(`game over: ${JSON.stringify(sim.over)}`);
await server.close();
process.exit(0);
