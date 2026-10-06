// Eighteen blocks that had a recipe and no item.
//
// A crafted cake, and a crafted shulker box, were **numbers**. The recipes have been there for several
// batches -- the cake is three milk buckets, two sugar, an egg and three wheat; a shulker box is two shells
// around a chest -- and they yield `{id: BLOCKS.CAKE, isBlock: true}`, a numeric block id. A numeric id has
// no `ITEMS` entry, so the item had no declared name or stack limit, and `stackLimitFor` fell through to its
// default of 64: a player could carry a stack of sixty-four cakes, where vanilla's cake is one.
//
// The Inspector had been reporting this for nine rounds as eighteen `stack-size` failures whose detail read
// "vanilla 1, definition undeclared (applied 64)". It was right, and it took a while to read it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { BLOCKS, BLOCK_DEFS, ITEMS, blockIdForPlacement, stackLimitFor } from '../src/blocks.js';
import { EXTRA_ITEMS } from '../src/extraItems.js';
import { RECIPES_2X2, RECIPES_3X3 } from '../src/crafting.js';
import { EXTRA_RECIPES } from '../src/extraRecipes.js';

const ALL_ITEMS = { ...ITEMS, ...EXTRA_ITEMS };

/** The item name whose item form places this block, if any. */
function itemForBlock(blockId) {
  return Object.keys(ALL_ITEMS).find((name) => ALL_ITEMS[name]?.blockId === blockId) ?? null;
}

/** Every recipe this game has, in one list. */
function allRecipes() {
  const extra = Array.isArray(EXTRA_RECIPES) ? EXTRA_RECIPES : Object.values(EXTRA_RECIPES ?? {}).flat();
  return [...RECIPES_2X2, ...RECIPES_3X3, ...extra];
}

const NEW_ITEMS = ['shulker_box', 'white_shulker_box', 'orange_shulker_box', 'magenta_shulker_box',
  'light_blue_shulker_box', 'yellow_shulker_box', 'lime_shulker_box', 'pink_shulker_box', 'gray_shulker_box',
  'light_gray_shulker_box', 'cyan_shulker_box', 'purple_shulker_box', 'blue_shulker_box', 'brown_shulker_box',
  'green_shulker_box', 'red_shulker_box', 'black_shulker_box', 'cake'];

// --- the item forms -------------------------------------------------------------

test('a cake and every shulker box are items, and stack to one', () => {
  for (const name of NEW_ITEMS) {
    const def = ALL_ITEMS[name];
    assert.ok(def, `${name} should be an item`);
    assert.equal(def.stackSize, 1, `${name} should stack to one, as vanilla's does`);
    assert.equal(def.isBlock, true, `${name} places a block`);
    assert.equal(typeof def.blockId, 'number', `${name} should name the block it places`);
    // The name has to agree with the block's, or the item and the block it places are different things.
    assert.equal(BLOCK_DEFS[def.blockId]?.name, def.name, `${name} disagrees with its block's name`);
    assert.equal(itemForBlock(def.blockId), name, `${name} should be the item form of its block`);
  }
  // Eighteen: seventeen shulker boxes and a cake.
  assert.equal(NEW_ITEMS.length, 18);
});

test('every one of them has an icon on disk', () => {
  for (const name of NEW_ITEMS) {
    assert.equal(existsSync(`public/assets/items/${name}.png`), true, `${name} has no icon`);
  }
});

// --- the lookup that was missing ------------------------------------------------

