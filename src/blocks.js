// Block IDs and Definitions
//
// Generated content added for vanilla parity lives in ./extraContent.js and is merged in below.
// Keeping it in its own generated module means regenerating never rewrites this hand-maintained
// file, and the additions stay reviewable as a diff.
import { EXTRA_BLOCK_IDS, EXTRA_BLOCK_DEFS } from './extraContent.js';
import { EXTRA_ITEMS } from './extraItems.js';
import { POTION_ITEMS } from './extraPotions.js';

export const BLOCKS = {
  AIR: 0,
  GRASS: 1,
  GRASS_BLOCK: 1,
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
  IRON_TRAPDOOR_OPEN: 79,

  // Biome-specific Blocks
  CHERRY_LOG: 80,
  CHERRY_LEAVES: 81,
  CHERRY_PLANKS: 82,
  BIRCH_LOG: 83,
  BIRCH_LEAVES: 84,
  BIRCH_PLANKS: 85,
  SPRUCE_LOG: 86,
  SPRUCE_LEAVES: 87,
  SPRUCE_PLANKS: 88,
  JUNGLE_LOG: 89,
  JUNGLE_LEAVES: 90,
  JUNGLE_PLANKS: 91,
  ACACIA_LOG: 92,
  ACACIA_LEAVES: 93,
  ACACIA_PLANKS: 94,
  DARK_OAK_LOG: 95,
  DARK_OAK_LEAVES: 96,
  DARK_OAK_PLANKS: 97,
  MANGROVE_LOG: 98,
  MANGROVE_LEAVES: 99,
  MANGROVE_ROOTS: 100,
  MANGROVE_PLANKS: 101,
  MUD: 102,
  PALE_OAK_LOG: 103,
  PALE_OAK_LEAVES: 104,
  PALE_OAK_PLANKS: 105,
  MYCELIUM: 106,
  RED_MUSHROOM_BLOCK: 107,
  BROWN_MUSHROOM_BLOCK: 108,
  MUSHROOM_STEM: 109,
  PODZOL: 110,
  RED_SAND: 111,
  RED_SANDSTONE: 112,
  TERRACOTTA: 113,
  RED_TERRACOTTA: 114,
  ORANGE_TERRACOTTA: 115,
  YELLOW_TERRACOTTA: 116,
  WHITE_TERRACOTTA: 117,
  BROWN_TERRACOTTA: 118,
  PACKED_ICE: 119,
  BLUE_ICE: 120,
  CRIMSON_NYLIUM: 121,
  CRIMSON_STEM: 122,
  NETHER_WART_BLOCK: 123,
  WARPED_NYLIUM: 124,
  WARPED_STEM: 125,
  WARPED_WART_BLOCK: 126,
  SOUL_SOIL: 127,
  BASALT: 128,
  BLACKSTONE: 129,
  MAGMA_BLOCK: 130,
  SCULK: 131,
  SCULK_CATALYST: 132,
  DEEPSLATE: 133,
  MOSS_BLOCK: 134,
  MOSS_CARPET: 135,
  AZALEA_LEAVES: 136,
  DRIPSTONE_BLOCK: 137,
  POINTED_DRIPSTONE: 138,
  SULFUR_BLOCK: 139,
  CALCITE: 140,
  TUFF: 141,
  PRISMARINE: 142,
  PRISMARINE_BRICKS: 143,
  DARK_PRISMARINE: 144,
  BAMBOO: 145,
  SUNFLOWER: 146,
  LILY_PAD: 147,
  CHORUS_PLANT: 148,
  CHORUS_FLOWER: 149,
  COAL_BLOCK: 151,
  SMOOTH_STONE: 152,
  // Rails and wooden doors. 150 is an existing gap; 153+ are fresh.
  RAIL: 153,
  POWERED_RAIL: 154,
  OAK_DOOR: 155,
  OAK_DOOR_OPEN: 156,
  OAK_TRAPDOOR: 157,
  OAK_TRAPDOOR_OPEN: 158,
  RED_BED_FOOT: 159,
  RED_BED_HEAD: 160,
  RED_BED: 159,
  CHEST: 161,

  // Agriculture & Crops
  FARMLAND: 162,
  FARMLAND_MOIST: 163,
  WHEAT_STAGE_0: 164,
  WHEAT_STAGE_1: 165,
  WHEAT_STAGE_2: 166,
  WHEAT_STAGE_3: 167,
  WHEAT_STAGE_4: 168,
  WHEAT_STAGE_5: 169,
  WHEAT_STAGE_6: 170,
  WHEAT_STAGE_7: 171,
  CARROTS_STAGE_0: 172,
  CARROTS_STAGE_1: 173,
  CARROTS_STAGE_2: 174,
  CARROTS_STAGE_3: 175,
  POTATOES_STAGE_0: 176,
  POTATOES_STAGE_1: 177,
  POTATOES_STAGE_2: 178,
  POTATOES_STAGE_3: 179,
  WHEAT: 171,
  CARROTS: 175,
  NETHER_PORTAL: 180,
  SCULK_SENSOR: 181,
  SCULK_SHRIEKER: 182,
  DRAGON_EGG: 183,
  END_PORTAL: 184,
  WITHER_SKELETON_SKULL_BLOCK: 185,
  TRIPWIRE_HOOK: 186,
  TRIPWIRE: 187,
  OAK_DOOR_TOP: 188,
  OAK_DOOR_TOP_OPEN: 189,
  IRON_DOOR_TOP: 190,
  IRON_DOOR_TOP_OPEN: 191,

  // Workstation Blocks (13 Professions)
  BLAST_FURNACE: 192,
  SMOKER: 193,
  CARTOGRAPHY_TABLE: 194,
  BREWING_STAND: 195,
  COMPOSTER: 196,
  BARREL: 197,
  FLETCHING_TABLE: 198,
  CAULDRON: 199,
  LECTERN: 200,
  STONECUTTER: 201,
  LOOM: 202,
  SMITHING_TABLE: 203,
  GRINDSTONE: 204,

  // Functional Workstations & Energy Blocks
  ANVIL: 205,
  CHIPPED_ANVIL: 206,
  DAMAGED_ANVIL: 207,
  BEACON: 208,
  CONDUIT: 209,

  // Mineral Storage Blocks (Beacon Bases)
  IRON_BLOCK: 210,
  GOLD_BLOCK: 211,
  DIAMOND_BLOCK: 212,
  EMERALD_BLOCK: 213,
  NETHERITE_BLOCK: 214,
  CRYING_OBSIDIAN: 215,
  WARPED_FUNGUS: 216,
  CRIMSON_FUNGUS: 217,
  RESPAWN_ANCHOR: 218,
  NETHER_BRICKS: 219,
  POWDER_SNOW: 221,
  DRIED_GHAST: 220,

  // Cobbled deepslate. Its slab, stair and wall variants, its smelting source (deepslate) and its
  // blast resistance were already in the registry and the generated harvest table, but the base block
  // itself was never registered, so BLOCKS.COBBLED_DEEPSLATE read undefined. The id sits above the
  // generated range: scripts/generate-content-expansion.mjs allocates max(ids)+1, so a generated block
  // never collides with it.
  COBBLED_DEEPSLATE: 946,

  // --- Ores, first block-parity batch ---------------------------------------------------------
  //
  // Twelve ore blocks that were absent while their harvest rows and their drops already existed in
  // the generated tables. All are plain full cubes with an `all` texture, so they need no geometry.
  //
  // Ids 947+ because 222-945 is the generated range and 946 is cobbled deepslate; the collision guard
  // at the bottom of this file turns a mistake here into a loud failure rather than a wrong block.
  DEEPSLATE_COAL_ORE: 947,
  DEEPSLATE_IRON_ORE: 948,
  DEEPSLATE_GOLD_ORE: 949,
  DEEPSLATE_DIAMOND_ORE: 950,
  DEEPSLATE_EMERALD_ORE: 951,
  DEEPSLATE_REDSTONE_ORE: 952,
  DEEPSLATE_LAPIS_ORE: 953,
  DEEPSLATE_COPPER_ORE: 954,
  COPPER_ORE: 955,
  LAPIS_ORE: 956,
  NETHER_GOLD_ORE: 957,
  NETHER_QUARTZ_ORE: 958,

  // --- Saplings, second block-parity batch ------------------------------------------------------
  //
  // Eight tree saplings plus the mangrove propagule. All render as the existing cross-quad plant
  // model, so like the ores they need no new geometry -- only data plus a texture.
  //
  // `_sapling` and `_propagule` are in the generator's NOT_A_CUBE exclusion list, so it never emitted
  // these; that is why they were absent despite the wood types themselves existing.
  OAK_SAPLING: 959,
  SPRUCE_SAPLING: 960,
  BIRCH_SAPLING: 961,
  JUNGLE_SAPLING: 962,
  ACACIA_SAPLING: 963,
  CHERRY_SAPLING: 964,
  DARK_OAK_SAPLING: 965,
  PALE_OAK_SAPLING: 966,
  MANGROVE_PROPAGULE: 967,

  // --- Infested stone, third block-parity batch -------------------------------------------------
  //
  // The silverfish egg blocks. Vanilla gives them no textures of their own: each is drawn with the
  // texture of the block it imitates, which is the whole point of the block. So the entries below
  // reuse their base block's texture rather than naming a file that does not exist upstream.
  INFESTED_STONE: 968,
  INFESTED_COBBLESTONE: 969,
  INFESTED_STONE_BRICKS: 970,
  INFESTED_MOSSY_STONE_BRICKS: 971,
  INFESTED_CRACKED_STONE_BRICKS: 972,
  INFESTED_CHISELED_STONE_BRICKS: 973,
  INFESTED_DEEPSLATE: 974,

  // --- Resin, fourth block-parity batch ----------------------------------------------------------
  //
  // The four resin blocks. Their slab, stair and wall variants already existed and pointed at a
  // texture named resin_brick.png, which does not exist upstream -- the real file is resin_bricks.png.
  // Registering the base blocks is what makes that visible, and the three variants are corrected below.
  RESIN_CLUMP: 975,
  RESIN_BLOCK: 976,
  RESIN_BRICKS: 977,
  CHISELED_RESIN_BRICKS: 978
};

