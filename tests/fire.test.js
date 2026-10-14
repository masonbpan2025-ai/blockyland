import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { createBlockGeometry, enableBlockEmission } from '../src/blockGeometry.js';
import { ChunkMesher } from '../src/mesher.js';
import { World, Chunk } from '../src/world.js';
import { TextureManager } from '../src/textures.js';

test('Fire Block Definition: References existing assets and has authentic properties', () => {
  const def = BLOCK_DEFS[BLOCKS.FIRE];
  assert.ok(def, 'BLOCKS.FIRE definition exists in BLOCK_DEFS');
  assert.equal(def.name, 'Fire');
  assert.equal(def.transparent, true, 'Fire is transparent');
  assert.equal(def.solid, false, 'Fire is non-solid');
  assert.equal(def.plant, true, 'Fire behaves like a plant-style non-solid block');
  assert.equal(def.light, 15, 'Fire emits maximum light level 15');

  // Verify both fire.png and fire.svg exist in public/assets/blocks/
  const pngPath = path.join(process.cwd(), 'public', 'assets', 'blocks', 'fire.png');
  const svgPath = path.join(process.cwd(), 'public', 'assets', 'blocks', 'fire.svg');
  assert.ok(fs.existsSync(pngPath), 'fire.png asset exists');
  assert.ok(fs.existsSync(svgPath), 'fire.svg asset exists');

  // Verify the texture referenced in BLOCK_DEFS exists on disk
  const refPath = path.join(process.cwd(), 'public', 'assets', 'blocks', def.textures.all);
  assert.ok(fs.existsSync(refPath), `Referenced texture ${def.textures.all} exists on disk`);
});

test('Fire Geometry: Volumetric 4-plane flame geometry carries flame, flameUv, and emission attributes', () => {
  const dummyTextures = {
    getFaceUVs: () => ({ u0: 0.1, v0: 0.1, u1: 0.2, v1: 0.2 })
  };

  const geo = createBlockGeometry(BLOCKS.FIRE, dummyTextures);
  assert.ok(geo, 'Fire geometry created');
  assert.equal(geo.attributes.position.count, 16, 'Fire consists of 4 intersecting planes (16 vertices)');
  assert.ok(geo.attributes.uv, 'UV attribute exists');
  assert.ok(geo.attributes.flame, 'Flame attribute exists');
  assert.ok(geo.attributes.flameUv, 'FlameUv attribute exists');
  assert.ok(geo.attributes.emission, 'Emission attribute exists');

  // Check flame attribute is 1.0 for all fire vertices
  for (let i = 0; i < geo.attributes.flame.count; i++) {
    assert.equal(geo.attributes.flame.getX(i), 1.0, 'Flame flag is 1.0 for fire vertices');
  }

  // Check flameUv coordinates range from 0.0 to 1.0
  let minU = 1, maxU = 0, minV = 1, maxV = 0;
  for (let i = 0; i < geo.attributes.flameUv.count; i++) {
    const u = geo.attributes.flameUv.getX(i);
    const v = geo.attributes.flameUv.getY(i);
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  assert.equal(minU, 0.0);
  assert.equal(maxU, 1.0);
  assert.equal(minV, 0.0);
  assert.equal(maxV, 1.0);
});

test('Fire Geometry Merging: Fire merges with lava and light blocks without losing flame attributes', () => {
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      chunk.setVoxel(x, 0, z, BLOCKS.STONE);
    }
  }

  chunk.setVoxel(4, 1, 4, BLOCKS.FIRE);
  chunk.setVoxel(8, 1, 8, BLOCKS.LAVA);

  const dummyTextures = {
    getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 })
  };

  const mesher = new ChunkMesher(dummyTextures);
  const { lightGeo } = mesher.meshChunk(chunk, world);

  assert.ok(lightGeo, 'lightGeo created for fire and lava');
  assert.ok(lightGeo.attributes.flame, 'lightGeo carries flame attribute');
  assert.ok(lightGeo.attributes.flameUv, 'lightGeo carries flameUv attribute');
  assert.equal(lightGeo.attributes.flame.count, lightGeo.attributes.position.count);
  assert.equal(lightGeo.attributes.flameUv.count, lightGeo.attributes.position.count);
});

