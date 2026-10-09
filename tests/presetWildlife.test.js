import test from 'node:test';
import assert from 'node:assert/strict';
import { BIOMES } from '../src/biomes.js';
import { BLOCKS } from '../src/blocks.js';
import { GENERATION_PRESETS, SPAWN_PROFILES, LAND_BIOMES, buildPresetPack } from '../src/dataPackPresets.js';
import { biomeSpawnsFor } from '../src/spawning/biomeSpawnResolver.js';
import { FixtureWorld } from './helpers/spawnFixture.js';
import { applyPresetFixture, recordingSpawner, generatedPresetFixture } from './helpers/presetGenerationFixture.js';
import { adaptEngineSpawning } from '../src/dataPackAdapters.js';
import { SpawnState } from '../src/spawning/spawnState.js';

function habitat(biome, floor, { water = false, cave = false } = {}) {
  const world = new FixtureWorld({ biome, seaLevel: 22, skyLight: cave ? 0 : 15 });
  world.loadChunk(0, 0).fill(0, water ? 12 : 8, 0, 15, water ? 12 : 8, 15, floor);
  if (water) world.fill(0, 13, 0, 15, 22, 15, BLOCKS.WATER);
  if (cave) world.fill(0, 12, 0, 15, 12, 15, BLOCKS.STONE);
  return recordingSpawner(world);
}

for (const [biome, species, category, floor, options] of [
  ['flower_forest', 'bee', 'creature', BLOCKS.GRASS_BLOCK, {}],
  ['jungle', 'parrot', 'creature', BLOCKS.GRASS_BLOCK, {}],
  ['snowy_plains', 'polar_bear', 'creature', BLOCKS.SNOW, {}],
  ['desert', 'camel', 'creature', BLOCKS.SAND, {}],
  ['mushroom_fields', 'mooshroom', 'creature', BLOCKS.MYCELIUM, {}],
  ['river', 'salmon', 'water_ambient', BLOCKS.STONE, { water: true }],
  ['warm_ocean', 'tropical_fish', 'water_ambient', BLOCKS.SAND, { water: true }],
  ['frozen_ocean', 'salmon', 'water_ambient', BLOCKS.STONE, { water: true }],
  ['dripstone_caves', 'bat', 'ambient', BLOCKS.STONE, { cave: true }],
]) test(`Lush Havens actually constructs ${species} in its ${biome} habitat`, t => {
  applyPresetFixture(t, 'lush_havens');
  const { manager, mobs } = habitat(biome, floor, options);
  const entries = biomeSpawnsFor(biome, category);
  const index = entries.findIndex(e => e.type === species);
  assert.ok(index >= 0, 'species exists in the applied pack');
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  const pick = entries.slice(0, index).reduce((sum, e) => sum + e.weight, 0);
  manager.random = { nextDouble: () => 0, nextInt: bound => bound === total ? pick : 0 };
  manager.chunkGenerationSpawner.populateChunk(0, 0, category, { probability: 1, groups: 1 });
  assert.ok(mobs.calls.some(m => m.type === species), `no construction, last rejection: ${manager.chunkGenerationSpawner.lastRejection}`);
  assert.ok(mobs.mobs.every(m => m.spawnCategory === category));
});

for (const biome of ['flower_forest', 'jungle', 'snowy_plains', 'desert', 'mushroom_fields', 'ocean', 'warm_ocean']) {
  test(`Lush Havens generated ${biome} has abundant diverse wildlife`, t => {
    applyPresetFixture(t, 'lush_havens');
    const f = generatedPresetFixture(biome);
    const stats = f.manager.chunkGenerationSpawner.stats;
    assert.ok(f.mobs.mobs.length >= 20, JSON.stringify({ biome, counts: f.counts, stats }));
    if (biome !== 'mushroom_fields') assert.ok(Object.keys(f.counts).length >= 3, JSON.stringify(f.counts));
    if (biome === 'flower_forest') assert.ok(f.counts.bee > 0, JSON.stringify(f.counts));
    if (biome === 'jungle') assert.ok(f.counts.parrot > 0, JSON.stringify(f.counts));
    if (biome === 'snowy_plains') assert.ok(f.counts.polar_bear > 0, JSON.stringify(f.counts));
    if (biome.includes('ocean')) assert.ok(f.mobs.mobs.some(m => m.spawnCategory === 'water_ambient'));
    t.diagnostic(`${biome}: ${JSON.stringify(f.counts)}, ${stats.chunksPopulated}/25 chunks populated`);
  });
}

