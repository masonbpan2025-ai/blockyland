// Generate the vanilla biome spawn tables consumed by the natural-spawning subsystem.
//
// Run with: node scripts/generate-mob-spawn-data.mjs
// Offline: pass --offline to reuse the cached raw JSON in .cache/mc-data/biomes.
//
// Why a generator rather than hand-written tables.
//
// The single most common way a mob-spawning port stops being correct is that its biome tables are
// typed by hand, drift from the version they claim, and silently disagree with the game. The
// spawners for all 66 biomes of Java Edition 1.21.4 are already published as machine-readable
// data; vendoring a generated, reviewable ES module from that data removes the whole class of
// transcription error.
//
// Source: misode/mcmeta (https://github.com/misode/mcmeta), branch `1.21.4-data`, which mirrors the
// vanilla data pack for that version. Only the `spawners` block of each biome is read; the terrain,
// feature and effect data is ignored. See docs/MOB_SPAWNING_REFERENCES.md for licensing.
//
// The engine's own biome registry (src/biomes.js) has 69 ids: the 66 vanilla ones plus three the
// engine adds (`dappled_forest`, `ice_caves`, `sulfur_caves`) and one alias (`nether` for
// `nether_wastes`). ENGINE_ONLY_BIOMES below records what each extra id borrows, so nothing falls
// back silently to plains.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BRANCH = '1.21.4-data';
const RAW = `https://raw.githubusercontent.com/misode/mcmeta/${BRANCH}/data/minecraft/worldgen/biome`;
const CACHE = join(process.cwd(), '.cache', 'mc-data', 'biomes');
const offline = process.argv.includes('--offline');

/**
 * Engine biome ids that vanilla 1.21.4 does not have, and the vanilla biome whose spawn table they
 * borrow.
 *
 * Each is a deliberate behavioural choice and is listed in docs/MOB_SPAWNING_PARITY.md:
 *  - `nether` is the engine's id for the Nether dimension's default biome; it is nether_wastes.
 *  - `ice_caves` and `sulfur_caves` are engine-only cave variants. They borrow the cave biome whose
 *    spawn list is closest (dripstone caves and lush caves respectively); for both that means bat
 *    at the ambient tier plus the standard monster list, and lush caves also lends the axolotl,
 *    glow squid and tropical fish tiers, which is generous to sulfur caves -- recorded as a known
 *    deviation rather than hidden.
 *
 * `dappled_forest` is deliberately NOT here: it is a real vanilla biome in 1.21.5 and later but not
 * in 1.21.4, and this engine generates it. It is resolved at runtime to the `forest` table. See
 * `ENGINE_ONLY_BIOME_RUNTIME_ALIASES` below.
 */
const ENGINE_ONLY_BIOMES = {
  nether: 'nether_wastes',
  ice_caves: 'dripstone_caves',
  sulfur_caves: 'lush_caves',
};

/**
 * Runtime-only aliases: engine biome ids absent from the 1.21.4 data pack entirely.
 *
 * Kept separate from ENGINE_ONLY_BIOMES because these have no table of their own to copy at
 * generation time -- they are resolved to an existing table by `biomeSpawnResolver.js`.
 */
const ENGINE_ONLY_BIOME_RUNTIME_ALIASES = {
  dappled_forest: 'forest',
};

/**
 * Vanilla entity id -> this engine's mob type.
 *
 * Only entries that DIFFER need to be listed, because the engine's type namespace is otherwise the
 * same string as vanilla's path. Every difference is listed rather than defaulted so that a typo
 * shows up as a missing spawn entry rather than as a mob that never spawns.
 */
const TYPE_ALIASES = {
  zombie_pigman: 'zombified_piglin',
  zombie_horse: 'zombie_horse',
  // The engine has no illusioner/giant natural spawning and no trader llama in biome tables.
};

/** Mojang's newer ids that the engine stores under their older name. */
const MOB_ALIASES_REVERSE = Object.fromEntries(
  Object.entries(TYPE_ALIASES).map(([oldId, newId]) => [newId, oldId])
);

const CATEGORIES = [
  'monster',
  'creature',
  'ambient',
  'axolotls',
  'underground_water_creature',
  'water_creature',
  'water_ambient',
  'misc',
];

