// Hazard classification for mob AI.
//
// Mobs used to walk into lava, fire and cacti because the only terrain danger the movement
// code understood was a deep drop or water. This module is the single place that decides what
// a block does to a mob, so steering, pathfinding and wandering all agree.
//
// Two questions matter, and they are deliberately separate:
//
//   * is this block harmful to stand IN / walk THROUGH?  (lava, fire, cactus, magma, powder
//     snow) -- expressed as a damage-per-second estimate used as a pathfinding cost
//   * is this block harmful given only PROXIMITY?         (cactus next to you, fire beside you)
//
// A mob's immunities come from its own data (fireImmune and friends), so a blaze happily
// routes through lava while a cow treats it as lethal.
import { BLOCKS } from './blocks.js';

/** Damage-per-second estimates, matching the game's own rates where they are known. */
export const HAZARD_DAMAGE = {
  [BLOCKS.LAVA]: 4,      // 4 per half-second in the real game; treated per second here
  [BLOCKS.FIRE]: 1,
  [BLOCKS.CACTUS]: 1,
  [BLOCKS.MAGMA_BLOCK]: 1,
  [BLOCKS.POWDER_SNOW]: 1, // freezing
  [BLOCKS.END_PORTAL]: 20, // effectively instant; never path through it
};

/**
 * Mobs that natively ignore fire and lava damage.
 *
 * Read from data where a mob carries `fireImmune`, but several nether mobs do not set the flag,
 * so they are listed here too. Keeping this list explicit makes the behaviour reviewable
 * rather than emergent.
 */
export const FIRE_IMMUNE_MOBS = new Set([
  'blaze', 'magma_cube', 'ghast', 'strider', 'wither', 'wither_skeleton',
  'zombified_piglin', 'zombie_pigman', 'zoglin', 'piglin', 'hoglin',
  'ender_dragon', 'vex', 'zombie_villager',
]);

/** Mobs that treat water as their preferred medium rather than an obstacle. */
export const AQUATIC_MOBS = new Set([
  'cod', 'salmon', 'squid', 'glow_squid', 'dolphin', 'axolotl', 'guardian',
  'elder_guardian', 'drowned', 'turtle',
]);

/** Mobs that are unharmed by powder snow's freezing. */
export const FREEZE_IMMUNE_MOBS = new Set(['stray', 'polar_bear', 'snow_golem', 'wither']);

/** Is this mob immune to fire and lava damage? */
export function isFireImmune(mob) {
  if (!mob) return false;
  if (mob.fireImmune || mob.isFireImmune) return true;
  if (mob.fireResistanceTime > 0 || mob.hasStatusEffect?.('fire_resistance')) return true;
  return FIRE_IMMUNE_MOBS.has(mob.type);
}

/** Is this mob immune to powder snow freezing? */
export function isFreezeImmune(mob) {
  if (!mob) return false;
  return FREEZE_IMMUNE_MOBS.has(mob.type);
}

/** Does this mob swim rather than drown? */
export function isAquatic(mob) {
  if (!mob) return false;
  return Boolean(mob.isAquatic) || AQUATIC_MOBS.has(mob.type);
}

/**
 * Which hazard, if any, this block represents for this mob.
 *
 * @param {number} blockId
 * @param {object|null} mob used only to apply immunities; pass null for "a generic mob"
 * @returns {null|'lava'|'fire'|'cactus'|'magma'|'freeze'|'portal'}
 */
export function hazardKind(blockId, mob = null) {
  switch (blockId) {
    case BLOCKS.LAVA:
      return isFireImmune(mob) ? null : 'lava';
    case BLOCKS.FIRE:
      return isFireImmune(mob) ? null : 'fire';
    case BLOCKS.CACTUS:
      return 'cactus';
    case BLOCKS.MAGMA_BLOCK:
      // Magma only burns something standing on top of it, which the walkability test handles.
      return isFireImmune(mob) ? null : 'magma';
    case BLOCKS.POWDER_SNOW:
      return isFreezeImmune(mob) ? null : 'freeze';
    case BLOCKS.END_PORTAL:
      return 'portal';
    default:
      return null;
  }
}

/** Is this block harmful to occupy? */
export function isHarmfulBlock(blockId, mob = null) {
  return hazardKind(blockId, mob) !== null;
}

