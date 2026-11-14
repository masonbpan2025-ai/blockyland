#!/usr/bin/env node
// The `arena` command an agent uses from its workspace (agentArena/docs/agent-rules.md, "Your tools"):
//
//   arena status            the schedule, your player now, what your strategy logged lately, its errors
//   arena view              the whole last view your strategy was given (JSON), to see every field
//   arena log [n]           the last n lines your strategy logged (default 60)
//   arena check [file]      load a strategy and run it for 30 ticks on a sample view of its game: catches syntax
//                           errors, exceptions and slow ticks before the match does (default: both strategies)
//   arena practice <game> [seconds] [--vs dummy|self|<file.js>] [--setup <file.json>]
//                           queue a practice game, within your practice time (before round 1)
//   arena practice result   the report of your last practice game
//   arena ready             check that you are prepared for the next round and tell the arena so
//   arena review [round]    your report of a round played: what your player did and saw, your strategy's log
//   arena score             the rounds so far and the score
//   arena rules             where the rule books are
//
// It knows whose status to show from ARENA_PLAYER and ARENA_STATUS (set by the arena when it starts the agent).
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { readiness, finalReadiness, practiceUsed, PRACTICE_SECONDS } from './readiness.mjs';

// An Antigravity agent's arguments arrive in .agents/args.json (agyGuard.mjs: its CLI grants only exact command lines).
function argv() {
  const given = process.argv.slice(2);
  const f = path.resolve('.agents', 'args.json');
  try {
    const saved = JSON.parse(readFileSync(f, 'utf8'));
    unlinkSync(f);
    if (Date.now() - saved.at < 60000 && Array.isArray(saved.argv) && saved.argv[0] === (given[0] ?? 'status')) return saved.argv.map(String);
  } catch { /* none */ }
  return given;
}
const [cmd = 'status', ...rest] = argv();
const player = process.env.ARENA_PLAYER;
const statusDir = process.env.ARENA_STATUS;
const schedulePath = statusDir ? path.join(statusDir, 'schedule.json') : null;
const here = import.meta.dirname;
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null);
const ago = (iso) => { if (!iso) return ''; const s = Math.round((Date.parse(iso) - Date.now()) / 1000); return s >= 0 ? `in ${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${Math.floor(-s / 60)}m${String(-s % 60).padStart(2, '0')}s ago`; };