for (const preset of GENERATION_PRESETS) test(`${preset.name} applies and reverts its actual density controls`, t => {
  applyPresetFixture(t, preset.id);
  const biome = preset.biomes[0];
  const settings = BIOMES[biome].spawnSettings;
  if (SPAWN_PROFILES[preset.id]) {
    assert.deepEqual(settings.generation, SPAWN_PROFILES[preset.id].generation);
    const world = new FixtureWorld({ biome });
    world.chunks = new Map([['0,0', {}]]);
    const { manager } = recordingSpawner(world);
    const state = manager.naturalSpawner.buildState(manager.players(), true);
    const vanillaCap = new SpawnState({ players: manager.players(), loadedChunkKeys: new Set(['0,0']) }).caps.creature;
    for (const [category, cap] of Object.entries(settings.caps)) assert.equal(state.caps[category], cap);
    if (preset.id === 'lush_havens') assert.ok(state.caps.creature > vanillaCap);
  } else assert.equal(settings, undefined, 'terrain-only packs preserve vanilla spawning');
  t.after(() => assert.equal(BIOMES[biome].spawnSettings, undefined, 'revert restores the vanilla policy'));
});

for (const preset of GENERATION_PRESETS) test(`${preset.name} produces the intended population on actual seeded terrain`, t => {
  applyPresetFixture(t, preset.id);
  const f = generatedPresetFixture(preset.biomes[0]);
  if (['lush_havens', 'verdant_overgrowth', 'amber_autumn'].includes(preset.id)) {
    assert.ok(f.mobs.mobs.length >= 15, JSON.stringify({ preset: preset.id, counts: f.counts }));
  }
  if (preset.id === 'frozen_frontier') assert.ok(f.counts.polar_bear > 0, JSON.stringify(f.counts));
  if (preset.id === 'sunken_shores') assert.ok(f.mobs.mobs.filter(m => m.spawnCategory === 'water_ambient').length >= 30, JSON.stringify(f.counts));
  if (['dungeon_rush', 'scorched_badlands', 'beast_wilds'].includes(preset.id)) assert.ok(f.mobs.mobs.length < 20, JSON.stringify(f.counts));
  t.diagnostic(`${preset.id}: ${JSON.stringify(f.counts)}`);
});

test('Lush Havens has local population throughout every land biome, rather than one herd filling the global cap', t => {
  applyPresetFixture(t, 'lush_havens');
  for (const biome of LAND_BIOMES) {
    const f = generatedPresetFixture(biome, { radius: 1 });
    assert.ok(f.mobs.mobs.length >= 3, `${biome}: ${JSON.stringify(f.counts)}`);
    assert.ok(f.manager.chunkGenerationSpawner.stats.chunksPopulated >= 2, `${biome}: only one populated chunk`);
  }
});

