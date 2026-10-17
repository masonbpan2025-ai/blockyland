import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = (process.env.MOVIES_URL ?? 'http://127.0.0.1:3000/').replace(/\/?$/, '/');
const galleryOnly = process.argv.includes('--gallery-only');
const output = path.resolve('test-results/movies'); await mkdir(output, { recursive: true });
const errors = [], result = { navigation: false, gallery: false, mobile: false, films: [] };
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // Movies must be reachable immediately, including before the game has loaded.
  await page.route('**/src/main.js', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('**/assets/game-*.js', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  // Only check that the right YouTube film is embedded; the YouTube player itself is not loaded.
  await page.route(/youtube(-nocookie)?\.com|ytimg\.com/, r => r.fulfill({ contentType: 'text/html', body: '' }));
  await page.route('**/@vite/client', r => r.fulfill({ contentType: 'application/javascript', body: 'export const injectQuery=(u,q)=>u+"?"+q;export const createHotContext=()=>({accept(){},prune(){},dispose(){},on(){}});export const updateStyle=()=>{};export const removeStyle=()=>{};' }));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Movies', exact: true }).click(); await page.waitForURL(/\/movies(\.html)?(\?|$)/); result.navigation = true; // Cloudflare Pages serves it at /movies
  await page.locator('.movie-card').last().waitFor(); assert.equal(await page.locator('.movie-card').count(), 3);
  await page.locator('.poster img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
  assert.match(await page.locator('.intro').innerText(), /demonstration of storytelling/);
  await page.locator('.prompt summary').first().click(); assert.match(await page.locator('.prompt pre').first().innerText(), /守株待兔/);
  assert.equal(await page.locator('.player iframe').count(), 0, 'the gallery does not load the YouTube players up front');
  assert.ok(await page.evaluate(() => document.querySelector('.collection').compareDocumentPosition(document.querySelector('.shows')) & Node.DOCUMENT_POSITION_FOLLOWING), 'the films come first');
  await page.screenshot({ path: path.join(output, 'gallery-desktop.png'), fullPage: true }); result.gallery = true;
  for (const [id, youtube] of [['stump-claude', 'mk7O2zUk1_c'], ['well-see-claude', 'D7qG6BPl-jI'], ['volume-layers', 'tuoBzEWgPTI']]) {
    if (galleryOnly && id !== 'stump-claude') continue;
    const card = page.locator(`[data-movie="${id}"]`);
    assert.equal(await card.locator('.film-links a').first().getAttribute('href'), `https://www.youtube.com/watch?v=${youtube}`);
    await card.locator('button.poster').click();
    const src = await card.locator('.player iframe').getAttribute('src');
    assert.ok(src.startsWith(`https://www.youtube-nocookie.com/embed/${youtube}?`) && src.includes('autoplay=1'), src);
    assert.equal(new URL(page.url()).searchParams.get('watch'), id);
    result.films.push({ id, youtube, embed: src });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + 'movies.html', { waitUntil: 'domcontentloaded' });
  await page.locator('.poster img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scrolling on mobile');
  await page.screenshot({ path: path.join(output, 'gallery-mobile.png'), fullPage: true }); result.mobile = true;
  if (!galleryOnly) {
    await page.goto(base + 'movies.html?watch=well-see-claude', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-movie="well-see-claude"] .player iframe').waitFor();
    result.deepLink = true;
  }
  assert.deepEqual(errors, []); result.errors = errors;
  await writeFile(path.join(output, galleryOnly ? 'gallery-review.json' : 'report.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await browser?.close(); }
