// The terrain worker in a real browser: it loads as a module worker, is checked against the game during the world's
// own loading, and takes terrain generation off the frame.
//
// The world is started the way a player starts it (Generate New World, then Create World). The player then sprints
// into new land twice: once with the worker, once with it switched off, in different directions so both walks meet
// fresh terrain. For each, the time the streamer's generation step took on the main thread is recorded for every frame
// that brought a chunk into the world -- the cost the player feels as a hitch at a chunk border. The two walks run in
// the same page, one after the other, so they share the machine's conditions; the assertion is a ratio.
//
//   npx playwright test -c playwright.terrainWorker.config.js
import { test, expect } from '@playwright/test';

const CHUNKS_WALKED = 5;

async function startWorld(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.game?.ui, null, { timeout: 180000 });
  await page.click('#btn-start-new-world');
  await expect(page.locator('#world-biome-modal')).toBeVisible({ timeout: 20000 });
  await page.click('#btn-create-world-confirm');
  await page.waitForFunction(() => window.game.worldReady && window.game.lifecycle?.phase === 'ready', null, { timeout: 180000 });
  return errors;
}

/** Sprint `chunks` chunks along (dx, dz), then wait until everything in range exists. Returns the measurements. */
async function walk(page, { dx, dz, chunks, worker }) {
  return page.evaluate(async ({ dx, dz, chunks, worker }) => {
    const g = window.game;
    const s = g.streamer;
    g.terrainWorker.setEnabled(worker);
    const original = s.runGeneration;
    const busy = [];
    s.runGeneration = function (...args) {
      const before = g.world.chunks.size;
      const t0 = performance.now();
      try { return original.apply(this, args); } finally {
        const ms = performance.now() - t0;
        if (g.world.chunks.size > before) busy.push(ms);
      }
    };
    // Terrain generation itself on the main thread: what the worker exists to take away.
    const generate = g.world.generateChunkTerrain;
    let generatingMs = 0;
    g.world.generateChunkTerrain = function (...args) {
      const t0 = performance.now();
      try { return generate.apply(this, args); } finally { generatingMs += performance.now() - t0; }
    };
    const adoptedBefore = s.stats.adopted;
    const p = g.player;
    p.gamemode = 'creative'; p.isFlying = true;
    const y = 52;
    const start = { x: p.position.x, z: p.position.z };
    const distance = chunks * 16;
    const frames = [];
    await new Promise((resolve) => {
      let last = performance.now();
      const step = () => {
        const now = performance.now();
        frames.push(now - last);
        const dt = Math.min(0.1, (now - last) / 1000); last = now;
        p.velocity.set(0, 0, 0);
        const travelled = Math.hypot(p.position.x - start.x, p.position.z - start.z);
        if (travelled < distance) { p.position.x += dx * 5.6 * dt; p.position.z += dz * 5.6 * dt; }
        p.position.y = y;
        const pcx = Math.floor(p.position.x / 16), pcz = Math.floor(p.position.z / 16), r = s.generateRadius;
        let missing = 0;
        for (let cx = pcx - r; cx <= pcx + r; cx++) for (let cz = pcz - r; cz <= pcz + r; cz++) if (!g.world.getChunk(cx, cz)) missing++;
        if (travelled >= distance && missing === 0) { resolve(); return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    s.runGeneration = original;
    g.world.generateChunkTerrain = generate;
    const sorted = [...busy].sort((a, b) => a - b);
    const gaps = frames.slice(5).sort((a, b) => a - b);
    return {
      chunkFrames: busy.length,
      medianMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
      p90Ms: sorted[Math.floor(sorted.length * 0.9)] ?? 0,
      worstMs: sorted.at(-1) ?? 0,
      generatingMs,
      adopted: s.stats.adopted - adoptedBefore,
      frameGapP95: gaps[Math.floor(gaps.length * 0.95)] ?? 0,
      workerState: g.terrainWorker.state,
    };
  }, { dx, dz, chunks, worker });
}

test('the terrain worker is checked against the game and takes chunk generation off the frame', async ({ page }) => {
  test.setTimeout(600000);
  const errors = await startWorld(page);

  // The worker is started as the world begins loading and checked against chunks the loading screen generated.
  await page.waitForFunction(() => ['ready', 'failed'].includes(window.game.terrainWorker?.state), null, { timeout: 180000 });
  const status = await page.evaluate(() => ({ state: window.game.terrainWorker.state, failure: window.game.terrainWorker.failure }));
  expect(status.failure, 'the worker reproduced the game\'s own chunks').toBeNull();
  expect(status.state).toBe('ready');

  const withWorker = await walk(page, { dx: 1, dz: 0, chunks: CHUNKS_WALKED, worker: true });
  const withoutWorker = await walk(page, { dx: 0, dz: 1, chunks: CHUNKS_WALKED, worker: false });
  console.log('with the worker   ', JSON.stringify(withWorker));
  console.log('without the worker', JSON.stringify(withoutWorker));

  expect(withWorker.workerState).toBe('ready');
  expect(withWorker.adopted, 'the worker made the new chunks').toBeGreaterThan(CHUNKS_WALKED * 10);
  expect(withoutWorker.adopted, 'switched off, it made none').toBe(0);
  expect(withoutWorker.chunkFrames, 'the walk without the worker generated chunks').toBeGreaterThan(CHUNKS_WALKED * 10);
  // The main thread's cost on the frames that brought chunks in.
  expect(withWorker.medianMs, `median ${withWorker.medianMs.toFixed(1)}ms with the worker, ${withoutWorker.medianMs.toFixed(1)}ms without`)
    .toBeLessThan(withoutWorker.medianMs * 0.5);
  // Terrain generation is off the main thread. This replaced a check that the WORST chunk frame halved: that held while
  // generating a chunk was most of such a frame, but generation is now ~4ms, and the worst frames are work every new
  // chunk does on the main thread either way (the relight for the animal pass, a structure's villagers, water running
  // in from a neighbour), which the worker was never meant to take.
  expect(withWorker.generatingMs, `${withWorker.generatingMs.toFixed(0)}ms generating terrain on the main thread with the worker, ${withoutWorker.generatingMs.toFixed(0)}ms without`)
    .toBeLessThan(withoutWorker.generatingMs * 0.1);
  expect(errors, 'no uncaught errors').toEqual([]);
});
