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
  TILLABLE_BLOCKS,
  CROP_STAGES,
  BONE_MEAL_PLANTS,
  trampleChance,
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
  assert.ok(TILLABLE_BLOCKS.has(BLOCKS.DIRT_PATH), 'wiki: hoes till dirt paths');
  // Wiki (Hoe): "do not work on mycelium or podzol"; moss is not on the list either.
  for (const id of [BLOCKS.PODZOL, BLOCKS.MYCELIUM, BLOCKS.MOSS_BLOCK]) {
    assert.equal(TILLABLE_BLOCKS.has(id), false, `${BLOCK_DEFS[id].name} must not be tillable`);
  }
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

  // 3. Bone meal on carrots stage 0 advances, now by the wiki's 2-5 rather than 1-3
  world.setVoxel(1, 10, 0, BLOCKS.FARMLAND);
  world.setVoxel(1, 11, 0, BLOCKS.CARROTS_STAGE_0);
  const bmCarrot = farmingManager.applyBoneMeal(1, 11, 0, player);
  assert.equal(bmCarrot, true);
  const newCarrotVoxel = world.getVoxel(1, 11, 0);
  // From stage 0 an advance of 2-5 lands on stage 2 or 3 for a four-stage crop, never stage 1.
  assert.ok(newCarrotVoxel >= BLOCKS.CARROTS_STAGE_2 && newCarrotVoxel <= BLOCKS.CARROTS_STAGE_3,
    `a bone meal on carrots must advance 2-5 stages, landed on ${newCarrotVoxel}`);

  // 4. Bone meal on grass block spreads flowers
  //
  // A PATCH of grass rather than one block. The wiki's rule rolls once per candidate grass block in the
  // volume, so with a single candidate the bone meal legitimately does nothing 55% of the time and this test
  // was flaky. Five by five gives 24 candidates after the target's own column, and the chance that not one of
  // them sprouts is 0.55^24, which is negligible.
  for (let gx = 1; gx <= 5; gx++) {
    for (let gz = 1; gz <= 5; gz++) world.setVoxel(gx, 10, gz, BLOCKS.GRASS);
  }
  const bmGrass = farmingManager.applyBoneMeal(3, 10, 3, player);
  assert.equal(bmGrass, true);
  // Wiki: foliage grows in a 15x15x15 area around the targeted block, so the check spans a half-extent of 7.
  // The types include short grass as well as the two flowers, which is what the wiki lists as the possible
  // foliage; the biome rule that chooses between them is not modelled.
  let hasFoliage = false;
  for (let dx = -7; dx <= 7; dx++) {
    for (let dz = -7; dz <= 7; dz++) {
      for (let dy = -7; dy <= 7; dy++) {
        const v = world.getVoxel(3 + dx, 10 + dy + 1, 3 + dz);
        if (v === BLOCKS.DANDELION || v === BLOCKS.POPPY || v === BLOCKS.SHORT_GRASS) hasFoliage = true;
      }
    }
  }
  assert.ok(hasFoliage, 'foliage sprouted on grass from bone meal');
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

