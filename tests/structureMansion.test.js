// Woodland mansion tests: the rewrite, with deviation 0f's two traps designed out.
//
// The properties asserted are structural rather than decorative: three floors really are built, the rooms
// CONNECT through doorways rather than being sealed cells, exactly one secret room exists and it is on the top
// floor, and every block stays inside the box the plan advertises. Cell counting is done in PIECE-LOCAL
// coordinates, which is the trap that cost the first attempt.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateMansion, realizeMansion, buildMansion, planRooms, floorOfRoom, MANSION_MATERIALS,
  MANSION_FLOORS, MANSION_ROOMS_PER_SIDE, MANSION_ROOM_SIZE, MANSION_ROOM_HEIGHT,
  MANSION_GRID_CELLS, MANSION_INHABITANTS
} from '../src/worldgen/generators/mansion.js';
import { createStructureEngine, GENERATORS, generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { BLOCKS } from '../src/blocks.js';

const forest = { biomeAt: () => 'dark_forest', surfaceY: () => 70 };
const WIDTH = MANSION_ROOMS_PER_SIDE * MANSION_ROOM_SIZE;

test('the mansion is registered in the dark forest only, and the Pale Garden is excluded', () => {
  assert.ok(generatorCoverage().implemented.includes('mansion'));
  assert.ok(GENERATORS.mansion.realize);
  const engine = createStructureEngine({ seed: 1, blockIds: BLOCKS, ...forest });
  assert.deepEqual(engine.registry.mansion.biomes, ['dark_forest'], 'Pale Garden mansions are post-1.21.4');
  assert.equal(engine.registry.mansion.family, 'template');
});

test('the plan is well formed, built only from mansion materials, and has three floors', () => {
  const built = buildMansion({ seed: 5 });
  const template = new StructureTemplate(built, 'mansion');
  const allowed = new Set(['minecraft:air', 'minecraft:jigsaw', ...Object.values(MANSION_MATERIALS)]);
  assert.deepEqual(template.size, [WIDTH, MANSION_FLOORS * MANSION_ROOM_HEIGHT + 1, WIDTH]);
  assert.ok(template.blockCount > 2000, 'expected a mansion-sized plan, got ' + template.blockCount);
  for (const block of template.blocks) {
    const [x, y, z] = block.pos;
    const [sx, sy, sz] = template.size;
    assert.ok(x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz,
      'block ' + block.pos + ' is outside ' + template.size);
  }
  for (const entry of template.palette) {
    assert.ok(allowed.has(entry.name), 'used ' + entry.name + ', which is not a mansion material');
  }
  // A slab must exist at the base of EVERY floor, not only the ground one.
  for (let floor = 0; floor < MANSION_FLOORS; floor++) {
    const y = floor * MANSION_ROOM_HEIGHT;
    const atFloor = template.blocks.filter((block) => block.pos[1] === y);
    assert.ok(atFloor.length >= WIDTH * WIDTH, 'floor ' + floor + ' has no slab at y=' + y);
  }
});

test('the rooms CONNECT through doorways rather than being sealed cells', () => {
  const template = new StructureTemplate(buildMansion({ seed: 5 }), 'mansion');
  const wallX = MANSION_ROOM_SIZE;
  const gaps = [];
  for (let z = 0; z < MANSION_ROOM_SIZE; z++) {
    const filled = template.blocks.some((block) => block.pos[0] === wallX && block.pos[2] === z && block.pos[1] >= 1 && block.pos[1] <= 2);
    if (!filled) gaps.push(z);
  }
  const mid = Math.floor(MANSION_ROOM_SIZE / 2);
  assert.ok(gaps.length > 0, 'the wall between two rooms has no doorway at all');
  assert.ok(gaps.includes(mid) || gaps.includes(mid + 1), 'the doorway is not at the middle of the wall: ' + gaps.join(','));
});

test('exactly one secret room exists, on the top floor, with its diamond on that floor', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const built = buildMansion({ seed });
    const types = built.meta.roomTypes;
    assert.equal(types.filter((type) => type === 'secret').length, 1, 'the secret room must be unique');
    const secretIndex = types.indexOf('secret');
    // DERIVED, not assumed: the rewrite records that the first attempt asserted a hardcoded height and could
    // not explain the failure, so the floor comes from the index instead.
    assert.equal(floorOfRoom(secretIndex), MANSION_FLOORS - 1, 'the secret room must be on the top floor');
    const template = new StructureTemplate(built, 'mansion');
    const nameOf = (block) => template.palette[block.state].name;
    const diamonds = template.blocks.filter((block) => nameOf(block) === MANSION_MATERIALS.diamond);
    assert.equal(diamonds.length, 1, 'exactly one diamond block');
    const floorBase = floorOfRoom(secretIndex) * MANSION_ROOM_HEIGHT;
    assert.ok(diamonds[0].pos[1] >= floorBase && diamonds[0].pos[1] < floorBase + MANSION_ROOM_HEIGHT,
      'the diamond at y=' + diamonds[0].pos[1] + ' is not on the secret room floor starting at ' + floorBase);
    const obsidian = template.blocks.filter((block) => nameOf(block) === MANSION_MATERIALS.obsidian);
    assert.ok(obsidian.length > 4, 'the secret room must be lined with obsidian');
  }
  for (const seed of [7, 8, 9, 10]) {
    assert.equal(planRooms(seed).filter((type) => type === 'secret').length, 1);
  }
});

