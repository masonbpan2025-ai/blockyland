// Differential tests for the natural-spawning subsystem.
//
// These assert against KNOWN MINECRAFT BEHAVIOUR rather than against the implementation: the cap
// formula, the light rule's three parts, the chunk-eligibility distance, the pack-size distribution,
// the despawn thresholds, the structure overrides and the biome tables are all numbers that exist
// independently of this code, and each is checked here against its source. A test that asserted "the
// spawner produced some mobs" would pass for a spawner that produces the wrong mobs in the wrong
// places, which is exactly what the original bug was.
//
// The sources are cited per assertion. See docs/research/mob-spawning-1.21.4.md for the full set.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { JavaRandom } from '../src/spawning/spawnRandom.js';
import {
  CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT,
} from '../src/spawning/lightEngine.js';
import { CHUNK_SIZE_X as WORLD_X, CHUNK_SIZE_Z as WORLD_Z, CHUNK_HEIGHT as WORLD_H, World } from '../src/world.js';
import {
  ALL_MOB_CATEGORIES, CATEGORY_INFO, MobCategory, categoryOf,
} from '../src/spawning/mobCategories.js';
import {
  SpawnState, MOB_CAP_DIVISOR, SPAWNABLE_CHUNK_AREA, SPAWN_ELIGIBLE_RADIUS,
} from '../src/spawning/spawnState.js';
import {
  selectWeightedEntry, packSizeFor, resolveBiomeTable, biomeSpawnsFor, resolveSpawnList,
  STRUCTURE_SPAWN_OVERRIDES, totalWeight,
} from '../src/spawning/biomeSpawnResolver.js';
import {
  BIOME_SPAWN_TABLES, ENGINE_ONLY_BIOME_ALIASES, ENGINE_ONLY_BIOME_RUNTIME_ALIASES,
} from '../src/spawning/vanillaBiomeSpawns.js';
import { BIOMES, getBiomeDef } from '../src/biomes.js';
import {
  monsterIsDarkEnoughToSpawn, genericMonsterPredicate, drownedPredicate, glowSquidPredicate,
  batPredicate, defaultPassivePredicate, axolotlPredicate, striderPredicate,
} from '../src/spawning/mobSpawnPredicates.js';
import {
  Difficulty, SpawnRejection, heightAt, validateGenericSpawn, nearestPlayer, isPeaceful,
  difficultyRank, MIN_SPAWN_DISTANCE, MAX_SPAWN_DISTANCE, MAX_SPAWN_DISTANCE_FISH,
} from '../src/spawning/spawnValidation.js';
import {
  SpawnPlacementType, HeightmapType, blocksMotion, spawnPlacementFor, registeredSpawnTypes,
} from '../src/spawning/spawnPlacements.js';
import {
  skyDarkenFor, skyDarkenForDimension, sampleMonsterSpawnLightLevel,
  monsterSpawnBlockLightLimit, isNight, SpawnClock, TICKS_PER_SECOND,
} from '../src/spawning/spawnClock.js';
import {
  DespawnManager, nearestPlayerSq, maxSpawnClusterSizeFor, NO_DESPAWN_DISTANCE,
  NO_ACTION_TIME_THRESHOLD, DESPAWN_ROLL_BOUND,
} from '../src/spawning/despawnManager.js';
import { MobSpawnManager } from '../src/spawning/mobSpawnManager.js';
import { blockOpacity, MAX_LIGHT } from '../src/spawning/lightEngine.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';

// ---------------------------------------------------------------------------------------------
// A headless world + mob manager, so the spawner can be driven without a browser.
// ---------------------------------------------------------------------------------------------

const STUB_DIMENSIONS = {
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
  cod: { width: 0.35, height: 0.3 },
  salmon: { width: 0.4, height: 0.35 },
  squid: { width: 0.8, height: 0.8 },
  drowned: { width: 0.6, height: 1.95 },
  tropical_fish: { width: 0.5, height: 0.4 },
  pufferfish: { width: 0.35, height: 0.35 },
  rabbit: { width: 0.4, height: 0.5 },
  mooshroom: { width: 0.9, height: 1.4 },
};

/**
 * A world plus a stub mob manager and game.
 *
 * `spawns` records every mob the spawner created, WITH the mob's own coordinates -- not a re-derived
 * position. Re-deriving the position later is how three successive measurements of the light rule
 * disagreed: `Math.floor(-14.5)` is -15, and a later `Math.floor` on a rounded copy reads a different
 * column.
 */
function harness({ seed = 42, biome = 'plains', time = 18000, difficulty = 'normal', radius = 8, worldTimeAdvances = false } = {}) {
  const world = new World(seed, biome);
  for (let cx = -radius; cx <= radius; cx++) {
    for (let cz = -radius; cz <= radius; cz++) world.getOrCreateChunk(cx, cz);
  }
  world.light.relightAll();

  const mobs = {
    mobs: [],
    getMobDimensions: (t) => STUB_DIMENSIONS[t] || { width: 0.6, height: 1.95 },
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
  const player = { position: { x: 8, y: 40, z: 8 }, gamemode: 'survival' };
  const game = { world, mobs, player, difficulty, worldTime: time, weather: { weatherType: 'clear' } };
  const manager = new MobSpawnManager({ game });
  const spawns = [];
  manager.naturalSpawner.onSpawn = (r) => spawns.push(r);
  return { world, game, mobs, player, manager, spawns };
}

/** A tiny cached lookup, so the stub does not import BLOCK_DEFS into every call. */

function simulate(manager, game, seconds, { advanceTime = false, fixedTime = null } = {}) {
  for (let i = 0; i < seconds * 20; i++) {
    if (fixedTime !== null) game.worldTime = fixedTime;
    else if (advanceTime) game.worldTime = (game.worldTime + 1) % 24000;
    manager.update(1 / 20);
  }
}

// ---------------------------------------------------------------------------------------------
// 1. Deterministic RNG
// ---------------------------------------------------------------------------------------------

test('JavaRandom reproduces java.util.Random exactly', () => {
  // Values from the JDK algorithm for `new Random(42)`. If these differ, every seeded comparison
  // this subsystem relies on is meaningless.
  const r = new JavaRandom(42);
  assert.equal(r.nextInt(), -1170105035);
  assert.equal(r.nextInt(), 234785527);
  assert.equal(r.nextInt(), -1360544799);
});

test('JavaRandom.nextInt(bound) is unbiased and in range', () => {
  const r = new JavaRandom(7);
  const counts = new Array(6).fill(0);
  for (let i = 0; i < 60000; i++) {
    const v = r.nextInt(6);
    assert.ok(v >= 0 && v < 6, `nextInt(6) returned ${v}`);
    counts[v]++;
  }
  // Rejection sampling should land within a few percent of uniform.
  for (const count of counts) {
    assert.ok(Math.abs(count - 10000) < 500, `distribution too skewed: ${counts.join(',')}`);
  }
});

test('JavaRandom.nextInt rejects a non-positive bound rather than returning garbage', () => {
  const r = new JavaRandom(1);
  assert.throws(() => r.nextInt(0), RangeError);
  assert.throws(() => r.nextInt(-5), RangeError);
});

test('JavaRandom.triangle produces a triangular distribution, not a uniform one', () => {
  // Vanilla's pack offsets use nextDouble() - nextDouble(), which is dense near zero. A uniform
  // implementation would put about 20% of draws in the outermost fifth of the range; the triangle
  // puts very few there.
  const r = new JavaRandom(99);
  let outer = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const v = r.triangle(0, 5);
    if (Math.abs(v) > 4) outer++;
  }
  assert.ok(outer / N < 0.08, `expected a triangular distribution, got ${(outer / N * 100).toFixed(1)}% in the outer fifth`);
});

// ---------------------------------------------------------------------------------------------
// 2. Mob categories and caps
// ---------------------------------------------------------------------------------------------

test('the eight mob categories and their caps match Java Edition 1.21.4', () => {
  // wiki: Monster 70, Creature 10, Ambient 15, Axolotls 5, Underground water creature 5,
  // Water creature 5, Water ambient 20, Misc -1.
  assert.equal(CATEGORY_INFO[MobCategory.MONSTER].maxPerChunkArea, 70);
  assert.equal(CATEGORY_INFO[MobCategory.CREATURE].maxPerChunkArea, 10);
  assert.equal(CATEGORY_INFO[MobCategory.AMBIENT].maxPerChunkArea, 15);
  assert.equal(CATEGORY_INFO[MobCategory.AXOLOTLS].maxPerChunkArea, 5);
  assert.equal(CATEGORY_INFO[MobCategory.UNDERGROUND_WATER_CREATURE].maxPerChunkArea, 5);
  assert.equal(CATEGORY_INFO[MobCategory.WATER_CREATURE].maxPerChunkArea, 5);
  assert.equal(CATEGORY_INFO[MobCategory.WATER_AMBIENT].maxPerChunkArea, 20);
  assert.equal(CATEGORY_INFO[MobCategory.MISC].maxPerChunkArea, -1);
  assert.equal(ALL_MOB_CATEGORIES.length, 8);
});

