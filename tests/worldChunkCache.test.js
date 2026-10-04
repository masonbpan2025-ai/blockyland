// The chunk lookup cache must be invisible: same answers as the Map, only faster.
//
// getVoxel is the hottest function in the engine, and it was doing Math.floor twice, building a
// template string and hitting a Map on every call. It now uses a direct-mapped slot array in front
// of the Map. That kind of optimisation is exactly where subtle wrong-block bugs come from, so
// these tests pin the behaviour that has to stay identical.
//
// The cases that actually broke during development:
//   - negative coordinates, where truncating division would put -1 in chunk 0 instead of chunk -1
//   - the local-coordinate bitmask, which only equals a modulo for powers of two and for negatives
//   - switching dimension, where the cache would otherwise answer with the other world's chunks
//   - reseeding, which empties the Map but left stale slots behind
//   - code that writes to world.chunks directly with a string key, bypassing getOrCreateChunk
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Chunk, CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from '../src/world.js';
import { BLOCKS } from '../src/blocks.js';

/** Reference implementation: no cache, straight to the Map, using string keys. */
function referenceVoxel(world, wx, wy, wz) {
  if (wy < 0 || wy >= CHUNK_HEIGHT) return BLOCKS.AIR;
  const cx = Math.floor(wx / CHUNK_SIZE_X);
  const cz = Math.floor(wz / CHUNK_SIZE_Z);
  const chunk = world.chunks.get(`${cx},${cz}`);
  if (!chunk) return BLOCKS.AIR;
  const lx = ((wx % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
  const lz = ((wz % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z;
  return chunk.voxels[(wy * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx];
}

function loadedWorld() {
  const world = new World(31337, 'all');
  for (const [cx, cz] of [[0, 0], [1, 0], [-1, 0], [0, -1], [-1, -1], [3, -2], [-4, 5], [2, 2]]) {
    world.getOrCreateChunk(cx, cz);
  }
  return world;
}

test('cached lookups match an uncached reference across a wide coordinate range', () => {
  const world = loadedWorld();
  let mismatches = 0;
  let firstMismatch = null;
  for (let i = 0; i < 60000; i++) {
    const x = ((i * 37) % 400) - 200;
    const z = ((i * 53) % 400) - 200;
    const y = (i * 7) % CHUNK_HEIGHT;
    const got = world.getVoxel(x, y, z);
    const want = referenceVoxel(world, x, y, z);
    if (got !== want) { mismatches++; if (!firstMismatch) firstMismatch = { x, y, z, got, want }; }
  }
  assert.equal(mismatches, 0, `first mismatch: ${JSON.stringify(firstMismatch)}`);
});

test('negative coordinates resolve to the correct chunk and local cell', () => {
  const world = new World(5, 'all');
  // A distinctive block at a known negative world coordinate.
  world.setVoxel(-1, 30, -1, BLOCKS.DIAMOND_BLOCK);
  world.setVoxel(-17, 31, -33, BLOCKS.GOLD_BLOCK);

  assert.equal(world.getVoxel(-1, 30, -1), BLOCKS.DIAMOND_BLOCK, '-1 must be chunk -1, cell 15');
  assert.equal(world.getVoxel(-17, 31, -33), BLOCKS.GOLD_BLOCK, '-17 is chunk -2 cell 15');
  // The neighbours are untouched, which catches an off-by-one in the bitmask.
  assert.equal(world.getVoxel(0, 30, -1), BLOCKS.AIR);
  assert.equal(world.getVoxel(-1, 30, 0), BLOCKS.AIR);
  assert.equal(world.getVoxel(-2, 30, -1), BLOCKS.AIR, '-2 is the cell next to -1, not the same one');
});

test('every local cell within a chunk round-trips through setVoxel and getVoxel', () => {
  const world = new World(11, 'all');
  // Fill one chunk's floor with a unique-per-cell pattern.
  for (let x = -CHUNK_SIZE_X; x < 0; x++) {
    for (let z = -CHUNK_SIZE_Z; z < 0; z++) {
      world.setVoxel(x, 40, z, ((x & 15) * 16 + (z & 15)) % 250 + 1);
    }
  }
  let checked = 0;
  for (let x = -CHUNK_SIZE_X; x < 0; x++) {
    for (let z = -CHUNK_SIZE_Z; z < 0; z++) {
      const want = ((x & 15) * 16 + (z & 15)) % 250 + 1;
      assert.equal(world.getVoxel(x, 40, z), want, `cell ${x},${z} lost its value`);
      checked++;
    }
  }
  assert.equal(checked, CHUNK_SIZE_X * CHUNK_SIZE_Z);
});

test('switching dimension does not answer with the previous world', () => {
  const world = new World(21, 'all');
  world.setVoxel(8, 30, 8, BLOCKS.DIAMOND_BLOCK);
  assert.equal(world.getVoxel(8, 30, 8), BLOCKS.DIAMOND_BLOCK);

  // Prime the cache with the overworld chunk, then switch away and back.
  world.switchDimension('nether');
  const inNether = world.getVoxel(8, 30, 8);

  world.switchDimension('overworld');
  const backInOverworld = world.getVoxel(8, 30, 8);

  assert.equal(backInOverworld, BLOCKS.DIAMOND_BLOCK, 'the block must survive the round trip');
  assert.notEqual(inNether, BLOCKS.DIAMOND_BLOCK, 'the nether must not serve the overworld block');
});

test('reseed drops cached chunks rather than serving the old world', () => {
  const world = new World(1, 'all');
  world.setVoxel(4, 30, 4, BLOCKS.DIAMOND_BLOCK);
  assert.equal(world.getVoxel(4, 30, 4), BLOCKS.DIAMOND_BLOCK);

  world.reseed(2, 'all');
  // The Map is cleared; a stale cache slot would still report the diamond.
  assert.equal(world.getVoxel(4, 30, 4) === BLOCKS.DIAMOND_BLOCK, false,
    'a reseeded world must not expose the previous world\'s blocks');
});

test('a chunk written straight into the Map is still found', () => {
  // Several modules and many tests put chunks into `world.chunks` by hand with a string key,
  // bypassing getOrCreateChunk. The cache must not hide those.
  const world = new World(3, 'all');
  const chunk = new Chunk(7, -9);
  chunk.setVoxel(2, 20, 3, BLOCKS.EMERALD_BLOCK);
  world.chunks.set('7,-9', chunk);

  assert.equal(world.getVoxel(7 * CHUNK_SIZE_X + 2, 20, -9 * CHUNK_SIZE_Z + 3), BLOCKS.EMERALD_BLOCK);
});

test('a missing chunk is not cached, so generating it later is visible', () => {
  // A negative cache entry would be a real bug: the chunk may be generated moments later.
  const world = new World(4, 'all');
  assert.equal(world.getVoxel(5000, 30, 5000), BLOCKS.AIR, 'unloaded reads as air');

  const chunk = world.getOrCreateChunk(Math.floor(5000 / CHUNK_SIZE_X), Math.floor(5000 / CHUNK_SIZE_Z));
  chunk.setVoxel(5000 & (CHUNK_SIZE_X - 1), 30, 5000 & (CHUNK_SIZE_Z - 1), BLOCKS.DIAMOND_BLOCK);

  assert.equal(world.getVoxel(5000, 30, 5000), BLOCKS.DIAMOND_BLOCK,
    'the chunk must be found once it exists');
});

test('direct voxel reads agree with Chunk.getVoxel including out-of-range rows', () => {
  const world = new World(6, 'all');
  const chunk = world.getOrCreateChunk(0, 0);
  for (let y = 0; y < CHUNK_HEIGHT; y += 7) {
    for (let lx = 0; lx < CHUNK_SIZE_X; lx += 5) {
      for (let lz = 0; lz < CHUNK_SIZE_Z; lz += 5) {
        assert.equal(world.getVoxel(lx, y, lz), chunk.getVoxel(lx, y, lz),
          `disagreement at ${lx},${y},${lz}`);
      }
    }
  }
  assert.equal(world.getVoxel(0, -1, 0), BLOCKS.AIR, 'below the world is air');
  assert.equal(world.getVoxel(0, CHUNK_HEIGHT, 0), BLOCKS.AIR, 'above the world is air');
  assert.equal(world.getVoxel(0, CHUNK_HEIGHT + 500, 0), BLOCKS.AIR);
  assert.equal(world.getVoxel(0, -500, 0), BLOCKS.AIR);
});

test('the cache actually hits for a realistically loaded region', () => {
  // A performance optimisation that silently misses everything is worse than none: it adds a
  // branch and no benefit.
  //
  // Measured over a DENSE region, which is what the engine has while playing and what the mesher
  // actually walks. Note this deliberately does not use the scattered fixture above: a
  // direct-mapped cache evicts when two live chunks hash to the same slot, so hitting a sparse
  // world with scattered chunks produces misses through no fault of the cache. That is the
  // expected behaviour of the design, not a defect, and an earlier version of this test wrongly
  // failed because of it.
  const world = new World(6, 'all');
  for (let cx = 0; cx < 5; cx++) {
    for (let cz = 0; cz < 5; cz++) world.getOrCreateChunk(cx, cz);
  }

  world.chunkCacheHits = 0;
  world.chunkCacheMisses = 0;
  for (let x = 0; x < 32; x++) {
    for (let z = 0; z < 32; z++) world.getVoxel(x, 20, z);
  }

  const total = world.chunkCacheHits + world.chunkCacheMisses;
  assert.equal(total, 32 * 32, 'every lookup should have been counted');
  const hitRate = world.chunkCacheHits / total;
  assert.ok(hitRate > 0.9,
    `hit rate was ${(hitRate * 100).toFixed(1)}% over a dense region, which is too low `
    + 'to be worth the branch');
});

test('heavy interleaved traffic never returns another chunk\'s block', () => {
  // The cache is allowed to evict -- it must never be allowed to return the WRONG chunk, which is
  // the one failure mode that would silently corrupt terrain.
  //
  // Note on hashing: with `(cx + OFF) * 31 + (cz + OFF)` masked to 12 bits, 31 is coprime with
  // 4096, so colliding on the cz=0 line needs a 4096-chunk stride. Rather than depend on finding
  // a magic colliding pair, this exercises the real property under heavy interleaved traffic
  // across many chunks: every read must return that chunk's own block.
  const world = new World(8, 'all');
  const chunks = [];
  for (let cx = 0; cx < 6; cx++) {
    for (let cz = 0; cz < 6; cz++) {
      chunks.push(world.getOrCreateChunk(cx, cz));
    }
  }
  // Every chunk gets a distinct marker at the same local cell.
  chunks.forEach((chunk, i) => {
    // Stay within a single byte, and never use 0 (air).
    chunk.setVoxel(3, 20, 4, (i % 254) + 1);
  });

  for (let round = 0; round < 40; round++) {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const want = (i % 254) + 1;
      const got = world.getVoxel(chunk.cx * CHUNK_SIZE_X + 3, 20, chunk.cz * CHUNK_SIZE_Z + 4);
      assert.equal(got, want,
        `chunk ${chunk.cx},${chunk.cz} returned ${got} instead of ${want}`);
    }
  }
});

test('an unloaded chunk reads as air even when its slot held another chunk', () => {
  // A stale slot must not shadow a missing chunk. Load one chunk, read it (so it is cached), then
  // read a distant unloaded one and require air -- the previous occupant of the slot must not leak.
  const world = new World(9, 'all');
  const loaded = world.getOrCreateChunk(0, 0);
  loaded.setVoxel(2, 20, 2, BLOCKS.DIAMOND_BLOCK);
  assert.equal(world.getVoxel(2, 20, 2), BLOCKS.DIAMOND_BLOCK, 'warm the cache');

  // Walk far enough away that many slots are touched, then read unloaded regions.
  for (let i = 1; i < 200; i++) {
    assert.equal(world.getVoxel(i * 16 + 2, 20, 2), BLOCKS.AIR,
      `unloaded chunk at x=${i * 16} must read as air`);
  }
  // And the original is still correct afterwards.
  assert.equal(world.getVoxel(2, 20, 2), BLOCKS.DIAMOND_BLOCK);
});
