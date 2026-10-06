import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { encodeVoxelsRLE, decodeVoxelsRLE, serializeWorld, deserializeWorld } from '../src/mapManager.js';
import { World, Chunk } from '../src/world.js';
import { BLOCKS } from '../src/blocks.js';

test('Voxel RLE encoding and decoding preserves 100% data integrity', () => {
  const size = 16 * 64 * 16;
  const original = new Uint8Array(size);

  // Simulate Minecraft terrain: bedrock at bottom, stone, dirt, grass, air
  for (let y = 0; y < 64; y++) {
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const idx = (y * 16 + z) * 16 + x;
        if (y === 0) original[idx] = BLOCKS.BEDROCK;
        else if (y < 20) original[idx] = BLOCKS.STONE;
        else if (y < 25) original[idx] = BLOCKS.DIRT;
        else if (y === 25) original[idx] = BLOCKS.GRASS;
        else original[idx] = BLOCKS.AIR;
      }
    }
  }

  const encoded = encodeVoxelsRLE(original);
  assert.ok(encoded.length < 20, `Expected highly compressed RLE pairs, got ${encoded.length}`);

  const decoded = new Uint8Array(size);
  decodeVoxelsRLE(encoded, decoded);

  for (let i = 0; i < size; i++) {
    assert.strictEqual(decoded[i], original[i], `Voxel at index ${i} mismatch`);
  }
});

test('serializeWorld generates complete map object with chunks, player, inventory, and AI memory', () => {
  const world = new World(12345);
  const chunk0 = world.getOrCreateChunk(0, 0);
  chunk0.setVoxel(5, 30, 5, BLOCKS.DIAMOND_BLOCK);

  const mockGame = {
    world,
    worldTime: 8500,
    weather: { isRaining: true, rainIntensity: 0.75 },
    player: {
      position: { x: 10.5, y: 32.0, z: -4.2 },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 1.57,
      pitch: -0.2,
      gamemode: 'creative',
      health: 20,
      hunger: 18,
      exp: 120,
      level: 5
    },
    inventory: {
      hotbar: [{ id: 'diamond_sword', isBlock: false, count: 1 }, null],
      storage: [{ id: BLOCKS.GOLD_ORE, isBlock: true, count: 64 }],
      activeSlot: 0
    },
    mobs: {
      mobs: [
        {
          type: 'villager',
          mesh: { position: { x: 5, y: 25, z: 5 } },
          yaw: 0.5,
          health: 20
        }
      ]
    },
    geminiAgent: {
      builtStructures: [
        { id: 'struct_1', name: 'Aquarium', type: 'aquarium', center: [5, 25, 5] }
      ],
      lastBuiltStructure: { id: 'struct_1' },
      conversationHistory: []
    }
  };

  const mapData = serializeWorld(mockGame, 'Test World Alpha');

  assert.strictEqual(mapData.format, 'minecraft-web-map');
  assert.strictEqual(mapData.name, 'Test World Alpha');
  assert.strictEqual(mapData.seed, 12345);
  assert.strictEqual(mapData.worldTime, 8500);
  assert.strictEqual(mapData.weather.isRaining, true);
  assert.strictEqual(mapData.player.gamemode, 'creative');
  assert.strictEqual(mapData.player.position.x, 10.5);
  assert.strictEqual(mapData.inventory.hotbar[0].id, 'diamond_sword');
  assert.strictEqual(mapData.mobs.length, 1);
  assert.strictEqual(mapData.mobs[0].type, 'villager');
  assert.strictEqual(mapData.gemini.builtStructures.length, 1);
  assert.ok(mapData.chunks.length >= 1);
});

test('deserializeWorld restores world chunks, seed, player, inventory, and AI memory', () => {
  const world = new World(9999);
  const chunk0 = world.getOrCreateChunk(0, 0);
  chunk0.setVoxel(7, 35, 7, BLOCKS.EMERALD_ORE);

  const mockGame = {
    world,
    worldTime: 6000,
    scene: {
      remove() {}
    },
    camera: {
      quaternion: { setFromEuler() {} }
    },
    player: {
      position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
      velocity: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
      yaw: 0,
      pitch: 0,
      gamemode: 'survival',
      health: 10,
      hunger: 10,
      exp: 0,
      level: 0,
      update() {}
    },
    inventory: {
      hotbar: new Array(9).fill(null),
      storage: new Array(27).fill(null),
      activeSlot: 0
    },
    mobs: {
      mobs: [],
      clearMobs() { this.mobs = []; },
      spawnMob(type, x, y, z) {
        this.mobs.push({ type, x, y, z });
      }
    },
    geminiAgent: {
      builtStructures: [],
      lastBuiltStructure: null,
      conversationHistory: []
    },
    loadChunksAroundPlayer() {},
    rebuildChunkMesh() {},
    ui: {
      updateStats() {},
      updateHotbar() {},
      addChatMessage() {}
    }
  };

  // Serialize first
  const serialized = serializeWorld(mockGame, 'Emerald Palace');
  // Mutate serialized player & block to verify restoration
  serialized.player.position = { x: 42.5, y: 30.0, z: 88.2 };
  serialized.player.gamemode = 'creative';
  serialized.mobs = [{ type: 'dolphin', position: { x: 2, y: 22, z: 2 }, yaw: 0, health: 15 }];
  serialized.gemini.builtStructures = [{ id: 'palace_1', name: 'Emerald Palace' }];

  // Deserialize into fresh world
  deserializeWorld(mockGame, serialized);

  assert.strictEqual(mockGame.world.seed, 9999);
  assert.strictEqual(mockGame.player.position.x, 42.5);
  assert.strictEqual(mockGame.player.gamemode, 'creative');
  assert.strictEqual(mockGame.mobs.mobs.length, 1);
  assert.strictEqual(mockGame.mobs.mobs[0].type, 'dolphin');
  assert.strictEqual(mockGame.geminiAgent.builtStructures[0].name, 'Emerald Palace');

  // Verify custom block emerald still placed in chunk
  const restoredChunk = mockGame.world.getChunk(0, 0);
  assert.ok(restoredChunk, 'Chunk (0,0) must exist');
  assert.strictEqual(restoredChunk.getVoxel(7, 35, 7), BLOCKS.EMERALD_ORE);
});


test('Default save directory can save and load map files on local disk', () => {
  const savesDir = path.resolve(process.cwd(), 'saves');
  if (!fs.existsSync(savesDir)) {
    fs.mkdirSync(savesDir, { recursive: true });
  }

  const testFilePath = path.join(savesDir, 'test_unit_world.json');
  const dummyMap = {
    format: 'minecraft-web-map',
    version: 1,
    name: 'Unit Test World',
    savedAt: new Date().toISOString(),
    seed: 777,
    chunks: []
  };

  fs.writeFileSync(testFilePath, JSON.stringify(dummyMap, null, 2), 'utf-8');
  assert.ok(fs.existsSync(testFilePath), 'Map file must exist on local disk in default saves path');

  const content = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
  assert.strictEqual(content.name, 'Unit Test World');
  assert.strictEqual(content.seed, 777);

  // Clean up test file
  fs.unlinkSync(testFilePath);
  assert.strictEqual(fs.existsSync(testFilePath), false);
});