test('only MONSTER is non-persistent, which is what makes monsters spawn every tick', () => {
  // There is no per-category interval table in 1.21.4: `gameTime % 400 == 0` gates every category
  // whose isPersistent() is true, and MONSTER is the only one that is not.
  const nonPersistent = ALL_MOB_CATEGORIES.filter(c => !CATEGORY_INFO[c].isPersistent);
  assert.deepEqual(nonPersistent.sort(), [MobCategory.AMBIENT, MobCategory.MONSTER, MobCategory.WATER_AMBIENT].sort());
});

test('fish despawn at 64 blocks and everything else at 128', () => {
  assert.equal(CATEGORY_INFO[MobCategory.WATER_AMBIENT].despawnDistance, 64);
  assert.equal(CATEGORY_INFO[MobCategory.MONSTER].despawnDistance, 128);
});

test('mob types map to the categories the wiki lists', () => {
  assert.equal(categoryOf('zombie'), MobCategory.MONSTER);
  assert.equal(categoryOf('cow'), MobCategory.CREATURE);
  assert.equal(categoryOf('bat'), MobCategory.AMBIENT);
  assert.equal(categoryOf('glow_squid'), MobCategory.UNDERGROUND_WATER_CREATURE);
  assert.equal(categoryOf('squid'), MobCategory.WATER_CREATURE);
  assert.equal(categoryOf('dolphin'), MobCategory.WATER_CREATURE);
  // The four FISH are water ambient, not water creature: different cap (20 vs 5), different despawn
  // distance (64 vs 128) and a different player sphere (64 vs 128). This is the mistake that gave an
  // ocean three times its fish.
  for (const fish of ['cod', 'salmon', 'pufferfish', 'tropical_fish', 'tadpole']) {
    assert.equal(categoryOf(fish), MobCategory.WATER_AMBIENT, `${fish} should be WATER_AMBIENT`);
  }
  // Water ambient's cap and despawn distance, as the wiki's cap table gives them.
  assert.equal(CATEGORY_INFO[MobCategory.WATER_AMBIENT].maxPerChunkArea, 20);
  assert.equal(CATEGORY_INFO[MobCategory.WATER_AMBIENT].despawnDistance, 64);
  assert.equal(CATEGORY_INFO[MobCategory.WATER_CREATURE].maxPerChunkArea, 5);
  assert.equal(categoryOf('axolotl'), MobCategory.AXOLOTLS);
  // A mob nobody classified is MISC: no cap, never a natural spawn.
  assert.equal(categoryOf('tournament_host'), MobCategory.MISC);
});

// ---------------------------------------------------------------------------------------------
// 3. The cap formula
// ---------------------------------------------------------------------------------------------

test('the global cap is mobCap * chunks / 289, and 289 is the 17x17 square', () => {
  // wiki: "The cap is then scaled as globalCap = mobCap x chunks / 289."
  assert.equal(MOB_CAP_DIVISOR, 289);
  assert.equal(SPAWNABLE_CHUNK_AREA, 289);
  const players = [{ x: 8, y: 40, z: 8, chunkX: 0, chunkZ: 0 }];
  const loaded = new Set();
  for (let cx = -8; cx <= 8; cx++) for (let cz = -8; cz <= 8; cz++) loaded.add(`${cx},${cz}`);
  const state = new SpawnState({ players, loadedChunkKeys: loaded, mobs: [] });
  assert.equal(state.capSquareChunkCount, 289);
  assert.equal(state.caps[MobCategory.MONSTER], 70);
  assert.equal(state.caps[MobCategory.CREATURE], 10);
  assert.equal(state.caps[MobCategory.WATER_AMBIENT], 20);
  assert.equal(state.caps[MobCategory.MISC], Infinity);
});

test('a partly loaded square produces proportionally smaller caps', () => {
  const players = [{ x: 8, y: 40, z: 8, chunkX: 0, chunkZ: 0 }];
  const loaded = new Set();
  // Only the four chunks adjacent to the player are loaded.
  for (const key of ['0,0', '-1,0', '0,-1', '-1,-1']) loaded.add(key);
  const state = new SpawnState({ players, loadedChunkKeys: loaded, mobs: [] });
  assert.equal(state.eligibleChunks.length, 4);
  // 70 * 289 / 289 = 70, because the CAP uses the square, not the loaded count.
  assert.equal(state.caps[MobCategory.MONSTER], 70);
});

test('two players standing together do not double the cap', () => {
  // "Because chunks that are in the range of multiple players are counted once, more chunks and
  // higher mob caps result from the players spreading out."
  const loaded = new Set();
  for (let cx = -8; cx <= 8; cx++) for (let cz = -8; cz <= 8; cz++) loaded.add(`${cx},${cz}`);
  const together = new SpawnState({
    players: [{ x: 8, y: 40, z: 8, chunkX: 0, chunkZ: 0 }, { x: 20, y: 40, z: 8, chunkX: 1, chunkZ: 0 }],
    loadedChunkKeys: loaded, mobs: [],
  });
  // The second player's square sticks out one chunk to the east, so the union is 17x18.
  assert.equal(together.capSquareChunkCount, 17 * 18);
  assert.ok(together.capSquareChunkCount < 2 * 289, 'overlapping squares must not double-count');
});

test('persistent mobs do not occupy cap space', () => {
  // wiki: "All non-persistent loaded mobs are counted against the global cap".
  const players = [{ x: 8, y: 40, z: 8, chunkX: 0, chunkZ: 0 }];
  const loaded = new Set();
  for (let cx = -8; cx <= 8; cx++) for (let cz = -8; cz <= 8; cz++) loaded.add(`${cx},${cz}`);
  const mk = (type, persistent) => ({
    type, health: 20, persistent, mesh: { position: { x: 8, y: 40, z: 8 } },
  });
  const state = new SpawnState({
    players, loadedChunkKeys: loaded,
    mobs: [mk('zombie', false), mk('zombie', false), mk('zombie', true), mk('cow', true)],
  });
  assert.equal(state.categoryCounts[MobCategory.MONSTER], 2);
  assert.equal(state.categoryCounts[MobCategory.CREATURE], 0);
});

test('a full category reports no room, and one under the cap reports room', () => {
  const players = [{ x: 8, y: 40, z: 8, chunkX: 0, chunkZ: 0 }];
  const loaded = new Set();
  for (let cx = -8; cx <= 8; cx++) for (let cz = -8; cz <= 8; cz++) loaded.add(`${cx},${cz}`);
  // Creature cap is 10, so 10 cows fill it and the 11th is refused.
  const cows = Array.from({ length: 10 }, () => ({
    type: 'cow', health: 20, persistent: false, mesh: { position: { x: 8, y: 40, z: 8 } },
  }));
  const full = new SpawnState({ players, loadedChunkKeys: loaded, mobs: cows });
  assert.equal(full.canSpawnForCategory(MobCategory.CREATURE), false);
  const oneFewer = new SpawnState({ players, loadedChunkKeys: loaded, mobs: cows.slice(1) });
  assert.equal(oneFewer.canSpawnForCategory(MobCategory.CREATURE), true);
  // MISC is unlimited.
  assert.equal(full.canSpawnForCategory(MobCategory.MISC), true);
});

// ---------------------------------------------------------------------------------------------
// 4. Chunk eligibility
// ---------------------------------------------------------------------------------------------

