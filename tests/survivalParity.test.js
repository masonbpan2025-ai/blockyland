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
  // The negative case uses names that cannot ever resolve.
  //
  // Twice this list named real content that a later round then implemented -- slabs, then panes --
  // and the test failed on each improvement. Naming real content is inherently fragile here. What the
  // check is actually for is that the mapper is not so permissive that everything resolves, which
  // would inflate every coverage figure silently, and nonsense names prove that permanently.
  for (const name of ['definitely_not_a_block', 'not_a_real_item_at_all', 'oak_planks_that_never_existed', 'zzz_zzz_zzz']) {
    assert.equal(have(name), false, `${name} does not exist anywhere and must not resolve`);
  }
  // And a name that is absent: Education Edition items like ice_bomb are excluded from the Java baseline.
  assert.equal(have('ice_bomb'), false, 'education items like ice_bomb do not resolve in the vanilla baseline');
});

test('coverage breakdown identifies what to add next', { skip }, () => {
  // Guards the SHAPE of the gap rather than naming specific families. An earlier version asserted that
  // wool colours and plank types were still blockers; completing those families made the assertions
  // fail while the code was strictly better. What must hold is that blockers are reported at all, and
  // that the classifier puts them in the right buckets -- so a broken regex is caught without the test
  // having to be rewritten every time content is added.
  const m = measure();
  const blocked = [...m.blockedBy].sort((a, b) => b[1] - a[1]);
  // NEITHER the count NOR the top magnitude is asserted any more, and the reason is the same for both.
  //
  // The count was over 50 when this was written, then 1, and is now ZERO -- every recipe that can be
  // expressed from names this game has, has been. Both earlier thresholds (a count floor and a magnitude
  // floor) turned progress into a failure, which is the mistake this file has made three times.
  //
  // SO THE FLOOR IS GONE ENTIRELY. `blocked.length > 0` was the last of them, and it is now a claim that is
  // FALSE and should be false: asserting it would mean the work can never be finished. What remains is the
  // part that stays true either way -- the report is internally consistent, and every name it does list is
  // genuinely absent -- so a broken measurement still fails while a complete one passes.
  for (const [name, count] of blocked) {
    assert.ok(count >= 1, `${name} is listed as a blocker but blocks ${count} recipes`);
    assert.ok(count <= m.total, 'a single name cannot block more recipes than exist');
    assert.equal(have(name), false, name + ' is listed as a blocker but the game already has it');
  }

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
  // NOT asserted: that 'other' is less than the total.
  //
  // That held while the gap was dominated by wool, planks, slabs and beds. It is now false BECAUSE
  // those families were completed, and what remains is genuinely miscellaneous -- candle, chain, vine,
  // and a scattering of stone variants. Requiring a family-shaped remainder would make this test fail
  // precisely as the work succeeds, which is what happened.
  //
  // What still matters is that 'other' is not absorbing names the classifier should recognise, so the
  // must-classify list below does the real work.
  // Each name must EXIST *and* be one the classifier has a rule for. Two earlier drafts failed for one
  // reason each: oak_fence is not implemented at all, and oak_door has no rule -- the classifier covers
  // wool, planks, dye/carpet/concrete, slab/stairs and bed/banner/candle, and nothing else. A
  // must-classify list has to respect both constraints or it tests the list rather than the code.
  for (const name of ['oak_slab', 'oak_stairs', 'white_bed', 'white_carpet',
    'white_wool', 'oak_planks', 'magenta_dye']) {
    assert.notEqual(classify(name), 'other', name + ' should fall into a named family, not other');
  }
  console.log('  blocker buckets: ' + [...buckets].map(([k, v]) => k + ' ' + v).join(', '));
});