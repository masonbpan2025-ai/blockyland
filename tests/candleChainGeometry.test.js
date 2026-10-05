// Candle and chain geometry.
//
// Both are the last blockers worth more than three recipes each, and both are shapes this project did
// not have. Neither is a cube, and emitting either as one would look wrong -- the rule that has governed
// every geometry decision here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Chunk } from '../src/world.js';
import { ChunkMesher } from '../src/mesher.js';
import { createCandleGeometry, createChainGeometry } from '../src/slab.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { DYE_COLOURS } from '../src/colourPalette.js';

const textures = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 0.25, v1: 0.25 }) };

test('a candle is a narrow column on the floor', () => {
  const def = BLOCK_DEFS[BLOCKS.CANDLE];
  assert.ok(def, 'the plain candle should exist');
  assert.equal(def.candle, true, 'and must be marked so the mesher routes it');

  const geo = createCandleGeometry(def, textures);
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const width = b.max.x - b.min.x;
  assert.ok(Math.abs(width - 2 / 16) < 1e-6, 'a candle should be 2/16 across, measured ' + width);
  assert.equal(b.min.y, 0, 'and stand on the floor');
  assert.ok(Math.abs((b.max.y - b.min.y) - 6 / 16) < 1e-6, 'and be 6/16 tall');
  assert.ok(Math.abs(b.min.x - 7 / 16) < 1e-6, 'and centred in the block');
  geo.dispose();
});

test('every candle colour exists and is marked', () => {
  for (const colour of Object.keys(DYE_COLOURS)) {
    const id = BLOCKS[colour.toUpperCase() + '_CANDLE'];
    assert.ok(id !== undefined, colour + '_candle should exist');
    assert.equal(BLOCK_DEFS[id].candle, true, colour + ' candle must be marked');
    assert.ok(BLOCK_DEFS[id].textures?.all, colour + ' candle needs a texture');
  }
  // Plus the undyed candle, which vanilla has as its own block.
  assert.ok(BLOCKS.CANDLE !== undefined, 'the plain candle should exist');
});

test('a chain is a thin post, not a cube', () => {
  const def = BLOCK_DEFS[BLOCKS.CHAIN];
  assert.ok(def, 'the chain should exist');
  assert.equal(def.chain, true, 'and must be marked so the mesher routes it');

  const geo = createChainGeometry(def, textures);
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const width = b.max.x - b.min.x;
  assert.ok(width < 0.5, 'a chain should be well under half a block across, measured ' + width);
  assert.ok(width > 0, 'and have some width');
  assert.equal(b.min.y, 0, 'a chain occupies the block from the floor');
  // Two segments, so two boxes worth of vertices.
  assert.equal(geo.attributes.position.count, 48, 'a chain is two boxes');
  for (const attr of ['position', 'normal', 'uv', 'color', 'emission', 'flame']) {
    assert.ok(geo.attributes[attr], 'missing attribute: ' + attr);
  }
  geo.dispose();
});

test('the mesher draws a candle and a chain without the cube fast path', () => {
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);
  const mesher = new ChunkMesher(textures);

  world.setVoxel(4, 4, 4, BLOCKS.CANDLE);
  let g = mesher.meshChunk(chunk, world);
  assert.ok(g.lightGeo, 'a candle should produce its own geometry');
  g.lightGeo.computeBoundingBox();
  const candleWidth = g.lightGeo.boundingBox.max.x - g.lightGeo.boundingBox.min.x;
  assert.ok(Math.abs(candleWidth - 2 / 16) < 1e-6,
    'the mesher drew a candle ' + candleWidth + ' wide, expected 2/16');
  for (const v of Object.values(g)) v?.dispose?.();

  chunk.voxels.fill(0);
  world.setVoxel(4, 4, 4, BLOCKS.CHAIN);
  g = mesher.meshChunk(chunk, world);
  assert.ok(g.lightGeo, 'a chain should produce its own geometry');
  assert.equal(g.lightGeo.attributes.position.count, 48,
    'the mesher drew ' + g.lightGeo.attributes.position.count + ' vertices for a chain, expected 48');
  for (const v of Object.values(g)) v?.dispose?.();
});

test('an ordinary block is still a full cube', () => {
  // The guard in the other direction, now that five shapes share one dispatch condition.
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);
  const mesher = new ChunkMesher(textures);
  world.setVoxel(2, 4, 2, BLOCKS.STONE);
  const g = mesher.meshChunk(chunk, world);
  g.opaqueGeo.computeBoundingBox();
  assert.ok(Math.abs(g.opaqueGeo.boundingBox.max.y - 5) < 1e-6, 'stone should still be a full block');
  assert.ok(Math.abs((g.opaqueGeo.boundingBox.max.x - g.opaqueGeo.boundingBox.min.x) - 1) < 1e-6,
    'and full width');
  for (const v of Object.values(g)) v?.dispose?.();
});
