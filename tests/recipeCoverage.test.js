// Pin the implemented-recipe count as a floor, and guard the distinction between "implemented" and
// "expressible".
//
// These are different numbers and reporting the wrong one would overstate progress. Expressible means
// the content a recipe needs exists, which is a ceiling; implemented means the recipe is actually in
// the game. Before this work the game had ~53 hand-written recipes while being able to express 336.
import test from 'node:test';
import assert from 'node:assert/strict';
import { implementedRecipes, measure, CACHE_PRESENT } from '../scripts/parity-coverage.mjs';
import { RECIPES_2X2, RECIPES_3X3, GENERATED_RECIPE_COUNT } from '../src/crafting.js';

const skip = CACHE_PRESENT ? false : 'vanilla data cache not present';

test('implemented recipes are counted separately from expressible ones', { skip }, () => {
  // These measure different things and neither bounds the other.
  //
  //   expressible -- vanilla recipes whose result AND ingredients both exist in this game. This is a
  //                 ceiling on VANILLA recipes only.
  //   implemented -- the recipes actually in the game. This includes hand-written recipes that are
  //                 deliberately NOT vanilla (the red bed item, the redstone components), so it can
  //                 legitimately exceed the vanilla-expressible ceiling.
  //
  // An earlier version of this test asserted implemented <= expressible and failed, which is the
  // correct outcome for a comparison between two different sets.
  const impl = implementedRecipes();
  assert.ok(impl, 'the measurement should produce a result when the cache is present');
  const m = measure();

  assert.ok(impl.implemented > 0 && impl.implemented <= impl.vanillaTotal,
    `implemented ${impl.implemented} is outside 1..${impl.vanillaTotal}`);
  assert.ok(m.expressible > 0 && m.expressible <= m.total,
    `expressible ${m.expressible} is outside 1..${m.total}`);

  // Both should be a meaningful fraction, or the measurement is not telling us anything.
  assert.ok(impl.implemented / impl.vanillaTotal > 0.2,
    'less than a fifth of vanilla recipes are implemented, which would be a regression');
  assert.ok(m.expressible / m.total > 0.2,
    'less than a fifth of vanilla recipes are expressible, which would be a regression');

  // The gap between them is explained by missing results and by non-vanilla hand-written recipes.
  assert.ok(impl.handWritten > 0, 'the game has hand-written recipes and they should be counted');
  console.log(`  expressible ${m.expressible}/${m.total}, implemented ${impl.implemented}/${impl.vanillaTotal} `
    + `(${impl.generated} generated + ${impl.handWritten} hand-written)`);
});

test('the implemented recipe count does not regress', { skip }, () => {
  const impl = implementedRecipes();
  // Floor, not target. Raised whenever real recipes are added; lowering it means recipes were lost.
  assert.ok(impl.implemented >= 1320,
    `only ${impl.implemented} recipes are implemented, down from 549`);
  assert.equal(impl.generated, GENERATED_RECIPE_COUNT,
    'the report and the merged recipe list must agree on how many were generated');
});

test('the recipe lists the game actually uses reflect the generated set', () => {
  assert.ok(RECIPES_3X3.length >= 1320,
    `RECIPES_3X3 has ${RECIPES_3X3.length} entries, expected at least 540`);
  assert.ok(RECIPES_2X2.length >= 310,
    `RECIPES_2X2 has ${RECIPES_2X2.length} entries; small vanilla recipes should work in the 2x2 grid`);
  assert.equal(GENERATED_RECIPE_COUNT, 1264,
    'the generated recipe count changed; update this expectation deliberately if that was intended');
});

test('missing results remain the larger half of the gap', { skip }, () => {
  // This guides the backlog: adding content is what makes its recipes craftable, so the result side is
  // the one to work on first. The RATIO between the two is deliberately not asserted.
  //
  // It was about 5.4x when this test was written and is now about 2.1x, because implementing results is
  // precisely what shrinks that side. A frozen threshold turns normal progress into a failure -- which
  // is exactly what happened here -- while the ORDERING is the durable claim. If the ingredient side
  // ever overtook the result side that would be worth knowing, because it would mean the next work is
  // ingredients rather than content.
  const impl = implementedRecipes();
  assert.ok(impl.skippedMissingResult > impl.skippedMissingIngredient,
    'missing results (' + impl.skippedMissingResult + ') should still exceed missing ingredients ('
    + impl.skippedMissingIngredient + '); if that inverts, the backlog ordering is stale');
  // Both sides should still be substantial, or the measurement has stopped telling us anything.
  assert.ok(impl.skippedMissingIngredient > 20,
    'a tiny ingredient gap would suggest the accounting broke, not that everything is done');
  console.log('  gap: ' + impl.skippedMissingResult + ' missing results, '
    + impl.skippedMissingIngredient + ' missing ingredients');
});
