// Voice the two commentators of the team battle film (src/cinema/arenaEdit.js): one clip per line, into
// public/<data>/narration/, with a manifest of each clip's length.
//   node scripts/narrate-arena.mjs                 every line (acted voices from OpenAI, needs OPENAI_KEY)
//   node scripts/narrate-arena.mjs n12 n15         just these lines
//   node scripts/narrate-arena.mjs --tts=edge      Edge voices instead (flat, but free)
// OpenAI's gpt-4o-mini-tts performs each line from its commentator's persona (COMMENTATORS), the line's acting note
// (`act`) and the line spoken just before, so the calls sound like a live broadcast rather than a reading. A clip is
// voiced again only when its words or direction change. Clips are trimmed of leading and trailing silence; then the
// layout is checked: no line may run into the next.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
// --edit=duel voices the Agent Arena duel film (src/cinema/arenaDuelEdit.js) instead of the team battle film.
// --edit=<id> voices a scripted-arena series film (src/cinema/arenaSeriesEdits.js), e.g. --edit=ds-low-vs-max.
const editArg = process.argv.find(a => a.startsWith('--edit='))?.slice(7), duel = editArg === 'duel', series = editArg && !duel;
const editModule = await import(duel || series ? '../src/cinema/arenaDuelEdit.js' : '../src/cinema/arenaEdit.js');
const seriesEdit = series ? (await import('../src/cinema/arenaSeriesEdits.js')).SERIES_EDITS[editArg] : null;
if (series && !seriesEdit) throw new Error(`No series film ${editArg}`);
const ARENA_EDIT = seriesEdit ?? (duel ? editModule.DUEL_EDIT : editModule.ARENA_EDIT), { COMMENTATORS } = editModule, arenaTimeline = () => editModule.arenaTimeline(ARENA_EDIT);

const tts = process.argv.find(a => a.startsWith('--tts='))?.slice(6) ?? 'openai';
const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
const dir = join('public', ARENA_EDIT.data.replace(/^\//, ''), 'narration');
mkdirSync(dir, { recursive: true });
const manifestPath = join(dir, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { clips: {} };
manifest.clips ??= {};
const key = process.env.OPENAI_KEY ?? process.env.OPENAI_API_KEY;
if (tts === 'openai' && !key) throw new Error('Set OPENAI_KEY, or use --tts=edge');
const python = tts === 'edge' && [process.env.PYTHON, 'python3.10', 'python3', 'python'].filter(Boolean).find((p) => {
  try { execFileSync(p, ['-c', 'import edge_tts'], { stdio: 'ignore' }); return true; } catch { return false; }
});
if (tts === 'edge' && !python) throw new Error('No Python with edge_tts found (pip install edge-tts), or set PYTHON.');

const { narration } = arenaTimeline();
const ordered = [...narration].sort((a, b) => a.start - b.start);
const job = (line, i) => {
  const voice = COMMENTATORS[line.who] ?? COMMENTATORS.pbp, before = ordered[i - 1];
  if (tts === 'edge') return { voice: voice.edge, hash: createHash('sha1').update(`edge|${voice.edge}|${line.text}`).digest('hex').slice(0, 12) };
  const instructions = [
    `You are ${voice.persona}.`,
    'This is a live call of a real match, not a story. Talk FAST, about four words a second, like a caster in the middle of the action: no dramatic pauses, no drawn-out words, sentences running into each other. Big energy and momentum. Never sound like a narrator reading a tale.',
    line.act ? `This line: ${line.act}.` : '',
    before ? `Your broadcast partner just said: "${before.text}"` : '',
  ].filter(Boolean).join(' ');
  const body = { model: 'gpt-4o-mini-tts', voice: voice.oa, input: line.text, instructions, response_format: 'mp3' };
  return { voice: 'openai:' + voice.oa, body, hash: createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 12) };
};

const seconds = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
for (const [i, line] of ordered.entries()) {
  if (only.length && !only.includes(line.id)) continue;
  const j = job(line, i), file = `${line.id}.mp3`, out = join(dir, file), raw = join(dir, `${line.id}.raw.mp3`);
  if (!only.length && manifest.clips[line.id]?.hash === j.hash && existsSync(out)) continue;
  for (let attempt = 1; ; attempt++) {
    try {
      if (tts === 'edge') execFileSync(python, ['-m', 'edge_tts', '--voice', j.voice, '--text', line.text, '--write-media', raw], { stdio: 'ignore' });
      else {
        const res = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(j.body) });
        if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
        writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
      }
      // Trim the silence at both ends, so a call starts on its first word, and shorten breaths between phrases to 0.12 s.
      const trim = 'silenceremove=stop_periods=-1:stop_duration=0.15:stop_threshold=-35dB:stop_silence=0.12,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse';
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-af', trim, '-ar', '48000', '-b:a', '160k', out + '.tmp.mp3']);
      renameSync(out + '.tmp.mp3', out);
      const duration = seconds(out);
      if (!(duration > .2)) throw new Error('empty clip');
      manifest.clips[line.id] = { file, who: line.who, voice: j.voice, hash: j.hash, text: line.text, duration: +duration.toFixed(2) };
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(`${line.id} ${line.who}: ${duration.toFixed(2)} s  "${line.text.slice(0, 60)}"`);
      break;
    } catch (error) {
      if (attempt >= 4) throw new Error(`${line.id}: ${error.message}`);
      console.log(`${line.id}: no audio (${error.message}); retrying`);
    }
  }
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// The layout: report every line that runs into the next, and how far.
let clashes = 0;
for (let i = 0; i < ordered.length; i++) {
  const clip = manifest.clips[ordered[i].id], next = ordered[i + 1];
  if (clip && next && ordered[i].start + clip.duration + .12 > next.start) {
    clashes++;
    console.log(`OVERLAP: ${ordered[i].id} (${ordered[i].start.toFixed(2)} + ${clip.duration} s) runs ${(ordered[i].start + clip.duration + .12 - next.start).toFixed(2)} s into ${next.id} (${next.start.toFixed(2)}, ${next.scene})`);
  }
}
console.log(clashes ? `${clashes} overlap(s): move lines or lengthen scenes in arenaEdit.js.` : 'No overlaps.');
