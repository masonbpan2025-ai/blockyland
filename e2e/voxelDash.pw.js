// Voxel Dash in a real browser, opened from the start screen: a dash game cannot lag. Every displayed frame shows the
// course where it is at that moment (not a 30-a-second state held over several frames), a press jumps within one
// 240 Hz physics tick, the canvas's backing store is bounded, and drawing a frame stays cheap.
import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 30000 });

test('Voxel Dash: smooth every frame, a jump at once, a bounded canvas, a cheap frame', async ({ page }) => {
  test.setTimeout(300000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.game?.ui, null, { timeout: 240000 });
  await page.click('#btn-start-designed-world');
  await page.waitForFunction(() => /Voxel Dash/.test(document.getElementById('map-designed-list')?.textContent ?? ''), null, { timeout: 60000 });
  await page.locator('#map-designed-list > *', { hasText: 'Voxel Dash' }).first().getByRole('button').first().click();
  await page.waitForFunction(() => window.game?.modRuntime?.render && document.querySelector('[data-game-mod="voxel_dash"]'), null, { timeout: 120000 });
  const shadow = (sel) => page.locator('[data-game-mod="voxel_dash"]').locator(sel);
  await shadow('[data-action="start"]').click();
  await page.waitForFunction(() => window.game.modRuntime.state?.phase === 'play');

  // A press jumps within a physics tick of the moment it happens, not at the next frame or worker tick.
  const jump = await page.evaluate(async () => {
    const rt = window.game.modRuntime;
    await new Promise((r) => setTimeout(r, 300));
    const before = rt.game.snapshot();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    await new Promise((r) => setTimeout(r, 12));
    rt.update(0);
    const after = rt.game.snapshot();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    return { grounded: before.grounded, vy: after.vy, phase: after.phase };
  });
  expect(jump.grounded).toBe(true);
  expect(jump.vy, 'rising 12 ms after the press').toBeGreaterThan(300);

  // Two seconds of play, pressing now and then (a press after a death retries): what each frame draws, and its cost.
  const run = await page.evaluate(async () => {
    const rt = window.game.modRuntime, render = rt.render.bind(rt), drawn = [], costs = [];
    rt.render = (...a) => {
      const t0 = performance.now(); render(...a); costs.push(performance.now() - t0);
      const s = rt.state;
      if (s?.phase === 'play') drawn.push(s.x + (s.speed ?? 0) * Math.min(s.lag ?? 0, 1 / 240));
      else drawn.push(null);
    };
    const press = setInterval(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })), 60); }, 400);
    await new Promise((r) => setTimeout(r, 2000));
    clearInterval(press);
    rt.render = render;
    let pairs = 0, moved = 0;
    for (let i = 1; i < drawn.length; i++) if (drawn[i] !== null && drawn[i - 1] !== null && drawn[i] >= drawn[i - 1]) { pairs++; if (drawn[i] > drawn[i - 1]) moved++; }
    const sorted = [...costs].sort((a, b) => a - b);
    const canvas = document.querySelector('[data-game-mod="voxel_dash"]').shadowRoot.querySelector('canvas');
    return { frames: costs.length, pairs, moved, median: sorted[Math.floor(sorted.length / 2)], width: canvas.width };
  });
  expect(run.pairs, 'frames drawn while running').toBeGreaterThan(20);
  expect(run.moved / run.pairs, 'every frame shows the course moved').toBeGreaterThan(0.97);
  expect(run.width, 'the backing store is bounded').toBeLessThanOrEqual(1920);
  expect(run.median, `median frame cost ${run.median.toFixed(2)} ms`).toBeLessThan(6);
  expect(errors).toEqual([]);
});
