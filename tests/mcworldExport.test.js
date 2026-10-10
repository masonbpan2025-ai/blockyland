import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readNbt } from '../src/io/nbt.js';
import {
  crc32,
  crc32c,
  maskCrc32c,
  buildLevelDbFiles,
  buildLevelDat,
  buildBedrockPlayerData,
  getBedrockItemName,
  getItemDamage,
  createZipArchive,
  generateMcWorld,
  exportMapToMcWorld
} from '../src/io/mcworldExporter.js';
import {
  generateMcWorld as mapMgrGenerateMcWorld,
  exportMapToMcWorld as mapMgrExportMapToMcWorld,
  serializeWorld
} from '../src/mapManager.js';
import { World } from '../src/world.js';
import { BLOCKS } from '../src/blocks.js';

test('CRC32 matches standard IEEE 802.3 test vectors', () => {
  // Standard test vector: ASCII string "123456789" -> 0xcbf43926
  const data = new TextEncoder().encode('123456789');
  assert.equal(crc32(data), 0xcbf43926 >>> 0);
});

test('CRC32C matches standard Castagnoli test vectors and masking', () => {
  // Standard test vector: ASCII string "123456789" -> 0xe3069283
  const data = new TextEncoder().encode('123456789');
  const crc = crc32c(data);
  assert.equal(crc, 0xe3069283 >>> 0);

  const masked = maskCrc32c(crc);
  assert.equal(typeof masked, 'number');
  assert.ok(masked > 0);
});

test('buildLevelDbFiles creates valid LevelDB metadata for Bedrock import', () => {
  const { current, manifest, log } = buildLevelDbFiles();

  // CURRENT points to MANIFEST-000001
  const currentStr = new TextDecoder().decode(current);
  assert.equal(currentStr, 'MANIFEST-000001\n');

  // MANIFEST-000001 must contain comparator and LevelDB record header
  assert.ok(manifest.length > 7);
  const dv = new DataView(manifest.buffer, manifest.byteOffset, manifest.byteLength);
  const payloadLen = dv.getUint16(4, true);
  const recordType = dv.getUint8(6);
  assert.equal(recordType, 1); // kFullType
  assert.equal(payloadLen, manifest.length - 7);

  const manifestStr = new TextDecoder().decode(manifest);
  assert.ok(manifestStr.includes('leveldb.BytewiseComparator'));

  // 000002.log is empty initial log
  assert.equal(log.length, 0);
});

test('buildLevelDat creates Bedrock level.dat with 8-byte header and valid Little-Endian NBT', () => {
  const mapData = {
    name: 'Bedrock Survival',
    seed: 987654321,
    worldTime: 42000,
    player: {
      position: { x: 128.5, y: 72.0, z: -64.2 },
      gamemode: 'survival'
    },
    session: {
      difficulty: 'normal'
    },
    weather: {
      isRaining: false
    }
  };

  const levelDatBytes = buildLevelDat(mapData);
  assert.ok(levelDatBytes.length > 8);

  const dv = new DataView(levelDatBytes.buffer, levelDatBytes.byteOffset, levelDatBytes.byteLength);
  const storageVersion = dv.getInt32(0, true);
  const nbtLen = dv.getInt32(4, true);

  // Bedrock storage version 10
  assert.equal(storageVersion, 10);
  assert.equal(nbtLen, levelDatBytes.length - 8);

  // Read back the NBT payload using little-endian reader
  const nbtPayload = levelDatBytes.slice(8);
  const nbt = readNbt(nbtPayload, { littleEndian: true });

  assert.equal(nbt.LevelName, 'Bedrock Survival');
  assert.equal(nbt.StorageVersion, 10);
  assert.equal(nbt.GameType, 0); // survival
  assert.equal(nbt.Generator, 1); // Infinite Overworld
  assert.equal(nbt.Difficulty, 2); // normal
  assert.equal(nbt.SpawnX, 129);
  assert.equal(nbt.SpawnY, 72);
  assert.equal(nbt.SpawnZ, -64);
  assert.equal(nbt.RandomSeed, 987654321n);
  assert.equal(nbt.Time, 42000n);
  assert.equal(nbt.commandsEnabled, 1);
  assert.equal(nbt.ServerChunkTickRange, 4);
});

