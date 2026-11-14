#!/usr/bin/env node
// The edit of a scripted-arena SkyWars series film rerun (src/cinema/arenaDuelFilm.js), cut from its recording
// (scripts/arena-series-film-data.mjs): every elimination in its own shot at about real speed (deaths close together in
// one), the closing zone when a game reaches it, each game's last kill and its replay, between line-up, profile (the
// first series' cards, `--profiles-from`) and result cards, with the commentators' lines. Writes src/cinema/<file>.
//   node scripts/skywars-film-edit.mjs public/cinema-arena-duel/five-bots-r2 five-bots-r2 src/cinema/fiveBotsR2Edit.js five-bots
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SERIES_EDITS } from '../src/cinema/arenaSeriesEdits.js';

const [dataDir, id, outFile, profilesFrom] = process.argv.slice(2);
const commentaryFile = process.argv.find((a) => a.startsWith('--commentary='))?.slice(13);
if (!dataDir || !id || !outFile) throw new Error('usage: node scripts/skywars-film-edit.mjs <data dir> <edit id> <out .js> [profiles from edit]');
const rec = JSON.parse(readFileSync(`${dataDir}/recording.json`, 'utf8'));
const before = profilesFrom ? SERIES_EDITS[profilesFrom] : null;
const r1 = (x) => +x.toFixed(2);
const names = rec.players.map((p) => p.name);
let lineNo = 0;
const line = (who, text, at, extra = {}) => ({ id: `s${String(++lineNo).padStart(3, '0')}`, who, text, ...(at.atG !== undefined ? { atG: r1(at.atG) } : { at: at.at }), ...extra });
const N = rec.games.length;
const scenes = [], kickoff = [], finals = [];
const wide = (angle = 0) => ({ type: 'aerial', at: [0, 29, 0], dist: 54, height: 38, spin: .3, angle });
const how = (d) => (/void/.test(d.text ?? '') ? 'void' : /swallowed/.test(d.text ?? '') ? 'zone' : 'slain');

// --- the opening ---
const firstKill = rec.events.find((e) => e.kind === 'death' && e.by && names.includes(e.by));
if (firstKill) {
  const gm = rec.games.find((x) => firstKill.t >= x.start && firstKill.t <= x.end), n = rec.games.indexOf(gm) + 1;
  scenes.push({ name: 'Highlight', game: n, matchLabel: `GAME ${n} OF ${N}`, dur: 5, g: [r1(firstKill.t - gm.start - 3.5), r1(firstKill.t - gm.start + 1)], cam: { type: 'pair', a: firstKill.by, b: firstKill.player, angle: 2.2, rise: .5 }, mood: 'battle', tag: 'HIGHLIGHTS',
    narrate: [line('pbp', 'The five bots are back, and this time the zone closes in!', { at: .3 }, { act: 'opening the show, huge energy' })] });
}
scenes.push({ name: 'Line-ups', game: 1, matchLabel: 'SKYWARS', dur: 14, g: [0, 3], cam: { ...wide(2.2) }, mood: 'calm', tag: 'PRE-GAME',
  card: { lineup: true, title: 'SCRIPTED ARENA: THE REMATCH', sub: 'the same five bots · the same five maps · now with the closing zone' },
  narrate: [line('pbp', 'The same five bots, the same five maps, played again.', { at: .6 }), line('color', 'Claude Opus, GPT Sol, Gemini Flash, DeepSeek Flash, and the scripted bot.', { at: 5.5 })] });
scenes.push({ name: 'What changed', game: 1, matchLabel: 'SKYWARS', dur: 14, g: [0, 3], cam: { ...wide(.6) }, mood: 'calm', tag: 'PRE-GAME',
  card: { title: 'NO MORE DRAWS', sub: 'Last time two games ran out the clock. Now, from 60% of the eight minutes, a border closes on the middle and the void rises; ten seconds in the void and you are out. Nobody rewrote a bot: these are the frozen bots of the first series.' },
  narrate: [line('color', 'Last time two games ended in a draw. Now the zone closes from about five minutes, so somebody has to win.', { at: .6 })] });
for (const sc of before?.scenes ?? []) if (sc.card?.profile) scenes.push({ ...sc, narrate: (sc.narrate ?? []).map((l) => ({ ...l, id: `s${String(++lineNo).padStart(3, '0')}` })) });

