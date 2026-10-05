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
  jump_boost: { name: 'Jump Boost', category: 'beneficial' },
  levitation: { name: 'Levitation', category: 'harmful' },

  // --- protection and utility ------------------------------------------------
  fire_resistance: { name: 'Fire Resistance', category: 'beneficial' },
  water_breathing: { name: 'Water Breathing', category: 'beneficial' },
  dolphins_grace: { name: 'Dolphin\'s Grace', category: 'beneficial' },
  night_vision: { name: 'Night Vision', category: 'beneficial' },
  invisibility: { name: 'Invisibility', category: 'beneficial' },
  absorption: { name: 'Absorption', category: 'beneficial' },
  hunger: { name: 'Hunger', category: 'harmful' },
  mining_fatigue: { name: 'Mining Fatigue', category: 'harmful' },
  haste: { name: 'Haste', category: 'beneficial' },
  blindness: { name: 'Blindness', category: 'harmful' },
  glowing: { name: 'Glowing', category: 'neutral' },
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
    m *= Math.pow(def.attackPerLevel, 1 + Math.max(0, data?.amplifier || 0));
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
    const level = Math.min(4, 1 + Math.max(0, data?.amplifier || 0));
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
    m *= Math.pow(def.speedPerLevel, 1 + Math.max(0, data?.amplifier || 0));
  }
  return Math.min(5, Math.max(0.05, m));
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
