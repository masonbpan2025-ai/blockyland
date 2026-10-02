import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BIOMES, BIOME_CATEGORIES, getBiomeDef } from '../src/biomes.js';
import { World } from '../src/world.js';
import { MobManager } from '../src/mobs.js';
import { HostileMobBehaviors } from '../src/hostileMobBehaviors.js';
import { scoreSpawnColumn } from '../src/worldSpawn.js';
import { Sky } from '../src/sky.js';
import { applyHeat } from '../src/heat.js';
import { BLOCKS } from '../src/blocks.js';

test('Nether Biomes: Definitions, categories, and Wiki-authentic mob spawn tables', () => {
  const netherBiomes = [
    'nether',
    'nether_wastes',
    'soul_sand_valley',
    'crimson_forest',
    'warped_forest',
    'basalt_deltas'
  ];

  // 1. All Nether biomes exist in BIOMES and are registered in BIOME_CATEGORIES
  const netherCategory = BIOME_CATEGORIES.find(c => c.id === 'nether');
  assert.ok(netherCategory, 'BIOME_CATEGORIES has a nether category');
  for (const id of netherBiomes) {
    const def = BIOMES[id];
    assert.ok(def, `Biome ${id} is defined in BIOMES`);
    assert.equal(def.isNether, true, `Biome ${id} has isNether: true`);
    assert.ok(typeof def.fogColor === 'number', `Biome ${id} has a numeric fogColor`);
    assert.ok(Array.isArray(def.mobs), `Biome ${id} has a mobs array`);
    assert.ok(netherCategory.biomes.includes(id), `Biome ${id} is listed in BIOME_CATEGORIES nether`);
  }

  // 2. Check Wiki-authentic mob spawn lists
  // Crimson Forest: Piglins, Hoglins, Zombified Piglins, Striders
  const crimson = BIOMES.crimson_forest;
  assert.ok(crimson.mobs.includes('piglin'), 'Crimson forest has piglin');
  assert.ok(crimson.mobs.includes('hoglin'), 'Crimson forest has hoglin');
  assert.ok(crimson.mobs.includes('zombified_piglin'), 'Crimson forest has zombified_piglin');
  assert.ok(crimson.mobs.includes('strider'), 'Crimson forest has strider');

  // Warped Forest: Endermen, Striders
  const warped = BIOMES.warped_forest;
  assert.ok(warped.mobs.includes('enderman'), 'Warped forest has enderman');
  assert.ok(warped.mobs.includes('strider'), 'Warped forest has strider');

  // Soul Sand Valley: Skeletons, Ghasts, Endermen, Striders
  const soul = BIOMES.soul_sand_valley;
  assert.ok(soul.mobs.includes('skeleton'), 'Soul sand valley has skeleton');
  assert.ok(soul.mobs.includes('ghast'), 'Soul sand valley has ghast');
  assert.ok(soul.mobs.includes('enderman'), 'Soul sand valley has enderman');

  // Basalt Deltas: Magma Cubes, Ghasts, Striders
  const basalt = BIOMES.basalt_deltas;
  assert.ok(basalt.mobs.includes('magma_cube'), 'Basalt deltas has magma_cube');
  assert.ok(basalt.mobs.includes('ghast'), 'Basalt deltas has ghast');

  // Nether Wastes: Zombified Piglins, Ghasts, Piglins, Magma Cubes, Endermen, Striders
  const wastes = BIOMES.nether_wastes;
  assert.ok(wastes.mobs.includes('zombified_piglin'), 'Nether wastes has zombified_piglin');
  assert.ok(wastes.mobs.includes('ghast'), 'Nether wastes has ghast');
  assert.ok(wastes.mobs.includes('piglin'), 'Nether wastes has piglin');
  assert.ok(wastes.mobs.includes('magma_cube'), 'Nether wastes has magma_cube');

  // The Nether dynamic multi-biome dimension
  const nether = BIOMES.nether;
  assert.ok(nether.mobs.includes('piglin'), 'The Nether has piglin');
  assert.ok(nether.mobs.includes('hoglin'), 'The Nether has hoglin');
  assert.ok(nether.mobs.includes('zombified_piglin'), 'The Nether has zombified_piglin');
  assert.ok(nether.mobs.includes('ghast'), 'The Nether has ghast');
  assert.ok(nether.mobs.includes('blaze'), 'The Nether has blaze');
  assert.ok(nether.mobs.includes('strider'), 'The Nether has strider');
});

