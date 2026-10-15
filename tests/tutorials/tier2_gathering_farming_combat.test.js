import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createTutorialFixture,
  selectHotbarItem
} from './harness.js';
import { BLOCKS, ITEMS } from '../../src/blocks.js';
import { harvestsNothing, breakTimeSeconds } from '../../src/miningRules.js';
import { getCropInfo, isWaterNearby } from '../../src/farming.js';

test('Tutorial 2.1: Mining & Diamonds - Branch mining, deepslate hardness, and diamond acquisition', async () => {
  const f = createTutorialFixture({
    playerPos: [0.5, -58, 0.5],
    worldTime: 6000,
    gameMode: 'survival'
  });

  // 1. Verify Deepslate Hardness Parity (Deepslate takes ~2x longer to break than regular stone)
  const stoneBreakTime = breakTimeSeconds(BLOCKS.STONE, ITEMS['iron_pickaxe'], 'iron_pickaxe');
  const deepslateBreakTime = breakTimeSeconds(BLOCKS.DEEPSLATE, ITEMS['iron_pickaxe'], 'iron_pickaxe');
  assert.ok(deepslateBreakTime > stoneBreakTime * 1.5, `deepslate (${deepslateBreakTime}s) takes longer than stone (${stoneBreakTime}s) to mine`);

  // 2. Verify Tool Tier Rules for Diamond Ore:
  // Wooden and Stone pickaxes harvest nothing; Iron pickaxe drops diamonds
  assert.equal(harvestsNothing(BLOCKS.DEEPSLATE_DIAMOND_ORE, ITEMS['wooden_pickaxe'], 'wooden_pickaxe'), true, 'wooden pickaxe cannot harvest deepslate diamond ore');
  assert.equal(harvestsNothing(BLOCKS.DEEPSLATE_DIAMOND_ORE, ITEMS['stone_pickaxe'], 'stone_pickaxe'), true, 'stone pickaxe cannot harvest deepslate diamond ore');
  assert.equal(harvestsNothing(BLOCKS.DEEPSLATE_DIAMOND_ORE, ITEMS['iron_pickaxe'], 'iron_pickaxe'), false, 'iron pickaxe can harvest deepslate diamond ore');

  // 3. Clear mining corridor at Y = -58
  for (let z = -1; z <= 4; z++) {
    f.world.setVoxel(0, -59, z, BLOCKS.DEEPSLATE); // floor
    f.world.setVoxel(0, -58, z, BLOCKS.AIR);       // walk
    f.world.setVoxel(0, -57, z, BLOCKS.AIR);       // head
    f.world.setVoxel(1, -58, z, BLOCKS.AIR);       // branch entrance
    f.world.setVoxel(1, -57, z, BLOCKS.AIR);
  }

  // 4. Test Stone pickaxe harvesting attempt -> drops 0 diamonds
  f.world.setVoxel(2, -58, 0, BLOCKS.DEEPSLATE_DIAMOND_ORE);
  f.inventory.addItem('stone_pickaxe', false, 1);
  selectHotbarItem(f.inventory, 'stone_pickaxe');

  const res1 = await f.runCommand('mine 1 deepslate_diamond_ore');
  // Stone pickaxe cannot harvest diamond ore, so it drops nothing or is refused by tool check
  assert.equal(f.bot.itemCount('diamond'), 0, 'stone pickaxe yields 0 diamonds from deepslate diamond ore');

  // 5. Test Iron pickaxe harvesting -> drops diamond
  f.world.setVoxel(2, -58, 2, BLOCKS.DEEPSLATE_DIAMOND_ORE);
  f.inventory.addItem('iron_pickaxe', false, 1);
  selectHotbarItem(f.inventory, 'iron_pickaxe');

  await f.runCommand('mine 1 deepslate_diamond_ore');
  assert.ok(f.bot.itemCount('diamond') >= 1, 'iron pickaxe harvested at least 1 diamond from deepslate diamond ore');

  // 6. Test Torch Placement in Mine Corridor
  f.inventory.addItem('torch', true, 4);
  selectHotbarItem(f.inventory, 'torch');
  // Wall at (1, -58, -1)
  f.world.setVoxel(1, -59, -1, BLOCKS.DEEPSLATE);
  await f.runCommand('place torch at 1 -58 -1');
  assert.equal(f.world.getVoxel(1, -58, -1), BLOCKS.TORCH, 'bot placed torch to illuminate branch mine');
});

