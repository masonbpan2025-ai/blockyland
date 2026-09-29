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
  DANDELION: 31
};

export const BLOCK_DEFS = {
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
  }
};

// Item definitions
export const ITEMS = {
  diamond_sword: { name: 'Diamond Sword', attack: 7, icon: '/assets/items/diamond_sword.png', type: 'weapon' },
  iron_sword: { name: 'Iron Sword', attack: 6, icon: '/assets/items/iron_sword.png', type: 'weapon' },
  stone_sword: { name: 'Stone Sword', attack: 5, icon: '/assets/items/stone_sword.png', type: 'weapon' },
  wooden_sword: { name: 'Wooden Sword', attack: 4, icon: '/assets/items/wooden_sword.png', type: 'weapon' },
  diamond_pickaxe: { name: 'Diamond Pickaxe', speed: 8, icon: '/assets/items/diamond_pickaxe.png', type: 'tool' },
  iron_pickaxe: { name: 'Iron Pickaxe', speed: 6, icon: '/assets/items/iron_pickaxe.png', type: 'tool' },
  stone_pickaxe: { name: 'Stone Pickaxe', speed: 4, icon: '/assets/items/stone_pickaxe.png', type: 'tool' },
  wooden_pickaxe: { name: 'Wooden Pickaxe', speed: 2, icon: '/assets/items/wooden_pickaxe.png', type: 'tool' },
  stick: { name: 'Stick', icon: '/assets/items/stick.png', type: 'material' },
  coal: { name: 'Coal', icon: '/assets/items/coal.png', type: 'material' },
  iron_ingot: { name: 'Iron Ingot', icon: '/assets/items/iron_ingot.png', type: 'material' },
  gold_ingot: { name: 'Gold Ingot', icon: '/assets/items/gold_ingot.png', type: 'material' },
  diamond: { name: 'Diamond', icon: '/assets/items/diamond.png', type: 'material' },
  emerald: { name: 'Emerald', icon: '/assets/items/emerald.png', type: 'material' },
  bread: { name: 'Bread', food: 5, icon: '/assets/items/bread.png', type: 'food' },
  apple: { name: 'Apple', food: 4, icon: '/assets/items/apple.png', type: 'food' },
  cooked_beef: { name: 'Cooked Beef', food: 8, icon: '/assets/items/cooked_beef.png', type: 'food' },
  wheat: { name: 'Wheat', icon: '/assets/items/wheat.png', type: 'material' },
  bow: { name: 'Bow', icon: '/assets/items/bow.png', type: 'weapon' },
  arrow: { name: 'Arrow', icon: '/assets/items/arrow.png', type: 'projectile' },
  crossbow: { name: 'Crossbow', icon: '/assets/items/crossbow.png', type: 'weapon' },
  totem_of_undying: { name: 'Totem of Undying', icon: '/assets/items/totem_of_undying.png', type: 'special' }
};
