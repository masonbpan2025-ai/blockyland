// Status effect rules, verified against https://minecraft.wiki/w/Effect and the per-effect pages.
//
// Why this is a table rather than branches at each use site. Player.js already ticked two effects inline
// (poison, wither) and applied a third by name (fire_resistance), so a fourth and fifth would have been
// scattered conditionals with no single place to see the rules.
//
// Level scaling follows vanilla and is NOT uniform: some effects are additive on a multiplier, some are
// exponential, and some do not scale at all. The wiki tabulates which is which, and each entry below
// carries the shape it actually has. `amplifier` throughout is `level - 1`, and a level is 1-based.
//
// Deliberately NOT modelled here: the potion-to-effect mapping (fermented spider eye inverts healing to
// harming, and so on), which belongs with brewing rather than with the effect rules themselves.

/**
 * Effect definitions, keyed by vanilla's own identifier.
 *
 * Fields:
 *   name                 the display name
 *   category             'beneficial' | 'harmful' | 'neutral', for UI colouring and the HUD's two rows
 *   tickInterval         seconds between on-tick applications, where the effect has one
 *   tickIntervalHalving  true where the interval halves per level instead of staying flat
 *   damagePerTick        HP removed per tick application
 *   healPerTick          HP restored per tick application
 *   cannotKill           true where vanilla floors the damage so the effect cannot be fatal
 *   additionPerLevel     flat attack damage added per level (Strength, Weakness)
 *   takenPerLevel        fraction of incoming damage removed per level, additive (Resistance)
 *   speedPerLevel        additive fraction of movement speed per level (Speed, Slowness)
 *   miningAddPerLevel    additive mining-speed bonus per level (Haste)
 *   miningBasePerLevel   exponential mining-speed factor per level, floored (Mining Fatigue)
 *   absorptionPerLevel   absorption points granted per level
 *   scalesWithPotency    whether a higher level changes anything, per the wiki's own table
 *   instant              resolves once rather than being held
 */
