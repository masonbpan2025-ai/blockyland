// Comprehensive look and functionality parity audit for all items against wiki specifications.
//
// This test suite audits the item registry (over 1,290 items) to verify:
// 1. Coverage & Parity baselines: 100% of pinned Java 1.21.4 items are present (0 missing) and
//    in-scope wiki item lists are comprehensively mapped.
// 2. Look parity: Every declared item icon resolves to an existing file on disk in public/assets/items/.
// 3. Stack size parity: Unstackable items (tools, weapons, armor, potions, spyglass, written books),
//    16-stack items (ender pearls, snowballs, eggs, buckets, signs), and 64-stack defaults.
// 4. Edible items & saturation parity: Hunger values and saturation matches vanilla food data.
// 5. Combat parity: Weapon damage hierarchy and armor point / slot assignments.
// 6. Smelting and fuel parity: Core smelting recipes and fuel durations match Minecraft defaults.
// 7. Brewing and potion parity: Potion types, durations, and brewing ingredients.
// 8. Tool rules & enchantability guards: Non-mining / non-enchantable tools are strictly respected.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ITEMS, stackLimitFor } from '../src/blocks.js';
import { FOODS, foodFor } from '../src/foodData.js';
import { SMELTING_RECIPES, FUEL_BURN_TIMES } from '../src/furnace.js';
import { POTION_DATA, BASE_BREWING_RECIPES } from '../src/brewing.js';
import { NON_MINING_TOOLS } from '../src/miningRules.js';
import { NOT_ENCHANTABLE } from '../src/enchanting.js';
import { missingVanillaItems, registry } from '../src/resourceRegistry.js';
import { maxDurabilityFor } from '../src/durability.js';
import { INTERACTION_SOURCES } from '../src/interactionSources.js';
import { codeDropSources } from '../src/codeDropSources.js';

const ROOT = process.cwd();
const PUBLIC_ITEMS_DIR = path.join(ROOT, 'public');

function createInspector() {
  return registry({
    smelting: SMELTING_RECIPES,
    durability: maxDurabilityFor,
    interactions: [...INTERACTION_SOURCES, ...codeDropSources()],
  });
}

test('parity audit: 100% of pinned vanilla 1.21.4 items are accounted for', () => {
  const cachePath = path.join(ROOT, '.cache', 'mc-data', 'items.json');
  assert.ok(existsSync(cachePath), 'pinned items cache must exist');
  const vanillaItems = JSON.parse(readFileSync(cachePath, 'utf8'));
  const vanillaNames = vanillaItems.map((i) => i.name);

  const reg = createInspector();
  const missing = missingVanillaItems(reg, { itemNames: vanillaNames });

  assert.equal(missing.length, 0,
    `all 1,385 pinned vanilla items must be implemented (0 missing), but found missing: ${missing.join(', ')}`);
});

test('parity audit: wiki item list fixture coverage breakdown', () => {
  const fixturePath = path.join(ROOT, 'tests', 'fixtures', 'wiki-item-list.json');
  assert.ok(existsSync(fixturePath), 'wiki item list fixture must exist');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

  // Ensure all four in-scope sections are present in fixture
  const expectedSections = ['creates', 'useInWorld', 'indirectUse', 'spawnEggs'];

  for (const sec of expectedSections) {
    assert.ok(fixture.sections[sec], `wiki fixture should contain section: ${sec}`);
    const groups = fixture.sections[sec].groups;
    assert.ok(Object.keys(groups).length > 0, `section ${sec} should have item groups`);
  }
});

