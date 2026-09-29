import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Chunk } from '../src/world.js';
import { BLOCKS } from '../src/blocks.js';
import { ChunkMesher } from '../src/mesher.js';

test('water depth and tint match at chunk boundaries, including negative coordinates', () => {
  const world = new World();
  for (const x of [-1, 0, 1]) world.chunks.set(`${x},0`, new Chunk(x, 0));
  for (let x = -2; x <= 18; x++) for (let z = 2; z <= 5; z++) {
    for (let y = 1; y <= 5; y++) world.setVoxel(x, y, z, y < 3 ? BLOCKS.SAND : BLOCKS.WATER);
  }
  const mesher = new ChunkMesher({ getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) });
  const geometries = [-1, 0, 1].map(x => mesher.meshChunk(world.getChunk(x, 0), world));
  const corner = (geo, x) => {
    const { position, normal, color, waterDepth } = geo.attributes;
    assert.equal(waterDepth.count, position.count);
    assert.equal(color.count, position.count);
    for (let i = 0; i < position.count; i++) {
      if (position.getX(i) === x && position.getZ(i) === 3 && normal.getY(i) === 1) {
        return [waterDepth.getX(i), color.getX(i), color.getY(i), color.getZ(i)];
      }
    }
    assert.fail('Missing shared top corner');
  };
  assert.deepEqual(corner(geometries[0].waterGeo, 0), corner(geometries[1].waterGeo, 0));
  assert.deepEqual(corner(geometries[1].waterGeo, 16), corner(geometries[2].waterGeo, 16));
  assert.equal(corner(geometries[1].waterGeo, 16)[0], 3);
  const diagonal = new Chunk(-1, -1);
  world.chunks.set('-1,-1', diagonal);
  diagonal.dirty = false;
  world.setVoxel(0, 3, 0, BLOCKS.WATER);
  assert.equal(diagonal.dirty, true, 'corner edits must invalidate diagonal water meshes');
  for (const group of geometries) for (const geo of Object.values(group)) geo?.dispose();
});
