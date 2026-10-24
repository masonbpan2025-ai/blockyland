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
// terrain, `engine_spawning` for density, and vanilla-shaped `spawners` for species. The engine extensions
// are documented in docs/generation-pack-wildlife.md; vanilla readers ignore those keys.
//
// The names describe what each pack DOES rather than borrowing a third-party pack's name, because none of
// these is that pack: they express the same IDEA with the levers this engine actually has.
import { generatableStructureIds, WORLD_STRUCTURE_IDS } from './worldStructures.js';
import { BIOME_SPAWN_TABLES } from './spawning/vanillaBiomeSpawns.js';
import { BIOMES } from './biomes.js';

const AQUATIC_BIOMES = ['ocean', 'deep_ocean', 'warm_ocean', 'lukewarm_ocean', 'deep_lukewarm_ocean',
  'cold_ocean', 'deep_cold_ocean', 'frozen_ocean', 'deep_frozen_ocean', 'river', 'frozen_river'];
const CAVE_BIOMES = ['lush_caves', 'dripstone_caves', 'deep_dark', 'sulfur_caves', 'ice_caves'];
const mobEntry = (type, weight = 20, minCount = 1, maxCount = 2) => ({ type: `minecraft:${type}`, weight, minCount, maxCount });

// Rates and caps are independent of relative species weights. These apply only to authored presets.
export const SPAWN_PROFILES = {
  pollinator_meadows: { generation: { creature: { probability: 0.9, groups: 1 } }, caps: { creature: 160, monster: 12 }, chance: { monster: 0.12 }, passive_interval: 100 },
  jungle_canopy: { generation: { creature: { probability: 0.9, groups: 1 }, ambient: { probability: 0.3, groups: 1 }, water_ambient: { probability: 0.7, groups: 1 } }, caps: { creature: 160, ambient: 24, water_ambient: 60 }, passive_interval: 100 },
  taiga_trails: { generation: { creature: { probability: 0.8, groups: 1 } }, caps: { creature: 120 }, passive_interval: 140 },
  desert_caravans: { generation: { creature: { probability: 0.65, groups: 1 } }, caps: { creature: 100 }, passive_interval: 180 },
  reef_life: { generation: { water_ambient: { probability: 0.95, groups: 2 }, water_creature: { probability: 0.7, groups: 1 } }, caps: { water_ambient: 100, water_creature: 40 }, passive_interval: 80 },
  mushroom_sanctuary: { generation: { creature: { probability: 0.9, groups: 1 }, ambient: { probability: 0.3, groups: 1 } }, caps: { creature: 140, monster: 0, ambient: 24 }, passive_interval: 120 },
  lush_havens: { generation: { creature: { probability: 0.95, groups: 1 }, water_ambient: { probability: 0.85, groups: 2 },
    water_creature: { probability: 0.4, groups: 1 }, ambient: { probability: 0.3, groups: 1 }, axolotls: { probability: 0.5, groups: 1 } },
    caps: { creature: 240, monster: 12, ambient: 24, water_ambient: 80, water_creature: 24, axolotls: 12 },
    chance: { monster: 0.12 }, passive_interval: 80 },
  verdant_overgrowth: { generation: { creature: { probability: 0.8, groups: 2 }, water_ambient: { probability: 0.65, groups: 1 }, ambient: { probability: 0.5, groups: 1 } },
    caps: { creature: 180, monster: 70, water_ambient: 50 }, passive_interval: 100 },
  amber_autumn: { generation: { creature: { probability: 0.65, groups: 2 }, water_ambient: { probability: 0.4, groups: 1 } }, caps: { creature: 120 }, passive_interval: 160 },
  frozen_frontier: { generation: { creature: { probability: 0.45, groups: 1 }, water_ambient: { probability: 0.5, groups: 1 } }, caps: { creature: 60, monster: 40, water_ambient: 40 }, passive_interval: 200 },
  scorched_badlands: { generation: { creature: { probability: 0.08, groups: 1 } }, caps: { creature: 16, monster: 100 }, passive_interval: 600 },
  sunken_shores: { generation: { creature: { probability: 0.5, groups: 1 }, water_ambient: { probability: 0.95, groups: 2 }, water_creature: { probability: 0.7, groups: 1 } },
    caps: { creature: 80, water_ambient: 100, water_creature: 40 }, passive_interval: 80 },
  dungeon_rush: { generation: { creature: { probability: 0.06, groups: 1 } }, caps: { creature: 12, monster: 8 }, chance: { monster: 0.08 }, passive_interval: 800 },
  beast_wilds: { generation: { creature: { probability: 0.12, groups: 1 } }, caps: { creature: 24, monster: 120 }, passive_interval: 400 },
};

