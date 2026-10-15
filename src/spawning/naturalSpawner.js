// NaturalSpawner: the continuous runtime spawning loop.
//
// What this replaces.
//
// Mob creation in this engine happened in exactly three places: the spawn-egg chain in main.js, the
// `/summon` command, and four ad-hoc per-tick functions (`updateSquidSpawning`, `updateStriderSpawning`,
// `updateWitherSkeletonSpawning`, `updateDonkeySpawning`) each with its own hard-coded cap and search
// pattern. Nothing else ever created a mob. That is the whole of the reported bug: a world had the
// mobs that happened to be near the start point and nothing else, forever, because after the initial
// area there was no code path that could produce a mob at all.
//
// What replaces it is the loop Minecraft actually runs, per tick:
//
//   tick()
//     ├ buildState()                     -- caps and eligible chunks, rebuilt periodically
//     ├ for each category whose interval has elapsed:
//     │   ├ collectSpawningChunks()      -- ALL eligible chunks, shuffled
//     │   └ for each chunk:
//     │       └ spawnForChunk()
//     │           └ spawnCategoryForPosition()   -- up to 3 group attempts
//     │               ├ getRandomPosWithin()     -- one start position per chunk
//     │               ├ resolveSpawnList()       -- biome table / structure override
//     │               ├ selectWeightedEntry()    -- weighted pick, fixed for the group
//     │               ├ packSizeFor()            -- group size
//     │               └ the member loop          -- triangular offsets, partial groups allowed
//
// The single most common way to get this wrong is the chunk loop. The widely repeated rule "one
// random chunk per player per tick" is **not** 1.21.4: `ChunkMap.collectSpawningChunks` collects
// EVERY eligible chunk, shuffles the list, and iterates all of it, so every eligible chunk gets an
// attempt per due category per tick. The legacy 17x17 square survives only as the mob-cap divisor.
// Implementing the "one random chunk" version produces a spawn rate roughly two orders of magnitude
// too low and a world that looks empty a few chunks from spawn -- the exact reported symptom.
//
// Reference: docs/mob-spawning-spec-1.21.4.md sections 4-9, itself built from PaperMC/Paper 1.21.4
// patch context, the NeoForge 1.21.x javadoc, and revision-pinned minecraft.wiki. Behaviour
// reimplemented; no Mojang or Paper source copied.

import {
  ALL_MOB_CATEGORIES,
  CATEGORY_INFO,
  MobCategory,
} from './mobCategories.js';
import { SpawnState } from './spawnState.js';
import {
  packSizeFor,
  resolveSpawnList,
  selectWeightedEntry,
} from './biomeSpawnResolver.js';
import {
  HeightmapType,
  SpawnPlacementType,
  spawnPlacementFor,
} from './spawnPlacements.js';
import {
  Difficulty,
  SpawnRejection,
  MAX_SPAWN_DISTANCE,
  MAX_SPAWN_DISTANCE_FISH,
  heightAt,
  validateGenericSpawn,
} from './spawnValidation.js';
import { CHUNK_HEIGHT, CHUNK_SIZE_X, CHUNK_SIZE_Z } from './lightEngine.js';
import { TICKS_PER_SECOND } from './spawnClock.js';
// SIDE-EFFECT IMPORT, and it is load-bearing.
//
// `mobSpawnPredicates.js` calls `registerDefaultSpawnPlacements()` at module scope, which is what puts
// each mob's placement type, heightmap and predicate into the registry. That module was imported by
// NOTHING under `src/`, so in the running game the registry stayed empty and `spawnPlacementFor`
// returned its unregistered default for every mob:
//
//    { placement: ON_GROUND, heightmap: MOTION_BLOCKING_NO_LEAVES, predicate: null }
//
// The consequences were severe and matched the reported symptoms exactly:
//
//   * every aquatic mob was placed as a GROUND mob, so `validateSpawnValidation`'s ON_GROUND branch
//     applied and its floor test accepted ICE as a valid floor -- fish were constructed standing on
//     ice, which is the bug that prompted this repair;
//   * every per-mob rule disappeared: glow squid's light rule, the drowned's light rule, the bat's
//     `bats_spawnable_on` floor, the passive light-9 rule, the slime rules, the Nether wart rule;
//   * `predicate: null` meant the spawner's `if (placement.predicate)` branch was never taken.
//
// The existing tests did not catch it because they imported `mobSpawnPredicates.js` directly to test
// its predicates, which populated the registry as a side effect of the test rather than of the game.
// `tests/spawnPlacementRegression.test.js` now asserts the registry is populated after importing ONLY
// the spawner, which is the shape the game uses.
import './mobSpawnPredicates.js';

