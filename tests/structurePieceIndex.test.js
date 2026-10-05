// Process-independence of piece numbering: the regression test for recorded deviation 0b.
//
// `StructurePiece.index` used to come only from a module-level counter, so a piece's number depended on how
// many pieces had been created earlier in the same process. The igloo and the ocean ruins derive per-piece
// randomness from that number, which made their realization depend on unrelated work done earlier in the
// process -- invisible in a single test run, and fatal to a golden-seed test, which by definition compares
// one process against another.
//
// These tests create a crowd of unrelated pieces first and assert that the plan and its realization are
// bit-for-bit identical either way. That is the property a golden-seed file depends on.
import test from 'node:test';
import assert from 'node:assert/strict';

import { StructurePiece, StructureStart } from '../src/worldgen/start.js';
import { BlockBox } from '../src/worldgen/geometry.js';
import { generateIgloo, realizeIgloo } from '../src/worldgen/generators/igloo.js';
import { generateOceanRuin, realizeOceanRuin } from '../src/worldgen/generators/oceanRuin.js';
import { generateBuriedTreasure, realizeBuriedTreasure } from '../src/worldgen/generators/buriedTreasure.js';
import { generateRuinedPortal, realizeRuinedPortal } from '../src/worldgen/generators/ruinedPortal.js';
import { BLOCKS } from '../src/blocks.js';
import { createStructureEngine } from '../src/worldgen/index.js';

/** Make the process's piece counter advance, without touching the plan under test. */
function createNoise(count) {
  for (let i = 0; i < count; i++) {
    new StructurePiece({ id: `noise/${i}`, type: 'procedural', box: new BlockBox(0, 0, 0, 1, 1, 1) });
  }
}

/** Every block a realization writes, as stable strings, so two runs can be compared exactly. */
function realizeAll(start, realize) {
  const out = [];
  realize(start, (x, y, z, id, meta) => {
    out.push(`${x},${y},${z},${id},${meta?.state?.name ?? ''}`);
    return true;
  }, BLOCKS);
  return out;
}

const snowy = { biomeAt: () => 'snowy_plains', surfaceY: () => 70 };
const ocean = { biomeAt: () => 'ocean', surfaceY: (x, z, map) => (map === 'ocean_floor_wg' ? 42 : 62) };
const desert = { biomeAt: () => 'desert', surfaceY: () => 70 };
const plains = { biomeAt: () => 'plains', surfaceY: () => 70 };

test('a plan-local index is used verbatim, and the counter still works when none is given', () => {
  const explicit = new StructurePiece({ id: 'x', index: 0, box: new BlockBox(0, 0, 0, 0, 0, 0) });
  assert.equal(explicit.index, 0, 'an explicit index must be used as given');
  const second = new StructurePiece({ id: 'y', index: 0, box: new BlockBox(0, 0, 0, 0, 0, 0) });
  assert.equal(second.index, 0, 'two pieces of different plans may share a plan-local index');
  const automatic = new StructurePiece({ id: 'z', box: new BlockBox(0, 0, 0, 0, 0, 0) });
  const nextAutomatic = new StructurePiece({ id: 'w', box: new BlockBox(0, 0, 0, 0, 0, 0) });
  // The property is that the counter ADVANCES, not that it is at any particular value: asserting a specific
  // number would make this test depend on how many pieces the rest of the process created, which is the
  // very coupling it exists to rule out.
  assert.equal(nextAutomatic.index, automatic.index + 1, 'the counter must still advance for callers that do not care');
});

test('the igloo realizes identically before and after a crowd of unrelated pieces', () => {
  const start = generateIgloo({ seed: 4242, chunkX: 6, chunkZ: -6, context: snowy });
  const before = realizeAll(start, realizeIgloo);
  assert.ok(before.length > 40, 'the igloo must write something for this test to mean anything');

  createNoise(137);
  const after = realizeAll(start, realizeIgloo);
  assert.deepEqual(after, before,
    'an igloo derived randomness from a global piece counter, so unrelated work changed its output');

  // The plan's own numbering must be plan-local too.
  assert.deepEqual(start.pieces.map((piece) => piece.index), start.pieces.map((_, index) => index));
});

test('the ocean ruin cluster realizes identically before and after unrelated pieces', () => {
  const start = generateOceanRuin({ seed: 31337, chunkX: 4, chunkZ: 4, context: ocean });
  const before = realizeAll(start, realizeOceanRuin);
  assert.ok(before.length > 0);

  createNoise(91);
  const after = realizeAll(start, realizeOceanRuin);
  assert.deepEqual(after, before, 'a multi-piece cluster must not depend on global piece numbering');
  assert.deepEqual(start.pieces.map((piece) => piece.index), start.pieces.map((_, index) => index));
});

test('single-piece structures are unaffected, which is the control', () => {
  for (const [name, start, realize] of [
    ['buried treasure', generateBuriedTreasure({ seed: 7, chunkX: 3, chunkZ: 3, context: plains }), realizeBuriedTreasure],
    ['ruined portal', generateRuinedPortal({ seed: 7, chunkX: 3, chunkZ: 3, structureId: 'ruined_portal_desert', context: desert }), realizeRuinedPortal]
  ]) {
    const before = realizeAll(start, realize);
    createNoise(53);
    assert.deepEqual(realizeAll(start, realize), before, `${name} must be process-independent`);
  }
});

test('the jigsaw engine numbers its pieces from the plan, not the process', async () => {
  const { TemplatePool, TemplatePoolRegistry, PoolElement, addPieces } = await import('../src/worldgen/jigsaw.js');
  const SPECS = new Map();
  const buildPiece = (element, rotation, mirror, at) => {
    const spec = SPECS.get(element.name);
    const [sx, sy, sz] = spec.size;
    const box = new BlockBox(at.x, at.y, at.z, at.x + sx - 1, at.y + sy - 1, at.z + sz - 1);
    return { box, connectors: spec.connector ? [{ ...spec.connector, position: box.centre() }] : [], connectorPositions: {} };
  };
  const element = (name, connector) => {
    SPECS.set(name, { size: [1, 1, 1], connector });
    return new PoolElement({ name, build: () => ({ connectors: connector ? [connector] : [] }) });
  };

  const run = () => {
    const pools = new TemplatePoolRegistry();
    pools.register(new TemplatePool({ id: 'p', elements: [element('only', null)] }));
    const { pieces } = addPieces({ random: { nextFloat: () => 0.5, nextIntBound: () => 0 }, startPool: pools.resolve('p'), pools, buildPiece, maxDepth: 1 });
    return pieces.map((piece) => piece.index);
  };

  const before = run();
  createNoise(200);
  assert.deepEqual(run(), before, 'jigsaw pieces must be numbered from the plan');
  assert.deepEqual(before, [0]);
});

test('the engine plans the same structure regardless of earlier planning', () => {
  const plan = () => {
    const engine = createStructureEngine({ seed: 909, blockIds: BLOCKS, ...snowy });
    let found = null;
    for (let chunkX = 0; chunkX < 2000 && !found; chunkX++) {
      const candidate = engine.planChunk(chunkX, 0);
      if (candidate && candidate.structureId === 'igloo') found = candidate;
    }
    return { hash: engine.hashStart(found.start), chunks: engine.chunksForStart(found.start).join(',') };
  };
  const before = plan();
  createNoise(321);
  assert.deepEqual(plan(), before, 'a plan hash must not depend on process history, or golden seeds are meaningless');
});
