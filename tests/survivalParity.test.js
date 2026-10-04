// Survival parity coverage.
//
// The objective is parity with official Minecraft's survival mode, so "how much parity" has to be a
// MEASURED number rather than an impression. This file pins the two things that can be counted
// against upstream data:
//
//   1. How much of vanilla's content this game names at all (blocks and items).
//   2. How many of vanilla's crafting recipes are fully expressible with the blocks and items the
//      game actually has -- meaning every ingredient resolves AND the result resolves.
//
// Number 2 is the honest one, and it is much more demanding than it looks: a recipe counts only if
// its result exists AND every ingredient exists. That is why a large recipe count can coexist with a
// low coverage number, and why the per-family breakdown below is the useful part.
//
// The vanilla data lives in a gitignored cache (1.3MB of upstream JSON). If it is absent these tests
// report that plainly rather than failing, because a fresh checkout legitimately has no cache.
import test from 'node:test';
import assert from 'node:assert/strict';
import { measure, CACHE_PRESENT, have, gameNames } from '../scripts/parity-coverage.mjs';

const skip = CACHE_PRESENT ? false : 'vanilla data cache not present; run scripts/generate-mc-data.mjs';

test('parity coverage can be measured against upstream vanilla data', { skip }, () => {
  const m = measure();
  assert.ok(m.total > 1000, `expected the full vanilla recipe set, got ${m.total}`);
  assert.ok(m.expressible > 0, 'the game should express at least some vanilla recipes');
  assert.ok(m.expressible <= m.total, 'coverage cannot exceed the total');
});

test('recipe coverage is recorded as a baseline and must not regress', { skip }, () => {
  // A floor, not a target. Raising these numbers is the work; lowering them means content was
  // removed or the name mapper broke, which is exactly what this catches.
  const m = measure();
  const recipesPct = 100 * m.expressible / m.total;
  const blocksPct = 100 * m.knownBlocks / m.blockNames.length;
  const itemsPct = 100 * m.knownItems / m.itemCount;

  // Baselines measured when this test was written.
  assert.ok(recipesPct >= 20,
    `crafting recipe coverage fell to ${recipesPct.toFixed(1)}% (baseline 21.6%)`);
  assert.ok(blocksPct >= 17,
    `named-block coverage fell to ${blocksPct.toFixed(1)}% (baseline 17.9%)`);
  assert.ok(itemsPct >= 29,
    `named-item coverage fell to ${itemsPct.toFixed(1)}% (baseline 29.7%)`);

  console.log(`  crafting recipes : ${m.expressible}/${m.total} (${recipesPct.toFixed(1)}%)`);
  console.log(`  named blocks     : ${m.knownBlocks}/${m.blockNames.length} (${blocksPct.toFixed(1)}%)`);
  console.log(`  named items      : ${m.knownItems}/${m.itemCount} (${itemsPct.toFixed(1)}%)`);
});

test('the name mapper resolves present content and not absent content', { skip }, () => {
  // The mapper is load-bearing: every coverage number depends on it. Checked in BOTH directions, so a
  // permissive mapper cannot silently inflate coverage and a broken one cannot silently deflate it.
  //
  // The "present" list deliberately includes content added by the generator, so this also acts as a
  // regression test that the generated blocks actually reached the registry.
  for (const name of ['oak_planks', 'stick', 'cobblestone', 'iron_ingot', 'diamond', 'crafting_table',
    'bamboo_planks', 'crimson_planks', 'warped_planks', 'orange_wool', 'magenta_wool', 'black_concrete',
    'diorite', 'andesite', 'granite', 'honeycomb_block']) {
    assert.equal(have(name), true, `${name} should resolve, it exists in the game`);
  }
  // Genuinely still absent, and among the largest remaining blockers. If one of these starts
  // resolving that is progress, and this test should be updated deliberately rather than silently.
  for (const name of ['glass_pane', 'white_candle', 'stone_slab', 'white_bed', 'oak_slab', 'oak_stairs', 'white_carpet']) {
    assert.equal(have(name), false, `${name} is absent from the game and must not resolve`);
  }
});

test('coverage breakdown identifies what to add next', { skip }, () => {
  // Guards the SHAPE of the gap rather than naming specific families. An earlier version asserted that
  // wool colours and plank types were still blockers; completing those families made the assertions
  // fail while the code was strictly better. What must hold is that blockers are reported at all, and
  // that the classifier puts them in the right buckets -- so a broken regex is caught without the test
  // having to be rewritten every time content is added.
  const m = measure();
  const blocked = [...m.blockedBy].sort((a, b) => b[1] - a[1]);
  assert.ok(blocked.length > 50, 'many vanilla names are missing, which is the whole gap');
  assert.ok(blocked[0][1] >= 5,
    `the most-blocking name only blocks ${blocked[0][1]} recipes, which suggests the classifier broke`);

  // The classifier must bucket names by family without dropping any.
  const classify = (n) => {
    if (/_wool$/.test(n)) return 'wool';
    if (/_planks$/.test(n)) return 'planks';
    if (/_dye$/.test(n) || /_carpet$/.test(n) || /_concrete(_powder)?$/.test(n)) return 'colour';
    if (/_slab$/.test(n) || /_stairs$/.test(n)) return 'shapes';
    if (/_bed$/.test(n) || /_banner$/.test(n) || /_candle$/.test(n)) return 'furniture';
    return 'other';
  };
  const buckets = new Map();
  for (const [name] of blocked) {
    const b = classify(name);
    buckets.set(b, (buckets.get(b) || 0) + 1);
  }
  assert.equal([...buckets.values()].reduce((a, b) => a + b, 0), blocked.length,
    'every blocker must land in exactly one bucket');
  // 'other' should not swallow everything, or the classification is not doing any work.
  assert.ok(buckets.get('other') < blocked.length,
    'every blocker classified as other, so the family regexes are not matching');
  console.log('  blocker buckets: ' + [...buckets].map(([k, v]) => k + ' ' + v).join(', '));
});