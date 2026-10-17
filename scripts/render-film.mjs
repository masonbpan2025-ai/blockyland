// Render the real Three.js film on a fixed clock, then encode with local FFmpeg.
// No full Game startup, screen recording, cloud rendering, or API key required.
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { CLAUDE_STORY, CLAUDE_REVIEW_TIMES } from '../src/cinema/claudeStory.js';
import { STUMP_STORY, STUMP_REVIEW_TIMES } from '../src/cinema/stumpStory.js';
import { VOLUME_STORY, VOLUME_REVIEW_TIMES } from '../src/cinema/volumeStory.js';

const movieId = process.argv.find(a => a.startsWith('--movie='))?.slice(8);
const FILMS = {
  'well-see-claude': { story: CLAUDE_STORY, page: 'well-see-claude.html', review: CLAUDE_REVIEW_TIMES, out: 'outputs/well-see-claude' },
  'stump-claude': { story: STUMP_STORY, page: 'stump-claude.html', review: STUMP_REVIEW_TIMES, out: 'outputs/stump-claude' },
  'volume-layers': { story: VOLUME_STORY, page: 'volume-layers.html', review: VOLUME_REVIEW_TIMES, out: 'outputs/volume-layers' },
};
if (!FILMS[movieId]) throw new Error(`Choose a film with --movie=: ${Object.keys(FILMS).join(', ')}`);
const film = FILMS[movieId], PILOT = film.story, previewPage = film.page;
const reviewTimes = process.env.REVIEW_TIMES ? process.env.REVIEW_TIMES.split(',').map(Number) : film.review;
const output = path.resolve(film.out); await mkdir(output, { recursive: true });
const previewOnly = process.argv.includes('--preview');
const errors = []; let browser, encoder, server;
try {
  let baseURL = process.env.PILOT_URL;
  if (!baseURL) {
    server = await createServer({ configFile: false, root: path.resolve('.'), cacheDir: 'node_modules/.vite-cinema-pilot', optimizeDeps: { entries: [previewPage], include: ['three'], noDiscovery: true }, logLevel: 'warn', server: { host: '127.0.0.1', port: 3012, hmr: false, watch: { ignored: ['**/outputs/**'] } } });
    await server.listen(); baseURL = server.resolvedUrls.local[0];
  }
  browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling'] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 960 } });
  page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // Other work in this shared repo must not hot-reload a film midway through export.
  await page.route('**/@vite/client', r => r.fulfill({ contentType: 'application/javascript', body: 'export const injectQuery=(u,q)=>u+(u.includes("?")?"&":"?")+q;export const createHotContext=()=>({accept(){},prune(){},dispose(){},on(){}});export const updateStyle=()=>{};export const removeStyle=()=>{};' }));
  await page.goto(`${baseURL.replace(/\/$/, '')}/${previewPage}`, { waitUntil: 'commit', timeout: 120000 });
  console.log('Loading the film set and game textures.');
  await page.waitForFunction(() => window.pilot?.ready, null, { timeout: 180000 });
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
  await writeFile(path.join(output, 'review.json'), JSON.stringify({ duration: PILOT.duration, size: [1280, 720], fps: PILOT.fps, shots: views, errors }, null, 2));
  if (previewOnly) { console.log(`Previews written to ${output}`); }
  else {
    const wav = await page.evaluate(() => window.pilot.wavBase64());
    await writeFile(path.join(output, 'soundtrack.wav'), Buffer.from(wav, 'base64'));
    const voiceReport = await page.evaluate(() => window.pilot.audioReport);
    await writeFile(path.join(output, 'audio-review.json'), JSON.stringify(voiceReport, null, 2));
    const frames = PILOT.duration * PILOT.fps;
    console.log(`Narration and original score mixed. Rendering ${frames} frames.`);
    encoder = spawn(process.env.FFMPEG_PATH ?? 'ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-y', '-f', 'image2pipe', '-framerate', String(PILOT.fps), '-vcodec', 'mjpeg', '-i', 'pipe:0', '-i', path.join(output, 'soundtrack.wav'), '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-maxrate', '5M', '-bufsize', '10M', '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'aac', '-ar', '48000', '-b:a', '160k', '-af', 'loudnorm=I=-18:TP=-1.5:LRA=11', '-t', String(PILOT.duration), '-movflags', '+faststart', path.join(output, movieId + '.mp4')], { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
    let stderr = ''; encoder.stderr.on('data', data => { stderr += data; });
    const complete = new Promise((resolve, reject) => { encoder.on('error', reject); encoder.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg ${code}: ${stderr}`))); });
    for (let i = 0; i < frames; i++) {
      const jpeg = await page.evaluate(time => window.pilot.capture(time), i / PILOT.fps);
      if (!encoder.stdin.write(Buffer.from(jpeg, 'base64'))) await once(encoder.stdin, 'drain');
      if ((i + 1) % Math.round(frames / 10) === 0) console.log(`Rendered ${i + 1}/${frames} frames (${Math.round((i + 1) / frames * 100)}%).`);
    }
    encoder.stdin.end(); await complete;
    if (errors.length) throw new Error(errors.join('\n'));
    if (process.argv.includes('--publish')) {
      const publicDir = path.resolve('public/movies'); await mkdir(publicDir, { recursive: true });
      await copyFile(path.join(output, movieId + '.mp4'), path.join(publicDir, movieId + '.mp4'));
      execFileSync(process.env.FFMPEG_PATH ?? 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(output, 'poster.png'), '-frames:v', '1', '-q:v', '3', path.join(publicDir, movieId + '.jpg')], { windowsHide: true });
    }
    console.log(`Video written: ${path.join(output, movieId + '.mp4')}`);
  }
} finally { encoder?.stdin?.destroy(); await browser?.close(); await server?.close(); }
