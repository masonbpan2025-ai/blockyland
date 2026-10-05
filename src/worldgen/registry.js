// The 1.21.4 structure registry: what exists, where it may generate, and which placement governs it.
//
// TARGET VERSION: Minecraft Java Edition 1.21.4 (2024-12-03).
//
// Why 1.21.4: this repository's pinned vanilla data is `pc/1.21.4` (`.cache/mc-data/*.json`, produced by
// `scripts/generate-mc-data.mjs`), so it is the newest version the repository can express blocks and
// items for. The wiki now documents 26.x, so every value below was read from the **1.21.4-era revision**
// of the page (revision ids in docs/STRUCTURE_REFERENCES.md) rather than the current one, and anything
// that only exists after 1.21.4 is marked `post-1.21.4` and excluded.
//
// IDs here are the **structure registry ids** -- the ones `/locate structure` accepts and the ones that
// live in `worldgen/structure/` -- not the structure *type* (`type` field) and not the display name.
// The two differ in several places (`jungle_pyramid` vs type `jungle_temple`, `mansion` vs type
// `woodland_mansion`, `monument` vs type `ocean_monument`) and mixing them up would break `/locate`.

import { placementFromData } from './placement.js';
import { TerrainAdaptation } from './start.js';

/** Vanilla `GenerationStep.Decoration`, in execution order. */
export const GENERATION_STEPS = [
  'raw_generation', 'lakes', 'local_modifications', 'underground_structures', 'surface_structures',
  'strongholds', 'underground_ores', 'underground_decoration', 'fluid_springs', 'vegetal_decoration',
  'top_layer_modification'
];

/**
 * How a structure's blocks are produced. This is the wiki's own taxonomy (Structure definition
 * § "Using Jigsaw Blocks" / "Using structure templates" / "Hardcoded structures"), refined by whether a
 * "hardcoded" structure is a single-shot placement or a procedural piece graph.
 */
export const GeneratorFamily = {
  JIGSAW: 'jigsaw',
  TEMPLATE: 'template',
  PROCEDURAL: 'procedural',
  HARDCODED: 'hardcoded',
  FEATURE: 'feature'
};

const OVERWORLD = 'overworld';
const NETHER = 'nether';
const END = 'the_end';

/**
 * Registry id -> structure definition.
 *
 * `biomes` lists this repository's biome ids (`src/biomes.js`); `biomeTag` records the vanilla
 * `#has_structure/...` tag the gate comes from, so a future tag system can replace the list.
 */
