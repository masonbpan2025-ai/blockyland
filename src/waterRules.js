// Water rules from https://minecraft.wiki/w/Water, https://minecraft.wiki/w/Swimming and
// https://minecraft.wiki/w/Breaking, as pure functions the player, the renderer and the tests share.
//
// Each figure is quoted where the wiki gives one. Where it gives none, the value is this game's and is called
// out as such, so a reader can tell parity from choice.

/** Java's default water fog colour, from the wiki's "Fog" section: #050533. */
export const UNDERWATER_FOG_COLOR = 0x050533;

/**
 * "Very dense at first, then transitions to a static distance over 30 seconds." (Water, Fog.)
 * The two distances are this game's: the wiki gives no Java figures.
 */
export const UNDERWATER_FOG = {
  transitionSeconds: 30,
  denseFar: 8,
  settledFar: 48,
  near: 0.1,
};

/**
 * How far one can see under water after `secondsSubmerged`, and how clear the water is (0 = dense, 1 = settled).
 *
 * Night Vision and Conduit Power "improve visibility" (Water, Fog): with either, the water is clear at once and
 * the settled distance is half again as far.
 */
export function underwaterVisibility(secondsSubmerged, { nightVision = false, conduitPower = false } = {}) {
  const boosted = nightVision || conduitPower;
  const clarity = boosted ? 1 : Math.min(1, Math.max(0, secondsSubmerged / UNDERWATER_FOG.transitionSeconds));
  // Ease in, so the first seconds clear noticeably and the last ones settle gently.
  const eased = 1 - (1 - clarity) * (1 - clarity);
  const settled = UNDERWATER_FOG.settledFar * (boosted ? 1.5 : 1);
  const far = UNDERWATER_FOG.denseFar + (settled - UNDERWATER_FOG.denseFar) * eased;
  return { clarity, far, near: UNDERWATER_FOG.near };
}

/**
 * The fog colour under water: the wiki's #050533, lifted by daylight close to the surface.
 *
 * The colour itself is the wiki's. Lifting it near the surface in daylight is this game's choice -- vanilla's fog
 * is brightened by light too, and a flat #050533 at every depth and hour reads as black.
 *
 * @param {number} daylight 0 at night to 1 at noon
 * @param {number} depthBelowSurface blocks between the eye and the surface above it
 * @returns {[number, number, number]} linear-ish RGB in 0..1
 */
export function underwaterFogColor(daylight, depthBelowSurface) {
  const base = [0x05 / 255, 0x05 / 255, 0x33 / 255];
  const lit = [0.07, 0.24, 0.42];
  const lift = Math.max(0, Math.min(1, daylight)) * Math.exp(-Math.max(0, depthBelowSurface) / 10);
  return base.map((c, i) => c + (lit[i] - c) * lift);
}

/**
 * The swimming speeds from the Swimming article, blocks per second.
 */
export const SWIM_SPEED = {
  /** "Surface of still water: 2.20". */
  surface: 2.2,
  /** "Partially submerged: 1.97". */
  submerged: 1.97,
  /** "about 3.918 m/s, which is 10% slower than walking". */
  sprint: 3.918,
  /** "Sprint-swimming with Depth Strider III: 5.305 m/s, 35% faster than regular sprint-swimming." */
  sprintDepthStriderIII: 5.305,
};

/** "Water with a current pushes players and mobs at about 1.39 m/s (25 blocks every 18 seconds)." (Water.) */
export const CURRENT_PUSH = 25 / 18;

/**
 * Sprint-swimming speed with Depth Strider at `level`: 3.918 at none, 5.305 at III, in proportion between.
 */
export function sprintSwimSpeed(depthStriderLevel = 0) {
  const level = Math.max(0, Math.min(3, Math.floor(Number(depthStriderLevel) || 0)));
  return SWIM_SPEED.sprint + (SWIM_SPEED.sprintDepthStriderIII - SWIM_SPEED.sprint) * (level / 3);
}

/**
 * Can the player start or keep sprint-swimming?
 *
 * Swimming: sprint-swimming starts with the sprint key while moving in water, "is not possible at 6 hunger (3
 * drumsticks) or below, or while Blindness is active", and ends "when hunger drops to 6 or below". Being in water
 * at all is the caller's: this answers only the conditions the wiki lists.
 */
export function canSprintSwim({ wantsSprint, movingForward, hunger = 20, blind = false, creative = false }) {
  if (!wantsSprint || !movingForward) return false;
  if (blind) return false;
  if (!creative && typeof hunger === 'number' && hunger <= 6) return false;
  return true;
}

/** While sprint-swimming the player is one block tall, which is what lets them through one-block gaps. */
export const SWIMMING_HEIGHT = 0.6;
export const SWIMMING_EYE_HEIGHT = 0.4;

/**
 * The mining penalty for being under water, from the Breaking article and the Water article's summary:
 * "5x slower when head-submerged on the ground and 25x slower when not on the ground. Aqua Affinity ... negating
 * the penalty on the ground (still 5x slower off the ground)."
 *
 * Returns the factor the mining SPEED is multiplied by (1 = no penalty).
 */
export function underwaterMiningMultiplier({ headInWater, onGround, aquaAffinity = false }) {
  let factor = 1;
  if (headInWater && !aquaAffinity) factor /= 5;
  if (!onGround) factor /= 5;
  return factor;
}

/**
 * Whether water placed in this dimension evaporates instead.
 *
 * "Water never generates in the Nether and disappears if placed there with a bucket, but it works normally in the
 * End." (Water.)
 */
export function waterEvaporates(dimension) {
  return dimension === 'nether' || dimension === 'the_nether';
}
