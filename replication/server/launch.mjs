// Start the server page in headless Edge behind a Vite dev server. Used by run.mjs (the real server) and the tests.
import { chromium } from '@playwright/test';
import path from 'node:path';
import { createServer } from 'vite';

export async function launchServerPage({ port = 3020, seed = 20261103, difficulty = 'easy', save = null, onConsole = null } = {}) {
  const root = path.resolve(import.meta.dirname, '..', '..');
  const vite = await createServer({
    configFile: false, root, cacheDir: 'node_modules/.vite-replication', logLevel: 'warn',
    optimizeDeps: { entries: ['replication/server.html'], include: ['three'], noDiscovery: true },
    server: { host: '127.0.0.1', port, strictPort: false, hmr: false, watch: { ignored: ['**/outputs/**', '**/replication/runs/**', '**/node_modules/**'] } },
  });
  await vite.listen();
  const base = vite.resolvedUrls.local[0].replace(/\/$/, '');
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--js-flags=--max-old-space-size=8192'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); onConsole?.('pageerror', e.message); });
  page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); onConsole?.('error', m.text()); } });
  // Other work in the repository must not hot-reload the server mid-run.
  await page.route('**/@vite/client', r => r.fulfill({ contentType: 'application/javascript', body: 'export const injectQuery=(u,q)=>u+(u.includes("?")?"&":"?")+q;export const createHotContext=()=>({accept(){},prune(){},dispose(){},on(){}});export const updateStyle=()=>{};export const removeStyle=()=>{};' }));
  await page.goto(`${base}/replication/server.html`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.pageReady, null, { timeout: 180000 });
  const started = await page.evaluate(o => window.startServer(o), { seed, difficulty, save });
  return {
    page, errors, started,
    async close() { await browser.close().catch(() => {}); await vite.close().catch(() => {}); },
  };
}
