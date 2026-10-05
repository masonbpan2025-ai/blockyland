// Door wood types: the door manager must keep a door's own wood through a full open/close cycle.
//
// The bug this exists for: toggleDoor hard-coded the oak ids with a fallback only for iron, so toggling
// any other wood turned the door into oak. That was invisible while oak was the only wooden door in the
// game, and adding fifteen more wood types would have introduced it -- silently, because a door that
// still opens and closes looks fine from a recipe count.
//
// A note on the setup, because it cost a round: canPlaceDoor requires SOLID GROUND below the door. An
// earlier version of these tests placed doors in mid-air and every placement failed, which looked like a
// fault in the door code rather than in the test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DoorManager, doorIdSet } from '../src/door.js';
import { World, Chunk } from '../src/world.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';

/** A world with one chunk and a stone floor at y=7, so a door at y=8 has something to stand on. */
function makeWorld() {
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) world.setVoxel(x, 7, z, BLOCKS.STONE);
  }
  return world;
}

function makeManager(world) {
  return new DoorManager({ world, sounds: {} });
}

test('the four door ids resolve from the definition name', () => {
  // Resolution is by name so one helper covers the hand-written oak and iron doors as well as every
  // generated wood, with no special case.
  for (const key of ['OAK_DOOR', 'IRON_DOOR', 'SPRUCE_DOOR', 'BAMBOO_DOOR', 'CRIMSON_DOOR']) {
    const id = BLOCKS[key];
    if (id === undefined) continue;
    const ids = doorIdSet(BLOCK_DEFS[id]);
    assert.ok(ids, key + ' should resolve to an id set');
    assert.equal(ids.closed, BLOCKS[key], key + ' closed id');
    assert.equal(ids.open, BLOCKS[key + '_OPEN'], key + ' open id');
    assert.equal(ids.topClosed, BLOCKS[key + '_TOP'], key + ' top id');
    assert.equal(ids.topOpen, BLOCKS[key + '_TOP_OPEN'], key + ' top-open id');
  }
});

test('a non-door definition resolves to nothing, rather than to a wrong door', () => {
  assert.equal(doorIdSet(BLOCK_DEFS[BLOCKS.STONE]), null, 'stone is not a door');
  assert.equal(doorIdSet(BLOCK_DEFS[BLOCKS.OAK_TRAPDOOR]), null, 'a trapdoor is not a door');
  assert.equal(doorIdSet(null), null, 'and neither is nothing');
});

test('placing a door with no wood given still places oak', () => {
  // Every existing caller passes no door id, so this is the compatibility guarantee.
  const world = makeWorld();
  const dm = makeManager(world);
  const result = dm.placeDoor(world, [4, 8, 4]);
  assert.ok(result.success, 'an oak door should place on solid ground, got ' + result.reason);
  assert.equal(world.getVoxel(4, 8, 4), BLOCKS.OAK_DOOR, 'bottom is oak');
  assert.equal(world.getVoxel(4, 9, 4), BLOCKS.OAK_DOOR_TOP, 'top is oak');
});

test('a door keeps its own wood through open and close', () => {
  for (const wood of ['OAK', 'SPRUCE', 'BIRCH', 'JUNGLE', 'ACACIA', 'CHERRY', 'DARK_OAK',
    'MANGROVE', 'BAMBOO', 'CRIMSON', 'WARPED']) {
    const closedId = BLOCKS[wood + '_DOOR'];
    if (closedId === undefined) continue;
    const world = makeWorld();
    const dm = makeManager(world);

    const placed = dm.placeDoor(world, [4, 8, 4], 3, false, closedId);
    assert.ok(placed.success, wood + ' door should place, got ' + placed.reason);
    assert.equal(world.getVoxel(4, 8, 4), closedId, wood + ' should place its own closed block');
    assert.equal(world.getVoxel(4, 9, 4), BLOCKS[wood + '_DOOR_TOP'], wood + ' should place its own top');

    dm.toggleDoor(4, 8, 4);
    assert.equal(world.getVoxel(4, 8, 4), BLOCKS[wood + '_DOOR_OPEN'],
      wood + ' should open into ' + wood + ', not into oak');
    assert.equal(world.getVoxel(4, 9, 4), BLOCKS[wood + '_DOOR_TOP_OPEN'], wood + ' top should open');

    dm.toggleDoor(4, 8, 4);
    assert.equal(world.getVoxel(4, 8, 4), closedId, wood + ' should close back into ' + wood);
    assert.equal(world.getVoxel(4, 9, 4), BLOCKS[wood + '_DOOR_TOP'], wood + ' top should close back');
  }
});