test('buildLevelDat handles creative gamemode and weather correctly', () => {
  const mapData = {
    name: 'Creative Test',
    seed: -12345,
    worldTime: 1000,
    player: {
      position: { x: 0, y: 64, z: 0 },
      gamemode: 'creative'
    },
    weather: {
      isRaining: true,
      rainIntensity: 0.85
    }
  };

  const levelDatBytes = buildLevelDat(mapData);
  const nbtPayload = levelDatBytes.slice(8);
  const nbt = readNbt(nbtPayload, { littleEndian: true });

  assert.equal(nbt.LevelName, 'Creative Test');
  assert.equal(nbt.GameType, 1); // creative
  assert.equal(nbt.hasBeenLoadedInCreative, 1);
  assert.equal(nbt.RainTime, 10000);
  assert.ok(Math.abs(nbt.rainLevel - 0.85) < 0.001);
});

test('generateMcWorld creates a complete valid ZIP package with all required files', () => {
  const mapData = {
    name: 'Official Export World',
    seed: 555666777,
    worldTime: 12000,
    player: {
      position: { x: 10, y: 65, z: 20 },
      gamemode: 'survival'
    }
  };

  const mcworldBytes = generateMcWorld(mapData);
  assert.ok(mcworldBytes instanceof Uint8Array);
  assert.ok(mcworldBytes.length > 200);

  // Check ZIP Local Header magic PK\x03\x04
  assert.equal(mcworldBytes[0], 0x50); // 'P'
  assert.equal(mcworldBytes[1], 0x4b); // 'K'
  assert.equal(mcworldBytes[2], 0x03);
  assert.equal(mcworldBytes[3], 0x04);

  // Parse ZIP central directory to extract and verify all entry paths
  // Search for EOCD signature PK\x05\x06 from the end
  let eocdOffset = -1;
  for (let i = mcworldBytes.length - 22; i >= 0; i--) {
    if (
      mcworldBytes[i] === 0x50 &&
      mcworldBytes[i + 1] === 0x4b &&
      mcworldBytes[i + 2] === 0x05 &&
      mcworldBytes[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }
  assert.ok(eocdOffset >= 0, 'Must have a valid ZIP End of Central Directory (EOCD)');

  const eocdView = new DataView(mcworldBytes.buffer, mcworldBytes.byteOffset + eocdOffset, 22);
  const totalEntries = eocdView.getUint16(10, true);
  const centralDirSize = eocdView.getUint32(12, true);
  const centralDirOffset = eocdView.getUint32(16, true);

  assert.equal(totalEntries, 8, 'Must contain 8 files in Bedrock package');

  // Read each central directory record
  let cdPos = centralDirOffset;
  const filesFound = new Map();

  for (let i = 0; i < totalEntries; i++) {
    const cv = new DataView(mcworldBytes.buffer, mcworldBytes.byteOffset + cdPos, 46);
    assert.equal(cv.getUint32(0, true), 0x02014b50, 'Central directory header magic');
    const compSize = cv.getUint32(20, true);
    const uncompSize = cv.getUint32(24, true);
    const nameLen = cv.getUint16(28, true);
    const extraLen = cv.getUint16(30, true);
    const commentLen = cv.getUint16(32, true);
    const localHeaderOffset = cv.getUint32(42, true);

    const nameBytes = mcworldBytes.subarray(cdPos + 46, cdPos + 46 + nameLen);
    const fileName = new TextDecoder().decode(nameBytes);

    // Read file data from local header
    const lv = new DataView(mcworldBytes.buffer, mcworldBytes.byteOffset + localHeaderOffset, 30);
    assert.equal(lv.getUint32(0, true), 0x04034b50, 'Local header magic');
    const localNameLen = lv.getUint16(26, true);
    const localExtraLen = lv.getUint16(28, true);
    const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const data = mcworldBytes.subarray(dataOffset, dataOffset + uncompSize);

    filesFound.set(fileName, { compSize, uncompSize, data });
    cdPos += 46 + nameLen + extraLen + commentLen;
  }

  // Verify all essential Bedrock files are present
  const requiredFiles = [
    'levelname.txt',
    'level.dat',
    'level.dat_old',
    'world_behavior_packs.json',
    'world_resource_packs.json',
    'db/CURRENT',
    'db/MANIFEST-000001',
    'db/000002.log'
  ];

  for (const req of requiredFiles) {
    assert.ok(filesFound.has(req), `Package must include ${req}`);
  }

  // Verify levelname.txt matches world name
  const levelNameContent = new TextDecoder().decode(filesFound.get('levelname.txt').data);
  assert.equal(levelNameContent, 'Official Export World');

  // Verify world packs are empty JSON arrays
  const behaviorPacks = new TextDecoder().decode(filesFound.get('world_behavior_packs.json').data);
  assert.equal(behaviorPacks.trim(), '[]');

  const resourcePacks = new TextDecoder().decode(filesFound.get('world_resource_packs.json').data);
  assert.equal(resourcePacks.trim(), '[]');

  // Verify level.dat and level.dat_old are identical
  const ldat = filesFound.get('level.dat').data;
  const ldatOld = filesFound.get('level.dat_old').data;
  assert.equal(ldat.length, ldatOld.length);
  assert.deepEqual(ldat, ldatOld);

  // Verify level.dat NBT inside zip is valid
  const nbtParsed = readNbt(ldat.slice(8), { littleEndian: true });
  assert.equal(nbtParsed.LevelName, 'Official Export World');
  assert.equal(nbtParsed.SpawnX, 10);
  assert.equal(nbtParsed.SpawnY, 65);
  assert.equal(nbtParsed.SpawnZ, 20);
});

test('serializeWorld integration generates valid .mcworld package from real game world', () => {
  const world = new World(998877);
  const chunk = world.getOrCreateChunk(0, 0);
  chunk.setVoxel(8, 64, 8, BLOCKS.DIAMOND_BLOCK);

  const mockGame = {
    world,
    worldTime: 18000,
    weather: { isRaining: false, rainIntensity: 0 },
    player: {
      position: { x: 8, y: 65, z: 8 },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      gamemode: 'survival',
      health: 20,
      hunger: 20,
      exp: 0,
      level: 0
    },
    inventory: {
      hotbar: [null],
      storage: [null]
    },
    mobs: { mobs: [] }
  };

  const serialized = serializeWorld(mockGame, 'My Custom Survival Castle');
  const mcworldBytes = generateMcWorld(serialized);

  assert.ok(mcworldBytes instanceof Uint8Array);
  assert.ok(mcworldBytes.length > 500);

  // Verify level.dat contains serialized map name and coordinates
  const levelDat = buildLevelDat(serialized);
  const nbt = readNbt(levelDat.slice(8), { littleEndian: true });
  assert.equal(nbt.LevelName, 'My Custom Survival Castle');
  assert.equal(nbt.SpawnX, 8);
  assert.equal(nbt.SpawnY, 65);
  assert.equal(nbt.SpawnZ, 8);
});

test('exportMapToMcWorld simulates browser download with correct filename and MIME type', () => {
  const mockElements = [];
  let clicked = false;
  let revoked = false;

  const originalDocument = globalThis.document;
  const originalUrl = globalThis.URL;

  // Mock DOM environment
  globalThis.document = {
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        href: '',
        download: '',
        click() { clicked = true; }
      };
      mockElements.push(el);
      return el;
    },
    body: {
      appendChild(el) {},
      removeChild(el) {}
    }
  };

  globalThis.URL = {
    createObjectURL(blob) {
      assert.equal(blob.type, 'application/x-minecraft-world');
      return 'blob:mock-mcworld-url';
    },
    revokeObjectURL(url) {
      assert.equal(url, 'blob:mock-mcworld-url');
      revoked = true;
    }
  };

  try {
    const res = exportMapToMcWorld({ name: 'Epic Quest' });
    assert.equal(res.filename, 'Epic Quest.mcworld');
    assert.ok(res.size > 200);
    assert.ok(clicked, 'Anchor must have been clicked to trigger download');
    assert.ok(revoked, 'Object URL must have been revoked after download trigger');
    assert.equal(mockElements[0].download, 'Epic Quest.mcworld');
  } finally {
    globalThis.document = originalDocument;
    globalThis.URL = originalUrl;
  }
});

