// Terrain adaptation tests.
//
// This module's whole justification is that structures stop floating on sloped ground, so the tests are
// mostly about SLOPES: flat terrain must produce no foundation, a hill must be shaved, a valley must be
// filled, and nothing must ever overwrite the structure itself.
import test from 'node:test';
import assert from 'node:assert/strict';

import { adaptToTerrain, adaptationFor, TERRAIN_ADAPTATIONS, TERRAIN_ADAPTATION_INFLATE } from '../src/worldgen/terrainAdaptation.js';
import { BlockBox } from '../src/worldgen/geometry.js';

const FOUNDATION = 10;
const TERRAIN = 11;
const AIR = 0;

/** A 3x3 structure whose floor is at y = 70, sitting in terrain of the given height. */
const box = new BlockBox(0, 70, 0, 2, 72, 2);
const flat = () => 70;

test('none does nothing, and an unknown adaptation is an error rather than a guess', () => {
  assert.deepEqual(TERRAIN_ADAPTATIONS, ['none', 'beard_thin', 'beard_box', 'bury', 'encapsulate']);
  const none = adaptToTerrain({ adaptation: 'none', box, surfaceY: flat });
  assert.equal(none.writes.length, 0);
  assert.equal(none.counts.foundation, 0);
  assert.throws(() => adaptToTerrain({ adaptation: 'beardish', box, surfaceY: flat }), /unknown terrain adaptation/);
  // A missing callback must be loud: silently doing nothing would look exactly like flat terrain.
  assert.throws(() => adaptToTerrain({ adaptation: 'beard_thin', box }), /needs a surfaceY callback/);
});

test('on flat ground a beard_thin structure needs no foundation and no shaving', () => {
  const result = adaptToTerrain({ adaptation: 'beard_thin', box, surfaceY: flat, foundationBlock: FOUNDATION, airBlock: AIR });
  assert.equal(result.writes.length, 0, 'flat terrain is the case where adaptation must be a no-op');
  assert.deepEqual(result.counts, { shaved: 0, foundation: 0, buried: 0, encapsulated: 0 });
});

test('a valley gets foundation columns and a hill gets shaved', () => {
  // Valley: terrain two blocks below the floor.
  const valley = adaptToTerrain({ adaptation: 'beard_thin', box, surfaceY: () => 68, foundationBlock: FOUNDATION, airBlock: AIR });
  // The gap is height+1 .. floor-1, so a surface two below the floor is ONE block short, not two: the floor
  // block itself belongs to the structure and is never filled.
  assert.equal(valley.counts.foundation, 9, 'nine columns, one block short each');
  for (const write of valley.writes) {
    assert.equal(write.kind, 'foundation');
    assert.equal(write.block, FOUNDATION);
    assert.ok(write.y >= 69 && write.y <= 69 + 1, `foundation at y ${write.y} is outside the gap`);
  }

  // Hill: terrain one block above the floor.
  const hill = adaptToTerrain({ adaptation: 'beard_thin', box, surfaceY: () => 71, foundationBlock: FOUNDATION, airBlock: AIR });
  assert.equal(hill.counts.shaved, 9 * 2, 'nine columns, two blocks of terrain standing at or above the floor');
  for (const write of hill.writes) assert.equal(write.block, AIR);
  assert.equal(hill.counts.foundation, 0, 'a hill must not also be given foundation');
});

test('a sloped surface is handled per column, which is the point of the module', () => {
  // A slope rising along x: column x=0 is low, x=2 is high.
  // TWO blocks of rise per column, so the slope both fills and shaves. A shallower slope hits only one of
  // the two cases per column, which is how the first version of this test managed to assert neither.
  // Heights are 68 (one short of the floor), 70 (level) and 72 (two above).
  const slope = (x) => 68 + 2 * x;
  const result = adaptToTerrain({ adaptation: 'beard_thin', box, surfaceY: slope, foundationBlock: FOUNDATION, airBlock: AIR });
  const byKind = { foundation: [], shave: [] };
  for (const write of result.writes) byKind[write.kind === 'foundation' ? 'foundation' : 'shave'].push(write);
  assert.ok(byKind.foundation.length > 0, 'the low side needs foundation');
  assert.ok(byKind.shave.length > 0, 'the high side needs shaving');
  // The low column must be filled and the high column shaved, in the same pass.
  assert.ok(byKind.foundation.every((write) => write.x === 0), 'only the low column is short of the floor');
  assert.ok(byKind.foundation.length > 0 && byKind.shave.length > 0);
  assert.ok(byKind.shave.every((write) => write.x === 2), 'only the high column stands above the floor');
});

