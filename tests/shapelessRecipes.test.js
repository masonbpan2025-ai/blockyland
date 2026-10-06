// Shapeless recipe matching.
//
// The matcher was shaped-only, so a shapeless recipe had to be approximated as a 1x1 pattern or a
// square, and 59 of them -- every wool-dyeing recipe, plus stone variants like diorite plus cobblestone
// making andesite -- were dropped entirely. The matcher now compares a grid's contents as a multiset.
//
// That is a different kind of matching, and the ways it can be wrong are specific, so each is checked:
// it must ignore arrangement, it must respect DUPLICATE counts, it must reject ingredients that are not
// listed, and the shaped path must remain layout-sensitive -- if shapeless matching leaked into shaped
// recipes, every armour and tool recipe would start matching its own ingredients in any arrangement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES_2X2, RECIPES_3X3, findMatchingRecipe, gridMultiset } from '../src/crafting.js';
import { EXTRA_RECIPES } from '../src/extraRecipes.js';
import { BLOCKS } from '../src/blocks.js';

const shapeless = EXTRA_RECIPES.filter(r => r.shapeless);
const shaped = EXTRA_RECIPES.filter(r => r.pattern);

/** Place values into a 3x3 grid left to right; order is the caller's choice. */
function grid3(values) {
  const grid = new Array(9).fill(null);
  values.forEach((v, i) => { grid[i] = { id: v, isBlock: typeof v === 'number', count: 1 }; });
  return grid;
}

test('the generator emits shapeless recipes, not pattern approximations', () => {
  assert.ok(shapeless.length >= 100,
    `expected the full shapeless set, got ${shapeless.length}`);
  // Every shapeless recipe must be shapeless-shaped: no pattern, and an ingredients list.
  for (const r of shapeless) {
    assert.equal(r.pattern, undefined, 'a shapeless recipe must not carry a pattern');
    assert.ok(Array.isArray(r.ingredients) && r.ingredients.length >= 1);
  }
  // And the shaped set must be unaffected.
  assert.ok(shaped.length >= 400, `expected the shaped set to remain, got ${shaped.length}`);
  console.log(`  shapeless ${shapeless.length}, shaped ${shaped.length}`);
});

test('shapeless matching ignores arrangement', () => {
  // The defining property. A recipe approximated as a pattern would fail this, which is exactly why
  // the approximation was wrong rather than merely incomplete.
  let checked = 0;
  for (const r of shapeless) {
    if (r.ingredients.length < 2 || r.ingredients.length > 9) continue;
    checked++;
    const reversed = [...r.ingredients].reverse();
    const result = findMatchingRecipe(grid3(reversed), 3, 3, RECIPES_3X3);
    assert.ok(result, `reversed ingredients of ${JSON.stringify(r.ingredients)} matched nothing`);
    assert.equal(result.id, r.result.id,
      `reversed ingredients of ${JSON.stringify(r.ingredients)} produced the wrong item`);
  }
  assert.ok(checked >= 40, `expected many multi-ingredient shapeless recipes, checked ${checked}`);
});

test('shapeless matching respects duplicate counts', () => {
  // Nine coal makes a block; a grid with one coal and eight other things must not. Collapsing
  // duplicates while comparing would allow exactly that, so this is the check that keeps the
  // multiset honest.
  const withDuplicates = shapeless.filter(r => new Set(r.ingredients).size !== r.ingredients.length);
  assert.ok(withDuplicates.length > 0, 'some shapeless recipe should need the same item more than once');

  for (const r of withDuplicates) {
    // Remove one copy of a repeated ingredient. The result must no longer be produced by THIS recipe.
    const counts = new Map();
    for (const v of r.ingredients) counts.set(v, (counts.get(v) || 0) + 1);
    const [repeated] = [...counts].find(([, n]) => n > 1);
    const reduced = [...r.ingredients];
    reduced.splice(reduced.indexOf(repeated), 1);
    if (reduced.length === 0) continue;

    const result = findMatchingRecipe(grid3(reduced), 3, 3, RECIPES_3X3);
    // A different recipe may legitimately match; this one must not.
    if (result && result.id === r.result.id && result.count === r.result.count) {
      const otherProducer = shapeless.some(o => o !== r
        && o.result.id === r.result.id && o.result.count === r.result.count
        && o.ingredients.length === reduced.length);
      assert.ok(otherProducer,
        `removing one ${repeated} still matched ${r.result.id} with no other recipe explaining it`);
    }
  }
});

