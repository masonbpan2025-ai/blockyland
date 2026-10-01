import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { BIOMES, BIOME_CATEGORIES, getBiomeDef } from '../src/biomes.js';
import { World } from '../src/world.js';
import { MobManager } from '../src/mobs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

test('Biome catalog includes all 68 Minecraft Wiki biomes + "all" dynamic option across 9 categories', () => {
  const categoryIds = BIOME_CATEGORIES.map(c => c.id);
  assert.deepEqual(categoryIds, [
    'offshore',
    'highland',
    'woodland',
    'wetland',
    'flatland',
    'arid',
    'cave',
    'nether',
    'end'
  ]);

  let totalCategorizedBiomes = 0;
  for (const cat of BIOME_CATEGORIES) {
    assert.ok(cat.biomes.length > 0, `Category ${cat.name} should have biomes`);
    totalCategorizedBiomes += cat.biomes.length;
    for (const bId of cat.biomes) {
      assert.ok(BIOMES[bId], `Biome ${bId} must exist in BIOMES registry`);
      const def = BIOMES[bId];
      assert.equal(def.id, bId);
      assert.ok(def.name, `Biome ${bId} must have a display name`);
      assert.equal(def.category, cat.id, `Biome ${bId} category mismatch`);
      assert.ok(def.dimension, `Biome ${bId} must define dimension`);
      assert.ok(def.surfaceBlock !== undefined, `Biome ${bId} must define surfaceBlock`);
      assert.ok(def.subsurfaceBlock !== undefined, `Biome ${bId} must define subsurfaceBlock`);
      assert.ok(def.deepBlock !== undefined, `Biome ${bId} must define deepBlock`);
    }
  }

  assert.equal(totalCategorizedBiomes, 68, 'All 68 Minecraft Wiki biomes must be cataloged');
  assert.ok(BIOMES.all, '"all" dynamic multi-biome option must exist');
});

test('index.html contains the World Generation Biome Selection Modal with all biomes and controls', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf-8');

  // Modal structure
  assert.ok(html.includes('id="world-biome-modal"'), 'world-biome-modal container exists');
  assert.ok(html.includes('id="world-biome-select"'), 'world-biome-select dropdown exists');
  assert.ok(html.includes('id="world-seed-input"'), 'world-seed-input field exists');
  assert.ok(html.includes('id="btn-randomize-seed"'), 'btn-randomize-seed button exists');
  assert.ok(html.includes('id="btn-create-world-confirm"'), 'btn-create-world-confirm button exists');
  assert.ok(html.includes('id="btn-close-biome-modal"'), 'btn-close-biome-modal button exists');

  // All 68 biomes + 'all' are present in the select options
  assert.ok(html.includes('value="all"'), 'Option "all" exists in dropdown');
  for (const bId of Object.keys(BIOMES)) {
    assert.ok(html.includes(`value="${bId}"`), `Dropdown must include option value="${bId}"`);
  }

  // All 9 optgroups exist
  for (const cat of BIOME_CATEGORIES) {
    assert.ok(html.includes(cat.name), `Dropdown must group by ${cat.name}`);
  }
});

test('Generating a world with different seeds produces substantially different terrain', () => {
  const biomeId = 'cherry_grove';
  const world1 = new World(12345, biomeId);
  const world2 = new World(88888, biomeId);

  // Generate chunks (0,0) and (1,0) for both worlds
  const chunk1_A = world1.getOrCreateChunk(0, 0);
  const chunk2_A = world2.getOrCreateChunk(0, 0);

  // Sample voxel differences across the chunk
  let differentVoxels = 0;
  let totalVoxels = chunk1_A.voxels.length;
  for (let i = 0; i < totalVoxels; i++) {
    if (chunk1_A.voxels[i] !== chunk2_A.voxels[i]) {
      differentVoxels++;
    }
  }

  const diffRatio = differentVoxels / totalVoxels;
  assert.ok(diffRatio > 0.05, `Different seeds must produce substantially different chunk terrain (diffRatio: ${diffRatio.toFixed(3)})`);

  // Height variation
  const h1 = world1.getHeight(8, 8, biomeId);
  const h2 = world2.getHeight(8, 8, biomeId);
  assert.notEqual(h1, h2, 'Different seeds should vary surface elevation at the same world coordinates');
});

test('World reseed cleanly updates seed and selected biome', () => {
  const world = new World(1000, 'plains');
  world.getOrCreateChunk(0, 0);
  assert.equal(world.chunks.size, 1);
  assert.equal(world.selectedBiome, 'plains');

  world.reseed(9999, 'nether_wastes');
  assert.equal(world.seed, 9999);
  assert.equal(world.selectedBiome, 'nether_wastes');
  assert.equal(world.chunks.size, 0, 'Chunks map should be cleared on reseed');

  // New chunk in Nether Wastes has nether surface block (Netherrack)
  const netherChunk = world.getOrCreateChunk(0, 0);
  let hasNetherrack = false;
  for (let i = 0; i < netherChunk.voxels.length; i++) {
    if (netherChunk.voxels[i] === BLOCKS.NETHERRACK) {
      hasNetherrack = true;
      break;
    }
  }
  assert.ok(hasNetherrack, 'Nether chunk should generate Netherrack');
});