export const STRUCTURES = {
  // --- Overworld, hardcoded: single-shot code placement --------------------------------------
  buried_treasure: {
    type: 'buried_treasure', dimension: OVERWORLD, family: GeneratorFamily.HARDCODED,
    step: 'underground_structures', biomeTag: 'has_structure/buried_treasure',
    biomes: ['beach', 'snowy_beach'],
    implementation: 'buriedTreasure',
    notes: 'One chest at a computed Y; always at chunk-local 9,9 facing east. Only structure with a non-zero locate_offset (9,0,9).'
  },
  desert_pyramid: {
    type: 'desert_pyramid', dimension: OVERWORLD, family: GeneratorFamily.HARDCODED,
    biomeTag: 'has_structure/desert_pyramid', biomes: ['desert'],
    notes: '21x21 hardcoded pyramid, four chests behind a TNT trap, 6-8 suspicious sand in the buried room.'
  },
  jungle_pyramid: {
    type: 'jungle_temple', dimension: OVERWORLD, family: GeneratorFamily.HARDCODED,
    biomeTag: 'has_structure/jungle_temple', biomes: ['jungle', 'bamboo_jungle'],
    notes: 'Three floors, lever puzzle with a sticky piston, two dispensers firing arrows.'
  },
  swamp_hut: {
    type: 'swamp_hut', dimension: OVERWORLD, family: GeneratorFamily.HARDCODED,
    biomeTag: 'has_structure/swamp_hut', biomes: ['swamp'],
    notes: 'Stilt hut; one witch and one black cat spawn with it and do not despawn.'
  },
  minecraft_special: null, // placeholder removed below; kept out of the registry on purpose
  // --- Procedural piece graphs ----------------------------------------------------------------
  mineshaft: {
    type: 'mineshaft', dimension: OVERWORLD, family: GeneratorFamily.PROCEDURAL,
    step: 'underground_structures', biomeTag: 'has_structure/mineshaft',
    biomes: [], biomeTagExcludes: ['deep_dark'],
    notes: 'Corridor maze with rails, cave spider spawners and cobwebs.'
  },
  mineshaft_mesa: {
    type: 'mineshaft', dimension: OVERWORLD, family: GeneratorFamily.PROCEDURAL,
    step: 'underground_structures', biomeTag: 'has_structure/mineshaft_mesa',
    biomes: ['badlands', 'eroded_badlands', 'wooded_badlands'],
    notes: 'Badlands variant: dark oak planks and fences, may breach the surface.'
  },
  stronghold: {
    type: 'stronghold', dimension: OVERWORLD, family: GeneratorFamily.PROCEDURAL,
    terrainAdaptation: TerrainAdaptation.BURY, biomeTag: 'has_structure/stronghold',
    biomes: [], // "all overworld biomes", biased to land by the ring biome search
    notes: 'Recursive piece maze ending in the End portal room; placed as concentric rings.'
  },
  fortress: {
    type: 'fortress', dimension: NETHER, family: GeneratorFamily.PROCEDURAL,
    step: 'underground_decoration', biomes: [],
    notes: 'Nether brick corridors and ramparts, blaze spawners, nether wart farms.'
  },
  monument: {
    type: 'ocean_monument', dimension: OVERWORLD, family: GeneratorFamily.PROCEDURAL,
    biomeTag: 'has_structure/ocean_monument',
    biomes: ['deep_ocean', 'deep_frozen_ocean', 'deep_cold_ocean', 'deep_lukewarm_ocean'],
    notes: '58x58 prismarine room graph, three elder guardians, sponge rooms; the largest structure with no chest.'
  },

  // --- Template with hardcoded relative positioning -------------------------------------------
  igloo: {
    type: 'igloo', dimension: OVERWORLD, family: GeneratorFamily.TEMPLATE,
    biomeTag: 'has_structure/igloo', biomes: ['snowy_taiga', 'snowy_plains', 'snowy_slopes'],
    implementation: 'igloo',
    notes: 'Templates igloo/top|middle|bottom; 50% have a basement with a villager and a zombie villager. Layout is a clean-room approximation: this repository ships no vanilla assets.'
  },
  ruined_portal: {
    type: 'ruined_portal', dimension: OVERWORLD, family: GeneratorFamily.TEMPLATE,
    biomeTag: 'has_structure/ruined_portal_standard', biomes: [],
    notes: 'portal_1..10 and giant_portal_1..3; block_age processor; the only structure in two dimensions.'
  },
  ruined_portal_desert: { type: 'ruined_portal', dimension: OVERWORLD, family: GeneratorFamily.TEMPLATE, biomeTag: 'has_structure/ruined_portal_desert', biomes: ['desert'], notes: 'Partly buried, mossiness 0.' },
  ruined_portal_jungle: { type: 'ruined_portal', dimension: OVERWORLD, family: GeneratorFamily.TEMPLATE, biomeTag: 'has_structure/ruined_portal_jungle', biomes: ['jungle', 'sparse_jungle', 'bamboo_jungle'], notes: 'Surface, mossiness 0.8.' },
  ruined_portal_mountain: { type: 'ruined_portal', dimension: OVERWORLD, family: GeneratorFamily.TEMPLATE, biomeTag: 'has_structure/ruined_portal_mountain', biomes: ['windswept_hills', 'windswept_forest', 'windswept_gravelly_hills', 'stony_shore', 'savanna_plateau', 'windswept_savanna', 'eroded_badlands', 'wooded_badlands', 'cherry_grove', 'frozen_peaks', 'jagged_peaks', 'meadow', 'snowy_slopes', 'stony_peaks'], notes: 'Half inside a mountain, mossiness 0.2.' },
  ruined_portal_ocean: { type: 'ruined_portal', dimension: OVERWORLD, family: GeneratorFamily.TEMPLATE, biomeTag: 'has_structure/ruined_portal_ocean', biomes: ['ocean', 'deep_ocean', 'cold_ocean', 'deep_cold_ocean', 'frozen_ocean', 'deep_frozen_ocean', 'lukewarm_ocean', 'deep_lukewarm_ocean', 'warm_ocean'], notes: 'On the ocean floor, mossiness 0.8.' },
  ruined_portal_swamp: { type: 'ruined_portal', dimension: OVERWORLD, family: GeneratorFamily.TEMPLATE, biomeTag: 'has_structure/ruined_portal_swamp', biomes: ['swamp', 'mangrove_swamp'], notes: 'Surface, mossiness 0.5.' },
  ruined_portal_nether: { type: 'ruined_portal', dimension: NETHER, family: GeneratorFamily.TEMPLATE, biomeTag: 'has_structure/ruined_portal_nether', biomes: [], notes: 'Blackstone materials, mossiness 0, replace_with_blackstone.' },
  shipwreck: {
    type: 'shipwreck', dimension: OVERWORLD, family: GeneratorFamily.TEMPLATE,
    biomeTag: 'has_structure/shipwreck',
    biomes: ['ocean', 'deep_ocean', 'cold_ocean', 'deep_cold_ocean', 'frozen_ocean', 'deep_frozen_ocean', 'lukewarm_ocean', 'deep_lukewarm_ocean', 'warm_ocean'],
    notes: '20 wreck templates in three orientations, intact and degraded; up to 3 chests.'
  },
  shipwreck_beached: {
    type: 'shipwreck', dimension: OVERWORLD, family: GeneratorFamily.TEMPLATE,
    biomeTag: 'has_structure/shipwreck_beached', biomes: ['beach', 'snowy_beach'],
    notes: 'Same templates with is_beached true.'
  },
  ocean_ruin_cold: {
    type: 'ocean_ruin', dimension: OVERWORLD, family: GeneratorFamily.TEMPLATE,
    biomeTag: 'has_structure/ocean_ruin_cold',
    biomes: ['frozen_ocean', 'cold_ocean', 'ocean', 'deep_frozen_ocean', 'deep_cold_ocean', 'deep_ocean'],
    notes: 'underwater_ruin brick/cracked/mossy templates, integrity 0.9/0.8/0.7/0.5; 30% large, and a large ruin seeds 4-8 small ones.'
  },
  ocean_ruin_warm: {
    type: 'ocean_ruin', dimension: OVERWORLD, family: GeneratorFamily.TEMPLATE,
    biomeTag: 'has_structure/ocean_ruin_warm',
    biomes: ['lukewarm_ocean', 'warm_ocean', 'deep_lukewarm_ocean'],
    notes: 'warm_1..8 / big_warm_1..8 sandstone templates; suspicious sand here is the only sniffer egg source.'
  },
  nether_fossil: {
    type: 'nether_fossil', dimension: NETHER, family: GeneratorFamily.TEMPLATE,
    step: 'underground_structures', biomeTag: 'has_structure/nether_fossil', biomes: ['soul_sand_valley'],
    notes: 'nether_fossils/fossil_1..14; no integrity loss and no ore overlay, unlike the overworld fossil.'
  },
  end_city: {
    type: 'end_city', dimension: END, family: GeneratorFamily.TEMPLATE,
    biomeTag: 'has_structure/end_city', biomes: ['end_midlands', 'end_highlands'],
    notes: '20 templates; towers with a 50% bridge chance and a 12.5% ship chance, at most one ship.'
  },
  mansion: {
    type: 'woodland_mansion', dimension: OVERWORLD, family: GeneratorFamily.TEMPLATE,
    biomeTag: 'has_structure/woodland_mansion',
    biomes: ['dark_forest'], // Pale Garden was added in 1.21.5 (post-1.21.4)
    notes: 'Procedural floor plan of template rooms over three floors; vindicators, evokers, jailed allays.'
  },

  // --- Jigsaw structures -----------------------------------------------------------------------
  village_plains: { type: 'jigsaw', dimension: OVERWORLD, family: GeneratorFamily.JIGSAW, terrainAdaptation: TerrainAdaptation.BEARD_THIN, biomeTag: 'has_structure/village_plains', biomes: ['plains', 'meadow'], notes: 'town_centers/houses/streets/terminators/villagers pools.' },
  village_desert: { type: 'jigsaw', dimension: OVERWORLD, family: GeneratorFamily.JIGSAW, terrainAdaptation: TerrainAdaptation.BEARD_THIN, biomeTag: 'has_structure/village_desert', biomes: ['desert'], notes: 'Smooth sandstone paths; one camel at the meeting point.' },
  village_savanna: { type: 'jigsaw', dimension: OVERWORLD, family: GeneratorFamily.JIGSAW, terrainAdaptation: TerrainAdaptation.BEARD_THIN, biomeTag: 'has_structure/village_savanna', biomes: ['savanna'], notes: 'Farmland and crops around the houses.' },
  village_snowy: { type: 'jigsaw', dimension: OVERWORLD, family: GeneratorFamily.JIGSAW, terrainAdaptation: TerrainAdaptation.BEARD_THIN, biomeTag: 'has_structure/village_snowy', biomes: ['snowy_plains'], notes: 'Snowy architecture.' },
  village_taiga: { type: 'jigsaw', dimension: OVERWORLD, family: GeneratorFamily.JIGSAW, terrainAdaptation: TerrainAdaptation.BEARD_THIN, biomeTag: 'has_structure/village_taiga', biomes: ['taiga'], notes: 'The only structure where armour stands generate naturally.' },
  pillager_outpost: {
    type: 'jigsaw', dimension: OVERWORLD, family: GeneratorFamily.JIGSAW,
    terrainAdaptation: TerrainAdaptation.BEARD_THIN, biomeTag: 'has_structure/pillager_outpost',
    biomes: ['desert', 'plains', 'savanna', 'snowy_plains', 'taiga', 'grove', 'meadow', 'frozen_peaks', 'jagged_peaks', 'stony_peaks', 'snowy_slopes', 'cherry_grove'],
    notes: 'watchtower plus up to four feature structures, including allay and iron golem cages.'
  },
  bastion_remnant: {
    type: 'jigsaw', dimension: NETHER, family: GeneratorFamily.JIGSAW,
    biomes: ['nether_wastes', 'crimson_forest', 'warped_forest', 'soul_sand_valley'],
    notes: 'Four variants (bridge, hoglin stable, housing units, treasure); floats over the lava sea by design (MC-179796).'
  },
  ancient_city: {
    type: 'jigsaw', dimension: OVERWORLD, family: GeneratorFamily.JIGSAW,
    step: 'underground_structures', terrainAdaptation: TerrainAdaptation.BEARD_BOX,
    biomeTag: 'has_structure/ancient_city', biomes: ['deep_dark'],
    notes: 'Floor always at Y=-51; spawn_overrides blocks natural spawning and the warden comes from shriekers.'
  },
  trail_ruins: {
    type: 'jigsaw', dimension: OVERWORLD, family: GeneratorFamily.JIGSAW,
    step: 'underground_structures', terrainAdaptation: TerrainAdaptation.BURY,
    biomeTag: 'has_structure/trail_ruins',
    biomes: ['taiga', 'snowy_taiga', 'old_growth_pine_taiga', 'old_growth_spruce_taiga', 'old_growth_birch_forest', 'jungle'],
    notes: 'Three processor lists; gravel becomes dirt, coarse dirt and then common/rare suspicious gravel.'
  },
  trial_chambers: {
    type: 'jigsaw', dimension: OVERWORLD, family: GeneratorFamily.JIGSAW,
    step: 'underground_structures', terrainAdaptation: TerrainAdaptation.ENCAPSULATE,
    biomeTag: 'has_structure/trial_chambers', biomes: [],
    notes: 'Copper and tuff rooms with trial spawners, vaults, dispensers and the breeze; no natural mob spawning inside.'
  }
};

