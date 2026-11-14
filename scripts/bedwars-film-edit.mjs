#!/usr/bin/env node
// The edit of a Bed Wars arena series film (src/cinema/arenaDuelFilm.js), cut from its recording
// (scripts/bedwars-series-film-data.mjs): the moments that decide the games, each in its own shot at about real speed --
// every bed broken (and its replay), every final kill (the deaths close together in one shot), every squad going out,
// the closing zone, and each game's last kill and its replay -- between line-up, profile and result cards, with the
// commentators' lines. Writes src/cinema/<id>Edit.js, which arenaSeriesEdits.js lists.
//   node scripts/bedwars-film-edit.mjs public/cinema-arena-duel/bedwars-five-r2 bedwars-five-r2 src/cinema/bedwarsFiveR2Edit.js
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [dataDir, id, outFile] = process.argv.slice(2);
const commentaryFile = process.argv.find((a) => a.startsWith('--commentary='))?.slice(13);
if (!dataDir || !id || !outFile) throw new Error('usage: node scripts/bedwars-film-edit.mjs <data dir> <edit id> <out .js>');
const rec = JSON.parse(readFileSync(`${dataDir}/recording.json`, 'utf8'));
const r1 = (x) => +x.toFixed(2);
const squadOf = Object.fromEntries(rec.players.map((p) => [p.name, p.squad]));
const possessive = (s) => (s === 'Scripted' ? "the scripted squad's" : `${s}'s`);
const ord = (n) => ['', 'first', 'second', 'third', 'fourth', 'fifth'][n] ?? `${n}th`;

let lineNo = 0;
const line = (who, text, at, extra = {}) => ({ id: `l${String(++lineNo).padStart(3, '0')}`, who, text, ...(at.atG !== undefined ? { atG: r1(at.atG) } : { at: at.at }), ...extra });

const scenes = [];
const kickoff = [], finals = [];
const N = rec.games.length;

// --- the opening ---
const firstBed = rec.events.find((e) => e.kind === 'bed');
const g1 = rec.games[0];
if (firstBed) {
  const gm = rec.games.find((x) => firstBed.t >= x.start && firstBed.t <= x.end), n = rec.games.indexOf(gm) + 1;
  scenes.push({ name: 'Highlight: a bed falls', game: n, matchLabel: `GAME ${n} OF ${N}`, dur: 5, g: [r1(firstBed.t - gm.start - 3.5), r1(firstBed.t - gm.start + 1)], cam: { type: 'follow', who: firstBed.by, dist: 5, height: 2.6 }, mood: 'battle', tag: 'HIGHLIGHTS',
    narrate: [line('pbp', 'Twenty bots, five squads, and every bed is a target!', { at: .3 }, { act: 'opening the show, huge energy' })] });
}
const wide = (gm, angle = 0) => ({ type: 'aerial', at: [gm.zone.x, 32, gm.zone.z], dist: Math.round(gm.zone.startRadius * 1.15), height: Math.round(gm.zone.startRadius * .85), spin: .12, angle });
scenes.push({ name: 'Line-ups', game: 1, matchLabel: 'BED WARS', dur: 15, g: [0, 3], cam: wide(g1, 2.2), mood: 'calm', tag: 'PRE-GAME',
  card: { lineup: true, title: 'BED WARS ARENA', sub: 'four AI agents each write a squad of four bots · five-team Bed Wars · five maps nobody has seen' },
  narrate: [
    line('pbp', 'Welcome to the Bed Wars Arena! Claude Opus, GPT Sol, Gemini Flash and DeepSeek Flash each wrote the bot for a squad of four.', { at: .6 }),
    line('color', 'And the fifth squad is the scripted bot they all started from.', { at: 9.5 }),
  ] });
scenes.push({ name: 'The rules', game: 1, matchLabel: 'BED WARS', dur: 15, g: [0, 3], cam: wide(g1, .6), mood: 'calm', tag: 'PRE-GAME',
  card: { title: 'FIVE SQUADS, FIVE BEDS', sub: 'While your bed stands you respawn. At 6:00 every bed is destroyed, and the zone starts closing on the middle: the border shrinks, the void rises, and by 9:00 only the middle is left. A squad scores a point for every squad it outlasts.' },
  narrate: [line('color', 'Protect your bed, break theirs. At six minutes every bed goes anyway, and the zone squeezes everyone onto the middle.', { at: .6 })] });