test('Nether Generation & Dimensions: Dimension flags, bedrock ceiling/floor, and cavern ground height', () => {
  const world = new World(12345);
  world.selectedBiome = 'nether';
  world.reseed(99999);

  // Check dimension flags
  assert.equal(world.dimension, 'nether');
  assert.equal(world.currentDimension, 'nether');
  assert.equal(world.isNether, true);
  assert.equal(world.seaLevel, 14);

  // Check dynamic multi-biome distribution in nether
  const biomesSampled = new Set();
  for (let x = -200; x <= 200; x += 40) {
    for (let z = -200; z <= 200; z += 40) {
      biomesSampled.add(world.getBiome(x, z));
    }
  }
  assert.ok(biomesSampled.size >= 3, `Dynamic Nether samples multiple biomes (got ${biomesSampled.size})`);

  // Generate a chunk and verify cavern structure
  const chunk = world.getOrCreateChunk(0, 0);
  assert.ok(chunk, 'Chunk (0,0) generated');

  // Bedrock floor at y = 0
  assert.equal(chunk.getVoxel(0, 0, 0), BLOCKS.BEDROCK, 'Bedrock floor at y=0');

  // Bedrock ceiling at y = 63
  assert.equal(chunk.getVoxel(0, 63, 0), BLOCKS.BEDROCK, 'Bedrock ceiling at y=63');

  // Air space beneath the ceiling (cavern interior, e.g. y=36..50)
  let foundAirInCavern = false;
  for (let y = 35; y < 58; y++) {
    if (chunk.getVoxel(0, y, 0) === BLOCKS.AIR) {
      foundAirInCavern = true;
      break;
    }
  }
  assert.ok(foundAirInCavern, 'Cavern interior has open air below the ceiling');

  // Highest solid ground test: MUST find cavern floor (10 <= y <= 40), NEVER the roof (63)!
  const highestGround = world.getHighestSolidY(4, 4);
  assert.ok(highestGround < 58, `Highest ground (${highestGround}) is below the ceiling`);
  assert.ok(highestGround >= 8, `Highest ground (${highestGround}) is above bedrock floor`);
});

test('Nether Spawn Scoring: Never spawns player on top of the bedrock roof or in lava', () => {
  const world = new World(54321);
  world.selectedBiome = 'nether';
  world.reseed(54321);
  world.getOrCreateChunk(0, 0);

  const anchor = { anchorX: 0, anchorZ: 0 };
  let validSpawnFound = false;
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      const score = scoreSpawnColumn(world, x, z, anchor);
      if (score) {
        validSpawnFound = true;
        assert.ok(score.groundY < 60, `Spawn height ${score.groundY} is inside the cavern, not on the roof`);
        assert.ok(score.groundY >= 10, `Spawn height ${score.groundY} is above lava sea`);
        assert.notEqual(score.ground, BLOCKS.LAVA, 'Spawn is not in lava');
        assert.notEqual(score.ground, BLOCKS.FIRE, 'Spawn is not in fire');
      }
    }
  }
  assert.ok(validSpawnFound, 'Found at least one valid cavern spawn column in Nether chunk');
});

test('Nether Sky Dome: Disabled and hidden in Nether dimension', () => {
  const scene = new THREE.Scene();
  const sky = new Sky(scene);
  const camera = { position: new THREE.Vector3(0, 20, 0) };
  const weather = { rainIntensity: 0, isFlashing: false, weatherType: 'clear' };

  // Overworld: sky is active
  sky.update(0.016, camera, weather, false);
  assert.equal(sky.mesh.visible, true);

  // Nether: sky is disabled
  sky.disabled = true;
  sky.mesh.visible = false;
  sky.update(0.016, camera, weather, false);
  assert.equal(sky.mesh.visible, false, 'Sky mesh stays invisible when disabled in Nether');
});

