#!/usr/bin/env node
// A Bed Wars arena series (agentArena/bedwarsArena.mjs: five games of five squads of four) as one recording for the arena
// film (src/cinema/arenaDuelFilm.js), as scripts/arena-series-film-data.mjs does for SkyWars: each game made into a
// recording by scripts/arena-duel-film-data.mjs, then laid one after another on one clock, the world put back between
// games. The players keep one order all series (squad by squad: Opus1-4, Sol1-4, ...); each game says which base colour
// each squad played (the teams turn from game to game), and holds what the film needs of Bed Wars:
// - every death, `final` when the chat called it a FINAL KILL (the player is out for the game);
// - every bed broken (`bed`: whose, by whom), every team eliminated (`teamout`), and the announcements (`announce`);
// - the closing zone: its centre, radius and void level from start to closed, on the film's clock.
//   node scripts/bedwars-series-film-data.mjs agentArena/runs/bedwars-five-r2 public/cinema-arena-duel/bedwars-five-r2
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { planZone, islandColumns, CLOSING } from '../src/mods/closingZone.js';
import { ARENA } from '../src/mods/bedwars/arena.js';

const [runDir, outDir] = process.argv.slice(2);
if (!runDir || !outDir) throw new Error('usage: node scripts/bedwars-series-film-data.mjs <run folder> <out folder>');
const GAP = 4;
const summary = JSON.parse(readFileSync(path.join(runDir, 'summary.json'), 'utf8'));
const rounds = readdirSync(runDir).filter((d) => /^round-\d+-bedwars$/.test(d) && existsSync(path.join(runDir, d, 'film.json')))
  .sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));
if (!rounds.length) throw new Error(`no recorded games in ${runDir}`);

// A base's colour as the film names it (arenaDuelFilm.js TEAM).
const COLOUR = { red: 'Red', blue: 'Blue', green: 'Green', yellow: 'Yellow', aqua: 'Cyan' };
const BASE_OF_NAME = { Red: 'red', Blue: 'blue', Green: 'green', Yellow: 'yellow', Aqua: 'aqua' };
const MODEL_NAMES = { 'deepseek-flash': 'DeepSeek V4.1 Flash', 'claude-opus-5-5': 'Claude Opus 5.5', 'gpt-6.1-sol': 'GPT-6.1 Sol', 'gemini-3.8-flash-high': 'Gemini 3.8 Flash' };
const label = (p) => (p.harness === 'scripted' || !p.model ? 'the scripted bot' : [MODEL_NAMES[p.model] ?? p.model, p.effort ? `${p.effort} effort` : null].filter(Boolean).join(' · '));
const squads = summary.players.map((p) => ({ name: p.name, model: label(p), members: [1, 2, 3, 4].map((i) => `${p.name}${i}`) }));
const order = squads.flatMap((s) => s.members);
const squadOf = (name) => squads.find((s) => s.members.includes(name))?.name ?? null;

const games = [], frames = [], events = [], blockChanges = [];
let map = null, offset = 0, names = {}, bounds = null, firstCells = null;
const state = new Map();
const cellsOf = (m) => { const out = new Map(); for (let i = 0; i < m.cells.length; i += 4) out.set(`${m.cells[i]},${m.cells[i + 1]},${m.cells[i + 2]}`, m.cells[i + 3]); return out; };
const jl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);

