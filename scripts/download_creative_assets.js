import fs from 'fs';
import path from 'path';

const BASE_ITEMS = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.20.2/items/';
const BASE_BLOCKS = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.20.2/blocks/';

const itemsToDownload = [
  // Tools & Utilities
  'bucket.png', 'water_bucket.png', 'lava_bucket.png', 'milk_bucket.png',
  'flint_and_steel.png', 'shears.png', 'fishing_rod.png',
  'compass_00.png', 'clock_00.png',
  'stone_shovel.png', 'wooden_shovel.png', 'stone_axe.png', 'wooden_axe.png',
  'diamond_hoe.png', 'iron_hoe.png', 'stone_hoe.png', 'wooden_hoe.png',
  'golden_sword.png', 'golden_pickaxe.png', 'golden_axe.png', 'golden_shovel.png', 'golden_hoe.png',
  'netherite_sword.png', 'netherite_pickaxe.png', 'netherite_axe.png', 'netherite_shovel.png', 'netherite_hoe.png',
  'lead.png', 'name_tag.png', 'saddle.png',
  'oak_boat.png', 'minecart.png', 'chest_minecart.png',
  'elytra.png', 'firework_rocket.png',

  // Combat & Armor
  'diamond_helmet.png', 'diamond_chestplate.png', 'diamond_leggings.png', 'diamond_boots.png',
  'iron_helmet.png', 'iron_chestplate.png', 'iron_leggings.png', 'iron_boots.png',
  'golden_helmet.png', 'golden_chestplate.png', 'golden_leggings.png', 'golden_boots.png',
  'chainmail_chestplate.png', 'leather_chestplate.png',
  'trident.png',
  'iron_horse_armor.png', 'golden_horse_armor.png', 'diamond_horse_armor.png',

  // Food & Drinks
  'golden_apple.png', 'golden_carrot.png', 'cookie.png', 'melon_slice.png',
  'porkchop.png', 'cooked_porkchop.png',
  'salmon.png', 'cooked_salmon.png', 'cod.png', 'cooked_cod.png',
  'carrot.png', 'potato.png', 'baked_potato.png', 'poisonous_potato.png',
  'beetroot.png', 'beetroot_soup.png', 'mushroom_stew.png',
  'honey_bottle.png', 'sweet_berries.png', 'glow_berries.png',
  'glass_bottle.png', 'potion.png',

  // Ingredients & Materials
  'charcoal.png', 'netherite_ingot.png', 'copper_ingot.png',
  'raw_iron.png', 'raw_gold.png', 'raw_copper.png',
  'redstone.png', 'lapis_lazuli.png', 'quartz.png', 'amethyst_shard.png', 'glowstone_dust.png',
  'gunpowder.png', 'string.png', 'feather.png', 'bone.png', 'bone_meal.png',
  'ender_pearl.png', 'blaze_rod.png', 'slime_ball.png', 'snowball.png',
  'leather.png', 'paper.png', 'book.png', 'sugar.png',
  'blaze_powder.png', 'magma_cream.png', 'ender_eye.png', 'glistering_melon_slice.png',
  'fire_charge.png',

  // Spawn Egg Base & Functional Items
  'spawn_egg.png', 'egg.png',
  'armor_stand.png', 'item_frame.png', 'painting.png',
  'brewing_stand.png', 'cauldron.png'
];

const blocksToDownload = [
  'sandstone.png', 'sandstone_top.png', 'sandstone_bottom.png',
  'mossy_cobblestone.png', 'stone_bricks.png',
  'glowstone.png', 'sea_lantern.png',
  'clay.png', 'sponge.png', 'wet_sponge.png',
  'netherrack.png', 'soul_sand.png', 'end_stone.png',
  'white_wool.png', 'red_wool.png', 'blue_wool.png', 'yellow_wool.png', 'green_wool.png', 'black_wool.png',
  'ladder.png', 'lever.png', 'redstone_torch.png', 'redstone_lamp.png',
  'enchanting_table_top.png', 'anvil.png'
];

async function downloadFile(url, dest) {
  try {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(dest)) return true;
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
  console.log('Downloading additional items...');
  for (const it of itemsToDownload) {
    const targetName = it === 'compass_00.png' ? 'compass.png' : (it === 'clock_00.png' ? 'clock.png' : it);
    await downloadFile(`${BASE_ITEMS}${it}`, `public/assets/items/${targetName}`);
  }

  console.log('Downloading additional blocks...');
  for (const b of blocksToDownload) {
    await downloadFile(`${BASE_BLOCKS}${b}`, `public/assets/blocks/${b}`);
  }

  console.log('Creative items download complete!');
}

run();