function habitatSpawns(biome, preset, native) {
  const cold = COLD_BIOMES.includes(biome) || preset.id === 'frozen_frontier';
  const water = AQUATIC_BIOMES.includes(biome);
  const cave = CAVE_BIOMES.includes(biome);
  let creatures;
  if (preset.id === 'amber_autumn') creatures = ['wolf', 'fox', 'rabbit'];
  else if (cold) creatures = ['polar_bear', 'rabbit', 'wolf', 'fox', 'goat'];
  else if (ARID_BIOMES.includes(biome) && preset.id !== 'sunken_shores') creatures = ['rabbit', 'camel', 'armadillo'];
  else if (biome === 'mushroom_fields') creatures = ['mooshroom'];
  else creatures = ['cow', 'sheep', 'pig', 'chicken', 'horse', 'rabbit', 'wolf', 'fox', 'bee', 'llama'];
  if (!cold && FOREST_BIOMES.includes(biome)) creatures.push('parrot');
  if (!cold && ['jungle', 'bamboo_jungle', 'sparse_jungle'].includes(biome)) creatures.push('panda', 'ocelot');
  if (!cold && ['swamp', 'mangrove_swamp'].includes(biome)) creatures.push('frog');
  if (water || cave) creatures = (native.creature ?? []).map(e => e.type.replace('minecraft:', ''));
  const warm = ['warm_ocean', 'lukewarm_ocean', 'deep_lukewarm_ocean', 'jungle', 'bamboo_jungle', 'mangrove_swamp', 'lush_caves'].includes(biome);
  return {
    creature: creatures.map(type => mobEntry(type, type === 'polar_bear' ? 60 : ['bee', 'parrot'].includes(type) ? 30 : 20)),
    ambient: biome === 'deep_dark' ? [] : [mobEntry('bat', 10, 1, 2)],
    water_ambient: biome === 'deep_dark' ? [] : (warm ? ['tropical_fish', 'pufferfish'] : ['salmon', 'cod']).map(type => mobEntry(type, 20, 2, 4)),
    water_creature: cave ? [] : [mobEntry('squid', 10, 1, 2), ...(water && !cold ? [mobEntry('dolphin', 5)] : [])],
    ...(biome === 'lush_caves' ? { axolotls: [mobEntry('axolotl', 20)] } : {}),
  };
}

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

/** Structures whose every block lies below this game's 64-block world, so enabling them places nothing visible. */
export const INVISIBLE_IN_SHORT_WORLD = new Set(['ancient_city', 'trial_chambers']);

