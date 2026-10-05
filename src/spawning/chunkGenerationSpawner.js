// Chunk-generation spawning: the CREATURE groups placed as terrain is generated.
//
// Why this is a SEPARATE system from `NaturalSpawner`, and not a special case inside it.
//
// The two look similar and share a biome table, and they are otherwise unrelated:
//
//   | | Chunk generation | Runtime cycle |
//   |---|---|---|
//   | when | once, as the chunk is generated | every tick, forever |
//   | cap | ignored | enforced |
//   | spawn costs | ignored | enforced |
//   | structure overrides | ignored | applied |
//   | biome source | the chunk's north-west corner at max height | the position's biome |
//   | Y per member | recomputed per member | constant for the whole pack |
//   | position | snapped to the column top | a uniform draw over the whole column |
//
// Conflating them is a real failure mode: it makes animals appear at the runtime mob-cap numbers
// (so a new chunk is instantly full of cows) and makes the runtime cycle obey the generation
// probability (so nothing spawns at all). The task's requirement to keep them separate is the same
// requirement Minecraft's own code structure expresses.
//
// Reference: docs/mob-spawning-spec-1.21.4.md section 11, and the wiki's "Mob spawning on chunk
// generation" section. Behaviour reimplemented; no Mojang source copied.

import { CHUNK_HEIGHT, CHUNK_SIZE_X, CHUNK_SIZE_Z } from './lightEngine.js';
import { MobCategory } from './mobCategories.js';
import { packSizeFor, selectWeightedEntry, biomeSpawnsFor } from './biomeSpawnResolver.js';
import { HeightmapType, SpawnPlacementType, spawnPlacementFor } from './spawnPlacements.js';
import { heightAt, isPeaceful } from './spawnValidation.js';

/**
 * Per-biome probability that a chunk-generation pass places any creatures at all.
 *
 * Vanilla's `creature_spawn_probability`, which most biomes leave at the default 0.1. The five
 * non-default values are data, quoted here rather than derived, because getting them wrong changes
 * how populated badlands and snowy plains are.
 */
export const CREATURE_SPAWN_PROBABILITY = Object.freeze({
  badlands: 0.03,
  eroded_badlands: 0.03,
  wooded_badlands: 0.04,
  snowy_plains: 0.07,
  ice_spikes: 0.07,
});
export const DEFAULT_CREATURE_SPAWN_PROBABILITY = 0.1;

/**
 * How many position attempts each member of a generation pack gets.
 *
 * Vanilla: "Up to four attempts to find a valid position are made per pack member".
 */
export const GENERATION_MEMBER_ATTEMPTS = 4;

/** Triangular horizontal offset spread around the pack centre, matching the runtime cycle's shape. */
export const GENERATION_OFFSET_SPREAD = 5;

/**
 * Populates new chunks with animals.
 *
 * Driven by the game when a chunk is generated, not by the tick loop. The engine generates a chunk in
 * `World.getOrCreateChunk`, which is called both by the streamer and by several synchronous paths
 * (the world start, `placePlayerOnSurface`'s padding); `onChunkGenerated` is therefore idempotent and
 * tracks the chunks it has already populated, because a chunk must never be populated twice. Without
 * that guard, the streamer's border ring and the world-start burst would produce animals in the same
 * chunk repeatedly.
 */
export class ChunkGenerationSpawner {
  /**
   * @param {object} options
   * @param {object} options.mobSpawnManager
   */
  constructor({ mobSpawnManager } = {}) {
    this.manager = mobSpawnManager;
    /** Chunk keys already populated, so a chunk is never populated twice. */
    this.populated = new Set();
    this.stats = {
      chunksConsidered: 0,
      chunksPopulated: 0,
      packs: 0,
      mobs: 0,
      lastMs: 0,
      skipped: 0,
    };
  }

  get world() {
    return this.manager?.world ?? null;
  }

  /** Was this chunk already populated? */
  hasPopulated(cx, cz) {
    return this.populated.has(`${cx},${cz}`);
  }

  /** Forget every recorded chunk, as a world reseed must. */
  reset() {
    this.populated.clear();
  }

  /**
   * Populate one chunk, if it has not been populated already.
   *
   * @param {number} cx
   * @param {number} cz
   * @returns {number} how many mobs were placed
   */
  onChunkGenerated(cx, cz) {
    const key = `${cx},${cz}`;
    if (this.populated.has(key)) return 0;
    const world = this.world;
    if (!world) return 0;
    this.populated.add(key);
    this.stats.chunksConsidered++;

    // Vanilla gates the whole pass on `doMobSpawning` and skips it on PEACEFUL for hostile types.
    // Generation spawning is CREATURE only, which Peaceful allows.
    if (isPeaceful(this.manager.difficulty)) {
      // Animals still generate on Peaceful; recorded so the counter is honest.
    }

    const started = now();
    const placed = this.populateChunk(cx, cz);
    this.stats.lastMs = now() - started;
    return placed;
  }

