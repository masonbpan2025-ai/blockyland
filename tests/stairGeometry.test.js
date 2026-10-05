// Stair geometry.
//
// Stairs are the first shape built from MORE THAN ONE box, which is where the interesting failure modes
// are: the step must sit against one edge rather than centred, the four facings must differ, and the
// merge must preserve every attribute -- a merge that drops one renders the block invisible rather than
// wrong-shaped, so nothing looks broken until it is missing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Chunk } from '../src/world.js';
import { ChunkMesher } from '../src/mesher.js';
import { createStairGeometry, STAIR_ROTATIONS } from '../src/slab.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';

const textures = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 0.25, v1: 0.25 }) };

/** The step's footprint, found by height: the base occupies y 0..0.5, the step y 0.5..1. */
function stepExtent(geo) {
  const pos = geo.attributes.position;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, n = 0;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) <= 0.5 + 1e-6) continue;
    n++;
    minX = Math.min(minX, pos.getX(i)); maxX = Math.max(maxX, pos.getX(i));
    minZ = Math.min(minZ, pos.getZ(i)); maxZ = Math.max(maxZ, pos.getZ(i));
  }
  return { n, minX, maxX, minZ, maxZ };
}

test('a stair is a base half plus a step covering half the block', () => {
  const def = BLOCK_DEFS[BLOCKS.OAK_STAIRS];
  assert.ok(def, 'oak stairs should exist');
  assert.equal(def.stair, true, 'and must be marked so the mesher routes them');

  const geo = createStairGeometry(def, textures, 3, false);
  geo.computeBoundingBox();
  assert.equal(geo.boundingBox.min.y, 0);
  assert.equal(geo.boundingBox.max.y, 1, 'a stair fills the block vertically overall');

  const step = stepExtent(geo);
  const zSpan = step.maxZ - step.minZ;
  assert.ok(Math.abs(zSpan - 0.5) < 1e-6, 'the step should be half a block deep, measured ' + zSpan);
  assert.ok(step.minZ < 0.01 || step.maxZ > 0.99,
    'the step should be against an edge, not floating in the middle');
  geo.dispose();
});

test('the four facings put the step in four different places', () => {
  // If rotation were ignored every stair would look identical and the block state would be cosmetic.
  //
  // The centres are compared directly. An earlier version bucketed them into quadrants with
  // `< 0.5 ? low : high`, and because each centre is 0.25 or 0.75 on one axis and exactly 0.50 on the
  // other, two facings fell into the same bucket while being genuinely different blocks. The code was
  // right; the bucketing was too coarse to see it.
  const def = BLOCK_DEFS[BLOCKS.OAK_STAIRS];
  const seen = new Set();
  for (let dir = 0; dir < 4; dir++) {
    const geo = createStairGeometry(def, textures, dir, false);
    const s = stepExtent(geo);
    const cx = ((s.minX + s.maxX) / 2).toFixed(2);
    const cz = ((s.minZ + s.maxZ) / 2).toFixed(2);
    seen.add(cx + ',' + cz);
    geo.dispose();
  }
  assert.equal(seen.size, 4,
    'expected four distinct step centres, got ' + seen.size + ': ' + [...seen].join(' '));
});

test('upside-down stairs put the step against the ceiling instead of the floor', () => {
  // The discriminator is the step's inner face: the step occupies z 0..0.5, so its face at z=0.5 is a
  // vertical surface spanning half a block, and inverting moves that surface from the upper half to
  // the lower half.
  //
  // Three earlier versions of this test failed, and the reasons are worth keeping. Counting vertices
  // above and below the midline missed the ones exactly ON it. Comparing per-half bounding boxes on Z
  // could not work, because the base spans the whole block. Comparing y histograms could not work
  // either, because normal and inverted produce the same SET of heights -- {0, 0.5, 1} -- and differ
  // only in which box sits where.
  const def = BLOCK_DEFS[BLOCKS.OAK_STAIRS];

  /** The y range of the step's inner face at z = 0.5. */
  const innerFaceRange = (geo) => {
    const pos = geo.attributes.position;
    let min = Infinity, max = -Infinity, n = 0;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getZ(i) - 0.5) > 1e-6) continue;
      n++;
      min = Math.min(min, pos.getY(i));
      max = Math.max(max, pos.getY(i));
    }
    return { min, max, n };
  };

  const normal = innerFaceRange(createStairGeometry(def, textures, 3, false));
  const inverted = innerFaceRange(createStairGeometry(def, textures, 3, true));

  assert.ok(normal.n > 0 && inverted.n > 0, 'both orientations should have a face at the midline');

  // A normal stair's step rises from the midline to the top.
  assert.equal(normal.min, 0.5, 'a normal step starts at the midline');
  assert.equal(normal.max, 1, 'and reaches the top of the block');

  // An inverted stair's step hangs from the midline down toward the floor.
  assert.equal(inverted.min, 0, 'an inverted step descends to the floor');
  assert.equal(inverted.max, 0.5, 'and stops at the midline');

  // The two orientations must not produce the same mesh.
  assert.notDeepEqual(normal, inverted, 'inverting a stair should change its geometry');
});

test('a merged stair keeps every attribute, and two boxes make 48 vertices', () => {
  const geo = createStairGeometry(BLOCK_DEFS[BLOCKS.OAK_STAIRS], textures, 0, false);
  for (const attr of ['position', 'normal', 'uv', 'color', 'emission', 'flame']) {
    assert.ok(geo.attributes[attr], 'missing attribute after merge: ' + attr);
  }
  assert.equal(geo.attributes.position.count, 48, 'two 24-vertex boxes should merge to 48');
  assert.ok(geo.index, 'a merged geometry needs an index');
  geo.dispose();
});

test('every generated stair is marked, and the mesher draws it as a stair', () => {
  const stairs = Object.entries(BLOCK_DEFS).filter(([, d]) => d?.stair);
  assert.ok(stairs.length >= 50, 'expected the stair family, found ' + stairs.length);
  for (const [id, def] of stairs) assert.ok(def.textures?.all, 'stair ' + id + ' needs a texture');

  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);
  const mesher = new ChunkMesher(textures);
  world.setVoxel(4, 4, 4, BLOCKS.OAK_STAIRS);
  const geometries = mesher.meshChunk(chunk, world);
  assert.ok(geometries.lightGeo, 'a stair produces its own geometry, not the cube fast path');
  assert.equal(geometries.lightGeo.attributes.position.count, 48,
    'the mesher drew ' + geometries.lightGeo.attributes.position.count + ' vertices, expected 48');
  for (const v of Object.values(geometries)) v?.dispose?.();
});

test('the rotation table has four distinct facings', () => {
  assert.equal(STAIR_ROTATIONS.length, 4);
  assert.equal(new Set(STAIR_ROTATIONS).size, 4, 'each facing needs its own rotation');
});
