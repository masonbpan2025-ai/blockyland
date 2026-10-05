// The tick clock and the day/night light model the spawning rules are expressed against.
//
// Why spawning needs a clock at all.
//
// Minecraft runs spawning on game ticks, not frames. A category's interval ("CREATURE runs every
// 400 ticks") is meaningless without one, and the day/night light reduction is a function of the
// world time, not of the render delta. This engine updates from a variable `requestAnimationFrame`
// delta, so a fixed-step accumulator sits between the two: it is what makes the spawn rate
// independent of the frame rate.
//
// Why the sky-darken model is here and not in the light engine.
//
// The light engine stores RAW sky light, exactly as Minecraft does. Minecraft then reduces it by
// `skyDarken` when a gameplay system asks for a brightness: 11 at midday, 4 at midnight in the
// Overworld, so full sky light reads as 4 at noon and 11 at midnight. Storing the reduced value
// would mean relighting the whole world every time the sun moved, so the reduction is applied at
// the query instead -- and this module is where the reduction is computed from the clock and the
// weather.
//
// Reference: Minecraft Wiki "Daylight cycle", "Light" and "Weather"; PaperMC/Paper
// `Level.getSkyDarken()` and `DimensionType`. Behaviour reimplemented; no Mojang source copied.

/**
 * Game ticks per second. Minecraft's fixed rate; everything interval-based is expressed in it.
 */
export const TICKS_PER_SECOND = 20;

/** Ticks in a full Minecraft day. */
export const TICKS_PER_DAY = 24000;

/**
 * The tick at which the day starts, and the tick at which night starts.
 *
 * Minecraft's clock runs 0..24000 with 0 = sunrise, 6000 = noon, 12000 = sunset, 18000 = midnight.
 */
export const TICK_SUNRISE = 0;
export const TICK_NOON = 6000;
export const TICK_SUNSET = 12000;
export const TICK_MIDNIGHT = 18000;

/** Sky darken at midday (clear) and at midnight in the Overworld. */
export const SKY_DARKEN_DAY = 0;
export const SKY_DARKEN_NIGHT = 11;
/** A rain or snowfall at midday darkens the sky by 3. */
export const SKY_DARKEN_RAIN = 3;
/** A thunderstorm at midday darkens the ambient sky by 5. */
export const SKY_DARKEN_THUNDER = 5;
/**
 * The value the MONSTER spawning rule substitutes during a thunderstorm.
 *
 * `Monster.isDarkEnoughToSpawn` calls the two-argument `getMaxLocalRawBrightness(pos, 10)` when the
 * level is thundering. That is not the ambient darkening (which is 5); it is a separate constant, so
 * sky light 15 reads as 5 for spawning purposes. Recorded separately because conflating the two is
 * an easy mistake -- the spec explicitly calls the tension out.
 */
export const SKY_DARKEN_MONSTER_THUNDER = 10;

export class SpawnClock {
  /**
   * @param {object} [options]
   * @param {number} [options.maxTicksPerCall] clamp for a catch-up burst
   * @param {number} [options.ticksPerSecond]
   */
  constructor({ maxTicksPerCall = 5, ticksPerSecond = TICKS_PER_SECOND } = {}) {
    this.ticksPerSecond = ticksPerSecond;
    this.tickDuration = 1 / ticksPerSecond;
    this.maxTicksPerCall = maxTicksPerCall;
    this.accumulator = 0;
    this.ticks = 0;
    this.droppedTicks = 0;
  }

  /**
   * Add `dtSeconds` to the accumulator and take out whole ticks.
   *
   * @param {number} dtSeconds
   * @returns {number} ticks to run now
   */
  advance(dtSeconds) {
    const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 0;
    this.accumulator += dt;
    let ticks = Math.floor(this.accumulator / this.tickDuration);
    if (ticks <= 0) return 0;
    this.accumulator -= ticks * this.tickDuration;
    if (ticks > this.maxTicksPerCall) {
      // Counted, not silently swallowed: a persistent nonzero value means the spawn rate is lower
      // than the game's tick rate and the reason should be visible.
      this.droppedTicks += ticks - this.maxTicksPerCall;
      ticks = this.maxTicksPerCall;
    }
    this.ticks += ticks;
    return ticks;
  }

  /** Throw away the accumulated remainder, as a world reload must. */
  reset() {
    this.accumulator = 0;
  }
}

/**
 * Normalise a world time into 0..24000.
 */
