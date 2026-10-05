// GENERATED FILE - do not edit by hand.
//
// Vanilla biome spawn tables for Minecraft Java Edition 1.21.4.
//
// Produced by scripts/generate-mob-spawn-data.mjs from misode/mcmeta branch `1.21.4-data`,
// which mirrors the vanilla data pack. Only each biome's `spawners` block is reproduced; the
// terrain, feature and effect data is not.
//
// Each entry is { type, weight, minCount, maxCount } exactly as the vanilla data pack states it.
// `type` is this engine's mob-type id, which equals vanilla's entity path except where
// TYPE_ALIASES in the generator says otherwise.
//
// Regenerate with:
//   node scripts/generate-mob-spawn-data.mjs

/**
 * Every biome's spawn table, keyed by this engine's biome id.
 *
 * A biome absent from this map has no natural spawns at all, which is the correct answer for e.g.
 * `the_void`. `getBiomeSpawnTable` handles that alongside the engine-only aliases.
 */
export const BIOME_SPAWN_TABLES = {
  badlands: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'armadillo', weight: 6, minCount: 1, maxCount: 2 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  bamboo_jungle: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'ocelot', weight: 2, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'pig', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'cow', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'parrot', weight: 40, minCount: 1, maxCount: 2 },
      { type: 'panda', weight: 80, minCount: 1, maxCount: 2 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  basalt_deltas: {
    monster: [
      { type: 'ghast', weight: 40, minCount: 1, maxCount: 1 },
      { type: 'magma_cube', weight: 100, minCount: 2, maxCount: 5 },
    ],
    creature: [
      { type: 'strider', weight: 60, minCount: 1, maxCount: 2 },
    ],
  },
  beach: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'turtle', weight: 5, minCount: 2, maxCount: 5 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  birch_forest: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'pig', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'cow', weight: 8, minCount: 4, maxCount: 4 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  cherry_grove: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'pig', weight: 1, minCount: 1, maxCount: 2 },
      { type: 'rabbit', weight: 2, minCount: 2, maxCount: 6 },
      { type: 'sheep', weight: 2, minCount: 2, maxCount: 4 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  cold_ocean: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'drowned', weight: 5, minCount: 1, maxCount: 1 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
    water_creature: [
      { type: 'squid', weight: 3, minCount: 1, maxCount: 4 },
    ],
    water_ambient: [
      { type: 'cod', weight: 15, minCount: 3, maxCount: 6 },
      { type: 'salmon', weight: 15, minCount: 1, maxCount: 5 },
    ],
  },
  crimson_forest: {
    monster: [
      { type: 'zombified_piglin', weight: 1, minCount: 2, maxCount: 4 },
      { type: 'hoglin', weight: 9, minCount: 3, maxCount: 4 },
      { type: 'piglin', weight: 5, minCount: 3, maxCount: 4 },
    ],
    creature: [
      { type: 'strider', weight: 60, minCount: 1, maxCount: 2 },
    ],
  },
  dark_forest: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'pig', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'cow', weight: 8, minCount: 4, maxCount: 4 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  deep_cold_ocean: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'drowned', weight: 5, minCount: 1, maxCount: 1 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
    water_creature: [
      { type: 'squid', weight: 3, minCount: 1, maxCount: 4 },
    ],
    water_ambient: [
      { type: 'cod', weight: 15, minCount: 3, maxCount: 6 },
      { type: 'salmon', weight: 15, minCount: 1, maxCount: 5 },
    ],
  },
  deep_dark: {

  },
  deep_frozen_ocean: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'drowned', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'polar_bear', weight: 1, minCount: 1, maxCount: 2 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
    water_creature: [
      { type: 'squid', weight: 1, minCount: 1, maxCount: 4 },
    ],
    water_ambient: [
      { type: 'salmon', weight: 15, minCount: 1, maxCount: 5 },
    ],
  },
  deep_lukewarm_ocean: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'drowned', weight: 5, minCount: 1, maxCount: 1 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
    water_creature: [
      { type: 'squid', weight: 8, minCount: 1, maxCount: 4 },
      { type: 'dolphin', weight: 2, minCount: 1, maxCount: 2 },
    ],
    water_ambient: [
      { type: 'cod', weight: 8, minCount: 3, maxCount: 6 },
      { type: 'pufferfish', weight: 5, minCount: 1, maxCount: 3 },
      { type: 'tropical_fish', weight: 25, minCount: 8, maxCount: 8 },
    ],
  },
  deep_ocean: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'drowned', weight: 5, minCount: 1, maxCount: 1 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
    water_creature: [
      { type: 'squid', weight: 1, minCount: 1, maxCount: 4 },
      { type: 'dolphin', weight: 1, minCount: 1, maxCount: 2 },
    ],
    water_ambient: [
      { type: 'cod', weight: 10, minCount: 3, maxCount: 6 },
    ],
  },
  desert: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 19, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 1, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'husk', weight: 80, minCount: 4, maxCount: 4 },
    ],
    creature: [
      { type: 'rabbit', weight: 4, minCount: 2, maxCount: 3 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  dripstone_caves: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'drowned', weight: 95, minCount: 4, maxCount: 4 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  end_barrens: {
    monster: [
      { type: 'enderman', weight: 10, minCount: 4, maxCount: 4 },
    ],
  },
  end_highlands: {
    monster: [
      { type: 'enderman', weight: 10, minCount: 4, maxCount: 4 },
    ],
  },
  end_midlands: {
    monster: [
      { type: 'enderman', weight: 10, minCount: 4, maxCount: 4 },
    ],
  },
  eroded_badlands: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'armadillo', weight: 6, minCount: 1, maxCount: 2 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  flower_forest: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'pig', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'cow', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'rabbit', weight: 4, minCount: 2, maxCount: 3 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  forest: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'pig', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'cow', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'wolf', weight: 5, minCount: 4, maxCount: 4 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  frozen_ocean: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'drowned', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'polar_bear', weight: 1, minCount: 1, maxCount: 2 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
    water_creature: [
      { type: 'squid', weight: 1, minCount: 1, maxCount: 4 },
    ],
    water_ambient: [
      { type: 'salmon', weight: 15, minCount: 1, maxCount: 5 },
    ],
  },
  frozen_peaks: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'goat', weight: 5, minCount: 1, maxCount: 3 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  frozen_river: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'drowned', weight: 1, minCount: 1, maxCount: 1 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
    water_creature: [
      { type: 'squid', weight: 2, minCount: 1, maxCount: 4 },
    ],
    water_ambient: [
      { type: 'salmon', weight: 5, minCount: 1, maxCount: 5 },
    ],
  },
  grove: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'wolf', weight: 1, minCount: 1, maxCount: 1 },
      { type: 'rabbit', weight: 8, minCount: 2, maxCount: 3 },
      { type: 'fox', weight: 4, minCount: 2, maxCount: 4 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  ice_caves: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'drowned', weight: 95, minCount: 4, maxCount: 4 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  ice_spikes: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 20, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'stray', weight: 80, minCount: 4, maxCount: 4 },
    ],
    creature: [
      { type: 'rabbit', weight: 10, minCount: 2, maxCount: 3 },
      { type: 'polar_bear', weight: 1, minCount: 1, maxCount: 2 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  jagged_peaks: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'goat', weight: 5, minCount: 1, maxCount: 3 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  jungle: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'ocelot', weight: 2, minCount: 1, maxCount: 3 },
    ],
    creature: [
      { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'pig', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'cow', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'parrot', weight: 40, minCount: 1, maxCount: 2 },
      { type: 'panda', weight: 1, minCount: 1, maxCount: 2 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  lukewarm_ocean: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'drowned', weight: 5, minCount: 1, maxCount: 1 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
    water_creature: [
      { type: 'squid', weight: 10, minCount: 1, maxCount: 2 },
      { type: 'dolphin', weight: 2, minCount: 1, maxCount: 2 },
    ],
    water_ambient: [
      { type: 'cod', weight: 15, minCount: 3, maxCount: 6 },
      { type: 'pufferfish', weight: 5, minCount: 1, maxCount: 3 },
      { type: 'tropical_fish', weight: 25, minCount: 8, maxCount: 8 },
    ],
  },
  lush_caves: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    axolotls: [
      { type: 'axolotl', weight: 10, minCount: 4, maxCount: 6 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
    water_ambient: [
      { type: 'tropical_fish', weight: 25, minCount: 8, maxCount: 8 },
    ],
  },
  mangrove_swamp: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 70, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'slime', weight: 1, minCount: 1, maxCount: 1 },
      { type: 'bogged', weight: 30, minCount: 4, maxCount: 4 },
    ],
    creature: [
      { type: 'frog', weight: 10, minCount: 2, maxCount: 5 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
    water_ambient: [
      { type: 'tropical_fish', weight: 25, minCount: 8, maxCount: 8 },
    ],
  },
  meadow: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'donkey', weight: 1, minCount: 1, maxCount: 2 },
      { type: 'rabbit', weight: 2, minCount: 2, maxCount: 6 },
      { type: 'sheep', weight: 2, minCount: 2, maxCount: 4 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  mushroom_fields: {
    creature: [
      { type: 'mooshroom', weight: 8, minCount: 4, maxCount: 8 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  nether: {
    monster: [
      { type: 'ghast', weight: 50, minCount: 4, maxCount: 4 },
      { type: 'zombified_piglin', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'magma_cube', weight: 2, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 1, minCount: 4, maxCount: 4 },
      { type: 'piglin', weight: 15, minCount: 4, maxCount: 4 },
    ],
    creature: [
      { type: 'strider', weight: 60, minCount: 1, maxCount: 2 },
    ],
  },
  nether_wastes: {
    monster: [
      { type: 'ghast', weight: 50, minCount: 4, maxCount: 4 },
      { type: 'zombified_piglin', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'magma_cube', weight: 2, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 1, minCount: 4, maxCount: 4 },
      { type: 'piglin', weight: 15, minCount: 4, maxCount: 4 },
    ],
    creature: [
      { type: 'strider', weight: 60, minCount: 1, maxCount: 2 },
    ],
  },
  ocean: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'drowned', weight: 5, minCount: 1, maxCount: 1 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
    water_creature: [
      { type: 'squid', weight: 1, minCount: 1, maxCount: 4 },
      { type: 'dolphin', weight: 1, minCount: 1, maxCount: 2 },
    ],
    water_ambient: [
      { type: 'cod', weight: 10, minCount: 3, maxCount: 6 },
    ],
  },
  old_growth_birch_forest: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'pig', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'cow', weight: 8, minCount: 4, maxCount: 4 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  old_growth_pine_taiga: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 25, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'pig', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'cow', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'wolf', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'rabbit', weight: 4, minCount: 2, maxCount: 3 },
      { type: 'fox', weight: 8, minCount: 2, maxCount: 4 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  old_growth_spruce_taiga: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'pig', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'cow', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'wolf', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'rabbit', weight: 4, minCount: 2, maxCount: 3 },
      { type: 'fox', weight: 8, minCount: 2, maxCount: 4 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  pale_garden: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  plains: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'pig', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'cow', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'horse', weight: 5, minCount: 2, maxCount: 6 },
      { type: 'donkey', weight: 1, minCount: 1, maxCount: 3 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  river: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'drowned', weight: 100, minCount: 1, maxCount: 1 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
    water_creature: [
      { type: 'squid', weight: 2, minCount: 1, maxCount: 4 },
    ],
    water_ambient: [
      { type: 'salmon', weight: 5, minCount: 1, maxCount: 5 },
    ],
  },
  savanna: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'pig', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'cow', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'horse', weight: 1, minCount: 2, maxCount: 6 },
      { type: 'donkey', weight: 1, minCount: 1, maxCount: 1 },
      { type: 'armadillo', weight: 10, minCount: 2, maxCount: 3 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  savanna_plateau: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'pig', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'cow', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'horse', weight: 1, minCount: 2, maxCount: 6 },
      { type: 'donkey', weight: 1, minCount: 1, maxCount: 1 },
      { type: 'armadillo', weight: 10, minCount: 2, maxCount: 3 },
      { type: 'llama', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'wolf', weight: 8, minCount: 4, maxCount: 8 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  small_end_islands: {
    monster: [
      { type: 'enderman', weight: 10, minCount: 4, maxCount: 4 },
    ],
  },
  snowy_beach: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  snowy_plains: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 20, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'stray', weight: 80, minCount: 4, maxCount: 4 },
    ],
    creature: [
      { type: 'rabbit', weight: 10, minCount: 2, maxCount: 3 },
      { type: 'polar_bear', weight: 1, minCount: 1, maxCount: 2 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  snowy_slopes: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'rabbit', weight: 4, minCount: 2, maxCount: 3 },
      { type: 'goat', weight: 5, minCount: 1, maxCount: 3 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  snowy_taiga: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'pig', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'cow', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'wolf', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'rabbit', weight: 4, minCount: 2, maxCount: 3 },
      { type: 'fox', weight: 8, minCount: 2, maxCount: 4 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  soul_sand_valley: {
    monster: [
      { type: 'skeleton', weight: 20, minCount: 5, maxCount: 5 },
      { type: 'ghast', weight: 50, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 1, minCount: 4, maxCount: 4 },
    ],
    creature: [
      { type: 'strider', weight: 60, minCount: 1, maxCount: 2 },
    ],
  },
  sparse_jungle: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'pig', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'cow', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'wolf', weight: 8, minCount: 2, maxCount: 4 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  stony_peaks: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  stony_shore: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  sulfur_caves: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    axolotls: [
      { type: 'axolotl', weight: 10, minCount: 4, maxCount: 6 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
    water_ambient: [
      { type: 'tropical_fish', weight: 25, minCount: 8, maxCount: 8 },
    ],
  },
  sunflower_plains: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'pig', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'cow', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'horse', weight: 5, minCount: 2, maxCount: 6 },
      { type: 'donkey', weight: 1, minCount: 1, maxCount: 3 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  swamp: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 70, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'slime', weight: 1, minCount: 1, maxCount: 1 },
      { type: 'bogged', weight: 30, minCount: 4, maxCount: 4 },
    ],
    creature: [
      { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'pig', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'cow', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'frog', weight: 10, minCount: 2, maxCount: 5 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  taiga: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'pig', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'cow', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'wolf', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'rabbit', weight: 4, minCount: 2, maxCount: 3 },
      { type: 'fox', weight: 8, minCount: 2, maxCount: 4 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  the_end: {
    monster: [
      { type: 'enderman', weight: 10, minCount: 4, maxCount: 4 },
    ],
  },
  the_void: {

  },
  warm_ocean: {
    monster: [
      { type: 'drowned', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
    water_creature: [
      { type: 'squid', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'dolphin', weight: 2, minCount: 1, maxCount: 2 },
    ],
    water_ambient: [
      { type: 'pufferfish', weight: 15, minCount: 1, maxCount: 3 },
      { type: 'tropical_fish', weight: 25, minCount: 8, maxCount: 8 },
    ],
  },
  warped_forest: {
    monster: [
      { type: 'enderman', weight: 1, minCount: 4, maxCount: 4 },
    ],
    creature: [
      { type: 'strider', weight: 60, minCount: 1, maxCount: 2 },
    ],
  },
  windswept_forest: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'pig', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'cow', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'llama', weight: 5, minCount: 4, maxCount: 6 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  windswept_gravelly_hills: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'pig', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'cow', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'llama', weight: 5, minCount: 4, maxCount: 6 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  windswept_hills: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'pig', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'cow', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'llama', weight: 5, minCount: 4, maxCount: 6 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  windswept_savanna: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'sheep', weight: 12, minCount: 4, maxCount: 4 },
      { type: 'pig', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'chicken', weight: 10, minCount: 4, maxCount: 4 },
      { type: 'cow', weight: 8, minCount: 4, maxCount: 4 },
      { type: 'horse', weight: 1, minCount: 2, maxCount: 6 },
      { type: 'donkey', weight: 1, minCount: 1, maxCount: 1 },
      { type: 'armadillo', weight: 10, minCount: 2, maxCount: 3 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
  wooded_badlands: {
    monster: [
      { type: 'spider', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'zombie', weight: 95, minCount: 4, maxCount: 4 },
      { type: 'zombie_villager', weight: 5, minCount: 1, maxCount: 1 },
      { type: 'skeleton', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'creeper', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'slime', weight: 100, minCount: 4, maxCount: 4 },
      { type: 'enderman', weight: 10, minCount: 1, maxCount: 4 },
      { type: 'witch', weight: 5, minCount: 1, maxCount: 1 },
    ],
    creature: [
      { type: 'armadillo', weight: 6, minCount: 1, maxCount: 2 },
      { type: 'wolf', weight: 2, minCount: 4, maxCount: 8 },
    ],
    ambient: [
      { type: 'bat', weight: 10, minCount: 8, maxCount: 8 },
    ],
    underground_water_creature: [
      { type: 'glow_squid', weight: 10, minCount: 4, maxCount: 6 },
    ],
  },
};

/**
 * Engine biome ids with no vanilla 1.21.4 equivalent, and the vanilla table they borrow.
 *
 * Recorded as data rather than folded into BIOME_SPAWN_TABLES so the generator can be re-run and
 * so the parity document can name each deviation.
 */
export const ENGINE_ONLY_BIOME_ALIASES = {
  "nether": "nether_wastes",
  "ice_caves": "dripstone_caves",
  "sulfur_caves": "lush_caves"
};

/**
 * Engine biome ids that are not in the 1.21.4 data pack at all, and the table they resolve to.
 *
 * These are handled at lookup time rather than copied here, because there is nothing to copy.
 */
export const ENGINE_ONLY_BIOME_RUNTIME_ALIASES = {
  "dappled_forest": "forest"
};

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
export const BIOME_SPAWN_MOB_TYPES = Object.freeze(["armadillo","axolotl","bat","bogged","chicken","cod","cow","creeper","dolphin","donkey","drowned","enderman","fox","frog","ghast","glow_squid","goat","hoglin","horse","husk","llama","magma_cube","mooshroom","ocelot","panda","parrot","pig","piglin","polar_bear","pufferfish","rabbit","salmon","sheep","skeleton","slime","spider","squid","stray","strider","tropical_fish","turtle","witch","wolf","zombie","zombie_villager","zombified_piglin"]);
