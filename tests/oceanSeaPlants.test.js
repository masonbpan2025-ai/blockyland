import test from 'node:test';
import assert from 'node:assert/strict';
import { World, CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from '../src/world.js';
import { BLOCKS, BLOCK_DEFS, WATER_PLANT_BLOCK_IDS } from '../src/blocks.js';
import { applyPresetFixture } from './helpers/presetGenerationFixture.js';

function countBlocksInChunks(world, radius = 2) {
  const counts = {};
  for (let cx = -radius; cx <= radius; cx++) {
    for (let cz = -radius; cz <= radius; cz++) {
      const chunk = world.getOrCreateChunk(cx, cz);
      for (let i = 0; i < chunk.voxels.length; i++) {
        const id = chunk.voxels[i];
        if (id !== BLOCKS.AIR) {
          counts[id] = (counts[id] || 0) + 1;
        }
      }
    }
  }
  return counts;
}

test('Warm Ocean with Reef Life pack generates coral reefs, sea pickles, and seagrass', (t) => {
  applyPresetFixture(t, 'reef_life');
  const world = new World(12345, 'warm_ocean');
  const counts = countBlocksInChunks(world, 2);

  // Check sea plants
  const seagrassCount = counts[BLOCKS.SEAGRASS] || 0;
  const tallSeagrassCount = counts[BLOCKS.TALL_SEAGRASS] || 0;
  const seaPickleCount = counts[BLOCKS.SEA_PICKLE] || 0;

  assert.ok(seagrassCount > 0, `Warm Ocean with Reef Life must generate seagrass, found ${seagrassCount}`);
  assert.ok(seaPickleCount > 0, `Warm Ocean with Reef Life must generate sea pickles, found ${seaPickleCount}`);

  // Check coral reef blocks
  const coralBlocks = [
    BLOCKS.TUBE_CORAL_BLOCK, BLOCKS.BRAIN_CORAL_BLOCK, BLOCKS.BUBBLE_CORAL_BLOCK,
    BLOCKS.FIRE_CORAL_BLOCK, BLOCKS.HORN_CORAL_BLOCK
  ];
  const totalCoralBlocks = coralBlocks.reduce((sum, id) => sum + (counts[id] || 0), 0);
  assert.ok(totalCoralBlocks > 0, `Warm Ocean with Reef Life must generate coral blocks, found ${totalCoralBlocks}`);

  // Check coral plants / fans
  const coralPlantsAndFans = [
    BLOCKS.TUBE_CORAL, BLOCKS.BRAIN_CORAL, BLOCKS.BUBBLE_CORAL, BLOCKS.FIRE_CORAL, BLOCKS.HORN_CORAL,
    BLOCKS.TUBE_CORAL_FAN, BLOCKS.BRAIN_CORAL_FAN, BLOCKS.BUBBLE_CORAL_FAN, BLOCKS.FIRE_CORAL_FAN, BLOCKS.HORN_CORAL_FAN,
    BLOCKS.TUBE_CORAL_WALL_FAN, BLOCKS.BRAIN_CORAL_WALL_FAN, BLOCKS.BUBBLE_CORAL_WALL_FAN, BLOCKS.FIRE_CORAL_WALL_FAN, BLOCKS.HORN_CORAL_WALL_FAN
  ];
  const totalCoralFoliage = coralPlantsAndFans.reduce((sum, id) => sum + (counts[id] || 0), 0);
  assert.ok(totalCoralFoliage > 0, `Warm Ocean with Reef Life must generate coral plants and fans, found ${totalCoralFoliage}`);

  // Confirm that sea plants are placed under water (below sea level)
  for (let cx = -1; cx <= 1; cx++) {
    for (let cz = -1; cz <= 1; cz++) {
      const chunk = world.getOrCreateChunk(cx, cz);
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
          for (let y = 0; y < CHUNK_HEIGHT; y++) {
            const id = chunk.getVoxel(lx, y, lz);
            if (WATER_PLANT_BLOCK_IDS.has(id)) {
              assert.ok(y < world.seaLevel, `Sea plant at y=${y} should be below sea level ${world.seaLevel}`);
            }
          }
        }
      }
    }
  }
});