/**
 * How many GROUP attempts are made per (chunk, category, tick).
 *
 * The wiki's "a maximum of 3 pack spawn attempts per mob category". This is the OUTER loop; the
 * inner per-group member count is drawn separately (see `initialMemberAttempts`).
 */
export const SPAWN_GROUP_ATTEMPTS = 3;

/**
 * How many times the group loop can iterate in total, as a safety bound.
 *
 * The inner loop's `maxAttempts` is at most 4 before the species is chosen, and is then replaced by
 * the drawn group size. The biome data's largest group is 8, so the legitimate maximum is 3 groups
 * times 8 members. The bound exists so a malformed table cannot spin.
 */
export const MAX_PACK_MEMBER_ATTEMPTS = 24;

/**
 * Horizontal offset spread for pack members, in blocks.
 *
 * Vanilla: `x += nextInt(6) - nextInt(6)` -- a triangular distribution over -5..+5 -- applied to the
 * PREVIOUS member's position, so the pack is a random walk from the start position rather than a
 * cloud around it. Y is constant for the whole pack.
 */
export const PACK_OFFSET_HORIZONTAL = 6;
const PACK_OFFSET_VERTICAL = 0;

/** The 0..4 initial member-attempt draw, as `Mth.ceil(nextFloat() * 4)`. */
export function initialMemberAttempts(random) {
  return Math.ceil(random.nextFloat() * 4);
}

/**
 * The natural spawner.
 *
 * Holds no per-world state beyond its clock and counters: the SpawnState is rebuilt periodically,
 * which is what keeps caps consistent with the chunk set that is actually being spawned into.
 */
export class NaturalSpawner {
  /**
   * @param {object} options
   * @param {object} options.mobSpawnManager the owning manager, for spawnMob and dimension queries
   */
  constructor({ mobSpawnManager } = {}) {
    this.manager = mobSpawnManager;
    this.tickCount = 0;

    this.stats = {
      passes: 0,
      chunkAttempts: 0,
      groupAttempts: 0,
      positionAttempts: 0,
      spawns: 0,
      rejections: Object.create(null),
      spawnsByCategory: Object.create(null),
      spawnsByBiome: Object.create(null),
      spawnsByMob: Object.create(null),
      spawnsBySource: Object.create(null),
      lastMs: 0,
      maxMs: 0,
      totalMs: 0,
      truncatedTicks: 0,
    };
    /** Newest-first outcomes, for the debug overlay's rejection list. Bounded. */
    this.recentAttempts = [];
    this.maxRecentAttempts = 64;
    /** Optional hook after each successful spawn: `(record) => void`. */
    this.onSpawn = null;
    /**
     * Milliseconds one `tick()` may spend before it stops starting new chunks.
     *
     * Vanilla is not budgeted, because a server's chunk loop is inside its tick. In a browser the
     * spawn loop shares a frame with rendering, so a large render distance would otherwise attempt
     * several hundred chunks in one tick. The chunks that are skipped are not lost: they are
     * re-collected next tick, and the shuffle means the same chunks do not always lose.
     */
    this.budgetMs = 3;
  }

  get world() {
    return this.manager?.world ?? null;
  }

  get game() {
    return this.manager?.game ?? null;
  }

