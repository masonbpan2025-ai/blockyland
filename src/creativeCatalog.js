import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
import { BuildingLibrary } from './buildingLibrary.js';
import { MobLibrary } from './mobLibrary.js';

export const CREATIVE_TABS = [
  { id: 'building_blocks', name: 'Building Blocks', icon: '/assets/blocks/bricks.png' },
  { id: 'colored_blocks', name: 'Colored Blocks', icon: '/assets/blocks/red_wool.png' },
  { id: 'natural_blocks', name: 'Natural Blocks', icon: '/assets/blocks/grass_block_side.png' },
  { id: 'functional_blocks', name: 'Functional Blocks', icon: '/assets/blocks/torch.png' },
  { id: 'redstone_blocks', name: 'Redstone Blocks', icon: '/assets/items/redstone.png' },
  { id: 'tools_utilities', name: 'Tools & Utilities', icon: '/assets/items/diamond_pickaxe.png' },
  { id: 'combat', name: 'Combat', icon: '/assets/items/diamond_sword.png' },
  { id: 'food_drinks', name: 'Food & Drinks', icon: '/assets/items/golden_apple.png' },
  { id: 'ingredients', name: 'Ingredients', icon: '/assets/items/iron_ingot.png' },
  { id: 'spawn_eggs', name: 'Spawn Eggs', icon: '/assets/items/spawn_egg.png' },
  { id: 'building', name: 'Buildings', icon: '/assets/blocks/crafting_table_top.png' },
  { id: 'all_items', name: 'Search / All Items', icon: '/assets/items/compass.png' }
];

function blockItem(blockId, tab, customName = null) {
  const def = BLOCK_DEFS[blockId];
  if (!def) return null;
  const icon = def.icon || (def.textures
    ? `/assets/blocks/${def.textures.all || def.textures.side || def.textures.top || 'dirt.png'}`
    : '/assets/blocks/dirt.png');
  const name = customName || def.name;
  return {
    id: blockId,
    name,
    icon,
    isBlock: true,
    tab,
    count: 64,
    searchTerms: `${name.toLowerCase()} block ${tab.replace('_', ' ')}`
  };
}

function itemEntry(itemId, tab, customName = null) {
  const def = ITEMS[itemId];
  if (!def) return null;
  const name = customName || def.name;
  return {
    id: itemId,
    name,
    icon: def.icon,
    isBlock: Boolean(def.isBlock),
    blockId: def.blockId,
    tab,
    count: (def.type === 'tool' || def.type === 'weapon' || def.type === 'armor' || def.type === 'special') ? 1 : 64,
    searchTerms: `${name.toLowerCase()} ${def.type || ''} ${tab.replace('_', ' ')}`
  };
}