/** The structure sets the presets draw on, all of them validated against what the engine can build. */
export const STRUCTURE_SETS = Object.freeze({
  /** The engine's own default set (WORLD_STRUCTURE_IDS: the three surface finds and the Nether's four). */
  default: [...WORLD_STRUCTURE_IDS],
  /** Every village variant plus the small surface finds -- a populated world. */
  populated: [
    'village_plains', 'village_desert', 'village_savanna', 'village_snowy', 'village_taiga',
    'pillager_outpost', 'igloo', 'desert_pyramid', 'jungle_pyramid', 'swamp_hut', 'trail_ruins',
    'ruined_portal', 'ruined_portal_desert', 'ruined_portal_jungle', 'ruined_portal_mountain',
    'ruined_portal_swamp', 'buried_treasure',
  ],
  /** Buried and underground finds, for a world that is about exploring. */
  // A preset's list replaces the default rather than adding to it, so this starts from the default: without it the
  // dungeon preset lost the monster rooms (the wiki's "Dungeon") and geodes, and the End its pillars and exit portal.
  dungeons: [...new Set([
    ...WORLD_STRUCTURE_IDS,
    'trial_chambers', 'ancient_city', 'trail_ruins', 'buried_treasure', 'ruined_portal',
    'mineshaft', 'mineshaft_mesa', 'stronghold',
    // The Nether's dungeons: the fortress and the bastion remnant.
    'fortress', 'bastion_remnant',
  ])].filter(id => BUILDABLE.has(id)),
  /** Coastal and oceanic. */
  maritime: [
    'shipwreck', 'shipwreck_beached', 'ocean_ruin_cold', 'ocean_ruin_warm', 'monument', 'buried_treasure',
  ],
  /**
   * Almost everything buildable, for the "as much as possible" preset.
   *
   * Minus the structures that write NOTHING in this game: the world is 64 blocks tall and these sit entirely
   * below it (ancient city at Y -51, trial chambers at Y -15), so enabling them only spends placement slots on
   * structures nobody can find and inflates `/locate`'s totals. They return when the world gets taller; the
   * structure audit plan (docs/STRUCTURE_AUDIT_PLAN.md) tracks that as the world-height blocker.
   */
  everything: [...BUILDABLE].filter(id => !INVISIBLE_IN_SHORT_WORLD.has(id)),
  /** Deliberately empty: a world with no structures at all. */
  none: [],
});

