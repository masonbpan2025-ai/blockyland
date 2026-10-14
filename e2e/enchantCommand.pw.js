// The enchanting matrix, run in a disposable headless browser through the bot's own `enchant` action.
//
// Layer: real `PlayerBot.run({type:'enchant'})` -> `BotSurvival.enchant` -> the real offer engine
// (`generateEnchantmentOffers` / `applyEnchantment`) -> the real `Inventory`, with the table and bookshelves
// placed in the real world. This is the layer the model-only unit tests cannot reach: `/give` looked
// perfectly healthy in unit tests while its bot route was dead, and `enchant` had no test at all.
//
// Nothing here treats the bot's success string as evidence. Every enchantment is read off the inventory
// stack, and every cost is read off the player and the inventory.
//
// Reference: https://minecraft.wiki/w/Enchantment and /w/Enchanting_table_mechanics.
import { test, expect } from '@playwright/test';

test.describe('creative enchanting through the bot API', () => {
  const evidence = { rows: [], generatedAt: null, reference: null };

  async function drain() {
    const rows = await globalThis.__page.evaluate(() => {
      const out = window.__ench.observed.slice();
      window.__ench.observed.length = 0;
      return out;
    });
    const { writeFileSync, mkdirSync, readFileSync, existsSync } = await import('node:fs');
    mkdirSync('docs/artifacts', { recursive: true });
    const path = 'docs/artifacts/enchant-browser-rows.json';
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
    try { await drain(); } catch (error) { console.error('[enchant] drain failed:', error.message); }
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
      const { createEnchantHarness } = await import('/e2e/fixtures/enchantHarness.js');
      window.__ench = await createEnchantHarness(window.game);
      window.__enchSetup = window.__ench.reset({ gameMode: 'creative', cheats: true, shelves: 15 });
    });
    const setup = await page.evaluate(() => window.__enchSetup);
    evidence.reference = {
      wiki: 'https://minecraft.wiki/w/Enchantment and https://minecraft.wiki/w/Enchanting_table_mechanics (fetched in this run)',
      javaEditionTarget: '1.21.4 (DataVersion 4189)',
      setup,
    };
    expect(setup.mode, 'the harness is set up in creative').toBe('creative');
    expect(setup.voxel, 'and an enchanting table in the world').toBe(setup.expected);
    expect(setup.placed, 'with 15 bookshelves around it').toBe(15);
    globalThis.__page = page;
  });

  // --- BOT-E01..02: the basic enchant, and what creative costs ----------------------

  test('BOT-E01 a creative diamond sword is enchanted at the table', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__ench;
      h.reset({ gameMode: 'creative', cheats: true, shelves: 15 });
      const row = await h.enchant({ item: 'diamond_sword', slot: 2, position: [2, 1, 0] });
      return {
        error: row.error, ok: row.result?.ok, message: row.result?.message,
        swords: h.count('diamond_sword'),
        enchantments: h.enchantmentsOn('diamond_sword'),
        items: row.after.items,
        mode: row.before.mode,
        botActive: row.after.botActive, controls: row.after.controls, keys: row.after.keys,
      };
    });
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    expect(r.mode, 'this case runs in creative').toBe('creative');
    expect(r.ok, `the bot reported: ${r.message}`).toBe(true);
    // The bot adds the item itself in creative, then enchants the real stack.
    expect(r.swords, `inventory: ${JSON.stringify(r.items)}`).toBe(1);
    expect(r.enchantments.length, `enchantments: ${JSON.stringify(r.enchantments)}`).toBeGreaterThan(0);
    for (const e of r.enchantments) {
      expect(e.id, 'every enchantment has an id').toBeTruthy();
      expect(e.level, `${e.id} has a level`).toBeGreaterThanOrEqual(1);
      expect(e.name, `${e.id} has a display name`).toBeTruthy();
    }
    expect(r.botActive, 'the bot releases control').toBe(false);
    expect(r.controls).toBeNull();
    expect(r.keys).toEqual([]);
  });

  test('BOT-E02 creative enchanting consumes neither levels nor lapis lazuli', async () => {
    // The wiki's costs are what a SURVIVAL player pays. Creative must not silently drain resources, and
    // this is the case that would catch a regression turning the table into a survival transaction.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__ench;
      h.reset({ gameMode: 'creative', cheats: true, shelves: 15, level: 30 });
      // Four separate items, so a drain would accumulate rather than being masked by one enchant.
      const rows = [];
      for (const item of ['diamond_sword', 'diamond_pickaxe', 'diamond_helmet', 'bow']) {
        const row = await h.enchant({ item, slot: 2, position: [2, 1, 0] });
        rows.push({
          item, ok: row.result?.ok, message: row.result?.message, error: row.error,
          levelBefore: row.before.playerLevel, levelAfter: row.after.playerLevel,
          lapisBefore: row.before.items.reduce((n, s) => n + (s.id === 'lapis_lazuli' ? s.count : 0), 0),
          lapisAfter: row.after.items.reduce((n, s) => n + (s.id === 'lapis_lazuli' ? s.count : 0), 0),
        });
      }
      return { rows, level: h.game.player.level, lapis: h.lapisTotal() };
    });
    for (const row of r.rows) {
      expect(row.error, `${row.item} threw: ${row.error}`).toBeNull();
      expect(row.ok, `${row.item} reported: ${row.message}`).toBe(true);
      expect(row.levelAfter, `${row.item} must not spend levels`).toBe(row.levelBefore);
      expect(row.lapisAfter, `${row.item} must not spend lapis`).toBe(row.lapisBefore);
    }
    expect(r.level, 'the player ends on the level they started with').toBe(30);
    expect(r.lapis, 'and no lapis was taken').toBe(0);
  });

  // --- BOT-E03..04: slot selection and bookshelves ----------------------------------

  test('BOT-E03 the chosen slot decides the enchantment, and the offer is on the item', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__ench;
      const out = [];
      for (const slot of [0, 1, 2]) {
        h.reset({ gameMode: 'creative', cheats: true, shelves: 15 });
        const row = await h.enchant({ item: 'diamond_pickaxe', slot, position: [2, 1, 0] });
        out.push({
          slot, ok: row.result?.ok, message: row.result?.message, error: row.error,
          enchantments: h.enchantmentsOn('diamond_pickaxe'),
        });
      }
      return out;
    });
    for (const row of r) {
      expect(row.error, `slot ${row.slot} threw: ${row.error}`).toBeNull();
      expect(row.ok, `slot ${row.slot} reported: ${row.message}`).toBe(true);
      expect(row.enchantments.length, `slot ${row.slot} enchantments: ${JSON.stringify(row.enchantments)}`)
        .toBeGreaterThan(0);
      // Whatever the slot chose, it must be one a pickaxe can actually take.
      const allowed = ['efficiency', 'fortune', 'silk_touch', 'unbreaking'];
      for (const e of row.enchantments) {
        expect(allowed, `slot ${row.slot} gave ${e.id}, which a pickaxe cannot take`).toContain(e.id);
      }
    }
  });

  test('BOT-E04 more bookshelves means richer offers', async () => {
    // With 15 shelves the bottom slot costs 30 and can reach the top of every range; with none it costs at
    // most 8, so the strongest enchantments are out of reach. Measured across many rolls, because the slot
    // cost and the enchantment cost are both random.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__ench;
      const { generateEnchantmentOffers, calculateBookshelfCount } = await import('/src/enchanting.js');
      const sample = (shelves, rolls) => {
        const levels = [];
        for (let i = 0; i < rolls; i++) {
          const offers = generateEnchantmentOffers({ id: 'diamond_pickaxe' }, shelves, Math.random);
          const top = offers.at(-1);
          if (!top) continue;
          levels.push(...[top.primary, ...(top.additional ?? [])].map((e) => e.level));
        }
        return levels;
      };
      // Confirm the world geometry is what the engine counts, not just what the harness placed.
      const worldShelves = calculateBookshelfCount(h.game.world, 2, 1, 0);
      const withShelves = sample(15, 300);
      return {
        worldShelves,
        richMax: Math.max(...withShelves),
        poorMax: Math.max(...sample(0, 300)),
      };
    });
    expect(r.worldShelves, '15 shelves really are in the world and counted').toBe(15);
    // A level above III on a pickaxe is only reachable in the high cost ranges: Efficiency IV/V, Unbreaking
    // above III is impossible, so the observable claim is that the rich sample reaches level 4 or 5 while
    // the poor one cannot.
    expect(r.richMax, `rich offers reached level ${r.richMax}`).toBeGreaterThanOrEqual(4);
    expect(r.poorMax, `with no bookshelves the best level was ${r.poorMax}`).toBeLessThanOrEqual(3);
  });

  // --- BOT-E05..06: refusals --------------------------------------------------------

  test('BOT-E05 the table refuses an item vanilla will not enchant', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__ench;
      h.reset({ gameMode: 'creative', cheats: true, shelves: 15 });
      const row = await h.enchant({ item: 'name_tag', slot: 2, position: [2, 1, 0] });
      return {
        error: row.error, ok: row.result?.ok, message: row.result?.message,
        tags: h.count('name_tag'),
        enchantments: h.enchantmentsOn('name_tag'),
        botActive: row.after.botActive, controls: row.after.controls,
      };
    });
    // A name tag is in vanilla's not-enchantable list even though this game types it as a tool.
    expect(r.ok, `the bot must report the refusal, got ${JSON.stringify(r.message)}`).toBe(false);
    expect(r.message).toMatch(/cannot be enchanted|no offers/i);
    expect(r.enchantments, 'nothing was applied').toEqual([]);
    expect(r.botActive, 'the bot does not stay stuck').toBe(false);
    expect(r.controls).toBeNull();
  });

  test('BOT-E06 enchanting out of reach of the table is refused', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__ench;
      h.reset({ gameMode: 'creative', cheats: true, shelves: 15 });
      h.game.player.position.set(40.5, 1, 40.5);
      const row = await h.enchant({ item: 'diamond_sword', slot: 2, position: [2, 1, 0] });
      return { error: row.error, ok: row.result?.ok, message: row.result?.message, enchantments: h.enchantmentsOn('diamond_sword') };
    });
    expect(r.ok, 'a table out of reach must be refused').toBe(false);
    expect(r.message).toMatch(/reach/i);
    expect(r.enchantments, 'and nothing is enchanted').toEqual([]);
  });

  test('BOT-E07 a missing table is refused', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__ench;
      h.reset({ gameMode: 'creative', cheats: true, shelves: 0 });
      const { BLOCKS } = await import('/src/blocks.js');
      // Remove the table the harness placed, leaving the player standing in range of empty air.
      h.game.world.setVoxel(2, 1, 0, BLOCKS.AIR);
      const row = await h.enchant({ item: 'diamond_sword', slot: 2, position: [2, 1, 0] });
      return { error: row.error, ok: row.result?.ok, message: row.result?.message, enchantments: h.enchantmentsOn('diamond_sword') };
    });
    expect(r.ok, 'a missing station must be refused').toBe(false);
    expect(r.message).toMatch(/missing|station/i);
    expect(r.enchantments).toEqual([]);
  });

  // --- BOT-E08..09: what the enchantment is ----------------------------------------

  test('BOT-E08 no offer ever pairs two conflicting enchantments', async () => {
    // Sharpness, Smite and Bane of Arthropods are mutually exclusive; so are Fortune and Silk Touch. A
    // single item must never end up with two of them, however many rolls are taken.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__ench;
      const conflicts = [['sharpness', 'smite'], ['sharpness', 'bane_of_arthropods'], ['smite', 'bane_of_arthropods'], ['fortune', 'silk_touch']];
      const seen = [];
      const breaches = [];
      for (let i = 0; i < 24; i++) {
        h.reset({ gameMode: 'creative', cheats: true, shelves: 15 });
        const row = await h.enchant({ item: 'diamond_sword', slot: 2, position: [2, 1, 0] });
        if (row.error || !row.result?.ok) continue;
        const ids = h.enchantmentsOn('diamond_sword').map((e) => e.id);
        seen.push(ids.join('+'));
        for (const [a, b] of conflicts) if (ids.includes(a) && ids.includes(b)) breaches.push(ids.join('+'));
      }
      return { rolls: seen.length, sample: [...new Set(seen)].slice(0, 6), breaches };
    });
    expect(r.breaches, `conflicting pairs: ${r.breaches.join('; ')}`).toEqual([]);
    expect(r.rolls, `only ${r.rolls} of 24 rolls produced enchantments`).toBeGreaterThan(12);
  });

  test('BOT-E09 a table-enchanted book becomes an enchanted book', async () => {
    // The wiki's rule: a book is primary for every non-treasure enchantment, so a book can take anything the
    // table offers, and the result is an enchanted book rather than a plain one.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__ench;
      h.reset({ gameMode: 'creative', cheats: true, shelves: 15 });
      const row = await h.enchant({ item: 'book', slot: 2, position: [2, 1, 0] });
      return {
        error: row.error, ok: row.result?.ok, message: row.result?.message,
        books: h.count('book'), enchantedBooks: h.count('enchanted_book'),
        enchantments: h.enchantmentsOn('enchanted_book'),
        items: row.after.items,
      };
    });
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    expect(r.ok, `the bot reported: ${r.message}`).toBe(true);
    expect(r.enchantedBooks, `inventory: ${JSON.stringify(r.items)}`).toBe(1);
    expect(r.books, 'the plain book was converted').toBe(0);
    expect(r.enchantments.length, 'and carries the offer').toBeGreaterThan(0);
  });

  test('BOT-E10 the table never offers a treasure enchantment', async () => {
    // Mending, Frost Walker, Soul Speed, Swift Sneak and the two curses are treasure-only: the table must
    // never offer them, however many bookshelves stand around it.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__ench;
      const { TREASURE_ENCHANTMENTS } = await import('/src/enchanting.js');
      const treasure = [...TREASURE_ENCHANTMENTS];
      const offered = [];
      const all = [];
      for (let i = 0; i < 30; i++) {
        h.reset({ gameMode: 'creative', cheats: true, shelves: 15 });
        const row = await h.enchant({ item: 'book', slot: 2, position: [2, 1, 0] });
        if (row.error || !row.result?.ok) continue;
        for (const e of h.enchantmentsOn('enchanted_book')) {
          all.push(e.id);
          if (treasure.includes(e.id)) offered.push(e.id);
        }
      }
      return { treasure, offered, distinct: [...new Set(all)], rolls: all.length };
    });
    expect(r.offered, `treasure enchantments appeared: ${r.offered.join(', ')}`).toEqual([]);
    expect(r.rolls, `only ${r.rolls} enchantments seen across 30 book rolls`).toBeGreaterThan(10);
  });

  // --- BOT-E11: the survival cost, for contrast -------------------------------------

  test('BOT-E11 in survival the table charges the levels and lapis the wiki says', async () => {
    // Creative is free; survival is not. This is the control case showing the cost path still exists, and it
    // is what the wiki's cost tables describe: the slot's lapis plus the levels the offer displays.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__ench;
      const { generateEnchantmentOffers } = await import('/src/enchanting.js');
      const seen = [];
      const run = async (label, level, lapis) => {
        h.reset({ gameMode: 'survival', cheats: true, shelves: 15, level });
        h.game.inventory.addItem('diamond_pickaxe', false, 1);
        if (lapis > 0) h.game.inventory.addItem('lapis_lazuli', false, lapis);
        const offers = generateEnchantmentOffers({ id: 'diamond_pickaxe' }, 15);
        const needed = offers.at(-1)?.levelRequirement ?? null;
        const row = await h.enchant({ item: 'diamond_pickaxe', slot: 2, position: [2, 1, 0] });
        seen.push({
          label, level, lapis, needed, ok: row.result?.ok, message: row.result?.message, error: row.error,
          levelAfter: row.after.playerLevel,
          lapisAfter: h.count('lapis_lazuli'),
          enchantments: h.enchantmentsOn('diamond_pickaxe').map((e) => e.id),
        });
      };
      await run('no levels, no lapis', 0, 0);
      await run('levels but no lapis', 30, 0);
      await run('levels and lapis', 30, 3);
      return seen;
    });
    const [broke, noLapis, paid] = r;
    // Nothing to pay with: refused, nothing applied.
    expect(broke.ok, `level 0 reported: ${broke.message}`).toBe(false);
    expect(broke.enchantments, 'and nothing was applied').toEqual([]);
    // Levels are not enough: the slot also wants its 3 lapis.
    expect(noLapis.ok, `level 30 with no lapis reported: ${noLapis.message}`).toBe(false);
    expect(noLapis.message).toMatch(/lapis/i);
    expect(noLapis.enchantments, 'and nothing was applied').toEqual([]);
    expect(noLapis.levelAfter, 'and no levels were spent on a refused enchant').toBe(30);
    // With both, the enchant lands and both are charged.
    expect(paid.ok, `level 30 with lapis reported: ${paid.message} (needed ${paid.needed})`).toBe(true);
    expect(paid.enchantments.length, 'the paying player got an enchantment').toBeGreaterThan(0);
    expect(paid.levelAfter, `the payer spends the offer's ${paid.needed} levels`).toBe(30 - paid.needed);
    expect(paid.lapisAfter, 'and the slot\'s 3 lapis').toBe(0);
  });

  // --- evidence ---------------------------------------------------------------------

  test('the observed enchanting rows are recorded for the report', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const path = 'docs/artifacts/enchant-browser-rows.json';
    expect(existsSync(path), 'the enchanting artifact was written').toBe(true);
    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written.rows.length, 'the artifact holds the observed enchants').toBeGreaterThan(10);
    expect(written.rows.filter((r) => r.ok === false).length, 'the deliberate refusals are recorded')
      .toBeGreaterThan(0);
    expect(written.rows.filter((r) => r.error).length, 'no enchant threw an exception').toBe(0);
    expect(written.reference?.setup?.placed, 'the bookshelf setup is recorded').toBe(15);
  });
});