export const BLOCK_DEFS = {
  [BLOCKS.POWDER_SNOW]: {name:'Powder Snow',hardness:.25,solid:false,transparent:true,sound:'snow',drop:BLOCKS.POWDER_SNOW,textures:{all:'snow.png'}},
  [BLOCKS.DRIED_GHAST]: { name: 'Dried Ghast', hardness: 0, sound: 'stone', drop: BLOCKS.DRIED_GHAST, textures: { all: 'dried_ghast.svg' } },
  [BLOCKS.NETHER_BRICKS]: { name: 'Nether Bricks', hardness: 2, sound: 'stone', drop: BLOCKS.NETHER_BRICKS, textures: { all: 'nether_bricks.svg' } },
  [BLOCKS.CRYING_OBSIDIAN]: { name: 'Crying Obsidian', hardness: 50, sound: 'stone', light: 10, lightColor: 0x9326ed, drop: BLOCKS.CRYING_OBSIDIAN, textures: { all: 'crying_obsidian.svg' } },
  [BLOCKS.WARPED_FUNGUS]: { name: 'Warped Fungus', hardness: 0, sound: 'grass', solid: false, transparent: true, plant: true, shape: 'cross', drop: BLOCKS.WARPED_FUNGUS, textures: { all: 'warped_fungus.svg' } },
  [BLOCKS.CRIMSON_FUNGUS]: { name: 'Crimson Fungus', hardness: 0, sound: 'grass', solid: false, transparent: true, plant: true, shape: 'cross', drop: BLOCKS.CRIMSON_FUNGUS, textures: { all: 'crimson_fungus.svg' } },
  [BLOCKS.RESPAWN_ANCHOR]: { name: 'Respawn Anchor', hardness: 50, sound: 'stone', drop: BLOCKS.RESPAWN_ANCHOR, textures: { all: 'respawn_anchor.svg' } },
  [BLOCKS.FIRE]: {
    name: 'Fire', hardness: 0, sound: 'wool', light: 15,
    lightColor: 0xff8833, shape: 'cross', transparent: true, solid: false, plant: true,
    // fire.png is not shipped; using the SVG keeps the atlas lookup from
    // falling back to the gray placeholder tile.
    drop: null, textures: { all: 'fire.svg' }
  },
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
  // --- Ores, first block-parity batch ---------------------------------------------------------
  //
  // `dropItem` is what actually spawns on break: getBlockDrop() reads it and ignores the harvest
  // table's `drops`, which only gates WHETHER a drop happens. So each entry has to name its drop
  // explicitly, which is why the deepslate ores repeat what blockHarvestData.js already declares.
  //
  // Hardness matches the generated harvest row (deepslate ores 4.5, surface ores 3) so the two tables
  // agree rather than the harvest row silently overriding a different number here.
  [BLOCKS.DEEPSLATE_COAL_ORE]: { name: 'Deepslate Coal Ore', hardness: 4.5, sound: 'stone', dropItem: 'coal', textures: { all: 'deepslate_coal_ore.png' } },
  [BLOCKS.DEEPSLATE_IRON_ORE]: { name: 'Deepslate Iron Ore', hardness: 4.5, sound: 'stone', dropItem: 'raw_iron', textures: { all: 'deepslate_iron_ore.png' } },
  [BLOCKS.DEEPSLATE_GOLD_ORE]: { name: 'Deepslate Gold Ore', hardness: 4.5, sound: 'stone', dropItem: 'raw_gold', textures: { all: 'deepslate_gold_ore.png' } },
  [BLOCKS.DEEPSLATE_DIAMOND_ORE]: { name: 'Deepslate Diamond Ore', hardness: 4.5, sound: 'stone', dropItem: 'diamond', textures: { all: 'deepslate_diamond_ore.png' } },
  [BLOCKS.DEEPSLATE_EMERALD_ORE]: { name: 'Deepslate Emerald Ore', hardness: 4.5, sound: 'stone', dropItem: 'emerald', textures: { all: 'deepslate_emerald_ore.png' } },
  // Redstone drops one item per break here, as the existing surface Redstone Ore does; vanilla's 4-5
  // dust roll is a separate mechanic this game has not modelled for any ore.
  [BLOCKS.DEEPSLATE_REDSTONE_ORE]: { name: 'Deepslate Redstone Ore', hardness: 4.5, sound: 'stone', dropItem: 'redstone', textures: { all: 'deepslate_redstone_ore.png' } },
  [BLOCKS.DEEPSLATE_LAPIS_ORE]: { name: 'Deepslate Lapis Lazuli Ore', hardness: 4.5, sound: 'stone', dropItem: 'lapis_lazuli', textures: { all: 'deepslate_lapis_ore.png' } },
  [BLOCKS.DEEPSLATE_COPPER_ORE]: { name: 'Deepslate Copper Ore', hardness: 4.5, sound: 'stone', dropItem: 'raw_copper', textures: { all: 'deepslate_copper_ore.png' } },
  [BLOCKS.COPPER_ORE]: { name: 'Copper Ore', hardness: 3.0, sound: 'stone', dropItem: 'raw_copper', textures: { all: 'copper_ore.png' } },
  [BLOCKS.LAPIS_ORE]: { name: 'Lapis Lazuli Ore', hardness: 3.0, sound: 'stone', dropItem: 'lapis_lazuli', textures: { all: 'lapis_ore.png' } },
  // Nether gold ore drops nuggets, not the ore and not an ingot.
  [BLOCKS.NETHER_GOLD_ORE]: { name: 'Nether Gold Ore', hardness: 3.0, sound: 'stone', dropItem: 'gold_nugget', textures: { all: 'nether_gold_ore.png' } },
  [BLOCKS.NETHER_QUARTZ_ORE]: { name: 'Nether Quartz Ore', hardness: 3.0, sound: 'stone', dropItem: 'quartz', textures: { all: 'nether_quartz_ore.png' } },
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
  // --- Saplings, second block-parity batch ------------------------------------------------------
  //
  // A sapling is a cross-quad plant exactly like a flower: hardness 0, no collision (`solid: false`)
  // so it does not block movement, `transparent` so it does not occlude, and `drop` itself so breaking
  // it returns the sapling. It is a block rather than a `dropItem` because the held item is the block.
  //
  // Vanilla would grow these into trees on a random tick. This game has no random-tick layer, so a
  // sapling is decorative for now -- which is also why the block is worth adding: it is the item the
  // recipe and loot tables already expect to exist, and its absence was a phantom id.
  [BLOCKS.OAK_SAPLING]: { name: 'Oak Sapling', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, drop: BLOCKS.OAK_SAPLING, textures: { all: 'oak_sapling.png' } },
  [BLOCKS.SPRUCE_SAPLING]: { name: 'Spruce Sapling', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, drop: BLOCKS.SPRUCE_SAPLING, textures: { all: 'spruce_sapling.png' } },
  [BLOCKS.BIRCH_SAPLING]: { name: 'Birch Sapling', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, drop: BLOCKS.BIRCH_SAPLING, textures: { all: 'birch_sapling.png' } },
  [BLOCKS.JUNGLE_SAPLING]: { name: 'Jungle Sapling', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, drop: BLOCKS.JUNGLE_SAPLING, textures: { all: 'jungle_sapling.png' } },
  [BLOCKS.ACACIA_SAPLING]: { name: 'Acacia Sapling', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, drop: BLOCKS.ACACIA_SAPLING, textures: { all: 'acacia_sapling.png' } },
  [BLOCKS.CHERRY_SAPLING]: { name: 'Cherry Sapling', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, drop: BLOCKS.CHERRY_SAPLING, textures: { all: 'cherry_sapling.png' } },
  [BLOCKS.DARK_OAK_SAPLING]: { name: 'Dark Oak Sapling', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, drop: BLOCKS.DARK_OAK_SAPLING, textures: { all: 'dark_oak_sapling.png' } },
  [BLOCKS.PALE_OAK_SAPLING]: { name: 'Pale Oak Sapling', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, drop: BLOCKS.PALE_OAK_SAPLING, textures: { all: 'pale_oak_sapling.png' } },
  // The propagule is the mangrove's sapling and hangs as well as stands; the upright form is what is
  // registered here, matching how vanilla itemises it.
  [BLOCKS.MANGROVE_PROPAGULE]: { name: 'Mangrove Propagule', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, drop: BLOCKS.MANGROVE_PROPAGULE, textures: { all: 'mangrove_propagule.png' } },

  // --- Infested stone, third block-parity batch -------------------------------------------------
  //
  // `drop: null` because vanilla infested blocks drop NOTHING when mined, even with the right tool --
  // the pay-off for breaking one is the silverfish, not the block. The generated harvest table agrees
  // (an empty drops array for each), and getBlockDrop() reads `drop`, so naming null here is what
  // makes that true on the mining path.
  //
  // `silverfish: true` is read by the break handler to spawn the mob. Vanilla also keeps the block
  // intact under Silk Touch; this game models no Silk Touch drops, so that half is not simulated and
  // breaking one always releases the silverfish.
  //
  // Hardness follows the harvest table (0.75, and 1.5 for deepslate) rather than the block being
  // imitated -- an infested block is deliberately faster to break than the real one.
  [BLOCKS.INFESTED_STONE]: { name: 'Infested Stone', hardness: 0.75, sound: 'stone', drop: null, silverfish: true, textures: { all: 'stone.png' } },
  [BLOCKS.INFESTED_COBBLESTONE]: { name: 'Infested Cobblestone', hardness: 1.0, sound: 'stone', drop: null, silverfish: true, textures: { all: 'cobblestone.png' } },
  [BLOCKS.INFESTED_STONE_BRICKS]: { name: 'Infested Stone Bricks', hardness: 0.75, sound: 'stone', drop: null, silverfish: true, textures: { all: 'stone_bricks.png' } },
  [BLOCKS.INFESTED_MOSSY_STONE_BRICKS]: { name: 'Infested Mossy Stone Bricks', hardness: 0.75, sound: 'stone', drop: null, silverfish: true, textures: { all: 'mossy_stone_bricks.png' } },
  [BLOCKS.INFESTED_CRACKED_STONE_BRICKS]: { name: 'Infested Cracked Stone Bricks', hardness: 0.75, sound: 'stone', drop: null, silverfish: true, textures: { all: 'cracked_stone_bricks.png' } },
  [BLOCKS.INFESTED_CHISELED_STONE_BRICKS]: { name: 'Infested Chiseled Stone Bricks', hardness: 0.75, sound: 'stone', drop: null, silverfish: true, textures: { all: 'chiseled_stone_bricks.png' } },
  [BLOCKS.INFESTED_DEEPSLATE]: { name: 'Infested Deepslate', hardness: 1.5, sound: 'stone', drop: null, silverfish: true, textures: { side: 'deepslate.png', top: 'deepslate_top.png', bottom: 'deepslate_top.png' } },

  // --- Resin, fourth block-parity batch ----------------------------------------------------------
  //
  // Hardness follows the generated harvest table: the resin block and clump are 0 (instant to break),
  // the two brick forms are 1.5 and need a pickaxe.
  //
  // The resin block's resistance is 0 in the harvest data, which makes it one of the most explosive
  // blocks in the registry -- deliberate, since vanilla resin is soft.
  [BLOCKS.RESIN_CLUMP]: { name: 'Resin Clump', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, drop: BLOCKS.RESIN_CLUMP, textures: { all: 'resin_clump.png' } },
  [BLOCKS.RESIN_BLOCK]: { name: 'Resin Block', hardness: 0.0, sound: 'wood', drop: BLOCKS.RESIN_BLOCK, textures: { all: 'resin_block.png' } },
  [BLOCKS.RESIN_BRICKS]: { name: 'Resin Bricks', hardness: 1.5, sound: 'stone', drop: BLOCKS.RESIN_BRICKS, textures: { all: 'resin_bricks.png' } },
  [BLOCKS.CHISELED_RESIN_BRICKS]: { name: 'Chiseled Resin Bricks', hardness: 1.5, sound: 'stone', drop: BLOCKS.CHISELED_RESIN_BRICKS, textures: { all: 'chiseled_resin_bricks.png' } },
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
      side: 'enchanting_table_side.png',
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
  },

  // Wood variants
  [BLOCKS.CHERRY_LOG]: { name: 'Cherry Log', hardness: 2.0, sound: 'wood', drop: BLOCKS.CHERRY_LOG, textures: { side: 'cherry_log.png', top: 'cherry_log_top.png', bottom: 'cherry_log_top.png' } },
  [BLOCKS.CHERRY_LEAVES]: { name: 'Cherry Leaves', hardness: 0.2, sound: 'grass', transparent: true, solid: true, drop: BLOCKS.CHERRY_LEAVES, textures: { all: 'cherry_leaves.png' } },
  [BLOCKS.CHERRY_PLANKS]: { name: 'Cherry Planks', hardness: 2.0, sound: 'wood', drop: BLOCKS.CHERRY_PLANKS, textures: { all: 'cherry_planks.png' } },

  [BLOCKS.BIRCH_LOG]: { name: 'Birch Log', hardness: 2.0, sound: 'wood', drop: BLOCKS.BIRCH_LOG, textures: { side: 'birch_log.png', top: 'birch_log_top.png', bottom: 'birch_log_top.png' } },
  [BLOCKS.BIRCH_LEAVES]: { name: 'Birch Leaves', hardness: 0.2, sound: 'grass', transparent: true, solid: true, drop: BLOCKS.BIRCH_LEAVES, textures: { all: 'birch_leaves.png' } },
  [BLOCKS.BIRCH_PLANKS]: { name: 'Birch Planks', hardness: 2.0, sound: 'wood', drop: BLOCKS.BIRCH_PLANKS, textures: { all: 'birch_planks.png' } },

  [BLOCKS.SPRUCE_LOG]: { name: 'Spruce Log', hardness: 2.0, sound: 'wood', drop: BLOCKS.SPRUCE_LOG, textures: { side: 'spruce_log.png', top: 'spruce_log_top.png', bottom: 'spruce_log_top.png' } },
  [BLOCKS.SPRUCE_LEAVES]: { name: 'Spruce Leaves', hardness: 0.2, sound: 'grass', transparent: true, solid: true, drop: BLOCKS.SPRUCE_LEAVES, textures: { all: 'spruce_leaves.png' } },
  [BLOCKS.SPRUCE_PLANKS]: { name: 'Spruce Planks', hardness: 2.0, sound: 'wood', drop: BLOCKS.SPRUCE_PLANKS, textures: { all: 'spruce_planks.png' } },

  [BLOCKS.JUNGLE_LOG]: { name: 'Jungle Log', hardness: 2.0, sound: 'wood', drop: BLOCKS.JUNGLE_LOG, textures: { side: 'jungle_log.png', top: 'jungle_log_top.png', bottom: 'jungle_log_top.png' } },
  [BLOCKS.JUNGLE_LEAVES]: { name: 'Jungle Leaves', hardness: 0.2, sound: 'grass', transparent: true, solid: true, drop: BLOCKS.JUNGLE_LEAVES, textures: { all: 'jungle_leaves.png' } },
  [BLOCKS.JUNGLE_PLANKS]: { name: 'Jungle Planks', hardness: 2.0, sound: 'wood', drop: BLOCKS.JUNGLE_PLANKS, textures: { all: 'jungle_planks.png' } },

  [BLOCKS.ACACIA_LOG]: { name: 'Acacia Log', hardness: 2.0, sound: 'wood', drop: BLOCKS.ACACIA_LOG, textures: { side: 'acacia_log.png', top: 'acacia_log_top.png', bottom: 'acacia_log_top.png' } },
  [BLOCKS.ACACIA_LEAVES]: { name: 'Acacia Leaves', hardness: 0.2, sound: 'grass', transparent: true, solid: true, drop: BLOCKS.ACACIA_LEAVES, textures: { all: 'acacia_leaves.png' } },
  [BLOCKS.ACACIA_PLANKS]: { name: 'Acacia Planks', hardness: 2.0, sound: 'wood', drop: BLOCKS.ACACIA_PLANKS, textures: { all: 'acacia_planks.png' } },

  [BLOCKS.DARK_OAK_LOG]: { name: 'Dark Oak Log', hardness: 2.0, sound: 'wood', drop: BLOCKS.DARK_OAK_LOG, textures: { side: 'dark_oak_log.png', top: 'dark_oak_log_top.png', bottom: 'dark_oak_log_top.png' } },
  [BLOCKS.DARK_OAK_LEAVES]: { name: 'Dark Oak Leaves', hardness: 0.2, sound: 'grass', transparent: true, solid: true, drop: BLOCKS.DARK_OAK_LEAVES, textures: { all: 'dark_oak_leaves.png' } },
  [BLOCKS.DARK_OAK_PLANKS]: { name: 'Dark Oak Planks', hardness: 2.0, sound: 'wood', drop: BLOCKS.DARK_OAK_PLANKS, textures: { all: 'dark_oak_planks.png' } },

  [BLOCKS.MANGROVE_LOG]: { name: 'Mangrove Log', hardness: 2.0, sound: 'wood', drop: BLOCKS.MANGROVE_LOG, textures: { side: 'mangrove_log.png', top: 'mangrove_log_top.png', bottom: 'mangrove_log_top.png' } },
  [BLOCKS.MANGROVE_LEAVES]: { name: 'Mangrove Leaves', hardness: 0.2, sound: 'grass', transparent: true, solid: true, drop: BLOCKS.MANGROVE_LEAVES, textures: { all: 'mangrove_leaves.png' } },
  [BLOCKS.MANGROVE_ROOTS]: { name: 'Mangrove Roots', hardness: 0.7, sound: 'wood', transparent: true, solid: true, drop: BLOCKS.MANGROVE_ROOTS, textures: { all: 'mangrove_roots.png' } },
  [BLOCKS.MANGROVE_PLANKS]: { name: 'Mangrove Planks', hardness: 2.0, sound: 'wood', drop: BLOCKS.MANGROVE_PLANKS, textures: { all: 'mangrove_planks.png' } },
  [BLOCKS.MUD]: { name: 'Mud', hardness: 0.5, sound: 'gravel', drop: BLOCKS.MUD, textures: { all: 'mud.png' } },

  [BLOCKS.PALE_OAK_LOG]: { name: 'Pale Oak Log', hardness: 2.0, sound: 'wood', drop: BLOCKS.PALE_OAK_LOG, textures: { side: 'pale_oak_log.png', top: 'pale_oak_log_top.png', bottom: 'pale_oak_log_top.png' } },
  [BLOCKS.PALE_OAK_LEAVES]: { name: 'Pale Oak Leaves', hardness: 0.2, sound: 'grass', transparent: true, solid: true, drop: BLOCKS.PALE_OAK_LEAVES, textures: { all: 'pale_oak_leaves.png' } },
  [BLOCKS.PALE_OAK_PLANKS]: { name: 'Pale Oak Planks', hardness: 2.0, sound: 'wood', drop: BLOCKS.PALE_OAK_PLANKS, textures: { all: 'pale_oak_planks.png' } },

  // Soil & Terrain
  [BLOCKS.MYCELIUM]: { name: 'Mycelium', hardness: 0.6, sound: 'grass', drop: BLOCKS.DIRT, textures: { top: 'mycelium_top.png', side: 'mycelium_side.png', bottom: 'dirt.png' } },
  [BLOCKS.PODZOL]: { name: 'Podzol', hardness: 0.5, sound: 'gravel', drop: BLOCKS.DIRT, textures: { top: 'podzol_top.png', side: 'podzol_side.png', bottom: 'dirt.png' } },
  [BLOCKS.RED_SAND]: { name: 'Red Sand', hardness: 0.5, sound: 'sand', drop: BLOCKS.RED_SAND, textures: { all: 'red_sand.png' } },
  [BLOCKS.RED_SANDSTONE]: { name: 'Red Sandstone', hardness: 0.8, sound: 'stone', drop: BLOCKS.RED_SANDSTONE, textures: { side: 'red_sandstone.png', top: 'red_sandstone_top.png', bottom: 'red_sandstone_bottom.png' } },
  [BLOCKS.TERRACOTTA]: { name: 'Terracotta', hardness: 1.25, sound: 'stone', drop: BLOCKS.TERRACOTTA, textures: { all: 'terracotta.png' } },
  [BLOCKS.RED_TERRACOTTA]: { name: 'Red Terracotta', hardness: 1.25, sound: 'stone', drop: BLOCKS.RED_TERRACOTTA, textures: { all: 'red_terracotta.png' } },
  [BLOCKS.ORANGE_TERRACOTTA]: { name: 'Orange Terracotta', hardness: 1.25, sound: 'stone', drop: BLOCKS.ORANGE_TERRACOTTA, textures: { all: 'orange_terracotta.png' } },
  [BLOCKS.YELLOW_TERRACOTTA]: { name: 'Yellow Terracotta', hardness: 1.25, sound: 'stone', drop: BLOCKS.YELLOW_TERRACOTTA, textures: { all: 'yellow_terracotta.png' } },
  [BLOCKS.WHITE_TERRACOTTA]: { name: 'White Terracotta', hardness: 1.25, sound: 'stone', drop: BLOCKS.WHITE_TERRACOTTA, textures: { all: 'white_terracotta.png' } },
  [BLOCKS.BROWN_TERRACOTTA]: { name: 'Brown Terracotta', hardness: 1.25, sound: 'stone', drop: BLOCKS.BROWN_TERRACOTTA, textures: { all: 'brown_terracotta.png' } },

  // Ice & Frozen
  [BLOCKS.PACKED_ICE]: { name: 'Packed Ice', hardness: 0.5, sound: 'stone', drop: BLOCKS.PACKED_ICE, textures: { all: 'packed_ice.png' } },
  [BLOCKS.BLUE_ICE]: { name: 'Blue Ice', hardness: 2.8, sound: 'stone', drop: BLOCKS.BLUE_ICE, textures: { all: 'blue_ice.png' } },

  // Mushrooms
  [BLOCKS.RED_MUSHROOM_BLOCK]: { name: 'Red Mushroom Block', hardness: 0.2, sound: 'wood', drop: BLOCKS.RED_MUSHROOM_BLOCK, textures: { all: 'red_mushroom_block.png' } },
  [BLOCKS.BROWN_MUSHROOM_BLOCK]: { name: 'Brown Mushroom Block', hardness: 0.2, sound: 'wood', drop: BLOCKS.BROWN_MUSHROOM_BLOCK, textures: { all: 'brown_mushroom_block.png' } },
  [BLOCKS.MUSHROOM_STEM]: { name: 'Mushroom Stem', hardness: 0.2, sound: 'wood', drop: BLOCKS.MUSHROOM_STEM, textures: { all: 'mushroom_stem.png' } },

  // Nether Biome Blocks
  [BLOCKS.CRIMSON_NYLIUM]: { name: 'Crimson Nylium', hardness: 1.0, sound: 'stone', drop: BLOCKS.NETHERRACK, textures: { top: 'crimson_nylium.png', side: 'crimson_nylium_side.png', bottom: 'netherrack.png' } },
  [BLOCKS.CRIMSON_STEM]: { name: 'Crimson Stem', hardness: 2.0, sound: 'wood', drop: BLOCKS.CRIMSON_STEM, textures: { side: 'crimson_stem.png', top: 'crimson_stem_top.png', bottom: 'crimson_stem_top.png' } },
  [BLOCKS.NETHER_WART_BLOCK]: { name: 'Nether Wart Block', hardness: 1.0, sound: 'wood', drop: BLOCKS.NETHER_WART_BLOCK, textures: { all: 'nether_wart_block.png' } },
  [BLOCKS.WARPED_NYLIUM]: { name: 'Warped Nylium', hardness: 1.0, sound: 'stone', drop: BLOCKS.NETHERRACK, textures: { top: 'warped_nylium.png', side: 'warped_nylium_side.png', bottom: 'netherrack.png' } },
  [BLOCKS.WARPED_STEM]: { name: 'Warped Stem', hardness: 2.0, sound: 'wood', drop: BLOCKS.WARPED_STEM, textures: { side: 'warped_stem.png', top: 'warped_stem_top.png', bottom: 'warped_stem_top.png' } },
  [BLOCKS.WARPED_WART_BLOCK]: { name: 'Warped Wart Block', hardness: 1.0, sound: 'wood', drop: BLOCKS.WARPED_WART_BLOCK, textures: { all: 'warped_wart_block.png' } },
  [BLOCKS.SOUL_SOIL]: { name: 'Soul Soil', hardness: 0.5, sound: 'gravel', drop: BLOCKS.SOUL_SOIL, textures: { all: 'soul_soil.png' } },
  [BLOCKS.BASALT]: { name: 'Basalt', hardness: 1.25, sound: 'stone', drop: BLOCKS.BASALT, textures: { side: 'basalt_side.png', top: 'basalt_top.png', bottom: 'basalt_top.png' } },
  [BLOCKS.BLACKSTONE]: { name: 'Blackstone', hardness: 1.5, sound: 'stone', drop: BLOCKS.BLACKSTONE, textures: { side: 'blackstone.png', top: 'blackstone_top.png', bottom: 'blackstone_top.png' } },
  [BLOCKS.MAGMA_BLOCK]: { name: 'Magma Block', hardness: 0.5, sound: 'stone', light: 3, lightColor: 0xff6600, drop: BLOCKS.MAGMA_BLOCK, textures: { all: 'magma.png' } },

  // Cave & Underground Blocks
  [BLOCKS.SCULK]: { name: 'Sculk', hardness: 0.6, sound: 'grass', drop: BLOCKS.SCULK, textures: { all: 'sculk.png' } },
  [BLOCKS.SCULK_CATALYST]: { name: 'Sculk Catalyst', hardness: 3.0, sound: 'stone', light: 6, lightColor: 0x06b6d4, drop: BLOCKS.SCULK_CATALYST, textures: { side: 'sculk_catalyst_side.png', top: 'sculk_catalyst_top.png', bottom: 'sculk_catalyst_bottom.png' } },
  [BLOCKS.DEEPSLATE]: { name: 'Deepslate', hardness: 3.0, sound: 'stone', drop: BLOCKS.COBBLED_DEEPSLATE, textures: { side: 'deepslate.png', top: 'deepslate_top.png', bottom: 'deepslate_top.png' } },
  // Vanilla: deepslate drops cobbled deepslate when mined without Silk Touch. The drop above used to
  // point at COBBLESTONE, which was only ever a workaround for COBBLED_DEEPSLATE not existing.
  [BLOCKS.COBBLED_DEEPSLATE]: { name: 'Cobbled Deepslate', hardness: 3.5, sound: 'stone', drop: BLOCKS.COBBLED_DEEPSLATE, textures: { all: 'cobbled_deepslate.png' } },
  [BLOCKS.MOSS_BLOCK]: { name: 'Moss Block', hardness: 0.1, sound: 'grass', drop: BLOCKS.MOSS_BLOCK, textures: { all: 'moss_block.png' } },
  [BLOCKS.MOSS_CARPET]: { name: 'Moss Carpet', hardness: 0.1, sound: 'grass', transparent: true, solid: false, drop: BLOCKS.MOSS_CARPET, textures: { all: 'moss_block.png' } },
  [BLOCKS.AZALEA_LEAVES]: { name: 'Azalea Leaves', hardness: 0.2, sound: 'grass', transparent: true, solid: true, drop: BLOCKS.AZALEA_LEAVES, textures: { all: 'azalea_leaves.png' } },
  [BLOCKS.DRIPSTONE_BLOCK]: { name: 'Dripstone Block', hardness: 1.5, sound: 'stone', drop: BLOCKS.DRIPSTONE_BLOCK, textures: { all: 'dripstone_block.png' } },
  [BLOCKS.POINTED_DRIPSTONE]: { name: 'Pointed Dripstone', hardness: 1.5, sound: 'stone', transparent: true, solid: false, drop: BLOCKS.POINTED_DRIPSTONE, textures: { all: 'pointed_dripstone.png' } },
  [BLOCKS.SULFUR_BLOCK]: { name: 'Sulfur Block', hardness: 1.5, sound: 'stone', drop: BLOCKS.SULFUR_BLOCK, textures: { all: 'sulfur_block.png' } },
  [BLOCKS.CALCITE]: { name: 'Calcite', hardness: 0.75, sound: 'stone', drop: BLOCKS.CALCITE, textures: { all: 'calcite.png' } },
  [BLOCKS.TUFF]: { name: 'Tuff', hardness: 1.5, sound: 'stone', drop: BLOCKS.TUFF, textures: { all: 'tuff.png' } },

  // Ocean Monument
  [BLOCKS.PRISMARINE]: { name: 'Prismarine', hardness: 1.5, sound: 'stone', drop: BLOCKS.PRISMARINE, textures: { all: 'prismarine.png' } },
  [BLOCKS.PRISMARINE_BRICKS]: { name: 'Prismarine Bricks', hardness: 1.5, sound: 'stone', drop: BLOCKS.PRISMARINE_BRICKS, textures: { all: 'prismarine_bricks.png' } },
  [BLOCKS.DARK_PRISMARINE]: { name: 'Dark Prismarine', hardness: 1.5, sound: 'stone', drop: BLOCKS.DARK_PRISMARINE, textures: { all: 'dark_prismarine.png' } },

  // Plants & Flowers
  [BLOCKS.BAMBOO]: { name: 'Bamboo', hardness: 1.0, sound: 'wood', transparent: true, solid: false, plant: true, drop: BLOCKS.BAMBOO, textures: { all: 'bamboo.png' } },
  [BLOCKS.SUNFLOWER]: { name: 'Sunflower', hardness: 0, sound: 'grass', transparent: true, solid: false, plant: true, drop: BLOCKS.SUNFLOWER, textures: { all: 'sunflower.png' } },
  [BLOCKS.LILY_PAD]: { name: 'Lily Pad', hardness: 0, sound: 'grass', transparent: true, solid: false, plant: true, drop: BLOCKS.LILY_PAD, textures: { all: 'lily_pad.png' } },
  [BLOCKS.CHORUS_PLANT]: { name: 'Chorus Plant', hardness: 0.4, sound: 'wood', drop: BLOCKS.CHORUS_PLANT, textures: { all: 'chorus_plant.png' } },
  [BLOCKS.CHORUS_FLOWER]: { name: 'Chorus Flower', hardness: 0.4, sound: 'wood', drop: BLOCKS.CHORUS_FLOWER, textures: { all: 'chorus_flower.png' } },
  [BLOCKS.COAL_BLOCK]: { name: 'Block of Coal', hardness: 5.0, sound: 'stone', drop: BLOCKS.COAL_BLOCK, textures: { all: 'coal_block.png' } },
  [BLOCKS.SMOOTH_STONE]: { name: 'Smooth Stone', hardness: 2.0, sound: 'stone', drop: BLOCKS.SMOOTH_STONE, textures: { top: 'smooth_stone.png', side: 'smooth_stone.png', bottom: 'smooth_stone.png' } },

  // --- Agriculture & Farmland ---
  [BLOCKS.FARMLAND]: {
    name: 'Farmland',
    hardness: 0.6,
    sound: 'gravel',
    drop: BLOCKS.DIRT,
    textures: {
      top: 'farmland_dry.png',
      side: 'dirt.png',
      bottom: 'dirt.png'
    }
  },
  [BLOCKS.FARMLAND_MOIST]: {
    name: 'Moist Farmland',
    hardness: 0.6,
    sound: 'gravel',
    drop: BLOCKS.DIRT,
    textures: {
      top: 'farmland_moist.png',
      side: 'dirt.png',
      bottom: 'dirt.png'
    }
  },

  // Wheat Crop Stages 0-7
  [BLOCKS.WHEAT_STAGE_0]: { name: 'Wheat Crops', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, crop: 'wheat', stage: 0, dropItem: 'wheat_seeds', textures: { all: 'wheat_stage_0.png' } },
  [BLOCKS.WHEAT_STAGE_1]: { name: 'Wheat Crops', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, crop: 'wheat', stage: 1, dropItem: 'wheat_seeds', textures: { all: 'wheat_stage_1.png' } },
  [BLOCKS.WHEAT_STAGE_2]: { name: 'Wheat Crops', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, crop: 'wheat', stage: 2, dropItem: 'wheat_seeds', textures: { all: 'wheat_stage_2.png' } },
  [BLOCKS.WHEAT_STAGE_3]: { name: 'Wheat Crops', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, crop: 'wheat', stage: 3, dropItem: 'wheat_seeds', textures: { all: 'wheat_stage_3.png' } },
  [BLOCKS.WHEAT_STAGE_4]: { name: 'Wheat Crops', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, crop: 'wheat', stage: 4, dropItem: 'wheat_seeds', textures: { all: 'wheat_stage_4.png' } },
  [BLOCKS.WHEAT_STAGE_5]: { name: 'Wheat Crops', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, crop: 'wheat', stage: 5, dropItem: 'wheat_seeds', textures: { all: 'wheat_stage_5.png' } },
  [BLOCKS.WHEAT_STAGE_6]: { name: 'Wheat Crops', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, crop: 'wheat', stage: 6, dropItem: 'wheat_seeds', textures: { all: 'wheat_stage_6.png' } },
  [BLOCKS.WHEAT_STAGE_7]: { name: 'Wheat Crops', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, crop: 'wheat', stage: 7, mature: true, dropItem: 'wheat', textures: { all: 'wheat_stage_7.png' } },

  // Carrots Crop Stages 0-3
  [BLOCKS.CARROTS_STAGE_0]: { name: 'Carrots', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, crop: 'carrots', stage: 0, dropItem: 'carrot', textures: { all: 'carrots_stage_0.png' } },
  [BLOCKS.CARROTS_STAGE_1]: { name: 'Carrots', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, crop: 'carrots', stage: 1, dropItem: 'carrot', textures: { all: 'carrots_stage_1.png' } },
  [BLOCKS.CARROTS_STAGE_2]: { name: 'Carrots', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, crop: 'carrots', stage: 2, dropItem: 'carrot', textures: { all: 'carrots_stage_2.png' } },
  [BLOCKS.CARROTS_STAGE_3]: { name: 'Carrots', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, crop: 'carrots', stage: 3, mature: true, dropItem: 'carrot', textures: { all: 'carrots_stage_3.png' } },

  // Potatoes Crop Stages 0-3
  [BLOCKS.POTATOES_STAGE_0]: { name: 'Potatoes', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, crop: 'potatoes', stage: 0, dropItem: 'potato', textures: { all: 'potatoes_stage_0.png' } },
  [BLOCKS.POTATOES_STAGE_1]: { name: 'Potatoes', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, crop: 'potatoes', stage: 1, dropItem: 'potato', textures: { all: 'potatoes_stage_1.png' } },
  [BLOCKS.POTATOES_STAGE_2]: { name: 'Potatoes', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, crop: 'potatoes', stage: 2, dropItem: 'potato', textures: { all: 'potatoes_stage_2.png' } },
  [BLOCKS.POTATOES_STAGE_3]: { name: 'Potatoes', hardness: 0.0, sound: 'grass', transparent: true, solid: false, plant: true, crop: 'potatoes', stage: 3, mature: true, dropItem: 'potato', textures: { all: 'potatoes_stage_3.png' } },

  // Specialized & Boss Blocks
  [BLOCKS.SCULK_SENSOR]: { name: 'Sculk Sensor', hardness: 1.5, sound: 'stone', transparent: true, solid: true, sculkSensor: true, dropItem: 'sculk_sensor', textures: { all: 'sculk_catalyst_side.png', top: 'sculk_catalyst_top.png' } },
  [BLOCKS.SCULK_SHRIEKER]: { name: 'Sculk Shrieker', hardness: 3.0, sound: 'stone', transparent: true, solid: true, sculkShrieker: true, dropItem: 'sculk_shrieker', textures: { all: 'sculk_catalyst_side.png', top: 'sculk_catalyst_top.png' } },
  [BLOCKS.DRAGON_EGG]: { name: 'Dragon Egg', hardness: 3.0, sound: 'stone', transparent: false, solid: true, dragonEgg: true, dropItem: 'dragon_egg', textures: { all: 'obsidian.png' } },
  [BLOCKS.END_PORTAL]: { name: 'End Portal', hardness: -1, sound: 'glass', transparent: true, solid: false, portal: true, endPortal: true, textures: { all: 'nether_portal.png' } },
  [BLOCKS.WITHER_SKELETON_SKULL_BLOCK]: { name: 'Wither Skeleton Skull', hardness: 1.0, sound: 'stone', transparent: true, solid: true, skull: true, dropItem: 'wither_skeleton_skull', textures: { all: 'coal_block.png' } },

  // --- Villager Workstation Blocks ---
  [BLOCKS.BLAST_FURNACE]: { name: 'Blast Furnace', hardness: 3.5, sound: 'stone', workstation: 'armorer', textures: { top: 'furnace_top.png', front: 'furnace_front.png', side: 'smooth_stone.png', bottom: 'stone.png' } },
  [BLOCKS.SMOKER]: { name: 'Smoker', hardness: 3.5, sound: 'stone', workstation: 'butcher', textures: { top: 'furnace_top.png', front: 'furnace_front.png', side: 'oak_log.png', bottom: 'stone.png' } },
  [BLOCKS.CARTOGRAPHY_TABLE]: { name: 'Cartography Table', hardness: 2.5, sound: 'wood', workstation: 'cartographer', textures: { top: 'crafting_table_top.png', front: 'dark_oak_planks.png', side: 'dark_oak_planks.png', bottom: 'dark_oak_planks.png' } },
  [BLOCKS.BREWING_STAND]: { name: 'Brewing Stand', hardness: 0.5, sound: 'stone', transparent: true, solid: true, workstation: 'cleric', textures: { all: 'obsidian.png' } },
  [BLOCKS.COMPOSTER]: { name: 'Composter', hardness: 2.0, sound: 'wood', workstation: 'farmer', textures: { top: 'oak_planks.png', side: 'oak_planks.png', bottom: 'oak_planks.png' } },
  [BLOCKS.BARREL]: { name: 'Barrel', hardness: 2.5, sound: 'wood', workstation: 'fisherman', textures: { top: 'spruce_planks.png', side: 'spruce_planks.png', bottom: 'spruce_planks.png' } },
  [BLOCKS.FLETCHING_TABLE]: { name: 'Fletching Table', hardness: 2.5, sound: 'wood', workstation: 'fletcher', textures: { top: 'birch_planks.png', front: 'birch_planks.png', side: 'birch_planks.png', bottom: 'birch_planks.png' } },
  [BLOCKS.CAULDRON]: { name: 'Cauldron', hardness: 2.0, sound: 'stone', workstation: 'leatherworker', textures: { all: 'blackstone.png' } },
  [BLOCKS.LECTERN]: { name: 'Lectern', hardness: 2.5, sound: 'wood', workstation: 'librarian', textures: { top: 'oak_planks.png', side: 'oak_planks.png', bottom: 'oak_planks.png' } },
  [BLOCKS.STONECUTTER]: { name: 'Stonecutter', hardness: 3.5, sound: 'stone', workstation: 'mason', textures: { top: 'smooth_stone.png', side: 'stone.png', bottom: 'stone.png' } },
  [BLOCKS.LOOM]: { name: 'Loom', hardness: 2.5, sound: 'wood', workstation: 'shepherd', textures: { top: 'oak_planks.png', front: 'crafting_table_front.png', side: 'oak_planks.png', bottom: 'oak_planks.png' } },
  [BLOCKS.SMITHING_TABLE]: { name: 'Smithing Table', hardness: 2.5, sound: 'wood', workstation: 'toolsmith', textures: { top: 'blackstone_top.png', front: 'blackstone.png', side: 'blackstone.png', bottom: 'oak_planks.png' } },
  [BLOCKS.GRINDSTONE]: { name: 'Grindstone', hardness: 2.0, sound: 'stone', workstation: 'weaponsmith', interactable: true, textures: { top: 'stone.png', side: 'dark_oak_planks.png', bottom: 'dark_oak_planks.png' } },

  // Anvils, Beacons, and Conduits
  [BLOCKS.ANVIL]: { name: 'Anvil', hardness: 5.0, sound: 'stone', interactable: true, textures: { all: 'blackstone.png' } },
  [BLOCKS.CHIPPED_ANVIL]: { name: 'Chipped Anvil', hardness: 5.0, sound: 'stone', interactable: true, textures: { all: 'blackstone.png' } },
  [BLOCKS.DAMAGED_ANVIL]: { name: 'Damaged Anvil', hardness: 5.0, sound: 'stone', interactable: true, textures: { all: 'blackstone.png' } },
  [BLOCKS.BEACON]: { name: 'Beacon', hardness: 3.0, sound: 'glass', light: 15, transparent: true, interactable: true, textures: { all: 'glass.png' } },
  [BLOCKS.CONDUIT]: { name: 'Conduit', hardness: 3.0, sound: 'stone', light: 14, transparent: true, interactable: true, textures: { all: 'prismarine_bricks.png' } },

  // Mineral Storage Blocks
  [BLOCKS.IRON_BLOCK]: { name: 'Block of Iron', hardness: 5.0, sound: 'metal', textures: { all: 'iron_block.png' } },
  [BLOCKS.GOLD_BLOCK]: { name: 'Block of Gold', hardness: 3.0, sound: 'metal', textures: { all: 'gold_block.png' } },
  [BLOCKS.DIAMOND_BLOCK]: { name: 'Block of Diamond', hardness: 5.0, sound: 'stone', textures: { all: 'diamond_block.png' } },
  [BLOCKS.EMERALD_BLOCK]: { name: 'Block of Emerald', hardness: 5.0, sound: 'stone', textures: { all: 'emerald_block.png' } },
  [BLOCKS.NETHERITE_BLOCK]: { name: 'Block of Netherite', hardness: 50.0, sound: 'metal', textures: { all: 'netherite_block.png' } }
};

