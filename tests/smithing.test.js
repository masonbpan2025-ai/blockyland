// The smithing table, which had no behaviour at all.
//
// `smithing_table` has been a placeable block with a `workstation` field and nothing behind it: no
// interaction branch in `main.js`, no module, no recipe. It showed up in the Resource Inspector rather than
// by looking -- every piece of netherite gear read as having no source of any kind, because in vanilla the
// smithing table is the only place it comes from.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ITEMS, BLOCKS } from '../src/blocks.js';
import { maxDurabilityFor } from '../src/durability.js';
import { registry, resolveResource } from '../src/resourceRegistry.js';
import { getSmeltingRecipe, SMELTING_RECIPES } from '../src/furnace.js';
import {
  NETHERITE_UPGRADE, NETHERITE_UPGRADE_TEMPLATE, NETHERITE_INGOT, TRIM_TEMPLATES,
  calculateSmithingResult,
} from '../src/smithing.js';

const template = { id: NETHERITE_UPGRADE_TEMPLATE };
const ingot = { id: NETHERITE_INGOT };

// --- the table ----------------------------------------------------------------

test('the nine pieces vanilla upgrades are the nine offered', () => {
  assert.equal(Object.keys(NETHERITE_UPGRADE).length, 9, 'sword, four tools and four armour pieces');
  for (const [from, to] of Object.entries(NETHERITE_UPGRADE)) {
    assert.ok(ITEMS[from], `${from} must exist to be upgraded`);
    assert.ok(ITEMS[to], `${to} must exist to be produced`);
    assert.ok(from.startsWith('diamond_'), `${from} is not diamond gear`);
    assert.ok(to.startsWith('netherite_'), `${to} is not netherite gear`);
    // The suffix has to match, or a table typo would silently upgrade a sword into a helmet.
    assert.equal(to.slice('netherite_'.length), from.slice('diamond_'.length), `${from} -> ${to} mismatch`);
  }
  // Nothing else is upgradeable, which is the point of a table over a name rewrite.
  for (const id of ['golden_sword', 'iron_sword', 'netherite_sword', 'diamond_horse_armor']) {
    assert.equal(NETHERITE_UPGRADE[id], undefined, `${id} must not be upgradeable`);
  }
});

// --- the transformation -------------------------------------------------------

test('a template, diamond gear and an ingot make the netherite piece', () => {
  const result = calculateSmithingResult(template, { id: 'diamond_chestplate' }, ingot);
  assert.equal(result.valid, true, result.reason);
  assert.equal(result.result.id, 'netherite_chestplate');
  assert.equal(result.result.count, 1);
  assert.equal(result.result.isBlock, false);
  assert.equal(result.templateSurvives, true, 'vanilla returns the template');
});

test('the upgrade keeps the enchantments and the wear, and gains netherite durability', () => {
  const base = {
    id: 'diamond_pickaxe',
    enchantments: [{ id: 'efficiency', level: 4 }, { id: 'unbreaking', level: 3 }],
    durability: 120,
    maxDurability: 1561,
  };
  const result = calculateSmithingResult(template, base, ingot);
  assert.equal(result.valid, true);
  assert.deepEqual(result.result.enchantments, base.enchantments, 'enchantments carry over');
  assert.equal(result.result.durability, 120, 'and so does the remaining durability');
  // Netherite's own maximum, read from the same table the rest of the game uses rather than restated.
  assert.equal(result.result.maxDurability, maxDurabilityFor('netherite_pickaxe'));
  assert.equal(result.result.maxDurability, 2031, "vanilla's netherite tool durability");
  assert.equal(maxDurabilityFor('diamond_pickaxe'), 1561);
  // The copy must not share the array with the base, or upgrading would alias two inventories together.
  assert.notEqual(result.result.enchantments, base.enchantments);
  result.result.enchantments[0].level = 1;
  assert.equal(base.enchantments[0].level, 4, 'the base is untouched');
});

test('armour upgraded to netherite gets netherite armour durability', () => {
  // The armour maxima are their own values rather than the tool ones, which is why this is asserted for a
  // piece of armour as well as for a tool.
  const result = calculateSmithingResult(template, { id: 'diamond_helmet' }, ingot);
  assert.equal(result.valid, true);
  assert.equal(result.result.maxDurability, maxDurabilityFor('netherite_helmet'));
  assert.notEqual(result.result.maxDurability, maxDurabilityFor('netherite_pickaxe'));
});

// --- the refusals, each with a reason ------------------------------------------

test('an empty slot refuses, and says which slots it needs', () => {
  for (const args of [[null, null, null], [template, null, ingot], [template, { id: 'diamond_sword' }, null], [null, { id: 'diamond_sword' }, ingot]]) {
    const result = calculateSmithingResult(...args);
    assert.equal(result.valid, false);
    assert.equal(result.result, null);
    assert.match(result.reason, /template/i);
  }
});

test('a trim template is refused for the reason that is true', () => {
  // The template and the materials are real items here; what is missing is the tanning this game does not
  // do. Saying "not a smithing template" would be false, and saying nothing would be worse.
  const trim = TRIM_TEMPLATES[0];
  assert.ok(ITEMS[trim], `${trim} should exist as an item`);
  const result = calculateSmithingResult({ id: trim }, { id: 'diamond_chestplate' }, { id: 'gold_ingot' });
  assert.equal(result.valid, false);
  assert.match(result.reason, /cosmetic/i);
  // Every trim template is covered, so a new one cannot fall into the generic message by accident.
  for (const id of TRIM_TEMPLATES) {
    const r = calculateSmithingResult({ id }, { id: 'diamond_chestplate' }, { id: 'gold_ingot' });
    assert.match(r.reason, /cosmetic/i, `${id} should be named as a trim`);
  }
});

