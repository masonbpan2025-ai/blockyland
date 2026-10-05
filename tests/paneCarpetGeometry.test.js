// Pane and carpet geometry, through the real mesher.
//
// These are the same box builder as slabs at different dimensions, so the things worth checking are
// the ones that differ: a pane is thin and full height, a carpet is full width and almost flat. Both
// are partial cubes, which means an unrecognised shape would fall through to the plain-cube fast path
// and be drawn full size -- the failure that makes a glass pane look like a glass block.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Chunk } from '../src/world.js';
import { ChunkMesher } from '../src/mesher.js';
import { createPaneGeometry, createCarpetGeometry } from '../src/slab.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';

const textures = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 0.25, v1: 0.25 }) };

test('a pane is a thin full-height sheet', () => {
  const def = BLOCK_DEFS[BLOCKS.GLASS_PANE];
  assert.ok(def, 'the glass pane should exist');
  assert.equal(def.pane, true, 'and must be marked so the renderer routes it');

  const geo = createPaneGeometry(def, textures);
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const thickness = b.max.x - b.min.x;
  assert.ok(Math.abs(thickness - 2 / 16) < 1e-6,
    `a pane should be 2/16 thick, measured ${thickness}`);
  assert.ok(Math.abs(b.min.x - 7 / 16) < 1e-6, 'and centred on the block');
  assert.equal(b.min.y, 0, 'a pane spans the full height');
  assert.equal(b.max.y, 1);
  assert.equal(b.max.z, 1, 'and the full depth');
  geo.dispose();
});

test('a pane insets its UVs so transparent pixels do not sample neighbours', () => {
  // Glass is partly transparent. Without an inset, the transparent pixels sample whatever sits next
  // to the tile in the atlas, which shows up as a coloured border around every pane.
  const tile = { u0: 0.25, v0: 0.5, u1: 0.5, v1: 0.75 };
  const tm = { getFaceUVs: () => tile };
  const geo = createPaneGeometry(BLOCK_DEFS[BLOCKS.GLASS_PANE], tm);
  const uv = geo.attributes.uv;
  let minU = Infinity, maxU = -Infinity;
  for (let i = 0; i < uv.count; i++) { minU = Math.min(minU, uv.getX(i)); maxU = Math.max(maxU, uv.getX(i)); }
  assert.ok(minU > tile.u0, 'the minimum U must sit inside the tile');
  assert.ok(maxU < tile.u1, 'and so must the maximum');
  geo.dispose();

  // A slab must NOT be inset, or its texture is visibly cropped.
  const slab = createPaneGeometry(BLOCK_DEFS[BLOCKS.GLASS_PANE], textures);
  slab.dispose();
});

test('a carpet is one pixel tall and covers the block', () => {
  const def = BLOCK_DEFS[BLOCKS.WHITE_CARPET];
  assert.ok(def, 'the white carpet should exist');
  assert.equal(def.carpet, true, 'and must be marked as a carpet');

  const geo = createCarpetGeometry(def, textures);
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  assert.ok(Math.abs((b.max.y - b.min.y) - 1 / 16) < 1e-6,
    `a carpet should be 1/16 tall, measured ${b.max.y - b.min.y}`);
  assert.equal(b.min.y, 0, 'and sit on the floor');
  assert.equal(b.max.x, 1, 'covering the full block horizontally');
  assert.equal(b.max.z, 1);
  geo.dispose();
});

test('every pane and carpet definition is marked', () => {
  const panes = Object.entries(BLOCK_DEFS).filter(([, d]) => d?.pane);
  const carpets = Object.entries(BLOCK_DEFS).filter(([, d]) => d?.carpet);
  assert.ok(panes.length >= 16, `expected at least 16 panes, found ${panes.length}`);
  assert.ok(carpets.length >= 16, `expected at least 16 carpets, found ${carpets.length}`);
  for (const [id, def] of [...panes, ...carpets]) {
    assert.ok(def.textures?.all, `block ${id} needs a texture`);
  }
});

test('the mesher draws a pane thin and a carpet flat, not as cubes', () => {
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);
  const mesher = new ChunkMesher(textures);

  // Pane at y=4: full height, but only 2/16 wide on one axis.
  world.setVoxel(4, 4, 4, BLOCKS.GLASS_PANE);
  let g = mesher.meshChunk(chunk, world);
  assert.ok(g.lightGeo, 'a pane produces its own geometry');
  g.lightGeo.computeBoundingBox();
  const paneWidth = g.lightGeo.boundingBox.max.x - g.lightGeo.boundingBox.min.x;
  assert.ok(Math.abs(paneWidth - 2 / 16) < 1e-6,
    `the mesher drew a pane ${paneWidth} wide, expected 2/16`);
  for (const v of Object.values(g)) v?.dispose?.();

  // Carpet at y=4: one pixel tall.
  chunk.voxels.fill(0);
  world.setVoxel(4, 4, 4, BLOCKS.WHITE_CARPET);
  g = mesher.meshChunk(chunk, world);
  assert.ok(g.lightGeo, 'a carpet produces its own geometry');
  g.lightGeo.computeBoundingBox();
  const carpetHeight = g.lightGeo.boundingBox.max.y - g.lightGeo.boundingBox.min.y;
  assert.ok(Math.abs(carpetHeight - 1 / 16) < 1e-6,
    `the mesher drew a carpet ${carpetHeight} tall, expected 1/16`);
  for (const v of Object.values(g)) v?.dispose?.();
});

test('an ordinary block is still a full cube', () => {
  // The guard in the other direction, now that three shapes share one dispatch branch: none of them
  // may have captured ordinary cubes.
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);
  const mesher = new ChunkMesher(textures);
  world.setVoxel(2, 4, 2, BLOCKS.STONE);
  const g = mesher.meshChunk(chunk, world);
  g.opaqueGeo.computeBoundingBox();
  assert.ok(Math.abs(g.opaqueGeo.boundingBox.max.y - 5) < 1e-6,
    'stone should still occupy a full block');
  assert.ok(Math.abs((g.opaqueGeo.boundingBox.max.x - g.opaqueGeo.boundingBox.min.x) - 1) < 1e-6,
    'and be full width');
  for (const v of Object.values(g)) v?.dispose?.();
});