test('mapManager re-exports generateMcWorld and exportMapToMcWorld', () => {
  assert.equal(typeof mapMgrGenerateMcWorld, 'function');
  assert.equal(typeof mapMgrExportMapToMcWorld, 'function');
});

test('buildBedrockPlayerData converts player location, rotation, inventory, and equipment accurately', () => {
  const mapData = {
    player: {
      position: { x: 12.5, y: 70.0, z: -45.25 },
      velocity: { x: 0.1, y: -0.2, z: 0.0 },
      yaw: Math.PI / 2, // 90 degrees
      pitch: -Math.PI / 4, // -45 degrees
      health: 18,
      hunger: 16,
      saturation: 4.5,
      level: 5,
      exp: 0.75
    },
    inventory: {
      activeSlot: 2,
      hotbar: [
        { id: 'diamond_sword', count: 1 },
        null,
        { id: 'iron_pickaxe', count: 1, maxDurability: 250, durability: 200 } // damage 50
      ],
      storage: [
        { id: 'bread', count: 16 }
      ],
      armor: {
        head: { id: 'iron_helmet', count: 1 },
        chest: null,
        legs: { id: 'diamond_leggings', count: 1 },
        feet: null
      },
      offhand: { id: 'shield', count: 1 }
    }
  };

  const playerData = buildBedrockPlayerData(mapData);

  // Position and motion
  assert.equal(playerData.Pos[0], 12.5);
  assert.equal(playerData.Pos[1], 70.0);
  assert.equal(playerData.Pos[2], -45.25);
  assert.equal(playerData.Motion[0], 0.1);
  assert.equal(playerData.Motion[1], -0.2);

  // Angles in degrees
  assert.equal(Math.round(playerData.Rotation[0]), 90);
  assert.equal(Math.round(playerData.Rotation[1]), -45);

  // Status
  assert.equal(playerData.Health, 18);
  assert.equal(playerData.foodLevel, 16);
  assert.equal(playerData.PlayerLevel, 5);
  assert.equal(playerData.SelectedItemSlot, 2);

  // Hotbar items
  const sword = playerData.Inventory.find(i => i.Slot === 0);
  assert.ok(sword);
  assert.equal(sword.Name, 'minecraft:diamond_sword');
  assert.equal(sword.Count, 1);
  assert.equal(sword.Damage, 0);

  const pickaxe = playerData.Inventory.find(i => i.Slot === 2);
  assert.ok(pickaxe);
  assert.equal(pickaxe.Name, 'minecraft:iron_pickaxe');
  assert.equal(pickaxe.Damage, 50);

  // Storage item in slot 9 (first storage slot)
  const bread = playerData.Inventory.find(i => i.Slot === 9);
  assert.ok(bread);
  assert.equal(bread.Name, 'minecraft:bread');
  assert.equal(bread.Count, 16);

  // Offhand in slot 40
  const offhand = playerData.Inventory.find(i => i.Slot === 40);
  assert.ok(offhand);
  assert.equal(offhand.Name, 'minecraft:shield');

  // Armor slots: 0 = head, 1 = chest, 2 = legs, 3 = feet
  assert.equal(playerData.Armor[0].Name, 'minecraft:iron_helmet');
  assert.equal(playerData.Armor[0].Count, 1);
  assert.equal(playerData.Armor[1].Name, '');
  assert.equal(playerData.Armor[1].Count, 0);
  assert.equal(playerData.Armor[2].Name, 'minecraft:diamond_leggings');
  assert.equal(playerData.Armor[2].Count, 1);
  assert.equal(playerData.Armor[3].Name, '');
  assert.equal(playerData.Armor[3].Count, 0);
});