test('Warm Ocean without preset generates coral reefs, sea pickles, and seagrass', () => {
  const world = new World(54321, 'warm_ocean');
  const counts = countBlocksInChunks(world, 2);

  const seagrassCount = counts[BLOCKS.SEAGRASS] || 0;
  const seaPickleCount = counts[BLOCKS.SEA_PICKLE] || 0;
  const coralBlocks = [
    BLOCKS.TUBE_CORAL_BLOCK, BLOCKS.BRAIN_CORAL_BLOCK, BLOCKS.BUBBLE_CORAL_BLOCK,
    BLOCKS.FIRE_CORAL_BLOCK, BLOCKS.HORN_CORAL_BLOCK
  ];
  const totalCoralBlocks = coralBlocks.reduce((sum, id) => sum + (counts[id] || 0), 0);

  assert.ok(seagrassCount > 0, `Warm ocean should generate seagrass, found ${seagrassCount}`);
  assert.ok(seaPickleCount > 0, `Warm ocean should generate sea pickles, found ${seaPickleCount}`);
  assert.ok(totalCoralBlocks > 0, `Warm ocean should generate coral blocks, found ${totalCoralBlocks}`);
});

test('Normal Ocean generates kelp forests and seagrass, but not coral reefs', () => {
  const world = new World(777, 'ocean');
  const counts = countBlocksInChunks(world, 2);

  const kelpCount = (counts[BLOCKS.KELP] || 0) + (counts[BLOCKS.KELP_PLANT] || 0);
  const seagrassCount = counts[BLOCKS.SEAGRASS] || 0;

  assert.ok(kelpCount > 0, `Ocean must generate kelp, found ${kelpCount}`);
  assert.ok(seagrassCount > 0, `Ocean must generate seagrass, found ${seagrassCount}`);

  // Normal oceans do not have warm coral blocks
  const coralBlocks = [
    BLOCKS.TUBE_CORAL_BLOCK, BLOCKS.BRAIN_CORAL_BLOCK, BLOCKS.BUBBLE_CORAL_BLOCK,
    BLOCKS.FIRE_CORAL_BLOCK, BLOCKS.HORN_CORAL_BLOCK
  ];
  const totalCoralBlocks = coralBlocks.reduce((sum, id) => sum + (counts[id] || 0), 0);
  assert.equal(totalCoralBlocks, 0, 'Normal ocean should not generate warm coral blocks');
});

test('Cold Ocean generates kelp forests and seagrass', () => {
  const world = new World(888, 'cold_ocean');
  const counts = countBlocksInChunks(world, 2);

  const kelpCount = (counts[BLOCKS.KELP] || 0) + (counts[BLOCKS.KELP_PLANT] || 0);
  const seagrassCount = counts[BLOCKS.SEAGRASS] || 0;

  assert.ok(kelpCount > 0, `Cold ocean must generate kelp, found ${kelpCount}`);
  assert.ok(seagrassCount > 0, `Cold ocean must generate seagrass, found ${seagrassCount}`);
});

test('River generates seagrass underwater', () => {
  const world = new World(999, 'river');
  const counts = countBlocksInChunks(world, 2);

  const seagrassCount = (counts[BLOCKS.SEAGRASS] || 0) + (counts[BLOCKS.TALL_SEAGRASS] || 0);
  assert.ok(seagrassCount > 0, `River must generate seagrass, found ${seagrassCount}`);
});

test('All registered water plants have waterPlant: true in BLOCK_DEFS', () => {
  for (const id of WATER_PLANT_BLOCK_IDS) {
    const def = BLOCK_DEFS[id];
    assert.ok(def, `Block id ${id} must have a definition`);
    assert.equal(def.waterPlant, true, `Block ${def.name} (${id}) must have waterPlant: true`);
  }
});