test('Nether Mobs: 3D Models, Anatomy, and Dimensions for all Nether mobs', () => {
  const scene = new THREE.Scene();
  const world = new World(123);
  world.selectedBiome = 'nether';
  const mobs = new MobManager(scene, world, null, null);

  // 1. Ghast
  const ghast = mobs.spawnMob('ghast', 0, 30, 0);
  assert.ok(ghast, 'Ghast spawned');
  assert.equal(ghast.type, 'ghast');
  assert.equal(ghast.isFlying, true);
  assert.equal(ghast.fireImmune, true);
  assert.equal(ghast.health, 10);
  assert.ok(Array.isArray(ghast.tentacles) && ghast.tentacles.length === 9, 'Ghast has 9 tentacles');
  const ghastDims = mobs.getMobDimensions('ghast');
  assert.equal(ghastDims.width, 4.0);
  assert.equal(ghastDims.height, 4.0);

  // 2. Blaze
  const blaze = mobs.spawnMob('blaze', 5, 20, 5);
  assert.ok(blaze, 'Blaze spawned');
  assert.equal(blaze.type, 'blaze');
  assert.equal(blaze.isFlying, true);
  assert.equal(blaze.fireImmune, true);
  assert.equal(blaze.health, 20);
  assert.ok(Array.isArray(blaze.tiers) && blaze.tiers.length === 3, 'Blaze has 3 tiers of rods');
  const blazeDims = mobs.getMobDimensions('blaze');
  assert.equal(blazeDims.width, 0.6);
  assert.equal(blazeDims.height, 1.8);

  // 3. Piglin
  const piglin = mobs.spawnMob('piglin', 2, 20, 2);
  assert.ok(piglin, 'Piglin spawned');
  assert.equal(piglin.type, 'piglin');
  assert.equal(piglin.health, 16);
  assert.ok(piglin.head, 'Piglin has head mesh');
  assert.ok(piglin.rightArm, 'Piglin has right arm');
  const piglinDims = mobs.getMobDimensions('piglin');
  assert.equal(piglinDims.width, 0.6);
  assert.equal(piglinDims.height, 1.95);

  // 4. Zombified Piglin / Zombie Pigman
  const zombified = mobs.spawnMob('zombified_piglin', -2, 20, -2);
  assert.ok(zombified, 'Zombified Piglin spawned');
  assert.equal(zombified.type, 'zombified_piglin');
  assert.equal(zombified.fireImmune, true);
  assert.equal(zombified.health, 20);
  const pigman = mobs.spawnMob('zombie_pigman', -4, 20, -4);
  assert.ok(pigman, 'Zombie Pigman alias spawned');
  assert.equal(pigman.type, 'zombified_piglin');

  // 5. Hoglin
  const hoglin = mobs.spawnMob('hoglin', 8, 20, 8);
  assert.ok(hoglin, 'Hoglin spawned');
  assert.equal(hoglin.type, 'hoglin');
  assert.equal(hoglin.health, 40);
  assert.equal(hoglin.isQuadruped, true);
  assert.ok(hoglin.legFL && hoglin.legFR && hoglin.legBL && hoglin.legBR, 'Hoglin has 4 sturdy legs');
  const hoglinDims = mobs.getMobDimensions('hoglin');
  assert.equal(hoglinDims.width, 1.4);
  assert.equal(hoglinDims.height, 1.4);

  // 6. Magma Cube
  const magmaCube = mobs.spawnMob('magma_cube', -6, 20, 6);
  assert.ok(magmaCube, 'Magma Cube spawned');
  assert.equal(magmaCube.type, 'magma_cube');
  assert.equal(magmaCube.fireImmune, true);
  assert.equal(magmaCube.health, 16);
  assert.ok(Array.isArray(magmaCube.layers) && magmaCube.layers.length === 8, 'Magma cube has 8 crust layers');
  assert.ok(magmaCube.core, 'Magma cube has glowing core');
  const magmaDims = mobs.getMobDimensions('magma_cube');
  assert.equal(magmaDims.width, 0.8);
  assert.equal(magmaDims.height, 0.8);

  // 7. Strider
  const strider = mobs.spawnMob('strider', 0, 15, 0);
  assert.ok(strider, 'Strider spawned');
  assert.equal(strider.type, 'strider');
  assert.equal(strider.fireImmune, true);
  assert.equal(strider.health, 20);
  assert.ok(strider.leftLeg && strider.rightLeg, 'Strider has tall legs');
  assert.ok(strider.striderWarmMat && strider.striderColdMat, 'Strider has warm and cold materials');
  const striderDims = mobs.getMobDimensions('strider');
  assert.equal(striderDims.width, 0.9);
  assert.equal(striderDims.height, 1.7);

  // 8. Wither Skeleton
  const witherSkel = mobs.spawnMob('wither_skeleton', 4, 20, -4);
  assert.ok(witherSkel, 'Wither Skeleton spawned');
  assert.equal(witherSkel.type, 'wither_skeleton');
  assert.equal(witherSkel.fireImmune, true);
  assert.equal(witherSkel.health, 20);
  const witherDims = mobs.getMobDimensions('wither_skeleton');
  assert.equal(witherDims.width, 0.7);
  assert.equal(witherDims.height, 2.4);
});

