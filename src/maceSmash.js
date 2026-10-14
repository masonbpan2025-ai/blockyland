// The mace's smash attack and its three enchantments, from the wiki (Java Edition). Missing until the systems
// parity audit (src/systemsWikiAudit.js) found that Breach, Density and Wind Burst did not exist and the mace was a
// plain 6-damage club. Free of Three.js so the numbers are testable; main.js calls it when the player attacks.
//
// Mace: "A mace does a smash attack when it is used after the player has fallen 1.5 blocks or more"; "The player
// must not be grounded or in elytra flight"; "Smash attacks cannot be performed if the player has the Slow Falling
// effect"; "4 extra damage for each of the first 3 blocks fallen, 2 extra damage for each of the next 5 blocks
// fallen, and 1 extra damage for each block fallen after that"; a smash "resets the player's fall height";
// "All entities within 2.5 blocks of the attack are knocked back".

export const SMASH_MIN_FALL = 1.5;
export const SMASH_KNOCKBACK_RADIUS = 2.5;

/** Can this attack be a smash attack? */
export function canSmash({ itemId, fallDistance = 0, onGround = false, elytraFlying = false, slowFalling = false } = {}) {
  return itemId === 'mace' && fallDistance >= SMASH_MIN_FALL && !onGround && !elytraFlying && !slowFalling;
}

/**
 * The extra damage a smash attack deals after falling `fallDistance` blocks. Density: "increases smash attack damage
 * by 0.5 per block fallen per level of enchantment".
 */
export function smashBonus(fallDistance, densityLevel = 0) {
  if (!(fallDistance >= SMASH_MIN_FALL)) return 0;
  const first = Math.min(fallDistance, 3);
  const next = Math.min(Math.max(fallDistance - 3, 0), 5);
  const rest = Math.max(fallDistance - 8, 0);
  return 4 * first + 2 * next + rest + 0.5 * Math.max(0, densityLevel) * fallDistance;
}

/**
 * Breach: "deals damage as though the enemy's damage reduction from armor was 15 percentage points lower per level":
 * damage taken = weapon damage x (1 - max(0%, armor effectiveness - level x 15%)). `effectiveness` is the fraction
 * the armour would have taken off (0..0.8).
 */
export function breachedArmourFraction(effectiveness, breachLevel = 0) {
  return Math.max(0, effectiveness - 0.15 * Math.max(0, breachLevel));
}

/**
 * Wind Burst: the wielder "is launched back into the air" after a smash attack, "approximately 8 blocks of upward
 * knockback for the first level, 16 blocks for the second level, and 24 blocks for the third level". The upward
 * speed that rises that far under `gravity` (blocks/s^2): v = sqrt(2 g h).
 */
export function windBurstHeight(level) {
  return level > 0 ? 8 * Math.min(level, 3) : 0;
}
export function windBurstVelocity(level, gravity) {
  const h = windBurstHeight(level);
  return h > 0 ? Math.sqrt(2 * gravity * h) : 0;
}

/** An item's level of one enchantment, whichever of the two shapes the game stores enchantments in. */
export function enchantLevel(enchantments, id) {
  if (!enchantments) return 0;
  if (Array.isArray(enchantments)) return enchantments.find((e) => e?.id === id)?.level ?? 0;
  return Number(enchantments[id]) || 0;
}
