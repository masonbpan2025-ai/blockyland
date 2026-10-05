import fs from 'fs';
import path from 'path';

const BASE_120 = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.20.2';
const BASE_119 = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.19.1';
// Pale oak is a 1.21.4 addition, so its texture is only in the newer asset tree.
const BASE_1214 = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.21.4';

const blocks = [
  'dirt.png', 'grass_block_top.png', 'grass_block_side.png', 'stone.png', 'cobblestone.png',
  'bedrock.png', 'sand.png', 'gravel.png', 'oak_planks.png', 'oak_log.png', 'oak_log_top.png',
  'oak_leaves.png', 'glass.png', 'crafting_table_top.png', 'crafting_table_side.png', 'crafting_table_front.png',
  'furnace_front.png', 'furnace_front_on.png', 'furnace_side.png', 'furnace_top.png',
  'tnt_top.png', 'tnt_side.png', 'tnt_bottom.png', 'torch.png', 'water_still.png', 'lava_still.png',
  'coal_ore.png', 'iron_ore.png', 'gold_ore.png', 'diamond_ore.png', 'emerald_ore.png', 'redstone_ore.png',
  // The rest of the ore family, added for block parity. All are plain full cubes, so the texture is the
  // whole implementation; the deepslate variants are their own textures upstream rather than the stone
  // ore tinted over a deepslate base.
  'copper_ore.png', 'lapis_ore.png', 'nether_gold_ore.png', 'nether_quartz_ore.png',
  'deepslate_coal_ore.png', 'deepslate_iron_ore.png', 'deepslate_gold_ore.png', 'deepslate_diamond_ore.png',
  'deepslate_emerald_ore.png', 'deepslate_redstone_ore.png', 'deepslate_lapis_ore.png', 'deepslate_copper_ore.png',
  'obsidian.png', 'bricks.png', 'bookshelf.png', 'dandelion.png', 'poppy.png',
  // Saplings, for the second block-parity batch. All are cross-quad plants like the flowers above.
  'oak_sapling.png', 'spruce_sapling.png', 'birch_sapling.png', 'jungle_sapling.png',
  'acacia_sapling.png', 'cherry_sapling.png', 'dark_oak_sapling.png',
  'mangrove_propagule.png',
  // Brick variants the infested blocks borrow their textures from. Infested blocks have no textures of
  // their own in vanilla -- imitating the real block is the point -- so these are what make the
  // infested entries resolvable.
  'mossy_stone_bricks.png', 'cracked_stone_bricks.png', 'chiseled_stone_bricks.png',
  'cactus_top.png', 'cactus_side.png', 'cactus_bottom.png', 'snow.png', 'ice.png'
];

// Textures that exist only in the newer asset tree, fetched from BASE_1214.
const blocks1214 = [
  'pale_oak_sapling.png',
  // Resin is a 1.21.4 addition. Its brick variants already existed in this game and pointed at
  // `resin_brick.png`, which does not exist upstream -- the real file is plural -- so they rendered the
  // placeholder tile until this landed.
  'resin_clump.png', 'resin_block.png', 'resin_bricks.png', 'chiseled_resin_bricks.png',
  // Ground cover, the fifth block-parity batch. All four are cross-quad plants drawn from a single
  // 16x16 texture, and all four are 1.21.4 names (short_grass replaced the old `grass` in 1.20.3).
  'short_grass.png', 'fern.png', 'dead_bush.png', 'cobweb.png',
  // Eyeblossoms, the sixth batch. The open and closed forms are each other's daylight state, so both
  // textures are needed even though only one is visible at a time in vanilla.
  'open_eyeblossom.png', 'closed_eyeblossom.png',
  // Nether and deepslate cubes, the seventh batch. Three of these were previously believed missing from
  // the mirror; the bare block name 404s but the oriented name is there, which is why the list names
  // ancient_debris_side rather than ancient_debris.
  'shroomlight.png', 'cracked_nether_bricks.png',
  'ancient_debris_side.png', 'ancient_debris_top.png',
  'reinforced_deepslate_side.png', 'reinforced_deepslate_top.png', 'reinforced_deepslate_bottom.png',
  'creaking_heart.png', 'frosted_ice_0.png', 'flowering_azalea_leaves.png',
  'azalea_side.png', 'azalea_top.png', 'flowering_azalea_side.png', 'flowering_azalea_top.png',
  // Coral blocks, the eighth batch: ten textures for five colours, alive and dead. The coral fans and
  // plants in the same family are a separate batch and are deliberately not listed here.
  'tube_coral_block.png', 'brain_coral_block.png', 'bubble_coral_block.png',
  'fire_coral_block.png', 'horn_coral_block.png',
  'dead_tube_coral_block.png', 'dead_brain_coral_block.png', 'dead_bubble_coral_block.png',
  'dead_fire_coral_block.png', 'dead_horn_coral_block.png',
  // Tall and ceiling plants, the ninth batch. Two notes for a future reader: tall grass and large fern
  // are two blocks tall upstream and their TOP texture is the one used here, and `_top` is precisely
  // the suffix that made a bare-name probe report these as missing art.
  'tall_grass_top.png', 'large_fern_top.png', 'spore_blossom.png', 'hanging_roots.png',
  // Amethyst, the tenth batch: the budding block, the cluster and the three bud stages. Each stage has
  // its own texture rather than one texture scaled, so all four are needed.
  'budding_amethyst.png', 'amethyst_cluster.png',
  'large_amethyst_bud.png', 'medium_amethyst_bud.png', 'small_amethyst_bud.png',
  // Glazed terracotta, the eleventh batch: one texture per colour, sixteen in all. Vanilla rotates the
  // pattern per face at placement time, which this game does not model, so each texture is drawn in a
  // single fixed orientation.
  'white_glazed_terracotta.png', 'orange_glazed_terracotta.png', 'magenta_glazed_terracotta.png',
  'light_blue_glazed_terracotta.png', 'yellow_glazed_terracotta.png', 'lime_glazed_terracotta.png',
  'pink_glazed_terracotta.png', 'gray_glazed_terracotta.png', 'light_gray_glazed_terracotta.png',
  'cyan_glazed_terracotta.png', 'purple_glazed_terracotta.png', 'blue_glazed_terracotta.png',
  'brown_glazed_terracotta.png', 'green_glazed_terracotta.png', 'red_glazed_terracotta.png',
  'black_glazed_terracotta.png',
];

