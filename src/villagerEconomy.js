import { BLOCKS } from './blocks.js';

/**
 * 13 Minecraft Professions and their corresponding Workstation Blocks
 * Reference: https://minecraft.fandom.com/wiki/Trading
 */
export const PROFESSIONS = {
  armorer: { id: 'armorer', name: 'Armorer', workstation: BLOCKS.BLAST_FURNACE, workstationName: 'Blast Furnace', badgeColor: '#475569' },
  butcher: { id: 'butcher', name: 'Butcher', workstation: BLOCKS.SMOKER, workstationName: 'Smoker', badgeColor: '#991b1b' },
  cartographer: { id: 'cartographer', name: 'Cartographer', workstation: BLOCKS.CARTOGRAPHY_TABLE, workstationName: 'Cartography Table', badgeColor: '#ca8a04' },
  cleric: { id: 'cleric', name: 'Cleric', workstation: BLOCKS.BREWING_STAND, workstationName: 'Brewing Stand', badgeColor: '#9333ea' },
  farmer: { id: 'farmer', name: 'Farmer', workstation: BLOCKS.COMPOSTER, workstationName: 'Composter', badgeColor: '#65a30d' },
  fisherman: { id: 'fisherman', name: 'Fisherman', workstation: BLOCKS.BARREL, workstationName: 'Barrel', badgeColor: '#0284c7' },
  fletcher: { id: 'fletcher', name: 'Fletcher', workstation: BLOCKS.FLETCHING_TABLE, workstationName: 'Fletching Table', badgeColor: '#d97706' },
  leatherworker: { id: 'leatherworker', name: 'Leatherworker', workstation: BLOCKS.CAULDRON, workstationName: 'Cauldron', badgeColor: '#78350f' },
  librarian: { id: 'librarian', name: 'Librarian', workstation: BLOCKS.LECTERN, workstationName: 'Lectern', badgeColor: '#dc2626' },
  mason: { id: 'mason', name: 'Mason', workstation: BLOCKS.STONECUTTER, workstationName: 'Stonecutter', badgeColor: '#52525b' },
  shepherd: { id: 'shepherd', name: 'Shepherd', workstation: BLOCKS.LOOM, workstationName: 'Loom', badgeColor: '#16a34a' },
  toolsmith: { id: 'toolsmith', name: 'Toolsmith', workstation: BLOCKS.SMITHING_TABLE, workstationName: 'Smithing Table', badgeColor: '#4338ca' },
  weaponsmith: { id: 'weaponsmith', name: 'Weaponsmith', workstation: BLOCKS.GRINDSTONE, workstationName: 'Grindstone', badgeColor: '#b45309' }
};

export const WORKSTATION_TO_PROFESSION = {
  [BLOCKS.BLAST_FURNACE]: 'armorer',
  [BLOCKS.SMOKER]: 'butcher',
  [BLOCKS.CARTOGRAPHY_TABLE]: 'cartographer',
  [BLOCKS.BREWING_STAND]: 'cleric',
  [BLOCKS.COMPOSTER]: 'farmer',
  [BLOCKS.BARREL]: 'fisherman',
  [BLOCKS.FLETCHING_TABLE]: 'fletcher',
  [BLOCKS.CAULDRON]: 'leatherworker',
  [BLOCKS.LECTERN]: 'librarian',
  [BLOCKS.STONECUTTER]: 'mason',
  [BLOCKS.LOOM]: 'shepherd',
  [BLOCKS.SMITHING_TABLE]: 'toolsmith',
  [BLOCKS.GRINDSTONE]: 'weaponsmith'
};

export const VILLAGER_LEVELS = [
  { level: 1, title: 'Novice', xpRequired: 0, badge: 'Stone', badgeColor: '#78716c' },
  { level: 2, title: 'Apprentice', xpRequired: 10, badge: 'Iron', badgeColor: '#94a3b8' },
  { level: 3, title: 'Journeyman', xpRequired: 70, badge: 'Gold', badgeColor: '#eab308' },
  { level: 4, title: 'Expert', xpRequired: 150, badge: 'Emerald', badgeColor: '#10b981' },
  { level: 5, title: 'Master', xpRequired: 250, badge: 'Diamond', badgeColor: '#06b6d4' }
];

/**
 * Authentic Trade Pools for all 13 Professions across Novice (1) to Master (5)
 */