function schedule() {
  const text = schedulePath && read(schedulePath);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function showSchedule() {
  const s = schedule();
  if (!s) { console.log('No schedule yet: the arena has not started.'); return; }
  console.log(`Now: ${new Date().toISOString()}  (you are ${player})${s.over ? '  THE ARENA IS OVER' : ''}`);
  s.matches.forEach((m, i) => {
    const round = m.round ?? i + 1;
    const readyNames = Object.entries(s.ready ?? {}).filter(([k, v]) => v && k.endsWith(`-round-${round}`)).map(([k]) => k.slice(0, k.lastIndexOf('-round-'))).join(', ') || 'nobody yet';
    const when = m.waitingForReady && !m.startedAt ? `starts 2 minutes after both players pass \`arena ready\` (at the latest ${m.latestStart}, ${ago(m.latestStart)}); ready: ${readyNames}` : m.endedAt ? `ended ${ago(m.endedAt)}${m.result ? ` - ${m.result}` : ''}` : m.startedAt ? `PLAYING since ${ago(m.startedAt)}` : m.waitingForReady === false && m.startsAt ? `starts ${ago(m.startsAt)} (${m.startsAt})` : 'after the round before';
    console.log(`  Round ${round}: ${m.game.padEnd(8)} (limit ${Math.round((m.limitSeconds ?? 0) / 60)} min) strategy file: strategies/${m.game}.js  ${when}`);
  });
  if (s.scores) console.log(`Score: ${Object.entries(s.scores).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ')} (win +1, tie 0, loss -1)`);
}

function score() {
  showSchedule();
}

function review(args) {
  const dir = path.resolve('review');
  const rounds = existsSync(dir) ? readdirSync(dir).filter((d) => /^round-\d+$/.test(d)).sort((a, b) => Number(a.slice(6)) - Number(b.slice(6))) : [];
  if (!rounds.length) { console.log('No round has been played yet.'); return; }
  const pick = args[0] ? `round-${Number(args[0])}` : rounds.at(-1);
  const f = path.join(dir, pick, 'report.txt');
  if (!existsSync(f)) { console.log(`No report for ${pick}. Rounds played: ${rounds.join(', ')}`); return; }
  console.log(read(f));
  // The public replay: what both players did, as anyone watching saw it.
  const replay = path.join(dir, pick, 'replay.txt');
  if (existsSync(replay)) console.log(`\n==== the round's replay (public: the same for both players) ====\n${read(replay)}`);
  console.log(`\n(Everything for this round is in review/${pick}/. Yours alone: report.txt, your program's whole log (strategy-log.txt), every action it called with its timing and result (actions.jsonl), your frames (frames.jsonl). Public, the same for both players: the replay (replay.txt, and replay-frames.jsonl with every player's visible state several times a second) and the arena camera every 5 seconds (screens/, images you can open with Read).)`);
}

function status() {
  showSchedule();
  if (!statusDir || !player) return;
  const text = read(path.join(statusDir, `${player}.json`));
  if (!text) { console.log('\nNo match running yet: your player has no status. Prepare your strategies and run `arena check`.'); return; }
  const st = JSON.parse(text);
  const v = st.view;
  console.log(`\n== ${st.game} (${st.arenaPhase}) ==`);
  if (st.result) console.log(`Result: ${JSON.stringify(st.result.winnerName ?? st.result.winner)} won (${st.result.endReason}); you are ${player}`);
  const s = st.strategy;
  console.log(`Strategy: version ${s.version} loaded, ${s.ticks} ticks run, ${s.errors} tick errors, ${s.slowTicks} too slow${s.loadError ? `\n  LOAD ERROR (previous version still runs): ${s.loadError}` : ''}${s.lastError ? `\n  last error (tick ${s.lastError.tick}): ${s.lastError.error.split('\n').slice(0, 4).join('\n    ')}` : ''}`);
  console.log(`Hands: ${st.input.pending} inputs queued, ${st.input.executed} done${st.input.recentErrors?.length ? `; recent failures: ${st.input.recentErrors.map((e) => `${e.cmd}: ${e.message}`).join(' | ')}` : ''}`);
  if (v) {
    const me = v.me;
    console.log(`Time ${Math.round(v.time)} s of play${v.timeLimit ? ` of the ${v.timeLimit} s limit: ${Math.round(v.timeLeft)} s left (then a tie)` : ''}, phase ${v.phase}. You: ${me.dead ? 'DEAD' : `health ${me.health}`}, hunger ${me.hunger}, armour ${me.armorPoints ?? '?'}, at ${me.pos ? `${me.pos.x.toFixed(1)} ${me.pos.y.toFixed(1)} ${me.pos.z.toFixed(1)}` : '?'}, holding ${me.held ? me.held.item : 'nothing'}, ${me.gamemode}`);
    console.log(`Hotbar: ${me.hotbar.map((h, i) => `${i}:${h ?? '-'}`).join('  ')}`);
    console.log(`Screen: ${v.screen}. Crosshair: ${v.crosshair ? JSON.stringify(v.crosshair) : 'nothing'}`);
    console.log(`Players: ${v.players.length ? v.players.map((p) => `${p.name} (${p.seen}, ${p.distance} away${p.held ? `, holds ${p.held}` : ''})`).join('; ') : 'none in sight'}`);
    const m = v.match;
    if (m?.players) console.log(`Scoreboard: ${m.players.map((p) => `${p.name}${p.team ? `[${p.team}]` : ''} ${p.alive ? 'alive' : 'out'}${p.kills !== undefined ? ` ${p.kills} kills` : ''}`).join('; ')}${m.teams ? ` | beds: ${m.teams.map((t) => `${t.id} ${t.bed ? 'standing' : 'gone'}`).join(', ')}` : ''}`);
  }
  console.log(`\nLast strategy log lines (arena log for more):`);
  for (const line of st.logTail ?? []) console.log(`  ${line}`);
}

function practiceState() { try { return JSON.parse(read(path.join(statusDir, 'practice-state.json')) ?? 'null'); } catch { return null; } }

function practice(args) {
  if (!statusDir || !player) throw new Error('the arena is not running');
  if (args[0] === 'result') {
    const dir = path.join(statusDir, 'practice');
    const mine = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith(`${player}-`) && f.endsWith('.txt')).sort() : [];
    const st = practiceState();
    if (st?.running === player) console.log(`Your practice game is being played now (started ${ago(st.startedAt)}). Watch it with arena status and arena log.\n`);
    else if (st?.queue?.includes(player)) console.log(`Your practice game is queued (${st.queue.indexOf(player) + 1} in line${st.running ? `; ${st.running} is practising now` : ''}).\n`);
    if (!mine.length) { console.log('No practice report yet.'); return; }
    console.log(`(${mine.length} report(s); the latest is ${mine.at(-1)})\n`);
    console.log(read(path.join(dir, mine.at(-1))));
    return;
  }
  const usage = 'usage: arena practice skywars|bedwars [seconds] [--vs dummy|self|<file.js>] [--setup <file.json>]   or   arena practice result';
  const opt = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); if (!v) throw new Error(usage); return v; };
  const vsArg = opt('--vs') ?? 'dummy';
  const setupArg = opt('--setup');
  const [game, secArg] = args;
  if (game !== 'skywars' && game !== 'bedwars') throw new Error(usage);
  const inside = (f) => { const abs = path.resolve(f); if (!abs.startsWith(process.cwd() + path.sep)) throw new Error(`${f}: must be a file in your workspace`); if (!existsSync(abs)) throw new Error(`${f}: not found`); return abs; };
  const vs = vsArg === 'dummy' || vsArg === 'self' ? vsArg : inside(vsArg);
  let setup = null;
  if (setupArg) {
    try { setup = JSON.parse(readFileSync(inside(setupArg), 'utf8')); } catch (err) { throw new Error(`${setupArg}: ${err.message}`); }
    if (typeof setup !== 'object' || (!setup.me && !setup.opponent)) throw new Error(`${setupArg}: a setup is { "me": {...}, "opponent": {...} } (see docs/agent-rules.md, Practice)`);
  }
  const st = practiceState();
  if (st?.closed) { console.log(`Practice is closed: ${st.closed}`); process.exitCode = 1; return; }
  const used = practiceUsed(statusDir, player);
  const left = PRACTICE_SECONDS.budget - used;
  if (left < PRACTICE_SECONDS.min) { console.log(`Your practice time is used up (${used} of ${PRACTICE_SECONDS.budget} s played).`); process.exitCode = 1; return; }
  const seconds = Math.min(left, PRACTICE_SECONDS.max, Math.max(PRACTICE_SECONDS.min, Number(secArg) || Math.min(PRACTICE_SECONDS.default, left)));
  const q = path.join(statusDir, 'practice-queue');
  mkdirSync(q, { recursive: true });
  writeFileSync(path.join(q, `${player}.json`), JSON.stringify({ game, seconds, vs, setup, at: new Date().toISOString() }));
  const ahead = (st?.queue ?? []).filter((n) => n !== player).length + (st?.running && st.running !== player ? 1 : 0);
  const against = vs === 'dummy' ? 'a dummy that never moves' : vs === 'self' ? `a copy of your strategies/${game}.js as it is now` : path.relative(process.cwd(), vs);
  console.log(`Practice ${game} queued: ${seconds} s of play, your strategies/${game}.js against ${against}${setup ? ', from your setup' : ''}. Saves to strategies/${game}.js during it reload, as in a match.`);
  console.log(`Practice time: ${used} s used of ${PRACTICE_SECONDS.budget}; this game takes up to ${seconds} more (only play counts, not setting up).`);
  console.log(`${ahead ? `${ahead} practice game(s) ahead of yours. ` : ''}Setting up takes about a minute: the report should be ready in about ${Math.ceil((seconds + 70 + ahead * 150) / 60)} minutes.`);
  console.log('While it plays: arena status, arena log. Afterwards: arena practice result.');
}

