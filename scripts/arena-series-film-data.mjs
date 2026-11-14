#!/usr/bin/env node
// A whole scripted-arena series (agentArena/scriptedArena.mjs: several games on one map) as one recording for the duel
// film (src/cinema/arenaDuelFilm.js): each game made into a recording by scripts/arena-duel-film-data.mjs, then laid
// one after another on one clock, a few seconds apart. Between two games the world is put back as the next game began
// (block changes in the gap), the players keep one order and one colour all series (the join order swaps), and
// rec.games says where each game starts and its own clock (play starts 3 s in), so an edit can place a scene in a game.
//   node scripts/arena-series-film-data.mjs agentArena/runs/ds-low-vs-max public/cinema-arena-duel/ds-low-vs-max
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { planZone, islandColumns, CLOSING } from '../src/mods/closingZone.js';
import { buildArena, ARENA as SKY, allCageCells, cellKey, normalizeMap } from '../src/mods/skywars/arena.js';

const [runDir, outDir] = process.argv.slice(2);
if (!runDir || !outDir) throw new Error('usage: node scripts/arena-series-film-data.mjs <run folder> <out folder>');
const GAP = 4; // seconds of clock between one game's last frame and the next game's first
const summary = JSON.parse(readFileSync(path.join(runDir, 'summary.json'), 'utf8'));
const rounds = readdirSync(runDir).filter((d) => /^round-\d+-/.test(d) && existsSync(path.join(runDir, d, 'film.json')))
  .sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));
if (!rounds.length) throw new Error(`no recorded games in ${runDir}`);

// One colour a player all series: the first listed is Blue, the second Red (SkyWars' colours for slots 0 and 1).
const order = summary.players.map((p) => p.name);
// A duel's two are Blue and Red; a free-for-all's others take the rest of the film's colours (arenaDuelFilm.js TEAM).
const TEAMS = ['Blue', 'Red', 'Green', 'Yellow', 'Purple', 'Orange', 'Cyan', 'Pink'];
const MODEL_NAMES = { 'deepseek-flash': 'DeepSeek V4.1 Flash', 'claude-opus-5-5': 'Claude Opus 5.5', 'gpt-6.1-sol': 'GPT-6.1 Sol', 'gemini-3.8-flash-high': 'Gemini 3.8 Flash', 'gemini-3.8-flash-medium': 'Gemini 3.8 Flash' };
const label = (p) => (p.harness === 'scripted' || !p.model ? 'the scripted bot'
  : [MODEL_NAMES[p.model] ?? p.model, p.effort ? `${p.effort} effort` : null].filter(Boolean).join(' · '));

