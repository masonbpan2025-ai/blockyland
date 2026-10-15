import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTutorialFixture } from './harness.js';
import { BLOCKS } from '../../src/blocks.js';

function selectHotbarItem(inventory, id) {
  for (let i = 0; i < inventory.hotbar.length; i++) {
    if (inventory.hotbar[i]?.id === id) {
      inventory.activeSlot = i;
      return true;
    }
  }
  return false;
}

function countTotalItems(inventory) {
  return [...inventory.hotbar, ...inventory.storage].filter(Boolean).length;
}

test('Tutorial 1.1: Your First 10 Minutes - Day 1 survival loop', async () => {
  const f = createTutorialFixture({
    playerPos: [0.5, 1, 0.5],
    worldTime: 1000,
    gameMode: 'survival',
    initialInventory: []
  });

  // Verify starting with empty inventory
  assert.equal(countTotalItems(f.inventory), 0, 'player starts Day 1 with empty inventory');

  // Spawn oak logs accessible to bot
  f.world.setVoxel(2, 1, 0, BLOCKS.OAK_LOG);
  f.world.setVoxel(2, 1, 1, BLOCKS.OAK_LOG);
  f.world.setVoxel(2, 1, 2, BLOCKS.OAK_LOG);
  f.world.setVoxel(2, 1, 3, BLOCKS.OAK_LOG);

  // 1. Mine oak logs
  await f.runCommand('mine 4 oak_log');
  assert.ok(f.bot.itemCount('oak_log') >= 4, 'bot harvested 4 oak logs');

  // 2. Craft planks and crafting table in 2x2 grid
  await f.runCommand('craft 4 oak_planks');
  assert.ok(f.bot.itemCount('oak_planks') >= 16, 'bot crafted 16 planks');

  await f.runCommand('craft crafting_table');
  assert.ok(f.bot.itemCount('crafting_table') >= 1, 'bot crafted crafting table');

  // 3. Place crafting table nearby
  selectHotbarItem(f.inventory, 'crafting_table');
  f.world.setVoxel(1, 1, 0, BLOCKS.CRAFTING_TABLE);
  f.inventory.consumeActiveItem();

  // 4. Craft sticks and wooden pickaxe
  await f.runCommand('craft 4 stick');
  assert.ok(f.bot.itemCount('stick') >= 4, 'bot crafted 4 sticks');

  await f.runCommand('craft wooden_pickaxe at 1 1 0');
  assert.ok(f.bot.itemCount('wooden_pickaxe') >= 1, 'bot crafted wooden pickaxe');

  // 5. Spawn stone blocks to mine cobblestone (3 for pick, 2 for sword, 8 for furnace = 13 cobble)
  for (let z = 1; z <= 14; z++) {
    f.world.setVoxel(3, 1, z, BLOCKS.STONE);
  }

  // Mine 14 stone with wooden pickaxe -> drops cobblestone
  await f.runCommand('mine 14 stone');
  assert.ok(f.bot.itemCount('cobblestone') >= 13, 'stone mined with wooden pickaxe dropped >= 13 cobblestone');

  // Return to crafting table
  await f.runCommand('goto 0 1 0');

  // 6. Craft stone pickaxe, stone sword, and furnace at table
  await f.runCommand('craft stone_pickaxe at 1 1 0');
  assert.ok(f.bot.itemCount('stone_pickaxe') >= 1, 'bot crafted stone pickaxe');

  await f.runCommand('craft stone_sword at 1 1 0');
  assert.ok(f.bot.itemCount('stone_sword') >= 1, 'bot crafted stone sword');

  await f.runCommand('craft furnace at 1 1 0');
  assert.ok(f.bot.itemCount('furnace') >= 1, 'bot crafted furnace');

  // 7. Build Day 1 starter shelter (Capability 4 schematic)
  f.inventory.addItem('cobblestone', true, 16);
  f.inventory.addItem('oak_planks', true, 32);
  f.inventory.addItem('torch', true, 4);

  await f.runCommand('build shelter at 5 1 5');

  // Verify shelter blocks placed
  assert.equal(f.world.getVoxel(5, 1, 5), BLOCKS.COBBLESTONE, 'shelter floor block placed');
  assert.equal(f.world.getVoxel(5, 2, 5), BLOCKS.OAK_PLANKS, 'shelter wall block placed');
  assert.equal(f.world.getVoxel(7, 3, 7), BLOCKS.TORCH, 'shelter torch placed');
});

