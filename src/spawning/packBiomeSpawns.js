// Biome spawn tables supplied by a data pack.
//
// The engine's natural spawning reads `vanillaBiomeSpawns.js`, a GENERATED table baked into the build from
// the vanilla data pack. That table is the default, and until this module existed nothing could change it: a
// data pack could override a biome's `spawners` and the game would go on spawning exactly what the baked
// table said. A pack that adds monsters to a biome, or removes them, had no effect at all.
//
// This is the override layer, and it is deliberately tiny and dependency-free so BOTH sides can import it
// without a cycle: the resolver reads it on the spawn path, and `dataPackRuntime` writes it when a pack is
// applied. It holds no state of its own beyond the map, so `resetPackBiomeSpawns` restores a clean engine.
//
// The shapes line up almost exactly. Vanilla writes:
//
//     "spawners": { "monster": [ { "type": "minecraft:zombie", "weight": 95, "minCount": 4, "maxCount": 4 } ] }
//
// and the engine's baked table is `{ monster: [ { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 } ] }`.
// The only difference is the `minecraft:` prefix, which is stripped here.

/**
 * Biome id -> spawn table, for biomes a pack has overridden.
 *
 * A biome present here REPLACES its baked table entirely rather than merging with it. That is what a data
 * pack means: a pack that writes a biome's `spawners` writes the whole block, and vanilla does not union it
 * with the default. Merging would make it impossible to REMOVE a spawn by omitting it.
 */
export const PACK_BIOME_SPAWNS = new Map();

/**
 * Biome id -> the name of the pack that supplied the table.
 *
 * Kept separately rather than wrapped around the table, so every existing reader of `PACK_BIOME_SPAWNS` and
 * `packBiomeSpawnsFor` keeps working. "Which pack gave this biome its spawners" is the first question when a
 * world spawns something unexpected, and the answer is not recoverable from the table itself.
 */
export const PACK_BIOME_SPAWN_SOURCES = new Map();

/** The pack that supplied a biome's spawn table, or null when the baked table applies. */
export function packBiomeSpawnSource(biomeId) {
  if (!biomeId) return null;
  return PACK_BIOME_SPAWN_SOURCES.get(String(biomeId).toLowerCase().trim().replace(/[\s-]+/g, '_')) ?? null;
}

/** The categories vanilla and this engine both use, in the order the report reads best. */
export const SPAWN_CATEGORIES = [
  'monster', 'creature', 'ambient', 'axolotls',
  'underground_water_creature', 'water_creature', 'water_ambient', 'misc',
];

/**
 * Turn a vanilla `spawners` block into the engine's table shape.
 *
 * Weights are PRESERVED. An earlier version of the biome adapter reduced the block to a flat list of names,
 * which would have made every mob in a category equally likely -- a zombie as common as a zombie villager --
 * and quietly changed spawn rates for every pack that loaded.
 *
 * @param {object} spawners the `spawners` object from a `worldgen/biome` file
 * @returns {object|null} `{ category: [{type, weight, minCount, maxCount}] }`, or null when absent
 */
export function spawnerTable(spawners) {
  if (!spawners || typeof spawners !== 'object' || Array.isArray(spawners)) return null;
  const table = {};
  let any = false;
  for (const [category, list] of Object.entries(spawners)) {
    if (!Array.isArray(list)) continue;
    const entries = [];
    for (const entry of list) {
      const type = typeof entry?.type === 'string' ? entry.type.replace(/^minecraft:/, '') : null;
      // An entry with no type names nothing and is dropped rather than stored as a spawn of `undefined`.
      if (!type) continue;
      entries.push({
        type,
        // Vanilla's own defaults when a field is absent, so a pack that omits a weight still works.
        weight: Number.isFinite(entry.weight) ? entry.weight : 1,
        minCount: Number.isFinite(entry.minCount) ? entry.minCount : 1,
        maxCount: Number.isFinite(entry.maxCount) ? entry.maxCount : 1,
      });
    }
    // An EMPTY list is kept, and that matters: vanilla uses an empty category to mean "this biome never
    // spawns this", which is a different statement from omitting the category.
    table[category] = entries;
    any = true;
  }
  return any ? table : null;
}

/** Install a pack's table for a biome, remembering which pack it came from. */
export function setPackBiomeSpawns(biomeId, table, packName = null) {
  if (!biomeId || !table) return false;
  const key = String(biomeId).toLowerCase();
  PACK_BIOME_SPAWNS.set(key, table);
  if (packName) PACK_BIOME_SPAWN_SOURCES.set(key, packName);
  else PACK_BIOME_SPAWN_SOURCES.delete(key);
  return true;
}

/** Remove a pack's table, restoring the baked one. */
export function clearPackBiomeSpawns(biomeId) {
  const key = String(biomeId ?? '').toLowerCase();
  PACK_BIOME_SPAWN_SOURCES.delete(key);
  return PACK_BIOME_SPAWNS.delete(key);
}

/** The pack's table for a biome, or null when the pack says nothing about it. */
export function packBiomeSpawnsFor(biomeId) {
  if (!biomeId) return null;
  return PACK_BIOME_SPAWNS.get(String(biomeId).toLowerCase().trim().replace(/[\s-]+/g, '_')) ?? null;
}

/** Drop every override. For a full revert, or a test. */
export function resetPackBiomeSpawns() {
  PACK_BIOME_SPAWNS.clear();
  PACK_BIOME_SPAWN_SOURCES.clear();
}

/**
 * How many biomes, categories and entries a pack has overridden -- for a report, and for a test that wants
 * to say "the pack really did change something" rather than only that a map has a key.
 */
export function packSpawnSummary() {
  let categories = 0;
  let entries = 0;
  for (const table of PACK_BIOME_SPAWNS.values()) {
    for (const list of Object.values(table)) {
      categories++;
      entries += list.length;
    }
  }
  return { biomes: PACK_BIOME_SPAWNS.size, categories, entries };
}
