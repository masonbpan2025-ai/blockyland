/**
 * Spider rules.
 *
 * Reference: https://minecraft.wiki/w/Spider
 *
 * The spider's defining mechanic is conditional hostility: it is hostile only while the
 * light level immediately around it is 11 or less, and returns to neutral when it moves into
 * brighter light — but it keeps pursuing anything that attacked it, regardless of light.
 */
import { meleeDamage, meleeCanReach } from './mobEnvironment.js';
import { moveGroundMob } from './mobMotion.js';

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
    // The cell the spider stands in, not the ground under it: its feet sit a hair below the block top (y = 4.98 on
    // ground at 5), and flooring that read the solid block's light, 0, so every spider hunted at noon.
    const level = world.getLightLevel(x, y + 0.1, z);
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
  if (!isSpiderVariant(mob)) return false;
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
  if (!isSpiderVariant(mob) || !target) return false;
  // Already provoked: light no longer matters.
  if (spiderIsAngry(mob)) return true;
  const pos = mob.mesh.position;
  const light = lightAt(manager, pos.x, pos.y, pos.z);
  if (light > SPIDER_HOSTILE_MAX_LIGHT) return false;
  return mob.mesh.position.distanceTo(target.position) <= SPIDER_SIGHT_RANGE;
}

/** Provoke a spider. Called from the damage path. */
export function angerSpider(mob, attacker, seconds = SPIDER_ANGER_SECONDS) {
  if (!isSpiderVariant(mob)) return false;
  mob.angerTimer = Math.max(mob.angerTimer || 0, seconds);
  mob.attacker = attacker || mob.attacker || null;
  return true;
}

/** Tick the anger timer down. */
export function updateSpiderAnger(mob, dt) {
  if (!isSpiderVariant(mob)) return;
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
  if (!isSpiderVariant(mob)) return false;
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
  // Wiki: cave spiders drop exactly what spiders do, so this covers both variants.
  if (!isSpiderVariant(mob)) return [];
  const rows = [['string', false, 0, 2]];
  if (mob.playerDamaged || mob.wolfKilled) rows.push(['spider_eye', false, 0, 1]);
  return rows;
}

// --- Cave spider -----------------------------------------------------------------------
//
// Reference: https://minecraft.wiki/w/Cave_Spider
//
// The cave spider shares the spider's model and light-based neutrality but is smaller, has
// less health, and poisons on Normal and Hard difficulty.

/** Wiki: cave spiders have 12 HP (reduced from 20 in Beta 1.9-pre2). */
export const CAVE_SPIDER_HEALTH = 12;

/** Wiki: 0.7 wide x 0.5 tall. */
export const CAVE_SPIDER_DIMENSIONS = { width: 0.7, height: 0.5 };

/** Wiki: a cave spider is exactly half the size of a spider. */
export const CAVE_SPIDER_SCALE = 0.5;

/**
 * Wiki: poison is inflicted on Normal and Hard only.
 *
 * Easy deals 2 damage with no poison, Normal 2 plus poison, Hard 3 plus poison.
 * `meleeDamage` records the non-poison component for each difficulty.
 */
export const CAVE_SPIDER_POISON = {
  peaceful: null,
  easy: null,
  normal: { seconds: 7, damage: 6 },
  hard: { seconds: 15, damage: 12 }
};

/** The melee damage a cave spider deals, by difficulty. */
export const CAVE_SPIDER_MELEE_DAMAGE = { peaceful: 0, easy: 2, normal: 2, hard: 3 };

/** True when the mob is a cave spider. */
export function isCaveSpider(mob) {
  return mob?.type === 'cave_spider';
}

/** True when the mob is either spider variant. */
export function isSpiderVariant(mob) {
  return isSpider(mob) || isCaveSpider(mob);
}

/**
 * The poison a cave spider applies at this difficulty, or null when it applies none.
 *
 * Wiki: "On Normal or Hard difficulty, cave spiders inflict Poison upon attacking." The
 * returned `damage` is the wiki's total poison damage, which the status-effect ticker
 * realises as 1 damage every 1.25 seconds.
 *
 * Note the explicit key check: `??` would treat the deliberate `null` for Easy as nullish
 * and hand back Normal's poison, which would poison on Easy.
 */
export function caveSpiderPoisonFor(difficulty) {
  const key = difficulty ?? 'normal';
  return Object.hasOwn(CAVE_SPIDER_POISON, key) ? CAVE_SPIDER_POISON[key] : CAVE_SPIDER_POISON.normal;
}

/**
 * The melee damage a cave spider deals at this difficulty (the non-poison component).
 */
export function caveSpiderMeleeFor(difficulty) {
  const key = difficulty ?? 'normal';
  return Object.hasOwn(CAVE_SPIDER_MELEE_DAMAGE, key)
    ? CAVE_SPIDER_MELEE_DAMAGE[key]
    : CAVE_SPIDER_MELEE_DAMAGE.normal;
}

