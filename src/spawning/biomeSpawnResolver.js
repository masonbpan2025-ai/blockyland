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

import {
  BIOME_SPAWN_TABLES,
  ENGINE_ONLY_BIOME_ALIASES,
  ENGINE_ONLY_BIOME_RUNTIME_ALIASES,
} from './vanillaBiomeSpawns.js';
import { ALL_MOB_CATEGORIES, MobCategory } from './mobCategories.js';

/**
 * Structure spawn overrides for Java Edition 1.21.4.
 *
 * Each entry says: inside this structure, the named category uses THIS list instead of the biome's.
 * A category not named keeps the biome's list. This is exactly the shape of a vanilla
 * `spawn_overrides` block -- `{ category: { bounding_box: 'piece'|'rigid', spawns: [...] } }` -- with
 * `boundingBox` retained because it changes behaviour: `PIECE` means only the structure's own pieces
 * (so an ocean monument's Drowned override does not extend into the water around it), while `RIGID`
 * means the whole structure's bounding box.
 *
 * Only structures the engine actually generates are listed; the rest are recorded in
 * docs/MOB_SPAWNING_PARITY.md as not-yet-present rather than silently absent.
 *
 * Weights and group sizes are the data pack's, not invented.
 */
export const STRUCTURE_SPAWN_OVERRIDES = Object.freeze({
  /** Nether fortress: the only source of wither skeletons, and blazes. */
  nether_fortress: {
    // The engine's structure id for a fortress; matched by name so a generator rename is visible.
    aliases: ['fortress', 'nether_fortress'],
    boundingBox: 'piece',
    categories: {
      [MobCategory.MONSTER]: [
        { type: 'blaze', weight: 10, minCount: 2, maxCount: 3 },
        { type: 'zombified_piglin', weight: 5, minCount: 4, maxCount: 4 },
        { type: 'wither_skeleton', weight: 8, minCount: 5, maxCount: 5 },
        { type: 'skeleton', weight: 2, minCount: 5, maxCount: 5 },
        { type: 'magma_cube', weight: 3, minCount: 4, maxCount: 4 },
      ],
    },
  },

  /** Ocean monument: guardians inside, in place of the biome's list. */
  ocean_monument: {
    aliases: ['monument', 'ocean_monument'],
    boundingBox: 'piece',
    categories: {
      [MobCategory.MONSTER]: [
        { type: 'guardian', weight: 1, minCount: 2, maxCount: 4 },
      ],
    },
  },

  /** Pillager outpost: illagers, and only illagers. */
  pillager_outpost: {
    aliases: ['outpost', 'pillager_outpost'],
    boundingBox: 'piece',
    categories: {
      [MobCategory.MONSTER]: [
        { type: 'pillager', weight: 1, minCount: 1, maxCount: 1 },
      ],
    },
  },

  /** Swamp hut: the witch inside, and the cat that is not a natural spawn. */
  swamp_hut: {
    aliases: ['swamp_hut', 'witch_hut'],
    boundingBox: 'piece',
    categories: {
      [MobCategory.MONSTER]: [
        { type: 'witch', weight: 1, minCount: 1, maxCount: 1 },
      ],
    },
  },

  /** Bastion remnant: piglins and hoglins, at higher weights than the biome gives them. */
  bastion_remnant: {
    aliases: ['bastion', 'bastion_remnant'],
    boundingBox: 'piece',
    categories: {
      [MobCategory.MONSTER]: [
        { type: 'piglin', weight: 10, minCount: 1, maxCount: 2 },
        { type: 'piglin_brute', weight: 5, minCount: 1, maxCount: 1 },
        { type: 'hoglin', weight: 2, minCount: 3, maxCount: 4 },
        { type: 'zombified_piglin', weight: 1, minCount: 2, maxCount: 4 },
      ],
    },
  },

  /**
   * Trial chambers.
   *
   * NOT an override that places mobs. The 1.21.4 data pack gives trial chambers (and ancient cities)
   * an override for ALL EIGHT categories with EMPTY lists, which is how a structure SUPPRESSES
   * natural spawning inside itself. Treating an empty list as "absent" and falling through to the
   * biome is a real behavioural bug: it would populate a trial chamber with the surrounding biome's
   * monsters, which is exactly what the empty lists exist to prevent.
   *
   * The chamber's own inhabitants come from TRIAL SPAWNER blocks, which is a separate mechanism (see
   * specialSpawners.js), not from the biome spawner.
   */
  trial_chambers: {
    aliases: ['trial_chambers'],
    boundingBox: 'piece',
    suppressesAll: true,
    categories: {},
  },

  /** Ancient city: the same full suppression, for the same reason. */
  ancient_city: {
    aliases: ['ancient_city'],
    boundingBox: 'full',
    suppressesAll: true,
    categories: {},
  },
});

/**
 * Resolve an engine biome id to the vanilla table it uses, following the alias maps.
 *
 * Returns null when the biome has no spawns at all (the void, or an id this engine does not know),
 * which callers must treat as "nothing may spawn here" rather than "use plains".
 */
export function resolveBiomeTable(biomeId) {
  if (!biomeId) return null;
  const clean = String(biomeId).toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (BIOME_SPAWN_TABLES[clean]) return BIOME_SPAWN_TABLES[clean];
  const runtimeAlias = ENGINE_ONLY_BIOME_RUNTIME_ALIASES[clean];
  if (runtimeAlias && BIOME_SPAWN_TABLES[runtimeAlias]) return BIOME_SPAWN_TABLES[runtimeAlias];
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
  const clean = String(id).toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (STRUCTURE_SPAWN_OVERRIDES[clean]) return { id: clean, ...STRUCTURE_SPAWN_OVERRIDES[clean] };
  for (const [key, override] of Object.entries(STRUCTURE_SPAWN_OVERRIDES)) {
    if (override.aliases?.includes(clean)) return { id: key, ...override };
  }
  return null;
}

/**
 * The spawn list that actually applies at a position.
 *
 * The structure's list wins for the categories it names; every other category falls through to the
 * biome. This is the single question the spawner asks, and the answer records WHERE it came from so
 * the debug overlay can show `STRUCTURE_OVERRIDE` rather than leaving the player to guess why a
 * blaze appeared in a soul sand valley.
 *
 * @param {object} context
 * @param {string} context.biomeId
 * @param {string} context.category
 * @param {number} context.x
 * @param {number} context.y
 * @param {number} context.z
 * @param {(x:number,y:number,z:number)=>string|null} [context.structureAt]
 * @returns {{entries: Array<object>, source: 'structure'|'biome'|'none', structureId: string|null}}
 */
export function resolveSpawnList({ biomeId, category, x, y, z, structureAt = null }) {
  const structure = findStructureOverride(structureAt, x, y, z);
  if (structure) {
    // A structure that overrides a category with an empty list SUPPRESSES natural spawning for it.
    // This is not the same as "no override": vanilla's `getMobsAt` reads the override map, and an
    // entry present with an empty list is an entry that returns nothing. Falling through to the biome
    // here would populate trial chambers and ancient cities, which those empty lists exist to stop.
    if (structure.suppressesAll || Object.prototype.hasOwnProperty.call(structure.categories, category)) {
      const entries = structure.categories[category] || [];
      return { entries, source: entries.length ? 'structure' : 'structure_suppressed', structureId: structure.id };
    }
    // The structure exists but does not override this category: fall through to the biome, which is
    // what `getMobsAt` does.
  }
  const entries = biomeSpawnsFor(biomeId, category);
  if (entries.length) return { entries, source: 'biome', structureId: structure?.id || null };
  return { entries: [], source: 'none', structureId: structure?.id || null };
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
