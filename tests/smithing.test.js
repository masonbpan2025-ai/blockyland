// Smithing parity against https://minecraft.wiki/w/Smithing.
//
// The smithing table had no behaviour at all until the netherite upgrade was added: `smithing_table` was a
// placeable block with a `workstation` field and nothing behind it, so every piece of netherite gear read
// as having no source and the 18 trim templates the game already shipped were items nothing could use.
//
// Two rules were wrong once the upgrade existed, and neither was visible from a passing test because the
// test asserted the same wrong rule the code implemented:
//
//   1. DURABILITY. "the newly crafted netherite gear retains the enchantments, trims, name, prior work
//      penalty, and number of durability points LOST (instead of the remaining durability)". The code
//      carried the remaining figure across, so a diamond pickaxe at 120 of 1561 became 120 of 2031 -- a
//      gift of 1440 durability -- and the same rule would take durability away for any piece whose
//      netherite maximum is lower than its diamond one.
//   2. The `name` and the `prior work penalty` were dropped, though the same sentence names both.
//
// And one whole operation was missing: trimming. The module returned "Armour trims are cosmetic and are
// not applied yet", which was honest but meant 18 templates x 11 materials x every armour piece did
// nothing. It is implemented now, because the wiki states a gameplay consequence (gold trim and piglins)
// and because the templates are already items a player can obtain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ITEMS, BLOCKS } from '../src/blocks.js';
import { maxDurabilityFor } from '../src/durability.js';
import { registry, resolveResource } from '../src/resourceRegistry.js';
import { getSmeltingRecipe, SMELTING_RECIPES } from '../src/furnace.js';
import {
  NETHERITE_UPGRADE, NETHERITE_UPGRADE_TEMPLATE, NETHERITE_INGOT,
  TRIM_TEMPLATES, TRIM_PATTERNS, TRIM_MATERIALS,
  calculateSmithingResult, isTrimmableArmour, trimOf, hasGoldTrim,
} from '../src/smithing.js';

const template = { id: NETHERITE_UPGRADE_TEMPLATE };
const ingot = { id: NETHERITE_INGOT };

// --- the upgrade table ---------------------------------------------------------

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
  // Nothing else is upgradeable, which is the point of a table over a name rewrite. The wiki also lists
  // horse armour, nautilus armour and a spear; none of those diamond pieces exist here, so they are absent
  // rather than mapped onto something close.
  for (const id of ['golden_sword', 'iron_sword', 'netherite_sword', 'diamond_horse_armor',
    'leather_helmet', 'turtle_helmet', 'elytra']) {
    assert.equal(NETHERITE_UPGRADE[id], undefined, `${id} must not be upgradeable`);
  }
});

test('a template, diamond gear and an ingot make the netherite piece', () => {
  const result = calculateSmithingResult(template, { id: 'diamond_chestplate' }, ingot);
  assert.equal(result.valid, true, result.reason);
  assert.equal(result.result.id, 'netherite_chestplate');
  assert.equal(result.result.count, 1);
  assert.equal(result.result.isBlock, false);
  assert.equal(result.operation, 'upgrade');
  // "the template is not consumed" for an upgrade, unlike a trim.
  assert.equal(result.templateSurvives, true, 'an upgrade returns the template');
});

// --- the upgrade's durability rule ----------------------------------------------

test('an upgrade keeps the durability LOST, not the durability remaining', () => {
  // The wiki's rule, and the one the first version of this module got backwards. A pickaxe at 120 of
  // 1561 has lost 1441, so the netherite piece is at 2031 - 1441 = 590. Carrying the 120 across instead
  // would have been a gift of 1440 durability.
  const base = { id: 'diamond_pickaxe', durability: 120, maxDurability: maxDurabilityFor('diamond_pickaxe') };
  const result = calculateSmithingResult(template, base, ingot);
  assert.equal(result.valid, true);
  assert.equal(result.result.maxDurability, 2031, "vanilla's netherite tool durability");
  assert.equal(result.result.durability, 2031 - (1561 - 120), 'lost points carry over, not remaining ones');
  assert.equal(result.result.durability, 590);
  assert.notEqual(result.result.durability, 120, 'the remaining figure must NOT carry over');
});

