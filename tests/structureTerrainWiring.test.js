// Terrain-adaptation wiring: does the engine actually bed a structure into the ground?
//
// The module's own tests prove the geometry; these prove the ENGINE calls it, which is the part that was
// missing and that kept the `Terr` column at "no" for every structure.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createStructureEngine, GENERATORS } from '../src/worldgen/index.js';
import { generateDesertPyramid } from '../src/worldgen/generators/desertPyramid.js';
import { generateSwampHut } from '../src/worldgen/generators/swampHut.js';
import { createBlockIdResolver } from '../src/worldgen/blockIds.js';
import { BLOCKS } from '../src/blocks.js';
import { TerrainAdaptation } from '../src/worldgen/start.js';

const resolver = createBlockIdResolver(BLOCKS);
const SANDSTONE = resolver.resolve('minecraft:sandstone');
const AIR = resolver.resolve('minecraft:air');

/** A surface that rises one block per x, so every piece box straddles a slope. */
const slope = (x) => 64 + ((x % 5) + 5) % 5;

function collect(engine, start, options) {
  const writes = [];
  const report = engine.realizeWithReport(start, (x, y, z, id, meta) => {
    writes.push({ x, y, z, id, meta });
    return true;
  }, { chunkX: start.chunkX, chunkZ: start.chunkZ, ...options });
  return { writes, report };
}

test('the registry now marks the surface structures that vanilla adapts', () => {
  const engine = createStructureEngine({ seed: 1, blockIds: BLOCKS, biomeAt: () => 'desert', surfaceY: () => 70 });
  // `beard_thin` is what the wiki gives the desert pyramid and the swamp hut, and it is now data rather than
  // a note in a document.
  assert.equal(engine.registry.desert_pyramid.terrainAdaptation, 'beard_thin');
  assert.equal(engine.registry.swamp_hut.terrainAdaptation, 'beard_thin');
  assert.equal(TerrainAdaptation.inflate('beard_thin'), 12, 'the box inflation rule is unchanged');
});

test('without terrain the behaviour is exactly as before, so old callers are unaffected', () => {
  const engine = createStructureEngine({ seed: 5, blockIds: BLOCKS, biomeAt: () => 'desert', surfaceY: slope });
  const start = generateDesertPyramid({ seed: 5, chunkX: 2, chunkZ: 2, context: { biomeAt: () => 'desert', surfaceY: () => 70 } });

  const bare = collect(engine, start, {});
  assert.equal(bare.report.adaptation.applied, false, 'no surfaceY means no adaptation');
  assert.equal(bare.report.adaptation.type, 'beard_thin', 'but the type is still reported');
  assert.equal(bare.writes.some((write) => write.meta?.terrainAdaptation), false);

  // The same realization with adaptation explicitly disabled must be byte-identical to the bare one.
  const disabled = collect(engine, start, { surfaceY: slope, foundationBlock: SANDSTONE, airBlock: AIR, adapt: false });
  assert.deepEqual(disabled.writes, bare.writes, 'adapt:false must reproduce the old behaviour exactly');
});

test('a sloped site gets foundation under the structure and shaving beside it', () => {
  const engine = createStructureEngine({ seed: 5, blockIds: BLOCKS, biomeAt: () => 'desert', surfaceY: slope });
  const start = generateDesertPyramid({ seed: 5, chunkX: 2, chunkZ: 2, context: { biomeAt: () => 'desert', surfaceY: () => 70 } });

  const { writes, report } = collect(engine, start, { surfaceY: slope, foundationBlock: SANDSTONE, airBlock: AIR });
  assert.equal(report.adaptation.applied, true);
  assert.ok(report.adaptation.total > 0, 'a slope must produce adaptation writes');

  const adaptationWrites = writes.filter((write) => write.meta?.terrainAdaptation);
  assert.ok(adaptationWrites.length > 0);
  for (const write of adaptationWrites) assert.equal(write.meta.terrainAdaptation, 'beard_thin');
  // Both directions must appear: the pyramid is 21 blocks wide, so the slope crosses its whole footprint.
  assert.ok(report.adaptation.counts.shaved > 0, `expected shaving, got ${JSON.stringify(report.adaptation.counts)}`);
  assert.ok(report.adaptation.counts.foundation > 0, `expected foundation, got ${JSON.stringify(report.adaptation.counts)}`);
});

