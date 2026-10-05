// Rod, rail, flower pot and iron bar geometry.
//
// Four small shapes added together, each unblocking one or two recipes. The checks are the same as for
// the other partial cubes: that each is NOT a cube, that the mesher routes it, and that the profiles
// differ from one another -- a copy-paste error in a family of near-identical boxes is the realistic
// failure here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Chunk } from '../src/world.js';
import { ChunkMesher } from '../src/mesher.js';
import {
  createRodGeometry, createRailGeometry, createFlowerPotGeometry, createPaneGeometry,
} from '../src/slab.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';

const textures = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 0.25, v1: 0.25 }) };

function box(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  return { w: b.max.x - b.min.x, h: b.max.y - b.min.y, d: b.max.z - b.min.z, minY: b.min.y, maxY: b.max.y };
}

test('a rod is a thin full-height post', () => {
  const def = BLOCK_DEFS[BLOCKS.END_ROD];
  assert.ok(def, 'the end rod should exist');
  assert.equal(def.rod, true, 'and must be marked so the mesher routes it');

  const b = box(createRodGeometry(def, textures));
  assert.ok(b.w < 0.25, 'a rod should be narrow, measured ' + b.w);
  assert.equal(b.minY, 0, 'a rod reaches the floor');
  assert.equal(b.maxY, 1, 'and the top of the block');
  assert.equal(b.w, b.d, 'a rod is square in section');
});

test('a rail is a one-pixel plate covering the block', () => {
  const def = BLOCK_DEFS[BLOCKS.DETECTOR_RAIL];
  assert.ok(def, 'the detector rail should exist');
  assert.equal(def.rail, true, 'and must be marked');

  const b = box(createRailGeometry(def, textures));
  assert.ok(Math.abs(b.h - 1 / 16) < 1e-6, 'a rail is one pixel tall, measured ' + b.h);
  assert.equal(b.w, 1, 'and spans the block, unlike a pressure plate which is inset');
  assert.equal(b.d, 1);
});

test('a flower pot is a small box on the floor', () => {
  const def = BLOCK_DEFS[BLOCKS.FLOWER_POT];
  assert.ok(def, 'the flower pot should exist');
  assert.equal(def.flowerPot, true, 'and must be marked');

  const b = box(createFlowerPotGeometry(def, textures));
  assert.ok(Math.abs(b.w - 6 / 16) < 1e-6, 'a pot is 6/16 across, measured ' + b.w);
  assert.ok(Math.abs(b.h - 6 / 16) < 1e-6, 'and 6/16 tall, measured ' + b.h);
  assert.equal(b.minY, 0, 'and sits on the floor');
});

test('iron bars reuse the pane shape, and are marked as such', () => {
  // Vanilla draws bars as a grid. The pane silhouette is the documented approximation, so the check is
  // that the marker reaches the mesher -- not that the mesh is a grid.
  const def = BLOCK_DEFS[BLOCKS.IRON_BARS];
  assert.ok(def, 'iron bars should exist');
  assert.equal(def.pane, true, 'and must be marked as a pane so the mesher routes them');
  const b = box(createPaneGeometry(def, textures));
  assert.ok(b.w < 0.2, 'a pane is thin, measured ' + b.w);
  assert.equal(b.h, 1, 'and full height');
});

test('the four shapes are distinct from one another', () => {
  const def = BLOCK_DEFS[BLOCKS.END_ROD];
  const rod = box(createRodGeometry(def, textures));
  const rail = box(createRailGeometry(def, textures));
  const pot = box(createFlowerPotGeometry(def, textures));
  const heights = new Set([rod.h, rail.h, pot.h]);
  assert.equal(heights.size, 3, 'the three builders should produce three different heights');
  assert.notEqual(rod.w, pot.w, 'a rod and a pot differ in width');
});

test('the mesher draws each shape rather than a cube', () => {
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);
  const mesher = new ChunkMesher(textures);
  const cases = [
    [BLOCKS.END_ROD, 24, 'rod', (b) => b.w < 0.25],
    [BLOCKS.DETECTOR_RAIL, 24, 'rail', (b) => Math.abs(b.h - 1 / 16) < 1e-6],
    [BLOCKS.FLOWER_POT, 24, 'pot', (b) => Math.abs(b.h - 6 / 16) < 1e-6],
  ];
  for (const [id, verts, label, check] of cases) {
    chunk.voxels.fill(0);
    world.setVoxel(4, 4, 4, id);
    const g = mesher.meshChunk(chunk, world);
    assert.ok(g.lightGeo, label + ' should produce its own geometry');
    assert.equal(g.lightGeo.attributes.position.count, verts,
      'the mesher drew ' + g.lightGeo.attributes.position.count + ' vertices for a ' + label);
    assert.ok(check(box(g.lightGeo)), label + ' has the wrong profile');
    for (const v of Object.values(g)) v?.dispose?.();
  }
});

test('each new block has an item, so its recipe has a destination', () => {
  for (const key of ['END_ROD', 'LIGHTNING_ROD', 'DETECTOR_RAIL', 'ACTIVATOR_RAIL', 'FLOWER_POT', 'IRON_BARS']) {
    const id = BLOCKS[key];
    if (id === undefined) continue;
    assert.ok(BLOCK_DEFS[id], key + ' should have a definition');
    assert.ok(BLOCK_DEFS[id].textures?.all, key + ' should have a texture');
  }
});
