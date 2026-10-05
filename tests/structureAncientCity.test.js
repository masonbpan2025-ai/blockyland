// Ancient city tests.
//
// Two properties are specific to this structure and worth pinning: its floor is at a PUBLISHED height
// (Y = -51) rather than a band, and it carries sculk sensors and shriekers -- blocks with BEHAVIOUR, not
// decoration -- alongside two distinct chest loot tables.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateAncientCity, realizeAncientCity, buildAncientPart, ANCIENT_MATERIALS,
  ANCIENT_CITY_FLOOR_Y, CITY_SLOT, ROOM_SLOT
} from '../src/worldgen/generators/ancientCity.js';
import { createStructureEngine, GENERATORS, generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { BLOCKS } from '../src/blocks.js';

const PARTS = ['entrance', 'road', 'road_corner', 'temple', 'ice_box', 'ruin'];
const deepDark = { biomeAt: () => 'deep_dark', surfaceY: () => 60 };

test('the ancient city is registered in the deep dark only, underground, and beard_box adapted', () => {
  assert.ok(generatorCoverage().implemented.includes('ancient_city'));
  assert.ok(GENERATORS.ancientCity.realize);
  const engine = createStructureEngine({ seed: 1, blockIds: BLOCKS, ...deepDark });
  const entry = engine.registry.ancient_city;
  assert.deepEqual(entry.biomes, ['deep_dark'], 'the deep dark is the only place an ancient city generates');
  assert.equal(entry.step, 'underground_structures');
  assert.equal(entry.terrainAdaptation, 'beard_box');
});

test('every part is well formed, inside its size, and built only from ancient city materials', () => {
  const allowed = new Set(['minecraft:air', 'minecraft:jigsaw', ...Object.values(ANCIENT_MATERIALS)]);
  for (const kind of PARTS) {
    const template = new StructureTemplate(buildAncientPart(kind), 'ancient/' + kind);
    assert.ok(template.blockCount > 0, kind + ' has no blocks');
    for (const block of template.blocks) {
      const [x, y, z] = block.pos;
      const [sx, sy, sz] = template.size;
      assert.ok(x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz,
        kind + ': block ' + block.pos + ' is outside ' + template.size);
    }
    for (const entry of template.palette) {
      assert.ok(allowed.has(entry.name), kind + ' used ' + entry.name + ', which is not an ancient city material');
    }
    assert.ok(template.jigsaws().length > 0, kind + ' offers no connector');
  }
  assert.throws(() => buildAncientPart('not_a_part'), /unknown ancient city part/);
});

test('the entrance chains along its road and offers a room on each side', () => {
  const entrance = new StructureTemplate(buildAncientPart('entrance'), 'entrance');
  const names = entrance.jigsaws().map((jigsaw) => jigsaw.name);
  assert.equal(names.filter((name) => name === CITY_SLOT).length, 2, 'the road slot must be at both ends');
  assert.equal(names.filter((name) => name === ROOM_SLOT).length, 2, 'and a room slot on each side');
  // A temple closes its chain: it offers no further road slot.
  const temple = new StructureTemplate(buildAncientPart('temple'), 'temple');
  assert.equal(temple.jigsaws().some((jigsaw) => jigsaw.pool === 'ancient_city/roads'), false);
});

test('the whole city sits on the PUBLISHED floor height, not a band', () => {
  const start = generateAncientCity({ seed: 4242, chunkX: 0, chunkZ: 0, context: deepDark });
  assert.ok(start.pieces.length > 2, 'expected a city, got ' + start.pieces.length + ' pieces');
  assert.equal(start.meta.connected, true, 'every piece must be reachable from the entrance');
  assert.equal(start.pieces[0].meta.element, 'entrance');
  // Published: the floor is always at Y = -51, and every piece's floor is on that plane.
  assert.equal(start.meta.floorY, ANCIENT_CITY_FLOOR_Y);
  assert.equal(ANCIENT_CITY_FLOOR_Y, -51);
  for (const piece of start.pieces) {
    assert.equal(piece.box.minY, ANCIENT_CITY_FLOOR_Y, piece.meta.element + ' is not on the -51 floor');
  }
  assert.ok(start.meta.floorY < deepDark.surfaceY(), 'the city must be far below the surface');
  for (const piece of start.pieces) {
    for (const other of start.pieces) {
      if (piece === other) continue;
      assert.equal(piece.box.intersects(other.box), false, piece.meta.element + ' overlaps ' + other.meta.element);
    }
  }
});

test('realization places the sculk warning system and both chest loot tables', () => {
  const start = generateAncientCity({ seed: 77, chunkX: 2, chunkZ: 2, context: deepDark });
  const writes = [];
  const report = realizeAncientCity(start, (x, y, z, blockId, meta) => { writes.push({ x, y, z, id: blockId, meta }); return true; }, BLOCKS);
  assert.ok(report.written > 300, 'expected a city, wrote ' + report.written);
  assert.deepEqual(report.missingBlocks, [], 'could not resolve: ' + report.missingBlocks);
  // Sensors and shriekers are blocks WITH BEHAVIOUR: a city without them is deepslate rooms, not an ancient city.
  assert.ok(report.sensors > 0, 'expected sculk sensors');
  assert.ok(report.shriekers > 0, 'expected sculk shriekers');
  assert.ok(report.chests > 0, 'expected chests');
  // The ice box has its own table, which is the one chest worth distinguishing.
  assert.ok(report.chestLoot.every((loot) => /ancient_city/.test(loot)), 'unexpected loot: ' + report.chestLoot.join(', '));
  for (const write of writes) {
    assert.ok(start.pieces.some((piece) => piece.box.contains(write.x, write.y, write.z)),
      'block ' + write.x + ',' + write.y + ',' + write.z + ' is outside every piece box');
  }
  assert.match(report.note, /no warden is placed/);
});

test('generation is deterministic, and the engine can plan an ancient city', () => {
  const first = generateAncientCity({ seed: 31337, chunkX: 3, chunkZ: -3, context: deepDark });
  const again = generateAncientCity({ seed: 31337, chunkX: 3, chunkZ: -3, context: deepDark });
  assert.deepEqual(first.pieces.map((piece) => piece.box.toArray()), again.pieces.map((piece) => piece.box.toArray()));
  assert.deepEqual(first.meta.partMix, again.meta.partMix);

  const engine = createStructureEngine({ seed: 31337, blockIds: BLOCKS, ...deepDark });
  let plan = null;
  for (let chunkX = 0; chunkX < 4000 && !plan; chunkX++) {
    const candidate = engine.planChunk(chunkX, 0);
    if (candidate && candidate.structureId === 'ancient_city') plan = candidate;
  }
  assert.ok(plan, 'an ancient city must be findable through the real placement path');
  let written = 0;
  engine.realize(plan.start, () => { written++; return true; }, { chunkX: plan.start.chunkX, chunkZ: plan.start.chunkZ });
  assert.ok(written > 0, 'the engine must realize the city it planned');
});