  /**
   * Advance one game tick.
   *
   * @param {Array<object>} players `[{x,y,z,chunkX,chunkZ}]` in the current dimension
   * @returns {{passes:number, chunks:number, spawns:number}}
   */
  tick(players, options = {}) {
    this.tickCount++;
    const empty = { passes: 0, chunks: 0, spawns: 0 };
    if (options.paused || !this.world || !players || players.length === 0) return empty;

    const started = now();
    const spawnedMobs = [];
    let passes = 0;
    let chunksAttempted = 0;

    // `spawnEnemies` is the "monsters may spawn" switch: false on Peaceful. `spawnFriendlies` is the
    // "animals may spawn" switch, which stays true on Peaceful -- that is why a Peaceful world still
    // has cows. Vanilla has a self-assignment bug in the setter that updates `spawnEnemies` but not
    // `spawnFriendlies`; the semantic contract above is what is reproduced here.
    const spawnFriendlies = true;
    const spawnEnemies = !this.manager.peacefulMode;

    const state = this.buildState(players);
    if (state.eligibleChunks.length === 0) {
      this.stats.lastMs = now() - started;
      return empty;
    }

    // The category filter, exactly as `getFilteredSpawningCategories`:
    //
    //   (spawnFriendlies || !category.isFriendly())
    //     && (spawnEnemies || category.isFriendly())
    //     && (spawnPassives || !category.isPersistent())
    //     && canSpawnForCategory(category)
    //
    // `spawnPassives` is `gameTime % 400 == 0`. This is the ONLY thing that makes animals rarer than
    // monsters: there is no per-category interval table in 1.21.4, and the `/400` cadence applies to
    // every category whose `isPersistent()` is true -- which is everything except MONSTER (plus
    // AMBIENT, which is also non-persistent).
    const settings = this.manager.spawnSettingsAt?.(players[0].x, players[0].z);
    const spawnPassives = this.tickCount % (settings?.passiveInterval ?? 400) === 0;
    const spawningCategories = this.filteredCategories(state, {
      spawnFriendlies,
      spawnEnemies,
      spawnPassives,
    });
    if (spawningCategories.length === 0) {
      this.stats.lastMs = now() - started;
      return empty;
    }

    // Collect every eligible chunk and shuffle, exactly as `collectSpawningChunks` + `Util.shuffle`
    // do. The shuffle matters: when the category cap stops a category early, the chunk that loses is
    // random rather than always the same one.
    const chunks = this.collectSpawningChunks(state);

    passes = 1;
    let truncated = false;
    for (const entry of chunks) {
      if (now() - started > this.budgetMs) { truncated = true; break; }
      chunksAttempted++;
      for (let i = 0; i < spawningCategories.length; i++) {
        const category = spawningCategories[i];
        if (!state.canSpawnForCategory(category)) {
          // A full category drops out for the remaining chunks, as vanilla's filtered list
          // effectively does.
          spawningCategories.splice(i, 1);
          i--;
          continue;
        }
        const spawned = this.spawnForChunk(category, entry, state);
        if (spawned.length) {
          for (const mob of spawned) spawnedMobs.push(mob);
        }
      }
      if (spawningCategories.length === 0) break;
    }

    const elapsed = now() - started;
    this.stats.passes += passes;
    this.stats.chunkAttempts += chunksAttempted;
    this.stats.lastMs = elapsed;
    this.stats.totalMs += elapsed;
    if (elapsed > this.stats.maxMs) this.stats.maxMs = elapsed;
    if (truncated) this.stats.truncatedTicks++;
    return { passes, chunks: chunksAttempted, spawns: spawnedMobs.length };
  }

