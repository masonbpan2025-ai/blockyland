import { BLOCKS, ITEMS } from './blocks.js';
import { consumePlayerLevels } from './experience.js';

// Standard Galactic Alphabet / Enchantment Runes
export const GALACTIC_RUNES = [
  'ᔑ', 'ʖ', 'ᓵ', '↸', 'ᒷ', '⎓', '⊣', '⍑', '╎', '⋮',
  'ꖌ', 'ꖎ', 'ᒲ', 'リ', '𝙹', '¡', 'ᑑ', '∷', 'ᓭ', 'ℸ',
  '⚍', '⍊', 'ᑑ', '̇/', '||', '⨅'
];

export const ENCHANTMENT_REGISTRY = {
  soul_speed: { name: 'Soul Speed', maxLevel: 3, targets: ['boots'], roman: ['I', 'II', 'III'], minBaseLvl: [10, 20, 30], treasure: true, desc: 'Move faster on soul sand and soul soil.' },
  // Weapon enchantments
  sharpness: {
    name: 'Sharpness',
    maxLevel: 5,
    targets: ['weapon'],
    roman: ['I', 'II', 'III', 'IV', 'V'],
    minBaseLvl: [1, 12, 23, 34, 45],
    desc: 'Increases melee damage dealt to all entities.'
  },
  smite: {
    name: 'Smite',
    maxLevel: 5,
    targets: ['weapon'],
    roman: ['I', 'II', 'III', 'IV', 'V'],
    minBaseLvl: [5, 13, 21, 29, 37],
    desc: 'Increases attack damage dealt to undead mobs.'
  },
  knockback: {
    name: 'Knockback',
    maxLevel: 2,
    targets: ['weapon'],
    roman: ['I', 'II'],
    minBaseLvl: [5, 25],
    desc: 'Increases knockback dealt when attacking.'
  },
  fire_aspect: {
    name: 'Fire Aspect',
    maxLevel: 2,
    targets: ['weapon'],
    roman: ['I', 'II'],
    minBaseLvl: [10, 30],
    desc: 'Ignites attacked mobs in fire.'
  },
  looting: {
    name: 'Looting',
    maxLevel: 3,
    targets: ['weapon'],
    roman: ['I', 'II', 'III'],
    minBaseLvl: [15, 24, 33],
    desc: 'Increases mob item and rare drop quantities.'
  },

  // Tool enchantments
  efficiency: {
    name: 'Efficiency',
    maxLevel: 5,
    // Shears mine leaves, wool and cobwebs, and vanilla offers them Efficiency; they are the one tool with
    // its own category that takes it.
    targets: ['tool', 'shears'],
    roman: ['I', 'II', 'III', 'IV', 'V'],
    minBaseLvl: [1, 11, 21, 31, 41],
    desc: 'Significantly increases block mining and digging speed.'
  },
  fortune: {
    name: 'Fortune',
    maxLevel: 3,
    targets: ['tool'],
    roman: ['I', 'II', 'III'],
    minBaseLvl: [15, 24, 33],
    desc: 'Increases drops from mined ores and crops.'
  },
  silk_touch: {
    name: 'Silk Touch',
    maxLevel: 1,
    targets: ['tool'],
    roman: ['I'],
    minBaseLvl: [15],
    desc: 'Mined blocks drop themselves instead of items.'
  },

  // Armor enchantments
  protection: {
    name: 'Protection',
    maxLevel: 4,
    targets: ['armor', 'helmet', 'chestplate', 'leggings', 'boots'],
    roman: ['I', 'II', 'III', 'IV'],
    minBaseLvl: [1, 12, 23, 34],
    desc: 'Reduces damage taken from almost all sources.'
  },
  fire_protection: {
    name: 'Fire Protection',
    maxLevel: 4,
    targets: ['armor', 'helmet', 'chestplate', 'leggings', 'boots'],
    roman: ['I', 'II', 'III', 'IV'],
    minBaseLvl: [10, 18, 26, 34],
    desc: 'Reduces fire, lava, and blaze damage.'
  },
  feather_falling: {
    name: 'Feather Falling',
    maxLevel: 4,
    targets: ['boots'],
    roman: ['I', 'II', 'III', 'IV'],
    minBaseLvl: [5, 11, 17, 23],
    desc: 'Dramatically reduces fall damage.'
  },
  thorns: {
    name: 'Thorns',
    maxLevel: 3,
    targets: ['armor', 'chestplate'],
    roman: ['I', 'II', 'III'],
    minBaseLvl: [10, 30, 50],
    desc: 'Reflects damage back at attacking enemies.'
  },

  // Bow enchantments
  power: {
    name: 'Power',
    maxLevel: 5,
    targets: ['bow'],
    roman: ['I', 'II', 'III', 'IV', 'V'],
    minBaseLvl: [1, 11, 21, 31, 41],
    desc: 'Increases arrow damage.'
  },
  flame: {
    name: 'Flame',
    maxLevel: 1,
    targets: ['bow'],
    roman: ['I'],
    minBaseLvl: [20],
    desc: 'Shoots flaming arrows.'
  },
  punch: {
    name: 'Punch',
    maxLevel: 2,
    targets: ['bow'],
    roman: ['I', 'II'],
    minBaseLvl: [12, 32],
    desc: 'Knocks back hit enemies.'
  },
  infinity: {
    name: 'Infinity',
    maxLevel: 1,
    targets: ['bow'],
    roman: ['I'],
    minBaseLvl: [20],
    desc: 'Firing does not consume regular arrows.'
  },

  // General enchantments
  unbreaking: {
    name: 'Unbreaking',
    maxLevel: 3,
    targets: ['all', 'weapon', 'tool', 'armor', 'bow', 'boots', 'helmet', 'chestplate', 'leggings'],
    roman: ['I', 'II', 'III'],
    minBaseLvl: [5, 13, 21],
    desc: 'Greatly increases item durability and resilience.'
  }
};

