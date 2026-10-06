// Recipes that asked for a block no player can hold.
//
// This game keys blocks by numeric id and plain items by name, and it carries an item that places a block by
// that block's id. The recipe generator resolved vanilla's names by consulting its block map *first*, and
// `wheat` is both a plain item here and the name of a block constant -- the wheat *crop*. So every recipe
// wanting wheat got `B.WHEAT`, the crop block:
//
//   * nine wheat items could not make a hay block at all. The craft-grid matcher compares ids, the recipe
//     asked for nine crop blocks, and a player can never hold one;
//   * a hay block uncrafted into nine *crop blocks* rather than nine wheat;
//   * bread and cake happened to work only because hand-written recipes existed alongside the generated ones.
//
// The rule now matches the one `alternateItemKey` and `blockIdForPlacement` apply elsewhere: a plain item
// wins, and an item that carries a block id falls through to the block map.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { EXTRA_ITEMS } from '../src/extraItems.js';
import { RECIPES_2X2, RECIPES_3X3, findMatchingRecipe } from '../src/crafting.js';

const ALL_ITEMS = { ...ITEMS, ...EXTRA_ITEMS };
const RECIPES = [...RECIPES_2X2, ...RECIPES_3X3];

/** A grid cell as the crafting matcher expects it. */
const cell = (id) => ({ id, count: 1, isBlock: typeof id === 'number' });

/** Run a grid through the real matcher, so this file tests behaviour rather than table contents. */
function craft(ids, width, height) {
  const found = findMatchingRecipe(ids.map(cell), width, height, RECIPES);
  return found?.result ?? found ?? null;
}

test('nine wheat items make a hay block, and the crop no longer stands in for wheat', () => {
  // The bug. `B.WHEAT` is the crop block, and the matcher compares ids, so this used to find nothing.
  const hay = craft(Array(9).fill('wheat'), 3, 3);
  assert.ok(hay, 'nine wheat items should craft something');
  assert.equal(Number(hay.id), BLOCKS.HAY_BLOCK, 'and it should be a hay block');
  // And the crop block is not an ingredient anybody can hold, so it matches nothing.
  assert.equal(craft(Array(9).fill(BLOCKS.WHEAT), 3, 3), null, 'nine crop blocks should not craft');
  assert.equal(craft(Array(3).fill(BLOCKS.WHEAT), 3, 1), null, 'nor three of them');
});

test('a hay block gives wheat items back, not crop blocks', () => {
  const back = craft([BLOCKS.HAY_BLOCK], 1, 1);
  assert.ok(back, 'a hay block should uncraft');
  assert.equal(String(back.id), 'wheat', 'into the wheat item');
  assert.equal(back.isBlock, false, 'which is an item, and holds in a hand');
  assert.equal(back.count, 9);
});

test('bread, cake, cookie and packed mud are all still craftable', () => {
  // The recipes that used the crop block and happened to work because a hand-written twin existed. All four
  // must resolve through the generated tables now, which is what makes the fix general rather than local.
  assert.equal(String(craft(Array(3).fill('wheat'), 3, 1)?.id), 'bread');
  assert.equal(
    String(craft(['milk_bucket', 'milk_bucket', 'milk_bucket', 'sugar', 'egg', 'sugar', 'wheat', 'wheat', 'wheat'], 3, 3)?.id),
    String(BLOCKS.CAKE),
  );
  assert.equal(String(craft(['wheat', 'cocoa_beans', 'wheat'], 3, 1)?.id), 'cookie');
  assert.equal(String(craft([BLOCKS.MUD, 'wheat'], 2, 1)?.id), String(BLOCKS.PACKED_MUD));
});

test('every id a recipe names is an id the game carries that way', () => {
  // The guard, and the one that would have caught this: a string cell must be an *item* the game holds by
  // name, so it must exist and must not be a block item -- those are carried by their block id. A numeric
  // cell must be a registered block.
  const misfiled = [];
  for (const recipe of RECIPES) {
    const cells = [];
    if (Array.isArray(recipe.pattern)) for (const row of recipe.pattern) for (const c of row) if (c != null) cells.push(c);
    if (Array.isArray(recipe.ingredients)) for (const c of recipe.ingredients) if (c != null) cells.push(c);
    for (const c of cells) {
      if (typeof c === 'number') {
        if (!BLOCK_DEFS[c]) misfiled.push(`ingredient ${c} is not a block`);
        continue;
      }
      const def = ALL_ITEMS[c];
      if (!def) { misfiled.push(`ingredient '${c}' is not an item`); continue; }
      if (typeof def.blockId === 'number') misfiled.push(`ingredient '${c}' is carried as block ${def.blockId}`);
    }
    const result = recipe.result?.id;
    if (typeof result === 'number') {
      if (!BLOCK_DEFS[result]) misfiled.push(`result ${result} is not a block`);
    } else if (result !== undefined && !ALL_ITEMS[result]) {
      misfiled.push(`result '${result}' is not an item`);
    }
  }
  assert.deepEqual([...new Set(misfiled)].slice(0, 20), [], 'these recipes name an id that cannot be held or placed');
});

test('the wheat item and the wheat crop are different things', () => {
  // The root cause, stated so the next person sees it: the crop is a block with no item form, and the harvest
  // is a plain item. Anything comparing them by name is comparing two different ids.
  assert.equal(typeof BLOCKS.WHEAT, 'number', 'there is a wheat crop block');
  assert.equal(ALL_ITEMS.wheat.blockId, undefined, 'and the wheat item does not place it');
  assert.equal(BLOCK_DEFS[BLOCKS.WHEAT]?.dropItem, 'wheat', 'the mature crop drops the item');
});
