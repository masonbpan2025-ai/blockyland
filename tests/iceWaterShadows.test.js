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

test('water meshing under ice uses flat 0.995 height to prevent z-fighting with ice bottom', () => {
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

  assert.ok(geometries.waterGeo, 'water geometry must be generated under ice for refractive depth');
  const pos = geometries.waterGeo.attributes.position;
  const norm = geometries.waterGeo.attributes.normal;
  // Check the top face (+Y normal) vertices of the water block
  let topFaceVertexCount = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const ny = norm.getY(i);
    if (Math.abs(y - 10.995) < 0.001 && ny === 1) {
      topFaceVertexCount++;
    }
  }
  assert.equal(topFaceVertexCount, 4, 'all 4 vertices of top face of water under ice must be flat at y = 10.995');

  for (const g of Object.values(geometries)) g?.dispose();
});

test('sun shadows configuration uses non-negative bias to prevent self-shadowing acne', () => {
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight();
  configureSunShadows(sun, scene);
  assert.ok(sun.shadow.bias >= 0, `sun shadow bias must be non-negative to avoid shadow acne stripes (was ${sun.shadow.bias})`);
  assert.ok(sun.shadow.normalBias > 0, 'sun shadow normalBias must be positive');
});
