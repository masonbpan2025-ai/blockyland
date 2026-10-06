// Mob-specific spawn predicates and the placement registrations that use them.
//
// Why this is a separate module from the generic validator.
//
// The generic validator answers "is there room for a mob here" and is identical for every mob. This
// module answers "is this a place THIS mob would choose", which is where Minecraft's rules actually
// live: a husk needs sky access, a drowned needs water above and below, a glow squid needs light 0
// and clay is not involved but a bat needs stone beneath it. Those are per-mob and they change
// between versions.
//
// Every predicate below cites the rule it implements, and every rule comes from
// docs/research/mob-spawning-1.21.4.md. Where this engine cannot express a rule exactly, the
// predicate says so in a comment and the deviation is listed in docs/MOB_SPAWNING_PARITY.md rather
// than being quietly approximated.
//
// The predicates deliberately do NOT repeat the generic checks: they never re-test collision, the
// floor, or player distance. Duplicating those is how a rule set drifts apart.
//
// Reference: Minecraft Wiki "Mob spawning", spawn-condition tables
// (<https://minecraft.wiki/w/Mob_spawning?action=raw&section=6>).

import { BLOCKS, BLOCK_DEFS } from '../blocks.js';
import {
  HeightmapType,
  SpawnPlacementType,
  registerSpawnPlacement,
} from './spawnPlacements.js';
import {
  MAX_SPAWN_DISTANCE_FISH,
  isPeaceful,
} from './spawnValidation.js';
import {
  SKY_DARKEN_MONSTER_THUNDER,
  monsterSpawnBlockLightLimit,
  sampleMonsterSpawnLightLevel,
} from './spawnClock.js';

/**
 * Vanilla's `Monster.isDarkEnoughToSpawn`, reproduced in full.
 *
 * This is the single most important function in the subsystem and the one most often got wrong. It
 * has THREE parts, and the first is the one secondary sources usually omit:
 *
 *   (A) `level.getBrightness(SKY, pos) > random.nextInt(32)` -> refuse.
 *       This is a lottery against RAW sky light, and it is why an exposed surface at night (sky
 *       light 15) fails about 47% of the time while a pitch-dark cave (sky light 0) always passes.
 *       Without it, surface spawning at night is roughly three times faster than it should be.
 *   (B) `monsterSpawnBlockLightLimit` from the DIMENSION TYPE. The Overworld and the End use 0, so
 *       any block light at all refuses the spawn; the Nether uses 15 and the clause is skipped.
 *   (C) `max(blockLight, skyLight - skyDarken) <= sample(random)`, where the bound is `uniform 0..7`
 *       in the Overworld and End (a plain `nextInt(8)`) and the constant 7 in the Nether. During a
 *       thunderstorm the skyDarken passed in is 10, not the ambient 5.
 *
 * RNG call order matters for parity: `nextInt(32)` first, then (no draw for B), then the sampled
 * bound. A port that draws them in a different order produces a different sequence for the same
 * seed.
 *
 * The caller must supply `skyDarken` already resolved for the dimension (0 where there is no sky
 * light). `thunder` selects the 10 override.
 *
 * @param {object} context
 * @param {number} context.skyLight         raw sky light 0..15
 * @param {number} context.blockLight       raw block light 0..15
 * @param {number} context.skyDarken        ambient darkening for the dimension and weather
 * @param {boolean} [context.thunder]       substitutes skyDarken 10 for the internal-light test
 * @param {string} context.dimension
 * @param {object} context.random
 */
export function monsterIsDarkEnoughToSpawn(context, random = context.random) {
  const skyLight = context.skyLight ?? 0;
  const blockLight = context.blockLight ?? 0;
  const dimension = context.dimension || 'overworld';

  // (A) The raw sky-light lottery.
  if (skyLight > random.nextInt(32)) return false;

  // (B) The dimension's block-light ceiling. A limit of 15 disables the clause.
  const limit = monsterSpawnBlockLightLimit(dimension);
  if (limit < 15 && blockLight > limit) return false;

  // (C) Internal light against a sampled bound.
  const skyDarken = context.thunder ? SKY_DARKEN_MONSTER_THUNDER : (context.skyDarken ?? 0);
  const internal = Math.max(blockLight, Math.max(0, skyLight - skyDarken));
  return internal <= sampleMonsterSpawnLightLevel(dimension, random);
}

/** Kept as a named export: the wiki's phrasing and older code both refer to the light test. */
export const hostileLightTest = (context) => monsterIsDarkEnoughToSpawn(context);

/** The End's stricter rule: the block light must be 0. Retained for the End's own dimension type. */
export function endLightTest({ blockLight }) {
  return blockLight === 0;
}

