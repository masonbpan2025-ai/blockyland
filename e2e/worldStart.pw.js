// Five bugs, reproduced in the real game:
//   1. Back to Main, then Generate New World, must build a fresh world rather than walk into the old one.
//   2. A struck camel runs away (wiki: "immediately flee after being harmed, even when sitting").
//   3. A polar bear struck by a goat's ram must keep updating, not stop with an error.
//   4. Escape releases the pointer and opens the pause menu, and the view stops turning on hover.
//   5. The first frame of a new world is already complete: no chunk is left waiting to be meshed.
import { test, expect } from '@playwright/test';

test.describe('starting, leaving and re-entering a world', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(600000);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultNavigationTimeout(300000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.game?.playerBot && window.game?.inventory && window.game?.ui && window.game?.world, null, { timeout: 300000 });
    globalThis.__page = page;
    globalThis.__errors = errors;
  });

  test.afterAll(async () => { await globalThis.__page?.close(); });

  /**
   * Generate a world from the seed given by clicking through the start screen, and report the state it leaves. A world
   * already running is left through the pause menu's Back to Main first, as a player would: calling
   * `generateNewWorld()` over a running world is refused (the lifecycle allows one load at a time), and the reseed
   * before it had already emptied the world, so every test after the first ran in a world with no chunks.
   */
  async function generate(seed) {
    const page = globalThis.__page;
    if (await page.evaluate(() => window.game.lifecycle.phase !== 'idle')) {
      await page.evaluate(() => document.getElementById('btn-title-screen').click());
      await page.waitForFunction(() => window.game.lifecycle.phase === 'idle');
    }
    await page.click('#btn-start-new-world');
    await expect(page.locator('#world-biome-modal')).toBeVisible({ timeout: 20000 });
    await page.click('#world-mode-creative');
    await page.selectOption('#world-biome-select', 'plains');
    await page.fill('#world-seed-input', String(seed));
    await page.click('#btn-create-world-confirm');
    await page.waitForFunction(() => window.game.worldReady && window.game.lifecycle.phase === 'ready', null, { timeout: 300000 });
    return page.evaluate(async () => {
      const g = window.game;
      const p = g.player.position;
      const rd = Number.isFinite(g.renderDistance) ? g.renderDistance : 4;
      const pcx = Math.floor(p.x / 16), pcz = Math.floor(p.z / 16);
      let nearby = 0, dirtyNear = 0, unmeshedWithBlocks = 0;
      for (const chunk of g.world.chunks.values()) {
        if (Math.abs(chunk.cx - pcx) > rd || Math.abs(chunk.cz - pcz) > rd) continue;
        nearby++;
        if (chunk.dirty) dirtyNear++;
        const hasBlocks = chunk.voxels && chunk.voxels.some((v) => v !== 0);
        if (hasBlocks && !chunk.opaqueMesh && !chunk.transparentMesh && !chunk.waterMesh) unmeshedWithBlocks++;
      }
      return { phase: g.lifecycle.phase, worldReady: g.worldReady, chunks: g.world.chunks.size, nearby, dirtyNear, unmeshedWithBlocks, camera: g.camera.position.toArray(), eye: p.y + g.player.eyeHeight, player: p.toArray() };
    });
  }

  test('BUG 5: the first frame of a new world has every chunk around the player meshed', async () => {
    const r = await generate(4242);
    expect(r.phase, 'the world is running').toBe('ready');
    expect(r.nearby, 'the chunks around the spawn exist').toBeGreaterThan(20);
    expect(r.dirtyNear, 'no chunk around the spawn is still waiting to be meshed').toBe(0);
    expect(r.unmeshedWithBlocks, 'no chunk with blocks in it is missing its mesh').toBe(0);
    // The camera is at the player's eye from the first frame. Before the fix it was still at the origin, inside the
    // ground, which is the half-empty view the first frames showed.
    expect(Math.abs(r.camera[1] - r.eye), `camera ${r.camera.map((v) => v.toFixed(1))} at the player's eye`).toBeLessThan(0.05);
    expect(Math.hypot(r.camera[0] - r.player[0], r.camera[2] - r.player[2]), 'and over the player').toBeLessThan(0.05);
  });

  test('BUG 1: Back to Main releases the world, and Generate New World builds a fresh one', async () => {
    await generate(4242);
    const before = await globalThis.__page.evaluate(() => ({ chunks: window.game.world.chunks.size, meshes: window.game.scene.children.filter((o) => o.isMesh).length }));
    expect(before.chunks).toBeGreaterThan(0);

    const back = await globalThis.__page.evaluate(() => {
      const g = window.game;
      document.getElementById('btn-title-screen').click();
      return {
        phase: g.lifecycle.phase, worldReady: g.worldReady, chunks: g.world.chunks.size,
        streamerLoaded: g.streamer?.loaded?.size ?? 0,
        startOverlay: document.getElementById('start-overlay').style.display,
      };
    });
    expect(back.phase, 'the lifecycle goes back to idle').toBe('idle');
    expect(back.worldReady).toBe(false);
    expect(back.chunks, 'the old chunks are gone').toBe(0);
    expect(back.streamerLoaded, 'the streamer has forgotten the old chunk coordinates').toBe(0);
    expect(back.startOverlay, 'the start screen is up').toBe('flex');

    const again = await generate(777);
    expect(again.phase, 'the new world is accepted and running').toBe('ready');
    expect(again.chunks, 'and its chunks were really built').toBeGreaterThan(20);
    expect(again.dirtyNear).toBe(0);
    expect(again.unmeshedWithBlocks, 'the new world is not an overlay of the old one').toBe(0);
    const after = await globalThis.__page.evaluate(() => ({ meshes: window.game.scene.children.filter((o) => o.isMesh).length, errors: window.game.mobs.mobErrors?.size ?? 0 }));
    expect(after.errors, 'no mob errors from the old world').toBe(0);
    expect(globalThis.__errors, 'no page errors across the round trip').toEqual([]);
  });

  test('BUG 4: Escape opens the pause menu, and the view does not turn on hover', async () => {
    await generate(4242);
    const pause = await globalThis.__page.evaluate(async () => {
      const g = window.game;
      // Chrome takes Escape while the pointer is locked and sends no keydown, so losing the lock is the signal.
      // A headless browser cannot take the lock, so the game is told it had it; a change with no lock before it is a
      // request that did not take, and must NOT pause (a left click used to).
      document.dispatchEvent(new Event('pointerlockchange'));
      const pausedWithoutLock = !document.getElementById('pause-menu').classList.contains('hidden');
      g.pointerLocked = true;
      document.dispatchEvent(new Event('pointerlockchange'));
      const open = !document.getElementById('pause-menu').classList.contains('hidden');
      g.ui.closeAllModals();
      const yaw0 = g.player.yaw;
      // Hover over the canvas, the pointer unlocked and no button held: the view must stay put.
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 600, clientY: 300, movementX: 120, movementY: 0, buttons: 0 }));
      const hoverYaw = g.player.yaw;
      // Dragging with a button held still turns it.
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 640, clientY: 300, movementX: 120, movementY: 0, buttons: 1 }));
      const dragYaw = g.player.yaw;
      return { pausedWithoutLock, open, hoverTurned: hoverYaw !== yaw0, dragTurned: dragYaw !== hoverYaw };
    });
    expect(pause.pausedWithoutLock, 'a lock change with no lock held (a click) does not pause').toBe(false);
    expect(pause.open, 'losing the pointer opens the pause menu').toBe(true);
    expect(pause.hoverTurned, 'moving over the canvas without the lock does not turn the view').toBe(false);
    expect(pause.dragTurned, 'dragging with a button still turns it').toBe(true);
  });

  test('BUG 6: left-clicking the game, to take the mouse or to mine, never pauses it; Escape does', async () => {
    // Every click asked for the pointer lock again, even while it was held, and any lock change with nothing locked
    // was taken for Escape: a left click opened the pause menu. Real mouse clicks on the canvas, as a player makes.
    const page = globalThis.__page;
    await generate(4242);
    const state = () => page.evaluate(() => ({
      locked: !!document.pointerLockElement,
      paused: !document.getElementById('pause-menu').classList.contains('hidden'),
    }));
    const centre = { x: 640, y: 360 };
    // Clicks to take the mouse. Headless Chrome may refuse the first requests; a refused one must not pause either.
    for (let i = 0; i < 8; i++) {
      await page.mouse.click(centre.x, centre.y);
      await page.waitForTimeout(300);
      expect((await state()).paused, `click ${i + 1} paused the game`).toBe(false);
      if ((await state()).locked) break;
    }
    // Clicks and a held button while the mouse is locked: attacking and mining.
    for (let i = 0; i < 6; i++) { await page.mouse.click(centre.x, centre.y); await page.waitForTimeout(150); }
    await page.mouse.down(); await page.waitForTimeout(600); await page.mouse.up(); await page.waitForTimeout(200);
    const playing = await state();
    expect(playing.paused, 'clicking and mining did not pause the game').toBe(false);
    if (playing.locked) {
      // Escape releases the lock, and that opens the pause menu.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      expect(await state(), 'Escape released the mouse and paused').toEqual({ locked: false, paused: true });
    }
    await page.evaluate(() => window.game.ui.closeAllModals());
  });

  test('BUG 2: a struck camel runs away from the blow, even while it is sitting', async () => {
    await generate(4242);
    const r = await globalThis.__page.evaluate(async () => {
      const g = window.game;
      const p = g.player.position;
      g.mobs.spawnMob('camel', p.x + 4, p.y, p.z);
      const camel = g.mobs.mobs.find((m) => m.type === 'camel');
      if (!camel) return { spawned: false };
      for (let i = 0; i < 20; i++) await new Promise(requestAnimationFrame);
      camel.isSitting = true;
      camel.standTimer = 60;
      const origin = { x: camel.mesh.position.x - 2, y: camel.mesh.position.y, z: camel.mesh.position.z, clone() { return this; } };
      const x0 = camel.mesh.position.x;
      const health0 = camel.health;
      g.mobs.damageMob(camel, 2, origin, false, null, false);
      for (let i = 0; i < 60; i++) await new Promise(requestAnimationFrame);
      const out = { spawned: true, health: [health0, camel.health], moved: camel.mesh.position.x - x0, stoodUp: camel.isSitting === false, state: camel.state };
      g.mobs.mobs = g.mobs.mobs.filter((m) => m !== camel);
      g.scene.remove(camel.mesh);
      return out;
    });
    expect(r.spawned, 'a camel was spawned').toBe(true);
    expect(r.health[1], 'it took the damage').toBeLessThan(r.health[0]);
    expect(r.stoodUp, 'it stood up to run').toBe(true);
    expect(r.moved, 'and it moved away from the blow, east, a good distance in a second').toBeGreaterThan(1.5);
  });

  test('BUG 3: a polar bear pushed by a knockback keeps updating, with no mob error', async () => {
    await generate(4242);
    const r = await globalThis.__page.evaluate(async () => {
      const g = window.game;
      const p = g.player.position;
      g.mobs.spawnMob('polar_bear', p.x + 4, p.y, p.z);
      const bear = g.mobs.mobs.find((m) => m.type === 'polar_bear');
      if (!bear) return { spawned: false };
      for (let i = 0; i < 10; i++) await new Promise(requestAnimationFrame);
      // The shape a goat's ram used to leave behind: a plain {x, z}, not a Vector3.
      bear.knockback = { x: 2, z: 0 };
      for (let i = 0; i < 60; i++) await new Promise(requestAnimationFrame);
      const out = { spawned: true, errors: g.mobs.mobErrors?.size ?? 0, alive: bear.health > 0, knockbackIsVector: typeof bear.knockback?.lengthSq === 'function' };
      g.mobs.mobs = g.mobs.mobs.filter((m) => m !== bear);
      g.scene.remove(bear.mesh);
      return out;
    });
    expect(r.spawned).toBe(true);
    expect(r.errors, 'the bear raised no error and was not stopped').toBe(0);
    expect(r.knockbackIsVector, 'and its knockback was normalised to a Vector3').toBe(true);
    expect(globalThis.__errors.filter((e) => /knockback/.test(e)), 'no knockback error reached the page').toEqual([]);
  });
});
