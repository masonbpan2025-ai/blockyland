// Voices a Blockyland film: one neural TTS clip per line, one voice per character.
// Writes public/<audio dir>/audio/<id>.wav plus manifest.json (trimmed duration,
// lip-sync envelope at 48 Hz, and the pitch contour check for questions).
//   node scripts/narrate-claude.mjs well-see-claude            # all lines of a film
//   node scripts/narrate-claude.mjs stump-claude li-seeds      # just some lines
//   node scripts/narrate-claude.mjs civ-weddings --tts=openai  # acted voices from OpenAI (needs OPENAI_KEY)
// With --tts=openai each line is performed from its character's `persona`, its scene's mood (MOODS), the lines just
// before it and its own acting note (ACT). A line whose text and direction have not changed keeps its clip.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FILMS = { 'well-see-claude': ['../src/cinema/claudeLines.js', 'public/cinema-claude/audio'], 'stump-claude': ['../src/cinema/stumpLines.js', 'public/cinema-stump/audio'], 'volume-layers': ['../src/cinema/volumeLines.js', 'public/cinema-volume/audio'], 'civ-1500': ['../src/cinema/civLines.js', 'public/cinema-civ/audio'], 'civ-weddings': ['../src/cinema/wedLines.js', 'public/cinema-weddings/audio'] };
const args = process.argv.slice(2), tts = (args.find(a => a.startsWith('--tts=')) ?? '--tts=edge').slice(6);
const [film, ...only] = args.filter(a => !a.startsWith('--'));
if (!FILMS[film]) throw new Error(`Choose a film: ${Object.keys(FILMS).join(', ')}`);
const { LINES, VOICES, MOODS = {}, ACT = {} } = await import(FILMS[film][0]);
const out = path.resolve(FILMS[film][1]);
let jobs = LINES.filter(l => !only.length || only.includes(l.id)).map(l => ({ id: l.id, text: l.say ?? l.en, question: /\?\s*$/.test(l.en), ...VOICES[l.who] }));
const tmp = mkdtempSync(path.join(os.tmpdir(), 'claude-voices-'));

if (tts === 'openai') {
  const key = process.env.OPENAI_KEY ?? process.env.OPENAI_API_KEY; if (!key) throw new Error('Set OPENAI_KEY to use --tts=openai');
  const manifestPath = path.join(out, 'manifest.json'), old = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  const name = who => (VOICES[who].persona ?? who).split(':')[0];
  jobs = jobs.map(job => {
    const i = LINES.findIndex(l => l.id === job.id), line = LINES[i];
    if (!job.oa) throw new Error(`No OpenAI voice (oa) for ${line.who}`);
    const before = LINES.slice(Math.max(0, i - 2), i).filter(l => l.scene === line.scene).map(l => `${name(l.who)}: “${l.en}”`);
    const instructions = [`You are voice-acting in a gentle animated comedy for children aged 8 to 11 about love, marriage and friendship.`,
      `Character: ${job.persona}`, MOODS[line.scene] && `Scene: ${MOODS[line.scene]}`, before.length && `Just before this: ${before.join(' ')}`,
      `Direction: ${ACT[line.id] ?? 'Play it naturally in character, reacting to what was just said.'}`,
      `Perform it like a real cartoon voice actor, not like reading aloud. Keep it lively; say exactly the given words; pauses at “...” are short beats.`].filter(Boolean).join('\n');
    const body = { model: 'gpt-4o-mini-tts', voice: job.oa, input: job.text, instructions, response_format: 'wav' };
    return { ...job, voice: 'openai:' + job.oa, body, hash: createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 12) };
  }).filter(job => !(old[job.id]?.hash === job.hash && existsSync(path.join(out, job.id + '.wav'))));
  console.log(`OpenAI: ${jobs.length} line(s) to voice`);
  const fetchOne = async job => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(job.body) });
      if (res.ok) { job.src = path.join(tmp, job.id + '.wav'); writeFileSync(job.src, Buffer.from(await res.arrayBuffer())); delete job.body; return; }
      const err = `${job.id}: OpenAI ${res.status} ${(await res.text()).slice(0, 200)}`;
      if (attempt === 4 || ![408, 429, 500, 502, 503, 504].includes(res.status)) throw new Error(err);
      console.log(err, '- retrying'); await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  };
  const queue = [...jobs]; await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await fetchOne(queue.shift()); }));
}
const jobFile = path.join(tmp, 'jobs.json'); writeFileSync(jobFile, JSON.stringify({ out, jobs }));

