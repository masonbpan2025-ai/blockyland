// Trail ruins tests.
//
// This is the last blocked id, and its defining property is that it is a TRAIL: a run of path pieces that chain
// end to end with ruins alongside. So the assertions that matter are the chaining, the buried placement, and
// the archaeology blocks -- a trail ruin whose reward is only a chest would have lost half of itself.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateTrailRuins, realizeTrailRuins, buildTrailPart, TRAIL_MATERIALS,
  TRAIL_DEPTH, TRAIL_MAX_DEPTH, PATH_SLOT, RUIN_SLOT
} from '../src/worldgen/generators/trailRuins.js';
import { createStructureEngine, GENERATORS, generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { BLOCKS } from '../src/blocks.js';

const PARTS = ['entrance', 'path', 'path_corner', 'ruin_small', 'ruin_large', 'camp'];
const taiga = { biomeAt: () => 'taiga', surfaceY: () => 70 };

test('the trail ruins are registered in the taiga family, underground, and bury themselves', () => {
  assert.ok(generatorCoverage().implemented.includes('trail_ruins'));
  assert.ok(GENERATORS.trailRuins.realize);
  const engine = createStructureEngine({ seed: 1, blockIds: BLOCKS, ...taiga });
  const entry = engine.registry.trail_ruins;
  assert.equal(entry.step, 'underground_structures');
  assert.equal(entry.terrainAdaptation, 'bury', 'the trail is covered over again, not left open');
  assert.ok(entry.biomes.includes('taiga'));
  assert.ok(entry.biomes.includes('jungle'), 'the jungle family is part of the gate');
});

test('every part is well formed, inside its size, and built only from trail materials', () => {
  const allowed = new Set(['minecraft:air', 'minecraft:jigsaw', ...Object.values(TRAIL_MATERIALS)]);
  for (const kind of PARTS) {
    const template = new StructureTemplate(buildTrailPart(kind), 'trail/' + kind);
    assert.ok(template.blockCount > 0, kind + ' has no blocks');
    for (const block of template.blocks) {
      const [x, y, z] = block.pos;
      const [sx, sy, sz] = template.size;
      assert.ok(x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz,
        kind + ': block ' + block.pos + ' is outside ' + template.size);
    }
    for (const entry of template.palette) {
      assert.ok(allowed.has(entry.name), kind + ' used ' + entry.name + ', which is not a trail material');
    }
    assert.ok(template.jigsaws().length > 0, kind + ' offers no connector');
  }
  assert.throws(() => buildTrailPart('not_a_part'), /unknown trail ruins part/);
});

test('a path chains at both ends, and a ruin closes its chain', () => {
  const path = new StructureTemplate(buildTrailPart('path'), 'path');
  const slots = path.jigsaws().map((jigsaw) => jigsaw.name);
  // Two connectors share the path slot's name, which is the multi-connector case deviation 0e fixed.
  assert.equal(slots.filter((name) => name === PATH_SLOT).length, 2, 'the path slot must be at both ends');
  assert.equal(slots.filter((name) => name === RUIN_SLOT).length, 1, 'and a ruin slot alongside');
  // A ruin offers no path slot, so it ends its branch.
  const ruin = new StructureTemplate(buildTrailPart('ruin_small'), 'ruin');
  assert.equal(ruin.jigsaws().some((jigsaw) => jigsaw.pool === 'trail/paths'), false);
});

test('the trail is BURIED, chains several links deep, and its pieces never overlap', () => {
  const start = generateTrailRuins({ seed: 4242, chunkX: 0, chunkZ: 0, context: taiga });
  assert.ok(start.pieces.length > 2, 'expected a trail, got ' + start.pieces.length + ' pieces');
  assert.equal(start.meta.connected, true, 'every piece must be reachable from the entrance');
  assert.equal(start.pieces[0].meta.element, 'entrance');
  assert.ok(start.meta.maxDepth >= 1, 'expected the trail to run');
  assert.ok(start.meta.maxDepth <= TRAIL_MAX_DEPTH, 'depth exceeded the cap');
  // Buried: the origin sits below the surface the context reported, which is what `bury` then covers.
  assert.equal(start.meta.y, taiga.surfaceY() - TRAIL_DEPTH);
  assert.ok(start.meta.y < taiga.surfaceY(), 'the trail must sit under the ground');
  // A trail should RUN: its path pieces must outnumber nothing, and the mix must contain a ruin too.
  assert.ok(start.meta.partMix.some((part) => part === 'path' || part === 'path_corner'), 'the trail must have path pieces');
  assert.ok(start.meta.partMix.some((part) => part === 'ruin_small' || part === 'ruin_large' || part === 'camp'), 'and ruins alongside');
  for (const piece of start.pieces) {
    for (const other of start.pieces) {
      if (piece === other) continue;
      assert.equal(piece.box.intersects(other.box), false, piece.meta.element + ' overlaps ' + other.meta.element);
    }
  }
});

test('realization writes the trail and reports its archaeology as well as its chests', () => {
  const start = generateTrailRuins({ seed: 77, chunkX: 2, chunkZ: 2, context: taiga });
  const writes = [];
  const report = realizeTrailRuins(start, (x, y, z, blockId, meta) => { writes.push({ x, y, z, id: blockId, meta }); return true; }, BLOCKS);
  assert.ok(report.written > 150, 'expected a trail, wrote ' + report.written);
  assert.deepEqual(report.missingBlocks, [], 'could not resolve: ' + report.missingBlocks);
  // The archaeology is the half of the reward that is not a chest.
  assert.ok(report.archaeology.length > 0, 'a trail ruin must carry suspicious blocks');
  for (const entry of report.archaeology) {
    assert.match(entry.block, /suspicious/);
    assert.match(entry.lootTable, /archaeology|trail_ruins/, 'an archaeology block must carry a loot table');
  }
  assert.ok(report.chests > 0, 'and a chest');
  for (const write of writes) {
    assert.ok(start.pieces.some((piece) => piece.box.contains(write.x, write.y, write.z)),
      'block ' + write.x + ',' + write.y + ',' + write.z + ' is outside every piece box');
  }
});

test('generation is deterministic, and the engine can plan a trail', () => {
  const first = generateTrailRuins({ seed: 31337, chunkX: 3, chunkZ: -3, context: taiga });
  const again = generateTrailRuins({ seed: 31337, chunkX: 3, chunkZ: -3, context: taiga });
  assert.deepEqual(first.pieces.map((piece) => piece.box.toArray()), again.pieces.map((piece) => piece.box.toArray()));
  assert.deepEqual(first.meta.partMix, again.meta.partMix);

  const engine = createStructureEngine({ seed: 31337, blockIds: BLOCKS, ...taiga });
  const located = engine.locate('trail_ruins', 0, 0, { maxRadiusChunks: 4096 });
  assert.ok(located && located.start, 'a trail must be findable through the real locate path');
  let written = 0;
  engine.realize(located.start, () => { written++; return true; }, { chunkX: located.start.chunkX, chunkZ: located.start.chunkZ });
  assert.ok(written > 0, 'the engine must realize the trail it located');
});