test('toggling a door that was never placed through the manager keeps its wood', () => {
  // The path a loaded save takes: the voxels exist but the manager has no record, so it registers one
  // from the definition. If that path ignored the wood type, loading a save would convert every door.
  const world = makeWorld();
  const dm = makeManager(world);
  world.setVoxel(6, 8, 6, BLOCKS.SPRUCE_DOOR);
  world.setVoxel(6, 9, 6, BLOCKS.SPRUCE_DOOR_TOP);

  dm.toggleDoor(6, 8, 6);
  assert.equal(world.getVoxel(6, 8, 6), BLOCKS.SPRUCE_DOOR_OPEN,
    'an unmanaged spruce door should still open into spruce');
  assert.notEqual(world.getVoxel(6, 8, 6), BLOCKS.OAK_DOOR_OPEN, 'and must not become oak');
  assert.notEqual(world.getVoxel(6, 9, 6), BLOCKS.OAK_DOOR_TOP_OPEN, 'including its top half');
});

test('iron doors stay shut to the hand and open to redstone', () => {
  const world = makeWorld();
  const dm = makeManager(world);
  dm.placeDoor(world, [2, 8, 2], 3, true);
  assert.equal(world.getVoxel(2, 8, 2), BLOCKS.IRON_DOOR, 'an iron door places closed');

  const refused = dm.toggleDoor(2, 8, 2);
  assert.equal(refused.success, false, 'a hand toggle must not open an iron door');
  assert.equal(world.getVoxel(2, 8, 2), BLOCKS.IRON_DOOR, 'and must leave it shut');

  dm.toggleDoor(2, 8, 2, true);
  assert.equal(world.getVoxel(2, 8, 2), BLOCKS.IRON_DOOR_OPEN, 'redstone opens it');
  assert.equal(world.getVoxel(2, 9, 2), BLOCKS.IRON_DOOR_TOP_OPEN, 'including the top half');
});

test('a door cannot be placed without solid ground', () => {
  // Pins the precondition that made an earlier version of these tests look like a code fault.
  const world = new World();
  world.chunks.set('0,0', new Chunk(0, 0));
  const dm = makeManager(world);
  const result = dm.placeDoor(world, [4, 8, 4]);
  assert.equal(result.success, false, 'a door in mid-air should not place');
  assert.equal(world.getVoxel(4, 8, 4), BLOCKS.AIR, 'and should leave nothing behind');
});

test('every generated wood door is complete and marked where it should be', () => {
  const doors = Object.entries(BLOCKS).filter(([k]) => /_DOOR$/.test(k) && typeof BLOCKS[k] === 'number');
  assert.ok(doors.length >= 16, 'expected the wood door family, found ' + doors.length);
  for (const [key] of doors) {
    assert.equal(BLOCK_DEFS[BLOCKS[key]].openId, BLOCKS[key + '_OPEN'],
      key + ' should point its openId at ' + key + '_OPEN');
    for (const suffix of ['_OPEN', '_TOP', '_TOP_OPEN']) {
      const id = BLOCKS[key + suffix];
      assert.ok(id !== undefined, key + suffix + ' is missing');
      assert.equal(BLOCK_DEFS[id].internal, true, key + suffix + ' should be internal');
      assert.equal(BLOCK_DEFS[id].openId, undefined, key + suffix + ' should carry no openId of its own');
    }
    // The top halves must be marked, or the manager cannot tell which half it is looking at.
    assert.equal(BLOCK_DEFS[BLOCKS[key + '_TOP']].isTop, true, key + '_TOP should be marked isTop');
    assert.equal(BLOCK_DEFS[BLOCKS[key]].door, true, key + ' should be marked as a door');
  }
});
