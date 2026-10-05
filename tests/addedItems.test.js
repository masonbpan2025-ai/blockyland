// The items this branch added, in a file of their own.
//
// They lived in `src/blocks.js`'s item table, and two concurrent commits rewrote that region and deleted them:
// their branches were cut before these batches, their edits landed on the same lines, and a merge that
// resolved cleanly still lost the items. The fish buckets went twice -- once inside a visible conflict and
// once inside a hunk that merged silently -- and the bundles went once, alongside seventeen item definitions
// that a conflict would have deleted.
//
// So the definitions moved here, where a commit that has never heard of them cannot rewrite them, and
// `blocks.js` merges them in with one line. This file checks three things: that the merge happens, that it
// changes nothing a consumer can see, and that the definitions are *actually* gone from the contested file
// rather than copied into both.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ITEMS } from '../src/blocks.js';
import { addedItems } from '../src/addedItems.js';

const ADDED = addedItems();
const NAMES = Object.keys(ADDED);

test('every added item reached the item table', () => {
  assert.ok(NAMES.length >= 65, `expected the branch\'s items here, found ${NAMES.length}`);
  for (const name of NAMES) {
    assert.ok(ITEMS[name], `${name} is declared here but missing from ITEMS`);
    assert.deepEqual(ITEMS[name], ADDED[name], `${name} differs between the two tables`);
  }
  // The families this branch added, named so a wholesale loss is caught rather than counted. The fish buckets
  // are listed one by one rather than as a `_bucket` family, because `lava_bucket` and `milk_bucket` are
  // somebody else's items and belong to neither table here.
  for (const family of ['_bundle', '_pottery_sherd', '_shulker_box']) {
    const here = NAMES.filter((name) => name.endsWith(family));
    const there = Object.keys(ITEMS).filter((name) => name.endsWith(family));
    assert.ok(here.length > 0, `no ${family} items here`);
    assert.deepEqual(there.sort(), here.sort(), `the ${family} family does not match`);
  }
  for (const bucket of ['cod_bucket', 'salmon_bucket', 'pufferfish_bucket', 'tropical_fish_bucket',
    'axolotl_bucket', 'tadpole_bucket']) {
    assert.ok(NAMES.includes(bucket), `${bucket} should be declared here`);
  }
  for (const single of ['scaffolding', 'cake', 'bundle']) {
    assert.ok(NAMES.includes(single), `${single} should be declared here`);
  }
});

test('nothing here shadows an item declared elsewhere', () => {
  // The merge is `Object.assign`, so a name in both places would silently overwrite the other definition.
  // That is the failure this test exists for: a copied rather than moved entry.
  const source = readFileSync('src/blocks.js', 'utf8');
  const declaredThere = new Set([...source.matchAll(/^  ([a-z0-9_]+): \{/gm)].map((match) => match[1]));
  const shadowed = NAMES.filter((name) => declaredThere.has(name));
  assert.deepEqual(shadowed, [], 'these items are declared in both files, so the merge would pick one');
});

test('the contested file no longer holds them, and does merge them', () => {
  // The point of the exercise, stated as a check: the definitions are gone from `blocks.js` and it calls the
  // merge instead. If a future merge puts them back, this fails and says why that matters.
  const source = readFileSync('src/blocks.js', 'utf8');
  for (const name of ['cod_bucket:', 'bundle:', 'angler_pottery_sherd:', 'white_shulker_box:', 'scaffolding:']) {
    assert.equal(source.includes(`  ${name}`), false, `${name} is back in blocks.js`);
  }
  assert.match(source, /Object\.assign\(ITEMS, addedItems\(\)\)/, 'and blocks.js should merge them in');
  assert.match(source, /from '\.\/addedItems\.js'/, 'from a file it imports');
});

test('the table is built on demand, not at import time', () => {
  // A plain object would read `BLOCKS` while `blocks.js` is still evaluating, because `blocks.js` imports this
  // file to merge it -- a cycle. A function defers the reads to the merge call, which is why this is one.
  assert.equal(typeof addedItems, 'function');
  assert.notEqual(addedItems(), addedItems(), 'a fresh table each call, so the merge cannot be aliased');
  assert.deepEqual(addedItems(), ADDED, 'and the same contents');
});
