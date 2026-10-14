import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS } from '../src/blocks.js';
import { resolveVisualPolicy, canSupportPlant, VISUAL_POLICIES } from '../src/resourceVisualPolicy.js';

test('resolveVisualPolicy: categorizes plants and flowers into CUTOUT_PLANT', () => {
  const flowerKeys = ['dandelion', 'poppy', 'allium', 'azure_bluet', 'blue_orchid', 'cornflower', 'wither_rose'];
  for (const key of flowerKeys) {
    const policy = resolveVisualPolicy(key);
    assert.equal(policy.policy, VISUAL_POLICIES.CUTOUT_PLANT, `${key} should be CUTOUT_PLANT`);
    assert.equal(policy.held, 'sprite', `${key} must be held as 2D sprite`);
    assert.equal(policy.dropped, 'cross_quad', `${key} must drop as cross_quad`);
    assert.equal(policy.placed, 'cross_quad', `${key} must place as cross_quad`);
  }

  // Numeric block IDs for flowers
  const numericFlowers = [BLOCKS.DANDELION, BLOCKS.POPPY, BLOCKS.ALLIUM, BLOCKS.WITHER_ROSE];
  for (const blockId of numericFlowers) {
    const policy = resolveVisualPolicy(blockId);
    assert.equal(policy.policy, VISUAL_POLICIES.CUTOUT_PLANT, `Block ${blockId} should be CUTOUT_PLANT`);
    assert.equal(policy.held, 'sprite', `Block ${blockId} should be held as 2D sprite`);
  }
});

test('resolveVisualPolicy: categorizes full blocks into CUBE', () => {
  const cubeBlocks = [BLOCKS.STONE, BLOCKS.DIRT, BLOCKS.OAK_PLANKS, BLOCKS.COBBLESTONE, BLOCKS.DIAMOND_BLOCK];
  for (const blockId of cubeBlocks) {
    const policy = resolveVisualPolicy(blockId);
    assert.equal(policy.policy, VISUAL_POLICIES.CUBE, `Block ${blockId} should be CUBE`);
    assert.equal(policy.held, 'cube');
    assert.equal(policy.placed, 'cube');
  }
});

test('resolveVisualPolicy: categorizes thin models and partial blocks', () => {
  const torchPolicy = resolveVisualPolicy(BLOCKS.TORCH);
  assert.equal(torchPolicy.policy, VISUAL_POLICIES.THIN_MODEL, 'Torch should be THIN_MODEL');

  const chestPolicy = resolveVisualPolicy('chest');
  assert.equal(chestPolicy.policy, VISUAL_POLICIES.CONTAINER, 'Chest should be CONTAINER');

  const slabPolicy = resolveVisualPolicy(BLOCKS.OAK_SLAB);
  assert.equal(slabPolicy.policy, VISUAL_POLICIES.PARTIAL, 'Slab should be PARTIAL');
});

test('resolveVisualPolicy: categorizes fluids into FLUID', () => {
  const waterPolicy = resolveVisualPolicy(BLOCKS.WATER);
  assert.equal(waterPolicy.policy, VISUAL_POLICIES.FLUID, 'Water should be FLUID');
  const lavaPolicy = resolveVisualPolicy(BLOCKS.LAVA);
  assert.equal(lavaPolicy.policy, VISUAL_POLICIES.FLUID, 'Lava should be FLUID');
});

test('resolveVisualPolicy: categorizes items into SPRITE, WEARABLE, ENTITY', () => {
  const diamondPolicy = resolveVisualPolicy('diamond');
  assert.equal(diamondPolicy.policy, VISUAL_POLICIES.SPRITE, 'Diamond should be SPRITE');

  const swordPolicy = resolveVisualPolicy('iron_sword');
  assert.equal(swordPolicy.policy, VISUAL_POLICIES.SPRITE, 'Iron sword should be SPRITE');

  const helmetPolicy = resolveVisualPolicy('iron_helmet');
  assert.equal(helmetPolicy.policy, VISUAL_POLICIES.WEARABLE, 'Iron helmet should be WEARABLE');

  const eggPolicy = resolveVisualPolicy('creeper_spawn_egg');
  assert.equal(eggPolicy.policy, VISUAL_POLICIES.ENTITY, 'Spawn egg should be ENTITY');

  const boatPolicy = resolveVisualPolicy('oak_boat');
  assert.equal(boatPolicy.policy, VISUAL_POLICIES.ENTITY, 'Boat should be ENTITY');
});

test('canSupportPlant: validates soil conditions and plant restrictions', () => {
  // Common valid soils
  assert.equal(canSupportPlant(BLOCKS.GRASS, BLOCKS.DANDELION), true);
  assert.equal(canSupportPlant(BLOCKS.DIRT, BLOCKS.DANDELION), true);
  assert.equal(canSupportPlant(BLOCKS.FARMLAND, BLOCKS.POPPY), true);
  assert.equal(canSupportPlant(BLOCKS.PODZOL, BLOCKS.ALLIUM), true);

  // Common invalid substrates
  assert.equal(canSupportPlant(BLOCKS.AIR, BLOCKS.DANDELION), false);
  assert.equal(canSupportPlant(BLOCKS.STONE, BLOCKS.DANDELION), false);
  assert.equal(canSupportPlant(BLOCKS.GLASS, BLOCKS.DANDELION), false);
  assert.equal(canSupportPlant(BLOCKS.OAK_PLANKS, BLOCKS.DANDELION), false);

  // Wither Rose can grow on nether soils
  assert.equal(canSupportPlant(BLOCKS.NETHERRACK, BLOCKS.WITHER_ROSE), true);
  assert.equal(canSupportPlant(BLOCKS.SOUL_SAND, BLOCKS.WITHER_ROSE), true);
  assert.equal(canSupportPlant(BLOCKS.NETHERRACK, BLOCKS.DANDELION), false);
});
