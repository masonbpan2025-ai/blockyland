// The Java Edition attack cooldown, from the wiki's Damage page (Attack cooldown):
//
//   "The attack_speed attribute controls the length of the cooldown time, with the time taken being
//    T = 20 / attack_speed ticks. The damage multiplier is then 0.2 + ((t + 0.5) / T) ^ 2 * 0.8, restricted to the
//    range 0.2 - 1, where t is the number of ticks since the last attack or item switch."
//   "Damage done by enchantments ... is also reduced, but not as severely (the multiplier is not squared)."
//   "At 84.8% attack cooldown charge, critical hits, sweep attacks, and sprint-knockback attacks become possible"
//   -- 84.8% of full damage, which is a charge of 0.9.
//
// The game had no cooldown at all: every click dealt full damage, so a stone axe (9) clicked as fast as a mouse
// allows out-damaged any sword, the opposite of the wiki's "axes deal more damage than swords but have lower DPS"
// (Tutorial:Your first 10 minutes, Tutorial:Combat). Attack speeds are the wiki's, from resourceWikiData.js.
import { WIKI_ITEMS } from './resourceWikiData.js';
import { ITEMS } from './blocks.js';

/** An empty hand, and anything without an attack-speed modifier: 4 attacks a second. */
export const HAND_ATTACK_SPEED = 4;

/** Attacks per second for a held item id (null for an empty hand or a block). */
export function attackSpeedFor(itemId) {
  if (!itemId || typeof itemId !== 'string') return HAND_ATTACK_SPEED;
  const speed = WIKI_ITEMS[itemId]?.attackSpeed ?? ITEMS[itemId]?.attackSpeed;
  return Number.isFinite(speed) && speed > 0 ? speed : HAND_ATTACK_SPEED;
}

/** Seconds for a full charge with this item. */
export function cooldownSeconds(itemId) {
  return 1 / attackSpeedFor(itemId);
}

/** The charge, 0–1, after `secondsSinceSwing` with this item: ((t + 0.5) / T), in ticks. */
export function attackCharge(secondsSinceSwing, itemId) {
  const ticks = Math.max(0, secondsSinceSwing) * 20;
  const full = 20 / attackSpeedFor(itemId);
  return Math.min(1, Math.max(0, (ticks + 0.5) / full));
}

/** Base damage scaled by the charge: 0.2 + charge² × 0.8. */
export function scaleBaseDamage(base, charge) {
  return base * (0.2 + charge * charge * 0.8);
}

/** Enchantment damage scaled by the charge. */
export function scaleEnchantDamage(bonus, charge) {
  return bonus * charge;
}

/** Critical hits, sweeps and sprint-knockback need 84.8% of full damage: a charge of 0.9 (0.2 + 0.8 x 0.81). */
export const STRONG_ATTACK_CHARGE = 0.9;