export const EFFECTS = {
  // --- damage over time ------------------------------------------------------
  poison: {
    name: 'Poison', category: 'harmful', tickInterval: 1.25, damagePerTick: 1, cannotKill: true,
    damageType: 'magic', scalesWithPotency: true,
  },
  wither: {
    name: 'Wither', category: 'harmful', tickInterval: 2, damagePerTick: 1, cannotKill: false,
    damageType: 'wither', scalesWithPotency: true,
  },
  regeneration: {
    // "50 ticks per HP at level I, halved for each level" and floored at 1 tick. At 20 ticks a second
    // that is 2.5 s, then 1.25, 0.6, 0.3, 0.15, and 0.05 from level VI.
    name: 'Regeneration', category: 'beneficial', tickInterval: 2.5, tickIntervalHalving: true,
    healPerTick: 1, scalesWithPotency: true,
  },

  // --- combat modifiers ------------------------------------------------------
  // Strength and weakness change the damage the bearer DEALS, by a flat amount per level; resistance
  // changes the damage it TAKES, as an additive fraction.
  strength: { name: 'Strength', category: 'beneficial', additionPerLevel: 3, scalesWithPotency: true },
  weakness: { name: 'Weakness', category: 'harmful', additionPerLevel: -4, scalesWithPotency: true },
  resistance: { name: 'Resistance', category: 'beneficial', takenPerLevel: 0.2, scalesWithPotency: true },

  // --- movement --------------------------------------------------------------
  speed: { name: 'Speed', category: 'beneficial', speedPerLevel: 0.2, scalesWithPotency: true },
  slowness: { name: 'Slowness', category: 'harmful', speedPerLevel: -0.15, scalesWithPotency: true },
  // Jump Boost raises the jump AND shortens the fall; the fall half is in `fallDamage` below.
  jump_boost: { name: 'Jump Boost', category: 'beneficial', jumpPerLevel: true, scalesWithPotency: true },
  levitation: { name: 'Levitation', category: 'harmful', scalesWithPotency: true },

  // --- mining speed ----------------------------------------------------------
  // Java's two rules are not the same shape and cannot share a field. Haste is additive on the
  // multiplier -- `1 + 0.2 * level` -- while Mining Fatigue is exponential and floors at level 4:
  // 0.3, 0.09, 0.0027, then 0.00081 for level 4 and above. That last one is why an Elder Guardian's
  // curse famously stops a player mining at all.
  haste: { name: 'Haste', category: 'beneficial', miningAddPerLevel: 0.2, scalesWithPotency: true },
  mining_fatigue: {
    name: 'Mining Fatigue', category: 'harmful', miningBasePerLevel: 0.3, miningMaxLevel: 4,
    scalesWithPotency: true,
  },

  // --- protection and utility ------------------------------------------------
  // The wiki marks every one of these "No" under "scales with potency": a higher level is the same
  // effect for longer, or over a wider area, and changes nothing about how strong it is.
  fire_resistance: { name: 'Fire Resistance', category: 'beneficial', scalesWithPotency: false },
  water_breathing: { name: 'Water Breathing', category: 'beneficial', scalesWithPotency: false },
  // A conduit grants Conduit Power, which is its own status in vanilla and carries water breathing, night
  // vision and haste. Named here so the effect a conduit applies is a real one.
  conduit_power: { name: 'Conduit Power', category: 'beneficial', scalesWithPotency: true },
  dolphins_grace: { name: 'Dolphin\'s Grace', category: 'beneficial', scalesWithPotency: true },
  // Slow Falling was named by a potion and absent from this table, so it had no name, no category and no
  // rule. Its rule is in `fallDamage` below, next to the distance it modifies.
  slow_falling: { name: 'Slow Falling', category: 'beneficial', scalesWithPotency: false },
  night_vision: { name: 'Night Vision', category: 'beneficial', scalesWithPotency: false },
  invisibility: { name: 'Invisibility', category: 'beneficial', scalesWithPotency: false },
  // Absorption is a shield rather than a heal: a pool that takes damage before the health bar and does
  // not come back. Four points per level, two hearts.
  absorption: { name: 'Absorption', category: 'beneficial', absorptionPerLevel: 4, scalesWithPotency: true },
  blindness: { name: 'Blindness', category: 'harmful', scalesWithPotency: false },
  glowing: { name: 'Glowing', category: 'neutral', scalesWithPotency: false },
  nausea: { name: 'Nausea', category: 'harmful', scalesWithPotency: false },
  darkness: { name: 'Darkness', category: 'harmful', scalesWithPotency: false },

  // --- hunger, health and saturation -----------------------------------------
  // Hunger costs exhaustion rather than damage. The wiki gives it a per-action exhaustion surcharge
  // scaled by level, which is what `exhaustionPerLevel` feeds.
  hunger: {
    name: 'Hunger', category: 'harmful', exhaustionPerLevel: 0.005, scalesWithPotency: true,
  },
  saturation: { name: 'Saturation', category: 'beneficial', scalesWithPotency: true },
  health_boost: { name: 'Health Boost', category: 'beneficial', healthPerLevel: 4, scalesWithPotency: true },

  // --- the two that resolve once ---------------------------------------------
  // They are effects in the game's own data and carry an id, so they belong in the table even though
  // `potionUse.js` applies them through `health` rather than holding a timer.
  instant_health: { name: 'Instant Health', category: 'beneficial', instant: true, scalesWithPotency: true },
  instant_damage: { name: 'Instant Damage', category: 'harmful', instant: true, scalesWithPotency: true },

  // --- fishing luck ----------------------------------------------------------
  luck: { name: 'Luck', category: 'beneficial', scalesWithPotency: true },
  unluck: { name: 'Bad Luck', category: 'harmful', scalesWithPotency: true },

  // --- the ominous effects ---------------------------------------------------
  bad_omen: { name: 'Bad Omen', category: 'neutral', scalesWithPotency: true },
  trial_omen: { name: 'Trial Omen', category: 'neutral', scalesWithPotency: false },
  raid_omen: { name: 'Raid Omen', category: 'neutral', scalesWithPotency: true },
  hero_of_the_village: { name: 'Hero of the Village', category: 'beneficial', scalesWithPotency: true },

  // --- the trial-chamber effects ---------------------------------------------
  // Each fires once when its bearer dies, which is what `onDeath` records.
  infested: { name: 'Infested', category: 'harmful', onDeath: 'silverfish', scalesWithPotency: false },
  oozing: { name: 'Oozing', category: 'harmful', onDeath: 'slime', scalesWithPotency: false },
  weaving: { name: 'Weaving', category: 'harmful', onDeath: 'cobweb', scalesWithPotency: false },
  wind_charged: { name: 'Wind Charged', category: 'harmful', onDeath: 'wind_charge', scalesWithPotency: false },

  // --- one potion, two effects -----------------------------------------------
  // Vanilla's Potion of the Turtle Master applies two statuses at once, and its enhanced tier applies a
  // stronger pair. There is no "Turtle Master" effect in the HUD -- the player sees Slowness and
  // Resistance -- which is why this is a rule rather than a status the player holds.
  //
  // The two tiers are written out rather than scaled from one pair, because the levels are the EFFECT
  // levels and not the potion's: the regular potion is Slowness IV + Resistance III and the enhanced one
  // is Slowness VI + Resistance IV, so multiplying IV/III by two would give VIII/VI. The two do not
  // advance by the same amount either (4 -> 6 against 3 -> 4), so no single multiplier produces both.
  turtle_master: {
    name: 'Turtle Master', category: 'beneficial',
    compound: [['slowness', 4], ['resistance', 3]],
    compoundByLevel: { 2: [['slowness', 6], ['resistance', 4]] },
  },
};

