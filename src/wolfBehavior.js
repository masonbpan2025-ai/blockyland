/**
 * Wolf rules.
 *
 * Reference: https://minecraft.wiki/w/Wolf
 *
 * The defining stat of a wolf is that taming raises its health: a wild wolf has 8 HP and a
 * tamed one has 40. The tree previously gave every wolf a flat 20, which is neither value
 * and did not change on taming.
 */

/** Wiki: wild wolves have 8 HP. */
export const WOLF_WILD_HEALTH = 8;

/** Wiki: tamed wolves have 40 HP. */
export const WOLF_TAMED_HEALTH = 40;

/** Wiki: adult 0.6 wide x 0.85 tall; baby 0.3 x 0.425 (exactly half). */
export const WOLF_DIMENSIONS = {
  adult: { width: 0.6, height: 0.85 },
  baby: { width: 0.3, height: 0.425 }
};

/** Wiki: each bone has a 1/3 chance of taming a wolf. */
export const WOLF_TAME_CHANCE = 1 / 3;

/** Wiki: the default collar colour is red. */
export const WOLF_DEFAULT_COLLAR = 'red';

/** True when the mob is a wolf. */
export function isWolf(mob) {
  return mob?.type === 'wolf';
}

/**
 * Maximum health for a wolf in the given state.
 *
 * Note this is a property of being tamed, not of the individual wolf: the wiki gives one
 * number for wild wolves and one for tamed wolves.
 */
export function wolfMaxHealth(tamed) {
  return tamed ? WOLF_TAMED_HEALTH : WOLF_WILD_HEALTH;
}

/**
 * Apply the tamed state to a wolf, raising its maximum health in place.
 *
 * The current health is raised by the same amount the maximum grows, so a wild wolf that
 * was at full health is still at full health once tamed rather than appearing badly hurt.
 * A wolf that was already injured keeps its injuries.
 */
export function applyWolfTamed(mob) {
  if (!isWolf(mob)) return null;
  const before = mob.maxHealth ?? WOLF_WILD_HEALTH;
  const after = wolfMaxHealth(true);
  const gained = after - before;
  mob.isTamed = true;
  mob.maxHealth = after;
  mob.health = Math.min(after, (mob.health ?? before) + Math.max(0, gained));
  return mob;
}
