import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { Chunk } from '../src/world.js';
import { ChunkMesher } from '../src/mesher.js';
import { createBlockGeometry, enableBlockEmission } from '../src/blockGeometry.js';
import { TERRAIN_SHADOW_CHUNK, terrainShadowChunk } from '../src/terrainShadowSampling.js';

const tm = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };

test('all PCF taps follow receiver depth, with slope allowance before divergent branches', () => {
  assert.equal((TERRAIN_SHADOW_CHUNK.match(/dot\(receiverSlope, vogelDiskSample/g) || []).length, 5);
  const pcf = TERRAIN_SHADOW_CHUNK.slice(TERRAIN_SHADOW_CHUNK.indexOf('float getShadow('));
  assert.ok(pcf.indexOf('dFdx(shadowCoord.xyz)') < pcf.indexOf('if ( frustumTest )'));
  assert.ok(pcf.includes('abs(receiverDet) > 1e-12'), 'degenerate gradients never divide by zero');
  assert.ok(pcf.includes('dot(abs(receiverSlope), 1.0 / shadowMapSize)'));
});

test('point-light shadow sampling is unchanged', () => {
  const start = THREE.ShaderChunk.shadowmap_pars_fragment.indexOf('float getPointShadow(');
  assert.ok(start > 0);
  assert.equal(TERRAIN_SHADOW_CHUNK.slice(TERRAIN_SHADOW_CHUNK.indexOf('float getPointShadow(')), THREE.ShaderChunk.shadowmap_pars_fragment.slice(start));
});

test('all voxel materials install stable shadow sampling while retaining wind and flame masks', () => {
  for (const Material of [THREE.MeshLambertMaterial, THREE.MeshPhongMaterial]) {
    const material = new Material();
    enableBlockEmission(material);
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    material.onBeforeCompile(shader);
    assert.ok(shader.fragmentShader.includes(TERRAIN_SHADOW_CHUNK));
    assert.ok(shader.vertexShader.includes('wind * windStrength'));
    assert.ok(shader.fragmentShader.includes('if (vFlame > 0.5)'));
    assert.equal(material.defaultAttributeValues.wind[0], 0);
    assert.equal(material.defaultAttributeValues.flame[0], 0);
    assert.ok(material.customProgramCacheKey().includes('stable-shadows'));
    material.dispose();
  }
});

test('sand, snow, grass, building blocks and partial models carry no wind or fire animation', () => {
  for (const id of [BLOCKS.SAND, BLOCKS.RED_SAND, BLOCKS.SNOW, BLOCKS.SNOW_LAYER, BLOCKS.POWDER_SNOW, BLOCKS.GRASS, BLOCKS.DIRT, BLOCKS.STONE, BLOCKS.OAK_LOG, BLOCKS.OAK_PLANKS, BLOCKS.FURNACE, BLOCKS.WHITE_CARPET]) {
    const chunk = new Chunk(0, 0); chunk.setVoxel(8, 2, 8, id);
    const world = { getVoxel: (x, y, z) => chunk.getVoxel(x, y, z) };
    const geometries = new ChunkMesher(tm).meshChunk(chunk, world);
    for (const geometry of Object.values(geometries).filter(Boolean)) {
      assert.ok(!geometry.attributes.wind || [...geometry.attributes.wind.array].every(v => v === 0), `${BLOCK_DEFS[id].name}: wind`);
      assert.ok([...geometry.attributes.flame?.array || []].every(v => v === 0), `${BLOCK_DEFS[id].name}: fire`);
      geometry.dispose();
    }
    const preview = createBlockGeometry(id, tm);
    assert.ok(!preview.attributes.wind || [...preview.attributes.wind.array].every(v => v === 0));
    preview.dispose();
  }
});

test('foliage retains wind movement and fire retains its separate animation', () => {
  for (const id of [BLOCKS.OAK_LEAVES, BLOCKS.BIRCH_LEAVES, BLOCKS.SPRUCE_LEAVES]) {
    const chunk = new Chunk(0, 0); chunk.setVoxel(8, 2, 8, id);
    const meshes = new ChunkMesher(tm).meshChunk(chunk, { getVoxel: (x, y, z) => chunk.getVoxel(x, y, z) });
    assert.ok([...meshes.transparentGeo.attributes.wind.array].every(v => v === 1));
    for (const g of Object.values(meshes)) g?.dispose();
  }
  const fire = createBlockGeometry(BLOCKS.FIRE, tm);
  assert.ok([...fire.attributes.flame.array].every(v => v === 1));
  fire.dispose();
});

test('an incompatible dependency shader reports its missing PCF contract', () => {
  assert.throws(() => terrainShadowChunk('void main() {}'), /Unsupported/);
  assert.throws(() => terrainShadowChunk('shadowCoord.z += shadowBias;'), /PCF taps: 0/);
});
