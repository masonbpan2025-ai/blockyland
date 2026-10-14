// Water mechanics in the real game: falling, drowning, swimming, currents, mining, the Nether bucket and what the
// renderer draws through the surface.
//
// Layer: the real `Player.update`, `Game.updateMining`, `Game.handleRightClick` and the real renderer, on the
// survival fixture's flat world with a fixed 1/30 s clock. Movement is held through `player.botControls`, the
// channel PlayerBot drives the player with, and the bucket is poured with the bot's own `use` action.
//
// References: https://minecraft.wiki/w/Water and https://minecraft.wiki/w/Swimming
import { test, expect } from '@playwright/test';

test.describe('water through the bot and the real game loop', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(600000);
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    page.setDefaultNavigationTimeout(300000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.game?.playerBot && window.game?.inventory && window.game?.ui && window.game?.textures?.waterMaterial, null, { timeout: 300000 });
    await page.evaluate(async () => {
      const { createWaterHarness } = await import('/e2e/fixtures/waterHarness.js');
      window.__water = await createWaterHarness(window.game);
      window.__water.reset();
    });
    globalThis.__page = page;
    globalThis.__errors = errors;
  });

  test.afterAll(async () => { await globalThis.__page?.close(); });

  test('WAT-01 falling into water costs nothing, however far; the same fall onto grass hurts', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__water;
      h.reset();
      h.place(16.5, 24, 2.5);
      const intoWater = await h.until(() => h.player.inWater && h.player.velocity.y > -0.5, 10);
      await h.seconds(0.5);
      const waterHealth = h.player.health;
      h.reset();
      h.place(3.5, 12, 18.5);
      await h.seconds(0.1);
      await h.until(() => h.player.onGround, 10);
      await h.seconds(0.3);
      return { intoWater, waterHealth, groundHealth: h.player.health };
    });
    expect(r.intoWater, 'the player reached the water').not.toBeNull();
    expect(r.waterHealth, '"Water of any depth negates fall damage regardless of fall distance"').toBe(20);
    expect(r.groundHealth, 'an eleven-block fall onto grass hurts').toBeLessThan(20);
  });

  test('WAT-02 under water the breath lasts 15 seconds, then drowning costs 2 HP a second', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__water;
      h.reset();
      // Below 18 hunger and with no saturation, so natural regeneration is not healing the drowning back: at full
      // hunger it restores 2 HP a second, exactly what drowning takes, as in vanilla.
      h.player.hunger = 16; h.player.saturation = 0;
      h.place(16.5, 1.05, 2.5);
      await h.seconds(1);
      const headUnder = h.player.isEyeInWater();
      await h.seconds(13);
      const at14 = { health: h.player.health, breath: h.player.breath };
      await h.seconds(5);
      const at19 = { health: h.player.health, breath: h.player.breath };
      // Surface: the meter refills.
      h.place(16.5, 4.5, 2.5);
      await h.seconds(0.2);
      return { headUnder, at14, at19, refilled: h.player.breath };
    });
    expect(r.headUnder, 'the head is under the surface').toBe(true);
    expect(r.at14.health, 'no damage in the first fifteen seconds').toBe(20);
    expect(r.at14.breath, 'air left at fourteen seconds').toBeGreaterThan(0);
    expect(r.at19.breath).toBe(0);
    // Out of air at 15 s; damage at 16, 17, 18 and 19 s: 4 to 8 HP depending on where the tick falls.
    expect(r.at19.health, '2 HP a second once the air is gone').toBeLessThanOrEqual(14);
    expect(r.at19.health).toBeGreaterThanOrEqual(10);
    expect(r.refilled, 'surfacing refills the meter').toBeGreaterThanOrEqual(15);
  });

  test('WAT-03 swimming is 1.97 m/s under water and sprint-swimming is 3.918 m/s, one block tall', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__water;
      const measure = async (keys) => {
        h.reset();
        h.place(11.5, 1.6, 2.5, { yaw: -Math.PI / 2, pitch: 0 });
        h.hold(keys);
        await h.seconds(0.8);
        const x0 = h.player.position.x;
        await h.seconds(1);
        const speed = h.player.position.x - x0;
        const out = { speed, swimming: h.player.isSwimming, height: h.player.height, head: h.player.headInWater };
        h.hold(null);
        return out;
      };
      return { swim: await measure({ KeyW: true }), sprint: await measure({ KeyW: true, ControlLeft: true }) };
    });
    expect(r.swim.head, 'the swimmer is submerged').toBe(true);
    expect(r.swim.swimming, 'plain swimming is not sprint-swimming').toBe(false);
    expect(r.swim.speed, 'about 1.97 blocks a second').toBeGreaterThan(1.97 * 0.85);
    expect(r.swim.speed).toBeLessThan(1.97 * 1.15);
    expect(r.sprint.swimming, 'sprint while submerged starts swimming').toBe(true);
    expect(r.sprint.height, 'one block tall').toBeLessThan(1);
    expect(r.sprint.speed, 'about 3.918 blocks a second').toBeGreaterThan(3.918 * 0.85);
    expect(r.sprint.speed).toBeLessThan(3.918 * 1.15);
  });

  test('WAT-04 a current pushes at about 1.39 m/s', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__water;
      h.reset();
      h.place(h.CHANNEL.x0 + 1.5, h.CHANNEL.y, h.CHANNEL.z + 0.5);
      await h.seconds(0.6);
      const x0 = h.player.position.x;
      await h.seconds(1);
      return { pushed: h.player.position.x - x0, inWater: h.player.inWater };
    });
    expect(r.inWater).toBe(true);
    expect(r.pushed, 'towards the end of the flow, at about 25 blocks per 18 seconds').toBeGreaterThan(1.39 * 0.8);
    expect(r.pushed).toBeLessThan(1.39 * 1.2);
  });

  test('WAT-05 mining with the head under water is about five times slower', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__water;
      const { BLOCKS } = h;
      const mine = async (block, eye) => {
        h.world.setVoxel(block[0], block[1], block[2], BLOCKS.DIRT);
        h.place(eye[0], eye[1], eye[2]);
        h.fixture.bot.lookAt({ x: block[0] + 0.5, y: block[1] + 0.5, z: block[2] + 0.5 });
        window.game.isMouseDown = true;
        const seconds = await h.until(() => h.world.getVoxel(...block) !== BLOCKS.DIRT, 30);
        window.game.isMouseDown = false;
        return seconds;
      };
      h.reset();
      const land = await mine([5, 1, 20], [5.5, 1, 18.6]);
      h.reset();
      const water = await mine([18, 1, 2], [16.5, 1, 2.5]);
      const head = h.player.headInWater;
      return { land, water, head };
    });
    expect(r.land, 'dirt breaks on land').not.toBeNull();
    expect(r.water, 'and under water, eventually').not.toBeNull();
    expect(r.head, 'with the head under water').toBe(true);
    const ratio = r.water / r.land;
    expect(ratio, `"5x slower when head-submerged on the ground": ${r.water}s against ${r.land}s`).toBeGreaterThan(3.8);
    expect(ratio).toBeLessThan(6.2);
  });

  test('WAT-06 the bot pours water in the Nether and it evaporates; in the Overworld it stays', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__water;
      const { BLOCKS } = h;
      const pour = async (nether) => {
        h.reset({ gameMode: 'survival' });
        h.world.isNether = nether;
        h.place(3.5, 1, 1.5);
        window.game.inventory.addItem('water_bucket', false, 1);
        h.world.setVoxel(3, 1, 3, BLOCKS.AIR);
        let result;
        try { result = await h.fixture.run({ type: 'use', item: 'water_bucket', position: [3, 0, 3] }); }
        catch (e) { result = { ok: false, message: e.message }; }
        const held = [...window.game.inventory.hotbar, ...window.game.inventory.storage].filter(Boolean).map((s) => s.id);
        const placed = h.world.getVoxel(3, 1, 3) === BLOCKS.WATER;
        h.world.isNether = false;
        return { ok: result.ok, message: result.message, held, placed };
      };
      return { nether: await pour(true), overworld: await pour(false) };
    });
    expect(r.nether.placed, '"disappears if placed there with a bucket"').toBe(false);
    expect(r.nether.held, 'the bucket is emptied all the same').toContain('bucket');
    expect(r.nether.held).not.toContain('water_bucket');
    expect(r.overworld.placed, `the Overworld pour places water (${r.overworld.message})`).toBe(true);
  });

  test('WAT-07 seagrass under the surface is drawn through the water, tinted by it, with two renders and one copy a frame', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__water;
      const { BLOCKS } = h;
      const g = window.game;
      h.reset({ gameMode: 'creative' });
      const plant = BLOCKS.SEAGRASS ?? BLOCKS.TALL_SEAGRASS;
      h.world.setVoxel(16, 1, 2, plant);
      h.meshAll();
      g.worldTime = 6000;
      h.place(16.5, 6.0, 4.9, { yaw: 0, pitch: -1.2 });
      g.player.isFlying = true;
      h.step(1 / 30);
      g.updateUnderwaterState();
      const results = {};
      for (const shader of [false, true]) {
        g.shader.setEnabled(shader, false);
        const pass = () => g.shader.waterPass;
        const before = pass()?.stats ? { ...pass().stats } : { renders: 0, copies: 0 };
        for (let i = 0; i < 3; i++) g.shader.render(1 / 30);
        const after = { ...pass().stats };
        // Where the plant is on screen.
        g.camera.updateMatrixWorld();
        const v = new (g.camera.position.constructor)(16.5, 1.4, 2.5).project(g.camera);
        const canvas = g.renderer.domElement;
        const px = Math.round((v.x * 0.5 + 0.5) * canvas.width), py = Math.round((1 - (v.y * 0.5 + 0.5)) * canvas.height);
        const read = () => {
          const gl = g.renderer.getContext();
          const out = new Uint8Array(4);
          gl.readPixels(px, canvas.height - py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
          return [...out];
        };
        g.shader.render(1 / 30);
        const throughWater = read();
        g.textures.waterMaterial.visible = false;
        const prior = g.shader.waterPassFailed;
        g.shader.waterPassFailed = true; // one plain render with the water hidden: the plant bare
        g.shader.render(1 / 30);
        const bare = read();
        g.shader.waterPassFailed = prior;
        g.textures.waterMaterial.visible = true;
        results[shader ? 'shader' : 'plain'] = {
          renders: after.renders - before.renders, copies: after.copies - before.copies,
          throughWater, bare, onScreen: v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1,
          refraction: Boolean(g.textures.waterUniforms.tRefraction.value),
        };
      }
      g.player.isFlying = false;
      return results;
    }, null, { timeout: 120000 });
    for (const [mode, v] of Object.entries(r)) {
      expect(v.onScreen, `${mode}: the plant is in view`).toBe(true);
      expect(v.renders, `${mode}: two renders a frame`).toBe(6);
      expect(v.copies, `${mode}: one copy a frame`).toBe(3);
      expect(v.refraction, `${mode}: the water has a refraction copy`).toBe(true);
      const blueShare = (c) => c[2] / Math.max(1, c[0] + c[1] + c[2]);
      expect(blueShare(v.throughWater), `${mode}: seen through the water the plant is bluer (${v.throughWater} vs bare ${v.bare})`)
        .toBeGreaterThan(blueShare(v.bare));
      expect(v.throughWater.slice(0, 3), `${mode}: and it is not painted over the surface unchanged`).not.toEqual(v.bare.slice(0, 3));
    }
  });

  test('WAT-08 the browser raised no errors during the water suite', async () => {
    expect(globalThis.__errors).toEqual([]);
  });
});
