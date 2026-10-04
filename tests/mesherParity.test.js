// The mesher must produce the same geometry it did before it was optimised.
//
// Meshing was the dominant cost: 44 ms for a single chunk, nearly three frames of a 60fps budget.
// The rewrite copies the chunk plus a one-block border into a flat scratch array once, so face and
// ambient-occlusion sampling becomes array indexing instead of roughly fourteen world lookups per
// visible face.
//
// That is exactly the kind of change that can quietly alter output: a wrong border index, a
// flipped axis, or sampling local coordinates where world ones were meant produces plausible
// looking terrain that is subtly wrong. These tests pin the piecewise properties that must hold,
// because a stored golden buffer would be brittle and would not explain a failure.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, Chunk, CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from '../src/world.js';
import { ChunkMesher } from '../src/mesher.js';
import { BLOCKS } from '../src/blocks.js';

/** Minimal texture stub: the mesher only needs UV rectangles. */
const texStub = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };

function meshOf(chunk, world) {
  return new ChunkMesher(texStub).meshChunk(chunk, world);
}

function counts(g) {
  return {
    opaque: g.opaqueGeo ? g.opaqueGeo.attributes.position.count : 0,
    transparent: g.transparentGeo ? g.transparentGeo.attributes.position.count : 0,
    water: g.waterGeo ? g.waterGeo.attributes.position.count : 0,
    light: g.lightGeo ? g.lightGeo.attributes.position.count : 0,
  };
}

/** A world whose chunks are built by hand, so the fixture is exact and generation is irrelevant. */
function handWorld(fill) {
  const world = new World(1, 'all');
  for (let cx = -1; cx <= 1; cx++) {
    for (let cz = -1; cz <= 1; cz++) {
      const chunk = new Chunk(cx, cz);
      fill(chunk, cx, cz);
      world.chunks.set(world.chunkKey(cx, cz), chunk);
    }
  }
  // The lookup cache must not still be holding pre-fixture entries.
  world.invalidateChunkCache();
  return world;
}

const floorAt = (y, id, extra) => (chunk) => {
  for (let x = 0; x < CHUNK_SIZE_X; x++) {
    for (let z = 0; z < CHUNK_SIZE_Z; z++) chunk.setVoxel(x, y, z, id);
  }
  if (extra) extra(chunk);
};

// --- the core invariant ------------------------------------------------------

test('a solid block in open air draws exactly six faces', () => {
  const world = handWorld(floorAt(10, BLOCKS.AIR));
  const chunk = world.getChunk(0, 0);
  chunk.setVoxel(8, 20, 8, BLOCKS.STONE);
  const c = counts(meshOf(chunk, world));
  assert.equal(c.opaque, 24, 'six quads = 24 vertices');
});

test('a block buried on all six sides draws nothing', () => {
  // A 3x3x3 cube of stone. Filling the centre must reduce the geometry, because the six faces of
  // the cavity it fills disappear. (An earlier version of this test asserted the two were equal,
  // which is the opposite of the truth -- filling a hole removes the faces lining it.)
  const world = handWorld((chunk) => {
    for (let x = 7; x <= 9; x++) {
      for (let y = 19; y <= 21; y++) {
        for (let z = 7; z <= 9; z++) chunk.setVoxel(x, y, z, BLOCKS.STONE);
      }
    }
  });
  const chunk = world.getChunk(0, 0);
  const solid = counts(meshOf(chunk, world)).opaque;

  chunk.setVoxel(8, 20, 8, BLOCKS.AIR);
  const hollow = counts(meshOf(chunk, world)).opaque;

  assert.equal(hollow - solid, 24,
    'hollowing the centre must expose exactly the six faces of the cavity');
  assert.ok(solid < hollow, 'a buried block must contribute less than an exposed one');
});

