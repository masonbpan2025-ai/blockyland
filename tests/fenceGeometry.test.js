// Fence geometry.
//
// A fence is a post with two rails -- three boxes -- so the checks are the same shape as the other
// multi-box builds: that the merge preserved every attribute, that the mesher routes it off the cube
// fast path, and that the parts are where they should be rather than collapsed into one box.
//
// The rails deliberately do NOT follow neighbours. Vanilla connects a fence only toward other fences
// and solid blocks, which needs neighbour state the mesher does not pass for this shape, so every fence
// is drawn as a cross. That is the honest approximation: never wrong about being a fence, occasionally
// over-connected. These tests pin that behaviour so a future change to it is deliberate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Chunk } from '../src/world.js';
import { ChunkMesher } from '../src/mesher.js';
import { createFenceGeometry } from '../src/slab.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';

const textures = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 0.25, v1: 0.25 }) };

test('a fence is a post with two rails', () => {
  const def = BLOCK_DEFS[BLOCKS.OAK_FENCE];
  assert.ok(def, 'the oak fence should exist');
  assert.equal(def.fence, true, 'and must be marked so the mesher routes it');

  const geo = createFenceGeometry(def, textures);
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  // The rails span the block on both horizontal axes, so the overall box fills it.
  assert.equal(b.min.x, 0, 'the x rail should span the block');
  assert.equal(b.max.x, 1);
  assert.equal(b.min.z, 0, 'and so should the z rail');
  assert.equal(b.max.z, 1);
  assert.equal(b.min.y, 0, 'the post reaches the floor');
  assert.equal(b.max.y, 1, 'and the top');
  // Three boxes of 24 vertices.
  assert.equal(geo.attributes.position.count, 72, 'a fence should be three boxes');
  geo.dispose();
});

test('a fence carries every attribute the shaders expect', () => {
  const geo = createFenceGeometry(BLOCK_DEFS[BLOCKS.OAK_FENCE], textures);
  for (const attr of ['position', 'normal', 'uv', 'color', 'emission', 'flame']) {
    assert.ok(geo.attributes[attr], 'missing attribute after merge: ' + attr);
  }
  assert.ok(geo.index, 'a merged geometry needs an index');
  geo.dispose();
});

test('the post is narrow, so a fence is not a wall', () => {
  // A fence that filled the block would look like a wall. The post is 4/16, and counting vertices at
  // the block edge that belong only to the rails is what distinguishes them.
  const geo = createFenceGeometry(BLOCK_DEFS[BLOCKS.OAK_FENCE], textures);
  const pos = geo.attributes.position;
  let atXEdge = 0;
  let midY = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    if (Math.abs(x) < 1e-6 || Math.abs(x - 1) < 1e-6) atXEdge++;
    // The post alone reaches the top; the rails sit around y 6/16..9/16.
    if (y > 0.3 && y < 0.7) midY++;
  }
  assert.ok(atXEdge > 0, 'the rails should reach the block edge');
  assert.ok(midY > 0, 'the rails should sit at mid height');
  // The rails are 3/16 tall, so nothing but the post exists above them and below the top.
  let betweenRailAndTop = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 0.6 && y < 0.99) betweenRailAndTop++;
  }
  assert.equal(betweenRailAndTop, 0,
    'nothing should sit between the rails and the top of the post');
  geo.dispose();
});

test('every generated fence is marked', () => {
  const fences = Object.entries(BLOCK_DEFS).filter(([, d]) => d?.fence);
  assert.ok(fences.length >= 12, 'expected the fence family, found ' + fences.length);
  for (const [id, def] of fences) assert.ok(def.textures?.all, 'fence ' + id + ' needs a texture');
});

test('the mesher draws a fence as three boxes, not a cube', () => {
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);
  const mesher = new ChunkMesher(textures);
  world.setVoxel(4, 4, 4, BLOCKS.OAK_FENCE);
  const g = mesher.meshChunk(chunk, world);
  assert.ok(g.lightGeo, 'a fence produces its own geometry');
  assert.equal(g.lightGeo.attributes.position.count, 72,
    'the mesher drew ' + g.lightGeo.attributes.position.count + ' vertices, expected 72');
  for (const v of Object.values(g)) v?.dispose?.();
});
