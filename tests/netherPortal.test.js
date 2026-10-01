import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, Chunk } from '../src/world.js';
import { BLOCKS } from '../src/blocks.js';
import {
  detectPortalFrame,
  lightPortal,
  destroyContiguousPortal,
  getDestinationCoordinates,
  findNearbyPortal,
  generateDestinationPortal,
  NetherPortalManager
} from '../src/netherPortal.js';

function createTestWorld() {
  const world = new World();
  for (let cx = -3; cx <= 3; cx++) {
    for (let cz = -3; cz <= 3; cz++) {
      world.chunks.set(world.chunkKey(cx, cz), new Chunk(cx, cz));
    }
  }
  return world;
}

test('Nether Portal - Standard 4x5 Obsidian Frame Detection (X-axis)', () => {
  const world = createTestWorld();

  // Build standard 4x5 frame along X-axis at base Y = 10, Z = 5
  // Columns: x = 0 (left), x = 1 (inner), x = 2 (inner), x = 3 (right)
  // Rows: y = 10 (bottom), y = 11, 12, 13 (inner), y = 14 (top)
  // Corners at (0,10), (3,10), (0,14), (3,14) can be anything

  // Bottom obsidian row
  world.setVoxel(1, 10, 5, BLOCKS.OBSIDIAN);
  world.setVoxel(2, 10, 5, BLOCKS.OBSIDIAN);

  // Left pillar
  world.setVoxel(0, 11, 5, BLOCKS.OBSIDIAN);
  world.setVoxel(0, 12, 5, BLOCKS.OBSIDIAN);
  world.setVoxel(0, 13, 5, BLOCKS.OBSIDIAN);

  // Right pillar
  world.setVoxel(3, 11, 5, BLOCKS.OBSIDIAN);
  world.setVoxel(3, 12, 5, BLOCKS.OBSIDIAN);
  world.setVoxel(3, 13, 5, BLOCKS.OBSIDIAN);

  // Top obsidian row
  world.setVoxel(1, 14, 5, BLOCKS.OBSIDIAN);
  world.setVoxel(2, 14, 5, BLOCKS.OBSIDIAN);

  // Inner area is Air (x=1..2, y=11..13, z=5)
  for (let x = 1; x <= 2; x++) {
    for (let y = 11; y <= 13; y++) {
      world.setVoxel(x, y, 5, BLOCKS.AIR);
    }
  }

  // Detect frame from candidate air block inside opening
  const frame = detectPortalFrame(world, 1, 11, 5);
  assert.equal(frame.valid, true, 'Frame without corners should be valid');
  assert.equal(frame.axis, 'x');
  assert.equal(frame.minX, 1);
  assert.equal(frame.maxX, 2);
  assert.equal(frame.minY, 11);
  assert.equal(frame.maxY, 13);
  assert.equal(frame.innerBlocks.length, 6, 'Inner opening is 2x3 = 6 blocks');

  // Detect frame from clicked bottom obsidian block (1, 10, 5)
  const frameFromObsidian = detectPortalFrame(world, 1, 10, 5);
  assert.equal(frameFromObsidian.valid, true, 'Clicking bottom obsidian should detect frame above');
});

test('Nether Portal - Frame with Optional Corners Present', () => {
  const world = createTestWorld();

  // Build standard 4x5 with full corners
  for (let x = 0; x <= 3; x++) {
    for (let y = 10; y <= 14; y++) {
      if (x === 0 || x === 3 || y === 10 || y === 14) {
        world.setVoxel(x, y, 0, BLOCKS.OBSIDIAN);
      } else {
        world.setVoxel(x, y, 0, BLOCKS.AIR);
      }
    }
  }

  const frame = detectPortalFrame(world, 2, 12, 0);
  assert.equal(frame.valid, true, 'Frame with full corners should be valid');
  assert.equal(frame.innerBlocks.length, 6);
});

test('Nether Portal - Z-Axis Aligned Frame Detection', () => {
  const world = createTestWorld();

  // Spans in Z from 2 to 5 (inner z=3..4), Y from 10 to 14 (inner y=11..13), X = 8
  world.setVoxel(8, 10, 3, BLOCKS.OBSIDIAN);
  world.setVoxel(8, 10, 4, BLOCKS.OBSIDIAN);

  world.setVoxel(8, 11, 2, BLOCKS.OBSIDIAN);
  world.setVoxel(8, 12, 2, BLOCKS.OBSIDIAN);
  world.setVoxel(8, 13, 2, BLOCKS.OBSIDIAN);

  world.setVoxel(8, 11, 5, BLOCKS.OBSIDIAN);
  world.setVoxel(8, 12, 5, BLOCKS.OBSIDIAN);
  world.setVoxel(8, 13, 5, BLOCKS.OBSIDIAN);

  world.setVoxel(8, 14, 3, BLOCKS.OBSIDIAN);
  world.setVoxel(8, 14, 4, BLOCKS.OBSIDIAN);

  const frame = detectPortalFrame(world, 8, 11, 3);
  assert.equal(frame.valid, true);
  assert.equal(frame.axis, 'z');
  assert.equal(frame.minZ, 3);
  assert.equal(frame.maxZ, 4);
});

