// MCWORLD Exporter for Minecraft Bedrock Edition
//
// Converts in-browser saved world data into an official Minecraft Bedrock .mcworld package.
// A .mcworld file is a zip archive with:
//   - levelname.txt: the plain-text world name
//   - level.dat: 8-byte Bedrock header ([StorageVersion=10][NBT length]) + Little-Endian uncompressed NBT
//   - level.dat_old: backup copy of level.dat
//   - world_behavior_packs.json & world_resource_packs.json: empty pack configurations
//   - db/: valid LevelDB storage directory with CURRENT, MANIFEST-000001, and 000002.log

import { writeNbt, TagType } from './nbt.js';

// --- CRC32 (IEEE 802.3) for standard ZIP files ---
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC32_TABLE[i] = c >>> 0;
}

export function crc32(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new TextEncoder().encode(String(buffer));
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC32_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// --- CRC32C (Castagnoli 0x82F63B78) for LevelDB manifest logs ---
const CRC32C_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0x82F63B78 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC32C_TABLE[i] = c >>> 0;
}

export function crc32c(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new TextEncoder().encode(String(buffer));
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC32C_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export function maskCrc32c(crc) {
  return ((((crc >>> 15) | (crc << 17)) + 0xa282ead8) >>> 0);
}

/**
 * Creates a standard ZIP archive from a list of files without external dependencies.
 * Uses Store method (compression 0) for reliability and speed.
 *
 * @param {Array<{path: string, data: Uint8Array|string}>} files
 * @returns {Uint8Array}
 */
export function createZipArchive(files) {
  const localEntries = [];
  const centralEntries = [];
  let currentOffset = 0;

  // Fixed DOS timestamp: 2026-01-01 12:00:00
  const dosTime = (12 << 11) | (0 << 5) | (0 >> 1);
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.path.replace(/\\/g, '/'));
    const dataBytes = file.data instanceof Uint8Array
      ? file.data
      : new TextEncoder().encode(String(file.data));
    const fileCrc = crc32(dataBytes);
    const localHeaderOffset = currentOffset;

    // Local file header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true);         // Version needed (2.0)
    lv.setUint16(6, 0x0800, true);     // General purpose flag: UTF-8 filename (bit 11)
    lv.setUint16(8, 0, true);          // Compression method: Store (0)
    lv.setUint16(10, dosTime, true);   // Last mod file time
    lv.setUint16(12, dosDate, true);   // Last mod file date
    lv.setUint32(14, fileCrc, true);   // CRC-32
    lv.setUint32(18, dataBytes.length, true); // Compressed size
    lv.setUint32(22, dataBytes.length, true); // Uncompressed size
    lv.setUint16(26, nameBytes.length, true); // File name length
    lv.setUint16(28, 0, true);         // Extra field length
    localHeader.set(nameBytes, 30);

    localEntries.push(localHeader, dataBytes);
    currentOffset += localHeader.length + dataBytes.length;

    // Central directory header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central directory file header signature
    cv.setUint16(4, 0x0014, true);     // Version made by: DOS / 2.0
    cv.setUint16(6, 20, true);         // Version needed: 2.0
    cv.setUint16(8, 0x0800, true);     // Flags: UTF-8
    cv.setUint16(10, 0, true);         // Compression method: Store
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, fileCrc, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);         // Extra field length
    cv.setUint16(32, 0, true);         // Comment length
    cv.setUint16(34, 0, true);         // Disk number start
    cv.setUint16(36, 0, true);         // Internal attributes
    cv.setUint32(38, 0, true);         // External attributes
    cv.setUint32(42, localHeaderOffset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralEntries.push(centralHeader);
  }

  const centralDirectoryOffset = currentOffset;
  const centralDirectorySize = centralEntries.reduce((sum, entry) => sum + entry.length, 0);

  // End of central directory record (EOCD, 22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // EOCD signature
  ev.setUint16(4, 0, true);          // Disk number
  ev.setUint16(6, 0, true);          // Start disk
  ev.setUint16(8, files.length, true);  // Entries on this disk
  ev.setUint16(10, files.length, true); // Total entries
  ev.setUint32(12, centralDirectorySize, true);
  ev.setUint32(16, centralDirectoryOffset, true);
  ev.setUint16(20, 0, true);         // Comment length

  const totalLength = currentOffset + centralDirectorySize + eocd.length;
  const out = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of localEntries) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  for (const chunk of centralEntries) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  out.set(eocd, pos);

  return out;
}

