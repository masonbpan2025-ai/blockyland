// Fall damage.
//
// There was none. `player.fallDistance` accumulated on every downward step and was read in exactly one
// place, `farmingManager.checkTrample`, so falling from any height was completely harmless. Vanilla's fall
// damage is one of the most basic survival hazards in the game: it is what makes cliffs, ravines and a bad
// jump dangerous, and it is the reason a bucket of water and a hay bale are worth carrying.
//
// The formula is vanilla's: nothing under three blocks, then one point of damage per block beyond it. Points
// are half-hearts, matching the rest of `takeDamage`, so a four-block fall costs half a heart and a
// twenty-three block fall kills an unarmoured player outright.

/** Falls shorter than this are free: vanilla's threshold is three blocks. */
export const FALL_DAMAGE_THRESHOLD = 3;

/**
 * Damage from a fall, in half-hearts.
 *
 * Returns zero for the cases that negate it. Water and gliding are handled here rather than at the call site
 * because they are properties of the fall itself, and a caller that forgot one would silently restore the
 * bug this file exists to fix.
 *
 * Feather Falling, Protection and the shield exclusion are NOT handled here: they belong to `takeDamage`,
 * which already applies all three to the `'fall'` damage type, and duplicating them would let the two
 * disagree.
 *
 * @param {number} fallDistance in blocks
 * @param {{gliding?:boolean, inWater?:boolean}} [state]
 * @returns {number} whole points of damage, never negative
 */
export function fallDamageFor(fallDistance, state = {}) {
  if (state.gliding || state.inWater) return 0;
  if (!Number.isFinite(fallDistance)) return 0;
  if (fallDistance <= FALL_DAMAGE_THRESHOLD) return 0;
  return Math.floor(fallDistance - FALL_DAMAGE_THRESHOLD);
}
