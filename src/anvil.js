import { ITEMS, BLOCKS } from './blocks.js';
import { ENCHANTMENT_REGISTRY, isPrimaryFor, areIncompatible } from './enchanting.js';

// Material repair mapping (e.g. iron items can be repaired with iron_ingot)
export const REPAIR_MATERIALS = {
  iron_sword: 'iron_ingot',
  iron_pickaxe: 'iron_ingot',
  iron_axe: 'iron_ingot',
  iron_shovel: 'iron_ingot',
  iron_helmet: 'iron_ingot',
  iron_chestplate: 'iron_ingot',
  iron_leggings: 'iron_ingot',
  iron_boots: 'iron_ingot',

  diamond_sword: 'diamond',
  diamond_pickaxe: 'diamond',
  diamond_axe: 'diamond',
  diamond_shovel: 'diamond',
  diamond_helmet: 'diamond',
  diamond_chestplate: 'diamond',
  diamond_leggings: 'diamond',
  diamond_boots: 'diamond',

  golden_sword: 'gold_ingot',
  golden_pickaxe: 'gold_ingot',
  golden_axe: 'gold_ingot',
  golden_shovel: 'gold_ingot',
  golden_helmet: 'gold_ingot',
  golden_chestplate: 'gold_ingot',
  golden_leggings: 'gold_ingot',
  golden_boots: 'gold_ingot',

  netherite_sword: 'netherite_ingot',
  netherite_pickaxe: 'netherite_ingot',
  netherite_axe: 'netherite_ingot',
  netherite_shovel: 'netherite_ingot',
  netherite_helmet: 'netherite_ingot',
  netherite_chestplate: 'netherite_ingot',
  netherite_leggings: 'netherite_ingot',
  netherite_boots: 'netherite_ingot'
};

// Incompatible enchantment pairs. The list itself lives with the enchantments, in `enchanting.js`: this
// was a second copy of it, and the two had already drifted -- the pair list here and the registry's own
// `incompatible` fields are now the same data read through `areIncompatible`.
export const INCOMPATIBLE_ENCHANTMENTS = Object.entries(ENCHANTMENT_REGISTRY)
  .flatMap(([key, def]) => (def.incompatible ?? []).map((other) => [key, other]))
  .filter(([a, b]) => a < b || !ENCHANTMENT_REGISTRY[b]?.incompatible?.includes(a));

/**
 * Calculates the Anvil combination / rename result and level cost
 * Reference: https://minecraft.wiki/w/Anvil_mechanics
 */
