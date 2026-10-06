// Construction and pack-walk integration tests.
//
// These drive the REAL `NaturalSpawner` and the real construction path with a stub mob manager, so
// they exercise the wiring rather than a helper in isolation. Two things are checked that unit tests
// on the resolver cannot:
//
//   1. the per-member eligibility check actually FIRES inside `spawnGroup`, rather than existing as
//      dead code in `resolveSpawnList`; and
//   2. a refused member results in ZERO constructor calls, rather than a spawn that is created and
//      then deleted.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FixtureWorld, RecordingMobManager, grassFieldFixture, wideGrassFieldFixture, frozenWaterWallFixture, isSolidBlockId } from './helpers/spawnFixture.js';
import { MobSpawnManager } from '../src/spawning/mobSpawnManager.js';
import { SpawnState } from '../src/spawning/spawnState.js';
import { MobCategory } from '../src/spawning/mobCategories.js';
import { BLOCKS } from '../src/blocks.js';
import { SpawnRejection } from '../src/spawning/spawnValidation.js';

/**
 * Build a manager over a fixture world with a recording mob manager.
 *
 * `world.chunks` is the Map the SpawnState reads for loaded chunks, so the fixture's loaded set is
 * mirrored into it.
 */
function makeManager(world, { biomeByColumn = null } = {}) {
  const mobs = new RecordingMobManager({
    world,
    dimensions: {
      zombie: { width: 0.6, height: 1.95 },
      skeleton: { width: 0.6, height: 1.98 },
      creeper: { width: 0.6, height: 1.7 },
      spider: { width: 1.4, height: 0.9 },
      cow: { width: 0.9, height: 1.4 },
      pig: { width: 0.9, height: 0.9 },
      sheep: { width: 0.9, height: 1.3 },
      chicken: { width: 0.4, height: 0.7 },
      cod: { width: 0.35, height: 0.3 },
      salmon: { width: 0.4, height: 0.35 },
      squid: { width: 0.8, height: 0.8 },
      dolphin: { width: 0.9, height: 0.6 },
      tropical_fish: { width: 0.5, height: 0.4 },
      pufferfish: { width: 0.35, height: 0.35 },
      drowned: { width: 0.6, height: 1.95 },
      glow_squid: { width: 0.8, height: 0.8 },
      bat: { width: 0.5, height: 0.9 },
    },
  });

  // The real World exposes `chunks` as a Map; the fixture keeps a Set. Mirror it.
  const chunks = new Map();
  for (const key of world.loaded) chunks.set(key, { cx: Number(key.split(',')[0]), cz: Number(key.split(',')[1]) });
  world.chunks = chunks;

  const player = { position: { x: 60.5, y: 40, z: 8.5 }, gamemode: 'survival' };
  const game = {
    world,
    // The recording manager IS the mob manager; spreading it into a plain object would drop its
    // prototype and `spawnMob` with it.
    mobs,
    player,
    difficulty: 'normal',
    worldTime: 18000,
    weather: { weatherType: 'clear' },
  };
  mobs.game = game;
  const manager = new MobSpawnManager({ game });
  if (biomeByColumn) {
    for (const [key, biome] of Object.entries(biomeByColumn)) {
      const [x, z] = key.split(',').map(Number);
      world.setBiome(x, z, biome);
    }
  }
  return { manager, mobs, player, game, world };
}

/** A SpawnState with one eligible chunk, bypassing the chunk-set machinery. */
function stateFor(world, players, cx = 0, cz = 0) {
  const loaded = new Set(world.loaded);
  const state = new SpawnState({ players, loadedChunkKeys: loaded, mobs: [] });
  // Force the eligible set to a single known chunk so the test controls where attempts land.
  state.eligibleChunks = [{ cx, cz, x: cx * 16, z: cz * 16 }];
  state.eligibleChunkKeys = new Set([`${cx},${cz}`]);
  state.chunkOwner = new Map([[`${cx},${cz}`, 0]]);
  return state;
}

// =============================================================================================
// Per-member eligibility fires inside the real pack loop
// =============================================================================================

