// Block IDs and Definitions

export const BLOCKS = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COBBLESTONE: 4,
  BEDROCK: 5,
  SAND: 6,
  GRAVEL: 7,
  OAK_LOG: 8,
  OAK_LEAVES: 9,
  OAK_PLANKS: 10,
  GLASS: 11,
  WATER: 12,
  LAVA: 13,
  COAL_ORE: 14,
  IRON_ORE: 15,
  GOLD_ORE: 16,
  DIAMOND_ORE: 17,
  REDSTONE_ORE: 18,
  EMERALD_ORE: 19,
  OBSIDIAN: 20,
  CRAFTING_TABLE: 21,
  FURNACE: 22,
  TNT: 23,
  TORCH: 24,
  BRICKS: 25,
  BOOKSHELF: 26,
  CACTUS: 27,
  SNOW: 28,
  ICE: 29,
  POPPY: 30,
  DANDELION: 31,
  SANDSTONE: 32,
  MOSSY_COBBLESTONE: 33,
  STONE_BRICKS: 34,
  GLOWSTONE: 35,
  SEA_LANTERN: 36,
  CLAY: 37,
  SPONGE: 38,
  WET_SPONGE: 39,
  NETHERRACK: 40,
  SOUL_SAND: 41,
  END_STONE: 42,
  WHITE_WOOL: 43,
  RED_WOOL: 44,
  BLUE_WOOL: 45,
  YELLOW_WOOL: 46,
  GREEN_WOOL: 47,
  BLACK_WOOL: 48,
  LADDER: 49,
  LEVER: 50,
  REDSTONE_TORCH: 51,
  REDSTONE_LAMP: 52,
  ENCHANTING_TABLE: 53,
  ANVIL: 54,
  LIT_FURNACE: 55,
  SOUL_TORCH: 56,
  FIRE: 57,
  REDSTONE_WIRE: 58,
  REDSTONE_BLOCK: 59,
  REPEATER: 60,
  COMPARATOR: 61,
  OBSERVER: 62,
  PISTON: 63,
  STICKY_PISTON: 64,
  PISTON_HEAD: 65,
  SLIME_BLOCK: 66,
  HONEY_BLOCK: 67,
  STONE_BUTTON: 68,
  PRESSURE_PLATE: 69,
  DAYLIGHT_DETECTOR: 70,
  TARGET_BLOCK: 71,
  IRON_DOOR: 72,
  IRON_TRAPDOOR: 73,
  NOTE_BLOCK: 74,
  DISPENSER: 75,
  DROPPER: 76,
  HOPPER: 77,
  IRON_DOOR_OPEN: 78,
  IRON_TRAPDOOR_OPEN: 79
};

