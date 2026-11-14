#!/usr/bin/env node
// An Agent Arena bot-match round (agentArena/runs/<run>/round-N-<game>/film.json) turned into the recording the duel
// film plays (src/cinema/arenaDuelFilm.js), in the team battle film's format (src/cinema/arenaFilm.js): the map as its
// blocks, every player every 0.25 s, block changes, hits and deaths, on one clock that starts 3 s before play.
//   node scripts/arena-duel-film-data.mjs agentArena/runs/gemini-vs-deepseek-sw3 round-1-skywars public/cinema-arena-duel/sw3
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { BLOCKS } from '../src/blocks.js';

const [runDir, roundFolder = 'round-1-skywars', outDir] = process.argv.slice(2);
if (!runDir || !outDir) throw new Error('usage: node scripts/arena-duel-film-data.mjs <run folder> <round folder> <out folder>');
const round = path.join(runDir, roundFolder);
const film = JSON.parse(readFileSync(path.join(round, 'film.json'), 'utf8'));
const map = JSON.parse(readFileSync(path.join(round, 'recording', 'arena-blocks.json'), 'utf8'));
const summary = JSON.parse(readFileSync(path.join(runDir, 'summary.json'), 'utf8'));

// The film's clock: 0 is 3 s before play began (the end of the countdown).
const T0 = film.clock.playing - 3;
const g = (t) => Math.round((t - T0) * 100) / 100;
// A held item as the game's item renderer takes it: a block by its id, anything else by its name.
const itemId = (name) => { if (!name) return null; if (Number.isInteger(name)) return name > 0 ? name : null; const id = BLOCKS[String(name).toUpperCase()]; return Number.isInteger(id) && id > 0 ? id : String(name); };

const names = film.players.map((p) => p.name);
const frames = film.frames.filter((f) => f.t >= T0).map((f) => ({
  t: g(f.t),
  // [x, y, z, yaw, pitch, health, held, swinging, armour]
  p: f.p.map((q) => (q ? [q[0], q[1], q[2], q[3], q[4], q[5], itemId(q[6]), /a/.test(q[9] ?? '') ? 1 : 0, (q[8] ?? []).filter(Boolean)] : null)),
}));
// The last frame of a player who left the match keeps them where they were.
for (let k = 1; k < frames.length; k++) frames[k].p = frames[k].p.map((q, i) => q ?? frames[k - 1].p[i]);

