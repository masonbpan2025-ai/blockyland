import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, Chunk } from '../src/world.js';
import { BLOCKS } from '../src/blocks.js';
import {
  FurnaceManager,
  SMELTING_RECIPES,
  FUEL_BURN_TIMES,
  getSmeltingRecipe,
  getFuelBurnTime
} from '../src/furnace.js';

function setupWorld() {
  const world = new World();
  for (let x = -2; x <= 2; x++) {
    for (let z = -2; z <= 2; z++) {
      world.chunks.set(world.chunkKey(x, z), new Chunk(x, z));
    }
  }
  const scene = new THREE.Scene();
  const spawnedItems = [];
  const fakeGame = {
    world,
    scene,
    entities: {
      spawnDroppedItem: (pos, id, isBlock, count) => {
        spawnedItems.push({ id, isBlock, count, pos });
      },
      spawnFurnaceParticles: () => {}
    },
    audio: {
      playFurnaceCrackle: () => {}
    },
    rebuildChunkMesh: () => {}
  };
  const furnaceManager = new FurnaceManager(fakeGame);
  return { world, scene, fakeGame, furnaceManager, spawnedItems };
}

test('Furnace cooking recipes: supports all raw foods and smelting items', () => {
  // Raw foods
  assert.equal(getSmeltingRecipe('raw_beef')?.id, 'cooked_beef');
  assert.equal(getSmeltingRecipe('beef')?.id, 'cooked_beef');
  assert.equal(getSmeltingRecipe('porkchop')?.id, 'cooked_porkchop');
  assert.equal(getSmeltingRecipe('raw_porkchop')?.id, 'cooked_porkchop');
  assert.equal(getSmeltingRecipe('chicken')?.id, 'cooked_chicken');
  assert.equal(getSmeltingRecipe('raw_chicken')?.id, 'cooked_chicken');
  assert.equal(getSmeltingRecipe('mutton')?.id, 'cooked_mutton');
  assert.equal(getSmeltingRecipe('raw_mutton')?.id, 'cooked_mutton');
  assert.equal(getSmeltingRecipe('rabbit')?.id, 'cooked_rabbit');
  assert.equal(getSmeltingRecipe('raw_rabbit')?.id, 'cooked_rabbit');
  assert.equal(getSmeltingRecipe('cod')?.id, 'cooked_cod');
  assert.equal(getSmeltingRecipe('raw_cod')?.id, 'cooked_cod');
  assert.equal(getSmeltingRecipe('salmon')?.id, 'cooked_salmon');
  assert.equal(getSmeltingRecipe('raw_salmon')?.id, 'cooked_salmon');
  assert.equal(getSmeltingRecipe('potato')?.id, 'baked_potato');
  assert.equal(getSmeltingRecipe('kelp')?.id, 'dried_kelp');

  // Blocks & Ores
  assert.equal(getSmeltingRecipe(BLOCKS.COBBLESTONE)?.id, BLOCKS.STONE);
  assert.equal(getSmeltingRecipe(BLOCKS.STONE)?.id, BLOCKS.SMOOTH_STONE);
  assert.equal(getSmeltingRecipe(BLOCKS.SAND)?.id, BLOCKS.GLASS);
  assert.equal(getSmeltingRecipe(BLOCKS.IRON_ORE)?.id, 'iron_ingot');
  assert.equal(getSmeltingRecipe('raw_iron')?.id, 'iron_ingot');
  assert.equal(getSmeltingRecipe(BLOCKS.GOLD_ORE)?.id, 'gold_ingot');
  assert.equal(getSmeltingRecipe('raw_gold')?.id, 'gold_ingot');
  assert.equal(getSmeltingRecipe('raw_copper')?.id, 'copper_ingot');
  assert.equal(getSmeltingRecipe(BLOCKS.OAK_LOG)?.id, 'charcoal');
  assert.equal(getSmeltingRecipe('clay_ball')?.id, 'brick');
  assert.equal(getSmeltingRecipe(BLOCKS.CACTUS)?.id, 'green_dye');
});

test('Furnace fuels: authentic burn times', () => {
  assert.equal(getFuelBurnTime('coal'), 80.0); // 80s
  assert.equal(getFuelBurnTime('charcoal'), 80.0);
  assert.equal(getFuelBurnTime(BLOCKS.COAL_BLOCK), 800.0); // 800s
  assert.equal(getFuelBurnTime('lava_bucket'), 1000.0); // 1000s
  assert.equal(getFuelBurnTime('blaze_rod'), 120.0); // 120s
  assert.equal(getFuelBurnTime(BLOCKS.OAK_PLANKS), 15.0); // 15s
  assert.equal(getFuelBurnTime(BLOCKS.OAK_LOG), 15.0); // 15s
  assert.equal(getFuelBurnTime('stick'), 5.0); // 5s
  assert.equal(getFuelBurnTime('wooden_pickaxe'), 10.0); // 10s
  assert.equal(getFuelBurnTime('dried_kelp'), 2.5); // 2.5s
  assert.equal(getFuelBurnTime('dirt'), 0); // Not a fuel
});

