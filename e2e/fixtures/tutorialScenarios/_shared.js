// Helpers shared by the tutorial scenario groups (the newcomer group keeps its own copies).
import { BLOCKS } from '../../../src/blocks.js';

export const W = (page) => `https://minecraft.wiki/w/Tutorial:${page.replace(/ /g, '_')}`;

/** Kill a mob through the game's own death path (scenery cleanup, not a tutorial step). */
export const remove = (game, m) => { if (m?.health > 0) { m.hitCooldown = 0; game.mobs.damageMob(m, 999, m.mesh.position, false, null); } };

/** Hunger state the game is using (the model in hunger.js mirrors onto the player). */
export const hungerOf = (player) => player._hungerState ?? player;
export function setHunger(player, hunger, saturation, exhaustion = 0) {
  player.hunger = hunger; player.saturation = saturation; player.exhaustion = exhaustion; player.ensureHungerState?.();
  if (player._hungerState) Object.assign(player._hungerState, { hunger, saturation, exhaustion });
}

/** Hold movement keys the way a player does, for `seconds`. */
export async function hold(t, controls, seconds) {
  const p = t.player; let jumps = 0, wasGround = p.onGround; const start = p.position.clone();
  for (let i = 0; i < Math.round(seconds / t.dt); i++) {
    p.botControls = { ...controls }; t.step();
    if (wasGround && !p.onGround && p.velocity.y > 0) jumps++;
    wasGround = p.onGround; if (i % 20 === 0) await Promise.resolve();
  }
  p.botControls = null;
  return { jumps, metres: Math.hypot(p.position.x - start.x, p.position.z - start.z) };
}

/** An oak tree: a five-log trunk with a leaf canopy on ground at y0 - 1. */
export function oakTree(t, x, z, y0 = 5) {
  for (let y = y0; y < y0 + 5; y++) t.set(x, y, z, BLOCKS.OAK_LOG);
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let y = y0 + 3; y <= y0 + 5; y++) {
    if ((dx || dz || y === y0 + 5) && Math.abs(dx) + Math.abs(dz) < 4 && t.world.getVoxel(x + dx, y, z + dz) === BLOCKS.AIR) t.set(x + dx, y, z + dz, BLOCKS.OAK_LEAVES);
  }
}

/** Put the player at a point in the air above the ground and let the game drop them; returns the damage taken. */
export async function dropFrom(t, x, y, z) {
  const p = t.player; const hp = p.health;
  p.position.set(x + 0.5, y, z + 0.5); p.velocity.set(0, 0, 0); p.onGround = false; p.fallDistance = 0;
  for (let i = 0; i < 300 && !p.onGround && !p.isDead; i++) { t.step(); if (i % 20 === 0) await Promise.resolve(); }
  await t.wait(0.3);
  return +(hp - p.health).toFixed(2);
}

/** Read a hotbar compass needle's angle from the HUD (radians, 0 = straight ahead), after one frame. */
export function compassNeedle(game, slot) {
  const needle = game.ui?.hotbarEl?.querySelector?.(`.compass-needle[data-slot="${slot}"]`);
  return needle ? { angle: Number(needle.dataset.angle), spinning: needle.dataset.spinning === '1' } : null;
}
