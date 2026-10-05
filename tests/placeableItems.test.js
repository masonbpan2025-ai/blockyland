// Two ways an item was not the block it should have been.
//
// **Three items that place a block did not say so.** `bamboo`, `kelp` and `seagrass` are placed in vanilla,
// and their `ITEMS` entries declared no block form. The registry could not join the item to its block, so it
// made a *second* entry for the block -- `block:145` beside `bamboo` -- and every recipe using bamboo landed
// on that one. That is why the Inspector said "vanilla uses this in 3 recipe(s); nothing here consumes it"
// while the game had three bamboo recipes, and why `bamboo` held zero as an ingredient and now holds 36.
//
// **One block that a recipe produces had no item at all.** Scaffolding is crafted from six bamboo and a
// string, and the recipe was emitted with a numeric block result the player could not hold -- the same
// defect as the cake and the shulker boxes a round earlier, one block further along.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { EXTRA_ITEMS } from '../src/extraItems.js';
import { registry, resolveResource } from '../src/resourceRegistry.js';

const ALL_ITEMS = { ...ITEMS, ...EXTRA_ITEMS };

test('bamboo, kelp and seagrass are placed; wheat deliberately is not', () => {
  for (const [name, constant] of [['bamboo', 'BAMBOO'], ['kelp', 'KELP'], ['seagrass', 'SEAGRASS']]) {
    const def = ALL_ITEMS[name];
    assert.ok(def, `${name} should be an item`);
    assert.equal(def.isBlock, true, `${name} is placed in vanilla`);
    assert.equal(def.blockId, BLOCKS[constant], `${name} should name the block it places`);
    assert.equal(BLOCK_DEFS[def.blockId]?.name, def.name, `${name} should agree with its block's name`);
  }
  // The exception, and the reason for it: what is planted is the seed, so the wheat *item* is not a block.
  assert.equal(typeof BLOCKS.WHEAT, 'number', 'there is a wheat crop block');
  assert.equal(ALL_ITEMS.wheat.isBlock, undefined, 'but the wheat item does not place it');
  assert.equal(ALL_ITEMS.wheat.blockId, undefined);
  assert.ok(ALL_ITEMS.wheat_seeds, 'the seed is what a player plants');
});

test('a block item has one entry, not two', () => {
  // The duplicate entry is what hid the recipes. Each of these blocks should be reachable through exactly one
  // registry entry, and it should be the item.
  const reg = registry({ fresh: true });
  for (const [name, constant] of [['bamboo', 'BAMBOO'], ['kelp', 'KELP'], ['seagrass', 'SEAGRASS'],
    ['scaffolding', 'SCAFFOLDING']]) {
    const blockId = BLOCKS[constant];
    const sharing = [...reg.entries.values()].filter((entry) => entry.blockId === blockId);
    assert.equal(sharing.length, 1, `${name}'s block should have one entry, found ${sharing.map((e) => e.key).join(', ')}`);
    assert.equal(sharing[0].id, name, 'and it should be the item');
    // A numeric reference resolves to the item, which is what makes the recipes land on it.
    assert.equal(resolveResource(blockId, reg)?.id, name, `block ${blockId} should resolve to ${name}`);
  }
});

test('the recipes that use bamboo are recorded against bamboo', () => {
  // The ingredient-parity failure, asserted as behaviour rather than as a count: bamboo is used by the
  // game's recipes and the registry now knows it.
  const reg = registry({ fresh: true });
  const bamboo = reg.entries.get('bamboo');
  assert.ok(bamboo.recipesAsIngredient.length >= 3,
    `bamboo should be consumed by at least the three vanilla recipes, found ${bamboo.recipesAsIngredient.length}`);
  const results = bamboo.recipesAsIngredient.map((recipe) => recipe.resultId ?? recipe.result?.id);
  assert.ok(results.includes('stick'), `a stick is crafted from bamboo: ${JSON.stringify(results.slice(0, 6))}`);
  // And the block it makes is reachable by its own name.
  assert.ok(bamboo.recipesAsIngredient.some((recipe) => String(recipe.resultId) === String(BLOCKS.BAMBOO_BLOCK)
    || recipe.resultId === 'bamboo_block'), 'and so is a bamboo block');
});

test('scaffolding is an item a player can hold, and stacks like vanilla\'s', () => {
  const def = ALL_ITEMS.scaffolding;
  assert.ok(def, 'scaffolding should be an item');
  assert.equal(def.isBlock, true);
  assert.equal(def.blockId, BLOCKS.SCAFFOLDING);
  assert.equal(BLOCK_DEFS[def.blockId]?.name, 'Scaffolding');
  // Vanilla's scaffolding stacks to 64, so this needs no stackSize -- unlike the cake and shulker boxes.
  assert.equal(def.stackSize, undefined, 'sixty-four is the default and the right answer here');
  const reg = registry({ fresh: true });
  assert.equal(reg.entries.get('scaffolding').recipesAsResult.length > 0, true, 'and its recipe is recorded');
});

test('every item that names a block is joined to it, except the ones listed', () => {
  // The guard. An item whose name matches a registered block is almost always that block's item form, and
  // leaving the two unjoined is what produced a duplicate entry and a missing recipe attribution. The
  // exceptions are named with a reason rather than pattern-matched.
  const NOT_A_BLOCK_ITEM = new Map([['wheat', 'the crop is planted from wheat seeds, not from the harvested item']]);
  const unjoined = [];
  for (const [name, def] of Object.entries(ALL_ITEMS)) {
    if (!def || def.isBlock || def.blockId !== undefined) continue;
    if (typeof BLOCKS[name.toUpperCase()] !== 'number') continue;
    if (NOT_A_BLOCK_ITEM.has(name)) continue;
    unjoined.push(name);
  }
  assert.deepEqual(unjoined, [], 'these items name a registered block and are not joined to it');
  // And the exception list cannot rot: its entries are real items that really do name a block.
  for (const [name, reason] of NOT_A_BLOCK_ITEM) {
    assert.ok(ALL_ITEMS[name], `${name} is exempted from the rule but is not an item: ${reason}`);
    assert.equal(typeof BLOCKS[name.toUpperCase()], 'number', `${name} is exempted but names no block`);
  }
});
