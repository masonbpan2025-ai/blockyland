// SpawnPlacements: the registry that decides whether a candidate position is legal for a mob.
//
// Why a registry and not one `canSpawn()` function.
//
// Minecraft splits the question in two, and so does this:
//
//   1. GENERIC placement -- is there a solid floor under this position, is the right fluid present,
//      does the mob's box fit, is the position inside the world?  Answered from a placement TYPE
//      plus a HEIGHTMAP, so a new mob gets it for free by naming its family.
//   2. MOB-SPECIFIC predicate -- is it dark enough, is the block below the right one, is the biome
//      right, is the group size honoured?  A per-mob function.
//
// Collapsing those into one function per mob is what produces the familiar bug where 40 mobs each
// reimplement a slightly different collision check and three of them get it wrong. The split also
// means the debug overlay can say WHICH stage refused: `INVALID_FLOOR` is a placement failure,
// `MOB_PREDICATE_FAILED` is a predicate failure, and the two want different fixes.
//
// Reference: Minecraft Wiki "Spawn" (spawn placement rules); PaperMC/Paper `SpawnPlacements.java`,
// `NaturalSpawner.java` and `Heightmap.java` for the architecture and constant names. Behaviour
// reimplemented; no Mojang source copied.

import { BLOCKS, BLOCK_DEFS } from '../blocks.js';

/**
 * How a mob family wants to be placed.
 *
 * These are vanilla's four `SpawnPlacementType`s. `NO_RESTRICTIONS` is used by mobs that place
 * themselves (the ender dragon, shulkers, allays) and only requires the box to fit.
 */
export const SpawnPlacementType = Object.freeze({
  ON_GROUND: 'on_ground',
  IN_WATER: 'in_water',
  IN_LAVA: 'in_lava',
  NO_RESTRICTIONS: 'no_restrictions',
});

/**
 * Which vertical scan a candidate position uses.
 *
 * Vanilla's `Heightmap.Types`. The distinction matters:
 *  - `MOTION_BLOCKING_NO_LEAVES` is the surface for walking mobs and stops at anything that blocks
 *    motion except leaves, which is why mobs can spawn under a canopy but not inside it.
 *  - `OCEAN_FLOOR` ignores fluids, so an aquatic mob's floor is the sea bed.
 *  - `WORLD_SURFACE` includes fluids, so a fish's "surface" is the top of the water column.
 */
export const HeightmapType = Object.freeze({
  MOTION_BLOCKING: 'motion_blocking',
  MOTION_BLOCKING_NO_LEAVES: 'motion_blocking_no_leaves',
  OCEAN_FLOOR: 'ocean_floor',
  OCEAN_FLOOR_WG: 'ocean_floor_wg',
  WORLD_SURFACE: 'world_surface',
  WORLD_SURFACE_WG: 'world_surface_wg',
});

/** Blocks that block motion for the purposes of the heightmaps above. */
const NON_MOTION_BLOCKING_NAMES = new Set([
  'air', 'water', 'lava', 'short_grass', 'grass', 'fern', 'large_fern', 'tall_grass', 'dead_bush',
  'dandelion', 'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip',
  'white_tulip', 'pink_tulip', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley', 'wither_rose',
  'sunflower', 'lilac', 'rose_bush', 'peony', 'torch', 'wall_torch', 'soul_torch', 'redstone_torch',
  'redstone_wire', 'rail', 'powered_rail', 'detector_rail', 'activator_rail', 'tripwire',
  'tripwire_hook', 'lever', 'stone_button', 'snow', 'lily_pad', 'kelp', 'kelp_plant',
  'seagrass', 'tall_seagrass', 'sugar_cane', 'vine', 'glow_lichen', 'sculk_vein', 'moss_carpet',
  'sapling', 'oak_sapling', 'spruce_sapling', 'birch_sapling', 'jungle_sapling', 'acacia_sapling',
  'dark_oak_sapling', 'cherry_sapling', 'pale_oak_sapling', 'mangrove_propagule', 'bamboo_sapling',
  'nether_sprouts', 'crimson_roots', 'warped_roots', 'soul_fire', 'fire', 'structure_void',
  'light', 'barrier',
]);

/** Is this block id one that does not block motion? Named so the heightmaps can share it. */
export function blocksMotion(blockId) {
  if (blockId === BLOCKS.AIR) return false;
  const def = BLOCK_DEFS[blockId];
  if (!def) return false;
  if (def.plant) return false;
  if (def.solid === false) return false;
  const name = String(def.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (NON_MOTION_BLOCKING_NAMES.has(name)) return false;
  return true;
}

/** Is this block a fluid a mob can be placed in? */
export function isWater(blockId) {
  return blockId === BLOCKS.WATER;
}

export function isLava(blockId) {
  return blockId === BLOCKS.LAVA;
}

/**
 * The registered spawn placement for a mob type.
 *
 * `placement`, `heightmap` and `predicate` are read by the spawner; `note` is documentation that
 * travels with the entry so the parity document and the code cannot drift.
 */
const REGISTRY = new Map();

/**
 * Register a mob's placement rules.
 *
 * @param {string|string[]} mobType one or more engine mob type ids sharing these rules
 * @param {object} spec
 * @param {string} spec.placement one of SpawnPlacementType
 * @param {string} spec.heightmap one of HeightmapType
 * @param {Function} [spec.predicate] `(context) => boolean`, the mob-specific rules
 * @param {string} [spec.note] why these rules, for the parity document
 */
export function registerSpawnPlacement(mobType, spec) {
  const types = Array.isArray(mobType) ? mobType : [mobType];
  for (const type of types) {
    REGISTRY.set(type, {
      placement: spec.placement ?? SpawnPlacementType.ON_GROUND,
      heightmap: spec.heightmap ?? HeightmapType.MOTION_BLOCKING_NO_LEAVES,
      predicate: spec.predicate ?? null,
      note: spec.note ?? '',
    });
  }
}

/**
 * The placement for a mob type.
 *
 * An unregistered mob gets `ON_GROUND` with a null predicate, which is the conservative default:
 * it means "this mob has not had its rules thought about", and the spawner reports that through the
 * debug overlay instead of inventing rules for it.
 */
export function spawnPlacementFor(mobType) {
  return REGISTRY.get(mobType) || {
    placement: SpawnPlacementType.ON_GROUND,
    heightmap: HeightmapType.MOTION_BLOCKING_NO_LEAVES,
    predicate: null,
    note: 'unregistered: generic rules only',
  };
}

/** Every registered mob type, for tests. */
export function registeredSpawnTypes() {
  return [...REGISTRY.keys()].sort();
}

/** Replace the registry wholesale. Tests only. */
export function clearSpawnPlacements() {
  REGISTRY.clear();
}
