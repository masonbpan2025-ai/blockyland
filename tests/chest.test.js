import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { createBlockGeometry } from '../src/blockGeometry.js';
import { createChestGeometry, ChestManager } from '../src/chest.js';

function createMockTextureManager() {
  const tileCoords = {
    'chest_side.png': { col: 4, row: 10, u0: 0.25, u1: 0.3125, v1: 0.375, v0: 0.3125 },
    'chest_front.png': { col: 5, row: 10, u0: 0.3125, u1: 0.375, v1: 0.375, v0: 0.3125 },
    'chest_top.png': { col: 3, row: 10, u0: 0.1875, u1: 0.25, v1: 0.375, v0: 0.3125 },
    'chest_lock.png': { col: 6, row: 10, u0: 0.375, u1: 0.4375, v1: 0.375, v0: 0.3125 }
  };
  return {
    tileCoords,
    getFaceUVs(blockId, face) {
      if (typeof blockId === 'string') {
        const tex = blockId.endsWith('.png') ? blockId : `${blockId}.png`;
        if (tileCoords[tex]) return tileCoords[tex];
        if (tileCoords[blockId]) return tileCoords[blockId];
        const upper = blockId.toUpperCase();
        if (BLOCKS[upper] !== undefined) blockId = BLOCKS[upper];
      }
      const def = BLOCK_DEFS[blockId];
      if (!def || !def.textures) return { u0: 0, v0: 0, u1: 1 / 16, v1: 1 / 16 };
      const tex = def.textures[face] || def.textures.all || 'chest_side.png';
      return tileCoords[tex] || { u0: 0, v0: 0, u1: 1 / 16, v1: 1 / 16 };
    }
  };
}

test('Chest block definition includes all face textures and lock', () => {
  const def = BLOCK_DEFS[BLOCKS.CHEST];
  assert.ok(def, 'BLOCK_DEFS has CHEST entry');
  assert.equal(def.chest, true, 'def.chest is true');
  assert.ok(def.textures, 'def has textures object');
  assert.equal(def.textures.side, 'chest_side.png');
  assert.equal(def.textures.front, 'chest_front.png');
  assert.equal(def.textures.top, 'chest_top.png');
  assert.equal(def.textures.lock, 'chest_lock.png');
});

test('createBlockGeometry creates 3D chest geometry for numeric ID and string id', () => {
  const tm = createMockTextureManager();

  const numGeo = createBlockGeometry(BLOCKS.CHEST, tm);
  assert.ok(numGeo, 'Geometry created for BLOCKS.CHEST');
  assert.ok(numGeo.attributes.position.count > 0, 'Geometry has vertices');
  assert.ok(numGeo.attributes.uv, 'Geometry has UV attribute');
  assert.ok(numGeo.attributes.color, 'Geometry has color attribute');
  assert.ok(numGeo.attributes.emission, 'Geometry has emission attribute');
  assert.ok(numGeo.attributes.flame, 'Geometry has flame attribute');

  const strGeo = createBlockGeometry('chest', tm);
  assert.ok(strGeo, 'Geometry created for string "chest"');
  assert.equal(strGeo.attributes.position.count, numGeo.attributes.position.count, 'Matches numeric chest vertex count');

  // Check that UVs are non-zero (not stuck at blank atlas slot 0,0)
  const uvs = numGeo.attributes.uv.array;
  let hasValidChestUV = false;
  for (let i = 0; i < uvs.length; i += 2) {
    if (uvs[i] >= 0.1875 && uvs[i] <= 0.4375) {
      hasValidChestUV = true;
      break;
    }
  }
  assert.ok(hasValidChestUV, 'Chest geometry samples valid chest texture UV coordinates');
});

test('Chest geometry integrates with chunk mesher lightGeometries with lightOrigin', () => {
  const tm = createMockTextureManager();
  const geo = createChestGeometry(false, false, 0, tm);
  const origin = new Float32Array(geo.attributes.position.count * 3);
  geo.setAttribute('lightOrigin', new THREE.Float32BufferAttribute(origin, 3));

  const merged = mergeGeometries([geo]);
  assert.ok(merged, 'Chest geometry successfully merges into lightGeo buffer');
  assert.equal(merged.attributes.position.count, geo.attributes.position.count);
});

test('Double chest geometry handles left and right halves with correct bounds', () => {
  const tm = createMockTextureManager();
  const leftHalf = createChestGeometry(true, true, 0, tm);
  const rightHalf = createChestGeometry(true, false, 0, tm);

  assert.ok(leftHalf && rightHalf, 'Both halves generated');
  assert.equal(leftHalf.attributes.position.count, rightHalf.attributes.position.count);
});

test('ChestManager.placeChest registers single chest and links double chest', () => {
  const mockWorld = {
    voxels: new Map(),
    setVoxel(x, y, z, id) {
      this.voxels.set(`${x},${y},${z}`, id);
    },
    getVoxel(x, y, z) {
      return this.voxels.get(`${x},${y},${z}`) || BLOCKS.AIR;
    },
    getChunk: () => ({ dirty: false })
  };

  const chestManager = new ChestManager({ rebuildChunkMesh: () => {} });

  // Place first chest at 10, 5, 10 facing South (0)
  const chest1 = chestManager.placeChest(mockWorld, [10, 5, 10], 0);
  assert.ok(chest1, 'Chest 1 placed');
  assert.equal(chest1.isDouble, false, 'Chest 1 is initially single');
  assert.equal(mockWorld.getVoxel(10, 5, 10), BLOCKS.CHEST, 'Voxel set to BLOCKS.CHEST');

  // Place adjacent chest at 11, 5, 10 with same facing South (0)
  const chest2 = chestManager.placeChest(mockWorld, [11, 5, 10], 0);
  assert.ok(chest2, 'Chest 2 placed');
  assert.equal(chest1.isDouble, true, 'Chest 1 is linked into double chest');
  assert.equal(chest2.isDouble, true, 'Chest 2 is linked into double chest');
  assert.notEqual(chest1.isLeft, chest2.isLeft, 'One half is left and the other is right');
});

test('ITEMS.chest defines isBlock: true and blockId: BLOCKS.CHEST', () => {
  assert.ok(ITEMS.chest, 'ITEMS has chest');
  assert.equal(ITEMS.chest.isBlock, true, 'ITEMS.chest isBlock is true');
  assert.equal(ITEMS.chest.blockId, BLOCKS.CHEST, 'ITEMS.chest blockId is BLOCKS.CHEST');
});
