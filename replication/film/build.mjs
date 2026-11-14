// The film's data from a replication run (replication/runs/<run>/):
//   public/cinema-replication/<run>/recording.json   frames, block changes and events, on the game clock (seconds)
//   replication/runs/<run>/digest.md                 the story so far, for writing the edit: per agent, what it said,
//                                                    ran and got back, with chat, deaths and advancements, in time order
//   node replication/film/build.mjs <run>
//
// Game time is the server tick / 20. An agent's words and programs are placed on that clock by its programs' log
// (programs/<Name>.jsonl has each program's tick): the n-th `bl run`/`bl eval` call in a transcript is the n-th program.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { combatEvents } from './combat.mjs';

const run = process.argv[2];
if (!run) throw new Error('usage: node replication/film/build.mjs <run>');
const repo = path.resolve(import.meta.dirname, '..', '..');
const runDir = path.join(repo, 'replication', 'runs', run);
const lines = (f) => existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];

// --- the recording ---
const frames = lines(path.join(runDir, 'recording', 'frames.jsonl'));
const names = [...new Set(frames.flatMap(f => f.p.map(p => p[0])))];
const t0 = frames[0]?.t ?? 0;
const sec = (tick) => +((tick - t0) / 20).toFixed(2);
const recFrames = frames.map(f => ({
  t: sec(f.t), day: f.time,
  // [x, y, z, yaw, pitch, health, held, dim, armor, sleeping, food] in the order of `names`
  p: names.map(n => { const p = f.p.find(q => q[0] === n); return p ? [p[2], p[3], p[4], p[5], p[6], p[7], p[9], p[1], p[10], p[11], p[8]] : null; }),
  // [id, type, x, y, z, yaw, dim, health]: mobs and dropped items any player could see
  a: f.e.map(e => [e[0], e[2], e[3], e[4], e[5], e[6], e[1], e[7]]),
}));
const blockChanges = lines(path.join(runDir, 'recording', 'blocks.jsonl')).map(([tick, dim, x, y, z, id]) => [sec(tick), dim, x, y, z, id]);
// Death messages the server got wrong at the time, with the evidence. sonnet30: the game's lava damage carried no type
// then (fixed since in src/heat.js), so Corin's death was logged "died (generic)"; he lost 20 health in 2 s standing at
// (-2.6, 1, -6.5), the 4-per-half-second rate of lava, next to a 58-block lava pool the seed generates at y 2-3.
const CORRECTIONS = { sonnet30: { 'Corin died (generic)': 'Corin tried to swim in lava' } };
// Advancements the server credited to the wrong player. Until the fix in engine.as (2026-11-05), a game event went to
// the tracker that had updated last: a kill to the last player in the list, a meal (finished in the eater's
// eating.update, before its own tracker's update) to the player before the eater. dry8, each checked in the frames:
// Corin killed chicken #8 at 87.3 s (Adventure, 88.9, logged as Delphi's); Corin's food rose at 380.3 (Husbandry,
// logged as Basil's), Delphi's at 670.9 (logged as Corin's), Aria's at 1546.5 (logged as Delphi's); Basil's iron sword
// took skeleton #102 from 9 health to dead at 1280.7 (Monster Hunter, logged as Delphi's; Delphi was 8 blocks below).
const CREDIT = { dry8: [['Adventure', 'Delphi', 88.9, 'Corin'], ['Husbandry', 'Basil', 382, 'Corin'], ['Husbandry', 'Corin', 672, 'Delphi'], ['Husbandry', 'Delphi', 1547, 'Aria'], ['Monster Hunter', 'Delphi', 1281, 'Basil']] };
const events = lines(path.join(runDir, 'events.jsonl')).filter(e => ['chat', 'death', 'respawn', 'advancement', 'dimension', 'night_skipped', 'lightning', 'ender_eye', 'join'].includes(e.kind))
  .map(e => ({ ...e, t: sec(e.t ?? t0), ...(CORRECTIONS[run]?.[e.message] ? { message: CORRECTIONS[run][e.message], corrected: e.message } : {}) }))
  .map(e => { const fix = e.kind === 'advancement' && (CREDIT[run] ?? []).find(([title, was, t]) => e.title === title && e.player === was && Math.abs(e.t - t) < 3); return fix ? { ...e, player: fix[3], corrected: `logged as ${e.player}'s` } : e; });