test('Nether Portal - Rejects Invalid Frames', () => {
  const world = createTestWorld();

  // 1. Missing top obsidian
  world.setVoxel(1, 10, 5, BLOCKS.OBSIDIAN);
  world.setVoxel(2, 10, 5, BLOCKS.OBSIDIAN);
  world.setVoxel(0, 11, 5, BLOCKS.OBSIDIAN);
  world.setVoxel(0, 12, 5, BLOCKS.OBSIDIAN);
  world.setVoxel(0, 13, 5, BLOCKS.OBSIDIAN);
  world.setVoxel(3, 11, 5, BLOCKS.OBSIDIAN);
  world.setVoxel(3, 12, 5, BLOCKS.OBSIDIAN);
  world.setVoxel(3, 13, 5, BLOCKS.OBSIDIAN);
  // No top row!
  assert.equal(detectPortalFrame(world, 1, 11, 5).valid, false, 'Missing top frame should be invalid');

  // 2. Too small: width 1 opening
  world.setVoxel(1, 10, 1, BLOCKS.OBSIDIAN);
  world.setVoxel(0, 11, 1, BLOCKS.OBSIDIAN);
  world.setVoxel(0, 12, 1, BLOCKS.OBSIDIAN);
  world.setVoxel(0, 13, 1, BLOCKS.OBSIDIAN);
  world.setVoxel(2, 11, 1, BLOCKS.OBSIDIAN);
  world.setVoxel(2, 12, 1, BLOCKS.OBSIDIAN);
  world.setVoxel(2, 13, 1, BLOCKS.OBSIDIAN);
  world.setVoxel(1, 14, 1, BLOCKS.OBSIDIAN);
  assert.equal(detectPortalFrame(world, 1, 11, 1).valid, false, '1-wide frame is smaller than minimum 2');

  // 3. Obstructed interior (e.g. Cobblestone inside)
  world.setVoxel(1, 10, 10, BLOCKS.OBSIDIAN);
  world.setVoxel(2, 10, 10, BLOCKS.OBSIDIAN);
  world.setVoxel(0, 11, 10, BLOCKS.OBSIDIAN);
  world.setVoxel(0, 12, 10, BLOCKS.OBSIDIAN);
  world.setVoxel(0, 13, 10, BLOCKS.OBSIDIAN);
  world.setVoxel(3, 11, 10, BLOCKS.OBSIDIAN);
  world.setVoxel(3, 12, 10, BLOCKS.OBSIDIAN);
  world.setVoxel(3, 13, 10, BLOCKS.OBSIDIAN);
  world.setVoxel(1, 14, 10, BLOCKS.OBSIDIAN);
  world.setVoxel(2, 14, 10, BLOCKS.OBSIDIAN);
  world.setVoxel(1, 12, 10, BLOCKS.COBBLESTONE); // Obstruction!
  assert.equal(detectPortalFrame(world, 1, 11, 10).valid, false, 'Obstructed interior should be invalid');
});

test('Nether Portal - Ignition Fills Inner Area with BLOCKS.NETHER_PORTAL', () => {
  const world = createTestWorld();
  let igniteSoundPlayed = false;
  const fakeSounds = {
    playPortalIgnite: () => { igniteSoundPlayed = true; }
  };

  // Build standard 4x5 frame
  for (let x = 0; x <= 3; x++) {
    for (let y = 10; y <= 14; y++) {
      if (x === 0 || x === 3 || y === 10 || y === 14) {
        world.setVoxel(x, y, 0, BLOCKS.OBSIDIAN);
      }
    }
  }

  const res = lightPortal(world, 1, 11, 0, fakeSounds);
  assert.equal(res.success, true);
  assert.equal(res.count, 6);
  assert.equal(igniteSoundPlayed, true);

  // Verify all 6 inner blocks are NETHER_PORTAL
  for (let x = 1; x <= 2; x++) {
    for (let y = 11; y <= 13; y++) {
      assert.equal(world.getVoxel(x, y, 0), BLOCKS.NETHER_PORTAL);
    }
  }
});

test('Nether Portal - Breaking Frame or Portal Destroys All Contiguous Portal Blocks', () => {
  const world = createTestWorld();
  let breakSoundPlayed = false;
  const fakeSounds = {
    playPortalBreak: () => { breakSoundPlayed = true; }
  };

  // Build & light portal
  for (let x = 0; x <= 3; x++) {
    for (let y = 10; y <= 14; y++) {
      if (x === 0 || x === 3 || y === 10 || y === 14) {
        world.setVoxel(x, y, 0, BLOCKS.OBSIDIAN);
      }
    }
  }
  lightPortal(world, 1, 11, 0);

  // Break one obsidian frame block at (0, 12, 0)
  world.setVoxel(0, 12, 0, BLOCKS.AIR);
  const result = destroyContiguousPortal(world, 0, 12, 0, fakeSounds);

  assert.equal(result.destroyed, true);
  assert.equal(result.count, 6);
  assert.equal(breakSoundPlayed, true);

  // All 6 inner blocks should now be Air
  for (let x = 1; x <= 2; x++) {
    for (let y = 11; y <= 13; y++) {
      assert.equal(world.getVoxel(x, y, 0), BLOCKS.AIR);
    }
  }
});

