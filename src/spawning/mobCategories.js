// Mob categories: Minecraft's grouping of mobs for spawning, capping and despawning.
//
// Why this exists rather than one `MAX_MOBS` number.
//
// Minecraft does not have a single mob limit. It has eight categories, each with its OWN cap, its
// OWN spawn interval, its OWN set of biomes and its own despawn distance. A monster and a cow are
// constrained by completely independent budgets, which is why killing every cow near you does not
// make zombies appear, and why a crowded ocean does not stop hostiles spawning on the beach.
//
// The values here are Minecraft Java Edition 1.21.4's. The per-category cap is not a flat number
// of mobs: `MobCategory.getMaxInstancesPerChunk()` is multiplied by the number of spawnable chunks
// and divided by 289 (a 17x17 chunk square, the region around one player). Section 8 of
// docs/MOB_SPAWNING_ARCHITECTURE.md works the arithmetic through.
//
// `interval` is how many game ticks pass between spawn passes for that category. MONSTER and the
// other hostile-ish categories run every tick; CREATURE runs every 20 ticks (once per second),
// which is why animals trickle in rather than flooding a fresh area.
//
// Reference: Minecraft Wiki "Spawn" (Java Edition mob caps and spawn intervals), and PaperMC/Paper
// `MobCategory.java` / `NaturalSpawner.java` for the architecture. Behaviour reimplemented, no
// Mojang source copied.

/**
 * The eight vanilla categories.
 *
 * `despawnDistance` is the distance past which a mob of this category is removed. AMBIENT's 32 is
 * the bat rule; CREATURE's 128 is why farm animals stay put.
 */
export const MobCategory = Object.freeze({
  MONSTER: 'monster',
  CREATURE: 'creature',
  AMBIENT: 'ambient',
  AXOLOTLS: 'axolotls',
  UNDERGROUND_WATER_CREATURE: 'underground_water_creature',
  WATER_CREATURE: 'water_creature',
  WATER_AMBIENT: 'water_ambient',
  MISC: 'misc',
});

/** Every category in a stable order, for iteration and for the debug overlay. */
export const ALL_MOB_CATEGORIES = Object.freeze([
  MobCategory.MONSTER,
  MobCategory.CREATURE,
  MobCategory.AMBIENT,
  MobCategory.AXOLOTLS,
  MobCategory.UNDERGROUND_WATER_CREATURE,
  MobCategory.WATER_CREATURE,
  MobCategory.WATER_AMBIENT,
  MobCategory.MISC,
]);

/**
 * Per-category constants, matching Java Edition 1.21.4.
 *
 * `maxPerChunkArea` is vanilla's `getMaxInstancesPerChunk()`: the number of mobs allowed per 289
 * spawnable chunks.
 *
 * `isFriendly` is `MobCategory.isFriendly()`, used by the per-player cap. `isPersistent` is
 * `MobCategory.isPersistent()` -- NOT "is this mob persistent", but "does this category only spawn
 * on the slow 400-tick pass". MONSTER is the only category that is not persistent, which is the
 * whole reason hostile mobs are common and animals are rare.
 */
