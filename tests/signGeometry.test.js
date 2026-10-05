// Sign geometry.
//
// Two shapes, and the reason they are two families rather than one: `_sign$` also matches
// `_hanging_sign`, so a single family would have given every hanging sign a standing sign's shape.
// Both would still have looked like signs, so the mistake would have been invisible in the world.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Chunk } from '../src/world.js';
import { ChunkMesher } from '../src/mesher.js';
import { createSignGeometry, createHangingSignGeometry } from '../src/slab.js';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';

const textures = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 0.25, v1: 0.25 }) };

function box(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  return { w: b.max.x - b.min.x, h: b.max.y - b.min.y, d: b.max.z - b.min.z, minY: b.min.y, maxY: b.max.y };
}

test('a standing sign is a post with a board on top', () => {
  const def = BLOCK_DEFS[BLOCKS.OAK_SIGN];
  assert.ok(def, 'the oak sign should exist');
  assert.equal(def.sign, true, 'and must be marked so the mesher routes it');

  const geo = createSignGeometry(def, textures, 3);
  const b = box(geo);
  assert.equal(b.minY, 0, 'the post reaches the floor');
  assert.ok(b.h < 1, 'a sign does not fill the block vertically, measured ' + b.h);
  assert.ok(b.w > 0.6, 'the board is wide, measured ' + b.w);
  // Two boxes.
  assert.equal(geo.attributes.position.count, 48, 'a sign is two boxes');
  geo.dispose();
});

test('a hanging sign is a bar with a board below it', () => {
  const def = BLOCK_DEFS[BLOCKS.OAK_HANGING_SIGN];
  assert.ok(def, 'the oak hanging sign should exist');
  assert.equal(def.hangingSign, true, 'and must be marked');
  assert.equal(def.sign, undefined, 'and must NOT also be marked as a standing sign');

  const geo = createHangingSignGeometry(def, textures, 3);
  const b = box(geo);
  assert.equal(b.maxY, 1, 'the bar is at the top of the block');
  assert.ok(b.minY > 0, 'and the board hangs below it, so the block is empty at the floor');
  // Four boxes: bar, board, two links.
  assert.equal(geo.attributes.position.count, 96, 'a hanging sign is four boxes');
  geo.dispose();
});

test('the two sign shapes are different, which is the point of the split', () => {
  const sign = box(createSignGeometry(BLOCK_DEFS[BLOCKS.OAK_SIGN], textures, 3));
  const hanging = box(createHangingSignGeometry(BLOCK_DEFS[BLOCKS.OAK_HANGING_SIGN], textures, 3));
  assert.notEqual(sign.minY, hanging.minY, 'a standing sign reaches the floor and a hanging one does not');
  assert.notEqual(sign.maxY, hanging.maxY, 'and they top out differently');
});

test('every generated sign is marked and textured', () => {
  const signs = Object.entries(BLOCK_DEFS).filter(([, d]) => d?.sign);
  const hanging = Object.entries(BLOCK_DEFS).filter(([, d]) => d?.hangingSign);
  assert.ok(signs.length >= 12, 'expected 12 standing signs, found ' + signs.length);
  assert.ok(hanging.length >= 12, 'expected 12 hanging signs, found ' + hanging.length);
  for (const [id, def] of [...signs, ...hanging]) {
    assert.ok(def.textures?.all, 'sign ' + id + ' needs a texture');
  }
  // No block may be both, or the dispatch order would decide its shape.
  for (const [id, def] of signs) {
    assert.equal(def.hangingSign, undefined, 'sign ' + id + ' is marked both ways');
  }
});

test('the mesher draws a sign as a shape, not a cube', () => {
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);
  const mesher = new ChunkMesher(textures);

  const cases = [[BLOCKS.OAK_SIGN, 48, 'sign'], [BLOCKS.OAK_HANGING_SIGN, 96, 'hanging sign']];
  for (const [id, verts, label] of cases) {
    chunk.voxels.fill(0);
    world.setVoxel(4, 4, 4, id);
    const g = mesher.meshChunk(chunk, world);
    assert.ok(g.lightGeo, label + ' should produce its own geometry');
    assert.equal(g.lightGeo.attributes.position.count, verts,
      'the mesher drew ' + g.lightGeo.attributes.position.count + ' vertices for a ' + label
      + ', expected ' + verts);
    for (const v of Object.values(g)) v?.dispose?.();
  }
});

test('every sign has an item so the recipe has a destination', () => {
  // The recipe produces the sign ITEM, so a sign block without an item would leave the recipe blocked
  // exactly as before the geometry existed.
  //
  // An earlier version of this test collected into a `missing` array it never populated and then
  // asserted that array was empty, which passes whatever the code does. That is worse than no test: it
  // reports coverage of the exact failure it fails to detect.
  const missing = [];
  for (const [key] of Object.entries(BLOCKS)) {
    if (!/_SIGN$/.test(key)) continue;
    // A hanging sign's name also ends in _SIGN, and both forms need an item. The WALL variants have no
    // recipe of their own, so they are skipped.
    if (/_WALL_/.test(key)) continue;
    const lower = key.toLowerCase();
    if (ITEMS[lower] === undefined) missing.push(lower);
  }
  assert.ok(missing.length === 0 || missing.length > 0, 'sanity');
  assert.deepEqual(missing, [],
    'these signs have no item, so their recipe stays blocked: ' + missing.join(', '));
  // And specifically the twelve woods that vanilla has recipes for.
  for (const wood of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'cherry', 'dark_oak',
    'pale_oak', 'mangrove', 'bamboo', 'crimson', 'warped']) {
    assert.ok(ITEMS[wood + '_sign'] !== undefined, wood + '_sign should have an item');
  }
  console.log('  signs with items: '
    + Object.keys(ITEMS).filter(k => /_sign$/.test(k)).length);
});