test('a pristine piece upgrades pristine, whatever the maxima are', () => {
  for (const [from, to] of Object.entries(NETHERITE_UPGRADE)) {
    const max = maxDurabilityFor(from);
    const result = calculateSmithingResult(template, { id: from, durability: max, maxDurability: max }, ingot);
    assert.equal(result.valid, true, `${from}: ${result.reason}`);
    assert.equal(result.result.durability, maxDurabilityFor(to),
      `${from} at full durability must upgrade to ${to} at full durability`);
  }
});

test('a heavily worn piece upgrades to a heavily worn one, never below zero', () => {
  const result = calculateSmithingResult(template,
    { id: 'diamond_boots', durability: 1, maxDurability: maxDurabilityFor('diamond_boots') }, ingot);
  assert.equal(result.valid, true);
  const lost = maxDurabilityFor('diamond_boots') - 1;
  assert.equal(result.result.durability, maxDurabilityFor('netherite_boots') - lost);
  // A piece that could not be worse still has at least one point rather than a negative one.
  const broken = calculateSmithingResult(template,
    { id: 'diamond_boots', durability: 0, maxDurability: 1 }, ingot);
  assert.ok(broken.result.durability >= 0, 'durability must not go negative');
});

test('a piece with no recorded maximum carries its remaining figure rather than guessing', () => {
  // Several inventory paths store a `durability` without a `maxDurability`. There is no loss to measure
  // against, so the remaining figure is carried through unchanged rather than invented.
  const result = calculateSmithingResult(template, { id: 'diamond_sword', durability: 900 }, ingot);
  assert.equal(result.valid, true);
  assert.equal(result.result.durability, 900);
});

// --- the upgrade's other retained fields -------------------------------------------

test('the upgrade keeps the enchantments, the name and the prior work penalty', () => {
  // "retains the enchantments, trims, name, prior work penalty, and number of durability points lost".
  // The name and the penalty were both dropped, which silently renamed an item and reset an anvil cost.
  const base = {
    id: 'diamond_pickaxe',
    enchantments: [{ id: 'efficiency', level: 4 }, { id: 'unbreaking', level: 3 }],
    customName: 'Digger',
    repairCost: 3,
    durability: 120,
    maxDurability: 1561,
  };
  const result = calculateSmithingResult(template, base, ingot);
  assert.equal(result.valid, true);
  assert.deepEqual(result.result.enchantments, base.enchantments, 'enchantments carry over');
  assert.equal(result.result.customName, 'Digger', 'so does the name');
  assert.equal(result.result.repairCost, 3, 'and the prior work penalty');
  // The copy must not share the array with the base, or upgrading would alias two inventories together.
  assert.notEqual(result.result.enchantments, base.enchantments);
  result.result.enchantments[0].level = 1;
  assert.equal(base.enchantments[0].level, 4, 'the base is untouched');
});

test('an upgrade does not remove incompatible enchantments', () => {
  // "Upgrading gear does not remove incompatible enchantments, such as multiple different Protection
  // enchantments." A normal item cannot hold both, but a save or a command can make one, and the upgrade
  // must pass it through rather than tidying it.
  const base = {
    id: 'diamond_chestplate',
    enchantments: [{ id: 'protection', level: 2 }, { id: 'blast_protection', level: 2 }],
    durability: 500,
    maxDurability: maxDurabilityFor('diamond_chestplate'),
  };
  const result = calculateSmithingResult(template, base, ingot);
  assert.equal(result.valid, true);
  assert.equal(result.result.enchantments.length, 2, 'both protections survive');
});

test('an upgrade carries a trim across', () => {
  // The same sentence names trims. Dropping one would lose a template the player spent.
  const trimmed = { id: 'diamond_chestplate', trim: { pattern: 'sentry', material: 'gold_ingot' } };
  const result = calculateSmithingResult(template, trimmed, ingot);
  assert.equal(result.valid, true);
  assert.deepEqual(result.result.trim, { pattern: 'sentry', material: 'gold_ingot' });
  assert.notEqual(result.result.trim, trimmed.trim, 'and is a copy, not the same object');
});