export const BLOCK_DEFS = {
  [BLOCKS.FIRE]: { name: 'Fire', transparent: true, solid: false, plant: true, light: 15, lightColor: 0xff8b28, drop: null, hardness: 0, textures: { all: 'fire.svg' } },
  [BLOCKS.AIR]: {
    name: 'Air',
    transparent: true,
    solid: false
  },
  [BLOCKS.GRASS]: {
    name: 'Grass Block',
    hardness: 0.6,
    sound: 'grass',
    drop: BLOCKS.DIRT,
    textures: {
      top: 'grass_block_top.png',
      side: 'grass_block_side.png',
      bottom: 'dirt.png'
    },
    tintTop: true
  },
  [BLOCKS.DIRT]: {
    name: 'Dirt',
    hardness: 0.5,
    sound: 'gravel',
    drop: BLOCKS.DIRT,
    textures: {
      all: 'dirt.png'
    }
  },
  [BLOCKS.STONE]: {
    name: 'Stone',
    hardness: 1.5,
    sound: 'stone',
    drop: BLOCKS.COBBLESTONE,
    textures: {
      all: 'stone.png'
    }
  },
  [BLOCKS.COBBLESTONE]: {
    name: 'Cobblestone',
    hardness: 2.0,
    sound: 'stone',
    drop: BLOCKS.COBBLESTONE,
    textures: {
      all: 'cobblestone.png'
    }
  },
  [BLOCKS.BEDROCK]: {
    name: 'Bedrock',
    hardness: 999999, // Unbreakable in survival
    sound: 'stone',
    drop: null,
    textures: {
      all: 'bedrock.png'
    }
  },
  [BLOCKS.SAND]: {
    name: 'Sand',
    hardness: 0.5,
    sound: 'sand',
    drop: BLOCKS.SAND,
    textures: {
      all: 'sand.png'
    }
  },
  [BLOCKS.GRAVEL]: {
    name: 'Gravel',
    hardness: 0.6,
    sound: 'gravel',
    drop: BLOCKS.GRAVEL,
    textures: {
      all: 'gravel.png'
    }
  },
  [BLOCKS.OAK_LOG]: {
    name: 'Oak Log',
    hardness: 2.0,
    sound: 'wood',
    drop: BLOCKS.OAK_LOG,
    textures: {
      side: 'oak_log.png',
      top: 'oak_log_top.png',
      bottom: 'oak_log_top.png'
    }
  },
  [BLOCKS.OAK_LEAVES]: {
    name: 'Oak Leaves',
    hardness: 0.2,
    sound: 'grass',
    transparent: true,
    solid: true,
    drop: BLOCKS.OAK_LEAVES,
    textures: {
      all: 'oak_leaves.png'
    },
    tint: true
  },
  [BLOCKS.OAK_PLANKS]: {
    name: 'Oak Planks',
    hardness: 2.0,
    sound: 'wood',
    drop: BLOCKS.OAK_PLANKS,
    textures: {
      all: 'oak_planks.png'
    }
  },
  [BLOCKS.GLASS]: {
    name: 'Glass',
    hardness: 0.3,
    sound: 'stone',
    transparent: true,
    solid: true,
    drop: null,
    textures: {
      all: 'glass.png'
    }
  },
  [BLOCKS.WATER]: {
    name: 'Water',
    icon: '/assets/blocks/water_icon.svg',
    hardness: 100,
    sound: 'water',
    transparent: true,
    solid: false,
    liquid: true,
    drop: null,
    textures: {
      all: 'water_still.png'
    }
  },
  [BLOCKS.LAVA]: {
    name: 'Lava',
    icon: '/assets/blocks/lava_icon.svg',
    lightColor: 0xff7024,
    hardness: 100,
    sound: 'stone',
    transparent: false,
    solid: false,
    liquid: true,
    light: 15,
    drop: null,
    textures: {
      all: 'lava_still.png'
    }
  },
  [BLOCKS.COAL_ORE]: {
    name: 'Coal Ore',
    hardness: 3.0,
    sound: 'stone',
    dropItem: 'coal',
    textures: {
      all: 'coal_ore.png'
    }
  },
  [BLOCKS.IRON_ORE]: {
    name: 'Iron Ore',
    hardness: 3.0,
    sound: 'stone',
    dropItem: 'iron_ingot',
    textures: {
      all: 'iron_ore.png'
    }
  },
  [BLOCKS.GOLD_ORE]: {
    name: 'Gold Ore',
    hardness: 3.0,
    sound: 'stone',
    dropItem: 'gold_ingot',
    textures: {
      all: 'gold_ore.png'
    }
  },
  [BLOCKS.DIAMOND_ORE]: {
    name: 'Diamond Ore',
    hardness: 3.0,
    sound: 'stone',
    dropItem: 'diamond',
    textures: {
      all: 'diamond_ore.png'
    }
  },
  [BLOCKS.REDSTONE_ORE]: {
    name: 'Redstone Ore',
    hardness: 3.0,
    sound: 'stone',
    drop: BLOCKS.REDSTONE_ORE,
    textures: {
      all: 'redstone_ore.png'
    }
  },
  [BLOCKS.EMERALD_ORE]: {
    name: 'Emerald Ore',
    hardness: 3.0,
    sound: 'stone',
    dropItem: 'emerald',
    textures: {
      all: 'emerald_ore.png'
    }
  },
  [BLOCKS.OBSIDIAN]: {
    name: 'Obsidian',
    hardness: 10.0,
    sound: 'stone',
    drop: BLOCKS.OBSIDIAN,
    textures: {
      all: 'obsidian.png'
    }
  },
  [BLOCKS.CRAFTING_TABLE]: {
    name: 'Crafting Table',
    hardness: 2.5,
    sound: 'wood',
    drop: BLOCKS.CRAFTING_TABLE,
    interactable: true,
    textures: {
      top: 'crafting_table_top.png',
      front: 'crafting_table_front.png',
      side: 'crafting_table_side.png',
      bottom: 'oak_planks.png'
    }
  },
  [BLOCKS.FURNACE]: {
    name: 'Furnace',
    hardness: 3.5,
    sound: 'stone',
    drop: BLOCKS.FURNACE,
    interactable: true,
    textures: {
      top: 'furnace_top.png',
      front: 'furnace_front.png',
      side: 'furnace_side.png',
      bottom: 'stone.png'
    }
  },
  [BLOCKS.TNT]: {
    name: 'TNT',
    hardness: 0.0,
    sound: 'grass',
    drop: BLOCKS.TNT,
    interactable: true,
    textures: {
      top: 'tnt_top.png',
      side: 'tnt_side.png',
      bottom: 'tnt_bottom.png'
    }
  },
  [BLOCKS.TORCH]: {
    name: 'Torch',
    shape: 'torch',
    lightColor: 0xffb958,
    hardness: 0.0,
    sound: 'wood',
    transparent: true,
    solid: false,
    light: 14,
    drop: BLOCKS.TORCH,
    textures: {
      all: 'torch.png'
    }
  },
  [BLOCKS.BRICKS]: {
    name: 'Bricks',
    hardness: 2.0,
    sound: 'stone',
    drop: BLOCKS.BRICKS,
    textures: {
      all: 'bricks.png'
    }
  },
  [BLOCKS.BOOKSHELF]: {
    name: 'Bookshelf',
    hardness: 1.5,
    sound: 'wood',
    drop: BLOCKS.BOOKSHELF,
    textures: {
      top: 'oak_planks.png',
      bottom: 'oak_planks.png',
      side: 'bookshelf.png'
    }
  },
  [BLOCKS.CACTUS]: {
    name: 'Cactus',
    hardness: 0.4,
    sound: 'grass',
    drop: BLOCKS.CACTUS,
    textures: {
      top: 'cactus_top.png',
      side: 'cactus_side.png',
      bottom: 'cactus_bottom.png'
    }
  },
  [BLOCKS.SNOW]: {
    name: 'Snow Block',
    hardness: 0.2,
    sound: 'snow',
    drop: BLOCKS.SNOW,
    textures: {
      all: 'snow.png'
    }
  },
  [BLOCKS.ICE]: {
    name: 'Ice',
    hardness: 0.5,
    sound: 'glass',
    transparent: true,
    drop: null,
    textures: {
      all: 'ice.png'
    }
  },
  [BLOCKS.POPPY]: {
    name: 'Poppy',
    hardness: 0.0,
    sound: 'grass',
    transparent: true,
    solid: false,
    plant: true,
    drop: BLOCKS.POPPY,
    textures: {
      all: 'poppy.png'
    }
  },
  [BLOCKS.DANDELION]: {
    name: 'Dandelion',
    hardness: 0.0,
    sound: 'grass',
    transparent: true,
    solid: false,
    plant: true,
    drop: BLOCKS.DANDELION,
    textures: {
      all: 'dandelion.png'
    }
  },
  [BLOCKS.SANDSTONE]: {
    name: 'Sandstone',
    hardness: 0.8,
    sound: 'stone',
    drop: BLOCKS.SANDSTONE,
    textures: {
      top: 'sandstone_top.png',
      side: 'sandstone.png',
      bottom: 'sandstone_bottom.png'
    }
  },
  [BLOCKS.MOSSY_COBBLESTONE]: {
    name: 'Mossy Cobblestone',
    hardness: 2.0,
    sound: 'stone',
    drop: BLOCKS.MOSSY_COBBLESTONE,
    textures: { all: 'mossy_cobblestone.png' }
  },
  [BLOCKS.STONE_BRICKS]: {
    name: 'Stone Bricks',
    hardness: 1.5,
    sound: 'stone',
    drop: BLOCKS.STONE_BRICKS,
    textures: { all: 'stone_bricks.png' }
  },
  [BLOCKS.GLOWSTONE]: {
    name: 'Glowstone',
    hardness: 0.3,
    sound: 'glass',
    light: 15,
    dropItem: 'glowstone_dust',
    textures: { all: 'glowstone.png' }
  },
  [BLOCKS.SEA_LANTERN]: {
    name: 'Sea Lantern',
    lightColor: 0xa8f4ed,
    hardness: 0.3,
    sound: 'glass',
    light: 15,
    textures: { all: 'sea_lantern.png' }
  },
  [BLOCKS.CLAY]: {
    name: 'Clay Block',
    hardness: 0.6,
    sound: 'gravel',
    textures: { all: 'clay.png' }
  },
  [BLOCKS.SPONGE]: {
    name: 'Sponge',
    hardness: 0.6,
    sound: 'grass',
    textures: { all: 'sponge.png' }
  },
  [BLOCKS.WET_SPONGE]: {
    name: 'Wet Sponge',
    hardness: 0.6,
    sound: 'grass',
    textures: { all: 'wet_sponge.png' }
  },
  [BLOCKS.NETHERRACK]: {
    name: 'Netherrack',
    hardness: 0.4,
    sound: 'stone',
    textures: { all: 'netherrack.png' }
  },
  [BLOCKS.SOUL_SAND]: {
    name: 'Soul Sand',
    hardness: 0.5,
    sound: 'sand',
    textures: { all: 'soul_sand.png' }
  },
  [BLOCKS.END_STONE]: {
    name: 'End Stone',
    hardness: 3.0,
    sound: 'stone',
    textures: { all: 'end_stone.png' }
  },
  [BLOCKS.WHITE_WOOL]: {
    name: 'White Wool',
    hardness: 0.8,
    sound: 'grass',
    textures: { all: 'white_wool.png' }
  },
  [BLOCKS.RED_WOOL]: {
    name: 'Red Wool',
    hardness: 0.8,
    sound: 'grass',
    textures: { all: 'red_wool.png' }
  },
  [BLOCKS.BLUE_WOOL]: {
    name: 'Blue Wool',
    hardness: 0.8,
    sound: 'grass',
    textures: { all: 'blue_wool.png' }
  },
  [BLOCKS.YELLOW_WOOL]: {
    name: 'Yellow Wool',
    hardness: 0.8,
    sound: 'grass',
    textures: { all: 'yellow_wool.png' }
  },
  [BLOCKS.GREEN_WOOL]: {
    name: 'Green Wool',
    hardness: 0.8,
    sound: 'grass',
    textures: { all: 'green_wool.png' }
  },
  [BLOCKS.BLACK_WOOL]: {
    name: 'Black Wool',
    hardness: 0.8,
    sound: 'grass',
    textures: { all: 'black_wool.png' }
  },
  [BLOCKS.LADDER]: {
    name: 'Ladder',
    hardness: 0.4,
    sound: 'wood',
    transparent: true,
    solid: false,
    textures: { all: 'ladder.png' }
  },
  [BLOCKS.LEVER]: {
    redstone: true,
    name: 'Lever',
    hardness: 0.5,
    sound: 'wood',
    transparent: true,
    solid: false,
    textures: { all: 'lever.png' }
  },
  [BLOCKS.REDSTONE_TORCH]: {
    redstone: true,
    name: 'Redstone Torch',
    shape: 'torch',
    lightColor: 0xff4335,
    hardness: 0.0,
    sound: 'wood',
    transparent: true,
    solid: false,
    light: 7,
    textures: { all: 'redstone_torch.png' }
  },
  [BLOCKS.REDSTONE_LAMP]: {
    redstone: true,
    name: 'Redstone Lamp',
    hardness: 0.3,
    sound: 'glass',
    light: 15,
    textures: { all: 'redstone_lamp.png' }
  },
  [BLOCKS.ENCHANTING_TABLE]: {
    name: 'Enchanting Table',
    light: 7,
    lightColor: 0xa884ff,
    hardness: 5.0,
    sound: 'stone',
    textures: {
      top: 'enchanting_table_top.png',
      side: 'obsidian.png',
      bottom: 'obsidian.png'
    }
  },
  [BLOCKS.LIT_FURNACE]: {
    name: 'Lit Furnace', hardness: 3.5, sound: 'stone', light: 13,
    lightColor: 0xff983d, drop: BLOCKS.FURNACE,
    textures: { top: 'furnace_top.png', front: 'furnace_front_on.png', side: 'furnace_side.png', bottom: 'stone.png' }
  },
  [BLOCKS.SOUL_TORCH]: {
    name: 'Soul Torch', hardness: 0, sound: 'wood', light: 10,
    lightColor: 0x61eaff, shape: 'torch', transparent: true, solid: false,
    drop: BLOCKS.SOUL_TORCH, textures: { all: 'soul_torch.svg' }
  },
  [BLOCKS.ANVIL]: {
    name: 'Anvil',
    hardness: 5.0,
    sound: 'stone',
    textures: { all: 'anvil.png' }
  }
};