async function ready() {
  if (!statusDir || !player) throw new Error('the arena is not running');
  const s = schedule();
  const idx = s?.matches?.findIndex((x) => !x.startedAt) ?? -1;
  if (idx < 0) { await finalReady(s); return; }
  const m = s.matches[idx];
  const round = m.round ?? idx + 1;
  let web = 0;
  try { web = JSON.parse(read(path.join(statusDir, `${player}.web.json`)) ?? '{}').webCalls ?? 0; } catch { /* none */ }
  const file = path.resolve('strategies', `${m.game}.js`);
  console.log(`== arena check strategies/${m.game}.js ==`);
  const checkOk = existsSync(file) && await check(file, m.game);
  const r = readiness({ ws: process.cwd(), statusDir, player, game: m.game, webCalls: web, checkOk, round, earlierGames: s.matches.slice(0, idx).map((x) => x.game) });
  console.log(`\n== ready for round ${round} (${m.game})? ==`);
  for (const i of r.items) console.log(`  [${i.ok ? 'x' : ' '}] ${i.what}`);
  const flag = path.join(statusDir, 'ready', `${player}-round-${round}.json`);
  mkdirSync(path.dirname(flag), { recursive: true });
  if (r.ok) {
    writeFileSync(flag, JSON.stringify({ at: new Date().toISOString() }));
    console.log(`\nREADY for round ${round}. It starts 2 minutes after both players are ready. Keep improving your strategy until then, and during the round.`);
  } else {
    if (existsSync(flag)) unlinkSync(flag);
    console.log('\nNot ready yet: finish the unchecked items, then run arena ready again.');
    process.exitCode = 1;
  }
}