const games = [], frames = [], events = [], blockChanges = [];
let map = null, offset = 0, names = {}, bounds = null;
const state = new Map(); // the world as the clock stands: "x,y,z" -> id, where it differs from the first map
const cellsOf = (m) => { const out = new Map(); for (let i = 0; i < m.cells.length; i += 4) out.set(`${m.cells[i]},${m.cells[i + 1]},${m.cells[i + 2]}`, m.cells[i + 3]); return out; };
let firstCells = null;
for (const folder of rounds) {
  const tmp = path.join(outDir, 'games', folder);
  const made = spawnSync(process.execPath, [path.resolve('scripts/arena-duel-film-data.mjs'), runDir, folder, tmp], { encoding: 'utf8' });
  if (made.status !== 0) throw new Error(`${folder}: ${made.stderr || made.stdout}`);
  const rec = JSON.parse(readFileSync(path.join(tmp, 'recording.json'), 'utf8'));
  const film = JSON.parse(readFileSync(path.join(runDir, folder, 'film.json'), 'utf8'));
  const idx = order.map((name) => rec.players.findIndex((p) => p.name === name));
  if (idx.some((i) => i < 0)) throw new Error(`${folder}: the players are not the series' (${rec.players.map((p) => p.name)})`);
  // The world back to this game's opening map: every cell that differs, changed in the gap before it.
  const cells = cellsOf(rec.map);
  // A series may change map every game (agentArena/scriptedArena.mjs --mode unseen): every map's block names, and room for all.
  names = { ...names, ...rec.map.names };
  const b = rec.map.bounds;
  bounds = bounds ? Object.fromEntries(Object.keys(b).map((k) => [k, k.startsWith('min') ? Math.min(bounds[k], b[k]) : Math.max(bounds[k], b[k])])) : { ...b };
  if (!map) { map = rec.map; firstCells = cells; }
  else {
    const at = +(offset - GAP / 2).toFixed(2);
    // Every cell where this map differs from the first one (a block only one of them has, or two different blocks), and
    // every cell the games so far have changed.
    const keys = new Set([...state.keys(), ...[...cells.keys(), ...firstCells.keys()].filter((k) => (cells.get(k) ?? 0) !== (firstCells.get(k) ?? 0))]);
    for (const k of keys) {
      const want = cells.get(k) ?? 0, now = state.has(k) ? state.get(k) : (firstCells.get(k) ?? 0);
      if (want !== now) { const [x, y, z] = k.split(',').map(Number); blockChanges.push([at, x, y, z, want]); }
      if (want === (firstCells.get(k) ?? 0)) state.delete(k); else state.set(k, want);
    }
  }
  for (const [t, x, y, z, id] of rec.blockChanges) {
    blockChanges.push([+(t + offset).toFixed(2), x, y, z, id]);
    const k = `${x},${y},${z}`; if (id === (firstCells.get(k) ?? 0)) state.delete(k); else state.set(k, id);
  }
  for (const f of rec.frames) frames.push({ ...f, t: +(f.t + offset).toFixed(2), p: idx.map((i) => f.p[i]) });
  for (const e of rec.events) events.push({ ...e, t: +(e.t + offset).toFixed(2), ...(e.landsAt !== undefined ? { landsAt: +(e.landsAt + offset).toFixed(2) } : {}) });
  const end = rec.frames.at(-1).t;
  const round = Number(folder.split('-')[1]);
  const match = summary.matches?.find((m) => m.round === round);
  // The closing zone of a timed game (src/mods/closingZone.js), as the SkyWars client plans it, on the film's clock.
  let zone = null;
  const limit = summary.timeLimit ?? (match?.endReason === 'time_limit' ? match.seconds : null) ?? 480;
  try {
    const arena = buildArena(normalizeMap(match.map)), cages = new Set(allCageCells(arena).map(([x, y, z]) => cellKey(x, y, z)));
    const blocks = [...arena.blocks].filter(([k]) => !cages.has(k)), plan = planZone(islandColumns(blocks), { voidY: SKY.voidY, cells: blocks });
    const playAt = offset + rec.playStartsAt;
    zone = { x: plan.x, z: plan.z, startRadius: plan.startRadius, endRadius: plan.endRadius, startFloor: plan.startFloor, endFloor: plan.endFloor, startsAt: +(playAt + limit * CLOSING.start).toFixed(2), closedAt: +(playAt + limit * CLOSING.closed).toFixed(2) };
  } catch { /* no map to plan from */ }
  games.push({ round, folder, map: match?.map ?? null, zone, places: match?.places ?? null, start: +offset.toFixed(2), end: +(offset + end).toFixed(2), playStartsAt: +(offset + rec.playStartsAt).toFixed(2),
    joinsFirst: film.players[0]?.name ?? null, winner: match?.winner ?? rec.result?.winner ?? null, endReason: match?.endReason ?? rec.result?.endReason ?? null });
  offset += end + GAP;
}
const players = order.map((name, i) => ({ name, team: TEAMS[i], model: label(summary.players[i]) }));
const out = {
  version: 3, game: 'skywars', run: summary.run, series: true, frameSeconds: 0.25, roundSeconds: 600,
  playStartsAt: games[0].playStartsAt, endsAt: games.at(-1).end,
  map: { names, cells: map.cells, bounds },
  players, teams: players.map((p) => ({ name: p.team, players: [p.name] })),
  result: { scores: summary.scores, winner: summary.winner }, games,
  blockChanges: blockChanges.sort((a, b) => a[0] - b[0]), frames, events: events.sort((a, b) => a.t - b.t),
};
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'recording.json'), JSON.stringify(out));
rmSync(path.join(outDir, 'games'), { recursive: true, force: true }); // each game's own recording, merged above
console.log(`${outDir}/recording.json: ${games.length} games, ${frames.length} frames (0 to ${out.endsAt} s), ${blockChanges.length} block changes, ${events.length} events`);
for (const g of games) console.log(`  game ${g.round}: ${g.start}-${g.end} s (play from ${g.playStartsAt}); ${g.joinsFirst} joins first; ${g.winner ?? 'no'} wins (${g.endReason})`);
console.log('Next: make the film by src/cinema/ARENA_FILM_GUIDELINES.md, and check it with node scripts/check-arena-film.mjs --movie=<film>.');