/**
 * Items vanilla allows at an enchanting table that the name rules above cannot see.
 *
 * Each gets its **own** category rather than being folded into `tool` or `weapon`, because the category is
 * what picks the enchantments offered: calling a brush a `tool` would offer it Efficiency, which vanilla
 * does not give a brush, and calling a trident a `weapon` would offer it Sharpness, which vanilla does not
 * give a trident either. Unbreaking already targets `all`, so every one of these is offered it, which is
 * correct for all of them.
 *
 * They were all refused by the enchanting table before this: the suffix rules cover swords, axes, the four
 * mining tools and armour, and nothing else, so a trident, a shield, shears, a fishing rod, a brush and both
 * "on a stick" items read as unenchantable while vanilla enchants every one of them.
 */
const EXTRA_ENCHANTABLE = {
  trident: 'trident',
  shield: 'shield',
  shears: 'shears',
  fishing_rod: 'fishing_rod',
  brush: 'brush',
  carrot_on_a_stick: 'carrot_on_a_stick',
  warped_fungus_on_a_stick: 'warped_fungus_on_a_stick',
  // This project's own weapon. It takes the weapon pool because that is what it is.
  golden_spear: 'weapon',
};

/**
 * Items vanilla refuses to enchant, however this game's `type` field happens to classify them.
 *
 * Named rather than inferred: this game types a bucket, a clock, a compass, a name tag and a saddle as
 * `tool`, which is a reasonable classification for "something you hold" and the wrong answer to "can an
 * enchanting table take it". Horse armour is here for the same reason.
 */
export const NOT_ENCHANTABLE = new Set([
  'bucket', 'water_bucket', 'lava_bucket',
  // And the mob buckets, for the same reason: vanilla enchants none of them.
  'cod_bucket', 'salmon_bucket', 'pufferfish_bucket', 'tropical_fish_bucket', 'axolotl_bucket', 'tadpole_bucket',
  'compass', 'clock', 'lead', 'name_tag', 'saddle', 'flint_and_steel',
  'leather_horse_armor', 'iron_horse_armor', 'golden_horse_armor', 'diamond_horse_armor',
]);

/**
 * Returns item category for enchanting eligibility.
 */
