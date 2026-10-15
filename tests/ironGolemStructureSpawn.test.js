import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS } from '../src/blocks.js';
import { moveGroundMob, checkGroundSupport, findSafeMobSpawnPosition } from '../src/mobMotion.js';

function createMockWorld(voxels = {}) {
  // voxels map: "x,y,z" => blockId
  return {
    getVoxel(x, y, z) {
      return voxels[`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`] || BLOCKS.AIR;
    },
    isBlockSolid(x, y, z) {
      const v = this.getVoxel(x, y, z);
      return v !== BLOCKS.AIR && v !== BLOCKS.WATER && v !== BLOCKS.FIRE && v !== BLOCKS.LAVA;
    }
  };
}

function createManager(world) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world,
    scene,
    sounds,
    mobs: [],
    arrows: [],
    customProjectiles: [],
    textures: { iron_golem: new THREE.Texture() },
    isBlockSolid(x, y, z) {
      return world.isBlockSolid(x, y, z);
    }
  });
  return manager;
}

test('checkGroundSupport correctly identifies solid footing vs hanging in mid-air', () => {
  // Flat ground at y = 0
  const voxels = {};
  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      voxels[`${x},0,${z}`] = BLOCKS.STONE;
    }
  }
  const world = createMockWorld(voxels);
  const manager = createManager(world);
  const golem = { type: 'iron_golem', width: 1.4, height: 2.7 };

  // Standing on ground at y = 1.0
  assert.equal(checkGroundSupport(manager, golem, new THREE.Vector3(0, 1.0, 0)), true);

  // Floating in mid-air at y = 5.0
  assert.equal(checkGroundSupport(manager, golem, new THREE.Vector3(0, 5.0, 0)), false);

  // Single-block pillar at (0, 0..3, 0). Top of pillar is at y = 4 (block y=3).
  const pillarVoxels = {
    '0,0,0': BLOCKS.STONE,
    '0,1,0': BLOCKS.STONE,
    '0,2,0': BLOCKS.STONE,
    '0,3,0': BLOCKS.STONE
  };
  const pillarWorld = createMockWorld(pillarVoxels);
  const pillarManager = createManager(pillarWorld);

  // Golem centered on pillar at y = 4.0: center is supported
  assert.equal(checkGroundSupport(pillarManager, golem, new THREE.Vector3(0.5, 4.0, 0.5)), true);

  // Golem hanging mostly over air (x = 1.6, while pillar is at x=0): center is air, inner sample points are air
  assert.equal(checkGroundSupport(pillarManager, golem, new THREE.Vector3(1.6, 4.0, 0.5)), false);
});

test('falling iron golem grazing a pillar corner does not float in mid-air', () => {
  // Ground is at y = 0.
  // A narrow 1-block pillar stands at x = 0, z = 0 up to y = 3 (block 3, top y=4.0).
  const voxels = {};
  for (let x = -6; x <= 6; x++) {
    for (let z = -6; z <= 6; z++) {
      voxels[`${x},0,${z}`] = BLOCKS.SAND;
    }
  }
  voxels['0,1,0'] = BLOCKS.SANDSTONE;
  voxels['0,2,0'] = BLOCKS.SANDSTONE;
  voxels['0,3,0'] = BLOCKS.SANDSTONE;

  const world = createMockWorld(voxels);
  const manager = createManager(world);

  const group = new THREE.Group();
  // Place golem at x = 1.1, z = 0.5, y = 4.2 (right beside pillar top, mostly over air)
  group.position.set(1.1, 4.2, 0.5);
  const golem = {
    type: 'iron_golem',
    name: 'Iron Golem',
    width: 1.4,
    height: 2.7,
    mesh: group,
    velocity: new THREE.Vector3(0, -2, 0),
    yaw: 0,
    health: 100
  };

  // Simulate multiple physics frames
  for (let frame = 0; frame < 60; frame++) {
    moveGroundMob(manager, golem, 0.05);
  }

  // The golem must NOT remain stuck at the pillar top (y around 4.0);
  // It must fall past the pillar edge and land on the ground at y = 1.0!
  assert.ok(golem.mesh.position.y < 2.0, `golem should have fallen to ground, but is at y=${golem.mesh.position.y}`);
  assert.equal(golem.onGround, true, 'golem should be grounded on the actual ground');
  assert.ok(Math.abs(golem.mesh.position.y - 1.0) < 0.1, `golem should be standing on ground level 1.0, got ${golem.mesh.position.y}`);
});

