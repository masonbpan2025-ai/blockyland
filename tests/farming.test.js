import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, Chunk } from '../src/world.js';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import {
  FarmingManager,
  isHoe,
  getSeedCrop,
  getCropInfo,
  isWaterNearby,
  TILLABLE_BLOCKS
} from '../src/farming.js';
import { RECIPES_2X2, RECIPES_3X3, findMatchingRecipe } from '../src/crafting.js';

function setupFarmingWorld() {
  const world = new World();
  for (let cx = -2; cx <= 2; cx++) {
    for (let cz = -2; cz <= 2; cz++) {
      world.chunks.set(world.chunkKey(cx, cz), new Chunk(cx, cz));
    }
  }

  // Dirt ground at y = 10
  for (let x = -10; x <= 10; x++) {
    for (let z = -10; z <= 10; z++) {
      world.setVoxel(x, 10, z, BLOCKS.DIRT);
    }
  }

  const droppedItems = [];
  const soundCalls = [];
  const particleCalls = [];

  const fakeGame = {
    world,
    entities: {
      spawnDroppedItem: (pos, id, isBlock, count) => {
        droppedItems.push({ pos, id, isBlock, count });
      },
      spawnBoneMealParticles: (pos, count) => {
        particleCalls.push({ pos, count });
      }
    },
    sounds: {
      playHoe: () => soundCalls.push('hoe'),
      playPlant: () => soundCalls.push('plant'),
      playBoneMeal: () => soundCalls.push('bone_meal'),
      playDig: (snd) => soundCalls.push(`dig_${snd}`),
      playBreak: (snd) => soundCalls.push(`break_${snd}`)
    },
    rebuildChunkMesh: () => {}
  };

  const farmingManager = new FarmingManager(fakeGame);
  fakeGame.farmingManager = farmingManager;

  const player = {
    gamemode: 'survival',
    position: new THREE.Vector3(0, 11, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    fallDistance: 0
  };

  return { world, fakeGame, farmingManager, player, droppedItems, soundCalls, particleCalls };
}

test('Farming Definitions: Blocks, Items, and Tillable tags', () => {
  // Farmland blocks
  assert.ok(BLOCKS.FARMLAND);
  assert.ok(BLOCKS.FARMLAND_MOIST);
  assert.equal(BLOCK_DEFS[BLOCKS.FARMLAND].drop, BLOCKS.DIRT);
  assert.equal(BLOCK_DEFS[BLOCKS.FARMLAND_MOIST].drop, BLOCKS.DIRT);

  // Wheat crop stages 0-7
  for (let s = 0; s <= 7; s++) {
    const id = BLOCKS[`WHEAT_STAGE_${s}`];
    assert.ok(id, `WHEAT_STAGE_${s} exists`);
    assert.equal(BLOCK_DEFS[id].crop, 'wheat');
    assert.equal(BLOCK_DEFS[id].stage, s);
    assert.equal(BLOCK_DEFS[id].plant, true);
    assert.equal(BLOCK_DEFS[id].transparent, true);
  }
  assert.equal(BLOCK_DEFS[BLOCKS.WHEAT_STAGE_7].mature, true);

  // Carrots stages 0-3
  for (let s = 0; s <= 3; s++) {
    const id = BLOCKS[`CARROTS_STAGE_${s}`];
    assert.ok(id, `CARROTS_STAGE_${s} exists`);
    assert.equal(BLOCK_DEFS[id].crop, 'carrots');
    assert.equal(BLOCK_DEFS[id].stage, s);
  }
  assert.equal(BLOCK_DEFS[BLOCKS.CARROTS_STAGE_3].mature, true);

  // Potatoes stages 0-3
  for (let s = 0; s <= 3; s++) {
    const id = BLOCKS[`POTATOES_STAGE_${s}`];
    assert.ok(id, `POTATOES_STAGE_${s} exists`);
    assert.equal(BLOCK_DEFS[id].crop, 'potatoes');
    assert.equal(BLOCK_DEFS[id].stage, s);
  }
  assert.equal(BLOCK_DEFS[BLOCKS.POTATOES_STAGE_3].mature, true);

  // Items
  assert.ok(ITEMS.wheat_seeds);
  assert.equal(ITEMS.wheat_seeds.crop, 'wheat');
  assert.equal(ITEMS.carrot.crop, 'carrots');
  assert.equal(ITEMS.potato.crop, 'potatoes');
  assert.ok(ITEMS.bone_meal);

  // Hoes
  ['wooden_hoe', 'stone_hoe', 'iron_hoe', 'golden_hoe', 'diamond_hoe', 'netherite_hoe'].forEach(h => {
    assert.ok(isHoe(h), `${h} is recognised as a hoe`);
  });
  assert.equal(isHoe('diamond_sword'), false);

  // Tillable blocks
  assert.ok(TILLABLE_BLOCKS.has(BLOCKS.GRASS));
  assert.ok(TILLABLE_BLOCKS.has(BLOCKS.DIRT));
  assert.ok(TILLABLE_BLOCKS.has(BLOCKS.PODZOL));
  assert.ok(TILLABLE_BLOCKS.has(BLOCKS.MYCELIUM));
  assert.ok(TILLABLE_BLOCKS.has(BLOCKS.MOSS_BLOCK));
  assert.equal(TILLABLE_BLOCKS.has(BLOCKS.STONE), false);
});

test('Farmland Hoeing and Water Hydration Distance (<= 4 blocks)', () => {
  const { world, farmingManager, player, soundCalls } = setupFarmingWorld();

  // Test 1: Till dry dirt with no water nearby -> FARMLAND
  world.setVoxel(0, 10, 0, BLOCKS.DIRT);
  const tilled = farmingManager.till(0, 10, 0, player);
  assert.equal(tilled, true);
  assert.equal(world.getVoxel(0, 10, 0), BLOCKS.FARMLAND);
  assert.ok(soundCalls.includes('hoe'));

  // Test 2: Cannot till with solid block directly above
  world.setVoxel(1, 10, 0, BLOCKS.DIRT);
  world.setVoxel(1, 11, 0, BLOCKS.STONE);
  assert.equal(farmingManager.till(1, 10, 0, player), false);
  assert.equal(world.getVoxel(1, 10, 0), BLOCKS.DIRT);

  // Test 3: Place water at (5, 10, 0). Distance to (1, 10, 0) is 4 blocks horizontally.
  world.setVoxel(1, 11, 0, BLOCKS.AIR);
  world.setVoxel(5, 10, 0, BLOCKS.WATER);
  assert.equal(isWaterNearby(world, 1, 10, 0), true);

  // Tilling within 4 blocks of water creates FARMLAND_MOIST
  const moistTilled = farmingManager.till(1, 10, 0, player);
  assert.equal(moistTilled, true);
  assert.equal(world.getVoxel(1, 10, 0), BLOCKS.FARMLAND_MOIST);

  // Test 4: Distance 5 blocks is beyond 4-block horizontal radius -> dry FARMLAND
  world.setVoxel(-1, 10, 0, BLOCKS.DIRT); // distance from (5, 10, 0) is 6 blocks
  assert.equal(isWaterNearby(world, -1, 10, 0), false);
  farmingManager.till(-1, 10, 0, player);
  assert.equal(world.getVoxel(-1, 10, 0), BLOCKS.FARMLAND);
});

test('Crop Planting on Farmland', () => {
  const { world, farmingManager, player, soundCalls } = setupFarmingWorld();

  world.setVoxel(0, 10, 0, BLOCKS.FARMLAND);
  world.setVoxel(1, 10, 0, BLOCKS.FARMLAND_MOIST);
  world.setVoxel(2, 10, 0, BLOCKS.DIRT); // Not farmland

  // 1. Plant wheat seeds on farmland
  const plantedWheat = farmingManager.plant(0, 10, 0, 'wheat_seeds', player);
  assert.equal(plantedWheat, true);
  assert.equal(world.getVoxel(0, 11, 0), BLOCKS.WHEAT_STAGE_0);
  assert.ok(soundCalls.includes('plant'));

  // 2. Plant carrot on moist farmland
  const plantedCarrot = farmingManager.plant(1, 10, 0, 'carrot', player);
  assert.equal(plantedCarrot, true);
  assert.equal(world.getVoxel(1, 11, 0), BLOCKS.CARROTS_STAGE_0);

  // 3. Plant potato on farmland (specifying the air block position above)
  world.setVoxel(0, 10, 1, BLOCKS.FARMLAND);
  const plantedPotato = farmingManager.plant(0, 11, 1, 'potato', player);
  assert.equal(plantedPotato, true);
  assert.equal(world.getVoxel(0, 11, 1), BLOCKS.POTATOES_STAGE_0);

  // 4. Cannot plant on non-farmland dirt
  const plantedFail = farmingManager.plant(2, 10, 0, 'wheat_seeds', player);
  assert.equal(plantedFail, false);
  assert.equal(world.getVoxel(2, 11, 0), BLOCKS.AIR);
});

test('Bone Meal Application on Crops and Grass', () => {
  const { world, farmingManager, player, soundCalls, particleCalls } = setupFarmingWorld();

  // 1. Bone meal on wheat stage 0 advances by 2-5 stages
  world.setVoxel(0, 10, 0, BLOCKS.FARMLAND);
  world.setVoxel(0, 11, 0, BLOCKS.WHEAT_STAGE_0);

  const bmWheat = farmingManager.applyBoneMeal(0, 11, 0, player);
  assert.equal(bmWheat, true);
  const newWheatVoxel = world.getVoxel(0, 11, 0);
  assert.ok(newWheatVoxel >= BLOCKS.WHEAT_STAGE_2 && newWheatVoxel <= BLOCKS.WHEAT_STAGE_7);
  assert.ok(soundCalls.includes('bone_meal'));
  assert.ok(particleCalls.length > 0);

  // 2. Bone meal on already mature wheat returns false
  world.setVoxel(0, 11, 0, BLOCKS.WHEAT_STAGE_7);
  assert.equal(farmingManager.applyBoneMeal(0, 11, 0, player), false);

  // 3. Bone meal on carrots stage 0 advances by 1-3 stages
  world.setVoxel(1, 10, 0, BLOCKS.FARMLAND);
  world.setVoxel(1, 11, 0, BLOCKS.CARROTS_STAGE_0);
  const bmCarrot = farmingManager.applyBoneMeal(1, 11, 0, player);
  assert.equal(bmCarrot, true);
  const newCarrotVoxel = world.getVoxel(1, 11, 0);
  assert.ok(newCarrotVoxel >= BLOCKS.CARROTS_STAGE_1 && newCarrotVoxel <= BLOCKS.CARROTS_STAGE_3);

  // 4. Bone meal on grass block spreads flowers
  world.setVoxel(3, 10, 3, BLOCKS.GRASS);
  const bmGrass = farmingManager.applyBoneMeal(3, 10, 3, player);
  assert.equal(bmGrass, true);
  // Check if any dandelion or poppy was placed in nearby patch
  let hasFlower = false;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const v = world.getVoxel(3 + dx, 11, 3 + dz);
      if (v === BLOCKS.DANDELION || v === BLOCKS.POPPY) {
        hasFlower = true;
      }
    }
  }
  assert.ok(hasFlower, 'Flowers sprouted on grass from bone meal');
});