// The fights: arrows, hits on players, hits on mobs (combat.mjs: inferred from health and arrows in the frames).
const combat = combatEvents(frames, sec);
const start = lines(path.join(runDir, 'events.jsonl')).find(e => e.kind === 'server_start');
const out = path.join(repo, 'public', 'cinema-replication', run);
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'recording.json'), JSON.stringify({ version: 1, run, seed: start?.seed, spawn: start?.spawn, players: names.map(name => ({ name })), frameSeconds: .5, frames: recFrames, blockChanges, events, combat }));

// --- what each agent said and did, on the game clock ---
const story = [];
for (const name of names) {
  const programs = lines(path.join(runDir, 'programs', `${name}.jsonl`));
  let n = 0, pendingText = [];
  const dir = path.join(runDir, 'agents', name);
  const transcripts = existsSync(dir) ? readdirSync(dir).filter(f => f.startsWith('transcript-')).sort() : [];
  for (const file of transcripts) for (const j of lines(path.join(dir, file))) {
    if (j.type !== 'assistant') continue;
    for (const c of j.message?.content ?? []) {
      if (c.type === 'text' && c.text.trim()) pendingText.push(c.text.trim());
      if (c.type !== 'tool_use') continue;
      const cmd = String(c.input?.command ?? '');
      const isProgram = c.name === 'Bash' && /(^|[;&|\s])\.?\/?bl(\.cmd)?\s+(run|eval)\b/.test(cmd);
      const prog = isProgram ? programs[n++] : null;
      // A program's tick is logged when it ends; it started `seconds` earlier.
      const startOf = (p) => sec(p.tick - (p.seconds ?? 0) * 20);
      const t = prog ? startOf(prog) : (programs[n] ? startOf(programs[n]) : null);
      const note = c.name === 'Write' || c.name === 'Edit' ? { file: path.basename(String(c.input?.file_path ?? '')), shared: /[\\/]shared[\\/]/.test(String(c.input?.file_path ?? '')), text: String(c.input?.content ?? c.input?.new_string ?? '').slice(0, 1500) } : null;
      story.push({ t, who: name, said: pendingText.join('\n'), tool: c.name, cmd: cmd.slice(0, 300), note,
        program: prog ? { status: prog.status, seconds: prog.seconds, end: sec(prog.tick), code: String(prog.code ?? '').slice(0, 1500), output: [...(prog.log ?? []), ...(prog.late ?? []), prog.result ? 'returned ' + prog.result : '', prog.error ? 'ERROR ' + prog.error : ''].filter(Boolean).join('\n').slice(0, 900) } : null });
      pendingText = [];
    }
  }
  if (pendingText.length) story.push({ t: programs.length ? sec(programs.at(-1).tick) : null, who: name, said: pendingText.join('\n') });
}
for (const e of events) story.push({ t: e.t, who: e.player ?? e.from ?? '', event: e });
story.sort((a, b) => (a.t ?? 1e9) - (b.t ?? 1e9));
writeFileSync(path.join(out, 'story.json'), JSON.stringify(story));

const clock = (t) => t == null ? '?:??' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const md = [`# Run ${run}: digest`, '', `Players: ${names.join(', ')}. Frames: ${recFrames.length} (${clock(recFrames.at(-1)?.t)} of game time). Block changes: ${blockChanges.length}.`, ''];
for (const s of story) {
  if (s.event) { const e = s.event; md.push(`**${clock(s.t)} EVENT ${e.kind}** ${e.kind === 'chat' ? `<${e.from}> ${e.text}` : e.message ?? e.title ?? (e.to ? `${e.player} → ${e.to}` : JSON.stringify(e).slice(0, 200))}`); continue; }
  md.push(`### ${clock(s.t)} ${s.who}${s.tool ? ` · ${s.tool}` : ''}`);
  if (s.said) md.push(`> ${s.said.replace(/\n/g, '\n> ')}`);
  if (s.note) md.push(`*${s.note.shared ? 'SHARED' : 'own'} file ${s.note.file}:* ${s.note.text.replace(/\n/g, ' ').slice(0, 600)}`);
  else if (s.cmd && !s.program) md.push(`\`${s.cmd.replace(/\n/g, ' ').slice(0, 200)}\``);
  if (s.program) md.push(`program ${s.program.status} (${s.program.seconds}s): ${s.program.output.replace(/\n/g, ' ').slice(0, 500)}`);
  md.push('');
}
writeFileSync(path.join(runDir, 'digest.md'), md.join('\n'));
console.log(`${run}: ${recFrames.length} frames, ${blockChanges.length} block changes, ${events.length} events, ${combat.shots.length} arrows, ${combat.hurts.length} hits on players, ${combat.hits.length} on mobs, ${story.length} story items -> ${path.relative(repo, out)} and digest.md`);