export function getItemEnchantCategory(itemId) {
  if (!itemId || typeof itemId !== 'string') return null;
  if (NOT_ENCHANTABLE.has(itemId)) return null;

  if (itemId.endsWith('_sword')) return 'weapon';
  if (itemId.endsWith('_axe')) return 'weapon'; // Axes are weapons and tools in modern Minecraft
  if (itemId.endsWith('_pickaxe') || itemId.endsWith('_shovel') || itemId.endsWith('_hoe')) return 'tool';
  if (itemId.endsWith('_helmet')) return 'helmet';
  if (itemId.endsWith('_chestplate')) return 'chestplate';
  if (itemId.endsWith('_leggings')) return 'leggings';
  if (itemId.endsWith('_boots')) return 'boots';
  if (itemId === 'bow' || itemId === 'crossbow') return 'bow';
  if (EXTRA_ENCHANTABLE[itemId]) return EXTRA_ENCHANTABLE[itemId];
  if (itemId === 'book') return 'book';

  return null;
}

export function isEnchantableItem(item) {
  if (!item) return false;
  // If already enchanted, standard enchanting table cannot re-enchant
  if (Array.isArray(item.enchantments) && item.enchantments.length > 0) return false;
  return getItemEnchantCategory(item.id) !== null;
}

/**
 * Counts bookshelves surrounding an enchanting table according to Minecraft mechanics.
 * Must be within 2 blocks horizontally in a 5x5 area with 1 block of air between bookshelf & table,
 * at height dy in [0, 1].
 */
export function calculateBookshelfCount(world, tableX, tableY, tableZ) {
  if (!world) return 0;
  let count = 0;

  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      // Must be on perimeter (distance 2) or corners
      if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) continue;

      for (let dy = 0; dy <= 1; dy++) {
        const bx = tableX + dx;
        const by = tableY + dy;
        const bz = tableZ + dz;

        if (world.getVoxel(bx, by, bz) === BLOCKS.BOOKSHELF) {
          // Check unobstructed air space between table and bookshelf
          const airX = tableX + Math.sign(dx) * (Math.abs(dx) === 2 ? 1 : 0);
          const airZ = tableZ + Math.sign(dz) * (Math.abs(dz) === 2 ? 1 : 0);
          const airBlock = world.getVoxel(airX, by, airZ);

          if (airBlock === BLOCKS.AIR) {
            count++;
          }
        }
      }
    }
  }

  return Math.min(15, count);
}

/**
 * Generates random rune string from the Standard Galactic Alphabet.
 */
export function generateRunes(length = 8) {
  let str = '';
  for (let i = 0; i < length; i++) {
    const rune = GALACTIC_RUNES[Math.floor(Math.random() * GALACTIC_RUNES.length)];
    str += (i > 0 ? ' ' : '') + rune;
  }
  return str;
}

/**
 * Generates 3 enchantment options for the given item and bookshelf count.
 * Matches vanilla Minecraft 1.8+ slot level rules:
 * - Slot 1: Cost 1 Lvl + 1 Lapis. Req level roughly ~1/3 of max.
 * - Slot 2: Cost 2 Lvl + 2 Lapis. Req level roughly ~2/3 of max.
 * - Slot 3: Cost 3 Lvl + 3 Lapis. Req level up to 30 with 15 bookshelves.
 */
