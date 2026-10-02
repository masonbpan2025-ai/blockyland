// Spawn placement. Regression guard for the "player starts buried underground"
// bug: the position must be derived from generated terrain, never a fixed height.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  findSurfaceSpawn,
  placePlayerOnSurface,
  scoreSpawnColumn
} from '../src/worldSpawn.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { World } from '../src/world.js';
import { Player } from '../src/player.js';

/** World stub built from a column map: "x,z" -> { ground, above: [ids] }. */
function stubWorld(columns, { defaultGround = null } = {}) {
  return {
    // The real World creates chunks on demand; placement relies on this to
    // materialise terrain before probing it.
    getOrCreateChunk() { return {}; },
    getHighestSolidY(wx, wz) {
      const col = columns[`${wx},${wz}`];
      if (!col) return defaultGround === null ? 0 : defaultGround;
      return col.ground;
    },
    getVoxel(wx, wy, wz) {
      const col = columns[`${wx},${wz}`];
      if (!col) return BLOCKS.AIR;
      if (wy === col.ground) return col.block ?? BLOCKS.GRASS;
      if (wy > col.ground && wy <= col.ground + (col.above || []).length) {
        return col.above[wy - col.ground - 1];
      }
      return BLOCKS.AIR;
    }
  };
}

function flatGround(radius, { ground = 25, block = BLOCKS.GRASS } = {}) {
  const columns = {};
  for (let x = -radius; x <= radius; x++) {
    for (let z = -radius; z <= radius; z++) {
      columns[`${x},${z}`] = { ground, block };
    }
  }
  return columns;
}

// --- the core rule ----------------------------------------------------------

test('the player stands one block above the highest solid block, never inside it', () => {
  const world = stubWorld({ '0,0': { ground: 30 } });
  const scored = scoreSpawnColumn(world, 0, 0, { anchorX: 0, anchorZ: 0 });
  assert.equal(scored.groundY, 30);
  assert.equal(scored.standY, 31, 'feet must be above the solid block, not at it');
});

test('a column whose surface is above the old hardcoded height is still handled', () => {
  // y=27 was hardcoded before; a surface at 40 used to bury the player 13 deep.
  const world = stubWorld({ '0,0': { ground: 40 } });
  const spawn = findSurfaceSpawn(world, { x: 0, z: 0 });
  assert.equal(spawn.found, true);
  assert.equal(spawn.y, 41);
  assert.ok(spawn.y > 27, 'must not fall back to the old magic height');
});

// --- rejections -------------------------------------------------------------

test('flooded, blocked, treed and empty columns are rejected', () => {
  const anchor = { anchorX: 0, anchorZ: 0 };
  assert.equal(
    scoreSpawnColumn(stubWorld({ '0,0': { ground: 25, block: BLOCKS.WATER } }), 0, 0, anchor),
    null, 'water is not ground'
  );
  assert.equal(
    scoreSpawnColumn(stubWorld({ '0,0': { ground: 25, block: BLOCKS.LAVA } }), 0, 0, anchor),
    null, 'lava is not ground'
  );
  assert.equal(
    scoreSpawnColumn(stubWorld({ '0,0': { ground: 25, block: BLOCKS.OAK_LEAVES } }), 0, 0, anchor),
    null, 'standing in a tree is not acceptable'
  );
  assert.equal(
    scoreSpawnColumn(stubWorld({ '0,0': { ground: 25, above: [BLOCKS.AIR, BLOCKS.STONE] } }), 0, 0, anchor),
    null, 'needs head room'
  );
  // Nothing generated in this column at all.
  assert.equal(scoreSpawnColumn(stubWorld({}), 0, 0, anchor), null);
});