test('terrain never overwrites the structure it is adapting around', () => {
  const engine = createStructureEngine({ seed: 9, blockIds: BLOCKS, biomeAt: () => 'swamp', surfaceY: slope });
  const start = generateSwampHut({ seed: 9, chunkX: 3, chunkZ: 3, context: { biomeAt: () => 'swamp', surfaceY: () => 68 } });

  const { writes, report } = collect(engine, start, { surfaceY: slope, foundationBlock: SANDSTONE, airBlock: AIR });
  assert.equal(report.adaptation.applied, true);
  const structureAt = new Set(writes.filter((write) => !write.meta?.terrainAdaptation).map((write) => `${write.x},${write.y},${write.z}`));
  for (const write of writes.filter((entry) => entry.meta?.terrainAdaptation)) {
    assert.equal(structureAt.has(`${write.x},${write.y},${write.z}`), false,
      `terrain adaptation wrote over the structure at ${write.x},${write.y},${write.z}`);
  }
  // And the hut is still all there.
  assert.ok(structureAt.size > 50, `expected a hut's worth of blocks, got ${structureAt.size}`);
});

test('an explicit adaptation overrides the registry, and none disables it', () => {
  const engine = createStructureEngine({ seed: 3, blockIds: BLOCKS, biomeAt: () => 'swamp', surfaceY: slope });
  const start = generateSwampHut({ seed: 3, chunkX: 1, chunkZ: 1, context: { biomeAt: () => 'swamp', surfaceY: () => 68 } });

  const buried = collect(engine, start, { surfaceY: () => 80, foundationBlock: SANDSTONE, adaptation: 'bury' });
  assert.equal(buried.report.adaptation.type, 'bury');
  assert.ok(buried.report.adaptation.counts.buried > 0, 'bury must fill above the structure');

  const none = collect(engine, start, { surfaceY: slope, foundationBlock: SANDSTONE, adaptation: 'none' });
  assert.equal(none.report.adaptation.applied, false, 'an explicit none must disable adaptation');
  assert.equal(none.writes.some((write) => write.meta?.terrainAdaptation), false);
});

test('adaptation writes are clipped to the requested chunk like everything else', () => {
  const engine = createStructureEngine({ seed: 5, blockIds: BLOCKS, biomeAt: () => 'desert', surfaceY: slope });
  const start = generateDesertPyramid({ seed: 5, chunkX: 2, chunkZ: 2, context: { biomeAt: () => 'desert', surfaceY: () => 70 } });
  // Realize a chunk the pyramid does not touch: nothing at all, terrain included.
  const far = collect(engine, start, { chunkX: 40, chunkZ: 40, surfaceY: slope, foundationBlock: SANDSTONE, airBlock: AIR });
  assert.equal(far.writes.length, 0, 'a far chunk must receive neither structure nor adaptation');

  const own = collect(engine, start, { surfaceY: slope, foundationBlock: SANDSTONE, airBlock: AIR });
  assert.ok(own.writes.length > 0);
});

test('the report shape is stable for a plain, non-adapting structure', () => {
  // Buried treasure is gated to beaches, so a plains-only test would never find one.
  const engine = createStructureEngine({ seed: 2, blockIds: BLOCKS, biomeAt: () => 'beach', surfaceY: () => 70 });
  // Buried treasure is `none`, so the report must still be well formed.
  let start = null;
  for (let chunkX = 0; chunkX < 4000 && !start; chunkX++) {
    const plan = engine.planChunk(chunkX, 0);
    if (plan && plan.structureId === 'buried_treasure') start = plan.start;
  }
  assert.ok(start, 'expected a buried treasure within 4000 chunks');
  const { report } = collect(engine, start, { surfaceY: slope, foundationBlock: SANDSTONE });
  assert.equal(report.adaptation.type, 'none');
  assert.equal(report.adaptation.applied, false);
  assert.equal(typeof report.written, 'number');
  assert.ok(GENERATORS.buriedTreasure.realize);
});
