// Tests for mining drops of raw iron, raw copper, and raw gold from ore blocks.
//
// Java Edition 1.17+:
// - Iron Ore & Deepslate Iron Ore: require Stone Pickaxe or better, drop Raw Iron (1).
// - Copper Ore & Deepslate Copper Ore: require Stone Pickaxe or better, drop Raw Copper (2-5).
// - Gold Ore & Deepslate Gold Ore: require Iron Pickaxe or better, drop Raw Gold (1).
// - Nether Gold Ore: requires any pickaxe (wooden+), drops Gold Nuggets (2-6).
// - Silk Touch on any ore drops the ore block itself.
// - Fortune multiplies raw ore drops (using the vanilla ore drop formula).
// - Inadequate tool tier (e.g. wooden pickaxe on iron/copper/gold, or stone pickaxe on gold)
//   or bare fist breaks the block but yields nothing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import {
  baseBlockDrop,
  blockDrops,
  harvestDrops,
  DROP_ITEM_OVERRIDES,
  BASE_DROP_COUNTS,
  SILK_TOUCH_COLLECTS,
} from '../src/blockDrops.js';
import { harvestsNothing, miningEffect } from '../src/miningRules.js';

test('BLOCK_DEFS declares authentic raw ore dropItem for all metal ores', () => {
  assert.equal(BLOCK_DEFS[BLOCKS.IRON_ORE]?.dropItem, 'raw_iron', 'Iron Ore must drop raw_iron');
  assert.equal(BLOCK_DEFS[BLOCKS.DEEPSLATE_IRON_ORE]?.dropItem, 'raw_iron', 'Deepslate Iron Ore must drop raw_iron');
  assert.equal(BLOCK_DEFS[BLOCKS.COPPER_ORE]?.dropItem, 'raw_copper', 'Copper Ore must drop raw_copper');
  assert.equal(BLOCK_DEFS[BLOCKS.DEEPSLATE_COPPER_ORE]?.dropItem, 'raw_copper', 'Deepslate Copper Ore must drop raw_copper');
  assert.equal(BLOCK_DEFS[BLOCKS.GOLD_ORE]?.dropItem, 'raw_gold', 'Gold Ore must drop raw_gold');
  assert.equal(BLOCK_DEFS[BLOCKS.DEEPSLATE_GOLD_ORE]?.dropItem, 'raw_gold', 'Deepslate Gold Ore must drop raw_gold');
  assert.equal(BLOCK_DEFS[BLOCKS.NETHER_GOLD_ORE]?.dropItem, 'gold_nugget', 'Nether Gold Ore must drop gold_nugget');
});

test('raw metal items exist in ITEMS registry with correct properties', () => {
  for (const itemId of ['raw_iron', 'raw_copper', 'raw_gold']) {
    const item = ITEMS[itemId];
    assert.ok(item, `${itemId} must exist in ITEMS`);
    assert.equal(item.type, 'material', `${itemId} must be a material`);
    assert.ok(item.icon?.endsWith('.png'), `${itemId} must have a valid PNG icon path`);
  }
});

test('baseBlockDrop returns raw metal drops with isBlock: false', () => {
  const ironDrop = baseBlockDrop(BLOCKS.IRON_ORE);
  assert.deepEqual(ironDrop, { id: 'raw_iron', isBlock: false, count: 1 });

  const deepslateIronDrop = baseBlockDrop(BLOCKS.DEEPSLATE_IRON_ORE);
  assert.deepEqual(deepslateIronDrop, { id: 'raw_iron', isBlock: false, count: 1 });

  const goldDrop = baseBlockDrop(BLOCKS.GOLD_ORE);
  assert.deepEqual(goldDrop, { id: 'raw_gold', isBlock: false, count: 1 });

  const deepslateGoldDrop = baseBlockDrop(BLOCKS.DEEPSLATE_GOLD_ORE);
  assert.deepEqual(deepslateGoldDrop, { id: 'raw_gold', isBlock: false, count: 1 });

  // Copper drops 2-5 raw copper
  const copperDropMin = baseBlockDrop(BLOCKS.COPPER_ORE, () => 0);
  const copperDropMax = baseBlockDrop(BLOCKS.COPPER_ORE, () => 0.999);
  assert.equal(copperDropMin.id, 'raw_copper');
  assert.equal(copperDropMin.isBlock, false);
  assert.equal(copperDropMin.count, 2);
  assert.equal(copperDropMax.count, 5);

  const deepslateCopperMin = baseBlockDrop(BLOCKS.DEEPSLATE_COPPER_ORE, () => 0);
  const deepslateCopperMax = baseBlockDrop(BLOCKS.DEEPSLATE_COPPER_ORE, () => 0.999);
  assert.equal(deepslateCopperMin.id, 'raw_copper');
  assert.equal(deepslateCopperMin.isBlock, false);
  assert.equal(deepslateCopperMin.count, 2);
  assert.equal(deepslateCopperMax.count, 5);
});

