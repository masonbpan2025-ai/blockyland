/**
 * Zombie and skeleton variants: husk, stray, bogged and parched.
 *
 * References: https://minecraft.wiki/w/Husk · /w/Stray · /w/Bogged · /w/Parched
 *
 *
 * All three are variants of a mob that already exists, so the *geometry* is shared and only the
 * appearance, stats and one signature behaviour differ. Keeping the differences in one table means the
 * three spawners are thin delegations rather than three near-copies of the zombie and skeleton models.
 */

/** Wiki: husk 20 HP with 2 armour; stray 20 HP; bogged 16 HP; parched 16 HP. */
export const VARIANT_HEALTH = { husk: 20, stray: 20, bogged: 16, parched: 16 };

/** Wiki: husk has a natural armour rating of 2. */
export const HUSK_ARMOR = 2;

/** Wiki: adult 1.95 tall for the husk, 1.99 for the archers; all 0.6 wide. */
export const VARIANT_DIMENSIONS = {
  husk: { width: 0.6, height: 1.95 },
  stray: { width: 0.6, height: 1.99 },
  bogged: { width: 0.6, height: 1.99 },
  parched: { width: 0.6, height: 1.99 }
};

/** Wiki: husk babies are 0.49 x 0.98. Zombie and skeleton babies are not implemented. */
export const HUSK_BABY_DIMENSIONS = { width: 0.49, height: 0.98 };
export const HUSK_BABY_SCALE = 0.5;

/** Wiki: husk 0.23 speed, 0.345 for a baby. */
export const HUSK_SPEED = { adult: 0.23, baby: 0.345 };

/** Wiki: husk damage 2.5 / 3 / 4.5, which are the only fractional melee values among these variants. */
export const HUSK_DAMAGE = { peaceful: 0, easy: 2.5, normal: 3, hard: 4.5 };

/** Wiki: husk unarmed attacks also apply Hunger, for 7 x regional-difficulty seconds. */
export const HUSK_HUNGER_SECONDS = { min: 7, max: 21 };

/** Wiki: a husk that is submerged for 30 s begins converting, which takes 15 s more. */
export const HUSK_DROWNING = { submergedSeconds: 30, convertSeconds: 15 };

/** Wiki: strays inflict Slowness for 30 seconds with a tipped arrow. */
export const STRAY_SLOWNESS_SECONDS = 30;

/** Wiki: bogged inflict Poison for 4 seconds. */
export const BOGGED_POISON_SECONDS = 4;

/** Wiki: the bogged's attack cooldown is 4.5 s (3.5 on Hard), against the skeleton's 3 s. */
export const BOGGED_ATTACK_COOLDOWN = { normal: 4.5, hard: 3.5 };

/**
 * Wiki: the parched fires "more slowly" than a skeleton -- every 4.5 s on Easy and Normal and every 3.5 s
 * on Hard, in Java.
 */
export const PARCHED_ATTACK_COOLDOWN = { normal: 4.5, hard: 3.5 };

/** Wiki: parched shoot Arrow of Weakness, giving Weakness for 30 seconds. */
export const PARCHED_WEAKNESS_SECONDS = 30;

/**
 * Wiki: "Parched are also immune to the Weakness effect, although this typically makes no effective
 * difference since parched attack using projectiles." Recorded because it is a real immunity.
 */
export const PARCHED_WEAKNESS_IMMUNE = true;

/**
 * Wiki: like the bogged, "parched take freezing damage and do not convert into strays", and "unlike
 * husks converting into zombies, parched do not turn into skeletons when submerged in water for too
 * long". So the parched has NO conversion path, which is a deliberate absence rather than an omission.
 */
export const PARCHED_CONVERSIONS = { toStray: false, toSkeleton: false };

/**
 * Wiki: "Some parched spawn with the ability to pick up dropped items from the ground. Unlike zombies,
 * however, they pick up only weapons, shields, and armor." It prefers more damaging weapons "without
 * considering enchantments", then NBT-bearing ones, then less damaged ones, and prefers bows.
 *
 * It never picks up spears.
 */
export const PARCHED_PICKUP = {
  kinds: ['weapon', 'shield', 'armor'],
  alwaysIgnored: ['spear'],
  prefersBowOverOtherWeapons: true
};

/** Wiki: a parched equipped with a picked-up item "becomes persistent and does not despawn". */
export const PARCHED_EQUIPPED_IS_PERSISTENT = true;

