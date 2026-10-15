// Vanilla hunger, saturation, exhaustion and health regeneration.
//
// Why this exists. The player had `hunger` and `health` but nothing that reduced hunger: there was no
// exhaustion, so hunger stayed at 20 forever and food was optional. Regeneration was a flat
// `health += dt * 0.3`, which is roughly six times vanilla's fast rate and, worse, applied at any
// hunger level above 18. So the survival loop had no pressure in it at all.
//
// The model below is vanilla's, verified against Mineclonia's source (mods/PLAYER/mcl_hunger/), which
// stores the same values multiplied by 1000 to keep them integral. This module keeps them as the
// familiar decimal values instead, because there is no reason to inherit that representation.
//
// Constants, all vanilla:
//   exhaustion per action   0.005 per block mined      0.05 per jump
//                           0.2 per sprint-jump        0.1 per attack landed
//                           0.01 per block swum        0.1 per block sprinted
//                           0.1 per damage taken       6.0 per HP regenerated
//   saturation starts at 5 and is capped at the hunger level
//
// The conversion, which is the part worth getting exactly right: exhaustion accumulates, and every
// time it reaches 4.0 it resets and is paid for out of saturation first; only when saturation is gone
// does hunger actually fall. That is why a player who eats well can go a long time before the hunger
// bar moves, and why saturation is worth tracking separately at all.

export const MAX_HUNGER = 20;
export const MAX_SATURATION = 20;

/** Exhaustion added by each action, in vanilla's units. */
export const EXHAUSTION = {
  dig: 0.005,
  jump: 0.05,
  sprintJump: 0.2,
  attack: 0.1,
  swim: 0.01,
  sprint: 0.1,
  damage: 0.1,
  regen: 6.0,
};

/** Exhaustion at which one point is paid out of saturation, then hunger. Vanilla's threshold. */
export const EXHAUSTION_THRESHOLD = 4.0;

/** Food: the Hunger effect adds 0.1 exhaustion per second per level (0.005 a tick). Not in EXHAUSTION: no action charges it. */
export const HUNGER_EFFECT_EXHAUSTION_PER_SECOND = 0.1;

/** Health regeneration rates, in HP per second, and the exhaustion each HP costs. */
export const REGEN = {
  /** Food at or above this regenerates slowly. */
  slowFoodLevel: 18,
  slowPerSecond: 1 / 4,
  /** Food at maximum with saturation left regenerates quickly. */
  fastPerSecond: 1 / 0.5,
  /** Starvation damage: 1 HP every 4 seconds at food 0. */
  starvePerSecond: 1 / 4,
};

/**
 * A hunger/saturation/exhaustion state.
 *
 * Kept as a plain object with pure functions rather than baked into the player, so the arithmetic can
 * be tested directly instead of through a whole game instance.
 */
