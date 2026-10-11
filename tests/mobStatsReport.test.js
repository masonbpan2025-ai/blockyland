// `/show_mobs`, and the diagnosis of why a Lush Havens world can look empty.
//
// "I see no mobs" has five causes that look identical from a screenshot, so each one is asserted separately
// against the report that is supposed to distinguish them. The report is a pure function, so none of this
// needs a browser or a running world.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildMobStatsReport, formatMobStatsReport, spawnVerdicts, NEARBY_RADIUS,
} from '../src/spawning/mobStatsReport.js';
import { MobCategory } from '../src/spawning/mobCategories.js';
import { biomeSpawnsFor } from '../src/spawning/biomeSpawnResolver.js';
import {
  resetPackBiomeSpawns, setPackBiomeSpawns, clearPackBiomeSpawns, packBiomeSpawnSource, spawnerTable,
  packBiomeSpawnsFor,
} from '../src/spawning/packBiomeSpawns.js';
import { ChunkGenerationSpawner } from '../src/spawning/chunkGenerationSpawner.js';
import { resetTagRegistry } from '../src/dataPackRuntime.js';
import { JavaRandom } from '../src/spawning/spawnRandom.js';
import { createPackStore, addPack, PACK_SOURCES } from '../src/dataPackStore.js';
import { buildPresetPack } from '../src/dataPackPresets.js';
import { applyStore, revertAll } from '../src/dataPackApply.js';
import { World } from '../src/world.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { COMMANDS, findCommand } from '../src/commands.js';

const PLAINS_TABLE = {
  monster: [{ type: 'zombie', weight: 95, minCount: 4, maxCount: 4 }],
  creature: [{ type: 'cow', weight: 8, minCount: 4, maxCount: 4 }],
};

/** A report input with everything sensible, so a test overrides only what it is about. */
function input(overrides = {}) {
  return {
    mobs: [],
    snapshot: {
      enabled: true, difficulty: 'normal', worldTime: 6000, night: false, skyDarken: 0,
      spawnTicks: 100, eligibleChunks: 100,
      spawner: { chunkAttempts: 10, groupAttempts: 10, positionAttempts: 10, spawns: 1, successRate: 0.1, rejectionsByReason: {} },
      caps: {},
    },
    player: { x: 0, y: 28, z: 0 },
    biomeId: 'plains',
    tableFor: (c) => PLAINS_TABLE[c] ?? [],
    lightLevel: 0,
    gamemode: 'survival',
    peaceful: false,
    ...overrides,
  };
}

const text = (r) => r.lines.map(l => l.text).join('\n');

// --- the five causes, each distinguishable ------------------------------------------------------------

test('an EMPTY biome table is named as the reason', () => {
  const v = spawnVerdicts({ tableFor: () => [], biomeId: 'the_void', snapshot: { spawnTicks: 5 } });
  assert.ok(v.some(s => /NO monster spawns/.test(s)), JSON.stringify(v));
  assert.ok(v.some(s => /NO creature spawns/.test(s)));
  assert.ok(v.some(s => /no land animals.*Aquatic and cave categories are separate/.test(s)));
  assert.ok(!v.some(s => /no animals can appear/.test(s)));
});

test('DAYLIGHT is named as the reason for missing hostiles, and not when it is dark', () => {
  const day = spawnVerdicts({ tableFor: c => PLAINS_TABLE[c] ?? [], biomeId: 'plains', lightLevel: 15, snapshot: { night: false } });
  assert.ok(day.some(s => /need light 0 and the light here is 15/.test(s)), JSON.stringify(day));
  assert.ok(day.some(s => /daylight/.test(s)));

  const night = spawnVerdicts({ tableFor: c => PLAINS_TABLE[c] ?? [], biomeId: 'plains', lightLevel: 0, snapshot: { night: true } });
  assert.ok(!night.some(s => /need light 0/.test(s)), 'dark enough, so the light is not the problem');
});