/**
 * Builds the Bedrock LevelDB metadata files:
 *  - CURRENT: points to MANIFEST-000001
 *  - MANIFEST-000001: log record with comparator "leveldb.BytewiseComparator"
 *  - 000002.log: empty log
 */
export function buildLevelDbFiles() {
  const current = new TextEncoder().encode('MANIFEST-000001\n');

  // MANIFEST-000001 VersionEdit record:
  // Tag 1 (comparator): name "leveldb.BytewiseComparator"
  // Tag 2 (log_number): 2
  // Tag 3 (next_file_number): 3
  // Tag 4 (last_sequence): 0
  const comparatorName = new TextEncoder().encode('leveldb.BytewiseComparator');
  const payloadLen = 1 + 1 + comparatorName.length + 2 + 2 + 2; // 34 bytes
  const payload = new Uint8Array(payloadLen);
  let p = 0;
  payload[p++] = 1; // kComparator
  payload[p++] = comparatorName.length; // varint length 26
  payload.set(comparatorName, p);
  p += comparatorName.length;
  payload[p++] = 2; // kLogNumber
  payload[p++] = 2; // varint 2
  payload[p++] = 3; // kNextFileNumber
  payload[p++] = 3; // varint 3
  payload[p++] = 4; // kLastSequence
  payload[p++] = 0; // varint 0

  // Record structure: [4-byte masked CRC32C][2-byte uint16 length LE][1-byte type=1][payload]
  const recordHeaderAndPayload = new Uint8Array(1 + payload.length);
  recordHeaderAndPayload[0] = 1; // kFullType (0x01)
  recordHeaderAndPayload.set(payload, 1);

  const maskedCrc = maskCrc32c(crc32c(recordHeaderAndPayload));

  const manifest = new Uint8Array(7 + payload.length);
  const mv = new DataView(manifest.buffer);
  mv.setUint32(0, maskedCrc, true);
  mv.setUint16(4, payload.length, true);
  mv.setUint8(6, 1); // kFullType
  manifest.set(payload, 7);

  const log = new Uint8Array(0);

  return { current, manifest, log };
}

/**
 * Maps game gamemode string to Minecraft Bedrock GameType integer.
 */
function mapGameType(gamemode) {
  if (gamemode === 'creative') return 1;
  if (gamemode === 'adventure') return 2;
  return 0; // survival
}

/**
 * Maps game difficulty string to Bedrock Difficulty integer.
 */
function mapDifficulty(difficulty) {
  if (difficulty === 'peaceful') return 0;
  if (difficulty === 'easy') return 1;
  if (difficulty === 'hard') return 3;
  return 2; // normal
}

/**
 * Builds the Bedrock level.dat file buffer.
 * Bedrock format: 4-byte StorageVersion LE (10) + 4-byte NBT length LE + uncompressed Little-Endian NBT.
 *
 * @param {object} mapData
 * @returns {Uint8Array}
 */
