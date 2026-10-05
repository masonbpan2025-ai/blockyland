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
 */
export function cubeDamage(size) {
  return size <= CUBE_MIN_SIZE ? 0 : size;
}

/**
 * Wiki: "Slimes move by hopping, which they do every 10 to 30 ticks (0.5 to 1.5 seconds)."
 *
 * With a target found, "the delay before jumping is 1/3 as long (3 to 10 ticks)".
 */
export const CUBE_HOP_SECONDS = { idleMin: 0.5, idleMax: 1.5, chaseMin: 0.15, chaseMax: 0.5 };

/** Wiki: an idle cube "changes direction randomly every 40 to 100 ticks (2 to 5 seconds)". */
export const CUBE_TURN_SECONDS = { min: 2, max: 5 };

/**
 * Wiki: "Regardless of size, slimes always jump 1 block high."
 *
 * A one-block jump needs a vertical speed of sqrt(2 * g) for the gravity the mover applies.
 * The value here is the launch velocity that clears a single block and no more, which is what
 * keeps a large slime from sailing over the player.
 */
export const CUBE_JUMP_VELOCITY = 5.2;

/**
 * Wiki: "a slime jumps a distance slightly farther than its length", and "slimes do not pathfind
 * toward their target, always approaching in a straight line".
 *
 * So the horizontal launch speed scales with the cube's own side length, which makes a large cube
 * cover ground quickly and a small one barely move.
 */
export function cubeHopSpeed(size) {
  return 1.6 + cubeSide(size) * 0.9;
}

/**
 * Wiki: "The slime searches for a player (or, failing that, an iron golem) within 16 blocks."
 */
export const CUBE_TARGET_RANGE = 16;

/** How long between hops. A cube with a target hops three times as often. */
export function rollCubeHopDelay(hasTarget, random = Math.random) {
  const { idleMin, idleMax, chaseMin, chaseMax } = CUBE_HOP_SECONDS;
  const [min, max] = hasTarget ? [chaseMin, chaseMax] : [idleMin, idleMax];
  return min + random() * (max - min);
}

/** How long until an idle cube picks a new heading. */
export function rollCubeTurnDelay(random = Math.random) {
  const { min, max } = CUBE_TURN_SECONDS;
  return min + random() * (max - min);
}

/**
 * A target's world position, whether it is a player (which carries the vector directly) or a mob
 * (which carries it on its mesh).
 */
export function cubeTargetPosition(target) {
  if (!target) return null;
  if (target.isVector3) return target;
  if (target.position?.isVector3) return target.position;
  if (target.mesh?.position) return target.mesh.position;
  return null;
}

/**
 * Advance a cube mob's hopping for one step.
 *
 * Mutates only the mob's yaw and velocity, so the existing ground mover carries it, exactly as the
 * other mobile mobs work. Gravity is applied by that mover, so this only supplies the launch.
 *
 * Wiki behaviour implemented:
 *  - a target within 16 blocks shortens the pause and points the cube straight at it
 *  - with no target it waits 0.5-1.5s, and picks a new random heading every 2-5s
 *  - the jump clears one block regardless of size, and the horizontal reach grows with size
 *  - a landed cube damages whatever it is touching, a half second apart at most
 *
 * @returns {'hopping'|'waiting'|null} what the cube did, or null when it is not a cube
 */
export function updateCubeHop(manager, mob, dt, player, { random = Math.random, findTarget = null } = {}) {
  if (!mob || typeof mob.slimeSize !== 'number') return null;
  if (!mob.velocity) return null;

  mob.hopTimer = (mob.hopTimer ?? rollCubeHopDelay(false, random)) - dt;
  mob.cubeTurnTimer = (mob.cubeTurnTimer ?? rollCubeTurnDelay(random)) - dt;

  // Find something to chase. The caller supplies the lookup so this module stays free of the mob
  // registry; the default is the player, which is what the wiki names first.
  let target = null;
  if (typeof findTarget === 'function') {
    target = findTarget(manager, mob, CUBE_TARGET_RANGE);
  } else if (player && mob.mesh.position.distanceTo(cubeTargetPosition(player)) < CUBE_TARGET_RANGE) {
    target = player;
  }

  const targetPos = cubeTargetPosition(target);
  if (targetPos) {
    // Wiki: the heading is set directly toward the target before jumping, with no pathfinding.
    const dir = targetPos.clone().sub(mob.mesh.position);
    dir.y = 0;
    if (dir.lengthSq() > 1e-6) {
      dir.normalize();
      mob.yaw = Math.atan2(dir.x, dir.z);
    }
    mob.cubeTarget = target;
  } else if (mob.cubeTurnTimer <= 0) {
    mob.cubeTurnTimer = rollCubeTurnDelay(random);
    mob.yaw = random() * Math.PI * 2;
    mob.cubeTarget = null;
  }

  if (mob.hopTimer > 0) {
    // Between hops a cube sits still: the movement has to read as a hop rather than a glide.
    mob.velocity.x = 0;
    mob.velocity.z = 0;
    return 'waiting';
  }

  mob.hopTimer = rollCubeHopDelay(!!targetPos, random);

  // Only launch from the ground, or the cube would fly.
  if (mob.onGround === false) return 'waiting';

  const speed = cubeHopSpeed(mob.slimeSize);
  mob.velocity.x = Math.sin(mob.yaw) * speed;
  mob.velocity.z = Math.cos(mob.yaw) * speed;
  mob.velocity.y = CUBE_JUMP_VELOCITY;
  mob.onGround = false;
  mob.wasInAir = true;

  // Wiki: the size-scaled contact damage happens when it lands on something. The mover resolves the
  // landing, so the squeeze is applied on the next grounded step, which is what `cubeSquashOnLand`
  // is for.
  mob.cubeSquashPending = true;

  return 'hopping';
}

/**
 * Apply a landed cube's contact damage.
 *
 * Wiki: cubes "continuously damage all players ... they collide with (although damage immunity
 * reduces the actual damage to 1 attack every half second)", and the damage equals the size, with
 * the smallest dealing none.
 *
 * Returns the damage dealt, or 0.
 */
export function cubeSquashOnLand(manager, mob, target, dt = 0) {
  if (!mob || !target) return 0;
  // Guard the cube check first: a non-cube has no size, and `cubeDamage(undefined)` would return
  // undefined rather than the no-damage answer a caller expects.
  if (typeof mob.slimeSize !== 'number') return 0;
  const damage = cubeDamage(mob.slimeSize);
  if (damage <= 0) return 0;
  mob.cubeAttackCooldown = Math.max(0, (mob.cubeAttackCooldown ?? 0) - dt);
  // The wiki's damage-immunity tick is half a second between hits.
  if (mob.cubeAttackCooldown > 0) return 0;
  const reach = cubeSide(mob.slimeSize) / 2 + 0.6;
  const targetPos = cubeTargetPosition(target);
  if (!targetPos) return 0;
  if (mob.mesh.position.distanceTo(targetPos) > reach) return 0;
  mob.cubeAttackCooldown = 0.5;
  target.takeDamage?.(damage, mob.mesh.position, mob.type);
  return damage;
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