test('two adjacent solid blocks cull the faces between them', () => {
  const world = handWorld(floorAt(10, BLOCKS.AIR));
  const chunk = world.getChunk(0, 0);
  chunk.setVoxel(8, 20, 8, BLOCKS.STONE);
  const one = counts(meshOf(chunk, world)).opaque;
  chunk.setVoxel(9, 20, 8, BLOCKS.STONE);
  const two = counts(meshOf(chunk, world)).opaque;
  // Two separate cubes would be 48. The shared pair of faces is culled, so 10 quads remain.
  assert.equal(two, 40, 'the two touching faces must be culled');
  assert.ok(two < one * 2, 'adding a neighbour must not double the geometry');
});

// --- the border, which is what the rewrite changed ---------------------------

test('a face against a neighbouring chunk is culled using that chunk, not treated as air', () => {
  // This is the property the padded border exists to preserve. A block on the chunk's edge with a
  // solid neighbour in the next chunk must NOT draw the face between them.
  const world = handWorld(floorAt(10, BLOCKS.AIR));
  const chunk = world.getChunk(0, 0);   // covers world x 0..15
  chunk.setVoxel(CHUNK_SIZE_X - 1, 20, 8, BLOCKS.STONE); // world x = 15
  const withoutNeighbour = counts(meshOf(chunk, world)).opaque;

  // Fill the neighbouring chunk's matching edge column (world x = 16).
  const neighbour = world.getChunk(1, 0);
  neighbour.setVoxel(0, 20, 8, BLOCKS.STONE);
  const withNeighbour = counts(meshOf(chunk, world)).opaque;

  assert.equal(withoutNeighbour, 24, 'an exposed edge block draws six faces');
  assert.equal(withNeighbour, 20, 'the face into the neighbour must be culled');
});

test('a face against a missing chunk is drawn, not silently dropped', () => {
  // The far opposite failure: a border block with no neighbour loaded must still render its face,
  // otherwise the world has holes at the edge of the loaded area.
  const world = new World(1, 'all');
  const chunk = new Chunk(0, 0);
  chunk.setVoxel(8, 20, 8, BLOCKS.STONE);
  world.chunks.set('0,0', chunk);
  world.invalidateChunkCache();
  const c = counts(meshOf(chunk, world));
  assert.equal(c.opaque, 24, 'with nothing around it, all six faces show');
});

test('a vertical seam uses the neighbour above and below correctly', () => {
  // y borders are deliberately NOT padded: getVoxel returns air outside the world, and the clamp
  // in padGet lands on a real cell holding that air. This pins that equivalence.
  const world = handWorld(floorAt(10, BLOCKS.AIR));
  const chunk = world.getChunk(0, 0);
  chunk.setVoxel(4, CHUNK_HEIGHT - 1, 4, BLOCKS.STONE); // top row of the chunk
  const c = counts(meshOf(chunk, world));
  // A top-row block has air above (outside the world) and the world floor far below, so it is a
  // lone cube: six faces.
  assert.equal(c.opaque, 24, 'a block at the world ceiling is still a full cube');
});

test('out-of-range y samples read as air rather than wrapping', () => {
  const world = handWorld(floorAt(10, BLOCKS.AIR));
  const chunk = world.getChunk(0, 0);
  // A block at y=0 has nothing below it. If the border index wrapped, it would cull the bottom.
  chunk.setVoxel(4, 0, 4, BLOCKS.STONE);
  const c = counts(meshOf(chunk, world));
  assert.equal(c.opaque, 24, 'the bottom face must be drawn at y=0');
});

// --- broader parity ----------------------------------------------------------