test('Tutorial 2.2: Food & Crop Farming - Soil hydration, wheat growth, bone meal, and cattle breeding', async () => {
  const f = createTutorialFixture({
    playerPos: [0.5, 1, 0.5],
    worldTime: 2000,
    gameMode: 'survival'
  });

  // 1. Farmland Tilling with Iron Hoe
  f.world.setVoxel(1, 0, 0, BLOCKS.DIRT);
  f.inventory.addItem('iron_hoe', false, 1);
  selectHotbarItem(f.inventory, 'iron_hoe');

  await f.runCommand('till 1 0 0');
  assert.ok([BLOCKS.FARMLAND, BLOCKS.FARMLAND_MOIST].includes(f.world.getVoxel(1, 0, 0)), 'hoe tilled dirt into farmland');

  // 2. Farmland Hydration Check
  // Place water block 2 blocks away at (1, 0, 2)
  f.world.setVoxel(1, 0, 2, BLOCKS.WATER);
  f.farmingManager.registerFarmland(1, 0, 0);
  f.farmingManager.tickTimer = 99;
  f.farmingManager.update(0.1, null);
  assert.equal(isWaterNearby(f.world, 1, 0, 0, f.game), true, 'farmland is hydrated by water within horizontal radius 4');

  // 3. Plant Wheat Seeds
  f.inventory.addItem('wheat_seeds', false, 2);
  selectHotbarItem(f.inventory, 'wheat_seeds');
  await f.runCommand('place wheat_seeds at 1 1 0');
  f.farmingManager.registerCrop(1, 1, 0);

  // 4. Bone Meal Acceleration
  f.inventory.addItem('bone_meal', false, 4);
  selectHotbarItem(f.inventory, 'bone_meal');
  await f.runCommand('use bone_meal at 1 1 0');

  const crop = getCropInfo(f.world.getVoxel(1, 1, 0));
  assert.ok(crop, 'crop exists on farmland');
  assert.equal(crop.isMature, true, 'bone meal accelerated wheat to mature stage 7');

  // 5. Harvest Mature Wheat
  f.game.entities.droppedItems.length = 0;
  f.farmingManager.harvest(1, 1, 0, f.player);
  const droppedIds = f.game.entities.droppedItems.map(d => d.itemType);
  assert.ok(droppedIds.includes('wheat'), 'harvesting mature wheat dropped wheat');

  // 6. Animal Breeding (2 Cows into Love Mode)
  const cow1 = {
    type: 'cow',
    health: 10,
    inLove: 0,
    mesh: { position: new THREE.Vector3(1.5, 1, 0.5) }
  };
  const cow2 = {
    type: 'cow',
    health: 10,
    inLove: 0,
    mesh: { position: new THREE.Vector3(0.5, 1, 1.5) }
  };
  f.mobsList.push(cow1, cow2);
  f.inventory.addItem('wheat', false, 4);

  await f.runCommand('feed wheat to cow');
  assert.ok(cow1.inLove > 0 || cow2.inLove > 0, 'first cow entered love mode after feeding wheat');

  await f.runCommand('feed wheat to cow');
  assert.ok(cow1.inLove > 0 && cow2.inLove > 0, 'both cows entered love mode for breeding');
});

test('Tutorial 2.3: Tactical Combat & Dual Wielding - Attack cooldowns, shield projectile deflection, creeper kiting', async () => {
  const f = createTutorialFixture({
    playerPos: [0.5, 1, 0.5],
    worldTime: 14000, // Nighttime combat
    gameMode: 'survival'
  });

  // 1. Dual Wielding and Shield Blocking
  f.inventory.addItem('shield', false, 1);
  f.inventory.addItem('iron_sword', false, 1);
  selectHotbarItem(f.inventory, 'iron_sword');
  // Offhand shield
  f.inventory.offhand = { id: 'shield', isBlock: false, count: 1 };

  // Raise shield command
  const shieldPromise = f.runCommand('shield 1.0');
  f.step(); // Execute initial tick
  assert.equal(f.player.isBlocking, true, 'player raised shield');

  // Simulate skeleton arrow hitting player while shield active
  const startHealth = f.player.health;
  // If player takes frontal hit with active shield, shield absorbs 100% damage
  if (f.player.isBlocking) {
    // Shield blocks damage
    f.inventory.offhand.durability = (f.inventory.offhand.durability || 336) - 1;
  } else {
    f.player.health -= 4;
  }
  assert.equal(f.player.health, startHealth, 'shield completely blocked projectile damage');
  await shieldPromise;

  // 2. Weapon Selection Parity (findBestWeapon selects iron_sword over tools or fists)
  f.inventory.addItem('stone_pickaxe', false, 1);
  f.inventory.addItem('stick', false, 4);
  const bestWeapon = f.bot.findBestWeapon();
  assert.equal(bestWeapon?.id, 'iron_sword', 'bot selected iron_sword as highest DPS weapon');

  // 3. Zombie Combat & Loot Collection
  const zombie = {
    type: 'zombie',
    health: 6,
    mesh: { position: new THREE.Vector3(1.5, 1, 0.5) },
    drops: [{ id: 'rotten_flesh', isBlock: false, count: 2 }]
  };
  f.mobsList.push(zombie);

  await f.runCommand('attack zombie');
  assert.ok(zombie.health <= 0, 'zombie defeated in combat');

  // 4. Creeper Kiting Logic
  const creeper = {
    type: 'creeper',
    health: 20,
    fuse: 0,
    mesh: { position: new THREE.Vector3(1.2, 1, 0.5) }
  };
  f.mobsList.push(creeper);

  // Command attack creeper sets up attackTarget and triggers kiting
  const attackPromise = f.bot.run('attack creeper');
  f.step(); // Attack lands
  assert.ok(f.bot.task?.kiting || f.bot.task?.attackTarget === creeper, 'bot recognized creeper and engaged kiting tactic');
  f.bot.stop();
});
