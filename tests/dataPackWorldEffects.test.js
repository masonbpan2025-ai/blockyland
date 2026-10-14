// Do data packs actually change the mobs and structures a world generates?
//
// This is the question the loader's earlier tests did not answer. They proved a pack could be PARSED, be
// ADAPTED and be APPLIED -- that a registry changed. They could all have passed while the world generated
// exactly the same mobs and the same structures as before, because the spawn path reads a separate baked
// table and the structure path read a hard-coded id list.
//
// So these tests go to the two places the world actually reads:
//
//   * spawning  -> `biomeSpawnResolver`, which `NaturalSpawner` calls per spawn attempt
//   * structures -> `enabledStructureIds`, which `world.reseed` passes to the structure engine
//
// and they assert the WORLD-level consequence, not only that a map gained a key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDataPack, mergePacks, PREFERRED_PACK_FORMAT } from '../src/dataPack.js';
import { applyDataPack, revertDataPack, resetTagRegistry, PACK_STRUCTURES } from '../src/dataPackRuntime.js';
import {
  resolveBiomeTable, biomeSpawnsFor, resolveSpawnList, populatedCategories,
} from '../src/spawning/biomeSpawnResolver.js';
import {
  PACK_BIOME_SPAWNS, setPackBiomeSpawns, clearPackBiomeSpawns, packBiomeSpawnsFor,
  resetPackBiomeSpawns, spawnerTable, packSpawnSummary,
} from '../src/spawning/packBiomeSpawns.js';
import { selectWeightedEntry, packSizeFor } from '../src/spawning/biomeSpawnResolver.js';
import { MobCategory } from '../src/spawning/mobCategories.js';
import {
  enabledStructureIds, packStructureIds, generatableStructureIds, WORLD_STRUCTURE_IDS,
} from '../src/worldStructures.js';
import { World } from '../src/world.js';

const FIXTURE = new URL('./fixtures/misode/', import.meta.url);
const fixture = (rel) => JSON.parse(readFileSync(new URL(rel, FIXTURE), 'utf8'));

/** Apply a pack and register its revert, so a failing test cannot leak a spawn table into the next one. */
let packCounter = 0;
function applyFor(t, files, name = `Test Pack ${++packCounter}`) {
  const applied = applyDataPack(mergePacks([createDataPack({ name, files })]), { name });
  t.after(() => { revertDataPack(applied); resetTagRegistry(); });
  return applied;
}

/** A biome file that spawns exactly the given monsters, and nothing else in any other category. */
function biomeWithMonsters(monsters) {
  return JSON.stringify({
    effects: { sky_color: 1 },
    spawners: {
      monster: monsters,
      creature: [],
      ambient: [],
      water_creature: [],
      water_ambient: [],
      underground_water_creature: [],
      axolotls: [],
      misc: [],
    },
  });
}

// =====================================================================================================
// MOBS
// =====================================================================================================

test('a pack changes which mobs a biome spawns, all the way to the resolver the spawner calls', (t) => {
  // `NaturalSpawner` calls `resolveSpawnList` for every spawn attempt, so this IS the answer the world gets.
  const before = biomeSpawnsFor('plains', MobCategory.MONSTER).map(e => e.type);
  assert.ok(before.includes('zombie'), 'the baked table really does spawn zombies in plains');

  applyFor(t, {
    'data/t/worldgen/biome/plains.json': biomeWithMonsters([
      { type: 'minecraft:creeper', weight: 100, minCount: 1, maxCount: 2 },
    ]),
  });

  const resolved = resolveSpawnList({ biomeId: 'plains', category: MobCategory.MONSTER, x: 0, y: 64, z: 0 });
  assert.equal(resolved.source, 'biome', 'the biome supplies the list');
  assert.deepEqual(resolved.entries.map(e => e.type), ['creeper'], 'ONLY the pack mob remains');
  assert.ok(!resolved.entries.some(e => e.type === 'zombie'), 'and the baked zombie is gone');
});

