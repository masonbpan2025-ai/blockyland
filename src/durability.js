// Tool durability, and unbreaking's effect on it.
//
// This did not exist. Mining a block never wore the tool, and the only item in the registry carrying a
// `durability` value was the brush -- so a diamond pickaxe was permanent, which removes one of the
// central pressures of survival mode. Unbreaking could not be wired because the thing it modifies was
// absent, which is why it sat on the outstanding list for three rounds.
//
// The maxima below are vanilla's. They are stated as a table rather than derived from the item name alone
// because several tools have no material prefix to parse and several materials have no tool of a given
// kind, so a name-derived lookup would silently return nothing for exactly the items most likely to be
// overlooked.

/** Durability by tool material, from vanilla. */
export const MATERIAL_DURABILITY = {
  wooden: 59,
  golden: 32,
  stone: 131,
  iron: 250,
  diamond: 1561,
  netherite: 2031,
};

/** Tools and wearables whose durability does not follow the material table. */
export const FIXED_DURABILITY = {
  shears: 238,
  flint_and_steel: 64,
  fishing_rod: 64,
  carrot_on_a_stick: 25,
  warped_fungus_on_a_stick: 100,
  bow: 384,
  crossbow: 465,
  shield: 336,
  trident: 250,
  elytra: 432,
  brush: 64,
  turtle_helmet: 275,
  // Armour, which the material table does not cover because the multipliers differ from tools.
  leather_helmet: 55, leather_chestplate: 80, leather_leggings: 75, leather_boots: 65,
  chainmail_helmet: 165, chainmail_chestplate: 240, chainmail_leggings: 225, chainmail_boots: 195,
  iron_helmet: 165, iron_chestplate: 240, iron_leggings: 225, iron_boots: 195,
  golden_helmet: 77, golden_chestplate: 112, golden_leggings: 105, golden_boots: 91,
  diamond_helmet: 363, diamond_chestplate: 528, diamond_leggings: 495, diamond_boots: 429,
  netherite_helmet: 407, netherite_chestplate: 592, netherite_leggings: 555, netherite_boots: 481,
  turtle_helmet_armor: 275,
};

/** The kinds of tool that take their durability from the material they are made of. */
const MATERIAL_KINDS = ['pickaxe', 'axe', 'shovel', 'hoe', 'sword'];

/**
 * The maximum durability of an item, or null when it does not wear out.
 *
 * @param {string} itemId
 * @returns {number|null}
 */
export function maxDurabilityFor(itemId) {
  if (typeof itemId !== 'string' || itemId.length === 0) return null;
  if (Object.prototype.hasOwnProperty.call(FIXED_DURABILITY, itemId)) return FIXED_DURABILITY[itemId];
  const m = /^([a-z]+)_([a-z_]+)$/.exec(itemId);
  if (m) {
    const [, material, kind] = m;
    if (MATERIAL_KINDS.includes(kind) && MATERIAL_DURABILITY[material] !== undefined) {
      return MATERIAL_DURABILITY[material];
    }
  }
  return null;
}

/** Does this item wear out at all? */
export function isDurable(itemId) {
  return maxDurabilityFor(itemId) !== null;
}

/**
 * Spend durability on a stack, honouring unbreaking.
 *
 * Vanilla keeps the point with probability `level / (level + 1)`, so an unbreaking III tool lasts about
 * four times as long. The roll is per point spent, which matters for a multi-point action like shearing a
 * stack of sheep.
 *
 * The stack is mutated in place and the outcome returned, rather than the function reaching into an
 * inventory: the caller decides what to do when a tool breaks, because breaking a stack is a UI event.
 *
 * @param {{id?:string, durability?:number, maxDurability?:number, enchantments?:Array}} stack
 * @param {number} [amount] how many points to spend
 * @param {() => number} [random] injectable for deterministic tests
 * @returns {{spent:number, broke:boolean, remaining:number}}
 */
export function spendDurability(stack, amount = 1, random = Math.random) {
  if (!stack || typeof stack !== 'object') return { spent: 0, broke: false, remaining: 0 };
  const id = stack.id;
  const max = typeof stack.maxDurability === 'number' ? stack.maxDurability : maxDurabilityFor(id);
  if (max === null || max === undefined) return { spent: 0, broke: false, remaining: 0 };
  // A stack with no durability recorded is brand new.
  if (typeof stack.durability !== 'number') {
    stack.maxDurability = max;
    stack.durability = max;
  }

  const level = unbreakingLevel(stack.enchantments);
  let spent = 0;
  // A tool already at zero is broken and cannot spend anything. Without this guard the caller has to
  // remember not to use a broken tool, and the outcome reports a point spent on something unusable.
  if (stack.durability <= 0) return { spent: 0, broke: true, remaining: 0 };
  for (let i = 0; i < Math.max(0, Math.floor(amount)); i++) {
    // Unbreaking keeps the point with p = level / (level + 1).
    if (level > 0 && random() < level / (level + 1)) continue;
    spent++;
    stack.durability = Math.max(0, stack.durability - 1);
    if (stack.durability === 0) break;
  }
  return { spent, broke: stack.durability === 0, remaining: stack.durability };
}

/** The highest unbreaking level on a stack, or 0. */
export function unbreakingLevel(enchantments) {
  if (!Array.isArray(enchantments)) return 0;
  let level = 0;
  for (const ench of enchantments) {
    if (ench?.id === 'unbreaking' && typeof ench.level === 'number') level = Math.max(level, ench.level);
  }
  return level;
}

/**
 * The fraction of a tool's life remaining, for a durability bar. Null when the item does not wear.
 *
 * @returns {number|null} 0 to 1
 */
export function durabilityFraction(stack) {
  if (!stack || typeof stack !== 'object') return null;
  const max = typeof stack.maxDurability === 'number' ? stack.maxDurability : maxDurabilityFor(stack.id);
  if (!max) return null;
  const current = typeof stack.durability === 'number' ? stack.durability : max;
  return Math.max(0, Math.min(1, current / max));
}
