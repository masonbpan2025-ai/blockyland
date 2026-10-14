import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const base = process.env.MOD_INSPECTOR_URL ?? 'http://127.0.0.1:3100';
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.setDefaultTimeout(120000);
try {
  await page.goto(base);
  await page.waitForFunction(() => window.game?.mobs && window.game?.streamer);
  const result = await page.evaluate(async () => {
    const { deserializeWorldAsync, decodeVoxelsRLE } = await import('/src/mapManager.js');
    const game = window.game;
    const map = await (await fetch('/api/designed-worlds/World_Martial_Arts_Tournament.json')).json();
    await deserializeWorldAsync(game, map);
    const inspect = () => {
      let mismatches = 0, stale = 0;
      for (const record of map.chunks) {
        const expected = new Uint16Array(16384);
        decodeVoxelsRLE(record.voxels, expected);
        const chunk = game.world.getChunk(record.cx, record.cz);
        if (!chunk) { mismatches += expected.length; continue; }
        if (chunk !== game.world.chunks.get(`${record.cx},${record.cz}`)) stale++;
        for (let i = 0; i < expected.length; i++) if (chunk.voxels[i] !== expected[i]) mismatches++;
      }
      return { mismatches, stale, position: game.player.position.toArray(), modal: game.ui.isModalOpen(), phase: game.lifecycle.phase };
    };
    const loaded = inspect();
    // Exercise the actual collision and controls path, without requiring headless pointer lock.
    const before = game.player.position.clone();
    game.player.keys = { KeyD: true };
    for (let i = 0; i < 30; i++) game.player.update(1 / 60);
    game.player.keys = {};
    const moved = game.player.position.distanceTo(before);
    game.streamer.plan(30, 30); // Drop arena geometry outside view, then return.
    game.streamer.loadAllSynchronously(game.player.position.x, game.player.position.z);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const settled = inspect();
    return { loaded, settled, moved };
  });
  console.log(JSON.stringify(result));
  const start = await page.evaluate(() => window.game.player.position.toArray());
  await page.keyboard.down('d');
  await page.waitForTimeout(500);
  await page.keyboard.up('d');
  const end = await page.evaluate(() => window.game.player.position.toArray());
  assert.ok(Math.hypot(end[0] - start[0], end[2] - start[2]) > 1, 'Keyboard movement must work in the running game');
  if (process.env.WORLD_SCREENSHOT) await page.screenshot({ path: process.env.WORLD_SCREENSHOT });
  assert.equal(result.loaded.mismatches, 0, 'Authored voxels must survive loading');
  assert.equal(result.settled.mismatches, 0, 'Streaming must preserve the authored map');
  assert.ok(result.moved > 1, 'Player must be able to walk at the restored spawn');
  const transition = await page.evaluate(async () => {
    const { deserializeWorldAsync } = await import('/src/mapManager.js');
    const game = window.game;
    await deserializeWorldAsync(game, {
      worldType: 'generated', mechanism: 'default', name: 'Generated world', seed: 4289,
      chunks: [], player: { position: { x: 0, y: 50, z: 0 } },
    });
    return {
      mode: game.world.generationMode, providers: game.mobs.mobProviders.size,
      terrain: game.world.getOrCreateChunk(0, 0).voxels.some(id => id !== 0),
    };
  });
  assert.deepEqual(transition, { mode: 'procedural', providers: 0, terrain: true });
  assert.deepEqual(errors, [], 'Browser must not report runtime errors');
  console.log('PASS: exact authored terrain, player movement, streaming return, and generated-world transition.');
} finally { await browser.close(); }
