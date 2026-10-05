// Status effect rules, verified against Mineclonia.
//
// Why this is a table rather than branches at each use site. Player.js already ticked two effects inline
// (poison, wither) and applied a third by name (fire_resistance), so a fourth and fifth would have been
// scattered conditionals with no single place to see the rules. The values below come from the research
// recorded in docs/survival-parity-rules.md, which is derived from Mineclonia and checked against
// vanilla where the two differ.
//
// Level scaling: vanilla applies `level` as an amplifier where level I is amplifier 0, so a multiplier
// of 1.3 applies at level 1 and 1.6 at level 2 for strength. `amplifier` throughout is `level - 1`.
//
// Deliberately NOT modelled here: the potion-to-effect mapping (fermented spider eye inverts healing to
// harming, and so on), which belongs with brewing rather than with the effect rules themselves.

/**
 * Effect definitions, keyed by the name the rest of the game uses.
 *
 * Fields:
 *   category            'beneficial' | 'harmful' | 'neutral', for UI colouring and for the tests
 *   tickInterval        seconds between on-tick applications, where the effect has one
 *   damagePerTick       HP removed per tick application
 *   healPerTick         HP restored per tick application
 *   cannotKill          true where vanilla floors the damage so the effect cannot be fatal
 *   attackPerLevel      multiplier applied to damage the bearer deals, per level
 *   takenPerLevel       multiplier applied to damage the bearer receives, per level
 *   speedPerLevel       multiplier applied to movement speed, per level
 */
export const EFFECTS = {
  // --- damage over time ------------------------------------------------------
  poison: {
    name: 'Poison', category: 'harmful', tickInterval: 1.25, damagePerTick: 1, cannotKill: true,
    damageType: 'magic',
  },
  wither: {
    name: 'Wither', category: 'harmful', tickInterval: 2, damagePerTick: 1, cannotKill: false,
    damageType: 'wither',
  },
  regeneration: {
    name: 'Regeneration', category: 'beneficial', tickInterval: 2.5, healPerTick: 1,
  },

  // --- combat modifiers ------------------------------------------------------
  // Strength and weakness multiply damage the bearer DEALS; resistance multiplies damage it TAKES.
  strength: { name: 'Strength', category: 'beneficial', attackPerLevel: 1.3 },
  weakness: { name: 'Weakness', category: 'harmful', attackPerLevel: 0.8 },
  resistance: { name: 'Resistance', category: 'beneficial', takenPerLevel: 0.8 },

  // --- movement --------------------------------------------------------------
  speed: { name: 'Speed', category: 'beneficial', speedPerLevel: 1.2 },
  slowness: { name: 'Slowness', category: 'harmful', speedPerLevel: 0.85 },
  // Jump Boost raises the jump AND shortens the fall; the fall half is in `fallDamage` below.
  jump_boost: { name: 'Jump Boost', category: 'beneficial', jumpPerLevel: true },
  levitation: { name: 'Levitation', category: 'harmful' },

  // --- protection and utility ------------------------------------------------
  fire_resistance: { name: 'Fire Resistance', category: 'beneficial' },
  water_breathing: { name: 'Water Breathing', category: 'beneficial' },
  dolphins_grace: { name: 'Dolphin\'s Grace', category: 'beneficial' },
  // Slow Falling was named by a potion and absent from this table, so it had no name, no category and no
  // rule. Its rule is in `fallDamage` below, next to the distance it modifies.
  slow_falling: { name: 'Slow Falling', category: 'beneficial' },
  night_vision: { name: 'Night Vision', category: 'beneficial' },
  invisibility: { name: 'Invisibility', category: 'beneficial' },
  // Absorption is a shield rather than a heal: a pool that takes damage before the health bar and does
  // not come back. Four points per level, two hearts.
  absorption: { name: 'Absorption', category: 'beneficial', absorptionPerLevel: 4 },
  hunger: { name: 'Hunger', category: 'harmful' },
  mining_fatigue: { name: 'Mining Fatigue', category: 'harmful' },
  haste: { name: 'Haste', category: 'beneficial' },
  blindness: { name: 'Blindness', category: 'harmful' },
  glowing: { name: 'Glowing', category: 'neutral' },

  // --- one potion, two effects -----------------------------------------------
  // Vanilla's Potion of the Turtle Master is a single brew that applies Slowness IV and Resistance III at
  // once. One `level` cannot express two different levels, and the potion carries only one, so the pair is
  // declared here and `compoundEffects` returns it. Vanilla has no "Turtle Master" effect in the HUD --
  // the player sees Slowness and Resistance -- which is why this entry is a rule rather than a status the
  // player holds.
  turtle_master: {
    name: 'Turtle Master', category: 'beneficial',
    compound: [['slowness', 4], ['resistance', 3]],
  },
};

