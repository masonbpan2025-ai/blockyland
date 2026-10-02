import { ITEMS } from './blocks.js';
import { ENCHANTMENT_REGISTRY } from './enchanting.js';

/**
 * Calculates the Grindstone disenchanting and repair output
 * Reference: https://minecraft.wiki/w/Grindstone
 */
export function calculateGrindstoneResult(topItem, bottomItem) {
  if (!topItem && !bottomItem) {
    return { valid: false, result: null, xpDrop: 0 };
  }

  // Case 1: Two items of the same type (Repair + Disenchant)
  if (topItem && bottomItem && topItem.id === bottomItem.id) {
    const maxDur = topItem.maxDurability || 250;
    const dur1 = topItem.durability !== undefined ? topItem.durability : maxDur;
    const dur2 = bottomItem.durability !== undefined ? bottomItem.durability : maxDur;
    const bonusDur = Math.floor(maxDur * 0.05);
    const combinedDur = Math.min(maxDur, dur1 + dur2 + bonusDur);

    // Calculate XP refund from all enchantments on both items
    let xpDrop = 0;
    const allEnchantments = [
      ...(topItem.enchantments || []),
      ...(bottomItem.enchantments || [])
    ];

    for (const ench of allEnchantments) {
      const enchDef = ENCHANTMENT_REGISTRY[ench.id];
      const lvl = ench.level || 1;
      // Minecraft canonical XP formula for disenchanting: roughly sum of enchantment levels * 3 to 10 XP
      xpDrop += Math.max(1, lvl * 4 + (enchDef?.maxLevel || 3));
    }

    const result = {
      ...topItem,
      durability: combinedDur,
      enchantments: [], // all stripped
      repairCost: 0 // resets prior work penalty
    };

    return {
      valid: true,
      result,
      xpDrop,
      consumedBoth: true
    };
  }

  // Case 2: Single item (Disenchant only)
  const singleItem = topItem || bottomItem;
  if (singleItem) {
    const hasEnchantments = singleItem.enchantments && singleItem.enchantments.length > 0;
    if (!hasEnchantments) {
      return { valid: false, result: null, xpDrop: 0 };
    }

    let xpDrop = 0;
    for (const ench of singleItem.enchantments) {
      const enchDef = ENCHANTMENT_REGISTRY[ench.id];
      const lvl = ench.level || 1;
      xpDrop += Math.max(1, lvl * 4 + (enchDef?.maxLevel || 3));
    }

    const result = {
      ...singleItem,
      enchantments: [], // stripped
      repairCost: 0 // resets prior work penalty
    };

    return {
      valid: true,
      result,
      xpDrop,
      consumedBoth: false
    };
  }

  return { valid: false, result: null, xpDrop: 0 };
}
