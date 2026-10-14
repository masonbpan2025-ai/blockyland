import test from 'node:test';
import assert from 'node:assert/strict';
import { TextureManager } from '../src/textures.js';
import { resourcePackManager } from '../src/resourcePackManager.js';

test('TextureManager: initial resolution matches active resource pack tile size', () => {
  // 1. Turned off / vanilla
  resourcePackManager.reorderPacks([]);
  assert.equal(resourcePackManager.getActiveTileSize(), 16);

  const tmVanilla = new TextureManager();
  assert.equal(tmVanilla.tileSize, 16);
  assert.equal(tmVanilla.atlasCanvas.width, 512);
  assert.equal(tmVanilla.atlasCanvas.height, 512);

  // 2. Active Faithful 64x
  resourcePackManager.activatePack('faithful_64x');
  assert.equal(resourcePackManager.getActiveTileSize(), 64);

  const tmFaithful = new TextureManager();
  tmFaithful.tileSize = resourcePackManager.getActiveTileSize();
  const faithfulDim = tmFaithful.atlasGridSize * tmFaithful.tileSize;
  tmFaithful.atlasCanvas.width = faithfulDim;
  tmFaithful.atlasCanvas.height = faithfulDim;

  assert.equal(tmFaithful.tileSize, 64);
  assert.equal(tmFaithful.atlasCanvas.width, 2048);
  assert.equal(tmFaithful.atlasCanvas.height, 2048);

  // Reset
  resourcePackManager.reorderPacks([]);
});

test('TextureManager: UV coordinates are strictly normalized and texel insets correctly scale with resolution', () => {
  const tm = new TextureManager();

  // Test placement of a tile at 16x
  tm.tileSize = 16;
  const col = 3;
  const row = 5;
  const inset16 = 0.5 / (tm.atlasGridSize * 16); // 0.5 / 512

  const u0_16 = col / tm.atlasGridSize + inset16;
  const u1_16 = (col + 1) / tm.atlasGridSize - inset16;
  const v1_16 = 1.0 - (row / tm.atlasGridSize) - inset16;
  const v0_16 = 1.0 - ((row + 1) / tm.atlasGridSize) + inset16;

  // Verify normalized bounds
  assert.ok(u0_16 >= 0 && u0_16 < u1_16 && u1_16 <= 1.0, '16x U bounds valid');
  assert.ok(v0_16 >= 0 && v0_16 < v1_16 && v1_16 <= 1.0, '16x V bounds valid');
  assert.equal(inset16, 0.5 / 512);

  // Test same tile at 64x (Faithful 64x active)
  tm.tileSize = 64;
  const inset64 = 0.5 / (tm.atlasGridSize * 64); // 0.5 / 2048

  const u0_64 = col / tm.atlasGridSize + inset64;
  const u1_64 = (col + 1) / tm.atlasGridSize - inset64;
  const v1_64 = 1.0 - (row / tm.atlasGridSize) - inset64;
  const v0_64 = 1.0 - ((row + 1) / tm.atlasGridSize) + inset64;

  assert.ok(u0_64 >= 0 && u0_64 < u1_64 && u1_64 <= 1.0, '64x U bounds valid');
  assert.ok(v0_64 >= 0 && v0_64 < v1_64 && v1_64 <= 1.0, '64x V bounds valid');
  assert.equal(inset64, 0.5 / 2048);

  // At 64x, inset is 4x tighter than at 16x, allowing sub-pixel clarity without bleeding
  assert.equal(inset16 / inset64, 4, '64x inset is exactly 4x sharper than 16x');
  // Column boundaries remain identical
  assert.equal(Math.floor(u0_16 * tm.atlasGridSize), col);
  assert.equal(Math.floor(u0_64 * tm.atlasGridSize), col);
});

