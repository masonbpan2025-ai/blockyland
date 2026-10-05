// Bundles: vanilla's pouch, seventeen of them -- one plain and sixteen dyed.
//
// They were the largest cluster left in the "vanilla item name(s) absent" report: with the fish buckets done,
// the bundles were thirteen of what remained, and unlike the corals or the creeper head they need no new block
// art and unlike the map or the spyglass no engine feature. What they needed was an item to hold things and a
// rule about how much.
//
// The plain bundle's recipe is one string and one leather, straight out of the pinned data -- the generator
// had been skipping it because the *result* did not exist. The sixteen dyed ones have no entry in that data,
// so their dyeing recipes are hand-written here, because otherwise they would exist and be unobtainable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ITEMS, stackLimitFor } from '../src/blocks.js';
import { BUNDLE_CAPACITY, addToBundle, bundleContents, bundleLoad, isBundle, takeFromBundle } from '../src/bundles.js';
import { Inventory } from '../src/inventory.js';
import { RECIPES_2X2, RECIPES_3X3, findMatchingRecipe } from '../src/crafting.js';

const RECIPES = [...RECIPES_2X2, ...RECIPES_3X3];
const COLOURS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan',
  'purple', 'blue', 'brown', 'green', 'red', 'black'];
const ALL_BUNDLES = ['bundle', ...COLOURS.map((colour) => `${colour}_bundle`)];

// A null grid cell has to stay null: mapping it to an empty *object* made the matcher see a cell it could not
// place, so every centred layout failed.
const cell = (id) => (id === null ? null : { id, count: 1, isBlock: typeof id === 'number' });

/** Run a grid through the real matcher, so the recipe assertions are about behaviour. */
function craft(ids, width, height) {
  const found = findMatchingRecipe(ids.map(cell), width, height, RECIPES);
  return found?.result ?? found ?? null;
}

test('every bundle is an item that holds one stack', () => {
  assert.equal(ALL_BUNDLES.length, 17, 'one plain bundle and sixteen dyed ones');
  for (const name of ALL_BUNDLES) {
    assert.ok(ITEMS[name], `${name} should be an item`);
    assert.equal(ITEMS[name].stackSize, 1, 'a bundle is the stack, so it does not stack');
    assert.equal(stackLimitFor(name), 1, 'and the stack limit agrees');
    assert.equal(existsSync(`public/assets/items/${name}.png`), true, `${name} has no icon`);
  }
});

test('a bundle fills to sixty-four and takes one item out at a time', () => {
  const bundle = { id: 'bundle', isBlock: false, count: 1 };
  assert.equal(bundleLoad(bundleContents(bundle)), 0, 'a new bundle is empty');

  // Sixty-four stone go in, in two goes, and a sixty-fifth does not.
  const first = addToBundle(bundle, { id: 10, isBlock: true, count: 40 });
  assert.equal(first.moved, 40);
  assert.equal(bundleLoad(first.contents), 40);
  const second = addToBundle({ ...bundle, contents: first.contents }, { id: 10, isBlock: true, count: 30 });
  assert.equal(second.moved, 24, 'the cap is sixty-four, not the stack');
  assert.equal(bundleLoad(second.contents), BUNDLE_CAPACITY);
  assert.equal(addToBundle({ ...bundle, contents: second.contents }, { id: 10, isBlock: true, count: 1 }), null);

  // Taking gives one item, and the rest stay.
  const taken = takeFromBundle({ ...bundle, contents: second.contents });
  assert.deepEqual(taken.item, { id: 10, isBlock: true, count: 1 });
  assert.equal(bundleLoad(taken.contents), BUNDLE_CAPACITY - 1);
  // And an empty bundle has nothing to give, which is how the caller knows to place a block instead.
  assert.equal(takeFromBundle(bundle), null);
});

test('a bundle holds mixed contents and never another bundle', () => {
  const bundle = { id: 'bundle', isBlock: false, count: 1 };
  let contents = addToBundle(bundle, { id: 'apple', isBlock: false, count: 3 }).contents;
  contents = addToBundle({ ...bundle, contents }, { id: 'torch', isBlock: false, count: 5 }).contents;
  assert.equal(bundleLoad(contents), 8, 'eight items, of two kinds');
  assert.deepEqual(contents.map((entry) => entry.id), ['apple', 'torch'], 'in the order they went in');
  // The rule that keeps a bundle from being a bag of holding.
  assert.equal(addToBundle({ ...bundle, contents }, { id: 'bundle', isBlock: false, count: 1 }), null);
  assert.equal(addToBundle({ ...bundle, contents }, { id: 'red_bundle', isBlock: false, count: 1 }), null);
  // And only a bundle is a bundle.
  assert.equal(isBundle({ id: 'bundle' }), true);
  assert.equal(isBundle({ id: 'red_bundle' }), true);
  assert.equal(isBundle({ id: 'leather' }), false);
  assert.equal(isBundle(null), false);
});

