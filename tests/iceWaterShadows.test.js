import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS } from '../src/blocks.js';
import { World, Chunk } from '../src/world.js';
import { ChunkMesher } from '../src/mesher.js';
import { createWaterMaterial } from '../src/water.js';
import { waterHeight, waterCornerHeight } from '../src/waterGeometry.js';
import { TERRAIN_SHADOW_CHUNK } from '../src/terrainShadowSampling.js';
import { configureSunShadows } from '../src/lighting.js';

test('water material uses slope-tracked shadow sampling and defines HAS_NORMAL for normalBias', () => {
  const mat = createWaterMaterial();
  assert.equal(mat.defines?.HAS_NORMAL, '', 'HAS_NORMAL must be defined so Three.js applies normalBias in shadowmap_vertex');
  assert.ok(mat.fragmentShader.includes('dFdx(shadowCoord.xyz)'), 'water fragment shader must include TERRAIN_SHADOW_CHUNK slope tracking');
  assert.ok(mat.fragmentShader.includes('dot(receiverSlope, vogelDiskSample'), 'water fragment shader must adjust sample depth by receiver slope');
  mat.dispose();
});

test('waterHeight and waterCornerHeight treat ice and frosted ice as full ceiling', () => {
  const world = new World();
  world.setVoxel(0, 10, 0, BLOCKS.WATER);
  world.setVoxel(0, 11, 0, BLOCKS.ICE);
  assert.equal(waterHeight(world, 0, 10, 0), 1, 'water topped with ice must have full height 1');
  assert.equal(waterCornerHeight(world, 0, 10, 0), 1, 'water corners topped with ice must have full height 1');

  world.setVoxel(0, 11, 0, BLOCKS.FROSTED_ICE);
  assert.equal(waterHeight(world, 0, 10, 0), 1, 'water topped with frosted ice must have full height 1');
  assert.equal(waterCornerHeight(world, 0, 10, 0), 1, 'water corners topped with frosted ice must have full height 1');
});

test('water under ice culls its top face to eliminate coplanar z-fighting stripes', () => {
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);
  // Place water at y=10 and ice at y=11
  chunk.setVoxel(4, 10, 4, BLOCKS.WATER);
  chunk.setVoxel(4, 11, 4, BLOCKS.ICE);
  // Sand below
  chunk.setVoxel(4, 9, 4, BLOCKS.SAND);

  const tm = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };
  const mesher = new ChunkMesher(tm);
  const geometries = mesher.meshChunk(chunk, world);

  // Water under ice must not generate a top face (+Y normal) to avoid z-fighting stripes with ice bottom
  if (geometries.waterGeo) {
    const pos = geometries.waterGeo.attributes.position;
    const norm = geometries.waterGeo.attributes.normal;
    let topFaceVertexCount = 0;
    for (let i = 0; i < pos.count; i++) {
      const ny = norm.getY(i);
      if (ny === 1) topFaceVertexCount++;
    }
    assert.equal(topFaceVertexCount, 0, 'water top face under ice must be culled to eliminate z-fighting stripes');
  }

  // Ice must be cleanly meshed
  assert.ok(geometries.transparentGeo, 'ice must be meshed in transparent geometry');
  assert.equal(geometries.transparentGeo.attributes.position.count, 24, 'ice block should emit 6 faces (24 vertices)');

  for (const g of Object.values(geometries)) g?.dispose();
});

test('water culls all faces against adjacent ice and frosted ice blocks', () => {
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);

  // 3x3 water pool submerged completely beneath a 3x3 ice sheet, surrounded by stone
  for (let x = 3; x <= 5; x++) {
    for (let z = 3; z <= 5; z++) {
      chunk.setVoxel(x, 9, z, BLOCKS.STONE);   // bottom
      chunk.setVoxel(x, 10, z, BLOCKS.WATER);  // water layer
      chunk.setVoxel(x, 11, z, BLOCKS.ICE);    // ice ceiling
    }
  }
  // Surrounding stone walls
  for (let y = 9; y <= 11; y++) {
    for (let x = 2; x <= 6; x++) {
      chunk.setVoxel(x, y, 2, BLOCKS.STONE);
      chunk.setVoxel(x, y, 6, BLOCKS.STONE);
    }
    for (let z = 2; z <= 6; z++) {
      chunk.setVoxel(2, y, z, BLOCKS.STONE);
      chunk.setVoxel(6, y, z, BLOCKS.STONE);
    }
  }

  const tm = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };
  const mesher = new ChunkMesher(tm);
  const geometries = mesher.meshChunk(chunk, world);

  // Submerged water enclosed by stone and ice should emit zero interior or top faces
  assert.equal(geometries.waterGeo, null, 'enclosed water beneath ice and stone must produce no internal/top faces');

  for (const g of Object.values(geometries)) g?.dispose();
});

test('water adjacent to ice on horizontal sides culls side faces to prevent dual-face z-fighting', () => {
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);

  // Water at (4, 10, 4) and Ice at (5, 10, 4) with sand beneath both
  chunk.setVoxel(4, 9, 4, BLOCKS.SAND);
  chunk.setVoxel(5, 9, 4, BLOCKS.SAND);
  chunk.setVoxel(4, 10, 4, BLOCKS.WATER);
  chunk.setVoxel(5, 10, 4, BLOCKS.ICE);

  const tm = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };
  const mesher = new ChunkMesher(tm);
  const geometries = mesher.meshChunk(chunk, world);

  assert.ok(geometries.waterGeo, 'water geometry must exist for open faces');
  const pos = geometries.waterGeo.attributes.position;
  const norm = geometries.waterGeo.attributes.normal;

  // Verify water does NOT emit an East face (+X normal) against the ice block
  let eastFaceVertexCount = 0;
  for (let i = 0; i < pos.count; i++) {
    const nx = norm.getX(i);
    if (nx === 1) eastFaceVertexCount++;
  }
  assert.equal(eastFaceVertexCount, 0, 'water face adjacent to ice must be culled to eliminate dual-face z-fighting');

  for (const g of Object.values(geometries)) g?.dispose();
});

test('sun shadows configuration uses negative bias and normalBias to prevent self-shadowing acne and stripes', () => {
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight();
  configureSunShadows(sun, scene);
  assert.ok(sun.shadow.bias < 0, `sun shadow bias must be negative to pull receiver depth toward light and eliminate acne stripes (was ${sun.shadow.bias})`);
  assert.ok(sun.shadow.normalBias >= 0.05, `sun shadow normalBias must be at least 0.05 for sloped and stair geometry (was ${sun.shadow.normalBias})`);
});