test('Right-Click Harvesting and Left-Click Breaking Drops', () => {
  const { world, farmingManager, player, droppedItems } = setupFarmingWorld();

  // 1. Right-click harvest on mature wheat: drops 1 wheat + seeds, replants stage 0
  world.setVoxel(0, 10, 0, BLOCKS.FARMLAND);
  world.setVoxel(0, 11, 0, BLOCKS.WHEAT_STAGE_7);

  const harvested = farmingManager.harvest(0, 11, 0, player);
  assert.equal(harvested, true);
  assert.equal(world.getVoxel(0, 11, 0), BLOCKS.WHEAT_STAGE_0, 'Wheat replanted at stage 0');

  const wheatDrop = droppedItems.find(d => d.id === 'wheat');
  assert.ok(wheatDrop, 'Wheat dropped on harvest');
  assert.equal(wheatDrop.id, 'wheat');

  // 2. Breaking immature crop drops only 1 seed
  droppedItems.length = 0;
  world.setVoxel(2, 11, 0, BLOCKS.WHEAT_STAGE_2);
  farmingManager.handleCropBreak(2, 11, 0, BLOCKS.WHEAT_STAGE_2, 'survival');
  assert.equal(droppedItems.length, 1);
  assert.equal(droppedItems[0].id, 'wheat_seeds');
  assert.equal(droppedItems[0].count, 1);

  // 3. Breaking mature carrots drops 2-5 carrots
  droppedItems.length = 0;
  farmingManager.handleCropBreak(3, 11, 0, BLOCKS.CARROTS_STAGE_3, 'survival');
  const carrotDrops = droppedItems.filter(d => d.id === 'carrot');
  const totalCarrots = carrotDrops.reduce((acc, d) => acc + d.count, 0);
  assert.ok(totalCarrots >= 2 && totalCarrots <= 5, `Dropped 2-5 carrots (got ${totalCarrots})`);
});

