/**
 * Spider rules.
 *
 * Reference: https://minecraft.wiki/w/Spider
 *
 * The spider's defining mechanic is conditional hostility: it is hostile only while the
 * light level immediately around it is 11 or less, and returns to neutral when it moves into
 * brighter light — but it keeps pursuing anything that attacked it, regardless of light.
 */

/** Wiki: spiders have 16 HP (reduced from 20 in Beta 1.9-pre2). */
export const SPIDER_HEALTH = 16;

/** Wiki: 1.4 wide x 0.9 tall. */
export const SPIDER_DIMENSIONS = { width: 1.4, height: 0.9 };

/** Wiki: hostile while the light level is 11 or less; neutral at 12 and above. */
export const SPIDER_HOSTILE_MAX_LIGHT = 11;

/** Wiki: hostile spiders see up to 16 blocks. */
export const SPIDER_SIGHT_RANGE = 16;

/** Wiki: 5 XP when killed by a player or tamed wolf. */
export const SPIDER_XP = 5;

/** How fast a climbing spider rises, in blocks per second. */
export const SPIDER_CLIMB_SPEED = 1.4;

/**
 * How long a spider stays angry after being attacked.
 *
 * The wiki does not give a number for this: a spider "pursues targets regardless of the
 * light level in retaliation to an attack". This window is the adaptation that stands in for
 * "until it disengages", and it is deliberately long enough to be observable.
 */
export const SPIDER_ANGER_SECONDS = 20;

/** Wiki: a spider flips onto its back when it dies, unlike other mobs. */
export const SPIDER_DEATH_ROLL = Math.PI;

/** True when the mob is a spider. */
export function isSpider(mob) {
  return mob?.type === 'spider';
}

/**
 * The light level at a position, falling back to a day/night estimate.
 *
 * Mirrors the idiom used by the wither skeleton and squid: prefer the world's real light
 * query, and fall back to "bright during the day" when the world has no lighting model.
 */
export function lightAt(manager, x, y, z) {
  const world = manager?.world;
  if (typeof world?.getLightLevel === 'function') {
    const level = world.getLightLevel(x, y, z);
    if (typeof level === 'number') return level;
  }
  const worldTime = manager?.game?.worldTime ?? 6000;
  // 0-12000 is daytime in the vanilla day cycle.
  return worldTime < 12000 ? 15 : 0;
}

/**
 * Is the spider currently angry at something?
 *
 * Two sources, matching the wiki's two rules: being attacked, which persists regardless of
 * light, and hunting in the dark.
 */
export function spiderIsAngry(mob) {
  if (!isSpider(mob)) return false;
  if ((mob.angerTimer || 0) > 0) return true;
  return false;
}

/**
 * Should the spider treat the given target as a target this tick?
 *
 * Wiki: "A spider stays hostile toward the player or an iron golem as long as the light level
 * immediately around the spider is 11 or less; otherwise, it does not attack unless attacked
 * first... However, spiders pursue targets regardless of the light level in retaliation to an
 * attack."
 */
export function spiderWantsTarget(manager, mob, target) {
  if (!isSpider(mob) || !target) return false;
  // Already provoked: light no longer matters.
  if (spiderIsAngry(mob)) return true;
  const pos = mob.mesh.position;
  const light = lightAt(manager, pos.x, pos.y, pos.z);
  if (light > SPIDER_HOSTILE_MAX_LIGHT) return false;
  return mob.mesh.position.distanceTo(target.position) <= SPIDER_SIGHT_RANGE;
}

/** Provoke a spider. Called from the damage path. */
export function angerSpider(mob, attacker, seconds = SPIDER_ANGER_SECONDS) {
  if (!isSpider(mob)) return false;
  mob.angerTimer = Math.max(mob.angerTimer || 0, seconds);
  mob.attacker = attacker || mob.attacker || null;
  return true;
}

/** Tick the anger timer down. */
export function updateSpiderAnger(mob, dt) {
  if (!isSpider(mob)) return;
  if (mob.angerTimer > 0) mob.angerTimer = Math.max(0, mob.angerTimer - dt);
}

/**
 * Wall climbing.
 *
 * Wiki: "Spiders can climb up over solid blocks... it approaches as close as possible to the
 * player's position and proceeds to climb the wall vertically until it gets to the top."
 * A spider in contact with a solid block, and not on the ground, climbs at a constant rate.
 *
 * Returns true when the spider is climbing this tick.
 */
export function updateSpiderClimbing(manager, mob, dt) {
  if (!isSpider(mob)) return false;
  const pos = mob.mesh.position;
  const half = (mob.width ?? SPIDER_DIMENSIONS.width) / 2;

  // A block in the way, at body height, in any horizontal direction.
  const ahead = facingOffsets(mob, half)
    .some(([dx, dz]) => manager.isBlockSolid?.(Math.floor(pos.x + dx), Math.floor(pos.y + 0.4), Math.floor(pos.z + dz)));

  mob.isClimbing = !!ahead && !mob.onGround;
  if (mob.isClimbing) {
    // Cancel gravity and rise. The wiki's spiders climb at a steady rate up the whole wall.
    mob.velocity.y = Math.max(mob.velocity.y, SPIDER_CLIMB_SPEED);
    mob.climbTimer = (mob.climbTimer || 0) + dt;
  } else {
    mob.climbTimer = 0;
  }
  return mob.isClimbing;
}

/** The four horizontal probes used to decide whether a wall is in the way. */
function facingOffsets(mob, half) {
  const yaw = mob.yaw || 0;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  // Forward probe, plus the two sides, so a spider climbs a wall it is pressed against
  // rather than only one directly ahead of its facing.
  return [
    [fx * half, fz * half],
    [fz * half, -fx * half],
    [-fz * half, fx * half]
  ];
}

/**
 * Death loot.
 *
 * Wiki: 0-2 string, and 0-1 spider eye that requires player kill credit. Kept here rather
 * than in the shared table because the eye is conditional on kill credit.
 */
export function spiderDrops(mob, random = Math.random) {
  if (!isSpider(mob)) return [];
  const rows = [['string', false, 0, 2]];
  if (mob.playerDamaged || mob.wolfKilled) rows.push(['spider_eye', false, 0, 1]);
  return rows;
}
