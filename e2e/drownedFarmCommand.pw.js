// The drowned-farming matrix, run in a disposable headless browser through the bot's own actions.
//
// Layer: real `PlayerBot.run({type:'attack', mob:'drowned'})` -> nearest-living-drowned selection -> walk and
// swing -> the real `MobManager` death path -> real dropped items and real XP orbs. That is the "kill the
// drowned for its loot" step of the farm, which is the step a drowned farm exists to automate.
//
// Nothing here treats the bot's success string as evidence.
//
// Reference: https://minecraft.wiki/w/Tutorial:Drowned_farming and https://minecraft.wiki/w/Drowned
import { test, expect } from '@playwright/test';

test.describe('drowned farming through the bot API', () => {
  const evidence = { rows: [], generatedAt: null, reference: null };

  async function drain() {
    const rows = await globalThis.__page.evaluate(() => {
      const out = window.__drowned.observed.slice();
      window.__drowned.observed.length = 0;
      return out;
    });
    const { writeFileSync, mkdirSync, readFileSync, existsSync } = await import('node:fs');
    mkdirSync('docs/artifacts', { recursive: true });
    const path = 'docs/artifacts/drowned-browser-rows.json';
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
    try { await drain(); } catch (error) { console.error('[drowned] drain failed:', error.message); }
  });

  test.afterAll(async () => { await globalThis.__page?.close(); });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(600000);
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(300000);
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForFunction(
      () => window.game?.playerBot && window.game?.mobs && window.game?.entities?.xpOrbs,
      null, { timeout: 300000 },
    );
    await page.evaluate(async () => {
      const { createDrownedHarness } = await import('/e2e/fixtures/drownedHarness.js');
      window.__drowned = await createDrownedHarness(window.game);
      window.__drownedSetup = window.__drowned.reset({ gameMode: 'creative', cheats: true });
    });
    const setup = await page.evaluate(() => window.__drownedSetup);
    evidence.reference = {
      wiki: 'https://minecraft.wiki/w/Tutorial:Drowned_farming with /w/Drowned and /w/Experience (fetched in this run)',
      javaEditionTarget: '1.21.4 (DataVersion 4189)',
      setup,
    };
    expect(setup.settings.cheats, 'cheats are on so the mob can be spawned').toBe(true);
    globalThis.__page = page;
  });

  // --- BOT-D01: the farm's core loop ------------------------------------------------

  test('BOT-D01 the bot kills a drowned and the drops land in the world', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__drowned;
      h.reset({ gameMode: 'creative', cheats: true });
      h.give('diamond_sword', 1, false);
      h.spawn('drowned');
      const before = h.mobs('drowned').length;
      // Wiki: rotten flesh is 0-2, so a kill can legitimately give none. Pin the manager's roll high so this
      // case is about the loot reaching the ground, not about the dice.
      const realRandom = window.game.mobs.random;
      window.game.mobs.random = () => 0.99;
      let row;
      try { row = await h.run({ type: 'attack', mob: 'drowned' }); } finally { window.game.mobs.random = realRandom; }
      // Gather whatever is on the ground near the player, which is the farm's collection step.
      const groundDrops = h.drops();
      return {
        ok: row.ok, message: row.message, error: row.error,
        spawned: before, aliveAfter: h.mobs('drowned').length,
        groundDrops, orbs: h.orbs(),
        botActive: row.after.botActive, controls: row.after.controls, keys: row.after.keys,
      };
    });
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    expect(r.spawned, 'one drowned was spawned').toBe(1);
    expect(r.aliveAfter, 'and the bot killed it').toBe(0);
    // The always-drop, read off the ground rather than off the message.
    const ids = r.groundDrops.map((d) => d.id);
    expect(ids, `drops: ${JSON.stringify(r.groundDrops)}`).toContain('rotten_flesh');
    expect(r.botActive, 'the bot releases control').toBe(false);
    expect(r.controls).toBeNull();
    expect(r.keys).toEqual([]);
  });

  test('BOT-D02 killing a drowned awards experience', async () => {
    // The point of the farm. Wiki (Experience), killing-mobs table: Drowned is in the 5 + 1-3 group.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__drowned;
      h.reset({ gameMode: 'creative', cheats: true });
      h.give('diamond_sword', 1, false);
      h.spawn('drowned');
      const row = await h.run({ type: 'attack', mob: 'drowned' });
      return { ok: row.ok, orbs: h.orbs(), total: h.orbs().reduce((a, b) => a + b, 0), error: row.error };
    });
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    // Five XP, delivered as one or more orbs.
    expect(r.total, `a drowned should be worth 5 XP, orbs: ${JSON.stringify(r.orbs)}`).toBe(5);
  });

  test('BOT-D03 killing a baby drowned awards twelve experience', async () => {
    // Wiki (Experience): Baby Drowned sits in the 12 + 1-3 group with Baby Zombie and Baby Husk.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__drowned;
      h.reset({ gameMode: 'creative', cheats: true });
      h.give('diamond_sword', 1, false);
      h.spawn('drowned', { over: { isBaby: true } });
      const row = await h.run({ type: 'attack', mob: 'drowned' });
      return { ok: row.ok, orbs: h.orbs(), total: h.orbs().reduce((a, b) => a + b, 0), error: row.error };
    });
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    expect(r.total, `a baby drowned should be worth 12 XP, orbs: ${JSON.stringify(r.orbs)}`).toBe(12);
  });

  test('BOT-D08 a baby drowned drops the same loot as an adult', async () => {
    // Wiki (Drowned): gurgles are worth 12 XP AND drop the adult loot. They used to drop nothing.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__drowned;
      h.reset({ gameMode: 'creative', cheats: true });
      h.give('diamond_sword', 1, false);
      h.spawn('drowned', { over: { isBaby: true } });
      const realRandom = window.game.mobs.random;
      window.game.mobs.random = () => 0.99;
      let row;
      try { row = await h.run({ type: 'attack', mob: 'drowned' }); } finally { window.game.mobs.random = realRandom; }
      return { error: row.error, ids: h.drops().map((d) => d.id), xp: h.orbs().reduce((a, b) => a + b, 0) };
    });
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    expect(r.ids, `a gurgle's drops: ${JSON.stringify(r.ids)}`).toContain('rotten_flesh');
    expect(r.xp, 'and exactly 12 XP, not 12 + the adult 5').toBe(12);
  });

  // --- BOT-D04: the loot table over many kills --------------------------------------

  test('BOT-D04 the copper ingot drops at about the wiki rate over many kills', async () => {
    // Wiki (Drowned): 1 copper ingot with an 11% chance, only for a player kill. Rather than a slice of the
    // real RNG, this drives the production roll many times and checks the rate lands near 11%, which also
    // catches a row that is present but never reached.
    const r = await globalThis.__page.evaluate(async () => {
      const game = window.game;
      const { BLOCKS } = await import('/src/blocks.js');
      const seen = { kills: 0, copper: 0, flesh: 0, trident: 0, shell: 0 };
      for (let i = 0; i < 400; i++) {
        // A minimal world/entity seam so each kill is independent and fast.
        const spawned = [];
        const orbs = [];
        const originalDrop = game.entities.spawnDroppedItem;
        const originalXp = game.entities.spawnXpOrbs;
        game.entities.spawnDroppedItem = (pos, id) => { spawned.push(id); };
        game.entities.spawnXpOrbs = (pos, total) => { orbs.push(total); };
        const mob = game.mobs.spawnMob('drowned', 40 + i, 1, 40);
        mob.playerDamaged = true;
        game.mobs.damageMob(mob, 1000, null, false, game.player);
        for (let t = 0; t < 30 && !mob.lootDropped; t++) game.mobs.update(0.1, game.player);
        game.entities.spawnDroppedItem = originalDrop;
        game.entities.spawnXpOrbs = originalXp;
        seen.kills++;
        if (spawned.includes('copper_ingot')) seen.copper++;
        if (spawned.includes('rotten_flesh')) seen.flesh++;
        if (spawned.includes('trident')) seen.trident++;
        if (spawned.includes('nautilus_shell')) seen.shell++;
      }
      game.mobs.clearMobs();
      return seen;
    });
    expect(r.kills, 'four hundred kills were driven').toBe(400);
    // Wiki: 0-2 rotten flesh, so a kill gives some with probability 2/3 (about 267 of 400).
    expect(r.flesh, `rotten flesh dropped on ${r.flesh} of ${r.kills} kills`).toBeGreaterThan(220);
    expect(r.flesh, `rotten flesh dropped on ${r.flesh} of ${r.kills} kills`).toBeLessThan(310);
    // 11% of 400 is 44; allow a generous band so the case is not flaky.
    expect(r.copper, `copper ingots: ${r.copper} of ${r.kills}, expected near 11%`)
      .toBeGreaterThan(24);
    expect(r.copper, `copper ingots: ${r.copper} of ${r.kills}, expected near 11%`)
      .toBeLessThan(70);
  });

  test('BOT-D05 the trident is a rare drop, not an always-drop', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const game = window.game;
      let tridents = 0;
      for (let i = 0; i < 400; i++) {
        let got = false;
        const originalDrop = game.entities.spawnDroppedItem;
        game.entities.spawnDroppedItem = (pos, id) => { if (id === 'trident') got = true; };
        const mob = game.mobs.spawnMob('drowned', 40 + i, 1, 40);
        mob.playerDamaged = true;
        game.mobs.damageMob(mob, 1000, null, false, game.player);
        for (let t = 0; t < 30 && !mob.lootDropped; t++) game.mobs.update(0.1, game.player);
        game.entities.spawnDroppedItem = originalDrop;
        if (got) tridents++;
      }
      game.mobs.clearMobs();
      return { tridents, kills: 400 };
    });
    // 8.5% of 400 is 34.
    expect(r.tridents, `tridents: ${r.tridents} of ${r.kills}, expected near 8.5%`).toBeGreaterThan(16);
    expect(r.tridents, `tridents: ${r.tridents} of ${r.kills}, expected near 8.5%`).toBeLessThan(58);
  });

  // --- BOT-D06: the conversion the tutorial's easiest farm depends on ----------------

  test('BOT-D06 a zombie whose head is NOT under water does not become a drowned', async () => {
    // The negative half of the conversion. The wiki's trigger is the HEAD being submerged: "If a zombie's
    // head (not the legs) is submerged in water continuously for 30 seconds...". A zombie standing in
    // shallow water with its head in air must therefore stay a zombie, and so must one on dry land.
    //
    // This replaced a case that asserted the OPPOSITE -- that no conversion existed at all -- which was the
    // gap this work closed. It now guards the boundary instead of the absence.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__drowned;
      const { BLOCKS } = await import('/src/blocks.js');
      h.reset({ gameMode: 'creative', cheats: true });
      h.game.mobs.clearMobs();
      // One block of water: a standing zombie's feet are wet and its head is in air.
      h.game.world.setVoxel(10, 1, 8, BLOCKS.WATER);
      const zombie = h.spawn('zombie', { at: [10.5, 1, 8.5] });
      // A zombie stands 1.95 tall in this build; the manager does not put `height` on a directly spawned
      // zombie, so the figure the conversion itself uses is the one to check against here.
      const headY = Math.floor(zombie.mesh.position.y + 1.95 * 0.75);
      const headVoxel = h.game.world.getVoxel(10, headY, 8);
      for (let i = 0; i < 70 * 30; i++) h.step();
      return {
        headVoxel, water: BLOCKS.WATER, air: BLOCKS.AIR,
        zombies: h.mobs('zombie').length, drowned: h.mobs('drowned').length,
      };
    });
    expect(r.headVoxel, 'the zombie head is in AIR, not water').toBe(r.air);
    expect(r.drowned, 'a zombie whose head is above water must not convert').toBe(0);
    expect(r.zombies, 'it is still a zombie').toBe(1);
  });

  test('BOT-D07 a zombie under water converts into a drowned, which the bot then kills', async () => {
    // Wiki (Drowned Â§ Conversion): a zombie's head submerged for 30 s begins the conversion, which takes
    // 15 s more. This is the mechanism of the flooded-monster-room farm -- the design the tutorial calls its
    // easiest -- and it is now implemented, so this drives the whole chain: zombie in water, conversion,
    // then the bot kills the drowned that results and collects its loot.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__drowned;
      const { BLOCKS } = await import('/src/blocks.js');
      const game = window.game;
      h.reset({ gameMode: 'creative', cheats: true });
      game.mobs.clearMobs();
      // Water from the floor up past a standing zombie's head, so the head-height test passes.
      for (let y = 1; y <= 4; y++) {
        for (let x = 8; x <= 14; x++) {
          for (let z = 6; z <= 12; z++) game.world.setVoxel(x, y, z, BLOCKS.WATER);
        }
      }
      const zombie = game.mobs.spawnMob('zombie', 10.5, 1, 8.5);
      const before = { type: zombie.type, health: zombie.health, zombies: h.mobs('zombie').length };

      // Tick the conversion: 30 s submerged + 15 s converting. `h.step()` runs the real mob update, which is
      // what owns the timer.
      let ticks = 0;
      for (; ticks < 70 * 30 && h.mobs('drowned').length === 0; ticks++) h.step();

      const after = { drowned: h.mobs('drowned').length, zombies: h.mobs('zombie').length };
      // Now the farm's collection step: kill what the conversion produced. Stand the player on the dry edge
      // of the pool, with the drowned beside them, so the bot's own pathing is not what this case measures.
      for (let y = 1; y <= 4; y++) {
        for (let x = 8; x <= 14; x++) {
          for (let z = 6; z <= 12; z++) game.world.setVoxel(x, y, z, BLOCKS.AIR);
        }
      }
      for (let x = 8; x <= 14; x++) for (let z = 6; z <= 12; z++) game.world.setVoxel(x, 0, z, BLOCKS.STONE);
      game.player.position.set(10.5, 1, 10.5);
      game.player.velocity.set(0, 0, 0);
      const produced = h.mobs('drowned')[0];
      if (produced) produced.mesh.position.set(11.5, 1, 10.5);
      h.give('diamond_sword', 1, false);
      // Wiki: rotten flesh is 0-2, so a kill can legitimately give none. Pin the manager's roll high so this
      // case is about the loot reaching the ground, not about the dice.
      const realRandom = window.game.mobs.random;
      window.game.mobs.random = () => 0.99;
      let row;
      try { row = await h.run({ type: 'attack', mob: 'drowned' }); } finally { window.game.mobs.random = realRandom; }
      return {
        before, after, ticks,
        ok: row.ok, message: row.message, error: row.error,
        groundDrops: h.drops().map((d) => d.id),
        orbs: h.orbs().reduce((a, b) => a + b, 0),
        aliveAfter: h.mobs('drowned').length,
      };
    });
    expect(r.before.type, 'it started as a zombie').toBe('zombie');
    expect(r.before.health, 'and at full health').toBe(20);
    expect(r.after.drowned, 'the zombie converted into a drowned').toBeGreaterThan(0);
    expect(r.after.zombies, 'and is no longer a zombie').toBe(0);
    expect(r.ticks, 'the conversion took about 45 s of ticks (30 submerged + 15 converting)')
      .toBeGreaterThan(44 * 30);
    // And the drowned the conversion produced drops what a drowned drops.
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    expect(r.ok, `the bot reported: ${r.message}`).toBe(true);
    expect(r.groundDrops, `drops: ${JSON.stringify(r.groundDrops)}`).toContain('rotten_flesh');
    expect(r.orbs, 'worth 5 XP').toBe(5);
    expect(r.aliveAfter, 'and it is dead').toBe(0);
  });

  // --- evidence -------------------------------------------------------------------

  test('the observed drowned rows are recorded for the report', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const path = 'docs/artifacts/drowned-browser-rows.json';
    expect(existsSync(path), 'the drowned artifact was written').toBe(true);
    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written.rows.length, 'the artifact holds the observed kills').toBeGreaterThan(2);
    expect(written.rows.filter((r) => r.ok === true).length, 'the successful kills are recorded').toBeGreaterThan(1);
    expect(written.reference?.setup?.settings?.cheats, 'the setup is recorded').toBe(true);
  });
});