export function buildLevelDat(mapData = {}) {
  const worldName = (mapData.name || 'World').trim() || 'World';
  const player = mapData.player || {};
  const pos = player.position || {};
  const session = mapData.session || {};
  const weather = mapData.weather || {};

  const spawnX = Math.round(Number(pos.x) || 0);
  const spawnY = Math.round(Number(pos.y) || 64);
  const spawnZ = Math.round(Number(pos.z) || 0);

  let seedBigInt = 0n;
  try {
    seedBigInt = BigInt(Math.trunc(Number(mapData.seed) || 0));
  } catch (e) {
    seedBigInt = 0n;
  }

  let timeBigInt = 0n;
  try {
    timeBigInt = BigInt(Math.max(0, Math.trunc(Number(mapData.worldTime) || 0)));
  } catch (e) {
    timeBigInt = 0n;
  }

  const isRaining = Boolean(weather.isRaining);
  const rainLevel = isRaining ? Number(weather.rainIntensity || 1.0) : 0.0;

  const nbtData = {
    LevelName: worldName,
    StorageVersion: 10,
    NetworkVersion: 589,
    Platform: 2,
    GameType: mapGameType(player.gamemode),
    Generator: 1, // 1 = Infinite Overworld
    Difficulty: mapDifficulty(session.difficulty),
    Time: timeBigInt,
    DayCycleStopTime: -1n,
    SpawnX: spawnX,
    SpawnY: spawnY,
    SpawnZ: spawnZ,
    RandomSeed: seedBigInt,
    RainTime: isRaining ? 10000 : 0,
    rainLevel: rainLevel,
    lightningLevel: 0.0,
    lightningTime: 0,
    commandsEnabled: 1,
    hasBeenLoadedInCreative: player.gamemode === 'creative' ? 1 : 0,
    immutableWorld: 0,
    WorldVersion: 1,
    ServerChunkTickRange: 4,
    spawnMobs: 1,
    LastPlayed: BigInt(Math.floor(Date.now() / 1000)),
    experiments: {}
  };

  const types = {
    LevelName: TagType.STRING,
    StorageVersion: TagType.INT,
    NetworkVersion: TagType.INT,
    Platform: TagType.INT,
    GameType: TagType.INT,
    Generator: TagType.INT,
    Difficulty: TagType.INT,
    Time: TagType.LONG,
    DayCycleStopTime: TagType.LONG,
    SpawnX: TagType.INT,
    SpawnY: TagType.INT,
    SpawnZ: TagType.INT,
    RandomSeed: TagType.LONG,
    RainTime: TagType.INT,
    rainLevel: TagType.FLOAT,
    lightningLevel: TagType.FLOAT,
    lightningTime: TagType.INT,
    commandsEnabled: TagType.BYTE,
    hasBeenLoadedInCreative: TagType.BYTE,
    immutableWorld: TagType.BYTE,
    WorldVersion: TagType.INT,
    ServerChunkTickRange: TagType.INT,
    spawnMobs: TagType.BYTE,
    LastPlayed: TagType.LONG,
    experiments: TagType.COMPOUND
  };

  const nbtBytes = writeNbt(nbtData, { littleEndian: true, rootName: '', types });

  // 8-byte Bedrock level.dat header: [StorageVersion uint32 LE = 10][NBT length uint32 LE]
  const levelDat = new Uint8Array(8 + nbtBytes.length);
  const dv = new DataView(levelDat.buffer);
  dv.setUint32(0, 10, true);
  dv.setUint32(4, nbtBytes.length, true);
  levelDat.set(nbtBytes, 8);

  return levelDat;
}

/**
 * Generates an official Minecraft Bedrock .mcworld package as a Uint8Array.
 *
 * @param {object} mapData World map data (from save file or serializeWorld)
 * @returns {Uint8Array}
 */
export function generateMcWorld(mapData = {}) {
  const worldName = (mapData.name || 'World').trim() || 'World';
  const levelDat = buildLevelDat(mapData);
  const { current, manifest, log } = buildLevelDbFiles();

  const files = [
    { path: 'levelname.txt', data: new TextEncoder().encode(worldName) },
    { path: 'level.dat', data: levelDat },
    { path: 'level.dat_old', data: levelDat.slice() },
    { path: 'world_behavior_packs.json', data: new TextEncoder().encode('[]\n') },
    { path: 'world_resource_packs.json', data: new TextEncoder().encode('[]\n') },
    { path: 'db/CURRENT', data: current },
    { path: 'db/MANIFEST-000001', data: manifest },
    { path: 'db/000002.log', data: log }
  ];

  return createZipArchive(files);
}

/**
 * Browser-friendly export function that downloads the .mcworld file.
 *
 * @param {object} mapData
 * @param {string} [customFileName]
 * @returns {{ filename: string, size: number }}
 */
export function exportMapToMcWorld(mapData = {}, customFileName = null) {
  const bytes = generateMcWorld(mapData);
  const baseName = customFileName
    ? customFileName.replace(/\.(json|mcworld)$/i, '')
    : (mapData.name || 'world').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || 'world';
  const filename = `${baseName}.mcworld`;

  if (typeof document !== 'undefined' && typeof URL !== 'undefined') {
    const blob = new Blob([bytes], { type: 'application/x-minecraft-world' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { filename, size: bytes.length };
}