test('shapeless matching rejects unlisted ingredients', () => {
  const filler = BLOCKS.DIRT;
  let checked = 0;
  for (const r of shapeless) {
    if (r.ingredients.includes(filler) || r.ingredients.length >= 9) continue;
    checked++;
    const withFiller = [...r.ingredients, filler];
    const result = findMatchingRecipe(grid3(withFiller), 3, 3, RECIPES_3X3);
    if (result && result.id === r.result.id && result.count === r.result.count) {
      const otherProducer = shapeless.some(o => o !== r
        && o.result.id === r.result.id && o.result.count === r.result.count
        && o.ingredients.length === withFiller.length);
      assert.ok(otherProducer,
        `adding dirt to ${JSON.stringify(r.ingredients)} still matched ${r.result.id}`);
    }
  }
  assert.ok(checked > 50, `expected to check many recipes, checked ${checked}`);
});

test('a shapeless recipe does not match a grid holding only some of its ingredients', () => {
  let checked = 0;
  for (const r of shapeless) {
    if (r.ingredients.length < 2) continue;
    checked++;
    const partial = r.ingredients.slice(0, r.ingredients.length - 1);
    if (partial.length === 0) continue;
    const result = findMatchingRecipe(grid3(partial), 3, 3, RECIPES_3X3);
    if (result && result.id === r.result.id && result.count === r.result.count) {
      const otherProducer = shapeless.some(o => o !== r
        && o.result.id === r.result.id && o.result.count === r.result.count
        && o.ingredients.length === partial.length);
      assert.ok(otherProducer,
        `a subset of ${JSON.stringify(r.ingredients)} still matched ${r.result.id}`);
    }
  }
  assert.ok(checked > 40, `expected to check many recipes, checked ${checked}`);
});

test('the shaped path stays layout-sensitive', () => {
  // The regression that would matter most: if shapeless matching leaked into shaped recipes, a player
  // could craft a pickaxe from its three planks and two sticks in any arrangement, and armour likewise.
  const pickaxe = shaped.find(r => r.result.id === 'wooden_pickaxe');
  assert.ok(pickaxe, 'the wooden pickaxe shaped recipe should exist');

  // Its ingredients, laid out in a way that is NOT the recipe.
  const wrong = [];
  for (const row of pickaxe.pattern) for (const v of row) if (v !== null) wrong.push(v);
  // Fill row-major: three planks along the top then two sticks, which is not the pickaxe shape.
  const result = findMatchingRecipe(grid3(wrong), 3, 3, RECIPES_3X3);
  if (result) {
    assert.notEqual(result.id, 'wooden_pickaxe',
      'a shaped recipe matched a layout it was not authored for, so shape sensitivity is broken');
  }

  // And the correct layout must still work.
  const grid = new Array(9).fill(null);
  for (let r = 0; r < pickaxe.pattern.length; r++) {
    for (let c = 0; c < pickaxe.pattern[r].length; c++) {
      const v = pickaxe.pattern[r][c];
      if (v !== null) grid[r * 3 + c] = { id: v, isBlock: typeof v === 'number', count: 1 };
    }
  }
  const ok = findMatchingRecipe(grid, 3, 3, RECIPES_3X3);
  assert.ok(ok, 'the pickaxe recipe did not match its own layout');
  assert.equal(ok.id, 'wooden_pickaxe');
});