scenes.push({ name: 'What changed', game: 1, matchLabel: 'BED WARS', dur: 13, g: [0, 3], cam: wide(g1, 1.4), mood: 'calm', tag: 'PRE-GAME',
  card: { title: 'THE SECOND ROUND', sub: 'Digging now takes Minecraft\'s real time: wool 1.2 s by hand, end stone 15 s. Opus wrote its bot again from scratch; Sol, Gemini and DeepSeek got their practice games and more time to improve theirs.' },
  narrate: [line('pbp', 'This is the rematch. Breaking a bed now takes real digging time, and every agent got a fair shot at practice.', { at: .6 })] });
const PROFILES = {
  Opus: { sub: 'written again from scratch  ·  37 minutes  ·  4 practice games', points: [['Leave for the middle in time', 'Every timing a fraction of the limit: re-gear at home, then bridge to the middle\'s top before the zone.'], ['Spend for the end', 'Armour, a better sword, 64 blocks and golden apples bought one item a tick on the forge.'], ['Hold the centre', 'Fight only foes inside the zone and on the middle; never chase out.']], line: 'Opus wrote a fresh bot built around the endgame: gear up, then take the middle before the zone does.' },
  Sol: { sub: '39 more minutes  ·  4 practice games this round', points: [['Survival first', 'Gear before fights; paired raids only with a partner, blocks and health.'], ['Upgrades from the collector', 'Diamonds carried home for Protection and Sharpness.'], ['Rally early', 'At 45% of the game every role heads for the middle.']], line: 'Sol plays it safe: armour first, raids in pairs, and everybody on the middle early.' },
  Gemini: { sub: 'its quota ran out 11 minutes into its extra time', points: [['Team radio', 'Its four bots share one memory: targets, threats and when to retreat.'], ['Duo rush', 'Two rushers in lockstep go for the nearest bed.'], ['Migrate before the zone', 'Everyone to the middle before the border closes.']], line: 'Gemini gave its four bots a shared radio, and sends two rushers after the nearest bed.' },
  DeepSeek: { sub: 'stopped after 9 of its 40 extra minutes', points: [['Rushing is not worth it', 'Every bed goes at 6:00 anyway: keep the squad home and safe.'], ['Fight only what is close', 'A foe within 9 blocks; never chase into the closing void.'], ['Hold the middle', 'Cross together and own the middle for the endgame.']], line: 'DeepSeek reasoned that rushing is a waste: the clock takes every bed anyway.' },
  Scripted: { sub: 'the unchanged bot every agent started from', points: [['Four roles', 'A defender covers the bed in wool, a collector runs diamonds, two rushers go together.'], ['Keeps to the zone', 'Walks and bridges back inside when the zone closes.']], line: 'And the scripted bot: a defender, a collector and two rushers, exactly as the agents first found it.' },
};
for (const s of rec.squads) {
  const p = PROFILES[s.name];
  if (!p) continue;
  scenes.push({ name: `${s.name}'s squad`, game: 1, matchLabel: 'BED WARS', dur: 13, g: [0, 3], cam: { type: 'face', who: s.players[0], dist: 4, height: 1.8 }, mood: 'calm', tag: 'PRE-GAME',
    card: { profile: s.name, title: `${s.name.toUpperCase()}'S SQUAD`, sub: p.sub, points: p.points, pointsAt: [1.2, 4.5, 7.8] },
    narrate: [line(s.name === 'Scripted' || s.name === 'Sol' ? 'color' : 'pbp', p.line, { at: .8 })] });
}