export const CATEGORY_INFO = Object.freeze({
  [MobCategory.MONSTER]: {
    maxPerChunkArea: 70,
    despawnDistance: 128,
    isFriendly: false,
    isPersistent: false,
    requiresHostileDifficulty: true,
  },
  [MobCategory.CREATURE]: {
    maxPerChunkArea: 10,
    despawnDistance: 128,
    isFriendly: true,
    isPersistent: true,
    requiresHostileDifficulty: false,
  },
  [MobCategory.AMBIENT]: {
    maxPerChunkArea: 15,
    // The bat's 32-block rule. `MobCategory.noDespawnDistance` is 32 for every category, and the
    // bat's shorter horizon comes from its own despawn behaviour; the category table's
    // getDespawnDistance is 128. See despawnManager.js.
    despawnDistance: 128,
    isFriendly: false,
    isPersistent: false,
    requiresHostileDifficulty: false,
  },
  [MobCategory.AXOLOTLS]: {
    maxPerChunkArea: 5,
    despawnDistance: 128,
    isFriendly: true,
    isPersistent: true,
    requiresHostileDifficulty: false,
  },
  [MobCategory.UNDERGROUND_WATER_CREATURE]: {
    maxPerChunkArea: 5,
    despawnDistance: 128,
    isFriendly: true,
    isPersistent: true,
    requiresHostileDifficulty: false,
  },
  [MobCategory.WATER_CREATURE]: {
    maxPerChunkArea: 5,
    despawnDistance: 128,
    isFriendly: true,
    isPersistent: true,
    requiresHostileDifficulty: false,
  },
  [MobCategory.WATER_AMBIENT]: {
    maxPerChunkArea: 20,
    // Fish despawn at 64 blocks rather than 128.
    despawnDistance: 64,
    isFriendly: false,
    isPersistent: false,
    requiresHostileDifficulty: false,
  },
  [MobCategory.MISC]: {
    maxPerChunkArea: -1, // unlimited: this is the "no natural spawning" bucket
    despawnDistance: 128,
    isFriendly: true,
    isPersistent: true,
    requiresHostileDifficulty: false,
  },
});

/**
 * The category a mob type belongs to.
 *
 * This is the engine's mob-type namespace (`zombie`, `glow_squid`, ...), which mostly matches
 * vanilla's entity ids. The mapping is explicit rather than derived from a tag on each spawner, so
 * a mob whose category nobody thought about is visible here as a deliberate entry rather than as
 * an accidental default.
 *
 * MISC is the default: a mob that is not in this table counts toward no cap and never spawns
 * naturally, which is the conservative answer for a command-spawned or event-spawned mob.
 */