test('realization writes every grid cell, keeps the loot, and places the inhabitants', () => {
  const start = generateMansion({ seed: 77, chunkX: 2, chunkZ: 2, context: forest });
  const writes = [];
  const spawned = [];
  const report = realizeMansion(start, (x, y, z, blockId, meta) => { writes.push({ x, y, z, id: blockId, meta }); return true; }, BLOCKS, {
    spawnMob: (type) => { spawned.push(type); return true; }
  });
  assert.ok(report.written > 2000, 'expected a mansion, wrote ' + report.written);
  assert.deepEqual(report.missingBlocks, [], 'could not resolve: ' + report.missingBlocks);
  assert.ok(report.chests > 0, 'a mansion holds loot');
  for (const loot of report.chestLoot) assert.equal(loot, MANSION_MATERIALS.loot);
  assert.deepEqual(spawned.sort(), [...MANSION_INHABITANTS].sort());
  // Every cell of every floor must have been written to, counted in PIECE-LOCAL coordinates.
  assert.equal(report.cells.size, MANSION_GRID_CELLS * (MANSION_FLOORS + 1), 'cells built (including the roof row): ' + [...report.cells].sort().join(' | '));
  for (const write of writes) {
    assert.ok(start.pieces.some((piece) => piece.box.contains(write.x, write.y, write.z)),
      'block ' + write.x + ',' + write.y + ',' + write.z + ' is outside the piece box');
  }
  assert.match(report.note, /marker pair/);

  const again = generateMansion({ seed: 77, chunkX: 2, chunkZ: 2, context: forest });
  assert.deepEqual(again.meta.roomTypes, start.meta.roomTypes);
  assert.deepEqual(again.pieces[0].box.toArray(), start.pieces[0].box.toArray());

  const engine = createStructureEngine({ seed: 31337, blockIds: BLOCKS, ...forest });
  // Use the engine's LOCATE rather than scanning one z row: a sparse set sampled on a single row measures the
  // sampler, not the placement, which is the artefact that once made the jungle ruined portal look unreachable.
  const located = engine.locate('mansion', 0, 0, { maxRadiusChunks: 4096 });
  assert.ok(located && located.start, 'a mansion must be findable through the real locate path');
  let written = 0;
  engine.realize(located.start, () => { written++; return true; }, { chunkX: located.start.chunkX, chunkZ: located.start.chunkZ });
  assert.ok(written > 0, 'the engine must realize the mansion it planned');
});