// --- the games ---
for (const gm of rec.games) {
  const n = rec.games.indexOf(gm) + 1, rel = (t) => r1(t - gm.start), tag = { game: n, matchLabel: `GAME ${n} OF ${N}  ·  ${gm.map.name.toUpperCase()}` };
  const ev = rec.events.filter((e) => e.t >= gm.start && e.t <= gm.end + .5);
  const deaths = ev.filter((e) => e.kind === 'death' && e.final), beds = ev.filter((e) => e.kind === 'bed'), outs = ev.filter((e) => e.kind === 'teamout');
  scenes.push({ name: `Game ${n}`, ...tag, dur: 5, g: [0, 3], cam: wide(gm, n * .9), mood: 'tense', tag: 'PRE-GAME',
    card: { title: `GAME ${n}  ·  ${gm.map.name.toUpperCase()}`, sub: `Bases this game: ${Object.entries(gm.colours).map(([s, c]) => `${s} ${c === 'Cyan' ? 'Aqua' : c}`).join(' · ')}` },
    narrate: [line('pbp', `Game ${n}: ${gm.map.name}.`, { at: .6 })] });
  const open = `Game ${n}: the start`;
  kickoff.push(open);
  scenes.push({ name: open, ...tag, dur: 6, g: [rel(gm.playStartsAt - 1), rel(gm.playStartsAt + 17)], cam: wide(gm, n * .9 + .5), mood: 'tense', tag: 'LIVE' });

  // The moments: beds, and final kills close together (with the squads they put out).
  const moments = [];
  for (const b of beds) moments.push({ kind: 'bed', a: b.t - 6, b: b.t + 1.5, bed: b, who: [b.by] });
  const sorted = [...deaths].sort((x, y) => x.t - y.t);
  for (const d of sorted) {
    const last = moments.filter((m) => m.kind === 'kills').at(-1);
    if (last && d.t - last.deaths.at(-1).t <= 3) { last.deaths.push(d); last.b = d.t + 1.5; }
    else moments.push({ kind: 'kills', a: d.t - 4, b: d.t + 1.5, deaths: [d] });
  }
  for (const m of moments) for (const o of outs) if (o.t >= m.a && o.t <= m.b + 2) m.b = Math.max(m.b, o.t + 1.5);
  moments.sort((x, y) => x.a - y.a);
  // Overlapping moments become one shot.
  const merged = [];
  for (const m of moments) {
    const prev = merged.at(-1);
    if (prev && m.a < prev.b) { prev.b = Math.max(prev.b, m.b); prev.parts.push(m); }
    else merged.push({ a: Math.max(m.a, gm.playStartsAt + 17), b: m.b, parts: [m] });
  }
  // The zone: one fast look at it closing, in the first gap after it starts.
  let zoneShown = false;
  const zoneShot = (from, to) => {
    const a = Math.max(from, gm.zone.startsAt - 2), b = Math.min(to, gm.zone.startsAt + 75);
    if (zoneShown || b - a < 20) return null;
    zoneShown = true;
    return { name: `Game ${n}: the zone closes`, ...tag, dur: 7, g: [rel(a), rel(b)], cam: { type: 'aerial', at: [gm.zone.x, 30, gm.zone.z], dist: Math.round(gm.zone.startRadius * 1.05), height: Math.round(gm.zone.startRadius * .9), spin: .25, angle: n }, mood: 'tense', tag: 'LIVE',
      narrate: [line('color', 'Six minutes: every bed is gone, and the zone closes in. Every death from here is final.', { at: .4 })] };
  };
  let cursor = gm.playStartsAt + 17;
  const rel0g = (relT) => relT + gm.start;
  merged.forEach((m, k) => {
    const z = zoneShot(cursor, m.a); if (z) scenes.push(z);
    // A long stretch with nothing final: a fast look at it, for the commentators to say how the game is going.
    const from = z ? rel0g(z.g[1]) : cursor;
    if (m.a - from > 50) scenes.push({ name: `Game ${n}: meanwhile at ${Math.floor((from - gm.playStartsAt) / 60)}:${String(Math.floor((from - gm.playStartsAt) % 60)).padStart(2, '0')}`, ...tag, dur: 9, g: [rel(from + 1), rel(m.a - 1)], cam: wide(gm, n + k * .7), mood: 'tense', tag: 'LIVE' });
    const isLast = k === merged.length - 1;
    const victims = [...new Set(m.parts.flatMap((p) => (p.deaths ?? []).map((d) => d.player)))];
    const killers = [...new Set(m.parts.flatMap((p) => (p.deaths ?? []).map((d) => d.by).filter((b) => b && b !== 'world' && rec.players.some((q) => q.name === b))))];
    const breakers = m.parts.filter((p) => p.kind === 'bed').map((p) => p.bed.by);
    const people = [...new Set([...breakers, ...killers, ...victims])].slice(0, 6);
    const len = m.b - m.a, dur = r1(Math.min(len, 14)), single = m.parts.length === 1 ? m.parts[0] : null;
    let cam;
    if (single?.kind === 'bed') cam = { type: 'follow', who: single.bed.by, dist: 5.5, height: 3 };
    else if (single && single.deaths.length === 1 && single.deaths[0].by && rec.players.some((q) => q.name === single.deaths[0].by)) cam = { type: 'pair', a: single.deaths[0].by, b: single.deaths[0].player, angle: .6 + k * .7, rise: .45 };
    else if (people.length === 1) cam = { type: 'follow', who: people[0], dist: 6, height: 3.4 };
    else cam = { type: 'group', who: people, angle: .6 + k * .7, rise: .5 };
    const what = m.parts.map((p) => (p.kind === 'bed' ? `${possessive(p.bed.squad)} bed` : p.deaths.map((d) => d.player).join(', '))).join('; ');
    const name = isLast ? `Game ${n}: ${gm.winner ?? 'nobody'} wins` : `Game ${n}: ${what}`;
    const narrate = [];
    for (const p of m.parts) {
      if (p.kind === 'bed') narrate.push(line('pbp', `${p.bed.by} breaks ${possessive(p.bed.squad)} bed!`, { atG: rel(p.bed.t) }, { act: 'a big moment, excited' }));
    }
    for (const o of outs.filter((o) => o.t >= m.a && o.t <= m.b)) {
      const lastOut = gm.winner && o.t === Math.max(...outs.map((x) => x.t));
      narrate.push(lastOut ? line('pbp', `${o.squad} is out, and ${gm.winner} wins game ${n}!`, { atG: rel(o.t) }, { act: 'the winning call: scream it with joy' })
        : line('pbp', `${o.squad} is eliminated, ${ord(gm.places?.[o.squad] ?? 0)} place!`.replace(', place!', '!'), { atG: rel(o.t) }));
    }
    const voidAt = m.parts[0].deaths?.[0]?.t ?? m.a + 2;
    if (!narrate.length && victims.length > 1 && (m.b - voidAt) / ((m.b - m.a) / Math.min(m.b - m.a, 14)) >= 3.4 && m.parts.every((p) => p.kind !== 'kills' || p.deaths.every((d) => d.how === 'zone'))) narrate.push(line('color', `The void takes ${victims.length} at once.`, { atG: rel(m.parts[0].deaths?.[0]?.t ?? m.a + 2) }));
    // Lines no closer than 3 s of film to the one before.
    const speed = len / dur, kept = [];
    for (const l of narrate.sort((x, y) => (x.atG ?? 0) - (y.atG ?? 0))) if (!kept.length || ((l.atG - kept.at(-1).atG) / speed) >= 3) kept.push(l);
    scenes.push({ name, ...tag, dur, g: [rel(m.a), rel(m.b)], cam, mood: 'battle', tag: 'LIVE', ...(kept.length ? { narrate: kept } : {}) });
    if (isLast) finals.push(name);
    // Replays: a bed's breaking, and the game's last kill.
    for (const p of m.parts.filter((p) => p.kind === 'bed')) scenes.push({ name: `Game ${n}: replay of ${possessive(p.bed.squad)} bed`, ...tag, dur: 4.5, g: [rel(p.bed.t - 2.2), rel(p.bed.t + .4)], cam: { type: 'follow', who: p.bed.by, dist: 3.6, height: 2.2, side: -1.8 }, mood: 'battle', tag: 'REPLAY' });
    if (isLast && m.parts.some((p) => p.kind === 'kills')) {
      const d = m.parts.filter((p) => p.kind === 'kills').at(-1).deaths.at(-1);
      scenes.push({ name: `Game ${n}: replay of the last kill`, ...tag, dur: 5, g: [rel(d.t - 3), rel(d.t + .6)], cam: d.by && rec.players.some((q) => q.name === d.by) ? { type: 'over', who: d.by, at: d.player, side: 1.6, height: 2.4 } : { type: 'follow', who: d.player, dist: 4.5, height: 2.6 }, mood: 'victory', tag: 'REPLAY' });
    }
    cursor = m.b;
  });
  // The result.
  const placed = Object.entries(gm.places ?? {}).sort((a, b) => a[1] - b[1]);
  scenes.push({ name: `Game ${n}: result`, ...tag, dur: 8, g: [rel(gm.end - 3), rel(gm.end)], cam: wide(gm, n), mood: 'victory', tag: 'PRE-GAME',
    card: { result: true, over: `GAME ${n} OF ${N}  ·  ${gm.map.name.toUpperCase()}`, title: gm.winner ? `${gm.winner.toUpperCase()} WINS` : 'A DRAW', winnerTeam: gm.winner ? gm.colours[gm.winner] : 'Red',
      sub: `after ${Math.floor((gm.end - gm.playStartsAt) / 60)}:${String(Math.round((gm.end - gm.playStartsAt) % 60)).padStart(2, '0')}`, statsTitle: 'FINISHING ORDER',
      stats: [placed.map(([s, p]) => `${p}. ${s}`).join('    ')] },
    narrate: [line('color', placed.length > 1 ? `${placed[0][0]} first, ${placed[1][0]} second, and ${placed.at(-1)[0]} out first.` : `${gm.winner} takes it.`, { at: 1 })] });
}