// --- the games ---
for (const gm of rec.games) {
  const n = rec.games.indexOf(gm) + 1, rel = (t) => r1(t - gm.start), name = gm.map?.name ?? gm.map?.template ?? `map ${n}`;
  const tag = { game: n, matchLabel: `GAME ${n} OF ${N}` };
  scenes.push({ name: `Game ${n}`, ...tag, dur: 5, g: [0, 3], cam: wide(n), mood: 'tense', tag: 'PRE-GAME', card: { title: `GAME ${n}  ·  ${String(name).toUpperCase()}`, sub: '' },
    narrate: [line('pbp', `Game ${n}: ${name}.`, { at: .6 })] });
  const open = `Game ${n}: the race`;
  kickoff.push(open);
  scenes.push({ name: open, ...tag, dur: 5, g: [rel(gm.playStartsAt - .4), rel(gm.playStartsAt + 7)], cam: { type: 'aerial', at: [0, 30, 0], dist: 44, height: 30, spin: .12, angle: n }, mood: 'tense', tag: 'LIVE' });
  const deaths = rec.events.filter((e) => e.kind === 'death' && e.t >= gm.start && e.t <= gm.end + .5).sort((a, b) => a.t - b.t);
  const groups = [];
  for (const d of deaths) { const last = groups.at(-1); if (last && d.t - last.at(-1).t <= 3) last.push(d); else groups.push([d]); }
  let cursor = gm.playStartsAt + 7, zoneShown = false;
  groups.forEach((grp, k) => {
    const a = Math.max(cursor, grp[0].t - 4.5), b = grp.at(-1).t + 1.6, isLast = k === groups.length - 1;
    // The zone, if a game lasts into it: one fast look before the next kill; and before it (or the kill), a long stretch
    // with no elimination gets a fast look of its own, for the commentators to say how the game is going.
    const zoneFrom = gm.zone && !zoneShown && a - Math.max(cursor, gm.zone.startsAt - 2) > 15 && a > gm.zone.startsAt ? Math.max(cursor, gm.zone.startsAt - 2) : null;
    const quietTo = zoneFrom ?? a;
    if (quietTo - cursor > 40) scenes.push({ name: `Game ${n}: meanwhile at ${Math.floor((cursor - gm.playStartsAt) / 60)}:${String(Math.floor((cursor - gm.playStartsAt) % 60)).padStart(2, '0')}`, ...tag, dur: 9, g: [rel(cursor + 1), rel(quietTo - 1)], cam: { type: 'aerial', at: [0, 30, 0], dist: 46, height: 32, spin: .2, angle: n + k }, mood: 'tense', tag: 'LIVE' });
    if (zoneFrom !== null) {
      zoneShown = true;
      scenes.push({ name: `Game ${n}: the zone closes`, ...tag, dur: 7, g: [rel(zoneFrom), rel(a)], cam: { type: 'aerial', at: [gm.zone.x, 30, gm.zone.z], dist: Math.round(gm.zone.startRadius), height: Math.round(gm.zone.startRadius * .8), spin: .25, angle: n }, mood: 'tense', tag: 'LIVE',
        narrate: [line('color', 'The zone closes: the border shrinks and the void rises. No more hiding.', { at: .4 })] });
    }
    const d0 = grp.at(-1), killer = d0.by && names.includes(d0.by) ? d0.by : null;
    const people = [...new Set(grp.flatMap((d) => [d.player, d.by].filter((x) => x && names.includes(x))))];
    const cam = grp.length === 1 && killer ? { type: 'pair', a: killer, b: d0.player, angle: .6 + k * .9, rise: .5 } : people.length === 1 ? { type: 'follow', who: people[0], dist: 6, height: 3.4 } : { type: 'group', who: people, angle: .6 + k * .9, rise: .5 };
    const len = b - a, dur = r1(Math.min(Math.max(len, 4), 12));
    const narrate = [];
    for (const d of grp) {
      const by = d.by && names.includes(d.by) ? d.by : null, h = how(d);
      const text = isLast && d === d0 ? `${d.player} ${h === 'zone' ? 'is swallowed by the void' : h === 'void' ? 'goes over the edge' : 'falls'}, and ${gm.winner ?? 'nobody'} wins game ${n}!`
        : h === 'zone' ? `The void takes ${d.player}.` : by ? `${by} ${h === 'void' ? 'knocks' : 'takes out'} ${d.player}${h === 'void' ? ' into the void' : ''}!` : `${d.player} ${h === 'void' ? 'falls into the void' : 'is out'}.`;
      narrate.push(line('pbp', text, { atG: rel(d.t) }, isLast && d === d0 ? { act: 'the winning call: scream it with joy' } : {}));
    }
    const speed = len / dur, kept = [];
    // Each line at least 3 s of film after the one before, and room to finish before the cut (the last call excepted).
    for (const l of narrate) if ((!kept.length || (l.atG - kept.at(-1).atG) / speed >= 3) && (isLast || (rel(b) - l.atG) / speed >= 3)) kept.push(l);
    const sname = isLast ? `Game ${n}: ${gm.winner ?? 'nobody'} wins` : `Game ${n}: ${grp.map((d) => d.player).join(', ')} out`;
    scenes.push({ name: sname, ...tag, dur, g: [rel(a), rel(b)], cam, mood: 'battle', tag: 'LIVE', narrate: kept });
    if (isLast) {
      finals.push(sname);
      scenes.push({ name: `Game ${n}: replay`, ...tag, dur: 5, g: [rel(d0.t - 3), rel(d0.t + .6)], cam: killer ? { type: 'over', who: killer, at: d0.player, side: 1.6, height: 2.4 } : { type: 'follow', who: d0.player, dist: 4.5, height: 2.6 }, mood: 'victory', tag: 'REPLAY' });
    }
    cursor = b;
  });
  const placed = Object.entries(gm.places ?? rec.result?.places?.[n] ?? {}).sort((a, b) => a[1] - b[1]);
  scenes.push({ name: `Game ${n}: result`, ...tag, dur: 7, g: [rel(gm.end - 3), rel(gm.end)], cam: wide(n + .5), mood: 'victory', tag: 'PRE-GAME',
    card: { result: true, over: `GAME ${n} OF ${N}  ·  ${String(name).toUpperCase()}`, title: gm.winner ? `${gm.winner.toUpperCase()} WINS` : 'A DRAW', winnerTeam: rec.players.find((p) => p.name === gm.winner)?.team ?? 'Red',
      sub: `after ${Math.floor((gm.end - gm.playStartsAt) / 60)}:${String(Math.round((gm.end - gm.playStartsAt) % 60)).padStart(2, '0')}`, statsTitle: placed.length ? 'FINISHING ORDER' : '', stats: placed.length ? [placed.map(([s, p]) => `${p}. ${s}`).join('    ')] : [] } });
}