test('findSafeMobSpawnPosition frees mob from wall/pillar obstruction to nearby clear ground', () => {
  // Desert well structure: ground at y = 10.
  // Pillar at (7, 10..13, 3).
  const voxels = {};
  for (let x = 0; x <= 15; x++) {
    for (let z = 0; z <= 15; z++) {
      voxels[`${x},10,${z}`] = BLOCKS.SAND;
    }
  }
  // Pillar at (7, 11..13, 3)
  voxels['7,11,3'] = BLOCKS.SANDSTONE;
  voxels['7,12,3'] = BLOCKS.SANDSTONE;
  voxels['7,13,3'] = BLOCKS.SANDSTONE;

  const world = createMockWorld(voxels);
  const manager = createManager(world);

  // Initial requested spawn overlaps the pillar at (7.8, 11, 2.8)
  const initialX = 7.8, initialY = 11.0, initialZ = 2.8;
  const safe = findSafeMobSpawnPosition(world, manager, 'iron_golem', initialX, initialY, initialZ);

  assert.ok(safe, 'findSafeMobSpawnPosition should return a safe position');
  // Check that safe position does NOT collide with the pillar
  const col = manager.checkMobCollision({ type: 'iron_golem', width: 1.4, height: 2.7 }, safe);
  assert.equal(col, false, 'safe position must have zero collision');
  // Must stand on the ground floor at y = 11.01
  assert.ok(Math.abs(safe.y - 11.01) < 0.05, `expected spawn at ground y=11.01, got ${safe.y}`);
  // Must have ground support
  assert.equal(checkGroundSupport(manager, { type: 'iron_golem', width: 1.4, height: 2.7 }, safe), true);
});

test('findSafeMobSpawnPosition prevents mob from spawning buried inside stone/dirt hill', () => {
  // Village base is at y = 15, but a hill rises to y = 20 at (x=10, z=5)
  const voxels = {};
  for (let x = 0; x <= 20; x++) {
    for (let z = 0; z <= 20; z++) {
      // Base ground at y = 15
      for (let y = 1; y <= 15; y++) voxels[`${x},${y},${z}`] = BLOCKS.STONE;
    }
  }
  // Hill at (10, 5) rises to y = 20
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let y = 16; y <= 20; y++) {
        voxels[`${10 + dx},${y},${5 + dz}`] = BLOCKS.DIRT;
      }
    }
  }

  const world = createMockWorld(voxels);
  const manager = createManager(world);

  // If a piece requests spawn at the village baseY + 1 (y = 16), it would be inside the hill!
  const safe = findSafeMobSpawnPosition(world, manager, 'iron_golem', 10.5, 16.0, 5.5);

  assert.ok(safe, 'findSafeMobSpawnPosition should return safe position');
  // Must be placed on TOP of the hill (y = 21.01), not buried inside y = 16..20!
  assert.ok(safe.y >= 21.0, `expected spawn on top of hill (>= 21), got y=${safe.y}`);
  const col = manager.checkMobCollision({ type: 'iron_golem', width: 1.4, height: 2.7 }, safe);
  assert.equal(col, false, 'mob must not collide with dirt/stone blocks');
  assert.equal(checkGroundSupport(manager, { type: 'iron_golem', width: 1.4, height: 2.7 }, safe), true);
});

test('moveGroundMob unstucks a mob embedded in a hill onto open surface', () => {
  // World with stone ground up to y = 5
  const voxels = {};
  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      for (let y = 0; y <= 5; y++) {
        voxels[`${x},${y},${z}`] = BLOCKS.STONE;
      }
    }
  }
  const world = createMockWorld(voxels);
  const manager = createManager(world);

  const group = new THREE.Group();
  // Spawn embedded inside stone at y = 2.0
  group.position.set(0, 2.0, 0);
  const golem = {
    type: 'iron_golem',
    name: 'Iron Golem',
    width: 1.4,
    height: 2.7,
    mesh: group,
    velocity: new THREE.Vector3(),
    yaw: 0,
    health: 100
  };

  moveGroundMob(manager, golem, 0.05);

  // Golem must be freed to the surface (y >= 5.95)
  assert.ok(golem.mesh.position.y >= 5.95, `golem should be lifted to surface y >= 5.95, got ${golem.mesh.position.y}`);
  const col = manager.checkMobCollision(golem, golem.mesh.position);
  assert.equal(col, false, 'golem must not collide with stone blocks after unstuck');
});

test('iron golem does not get trapped in endless 90-degree turning loop near structure', () => {
  // Setup ground at y = 0 with a 2-block structure wall nearby
  const voxels = {};
  for (let x = -10; x <= 10; x++) {
    for (let z = -10; z <= 10; z++) {
      voxels[`${x},0,${z}`] = BLOCKS.SAND;
    }
  }
  // Wall at x = 2
  for (let z = -3; z <= 3; z++) {
    voxels[`2,1,${z}`] = BLOCKS.SANDSTONE;
    voxels[`2,2,${z}`] = BLOCKS.SANDSTONE;
  }

  const world = createMockWorld(voxels);
  const manager = createManager(world);

  const group = new THREE.Group();
  group.position.set(0.5, 1.0, 0.5);
  const golem = {
    type: 'iron_golem',
    name: 'Iron Golem',
    width: 1.4,
    height: 2.7,
    mesh: group,
    velocity: new THREE.Vector3(1.2, 0, 0), // walking toward wall
    yaw: 0,
    health: 100
  };

  // Run simulation for 200 ticks
  let turns = 0;
  let prevYaw = golem.yaw;
  for (let i = 0; i < 200; i++) {
    moveGroundMob(manager, golem, 0.05);
    if (Math.abs(golem.yaw - prevYaw) > 0.5) {
      turns++;
      prevYaw = golem.yaw;
    }
  }

  // Golem should remain grounded and not oscillate infinitely in place
  assert.equal(golem.onGround, true);
  assert.ok(turns < 25, `golem should not endlessly spin in circles, turned ${turns} times`);
});