delete STRUCTURES.minecraft_special; // guard: the placeholder above must never survive into the registry

/**
 * The 20 vanilla structure sets of 1.21.4, with the wiki's published numbers
 * (`Structure_set` revid 2780415; frequency and required biomes from `World_generation` revid 2743815).
 *
 * A set may hold structures from more than one dimension: `ruined_portals` contains the nether variant,
 * so dimension filtering happens per STRUCTURE, not per set.
 */
export const STRUCTURE_SETS = [
  { name: 'ancient_cities', structures: [['ancient_city', 1]], spacing: 24, separation: 8, salt: 20083232 },
  { name: 'buried_treasures', structures: [['buried_treasure', 1]], spacing: 1, separation: 0, salt: 0, frequency: 0.01, locateOffset: { x: 9, y: 0, z: 9 } },
  { name: 'desert_pyramids', structures: [['desert_pyramid', 1]], spacing: 32, separation: 8, salt: 14357617 },
  { name: 'end_cities', structures: [['end_city', 1]], spacing: 20, separation: 11, salt: 10387313 },
  { name: 'igloos', structures: [['igloo', 1]], spacing: 32, separation: 8, salt: 14357618 },
  { name: 'jungle_temples', structures: [['jungle_pyramid', 1]], spacing: 32, separation: 8, salt: 14357619 },
  { name: 'mineshafts', structures: [['mineshaft', 1], ['mineshaft_mesa', 1]], spacing: 1, separation: 0, salt: 0, frequency: 0.004 },
  { name: 'nether_complexes', structures: [['fortress', 2], ['bastion_remnant', 3]], spacing: 27, separation: 4, salt: 30084232 },
  { name: 'nether_fossils', structures: [['nether_fossil', 1]], spacing: 2, separation: 1, salt: 14357921 },
  { name: 'ocean_monuments', structures: [['monument', 1]], spacing: 32, separation: 5, salt: 10387313, spreadType: 'triangular' },
  { name: 'ocean_ruins', structures: [['ocean_ruin_cold', 1], ['ocean_ruin_warm', 1]], spacing: 20, separation: 8, salt: 14357621 },
  {
    name: 'pillager_outposts', structures: [['pillager_outpost', 1]], spacing: 32, separation: 8, salt: 165745296,
    frequency: 0.2,
    // The wiki publishes neither the field nor the method; both independent reference implementations
    // name a reducer after this structure, so `legacy_type_1` is a documented inference, not a guess.
    frequencyReductionMethod: 'legacy_type_1',
    exclusionZone: { otherSet: 'villages', chunkCount: 10 }
  },
  {
    name: 'ruined_portals',
    structures: [['ruined_portal', 1], ['ruined_portal_desert', 1], ['ruined_portal_jungle', 1], ['ruined_portal_mountain', 1], ['ruined_portal_ocean', 1], ['ruined_portal_swamp', 1], ['ruined_portal_nether', 1]],
    spacing: 40, separation: 15, salt: 34222645
  },
  { name: 'shipwrecks', structures: [['shipwreck', 1], ['shipwreck_beached', 1]], spacing: 24, separation: 4, salt: 165745295 },
  { name: 'strongholds', structures: [['stronghold', 1]], type: 'concentric_rings', distance: 32, count: 128, spread: 3, salt: 0 },
  { name: 'swamp_huts', structures: [['swamp_hut', 1]], spacing: 32, separation: 8, salt: 14357620 },
  { name: 'trail_ruins', structures: [['trail_ruins', 1]], spacing: 34, separation: 8, salt: 83469867 },
  { name: 'trial_chambers', structures: [['trial_chambers', 1]], spacing: 34, separation: 12, salt: 94251327 },
  {
    name: 'villages',
    structures: [['village_plains', 1], ['village_desert', 1], ['village_savanna', 1], ['village_snowy', 1], ['village_taiga', 1]],
    spacing: 34, separation: 8, salt: 10387312
  },
  { name: 'woodland_mansions', structures: [['mansion', 1]], spacing: 80, separation: 20, salt: 10387319, spreadType: 'triangular' }
];

