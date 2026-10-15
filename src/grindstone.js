import { ITEMS } from './blocks.js';
import { ENCHANTMENT_REGISTRY } from './enchanting.js';

/**
 * Calculates the Grindstone disenchanting and repair output.
 * Reference: https://minecraft.wiki/w/Grindstone
 *
 * Wiki: a grindstone removes "all enchantments, except for curses", and "The amount of experience dropped by the
 * grindstone is a uniformly distributed pseudorandom number between 50% and 100% (rounded up) of all the non-curse
 * enchantments' minimum modified enchantment levels combined. For example, Sharpness V on average gives 35 XP,
 * because that is 75% of 45." The repair is the crafting grid's: the two durabilities plus 5% of the maximum (floor).
 *
 * This used to strip curses too and refund an invented `level * 4 + maxLevel` per enchantment.
 */
const isCurse = (e) => !!ENCHANTMENT_REGISTRY[e?.id]?.curse;
/** The minimum modified enchantment level of `id` at `level` (the bottom of its cost range). */
export function minimumModifiedLevel(id, level = 1) {
  const cost = ENCHANTMENT_REGISTRY[id]?.cost;
  if (!Array.isArray(cost) || !cost.length) return 0;
  return cost[Math.max(0, Math.min(cost.length, level) - 1)]?.[0] ?? 0;
}
/** XP refunded for removing `enchantments`: uniform in [ceil(n/2), n], n the sum of non-curse minimum levels. */
export function grindstoneExperience(enchantments, random = Math.random) {
  const n = (enchantments || []).filter((e) => !isCurse(e)).reduce((sum, e) => sum + minimumModifiedLevel(e.id, e.level || 1), 0);
  if (n <= 0) return 0;
  const lo = Math.ceil(n / 2);
  return lo + Math.floor(random() * (n - lo + 1));
}

export function calculateGrindstoneResult(topItem, bottomItem, random = Math.random) {
  if (!topItem && !bottomItem) {
    return { valid: false, result: null, xpDrop: 0 };
  }

  // Case 1: Two items of the same type (Repair + Disenchant)
  if (topItem && bottomItem && topItem.id === bottomItem.id) {
    const maxDur = topItem.maxDurability || ITEMS[topItem.id]?.durability || 250;
    const dur1 = topItem.durability !== undefined ? topItem.durability : maxDur;
    const dur2 = bottomItem.durability !== undefined ? bottomItem.durability : maxDur;
    const bonusDur = Math.floor(maxDur * 0.05);
    const combinedDur = Math.min(maxDur, dur1 + dur2 + bonusDur);
    const all = [...(topItem.enchantments || []), ...(bottomItem.enchantments || [])];
    const curses = [];
    for (const e of all) if (isCurse(e) && !curses.some((c) => c.id === e.id)) curses.push({ ...e });

    const result = {
      ...topItem,
      durability: combinedDur,
      enchantments: curses,
      repairCost: 0 // resets prior work penalty
    };

    return {
      valid: true,
      result,
      xpDrop: grindstoneExperience(all, random),
      consumedBoth: true
    };
  }

  // Case 2: Single item (Disenchant only)
  const singleItem = topItem || bottomItem;
  if (singleItem) {
    const removable = (singleItem.enchantments || []).filter((e) => !isCurse(e));
    if (!removable.length) {
      return { valid: false, result: null, xpDrop: 0 };
    }
    // An enchanted book becomes a plain book (wiki), keeping any curse it carried.
    const book = singleItem.id === 'enchanted_book';
    const curses = (singleItem.enchantments || []).filter(isCurse);
    const result = {
      ...singleItem,
      ...(book && !curses.length ? { id: 'book' } : {}),
      enchantments: curses,
      repairCost: 0 // resets prior work penalty
    };

    return {
      valid: true,
      result,
      xpDrop: grindstoneExperience(singleItem.enchantments, random),
      consumedBoth: false
    };
  }

  return { valid: false, result: null, xpDrop: 0 };
}
