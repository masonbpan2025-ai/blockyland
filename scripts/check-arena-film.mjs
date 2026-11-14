#!/usr/bin/env node
// Checks an Agent Arena film (src/cinema/arenaSeriesEdits.js) against src/cinema/ARENA_FILM_GUIDELINES.md before it is
// rendered: the commentary (voiced, no overlaps, no long silence, every live shot spoken over), the coverage (every
// elimination, bed and squad out on screen, every draw explained with a diagram), and the game itself (death drops that
// no one could see). scripts/render-film.mjs runs it for every arena series film and stops on a failure.
//   node scripts/check-arena-film.mjs --movie=arena-series-five-bots     (or the edit's key: five-bots)
// Exit 0: clean (warnings may print); 1: failures.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The bar (ARENA_FILM_GUIDELINES.md section 4). */
export const LIMITS = Object.freeze({
  maxSilence: 6, // seconds of film with no commentary, anywhere
  minSpeech: .7, // share of the film with a voice on it
  maxQuietShot: 5, // a live or replay shot longer than this has at least one line
  minLootSeconds: 2, // Java's pickup delay for a player's death drops (40 ticks)
});

export async function checkArenaFilm(key) {
  const repo = path.resolve(import.meta.dirname, '..');
  const { SERIES_EDITS } = await import(pathToFileURL(path.join(repo, 'src/cinema/arenaSeriesEdits.js')).href);
  const { arenaTimeline } = await import(pathToFileURL(path.join(repo, 'src/cinema/arenaDuelEdit.js')).href);
  const edit = SERIES_EDITS[key] ?? Object.values(SERIES_EDITS).find((e) => e.id === key);
  if (!edit) throw new Error(`no arena series film ${key}`);
  const dataDir = path.join(repo, 'public', edit.data.replace(/^\//, ''));
  const rec = JSON.parse(readFileSync(path.join(dataDir, 'recording.json'), 'utf8'));
  const manifestFile = path.join(dataDir, 'narration', 'manifest.json');
  const clips = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')).clips ?? {} : {};
  const tl = arenaTimeline(edit);
  const fail = [], warn = [];
  const games = rec.games ?? [{ start: 0, end: rec.endsAt, playStartsAt: rec.playStartsAt }];
  // A scene's game-time window on the recording's clock (a series scene names its game; arenaDuelFilm.js does the same).
  const windowOf = (sc) => { const o = sc.game ? games[sc.game - 1].start : 0; return [sc.g[0] + o, sc.g[1] + o]; };
  const live = tl.scenes.filter((s) => !s.card && (s.tag === 'LIVE' || s.tag === 'REPLAY'));
  const shown = (t, tags = ['LIVE']) => live.some((s) => tags.includes(s.tag) && (([a, b]) => t >= a - .5 && t <= b + .5)(windowOf(s)));

  // 1. Edit hygiene: names and line ids unique within the film.
  const dup = (xs) => [...new Set(xs.filter((x, i) => xs.indexOf(x) !== i))];
  for (const n of dup(edit.scenes.map((s) => s.name))) fail.push(`two scenes are named "${n}"`);
  for (const id of dup(tl.narration.map((l) => l.id))) fail.push(`two lines have the id ${id}`);

  // 2. The commentary: voiced as written, no overlaps, no long silence, live shots spoken over.
  const lines = tl.narration.map((l) => {
    const clip = clips[l.id];
    if (!clip) fail.push(`line ${l.id} (${l.scene}) is not voiced: run node scripts/narrate-arena.mjs --edit=${key}`);
    else if (clip.text !== l.text) fail.push(`line ${l.id} (${l.scene}) was voiced with other words: run narrate-arena again`);
    return { ...l, end: l.start + (clip?.duration ?? 3) };
  }).sort((a, b) => a.start - b.start);
  for (let i = 1; i < lines.length; i++) if (lines[i].start < lines[i - 1].end - .05) fail.push(`line ${lines[i - 1].id} runs ${(lines[i - 1].end - lines[i].start).toFixed(2)} s into ${lines[i].id} (${lines[i].scene})`);
  let t = 0, spoken = 0;
  for (const l of lines) { if (l.start - t > LIMITS.maxSilence) fail.push(`${(l.start - t).toFixed(1)} s with no commentary before "${l.scene}" (film ${t.toFixed(1)} s)`); spoken += l.end - l.start; t = Math.max(t, l.end); }
  if (tl.duration - t > LIMITS.maxSilence + 2) fail.push(`${(tl.duration - t).toFixed(1)} s of silence at the end`);
  if (spoken / tl.duration < LIMITS.minSpeech) fail.push(`commentary covers ${Math.round(100 * spoken / tl.duration)}% of the film; the bar is ${LIMITS.minSpeech * 100}%`);
  for (const sc of live) if (sc.dur > LIMITS.maxQuietShot && !lines.some((l) => l.start < sc.start + sc.dur && l.end > sc.start)) fail.push(`"${sc.name}" (${sc.dur} s) has no commentary`);

  // 3. Coverage: every elimination, bed and squad out happens on a live shot; every draw is explained.
  const bedwars = rec.game === 'bedwars';
  for (const d of rec.events.filter((e) => e.kind === 'death' && (!bedwars || e.final))) if (!shown(d.t)) fail.push(`${bedwars ? 'final kill' : 'elimination'} of ${d.player} (game ${games.findIndex((g) => d.t >= g.start && d.t <= g.end + 1) + 1}) is not on screen`);
  for (const b of rec.events.filter((e) => e.kind === 'bed')) { if (!shown(b.t)) fail.push(`${b.squad}'s bed broken by ${b.by} is not on screen`); else if (!shown(b.t, ['REPLAY'])) warn.push(`${b.squad}'s bed has no replay`); }
  for (const o of rec.events.filter((e) => e.kind === 'teamout')) if (!shown(o.t)) fail.push(`${o.squad} going out is not on screen`);
  games.forEach((g, i) => {
    if (!/time/.test(String(g.endReason ?? ''))) return;
    const explained = tl.scenes.some((s) => s.game === i + 1 && (s.card?.slice || s.card?.explain));
    if (!explained) fail.push(`game ${i + 1} ended at the time limit, and no scene shows where the survivors were and why it never ended (a card with slice and one with explain)`);
  });

  // 4. The game: a player's death drops must lie on the ground for Java's pickup delay before anyone takes them.
  const drops = new Map(), instant = [];
  for (const e of rec.events) {
    const gi = games.findIndex((g) => e.t >= g.start - 1 && e.t <= g.end + 1);
    if (e.kind === 'drop') drops.set(`${gi}/${e.id}`, e);
    if (e.kind === 'taken') { const d = drops.get(`${gi}/${e.id}`); if (d && e.t - d.t < LIMITS.minLootSeconds - .05) instant.push(`${d.from}'s ${typeof d.item?.id === 'number' ? 'blocks' : d.item?.id} taken by ${e.by} after ${(e.t - d.t).toFixed(2)} s`); }
  }
  if (instant.length) warn.push(`${instant.length} death drops were taken before Java's 2 s pickup delay (recorded before the host kept it; the film holds them on the ground 0.8 s): ${instant.slice(0, 3).join('; ')}${instant.length > 3 ? '; ...' : ''}`);

  return { key, duration: tl.duration, speech: spoken / tl.duration, fail, warn };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = process.argv.find((a) => a.startsWith('--movie='))?.slice(8) ?? process.argv[2];
  const key = String(arg ?? '').replace(/^arena-series-/, '');
  const r = await checkArenaFilm(key);
  console.log(`${r.key}: ${(r.duration / 60).toFixed(2)} min, commentary ${Math.round(r.speech * 100)}%`);
  for (const w of r.warn) console.log(`  warning: ${w}`);
  for (const f of r.fail) console.log(`  FAIL: ${f}`);
  console.log(r.fail.length ? `${r.fail.length} failures: fix them (src/cinema/ARENA_FILM_GUIDELINES.md) before rendering.` : 'clean');
  process.exit(r.fail.length ? 1 : 0);
}
