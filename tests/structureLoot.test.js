// Structure chest loot from the wiki's chest tables (Module:LootChest), and the game's chests receiving it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { STRUCTURE_LOOT } from '../src/structureLootData.js';
import { rollStructureLoot, gameItemFor, unresolvedLootItems, hasStructureLoot } from '../src/structureLoot.js';
import { parseLuaTable } from '../scripts/generate-structure-loot.mjs';
import { lootTableFor } from '../src/worldgen/generators/villageBuild.js';

const USED = [
  'minecraft:chests/buried_treasure', 'minecraft:chests/desert_pyramid', 'minecraft:chests/jungle_temple', 'minecraft:chests/jungle_temple_dispenser',
  'minecraft:chests/igloo_chest', 'minecraft:chests/pillager_outpost', 'minecraft:chests/ruined_portal', 'minecraft:chests/shipwreck_map',
  'minecraft:chests/shipwreck_supply', 'minecraft:chests/shipwreck_treasure', 'minecraft:chests/end_city_treasure', 'minecraft:chests/woodland_mansion',
  'minecraft:chests/ancient_city', 'minecraft:chests/bastion_treasure', 'minecraft:chests/simple_dungeon', 'minecraft:chests/abandoned_mineshaft',
  'minecraft:chests/nether_bridge', 'minecraft:chests/stronghold_corridor', 'minecraft:chests/stronghold_crossing', 'minecraft:chests/stronghold_library',
  'minecraft:chests/underwater_ruin_big', 'minecraft:chests/underwater_ruin_small', 'minecraft:chests/spawn_bonus_chest',
  'minecraft:archaeology/desert_pyramid', 'minecraft:archaeology/desert_well', 'minecraft:archaeology/ocean_ruin_cold', 'minecraft:archaeology/ocean_ruin_warm',
  'minecraft:archaeology/trail_ruins_common', 'minecraft:archaeology/trail_ruins_rare'
];

test('the Lua reader handles the module\'s shapes', () => {
  const t = parseLuaTable('return { ["a-b"] = { -- a_b.json\n rolls = {1,3}, items = { ["x"] = {1,2,5}, }, }, n = true }');
  assert.deepEqual(t['a-b'].rolls, [1, 3]);
  assert.deepEqual(t['a-b'].items.x, [1, 2, 5]);
  assert.equal(t.n, true);
});

test('every table a structure uses is in the wiki data, villages included', () => {
  for (const id of USED) assert.ok(hasStructureLoot(id), id);
  for (const type of ['plains', 'desert', 'savanna', 'snowy', 'taiga']) assert.ok(hasStructureLoot(lootTableFor(type, `${type}_small_house_1`)));
  for (const job of ['armorer', 'butcher', 'cartographer', 'fisher_cottage', 'fletcher', 'mason', 'shepherd', 'tannery', 'temple', 'tool_smith', 'weaponsmith']) {
    assert.ok(hasStructureLoot(lootTableFor('plains', `plains_${job}_1`)), job);
  }
});

test('the wiki\'s item names become this game\'s items', () => {
  assert.equal(gameItemFor('empty'), null);
  assert.equal(gameItemFor("bottle-o'-enchanting").item.id, 'experience_bottle');
  assert.equal(gameItemFor('heart-of-the-sea').item.id, 'heart_of_the_sea');
  assert.equal(gameItemFor('level-enchanted-iron-leggings').item.id, 'iron_leggings');
  assert.equal(gameItemFor('level-enchanted-iron-leggings').enchant, 'random');
  assert.equal(gameItemFor('leather-tunic').item.id, 'leather_chestplate');
  assert.equal(gameItemFor('dune-armor-trim').item.id, 'dune_armor_trim_smithing_template');
  assert.deepEqual(gameItemFor('enchanted-book-rnd-swift-sneak').enchant, ['swift_sneak']);
  assert.equal(gameItemFor('block-of-diamond').isBlock ?? gameItemFor('block-of-diamond').item.isBlock, true);
});

test('only items newer than this game are left out', () => {
  // Copper tools and armour, spears, nautilus armour, keys, straw beds and cushions arrived after the version this game
  // follows; the rest of every table resolves.
  for (const name of unresolvedLootItems()) {
    assert.match(name, /copper|spear|nautilus|key|straw|cushion|disc-13|disc-bounce|strong-slowness/, `${name} should resolve`);
  }
});

test('buried treasure always holds a heart of the sea; rolls are deterministic and fill 27 slots', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const slots = rollStructureLoot('minecraft:chests/buried_treasure', seed);
    assert.equal(slots.length, 27);
    assert.ok(slots.some((s) => s?.id === 'heart_of_the_sea'), `seed ${seed}`);
    assert.deepEqual(slots, rollStructureLoot('minecraft:chests/buried_treasure', seed));
  }
});

test('stack sizes stay within the wiki\'s bounds', () => {
  const pyramid = STRUCTURE_LOOT['minecraft:chests/desert_pyramid'];
  const max = {};
  for (const pool of pyramid.pools) for (const [name, , hi] of pool.entries) { const g = gameItemFor(name); if (g) max[g.item.id] = Math.max(max[g.item.id] ?? 0, hi); }
  for (let seed = 1; seed <= 50; seed++) {
    for (const s of rollStructureLoot('minecraft:chests/desert_pyramid', seed).filter(Boolean)) assert.ok(s.count >= 1 && s.count <= max[s.id], `${s.id} x${s.count}`);
  }
  const books = [];
  for (let seed = 1; seed <= 200; seed++) books.push(...rollStructureLoot('minecraft:chests/desert_pyramid', seed).filter((s) => s?.id === 'enchanted_book'));
  assert.ok(books.length > 0 && books.every((b) => b.enchantments?.length === 1), 'enchanted books carry an enchantment');
});