test('Beetroots grow through four stages and have their own bone meal rule', () => {
  // Wiki (Bone Meal), the fertilizer table: "Beetroots -- The plant has a 75% chance of growing to the next
  // growth stage." One stage, three times in four. It is NOT the 2-5 rule wheat, carrots and potatoes share,
  // and reading it as one was a real defect.
  const { world, farmingManager, player } = setupFarmingWorld();

  // Four stages, and only the last is mature.
  const STAGES = [BLOCKS.BEETROOTS_STAGE_0, BLOCKS.BEETROOTS_STAGE_1, BLOCKS.BEETROOTS_STAGE_2, BLOCKS.BEETROOTS_STAGE_3];
  for (const [index, id] of STAGES.entries()) {
    const info = getCropInfo(id);
    assert.ok(info, `stage ${index} must be a crop`);
    assert.equal(info.type, 'beetroots');
    assert.equal(info.stage, index);
    assert.equal(info.maxStage, 3);
    assert.equal(info.isMature, index === 3, `only the last stage is mature (stage ${index})`);
  }
  // The stage ids are deliberately NOT a contiguous run -- the earlier stages were appended above the block
  // id maximum so that no existing id had to move -- so the stage table, not arithmetic, is the source.
  assert.deepEqual(CROP_STAGES.beetroots, STAGES);
  assert.notEqual(STAGES[2] + 1, STAGES[3], 'the last stage is not the next id after the third, which is why the table exists');

  // A bone meal advances exactly ONE stage, and only about 75% of the time. A miss still spends the item.
  let advanced = 0;
  const seen = new Set();
  const TRIES = 4000;
  for (let i = 0; i < TRIES; i++) {
    world.setVoxel(5, 10, 5, BLOCKS.FARMLAND);
    world.setVoxel(5, 11, 5, BLOCKS.BEETROOTS_STAGE_0);
    assert.equal(farmingManager.applyBoneMeal(5, 10, 5, player), true,
      'a beetroot bone meal reports success whether or not the plant grew');
    const stage = getCropInfo(world.getVoxel(5, 11, 5)).stage;
    seen.add(stage);
    if (stage > 0) advanced++;
  }
  const rate = advanced / TRIES;
  assert.ok(rate > 0.68 && rate < 0.82,
    `expected roughly a 75% advance rate, got ${(rate * 100).toFixed(1)}% over ${TRIES}`);
  assert.deepEqual([...seen].sort((a, b) => a - b), [0, 1],
    'from stage 0 the only reachable stage is 1 -- never two or more, which is what the 2-5 rule would do');
});

test('The other plants in the wiki fertilizer table can be bone-mealed', () => {
  // Wiki (Bone Meal): "Short Grass / Fern / Seagrass -- a one-block-high ... grows into a two-block-high
  // tall grass, large fern, or tall seagrass", and "Sunflower / Lilac / Rose Bush / Peony -- The
  // corresponding item form drops, without destroying the original plant".
  const { world, farmingManager, player, droppedItems } = setupFarmingWorld();

  for (const [from, to, label] of [
    [BLOCKS.SHORT_GRASS, BLOCKS.TALL_GRASS, 'short grass -> tall grass'],
    [BLOCKS.FERN, BLOCKS.LARGE_FERN, 'fern -> large fern'],
    [BLOCKS.SEAGRASS, BLOCKS.TALL_SEAGRASS, 'seagrass -> tall seagrass'],
  ]) {
    world.setVoxel(6, 10, 6, from);
    assert.equal(farmingManager.applyBoneMeal(6, 10, 6, player), true, label);
    assert.equal(world.getVoxel(6, 10, 6), to, label);
  }

  for (const [id, label] of [[BLOCKS.LILAC, 'lilac'], [BLOCKS.PEONY, 'peony'], [BLOCKS.ROSE_BUSH, 'rose bush']]) {
    droppedItems.length = 0;
    world.setVoxel(7, 10, 7, id);
    assert.equal(farmingManager.applyBoneMeal(7, 10, 7, player), true, label);
    assert.equal(world.getVoxel(7, 10, 7), id, `${label} must survive the bone meal`);
    assert.equal(droppedItems.length, 1, `${label} should drop one item`);
    assert.equal(droppedItems[0].id, id, `${label} drops its own item form`);
  }

  // Sugar cane and nether wart are the two the wiki's "Bone meal does not affect" list names, so they must
  // stay inert. Their absence from the table IS the behaviour.
  for (const [id, label] of [[BLOCKS.SUGAR_CANE, 'sugar cane'], [BLOCKS.NETHER_WART, 'nether wart']]) {
    assert.equal(BONE_MEAL_PLANTS[id], undefined, `${label} must not be bone-mealable`);
    world.setVoxel(8, 10, 8, id);
    assert.equal(farmingManager.applyBoneMeal(8, 10, 8, player), false, `${label} bone meal must be refused`);
    assert.equal(world.getVoxel(8, 10, 8), id, `${label} is unchanged`);
  }
});

