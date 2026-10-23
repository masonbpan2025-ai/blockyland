// A village's worth of mobs around the player, with mob level of detail (src/mobLod.js) on and off.
//
// The crowd is about 70 mobs within 20 blocks (villagers, iron golems, cats and farm animals) on top of the ~80-120 the
// world spawned further out. The settings are switched off and on three times in the same page, alternating, so slow
// drift on a shared machine does not favour either; each measurement is a median over the frames of all three rounds.
// The frame is timed with a 1x1 readPixels after it, so GPU work counts.
//
//   npx playwright test -c playwright.graphics.config.js mobCrowd
import { test, expect } from '@playwright/test';

test('mob level of detail cuts far-mob updates in a crowd, and never makes the mob update, the draw calls or the frame worse', async ({ page }) => {
  test.setTimeout(600000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.game?.ui, null, { timeout: 180000 });
  await page.click('#btn-start-new-world');
  await expect(page.locator('#world-biome-modal')).toBeVisible({ timeout: 20000 });
  await page.click('#btn-create-world-confirm');
  await page.waitForFunction(() => window.game.worldReady && window.game.lifecycle?.phase === 'ready', null, { timeout: 180000 });

  const result = await page.evaluate(async () => {
    const g = window.game;
    const frame = () => new Promise(requestAnimationFrame);
    const p0 = g.player.position;
    let k = 0;
    for (const [type, n] of [['villager', 30], ['iron_golem', 3], ['cat', 6], ['cow', 8], ['sheep', 8], ['chicken', 10], ['pig', 6]]) {
      for (let i = 0; i < n; i++, k++) {
        const a = k * 2.399, r = 4 + (k % 9) * 2;
        const x = Math.floor(p0.x + Math.cos(a) * r) + 0.5, z = Math.floor(p0.z + Math.sin(a) * r) + 0.5;
        let y = 63;
        while (y > 1 && !g.world.getVoxel(Math.floor(x), y - 1, Math.floor(z))) y--;
        g.mobs.spawnMob(type, x, y, z);
      }
    }
    for (let i = 0; i < 120; i++) await frame();

    const gl = g.renderer.getContext();
    const pixel = new Uint8Array(4);
    const original = Object.getPrototypeOf(g).animate;
    const samples = { off: { frame: [], mobs: [], calls: [], far: [] }, on: { frame: [], mobs: [], calls: [], far: [] } };
    const setAll = (on) => { g.mobs.farMobThrottle = on; g.mobs.unseenAnimationSkip = on; g.mobDetailLod = on; };
    const record = (mode, frames) => new Promise((resolve) => {
      const s = samples[mode];
      let mobMs = 0, farCalls = 0;
      const update = g.mobs.update, behaviour = g.mobs.updateMobTypeBehavior;
      g.mobs.update = function (...a) { const t = performance.now(); try { return update.apply(this, a); } finally { mobMs = performance.now() - t; } };
      g.mobs.updateMobTypeBehavior = function (mob, ...a) {
        const p = g.player.position, m = mob.mesh.position;
        if ((m.x - p.x) ** 2 + (m.z - p.z) ** 2 > 32 * 32) farCalls++;
        return behaviour.call(this, mob, ...a);
      };
      g.renderer.info.autoReset = false;
      let n = 0;
      g.animate = function () {
        g.renderer.info.reset();
        farCalls = 0;
        const t0 = performance.now();
        original.call(this);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        s.frame.push(performance.now() - t0); s.mobs.push(mobMs); s.calls.push(g.renderer.info.render.calls); s.far.push(farCalls);
        if (++n >= frames) {
          g.animate = original; g.mobs.update = update; g.mobs.updateMobTypeBehavior = behaviour; g.renderer.info.autoReset = true;
          resolve();
        }
      };
    });
    for (let round = 0; round < 3; round++) {
      for (const mode of ['off', 'on']) {
        setAll(mode === 'on');
        for (let i = 0; i < 30; i++) await frame();
        await record(mode, 120);
      }
    }
    setAll(true);
    const median = (values) => [...values].sort((a, b) => a - b)[values.length >> 1];
    const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
    const summary = (s) => ({ frameMs: median(s.frame), mobUpdateMs: median(s.mobs), drawCalls: median(s.calls), farUpdatesPerFrame: mean(s.far) });
    return { mobs: g.mobs.mobs.length, off: summary(samples.off), on: summary(samples.on) };
  });

  console.log(`${result.mobs} mobs`);
  console.log('off', JSON.stringify(result.off));
  console.log('on ', JSON.stringify(result.on));
  const { off, on } = result;
  expect(result.mobs, "a crowd: the ~70 added and what the world spawned").toBeGreaterThan(120);
  // How much a far mob skips depends on the frame rate: about twelve updates a second, and never more than 0.1s of
  // simulation in one step. At 60fps that is one frame in five; at this headless laptop's ~20fps it is every other.
  expect(on.farUpdatesPerFrame, 'far mobs are updated on fewer frames').toBeLessThan(off.farUpdatesPerFrame * 0.8);
  expect(on.mobUpdateMs, `mob update ${on.mobUpdateMs.toFixed(2)}ms on, ${off.mobUpdateMs.toFixed(2)}ms off`).toBeLessThanOrEqual(off.mobUpdateMs * 1.02);
  expect(on.drawCalls, `${on.drawCalls} draw calls on, ${off.drawCalls} off`).toBeLessThanOrEqual(off.drawCalls * 1.03); // mobs wander in and out of view: about 1% either way
  expect(on.frameMs, `frame ${on.frameMs.toFixed(1)}ms on, ${off.frameMs.toFixed(1)}ms off`).toBeLessThanOrEqual(off.frameMs * 1.05);
  expect(errors).toEqual([]);
});
