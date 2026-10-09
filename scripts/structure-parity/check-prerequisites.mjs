// Structure parity prerequisites — what the wiki's structures need that this game cannot yet place.
//
// The Structure gap is not "22 missing buildings"; it is a missing *system* (see
// docs/structure-parity-gap-review.md). What this script measures is the layer underneath that system:
// for each wiki structure, whether the biome gate it names exists in this game's biome registry, which
// of the blocks its rooms are built from are placeable, and whether its marquee loot exists as an item
// or as a placeable block.
//
// It reuses `src/blockNameMatch.js` rather than inventing a spelling table, for the reason recorded in
// docs/block-parity-gap-review.md: a regex per script is what let `cobbled_deepslate` count as
// `cobblestone`. Block names below are the wiki's display names, which is what that matcher resolves.
//
// Loot is resolved two ways on purpose. This game keeps block items as BLOCK_DEFS entries reachable
// through the block registry, not as `ITEMS` rows, so checking only `ITEMS` would report `TNT`, `Rail`
// and `Sponge` as missing when they are placeable and obtainable. A name counts as present when either
// lookup finds it.
//
// Run: node scripts/structure-parity/check-prerequisites.mjs
import { compareBlockLists, resolveVanillaBlock } from '../../src/blockNameMatch.js';
import { ITEMS } from '../../src/blocks.js';
import { BIOMES } from '../../src/biomes.js';

