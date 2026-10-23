// Performance Mode and the render distance button, clicked in the pause menu of a real game.
//
// The render distance button was on the pause menu before this and did nothing (it said "4 Chunks" while the game drew
// 8). Both buttons are clicked here the way a player clicks them, and each must change what is drawn, be remembered
// across a reload, and make the frame cheaper. The frame is timed with a 1x1 readPixels after each one, so the GPU's
// work counts; the comparison is between the two settings in the same page, on the same machine.
//
//   npx playwright test -c playwright.graphics.config.js
import { test, expect } from '@playwright/test';

async function startWorld(page, errors) {
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.game?.ui, null, { timeout: 180000 });
  await page.click('#btn-start-new-world');
  await expect(page.locator('#world-biome-modal')).toBeVisible({ timeout: 20000 });
  await page.click('#btn-create-world-confirm');
  await page.waitForFunction(() => window.game.worldReady && window.game.lifecycle?.phase === 'ready', null, { timeout: 180000 });
  expect(errors).toEqual([]);
}

async function openPauseMenu(page) {
  // Headless has no pointer lock, so Escape reaches the game and opens the menu, as it does for a player whose mouse
  // is not captured.
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-menu')).toBeVisible();
}

/** Median work per frame (simulation + render + GPU) over `frames` frames, after letting streaming settle. */
async function frameWork(page, frames = 120) {
  return page.evaluate(async (frames) => {
    const g = window.game;
    for (let i = 0; i < 240; i++) await new Promise(requestAnimationFrame);
    const gl = g.renderer.getContext();
    const pixel = new Uint8Array(4);
    const proto = Object.getPrototypeOf(g);
    const original = proto.animate;
    const work = [];
    await new Promise((resolve) => {
      g.animate = function () {
        const t0 = performance.now();
        original.call(this);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        work.push(performance.now() - t0);
        if (work.length >= frames) { g.animate = original; resolve(); }
      };
    });
    work.sort((a, b) => a - b);
    return work[Math.floor(work.length / 2)];
  }, frames);
}

test('Performance Mode and the render distance button work, are remembered, and make the frame cheaper', async ({ page }) => {
  test.setTimeout(600000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Start from the defaults, once: the reload at the end must find what this test saved.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('graphics-test-started')) return;
    sessionStorage.setItem('graphics-test-started', '1');
    localStorage.removeItem('blockyland-performance-mode');
    localStorage.removeItem('blockyland-render-distance');
  });
  await startWorld(page, errors);

  const before = await page.evaluate(() => ({ ratio: window.game.renderer.getPixelRatio(), distance: window.game.renderDistance, edge: window.game.shader.edgeAntialiasing }));
  expect(before).toEqual({ ratio: 1.25, distance: 8, edge: true });
  const slow = await frameWork(page);

  await openPauseMenu(page);
  await expect(page.locator('#btn-distance')).toHaveText('Render Distance: 8 Chunks');
  await page.click('#btn-performance');
  await expect(page.locator('#btn-performance')).toHaveText('Performance Mode: ON');
  // 8 -> 10 -> 4 -> 6.
  for (let i = 0; i < 3; i++) await page.click('#btn-distance');
  await expect(page.locator('#btn-distance')).toHaveText('Render Distance: 6 Chunks');

  const after = await page.evaluate(async () => {
    const g = window.game;
    for (let i = 0; i < 30; i++) await new Promise(requestAnimationFrame);
    const pcx = Math.floor(g.player.position.x / 16), pcz = Math.floor(g.player.position.z / 16);
    const drawnBeyond = [...g.world.chunks.values()].filter((c) => c.opaqueMesh && Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > 6).length;
    return { ratio: g.renderer.getPixelRatio(), distance: g.renderDistance, edge: g.shader.edgeAntialiasing, meshRadius: g.streamer.meshRadius, fogFar: g.scene.fog.far, drawnBeyond };
  });
  expect(after.ratio).toBe(1);
  expect(after.edge).toBe(false);
  expect(after.distance).toBe(6);
  expect(after.meshRadius).toBe(6);
  expect(after.fogFar, 'the fog moved in with the distance').toBeLessThanOrEqual(6 * 16);
  expect(after.drawnBeyond, 'nothing beyond 6 chunks is drawn').toBe(0);

  await page.evaluate(() => window.game.ui.closeAllModals());
  const fast = await frameWork(page);
  console.log(`median frame: ${slow.toFixed(1)}ms as the game was, ${fast.toFixed(1)}ms with Performance Mode and 6 chunks`);
  expect(fast, `${fast.toFixed(1)}ms against ${slow.toFixed(1)}ms`).toBeLessThan(slow * 0.9);

  // Remembered: a reload and a new world start with both settings.
  await page.reload({ waitUntil: 'commit' });
  await page.waitForFunction(() => window.game?.ui, null, { timeout: 180000 });
  const restored = await page.evaluate(() => ({ ratio: window.game.renderer.getPixelRatio(), distance: window.game.renderDistance, edge: window.game.shader?.edgeAntialiasing }));
  expect(restored).toEqual({ ratio: 1, distance: 6, edge: false });
  expect(errors).toEqual([]);
});
