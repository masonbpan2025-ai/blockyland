// Repeatable real-browser benchmark. Start Vite, then run:
// node scripts/bench-reef-browser.mjs [http://127.0.0.1:3027] [--before] [--output path.json]
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const before = process.argv.includes('--before');
const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0 && !process.argv[outputIndex+1]) throw new Error('--output requires a JSON path');
const url = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:3027';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  // An edit in another working session must not hot-reload a measured world.
  await page.routeWebSocket('**/*', socket => socket.close());
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    let state = 4242;
    Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.game?.heldItemRenderer && window.game?.targetBoxMesh, { timeout: 120000 });
  const result = await page.evaluate(async before => {
    const g = window.game;
    const { JavaRandom } = await import('/src/spawning/spawnRandom.js');
    const { BLOCKS, BLOCK_DEFS } = await import('/src/blocks.js');
    if (before) {
      const { ChunkMesher } = await import('/tests/fixtures/reefBefore/mesher.js');
      const { WaterSimulation } = await import('/tests/fixtures/reefBefore/waterSimulation.js');
      const { originalMobCollisions, originalAquaticMob } = await import('/tests/helpers/reefMobBaseline.js');
      const onDisplace = g.world.water.onDisplace;
      g.mesher = new ChunkMesher(g.mesher.tm);
      g.world.water = new WaterSimulation(g.world); g.world.water.onDisplace = onDisplace;
      g.world.getWaterLevel = function(x,y,z) {
        if(this.getVoxel(x,y,z)!==BLOCKS.WATER) return -1;
        const c=this.getChunk(Math.floor(x/16),Math.floor(z/16));
        return c ? c.waterLevels[c.getIndex(x&15,y,z&15)] : -1;
      };
      g.mobs.applyMobCollisions = originalMobCollisions;
      g.mobs.updateAquaticMob = originalAquaticMob;
    }
    // Instrument actual production methods. Calls are nested, so timings are inclusive.
    let samples = {};
    const instrument = (object, name, label) => {
      if (!object?.[name]) return;
      const original = object[name];
      object[name] = function (...args) {
        const start = performance.now();
        try { return original.apply(this, args); }
        finally { (samples[label] ||= []).push(performance.now() - start); }
      };
    };
    for (const [object, name, label] of [
      [g.mobs, 'update', 'mobs'], [g.mobs, 'applyMobCollisions', 'collisions'],
      [g.mobs, 'updateAquaticMob', 'aquatic'], [g.spawnManager, 'update', 'spawning'],
      [g.world.water, 'tick', 'waterTick'], [g.world.water, 'initChunk', 'waterInit'],
      [g.mesher, 'meshChunk', 'mesh'], [g.world.light, 'relightChunk', 'relight'],
      [g, 'updateRaycast', 'raycast'], [g.shader, 'render', 'render'],
      [g.streamer, 'update', 'stream'], [g, 'refreshDirtyChunks', 'dirtyMesh'],
    ]) instrument(object, name, label);
    g.applyWorldSettings({ gameMode: 'creative', dataPackPreset: 'reef_life' });
    g.world.reseed(12345, 'warm_ocean');
    if (g.spawnManager) g.spawnManager.random = new JavaRandom(4242);
    const start = performance.now();
    await g.generateNewWorld();
    const generationMs = performance.now() - start;
    // Pause automatic simulation and run controlled ticks, with rAF for frame measurements.
    g.animate = () => {}; // Stop the scheduled loop; only the measured loop renders.
    await new Promise(requestAnimationFrame);
    document.getElementById('start-overlay').style.display = 'none';
    const count = () => {
      let plants = 0, coral = 0;
      for (const c of g.world.chunks.values()) for (const id of c.voxels) {
        if (BLOCK_DEFS[id]?.waterPlant) plants++;
        if (BLOCK_DEFS[id]?.name?.includes('Coral Block')) coral++;
      }
      return { plants, coral, mobs: g.mobs.mobs.length, chunks: g.world.chunks.size };
    };
    const initial = count();
    const summary = values => {
      const sorted = [...values].sort((a,b) => a-b);
      return { calls: sorted.length, mean: values.reduce((a,b)=>a+b,0)/(values.length||1),
        p50: sorted[Math.floor(sorted.length*.5)]||0, p95: sorted[Math.floor(sorted.length*.95)]||0,
        max: sorted.at(-1)||0, total: values.reduce((a,b)=>a+b,0) };
    };
    const generationTimings = Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,summary(v)]));
    const scenarios = [];
    for (const [name, y] of [['surface', g.world.seaLevel + 2], ['underwater', g.world.seaLevel - 4]]) {
      g.player.position.set(8,y,8); g.player.isFlying = true;
      g.player.velocity.set(0,0,0); g.player.yaw = 0; g.player.pitch = name === 'surface' ? -.3 : 0;
      g.player.update(0); g.updateUnderwaterState();
      samples = {};
      let frames = [], work = [], draws = [], triangles = [], waterChanges = 0;
      const previousWater = g.world.water.tick;
      g.world.water.tick = function(...args) { const n=previousWater.apply(this,args);waterChanges+=n;return n; };
      let lastFrame = performance.now();
      for (let i=0;i<150;i++) {
        await new Promise(requestAnimationFrame);
        const frame = performance.now();
        frames.push(frame-lastFrame); lastFrame = frame;
        const t = performance.now();
        g.renderer.info.reset(); g.renderer.info.autoReset = false;
        g.mobs.update(1/60,g.player); g.spawnManager?.update(1/60);
        g.world.water.update(1/60); g.streamer.update(g.player.position.x,g.player.position.z);
        g.refreshDirtyChunks(); g.world.light.update(); g.updateRaycast();
        g.blockLighting.update(1/60,g.camera.position); g.textures.update(1/60,g.sunLight,g.scene.background,g.scene.fog);
        g.shader.render(1/60);
        draws.push(g.renderer.info.render.calls); triangles.push(g.renderer.info.render.triangles);
        work.push(performance.now()-t);
      }
      g.world.water.tick = previousWater;
      scenarios.push({ name, frameMs: summary(frames.slice(30)), workMs: summary(work.slice(30)),
        draws: summary(draws.slice(30)), triangles: summary(triangles.slice(30)), waterChanges,
        pendingWater: g.world.water.pending.size, counts: count(), mobErrors: g.mobs.mobErrors?.size || 0,
        timings: Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,summary(v)])) });
    }
    return { version: before ? 'before' : 'after', randomSeed: 4242,
      loop: 'Controlled core simulation and rendering, fixed 1/60s ticks; not the complete Game.animate loop',
      seed: 12345, preset: 'reef_life', biome: 'warm_ocean', viewport: '1280x720',
      shader: g.shader.enabled, generationMs, initial, generationTimings, scenarios };
  }, before);
  assert.deepEqual(errors, [], 'browser must finish without uncaught errors');
  assert.ok(result.initial.plants > 20000 && result.initial.mobs > 1000, 'benchmark must retain the dense default-distance reef');
  for (const scenario of result.scenarios) assert.equal(scenario.mobErrors, 0, 'no broken mobs may be skipped to improve timings');
  const json = JSON.stringify({ ...result, browser: browser.version(), errors }, null, 2);
  if (outputIndex >= 0) await writeFile(process.argv[outputIndex+1], json + '\n');
  console.log(json);
} finally { await browser.close(); }
