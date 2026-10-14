// Browser regression checks on the actual lightweight Inspector pages.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-resource-showcase',
  optimizeDeps: { entries: ['src/resourceDebug.js'] },
  server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const root = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.goto(`${root}/block-debug.html?resource=block%3A22`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.resourceInspector?.ready && document.getElementById('badge').textContent.startsWith('Furnace'), { timeout: 60000 });
  await page.locator('#showcase').click();
  await page.waitForFunction(() => window.resourceInspector.run?.current?.id === 'view-west', { timeout: 60000 });
  assert.equal(await page.locator('#showcase-stop').isEnabled(), true);
  await page.screenshot({ path: 'docs/artifacts/furnace-showcase-side.png' });
  await page.waitForFunction(() => window.resourceInspector.run?.current?.id === 'view-bottom', { timeout: 20000 });
  await page.screenshot({ path: 'docs/artifacts/furnace-showcase-bottom.png' });
  await page.waitForFunction(() => window.resourceInspector.run?.current?.id === 'smelt', { timeout: 20000 });
  await page.screenshot({ path: 'docs/artifacts/furnace-showcase-smelting.png' });
  assert.ok((await page.locator('#showcase-telemetry').textContent()).includes('Lit: yes'));
  await page.waitForFunction(() => window.resourceInspector.run && !window.resourceInspector.run.running, { timeout: 30000 });
  const furnace = await page.evaluate(() => window.resourceInspector.run.results);
  const behavior = furnace.filter(r => r.id.startsWith('view-') || ['load-fuel','ignite','smelt','collect-output','blocked-output','lava-bucket','extinguish','break-contents'].includes(r.id));
  assert.equal(behavior.length, 14);
  assert.deepEqual(behavior.filter(r => r.status !== 'observed'), []);
  await page.screenshot({ path: 'docs/artifacts/furnace-showcase-drops.png' });
  assert.ok((await page.locator('#showcase-telemetry').textContent()).includes('Furnace broken'));
  await page.locator('#showcase').click();
  await page.waitForFunction(() => window.resourceInspector.run?.current?.id === 'ignite', { timeout: 20000 });
  await page.locator('#showcase-stop').click();
  assert.equal(await page.evaluate(() => window.resourceInspector.run), null);
  assert.equal(await page.locator('#showcase').isEnabled(), true);
  // Changing a selection during a run cancels the old simulation too.
  await page.locator('#showcase').click();
  await page.locator('#resource').selectOption('block:55');
  assert.equal(await page.evaluate(() => window.resourceInspector.run), null);
  assert.equal(await page.locator('#showcase-stop').isDisabled(), true);
  await page.goto(`${root}/item-debug.html?resource=coal`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.resourceInspector?.ready && document.getElementById('resource').value === 'coal', { timeout: 60000 });
  await page.locator('#showcase').click();
  await page.waitForFunction(() => window.resourceInspector.run && !window.resourceInspector.run.running, { timeout: 30000 });
  const item = await page.evaluate(() => window.resourceInspector.run.results);
  assert.equal(item.filter(r => r.id.startsWith('view-')).length, 6);
  assert.equal(item.filter(r => r.id.startsWith('view-') && r.status === 'unsupported').length, 6);
  await page.screenshot({ path: 'docs/artifacts/item-showcase-coal.png' });
  assert.equal(await page.locator('#error').textContent(), '');
  assert.deepEqual(errors, []);
  const report = { checks: ['world-mesh sides and bottom', 'eight furnace behaviors', 'live smelting telemetry', 'textured content drops', 'stop and restart', 'selection cancellation', 'Item Inspector showcase', 'visual-only checks explicitly labeled'], furnace, item, errors };
  await writeFile('docs/artifacts/resource-showcase-results.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks, furnaceBehaviors: behavior.length, errors }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
