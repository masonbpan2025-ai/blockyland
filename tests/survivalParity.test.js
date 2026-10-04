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

test('the name mapper resolves known vanilla names correctly', { skip }, () => {
  // The mapper is load-bearing: every coverage number depends on it. Spot-check names that must
  // resolve, and names that must not, so a broken mapper cannot silently inflate coverage.
  for (const name of ['oak_planks', 'stick', 'cobblestone', 'iron_ingot', 'diamond', 'crafting_table']) {
    assert.equal(have(name), true, `${name} should resolve, it exists in the game`);
  }
  // These are genuinely absent, and are the top blockers, so they must report as missing --
  // otherwise coverage would be overstated.
  for (const name of ['bamboo_planks', 'crimson_planks', 'orange_wool', 'honeycomb', 'glass_pane']) {
    assert.equal(have(name), false, `${name} is absent from the game and must not resolve`);
  }
});

test('coverage breakdown identifies what to add next', { skip }, () => {
  // Guards the *shape* of the gap, so the reported work stays aimed at real families rather than at
  // whatever single name happens to be most frequent.
  const m = measure();
  const blocked = [...m.blockedBy].sort((a, b) => b[1] - a[1]);
  assert.ok(blocked.length > 50, 'many vanilla names are missing, which is the whole gap');

  const families = {
    wool: blocked.filter(([n]) => /_wool$/.test(n)).reduce((a, [, n]) => a + n, 0),
    planks: blocked.filter(([n]) => /_planks$/.test(n)).reduce((a, [, n]) => a + n, 0),
    dyes: blocked.filter(([n]) => /_dye$/.test(n) || /_carpet$/.test(n) || /_concrete$/.test(n)).reduce((a, [, n]) => a + n, 0),
  };
  // Vanilla's coloured and wood-variant families are the bulk of the gap; if any of these reads zero
  // the family regexes have broken and the guidance would be wrong.
  assert.ok(families.wool > 0, 'wool colours should be a blocker');
  assert.ok(families.planks > 0, 'plank wood types should be a blocker');
  assert.ok(families.dyes > 0, 'dye/carpet/concrete should be a blocker');
  console.log(`  blocked slots -- wool ${families.wool}, planks ${families.planks}, dyes ${families.dyes}`);
});

test('the game name vocabulary is stable', () => {
  // gameNames is derived from BLOCKS/ITEMS/BLOCK_DEFS, so this catches an accidental registry change
  // that would move every coverage number without any content actually being added.
  assert.ok(gameNames.size > 400, `expected a large vocabulary, got ${gameNames.size}`);
  assert.ok(gameNames.has('stone'), 'stone must be in the vocabulary');
  assert.ok(gameNames.has('oak_planks'), 'oak_planks must be in the vocabulary');
});