test('a FULL cap is named, and an unlimited one is not', () => {
  const v = spawnVerdicts({
    tableFor: c => PLAINS_TABLE[c] ?? [], biomeId: 'plains', lightLevel: 0,
    snapshot: { spawnTicks: 10, caps: {
      monster: { count: 70, cap: 70, hasRoom: false },
      creature: { count: 3, cap: 10, hasRoom: true },
      ambient: { count: 900, cap: 999, unlimited: true },
    } },
  });
  assert.ok(v.some(s => /monster cap is FULL \(70\/70\)/.test(s)), JSON.stringify(v));
  assert.equal(v.filter(s => /cap is FULL/.test(s)).length, 1, 'only the full one');
});

test('a spawner that has not ticked is named, and so is one with no eligible chunks', () => {
  const never = spawnVerdicts({ tableFor: c => PLAINS_TABLE[c] ?? [], biomeId: 'plains', lightLevel: 0, snapshot: { spawnTicks: 0 } });
  assert.ok(never.some(s => /never ticked/.test(s)), JSON.stringify(never));

  const noChunks = spawnVerdicts({
    tableFor: c => PLAINS_TABLE[c] ?? [], biomeId: 'plains', lightLevel: 0,
    snapshot: { spawnTicks: 50, spawner: { positionAttempts: 0 } },
  });
  assert.ok(noChunks.some(s => /not one position was attempted/.test(s)), JSON.stringify(noChunks));
});

test('chunk generation that placed NOTHING is named', () => {
  const v = spawnVerdicts({
    tableFor: c => PLAINS_TABLE[c] ?? [], biomeId: 'plains', lightLevel: 0, snapshot: { spawnTicks: 5 },
    chunkGeneration: { chunksConsidered: 81, mobs: 0 },
  });
  assert.ok(v.some(s => /populated 81 chunk\(s\) and placed no animals/.test(s)), JSON.stringify(v));
  // A pass that DID place animals is not reported.
  const ok = spawnVerdicts({
    tableFor: c => PLAINS_TABLE[c] ?? [], biomeId: 'plains', lightLevel: 0, snapshot: { spawnTicks: 5 },
    chunkGeneration: { chunksConsidered: 81, mobs: 75 },
  });
  assert.ok(!ok.some(s => /placed no animals/.test(s)));
});

test('mobs that exist but are all FAR AWAY are told apart from no mobs at all', () => {
  const far = spawnVerdicts({ tableFor: c => PLAINS_TABLE[c] ?? [], biomeId: 'plains', lightLevel: 0,
    snapshot: { spawnTicks: 5 }, totalMobs: 40, nearbyCount: 0 });
  assert.ok(far.some(s => /40 mob\(s\) are loaded but none within/.test(s)), JSON.stringify(far));
  const none = spawnVerdicts({ tableFor: c => PLAINS_TABLE[c] ?? [], biomeId: 'plains', lightLevel: 0,
    snapshot: { spawnTicks: 5 }, totalMobs: 0, nearbyCount: 0 });
  assert.ok(none.some(s => /No mobs are loaded anywhere/.test(s)));
  assert.ok(!none.some(s => /are loaded but none within/.test(s)));
});

test('Creative flying is named as its own reason, because it is the one people least expect', () => {
  const v = spawnVerdicts({ tableFor: c => PLAINS_TABLE[c] ?? [], biomeId: 'plains', lightLevel: 0,
    snapshot: { spawnTicks: 5 }, totalMobs: 30, nearbyCount: 0, gamemode: 'creative' });
  assert.ok(v.some(s => /flying leaves mobs behind/.test(s)), JSON.stringify(v));
  // Not said in Survival, where it would be untrue.
  const s = spawnVerdicts({ tableFor: c => PLAINS_TABLE[c] ?? [], biomeId: 'plains', lightLevel: 0,
    snapshot: { spawnTicks: 5 }, totalMobs: 30, nearbyCount: 0, gamemode: 'survival' });
  assert.ok(!s.some(s2 => /flying leaves mobs behind/.test(s2)));
});