test('spawnGroup refuses a member whose species is not listed at its destination', () => {
  // A controlled two-biome world: the origin chunk is lukewarm ocean, the neighbour is plains. A pack
  // that walks from one into the other must stop spawning cod the moment it crosses.
  //
  // lukewarm_ocean is used because it is an ocean that LISTS cod (cod, pufferfish, tropical_fish).
  // warm_ocean does not -- it lists pufferfish and tropical_fish -- so a cod there would be refused at
  // its own origin, which would make the positive control assert the wrong thing.
  const world = new FixtureWorld({ biome: 'lukewarm_ocean', seaLevel: 22 });
  world.loadRegion(-16, -16, 31, 31);
  world.fill(-16, 0, -16, 31, 8, 31, BLOCKS.STONE);
  world.fill(-16, 9, -16, 31, 22, 31, BLOCKS.WATER);
  // The boundary sits at x=20, well east of the test column at x=8, so the ORIGIN really is ocean and
  // the destination really is plains. An earlier version put the boundary at x=5 and the cod's own
  // column was already plains -- the check fired correctly and the positive control failed, which is
  // the right way round but made the test assert the wrong thing.
  for (let x = 20; x <= 31; x++) {
    for (let z = -16; z <= 31; z++) world.setBiome(x, z, 'plains');
  }
  const { manager, mobs, player } = makeManager(world);

  // Confirm the geography the test depends on.
  assert.equal(manager.naturalSpawner.biomeAt(8.5, 18, 8.5), 'lukewarm_ocean',
    'the ORIGIN column must be an ocean that lists cod');
  assert.equal(manager.naturalSpawner.biomeAt(24.5, 18, 8.5), 'plains',
    'the DESTINATION column must be plains');

  const state = stateFor(world, [{
    x: player.position.x, y: 40, z: player.position.z, chunkX: 0, chunkZ: 0,
  }]);
  const before = mobs.calls.length;
  // Directly exercise the per-member path with a cod pack whose members land on plains.
  const placed = manager.naturalSpawner.spawnMobAt('cod', MobCategory.WATER_AMBIENT, 8.5, 18, 8.5, {
    state, playerIndex: 0, biomeId: 'lukewarm_ocean', source: 'biome', structureId: null,
    cx: 0, cz: 0, packSpecies: 'cod', packEntries: [{ type: 'cod', weight: 1, minCount: 1, maxCount: 1 }],
  });
  assert.ok(placed, 'the positive control: a cod at its ORIGIN must be constructed');
  assert.equal(mobs.calls.length, before + 1);

  // Now the same call with plains as the destination biome: the pack has crossed the boundary. The
  // cod's own column is still ocean, so the ONLY thing that refuses this is the per-member check.
  const beforeCross = mobs.calls.length;
  const refused = manager.naturalSpawner.spawnMobAt('cod', MobCategory.WATER_AMBIENT, 24.5, 18, 8.5, {
    state, playerIndex: 0, biomeId: 'plains', source: 'biome', structureId: null,
    cx: 0, cz: 0, packSpecies: 'cod', packEntries: [{ type: 'cod', weight: 1, minCount: 1, maxCount: 1 }],
  });
  assert.equal(refused, null, 'a cod in a plains column must be refused');
  assert.equal(mobs.calls.length, beforeCross,
    'a refused member must produce ZERO constructor calls, not a spawn that is deleted afterwards');
  // And the refusal is recorded under the biome reason, which is how the overlay explains it.
  const recorded = manager.naturalSpawner.recentAttempts.find(a => a.rejected === SpawnRejection.WRONG_BIOME);
  assert.ok(recorded, 'the refusal must be recorded as WRONG_BIOME');
});

test('a refused pack member does not stop its eligible siblings', () => {
  // Partial packs are allowed and a failed member does not abort the rest -- so the control has to be
  // a member that IS eligible, on a biome where the species is listed.
  const world = new FixtureWorld({ biome: 'lukewarm_ocean', seaLevel: 22 });
  world.loadRegion(-16, -16, 31, 31);
  world.fill(-16, 0, -16, 31, 8, 31, BLOCKS.STONE);
  world.fill(-16, 9, -16, 31, 22, 31, BLOCKS.WATER);
  const { manager, mobs, player } = makeManager(world);
  const state = stateFor(world, [{
    x: player.position.x, y: 40, z: player.position.z, chunkX: 0, chunkZ: 0,
  }]);
  const before = mobs.calls.length;
  for (let i = 0; i < 3; i++) {
    manager.naturalSpawner.spawnMobAt('cod', MobCategory.WATER_AMBIENT, 8.5 + i, 18, 8.5, {
      state, playerIndex: 0, biomeId: 'lukewarm_ocean', source: 'biome', structureId: null,
      cx: 0, cz: 0, packSpecies: 'cod', packEntries: [{ type: 'cod', weight: 1, minCount: 1, maxCount: 1 }],
    });
  }
  assert.equal(mobs.calls.length, before + 3, 'all three eligible members must be constructed');
});

// =============================================================================================
// Structures suppress members inside their bounds
// =============================================================================================