test('Tutorial 1.2: The Second Day - Food supply, furnace cooking, chests, and storage', async () => {
  const f = createTutorialFixture({
    playerPos: [0.5, 1, 0.5],
    worldTime: 24000, // Dawn of Day 2
    gameMode: 'survival'
  });

  // 1. Hunt cows for raw beef
  const cowMesh = new THREE.Group();
  cowMesh.position.set(2, 1, 0);
  const cow = {
    id: 'cow_1',
    type: 'cow',
    mesh: cowMesh,
    health: 4,
    drops: [{ id: 'beef', count: 2, isBlock: false }]
  };
  f.mobsList.push(cow);

  // Equip stone sword
  f.inventory.addItem('stone_sword', false, 1);
  selectHotbarItem(f.inventory, 'stone_sword');

  await f.runCommand('kill cow');
  assert.ok(f.bot.itemCount('beef') >= 2, 'cow killed and dropped 2 raw beef');

  // 2. Place furnace and cook beef
  f.world.setVoxel(1, 1, 0, BLOCKS.FURNACE);
  f.inventory.addItem('coal', false, 1);

  // Bot cooks beef with coal
  await f.runCommand('cook beef with coal at 1 1 0');
  assert.ok(f.bot.itemCount('cooked_beef') >= 1, 'furnace cooked raw beef into cooked_beef');

  // 3. Hunger replenishment parity check
  f.player.hunger = 10;
  f.player.saturation = 2;
  await f.runCommand('eat cooked_beef');
  assert.ok(f.player.hunger >= 18, 'cooked beef restored hunger (>= 18)');
  assert.ok(f.player.saturation > 2, 'cooked beef replenished saturation');

  // 4. Craft and place storage chest
  f.inventory.addItem('oak_planks', true, 8);
  f.world.setVoxel(2, 1, 0, BLOCKS.CRAFTING_TABLE);
  await f.runCommand('craft chest at 2 1 0');
  assert.ok(f.bot.itemCount('chest') >= 1, 'bot crafted wooden chest');

  // Place chest at 3 1 0
  f.world.setVoxel(3, 1, 0, BLOCKS.CHEST);
  selectHotbarItem(f.inventory, 'chest');
  f.inventory.consumeActiveItem();

  // 5. Store surplus cobblestone into chest
  f.inventory.addItem('cobblestone', true, 20);
  await f.runCommand('store 15 cobblestone at 3 1 0');

  assert.equal(f.bot.itemCount('cobblestone'), 5, '15 cobblestone transferred from player inventory');
  const chest = f.chestManager.getChest(3, 1, 0);
  assert.ok(chest, 'chest exists in chestManager');
  assert.ok(chest.items.some(it => it && f.bot.survival.sameItem(it.id, 'cobblestone') && it.count === 15), 'chest contains 15 cobblestone');

  // 6. Withdraw 5 cobblestone from chest
  await f.runCommand('withdraw 5 cobblestone at 3 1 0');
  assert.equal(f.bot.itemCount('cobblestone'), 10, 'withdrew 5 cobblestone back into inventory');
});