test('Peaceful is named as a reason rather than reported as a fault', () => {
  const v = spawnVerdicts({ tableFor: c => PLAINS_TABLE[c] ?? [], biomeId: 'plains', lightLevel: 0,
    snapshot: { spawnTicks: 5 }, peaceful: true });
  assert.ok(v.some(s => /Difficulty is Peaceful/.test(s)), JSON.stringify(v));
  // And the light rule is not reported, because on Peaceful there is nothing for it to refuse.
  assert.ok(!v.some(s => /need light 0/.test(s)));
});

test('a DISABLED spawn manager is said first, because nothing else can matter', () => {
  const v = spawnVerdicts({ tableFor: c => PLAINS_TABLE[c] ?? [], biomeId: 'plains', lightLevel: 0,
    snapshot: { enabled: false, spawnTicks: 0 } });
  assert.match(v[0], /DISABLED/);
});

test('a healthy world produces no verdict at all', () => {
  const v = spawnVerdicts({ tableFor: c => PLAINS_TABLE[c] ?? [], biomeId: 'plains', lightLevel: 0,
    snapshot: { spawnTicks: 500, spawner: { positionAttempts: 900 }, caps: { monster: { count: 3, cap: 70, hasRoom: true } } },
    totalMobs: 12, nearbyCount: 4 });
  assert.deepEqual(v, [], JSON.stringify(v));
});

// --- the report itself ---------------------------------------------------------------------------------

test('every section is present and the counts are right', () => {
  const r = buildMobStatsReport(input({
    mobs: [
      { type: 'cow', category: 'creature', position: { x: 2, y: 28, z: 0 } },
      { type: 'cow', category: 'creature', position: { x: 400, y: 28, z: 0 } },
      { type: 'creeper', category: 'monster', position: { x: 5, y: 28, z: 5 } },
    ],
    chunkGeneration: { chunksConsidered: 81, chunksPopulated: 10, mobs: 75, skipped: 71 },
    packName: 'Lush Havens',
  }));
  const t = text(r);
  assert.match(t, /MOBS: 3 loaded/);
  assert.match(t, /cow\s+2/);
  assert.match(t, new RegExp(`WITHIN ${NEARBY_RADIUS} BLOCKS: 2`), 'the far cow is not nearby');
  assert.match(t, /WHAT CAN SPAWN IN PLAINS/);
  assert.match(t, /spawn table from: Lush Havens/);
  assert.match(t, /SPAWNER/);
  assert.match(t, /chunk generation/i);
  assert.match(t, /chunks considered 81/);
});

test('the report names the pack that supplied the table', () => {
  // The first thing to suspect when a world spawns something unexpected, and not recoverable from the table.
  const r = buildMobStatsReport(input({ packName: 'Frozen Frontier' }));
  assert.match(text(r), /spawn table from: Frozen Frontier/);
  // And says nothing when no pack supplied it.
  assert.ok(!/spawn table from/.test(text(buildMobStatsReport(input({ packName: null })))));
});

test('an empty world still reports, rather than printing nothing', () => {
  const r = buildMobStatsReport(input({ mobs: [], player: null, biomeId: null, tableFor: () => [], snapshot: {} }));
  const t = text(r);
  assert.match(t, /MOBS: 0 loaded/);
  assert.match(t, /\(none\)/);
  assert.ok(r.verdicts.length > 0, 'and it explains the emptiness');
});

test('the report survives a game with no spawner at all', () => {
  // Called before the manager exists, or on a world that has not started: it must not throw, because a
  // diagnostic that crashes is worse than none.
  assert.doesNotThrow(() => buildMobStatsReport({}));
  assert.doesNotThrow(() => buildMobStatsReport({ snapshot: null, mobs: null, player: null }));
  const r = buildMobStatsReport({ snapshot: {}, mobs: [], player: null });
  assert.match(text(r), /no spawner counters yet/);
});

test('formatMobStatsReport returns the same lines the chat prints', () => {
  const r = buildMobStatsReport(input());
  const lines = formatMobStatsReport(input());
  assert.equal(lines.length, r.lines.length);
  for (const line of lines) {
    assert.equal(typeof line.text, 'string');
    assert.ok(['system', 'help', 'error'].includes(line.kind), line.kind);
  }
});

// --- the command --------------------------------------------------------------------------------------