/** The 1.21.4 Java structure tags (the 26.3 renames are deliberately NOT applied). */
export const STRUCTURE_TAGS = {
  'minecraft:cats_spawn_as_black': ['swamp_hut'],
  'minecraft:cats_spawn_in': ['swamp_hut'],
  'minecraft:dolphin_located': ['ocean_ruin_cold', 'ocean_ruin_warm', 'shipwreck', 'shipwreck_beached'],
  'minecraft:eye_of_ender_located': ['stronghold'],
  'minecraft:mineshaft': ['mineshaft', 'mineshaft_mesa'],
  'minecraft:ocean_ruin': ['ocean_ruin_cold', 'ocean_ruin_warm'],
  'minecraft:on_ocean_explorer_maps': ['monument'],
  'minecraft:on_treasure_maps': ['buried_treasure'],
  'minecraft:on_woodland_explorer_maps': ['mansion'],
  'minecraft:ruined_portal': ['ruined_portal', 'ruined_portal_desert', 'ruined_portal_jungle', 'ruined_portal_mountain', 'ruined_portal_ocean', 'ruined_portal_swamp', 'ruined_portal_nether'],
  'minecraft:shipwreck': ['shipwreck', 'shipwreck_beached'],
  'minecraft:village': ['village_plains', 'village_desert', 'village_savanna', 'village_snowy', 'village_taiga'],
  // Added in 1.20.2 behind the "Villager Trade Rebalance" experiment; still experimental in 1.21.4.
  'minecraft:on_jungle_explorer_maps': ['jungle_pyramid'],
  'minecraft:on_swamp_explorer_maps': ['swamp_hut'],
  'minecraft:on_desert_village_maps': ['village_desert'],
  'minecraft:on_plains_village_maps': ['village_plains'],
  'minecraft:on_savanna_village_maps': ['village_savanna'],
  'minecraft:on_snowy_village_maps': ['village_snowy'],
  'minecraft:on_taiga_village_maps': ['village_taiga'],
  'minecraft:on_trial_chambers_maps': ['trial_chambers']
};