test('Furnace cooking process: cooks raw beef into cooked beef and consumes fuel', () => {
  const { world, furnaceManager } = setupWorld();
  const pos = [0, 5, 0];
  world.setVoxel(pos[0], pos[1], pos[2], BLOCKS.FURNACE);

  const furnace = furnaceManager.getOrCreateFurnace(pos[0], pos[1], pos[2]);
  furnace.input = { id: 'beef', count: 2, isBlock: false };
  furnace.fuel = { id: 'coal', count: 1, isBlock: false };

  const advanceTime = (seconds) => {
    const step = 0.1;
    const count = Math.ceil(seconds / step);
    for (let i = 0; i < count; i++) furnaceManager.update(step);
  };

  // First tick: furnace starts burning coal and transforms into LIT_FURNACE
  furnaceManager.update(0.05); // 1 tick
  assert.equal(furnace.fuel, null, 'Coal should be consumed to start burning');
  assert.ok(furnace.burnTime > 0, 'Furnace should now have burn time');
  assert.equal(world.getVoxel(pos[0], pos[1], pos[2]), BLOCKS.LIT_FURNACE, 'World block should change to LIT_FURNACE');
  assert.ok(furnace.pointLight, 'Lit furnace should have dynamic fire point light');

  // Advance time by 10 seconds (full cook duration)
  advanceTime(10.0);

  // One beef should be cooked into cooked_beef
  assert.equal(furnace.input.count, 1, 'One raw beef remaining');
  assert.ok(furnace.output, 'Output slot has cooked beef');
  assert.equal(furnace.output.id, 'cooked_beef');
  assert.equal(furnace.output.count, 1);

  // Advance another 10 seconds to cook the second beef
  advanceTime(10.0);
  assert.equal(furnace.input, null, 'All raw beef cooked');
  assert.equal(furnace.output.id, 'cooked_beef');
  assert.equal(furnace.output.count, 2, 'Two cooked beef in output');

  // When fuel drains and no more cooking is occurring, block reverts to unlit furnace
  advanceTime(70.0); // coal lasts 80s total (10s + 10s + 70s > 80s)
  assert.equal(furnace.burnTime, 0);
  assert.equal(world.getVoxel(pos[0], pos[1], pos[2]), BLOCKS.FURNACE, 'World block should revert to UNLIT FURNACE');
  assert.equal(furnace.pointLight, null, 'Fire point light should be removed');
});

test('Furnace lava bucket fuel returns empty bucket', () => {
  const { world, furnaceManager } = setupWorld();
  const pos = [1, 5, 0];
  world.setVoxel(pos[0], pos[1], pos[2], BLOCKS.FURNACE);

  const furnace = furnaceManager.getOrCreateFurnace(pos[0], pos[1], pos[2]);
  furnace.input = { id: BLOCKS.COBBLESTONE, count: 5, isBlock: true };
  furnace.fuel = { id: 'lava_bucket', count: 1, isBlock: false };

  furnaceManager.update(0.05);
  // Lava bucket should be replaced by empty bucket!
  assert.equal(furnace.fuel.id, 'bucket');
  assert.equal(furnace.fuel.count, 1);
  assert.equal(furnace.maxBurnTime, 1000.0);
});

test('Breaking a furnace drops all items inside and cleans up furnace state', () => {
  const { world, furnaceManager, spawnedItems } = setupWorld();
  const pos = [2, 5, 0];
  world.setVoxel(pos[0], pos[1], pos[2], BLOCKS.FURNACE);

  const furnace = furnaceManager.getOrCreateFurnace(pos[0], pos[1], pos[2]);
  furnace.input = { id: 'chicken', count: 3, isBlock: false };
  furnace.fuel = { id: 'coal', count: 5, isBlock: false };
  furnace.output = { id: 'cooked_chicken', count: 2, isBlock: false };

  furnaceManager.onBlockBroken(pos[0], pos[1], pos[2]);

  // Check spawned items dropped from furnace contents
  const droppedIds = spawnedItems.map(s => s.id);
  assert.ok(droppedIds.includes('chicken'), 'Dropped remaining input raw chicken');
  assert.ok(droppedIds.includes('coal'), 'Dropped remaining fuel coal');
  assert.ok(droppedIds.includes('cooked_chicken'), 'Dropped output cooked chicken');

  // Verify furnace state is cleaned up
  assert.equal(furnaceManager.getFurnace(pos[0], pos[1], pos[2]), null);
});