// The shots: every arrow, snowball, egg and ender pearl the recording saw land (recording/events.jsonl): where it left
// (the shooter, a flight's time before it landed) and where it landed (the player it hit, or the block).
const recEvents = (() => { const f = path.join(round, 'recording', 'events.jsonl'); return existsSync(f) ? readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []; })();
const posAt = (name, t) => { const i = names.indexOf(name); let best = null; for (const f of film.frames) { if (!f.p[i]) continue; if (!best || Math.abs(f.t - t) < Math.abs(best.t - t)) best = f; } return best ? best.p[i].slice(0, 3) : null; };
const shots = recEvents.filter((e) => e.kind === 'projectile' && !e.lost && names.includes(e.who) && (e.hit || e.block)).map((e) => {
  const flight = Math.max(.15, (e.ticks ?? 8) / 20), launch = e.t - flight, a = posAt(e.who, launch);
  const b = e.hit ? posAt(e.hit, e.t) : [e.block.x + .5, e.block.y + .5, e.block.z + .5];
  return a && b ? { t: g(launch), kind: 'shot', from: e.who, item: e.projectile, hit: e.hit ?? null, flight: +flight.toFixed(2), landsAt: g(e.t), a, b: e.hit ? b : [b[0], b[1] - 1.2, b[2]] } : null;
}).filter(Boolean);
// The hits: a hurt the match credited to a player within reach (film.json); else a shot that landed on the victim then;
// else the other player swinging within 6 blocks (a blow from below or above measures longer, feet to feet). Hurts with
// none of these (a fall, an ender pearl's landing) are no one's hit.
const flagsNear = (name, t) => { const i = names.indexOf(name); return film.frames.filter((f) => Math.abs(f.t - t) <= .5).map((f) => f.p[i]?.[9] ?? '').join(''); };
// An ender pearl's landing hurts its thrower 5 (as a fall): that is no one's hit, even with a foe close by.
const ownPearl = (e) => shots.some((s) => s.item === 'ender_pearl' && s.from === e.who && Math.abs(s.landsAt - g(e.t)) <= .35) && Math.abs(e.amount - 5) < .01;
const hits = film.events.filter((e) => e.kind === 'hit' && !ownPearl(e)).map((e) => {
  // No one already out hits anyone: a fallen player waits at the spectators' spot (the export's 4.5 blocks can find it
  // beside the next to fall, moved there too), and its nearest frame is from before it fell.
  const out = (n) => film.events.some((d) => d.kind === 'death' && d.who === n && d.t < e.t);
  let from = e.by && e.by !== 'world' && !out(e.by) ? e.by : null, weapon = null;
  const shot = !from && shots.find((s) => s.hit === e.who && Math.abs(s.landsAt - g(e.t)) <= .35 && s.item !== 'ender_pearl');
  if (shot) { from = shot.from; weapon = shot.item === 'arrow' ? 'bow' : shot.item; }
  if (!from) for (const other of names.filter((n) => n !== e.who && !out(n))) {
    const a = posAt(other, e.t), v = posAt(e.who, e.t);
    if (a && v && Math.hypot(a[0] - v[0], a[1] - v[1], a[2] - v[2]) <= 6 && /a/.test(flagsNear(other, e.t))) from = other;
  }
  if (!from) return null;
  const k = frames.findLastIndex((f) => f.t <= g(e.t));
  const held = frames[k]?.p[names.indexOf(from)]?.[6];
  return { t: g(e.t), kind: 'hit', from, to: e.who, damage: e.amount, weapon: weapon ?? (typeof held === 'number' ? 'fist' : held ?? 'fist') };
}).filter(Boolean);
const deaths = film.events.filter((e) => e.kind === 'death').map((e) => ({ t: g(e.t), kind: 'death', player: e.who, by: e.by, text: e.text }));
const teams = { skywars: ['Blue', 'Red'], bedwars: ['Red', 'Blue'] }[film.game] ?? ['Blue', 'Red'];
const rec = {
  version: 3, game: film.game, run: summary.run, round: film.round, frameSeconds: 0.25, roundSeconds: 600,
  playStartsAt: 3, endsAt: film.clock.end ? g(film.clock.end) : frames.at(-1).t,
  map: { names: map.names, cells: map.cells, bounds: map.bounds },
  // In the round's join order (its frames' order: the scripted arena swaps it between rounds), each with its model.
  players: names.map((name, i) => ({ name, team: teams[i], model: summary.players.find((p) => p.name === name)?.model ?? null, effort: summary.players.find((p) => p.name === name)?.effort ?? null })),
  teams: names.map((name, i) => ({ name: teams[i], players: [name] })),
  result: film.result,
  blockChanges: film.blockChanges.filter(([t]) => t >= T0).map(([t, x, y, z, id]) => [g(t), x, y, z, id]),
  frames,
  // A dead player's loot on the ground (drop: who dropped it, where, what) and who picked each up (taken), by drop id.
  events: [...hits, ...deaths, ...shots, ...film.events.filter((e) => e.kind === 'drop' && e.t >= T0).map((e) => ({ t: g(e.t), kind: 'drop', id: e.id, from: e.from, at: [e.x, e.y, e.z], item: e.item })),
    ...film.events.filter((e) => e.kind === 'taken' && e.t >= T0).map((e) => ({ t: g(e.t), kind: 'taken', id: e.id, by: e.by, item: e.item }))].sort((a, b) => a.t - b.t),
};
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'recording.json'), JSON.stringify(rec));
console.log(`${outDir}/recording.json: ${frames.length} frames (0 to ${frames.at(-1).t} s), ${rec.map.cells.length / 4} map blocks, ${rec.blockChanges.length} block changes, ${hits.length} hits, ${shots.length} shots, ${deaths.length} deaths`);
for (const e of rec.events) console.log(`  ${e.t.toFixed(2)} ${e.kind} ${e.kind === 'hit' ? `${e.from} -> ${e.to} ${e.damage} (${e.weapon})` : e.kind === 'shot' ? `${e.from} ${e.item} lands ${e.landsAt}${e.hit ? ` on ${e.hit}` : ''}` : `${e.player} by ${e.by}`}`);
console.log('Next: make the film by src/cinema/ARENA_FILM_GUIDELINES.md, and check it with node scripts/check-arena-film.mjs --movie=<film>.');