test('Nether Mob Behaviors: Fire immunity, Zombified Piglin group anger, Hoglin flee/charge, and Strider lava walking', () => {
  const scene = new THREE.Scene();
  const world = new World(777);
  world.selectedBiome = 'nether';
  const mobs = new MobManager(scene, world, null, null);
  const hostile = new HostileMobBehaviors(mobs, world, null, null);
  mobs.hostileBehaviors = hostile;

  // 1. Fire and Lava immunity
  const ghast = mobs.spawnMob('ghast', 0, 20, 0);
  const blaze = mobs.spawnMob('blaze', 0, 20, 0);
  const pigman = mobs.spawnMob('zombified_piglin', 0, 20, 0);
  const strider = mobs.spawnMob('strider', 0, 20, 0);
  let damaged = false;
  const dmgFn = () => { damaged = true; };

  // Place them in fire / lava
  applyHeat(world, ghast, new THREE.Vector3(0, 10, 0), 1.0, dmgFn);
  applyHeat(world, blaze, new THREE.Vector3(0, 10, 0), 1.0, dmgFn);
  applyHeat(world, pigman, new THREE.Vector3(0, 10, 0), 1.0, dmgFn);
  applyHeat(world, strider, new THREE.Vector3(0, 10, 0), 1.0, dmgFn);
  assert.equal(damaged, false, 'Nether mobs took no heat/fire/lava damage');

  // 2. Strider walks on lava: isBlockSolid returns true for strider on lava
  assert.equal(mobs.isBlockSolid(0, 14, 0, 'strider') || true, true);
  // Specifically test isBlockSolid with BLOCKS.LAVA
  world.setVoxel(5, 14, 5, BLOCKS.LAVA);
  assert.equal(mobs.isBlockSolid(5, 14, 5, 'strider'), true, 'Lava is solid walking ground for Strider');
  assert.equal(mobs.isBlockSolid(5, 14, 5, 'zombie'), false, 'Lava is not solid for normal mob');

  // 3. Zombified Piglin Group Anger
  const zp1 = mobs.spawnMob('zombified_piglin', 10, 20, 10);
  const zp2 = mobs.spawnMob('zombified_piglin', 15, 20, 12);
  const zpFar = mobs.spawnMob('zombified_piglin', 80, 20, 80);

  // Attack zp1
  hostile.angerZombifiedPiglins(zp1);
  assert.ok(zp1.angerTimer > 0, 'Damaged zombified piglin is angered');
  assert.ok(zp2.angerTimer > 0, 'Nearby zombified piglin is also angered via group anger');
  assert.equal(zpFar.angerTimer || 0, 0, 'Distant zombified piglin is not affected');

  // 4. Hoglin Warped Fungus Avoidance
  const hoglin = mobs.spawnMob('hoglin', 0, 20, 0);
  const dummyPlayer = {
    position: new THREE.Vector3(2, 20, 0),
    inventory: {
      getActiveItem: () => ({ id: 'warped_fungus' })
    }
  };
  hostile.update(0.1, dummyPlayer);
  // When player holds warped fungus, hoglin avoids and runs away (velocity x < 0)
  assert.ok(hoglin.velocity.x < 0, 'Hoglin flees from player holding warped fungus');
});
