// Pressure plate, button and fence gate geometry.
//
// Three small shapes, 41 recipes between them. All are single or few boxes, so the interesting checks
// are the FOOTPRINT of each -- they must not be cubes -- and that the mesher routes all three rather
// than falling back to the cube fast path.
//
// The common failure this guards against is a shape marker that reaches the block definition but not
// the mesher dispatch, which shows up as a plate silently rendering as a full block.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Chunk } from '../src/world.js';
import { ChunkMesher } from '../src/mesher.js';
import { createPressurePlateGeometry, createButtonGeometry, createFenceGateGeometry } from '../src/slab.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';

const textures = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 0.25, v1: 0.25 }) };

/** The mesh bounding box, in the block's own coordinates. */
function localBox(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  return { w: b.max.x - b.min.x, h: b.max.y - b.min.y, d: b.max.z - b.min.z, minY: b.min.y };
}

test('a pressure plate is a thin plate, not a cube', () => {
  const def = BLOCK_DEFS[BLOCKS.STONE_PRESSURE_PLATE];
  assert.ok(def, 'the stone pressure plate should exist');
  assert.equal(def.pressurePlate, true, 'and must be marked so the mesher routes it');

  const geo = createPressurePlateGeometry(def, textures);
  const box = localBox(geo);
  assert.ok(box.h <= 1 / 16 + 1e-6, 'a plate should be one pixel tall, measured ' + box.h);
  assert.ok(box.w > 0.8 && box.w < 1, 'and nearly fill the block horizontally, measured ' + box.w);
  assert.equal(box.minY, 0, 'and sit on the floor');
  assert.equal(geo.attributes.position.count, 24, 'a plate is one box');
  geo.dispose();
});

test('a button is a small box', () => {
  const def = BLOCK_DEFS[BLOCKS.OAK_BUTTON];
  assert.ok(def, 'the oak button should exist');
  assert.equal(def.button, true, 'and must be marked');

  const geo = createButtonGeometry(def, textures);
  const box = localBox(geo);
  assert.ok(Math.abs(box.w - 6 / 16) < 1e-6, 'a button should be 6/16 across, measured ' + box.w);
  assert.ok(Math.abs(box.h - 4 / 16) < 1e-6, 'and 4/16 tall, measured ' + box.h);
  assert.equal(box.minY, 0, 'and sit on the floor');
  geo.dispose();
});

test('a fence gate is four posts with two panels', () => {
  const def = BLOCK_DEFS[BLOCKS.OAK_FENCE_GATE];
  assert.ok(def, 'the oak fence gate should exist');
  assert.equal(def.fenceGate, true, 'and must be marked');

  const geo = createFenceGateGeometry(def, textures);
  // Four posts plus two slats.
  assert.equal(geo.attributes.position.count, 144, 'a gate should be six boxes');
  const box = localBox(geo);
  assert.equal(box.w, 1, 'a gate is a full-block-wide structure');
  assert.equal(box.h, 1, 'and full height');
  geo.dispose();
});

test('every generated plate, button and gate is marked and textured', () => {
  for (const marker of ['pressurePlate', 'button', 'fenceGate']) {
    const items = Object.entries(BLOCK_DEFS).filter(([, d]) => d?.[marker]);
    assert.ok(items.length >= 12, 'expected a ' + marker + ' family, found ' + items.length);
    for (const [id, def] of items) {
      assert.ok(def.textures?.all, marker + ' ' + id + ' needs a texture');
    }
  }
});

test('the mesher draws all three shapes rather than full cubes', () => {
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);
  const mesher = new ChunkMesher(textures);

  const cases = [
    [BLOCKS.STONE_PRESSURE_PLATE, 24, (b) => b.h <= 1 / 16 + 1e-6, 'plate'],
    [BLOCKS.OAK_BUTTON, 24, (b) => Math.abs(b.h - 4 / 16) < 1e-6, 'button'],
    [BLOCKS.OAK_FENCE_GATE, 144, () => true, 'gate'],
  ];
  for (const [id, verts, check, label] of cases) {
    chunk.voxels.fill(0);
    world.setVoxel(4, 4, 4, id);
    const g = mesher.meshChunk(chunk, world);
    assert.ok(g.lightGeo, label + ' should produce its own geometry');
    assert.equal(g.lightGeo.attributes.position.count, verts,
      'the mesher drew ' + g.lightGeo.attributes.position.count + ' vertices for a ' + label
      + ', expected ' + verts);
    const b = localBox(g.lightGeo);
    assert.ok(check(b), label + ' has the wrong profile: height ' + b.h);
    for (const v of Object.values(g)) v?.dispose?.();
  }
});

test('the three shapes are distinct from each other', () => {
  // All three are boxes of different sizes; a copy-paste error would make them identical.
  const def = BLOCK_DEFS[BLOCKS.OAK_BUTTON];
  const plate = localBox(createPressurePlateGeometry(def, textures));
  const button = localBox(createButtonGeometry(def, textures));
  assert.notEqual(plate.h, button.h, 'a plate and a button are different heights');
  assert.notEqual(plate.w, button.w, 'and different widths');
});
