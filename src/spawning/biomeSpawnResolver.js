// Resolving "what may spawn here" from a biome, a position, and any structure override.
//
// Why this is separate from the spawner.
//
// Vanilla asks two different questions that look like one:
//
//   1. Which mobs may spawn in this CATEGORY at this POSITION?  -- `getMobsAt`
//   2. Which mobs may spawn in this BIOME at all?               -- the biome's spawners block
//
// The first consults a structure's spawn override list and falls back to the biome; the second is
// used by chunk-generation spawning, which places animals before any structure is relevant. Keeping
// both, and the fallback between them, in one module is what stops the two drifting apart -- and it
// gives the debug overlay a single place to ask "why this mob and not another".
//
// Reference: Minecraft Wiki "Spawn" and "Structure"; misode/mcmeta 1.21.4-data for the biome tables
// and the structure `spawn_overrides` blocks. Behaviour reimplemented; no Mojang source copied.

import { packBiomeSpawnsFor } from './packBiomeSpawns.js';
import {
  BIOME_SPAWN_TABLES,
  ENGINE_ONLY_BIOME_ALIASES,
  ENGINE_ONLY_BIOME_RUNTIME_ALIASES,
} from './vanillaBiomeSpawns.js';
import {
  STRUCTURE_SPAWN_OVERRIDES,
  STRUCTURE_FULLY_SUPPRESSING,
} from './vanillaStructureSpawns.js';
import { ALL_MOB_CATEGORIES, MobCategory } from './mobCategories.js';

export { STRUCTURE_SPAWN_OVERRIDES, STRUCTURE_FULLY_SUPPRESSING };

/**
 * Engine structure id -> the structures whose override applies.
 *
 * The generated table is authoritative; this map only translates between the many names an engine
 * structure may be registered under and the single generated id. Keeping it as an alias map rather
 * than a second data table is deliberate: a missing alias makes an override silently not apply, which
 * is visible in the tests, whereas a duplicated table drifts invisibly.
 */
const ENGINE_STRUCTURE_ALIASES = {
  fortress: 'nether_fortress',
  nether_fortress: 'nether_fortress',
  monument: 'ocean_monument',
  ocean_monument: 'ocean_monument',
  outpost: 'pillager_outpost',
  pillager_outpost: 'pillager_outpost',
  swamp_hut: 'swamp_hut',
  witch_hut: 'swamp_hut',
  trial_chambers: 'trial_chambers',
  ancient_city: 'ancient_city',
  bastion: 'bastion_remnant',
  bastion_remnant: 'bastion_remnant',
  end_city: 'end_city',
};

/** Lower-case and underscore a raw structure id so engine spellings all match. */
function normaliseStructureId(raw) {
  return String(raw).toLowerCase().replace(/^minecraft:/, '').replace(/[\s-]+/g, '_');
}

/** Resolve any structure id spelling to a generated override, or null. */
function generatedOverrideFor(raw) {
  const clean = normaliseStructureId(raw);
  const key = ENGINE_STRUCTURE_ALIASES[clean] || clean;
  return STRUCTURE_SPAWN_OVERRIDES[key] ? { id: key, ...STRUCTURE_SPAWN_OVERRIDES[key] } : null;
}

/**
 * Structures whose spawn list is hard-coded rather than data-driven.
 *
 * The Nether fortress is the one case in 1.21.4: vanilla short-circuits to
 * `NetherFortressStructure.FORTRESS_ENEMIES` and additionally requires nether bricks below the
 * position, rather than going through the biome/override path. Reproducing that needs a check the data
 * pack cannot express, so it is recorded here as a named special case with its condition, and the
 * parity document lists it as a deviation -- the JSON override is used instead of the hard-coded list.
 */