export function generateEnchantmentOffers(item, bookshelfCount) {
  if (!item || !isEnchantableItem(item)) return [];

  const category = getItemEnchantCategory(item.id);
  const eligible = [];

  for (const [key, def] of Object.entries(ENCHANTMENT_REGISTRY)) {
    if (def.treasure) continue;
    if (category === 'book' || def.targets.includes('all') || def.targets.includes(category) || (category.startsWith('weapon') && def.targets.includes('weapon')) || (['helmet', 'chestplate', 'leggings', 'boots'].includes(category) && def.targets.includes('armor'))) {
      eligible.push({ key, ...def });
    }
  }

  if (eligible.length === 0) return [];

  // Minecraft level scaling formula:
  // Base b = random(1..8) + floor(bookshelf / 2) + random(0..bookshelf)
  const b = Math.floor(1 + Math.random() * 8 + Math.floor(bookshelfCount / 2) + Math.random() * (bookshelfCount + 1));
  const maxReq = Math.min(30, Math.max(bookshelfCount * 2, b));

  const slot1Req = Math.max(1, Math.floor(maxReq / 3));
  const slot2Req = Math.max(2, Math.floor((maxReq * 2) / 3));
  const slot3Req = Math.min(30, Math.max(slot2Req + 1, bookshelfCount === 15 ? 30 : maxReq));

  const costs = [
    { slot: 0, levelReq: slot1Req, levelCost: 1, lapisCost: 1 },
    { slot: 1, levelReq: slot2Req, levelCost: 2, lapisCost: 2 },
    { slot: 2, levelReq: slot3Req, levelCost: 3, lapisCost: 3 }
  ];

  return costs.map(c => {
    // Pick suitable enchantment from eligible list
    const candidate = eligible[Math.floor(Math.random() * eligible.length)];
    // Determine level based on slot
    let enchLevel = 1;
    if (candidate.maxLevel > 1) {
      if (c.slot === 0) enchLevel = 1;
      else if (c.slot === 1) enchLevel = Math.min(candidate.maxLevel, 1 + Math.floor(Math.random() * 2));
      else {
        // Slot 3 can reach highest tiers
        enchLevel = Math.min(candidate.maxLevel, Math.max(2, Math.floor((c.levelReq / 30) * candidate.maxLevel)));
      }
    }

    const romanNumeral = candidate.roman[enchLevel - 1] || `${enchLevel}`;
    const primaryName = `${candidate.name} ${romanNumeral}`;

    // Additional secondary enchantments for high-level slot 3
    const additional = [];
    if (c.slot === 2 && c.levelReq >= 20 && Math.random() < 0.6) {
      const secondary = eligible.find(e => e.key !== candidate.key);
      if (secondary) {
        const secLevel = Math.min(secondary.maxLevel, Math.max(1, Math.floor(Math.random() * 2) + 1));
        additional.push({
          id: secondary.key,
          name: `${secondary.name} ${secondary.roman[secLevel - 1] || secLevel}`,
          level: secLevel
        });
      }
    }

    return {
      slot: c.slot,
      levelRequirement: c.levelReq,
      levelCost: c.levelCost,
      lapisCost: c.lapisCost,
      primary: {
        id: candidate.key,
        name: primaryName,
        level: enchLevel
      },
      additional,
      runes: generateRunes(6),
      hint: `${primaryName}...?`
    };
  });
}

/**
 * Applies the chosen enchantment offer to the item, deducting levels and lapis.
 */
export function applyEnchantment(item, offer, player, ui = null, sounds = null) {
  if (!item || !offer || !player) return false;

  // Validate player level
  if ((player.level || 0) < offer.levelRequirement) return false;

  // Consume levels
  consumePlayerLevels(player, offer.levelCost, ui);

  // Attach enchantments array
  const allEnchants = [offer.primary, ...(offer.additional || [])];
  item.enchantments = allEnchants;

  // If item was a Book, convert to an Enchanted Book
  if (item.id === 'book') {
    item.id = 'enchanted_book';
    item.name = 'Enchanted Book';
  }

  // Audio & UI
  if (sounds?.playEnchant) {
    sounds.playEnchant();
  }

  if (ui?.updateStats) {
    ui.updateStats();
  }

  return true;
}

/**
 * Manager class tracking open Enchanting Table position and state.
 */
export class EnchantingManager {
  constructor(game) {
    this.game = game;
    this.openTablePos = null;
    this.currentOffers = [];
    this.slottedItem = null;
    this.slottedLapis = null;
  }

  interact(x, y, z, player) {
    this.openTablePos = { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
    if (this.game?.ui?.openEnchantingTable) {
      this.game.ui.openEnchantingTable(this.openTablePos.x, this.openTablePos.y, this.openTablePos.z);
    }
  }

  close() {
    this.openTablePos = null;
    this.currentOffers = [];
    this.slottedItem = null;
    this.slottedLapis = null;
  }

  getBookshelvesAround(x, y, z) {
    const world = this.game?.world;
    return calculateBookshelfCount(world, x, y, z);
  }
}