/** Does this game know about an effect by this name? */
export function isKnownEffect(name) {
  return Object.prototype.hasOwnProperty.call(EFFECTS, name);
}

/**
 * Normalise an effect collection to iterable entries.
 *
 * `player.statusEffects` is a Map, but several tests and stubs build a Player-shaped object with a plain
 * `{}` or leave the field undefined. Iterating those directly throws "is not iterable", which would turn
 * a stubbed player into a crash in the damage path rather than a no-op. Accepting both shapes here keeps
 * the callers from each having to guard.
 *
 * @param {Map|object|null|undefined} effects
 * @returns {Iterable<[string, object]>}
 */
function entriesOf(effects) {
  if (!effects) return [];
  // Arrays are checked BEFORE `.entries`, because an array has an `entries()` method too -- it yields
  // index/value pairs, so testing for the method first turned an array of effect pairs into a sequence of
  // [index, pair] entries and silently produced a multiplier of 1.
  if (Array.isArray(effects)) return effects;
  if (typeof effects.entries === 'function') return effects.entries();
  if (typeof effects === 'object') return Object.entries(effects);
  return [];
}

/** The definition for an effect, or null. Never throws on an unknown name. */
export function effectFor(name) {
  return EFFECTS[name] || null;
}

/**
 * The level of an active effect, as a positive integer.
 *
 * `player.applyStatusEffect` stores `level`, 1-based. This file read `amplifier` instead, which nothing
 * in the game sets -- so `data?.amplifier || 0` was always 0 and every effect applied at level 1. A
 * Strength II potion was indistinguishable from Strength I, and Resistance IV reduced incoming damage by
 * 20% where vanilla reduces it by 59%. The three multipliers below were the only readers of a field that
 * did not exist; `player.js`, `witherEffect.js` and `striderBehavior.js` all read `level` or handle both.
 *
 * `amplifier` is still accepted, 0-based, because that is vanilla's name for the field and
 * `striderBehavior.js` already builds that shape. An explicit `amplifier` wins over `level`.
 */
function levelOf(data) {
  if (Number.isFinite(data?.amplifier)) return Math.max(1, Math.floor(data.amplifier) + 1);
  if (Number.isFinite(data?.level)) return Math.max(1, Math.floor(data.level));
  return 1;
}

/**
 * The combined multiplier a set of active effects applies to damage DEALT.
 *
 * Effects multiply together, so strength and weakness at once cancel to 1.04 rather than to 1.0, which
 * matches vanilla's behaviour of applying each modifier in turn.
 *
 * @param {Iterable<[string, {amplifier?:number}]>} effects  entries as player.statusEffects yields them
 */
export function attackMultiplier(effects) {
  let m = 1;
  for (const [name, data] of entriesOf(effects)) {
    const def = EFFECTS[name];
    if (!def?.attackPerLevel) continue;
    m *= Math.pow(def.attackPerLevel, levelOf(data));
  }
  return m;
}

/**
 * The combined multiplier a set of active effects applies to damage TAKEN.
 *
 * Resistance is capped at level 4 in vanilla, where it reaches 100% and the bearer becomes immune to
 * most sources. The cap is applied here rather than at the call site so every caller gets it.
 */
export function damageTakenMultiplier(effects) {
  let m = 1;
  for (const [name, data] of entriesOf(effects)) {
    const def = EFFECTS[name];
    if (!def?.takenPerLevel) continue;
    const level = Math.min(4, levelOf(data));
    m *= Math.pow(def.takenPerLevel, level);
  }
  return m;
}

/**
 * The combined multiplier a set of active effects applies to movement speed.
 *
 * Each effect is applied at its own level; the result is clamped to a sane range so a pile of effects
 * cannot produce a negative or runaway speed.
 */
export function speedMultiplier(effects) {
  let m = 1;
  for (const [name, data] of entriesOf(effects)) {
    const def = EFFECTS[name];
    if (!def?.speedPerLevel) continue;
    m *= Math.pow(def.speedPerLevel, levelOf(data));
  }
  return Math.min(5, Math.max(0.05, m));
}

/**
 * The shield Absorption puts in front of the health bar.
 *
 * Vanilla grants four points per level and the pool does not refill: it is spent before health and then it
 * is gone. A stronger application while one is already running takes the larger of the two rather than
 * adding, which is what keeps two golden apples from stacking into sixteen points.
 *
 * @returns {number} points of shield the effect should leave the bearer with
 */
export function absorptionShield(effects) {
  let shield = 0;
  for (const [name, data] of entriesOf(effects)) {
    const def = EFFECTS[name];
    if (!def?.absorptionPerLevel) continue;
    shield = Math.max(shield, def.absorptionPerLevel * levelOf(data));
  }
  return shield;
}