test('Farmland Trampling: Landing on Farmland turns to dirt and pops crop', () => {
  const { world, farmingManager, player, droppedItems } = setupFarmingWorld();

  world.setVoxel(0, 10, 0, BLOCKS.FARMLAND);
  world.setVoxel(0, 11, 0, BLOCKS.WHEAT_STAGE_4);

  // Pin the dice: a 1.2 fall is a 70% roll, and this case is about what happens when it lands.
  farmingManager.random = () => 0;
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





// ---------------------------------------------------------------------------------------------------
// Wiki-parity gaps found by driving the bot against minecraft.wiki (Farmland, Hoe, Wheat pages).
// ---------------------------------------------------------------------------------------------------

test('Hoe: tills dirt paths, refuses podzol / mycelium / moss, and spends 1 durability', () => {
  const { world, farmingManager, fakeGame, player } = setupFarmingWorld();
  const hoe = { id: 'iron_hoe', count: 1 };
  fakeGame.inventory = { getActiveItem: () => hoe, consumeActiveItem() {} };

  world.setVoxel(0, 10, 0, BLOCKS.DIRT_PATH);
  assert.equal(farmingManager.till(0, 10, 0, player), true, 'dirt path becomes farmland');
  assert.equal(world.getVoxel(0, 10, 0), BLOCKS.FARMLAND);
  assert.equal(hoe.durability, hoe.maxDurability - 1, 'one tilling costs exactly 1 durability');

  for (const id of [BLOCKS.PODZOL, BLOCKS.MYCELIUM, BLOCKS.MOSS_BLOCK]) {
    world.setVoxel(2, 10, 2, id);
    assert.equal(farmingManager.till(2, 10, 2, player), false);
    assert.equal(world.getVoxel(2, 10, 2), id, 'the block is untouched');
  }
  assert.equal(hoe.durability, hoe.maxDurability - 1, 'a refused tilling costs nothing');

  // Creative mode never wears the tool.
  const creativeHoe = { id: 'iron_hoe', count: 1 };
  fakeGame.inventory.getActiveItem = () => creativeHoe;
  world.setVoxel(3, 10, 3, BLOCKS.DIRT);
  assert.equal(farmingManager.till(3, 10, 3, { ...player, gamemode: 'creative' }), true);
  assert.equal(creativeHoe.durability, undefined);
});

test('Trampling: chance is fall distance - 0.5, walking and held jump never trample', () => {
  const { world, farmingManager, player } = setupFarmingWorld();
  assert.equal(trampleChance(0), 0);
  assert.equal(trampleChance(0.5), 0);
  assert.equal(trampleChance(1.25), 0.75);
  assert.equal(trampleChance(9), 1);

  const farm = () => {
    world.setVoxel(0, 10, 0, BLOCKS.FARMLAND);
    farmingManager.registerFarmland(0, 10, 0);
  };

  // Holding Space on the farmland (the old rule) must not trample with no fall.
  farm();
  farmingManager.random = () => 0;
  assert.equal(farmingManager.checkTrample({ ...player, keys: { Space: true } }, 0, 10, 0, 0), false);
  assert.equal(world.getVoxel(0, 10, 0), BLOCKS.FARMLAND);

  // A 0.5 fall is a 0% chance even on the luckiest roll.
  assert.equal(farmingManager.checkTrample(player, 0, 10, 0, 0.5), false);

  // A 1.25 fall is 75%: a roll of 0.74 tramples, 0.76 does not.
  farmingManager.random = () => 0.76;
  assert.equal(farmingManager.checkTrample(player, 0, 10, 0, 1.25), false);
  assert.equal(world.getVoxel(0, 10, 0), BLOCKS.FARMLAND);
  farmingManager.random = () => 0.74;
  assert.equal(farmingManager.checkTrample(player, 0, 10, 0, 1.25), true);
  assert.equal(world.getVoxel(0, 10, 0), BLOCKS.DIRT);
});

test('Farmland under a solid block reverts to dirt; a crop on top does not', () => {
  const { world, farmingManager } = setupFarmingWorld();
  world.setVoxel(0, 10, 0, BLOCKS.FARMLAND_MOIST);
  world.setVoxel(2, 10, 0, BLOCKS.FARMLAND_MOIST);
  world.setVoxel(2, 11, 0, BLOCKS.WHEAT_STAGE_0);
  farmingManager.registerFarmland(0, 10, 0);
  farmingManager.registerFarmland(2, 10, 0);
  world.setVoxel(0, 11, 0, BLOCKS.STONE); // wiki: pumpkins, melons, trees growing over it
  world.setVoxel(1, 10, 1, BLOCKS.WATER);

  farmingManager.tickTimer = 99;
  farmingManager.update(0, null);
  assert.equal(world.getVoxel(0, 10, 0), BLOCKS.DIRT, 'covered farmland becomes dirt');
  assert.notEqual(world.getVoxel(2, 10, 0), BLOCKS.DIRT, 'a crop is not a solid cover');
});

test('Rain hydrates exposed farmland but not farmland under a roof', () => {
  const { world, farmingManager, fakeGame } = setupFarmingWorld();
  // setupFarmingWorld leaves the ground at y=10 and nothing above it, apart from the roof we place.
  world.setVoxel(0, 10, 0, BLOCKS.FARMLAND);
  world.setVoxel(8, 10, 0, BLOCKS.FARMLAND); // 8 away: no water in range either way
  world.setVoxel(8, 13, 0, BLOCKS.STONE); // roof, three blocks up
  farmingManager.registerFarmland(0, 10, 0);
  farmingManager.registerFarmland(8, 10, 0);

  fakeGame.weather = { weatherType: 'clear' };
  assert.equal(isWaterNearby(world, 0, 10, 0, fakeGame), false);

  fakeGame.weather = { weatherType: 'rain' };
  assert.equal(isWaterNearby(world, 0, 10, 0, fakeGame), true, 'rain hydrates open-sky farmland');
  assert.equal(isWaterNearby(world, 8, 10, 0, fakeGame), false, 'a roof keeps the rain off');

  farmingManager.tickTimer = 99;
  farmingManager.update(0, null);
  assert.equal(world.getVoxel(0, 10, 0), BLOCKS.FARMLAND_MOIST);
  assert.equal(world.getVoxel(8, 10, 0), BLOCKS.FARMLAND);
});

test('Crops do not grow below light level 9', () => {
  const { world, farmingManager } = setupFarmingWorld();
  world.setVoxel(0, 10, 0, BLOCKS.FARMLAND_MOIST);
  world.setVoxel(0, 11, 0, BLOCKS.WHEAT_STAGE_0);
  farmingManager.registerFarmland(0, 10, 0);
  farmingManager.registerCrop(0, 11, 0);
  farmingManager.random = () => 0; // always passes the growth roll

  let light = 8;
  world.getLightLevel = () => light;
  farmingManager.tickTimer = 99;
  farmingManager.update(0, null);
  assert.equal(world.getVoxel(0, 11, 0), BLOCKS.WHEAT_STAGE_0, 'light 8 is too dark');

  light = 9;
  farmingManager.tickTimer = 99;
  farmingManager.update(0, null);
  assert.equal(world.getVoxel(0, 11, 0), BLOCKS.WHEAT_STAGE_1, 'light 9 grows');
});

test('Mature wheat drops 1 wheat and 1-4 seeds (wiki mean 2 5/7); immature drops one seed', () => {
  const { farmingManager, droppedItems } = setupFarmingWorld();
  const seen = new Set();
  let total = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    droppedItems.length = 0;
    farmingManager.spawnCropDrops(0, 11, 0, getCropInfo(BLOCKS.WHEAT_STAGE_7), false);
    const seeds = droppedItems.filter(d => d.id === 'wheat_seeds').length;
    assert.equal(droppedItems.filter(d => d.id === 'wheat').length, 1);
    seen.add(seeds);
    total += seeds;
  }
  assert.ok(seen.has(1) && seen.has(4), 'both 1 and 4 seeds occur');
  assert.ok(!seen.has(0) && !seen.has(5), 'never fewer than 1 or more than 4');
  assert.ok(Math.abs(total / N - 19 / 7) < 0.15, `mean seeds ${total / N} should be near 2.71`);

  droppedItems.length = 0;
  farmingManager.spawnCropDrops(0, 11, 0, getCropInfo(BLOCKS.WHEAT_STAGE_3), false);
  assert.deepEqual(droppedItems.map(d => d.id), ['wheat_seeds']);
});