/** Wiki: shearing a bogged drops 2 mushrooms, each independently red or brown, once only. */
export const BOGGED_SHEAR_DROPS = { count: 2, types: ['red_mushroom', 'brown_mushroom'] };

/** Wiki: all three are undead, so they share these traits. */
export const VARIANT_UNDEAD_TRAITS = {
  undead: true,
  poisonImmune: true,
  invertedHealing: true,
  canBreatheUnderwater: true,
  sensitiveToSmite: true
};

/**
 * Which variant carries which signature effect.
 *
 * The wiki attaches exactly one status effect to each, and that effect is the reason to have the mob
 * rather than a recoloured zombie, so it is a table rather than three conditionals.
 */
export const VARIANT_ATTACK_EFFECT = {
  husk: { effect: 'hunger', seconds: HUSK_HUNGER_SECONDS },
  stray: { effect: 'slowness', seconds: STRAY_SLOWNESS_SECONDS },
  bogged: { effect: 'poison', seconds: BOGGED_POISON_SECONDS },
  parched: { effect: 'weakness', seconds: PARCHED_WEAKNESS_SECONDS }
};

/** Body colours: husks are sand-dry, strays pale blue, bogged moss-covered, parched sun-bleached. */
export const VARIANT_TINTS = {
  // Wiki: a husk is a desert zombie with dry, sand-coloured skin. The tint is applied MULTIPLICATIVELY to the
  // zombie's green skin, so a merely khaki tone left the mob looking like an ordinary zombie -- the green
  // survives the multiply. This is the value that lands the result on sand: it has to be warmer and lighter than
  // the target colour, because the base it multiplies is dark and green.
  husk: 0xdcc79a,
  stray: 0xa8c4d4,
  bogged: 0x7c8f5a,
  parched: 0xd6c9a8
};

/** True for any of the three variants. */
export function isUndeadVariant(mob) {
  return !!mob && Object.hasOwn(VARIANT_HEALTH, mob.type);
}

/** The health for a type, or null. */
export function variantHealth(type) {
  return Object.hasOwn(VARIANT_HEALTH, type ?? '') ? VARIANT_HEALTH[type] : null;
}

/** The hitbox for a type, with the husk's baby special case. */
export function variantDimensions(type, isBaby = false) {
  if (type === 'husk' && isBaby) return { ...HUSK_BABY_DIMENSIONS };
  return VARIANT_DIMENSIONS[type] ? { ...VARIANT_DIMENSIONS[type] } : null;
}

/**
 * The undead variants that do NOT burn in sunlight.
 *
 * Wiki: the husk is "one of the few undead mobs that are immune to burning in sunlight", and the parched
 * "do not burn in sunlight" either. The stray and bogged both carry `burn_in_daylight`.
 *
 * A list rather than a single negative, because the function was first written when only the husk was
 * exempt and had to be corrected the moment a second immune variant existed.
 */
export const VARIANT_SUN_IMMUNE = ['husk', 'parched'];

/**
 * Whether this variant burns in sunlight.
 *
 * So this is a real behavioural difference, not cosmetic.
 */
export function variantBurnsInDaylight(type) {
  if (!Object.hasOwn(VARIANT_HEALTH, type ?? '')) return false;
  return !VARIANT_SUN_IMMUNE.includes(type);
}

/** Wiki: a husk avoids water, and a stray or bogged does not. */
export function variantAvoidsWater(type) {
  return type === 'husk';
}

/**
 * The status effect this variant's attack applies.
 *
 * Wiki: a husk applies Hunger only when its main hand is empty; a stray's slowness and a bogged's poison
 * come from the arrow itself, so they apply regardless.
 */
export function variantAttackEffect(type, { unarmed = true } = {}) {
  const entry = VARIANT_ATTACK_EFFECT[type];
  if (!entry) return null;
  if (type === 'husk' && !unarmed) return null;
  return { effect: entry.effect, seconds: typeof entry.seconds === 'number' ? entry.seconds : entry.seconds.min };
}

/**
 * How long a husk has to stay submerged before it converts.
 *
 * Wiki: "A husk that is fully submerged in water for 30 seconds begins converting to a normal zombie,
 * which takes an additional 15 seconds and cannot be stopped."
 *
 * Returns 'counting', 'converting', 'converted' or null.
 */
