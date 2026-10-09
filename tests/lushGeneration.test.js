import test from 'node:test';
import assert from 'node:assert/strict';
import { FixtureWorld, RecordingMobManager, isSolidBlockId } from './helpers/spawnFixture.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { World } from '../src/world.js';
import { MobSpawnManager } from '../src/spawning/mobSpawnManager.js';
import { JavaRandom } from '../src/spawning/spawnRandom.js';
import { buildPresetPack } from '../src/dataPackPresets.js';
import { createPackStore, addPack, PACK_SOURCES } from '../src/dataPackStore.js';
import { applyStore, revertAll } from '../src/dataPackApply.js';
import { resetTagRegistry } from '../src/dataPackRuntime.js';
import { BIOMES } from '../src/biomes.js';
import { biomeSpawnsFor } from '../src/spawning/biomeSpawnResolver.js';
import { heightAt } from '../src/spawning/spawnValidation.js';
import { HeightmapType } from '../src/spawning/spawnPlacements.js';

// Explicit columns isolate surface selection from procedural terrain and render timing.
function woodland({ canopyY = 35, skyLight = 15, floor = BLOCKS.GRASS_BLOCK } = {}) {
  const world = new FixtureWorld({ biome: 'flower_forest', skyLight });
  world.loadRegion(0, 0, 15, 15);
  world.fill(0, 30, 0, 15, 30, 15, floor);
  world.fill(0, 31, 0, 15, 31, 15, BLOCKS.POPPY);
  if (canopyY !== null) world.fill(0, canopyY, 0, 15, canopyY, 15, BLOCKS.OAK_LEAVES);
  return world;
}

function spawning(world) {
  const mobs = new RecordingMobManager({ world, dimensions: { cow: { width: 0.9, height: 1.4 } } });
  const game = { world, mobs, player: { gamemode: 'creative', position: { x: 8, y: 40, z: 8 } },
    difficulty: 'normal', worldTime: 6000 };
  const manager = new MobSpawnManager({ game, seed: 4242 });
  world.game = game;
  // A real World lacks the fixture's convenience method.
  if (!world.isBlockSolid) mobs.isBlockSolid = (x, y, z) =>
    isSolidBlockId(world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z)));
  game.spawnManager = manager;
  return { manager, mobs };
}

function lush(t) {
  resetTagRegistry();
  const built = buildPresetPack('lush_havens');
  const store = createPackStore();
  addPack(store, { name: built.name, files: built.files, source: PACK_SOURCES.PRESET, format: 61 });
  const applied = applyStore(store);
  t.after(() => { revertAll(applied); resetTagRegistry(); });
}

test('generation puts cows on grass beneath a clear canopy, with flowers at their feet', () => {
  const world = woodland();
  const { manager, mobs } = spawning(world);
  assert.equal(heightAt(world, 8, 8, HeightmapType.WORLD_SURFACE), 35);
  const mob = manager.chunkGenerationSpawner.placeGenerationMember('cow', 8, 8, 0, 0, 'flower_forest');
  assert.ok(mob, `rejected: ${manager.chunkGenerationSpawner.lastRejection}`);
  assert.equal(mobs.calls[0].y, 31);
});

test('flowers without a canopy do not raise generation feet above the grass', () => {
  const { manager, mobs } = spawning(woodland({ canopyY: null }));
  assert.ok(manager.chunkGenerationSpawner.placeGenerationMember('cow', 8, 8, 0, 0, 'flower_forest'));
  assert.equal(mobs.calls[0].y, 31);
});

for (const [label, options] of [
  ['low canopy colliding with the animal', { canopyY: 32 }],
  ['dark forest floor', { skyLight: 8 }],
  ['stone instead of the species ground', { floor: BLOCKS.STONE }],
  ['water instead of ground', { floor: BLOCKS.WATER }],
]) test(`generation still refuses ${label}`, () => {
  const { manager, mobs } = spawning(woodland(options));
  assert.equal(manager.chunkGenerationSpawner.placeGenerationMember('cow', 8, 8, 0, 0, 'flower_forest'), null);
  assert.equal(mobs.calls.length, 0);
});