/** Structures of one dimension, which is how the engine and the Inspector filter. */
export function structuresForDimension(dimension = OVERWORLD, registry = STRUCTURES) {
  return Object.entries(registry)
    .filter(([, entry]) => entry.dimension === dimension)
    .map(([id, entry]) => ({ id, ...entry }));
}

export function getStructure(id, registry = STRUCTURES) {
  const entry = registry[id];
  if (!entry) return null;
  return { id, ...entry };
}

/** The set that can place a structure, for `/locate` and the Inspector's metadata panel. */
export function getSetForStructure(id, sets = STRUCTURE_SETS) {
  return sets.find((set) => set.structures.some(([structureId]) => structureId === id)) || null;
}

/**
 * Build `StructureSet`-shaped objects (data only; `createEngine` turns them into placements).
 *
 * `dimension` filters by the structures the set can place, not by a set-level dimension, because
 * `ruined_portals` legitimately spans the Overworld and the Nether.
 */
export function buildSetData({ dimension = OVERWORLD } = {}) {
  return STRUCTURE_SETS.map((set) => {
    const entries = set.structures.filter(([id]) => {
      const entry = STRUCTURES[id];
      return entry && (!dimension || entry.dimension === dimension);
    });
    return { ...set, structures: entries };
  }).filter((set) => set.structures.length > 0);
}

