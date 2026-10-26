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

test('Voxel Dash 3D view: chosen on the level page (2D by default), its camera angle turned in a preview, the same run drawn in 3D from that angle', async ({ page }) => {
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
  const shown = () => page.evaluate(() => { const r = document.querySelector('[data-game-mod="voxel_dash"]').shadowRoot; return { flat: !r.querySelector('canvas.world:not(.world3d)').hidden, deep: !r.querySelector('canvas.world3d').hidden, view: window.game.modRuntime.view }; });

  // The level page opens on the side view, even after 3D was chosen on an earlier visit; no angle preview.
  expect(await shown()).toEqual({ flat: true, deep: false, view: '2d' });
  await expect(shadow('.anglepick')).toBeHidden();
  await expect(shadow('[data-view="2d"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(shadow('[data-view="3d"]')).toHaveAttribute('aria-pressed', 'false');
  // Chosen on the level page, beside Play: the 3D canvas replaces the side view once it has loaded.
  await shadow('[data-view="3d"]').click();
  await expect.poll(shown, { timeout: 30000 }).toEqual({ flat: false, deep: true, view: '3d' });
  await expect(shadow('[data-view="3d"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(shadow('[data-view="2d"]')).toHaveAttribute('aria-pressed', 'false');

  // Beside the 3D button, a small window showing the creeper head on the track from the camera's angle.
  await expect(shadow('.anglepick')).toBeVisible();
  const previewDrawn = () => page.evaluate(() => {
    const c = document.querySelector('[data-game-mod="voxel_dash"]').shadowRoot.querySelector('.angle-preview');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lo = 255, hi = 0;
    for (let i = 0; i < d.length; i += 4 * 97) { const v = d[i] + d[i + 1] + d[i + 2]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
    return hi - lo;
  });
  await expect.poll(previewDrawn, { timeout: 15000 }).toBeGreaterThan(60);
  const before = await page.evaluate(() => window.game.modRuntime.cameraAngle);
  // Dragging in it turns the world: right and down -- the camera goes round to the left and up.
  const box = await shadow('.angle-preview').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  const turned = await page.evaluate(() => window.game.modRuntime.cameraAngle);
  expect(turned.azimuth).toBeLessThan(before.azimuth - 0.3);
  expect(turned.elevation).toBeGreaterThan(before.elevation + 0.1);
  // The wheel zooms; the angle is remembered.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 300);
  const zoomed = await page.evaluate(() => window.game.modRuntime.cameraAngle);
  expect(zoomed.distance).toBeGreaterThan(turned.distance);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('voxel_dash:camera')))).toEqual(zoomed);

  // A run in 3D: the same simulation -- a press still jumps at once -- and the 3D canvas draws every frame, cheaply.
  await shadow('[data-action="start"]').click();
  await page.waitForFunction(() => window.game.modRuntime.state?.phase === 'play');
  const jump = await page.evaluate(async () => {
    const rt = window.game.modRuntime;
    await new Promise((r) => setTimeout(r, 300));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    await new Promise((r) => setTimeout(r, 12));
    rt.update(0);
    const after = rt.game.snapshot();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    return after.vy;
  });
  expect(jump, 'rising 12 ms after the press').toBeGreaterThan(300);
  const run = await page.evaluate(async () => {
    const rt = window.game.modRuntime, render = rt.render.bind(rt), costs = [];
    rt.render = (...a) => { const t0 = performance.now(); render(...a); costs.push(performance.now() - t0); };
    await new Promise((r) => setTimeout(r, 2000));
    rt.render = render;
    const canvas = document.querySelector('[data-game-mod="voxel_dash"]').shadowRoot.querySelector('canvas.world3d');
    const sorted = [...costs].sort((a, b) => a - b);
    return { frames: costs.length, median: sorted[Math.floor(sorted.length / 2)], width: canvas.width, height: canvas.height };
  });
  // The test browser draws in software (no graphics chip) on a shared machine, so the frame rate here is not the
  // game's; the cost of building each frame is.
  expect(run.frames, 'frames drawn in two seconds').toBeGreaterThan(10);
  expect(run.width * run.height, 'the 3D canvas is sized to the page').toBeGreaterThan(100000);
  expect(run.median, `median 3D frame cost ${run.median.toFixed(2)} ms`).toBeLessThan(8);
  // The view is chosen with the level, not in the middle of a run: no switch in the HUD, and V does nothing there.
  await expect(shadow('.hud [data-view], .hud .view')).toHaveCount(0);
  await page.keyboard.press('KeyV');
  expect((await shown()).view).toBe('3d');
  // Played from the chosen angle.
  expect(await page.evaluate(() => window.game.modRuntime.cameraAngle)).toEqual(zoomed);
  // Back on the level page, V switches back to the side view, and the preview closes.
  await page.keyboard.press('KeyP');
  await shadow('.dialog [data-action="menu"]').click();
  await page.waitForFunction(() => window.game.modRuntime.state?.phase === 'menu');
  await page.keyboard.press('KeyV');
  await expect.poll(shown).toEqual({ flat: true, deep: false, view: '2d' });
  await expect(shadow('[data-view="2d"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(shadow('.anglepick')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('voxel_dash:view')), 'the view is not carried to the next visit').toBeNull();
  expect(errors).toEqual([]);
});
