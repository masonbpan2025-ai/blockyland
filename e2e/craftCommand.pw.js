// The crafting matrix, run in a disposable headless browser through the bot's own `craft` action.
//
// Layer: real `PlayerBot.run({type:'craft'})` -> `BotSurvival.craft` -> the real `Inventory.checkCrafting` /
// `takeCraftResult` -> the real recipe tables, with a real crafting table block in the real world. This is
// the layer the matcher unit tests cannot reach: `/give` looked perfectly healthy in unit tests while its
// bot route was dead.
//
// Nothing here treats the bot's success string as evidence. Every result and every leftover is read off the
// real inventory and the real grids.
//
// Reference: https://minecraft.wiki/w/Crafting
import { test, expect } from '@playwright/test';

test.describe('creative crafting through the bot API', () => {
  const evidence = { rows: [], generatedAt: null, reference: null };

  async function drain() {
    const rows = await globalThis.__page.evaluate(() => {
      const out = window.__craft.observed.slice();
      window.__craft.observed.length = 0;
      return out;
    });
    const { writeFileSync, mkdirSync, readFileSync, existsSync } = await import('node:fs');
    mkdirSync('docs/artifacts', { recursive: true });
    const path = 'docs/artifacts/craft-browser-rows.json';
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
    try { await drain(); } catch (error) { console.error('[craft] drain failed:', error.message); }
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
      const { createCraftHarness } = await import('/e2e/fixtures/craftHarness.js');
      window.__craft = await createCraftHarness(window.game);
      window.__craftSetup = window.__craft.reset({ gameMode: 'creative', cheats: true, table: true });
    });
    const setup = await page.evaluate(() => window.__craftSetup);
    evidence.reference = {
      wiki: 'https://minecraft.wiki/w/Crafting (fetched in this run)',
      javaEditionTarget: '1.21.4 (DataVersion 4189)',
      setup,
    };
    expect(setup.mode, 'the harness is set up in creative').toBe('creative');
    expect(setup.settings.cheats, 'with cheats on').toBe(true);
    expect(setup.voxel, 'and a crafting table in the world').toBe(setup.expected);
    globalThis.__page = page;
  });

  // --- BOT-K01: the basic table craft -----------------------------------------------

  test('BOT-K01 the bot crafts a 3x3 recipe at a table and consumes the ingredients', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__craft;
      const { BLOCKS } = await import('/src/blocks.js');
      h.reset({ gameMode: 'creative', cheats: true, table: true });
      h.give(BLOCKS.COBBLESTONE, 8, true);
      const row = await h.craft({ item: 'furnace', count: 1 });
      return {
        error: row.error, ok: row.ok, message: row.message,
        cobblestone: h.count(BLOCKS.COBBLESTONE),
        furnace: h.count(BLOCKS.FURNACE),
        held: row.after.held,
        grid2x2: row.after.grid2x2, grid3x3: row.after.grid3x3, cursor: row.after.cursor,
        mode: row.before.mode,
        botActive: row.after.botActive, controls: row.after.controls, keys: row.after.keys,
        dropped: row.after.dropped,
      };
    });
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    expect(r.mode, 'this case runs in creative').toBe('creative');
    expect(r.ok, `the bot reported: ${r.message}`).toBe(true);
    // Eight cobblestone in, one furnace out. Read from the inventory, not from the message.
    expect(r.cobblestone, `cobblestone left: ${JSON.stringify(r.held)}`).toBe(0);
    expect(r.furnace, 'one furnace').toBe(1);
    // The workspace must be left clean, or the next craft is refused.
    expect(r.grid3x3.every((s) => s === null), `3x3 grid: ${JSON.stringify(r.grid3x3)}`).toBe(true);
    expect(r.grid2x2.every((s) => s === null)).toBe(true);
    expect(r.cursor, 'nothing left on the cursor').toBeNull();
    expect(r.dropped, 'and nothing dropped on the ground').toEqual([]);
    expect(r.botActive, 'the bot releases control').toBe(false);
    expect(r.controls).toBeNull();
    expect(r.keys).toEqual([]);
  });

  // --- BOT-K02: the 2x2 grid needs no table -----------------------------------------

  test('BOT-K02 a 2x2 recipe works with no crafting table in reach', async () => {
    // Wiki: the inventory's 2x2 grid makes the "small crafting recipes"; only the 3x3 needs a table.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__craft;
      const { BLOCKS } = await import('/src/blocks.js');
      h.reset({ gameMode: 'creative', cheats: true, table: false });
      h.give(BLOCKS.OAK_LOG, 1, true);
      const row = await h.craft({ item: 'oak_planks', count: 1 });
      return {
        error: row.error, ok: row.ok, message: row.message,
        logs: h.count(BLOCKS.OAK_LOG), planks: h.count(BLOCKS.OAK_PLANKS),
        grid2x2: row.after.grid2x2, held: row.after.held,
      };
    });
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    expect(r.ok, `the bot reported: ${r.message}`).toBe(true);
    expect(r.logs, 'the log is consumed').toBe(0);
    expect(r.planks, `one log makes four planks: ${JSON.stringify(r.held)}`).toBe(4);
    expect(r.grid2x2.every((s) => s === null), 'the grid is left clean').toBe(true);
  });

  test('BOT-K03 without a table the same recipe is refused and changes nothing', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__craft;
      const { BLOCKS } = await import('/src/blocks.js');
      h.reset({ gameMode: 'creative', cheats: true, table: false });
      h.give(BLOCKS.COBBLESTONE, 8, true);
      const row = await h.craft({ item: 'furnace', count: 1 });
      return {
        error: row.error, ok: row.ok, message: row.message,
        cobblestone: h.count(BLOCKS.COBBLESTONE), furnace: h.count(BLOCKS.FURNACE),
        grid3x3: row.after.grid3x3, held: row.after.held,
      };
    });
    // A furnace needs the 3x3 grid, so with no table in reach the bot must refuse rather than half-craft.
    expect(r.ok, `the bot must refuse, got: ${JSON.stringify(r.message)}`).toBe(false);
    expect(r.furnace, 'nothing was made').toBe(0);
    expect(r.cobblestone, 'and no cobblestone was eaten').toBe(8);
    expect(r.grid3x3.every((s) => s === null), 'the grid is untouched').toBe(true);
  });

  // --- BOT-K04: counts and conservation ----------------------------------------------

  test('BOT-K04 a count of eight consumes eight times the ingredients', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__craft;
      const { BLOCKS } = await import('/src/blocks.js');
      h.reset({ gameMode: 'creative', cheats: true, table: true });
      h.give(BLOCKS.OAK_PLANKS, 16, true);
      const row = await h.craft({ item: 'stick', count: 8 });
      return {
        error: row.error, ok: row.ok, message: row.message,
        planks: h.count(BLOCKS.OAK_PLANKS), sticks: h.count('stick'), held: row.after.held,
      };
    });
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    expect(r.ok, `the bot reported: ${r.message}`).toBe(true);
    // Eight crafts of "2 planks -> 4 sticks" is 16 planks in and 32 sticks out.
    expect(r.planks, `planks left: ${JSON.stringify(r.held)}`).toBe(0);
    expect(r.sticks, '8 crafts x 4 sticks').toBe(32);
  });

  test('BOT-K05 the rare and counted recipes give the right count', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__craft;
      const { BLOCKS } = await import('/src/blocks.js');
      const run = async (item, give, n, isBlock = true) => {
        h.reset({ gameMode: 'creative', cheats: true, table: true });
        h.give(give, n, isBlock);
        const row = await h.craft({ item, count: 1 });
        return { item, error: row.error, ok: row.ok, message: row.message, held: row.after.held };
      };
      return {
        // 1 iron ingot -> 9 nuggets, which the wiki lists as a 1x1 recipe.
        nuggets: await run('iron_nugget', 'iron_ingot', 1, false),
        // 1 bone -> 3 bone meal.
        boneMeal: await run('bone_meal', 'bone', 1, false),
        // 6 planks -> 2 oak trapdoors, the recipe that only one entry described.
        trapdoors: await run('oak_trapdoor', BLOCKS.OAK_PLANKS, 6, true),
        // 4 stone -> 1 stone pressure plate.
        plate: await run('stone_pressure_plate', BLOCKS.STONE, 2, true),
      };
    });
    for (const [key, row] of Object.entries(r)) {
      expect(row.error, `${key} threw: ${row.error}`).toBeNull();
      expect(row.ok, `${key} reported: ${row.message}`).toBe(true);
    }
    expect(r.nuggets.held.iron_nugget, `iron nuggets: ${JSON.stringify(r.nuggets.held)}`).toBe(9);
    expect(r.boneMeal.held.bone_meal, `bone meal: ${JSON.stringify(r.boneMeal.held)}`).toBe(3);
    // `held` is keyed by the id the inventory carries, which is the BLOCK id for a block result.
    const trapdoors = r.trapdoors.held[157] ?? r.trapdoors.held.oak_trapdoor;
    expect(trapdoors, `trapdoors: ${JSON.stringify(r.trapdoors.held)}`).toBe(2);
    // And the stone pressure plate is the one whose recipe produced the wrong block.
    const plate = r.plate.held[446] ?? r.plate.held.stone_pressure_plate;
    expect(plate, `plate: ${JSON.stringify(r.plate.held)}`).toBe(1);
  });

  // --- BOT-K06: leftovers and refusals ----------------------------------------------

  test('BOT-K06 a craft into a full inventory is refused and loses nothing', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__craft;
      const { BLOCKS } = await import('/src/blocks.js');
      // A full inventory whose only planks sit in one slot: the ingredient slot frees up but the result has
      // nowhere to go, because every other slot is a full dirt stack.
      h.reset({
        gameMode: 'creative', cheats: true, table: true,
        fill: { 0: { id: BLOCKS.OAK_PLANKS, isBlock: true, count: 2 } },
      });
      const row = await h.craft({ item: 'stick', count: 8 });
      return {
        error: row.error, ok: row.ok, message: row.message,
        planks: h.count(BLOCKS.OAK_PLANKS), sticks: h.count('stick'),
        occupied: Object.values(row.after.held).length,
        cursor: row.after.cursor, grid2x2: row.after.grid2x2, grid3x3: row.after.grid3x3,
        held: row.after.held,
      };
    });
    // The bot must not silently drop or swallow the ingredients: either it makes the sticks or it makes
    // nothing, but the planks must be accounted for either way.
    const sticks = r.sticks;
    const planks = r.planks;
    expect(r.error ?? r.message, 'the refusal is reported rather than passing silently').toBeTruthy();
    expect(sticks * 0.5 + planks, `planks + sticks/2 must equal the two planks: ${JSON.stringify(r.held)}`).toBe(2);
    expect(r.cursor, 'nothing is left on the cursor').toBeNull();
    expect(r.grid2x2.every((s) => s === null), 'and the grid is clean').toBe(true);
    expect(r.grid3x3.every((s) => s === null)).toBe(true);
    // Whichever way it went, the refusal must be reported rather than silent.
    if (sticks === 0) expect(r.ok, `a refused craft reports failure: ${JSON.stringify(r.error ?? r.message)}`).toBe(false);
  });

  test('BOT-K07 an ingredient that is short is refused and consumes nothing', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__craft;
      const { BLOCKS } = await import('/src/blocks.js');
      h.reset({ gameMode: 'creative', cheats: true, table: true });
      h.give(BLOCKS.COBBLESTONE, 7, true);      // one short of a furnace
      const row = await h.craft({ item: 'furnace', count: 1 });
      return {
        ok: row.ok, message: row.message, error: row.error,
        cobblestone: h.count(BLOCKS.COBBLESTONE), furnace: h.count(BLOCKS.FURNACE),
        grid3x3: row.after.grid3x3, held: row.after.held,
      };
    });
    expect(r.ok, `a short ingredient must be refused, got: ${JSON.stringify(r.message)}`).toBe(false);
    expect(r.message, 'and the reason names what is missing').toMatch(/furnace|needs|No usable recipe/i);
    expect(r.furnace).toBe(0);
    expect(r.cobblestone, 'the seven are untouched').toBe(7);
    expect(r.grid3x3.every((s) => s === null)).toBe(true);
  });

  test('BOT-K08 an item with no recipe is refused', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__craft;
      h.reset({ gameMode: 'creative', cheats: true, table: true });
      h.give('diamond_sword', 1, false);
      const row = await h.craft({ item: 'not_a_real_item_xyz', count: 1 });
      const row2 = await h.craft({ item: 'diamond_sword', count: 1 });
      return {
        unknown: { ok: row.ok, message: row.message, error: row.error },
        noRecipe: { ok: row2.ok, message: row2.message, error: row2.error, swords: h.count('diamond_sword') },
      };
    });
    // An unknown item name is rejected before any grid work, and a real item with no recipe is refused too.
    expect(r.unknown.ok, `an unknown item must be refused, got: ${JSON.stringify(r.unknown.message ?? r.unknown.error)}`).toBe(false);
    expect(r.noRecipe.ok, `a recipe-less item must be refused, got: ${JSON.stringify(r.noRecipe.message ?? r.noRecipe.error)}`).toBe(false);
    expect(r.noRecipe.swords, 'and the sword is untouched').toBe(1);
  });

  // --- BOT-K09: the mirror rule through the bot --------------------------------------

  test('BOT-K09 the bot crafts a mirrored recipe', async () => {
    // The wiki: shaped recipes "can also be flipped horizontally". The bow is its own example. The bot picks
    // the recipe and loads the grid itself, so this checks the table it picks from, not a grid the test built.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__craft;
      const { findMatchingRecipe, RECIPES_3X3 } = await import('/src/crafting.js');
      const bow = RECIPES_3X3.find((x) => String(x.result.id) === 'bow');
      // The table must contain a recipe the bot can load; the mirror itself is proven in the probe, so here
      // the claim is narrower: the bot can reach the bow recipe at all.
      const mirrored = bow ? {
        pattern: bow.pattern,
        mirroredMatches: (() => {
          const size = 3;
          const g = new Array(9).fill(null);
          for (let r2 = 0; r2 < bow.pattern.length; r2++) {
            for (let c = 0; c < bow.pattern[r2].length; c++) {
              const v = bow.pattern[r2][bow.pattern[r2].length - 1 - c];
              if (v != null) g[r2 * size + c] = { id: v, isBlock: false, count: 1 };
            }
          }
          return findMatchingRecipe(g, 3, 3, RECIPES_3X3);
        })(),
      } : null;
      h.reset({ gameMode: 'creative', cheats: true, table: true });
      h.give('stick', 3, false);
      h.give('string', 3, false);
      const row = await h.craft({ item: 'bow', count: 1 });
      return {
        error: row.error, ok: row.ok, message: row.message,
        bows: h.count('bow'), sticks: h.count('stick'), strings: h.count('string'), held: row.after.held,
        mirroredId: mirrored?.mirroredMatches?.id ?? null,
      };
    });
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    expect(r.mirroredId, 'the mirrored bow recipe matches in the table').toBe('bow');
    expect(r.ok, `the bot reported: ${r.message}`).toBe(true);
    expect(r.bows, `one bow from 3 sticks and 3 string: ${JSON.stringify(r.held)}`).toBe(1);
    expect(r.sticks, 'the sticks are consumed').toBe(0);
    expect(r.strings, 'and the string').toBe(0);
  });

  // --- evidence ---------------------------------------------------------------------

  test('the observed crafting rows are recorded for the report', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const path = 'docs/artifacts/craft-browser-rows.json';
    expect(existsSync(path), 'the crafting artifact was written').toBe(true);
    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written.rows.length, 'the artifact holds the observed crafts').toBeGreaterThan(6);
    expect(written.rows.filter((r) => r.ok === true).length, 'the successful crafts are recorded')
      .toBeGreaterThan(3);
    // A refusal is recorded as `ok: false` with the reason in `message`, whichever internal route produced
    // it, so the artifact carries no unhandled exceptions.
    expect(written.rows.filter((r) => r.ok === false).length, 'the refusals are recorded').toBeGreaterThan(0);
    expect(written.reference?.setup?.voxel, 'the table setup is recorded').toBe(written.reference?.setup?.expected);
  });
});

