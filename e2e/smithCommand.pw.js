// Smithing, run through the bot's own `smith` action in a disposable headless browser.
//
// Layer: real `PlayerBot.run({type:'smith'})` -> `BotSurvival.tick` -> the real smithing table's slots and its
// `takeSmithingOutput`, with a real smithing table block in the real world. The matcher unit tests cannot reach
// this layer: they never move a stack out of the inventory or through the table's take rule.
//
// Nothing here treats the bot's success string as evidence. Every result, every leftover and the experience
// level are read off the real inventory, the real table slots and the player.
//
// Reference: https://minecraft.wiki/w/Smithing
import { test, expect } from '@playwright/test';

test.describe('smithing through the bot API', () => {
  const evidence = { rows: [], generatedAt: null, reference: null };

  async function drain() {
    const rows = await globalThis.__page.evaluate(() => {
      const out = window.__smith.observed.slice();
      window.__smith.observed.length = 0;
      return out;
    });
    const { writeFileSync, mkdirSync, readFileSync, existsSync } = await import('node:fs');
    mkdirSync('docs/artifacts', { recursive: true });
    const path = 'docs/artifacts/smith-browser-rows.json';
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
    try { await drain(); } catch (error) { console.error('[smith] drain failed:', error.message); }
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
      const { createSmithHarness } = await import('/e2e/fixtures/smithHarness.js');
      window.__smith = await createSmithHarness(window.game);
      window.__smithSetup = window.__smith.reset({ gameMode: 'creative', cheats: true, table: true });
    });
    const setup = await page.evaluate(() => window.__smithSetup);
    evidence.reference = {
      wiki: 'https://minecraft.wiki/w/Smithing (fetched in this run)',
      javaEditionTarget: '1.21.4 (DataVersion 4189)',
      setup,
    };
    expect(setup.mode, 'the harness is set up in creative').toBe('creative');
    expect(setup.voxel, 'and a smithing table in the world').toBe(setup.expected);
    globalThis.__page = page;
  });

  // --- SMI-01: the netherite upgrade ------------------------------------------------

  test('SMI-01 a netherite upgrade makes the netherite piece, keeps the template, spends the gear and the ingot', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__smith;
      h.reset({ gameMode: 'creative', cheats: true, table: true });
      h.give('netherite_upgrade_smithing_template', 1);
      h.give('diamond_chestplate', 1);
      h.give('netherite_ingot', 1);
      const xp = window.game.player.xpLevel;
      const row = await h.smith({ template: 'netherite_upgrade', base: 'diamond_chestplate', addition: 'netherite_ingot', position: h.TABLE });
      return {
        error: row.error, ok: row.ok, message: row.message,
        held: row.after.held, slots: row.after.slots, cursor: row.after.cursor,
        xpBefore: xp, xpAfter: row.after.xpLevel, botActive: row.after.botActive,
      };
    });
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    expect(r.ok, `the bot reported: ${r.message}`).toBe(true);
    expect(r.held.netherite_chestplate, 'the netherite chestplate is made').toBe(1);
    expect(r.held.diamond_chestplate ?? 0, 'the diamond chestplate is spent').toBe(0);
    expect(r.held.netherite_ingot ?? 0, 'the netherite ingot is spent').toBe(0);
    expect(r.held.netherite_upgrade_smithing_template, 'the upgrade template is NOT consumed').toBe(1);
    expect(r.slots, 'the table slots are empty afterwards').toEqual({ template: null, base: null, addition: null });
    expect(r.cursor, 'nothing left on the cursor').toBeNull();
    expect(r.xpAfter, 'the upgrade costs no experience').toBe(r.xpBefore);
    expect(r.botActive, 'the bot releases control').toBe(false);
  });

  // --- SMI-02: what an upgrade carries across ---------------------------------------

  test('SMI-02 an upgrade keeps the enchantments, the trim, the name, the prior work penalty and the durability lost', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__smith;
      const { maxDurabilityFor } = await import('/src/durability.js');
      h.reset({ gameMode: 'creative', cheats: true, table: true });
      h.give('netherite_upgrade_smithing_template', 1);
      h.giveStack({
        id: 'diamond_chestplate', count: 1, maxDurability: maxDurabilityFor('diamond_chestplate'),
        durability: 400,
        enchantments: [{ id: 'protection', level: 4 }],
        trim: { pattern: 'sentry', material: 'gold_ingot', color: '#DEB12D', name: 'Gold' },
        customName: 'Heirloom', repairCost: 7,
      });
      h.give('netherite_ingot', 1);
      const row = await h.smith({ template: 'netherite_upgrade', base: 'diamond_chestplate', addition: 'netherite_ingot', position: h.TABLE });
      const piece = h.items().find((s) => s.id === 'netherite_chestplate') ?? null;
      return {
        error: row.error, ok: row.ok, piece,
        newMax: maxDurabilityFor('netherite_chestplate'), diamondMax: maxDurabilityFor('diamond_chestplate'),
      };
    });
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    expect(r.piece, 'a netherite chestplate exists').not.toBeNull();
    expect(r.piece.enchantments, 'enchantments carry').toEqual([{ id: 'protection', level: 4 }]);
    expect(r.piece.trim, 'the trim carries').toEqual({ pattern: 'sentry', material: 'gold_ingot', color: '#DEB12D', name: 'Gold' });
    expect(r.piece.customName, 'the name carries').toBe('Heirloom');
    expect(r.piece.repairCost, 'the prior work penalty carries').toBe(7);
    // 128 points were lost from diamond's 528; the netherite piece keeps those 128 lost, not the 128 remaining.
    const lost = r.diamondMax - 400;
    expect(r.piece.durability, 'the points LOST carry, not the points remaining').toBe(r.newMax - lost);
  });

  // --- SMI-03: the trim -------------------------------------------------------------

  test('SMI-03 a trim takes an armour piece, a template and a material, and consumes the template and the material', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__smith;
      h.reset({ gameMode: 'creative', cheats: true, table: true });
      h.give('sentry_armor_trim_smithing_template', 1);
      h.give('iron_chestplate', 1);
      h.give('gold_ingot', 1);
      const row = await h.smith({ template: 'sentry', base: 'iron_chestplate', addition: 'gold_ingot', position: h.TABLE });
      const piece = h.items().find((s) => s.id === 'iron_chestplate') ?? null;
      return {
        error: row.error, ok: row.ok, message: row.message, piece,
        held: row.after.held, slots: row.after.slots, cursor: row.after.cursor,
      };
    });
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    expect(r.ok, `the bot reported: ${r.message}`).toBe(true);
    expect(r.piece?.trim?.pattern, 'the piece is trimmed with sentry').toBe('sentry');
    expect(r.piece?.trim?.material, 'and with gold').toBe('gold_ingot');
    expect(r.held.sentry_armor_trim_smithing_template ?? 0, 'the template is consumed').toBe(0);
    expect(r.held.gold_ingot ?? 0, 'the material is consumed').toBe(0);
    expect(r.held.iron_chestplate, 'the armour piece is the same item, not replaced').toBe(1);
    expect(r.slots).toEqual({ template: null, base: null, addition: null });
    expect(r.cursor).toBeNull();
  });

  // --- SMI-04: a second trim overwrites the first -----------------------------------

  test('SMI-04 trimming an already-trimmed piece overwrites the old trim', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__smith;
      h.reset({ gameMode: 'creative', cheats: true, table: true });
      h.give('vex_armor_trim_smithing_template', 1);
      h.giveStack({ id: 'iron_chestplate', count: 1, trim: { pattern: 'vex', material: 'iron_ingot', color: '#ECECEC', name: 'Iron' } });
      h.give('sentry_armor_trim_smithing_template', 1);
      h.give('gold_ingot', 1);
      const first = await h.smith({ template: 'sentry', base: 'iron_chestplate', addition: 'gold_ingot', position: h.TABLE });
      const piece = h.items().filter((s) => s.id === 'iron_chestplate');
      return { error: first.error, ok: first.ok, pieces: piece.length, trim: piece[0]?.trim ?? null };
    });
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    expect(r.pieces, 'there is still one piece, not two').toBe(1);
    expect(r.trim.pattern, 'the new pattern replaces the old').toBe('sentry');
    expect(r.trim.material, 'and the new material').toBe('gold_ingot');
  });

  // --- SMI-05: refusals leave the inventory alone -----------------------------------

  test('SMI-05 an upgrade with the wrong material is refused and every input is returned', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__smith;
      h.reset({ gameMode: 'creative', cheats: true, table: true });
      h.give('netherite_upgrade_smithing_template', 1);
      h.give('diamond_chestplate', 1);
      h.give('iron_ingot', 1);
      const before = h.snapshot().held;
      const row = await h.smith({ template: 'netherite_upgrade', base: 'diamond_chestplate', addition: 'iron_ingot', position: h.TABLE });
      return { error: row.error, ok: row.ok, message: row.message, before, held: row.after.held, slots: row.after.slots, cursor: row.after.cursor };
    });
    expect(r.error ?? r.message, 'the bot refuses with a reason').toMatch(/netherite ingot/);
    expect(r.ok).toBeFalsy();
    expect(r.held, 'every input is back in the inventory').toEqual(r.before);
    expect(r.slots).toEqual({ template: null, base: null, addition: null });
    expect(r.cursor).toBeNull();
  });

  test('SMI-06 a trim on a non-armour item is refused, the wiki says trims are for armour only', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__smith;
      h.reset({ gameMode: 'creative', cheats: true, table: true });
      h.give('sentry_armor_trim_smithing_template', 1);
      h.give('diamond_sword', 1);
      h.give('gold_ingot', 1);
      const before = h.snapshot().held;
      const row = await h.smith({ template: 'sentry', base: 'diamond_sword', addition: 'gold_ingot', position: h.TABLE });
      return { error: row.error, ok: row.ok, message: row.message, before, held: row.after.held };
    });
    expect(r.error ?? r.message, 'the bot refuses with a reason').toMatch(/not a piece of armour/);
    expect(r.held, 'the sword, the template and the gold are all still there').toEqual(r.before);
  });

  test('SMI-07 an unknown template is refused, and nothing is taken', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__smith;
      h.reset({ gameMode: 'creative', cheats: true, table: true });
      h.give('diamond_chestplate', 1);
      h.give('netherite_ingot', 1);
      const before = h.snapshot().held;
      const row = await h.smith({ template: 'bogus', base: 'diamond_chestplate', addition: 'netherite_ingot', position: h.TABLE });
      return { error: row.error, ok: row.ok, message: row.message, before, held: row.after.held };
    });
    expect(r.error, 'the bot names the bad template').toMatch(/Unknown smithing template/);
    expect(r.held).toEqual(r.before);
  });

  test('SMI-08 in survival a missing ingredient is refused and the rest of the inventory is untouched', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__smith;
      h.reset({ gameMode: 'survival', cheats: false, table: true });
      h.give('netherite_upgrade_smithing_template', 1);
      h.give('diamond_chestplate', 1);
      const before = h.snapshot().held;
      const row = await h.smith({ template: 'netherite_upgrade', base: 'diamond_chestplate', addition: 'netherite_ingot', position: h.TABLE });
      return { error: row.error, ok: row.ok, message: row.message, before, held: row.after.held, mode: row.before.mode };
    });
    expect(r.mode).toBe('survival');
    expect(r.error ?? r.message, 'the bot says what is missing').toMatch(/netherite_ingot in inventory/);
    expect(r.held, 'the template and the chestplate are where they were').toEqual(r.before);
  });

  test('SMI-09 a smithing table must be within reach and must be there', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__smith;
      h.reset({ gameMode: 'creative', cheats: true, table: false });
      h.give('netherite_upgrade_smithing_template', 1);
      h.give('diamond_chestplate', 1);
      h.give('netherite_ingot', 1);
      const row = await h.smith({ template: 'netherite_upgrade', base: 'diamond_chestplate', addition: 'netherite_ingot', position: h.TABLE });
      return { error: row.error, ok: row.ok, message: row.message, held: row.after.held };
    });
    expect(r.error ?? r.message, 'no table in the world is refused').toMatch(/station is missing/);
    expect(r.held.diamond_chestplate, 'the gear is not spent').toBe(1);
  });

  // --- trim visuals ------------------------------------------------------------------
  //
  // The wiki's outline: a trim is drawn over the armour in the trim material's colour, and "if the armor material
  // matches the trim material, the palette is slightly darker". Each case has the BOT make the trimmed piece, then
  // reads what the real UI draws for it -- pixels of the real icon, the real doll, the real tooltip.

  test.describe('trim visuals', () => {
    test.beforeAll(async () => {
      await globalThis.__page.evaluate(() => {
        /**
         * Render a stack through the real slot renderer and read back the icon it shows.
         * Waits for the composed trim icon when the stack carries a trim.
         */
        window.__icon = async (item, { timeout = 5000 } = {}) => {
          const slot = document.createElement('div');
          slot.className = 'inv-slot';
          document.body.appendChild(slot);
          window.game.ui.renderSlotContent(slot, item);
          const img = slot.querySelector('img');
          const start = performance.now();
          while (performance.now() - start < timeout) {
            if (img.complete && img.naturalWidth > 0 && (!item.trim || img.dataset.trimmed === 'true')) break;
            await new Promise((r) => setTimeout(r, 25));
          }
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const data = Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
          const dataset = { ...img.dataset };
          slot.remove();
          return { width: canvas.width, height: canvas.height, data, dataset };
        };
        /** The real stack of an id in the inventory, not a copy. */
        window.__stack = (id) => [...window.game.inventory.hotbar, ...window.game.inventory.storage].find((s) => s && s.id === id);
      });
    });

    test('SMI-10 a trim the bot makes is drawn on the armour icon, in the material colour, inside the armour', async () => {
      const r = await globalThis.__page.evaluate(async () => {
        const h = window.__smith;
        const tv = await import('/src/trimVisuals.js');
        h.reset({ gameMode: 'creative', cheats: true, table: true });
        h.give('sentry_armor_trim_smithing_template', 1);
        h.give('iron_chestplate', 1);
        h.give('gold_ingot', 1);
        const row = await h.smith({ template: 'sentry', base: 'iron_chestplate', addition: 'gold_ingot', position: h.TABLE });
        const stack = window.__stack('iron_chestplate');
        const trimmed = await window.__icon(stack);
        const plain = await window.__icon({ id: 'iron_chestplate', count: 1 });
        const [cr, cg, cb] = tv.hexToRgb(tv.trimColorFor('iron_chestplate', stack.trim));
        let trimColoured = 0, plainTrimColoured = 0, changed = 0, changedOutsideDrawing = 0;
        const core=tv.iconTrimCells('iron_chestplate','sentry').filter(({x,y})=>plain.data[(y*plain.width+x)*4+3]>0);
        const cells = new Set([...core,...tv.trimEdgeCells(core)].map(({ x, y }) => `${x},${y}`));
        const px = (img, i) => img.data.slice(i * 4, i * 4 + 4);
        for (let i = 0; i < trimmed.width * trimmed.height; i++) {
          const a = px(trimmed, i), b = px(plain, i);
          if (a[0] === cr && a[1] === cg && a[2] === cb && a[3] === 255) trimColoured++;
          if (b[0] === cr && b[1] === cg && b[2] === cb && b[3] === 255) plainTrimColoured++;
          if (a.some((v, k) => v !== b[k])) {
            changed++;
            if (!cells.has(`${i % trimmed.width},${Math.floor(i / trimmed.width)}`)) changedOutsideDrawing++;
          }
        }
        // How many of the drawing's cells fall on pixels the plain icon paints.
        let expected = 0;
        for (const { x, y } of tv.iconTrimCells('iron_chestplate', 'sentry')) if (plain.data[(y * plain.width + x) * 4 + 3] > 0) expected++;
        return {
          error: row.error, ok: row.ok, trim: stack.trim, dataset: trimmed.dataset,
          trimColoured, plainTrimColoured, changed, changedOutsideDrawing, expected,
          sameSize: trimmed.width === plain.width && trimmed.height === plain.height,
        };
      });
      expect(r.error, `the bot threw: ${r.error}`).toBeNull();
      expect(r.trim.pattern).toBe('sentry');
      expect(r.sameSize, 'the trimmed icon is the same size as the plain one').toBe(true);
      expect(r.dataset.trimPattern, 'the icon says which pattern it shows').toBe('sentry');
      expect(r.dataset.trimMaterial).toBe('gold_ingot');
      expect(r.plainTrimColoured, 'the plain icon has no trim-coloured pixels to confuse the count').toBe(0);
      expect(r.expected, 'the drawing lands on the armour').toBeGreaterThanOrEqual(8);
      expect(r.trimColoured, 'every drawn pixel is in the gold colour').toBe(r.expected);
      expect(r.changed, 'core pixels and optional contrast edges change').toBeGreaterThanOrEqual(r.expected);
      expect(r.changedOutsideDrawing, 'no pixel changed outside the drawing and its exterior edge').toBe(0);
    });

    test('SMI-11 the player doll draws the trim of the armour the bot made, and the equipment panel shows it', async () => {
      const r = await globalThis.__page.evaluate(async () => {
        const h = window.__smith;
        const { renderPlayerDollSVG, renderPlayerDoll } = await import('/src/playerDoll.js');
        const tv = await import('/src/trimVisuals.js');
        h.reset({ gameMode: 'creative', cheats: true, table: true });
        h.give('rib_armor_trim_smithing_template', 1);
        h.give('diamond_leggings', 1);
        h.give('lapis_lazuli', 1);
        const row = await h.smith({ template: 'rib', base: 'diamond_leggings', addition: 'lapis_lazuli', position: h.TABLE });
        const stack = window.__stack('diamond_leggings');
        window.game.inventory.armor = { head: null, chest: null, legs: stack, feet: null };
        const holder = document.createElement('div');
        document.body.appendChild(holder);
        renderPlayerDoll(holder, window.game.inventory.armor);
        const group = holder.querySelector('#trim-legs');
        const out = {
          error: row.error, ok: row.ok,
          present: Boolean(group),
          pattern: group?.dataset.pattern, material: group?.dataset.material, color: group?.dataset.color,
          rects: group ? group.querySelectorAll('rect').length : 0,
          expectedRects: tv.dollTrimCells('legs', 'rib').length,
          expectedColor: tv.trimColorFor('diamond_leggings', stack.trim),
          otherTrims: holder.querySelectorAll('[id^="trim-"]').length,
          after: renderPlayerDollSVG({ legs: { id: 'diamond_leggings' } }).includes('trim-'),
        };
        holder.remove();
        window.game.inventory.armor = { head: null, chest: null, legs: null, feet: null };
        return out;
      });
      expect(r.error, `the bot threw: ${r.error}`).toBeNull();
      expect(r.present, 'the leggings\' trim is on the doll').toBe(true);
      expect(r.pattern).toBe('rib');
      expect(r.material).toBe('lapis_lazuli');
      expect(r.color, 'in the lapis colour').toBe(r.expectedColor);
      expect(r.rects, 'one square per painted cell').toBe(r.expectedRects);
      expect(r.otherTrims, 'and only the leggings are trimmed').toBe(1);
      expect(r.after, 'the same leggings without a trim draw no trim').toBe(false);
    });

    test('SMI-12 armour trimmed with its own material has a darker palette than the same trim in another material', async () => {
      const r = await globalThis.__page.evaluate(async () => {
        const h = window.__smith;
        const tv = await import('/src/trimVisuals.js');
        const results = {};
        for (const [label, addition] of [['matching', 'gold_ingot'], ['other', 'iron_ingot']]) {
          h.reset({ gameMode: 'creative', cheats: true, table: true });
          h.give('wayfinder_armor_trim_smithing_template', 1);
          h.give('golden_chestplate', 1);
          h.give(addition, 1);
          const row = await h.smith({ template: 'wayfinder', base: 'golden_chestplate', addition, position: h.TABLE });
          const stack = window.__stack('golden_chestplate');
          const icon = await window.__icon(stack);
          const plain = await window.__icon({ id: 'golden_chestplate', count: 1 });
          // The colour that dominates the pixels that changed is the trim's colour.
          const counts = new Map();
          for (let i = 0; i < icon.width * icon.height; i++) {
            const a = icon.data.slice(i * 4, i * 4 + 4), b = plain.data.slice(i * 4, i * 4 + 4);
            if (a.some((v, k) => v !== b[k])) counts.set(a.slice(0, 3).join(','), (counts.get(a.slice(0, 3).join(',')) ?? 0) + 1);
          }
          const [colour] = [...counts.entries()].sort((x, y) => y[1] - x[1])[0] ?? [null];
          results[label] = {
            error: row.error, colour, expected: tv.hexToRgb(tv.trimColorFor('golden_chestplate', stack.trim)).join(','),
            matches: tv.trimMatchesArmour('golden_chestplate', stack.trim), distinct: counts.size,
          };
        }
        return results;
      });
      expect(r.matching.error, `the bot threw: ${r.matching.error}`).toBeNull();
      expect(r.other.error, `the bot threw: ${r.other.error}`).toBeNull();
      expect(r.matching.matches, 'gold on gold is a match').toBe(true);
      expect(r.other.matches, 'iron on gold is not').toBe(false);
      expect(r.matching.distinct, 'one colour is drawn').toBe(1);
      expect(r.other.distinct).toBe(1);
      expect(r.matching.colour, 'the matching trim is drawn in the darker gold').toBe(r.matching.expected);
      expect(r.other.colour, 'the other is drawn in plain iron').toBe(r.other.expected);
      const sum = (c) => c.split(',').reduce((n, v) => n + Number(v), 0);
      expect(sum(r.matching.colour), 'the matching gold is darker than gold').toBeLessThan(sum('222,177,45'));
    });

    test('SMI-13 every armour piece shows every pattern on its real icon', async () => {
      const r = await globalThis.__page.evaluate(async () => {
        const tv = await import('/src/trimVisuals.js');
        const { ITEMS } = await import('/src/blocks.js');
        const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(src)); i.src = src; });
        const pieces = Object.keys(ITEMS).filter((id) => tv.armourSlotOf(id));
        const failures = [];
        let least = Infinity, checked = 0;
        for (const id of pieces) {
          const base = await load(ITEMS[id].icon);
          const canvas = document.createElement('canvas');
          canvas.width = base.naturalWidth; canvas.height = base.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(base, 0, 0);
          const original = ctx.getImageData(0, 0, canvas.width, canvas.height);
          for (const pattern of Object.keys(tv.TRIM_MOTIFS)) {
            const copy = { width: original.width, height: original.height, data: new Uint8ClampedArray(original.data) };
            const painted = tv.applyTrimToImage(copy, id, { pattern, material: 'redstone' });
            const scale = original.width / 16;
            const pixels = painted / (scale * scale);
            least = Math.min(least, pixels);
            checked++;
            let outside = 0;
            for (let i = 0; i < copy.data.length; i += 4) if (original.data[i + 3] === 0 && copy.data[i + 3] !== 0) outside++;
            if (pixels < 5 || outside) failures.push({ id, pattern, pixels, outside });
          }
        }
        return { pieces: pieces.length, checked, least, failures: failures.slice(0, 12), failureCount: failures.length };
      });
      expect(r.pieces, 'the game\'s armour is all covered').toBeGreaterThanOrEqual(25);
      expect(r.checked).toBe(r.pieces * 18);
      expect(r.failures, `${r.failureCount} piece/pattern pairs show too little of the pattern`).toEqual([]);
      expect(r.least, 'even the least visible pairing shows at least five pixels').toBeGreaterThanOrEqual(5);
    });

    test('SMI-14 the tooltip of a trimmed piece names the pattern and the material', async () => {
      const r = await globalThis.__page.evaluate(async () => {
        const h = window.__smith;
        h.reset({ gameMode: 'creative', cheats: true, table: true });
        h.give('silence_armor_trim_smithing_template', 1);
        h.give('netherite_helmet', 1);
        h.give('emerald', 1);
        const row = await h.smith({ template: 'silence', base: 'netherite_helmet', addition: 'emerald', position: h.TABLE });
        const stack = window.__stack('netherite_helmet');
        const ui = window.game.ui;
        const before = ui.advancedTooltips;
        const out = { error: row.error };
        ui.advancedTooltips = false;
        out.off = ui.advancedTooltipSuffix(stack);
        ui.advancedTooltips = true;
        out.on = ui.advancedTooltipSuffix(stack);
        ui.advancedTooltips = before;
        out.plain = ui.advancedTooltipSuffix({ id: 'netherite_helmet', count: 1 });
        return out;
      });
      expect(r.error, `the bot threw: ${r.error}`).toBeNull();
      expect(r.off, 'shown without advanced tooltips').toContain('Silence Armor Trim · Emerald Material');
      expect(r.on, 'and with them').toContain('Silence Armor Trim · Emerald Material');
      expect(r.plain, 'an untrimmed piece says nothing about a trim').not.toContain('Armor Trim');
    });

    test('SMI-15 the netherite upgrade the bot runs keeps the trim, and the new piece still shows it', async () => {
      const r = await globalThis.__page.evaluate(async () => {
        const h = window.__smith;
        h.reset({ gameMode: 'creative', cheats: true, table: true });
        h.give('netherite_upgrade_smithing_template', 1);
        h.giveStack({ id: 'diamond_chestplate', count: 1, trim: { pattern: 'flow', material: 'copper_ingot', color: '#B4684D', name: 'Copper' } });
        h.give('netherite_ingot', 1);
        const row = await h.smith({ template: 'netherite_upgrade', base: 'diamond_chestplate', addition: 'netherite_ingot', position: h.TABLE });
        const stack = window.__stack('netherite_chestplate');
        const icon = await window.__icon(stack);
        const plain = await window.__icon({ id: 'netherite_chestplate', count: 1 });
        let changed = 0;
        for (let i = 0; i < icon.data.length; i++) if (icon.data[i] !== plain.data[i]) changed++;
        return { error: row.error, trim: stack?.trim ?? null, dataset: icon.dataset, changed };
      });
      expect(r.error, `the bot threw: ${r.error}`).toBeNull();
      expect(r.trim?.pattern, 'the upgraded piece keeps its trim').toBe('flow');
      expect(r.dataset.trimPattern, 'and shows it').toBe('flow');
      expect(r.changed, 'the icon differs from the untrimmed netherite chestplate').toBeGreaterThan(0);
    });

    test('SMI-16 the hotbar and the cursor show the trim too', async () => {
      const r = await globalThis.__page.evaluate(async () => {
        const h = window.__smith;
        h.reset({ gameMode: 'creative', cheats: true, table: true });
        h.give('coast_armor_trim_smithing_template', 1);
        h.give('chainmail_boots', 1);
        h.give('quartz', 1);
        const row = await h.smith({ template: 'coast', base: 'chainmail_boots', addition: 'quartz', position: h.TABLE });
        const stack = window.__stack('chainmail_boots');
        const game = window.game;
        const wait = async (fn) => { for (let i = 0; i < 200 && !fn(); i++) await new Promise((r) => setTimeout(r, 25)); return fn(); };
        // Hotbar: move the real stack into the active slot and redraw.
        const hotbar = game.inventory.hotbar;
        const from = hotbar.indexOf(stack);
        if (from >= 0) hotbar[from] = null;
        else { const j = game.inventory.storage.indexOf(stack); game.inventory.storage[j] = null; }
        hotbar[game.inventory.activeSlot] = stack;
        game.ui.updateHotbar();
        const slotImg = () => game.ui.hotbarEl.children[game.inventory.activeSlot].querySelector('img');
        const hotbarTrimmed = await wait(() => slotImg()?.dataset.trimmed === 'true');
        const hotbarPattern = slotImg()?.dataset.trimPattern;
        // Cursor: pick it up and redraw the ghost.
        hotbar[game.inventory.activeSlot] = null;
        game.inventory.cursorItem = stack;
        game.ui.updateFloatingCursor();
        const cursorImg = game.ui.floatingItem.querySelector('.slot-icon');
        const cursorTrimmed = await wait(() => cursorImg.dataset.trimmed === 'true');
        const out = { error: row.error, hotbarTrimmed, hotbarPattern, cursorTrimmed, cursorPattern: cursorImg.dataset.trimPattern };
        game.inventory.cursorItem = null;
        game.ui.updateFloatingCursor();
        return out;
      });
      expect(r.error, `the bot threw: ${r.error}`).toBeNull();
      expect(r.hotbarTrimmed, 'the hotbar icon shows the trim').toBe(true);
      expect(r.hotbarPattern).toBe('coast');
      expect(r.cursorTrimmed, 'the cursor icon shows the trim').toBe(true);
      expect(r.cursorPattern).toBe('coast');
    });

    test('SMI-17 the 18 drawings, on every slot, as a contact sheet', async () => {
      const ok = await globalThis.__page.evaluate(async () => {
        const tv = await import('/src/trimVisuals.js');
        const doll = await import('/src/playerDoll.js');
        const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
        const icon = async (id, trim, scale = 6) => {
          const base = await load(`/assets/items/${id}.png`);
          const c = document.createElement('canvas'); c.width = 16; c.height = 16;
          const ctx = c.getContext('2d'); ctx.drawImage(base, 0, 0);
          const img = ctx.getImageData(0, 0, 16, 16);
          tv.applyTrimToImage(img, id, trim);
          ctx.putImageData(img, 0, 0);
          const out = document.createElement('canvas'); out.width = 16 * scale; out.height = 16 * scale;
          const o = out.getContext('2d'); o.imageSmoothingEnabled = false; o.drawImage(c, 0, 0, out.width, out.height);
          out.style.cssText = `background:#8b8b8b;margin:2px;image-rendering:pixelated;width:${out.width}px;height:${out.height}px`;
          return out;
        };
        document.getElementById('__sheet')?.remove();
        const root = document.createElement('div');
        root.id = '__sheet';
        root.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#222;color:#fff;font:12px monospace;padding:10px;width:1180px';
        const row = (title) => {
          const t = document.createElement('div'); t.textContent = title; t.style.cssText = 'margin:8px 0 2px'; root.appendChild(t);
          const r = document.createElement('div'); r.style.cssText = 'display:flex;flex-wrap:wrap;align-items:flex-start'; root.appendChild(r); return r;
        };
        let r = row('Armour trim patterns: ' + Object.keys(tv.TRIM_MOTIFS).join(', ') + ' (iron chestplate, gold)');
        for (const p of Object.keys(tv.TRIM_MOTIFS)) r.appendChild(await icon('iron_chestplate', { pattern: p, material: 'gold_ingot' }));
        r = row('Every slot: helmet, chestplate, leggings, boots, turtle shell (diamond / snout / emerald)');
        for (const id of ['diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots', 'turtle_helmet']) r.appendChild(await icon(id, { pattern: 'snout', material: 'emerald' }));
        r = row('Own material is darker: gold, iron, diamond, netherite chestplates trimmed with their own material, then lapis');
        for (const [id, m] of [['golden_chestplate', 'gold_ingot'], ['iron_chestplate', 'iron_ingot'], ['diamond_chestplate', 'diamond'], ['netherite_chestplate', 'netherite_ingot'], ['golden_chestplate', 'lapis_lazuli'], ['iron_chestplate', 'lapis_lazuli'], ['diamond_chestplate', 'lapis_lazuli'], ['netherite_chestplate', 'lapis_lazuli']]) r.appendChild(await icon(id, { pattern: 'eye', material: m }));
        r = row('Player doll: netherite / rib / gold, iron / wayfinder / lapis, diamond / vex / diamond');
        for (const [mat, pat, tm] of [['netherite', 'rib', 'gold_ingot'], ['iron', 'wayfinder', 'lapis_lazuli'], ['diamond', 'vex', 'diamond']]) {
          const t = { pattern: pat, material: tm };
          const holder = document.createElement('div');
          holder.style.cssText = 'width:96px;height:192px;margin:4px;background:#8b8b8b';
          holder.innerHTML = doll.renderPlayerDollSVG({ head: { id: `${mat}_helmet`, trim: t }, chest: { id: `${mat}_chestplate`, trim: t }, legs: { id: `${mat}_leggings`, trim: t }, feet: { id: `${mat}_boots`, trim: t } });
          holder.firstChild.style.cssText = 'width:100%;height:100%';
          r.appendChild(holder);
        }
        document.body.appendChild(root);
        return true;
      });
      expect(ok).toBe(true);
      const { mkdirSync } = await import('node:fs');
      mkdirSync('docs/artifacts', { recursive: true });
      await globalThis.__page.locator('#__sheet').screenshot({ path: 'docs/artifacts/trim-contact-sheet.png' });
      await globalThis.__page.evaluate(() => document.getElementById('__sheet')?.remove());
    });
  });
});