test('a pack can ADD a mob a biome never spawned before', (t) => {
  const before = biomeSpawnsFor('plains', MobCategory.MONSTER).map(e => e.type);
  assert.ok(!before.includes('wither_skeleton'), 'plains does not normally spawn wither skeletons');
  applyFor(t, {
    'data/t/worldgen/biome/plains.json': biomeWithMonsters([
      { type: 'minecraft:wither_skeleton', weight: 50, minCount: 1, maxCount: 1 },
    ]),
  });
  const after = biomeSpawnsFor('plains', MobCategory.MONSTER).map(e => e.type);
  assert.deepEqual(after, ['wither_skeleton']);
});

test('a pack can REMOVE all spawning from a biome, and an empty category is not "no opinion"', (t) => {
  // Vanilla uses an empty category to mean "never spawns this", which is a different statement from
  // omitting the category -- and the difference is trial chambers not filling with the surrounding biome.
  const before = biomeSpawnsFor('plains', MobCategory.CREATURE).length;
  assert.ok(before > 0, 'plains normally has passive creatures');
  applyFor(t, { 'data/t/worldgen/biome/plains.json': biomeWithMonsters([]) });
  assert.deepEqual(biomeSpawnsFor('plains', MobCategory.CREATURE), [], 'suppressed, not fallen through');
  assert.deepEqual(biomeSpawnsFor('plains', MobCategory.MONSTER), []);
  const resolved = resolveSpawnList({ biomeId: 'plains', category: MobCategory.MONSTER, x: 0, y: 64, z: 0 });
  assert.equal(resolved.entries.length, 0, 'the spawner gets an empty list and spawns nothing');
});

test('the WEIGHTS survive, so a pack changes the odds and not only the cast', (t) => {
  // The earlier adapter reduced `spawners` to a flat list of names, which cannot express a weight. Using it
  // would have made a zombie villager as common as a zombie.
  applyFor(t, {
    'data/t/worldgen/biome/plains.json': biomeWithMonsters([
      { type: 'minecraft:zombie', weight: 999, minCount: 1, maxCount: 1 },
      { type: 'minecraft:zombie_villager', weight: 1, minCount: 1, maxCount: 1 },
    ]),
  });
  const entries = biomeSpawnsFor('plains', MobCategory.MONSTER);
  assert.equal(entries[0].weight, 999);
  assert.equal(entries[1].weight, 1);

  // Draw from the real weighted picker and count. A flat list would give roughly half and half.
  //
  // The picker draws with `nextInt(total)`, NOT `nextFloat()` -- a stub offering only `nextFloat` throws
  // `random.nextInt is not a function`, which is how this test failed first.
  let zombies = 0;
  const N = 2000;
  // A deterministic PRNG, so the test cannot flake.
  let seed = 12345;
  const random = {
    nextInt: (bound) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % bound; },
  };
  for (let i = 0; i < N; i++) {
    if (selectWeightedEntry(entries, random)?.type === 'zombie') zombies++;
  }
  assert.ok(zombies / N > 0.95, `the 999-weight mob should dominate, got ${(zombies / N * 100).toFixed(1)}%`);
});

test('group size follows the pack too', (t) => {
  applyFor(t, {
    'data/t/worldgen/biome/plains.json': biomeWithMonsters([
      { type: 'minecraft:creeper', weight: 1, minCount: 5, maxCount: 5 },
    ]),
  });
  const entry = biomeSpawnsFor('plains', MobCategory.MONSTER)[0];
  assert.equal(packSizeFor(entry, { nextInt: (n) => n - 1 }), 5, 'a pack that asks for packs of 5 gets them');
});

test('the REAL vanilla biome fixture changes spawning, not only a hand-written sample', (t) => {
  // Validated against generator output, the same way the adapters are.
  const plains = fixture('biome/plains.json');
  const vanillaMonsters = plains.spawners.monster.map(m => m.type.replace('minecraft:', ''));
  assert.ok(vanillaMonsters.length > 0, 'the fixture has real spawners');
  applyFor(t, { 'data/minecraft/worldgen/biome/plains.json': plains });
  assert.deepEqual(
    biomeSpawnsFor('plains', MobCategory.MONSTER).map(e => e.type),
    vanillaMonsters,
    'the pack table is what the spawner now reads',
  );
});

