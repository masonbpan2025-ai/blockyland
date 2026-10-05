// Placement DENSITY, measured the way a region actually works.
//
// This file exists because of a mistake I made twice. I scanned three chunkZ rows for a set whose placement
// region is 40x40, counted the candidates, and compared the result against an expectation that assumed full
// coverage -- and then reported the shortfall as a possible defect. It was not: within a 40x40 region a
// random-spread placement yields exactly ONE candidate chunk, so scanning 3 of 40 z-rows samples 3/40 of one
// region row. The scan measured the scan.
//
// So the assertions here are always NORMALISED by the region size: sample whole region rows, then require
// exactly one candidate per region. That turns "this structure seems too rare" into a statement about the
// engine rather than about the sampler, and it would have caught both of my false findings immediately.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createStructureEngine } from '../src/worldgen/index.js';

/** Sample `regionCount` whole region rows in X, across the full region height in Z. */
function measure(engine, set, regionCount = 10) {
  const placement = set.placement;
  const spacing = placement.spacing;
  const rows = spacing + 1;
  let candidates = 0;
  let plans = 0;
  for (let cx = 0; cx < spacing * regionCount; cx++) {
    for (let cz = 0; cz < rows; cz++) {
      if (placement.isPlacementChunk(engine.seed, cx, cz)) candidates++;
      const plan = engine.planChunk(cx, cz);
      if (plan && plan.set === set.name) plans++;
    }
  }
  return { candidates, plans, regions: regionCount, perRegion: candidates / regionCount, spacing, rows };
}

test('a random-spread set yields exactly one candidate per region, once sampling is normalised', () => {
  // Each set gets a biome its own members accept. An OCEAN structure placed with a jungle biome correctly
  // produces no plans at all -- the retry loop exhausts the pool -- so a single shared biome would test the
  // biome gate rather than the density.
  const biomeFor = { ruined_portals: 'jungle', shipwrecks: 'ocean', ocean_ruins: 'ocean', buried_treasures: 'beach' };
  for (const setName of ['ruined_portals', 'shipwrecks', 'ocean_ruins']) {
    const engine = createStructureEngine({ seed: 20250401, blockIds: {}, biomeAt: () => biomeFor[setName] ?? 'plains', surfaceY: () => 70 });
    const set = engine.sets.get(setName);
    if (!set) continue;
    const result = measure(engine, set, 10);
    // One candidate per region is the defining property of a random-spread placement. Asserting the RATIO
    // rather than a raw count is what makes this robust to the region size.
    assert.ok(result.perRegion >= 0.9 && result.perRegion <= 1.1,
      `${setName}: ${result.perRegion.toFixed(2)} candidates per region, expected 1.00 (spacing ${result.spacing})`);
    // And every candidate must produce a plan, because the engine retries the set's other members when one
    // refuses. A gap here would mean selection or gating is dropping candidates.
    assert.equal(result.plans, result.candidates,
      `${setName}: ${result.candidates} candidates produced ${result.plans} plans`);
  }
});

test('sampling fewer chunk rows than the spacing UNDER-counts, which is the trap this file documents', () => {
  const engine = createStructureEngine({ seed: 20250401, blockIds: {}, biomeAt: () => 'jungle', surfaceY: () => 70 });
  const set = engine.sets.get('ruined_portals');
  const full = measure(engine, set, 10);
  // The same X range, but only three z-rows: the exact mistake that produced deviation 0d.
  let thin = 0;
  for (let cx = 0; cx < set.placement.spacing * 10; cx++) {
    for (let cz = 0; cz <= 2; cz++) if (set.placement.isPlacementChunk(engine.seed, cx, cz)) thin++;
  }
  assert.ok(thin < full.candidates,
    'a partial scan must under-count, which is why it cannot be used to claim a structure is too rare');
  const sampledFraction = 3 / (set.placement.spacing + 1);
  const explained = full.candidates * sampledFraction;
  // The thin count must be within a couple of candidates of the sampling fraction, i.e. fully explained by
  // the sampling and NOT by any engine behaviour.
  assert.ok(Math.abs(thin - explained) <= 2,
    `thin scan found ${thin}, and the sampling fraction predicts ${explained.toFixed(1)}, so the difference is engine behaviour`);
});

test('every set in the registry declares the placement fields the density maths needs', () => {
  // STRUCTURE_SETS is an ARRAY of sets, not a name-keyed object; the engine's Map is the keyed view.
  const engine = createStructureEngine({ seed: 1, blockIds: {}, biomeAt: () => 'plains', surfaceY: () => 70 });
  for (const [name, set] of engine.sets) {
    if (!set) continue;
    const placement = set.placement;
    assert.ok(placement, `${name} has no placement`);
    if (placement.type === 'concentric_rings') {
      // Strongholds are ring-based: they have no spacing at all, so demanding one would be wrong.
      assert.ok(Number.isInteger(placement.distance) && placement.distance > 0, `${name}: bad ring distance`);
      assert.ok(Number.isInteger(placement.count) && placement.count > 0, `${name}: bad ring count`);
      continue;
    }
    assert.equal(placement.type, 'random_spread', `${name}: unexpected placement type ${placement.type}`);
    assert.ok(Number.isInteger(placement.spacing) && placement.spacing > 0, `${name}: bad spacing`);
    assert.ok(Number.isInteger(placement.separation) && placement.separation >= 0, `${name}: bad separation`);
    assert.ok(placement.separation <= placement.spacing,
      `${name}: separation ${placement.separation} exceeds spacing ${placement.spacing}, which would give an empty offset range`);
  }
});