/** Sort sets/structures into engine objects, wiring exclusion zones through a name lookup. */
export function createSets({ dimension = OVERWORLD } = {}) {
  const data = buildSetData({ dimension });
  const sets = new Map();
  for (const set of data) {
    const placement = placementFromData({
      type: set.type || 'random_spread',
      spacing: set.spacing,
      separation: set.separation,
      salt: set.salt,
      spreadType: set.spreadType,
      frequency: set.frequency ?? 1,
      frequencyReductionMethod: set.frequencyReductionMethod || 'default',
      locateOffset: set.locateOffset || { x: 0, y: 0, z: 0 },
      exclusionZone: set.exclusionZone ? { otherSet: set.exclusionZone.otherSet, chunkCount: set.exclusionZone.chunkCount } : null,
      distance: set.distance,
      count: set.count,
      spread: set.spread,
      preferredBiomes: set.preferredBiomes || []
    });
    sets.set(set.name, {
      name: set.name,
      placement,
      dimension,
      structures: set.structures.map(([structureId, weight]) => ({ structureId, weight })),
      totalWeight: set.structures.reduce((sum, [, weight]) => sum + weight, 0)
    });
  }
  return sets;
}

/**
 * Validate the registry against the biome registry and the format's own rules.
 *
 * A gate naming a biome this game lacks would make a structure unplaceable, and `separation >= spacing`
 * is illegal in the format, so both are hard failures rather than warnings.
 */
