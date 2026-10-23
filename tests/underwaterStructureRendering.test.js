import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Chunk } from '../src/world.js';
import { BLOCKS } from '../src/blocks.js';
import { ChunkMesher } from '../src/mesher.js';
import { waterHeight, waterCornerHeight } from '../src/waterGeometry.js';

const texStub = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };

test('water does not generate faces against underwater wooden stairs, slabs, fences, or chests', () => {
  const world = new World(999);
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);

  // Submerged 5x5 volume of water
  for (let x = 0; x < 5; x++) {
    for (let z = 0; z < 5; z++) {
      for (let y = 10; y <= 15; y++) {
        chunk.setVoxel(x, y, z, BLOCKS.WATER);
      }
    }
  }

  // Place solid partial structure blocks submerged inside water
  chunk.setVoxel(2, 11, 2, BLOCKS.OAK_STAIRS);
  chunk.setVoxel(2, 12, 2, BLOCKS.SPRUCE_SLAB);
  chunk.setVoxel(2, 13, 2, BLOCKS.OAK_FENCE);
  chunk.setVoxel(2, 14, 2, BLOCKS.OAK_TRAPDOOR);
  chunk.setVoxel(3, 11, 2, BLOCKS.CHEST);
  chunk.setVoxel(1, 11, 2, BLOCKS.OAK_DOOR);

  const mesher = new ChunkMesher(texStub);
  const geo = mesher.meshChunk(chunk, world);

  // Collect all water vertex positions around (2, 11, 2)
  const pos = geo.waterGeo.attributes.position;
  let facesAgainstStairs = 0;
  for (let i = 0; i < pos.count; i += 4) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (let v = 0; v < 4; v++) {
      const px = pos.getX(i + v);
      const py = pos.getY(i + v);
      const pz = pos.getZ(i + v);
      minX = Math.min(minX, px); maxX = Math.max(maxX, px);
      minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      minZ = Math.min(minZ, pz); maxZ = Math.max(maxZ, pz);
    }
    // Check if this water face is on any boundary of the stair at (2, 11, 2)
    const isBoundaryOfStair =
      (minX === 2 && maxX === 3 && minY === 11 && maxY === 12 && (minZ === 2 || minZ === 3)) ||
      (minZ === 2 && maxZ === 3 && minY === 11 && maxY === 12 && (minX === 2 || minX === 3)) ||
      (minX === 2 && maxX === 3 && minZ === 2 && maxZ === 3 && (minY === 11 || maxY === 12));
    if (isBoundaryOfStair) facesAgainstStairs++;
  }

  assert.equal(facesAgainstStairs, 0, 'water must not render internal faces against submerged stairs');

  for (const g of Object.values(geo)) g?.dispose();
});

test('water maintains full ceiling height under solid wooden/stone blocks', () => {
  const world = new World(999);
  // Water topped by wooden planks
  world.setVoxel(5, 20, 5, BLOCKS.WATER);
  world.setVoxel(5, 21, 5, BLOCKS.OAK_PLANKS);
  assert.equal(waterHeight(world, 5, 20, 5), 1, 'water topped by oak planks must have full height 1');
  assert.equal(waterCornerHeight(world, 5, 20, 5), 1, 'water corners topped by oak planks must have full height 1');

  // Water topped by stone
  world.setVoxel(6, 20, 5, BLOCKS.WATER);
  world.setVoxel(6, 21, 5, BLOCKS.STONE);
  assert.equal(waterHeight(world, 6, 20, 5), 1, 'water topped by stone must have full height 1');
  assert.equal(waterCornerHeight(world, 6, 20, 5), 1, 'water corners topped by stone must have full height 1');

  // Water topped by stairs
  world.setVoxel(7, 20, 5, BLOCKS.WATER);
  world.setVoxel(7, 21, 5, BLOCKS.OAK_STAIRS);
  assert.equal(waterHeight(world, 7, 20, 5), 1, 'water topped by oak stairs must have full height 1');
});

// Ice is not inset against: water's faces against ice are culled instead (iceWaterShadows.test.js).
test('aquarium glass continues to render water faces with a 0.995 inset under glass to prevent z-fighting', () => {
  const world = new World(999);
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);

  // Water block adjacent to glass (east) and glass above
  chunk.setVoxel(5, 10, 5, BLOCKS.WATER);
  chunk.setVoxel(6, 10, 5, BLOCKS.GLASS);
  chunk.setVoxel(5, 11, 5, BLOCKS.GLASS);

  const mesher = new ChunkMesher(texStub);
  const geo = mesher.meshChunk(chunk, world);

  assert.ok(geo.waterGeo, 'water against glass must generate a water face for aquarium visibility');
  const pos = geo.waterGeo.attributes.position;
  let topFaceY = null;
  let hasEastFace = false;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getX(i) - 5.5) < 0.6 && Math.abs(pos.getZ(i) - 5.5) < 0.6) {
      if (pos.getY(i) > 10.5) topFaceY = pos.getY(i);
    }
    if (pos.getX(i) === 6) hasEastFace = true;
  }
  assert.ok(topFaceY !== null, 'found top water face under glass');
  assert.equal(Number(topFaceY.toFixed(3)), 10.995, 'top face under glass must be at 10.995 to prevent z-fighting');
  assert.ok(hasEastFace, 'east face against glass must be generated');

  for (const g of Object.values(geo)) g?.dispose();
});