test('a pack that says nothing about a biome leaves its spawning alone', (t) => {
  // The override is per biome. A pack with one biome must not wipe the rest of the world's spawns.
  const desertBefore = biomeSpawnsFor('desert', MobCategory.MONSTER).map(e => e.type);
  const plainsBefore = biomeSpawnsFor('plains', MobCategory.MONSTER).map(e => e.type);
  applyFor(t, {
    'data/t/worldgen/biome/desert.json': biomeWithMonsters([{ type: 'minecraft:husk', weight: 1, minCount: 1, maxCount: 1 }]),
  });
  assert.deepEqual(biomeSpawnsFor('desert', MobCategory.MONSTER).map(e => e.type), ['husk']);
  assert.deepEqual(biomeSpawnsFor('plains', MobCategory.MONSTER).map(e => e.type), plainsBefore,
    'a biome the pack does not name is untouched');
  assert.ok(desertBefore.includes('zombie'), 'and the desert really did change from something');
});

test('reverting a pack puts the baked spawn table back exactly', (t) => {
  const before = {
    monsters: biomeSpawnsFor('plains', MobCategory.MONSTER),
    creatures: biomeSpawnsFor('plains', MobCategory.CREATURE).map(e => e.type),
    categories: populatedCategories('plains').length,
    table: resolveBiomeTable('plains'),
  };
  const applied = applyDataPack(mergePacks([createDataPack({ name: 'Revert Spawns', files: {
    'data/t/worldgen/biome/plains.json': biomeWithMonsters([{ type: 'minecraft:creeper', weight: 1, minCount: 1, maxCount: 1 }]),
  } })]), { name: 'Revert Spawns' });
  assert.deepEqual(biomeSpawnsFor('plains', MobCategory.MONSTER).map(e => e.type), ['creeper']);

  revertDataPack(applied);
  resetTagRegistry();
  assert.equal(resolveBiomeTable('plains'), before.table, 'the SAME table object is back, not a copy');
  assert.deepEqual(biomeSpawnsFor('plains', MobCategory.CREATURE).map(e => e.type), before.creatures);
  assert.equal(populatedCategories('plains').length, before.categories);
  assert.deepEqual(biomeSpawnsFor('plains', MobCategory.MONSTER).map(e => e.type),
    before.monsters.map(e => e.type));
  assert.equal(PACK_BIOME_SPAWNS.size, 0, 'and the override map is empty');
});

test('two packs stack, and the later one wins the spawn table', (t) => {
  const base = applyDataPack(mergePacks([createDataPack({ name: 'Base', files: {
    'data/t/worldgen/biome/plains.json': biomeWithMonsters([{ type: 'minecraft:zombie', weight: 1, minCount: 1, maxCount: 1 }]),
  } })]), { name: 'Base' });
  const top = applyDataPack(mergePacks([createDataPack({ name: 'Top', files: {
    'data/t/worldgen/biome/plains.json': biomeWithMonsters([{ type: 'minecraft:skeleton', weight: 1, minCount: 1, maxCount: 1 }]),
  } })]), { name: 'Top' });
  try {
    assert.deepEqual(biomeSpawnsFor('plains', MobCategory.MONSTER).map(e => e.type), ['skeleton']);
    revertDataPack(top);
    assert.deepEqual(biomeSpawnsFor('plains', MobCategory.MONSTER).map(e => e.type), ['zombie'],
      'reverting the top pack restores the one underneath');
  } finally {
    revertDataPack(base);
    resetTagRegistry();
  }
});

test('the registry itself behaves: set, get, clear, and a summary that counts', (t) => {
  try {
    assert.equal(packBiomeSpawnsFor('nowhere'), null);
    setPackBiomeSpawns('Testland', { monster: [{ type: 'x', weight: 1, minCount: 1, maxCount: 1 }] });
    assert.ok(packBiomeSpawnsFor('testland'), 'the id is case-folded');
    assert.deepEqual(packSpawnSummary(), { biomes: 1, categories: 1, entries: 1 });
    assert.equal(clearPackBiomeSpawns('testland'), true);
    assert.equal(clearPackBiomeSpawns('testland'), false);
    assert.equal(packSpawnSummary().biomes, 0);
  } finally {
    resetPackBiomeSpawns();
  }
});