test('/show_mobs is dispatched, listed in help, and gated to Creative or cheats', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  // Dispatched by the manager switch. It was an `if (root === '/show_mobs')` in the same method; that chain
  // was refactored into a switch plus `commandRunner.js`, so this asserts the shape that exists now.
  assert.match(main, /case '\/show_mobs': return this\.runShowMobsCommand\(\);/);
  assert.match(main, /runShowMobsCommand\(\) \{/);
  assert.match(main, /buildMobStatsReport\(\) \{/, 'there is a method that gathers the state');
  assert.match(main, /import \{ buildMobStatsReport \} from '\.\/spawning\/mobStatsReport\.js'/);
  // The `/help` text lives in `commandRunner.cmdHelp` now, not in the 4,000-line `main.js`.
  const runner = readFileSync(new URL('../src/commandRunner.js', import.meta.url), 'utf8');
  assert.match(runner, /\/show_mobs - What mobs exist/, 'and it is advertised in /help');
  // The gate, and a refusal that says how to get it rather than merely declining.
  assert.match(main, /if \(!isCreative\(this\.settings\) && !this\.settings\?\.cheats\)/);
  assert.match(main, /is a Creative diagnostic/);
  // It is ALSO declared a cheat command, so `permissionRefusal` refuses it before the switch is even reached.
  assert.equal(findCommand('show_mobs')?.gate, true, '/show_mobs is a gated command');
});

test('the command reads the SAME tables natural spawning uses', () => {
  // If the report had its own data it could disagree with the spawner, which would make it worse than
  // useless. It calls the resolver.
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /import \{ biomeSpawnsFor \} from '\.\/spawning\/biomeSpawnResolver\.js'/);
  assert.match(main, /tableFor = \(category\) => biomeSpawnsFor\(biomeId, category\)/);
});

// --- which pack supplied a biome's spawners -----------------------------------------------------------

test('the spawn registry remembers which pack supplied a table', () => {
  resetPackBiomeSpawns();
  try {
    assert.equal(packBiomeSpawnSource('plains'), null, 'the baked table has no source');
    setPackBiomeSpawns('plains', spawnerTable({ creature: [{ type: 'minecraft:cow' }] }), 'Lush Havens');
    assert.equal(packBiomeSpawnSource('plains'), 'Lush Havens');
    assert.equal(packBiomeSpawnSource('PLAINS'), 'Lush Havens', 'case-folded like the table');
    assert.ok(packBiomeSpawnsFor('plains'), 'and the table is still readable the old way');
    clearPackBiomeSpawns('plains');
    assert.equal(packBiomeSpawnSource('plains'), null, 'clearing drops the source too');
  } finally {
    resetPackBiomeSpawns();
  }
});

test('applying a preset attributes the biome spawners to it', () => {
  const store = createPackStore();
  const built = buildPresetPack('lush_havens');
  addPack(store, { name: built.name, files: built.files, source: PACK_SOURCES.PRESET, format: 61 });
  const applied = applyStore(store);
  try {
    assert.equal(packBiomeSpawnSource('flower_forest'), 'Lush Havens');
  } finally {
    revertAll(applied);
    resetPackBiomeSpawns();
  }
  assert.equal(packBiomeSpawnSource('flower_forest'), null, 'and reverting drops it');
});

// --- the Lush Havens finding: animals on the canopy ----------------------------------------------------