/**
 * Floor blocks a given mob accepts, by block id.
 *
 * The wiki lists these per mob. Any mob not named here falls back to the "any other passive mob"
 * rule of grass block, which is what vanilla's default is.
 */
function ids(...names) {
  const out = [];
  for (const name of names) {
    const id = BLOCKS[name.toUpperCase()];
    if (id !== undefined) out.push(id);
  }
  return out;
}

/** Build a Set from a list of block names, dropping names the registry does not have. */
function blockSet(names) {
  return new Set(ids(...names));
}

const GRASS = blockSet(['grass_block', 'grass']);
const DIRT_LIKE = blockSet(['grass_block', 'grass', 'coarse_dirt', 'podzol', 'dirt']);
const SNOWY_GROUND = blockSet(['grass_block', 'grass', 'snow', 'snow_block', 'podzol', 'coarse_dirt']);
const SANDY = blockSet(['sand', 'red_sand']);
const GOAT_GROUND = blockSet(['stone', 'gravel', 'packed_ice', 'snow', 'snow_block']);
const ARMADILLO_GROUND = blockSet(['grass_block', 'grass', 'coarse_dirt', 'red_sand', 'terracotta',
  'white_terracotta', 'orange_terracotta', 'yellow_terracotta', 'brown_terracotta']);
const FROG_GROUND = blockSet(['grass_block', 'grass', 'mud', 'mangrove_roots']);
const MOOSHROOM_GROUND = blockSet(['mycelium']);
const TURTLE_GROUND = blockSet(['sand']);
const BAT_GROUND = blockSet(['stone', 'granite', 'diorite', 'andesite', 'tuff', 'deepslate',
  'cobbled_deepslate']);
const POLAR_BEAR_GROUND = blockSet(['grass_block', 'grass', 'ice']);

/** Does a block emit light at or above the level that forbids spawning on top of it? */
function blockBelowEmitsTooMuch(blockId) {
  const def = BLOCK_DEFS[blockId];
  if (!def) return false;
  // Jack o'lanterns and lit redstone lamps are the wiki's named exceptions.
  const name = String(def.name || '').toLowerCase();
  if (name.includes('jack o') || name.includes('jack_o') || name.includes('redstone lamp') && name.includes('lit')) {
    return false;
  }
  return Number.isFinite(def.light) && def.light >= 14;
}

/** Is the block one that would damage a mob standing in it? */
function isDamagingBlock(blockId) {
  return blockId === BLOCKS.FIRE
    || blockId === BLOCKS.SOUL_FIRE
    || blockId === BLOCKS.LAVA
    || blockId === BLOCKS.MAGMA_BLOCK
    || blockId === BLOCKS.CACTUS
    || blockId === BLOCKS.POWDER_SNOW
    || blockId === BLOCKS.WITHER_ROSE
    || blockId === BLOCKS.SWEET_BERRY_BUSH;
}

/** Is the block one vanilla forbids spawning inside, regardless of collision? */
function isPreventedSpawnBlock(blockId) {
  const def = BLOCK_DEFS[blockId];
  if (!def) return false;
  if (def.rail) return true;
  const name = String(def.name || '').toLowerCase();
  // prevent_mob_spawning_inside: rails, and the pressure-plate/button family.
  return name.includes('rail')
    || name.includes('pressure plate')
    || name.includes('button')
    || name.includes('redstone wire')
    || name === 'tripwire';
}

/** Is this block a solid, complete top surface a hostile mob may stand on? */
function isSolidTopSurface(blockId) {
  if (blockId === BLOCKS.AIR) return false;
  const def = BLOCK_DEFS[blockId];
  if (!def) return false;
  if (def.plant) return false;
  if (def.solid === false) return false;
  // The wiki's exclusion list for hostile spawning floors.
  const name = String(def.name || '').toLowerCase();
  if (name.includes('glass') || name.includes('trapdoor') || name.includes('scaffolding')) return false;
  if (name.includes('leaves')) return false;
  if (name === 'bedrock' || name === 'barrier' || name === 'chorus flower' || name === 'copper grate') return false;
  if (name === 'ice' || name === 'frosted ice' || name === 'packed ice' || name === 'blue ice') return false;
  return true;
}