export function updateHuskDrowning(mob, dt, { submerged = false, manager = null } = {}) {
  if (mob?.type !== 'husk') return null;

  // An active conversion is checked FIRST, before the submerged test. The wiki is explicit that it
  // "cannot be stopped even if the husk leaves water", so leaving the water must not skip the timer --
  // an earlier version returned early here and a husk that surfaced mid-conversion was never converted.
  if ((mob.convertTimer ?? 0) > 0) {
    mob.convertTimer -= dt;
    if (mob.convertTimer <= 0) {
      // The replacement zombie has FULL health even if the husk was damaged.
      manager?.replaceMobType?.(mob, 'zombie');
      return 'converted';
    }
    return 'converting';
  }

  if (!submerged) {
    // Out of water the countdown to *beginning* conversion resets, which the wiki also states.
    mob.submergedSeconds = 0;
    return null;
  }

  mob.submergedSeconds = (mob.submergedSeconds ?? 0) + dt;
  if (mob.submergedSeconds >= HUSK_DROWNING.submergedSeconds) {
    mob.submergedSeconds = HUSK_DROWNING.submergedSeconds;
    mob.convertTimer = HUSK_DROWNING.convertSeconds;
    return 'converting';
  }
  return 'counting';
}

/** The bogged's attack cooldown at a difficulty, which the wiki gives explicitly. */
export function boggedAttackCooldown(difficulty) {
  return difficulty === 'hard' ? BOGGED_ATTACK_COOLDOWN.hard : BOGGED_ATTACK_COOLDOWN.normal;
}

/**
 * Shear the mushrooms off a bogged.
 *
 * Wiki: "A bogged drops 2 mushrooms when sheared. Each individual mushroom has an equal chance of
 * dropping as either a brown or red mushroom. Afterward, it cannot be sheared again."
 */
export function shearBogged(mob, itemId, random = Math.random) {
  if (mob?.type !== 'bogged' || mob.health <= 0) return [];
  if (String(itemId ?? '').toLowerCase() !== 'shears') return [];
  if (mob.isSheared) return [];
  mob.isSheared = true;
  const drops = [];
  for (let i = 0; i < BOGGED_SHEAR_DROPS.count; i++) {
    drops.push(BOGGED_SHEAR_DROPS.types[random() < 0.5 ? 0 : 1]);
  }
  return drops;
}

/**
 * Death loot, which is the base mob's loot plus the variant's tipped arrow.
 *
 * Wiki: bones and arrows as usual, plus 0-1 arrow of Slowness for a stray (only with player credit) or
 * 0-1 arrow of Poison for a bogged.
 */
export function variantBonusDrops(mob, random = Math.random) {
  const rows = [];
  if (!isUndeadVariant(mob)) return rows;
  const credited = mob.playerDamaged || mob.wolfKilled;
  if (!credited) return rows;
  if (mob.type === 'stray' && random() < 0.5) rows.push(['tipped_arrow_slowness', false, 1, 1]);
  if (mob.type === 'bogged' && random() < 0.5) rows.push(['tipped_arrow_poison', false, 1, 1]);
  if (mob.type === 'parched' && random() < 0.5) rows.push(['tipped_arrow_weakness', false, 1, 1]);
  return rows;
}

/** Wiki: all three give 5 XP with credit. */
export function variantXp(mob) {
  if (!isUndeadVariant(mob)) return 0;
  return 5;
}

/** The husk's fractional melee damage, which no other mob here has. */
export function huskDamageFor(difficulty) {
  const key = Object.hasOwn(HUSK_DAMAGE, difficulty ?? '') ? difficulty : 'normal';
  return HUSK_DAMAGE[key];
}

/** The tint a variant's materials should carry. */
export function variantTint(type) {
  return Object.hasOwn(VARIANT_TINTS, type ?? '') ? VARIANT_TINTS[type] : null;
}

/**
 * The two-marker descriptor for a variant, used by telemetry and tests so the three mobs can be asserted
 * as a group without repeating every field three times.
 */
export function variantProfile(type) {
  if (!isUndeadVariant({ type })) return null;
  return {
    health: VARIANT_HEALTH[type],
    dimensions: VARIANT_DIMENSIONS[type],
    burnsInDaylight: variantBurnsInDaylight(type),
    avoidsWater: variantAvoidsWater(type),
    attackEffect: VARIANT_ATTACK_EFFECT[type]?.effect ?? null,
    armedWithBow: type !== 'husk',
    tint: VARIANT_TINTS[type],
    undead: true
  };
}