test('a blocked anchor moves to the nearest clear ground', () => {
  const world = stubWorld(flatGround(4));
  // Fill the anchor column with stone above the surface.
  world.getHighestSolidY = (wx, wz) => (wx === 0 && wz === 0 ? 30 : 25);

  const spawn = findSurfaceSpawn(world, { x: 0, z: 0, radius: 4 });
  assert.equal(spawn.found, true);
  assert.equal(spawn.y, 26, 'stands on the neighbouring flat ground');
  assert.notEqual(`${spawn.x},${spawn.z}`, '0.5,0.5', 'anchor was unusable so it relocated');
  assert.ok(Math.hypot(spawn.x - 0.5, spawn.z - 0.5) > 0);
});

test('when nothing nearby is usable it reports failure instead of guessing', () => {
  const world = stubWorld({}, { defaultGround: 0 });
  const spawn = findSurfaceSpawn(world, { x: 0, z: 0, radius: 3 });
  assert.equal(spawn.found, false);
  assert.match(spawn.reason, /no usable column/);
});

test('ocean biomes place player at the sea surface instead of falling back to y=0', () => {
  const oceanCols = flatGround(5, { ground: 24, block: BLOCKS.WATER });
  const world = stubWorld(oceanCols);
  const spawn = findSurfaceSpawn(world, { x: 0, z: 0, radius: 4 });
  assert.equal(spawn.found, true, 'must find the water surface');
  assert.equal(spawn.y, 25, 'stands right above the sea level at 24');
  assert.equal(spawn.groundY, 24);
  assert.match(spawn.reason, /sea surface/);
});

// --- placement effects ------------------------------------------------------

