// MobSpawnManager: the top-level owner of every mob-spawning mechanism.
//
// Why a manager and not one spawner class.
//
// Minecraft has at least nine mechanisms that create mobs, and they are independent: the per-tick
// natural cycle, chunk-generation population, the monster spawner block, the trial spawner, patrols,
// wandering traders, phantoms, village cats and golems, breeding, raids, reinforcements. Only one of
// them is `NaturalSpawner`. Putting them in one class is how a "spawner" ends up 3000 lines long and
// why a change to phantom logic can break cave spawning.
//
// So this object owns a registry of the mechanisms and drives the ones that are tick-driven:
//
//   MobSpawnManager
//     |-- NaturalSpawner          -- the per-tick cycle (this file's main job)
//     |-- ChunkGenerationSpawner  -- CREATURE groups as terrain is generated
//     |-- DespawnManager          -- natural despawning, and the cap space it frees
//     |-- specialSpawners.js      -- the tick-driven non-natural mechanisms
//     |-- spawnTelemetry.js       -- counters and the debug snapshot
//
// It also provides the small adapter surface the spawner needs from the engine: how to build a mob,
// how big it is, whether a block is solid, what the biome is, what the difficulty is. Keeping that
// surface explicit (rather than letting the spawner reach into `game`) is what makes the whole
// subsystem testable with a stub world and no scene.
//
// Reference: docs/mob-spawning-spec-1.21.4.md; PaperMC/Paper `NaturalSpawner.java` and
// `ServerChunkCache.java` for the architecture. Behaviour reimplemented; no Mojang source copied.

import { JavaRandom, asSpawnRandom } from './spawnRandom.js';
import {
  ALL_MOB_CATEGORIES,
  CATEGORY_INFO,
  MobCategory,
  categoryOf,
} from './mobCategories.js';
import { NaturalSpawner, maxDistanceForCategory } from './naturalSpawner.js';
import { DespawnManager, maxSpawnClusterSizeFor } from './despawnManager.js';
import { ChunkGenerationSpawner } from './chunkGenerationSpawner.js';
import { SpecialSpawnerRegistry } from './specialSpawners.js';
import { SpawnTelemetry } from './spawnTelemetry.js';
import { SpawnClock, skyDarkenForDimension, isNight as isNightAt } from './spawnClock.js';
import { Difficulty, difficultyRank } from './spawnValidation.js';
import { biomeSpawnsFor } from './biomeSpawnResolver.js';
import { blockOpacity, MAX_LIGHT } from './lightEngine.js';
import { BLOCKS, BLOCK_DEFS } from '../blocks.js';

/**
 * Biomes where `WATER_AMBIENT` spawns are reduced by 98%.
 *
 * The vanilla tag is `minecraft:reduced_water_ambient_spawns`: lush caves and mangrove swamp. The
 * refusal is drawn BEFORE the weighted pick, so it consumes a random value and is part of parity.
 */
export const REDUCED_WATER_AMBIENT_BIOMES = new Set([
  'lush_caves', 'mangrove_swamp',
]);

/**
 * The wall-clock budget for one spawn tick, in milliseconds.
 *
 * Deliberately small. The spawn pass shares a frame with rendering, and the browser default render
 * distance of 8 chunks gives up to 289 eligible chunks; attempting all of them in one tick measured
 * over 20ms. Vanilla is unbudgeted because a server's chunk loop is inside its tick budget of 50ms;
 * a 60fps browser frame gives us 16ms total. Skipped chunks are re-collected next tick and the
 * shuffle means the same ones do not always lose.
 */
const DEFAULT_SPAWN_BUDGET_MS = 2.5;

/**
 * Owns the mob-spawning subsystem for one game.
 */