  /**
   * Every eligible chunk, shuffled.
   *
   * Eligibility is decided in `SpawnState` (loaded, and a non-spectator player within 128 blocks of
   * the chunk centre). The world border test vanilla also applies has no equivalent here because
   * this engine has no world border; that is recorded as a deviation.
   */
  collectSpawningChunks(state) {
    const out = state.eligibleChunks.slice();
    // Fisher-Yates from the project RNG, not Math.random: the order must be reproducible for a seed.
    const random = this.manager.random;
    for (let i = out.length - 1; i > 0; i--) {
      const j = random.nextInt(i + 1);
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    this.stats.shuffled = true;
    return out;
  }

  /**
   * The categories that may run this tick.
   *
   * Vanilla's `getFilteredSpawningCategories`, reproduced term for term. The `isFriendly` term is
   * what removes monsters on Peaceful while leaving animals; the `isPersistent` term is what makes
   * everything except the non-persistent categories wait for the 400-tick pass.
   */
  filteredCategories(state, { spawnFriendlies, spawnEnemies, spawnPassives }) {
    const out = [];
    for (const category of ALL_MOB_CATEGORIES) {
      if (category === MobCategory.MISC) continue;
      const info = CATEGORY_INFO[category];
      if (!info) continue;
      if (!(spawnFriendlies || !info.isFriendly)) continue;
      if (!(spawnEnemies || info.isFriendly)) continue;
      if (!(spawnPassives || !info.isPersistent)) continue;
      if (!state.canSpawnForCategory(category)) continue;
      out.push(category);
    }
    return out;
  }

  /**
   * Build the SpawnState for this pass.
   *
   * Vanilla reuses the state between rebuilds and refreshes it on a coarse cadence; the exact gating
   * expression is unverified, so this refreshes on the same 400-tick cadence as the passives gate,
   * plus immediately whenever the player set moves to a different chunk.
   */
  buildState(players, force = false) {
    const cache = this.manager?.stateCache;
    const signature = signatureOf(players);
    const settings = this.manager.spawnSettingsAt?.(players[0]?.x, players[0]?.z);
    if (!force && cache && cache.signature === signature && this.tickCount - cache.tick < (settings?.passiveInterval ?? 400)) {
      return cache.state;
    }
    const loadedChunkKeys = new Set(this.world.chunks.keys());
    const state = new SpawnState({
      players,
      loadedChunkKeys,
      mobs: this.manager?.mobs || [],
      localCapEnabled: this.manager?.localCapEnabled !== false,
      countPersistent: this.manager?.countPersistentInCap === true,
      categoryCaps: this.manager.spawnSettingsAt?.(players[0]?.x, players[0]?.z)?.caps,
    });
    if (this.manager) this.manager.stateCache = { tick: this.tickCount, state, signature };
    return state;
  }

  /** Drop the cached SpawnState, so the next pass recounts. */
  invalidateState() {
    if (this.manager) this.manager.stateCache = null;
  }

  /**
   * Try to populate one chunk with one category.
   *
   * @returns {Array<object>} the mobs created (possibly several, from a pack)
   */
  spawnForChunk(category, entry, state) {
    const info = CATEGORY_INFO[category];
    if (!info) return [];

    // The cap is checked once here, before any position work, and NOT again between pack members.
    // The wiki: "The mob caps are checked once for each spawn-eligible chunk. The group size ... is
    // not taken into account, meaning the spawning of a group of mobs may cause the total number of
    // mobs for that category to exceed the respective cap." Re-checking per member would silently
    // apply a cap vanilla does not have.
    if (!state.canSpawnForCategoryLocal(category, state.ownerOf(entry.cx, entry.cz))) {
      this.recordAttempt({
        category,
        rejected: state.canSpawnForCategory(category) ? SpawnRejection.LOCAL_CAP_FULL : SpawnRejection.CAP_FULL,
        cx: entry.cx, cz: entry.cz,
      });
      return [];
    }

    const random = this.manager.random;
    const chance = this.manager.spawnSettingsAt?.(entry.x, entry.z)?.chance?.[category] ?? 1;
    if (chance < 1 && random.nextDouble() >= chance) return [];
    // `getRandomPosWithin`: X and Z uniform over the chunk's 16 columns, Y uniform over
    // [minY, WORLD_SURFACE + 1]. NOTE the heightmap is WORLD_SURFACE -- "the highest non-air block"
    // -- not MOTION_BLOCKING_NO_LEAVES. The per-entity heightmap is used later, by the placement
    // check, not here.
    const minY = 0;
    const startX = entry.x + random.nextInt(CHUNK_SIZE_X);
    const startZ = entry.z + random.nextInt(CHUNK_SIZE_Z);
    const surfaceY = heightAt(this.world, startX, startZ, HeightmapType.WORLD_SURFACE) + 1;
    const startY = this.pickY(surfaceY, random, minY);

    // `spawnCategoryForChunk` rejects a pack centre exactly at the world floor: mobs are placed with
    // their feet at `y`, so a pack centred on the bottom layer fails the collision checks anyway.
    if (startY < minY + 1) return [];

    // A pack whose centre lands inside a solid full block spawns nothing for this category in this
    // chunk this tick. This is the wiki's "if the block in which a pack spawn occurs is an opaque
    // full cube, further pack spawn attempts are cancelled".
    const centreBlock = this.world.getVoxel(startX, startY, startZ);
    if (this.manager.isFullSolidBlock(centreBlock)) {
      this.recordAttempt({
        category, rejected: SpawnRejection.COLLISION, x: startX, y: startY, z: startZ,
        cx: entry.cx, cz: entry.cz, detail: 'pack centre inside a solid full block',
      });
      return [];
    }

    const spawned = [];
    for (let group = 0; group < SPAWN_GROUP_ATTEMPTS; group++) {
      this.stats.groupAttempts++;
      // The start position is re-taken from the pack centre for EACH group attempt, so a failed
      // group does not shift the next one.
      const result = this.spawnGroup(category, entry, state, startX, startY, startZ);
      for (const mob of result) spawned.push(mob);
    }
    return spawned;
  }

  /**
   * One group attempt: walk out from the pack centre placing one species.
   *
   * @returns {Array<object>} mobs placed
   */
  spawnGroup(category, entry, state, startX, startY, startZ) {
    const random = this.manager.random;
    const spawned = [];
    let x = startX;
    let z = startZ;
    const y = startY;

    // `Mth.ceil(nextFloat() * 4)` gives 0..4. It is a bound on POSITION ATTEMPTS, and it is replaced
    // by the drawn group size as soon as a species has been chosen.
    let maxAttempts = initialMemberAttempts(random);
    let chosen = null;
    let chosenResolved = null;

    for (let attempt = 0; attempt < maxAttempts && attempt < MAX_PACK_MEMBER_ATTEMPTS; attempt++) {
      this.stats.positionAttempts++;
      // Triangular offset from the PREVIOUS member's position, not from the centre.
      x += random.nextInt(PACK_OFFSET_HORIZONTAL) - random.nextInt(PACK_OFFSET_HORIZONTAL);
      z += random.nextInt(PACK_OFFSET_HORIZONTAL) - random.nextInt(PACK_OFFSET_HORIZONTAL);
      void PACK_OFFSET_VERTICAL;

      // The nearest player is resolved before any spawn RNG for the member, which is the vanilla
      // order and therefore part of RNG parity.
      const biomeId = this.biomeAt(x, y, z);

      if (!chosen) {
        // First legal attempt fixes the species for the whole group AND the final group size.
        chosenResolved = resolveSpawnList({
          biomeId, category, x, y, z, structureAt: this.manager.structureAt || null,
        });
        if (chosenResolved.entries.length === 0) {
          this.recordAttempt({
            category, rejected: SpawnRejection.NO_SPAWN_ENTRIES, x, y, z, biomeId,
            cx: entry.cx, cz: entry.cz,
          });
          // Vanilla BREAKS out of the attempt loop when the species lookup is empty.
          break;
        }
        // The reduced-water-ambient rejection: a 98% refusal in the tagged biomes, drawn BEFORE the
        // weighted pick.
        if (category === MobCategory.WATER_AMBIENT
          && this.manager.isReducedWaterAmbientBiome(biomeId)
          && random.nextFloat() < 0.98) {
          this.recordAttempt({
            category, rejected: SpawnRejection.WRONG_BIOME, x, y, z, biomeId,
            cx: entry.cx, cz: entry.cz, detail: 'REDUCED_WATER_AMBIENT_SPAWNS 98% rejection',
          });
          break;
        }
        chosen = selectWeightedEntry(chosenResolved.entries, random);
        if (!chosen) break;
        // Now the real group size replaces the 0..4 bound.
        maxAttempts = packSizeFor(chosen, random);
      }

      const mob = this.spawnMobAt(chosen.type, category, x + 0.5, y, z + 0.5, {
        state,
        playerIndex: state.ownerOf(entry.cx, entry.cz),
        biomeId,
        source: chosenResolved.source,
        structureId: chosenResolved.structureId,
        cx: entry.cx,
        cz: entry.cz,
        // The pack species and the list it was drawn from, so `spawnMobAt` can re-check membership at
        // THIS member's position.
        packSpecies: chosen.type,
        packEntries: chosenResolved.entries,
        packSource: chosenResolved.source,
      });
      if (!mob) continue;
      spawned.push(mob);

      // `getMaxSpawnClusterSize()` caps the whole spawnCategoryForPosition call, checked after each
      // successful spawn. This is where the wiki's "packs max out at 8 wolves/cod/tropical fish, 6
      // horses and donkeys, 4 for any other mob" comes from.
      if (spawned.length >= this.manager.maxSpawnClusterSize(chosen.type)) break;
    }

    if (spawned.length) {
      const type = chosen?.type || spawned[0].type;
      this.stats.spawnsByCategory[category] = (this.stats.spawnsByCategory[category] || 0) + spawned.length;
      this.stats.spawnsByMob[type] = (this.stats.spawnsByMob[type] || 0) + spawned.length;
    }
    return spawned;
  }

  /**
   * Choose the candidate Y for a column.
   *
   * `Mth.randomBetweenInclusive(random, level.getMinY(), surfaceY)`, i.e. a UNIFORM draw over the
   * whole column from the world floor up to and including one block above the surface:
   *
   *   x = minBlockX + nextInt(16)
   *   z = minBlockZ + nextInt(16)
   *   surfaceY = chunk.getHeight(WORLD_SURFACE, x, z) + 1
   *   y = randomBetweenInclusive(minY, surfaceY)
   *
   * This is THE rule that makes caves fill up: the overwhelming majority of attempts land below the
   * surface, so every cave cell in the column is reachable. It is also why a perimeter works and why
   * lower terrain spawns more -- the same draw is concentrated into fewer blocks.
   *
   * The common "half the time the heightmap, half a random Y below it" description is NOT this. The
   * classic "terrain height + 1" version leaves every cave empty, which is the bug this subsystem
   * exists to fix.
   *
   * @param {number} surfaceY the heightmap value PLUS ONE, as vanilla computes it
   * @param {object} random
   * @param {number} [minY] the world's minimum Y, 0 here
   */
  pickY(surfaceY, random, minY = 0) {
    const highest = Math.max(minY, surfaceY);
    const span = highest - minY + 1;
    return minY + random.nextInt(span);
  }

  /**
   * Place one mob after validating it.
   *
   * Generic validation first, then the mob's own placement predicate. The split is what lets the
   * debug overlay report `COLLISION` (a generic failure) separately from `MOB_PREDICATE_FAILED`
   * (a rule of the mob's).
   *
   * @returns {object|null} the created mob, or null when the position was refused
   */
  spawnMobAt(type, category, x, y, z, context = {}) {
    const { state, playerIndex, biomeId, source, cx, cz } = context;
    // Reassigned below when a pack member has walked into a different structure than its origin.
    let { structureId } = context;
    const world = this.world;
    const random = this.manager.random;

    const placement = spawnPlacementFor(type);
    const dims = this.manager.dimensionsFor(type);
    const yInt = Math.floor(y);

    // Per-member eligibility, checked BEFORE anything else because it is a rejection of the species
    // rather than of the position.
    //
    // Vanilla chooses the pack species once, at the position of the first successful attempt, and then
    // re-validates THAT SPECIES at each member's own position: "For later mob spawn attempts in the
    // pack, if the selected species cannot spawn at the location (e.g. due to being in a different
    // biome or structure) then that attempt fails." The member is not re-rolled and the species is not
    // clamped back into the origin biome.
    //
    // Without this, a pack that walked across a biome or structure boundary kept spawning its origin
    // species at the destination -- an ocean pack of cod marching onto land, or a swamp-hut witch
    // pack leaving the hut and continuing into the surrounding swamp.
    if (context.packSpecies && context.packSource !== 'structure_suppressed') {
      const atMember = resolveSpawnList({
        biomeId,
        category,
        x,
        y: yInt,
        z,
        structureAt: this.manager.structureAt || null,
      });
      const stillListed = atMember.entries.some(e => e.type === context.packSpecies);
      if (!stillListed) {
        this.recordAttempt({
          category, rejected: SpawnRejection.WRONG_BIOME, type, x, y: yInt, z, biomeId, cx, cz,
          detail: atMember.source === 'structure_suppressed'
            ? `pack species ${context.packSpecies} is suppressed by a structure at this position`
            : `pack species ${context.packSpecies} is not in the ${category} list at this position `
              + `(source ${atMember.source})`,
        });
        return null;
      }
      // The member may have walked into a different structure; its provenance must follow it.
      structureId = atMember.structureId;
      void source;
    }

    const generic = validateGenericSpawn({
      world,
      players: state.players,
      difficulty: this.difficulty,
      dimension: this.dimension,
      x, y: yInt, z,
      placement: placement.placement,
      mobType: type,
      width: dims.width,
      height: dims.height,
      requiresHostileDifficulty: !!CATEGORY_INFO[category]?.requiresHostileDifficulty,
      mobCanSpawnInDimension: this.manager.canSpawnInDimension(type),
      checkPlayerDistance: this.manager.checkPlayerDistance !== false,
      minPlayerDistance: this.manager.minPlayerDistance,
      maxPlayerDistance: maxDistanceForCategory(category, this.manager.maxPlayerDistance),
      isSolidAt: this.manager.boundIsSolidAt || this.manager.isSolidAt || null,
    });

    if (!generic.ok) {
      this.recordAttempt({
        category, rejected: generic.reason, type, x, y: yInt, z, biomeId, cx, cz, detail: generic.detail,
      });
      return null;
    }

    // The mob's own rules. A predicate that throws is a bug in the predicate, not a reason to abort
    // the spawn pass, so it is reported and treated as a refusal.
    if (placement.predicate) {
      let allowed = false;
      try {
        allowed = placement.predicate(this.predicateContext({
          world, x, y: yInt, z, biomeId, category, structureId, type,
        }));
      } catch (err) {
        this.recordAttempt({
          category, rejected: SpawnRejection.MOB_PREDICATE_FAILED, type, x, y: yInt, z, biomeId, cx, cz,
          detail: `predicate threw: ${err?.message || err}`,
        });
        return null;
      }
      if (!allowed) {
        this.recordAttempt({
          category, rejected: SpawnRejection.MOB_PREDICATE_FAILED, type, x, y: yInt, z, biomeId, cx, cz,
        });
        return null;
      }
    }

    const mob = this.manager.createMob(type, x, yInt, z, {
      natural: true, category, biomeId, source, structureId,
    });
    if (!mob) {
      this.recordAttempt({
        category, rejected: SpawnRejection.MOB_PREDICATE_FAILED, type, x, y: yInt, z, biomeId, cx, cz,
        detail: 'the engine could not construct this mob type',
      });
      return null;
    }

    state.noteSpawned(category, playerIndex);
    this.stats.spawns++;
    this.stats.spawnsByBiome[biomeId] = (this.stats.spawnsByBiome[biomeId] || 0) + 1;
    this.stats.spawnsBySource[source || 'biome'] = (this.stats.spawnsBySource[source || 'biome'] || 0) + 1;
    const record = {
      mob, type, category, source, biomeId, x, y: yInt, z, structureId,
    };
    this.recordAttempt({ category, rejected: null, type, x, y: yInt, z, biomeId, cx, cz, source });
    // Reported from here rather than from the pack loop so the record always carries the mob type and
    // the position it was actually placed at. A hook fed a partial record is a hook that silently
    // reports nothing, which is exactly how a light-rule investigation goes wrong.
    if (this.onSpawn) this.#emit(record);
    return mob;
  }

  /**
   * The context object every mob predicate receives.
   *
   * Assembled in one place so a new predicate cannot accidentally read a field the spawner forgot to
   * fill; every field a predicate may use is listed here.
   */
  predicateContext({ world, x, y, z, biomeId, category, structureId, type }) {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    return {
      world,
      x, y, z,
      type,
      category,
      biomeId,
      structureId,
      dimension: this.dimension,
      difficulty: this.difficulty,
      random: this.manager.random,
      blockAt: world.getVoxel(bx, y, bz),
      blockBelow: world.getVoxel(bx, y - 1, bz),
      skyLight: world.getSkyLight ? world.getSkyLight(bx, y, bz) : 0,
      blockLight: world.getBlockLight ? world.getBlockLight(bx, y, bz) : 0,
      skyDarken: this.manager.skyDarken,
      thunder: !!this.manager.thunder,
      isNight: !!this.manager.isNight,
      // The internal light level, which is what the passive (light >= 9) rule reads.
      lightLevel: world.getLightLevel
        ? world.getLightLevel(bx, y, bz, this.manager.skyDarken)
        : 0,
    };
  }

  /** The biome at a position, via the manager's cache. */
  biomeAt(x, y, z) {
    if (this.manager.biomeAt) return this.manager.biomeAt(x, y, z);
    return this.world.getBiome ? this.world.getBiome(Math.floor(x), Math.floor(z)) : 'plains';
  }

  get difficulty() {
    return this.manager.difficulty || Difficulty.NORMAL;
  }

  get dimension() {
    return this.world?.dimension || 'overworld';
  }

  /** Record the outcome of one attempt: counters plus a bounded ring for the overlay. */
  recordAttempt(attempt) {
    if (attempt.rejected) {
      this.stats.rejections[attempt.rejected] = (this.stats.rejections[attempt.rejected] || 0) + 1;
    }
    this.recentAttempts.unshift({ ...attempt, tick: this.tickCount });
    if (this.recentAttempts.length > this.maxRecentAttempts) this.recentAttempts.length = this.maxRecentAttempts;
  }

  #emit(record) {
    try {
      this.onSpawn(record);
    } catch {
      // A telemetry sink must never break spawning.
    }
  }