/** Effects vanilla defines that this game does not implement, with the reason. */
export const UNIMPLEMENTED_EFFECTS = Object.freeze({
  fatal_poison: 'Bedrock Edition only',
  village_hero: 'Bedrock Edition alias of hero_of_the_village',
  freezing: 'upcoming: Fourth Drop 2026',
  breath_of_the_nautilus: 'added after the pinned 1.21.4 dataset',
});

/** The effect ids vanilla 1.21.4 defines, so the table above can be checked against the game's list. */
export const VANILLA_EFFECT_IDS = Object.freeze([
  'absorption', 'bad_omen', 'blindness', 'conduit_power', 'darkness', 'dolphins_grace',
  'fire_resistance', 'glowing', 'haste', 'health_boost', 'hero_of_the_village', 'hunger',
  'infested', 'instant_damage', 'instant_health', 'invisibility', 'jump_boost', 'levitation',
  'luck', 'mining_fatigue', 'nausea', 'night_vision', 'oozing', 'poison', 'raid_omen',
  'regeneration', 'resistance', 'saturation', 'slowness', 'slow_falling', 'speed', 'strength',
  'trial_omen', 'unluck', 'water_breathing', 'weakness', 'weaving', 'wind_charged', 'wither',
]);

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
/**
 * The flat attack damage a set of active effects adds or removes.
 *
 * Vanilla's rule is additive and flat: "Strength increases melee damage by 3 HP x level" and Weakness
 * subtracts 4 per level, so a Strength II sword adds six damage whatever the sword is. This was a
 * multiplier (`1.3^level`) until the wiki check, which is a different rule from a different edition and
 * was invisible at level I because 1.3 and "+3 on a 10-damage hit" coincide there.
 *
 * @returns {number} HP to add to the hit, negative for Weakness
 */
export function attackDamageBonus(effects) {
  let bonus = 0;
  for (const [name, data] of entriesOf(effects)) {
    const def = EFFECTS[name];
    if (!def?.additionPerLevel) continue;
    bonus += def.additionPerLevel * levelOf(data);
  }
  return bonus;
}

/**
 * The multiplier a flat damage bonus represents for a hit of a given size.
 *
 * Kept so callers that can only multiply still get vanilla's number. A hit of 0 or less is returned
 * unscaled rather than divided by zero.
 */
export function attackMultiplier(effects, baseDamage = 0) {
  if (!(baseDamage > 0)) return 1;
  return Math.max(0, (baseDamage + attackDamageBonus(effects)) / baseDamage);
}

/**
 * The combined multiplier a set of active effects applies to damage TAKEN.
 *
 * Vanilla: "Resistance reduces damage by 20% x level", additively, so 0.8, 0.6, 0.4 and 0.2 for levels
 * I to IV. This was `0.8^level` -- 0.64 at level II where vanilla is 0.6, and 0.41 at level IV where
 * vanilla is 0.2 -- which again agreed at level I and diverged above it.
 *
 * Level IV removes 80% and vanilla stops there; the cap is applied here so every caller gets it.
 */
export function damageTakenMultiplier(effects) {
  let taken = 1;
  for (const [name, data] of entriesOf(effects)) {
    const def = EFFECTS[name];
    if (!def?.takenPerLevel) continue;
    const level = Math.min(4, levelOf(data));
    taken *= Math.max(0, 1 - def.takenPerLevel * level);
  }
  return taken;
}

/**
 * The combined multiplier a set of active effects applies to movement speed.
 *
 * Vanilla is additive: Speed adds 20% per level and Slowness removes 15% per level, so Speed II is +40%
 * and Slowness II is -30%. This was `1.2^level` and `0.85^level`, which gave +44% and -27.8% at level II.
 *
 * The two are summed into one additive term rather than multiplied, which is what makes Speed II and
 * Slowness I together exactly +5%. The result is clamped so a pile of effects cannot go negative or
 * runaway.
 */