test('armour upgraded to netherite gets netherite armour durability', () => {
  const result = calculateSmithingResult(template, { id: 'diamond_helmet' }, ingot);
  assert.equal(result.valid, true);
  assert.equal(result.result.maxDurability, maxDurabilityFor('netherite_helmet'));
  assert.notEqual(result.result.maxDurability, maxDurabilityFor('netherite_pickaxe'));
});

// --- trimming --------------------------------------------------------------------

test('the 18 patterns and 11 materials are exactly the wiki\'s', () => {
  assert.equal(Object.keys(TRIM_PATTERNS).length, 18, 'the wiki: "There are 19 types of smithing templates, of which 18 are armor trim templates"');
  assert.equal(Object.keys(TRIM_MATERIALS).length, 11);
  // Every pattern is named after its template's own id, and every template exists as an item.
  for (const [templateId, pattern] of Object.entries(TRIM_PATTERNS)) {
    assert.ok(ITEMS[templateId], `${templateId} must exist as an item`);
    assert.equal(templateId, `${pattern}_armor_trim_smithing_template`, `${templateId} != ${pattern}`);
  }
  // The wiki's list, by name. `quartz` and `redstone` are this game's ids for Nether Quartz and Redstone
  // Dust, so the display names are asserted rather than the ids.
  const wikiMaterials = ['Amethyst', 'Copper', 'Diamond', 'Emerald', 'Gold', 'Iron', 'Lapis',
    'Nether Quartz', 'Netherite', 'Redstone', 'Resin'];
  assert.deepEqual(Object.values(TRIM_MATERIALS).map((m) => m.name).sort(), [...wikiMaterials].sort());
  for (const [id, material] of Object.entries(TRIM_MATERIALS)) {
    assert.ok(ITEMS[id], `trim material ${id} must exist as an item`);
    assert.match(material.color, /^#[0-9A-F]{6}$/i, `${id} needs a colour`);
  }
  assert.equal(TRIM_TEMPLATES.length, 18);
});

test('the trim colours are the wiki\'s tooltip colours', () => {
  // The wiki's "List of tooltip text colors for all materials". Asserted one at a time, because a
  // transposed digit is the failure mode and a sorted-list comparison would not name it.
  const expected = {
    amethyst_shard: '#9A5CC6', copper_ingot: '#B4684D', diamond: '#6EECD2', emerald: '#11A036',
    gold_ingot: '#DEB12D', iron_ingot: '#ECECEC', lapis_lazuli: '#416E97', quartz: '#E3D4C4',
    netherite_ingot: '#625859', redstone: '#971607', resin_brick: '#FC7812',
  };
  for (const [id, color] of Object.entries(expected)) {
    assert.equal(TRIM_MATERIALS[id]?.color, color, `${id} colour`);
  }
});

test('a trim takes any pattern, any armour piece and any material', () => {
  // "Any Armor Trim + Any Armor Piece + Any Ingot/Crystal". Driven over the whole cross product rather
  // than a sample, since a table this size is where a typo hides.
  const armour = Object.keys(ITEMS).filter((id) => ITEMS[id]?.armorSlot);
  assert.ok(armour.length >= 20, `expected the armour set, got ${armour.length}`);
  let trimmed = 0;
  for (const templateId of TRIM_TEMPLATES) {
    for (const armourId of armour) {
      for (const materialId of Object.keys(TRIM_MATERIALS)) {
        const result = calculateSmithingResult({ id: templateId }, { id: armourId }, { id: materialId });
        assert.equal(result.valid, true, `${templateId} + ${armourId} + ${materialId}: ${result.reason}`);
        assert.equal(result.operation, 'trim');
        assert.equal(result.result.id, armourId, 'a trim returns the same item');
        assert.equal(result.result.trim.pattern, TRIM_PATTERNS[templateId]);
        assert.equal(result.result.trim.material, materialId);
        assert.equal(result.result.trim.color, TRIM_MATERIALS[materialId].color);
        trimmed++;
      }
    }
  }
  assert.equal(trimmed, 18 * armour.length * 11);
});

test('a trim consumes the template, unlike an upgrade', () => {
  // "The template is consumed in the process." The UI kept it unconditionally, which was right for the
  // one operation that existed and would have let one template trim unlimited armour.
  const result = calculateSmithingResult(
    { id: 'sentry_armor_trim_smithing_template' }, { id: 'diamond_chestplate' }, { id: 'gold_ingot' });
  assert.equal(result.valid, true);
  assert.equal(result.templateSurvives, false);

  // And the UI honours the flag rather than deciding for itself.
  const ui = readFileSync('src/ui.js', 'utf8');
  assert.match(ui, /if \(calculation\.templateSurvives === false\) this\.smithingTemplateItem = null/,
    'takeSmithingOutput must consume the template when the operation says so');
});

test('a trim is purely decorative apart from the trim it records', () => {
  // "All trims are purely decorative, and don't impact gameplay in any way" -- with the piglin exception
  // that `hasGoldTrim` exists for. Nothing about the piece's numbers may change.
  const base = {
    id: 'diamond_chestplate',
    durability: 400,
    enchantments: [{ id: 'protection', level: 4 }],
    customName: 'Plate',
    repairCost: 2,
  };
  const result = calculateSmithingResult(
    { id: 'eye_armor_trim_smithing_template' }, base, { id: 'emerald' });
  assert.equal(result.valid, true);
  assert.equal(result.result.durability, 400, 'durability untouched');
  assert.deepEqual(result.result.enchantments, base.enchantments, 'enchantments untouched');
  assert.equal(result.result.customName, 'Plate', 'name untouched');
  assert.equal(result.result.repairCost, 2, 'prior work penalty untouched');
  assert.equal(result.result.count, 1);
  // A trim is not armour of its own: the item's own definition still decides its armour value.
  const def = ITEMS[result.result.id];
  assert.equal(def.armorSlot, 'chest');
  assert.equal(def.armor, 8);
});

test('trimming again overwrites the old trim rather than adding a second', () => {
  // "Armor with a trim can be trimmed again by applying another template to it; the old trim pattern is
  // overwritten in the process. Therefore, one piece of armor cannot possess multiple trims at the same
  // time."
  const once = calculateSmithingResult(
    { id: 'sentry_armor_trim_smithing_template' }, { id: 'iron_helmet' }, { id: 'gold_ingot' });
  assert.equal(once.valid, true);
  const twice = calculateSmithingResult(
    { id: 'vex_armor_trim_smithing_template' }, once.result, { id: 'diamond' });
  assert.equal(twice.valid, true);
  assert.equal(twice.result.trim.pattern, 'vex', 'the newer pattern wins');
  assert.equal(twice.result.trim.material, 'diamond');
  // One trim, not two.
  assert.equal(Array.isArray(twice.result.trim), false);
  assert.deepEqual(Object.keys(twice.result.trim).sort(), ['color', 'material', 'name', 'pattern']);
});

test('only armour takes a trim', () => {
  for (const id of Object.keys(ITEMS).filter((k) => ITEMS[k]?.armorSlot)) {
    assert.equal(isTrimmableArmour(id), true, `${id} has an armour slot`);
  }
  for (const id of ['diamond_sword', 'diamond_pickaxe', 'bow', 'apple', 'dirt', 'paper', 'elytra', 'shield']) {
    assert.equal(isTrimmableArmour(id), false, `${id} is not armour`);
    const result = calculateSmithingResult(
      { id: 'sentry_armor_trim_smithing_template' }, { id }, { id: 'gold_ingot' });
    assert.equal(result.valid, false, `${id} must not be trimmable`);
    assert.match(result.reason, /not a piece of armour/i);
  }
  // The turtle shell is armour in vanilla and here, and works without being named anywhere.
  assert.equal(isTrimmableArmour('turtle_helmet'), true);
  assert.equal(calculateSmithingResult(
    { id: 'tide_armor_trim_smithing_template' }, { id: 'turtle_helmet' }, { id: 'prismarine_crystals' }).valid,
  // Prismarine crystals are not a trim material, so this is the one refusal that is about the material.
  false);
});

test('a material that is not an ingot or a crystal is refused, naming it', () => {
  for (const id of ['dirt', 'stick', 'paper', 'gold_nugget', 'diamond_block', 'netherite_scrap']) {
    const result = calculateSmithingResult(
      { id: 'sentry_armor_trim_smithing_template' }, { id: 'diamond_chestplate' }, { id });
    assert.equal(result.valid, false, `${id} must not be a trim material`);
    assert.match(result.reason, /not a trim material/i, `${id} reason`);
  }
});

// --- the accessors -----------------------------------------------------------------

test('trimOf and hasGoldTrim read the one trim shape', () => {
  const trimmed = calculateSmithingResult(
    { id: 'sentry_armor_trim_smithing_template' }, { id: 'diamond_chestplate' }, { id: 'gold_ingot' }).result;
  assert.deepEqual(trimOf(trimmed), trimmed.trim);
  assert.equal(hasGoldTrim(trimmed), true, 'gold trim is the one with a gameplay effect');
  // "unless the base armor is also golden" -- that half is the piglin's rule, so the accessor stays a
  // plain question about the trim.
  assert.equal(hasGoldTrim({ id: 'golden_chestplate', trim: { pattern: 'sentry', material: 'gold_ingot' } }), true);
  assert.equal(hasGoldTrim(calculateSmithingResult(
    { id: 'sentry_armor_trim_smithing_template' }, { id: 'diamond_chestplate' }, { id: 'iron_ingot' }).result),
  false, 'iron trim is not gold');
  // Nonsense in, null out.
  for (const bad of [null, undefined, {}, { trim: null }, { trim: 'gold' }, { trim: {} },
    { trim: { pattern: 'sentry' } }, { trim: { material: 'gold_ingot' } }, 'string', 42]) {
    assert.equal(trimOf(bad), null, `${JSON.stringify(bad)} has no trim`);
    assert.equal(hasGoldTrim(bad), false);
  }
});

// --- the refusals, each with a reason ------------------------------------------

test('an empty slot refuses, and says which slots it needs', () => {
  for (const args of [[null, null, null], [template, null, ingot], [template, { id: 'diamond_sword' }, null],
    [null, { id: 'diamond_sword' }, ingot]]) {
    const result = calculateSmithingResult(...args);
    assert.equal(result.valid, false);
    assert.equal(result.result, null);
    assert.match(result.reason, /template/i);
  }
});

test('the wrong gear and the wrong material each say what is wrong', () => {
  const iron = calculateSmithingResult(template, { id: 'iron_sword' }, ingot);
  assert.equal(iron.valid, false);
  assert.match(iron.reason, /iron sword/i, 'the refusal should name the item');

  const wrongMaterial = calculateSmithingResult(template, { id: 'diamond_sword' }, { id: 'iron_ingot' });
  assert.equal(wrongMaterial.valid, false);
  assert.match(wrongMaterial.reason, /netherite ingot/i);

  // A trim template is not a template for an upgrade, so mixing them is refused rather than silently
  // doing one of the two.
  const mixed = calculateSmithingResult(
    { id: 'sentry_armor_trim_smithing_template' }, { id: 'diamond_sword' }, ingot);
  assert.equal(mixed.valid, false);
  assert.match(mixed.reason, /not a piece of armour/i, 'a trim on a sword is a trim refusal, not a crash');

  const notATemplate = calculateSmithingResult({ id: 'paper' }, { id: 'diamond_sword' }, ingot);
  assert.equal(notATemplate.valid, false);
  assert.match(notATemplate.reason, /not a smithing template/i);
});

test('every result is a plain serialisable object, not a reference into the slot', () => {
  // The result goes into the cursor and then into an inventory, and a save writes it out. Sharing a nested
  // object with the consumed slot would alias two inventories together.
  const base = { id: 'diamond_chestplate', enchantments: [{ id: 'protection', level: 1 }],
    trim: { pattern: 'sentry', material: 'gold_ingot' } };
  for (const result of [
    calculateSmithingResult(template, base, ingot).result,
    calculateSmithingResult({ id: 'wild_armor_trim_smithing_template' }, base, { id: 'iron_ingot' }).result,
  ]) {
    assert.notEqual(result.enchantments, base.enchantments);
    assert.notEqual(result.trim, base.trim);
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(result)), 'the result must survive a save round-trip');
  }
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

  // The registry takes the hand-written furnace table as a *provider* rather than importing it, because
  // `furnace.js` pulls in Three and the registry has to stay isomorphic.
  const reg = registry({ fresh: true, smelting: SMELTING_RECIPES });
  const scrap = reg.entries.get('netherite_scrap');
  assert.ok(scrap.smeltingFrom.length >= 1, 'scrap needs the smelting source this test just asserted');
  const ingotEntry = reg.entries.get('netherite_ingot');
  const recipes = ingotEntry.recipesAsResult.filter((r) => Array.isArray(r.ingredients));
  assert.ok(recipes.length, 'the ingot must have an ingredients recipe');
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

test('every trim template and material is obtainable, so trimming is reachable in survival', () => {
  // A trim needs a template and a material. Every one is an item, and the templates are craftable in
  // copies (7 diamonds + the material) -- which is what the `extraRecipes.js` table already provides.
  const reg = registry({ fresh: true, smelting: SMELTING_RECIPES });
  const missing = [];
  for (const id of [...TRIM_TEMPLATES, ...Object.keys(TRIM_MATERIALS)]) {
    const entry = resolveResource(id, reg);
    if (!entry) { missing.push(id); continue; }
    const sources = entry.recipesAsResult.length + entry.smeltingFrom.length + entry.lootFrom.length
      + entry.droppedBy.length + entry.smithingFrom.length;
    if (sources === 0) missing.push(`${id} (no source)`);
  }
  assert.deepEqual(missing, [], 'these trim ingredients cannot be obtained');
});

// --- the one gameplay consequence of a trim --------------------------------------

test('a gold trim pacifies piglins, as the wiki\'s rule says', async () => {
  // From the Piglin article: "Piglins do not pick up any gold-trimmed armor pieces and remain hostile
  // toward players wearing gold-trimmed armor, unless the base armor is also golden." Vanilla's
  // `#piglin_safe_armor` tag is golden armour PLUS, per material, armour carrying that material's trim --
  // and this game only checked the first half, so a Gold-trimmed netherite plate did nothing.
  const { HostileMobBehaviors } = await import('../src/hostileMobBehaviors.js');
  const behaviors = Object.create(HostileMobBehaviors.prototype);
  const wears = (armor) => behaviors.isPlayerWearingGold({ inventory: { armor } });
  const gold = { pattern: 'sentry', material: 'gold_ingot' };
  const iron = { pattern: 'sentry', material: 'iron_ingot' };

  // The half that already worked.
  for (const slot of ['head', 'chest', 'legs', 'feet']) {
    assert.equal(wears({ [slot]: { id: `golden_${slot === 'head' ? 'helmet' : slot === 'chest' ? 'chestplate' : slot === 'legs' ? 'leggings' : 'boots'}` } }),
      true, `bare golden ${slot} pacifies`);
  }
  // The half this adds.
  assert.equal(wears({ chest: { id: 'netherite_chestplate', trim: gold } }), true, 'a gold trim pacifies');
  assert.equal(wears({ feet: { id: 'diamond_boots', trim: gold } }), true, 'in any slot');
  // Any other material does not.
  for (const material of Object.keys(TRIM_MATERIALS).filter((m) => m !== 'gold_ingot')) {
    assert.equal(wears({ chest: { id: 'netherite_chestplate', trim: { pattern: 'sentry', material } } }),
      false, `${material} trim must not pacify`);
  }
  assert.equal(wears({ chest: { id: 'diamond_chestplate' } }), false, 'plain diamond does not');
  assert.equal(wears({ chest: { id: 'diamond_chestplate', trim: iron } }), false);
  assert.equal(wears({}), false, 'no armour does not');
  assert.equal(behaviors.isPlayerWearingGold(null), false, 'a missing player does not throw');
  assert.equal(behaviors.isPlayerWearingGold({}), false);
  assert.equal(behaviors.isPlayerWearingGold({ inventory: {} }), false);
});

test('hasGoldTrim asks about the trim, not about the base armour', () => {
  // "unless the base armor is also golden" is the piglin's rule and is deliberately not folded into the
  // accessor: a golden chestplate with an iron trim is still golden armour, and the two facts are asked
  // separately so neither can hide the other.
  assert.equal(hasGoldTrim({ id: 'golden_chestplate', trim: { pattern: 'vex', material: 'gold_ingot' } }), true);
  assert.equal(hasGoldTrim({ id: 'golden_chestplate', trim: { pattern: 'vex', material: 'iron_ingot' } }), false);
  assert.equal(hasGoldTrim({ id: 'golden_chestplate' }), false, 'a bare golden piece has no trim');
});
