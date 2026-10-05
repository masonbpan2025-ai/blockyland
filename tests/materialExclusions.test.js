// Content that a broad pattern was silently swallowing.
//
// Two names were missing for reasons no coverage figure could show. `breeze_rod` is an ITEM, not a
// block, so no block family could ever have emitted it -- and the item generator's exclusion list
// matched it with a `_rod` pattern written for `fishing_rod`. `pumpkin` is a plain full cube that no
// family listed, while its own carved and jack-o'-lantern forms were present.
//
// Both failed silently. The tests below pin the names, and the last one pins the REASON, so the
// exclusion list cannot quietly grow a pattern that swallows real materials again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { implementedRecipes } from '../scripts/parity-coverage.mjs';

test('breeze_rod exists as an item, because it is not a block', () => {
  // The whole point: no block family could have produced this, so a block-only generator would always
  // report it missing no matter how many families were added.
  assert.ok(ITEMS.breeze_rod !== undefined, 'breeze_rod should be an item');
  assert.equal(ITEMS.breeze_rod.isBlock, undefined, 'and must not be marked as a block');
  assert.ok(ITEMS.breeze_rod.icon, 'and needs an icon');
});

test('plain pumpkin exists as a block, alongside its carved forms', () => {
  const id = BLOCKS.PUMPKIN;
  assert.ok(id !== undefined, 'pumpkin should exist as a block');
  const def = BLOCK_DEFS[id];
  assert.ok(def, 'and have a definition');
  assert.equal(def.cube, true, 'and be marked as a plain cube');
  // Its derived forms were already present, which is what made the gap easy to miss.
  assert.ok(BLOCKS.CARVED_PUMPKIN !== undefined, 'carved pumpkin should exist');
  assert.ok(BLOCKS.JACK_O_LANTERN !== undefined, 'jack o lantern should exist');
});

test('no recipe is left blocked by a missing ingredient except the documented one', () => {
  // The figure these two names actually moved. An earlier version of this test asserted
  // `results.size > 0` and that a known item was present, which passes whatever the code does -- the
  // same vacuous shape as the sign test that could not fail.
  //
  // `skippedMissingIngredient` counts recipes whose ingredients do not all exist, and it fell from 6 to
  // 1 when breeze_rod and pumpkin landed. One remains and is expected: its ingredient needs engine work
  // and is on the documented exclusion list, so the assertion is a ceiling rather than an equality.
  const impl = implementedRecipes();
  if (!impl) {
    console.log('  vanilla cache absent; skipping the figure check');
    return;
  }
  assert.ok(impl.skippedMissingIngredient <= 1,
    'ingredient-side coverage regressed: ' + impl.skippedMissingIngredient + ' recipes lack an ingredient');
  assert.ok(impl.skippedMissingResult >= 1,
    'every result existing would mean the cache is stale, not that parity is complete');
  console.log('  ' + impl.vanillaImplemented + '/' + impl.vanillaTotal + ' recipes, '
    + impl.skippedMissingResult + ' missing results, ' + impl.skippedMissingIngredient + ' missing ingredients');
});

test('the item exclusion list names fishing_rod rather than the _rod suffix', () => {
  // The regression guard. `_rod` matched breeze_rod and removed it from the generator's output with no
  // message, so the pattern is asserted directly rather than only its effect on today's content.
  const source = readFileSync('scripts/generate-items.mjs', 'utf8');
  const m = /const NEEDS_STATS = \/([\s\S]*?)\/;/.exec(source);
  assert.ok(m, 'the exclusion pattern should still be findable');
  const pattern = m[1];
  assert.ok(pattern.includes('fishing_rod'), 'fishing_rod should be named explicitly');
  // A bare `_rod` alternative is the bug. `fishing_rod` contains `_rod`, so the check is for the
  // pattern appearing as its own alternative rather than inside a longer name.
  const alternatives = pattern.split('|');
  assert.equal(alternatives.includes('_rod'), false,
    'the bare _rod alternative swallows breeze_rod; name the tool instead');
  // And the excluded set is exactly the documented engine-work items, so this list cannot grow silently.
  const engine = /const NEEDS_ENGINE = new Map\(\[([\s\S]*?)\]\);/.exec(source);
  assert.ok(engine, 'the engine-work list should still be findable');
  const names = [...engine[1].matchAll(/\['([a-z_]+)'/g)].map(x => x[1]);
  assert.deepEqual(names.sort(), ['brush', 'bundle', 'firework_rocket', 'firework_star',
    'goat_horn', 'map', 'recovery_compass', 'spyglass'],
  'the engine-work exclusions should not change without a deliberate edit');
});