// Complete Item definitions
export const ITEMS = {
  // --- Swords / Weapons ---
  netherite_sword: { name: 'Netherite Sword', attack: 8, icon: '/assets/items/netherite_sword.png', type: 'weapon' },
  diamond_sword: { name: 'Diamond Sword', attack: 7, icon: '/assets/items/diamond_sword.png', type: 'weapon' },
  golden_sword: { name: 'Golden Sword', attack: 4, icon: '/assets/items/golden_sword.png', type: 'weapon' },
  iron_sword: { name: 'Iron Sword', attack: 6, icon: '/assets/items/iron_sword.png', type: 'weapon' },
  stone_sword: { name: 'Stone Sword', attack: 5, icon: '/assets/items/stone_sword.png', type: 'weapon' },
  wooden_sword: { name: 'Wooden Sword', attack: 4, icon: '/assets/items/wooden_sword.png', type: 'weapon' },
  bow: { name: 'Bow', attack: 6, icon: '/assets/items/bow.png', type: 'weapon' },
  crossbow: { name: 'Crossbow', attack: 8, icon: '/assets/items/crossbow.png', type: 'weapon' },
  arrow: { name: 'Arrow', icon: '/assets/items/arrow.png', type: 'projectile' },
  trident: { name: 'Trident', attack: 9, icon: '/assets/items/trident.png', type: 'weapon' },
  totem_of_undying: { name: 'Totem of Undying', icon: '/assets/items/totem_of_undying.png', type: 'special' },

  // --- Armor ---
  diamond_helmet: { name: 'Diamond Helmet', armor: 3, icon: '/assets/items/diamond_helmet.png', type: 'armor' },
  diamond_chestplate: { name: 'Diamond Chestplate', armor: 8, icon: '/assets/items/diamond_chestplate.png', type: 'armor' },
  diamond_leggings: { name: 'Diamond Leggings', armor: 6, icon: '/assets/items/diamond_leggings.png', type: 'armor' },
  diamond_boots: { name: 'Diamond Boots', armor: 3, icon: '/assets/items/diamond_boots.png', type: 'armor' },
  iron_helmet: { name: 'Iron Helmet', armor: 2, icon: '/assets/items/iron_helmet.png', type: 'armor' },
  iron_chestplate: { name: 'Iron Chestplate', armor: 6, icon: '/assets/items/iron_chestplate.png', type: 'armor' },
  iron_leggings: { name: 'Iron Leggings', armor: 5, icon: '/assets/items/iron_leggings.png', type: 'armor' },
  iron_boots: { name: 'Iron Boots', armor: 2, icon: '/assets/items/iron_boots.png', type: 'armor' },
  golden_helmet: { name: 'Golden Helmet', armor: 2, icon: '/assets/items/golden_helmet.png', type: 'armor' },
  golden_chestplate: { name: 'Golden Chestplate', armor: 5, icon: '/assets/items/golden_chestplate.png', type: 'armor' },
  golden_leggings: { name: 'Golden Leggings', armor: 3, icon: '/assets/items/golden_leggings.png', type: 'armor' },
  golden_boots: { name: 'Golden Boots', armor: 1, icon: '/assets/items/golden_boots.png', type: 'armor' },
  chainmail_chestplate: { name: 'Chainmail Chestplate', armor: 5, icon: '/assets/items/chainmail_chestplate.png', type: 'armor' },
  leather_chestplate: { name: 'Leather Tunic', armor: 3, icon: '/assets/items/leather_chestplate.png', type: 'armor' },
  diamond_horse_armor: { name: 'Diamond Horse Armor', icon: '/assets/items/diamond_horse_armor.png', type: 'armor' },
  golden_horse_armor: { name: 'Golden Horse Armor', icon: '/assets/items/golden_horse_armor.png', type: 'armor' },
  iron_horse_armor: { name: 'Iron Horse Armor', icon: '/assets/items/iron_horse_armor.png', type: 'armor' },

  // --- Pickaxes ---
  netherite_pickaxe: { name: 'Netherite Pickaxe', speed: 9, icon: '/assets/items/netherite_pickaxe.png', type: 'tool' },
  diamond_pickaxe: { name: 'Diamond Pickaxe', speed: 8, icon: '/assets/items/diamond_pickaxe.png', type: 'tool' },
  golden_pickaxe: { name: 'Golden Pickaxe', speed: 12, icon: '/assets/items/golden_pickaxe.png', type: 'tool' },
  iron_pickaxe: { name: 'Iron Pickaxe', speed: 6, icon: '/assets/items/iron_pickaxe.png', type: 'tool' },
  stone_pickaxe: { name: 'Stone Pickaxe', speed: 4, icon: '/assets/items/stone_pickaxe.png', type: 'tool' },
  wooden_pickaxe: { name: 'Wooden Pickaxe', speed: 2, icon: '/assets/items/wooden_pickaxe.png', type: 'tool' },

  // --- Axes ---
  netherite_axe: { name: 'Netherite Axe', speed: 9, attack: 10, icon: '/assets/items/netherite_axe.png', type: 'tool' },
  diamond_axe: { name: 'Diamond Axe', speed: 8, attack: 9, icon: '/assets/items/diamond_axe.png', type: 'tool' },
  golden_axe: { name: 'Golden Axe', speed: 12, attack: 7, icon: '/assets/items/golden_axe.png', type: 'tool' },
  iron_axe: { name: 'Iron Axe', speed: 6, attack: 9, icon: '/assets/items/iron_axe.png', type: 'tool' },
  stone_axe: { name: 'Stone Axe', speed: 4, attack: 9, icon: '/assets/items/stone_axe.png', type: 'tool' },
  wooden_axe: { name: 'Wooden Axe', speed: 2, attack: 7, icon: '/assets/items/wooden_axe.png', type: 'tool' },

  // --- Shovels ---
  netherite_shovel: { name: 'Netherite Shovel', speed: 9, icon: '/assets/items/netherite_shovel.png', type: 'tool' },
  diamond_shovel: { name: 'Diamond Shovel', speed: 8, icon: '/assets/items/diamond_shovel.png', type: 'tool' },
  golden_shovel: { name: 'Golden Shovel', speed: 12, icon: '/assets/items/golden_shovel.png', type: 'tool' },
  iron_shovel: { name: 'Iron Shovel', speed: 6, icon: '/assets/items/iron_shovel.png', type: 'tool' },
  stone_shovel: { name: 'Stone Shovel', speed: 4, icon: '/assets/items/stone_shovel.png', type: 'tool' },
  wooden_shovel: { name: 'Wooden Shovel', speed: 2, icon: '/assets/items/wooden_shovel.png', type: 'tool' },

  // --- Hoes ---
  netherite_hoe: { name: 'Netherite Hoe', speed: 9, icon: '/assets/items/netherite_hoe.png', type: 'tool' },
  diamond_hoe: { name: 'Diamond Hoe', speed: 8, icon: '/assets/items/diamond_hoe.png', type: 'tool' },
  golden_hoe: { name: 'Golden Hoe', speed: 12, icon: '/assets/items/golden_hoe.png', type: 'tool' },
  iron_hoe: { name: 'Iron Hoe', speed: 6, icon: '/assets/items/iron_hoe.png', type: 'tool' },
  stone_hoe: { name: 'Stone Hoe', speed: 4, icon: '/assets/items/stone_hoe.png', type: 'tool' },
  wooden_hoe: { name: 'Wooden Hoe', speed: 2, icon: '/assets/items/wooden_hoe.png', type: 'tool' },

  // --- Utility Items ---
  bucket: { name: 'Bucket', icon: '/assets/items/bucket.png', type: 'tool' },
  water_bucket: { name: 'Water Bucket', icon: '/assets/items/water_bucket.png', type: 'tool' },
  lava_bucket: { name: 'Lava Bucket', icon: '/assets/items/lava_bucket.png', type: 'tool' },
  milk_bucket: { name: 'Milk Bucket', icon: '/assets/items/milk_bucket.png', type: 'food' },
  flint_and_steel: { name: 'Flint and Steel', icon: '/assets/items/flint_and_steel.png', type: 'tool' },
  shears: { name: 'Shears', icon: '/assets/items/shears.png', type: 'tool' },
  fishing_rod: { name: 'Fishing Rod', icon: '/assets/items/fishing_rod.png', type: 'tool' },
  compass: { name: 'Compass', icon: '/assets/items/compass.png', type: 'tool' },
  clock: { name: 'Clock', icon: '/assets/items/clock.png', type: 'tool' },
  lead: { name: 'Lead', icon: '/assets/items/lead.png', type: 'tool' },
  name_tag: { name: 'Name Tag', icon: '/assets/items/name_tag.png', type: 'tool' },
  saddle: { name: 'Saddle', icon: '/assets/items/saddle.png', type: 'tool' },
  oak_boat: { name: 'Oak Boat', icon: '/assets/items/oak_boat.png', type: 'transport' },
  minecart: { name: 'Minecart', icon: '/assets/items/minecart.png', type: 'transport' },
  chest_minecart: { name: 'Minecart with Chest', icon: '/assets/items/chest_minecart.png', type: 'transport' },
  elytra: { name: 'Elytra', icon: '/assets/items/elytra.png', type: 'transport' },
  firework_rocket: { name: 'Firework Rocket', icon: '/assets/items/firework_rocket.png', type: 'utility' },

  // --- Food & Drinks ---
  apple: { name: 'Apple', food: 4, icon: '/assets/items/apple.png', type: 'food' },
  golden_apple: { name: 'Golden Apple', food: 8, icon: '/assets/items/golden_apple.png', type: 'food' },
  bread: { name: 'Bread', food: 5, icon: '/assets/items/bread.png', type: 'food' },
  beef: { name: 'Raw Beef', food: 3, icon: '/assets/items/beef.png', type: 'food' },
  cooked_beef: { name: 'Steak', food: 8, icon: '/assets/items/cooked_beef.png', type: 'food' },
  porkchop: { name: 'Raw Porkchop', food: 3, icon: '/assets/items/porkchop.png', type: 'food' },
  cooked_porkchop: { name: 'Cooked Porkchop', food: 8, icon: '/assets/items/cooked_porkchop.png', type: 'food' },
  salmon: { name: 'Raw Salmon', food: 2, icon: '/assets/items/salmon.png', type: 'food' },
  cooked_salmon: { name: 'Cooked Salmon', food: 6, icon: '/assets/items/cooked_salmon.png', type: 'food' },
  cod: { name: 'Raw Cod', food: 2, icon: '/assets/items/cod.png', type: 'food' },
  cooked_cod: { name: 'Cooked Cod', food: 5, icon: '/assets/items/cooked_cod.png', type: 'food' },
  carrot: { name: 'Carrot', food: 3, icon: '/assets/items/carrot.png', type: 'food' },
  golden_carrot: { name: 'Golden Carrot', food: 6, icon: '/assets/items/golden_carrot.png', type: 'food' },
  potato: { name: 'Potato', food: 1, icon: '/assets/items/potato.png', type: 'food' },
  baked_potato: { name: 'Baked Potato', food: 5, icon: '/assets/items/baked_potato.png', type: 'food' },
  poisonous_potato: { name: 'Poisonous Potato', food: 2, icon: '/assets/items/poisonous_potato.png', type: 'food' },
  beetroot: { name: 'Beetroot', food: 1, icon: '/assets/items/beetroot.png', type: 'food' },
  beetroot_soup: { name: 'Beetroot Soup', food: 6, icon: '/assets/items/beetroot_soup.png', type: 'food' },
  mushroom_stew: { name: 'Mushroom Stew', food: 6, icon: '/assets/items/mushroom_stew.png', type: 'food' },
  cookie: { name: 'Cookie', food: 2, icon: '/assets/items/cookie.png', type: 'food' },
  melon_slice: { name: 'Melon Slice', food: 2, icon: '/assets/items/melon_slice.png', type: 'food' },
  glistering_melon_slice: { name: 'Glistering Melon Slice', icon: '/assets/items/glistering_melon_slice.png', type: 'material' },
  sweet_berries: { name: 'Sweet Berries', food: 2, icon: '/assets/items/sweet_berries.png', type: 'food' },
  glow_berries: { name: 'Glow Berries', food: 2, icon: '/assets/items/glow_berries.png', type: 'food' },
  honey_bottle: { name: 'Honey Bottle', food: 6, icon: '/assets/items/honey_bottle.png', type: 'food' },
  potion: { name: 'Water Bottle / Potion', icon: '/assets/items/potion.png', type: 'food' },
  glass_bottle: { name: 'Glass Bottle', icon: '/assets/items/glass_bottle.png', type: 'material' },

  // --- Ingredients & Materials ---
  coal: { name: 'Coal', icon: '/assets/items/coal.png', type: 'material' },
  charcoal: { name: 'Charcoal', icon: '/assets/items/charcoal.png', type: 'material' },
  iron_ingot: { name: 'Iron Ingot', icon: '/assets/items/iron_ingot.png', type: 'material' },
  gold_ingot: { name: 'Gold Ingot', icon: '/assets/items/gold_ingot.png', type: 'material' },
  copper_ingot: { name: 'Copper Ingot', icon: '/assets/items/copper_ingot.png', type: 'material' },
  netherite_ingot: { name: 'Netherite Ingot', icon: '/assets/items/netherite_ingot.png', type: 'material' },
  diamond: { name: 'Diamond', icon: '/assets/items/diamond.png', type: 'material' },
  emerald: { name: 'Emerald', icon: '/assets/items/emerald.png', type: 'material' },
  redstone: { name: 'Redstone Dust', icon: '/assets/items/redstone.png', type: 'material' },
  lapis_lazuli: { name: 'Lapis Lazuli', icon: '/assets/items/lapis_lazuli.png', type: 'material' },
  quartz: { name: 'Nether Quartz', icon: '/assets/items/quartz.png', type: 'material' },
  amethyst_shard: { name: 'Amethyst Shard', icon: '/assets/items/amethyst_shard.png', type: 'material' },
  glowstone_dust: { name: 'Glowstone Dust', icon: '/assets/items/glowstone_dust.png', type: 'material' },
  stick: { name: 'Stick', icon: '/assets/items/stick.png', type: 'material' },
  string: { name: 'String', icon: '/assets/items/string.png', type: 'material' },
  feather: { name: 'Feather', icon: '/assets/items/feather.png', type: 'material' },
  gunpowder: { name: 'Gunpowder', icon: '/assets/items/gunpowder.png', type: 'material' },
  wheat: { name: 'Wheat', icon: '/assets/items/wheat.png', type: 'material' },
  bone: { name: 'Bone', icon: '/assets/items/bone.png', type: 'material' },
  bone_meal: { name: 'Bone Meal', icon: '/assets/items/bone_meal.png', type: 'material' },
  sugar: { name: 'Sugar', icon: '/assets/items/sugar.png', type: 'material' },
  leather: { name: 'Leather', icon: '/assets/items/leather.png', type: 'material' },
  paper: { name: 'Paper', icon: '/assets/items/paper.png', type: 'material' },
  book: { name: 'Book', icon: '/assets/items/book.png', type: 'material' },
  ender_pearl: { name: 'Ender Pearl', icon: '/assets/items/ender_pearl.png', type: 'material' },
  ender_eye: { name: 'Eye of Ender', icon: '/assets/items/ender_eye.png', type: 'material' },
  blaze_rod: { name: 'Blaze Rod', icon: '/assets/items/blaze_rod.png', type: 'material' },
  blaze_powder: { name: 'Blaze Powder', icon: '/assets/items/blaze_powder.png', type: 'material' },
  magma_cream: { name: 'Magma Cream', icon: '/assets/items/magma_cream.png', type: 'material' },
  slime_ball: { name: 'Slimeball', icon: '/assets/items/slime_ball.png', type: 'material' },
  snowball: { name: 'Snowball', icon: '/assets/items/snowball.png', type: 'projectile' },
  egg: { name: 'Egg', icon: '/assets/items/egg.png', type: 'projectile' },
  fire_charge: { name: 'Fire Charge', icon: '/assets/items/fire_charge.png', type: 'material' },

  // --- Functional / Decorative Items ---
  armor_stand: { name: 'Armor Stand', icon: '/assets/items/armor_stand.png', type: 'utility' },
  item_frame: { name: 'Item Frame', icon: '/assets/items/item_frame.png', type: 'utility' },
  painting: { name: 'Painting', icon: '/assets/items/painting.png', type: 'utility' },
  brewing_stand: { name: 'Brewing Stand', icon: '/assets/items/brewing_stand.png', type: 'utility' },
  cauldron: { name: 'Cauldron', icon: '/assets/items/cauldron.png', type: 'utility' },

  // --- Mob Spawn Eggs ---
  villager_spawn_egg: { name: 'Villager Spawn Egg', icon: '/assets/items/villager_spawn_egg.png', type: 'spawn_egg', mob: 'villager' },
  iron_golem_spawn_egg: { name: 'Iron Golem Spawn Egg', icon: '/assets/items/iron_golem_spawn_egg.png', type: 'spawn_egg', mob: 'iron_golem' },
  pillager_spawn_egg: { name: 'Pillager Spawn Egg', icon: '/assets/items/pillager_spawn_egg.png', type: 'spawn_egg', mob: 'pillager' },
  zombie_spawn_egg: { name: 'Zombie Spawn Egg', icon: '/assets/items/zombie_spawn_egg.png', type: 'spawn_egg', mob: 'zombie' },
  skeleton_spawn_egg: { name: 'Skeleton Spawn Egg', icon: '/assets/items/skeleton_spawn_egg.png', type: 'spawn_egg', mob: 'skeleton' },
  creeper_spawn_egg: { name: 'Creeper Spawn Egg', icon: '/assets/items/creeper_spawn_egg.png', type: 'spawn_egg', mob: 'creeper' },
  pig_spawn_egg: { name: 'Pig Spawn Egg', icon: '/assets/items/pig_spawn_egg.png', type: 'spawn_egg', mob: 'pig' },
  cow_spawn_egg: { name: 'Cow Spawn Egg', icon: '/assets/items/cow_spawn_egg.png', type: 'spawn_egg', mob: 'cow' },
  sheep_spawn_egg: { name: 'Sheep Spawn Egg', icon: '/assets/items/sheep_spawn_egg.png', type: 'spawn_egg', mob: 'sheep' },
  salmon_spawn_egg: { name: 'Salmon Spawn Egg', icon: '/assets/items/salmon_spawn_egg.png', type: 'spawn_egg', mob: 'salmon' },
  dolphin_spawn_egg: { name: 'Dolphin Spawn Egg', icon: '/assets/items/dolphin_spawn_egg.png', type: 'spawn_egg', mob: 'dolphin' },
  octopus_spawn_egg: { name: 'Octopus Spawn Egg', icon: '/assets/items/octopus_spawn_egg.png', type: 'spawn_egg', mob: 'octopus' },
  axolotl_spawn_egg: { name: 'Axolotl Spawn Egg', icon: '/assets/items/axolotl_spawn_egg.png', type: 'spawn_egg', mob: 'axolotl' }
};


