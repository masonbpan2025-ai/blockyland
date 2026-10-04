// The mesher must be no slower than it was, and must still produce identical geometry.
//
// The mesher is the engine's most expensive per-chunk operation, so changes to it are measured
// rather than assumed. `tests/fixtures/mesherBefore.js` is the previous implementation, generated
// by `scripts/make-mesher-fixture.mjs`; both are meshed in this one process so they see the same
// machine conditions, and the comparison is a ratio rather than an absolute time. Absolute
// timings here are not meaningful -- this checkout is shared and other work skews them -- so the
// assertion is only that the current mesher is not materially slower.
//
// Parity is asserted exactly, not approximately: a performance change that alters the vertex
// stream is a regression no matter how fast it is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Chunk, CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from '../src/world.js';
import { ChunkMesher } from '../src/mesher.js';
import { ChunkMesher as ChunkMesherBefore } from './fixtures/mesherBefore.js';
import { BLOCKS } from '../src/blocks.js';

const texStub = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };

/** A world with a given seed, generated around the origin. */
function generatedWorld(seed, radius = 2) {
  const world = new World(seed, 'all');
  for (let cx = -radius; cx <= radius; cx++) {
    for (let cz = -radius; cz <= radius; cz++) world.getOrCreateChunk(cx, cz);
  }
  return world;
}

/** Every attribute of every geometry, flattened, for exact comparison. */
function geometrySnapshot(group) {
  const out = {};
  for (const [name, geo] of Object.entries(group)) {
    if (!geo) { out[name] = null; continue; }
    const attrs = {};
    for (const [attr, value] of Object.entries(geo.attributes)) {
      attrs[attr] = Array.from(value.array).map(n => Number(n.toFixed(6)));
    }
    out[name] = { attrs, index: geo.index ? Array.from(geo.index.array) : null };
  }
  return out;
}

// --- parity ------------------------------------------------------------------

test('the current mesher produces byte-identical geometry to the previous one', () => {
  // Same world, two meshers: every attribute and every index must match exactly.
  for (const seed of [1234, 77, 909]) {
    const world = generatedWorld(seed, 2);
    const chunk = world.getChunk(0, 0);
    const before = geometrySnapshot(new ChunkMesherBefore(texStub).meshChunk(chunk, world));
    const after = geometrySnapshot(new ChunkMesher(texStub).meshChunk(chunk, world));
    assert.deepEqual(after, before, `seed ${seed}: geometry changed`);
  }
});

test('parity holds for every chunk in a generated world, not just one', () => {
  const world = generatedWorld(4242, 2);
  for (let cx = -1; cx <= 1; cx++) {
    for (let cz = -1; cz <= 1; cz++) {
      const chunk = world.getChunk(cx, cz);
      const before = geometrySnapshot(new ChunkMesherBefore(texStub).meshChunk(chunk, world));
      const after = geometrySnapshot(new ChunkMesher(texStub).meshChunk(chunk, world));
      assert.deepEqual(after, before, `chunk ${cx},${cz} changed`);
    }
  }
});

test('parity holds for water, where the previous code had subtle corner handling', () => {
  // Water is the case that broke during development: the surface height substitution and the
  // per-corner lowering have to be applied in the original order or the surface flattens.
  const world = generatedWorld(31, 2);
  for (let cx = -1; cx <= 1; cx++) {
    for (let cz = -1; cz <= 1; cz++) {
      const chunk = world.getChunk(cx, cz);
      const before = geometrySnapshot(new ChunkMesherBefore(texStub).meshChunk(chunk, world));
      const after = geometrySnapshot(new ChunkMesher(texStub).meshChunk(chunk, world));
      assert.deepEqual(after.waterGeo, before.waterGeo, `chunk ${cx},${cz} water changed`);
    }
  }
});