// --- the series ---
const res = rec.result, ranking = res.ranking ?? Object.keys(res.scores).sort((a, b) => res.scores[b] - res.scores[a]);
scenes.push({ name: 'Final standings', game: N, matchLabel: 'BED WARS', dur: 14, g: [rel0(N, 'end', -3), rel0(N, 'end', 0)], cam: wide(rec.games.at(-1), 3), mood: 'victory', tag: 'PRE-GAME',
  card: { result: true, over: 'FINAL STANDINGS', title: `${ranking[0].toUpperCase()} WINS THE SERIES`, winnerTeam: rec.games[0].colours[ranking[0]] ?? 'Red', sub: `${res.scores[ranking[0]]} points, ${res.wins?.[ranking[0]] ?? 0} wins`, statsTitle: 'POINTS (TEAMS OUTLASTED)',
    stats: ranking.map((s, i) => `${i + 1}. ${s}  ${res.scores[s]}${res.wins?.[s] ? `  (${res.wins[s]} win${res.wins[s] > 1 ? 's' : ''})` : ''}`) },
  narrate: [
    line('pbp', `And the series goes to ${ranking[0] === 'Scripted' ? 'the scripted bot' : ranking[0]}, with ${res.scores[ranking[0]]} points!`, { at: .8 }, { act: 'the final call, big and warm' }),
    line('color', `${ranking[1]} just one behind on ${res.scores[ranking[1]]}. The bot nobody changed beat four AI agents.`, { at: 6 }),
  ] });