export function calculateAnvilResult(leftItem, rightItem, customName = '', playerGamemode = 'survival') {
  if (!leftItem) {
    return { valid: false, result: null, levelCost: 0, tooExpensive: false };
  }

  // Clone left item as base result
  const result = {
    ...leftItem,
    enchantments: leftItem.enchantments ? leftItem.enchantments.map(e => ({ ...e })) : []
  };

  let levelCost = 0;
  let materialUnitsConsumed = 0;
  let actionTaken = false;

  // 1. Prior Work Penalty
  const leftPenalty = leftItem.repairCost || 0;
  const rightPenalty = rightItem ? (rightItem.repairCost || 0) : 0;
  levelCost += leftPenalty + rightPenalty;

  // 2. Renaming
  const originalName = leftItem.customName || ITEMS[leftItem.id]?.name || leftItem.id;
  const isRenaming = customName && customName.trim() !== '' && customName.trim() !== originalName;

  if (isRenaming) {
    result.customName = customName.trim();
    levelCost += 1;
    actionTaken = true;
  } else if (leftItem.customName && (!customName || customName.trim() === '')) {
    // Retain existing custom name if not cleared
    result.customName = leftItem.customName;
  }

  // 3. Combining with Right Item (Repair / Enchant)
  if (rightItem) {
    const maxDur = leftItem.maxDurability || 250;
    const currentDur = leftItem.durability !== undefined ? leftItem.durability : maxDur;

    // A. Material Unit Repair (e.g. Diamond Sword + Diamond)
    if (REPAIR_MATERIALS[leftItem.id] === rightItem.id) {
      if (currentDur < maxDur) {
        const repairPerUnit = Math.floor(maxDur * 0.25);
        const neededDur = maxDur - currentDur;
        const maxUnits = Math.min(rightItem.count || 1, Math.ceil(neededDur / repairPerUnit), 4);

        if (maxUnits > 0) {
          result.durability = Math.min(maxDur, currentDur + maxUnits * repairPerUnit);
          levelCost += maxUnits;
          materialUnitsConsumed = maxUnits;
          actionTaken = true;
        }
      }
    }
    // B. Item Combination (e.g. Diamond Pickaxe + Damaged Diamond Pickaxe)
    else if (leftItem.id === rightItem.id) {
      const rightDur = rightItem.durability !== undefined ? rightItem.durability : (rightItem.maxDurability || 250);
      const bonusDur = Math.floor(maxDur * 0.12);
      const combinedDur = Math.min(maxDur, currentDur + rightDur + bonusDur);

      if (combinedDur > currentDur) {
        result.durability = combinedDur;
        levelCost += 2;
        actionTaken = true;
      }
      materialUnitsConsumed = 1;
    }

    // C. Enchantment Merging (from another item or an Enchanted Book)
    const isEnchantedBook = rightItem.id === 'enchanted_book';

    if (rightItem.enchantments && rightItem.enchantments.length > 0) {
      for (const rightEnch of rightItem.enchantments) {
        const enchDef = ENCHANTMENT_REGISTRY[rightEnch.id];
        if (!enchDef) continue;

        // Verify the left item is a primary item for the enchantment. An enchanted book is primary for
        // everything, which vanilla hardcodes. This asked `getItemEnchantCategory` before and compared its
        // coarse answer against the registry's own tokens, so an enchanted Protection book no longer
        // matched a chestplate at all -- the registry names armour pieces individually.
        const compatible = leftItem.id === 'enchanted_book' || isPrimaryFor(enchDef, leftItem.id);
        if (!compatible) {
          continue;
        }

        // Check mutual exclusivity with existing enchantments
        const isConflict = result.enchantments.some(existing => areIncompatible(existing.id, rightEnch.id));

        if (isConflict) continue;

        const existingEnch = result.enchantments.find(e => e.id === rightEnch.id);
        if (existingEnch) {
          if (existingEnch.level < rightEnch.level) {
            existingEnch.level = rightEnch.level;
            levelCost += rightEnch.level;
            actionTaken = true;
          } else if (existingEnch.level === rightEnch.level && existingEnch.level < enchDef.maxLevel) {
            existingEnch.level += 1;
            levelCost += existingEnch.level;
            actionTaken = true;
          }
        } else {
          result.enchantments.push({ id: rightEnch.id, level: rightEnch.level });
          levelCost += rightEnch.level;
          actionTaken = true;
        }
      }
      if (isEnchantedBook) {
        materialUnitsConsumed = 1;
      }
    }
  }

  if (!actionTaken) {
    return { valid: false, result: null, levelCost: 0, tooExpensive: false };
  }

  // Update cumulative Prior Work Penalty: 2 * previous + 1
  result.repairCost = leftPenalty * 2 + 1;

  // "Too Expensive!" check: cost >= 40 in Survival
  const tooExpensive = playerGamemode !== 'creative' && levelCost >= 40;

  return {
    valid: !tooExpensive,
    result,
    levelCost,
    tooExpensive,
    materialUnitsConsumed
  };
}

/**
 * Anvil wear degradation on use (12% chance to degrade)
 */
export function getAnvilDegradation(currentBlockId, forceDegrade = null) {
  const degradeRoll = forceDegrade !== null ? forceDegrade : (Math.random() < 0.12);
  if (!degradeRoll) return currentBlockId;

  if (currentBlockId === BLOCKS.ANVIL) {
    return BLOCKS.CHIPPED_ANVIL;
  }
  if (currentBlockId === BLOCKS.CHIPPED_ANVIL) {
    return BLOCKS.DAMAGED_ANVIL;
  }
  if (currentBlockId === BLOCKS.DAMAGED_ANVIL) {
    return BLOCKS.AIR; // Anvil breaks!
  }

  return currentBlockId;
}
