// What a mob can spawn on (isValidSpawnFloor), against the wiki's Spawn-proofing tutorial and Java's isValidSpawn.
// Found by the wiki-tutorial play-test: any solid block counted, so bottom slabs, carpet, glass and paths did nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidSpawnFloor, hasFloor } from '../src/spawning/spawnValidation.js';
import { BLOCKS } from '../src/blocks.js';

const world = (orientations = {}) => ({ structureOrientations: new Map(Object.entries(orientations)) });

test('"Areas covered in bottom slabs are unable to spawn mobs ... double slabs, top slabs ... are still spawnable"', () => {
  assert.equal(isValidSpawnFloor(world(), 0, 0, 0, BLOCKS.OAK_SLAB), false, 'bottom slab');
  assert.equal(isValidSpawnFloor(world({ '0,0,0': { slabType: 'top' } }), 0, 0, 0, BLOCKS.OAK_SLAB), true, 'top slab');
});

test('dirt path, farmland, carpet, glass, leaves and light sources refuse; grass, soul sand and mud allow', () => {
  for (const n of ['DIRT_PATH', 'FARMLAND', 'WHITE_CARPET', 'GLASS', 'TINTED_GLASS', 'OAK_LEAVES', 'GLOWSTONE', 'OAK_FENCE']) {
    if (BLOCKS[n] !== undefined) assert.equal(isValidSpawnFloor(world(), 0, 0, 0, BLOCKS[n]), false, n);
  }
  for (const n of ['GRASS', 'STONE', 'SOUL_SAND', 'MUD', 'COBBLESTONE']) {
    if (BLOCKS[n] !== undefined) assert.equal(isValidSpawnFloor(world(), 0, 0, 0, BLOCKS[n]), true, n);
  }
});

test('leaves take parrots and ocelots, ice polar bears, magma only the fire-immune', () => {
  assert.equal(isValidSpawnFloor(world(), 0, 0, 0, BLOCKS.OAK_LEAVES, 'parrot'), true);
  assert.equal(isValidSpawnFloor(world(), 0, 0, 0, BLOCKS.ICE, 'polar_bear'), true);
  assert.equal(isValidSpawnFloor(world(), 0, 0, 0, BLOCKS.ICE, 'zombie'), false);
  assert.equal(isValidSpawnFloor(world(), 0, 0, 0, BLOCKS.MAGMA_BLOCK, 'zombie'), false);
  assert.equal(isValidSpawnFloor(world(), 0, 0, 0, BLOCKS.MAGMA_BLOCK, 'strider'), true);
});

test('hasFloor applies it', () => {
  const cells = { '0,0,0': BLOCKS.OAK_SLAB };
  const w = { structureOrientations: new Map(), getVoxel: (x, y, z) => cells[`${x},${y},${z}`] ?? BLOCKS.AIR };
  assert.equal(hasFloor(w, 0.5, 1, 0.5, 0.6, () => true, 'zombie'), false);
  cells['0,0,0'] = BLOCKS.STONE;
  assert.equal(hasFloor(w, 0.5, 1, 0.5, 0.6, () => true, 'zombie'), true);
});