test('the wrong gear and the wrong material each say what is wrong', () => {
  const iron = calculateSmithingResult(template, { id: 'iron_sword' }, ingot);
  assert.equal(iron.valid, false);
  assert.match(iron.reason, /iron sword/i, 'the refusal should name the item');

  const wrongMaterial = calculateSmithingResult(template, { id: 'diamond_sword' }, { id: 'iron_ingot' });
  assert.equal(wrongMaterial.valid, false);
  assert.match(wrongMaterial.reason, /netherite ingot/i);

  const notATemplate = calculateSmithingResult({ id: 'paper' }, { id: 'diamond_sword' }, ingot);
  assert.equal(notATemplate.valid, false);
  assert.match(notATemplate.reason, /not a smithing template/i);
});

// --- what the Inspector can now see -------------------------------------------

test('the Inspector finds a source for every piece of netherite gear', () => {
  const reg = registry();
  for (const netheriteId of Object.values(NETHERITE_UPGRADE)) {
    const entry = reg.entries.get(netheriteId);
    assert.ok(entry, `${netheriteId} should be in the registry`);
    assert.equal(entry.smithingFrom.length, 1, `${netheriteId} should have exactly one smithing source`);
    const source = entry.smithingFrom[0];
    assert.equal(source.template, NETHERITE_UPGRADE_TEMPLATE);
    assert.equal(source.addition, NETHERITE_INGOT);
  }
  // And nothing else claims to come from a smithing table, which would be inventing a source.
  const claimed = [...reg.entries.values()].filter((e) => e.smithingFrom.length).map((e) => e.id).sort();
  assert.deepEqual(claimed, Object.values(NETHERITE_UPGRADE).sort());
});

// --- the wiring ----------------------------------------------------------------

test('the block opens a panel, and every element that panel needs exists', () => {
  // `domWiring.test.js` checks this generally; asserting it here as well means deleting the modal is caught
  // by the test that is about smithing rather than only by a broad one whose failure list is long.
  const html = readFileSync('index.html', 'utf8');
  for (const id of ['smithing-modal', 'close-smithing', 'smithing-template-slot', 'smithing-base-slot',
    'smithing-addition-slot', 'smithing-output-slot', 'smithing-hint-label', 'smithing-storage-grid',
    'smithing-hotbar-grid']) {
    assert.ok(html.includes(`id="${id}"`), `index.html is missing #${id}`);
  }
  const main = readFileSync('src/main.js', 'utf8');
  assert.match(main, /clickedBlock === BLOCKS\.SMITHING_TABLE/, 'the block must be interactive');
  assert.match(main, /this\.ui\.openSmithing\(/, 'and open the panel');
  const ui = readFileSync('src/ui.js', 'utf8');
  for (const method of ['openSmithing', 'closeSmithingModal', 'renderSmithingGUI', 'takeSmithingOutput']) {
    assert.match(ui, new RegExp(`${method}\\s*\\(`), `ui.js is missing ${method}`);
  }
});

test('the smithing table is still a placeable block', () => {
  assert.equal(typeof BLOCKS.SMITHING_TABLE, 'number');
  assert.ok(ITEMS.smithing_table, 'and has an item form');
});

// --- the chain the table needs ------------------------------------------------

test('the netherite chain is closed from ancient debris to the gear', () => {
  // The table consumes a netherite ingot, and an ingot is four scrap and four gold. Nothing smelted ancient
  // debris, so the scrap had no source at all and the ingot was uncraftable -- which would have made this
  // whole feature dead content in survival. Asserted as a chain rather than one link at a time.
  const debris = BLOCKS.ANCIENT_DEBRIS;
  assert.equal(typeof debris, 'number', 'ancient debris must be a block');
  const smelted = getSmeltingRecipe(debris);
  assert.ok(smelted, 'ancient debris must smelt into something');
  assert.equal(smelted.id, 'netherite_scrap');

  // Every ingredient of the ingot is obtainable: scrap by smelting and gold by smelting raw gold or ore.
  //
  // The registry takes the hand-written furnace table as a *provider* rather than importing it, because
  // `furnace.js` pulls in Three and the registry has to stay isomorphic. The CLI passes it in; a test that
  // does not would see only the generated extras and wrongly conclude the chain is broken.
  const reg = registry({ fresh: true, smelting: SMELTING_RECIPES });
  const scrap = reg.entries.get('netherite_scrap');
  assert.ok(scrap.smeltingFrom.length >= 1, 'scrap needs the smelting source this test just asserted');
  const ingot = reg.entries.get('netherite_ingot');
  const recipes = ingot.recipesAsResult.filter((r) => Array.isArray(r.ingredients));
  assert.ok(recipes.length, 'the ingot must have an ingredients recipe');
  // Ingredients are a mix of names and vanilla numeric ids (gold ingot is 214), so each is resolved the
  // same way the Inspector resolves a reference rather than assumed to be a name.
  const raw = [...new Set(recipes.flatMap((r) => r.ingredients.map((i) => (typeof i === 'object' ? i.id : i))))];
  const resolved = raw.map((r) => ({ raw: r, entry: resolveResource(r, reg) }));
  assert.ok(resolved.some((r) => r.entry?.id === 'netherite_scrap'), 'the ingot must need scrap, as vanilla does');
  for (const { raw: id, entry } of resolved) {
    assert.ok(entry, `recipe ingredient ${id} should be a registered resource`);
    const obtainable = entry.recipesAsResult.length + entry.smeltingFrom.length + entry.lootFrom.length
      + entry.droppedBy.length + entry.smithingFrom.length;
    assert.ok(obtainable > 0, `${entry.id} has no source, so the chain is broken there`);
  }
});
