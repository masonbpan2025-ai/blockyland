import * as THREE from 'three';

/**
 * Ambient locomotion for mobs that have no dedicated AI branch.
 *
 * The shared update loop does not apply `velocity` itself: a mob moves only if its own update
 * branch sets a velocity and calls a mover. A mob with no branch therefore falls through to
 * `moveGroundMob` carrying a zero velocity and stands in `state: 'idle'` forever — healthy,
 * error-free and completely inert. This affected 27 of the 60 advertised mobs, including the
 * mooshroom, which had been brought to parity on stats, drops, breeding and shearing while never
 * having walked.
 *
 * Rather than hand-writing another branch per mob, the roles are declared here as data and the
 * behaviour is the same three steps the proven zombie branch uses: pick a target, steer toward it,
 * and attack in reach. Adding a mob is one line.
 *
 * Reference for the ranges and damage: each mob's own wiki page.
 */

/**
 * Hostile mobs: chase the player within range, strike in reach, wander otherwise.
 *
 * `range` is the aggro radius, `speed` the walking pace, `damage` the melee damage on Normal, and
 * `attackReach` the distance at which the blow lands. Speeds are the wiki's movement speeds scaled
 * to this project's convention, where a zombie walks at 2.8.
 *
 * Deliberately absent: `piglin` and `hoglin`, which already have their own path-following steering
 * with anti-jitter handling. Driving them from here would bypass that and make them shudder on the
 * spot, which tests/mobJitter.test.js measures. A mob belongs here only when it has no steering of
 * its own.
 */
export const HOSTILE_LOCOMOTION = {
  zombified_piglin: { range: 16, speed: 2.6, damage: 5, attackReach: 1.5 },
  zoglin: { range: 16, speed: 3.2, damage: 6, attackReach: 1.8 },
  ravager: { range: 24, speed: 3.4, damage: 12, attackReach: 2.2 },
  vindicator: { range: 20, speed: 3.0, damage: 13, attackReach: 1.6 },
  evoker: { range: 20, speed: 2.4, damage: 6, attackReach: 1.6 },
  vex: { range: 24, speed: 3.6, damage: 9, attackReach: 1.6, flying: true, flyHeight: 1.2 },
  witch: { range: 16, speed: 2.4, damage: 0, attackReach: 0 },
  warden: { range: 24, speed: 3.6, damage: 30, attackReach: 2.0 },
  guardian: { range: 16, speed: 2.4, damage: 6, attackReach: 1.8 },
  elder_guardian: { range: 16, speed: 2.0, damage: 8, attackReach: 2.0 },
  shulker: { range: 16, speed: 0, damage: 4, attackReach: 0 }
};

/**
 * Passive mobs: wander at their own pace and never attack.
 *
 * A speed of 0 means the mob is stationary by design rather than by accident, which keeps the
 * distinction explicit in the table.
 */
export const PASSIVE_LOCOMOTION = {
  mooshroom: { speed: 1.0 },
  polar_bear: { speed: 1.2 },
  panda: { speed: 1.0 },
  // Boss-scale mobs are driven by their own event code; listed so the intent is recorded rather
  // than left to look like an oversight.
  ender_dragon: { speed: 0, flying: true },
  wither: { speed: 0, flying: true }
};

/** True when this module has an opinion about the mob. */
export function hasAmbientLocomotion(type) {
  return Object.hasOwn(HOSTILE_LOCOMOTION, type) || Object.hasOwn(PASSIVE_LOCOMOTION, type);
}

/** The declared role, or null when the mob is not covered. */
export function locomotionFor(type) {
  if (Object.hasOwn(HOSTILE_LOCOMOTION, type)) {
    return { role: 'hostile', ...HOSTILE_LOCOMOTION[type] };
  }
  if (Object.hasOwn(PASSIVE_LOCOMOTION, type)) {
    return { role: 'passive', damage: 0, attackReach: 0, range: 0, ...PASSIVE_LOCOMOTION[type] };
  }
  return null;
}

/**
 * Advance a mob's ambient locomotion for one step.
 *
 * Mutates only the mob's yaw and velocity, exactly like the branch it generalises, so the existing
 * mover and animator downstream need no changes.
 *
 * `wander` is the shared goal-picking wanderer, injected so this module does not import the motion
 * helpers back and create a cycle. `random` is injectable for the same reason `wanderMob`'s is.
 *
 * @returns {'chasing'|'wandering'|'stationary'|null} what the mob did, or null when not covered
 */
