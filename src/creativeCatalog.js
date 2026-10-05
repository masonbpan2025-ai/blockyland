import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
import { StructureLibrary } from './structureLibrary.js';
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
  { id: 'structure', name: 'Structures', icon: '/assets/blocks/crafting_table_top.png' },
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
    BLOCKS.YELLOW_WOOL, BLOCKS.GREEN_WOOL, BLOCKS.BLACK_WOOL
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
    BLOCKS.COAL_ORE, BLOCKS.IRON_ORE, BLOCKS.GOLD_ORE, BLOCKS.DIAMOND_ORE,
    BLOCKS.REDSTONE_ORE, BLOCKS.EMERALD_ORE,
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
    BLOCKS.GLOWSTONE, BLOCKS.SEA_LANTERN, BLOCKS.ENCHANTING_TABLE, BLOCKS.ANVIL
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
    'camel_spawn_egg', 'parched_spawn_egg', 'wandering_trader_spawn_egg', 'creaking_spawn_egg', 'killer_bunny_spawn_egg', 'snow_golem_spawn_egg', 'illusioner_spawn_egg', 'skeleton_horse_spawn_egg', 'zombie_horse_spawn_egg', 'pufferfish_spawn_egg', 'tropical_fish_spawn_egg', 'giant_spawn_egg', 'piglin_brute_spawn_egg', 'camel_husk_spawn_egg', 'copper_golem_spawn_egg'
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

  // 11. Structures
  if (typeof StructureLibrary !== 'undefined') {
    for (const st of StructureLibrary.getAllStructures()) {
      catalog.push({
        id: `structure_${st.id}`,
        name: st.name,
        icon: st.icon || '/assets/blocks/crafting_table_top.png',
        isBlock: false,
        isStructure: true,
        structureId: st.id,
        tab: 'structure',
        category: 'structure',
        count: 1,
        searchTerms: `${st.name.toLowerCase()} structure build ${st.id}`
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

if (typeof StructureLibrary !== 'undefined' && typeof StructureLibrary.subscribe === 'function') {
  StructureLibrary.subscribe(() => {
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
