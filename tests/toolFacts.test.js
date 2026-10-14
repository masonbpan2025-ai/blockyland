// Two Inspector checks that were asking the wrong question, and the vanilla facts that answer it.
//
// This game's `type` field is a loose classification for "what kind of thing do you hold": a bucket, a clock,
// a compass, a name tag and a saddle are all typed `tool`, reasonably enough. Two checks read that as "is a
// tool" and then demanded a *mining* description and an *enchantment* category, which made thirty-nine items
// look like gaps -- buckets, clocks, name tags, and, on the other side, a trident, a shield, shears, a
// fishing rod and a brush, which vanilla really does let you enchant and this game really did refuse.
//
// So the answer is two named lists and a real fix:
//
//   * `NON_MINING_TOOLS` -- tools that do not mine, so `tool-facts` stops asking;
//   * `NOT_ENCHANTABLE`  -- items vanilla refuses to enchant, so `enchantable` stops asking;
//   * and everything else typed as a tool or weapon now has to answer *both*, which is what makes the
//     trident, the shield, shears, the fishing rod, the brush and both "on a stick" items enchantable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../src/blocks.js';
import { EXTRA_ITEMS } from '../src/extraItems.js';
import { describeTool, NON_MINING_TOOLS } from '../src/miningRules.js';
import { ENCHANTMENT_REGISTRY, getItemEnchantCategory, isEnchantableItem, isPrimaryFor, anvilAccepts, generateEnchantmentOffers, NOT_ENCHANTABLE } from '../src/enchanting.js';
import { registry } from '../src/resourceRegistry.js';
import { RESOURCE_CHECKS, CHECK_SKIP } from '../src/resourceShowcase.js';

const ALL_ITEMS = { ...ITEMS, ...EXTRA_ITEMS };
const typed = (types) => Object.entries(ALL_ITEMS).filter(([, def]) => types.includes(def?.type)).map(([id]) => id);

// --- the two lists have to be complete ------------------------------------------

test('every item this game types as a tool or weapon either mines or is named as not mining', () => {
  // The guard that keeps `NON_MINING_TOOLS` honest. A new tool added to the item table without a mining
  // class has to be classified here, rather than reading as an Inspector gap forever.
  const unclassified = [];
  for (const id of typed(['tool', 'weapon'])) {
    if (describeTool(id)) continue;
    if (NON_MINING_TOOLS.has(id)) continue;
    unclassified.push(id);
  }
  assert.deepEqual(unclassified, [], 'these are typed as tools, do not mine, and are not named as such');

  // And the list itself cannot rot: every name in it is a real item, and none of them secretly mines.
  for (const id of NON_MINING_TOOLS) {
    assert.ok(ALL_ITEMS[id], `${id} is listed as a non-mining tool but is not an item`);
    assert.equal(describeTool(id), null, `${id} is listed as non-mining but describeTool describes it`);
  }
});

test('every enchantable-looking item either has a category or is named as not enchantable', () => {
  const unclassified = [];
  for (const id of typed(['tool', 'weapon', 'armor', 'shield'])) {
    if (getItemEnchantCategory(id)) continue;
    if (NOT_ENCHANTABLE.has(id)) continue;
    unclassified.push(id);
  }
  assert.deepEqual(unclassified, [], 'these look enchantable and have no category, nor an exemption');

  // The exemption list is for items vanilla genuinely refuses, so none of them may have a category.
  for (const id of NOT_ENCHANTABLE) {
    assert.ok(ALL_ITEMS[id], `${id} is listed as not enchantable but is not an item`);
    assert.equal(getItemEnchantCategory(id), null, `${id} is listed as not enchantable but has a category`);
    assert.equal(isEnchantableItem({ id }), false);
  }
});

// --- the behaviour the fix changed ----------------------------------------------