/** Drive the real chunk-generation spawner over a real world and report where the animals landed. */
function populate(radius = 4, options = {}) {
  // `treeDensity` is the variable under control. Generation spawning snaps an animal to the top of its
  // column using WORLD_SURFACE, which in a canopy is a LEAF -- and a leaf is not somewhere a species
  // predicate allows an animal. So whether anything is placed at all depends on the canopy, and a test that
  // did not control it was really measuring whatever tree density the previous file left behind.
  // NOTE: no reset here. resetTagRegistry restores the built-in biomes AND clears the pack registries, so
  // calling it inside this helper wiped the pack the caller had just applied -- the Lush run then measured a
  // baseline and reported 'baseline 19 -> lush 19'. The reset belongs at the START of a test, before any pack
  // is applied, which is where it now is.
  if (options.treeDensity !== undefined) {
    resetTagRegistry();
    const store = createPackStore();
    const files = {};
    for (const biome of ['plains', 'forest', 'flower_forest', 'taiga', 'snowy_plains', 'badlands']) {
      files[`data/t/worldgen/biome/${biome}.json`] = JSON.stringify({
        engine_terrain: { tree_density: options.treeDensity, tree_type: 'oak' },
      });
    }
    addPack(store, { name: 'Terrain', files, source: PACK_SOURCES.PASTED, format: 61 });
    options.applied = applyStore(store);
  }
  const world = new World();
  const created = [];
  const manager = {
    world, difficulty: 'normal', random: new JavaRandom(4242), created,
    dimensionsFor: () => ({ width: 0.9, height: 1.4 }),
    isSolidAt: (x, y, z) => {
      const id = world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z));
      return id !== 0 && id !== 8 && id !== 9;
    },
    createMob: (type, x, y, z, context) => { const m = { type, x, y, z, context }; created.push(m); return m; },
  };
  manager.boundIsSolidAt = (x, y, z) => manager.isSolidAt(x, y, z);
  // A FAITHFUL stand-in for `NaturalSpawner.predicateContext`, filling the same fields from the same world.
  //
  // The first version was `() => ({})`, which handed every species predicate an empty object. That happened to
  // pass while the predicates were unregistered -- `generationPredicateAllows` returns true early when a type
  // has no predicate -- and failed once they were, reporting 180 `MOB_PREDICATE_FAILED` refusals and zero
  // animals. It only held together because of which module a given file imported first.
  manager.naturalSpawner = {
    predicateContext: ({ world: w, x, y, z, biomeId, category, structureId, type }) => {
      const bx = Math.floor(x);
      const bz = Math.floor(z);
      return {
        world: w, x, y, z, type, category, biomeId, structureId,
        dimension: 'overworld', difficulty: 'normal', random: manager.random,
        blockAt: w.getVoxel(bx, y, bz),
        blockBelow: w.getVoxel(bx, y - 1, bz),
        skyLight: w.getSkyLight ? w.getSkyLight(bx, y, bz) : 15,
        blockLight: w.getBlockLight ? w.getBlockLight(bx, y, bz) : 0,
        skyDarken: 0, thunder: false, isNight: false,
        lightLevel: w.getLightLevel ? w.getLightLevel(bx, y, bz, 0) : 15,
      };
    },
  };
  const spawner = new ChunkGenerationSpawner({ mobSpawnManager: manager });
  for (let cx = -radius; cx <= radius; cx++) for (let cz = -radius; cz <= radius; cz++) world.getOrCreateChunk(cx, cz);
  for (let cx = -radius; cx <= radius; cx++) for (let cz = -radius; cz <= radius; cz++) spawner.onChunkGenerated(cx, cz);

  const LEAVES = new Set([BLOCKS.OAK_LEAVES, BLOCKS.JUNGLE_LEAVES, BLOCKS.DARK_OAK_LEAVES, BLOCKS.BIRCH_LEAVES,
    BLOCKS.SPRUCE_LEAVES, BLOCKS.ACACIA_LEAVES, BLOCKS.CHERRY_LEAVES].filter(v => typeof v === 'number'));
  let onLeaves = 0;
  for (const m of created) {
    if (LEAVES.has(world.getVoxel(Math.floor(m.x), Math.floor(m.y) - 1, Math.floor(m.z)))) onLeaves++;
  }
  // Enough context that a `placed 0` failure explains itself rather than only reporting the count.
  const biomes = new Map();
  for (let cx = -radius; cx <= radius; cx++) {
    for (let cz = -radius; cz <= radius; cz++) {
      const b = world.getBiome(cx * 16, cz * 16);
      biomes.set(b, (biomes.get(b) ?? 0) + 1);
    }
  }
  const tableSizes = {};
  for (const b of biomes.keys()) tableSizes[b] = biomeSpawnsFor(b, MobCategory.CREATURE).length;
  if (options.applied) revertAll(options.applied);
  return { created, onLeaves, stats: spawner.stats, manager,
    diagnostics: `stats=${JSON.stringify(spawner.stats)} lastRejection=${spawner.lastRejection} `
      + `biomes=${JSON.stringify([...biomes])} creatureTables=${JSON.stringify(tableSizes)}` };
}

