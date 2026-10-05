// Launching a firework rocket.
//
// The item existed with an icon and had no consumer at all. `EntityManager.spawnFireworkRocket` was already
// fully built -- mesh, rising trail, burst, and the launch sound -- and was called from exactly one place, a
// tournament celebration. So a player could hold a firework rocket and do nothing with it, which is the same
// shape of hole as the tipped arrows and the potions: the content and the machinery both existed and the
// consumer did not.
//
// Deviation, stated rather than hidden: vanilla fires a rocket along the player's look direction, and the
// existing rocket animates straight up to a burst height instead. That capability is what exists, and
// changing the animation is a renderer change rather than an item hook. The look direction is used to
// choose the burst height, so aiming upwards throws it further, but it always rises -- it is not a
// directional projectile and it does not yet boost elytra flight.
import * as THREE from 'three';

/** How far a rocket rises for a level throw, and how much looking up adds to it. */
export const FIREWORK_BASE_RISE = 14;
export const FIREWORK_RISE_PER_PITCH = 26;

/**
 * Launch the active firework rocket, if it is one.
 *
 * Returns true when a rocket was launched, so the caller stops looking for other uses of the item, and
 * false otherwise so the caller falls through.
 *
 * @param {object} game
 * @param {string} itemId
 * @returns {boolean}
 */
export function launchFirework(game, itemId) {
  if (itemId !== 'firework_rocket') return false;
  if (!game.player?.position) return false;

  const eye = game.player.position.clone()
    .add(new THREE.Vector3(0, game.player.eyeHeight ?? 1.62, 0));
  // The pitch of the look direction, clamped to the upper half, so a rocket aimed up bursts higher and one
  // aimed at the ground still rises to a minimum.
  const dir = game.camera?.getWorldDirection?.(new THREE.Vector3());
  const pitch = dir ? Math.max(0, Math.min(1, dir.y)) : 0;
  const targetHeight = eye.y + FIREWORK_BASE_RISE + pitch * FIREWORK_RISE_PER_PITCH;

  game.entities?.spawnFireworkRocket?.(eye, targetHeight);
  if (game.player.gamemode !== 'creative') {
    game.inventory?.consumeActiveItem?.(1);
    game.ui?.updateHotbar?.();
  }
  return true;
}