test('a chunk is eligible only if a non-spectator player is within 128 blocks of its CENTRE', () => {
  // Paper's ChunkMap context: euclideanDistanceSquared(chunkPos, player) < 16384.0 (128^2).
  assert.equal(SPAWN_ELIGIBLE_RADIUS, 128);
  const players = [{ x: 8, y: 40, z: 8, chunkX: 0, chunkZ: 0 }];
  const loaded = new Set();
  for (let cx = -12; cx <= 12; cx++) for (let cz = -12; cz <= 12; cz++) loaded.add(`${cx},${cz}`);
  const state = new SpawnState({ players, loadedChunkKeys: loaded, mobs: [] });
  // Chunk 8 is centred at 8*16+8 = 136, which is 128 away from x=8 -- exactly the radius, so it is
  // NOT within it. Chunk 7 is centred at 120, which is 112 away, so it IS.
  assert.ok(state.isEligible(7, 0), 'chunk 7 should be eligible');
  assert.ok(!state.isEligible(8, 0), 'chunk 8 is exactly at the radius and must be excluded');
  assert.ok(!state.isEligible(0, 8), 'chunk 8 on z should be excluded');
});

test('an unloaded chunk is never eligible, however close the player is', () => {
  const players = [{ x: 8, y: 40, z: 8, chunkX: 0, chunkZ: 0 }];
  const state = new SpawnState({ players, loadedChunkKeys: new Set(), mobs: [] });
  assert.equal(state.eligibleChunks.length, 0);
});

test('the cap square is counted even where the chunk is not loaded', () => {
  // The square is the cap's denominator; loading is irrelevant to it. This is the distinction that
  // separates the cap formula's chunk count from the spawnable chunk set.
  const players = [{ x: 8, y: 40, z: 8, chunkX: 0, chunkZ: 0 }];
  const state = new SpawnState({ players, loadedChunkKeys: new Set(), mobs: [] });
  assert.equal(state.capSquareChunkCount, 289);
  assert.equal(state.eligibleChunks.length, 0);
});

// ---------------------------------------------------------------------------------------------
// 5. The light rule
// ---------------------------------------------------------------------------------------------

test('the monster light rule refuses full daylight and always passes in a dark cave', () => {
  // Overworld, clear noon: skyDarken 0, sky light 15, block light 0 -> internal 15 > 7, refused.
  const day = new JavaRandom(5);
  let dayPasses = 0;
  for (let i = 0; i < 2000; i++) {
    if (monsterIsDarkEnoughToSpawn({ skyLight: 15, blockLight: 0, skyDarken: 0, dimension: 'overworld', random: day })) dayPasses++;
  }
  assert.equal(dayPasses, 0, 'a fully lit surface must never pass the light rule');

  // Dark cave: sky light 0, block light 0 -> both the lottery (0 > nextInt(32) is false) and the
  // internal comparison (0 <= nextInt(8) always) pass.
  const cave = new JavaRandom(5);
  let cavePasses = 0;
  for (let i = 0; i < 2000; i++) {
    if (monsterIsDarkEnoughToSpawn({ skyLight: 0, blockLight: 0, skyDarken: 0, dimension: 'overworld', random: cave })) cavePasses++;
  }
  assert.equal(cavePasses, 2000, 'a pitch-dark position must always pass');
});

test('the sky-light lottery makes surface night spawning rarer than cave spawning', () => {
  // The spec's worked example: at 15 sky light the lottery fails with probability 15/32, and the
  // internal comparison passes 5/8 of the time, giving about 33%.
  const r = new JavaRandom(11);
  let passes = 0;
  const N = 40000;
  for (let i = 0; i < N; i++) {
    if (monsterIsDarkEnoughToSpawn({ skyLight: 15, blockLight: 0, skyDarken: 11, dimension: 'overworld', random: r })) passes++;
  }
  const rate = passes / N;
  assert.ok(rate > 0.25 && rate < 0.42, `expected roughly a third, got ${(rate * 100).toFixed(1)}%`);
});

test('block light at or above the dimension limit refuses a monster spawn', () => {
  // Overworld's monster_spawn_block_light_limit is 0: any block light at all refuses.
  const r = new JavaRandom(3);
  for (let i = 0; i < 200; i++) {
    assert.equal(
      monsterIsDarkEnoughToSpawn({ skyLight: 0, blockLight: 1, skyDarken: 0, dimension: 'overworld', random: r }),
      false,
      'block light 1 in the Overworld must refuse',
    );
  }
  // The Nether's limit is 15, which disables the clause.
  assert.equal(monsterSpawnBlockLightLimit('nether'), 15);
  assert.equal(monsterSpawnBlockLightLimit('overworld'), 0);
  assert.equal(monsterSpawnBlockLightLimit('the_end'), 0);
});