export function updateAmbientLocomotion(manager, mob, dt, player, { wander = null, random = Math.random } = {}) {
  const spec = locomotionFor(mob?.type);
  if (!spec) return null;
  if (!mob.velocity) return null;

  // A mob that cannot move is left alone, so a declared stationary role is still deliberate.
  if (spec.speed <= 0) {
    mob.velocity.x = 0;
    mob.velocity.z = 0;
    return 'stationary';
  }

  const distToPlayer = player?.position
    ? mob.mesh.position.distanceTo(player.position)
    : Infinity;

  if (spec.role === 'hostile' && distToPlayer < spec.range) {
    const dir = player.position.clone().sub(mob.mesh.position);
    const dist = dir.length();
    if (spec.flying) {
      // A flyer is already above the target, so the yaw must be measured on the horizontal
      // component alone; using the full vector would pitch it into the ground.
      const flat = new THREE.Vector3(dir.x, 0, dir.z);
      if (flat.lengthSq() > 1e-6) {
        flat.normalize();
        const targetYaw = Math.atan2(flat.x, flat.z);
        const turn = Math.atan2(Math.sin(targetYaw - mob.yaw), Math.cos(targetYaw - mob.yaw));
        mob.yaw += turn * Math.min(1, 9 * dt);
      }
      if (dist > 1.4) {
        const approachY = player.position.y + (spec.flyHeight ?? 1.0);
        mob.velocity.x = Math.sin(mob.yaw) * spec.speed;
        mob.velocity.z = Math.cos(mob.yaw) * spec.speed;
        mob.velocity.y = Math.max(-2.5, Math.min(2.5, (approachY - mob.mesh.position.y) * 2.0));
      } else {
        mob.velocity.multiplyScalar(0.5);
      }
    } else if (dist > 1.2) {
      dir.y = 0;
      dir.normalize();
      // Turn toward the target rather than snapping, so the mob reads as navigating.
      const targetYaw = Math.atan2(dir.x, dir.z);
      const turn = Math.atan2(Math.sin(targetYaw - mob.yaw), Math.cos(targetYaw - mob.yaw));
      mob.yaw += turn * Math.min(1, 9 * dt);
      mob.velocity.x = Math.sin(mob.yaw) * spec.speed;
      mob.velocity.z = Math.cos(mob.yaw) * spec.speed;
    } else {
      // In reach: stop pushing into the player rather than shoving them.
      mob.velocity.x *= 0.5;
      mob.velocity.z *= 0.5;
    }

    if (spec.damage > 0 && dist < spec.attackReach && (mob.hitCooldown ?? 0) <= 0) {
      player.takeDamage?.(spec.damage, mob.mesh.position, mob.type);
      mob.hitCooldown = 1.0;
    }
    mob.state = 'chase';
    return 'chasing';
  }

  // Otherwise wander, using the shared goal-picking wanderer.
  //
  // A flying mob cannot use it: the wanderer picks goals that stand on solid ground, which would
  // drive a flyer down into the terrain. It drifts at a fixed altitude instead.
  if (spec.flying) {
    const groundY = manager.world?.surfaceHeightAt?.(mob.mesh.position.x, mob.mesh.position.z);
    const altitude = spec.flyHeight ?? 2.0;
    if (typeof groundY === 'number') {
      const targetY = groundY + 1 + altitude;
      mob.velocity.y = Math.max(-2, Math.min(2, (targetY - mob.mesh.position.y) * 2));
    } else {
      mob.velocity.y = 0;
    }
    mob.wanderTimer = (mob.wanderTimer || 0) - dt;
    if (mob.wanderTimer <= 0) {
      mob.wanderTimer = 1 + random() * 2;
      mob.yaw += (random() - 0.5) * 2.2;
    }
    mob.velocity.x = Math.sin(mob.yaw) * spec.speed * 0.5;
    mob.velocity.z = Math.cos(mob.yaw) * spec.speed * 0.5;
    mob.state = 'idle';
    return 'drifting';
  }

  wander?.(manager, mob, dt, spec.speed, random);
  mob.state = 'idle';
  return 'wandering';
}
