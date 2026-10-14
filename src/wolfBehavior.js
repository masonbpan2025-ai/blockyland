/**
 * Wolf rules.
 *
 * Reference: https://minecraft.wiki/w/Wolf
 *
 * The defining stat of a wolf is that taming raises its health: a wild wolf has 8 HP and a
 * tamed one has 40. The tree previously gave every wolf a flat 20, which is neither value
 * and did not change on taming.
 */

/** Wiki: wild wolves have 8 HP. */
export const WOLF_WILD_HEALTH = 8;

/** Wiki: tamed wolves have 40 HP. */
export const WOLF_TAMED_HEALTH = 40;

/** Wiki: adult 0.6 wide x 0.85 tall; baby 0.3 x 0.425 (exactly half). */
export const WOLF_DIMENSIONS = {
  adult: { width: 0.6, height: 0.85 },
  baby: { width: 0.3, height: 0.425 }
};

/** Wiki: each bone has a 1/3 chance of taming a wolf. */
export const WOLF_TAME_CHANCE = 1 / 3;

/** Wiki: the default collar colour is red. */
export const WOLF_DEFAULT_COLLAR = 'red';

/** True when the mob is a wolf. */
export function isWolf(mob) {
  return mob?.type === 'wolf';
}

/**
 * Maximum health for a wolf in the given state.
 *
 * Note this is a property of being tamed, not of the individual wolf: the wiki gives one
 * number for wild wolves and one for tamed wolves.
 */
export function wolfMaxHealth(tamed) {
  return tamed ? WOLF_TAMED_HEALTH : WOLF_WILD_HEALTH;
}

/**
 * Apply the tamed state to a wolf, raising its maximum health in place.
 *
 * The current health is raised by the same amount the maximum grows, so a wild wolf that
 * was at full health is still at full health once tamed rather than appearing badly hurt.
 * A wolf that was already injured keeps its injuries.
 */
export function applyWolfTamed(mob) {
  if (!isWolf(mob)) return null;
  const before = mob.maxHealth ?? WOLF_WILD_HEALTH;
  const after = wolfMaxHealth(true);
  const gained = after - before;
  mob.isTamed = true;
  mob.maxHealth = after;
  mob.health = Math.min(after, (mob.health ?? before) + Math.max(0, gained));
  return mob;
}

// --- wolf armour ------------------------------------------------------------------------------------------------
//
// Wiki, Wolf Armor: "Only adult tamed wolves can wear armor. Using wolf armor on a wolf that the player has tamed
// equips it onto the wolf. Wolf armor absorbs all damage done to the wolf with some exceptions, until its durability
// runs out." The "+11 Armor" in its tooltip "is a result of a bug (MC-268913) and should be ignored". The item existed
// here, craftable from scutes, with nothing to wear it; found by the wiki parity audit's I-ARMOR case.

/** Wolf armour's durability (wiki: 64), one point lost per point of damage absorbed. */
export const WOLF_ARMOR_DURABILITY = 64;

/** "Using an armadillo scute on a wolf wearing wolf armor heals 8 points of the armor's durability." */
export const WOLF_ARMOR_SCUTE_REPAIR = 8;

/** Damage the armour does not absorb: drowning, freezing, suffocation, magic, thorns, wither, the void, cramming. */
export const WOLF_ARMOR_BYPASS = new Set(['drowning', 'drown', 'freeze', 'freezing', 'suffocation', 'magic', 'thorns', 'wither', 'void', 'cramming', 'kill']);

/** Can this player put wolf armour on this wolf? An adult, tamed by them, not already wearing one. */
export function canEquipWolfArmor(mob, player) {
  return isWolf(mob) && mob.isTamed && !mob.isBaby && mob.owner === player && !mob.wolfArmor;
}

/** Put wolf armour on the wolf, at the durability the item carried (full when it carries none). */
export function equipWolfArmor(mob, durability = WOLF_ARMOR_DURABILITY) {
  mob.wolfArmor = 'wolf_armor';
  mob.wolfArmorDurability = Math.max(1, Math.min(WOLF_ARMOR_DURABILITY, durability));
  return mob;
}

/** Take the armour off ("If the owner uses shears on a wolf that is wearing armor, the armor gets unequipped"). */
export function removeWolfArmor(mob) {
  const removed = mob.wolfArmor ? { id: mob.wolfArmor, durability: mob.wolfArmorDurability ?? WOLF_ARMOR_DURABILITY } : null;
  mob.wolfArmor = null;
  mob.wolfArmorDurability = 0;
  return removed;
}

/** An armadillo scute's repair, capped at full durability. Returns false when there is nothing to repair. */
export function repairWolfArmor(mob) {
  if (!mob.wolfArmor || (mob.wolfArmorDurability ?? WOLF_ARMOR_DURABILITY) >= WOLF_ARMOR_DURABILITY) return false;
  mob.wolfArmorDurability = Math.min(WOLF_ARMOR_DURABILITY, (mob.wolfArmorDurability ?? 0) + WOLF_ARMOR_SCUTE_REPAIR);
  return true;
}

/**
 * The damage that reaches the wolf once its armour has taken its share: none while the armour holds ("If the damage
 * of an attack exceeds the remaining durability, all damage is absorbed anyway"), all of it for the damage types
 * the armour does not absorb. The armour breaks -- and comes off -- when its durability runs out.
 *
 * @returns {{damage: number, absorbed: number, broke: boolean}}
 */
export function absorbWithWolfArmor(mob, amount, damageType = null) {
  if (!isWolf(mob) || !mob.wolfArmor || !(amount > 0) || WOLF_ARMOR_BYPASS.has(damageType)) return { damage: amount, absorbed: 0, broke: false };
  const durability = mob.wolfArmorDurability ?? WOLF_ARMOR_DURABILITY;
  mob.wolfArmorDurability = durability - Math.ceil(amount);
  const broke = mob.wolfArmorDurability <= 0;
  if (broke) removeWolfArmor(mob);
  return { damage: 0, absorbed: amount, broke };
}