/** After the last round: the series looked back on and every strategy given its final edit (agent-rules.md). */
async function finalReady(s) {
  const last = s?.matches?.at(-1);
  if (!s?.final || !last?.endedAt) { console.log('No round left to prepare for, and the final reflection has not opened yet: wait for the last round to end.'); return; }
  const games = [...new Set(s.matches.map((x) => x.game))];
  const checks = {};
  for (const game of games) {
    const file = path.resolve('strategies', `${game}.js`);
    console.log(`== arena check strategies/${game}.js ==`);
    checks[game] = existsSync(file) && await check(file, game);
  }
  const r = finalReadiness({ ws: process.cwd(), lastRound: last.round, games, lastEndedAt: Date.parse(last.endedAt), checks });
  console.log(`\n== done with the series? ==`);
  for (const i of r.items) console.log(`  [${i.ok ? 'x' : ' '}] ${i.what}`);
  const flag = path.join(statusDir, 'ready', `${player}-final.json`);
  mkdirSync(path.dirname(flag), { recursive: true });
  if (r.ok) {
    writeFileSync(flag, JSON.stringify({ at: new Date().toISOString() }));
    console.log(`\nDONE. Your final reflection and strategies are in. The final interview follows once both players are done (at the latest ${s.final.latest}).`);
  } else {
    if (existsSync(flag)) unlinkSync(flag);
    console.log(`\nNot done yet: finish the unchecked items, then run arena ready again (at the latest ${s.final.latest}).`);
    process.exitCode = 1;
  }
}

function log(n = 60) {
  const text = statusDir && player && read(path.join(statusDir, `${player}.log`));
  if (!text) { console.log('Nothing logged yet.'); return; }
  console.log(text.trimEnd().split('\n').slice(-n).join('\n'));
}

function view() {
  const text = statusDir && player && read(path.join(statusDir, `${player}.view.json`));
  if (text) { console.log(text); return; }
  console.log('No live view yet (no match running). A sample view of each game, as the strategy gets it, is printed by:');
  console.log('  arena view skywars    or    arena view bedwars');
}

function sample(game) {
  const f = path.join(here, 'samples', `bot-${game}.json`);
  if (!existsSync(f)) throw new Error(`no recorded ${game} state yet to check against; practise instead (arena practice ${game})`);
  return JSON.parse(readFileSync(f, 'utf8'));
}

/**
 * Load a strategy into the real sandbox and run main for 3 seconds of arena time against a recorded game state, every
 * action answered at once: what it asks for, what it logs, what breaks. The state does not change.
 */
async function check(file, game) {
  const { Program } = await import('./botRunner.mjs');
  const s = sample(game);
  let program;
  try { program = new Program(readFileSync(file, 'utf8'), file); } catch (err) { console.log(`${file}: DOES NOT LOAD\n${err.name}: ${err.message}`); return false; }
  const ops = new Map();
  let errors = 0, worst = 0, now = 0, results = [];
  const run = (code, limit) => { const t = performance.now(); try { return program.call(code, limit); } finally { worst = Math.max(worst, performance.now() - t); } };
  try {
    run(`__deliver(${JSON.stringify(JSON.stringify({ now, world: s.world, state: s.state, results: [], events: [] }))})`, 1000);
    run(`__start(${JSON.stringify('{}')})`, 1000);
  } catch (err) { console.log(`main did not start: ${err.message}`); return false; }
  for (let i = 0; i < 60; i++) {
    now += 50;
    try { run(`__deliver(${JSON.stringify(JSON.stringify({ now, state: s.state, results, events: [] }))})`, i < 5 ? 400 : 50); } catch (err) { errors++; console.log(`at ${now} ms: ${/timed out/i.test(err.message) ? 'ran longer than 50 ms without awaiting' : err.message}`); break; }
    const out = JSON.parse(run('__drain()', 200));
    for (const line of out.logs) console.log(`log: ${line}`);
    if (out.exit?.error) { errors++; console.log(`main stopped with an error: ${out.exit.error}`); break; }
    results = [];
    for (const r of out.reqs) { ops.set(r.op, (ops.get(r.op) ?? 0) + 1); if (r.id) results.push({ id: r.id, ok: true, value: null }); }
  }
  console.log(`${file}: loaded; ran 3 s of arena time on a recorded ${game} state, ${errors} errors, slowest step ${worst.toFixed(1)} ms.`);
  console.log(`Actions asked for: ${ops.size ? [...ops].map(([k, n]) => `${k} x${n}`).join(', ') : 'none'}`);
  console.log('(The state does not change and every action is answered at once: this checks that the code runs, not that it plays well. Practise for that.)');
  return errors === 0;
}