test('Lush Havens pack drives generation pack species and group sizes in the woodland fixture', t => {
  lush(t);
  assert.equal(BIOMES.flower_forest.treeDensity, 0.28);
  assert.equal(BIOMES.flower_forest.floraDensity, 0.35);
  const { manager, mobs } = spawning(woodland());
  // Force one pack, select the first weighted entry (cow), and its minimum group size.
  let roll = 0;
  manager.random = { nextDouble: () => roll++ === 0 ? 0 : 1, nextInt: () => 0 };
  const spawner = manager.chunkGenerationSpawner;
  assert.equal(spawner.onChunkGenerated(0, 0), 1);
  assert.deepEqual(mobs.calls.map(m => [m.type, m.y]), [['cow', 31]]);
  assert.ok(mobs.mobs.every(m => m.spawnSource === 'chunk_generation'));
  assert.equal(spawner.onChunkGenerated(0, 0), 0, 'population is once per chunk');
  assert.equal(mobs.calls.length, 1);
});

test('seeded Lush Havens terrain actually generates animals on valid ground without the game', t => {
  lush(t);
  const world = new World(4289, 'flower_forest');
  const { manager, mobs } = spawning(world);
  manager.random = new JavaRandom(4242);
  const candidates = {};
  const predicateContext = manager.naturalSpawner.predicateContext.bind(manager.naturalSpawner);
  manager.naturalSpawner.predicateContext = args => {
    const ctx = predicateContext(args);
    const key = `${ctx.type}: ${BLOCK_DEFS[ctx.blockBelow]?.name}, light ${ctx.lightLevel}`;
    candidates[key] = (candidates[key] ?? 0) + 1;
    return ctx;
  };
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) world.getOrCreateChunk(cx, cz);
  const stats = manager.chunkGenerationSpawner.stats;
  assert.ok(mobs.calls.length > 0, JSON.stringify({ stats, candidates, last: manager.chunkGenerationSpawner.lastRejection }));
  const allowed = new Set(Object.values(BIOMES.flower_forest.spawners).flat().map(e => e.type));
  for (const m of mobs.calls) {
    assert.ok(allowed.has(m.type));
    assert.notEqual(world.getVoxel(Math.floor(m.x), m.y - 1, Math.floor(m.z)), BLOCKS.OAK_LEAVES);
    if (biomeSpawnsFor('flower_forest', 'creature').some(e => e.type === m.type)) {
      assert.ok(world.getLightLevel(m.x, m.y, m.z, 0) >= 9, 'generated animals receive propagated light');
    }
  }
  assert.equal(stats.chunksConsidered, 25);
  t.diagnostic(`25 generated chunks: ${mobs.calls.length} animals, ${stats.rejected} rejected positions`);
});

test('an empty data-pack creature table suppresses generation, and reverting restores population', t => {
  lush(t);
  const store = createPackStore();
  addPack(store, { name: 'No animals', source: PACK_SOURCES.PASTED, format: 61,
    files: { 'data/test/worldgen/biome/flower_forest.json': JSON.stringify({ spawners: { creature: [] } }) } });
  const applied = applyStore(store);
  const { manager, mobs } = spawning(woodland());
  manager.random = { nextDouble: () => 0, nextInt: () => 0 };
  try {
    assert.equal(manager.chunkGenerationSpawner.onChunkGenerated(0, 0), 0);
    assert.equal(mobs.calls.length, 0);
  } finally {
    revertAll(applied);
  }
  const restored = spawning(woodland());
  let roll = 0;
  restored.manager.random = { nextDouble: () => roll++ === 0 ? 0 : 1, nextInt: () => 0 };
  assert.equal(restored.manager.chunkGenerationSpawner.onChunkGenerated(0, 0), 1);
});