/** Wiki structure/feature name -> the biomes, blocks and marquee loot its page names. */
export const STRUCTURES = [
  // --- Overworld, underground -------------------------------------------------
  { name: 'Ancient City', id: 'ancient_city', dimension: 'overworld',
    biomes: ['Deep Dark'],
    blocks: ['Deepslate Bricks', 'Deepslate Tiles', 'Reinforced Deepslate', 'Sculk', 'Sculk Sensor', 'Sculk Shrieker', 'Sculk Catalyst', 'Sculk Vein', 'Soul Lantern', 'White Wool', 'Chest', 'Ice Box', 'Candle'],
    loot: ['Disc Fragment 5', 'Echo Shard', 'Enchanted Golden Apple'] },
  { name: 'Buried Treasure', id: 'buried_treasure', dimension: 'overworld',
    biomes: ['Beach', 'Snowy Beach', 'Stony Shore', 'Mushroom Fields'],
    blocks: ['Chest'],
    loot: ['Heart of the Sea', 'Treasure Map', 'Diamond', 'Emerald', 'Gold Ingot', 'TNT'] },
  { name: 'Mineshaft', id: 'mineshaft', dimension: 'overworld',
    biomes: ['Plains', 'Desert', 'Forest', 'Taiga', 'Jungle', 'Savanna', 'Badlands', 'Swamp'],
    blocks: ['Oak Fence', 'Oak Planks', 'Dark Oak Planks', 'Rail', 'Chest', 'Cobweb', 'Spawner', 'Torch'],
    loot: ['Rail', 'Golden Apple', 'Name Tag'] },
  { name: 'Stronghold', id: 'stronghold', dimension: 'overworld',
    biomes: ['Plains', 'Desert', 'Forest'],
    blocks: ['Stone Bricks', 'Mossy Stone Bricks', 'Cracked Stone Bricks', 'Infested Stone Bricks', 'Chiseled Stone Bricks', 'End Portal Frame', 'Bookshelf', 'Iron Bars', 'Torch', 'Chest', 'Lava'],
    loot: ['Ender Eye', 'Ender Pearl', 'Book', 'Diamond'] },
  { name: 'Trail Ruins', id: 'trail_ruins', dimension: 'overworld',
    biomes: ['Jungle', 'Old Growth Birch Forest', 'Old Growth Pine Taiga', 'Old Growth Spruce Taiga', 'Snowy Taiga', 'Taiga'],
    blocks: ['Mud Bricks', 'Packed Mud', 'Gravel', 'Terracotta', 'Suspicious Gravel', 'Candle', 'Decorated Pot'],
    loot: ['Archer Pottery Sherd', 'Skull Pottery Sherd', 'Music Disc Relic'] },
  { name: 'Trial Chambers', id: 'trial_chambers', dimension: 'overworld',
    biomes: ['Plains', 'Desert', 'Forest', 'Taiga', 'Jungle', 'Savanna', 'Swamp'],
    blocks: ['Tuff Bricks', 'Chiseled Tuff', 'Copper Block', 'Chiseled Copper', 'Waxed Copper Block', 'Trial Spawner', 'Vault', 'Chest', 'Barrel', 'Copper Grate', 'Copper Door'],
    loot: ['Heavy Core', 'Wind Charge', 'Breeze Rod', 'Trial Key', 'Ominous Trial Key'] },

  // --- Overworld, above ground -------------------------------------------------
  { name: 'Abandoned Camp', id: null, dimension: 'overworld',
    biomes: ['Meadow', 'Swamp', 'Savanna', 'Cherry Grove', 'Forest', 'Birch Forest', 'Old Growth Birch Forest', 'Flower Forest', 'Windswept Forest', 'Dappled Forest', 'Taiga', 'Snowy Taiga', 'Old Growth Spruce Taiga', 'Old Growth Pine Taiga', 'Sparse Jungle', 'Bamboo Jungle', 'Wooded Badlands', 'Pale Garden'],
    blocks: ['Crafting Table', 'Cauldron', 'Barrel', 'Chest', 'Copper Chest', 'Copper Golem Statue', 'Straw Bed', 'Wool Stairs', 'Oak Fence'],
    loot: ['Copper Ingot', 'Bucket'] },
  { name: 'Desert Pyramid', id: 'desert_pyramid', dimension: 'overworld',
    biomes: ['Desert'],
    blocks: ['Sandstone', 'Chiseled Sandstone', 'Cut Sandstone', 'Orange Terracotta', 'Blue Terracotta', 'TNT', 'Stone Pressure Plate', 'Chest', 'Suspicious Sand'],
    loot: ['Diamond', 'Iron Ingot', 'Gold Ingot', 'Emerald', 'Gunpowder'] },
  { name: 'Igloo', id: 'igloo', dimension: 'overworld',
    biomes: ['Snowy Plains', 'Snowy Taiga', 'Snowy Slopes'],
    blocks: ['Snow Block', 'Ice', 'Packed Ice', 'White Carpet', 'Brewing Stand', 'Cauldron', 'Iron Bars', 'Red Bed', 'Chest', 'Torch'],
    loot: ['Golden Apple', 'Splash Potion of Weakness', 'Apple', 'Coal'] },
  { name: 'Jungle Pyramid', id: 'jungle_pyramid', dimension: 'overworld',
    biomes: ['Jungle', 'Bamboo Jungle'],
    blocks: ['Cobblestone', 'Mossy Cobblestone', 'Chiseled Stone Bricks', 'Dispenser', 'Lever', 'Chest', 'Vines', 'Tripwire'],
    loot: ['Diamond', 'Emerald', 'Gold Ingot', 'Arrow'] },
  { name: 'Pillager Outpost', id: 'pillager_outpost', dimension: 'overworld',
    biomes: ['Plains', 'Desert', 'Savanna', 'Taiga', 'Snowy Plains', 'Grove', 'Meadow', 'Cherry Grove', 'Jagged Peaks', 'Frozen Peaks', 'Stony Peaks', 'Snowy Slopes'],
    blocks: ['Dark Oak Planks', 'Dark Oak Log', 'Cobblestone', 'Oak Fence', 'Chest', 'Torch', 'Target Block'],
    loot: ['Crossbow', 'Dark Oak Sapling', 'Iron Ingot', 'Arrow'] },
  { name: 'Swamp Hut', id: 'swamp_hut', dimension: 'overworld',
    biomes: ['Swamp'],
    blocks: ['Oak Log', 'Oak Planks', 'Oak Stairs', 'Cauldron', 'Crafting Table', 'Flower Pot', 'Red Carpet', 'Brown Mushroom'],
    loot: ['Potion', 'Redstone', 'Glowstone Dust', 'Stick'] },
  { name: 'Village', id: 'village_plains', dimension: 'overworld',
    biomes: ['Plains', 'Meadow', 'Desert', 'Savanna', 'Taiga', 'Snowy Plains'],
    blocks: ['Bell', 'Lectern', 'Composter', 'Smithing Table', 'Blast Furnace', 'Smoker', 'Cartography Table', 'Loom', 'Barrel', 'Grindstone', 'Stonecutter', 'Farmland', 'Wheat', 'Carrots', 'Potatoes', 'Hay Block', 'Oak Door', 'Glass Pane', 'Torch', 'Gravel', 'Cobweb', 'Mossy Cobblestone'],
    loot: ['Emerald', 'Bread', 'Wheat Seeds', 'Iron Ingot'] },
  { name: 'Woodland Mansion', id: 'mansion', dimension: 'overworld',
    biomes: ['Dark Forest', 'Pale Garden'],
    blocks: ['Dark Oak Planks', 'Dark Oak Log', 'Cobblestone', 'Birch Planks', 'Bookshelf', 'Chest', 'Red Carpet', 'Glass Pane', 'Torch', 'Oak Fence'],
    loot: ['Totem of Undying', 'Diamond', 'Music Disc 13', 'Iron Ingot'] },

  // --- Overworld, above and under ground --------------------------------------
  { name: 'Ruined Portal', id: 'ruined_portal', dimension: 'overworld',
    biomes: ['Plains', 'Desert', 'Jungle', 'Taiga', 'Swamp', 'Ocean', 'Snowy Plains', 'Savanna', 'Badlands', 'Forest'],
    blocks: ['Obsidian', 'Crying Obsidian', 'Netherrack', 'Gold Block', 'Magma Block', 'Stone Bricks', 'Sandstone', 'Chest', 'Lava'],
    loot: ['Gold Ingot', 'Golden Apple', 'Flint and Steel', 'Fire Charge'] },

  // --- Underwater --------------------------------------------------------------
  { name: 'Ocean Monument', id: 'monument', dimension: 'overworld',
    biomes: ['Deep Ocean', 'Deep Frozen Ocean', 'Deep Cold Ocean', 'Deep Lukewarm Ocean'],
    blocks: ['Prismarine', 'Prismarine Bricks', 'Dark Prismarine', 'Sea Lantern', 'Wet Sponge', 'Sponge', 'Gold Block', 'Water'],
    loot: ['Sponge', 'Prismarine Shard', 'Prismarine Crystals', 'Gold Block'] },
  { name: 'Ocean Ruins', id: 'ocean_ruin_cold', dimension: 'overworld',
    biomes: ['Deep Ocean', 'Deep Frozen Ocean', 'Deep Cold Ocean', 'Deep Lukewarm Ocean', 'Ocean', 'Frozen Ocean', 'Cold Ocean', 'Warm Ocean', 'Lukewarm Ocean'],
    blocks: ['Stone Bricks', 'Sandstone', 'Suspicious Sand', 'Suspicious Gravel', 'Chest', 'Gravel', 'Sand', 'Magma Block'],
    loot: ['Sniffer Egg', 'Emerald', 'Wheat', 'Golden Apple'] },
  { name: 'Shipwreck', id: 'shipwreck', dimension: 'overworld',
    biomes: ['Deep Ocean', 'Ocean', 'Frozen Ocean', 'Cold Ocean', 'Warm Ocean', 'Lukewarm Ocean', 'Beach', 'Snowy Beach'],
    blocks: ['Oak Planks', 'Spruce Planks', 'Jungle Planks', 'Dark Oak Planks', 'Oak Fence', 'Chest', 'Barrel'],
    loot: ['Treasure Map', 'Emerald', 'Iron Ingot', 'Gold Ingot'] },

  // --- The Nether --------------------------------------------------------------
  { name: 'Bastion Remnant', id: 'bastion_remnant', dimension: 'nether',
    biomes: ['Nether Wastes', 'Crimson Forest', 'Warped Forest', 'Soul Sand Valley'],
    blocks: ['Blackstone', 'Polished Blackstone', 'Polished Blackstone Bricks', 'Gilded Blackstone', 'Basalt', 'Gold Block', 'Chest', 'Lava', 'Chain'],
    loot: ['Netherite Upgrade Smithing Template', 'Gold Block', 'Netherite Scrap'] },
  { name: 'Nether Fortress', id: 'fortress', dimension: 'nether',
    biomes: ['Nether Wastes', 'Crimson Forest', 'Warped Forest', 'Soul Sand Valley', 'Basalt Deltas'],
    blocks: ['Nether Bricks', 'Nether Brick Fence', 'Nether Wart', 'Soul Sand', 'Spawner', 'Chest', 'Lava'],
    loot: ['Blaze Rod', 'Golden Sword', 'Nether Wart', 'Saddle'] },
  { name: 'Nether Fossil', id: 'nether_fossil', dimension: 'nether',
    biomes: ['Soul Sand Valley'],
    blocks: ['Bone Block'],
    loot: [] },

  // --- The End -----------------------------------------------------------------
  { name: 'End City', id: 'end_city', dimension: 'the_end',
    biomes: ['The End', 'End Midlands', 'End Highlands'],
    blocks: ['Purpur Block', 'Purpur Pillar', 'End Stone Bricks', 'Magenta Stained Glass', 'End Rod', 'Chest', 'Brewing Stand'],
    loot: ['Elytra', 'Diamond', 'Iron Ingot', 'Diamond Horse Armor', 'Saddle'] },
];