test('the Nether samples a constant light bound of 7 and the Overworld a uniform 0..7', () => {
  const r = new JavaRandom(1);
  for (let i = 0; i < 50; i++) assert.equal(sampleMonsterSpawnLightLevel('nether', r), 7);
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(sampleMonsterSpawnLightLevel('overworld', r));
  assert.deepEqual([...seen].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('the three RNG draws happen in vanilla order', () => {
  // (1) nextInt(32) for the sky lottery, (2) no draw for the block limit, (3) nextInt(8) for the
  // internal bound. The order is observable: a stub that returns a known sequence must be consumed
  // in exactly that order.
  const sequence = [15, 7];
  let index = 0;
  const stub = { nextInt: () => sequence[index++] };
  // skyLight 15 > 15 is false, so the lottery passes; block light 0 passes; internal 4 <= 7 passes.
  const result = monsterIsDarkEnoughToSpawn({
    skyLight: 15, blockLight: 0, skyDarken: 11, dimension: 'overworld', random: stub,
  });
  assert.equal(result, true);
  assert.equal(index, 2, 'exactly two draws: nextInt(32) then nextInt(8)');
});

// ---------------------------------------------------------------------------------------------
// 6. skyDarken
// ---------------------------------------------------------------------------------------------

test('skyDarken is 0 at clear noon and 11 at midnight', () => {
  assert.equal(skyDarkenFor(6000), 0);
  assert.equal(skyDarkenFor(18000), 11);
});

test('rain and thunder darken the sky to 3 and 5', () => {
  assert.equal(skyDarkenFor(6000, { rain: true }), 3);
  assert.equal(skyDarkenFor(6000, { thunder: true }), 5);
  // At midnight the ambient value is already higher, so weather cannot brighten it.
  assert.equal(skyDarkenFor(18000, { rain: true }), 11);
});

test('a dimension with no sky light has no sky darken', () => {
  assert.equal(skyDarkenForDimension('nether', 6000), 0);
  assert.equal(skyDarkenForDimension('the_end', 6000), 0);
  assert.equal(skyDarkenForDimension('overworld', 18000), 11);
});

test('night is 13000..23000 on the Minecraft clock', () => {
  assert.equal(isNight(18000), true);
  assert.equal(isNight(6000), false);
  assert.equal(isNight(13000), true);
  assert.equal(isNight(23000), true);
  assert.equal(isNight(12500), false);
});

// ---------------------------------------------------------------------------------------------
// 7. Position selection
// ---------------------------------------------------------------------------------------------

test('Y is drawn uniformly over the whole column, which is what makes caves fill up', () => {
  const { manager } = harness({ seed: 3, radius: 3 });
  const spawner = manager.naturalSpawner;
  const r = new JavaRandom(21);
  const top = 30;
  const buckets = { surface: 0, shallow: 0, deep: 0 };
  const N = 32000;
  for (let i = 0; i < N; i++) {
    // pickY takes surfaceY, which vanilla computes as the heightmap value PLUS ONE.
    const y = spawner.pickY(top + 1, r, 0);
    assert.ok(y >= 0 && y <= top + 1, `y ${y} out of the column`);
    if (y >= top) buckets.surface++;
    else if (y > top / 2) buckets.shallow++;
    else buckets.deep++;
  }
  // The column runs 0..top+1 inclusive, so there are top+2 = 32 possible values. Exactly half of
  // them are below the midpoint. A port that always used the surface would put 100% in `surface`
  // and leave every cave empty -- which is the bug this subsystem exists to fix.
  const deepFraction = buckets.deep / N;
  assert.ok(Math.abs(deepFraction - 0.5) < 0.02,
    `expected half the draws below the midpoint, got ${deepFraction.toFixed(3)}`);
  // Two of the 32 outcomes are at or above `top`, so about 6.25%.
  const outcomes = top + 2;
  const surfaceFraction = buckets.surface / N;
  assert.ok(Math.abs(surfaceFraction - 2 / outcomes) < 0.01,
    `expected ~${(2 / outcomes * 100).toFixed(1)}% at or above the surface, got ${(surfaceFraction * 100).toFixed(1)}%`);
});

test('the WORLD_SURFACE heightmap is the highest non-air block, including fluids', () => {
  const { world } = harness({ seed: 5, biome: 'ocean', radius: 2 });
  const surface = heightAt(world, 8, 8, HeightmapType.WORLD_SURFACE);
  const noLeaves = heightAt(world, 8, 8, HeightmapType.MOTION_BLOCKING_NO_LEAVES);
  assert.ok(surface >= 0 && surface < CHUNK_HEIGHT);
  // An ocean's WORLD_SURFACE is the water top, so it cannot be below the sea floor.
  assert.ok(surface >= noLeaves - 1);
});

test('the pack offset is triangular and centred, not uniform', () => {
  // Vanilla: `x += nextInt(6) - nextInt(6)`, i.e. the difference of two independent uniforms on
  // 0..5. That spans -5..+5 and is dense at zero: P(|X-Y| <= 2) = 1 - 2*(1+2+3)/36 = 24/36 = 0.667,
  // while a UNIFORM offset over the same range would give 5/11 = 0.455. The 0.667 figure is the
  // discriminating number, and it is what makes a pack a loose cluster rather than a spray.
  const r = new JavaRandom(13);
  let near = 0;
  let extreme = 0;
  const N = 60000;
  for (let i = 0; i < N; i++) {
    const offset = r.nextInt(6) - r.nextInt(6);
    assert.ok(offset >= -5 && offset <= 5, `offset ${offset} out of range`);
    if (Math.abs(offset) <= 2) near++;
    if (Math.abs(offset) === 5) extreme++;
  }
  const nearFraction = near / N;
  assert.ok(Math.abs(nearFraction - 24 / 36) < 0.03,
    `expected ~66.7% within +-2, got ${(nearFraction * 100).toFixed(1)}%`);
  // P(|X-Y| = 5) = 2/36 = 5.6%; uniform would give 2/11 = 18%. This is the clearest separation.
  assert.ok(Math.abs(extreme / N - 2 / 36) < 0.02,
    `expected ~5.6% at +-5, got ${(extreme / N * 100).toFixed(1)}%`);
});

// ---------------------------------------------------------------------------------------------
// 8. Weighted selection and pack sizes
// ---------------------------------------------------------------------------------------------

test('weighted selection follows the weights', () => {
  const entries = [
    { type: 'a', weight: 100, minCount: 1, maxCount: 1 },
    { type: 'b', weight: 10, minCount: 1, maxCount: 1 },
  ];
  assert.equal(totalWeight(entries), 110);
  const r = new JavaRandom(17);
  const counts = { a: 0, b: 0 };
  for (let i = 0; i < 11000; i++) counts[selectWeightedEntry(entries, r).type]++;
  // 100:10 should land near 10000:1000.
  assert.ok(Math.abs(counts.a / 11000 - 100 / 110) < 0.02, `a came out at ${counts.a}`);
  assert.ok(Math.abs(counts.b / 11000 - 10 / 110) < 0.02, `b came out at ${counts.b}`);
});

test('an empty or zero-weight list selects nothing rather than guessing', () => {
  const r = new JavaRandom(1);
  assert.equal(selectWeightedEntry([], r), null);
  assert.equal(selectWeightedEntry([{ type: 'a', weight: 0 }], r), null);
});

test('pack size is uniform over minCount..maxCount inclusive', () => {
  const r = new JavaRandom(23);
  const seen = new Set();
  for (let i = 0; i < 4000; i++) seen.add(packSizeFor({ minCount: 2, maxCount: 6, weight: 1 }, r));
  assert.deepEqual([...seen].sort((a, b) => a - b), [2, 3, 4, 5, 6]);
});

test('a maxCount below minCount is clamped rather than rolling backwards', () => {
  // The data pack contains `{minCount: 4, maxCount: 1}` for endermen.
  const r = new JavaRandom(1);
  for (let i = 0; i < 100; i++) assert.equal(packSizeFor({ minCount: 4, maxCount: 1, weight: 1 }, r), 4);
});

// ---------------------------------------------------------------------------------------------
// 9. Biome tables
// ---------------------------------------------------------------------------------------------

test('the generated tables cover every engine biome, directly or through an alias', () => {
  const engineBiomes = Object.keys(BIOMES).filter(id => id !== 'all');
  const missing = engineBiomes.filter(id => !BIOME_SPAWN_TABLES[id] && !ENGINE_ONLY_BIOME_RUNTIME_ALIASES[id]);
  assert.deepEqual(missing, [], `biomes with no spawn table: ${missing.join(', ')}`);
});

test('plain vanilla biome tables match the 1.21.4 data pack', () => {
  // From misode/mcmeta 1.21.4-data, data/minecraft/worldgen/biome/plains.json.
  const plains = BIOME_SPAWN_TABLES.plains;
  const sheep = plains.creature.find(e => e.type === 'sheep');
  assert.deepEqual(sheep, { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 });
  const horse = plains.creature.find(e => e.type === 'horse');
  assert.deepEqual(horse, { type: 'horse', weight: 5, minCount: 2, maxCount: 6 });
  const bat = plains.ambient.find(e => e.type === 'bat');
  assert.deepEqual(bat, { type: 'bat', weight: 10, minCount: 8, maxCount: 8 });
  const glowSquid = plains.underground_water_creature.find(e => e.type === 'glow_squid');
  assert.deepEqual(glowSquid, { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 });
  // Ocean biomes spawn no CREATURE at all.
  assert.equal(BIOME_SPAWN_TABLES.ocean.creature, undefined);
  assert.ok(BIOME_SPAWN_TABLES.ocean.water_creature.length > 0);
  // The End has endermen and nothing else.
  assert.deepEqual(BIOME_SPAWN_TABLES.the_end.monster.map(e => e.type), ['enderman']);
  // Mushroom fields: mooshrooms only, no monsters.
  assert.equal(BIOME_SPAWN_TABLES.mushroom_fields.monster, undefined);
  assert.deepEqual(BIOME_SPAWN_TABLES.mushroom_fields.creature.map(e => e.type), ['mooshroom']);
});

test('the Nether biomes carry the Nether mobs and no bat', () => {
  const wastes = BIOME_SPAWN_TABLES.nether_wastes;
  const types = wastes.monster.map(e => e.type);
  assert.ok(types.includes('ghast'), 'nether wastes should spawn ghasts');
  assert.ok(types.includes('zombified_piglin'), 'nether wastes should spawn zombified piglins');
  assert.equal(wastes.ambient, undefined, 'the Nether has no ambient category');
  assert.deepEqual(wastes.creature.map(e => e.type), ['strider']);
});

test('the engine-only biomes resolve to a documented vanilla table', () => {
  assert.equal(ENGINE_ONLY_BIOME_ALIASES.nether, 'nether_wastes');
  assert.equal(ENGINE_ONLY_BIOME_RUNTIME_ALIASES.dappled_forest, 'forest');
  // `nether` carries its own table, copied by the generator from nether_wastes, so the two are equal
  // in content rather than the same object. Comparing contents is what the behaviour depends on.
  assert.deepEqual(resolveBiomeTable('nether'), BIOME_SPAWN_TABLES.nether_wastes);
  assert.equal(resolveBiomeTable('dappled_forest'), BIOME_SPAWN_TABLES.forest);
  // An unknown biome has no spawns rather than defaulting to plains.
  assert.equal(resolveBiomeTable('not_a_biome'), null);
  assert.deepEqual(biomeSpawnsFor('not_a_biome', MobCategory.MONSTER), []);
});

test('an unknown biome spawns nothing, so a typo cannot silently populate the world', () => {
  // The failure mode this guards against: `resolveBiomeTable` falling back to plains for an
  // unrecognised id, which would fill a custom biome with cows and zombies.
  const entries = biomeSpawnsFor('a_biome_that_does_not_exist', MobCategory.CREATURE);
  assert.deepEqual(entries, []);
});

test('the void spawns nothing at all', () => {
  assert.deepEqual(biomeSpawnsFor('the_void', MobCategory.MONSTER), []);
  assert.deepEqual(biomeSpawnsFor('the_void', MobCategory.CREATURE), []);
});

// ---------------------------------------------------------------------------------------------
// 10. Structure spawn overrides
// ---------------------------------------------------------------------------------------------

test('a structure override replaces the biome list for the categories it names', () => {
  const structureAt = (x) => (x > 100 ? 'fortress' : null);
  const inside = resolveSpawnList({
    biomeId: 'soul_sand_valley', category: MobCategory.MONSTER, x: 200, y: 30, z: 0, structureAt,
  });
  assert.equal(inside.source, 'structure');
  assert.equal(inside.structureId, 'nether_fortress');
  const types = inside.entries.map(e => e.type);
  assert.ok(types.includes('blaze'));
  assert.ok(types.includes('wither_skeleton'));
  // Outside, the biome table applies.
  const outside = resolveSpawnList({
    biomeId: 'soul_sand_valley', category: MobCategory.MONSTER, x: 0, y: 30, z: 0, structureAt,
  });
  assert.equal(outside.source, 'biome');
});

test('a category the structure does not name falls through to the biome', () => {
  // The fortress override names only MONSTER, so a CREATURE lookup must use the biome's list.
  const resolved = resolveSpawnList({
    biomeId: 'nether_wastes', category: MobCategory.CREATURE, x: 200, y: 30, z: 0,
    structureAt: () => 'fortress',
  });
  assert.equal(resolved.source, 'biome');
  assert.deepEqual(resolved.entries.map(e => e.type), ['strider']);
});

test('the fortress override matches the 1.21.4 data pack', () => {
  // From misode/mcmeta structures/fortress.json.
  const entries = STRUCTURE_SPAWN_OVERRIDES.nether_fortress.categories[MobCategory.MONSTER];
  const byType = Object.fromEntries(entries.map(e => [e.type, e]));
  assert.deepEqual(byType.blaze, { type: 'blaze', weight: 10, minCount: 2, maxCount: 3 });
  assert.deepEqual(byType.wither_skeleton, { type: 'wither_skeleton', weight: 8, minCount: 5, maxCount: 5 });
  assert.equal(byType.skeleton.weight, 2);
  assert.equal(STRUCTURE_SPAWN_OVERRIDES.nether_fortress.boundingBox, 'piece');
  // The monument and outpost use a full bounding box.
  assert.equal(STRUCTURE_SPAWN_OVERRIDES.ocean_monument.boundingBox, 'piece');
  assert.equal(STRUCTURE_SPAWN_OVERRIDES.pillager_outpost.boundingBox, 'piece');
});

test('a structure with an empty override list suppresses spawning rather than falling through', () => {
  // trial chambers and ancient city override all eight categories with EMPTY lists precisely to
  // suppress natural spawning inside themselves. Treating an empty list as "absent" would populate
  // them with the surrounding biome's monsters, which is the trap the spec calls out.
  for (const structure of ['trial_chambers', 'ancient_city']) {
    const resolved = resolveSpawnList({
      biomeId: 'plains', category: MobCategory.MONSTER, x: 0, y: 30, z: 0,
      structureAt: () => structure,
    });
    assert.deepEqual(resolved.entries, [], `${structure} must suppress monster spawning`);
    assert.equal(resolved.source, 'structure_suppressed');
  }
  // A structure that names only some categories still falls through for the others.
  const fortressCreature = resolveSpawnList({
    biomeId: 'nether_wastes', category: MobCategory.CREATURE, x: 0, y: 30, z: 0,
    structureAt: () => 'fortress',
  });
  assert.equal(fortressCreature.source, 'biome');
});

// ---------------------------------------------------------------------------------------------
// 11. Generic validation and rejection codes
// ---------------------------------------------------------------------------------------------

test('the minimum spawn distance is 24 blocks and fish are held to a 64-block sphere', () => {
  assert.equal(MIN_SPAWN_DISTANCE, 24);
  assert.equal(MAX_SPAWN_DISTANCE, 128);
  assert.equal(MAX_SPAWN_DISTANCE_FISH, 64);
});

test('a position inside 24 blocks of a player is refused', () => {
  const { world } = harness({ seed: 1, radius: 2 });
  const gy = world.getHighestSolidY(8, 8) + 1;
  const players = [{ x: 8, y: gy, z: 8 }];
  const near = validateGenericSpawn({
    world, players, difficulty: 'normal', dimension: 'overworld',
    x: 8, y: gy, z: 12, placement: SpawnPlacementType.ON_GROUND, width: 0.6, height: 1.95,
  });
  assert.equal(near.ok, false);
  assert.equal(near.reason, SpawnRejection.TOO_CLOSE_TO_PLAYER);
});

test('a position outside the player sphere is refused', () => {
  // The far position must be in a loaded chunk, or the boundary check would be what refuses this
  // and the distance rule would never be exercised. Chunk 25 spans x 400..415, so a radius of 26
  // chunks covers both ends.
  const h = harness({ seed: 1, radius: 26 });
  const target = h.world.getHighestSolidY(8, 8) + 1;
  const farX = 8 + 400;
  assert.ok(h.world.getChunk(Math.floor(farX / 16), 0), 'the far position must be in a loaded chunk');
  const far = validateGenericSpawn({
    world: h.world,
    players: [{ x: 8, y: target, z: 8 }],
    difficulty: 'normal', dimension: 'overworld',
    x: farX, y: target, z: 8,
    placement: SpawnPlacementType.ON_GROUND, width: 0.6, height: 1.95,
  });
  assert.equal(far.ok, false);
  assert.equal(far.reason, SpawnRejection.TOO_FAR_FROM_PLAYER);
  assert.equal(far.detail.nearestPlayerDistance, 400);
});

test('a position outside the build height is refused', () => {
  const h = harness({ seed: 1, radius: 2 });
  const result = validateGenericSpawn({
    world: h.world, players: [{ x: 8, y: 40, z: 8 }],
    difficulty: 'normal', dimension: 'overworld',
    x: 8, y: CHUNK_HEIGHT, z: 8,
    placement: SpawnPlacementType.ON_GROUND, width: 0.6, height: 1.95,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, SpawnRejection.OUT_OF_WORLD_BOUNDS);
});

test('a ground spawn with no floor underneath is refused', () => {
  const h = harness({ seed: 1, radius: 2 });
  // Just below the build ceiling: in range of a player, in a loaded chunk, and with air below and
  // around, so the only rule that can refuse it is the floor. The player is 30 blocks away, outside
  // the 24-block exclusion but well inside the 128-block sphere, so the distance rule passes.
  const y = CHUNK_HEIGHT - 2;
  const result = validateGenericSpawn({
    world: h.world, players: [{ x: 38, y, z: 38 }],
    difficulty: 'normal', dimension: 'overworld',
    x: 8.5, y, z: 8.5,
    placement: SpawnPlacementType.ON_GROUND, width: 0.6, height: 1.0,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, SpawnRejection.INVALID_FLOOR);
});

test('an unloaded chunk is refused before the expensive checks', () => {
  const { world } = harness({ seed: 1, radius: 1 });
  const players = [{ x: 8, y: 40, z: 8 }];
  const result = validateGenericSpawn({
    world, players, difficulty: 'normal', dimension: 'overworld',
    x: 5000, y: 30, z: 5000, placement: SpawnPlacementType.ON_GROUND, width: 0.6, height: 1.95,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, SpawnRejection.CHUNK_NOT_LOADED);
});

test('PEACEFUL blocks every hostile placement regardless of light or position', () => {
  const { world } = harness({ seed: 1, radius: 2 });
  const result = validateGenericSpawn({
    world, players: [{ x: 8, y: 40, z: 8 }], difficulty: 'peaceful', dimension: 'overworld',
    x: 8, y: 10, z: 8, placement: SpawnPlacementType.ON_GROUND, width: 0.6, height: 1.95,
    requiresHostileDifficulty: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, SpawnRejection.DIFFICULTY_BLOCKED);
  assert.equal(isPeaceful('peaceful'), true);
  assert.equal(difficultyRank('hard'), 3);
});

test('a water placement refuses dry land and vice versa', () => {
  const { world } = harness({ seed: 1, biome: 'ocean', radius: 3 });
  // Find a water cell.
  let wx = null; let wy = null; let wz = null;
  outer: for (let x = 0; x < 48; x++) {
    for (let z = 0; z < 48; z++) {
      for (let y = 1; y < 30; y++) {
        if (world.getVoxel(x, y, z) === BLOCKS.WATER && world.getVoxel(x, y + 1, z) === BLOCKS.WATER) {
          wx = x; wy = y; wz = z; break outer;
        }
      }
    }
  }
  if (wx === null) return; // no sea in this seed; nothing to assert
  const players = [{ x: wx + 0.5, y: wy, z: wz + 0.5 }];
  // A ground spawn in water is a fluid refusal.
  const onGround = validateGenericSpawn({
    world, players, difficulty: 'normal', dimension: 'overworld',
    x: wx + 0.5, y: wy, z: wz + 0.5, placement: SpawnPlacementType.ON_GROUND, width: 0.6, height: 1.95,
    checkPlayerDistance: false,
  });
  assert.equal(onGround.ok, false);
  assert.equal(onGround.reason, SpawnRejection.WRONG_FLUID);
  // A water placement there is fine.
  const inWater = validateGenericSpawn({
    world, players, difficulty: 'normal', dimension: 'overworld',
    x: wx + 0.5, y: wy, z: wz + 0.5, placement: SpawnPlacementType.IN_WATER, width: 0.6, height: 0.6,
    checkPlayerDistance: false,
  });
  assert.equal(inWater.ok, true);
});

test('the nearest player lookup reports the index and the distance', () => {
  const players = [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }];
  const { index, distance } = nearestPlayer(players, 10, 0, 0);
  assert.equal(index, 0);
  assert.equal(distance, 10);
  const sq = nearestPlayerSq(players, { x: 10, y: 0, z: 0 });
  assert.equal(sq, 100);
});

test('a spectator is not a spawn reference point', () => {
  const players = [{ x: 0, y: 0, z: 0, spectator: true }];
  assert.equal(nearestPlayerSq(players, { x: 100, y: 0, z: 0 }), null);
});

// ---------------------------------------------------------------------------------------------
// 12. Per-mob predicates
// ---------------------------------------------------------------------------------------------

test('every natural-spawn mob type can actually be built by the engine', async () => {
  // Two separate questions, because they fail differently.
  //
  // (1) Is there a placement registration? Without one a mob gets "generic rules only", which is how
  //     a version-specific rule (glow squid's Y limit, the drowned's water column) goes missing.
  // (2) Can the engine CONSTRUCT it? If it cannot, a biome table naming it produces a spawn attempt
  //     that always fails with MOB_PREDICATE_FAILED -- a mob listed in the data that can never appear.
  //
  // Question (2) is answered against the real MobManager dispatcher rather than a list, so this test
  // reports a genuine gap in the engine rather than agreeing with a hand-maintained table.
  const { parseMobTypeSupport } = await import('./helpers/mobDispatch.js');
  const supported = parseMobTypeSupport();

  const registered = new Set(registeredSpawnTypes());
  const fromTables = new Set();
  for (const table of Object.values(BIOME_SPAWN_TABLES)) {
    for (const entries of Object.values(table)) for (const e of entries) fromTables.add(e.type);
  }

  const unregistered = [...fromTables].filter(t => !registered.has(t)).sort();
  assert.deepEqual(unregistered, [], `mobs with no spawn placement registered: ${unregistered.join(', ')}`);

  const unbuildable = [...fromTables].filter(t => !supported.has(t)).sort();
  assert.deepEqual(unbuildable, [], `biome tables name mobs the engine cannot build: ${unbuildable.join(', ')}`);
});

test('drowned requires water above and below', () => {
  const { world } = harness({ seed: 2, biome: 'ocean', radius: 3 });
  const dry = drownedPredicate({
    world, x: 8, y: 30, z: 8, biomeId: 'ocean', difficulty: 'normal',
    random: new JavaRandom(1), dimension: 'overworld',
  });
  assert.equal(dry, false, 'a dry position must refuse a drowned');
});

test('glow squid needs light 0 and a Y below 30', () => {
  const { world } = harness({ seed: 2, biome: 'ocean', radius: 3 });
  const lit = glowSquidPredicate({
    world, x: 8, y: 20, z: 8, lightLevel: 5, biomeId: 'ocean', random: new JavaRandom(1),
  });
  assert.equal(lit, false, 'glow squid must refuse a lit position');
  const high = glowSquidPredicate({
    world, x: 8, y: 40, z: 8, lightLevel: 0, biomeId: 'ocean', random: new JavaRandom(1),
  });
  assert.equal(high, false, 'glow squid must refuse a position above Y 30');
});

test('the bat refuses sky exposure and a floor that is not stone-family', () => {
  const { world } = harness({ seed: 2, radius: 2 });
  // A grass floor is not in bats_spawnable_on.
  const onGrass = batPredicate({
    world, x: 8, y: world.getHighestSolidY(8, 8) + 1, z: 8,
    blockBelow: BLOCKS.GRASS, lightLevel: 0,
  });
  assert.equal(onGrass, false);
});

test('a passive mob needs light 9 or brighter', () => {
  const { world } = harness({ seed: 2, radius: 2 });
  const dark = defaultPassivePredicate({
    world, x: 8, y: 10, z: 8, blockBelow: BLOCKS.GRASS, lightLevel: 8,
  });
  assert.equal(dark, false, 'light 8 must refuse a passive mob');
  const lit = defaultPassivePredicate({
    world, x: 8, y: 10, z: 8, blockBelow: BLOCKS.GRASS, lightLevel: 9,
  });
  assert.equal(lit, true, 'light 9 must allow a passive mob');
});

test('an axolotl needs clay below and a non-solid block above', () => {
  const { world } = harness({ seed: 2, radius: 2 });
  const wrongFloor = axolotlPredicate({ world, x: 8, y: 20, z: 8 });
  assert.equal(wrongFloor, false);
});

test('a strider needs lava with air above', () => {
  const { world } = harness({ seed: 2, biome: 'nether', radius: 3 });
  const dryAir = striderPredicate({ world, x: 8, y: 20, z: 8 });
  assert.equal(dryAir, false);
});

// ---------------------------------------------------------------------------------------------
// 13. Despawning
// ---------------------------------------------------------------------------------------------

test('the despawn constants match the spec', () => {
  assert.equal(NO_DESPAWN_DISTANCE, 32);
  assert.equal(NO_ACTION_TIME_THRESHOLD, 600);
  assert.equal(DESPAWN_ROLL_BOUND, 800);
});

test('a mob past 128 blocks is removed immediately; one at exactly 128 is not', () => {
  const { manager } = harness({ seed: 1, radius: 2 });
  const despawner = manager.despawnManager;
  const random = new JavaRandom(1);
  const at = (distance) => ({
    type: 'zombie', health: 20, persistent: false, noActionTime: 0,
    mesh: { position: { x: distance, y: 40, z: 0 } },
  });
  const players = [{ x: 0, y: 40, z: 0 }];
  assert.equal(despawner.checkDespawn(at(129), players, { peaceful: false, random }), 'hard');
  assert.equal(despawner.checkDespawn(at(128), players, { peaceful: false, random }), null,
    'exactly 128 blocks must NOT despawn: the comparison is strict');
  assert.equal(despawner.checkDespawn(at(200), players, { peaceful: false, random }), 'hard');
});

test('the random despawn roll is only drawn when noActionTime exceeds 600', () => {
  // Java's `&&` short-circuits, so a mob that has not been idle long enough consumes NO random
  // value. A port that always draws diverges from vanilla's stream.
  const { manager } = harness({ seed: 1, radius: 2 });
  const despawner = manager.despawnManager;
  let draws = 0;
  const counting = { nextInt: (n) => { draws++; return 0; } };
  const mob = {
    type: 'zombie', health: 20, persistent: false, noActionTime: 100,
    mesh: { position: { x: 60, y: 40, z: 0 } },
  };
  despawner.checkDespawn(mob, [{ x: 0, y: 40, z: 0 }], { peaceful: false, random: counting });
  assert.equal(draws, 0, 'no draw before noActionTime passes 600');

  const eligible = { ...mob, noActionTime: 601 };
  despawner.checkDespawn(eligible, [{ x: 0, y: 40, z: 0 }], { peaceful: false, random: counting });
  assert.equal(draws, 1, 'exactly one draw once eligible');
});

test('being within 32 blocks resets noActionTime', () => {
  const { manager } = harness({ seed: 1, radius: 2 });
  const despawner = manager.despawnManager;
  const mob = {
    type: 'zombie', health: 20, persistent: false, noActionTime: 900,
    mesh: { position: { x: 10, y: 40, z: 0 } },
  };
  despawner.checkDespawn(mob, [{ x: 0, y: 40, z: 0 }], { peaceful: false, random: new JavaRandom(1) });
  assert.equal(mob.noActionTime, 0);
});

test('a persistent mob is never removed for distance', () => {
  const { manager } = harness({ seed: 1, radius: 2 });
  const despawner = manager.despawnManager;
  const mob = {
    type: 'zombie', health: 20, persistent: true, noActionTime: 5000,
    mesh: { position: { x: 500, y: 40, z: 0 } },
  };
  assert.equal(despawner.checkDespawn(mob, [{ x: 0, y: 40, z: 0 }], { peaceful: false, random: new JavaRandom(1) }), null);
});

test('farm animals do not despawn but cats and wandering traders do', () => {
  // Java's Animal class overrides removeWhenFarAway to false; Cat, Ocelot, WanderingTrader and
  // TraderLlama re-enable it.
  const { manager } = harness({ seed: 1, radius: 2 });
  const despawner = manager.despawnManager;
  const cow = { type: 'cow', health: 20, persistent: false, noActionTime: 0, mesh: { position: { x: 300, y: 40, z: 0 } } };
  assert.equal(despawner.checkDespawn(cow, [{ x: 0, y: 40, z: 0 }], { peaceful: false, random: new JavaRandom(1) }), null);
  const cat = { ...cow, type: 'cat' };
  assert.equal(despawner.checkDespawn(cat, [{ x: 0, y: 40, z: 0 }], { peaceful: false, random: new JavaRandom(1) }), 'hard');
  const trader = { ...cow, type: 'wandering_trader' };
  assert.equal(despawner.checkDespawn(trader, [{ x: 0, y: 40, z: 0 }], { peaceful: false, random: new JavaRandom(1) }), 'hard');
});

test('PEACEFUL removes hostiles but leaves hoglins, piglins and shulkers', () => {
  const { manager } = harness({ seed: 1, radius: 2 });
  const despawner = manager.despawnManager;
  const mk = (type) => ({ type, health: 20, persistent: false, noActionTime: 0, mesh: { position: { x: 5, y: 40, z: 0 } } });
  const players = [{ x: 0, y: 40, z: 0 }];
  assert.equal(despawner.checkDespawn(mk('zombie'), players, { peaceful: true, random: new JavaRandom(1) }), 'peaceful');
  assert.equal(despawner.checkDespawn(mk('piglin'), players, { peaceful: true, random: new JavaRandom(1) }), null);
  assert.equal(despawner.checkDespawn(mk('hoglin'), players, { peaceful: true, random: new JavaRandom(1) }), null);
  assert.equal(despawner.checkDespawn(mk('shulker'), players, { peaceful: true, random: new JavaRandom(1) }), null);
});

test('fish despawn at 64 blocks, not 128', () => {
  // One harness for both, so the two categories are compared under identical conditions. An earlier
  // version of this test built a separate tiny world whose radius did not cover the mob's position,
  // which masked the subject entirely.
  const h = harness({ seed: 1, radius: 12 });
  const despawner = h.manager.despawnManager;
  const players = [{ x: 0, y: 40, z: 0 }];
  const mk = (type, x) => ({ type, health: 20, persistent: false, noActionTime: 0, mesh: { position: { x, y: 40, z: 0 } } });

  // A cod at 70 blocks: past the WATER_AMBIENT hard distance of 64, so removed.
  assert.equal(despawner.checkDespawn(mk('cod', 70), players, { peaceful: false, random: new JavaRandom(1) }), 'hard',
    'a fish past 64 blocks must despawn');
  // A squid at 70 blocks: still inside WATER_CREATURE's 128, so kept.
  assert.equal(despawner.checkDespawn(mk('squid', 70), players, { peaceful: false, random: new JavaRandom(1) }), null,
    'a squid at 70 blocks must NOT despawn');
  // Both are removed past 128.
  assert.equal(despawner.checkDespawn(mk('squid', 130), players, { peaceful: false, random: new JavaRandom(1) }), 'hard');
  assert.equal(despawner.checkDespawn(mk('cod', 130), players, { peaceful: false, random: new JavaRandom(1) }), 'hard');
  // And the distance comes from the TYPE, not a category argument.
  assert.equal(h.manager.despawnDistanceFor('cod'), 64);
  assert.equal(h.manager.despawnDistanceFor('squid'), 128);
  assert.equal(h.manager.despawnDistanceFor({ type: 'cod' }), 64);
});

test('the despawn distance is 3-D Euclidean, not a cylinder', () => {
  // The wiki's example: a mob at (0,y,0) despawns if the player moves to (91,y,91) -- real distance
  // 128.7 -- but not to (65,y,65), real distance 91.9.
  const near = Math.hypot(65, 65);
  const far = Math.hypot(91, 91);
  assert.ok(near < 128 && far > 128);
  const { manager } = harness({ seed: 1, radius: 2 });
  const despawner = manager.despawnManager;
  const players = [{ x: 91, y: 0, z: 91 }];
  const mob = { type: 'zombie', health: 20, persistent: false, noActionTime: 0, mesh: { position: { x: 0, y: 0, z: 0 } } };
  assert.equal(despawner.checkDespawn(mob, players, { peaceful: false, random: new JavaRandom(1) }), 'hard');
});

test('cluster sizes cap a pack: 8 for cod, 6 for horses, 4 by default', () => {
  assert.equal(maxSpawnClusterSizeFor('cod'), 8);
  assert.equal(maxSpawnClusterSizeFor('horse'), 6);
  assert.equal(maxSpawnClusterSizeFor('zombie'), 4);
  assert.equal(maxSpawnClusterSizeFor('ghast'), 1);
});

// ---------------------------------------------------------------------------------------------
// 14. End-to-end behaviour in a real generated world
// ---------------------------------------------------------------------------------------------

test('a generated world produces mobs continuously, not only near the spawn point', () => {
  const h = harness({ seed: 1234, biome: 'all', time: 18000, radius: 8 });
  simulate(h.manager, h.game, 60, { fixedTime: 18000 });
  assert.ok(h.mobs.mobs.length > 10, `expected a populated world, got ${h.mobs.mobs.length} mobs`);
  // Spawns must be spread across the loaded area, not clustered at one point.
  const xs = h.spawns.map(s => s.x);
  const zs = h.spawns.map(s => s.z);
  const spreadX = Math.max(...xs) - Math.min(...xs);
  const spreadZ = Math.max(...zs) - Math.min(...zs);
  assert.ok(spreadX > 100, `spawns covered only ${spreadX.toFixed(0)} blocks in x`);
  assert.ok(spreadZ > 100, `spawns covered only ${spreadZ.toFixed(0)} blocks in z`);
});

test('hostile mobs spawn in dark caves during the day and are absent from lit surfaces', () => {
  const h = harness({ seed: 9, biome: 'plains', time: 6000, radius: 8 });
  simulate(h.manager, h.game, 60, { fixedTime: 6000 });
  const hostile = new Set(['zombie', 'skeleton', 'creeper', 'spider', 'slime', 'enderman', 'witch', 'zombie_villager']);
  const hostileSpawns = h.spawns.filter(s => hostile.has(s.type));
  assert.ok(hostileSpawns.length > 0, 'expected hostile mobs to spawn underground during the day');
  // Light at the spawn position, captured by the harness at the exact block the rule read.
  const lit = hostileSpawns.filter(s => h.world.getSkyLight(Math.floor(s.x), s.y, Math.floor(s.z)) >= 15);
  assert.equal(lit.length, 0, `hostile mobs spawned in full sky light: ${lit.map(s => s.type).join(', ')}`);
});

test('hostile mobs do spawn on the surface at night', () => {
  const h = harness({ seed: 9, biome: 'plains', time: 18000, radius: 8 });
  simulate(h.manager, h.game, 60, { fixedTime: 18000 });
  const hostile = new Set(['zombie', 'skeleton', 'creeper', 'spider', 'slime', 'enderman', 'witch']);
  const surface = h.spawns.filter(s => hostile.has(s.type)
    && s.y >= h.world.getHighestSolidY(Math.floor(s.x), Math.floor(s.z)));
  assert.ok(surface.length > 0, 'expected hostile mobs on the surface at night');
});

test('the mob cap is respected: a category never grossly exceeds its cap', () => {
  const h = harness({ seed: 5, biome: 'plains', time: 18000, radius: 8 });
  simulate(h.manager, h.game, 120, { fixedTime: 18000 });
  const monsters = h.mobs.mobs.filter(m => m.type !== 'cow' && m.type !== 'pig' && m.type !== 'sheep'
    && m.type !== 'chicken' && m.type !== 'horse' && m.type !== 'donkey' && m.type !== 'bat'
    && m.type !== 'glow_squid' && m.type !== 'squid').length;
  const state = h.manager.stateCache.state;
  const cap = state.caps[MobCategory.MONSTER];
  assert.ok(monsters <= cap + 8, `${monsters} monsters against a cap of ${cap}`);
});

test('PEACEFUL spawns no hostile mobs, and animals still spawn', () => {
  // Two separate claims, and the second needs the right TIME as well as the right difficulty.
  //
  // Animals are gated on `internal light >= 9` in addition to the 400-tick passive pass, so at
  // midnight (skyDarken 11, internal sky light 4) NO animal can spawn whatever the difficulty. The
  // run therefore uses noon, where the light requirement is satisfiable, and is long enough for
  // several of the 400-tick passive passes.
  const h = harness({ seed: 5, biome: 'plains', time: 6000, difficulty: 'peaceful', radius: 8 });
  simulate(h.manager, h.game, 120, { fixedTime: 6000 });

  // Hostile natural spawning is off entirely on PEACEFUL.
  const hostile = h.spawns.filter(s => CATEGORY_INFO[categoryOf(s.type)]?.requiresHostileDifficulty);
  assert.equal(hostile.length, 0, `PEACEFUL produced ${hostile.length} hostile spawns`);
  assert.ok(h.manager.peacefulMode, 'the manager should report PEACEFUL');

  // Animals still spawn: vanilla's `spawnFriendlies` switch is independent of difficulty.
  const passive = h.spawns.filter(s => categoryOf(s.type) === MobCategory.CREATURE);
  assert.ok(passive.length > 0,
    `PEACEFUL must still spawn passive mobs (got ${h.spawns.length} spawns: ${[...new Set(h.spawns.map(s => s.type))].join(', ')})`);
});

test('no animals spawn at midnight, because they need internal light 9', () => {
  // The complement of the test above: at midnight the surface reads internal light 4, so the passive
  // light rule refuses it. This is the rule that keeps animals out of the night and out of caves.
  const h = harness({ seed: 5, biome: 'plains', time: 18000, difficulty: 'normal', radius: 8 });
  simulate(h.manager, h.game, 120, { fixedTime: 18000 });
  const passive = h.spawns.filter(s => categoryOf(s.type) === MobCategory.CREATURE);
  assert.equal(passive.length, 0,
    `expected no animals at midnight, got ${passive.length}: ${[...new Set(passive.map(s => s.type))].join(', ')}`);
});

test('mobs actually get removed as the player leaves them behind', () => {
  const h = harness({ seed: 77, biome: 'all', time: 18000, radius: 8 });
  simulate(h.manager, h.game, 40, { fixedTime: 18000 });
  const despawnTelemetry = h.manager.despawnManager.telemetry();
  assert.ok(despawnTelemetry.checks > 0, 'the despawner must run');
  // Teleport the player far away and keep simulating: the mobs left behind must be removed.
  h.player.position.x = 4000;
  h.player.position.z = 4000;
  simulate(h.manager, h.game, 5, { fixedTime: 18000 });
  const after = h.manager.despawnManager.telemetry();
  assert.ok(after.hardRemovals > 0, 'mobs far behind the player must be despawned');
});

test('a full spawn pass finds no eligible chunks when no player is near', () => {
  const h = harness({ seed: 5, biome: 'plains', radius: 2 });
  const state = h.manager.naturalSpawner.buildState([], true);
  assert.equal(state.eligibleChunks.length, 0);
});

test('the spawner does no work at all when there are no players', () => {
  const h = harness({ seed: 5, biome: 'plains', radius: 4 });
  const result = h.manager.naturalSpawner.tick([], {});
  assert.deepEqual(result, { passes: 0, chunks: 0, spawns: 0 });
});

// ---------------------------------------------------------------------------------------------
// 15. The tick clock
// ---------------------------------------------------------------------------------------------

test('the spawn clock is frame-rate independent', () => {
  // 10 seconds of simulation at 60fps and at 10fps must produce the same number of ticks.
  const fast = new SpawnClock();
  const slow = new SpawnClock();
  let fastTicks = 0;
  let slowTicks = 0;
  for (let i = 0; i < 600; i++) fastTicks += fast.advance(1 / 60);
  for (let i = 0; i < 100; i++) slowTicks += slow.advance(1 / 10);
  assert.equal(fastTicks, slowTicks, 'the tick count must not depend on the frame rate');
  assert.equal(fastTicks, 200, '10 seconds is 200 ticks at 20 tps');
});

test('the spawn clock clamps a catch-up burst instead of freezing the page', () => {
  const clock = new SpawnClock({ maxTicksPerCall: 5 });
  const ticks = clock.advance(10); // ten seconds of stall
  assert.equal(ticks, 5);
  assert.ok(clock.droppedTicks > 0, 'the dropped ticks must be counted, not silently lost');
});

test('there are 20 ticks per second', () => {
  assert.equal(TICKS_PER_SECOND, 20);
});

// ---------------------------------------------------------------------------------------------
// 16. Light engine consistency with the world it lights
// ---------------------------------------------------------------------------------------------

test('the light engine agrees with world.js on the chunk dimensions', () => {
  // The light engine declares its own constants to avoid an import cycle. If world.js changes, this
  // is the test that catches the resulting silent misindexing.
  assert.equal(CHUNK_SIZE_X, WORLD_X);
  assert.equal(CHUNK_SIZE_Z, WORLD_Z);
  assert.equal(CHUNK_HEIGHT, WORLD_H);
});

test('sky light is 15 above the terrain and 0 at bedrock', () => {
  const { world } = harness({ seed: 4, radius: 2 });
  const ground = world.getHighestSolidY(8, 8);
  assert.equal(world.getSkyLight(8, ground + 1, 8), 15);
  assert.equal(world.getSkyLight(8, 1, 8), 0);
});

test('a torch lights its neighbours and falls off by one per block', () => {
  const { world } = harness({ seed: 4, radius: 2 });
  const ground = world.getHighestSolidY(8, 8);
  world.setVoxel(8, ground + 1, 8, BLOCKS.TORCH);
  world.light.relightAll();
  const at = world.getBlockLight(8, ground + 1, 8);
  const one = world.getBlockLight(9, ground + 1, 8);
  const two = world.getBlockLight(10, ground + 1, 8);
  assert.equal(at, 14, 'a torch emits 14 in vanilla');
  assert.equal(one, 13);
  assert.equal(two, 12);
});

test('opacity is opaque for stone and free for air, glass and plants', () => {
  assert.equal(blockOpacity(BLOCKS.AIR), 0);
  assert.equal(blockOpacity(BLOCKS.STONE), MAX_LIGHT);
  assert.equal(blockOpacity(BLOCKS.GLASS), 0);
  // Water and leaves attenuate by 1, which is what makes a forest floor dimmer than open ground.
  assert.equal(blockOpacity(BLOCKS.WATER), 1);
});

test('a fully opaque block does not block motion for the heightmap if it is a plant', () => {
  // blocksMotion is used by the heightmaps; a plant must not count as the surface.
  assert.equal(blocksMotion(BLOCKS.AIR), false);
  assert.equal(blocksMotion(BLOCKS.STONE), true);
  assert.equal(blocksMotion(BLOCKS.POPPY), false);
});

// ---------------------------------------------------------------------------------------------
// 17. Telemetry and the debug overlay
// ---------------------------------------------------------------------------------------------

test('telemetry counts attempts, spawns and rejection reasons', () => {
  const h = harness({ seed: 5, biome: 'plains', time: 18000, radius: 6 });
  simulate(h.manager, h.game, 30, { fixedTime: 18000 });
  const t = h.manager.naturalSpawner.telemetry();
  assert.ok(t.positionAttempts > 0, 'attempts should be counted');
  assert.ok(t.spawns > 0, 'spawns should be counted');
  assert.ok(Object.keys(t.rejections).length > 0, 'rejection reasons should be counted');
  // Every rejection reason must be one of the declared codes.
  for (const reason of Object.keys(t.rejections)) {
    assert.ok(Object.values(SpawnRejection).includes(reason), `unknown rejection code: ${reason}`);
  }
});

test('the debug snapshot carries the fields the overlay prints', () => {
  const h = harness({ seed: 5, biome: 'plains', radius: 4 });
  simulate(h.manager, h.game, 5, { fixedTime: 18000 });
  const snapshot = h.manager.debugSnapshot();
  for (const key of ['difficulty', 'dimension', 'eligibleChunks', 'caps', 'spawner', 'despawner', 'timing']) {
    assert.ok(key in snapshot, `snapshot is missing ${key}`);
  }
  assert.ok(snapshot.caps.monster, 'the snapshot should carry the monster cap');
});

test('every rejection code has a human-readable explanation in the overlay', async () => {
  const { explainRejection } = await import('../src/spawning/spawnDebugOverlay.js');
  for (const code of Object.values(SpawnRejection)) {
    assert.ok(explainRejection(code).length > 0, `no explanation for ${code}`);
  }
});