for (const [id, biome, expected] of [
  ['pollinator_meadows', 'flower_forest', ['bee', 'sheep']],
  ['jungle_canopy', 'jungle', ['parrot', 'panda']],
  ['taiga_trails', 'taiga', ['fox', 'wolf']],
  ['desert_caravans', 'desert', ['camel', 'rabbit']],
  ['reef_life', 'warm_ocean', ['tropical_fish', 'dolphin']],
  ['mushroom_sanctuary', 'mushroom_fields', ['mooshroom']],
]) test(`${id} generates its signature wildlife and leaves other biome settings intact`, t => {
  const preset = GENERATION_PRESETS.find(p => p.id === id);
  const untouched = LAND_BIOMES.find(b => !preset.biomes.includes(b));
  const before = JSON.stringify(BIOMES[untouched]);
  const built = applyPresetFixture(t, id);
  assert.equal(JSON.stringify(BIOMES[untouched]), before);
  const authored = Object.keys(built.files).filter(path => path.includes('/worldgen/biome/'));
  assert.equal(authored.length, preset.biomes.length, 'only targeted habitats are rewritten');
  const f = generatedPresetFixture(biome);
  for (const species of expected) assert.ok(f.counts[species] > 0, `${id}: ${JSON.stringify(f.counts)}`);
  assert.ok(f.manager.chunkGenerationSpawner.stats.chunksPopulated >= 8, JSON.stringify(f.counts));
  if (id === 'mushroom_sanctuary') {
    assert.equal(BIOMES[biome].surfaceBlock, BLOCKS.MYCELIUM);
    assert.deepEqual(biomeSpawnsFor(biome, 'monster'), []);
  }
  t.diagnostic(`${id}: ${JSON.stringify(f.counts)}`);
});

test('a declined pack runtime probability skips hostile construction and position work', t => {
  applyPresetFixture(t, 'dungeon_rush');
  const { manager, mobs } = habitat('plains', BLOCKS.GRASS_BLOCK);
  manager.random = { nextDouble: () => 0.5, nextInt: () => { throw new Error('no position draw should occur'); } };
  const state = manager.naturalSpawner.buildState(manager.players(), true);
  const chunks = state.eligibleChunks;
  assert.equal(chunks.length, 1);
  assert.deepEqual(manager.naturalSpawner.spawnForChunk('monster', chunks[0], state), []);
  assert.equal(mobs.calls.length, 0);
});

test('the configured passive cadence drives runtime spawning, while vanilla remains on 400 ticks', t => {
  applyPresetFixture(t, 'lush_havens');
  const { manager } = habitat('plains', BLOCKS.GRASS_BLOCK);
  const observed = [];
  manager.naturalSpawner.spawnForChunk = category => { observed.push(category); return []; };
  manager.naturalSpawner.budgetMs = Infinity;
  manager.naturalSpawner.tickCount = 78;
  manager.naturalSpawner.tick(manager.players());
  assert.ok(!observed.includes('creature'));
  manager.naturalSpawner.tick(manager.players());
  assert.ok(observed.includes('creature'), 'Lush passive pass runs at tick 80');
});

test('density controls are bounded and reject invalid values', () => {
  const settings = adaptEngineSpawning({ generation: { creature: { probability: 50, groups: 900 }, monster: { probability: 1 } },
    caps: { creature: 9000, ambient: -1 }, chance: { monster: -5 }, passive_interval: 0 });
  assert.deepEqual(settings.generation.creature, { probability: 1, groups: 3 });
  assert.equal(settings.generation.monster, undefined);
  assert.equal(settings.caps.creature, 400);
  assert.equal(settings.caps.ambient, 0);
  assert.equal(settings.chance.monster, 0);
  assert.equal(settings.passiveInterval, 20);
});

test('pack descriptions have meaningful density differences and matching habitats', () => {
  assert.ok(SPAWN_PROFILES.lush_havens.generation.creature.probability > SPAWN_PROFILES.frozen_frontier.generation.creature.probability);
  assert.ok(SPAWN_PROFILES.frozen_frontier.generation.creature.probability > SPAWN_PROFILES.dungeon_rush.generation.creature.probability);
  assert.ok(SPAWN_PROFILES.beast_wilds.caps.monster > SPAWN_PROFILES.scorched_badlands.caps.monster);
  assert.ok(SPAWN_PROFILES.lush_havens.caps.monster < SPAWN_PROFILES.beast_wilds.caps.monster);
  const frozen = buildPresetPack('frozen_frontier').files['data/preset_frozen_frontier/worldgen/biome/plains.json'];
  assert.equal(frozen.temperature, -0.5);
  assert.ok(frozen.spawners.creature.some(e => e.type === 'minecraft:polar_bear'));
  assert.ok(!frozen.spawners.creature.some(e => e.type === 'minecraft:cow'));
});
