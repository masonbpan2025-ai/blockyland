// Bastion remnant tests.
//
// The property worth pinning here is the one that looks like a bug: a bastion FLOATS over the lava sea by
// design (MC-179796) and therefore carries NO terrain adaptation. A future contributor "fixing" the floating
// bastion would be introducing a deviation, so the test asserts the intentional behaviour and says why.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateBastion, realizeBastion, buildBastionPart, BASTION_MATERIALS, BASTION_Y_RANGE,
  BASTION_MAX_DEPTH, WALKWAY_SLOT, SEGMENT_SLOT
} from '../src/worldgen/generators/bastion.js';
import { createStructureEngine, GENERATORS, generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { BLOCKS } from '../src/blocks.js';

const PARTS = ['bridge', 'walkway', 'housing', 'stable', 'treasure', 'rampart'];
const nether = { biomeAt: () => 'nether_wastes', surfaceY: () => 32 };

test('the bastion is registered in the nether, and deliberately does NOT adapt to terrain', () => {
  assert.ok(generatorCoverage().implemented.includes('bastion_remnant'));
  assert.ok(GENERATORS.bastion.realize);
  const engine = createStructureEngine({ seed: 1, dimension: 'nether', blockIds: BLOCKS, ...nether });
  const entry = engine.registry.bastion_remnant;
  assert.equal(entry.dimension, 'nether');
  assert.equal(entry.family, 'jigsaw');
  // It floats over the lava sea by design, so bedding it into terrain would be the deviation.
  assert.ok(entry.terrainAdaptation === undefined || entry.terrainAdaptation === 'none',
    'a bastion must not be bedded into the ground');
});

test('every part is well formed, inside its size, and uses bastion materials', () => {
  const allowed = new Set(['minecraft:air', 'minecraft:jigsaw', 'minecraft:chest', ...Object.values(BASTION_MATERIALS)]);
  for (const kind of PARTS) {
    const template = new StructureTemplate(buildBastionPart(kind), 'bastion/' + kind);
    assert.ok(template.blockCount > 0, kind + ' has no blocks');
    for (const block of template.blocks) {
      const [x, y, z] = block.pos;
      const [sx, sy, sz] = template.size;
      assert.ok(x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz,
        kind + ': block ' + block.pos + ' is outside ' + template.size);
    }
    for (const entry of template.palette) {
      assert.ok(allowed.has(entry.name), kind + ' used ' + entry.name + ', which is not a bastion material');
    }
    assert.ok(template.jigsaws().length > 0, kind + ' offers no connector');
  }
  assert.throws(() => buildBastionPart('not_a_part'), /unknown bastion part/);
});

test('the bridge chains both ways and offers a segment slot on each side', () => {
  const bridge = new StructureTemplate(buildBastionPart('bridge'), 'bridge');
  const names = bridge.jigsaws().map((jigsaw) => jigsaw.name);
  assert.equal(names.filter((name) => name === WALKWAY_SLOT).length, 2, 'the walkway slot must be at both ends');
  assert.equal(names.filter((name) => name === SEGMENT_SLOT).length, 2, 'and a segment slot on each side');
  // A rampart closes the chain: it offers no further walkway slot.
  const rampart = new StructureTemplate(buildBastionPart('rampart'), 'rampart');
  assert.equal(rampart.jigsaws().some((jigsaw) => jigsaw.pool === 'bastion/walkways'), false);
});

test('a bastion grows several levels deep, connected, with no overlapping pieces', () => {
  const start = generateBastion({ seed: 4242, chunkX: 0, chunkZ: 0, context: nether });
  assert.ok(start.pieces.length > 2, 'expected a bastion, got ' + start.pieces.length + ' pieces');
  assert.equal(start.meta.connected, true, 'every piece must be reachable from the bridge');
  assert.equal(start.pieces[0].meta.element, 'bridge', 'the bridge is the root');
  assert.ok(start.meta.maxDepth >= 1, 'expected chaining through the walkways');
  assert.ok(start.meta.maxDepth <= BASTION_MAX_DEPTH, 'depth exceeded the cap');
  // It floats: its Y is the random band, not the terrain height the context reported (32).
  assert.ok(start.meta.y >= BASTION_Y_RANGE[0] && start.meta.y <= BASTION_Y_RANGE[1]);
  assert.ok(start.meta.y > nether.surfaceY(), 'a bastion must float above the nether floor');
  for (const piece of start.pieces) {
    for (const other of start.pieces) {
      if (piece === other) continue;
      assert.equal(piece.box.intersects(other.box), false, piece.meta.element + ' overlaps ' + other.meta.element);
    }
  }
});

test('realization writes the bastion, resolving its materials and keeping its loot', () => {
  const start = generateBastion({ seed: 77, chunkX: 2, chunkZ: 2, context: nether });
  const writes = [];
  const report = realizeBastion(start, (x, y, z, blockId, meta) => { writes.push({ x, y, z, id: blockId, meta }); return true; }, BLOCKS);
  assert.ok(report.written > 100, 'expected a bastion, wrote ' + report.written);
  assert.deepEqual(report.missingBlocks, [], 'could not resolve: ' + report.missingBlocks);
  assert.ok(writes.every((write) => typeof write.id === 'number'));
  for (const write of writes) {
    assert.ok(start.pieces.some((piece) => piece.box.contains(write.x, write.y, write.z)),
      'block ' + write.x + ',' + write.y + ',' + write.z + ' is outside every piece box');
  }
  // Any chest must carry a bastion loot table, since a chest with no table is decoration.
  for (const loot of report.chestLoot) assert.match(loot, /bastion/);
});

test('generation is deterministic, and the engine can plan a bastion', () => {
  const first = generateBastion({ seed: 31337, chunkX: 3, chunkZ: -3, context: nether });
  const again = generateBastion({ seed: 31337, chunkX: 3, chunkZ: -3, context: nether });
  assert.deepEqual(first.pieces.map((piece) => piece.box.toArray()), again.pieces.map((piece) => piece.box.toArray()));
  assert.deepEqual(first.meta.partMix, again.meta.partMix);
  assert.equal(first.meta.y, again.meta.y);

  const engine = createStructureEngine({ seed: 31337, dimension: 'nether', blockIds: BLOCKS, ...nether });
  let plan = null;
  for (let chunkX = 0; chunkX < 3000 && !plan; chunkX++) {
    const candidate = engine.planChunk(chunkX, 0);
    if (candidate && candidate.structureId === 'bastion_remnant') plan = candidate;
  }
  assert.ok(plan, 'a bastion must be findable through the real placement path');
  let written = 0;
  engine.realize(plan.start, () => { written++; return true; }, { chunkX: plan.start.chunkX, chunkZ: plan.start.chunkZ });
  assert.ok(written > 0, 'the engine must realize the bastion it planned');
});
