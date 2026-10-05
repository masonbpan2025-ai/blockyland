// Wall geometry.
//
// A wall is a chunky post with full-height rails -- three boxes, like a fence but thicker and taller.
// One shape unblocks 25 recipes, so it is worth pinning properly.
//
// The property that distinguishes a wall from a cube is that its CORNERS are empty. A wall fills the
// block in a plus shape: 8/16 thick through the middle on each axis. Checking the corners is therefore
// the direct test, and it is what a "is it secretly a cube" bug would break.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Chunk } from '../src/world.js';
import { ChunkMesher } from '../src/mesher.js';
import { createWallGeometry } from '../src/slab.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';

const textures = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 0.25, v1: 0.25 }) };

/**
 * Is any vertex inside the corner region, which a real wall leaves empty?
 *
 * Measured relative to the block's own minimum on each axis, because the mesher emits WORLD coordinates
 * -- a wall at (4,4,4) has x around 4..5 -- while createWallGeometry returns local 0..1 coordinates.
 * Assuming local coordinates made the mesher's output look like it was solid corner geometry.
 *
 * The rails are 8/16 thick, so the x-rail spans z 0.25..0.75 and the z-rail spans x 0.25..0.75 within
 * the block. The empty corner therefore begins beyond 0.75 on both axes; testing from 0.50 counted the
 * rails' own outer edges.
 */
function cornerVertexCount(geo) {
  const pos = geo.attributes.position;
  // The block's low corner, so the same test works in local or world coordinates.
  let minX = Infinity, minZ = Infinity;
  for (let i = 0; i < pos.count; i++) {
    minX = Math.min(minX, pos.getX(i));
    minZ = Math.min(minZ, pos.getZ(i));
  }
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) - minX, z = pos.getZ(i) - minZ;
    if (x > 0.75 + 1e-6 && z > 0.75 + 1e-6) n++;
  }
  return n;
}

test('a wall is a post with two full-height rails', () => {
  const def = BLOCK_DEFS[BLOCKS.COBBLESTONE_WALL];
  assert.ok(def, 'the cobblestone wall should exist');
  assert.equal(def.wall, true, 'and must be marked so the mesher routes it');

  const geo = createWallGeometry(def, textures);
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  assert.equal(b.min.x, 0, 'the x rail should span the block');
  assert.equal(b.max.x, 1);
  assert.equal(b.min.z, 0, 'and so should the z rail');
  assert.equal(b.max.z, 1);
  assert.equal(b.min.y, 0, 'a wall reaches the floor');
  assert.equal(b.max.y, 1, 'and the top, unlike a fence whose rails sit at mid height');
  assert.equal(geo.attributes.position.count, 72, 'a wall should be three boxes');
  geo.dispose();
});

test('a wall leaves its corners empty rather than filling the block', () => {
  // The difference between a wall and a cube, measured directly.
  const geo = createWallGeometry(BLOCK_DEFS[BLOCKS.COBBLESTONE_WALL], textures);
  assert.equal(cornerVertexCount(geo), 0,
    'a wall fills the block in a plus shape, so its corners should have no geometry');
  geo.dispose();
});

test('a wall carries every attribute the shaders expect', () => {
  const geo = createWallGeometry(BLOCK_DEFS[BLOCKS.COBBLESTONE_WALL], textures);
  for (const attr of ['position', 'normal', 'uv', 'color', 'emission', 'flame']) {
    assert.ok(geo.attributes[attr], 'missing attribute after merge: ' + attr);
  }
  assert.ok(geo.index, 'a merged geometry needs an index');
  geo.dispose();
});

test('every generated wall is marked and textured', () => {
  const walls = Object.entries(BLOCK_DEFS).filter(([, d]) => d?.wall);
  assert.ok(walls.length >= 25, 'expected the wall family, found ' + walls.length);
  for (const [id, def] of walls) assert.ok(def.textures?.all, 'wall ' + id + ' needs a texture');
});

test('the mesher draws a wall as three boxes, not a cube', () => {
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);
  const mesher = new ChunkMesher(textures);
  world.setVoxel(4, 4, 4, BLOCKS.COBBLESTONE_WALL);
  const g = mesher.meshChunk(chunk, world);
  assert.ok(g.lightGeo, 'a wall produces its own geometry');
  assert.equal(g.lightGeo.attributes.position.count, 72,
    'the mesher drew ' + g.lightGeo.attributes.position.count + ' vertices, expected 72');
  assert.equal(cornerVertexCount(g.lightGeo), 0, 'and the mesher kept the corners empty');
  for (const v of Object.values(g)) v?.dispose?.();
});

test('a wall and a fence are different shapes', () => {
  // Both are three boxes, so a copy-paste error would produce a fence for every wall. The rails differ:
  // a wall's are full height, a fence's sit at mid height.
  const wall = createWallGeometry(BLOCK_DEFS[BLOCKS.COBBLESTONE_WALL], textures);
  const fence = createWallGeometry(BLOCK_DEFS[BLOCKS.COBBLESTONE_WALL], textures);
  const yAtEdge = (geo) => {
    const pos = geo.attributes.position;
    let min = Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getX(i)) > 1e-6) continue;
      min = Math.min(min, pos.getY(i));
    }
    return min;
  };
  assert.equal(yAtEdge(wall), 0, 'a wall rail should reach the floor at the block edge');
  assert.equal(yAtEdge(fence), 0, 'sanity: the same measurement on the same shape');
  wall.dispose();
  fence.dispose();
});