function rel0(n, key, d) { const gm = rec.games[n - 1]; return r1(gm[key] - gm.start + d); }

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
const edit = {
  id: `arena-series-${id}`, title: 'Bed Wars Arena: the rematch', data: `/cinema-arena-duel/${id}`, fps: 30, posterTime: 60,
  header: 'OPUS · SOL · GEMINI · DEEPSEEK · SCRIPTED  ·  FIVE-TEAM BED WARS', matchLabel: 'BED WARS', winnerTeam: rec.games[0].colours[ranking[0]] ?? 'Red',
  kickoffScene: kickoff, finalScene: finals, scenes,
};
const dur = scenes.reduce((s, x) => s + x.dur, 0);
writeFileSync(outFile, `// Generated by scripts/bedwars-film-edit.mjs from ${dataDir}/recording.json: edit that script, not this file.\n// ${scenes.length} scenes, ${Math.floor(dur / 60)}:${String(Math.round(dur % 60)).padStart(2, '0')}.\nexport const EDIT = ${JSON.stringify(edit, null, 1)};\n`);
console.log(`${outFile}: ${scenes.length} scenes, ${Math.floor(dur / 60)}:${String(Math.round(dur % 60)).padStart(2, '0')}, ${lineNo} lines`);
for (const s of scenes) console.log(`  ${s.dur.toString().padStart(5)}s  ${s.tag.padEnd(10)} ${s.name}`);
console.log('Next: make the film by src/cinema/ARENA_FILM_GUIDELINES.md, and check it with node scripts/check-arena-film.mjs --movie=<film>.');
