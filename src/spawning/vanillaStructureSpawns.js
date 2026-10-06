// GENERATED FILE - do not edit by hand.
//
// Vanilla structure spawn overrides for Minecraft Java Edition 1.21.4.
//
// Produced by scripts/generate-mob-spawn-data.mjs from misode/mcmeta branch `1.21.4-data`, which
// mirrors the vanilla data pack. Each structure's `spawn_overrides` block is reproduced verbatim,
// with entity ids mapped to this engine's mob-type ids and category keys preserved.
//
// THREE CASES, and the resolver depends on telling them apart:
//
//   1. a structure has NO `categories` entry for a category  -> the biome's list applies
//   2. it has an entry with a non-empty `entries` array      -> that list REPLACES the biome's
//   3. it has an entry with an EMPTY `entries` array          -> natural spawning for that category
//                                                                is SUPPRESSED
//
// Case 3 is not the same as case 1. Trial chambers and ancient cities give all eight categories an
// empty list precisely to stop natural spawning inside themselves, so folding them together
// populates them with the surrounding biome's monsters.
//
// `boundingBox` is vanilla's `bounding_box` value ('piece' or 'full'), recorded because it changes
// the scope of the override. It is currently advisory: see docs/MOB_SPAWNING_PARITY.md.
//
// Regenerate with:
//   node scripts/generate-mob-spawn-data.mjs

/**
 * Per-structure spawn overrides, keyed by this engine's structure id.
 *
 * A structure absent from this map has no override at all. A structure present with an empty
 * `categories` object was checked and has `spawn_overrides: {}` upstream -- it does not suppress
 * anything, it simply has nothing to say.
 */
export const STRUCTURE_SPAWN_OVERRIDES = {
  ancient_city: {
    sourceId: 'minecraft:ancient_city',
    dimension: 'overworld',
    categories: {
      ambient: {
        boundingBox: 'full',
        entries: [
        ],
      },
      axolotls: {
        boundingBox: 'full',
        entries: [
        ],
      },
      creature: {
        boundingBox: 'full',
        entries: [
        ],
      },
      misc: {
        boundingBox: 'full',
        entries: [
        ],
      },
      monster: {
        boundingBox: 'full',
        entries: [
        ],
      },
      underground_water_creature: {
        boundingBox: 'full',
        entries: [
        ],
      },
      water_ambient: {
        boundingBox: 'full',
        entries: [
        ],
      },
      water_creature: {
        boundingBox: 'full',
        entries: [
        ],
      },
    },
  },
  bastion_remnant: {
    sourceId: 'minecraft:bastion_remnant',
    dimension: 'nether',
    categories: {
    },
  },
  end_city: {
    sourceId: 'minecraft:end_city',
    dimension: 'the_end',
    categories: {
    },
  },
  nether_fortress: {
    sourceId: 'minecraft:fortress',
    dimension: 'nether',
    categories: {
      monster: {
        boundingBox: 'piece',
        entries: [
        { type: 'blaze', weight: 10, minCount: 2, maxCount: 3 },
        { type: 'zombified_piglin', weight: 5, minCount: 4, maxCount: 4 },
        { type: 'wither_skeleton', weight: 8, minCount: 5, maxCount: 5 },
        { type: 'skeleton', weight: 2, minCount: 5, maxCount: 5 },
        { type: 'magma_cube', weight: 3, minCount: 4, maxCount: 4 },
        ],
      },
    },
  },
  ocean_monument: {
    sourceId: 'minecraft:monument',
    dimension: 'overworld',
    categories: {
      axolotls: {
        boundingBox: 'full',
        entries: [
        ],
      },
      monster: {
        boundingBox: 'full',
        entries: [
        { type: 'guardian', weight: 1, minCount: 2, maxCount: 4 },
        ],
      },
      underground_water_creature: {
        boundingBox: 'full',
        entries: [
        ],
      },
    },
  },
  pillager_outpost: {
    sourceId: 'minecraft:pillager_outpost',
    dimension: 'overworld',
    categories: {
      monster: {
        boundingBox: 'full',
        entries: [
        { type: 'pillager', weight: 1, minCount: 1, maxCount: 1 },
        ],
      },
    },
  },
  swamp_hut: {
    sourceId: 'minecraft:swamp_hut',
    dimension: 'overworld',
    categories: {
      creature: {
        boundingBox: 'piece',
        entries: [
        { type: 'cat', weight: 1, minCount: 1, maxCount: 1 },
        ],
      },
      monster: {
        boundingBox: 'piece',
        entries: [
        { type: 'witch', weight: 1, minCount: 1, maxCount: 1 },
        ],
      },
    },
  },
  trial_chambers: {
    sourceId: 'minecraft:trial_chambers',
    dimension: 'overworld',
    categories: {
      ambient: {
        boundingBox: 'piece',
        entries: [
        ],
      },
      axolotls: {
        boundingBox: 'piece',
        entries: [
        ],
      },
      creature: {
        boundingBox: 'piece',
        entries: [
        ],
      },
      misc: {
        boundingBox: 'piece',
        entries: [
        ],
      },
      monster: {
        boundingBox: 'piece',
        entries: [
        ],
      },
      underground_water_creature: {
        boundingBox: 'piece',
        entries: [
        ],
      },
      water_ambient: {
        boundingBox: 'piece',
        entries: [
        ],
      },
      water_creature: {
        boundingBox: 'piece',
        entries: [
        ],
      },
    },
  },
};

/**
 * Structures that suppress EVERY category with empty lists.
 *
 * Derived from the data rather than annotated by hand: a structure whose every category entry has an
 * empty `entries` array is a structure that wants no natural spawning inside it.
 */
export const STRUCTURE_FULLY_SUPPRESSING = Object.freeze(
  Object.entries(STRUCTURE_SPAWN_OVERRIDES)
    .filter(([, row]) => {
      const cats = Object.entries(row.categories);
      return cats.length > 0 && cats.every(([, spec]) => spec.entries.length === 0);
    })
    .map(([id]) => id)
    .sort()
);

/** Every mob type that appears in any structure override, for the coverage test. */
export const STRUCTURE_SPAWN_MOB_TYPES = Object.freeze(["blaze","cat","guardian","magma_cube","pillager","skeleton","witch","wither_skeleton","zombified_piglin"]);