test('buildLevelDbFiles encodes valid LevelDB ~local_player log record when mapData is provided', () => {
  const mapData = {
    player: {
      position: { x: 34.0, y: 64.0, z: -12.0 },
      yaw: 0,
      pitch: 0,
      health: 20
    },
    inventory: {
      activeSlot: 0,
      hotbar: [{ id: 'golden_apple', count: 5 }],
      storage: [],
      armor: {}
    }
  };

  const { log } = buildLevelDbFiles(mapData);
  assert.ok(log.length > 50, '000002.log must contain WriteBatch record with ~local_player');

  // Check LevelDB WAL record header: [4-byte CRC][2-byte len][1-byte type=1]
  const lv = new DataView(log.buffer, log.byteOffset, log.byteLength);
  const recLen = lv.getUint16(4, true);
  const recType = lv.getUint8(6);
  assert.equal(recType, 1, 'WAL record type must be kFullType (1)');
  assert.equal(recLen, log.length - 7, 'Payload length matches WAL record size');

  // Check WriteBatch contents
  const batch = log.subarray(7);
  const bv = new DataView(batch.buffer, batch.byteOffset, batch.byteLength);
  const seq = bv.getBigUint64(0, true);
  const count = bv.getUint32(8, true);
  assert.equal(seq, 1n);
  assert.equal(count, 1);
  assert.equal(batch[12], 1, 'Operation is kTypeValue');

  const keyLen = batch[13];
  assert.equal(keyLen, 13);
  const key = new TextDecoder().decode(batch.subarray(14, 14 + keyLen));
  assert.equal(key, '~local_player');

  // Parse player NBT from WAL payload
  const valOffset = 14 + keyLen + 2; // keyLen + 2-byte varint valLen
  const playerNbtBytes = batch.subarray(valOffset);
  const nbt = readNbt(playerNbtBytes, { littleEndian: true });

  assert.equal(nbt.Pos[0], 34.0);
  assert.equal(nbt.Pos[1], 64.0);
  assert.equal(nbt.Pos[2], -12.0);
  assert.equal(nbt.Inventory[0].Name, 'minecraft:golden_apple');
  assert.equal(nbt.Inventory[0].Count, 5);
});