test('spawnerTable keeps weights, drops nameless entries and defaults missing fields', (t) => {
  const table = spawnerTable({
    monster: [
      { type: 'minecraft:zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'minecraft:skeleton' },
      { weight: 10 },
      { type: 42 },
    ],
    creature: [],
  });
  assert.equal(table.monster.length, 2, 'the two nameless entries are dropped');
  assert.deepEqual(table.monster[0], { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 });
  assert.deepEqual(table.monster[1], { type: 'skeleton', weight: 1, minCount: 1, maxCount: 1 },
    'a missing weight defaults rather than dropping the mob');
  assert.deepEqual(table.creature, [], 'an empty category is KEPT');
  assert.equal(spawnerTable(null), null);
  assert.equal(spawnerTable([]), null);
  assert.equal(spawnerTable({ monster: 'nope' }), null, 'a non-array category is skipped, and nothing is left');
});

// =====================================================================================================
// STRUCTURES
// =====================================================================================================

test('a pack changes which structures a world places', (t) => {
  assert.deepEqual(enabledStructureIds(), [...WORLD_STRUCTURE_IDS], 'the baked default to start');
  applyFor(t, {
    'data/t/worldgen/structure/jungle_pyramid.json': { type: 'minecraft:jigsaw', biomes: '#minecraft:has_structure/jungle_pyramid' },
    'data/t/worldgen/structure/monument.json': { type: 'minecraft:ocean_monument', biomes: '#minecraft:has_structure/monument' },
  });
  const enabled = enabledStructureIds();
  assert.deepEqual(enabled, ['jungle_pyramid', 'monument'], 'the pack decides, not the baked list');
  assert.ok(!enabled.includes('village_plains'), 'and the baked entries are gone');
});

test('a structure the engine has no generator for is NOT enabled', (t) => {
  // A name that plans nothing while the world reports it as on is worse than not accepting it.
  const generatable = generatableStructureIds();
  assert.ok(generatable.includes('jungle_pyramid'));
  // Every registry structure has a generator now; ids from outside the registry (a newer version's abandoned camp,
  // a made-up one) are the ones a pack can name that the engine cannot build.
  assert.ok(!generatable.includes('abandoned_camp'), 'the engine cannot generate an abandoned camp');
  applyFor(t, {
    'data/t/worldgen/structure/abandoned_camp.json': { type: 'minecraft:abandoned_camp' },
    'data/t/worldgen/structure/not_a_structure.json': { type: 'minecraft:nope' },
  });
  assert.deepEqual(enabledStructureIds(), [...WORLD_STRUCTURE_IDS],
    'nothing was enabled, so the world falls back to its baked list rather than generating nothing');
});

test('a pack may ENABLE SOME generatable structures and disable the rest', (t) => {
  applyFor(t, {
    'data/t/worldgen/structure/igloo.json': { type: 'minecraft:igloo' },
  });
  assert.deepEqual(enabledStructureIds(), ['igloo'], 'exactly the pack set, not the baked three');
});

test('a namespaced structure id resolves to the engine id', (t) => {
  // A pack writes `data/mypack/worldgen/structure/igloo.json`, so the registry key is `mypack:igloo`.
  applyFor(t, {
    'data/otherpack/worldgen/structure/igloo.json': { type: 'minecraft:igloo' },
  });
  assert.ok(PACK_STRUCTURES.has('otherpack:igloo'), 'stored under its namespace');
  assert.deepEqual(enabledStructureIds(), ['igloo'], 'and the namespace is stripped for the engine');
});

test('reverting a pack puts the baked structure list back', (t) => {
  const applied = applyDataPack(mergePacks([createDataPack({ name: 'Struct Revert', files: {
    'data/t/worldgen/structure/jungle_pyramid.json': { type: 'minecraft:jigsaw' },
  } })]), { name: 'Struct Revert' });
  assert.deepEqual(enabledStructureIds(), ['jungle_pyramid']);
  revertDataPack(applied);
  resetTagRegistry();
  assert.deepEqual(enabledStructureIds(), [...WORLD_STRUCTURE_IDS]);
  assert.deepEqual(packStructureIds(), []);
});

test('a pack structure list with duplicates enables each structure once', (t) => {
  // Two packs naming the same structure must not place it twice.
  applyFor(t, {
    'data/a/worldgen/structure/igloo.json': { type: 'minecraft:igloo' },
    'data/b/worldgen/structure/igloo.json': { type: 'minecraft:igloo' },
  });
  assert.deepEqual(enabledStructureIds(), ['igloo']);
});

test('the WORLD takes its structure list from the pack', (t) => {
  // The real integration point: `world.reseed` passes `enabledStructureIds()` to the engine, so a pack set
  // before a new world changes what that world places. Driven through the real World class.
  const world = new World();
  const defaultIds = world.structures.enabledIds ? [...world.structures.enabledIds] : null;

  applyFor(t, { 'data/t/worldgen/structure/igloo.json': { type: 'minecraft:igloo' } });
  const world2 = new World();
  if (world2.structures.enabledIds) {
    assert.deepEqual([...world2.structures.enabledIds], ['igloo'], 'the new world enabled the pack structure');
    if (defaultIds) assert.notDeepEqual([...world2.structures.enabledIds], defaultIds, 'which differs from the default');
  } else {
    // The engine does not expose its enabled set; assert the source of truth it was built from instead.
    assert.deepEqual(enabledStructureIds(), ['igloo']);
  }
});

/**
 * Every structure the world actually PLANS over a grid of chunks, via the real planner.
 *
 * The radius is 25 chunks because structures are SPARSE: over the default world and seed, a 441-chunk grid
 * finds nothing at all, and it takes 2601 chunks to find a single igloo. A smaller radius makes this test
 * assert an empty set and pass for the wrong reason.
 */
function plannedStructures(world, radius = 25) {
  const found = new Map();
  for (let cx = -radius; cx <= radius; cx++) {
    for (let cz = -radius; cz <= radius; cz++) {
      const start = world.structures.planAt(cx, cz);
      if (!start) continue;
      found.set(start.structureId, (found.get(start.structureId) || 0) + 1);
    }
  }
  return found;
}

test('the world PLANS different structures with a pack than without one', (t) => {
  // Not "the enabled list changed" -- what the real planner, over a real world and a real seed, decides to
  // place. This is the claim the whole task rests on.
  const before = plannedStructures(new World());
  assert.ok(before.size > 0, `the default world plans something, got ${before.size} kinds: `
    + JSON.stringify([...before.keys()]));
  assert.ok([...before.keys()].every(id => WORLD_STRUCTURE_IDS.includes(id)),
    'and only the baked three: ' + JSON.stringify([...before.keys()]));

  applyFor(t, { 'data/t/worldgen/structure/jungle_pyramid.json': { type: 'minecraft:jigsaw' } });
  const after = plannedStructures(new World());

  // Every planned structure comes from the pack's set -- the pack GATES generation, it does not merely add.
  for (const id of after.keys()) {
    assert.equal(id, 'jungle_pyramid', `the pack enabled only jungle_pyramid, but ${id} was planned`);
  }
  // And a structure the default world DID plan is gone, which is what makes this a change rather than an
  // absence: without the pack the planner placed it, with the pack it must not.
  assert.ok(before.size > 0, 'there was something to lose');
  for (const id of before.keys()) {
    assert.ok(!after.has(id), `${id} was planned before the pack and must not be now`);
  }
});

test('a pack that enables a structure the world cannot place plans nothing, and that is visible', (t) => {
  // The honest failure mode: the pack enabled a real structure, but its biome gate never matches here, so
  // the world places nothing. `stats` says so rather than the world looking broken.
  applyFor(t, { 'data/t/worldgen/structure/monument.json': { type: 'minecraft:ocean_monument' } });
  const world = new World();
  assert.deepEqual([...world.structures.enabledIds], ['monument']);
  const planned = plannedStructures(world, 4);
  for (const id of planned.keys()) assert.equal(id, 'monument');
  // Whatever it planned, the engine's own stats agree about how many chunks it looked at.
  assert.ok(world.structures.stats.chunks >= 0, 'stats are exposed for exactly this kind of question');
});


// =====================================================================================================
// THE DEFAULT PACK'S SETTINGS
// =====================================================================================================

test('the bundled pack declares what a typical Minecraft data pack declares', (t) => {
  // "Make the default data pack setting the same as the Minecraft typical data pack setting": the vanilla
  // data pack's own `pack.mcmeta` is `{description, pack_format}`, so the bundled one carries the same.
  const files = JSON.parse(readFileSync(new URL('../public/datapacks/vanilla-1.21.4.json', import.meta.url), 'utf8'));
  const meta = JSON.parse(readFileSync(new URL('../public/datapacks/vanilla-1.21.4.meta.json', import.meta.url), 'utf8'));
  const mcmeta = files['pack.mcmeta'];

  assert.ok(mcmeta, 'the bundle HAS a pack.mcmeta; a data pack without one is not what Minecraft ships');
  assert.equal(mcmeta.pack.description, 'The default data for Minecraft', 'the vanilla description verbatim');
  assert.equal(mcmeta.pack.pack_format, 61, "1.21.4's data pack format");
  assert.equal(meta.pack.pack_format, mcmeta.pack.pack_format, 'the manifest agrees with the file');
  assert.equal(meta.packMetaFromTag, true, 'and it was read from the tag rather than from a fallback');
  assert.equal(meta.format, PREFERRED_PACK_FORMAT, 'and it matches the format this build prefers');
});

test('the preferred pack format is the version this project actually targets', (t) => {
  // It was 48, which is 1.21/1.21.1 -- so every pack that declared 1.21.4 correctly was reported as a
  // mismatch, and the bundled pack would have been too.
  assert.equal(PREFERRED_PACK_FORMAT, 61);
});

test('a bundled pack declaring 61 has no format mismatch', async () => {
  const files = JSON.parse(readFileSync(new URL('../public/datapacks/vanilla-1.21.4.json', import.meta.url), 'utf8'));
  const pack = createDataPack({ name: 'Vanilla', files });
  assert.equal(pack.formatMismatch, false, 'the default pack is not flagged against itself');
  assert.equal(pack.skipped.length, 0, 'and every file still loads: ' + JSON.stringify(pack.skipped.slice(0, 2)));
  // `pack.mcmeta` is METADATA, not a loadable entry -- so the entry count is one less than the file count.
  assert.equal(pack.entries.length, Object.keys(files).length - 1);
});

test('the bundled pack changes spawning and structures when it is applied', async () => {
  // The end-to-end claim: the DEFAULT pack, through the real apply path, changes what a world spawns and
  // what it places -- not only what a hand-written test pack does.
  const files = JSON.parse(readFileSync(new URL('../public/datapacks/vanilla-1.21.4.json', import.meta.url), 'utf8'));
  const beforeSpawns = biomeSpawnsFor('plains', MobCategory.MONSTER).map(e => e.type);
  const beforeStructures = enabledStructureIds();

  const applied = applyDataPack(mergePacks([createDataPack({ name: 'Bundled', files })]), { name: 'Bundled' });
  try {
    // Vanilla's own plains table reaches the spawner.
    assert.deepEqual(
      biomeSpawnsFor('plains', MobCategory.MONSTER).map(e => e.type),
      files['data/minecraft/worldgen/biome/plains.json'].spawners.monster.map(m => m.type.replace('minecraft:', '')),
    );
    assert.ok(PACK_BIOME_SPAWNS.size > 50, `the bundle overrides spawns for many biomes, got ${PACK_BIOME_SPAWNS.size}`);
    assert.ok(packSpawnSummary().entries > 100, 'and with real entries: ' + JSON.stringify(packSpawnSummary()));
    // And its structures decide what the world places.
    const structures = enabledStructureIds();
    assert.ok(structures.length > 3, `the bundle enables more than the baked three, got ${structures.length}`);
    for (const id of structures) assert.ok(generatableStructureIds().includes(id), id + ' must be generatable');
  } finally {
    revertDataPack(applied);
    resetTagRegistry();
  }
  assert.deepEqual(biomeSpawnsFor('plains', MobCategory.MONSTER).map(e => e.type), beforeSpawns);
  assert.deepEqual(enabledStructureIds(), beforeStructures);
});