/** Compute a context field the predicates share: is the position exposed to the sky? */
function hasSkyExposure(world, x, y, z) {
  for (let sy = y + 1; sy < 64; sy++) {
    const id = world.getVoxel(x, sy, z);
    if (id === BLOCKS.AIR || id === BLOCKS.WATER) continue;
    const def = BLOCK_DEFS[id];
    if (def && (def.plant || def.transparent)) continue;
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// MONSTER predicates
// ---------------------------------------------------------------------------------------------

/**
 * The common hostile-mob predicate: dark enough by the three-part light rule, and standing on a
 * floor vanilla accepts.
 *
 * This is the shared helper the wiki's "for all hostiles other than guardians, drowned and phantoms"
 * bullet describes. Every monster predicate below composes it rather than repeating it.
 */
function commonHostileRules(context) {
  return monsterIsDarkEnoughToSpawn(context) && hostileFloorRules(context);
}

function hostileFloorRules({ blockBelow }) {
  const belowId = typeof blockBelow === 'number' ? blockBelow : BLOCKS.AIR;
  // Soul sand and mud count as valid floors even though they are not "solid, complete, top surface".
  if (belowId === BLOCKS.SOUL_SAND || belowId === BLOCKS.MUD) return true;
  if (!isSolidTopSurface(belowId)) return false;
  if (blockBelowEmitsTooMuch(belowId)) return false;
  return true;
}

/**
 * A generic overworld monster: the common hostile rules, plus "not inside a damaging block".
 */
export function genericMonsterPredicate(context) {
  return commonHostileRules(context) && !isDamagingBlock(context.blockAt);
}

/** Husk: "The location of the spawn must have sky access." */
export function huskPredicate(context) {
  return genericMonsterPredicate(context) && hasSkyExposure(context.world, Math.floor(context.x), context.y, Math.floor(context.z));
}

/** Stray: same sky-access requirement as the husk. */
export function strayPredicate(context) {
  return huskPredicate(context);
}

/**
 * Drowned.
 *
 * Wiki aquatic/hostile rules: "spawning block and block below must be water", and the per-biome
 * rarity: 1/15 in rivers, 1/40 in oceans, and in oceans the position must be at least 5 blocks below
 * sea level.
 *
 * The light rule: the wiki's hostile bullet list of mobs that are EXEMPT from the solid-floor and
 * block-light restrictions is "guardians, drowned, and phantoms", which is about the FLOOR, not about
 * light. Drowned are still monsters, so `Monster.isDarkEnoughToSpawn` applies. The previous version
 * ran no light test at all, which let a drowned spawn in a sunlit shallow puddle at noon.
 *
 * The floor rule is deliberately NOT applied: drowned spawn in open water with no block beneath
 * within reach, which is why they are on that exemption list.
 *
 * UNVERIFIED: whether 1.21.4's `Drowned.checkDrownedSpawnRules` uses the full three-part
 * `isDarkEnoughToSpawn` or a reduced form. The full monster rule is implemented because it is the
 * documented behaviour ("drowned do not spawn in bright water") and because treating them as
 * light-independent would be a much larger claim. Recorded in docs/MOB_SPAWNING_PARITY.md.
 */
export function drownedPredicate(context) {
  const { world, x, y, z, biomeId, dimension, random } = context;
  if (dimension !== 'overworld') return false;
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  if (world.getVoxel(bx, y, bz) !== BLOCKS.WATER) return false;
  if (world.getVoxel(bx, y - 1, bz) !== BLOCKS.WATER) return false;

  // Darkness first: the cheap, universal monster gate.
  if (!monsterIsDarkEnoughToSpawn(context)) return false;

  // Then the per-biome rarity. The rolls are skipped on Peaceful in vanilla, where drowned have a
  // spawn egg only; the caller already refuses hostiles there, so this is belt and braces.
  if (!isPeaceful(context.difficulty)) {
    const biome = String(biomeId || '');
    if (biome.includes('river')) {
      if (random.nextInt(15) !== 0) return false;
    } else if (biome.includes('ocean')) {
      if (random.nextInt(40) !== 0) return false;
      // "must be 5 blocks below sea level"
      const sea = world.seaLevel ?? 22;
      if (y > sea - 4) return false;
    }
  }
  return true;
}

/** Guardian: block and block below must be water; 95% failure if the block has sky exposure. */
export function guardianPredicate(context) {
  const { world, x, y, z, random } = context;
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  if (world.getVoxel(bx, y, bz) !== BLOCKS.WATER) return false;
  if (world.getVoxel(bx, y - 1, bz) !== BLOCKS.WATER) return false;
  if (hasSkyExposure(world, bx, y, bz) && random.nextInt(20) !== 0) return false;
  return true;
}

/**
 * Ghast.
 *
 * Wiki: "95% chance of spawn failure" -- so the roll ACCEPTS when it draws 0, not when it draws
 * anything else. The previous implementation wrote `nextInt(20) !== 0`, which accepted 19 of every
 * 20 attempts: a 95% success rate, the exact inverse. Enumerated in the tests for all 20 outcomes.
 *
 * Ghasts are also light-independent: the wiki's per-mob table marks them "Ghasts, magma cubes and
 * hoglins spawn regardless of light level", and their biome (nether wastes and soul sand valley) is
 * lit only by lava. So the generic hostile darkness test is deliberately NOT applied. The floor rule
 * IS applied, because the wiki's hostile bullet requires a solid complete top surface for
 * "all hostiles other than guardians, drowned and phantoms", and ghasts are not in that exclusion.
 */
export function ghastPredicate(context) {
  if (!isSolidTopSurface(context.blockBelow)) return false;
  return context.random.nextInt(20) === 0;
}

/** Magma cube: "Cannot spawn on liquid." */
export function magmaCubePredicate(context) {
  const below = context.blockBelow;
  if (below === BLOCKS.WATER || below === BLOCKS.LAVA) return false;
  return commonHostileRules(context);
}

/**
 * Slime.
 *
 * Two distinct rules: in a swamp it needs Y 51..69, a 50% roll and a moon-phase roll; otherwise it
 * needs to be in a slime chunk below Y 40 with a 90% failure chance. This engine does not model
 * per-chunk slime-chunk flags, so the slime-chunk branch uses a deterministic hash of the chunk
 * coordinates at the vanilla 1-in-10 density -- recorded as a deviation.
 */
export function slimePredicate(context) {
  const { world, x, y, z, biomeId, random } = context;
  if (!commonHostileRules(context)) return false;
  const biome = String(biomeId || '');
  if (biome.includes('swamp')) {
    if (y < 51 || y > 69) return false;
    if (random.nextInt(2) !== 0) return false;
    // Moon phase: this engine has no moon-phase model. A flat 50% stands in for it.
    return random.nextInt(2) === 0;
  }
  if (y >= 40) return false;
  // Slime chunk: deterministic per chunk, 1 in 10.
  const cx = Math.floor(x / 16);
  const cz = Math.floor(z / 16);
  const hash = (Math.imul(cx | 0, 0x9E3779B1) ^ Math.imul(cz | 0, 0x85EBCA77)) >>> 0;
  if (hash % 10 !== 0) return false;
  return random.nextInt(10) === 0;
}

/**
 * Skeleton in a nether fortress: "There is an 80% chance of spawning a wither skeleton instead."
 *
 * Implemented by refusing the skeleton 80% of the time so the fortress override's wither skeleton
 * entry takes the slot, which reproduces the ratio without a special-case mutation of the spawn list.
 */
export function fortressSkeletonPredicate(context) {
  if (context.structureId) {
    // Inside a fortress: only 20% of skeleton spawns stay skeletons.
    return context.random.nextInt(5) === 0 && commonHostileRules(context);
  }
  return commonHostileRules(context);
}

/** Piglin, hoglin and zombified piglin: "Cannot spawn on nether wart block." */
export function netherWartRefusingPredicate(context) {
  if (context.blockBelow === BLOCKS.NETHER_WART_BLOCK) return false;
  return commonHostileRules(context);
}

/** Wither skeleton and blaze: only ever inside a nether fortress. */
export function fortressOnlyPredicate(context) {
  if (!context.structureId) return false;
  return commonHostileRules(context);
}

/** Zombie horse: "Spawns only on grass blocks." */
export function zombieHorsePredicate(context) {
  return GRASS.has(context.blockBelow) && commonHostileRules(context);
}

/** Creaking: only in the pale garden, and only at night. */
export function creakingPredicate(context) {
  if (!String(context.biomeId || '').includes('pale_garden')) return false;
  if (!context.isNight) return false;
  return commonHostileRules(context);
}

/** Phantom: spawns in the air above a player who has not slept, so it is never a ground placement. */
export function phantomPredicate() {
  // The phantom's own spawner decides (see specialSpawners.js); the natural cycle never places one.
  return false;
}

// ---------------------------------------------------------------------------------------------
// AMBIENT predicate
// ---------------------------------------------------------------------------------------------

/**
 * Bat.
 *
 * Wiki: "the block directly below the spawning block must be stone, granite, diorite, andesite,
 * tuff, or deepslate (block tag `bats_spawnable_on`), and the spawning block should not be exposed
 * to the sky. The light level must be 4 or darker."
 */
export function batPredicate(context) {
  if (!BAT_GROUND.has(context.blockBelow)) return false;
  if (hasSkyExposure(context.world, Math.floor(context.x), context.y, Math.floor(context.z))) return false;
  return context.lightLevel <= 4;
}

// ---------------------------------------------------------------------------------------------
// CREATURE predicates
// ---------------------------------------------------------------------------------------------

/**
 * The shared passive rule.
 *
 * Wiki: "The mob's collision box must not collide with any liquid. The spawning block must have a
 * light level of 9 or greater." The light requirement is why animals do not appear in unlit caves.
 */
function passiveLightAndFluid(context) {
  const { world, x, y, z } = context;
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  if (world.getVoxel(bx, y, bz) === BLOCKS.WATER || world.getVoxel(bx, y, bz) === BLOCKS.LAVA) return false;
  return context.lightLevel >= 9;
}

/** Build a passive predicate that requires the floor block to be in `allowed`. */
function passiveOn(allowed, extra = null) {
  return (context) => {
    if (!allowed.has(context.blockBelow)) return false;
    if (!passiveLightAndFluid(context)) return false;
    if (extra && !extra(context)) return false;
    return true;
  };
}

/** Mooshroom: mycelium only. */
export const mooshroomPredicate = passiveOn(MOOSHROOM_GROUND);
/** Turtle: sand, and the spawn block must be Y 66 or lower. */
export const turtlePredicate = passiveOn(TURTLE_GROUND, ctx => ctx.y <= 66);
/** Parrot: grass, leaves, logs or air beneath. */
export const parrotPredicate = passiveOn(blockSet(['grass_block', 'grass', 'oak_leaves', 'oak_log']));
/** Rabbit: grass, sand, snow block or snow. */
export const rabbitPredicate = passiveOn(SANDY.size ? new Set([...DIRT_LIKE, ...SANDY, ...blockSet(['snow', 'snow_block'])]) : DIRT_LIKE);
/** Wolf: grass, podzol, coarse dirt, snow block or snow. */
export const wolfPredicate = passiveOn(SNOWY_GROUND);
/** Fox: the same floor set as the wolf. */
export const foxPredicate = passiveOn(SNOWY_GROUND);
/** Polar bear: grass block or ice. */
export const polarBearPredicate = passiveOn(POLAR_BEAR_GROUND);
/** Goat: stone, gravel, packed ice, snow block or snow. */
export const goatPredicate = passiveOn(GOAT_GROUND);
/** Armadillo: grass, coarse dirt, terracotta or red sand. */
export const armadilloPredicate = passiveOn(ARMADILLO_GROUND);
/** Frog: grass, mud, mangrove roots. */
export const frogPredicate = passiveOn(FROG_GROUND);
/** Camel: sand or red sand. */
export const camelPredicate = passiveOn(SANDY);
/** Everything else passive: grass block. */
export const defaultPassivePredicate = passiveOn(GRASS);
/** Ocelot: "1/3 chance of failure. Can spawn on leaves." */
export const ocelotPredicate = passiveOn(new Set([...DIRT_LIKE, ...blockSet(['oak_leaves', 'jungle_leaves'])]), ctx => ctx.random.nextInt(3) !== 0);

// ---------------------------------------------------------------------------------------------
// AQUATIC predicates
// ---------------------------------------------------------------------------------------------

/**
 * The shared WATER GEOMETRY test.
 *
 * This is deliberately only the geometry: the block at the mob's feet is water, and so is the block
 * below. It does NOT test the block above, because that is a per-species rule and not a water rule --
 * and it does not test elevation at all.
 *
 * The previous version bundled `above is water` and the 50..63 elevation band into one function used
 * by fish, squid, dolphin AND glow squid. That had three consequences, all bugs:
 *
 *  1. squid and dolphin were given a rule the wiki does not state for them ("the spawning block must
 *     be water" is the whole aquatic requirement; only the fish row adds blocks above and below);
 *  2. glow squid inherited an ocean sea-level band, which is the opposite of its habitat;
 *  3. the tropical-fish lush-cave exemption was tested AFTER the band, so it could never fire.
 */
function isInWaterColumn(context) {
  const { world, x, y, z } = context;
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  if (world.getVoxel(bx, y, bz) !== BLOCKS.WATER) return false;
  // Waterlogged blocks count as water for the floor: this engine models waterlogging separately.
  const below = world.getVoxel(bx, y - 1, bz);
  if (below === BLOCKS.WATER) return true;
  return !!world.isWaterlogged?.(bx, y - 1, bz);
}

/** Does the position have water directly above it, and is it not merely waterlogged there? */
function hasWaterAbove(context) {
  const { world, x, y, z } = context;
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  return world.getVoxel(bx, y + 1, bz) === BLOCKS.WATER;
}

/**
 * The elevation band the FISH rows are held to.
 *
 * Wiki: "the spawning block must be between level 50 and 63, inclusive. This does not apply to
 * tropical fish spawning in lush caves." Vanilla's band is absolute; this engine's sea level is
 * compressed (22 by default), so the band is expressed as a 13-block window ending at the biome's own
 * sea level. That is the `browser_adapted_1_21_4` substitution and it is recorded in
 * docs/MOB_SPAWNING_PARITY.md.
 */
function withinSeaLevelBand(context) {
  const sea = context.world.seaLevel ?? 63;
  const y = context.y;
  return y <= sea && y >= sea - 13;
}

/**
 * The reduced-water-ambient biomes.
 *
 * From the 1.21.4 data pack: `lush_caves` and `mangrove_swamp` list only `tropical_fish` under
 * `water_ambient`, and the vanilla tag `reduced_water_ambient_spawns` makes the spawner refuse 98% of
 * attempts there. That tag is what makes a lush cave's tropical fish rare rather than absent.
 */
const REDUCED_WATER_AMBIENT_BIOMES = new Set(['lush_caves', 'mangrove_swamp']);

function isReducedWaterAmbientBiome(biomeId) {
  return REDUCED_WATER_AMBIENT_BIOMES.has(String(biomeId || '').toLowerCase());
}

/**
 * The fish predicate family: cod, salmon, pufferfish, tropical fish.
 *
 * Wiki, the aquatic table's fish row: "the block directly below the spawning block must be water; the
 * block directly above the spawning block must be water and cannot be waterlogged; the spawning block
 * must be between level 50 and 63, inclusive. This does not apply to tropical fish spawning in lush
 * caves."
 *
 * The exemption is evaluated BEFORE the band, which is the whole point: a lush cave's water sits far
 * below sea level, so a band-first implementation refuses every one of its tropical fish.
 */
export function fishPredicate(context) {
  if (!isInWaterColumn(context)) return false;
  if (!hasWaterAbove(context)) return false;

  const biome = String(context.biomeId || '').toLowerCase();
  if (context.type === 'tropical_fish' && isReducedWaterAmbientBiome(biome)) {
    // The documented exemption: no elevation band inside these biomes.
    return true;
  }
  return withinSeaLevelBand(context);
}

/**
 * Squid.
 *
 * Wiki aquatic table: "The spawning block must be water." No block-above requirement and no
 * elevation band are stated for squid, so none is applied. (The band is listed only under the fish
 * rows.)
 */
export function squidPredicate(context) {
  return isInWaterColumn(context);
}

/**
 * Dolphin.
 *
 * Same stated requirement as squid. Frozen oceans are excluded by the biome table rather than by a
 * predicate, which is how vanilla expresses it too.
 */
export function dolphinPredicate(context) {
  return isInWaterColumn(context);
}

/**
 * Glow squid.
 *
 * A different category from squid (UNDERGROUND_WATER_CREATURE rather than WATER_CREATURE) with its own
 * rules, and emphatically not the ocean band:
 *
 * Wiki: "the light level must be 0. the spawning block must be level 30 or lower."
 *
 * `level 30 or lower` is an absolute Java Y. This engine's world is 64 tall with the surface around
 * y=30 and sea level 22, so the vanilla value would admit almost the entire world including open
 * ocean. The `browser_adapted_1_21_4` substitution is "below this engine's sea level minus 13", i.e.
 * deeper than a fish may be, which preserves the RULE (glow squid live deeper than fish) rather than
 * the number. Recorded as a deviation.
 */
export function glowSquidPredicate(context) {
  if (!isInWaterColumn(context)) return false;
  if (context.lightLevel !== 0) return false;
  const sea = context.world.seaLevel ?? 63;
  return context.y <= sea - 13;
}

/**
 * Axolotl.
 *
 * Wiki: "the block directly above the spawning block must not be a solid block; the block directly
 * below the spawning block must be clay."
 *
 * Vanilla checks a distance to clay rather than the block immediately below; the wiki's wording is
 * "the block directly below", and the plan flags the distance form as worth verifying. The immediate
 * form is implemented here and the difference is recorded as unverified rather than guessed at.
 */
export function axolotlPredicate(context) {
  const { world, x, y, z } = context;
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  if (world.getVoxel(bx, y, bz) !== BLOCKS.WATER) return false;
  const above = world.getVoxel(bx, y + 1, bz);
  const aboveDef = BLOCK_DEFS[above];
  if (aboveDef && aboveDef.solid !== false && !aboveDef.transparent && !aboveDef.plant) return false;
  return world.getVoxel(bx, y - 1, bz) === BLOCKS.CLAY;
}

/** Strider: in lava with air above, at any light level. */
export function striderPredicate(context) {
  const { world, x, y, z } = context;
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  if (world.getVoxel(bx, y, bz) !== BLOCKS.LAVA) return false;
  return world.getVoxel(bx, y + 1, bz) === BLOCKS.AIR;
}

/** Tadpole: the frog's water requirement, with no light constraint worth modelling. */
export function tadpolePredicate(context) {
  const { world, x, y, z } = context;
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  return world.getVoxel(bx, y, bz) === BLOCKS.WATER && world.getVoxel(bx, y - 1, bz) !== BLOCKS.AIR;
}

// ---------------------------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------------------------

/**
 * Register every mob family's placement.
 *
 * Called once at module load. Mob types not listed here get ON_GROUND with no predicate, which the
 * spawner treats as "generic rules only" -- and the debug overlay shows that, so an unregistered mob
 * is visible rather than silently over- or under-spawning.
 */
export function registerDefaultSpawnPlacements() {
  const G = SpawnPlacementType.ON_GROUND;
  const W = SpawnPlacementType.IN_WATER;
  const HM = HeightmapType.MOTION_BLOCKING_NO_LEAVES;
  const OF = HeightmapType.OCEAN_FLOOR;

  // --- common overworld monsters ---
  const commonMonsters = [
    'zombie', 'skeleton', 'creeper', 'spider', 'zombie_villager', 'witch', 'enderman',
    'bogged', 'cave_spider', 'silverfish', 'endermite', 'vindicator', 'evoker', 'illusioner',
    'pillager', 'ravager', 'vex', 'warden', 'breeze', 'giant', 'piglin', 'piglin_brute',
  ];
  registerSpawnPlacement(commonMonsters, {
    placement: G, heightmap: HM, predicate: genericMonsterPredicate,
    note: 'shared hostile rules: dark enough (with the 0..7 roll), solid non-glass floor, no damaging block',
  });

  registerSpawnPlacement('husk', {
    placement: G, heightmap: HM, predicate: huskPredicate,
    note: 'hostile rules plus sky access',
  });
  registerSpawnPlacement('stray', {
    placement: G, heightmap: HM, predicate: strayPredicate,
    note: 'hostile rules plus sky access',
  });
  registerSpawnPlacement('parched', {
    placement: G, heightmap: HM, predicate: genericMonsterPredicate,
    note: 'desert skeleton variant; vanilla gives it the common hostile rules',
  });
  registerSpawnPlacement('drowned', {
    placement: W, heightmap: OF, predicate: drownedPredicate,
    note: 'water above and below; 1/15 in rivers, 1/40 in oceans and 5+ below sea level',
  });
  registerSpawnPlacement('guardian', {
    placement: W, heightmap: OF, predicate: guardianPredicate,
    note: 'water above and below; 95% failure with sky exposure',
  });
  registerSpawnPlacement('elder_guardian', {
    placement: W, heightmap: OF, predicate: guardianPredicate,
    note: 'structure mob; the predicate is the guardian rule',
  });
  registerSpawnPlacement('ghast', {
    placement: G, heightmap: HM, predicate: ghastPredicate,
    note: '95% spawn failure',
  });
  registerSpawnPlacement('magma_cube', {
    placement: G, heightmap: HM, predicate: magmaCubePredicate,
    note: 'cannot spawn on liquid',
  });
  registerSpawnPlacement('slime', {
    placement: G, heightmap: HM, predicate: slimePredicate,
    note: 'swamp Y51..69 with rolls, otherwise a slime chunk below Y40',
  });
  registerSpawnPlacement('wither_skeleton', {
    placement: G, heightmap: HM, predicate: fortressOnlyPredicate,
    note: 'nether fortress only',
  });
  registerSpawnPlacement('blaze', {
    placement: G, heightmap: HM, predicate: fortressOnlyPredicate,
    note: 'nether fortress only',
  });
  registerSpawnPlacement('zombified_piglin', {
    placement: G, heightmap: HM, predicate: netherWartRefusingPredicate,
    note: 'cannot spawn on nether wart block',
  });
  registerSpawnPlacement('zombie_pigman', {
    placement: G, heightmap: HM, predicate: netherWartRefusingPredicate,
    note: 'alias of zombified_piglin',
  });
  registerSpawnPlacement('hoglin', {
    placement: G, heightmap: HM, predicate: netherWartRefusingPredicate,
    note: 'cannot spawn on nether wart block',
  });
  registerSpawnPlacement('zoglin', {
    placement: G, heightmap: HM, predicate: netherWartRefusingPredicate,
    note: 'as hoglin',
  });
  registerSpawnPlacement('skeleton_fortress_ratio', {
    placement: G, heightmap: HM, predicate: fortressSkeletonPredicate,
    note: 'placeholder for the 80% wither skeleton ratio inside a fortress',
  });
  registerSpawnPlacement('zombie_horse', {
    placement: G, heightmap: HM, predicate: zombieHorsePredicate,
    note: 'grass blocks only',
  });
  registerSpawnPlacement('skeleton_horse', {
    placement: G, heightmap: HM, predicate: zombieHorsePredicate,
    note: 'as zombie horse',
  });
  registerSpawnPlacement('creaking', {
    placement: G, heightmap: HM, predicate: creakingPredicate,
    note: 'pale garden at night only',
  });
  registerSpawnPlacement('phantom', {
    placement: SpawnPlacementType.NO_RESTRICTIONS, heightmap: HM, predicate: phantomPredicate,
    note: 'never placed by the natural cycle; the phantom spawner owns it',
  });
  registerSpawnPlacement('shulker', {
    placement: SpawnPlacementType.NO_RESTRICTIONS, heightmap: HM, predicate: null,
    note: 'structure placement only',
  });

  // --- ambient ---
  registerSpawnPlacement('bat', {
    placement: G, heightmap: HM, predicate: batPredicate,
    note: 'stone-family floor, no sky exposure, light 4 or darker',
  });

  // --- passive ---
  registerSpawnPlacement(['pig', 'cow', 'sheep', 'chicken', 'horse', 'donkey', 'mule', 'llama',
    'trader_llama', 'bee', 'cat', 'villager', 'wandering_trader', 'snow_golem', 'iron_golem',
    'allay', 'sniffer', 'camel_husk', 'panda'], {
    placement: G, heightmap: HM, predicate: defaultPassivePredicate,
    note: 'grass block floor, no liquid in the box, light 9 or brighter; panda is in this group '
      + 'because its only extra vanilla rule is the 1/2 baby chance, which the spawner rolls',
  });
  registerSpawnPlacement('mooshroom', { placement: G, heightmap: HM, predicate: mooshroomPredicate, note: 'mycelium' });
  registerSpawnPlacement('turtle', { placement: G, heightmap: HM, predicate: turtlePredicate, note: 'sand, Y <= 66' });
  registerSpawnPlacement('parrot', { placement: G, heightmap: HM, predicate: parrotPredicate, note: 'grass, leaves, logs or air' });
  registerSpawnPlacement('rabbit', { placement: G, heightmap: HM, predicate: rabbitPredicate, note: 'grass, sand, snow' });
  registerSpawnPlacement('wolf', { placement: G, heightmap: HM, predicate: wolfPredicate, note: 'grass, podzol, coarse dirt, snow' });
  registerSpawnPlacement('fox', { placement: G, heightmap: HM, predicate: foxPredicate, note: 'as wolf' });
  registerSpawnPlacement('polar_bear', { placement: G, heightmap: HM, predicate: polarBearPredicate, note: 'grass or ice' });
  registerSpawnPlacement('goat', { placement: G, heightmap: HM, predicate: goatPredicate, note: 'stone, gravel, packed ice, snow' });
  registerSpawnPlacement('armadillo', { placement: G, heightmap: HM, predicate: armadilloPredicate, note: 'grass, coarse dirt, terracotta, red sand' });
  registerSpawnPlacement('frog', { placement: G, heightmap: HM, predicate: frogPredicate, note: 'grass, mud, mangrove roots' });
  registerSpawnPlacement('camel', { placement: G, heightmap: HM, predicate: camelPredicate, note: 'sand or red sand' });
  registerSpawnPlacement('ocelot', { placement: G, heightmap: HM, predicate: ocelotPredicate, note: 'jungle floor or leaves, 1/3 failure' });
  registerSpawnPlacement('strider', { placement: SpawnPlacementType.IN_LAVA, heightmap: HM, predicate: striderPredicate, note: 'lava with air above' });
  registerSpawnPlacement('happy_ghast', { placement: SpawnPlacementType.NO_RESTRICTIONS, heightmap: HM, predicate: null, note: 'not a natural spawn; summoned only' });
  registerSpawnPlacement('copper_golem', { placement: SpawnPlacementType.NO_RESTRICTIONS, heightmap: HM, predicate: null, note: 'MISC category; never a natural spawn' });

  // --- aquatic ---
  registerSpawnPlacement(['cod', 'salmon', 'pufferfish', 'tropical_fish'], {
    placement: W, heightmap: OF, predicate: fishPredicate,
    note: 'water above and below, Y band around sea level; 64-block player sphere',
  });
  registerSpawnPlacement(['squid', 'octopus'], {
    placement: W, heightmap: OF, predicate: squidPredicate, note: 'as fish',
  });
  registerSpawnPlacement('dolphin', { placement: W, heightmap: OF, predicate: dolphinPredicate, note: 'as fish' });
  registerSpawnPlacement('glow_squid', { placement: W, heightmap: OF, predicate: glowSquidPredicate, note: 'light 0, Y < 30' });
  registerSpawnPlacement('axolotl', { placement: W, heightmap: OF, predicate: axolotlPredicate, note: 'clay below, non-solid above' });
  registerSpawnPlacement('tadpole', { placement: W, heightmap: OF, predicate: tadpolePredicate, note: 'water, non-air below' });
}

registerDefaultSpawnPlacements();

export { blockSet, isSolidTopSurface, isDamagingBlock, isPreventedSpawnBlock, hasSkyExposure, MAX_SPAWN_DISTANCE_FISH };
