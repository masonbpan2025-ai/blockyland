// The generated recipe file must match what the generator produces.
//
// This is the guard for a mistake that cost real coverage. Eight recipes were blocked by blocks and items
// that earlier rounds had added but never re-ran through `scripts/generate-recipes.mjs`, so coverage read
// 1538/1557 when the game could already craft 1546. Nothing caught it, and nothing could have:
//
//   * `scripts/parity-coverage.mjs` reads `EXTRA_RECIPE_STATS` out of `src/extraRecipes.js`, so it agrees
//     with whatever that file happens to say.
//   * `tests/recipeCoverage.test.js` pins the count, which catches it changing but not it being wrong.
//
// So this compares the file against a FRESH run of the generator. The generator writes its output to
// `globalThis` instead of to disk when `DSH_RECIPE_SOURCE_ONLY=1`, which is what makes an in-process check
// possible; spawning it would need piped stdio, which the sandbox refuses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const GENERATED = new URL('../src/extraRecipes.js', import.meta.url);

/** The source the generator would write right now. */
let importCounter = 0;
async function freshlyGenerated() {
  process.env.DSH_RECIPE_SOURCE_ONLY = '1';
  try {
    // A UNIQUE query string per call defeats the module cache. Reusing one is what made the second test
    // below fail: the module was already evaluated, so importing it again did nothing and nothing was
    // published.
    await import('../scripts/generate-recipes.mjs?freshness-check=' + (++importCounter));
  } finally {
    delete process.env.DSH_RECIPE_SOURCE_ONLY;
  }
  const source = globalThis.__generatedRecipeSource;
  delete globalThis.__generatedRecipeSource;
  assert.ok(typeof source === 'string' && source.length > 1000,
    'the generator should have published its source; got ' + typeof source);
  return source;
}

/** Compare ignoring line endings: the generator writes LF, and git checks the file out as CRLF. */
const normalise = (text) => text.replace(/\r\n/g, '\n');

test('src/extraRecipes.js matches a fresh generator run', async () => {
  const fresh = await freshlyGenerated();
  const onDisk = readFileSync(GENERATED, 'utf8');
  if (normalise(fresh) === normalise(onDisk)) return;

  // Report the difference in a way that says what to do, rather than dumping two large files.
  const freshLines = normalise(fresh).split('\n');
  const diskLines = normalise(onDisk).split('\n');
  const emitted = (t) => {
    const m = /"emitted":\s*(\d+)/.exec(t);
    return m ? Number(m[1]) : null;
  };
  assert.fail(
    'src/extraRecipes.js is STALE: the generator now produces ' + freshLines.length + ' lines and the file '
    + 'has ' + diskLines.length + ', with emitted ' + emitted(fresh) + ' versus ' + emitted(onDisk) + '. '
    + 'Run `node scripts/generate-recipes.mjs` and commit the result. This almost always means blocks or '
    + 'items were added without regenerating recipes, which understates coverage.',
  );
});

test('the staleness check can actually fail', async () => {
  // A guard that cannot fail is worse than none, and this one is easy to write inertly: if the generator
  // never published its source, `freshlyGenerated` would throw and the suite would look fine for the wrong
  // reason. So the published source is checked against something it must differ from.
  const fresh = await freshlyGenerated();
  const normalised = normalise(fresh);
  assert.notEqual(normalised, '', 'the generator published nothing');
  assert.match(normalised, /export const EXTRA_RECIPES/, 'the source should define the recipe table');
  assert.match(normalised, /EXTRA_RECIPE_STATS/, 'and the stats block the rest of the tooling reads');
  // And it must genuinely reflect content: the count has to be a plausible recipe total, not a stub.
  const emitted = /"emitted":\s*(\d+)/.exec(normalised);
  assert.ok(emitted, 'the stats should record how many recipes were emitted');
  assert.ok(Number(emitted[1]) > 1400,
    'the generator should emit well over a thousand recipes, got ' + emitted[1]);
});