test('the wool dyeing recipes work, in any arrangement', () => {
  // The concrete payoff: these are among the 59 that were previously dropped, and they are the reason
  // the item additions in the previous round could not be used to their full extent.
  const dyeRecipes = shapeless.filter(r => r.ingredients.length === 2
    && r.result.isBlock && typeof r.result.id === 'number'
    && /wool/i.test(String(r.result.id)) === false);
  // Identify by the recipe's own contents rather than by name, since results are numeric ids.
  const candidates = shapeless.filter(r => r.ingredients.length === 2
    && r.ingredients.some(v => typeof v === 'string' && v.endsWith('_dye')));
  assert.ok(candidates.length >= 10,
    `expected the dye recipes to be present, found ${candidates.length}`);
  for (const r of candidates) {
    const forward = findMatchingRecipe(grid3(r.ingredients), 3, 3, RECIPES_3X3);
    const backward = findMatchingRecipe(grid3([...r.ingredients].reverse()), 3, 3, RECIPES_3X3);
    assert.ok(forward && forward.id === r.result.id, 'dye recipe failed in its authored order');
    assert.ok(backward && backward.id === r.result.id, 'dye recipe failed reversed');
  }
  console.log(`  ${candidates.length} dye recipes match in either order`);
  void dyeRecipes;
});

test('gridMultiset reports the grid contents without collapsing duplicates', () => {
  // The helper the matcher depends on, tested directly, because an incorrect multiset would make
  // every shapeless assertion above pass for the wrong reason.
  const grid = grid3([BLOCKS.STONE, BLOCKS.STONE, 'stick']);
  assert.deepEqual(gridMultiset(grid, 3, 3), [BLOCKS.STONE, BLOCKS.STONE, 'stick'].sort());
  assert.equal(gridMultiset(grid3([]), 3, 3).length, 0);
  // An empty slot, and a slot whose count has run out, must both be absent.
  const spent = new Array(9).fill(null);
  spent[0] = { id: BLOCKS.STONE, isBlock: true, count: 0 };
  spent[1] = { id: BLOCKS.DIRT, isBlock: true, count: 1 };
  assert.deepEqual(gridMultiset(spent, 3, 3), [BLOCKS.DIRT]);
});

test('a shapeless recipe that fits 2x2 is available in the inventory grid', () => {
  const small = shapeless.filter(r => r.ingredients.length <= 4);
  assert.ok(small.length > 0, 'some shapeless recipes should fit the inventory grid');
  for (const r of small) {
    assert.ok(RECIPES_2X2.includes(r), 'a small shapeless recipe must be usable without a crafting table');
  }
  // And one works end to end in a 2x2 grid.
  const probe = small[0];
  const grid = new Array(4).fill(null);
  probe.ingredients.forEach((v, i) => { grid[i] = { id: v, isBlock: typeof v === 'number', count: 1 }; });
  const result = findMatchingRecipe(grid, 2, 2, RECIPES_2X2);
  assert.ok(result, 'a small shapeless recipe did not match in the 2x2 grid');
  assert.equal(result.id, probe.result.id);
});

test('a hay block uncrafts into nine wheat, as vanilla has it', () => {
  // Found by the Resource Inspector rather than by looking: `recipe-parity` reported exactly three items
  // vanilla can craft that this game cannot, and this was the only one whose ingredients both exist here.
  // The generator had dropped it because the block was registered twice -- as `hay_bale` and as the
  // vanilla `hay_block` -- and the recipe names the vanilla spelling. The duplicate is gone and the recipe
  // stays, because it is vanilla's and it is what makes a hay block give wheat back. See `inspector shadows`.
  const recipe = { id: 'hay_block', isBlock: true, count: 1 };
  const oneByOne = [recipe, null, null, null];
  assert.deepEqual(findMatchingRecipe(oneByOne, 2, 2, RECIPES_3X3), { id: 'wheat', isBlock: false, count: 9 });

  // It is shapeless, so the same single ingredient in a 3x3 grid behaves the same way.
  const centred = [null, null, null, null, recipe, null, null, null, null];
  assert.deepEqual(findMatchingRecipe(centred, 3, 3, RECIPES_3X3), { id: 'wheat', isBlock: false, count: 9 });

  // And it must not have become a catch-all: wheat alone is not a recipe.
  const wheat = { id: 'wheat', isBlock: false, count: 1 };
  assert.equal(findMatchingRecipe([wheat, null, null, null], 2, 2, RECIPES_3X3), null);
});
