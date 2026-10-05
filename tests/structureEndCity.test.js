// End city tests.
//
// The two published probabilities are the point: a 50% bridge and a 12.5% ship, with the ship capped at ONE.
// A measured rate that is merely "close" would pass a careless test and be wrong, so the rates are measured
// over many chunks with a tolerance that a doubled or halved probability could not survive.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateEndCity, realizeEndCity, buildEndCityPart, END_CITY_MATERIALS,
  BRIDGE_CHANCE, SHIP_CHANCE, MAX_SHIPS, ROOM_SIZE, ROOM_COUNT_RANGE
} from '../src/worldgen/generators/endCity.js';
import { createStructureEngine, GENERATORS, generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { BLOCKS } from '../src/blocks.js';

const end = { biomeAt: () => 'end_highlands', surfaceY: () => 70 };

test('the end city is registered on the outer End islands', () => {
  assert.ok(generatorCoverage().implemented.includes('end_city'));
  assert.ok(GENERATORS.endCity.realize);
  const engine = createStructureEngine({ seed: 1, dimension: 'the_end', blockIds: BLOCKS, ...end });
  assert.deepEqual(engine.registry.end_city.biomes, ['end_midlands', 'end_highlands']);
});

test('every part is well formed, inside its size, and built only from End materials', () => {
  const allowed = new Set(['minecraft:air', 'minecraft:jigsaw', ...Object.values(END_CITY_MATERIALS)]);
  for (const [kind, options] of [['tower', { rooms: 3 }], ['tower', { rooms: 6 }], ['bridge', { length: 9 }], ['ship', {}]]) {
    const template = new StructureTemplate(buildEndCityPart({ kind, ...options }), kind);
    assert.ok(template.blockCount > 0, kind + ' has no blocks');
    for (const block of template.blocks) {
      const [x, y, z] = block.pos;
      const [sx, sy, sz] = template.size;
      assert.ok(x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz,
        kind + ': block ' + block.pos + ' is outside ' + template.size);
    }
    for (const entry of template.palette) {
      assert.ok(allowed.has(entry.name), kind + ' used ' + entry.name + ', which is not an End material');
    }
  }
  assert.throws(() => buildEndCityPart({ kind: 'not_a_part' }), /unknown end city part/);
});

test('a tower grows with its room count and carries the treasure at the top', () => {
  const small = new StructureTemplate(buildEndCityPart({ kind: 'tower', rooms: 3 }), 'small');
  const large = new StructureTemplate(buildEndCityPart({ kind: 'tower', rooms: 6 }), 'large');
  assert.ok(large.size[1] > small.size[1], 'more rooms must make a taller tower');
  assert.deepEqual(small.size.slice(0, 1), [ROOM_SIZE[0]], 'the footprint is one room wide');
  // The treasure sits in the TOP room, so its Y must rise with the room count.
  const chestY = (template) => template.blocks.filter((block) => block.nbt?.LootTable).map((block) => block.pos[1]);
  const smallChest = Math.max(...chestY(small));
  const largeChest = Math.max(...chestY(large));
  assert.ok(largeChest > smallChest, 'the treasure must climb with the tower');
});

test('the bridge and ship rates match the published probabilities', () => {
  let bridges = 0;
  let ships = 0;
  const total = 800;
  for (let chunkX = 0; chunkX < total; chunkX++) {
    const start = generateEndCity({ seed: 4242, chunkX, chunkZ: 0, context: end });
    if (start.meta.hasBridge) bridges++;
    if (start.meta.hasShip) ships++;
    // AT MOST ONE ship, whatever the rolls fall, on every single chunk.
    assert.equal(start.meta.ships, start.meta.hasShip ? 1 : 0, 'the ship count must match the roll');
    assert.ok(start.meta.ships <= MAX_SHIPS, 'more than one ship was built');
    assert.ok(start.meta.rooms >= ROOM_COUNT_RANGE[0] && start.meta.rooms <= ROOM_COUNT_RANGE[1],
      'room count ' + start.meta.rooms + ' is outside the documented range');
  }
  // A tolerance a doubled or halved probability could not survive.
  const bridgeRate = bridges / total;
  const shipRate = ships / total;
  assert.ok(Math.abs(bridgeRate - BRIDGE_CHANCE) < 0.08,
    'bridge rate ' + bridgeRate.toFixed(3) + ' is not the published ' + BRIDGE_CHANCE);
  assert.ok(Math.abs(shipRate - SHIP_CHANCE) < 0.05,
    'ship rate ' + shipRate.toFixed(3) + ' is not the published ' + SHIP_CHANCE);
});

test('the tower, bridge and ship are separate pieces with their own boxes', () => {
  // Find a chunk that rolled both, so all three pieces are present at once.
  let start = null;
  for (let chunkX = 0; chunkX < 4000 && !start; chunkX++) {
    const candidate = generateEndCity({ seed: 99, chunkX, chunkZ: 0, context: end });
    if (candidate.meta.hasBridge && candidate.meta.hasShip) start = candidate;
  }
  assert.ok(start, 'no chunk rolled both a bridge and a ship in 4000 tries, which cannot be right');
  assert.equal(start.pieces.length, 3);
  assert.deepEqual(start.pieces.map((piece) => piece.meta.params.kind), ['tower', 'bridge', 'ship']);
  // Separate pieces mean separate chunk footprints, which is what keeps realization chunk-safe.
  for (const piece of start.pieces) {
    for (const other of start.pieces) {
      if (piece === other) continue;
      assert.equal(piece.box.intersects(other.box), false,
        piece.meta.params.kind + ' overlaps ' + other.meta.params.kind);
    }
  }
});

test('realization writes the city and keeps the treasure table', () => {
  const start = generateEndCity({ seed: 7, chunkX: 3, chunkZ: 3, context: end });
  const writes = [];
  const report = realizeEndCity(start, (x, y, z, blockId, meta) => { writes.push({ x, y, z, id: blockId, meta }); return true; }, BLOCKS);
  assert.ok(report.written > 150, 'expected a city, wrote ' + report.written);
  assert.deepEqual(report.missingBlocks, [], 'could not resolve: ' + report.missingBlocks);
  assert.ok(report.chests > 0, 'an End city holds treasure');
  for (const loot of report.chestLoot) assert.equal(loot, END_CITY_MATERIALS.loot);
  for (const write of writes) {
    assert.ok(start.pieces.some((piece) => piece.box.contains(write.x, write.y, write.z)),
      'block ' + write.x + ',' + write.y + ',' + write.z + ' is outside every piece box');
  }
});

test('generation is deterministic, and the engine can plan a city', () => {
  const first = generateEndCity({ seed: 31337, chunkX: 3, chunkZ: -3, context: end });
  const again = generateEndCity({ seed: 31337, chunkX: 3, chunkZ: -3, context: end });
  assert.deepEqual(first.pieces.map((piece) => piece.box.toArray()), again.pieces.map((piece) => piece.box.toArray()));
  assert.deepEqual(first.meta, again.meta);

  const engine = createStructureEngine({ seed: 31337, dimension: 'the_end', blockIds: BLOCKS, ...end });
  let plan = null;
  for (let chunkX = 0; chunkX < 4000 && !plan; chunkX++) {
    const candidate = engine.planChunk(chunkX, 0);
    if (candidate && candidate.structureId === 'end_city') plan = candidate;
  }
  assert.ok(plan, 'an End city must be findable through the real placement path');
  let written = 0;
  engine.realize(plan.start, () => { written++; return true; }, { chunkX: plan.start.chunkX, chunkZ: plan.start.chunkZ });
  assert.ok(written > 0, 'the engine must realize the city it planned');
});