/** The wiki's Structure-like features, which generate like ores rather than as structures. */
export const FEATURES = [
  { name: 'Amethyst Geode', id: null, dimension: 'overworld', biomes: ['Plains'],
    blocks: ['Smooth Basalt', 'Calcite', 'Amethyst Block', 'Budding Amethyst', 'Amethyst Cluster', 'Large Amethyst Bud', 'Medium Amethyst Bud', 'Small Amethyst Bud'],
    loot: ['Amethyst Shard'] },
  { name: 'Bonus Chest', id: null, dimension: 'overworld', biomes: ['Plains'],
    blocks: ['Chest'], loot: ['Wooden Axe', 'Apple', 'Oak Planks'] },
  { name: 'Desert Well', id: null, dimension: 'overworld', biomes: ['Desert'],
    blocks: ['Sandstone', 'Sandstone Slab', 'Suspicious Sand', 'Water'], loot: [] },
  { name: 'End Gateway', id: null, dimension: 'the_end', biomes: ['The End'],
    blocks: ['End Gateway', 'Bedrock'], loot: [] },
  { name: 'End Platform', id: null, dimension: 'the_end', biomes: ['The End'],
    blocks: ['Obsidian'], loot: [] },
  { name: 'Obsidian Pillar', id: null, dimension: 'the_end', biomes: ['The End'],
    blocks: ['Obsidian', 'Iron Bars', 'Bedrock'], loot: [] },
  { name: 'Exit Portal', id: null, dimension: 'the_end', biomes: ['The End'],
    blocks: ['Bedrock', 'End Portal', 'Dragon Egg', 'Torch'], loot: [] },
  { name: 'Fossil', id: null, dimension: 'overworld', biomes: ['Mangrove Swamp', 'Desert', 'Swamp'],
    blocks: ['Bone Block', 'Coal Ore', 'Diamond Ore'], loot: [] },
  { name: 'Monster Room', id: null, dimension: 'overworld', biomes: ['Plains', 'Desert', 'Forest'],
    blocks: ['Cobblestone', 'Mossy Cobblestone', 'Spawner', 'Chest'], loot: ['Saddle', 'Golden Apple', 'Wheat'] },
  { name: 'Void Start Platform', id: null, dimension: 'overworld', biomes: ['The Void'],
    blocks: ['Stone', 'Cobblestone'], loot: [] },
];