export function buildCreativeCatalog() {
  const catalog = [];

  // 1. Building Blocks
  const buildingBlocksList = [
    BLOCKS.STONE, BLOCKS.SMOOTH_STONE, BLOCKS.COBBLESTONE, BLOCKS.MOSSY_COBBLESTONE, BLOCKS.STONE_BRICKS,
    BLOCKS.BRICKS, BLOCKS.SANDSTONE, BLOCKS.OAK_PLANKS, BLOCKS.BOOKSHELF,
    BLOCKS.GLASS, BLOCKS.OBSIDIAN, BLOCKS.BEDROCK, BLOCKS.CLAY,
    BLOCKS.NETHERRACK, BLOCKS.SOUL_SAND, BLOCKS.END_STONE, BLOCKS.COAL_BLOCK
  ];
  for (const b of buildingBlocksList) {
    const entry = blockItem(b, 'building_blocks');
    if (entry) catalog.push(entry);
  }

  // 2. Colored Blocks
  const coloredBlocksList = [
    BLOCKS.WHITE_WOOL, BLOCKS.RED_WOOL, BLOCKS.BLUE_WOOL,
    BLOCKS.YELLOW_WOOL, BLOCKS.GREEN_WOOL, BLOCKS.BLACK_WOOL,
    // Glazed terracotta, all sixteen. These belong in the colour tab rather than with the building
    // blocks because the colour is the point of the block; the pattern is decoration on top of it.
    BLOCKS.WHITE_GLAZED_TERRACOTTA, BLOCKS.ORANGE_GLAZED_TERRACOTTA, BLOCKS.MAGENTA_GLAZED_TERRACOTTA,
    BLOCKS.LIGHT_BLUE_GLAZED_TERRACOTTA, BLOCKS.YELLOW_GLAZED_TERRACOTTA, BLOCKS.LIME_GLAZED_TERRACOTTA,
    BLOCKS.PINK_GLAZED_TERRACOTTA, BLOCKS.GRAY_GLAZED_TERRACOTTA, BLOCKS.LIGHT_GRAY_GLAZED_TERRACOTTA,
    BLOCKS.CYAN_GLAZED_TERRACOTTA, BLOCKS.PURPLE_GLAZED_TERRACOTTA, BLOCKS.BLUE_GLAZED_TERRACOTTA,
    BLOCKS.BROWN_GLAZED_TERRACOTTA, BLOCKS.GREEN_GLAZED_TERRACOTTA, BLOCKS.RED_GLAZED_TERRACOTTA,
    BLOCKS.BLACK_GLAZED_TERRACOTTA,
    // Shulker boxes, all seventeen. They sit in the colour tab because a dyed box is chosen for its
    // colour, and it is the only tab where the family reads as a set next to the wool and terracotta.
    //
    // Listed here despite being storage blocks in vanilla BECAUSE they are not storage blocks here: this
    // game has no block-inventory layer, so a shulker box is a solid decorative cube that drops itself.
    // Putting it in the functional tab beside the chest would imply an inventory it does not have.
    BLOCKS.SHULKER_BOX,
    BLOCKS.WHITE_SHULKER_BOX, BLOCKS.ORANGE_SHULKER_BOX, BLOCKS.MAGENTA_SHULKER_BOX,
    BLOCKS.LIGHT_BLUE_SHULKER_BOX, BLOCKS.YELLOW_SHULKER_BOX, BLOCKS.LIME_SHULKER_BOX,
    BLOCKS.PINK_SHULKER_BOX, BLOCKS.GRAY_SHULKER_BOX, BLOCKS.LIGHT_GRAY_SHULKER_BOX,
    BLOCKS.CYAN_SHULKER_BOX, BLOCKS.PURPLE_SHULKER_BOX, BLOCKS.BLUE_SHULKER_BOX,
    BLOCKS.BROWN_SHULKER_BOX, BLOCKS.GREEN_SHULKER_BOX, BLOCKS.RED_SHULKER_BOX,
    BLOCKS.BLACK_SHULKER_BOX
  ];
  for (const b of coloredBlocksList) {
    const entry = blockItem(b, 'colored_blocks');
    if (entry) catalog.push(entry);
  }

  // 3. Natural Blocks
  const naturalBlocksList = [
    BLOCKS.GRASS, BLOCKS.DIRT, BLOCKS.FARMLAND, BLOCKS.FARMLAND_MOIST, BLOCKS.SAND, BLOCKS.GRAVEL,
    BLOCKS.OAK_LOG, BLOCKS.OAK_LEAVES, BLOCKS.CACTUS, BLOCKS.SNOW, BLOCKS.ICE,
    BLOCKS.POPPY, BLOCKS.DANDELION,
    // The saplings. Each is its own item because breaking one returns the sapling itself, so they need
    // no separate ITEMS entry -- blockItem() derives name and icon from the definition.
    BLOCKS.OAK_SAPLING, BLOCKS.SPRUCE_SAPLING, BLOCKS.BIRCH_SAPLING, BLOCKS.JUNGLE_SAPLING,
    BLOCKS.ACACIA_SAPLING, BLOCKS.CHERRY_SAPLING, BLOCKS.DARK_OAK_SAPLING, BLOCKS.PALE_OAK_SAPLING,
    BLOCKS.MANGROVE_PROPAGULE,
    BLOCKS.COAL_ORE, BLOCKS.IRON_ORE, BLOCKS.GOLD_ORE, BLOCKS.DIAMOND_ORE,
    BLOCKS.REDSTONE_ORE, BLOCKS.EMERALD_ORE,
    // The rest of the ore family. blockItem() derives the icon from the definition's texture, so
    // these need no separate icon asset.
    BLOCKS.COPPER_ORE, BLOCKS.LAPIS_ORE, BLOCKS.NETHER_GOLD_ORE, BLOCKS.NETHER_QUARTZ_ORE,
    BLOCKS.DEEPSLATE_COAL_ORE, BLOCKS.DEEPSLATE_IRON_ORE, BLOCKS.DEEPSLATE_GOLD_ORE,
    BLOCKS.DEEPSLATE_DIAMOND_ORE, BLOCKS.DEEPSLATE_EMERALD_ORE, BLOCKS.DEEPSLATE_REDSTONE_ORE,
    BLOCKS.DEEPSLATE_LAPIS_ORE, BLOCKS.DEEPSLATE_COPPER_ORE,
    // Infested stone. Listed even though they are unobtainable in survival without Silk Touch in
    // vanilla, because they are placeable in creative and the block is what makes a silverfish trap.
    BLOCKS.INFESTED_STONE, BLOCKS.INFESTED_COBBLESTONE, BLOCKS.INFESTED_STONE_BRICKS,
    BLOCKS.INFESTED_MOSSY_STONE_BRICKS, BLOCKS.INFESTED_CRACKED_STONE_BRICKS,
    BLOCKS.INFESTED_CHISELED_STONE_BRICKS, BLOCKS.INFESTED_DEEPSLATE,
    // Resin. The clump is a plant-like growth; the block and the two brick forms are building blocks.
    // Their slab, stair and wall variants already existed.
    BLOCKS.RESIN_CLUMP, BLOCKS.RESIN_BLOCK, BLOCKS.RESIN_BRICKS, BLOCKS.CHISELED_RESIN_BRICKS,
    // Ground cover. Dead bush and cobweb are listed alongside the two plants because they are the same
    // cross-quad shape, even though cobweb is harvested with a sword and drops string.
    BLOCKS.SHORT_GRASS, BLOCKS.FERN, BLOCKS.DEAD_BUSH, BLOCKS.COBWEB,
    // Eyeblossoms. Both daylight states are listed because neither opens or closes on its own here.
    BLOCKS.OPEN_EYEBLOSSOM, BLOCKS.CLOSED_EYEBLOSSOM,
    // Nether and deepslate cubes, plus the two azalea bushes. Shroomlight is here rather than with the
    // light sources because it is a natural block, even though it emits at 15.
    BLOCKS.SHROOMLIGHT, BLOCKS.CRACKED_NETHER_BRICKS, BLOCKS.ANCIENT_DEBRIS,
    BLOCKS.REINFORCED_DEEPSLATE, BLOCKS.CREAKING_HEART, BLOCKS.FROSTED_ICE,
    BLOCKS.FLOWERING_AZALEA_LEAVES, BLOCKS.AZALEA, BLOCKS.FLOWERING_AZALEA,
    // Coral blocks, alive and dead. Both are listed because a living block drops its dead form, so the
    // dead ones are obtainable in survival and belong in the menu beside their living counterparts.
    BLOCKS.TUBE_CORAL_BLOCK, BLOCKS.BRAIN_CORAL_BLOCK, BLOCKS.BUBBLE_CORAL_BLOCK,
    BLOCKS.FIRE_CORAL_BLOCK, BLOCKS.HORN_CORAL_BLOCK,
    BLOCKS.DEAD_TUBE_CORAL_BLOCK, BLOCKS.DEAD_BRAIN_CORAL_BLOCK, BLOCKS.DEAD_BUBBLE_CORAL_BLOCK,
    BLOCKS.DEAD_FIRE_CORAL_BLOCK, BLOCKS.DEAD_HORN_CORAL_BLOCK,
    // Coral fans, which complete the coral family, and the hanging vines. All of these are cross-quad
    // decoration, and the three vines are ceiling-anchored like hanging roots.
    BLOCKS.TUBE_CORAL_FAN, BLOCKS.BRAIN_CORAL_FAN, BLOCKS.BUBBLE_CORAL_FAN,
    BLOCKS.FIRE_CORAL_FAN, BLOCKS.HORN_CORAL_FAN,
    BLOCKS.DEAD_TUBE_CORAL_FAN, BLOCKS.DEAD_BRAIN_CORAL_FAN, BLOCKS.DEAD_BUBBLE_CORAL_FAN,
    BLOCKS.DEAD_FIRE_CORAL_FAN, BLOCKS.DEAD_HORN_CORAL_FAN,
    // The wall-mounted coral fans. Listed beside the upright ones because they are the same plant in its
    // other placement, and each drops itself so both are obtainable in survival.
    BLOCKS.TUBE_CORAL_WALL_FAN, BLOCKS.BRAIN_CORAL_WALL_FAN, BLOCKS.BUBBLE_CORAL_WALL_FAN,
    BLOCKS.FIRE_CORAL_WALL_FAN, BLOCKS.HORN_CORAL_WALL_FAN,
    BLOCKS.DEAD_TUBE_CORAL_WALL_FAN, BLOCKS.DEAD_BRAIN_CORAL_WALL_FAN,
    BLOCKS.DEAD_BUBBLE_CORAL_WALL_FAN, BLOCKS.DEAD_FIRE_CORAL_WALL_FAN,
    BLOCKS.DEAD_HORN_CORAL_WALL_FAN,
    BLOCKS.WEEPING_VINES, BLOCKS.TWISTING_VINES, BLOCKS.CAVE_VINES,
    // The vine body segments. Listed even though a player rarely places them, because they are real
    // blocks with their own textures and a builder placing a long vine wants both parts.
    BLOCKS.WEEPING_VINES_PLANT, BLOCKS.TWISTING_VINES_PLANT, BLOCKS.CAVE_VINES_PLANT,
    // Crop stems and water plants. The stems are listed beside the pumpkin and melon they belong to in
    // spirit, but they sit in the natural tab with the other plants because that is what they are.
    BLOCKS.PUMPKIN_STEM, BLOCKS.ATTACHED_PUMPKIN_STEM, BLOCKS.MELON_STEM, BLOCKS.ATTACHED_MELON_STEM,
    BLOCKS.SEAGRASS, BLOCKS.TALL_SEAGRASS, BLOCKS.KELP, BLOCKS.KELP_PLANT, BLOCKS.SEA_PICKLE,
    // Dripleaf and sculk. The stem is listed beside its leaf because a player builds the two-high plant by
    // hand here rather than growing it, so both halves need to be reachable.
    BLOCKS.BIG_DRIPLEAF, BLOCKS.BIG_DRIPLEAF_STEM, BLOCKS.SMALL_DRIPLEAF,
    BLOCKS.SCULK_VEIN, BLOCKS.PALE_HANGING_MOSS,
    // Potted plants. All thirty-seven are listed so the family reads as a set, and each drops itself, so
    // every one is obtainable in survival rather than only placeable from the menu.
    BLOCKS.POTTED_ACACIA_SAPLING, BLOCKS.POTTED_ALLIUM, BLOCKS.POTTED_AZALEA_BUSH,
    BLOCKS.POTTED_AZURE_BLUET, BLOCKS.POTTED_BAMBOO, BLOCKS.POTTED_BIRCH_SAPLING,
    BLOCKS.POTTED_BLUE_ORCHID, BLOCKS.POTTED_BROWN_MUSHROOM, BLOCKS.POTTED_CACTUS,
    BLOCKS.POTTED_CHERRY_SAPLING, BLOCKS.POTTED_CLOSED_EYEBLOSSOM, BLOCKS.POTTED_CORNFLOWER,
    BLOCKS.POTTED_CRIMSON_FUNGUS, BLOCKS.POTTED_CRIMSON_ROOTS, BLOCKS.POTTED_DANDELION,
    BLOCKS.POTTED_DARK_OAK_SAPLING, BLOCKS.POTTED_DEAD_BUSH, BLOCKS.POTTED_FERN,
    BLOCKS.POTTED_FLOWERING_AZALEA_BUSH, BLOCKS.POTTED_JUNGLE_SAPLING,
    BLOCKS.POTTED_LILY_OF_THE_VALLEY, BLOCKS.POTTED_MANGROVE_PROPAGULE, BLOCKS.POTTED_OAK_SAPLING,
    BLOCKS.POTTED_OPEN_EYEBLOSSOM, BLOCKS.POTTED_ORANGE_TULIP, BLOCKS.POTTED_OXEYE_DAISY,
    BLOCKS.POTTED_PALE_OAK_SAPLING, BLOCKS.POTTED_PINK_TULIP, BLOCKS.POTTED_POPPY,
    BLOCKS.POTTED_RED_MUSHROOM, BLOCKS.POTTED_RED_TULIP, BLOCKS.POTTED_SPRUCE_SAPLING,
    BLOCKS.POTTED_TORCHFLOWER, BLOCKS.POTTED_WARPED_FUNGUS, BLOCKS.POTTED_WARPED_ROOTS,
    BLOCKS.POTTED_WHITE_TULIP, BLOCKS.POTTED_WITHER_ROSE,
    // Tall and ceiling plants. Hanging roots is ceiling-anchored, which is a placement consequence
    // rather than a catalogue one, so it sits here with the rest of the ground cover.
    BLOCKS.TALL_GRASS, BLOCKS.LARGE_FERN, BLOCKS.SPORE_BLOSSOM, BLOCKS.HANGING_ROOTS,
    // Amethyst. Listed as a family: the budding block, the cluster and the three bud stages, so a
    // player can place any stage even though only a budding block would grow them in vanilla.
    BLOCKS.BUDDING_AMETHYST, BLOCKS.AMETHYST_CLUSTER,
    BLOCKS.LARGE_AMETHYST_BUD, BLOCKS.MEDIUM_AMETHYST_BUD, BLOCKS.SMALL_AMETHYST_BUD,
    BLOCKS.SPONGE, BLOCKS.WET_SPONGE,
    BLOCKS.WATER, BLOCKS.LAVA
  ];
  for (const b of naturalBlocksList) {
    const entry = blockItem(b, 'natural_blocks');
    if (entry) catalog.push(entry);
  }

  // 4. Functional Blocks
  const functionalBlocksList = [
    BLOCKS.CHEST, BLOCKS.SOUL_TORCH, BLOCKS.LIT_FURNACE, BLOCKS.TORCH, BLOCKS.CRAFTING_TABLE, BLOCKS.FURNACE, BLOCKS.RED_BED_FOOT, BLOCKS.LADDER,
    // The wall torches, beside the standing ones. They drop their standing form, so both are obtainable.
    BLOCKS.WALL_TORCH, BLOCKS.SOUL_WALL_TORCH, BLOCKS.REDSTONE_WALL_TORCH,
    BLOCKS.GLOWSTONE, BLOCKS.SEA_LANTERN, BLOCKS.ENCHANTING_TABLE, BLOCKS.ANVIL,
    // The technical blocks. They are in the functional tab because that is what they ARE in vanilla --
    // machinery -- even though in this engine every one of them is inert decoration. Putting them
    // anywhere else would imply they are building material, which is further from the truth.
    BLOCKS.COMMAND_BLOCK, BLOCKS.REPEATING_COMMAND_BLOCK, BLOCKS.CHAIN_COMMAND_BLOCK,
    BLOCKS.STRUCTURE_BLOCK, BLOCKS.JIGSAW, BLOCKS.SPAWNER, BLOCKS.TRIAL_SPAWNER, BLOCKS.VAULT,
    BLOCKS.END_PORTAL_FRAME, BLOCKS.TURTLE_EGG, BLOCKS.FROGSPAWN,
    // Cake and candle cakes. In the functional tab beside the other candles because a candle cake is a
    // candle on a cake, and the plain cake is there so the family reads together -- even though a cake
    // cannot be eaten here, which is recorded in the source.
    BLOCKS.CAKE, BLOCKS.CANDLE_CAKE,
    BLOCKS.WHITE_CANDLE_CAKE, BLOCKS.ORANGE_CANDLE_CAKE, BLOCKS.MAGENTA_CANDLE_CAKE,
    BLOCKS.LIGHT_BLUE_CANDLE_CAKE, BLOCKS.YELLOW_CANDLE_CAKE, BLOCKS.LIME_CANDLE_CAKE,
    BLOCKS.PINK_CANDLE_CAKE, BLOCKS.GRAY_CANDLE_CAKE, BLOCKS.LIGHT_GRAY_CANDLE_CAKE,
    BLOCKS.CYAN_CANDLE_CAKE, BLOCKS.PURPLE_CANDLE_CAKE, BLOCKS.BLUE_CANDLE_CAKE,
    BLOCKS.BROWN_CANDLE_CAKE, BLOCKS.GREEN_CANDLE_CAKE, BLOCKS.RED_CANDLE_CAKE,
    BLOCKS.BLACK_CANDLE_CAKE,

    // The sign family: standing, wall, hanging and wall-hanging, for every wood. None of these was in the
    // catalogue before, including the standing signs that already existed -- they were craftable but not
    // placeable from the menu.
    BLOCKS.OAK_SIGN,
    BLOCKS.SPRUCE_SIGN,
    BLOCKS.BIRCH_SIGN,
    BLOCKS.ACACIA_SIGN,
    BLOCKS.CHERRY_SIGN,
    BLOCKS.JUNGLE_SIGN,
    BLOCKS.DARK_OAK_SIGN,
    BLOCKS.PALE_OAK_SIGN,
    BLOCKS.MANGROVE_SIGN,
    BLOCKS.BAMBOO_SIGN,
    BLOCKS.CRIMSON_SIGN,
    BLOCKS.WARPED_SIGN,
    BLOCKS.OAK_WALL_SIGN,
    BLOCKS.SPRUCE_WALL_SIGN,
    BLOCKS.BIRCH_WALL_SIGN,
    BLOCKS.ACACIA_WALL_SIGN,
    BLOCKS.CHERRY_WALL_SIGN,
    BLOCKS.JUNGLE_WALL_SIGN,
    BLOCKS.DARK_OAK_WALL_SIGN,
    BLOCKS.PALE_OAK_WALL_SIGN,
    BLOCKS.MANGROVE_WALL_SIGN,
    BLOCKS.BAMBOO_WALL_SIGN,
    BLOCKS.CRIMSON_WALL_SIGN,
    BLOCKS.WARPED_WALL_SIGN,
    BLOCKS.OAK_HANGING_SIGN,
    BLOCKS.SPRUCE_HANGING_SIGN,
    BLOCKS.BIRCH_HANGING_SIGN,
    BLOCKS.ACACIA_HANGING_SIGN,
    BLOCKS.CHERRY_HANGING_SIGN,
    BLOCKS.JUNGLE_HANGING_SIGN,
    BLOCKS.DARK_OAK_HANGING_SIGN,
    BLOCKS.PALE_OAK_HANGING_SIGN,
    BLOCKS.MANGROVE_HANGING_SIGN,
    BLOCKS.BAMBOO_HANGING_SIGN,
    BLOCKS.CRIMSON_HANGING_SIGN,
    BLOCKS.WARPED_HANGING_SIGN,
    BLOCKS.OAK_WALL_HANGING_SIGN,
    BLOCKS.SPRUCE_WALL_HANGING_SIGN,
    BLOCKS.BIRCH_WALL_HANGING_SIGN,
    BLOCKS.ACACIA_WALL_HANGING_SIGN,
    BLOCKS.CHERRY_WALL_HANGING_SIGN,
    BLOCKS.JUNGLE_WALL_HANGING_SIGN,
    BLOCKS.DARK_OAK_WALL_HANGING_SIGN,
    BLOCKS.PALE_OAK_WALL_HANGING_SIGN,
    BLOCKS.MANGROVE_WALL_HANGING_SIGN,
    BLOCKS.BAMBOO_WALL_HANGING_SIGN,
    BLOCKS.CRIMSON_WALL_HANGING_SIGN,
    BLOCKS.WARPED_WALL_HANGING_SIGN,
  ];
  for (const b of functionalBlocksList) {
    const entry = blockItem(b, 'functional_blocks');
    if (entry) catalog.push(entry);
  }
  const functionalItemsList = [
    'chest', 'red_bed', 'armor_stand', 'item_frame', 'painting', 'brewing_stand', 'cauldron'
  ];
  for (const it of functionalItemsList) {
    const entry = itemEntry(it, 'functional_blocks');
    if (entry) catalog.push(entry);
  }

  // 5. Redstone Blocks & Mechanisms
  const redstoneBlocksList = [
    ...Object.keys(BLOCK_DEFS).map(Number).filter(id => id >= BLOCKS.REDSTONE_WIRE && BLOCK_DEFS[id].redstone && !BLOCK_DEFS[id].internal),
    BLOCKS.REDSTONE_TORCH, BLOCKS.LEVER, BLOCKS.REDSTONE_LAMP, BLOCKS.TNT, BLOCKS.REDSTONE_ORE
  ];
  for (const b of redstoneBlocksList) {
    const entry = blockItem(b, 'redstone_blocks');
    if (entry) catalog.push(entry);
  }
  const redstoneItems = ['redstone', 'glowstone_dust'];
  for (const it of redstoneItems) {
    const entry = itemEntry(it, 'redstone_blocks');
    if (entry) catalog.push(entry);
  }

  // 6. Tools & Utilities
  const toolsList = [
    // Shovels
    'netherite_shovel', 'diamond_shovel', 'golden_shovel', 'iron_shovel', 'stone_shovel', 'wooden_shovel',
    // Pickaxes
    'netherite_pickaxe', 'diamond_pickaxe', 'golden_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 'wooden_pickaxe',
    // Axes
    'netherite_axe', 'diamond_axe', 'golden_axe', 'iron_axe', 'stone_axe', 'wooden_axe',
    // Hoes
    'netherite_hoe', 'diamond_hoe', 'golden_hoe', 'iron_hoe', 'stone_hoe', 'wooden_hoe',
    // Utilities
    'bucket', 'water_bucket', 'lava_bucket', 'milk_bucket',
    'fishing_rod', 'flint_and_steel', 'shears',
    'compass', 'clock', 'lead', 'name_tag', 'saddle',
    'oak_boat', 'minecart', 'chest_minecart',
    'elytra', 'firework_rocket',
    'experience_bottle', 'enchanted_book'
  ];
  for (const it of toolsList) {
    const entry = itemEntry(it, 'tools_utilities');
    if (entry) catalog.push(entry);
  }

  // 7. Combat
  const combatList = [
    // Swords
    'netherite_sword', 'diamond_sword', 'golden_sword', 'iron_sword', 'stone_sword', 'wooden_sword',
    'trident', 'bow', 'crossbow', 'arrow',
    'shield', 'totem_of_undying',
    // Armor
    'netherite_helmet', 'netherite_chestplate', 'netherite_leggings', 'netherite_boots',
    'diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots',
    'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots',
    'golden_helmet', 'golden_chestplate', 'golden_leggings', 'golden_boots',
    'chainmail_helmet', 'chainmail_chestplate', 'chainmail_leggings', 'chainmail_boots',
    'leather_helmet', 'leather_chestplate', 'leather_leggings', 'leather_boots',
    'turtle_helmet',
    'diamond_horse_armor', 'golden_horse_armor', 'iron_horse_armor'
  ];
  for (const it of combatList) {
    const entry = itemEntry(it, 'combat');
    if (entry) catalog.push(entry);
  }

  // 8. Food & Drinks
  const foodList = [
    'golden_apple', 'apple', 'bread',
    'cooked_beef', 'beef', 'cooked_porkchop', 'porkchop',
    'cooked_chicken', 'chicken', 'cooked_mutton', 'mutton',
    'cooked_rabbit', 'rabbit',
    'cooked_salmon', 'salmon', 'cooked_cod', 'cod',
    'dried_kelp', 'kelp',
    'golden_carrot', 'carrot', 'baked_potato', 'potato', 'poisonous_potato',
    'beetroot_soup', 'beetroot', 'mushroom_stew',
    'cookie', 'melon_slice', 'glistering_melon_slice',
    'sweet_berries', 'glow_berries', 'honey_bottle',
    'potion', 'glass_bottle'
  ];
  for (const it of foodList) {
    const entry = itemEntry(it, 'food_drinks');
    if (entry) catalog.push(entry);
  }

  // 9. Ingredients
  const ingredientsList = [
    'netherite_ingot', 'diamond', 'emerald', 'gold_ingot', 'iron_ingot', 'copper_ingot',
    'raw_iron', 'raw_gold', 'raw_copper',
    'coal', 'charcoal', 'lapis_lazuli', 'quartz', 'amethyst_shard',
    'redstone', 'glowstone_dust',
    'stick', 'string', 'feather', 'gunpowder', 'wheat', 'wheat_seeds',
    'pumpkin_seeds', 'melon_seeds', 'beetroot_seeds',
    'bone', 'bone_meal', 'sugar', 'leather', 'paper', 'book',
    'clay_ball', 'brick', 'nether_brick', 'green_dye',
    'ender_pearl', 'ender_eye', 'blaze_rod', 'blaze_powder', 'magma_cream', 'slime_ball',
    'snowball', 'egg', 'fire_charge'
  ];
  for (const it of ingredientsList) {
    const entry = itemEntry(it, 'ingredients');
    if (entry) catalog.push(entry);
  }

  // 10. Mob Spawn Eggs
  const spawnEggsList = [
    'villager_spawn_egg', 'iron_golem_spawn_egg', 'pillager_spawn_egg',
    'zombie_spawn_egg', 'skeleton_spawn_egg', 'creeper_spawn_egg', 'spider_spawn_egg', 'cave_spider_spawn_egg', 'silverfish_spawn_egg', 'endermite_spawn_egg', 'rabbit_spawn_egg', 'bat_spawn_egg', 'fox_spawn_egg', 'bee_spawn_egg', 'goat_spawn_egg', 'llama_spawn_egg', 'turtle_spawn_egg', 'frog_spawn_egg', 'tadpole_spawn_egg', 'parrot_spawn_egg',
    'pig_spawn_egg', 'cow_spawn_egg', 'sheep_spawn_egg', 'chicken_spawn_egg',
    'salmon_spawn_egg', 'cod_spawn_egg', 'dolphin_spawn_egg', 'squid_spawn_egg', 'glow_squid_spawn_egg', 'guardian_spawn_egg', 'elder_guardian_spawn_egg', 'drowned_spawn_egg', 'octopus_spawn_egg', 'axolotl_spawn_egg',
    'horse_spawn_egg', 'donkey_spawn_egg', 'mule_spawn_egg', 'wolf_spawn_egg', 'cat_spawn_egg',
    'slime_spawn_egg', 'magma_cube_spawn_egg', 'witch_spawn_egg',
    'ghast_spawn_egg', 'blaze_spawn_egg', 'wither_skeleton_spawn_egg', 'piglin_spawn_egg', 'zombified_piglin_spawn_egg', 'zombie_pigman_spawn_egg', 'hoglin_spawn_egg', 'strider_spawn_egg',
    'phantom_spawn_egg', 'vindicator_spawn_egg', 'evoker_spawn_egg', 'ravager_spawn_egg', 'warden_spawn_egg', 'ender_dragon_spawn_egg', 'wither_spawn_egg',
    // Added after the fact. These eggs were registered as real items and were reachable through the mob
    // dispatcher and the Inspector, but the creative spawn-egg category reads THIS list and it stopped at the
    // older mobs, so they never appeared in the creative menu.
    'allay_spawn_egg', 'sniffer_spawn_egg', 'breeze_spawn_egg', 'armadillo_spawn_egg',
    'camel_spawn_egg', 'parched_spawn_egg', 'wandering_trader_spawn_egg', 'creaking_spawn_egg', 'killer_bunny_spawn_egg', 'snow_golem_spawn_egg', 'illusioner_spawn_egg', 'skeleton_horse_spawn_egg', 'zombie_horse_spawn_egg', 'pufferfish_spawn_egg', 'tropical_fish_spawn_egg', 'giant_spawn_egg', 'piglin_brute_spawn_egg', 'camel_husk_spawn_egg', 'copper_golem_spawn_egg', 'happy_ghast_spawn_egg',
    // Six eggs that were registered as items and reachable in the world but absent from this list, so a
    // player could not find them in the menu at all. Found by comparing this list against the registry in
    // both directions; tests/spawnEggCatalogue.test.js now asserts both halves, which is how the rename
    // commit's removal of the next line was caught.
    'zombie_villager_spawn_egg', 'husk_spawn_egg', 'stray_spawn_egg', 'bogged_spawn_egg', 'panda_spawn_egg', 'polar_bear_spawn_egg',
    // The nine mobs that had no egg until the spawn-egg batch added one. `pufferfish_spawn_egg` and
    // `tropical_fish_spawn_egg` were already named above, as entries this list could not resolve --
    // `itemEntry` returns null for a missing item and the row was dropped without a word.
    'enderman_spawn_egg', 'mooshroom_spawn_egg', 'ocelot_spawn_egg', 'shulker_spawn_egg', 'trader_llama_spawn_egg', 'vex_spawn_egg', 'zoglin_spawn_egg'
  ];
  for (const it of spawnEggsList) {
    const entry = itemEntry(it, 'spawn_eggs');
    if (entry) catalog.push(entry);
  }

  // Custom & Library Mobs Spawn Eggs
  if (typeof MobLibrary !== 'undefined' && typeof MobLibrary.getAllMobs === 'function') {
    for (const mob of MobLibrary.getAllMobs()) {
      if (mob.isBuiltin && spawnEggsList.includes(`${mob.id}_spawn_egg`)) {
        continue;
      }
      const primary = mob.eggColors?.primary || mob.look?.mainColor || '#7c3aed';
      const secondary = mob.eggColors?.secondary || mob.look?.accentColor || '#ec4899';
      const customEggIcon = MobLibrary.generateEggIcon ? MobLibrary.generateEggIcon(primary, secondary) : '/assets/items/spawn_egg.png';
      catalog.push({
        id: `spawn_egg_${mob.id}`,
        name: `${mob.name} Spawn Egg`,
        icon: '/assets/items/spawn_egg.png',
        customEggIcon,
        isBlock: false,
        isSpawnEgg: true,
        customMobId: mob.id,
        mobDef: mob,
        type: 'spawn_egg',
        tab: 'spawn_eggs',
        category: 'spawn_eggs',
        count: 64,
        searchTerms: `${mob.name.toLowerCase()} spawn egg mob custom ${mob.id} ${(mob.skills || []).join(' ')} ${mob.behavior?.type || ''}`
      });
    }
  }

  // 11. Buildings (the player-placeable Building Library templates, built in Building Studio)
  if (typeof BuildingLibrary !== 'undefined') {
    for (const st of BuildingLibrary.getAllBuildings()) {
      catalog.push({
        id: `building_${st.id}`,
        name: st.name,
        icon: st.icon || '/assets/blocks/crafting_table_top.png',
        isBlock: false,
        isBuilding: true,
        buildingId: st.id,
        tab: 'building',
        category: 'building',
        count: 1,
        searchTerms: `${st.name.toLowerCase()} building build ${st.id}`
      });
    }
  }

  return catalog;
}

