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

  // Wiki (Tutorial:Nether portals): "A 2x3 platform of obsidian with air 3 high above" -- the frame's bottom row and
  // the rows either side of it, at Y = 20; nothing is built below it.
  for (const z of [9, 10, 11]) for (const x of [10, 11]) assert.equal(world.getVoxel(x, 20, z), BLOCKS.OBSIDIAN);
  assert.equal(world.getVoxel(10, 21, 9), BLOCKS.AIR);
  assert.equal(world.getVoxel(10, 19, 10), BLOCKS.AIR);

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

test('Nether Portal - a destination portal goes on the nearest valid site, not carved into rock (Tutorial:Nether portals)', async () => {
  const { findPortalSite, placeDestinationPortal } = await import('../src/netherPortal.js');
  const world = createTestWorld();
  // Solid rock everywhere, with one open ledge: a floor at y = 20 (x 4..9, z 2..6), air 4 high above.
  for (let x = -20; x <= 30; x++) for (let z = -20; z <= 30; z++) for (let y = 0; y <= 62; y++) world.setVoxel(x, y, z, BLOCKS.NETHERRACK);
  for (let x = 4; x <= 9; x++) for (let z = 2; z <= 6; z++) for (let y = 21; y <= 24; y++) world.setVoxel(x, y, z, BLOCKS.AIR);
  const site = findPortalSite(world, 0, 25, 0);
  assert.ok(site, '"a valid location is 3x4 buildable blocks with air 4 high above all 12 blocks"');
  assert.equal(site.y, 20, 'the frame stands on the ledge floor');
  const built = placeDestinationPortal(world, 0, 25, 0);
  assert.equal(world.getVoxel(Math.floor(built.spawnX), built.spawnY, Math.floor(built.spawnZ)), BLOCKS.NETHER_PORTAL);
  assert.equal(world.getVoxel(0, 26, 0), BLOCKS.NETHERRACK, 'nothing is carved at the ideal point');
  // More than 16 blocks away is outside the search: the portal is forced at the target on a platform.
  const far = findPortalSite(world, -8, 25, -8, { radius: 16 });
  assert.equal(far?.x >= 4 ? 'found' : 'none', 'found', 'a site 12 blocks away is still within 16');
  const tooFar = findPortalSite(world, 30, 25, 30, { radius: 16 });
  assert.equal(tooFar, null);
});

test('Nether Portal - the search only counts the bottom block of each portal column, within a square radius', () => {
  const world = createTestWorld();
  generateDestinationPortal(world, 10, 20, 10, 'x');
  const found = findNearbyPortal(world, 10, 30, 10, 16);
  assert.equal(found.y, 21, 'the bottom portal block, even though a higher one is nearer the target Y');
  assert.equal(findNearbyPortal(world, 28, 21, 10, 16), null, '17 blocks away along x is outside a 16-block search');
});

test('Nether Portal - Overworld portal blocks spawn zombified piglins on the frame, by difficulty (Tutorial:Zombified piglin farming)', () => {
  const world = createTestWorld();
  generateDestinationPortal(world, 10, 20, 10, 'x');
  assert.equal(world.portalBlocks.overworld.size, 6, 'the six portal blocks are tracked');
  const spawned = [];
  const game = { world, difficulty: 'hard', mobs: { spawnMob: (type, x, y, z) => { spawned.push({ type, y }); return {}; } } };
  const manager = new NetherPortalManager(game);
  // Expected per portal block per game tick: 3/4096 x 3/2000.
  let n = 0; for (let i = 0; i < 2000; i++) n += manager.spawnFromPortals(1, game, () => 0); // a certain roll: one each
  assert.ok(n > 0 && spawned.every((s) => s.type === 'zombified_piglin' && s.y === 21), 'on the bottom frame (portal bottom at y 21)');
  spawned.length = 0;
  let rolls = 0; const rng = () => { rolls++; return 0.5; };
  manager.spawnFromPortals(1, { ...game, difficulty: 'peaceful' }, rng);
  assert.equal(rolls, 0, 'never on Peaceful');
  world.setVoxel(10, 21, 10, BLOCKS.AIR); world.setVoxel(11, 21, 10, BLOCKS.AIR);
  assert.equal(world.portalBlocks.overworld.size, 4, 'a broken portal block is forgotten');
});