test('The Nether biome features authentic ceiling, floor, lava sea, and fungi', () => {
  const world = new World(5555, 'crimson_forest');
  const chunk = world.getOrCreateChunk(0, 0);

  // Ceiling bedrock at y=63
  assert.equal(chunk.getVoxel(8, 63, 8), BLOCKS.BEDROCK, 'Nether ceiling has Bedrock at top');
  // Floor bedrock at y=0
  assert.equal(chunk.getVoxel(8, 0, 8), BLOCKS.BEDROCK, 'Nether floor has Bedrock at bottom');

  // Surface contains crimson nylium or netherrack
  let hasCrimsonNylium = false;
  for (let i = 0; i < chunk.voxels.length; i++) {
    if (chunk.voxels[i] === BLOCKS.CRIMSON_NYLIUM) {
      hasCrimsonNylium = true;
      break;
    }
  }
  assert.ok(hasCrimsonNylium, 'Crimson Forest should generate Crimson Nylium surface');
});

test('The End biome features floating End Stone islands and void below', () => {
  const world = new World(7777, 'the_end');
  const chunk = world.getOrCreateChunk(0, 0);

  // Bottom is void (air), not bedrock!
  assert.equal(chunk.getVoxel(8, 0, 8), BLOCKS.AIR, 'The End bottom is void air, not bedrock');

  // Floating body consists of End Stone
  let hasEndStone = false;
  for (let i = 0; i < chunk.voxels.length; i++) {
    if (chunk.voxels[i] === BLOCKS.END_STONE) {
      hasEndStone = true;
      break;
    }
  }
  assert.ok(hasEndStone, 'The End island body must consist of End Stone');
});

test('Cave biomes feature Deep Dark (Sculk & Warden) and Lush Caves (Moss & Azalea)', () => {
  const deepDarkWorld = new World(4321, 'deep_dark');
  const ddChunk = deepDarkWorld.getOrCreateChunk(0, 0);
  let hasSculk = false;
  for (let i = 0; i < ddChunk.voxels.length; i++) {
    if (ddChunk.voxels[i] === BLOCKS.SCULK || ddChunk.voxels[i] === BLOCKS.SCULK_CATALYST) {
      hasSculk = true;
      break;
    }
  }
  assert.ok(hasSculk, 'Deep Dark generates Sculk blocks');

  const lushWorld = new World(4321, 'lush_caves');
  const lushChunk = lushWorld.getOrCreateChunk(0, 0);
  let hasMoss = false;
  for (let i = 0; i < lushChunk.voxels.length; i++) {
    if (lushChunk.voxels[i] === BLOCKS.MOSS_BLOCK || lushChunk.voxels[i] === BLOCKS.AZALEA_LEAVES) {
      hasMoss = true;
      break;
    }
  }
  assert.ok(hasMoss, 'Lush Caves generates Moss and Azalea');
});

test('New biome blocks (80-149) are registered with valid definitions', () => {
  const newBlockKeys = [
    'CHERRY_LOG', 'CHERRY_LEAVES', 'CHERRY_PLANKS',
    'MUD', 'MANGROVE_LOG', 'MANGROVE_LEAVES', 'MANGROVE_ROOTS',
    'RED_SAND', 'RED_SANDSTONE', 'TERRACOTTA', 'WHITE_TERRACOTTA',
    'PACKED_ICE', 'BLUE_ICE', 'SCULK', 'SCULK_CATALYST', 'MOSS_BLOCK',
    'SOUL_SOIL', 'BASALT', 'BLACKSTONE', 'MAGMA_BLOCK', 'CRIMSON_NYLIUM',
    'WARPED_NYLIUM', 'CRIMSON_STEM', 'WARPED_STEM', 'END_STONE',
    'CHORUS_PLANT', 'CALCITE', 'TUFF', 'DRIPSTONE_BLOCK'
  ];

  for (const key of newBlockKeys) {
    const id = BLOCKS[key];
    assert.ok(id !== undefined, `BLOCKS.${key} must be defined`);
    assert.ok(BLOCK_DEFS[id], `BLOCK_DEFS[${id}] must have definition for ${key}`);
    assert.ok(BLOCK_DEFS[id].name, `Block ${key} must have friendly name`);
  }
});

test('MobManager supports native biome mobs', () => {
  const mockScene = { add() {}, remove() {} };
  const mockWorld = { getVoxel() { return 0; } };
  const mobs = Object.assign(Object.create(MobManager.prototype), {
    scene: mockScene,
    world: mockWorld,
    mobs: [],
    createCustomTextureMaterial() {
      return {
        clone() { return this; },
        dispose() {}
      };
    },
    buildMobMesh() {
      return {
        position: { set() {} },
        scale: { set() {} },
        traverse() {}
      };
    }
  });

  // Spawn functions exist
  const mobSpawners = [
    'spawnMooshroom',
    'spawnPolarBear',
    'spawnPanda',
    'spawnWarden',
    'spawnBlaze',
    'spawnPiglin',
    'spawnGhast',
    'spawnMagmaCube',
    'spawnShulker'
  ];

  for (const fn of mobSpawners) {
    assert.equal(typeof mobs[fn], 'function', `MobManager must implement ${fn}`);
  }

  // Spawning adds mob to entities list
  const initialCount = mobs.mobs.length;
  mobs.spawnMooshroom(0, 20, 0);
  assert.equal(mobs.mobs.length, initialCount + 1, 'spawnMooshroom adds mob entity');
  const mooshroom = mobs.mobs[mobs.mobs.length - 1];
  assert.equal(mooshroom.type, 'mooshroom');

  mobs.spawnWarden(10, 20, 10);
  const warden = mobs.mobs[mobs.mobs.length - 1];
  assert.equal(warden.type, 'warden');
  assert.equal(warden.maxHealth, 500);

  mobs.spawnBlaze(5, 20, 5);
  const blaze = mobs.mobs[mobs.mobs.length - 1];
  assert.equal(blaze.type, 'blaze');

  mobs.spawnShulker(0, 20, 0);
  const shulker = mobs.mobs[mobs.mobs.length - 1];
  assert.equal(shulker.type, 'shulker');
});