test('a stack limit is honoured through the numeric block id the game carries', () => {
  // The inventory holds a block as `{id: BLOCKS.CAKE, isBlock: true}` -- that is what the recipe yields --
  // so the declaration has to be reachable from the number, not only from the name.
  for (const name of NEW_ITEMS) {
    const blockId = ALL_ITEMS[name].blockId;
    assert.equal(stackLimitFor(blockId), 1, `the numeric id of ${name} should stack to one`);
    assert.equal(stackLimitFor(name), 1, `and so should its name`);
  }
  // The ordinary cases are untouched: a block that stacks to 64 still does, by name and by id, and the
  // declared exceptions still win over the default.
  assert.equal(stackLimitFor(BLOCKS.OAK_LOG), 64);
  assert.equal(stackLimitFor('oak_log'), 64);
  assert.equal(stackLimitFor('ender_pearl'), 16);
  assert.equal(stackLimitFor('diamond_sword'), 1);
  // An unregistered number is still the default rather than an error.
  assert.equal(stackLimitFor(999999), 64);
});

// --- the guard that would have caught it ----------------------------------------

test('every recipe result resolves to something real', () => {
  // The invariant behind this batch, stated in the form the game actually uses. Most block items are *not*
  // in `ITEMS` at all -- `oak_log`, `oak_planks` and `crafting_table` have no entry, and the numeric block
  // id is the item -- so "a recipe result must have an ITEMS entry" would be wrong for most of the game.
  // What must hold is that a result names either a known item or a registered block.
  const unholdable = [];
  for (const recipe of allRecipes()) {
    const result = recipe?.result;
    if (!result || result.id === undefined || result.id === null) continue;
    if (typeof result.id === 'string') {
      const knownBlock = typeof BLOCKS[result.id.toUpperCase()] === 'number';
      if (!ALL_ITEMS[result.id] && !knownBlock) unholdable.push(`${result.id} (named)`);
      continue;
    }
    if (!BLOCK_DEFS[result.id]) unholdable.push(`${result.id} (no such block)`);
  }
  assert.deepEqual([...new Set(unholdable)], [], 'these recipes produce something that does not exist');
});

test('the shulker box and cake recipes are the ones that produce them', () => {
  // So this is a fix to reachable content rather than to unreachable definitions: both recipes exist.
  const results = allRecipes().map((r) => r?.result?.id);
  assert.ok(results.includes(BLOCKS.SHULKER_BOX), 'the shulker box recipe should produce the block');
  assert.ok(results.includes(BLOCKS.CAKE), 'the cake recipe should produce the block');
  // And a shulker box is shells around a chest, as vanilla has it. Compared by id: the recipe stores the
  // chest as `B.CHEST`, which is a number, so a search for the word "chest" finds nothing.
  const shulker = allRecipes().find((r) => r?.result?.id === BLOCKS.SHULKER_BOX);
  const flat = (shulker?.pattern ?? shulker?.ingredients ?? []).flat(2).filter((cell) => cell !== null && cell !== undefined);
  assert.ok(flat.includes('shulker_shell'), `the shulker box recipe should need shells: ${JSON.stringify(flat)}`);
  assert.ok(flat.includes(BLOCKS.CHEST), 'and a chest');
});

test('a block item places its block whether it is named by id or by name', () => {
  // The two ways this game names a block item, and the reason a new item form needs this: placement used the
  // item's `id` directly when `isBlock` was set, so a name-keyed block item asked the world for a block
  // called `cake`. Numeric ones were always fine, which is why nothing noticed.
  assert.equal(blockIdForPlacement({ id: BLOCKS.OAK_LOG, isBlock: true }), BLOCKS.OAK_LOG);
  assert.equal(blockIdForPlacement({ id: 'cake', isBlock: true }), BLOCKS.CAKE);
  assert.equal(blockIdForPlacement({ id: 'white_shulker_box', isBlock: true }), BLOCKS.WHITE_SHULKER_BOX);
  // Items declared by name with an explicit block id, which the game already had.
  assert.equal(blockIdForPlacement({ id: 'chest', isBlock: true }), BLOCKS.CHEST);
  assert.equal(blockIdForPlacement({ id: 'beehive', isBlock: true }), BLOCKS.BEEHIVE);
  // And a plain item is untouched: it is not a block, so it places nothing.
  assert.equal(blockIdForPlacement({ id: 'diamond_sword', isBlock: false }), 'diamond_sword');
  assert.equal(blockIdForPlacement(null), null);
});