for (const folder of rounds) {
  const tmp = path.join(outDir, 'games', folder);
  const made = spawnSync(process.execPath, [path.resolve('scripts/arena-duel-film-data.mjs'), runDir, folder, tmp], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (made.status !== 0) throw new Error(`${folder}: ${made.stderr || made.stdout}`);
  const rec = JSON.parse(readFileSync(path.join(tmp, 'recording.json'), 'utf8'));
  const film = JSON.parse(readFileSync(path.join(runDir, folder, 'film.json'), 'utf8'));
  const mapInfo = JSON.parse(readFileSync(path.join(runDir, folder, 'map.json'), 'utf8'));
  const idx = order.map((name) => rec.players.findIndex((p) => p.name === name));
  if (idx.some((i) => i < 0)) throw new Error(`${folder}: the players are not the series' (${rec.players.map((p) => p.name)})`);
  const T0 = film.clock.playing - 3, g = (t) => +(t - T0 + offset).toFixed(2);

  // The world back to this game's opening map, in the gap before it.
  const cells = cellsOf(rec.map);
  names = { ...names, ...rec.map.names };
  const b = rec.map.bounds;
  bounds = bounds ? Object.fromEntries(Object.keys(b).map((k) => [k, k.startsWith('min') ? Math.min(bounds[k], b[k]) : Math.max(bounds[k], b[k])])) : { ...b };
  if (!map) { map = rec.map; firstCells = cells; }
  else {
    const at = +(offset - GAP / 2).toFixed(2);
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

  // Bed Wars from the chat: final kills, beds, teams out, the announcements.
  const chat = jl(path.join(runDir, folder, 'recording', 'chat.jsonl')).filter((c) => c.t >= T0);
  const finals = chat.filter((c) => /FINAL KILL/.test(c.text ?? ''));
  const baseColour = Object.fromEntries(mapInfo.squads.map((s) => [s.name, COLOUR[s.team]]));
  const squadOfBase = Object.fromEntries(mapInfo.squads.map((s) => [s.team, s.name]));
  for (const e of rec.events) {
    const ev = { ...e, t: +(e.t + offset).toFixed(2), ...(e.landsAt !== undefined ? { landsAt: +(e.landsAt + offset).toFixed(2) } : {}) };
    if (e.kind === 'death') {
      const t = e.t + T0;
      ev.final = finals.some((c) => c.text.startsWith(`${e.player} `) && Math.abs(c.t - t) < 1.5);
      ev.how = /void|swallowed/.test(e.text ?? '') ? (/swallowed/.test(e.text) ? 'zone' : 'void') : 'slain';
    }
    events.push(ev);
  }
  for (const c of chat) {
    const bed = /BED DESTRUCTION > (\w+) Bed was destroyed by (\w+)/.exec(c.text ?? '');
    if (bed) events.push({ t: g(c.t), kind: 'bed', squad: squadOfBase[BASE_OF_NAME[bed[1]]], base: bed[1], by: bed[2] });
    const out = /TEAM ELIMINATED > (\w+) Team/.exec(c.text ?? '');
    if (out) events.push({ t: g(c.t), kind: 'teamout', squad: squadOfBase[BASE_OF_NAME[out[1]]], base: out[1] });
    if (/All beds have been destroyed|SUDDEN DEATH|void is rising|won Bed Wars/.test(c.text ?? '')) events.push({ t: g(c.t), kind: 'announce', text: c.text });
  }

  // The closing zone of this map, on the film's clock.
  const blocks = new Map();
  for (let i = 0; i < rec.map.cells.length; i += 4) blocks.set(`${rec.map.cells[i]},${rec.map.cells[i + 1]},${rec.map.cells[i + 2]}`, rec.map.cells[i + 3]);
  const plan = planZone(islandColumns(blocks, { maxY: ARENA.lobbyY - 4 }), { voidY: ARENA.voidY });
  const playAt = rec.playStartsAt + offset, limit = summary.timeLimit ?? 600;
  const zone = { x: plan.x, z: plan.z, startRadius: plan.startRadius, endRadius: plan.endRadius, startFloor: plan.startFloor, endFloor: plan.endFloor,
    startsAt: +(playAt + limit * CLOSING.start).toFixed(2), closedAt: +(playAt + limit * CLOSING.closed).toFixed(2) };

  const end = rec.frames.at(-1).t;
  const round = Number(folder.split('-')[1]);
  const match = summary.matches?.find((m) => m.round === round);
  games.push({ round, folder, map: match?.map ?? { name: mapInfo.name, layout: mapInfo.layout }, start: +offset.toFixed(2), end: +(offset + end).toFixed(2), playStartsAt: +playAt.toFixed(2),
    colours: baseColour, winner: match?.winner ?? null, endReason: match?.endReason ?? null, places: match?.places ?? null, points: match?.points ?? null, zone });
  offset += end + GAP;
}

const first = games[0].colours;
const players = order.map((name) => ({ name, team: first[squadOf(name)], squad: squadOf(name), model: squads.find((s) => s.name === squadOf(name)).model }));
const out = {
  version: 3, game: 'bedwars', run: summary.run, series: true, frameSeconds: 0.25, roundSeconds: summary.timeLimit ?? 600,
  playStartsAt: games[0].playStartsAt, endsAt: games.at(-1).end,
  map: { names, cells: map.cells, bounds },
  players, squads: squads.map((s) => ({ name: s.name, model: s.model, players: s.members })),
  teams: squads.map((s) => ({ name: first[s.name], squad: s.name, players: s.members })),
  result: { scores: summary.scores, winner: summary.winner, ranking: summary.ranking, wins: summary.wins }, games,
  blockChanges: blockChanges.sort((a, b) => a[0] - b[0]), frames, events: events.sort((a, b) => a.t - b.t),
};
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'recording.json'), JSON.stringify(out));
rmSync(path.join(outDir, 'games'), { recursive: true, force: true });
console.log(`${outDir}/recording.json: ${games.length} games, ${frames.length} frames (0 to ${out.endsAt} s), ${blockChanges.length} block changes, ${events.length} events`);
for (const gm of games) {
  const ev = events.filter((e) => e.t >= gm.start && e.t <= gm.end);
  console.log(`  game ${gm.round} ${gm.map.name}: ${gm.start}-${gm.end} (play ${gm.playStartsAt}); ${gm.winner} wins; deaths ${ev.filter((e) => e.kind === 'death').length} (final ${ev.filter((e) => e.kind === 'death' && e.final).length}); beds ${ev.filter((e) => e.kind === 'bed').map((e) => `${e.squad} by ${e.by}`).join(', ')}; out ${ev.filter((e) => e.kind === 'teamout').map((e) => e.squad).join(', ')}; zone r ${gm.zone.startRadius}->${gm.zone.endRadius}`);
}
console.log('Next: make the film by src/cinema/ARENA_FILM_GUIDELINES.md, and check it with node scripts/check-arena-film.mjs --movie=<film>.');
