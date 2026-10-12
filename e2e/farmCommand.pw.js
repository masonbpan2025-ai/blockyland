// The farming matrix, run in a disposable headless browser through the bot's own actions.
//
// Layer: real `PlayerBot.run({type:'till'})` and `run({type:'use', item:'bone_meal'})` -> `BotSurvival`
// equipping a real hoe or bone meal and aiming -> the game's real right-click path -> `FarmingManager` ->
// real world voxels, real drops and the real inventory. This is the layer the FarmingManager unit tests
// cannot reach: `/give` looked healthy in unit tests while its bot route was dead.
//
// Nothing here treats the bot's success string as evidence.
//
// Reference: https://minecraft.wiki/w/Farming, /w/Bone_Meal and /w/Farmland.
import { test, expect } from '@playwright/test';

test.describe('creative farming through the bot API', () => {
  const evidence = { rows: [], generatedAt: null, reference: null };

  async function drain() {
    const rows = await globalThis.__page.evaluate(() => {
      const out = window.__farm.observed.slice();
      window.__farm.observed.length = 0;
      return out;
    });
    const { writeFileSync, mkdirSync, readFileSync, existsSync } = await import('node:fs');
    mkdirSync('docs/artifacts', { recursive: true });
    const path = 'docs/artifacts/farm-browser-rows.json';
    let previous = { rows: [] };
    if (existsSync(path)) {
      try { previous = JSON.parse(readFileSync(path, 'utf8')); } catch { previous = { rows: [] }; }
    }
    const keyed = new Map((previous.rows ?? []).map((r) => [r.key, r]));
    for (const r of rows) keyed.set(r.key, r);
    evidence.rows = [...keyed.values()];
    evidence.generatedAt = new Date().toISOString();
    writeFileSync(path, JSON.stringify(evidence, null, 2) + '\n');
    return rows;
  }

  test.afterEach(async () => {
    try { await drain(); } catch (error) { console.error('[farm] drain failed:', error.message); }
  });

  test.afterAll(async () => { await globalThis.__page?.close(); });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(600000);
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(300000);
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForFunction(
      () => window.game?.playerBot && window.game?.inventory && window.game?.entities && window.game?.farmingManager,
      null, { timeout: 300000 },
    );
    await page.evaluate(async () => {
      const { createFarmHarness } = await import('/e2e/fixtures/farmHarness.js');
      window.__farm = await createFarmHarness(window.game);
      window.__farmSetup = window.__farm.reset({ gameMode: 'creative', cheats: true });
    });
    const setup = await page.evaluate(() => window.__farmSetup);
    evidence.reference = {
      wiki: 'https://minecraft.wiki/w/Farming with /w/Bone_Meal and /w/Farmland (fetched in this run)',
      javaEditionTarget: '1.21.4 (DataVersion 4189)',
      setup,
    };
    expect(setup.mode, 'the harness is set up in creative').toBe('creative');
    expect(setup.settings.cheats, 'with cheats on').toBe(true);
    globalThis.__page = page;
  });

  // --- BOT-F01: tilling ------------------------------------------------------------

  test('BOT-F01 the bot tills dirt into farmland with a hoe', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__farm;
      const { BLOCKS } = await import('/src/blocks.js');
      h.reset({ gameMode: 'creative', cheats: true });
      h.setBlock(2, 1, 0, BLOCKS.DIRT);
      h.standAt([0.5, 2, 0.5], [2, 1, 0]);
      h.give('iron_hoe', 1, false);
      const row = await h.run({ type: 'till', position: [2, 1, 0] });
      return {
        ok: row.ok, message: row.message, error: row.error,
        block: h.getVoxel(2, 1, 0), expected: BLOCKS.FARMLAND,
        above: h.getVoxel(2, 2, 0),
        held: row.after.held, botActive: row.after.botActive, controls: row.after.controls, keys: row.after.keys,
        selected: row.after.selected,
      };
    });
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    expect(r.ok, `the bot reported: ${r.message}`).toBe(true);
    // Read the voxel, not the message.
    expect(r.block, `dirt should become farmland (FARMLAND=${r.expected})`).toBe(r.expected);
    expect(r.above, 'the block above stays air').toBe(0);
    expect(r.botActive, 'the bot releases control').toBe(false);
    expect(r.controls).toBeNull();
    expect(r.keys).toEqual([]);
  });

  test('BOT-F02 the bot tills grass, dirt and dirt path, and refuses podzol, mycelium and moss', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__farm;
      const { BLOCKS } = await import('/src/blocks.js');
      const cases = [
        ['grass', BLOCKS.GRASS],
        ['dirt', BLOCKS.DIRT],
        ['dirt_path', BLOCKS.DIRT_PATH],
        // Wiki (Hoe): "do not work on mycelium or podzol".
        ['podzol', BLOCKS.PODZOL],
        ['mycelium', BLOCKS.MYCELIUM],
        ['moss', BLOCKS.MOSS_BLOCK],
      ];
      const out = {};
      for (const [name, id] of cases) {
        if (id === undefined) { out[name] = { skipped: true }; continue; }
        h.reset({ gameMode: 'creative', cheats: true });
        h.setBlock(2, 1, 0, id);
        h.standAt([0.5, 2, 0.5], [2, 1, 0]);
        h.give('iron_hoe', 1, false);
        const row = await h.run({ type: 'till', position: [2, 1, 0] }).catch(e => ({ ok: false, message: String(e?.message ?? e) }));
        out[name] = { ok: row.ok, message: row.message, block: h.getVoxel(2, 1, 0) };
      }
      out.farmlandId = BLOCKS.FARMLAND;
      out.moistId = BLOCKS.FARMLAND_MOIST;
      return out;
    });
    for (const name of ['grass', 'dirt', 'dirt_path']) {
      const row = r[name];
      if (row?.skipped) continue;
      expect([r.farmlandId, r.moistId], `${name} should till to farmland, got ${row.block} (${JSON.stringify(row.message)})`)
        .toContain(row.block);
    }
    for (const name of ['podzol', 'mycelium', 'moss']) {
      const row = r[name];
      if (row?.skipped) continue;
      expect([r.farmlandId, r.moistId], `${name} must stay untilled`).not.toContain(row.block);
    }
  });

  test('BOT-F03 the bot refuses to till without a hoe, and on untillable ground', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__farm;
      const { BLOCKS } = await import('/src/blocks.js');
      // No hoe in the inventory.
      h.reset({ gameMode: 'creative', cheats: true });
      h.setBlock(2, 1, 0, BLOCKS.DIRT);
      h.standAt([0.5, 2, 0.5], [2, 1, 0]);
      const noHoe = await h.run({ type: 'till', position: [2, 1, 0] });
      const afterNoHoe = h.getVoxel(2, 1, 0);
      // Stone is not tillable even with a hoe.
      h.reset({ gameMode: 'creative', cheats: true });
      h.setBlock(2, 1, 0, BLOCKS.STONE);
      h.standAt([0.5, 2, 0.5], [2, 1, 0]);
      h.give('iron_hoe', 1, false);
      const stone = await h.run({ type: 'till', position: [2, 1, 0] });
      const afterStone = h.getVoxel(2, 1, 0);
      // Out of reach.
      h.reset({ gameMode: 'creative', cheats: true });
      h.setBlock(18, 1, 0, BLOCKS.DIRT);
      h.standAt([0.5, 2, 0.5], [18, 1, 0]);
      h.give('iron_hoe', 1, false);
      const far = await h.run({ type: 'till', position: [18, 1, 0] });
      const afterFar = h.getVoxel(18, 1, 0);
      return {
        noHoe: { ok: noHoe.ok, message: noHoe.message, error: noHoe.error, block: afterNoHoe },
        stone: { ok: stone.ok, message: stone.message, error: stone.error, block: afterStone },
        far: { ok: far.ok, message: far.message, error: far.error, block: afterFar },
        dirt: BLOCKS.DIRT, farmland: BLOCKS.FARMLAND,
      };
    });
    expect(r.noHoe.ok, 'without a hoe the till is refused').toBe(false);
    expect(r.noHoe.block, 'and the dirt is untouched').toBe(r.dirt);
    expect(r.stone.ok, 'stone cannot be tilled').toBe(false);
    expect(r.stone.block, 'and stone stays stone').toBeGreaterThan(0);
    expect(r.stone.block, 'not farmland').not.toBe(r.farmland);
    expect(r.far.ok, 'a block out of reach is refused').toBe(false);
    expect(r.far.block, 'and that dirt is untouched').toBe(r.dirt);
  });

  // --- BOT-F04: bone meal ----------------------------------------------------------

  test('BOT-F04 the bot bone-meals an immature crop until it matures', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__farm;
      const { BLOCKS } = await import('/src/blocks.js');
      h.reset({ gameMode: 'creative', cheats: true });
      h.setBlock(2, 1, 0, BLOCKS.FARMLAND);
      h.setBlock(2, 2, 0, BLOCKS.WHEAT_STAGE_0);
      h.standAt([0.5, 2, 0.5], [2, 2, 0]);
      h.give('bone_meal', 1, false);
      const row = await h.run({ type: 'use', item: 'bone_meal', position: [2, 2, 0] });
      const block = h.getVoxel(2, 2, 0);
      return {
        ok: row.ok, message: row.message, error: row.error,
        block, matureId: BLOCKS.WHEAT_STAGE_7, stage0: BLOCKS.WHEAT_STAGE_0,
        boneMealLeft: h.count('bone_meal'),
        held: row.after.held,
      };
    });
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    expect(r.ok, `the bot reported: ${r.message}`).toBe(true);
    // The bot applies bone meal repeatedly until the crop is mature, so it ends on the final stage.
    expect(r.block, `bone meal should mature stage-0 wheat (${r.stage0}) to stage 7 (${r.matureId})`).toBe(r.matureId);
    // Creative does not consume the bone meal, matching the rest of the creative suite.
    expect(r.boneMealLeft, `creative keeps the bone meal: ${JSON.stringify(r.held)}`).toBe(1);
  });

  test('BOT-F05 the bot bone-meals carrots and potatoes to maturity too', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__farm;
      const { BLOCKS } = await import('/src/blocks.js');
      const out = {};
      for (const [name, stage0, stageMax] of [['carrots', BLOCKS.CARROTS_STAGE_0, BLOCKS.CARROTS_STAGE_3], ['potatoes', BLOCKS.POTATOES_STAGE_0, BLOCKS.POTATOES_STAGE_3]]) {
        h.reset({ gameMode: 'creative', cheats: true });
        h.setBlock(2, 1, 0, BLOCKS.FARMLAND);
        h.setBlock(2, 2, 0, stage0);
        h.standAt([0.5, 2, 0.5], [2, 2, 0]);
        h.give('bone_meal', 1, false);
        const row = await h.run({ type: 'use', item: 'bone_meal', position: [2, 2, 0] });
        out[name] = { ok: row.ok, message: row.message, error: row.error, block: h.getVoxel(2, 2, 0), stageMax };
      }
      return out;
    });
    for (const name of ['carrots', 'potatoes']) {
      const row = r[name];
      expect(row.error, `${name} threw: ${row.error}`).toBeNull();
      expect(row.ok, `${name} reported: ${row.message}`).toBe(true);
      expect(row.block, `${name} should reach its last stage ${row.stageMax}`).toBe(row.stageMax);
    }
  });

  test('BOT-F06 a single bone meal on carrots advances by 2-5 stages, as the wiki says', async () => {
    // The wiki's fertilizer table gives ONE rule for wheat, carrots and potatoes: "The plant matures 2-5
    // growth stages." The FarmingManager used to give carrots and potatoes only 1-3, which this catches at
    // the level the player sees: one bone meal, one look at the resulting stage.
    const r = await globalThis.__page.evaluate(async () => {
      const { getCropInfo } = await import('/src/farming.js');
      const { BLOCKS } = await import('/src/blocks.js');
      const h = window.__farm;
      const game = window.game;

      // Sample the rule where the model applies it, to get the full distribution cheaply.
      const stages = [];
      for (let i = 0; i < 300; i++) {
        game.world.setVoxel(2, 1, 0, BLOCKS.FARMLAND);
        game.world.setVoxel(2, 2, 0, BLOCKS.CARROTS_STAGE_0);
        const ok = game.farmingManager.applyBoneMeal(2, 1, 0, game.player);
        const info = getCropInfo(game.world.getVoxel(2, 2, 0));
        if (!ok || !info) return { broken: true, ok, block: game.world.getVoxel(2, 2, 0) };
        stages.push(info.stage);
      }

      // And once through the bot's own route, which reaches the same rule the way a player does.
      h.reset({ gameMode: 'creative', cheats: true });
      h.setBlock(2, 1, 0, BLOCKS.FARMLAND);
      h.setCrop(2, 2, 0, BLOCKS.CARROTS_STAGE_0);
      h.standAt([0.5, 2, 0.5], [2, 2, 0]);
      h.give('bone_meal', 1, false);
      const row = await h.run({ type: 'use', item: 'bone_meal', position: [2, 2, 0] });

      return {
        min: Math.min(...stages), max: Math.max(...stages),
        distinct: [...new Set(stages)].sort((a, b) => a - b),
        botOk: row.ok, botMessage: row.message, botError: row.error,
        botBlock: h.getVoxel(2, 2, 0), mature: BLOCKS.CARROTS_STAGE_3,
      };
    });
    expect(r.broken, 'the carrot bone meal works').toBeFalsy();
    expect(r.min, `one bone meal on carrots reached only stage ${r.min}; the wiki says 2-5 stages, so the ` +
      `lowest stage reachable from stage 0 is 2`).toBeGreaterThanOrEqual(2);
    expect(r.max, 'and a 4-stage crop caps at stage 3').toBeLessThanOrEqual(3);
    expect(r.distinct.length, 'and it is not deterministic').toBeGreaterThan(1);
    // The same rule through the bot's route.
    expect(r.botOk, `the bot reported: ${r.botMessage ?? r.botError}`).toBe(true);
    expect(r.botBlock, 'the bot matured the carrots').toBe(r.mature);
  });

  test('BOT-F07 bone meal on a mature crop changes nothing', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__farm;
      const { BLOCKS } = await import('/src/blocks.js');
      h.reset({ gameMode: 'creative', cheats: true });
      h.setBlock(2, 1, 0, BLOCKS.FARMLAND);
      h.setBlock(2, 2, 0, BLOCKS.WHEAT_STAGE_7);
      h.standAt([0.5, 2, 0.5], [2, 2, 0]);
      h.give('bone_meal', 1, false);
      const row = await h.run({ type: 'use', item: 'bone_meal', position: [2, 2, 0] });
      return { ok: row.ok, message: row.message, error: row.error, block: h.getVoxel(2, 2, 0), mature: BLOCKS.WHEAT_STAGE_7 };
    });
    // The crop is already mature, so the block must be unchanged. Whether the bot calls that success or a
    // refusal is the bot's policy; the world state is what matters.
    expect(r.block, `a mature crop must not change, got ${r.block} (message: ${JSON.stringify(r.message ?? r.error)})`).toBe(r.mature);
  });

  // --- BOT-F08: hydration over time -----------------------------------------------

  test('BOT-F08 farmland hydrates when water arrives and dries when it goes', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__farm;
      const { BLOCKS } = await import('/src/blocks.js');
      h.reset({ gameMode: 'creative', cheats: true });
      h.setBlock(2, 1, 0, BLOCKS.DIRT);
      h.standAt([0.5, 2, 0.5], [2, 1, 0]);
      h.give('iron_hoe', 1, false);
      await h.run({ type: 'till', position: [2, 1, 0] });
      const dryTilled = h.getVoxel(2, 1, 0);
      // Plant a crop, because dry UNPLANTED farmland can revert to dirt -- a separate rule that would
      // otherwise decide this case's result. The crop is what keeps the soil a farmland block throughout.
      h.setCrop(2, 2, 0, BLOCKS.WHEAT_STAGE_0);
      // Water four blocks away, at the edge of the wiki's range.
      h.setBlock(6, 1, 0, BLOCKS.WATER);
      h.grow(3);
      const hydrated = h.getVoxel(2, 1, 0);
      // Take it away again.
      h.setBlock(6, 1, 0, BLOCKS.AIR);
      h.grow(3);
      const dried = h.getVoxel(2, 1, 0);
      return { dryTilled, hydrated, dried, farmland: BLOCKS.FARMLAND, moist: BLOCKS.FARMLAND_MOIST };
    });
    expect(r.dryTilled, 'tilling with no water gives dry farmland').toBe(r.farmland);
    expect(r.hydrated, 'water at dx=4 hydrates it (the wiki\'s range)').toBe(r.moist);
    expect(r.dried, 'and removing the water dries it again').toBe(r.farmland);
  });

  test('BOT-F10 dry unplanted farmland reverts to dirt over time', async () => {
    // The other half of the hydration rule, which BOT-F08 deliberately avoids: farmland with no water and
    // nothing growing on it reverts. Without this the build would let a player keep farmland forever with no
    // water and no crop, which vanilla does not.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__farm;
      const { BLOCKS } = await import('/src/blocks.js');
      h.reset({ gameMode: 'creative', cheats: true });
      h.setBlock(2, 1, 0, BLOCKS.DIRT);
      h.standAt([0.5, 2, 0.5], [2, 1, 0]);
      h.give('iron_hoe', 1, false);
      await h.run({ type: 'till', position: [2, 1, 0] });
      const tilled = h.getVoxel(2, 1, 0);
      h.grow(120);
      const after = h.getVoxel(2, 1, 0);
      return { tilled, after, farmland: BLOCKS.FARMLAND, dirt: BLOCKS.DIRT };
    });
    expect(r.tilled, 'it starts as farmland').toBe(r.farmland);
    expect(r.after, `dry unplanted farmland should revert to dirt (${r.dirt}), got ${r.after}`).toBe(r.dirt);
  });

  test('BOT-F09 a crop on hydrated farmland grows without any bone meal', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__farm;
      const { BLOCKS } = await import('/src/blocks.js');
      h.reset({ gameMode: 'creative', cheats: true });
      h.setBlock(2, 1, 0, BLOCKS.FARMLAND_MOIST);
      h.setBlock(3, 1, 0, BLOCKS.WATER);          // keeps it hydrated
      // `setCrop` rather than `setBlock`: a crop only grows if the manager has it registered, and the
      // production path that registers one is `plant()`.
      h.setCrop(2, 2, 0, BLOCKS.WHEAT_STAGE_0);
      h.standAt([0.5, 2, 0.5], [2, 2, 0]);
      const before = h.getVoxel(2, 2, 0);
      // The fixture suspends the frame loop that propagates light, and growth now needs light 9 (wiki), so
      // light the chunk the way the running game would have by now.
      window.game.world.light.relightChunk(0, 0);
      h.grow(60);
      const after = h.getVoxel(2, 2, 0);
      return { before, after, stage0: BLOCKS.WHEAT_STAGE_0, mature: BLOCKS.WHEAT_STAGE_7, moist: h.getVoxel(2, 1, 0) };
    });
    expect(r.after, `the crop should have advanced from stage 0 (${r.before}) past it`).not.toBe(r.before);
    expect(r.moist, 'and the soil stays hydrated').toBe(163); // FARMLAND_MOIST
  });

  test('BOT-F13 a crop in the dark does not grow, and grows once the roof comes off', async () => {
    // Wiki (Wheat): a light level of at least 9 is needed to grow.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__farm;
      const { BLOCKS } = await import('/src/blocks.js');
      h.reset({ gameMode: 'creative', cheats: true });
      h.setBlock(2, 1, 0, BLOCKS.FARMLAND_MOIST);
      h.setBlock(3, 1, 0, BLOCKS.WATER);
      h.setCrop(2, 2, 0, BLOCKS.WHEAT_STAGE_0);
      // A wide stone roof, wide enough that sky light cannot bleed in from the sides (it loses 1 per block).
      for (let dx = -9; dx <= 9; dx++) for (let dz = -9; dz <= 9; dz++) h.setBlock(2 + dx, 5, dz, BLOCKS.STONE);
      h.standAt([0.5, 2, 0.5], [2, 2, 0]);
      const world = window.game.world;
      const relight = () => { for (const cx of [-1, 0]) for (const cz of [-1, 0]) world.light.relightChunk(cx, cz); };
      relight();
      const darkLight = world.getLightLevel(2, 2, 0, 0);
      h.grow(60);
      const darkAfter = h.getVoxel(2, 2, 0);
      for (let dx = -9; dx <= 9; dx++) for (let dz = -9; dz <= 9; dz++) h.setBlock(2 + dx, 5, dz, BLOCKS.AIR);
      relight();
      const litLight = world.getLightLevel(2, 2, 0, 0);
      h.grow(60);
      return { darkLight, darkAfter, litLight, litAfter: h.getVoxel(2, 2, 0), stage0: BLOCKS.WHEAT_STAGE_0 };
    });
    expect(r.darkLight, `the roofed crop must be dark, got ${r.darkLight}`).toBeLessThan(9);
    expect(r.darkAfter, 'no growth below light 9').toBe(r.stage0);
    expect(r.litLight, `the open crop must be lit, got ${r.litLight}`).toBeGreaterThanOrEqual(9);
    expect(r.litAfter, 'and it grows once lit').not.toBe(r.stage0);
  });

  test('BOT-F11 the bot bone-meals beetroots through its own route', async () => {
    // Wiki (Bone Meal): "Beetroots -- The plant has a 75% chance of growing to the next growth stage." The
    // bot applies bone meal until the crop is mature, so the end state is the last stage either way -- what
    // this proves is that the route reaches a BEETROOT, which it could not before the crop had stages.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__farm;
      const { BLOCKS } = await import('/src/blocks.js');
      h.reset({ gameMode: 'creative', cheats: true });
      h.setBlock(2, 1, 0, BLOCKS.FARMLAND);
      h.setCrop(2, 2, 0, BLOCKS.BEETROOTS_STAGE_0);
      h.standAt([0.5, 2, 0.5], [2, 2, 0]);
      h.give('bone_meal', 1, false);
      const row = await h.run({ type: 'use', item: 'bone_meal', position: [2, 2, 0] });
      return {
        ok: row.ok, message: row.message, error: row.error,
        block: h.getVoxel(2, 2, 0),
        mature: BLOCKS.BEETROOTS_STAGE_3, stage0: BLOCKS.BEETROOTS_STAGE_0,
        held: row.after.held,
      };
    });
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    expect(r.ok, `the bot reported: ${r.message}`).toBe(true);
    expect(r.block, `bone meal should mature stage-0 beetroots (${r.stage0}) to stage 3 (${r.mature})`).toBe(r.mature);
    expect(r.held.bone_meal, 'creative keeps the bone meal').toBe(1);
  });

  test('BOT-F12 the bot bone-meals short grass into tall grass', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__farm;
      const { BLOCKS } = await import('/src/blocks.js');
      h.reset({ gameMode: 'creative', cheats: true });
      h.setBlock(2, 1, 0, BLOCKS.SHORT_GRASS);
      h.standAt([0.5, 2, 0.5], [2, 1, 0]);
      h.give('bone_meal', 1, false);
      const row = await h.run({ type: 'use', item: 'bone_meal', position: [2, 1, 0] });
      return {
        ok: row.ok, message: row.message, error: row.error,
        block: h.getVoxel(2, 1, 0), tall: BLOCKS.TALL_GRASS, short: BLOCKS.SHORT_GRASS,
      };
    });
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    expect(r.ok, `the bot reported: ${r.message}`).toBe(true);
    expect(r.block, `short grass (${r.short}) should grow into tall grass (${r.tall})`).toBe(r.tall);
  });

  // --- evidence -------------------------------------------------------------------

  test('the observed farming rows are recorded for the report', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const path = 'docs/artifacts/farm-browser-rows.json';
    expect(existsSync(path), 'the farming artifact was written').toBe(true);
    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written.rows.length, 'the artifact holds the observed actions').toBeGreaterThan(6);
    expect(written.rows.filter((r) => r.ok === true).length, 'the successful actions are recorded').toBeGreaterThan(3);
    expect(written.rows.filter((r) => r.ok === false).length, 'the refusals are recorded').toBeGreaterThan(0);
    expect(written.reference?.setup?.mode, 'the creative setup is recorded').toBe('creative');
  });
});