test('tool tier requirements gate ore harvesting correctly', () => {
  const hand = null;
  const wood = { def: ITEMS.wooden_pickaxe, id: 'wooden_pickaxe' };
  const stone = { def: ITEMS.stone_pickaxe, id: 'stone_pickaxe' };
  const iron = { def: ITEMS.iron_pickaxe, id: 'iron_pickaxe' };
  const diamond = { def: ITEMS.diamond_pickaxe, id: 'diamond_pickaxe' };

  // Iron Ore & Deepslate Iron Ore: require stone+ pickaxe
  for (const oreId of [BLOCKS.IRON_ORE, BLOCKS.DEEPSLATE_IRON_ORE]) {
    assert.equal(harvestsNothing(oreId, hand, null), true, 'hand cannot harvest iron ore');
    assert.equal(harvestsNothing(oreId, wood.def, wood.id), true, 'wooden pickaxe cannot harvest iron ore');
    assert.equal(harvestsNothing(oreId, stone.def, stone.id), false, 'stone pickaxe can harvest iron ore');
    assert.equal(harvestsNothing(oreId, iron.def, iron.id), false, 'iron pickaxe can harvest iron ore');
    assert.equal(harvestsNothing(oreId, diamond.def, diamond.id), false, 'diamond pickaxe can harvest iron ore');
  }

  // Copper Ore & Deepslate Copper Ore: require stone+ pickaxe
  for (const oreId of [BLOCKS.COPPER_ORE, BLOCKS.DEEPSLATE_COPPER_ORE]) {
    assert.equal(harvestsNothing(oreId, hand, null), true, 'hand cannot harvest copper ore');
    assert.equal(harvestsNothing(oreId, wood.def, wood.id), true, 'wooden pickaxe cannot harvest copper ore');
    assert.equal(harvestsNothing(oreId, stone.def, stone.id), false, 'stone pickaxe can harvest copper ore');
    assert.equal(harvestsNothing(oreId, iron.def, iron.id), false, 'iron pickaxe can harvest copper ore');
    assert.equal(harvestsNothing(oreId, diamond.def, diamond.id), false, 'diamond pickaxe can harvest copper ore');
  }

  // Gold Ore & Deepslate Gold Ore: require iron+ pickaxe
  for (const oreId of [BLOCKS.GOLD_ORE, BLOCKS.DEEPSLATE_GOLD_ORE]) {
    assert.equal(harvestsNothing(oreId, hand, null), true, 'hand cannot harvest gold ore');
    assert.equal(harvestsNothing(oreId, wood.def, wood.id), true, 'wooden pickaxe cannot harvest gold ore');
    assert.equal(harvestsNothing(oreId, stone.def, stone.id), true, 'stone pickaxe cannot harvest gold ore');
    assert.equal(harvestsNothing(oreId, iron.def, iron.id), false, 'iron pickaxe can harvest gold ore');
    assert.equal(harvestsNothing(oreId, diamond.def, diamond.id), false, 'diamond pickaxe can harvest gold ore');
  }
});

test('Silk Touch drops the ore block itself rather than raw metal', () => {
  const ores = [
    { id: BLOCKS.IRON_ORE, name: 'Iron Ore' },
    { id: BLOCKS.DEEPSLATE_IRON_ORE, name: 'Deepslate Iron Ore' },
    { id: BLOCKS.COPPER_ORE, name: 'Copper Ore' },
    { id: BLOCKS.DEEPSLATE_COPPER_ORE, name: 'Deepslate Copper Ore' },
    { id: BLOCKS.GOLD_ORE, name: 'Gold Ore' },
    { id: BLOCKS.DEEPSLATE_GOLD_ORE, name: 'Deepslate Gold Ore' },
  ];

  for (const { id, name } of ores) {
    const drops = harvestDrops(id, { toolId: 'iron_pickaxe', silkTouch: true });
    assert.equal(drops.length, 1, `${name} must drop 1 item with Silk Touch`);
    assert.equal(drops[0].id, id, `${name} must drop itself with Silk Touch`);
    assert.equal(drops[0].isBlock, true, `${name} Silk Touch drop must be a block`);
    assert.equal(drops[0].count, 1, `${name} Silk Touch drop count must be 1`);
  }
});