export let ALL_CREATIVE_ITEMS = buildCreativeCatalog();

export function refreshCreativeCatalog() {
  ALL_CREATIVE_ITEMS = buildCreativeCatalog();
  return ALL_CREATIVE_ITEMS;
}

if (typeof BuildingLibrary !== 'undefined' && typeof BuildingLibrary.subscribe === 'function') {
  BuildingLibrary.subscribe(() => {
    refreshCreativeCatalog();
  });
}

if (typeof MobLibrary !== 'undefined' && typeof MobLibrary.subscribe === 'function') {
  MobLibrary.subscribe(() => {
    refreshCreativeCatalog();
  });
}

export function getCreativeItemsByTab(tabId) {
  if (tabId === 'all_items') {
    return ALL_CREATIVE_ITEMS;
  }
  return ALL_CREATIVE_ITEMS.filter(it => it.tab === tabId);
}

export function searchCreativeItems(query, activeTab = null) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return activeTab && activeTab !== 'all_items' ? getCreativeItemsByTab(activeTab) : ALL_CREATIVE_ITEMS;
  }
  const source = (activeTab && activeTab !== 'all_items') ? getCreativeItemsByTab(activeTab) : ALL_CREATIVE_ITEMS;
  return source.filter(it => it.name.toLowerCase().includes(q) || it.searchTerms.includes(q));
}