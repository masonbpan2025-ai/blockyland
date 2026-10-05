/**
 * Dolphin rules.
 *
 * Reference: https://minecraft.wiki/w/Dolphin
 *
 * Dolphins are aquatic neutral mobs defined by three things this module centralises: their
 * health, the out-of-water suffocation timer (the wiki's `Moistness`), and the
 * Dolphin's Grace radius the player gets for sprint-swimming nearby.
 */

/** Wiki: 10 HP. The tree previously reported 20, which is not any release's value. */
export const DOLPHIN_HEALTH = 10;

/** Wiki: adult 0.9 wide x 0.6 tall; baby 0.585 x 0.39. */
export const DOLPHIN_DIMENSIONS = {
  adult: { width: 0.9, height: 0.6 },
  baby: { width: 0.585, height: 0.39 }
};

/** Wiki: baby scale is 0.65 of the adult model (0.585 / 0.9). */
export const DOLPHIN_BABY_SCALE = 0.65;

/**
 * Wiki `Moistness`: set to 2400 ticks (120 seconds) when in water or rain, and decremented
 * by one per tick otherwise. The dolphin takes damage once it reaches zero.
 */
export const DOLPHIN_MOISTNESS_TICKS = 2400;

/** Seconds of dryness before suffocation, derived from the tick value at 20 ticks/second. */
export const DOLPHIN_DRY_SECONDS = DOLPHIN_MOISTNESS_TICKS / 20;

/**
 * Wiki: sprint-swimming within a 9-block sphere grants Dolphin's Grace for 5 seconds, and
 * it is replenished while the player stays within 15 blocks.
 */
export const DOLPHIN_GRACE_GRANT_RANGE = 9;
export const DOLPHIN_GRACE_KEEP_RANGE = 15;
export const DOLPHIN_GRACE_SECONDS = 5;

/** How often an out-of-water dolphin takes suffocation damage, in seconds. */
export const DOLPHIN_SUFFOCATION_INTERVAL = 1;

/** True when the mob is a dolphin. */
export function isDolphin(mob) {
  return mob?.type === 'dolphin';
}

/** True when the dolphin is dry enough to be suffocating. */
export function dolphinIsSuffocating(mob) {
  return isDolphin(mob) && !mob.inWater && (mob.moistness ?? DOLPHIN_MOISTNESS_TICKS) <= 0;
}

/**
 * Advance a dolphin's dryness timer, applying suffocation damage once it has run out.
 *
 * Wiki: "If a dolphin leaves the water in dry weather, it starts taking suffocation damage
 * after two minutes... It takes no damage out of water during rain." Rain therefore refills
 * moistness just as water does.
 *
 * Returns true when damage was applied this step, so the caller can decide to act on it.
 */
export function updateDolphinMoistness(manager, mob, dt, raining = false) {
  if (!isDolphin(mob)) return false;
  if (mob.inWater || raining) {
    mob.moistness = DOLPHIN_MOISTNESS_TICKS;
    mob.suffocationTimer = 0;
    return false;
  }

  mob.moistness = Math.max(0, (mob.moistness ?? DOLPHIN_MOISTNESS_TICKS) - dt * 20);
  if (mob.moistness > 0) {
    mob.suffocationTimer = 0;
    return false;
  }

  // Once dry, damage lands on a steady interval rather than every frame.
  mob.suffocationTimer = (mob.suffocationTimer || 0) + dt;
  if (mob.suffocationTimer >= DOLPHIN_SUFFOCATION_INTERVAL) {
    mob.suffocationTimer = 0;
    manager?.damageMob?.(mob, 1, null, false, null, true);
    return true;
  }
  return false;
}

/**
 * Apply the Dolphin's Grace effect for a player sprint-swimming near a dolphin.
 *
 * Wiki: the boost is granted inside 9 blocks and kept alive inside 15, so a player who
 * drifts out of the inner radius keeps the effect rather than losing it instantly.
 * Returns true when the effect was applied.
 */
export function applyDolphinsGrace(mob, player, manager = null) {
  if (!isDolphin(mob) || !player?.position) return false;
  if (!player.isInWater) return false;
  const distance = mob.mesh.position.distanceTo(player.position);
  // A dolphin further than the keep range cannot refresh the effect at all.
  if (distance > DOLPHIN_GRACE_KEEP_RANGE) return false;
  // Between the grant and keep ranges the effect only persists, it is not re-granted.
  if (distance > DOLPHIN_GRACE_GRANT_RANGE && !player.hasStatusEffect?.('dolphins_grace')) return false;
  player.applyStatusEffect?.('dolphins_grace', DOLPHIN_GRACE_SECONDS, 1);
  return true;
}