export function createHungerState({ hunger = MAX_HUNGER, saturation = 5, exhaustion = 0 } = {}) {
  return {
    hunger: clamp(hunger, 0, MAX_HUNGER),
    saturation: clamp(saturation, 0, MAX_HUNGER),
    exhaustion: Math.max(0, exhaustion),
  };
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Add exhaustion, paying it out of saturation and then hunger.
 *
 * Vanilla lets exhaustion overshoot the threshold and processes as many payouts as it crosses.
 * Mineclonia clamps it to the threshold, which under-drains after one large event; this does not
 * copy that, and the difference is described in docs/survival-parity-rules.md.
 */
/**
 * Saturation spent per exhaustion payout. Wiki (Food, Exhaustion): "Once the exhaustion level reaches 4.0, it
 * resets to 0.0 and reduces the saturation by 1 if there is any saturation remaining."
 */
export const SATURATION_PER_PAYOUT = 1;
/**
 * Saturation spent per health point healed -- derived, not charged directly. A healed HP adds 6.0 exhaustion
 * (wiki: natural regeneration), which is 1.5 payouts of 1: hence the wiki's "heals 1 HP by consuming 1.5
 * saturation". Charging 1.5 per payout as well, as this module did, made every HP cost 2.25 saturation.
 */
export const SATURATION_PER_HEALTH = (EXHAUSTION.regen / EXHAUSTION_THRESHOLD) * SATURATION_PER_PAYOUT;

export function addExhaustion(state, amount) {
  if (!(amount > 0)) return state;
  state.exhaustion += amount;
  // A loop, not an `if`: one sprint-jump is 0.2 but a large burst such as several regenerated HP is
  // 6.0 each, and those must all be paid rather than collapsed into one.
  while (state.exhaustion >= EXHAUSTION_THRESHOLD) {
    state.exhaustion -= EXHAUSTION_THRESHOLD;
    if (state.saturation > 0) {
      state.saturation = Math.max(0, state.saturation - SATURATION_PER_PAYOUT);
    } else if (state.hunger > 0) {
      state.hunger = Math.max(0, state.hunger - 1);
    } else {
      // Nothing left to pay with; do not accumulate exhaustion forever.
      state.exhaustion = 0;
      break;
    }
  }
  return state;
}

/**
 * Add food and saturation from eating.
 *
 * Saturation is capped at the hunger level, which is vanilla's rule and the reason a golden carrot
 * eaten at full hunger gives its full value while the same carrot at hunger 3 gives less.
 *
 * The cap applies to the FINAL hunger value, not the starting one. An earlier version clamped against
 * the pre-meal hunger and then added, so eating a 9.6-saturation food at hunger 3 left saturation at
 * 9.6 -- above the hunger of 7 it was supposed to be bounded by, and enough to regenerate for free.
 */
export function eat(state, hungerPoints, saturationPoints = 0) {
  state.hunger = clamp(state.hunger + hungerPoints, 0, MAX_HUNGER);
  state.saturation = clamp(state.saturation + saturationPoints, 0, state.hunger);
  return state;
}

/**
 * One tick of the hunger model.
 *
 * @param {object} state
 * @param {number} dt seconds
 * @param {object} [options]
 * @param {boolean} [options.peaceful] true when the difficulty is peaceful
 * @param {number}  [options.health] current health, for regeneration
 * @param {number}  [options.maxHealth]
 * @returns {{ heal: number, starve: number, exhausted: boolean }}
 *   `heal` and `starve` are health deltas for the caller to apply; this module does not own health,
 *   because the player already does and duplicating it would create two sources of truth.
 */
export function tickHunger(state, dt, options = {}) {
  const { peaceful = false, health = MAX_HUNGER, maxHealth = MAX_HUNGER,
    naturalRegeneration = true } = options;
  let heal = 0;
  let starve = 0;

  if (peaceful) {
    // Peaceful heals steadily and refills hunger, so a player cannot die of starvation on it. Vanilla
    // heals 1 HP per second and restores one hunger point every half second.
    //
    // Deliberately NOT gated on `naturalRegeneration`: Peaceful's heal is a difficulty property rather than
    // the gamerule, and Java keeps it.
    if (health < maxHealth) heal = dt * 1.0;
    state.hunger = clamp(state.hunger + dt * 2, 0, MAX_HUNGER);
    return { heal, starve, exhausted: false };
  }

  // Java's FoodData ticks at 20 Hz with one timer: at full hunger with saturation, every 10 ticks it heals
  // min(saturation, 6) / 6 HP for min(saturation, 6) exhaustion; at 18 or more, every 80 ticks it heals exactly 1 HP
  // for 6.0; at 0 it starves 1 HP every 80 ticks; otherwise the timer resets. This was a continuous rate, so a player
  // at 18 hunger healed two thirds of a heart and stopped (the first sliver of regeneration dropped hunger to 17),
  // where Java heals one whole HP four seconds in. Found by the Hunger management play-test.
  state.tickAcc = (state.tickAcc ?? 0) + dt * 20;
  let hp = health;
  while (state.tickAcc >= 1) {
    state.tickAcc -= 1;
    const hurt = hp < maxHealth;
    if (naturalRegeneration && state.saturation > 0 && hurt && state.hunger >= MAX_HUNGER) {
      state.foodTimer = (state.foodTimer ?? 0) + 1;
      if (state.foodTimer >= 10) {
        const spend = Math.min(state.saturation, 6);
        const amount = Math.min(spend / 6, maxHealth - hp);
        heal += amount; hp += amount;
        addExhaustion(state, spend);
        state.foodTimer = 0;
      }
    } else if (naturalRegeneration && state.hunger >= REGEN.slowFoodLevel && hurt) {
      state.foodTimer = (state.foodTimer ?? 0) + 1;
      if (state.foodTimer >= 80) {
        const amount = Math.min(1, maxHealth - hp);
        heal += amount; hp += amount;
        addExhaustion(state, EXHAUSTION.regen);
        state.foodTimer = 0;
      }
    } else if (state.hunger <= 0) {
      // Starvation. Vanilla floors this by difficulty; the caller applies the floor, because only it knows the
      // difficulty. Still runs with `naturalRegeneration` off: a player who never eats must still starve.
      state.foodTimer = (state.foodTimer ?? 0) + 1;
      if (state.foodTimer >= 80) { starve += 1; state.foodTimer = 0; }
    } else {
      state.foodTimer = 0;
    }
  }

  return { heal, starve, exhausted: false };
}

/**
 * Foods that can be eaten at full hunger. Wiki (Food): "food cannot be eaten while already at full hunger, with the
 * exception of chorus fruit, golden apples, enchanted golden apples, honey bottles, and suspicious stew."
 */
export const ALWAYS_EDIBLE = new Set(['chorus_fruit', 'golden_apple', 'enchanted_golden_apple', 'honey_bottle', 'suspicious_stew']);

/** Can this food be eaten now? Hunger alone decides (health does not), except for the always-edible ones. */
export function canEat(itemId, hunger, { creative = false, maxHunger = MAX_HUNGER } = {}) {
  return creative || hunger < maxHunger || ALWAYS_EDIBLE.has(itemId);
}

/** Health floor for starvation damage at a given difficulty, so it cannot kill where vanilla forbids. */
export function starvationFloor(difficulty) {
  switch (String(difficulty).toLowerCase()) {
    case 'peaceful': return Infinity;   // no starvation damage at all
    case 'easy': return 10;
    case 'hard': return 0;              // can kill
    case 'normal':
    default: return 1;
  }
}

/**
 * Damage scaling by difficulty, from the verified rules.
 *
 * Applied only to damage that `scales` -- mob attacks and the like -- not to fall damage or drowning,
 * which vanilla leaves alone in most cases. Callers decide when to apply it.
 */
export function scaleDamageByDifficulty(amount, difficulty) {
  switch (String(difficulty).toLowerCase()) {
    case 'peaceful': return 0;
    case 'easy': return Math.min(amount / 2 + 1, amount);
    case 'hard': return amount * 1.5;
    case 'normal':
    default: return amount;
  }
}