test('Tutorial 1.3: The Third Day - Iron Age progression and armor equipment', async () => {
  const f = createTutorialFixture({
    playerPos: [0.5, 1, 0.5],
    worldTime: 48000, // Dawn of Day 3
    gameMode: 'survival'
  });

  // Verify harvest rules: wooden pickaxe cannot harvest iron ore!
  f.world.setVoxel(2, 1, 0, BLOCKS.IRON_ORE);
  f.inventory.addItem('wooden_pickaxe', false, 1);
  selectHotbarItem(f.inventory, 'wooden_pickaxe');

  await f.runCommand('mine 1 iron_ore');
  assert.equal(f.bot.itemCount('raw_iron'), 0, 'wooden pickaxe harvests nothing from iron ore');

  // Upgrade to stone pickaxe
  f.inventory.addItem('stone_pickaxe', false, 1);
  selectHotbarItem(f.inventory, 'stone_pickaxe');

  // Spawn raw iron ores
  for (let z = 1; z <= 8; z++) {
    f.world.setVoxel(2, 1, z, BLOCKS.IRON_ORE);
  }

  await f.runCommand('mine 8 iron_ore');
  assert.ok(f.bot.itemCount('raw_iron') >= 8, 'stone pickaxe successfully harvested 8 raw iron');

  // Return to base forge
  await f.runCommand('goto 0 1 2');

  // Smelt raw iron in furnace (1 coal smelts 8 raw iron)
  f.world.setVoxel(0, 1, 2, BLOCKS.FURNACE);
  f.inventory.addItem('coal', false, 1);

  await f.runCommand('cook 8 raw_iron with 1 coal at 0 1 2');
  assert.equal(f.bot.itemCount('iron_ingot'), 8, 'smelted 8 raw iron into 8 iron ingots');

  // Craft iron pickaxe, iron sword, shield, and iron chestplate
  f.world.setVoxel(0, 1, 3, BLOCKS.CRAFTING_TABLE);
  f.inventory.addItem('stick', false, 8);
  f.inventory.addItem('oak_planks', true, 6); // For shield

  await f.runCommand('craft iron_pickaxe at 0 1 3');
  assert.ok(f.bot.itemCount('iron_pickaxe') >= 1, 'crafted iron pickaxe');

  await f.runCommand('craft iron_sword at 0 1 3');
  assert.ok(f.bot.itemCount('iron_sword') >= 1, 'crafted iron sword');

  await f.runCommand('craft shield at 0 1 3');
  assert.ok(f.bot.itemCount('shield') >= 1, 'crafted shield');

  // Add more ingots for chestplate (requires 8 iron ingots)
  f.inventory.addItem('iron_ingot', false, 8);
  await f.runCommand('craft iron_chestplate at 0 1 3');
  assert.ok(f.bot.itemCount('iron_chestplate') >= 1, 'crafted iron chestplate');

  // Equip chestplate and verify armor defense points
  selectHotbarItem(f.inventory, 'iron_chestplate');
  f.game.handleRightClick();
  assert.equal(f.inventory.armor.chest?.id, 'iron_chestplate', 'iron chestplate equipped in chest armor slot');
  assert.equal(f.inventory.getTotalArmorPoints(), 6, 'iron chestplate provides +6 armor defense points');
});

test('Tutorial 1.4: Shelters - Door mechanisms and bed sleep safety', async () => {
  const f = createTutorialFixture({
    playerPos: [0.5, 1, 0.5],
    worldTime: 13500, // Nighttime
    gameMode: 'survival'
  });

  // 1. Door mechanics: place door, toggle open/closed
  f.world.setVoxel(1, 0, 0, BLOCKS.COBBLESTONE); // door threshold
  f.inventory.addItem('oak_door', false, 1);
  selectHotbarItem(f.inventory, 'oak_door');

  // Place door
  const doorPlaced = f.doorManager.placeDoor(f.world, [1, 1, 0], 3, false);
  assert.ok(doorPlaced.success, 'door successfully placed');
  assert.equal(f.world.getVoxel(1, 1, 0), BLOCKS.OAK_DOOR, 'lower door half placed');
  assert.equal(f.world.getVoxel(1, 2, 0), BLOCKS.OAK_DOOR_TOP, 'upper door half placed');

  // Toggle door open
  const toggledOpen = f.doorManager.toggleDoor(1, 1, 0, true);
  assert.ok(toggledOpen, 'door toggled open');
  assert.equal(f.world.getVoxel(1, 1, 0), BLOCKS.OAK_DOOR_OPEN, 'door opened');

  // Toggle door closed
  const toggledClosed = f.doorManager.toggleDoor(1, 1, 0, false);
  assert.ok(toggledClosed, 'door toggled closed');
  assert.equal(f.world.getVoxel(1, 1, 0), BLOCKS.OAK_DOOR, 'door closed');

  // 2. Bed sleep rules: monsters nearby check
  f.world.setVoxel(0, 1, 2, BLOCKS.RED_BED_FOOT);
  f.world.setVoxel(0, 1, 3, BLOCKS.RED_BED_HEAD);

  // Place hostile zombie 3 blocks away
  const zombieMesh = new THREE.Group();
  zombieMesh.position.set(0, 1, 5);
  f.mobsList.push({
    id: 'zombie_nearby',
    type: 'zombie',
    mesh: zombieMesh,
    health: 20
  });

  // Attempt sleep near monster
  const sleepBlocked = f.bedManager.interact(0, 1, 2, f.player);
  assert.equal(sleepBlocked.success, false, 'sleep blocked when monsters nearby');
  assert.match(sleepBlocked.reason, /monsters nearby/i, 'correct wiki warning message for nearby monsters');

  // Eliminate monster and sleep successfully
  f.mobsList.length = 0;
  const sleepSafe = f.bedManager.interact(0, 1, 2, f.player);
  assert.equal(sleepSafe.success, true, 'sleep succeeds when no monsters nearby');
  assert.equal(f.player.isSleeping, true, 'player enters sleeping state');
});
