// The brewing matrix, run in a disposable headless browser through the bot's own `brew` action.
//
// Layer: real `PlayerBot.run({type:'brew'})` -> `BotSurvival.brew` -> real `BrewingStand` (held by the real
// `game.brewingManager`) -> real `Inventory`. This is the same end-to-end route the `/give` suite uses, and
// it is the layer the model-only unit tests cannot reach: `/give` looked perfectly healthy in unit tests
// while its bot route was dead.
//
// Nothing here treats the bot's success string as evidence. Every potion is read out of the inventory, and
// every stand slot is read out of the stand.
//
// Reference: https://minecraft.wiki/w/Brewing and https://minecraft.wiki/w/Brewing_stand.
import { test, expect } from '@playwright/test';

const BOT = 'BOT_API';

test.describe('creative brewing through the bot API', () => {
  const evidence = { rows: [], generatedAt: null, reference: null };

  async function drain() {
    const rows = await globalThis.__page.evaluate(() => {
      const out = window.__brew.observed.slice();
      window.__brew.observed.length = 0;
      return out;
    });
    const { writeFileSync, mkdirSync, readFileSync, existsSync } = await import('node:fs');
    mkdirSync('docs/artifacts', { recursive: true });
    const path = 'docs/artifacts/brewing-browser-rows.json';
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
    try { await drain(); } catch (error) { console.error('[brew] drain failed:', error.message); }
  });

  test.afterAll(async () => { await globalThis.__page?.close(); });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(600000);
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(300000);
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForFunction(
      () => window.game?.playerBot && window.game?.inventory && window.game?.entities && window.game?.ui,
      null, { timeout: 300000 },
    );
    await page.evaluate(async () => {
      const { createBrewHarness } = await import('/e2e/fixtures/brewHarness.js');
      window.__brew = await createBrewHarness(window.game);
      window.__brewSetup = window.__brew.reset({ gameMode: 'creative', cheats: true });
    });
    const setup = await page.evaluate(() => window.__brewSetup);
    evidence.reference = {
      wiki: 'https://minecraft.wiki/w/Brewing revision fetched 2026-10-11; /w/Brewing_stand for the 20-second figure',
      javaEditionTarget: '1.21.4 (DataVersion 4189)',
      setup,
    };
    expect(setup.mode, 'the harness is set up in creative').toBe('creative');
    expect(setup.settings, 'with cheats on').toEqual({ gameMode: 'creative', cheats: true });
    expect(setup.voxel, 'and a brewing stand in the world').toBe(setup.expected);
    globalThis.__page = page;
  });

  // --- BOT-B01: the basic brew ------------------------------------------------------

  test('BOT-B01 water bottle + nether wart brews an awkward potion', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__brew;
      h.reset({ gameMode: 'creative', cheats: true });
      const row = await h.brew({ item: 'nether_wart', bottle: 'water_bottle', count: 1, bottleCount: 1, position: [2, 1, 0] });
      return {
        error: row.error, attempts: row.after.items,
        awkward: h.count('awkward_potion'),
        water: h.count('water_bottle'),
        netherWart: h.count('nether_wart'),
        standAfter: row.after.stand,
        botActive: row.after.botActive,
        controls: row.after.controls,
        keys: row.after.keys,
        setup: { stand: row.before.stand, mode: row.before.mode, settings: row.before.settings },
      };
    });
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    expect(r.setup.mode, 'this case runs in creative').toBe('creative');
    expect(r.awkward, `inventory after the brew: ${JSON.stringify(r.attempts)}`).toBe(1);
    expect(r.water, 'the water bottle was consumed into the potion').toBe(0);
    expect(r.standAfter, 'the stand is left empty and ready').not.toBeNull();
    expect(r.standAfter.bottles, 'no bottle is left behind on the stand').toEqual([null, null, null]);
    expect(r.standAfter.ingredient, 'the ingredient was consumed').toBeNull();
    // Creative brewing is free of the 20-second wait, but the charge is still a real one.
    expect(r.standAfter.fuel, 'one fuel charge is spent').toBe(19);
    expect(r.botActive, 'the bot releases control').toBe(false);
    expect(r.controls).toBeNull();
    expect(r.keys).toEqual([]);
  });

  test('BOT-B02 three bottles brew at once into three potions', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__brew;
      h.reset({ gameMode: 'creative', cheats: true });
      const row = await h.brew({ item: 'nether_wart', bottle: 'water_bottle', count: 1, bottleCount: 3, position: [2, 1, 0] });
      return {
        error: row.error, awkward: h.count('awkward_potion'), water: h.count('water_bottle'),
        standAfter: row.after.stand, items: row.after.items,
      };
    });
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    expect(r.awkward, `inventory: ${JSON.stringify(r.items)}`).toBe(3);
    expect(r.water).toBe(0);
    expect(r.standAfter.bottles).toEqual([null, null, null]);
    // One ingredient and one fuel charge cover all three bottles, as vanilla's stand does.
    expect(r.standAfter.ingredient).toBeNull();
    expect(r.standAfter.fuel).toBe(19);
  });

  // --- BOT-B03: the modifier chain --------------------------------------------------

  test('BOT-B03 the Strength chain: brew, extend, enhance', async () => {
    // water -> awkward -> Strength, then redstone extends and glowstone enhances. Each stage brews from the
    // potion the previous stage really produced, so this also checks the result feeds forward.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__brew;
      h.reset({ gameMode: 'creative', cheats: true });
      const stages = [];
      const run = async (item, bottle, label) => {
        const row = await h.brew({ item, bottle, count: 1, bottleCount: 1, position: [2, 1, 0] });
        stages.push({
          label, item, bottle, error: row.error,
          standAfter: row.after.stand,
          counts: {
            awkward: h.count('awkward_potion'),
            strength: h.count('potion_of_strength'),
            strengthLong: h.count('potion_of_strength_long'),
            strength2: h.count('potion_of_strength_2'),
          },
        });
        return row;
      };
      await run('nether_wart', 'water_bottle', 'base');
      await run('blaze_powder', 'awkward_potion', 'strength');
      await run('redstone', 'potion_of_strength', 'extended');
      await run('glowstone_dust', 'potion_of_strength', 'enhanced');
      return { stages };
    });
    for (const s of r.stages) expect(s.error, `${s.label} threw: ${s.error}`).toBeNull();
    const [base, strength, extended, enhanced] = r.stages;
    expect(base.counts.awkward, 'stage 1 makes the awkward base').toBe(1);
    expect(strength.counts.strength, 'stage 2 adds blaze powder for Strength').toBe(1);
    expect(extended.counts.strengthLong, 'stage 3 extends it with redstone').toBe(1);
    expect(enhanced.counts.strength2, 'stage 4 enhances it with glowstone').toBe(1);
    expect(enhanced.standAfter.bottles, 'and every stand slot ends empty').toEqual([null, null, null]);
  });

  test('BOT-B04 gunpowder makes a splash potion and dragon breath makes it lingering', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__brew;
      h.reset({ gameMode: 'creative', cheats: true });
      const stages = [];
      const run = async (item, bottle, label, expectId) => {
        const row = await h.brew({ item, bottle, count: 1, bottleCount: 1, position: [2, 1, 0] });
        stages.push({
          label, expectId, ok: row.result?.ok, message: row.result?.message, error: row.error,
          // Read the count straight after the stage: the next stage consumes it, so a final tally would be
          // measuring the wrong moment.
          inInventory: h.count(expectId),
          items: row.after.items,
          standAfter: row.after.stand,
        });
        return row;
      };
      await run('nether_wart', 'water_bottle', 'awkward', 'awkward_potion');
      await run('blaze_powder', 'awkward_potion', 'strength', 'potion_of_strength');
      await run('gunpowder', 'potion_of_strength', 'splash', 'splash_potion_of_strength');
      await run('dragon_breath', 'splash_potion_of_strength', 'lingering', 'lingering_potion_of_strength');
      return { stages };
    });
    for (const s of r.stages) {
      expect(s.error, `${s.label} threw: ${s.error}`).toBeNull();
      expect(s.ok, `${s.label} reported: ${s.message}`).toBe(true);
      expect(s.inInventory, `${s.label} should leave one ${s.expectId}; inventory ${JSON.stringify(s.items)}`).toBe(1);
      expect(s.standAfter.bottles, `${s.label} should leave no bottle behind`).toEqual([null, null, null]);
    }
  });

  // --- BOT-B05..06: refusals --------------------------------------------------------

  test('BOT-B05 an ingredient that transforms nothing is refused and consumes nothing', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__brew;
      h.reset({ gameMode: 'creative', cheats: true });
      const row = await h.brew({ item: 'nether_wart', bottle: 'potion_of_healing', count: 1, bottleCount: 1, position: [2, 1, 0] });
      return {
        error: row.error, ok: row.result?.ok, message: row.result?.message,
        healing: h.count('potion_of_healing'), awkward: h.count('awkward_potion'),
        standAfter: row.after.stand, items: row.after.items,
        botActive: row.after.botActive, controls: row.after.controls,
      };
    });
    // Brewing nether wart into a Potion of Healing is not a vanilla recipe, so nothing may be produced.
    // The refusal arrives as a rejected task (`ok: false`), not an exception.
    expect(r.error, 'a refused action is reported as a result, not an exception').toBeNull();
    expect(r.ok, `the bot must report the refusal, got ${JSON.stringify(r.message)}`).toBe(false);
    expect(r.message, 'and say what it could not brew').toMatch(/cannot brew/i);
    expect(r.awkward, 'no awkward potion is invented').toBe(0);
    // "There is no time limit; fuel is consumed only when there are water bottles and an ingredient to brew
    // into it" -- an inert pairing must not spend a charge either.
    expect(r.standAfter.fuel, 'a refused brew spends no fuel').toBe(20);
    expect(r.botActive, 'the bot does not stay stuck in a task').toBe(false);
    expect(r.controls).toBeNull();
  });

  test('BOT-B06 brewing out of reach of the stand is refused', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__brew;
      h.reset({ gameMode: 'creative', cheats: true });
      // Move the player far away, leaving the stand where it is.
      h.game.player.position.set(40.5, 1, 40.5);
      const row = await h.brew({ item: 'nether_wart', bottle: 'water_bottle', count: 1, bottleCount: 1, position: [2, 1, 0] });
      return { error: row.error, ok: row.result?.ok, message: row.result?.message, awkward: h.count('awkward_potion'), standAfter: row.after.stand };
    });
    expect(r.ok, 'a station out of reach must be refused').toBe(false);
    expect(r.message).toMatch(/reach/i);
    expect(r.awkward, 'and nothing is brewed').toBe(0);
  });

  // --- BOT-B07: the stand as a block entity -----------------------------------------

  test('BOT-B07 the stand persists across commands, and a refusal consumes nothing', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__brew;
      h.reset({ gameMode: 'creative', cheats: true });
      const stages = [];
      const run = async (item, bottle, label, expectId) => {
        const row = await h.brew({ item, bottle, count: 1, bottleCount: 1, position: [2, 1, 0] });
        stages.push({
          label, expectId, ok: row.result?.ok, message: row.result?.message,
          made: h.count(expectId), standAfter: row.after.stand, items: row.after.items,
        });
        return row;
      };
      // Stage 1 brews a real potion. Stage 2 asks for something that is NOT a vanilla recipe -- glowstone
      // goes on a water bottle to make a Thick Potion, not onto an awkward one -- and must be refused
      // without consuming the potion or the ingredient. Stage 3 then brews a real recipe on the SAME stand,
      // which is what proves the block entity survived the refusal rather than being thrown away.
      await run('nether_wart', 'water_bottle', 'awkward', 'awkward_potion');
      const refused = await run('glowstone_dust', 'awkward_potion', 'refused', 'thick_potion');
      await run('sugar', 'awkward_potion', 'swiftness', 'potion_of_swiftness');
      return { stages, refusedStand: refused.after.stand, fuel: h.stand()?.fuel, awkward: h.count('awkward_potion') };
    });
    const [first, refused, third] = r.stages;
    expect(first.ok, `stage 1 reported: ${first.message}`).toBe(true);
    expect(first.made, 'stage 1 leaves one awkward potion').toBe(1);
    expect(first.standAfter.bottles, 'stage 1 empties the bottle slots').toEqual([null, null, null]);

    expect(refused.ok, `stage 2 should be refused, got: ${refused.message}`).toBe(false);
    expect(refused.message).toMatch(/cannot brew/i);
    // The refused stage left its inputs ON the stand: a brew that cannot happen must not eat them.
    expect(r.refusedStand.ingredient?.id, 'the refused ingredient is still on the stand').toBe('glowstone_dust');
    expect(r.refusedStand.bottles[0]?.id, 'and the potion is still in its bottle slot').toBe('awkward_potion');
    expect(r.refusedStand.fuel, 'a refused stage spends no fuel').toBe(19);

    expect(third.ok, `stage 3 reported: ${third.message}`).toBe(true);
    expect(third.made, 'stage 3 brews the awkward potion into Swiftness on the same stand').toBe(1);
    expect(third.standAfter.bottles, 'and leaves it empty again').toEqual([null, null, null]);
    expect(r.fuel, 'two completed stages spend two charges').toBe(18);
  });

  test('BOT-B08 the stand, not the inventory, holds the bottles mid-brew', async () => {
    // In survival the brew takes 20 s of ticks, and the bottles must sit ON the stand during it. Creative
    // completes in one step, so this case reads the stand's own state before collection instead.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__brew;
      const { BrewingStand } = await import('/src/brewing.js');
      const stand = new BrewingStand(2, 1, 0);
      stand.addFuel({ id: 'blaze_powder' });
      const water = { id: 'water_bottle', count: 1 };
      stand.ingredient = { id: 'nether_wart', count: 1 };
      stand.bottles = [water, null, null];
      const canStart = stand.canBrew();
      const midway = stand.update(10);           // ten seconds into a twenty-second stage
      const afterTen = { isBrewing: stand.isBrewing, progress: Number(stand.getProgress().toFixed(3)), bottle: stand.bottles[0].id };
      const finished = stand.update(10);         // the second ten seconds
      return {
        canStart, midway, afterTen, finished,
        bottleAtEnd: stand.bottles[0].id,
        ingredientAtEnd: stand.ingredient,
        fuelAtEnd: stand.fuel,
        brewDuration: stand.brewDuration,
      };
    });
    // Timing is the model layer's own claim, checked here through the real class the item uses.
    expect(r.canStart, 'a primed stand can start').toBe(true);
    expect(r.brewDuration, 'one stage is vanilla\'s 20 seconds').toBe(20);
    expect(r.midway, 'nothing lands at ten seconds').toBe(false);
    expect(r.afterTen.bottle, 'the bottle is still water at the halfway point').toBe('water_bottle');
    expect(r.afterTen.isBrewing).toBe(true);
    expect(r.afterTen.progress, 'the progress bar tracks the stage').toBeCloseTo(0.5, 2);
    expect(r.finished, 'the stage lands on the second ten seconds').toBe(true);
    expect(r.bottleAtEnd).toBe('awkward_potion');
    expect(r.ingredientAtEnd, 'the ingredient is consumed').toBeNull();
    expect(r.fuelAtEnd, 'and one charge is spent').toBe(19);
  });

  // --- evidence ---------------------------------------------------------------------

  test('the observed brewing rows are recorded for the report', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const path = 'docs/artifacts/brewing-browser-rows.json';
    expect(existsSync(path), 'the brewing artifact was written').toBe(true);
    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written.rows.length, 'the artifact holds the observed brews').toBeGreaterThan(6);
    // A refusal is reported as a failed result rather than an exception, so that is what to count here.
    expect(written.rows.filter((r) => r.ok === false).length, 'the deliberate refusals are recorded')
      .toBeGreaterThan(0);
    expect(written.rows.filter((r) => r.error).length, 'no brew threw an exception').toBe(0);
  });
});