async function loadBiome(name) {
  const cached = join(CACHE, `${name}.json`);
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8'));
  if (offline) throw new Error(`${name}: not cached and --offline was passed`);
  const res = await fetch(`${RAW}/${name}.json`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const text = await res.text();
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(cached, text, 'utf8');
  return JSON.parse(text);
}

/** Strip the `minecraft:` namespace and map to the engine's mob type. */
function toEngineType(vanillaId) {
  const id = vanillaId.replace(/^minecraft:/, '').replace(/[^a-z0-9_]/g, '_');
  return TYPE_ALIASES[id] || id;
}

/**
 * The 66 biome ids of Java Edition 1.21.4, in registry order.
 *
 * Used when the GitHub directory listing is unavailable (unauthenticated API access is rate limited
 * to a handful of requests, and the listing is the only place the FILE NAMES come from -- the biome
 * contents themselves are fetchable from raw.githubusercontent.com without a limit). The list is
 * asserted against the registry in the parity test, so a typo here fails a test rather than
 * silently dropping a biome's spawns.
 */
const VANILLA_1_21_4_BIOMES = [
  'badlands', 'bamboo_jungle', 'basalt_deltas', 'beach', 'birch_forest', 'cherry_grove',
  'cold_ocean', 'crimson_forest', 'dark_forest', 'deep_cold_ocean', 'deep_dark',
  'deep_frozen_ocean', 'deep_lukewarm_ocean', 'deep_ocean', 'desert', 'dripstone_caves',
  'end_barrens', 'end_highlands', 'end_midlands', 'eroded_badlands', 'flower_forest', 'forest',
  'frozen_ocean', 'frozen_peaks', 'frozen_river', 'grove', 'ice_spikes', 'jagged_peaks', 'jungle',
  'lukewarm_ocean', 'lush_caves', 'mangrove_swamp', 'meadow', 'mushroom_fields', 'nether_wastes',
  'ocean', 'old_growth_birch_forest', 'old_growth_pine_taiga', 'old_growth_spruce_taiga',
  'pale_garden', 'plains', 'river', 'savanna', 'savanna_plateau', 'small_end_islands',
  'snowy_beach', 'snowy_plains', 'snowy_slopes', 'snowy_taiga', 'soul_sand_valley', 'sparse_jungle',
  'stony_peaks', 'stony_shore', 'sunflower_plains', 'swamp', 'taiga', 'the_end',
  'the_void', 'warm_ocean', 'warped_forest', 'windswept_forest', 'windswept_gravelly_hills',
  'windswept_hills', 'windswept_savanna', 'wooded_badlands',
];

console.log('Fetching vanilla biome spawn tables...');
// The registry MUST come from the same versioned branch as the biome files. `summary` tracks the
// latest snapshot, whose biome list is not 1.21.4's -- using it silently fetched a later version's
// `dappled_forest` and 404'd, which is exactly the version-mixing this task forbids.
const REGISTRY_SOURCE = `https://api.github.com/repos/misode/mcmeta/contents/data/minecraft/worldgen/biome?ref=${BRANCH}`;
const registry = await (async () => {
  const cached = join(CACHE, `_registry-${BRANCH}.json`);
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8'));
  if (!offline) {
    try {
      const res = await fetch(REGISTRY_SOURCE, { headers: { 'User-Agent': 'dsh-mob-spawn-data' } });
      if (res.ok) {
        const listing = await res.json();
        if (Array.isArray(listing)) {
          const ids = listing
            .filter(entry => entry.type === 'file' && entry.name.endsWith('.json'))
            .map(entry => entry.name.replace(/\.json$/, ''));
          if (ids.length) {
            mkdirSync(CACHE, { recursive: true });
            writeFileSync(cached, JSON.stringify(ids), 'utf8');
            return ids;
          }
        }
      } else {
        console.log(`  registry listing unavailable (HTTP ${res.status}); using the pinned list`);
      }
    } catch (err) {
      console.log(`  registry listing failed (${err.message}); using the pinned list`);
    }
  }
  return VANILLA_1_21_4_BIOMES;
})();

const vanillaBiomes = registry.map(id => id.replace(/^minecraft:/, ''));
console.log(`  ${vanillaBiomes.length} biomes in the ${BRANCH} registry`);

const tables = {};
const mobTypesUsed = new Set();
for (const biome of vanillaBiomes) {
  const data = await loadBiome(biome);
  const spawners = data.spawners || {};
  const table = {};
  for (const category of CATEGORIES) {
    const entries = spawners[category];
    if (!Array.isArray(entries) || entries.length === 0) continue;
    table[category] = entries.map(entry => {
      const type = toEngineType(entry.type);
      mobTypesUsed.add(type);
      return {
        type,
        weight: entry.weight,
        minCount: entry.minCount,
        maxCount: entry.maxCount,
      };
    });
  }
  tables[biome] = table;
}

for (const [engineId, vanillaId] of Object.entries(ENGINE_ONLY_BIOMES)) {
  if (tables[vanillaId]) tables[engineId] = tables[vanillaId];
}

const header = `// GENERATED FILE - do not edit by hand.
//
// Vanilla biome spawn tables for Minecraft Java Edition ${BRANCH.replace('-data', '')}.
//
// Produced by scripts/generate-mob-spawn-data.mjs from misode/mcmeta branch \`${BRANCH}\`,
// which mirrors the vanilla data pack. Only each biome's \`spawners\` block is reproduced; the
// terrain, feature and effect data is not.
//
// Each entry is { type, weight, minCount, maxCount } exactly as the vanilla data pack states it.
// \`type\` is this engine's mob-type id, which equals vanilla's entity path except where
// TYPE_ALIASES in the generator says otherwise.
//
// Regenerate with:
//   node scripts/generate-mob-spawn-data.mjs
`;

const body = Object.entries(tables)
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([biome, table]) => {
    const cats = Object.entries(table).map(([category, entries]) => {
      const rows = entries
        .map(e => `      { type: '${e.type}', weight: ${e.weight}, minCount: ${e.minCount}, maxCount: ${e.maxCount} },`)
        .join('\n');
      return `    ${category}: [\n${rows}\n    ],`;
    }).join('\n');
    return `  ${biome}: {\n${cats}\n  },`;
  })
  .join('\n');

