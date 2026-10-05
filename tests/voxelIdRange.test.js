// The chunk voxel store must hold every id the block registry uses.
//
// This is a regression test for a bug that shipped silently. `Chunk.voxels` was a Uint8Array, and
// generated parity content pushed block ids past 255. Setting block 270 stored 14, so the chunk read
// back Sand, and the only symptom was a block that never appeared: the mesher was asked to draw an id
// that had been quietly mangled. Nothing threw, and no existing test noticed, because every block id
// in the hand-written registry happened to fit in 8 bits.
//
// The array is a Uint16Array now. These tests pin the two properties that matter: ids round-trip, and
// the store's capacity is checked against the registry rather than assumed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Chunk } from '../src/world.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { encodeVoxelsRLE, decodeVoxelsRLE } from '../src/mapManager.js';

/** The largest id the voxel store can represent. */
const storeCapacity = (() => {
  const probe = new Chunk(0, 0);
  // Fill with a marker and see what the array itself reports as its element type capacity.
  probe.voxels[0] = 65535;
  return probe.voxels[0] === 65535 ? 65535 : probe.voxels[0];
})();

test('the voxel store holds every registered block id', () => {
  const ids = Object.values(BLOCKS).filter(v => typeof v === 'number');
  const highest = Math.max(...ids);
  assert.ok(storeCapacity >= highest,
    `highest block id is ${highest} but the voxel store caps at ${storeCapacity}, so ids wrap silently`);
});

test('block ids at and above 256 round-trip through a chunk', () => {
  // The exact case that broke: an id above the old 8-bit ceiling.
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);

  const high = Object.values(BLOCKS).filter(v => typeof v === 'number' && v > 255);
  if (high.length === 0) {
    // Nothing above 255 yet: still assert the boundary holds, so the test keeps its value.
    chunk.setVoxel(1, 1, 1, 255);
    assert.equal(chunk.getVoxel(1, 1, 1), 255, 'id 255 must round-trip');
    return;
  }
  for (const id of high) {
    chunk.setVoxel(2, 2, 2, id);
    assert.equal(chunk.getVoxel(2, 2, 2), id,
      `block id ${id} did not round-trip; it came back as ${chunk.getVoxel(2, 2, 2)}`);
  }
});

test('every registered block id round-trips through the world', () => {
  // The strongest form: set each id and read it back, so no id anywhere in the registry is stored
  // as a different block. Done through World.setVoxel because that is the path gameplay uses.
  const world = new World();
  world.getOrCreateChunk(0, 0);
  const ids = [...new Set(Object.values(BLOCKS).filter(v => typeof v === 'number'))];
  let checked = 0;
  for (const id of ids) {
    if (id === BLOCKS.AIR) continue;
    world.setVoxel(3, 40, 3, id);
    assert.equal(world.getVoxel(3, 40, 3), id, `id ${id} round-trip failed`);
    checked++;
  }
  assert.ok(checked > 200, `expected to check the whole registry, only checked ${checked}`);
});

test('a high block id survives a save and load round-trip', () => {
  // The save format must not assume 8-bit values either. It does not: the run-length encoder writes
  // values rather than bytes. This pins that, because a byte-oriented encoder would corrupt exactly
  // the ids this whole change is about.
  const ids = [...new Set(Object.values(BLOCKS).filter(v => typeof v === 'number'))];
  const high = ids.filter(v => v > 255);
  const probe = high.length ? high : [255];
  for (const id of probe) {
    const source = new Uint16Array(64);
    source[0] = id;
    source[10] = id;
    source[63] = 7;
    const rle = encodeVoxelsRLE(source);
    const restored = new Uint16Array(64);
    decodeVoxelsRLE(rle, restored);
    assert.equal(restored[0], id, `id ${id} corrupted by save encoding`);
    assert.equal(restored[10], id, `id ${id} corrupted by save encoding at an offset run`);
    assert.equal(restored[63], 7);
    assert.deepEqual([...restored], [...source], 'a save round-trip must be lossless');
  }
});

test('the block registry reports its own capacity limit', () => {
  // Guards the generator, which refuses to emit an id above the store capacity. If the registry ever
  // grows past what the store holds, this says so in the test output rather than in a bug report.
  const ids = Object.values(BLOCKS).filter(v => typeof v === 'number');
  const highest = Math.max(...ids);
  const named = Object.keys(BLOCKS).length;
  console.log(`  registry: ${named} names, ${new Set(ids).size} distinct ids, highest ${highest}, `
    + `store capacity ${storeCapacity}`);
  assert.ok(highest < storeCapacity || highest === storeCapacity,
    'the registry must fit the store');
});