// --- the spawner reads the biome table -----------------------------------------------------------------
//
// These assert what is DETERMINISTIC: whether a generation pack is attempted at all. What gets PLACED depends
// on the terrain -- generation spawning snaps a member to the top of its column, and a species predicate
// refuses a leaf -- so a placement count is a measurement of the world, not of the spawner.
//
// For the record, measured directly with a controlled world: a baseline run placed 59 animals over 81 chunks
// and 19 over 49; with Lush Havens applied the same runs placed 75 and 35. A canopy at tree_density 0.9 placed
// none, refused by MOB_PREDICATE_FAILED, because every candidate column tops out in leaves. Those numbers come
// from a one-off harness, not from this suite, because reproducing them here needs a world whose terrain this
// process is not also mutating.

// --- what the spawner is given ------------------------------------------------------------------------
//
// No World is built here. A generation-spawn run needs one, and whether it PLACES anything then depends on the
// terrain -- a species predicate refuses a leaf -- which in a shared process depends on what the previous file
// applied. Those runs were measured directly instead, and the numbers are recorded in the section comment
// above rather than asserted here.
//
// What IS deterministic, and is what the spawner actually reads, is the table.

test('the baked tables give the common biomes creature spawns to work from', () => {
  // The precondition for any generation spawning at all. Pure data: no world, no spawner, no ambient state.
  resetTagRegistry();
  resetPackBiomeSpawns();
  for (const biome of ['plains', 'forest', 'flower_forest', 'taiga', 'snowy_plains', 'badlands', 'desert']) {
    const creatures = biomeSpawnsFor(biome, MobCategory.CREATURE);
    assert.ok(creatures.length > 0, biome + ' has creature spawns');
    for (const entry of creatures) assert.ok(entry.weight > 0, biome + ': ' + entry.type + ' has a weight');
  }
});

test('an applied pack REPLACES a biome table, and reverting restores the baked one', () => {
  // The mechanism the whole feature rests on, at the level the spawner reads.
  resetTagRegistry();
  resetPackBiomeSpawns();
  const before = biomeSpawnsFor('flower_forest', MobCategory.CREATURE).map(e => e.type);
  assert.ok(before.length > 0);

  const store = createPackStore();
  const built = buildPresetPack('lush_havens');
  addPack(store, { name: built.name, files: built.files, source: PACK_SOURCES.PRESET, format: 61 });
  const applied = applyStore(store);
  try {
    const after = biomeSpawnsFor('flower_forest', MobCategory.CREATURE);
    assert.ok(after.length > before.length, 'flower_forest went ' + before.length + ' -> ' + after.length);
    assert.equal(packBiomeSpawnSource('flower_forest'), 'Lush Havens', 'and is attributed to the pack');
    assert.notDeepEqual(after.map(e => e.type), before, 'a different cast, not just more of the same');
  } finally {
    revertAll(applied);
    resetTagRegistry();
    resetPackBiomeSpawns();
  }
  assert.deepEqual(biomeSpawnsFor('flower_forest', MobCategory.CREATURE).map(e => e.type), before,
    'and reverting restores the baked table exactly');
});


test('the report tells a player about mobs on the canopy by reporting the height they are at', () => {
  // The report cannot say "they are on leaves" directly -- it does not walk the world -- but it does report
  // the loaded mobs and the light and caps, which is what narrows it down. This pins the mob list appearing.
  const r = buildMobStatsReport(input({
    mobs: [{ type: 'cow', category: 'creature', position: { x: 5, y: 40, z: 5 } }],
    player: { x: 0, y: 28, z: 0 },
  }));
  assert.match(text(r), /cow\s+1/);
  assert.match(text(r), /WITHIN 48 BLOCKS: 1/);
});
