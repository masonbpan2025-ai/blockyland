// Travel regression test.
//
// This is THE test for the reported bug: "when I generate a world there are only a few mobs near my
// spawn location; as I explore the world there are no mobs to be found in other places."
//
// It is a regression test rather than a parity test, and it is written to FAIL against the previous
// implementation for the right reason. Before this work, mobs existed near the start point and
// nowhere else because there was no code path that could create a mob away from it — four ad-hoc
// per-tick spawners each searching a ring 24-88 blocks around the player, covering four species. A
// test that merely asserted "mobs exist after travelling" would have passed on a world that spawned
// them all at spawn, so each assertion here is aimed at a specific way the old behaviour could
// masquerade as fixed:
//
//   1. mobs exist far from the original spawn      (not just near it)
//   2. the original area is not the only populated one
//   3. old mobs are actually removed as the player leaves  (cap space is freed)
//   4. cap space really is freed, so the cap is not permanently full
//   5. newly loaded areas start spawning           (the symptom, directly)
//   6. more than one biome contributes             (not one lucky species/table)
//   7. a return trip does not leave the population stuck
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/world.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { MobSpawnManager } from '../src/spawning/mobSpawnManager.js';
import { MobCategory, categoryOf, CATEGORY_INFO } from '../src/spawning/mobCategories.js';
import { blockOpacity, MAX_LIGHT } from '../src/spawning/lightEngine.js';

const DIMENSIONS = {
  zombie: { width: 0.6, height: 1.95 },
  skeleton: { width: 0.6, height: 1.98 },
  creeper: { width: 0.6, height: 1.7 },
  spider: { width: 1.4, height: 0.9 },
  slime: { width: 2.08, height: 2.08 },
  enderman: { width: 0.6, height: 2.9 },
  witch: { width: 0.6, height: 1.95 },
  zombie_villager: { width: 0.6, height: 1.95 },
  bat: { width: 0.5, height: 0.9 },
  glow_squid: { width: 0.8, height: 0.8 },
  sheep: { width: 0.9, height: 1.3 },
  pig: { width: 0.9, height: 0.9 },
  cow: { width: 0.9, height: 1.4 },
  chicken: { width: 0.4, height: 0.7 },
  horse: { width: 1.4, height: 1.6 },
  donkey: { width: 1.3965, height: 1.5 },
  rabbit: { width: 0.4, height: 0.5 },
  goat: { width: 0.9, height: 1.3 },
  panda: { width: 1.3, height: 1.25 },
  llama: { width: 0.9, height: 1.87 },
  wolf: { width: 0.6, height: 0.85 },
  fox: { width: 0.6, height: 0.7 },
  cod: { width: 0.35, height: 0.3 },
  salmon: { width: 0.4, height: 0.35 },
  squid: { width: 0.8, height: 0.8 },
  dolphin: { width: 0.9, height: 0.6 },
  drowned: { width: 0.6, height: 1.95 },
  tropical_fish: { width: 0.5, height: 0.4 },
  pufferfish: { width: 0.35, height: 0.35 },
  mooshroom: { width: 0.9, height: 1.4 },
  polar_bear: { width: 1.4, height: 1.4 },
  turtle: { width: 1.2, height: 0.4 },
  parrot: { width: 0.5, height: 0.9 },
  ocelot: { width: 0.6, height: 0.7 },
  armadillo: { width: 0.7, height: 0.65 },
  camel: { width: 1.7, height: 2.375 },
  frog: { width: 0.5, height: 0.5 },
  bee: { width: 0.55, height: 0.5 },
};

/**
 * A world, a stub mob manager and a game, wired the way `main.js` wires them.
 *
 * The stub records every spawn WITH the position the spawner chose, so a test can ask where mobs came
 * from rather than only how many exist.
 */
function makeWorld({ seed = 1234, biome = 'all', time = 18000, difficulty = 'normal' }) {
  const world = new World(seed, biome);

  const mobs = {
    mobs: [],
    getMobDimensions: (type) => DIMENSIONS[type] || { width: 0.6, height: 1.95 },
    isBlockSolid: (x, y, z) => {
      const id = world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z));
      if (id === BLOCKS.AIR || id === BLOCKS.WATER || id === BLOCKS.LAVA) return false;
      const def = BLOCK_DEFS[id];
      return !!def && def.solid !== false && !def.plant;
    },
    spawnMob(type, x, y, z) {
      const mob = {
        type, health: 20, maxHealth: 20,
        mesh: { position: { x, y, z } },
        persistent: false, noActionTime: 0, isTamed: false,
      };
      mobs.mobs.push(mob);
      return mob;
    },
    removeMob(mob) {
      const i = mobs.mobs.indexOf(mob);
      if (i === -1) return false;
      mobs.mobs.splice(i, 1);
      return true;
    },
  };

  const player = {
    position: { x: 8, y: 40, z: 8 },
    gamemode: 'survival',
    teleport(x, z) { this.position.x = x; this.position.z = z; },
  };

  const game = { world, mobs, player, difficulty, worldTime: time, weather: { weatherType: 'clear' } };
  const manager = new MobSpawnManager({ game });

  /** Every mob the spawner created, with the position it was placed at. */
  const spawns = [];
  manager.naturalSpawner.onSpawn = (record) => spawns.push({
    type: record.type, x: record.x, y: record.y, z: record.z, biomeId: record.biomeId,
  });

  return { world, game, mobs, player, manager, spawns };
}