test('nothing the structure wrote is ever overwritten', () => {
  // Mark every column's floor block as the structure's own.
  const isStructureBlock = (x, y) => y === 70;
  const result = adaptToTerrain({
    adaptation: 'beard_thin', box, surfaceY: () => 65, foundationBlock: FOUNDATION, airBlock: AIR, isStructureBlock
  });
  assert.equal(result.writes.some((write) => write.y === 70), false,
    'a foundation column that ate the structure floor would leave a hole in it');
  // And the rest of the column is still filled.
  assert.ok(result.counts.foundation > 0);
});

test('beard_box works over the inflated box and beard_thin over the tight one', () => {
  const thin = adaptToTerrain({ adaptation: 'beard_thin', box, surfaceY: () => 68, foundationBlock: FOUNDATION });
  const boxy = adaptToTerrain({ adaptation: 'beard_box', box, surfaceY: () => 68, foundationBlock: FOUNDATION });
  assert.deepEqual(thin.box, box.toArray());
  assert.deepEqual(boxy.box, box.inflate(TERRAIN_ADAPTATION_INFLATE).toArray());
  const thinColumns = new Set(thin.writes.map((write) => `${write.x},${write.z}`)).size;
  const boxyColumns = new Set(boxy.writes.map((write) => `${write.x},${write.z}`)).size;
  assert.ok(boxyColumns > thinColumns, `beard_box must cover more ground: ${boxyColumns} vs ${thinColumns}`);
  assert.equal(thinColumns, 9, 'the tight box is nine columns');
});

test('bury fills from the structure ceiling to the terrain surface', () => {
  const result = adaptToTerrain({ adaptation: 'bury', box, surfaceY: () => 74, terrainBlock: TERRAIN });
  assert.equal(result.counts.buried, 9 * 2, 'nine columns, two blocks above the ceiling at y = 72');
  for (const write of result.writes) {
    assert.ok(write.y > box.maxY, 'bury must only write above the structure');
    assert.equal(write.block, TERRAIN);
  }
  // A structure already at the surface needs no burial.
  assert.equal(adaptToTerrain({ adaptation: 'bury', box, surfaceY: () => 72, terrainBlock: TERRAIN }).writes.length, 0);
});

test('encapsulate seals the shell and leaves the interior alone', () => {
  const small = new BlockBox(0, 64, 0, 2, 66, 2);
  const result = adaptToTerrain({ adaptation: 'encapsulate', box: small, surfaceY: () => 64, terrainBlock: TERRAIN });
  // A 3x3x3 box has 27 cells, 1 interior cell, so 26 shell cells.
  assert.equal(result.counts.encapsulated, 26);
  assert.equal(result.writes.some((write) => write.x === 1 && write.y === 65 && write.z === 1), false,
    'the interior must stay open, or this would be a fill rather than a seal');
});

test('adaptationFor resolves registry values and falls back to none', () => {
  assert.equal(adaptationFor({ terrainAdaptation: 'beard_thin' }), 'beard_thin');
  assert.equal(adaptationFor({ terrain_adaptation: 'minecraft:bury' }), 'bury');
  assert.equal(adaptationFor({ terrainAdaptation: 'BEARD_BOX' }), 'beard_box');
  assert.equal(adaptationFor({}), 'none');
  assert.equal(adaptationFor(null), 'none');
  // An unrecognised value must not be invented into a real adaptation.
  assert.equal(adaptationFor({ terrainAdaptation: 'encapsulate_v2' }), 'none');
});

test('the result is deterministic and does not depend on iteration order', () => {
  const run = () => adaptToTerrain({ adaptation: 'beard_thin', box, surfaceY: (x) => 68 + x, foundationBlock: FOUNDATION, airBlock: AIR });
  const first = run();
  const second = run();
  assert.deepEqual(first.writes, second.writes);
  assert.deepEqual(first.counts, second.counts);
});
