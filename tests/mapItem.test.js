// The empty map, and the trade rewards that named items which do not exist.
//
// Two things came out of adding one item. The first is the map itself: vanilla's empty map is eight paper in a
// ring around a compass, and using it is what fills it. The filled form already existed -- `filled_map`, which
// the cartographer's explorer maps are -- so what was missing was the thing you craft.
//
// The second is a defect the first one exposed. Auditing which ids the trade tables hand out, because the new
// item's source had to be added to one of them, turned up **four** rewards that named ids this game does not
// have: `ocean_map`, `woodland_map`, `enchanted_fishing_rod` and `carpet`. A villager offering one of those
// grants `addItem(id, ...)`, which produces a stack with no definition -- the same phantom-stack shape as the
// brewing result that once produced `splash_water_bottle`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { BLOCK_DEFS, BLOCKS, ITEMS } from '../src/blocks.js';
import { EXTRA_ITEMS } from '../src/extraItems.js';
import { POTION_ITEMS } from '../src/extraPotions.js';
import { addedItems } from '../src/addedItems.js';
import { PROFESSION_TRADES } from '../src/villagerEconomy.js';
import { PIGLIN_BARTER_LOOT } from '../src/piglin.js';
import { RECIPES_2X2, RECIPES_3X3, findMatchingRecipe } from '../src/crafting.js';

// Every table an id can live in. The generated items hold most of what trades deal in, and the first version of
// this helper left them out -- which reported `emerald` and `wheat` as phantoms.
const all = { ...ITEMS, ...EXTRA_ITEMS, ...(POTION_ITEMS ?? {}), ...addedItems() };
// An offer side names either an item id or a numeric block id, so both tables are consulted. The first version
// of this only looked at `BLOCKS` by upper-cased name and reported every barter row as a phantom.
const resolves = (side) => {
  if (typeof side.id === 'number') return BLOCK_DEFS[side.id] !== undefined;
  return all[side.id] !== undefined || BLOCKS[String(side.id).toUpperCase()] !== undefined;
};

test('the empty map is vanilla\'s item', () => {
  const entry = addedItems().map;
  assert.ok(entry, 'the empty map should be one of this branch\'s items');
  assert.equal(ITEMS.map.name, 'Empty Map', 'which is what vanilla calls it');
  assert.equal(ITEMS.map.stackSize, 64, 'and it stacks, unlike the filled one');
  assert.equal(existsSync('public/assets/items/map.png'), true, 'it needs an icon');
  // The filled form it becomes must exist, or using the map would grant a phantom.
  assert.ok(ITEMS.filled_map, 'filled_map should be registered');
  assert.equal(ITEMS.filled_map.name, 'Map', 'vanilla names the filled map simply "Map"');
});

test('eight paper around a compass makes one', () => {
  const grid = ['paper', 'paper', 'paper', 'paper', 'compass', 'paper', 'paper', 'paper', 'paper']
    .map((id) => ({ id, count: 1, isBlock: false }));
  const found = findMatchingRecipe(grid, 3, 3, [...RECIPES_2X2, ...RECIPES_3X3]);
  const result = found?.result ?? found;
  assert.ok(result, 'the vanilla recipe should be in the tables');
  assert.equal(String(result.id), 'map');
  assert.equal(result.count, 1);
  // Without the compass it is not a map, which is the assertion that makes the one above mean something.
  const noCompass = ['paper', 'paper', 'paper', 'paper', 'paper', 'paper', 'paper', 'paper', 'paper']
    .map((id) => ({ id, count: 1, isBlock: false }));
  assert.equal(findMatchingRecipe(noCompass, 3, 3, [...RECIPES_2X2, ...RECIPES_3X3]), null);
});

test('every trade and barter reward names something that exists', () => {
  // The defect this round found. Derived from the tables rather than listed, so a new offer with a made-up id
  // fails here instead of granting a phantom stack to whoever buys it.
  const missing = [];
  for (const [profession, pool] of Object.entries(PROFESSION_TRADES)) {
    for (const row of pool) {
      for (const field of ['cost', 'cost2', 'reward']) {
        const side = row[field];
        if (!side?.id) continue;
        if (!resolves(side)) missing.push(`${profession} ${field}: ${side.id}`);
      }
    }
  }
  for (const row of PIGLIN_BARTER_LOOT) {
    if (row.id !== undefined && !resolves(row)) missing.push(`barter: ${row.id}`);
  }
  assert.deepEqual(missing, [], 'these offers name ids the game has no definition for');
});

test('using an empty map gives a filled one, and the wiring is there', () => {
  // A wiring check for the gesture, since driving `handleRightClick` needs a whole game.
  const main = readFileSync('src/main.js', 'utf8');
  assert.match(main, /bucketItem\.id === 'map'/, 'the map should be handled when it is used');
  assert.match(main, /this\.inventory\.addItem\('filled_map', false, 1\)/, 'and give a filled map');
});
