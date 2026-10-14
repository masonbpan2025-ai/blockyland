// Village chest loot.
//
// A village house chest is a real loot table in vanilla (`chests/village/village_<biome>_house`). This repository
// has no loot-table engine for chests, so the tables are written out here by hand from the wiki's description of
// what village chests hold: bread, crops and seeds, saplings, apples, and the occasional iron, gold or emerald.
// The weights are an approximation and the file says so, rather than claiming vanilla's exact numbers.
//
// Deterministic: the same chest at the same place in the same world always holds the same items, which is what
// lets a world be regenerated from its seed without a village's chests changing.

const COMMON = [
  ['bread', 5, 1, 4], ['potato', 5, 1, 7], ['carrot', 4, 1, 4], ['wheat', 6, 1, 6], ['apple', 4, 1, 5],
  ['wheat_seeds', 5, 1, 7], ['iron_ingot', 2, 1, 3], ['gold_nugget', 1, 1, 3], ['emerald', 1, 1, 2], ['bone', 2, 1, 3]
];

/** Per-biome additions: what each village's own materials and crops put in its chests. */
const TABLES = {
  'minecraft:chests/village/village_plains_house': [...COMMON, ['oak_sapling', 5, 1, 2], ['dandelion', 1, 1, 1], ['poppy', 1, 1, 1], ['beetroot_seeds', 2, 1, 4]],
  'minecraft:chests/village/village_desert_house': [...COMMON, ['melon_seeds', 3, 1, 4], ['cactus', 2, 1, 4], ['dead_bush', 2, 1, 3]],
  'minecraft:chests/village/village_savanna_house': [...COMMON, ['acacia_sapling', 5, 1, 2], ['melon_seeds', 3, 1, 4], ['tall_grass', 1, 1, 1]],
  'minecraft:chests/village/village_snowy_house': [...COMMON, ['spruce_sapling', 5, 1, 2], ['snowball', 2, 1, 3], ['blue_ice', 1, 1, 1]],
  'minecraft:chests/village/village_taiga_house': [...COMMON, ['spruce_sapling', 5, 1, 2], ['pumpkin_seeds', 3, 1, 4], ['sweet_berries', 3, 1, 4], ['fern', 1, 1, 1]]
};

/** A small deterministic generator, so loot is a pure function of the seed. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A position hashed to a seed, so each chest is its own stream. */
export function lootSeedFor(x, y, z, worldSeed = 0) {
  let h = (worldSeed | 0) ^ 0x9E3779B9;
  for (const v of [x, y, z]) h = Math.imul(h ^ (v | 0), 0x85EBCA6B) ^ (h >>> 13);
  return h >>> 0;
}

/**
 * Roll a village chest.
 *
 * @param {string} table  a `minecraft:chests/village/...` id
 * @param {number} seed   from `lootSeedFor`
 * @returns {Array<{id: string, isBlock: boolean, count: number}>} stacks, at most one per slot
 */
export function rollVillageLoot(table, seed) {
  const entries = TABLES[table];
  if (!entries) return [];
  const random = mulberry32(seed);
  const rolls = 3 + Math.floor(random() * 4); // 3 to 6 stacks
  const totalWeight = entries.reduce((sum, entry) => sum + entry[1], 0);
  const out = [];
  for (let i = 0; i < rolls; i++) {
    let pick = random() * totalWeight;
    let chosen = entries[0];
    for (const entry of entries) { pick -= entry[1]; if (pick <= 0) { chosen = entry; break; } }
    const [id, , min, max] = chosen;
    const count = min + Math.floor(random() * (max - min + 1));
    const existing = out.find((stack) => stack.id === id);
    if (existing) existing.count += count;
    else out.push({ id, isBlock: false, count });
  }
  return out;
}

export const VILLAGE_LOOT_TABLES = Object.keys(TABLES);
