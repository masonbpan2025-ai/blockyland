// Absorption.
//
// `statusEffects.js` has defined Absorption since that table was written and nothing implemented it: it was
// absent from the damage path and from the UI, so applying it would have done literally nothing. It is also
// half of what a golden apple is FOR, which is why the two are done together.
//
// Vanilla: each level of Absorption grants four points (two hearts) of a buffer that damage is taken out of
// before health, and that does not regenerate. Applying the effect takes the maximum rather than summing, so
// a second golden apple does not stack a second buffer on top of an unspent one.

/** Points of absorption per level. Vanilla's figure: four points, so two hearts. */
export const ABSORPTION_PER_LEVEL = 4;

/** The buffer an application of the effect at `level` grants, taking the larger of the two. */
export function absorptionForLevel(level, current = 0) {
  const wanted = ABSORPTION_PER_LEVEL * Math.max(0, Math.floor(level || 0));
  return Math.max(0, current, wanted);
}

/**
 * Take damage out of an absorption buffer.
 *
 * @param {number} damage
 * @param {number} pool the current buffer
 * @returns {{absorbed:number, remaining:number, pool:number}} damage that got through, and what is left
 */
export function absorbDamage(damage, pool) {
  const safeDamage = Number.isFinite(damage) ? Math.max(0, damage) : 0;
  const safePool = Number.isFinite(pool) ? Math.max(0, pool) : 0;
  const absorbed = Math.min(safeDamage, safePool);
  return { absorbed, remaining: safeDamage - absorbed, pool: safePool - absorbed };
}