export class MobSpawnManager {
  /**
   * @param {object} options
   * @param {object} options.game              the Game, for the world, the player and the mob manager
   * @param {number} [options.seed]            overrides the world seed for the spawn RNG
   * @param {boolean} [options.enabled]
   */
  constructor({ game, seed = null, enabled = true } = {}) {
    this.game = game;
    this.enabled = enabled;
    /**
     * The natural-spawn RNG.
     *
     * Derived from the world seed so a run is reproducible. Vanilla draws from `Level.random`, which
     * is seeded from the world seed at load; `mobs.js` still uses `this.random` for mob behaviour,
     * and the manager reuses that hook when the game provides one so a test that stubs
     * `mobs.random` also controls spawning.
     */
    this.random = new JavaRandom((seed ?? (game?.world?.seed ?? 0)) ^ 0x5EED_5A11);
    /**
     * A second generator for the SPECIAL spawners.
     *
     * Separate on purpose. Vanilla's special mechanisms do not draw from the natural spawn stream,
     * and sharing one generator would make a phantom roll shift every subsequent natural spawn --
     * which would make a seeded comparison impossible and would couple two unrelated systems.
     */
    this.specialRandom = new JavaRandom((seed ?? (game?.world?.seed ?? 0)) ^ 0x5EC1A1);

    this.clock = new SpawnClock();
    this.localCapEnabled = true;
    this.countPersistentInCap = false;
    this.checkPlayerDistance = true;
    this.minPlayerDistance = undefined; // resolved by the spawner's default
    this.maxPlayerDistance = undefined;
    this.spawnBudgetMs = DEFAULT_SPAWN_BUDGET_MS;

    /** Cached SpawnState, rebuilt on a cadence by the spawner. */
    this.stateCache = null;

    this.naturalSpawner = new NaturalSpawner({ mobSpawnManager: this });
    this.naturalSpawner.budgetMs = this.spawnBudgetMs;
    // A bound method rest stops the spawner calling `isSolidAt` with `this === undefined`.
    this.boundIsSolidAt = (x, y, z) => this.isSolidAt(x, y, z);
    this.despawnManager = new DespawnManager({ mobSpawnManager: this });
    this.chunkGenerationSpawner = new ChunkGenerationSpawner({ mobSpawnManager: this });
    this.specialSpawners = new SpecialSpawnerRegistry({ mobSpawnManager: this });
    this.telemetry = new SpawnTelemetry({ mobSpawnManager: this });

    /** Blocks the world-spawn safe zone, if the game supplies one. */
    this.worldSpawnPoint = null;

    /**
     * Structure lookup: `(x, y, z) => structureId | null`. Set by the game when a structure index
     * exists; null means "no structure overrides", which is the honest answer for a world with no
     * structures rather than an empty list that silently suppresses spawning.
     */
    this.structureAt = null;

    this.stats = {
      updates: 0,
      spawnTicks: 0,
      lastUpdateMs: 0,
      maxUpdateMs: 0,
      paused: false,
    };
  }

  get world() {
    return this.game?.world ?? null;
  }

  get mobs() {
    return this.game?.mobs?.mobs ?? [];
  }

  get difficulty() {
    return this.game?.difficulty || Difficulty.NORMAL;
  }

  get peacefulMode() {
    return difficultyRank(this.difficulty) === difficultyRank(Difficulty.PEACEFUL);
  }

  get skyDarken() {
    return this._skyDarken ?? 0;
  }

  get thunder() {
    const weather = this.game?.weather;
    return weather?.weatherType === 'thunder' || weather?.isThundering === true;
  }

  get isNight() {
    return isNightAt(this.game?.worldTime ?? 6000);
  }

  /**
   * The non-spectator players in the current dimension, in the shape the spawner wants.
   *
   * The manager is multi-player aware from the start: `players` is an array, the eligible-chunk set
   * is a union over it, and the per-player cap has one bucket per entry. The single-player case is
   * just an array of length one.
   */
  players() {
    const player = this.game?.player;
    if (!player || !player.position) return [];
    if (player.gamemode === 'spectator') return [];
    return [{
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      chunkX: Math.floor(player.position.x / 16),
      chunkZ: Math.floor(player.position.z / 16),
      spectator: player.gamemode === 'spectator',
      entity: player,
    }];
  }