// --- generated additions for vanilla parity ---------------------------------
//
// Merge the generated extra ids and definitions. Done by mutation rather than by rebuilding the
// objects so that every existing reference to BLOCKS/BLOCK_DEFS keeps pointing at the same object,
// which matters because modules across the codebase import these directly.
//
// Ids in EXTRA_BLOCK_IDS start above the hand-written range, so they cannot collide; the assertion
// below turns a future collision into a loud failure rather than a silently wrong block.
for (const [key, id] of Object.entries(EXTRA_BLOCK_IDS)) {
  if (BLOCKS[key] !== undefined && BLOCKS[key] !== id) {
    throw new Error(`extraContent id collision: ${key} is already ${BLOCKS[key]}, cannot set ${id}`);
  }
  if (id in BLOCK_DEFS) {
    throw new Error(`extraContent definition collision: id ${id} (${key}) already defined`);
  }
  BLOCKS[key] = id;
}
Object.assign(BLOCK_DEFS, EXTRA_BLOCK_DEFS);

// Complete Item definitions
export const ITEMS = {
  iron_nugget: { name: 'Iron Nugget', icon: '/assets/items/iron_nugget.svg', type: 'material' },
  spectral_arrow: { name: 'Spectral Arrow', icon: '/assets/items/spectral_arrow.svg', type: 'material' },
  potion_of_fire_resistance: { name: 'Potion of Fire Resistance (3:00)', icon: '/assets/items/fire_resistance.svg', type: 'potion' },
  splash_potion_of_fire_resistance: { name: 'Splash Potion of Fire Resistance (3:00)', icon: '/assets/items/splash_fire_resistance.svg', type: 'potion' },
  // --- Swords / Weapons ---
  netherite_sword: { name: 'Netherite Sword', attack: 8, icon: '/assets/items/netherite_sword.png', type: 'weapon' },
  diamond_sword: { name: 'Diamond Sword', attack: 7, icon: '/assets/items/diamond_sword.png', type: 'weapon' },
  golden_spear: { name: 'Golden Spear', attack: 4, icon: '/assets/items/trident.png', type: 'weapon' },
  golden_sword: { name: 'Golden Sword', attack: 4, icon: '/assets/items/golden_sword.png', type: 'weapon' },
  iron_sword: { name: 'Iron Sword', attack: 6, icon: '/assets/items/iron_sword.png', type: 'weapon' },
  stone_sword: { name: 'Stone Sword', attack: 5, icon: '/assets/items/stone_sword.png', type: 'weapon' },
  wooden_sword: { name: 'Wooden Sword', attack: 4, icon: '/assets/items/wooden_sword.png', type: 'weapon' },
  bow: { name: 'Bow', attack: 6, icon: '/assets/items/bow.png', type: 'weapon' },
  crossbow: { name: 'Crossbow', attack: 8, icon: '/assets/items/crossbow.png', type: 'weapon' },
  // Wiki: a stray drops an Arrow of Slowness and a bogged an Arrow of Poison.
  tipped_arrow_slowness: { name: 'Arrow of Slowness', icon: '/assets/items/tipped_arrow_slowness.png', type: 'material' },
  tipped_arrow_weakness: { name: 'Arrow of Weakness', icon: '/assets/items/tipped_arrow_weakness.png', type: 'material' },
  tipped_arrow_poison: { name: 'Arrow of Poison', icon: '/assets/items/tipped_arrow_poison.png', type: 'material' },
  arrow: { name: 'Arrow', icon: '/assets/items/arrow.png', type: 'projectile' },
  trident: { name: 'Trident', attack: 9, icon: '/assets/items/trident.png', type: 'weapon' },
  totem_of_undying: { name: 'Totem of Undying', icon: '/assets/items/totem_of_undying.png', type: 'special' },

  // --- Armor & Shield ---
  netherite_helmet: { name: 'Netherite Helmet', armor: 3, toughness: 3, knockbackResistance: 1, armorSlot: 'head', icon: '/assets/items/netherite_helmet.png', type: 'armor' },
  netherite_chestplate: { name: 'Netherite Chestplate', armor: 8, toughness: 3, knockbackResistance: 1, armorSlot: 'chest', icon: '/assets/items/netherite_chestplate.png', type: 'armor' },
  netherite_leggings: { name: 'Netherite Leggings', armor: 6, toughness: 3, knockbackResistance: 1, armorSlot: 'legs', icon: '/assets/items/netherite_leggings.png', type: 'armor' },
  netherite_boots: { name: 'Netherite Boots', armor: 3, toughness: 3, knockbackResistance: 1, armorSlot: 'feet', icon: '/assets/items/netherite_boots.png', type: 'armor' },

  diamond_helmet: { name: 'Diamond Helmet', armor: 3, toughness: 2, armorSlot: 'head', icon: '/assets/items/diamond_helmet.png', type: 'armor' },
  diamond_chestplate: { name: 'Diamond Chestplate', armor: 8, toughness: 2, armorSlot: 'chest', icon: '/assets/items/diamond_chestplate.png', type: 'armor' },
  diamond_leggings: { name: 'Diamond Leggings', armor: 6, toughness: 2, armorSlot: 'legs', icon: '/assets/items/diamond_leggings.png', type: 'armor' },
  diamond_boots: { name: 'Diamond Boots', armor: 3, toughness: 2, armorSlot: 'feet', icon: '/assets/items/diamond_boots.png', type: 'armor' },

  iron_helmet: { name: 'Iron Helmet', armor: 2, toughness: 0, armorSlot: 'head', icon: '/assets/items/iron_helmet.png', type: 'armor' },
  iron_chestplate: { name: 'Iron Chestplate', armor: 6, toughness: 0, armorSlot: 'chest', icon: '/assets/items/iron_chestplate.png', type: 'armor' },
  iron_leggings: { name: 'Iron Leggings', armor: 5, toughness: 0, armorSlot: 'legs', icon: '/assets/items/iron_leggings.png', type: 'armor' },
  iron_boots: { name: 'Iron Boots', armor: 2, toughness: 0, armorSlot: 'feet', icon: '/assets/items/iron_boots.png', type: 'armor' },

  golden_helmet: { name: 'Golden Helmet', armor: 2, toughness: 0, armorSlot: 'head', icon: '/assets/items/golden_helmet.png', type: 'armor' },
  golden_chestplate: { name: 'Golden Chestplate', armor: 5, toughness: 0, armorSlot: 'chest', icon: '/assets/items/golden_chestplate.png', type: 'armor' },
  golden_leggings: { name: 'Golden Leggings', armor: 3, toughness: 0, armorSlot: 'legs', icon: '/assets/items/golden_leggings.png', type: 'armor' },
  golden_boots: { name: 'Golden Boots', armor: 1, toughness: 0, armorSlot: 'feet', icon: '/assets/items/golden_boots.png', type: 'armor' },

  chainmail_helmet: { name: 'Chainmail Helmet', armor: 2, toughness: 0, armorSlot: 'head', icon: '/assets/items/chainmail_helmet.png', type: 'armor' },
  chainmail_chestplate: { name: 'Chainmail Chestplate', armor: 5, toughness: 0, armorSlot: 'chest', icon: '/assets/items/chainmail_chestplate.png', type: 'armor' },
  chainmail_leggings: { name: 'Chainmail Leggings', armor: 4, toughness: 0, armorSlot: 'legs', icon: '/assets/items/chainmail_leggings.png', type: 'armor' },
  chainmail_boots: { name: 'Chainmail Boots', armor: 1, toughness: 0, armorSlot: 'feet', icon: '/assets/items/chainmail_boots.png', type: 'armor' },

  leather_helmet: { name: 'Leather Cap', armor: 1, toughness: 0, armorSlot: 'head', icon: '/assets/items/leather_helmet.png', type: 'armor' },
  leather_chestplate: { name: 'Leather Tunic', armor: 3, toughness: 0, armorSlot: 'chest', icon: '/assets/items/leather_chestplate.png', type: 'armor' },
  leather_leggings: { name: 'Leather Pants', armor: 2, toughness: 0, armorSlot: 'legs', icon: '/assets/items/leather_leggings.png', type: 'armor' },
  leather_boots: { name: 'Leather Boots', armor: 1, toughness: 0, armorSlot: 'feet', icon: '/assets/items/leather_boots.png', type: 'armor' },

  turtle_helmet: { name: 'Turtle Shell', armor: 2, toughness: 0, armorSlot: 'head', icon: '/assets/items/turtle_helmet.png', type: 'armor' },
  shield: { name: 'Shield', icon: '/assets/items/shield.png', type: 'shield', offhand: true },

  leather_horse_armor: { name: 'Leather Horse Armor', icon: '/assets/items/leather.png', type: 'armor' },
  hay_bale: { name: 'Hay Bale', icon: '/assets/items/wheat.png', type: 'material' },
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
  // Wiki: the harness, which a happy ghast must have before it can be ridden.
  harness: { name: 'Harness', icon: '/assets/items/harness.png', type: 'item' },
  shears: { name: 'Shears', icon: '/assets/items/shears.png', type: 'tool' },
  fishing_rod: { name: 'Fishing Rod', icon: '/assets/items/fishing_rod.png', type: 'tool' },
  compass: { name: 'Compass', icon: '/assets/items/compass.png', type: 'tool' },
  clock: { name: 'Clock', icon: '/assets/items/clock.png', type: 'tool' },
  lead: { name: 'Lead', icon: '/assets/items/lead.png', type: 'tool' },
  name_tag: { name: 'Name Tag', icon: '/assets/items/name_tag.png', type: 'tool' },
  saddle: { name: 'Saddle', icon: '/assets/items/saddle.png', type: 'tool' },
  oak_boat: { name: 'Oak Boat', icon: '/assets/items/oak_boat.png', type: 'transport' },
  chest_boat: { name: 'Boat with Chest', icon: '/assets/items/chest_boat.png', type: 'transport' },
  minecart: { name: 'Minecart', icon: '/assets/items/minecart.png', type: 'transport' },
  chest_minecart: { name: 'Minecart with Chest', icon: '/assets/items/chest_minecart.png', type: 'transport' },
  furnace_minecart: { name: 'Minecart with Furnace', icon: '/assets/items/furnace_minecart.png', type: 'transport' },
  hopper_minecart: { name: 'Minecart with Hopper', icon: '/assets/items/hopper_minecart.png', type: 'transport' },
  tnt_minecart: { name: 'Minecart with TNT', icon: '/assets/items/tnt_minecart.png', type: 'transport' },
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
  chicken: { name: 'Raw Chicken', food: 2, icon: '/assets/items/chicken.png', type: 'food' },
  cooked_chicken: { name: 'Cooked Chicken', food: 6, icon: '/assets/items/cooked_chicken.png', type: 'food' },
  mutton: { name: 'Raw Mutton', food: 2, icon: '/assets/items/mutton.png', type: 'food' },
  cooked_mutton: { name: 'Cooked Mutton', food: 6, icon: '/assets/items/cooked_mutton.png', type: 'food' },
  rabbit: { name: 'Raw Rabbit', food: 3, icon: '/assets/items/rabbit.png', type: 'food' },
  cooked_rabbit: { name: 'Cooked Rabbit', food: 5, icon: '/assets/items/cooked_rabbit.png', type: 'food' },
  // Rotten flesh is dropped by six mobs in `mobs.js`'s loot table and eaten as a last resort. Its
  // Hunger effect is not implemented yet; the item and its food value are, because a zombie dropping
  // an id that has no definition yields a placeholder sprite and a phantom stack.
  rotten_flesh: { name: 'Rotten Flesh', food: 4, icon: '/assets/items/rotten_flesh.png', type: 'food' },
  tropical_fish: { name: 'Tropical Fish', food: 1, icon: '/assets/items/tropical_fish.png', type: 'food' },
  // Chorus fruit is in foodData.js already; vanilla also teleports on eat, which is a separate job.
  chorus_fruit: { name: 'Chorus Fruit', food: 4, icon: '/assets/items/chorus_fruit.png', type: 'food' },
  kelp: { name: 'Kelp', icon: '/assets/items/kelp.png', type: 'food' },
  dried_kelp: { name: 'Dried Kelp', food: 1, icon: '/assets/items/dried_kelp.png', type: 'food' },
  carrot: { name: 'Carrot', food: 3, icon: '/assets/items/carrot.png', type: 'food', crop: 'carrots' },
  golden_dandelion: { name: 'Golden Dandelion', icon: '/assets/blocks/dandelion.png', type: 'material' },
  golden_carrot: { name: 'Golden Carrot', food: 6, icon: '/assets/items/golden_carrot.png', type: 'food' },
  potato: { name: 'Potato', food: 1, icon: '/assets/items/potato.png', type: 'food', crop: 'potatoes' },
  baked_potato: { name: 'Baked Potato', food: 5, icon: '/assets/items/baked_potato.png', type: 'food' },
  poisonous_potato: { name: 'Poisonous Potato', food: 2, icon: '/assets/items/poisonous_potato.png', type: 'food' },
  wheat_seeds: { name: 'Wheat Seeds', icon: '/assets/items/wheat_seeds.png', type: 'seed', crop: 'wheat' },
  seeds: { name: 'Wheat Seeds', icon: '/assets/items/wheat_seeds.png', type: 'seed', crop: 'wheat' },
  wheat_seed: { name: 'Wheat Seeds', icon: '/assets/items/wheat_seeds.png', type: 'seed', crop: 'wheat' },
  seed: { name: 'Wheat Seeds', icon: '/assets/items/wheat_seeds.png', type: 'seed', crop: 'wheat' },
  pumpkin_seeds: { name: 'Pumpkin Seeds', icon: '/assets/items/pumpkin_seeds.png', type: 'seed' },
  pumpkin_seed: { name: 'Pumpkin Seeds', icon: '/assets/items/pumpkin_seeds.png', type: 'seed' },
  melon_seeds: { name: 'Melon Seeds', icon: '/assets/items/melon_seeds.png', type: 'seed' },
  melon_seed: { name: 'Melon Seeds', icon: '/assets/items/melon_seeds.png', type: 'seed' },
  beetroot_seeds: { name: 'Beetroot Seeds', icon: '/assets/items/beetroot_seeds.png', type: 'seed' },
  beetroot_seed: { name: 'Beetroot Seeds', icon: '/assets/items/beetroot_seeds.png', type: 'seed' },
  torchflower_seeds: { name: 'Torchflower Seeds', icon: '/assets/items/torchflower_seeds.png', type: 'seed' },
  pitcher_pod: { name: 'Pitcher Pod', icon: '/assets/items/pitcher_pod.png', type: 'seed' },
  beetroot: { name: 'Beetroot', food: 1, icon: '/assets/items/beetroot.png', type: 'food' },
  beetroot_soup: { name: 'Beetroot Soup', food: 6, icon: '/assets/items/beetroot_soup.png', type: 'food' },
  mushroom_stew: { name: 'Mushroom Stew', food: 6, icon: '/assets/items/mushroom_stew.png', type: 'food' },
  cookie: { name: 'Cookie', food: 2, icon: '/assets/items/cookie.png', type: 'food' },
  melon_slice: { name: 'Melon Slice', food: 2, icon: '/assets/items/melon_slice.png', type: 'food' },
  sweet_berries: { name: 'Sweet Berries', food: 2, icon: '/assets/items/sweet_berries.png', type: 'food' },
  glow_berries: { name: 'Glow Berries', food: 2, icon: '/assets/items/glow_berries.png', type: 'food' },
  honey_bottle: { name: 'Honey Bottle', food: 6, icon: '/assets/items/honey_bottle.png', type: 'food' },
  potion: { name: 'Water Bottle / Potion', icon: '/assets/items/potion.png', type: 'food' },

  // --- Ingredients & Materials ---
  coal: { name: 'Coal', icon: '/assets/items/coal.png', type: 'material' },
  charcoal: { name: 'Charcoal', icon: '/assets/items/charcoal.png', type: 'material' },
  // Both of these are named by loot tables that already run: `mobs.js` drops seagrass from a turtle,
  // and the generated stray table drops a tipped arrow. Naming an id with no definition produced a
  // fallback sprite and a phantom stack, so the entries are the fix.
  //
  // seagrass is defined once, here. Both sides of the ore-batch merge added it independently and the
  // merge kept both copies; a duplicate key in an object literal is legal JavaScript that silently
  // keeps the last one, which is exactly what tests/itemDefinitions.test.js exists to catch.
  seagrass: { name: 'Seagrass', icon: '/assets/items/seagrass.png', type: 'material' },
  tipped_arrow: { name: 'Tipped Arrow', icon: '/assets/items/tipped_arrow.png', type: 'projectile' },
  raw_iron: { name: 'Raw Iron', icon: '/assets/items/raw_iron.png', type: 'material' },
  raw_gold: { name: 'Raw Gold', icon: '/assets/items/raw_gold.png', type: 'material' },
  raw_copper: { name: 'Raw Copper', icon: '/assets/items/raw_copper.png', type: 'material' },
  iron_ingot: { name: 'Iron Ingot', icon: '/assets/items/iron_ingot.png', type: 'material' },
  gold_ingot: { name: 'Gold Ingot', icon: '/assets/items/gold_ingot.png', type: 'material' },
  copper_ingot: { name: 'Copper Ingot', icon: '/assets/items/copper_ingot.png', type: 'material' },
  clay_ball: { name: 'Clay Ball', icon: '/assets/items/clay_ball.png', type: 'material' },
  brick: { name: 'Brick', icon: '/assets/items/brick.png', type: 'material' },
  nether_brick: { name: 'Nether Brick', icon: '/assets/items/nether_brick.png', type: 'material' },
  green_dye: { name: 'Green Dye', icon: '/assets/items/green_dye.png', type: 'material' },
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
  // Wiki: a goat horn is dropped when a goat rams a hard block. Both horns of one goat are always
  // the same variant, so the item carries the variant in its name rather than the stack.
  // Wiki: seagrass is what turtles eat, breed with and follow, and 0-2 drop on death.
  // Wiki: a small slime killed by a frog always drops exactly one slimeball, and frogs breed with it.
  // Wiki: pandas eat, follow and breed around bamboo, and drop exactly one when killed.
  // Wiki: a brush takes 16 durability per armadillo scute, so one is good for four scutes.
  brush: { name: 'Brush', icon: '/assets/items/brush.png', type: 'tool', durability: 64 },
  bamboo: { name: 'Bamboo', icon: '/assets/items/bamboo.png', type: 'material' },
  slimeball: { name: 'Slimeball', icon: '/assets/items/slimeball.png', type: 'material' },
  goat_horn: { name: 'Goat Horn', icon: '/assets/items/goat_horn.png', type: 'material' },
  paper: { name: 'Paper', icon: '/assets/items/paper.png', type: 'material' },
  book: { name: 'Book', icon: '/assets/items/book.png', type: 'material' },
  enchanted_book: { name: 'Enchanted Book', icon: '/assets/items/enchanted_book.png', type: 'utility' },
  experience_bottle: { name: 'Bottle o\' Enchanting', icon: '/assets/items/experience_bottle.png', type: 'utility' },
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
  red_bed: { name: 'Red Bed', icon: '/assets/items/red_bed.png', type: 'utility', isBlock: true, blockId: BLOCKS.RED_BED_FOOT },
  bed: { name: 'Bed', icon: '/assets/items/red_bed.png', type: 'utility', isBlock: true, blockId: BLOCKS.RED_BED_FOOT },
  chest: { name: 'Chest', icon: '/assets/items/chest.png', type: 'utility', isBlock: true, blockId: BLOCKS.CHEST },
  oak_door: { name: 'Oak Door', icon: '/assets/items/oak_door.png', type: 'utility', isBlock: true, blockId: BLOCKS.OAK_DOOR },
  iron_door: { name: 'Iron Door', icon: '/assets/items/iron_door.png', type: 'utility', isBlock: true, blockId: BLOCKS.IRON_DOOR },
  oak_trapdoor: { name: 'Oak Trapdoor', icon: '/assets/items/oak_trapdoor.png', type: 'utility', isBlock: true, blockId: BLOCKS.OAK_TRAPDOOR },
  iron_trapdoor: { name: 'Iron Trapdoor', icon: '/assets/items/iron_trapdoor.png', type: 'utility', isBlock: true, blockId: BLOCKS.IRON_TRAPDOOR },
  armor_stand: { name: 'Armor Stand', icon: '/assets/items/armor_stand.png', type: 'utility' },
  item_frame: { name: 'Item Frame', icon: '/assets/items/item_frame.png', type: 'utility' },
  painting: { name: 'Painting', icon: '/assets/items/painting.png', type: 'utility' },
  brewing_stand: { name: 'Brewing Stand', icon: '/assets/items/brewing_stand.png', type: 'utility', isBlock: true, blockId: BLOCKS.BREWING_STAND },
  cauldron: { name: 'Cauldron', icon: '/assets/items/cauldron.png', type: 'utility', isBlock: true, blockId: BLOCKS.CAULDRON },
  blast_furnace: { name: 'Blast Furnace', icon: '/assets/blocks/furnace_front.png', type: 'utility', isBlock: true, blockId: BLOCKS.BLAST_FURNACE },
  smoker: { name: 'Smoker', icon: '/assets/blocks/furnace_front.png', type: 'utility', isBlock: true, blockId: BLOCKS.SMOKER },
  cartography_table: { name: 'Cartography Table', icon: '/assets/blocks/crafting_table_front.png', type: 'utility', isBlock: true, blockId: BLOCKS.CARTOGRAPHY_TABLE },
  composter: { name: 'Composter', icon: '/assets/blocks/oak_planks.png', type: 'utility', isBlock: true, blockId: BLOCKS.COMPOSTER },
  barrel: { name: 'Barrel', icon: '/assets/items/chest.png', type: 'utility', isBlock: true, blockId: BLOCKS.BARREL },
  fletching_table: { name: 'Fletching Table', icon: '/assets/blocks/crafting_table_front.png', type: 'utility', isBlock: true, blockId: BLOCKS.FLETCHING_TABLE },
  lectern: { name: 'Lectern', icon: '/assets/blocks/oak_planks.png', type: 'utility', isBlock: true, blockId: BLOCKS.LECTERN },
  stonecutter: { name: 'Stonecutter', icon: '/assets/blocks/stone.png', type: 'utility', isBlock: true, blockId: BLOCKS.STONECUTTER },
  loom: { name: 'Loom', icon: '/assets/blocks/crafting_table_front.png', type: 'utility', isBlock: true, blockId: BLOCKS.LOOM },
  smithing_table: { name: 'Smithing Table', icon: '/assets/blocks/crafting_table_front.png', type: 'utility', isBlock: true, blockId: BLOCKS.SMITHING_TABLE },
  grindstone: { name: 'Grindstone', icon: '/assets/blocks/stone.png', type: 'utility', isBlock: true, blockId: BLOCKS.GRINDSTONE },
  anvil: { name: 'Anvil', icon: '/assets/blocks/anvil.png', type: 'utility', isBlock: true, blockId: BLOCKS.ANVIL },
  chipped_anvil: { name: 'Chipped Anvil', icon: '/assets/blocks/anvil.png', type: 'utility', isBlock: true, blockId: BLOCKS.CHIPPED_ANVIL },
  damaged_anvil: { name: 'Damaged Anvil', icon: '/assets/blocks/anvil.png', type: 'utility', isBlock: true, blockId: BLOCKS.DAMAGED_ANVIL },
  beacon: { name: 'Beacon', icon: '/assets/items/nether_star.png', type: 'utility', isBlock: true, blockId: BLOCKS.BEACON },
  conduit: { name: 'Conduit', icon: '/assets/items/prismarine_crystals.png', type: 'utility', isBlock: true, blockId: BLOCKS.CONDUIT },

  // Alchemy & Brewing Ingredients
  nether_wart: { name: 'Nether Wart', icon: '/assets/items/nether_wart.png', type: 'material' },
  fermented_spider_eye: { name: 'Fermented Spider Eye', icon: '/assets/items/fermented_spider_eye.png', type: 'material' },
  glistering_melon_slice: { name: 'Glistering Melon Slice', icon: '/assets/items/glistering_melon_slice.png', type: 'material' },
  rabbit_foot: { name: "Rabbit's Foot", icon: '/assets/items/rabbit_foot.png', type: 'material' },
  // `foodData.js` has carried a pufferfish hunger value all along, but the item never declared one,
  // and eating reads `ITEMS[id].food` -- so a pufferfish could be held but never eaten.
  pufferfish: { name: 'Pufferfish', food: 1, icon: '/assets/items/pufferfish.png', type: 'food' },
  dragon_breath: { name: "Dragon's Breath", icon: '/assets/items/dragon_breath.png', type: 'material' },
  glass_bottle: { name: 'Glass Bottle', icon: '/assets/items/glass_bottle.png', type: 'utility' },
  splash_water_bottle: {name:'Splash Water Bottle',icon:'/assets/items/potion.png',type:'potion'},
  water_bottle: { name: 'Water Bottle', icon: '/assets/items/potion.png', type: 'potion' },
  splash_potion_of_weakness: { name: 'Splash Potion of Weakness', icon: '/assets/items/potion.png', type: 'potion' },
  // `foodData.js` and the pinned vanilla data both treat the ominous bottle as edible (1 hunger), and
  // it was the last id in the registry that something referenced and nothing defined. Its real source
  // -- vaults, trial spawners and raid captains -- is not implemented, so this is the item and its food
  // value only; the Bad Omen it grants in vanilla is not modelled.
  ominous_bottle: { name: 'Ominous Bottle', food: 1, icon: '/assets/items/ominous_bottle.png', type: 'food' },
  zombie_villager_spawn_egg: { name: 'Zombie Villager Spawn Egg', icon: '/assets/items/zombie_spawn_egg.png', type: 'spawn_egg', mob: 'zombie_villager' },

  // --- Mob Spawn Eggs ---
  villager_spawn_egg: { name: 'Villager Spawn Egg', icon: '/assets/items/villager_spawn_egg.png', type: 'spawn_egg', mob: 'villager' },
  iron_golem_spawn_egg: { name: 'Iron Golem Spawn Egg', icon: '/assets/items/iron_golem_spawn_egg.png', type: 'spawn_egg', mob: 'iron_golem' },
  pillager_spawn_egg: { name: 'Pillager Spawn Egg', icon: '/assets/items/pillager_spawn_egg.png', type: 'spawn_egg', mob: 'pillager' },
  zombie_spawn_egg: { name: 'Zombie Spawn Egg', icon: '/assets/items/zombie_spawn_egg.png', type: 'spawn_egg', mob: 'zombie' },
  skeleton_spawn_egg: { name: 'Skeleton Spawn Egg', icon: '/assets/items/skeleton_spawn_egg.png', type: 'spawn_egg', mob: 'skeleton' },
  creeper_spawn_egg: { name: 'Creeper Spawn Egg', icon: '/assets/items/creeper_spawn_egg.png', type: 'spawn_egg', mob: 'creeper' },
  spider_spawn_egg: { name: 'Spider Spawn Egg', icon: '/assets/items/spider_spawn_egg.png', type: 'spawn_egg', mob: 'spider' },
  cave_spider_spawn_egg: { name: 'Cave Spider Spawn Egg', icon: '/assets/items/cave_spider_spawn_egg.png', type: 'spawn_egg', mob: 'cave_spider' },
  silverfish_spawn_egg: { name: 'Silverfish Spawn Egg', icon: '/assets/items/silverfish_spawn_egg.png', type: 'spawn_egg', mob: 'silverfish' },
  endermite_spawn_egg: { name: 'Endermite Spawn Egg', icon: '/assets/items/endermite_spawn_egg.png', type: 'spawn_egg', mob: 'endermite' },
  rabbit_spawn_egg: { name: 'Rabbit Spawn Egg', icon: '/assets/items/rabbit_spawn_egg.png', type: 'spawn_egg', mob: 'rabbit' },
  bat_spawn_egg: { name: 'Bat Spawn Egg', icon: '/assets/items/bat_spawn_egg.png', type: 'spawn_egg', mob: 'bat' },
  fox_spawn_egg: { name: 'Fox Spawn Egg', icon: '/assets/items/fox_spawn_egg.png', type: 'spawn_egg', mob: 'fox' },
  bee_spawn_egg: { name: 'Bee Spawn Egg', icon: '/assets/items/bee_spawn_egg.png', type: 'spawn_egg', mob: 'bee' },
  skeleton_horse_spawn_egg: { name: 'Skeleton Horse Spawn Egg', icon: '/assets/items/skeleton_horse_spawn_egg.png', type: 'spawn_egg', mob: 'skeleton_horse' },
  zombie_horse_spawn_egg: { name: 'Zombie Horse Spawn Egg', icon: '/assets/items/zombie_horse_spawn_egg.png', type: 'spawn_egg', mob: 'zombie_horse' },
  illusioner_spawn_egg: { name: 'Illusioner Spawn Egg', icon: '/assets/items/illusioner_spawn_egg.png', type: 'spawn_egg', mob: 'illusioner' },
  snow_golem_spawn_egg: { name: 'Snow Golem Spawn Egg', icon: '/assets/items/snow_golem_spawn_egg.png', type: 'spawn_egg', mob: 'snow_golem' },
  killer_bunny_spawn_egg: { name: 'Killer Bunny Spawn Egg', icon: '/assets/items/killer_bunny_spawn_egg.png', type: 'spawn_egg', mob: 'killer_bunny' },
  creaking_spawn_egg: { name: 'Creaking Spawn Egg', icon: '/assets/items/creaking_spawn_egg.png', type: 'spawn_egg', mob: 'creaking' },
  parched_spawn_egg: { name: 'Parched Spawn Egg', icon: '/assets/items/parched_spawn_egg.png', type: 'spawn_egg', mob: 'parched' },
  camel_spawn_egg: { name: 'Camel Spawn Egg', icon: '/assets/items/camel_spawn_egg.png', type: 'spawn_egg', mob: 'camel' },
  wandering_trader_spawn_egg: { name: 'Wandering Trader Spawn Egg', icon: '/assets/items/wandering_trader_spawn_egg.png', type: 'spawn_egg', mob: 'wandering_trader' },
  allay_spawn_egg: { name: 'Allay Spawn Egg', icon: '/assets/items/allay_spawn_egg.png', type: 'spawn_egg', mob: 'allay' },
  sniffer_spawn_egg: { name: 'Sniffer Spawn Egg', icon: '/assets/items/sniffer_spawn_egg.png', type: 'spawn_egg', mob: 'sniffer' },
  sniffer_egg: { name: 'Sniffer Egg', icon: '/assets/items/sniffer_egg.png', type: 'material' },
  breeze_spawn_egg: { name: 'Breeze Spawn Egg', icon: '/assets/items/breeze_spawn_egg.png', type: 'spawn_egg', mob: 'breeze' },
  husk_spawn_egg: { name: 'Husk Spawn Egg', icon: '/assets/items/husk_spawn_egg.png', type: 'spawn_egg', mob: 'husk' },
  stray_spawn_egg: { name: 'Stray Spawn Egg', icon: '/assets/items/stray_spawn_egg.png', type: 'spawn_egg', mob: 'stray' },
  bogged_spawn_egg: { name: 'Bogged Spawn Egg', icon: '/assets/items/bogged_spawn_egg.png', type: 'spawn_egg', mob: 'bogged' },
  armadillo_spawn_egg: { name: 'Armadillo Spawn Egg', icon: '/assets/items/armadillo_spawn_egg.png', type: 'spawn_egg', mob: 'armadillo' },
  panda_spawn_egg: { name: 'Panda Spawn Egg', icon: '/assets/items/panda_spawn_egg.png', type: 'spawn_egg', mob: 'panda' },
  polar_bear_spawn_egg: { name: 'Polar Bear Spawn Egg', icon: '/assets/items/polar_bear_spawn_egg.png', type: 'spawn_egg', mob: 'polar_bear' },
  parrot_spawn_egg: { name: 'Parrot Spawn Egg', icon: '/assets/items/parrot_spawn_egg.png', type: 'spawn_egg', mob: 'parrot' },
  tadpole_spawn_egg: { name: 'Tadpole Spawn Egg', icon: '/assets/items/tadpole_spawn_egg.png', type: 'spawn_egg', mob: 'tadpole' },
  frog_spawn_egg: { name: 'Frog Spawn Egg', icon: '/assets/items/frog_spawn_egg.png', type: 'spawn_egg', mob: 'frog' },
  turtle_spawn_egg: { name: 'Turtle Spawn Egg', icon: '/assets/items/turtle_spawn_egg.png', type: 'spawn_egg', mob: 'turtle' },
  llama_spawn_egg: { name: 'Llama Spawn Egg', icon: '/assets/items/llama_spawn_egg.png', type: 'spawn_egg', mob: 'llama' },
  goat_spawn_egg: { name: 'Goat Spawn Egg', icon: '/assets/items/goat_spawn_egg.png', type: 'spawn_egg', mob: 'goat' },
  pig_spawn_egg: { name: 'Pig Spawn Egg', icon: '/assets/items/pig_spawn_egg.png', type: 'spawn_egg', mob: 'pig' },
  cow_spawn_egg: { name: 'Cow Spawn Egg', icon: '/assets/items/cow_spawn_egg.png', type: 'spawn_egg', mob: 'cow' },
  sheep_spawn_egg: { name: 'Sheep Spawn Egg', icon: '/assets/items/sheep_spawn_egg.png', type: 'spawn_egg', mob: 'sheep' },
  salmon_spawn_egg: { name: 'Salmon Spawn Egg', icon: '/assets/items/salmon_spawn_egg.png', type: 'spawn_egg', mob: 'salmon' },
  cod_spawn_egg: { name: 'Cod Spawn Egg', icon: '/assets/items/cod_spawn_egg.png', type: 'spawn_egg', mob: 'cod' },
  dolphin_spawn_egg: { name: 'Dolphin Spawn Egg', icon: '/assets/items/dolphin_spawn_egg.png', type: 'spawn_egg', mob: 'dolphin' },
  squid_spawn_egg: { name: 'Squid Spawn Egg', icon: '/assets/items/squid_spawn_egg.png', type: 'spawn_egg', mob: 'squid' },
  octopus_spawn_egg: { name: 'Octopus Spawn Egg', icon: '/assets/items/octopus_spawn_egg.png', type: 'spawn_egg', mob: 'octopus' },
  axolotl_spawn_egg: { name: 'Axolotl Spawn Egg', icon: '/assets/items/axolotl_spawn_egg.png', type: 'spawn_egg', mob: 'axolotl' },

  // Specialized Mob Drops & Tools
  wither_skeleton_skull: { name: 'Wither Skeleton Skull', icon: '/assets/items/wither_skeleton_skull.png', type: 'utility', isBlock: true, blockId: BLOCKS.WITHER_SKELETON_SKULL_BLOCK },
  nether_star: { name: 'Nether Star', icon: '/assets/items/nether_star.png', type: 'material' },
  ghast_tear: { name: 'Ghast Tear', icon: '/assets/items/ghast_tear.png', type: 'material' },
  phantom_membrane: { name: 'Phantom Membrane', icon: '/assets/items/phantom_membrane.png', type: 'material' },
  carrot_on_a_stick: { name: 'Carrot on a Stick', icon: '/assets/items/carrot_on_a_stick.png', type: 'tool' },
  warped_fungus_on_a_stick: { name: 'Warped Fungus on a Stick', icon: '/assets/items/warped_fungus_on_a_stick.png', type: 'tool' },
  dragon_egg: { name: 'Dragon Egg', icon: '/assets/items/dragon_egg.png', type: 'utility', isBlock: true, blockId: BLOCKS.DRAGON_EGG },
  end_crystal: { name: 'End Crystal', icon: '/assets/items/end_crystal.png', type: 'utility' },
  prismarine_shard: { name: 'Prismarine Shard', icon: '/assets/items/prismarine_shard.png', type: 'material' },
  prismarine_crystals: { name: 'Prismarine Crystals', icon: '/assets/items/prismarine_crystals.png', type: 'material' },
  glow_ink_sac: { name: 'Glow Ink Sac', icon: '/assets/items/glow_ink_sac.png', type: 'material' },
  ink_sac: { name: 'Ink Sac', icon: '/assets/items/ink_sac.png', type: 'material' },

  // Additional Mob Spawn Eggs
  chicken_spawn_egg: { name: 'Chicken Spawn Egg', icon: '/assets/items/chicken_spawn_egg.png', type: 'spawn_egg', mob: 'chicken' },
  horse_spawn_egg: { name: 'Horse Spawn Egg', icon: '/assets/items/horse_spawn_egg.png', type: 'spawn_egg', mob: 'horse' },
  mule_spawn_egg: { name:'Mule Spawn Egg',icon:'/assets/items/donkey_spawn_egg.png',type:'spawn_egg',mob:'mule' },
  donkey_spawn_egg: { name: 'Donkey Spawn Egg', icon: '/assets/items/donkey_spawn_egg.png', type: 'spawn_egg', mob: 'donkey' },
  wolf_spawn_egg: { name: 'Wolf Spawn Egg', icon: '/assets/items/wolf_spawn_egg.png', type: 'spawn_egg', mob: 'wolf' },
  cat_spawn_egg: { name: 'Cat Spawn Egg', icon: '/assets/items/cat_spawn_egg.png', type: 'spawn_egg', mob: 'cat' },
  slime_spawn_egg: { name: 'Slime Spawn Egg', icon: '/assets/items/slime_spawn_egg.png', type: 'spawn_egg', mob: 'slime' },
  magma_cube_spawn_egg: { name: 'Magma Cube Spawn Egg', icon: '/assets/items/magma_cube_spawn_egg.png', type: 'spawn_egg', mob: 'magma_cube' },
  witch_spawn_egg: { name: 'Witch Spawn Egg', icon: '/assets/items/witch_spawn_egg.png', type: 'spawn_egg', mob: 'witch' },
  ghast_spawn_egg: { name: 'Ghast Spawn Egg', icon: '/assets/items/ghast_spawn_egg.png', type: 'spawn_egg', mob: 'ghast' },
  blaze_spawn_egg: { name: 'Blaze Spawn Egg', icon: '/assets/items/blaze_spawn_egg.png', type: 'spawn_egg', mob: 'blaze' },
  wither_skeleton_spawn_egg: { name: 'Wither Skeleton Spawn Egg', icon: '/assets/items/wither_skeleton_spawn_egg.png', type: 'spawn_egg', mob: 'wither_skeleton' },
  piglin_spawn_egg: { name: 'Piglin Spawn Egg', icon: '/assets/items/piglin_spawn_egg.png', type: 'spawn_egg', mob: 'piglin' },
  zombified_piglin_spawn_egg: { name: 'Zombified Piglin Spawn Egg', icon: '/assets/items/zombie_pigman_spawn_egg.png', type: 'spawn_egg', mob: 'zombified_piglin' },
  zombie_pigman_spawn_egg: { name: 'Zombie Pigman Spawn Egg', icon: '/assets/items/zombie_pigman_spawn_egg.png', type: 'spawn_egg', mob: 'zombie_pigman' },
  hoglin_spawn_egg: { name: 'Hoglin Spawn Egg', icon: '/assets/items/hoglin_spawn_egg.png', type: 'spawn_egg', mob: 'hoglin' },
  strider_spawn_egg: { name: 'Strider Spawn Egg', icon: '/assets/items/strider_spawn_egg.png', type: 'spawn_egg', mob: 'strider' },
  guardian_spawn_egg: { name: 'Guardian Spawn Egg', icon: '/assets/items/guardian_spawn_egg.png', type: 'spawn_egg', mob: 'guardian' },
  elder_guardian_spawn_egg: { name: 'Elder Guardian Spawn Egg', icon: '/assets/items/elder_guardian_spawn_egg.png', type: 'spawn_egg', mob: 'elder_guardian' },
  drowned_spawn_egg: { name: 'Drowned Spawn Egg', icon: '/assets/items/drowned_spawn_egg.png', type: 'spawn_egg', mob: 'drowned' },
  glow_squid_spawn_egg: { name: 'Glow Squid Spawn Egg', icon: '/assets/items/glow_squid_spawn_egg.png', type: 'spawn_egg', mob: 'glow_squid' },
  phantom_spawn_egg: { name: 'Phantom Spawn Egg', icon: '/assets/items/phantom_spawn_egg.png', type: 'spawn_egg', mob: 'phantom' },
  vindicator_spawn_egg: { name: 'Vindicator Spawn Egg', icon: '/assets/items/vindicator_spawn_egg.png', type: 'spawn_egg', mob: 'vindicator' },
  evoker_spawn_egg: { name: 'Evoker Spawn Egg', icon: '/assets/items/evoker_spawn_egg.png', type: 'spawn_egg', mob: 'evoker' },
  ravager_spawn_egg: { name: 'Ravager Spawn Egg', icon: '/assets/items/ravager_spawn_egg.png', type: 'spawn_egg', mob: 'ravager' },
  warden_spawn_egg: { name: 'Warden Spawn Egg', icon: '/assets/items/warden_spawn_egg.png', type: 'spawn_egg', mob: 'warden' },
  ender_dragon_spawn_egg: { name: 'Ender Dragon Spawn Egg', icon: '/assets/items/ender_dragon_spawn_egg.png', type: 'spawn_egg', mob: 'ender_dragon' },
  wither_spawn_egg: { name: 'Wither Spawn Egg', icon: '/assets/items/wither_spawn_egg.png', type: 'spawn_egg', mob: 'wither' },
  happy_ghast_spawn_egg: { name: 'Happy Ghast Spawn Egg', icon: '/assets/items/happy_ghast_spawn_egg.png', type: 'spawn_egg', mob: 'happy_ghast' },
  copper_golem_spawn_egg: { name: 'Copper Golem Spawn Egg', icon: '/assets/items/copper_golem_spawn_egg.png', type: 'spawn_egg', mob: 'copper_golem' },
  camel_husk_spawn_egg: { name: 'Camel Husk Spawn Egg', icon: '/assets/items/camel_husk_spawn_egg.png', type: 'spawn_egg', mob: 'camel_husk' },
  piglin_brute_spawn_egg: { name: 'Piglin Brute Spawn Egg', icon: '/assets/items/piglin_brute_spawn_egg.png', type: 'spawn_egg', mob: 'piglin_brute' },
  giant_spawn_egg: { name: 'Giant Spawn Egg', icon: '/assets/items/giant_spawn_egg.png', type: 'spawn_egg', mob: 'giant' },

  // The nine vanilla mobs that could be spawned but had no egg.
  //
  // Every one of them is reachable through the mob dispatcher and the Inspector, so the only thing
  // missing was the item: `spawnMob('vex')` worked and there was no way for a player to ask for it.
  // `tests/spawnEggCoverage.test.js` is what keeps them honest -- it asserts each egg reaches a mob
  // that spawns as its own type, and all nine already pass that check.
  enderman_spawn_egg: { name: 'Enderman Spawn Egg', icon: '/assets/items/enderman_spawn_egg.png', type: 'spawn_egg', mob: 'enderman' },
  mooshroom_spawn_egg: { name: 'Mooshroom Spawn Egg', icon: '/assets/items/mooshroom_spawn_egg.png', type: 'spawn_egg', mob: 'mooshroom' },
  ocelot_spawn_egg: { name: 'Ocelot Spawn Egg', icon: '/assets/items/ocelot_spawn_egg.png', type: 'spawn_egg', mob: 'ocelot' },
  pufferfish_spawn_egg: { name: 'Pufferfish Spawn Egg', icon: '/assets/items/pufferfish_spawn_egg.png', type: 'spawn_egg', mob: 'pufferfish' },
  shulker_spawn_egg: { name: 'Shulker Spawn Egg', icon: '/assets/items/shulker_spawn_egg.png', type: 'spawn_egg', mob: 'shulker' },
  trader_llama_spawn_egg: { name: 'Trader Llama Spawn Egg', icon: '/assets/items/trader_llama_spawn_egg.png', type: 'spawn_egg', mob: 'trader_llama' },
  tropical_fish_spawn_egg: { name: 'Tropical Fish Spawn Egg', icon: '/assets/items/tropical_fish_spawn_egg.png', type: 'spawn_egg', mob: 'tropical_fish' },
  vex_spawn_egg: { name: 'Vex Spawn Egg', icon: '/assets/items/vex_spawn_egg.png', type: 'spawn_egg', mob: 'vex' },
  zoglin_spawn_egg: { name: 'Zoglin Spawn Egg', icon: '/assets/items/zoglin_spawn_egg.png', type: 'spawn_egg', mob: 'zoglin' },
};