test('the plain bundle is craftable from a string and a leather', () => {
  // The generator emits this one now that the item exists; before, it was one of the "skipped, result missing"
  // names, which is the whole reason the recipe was absent. The pinned data gives it as a *shape* rather than
  // as shapeless -- a string above a leather -- so the orientation is part of the recipe.
  const crafted = craft(['string', 'leather'], 1, 2);
  assert.ok(crafted, 'a string over a leather should craft something');
  assert.equal(String(crafted.id), 'bundle');
  // The same two the other way up is not that recipe.
  assert.equal(craft(['leather', 'string'], 1, 2), null, 'leather over string is not a bundle');
  // And centred in a 3x3, which is how a player would lay it out.
  const centred = craft([null, 'string', null, null, 'leather', null, null, null, null], 3, 3);
  assert.equal(String(centred?.id), 'bundle');
});

test('all sixteen dyed bundles are craftable from a dye', () => {
  for (const colour of COLOURS) {
    const crafted = craft(['bundle', `${colour}_dye`], 2, 1);
    assert.ok(crafted, `a bundle and ${colour}_dye should craft something`);
    assert.equal(String(crafted.id), `${colour}_bundle`, `${colour} dye should make a ${colour} bundle`);
    assert.equal(crafted.isBlock, false);
  }
  // Every colour has a dye and a bundle, so a missing item cannot pass this by matching nothing.
  for (const colour of COLOURS) {
    assert.ok(ITEMS[`${colour}_dye`], `${colour}_dye should be an item`);
    assert.ok(ITEMS[`${colour}_bundle`], `${colour}_bundle should be an item`);
  }
});

test('a pickup that will not fit goes into a bundle being carried', () => {
  // The only way a bundle fills: vanilla has no drag-into-bag gesture either. Driven through the real
  // inventory, because the rule lives at the end of its own add path rather than at each caller.
  const inventory = new Inventory({});
  inventory.hotbar.fill(null);
  inventory.storage.fill(null);
  inventory.hotbar[0] = { id: 'bundle', isBlock: false, count: 1 };

  // With room to spare, items go to ordinary slots and the bundle stays empty.
  assert.equal(inventory.addItem('apple', false, 4), true);
  assert.equal(bundleLoad(bundleContents(inventory.hotbar[0])), 0, 'a bundle is not filled while slots are free');

  // Fill every remaining slot, then ask for more: the bundle takes it.
  for (const list of [inventory.hotbar, inventory.storage]) {
    for (let i = 0; i < list.length; i++) if (!list[i]) list[i] = { id: 'stone', isBlock: true, count: 64 };
  }
  assert.equal(inventory.addItem('torch', false, 7), true, 'the bundle should take what the slots cannot');
  assert.equal(bundleLoad(bundleContents(inventory.hotbar[0])), 7);
  // Asking for more than the bundle can hold fills it to the cap and reports that not all of it fitted. That is
  // `addItem`'s existing contract -- it places what it can and returns false for the rest -- and the pickup loop
  // passes one item at a time, which is why a partial fill cannot lose anything.
  assert.equal(inventory.addItem('torch', false, BUNDLE_CAPACITY), false, 'not all of sixty-four fits');
  assert.equal(bundleLoad(bundleContents(inventory.hotbar[0])), BUNDLE_CAPACITY, 'but the bundle is now full');
  // A *fresh* item, because the four apples from the first step are still in a slot and would merge.
  assert.equal(inventory.addItem('flint', false, 1), false, 'a full inventory with a full bundle refuses');
});

test('the rules are wired in, not merely written', () => {
  // A deliberate wiring check, as for the fish buckets: a rule in a module nobody calls is a rule that does
  // nothing. `addItem` is where a pickup lands, and `main.js` is where using an item is handled.
  const inventory = readFileSync('src/inventory.js', 'utf8');
  assert.match(inventory, /fillHeldBundle\(/, 'the inventory never fills a bundle');
  const main = readFileSync('src/main.js', 'utf8');
  assert.match(main, /takeFromBundle\(/, 'using a bundle never gives anything back');
});