/**
 * Apply a cave spider's poison to a target.
 *
 * Returns the poison definition when poison was applied, so the caller can react. Targets
 * without a status-effect API are left alone rather than throwing.
 */
export function applyCaveSpiderPoison(manager, mob, target, difficulty = null) {
  if (!isCaveSpider(mob) || !target) return null;
  const level = difficulty ?? manager?.game?.difficulty ?? 'normal';
  const poison = caveSpiderPoisonFor(level);
  if (!poison) return null;
  // Wiki: cave spiders are themselves immune to poison, so a cave spider cannot poison one.
  if (isCaveSpider(target) || target.poisonImmune) return null;
  target.applyStatusEffect?.('poison', poison.seconds, 1);
  return poison;
}

/** How close a spider must be to bite, matching the other melee mobs' reach. */
export const SPIDER_ATTACK_REACH = 1.4;

/** Seconds between spider bites. */
export const SPIDER_ATTACK_COOLDOWN = 1.0;

/** Wiki: spiders "pounce at close range" — they leap at the target rather than walking in. */
export const SPIDER_POUNCE_SPEED = 3.2;
export const SPIDER_POUNCE_RANGE = 4;

/**
 * Chase and bite, gated by the light rule.
 *
 * This is the behaviour that makes the light rule matter: the spider only closes on a player
 * it is allowed to target, so a spider that has returned to neutral in bright light stops
 * pursuing instead of attacking anyway. Returns true when the spider acted this tick.
 */
export function updateSpiderHunt(manager, mob, dt, player) {
  if (!isSpiderVariant(mob) || !player?.position || mob.health <= 0) return false;

  mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);
  // Attacks run on their own timer: `hitCooldown` is the hurt-immunity window, and sharing it made the mob immune
  // to the player for as long as it kept biting.
  mob.attackCooldown = Math.max(0, (mob.attackCooldown || 0) - dt);

  if (!spiderWantsTarget(manager, mob, player)) {
    // Not allowed to target: drift to a halt rather than freezing mid-stride.
    mob.velocity.x *= 0.8;
    mob.velocity.z *= 0.8;
    return false;
  }

  const dir = player.position.clone().sub(mob.mesh.position);
  dir.y = 0;
  const dist = dir.length();
  if (dist < 0.001) return false;
  dir.normalize();

  const targetYaw = Math.atan2(dir.x, dir.z);
  const turn = Math.atan2(Math.sin(targetYaw - mob.yaw), Math.cos(targetYaw - mob.yaw));
  mob.yaw += turn * Math.min(1, 9 * dt);

  if (dist > SPIDER_ATTACK_REACH) {
    const speed = dist < SPIDER_POUNCE_RANGE ? SPIDER_POUNCE_SPEED : SPIDER_POUNCE_SPEED * 0.7;
    mob.velocity.x = Math.sin(mob.yaw) * speed;
    mob.velocity.z = Math.cos(mob.yaw) * speed;
    // Wiki: spiders attack by leaping, so a pounce inside range also gains height.
    if (dist < SPIDER_POUNCE_RANGE && mob.onGround && Math.random() < 6 * dt) {
      mob.velocity.y = 3.4;
      mob.onGround = false;
    }
    mob.isPouncing = dist < SPIDER_POUNCE_RANGE;
  } else {
    mob.velocity.x *= 0.5;
    mob.velocity.z *= 0.5;
    mob.isPouncing = false;
    if (mob.attackCooldown <= 0 && meleeCanReach(manager?.world, mob, player)) {
      const difficulty = manager?.game?.difficulty ?? 'normal';
      const damage = isCaveSpider(mob)
        ? caveSpiderMeleeFor(difficulty)
        : meleeDamage('spider', difficulty, 2);
      if (damage > 0) player.takeDamage?.(damage, mob.mesh.position, mob.type);
      // Wiki: cave spiders poison on Normal and Hard only.
      applyCaveSpiderPoison(manager, mob, player, difficulty);
      mob.attackCooldown = SPIDER_ATTACK_COOLDOWN;
    }
  }
  return true;
}

/**
 * Locomotion for both spider variants.
 *
 * Mob types own their own movement in this engine — the shared update loop resolves hazard
 * escapes and animation but never applies `velocity` itself — so a spider that only sets
 * velocity never actually moves. This was a real defect in the first spider implementation:
 * the hunt set a velocity that nothing consumed. `moveGroundMob` is the same helper the
 * zombified piglin and other walkers use, so the spider gets gravity, step-up and collision
 * resolution rather than a bespoke path.
 *
 * While climbing, the vertical component is preserved so the climb is not cancelled by the
 * ground-movement pass.
 */
export function moveSpider(manager, mob, dt) {
  if (!isSpiderVariant(mob)) return 0;
  const climbing = !!mob.isClimbing;
  const climbVelocity = climbing ? mob.velocity.y : 0;
  const distance = moveGroundMob(manager, mob, dt);
  if (climbing) {
    mob.velocity.y = climbVelocity;
    mob.mesh.position.y += climbVelocity * dt;
  }
  return distance;
}
