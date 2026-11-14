// Render a few frames of the replication film to PNGs, to check shots without the full render.
//   node replication/film/shots.mjs <outDir> <t1> <t2> ...
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
const [outDir, ...times] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const server = await createServer({ server: { port: 3127, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:3127/replication-film.html', { waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction(() => window.pilot?.ready || /could not load/.test(document.querySelector('#stage p')?.textContent ?? ''), null, { timeout: 300000 });
const status = await page.evaluate(() => document.querySelector('#stage p')?.textContent);
if (status) console.log('status:', status);
console.log('duration', await page.evaluate(() => window.pilot?.story?.duration));
for (const t of times) {
  const info = await page.evaluate((t) => { try { return window.pilot.renderFrame(t); } catch (e) { return 'ERR ' + e.stack; } }, Number(t)); if (String(info).startsWith('ERR')) { console.log(info); break; }
  const b64 = await page.evaluate((t) => window.pilot.capture(t), Number(t));
  writeFileSync(`${outDir}/f${String(t).replace('.', '_')}.jpg`, Buffer.from(b64, 'base64'));
  console.log(t, JSON.stringify(info));
}
console.log('errors:', errors.slice(0, 6));
await browser.close(); await server.close();