// --- the series ---
const res = rec.result, ranking = Object.keys(res.scores).sort((a, b) => res.scores[b] - res.scores[a]);
const lastGame = rec.games.at(-1);
scenes.push({ name: 'Final standings', game: N, matchLabel: 'SKYWARS', dur: 14, g: [r1(lastGame.end - lastGame.start - 3), r1(lastGame.end - lastGame.start)], cam: wide(3), mood: 'victory', tag: 'PRE-GAME',
  card: { result: true, over: 'FINAL STANDINGS', title: res.winner ? `${res.winner.toUpperCase()} WINS THE SERIES` : 'A SHARED FIRST PLACE', winnerTeam: rec.players.find((p) => p.name === ranking[0])?.team ?? 'Red', sub: `${res.scores[ranking[0]]} points`, statsTitle: 'POINTS (PLAYERS OUTLASTED)',
    stats: ranking.map((s, i) => `${i + 1}. ${s}  ${res.scores[s]}`) },
  narrate: [line('pbp', `The rematch goes to ${ranking[0] === 'Scripted' ? 'the scripted bot' : ranking[0]}, with ${res.scores[ranking[0]]} points!`, { at: .8 }, { act: 'the final call, big and warm' })] });

// The commentary (--commentary=<.js>, exporting LINES: { scene name: [[who, text, atG?, act?], ...] }): a scene it names
// gets its lines one after another, each as long as its voiced clip (the narration manifest, once voiced; else 0.42 s a
// word), and the scene is lengthened (played a little slower) when its lines need more room than it has.
if (commentaryFile) {
  const { LINES } = await import(pathToFileURL(path.resolve(commentaryFile)).href);
  const manifestFile = path.join('public', `cinema-arena-duel/${id}`, 'narration', 'manifest.json');
  const voiced = new Map(Object.values((() => { try { return JSON.parse(readFileSync(manifestFile, 'utf8')).clips ?? {}; } catch { return {}; } })()).map((c) => [c.text, c.duration]));
  const length = (t) => voiced.get(t) ?? .5 + t.split(/\s+/).length * .42;
  let n = 0;
  for (const sc of scenes) {
    const mine = LINES[sc.name]; if (!mine) continue;
    let at = .35;
    sc.narrate = mine.map(([who, text, , act]) => {
      const start = at;
      at = start + length(text) + .3;
      return { id: `c${String(++n).padStart(3, '0')}`, who, text, at: +start.toFixed(2), ...(act ? { act } : {}) };
    });
    if (at + .25 > sc.dur) sc.dur = +(at + .25).toFixed(2);
  }
}
const edit = { id: `arena-series-${id}`, title: 'Scripted Arena: the rematch', data: `/cinema-arena-duel/${id}`, fps: 30, posterTime: 40,
  header: 'OPUS · SOL · GEMINI · DEEPSEEK · SCRIPTED  ·  SKYWARS FREE-FOR-ALL, THE REMATCH', matchLabel: 'SKYWARS', winnerTeam: rec.players.find((p) => p.name === ranking[0])?.team ?? 'Red',
  kickoffScene: kickoff, finalScene: finals, scenes };
const dur = scenes.reduce((s, x) => s + x.dur, 0);
writeFileSync(outFile, `// Generated by scripts/skywars-film-edit.mjs from ${dataDir}/recording.json: edit that script, not this file.\n// ${scenes.length} scenes, ${Math.floor(dur / 60)}:${String(Math.round(dur % 60)).padStart(2, '0')}.\nexport const EDIT = ${JSON.stringify(edit, null, 1)};\n`);
console.log(`${outFile}: ${scenes.length} scenes, ${Math.floor(dur / 60)}:${String(Math.round(dur % 60)).padStart(2, '0')}, ${lineNo} lines`);
for (const s of scenes) console.log(`  ${String(s.dur).padStart(5)}s  ${s.tag.padEnd(10)} ${s.name}`);
console.log('Next: make the film by src/cinema/ARENA_FILM_GUIDELINES.md, and check it with node scripts/check-arena-film.mjs --movie=<film>.');