test('placePlayerOnSurface moves the player, zeroes velocity and updates the respawn point', () => {
  const world = stubWorld(flatGround(10, { ground: 33 }));
  const player = {
    position: { x: 0.5, y: 27, z: 0.5, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    velocity: { x: 3, y: -9, z: 4, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    spawnPosition: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    onGround: true
  };

  const result = placePlayerOnSurface({ world, player });
  assert.equal(result.found, true);
  assert.equal(player.position.y, 34, 'feet one above the solid surface at 33');
  // Flat ground, so whichever clear column is chosen, the player stands on it.
  const blockX = Math.floor(player.position.x);
  const blockZ = Math.floor(player.position.z);
  assert.equal(world.getVoxel(blockX, player.position.y, blockZ), BLOCKS.AIR, 'feet block is free');
  assert.equal(world.getVoxel(blockX, player.position.y + 1, blockZ), BLOCKS.AIR, 'head block is free');
  assert.notEqual(world.getVoxel(blockX, player.position.y - 1, blockZ), BLOCKS.AIR, 'ground is solid beneath');
  assert.deepEqual([player.velocity.x, player.velocity.y, player.velocity.z], [0, 0, 0], 'stops falling on arrival');
  assert.equal(player.spawnPosition.y, 34, 'respawn point follows the surface');
  assert.equal(player.onGround, false);
});

test('placePlayerOnSurface is a safe no-op without a world or player', () => {
  assert.equal(placePlayerOnSurface({}).found, false);
  assert.equal(placePlayerOnSurface({ world: stubWorld(flatGround(2)), player: null }).found, false);
  assert.equal(placePlayerOnSurface(null).found, false);
});

// --- against real terrain ---------------------------------------------------

test('the derived spawn is on the surface of the real generated world', () => {
  const world = new World();
  // Terrain must exist before probing: getHighestSolidY never creates a chunk.
  for (let cx = -4; cx <= 4; cx++) {
    for (let cz = -4; cz <= 4; cz++) world.getOrCreateChunk(cx, cz);
  }

  const spawn = findSurfaceSpawn(world, { x: 1.5, z: -1.5, radius: 6 });
  assert.equal(spawn.found, true, 'the default seed must have usable ground near the village');

  const blockX = Math.floor(spawn.x);
  const blockZ = Math.floor(spawn.z);
  const groundId = world.getVoxel(blockX, spawn.groundY, blockZ);
  const feetId = world.getVoxel(blockX, Math.round(spawn.y), blockZ);
  const headId = world.getVoxel(blockX, Math.round(spawn.y) + 1, blockZ);

  // Named, so a failure message is readable rather than a bare number.
  const name = BLOCK_DEFS[groundId]?.name || `block ${groundId}`;
  assert.notEqual(groundId, BLOCKS.AIR, 'there is solid ground under the spawn');
  assert.notEqual(groundId, BLOCKS.WATER, `spawn ground is water (${name})`);
  assert.notEqual(groundId, BLOCKS.LAVA, `spawn ground is lava (${name})`);
  assert.equal(feetId, BLOCKS.AIR, 'the feet block is free');
  assert.equal(headId, BLOCKS.AIR, 'the head block is free');
  assert.equal(spawn.groundY, world.getHighestSolidY(blockX, blockZ), 'stands on the true surface');
  assert.ok(spawn.y > spawn.groundY, 'feet are above the ground block, not inside it');
});

test('placePlayerOnSurface works on a fresh world without prior generation', () => {
  const world = new World();
  const player = {
    position: { x: 1.5, y: 27, z: -1.5, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    velocity: { set() {} },
    spawnPosition: { set() {} }
  };
  const result = placePlayerOnSurface({ world, player });
  assert.equal(result.found, true, 'placement must generate the terrain it needs');
  const bx = Math.floor(player.position.x);
  const bz = Math.floor(player.position.z);
  assert.equal(world.getVoxel(bx, player.position.y, bz), BLOCKS.AIR, 'not spawned inside a block');
  assert.notEqual(world.getVoxel(bx, player.position.y - 1, bz), BLOCKS.AIR, 'solid ground beneath the feet');
});

test('the real Player class ends up standing on the surface, not inside it', () => {
  const world = new World();
  // Minimal stand-ins for the camera and canvas: the constructor only stores them.
  const player = new Player({}, {}, world, {});
  assert.equal(player.position.y, 27, 'the class still starts from its historical height');

  const result = placePlayerOnSurface({ world, player });
  assert.equal(result.found, true, 'placement must succeed on a fresh world');

  const bx = Math.floor(player.position.x);
  const bz = Math.floor(player.position.z);
  const feet = Math.round(player.position.y);
  const feetBlock = world.getVoxel(bx, feet, bz);
  const headBlock = world.getVoxel(bx, feet + 1, bz);
  const groundBlock = world.getVoxel(bx, feet - 1, bz);

  // The reported bug: the player's body occupied solid blocks.
  assert.equal(feetBlock, BLOCKS.AIR, 'the player is not inside a block');
  assert.equal(headBlock, BLOCKS.AIR, 'the player head is not inside a block');
  assert.notEqual(groundBlock, BLOCKS.AIR, 'there is solid ground under the feet');
  assert.notEqual(groundBlock, BLOCKS.WATER, 'and the ground is not water');
  assert.notEqual(groundBlock, BLOCKS.LAVA, 'and the ground is not lava');

  // Body span is 1.8 blocks tall, so feet+1 must be clear too (checked above) and
  // the feet block itself must not be solid — the original failure mode.
  assert.equal(player.spawnPosition.y, player.position.y, 'respawn point matches the spawn');
  assert.equal(player.velocity.y, 0, 'no leftover fall velocity');
  assert.equal(player.onGround, false, 'gravity decides the first frame');
});

test('the hardcoded spawn height is no longer authoritative', () => {
  // player.js still defines a starting Vector3, but world generation must not
  // rely on its Y value any more.
  const main = fs.readFileSync(path.join(process.cwd(), 'src/main.js'), 'utf8');
  assert.match(main, /placePlayerOnSurface\(this\)/, 'generateNewWorld must place the player from terrain');
  const placementIndex = main.indexOf('placePlayerOnSurface(this)');
  const mobIndex = main.indexOf('this.spawnVillageMobs();', placementIndex - 400);
  assert.ok(placementIndex > 0 && mobIndex > placementIndex, 'place the player before spawning village mobs');
});