test('Nether Portal - Coordinate Translation (8:1 Scaling)', () => {
  // Overworld to Nether: /8
  const toNether = getDestinationCoordinates('overworld', 160, 64, -240);
  assert.equal(toNether.x, 20);
  assert.equal(toNether.z, -30);
  assert.ok(toNether.y >= 16 && toNether.y <= 45);

  // Nether to Overworld: *8
  const toOverworld = getDestinationCoordinates('nether', 20, 32, -30);
  assert.equal(toOverworld.x, 160);
  assert.equal(toOverworld.z, -240);
});

test('Nether Portal - Destination Portal & Platform Generation', () => {
  const world = createTestWorld();

  const generated = generateDestinationPortal(world, 10, 20, 10, 'x');
  assert.ok(generated.spawnX);
  assert.ok(generated.spawnY);
  assert.ok(generated.spawnZ);

  // Check obsidian platform at Y = 19
  assert.equal(world.getVoxel(10, 19, 10), BLOCKS.OBSIDIAN);
  assert.equal(world.getVoxel(11, 19, 10), BLOCKS.OBSIDIAN);

  // Check bottom obsidian frame at Y = 20
  assert.equal(world.getVoxel(10, 20, 10), BLOCKS.OBSIDIAN);
  assert.equal(world.getVoxel(11, 20, 10), BLOCKS.OBSIDIAN);

  // Check portal blocks at Y = 21, 22, 23
  assert.equal(world.getVoxel(10, 21, 10), BLOCKS.NETHER_PORTAL);
  assert.equal(world.getVoxel(11, 21, 10), BLOCKS.NETHER_PORTAL);
  assert.equal(world.getVoxel(10, 22, 10), BLOCKS.NETHER_PORTAL);
  assert.equal(world.getVoxel(11, 23, 10), BLOCKS.NETHER_PORTAL);

  // Check top obsidian frame at Y = 24
  assert.equal(world.getVoxel(10, 24, 10), BLOCKS.OBSIDIAN);
});

test('Nether Portal - NetherPortalManager Transition Logic & Cooldown', () => {
  const world = createTestWorld();
  let switchedDim = null;
  let switchedPos = null;

  const fakeGame = {
    world,
    currentDimension: 'overworld',
    switchDimension: (dim, pos) => {
      switchedDim = dim;
      switchedPos = pos;
      fakeGame.currentDimension = dim;
    },
    sounds: {
      playPortalIgnite: () => {},
      playPortalTravel: () => {},
      playPortalAmbience: () => {}
    },
    ui: {
      addChatMessage: () => {}
    }
  };

  const fakePlayer = {
    position: new THREE.Vector3(10.5, 21.0, 10.5),
    velocity: new THREE.Vector3(0, 0, 0),
    gamemode: 'survival'
  };

  const manager = new NetherPortalManager(fakeGame);

  // Generate portal at player location
  generateDestinationPortal(world, 10, 20, 10, 'x');

  // Verify player is recognized as in portal
  assert.equal(manager.isPlayerInPortal(fakePlayer, world), true);

  // In survival, needs 4.0 seconds (80 ticks) to teleport
  manager.update(1.5, fakePlayer, fakeGame);
  assert.equal(manager.portalTimer, 1.5);
  assert.equal(switchedDim, null, 'Should not have switched dimension before 4.0s');

  // Update more time to pass 4.0s
  manager.update(2.6, fakePlayer, fakeGame);
  assert.equal(switchedDim, 'nether', 'Should have switched to nether after 4.0s');
  assert.equal(manager.portalCooldown, 4.0, 'Grace cooldown must be active to prevent immediate bounce');
  assert.equal(manager.portalTimer, 0, 'Timer resets upon transition');
});

test('Nether Portal - Creative Mode Instant/Fast Transition', () => {
  const world = createTestWorld();
  let switchedDim = null;

  const fakeGame = {
    world,
    currentDimension: 'overworld',
    switchDimension: (dim) => { switchedDim = dim; fakeGame.currentDimension = dim; },
    sounds: { playPortalTravel: () => {} },
    ui: { addChatMessage: () => {} }
  };

  const fakePlayer = {
    position: new THREE.Vector3(5.5, 16.0, 5.5),
    velocity: new THREE.Vector3(0, 0, 0),
    gamemode: 'creative' // Creative mode
  };

  const manager = new NetherPortalManager(fakeGame);
  generateDestinationPortal(world, 5, 15, 5, 'x');

  // In creative mode, 0.5s is needed
  manager.update(0.6, fakePlayer, fakeGame);
  assert.equal(switchedDim, 'nether', 'Creative mode should transition quickly');
});