export const MOB_TYPE_CATEGORY = Object.freeze({
  // --- MONSTER ---
  zombie: MobCategory.MONSTER,
  zombie_villager: MobCategory.MONSTER,
  husk: MobCategory.MONSTER,
  drowned: MobCategory.MONSTER,
  skeleton: MobCategory.MONSTER,
  stray: MobCategory.MONSTER,
  bogged: MobCategory.MONSTER,
  parched: MobCategory.MONSTER,
  wither_skeleton: MobCategory.MONSTER,
  creeper: MobCategory.MONSTER,
  spider: MobCategory.MONSTER,
  cave_spider: MobCategory.MONSTER,
  silverfish: MobCategory.MONSTER,
  endermite: MobCategory.MONSTER,
  enderman: MobCategory.MONSTER,
  witch: MobCategory.MONSTER,
  slime: MobCategory.MONSTER,
  phantom: MobCategory.MONSTER,
  magma_cube: MobCategory.MONSTER,
  blaze: MobCategory.MONSTER,
  ghast: MobCategory.MONSTER,
  piglin: MobCategory.MONSTER,
  piglin_brute: MobCategory.MONSTER,
  zombified_piglin: MobCategory.MONSTER,
  zombie_pigman: MobCategory.MONSTER,
  hoglin: MobCategory.MONSTER,
  zoglin: MobCategory.MONSTER,
  guardian: MobCategory.MONSTER,
  elder_guardian: MobCategory.MONSTER,
  shulker: MobCategory.MONSTER,
  vindicator: MobCategory.MONSTER,
  evoker: MobCategory.MONSTER,
  illusioner: MobCategory.MONSTER,
  pillager: MobCategory.MONSTER,
  ravager: MobCategory.MONSTER,
  vex: MobCategory.MONSTER,
  warden: MobCategory.MONSTER,
  breeze: MobCategory.MONSTER,
  creaking: MobCategory.MONSTER,
  giant: MobCategory.MONSTER,
  // Parched skeleton horse riders and the other undead horses are MONSTER in vanilla.
  skeleton_horse: MobCategory.MONSTER,
  zombie_horse: MobCategory.MONSTER,

  // --- CREATURE ---
  pig: MobCategory.CREATURE,
  cow: MobCategory.CREATURE,
  mooshroom: MobCategory.CREATURE,
  sheep: MobCategory.CREATURE,
  chicken: MobCategory.CREATURE,
  rabbit: MobCategory.CREATURE,
  fox: MobCategory.CREATURE,
  wolf: MobCategory.CREATURE,
  cat: MobCategory.CREATURE,
  ocelot: MobCategory.CREATURE,
  horse: MobCategory.CREATURE,
  donkey: MobCategory.CREATURE,
  mule: MobCategory.CREATURE,
  llama: MobCategory.CREATURE,
  trader_llama: MobCategory.CREATURE,
  goat: MobCategory.CREATURE,
  panda: MobCategory.CREATURE,
  polar_bear: MobCategory.CREATURE,
  bee: MobCategory.CREATURE,
  parrot: MobCategory.CREATURE,
  turtle: MobCategory.CREATURE,
  armadillo: MobCategory.CREATURE,
  camel: MobCategory.CREATURE,
  sniffer: MobCategory.CREATURE,
  frog: MobCategory.CREATURE,
  allay: MobCategory.CREATURE,
  villager: MobCategory.CREATURE,
  wandering_trader: MobCategory.CREATURE,
  iron_golem: MobCategory.CREATURE,
  snow_golem: MobCategory.CREATURE,
  happy_ghast: MobCategory.CREATURE,
  copper_golem: MobCategory.CREATURE,

  // --- AMBIENT ---
  bat: MobCategory.AMBIENT,

  // --- AXOLOTLS ---
  axolotl: MobCategory.AXOLOTLS,

  // --- UNDERGROUND_WATER_CREATURE ---
  glow_squid: MobCategory.UNDERGROUND_WATER_CREATURE,

  // --- WATER_CREATURE ---
  //
  // Squid and dolphin only. The four FISH are WATER_AMBIENT, not WATER_CREATURE -- they have their
  // own category with a different cap (20 rather than 5), a different despawn distance (64 rather
  // than 128) and a different player sphere (64 rather than 128). Putting them here, as an earlier
  // version of this table did, silently gave an ocean three times the fish it should have and made
  // every cod immortal outside 128 blocks.
  squid: MobCategory.WATER_CREATURE,
  dolphin: MobCategory.WATER_CREATURE,
  octopus: MobCategory.WATER_CREATURE,

  // --- WATER_AMBIENT ---
  cod: MobCategory.WATER_AMBIENT,
  salmon: MobCategory.WATER_AMBIENT,
  pufferfish: MobCategory.WATER_AMBIENT,
  tropical_fish: MobCategory.WATER_AMBIENT,
  tadpole: MobCategory.WATER_AMBIENT,

  // --- MISC (never spawns naturally) ---
  ender_dragon: MobCategory.MISC,
  wither: MobCategory.MISC,
  giant_misc: MobCategory.MISC,
  tournament_host: MobCategory.MISC,
  site_manager: MobCategory.MISC,
  jackie_chun: MobCategory.MISC,
});

/**
 * The category for a mob type, defaulting to MISC.
 *
 * MISC has no cap and is never chosen by natural spawning, so an unlisted mob behaves exactly as a
 * command-spawned one should: it exists, it counts toward nothing, and it is never culled for being
 * far from a player.
 */
export function categoryOf(mobType) {
  return MOB_TYPE_CATEGORY[mobType] || MobCategory.MISC;
}

/** Does this type's category require a hostile difficulty to spawn naturally? */
export function categoryNeedsHostileDifficulty(mobType) {
  const info = CATEGORY_INFO[categoryOf(mobType)];
  return !!info?.requiresHostileDifficulty;
}

/** How far a mob of this type may stray before natural despawning applies. */
export function despawnDistanceFor(mobType) {
  return CATEGORY_INFO[categoryOf(mobType)]?.despawnDistance ?? 128;
}

/** Does a mob of this category get removed for being far away? */
export function categoryDespawnsForDistance(mobType) {
  const info = CATEGORY_INFO[categoryOf(mobType)];
  return !!info && !info.isFriendly;
}