// --- generated item additions for vanilla parity -----------------------------
//
// Merged by mutation so every existing reference to ITEMS keeps pointing at the same object, and
// guarded so a regenerated name can never silently replace a hand-written item -- which would lose
// hand-tuned stats such as a tool's attack damage.
for (const [key, def] of Object.entries(EXTRA_ITEMS)) {
  if (ITEMS[key] !== undefined) {
    throw new Error(`extraItems collision: '${key}' is already a hand-written item`);
  }
  ITEMS[key] = def;
}

// Potions are generated from POTION_DATA rather than from the recipe blocker analysis, so they live in
// their own module. Same guard, same reason: a generated potion must never replace a hand-written one,
// and `water_bottle` and `potion_of_fire_resistance` are hand-written.
for (const [key, def] of Object.entries(POTION_ITEMS)) {
  if (ITEMS[key] !== undefined) {
    throw new Error(`extraPotions collision: '${key}' is already a hand-written item`);
  }
  ITEMS[key] = def;
}

// --- stack limits that differ from 64 ----------------------------------------
//
// Vanilla stacks most things to 64, a few to 16 and everything with a durability or a container
// capacity to 1. Nothing declared any of that here: `stackSize` existed on the generated items only,
// and `inventory.js` merged to a hardcoded 64, so two diamond pickaxes became one stack of two and a
// stack of signs could hold sixty-four.
//
// Listed explicitly rather than matched by a pattern. `_helmet$|_sword$|...` would read shorter and
// would also swallow the next item whose name happens to end that way -- and the failure would be a
// silent stacking change, which is the kind of thing `scripts/generate-items.mjs` warns about in its
// own suffix table. The 16s are separated out because they are the interesting half: they are the
// items a player notices merging wrongly.
const STACK_LIMITS = {
  // Typed `tool` -- they are held and used like one -- but they carry no durability and vanilla stacks
  // them to 64. Without this they fell to the unstackable rule below and a compass could not be
  // stacked at all. Declared rather than special-cased in the rule, because the rule is about
  // durability and these four are the exceptions to the typing.
  64: [
    'compass', 'clock', 'lead', 'name_tag',
  ],
  16: [
    'bucket', 'honey_bottle', 'ender_pearl', 'snowball', 'egg', 'armor_stand',
  ],
  1: [
    'netherite_sword', 'diamond_sword', 'golden_sword', 'iron_sword', 'stone_sword', 'wooden_sword',
    'bow', 'crossbow', 'trident', 'totem_of_undying', 'netherite_helmet', 'netherite_chestplate',
    'netherite_leggings', 'netherite_boots', 'diamond_helmet', 'diamond_chestplate',
    'diamond_leggings', 'diamond_boots', 'iron_helmet', 'iron_chestplate', 'iron_leggings',
    'iron_boots', 'golden_helmet', 'golden_chestplate', 'golden_leggings', 'golden_boots',
    'chainmail_helmet', 'chainmail_chestplate', 'chainmail_leggings', 'chainmail_boots',
    'leather_helmet', 'leather_chestplate', 'leather_leggings', 'leather_boots', 'turtle_helmet',
    'shield', 'leather_horse_armor', 'diamond_horse_armor', 'golden_horse_armor', 'iron_horse_armor',
    'netherite_pickaxe', 'diamond_pickaxe', 'golden_pickaxe', 'iron_pickaxe', 'stone_pickaxe',
    'wooden_pickaxe', 'netherite_axe', 'diamond_axe', 'golden_axe', 'iron_axe', 'stone_axe',
    'wooden_axe', 'netherite_shovel', 'diamond_shovel', 'golden_shovel', 'iron_shovel',
    'stone_shovel', 'wooden_shovel', 'netherite_hoe', 'diamond_hoe', 'golden_hoe', 'iron_hoe',
    'stone_hoe', 'wooden_hoe', 'water_bucket', 'lava_bucket', 'milk_bucket', 'flint_and_steel',
    'shears', 'fishing_rod', 'saddle', 'oak_boat', 'minecart', 'chest_minecart',
    'furnace_minecart', 'hopper_minecart', 'tnt_minecart', 'elytra', 'beetroot_soup',
    'mushroom_stew', 'potion', 'enchanted_book', 'red_bed', 'carrot_on_a_stick',
    'warped_fungus_on_a_stick', 'suspicious_stew', 'rabbit_stew',
    // Added by other branches while this one was open: a brush wears out and a goat horn is a unique
    // instrument. Both were found by the Inspector on the merge, not by a reviewer noticing.
    'brush', 'goat_horn',
  ],
};