/**
 * Notices the arena adds to both workspaces during a run (docs/NOTICE-*.md): shown in full the first time each one is
 * seen, then as a one-line reminder, so an agent busy with commands sees it before it next reads CLAUDE.md.
 */
function notices() {
  const dir = path.resolve('docs');
  if (!existsSync(dir) || !statusDir || !player) return;
  const files = readdirSync(dir).filter((f) => /^NOTICE-.*\.md$/.test(f)).sort();
  if (!files.length) return;
  const seenFile = path.join(statusDir, `${player}.notices-seen.json`);
  let seen = [];
  try { seen = JSON.parse(read(seenFile) ?? '[]'); } catch { /* none */ }
  for (const f of files) {
    if (seen.includes(f)) {
      const first = (read(path.join(dir, f)) ?? '').split('\n')[0].replace(/[>*#]/g, '').trim();
      console.log(`(Arena notice, docs/${f}: ${first.slice(0, 120)}${first.length > 120 ? '...' : ''})`);
    }
    else { console.log(`${read(path.join(dir, f)).trim()}\n`); seen.push(f); }
  }
  try { writeFileSync(seenFile, JSON.stringify(seen)); } catch { /* next time */ }
  console.log('');
}

try {
  await (async () => {
  notices();
  if (cmd === 'status') status();
  else if (cmd === 'log') log(Number(rest[0]) || 60);
  else if (cmd === 'view') {
    if (rest[0] === 'skywars' || rest[0] === 'bedwars') { const s = sample(rest[0]); console.log(JSON.stringify(s.state, null, 1)); }
    else view();
  } else if (cmd === 'check') {
    const files = rest.length ? rest : readdirSync('strategies').filter((f) => /^(skywars|bedwars).js$/.test(f)).map((f) => `strategies/${f}`);
    let ok = true;
    for (const f of files) {
      const abs = path.resolve(f);
      const game = /bedwars/i.test(path.basename(abs)) ? 'bedwars' : 'skywars';
      if (!existsSync(abs)) { console.log(`${f}: not found`); ok = false; continue; }
      ok = (await check(abs, game)) && ok;
      console.log('');
    }
    process.exitCode = ok ? 0 : 1;
  } else if (cmd === 'practice') practice(rest);
  else if (cmd === 'ready') await ready();
  else if (cmd === 'refused') {
    // What an Antigravity agent's refused shell command turns into (agyGuard.mjs).
    console.log('REFUSED: that shell command is not allowed. The only shell command you can run is `arena` (for example `arena status`), as a command of its own, without ;, &&, | or redirections. List, read and write files with your file tools, inside your own folder.');
    process.exitCode = 1;
  } else if (cmd === 'review') review(rest);
  else if (cmd === 'score') score();
  else if (cmd === 'rules') {
    console.log('docs/agent-rules.md       the arena rules for AI agents (read first)\ndocs/strategy-api.md      the bot API your strategy program uses (the same for every game)\ndocs/skywars-rulebook.md  SkyWars in Blockyland\ndocs/bedwars-rulebook.md  Bed Wars in Blockyland');
  } else {
    console.log('usage: arena status | arena view [skywars|bedwars] | arena log [n] | arena check [file...] | arena practice <game> [seconds] [--vs dummy|self|<file.js>] [--setup <file.json>] | arena practice result | arena ready | arena review [round] | arena score | arena rules');
    process.exitCode = 2;
  }
  })();
} catch (err) {
  console.log(`arena: ${err.message}`);
  process.exitCode = 1;
}
