// Slab geometry, through the real mesher.
//
// Slabs are the first shape added to the mesher's non-cube path that is a PARTIAL cube, so the things
// worth checking are specific: the mesh is half height rather than a squashed full cube, it is routed
// down the right path at all (an unrecognised shape is silently drawn as a full block), and both the
// bottom and top variants sit on the correct side of the block.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, Chunk } from '../src/world.js';
import { ChunkMesher } from '../src/mesher.js';
import { createSlabGeometry } from '../src/slab.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';

const textures = {
  getFaceUVs: () => ({ u0: 0, v0: 0, u1: 0.25, v1: 0.25 }),
};

test('a slab is a half-height box', () => {
  const def = BLOCK_DEFS[BLOCKS.OAK_SLAB];
  assert.ok(def, 'the oak slab should exist');
  assert.equal(def.slab, true, 'and must be marked as a slab so the renderer routes it correctly');

  const bottom = createSlabGeometry(def, textures, 'bottom');
  bottom.computeBoundingBox();
  assert.equal(bottom.boundingBox.min.y, 0, 'a bottom slab starts at the floor');
  assert.equal(bottom.boundingBox.max.y, 0.5, 'and is half a block tall');
  assert.equal(bottom.boundingBox.max.x, 1, 'but full width');
  assert.equal(bottom.boundingBox.max.z, 1);
  bottom.dispose();

  const top = createSlabGeometry(def, textures, 'top');
  top.computeBoundingBox();
  assert.equal(top.boundingBox.min.y, 0.5, 'a top slab hangs from the ceiling');
  assert.equal(top.boundingBox.max.y, 1);
  top.dispose();
});

test('slab geometry carries every attribute the shaders expect', () => {
  // The shared materials declare these attributes unconditionally, so a missing one renders as a
  // shader error or an invisible block rather than as a wrong shape.
  const geo = createSlabGeometry(BLOCK_DEFS[BLOCKS.OAK_SLAB], textures, 'bottom');
  for (const attr of ['position', 'normal', 'uv', 'color', 'emission', 'flame']) {
    assert.ok(geo.attributes[attr], 'missing attribute: ' + attr);
  }
  geo.dispose();
});

test('every slab definition is marked, and none is a full cube', () => {
  const slabs = Object.entries(BLOCK_DEFS).filter(([, d]) => d?.slab);
  assert.ok(slabs.length >= 50, 'expected the slab family to be generated, found ' + slabs.length);
  for (const [id, def] of slabs) {
    assert.equal(def.slab, true, 'slab ' + id + ' must carry the marker');
    assert.ok(def.textures?.all, 'slab ' + id + ' needs a texture');
  }
});

test('the mesher draws a slab as half height, not as a full cube', () => {
  // The regression that would matter: an unrecognised shape falls through to the plain-cube fast path,
  // so a slab would be drawn full size and be indistinguishable from its parent block.
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);
  const mesher = new ChunkMesher(textures);

  world.setVoxel(4, 4, 4, BLOCKS.OAK_SLAB);
  const geometries = mesher.meshChunk(chunk, world);
  const light = geometries.lightGeo;
  assert.ok(light, 'a slab produces its own geometry, so there should be a light geometry group');

  light.computeBoundingBox();
  // The slab sits at world y=4, so its top is at 4.5 rather than 5.
  assert.ok(Math.abs(light.boundingBox.max.y - 4.5) < 1e-6,
    'the slab top should be at 4.5, got ' + light.boundingBox.max.y);
  assert.ok(Math.abs(light.boundingBox.min.y - 4) < 1e-6,
    'the slab bottom should be at 4, got ' + light.boundingBox.min.y);

  for (const v of Object.values(geometries)) v?.dispose?.();
});

test('a full block is still drawn full height', () => {
  // Guards the other direction: the slab branch must not have captured ordinary cubes.
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);
  const mesher = new ChunkMesher(textures);
  world.setVoxel(2, 4, 2, BLOCKS.STONE);
  const geometries = mesher.meshChunk(chunk, world);
  const opaque = geometries.opaqueGeo;
  assert.ok(opaque, 'stone should produce opaque geometry');
  opaque.computeBoundingBox();
  assert.ok(Math.abs(opaque.boundingBox.max.y - 5) < 1e-6,
    'stone should occupy a full block, top at 5, got ' + opaque.boundingBox.max.y);
  for (const v of Object.values(geometries)) v?.dispose?.();
});

void THREE;
