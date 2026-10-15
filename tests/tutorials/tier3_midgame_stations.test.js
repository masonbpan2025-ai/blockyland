import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTutorialFixture } from './harness.js';
import { BLOCKS } from '../../src/blocks.js';
import { initVillagerEconomy, resetVillagerTrades } from '../../src/villagerEconomy.js';
import { calculateBookshelfCount } from '../../src/enchanting.js';
import { isFireproof } from '../../src/smithing.js';

test('Tutorial 3.1: Village Mechanics & Trading - Professions, level progression, and daily restocks', async () => {
  const f = createTutorialFixture({ playerPos: [0.5, 1, 0.5] });

  // Place Cleric's brewing stand workstation at (2, 1, 1)
  f.world.setVoxel(2, 1, 1, BLOCKS.BREWING_STAND);

  // Spawn Cleric villager nearby at (2, 1, 0.5)
  const cleric = {
    type: 'villager',
    profession: 'cleric',
    health: 20,
    mesh: { position: new THREE.Vector3(2, 1, 0.5) },
    position: new THREE.Vector3(2, 1, 0.5)
  };
  initVillagerEconomy(cleric, 'cleric', { random: () => 0.1 });
  f.mobsList.push(cleric);

  const initialTrades = cleric.trades.length;
  assert.ok(initialTrades >= 1, 'Cleric has initial novice trades');
  assert.equal(cleric.level, 1, 'Cleric begins at level 1 (Novice)');

  // Give player materials to trade (rotten flesh and emeralds; 5 trades of 32 = 160 rotten flesh)
  f.inventory.addItem('rotten_flesh', false, 200);
  f.inventory.addItem('emerald', false, 64);

  // Execute trades with the cleric
  const tradeResult = await f.runCommand('trade 5 with cleric');
  assert.equal(tradeResult.ok, true, `Trading succeeded: ${tradeResult.message}`);

  // Assertions: villager experience and leveling progression
  assert.ok(cleric.xp > 0, `Cleric gained experience: ${cleric.xp}`);
  assert.ok(cleric.level >= 2, `Cleric leveled up to level ${cleric.level}`);
  assert.ok(cleric.regenerationTimer > 0, 'Cleric gained Regeneration I timer on leveling up');
  assert.ok(cleric.trades.length > initialTrades, 'New career trades were unlocked on level progression');

  // Verify player received rewards
  const hasEmeralds = f.bot.itemCount('emerald') > 0;
  const hasRedstone = f.bot.itemCount('redstone') > 0;
  assert.ok(hasEmeralds || hasRedstone, 'Player received traded emeralds or redstone');

  // Restock parity check
  resetVillagerTrades(cleric);
  assert.ok(cleric.trades.every(t => t.uses === 0), 'Daily restock reset trade usage back to 0');
});

