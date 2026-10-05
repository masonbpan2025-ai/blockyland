/**
 * Cube-mob sizing rules, shared by slimes and magma cubes.
 *
 * Reference: https://minecraft.wiki/w/Slime and https://minecraft.wiki/w/Magma_Cube
 *
 * Both mobs store their cube size on `slimeSize`, and both use the same three numbers:
 * 4 is large, 2 is medium, 1 is small, splitting halves down to 1 and stopping there.
 * The codebase already used those values; what was wrong was the derived numbers.
 *
 * Wiki, for both mobs:
 *   maximum health = size squared
 *   hitbox side    = size * 0.52 blocks
 *   attack damage  = size, except size 1 which deals none
 *
 * So a large cube (size 4) has 16 HP and is 2.08 blocks; a small one (size 1) has 1 HP
 * and is 0.52 blocks.
 */

/** The three cube sizes the game spawns, largest first. */
export const CUBE_SIZES = [4, 2, 1];

/** The smallest cube. It deals no damage and never splits. */
export const CUBE_MIN_SIZE = 1;

/** Wiki: the hitbox side is the size multiplied by 0.52 blocks. */
export const CUBE_SIDE_PER_SIZE = 0.52;

/**
 * Maximum health for a cube size.
 *
 * Wiki: "A slime's maximum health is equal to its size squared." Slimes previously used
 * `size * 4`, which gave the right answer only for the large size by coincidence and was
 * wrong for medium (8 instead of 4) and small (4 instead of 1).
 */
export function cubeHealth(size) {
  return size * size;
}

/** Wiki: hitbox side length, and therefore width and height, in blocks. */
export function cubeSide(size) {
  return size * CUBE_SIDE_PER_SIZE;
}

/** The size a cube of this size splits into, or null when it is too small to split. */
export function cubeChildSize(size) {
  if (size <= CUBE_MIN_SIZE) return null;
  return Math.max(CUBE_MIN_SIZE, Math.floor(size / 2));
}

/**
 * Wiki: a dying cube larger than the smallest spawns 2-4 children of half its size,
 * rounding down.
 */
export function cubeSplitCount(random = Math.random) {
  return 2 + Math.floor(random() * 3);
}

/**
 * Contact damage for a cube that has landed on a target.
 *
 * Wiki: damage equals the size, and the smallest cubes (size 1) deal none. This is the raw
 * size, not the squared health, so a large cube has 16 HP but hits for 4.
 *
 * NOTE: not yet wired into the mob update loop. It is the reference value the current
 * fixed contact damage should be replaced with, and it is exported so the discrepancy is
 * visible and testable rather than silently wrong.
 */
export function cubeDamage(size) {
  return size <= CUBE_MIN_SIZE ? 0 : size;
}

/**
 * Apply size-derived stats to a cube mob in place.
 *
 * Slimes and magma cubes diverge after this: magma cubes also carry size-scaled armour and
 * a mesh scale, which their own `setMagmaSize` adds on top.
 */
export function applyCubeSize(mob, size) {
  mob.slimeSize = size;
  mob.width = mob.height = cubeSide(size);
  mob.health = mob.maxHealth = cubeHealth(size);
  return mob;
}