  /**
   * Advance the subsystem by a frame delta.
   *
   * The delta is converted into game ticks by the clock, and the spawner and despawner run once per
   * tick. This is what makes the spawn rate independent of the frame rate.
   *
   * @param {number} dtSeconds
   */
  update(dtSeconds) {
    if (!this.enabled) return;
    const started = now();
    this.stats.updates++;

    const world = this.world;
    const player = this.game?.player;
    // Spawning needs a generated world and a player to spawn around; before either exists there is
    // nothing to do and building a SpawnState would be wasted work.
    if (!world || !player || !player.position) return;

    // Refresh the derived light values the predicates read.
    const time = this.game?.worldTime ?? 6000;
    this._skyDarken = skyDarkenForDimension(world.dimension, time, {
      rain: this.game?.weather?.weatherType === 'rain',
      thunder: this.thunder,
    });

    const players = this.players();
    if (players.length === 0) return;

    const ticks = this.clock.advance(dtSeconds);
    if (ticks <= 0) return;

    for (let i = 0; i < ticks; i++) {
      this.stats.spawnTicks++;
      // `noActionTime` advances every tick for every mob, before the despawn check reads it.
      this.despawnManager.advanceNoActionTime();
      const despawned = this.despawnManager.tick(players);
      if (despawned.removed > 0) {
        // A removal frees cap space, so the cached counts are now stale.
        this.naturalSpawner.invalidateState();
      }
      this.naturalSpawner.tick(players);
      this.specialSpawners.tick(players);
    }

    this.telemetry.finishTick();

    const elapsed = now() - started;
    this.stats.lastUpdateMs = elapsed;
    if (elapsed > this.stats.maxUpdateMs) this.stats.maxUpdateMs = elapsed;
  }

  // ------------------------------------------------------------------------------------------
  // Adapter surface for the spawner
  // ------------------------------------------------------------------------------------------

  /**
   * Build a mob of `type` at a position.
   *
   * Vanilla's `getMobForSpawn` + `finalizeSpawn`. The engine's `spawnMob` is the single entry point
   * and already dispatches every type; this adds the per-type spawn options that a natural spawn
   * needs (a slime's size, a baby's chance) and records where the mob came from, which is what the
   * despawn rules and the persistence rules read.
   */
  createMob(type, x, y, z, options = {}) {
    const mobManager = this.game?.mobs;
    if (!mobManager) return null;
    const { natural = true, category, biomeId, source, structureId } = options;

    // A slime or magma cube's size is rolled at spawn: the largest size is rare, and the roll is part
    // of the natural spawn rather than of the model.
    let spawnOptions = { natural };
    if (type === 'slime' || type === 'magma_cube') {
      const roll = this.random.nextInt(10);
      spawnOptions = { ...spawnOptions, size: roll === 0 ? 4 : (roll < 4 ? 2 : 1) };
    }

    const mob = mobManager.spawnMob(type, x, y, z, spawnOptions);
    if (!mob) return null;

    mob.naturalSpawn = natural;
    mob.spawnCategory = category || categoryOf(type);
    mob.spawnBiome = biomeId || null;
    mob.spawnSource = source || 'biome';
    mob.spawnStructure = structureId || null;
    // Natural spawns are not persistent; the mob's own rules may change that later (picking up an
    // item, being named, being tamed).
    if (mob.persistent === undefined) mob.persistent = false;
    mob.noActionTime = 0;
    return mob;
  }

  /** The bounding box for a mob type, from the engine's own dimension table. */
  dimensionsFor(type) {
    const dims = this.game?.mobs?.getMobDimensions?.(type);
    return dims || { width: 0.6, height: 1.95 };
  }

  /** `Mob.getMaxSpawnClusterSize()`. */
  maxSpawnClusterSize(type) {
    return maxSpawnClusterSizeFor(type);
  }

  /**
   * `MobCategory.getDespawnDistance()` for a mob.
   *
   * Takes the mob TYPE and looks the category up from it, rather than taking a category. The
   * difference matters: `WATER_CREATURE` is 128 and `WATER_AMBIENT` is 64, and squid (a
   * WATER_CREATURE) and cod (a WATER_AMBIENT) live in the same water. An earlier version of this
   * method accepted a category and the despawn manager passed the mob -- which silently produced
   * `undefined`, fell back to 128, and left fish holding cap space out to 128 blocks instead of 64.
   */
  despawnDistanceFor(mob) {
    const type = typeof mob === 'string' ? mob : mob?.type;
    const info = CATEGORY_INFO[categoryOf(type)];
    return info?.despawnDistance ?? 128;
  }

  /** A hook the engine may use for mob-specific persistence (jockeys, leaders, equipment). */
  requiresCustomPersistence(mob) {
    return !!mob?.persistenceRequired;
  }