/**
 * The presets, in the order the menu lists them. Biome-focused packs modify only their named habitats.
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
    blurb: 'Frequent, varied wildlife on land and in water, calm nights, and villages and ruins to discover. The world is built '
      + 'for gathering and building rather than for fighting.',
    biomes: LAND_BIOMES,
    terrain: { tree_density: 0.28, flora_density: 0.35, tree_type: 'oak' },
    surface: 'minecraft:grass_block',
    spawners: ['creatureAbundant', 'hostileSparse'],
    structures: STRUCTURE_SETS.populated,
  },
  {
    // The pack for "structures are still hard to find". Two things make a structure easy to reach: variety and
    // proximity. This takes the variety -- every land biome, and every structure the engine can generate
    // (`everything`, which was defined for exactly this and wired to nothing). Proximity stays vanilla's
    // spacing, which `structureSpacingScale` divides by six, with villages pinned to a 7-chunk grid.
    id: 'structure_hunter',
    name: 'Structure Hunter',
    emoji: '🏛️',
    property: 'Every structure the engine can build, on every land biome',
    blurb: 'All land biomes in play with every generatable structure enabled: villages, outposts, pyramids, '
      + 'ruins, monuments, mineshafts, trial chambers and ancient cities in the same world, so there is '
      + 'something to find whichever way you walk.',
    biomes: LAND_BIOMES,
    terrain: { tree_density: 0.3, flora_density: 0.3, tree_type: 'oak' },
    surface: 'minecraft:grass_block',
    spawners: ['creatureAbundant', 'hostileSparse'],
    structures: STRUCTURE_SETS.everything,
    structureSpacingScale: 6,
    // Villages: a start every 5 chunks, never closer than 3 (48 blocks), so
    // roughly one village per 100 blocks of walking.
    structureSpacingOverrides: { villages: { spacing: 5, separation: 2 } },
  },
  {
    id: 'pollinator_meadows', name: 'Pollinator Meadows', emoji: '🐝',
    property: 'Open flowering meadows with bees and grazing animals',
    blurb: 'Flower forests, meadows and plains become open, flower-rich habitats for bees, sheep, cows and rabbits, with calm nights. Other biomes keep their own character.',
    biomes: ['plains', 'sunflower_plains', 'meadow', 'flower_forest', 'cherry_grove'],
    terrain: { tree_density: 0.08, flora_density: 0.65 },
    wildlife: ['bee', 'sheep', 'cow', 'rabbit'], spawners: ['hostileSparse'],
    structures: STRUCTURE_SETS.populated,
  },
  {
    id: 'jungle_canopy', name: 'Jungle Canopy', emoji: '🦜',
    property: 'Tropical woodland with parrots, pandas and river fish',
    blurb: 'Jungle biomes grow a dense jungle canopy with parrots, pandas, ocelots and tropical fish in their waterways. Sheltered caves support bats; nights keep their native dangers.',
    biomes: ['jungle', 'sparse_jungle', 'bamboo_jungle'],
    terrain: { tree_density: 0.5, tree_type: 'jungle', flora_density: 0.5 },
    wildlife: ['parrot', 'panda', 'ocelot', 'chicken'], spawners: ['creatureAbundant'],
    structures: ['jungle_pyramid', 'ruined_portal_jungle', 'trail_ruins'],
  },
  {
    id: 'taiga_trails', name: 'Taiga Trails', emoji: '🦊',
    property: 'Spruce woodland with foxes, wolves and rabbits',
    blurb: 'Taiga biomes become spruce woodland with frequent small groups of foxes, wolves and rabbits. Native snowy surfaces remain intact, with taiga villages and trail ruins enabled.',
    biomes: ['taiga', 'old_growth_pine_taiga', 'old_growth_spruce_taiga', 'snowy_taiga'],
    terrain: { tree_density: 0.32, tree_type: 'spruce', flora_density: 0.12 },
    wildlife: ['fox', 'wolf', 'rabbit'], spawners: ['creatureAbundant'],
    structures: ['village_taiga', 'trail_ruins', 'igloo'],
  },
  {
    id: 'desert_caravans', name: 'Desert Caravans', emoji: '🐪',
    property: 'Open arid habitats with camels, rabbits and armadillos',
    blurb: 'Deserts, badlands and savannas retain their native sand, terracotta and grass, with sparse vegetation and roaming camels, rabbits and armadillos. Desert and savanna settlements offer exploration.',
    biomes: ARID_BIOMES,
    terrain: { tree_density: 0.02, flora_density: 0.04 },
    wildlife: ['camel', 'rabbit', 'armadillo'], spawners: ['creatureAbundant'],
    structures: ['village_desert', 'village_savanna', 'desert_pyramid', 'ruined_portal_desert'],
  },
  {
    id: 'reef_life', name: 'Reef Life', emoji: '🐠',
    property: 'Warm seas with fish schools, squid and dolphins',
    blurb: 'Warm and lukewarm oceans keep their sea floor and coastline, while frequent tropical fish and pufferfish schools share the water with squid and dolphins. Maritime structures are enabled.',
    biomes: ['warm_ocean', 'lukewarm_ocean', 'deep_lukewarm_ocean'],
    terrain: { tree_density: 0.22, flora_density: 0.15 },
    habitatWildlife: true, spawners: ['creatureAbundant'], structures: STRUCTURE_SETS.maritime,
  },
  {
    id: 'mushroom_sanctuary', name: 'Mushroom Sanctuary', emoji: '🍄',
    property: 'Quiet mycelium islands with plentiful mooshrooms',
    blurb: 'Mushroom fields keep their mycelium and giant mushrooms, with frequent small mooshroom herds and no natural monsters in this biome. Other biomes remain unchanged.',
    biomes: ['mushroom_fields'], wildlife: ['mooshroom'],
    spawners: ['creatureAbundant'],
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
    property: 'Snowy terrain and cold-climate wildlife',
    blurb: 'Snow covers every land biome, with polar bears, rabbits and other cold-climate wildlife. Cold, sparse and quiet.',
    biomes: LAND_BIOMES,
    terrain: { tree_density: 0.12, tree_type: 'spruce', flora_density: 0.05 },
    surface: 'minecraft:snow_block',
    subsurface: 'minecraft:dirt',
    temperature: -0.5,
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
    blurb: 'Explore a wider mix of buried structures, including trail ruins, trial chambers and ruined portals; the surface is quiet. Made for '
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
    blurb: 'Nights come armed with dense hostile packs. Deliberately the hardest preset here, with nothing built to '
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
export function generationPresetList(biome = 'all') {
  return GENERATION_PRESETS.filter(p => {
    if (!biome || biome === 'all') return true;
    // The menu follows the pack's theme, including wildlife-only aquatic overrides.
    if (p.id === 'lush_havens') return [...LAND_BIOMES, ...AQUATIC_BIOMES, ...CAVE_BIOMES].includes(biome) && biome !== 'deep_dark';
    if (p.id === 'sunken_shores') return [...LAND_BIOMES, ...AQUATIC_BIOMES].includes(biome);
    if (p.id === 'frozen_frontier') return COLD_BIOMES.includes(biome);
    if (p.id === 'scorched_badlands') return ARID_BIOMES.includes(biome);
    return (p.biomes ?? LAND_BIOMES).includes(biome);
  }).map(p => ({
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

  const native = BIOME_SPAWN_TABLES[biomeId] ?? {};
  const spawners = Object.fromEntries(Object.entries(native).filter(([, list]) => Array.isArray(list))
    .map(([category, list]) => [category, list.map(e => ({ ...e, type: `minecraft:${e.type.replace('minecraft:', '')}` }))]));
  for (const setName of preset.spawners ?? []) {
    const set = SPAWN_SETS[setName];
    if (!set) continue;
    for (const [category, list] of Object.entries(set)) spawners[category] = list;
  }
  // A preset that names no spawner set leaves spawning entirely alone, which is different from writing an
  // empty `spawners` block -- that would suppress every spawn in the biome.
  if (preset.wildlife || preset.habitatWildlife || ['lush_havens', 'verdant_overgrowth', 'amber_autumn', 'frozen_frontier', 'sunken_shores'].includes(preset.id)) {
    Object.assign(spawners, habitatSpawns(biomeId, preset, native));
  }
  if (preset.wildlife) spawners.creature = preset.wildlife.map(type => mobEntry(type, ['bee', 'parrot'].includes(type) ? 40 : 20));
  if (['deep_dark', 'mushroom_fields'].includes(biomeId) && preset.id !== 'beast_wilds') spawners.monster = [];
  if (preset.id === 'scorched_badlands') spawners.creature = ['rabbit', 'camel', 'armadillo'].map(type => mobEntry(type));
  // Terrain-only presets leave the entire baked spawn table untouched.
  if (preset.spawners?.length) json.spawners = spawners;
  if (SPAWN_PROFILES[preset.id]) json.engine_spawning = SPAWN_PROFILES[preset.id];
  if (preset.id === 'amber_autumn') json.effects = { foliage_color: 0xc28538, grass_color: 0xb69b52, sky_color: 0xe6bb85 };
  // Lush wildlife keeps snow, sand and mycelium habitats rather than flattening every biome to grass.
  if (['lush_havens', 'verdant_overgrowth'].includes(preset.id)
    && (COLD_BIOMES.includes(biomeId) || ARID_BIOMES.includes(biomeId) || biomeId === 'mushroom_fields')) {
    delete json.engine_terrain.surface_block;
  }
  if (AQUATIC_BIOMES.includes(biomeId) || CAVE_BIOMES.includes(biomeId)) {
    // Wildlife-only overrides do not raise ocean floors or turn caves into surface forests.
    if (preset.id !== 'sunken_shores') delete json.engine_terrain;
  }
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
  const biomes = new Set(preset.biomes ?? LAND_BIOMES);
  if (['lush_havens', 'verdant_overgrowth', 'sunken_shores'].includes(preset.id)) {
    for (const biome of [...AQUATIC_BIOMES, ...CAVE_BIOMES]) if (BIOMES[biome]) biomes.add(biome);
  }
  if (preset.id === 'frozen_frontier') for (const biome of AQUATIC_BIOMES) if (COLD_BIOMES.includes(biome)) biomes.add(biome);
  for (const biomeId of biomes) {
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
  // A density boost: `spacing_scale` divides the grid structures are placed on, so the world has scale^2 times
  // as many candidate sites. The list is non-empty on purpose -- an empty one means "no structures".
  if (preset.structureSpacingScale > 1) {
    files[`data/${namespace}/worldgen/structure_set/density.json`] = {
      structures: (preset.structures ?? []).filter(s => BUILDABLE.has(s)).map(structure => ({ structure: `${namespace}:${structure}`, weight: 1 })),
      placement: { type: 'minecraft:random_spread', spacing: 32, separation: 8, salt: 1 },
      spacing_scale: preset.structureSpacingScale,
      ...(preset.structureSpacingOverrides ? { spacing_overrides: preset.structureSpacingOverrides } : {}),
    };
  }
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