export const STRUCTURE_SPECIAL_CASES = Object.freeze({
  nether_fortress: {
    /** Vanilla requires nether bricks directly below the candidate. */
    requiresBlockBelow: 'nether_bricks',
    note: 'vanilla uses a hard-coded FORTRESS_ENEMIES list plus a nether-bricks-below test; this '
      + 'implementation uses the structure JSON override without the block requirement.',
  },
});

/**
 * Resolve an engine biome id to the spawn table it uses, following the alias maps.
 *
 * A DATA PACK'S TABLE WINS over the baked one, and wins entirely -- the baked table is not merged in. A pack
 * that writes a biome's `spawners` writes the whole block, and unioning would make it impossible to REMOVE a
 * spawn by omitting it. This check is the line that makes a pack change what actually spawns; without it a
 * pack could override every biome's spawners and the game would go on spawning exactly what it did before.
 *
 * Returns null when the biome has no spawns at all (the void, or an id this engine does not know),
 * which callers must treat as "nothing may spawn here" rather than "use plains".
 */
export function resolveBiomeTable(biomeId) {
  if (!biomeId) return null;
  const clean = String(biomeId).toLowerCase().trim().replace(/[\s-]+/g, '_');
  const packed = packBiomeSpawnsFor(clean);
  if (packed) return packed;
  if (BIOME_SPAWN_TABLES[clean]) return BIOME_SPAWN_TABLES[clean];
  const runtimeAlias = ENGINE_ONLY_BIOME_RUNTIME_ALIASES[clean];
  if (runtimeAlias) {
    // The alias is followed on the PACK side too, so a pack that overrides the vanilla name of an
    // engine-only biome still reaches it.
    const aliased = packBiomeSpawnsFor(runtimeAlias);
    if (aliased) return aliased;
    if (BIOME_SPAWN_TABLES[runtimeAlias]) return BIOME_SPAWN_TABLES[runtimeAlias];
  }
  // The generation-time aliases already have their own table copied in, so reaching here means the
  // alias map and the tables disagree -- which is a bug, not a data gap.
  if (ENGINE_ONLY_BIOME_ALIASES[clean]) return BIOME_SPAWN_TABLES[clean] || null;
  return null;
}

/**
 * The spawn list for a category in a biome, or an empty array.
 *
 * Always returns an array so a caller can iterate without a null check; an empty array means "this
 * biome does not spawn this category", which for e.g. `creature` in an ocean is correct.
 */
export function biomeSpawnsFor(biomeId, category) {
  const table = resolveBiomeTable(biomeId);
  if (!table) return [];
  return table[category] || [];
}

/**
 * The structure override covering a position, or null.
 *
 * `structureAt` is a predicate the caller supplies -- `(x, y, z) => structureId | null` -- so this
 * module does not have to know how the engine stores its structures. That keeps the resolver usable
 * from tests with a one-line stub and from the game with the structure index.
 */
export function findStructureOverride(structureAt, x, y, z) {
  if (typeof structureAt !== 'function') return null;
  let id = null;
  try {
    id = structureAt(x, y, z);
  } catch {
    // A structure index that throws must not abort a spawn pass over the whole world.
    return null;
  }
  if (!id) return null;
  return generatedOverrideFor(id);
}

/**
 * The spawn list that actually applies at a position.
 *
 * Three cases, and the resolver must tell them apart -- this is the trap the plan names:
 *
 *   1. the structure names no entry for this category  -> the BIOME's list applies
 *   2. it names entries                                -> that list REPLACES the biome's
 *   3. it names an EMPTY list                          -> natural spawning is SUPPRESSED
 *
 * Case 3 is not case 1. Trial chambers and ancient cities give all eight categories an empty list
 * precisely to stop natural spawning inside themselves, so falling through to the biome there would
 * fill them with the surrounding biome's monsters. `STRUCTURE_FULLY_SUPPRESSING` is derived from the
 * generated data rather than annotated by hand.
 *
 * @param {object} context
 * @param {string} context.biomeId
 * @param {string} context.category
 * @param {number} context.x
 * @param {number} context.y
 * @param {number} context.z
 * @param {(x:number,y:number,z:number)=>string|null} [context.structureAt]
 * @returns {{entries: Array<object>, source: 'structure'|'structure_suppressed'|'biome'|'none',
 *            structureId: string|null, boundingBox: string|null}}
 */