test('Tutorial 3.2: Enchanting & Anvil Mechanics - Bookshelf boosting, Level 30 offers, combining and renaming', async () => {
  const f = createTutorialFixture({ playerPos: [0.5, 1, 0.5] });

  // 1. Arrange Enchanting Table at (0, 1, 2)
  f.world.setVoxel(0, 1, 2, BLOCKS.ENCHANTING_TABLE);

  // Arrange 15 Bookshelves surrounding the table in a 5x5 perimeter with 1-block air gap
  // North & South walls (z = 0 and z = 4): x in [-2, 2]
  for (let x = -2; x <= 2; x++) {
    f.world.setVoxel(x, 1, 0, BLOCKS.BOOKSHELF);
    f.world.setVoxel(x, 1, 4, BLOCKS.BOOKSHELF);
  }
  // East & West walls (x = -2 and x = 2): z in [1, 3]
  for (let z = 1; z <= 3; z++) {
    f.world.setVoxel(-2, 1, z, BLOCKS.BOOKSHELF);
    f.world.setVoxel(2, 1, z, BLOCKS.BOOKSHELF);
  }

  // Engine parity check: Bookshelf count calculation
  const shelfCount = calculateBookshelfCount(f.world, 0, 1, 2);
  assert.equal(shelfCount, 15, `Expected 15 bookshelves, calculated ${shelfCount}`);

  // Give player diamond pickaxe, lapis lazuli, and level 45
  f.inventory.addItem('diamond_pickaxe', false, 1);
  f.inventory.addItem('lapis_lazuli', false, 16);
  f.player.level = 45;

  // Execute Level 30 slot (slot 2) enchantment
  const enchResult = await f.runCommand('enchant diamond_pickaxe slot 2 at 0 1 2');
  assert.equal(enchResult.ok, true, `Enchanting succeeded: ${enchResult.message}`);

  const enchantedPickaxe = f.inventory.hotbar.concat(f.inventory.storage).find(s => s && s.id === 'diamond_pickaxe');
  assert.ok(enchantedPickaxe && enchantedPickaxe.enchantments && enchantedPickaxe.enchantments.length >= 1, 'Diamond pickaxe received enchantments');
  assert.equal(f.bot.itemCount('lapis_lazuli'), 13, '3 lapis lazuli consumed for slot 3');
  assert.equal(f.player.level, 15, '30 player levels consumed for Level 30 slot (from 45 down to 15)');

  // 2. Anvil Mechanics: Place anvil at (1, 1, 1)
  f.world.setVoxel(1, 1, 1, BLOCKS.ANVIL);

  // Combine two damaged iron pickaxes
  f.inventory.addItem({ id: 'iron_pickaxe', count: 1, durability: 50, maxDurability: 250, isBlock: false });
  f.inventory.addItem({ id: 'iron_pickaxe', count: 1, durability: 60, maxDurability: 250, isBlock: false });

  const repairResult = await f.runCommand('anvil iron_pickaxe with iron_pickaxe at 1 1 1');
  assert.equal(repairResult.ok, true, `Anvil repair succeeded: ${repairResult.message}`);

  const repairedPick = f.inventory.hotbar.concat(f.inventory.storage).find(s => s && s.id === 'iron_pickaxe');
  assert.ok(repairedPick, 'Repaired iron pickaxe in inventory');
  // Durability: 50 + 60 + floor(250 * 0.12) = 140
  assert.ok(repairedPick.durability >= 140, `Durability properly combined: ${repairedPick.durability}`);
  assert.ok(repairedPick.repairCost > 0, `Prior work penalty incremented to ${repairedPick.repairCost}`);

  // Rename item on anvil
  const renameResult = await f.runCommand('anvil iron_pickaxe rename Excalibur at 1 1 1');
  assert.equal(renameResult.ok, true, `Anvil rename succeeded: ${renameResult.message}`);

  const renamedPick = f.inventory.hotbar.concat(f.inventory.storage).find(s => s && s.id === 'iron_pickaxe');
  assert.equal(renamedPick.customName?.toLowerCase(), 'excalibur', 'Item was renamed to Excalibur');

  // Combine gear with Enchanted Book (Sharpness III)
  f.inventory.addItem('diamond_sword', false, 1);
  f.inventory.addItem({
    id: 'enchanted_book',
    count: 1,
    isBlock: false,
    enchantments: [{ id: 'sharpness', level: 3 }]
  });

  const bookCombineResult = await f.runCommand('anvil diamond_sword with enchanted_book at 1 1 1');
  assert.equal(bookCombineResult.ok, true, `Anvil book combine succeeded: ${bookCombineResult.message}`);

  const bookSword = f.inventory.hotbar.concat(f.inventory.storage).find(s => s && s.id === 'diamond_sword' && s.enchantments?.some(e => e.id === 'sharpness'));
  assert.ok(bookSword, 'Diamond sword acquired Sharpness from enchanted book');
});