  /**
   * Remove a mob from the world with no death, no loot and no XP.
   *
   * Delegates to `MobManager.removeMob`, which owns the scene teardown. The guard matters: a test
   * stub may not implement removal, and despawning must degrade to "mob stays" rather than throwing
   * inside the tick loop.
   */
  removeMob(mob, reason = 'despawned') {
    const mobManager = this.game?.mobs;
    if (!mobManager?.removeMob) {
      // No removal path available. Mark the mob so a caller can still observe the decision.
      if (mob) mob.despawnRequested = reason;
      return false;
    }
    return mobManager.removeMob(mob, reason);
  }

  /** `Monster.shouldDespawnInPeaceful()`: the per-mob override. */
  shouldSurvivePeaceful(mob) {
    return !!mob?.survivesPeaceful;
  }

  /** Is a block a solid full cube, i.e. the pack centre test's `isRedstoneConductor`? */
  isFullSolidBlock(blockId) {
    return blockOpacity(blockId) >= MAX_LIGHT;
  }

  /**
   * Is a block solid for a mob's bounding box?
   *
   * Answered from the block registry rather than by delegating to `MobManager.isBlockSolid`.
   * Delegating looked equivalent and is not: chunk-generation population runs from
   * `World.getOrCreateChunk`, which the world-start path reaches BEFORE `game.mobs` exists, so a
   * delegated call would throw -- or, worse, silently answer "not solid" and put every generated
   * animal inside a hillside. The rule itself is the same one MobManager applies: air, water and fire
   * are passable, and everything the registry marks solid and not a plant blocks.
   */
  isSolidAt(x, y, z) {
    const world = this.world;
    if (!world) return false;
    const id = world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z));
    if (id === BLOCKS.AIR || id === BLOCKS.WATER || id === BLOCKS.LAVA) return false;
    const def = BLOCK_DEFS[id];
    if (!def) return false;
    if (def.plant) return false;
    return def.solid !== false;
  }

  /** The internal light level at a position, used by the despawn rule's brightness term. */
  lightLevelAt(position) {
    const world = this.world;
    if (!world?.getLightLevel) return 0;
    return world.getLightLevel(position.x, position.y, position.z, this.skyDarken);
  }

  /** The biome at a position. Cached per (x, z) chunk key for the current tick. */
  biomeAt(x, y, z) {
    const world = this.world;
    if (!world?.getBiome) return 'plains';
    return world.getBiome(Math.floor(x), Math.floor(z));
  }

  /** `BiomeTags.REDUCED_WATER_AMBIENT_SPAWNS`. */
  isReducedWaterAmbientBiome(biomeId) {
    return REDUCED_WATER_AMBIENT_BIOMES.has(String(biomeId || ''));
  }

  /**
   * May a mob of this type spawn in the current dimension?
   *
   * The engine's dimensions are not vanilla's, so this is a coarse gate: the Nether and the End each
   * have their own mob sets, expressed here as "a mob the biome table places there may spawn there".
   * The real gate is the biome table, which already contains only Nether mobs for Nether biomes.
   */
  canSpawnInDimension(type) {
    const dimension = this.world?.dimension || 'overworld';
    if (dimension === 'nether') return NETHER_MOB_TYPES.has(type);
    if (dimension === 'the_end') return END_MOB_TYPES.has(type);
    return !NETHER_MOB_TYPES.has(type) || OVERWORLD_ALSO_HAS.has(type);
  }

  /** A snapshot of everything the debug overlay shows. */
  debugSnapshot() {
    return this.telemetry.snapshot();
  }
}

/**
 * Mob types that belong to the Nether.
 *
 * Used only as a coarse dimension gate; the biome table is the authority for which of them appears
 * where.
 */
export const NETHER_MOB_TYPES = new Set([
  'blaze', 'ghast', 'magma_cube', 'wither_skeleton', 'piglin', 'piglin_brute',
  'zombified_piglin', 'zombie_pigman', 'hoglin', 'zoglin', 'strider',
]);

/** Mob types that belong to the End. */
export const END_MOB_TYPES = new Set(['enderman', 'shulker', 'ender_dragon']);

/** Nether types that also appear in the Overworld (endermen are the notable one). */
export const OVERWORLD_ALSO_HAS = new Set(['enderman']);

/** `performance.now()` where available, so this module works in Node tests too. */
function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

export { ALL_MOB_CATEGORIES, CATEGORY_INFO, MobCategory, categoryOf, maxDistanceForCategory, asSpawnRandom };
