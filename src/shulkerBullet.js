// The shulker bullet.
//
// A shulker spawns, is stationary by design, and -- until now -- never attacked despite
// `ambientLocomotion.js` carrying `shulker: { range: 16, speed: 0, damage: 4, attackReach: 0 }` for it. The
// stationary branch returned before any attack logic, so the damage figure and the aggro radius were both
// unreachable. That also left `levitation` as an effect with a mechanic and no source: vanilla's only
// sources are this bullet and the `/effect` command.
//
// Vanilla: the bullet deals 4, tracks its target, and inflicts Levitation for 10 seconds on a 1.5 second
// cooldown. The levitation is the point of the mob -- it is what lifts you off a ledge.
//
// The projectile DATA is built here so it can be tested without a scene; `mobs.js` supplies the mesh and
// pushes the entry into its existing `customProjectiles` loop.
import * as THREE from 'three';

/** Vanilla's bullet speed is slow enough to be dodgeable, which is what makes the tracking fair. */
export const SHULKER_BULLET_SPEED = 9.0;
/** Seconds before a bullet that hits nothing gives up. */
export const SHULKER_BULLET_LIFE = 6.0;

/**
 * Build the projectile data for one shot.
 *
 * @param {{mesh:{position:THREE.Vector3}}} mob
 * @param {{position:THREE.Vector3}} player
 * @param {object} spec the locomotion spec, whose `ranged` carries damage, effect and effectSeconds
 * @returns {{velocity:THREE.Vector3, damage:number, effect:object|null, life:number, speed:number,
 *   homing:boolean}|null} null when there is nothing to aim at
 */
export function shulkerBulletData(mob, player, spec) {
  if (!mob?.mesh?.position || !player?.position) return null;
  const ranged = spec?.ranged ?? {};
  const origin = mob.mesh.position.clone();
  // Fired from the shell's centre rather than its base, so it does not clip the block the shulker is set into.
  origin.y += 0.5;
  const direction = player.position.clone().add(new THREE.Vector3(0, 0.9, 0)).sub(origin);
  if (direction.lengthSq() < 1e-9) return null;
  direction.normalize();

  return {
    velocity: direction.multiplyScalar(SHULKER_BULLET_SPEED),
    speed: SHULKER_BULLET_SPEED,
    // The spec's own damage, falling back to the hostile table's figure rather than to nothing.
    damage: ranged.damage ?? spec?.damage ?? 4,
    effect: ranged.effect ? { id: ranged.effect, seconds: ranged.effectSeconds ?? 10, level: 1 } : null,
    life: SHULKER_BULLET_LIFE,
    // Vanilla bullets track. Without this the shot is a straight line and trivially side-stepped.
    homing: true,
  };
}

/**
 * Steer a live bullet toward its target.
 *
 * Mutates `projectile.velocity` and returns it. The blend factor is clamped so a large frame cannot snap the
 * bullet around, which would let it hit from behind.
 *
 * @param {{velocity:THREE.Vector3, speed:number, mesh:{position:THREE.Vector3}}} projectile
 * @param {{position:THREE.Vector3}} player
 * @param {number} dt
 */
export function steerShulkerBullet(projectile, player, dt) {
  if (!projectile?.velocity || !projectile?.mesh?.position || !player?.position) return projectile?.velocity;
  const speed = projectile.speed ?? projectile.velocity.length();
  if (!(speed > 0)) return projectile.velocity;
  const wanted = player.position.clone().add(new THREE.Vector3(0, 0.9, 0))
    .sub(projectile.mesh.position);
  if (wanted.lengthSq() < 1e-9) return projectile.velocity;
  wanted.normalize().multiplyScalar(speed);
  const blend = Math.min(1, Math.max(0, 3 * dt));
  projectile.velocity.lerp(wanted, blend);
  // Re-normalised because lerping between two vectors of equal length gives a SHORTER one, so without this
  // the bullet decelerates every frame and eventually stalls mid-air. The steering should change its
  // direction and nothing else.
  if (projectile.velocity.lengthSq() > 1e-9) projectile.velocity.setLength(speed);
  return projectile.velocity;
}