const py = String.raw`
import asyncio, json, os, subprocess, sys, wave
import numpy as np

spec = json.load(open(sys.argv[1], encoding='utf8')); out = spec['out']; os.makedirs(out, exist_ok=True)
manifest_path = os.path.join(out, 'manifest.json')
manifest = json.load(open(manifest_path, encoding='utf8')) if os.path.exists(manifest_path) else {}
SR = 48000

def pitch_track(x):
    # Autocorrelation F0 every 20 ms on voiced frames; enough to see a question's final rise.
    win, hop, f0 = 1536, 960, []
    for i in range(0, len(x) - win, hop):
        f = x[i:i + win] * np.hanning(win)
        if np.sqrt(np.mean(f ** 2)) < 0.02: f0.append(0); continue
        ac = np.correlate(f, f, 'full')[win - 1:]
        lo, hi = SR // 450, SR // 70
        lag = lo + int(np.argmax(ac[lo:hi]))
        f0.append(SR / lag if ac[lag] > 0.3 * ac[0] else 0)
    return f0

async def main():
    for job in spec['jobs']:
        mp3 = job.get('src') or os.path.join(out, job['id'] + '.mp3'); wav = os.path.join(out, job['id'] + '.wav')
        for attempt in range(0 if job.get('src') else 5):  # an OpenAI clip (src) is already fetched; Edge sometimes returns no audio for a line it voices fine a moment later
            import edge_tts
            try:
                await edge_tts.Communicate(job['text'], job['voice'], rate=job['rate'], pitch=job['pitch']).save(mp3); break
            except edge_tts.exceptions.NoAudioReceived:
                if attempt == 4: raise
                await asyncio.sleep(2 + attempt * 2)
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', mp3, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
        os.remove(mp3)
        x = np.frombuffer(raw, dtype=np.float32).copy()
        loud = np.where(np.abs(x) > 0.012)[0]
        a, b = max(0, loud[0] - int(.03 * SR)), min(len(x), loud[-1] + int(.12 * SR))
        x = x[a:b]; fade = int(.01 * SR); x[:fade] *= np.linspace(0, 1, fade); x[-fade:] *= np.linspace(1, 0, fade)
        x = x / max(1e-6, np.max(np.abs(x))) * 0.89
        with wave.open(wav, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype('<i2').tobytes())
        step = SR // 48
        env = [float(np.sqrt(np.mean(x[i:i + step] ** 2))) for i in range(0, len(x), step)]
        peak = max(env) or 1
        f0 = pitch_track(x); voiced = [v for v in f0 if v > 0]
        tail = voiced[-6:]; body = voiced[:-6] or voiced
        rise = (float(np.median(tail[-3:])) / float(np.median(body)) if len(tail) >= 3 and body else 1.0)
        manifest[job['id']] = { 'hash': job.get('hash'), 'duration': round(len(x) / SR, 3), 'envelope': [round(min(1, v / peak * 1.25), 2) for v in env], 'question': job['question'], 'endPitchRatio': round(rise, 3) }
        flag = ('  rise ' + str(round(rise, 2))) if job['question'] else ''
        print(f"{job['id']:<13} {job['voice']:<26} {len(x) / SR:5.2f}s{flag}")
        json.dump(manifest, open(manifest_path, 'w', encoding='utf8'))  # after every clip, so a failure keeps the finished ones

asyncio.run(main())
`;
// The first interpreter that has numpy (and edge_tts for Edge voices); PYTHON picks one. On Windows plain 'python'
// is often only the Microsoft Store shortcut, while the real install answers to 'python3.10'.
const need = tts === 'openai' ? 'import numpy' : 'import numpy, edge_tts';
const python = [process.env.PYTHON, 'python3.10', 'python3.11', 'python3.12', 'python3', 'python'].filter(Boolean).find(p => {
  try { execFileSync(p, ['-c', need], { stdio: 'ignore', windowsHide: true }); return true; } catch { return false; }
});
if (!python) throw new Error(`No Python with numpy${tts === 'openai' ? '' : ' and edge_tts'} found; set PYTHON to one`);
try { if (jobs.length) execFileSync(python, ['-c', py, jobFile], { stdio: 'inherit', windowsHide: true }); }
finally { rmSync(tmp, { recursive: true, force: true }); }