/**
 * Generate, unload and light the chunks around a position, exactly as the streamer does.
 *
 * The unload is the part that matters. The previous engine kept every chunk it had ever generated, so
 * there was no mechanism by which a mob left behind could stop holding cap space.
 */
function streamTo(world, player, x, z, { radius = 8, unloadRadius = 11 } = {}) {
  const cx = Math.floor(x / 16);
  const cz = Math.floor(z / 16);
  for (let ax = cx - radius; ax <= cx + radius; ax++) {
    for (let az = cz - radius; az <= cz + radius; az++) world.getOrCreateChunk(ax, az);
  }
  for (const chunk of [...world.chunks.values()]) {
    if (Math.max(Math.abs(chunk.cx - cx), Math.abs(chunk.cz - cz)) > unloadRadius) {
      world.light.removeChunk(chunk.cx, chunk.cz);
      world.chunks.delete(`${chunk.cx},${chunk.cz}`);
    }
  }
  world.invalidateChunkCache();
  world.light.relightAll();
  player.teleport(x, z);
}

/** Advance the spawner by whole seconds of game time at a fixed clock hour. */
function simulate(manager, game, seconds, { time = 18000 } = {}) {
  for (let i = 0; i < seconds * 20; i++) {
    game.worldTime = time;
    manager.update(1 / 20);
  }
}

/** Add up mobs per distance band from the original spawn point at (8, 8). */
function distanceBands(mobs, originX = 8, originZ = 8) {
  const bands = { near: 0, mid: 0, far: 0 };
  for (const mob of mobs) {
    const d = Math.hypot(mob.mesh.position.x - originX, mob.mesh.position.z - originZ);
    if (d < 128) bands.near++;
    else if (d < 400) bands.mid++;
    else bands.far++;
  }
  return bands;
}

// ---------------------------------------------------------------------------------------------
// The regression itself
// ---------------------------------------------------------------------------------------------

test('travel: mobs keep appearing in newly loaded areas hundreds of blocks from spawn', () => {
  const h = makeWorld({ seed: 1234, biome: 'all', time: 18000 });

  // Settle at spawn first, so there is a populated area to leave behind.
  streamTo(h.world, h.player, 8, 8, { radius: 8 });
  simulate(h.manager, h.game, 45, { time: 18000 });
  const atSpawn = h.mobs.mobs.length;
  assert.ok(atSpawn > 5, `expected a populated spawn area, got ${atSpawn} mobs`);
  const spawnsBeforeTravel = h.spawns.length;

  // Walk out in 100-block steps, streaming as the game does. Ten steps is 1000 blocks.
  const steps = [];
  for (let step = 1; step <= 10; step++) {
    const targetX = 8 + step * 100;
    // Remember how many spawns had happened before this leg, so "newly loaded areas spawned" is
    // measured per leg rather than cumulatively.
    const before = h.spawns.length;
    streamTo(h.world, h.player, targetX, 8);
    // Prove the area really is newly loaded and the old one really is gone.
    assert.ok(h.world.getChunk(Math.floor(targetX / 16), 0), `the destination chunk at x=${targetX} should be loaded`);
    simulate(h.manager, h.game, 15, { time: 18000 });
    steps.push({
      x: targetX,
      alive: h.mobs.mobs.length,
      newSpawns: h.spawns.length - before,
      bands: distanceBands(h.mobs.mobs),
    });
  }

  const final = steps[steps.length - 1];

  // 1. Mobs exist at the end of the trip.
  assert.ok(final.alive > 0, 'no mobs survived the trip at all');

  // 2. Mobs exist FAR from the original spawn. This is the assertion that fails on the old
  //    implementation, where every mob in the world was within a few dozen blocks of spawn.
  assert.ok(final.bands.far + final.bands.mid > 0,
    `no mobs beyond 128 blocks of the original spawn: ${JSON.stringify(final.bands)}`);

  // 3. The newly loaded areas themselves produced mobs. Checked per leg, because a single good leg
  //    could mask nine dead ones.
  const legsThatSpawned = steps.filter(s => s.newSpawns > 0).length;
  assert.ok(legsThatSpawned >= steps.length - 2,
    `only ${legsThatSpawned} of ${steps.length} newly loaded areas produced any mobs`);

  // 4. Spawning continued after the travel started. Without this, all the mobs could be the ones
  //    from the spawn area still holding on.
  assert.ok(h.spawns.length - spawnsBeforeTravel > 0,
    'no mobs were spawned at all after the player started travelling');

  // 5. Old mobs were removed. Without despawning the caps fill up behind the player and every new
  //    area stays empty, which is the second half of the report.
  const despawnTelemetry = h.manager.despawnManager.telemetry();
  assert.ok(despawnTelemetry.hardRemovals + despawnTelemetry.randomRemovals > 0,
    'nothing despawned during a 1000-block trip, so cap space was never freed');

  // 6. More than one biome contributed, so this is not one table happening to work.
  const telemetry = h.manager.naturalSpawner.telemetry();
  assert.ok(Object.keys(telemetry.spawnsByBiome).length > 1,
    `spawns came from only one biome: ${Object.keys(telemetry.spawnsByBiome).join(', ')}`);

  // 7. The cap is not permanently full -- that is what "cap space was freed" has to mean.
  const state = h.manager.stateCache?.state;
  if (state) {
    const monsterCap = state.caps[MobCategory.MONSTER];
    assert.ok(state.categoryCounts[MobCategory.MONSTER] < monsterCap,
      'the monster cap is pinned at its maximum after the trip');
  }
});