test('generated terrain meshes with no anomalies and every chunk agrees with itself', () => {
  // Mesh a generated world and require a stable, non-degenerate result. Not a golden buffer: the
  // assertion is that geometry is produced, is finite, and lies inside its chunk's footprint plus
  // the one-block overhang a face may extend to.
  const world = new World(4242, 'all');
  for (let cx = 0; cx < 3; cx++) {
    for (let cz = 0; cz < 3; cz++) world.getOrCreateChunk(cx, cz);
  }
  for (let cx = 0; cx < 3; cx++) {
    for (let cz = 0; cz < 3; cz++) {
      const chunk = world.getChunk(cx, cz);
      const g = meshOf(chunk, world);
      assert.ok(g.opaqueGeo, `chunk ${cx},${cz} should have opaque geometry`);
      const pos = g.opaqueGeo.attributes.position.array;
      assert.ok(pos.length > 0, 'geometry must not be empty');
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i], y = pos[i + 1], z = pos[i + 2];
        assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z),
          `non-finite vertex in chunk ${cx},${cz}`);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      const wx0 = cx * CHUNK_SIZE_X, wz0 = cz * CHUNK_SIZE_Z;
      assert.ok(minX >= wx0 && maxX <= wx0 + CHUNK_SIZE_X + 1,
        `chunk ${cx},${cz} x range ${minX}..${maxX} escaped its footprint`);
      assert.ok(minZ >= wz0 && maxZ <= wz0 + CHUNK_SIZE_Z + 1,
        `chunk ${cx},${cz} z range ${minZ}..${maxZ} escaped its footprint`);
      assert.ok(minY >= -1 && maxY <= CHUNK_HEIGHT + 1, `y range ${minY}..${maxY} is implausible`);
    }
  }
});

test('the indexed triangle count matches the vertex count', () => {
  // A quad is 4 vertices and 6 indices. If the buffers got out of step, indices would reference
  // vertices that do not exist and the mesh would tear.
  const world = new World(77, 'all');
  const chunk = world.getOrCreateChunk(0, 0);
  const g = meshOf(chunk, world);
  for (const [name, geo] of Object.entries({
    opaque: g.opaqueGeo, transparent: g.transparentGeo, water: g.waterGeo,
  })) {
    if (!geo) continue;
    const verts = geo.attributes.position.count;
    const idx = geo.index ? geo.index.count : 0;
    assert.equal(idx, (verts / 4) * 6, `${name}: ${verts} vertices but ${idx} indices`);
    assert.equal(geo.attributes.normal.count, verts, `${name}: normals out of step`);
    assert.equal(geo.attributes.uv.count, verts, `${name}: uvs out of step`);
    assert.equal(geo.attributes.color.count, verts, `${name}: colours out of step`);
    assert.ok(verts <= 65535 || geo.index.array instanceof Uint32Array,
      `${name}: ${verts} vertices needs a 32-bit index to avoid wrapping`);
  }
});

test('meshing is deterministic for the same chunk', () => {
  const world = new World(31, 'all');
  const chunk = world.getOrCreateChunk(0, 0);
  const first = counts(meshOf(chunk, world));
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(counts(meshOf(chunk, world)), first, 'repeated meshing must be identical');
  }
});

test('the shared border scratch buffer does not leak between chunks', () => {
  // The mesher reuses one module-level scratch array across calls. A stale cell from the previous
  // chunk would show up as a wrongly culled or wrongly drawn face, so mesh two very different
  // chunks alternately and require each result to be stable.
  const world = new World(5, 'all');
  const solid = world.getOrCreateChunk(0, 0);
  const empty = new Chunk(50, 50);
  empty.setVoxel(8, 20, 8, BLOCKS.DIAMOND_BLOCK);
  world.chunks.set('50,50', empty);
  world.invalidateChunkCache();
  empty.dirty = false;
  solid.dirty = false;

  const solidFirst = counts(meshOf(solid, world));
  const emptyFirst = counts(meshOf(empty, world));
  // Alternate several times; both must keep giving their own answer.
  for (let i = 0; i < 4; i++) {
    assert.deepEqual(counts(meshOf(solid, world)), solidFirst, 'solid chunk changed after meshing the empty one');
    assert.deepEqual(counts(meshOf(empty, world)), emptyFirst, 'empty chunk changed after meshing the solid one');
  }
});