export function wrapDayTime(worldTime) {
  const t = Number(worldTime);
  if (!Number.isFinite(t)) return TICK_NOON;
  return ((t % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
}

/**
 * Is it night, as the spawning and burning rules understand it?
 *
 * Night is 13000..23000 in Minecraft's clock. The range is used by mob rules that only apply after
 * dark (the creaking, phantom spawning, zombie horse riders).
 */
export function isNight(worldTime) {
  const t = wrapDayTime(worldTime);
  return t >= 13000 && t <= 23000;
}

/**
 * The sky-darken value: how much is subtracted from raw sky light.
 *
 * `Level.getSkyDarken()` is 0 in the day and rises to 11 at night, reduced by rain and further by
 * thunder. This engine has no separate ambient-darkness curve, so the value is derived from the
 * clock:
 *
 *   clear noon        0    -> internal sky light 15
 *   rain at noon      3    -> 12
 *   thunder at noon   5    -> 10 (and the monster rule substitutes 10, reading 5)
 *   midnight         11    -> 4
 *
 * The night value is held flat across the dark half of the day rather than interpolated, because
 * vanilla's own value is a step function of the celestial angle and a smooth ramp would produce a
 * spawning rate vanilla never has. Twilight therefore transitions over the two short windows where
 * the sun is between 0 and 15 degrees above the horizon, which is what makes dawn and dusk feel
 * abrupt in the same way the game does.
 *
 * @param {number} worldTime 0..24000
 * @param {{rain?: boolean, thunder?: boolean}} [weather]
 * @returns {number} 0..11 for the Overworld
 */
export function skyDarkenFor(worldTime, weather = {}) {
  const t = wrapDayTime(worldTime);
  // Day is 0..12000 in Minecraft's clock; night 12000..24000. The two 2000-tick twilight windows
  // either side of noon/midnight are the ramp.
  let darken;
  if (t >= 2000 && t <= 10000) {
    darken = SKY_DARKEN_DAY;
  } else if (t >= 10000 && t < TICK_SUNSET) {
    darken = SKY_DARKEN_DAY + (SKY_DARKEN_NIGHT - SKY_DARKEN_DAY) * ((t - 10000) / 2000);
  } else if (t >= TICK_SUNSET && t <= 22000) {
    darken = SKY_DARKEN_NIGHT;
  } else {
    // 22000 -> 24000/0 -> 2000 ramps back to day.
    const wrapped = t > 22000 ? t - 22000 : t + 2000;
    darken = SKY_DARKEN_NIGHT + (SKY_DARKEN_DAY - SKY_DARKEN_NIGHT) * (wrapped / 4000);
  }
  // Weather darkens the ambient sky. Vanilla's thunder value is a floor, not an addition, so a
  // thunderstorm at midnight is still 11 rather than 16.
  if (weather.rain) darken = Math.max(darken, SKY_DARKEN_RAIN);
  if (weather.thunder) darken = Math.max(darken, SKY_DARKEN_THUNDER);
  return Math.max(0, Math.min(15, darken));
}

/**
 * The sky-darken value for a dimension.
 *
 * A dimension without sky light has no day/night cycle at all: `hasSkyLight() == false` means
 * `skyDarken` is 0 and there is no sky light to darken. The Nether and the End are both in that
 * category, so both return 0 rather than a night value -- their mob rules are governed entirely by
 * the dimension type's `monster_spawn_block_light_limit` (15 for the Nether, 0 for the End) and its
 * `monster_spawn_light_level` (a constant 7 for the Nether, uniform 0..7 for the End).
 */
export function skyDarkenForDimension(dimension, worldTime, weather = {}) {
  if (dimension === 'nether' || dimension === 'the_end') return 0;
  return skyDarkenFor(worldTime, weather);
}

/**
 * The `monster_spawn_light_level` bound for a dimension, sampled.
 *
 * From the dimension type data: the Overworld and the End use `uniform 0..7` (so a plain
 * `nextInt(8)`), and the Nether uses the constant 7.
 */
export function sampleMonsterSpawnLightLevel(dimension, random) {
  if (dimension === 'nether') return 7;
  return random.nextInt(8);
}

/**
 * The `monster_spawn_block_light_limit` for a dimension.
 *
 * The Overworld and the End are 0 -- block light must be zero for a monster to spawn, which is the
 * 1.18 "hostile mobs now spawn only in complete darkness" change. The Nether is 15, and the code
 * short-circuits when the limit is 15, disabling the clause entirely.
 */
export function monsterSpawnBlockLightLimit(dimension) {
  return dimension === 'nether' ? 15 : 0;
}
