// A block the player can place must also be obtainable as an item.
//
// This is the invariant that was violated silently. The mesher gained mushrooms, slabs, panes and beds
// as BLOCKS, but recipes reference ITEM names, so a mushroom that existed as a block still left every
// mushroom-stew recipe blocked -- and the block coverage figure could not show it, because it counts
// names rather than whether anything is usable.
//
// The generator now emits an item for every generated block. These tests pin that, and pin the two ways
// the emission itself went wrong while it was being written: a filter that tested the wrong set, and a
// carry-forward parse that matched two blocks and overwrote one with the other.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { EXTRA_BLOCK_IDS, EXTRA_BLOCK_DEFS } from '../src/extraContent.js';
import { EXTRA_ITEMS, EXTRA_ITEM_COUNT } from '../src/extraItems.js';

test('every generated block the player can place has a matching item', () => {
  // INTERNAL blocks are excluded, and that exclusion is the point: a door's open and top halves are
  // placed by the door itself and are never picked up, so they must NOT have items. Requiring one for
  // every block would have produced four creative items per door -- which is what the item generator's
  // skip prevents, and what this test would otherwise demand.
  const missing = [];
  for (const [constName, id] of Object.entries(EXTRA_BLOCK_IDS)) {
    if (EXTRA_BLOCK_DEFS[id]?.internal) continue;
    const name = constName.toLowerCase();
    if (ITEMS[name] === undefined) missing.push(name);
  }
  assert.deepEqual(missing, [],
    'these generated blocks cannot be picked up, so any recipe using them stays blocked: '
    + missing.slice(0, 12).join(', '));
});

test('internal blocks have no item of their own', () => {
  // The other direction, so the skip cannot silently over-apply and leave a door unplaceable.
  const internal = Object.entries(EXTRA_BLOCK_IDS)
    .filter(([, id]) => EXTRA_BLOCK_DEFS[id]?.internal);
  assert.ok(internal.length > 0, 'the door and trapdoor variants should be marked internal');
  for (const [constName] of internal) {
    const name = constName.toLowerCase();
    assert.equal(ITEMS[name], undefined,
      name + ' is placed by its parent block, so it should have no item');
  }
  // And each parent must have exactly one, or the door cannot be obtained.
  for (const key of ['SPRUCE_DOOR', 'SPRUCE_TRAPDOOR', 'BAMBOO_DOOR', 'COPPER_DOOR']) {
    const id = EXTRA_BLOCK_IDS[key];
    if (id === undefined) continue;
    assert.ok(ITEMS[key.toLowerCase()] !== undefined, key + ' should have an item');
  }
});

test('a generated item points at the block it places', () => {
  // A placeable item names its block, which is how the rest of the game models block items. Without
  // that, placing one would do nothing.
  let checked = 0;
  for (const [constName, def] of Object.entries(EXTRA_BLOCK_IDS)) {
    const name = constName.toLowerCase();
    const item = ITEMS[name];
    if (!item || !item.isBlock) continue;
    assert.equal(item.blockId, def,
      name + ' is marked placeable but points at block ' + item.blockId + ' rather than ' + def);
    checked++;
  }
  assert.ok(checked > 200, 'expected most generated blocks to have placeable items, checked ' + checked);
});

test('every item still resolves to real content', () => {
  // The carry-forward parse overwrote real definitions with metadata from a second block in the
  // generated file, so an item could end up with no name or icon while still existing as a key. Name
  // and icon are what make it usable, so both are required.
  for (const [name, def] of Object.entries(ITEMS)) {
    assert.ok(def && typeof def === 'object', name + ' has no definition object');
    assert.ok(typeof def.name === 'string' && def.name.length > 0, name + ' has no name');
    assert.ok(typeof def.icon === 'string' && def.icon.length > 0, name + ' has no icon');
  }
});

test('the generated item module reports its real size', () => {
  // EXTRA_ITEM_COUNT was double the real figure while the carry-forward parse matched two blocks. A
  // count that disagrees with the object is the cheapest signal that the parse is wrong.
  assert.equal(EXTRA_ITEM_COUNT, Object.keys(EXTRA_ITEMS).length,
    'the reported count disagrees with the number of entries, so the parse is probably matching too much');
  assert.ok(EXTRA_ITEM_COUNT >= 300,
    'expected the item set to include generated block items, found ' + EXTRA_ITEM_COUNT);
});

test('generated block definitions survive the item pass', () => {
  // The item generator and the block generator both write into the same registry module at import time.
  // A block whose definition was lost would still have an id and render as nothing.
  for (const [constName, id] of Object.entries(EXTRA_BLOCK_IDS)) {
    assert.ok(EXTRA_BLOCK_DEFS[id], 'block ' + constName + ' (' + id + ') has no definition');
    assert.ok(BLOCK_DEFS[id], 'block ' + constName + ' is not merged into BLOCK_DEFS');
    assert.equal(BLOCKS[constName], id, 'block ' + constName + ' has the wrong id');
  }
});