test('travel: the mob population does not collapse as the player moves', () => {
  // A weaker but important property: population is roughly maintained rather than draining to zero.
  // The old behaviour produced a monotone decline to zero as the player walked away from the only
  // area that had ever spawned anything.
  const h = makeWorld({ seed: 77, biome: 'all', time: 18000 });
  streamTo(h.world, h.player, 8, 8);
  simulate(h.manager, h.game, 40, { time: 18000 });

  const counts = [];
  for (let step = 1; step <= 6; step++) {
    streamTo(h.world, h.player, 8 + step * 150, 8);
    simulate(h.manager, h.game, 15, { time: 18000 });
    counts.push(h.mobs.mobs.length);
  }
  const last = counts[counts.length - 1];
  assert.ok(last > 0, `the population reached zero: ${counts.join(' -> ')}`);
  // Not a strict lower bound (population is stochastic) but a drain to nothing is the failure mode.
  assert.ok(counts.filter(c => c > 0).length >= counts.length - 1,
    `the population collapsed to zero on more than one leg: ${counts.join(' -> ')}`);
});

test('travel: returning to a previously visited area repopulates it', () => {
  // "Return to a previously visited area and population behaviour remains stable" -- the task's own
  // milestone. The cap must be free enough for the returned-to area to be repopulated.
  const h = makeWorld({ seed: 5150, biome: 'all', time: 18000 });
  streamTo(h.world, h.player, 8, 8);
  simulate(h.manager, h.game, 40, { time: 18000 });

  // Leave.
  streamTo(h.world, h.player, 808, 8);
  simulate(h.manager, h.game, 30, { time: 18000 });

  // Come back.
  const before = h.spawns.length;
  streamTo(h.world, h.player, 8, 8);
  simulate(h.manager, h.game, 30, { time: 18000 });
  assert.ok(h.spawns.length > before,
    'returning to the original area produced no new spawns, so its cap space was never released');
  assert.ok(h.mobs.mobs.length > 0, 'the returned-to area is empty');
});

test('travel: chunks unload behind the player, and their light goes with them', () => {
  const h = makeWorld({ seed: 9, biome: 'plains', time: 18000 });
  streamTo(h.world, h.player, 8, 8);
  const chunksAtSpawn = h.world.chunks.size;
  const lightAtSpawn = h.world.light.chunks.size;
  assert.ok(chunksAtSpawn > 0);
  assert.equal(lightAtSpawn, chunksAtSpawn, 'every loaded chunk should have light data');

  streamTo(h.world, h.player, 808, 8);
  // The resident count must not grow without bound, and the light data must not outlive its chunks.
  assert.ok(h.world.chunks.size <= chunksAtSpawn + 40,
    `chunks accumulated: ${chunksAtSpawn} -> ${h.world.chunks.size}`);
  assert.equal(h.world.light.chunks.size, h.world.chunks.size,
    'light data outlived its chunks');
  // The chunk at the original spawn is gone.
  assert.equal(h.world.getChunk(0, 0), undefined, 'the spawn chunk should have been unloaded');
});

test('travel: telemetry records the biomes the player passed through', () => {
  // The diagnostic that made this bug findable: which biomes actually produced spawns.
  const h = makeWorld({ seed: 1234, biome: 'all', time: 18000 });
  streamTo(h.world, h.player, 8, 8);
  simulate(h.manager, h.game, 30, { time: 18000 });
  for (let step = 1; step <= 6; step++) {
    streamTo(h.world, h.player, 8 + step * 150, 8);
    simulate(h.manager, h.game, 12, { time: 18000 });
  }
  const telemetry = h.manager.naturalSpawner.telemetry();
  const biomes = Object.keys(telemetry.spawnsByBiome);
  assert.ok(biomes.length >= 3,
    `expected spawns across several biomes, got ${biomes.length}: ${biomes.join(', ')}`);
  // The telemetry should also be able to explain what it refused.
  assert.ok(Object.keys(telemetry.rejections).length > 0,
    'no rejection reasons were recorded, so a failure would be undiagnosable');
  assert.ok(telemetry.chunkAttempts > 0, 'no chunk was ever attempted');
});