export const PROFESSION_TRADES = {
  farmer: [
    // Novice
    { level: 1, cost: { id: 'wheat', isBlock: false, count: 20, name: '20 Wheat', icon: '/assets/items/wheat.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 2 },
    { level: 1, cost: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, reward: { id: 'bread', isBlock: false, count: 6, name: '6 Bread', icon: '/assets/items/bread.png' }, xp: 1 },
    // Apprentice
    { level: 2, cost: { id: 'carrot', isBlock: false, count: 15, name: '15 Carrots', icon: '/assets/items/carrot.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 5 },
    { level: 2, cost: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, reward: { id: 'apple', isBlock: false, count: 4, name: '4 Apples', icon: '/assets/items/apple.png' }, xp: 5 },
    // Journeyman
    { level: 3, cost: { id: 'potato', isBlock: false, count: 15, name: '15 Potatoes', icon: '/assets/items/potato.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 10 },
    { level: 3, cost: { id: 'emerald', isBlock: false, count: 3, name: '3 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'cookie', isBlock: false, count: 18, name: '18 Cookies', icon: '/assets/items/cookie.png' }, xp: 10 },
    // Expert
    { level: 4, cost: { id: 'melon_slice', isBlock: false, count: 4, name: '4 Melons', icon: '/assets/items/melon.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 20 },
    { level: 4, cost: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, reward: { id: 'cake', isBlock: false, count: 1, name: '1 Cake', icon: '/assets/items/cake.png' }, xp: 20 },
    // Master
    { level: 5, cost: { id: 'emerald', isBlock: false, count: 3, name: '3 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'golden_carrot', isBlock: false, count: 3, name: '3 Golden Carrots', icon: '/assets/items/golden_carrot.png' }, xp: 30 }
  ],
  librarian: [
    // Novice
    { level: 1, cost: { id: 'paper', isBlock: false, count: 24, name: '24 Paper', icon: '/assets/items/paper.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 2 },
    { level: 1, cost: { id: 'emerald', isBlock: false, count: 5, name: '5 Emeralds', icon: '/assets/items/emerald.png' }, cost2: { id: 'book', isBlock: false, count: 1, name: '1 Book', icon: '/assets/items/book.png' }, reward: { id: 'enchanted_book', isBlock: false, count: 1, name: 'Enchanted Book', icon: '/assets/items/enchanted_book.png' }, xp: 2 },
    // Apprentice
    { level: 2, cost: { id: 'book', isBlock: false, count: 4, name: '4 Books', icon: '/assets/items/book.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 5 },
    { level: 2, cost: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, reward: { id: 'lantern', isBlock: true, count: 1, name: '1 Lantern', icon: '/assets/items/lantern.png' }, xp: 5 },
    // Journeyman
    { level: 3, cost: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, reward: { id: 'glass', isBlock: true, count: 4, name: '4 Glass', icon: '/assets/items/glass.png' }, xp: 10 },
    { level: 3, cost: { id: 'emerald', isBlock: false, count: 8, name: '8 Emeralds', icon: '/assets/items/emerald.png' }, cost2: { id: 'book', isBlock: false, count: 1, name: '1 Book', icon: '/assets/items/book.png' }, reward: { id: 'enchanted_book', isBlock: false, count: 1, name: 'Enchanted Book', icon: '/assets/items/enchanted_book.png' }, xp: 10 },
    // Expert
    { level: 4, cost: { id: 'emerald', isBlock: false, count: 5, name: '5 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'compass', isBlock: false, count: 1, name: '1 Compass', icon: '/assets/items/compass.png' }, xp: 20 },
    { level: 4, cost: { id: 'emerald', isBlock: false, count: 12, name: '12 Emeralds', icon: '/assets/items/emerald.png' }, cost2: { id: 'book', isBlock: false, count: 1, name: '1 Book', icon: '/assets/items/book.png' }, reward: { id: 'enchanted_book', isBlock: false, count: 1, name: 'Enchanted Book', icon: '/assets/items/enchanted_book.png' }, xp: 20 },
    // Master
    { level: 5, cost: { id: 'emerald', isBlock: false, count: 20, name: '20 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'name_tag', isBlock: false, count: 1, name: 'Name Tag', icon: '/assets/items/name_tag.png' }, xp: 30 }
  ],
  armorer: [
    // Novice
    { level: 1, cost: { id: 'coal', isBlock: false, count: 15, name: '15 Coal', icon: '/assets/items/coal.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 2 },
    { level: 1, cost: { id: 'emerald', isBlock: false, count: 5, name: '5 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'iron_helmet', isBlock: false, count: 1, name: 'Iron Helmet', icon: '/assets/items/iron_helmet.png' }, xp: 2 },
    // Apprentice
    { level: 2, cost: { id: 'iron_ingot', isBlock: false, count: 4, name: '4 Iron Ingots', icon: '/assets/items/iron_ingot.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 5 },
    { level: 2, cost: { id: 'emerald', isBlock: false, count: 7, name: '7 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'iron_chestplate', isBlock: false, count: 1, name: 'Iron Chestplate', icon: '/assets/items/iron_chestplate.png' }, xp: 5 },
    // Journeyman
    { level: 3, cost: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, reward: { id: 'shield', isBlock: false, count: 1, name: 'Shield', icon: '/assets/items/shield.png' }, xp: 10 },
    { level: 3, cost: { id: 'emerald', isBlock: false, count: 4, name: '4 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'iron_leggings', isBlock: false, count: 1, name: 'Iron Leggings', icon: '/assets/items/iron_leggings.png' }, xp: 10 },
    // Expert
    { level: 4, cost: { id: 'diamond', isBlock: false, count: 1, name: '1 Diamond', icon: '/assets/items/diamond.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 20 },
    { level: 4, cost: { id: 'emerald', isBlock: false, count: 8, name: '8 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'diamond_boots', isBlock: false, count: 1, name: 'Diamond Boots', icon: '/assets/items/diamond_boots.png' }, xp: 20 },
    // Master
    { level: 5, cost: { id: 'emerald', isBlock: false, count: 14, name: '14 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'diamond_chestplate', isBlock: false, count: 1, name: 'Diamond Chestplate', icon: '/assets/items/diamond_chestplate.png' }, xp: 30 }
  ],
  weaponsmith: [
    // Novice
    { level: 1, cost: { id: 'coal', isBlock: false, count: 15, name: '15 Coal', icon: '/assets/items/coal.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 2 },
    { level: 1, cost: { id: 'emerald', isBlock: false, count: 3, name: '3 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'iron_sword', isBlock: false, count: 1, name: 'Iron Sword', icon: '/assets/items/iron_sword.png' }, xp: 2 },
    // Apprentice
    { level: 2, cost: { id: 'iron_ingot', isBlock: false, count: 4, name: '4 Iron Ingots', icon: '/assets/items/iron_ingot.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 5 },
    { level: 2, cost: { id: 'emerald', isBlock: false, count: 4, name: '4 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'iron_axe', isBlock: false, count: 1, name: 'Iron Axe', icon: '/assets/items/iron_axe.png' }, xp: 5 },
    // Journeyman
    { level: 3, cost: { id: 'flint', isBlock: false, count: 24, name: '24 Flint', icon: '/assets/items/flint.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 10 },
    // Expert
    { level: 4, cost: { id: 'diamond', isBlock: false, count: 1, name: '1 Diamond', icon: '/assets/items/diamond.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 20 },
    { level: 4, cost: { id: 'emerald', isBlock: false, count: 8, name: '8 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'diamond_axe', isBlock: false, count: 1, name: 'Diamond Axe', icon: '/assets/items/diamond_axe.png' }, xp: 20 },
    // Master
    { level: 5, cost: { id: 'emerald', isBlock: false, count: 12, name: '12 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'diamond_sword', isBlock: false, count: 1, name: 'Diamond Sword', icon: '/assets/items/diamond_sword.png' }, xp: 30 }
  ],
  toolsmith: [
    // Novice
    { level: 1, cost: { id: 'coal', isBlock: false, count: 15, name: '15 Coal', icon: '/assets/items/coal.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 2 },
    { level: 1, cost: { id: 'emerald', isBlock: false, count: 2, name: '2 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'stone_pickaxe', isBlock: false, count: 1, name: 'Stone Pickaxe', icon: '/assets/items/stone_pickaxe.png' }, xp: 2 },
    // Apprentice
    { level: 2, cost: { id: 'iron_ingot', isBlock: false, count: 4, name: '4 Iron Ingots', icon: '/assets/items/iron_ingot.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 5 },
    { level: 2, cost: { id: 'emerald', isBlock: false, count: 6, name: '6 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'iron_pickaxe', isBlock: false, count: 1, name: 'Iron Pickaxe', icon: '/assets/items/iron_pickaxe.png' }, xp: 5 },
    // Journeyman
    { level: 3, cost: { id: 'flint', isBlock: false, count: 30, name: '30 Flint', icon: '/assets/items/flint.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 10 },
    // Expert
    { level: 4, cost: { id: 'diamond', isBlock: false, count: 1, name: '1 Diamond', icon: '/assets/items/diamond.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 20 },
    { level: 4, cost: { id: 'emerald', isBlock: false, count: 10, name: '10 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'diamond_shovel', isBlock: false, count: 1, name: 'Diamond Shovel', icon: '/assets/items/diamond_shovel.png' }, xp: 20 },
    // Master
    { level: 5, cost: { id: 'emerald', isBlock: false, count: 13, name: '13 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'diamond_pickaxe', isBlock: false, count: 1, name: 'Diamond Pickaxe', icon: '/assets/items/diamond_pickaxe.png' }, xp: 30 }
  ],
  cleric: [
    // Novice
    { level: 1, cost: { id: 'rotten_flesh', isBlock: false, count: 32, name: '32 Rotten Flesh', icon: '/assets/items/rotten_flesh.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 2 },
    { level: 1, cost: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, reward: { id: 'redstone', isBlock: false, count: 2, name: '2 Redstone', icon: '/assets/items/redstone.png' }, xp: 2 },
    // Apprentice
    { level: 2, cost: { id: 'gold_ingot', isBlock: false, count: 3, name: '3 Gold Ingots', icon: '/assets/items/gold_ingot.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 5 },
    { level: 2, cost: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, reward: { id: 'lapis_lazuli', isBlock: false, count: 1, name: '1 Lapis Lazuli', icon: '/assets/items/lapis_lazuli.png' }, xp: 5 },
    // Journeyman
    { level: 3, cost: { id: 'emerald', isBlock: false, count: 4, name: '4 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'glowstone', isBlock: true, count: 1, name: '1 Glowstone', icon: '/assets/items/glowstone.png' }, xp: 10 },
    // Expert
    { level: 4, cost: { id: 'emerald', isBlock: false, count: 5, name: '5 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'ender_pearl', isBlock: false, count: 1, name: '1 Ender Pearl', icon: '/assets/items/ender_pearl.png' }, xp: 20 },
    // Master
    { level: 5, cost: { id: 'emerald', isBlock: false, count: 3, name: '3 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'experience_bottle', isBlock: false, count: 1, name: 'Bottle o\' Enchanting', icon: '/assets/items/experience_bottle.png' }, xp: 30 }
  ],
  fletcher: [
    // Novice
    { level: 1, cost: { id: 'stick', isBlock: false, count: 32, name: '32 Sticks', icon: '/assets/items/stick.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 2 },
    { level: 1, cost: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, reward: { id: 'arrow', isBlock: false, count: 16, name: '16 Arrows', icon: '/assets/items/arrow.png' }, xp: 2 },
    // Apprentice
    { level: 2, cost: { id: 'flint', isBlock: false, count: 26, name: '26 Flint', icon: '/assets/items/flint.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 5 },
    { level: 2, cost: { id: 'emerald', isBlock: false, count: 2, name: '2 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'bow', isBlock: false, count: 1, name: 'Bow', icon: '/assets/items/bow.png' }, xp: 5 },
    // Journeyman
    { level: 3, cost: { id: 'string', isBlock: false, count: 14, name: '14 String', icon: '/assets/items/string.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 10 },
    { level: 3, cost: { id: 'emerald', isBlock: false, count: 3, name: '3 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'crossbow', isBlock: false, count: 1, name: 'Crossbow', icon: '/assets/items/crossbow.png' }, xp: 10 },
    // Expert
    { level: 4, cost: { id: 'feather', isBlock: false, count: 24, name: '24 Feathers', icon: '/assets/items/feather.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 20 },
    // Master
    { level: 5, cost: { id: 'emerald', isBlock: false, count: 8, name: '8 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'arrow', isBlock: false, count: 32, name: '32 Spectral Arrows', icon: '/assets/items/arrow.png' }, xp: 30 }
  ],
  butcher: [
    // Novice
    { level: 1, cost: { id: 'chicken', isBlock: false, count: 14, name: '14 Raw Chicken', icon: '/assets/items/chicken.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 2 },
    { level: 1, cost: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, reward: { id: 'cooked_porkchop', isBlock: false, count: 5, name: '5 Cooked Porkchop', icon: '/assets/items/cooked_porkchop.png' }, xp: 2 },
    // Apprentice
    { level: 2, cost: { id: 'porkchop', isBlock: false, count: 15, name: '15 Raw Porkchop', icon: '/assets/items/porkchop.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 5 },
    { level: 2, cost: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, reward: { id: 'cooked_beef', isBlock: false, count: 4, name: '4 Cooked Beef', icon: '/assets/items/cooked_beef.png' }, xp: 5 },
    // Journeyman
    { level: 3, cost: { id: 'mutton', isBlock: false, count: 16, name: '16 Raw Mutton', icon: '/assets/items/mutton.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 10 },
    // Expert
    { level: 4, cost: { id: 'beef', isBlock: false, count: 10, name: '10 Raw Beef', icon: '/assets/items/beef.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 20 },
    // Master
    { level: 5, cost: { id: 'sweet_berries', isBlock: false, count: 10, name: '10 Sweet Berries', icon: '/assets/items/sweet_berries.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 30 }
  ],
  leatherworker: [
    // Novice
    { level: 1, cost: { id: 'leather', isBlock: false, count: 6, name: '6 Leather', icon: '/assets/items/leather.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 2 },
    { level: 1, cost: { id: 'emerald', isBlock: false, count: 3, name: '3 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'leather_leggings', isBlock: false, count: 1, name: 'Leather Pants', icon: '/assets/items/leather_leggings.png' }, xp: 2 },
    // Apprentice
    { level: 2, cost: { id: 'flint', isBlock: false, count: 26, name: '26 Flint', icon: '/assets/items/flint.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 5 },
    { level: 2, cost: { id: 'emerald', isBlock: false, count: 5, name: '5 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'leather_chestplate', isBlock: false, count: 1, name: 'Leather Tunic', icon: '/assets/items/leather_chestplate.png' }, xp: 5 },
    // Journeyman
    { level: 3, cost: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, reward: { id: 'cauldron', isBlock: true, count: 1, name: 'Cauldron', icon: '/assets/items/cauldron.png' }, xp: 10 },
    // Expert
    { level: 4, cost: { id: 'emerald', isBlock: false, count: 6, name: '6 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'leather_horse_armor', isBlock: false, count: 1, name: 'Leather Horse Armor', icon: '/assets/items/leather.png' }, xp: 20 },
    // Master
    { level: 5, cost: { id: 'emerald', isBlock: false, count: 6, name: '6 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'saddle', isBlock: false, count: 1, name: 'Saddle', icon: '/assets/items/saddle.png' }, xp: 30 }
  ],
  fisherman: [
    // Novice
    { level: 1, cost: { id: 'cod', isBlock: false, count: 20, name: '20 Raw Cod', icon: '/assets/items/cod.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 2 },
    { level: 1, cost: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, reward: { id: 'cooked_cod', isBlock: false, count: 6, name: '6 Cooked Cod', icon: '/assets/items/cooked_cod.png' }, xp: 2 },
    // Apprentice
    { level: 2, cost: { id: 'salmon', isBlock: false, count: 15, name: '15 Raw Salmon', icon: '/assets/items/salmon.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 5 },
    { level: 2, cost: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, reward: { id: 'campfire', isBlock: true, count: 1, name: 'Campfire', icon: '/assets/items/coal.png' }, xp: 5 },
    // Journeyman
    { level: 3, cost: { id: 'string', isBlock: false, count: 13, name: '13 String', icon: '/assets/items/string.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 10 },
    { level: 3, cost: { id: 'emerald', isBlock: false, count: 8, name: '8 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'fishing_rod', isBlock: false, count: 1, name: 'Fishing Rod', icon: '/assets/items/fishing_rod.png' }, xp: 10 },
    // Expert
    { level: 4, cost: { id: 'emerald', isBlock: false, count: 6, name: '6 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'enchanted_fishing_rod', isBlock: false, count: 1, name: 'Enchanted Fishing Rod', icon: '/assets/items/fishing_rod.png' }, xp: 20 },
    // Master
    { level: 5, cost: { id: 'boat', isBlock: false, count: 1, name: '1 Boat', icon: '/assets/items/boat.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 30 }
  ],
  cartographer: [
    // Novice
    { level: 1, cost: { id: 'paper', isBlock: false, count: 24, name: '24 Paper', icon: '/assets/items/paper.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 2 },
    { level: 1, cost: { id: 'emerald', isBlock: false, count: 7, name: '7 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'map', isBlock: false, count: 1, name: 'Empty Map', icon: '/assets/items/map.png' }, xp: 2 },
    // Apprentice
    { level: 2, cost: { id: 'compass', isBlock: false, count: 1, name: '1 Compass', icon: '/assets/items/compass.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 5 },
    // Journeyman
    { level: 3, cost: { id: 'emerald', isBlock: false, count: 12, name: '12 Emeralds', icon: '/assets/items/emerald.png' }, cost2: { id: 'compass', isBlock: false, count: 1, name: '1 Compass', icon: '/assets/items/compass.png' }, reward: { id: 'ocean_map', isBlock: false, count: 1, name: 'Ocean Explorer Map', icon: '/assets/items/map.png' }, xp: 10 },
    // Expert
    { level: 4, cost: { id: 'emerald', isBlock: false, count: 14, name: '14 Emeralds', icon: '/assets/items/emerald.png' }, cost2: { id: 'compass', isBlock: false, count: 1, name: '1 Compass', icon: '/assets/items/compass.png' }, reward: { id: 'woodland_map', isBlock: false, count: 1, name: 'Woodland Explorer Map', icon: '/assets/items/map.png' }, xp: 20 },
    // Master
    { level: 5, cost: { id: 'emerald', isBlock: false, count: 8, name: '8 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'item_frame', isBlock: false, count: 1, name: 'Item Frame', icon: '/assets/items/item_frame.png' }, xp: 30 },
    // A second master offer, which is how vanilla lists a level: eight emeralds for the globe banner pattern.
    // This is the item's only source in the game, so `codeDropSources.js` names it, and it is what makes
    // `globe_banner_pattern` obtainable rather than merely registered.
    { level: 5, cost: { id: 'emerald', isBlock: false, count: 8, name: '8 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'globe_banner_pattern', isBlock: false, count: 1, name: 'Globe Banner Pattern', icon: '/assets/items/globe_banner_pattern.png' }, xp: 30 }
  ],
  mason: [
    // Novice
    { level: 1, cost: { id: 'clay_ball', isBlock: false, count: 10, name: '10 Clay Balls', icon: '/assets/items/clay_ball.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 2 },
    { level: 1, cost: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, reward: { id: 'bricks', isBlock: true, count: 10, name: '10 Bricks', icon: '/assets/items/brick.png' }, xp: 2 },
    // Apprentice
    { level: 2, cost: { id: 'stone', isBlock: true, count: 20, name: '20 Stone', icon: '/assets/items/stone.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 5 },
    // Journeyman
    { level: 3, cost: { id: 'granite', isBlock: true, count: 16, name: '16 Granite', icon: '/assets/items/stone.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 10 },
    // Expert
    { level: 4, cost: { id: 'terracotta', isBlock: true, count: 12, name: '12 Terracotta', icon: '/assets/items/terracotta.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 20 },
    // Master
    { level: 5, cost: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, reward: { id: 'quartz_block', isBlock: true, count: 1, name: 'Quartz Block', icon: '/assets/items/quartz.png' }, xp: 30 }
  ],
  shepherd: [
    // Novice
    { level: 1, cost: { id: 'wool', isBlock: true, count: 18, name: '18 White Wool', icon: '/assets/items/white_wool.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 2 },
    { level: 1, cost: { id: 'emerald', isBlock: false, count: 2, name: '2 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'shears', isBlock: false, count: 1, name: 'Shears', icon: '/assets/items/shears.png' }, xp: 2 },
    // Apprentice
    { level: 2, cost: { id: 'dye', isBlock: false, count: 12, name: '12 Dyes', icon: '/assets/items/dye.png' }, reward: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, xp: 5 },
    // Journeyman
    { level: 3, cost: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, reward: { id: 'carpet', isBlock: true, count: 4, name: '4 Carpets', icon: '/assets/items/white_wool.png' }, xp: 10 },
    // Expert
    { level: 4, cost: { id: 'emerald', isBlock: false, count: 1, name: '1 Emerald', icon: '/assets/items/emerald.png' }, reward: { id: 'bed', isBlock: true, count: 1, name: 'Bed', icon: '/assets/items/red_bed.png' }, xp: 20 },
    // Master
    { level: 5, cost: { id: 'emerald', isBlock: false, count: 2, name: '2 Emeralds', icon: '/assets/items/emerald.png' }, reward: { id: 'painting', isBlock: false, count: 1, name: 'Painting', icon: '/assets/items/painting.png' }, xp: 30 }
  ]
};

/**
 * Initialize villager trades and economy properties
 */
export function initVillagerEconomy(villager, professionId = 'unemployed') {
  villager.profession = professionId;
  villager.level = 1;
  villager.xp = 0;
  villager.workstation = null;
  villager.cured = !!villager.cured;
  villager.demand = {};
  villager.restockCount = 0;
  villager.lastRestockDay = 0;
  villager.trades = [];

  if (professionId && professionId !== 'unemployed' && professionId !== 'nitwit') {
    unlockTradesForLevel(villager, 1);
  }
}

/**
 * Unlocks trade offers for the given level
 */
export function unlockTradesForLevel(villager, targetLevel) {
  const pool = PROFESSION_TRADES[villager.profession];
  if (!pool) return;

  const newTrades = pool
    .filter(t => t.level === targetLevel)
    .map(t => ({
      ...t,
      cost: { ...t.cost },
      cost2: t.cost2 ? { ...t.cost2 } : null,
      reward: { ...t.reward },
      uses: 0,
      maxUses: t.maxUses || 12,
      demand: 0,
      disabled: false
    }));

  villager.trades = villager.trades || [];
  // Append new trades without duplicating
  for (const nt of newTrades) {
    const exists = villager.trades.some(existing => 
      existing.level === nt.level && 
      existing.reward.id === nt.reward.id && 
      existing.cost.id === nt.cost.id
    );
    if (!exists) {
      villager.trades.push(nt);
    }
  }
}

/**
 * Calculates effective trade cost after demand fluctuations and discounts
 */
export function calculateTradeCost(trade, villager, playerStatus = {}) {
  const baseCost = trade.cost.count;
  let effectiveCost = baseCost;

  // 1. Demand markup: high demand increases price
  const demand = trade.demand || 0;
  if (demand > 2) {
    effectiveCost += Math.floor(demand / 2);
  }

  // 2. Cured discount: massive gratitude discount from cured zombie villager
  if (villager && villager.cured) {
    if (trade.cost.id === 'emerald') {
      // Emerald price reduced by up to 20 (min 1)
      effectiveCost = Math.max(1, effectiveCost - Math.min(20, Math.floor(baseCost * 0.75) + 2));
    } else {
      // Material turn-in discount (e.g. 20 wheat -> 12 wheat)
      effectiveCost = Math.max(1, Math.floor(effectiveCost * 0.65));
    }
  }

  // 3. Hero of the Village discount: 30% reduction from raid victory
  if (playerStatus.heroOfTheVillage) {
    effectiveCost = Math.max(1, Math.floor(effectiveCost * 0.7));
  }

  // Price floor: minimum 1
  effectiveCost = Math.max(1, effectiveCost);

  return {
    effectiveCount: effectiveCost,
    originalCount: baseCost,
    discounted: effectiveCost < baseCost,
    markup: effectiveCost > baseCost
  };
}

/**
 * Checks if a player has items for a trade and executes it
 */
export function executeTrade(trade, villager, playerInventory, sounds = null) {
  if (trade.uses >= trade.maxUses || trade.disabled) {
    sounds?.playHurt?.();
    return { success: false, reason: 'out_of_stock' };
  }

  const { effectiveCount } = calculateTradeCost(trade, villager);

  // Verify primary cost
  if (!hasPlayerItem(playerInventory, trade.cost.id, trade.cost.isBlock, effectiveCount)) {
    sounds?.playHurt?.();
    return { success: false, reason: 'insufficient_items' };
  }

  // Verify optional secondary cost (e.g. book)
  if (trade.cost2 && !hasPlayerItem(playerInventory, trade.cost2.id, trade.cost2.isBlock, trade.cost2.count)) {
    sounds?.playHurt?.();
    return { success: false, reason: 'insufficient_secondary_items' };
  }

  // Deduct cost items
  consumePlayerItem(playerInventory, trade.cost.id, trade.cost.isBlock, effectiveCount);
  if (trade.cost2) {
    consumePlayerItem(playerInventory, trade.cost2.id, trade.cost2.isBlock, trade.cost2.count);
  }

  // Grant reward
  playerInventory.addItem(trade.reward.id, trade.reward.isBlock, trade.reward.count);

  // Update trade state
  trade.uses += 1;
  trade.demand = (trade.demand || 0) + 1;
  if (trade.uses >= trade.maxUses) {
    trade.disabled = true;
  }

  // Update villager XP and check leveling
  const prevLevel = villager.level;
  villager.xp = (villager.xp || 0) + (trade.xp || 2);

  // Check if reached next level
  for (let lvl = 5; lvl >= 2; lvl--) {
    const lvlDef = VILLAGER_LEVELS.find(l => l.level === lvl);
    if (lvlDef && villager.xp >= lvlDef.xpRequired) {
      if (villager.level < lvl) {
        villager.level = lvl;
        unlockTradesForLevel(villager, lvl);
      }
      break;
    }
  }

  const leveledUp = villager.level > prevLevel;
  if (leveledUp) {
    sounds?.playLevelUp?.();
  }
  sounds?.playVillager?.();

  return {
    success: true,
    leveledUp,
    newLevel: villager.level,
    xpGained: trade.xp || 2,
    villagerXp: villager.xp
  };
}

/**
 * Restocks all trades on a villager
 */
export function restockVillager(villager) {
  if (!villager.trades) return;
  for (const trade of villager.trades) {
    if (trade.demand > 0) {
      trade.demand = Math.max(0, trade.demand - 1);
    }
    trade.uses = 0;
    trade.disabled = false;
  }
  villager.restockCount = (villager.restockCount || 0) + 1;
}

/**
 * Check and update workstation claims for a villager
 */
export function updateVillagerWorkstation(villager, world, allVillagers = []) {
  if (villager.profession === 'nitwit') return;

  // 1. If villager has a claimed workstation, verify it still exists in the world
  if (villager.workstation) {
    const ws = villager.workstation;
    const currentBlock = world.getVoxel(ws.x, ws.y, ws.z);
    if (currentBlock !== ws.blockId) {
      // Workstation was broken or replaced!
      if (villager.xp > 0) {
        // Locked profession: keeps profession, just loses current workstation instance
        villager.workstation = null;
      } else {
        // Novice with 0 XP: loses profession completely and becomes unemployed!
        villager.workstation = null;
        villager.profession = 'unemployed';
        villager.trades = [];
      }
    }
  }

  // 2. If unemployed (or locked profession missing workstation), look for an unclaimed matching workstation nearby
  if (!villager.workstation && villager.mesh?.position) {
    const vPos = villager.mesh.position;
    const vx = Math.floor(vPos.x);
    const vy = Math.floor(vPos.y);
    const vz = Math.floor(vPos.z);
    const radius = 16;

    // Gather already claimed workstations to avoid claiming the same block
    const claimedCoords = new Set(
      allVillagers
        .filter(v => v !== villager && v.workstation)
        .map(v => `${v.workstation.x},${v.workstation.y},${v.workstation.z}`)
    );

    let bestDistSq = Infinity;
    let foundWorkstation = null;

    for (let x = vx - radius; x <= vx + radius; x++) {
      for (let y = Math.max(1, vy - 4); y <= Math.min(62, vy + 4); y++) {
        for (let z = vz - radius; z <= vz + radius; z++) {
          const coordKey = `${x},${y},${z}`;
          if (claimedCoords.has(coordKey)) continue;

          const block = world.getVoxel(x, y, z);
          const prof = WORKSTATION_TO_PROFESSION[block];

          if (prof) {
            // If villager is locked into a profession, must match that profession
            if (villager.xp > 0 && villager.profession !== 'unemployed' && villager.profession !== prof) {
              continue;
            }

            const distSq = (x - vx) ** 2 + (y - vy) ** 2 + (z - vz) ** 2;
            if (distSq < bestDistSq) {
              bestDistSq = distSq;
              foundWorkstation = { x, y, z, blockId: block, profession: prof };
            }
          }
        }
      }
    }

    if (foundWorkstation) {
      villager.workstation = { x: foundWorkstation.x, y: foundWorkstation.y, z: foundWorkstation.z, blockId: foundWorkstation.blockId };
      if (villager.profession !== foundWorkstation.profession) {
        villager.profession = foundWorkstation.profession;
        unlockTradesForLevel(villager, 1);
      }
    }
  }

  // 3. Restock if close to claimed workstation
  if (villager.workstation && villager.mesh?.position) {
    const ws = villager.workstation;
    const distSq = (villager.mesh.position.x - ws.x) ** 2 +
                   (villager.mesh.position.y - ws.y) ** 2 +
                   (villager.mesh.position.z - ws.z) ** 2;
    if (distSq < 16) {
      // Near workstation: restock depleted trades
      const hasDepleted = villager.trades?.some(t => t.uses >= t.maxUses);
      if (hasDepleted) {
        restockVillager(villager);
      }
    }
  }
}

/**
 * Zombie Villager Curing Ritual
 * 1. Requires Weakness status effect on Zombie Villager
 * 2. Player feeds Golden Apple
 * 3. Violent trembling ritual begins
 * 4. Transforms into cured villager with permanent massive discounts!
 */
export function startZombieVillagerCure(zombieVillager, playerItem, sounds = null) {
  if (zombieVillager.type !== 'zombie_villager') return false;
  if (zombieVillager.isCuring) return false;

  // Check for weakness
  const hasWeakness = !!(
    zombieVillager.hasWeakness ||
    (zombieVillager.statusEffects && zombieVillager.statusEffects.weakness > 0)
  );

  if (!hasWeakness) return false;

  // Check for golden apple
  const isGoldenApple = playerItem && (playerItem.id === 'golden_apple' || playerItem.id === 'enchanted_golden_apple');
  if (!isGoldenApple) return false;

  // Begin curing
  zombieVillager.isCuring = true;
  zombieVillager.cureTimer = 20.0; // 20 seconds
  zombieVillager.shiverTimer = 0;
  sounds?.playSizzle?.();

  return true;
}

export function updateZombieVillagerCuring(zombieVillager, dt, mobManager, options = {}) {
  if (!zombieVillager.isCuring) return null;

  zombieVillager.cureTimer = (zombieVillager.cureTimer || 20.0) - dt;
  zombieVillager.shiverTimer = (zombieVillager.shiverTimer || 0) + dt * 40;

  // Visual violent shivering
  if (zombieVillager.mesh) {
    zombieVillager.mesh.position.x += Math.sin(zombieVillager.shiverTimer) * 0.03;
  }

  // Instant cure option for testing or when timer elapses
  if (zombieVillager.cureTimer <= 0 || options.instantCure) {
    zombieVillager.isCuring = false;
    const pos = zombieVillager.mesh ? zombieVillager.mesh.position.clone() : { x: 0, y: 0, z: 0 };

    // Remove zombie villager
    if (mobManager) {
      mobManager.removeMob?.(zombieVillager);
      // Spawn new cured villager
      const newVillager = mobManager.spawnVillager(pos.x, pos.y, pos.z);
      if (newVillager) {
        newVillager.cured = true;
        newVillager.profession = zombieVillager.savedProfession || 'unemployed';
        if (newVillager.profession !== 'unemployed') {
          unlockTradesForLevel(newVillager, 1);
        }
      }
      return newVillager;
    }
    return { cured: true, position: pos };
  }

  return null;
}

// Helper methods for item checks
function hasPlayerItem(inventory, id, isBlock, count) {
  if (!inventory) return false;
  let available = 0;
  const allSlots = [...(inventory.hotbar || []), ...(inventory.storage || [])];
  for (const slot of allSlots) {
    if (slot && slot.id === id && !!slot.isBlock === !!isBlock) {
      available += slot.count;
    }
  }
  return available >= count;
}

function consumePlayerItem(inventory, id, isBlock, count) {
  if (!inventory) return false;
  let needed = count;
  const allSlots = [...(inventory.hotbar || []), ...(inventory.storage || [])];
  for (const slot of allSlots) {
    if (slot && slot.id === id && !!slot.isBlock === !!isBlock) {
      const take = Math.min(slot.count, needed);
      slot.count -= take;
      needed -= take;
      if (slot.count <= 0) {
        slot.id = null;
        slot.count = 0;
      }
      if (needed <= 0) break;
    }
  }
  return needed <= 0;
}