/**
 * Damage per second a mob would take occupying this block, used as the pathfinding cost.
 *
 * @returns {number} 0 when the block is safe for this mob
 */
export function hazardCost(blockId, mob = null) {
  const kind = hazardKind(blockId, mob);
  if (!kind) return 0;
  if (kind === 'portal') return HAZARD_DAMAGE[BLOCKS.END_PORTAL];
  return HAZARD_DAMAGE[blockId] || 0;
}

/**
 * A steppable cell is dangerous when anything harmful occupies the space a mob's body would
 * fill, or when the floor it would stand on is harmful.
 *
 * @param {object} ctx
 * @param {(x:number,y:number,z:number) => number} ctx.getVoxel
 * @param {(x:number,y:number,z:number) => boolean} ctx.isSolid
 * @param {object|null} ctx.mob
 * @param {boolean} [ctx.aquaticFriendly] true when water is desirable (fish, drowned)
 */
export function cellDanger(ctx, x, y, z) {
  const { getVoxel, isSolid, mob } = ctx;
  const aquaticFriendly = ctx.aquaticFriendly ?? isAquatic(mob);

  let cost = 0;

  // Body space: the feet block and the head block.
  cost += hazardCost(getVoxel(x, y, z), mob);
  cost += hazardCost(getVoxel(x, y + 1, z), mob);

  // The floor it would rest on.
  const floor = getVoxel(x, y - 1, z);
  cost += hazardCost(floor, mob);

  // Water: an obstacle for land mobs, the whole point for aquatic ones.
  const inWater = getVoxel(x, y, z) === BLOCKS.WATER;
  if (inWater && !aquaticFriendly) cost += 2;

  // Cacti and fire hurt from the side too, so neighbours add cost. Adjacency is a cost, not
  // a veto: vetoing it would make every cell beside a hazard unreachable, and no route could
  // follow a shoreline. The hard veto in isLethalStep only covers the cell itself.
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (const dy of [0, 1]) {
      const n = getVoxel(x + dx, y + dy, z + dz);
      if (n === BLOCKS.CACTUS) cost += 2;
      else if (n === BLOCKS.FIRE && !isFireImmune(mob)) cost += 2;
      else if (n === BLOCKS.MAGMA_BLOCK && !isFireImmune(mob)) cost += 2;
    }
  }

  // Standing unsupported over a long drop is its own risk, but only mildly: mobs are allowed
  // to walk off small ledges.
  const supported = isSolid(x, y - 1, z) || getVoxel(x, y - 1, z) === BLOCKS.WATER;
  if (!supported) cost += 1;

  return cost;
}

/** Convenience: does this cell carry any danger at all for this mob? */
export function isDangerousCell(ctx, x, y, z) {
  return cellDanger(ctx, x, y, z) > 0;
}

/**
 * Immediate danger check used as a hard veto while stepping, as opposed to the softened
 * cost the pathfinder uses to pick a route.
 *
 * Deliberately narrow: it covers the cell the mob would occupy and the block it would stand
 * on. Neighbouring hazards are priced in cellDanger() instead, because treating them as
 * lethal would make every shore and every corridor past a cactus impassable.
 *
 * @returns {boolean} true when walking into this cell would hurt the mob
 */
export function isLethalStep(ctx, x, y, z) {
  const { getVoxel, mob } = ctx;
  // Anything harmful in the body space or on the floor is a hard no.
  if (isHarmfulBlock(getVoxel(x, y, z), mob)) return true;
  if (isHarmfulBlock(getVoxel(x, y + 1, z), mob)) return true;
  if (isHarmfulBlock(getVoxel(x, y - 1, z), mob)) return true;

  // A lava floor needs saying explicitly. hazardKind above is immunity-aware, so it reports
  // nothing for a mob that can touch lava -- but a lava block at the level below the feet IS
  // the level the mob stands at, so a non-immune mob is effectively standing in it. Without
  // this a mob escaping a pool kept stepping onto more lava, and routes crossed a lake at the
  // lava's own level.
  const standingOnLava = getVoxel(x, y - 1, z) === BLOCKS.LAVA && !isFireImmune(mob);
  if (standingOnLava) return true;
  return false;
}