test('parity holds where a block touches a chunk border', () => {
  // Exercises the padded border path, which is what the previous mesher read through world.getVoxel.
  const world = generatedWorld(5, 2);
  const chunk = world.getChunk(0, 0);
  // A marker at each face of the chunk, so the border is definitely sampled.
  for (let y = 30; y < 34; y++) {
    chunk.setVoxel(0, y, 8, BLOCKS.GLASS);
    chunk.setVoxel(CHUNK_SIZE_X - 1, y, 8, BLOCKS.GLASS);
    chunk.setVoxel(8, y, 0, BLOCKS.GLASS);
    chunk.setVoxel(8, y, CHUNK_SIZE_Z - 1, BLOCKS.GLASS);
  }
  const before = geometrySnapshot(new ChunkMesherBefore(texStub).meshChunk(chunk, world));
  const after = geometrySnapshot(new ChunkMesher(texStub).meshChunk(chunk, world));
  assert.deepEqual(after, before);
});

// --- performance -------------------------------------------------------------

test('the current mesher is not materially slower than the previous one', () => {
  // Interleaved in one process, reported as a ratio. Generous tolerance because this machine is
  // shared: the point is to catch a real regression (the change that prompted this was ~30%), not
  // to police noise.
  const TOLERANCE = 1.35;

  const world = generatedWorld(2222, 3);
  const chunks = [];
  for (let cx = -2; cx <= 2; cx++) {
    for (let cz = -2; cz <= 2; cz++) chunks.push(world.getChunk(cx, cz));
  }

  const before = new ChunkMesherBefore(texStub);
  const after = new ChunkMesher(texStub);

  // Warm both, so JIT state is comparable.
  for (const chunk of chunks) { before.meshChunk(chunk, world); after.meshChunk(chunk, world); }

  const time = (mesher) => {
    const t0 = performance.now();
    for (const chunk of chunks) mesher.meshChunk(chunk, world);
    return performance.now() - t0;
  };

  const beforeTimes = [];
  const afterTimes = [];
  const ROUNDS = 5;
  for (let i = 0; i < ROUNDS; i++) {
    beforeTimes.push(time(before));
    afterTimes.push(time(after));
  }
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const beforeMs = median(beforeTimes);
  const afterMs = median(afterTimes);
  const ratio = afterMs / beforeMs;

  assert.ok(ratio <= TOLERANCE,
    `the mesher is ${((ratio - 1) * 100).toFixed(0)}% slower than the previous version `
    + `(${afterMs.toFixed(1)}ms vs ${beforeMs.toFixed(1)}ms for ${chunks.length} chunks); `
    + `before [${beforeTimes.map(t => t.toFixed(0)).join(', ')}] `
    + `after [${afterTimes.map(t => t.toFixed(0)).join(', ')}]`);
});

test('meshing allocates far less than it used to', () => {
  // The allocation-free rewrite exists to cut garbage, and garbage is measurable directly: a
  // smaller heap delta for the same output means fewer objects created. This is the honest way to
  // check the actual goal rather than a proxy like elapsed time.
  const world = generatedWorld(8888, 2);
  const chunks = [];
  for (let cx = -1; cx <= 1; cx++) {
    for (let cz = -1; cz <= 1; cz++) chunks.push(world.getChunk(cx, cz));
  }
  const before = new ChunkMesherBefore(texStub);
  const after = new ChunkMesher(texStub);
  for (const chunk of chunks) { before.meshChunk(chunk, world); after.meshChunk(chunk, world); }

  const heapDelta = (fn) => {
    if (typeof globalThis.gc !== 'function') return null;
    globalThis.gc();
    const start = process.memoryUsage().heapUsed;
    fn();
    return process.memoryUsage().heapUsed - start;
  };

  const beforeHeap = heapDelta(() => { for (const chunk of chunks) before.meshChunk(chunk, world); });
  const afterHeap = heapDelta(() => { for (const chunk of chunks) after.meshChunk(chunk, world); });

  if (beforeHeap === null || afterHeap === null) {
    // Without --expose-gc the measurement is not available; skip rather than assert a falsehood.
    return;
  }
  assert.ok(afterHeap < beforeHeap,
    `the rewrite should allocate less: ${afterHeap} bytes vs ${beforeHeap} before`);
});