export function resolveSpawnList({ biomeId, category, x, y, z, structureAt = null }) {
  const structure = findStructureOverride(structureAt, x, y, z);
  if (structure) {
    const spec = structure.categories[category];
    if (spec) {
      // Case 2 or 3: the structure has something to say about this category.
      return {
        entries: spec.entries,
        source: spec.entries.length ? 'structure' : 'structure_suppressed',
        structureId: structure.id,
        boundingBox: spec.boundingBox ?? null,
      };
    }
    // Case 1: the structure exists here but is silent about this category.
  }
  const entries = biomeSpawnsFor(biomeId, category);
  if (entries.length) {
    return {
      entries, source: 'biome', structureId: structure?.id || null, boundingBox: null,
    };
  }
  return {
    entries: [], source: 'none', structureId: structure?.id || null, boundingBox: null,
  };
}

/**
 * The biome table used by chunk-generation spawning, which places one CREATURE group per chunk
 * before any structure exists.
 *
 * Vanilla's `spawnMobsForChunkGeneration` uses `getMobsAt` with the chunk's center biome and the
 * CREATURE category, then spawns one group. This returns the same list, and separately exposes
 * whether the biome has any spawns at all so the caller can skip the work.
 */
export function chunkGenerationSpawns(biomeId, category = MobCategory.CREATURE) {
  return biomeSpawnsFor(biomeId, category);
}

/** Every category a biome can spawn, in the vanilla iteration order. */
export function populatedCategories(biomeId) {
  const table = resolveBiomeTable(biomeId);
  if (!table) return [];
  return ALL_MOB_CATEGORIES.filter(category => (table[category] || []).length > 0);
}

/**
 * Total weight of a spawn list, for the weighted selection and for tests that assert a distribution.
 */
export function totalWeight(entries) {
  let sum = 0;
  for (const entry of entries) sum += Math.max(0, entry.weight | 0);
  return sum;
}

/**
 * Pick a spawn entry from `entries` by weight, drawing from a `java.util.Random`-compatible source.
 *
 * Vanilla's `WeightedRandom.getRandomItem`: draw `nextInt(totalWeight)`, then walk the list
 * subtracting each weight until the running total exceeds the draw. Reproduced exactly, including
 * the draw being in `[0, totalWeight)`, so a seeded run picks the same entry Minecraft would.
 *
 * Returns null for an empty list or a total weight of zero, which is a data error the caller
 * reports rather than treating as "spawn nothing quietly".
 */
export function selectWeightedEntry(entries, random) {
  if (!entries || entries.length === 0) return null;
  const total = totalWeight(entries);
  if (total <= 0) return null;
  let draw = random.nextInt(total);
  for (const entry of entries) {
    draw -= Math.max(0, entry.weight | 0);
    if (draw < 0) return entry;
  }
  // Unreachable unless a weight is negative, which `totalWeight` already clamps to zero. Returning
  // the last entry rather than null keeps a malformed table from stopping all spawning.
  return entries[entries.length - 1];
}

/**
 * How many members a pack of `entry` should have.
 *
 * Vanilla picks `minCount + nextInt(1 + maxCount - minCount)`, i.e. inclusive of both ends. Some
 * data pack entries have maxCount below minCount (`{minCount: 4, maxCount: 1}` appears for
 * endermen); vanilla clamps that to minCount, and so does this.
 */
export function packSizeFor(entry, random) {
  const min = Math.max(1, entry.minCount | 0);
  const max = Math.max(min, entry.maxCount | 0);
  return min + random.nextInt(max - min + 1);
}