test('Farmland Trampling: Landing on Farmland turns to dirt and pops crop', () => {
  const { world, farmingManager, player, droppedItems } = setupFarmingWorld();

  world.setVoxel(0, 10, 0, BLOCKS.FARMLAND);
  world.setVoxel(0, 11, 0, BLOCKS.WHEAT_STAGE_4);

  // Player lands with fall distance > 0.45
  const trampled = farmingManager.checkTrample(player, 0, 10, 0, 1.2);
  assert.equal(trampled, true);

  // Farmland is reverted to dirt
  assert.equal(world.getVoxel(0, 10, 0), BLOCKS.DIRT, 'Farmland reverted to dirt');
  // Crop is popped off to air
  assert.equal(world.getVoxel(0, 11, 0), BLOCKS.AIR, 'Crop popped off to air');
  // Dropped seeds from the popped crop
  assert.ok(droppedItems.some(d => d.id === 'wheat_seeds'));
});

test('Farming Crafting Recipes: Bone Meal and Hoes', () => {
  // 1. 1 Bone -> 3 Bone Meal (in 2x2 grid)
  const boneMealResult = findMatchingRecipe([{ id: 'bone', count: 1 }], 2, 2, RECIPES_2X2);
  assert.ok(boneMealResult, 'Bone meal recipe found');
  assert.equal(boneMealResult.id, 'bone_meal');
  assert.equal(boneMealResult.count, 3);

  // 2. Diamond Hoe (3x3 grid: 2 diamond on top + 2 sticks beneath)
  // Left facing
  const leftHoeGrid = [
    { id: 'diamond', count: 1 }, { id: 'diamond', count: 1 }, null,
    null, { id: 'stick', count: 1 }, null,
    null, { id: 'stick', count: 1 }, null
  ];
  const leftHoe = findMatchingRecipe(leftHoeGrid, 3, 3, RECIPES_3X3);
  assert.ok(leftHoe, 'Left-facing Diamond Hoe recipe matches');
  assert.equal(leftHoe.id, 'diamond_hoe');

  // Right facing
  const rightHoeGrid = [
    { id: 'diamond', count: 1 }, { id: 'diamond', count: 1 }, null,
    { id: 'stick', count: 1 }, null, null,
    { id: 'stick', count: 1 }, null, null
  ];
  const rightHoe = findMatchingRecipe(rightHoeGrid, 3, 3, RECIPES_3X3);
  assert.ok(rightHoe, 'Right-facing Diamond Hoe recipe matches');
  assert.equal(rightHoe.id, 'diamond_hoe');

  // Iron Hoe
  const ironHoeGrid = [
    { id: 'iron_ingot', count: 1 }, { id: 'iron_ingot', count: 1 }, null,
    null, { id: 'stick', count: 1 }, null,
    null, { id: 'stick', count: 1 }, null
  ];
  const ironHoe = findMatchingRecipe(ironHoeGrid, 3, 3, RECIPES_3X3);
  assert.ok(ironHoe);
  assert.equal(ironHoe.id, 'iron_hoe');

  // Stone Hoe
  const stoneHoeGrid = [
    { id: BLOCKS.COBBLESTONE, count: 1 }, { id: BLOCKS.COBBLESTONE, count: 1 }, null,
    null, { id: 'stick', count: 1 }, null,
    null, { id: 'stick', count: 1 }, null
  ];
  const stoneHoe = findMatchingRecipe(stoneHoeGrid, 3, 3, RECIPES_3X3);
  assert.ok(stoneHoe);
  assert.equal(stoneHoe.id, 'stone_hoe');
});