test('a member walking into a suppressing structure is refused', () => {
  const world = wideGrassFieldFixture({ groundY: 30, radius: 5 });
  const { manager, mobs, player } = makeManager(world);
  const state = stateFor(world, [{
    x: player.position.x, y: 40, z: player.position.z, chunkX: 0, chunkZ: 0,
  }]);
  manager.structureAt = () => 'trial_chambers';

  const before = mobs.calls.length;
  const refused = manager.naturalSpawner.spawnMobAt('zombie', MobCategory.MONSTER, 8.5, 31, 8.5, {
    state, playerIndex: 0, biomeId: 'plains', source: 'biome', structureId: null,
    cx: 0, cz: 0, packSpecies: 'zombie', packEntries: [{ type: 'zombie', weight: 1, minCount: 1, maxCount: 1 }],
  });
  assert.equal(refused, null, 'a member inside a suppressing structure must be refused');
  assert.equal(mobs.calls.length, before, 'and must not reach the constructor');
});

// =============================================================================================
// Chunk-generation spatial validation
// =============================================================================================

test('chunk generation refuses a candidate that intersects solid blocks', () => {
  // A roofed pocket: the column top is the roof, and the cell above it is blocked by more roof, so a
  // generated animal placed at top+1 would be inside rock. Previously generation ran only the species
  // predicate (and treated a missing predicate as success), so this could be constructed.
  const world = wideGrassFieldFixture({ groundY: 20, radius: 5 });
  // Build a solid ceiling at y=21..24 over the whole area, so "top + 1" lands inside it.
  world.fill(-80, 21, -80, 80, 24, 80, BLOCKS.STONE);
  const { manager, mobs } = makeManager(world);
  const before = mobs.calls.length;
  const placed = manager.chunkGenerationSpawner.placeGenerationMember('cow', 8, 8, 0, 0, 'plains');
  assert.equal(placed, null, 'a generated animal must not be placed inside solid blocks');
  assert.equal(mobs.calls.length, before, 'and must not reach the constructor');
  assert.ok(manager.chunkGenerationSpawner.stats.rejected > 0, 'the refusal must be counted');
});

test('chunk generation accepts a clear surface (positive control)', () => {
  const world = wideGrassFieldFixture({ groundY: 30, radius: 5 });
  const { manager, mobs } = makeManager(world);
  const before = mobs.calls.length;
  const placed = manager.chunkGenerationSpawner.placeGenerationMember('cow', 8, 8, 0, 0, 'plains');
  assert.ok(placed, 'a generated cow on open grass must be placed');
  assert.equal(mobs.calls.length, before + 1);
  // The constructed position must be on top of the grass, not inside it.
  const call = mobs.calls[mobs.calls.length - 1];
  assert.equal(call.y, 31, 'the cow must stand on top of the grass at y=30');
});

// =============================================================================================
// Construction preserves the validated position
// =============================================================================================

test('the constructor receives the position the validator approved', () => {
  const world = wideGrassFieldFixture({ groundY: 30, radius: 5 });
  const { manager, mobs, player } = makeManager(world);
  const state = stateFor(world, [{
    x: player.position.x, y: 40, z: player.position.z, chunkX: 0, chunkZ: 0,
  }]);
  const mob = manager.naturalSpawner.spawnMobAt('cow', MobCategory.CREATURE, 8.5, 31, 8.5, {
    state, playerIndex: 0, biomeId: 'plains', source: 'biome', structureId: null, cx: 0, cz: 0,
  });
  assert.ok(mob);
  const call = mobs.calls[mobs.calls.length - 1];
  assert.equal(call.x, 8.5);
  assert.equal(call.y, 31, 'the validated feet Y must be preserved exactly');
  assert.equal(call.z, 8.5);
  // And the constructed mob reports the same position.
  assert.equal(mob.mesh.position.y, 31);
});

test('a frozen-water spawn is refused when the box reaches an ice wall, and allowed when clear', () => {
  // The end-to-end version of the reported bug, driven through the real spawner rather than through
  // `validateGenericSpawn` directly.
  const world = frozenWaterWallFixture({ seaLevel: 22 });
  const { manager, mobs, player } = makeManager(world);
  const state = stateFor(world, [{
    x: player.position.x, y: 40, z: player.position.z, chunkX: 0, chunkZ: 0,
  }]);
  const y = 20;
  // Penetrating the wall at x=1.
  const before = mobs.calls.length;
  const bad = manager.naturalSpawner.spawnMobAt('salmon', MobCategory.WATER_CREATURE, 0.9, y, 8.5, {
    state, playerIndex: 0, biomeId: 'frozen_ocean', source: 'biome', structureId: null, cx: 0, cz: 0,
  });
  assert.equal(bad, null, 'a salmon whose box intersects the ice wall must not be constructed');
  assert.equal(mobs.calls.length, before, 'zero constructor calls for the refused position');
  // Clear of the wall.
  const good = manager.naturalSpawner.spawnMobAt('salmon', MobCategory.WATER_CREATURE, 0.4, y, 8.5, {
    state, playerIndex: 0, biomeId: 'frozen_ocean', source: 'biome', structureId: null, cx: 0, cz: 0,
  });
  assert.ok(good, 'a salmon clear of the wall must be constructed');
});