test('Tutorial 3.3: Alchemy & Brewing - Potion tree, ingredient progression, and status effect drinking', async () => {
  const f = createTutorialFixture({ playerPos: [0.5, 1, 0.5] });

  // Place Brewing Stand at (1, 1, 0)
  f.world.setVoxel(1, 1, 0, BLOCKS.BREWING_STAND);

  // Give player fuel, bottles, and ingredients
  f.inventory.addItem('blaze_powder', false, 5);
  f.inventory.addItem('water_bottle', false, 3);
  f.inventory.addItem('nether_wart', false, 3);
  f.inventory.addItem('sugar', false, 3);
  f.inventory.addItem('redstone', false, 3);

  // 1. Brew Nether Wart into Water Bottles -> Awkward Potion
  const brewAwkward = await f.runCommand('brew nether_wart into water_bottle at 1 1 0');
  assert.equal(brewAwkward.ok, true, `Brew awkward succeeded: ${brewAwkward.message}`);
  assert.equal(f.bot.itemCount('awkward_potion'), 3, 'Brewed 3 awkward potions');

  // 2. Brew Sugar into Awkward Potion -> Potion of Swiftness
  const brewSwiftness = await f.runCommand('brew sugar into awkward_potion at 1 1 0');
  assert.equal(brewSwiftness.ok, true, `Brew swiftness succeeded: ${brewSwiftness.message}`);
  assert.equal(f.bot.itemCount('potion_of_swiftness'), 3, 'Brewed 3 potions of swiftness');

  // 3. Brew Redstone into Potion of Swiftness -> Potion of Swiftness (Extended)
  const brewExtended = await f.runCommand('brew redstone into potion_of_swiftness at 1 1 0');
  assert.equal(brewExtended.ok, true, `Brew extended swiftness succeeded: ${brewExtended.message}`);
  assert.equal(f.bot.itemCount('potion_of_swiftness_long'), 3, 'Brewed 3 extended swiftness potions');

  // 4. Drink Potion: Verify status effect applied and empty bottle returned
  const drinkResult = await f.runCommand('eat potion_of_swiftness_long');
  assert.equal(drinkResult.ok, true, `Drinking potion succeeded: ${drinkResult.message}`);
  assert.equal(f.bot.itemCount('glass_bottle'), 1, 'Empty glass bottle returned to inventory');
  assert.ok(f.player.hasStatusEffect('speed'), 'Player received Speed status effect');
});

test('Tutorial 3.4: Smithing - Netherite upgrade template, gear stat enhancement, and fireproof parity', async () => {
  const f = createTutorialFixture({ playerPos: [0.5, 1, 0.5] });

  // Place Smithing Table at (1, 1, 0)
  f.world.setVoxel(1, 1, 0, BLOCKS.SMITHING_TABLE);

  // Give player upgrade template, enchanted diamond chestplate, and netherite ingot
  f.inventory.addItem('netherite_upgrade_smithing_template', false, 1);
  f.inventory.addItem({
    id: 'diamond_chestplate',
    count: 1,
    durability: 500,
    maxDurability: 528,
    isBlock: false,
    enchantments: [{ id: 'protection', level: 4 }]
  });
  f.inventory.addItem('netherite_ingot', false, 1);

  // Execute smithing upgrade
  const smithResult = await f.runCommand('smith netherite_upgrade on diamond_chestplate with netherite_ingot at 1 1 0');
  assert.equal(smithResult.ok, true, `Smithing succeeded: ${smithResult.message}`);

  // Assertions: Netherite chestplate produced
  assert.equal(f.bot.itemCount('netherite_chestplate'), 1, 'Netherite chestplate produced');
  assert.equal(f.bot.itemCount('diamond_chestplate'), 0, 'Diamond chestplate consumed');
  assert.equal(f.bot.itemCount('netherite_ingot'), 0, 'Netherite ingot consumed');

  // Verify enchantment preservation and upgraded durability
  const netheritePlate = f.inventory.hotbar.concat(f.inventory.storage).find(s => s && s.id === 'netherite_chestplate');
  assert.ok(netheritePlate, 'Netherite chestplate exists in inventory');
  assert.ok(netheritePlate.enchantments && netheritePlate.enchantments.some(e => e.id === 'protection' && e.level === 4), 'Protection IV enchantment was preserved on upgrade');
  assert.ok(netheritePlate.maxDurability > 528, `Netherite max durability is higher: ${netheritePlate.maxDurability}`);

  // Engine parity check: Netherite items are fireproof (survive lava and fire)
  assert.equal(isFireproof('netherite_chestplate'), true, 'Netherite chestplate is fireproof');
  assert.equal(isFireproof('diamond_chestplate'), false, 'Diamond chestplate burns');
});