  /** A snapshot of the counters, for the debug overlay and telemetry. */
  telemetry() {
    const attempts = this.stats.positionAttempts;
    return {
      tickCount: this.tickCount,
      passes: this.stats.passes,
      chunkAttempts: this.stats.chunkAttempts,
      groupAttempts: this.stats.groupAttempts,
      positionAttempts: attempts,
      spawns: this.stats.spawns,
      successRate: attempts > 0 ? +(this.stats.spawns / attempts).toFixed(4) : null,
      rejections: { ...this.stats.rejections },
      spawnsByCategory: { ...this.stats.spawnsByCategory },
      spawnsByMob: { ...this.stats.spawnsByMob },
      spawnsByBiome: { ...this.stats.spawnsByBiome },
      lastMs: +this.stats.lastMs.toFixed(3),
      maxMs: +this.stats.maxMs.toFixed(3),
      averageMs: this.stats.passes > 0 ? +(this.stats.totalMs / this.stats.passes).toFixed(3) : 0,
      truncatedTicks: this.stats.truncatedTicks,
    };
  }

  /** Reset the counters, for a fresh telemetry window. */
  resetTelemetry() {
    this.stats.chunkAttempts = 0;
    this.stats.groupAttempts = 0;
    this.stats.positionAttempts = 0;
    this.stats.spawns = 0;
    this.stats.passes = 0;
    this.stats.totalMs = 0;
    this.stats.maxMs = 0;
    this.stats.truncatedTicks = 0;
    this.stats.rejections = Object.create(null);
    this.stats.spawnsByCategory = Object.create(null);
    this.stats.spawnsByBiome = Object.create(null);
    this.stats.spawnsByMob = Object.create(null);
    this.stats.spawnsBySource = Object.create(null);
    this.recentAttempts.length = 0;
  }
}