export function validateRegistry({ biomes = null } = {}) {
  const problems = [];
  const known = biomes ? new Set(Object.keys(biomes)) : null;

  for (const [id, entry] of Object.entries(STRUCTURES)) {
    if (!entry) continue;
    if (known && !entry.biomeTag) {
      for (const biome of entry.biomes || []) {
        if (!known.has(biome)) problems.push(`${id}: unknown biome gate "${biome}"`);
      }
    }
    for (const biome of entry.biomeTagExcludes || []) {
      if (known && !known.has(biome)) problems.push(`${id}: unknown excluded biome "${biome}"`);
    }
    if (!GENERATION_STEPS.includes(entry.step || 'surface_structures')) {
      problems.push(`${id}: unknown generation step "${entry.step}"`);
    }
    if (!Object.values(GeneratorFamily).includes(entry.family)) {
      problems.push(`${id}: unknown generator family "${entry.family}"`);
    }
    if (![OVERWORLD, NETHER, END].includes(entry.dimension)) {
      problems.push(`${id}: unknown dimension "${entry.dimension}"`);
    }
  }

  for (const set of STRUCTURE_SETS) {
    const type = set.type || 'random_spread';
    if (type === 'random_spread') {
      if (!(set.spacing > 0)) problems.push(`${set.name}: spacing must be positive`);
      if (set.separation >= set.spacing) problems.push(`${set.name}: separation must be strictly smaller than spacing`);
      if (!(set.salt >= 0)) problems.push(`${set.name}: salt must be non-negative`);
    } else if (type === 'concentric_rings') {
      if (!(set.count > 0)) problems.push(`${set.name}: count must be positive`);
    } else {
      problems.push(`${set.name}: unknown placement type "${type}"`);
    }
    const seen = new Set();
    for (const [structureId, weight] of set.structures) {
      if (!STRUCTURES[structureId]) problems.push(`${set.name}: unknown structure "${structureId}"`);
      if (!(weight > 0)) problems.push(`${set.name}: weight for "${structureId}" must be positive`);
      if (seen.has(structureId)) problems.push(`${set.name}: "${structureId}" listed twice`);
      seen.add(structureId);
    }
    if (set.exclusionZone && !STRUCTURE_SETS.some((other) => other.name === set.exclusionZone.otherSet)) {
      problems.push(`${set.name}: exclusion zone names unknown set "${set.exclusionZone.otherSet}"`);
    }
  }

  // Every tag member must be a real structure id.
  for (const [tag, members] of Object.entries(STRUCTURE_TAGS)) {
    for (const id of members) {
      if (!STRUCTURES[id]) problems.push(`tag ${tag}: unknown structure "${id}"`);
    }
  }

  return problems;
}
