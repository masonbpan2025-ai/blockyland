// SpawnState: which chunks may spawn, what the category caps are, and how full they are.
//
// Why this is a separate object and not fields on a spawner.
//
// Minecraft decides whether a spawn pass may produce anything from three independent things that
// change every tick: the set of chunks loaded near the players, the population of each mob category,
// and the per-player budget that stops one player's surroundings being flooded. All three must be
// derived from a consistent view of the world -- if the cap were computed from a different chunk set
// than the one being spawned into, the caps would leak and populations would drift. Making that one
// object with one lifetime is what keeps them consistent, and it is what makes the state inspectable
// from the debug overlay.
//
// This mirrors vanilla's `NaturalSpawner.SpawnState`, constructed once per spawn pass for exactly the
// same reason.
//
// The three quantities, and the three DIFFERENT chunk sets they use. Getting these confused is the
// classic source of a mob farm that produces nothing:
//
//   eligibleChunks  -- chunks with a player horizontally within 128 blocks. Spawning may only happen
//                      in these.
//   divisor         -- the union of the 17x17 chunk squares around every player. This is ONLY the
//                      denominator of the cap formula; it is not the spawn region.
//   counts          -- every non-persistent loaded mob, ANYWHERE loaded, including in chunks no
//                      player is near. A mob abandoned 20 chunks away still occupies global cap.
//
// Reference: Minecraft Wiki "Mob spawning", Java Edition mob cap section
// (<https://minecraft.wiki/w/Mob_spawning?action=raw&section=6>), and PaperMC/Paper
// `NaturalSpawner.java` / `LocalMobCapCalculator.java` for the architecture. Behaviour
// reimplemented; no Mojang source copied.

import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from './lightEngine.js';
import {
  ALL_MOB_CATEGORIES,
  CATEGORY_INFO,
  MobCategory,
  categoryOf,
} from './mobCategories.js';

/**
 * Radius, in chunks, of the square whose AREA scales the mob cap.
 *
 * 8 chunks each way, so 17x17 = 289 -- the divisor in vanilla's `globalCap = mobCap * chunks / 289`.
 */
export const SPAWNABLE_CHUNK_RADIUS = 8;

/** The area, in chunks, of one player's cap square. 17 * 17 = 289. */
export const SPAWNABLE_CHUNK_AREA = (SPAWNABLE_CHUNK_RADIUS * 2 + 1) ** 2;

/** Vanilla's cap divisor. Equal to SPAWNABLE_CHUNK_AREA by construction, and named separately
 *  because it appears as a literal `289` in the wiki formula. */
export const MOB_CAP_DIVISOR = 289;

/**
 * How far from a player, horizontally in blocks, a chunk must be to be spawn eligible.
 *
 * 128 blocks is 8 chunks, which is why the common description is "the 17x17 chunks around a player".
 * The wiki's wording is "chunks that have a player horizontally within 128 blocks of the chunk
 * center", so the test is against the chunk CENTRE, not the player's own chunk.
 */
export const SPAWN_ELIGIBLE_RADIUS = 128;

/**
 * Per-player local cap on non-friendly mobs.
 *
 * Vanilla has a per-player cap (see the wiki section) which Paper implements as
 * `LocalMobCapCalculator`. It exists so one player's surroundings cannot hold the entire global cap
 * and starve everyone else. It is ON by default here because the architecture is multi-player aware,
 * and can be disabled (`localCapEnabled: false`) to measure the pure vanilla global-cap behaviour.
 */
export const LOCAL_CAP_MOBS = 70;
export const LOCAL_CAP_RADIUS = 128;
export const LOCAL_CAP_PERCENTAGE = 0.45;

/**
 * The state one spawn pass is computed against.
 *
 * Construction is deliberately cheap: it walks the loaded chunk key set once and the mob array once,
 * and does not touch voxels.
 */
export class SpawnState {
  /**
   * @param {object} options
   * @param {Array<{x:number,y:number,z:number,chunkX:number,chunkZ:number}>} options.players
   * @param {Set<string>} options.loadedChunkKeys keys of the form `"cx,cz"` that are currently loaded
   * @param {Array<object>} options.mobs live mobs, for the population counts
   * @param {boolean} [options.localCapEnabled]
   * @param {boolean} [options.countPersistent] force counting persistent mobs (NOT vanilla; for tests)
   * @param {number} [options.spawnableRadius] override of SPAWNABLE_CHUNK_RADIUS
   * @param {number} [options.eligibleRadius] override of SPAWN_ELIGIBLE_RADIUS, in blocks
   */
  constructor({
    players = [],
    loadedChunkKeys = new Set(),
    mobs = [],
    localCapEnabled = true,
    countPersistent = false,
    spawnableRadius = SPAWNABLE_CHUNK_RADIUS,
    eligibleRadius = SPAWN_ELIGIBLE_RADIUS,
    categoryCaps = {},
  } = {}) {
    this.players = players;
    this.mobs = mobs;
    this.localCapEnabled = localCapEnabled;
    this.countPersistent = countPersistent;
    this.spawnableRadius = spawnableRadius;
    this.eligibleRadius = eligibleRadius;
    this.categoryCaps = categoryCaps;

    /** Chunk keys eligible for natural spawning. */
    this.eligibleChunkKeys = new Set();
    /** The same, as `{cx, cz, x, z}` records, so a spawn pass does not re-parse keys. */
    this.eligibleChunks = [];
    /** Index of the player whose range each eligible chunk is in, for the local cap. */
    this.chunkOwner = new Map();
    /** Size of the union of every player's 17x17 square, whether loaded or not. */
    this.capSquareChunkCount = 0;

    this.#buildChunkSets(loadedChunkKeys);

    /** Non-persistent mobs per category, over every loaded chunk. */
    this.categoryCounts = this.#countMobsGlobally();

    /** Per-category capacity, from the vanilla formula. */
    this.caps = this.#computeCaps();

    /** Non-persistent mobs of each category within LOCAL_CAP_RADIUS of each player. */
    this.playerCounts = this.#countMobsPerPlayer();
  }