  /**
   * The population pass itself.
   *
   * Vanilla uses the biome of the chunk's NORTH-WEST CORNER at maximum world height for every
   * decision, not the biome at each spawn position. That is why a chunk straddling two biomes
   * generates only one of them, and it is reproduced here deliberately.
   */
  populateChunk(cx, cz) {
    const world = this.world;
    const random = this.manager.random;
    const baseX = cx * CHUNK_SIZE_X;
    const baseZ = cz * CHUNK_SIZE_Z;

    const biomeId = world.getBiome
      ? world.getBiome(baseX, baseZ)
      : 'plains';
    const entries = biomeSpawnsFor(biomeId, MobCategory.CREATURE);
    if (entries.length === 0) return 0;

    const probability = CREATURE_SPAWN_PROBABILITY[biomeId] ?? DEFAULT_CREATURE_SPAWN_PROBABILITY;
    let placed = 0;
    let packs = 0;

    // The loop runs until the probability check fails BEFORE an iteration, so zero or more packs.
    // More than one pack per chunk is possible and is vanilla behaviour: a lucky chunk can be
    // populated twice over.
    let guard = 0;
    while (random.nextDouble() < probability && guard++ < 16) {
      const entry = selectWeightedEntry(entries, random);
      if (!entry) break;
      packs++;
      const packSize = packSizeFor(entry, random);
      // The pack centre is a random column in the chunk.
      const centreX = baseX + random.nextInt(CHUNK_SIZE_X);
      const centreZ = baseZ + random.nextInt(CHUNK_SIZE_Z);
      let x = centreX;
      let z = centreZ;

      for (let member = 0; member < packSize; member++) {
        if (member > 0) {
          x += random.nextInt(GENERATION_OFFSET_SPREAD * 2 + 1) - GENERATION_OFFSET_SPREAD;
          z += random.nextInt(GENERATION_OFFSET_SPREAD * 2 + 1) - GENERATION_OFFSET_SPREAD;
        }
        const mob = this.placeGenerationMember(entry.type, x, z, cx, cz, biomeId);
        if (mob) placed++;
      }
    }

    if (placed > 0) {
      this.stats.chunksPopulated++;
      this.stats.packs += packs;
      this.stats.mobs += placed;
    } else {
      this.stats.skipped++;
    }
    return placed;
  }

  /**
   * Place one generated animal.
   *
   * The differences from the runtime cycle, all deliberate:
   *  - Y is recomputed per member from the column, using the mob's OWN heightmap, rather than being
   *    fixed for the pack;
   *  - the position is tried up to four times with fresh offsets;
   *  - the chunk bounds are enforced (vanilla nudges a mob wider than a block inwards);
   *  - no cap, no spawn cost, no structure override.
   */
  placeGenerationMember(type, x, z, cx, cz, biomeId) {
    const world = this.world;
    const random = this.manager.random;
    const placement = spawnPlacementFor(type);
    const dims = this.manager.dimensionsFor(type);

    for (let attempt = 0; attempt < GENERATION_MEMBER_ATTEMPTS; attempt++) {
      const px = attempt === 0 ? x : x + random.nextInt(GENERATION_OFFSET_SPREAD * 2 + 1) - GENERATION_OFFSET_SPREAD;
      const pz = attempt === 0 ? z : z + random.nextInt(GENERATION_OFFSET_SPREAD * 2 + 1) - GENERATION_OFFSET_SPREAD;
      // Keep the box inside the chunk: a 0.9-wide mob spawned at the very edge would straddle it.
      const half = dims.width / 2;
      const minX = cx * CHUNK_SIZE_X + Math.floor(half);
      const maxX = cx * CHUNK_SIZE_X + CHUNK_SIZE_X - 1 - Math.floor(half);
      const minZ = cz * CHUNK_SIZE_Z + Math.floor(half);
      const maxZ = cz * CHUNK_SIZE_Z + CHUNK_SIZE_Z - 1 - Math.floor(half);
      const bx = Math.min(maxX, Math.max(minX, px));
      const bz = Math.min(maxZ, Math.max(minZ, pz));

      // Snap to the top of the column using the mob's own placement heightmap.
      const heightmap = placement.placement === SpawnPlacementType.IN_WATER
        ? HeightmapType.OCEAN_FLOOR
        : HeightmapType.WORLD_SURFACE;
      const top = heightAt(world, bx, bz, heightmap);
      const y = Math.min(CHUNK_HEIGHT - 2, top + 1);

      if (!this.generationPredicateAllows(type, placement, bx, y, bz, biomeId)) continue;

      const mob = this.manager.createMob(type, bx + 0.5, y, bz + 0.5, {
        natural: false,
        category: MobCategory.CREATURE,
        biomeId,
        source: 'chunk_generation',
        structureId: null,
      });
      if (mob) {
        // Vanilla: mobs generated with a structure do not despawn on their own. A chunk-generation
        // animal is not a structure mob, but the wiki is explicit that generation-spawned creatures
        // are not removed by the normal distance rule while the player is nearby, and the engine's
        // `Animal` rules already cover that. Marked so telemetry can tell the two apart.
        mob.spawnSource = 'chunk_generation';
        return mob;
      }
    }
    return null;
  }

  /** Run the mob's own predicate, if it has one, and the generic floor/fluid checks. */
  generationPredicateAllows(type, placement, x, y, z, biomeId) {
    const world = this.world;
    if (!placement.predicate) return true;
    try {
      return placement.predicate(this.manager.naturalSpawner.predicateContext({
        world, x, y, z, biomeId, category: MobCategory.CREATURE, structureId: null, type,
      }));
    } catch {
      return false;
    }
  }
}

/** `performance.now()` where available, so this module works in Node tests too. */
function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}
