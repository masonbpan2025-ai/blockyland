// Enchantment numeric effects, in one table.
//
// The melee call site in main.js held the damage bonuses inline, with the undead list spelled out as a
// literal array. Adding bane of arthropods there would have meant a second list beside it, and the
// durability, thorns and fire-aspect effects had no home at all. This module is the same shape as
// statusEffects.js: the numbers live in one place, the call sites ask for a result.
//
// Values are vanilla's, cross-checked against the Mineclonia figures recorded in
// docs/survival-parity-rules.md section 2.5. Where the two differ the vanilla figure is used and the
// difference is noted, because that document already lists where Mineclonia is not a parity reference.

/** Mobs damaged extra by smite. */
export const UNDEAD = new Set([
  'zombie', 'zombie_villager', 'husk', 'drowned', 'skeleton', 'stray', 'bogged', 'wither_skeleton',
  'zombified_piglin', 'zombie_pigman', 'zoglin', 'phantom', 'skeleton_horse', 'zombie_horse',
  'wither', 'wither_skull',
]);

/** Mobs damaged extra by bane of arthropods. */
export const ARTHROPODS = new Set([
  'spider', 'cave_spider', 'silverfish', 'endermite', 'bee', 'arthropod',
]);

/** Mobs damaged extra by impaling, which vanilla 1.21 applies to aquatic mobs. */
export const AQUATIC = new Set([
  'squid', 'glow_squid', 'dolphin', 'guardian', 'elder_guardian', 'turtle', 'cod', 'salmon',
  'tropical_fish', 'pufferfish', 'axolotl', 'tadpole', 'drowned',
]);

/**
 * The extra damage a weapon's enchantments add against a particular target.
 *
 * This reproduces exactly what the melee call site computed before it was extracted -- sharpness at
 * 0.5 per level plus 0.5, smite and impaling at 2.5 per level -- and adds bane of arthropods on the same
 * pattern. The extraction is asserted against those known numbers in the tests, so a tidy-up cannot
 * quietly change combat.
 *
 * @param {Array<{id:string, level:number}>} enchantments
 * @param {string} targetType
 */
export function attackBonus(enchantments, targetType) {
  let bonus = 0;
  if (!Array.isArray(enchantments)) return 0;
  for (const ench of enchantments) {
    if (!ench || typeof ench.level !== 'number') continue;
    switch (ench.id) {
      case 'sharpness':
        bonus += 0.5 * ench.level + 0.5;
        break;
      case 'smite':
        if (UNDEAD.has(targetType)) bonus += 2.5 * ench.level;
        break;
      case 'bane_of_arthropods':
        if (ARTHROPODS.has(targetType)) bonus += 2.5 * ench.level;
        break;
      case 'impaling':
        if (AQUATIC.has(targetType)) bonus += 2.5 * ench.level;
        break;
      default:
        break;
    }
  }
  return bonus;
}

/**
 * How long fire aspect sets the target alight, in seconds.
 *
 * Vanilla burns for 4 seconds per level, matching Mineclonia's `level * 4`.
 */
export function fireAspectSeconds(level) {
  if (typeof level !== 'number' || level <= 0) return 0;
  return 4 * level;
}

/**
 * Damage thorns reflects on to an attacker.
 *
 * Vanilla rolls each armour piece independently: a piece with level L reflects with probability
 * `0.15 * L`, and a piece that procs deals 1 to 4 damage. Multiple pieces can proc on one hit, and
 * Mineclonia's note ("level * 0.15 per piece for up to 4 damage") describes the same shape.
 *
 * @param {Array<{id:string, level:number}>|undefined} armourEnchantments  one list per worn piece,
 *   already flattened by the caller
 * @param {() => number} [random]  injectable for deterministic tests
 * @returns {{damage:number, procs:number}}
 */
export function thornsReflect(armourEnchantments, random = Math.random) {
  if (!Array.isArray(armourEnchantments)) return { damage: 0, procs: 0 };
  let damage = 0;
  let procs = 0;
  for (const list of armourEnchantments) {
    if (!Array.isArray(list)) continue;
    for (const ench of list) {
      if (!ench || ench.id !== 'thorns' || typeof ench.level !== 'number') continue;
      if (random() >= 0.15 * ench.level) continue;
      procs++;
      // 1 to 4 inclusive, which is vanilla's range.
      damage += 1 + Math.floor(random() * 4);
    }
  }
  return { damage, procs };
}

/**
 * Does a tool survive this use, given unbreaking?
 *
 * Vanilla keeps the durability point with probability `level / (level + 1)`. Mineclonia expresses the
 * same thing as multiplying attack uses by `1 + level`, which is the expected value rather than the
 * roll; the per-use probability is what a single call needs.
 */
export function unbreakingKeepsUse(level, random = Math.random) {
  if (typeof level !== 'number' || level <= 0) return false;
  return random() < level / (level + 1);
}

/**
 * The depth strider speed multiplier while in water.
 *
 * Mineclonia uses `level/3 + 0.75`, which at level 3 gives 1.75 and removes the water penalty entirely.
 * Vanilla caps the effect at level 3 for the same reason, so a level above that is clamped here.
 */
export function depthStriderMultiplier(level) {
  if (typeof level !== 'number' || level <= 0) return 1;
  return Math.min(3, level) / 3 + 0.75;
}
