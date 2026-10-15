import * as THREE from 'three';
import { meleeDamage, meleeCanReach } from './mobEnvironment.js';

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
  shulker: { range: 16, speed: 0, damage: 4, attackReach: 0,
    // A stationary turret. Without `ranged` this entry declared a damage figure and an aggro radius and
    // could never use either, because the stationary branch returned before any attack logic.
    //
    // Vanilla: the bullet deals 4 and inflicts Levitation for 10 seconds, on a 1.5 second cooldown. The
    // levitation is the whole point of the mob -- it is what lifts you off a ledge.
    ranged: { cooldown: 1.5, damage: 4, effect: 'levitation', effectSeconds: 10 } }
};

/**
 * Passive mobs: wander at their own pace and never attack.
 *
 * A speed of 0 means the mob is stationary by design rather than by accident, which keeps the
 * distinction explicit in the table.
 */
export const PASSIVE_LOCOMOTION = {
  mooshroom: { speed: 1.0 },
  // Neither `polar_bear` nor `panda` is here any more. Both are neutral mobs whose aggression is a
  // *conditional stance* -- cub defence for the bear, a personality for the panda -- rather than a
  // chase, and both own their locomotion in their own branches. This table's only mobile behaviour
  // is to chase a player in range, so declaring them here made them attack every player on sight,
  // which is not what the wiki describes.,
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
 * Face a target and report how far away it is.
 *
 * Turns rather than snapping, matching the chase branch, and measures on the HORIZONTAL component alone so a
 * turret set into a wall does not pitch into the floor when the player stands below it.
 *
 * @returns {{distance:number}|null} null when there is nothing to aim at
 */
function aimAt(mob, player) {
  if (!mob?.mesh?.position || !player?.position) return null;
  const dx = player.position.x - mob.mesh.position.x;
  const dz = player.position.z - mob.mesh.position.z;
  const distance = mob.mesh.position.distanceTo(player.position);
  if (Math.hypot(dx, dz) > 1e-6) {
    const targetYaw = Math.atan2(dx, dz);
    const turn = Math.atan2(Math.sin(targetYaw - mob.yaw), Math.cos(targetYaw - mob.yaw));
    mob.yaw += turn * 0.2;
  }
  return { distance };
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
 * `spec` overrides the table lookup for a caller that owns its own locomotion and only wants the wander for
 * one state. A mob in neither table returns null here, which is deliberate: the tables exist for mobs with no
 * branch of their own, and adding one that has a branch makes the generic fallback in MobManager.update run
 * alongside it and overwrite whatever the branch decided.
 *
 * @returns {'chasing'|'wandering'|'stationary'|null} what the mob did, or null when not covered
 */
export function updateAmbientLocomotion(manager, mob, dt, player, { wander = null, random = Math.random, fire = null, spec: specOverride = null } = {}) {
  const spec = specOverride ?? locomotionFor(mob?.type);
  if (!spec) return null;
  if (!mob.velocity) return null;

  // A mob that cannot move is left alone, so a declared stationary role is still deliberate.
  if (spec.speed <= 0) {
    mob.velocity.x = 0;
    mob.velocity.z = 0;
    // A stationary mob may still be a TURRET. This branch returned before the hostile logic below, so a
    // declared ranged attacker with `speed: 0` fired nothing at all -- which is exactly the shulker's case:
    // it carried `range: 16` and `damage: 4` and never attacked anything.
    //
    // `fire` is injected for the same reason `wander` is: this module stays free of THREE and of the
    // projectile system, so it can decide WHEN to fire without knowing how.
    const canTarget=manager.game?.difficulty!=='peaceful'&&!player?.isDead&&!['creative','spectator'].includes(player?.gamemode);
    if (spec.ranged && typeof fire === 'function' && canTarget) {
      const aim = aimAt(mob, player);
      if (aim) {
        mob.rangedCooldown = Math.max(0, (mob.rangedCooldown ?? 0) - dt);
        let visible=true;
        if(manager.isBlockSolid&&player?.position) {
          const from=mob.mesh.position.clone().add(new THREE.Vector3(0,.5,0));
          const delta=player.position.clone().add(new THREE.Vector3(0,.5,0)).sub(from);
          const steps=Math.ceil(delta.length()/.25);
          for(let i=1;i<steps;i++){const p=from.clone().addScaledVector(delta,i/steps);if(manager.isBlockSolid(Math.floor(p.x),Math.floor(p.y),Math.floor(p.z))){visible=false;break;}}
        }
        if (aim.distance <= spec.range && mob.rangedCooldown <= 0 && visible) {
          mob.rangedCooldown = spec.ranged.cooldown ?? 1.5;
          fire(mob, player, spec);
        }
      }
      mob.state = 'aim';
    }
    // Still reported as stationary: it IS stationary. The aim is a facing, not movement, and changing the
    // return value would break callers that switch on it.
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

    // The mob's own attack timer. It used to be `hitCooldown` -- the hurt-immunity window `damageMob` checks -- so a
    // zombie biting every second was immune to the player's sword for that second, and won every melee fight.
    mob.attackCooldown = Math.max(0, (mob.attackCooldown ?? 0) - dt);
    if (spec.damage > 0 && dist < spec.attackReach && mob.attackCooldown <= 0 && meleeCanReach(manager?.world, mob, player, { vertical: spec.attackReach })) {
      // Wiki: melee damage is stated per difficulty; the table's flat figure is only the fallback.
      player.takeDamage?.(meleeDamage(mob.type, manager?.game?.difficulty, spec.damage), mob.mesh.position, mob.type);
      mob.attackCooldown = 1.0;
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
