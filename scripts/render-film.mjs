// Render the real Three.js film on a fixed clock, then encode with local FFmpeg.
// No full Game startup, screen recording, cloud rendering, or API key required.
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile, copyFile, readdir, readFile, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createServer } from 'vite';
import { CLAUDE_STORY, CLAUDE_REVIEW_TIMES } from '../src/cinema/claudeStory.js';
import { STUMP_STORY, STUMP_REVIEW_TIMES } from '../src/cinema/stumpStory.js';
import { VOLUME_STORY, VOLUME_REVIEW_TIMES } from '../src/cinema/volumeStory.js';
import { CIV_STORY, CIV_REVIEW_TIMES } from '../src/cinema/civStory.js';
import { WED_STORY, WED_REVIEW_TIMES } from '../src/cinema/wedStory.js';

const movieId = process.argv.find(a => a.startsWith('--movie='))?.slice(8);
const FILMS = {
  'well-see-claude': { story: CLAUDE_STORY, page: 'well-see-claude.html', review: CLAUDE_REVIEW_TIMES, out: 'outputs/well-see-claude' },
  'stump-claude': { story: STUMP_STORY, page: 'stump-claude.html', review: STUMP_REVIEW_TIMES, out: 'outputs/stump-claude' },
  'volume-layers': { story: VOLUME_STORY, page: 'volume-layers.html', review: VOLUME_REVIEW_TIMES, out: 'outputs/volume-layers' },
  'civ-1500': { story: CIV_STORY, page: 'civ-1500.html', review: CIV_REVIEW_TIMES, out: 'outputs/civ-1500' },
  'civ-weddings': { story: WED_STORY, page: 'civ-weddings.html', review: WED_REVIEW_TIMES, out: 'outputs/civ-weddings' },
};
if (!FILMS[movieId]) throw new Error(`Choose a film with --movie=: ${Object.keys(FILMS).join(', ')}`);
const film = FILMS[movieId], PILOT = film.story, previewPage = film.page;
// --from=<s> --to=<s> renders a clip of the film (to <film>-clip.mp4) for quick review; a clip is never published
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
const from = Number(arg('from') ?? 0), to = Math.min(PILOT.duration, Number(arg('to') ?? PILOT.duration)), clip = from > 0 || to < PILOT.duration;
if (clip && process.argv.includes('--publish')) throw new Error('A clip (--from/--to) cannot be published; render the whole film.');
const reviewTimes = process.env.REVIEW_TIMES ? process.env.REVIEW_TIMES.split(',').map(Number) : film.review.filter(t => t >= from && t <= to);
const output = path.resolve(film.out); await mkdir(output, { recursive: true });
const previewOnly = process.argv.includes('--preview'), videoName = clip ? `${movieId}-clip.mp4` : movieId + '.mp4';
const errors = []; let browser, encoder, server;
try {
  let baseURL = process.env.PILOT_URL;
  if (!baseURL) {
    server = await createServer({ configFile: false, root: path.resolve('.'), cacheDir: 'node_modules/.vite-cinema-pilot', optimizeDeps: { entries: [previewPage], include: ['three'], noDiscovery: true }, logLevel: 'warn', server: { host: '127.0.0.1', port: 3012, hmr: false, watch: { ignored: ['**/outputs/**'] } } });
    await server.listen(); baseURL = server.resolvedUrls.local[0];
  }
  // A fresh browser per batch of frames: a long film's 2x supersampled export otherwise outgrows the page's memory, and
  // closing only the page leaves WebGL contexts behind in the browser's GPU process until it cannot create another one.
  async function openFilm(tries = 2) {
    await browser?.close();
    browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling'] });
    try { return await loadFilm(); } catch (e) { if (tries <= 1) throw e; console.log(`The film page did not load (${e.message.split('\n')[0]}); retrying in a new browser.`); return openFilm(tries - 1); }
  }
  async function loadFilm() {
    const page = await browser.newPage({ viewport: { width: 1360, height: 960 } });
    page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    // Other work in this shared repo must not hot-reload a film midway through export.
    await page.route('**/@vite/client', r => r.fulfill({ contentType: 'application/javascript', body: 'export const injectQuery=(u,q)=>u+(u.includes("?")?"&":"?")+q;export const createHotContext=()=>({accept(){},prune(){},dispose(){},on(){}});export const updateStyle=()=>{};export const removeStyle=()=>{};' }));
    await page.goto(`${baseURL.replace(/\/$/, '')}/${previewPage}?export`, { waitUntil: 'commit', timeout: 120000 });
    await page.waitForFunction(() => window.pilot?.ready, null, { timeout: 300000 });
    return page;
  }
  console.log('Loading the film set and game textures.');
  let page = await openFilm();
  console.log(`Film ready. Reviewing ${reviewTimes.length} camera shots.`);
  const views = [];
  for (const t of reviewTimes) {
    const result = await page.evaluate(time => window.pilot.renderFrame(time), t); views.push(result);
    const png = await page.evaluate(time => window.pilot.poster(time), t);
    await writeFile(path.join(output, `frame-${String(t).replace('.', '-')}.png`), Buffer.from(png, 'base64'));
  }
  const contact = await page.evaluate(times => {
    const cols = times.length > 9 ? 4 : 3, width = 1280 / cols, height = width * 9 / 16, rowHeight = height + 30;
    const c = document.createElement('canvas'); c.width = 1280; c.height = rowHeight * Math.ceil(times.length / cols); const p = c.getContext('2d'); p.fillStyle = '#121916'; p.fillRect(0, 0, c.width, c.height);
    times.forEach((t, i) => {
      window.pilot.renderFrame(t); const x = i % cols * width, y = Math.floor(i / cols) * rowHeight;
      p.drawImage(document.querySelector('#stage canvas'), x, y, width, height); p.fillStyle = '#e9e3d0'; p.font = '12px Arial';
      p.fillText(`${t}s · ${window.pilot.renderFrame(t).shot}`, x + 8, y + height + 20, width - 16);
    }); return c.toDataURL('image/jpeg', .92).split(',')[1];
  }, reviewTimes);
  await writeFile(path.join(output, 'storyboard.jpg'), Buffer.from(contact, 'base64'));
  await writeFile(path.join(output, 'poster.png'), Buffer.from(await page.evaluate(t => window.pilot.poster(t), PILOT.posterTime ?? 2.5), 'base64'));
  if (errors.length) throw new Error(errors.join('\n'));
  // continuity check (films that provide pilot.check): actors inside blocks, a lens inside a block, a speaker hidden or turned away
  if (await page.evaluate(() => typeof window.pilot.check === 'function')) {
    const step = previewOnly ? 0 : .5, times = step ? Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => +(from + i * step).toFixed(2)) : reviewTimes, found = new Map();
    for (const t of times) for (const issue of (await page.evaluate(t => window.pilot.check(t), t)).issues) found.set(issue, [...found.get(issue) ?? [], t]);
    const report = [...found].map(([issue, ts]) => ({ issue, at: ts.reduce((r, t) => { const last = r.at(-1); if (last && t - last[1] <= (step || 0) + .01) last[1] = t; else r.push([t, t]); return r; }, []).map(([a, b]) => a === b ? `${a}s` : `${a}–${b}s`) }));
    await writeFile(path.join(output, 'check.json'), JSON.stringify(report, null, 2));
    console.log(report.length ? `Continuity check: ${report.length} problem(s), see check.json\n` + report.map(r => `  ${r.issue}: ${r.at.join(', ')}`).join('\n') : `Continuity check: clean (${times.length} frames sampled).`);
  }
  await writeFile(path.join(output, 'review.json'), JSON.stringify({ duration: PILOT.duration, size: [1920, 1080], fps: PILOT.fps, shots: views, errors }, null, 2));
  if (previewOnly) { console.log(`Previews written to ${output}`); }
  else {
    const wav = await page.evaluate(() => window.pilot.wavBase64());
    await writeFile(path.join(output, 'soundtrack.wav'), Buffer.from(wav, 'base64'));
    const voiceReport = await page.evaluate(() => window.pilot.audioReport);
    await writeFile(path.join(output, 'audio-review.json'), JSON.stringify(voiceReport, null, 2));
    const first = Math.round(from * PILOT.fps), frames = Math.round(to * PILOT.fps) - first, BATCH = Number(process.env.FRAME_BATCH ?? 1200);
    // Each batch of frames is encoded to its own segment, so a run that stops partway resumes where it stopped. Segments
    // belong to one version of the film: a fingerprint of the sources that shape a frame (the film's modules, the block
    // table and mesher, the page) names their folder, and folders of other versions are deleted, so a film change never
    // mixes old frames into a new cut. Other game code is left out: agents edit it all day, and it rarely changes a
    // film frame. After a change there that does, pass --fresh to start again.
    const hash = createHash('sha1').update(JSON.stringify({ movieId, from, to, BATCH, fps: PILOT.fps }));
    const sources = [...(await readdir('src/cinema')).filter(f => f.endsWith('.js')).sort().map(f => `src/cinema/${f}`), 'src/blocks.js', 'src/mesher.js', previewPage];
    for (const f of sources) hash.update(f).update(await readFile(f));
    const segDir = path.join(output, `segments-${hash.digest('hex').slice(0, 12)}`);
    for (const d of await readdir(output)) if (d.startsWith('segments-') && (path.join(output, d) !== segDir || process.argv.includes('--fresh'))) await rm(path.join(output, d), { recursive: true, force: true });
    await mkdir(segDir, { recursive: true });
    const segments = Array.from({ length: Math.ceil(frames / BATCH) }, (_, s) => ({ start: first + s * BATCH, count: Math.min(BATCH, frames - s * BATCH), file: path.join(segDir, `seg-${String(first + s * BATCH).padStart(6, '0')}.mp4`) }));
    const done = segments.filter(s => existsSync(s.file)).length;
    console.log(`Narration and original score mixed. Rendering ${frames} frames${clip ? ` (${from}s–${to}s)` : ''}${done ? `; ${done} of ${segments.length} segments are already done and are kept` : ''}.`);
    const run = (args, input) => { const p = spawn(process.env.FFMPEG_PATH ?? 'ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-y', ...args], { stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe'], windowsHide: true }); let stderr = ''; p.stderr.on('data', d => { stderr += d; }); p.done = new Promise((resolve, reject) => { p.on('error', reject); p.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg ${code}: ${stderr}`))); }); return p; };
    let rendered = done ? segments.slice(0, done).reduce((n, s) => n + s.count, 0) : 0, nextReport = Math.round(frames / 10);
    for (const seg of segments) {
      if (existsSync(seg.file)) continue;
      await page?.close().catch(() => {}); page = await openFilm();
      const tmp = seg.file.replace(/\.mp4$/, '.part.mp4');
      encoder = run(['-f', 'image2pipe', '-framerate', String(PILOT.fps), '-vcodec', 'mjpeg', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', tmp], true);
      for (let i = 0; i < seg.count; i++) {
        const jpeg = await page.evaluate(time => window.pilot.capture(time), (seg.start + i) / PILOT.fps);
        if (!encoder.stdin.write(Buffer.from(jpeg, 'base64'))) await once(encoder.stdin, 'drain');
        if (++rendered >= nextReport) { console.log(`Rendered ${rendered}/${frames} frames (${Math.round(rendered / frames * 100)}%).`); nextReport += Math.round(frames / 10); }
      }
      encoder.stdin.end(); await encoder.done; encoder = null;
      if (errors.length) throw new Error(errors.join('\n'));
      await rename(tmp, seg.file); // only a finished segment gets its final name
    }
    // join the segments without re-encoding, and add the soundtrack (cut to the clip, loudness-normalised)
    const list = path.join(segDir, 'segments.txt'); await writeFile(list, segments.map(s => `file '${s.file.replace(/\\/g, '/')}'`).join('\n'));
    await run(['-f', 'concat', '-safe', '0', '-i', list, '-ss', String(from), '-i', path.join(output, 'soundtrack.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-ar', '48000', '-b:a', '160k', '-af', 'loudnorm=I=-18:TP=-1.5:LRA=11', '-t', String(to - from), '-movflags', '+faststart', path.join(output, videoName)]).done;
    if (process.argv.includes('--publish')) {
      const publicDir = path.resolve('public/movies'); await mkdir(publicDir, { recursive: true });
      await copyFile(path.join(output, movieId + '.mp4'), path.join(publicDir, movieId + '.mp4'));
      execFileSync(process.env.FFMPEG_PATH ?? 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(output, 'poster.png'), '-frames:v', '1', '-q:v', '3', path.join(publicDir, movieId + '.jpg')], { windowsHide: true });
    }
    console.log(`Video written: ${path.join(output, videoName)}`);
  }
} finally { encoder?.stdin?.destroy(); await encoder?.done.catch(() => {}); await browser?.close(); await server?.close(); }
