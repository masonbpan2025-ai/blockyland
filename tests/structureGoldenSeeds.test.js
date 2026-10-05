// Golden-seed regression tests.
//
// `tests/golden/structureSeeds.json` records, for each implemented structure, the chunk it is first found at
// plus a hash of its plan and of every block realization writes. A diff here means STRUCTURE GENERATION
// CHANGED, which is exactly the signal a parity effort needs and exactly what re-running the updater erases.
//
// These goldens pin THIS ENGINE's behaviour, not vanilla's. They catch regressions; they cannot establish
// parity, which is why the parity matrix still records nothing as VERIFIED without a differential test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { generateGoldens, goldenFor, goldenStructureIds, LOCATE_CHUNK_LIMIT } from '../scripts/structure-goldens.mjs';
import { generatorCoverage } from '../src/worldgen/index.js';

const PATH = new URL('./golden/structureSeeds.json', import.meta.url);
const goldens = JSON.parse(readFileSync(PATH, 'utf8'));

test('the golden file is well formed and covers every implemented structure', () => {
  assert.equal(typeof goldens.seed, 'number');
  assert.match(goldens.generatedFor, /1\.21\.4/, 'the target version must be recorded, as the mission requires');
  assert.ok(goldens.entries.length >= 14, `expected most structures covered, got ${goldens.entries.length}`);

  // Every implemented id must be either recorded or explicitly reported as not found. A structure silently
  // missing from the net would be a regression the file could never catch.
  const covered = new Set([...goldens.entries.map((entry) => entry.id), ...goldens.unfound]);
  const { implemented } = generatorCoverage();
  for (const id of implemented) {
    assert.ok(covered.has(id), `${id} is implemented but has neither a golden nor an "unfound" entry`);
  }
  assert.deepEqual([...covered].sort(), [...implemented].sort(),
    'the golden file must describe exactly the implemented set');
  // The recorded order must match the generator's, so a diff in the file is readable.
  assert.deepEqual(goldens.entries.map((entry) => entry.id), goldenStructureIds().filter((id) => !goldens.unfound.includes(id)));
});

test('every recorded golden reproduces exactly', () => {
  for (const entry of goldens.entries) {
    const again = goldenFor(entry.id, goldens.seed);
    assert.ok(again, `${entry.id} could not be regenerated at all, but it has a golden`);
    // The chunk is compared first: a placement change is the most serious kind, because it moves every
    // structure in the world and breaks /locate, references and any later differential test.
    assert.equal(again.chunkX, entry.chunkX, `${entry.id} moved chunk on the X axis: run scripts/update-structure-goldens.mjs only if that is intended`);
    assert.equal(again.chunkZ, entry.chunkZ, `${entry.id} moved chunk on the Z axis`);
    assert.equal(again.pieces, entry.pieces, `${entry.id} changed its piece count`);
    assert.deepEqual(again.box, entry.box, `${entry.id} changed its start box`);
    assert.equal(again.planHash, entry.planHash, `${entry.id} changed its plan hash`);
    assert.equal(again.blockCount, entry.blockCount,
      `${entry.id} writes a different number of blocks: run scripts/update-structure-goldens.mjs only if that is intended`);
    assert.equal(again.contentHash, entry.contentHash,
      `${entry.id} writes different blocks or block states than the golden records`);
  }
});

test('regenerating the whole file is idempotent', () => {
  // If this ever fails while the per-entry test passes, the file's STRUCTURE is unstable (ordering, or an
  // unrecorded field), not the generation -- and a file that reshuffles itself makes every diff unreadable.
  const fresh = generateGoldens({ seed: goldens.seed });
  assert.deepEqual(fresh.entries, goldens.entries);
  assert.deepEqual(fresh.unfound, goldens.unfound);
  assert.equal(fresh.seed, goldens.seed);
});

test('the goldens cover the structures with the most moving parts, not just the easy ones', () => {
  const byId = new Map(goldens.entries.map((entry) => [entry.id, entry]));
  // A multi-piece jigsaw structure, a multi-piece cluster, a procedural structure with a trap and a
  // single-block structure: if any of these were absent the net would have an obvious hole.
  for (const id of ['pillager_outpost', 'ocean_ruin_cold', 'desert_pyramid', 'buried_treasure']) {
    assert.ok(byId.has(id), `${id} must be in the golden set`);
  }
  assert.ok(byId.get('pillager_outpost').pieces > 1, 'the jigsaw golden must cover a multi-piece plan');
  assert.ok(byId.get('ocean_ruin_cold').pieces > 1, 'the cluster golden must cover a multi-piece plan');
  assert.ok(byId.get('desert_pyramid').blockCount > 200, 'the pyramid golden must cover a large realization');
  assert.equal(byId.get('buried_treasure').blockCount, 1);
});

test('one structure is recorded as not found, and that is visible rather than hidden', () => {
  // `ruined_portal_jungle` was not located within the search bound while every other portal variant was. That
  // is a finding, not a rounding error: either its placement or its biome gate keeps it out of reach, and
  // recording it as "unfound" keeps it in view instead of silently dropping it from the net.
  assert.ok(goldens.unfound.length <= 1, `too many structures unlocatable: ${goldens.unfound.join(', ')}`);
  if (goldens.unfound.includes('ruined_portal_jungle')) {
    assert.ok(LOCATE_CHUNK_LIMIT >= 6000, 'the search bound must be generous enough for sparse sets');
  }
  // No id may be both recorded and unfound.
  for (const id of goldens.unfound) {
    assert.equal(goldens.entries.some((entry) => entry.id === id), false, `${id} is both found and unfound`);
  }
});