/** Fold a wiki display name to the snake_case id this game's registries use. */
function foldedId(displayName) {
  return String(displayName).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/** Resolve a wiki biome name against the registry, tolerating the BE-only legacy names. */
function biomePresent(displayName) {
  const id = foldedId(displayName);
  if (BIOMES[id]) return { id, key: id };
  // "Mushroom Field Shore" is a Bedrock-only split of Mushroom Fields; the mountain gates are named
  // as their three peak biomes directly in the tables above.
  if (id === 'mushroom_field_shore' && BIOMES.mushroom_fields) return { id, key: 'mushroom_fields' };
  if (id === 'mountain' && BIOMES.jagged_peaks) return { id, key: 'jagged_peaks' };
  return { id, key: null };
}

/**
 * Is a marquee loot entry obtainable here — as an item, or as a placeable block?
 *
 * Both directions are needed: `TNT`, `Rail`, `Sponge`, `Gold Block` and wool are blocks whose item
 * form this engine derives from the block definition, so an `ITEMS`-only test calls them missing.
 */
function lootPresent(displayName) {
  const id = foldedId(displayName);
  if (ITEMS[id] !== undefined) return { id, key: id, kind: 'item' };
  const keys = resolveVanillaBlock(displayName);
  if (keys.length) return { id, key: keys[0], kind: 'block' };
  return null;
}

function report(entries, label) {
  const missingBlocks = new Map();
  const missingItems = new Map();
  let biomeHits = 0;
  let biomeTotal = 0;

  console.log(`\n${label}: ${entries.length}`);
  const rows = entries.map((entry) => {
    const gates = entry.biomes.map(biomePresent);
    biomeHits += gates.filter((g) => g.key).length;
    biomeTotal += gates.length;

    const { missing } = compareBlockLists(entry.blocks);
    const absentItems = entry.loot.filter((name) => !lootPresent(name));
    for (const b of missing) missingBlocks.set(b, (missingBlocks.get(b) || 0) + 1);
    for (const i of absentItems) missingItems.set(i, (missingItems.get(i) || 0) + 1);
    return { entry, gates, missing, absentItems };
  });

  console.log(`biome gates present: ${biomeHits}/${biomeTotal}`);
  console.log(`configured-structure ids registered: 0/${entries.filter((e) => e.id).length}`);
  console.log('');
  for (const { entry, gates, missing, absentItems } of rows) {
    const gateMisses = gates.filter((g) => !g.key).map((g) => g.id);
    const gateNote = gateMisses.length ? `  (no biome: ${gateMisses.join(', ')})` : '';
    console.log(`${entry.name.padEnd(18)} gate ${`${gates.length - gateMisses.length}/${gates.length}`.padEnd(8)}`
      + ` blocks ${`${entry.blocks.length - missing.length}/${entry.blocks.length}`.padEnd(8)}`
      + ` marquee loot ${entry.loot.length - absentItems.length}/${entry.loot.length}${gateNote}`);
    if (missing.length) console.log(`  missing blocks: ${missing.join(', ')}`);
    if (absentItems.length) console.log(`  missing loot:   ${absentItems.join(', ')}`);
  }

  console.log(`\nblock names needed by ${label.toLowerCase()}, and how many structures need each:`);
  for (const [name, count] of [...missingBlocks].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    console.log(`  ${String(count).padStart(2)}x  ${name}`);
  }
  console.log(`\nloot names needed by ${label.toLowerCase()} that exist as neither an item nor a block:`);
  for (const [name, count] of [...missingItems].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    console.log(`  ${String(count).padStart(2)}x  ${name}`);
  }
}

report(STRUCTURES, 'Wiki structures (Overworld + Nether + End)');
report(FEATURES, 'Wiki structure-like features');
