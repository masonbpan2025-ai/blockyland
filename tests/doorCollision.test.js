import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { DoorManager, doorIdSet } from '../src/door.js';
import { Player } from '../src/player.js';
import { createBlockGeometry } from '../src/blockGeometry.js';

function createMockWorld() {
  const voxelData = new Map();
  return {
    getVoxel: (x, y, z) => voxelData.get(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`) ?? BLOCKS.AIR,
    setVoxel: (x, y, z, id) => {
      const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
      if (id === BLOCKS.AIR) voxelData.delete(key);
      else voxelData.set(key, id);
    },
    getChunk: () => ({ dirty: false })
  };
}

function createMockGame(world) {
  const placedSyncs = [];
  const brokenSyncs = [];
  const game = {
    world,
    sounds: { playDoor: () => {}, playClick: () => {}, playPlace: () => {} },
    rebuildChunkMesh: () => {},
    worldSync: {
      onBlockPlaced: (x, y, z, id) => placedSyncs.push({ x, y, z, id }),
      onBlockBroken: (x, y, z) => brokenSyncs.push({ x, y, z })
    },
    _placedSyncs: placedSyncs,
    _brokenSyncs: brokenSyncs
  };
  return game;
}

test('closed doors block player collision, and open doors allow passage', () => {
  const doorVariants = [
    { name: 'oak', closed: BLOCKS.OAK_DOOR, open: BLOCKS.OAK_DOOR_OPEN, topClosed: BLOCKS.OAK_DOOR_TOP, topOpen: BLOCKS.OAK_DOOR_TOP_OPEN },
    { name: 'spruce', closed: BLOCKS.SPRUCE_DOOR, open: BLOCKS.SPRUCE_DOOR_OPEN, topClosed: BLOCKS.SPRUCE_DOOR_TOP, topOpen: BLOCKS.SPRUCE_DOOR_TOP_OPEN },
    { name: 'birch', closed: BLOCKS.BIRCH_DOOR, open: BLOCKS.BIRCH_DOOR_OPEN, topClosed: BLOCKS.BIRCH_DOOR_TOP, topOpen: BLOCKS.BIRCH_DOOR_TOP_OPEN },
    { name: 'dark_oak', closed: BLOCKS.DARK_OAK_DOOR, open: BLOCKS.DARK_OAK_DOOR_OPEN, topClosed: BLOCKS.DARK_OAK_DOOR_TOP, topOpen: BLOCKS.DARK_OAK_DOOR_TOP_OPEN },
    { name: 'iron', closed: BLOCKS.IRON_DOOR, open: BLOCKS.IRON_DOOR_OPEN, topClosed: BLOCKS.IRON_DOOR_TOP, topOpen: BLOCKS.IRON_DOOR_TOP_OPEN }
  ];

  for (const variant of doorVariants) {
    const world = createMockWorld();
    const game = createMockGame(world);
    const dm = new DoorManager(game);
    game.doorManager = dm;

    // Build floor at y=26 and solid doorframe around doorway at x=5, z=5
    for (let x = 3; x <= 7; x++) {
      for (let z = 3; z <= 7; z++) {
        world.setVoxel(x, 26, z, BLOCKS.STONE);
      }
    }
    // Doorway opening is at x=5, z=5, y=27..28. Lintel above at y=29
    world.setVoxel(5, 29, 5, BLOCKS.STONE_BRICKS);
    // Jambs
    world.setVoxel(5, 27, 4, BLOCKS.STONE_BRICKS);
    world.setVoxel(5, 28, 4, BLOCKS.STONE_BRICKS);
    world.setVoxel(5, 27, 6, BLOCKS.STONE_BRICKS);
    world.setVoxel(5, 28, 6, BLOCKS.STONE_BRICKS);

    // Place door
    const placeRes = dm.placeDoor(world, [5, 27, 5], 0, variant.name === 'iron', variant.closed);
    assert.ok(placeRes.success, `${variant.name} door should place successfully`);
    assert.equal(world.getVoxel(5, 27, 5), variant.closed);
    assert.equal(world.getVoxel(5, 28, 5), variant.topClosed);

    const player = new Player(null, null, world);
    player.game = game;

    // 1. When door is CLOSED, player in doorway should collide
    player.position.set(5.5, 27.0, 5.5);
    assert.equal(player.checkCollision(player.position), true, `${variant.name} closed door blocks collision`);

    // Player walking towards the doorway along X collides at doorway entry
    assert.equal(player.checkCollision(new THREE.Vector3(5.2, 27.0, 5.5)), true, `entering closed ${variant.name} door collides`);

    // 2. Open the door
    if (variant.name === 'iron') {
      dm.setDoorOpen(5, 27, 5, true, true);
    } else {
      dm.toggleDoor(5, 27, 5);
    }

    assert.equal(world.getVoxel(5, 27, 5), variant.open, `${variant.name} bottom is open`);
    assert.equal(world.getVoxel(5, 28, 5), variant.topOpen, `${variant.name} top is open`);
    assert.equal(dm.getDoor(5, 27, 5).open, true);

    // 3. When door is OPEN, player should be able to pass through with NO collision
    assert.equal(player.checkCollision(new THREE.Vector3(5.5, 27.0, 5.5)), false, `${variant.name} open door allows standing inside`);

    for (let x = 4.2; x <= 6.8; x += 0.2) {
      const pos = new THREE.Vector3(x, 27.0, 5.5);
      assert.equal(player.checkCollision(pos), false, `${variant.name} open door permits step at x=${x.toFixed(1)}`);
    }
  }
});

test('setDoorOpen preserves non-oak wood types and does not revert to oak', () => {
  const world = createMockWorld();
  const game = createMockGame(world);
  const dm = new DoorManager(game);
  game.doorManager = dm;

  world.setVoxel(10, 0, 10, BLOCKS.STONE);
  const placeRes = dm.placeDoor(world, [10, 1, 10], 0, false, BLOCKS.SPRUCE_DOOR);
  assert.ok(placeRes.success);
  assert.equal(world.getVoxel(10, 1, 10), BLOCKS.SPRUCE_DOOR);
  assert.equal(world.getVoxel(10, 2, 10), BLOCKS.SPRUCE_DOOR_TOP);

  // Open via setDoorOpen
  dm.setDoorOpen(10, 1, 10, true, false);
  assert.equal(world.getVoxel(10, 1, 10), BLOCKS.SPRUCE_DOOR_OPEN, 'bottom opens as spruce, not oak');
  assert.equal(world.getVoxel(10, 2, 10), BLOCKS.SPRUCE_DOOR_TOP_OPEN, 'top opens as spruce, not oak');

  // Close via setDoorOpen
  dm.setDoorOpen(10, 1, 10, false, false);
  assert.equal(world.getVoxel(10, 1, 10), BLOCKS.SPRUCE_DOOR, 'bottom closes as spruce');
  assert.equal(world.getVoxel(10, 2, 10), BLOCKS.SPRUCE_DOOR_TOP, 'top closes as spruce');
});

test('DoorManager syncs block updates to multiplayer worldSync', () => {
  const world = createMockWorld();
  const game = createMockGame(world);
  const dm = new DoorManager(game);
  game.doorManager = dm;

  world.setVoxel(20, 0, 20, BLOCKS.STONE);

  // 1. placeDoor broadcasts both halves
  dm.placeDoor(world, [20, 1, 20], 0, false, BLOCKS.BIRCH_DOOR);
  assert.equal(game._placedSyncs.length, 2, 'two blocks synced on placement');
  assert.deepEqual(game._placedSyncs[0], { x: 20, y: 1, z: 20, id: BLOCKS.BIRCH_DOOR });
  assert.deepEqual(game._placedSyncs[1], { x: 20, y: 2, z: 20, id: BLOCKS.BIRCH_DOOR_TOP });

  // 2. toggleDoor broadcasts both halves
  game._placedSyncs.length = 0;
  dm.toggleDoor(20, 1, 20);
  assert.equal(game._placedSyncs.length, 2, 'two blocks synced on toggle open');
  assert.deepEqual(game._placedSyncs[0], { x: 20, y: 1, z: 20, id: BLOCKS.BIRCH_DOOR_OPEN });
  assert.deepEqual(game._placedSyncs[1], { x: 20, y: 2, z: 20, id: BLOCKS.BIRCH_DOOR_TOP_OPEN });

  // 3. setDoorOpen broadcasts both halves
  game._placedSyncs.length = 0;
  dm.setDoorOpen(20, 1, 20, false);
  assert.equal(game._placedSyncs.length, 2, 'two blocks synced on setDoorOpen close');
  assert.deepEqual(game._placedSyncs[0], { x: 20, y: 1, z: 20, id: BLOCKS.BIRCH_DOOR });
  assert.deepEqual(game._placedSyncs[1], { x: 20, y: 2, z: 20, id: BLOCKS.BIRCH_DOOR_TOP });

  // 4. toggleTrapdoor broadcasts block update
  game._placedSyncs.length = 0;
  world.setVoxel(20, 1, 25, BLOCKS.SPRUCE_TRAPDOOR);
  dm.toggleTrapdoor(20, 1, 25);
  assert.equal(game._placedSyncs.length, 1, 'trapdoor synced on toggle');
  assert.deepEqual(game._placedSyncs[0], { x: 20, y: 1, z: 25, id: BLOCKS.SPRUCE_TRAPDOOR_OPEN });

  // 5. onBlockBroken broadcasts both halves
  dm.onBlockBroken(20, 1, 20);
  assert.equal(game._brokenSyncs.length, 2, 'both door halves synced on break');
  assert.deepEqual(game._brokenSyncs[0], { x: 20, y: 1, z: 20 });
  assert.deepEqual(game._brokenSyncs[1], { x: 20, y: 2, z: 20 });
});

test('double doors automatically configure symmetrical hinges', () => {
  const world = createMockWorld();
  const game = createMockGame(world);
  const dm = new DoorManager(game);
  game.doorManager = dm;

  world.setVoxel(5, 0, 5, BLOCKS.STONE);
  world.setVoxel(5, 0, 6, BLOCKS.STONE);

  // Facing 0 (East, +X): left is +Z (z=6)
  // First door placed at z=6 has hinge 'left'
  const door1 = dm.placeDoor(world, [5, 1, 6], 0, false, BLOCKS.OAK_DOOR);
  assert.ok(door1.success);
  assert.equal(door1.door.hinge, 'left', 'first door defaults to left hinge');

  // Second door placed adjacent at z=5 (which sees door1 at z=6 on its left) becomes hinge 'right'
  const door2 = dm.placeDoor(world, [5, 1, 5], 0, false, BLOCKS.SPRUCE_DOOR);
  assert.ok(door2.success);
  assert.equal(door2.door.hinge, 'right', 'second door paired as right hinge for double door');
});

test('createBlockGeometry fallback open detection works for all door and trapdoor types', () => {
  const textures = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };

  // For open doors, even when state.open is undefined, geometry builds without throwing
  const openDoorIds = [
    BLOCKS.OAK_DOOR_OPEN,
    BLOCKS.SPRUCE_DOOR_OPEN,
    BLOCKS.DARK_OAK_DOOR_OPEN,
    BLOCKS.BIRCH_DOOR_OPEN,
    BLOCKS.IRON_DOOR_OPEN
  ];

  for (const id of openDoorIds) {
    const geo = createBlockGeometry(id, textures, {});
    assert.ok(geo instanceof THREE.BufferGeometry, `geometry for ${BLOCK_DEFS[id].name} builds successfully`);
  }

  // Open trapdoors
  const openTrapdoorIds = [
    BLOCKS.OAK_TRAPDOOR_OPEN,
    BLOCKS.SPRUCE_TRAPDOOR_OPEN,
    BLOCKS.IRON_TRAPDOOR_OPEN
  ];

  for (const id of openTrapdoorIds) {
    const geo = createBlockGeometry(id, textures, {});
    assert.ok(geo instanceof THREE.BufferGeometry, `geometry for ${BLOCK_DEFS[id].name} builds successfully`);
  }
});

test('door facing in East/West walls aligns closed panel along Z and open panel along X, allowing passage', () => {
  const textures = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };
  const world = createMockWorld();
  const game = createMockGame(world);
  const dm = new DoorManager(game);
  game.doorManager = dm;

  // Door in East/West wall (facing 0: East, wall along Z)
  world.setVoxel(10, 0, 10, BLOCKS.STONE);
  dm.placeDoor(world, [10, 1, 10], 0, false, BLOCKS.OAK_DOOR);

  // Closed door geometry should have thickness along X and width along Z (flat across Z)
  const closedGeo = createBlockGeometry(BLOCKS.OAK_DOOR, textures, dm.getDoor(10, 1, 10));
  closedGeo.computeBoundingBox();
  const closedBB = closedGeo.boundingBox;
  assert.ok(closedBB.max.x - closedBB.min.x < 0.25, 'closed door thickness is along X');
  assert.ok(closedBB.max.z - closedBB.min.z > 0.9, 'closed door width spans across Z');

  // Open door
  dm.setDoorOpen(10, 1, 10, true, false);
  const openGeo = createBlockGeometry(BLOCKS.OAK_DOOR_OPEN, textures, dm.getDoor(10, 1, 10));
  openGeo.computeBoundingBox();
  const openBB = openGeo.boundingBox;
  assert.ok(openBB.max.x - openBB.min.x > 0.9, 'open door extends along X');
  assert.ok(openBB.max.z - openBB.min.z < 0.25, 'open door is flush against Z jamb');

  // Player passage
  const player = new Player(null, null, world);
  player.game = game;
  assert.equal(player.checkCollision(new THREE.Vector3(10.5, 1.0, 10.5)), false, 'player walks through open door');
});