test('the items vanilla enchants are enchantable now, with the pool this game has for them', () => {
  // Each gets its own category rather than being folded into `tool` or `weapon`, because the category picks
  // the enchantments offered. The pool is asserted through `targets` rather than through the offers
  // themselves: `generateEnchantmentOffers` picks three at random from the eligible set, so asserting that a
  // particular draw contains Sharpness is a coin toss -- which is exactly how this test failed intermittently
  // before it was written this way.
  const categoryOf = (id) => getItemEnchantCategory(id);
  // `isPrimaryFor` is the one place the registry's item tokens (`sword`, `pickaxe`, `helmet`) and this
  // game's coarser categories (`weapon`, `tool`) are related, so asking it is what keeps this test from
  // restating that mapping a second time.
  const offeredTo = (enchantment, item) => isPrimaryFor(ENCHANTMENT_REGISTRY[enchantment], item);

  for (const [id, category] of [['trident', 'trident'], ['fishing_rod', 'fishing_rod']]) {
    assert.equal(categoryOf(id), category, id);
    assert.equal(isEnchantableItem({ id }), true, `${id} should be enchantable`);
    assert.ok(generateEnchantmentOffers({ id }, 15).length > 0, `${id} should be offered something`);
    assert.ok(offeredTo('unbreaking', id), `${id} should take Unbreaking`);
  }
  // These are anvil-only: every enchantment page lists them as secondary items, and Enchanting table mechanics
  // gives them no row, so the table takes none of them; an anvil still puts Unbreaking (and Mending) on them.
  for (const [id, category] of [['shield', 'shield'], ['shears', 'shears'], ['brush', 'brush'],
    ['carrot_on_a_stick', 'carrot_on_a_stick'], ['warped_fungus_on_a_stick', 'warped_fungus_on_a_stick']]) {
    assert.equal(categoryOf(id), category, id);
    assert.equal(isEnchantableItem({ id }), false, `${id} is not enchanted at a table`);
    assert.deepEqual(generateEnchantmentOffers({ id }, 15), [], `${id} is offered nothing`);
    assert.ok(anvilAccepts(ENCHANTMENT_REGISTRY.unbreaking, id), `${id} takes Unbreaking at an anvil`);
  }

  // A sword is a weapon and can be offered Sharpness; a trident has its own category and cannot.
  assert.ok(offeredTo('sharpness', 'diamond_sword'), 'a sword takes Sharpness');
  assert.equal(offeredTo('sharpness', 'trident'), false, 'a trident takes no Sharpness in vanilla');
  // The trident's own pool is modelled now: Loyalty, Impaling, Riptide and Channeling are all in the
  // registry and all name the trident, which is the only item that takes them.
  for (const enchantment of ['loyalty', 'impaling', 'riptide', 'channeling']) {
    assert.equal(ENCHANTMENT_REGISTRY[enchantment]?.targets.join(','), 'trident', `${enchantment} is the trident's`);
    assert.ok(offeredTo(enchantment, 'trident'), `a trident takes ${enchantment}`);
    assert.equal(offeredTo(enchantment, 'diamond_sword'), false, `a sword does not take ${enchantment}`);
    assert.equal(offeredTo(enchantment, 'diamond_axe'), false, `an axe does not take ${enchantment}`);
  }
  // Shears mine leaves, wool and cobwebs, and vanilla gives them Efficiency -- at an anvil (a secondary item).
  assert.ok(anvilAccepts(ENCHANTMENT_REGISTRY.efficiency, 'shears'), 'shears take Efficiency');
  assert.equal(offeredTo('efficiency', 'brush'), false, 'a brush does not');
  // The fishing rod's two are its own, and the crossbow's three are its own.
  for (const enchantment of ['luck_of_the_sea', 'lure']) {
    assert.ok(offeredTo(enchantment, 'fishing_rod'), `a fishing rod takes ${enchantment}`);
    assert.equal(offeredTo(enchantment, 'bow'), false, `a bow does not take ${enchantment}`);
  }
  for (const enchantment of ['quick_charge', 'multishot', 'piercing']) {
    assert.ok(offeredTo(enchantment, 'crossbow'), `a crossbow takes ${enchantment}`);
    assert.equal(offeredTo(enchantment, 'bow'), false, `a bow does not take ${enchantment}`);
  }
});

test('the items vanilla refuses are still refused', () => {
  for (const id of ['bucket', 'water_bucket', 'lava_bucket', 'compass', 'clock', 'lead', 'name_tag', 'saddle',
    'flint_and_steel', 'leather_horse_armor', 'diamond_horse_armor']) {
    assert.equal(isEnchantableItem({ id }), false, `${id} should not be enchantable`);
    assert.deepEqual(generateEnchantmentOffers({ id }, 15), [], `${id} should be offered nothing`);
  }
});

// --- the checks ask their own question ------------------------------------------

test('tool-facts skips a tool that does not mine, and still fails one that should', () => {
  const check = RESOURCE_CHECKS.find((c) => c.id === 'tool-facts');
  const reg = registry();
  const run = (id) => check.run({ entry: reg.entries.get(id), registry: reg });

  // Named as non-mining, so not this check's business.
  for (const id of ['bucket', 'clock', 'compass', 'name_tag', 'bow']) {
    assert.equal(run(id), CHECK_SKIP, `${id} should be skipped`);
  }
  // A real mining tool passes; shears mine without a tier and are allowed to.
  for (const id of ['diamond_pickaxe', 'iron_axe', 'stone_shovel', 'shears']) {
    assert.equal(run(id), true, `${id} should pass`);
  }
  // And the check still fails a tool that claims to mine and cannot be described.
  const fake = { ...reg.entries.get('diamond_pickaxe'), id: 'unobtainium_pickaxe_tool', def: { type: 'tool' } };
  const outcome = check.run({ entry: fake, registry: reg });
  assert.equal(outcome.ok, false, 'a tool with no class must still fail');
});

test('enchantable skips an item vanilla refuses, and still fails one that should have a category', () => {
  const check = RESOURCE_CHECKS.find((c) => c.id === 'enchantable');
  const reg = registry();
  const run = (id) => check.run({ entry: reg.entries.get(id), registry: reg });

  for (const id of ['bucket', 'compass', 'saddle', 'diamond_horse_armor']) {
    assert.equal(run(id), CHECK_SKIP, `${id} should be skipped`);
  }
  for (const id of ['trident', 'shield', 'shears', 'diamond_sword', 'diamond_helmet']) {
    assert.equal(run(id), true, `${id} should pass`);
  }
  // An enchantable item with no category is still a gap.
  const fake = { ...reg.entries.get('trident'), id: 'mystery_blade_thing', def: { type: 'weapon' } };
  const outcome = check.run({ entry: fake, registry: reg });
  assert.equal(outcome.ok, false, 'an enchantable item with no category must still fail');
});
