// Render the 1500 Players key frames to outputs/civ-keyframes/ (one PNG each) and a contact sheet.
//   node scripts/render-civ-keyframes.mjs [--set=weddings] [id ...]   (weddings → outputs/civ-weddings-keyframes/)
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

const set = process.argv.find(a => a.startsWith('--set='))?.slice(6) ?? 'civ', only = process.argv.slice(2).filter(a => !a.startsWith('--'));
const output = path.resolve(set === 'civ' ? 'outputs/civ-keyframes' : `outputs/civ-${set}-keyframes`); await mkdir(output, { recursive: true });
const server = await createServer({ configFile: false, root: path.resolve('.'), cacheDir: 'node_modules/.vite-civ-keyframes', optimizeDeps: { entries: ['civ-keyframes.html'], include: ['three'], noDiscovery: true }, logLevel: 'warn', server: { host: '127.0.0.1', port: 3013, hmr: false, watch: { ignored: ['**/outputs/**'] } } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1300, height: 760 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(server.resolvedUrls.local[0] + 'civ-keyframes.html?set=' + set, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => window.kf?.ready, null, { timeout: 180000 }).catch(e => { console.error(errors.join('\n')); throw e; });
  const ids = (await page.evaluate(() => window.kf.ids)).filter(id => !only.length || only.includes(id));
  for (const id of ids) {
    const t0 = Date.now();
    const png = await page.evaluate(id => window.kf.render(id), id);
    await writeFile(path.join(output, `${id}.png`), Buffer.from(png, 'base64'));
    console.log(`${id}  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  // the review page (weddings-review.html) reads the frame list and titles from here
  const meta = await page.evaluate(() => ({ ids: window.kf.ids, titles: window.kf.titles, times: window.kf.times }));
  await writeFile(path.join(output, 'frames.json'), JSON.stringify(meta.ids.map(id => ({ id, title: meta.titles[id], time: meta.times[id] })), null, 1));
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
} finally { await browser?.close(); await server.close(); }