/**
 * Vanilla's jump velocity rule, so Jump Boost can be expressed as the game it copies.
 *
 * A player jumps at 0.42 blocks per tick, and Jump Boost adds 0.1 per level. Scaling the local
 * `jumpForce` by the same ratio is what makes level I clear about 1.9 blocks against the base 1.25, which
 * is vanilla's figure -- adding a flat 0.1 to a velocity of 8.6 would have been a rounding error.
 */
export const VANILLA_JUMP = { velocity: 0.42, boostPerLevel: 0.1 };

/**
 * The multiplier Jump Boost applies to the jump velocity.
 *
 * Returns 1 with no effect, so the caller can multiply unconditionally.
 */
export function jumpVelocityMultiplier(effects) {
  let level = 0;
  for (const [name, data] of entriesOf(effects)) {
    if (name === 'jump_boost') level = Math.max(level, levelOf(data));
  }
  if (level <= 0) return 1;
  return (VANILLA_JUMP.velocity + VANILLA_JUMP.boostPerLevel * level) / VANILLA_JUMP.velocity;
}

/**
 * The effects a compound effect stands for, at the levels it declares.
 *
 * Vanilla has exactly one of these: the Potion of the Turtle Master applies Slowness IV and Resistance III
 * from a single brew. Returns `[[name, level], ...]`, or an empty list for an ordinary effect.
 */
export function compoundEffects(name) {
  const compound = EFFECTS[name]?.compound;
  return Array.isArray(compound) ? compound.map(([effect, level]) => [effect, level]) : [];
}

/**
 * Fall damage rules.
 *
 * Vanilla takes nothing for the first three blocks and then one point per block beyond that. The game
 * tracked `fallDistance` and then reset it on landing without ever applying damage, so a fall from any
 * height was free -- and two items that exist only to reduce fall damage, Feather Falling and the Potion
 * of Slow Falling, could not do anything because there was nothing to reduce.
 */
export const FALL_DAMAGE = {
  /** Blocks fallen before any damage is taken. */
  freeBlocks: 3,
  /** Descent speed Slow Falling holds the player to, in blocks per second. */
  slowFallingSpeed: 3.0,
};

/**
 * Damage from landing after a fall, after the effects that modify the distance.
 *
 * Slow Falling negates the damage outright rather than scaling it. Jump Boost subtracts its level from
 * the distance before the free blocks come off, which is order-dependent and is why this is one function
 * rather than two adjustments at the call site.
 *
 * Feather Falling is deliberately not here: it reduces the damage after armour has been accounted for,
 * which `player.takeDamage` already does when it is handed a `'fall'` damage type.
 *
 * @param {number} fallDistance blocks fallen
 * @param {Iterable<[string, {level?:number, amplifier?:number}]>} effects as player.statusEffects yields
 * @returns {number} HP of damage, zero when the fall is harmless
 */
export function fallDamage(fallDistance, effects) {
  if (!(fallDistance > 0)) return 0;
  let jumpBoost = 0;
  let slowFalling = false;
  for (const [name, data] of entriesOf(effects)) {
    if (name === 'slow_falling') slowFalling = true;
    else if (name === 'jump_boost') jumpBoost = Math.max(jumpBoost, levelOf(data));
  }
  if (slowFalling) return 0;
  const distance = fallDistance - jumpBoost;
  if (!(distance > FALL_DAMAGE.freeBlocks)) return 0;
  return Math.floor(distance - FALL_DAMAGE.freeBlocks);
}

/**
 * True when Slow Falling is holding the player's descent.
 *
 * Separate from `fallDamage` because it applies while falling rather than on landing, and vanilla has
 * both: the potion makes the fall slow AND makes it harmless.
 */
export function hasSlowFalling(effects) {
  for (const [name] of entriesOf(effects)) if (name === 'slow_falling') return true;
  return false;
}

/**
 * Apply the effect's own per-tick behaviour, if it has one.
 *
 * Returns what happened rather than performing it, so the caller decides whether the damage can kill
 * and how to report it. `poison` is the reason: vanilla floors it so poison alone never kills, and that
 * guard belongs with the health it is guarding rather than in a table.
 *
 * @returns {{damage?:number, heal?:number, cannotKill?:boolean, damageType?:string}|null}
 */
export function tickEffect(name, data, dt) {
  const def = EFFECTS[name];
  if (!def || def.tickInterval === undefined) return null;
  // The timer lives on the effect data so it survives across frames without a parallel map.
  data.tickTimer = (data.tickTimer || 0) + dt;
  if (data.tickTimer < def.tickInterval) return null;
  data.tickTimer -= def.tickInterval;
  if (def.damagePerTick) {
    return { damage: def.damagePerTick, cannotKill: !!def.cannotKill, damageType: def.damageType || 'magic' };
  }
  if (def.healPerTick) return { heal: def.healPerTick };
  return null;
}

/** Effect names in a set, for tests and for reporting. */
export function effectNames() {
  return Object.keys(EFFECTS);
}
