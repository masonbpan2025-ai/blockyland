// The world-generation presets offered in the Create New World menu.
//
// Each one is a REAL data pack in this loader's format -- a map of pack path to JSON -- so selecting one goes
// through exactly the same parse, validate and apply path as a pack pasted from misode.github.io. Nothing
// here is a special case in the loader.
//
// WHAT A GENERATION PACK CAN AND CANNOT SAY
//
// Vanilla `worldgen/biome` carries climate, effects and spawners, and nothing else: surface blocks, base
// height, height scale and tree density live in `noise_settings`, the surface rules and the placed-feature
// list -- three registries this engine does not implement. So a strictly vanilla biome file cannot change
// the generation, which is the one thing a generation pack exists to do.
//
// These presets therefore use the documented `engine_terrain` extension (see `adaptEngineTerrain`) for
// terrain and plain vanilla `spawners` for mobs. The extension key is the only non-Minecraft field, so it is
// obvious which parts a vanilla reader would ignore.
//
// The names describe what each pack DOES rather than borrowing a third-party pack's name, because none of
// these is that pack: they express the same IDEA with the levers this engine actually has.
import { generatableStructureIds } from './worldStructures.js';

/** The structure ids this engine can build, for validating a preset's list. */
const BUILDABLE = new Set(generatableStructureIds());

/**
 * The land biomes a terrain preset rewrites.
 *
 * Oceans, rivers, caves and the void are left alone: a surface-height change applied to an ocean would raise
 * the sea floor through the water, and to `deep_dark` or `ice_caves` it would mean nothing. A preset that
 * silently deformed the oceans would look like a bug in the terrain, not a feature of the pack.
 */
export const LAND_BIOMES = [
  'plains', 'sunflower_plains', 'forest', 'flower_forest', 'birch_forest', 'old_growth_birch_forest',
  'dark_forest', 'pale_garden', 'taiga', 'old_growth_pine_taiga', 'old_growth_spruce_taiga',
  'snowy_taiga', 'jungle', 'sparse_jungle', 'bamboo_jungle', 'dappled_forest', 'swamp', 'mangrove_swamp',
  'meadow', 'cherry_grove', 'grove', 'snowy_plains', 'ice_spikes', 'snowy_slopes', 'jagged_peaks',
  'frozen_peaks', 'stony_peaks', 'windswept_hills', 'windswept_gravelly_hills', 'windswept_forest',
  'windswept_savanna', 'savanna', 'savanna_plateau', 'desert', 'badlands', 'wooded_badlands',
  'eroded_badlands', 'beach', 'snowy_beach', 'stony_shore', 'mushroom_fields',
];

/** The cold half of the land biomes, for the presets that care about temperature. */
export const COLD_BIOMES = [
  'snowy_plains', 'ice_spikes', 'snowy_taiga', 'snowy_slopes', 'frozen_peaks', 'jagged_peaks', 'grove',
  'snowy_beach', 'frozen_ocean', 'deep_frozen_ocean', 'frozen_river',
];

/** The arid half, for the presets that do. */
export const ARID_BIOMES = [
  'desert', 'badlands', 'wooded_badlands', 'eroded_badlands', 'savanna', 'savanna_plateau',
  'windswept_savanna',
];

/** The forested half. */
export const FOREST_BIOMES = [
  'forest', 'flower_forest', 'birch_forest', 'old_growth_birch_forest', 'dark_forest', 'taiga',
  'old_growth_pine_taiga', 'old_growth_spruce_taiga', 'jungle', 'sparse_jungle', 'bamboo_jungle',
  'dappled_forest', 'pale_garden', 'windswept_forest', 'mangrove_swamp',
];

/**
 * Reusable spawner blocks.
 *
 * Weights are vanilla's own scale (a spider is 100, an enderman 10), because the picker is a weighted draw
 * over the whole category -- a set written on a different scale would not be wrong so much as unreadable
 * against the biomes it replaces.
 */