const items = [
  'diamond_sword.png', 'iron_sword.png', 'stone_sword.png', 'wooden_sword.png',
  'diamond_pickaxe.png', 'iron_pickaxe.png', 'stone_pickaxe.png', 'wooden_pickaxe.png',
  'diamond_axe.png', 'iron_axe.png', 'diamond_shovel.png', 'iron_shovel.png',
  'stick.png', 'coal.png', 'iron_ingot.png', 'gold_ingot.png', 'diamond.png', 'emerald.png',
  'bread.png', 'apple.png', 'cooked_beef.png', 'beef.png', 'wheat.png', 'bow.png', 'arrow.png', 'crossbow.png',
  'totem_of_undying.png'
];

const guis = [
  { url: `${BASE_119}/gui/widgets.png`, out: 'public/assets/gui/widgets.png' },
  { url: `${BASE_119}/gui/icons.png`, out: 'public/assets/gui/icons.png' },
  { url: `${BASE_119}/gui/container/inventory.png`, out: 'public/assets/gui/inventory.png' },
  { url: `${BASE_119}/gui/container/crafting_table.png`, out: 'public/assets/gui/crafting_table.png' },
  { url: `${BASE_119}/gui/container/villager2.png`, out: 'public/assets/gui/villager2.png' }
];

const entities = [
  { url: `${BASE_120}/entity/villager/villager.png`, out: 'public/assets/entity/villager.png' },
  { url: `${BASE_120}/entity/iron_golem/iron_golem.png`, out: 'public/assets/entity/iron_golem.png' },
  { url: `${BASE_120}/entity/illager/pillager.png`, out: 'public/assets/entity/pillager.png' },
  { url: `${BASE_120}/entity/zombie/zombie.png`, out: 'public/assets/entity/zombie.png' },
  { url: `${BASE_120}/entity/pig/pig.png`, out: 'public/assets/entity/pig.png' },
  { url: `${BASE_120}/entity/cow/cow.png`, out: 'public/assets/entity/cow.png' },
  { url: `${BASE_120}/entity/sheep/sheep.png`, out: 'public/assets/entity/sheep.png' },
  { url: `${BASE_120}/entity/creeper/creeper.png`, out: 'public/assets/entity/creeper.png' },
  { url: `${BASE_120}/entity/skeleton/skeleton.png`, out: 'public/assets/entity/skeleton.png' }
];

const environment = [
  { url: `${BASE_120}/environment/sun.png`, out: 'public/assets/environment/sun.png' },
  { url: `${BASE_120}/environment/moon_phases.png`, out: 'public/assets/environment/moon_phases.png' },
  { url: `${BASE_120}/environment/clouds.png`, out: 'public/assets/environment/clouds.png' }
];

async function downloadFile(url, dest) {
  try {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`Failed ${url}: ${res.status}`);
      return false;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    console.log(`Saved: ${dest}`);
    return true;
  } catch (err) {
    console.error(`Error downloading ${url}:`, err.message);
    return false;
  }
}

async function run() {
  console.log('Downloading blocks...');
  for (const b of blocks) {
    await downloadFile(`${BASE_120}/blocks/${b}`, `public/assets/blocks/${b}`);
  }
  console.log('Downloading blocks added after 1.20.2...');
  for (const b of blocks1214) {
    await downloadFile(`${BASE_1214}/blocks/${b}`, `public/assets/blocks/${b}`);
  }
  console.log('Downloading items...');
  for (const it of items) {
    await downloadFile(`${BASE_120}/items/${it}`, `public/assets/items/${it}`);
  }
  console.log('Downloading GUIs...');
  for (const g of guis) {
    await downloadFile(g.url, g.out);
  }
  console.log('Downloading Entities...');
  for (const e of entities) {
    await downloadFile(e.url, e.out);
  }
  console.log('Downloading Environment...');
  for (const env of environment) {
    await downloadFile(env.url, env.out);
  }
  console.log('Download batch complete!');
}

run();