/**
 * The furthest a mob of this category may be placed from a player.
 *
 * Vanilla keeps fish (WATER_AMBIENT) inside 64 blocks and everything else inside 128. The
 * distinction is real and visible: an ocean's fish population is much tighter around the player than
 * its drowned population.
 */
export function maxDistanceForCategory(category, override) {
  if (Number.isFinite(override)) return override;
  return category === MobCategory.WATER_AMBIENT ? MAX_SPAWN_DISTANCE_FISH : MAX_SPAWN_DISTANCE;
}

/**
 * The heightmap a category's placement check uses.
 *
 * Aquatic mobs use OCEAN_FLOOR (the sea bed) and land mobs MOTION_BLOCKING_NO_LEAVES. This is
 * separate from the WORLD_SURFACE heightmap that chooses the pack centre's Y.
 */
export function heightmapForCategory(category) {
  switch (category) {
    case MobCategory.WATER_CREATURE:
    case MobCategory.WATER_AMBIENT:
    case MobCategory.UNDERGROUND_WATER_CREATURE:
    case MobCategory.AXOLOTLS:
      return HeightmapType.OCEAN_FLOOR;
    default:
      return HeightmapType.MOTION_BLOCKING_NO_LEAVES;
  }
}

/**
 * A stable signature of the player set, so the cached SpawnState can notice it changed.
 *
 * Includes the FULL position and the spectator flag, not only the chunk. The chunk alone is not
 * enough: a mob spawned at the edge of a player's 128-block sphere becomes out of range as the player
 * crosses the chunk, and a cached count taken before that would hold cap space for a mob the cap
 * rules no longer count. The signature is compared as a string, so an exact match means "nothing that
 * affects eligibility or the per-player counts has moved".
 */
function signatureOf(players) {
  let signature = '';
  for (const player of players) {
    signature += `${player.x},${player.y},${player.z},${player.chunkX},${player.chunkZ},${player.spectator ? 1 : 0};`;
  }
  return signature;
}

/** `performance.now()` where available, so this module works in Node tests too. */
function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

export { SpawnPlacementType, SpawnRejection, TICKS_PER_SECOND, CHUNK_HEIGHT };