test('Exporting real save World_2026-10-08_iron_player preserves position, rotation, hotbar, storage, and equipped armor in both level.dat and db/000002.log', () => {
  const savePath = path.resolve(process.cwd(), 'saves/World_2026-10-08_iron_player.json');
  assert.ok(fs.existsSync(savePath), 'User saved map file must exist');

  const mapData = JSON.parse(fs.readFileSync(savePath, 'utf8'));
  const mcworldBytes = generateMcWorld(mapData);

  // Extract level.dat and db/000002.log from zip
  let eocdOffset = -1;
  for (let i = mcworldBytes.length - 22; i >= 0; i--) {
    if (
      mcworldBytes[i] === 0x50 &&
      mcworldBytes[i + 1] === 0x4b &&
      mcworldBytes[i + 2] === 0x05 &&
      mcworldBytes[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }
  const eocdView = new DataView(mcworldBytes.buffer, mcworldBytes.byteOffset + eocdOffset, 22);
  const totalEntries = eocdView.getUint16(10, true);
  const centralDirOffset = eocdView.getUint32(16, true);

  const filesFound = new Map();
  let cdPos = centralDirOffset;
  for (let i = 0; i < totalEntries; i++) {
    const cv = new DataView(mcworldBytes.buffer, mcworldBytes.byteOffset + cdPos, 46);
    const uncompSize = cv.getUint32(24, true);
    const nameLen = cv.getUint16(28, true);
    const extraLen = cv.getUint16(30, true);
    const commentLen = cv.getUint16(32, true);
    const localHeaderOffset = cv.getUint32(42, true);

    const nameBytes = mcworldBytes.subarray(cdPos + 46, cdPos + 46 + nameLen);
    const fileName = new TextDecoder().decode(nameBytes);

    const lv = new DataView(mcworldBytes.buffer, mcworldBytes.byteOffset + localHeaderOffset, 30);
    const localNameLen = lv.getUint16(26, true);
    const localExtraLen = lv.getUint16(28, true);
    const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const data = mcworldBytes.subarray(dataOffset, dataOffset + uncompSize);

    filesFound.set(fileName, data);
    cdPos += 46 + nameLen + extraLen + commentLen;
  }

  // 1. Verify Player in level.dat
  const levelDat = filesFound.get('level.dat');
  assert.ok(levelDat && levelDat.length > 8);
  const levelNbt = readNbt(levelDat.slice(8), { littleEndian: true });
  assert.ok(levelNbt.Player, 'level.dat must contain Player compound');

  const p = levelNbt.Player;
  // Position from World_2026-10-08_iron_player: { x: 6.67, y: 27, z: 7.614 }
  assert.ok(Math.abs(p.Pos[0] - 6.67) < 0.01, 'Player X must match saved map position');
  assert.equal(p.Pos[1], 27, 'Player Y must match saved map position');
  assert.ok(Math.abs(p.Pos[2] - 7.614) < 0.01, 'Player Z must match saved map position');

  // SpawnX/Y/Z should also match
  assert.equal(levelNbt.SpawnX, 7);
  assert.equal(levelNbt.SpawnY, 27);
  assert.equal(levelNbt.SpawnZ, 8);

  // Active slot from save: 6
  assert.equal(p.SelectedItemSlot, 6);

  // Damaged stone pickaxe in hotbar slot 4 with durability wear 131 - 114 = 17
  const pickaxe = p.Inventory.find(item => item.Slot === 4);
  assert.ok(pickaxe, 'Hotbar slot 4 must contain stone pickaxe');
  assert.equal(pickaxe.Name, 'minecraft:stone_pickaxe');
  assert.equal(pickaxe.Damage, 17, 'Durability damage must be preserved');
  assert.equal(pickaxe.Count, 1);

  // Iron sword in hotbar slot 6
  const sword = p.Inventory.find(item => item.Slot === 6);
  assert.ok(sword, 'Hotbar slot 6 must contain iron sword');
  assert.equal(sword.Name, 'minecraft:iron_sword');
  assert.equal(sword.Count, 1);

  // Sticks in storage slot 21 (Bedrock slot 21 + 9 = 30)
  const sticks = p.Inventory.find(item => item.Slot === 30);
  assert.ok(sticks, 'Storage must contain sticks at slot 30');
  assert.equal(sticks.Name, 'minecraft:stick');
  assert.equal(sticks.Count, 2);

  // Equipped iron chestplate in armor slot 1
  assert.equal(p.Armor[1].Name, 'minecraft:iron_chestplate', 'Armor slot 1 must be iron chestplate');
  assert.equal(p.Armor[1].Count, 1);

  // 2. Verify ~local_player in db/000002.log
  const logData = filesFound.get('db/000002.log');
  assert.ok(logData && logData.length > 50, 'db/000002.log must contain WAL record');
  const logStr = new TextDecoder().decode(logData);
  assert.ok(logStr.includes('~local_player'));
  assert.ok(logStr.includes('minecraft:iron_chestplate'));
  assert.ok(logStr.includes('minecraft:stone_pickaxe'));
});