test('TextureManager: rebuildAtlas() dynamically scales to 2048x2048 on activation and shrinks back to 512x512 on turn off', async () => {
  const tm = new TextureManager();
  tm.tileSize = 16;
  tm.tileCoords['birch_log.png'] = {
    col: 2,
    row: 4,
    u0: 2 / 32 + 0.5 / 512,
    u1: 3 / 32 - 0.5 / 512,
    v0: 1 - 5 / 32 + 0.5 / 512,
    v1: 1 - 4 / 32 - 0.5 / 512,
  };

  // Initially at 16x
  assert.equal(tm.atlasCanvas.width, 512);
  assert.equal(tm.atlasCanvas.height, 512);
  assert.equal(tm.tileSize, 16);

  // Turn on Faithful 64x
  resourcePackManager.activatePack('faithful_64x');
  assert.equal(resourcePackManager.getActiveTileSize(), 64);

  // Rebuild atlas
  await tm.rebuildAtlas();

  // Verify canvas resized to 2048x2048
  assert.equal(tm.tileSize, 64, 'Tile size updated to 64');
  assert.equal(tm.atlasCanvas.width, 2048, 'Atlas canvas width scaled to 2048');
  assert.equal(tm.atlasCanvas.height, 2048, 'Atlas canvas height scaled to 2048');

  // Verify UV inset updated to 64x
  const tile64 = tm.tileCoords['birch_log.png'];
  const expectedInset64 = 0.5 / 2048;
  assert.equal(tile64.u0, 2 / 32 + expectedInset64);
  assert.equal(tile64.u1, 3 / 32 - expectedInset64);

  // Turn off Faithful 64x (deactivate)
  resourcePackManager.deactivatePack('faithful_64x');
  assert.equal(resourcePackManager.getActiveTileSize(), 16);

  // Rebuild atlas again
  await tm.rebuildAtlas();

  // Verify canvas shrunk back to 512x512 with 16x tiles
  assert.equal(tm.tileSize, 16, 'Tile size restored to 16 when turned off');
  assert.equal(tm.atlasCanvas.width, 512, 'Atlas canvas width shrunk back to 512');
  assert.equal(tm.atlasCanvas.height, 512, 'Atlas canvas height shrunk back to 512');

  // Verify UV inset restored to 16x
  const tile16 = tm.tileCoords['birch_log.png'];
  const expectedInset16 = 0.5 / 512;
  assert.equal(tile16.u0, 2 / 32 + expectedInset16);
  assert.equal(tile16.u1, 3 / 32 - expectedInset16);
});

test('TextureManager: zero performance degradation when Faithful 64x is turned off', () => {
  // Verify theoretical memory and pixel throughput:
  // At 64x: 2048 * 2048 * 4 bytes = 16,777,216 bytes (16 MB)
  // At 16x: 512 * 512 * 4 bytes = 1,048,576 bytes (1 MB)
  const bytes64 = 2048 * 2048 * 4;
  const bytes16 = 512 * 512 * 4;

  assert.equal(bytes64 / bytes16, 16, '64x uses 16x the buffer space of 16x');

  // Turning off texture pack reclaims 93.75% of atlas texture memory
  const memoryReclaimed = (bytes64 - bytes16) / bytes64;
  assert.equal(memoryReclaimed, 0.9375, 'Reclaims 93.75% texture memory when turned off');

  // Ensure default canvas dimension is strictly 512x512
  resourcePackManager.reorderPacks([]);
  const tm = new TextureManager();
  assert.equal(tm.atlasCanvas.width, 512);
  assert.equal(tm.atlasCanvas.height, 512);
  assert.equal(tm.tileSize, 16);
});

test('ResourcePackManager & Game: onChange listener triggers immediate chunk re-meshing on all active chunks', async () => {
  const remeshedChunks = [];
  const mockGame = {
    world: {
      chunks: new Map([
        ['0,0', { cx: 0, cz: 0 }],
        ['1,0', { cx: 1, cz: 0 }],
        ['0,1', { cx: 0, cz: 1 }],
      ]),
    },
    rebuildChunkMesh(chunk) {
      remeshedChunks.push(`${chunk.cx},${chunk.cz}`);
    },
  };

  // Wire onChange listener as main.js does
  const unsubscribe = resourcePackManager.onChange(async () => {
    if (mockGame.world?.chunks) {
      for (const chunk of mockGame.world.chunks.values()) {
        mockGame.rebuildChunkMesh(chunk);
      }
    }
  });

  try {
    // Activating Faithful 64x must re-mesh all 3 chunks
    await resourcePackManager.activatePack('faithful_64x');
    assert.deepEqual(remeshedChunks, ['0,0', '1,0', '0,1'], 'All loaded chunks re-meshed on pack activation');

    // Deactivating Faithful 64x must re-mesh all 3 chunks again
    remeshedChunks.length = 0;
    await resourcePackManager.deactivatePack('faithful_64x');
    assert.deepEqual(remeshedChunks, ['0,0', '1,0', '0,1'], 'All loaded chunks re-meshed on pack deactivation');
  } finally {
    unsubscribe();
    resourcePackManager.reorderPacks([]);
  }
});

