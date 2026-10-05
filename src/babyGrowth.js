/**
 * Baby growth rules, shared by every breedable mob.
 *
 * Reference: https://minecraft.wiki/w/Breeding
 *
 * Wiki: "Most baby mobs take 20 minutes to grow up... This can be accelerated by feeding them
 * their breeding item", and each feeding "reduces the remaining time to maturity by 10%,
 * having no effect if less than 9 seconds remain".
 *
 * These values used to be duplicated as bare literals across `animalBehaviors.js`,
 * `horseBehavior.js`, `striderBehavior.js`, `squidBehavior.js` and `mooshroomBehavior.js`, and
 * the ordinary animals used **120 seconds instead of 1200**. The assessment recorded that as a
 * confirmed defect affecting every breedable animal.
 */

/** Seconds per minute, for readable constants below. */
const MINUTE = 60;

/**
 * Wiki: 20 minutes (24000 ticks) to grow up.
 *
 * Expressed in seconds because every timer in this codebase counts down in seconds.
 */
export const BABY_GROWTH_SECONDS = 20 * MINUTE;

/**
 * Wiki: the same 20 minutes applies to the mobs that were previously given their own value.
 *
 * Horses, donkeys, hoglins, striders and squids all took `1200` seconds, which happens to be
 * the correct 20 minutes, so their behaviour is preserved. They are listed explicitly rather
 * than implied, so the constant is the single source of truth for all of them.
 */
export const BABY_GROWTH_SECONDS_BY_TYPE = {
  horse: BABY_GROWTH_SECONDS,
  donkey: BABY_GROWTH_SECONDS,
  mule: BABY_GROWTH_SECONDS,
  hoglin: BABY_GROWTH_SECONDS,
  strider: BABY_GROWTH_SECONDS,
  squid: BABY_GROWTH_SECONDS,
  glow_squid: BABY_GROWTH_SECONDS
};

/** Wiki: each feeding removes 10% of the remaining time. */
export const BABY_FEED_ACCELERATION = 0.1;

/** Wiki: feeding has no effect once less than 9 seconds remain. */
export const BABY_FEED_MINIMUM_SECONDS = 9;

/**
 * The growth time a freshly born (or freshly spawned) baby of this type should get.
 *
 * Every breedable mob gets 20 minutes; the per-type table exists so a future exception has one
 * obvious place to live, and so the value a given mob receives is inspectable.
 */
export function babyGrowthSecondsFor(type) {
  return BABY_GROWTH_SECONDS_BY_TYPE[type] ?? BABY_GROWTH_SECONDS;
}

/**
 * Apply one feeding's acceleration to a baby's remaining growth time.
 *
 * Wiki: reduce the remainder by 10%, and do nothing at all when less than 9 seconds remain —
 * that threshold is a real rule, not a rounding detail, because it caps how far feeding can
 * shorten growth.
 *
 * Returns the new remaining time.
 */
export function accelerateBabyGrowth(mob, type = mob?.type) {
  if (!mob || typeof mob !== 'object') return 0;
  const remaining = mob.babyGrowthTimer ?? babyGrowthSecondsFor(type);
  // Below the floor, feeding is a no-op rather than a tiny reduction.
  if (remaining < BABY_FEED_MINIMUM_SECONDS) {
    mob.babyGrowthTimer = remaining;
    return remaining;
  }
  mob.babyGrowthTimer = remaining * (1 - BABY_FEED_ACCELERATION);
  return mob.babyGrowthTimer;
}

/**
 * Give a baby its full growth timer.
 *
 * Used at birth, when a spawn egg creates a baby, and when an age-locked baby is released.
 */
export function startBabyGrowth(mob, type = mob?.type) {
  if (!mob || typeof mob !== 'object') return 0;
  mob.babyGrowthTimer = babyGrowthSecondsFor(type);
  return mob.babyGrowthTimer;
}

/**
 * Age a baby by `dt` seconds, maturing it when the timer reaches zero.
 *
 * Wiki: babies do not grow while age-locked (the golden dandelion). Returns true when the mob
 * grew up this step.
 *
 * All the per-part resets that maturation implies live here, so a mob cannot mature with a
 * baby's scale or a hidden wattle left over. This previously existed as four separate copies
 * of the same block, and the squid's copy reset nothing at all.
 */
export function updateBabyGrowth(mob, dt, type = mob?.type) {
  if (!mob?.isBaby || mob.ageLocked) return false;
  mob.babyGrowthTimer = (mob.babyGrowthTimer ?? babyGrowthSecondsFor(type)) - dt;
  if (mob.babyGrowthTimer > 0) return false;
  mob.isBaby = false;
  mob.babyGrowthTimer = 0;
  mob.mesh?.scale?.set?.(1, 1, 1);
  if (mob.head) mob.head.scale.set(1, 1, 1);
  if (mob.horns) mob.horns.forEach(h => { h.visible = true; });
  if (mob.udder) mob.udder.visible = true;
  if (mob.wattle) mob.wattle.visible = true;
  return true;
}

/**
 * How many feedings the wiki's own example needs.
 *
 * Wiki history: "28 feedings reduce the remaining time to around a minute, from the initial
 * time of 20 minutes." Exposed so the arithmetic is testable against the wiki's stated figure
 * rather than only against itself.
 */
export function feedingsToGrow(seconds = BABY_GROWTH_SECONDS, minimum = BABY_FEED_MINIMUM_SECONDS) {
  let remaining = seconds;
  let feedings = 0;
  while (remaining >= minimum) {
    remaining *= (1 - BABY_FEED_ACCELERATION);
    feedings++;
  }
  return feedings;
}
