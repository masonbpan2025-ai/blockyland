// Iron golem targeting and pursuit, from https://minecraft.wiki/w/Iron_Golem (Behavior § Attacking, § Fighting with
// other mobs).
//
// It used to target only pillagers, zombies, husks and wither skeletons -- not skeletons, which walked through a
// village unchallenged -- and it chose the nearest within 16 blocks through solid ground and charged it in a straight
// line. In a village over a cave, that was a zombie three blocks under the street: the golem walked into the ground
// towards it, turned, walked back, and jittered in place while the zombies it could see went unchallenged.
import * as THREE from 'three';
import { steerGround } from './netherMobAI.js';
import { canSee } from './piglin.js';

/**
 * The mobs an iron golem attacks unprovoked. Wiki: it is provoked "by the presence of nearby monsters", "with the
 * exception of creepers, goats, and sulfur cubes", and "also attacks neutral mobs or hostile mobs that can attack the
 * player, such as piglins or zombified piglins". The rows of the wiki's table marked "Iron golems attack: Yes".
 */
export const IRON_GOLEM_TARGETS = Object.freeze(new Set([
  'bogged', 'breeze', 'drowned', 'evoker', 'husk', 'illusioner', 'magma_cube', 'parched', 'pillager', 'ravager',
  'skeleton', 'slime', 'stray', 'vindicator', 'warden', 'wither', 'wither_skeleton', 'zoglin', 'zombie',
  'zombie_villager', 'blaze', 'enderman', 'hoglin', 'piglin', 'piglin_brute', 'shulker', 'zombified_piglin',
  'silverfish', 'endermite', 'cave_spider', 'spider', 'vex', 'witch', 'creaking', 'elder_guardian', 'giant',
  'guardian', 'phantom',
]));

/** How far it looks for a target, in blocks (Java's follow range). */
export const GOLEM_SIGHT = 16;
/** Wiki: "Iron golems cannot attack targets that are 2.75 or more blocks above them." */
export const GOLEM_REACH_UP = 2.75;
/** Seconds a target may stay out of sight before the golem gives it up. */
export const GOLEM_FORGET_SECONDS = 4;
const RESCAN_SECONDS = 0.5;
const EYE = 2.3;

const eyeOf = (mob, height) => mob.mesh.position.clone().add(new THREE.Vector3(0, height, 0));

/** Can the golem see this mob: an unbroken line from its eyes to the mob's, as Minecraft's line-of-sight check is. */
export function golemSees(manager, golem, other) {
  return canSee(manager, eyeOf(golem, EYE), eyeOf(other, (other.height ?? 1.8) * 0.85));
}

/** A live, attackable mob within sight range that the golem can see, or null. Nearest first. */
export function findGolemTarget(manager, golem) {
  let best = null, bestDistance = GOLEM_SIGHT;
  for (const other of manager.mobs) {
    if (other === golem || !(other.health > 0) || !IRON_GOLEM_TARGETS.has(other.type)) continue;
    const distance = golem.mesh.position.distanceTo(other.mesh.position);
    if (distance >= bestDistance || !golemSees(manager, golem, other)) continue;
    best = other; bestDistance = distance;
  }
  return best;
}

/**
 * Choose, keep or drop the golem's target. Wiki: "it targets one mob to attack until that mob dies before attacking a
 * different mob": a target is kept while it lives and stays near, and given up only when it dies, gets away, or has
 * been out of sight for a few seconds.
 *
 * @returns {object|null} the target to pursue this frame
 */
export function updateGolemTarget(manager, golem, dt) {
  const current = golem.golemTarget;
  if (current) {
    const gone = !(current.health > 0) || !manager.mobs.includes(current)
      || golem.mesh.position.distanceTo(current.mesh.position) > GOLEM_SIGHT * 1.5;
    if (!gone) {
      golem.targetUnseen = golemSees(manager, golem, current) ? 0 : (golem.targetUnseen ?? 0) + dt;
      if (golem.targetUnseen < GOLEM_FORGET_SECONDS) return current;
    }
    golem.golemTarget = null;
    golem.targetUnseen = 0;
  }
  golem.targetScan = (golem.targetScan ?? 0) - dt;
  if (golem.targetScan > 0) return null;
  golem.targetScan = RESCAN_SECONDS;
  golem.golemTarget = findGolemTarget(manager, golem);
  golem.targetUnseen = 0;
  return golem.golemTarget;
}

/** In reach of the golem's swing: close, and not 2.75 blocks or more above it. */
export function golemCanHit(golem, target) {
  const a = golem.mesh.position, b = target.mesh.position;
  const horizontal = Math.hypot(b.x - a.x, b.z - a.z);
  return horizontal < 2 + ((target.width ?? 0.6) / 2) && b.y - a.y < GOLEM_REACH_UP;
}

/**
 * Pursue the target along a route (the shared ground steering, which plans around walls and backs off from routes it
 * cannot find), rather than straight at it.
 */
export function pursueGolemTarget(manager, golem, target, dt, speed = 3.8) {
  steerGround(manager, golem, target.mesh.position, dt, speed, 1.2);
  const dx = target.mesh.position.x - golem.mesh.position.x, dz = target.mesh.position.z - golem.mesh.position.z;
  if (dx || dz) golem.yaw = Math.atan2(dx, dz);
}