test('Non-Fire Geometries: Receive safe default flame attributes', () => {
  const dummyTextures = {
    getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 })
  };

  // Test torch
  const torchGeo = createBlockGeometry(BLOCKS.TORCH, dummyTextures);
  assert.ok(torchGeo.attributes.flame);
  assert.ok(torchGeo.attributes.flameUv);
  for (let i = 0; i < torchGeo.attributes.flame.count; i++) {
    assert.equal(torchGeo.attributes.flame.getX(i), 0.0, 'Torch flame attribute is 0');
  }

  // Test chest
  const chestGeo = createBlockGeometry(BLOCKS.CHEST, dummyTextures);
  assert.ok(chestGeo.attributes.flame);
  assert.ok(chestGeo.attributes.flameUv);
  for (let i = 0; i < chestGeo.attributes.flame.count; i++) {
    assert.equal(chestGeo.attributes.flame.getX(i), 0.0, 'Chest flame attribute is 0');
  }
});

test('Fire Shader: Injects procedural flame animation, color grading, and discard logic', () => {
  const material = new THREE.MeshLambertMaterial();
  enableBlockEmission(material);

  assert.ok(material.defaultAttributeValues.flame, 'Default attribute flame defined');
  assert.ok(material.defaultAttributeValues.flameUv, 'Default attribute flameUv defined');
  assert.equal(material.customProgramCacheKey(), 'voxel-emission-wind-fire-snow-stable-shadows-v7');

  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.lambert.vertexShader,
    fragmentShader: THREE.ShaderLib.lambert.fragmentShader
  };

  material.onBeforeCompile(shader);

  // Vertex Shader Checks
  assert.ok(shader.vertexShader.includes('attribute float flame;'), 'Vertex shader declares flame attribute');
  assert.ok(shader.vertexShader.includes('attribute vec2 flameUv;'), 'Vertex shader declares flameUv attribute');
  assert.ok(shader.vertexShader.includes('varying float vFlame;'), 'Vertex shader declares vFlame varying');
  assert.ok(shader.vertexShader.includes('transformed.x += flame * swayX;'), 'Vertex shader animates horizontal flame sway');
  assert.ok(shader.vertexShader.includes('transformed.y += flame * flickerY;'), 'Vertex shader animates vertical flame flicker');

  // Fragment Shader Checks
  assert.ok(shader.fragmentShader.includes('varying float vFlame;'), 'Fragment shader receives vFlame varying');
  assert.ok(shader.fragmentShader.includes('if (vFlame > 0.5)'), 'Fragment shader branches on flame geometry');
  assert.ok(shader.fragmentShader.includes('if (fUv.y > flameCutoff) discard;'), 'Fragment shader discards outside flame silhouette');
  assert.ok(shader.fragmentShader.includes('vec3 fireColor = mix'), 'Fragment shader calculates vibrant procedural fire coloring');
  assert.ok(shader.fragmentShader.includes('outgoingLight = max(outgoingLight, diffuseColor.rgb * 1.35);'), 'Outgoing light boosts flame emissive glow');
});

test('Fire Gameplay Simulation: Rain extinguishes exposed fire while Netherrack/Magma fire is eternal', () => {
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      chunk.setVoxel(x, 0, z, BLOCKS.STONE);
    }
  }

  // 1. Eternal Fire on Netherrack
  world.setVoxel(2, 0, 2, BLOCKS.NETHERRACK);
  world.setVoxel(2, 1, 2, BLOCKS.FIRE);
  world.lava.notify(2, 1, 2);

  // 2. Eternal Fire on Magma Block
  world.setVoxel(4, 0, 4, BLOCKS.MAGMA_BLOCK);
  world.setVoxel(4, 1, 4, BLOCKS.FIRE);
  world.lava.notify(4, 1, 4);

  // 3. Normal Fire on Wood (not eternal)
  world.setVoxel(6, 0, 6, BLOCKS.OAK_PLANKS);
  world.setVoxel(6, 1, 6, BLOCKS.FIRE);
  world.lava.notify(6, 1, 6);

  // Simulate rain
  world.weather = { isRaining: () => true };
  world.getHighestSolidY = (x, z) => 0; // Exposed to sky

  world.lava.updateFire(1.0);

  // Netherrack and Magma block fires remain intact
  assert.equal(world.getVoxel(2, 1, 2), BLOCKS.FIRE, 'Fire on Netherrack is eternal and persists through rain');
  assert.equal(world.getVoxel(4, 1, 4), BLOCKS.FIRE, 'Fire on Magma Block is eternal and persists through rain');

  // Exposed fire on wood is extinguished by rain
  assert.equal(world.getVoxel(6, 1, 6), BLOCKS.AIR, 'Exposed fire on oak planks is extinguished by rain');
});