for (const [limit, ids] of Object.entries(STACK_LIMITS)) {
  for (const id of ids) {
    const def = ITEMS[id];
    // Missing means a renamed or removed item, and silently skipping it would leave a stack limit
    // unapplied -- the exact defect this table exists to fix. Fail loudly instead.
    if (!def) throw new Error(`STACK_LIMITS names '${id}', which is not an item`);
    if (def.stackSize !== undefined && def.stackSize !== Number(limit)) {
      throw new Error(`STACK_LIMITS disagrees with the definition of '${id}' (${def.stackSize})`);
    }
    def.stackSize = Number(limit);
  }
}

/**
 * How many of an item fit in one stack.
 *
 * The one place this is decided, so the inventory, the container UIs and the Resource Inspector cannot
 * drift apart. A block addressed by numeric id has no `ITEMS` entry and stacks to 64.
 *
 * @param {string|number} id
 * @returns {number}
 */
export function stackLimitFor(id) {
  const def = ITEMS[id];
  if (def && typeof def.stackSize === 'number') return def.stackSize;
  // A tool or weapon that declares nothing is unstackable; this is the rule the inventory already
  // applied on its dropped-item path, kept so a new tool is not silently stackable before its limit is
  // declared. Everything else, including every block, is 64.
  if (def && (def.type === 'tool' || def.type === 'weapon')) return 1;
  return 64;
}


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
BLOCK_DEFS[BLOCKS.IRON_DOOR] = {name: 'Iron Door', redstone: true, hardness: 5, sound: 'stone', transparent: true, solid: true, door: true, isIron: true, openId: BLOCKS.IRON_DOOR_OPEN, textures: {bottom: 'iron_door_bottom.png', top: 'iron_door_top.png', all: 'iron_door_bottom.png'}, icon: '/assets/items/iron_door.png', dropItem: 'iron_door'};
BLOCK_DEFS[BLOCKS.IRON_TRAPDOOR] = {name: 'Iron Trapdoor', redstone: true, hardness: 5, sound: 'stone', transparent: true, solid: true, trapdoor: true, isIron: true, openId: BLOCKS.IRON_TRAPDOOR_OPEN, textures: {all: 'iron_trapdoor.png'}, icon: '/assets/items/iron_trapdoor.png', dropItem: 'iron_trapdoor'};
BLOCK_DEFS[BLOCKS.NOTE_BLOCK] = {name: 'Note Block', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: true, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/note_block.svg'};
BLOCK_DEFS[BLOCKS.DISPENSER] = {name: 'Dispenser', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: true, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/dispenser.svg'};
BLOCK_DEFS[BLOCKS.DROPPER] = {name: 'Dropper', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: true, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/dropper.svg'};
BLOCK_DEFS[BLOCKS.HOPPER] = {name: 'Hopper', redstone: true, hardness: 1.5, sound: 'stone', transparent: true, solid: true, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/hopper.svg'};
BLOCK_DEFS[BLOCKS.IRON_DOOR_OPEN] = {name: 'Iron Door Open', redstone: true, hardness: 5, sound: 'stone', transparent: true, solid: false, door: true, isIron: true, internal: true, textures: {bottom: 'iron_door_bottom.png', top: 'iron_door_top.png', all: 'iron_door_bottom.png'}, icon: '/assets/items/iron_door.png', drop: BLOCKS.IRON_DOOR, dropItem: 'iron_door'};
BLOCK_DEFS[BLOCKS.IRON_TRAPDOOR_OPEN] = {name: 'Iron Trapdoor Open', redstone: true, hardness: 5, sound: 'stone', transparent: true, solid: false, trapdoor: true, isIron: true, internal: true, textures: {all: 'iron_trapdoor.png'}, icon: '/assets/items/iron_trapdoor.png', drop: BLOCKS.IRON_TRAPDOOR, dropItem: 'iron_trapdoor'};
BLOCK_DEFS[BLOCKS.TRIPWIRE_HOOK] = {name: 'Tripwire Hook', redstone: true, hardness: 0.5, sound: 'wood', transparent: true, solid: false, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/tripwire_hook.svg'};
BLOCK_DEFS[BLOCKS.TRIPWIRE] = {name: 'Tripwire', redstone: true, hardness: 0, sound: 'wool', transparent: true, solid: false, drop: 'string', textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/tripwire.svg'};

BLOCK_DEFS[BLOCKS.REDSTONE_WIRE].drop='redstone';
BLOCK_DEFS[BLOCKS.PISTON_HEAD].drop=null;
BLOCK_DEFS[BLOCKS.IRON_DOOR_OPEN].drop=BLOCKS.IRON_DOOR;
BLOCK_DEFS[BLOCKS.IRON_TRAPDOOR_OPEN].drop=BLOCKS.IRON_TRAPDOOR;
BLOCK_DEFS[BLOCKS.TRIPWIRE_HOOK].drop=BLOCKS.TRIPWIRE_HOOK;
BLOCK_DEFS[BLOCKS.TRIPWIRE].drop='string';

// --- Rails and wooden doors -------------------------------------------------
// Rails carry a direction in their redstone state so one block id covers straight,
// curved and sloped track. Wooden doors are opened by hand as well as by redstone,
// unlike the iron ones which are redstone only.
BLOCK_DEFS[BLOCKS.RAIL] = {name: 'Rail', redstone: true, hardness: 0.7, sound: 'metal', transparent: true, solid: false, rail: true, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/rail.svg'};
BLOCK_DEFS[BLOCKS.POWERED_RAIL] = {name: 'Powered Rail', redstone: true, hardness: 0.7, sound: 'metal', transparent: true, solid: false, rail: true, textures: {all: 'redstone_white.svg'}, icon: '/assets/blocks/powered_rail.svg'};
BLOCK_DEFS[BLOCKS.OAK_DOOR] = {name: 'Oak Door', redstone: true, hardness: 3, sound: 'wood', transparent: true, solid: true, door: true, isIron: false, openId: BLOCKS.OAK_DOOR_OPEN, textures: {bottom: 'oak_door_bottom.png', top: 'oak_door_top.png', all: 'oak_door_bottom.png'}, icon: '/assets/items/oak_door.png', dropItem: 'oak_door'};
BLOCK_DEFS[BLOCKS.OAK_DOOR_OPEN] = {name: 'Oak Door Open', redstone: true, hardness: 3, sound: 'wood', transparent: true, solid: false, door: true, isIron: false, internal: true, textures: {bottom: 'oak_door_bottom.png', top: 'oak_door_top.png', all: 'oak_door_bottom.png'}, icon: '/assets/items/oak_door.png', drop: BLOCKS.OAK_DOOR, dropItem: 'oak_door'};
BLOCK_DEFS[BLOCKS.OAK_TRAPDOOR] = {name: 'Oak Trapdoor', redstone: true, hardness: 3, sound: 'wood', transparent: true, solid: true, trapdoor: true, isIron: false, openId: BLOCKS.OAK_TRAPDOOR_OPEN, textures: {all: 'oak_trapdoor.png'}, icon: '/assets/items/oak_trapdoor.png', dropItem: 'oak_trapdoor'};
BLOCK_DEFS[BLOCKS.OAK_TRAPDOOR_OPEN] = {name: 'Oak Trapdoor Open', redstone: true, hardness: 3, sound: 'wood', transparent: true, solid: false, trapdoor: true, isIron: false, internal: true, textures: {all: 'oak_trapdoor.png'}, icon: '/assets/items/oak_trapdoor.png', drop: BLOCKS.OAK_TRAPDOOR, dropItem: 'oak_trapdoor'};

// Door upper halves (2-block tall doors)
BLOCK_DEFS[BLOCKS.OAK_DOOR_TOP] = {name: 'Oak Door', redstone: true, hardness: 3, sound: 'wood', transparent: true, solid: true, door: true, isTop: true, isIron: false, internal: true, textures: {top: 'oak_door_top.png', all: 'oak_door_top.png'}, icon: '/assets/items/oak_door.png', drop: BLOCKS.OAK_DOOR, dropItem: 'oak_door'};
BLOCK_DEFS[BLOCKS.OAK_DOOR_TOP_OPEN] = {name: 'Oak Door Open', redstone: true, hardness: 3, sound: 'wood', transparent: true, solid: false, door: true, isTop: true, isIron: false, internal: true, textures: {top: 'oak_door_top.png', all: 'oak_door_top.png'}, icon: '/assets/items/oak_door.png', drop: BLOCKS.OAK_DOOR, dropItem: 'oak_door'};
BLOCK_DEFS[BLOCKS.IRON_DOOR_TOP] = {name: 'Iron Door', redstone: true, hardness: 5, sound: 'stone', transparent: true, solid: true, door: true, isTop: true, isIron: true, internal: true, textures: {top: 'iron_door_top.png', all: 'iron_door_top.png'}, icon: '/assets/items/iron_door.png', drop: BLOCKS.IRON_DOOR, dropItem: 'iron_door'};
BLOCK_DEFS[BLOCKS.IRON_DOOR_TOP_OPEN] = {name: 'Iron Door Open', redstone: true, hardness: 5, sound: 'stone', transparent: true, solid: false, door: true, isTop: true, isIron: true, internal: true, textures: {top: 'iron_door_top.png', all: 'iron_door_top.png'}, icon: '/assets/items/iron_door.png', drop: BLOCKS.IRON_DOOR, dropItem: 'iron_door'};

// A closed wooden door drops itself when broken; an open one drops the closed form.
BLOCK_DEFS[BLOCKS.OAK_DOOR].openId = BLOCKS.OAK_DOOR_OPEN;
BLOCK_DEFS[BLOCKS.OAK_DOOR_OPEN].drop = BLOCKS.OAK_DOOR;
BLOCK_DEFS[BLOCKS.OAK_TRAPDOOR].openId = BLOCKS.OAK_TRAPDOOR_OPEN;
BLOCK_DEFS[BLOCKS.OAK_TRAPDOOR_OPEN].drop = BLOCKS.OAK_TRAPDOOR;
BLOCK_DEFS[BLOCKS.RAIL].drop = BLOCKS.RAIL;
BLOCK_DEFS[BLOCKS.POWERED_RAIL].drop = BLOCKS.POWERED_RAIL;

// --- Bed Blocks -------------------------------------------------------------
BLOCK_DEFS[BLOCKS.RED_BED_FOOT] = {
  name: 'Red Bed',
  bed: true,
  // Red is the one bed that predates the generated set. It carries the colour explicitly so every bed
  // has the same shape of definition, which is what lets a test iterate all 16 without a special case.
  bedColour: 'red',
  isHead: false,
  hardness: 0.2,
  sound: 'wood',
  transparent: true,
  solid: true,
  dropItem: 'red_bed',
  textures: { all: 'red_wool.png' },
  icon: '/assets/items/red_bed.png'
};

BLOCK_DEFS[BLOCKS.RED_BED_HEAD] = {
  name: 'Red Bed Head',
  bed: true,
  bedColour: 'red',
  isHead: true,
  hardness: 0.2,
  sound: 'wood',
  transparent: true,
  solid: true,
  dropItem: 'red_bed',
  textures: { all: 'red_wool.png' },
  icon: '/assets/items/red_bed.png'
};

// --- Chest Block ------------------------------------------------------------
BLOCK_DEFS[BLOCKS.CHEST] = {
  name: 'Chest',
  chest: true,
  hardness: 2.5,
  sound: 'wood',
  transparent: true,
  solid: true,
  dropItem: 'chest',
  textures: {
    top: 'chest_top.png',
    bottom: 'chest_top.png',
    side: 'chest_side.png',
    front: 'chest_front.png',
    all: 'chest_side.png',
    lock: 'chest_lock.png'
  },
  icon: '/assets/items/chest.png'
};

// --- Nether Portal Block ----------------------------------------------------
BLOCK_DEFS[BLOCKS.NETHER_PORTAL] = {
  name: 'Nether Portal',
  portal: true,
  hardness: 0,
  sound: 'glass',
  transparent: true,
  solid: false,
  light: 11,
  lightColor: 0x9333ea,
  drop: null,
  textures: {
    all: 'nether_portal.png'
  }
};
