import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { blockId, paletteIndex, convertChunks, readRegion } from '../scripts/arnis-convert.mjs';
import { decodeVoxelsRLE } from '../src/mapManager.js';
import { writeNbt } from '../src/io/nbt.js';
import { BLOCKS } from '../src/blocks.js';

test('decodes Java palette indices across padded 64-bit words', () => {
  const words = [BigInt.asIntN(64, 1n | (16n << 55n)), 7n];
  assert.equal(paletteIndex(words, 0, 17), 1);
  assert.equal(paletteIndex(words, 11, 17), 16);
  assert.equal(paletteIndex(words, 12, 17), 7);
  assert.throws(() => paletteIndex([], 12, 17), /Truncated/);
});

test('converts coordinates, orientation, and reports unsupported and clipped blocks', () => {
  const palette = [{ Name: 'minecraft:air' }, { Name: 'minecraft:grass_block' },
    { Name: 'minecraft:oak_stairs', Properties: { facing: 'east', half: 'top' } },
    { Name: 'minecraft:not_a_real_block' }];
  // indices 0, 1, 2, 3 are at x=0..3, y=-64, z=0
  const data = new BigInt64Array(256); data[0] = 0x3210n;
  const source = { xPos: -1, zPos: 2, sections: [
    { Y: -4, block_states: { palette, data } },
    { Y: 1, block_states: { palette: [{ Name: 'minecraft:stone' }] } }
  ], block_entities: [{}] };
  const { map, report } = convertChunks([source]);
  const voxels = new Uint16Array(16384); decodeVoxelsRLE(map.chunks[0].voxels, voxels);
  assert.equal(voxels[1], BLOCKS.GRASS_BLOCK);
  assert.equal(voxels[2], BLOCKS.OAK_STAIRS);
  assert.equal(voxels[3], BLOCKS.AIR);
  assert.equal(map.structureOrientations[0].x, -14);
  assert.equal(map.structureOrientations[0].z, 32);
  assert.equal(map.structureOrientations[0].facing, 'east');
  assert.equal(report.missing['minecraft:not_a_real_block'], 1);
  assert.equal(report.clipped['minecraft:stone'], 4096);
  assert.equal(report.blockEntities, 1);
  assert.equal(map.generationMode, 'authored');
  assert.equal(blockId('minecraft:light'), BLOCKS.AIR);
});

test('reads a compressed Anvil chunk and rejects invalid headers', () => {
  const payload = zlib.deflateSync(writeNbt({ xPos: 0, zPos: 0 }, { types: { xPos: 3, zPos: 3 } }));
  const file = Buffer.alloc(12288);
  file.writeUInt32BE((2 << 8) | 1, 0);
  file.writeUInt32BE(payload.length + 1, 8192); file[8196] = 2;
  payload.copy(file, 8197);
  assert.equal(readRegion(file)[0].xPos, 0);
  assert.throws(() => readRegion(Buffer.alloc(16)), /header/);
  file.writeUInt32BE(10000, 8192);
  assert.throws(() => readRegion(file), /length/);
});