export function speedMultiplier(effects) {
  let bonus = 0;
  for (const [name, data] of entriesOf(effects)) {
    const def = EFFECTS[name];
    if (!def?.speedPerLevel) continue;
    bonus += def.speedPerLevel * levelOf(data);
  }
  return Math.min(5, Math.max(0.05, 1 + bonus));
}

/**
 * The combined multiplier a set of active effects applies to MINING speed.
 *
 * Haste and Mining Fatigue are the one pair here that are not the same shape, so they cannot share a
 * field or a `Math.pow`. Haste adds 20% of the base per level. Mining Fatigue is `0.3^min(level, 4)`,
 * which the wiki tabulates as 30%, 9%, 2.7% and 0.81% for levels I to IV and 0.81% beyond -- mining
 * durations of 3.3x, 11.1x, 37x and 123x. Level III is the Elder Guardian's curse, which is why mining
 * near an ocean monument is hopeless.
 *
 * Both can be active at once and they multiply, as in Java.
 */
export function miningSpeedMultiplier(effects) {
  let m = 1;
  for (const [name, data] of entriesOf(effects)) {
    const def = EFFECTS[name];
    if (!def) continue;
    const level = levelOf(data);
    if (def.miningAddPerLevel) m *= 1 + def.miningAddPerLevel * level;
    if (def.miningBasePerLevel) {
      m *= Math.pow(def.miningBasePerLevel, Math.min(def.miningMaxLevel ?? level, level));
    }
  }
  return m;
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
 * The effects a compound effect stands for, at the levels it declares for that tier.
 *
 * Vanilla has exactly one of these: the Potion of the Turtle Master applies Slowness IV and Resistance III
 * from a single brew, and the enhanced tier applies VI and IV. Returns `[[name, level], ...]`, or an
 * empty list for an ordinary effect.
 *
 * @param {string} name effect name, `turtle_master` being the only compound one
 * @param {number} [level] the potion's tier, 1 for the base brew and 2 for the enhanced one
 */
export function compoundEffects(name, level = 1) {
  const def = EFFECTS[name];
  if (!def || !Array.isArray(def.compound)) return [];
  const tier = Math.max(1, Math.floor(level) || 1);
  // A tier with no entry of its own falls back to the base pair rather than being scaled, because the
  // levels are effect levels: a hypothetical level III would otherwise silently apply something invented.
  const pair = def.compoundByLevel?.[tier] ?? def.compound;
  return pair.map(([effect, effectLevel]) => [effect, effectLevel]);
}

/**
 * The status effects an effect name actually applies, as `[[name, level], ...]`.
 *
 * The one place that knows a compound effect is two effects and an ordinary one is one. Drinking and
 * throwing were not sharing it, and could not: `potionUse.js` expanded `turtle_master` and
 * `splashPotion.js` did not, so a thrown Splash Potion of the Turtle Master applied a `turtle_master`
 * status -- which no rule in this table reads, and which vanilla has no HUD icon for -- and granted
 * neither its Slowness nor its Resistance. Both paths ask this now, so the two cannot disagree.
 *
 * @param {string|null|undefined} name
 * @param {number} [level]
 * @returns {Array<[string, number]>}
 */
export function effectsFor(name, level = 1) {
  if (!name) return [];
  const compound = compoundEffects(name, level);
  return compound.length ? compound : [[name, Math.max(1, Math.floor(level) || 1)]];
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
  // A measured fall lands a hair under the whole number (19.99999 for a 20-block drop); without the epsilon `floor`
  // took a whole point off.
  return Math.floor(distance - FALL_DAMAGE.freeBlocks + 1e-4);
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

/** The two effects that resolve once rather than being held, as a set for callers that only ask that. */
export const INSTANT_EFFECT_IDS = new Set(
  Object.entries(EFFECTS).filter(([, def]) => def.instant).map(([key]) => key),
);

/**
 * The interval an effect ticks on, at a given level.
 *
 * Most effects have a flat interval -- Poison every 1.25 s whatever the level, because its POTENCY is the
 * damage, not the rate. Regeneration is the exception: the wiki's table is "50 ticks per HP at level I,
 * halved for each level", floored at 1 tick, which is 2.5 s, 1.25, 0.6, 0.3, 0.15, 0.05 and then 0.05.
 */
export function tickIntervalFor(name, level = 1) {
  const def = EFFECTS[name];
  if (!def || def.tickInterval === undefined) return undefined;
  if (!def.tickIntervalHalving) return def.tickInterval;
  const lvl = Math.max(1, Math.floor(level) || 1);
  const ticks = Math.max(1, 50 >> (lvl - 1));
  return ticks / 20;
}

/**
 * The HP an instant effect delivers at a given level.
 *
 * Instant Health restores 4 HP at level I and doubles per level; Instant Damage deals 6 and doubles. Both
 * are effects in the game's data, which is why they are in the table, but they resolve once rather than
 * being held, so `potionUse.js` applies them through `health` instead of a timer.
 */
export function instantAmount(name, level = 1) {
  const def = EFFECTS[name];
  if (!def?.instant) return 0;
  const lvl = Math.max(1, Math.floor(level) || 1);
  const base = name === 'instant_health' ? 4 : 6;
  return base * Math.pow(2, lvl - 1);
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
  const interval = tickIntervalFor(name, levelOf(data));
  // The timer lives on the effect data so it survives across frames without a parallel map.
  data.tickTimer = (data.tickTimer || 0) + dt;
  if (data.tickTimer < interval) return null;
  data.tickTimer -= interval;
  if (def.damagePerTick) {
    return { damage: def.damagePerTick, cannotKill: !!def.cannotKill, damageType: def.damageType || 'magic' };
  }
  if (def.healPerTick) return { heal: def.healPerTick };
  return null;
}

/**
 * The extra exhaustion an effect adds to a player action.
 *
 * Vanilla's Hunger "increases food exhaustion": moving, sprinting, jumping, mining and attacking each
 * cost more while it is active. It had a name and a category here and no rule behind it, so it changed
 * nothing about hunger at all.
 *
 * @param {string} action 'move' | 'sprint' | 'jump' | 'mine' | 'attack'
 * @returns {number} extra exhaustion for one action, zero without the effect
 */
export function exhaustionFor(name, level = 1, action = 'move') {
  const def = EFFECTS[name];
  if (!def?.exhaustionPerLevel) return 0;
  const lvl = Math.max(1, Math.floor(level) || 1);
  return def.exhaustionPerLevel * lvl;
}

// --- immunity -------------------------------------------------------------------

/** Mobs vanilla makes immune to a particular effect, or to a group of them, by mob type. */
export const EFFECT_IMMUNITY = {
  // "The ender dragon, the wither, NPCs and the agent are immune to all effects." The wither is the
  // interesting one here because Wither is its own effect.
  all: ['ender_dragon', 'wither', 'npc', 'agent'],
  // "Undead mobs are immune to Regeneration and Poison."
  regeneration: ['zombie', 'zombie_villager', 'husk', 'drowned', 'skeleton', 'stray', 'bogged',
    'wither_skeleton', 'zombified_piglin', 'zoglin', 'phantom', 'skeleton_horse', 'zombie_horse'],
  poison: ['zombie', 'zombie_villager', 'husk', 'drowned', 'skeleton', 'stray', 'bogged',
    'wither_skeleton', 'zombified_piglin', 'zoglin', 'phantom', 'skeleton_horse', 'zombie_horse',
    // "Spiders and cave spiders are immune to Poison."
    'spider', 'cave_spider'],
  // "Wither skeletons are immune to Wither in addition to Regeneration and Poison."
  wither: ['wither_skeleton'],
  // The trial-chamber effects, each immune on the mob that applies it.
  oozing: ['slime'],
  infested: ['silverfish'],
  wind_charged: ['breeze'],
  trial_omen: ['breeze', 'bogged', 'husk', 'stray', 'slime', 'silverfish'],
  raid_omen: ['evoker', 'vindicator', 'pillager', 'illusioner', 'ravager', 'witch'],
};

/**
 * Is a mob type immune to an effect?
 *
 * Vanilla is explicit about which mobs shrug off which effects, and this game applied every effect to
 * every mob: a splash Potion of Poison hurt spiders, which in vanilla it cannot.
 *
 * @param {string} effectName
 * @param {string} mobType
 * @returns {boolean}
 */
export function immuneToEffect(effectName, mobType) {
  if (!effectName || !mobType) return false;
  if (EFFECT_IMMUNITY.all.includes(mobType)) return true;
  return EFFECT_IMMUNITY[effectName]?.includes(mobType) ?? false;
}

/**
 * What an effect leaves behind when its bearer dies.
 *
 * The four trial-chamber effects all fire once on death rather than ticking: Infested spawns silverfish,
 * Oozing slimes, Weaving cobwebs, and Wind Charged a burst of wind. Returns the mob or block to create,
 * or null for an effect with no death behaviour.
 */
export function deathEffectFor(effectName) {
  return EFFECTS[effectName]?.onDeath ?? null;
}


/** Effect names in a set, for tests and for reporting. */
export function effectNames() {
  return Object.keys(EFFECTS);
}