export const SPAWN_SETS = Object.freeze({
  /** The default hostile loadout, unchanged, so a preset can leave nights as they are. */
  hostileVanilla: {
    monster: [
      { type: 'minecraft:spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'minecraft:zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'minecraft:zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'minecraft:skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'minecraft:creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'minecraft:slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'minecraft:enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'minecraft:witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
  },
  /** A calm night: the same species, far less often, and never in packs. */
  hostileSparse: {
    monster: [
      { type: 'minecraft:zombie', weight: 20, minCount: 1, maxCount: 2 },
      { type: 'minecraft:skeleton', weight: 20, minCount: 1, maxCount: 2 },
      { type: 'minecraft:spider', weight: 15, minCount: 1, maxCount: 2 },
      { type: 'minecraft:creeper', weight: 10, minCount: 1, maxCount: 1 },
      { type: 'minecraft:enderman', weight: 5, minCount: 1, maxCount: 1 },
    ],
  },
  /** A dangerous night. */
  hostileHeavy: {
    monster: [
      { type: 'minecraft:zombie', weight: 200, minCount: 4, maxCount: 6 },
      { type: 'minecraft:skeleton', weight: 200, minCount: 4, maxCount: 6 },
      { type: 'minecraft:creeper', weight: 150, minCount: 2, maxCount: 4 },
      { type: 'minecraft:spider', weight: 150, minCount: 4, maxCount: 6 },
      { type: 'minecraft:witch', weight: 20, minCount: 1, maxCount: 2 },
      { type: 'minecraft:enderman', weight: 20, minCount: 1, maxCount: 2 },
    ],
  },
  /** The one the "lots of friendly mobs" preset uses: every passive species, heavily weighted. */
  creatureAbundant: {
    creature: [
      { type: 'minecraft:cow', weight: 40, minCount: 4, maxCount: 8 },
      { type: 'minecraft:sheep', weight: 40, minCount: 4, maxCount: 8 },
      { type: 'minecraft:pig', weight: 40, minCount: 4, maxCount: 8 },
      { type: 'minecraft:chicken', weight: 40, minCount: 4, maxCount: 8 },
      { type: 'minecraft:horse', weight: 25, minCount: 4, maxCount: 6 },
      { type: 'minecraft:rabbit', weight: 20, minCount: 2, maxCount: 4 },
      { type: 'minecraft:wolf', weight: 15, minCount: 4, maxCount: 4 },
      { type: 'minecraft:fox', weight: 10, minCount: 2, maxCount: 4 },
      { type: 'minecraft:bee', weight: 10, minCount: 3, maxCount: 3 },
      { type: 'minecraft:llama', weight: 8, minCount: 4, maxCount: 6 },
    ],
    ambient: [{ type: 'minecraft:bat', weight: 10, minCount: 8, maxCount: 8 }],
  },
  /** Fewer animals than vanilla, for the barren presets. */
  creatureSparse: {
    creature: [
      { type: 'minecraft:rabbit', weight: 20, minCount: 2, maxCount: 3 },
      { type: 'minecraft:sheep', weight: 6, minCount: 2, maxCount: 4 },
    ],
  },
  /** Cold-climate animals, for the frozen presets. */
  creatureCold: {
    creature: [
      { type: 'minecraft:polar_bear', weight: 20, minCount: 1, maxCount: 2 },
      { type: 'minecraft:rabbit', weight: 30, minCount: 2, maxCount: 3 },
      { type: 'minecraft:wolf', weight: 20, minCount: 4, maxCount: 4 },
      { type: 'minecraft:fox', weight: 20, minCount: 2, maxCount: 4 },
      { type: 'minecraft:sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'minecraft:cow', weight: 8, minCount: 4, maxCount: 4 },
    ],
  },
});

/** The structure sets the presets draw on, all of them validated against what the engine can build. */
export const STRUCTURE_SETS = Object.freeze({
  /** The engine's own default three. */
  default: ['village_plains', 'igloo', 'desert_pyramid'],
  /** Every village variant plus the small surface finds -- a populated world. */
  populated: [
    'village_plains', 'village_desert', 'village_savanna', 'village_snowy', 'village_taiga',
    'pillager_outpost', 'igloo', 'desert_pyramid', 'jungle_pyramid', 'swamp_hut', 'trail_ruins',
    'ruined_portal', 'ruined_portal_desert', 'ruined_portal_jungle', 'ruined_portal_mountain',
    'ruined_portal_swamp', 'buried_treasure',
  ],
  /** Buried and underground finds, for a world that is about exploring. */
  dungeons: [
    'trial_chambers', 'ancient_city', 'trail_ruins', 'buried_treasure', 'ruined_portal',
    'mineshaft', 'stronghold',
  ].filter(id => BUILDABLE.has(id)),
  /** Coastal and oceanic. */
  maritime: [
    'shipwreck', 'shipwreck_beached', 'ocean_ruin_cold', 'ocean_ruin_warm', 'monument', 'buried_treasure',
  ],
  /** Almost everything buildable, for the "as much as possible" preset. */
  everything: [...BUILDABLE],
  /** Deliberately empty: a world with no structures at all. */
  none: [],
});

/**
 * The ten presets, in the order the menu lists them.
 *
 * `biomes` names which biome ids get the preset's `terrain` and `spawners`; `structures` is the enabled
 * structure set. A preset with no `structures` leaves the engine's default three alone.
 */
export const GENERATION_PRESETS = Object.freeze([
  {
    id: 'lush_havens',
    name: 'Lush Havens',
    emoji: '🐄',
    property: 'Plenty of friendly mobs and plenty of structures',
    blurb: 'Docile animals everywhere, calm nights, and a village or a ruin within sight. The world is built '
      + 'for gathering and building rather than for fighting.',
    biomes: LAND_BIOMES,
    terrain: { tree_density: 0.42, flora_density: 0.45, tree_type: 'oak' },
    surface: 'minecraft:grass_block',
    spawners: ['creatureAbundant', 'hostileSparse'],
    structures: STRUCTURE_SETS.populated,
  },
  {
    id: 'wild_highlands',
    name: 'Wild Highlands',
    emoji: '⛰️',
    property: 'Tall, dramatic, broken terrain',
    blurb: 'The land rises and falls in long ridges and deep valleys, so the horizon is never flat. Surface '
      + 'travel means climbing.',
    biomes: LAND_BIOMES,
    terrain: { base_height: 32, height_scale: 14 },
    structures: STRUCTURE_SETS.populated,
  },
  {
    id: 'amplified_peaks',
    name: 'Amplified Peaks',
    emoji: '🏔️',
    property: 'Extreme vertical scale',
    blurb: 'The same terrain pushed to its limit: spires, cliffs and chasms. Falling is the main hazard.',
    biomes: LAND_BIOMES,
    terrain: { base_height: 36, height_scale: 22 },
    structures: STRUCTURE_SETS.default,
  },
  {
    id: 'verdant_overgrowth',
    name: 'Verdant Overgrowth',
    emoji: '🌳',
    property: 'Very dense forest and undergrowth',
    blurb: 'Trees close enough to lose the sky, and flowers and grass filling every gap. Easy to get lost, '
      + 'impossible to go hungry.',
    biomes: LAND_BIOMES,
    terrain: { tree_density: 0.85, tree_type: 'dark_oak', flora_density: 0.7 },
    surface: 'minecraft:grass_block',
    spawners: ['creatureAbundant', 'hostileVanilla'],
    structures: STRUCTURE_SETS.default,
  },
  {
    id: 'amber_autumn',
    name: 'Amber Autumn',
    emoji: '🍂',
    property: 'Warm-coloured woodland everywhere',
    blurb: 'A world in permanent autumn: broadleaf forest across every climate, warm light, and animals '
      + 'that prefer the woods.',
    biomes: LAND_BIOMES,
    terrain: { tree_density: 0.55, tree_type: 'oak', flora_density: 0.3 },
    surface: 'minecraft:podzol',
    spawners: ['creatureAbundant'],
    structures: STRUCTURE_SETS.default,
  },
  {
    id: 'frozen_frontier',
    name: 'Frozen Frontier',
    emoji: '❄️',
    property: 'Snow and ice wherever you go',
    blurb: 'Every land biome freezes over, with the animals that live there. Cold, sparse and quiet.',
    biomes: LAND_BIOMES,
    terrain: { tree_density: 0.12, tree_type: 'spruce', flora_density: 0.05 },
    surface: 'minecraft:snow_block',
    subsurface: 'minecraft:dirt',
    spawners: ['creatureCold', 'hostileVanilla'],
    structures: STRUCTURE_SETS.default,
  },
  {
    id: 'scorched_badlands',
    name: 'Scorched Badlands',
    emoji: '🏜️',
    property: 'Dry, red and hostile',
    blurb: 'Red sand and stone to the horizon, almost nothing green, and a night that bites. Water is the '
      + 'first thing to look for.',
    biomes: LAND_BIOMES,
    terrain: { base_height: 28, height_scale: 9, tree_density: 0.01, flora_density: 0.01 },
    surface: 'minecraft:red_sand',
    subsurface: 'minecraft:terracotta',
    spawners: ['creatureSparse', 'hostileHeavy'],
    structures: STRUCTURE_SETS.populated,
  },
  {
    id: 'sunken_shores',
    name: 'Sunken Shores',
    emoji: '🌊',
    property: 'A higher sea, so the land breaks into islands',
    blurb: 'The sea level rises above the hills, leaving coasts, islands and shallow straits. Boats and '
      + 'swimming matter.',
    biomes: [...LAND_BIOMES, 'ocean', 'warm_ocean', 'lukewarm_ocean', 'cold_ocean', 'river'],
    terrain: { sea_level: 34, base_height: 22, height_scale: 7 },
    spawners: ['creatureAbundant'],
    structures: STRUCTURE_SETS.maritime,
  },
  {
    id: 'dungeon_rush',
    name: 'Dungeon Rush',
    emoji: '🗝️',
    property: 'Built for exploring: many buried structures, few mobs',
    blurb: 'Trail ruins, trial chambers and ruined portals are common; the surface is quiet. Made for '
      + 'caving and looting rather than surviving.',
    biomes: LAND_BIOMES,
    terrain: { tree_density: 0.2 },
    spawners: ['creatureSparse', 'hostileSparse'],
    structures: STRUCTURE_SETS.dungeons,
  },
  {
    id: 'beast_wilds',
    name: 'Beast Wilds',
    emoji: '💀',
    property: 'Dangerous: dense hostile spawning, no structures to hide in',
    blurb: 'Night comes early and comes armed. Deliberately the hardest preset here, with nothing built to '
      + 'shelter in.',
    biomes: LAND_BIOMES,
    terrain: { tree_density: 0.25 },
    spawners: ['creatureSparse', 'hostileHeavy'],
    // Empty is not the same as silent: `noStructures` writes an empty structure set so the world really does
    // generate none, rather than falling back to the engine's baked three.
    noStructures: true,
    structures: [],
  },
]);

/** The preset a fresh install uses. The first entry, so the menu default and the code default agree. */
export const DEFAULT_GENERATION_PRESET = GENERATION_PRESETS[0].id;

/** One preset by id, or null. */
export function getGenerationPreset(id) {
  if (!id) return null;
  return GENERATION_PRESETS.find(p => p.id === id) ?? null;
}

/** The menu's view of the presets: what to show, and nothing about how they are built. */
export function generationPresetList() {
  return GENERATION_PRESETS.map(p => ({
    id: p.id,
    name: p.name,
    emoji: p.emoji,
    property: p.property,
    blurb: p.blurb,
    structureCount: (p.structures ?? STRUCTURE_SETS.default).length,
  }));
}

/** The biome file for one biome under one preset. */
function biomeFile(preset, biomeId) {
  const json = { engine_terrain: { ...(preset.terrain ?? {}) } };
  if (preset.surface) json.engine_terrain.surface_block = preset.surface;
  if (preset.subsurface) json.engine_terrain.subsurface_block = preset.subsurface;
  // An empty extension would be a pack that changes nothing; drop it so the file stays vanilla-shaped.
  if (Object.keys(json.engine_terrain).length === 0) delete json.engine_terrain;

  const spawners = {};
  for (const setName of preset.spawners ?? []) {
    const set = SPAWN_SETS[setName];
    if (!set) continue;
    for (const [category, list] of Object.entries(set)) spawners[category] = list;
  }
  // A preset that names no spawner set leaves spawning entirely alone, which is different from writing an
  // empty `spawners` block -- that would suppress every spawn in the biome.
  if (Object.keys(spawners).length) json.spawners = spawners;
  // Climate to match the surface, so a frozen world does not snow on red sand.
  if (preset.temperature !== undefined) json.temperature = preset.temperature;
  return json;
}

/**
 * Build a preset into pack files.
 *
 * @param {string} id
 * @returns {{files: object, name: string}|null} null for an unknown id, so a stale saved selection cannot
 *   throw during world creation.
 */
export function buildPresetPack(id) {
  const preset = getGenerationPreset(id);
  if (!preset) return null;
  const files = {};
  const namespace = `preset_${preset.id}`;
  for (const biomeId of preset.biomes ?? LAND_BIOMES) {
    files[`data/${namespace}/worldgen/biome/${biomeId}.json`] = biomeFile(preset, biomeId);
  }
  for (const structureId of preset.structures ?? []) {
    // Only structures the engine can build: a name with no generator would plan nothing while the world
    // reported it as enabled.
    if (!BUILDABLE.has(structureId)) continue;
    files[`data/${namespace}/worldgen/structure/${structureId}.json`] = {
      type: 'minecraft:jigsaw',
      // The biomes field is informational here; the engine decides placement from its own registry.
      biomes: '#minecraft:has_structure/' + structureId,
    };
  }
  // A preset that wants NO structures cannot say so by listing none -- that is indistinguishable from saying
  // nothing, and the engine falls back to its baked three. An empty structure set is the explicit statement.
  //
  // It carries a real `placement` block rather than just `structures: []`, because a vanilla structure set
  // requires one and the loader's validator says so: a file that is not a valid structure set is skipped
  // before any of this can read it, which is how the first version of this silently did nothing.
  if (preset.noStructures) {
    files[`data/${namespace}/worldgen/structure_set/none.json`] = {
      structures: [],
      placement: { type: 'minecraft:random_spread', spacing: 32, separation: 8, salt: 1 },
    };
  }
  return { files, name: preset.name };
}

/**
 * How many files each preset builds, and whether the structures it names are all buildable.
 *
 * For a test and for a build report: a preset that silently enables nothing would look identical to one that
 * works until you walked the world.
 */
export function presetReport() {
  return GENERATION_PRESETS.map(p => {
    const built = buildPresetPack(p.id);
    const named = p.structures ?? [];
    const unbuildable = named.filter(id => !BUILDABLE.has(id));
    return {
      id: p.id,
      name: p.name,
      files: Object.keys(built?.files ?? {}).length,
      biomes: (p.biomes ?? LAND_BIOMES).length,
      structures: named.length - unbuildable.length,
      unbuildable,
    };
  });
}