  /**
   * Build both chunk sets.
   *
   * The eligible set is a distance test against each chunk centre; the cap square is a rectangle and
   * is recorded even for chunks that are not loaded, because vanilla scales the cap by the square
   * regardless of what happens to be loaded inside it.
   */
  #buildChunkSets(loadedChunkKeys) {
    // The cap square: a rectangle per player, measured in chunks and independent of loading.
    const squareKeys = new Set();
    for (const player of this.players) {
      for (let dx = -this.spawnableRadius; dx <= this.spawnableRadius; dx++) {
        for (let dz = -this.spawnableRadius; dz <= this.spawnableRadius; dz++) {
          squareKeys.add(`${player.chunkX + dx},${player.chunkZ + dz}`);
        }
      }
    }
    this.capSquareChunkCount = squareKeys.size;

    // The eligible set: loaded chunks whose CENTRE is within the radius of some player.
    const radiusSq = this.eligibleRadius * this.eligibleRadius;
    for (let i = 0; i < this.players.length; i++) {
      const player = this.players[i];
      for (let dx = -this.spawnableRadius; dx <= this.spawnableRadius; dx++) {
        for (let dz = -this.spawnableRadius; dz <= this.spawnableRadius; dz++) {
          const cx = player.chunkX + dx;
          const cz = player.chunkZ + dz;
          const key = `${cx},${cz}`;
          if (this.chunkOwner.has(key)) continue;
          // Distance to the chunk centre, horizontally, as the wiki specifies.
          const centreX = cx * CHUNK_SIZE_X + CHUNK_SIZE_X / 2;
          const centreZ = cz * CHUNK_SIZE_Z + CHUNK_SIZE_Z / 2;
          const ddx = centreX - player.x;
          const ddz = centreZ - player.z;
          // Strict `<`, matching `euclideanDistanceSquared(chunkPos, player) < 16384.0`. A chunk whose
          // centre is EXACTLY 128 blocks away is not eligible; `<=` would include one extra ring.
          if (ddx * ddx + ddz * ddz >= radiusSq) continue;
          if (!loadedChunkKeys.has(key)) continue;
          this.eligibleChunkKeys.add(key);
          this.chunkOwner.set(key, i);
          this.eligibleChunks.push({ cx, cz, x: cx * CHUNK_SIZE_X, z: cz * CHUNK_SIZE_Z });
        }
      }
    }
  }

  /**
   * Count non-persistent live mobs per category across EVERY loaded chunk.
   *
   * The wiki: "All non-persistent loaded mobs are counted against the global cap, including those in
   * chunks not in range of a player or eligible for spawns." A mob in a chunk the player left behind
   * still holds cap space, which is exactly why despawning has to work for spawning to keep working.
   */
  #countMobsGlobally() {
    const counts = Object.create(null);
    for (const category of ALL_MOB_CATEGORIES) counts[category] = 0;
    for (const mob of this.mobs) {
      if (!this.#countsTowardCap(mob)) continue;
      counts[categoryOf(mob.type)] += 1;
    }
    return counts;
  }

  /**
   * Should this mob occupy cap space?
   *
   * Vanilla excludes persistent mobs from both caps, so a name-tagged pet does not stop the world
   * spawning. `countPersistent: true` is offered for tests that want to measure a world where it
   * does.
   */
  #countsTowardCap(mob) {
    if (!mob || !mob.mesh || !mob.mesh.position) return false;
    if (mob.health <= 0) return false;
    if (!this.countPersistent && mob.persistent) return false;
    return true;
  }

  /**
   * Per-category capacity, from vanilla's formula.
   *
   *     cap = maxPerChunkArea * capSquareChunkCount / 289
   *
   * `maxPerChunkArea` of -1 means unlimited (MISC). The real division and floor are vanilla's.
   */
  #computeCaps() {
    const caps = Object.create(null);
    for (const category of ALL_MOB_CATEGORIES) {
      const info = CATEGORY_INFO[category];
      if (!info || info.maxPerChunkArea < 0) {
        caps[category] = Infinity;
        continue;
      }
      caps[category] = Math.floor(((this.categoryCaps[category] ?? info.maxPerChunkArea) * this.capSquareChunkCount) / MOB_CAP_DIVISOR);
    }
    return caps;
  }

  /** Non-persistent mobs of each category within LOCAL_CAP_RADIUS blocks of each player. */
  #countMobsPerPlayer() {
    const perPlayer = this.players.map(() => {
      const counts = Object.create(null);
      for (const category of ALL_MOB_CATEGORIES) counts[category] = 0;
      return counts;
    });
    if (!this.localCapEnabled) return perPlayer;
    const radiusSq = LOCAL_CAP_RADIUS * LOCAL_CAP_RADIUS;
    for (let i = 0; i < this.players.length; i++) {
      const player = this.players[i];
      for (const mob of this.mobs) {
        if (!this.#countsTowardCap(mob)) continue;
        const dx = mob.mesh.position.x - player.x;
        const dz = mob.mesh.position.z - player.z;
        if (dx * dx + dz * dz > radiusSq) continue;
        perPlayer[i][categoryOf(mob.type)] += 1;
      }
    }
    return perPlayer;
  }

  /** May another mob of `category` be added, against the global cap? */
  canSpawnForCategory(category) {
    const cap = this.caps[category];
    if (cap === undefined) return false;
    if (cap === Infinity) return true;
    return this.categoryCounts[category] < cap;
  }

  /**
   * May another mob of `category` be added near `playerIndex`?
   *
   * The local cap is a per-player budget on top of the global one. Friendly categories (CREATURE and
   * the water creatures) are exempt, which is what keeps a player's own animals from blocking their
   * own monster spawns.
   */
  canSpawnForCategoryLocal(category, playerIndex) {
    if (!this.canSpawnForCategory(category)) return false;
    if (!this.localCapEnabled || playerIndex === undefined || playerIndex === null) return true;
    const info = CATEGORY_INFO[category];
    if (!info || info.isFriendly) return true;
    const globalCap = this.caps[category];
    const effective = globalCap === Infinity ? LOCAL_CAP_MOBS : globalCap;
    const allowed = Math.min(LOCAL_CAP_MOBS, Math.ceil(effective * LOCAL_CAP_PERCENTAGE));
    return (this.playerCounts[playerIndex]?.[category] ?? 0) < allowed;
  }

  /**
   * Record that a mob of `category` was just spawned.
   *
   * Vanilla checks the cap ONCE per spawn-eligible chunk and then places the whole pack, so a pack
   * is allowed to take the population over the cap. This is only called for reporting; the pack loop
   * does NOT re-check the cap between members, matching that behaviour.
   */
  noteSpawned(category, playerIndex = null) {
    this.categoryCounts[category] = (this.categoryCounts[category] || 0) + 1;
    if (playerIndex !== null && this.playerCounts[playerIndex]) {
      this.playerCounts[playerIndex][category] = (this.playerCounts[playerIndex][category] || 0) + 1;
    }
  }

  /** Record that a mob of `category` was removed, freeing cap space. */
  noteRemoved(category, playerIndex = null) {
    this.categoryCounts[category] = Math.max(0, (this.categoryCounts[category] || 0) - 1);
    if (playerIndex !== null && this.playerCounts[playerIndex]) {
      this.playerCounts[playerIndex][category] = Math.max(0, (this.playerCounts[playerIndex][category] || 0) - 1);
    }
  }

  /** Is this chunk key in the eligible set? */
  isEligible(cx, cz) {
    return this.eligibleChunkKeys.has(`${cx},${cz}`);
  }

  /** The index of the player whose range covers a chunk, or null. */
  ownerOf(cx, cz) {
    const owner = this.chunkOwner.get(`${cx},${cz}`);
    return owner === undefined ? null : owner;
  }

  /** A plain snapshot for the debug overlay and for telemetry. */
  snapshot() {
    const cats = {};
    for (const category of ALL_MOB_CATEGORIES) {
      cats[category] = {
        count: this.categoryCounts[category] || 0,
        cap: this.caps[category] === Infinity ? null : this.caps[category],
        unlimited: this.caps[category] === Infinity,
        hasRoom: this.canSpawnForCategory(category),
      };
    }
    return {
      players: this.players.length,
      eligibleChunks: this.eligibleChunks.length,
      capSquareChunks: this.capSquareChunkCount,
      categories: cats,
      localCap: this.localCapEnabled
        ? { mobs: LOCAL_CAP_MOBS, radius: LOCAL_CAP_RADIUS, percentage: LOCAL_CAP_PERCENTAGE }
        : null,
    };
  }
}

/** Categories that natural spawning may select, in the order vanilla iterates them. */
export const NATURAL_SPAWN_CATEGORIES = ALL_MOB_CATEGORIES.filter(c => c !== MobCategory.MISC);
