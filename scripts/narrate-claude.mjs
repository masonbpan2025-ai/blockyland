// Voices a Blockyland film: one neural TTS clip per line, one voice per character.
// Writes public/<audio dir>/audio/<id>.wav plus manifest.json (trimmed duration,
// lip-sync envelope at 48 Hz, and the pitch contour check for questions).
//   node scripts/narrate-claude.mjs well-see-claude            # all lines of a film
//   node scripts/narrate-claude.mjs stump-claude li-seeds      # just some lines
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FILMS = { 'well-see-claude': ['../src/cinema/claudeLines.js', 'public/cinema-claude/audio'], 'stump-claude': ['../src/cinema/stumpLines.js', 'public/cinema-stump/audio'], 'volume-layers': ['../src/cinema/volumeLines.js', 'public/cinema-volume/audio'] };
const [film, ...only] = process.argv.slice(2);
if (!FILMS[film]) throw new Error(`Choose a film: ${Object.keys(FILMS).join(', ')}`);
const { LINES, VOICES } = await import(FILMS[film][0]);
const out = path.resolve(FILMS[film][1]);
const jobs = LINES.filter(l => !only.length || only.includes(l.id)).map(l => ({ id: l.id, text: l.say ?? l.en, question: /\?\s*$/.test(l.en), ...VOICES[l.who] }));
const tmp = mkdtempSync(path.join(os.tmpdir(), 'claude-voices-'));
const jobFile = path.join(tmp, 'jobs.json'); writeFileSync(jobFile, JSON.stringify({ out, jobs }));

const py = String.raw`
import asyncio, json, os, subprocess, sys, wave
import numpy as np
import edge_tts

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
        mp3 = os.path.join(out, job['id'] + '.mp3'); wav = os.path.join(out, job['id'] + '.wav')
        await edge_tts.Communicate(job['text'], job['voice'], rate=job['rate'], pitch=job['pitch']).save(mp3)
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
        manifest[job['id']] = { 'duration': round(len(x) / SR, 3), 'envelope': [round(min(1, v / peak * 1.25), 2) for v in env], 'question': job['question'], 'endPitchRatio': round(rise, 3) }
        flag = ('  rise ' + str(round(rise, 2))) if job['question'] else ''
        print(f"{job['id']:<13} {job['voice']:<26} {len(x) / SR:5.2f}s{flag}")
    json.dump(manifest, open(manifest_path, 'w', encoding='utf8'))

asyncio.run(main())
`;
try { execFileSync('python', ['-c', py, jobFile], { stdio: 'inherit', windowsHide: true }); }
finally { rmSync(tmp, { recursive: true, force: true }); }