BLOCK_DEFS[BLOCKS.REDSTONE_WIRE] = {name: 'Redstone Wire', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: false, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/redstone_wire.svg'};
BLOCK_DEFS[BLOCKS.REDSTONE_BLOCK] = {name: 'Redstone Block', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: true, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/redstone_block.svg'};
BLOCK_DEFS[BLOCKS.REPEATER] = {name: 'Repeater', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: false, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/repeater.svg'};
BLOCK_DEFS[BLOCKS.COMPARATOR] = {name: 'Comparator', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: false, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/comparator.svg'};
BLOCK_DEFS[BLOCKS.OBSERVER] = {name: 'Observer', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: true, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/observer.svg'};
BLOCK_DEFS[BLOCKS.PISTON] = {name: 'Piston', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: true, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/piston.svg'};
BLOCK_DEFS[BLOCKS.STICKY_PISTON] = {name: 'Sticky Piston', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: true, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/sticky_piston.svg'};
BLOCK_DEFS[BLOCKS.PISTON_HEAD] = {name: 'Piston Head', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: true, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/piston_head.svg', internal: true};
BLOCK_DEFS[BLOCKS.SLIME_BLOCK] = {name: 'Slime Block', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: true, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/slime_block.svg'};
BLOCK_DEFS[BLOCKS.HONEY_BLOCK] = {name: 'Honey Block', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: true, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/honey_block.svg'};
BLOCK_DEFS[BLOCKS.STONE_BUTTON] = {name: 'Stone Button', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: false, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/stone_button.svg'};
BLOCK_DEFS[BLOCKS.PRESSURE_PLATE] = {name: 'Pressure Plate', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: false, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/pressure_plate.svg'};
BLOCK_DEFS[BLOCKS.DAYLIGHT_DETECTOR] = {name: 'Daylight Detector', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: false, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/daylight_detector.svg'};
BLOCK_DEFS[BLOCKS.TARGET_BLOCK] = {name: 'Target Block', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: true, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/target_block.svg'};
BLOCK_DEFS[BLOCKS.IRON_DOOR] = {name: 'Iron Door', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: true, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/iron_door.svg'};
BLOCK_DEFS[BLOCKS.IRON_TRAPDOOR] = {name: 'Iron Trapdoor', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: true, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/iron_trapdoor.svg'};
BLOCK_DEFS[BLOCKS.NOTE_BLOCK] = {name: 'Note Block', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: true, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/note_block.svg'};
BLOCK_DEFS[BLOCKS.DISPENSER] = {name: 'Dispenser', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: true, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/dispenser.svg'};
BLOCK_DEFS[BLOCKS.DROPPER] = {name: 'Dropper', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: true, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/dropper.svg'};
BLOCK_DEFS[BLOCKS.HOPPER] = {name: 'Hopper', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: true, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/hopper.svg'};
BLOCK_DEFS[BLOCKS.IRON_DOOR_OPEN] = {name: 'Iron Door Open', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: false, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/iron_door_open.svg', internal: true};
BLOCK_DEFS[BLOCKS.IRON_TRAPDOOR_OPEN] = {name: 'Iron Trapdoor Open', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: false, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/iron_trapdoor_open.svg', internal: true};

BLOCK_DEFS[BLOCKS.REDSTONE_WIRE].drop='redstone';
BLOCK_DEFS[BLOCKS.PISTON_HEAD].drop=null;
BLOCK_DEFS[BLOCKS.IRON_DOOR_OPEN].drop=BLOCKS.IRON_DOOR;
BLOCK_DEFS[BLOCKS.IRON_TRAPDOOR_OPEN].drop=BLOCKS.IRON_TRAPDOOR;
