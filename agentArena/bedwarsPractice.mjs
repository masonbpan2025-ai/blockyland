// Practice games for the Bed Wars arena's agents (agentArena/bedwarsArena.mjs), played by the arena: the agent's
// `node practice.mjs` files a request, scriptedPractice.mjs servePractice runs this file as `node bedwarsPractice.mjs run
// <job.json>`, one game a child process, the agent's bot loaded afresh.
//
// A game: the agent's squad (its workspace's bot/, four players) against 1-4 squads of the unchanged scripted bot, in
// the five-team mode (the empty teams are out at the start), with the Bed Wars referee, on a layout the agent names or
// one drawn at random, and a seed likewise. Written to practice/<n>/: summary.md, timeline.txt, chat.txt, referee.txt,
// map.txt, recording/.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TEAMS } from '../src/mods/bedwars/teams.js';

const jl = (dir, f) => { const p = path.join(dir, 'recording', f); return existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []; };

/** The squads of a practice game: mine and the scripted ones, my team turning from game to game. */
export function practiceSquads({ name, n, opponents, module, difficulty, referee, violations }) {
  const count = Math.max(1, Math.min(4, Math.floor(Number(opponents) || 1)));
  const names = [name, ...Array.from({ length: count }, (_, i) => (count > 1 ? `Scripted${String.fromCharCode(65 + i)}` : 'Scripted'))];
  // My team (base) turns with the game number: practice 1 Red, 2 Blue, ...
  const turn = (n - 1) % (count + 1);
  const order = [...names.slice(1, 1 + turn), names[0], ...names.slice(1 + turn)];
  return order.flatMap((squad, ti) => Array.from({ length: 4 }, (_, i) => ({
    name: `${squad}${i + 1}`, team: TEAMS[ti].id, scripted: difficulty,
    ...(squad === name ? { sessionModule: module } : {}), onSession: referee(`${squad}${i + 1}`, violations),
  })));
}

async function runOne(jobFile) {
  const job = JSON.parse(readFileSync(jobFile, 'utf8'));
  const { runBotMatch } = await import('./botMatch.mjs');
  const { bedwarsReferee } = await import('./referee.mjs');
  const { LAYOUT_IDS } = await import('../src/mods/bedwars/layouts.js');
  const layout = LAYOUT_IDS.includes(job.template) ? job.template : LAYOUT_IDS[Math.floor(Math.random() * LAYOUT_IDS.length)];
  const seed = job.seed !== null && Number.isFinite(Number(job.seed)) ? Number(job.seed) >>> 0 : Math.floor(Math.random() * 1e9);
  const dir = path.dirname(jobFile);
  const violations = [];
  const players = practiceSquads({ name: job.name, n: job.n, opponents: job.opponents, module: path.join(job.ws, 'bot', 'scriptedBot', 'scriptedBot.mjs'), difficulty: job.difficulty, referee: bedwarsReferee, violations });
  const myTeam = players.find((p) => p.name === `${job.name}1`).team;
  const squads = [...new Set(players.map((p) => p.team))].length;
  writeFileSync(path.join(dir, 'map.txt'), `layout ${layout}, seed ${seed}; ${squads} squads of four (${squads - 1} of the scripted bot); your team: ${myTeam} (players ${job.name}1-${job.name}4); ${job.timeLimit / 60} minutes\n`);
  const result = await runBotMatch({ game: 'bedwars', bedwarsMode: 'fives', bedwarsLayout: layout, bedwarsSeed: seed, players, outDir: dir, video: false, port: job.port,
    difficulty: job.difficulty, statusEveryTicks: 5, maxSeconds: job.timeLimit ?? 360, log: () => {} });
  const ev = jl(dir, 'events.jsonl');
  const t0 = ev.find((e) => e.kind === 'phase' && e.phase === 'playing')?.t ?? 0;
  const ts = (t) => `${(t - t0).toFixed(1)}s`;
  writeFileSync(path.join(dir, 'timeline.txt'), ev.filter((e) => e.kind === 'autopilot_status').map((e) => `${ts(e.t)} ${e.who.padEnd(11)} (${e.pos.x}, ${e.pos.y}, ${e.pos.z}) hp ${e.health}${e.absorption ? `+${e.absorption}` : ''} ${e.held ?? 'empty hand'} | ${e.doing ?? ''}`).join('\n'));
  const chat = [...new Map(jl(dir, 'chat.jsonl').filter((c) => !/HUD hidden|recipes|advancement|left the world|joined the world/.test(c.text)).map((c) => [c.text, `${ts(c.t)} ${c.text}`])).values()];
  writeFileSync(path.join(dir, 'chat.txt'), chat.join('\n'));
  writeFileSync(path.join(dir, 'referee.txt'), violations.map((v) => `${v.who}: ${v.kind}: ${v.detail}${v.dropped ? ' (DROPPED)' : ''}`).join('\n') || '(nothing)');
  const winnerTeam = result.winner ?? null;
  const verdict = winnerTeam === myTeam ? 'your team won' : winnerTeam ? `the ${winnerTeam} team won` : `no winner (${result.endReason})`;
  const important = chat.filter((l) => /BED DESTRUCTION|TEAM ELIMINATED|FINAL KILL|won Bed Wars|beds have been|closing|ended in a draw/.test(l));
  const summary = `# Practice ${job.n} (${layout}, seed ${seed}, ${squads} squads; you were ${myTeam}): ${verdict} after ${result.seconds} s\n\n${important.slice(-25).join('\n')}\n\nReferee: ${violations.length ? `${violations.length} notes (see referee.txt)` : 'nothing'}\nFiles: practice/${job.n}/timeline.txt (every bot every 0.5 s), chat.txt (every message), referee.txt, map.txt, recording/ (everything).`;
  writeFileSync(path.join(dir, 'summary.md'), summary);
}

if (process.argv[2] === 'run' && import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runOne(process.argv[3]).then(() => process.exit(0), (err) => { console.error(err?.stack ?? err); process.exit(1); });
}
