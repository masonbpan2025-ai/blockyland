import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const base = (process.env.MOVIES_URL ?? 'http://127.0.0.1:3000/').replace(/\/?$/, '/');
const galleryOnly = process.argv.includes('--gallery-only');
const output = path.resolve('test-results/movies'); await mkdir(output, { recursive: true });
const errors = [], result = { navigation: false, gallery: false, mobile: false, films: [] };
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // Movies must be reachable immediately, including before the game has loaded.
  await page.route('**/src/main.js', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('**/assets/game-*.js', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('**/@vite/client', r => r.fulfill({ contentType: 'application/javascript', body: 'export const injectQuery=(u,q)=>u+"?"+q;export const createHotContext=()=>({accept(){},prune(){},dispose(){},on(){}});export const updateStyle=()=>{};export const removeStyle=()=>{};' }));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Movies', exact: true }).click(); await page.waitForURL('**/movies.html'); result.navigation = true;
  await page.locator('.movie-card').last().waitFor(); assert.equal(await page.locator('.movie-card').count(), 2);
  await page.locator('.poster img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
  assert.match(await page.locator('.intro').innerText(), /demonstration of storytelling/);
  await page.locator('.prompt summary').first().click(); assert.match(await page.locator('.prompt pre').first().innerText(), /守株待兔/);
  assert.equal(await page.locator('video').getAttribute('src'), null, 'gallery does not preload the movies');
  await page.screenshot({ path: path.join(output, 'gallery-desktop.png'), fullPage: true }); result.gallery = true;
  for (const [id, title, duration, seek] of [['stump-claude', '守株待兔', 127, 47], ['well-see-claude', 'We’ll See', 178, 125]]) {
    if (galleryOnly && id !== 'stump-claude') continue;
    const movieFile = path.resolve('public/movies', id + '.mp4'), size = (await stat(movieFile)).size;
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate', '-of', 'json', movieFile], { encoding: 'utf8', windowsHide: true }));
    assert.ok(Math.abs(Number(probe.format.duration) - duration) < 1 / 24);
    assert.ok(probe.streams.some(s => s.codec_type === 'audio' && s.codec_name === 'aac'));
    const button = page.locator(`[data-movie="${id}"] button.poster`);
    await button.click(); await page.waitForFunction(() => document.querySelector('#movie-player').readyState >= 2);
    assert.equal(await page.locator('#theater').getAttribute('open'), ''); assert.match(await page.locator('#watch-title').innerText(), new RegExp(title));
    const playback = await page.locator('#movie-player').evaluate(async v => {
      await v.play(); await new Promise(resolve => setTimeout(resolve, 650)); v.pause();
      return { duration: v.duration, width: v.videoWidth, height: v.videoHeight, advanced: v.currentTime, audioBytes: v.webkitAudioDecodedByteCount, error: v.error?.message ?? null };
    });
    assert.ok(Math.abs(playback.duration - duration) < 1 / 24); assert.ok(playback.advanced > .1);
    assert.equal(playback.width, 1280); assert.equal(playback.height, 720); assert.equal(playback.error, null);
    if (playback.audioBytes !== undefined) assert.ok(playback.audioBytes > 0, 'audio decoded');
    await page.locator('#movie-player').evaluate((v, t) => new Promise(resolve => { v.onseeked = resolve; v.currentTime = t; }), seek);
    await page.screenshot({ path: path.join(output, id + '-player.png') });
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#theater').open);
    assert.equal(await page.locator('#movie-player').getAttribute('src'), null);
    assert.equal(await button.evaluate(b => b === document.activeElement), true, 'focus returns to the film card');
    result.films.push({ id, size, ...playback });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + 'movies.html', { waitUntil: 'domcontentloaded' });
  await page.locator('.poster img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scrolling on mobile');
  await page.screenshot({ path: path.join(output, 'gallery-mobile.png'), fullPage: true }); result.mobile = true;
  if (!galleryOnly) {
    await page.goto(base + 'movies.html?watch=well-see-claude', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#theater').open && document.querySelector('#movie-player').readyState >= 2);
    await page.locator('#close-theater').click(); assert.equal(new URL(page.url()).searchParams.has('watch'), false);
    result.deepLink = true;
  }
  assert.deepEqual(errors, []); result.errors = errors;
  await writeFile(path.join(output, galleryOnly ? 'gallery-review.json' : 'report.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await browser?.close(); }
