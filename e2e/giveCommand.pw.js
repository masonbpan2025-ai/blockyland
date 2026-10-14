// The /give case matrix, run in a disposable headless browser against the real game.
//
// Layer: production `Game.handleCommand` -> `commandRunner` -> `parseGive`/`giveItems` -> the real
// `Inventory` -> real dropped entities in `EntityManager.droppedItems`, with pickup ticks advanced only in
// the dedicated pickup case. Every positive case starts from an emptied inventory and no ground items.
//
// Nothing asserts against a stub. Item identity is checked against the registry constants
// (`BLOCKS.STONE`, the `'diamond_sword'` / `'ender_pearl'` string ids) rather than against `resolveItem`,
// so the parser is never its own oracle.
import { test, expect } from '@playwright/test';

const BOT = 'BOT_API', DISPATCH = 'GAME_DISPATCH';

test.describe('/give through the game dispatcher and the bot API', () => {
  // Collected from the page after every case. The rows live in the page, and storing them in a Node-side
  // array from the start means the evidence survives a later failure instead of only being written when the
  // last test passes.
  const evidence = { rows: [], reproductions: [], generatedAt: null, reference: null };

  async function drain() {
    const rows = await globalThis.__page.evaluate(() => {
      const out = window.__give.observed.slice();
      window.__give.observed.length = 0;
      return out;
    });
    // Merge rather than append onto whatever is on disk: Playwright starts a fresh worker after a failure,
    // which re-runs `beforeAll` and would otherwise truncate the artifact to the last worker's rows.
    const { writeFileSync, mkdirSync, readFileSync, existsSync } = await import('node:fs');
    mkdirSync('docs/artifacts', { recursive: true });
    const path = 'docs/artifacts/give-command-browser-rows.json';
    let previous = { rows: [], reproductions: [] };
    if (existsSync(path)) {
      try { previous = JSON.parse(readFileSync(path, 'utf8')); } catch { previous = { rows: [], reproductions: [] }; }
    }
    const keyed = new Map(previous.rows.map((r) => [r.key, r]));
    evidence.rows.push(...rows);
    for (const r of rows) keyed.set(r.key, r);
    evidence.rows = [...keyed.values()];
    evidence.reproductions = evidence.reproductions.length ? evidence.reproductions : (previous.reproductions ?? []);
    evidence.reference = evidence.reference ?? (previous.reference ?? null);
    evidence.generatedAt = new Date().toISOString();
    writeFileSync(path, JSON.stringify(evidence, null, 2) + '\n');
    return rows;
  }

  test.afterEach(async () => {
    try { await drain(); } catch (error) { console.error('[give] drain failed:', error.message); }
  });

  test.afterAll(async () => {
    evidence.generatedAt = new Date().toISOString();
    await globalThis.__page?.close();
  });

  test.beforeAll(async ({ browser }) => {
    // Vite's dependency optimization runs on first request and can hold `domcontentloaded` open for
    // minutes on a cold cache, so navigation waits only for the commit and readiness is polled below.
    test.setTimeout(600000);
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(300000);
    await page.goto('/', { waitUntil: 'commit' });
    // The page builds textures and ~700 assets before the game object is complete; a cold load measured
    // 15s with a warm Vite cache, and dependency optimization adds much more on the first run.
    await page.waitForFunction(
      () => window.game?.playerBot && window.game?.inventory && window.game?.entities && window.game?.ui,
      null, { timeout: 300000 },
    );
    await page.evaluate(async () => {
      const { createGiveHarness } = await import('/e2e/fixtures/giveHarness.js');
      window.__give = await createGiveHarness(window.game);
      // The Survival fixture starts with cheats OFF; the positive cases need them on. What the game
      // actually stored is kept as evidence rather than assumed.
      window.__settingsAfterApply = window.__give.setWorld({ gameMode: 'survival', cheats: true });
    });
    const applied = await page.evaluate(() => window.__settingsAfterApply);
    evidence.reference = { javaBaseline: 'Java Edition plain-item /give syntax', settingsApplied: applied };
    globalThis.__page = page;
  });

  // --- reproductions: every unexpected result, once, from a clean baseline ------------

  test('REPRO the unexpected results repeat on a clean fixture', async () => {
    const cases = [
      ['G07b-1e2', '/give @s minecraft:stone 1e2', null, undefined],
      ['G07b-0x10', '/give @s minecraft:stone 0x10', null, undefined],
      ['G09b', '/give @s other_namespace:stone 1', null, undefined],
      ['G13', '/give @s minecraft:stone 1 extra', null, undefined],
      ['G11', '/give @s minecraft:stone 10', 'partial', undefined],
      ['G12b', '/give @s minecraft:ender_pearl 17', 'full', undefined],
      ['G16', '/give @s minecraft:diamond_sword 101', 'full', undefined],
      // The original G16 probe used an empty inventory; the refusal happens on either baseline, so this
      // reproduction uses the empty one to match the case it is reproducing.
      ['G16-empty', '/give @s minecraft:diamond_sword 101', null, undefined],
      ['G16b-limit', '/give @s minecraft:diamond_sword 100', null, undefined],
      // Creative's claim is that it reports the delivered count, so the reproduction runs in Creative.
      ['G18', '/give @s minecraft:stone 10', 'full', { gameMode: 'creative', cheats: true }],
    ];
    const rows = await globalThis.__page.evaluate(async (cases) => {
      const h = window.__give;
      const out = [];
      for (const [id, command, setup, world] of cases) {
        const run = await h.reproduce(command, 'GAME_DISPATCH', world ? { setup, world } : { setup });
        h.reset();
        out.push({ id, ...run });
      }
      return out;
    }, cases);
    evidence.reproductions = rows;
    // The reproduction is only evidence if the two runs agree; a one-off is not a finding.
    for (const r of rows) {
      expect(r.second, `${r.id} did not reproduce`).toBeTruthy();
      expect(
        JSON.stringify({ held: r.first.heldByItem, ground: r.first.groundByItem, messages: r.first.messages }),
        `${r.id}: the second clean run differed from the first`,
      ).toBe(JSON.stringify({ held: r.second.heldByItem, ground: r.second.groundByItem, messages: r.second.messages }));
    }
  });

  // --- G01..G04b: delivery, identity, stacking -------------------------------------

  test('G01 default count is one stone', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give; h.reset();
      const row = await h.observe('/give @s minecraft:stone', 'GAME_DISPATCH');
      const { BLOCKS } = await import('/src/blocks.js');
      return {
        ...row,
        held: h.quantity(row.after, BLOCKS.STONE),
        ground: h.groundQuantity(row.after, BLOCKS.STONE),
        stacks: h.stacks(row.after, BLOCKS.STONE),
      };
    });
    expect(r.error, r.error ?? '').toBeNull();
    expect(r.held, 'one stone').toBe(1);
    expect(r.ground, 'nothing dropped').toBe(0);
    expect(r.stacks).toEqual([1]);
    expect(r.before.settings).toEqual({ gameMode: 'survival', cheats: true });
    expect(r.after.botActive).toBe(false);
    expect(r.after.controls).toBeNull();
  });

  test('G02 @p diamond sword one, item form, no drops', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give; h.reset();
      const row = await h.observe('/give @p minecraft:diamond_sword 1', 'GAME_DISPATCH');
      return {
        ...row,
        held: h.quantity(row.after, 'diamond_sword'),
        ground: h.groundQuantity(row.after, 'diamond_sword'),
        stacks: h.stacks(row.after, 'diamond_sword'),
        slotIsBlock: [...row.after.inventory.hotbar, ...row.after.inventory.storage].find((s) => s?.id === 'diamond_sword')?.isBlock,
      };
    });
    expect(r.error, r.error ?? '').toBeNull();
    expect(r.held, 'one sword').toBe(1);
    expect(r.ground).toBe(0);
    expect(r.stacks).toEqual([1]);
    expect(r.slotIsBlock, 'a sword is an item, not a block').toBe(false);
  });

  test('G03 65 stone splits into 64 and 1', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give; h.reset();
      const row = await h.observe('/give @s minecraft:stone 65', 'GAME_DISPATCH');
      const { BLOCKS } = await import('/src/blocks.js');
      return { ...row, held: h.quantity(row.after, BLOCKS.STONE), ground: h.groundQuantity(row.after, BLOCKS.STONE), stacks: h.stacks(row.after, BLOCKS.STONE) };
    });
    expect(r.error, r.error ?? '').toBeNull();
    expect(r.held).toBe(65);
    expect(r.ground).toBe(0);
    expect(r.stacks).toEqual([64, 1]);
  });

  test('G04 17 ender pearls split into 16 and 1', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give; h.reset();
      const row = await h.observe('/give @s minecraft:ender_pearl 17', 'GAME_DISPATCH');
      return { ...row, held: h.quantity(row.after, 'ender_pearl'), ground: h.groundQuantity(row.after, 'ender_pearl'), stacks: h.stacks(row.after, 'ender_pearl') };
    });
    expect(r.error, r.error ?? '').toBeNull();
    expect(r.held).toBe(17);
    expect(r.ground).toBe(0);
    expect(r.stacks, 'pearls stack to 16, so 17 is 16 + 1').toEqual([16, 1]);
  });

  test('G04b two swords occupy two stacks of one', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give; h.reset();
      const row = await h.observe('/give @s minecraft:diamond_sword 2', 'GAME_DISPATCH');
      return { ...row, held: h.quantity(row.after, 'diamond_sword'), ground: h.groundQuantity(row.after, 'diamond_sword'), stacks: h.stacks(row.after, 'diamond_sword'), occupied: [...row.after.inventory.hotbar, ...row.after.inventory.storage].filter((s) => s?.id === 'diamond_sword').length };
    });
    expect(r.error, r.error ?? '').toBeNull();
    expect(r.held).toBe(2);
    expect(r.ground).toBe(0);
    expect(r.stacks).toEqual([1, 1]);
    expect(r.occupied, 'swords are unstackable').toBe(2);
  });

  // --- G05..G06: the permission gate ------------------------------------------------

  test('G05 survival with cheats off refuses and mutates nothing', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give;
      h.reset({ gameMode: 'survival', cheats: false });
      const row = await h.observe('/give @s minecraft:stone 1', 'GAME_DISPATCH');
      const { BLOCKS } = await import('/src/blocks.js');
      const unchanged = JSON.stringify(row.before.inventory) === JSON.stringify(row.after.inventory)
        && JSON.stringify(row.before.drops) === JSON.stringify(row.after.drops);
      return { ...row, held: h.quantity(row.after, BLOCKS.STONE), ground: h.groundQuantity(row.after, BLOCKS.STONE), unchanged };
    });
    expect(r.before.settings, 'the case must really be running with cheats off').toEqual({ gameMode: 'survival', cheats: false });
    expect(r.unchanged, 'a refusal must not touch the inventory or the ground').toBe(true);
    expect(r.held).toBe(0);
    expect(r.ground).toBe(0);
    expect(r.messages.filter((m) => m.kind === 'error').length).toBeGreaterThan(0);
    expect(r.messages.map((m) => m.text).join(' | ')).toContain('permission');
    expect(r.after.botActive).toBe(false);
  });

  test('G06 creative with cheats off is allowed by this game\'s policy', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give;
      h.reset({ gameMode: 'creative', cheats: false });
      const row = await h.observe('/give @s minecraft:stone 1', 'GAME_DISPATCH');
      const { BLOCKS } = await import('/src/blocks.js');
      return { ...row, held: h.quantity(row.after, BLOCKS.STONE), ground: h.groundQuantity(row.after, BLOCKS.STONE) };
    });
    // A game-policy result, not proof of vanilla operator permissions: this engine ties /give to Creative
    // mode as well as cheats, which is its own rule (`permissionRefusal`).
    expect(r.before.settings).toEqual({ gameMode: 'creative', cheats: false });
    expect(r.held, 'allowed in creative').toBe(1);
    expect(r.ground).toBe(0);
  });

  // --- G07..G07b: count syntax ------------------------------------------------------

  test('G07 each malformed count is rejected with no mutation', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give;
      const { BLOCKS } = await import('/src/blocks.js');
      const out = [];
      for (const count of ['0', '-1', '1.5', '64abc', 'many', '2147483648']) {
        h.reset();
        const row = await h.observe(`/give @s minecraft:stone ${count}`, 'GAME_DISPATCH');
        out.push({
          count,
          held: h.quantity(row.after, BLOCKS.STONE),
          ground: h.groundQuantity(row.after, BLOCKS.STONE),
          unchanged: JSON.stringify(row.before.inventory) === JSON.stringify(row.after.inventory)
            && JSON.stringify(row.before.drops) === JSON.stringify(row.after.drops),
          errors: row.messages.filter((m) => m.kind === 'error').map((m) => m.text),
        });
      }
      return out;
    });
    for (const c of r) {
      expect(c.held, `count ${c.count} must give nothing`).toBe(0);
      expect(c.ground, `count ${c.count} must drop nothing`).toBe(0);
      expect(c.unchanged, `count ${c.count} must not mutate`).toBe(true);
      expect(c.errors.length, `count ${c.count} must report an error`).toBeGreaterThan(0);
    }
  });

  test('G07b Java integer syntax: 1e2, 0x10 and +1 are all refused', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give;
      const { BLOCKS } = await import('/src/blocks.js');
      const out = [];
      // The whole grammar, not just the three spellings: leading zeroes are ordinary decimal digits, and
      // everything JavaScript's `Number()` would have been happy to coerce is not an integer literal.
      for (const count of ['1e2', '0x10', '+1', '1.0', '1_0', '01', '007']) {
        h.reset();
        const row = await h.observe(`/give @s minecraft:stone ${count}`, 'GAME_DISPATCH');
        out.push({ count, held: h.quantity(row.after, BLOCKS.STONE), ground: h.groundQuantity(row.after, BLOCKS.STONE), errors: row.messages.filter((m) => m.kind === 'error').map((m) => m.text) });
      }
      return out;
    });
    // Vanilla's reader is Brigadier's `StringReader.readInt()`: it scans a run of digits, a leading minus and a
    // decimal point, then `Integer.parseInt` on the result. So a decimal point is scanned but never parses,
    // `+` is not an integer character, and `1e2` / `0x10` leave an unread suffix that cannot form the argument.
    // Mojang's reader is the pinned contract here, so all four refuse WITHOUT touching the inventory.
    const byCount = Object.fromEntries(r.map((c) => [c.count, c]));
    for (const bad of ['1e2', '0x10', '+1', '1.0', '1_0']) {
      expect(byCount[bad].held, `${bad} must be refused`).toBe(0);
      expect(byCount[bad].ground, `${bad} must not drop anything either`).toBe(0);
      expect(byCount[bad].errors.length, `${bad} must report a reason`).toBeGreaterThan(0);
    }
    // Leading zeroes ARE plain decimal digits and vanilla accepts them.
    expect(byCount['01'].held, 'leading zeroes are ordinary decimal digits').toBe(1);
    expect(byCount['007'].held, 'and so are more of them').toBe(7);
  });

  // --- G08..G10, G09b, G13: malformed arguments ------------------------------------

  test('G08 usage errors for missing arguments', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give;
      const out = [];
      for (const command of ['/give', '/give @s', '/give diamond_sword']) {
        h.reset();
        const row = await h.observe(command, 'GAME_DISPATCH');
        out.push({
          command,
          empty: row.after.inventory.hotbar.every((s) => !s) && row.after.inventory.storage.every((s) => !s),
          drops: row.after.drops.length,
          errors: row.messages.filter((m) => m.kind === 'error').map((m) => m.text),
        });
      }
      return out;
    });
    for (const c of r) {
      expect(c.empty, `${c.command} must give nothing`).toBe(true);
      expect(c.drops, `${c.command} must drop nothing`).toBe(0);
      expect(c.errors.length, `${c.command} must show usage`).toBeGreaterThan(0);
      expect(c.errors.join(' ')).toMatch(/Usage: \/give <targets> <item> \[<count>\]|Not enough arguments/);
    }
  });

  test('G09 an unknown item is refused', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give; h.reset();
      const row = await h.observe('/give @s minecraft:does_not_exist 1', 'GAME_DISPATCH');
      const empty = [...row.after.inventory.hotbar, ...row.after.inventory.storage].every((s) => !s);
      return { empty, drops: row.after.drops.length, errors: row.messages.filter((m) => m.kind === 'error').map((m) => m.text) };
    });
    expect(r.empty).toBe(true);
    expect(r.drops).toBe(0);
    expect(r.errors.join(' ')).toContain('unknown item');
  });

  test('G09b a foreign namespace must not silently resolve to vanilla stone', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give; h.reset();
      const row = await h.observe('/give @s other_namespace:stone 1', 'GAME_DISPATCH');
      const { BLOCKS } = await import('/src/blocks.js');
      return {
        held: h.quantity(row.after, BLOCKS.STONE),
        ground: h.groundQuantity(row.after, BLOCKS.STONE),
        empty: [...row.after.inventory.hotbar, ...row.after.inventory.storage].every((s) => !s),
        errors: row.messages.filter((m) => m.kind === 'error').map((m) => m.text),
      };
    });
    // `other_namespace:stone` is a different resource location from `minecraft:stone`. Handing over vanilla
    // stone here is a silent misresolution, not a nicety.
    expect(r.held, 'a foreign namespace must not become minecraft:stone').toBe(0);
    expect(r.empty).toBe(true);
    expect(r.errors.length, 'it should be refused').toBeGreaterThan(0);
  });

  test('G10 an invalid selector is refused', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give; h.reset();
      const row = await h.observe('/give @z minecraft:stone 1', 'GAME_DISPATCH');
      const { BLOCKS } = await import('/src/blocks.js');
      return { held: h.quantity(row.after, BLOCKS.STONE), drops: row.after.drops.length, errors: row.messages.filter((m) => m.kind === 'error').map((m) => m.text) };
    });
    expect(r.held).toBe(0);
    expect(r.drops).toBe(0);
    expect(r.errors.join(' ')).toContain('invalid target selector');
  });

  test('G13 a trailing token is rejected', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give; h.reset();
      const row = await h.observe('/give @s minecraft:stone 1 extra', 'GAME_DISPATCH');
      const { BLOCKS } = await import('/src/blocks.js');
      return { held: h.quantity(row.after, BLOCKS.STONE), ground: h.groundQuantity(row.after, BLOCKS.STONE), errors: row.messages.filter((m) => m.kind === 'error').map((m) => m.text) };
    });
    // Vanilla's Brigadier reads `<count>` and then expects the line to end; `extra` is a parse error, and a
    // parser that ignores the tail accepts malformed input.
    expect(r.held, 'a trailing token must not be silently ignored').toBe(0);
    expect(r.ground).toBe(0);
    expect(r.errors.length, 'it should report the syntax error').toBeGreaterThan(0);
  });

  // --- G11..G12c: full-inventory overflow and conservation --------------------------

  test('G11 63 stone plus a full inventory: 1 in, 9 on the ground', async () => {
    // The partial stack of stone at 63 has room for exactly one more; every other slot is full and
    // unmergeable. One must be placed and nine summoned, with nothing counted twice.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give;
      const { BLOCKS } = await import('/src/blocks.js');
      h.fillInventory({ stone: 63 });
      const row = await h.observe('/give @s minecraft:stone 10', 'GAME_DISPATCH');
      const held = h.quantity(row.after, BLOCKS.STONE);
      const ground = h.groundQuantity(row.after, BLOCKS.STONE);
      const before = h.quantity(row.before, BLOCKS.STONE);
      return {
        heldBefore: before, held, ground, gained: held - before,
        groundStacks: h.groundStacks(row.after, BLOCKS.STONE),
        messages: row.messages.map((m) => ({ text: m.text, kind: m.kind })),
        dirtUnchanged: h.quantity(row.after, BLOCKS.DIRT) === h.quantity(row.before, BLOCKS.DIRT),
        drops: row.after.drops.map((d) => ({ id: d.id, count: d.count })),
      };
    });
    expect(r.heldBefore).toBe(63);
    expect(r.gained, 'one stone fits in the partial stack').toBe(1);
    expect(r.held, 'the stack is now full, not fuller than full').toBe(64);
    expect(r.ground, 'the other nine go to the ground').toBe(9);
    expect(r.gained + r.ground, `inventory +${r.gained}, ground +${r.ground}; the request was 10`).toBe(10);
    expect(r.groundStacks, 'nine stone is one ground stack').toEqual([9]);
    expect(r.dirtUnchanged, 'unrelated items are untouched').toBe(true);
    expect(r.messages.map((m) => m.text).join(' | '), 'the confirmation line reports the one delivered')
      .toContain('Gave 1');
  });

  test('G12 a full inventory drops all ten stone', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give;
      const { BLOCKS } = await import('/src/blocks.js');
      h.fillInventory();
      const row = await h.observe('/give @s minecraft:stone 10', 'GAME_DISPATCH');
      return {
        gained: h.quantity(row.after, BLOCKS.STONE),
        ground: h.groundQuantity(row.after, BLOCKS.STONE),
        groundStacks: h.groundStacks(row.after, BLOCKS.STONE),
        messages: row.messages.map((m) => m.text),
        dirtUnchanged: h.quantity(row.after, BLOCKS.DIRT) === h.quantity(row.before, BLOCKS.DIRT),
      };
    });
    expect(r.gained).toBe(0);
    expect(r.ground).toBe(10);
    expect(r.gained + r.ground).toBe(10);
    expect(r.dirtUnchanged).toBe(true);
  });

  test('G12b a full inventory drops 17 pearls as 16 and 1', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give;
      h.fillInventory();
      const row = await h.observe('/give @s minecraft:ender_pearl 17', 'GAME_DISPATCH');
      return { gained: h.quantity(row.after, 'ender_pearl'), ground: h.groundQuantity(row.after, 'ender_pearl'), groundStacks: h.groundStacks(row.after, 'ender_pearl'), drops: row.after.drops.length };
    });
    expect(r.gained).toBe(0);
    expect(r.ground).toBe(17);
    expect(r.groundStacks, 'a pearl entity holds at most 16').toEqual([16, 1]);
    expect(r.drops).toBe(2);
  });

  test('G12c a full inventory drops 2 swords as two entities of one', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give;
      h.fillInventory();
      const row = await h.observe('/give @s minecraft:diamond_sword 2', 'GAME_DISPATCH');
      return { gained: h.quantity(row.after, 'diamond_sword'), ground: h.groundQuantity(row.after, 'diamond_sword'), groundStacks: h.groundStacks(row.after, 'diamond_sword'), ids: row.after.drops.map((d) => d.id) };
    });
    expect(r.gained).toBe(0);
    expect(r.ground).toBe(2);
    expect(r.groundStacks).toEqual([1, 1]);
    expect(r.ids.every((id) => id === 'diamond_sword'), JSON.stringify(r.ids)).toBe(true);
  });

  // --- G14..G16: selectors and the 100-stack limit ----------------------------------

  test('G14 /give @a is refused by this game', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give; h.reset();
      const row = await h.observe('/give @a minecraft:stone 1', 'GAME_DISPATCH');
      const { BLOCKS } = await import('/src/blocks.js');
      return { held: h.quantity(row.after, BLOCKS.STONE), errors: row.messages.filter((m) => m.kind === 'error').map((m) => m.text) };
    });
    // Vanilla in a one-player world gives the local player one stone. This game refuses `@a` outright, so
    // the vanilla outcome cannot be observed here at all: a parity gap, not a pass.
    expect(r.held).toBe(0);
    expect(r.errors.join(' ')).toContain('@a names all players');
  });

  test('G14b /give @r is refused by this game', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give; h.reset();
      const row = await h.observe('/give @r minecraft:stone 1', 'GAME_DISPATCH');
      const { BLOCKS } = await import('/src/blocks.js');
      return { held: h.quantity(row.after, BLOCKS.STONE), errors: row.messages.filter((m) => m.kind === 'error').map((m) => m.text) };
    });
    expect(r.held).toBe(0);
    expect(r.errors.join(' ')).toContain('@r names a random player');
  });

  test('G15 a literal unknown name is given the items anyway', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give; h.reset();
      const row = await h.observe('/give NobodyHere minecraft:stone 1', 'GAME_DISPATCH');
      const { BLOCKS } = await import('/src/blocks.js');
      return { held: h.quantity(row.after, BLOCKS.STONE), errors: row.messages.filter((m) => m.kind === 'error').map((m) => m.text), messages: row.messages.map((m) => m.text) };
    });
    // "No player was found" is vanilla's answer. Here any syntactically valid name is the local player, so
    // the material is handed over to a player who does not exist: a parity gap.
    expect(r.held, 'this build treats any name as the local player').toBe(1);
    expect(r.errors).toEqual([]);
  });

  test('G16 101 swords exceed the limit and are refused without mutation', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give; h.reset();
      const row = await h.observe('/give @s minecraft:diamond_sword 101', 'GAME_DISPATCH');
      return {
        held: h.quantity(row.after, 'diamond_sword'),
        ground: h.groundQuantity(row.after, 'diamond_sword'),
        errors: row.messages.filter((m) => m.kind === 'error').map((m) => m.text),
        messages: row.messages.map((m) => m.text),
        unchanged: JSON.stringify(row.before.inventory) === JSON.stringify(row.after.inventory)
          && JSON.stringify(row.before.drops) === JSON.stringify(row.after.drops),
      };
    });
    // 101 unstackable items is 101 stacks, over the 100-stack execution limit the wiki records for 21w10a and
    // the Java 1.17+ line. It must be refused, and a refusal must not move anything.
    expect(r.errors.length, `expected a refusal, got ${JSON.stringify(r.messages)}`).toBeGreaterThan(0);
    expect(r.errors.join(' ')).toContain('exceeds');
    expect(r.held, 'a refused give places nothing').toBe(0);
    expect(r.ground, 'and drops nothing').toBe(0);
    expect(r.unchanged, 'the inventory and the ground are untouched').toBe(true);
  });

  test('G16b a count at the limit is delivered whole', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give; h.reset();
      const row = await h.observe('/give @s minecraft:diamond_sword 100', 'GAME_DISPATCH');
      return {
        held: h.quantity(row.after, 'diamond_sword'),
        ground: h.groundQuantity(row.after, 'diamond_sword'),
        errors: row.messages.filter((m) => m.kind === 'error').map((m) => m.text),
      };
    });
    // Exactly 100 stacks is allowed: 36 slots fill and the other 64 are summoned onto the ground.
    expect(r.errors).toEqual([]);
    expect(r.held + r.ground, 'conservation at the boundary').toBe(100);
    expect(r.held, 'the inventory takes its 36 slots').toBe(36);
    expect(r.ground, 'the overflow is on the ground').toBe(64);
  });

  // --- G17..G18: components and creative overflow -----------------------------------

  test('G17 item data components are refused as an unsupported feature', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give; h.reset();
      const row = await h.observe('/give @s minecraft:diamond_sword[enchantments={levels:{sharpness:1}}] 1', 'GAME_DISPATCH');
      const empty = [...row.after.inventory.hotbar, ...row.after.inventory.storage].every((s) => !s);
      return { empty, drops: row.after.drops.length, errors: row.messages.filter((m) => m.kind === 'error').map((m) => m.text) };
    });
    // A deliberate supported-feature gap with a clear rejection, not a malformed plain item.
    expect(r.empty).toBe(true);
    expect(r.drops).toBe(0);
    expect(r.errors.join(' ')).toContain('item data components are not supported');
  });

  test('G18 creative never summons a drop and reports what it placed', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give;
      const { BLOCKS } = await import('/src/blocks.js');
      // A genuinely saturated inventory: stone at its limit in every slot, so there is nowhere to put
      // anything. The expected answer is not "the whole count" -- it is whatever was really placed.
      h.fillInventory({ gameMode: 'creative', cheats: true });
      h.game.inventory.hotbar = Array.from({ length: 9 }, () => ({ id: BLOCKS.STONE, isBlock: true, count: 64 }));
      h.game.inventory.storage = Array.from({ length: 27 }, () => ({ id: BLOCKS.STONE, isBlock: true, count: 64 }));
      const room = h.game.inventory.countRoomFor(BLOCKS.STONE, true, 10);
      const row = await h.observe('/give @s minecraft:stone 10', 'GAME_DISPATCH');
      const measured = {
        mode: row.before.mode, room,
        heldBefore: h.quantity(row.before, BLOCKS.STONE),
        held: h.quantity(row.after, BLOCKS.STONE),
        ground: h.groundQuantity(row.after, BLOCKS.STONE),
        messages: row.messages.map((m) => m.text),
      };
      h.reset();
      return measured;
    });
    expect(r.mode, 'this case runs in creative').toBe('creative');
    expect(r.room, 'the inventory is genuinely saturated').toBe(0);
    // Creative never summons onto the ground. It therefore cannot silently divert the items there either.
    expect(r.ground, 'creative never summons a drop').toBe(0);
    expect(r.held - r.heldBefore, 'nothing could be placed, so nothing was placed').toBe(0);
    // The failure the guide describes is "a success line without conserved items". The line must agree with
    // the inventory, so it names the delivered count and not the requested one.
    expect(r.messages.join(' | '), 'the confirmation names what was delivered').toContain('Gave 0 [Stone]');
  });

  test('G18b creative delivers into a partial inventory and drops nothing', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give;
      const { BLOCKS } = await import('/src/blocks.js');
      // One partial stone stack in an otherwise full inventory: creative must top it up, and the remainder
      // has nowhere to go because creative never summons.
      h.fillInventory({ gameMode: 'creative', cheats: true });
      h.game.inventory.hotbar[0] = { id: BLOCKS.STONE, isBlock: true, count: 60 };
      const room = h.game.inventory.countRoomFor(BLOCKS.STONE, true, 10);
      const row = await h.observe('/give @s minecraft:stone 10', 'GAME_DISPATCH');
      const measured = {
        room,
        held: h.quantity(row.after, BLOCKS.STONE),
        ground: h.groundQuantity(row.after, BLOCKS.STONE),
        messages: row.messages.map((m) => m.text),
      };
      h.reset();
      return measured;
    });
    expect(r.room, 'four fit into the partial stack').toBe(4);
    expect(r.held, 'the partial stack is topped up').toBe(64);
    expect(r.ground, 'and the other six are not summoned').toBe(0);
    expect(r.messages.join(' | '), 'the line reports the four that landed').toContain('Gave 4 [Stone]');
  });

  // --- BOT01: the direct bot route --------------------------------------------------

  test('BOT01 the bot command action reaches /give', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give; h.reset();
      const row = await h.observe('/give @s minecraft:stone 1', 'BOT_API');
      const { BLOCKS } = await import('/src/blocks.js');
      return {
        ...row,
        held: h.quantity(row.after, BLOCKS.STONE),
        ground: h.groundQuantity(row.after, BLOCKS.STONE),
        botActiveAfter: row.after.botActive,
        controlsAfter: row.after.controls,
        keysAfter: row.after.keys,
      };
    });
    expect(r.error, `BOT01 threw: ${r.error}`).toBeNull();
    expect(r.held, 'BOT01 expected exactly one stone').toBe(1);
    expect(r.ground).toBe(0);
    expect(r.result?.ok, 'the bot reports the dispatch result').toBe(true);
    expect(r.botActiveAfter, 'the bot must release control').toBe(false);
    expect(r.controlsAfter).toBeNull();
    expect(r.keysAfter).toEqual([]);
    expect(r.command, 'the exact /give string is preserved as evidence').toBe('/give @s minecraft:stone 1');
  });

  test('BOT01b the bot honours the permission gate', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give;
      h.reset({ gameMode: 'survival', cheats: false });
      const row = await h.observe('/give @s minecraft:stone 1', 'BOT_API');
      const { BLOCKS } = await import('/src/blocks.js');
      return {
        ...row,
        held: h.quantity(row.after, BLOCKS.STONE),
        unchanged: JSON.stringify(row.before.inventory) === JSON.stringify(row.after.inventory),
        errors: row.messages.filter((m) => m.kind === 'error').map((m) => m.text),
      };
    });
    expect(r.held, 'the bot must not be a route around the cheats gate').toBe(0);
    expect(r.unchanged).toBe(true);
    expect(r.errors.join(' ')).toContain('permission');
    expect(r.after.botActive).toBe(false);
    expect(r.after.controls).toBeNull();
  });

  // --- pickup ----------------------------------------------------------------------

  test('G11b dropped stone is collected when the inventory has room', async () => {
    // Pickup is a separate claim from delivery. The fixture's player stands where the command dropped the
    // items, so advancing real ticks must move the same count from the ground into the inventory. The count
    // is taken from the tracked entities rather than a fresh snapshot in the loop condition, because the
    // game's own frame loop can also tick and that made a re-snapshot loop read zero and never run.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__give;
      const { BLOCKS } = await import('/src/blocks.js');
      // A genuinely full inventory: 36 FULL stacks of 64, which have no merge room either. A stack of 1
      // would merge and accept the request instead of overflowing, which is the wrong claim for this case.
      h.fillInventory({ gameMode: 'survival', cheats: true });
      h.game.inventory.hotbar = Array.from({ length: 9 }, () => ({ id: BLOCKS.STONE, isBlock: true, count: 64 }));
      h.game.inventory.storage = Array.from({ length: 27 }, () => ({ id: BLOCKS.STONE, isBlock: true, count: 64 }));
      const row = await h.observe('/give @s minecraft:stone 10', 'GAME_DISPATCH');
      const dropped = h.groundQuantity(row.after, BLOCKS.STONE);
      const heldAfterCommand = h.quantity(row.after, BLOCKS.STONE);
      const withinReach = row.after.drops.every((d) => {
        const [x, y, z] = d.position;
        return Math.hypot(x - h.game.player.position.x, y - (h.game.player.position.y + 0.8), z - h.game.player.position.z) < 1.6;
      });
      // Free the hotbar for the drops, and account for exactly what that removed: emptying slots is a
      // deliberate setup write, and comparing totals across it without subtracting them is not conservation.
      let freed = 0;
      for (let i = 0; i < 9; i++) {
        const slot = h.game.inventory.hotbar[i];
        if (slot) freed += slot.count;
        h.game.inventory.hotbar[i] = null;
      }
      const groundOf = () => h.game.entities.droppedItems.reduce((n, d) => n + (d.itemType === BLOCKS.STONE ? d.count : 0), 0);
      const beforePickupGround = groundOf();
      let ticks = 0;
      for (let i = 0; i < 90; i++) {
        if (groundOf() === 0) break;
        h.step(1); ticks++;
      }
      const after = h.snapshot();
      const held = h.quantity(after, BLOCKS.STONE);
      return {
        dropped, heldAfterCommand, freed, withinReach, beforePickupGround, ticks,
        held, ground: h.groundQuantity(after, BLOCKS.STONE),
      };
    });
    expect(r.dropped, 'a full inventory puts all ten on the ground').toBe(10);
    expect(r.withinReach, 'the drops are inside pickup range so the claim is about pickup, not walking').toBe(true);
    expect(r.beforePickupGround, 'the ground held the ten before the ticks').toBe(10);
    expect(r.ground, 'pickup clears the ground').toBe(0);
    // held after pickup, minus what was deliberately freed, must be the ten that were on the ground.
    expect(r.held - (r.heldAfterCommand - r.freed), 'the inventory gains exactly what left the ground').toBe(10);
    expect(r.ticks, 'pickup completes inside the budget').toBeLessThan(90);
  });

  // --- the evidence table -----------------------------------------------------------

  test('the observed rows are recorded for the report', async () => {
    // `afterEach` drains each case into the Node-side evidence object and writes the artifact immediately, so
    // the file is the durable record even if a later test fails. Playwright restarts the worker after a
    // failure, which re-runs `beforeAll` and gives that hook a fresh `evidence`, so the artifact is what
    // proves the runs were recorded. This test observes nothing itself; its own row is drained afterwards.
    const { readFileSync, existsSync } = await import('node:fs');
    const path = 'docs/artifacts/give-command-browser-rows.json';
    expect(existsSync(path), 'the artifact was written by the drains so far').toBe(true);
    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written.rows.length, 'the artifact holds the observed cases').toBeGreaterThan(20);
    expect(written.rows.filter((r) => r.error).length, 'no case threw').toBe(0);
    expect(written.rows.filter((r) => r.command && r.route === 'GAME_DISPATCH').length, 'both routes are represented')
      .toBeGreaterThan(15);
    expect(written.rows.some((r) => r.route === 'BOT_API'), 'the bot route is represented').toBe(true);
    expect(written.reproductions.length, 'the reproductions are recorded').toBe(10);
    expect(written.reference?.settingsApplied?.stored, 'the settings actually used are recorded')
      .toEqual({ gameMode: 'survival', cheats: true });
  });
});