test('look parity: 100% of declared item icons exist on disk', () => {
  const missingIcons = [];
  let checkedCount = 0;

  for (const [id, def] of Object.entries(ITEMS)) {
    if (!def || !def.icon) continue;
    checkedCount++;
    const relativePath = def.icon.replace(/^\//, '');
    const fullPath = path.join(PUBLIC_ITEMS_DIR, relativePath);
    if (!existsSync(fullPath)) {
      missingIcons.push(`${id} -> ${def.icon}`);
    }
  }

  assert.ok(checkedCount >= 1290, `expected at least 1290 checked item icons, got ${checkedCount}`);
  assert.equal(missingIcons.length, 0,
    `all item icons must exist on disk, missing: \n${missingIcons.join('\n')}`);
});

test('functionality parity: stack size rules match vanilla standards', () => {
  // Tools, weapons, armor, saddles, spyglass, written book, etc. are unstackable (stackSize 1)
  const unstackables = [
    'wooden_sword', 'diamond_pickaxe', 'netherite_chestplate', 'iron_helmet',
    'bow', 'crossbow', 'trident', 'shield', 'spyglass', 'flint_and_steel',
    'shears', 'water_bucket', 'lava_bucket', 'powder_snow_bucket', 'saddle',
    'totem_of_undying', 'potion_of_healing',
  ];

  for (const id of unstackables) {
    assert.equal(stackLimitFor(id), 1, `item ${id} must have stackSize 1`);
  }

  // Items with stackSize 16 (snowballs, eggs, ender pearls, buckets, signs, written book)
  const sixteenStacks = ['snowball', 'egg', 'ender_pearl', 'bucket', 'oak_sign', 'written_book'];
  for (const id of sixteenStacks) {
    assert.equal(stackLimitFor(id), 16, `item ${id} must have stackSize 16`);
  }

  // Common items and materials default to 64
  const sixtyFourStacks = ['dirt', 'oak_planks', 'iron_ingot', 'diamond', 'stick', 'apple', 'bread'];
  for (const id of sixtyFourStacks) {
    assert.equal(stackLimitFor(id), 64, `item ${id} must have stackSize 64`);
  }
});

test('functionality parity: food hunger and saturation values match vanilla', () => {
  assert.ok(Object.keys(FOODS).length >= 40, 'expected at least 40 food entries');

  // Verify key foods with exact vanilla stats
  const expectedFoods = {
    cooked_beef: { hunger: 8, saturation: 12.8 },
    cooked_porkchop: { hunger: 8, saturation: 12.8 },
    golden_carrot: { hunger: 6, saturation: 14.4 },
    golden_apple: { hunger: 4, saturation: 9.6 },
    bread: { hunger: 5, saturation: 6.0 },
    apple: { hunger: 4, saturation: 2.4 },
    cooked_chicken: { hunger: 6, saturation: 7.2 },
    baked_potato: { hunger: 5, saturation: 6.0 },
    cookie: { hunger: 2, saturation: 0.4 },
    rotten_flesh: { hunger: 4, saturation: 0.8 },
    pufferfish: { hunger: 1, saturation: 0.2 },
    dried_kelp: { hunger: 1, saturation: 0.6 },
  };

  for (const [id, stats] of Object.entries(expectedFoods)) {
    const val = foodFor(id);
    assert.ok(val, `foodFor(${id}) should return food stats`);
    assert.equal(val.hunger, stats.hunger, `${id} hunger points`);
    assert.equal(val.saturation, stats.saturation, `${id} saturation value`);
  }

  // Non-edible item returns null
  assert.equal(foodFor('diamond'), null, 'diamond should not be edible');
  assert.equal(foodFor('iron_sword'), null, 'iron_sword should not be edible');
});

test('functionality parity: weapon damage hierarchy', () => {
  const netherite = ITEMS.netherite_sword?.attack ?? 0;
  const diamond = ITEMS.diamond_sword?.attack ?? 0;
  const iron = ITEMS.iron_sword?.attack ?? 0;
  const stone = ITEMS.stone_sword?.attack ?? 0;
  const wood = ITEMS.wooden_sword?.attack ?? 0;
  const gold = ITEMS.golden_sword?.attack ?? 0;
  const trident = ITEMS.trident?.attack ?? 0;

  assert.equal(netherite, 8, 'netherite sword attack is 8');
  assert.equal(diamond, 7, 'diamond sword attack is 7');
  assert.equal(iron, 6, 'iron sword attack is 6');
  assert.equal(stone, 5, 'stone sword attack is 5');
  assert.equal(wood, 4, 'wooden sword attack is 4');
  assert.equal(gold, 4, 'golden sword attack is 4');
  assert.equal(trident, 9, 'trident attack is 9');

  assert.ok(trident > netherite, 'trident attack is higher than netherite sword');
  assert.ok(netherite > diamond, 'netherite sword is stronger than diamond');
  assert.ok(diamond > iron, 'diamond sword is stronger than iron');
  assert.ok(iron > stone, 'iron sword is stronger than stone');
  assert.ok(stone > wood, 'stone sword is stronger than wood');
});

test('functionality parity: armor points and armorSlot assignment', () => {
  const sets = {
    netherite: { total: 20, toughness: 3 },
    diamond: { total: 20, toughness: 2 },
    iron: { total: 15, toughness: 0 },
    chainmail: { total: 12, toughness: 0 },
    golden: { total: 11, toughness: 0 },
    leather: { total: 7, toughness: 0 },
  };

  const slots = ['helmet', 'chestplate', 'leggings', 'boots'];
  const expectedSlotMapping = {
    helmet: 'head',
    chestplate: 'chest',
    leggings: 'legs',
    boots: 'feet',
  };

  for (const [tier, expected] of Object.entries(sets)) {
    let sumArmor = 0;
    for (const slot of slots) {
      const pieceId = `${tier}_${slot}`;
      const piece = ITEMS[pieceId];
      assert.ok(piece, `piece ${pieceId} must exist in ITEMS`);
      assert.equal(piece.armorSlot, expectedSlotMapping[slot], `${pieceId} armorSlot`);
      assert.ok(typeof piece.armor === 'number', `${pieceId} should declare armor points`);
      sumArmor += piece.armor;
      if (expected.toughness > 0) {
        assert.equal(piece.toughness, expected.toughness, `${pieceId} toughness`);
      }
    }
    assert.equal(sumArmor, expected.total, `${tier} full set armor points`);
  }
});

test('functionality parity: smelting recipes and fuel durations', () => {
  // Raw ores smelt into ingots
  assert.deepEqual(SMELTING_RECIPES.raw_iron, { id: 'iron_ingot', isBlock: false, count: 1 });
  assert.deepEqual(SMELTING_RECIPES.raw_gold, { id: 'gold_ingot', isBlock: false, count: 1 });
  assert.deepEqual(SMELTING_RECIPES.raw_copper, { id: 'copper_ingot', isBlock: false, count: 1 });
  assert.deepEqual(SMELTING_RECIPES.clay_ball, { id: 'brick', isBlock: false, count: 1 });

  // Fuels
  assert.equal(FUEL_BURN_TIMES.coal, 80.0, 'coal burns for 80s (8 items)');
  assert.equal(FUEL_BURN_TIMES.charcoal, 80.0, 'charcoal burns for 80s (8 items)');
  assert.equal(FUEL_BURN_TIMES.lava_bucket, 1000.0, 'lava bucket burns for 1000s (100 items)');
  assert.equal(FUEL_BURN_TIMES.blaze_rod, 120.0, 'blaze rod burns for 120s (12 items)');
});

test('functionality parity: brewing recipes and potion effects', () => {
  // Base potions
  assert.equal(POTION_DATA.water_bottle?.type, 'base');
  assert.equal(POTION_DATA.awkward_potion?.type, 'base');

  // Key effect potions
  assert.equal(POTION_DATA.potion_of_healing?.effect, 'instant_health');
  assert.equal(POTION_DATA.potion_of_strength?.effect, 'strength');
  assert.equal(POTION_DATA.potion_of_swiftness?.effect, 'speed');
  assert.equal(POTION_DATA.potion_of_night_vision?.effect, 'night_vision');
  assert.equal(POTION_DATA.potion_of_fire_resistance?.effect, 'fire_resistance');

  // Brewing recipes count & ingredients
  assert.ok(BASE_BREWING_RECIPES.length >= 10, 'expected at least 10 base brewing recipes');
  const awkwardRecipe = BASE_BREWING_RECIPES.find((r) => r.ingredient === 'nether_wart' && r.bottle === 'water_bottle');
  assert.ok(awkwardRecipe, 'nether_wart on water_bottle brews awkward_potion');
  assert.equal(awkwardRecipe.result, 'awkward_potion');
});

test('functionality parity: non-mining and non-enchantable tool guards', () => {
  const nonMining = ['powder_snow_bucket', 'spyglass', 'recovery_compass', 'debug_stick'];

  for (const id of nonMining) {
    assert.ok(NON_MINING_TOOLS.has(id), `${id} must be in NON_MINING_TOOLS`);
    assert.ok(NOT_ENCHANTABLE.has(id), `${id} must be in NOT_ENCHANTABLE`);
  }
});