test('Fortune pickaxe multiplies raw metal drops', () => {
  // Test Fortune III with forced roll to trigger multiplier
  // fortuneOreMultiplier with level 3 and random returning 0.99 gives 2 + floor(0.99 * 3) = 4
  const rollForMultiplier = () => 0.999;

  const ironDropsFortune = harvestDrops(BLOCKS.IRON_ORE, { toolId: 'diamond_pickaxe', fortune: 3 }, rollForMultiplier);
  assert.equal(ironDropsFortune[0].id, 'raw_iron');
  assert.equal(ironDropsFortune[0].isBlock, false);
  assert.ok(ironDropsFortune[0].count > 1, `Fortune III must increase iron ore drop count, got ${ironDropsFortune[0].count}`);

  const goldDropsFortune = harvestDrops(BLOCKS.GOLD_ORE, { toolId: 'diamond_pickaxe', fortune: 3 }, rollForMultiplier);
  assert.equal(goldDropsFortune[0].id, 'raw_gold');
  assert.equal(goldDropsFortune[0].isBlock, false);
  assert.ok(goldDropsFortune[0].count > 1, `Fortune III must increase gold ore drop count, got ${goldDropsFortune[0].count}`);

  const copperDropsFortune = harvestDrops(BLOCKS.COPPER_ORE, { toolId: 'diamond_pickaxe', fortune: 3 }, rollForMultiplier);
  assert.equal(copperDropsFortune[0].id, 'raw_copper');
  assert.equal(copperDropsFortune[0].isBlock, false);
  assert.ok(copperDropsFortune[0].count > 5, `Fortune III must increase copper ore drop count beyond base max, got ${copperDropsFortune[0].count}`);
});

test('survival block break simulation with correct vs incorrect tools', () => {
  // Simulate the main.js breakTargetBlock logic
  function simulateBreak(blockId, heldToolId, isSurvival = true) {
    const heldDef = heldToolId ? ITEMS[heldToolId] ?? null : null;
    const wrongTool = isSurvival && harvestsNothing(blockId, heldDef, heldToolId);
    if (!isSurvival) return []; // Creative mode drops nothing
    if (wrongTool) return []; // Inadequate tool drops nothing
    return harvestDrops(blockId, { toolId: heldToolId });
  }

  // Bare hand / wooden pickaxe on iron ore
  assert.deepEqual(simulateBreak(BLOCKS.IRON_ORE, null), []);
  assert.deepEqual(simulateBreak(BLOCKS.IRON_ORE, 'wooden_pickaxe'), []);

  // Stone pickaxe on iron ore -> raw_iron
  const stoneOnIron = simulateBreak(BLOCKS.IRON_ORE, 'stone_pickaxe');
  assert.equal(stoneOnIron.length, 1);
  assert.equal(stoneOnIron[0].id, 'raw_iron');
  assert.equal(stoneOnIron[0].isBlock, false);

  // Stone pickaxe on gold ore -> nothing
  assert.deepEqual(simulateBreak(BLOCKS.GOLD_ORE, 'stone_pickaxe'), []);

  // Iron pickaxe on gold ore -> raw_gold
  const ironOnGold = simulateBreak(BLOCKS.GOLD_ORE, 'iron_pickaxe');
  assert.equal(ironOnGold.length, 1);
  assert.equal(ironOnGold[0].id, 'raw_gold');
  assert.equal(ironOnGold[0].isBlock, false);

  // Stone pickaxe on copper ore -> raw_copper
  const stoneOnCopper = simulateBreak(BLOCKS.COPPER_ORE, 'stone_pickaxe');
  assert.equal(stoneOnCopper.length, 1);
  assert.equal(stoneOnCopper[0].id, 'raw_copper');
  assert.equal(stoneOnCopper[0].isBlock, false);
  assert.ok(stoneOnCopper[0].count >= 2 && stoneOnCopper[0].count <= 5);

  // Creative mode drops nothing even with diamond pickaxe
  assert.deepEqual(simulateBreak(BLOCKS.IRON_ORE, 'diamond_pickaxe', false), []);
  assert.deepEqual(simulateBreak(BLOCKS.COPPER_ORE, 'diamond_pickaxe', false), []);
  assert.deepEqual(simulateBreak(BLOCKS.GOLD_ORE, 'diamond_pickaxe', false), []);
});