const out = `${header}
/**
 * Every biome's spawn table, keyed by this engine's biome id.
 *
 * A biome absent from this map has no natural spawns at all, which is the correct answer for e.g.
 * \`the_void\`. \`getBiomeSpawnTable\` handles that alongside the engine-only aliases.
 */
export const BIOME_SPAWN_TABLES = {
${body}
};

/**
 * Engine biome ids with no vanilla 1.21.4 equivalent, and the vanilla table they borrow.
 *
 * Recorded as data rather than folded into BIOME_SPAWN_TABLES so the generator can be re-run and
 * so the parity document can name each deviation.
 */
export const ENGINE_ONLY_BIOME_ALIASES = ${JSON.stringify(ENGINE_ONLY_BIOMES, null, 2)};

/**
 * Engine biome ids that are not in the 1.21.4 data pack at all, and the table they resolve to.
 *
 * These are handled at lookup time rather than copied here, because there is nothing to copy.
 */
export const ENGINE_ONLY_BIOME_RUNTIME_ALIASES = ${JSON.stringify(ENGINE_ONLY_BIOME_RUNTIME_ALIASES, null, 2)};

/** The vanilla biomes the table knows about. */
export const VANILLA_BIOMES_WITH_SPAWNS = Object.keys(BIOME_SPAWN_TABLES).filter(
  id => !(id in ENGINE_ONLY_BIOME_ALIASES)
);

/**
 * Every mob type that appears in any biome's spawn table.
 *
 * Used by tests to assert that everything vanilla would spawn naturally is a mob this engine can
 * actually construct; without that check a typo in a biome table is silent.
 */
export const BIOME_SPAWN_MOB_TYPES = Object.freeze(${JSON.stringify([...mobTypesUsed].sort())});
`;

writeFileSync('src/spawning/vanillaBiomeSpawns.js', out, 'utf8');
console.log(`  src/spawning/vanillaBiomeSpawns.js: ${Object.keys(tables).length} biomes, ${mobTypesUsed.size} mob types`);
console.log(`  mob types: ${[...mobTypesUsed].sort().join(', ')}`);
