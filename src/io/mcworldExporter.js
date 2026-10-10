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
import { BLOCKS } from '../blocks.js';
import { maxDurabilityFor } from '../durability.js';

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

export const BEDROCK_PLAYER_TYPES = {
  Pos: TagType.LIST,
  'Pos[0]': TagType.FLOAT,
  Motion: TagType.LIST,
  'Motion[0]': TagType.FLOAT,
  Rotation: TagType.LIST,
  'Rotation[0]': TagType.FLOAT,
  FallDistance: TagType.FLOAT,
  Fire: TagType.SHORT,
  Air: TagType.SHORT,
  OnGround: TagType.BYTE,
  Invulnerable: TagType.BYTE,
  Dead: TagType.BYTE,
  PortalCooldown: TagType.INT,
  DimensionId: TagType.INT,
  Sleeping: TagType.BYTE,
  SleepTimer: TagType.SHORT,
  SpawnX: TagType.INT,
  SpawnY: TagType.INT,
  SpawnZ: TagType.INT,
  SpawnForced: TagType.BYTE,
  Health: TagType.SHORT,
  AbsorptionAmount: TagType.FLOAT,
  foodLevel: TagType.INT,
  foodSaturationLevel: TagType.FLOAT,
  foodExhaustionLevel: TagType.FLOAT,
  foodTickTimer: TagType.INT,
  PlayerLevel: TagType.INT,
  PlayerLevelProgress: TagType.FLOAT,
  SelectedItemSlot: TagType.INT,
  SelectedInventorySlot: TagType.INT,
  Inventory: TagType.LIST,
  Armor: TagType.LIST,
  Offhand: TagType.LIST,

  Attributes: TagType.LIST,
  'Attributes[0]': TagType.COMPOUND,
  Base: TagType.FLOAT,
  Current: TagType.FLOAT,
  DefaultMax: TagType.FLOAT,
  DefaultMin: TagType.FLOAT,
  Max: TagType.FLOAT,
  Min: TagType.FLOAT,

  abilities: TagType.COMPOUND,
  walkSpeed: TagType.FLOAT,
  flySpeed: TagType.FLOAT,
  verticalFlySpeed: TagType.FLOAT,
  mayfly: TagType.BYTE,
  flying: TagType.BYTE,
  mine: TagType.BYTE,
  build: TagType.BYTE,
  doorsandswitches: TagType.BYTE,
  opencontainers: TagType.BYTE,
  attackmobs: TagType.BYTE,
  attackplayers: TagType.BYTE,
  instabuild: TagType.BYTE,
  op: TagType.BYTE,
  teleport: TagType.BYTE,
  lightning: TagType.BYTE,

  Slot: TagType.BYTE,
  Count: TagType.BYTE,
  Damage: TagType.SHORT,
  Name: TagType.STRING,
  WasPickedUp: TagType.BYTE
};

const BEDROCK_BLOCK_CACHE = new Map();
BEDROCK_BLOCK_CACHE.set(0, 'minecraft:air');

/**
 * Resolves a voxel ID to its official Minecraft Bedrock string block ID.
 *
 * @param {number|string} blockId
 * @returns {string}
 */
export function getBedrockBlockName(blockId) {
  if (typeof blockId === 'string') {
    let name = blockId.trim().toLowerCase();
    if (!name.startsWith('minecraft:')) name = 'minecraft:' + name;
    if (name === 'minecraft:grass') return 'minecraft:grass_block';
    return name;
  }
  const cached = BEDROCK_BLOCK_CACHE.get(blockId);
  if (cached !== undefined) return cached;

  for (const [key, val] of Object.entries(BLOCKS)) {
    if (val === blockId) {
      let name = key.toLowerCase();
      if (name === 'grass') name = 'grass_block';
      const fullName = 'minecraft:' + name;
      BEDROCK_BLOCK_CACHE.set(blockId, fullName);
      return fullName;
    }
  }
  const fallback = 'minecraft:stone';
  BEDROCK_BLOCK_CACHE.set(blockId, fallback);
  return fallback;
}

/**
 * Encodes an integer into a varint (LEB128).
 *
 * @param {number} value
 * @returns {Uint8Array}
 */
export function encodeVarint(value) {
  const bytes = [];
  let v = Math.max(0, Math.floor(value));
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7f);
  return new Uint8Array(bytes);
}

/**
 * Resolves an in-game item or block stack to its official Minecraft Bedrock string ID.
 *
 * @param {object} item
 * @returns {string}
 */
export function getBedrockItemName(item) {
  if (!item) return '';
  let id = item.id;
  if (typeof id === 'number') {
    for (const [key, val] of Object.entries(BLOCKS)) {
      if (val === id) {
        id = key.toLowerCase();
        break;
      }
    }
  }
  if (typeof id !== 'string') return '';
  id = id.trim().toLowerCase();
  if (id.startsWith('minecraft:')) return id;
  if (id === 'grass') id = 'grass_block';
  return 'minecraft:' + id;
}

/**
 * Computes item durability damage for Bedrock ItemStack NBT (0 = undamaged).
 *
 * @param {object} item
 * @param {string} [itemId]
 * @returns {number}
 */
export function getItemDamage(item, itemId = '') {
  if (typeof item?.damage === 'number') return Math.max(0, Math.round(item.damage));
  if (typeof item?.durability === 'number') {
    const rawId = (typeof item.id === 'string' ? item.id : itemId).replace(/^minecraft:/, '');
    const max = item.maxDurability || maxDurabilityFor(rawId) || item.durability;
    return Math.max(0, Math.round(max - item.durability));
  }
  return 0;
}

const SUBCHUNK_PALETTE_TYPES = {
  name: TagType.STRING,
  states: TagType.COMPOUND,
  version: TagType.INT
};

/**
 * Builds a Bedrock SubChunk version 9 binary payload (16x16x16 blocks).
 *
 * @param {number} subY Subchunk Y index (0..3)
 * @param {Array<string>} blockNames Array of 4096 block names in Bedrock index order: (x << 8) | (z << 4) | y
 * @returns {Uint8Array}
 */
export function buildBedrockSubChunk(subY, blockNames) {
  const paletteMap = new Map();
  const palette = [];
  const indices = new Uint16Array(4096);

  for (let i = 0; i < 4096; i++) {
    const name = blockNames[i] || 'minecraft:air';
    let palIdx = paletteMap.get(name);
    if (palIdx === undefined) {
      palIdx = palette.length;
      paletteMap.set(name, palIdx);
      palette.push(name);
    }
    indices[i] = palIdx;
  }

  const numBlocksInPalette = palette.length;
  let bpb = 0;
  if (numBlocksInPalette > 1) {
    if (numBlocksInPalette <= 2) bpb = 1;
    else if (numBlocksInPalette <= 4) bpb = 2;
    else if (numBlocksInPalette <= 8) bpb = 3;
    else if (numBlocksInPalette <= 16) bpb = 4;
    else if (numBlocksInPalette <= 32) bpb = 5;
    else if (numBlocksInPalette <= 64) bpb = 6;
    else if (numBlocksInPalette <= 256) bpb = 8;
    else bpb = 16;
  }

  let words = [];
  if (bpb > 0) {
    const blocksPerWord = Math.floor(32 / bpb);
    const wordCount = Math.ceil(4096 / blocksPerWord);
    words = new Uint32Array(wordCount);
    let blockIdx = 0;
    for (let w = 0; w < wordCount; w++) {
      let word = 0;
      for (let b = 0; b < blocksPerWord && blockIdx < 4096; b++) {
        word |= (indices[blockIdx++] << (b * bpb)) >>> 0;
      }
      words[w] = word >>> 0;
    }
  }

  const paletteNbtBuffers = [];
  for (const name of palette) {
    const entry = { name, states: {}, version: 18168865 };
    paletteNbtBuffers.push(writeNbt(entry, { littleEndian: true, rootName: '', types: SUBCHUNK_PALETTE_TYPES }));
  }

  const headerLen = 4 + words.length * 4 + 4;
  const totalPaletteLen = paletteNbtBuffers.reduce((acc, b) => acc + b.length, 0);
  const result = new Uint8Array(headerLen + totalPaletteLen);
  const dv = new DataView(result.buffer);

  result[0] = 9; // Subchunk version 9
  result[1] = 1; // 1 storage layer
  result[2] = subY & 0xff; // Subchunk Y index
  result[3] = (bpb << 1) | 0; // Bit 0 = 0 (serialized palette)

  let pos = 4;
  for (let w = 0; w < words.length; w++) {
    dv.setUint32(pos, words[w], true);
    pos += 4;
  }
  dv.setInt32(pos, palette.length, true);
  pos += 4;
  for (const buf of paletteNbtBuffers) {
    result.set(buf, pos);
    pos += buf.length;
  }

  return result;
}

/**
 * Encodes a WriteBatch into LevelDB Write-Ahead Log (WAL) records chunked by 32KB blocks.
 *
 * @param {Uint8Array} writeBatch
 * @returns {Uint8Array}
 */
export function encodeLevelDbLog(writeBatch) {
  const BLOCK_SIZE = 32768;
  const HEADER_SIZE = 7;
  const blocks = [];
  let offset = 0;
  let blockRemaining = BLOCK_SIZE;

  while (offset < writeBatch.length) {
    if (blockRemaining < HEADER_SIZE + 1) {
      if (blockRemaining > 0) {
        blocks.push(new Uint8Array(blockRemaining));
      }
      blockRemaining = BLOCK_SIZE;
    }

    const avail = blockRemaining - HEADER_SIZE;
    const chunkLen = Math.min(avail, writeBatch.length - offset);
    const isFirst = (offset === 0);
    const isLast = (offset + chunkLen === writeBatch.length);

    let recType = 1; // kFullType
    if (isFirst && !isLast) recType = 2; // kFirstType
    else if (!isFirst && !isLast) recType = 3; // kMiddleType
    else if (!isFirst && isLast) recType = 4; // kLastType

    const chunkData = writeBatch.subarray(offset, offset + chunkLen);
    const recHeaderAndPayload = new Uint8Array(1 + chunkLen);
    recHeaderAndPayload[0] = recType;
    recHeaderAndPayload.set(chunkData, 1);
    const maskedCrc = maskCrc32c(crc32c(recHeaderAndPayload));

    const rec = new Uint8Array(7 + chunkLen);
    const rv = new DataView(rec.buffer);
    rv.setUint32(0, maskedCrc, true);
    rv.setUint16(4, chunkLen, true);
    rv.setUint8(6, recType);
    rec.set(chunkData, 7);

    blocks.push(rec);
    offset += chunkLen;
    blockRemaining -= (7 + chunkLen);
  }

  const totalLen = blocks.reduce((acc, b) => acc + b.length, 0);
  const out = new Uint8Array(totalLen);
  let p = 0;
  for (const b of blocks) {
    out.set(b, p);
    p += b.length;
  }
  return out;
}

/**
 * Builds the Bedrock player entity NBT compound from save map data.
 *
 * @param {object} mapData
 * @returns {object}
 */
export function buildBedrockPlayerData(mapData = {}) {
  const player = mapData.player || {};
  const inventory = mapData.inventory || {};
  const pos = player.position || {};
  const vel = player.velocity || {};

  const posX = Number.isFinite(pos.x) ? Number(pos.x) : 0.0;
  const posY = Number.isFinite(pos.y) ? Number(pos.y) : 64.0;
  const posZ = Number.isFinite(pos.z) ? Number(pos.z) : 0.0;

  const velX = Number.isFinite(vel.x) ? Number(vel.x) : 0.0;
  const velY = Number.isFinite(vel.y) ? Number(vel.y) : 0.0;
  const velZ = Number.isFinite(vel.z) ? Number(vel.z) : 0.0;

  // Degrees: Bedrock yaw & pitch are in degrees. Three.js / game stores radians.
  const rawYawDeg = Number.isFinite(player.yaw) ? ((player.yaw * 180) / Math.PI) : 0.0;
  const rawPitchDeg = Number.isFinite(player.pitch) ? ((player.pitch * 180) / Math.PI) : 0.0;
  let yawDeg = rawYawDeg % 360;
  if (yawDeg > 180) yawDeg -= 360;
  if (yawDeg < -180) yawDeg += 360;
  const pitchDeg = Math.max(-90, Math.min(90, rawPitchDeg));

  const spawnX = Math.round(Number(pos.x ?? player.spawnPosition?.x ?? 0));
  const spawnY = Math.round(Number(pos.y ?? player.spawnPosition?.y ?? 64));
  const spawnZ = Math.round(Number(pos.z ?? player.spawnPosition?.z ?? 0));

  const health = Number.isFinite(player.health) ? Math.max(0, Math.round(player.health)) : 20;
  const absorption = Number.isFinite(player.absorption) ? Number(player.absorption) : 0.0;
  const air = Number.isFinite(player.air) ? Math.round(player.air) : 300;
  const level = Number.isFinite(player.level) ? Math.max(0, Math.round(player.level)) : 0;
  const exp = Number.isFinite(player.exp) ? Number(player.exp) : 0.0;

  const hunger = Number.isFinite(player.hunger) ? Math.max(0, Math.round(player.hunger)) : 20;
  const saturation = Number.isFinite(player.saturation) ? Number(player.saturation) : 5.0;
  const exhaustion = Number.isFinite(player.exhaustion) ? Number(player.exhaustion) : 0.0;

  const activeSlot = Number.isFinite(inventory.activeSlot)
    ? Math.max(0, Math.min(8, Math.round(inventory.activeSlot)))
    : 0;

  const items = [];

  // Hotbar: slots 0..8
  const hotbar = Array.isArray(inventory.hotbar) ? inventory.hotbar : [];
  for (let i = 0; i < Math.min(9, hotbar.length); i++) {
    const item = hotbar[i];
    if (!item) continue;
    const name = getBedrockItemName(item);
    if (!name) continue;
    const count = Math.max(1, Math.min(127, Math.round(item.count || 1)));
    const damage = getItemDamage(item, name);
    items.push({
      Slot: i,
      Count: count,
      Damage: damage,
      Name: name,
      WasPickedUp: 0
    });
  }

  // Storage: slots 9..35 in Bedrock
  const storage = Array.isArray(inventory.storage) ? inventory.storage : [];
  for (let i = 0; i < Math.min(27, storage.length); i++) {
    const item = storage[i];
    if (!item) continue;
    const name = getBedrockItemName(item);
    if (!name) continue;
    const count = Math.max(1, Math.min(127, Math.round(item.count || 1)));
    const damage = getItemDamage(item, name);
    items.push({
      Slot: i + 9,
      Count: count,
      Damage: damage,
      Name: name,
      WasPickedUp: 0
    });
  }

  // Offhand in inventory: slot 40
  const offhand = inventory.offhand;
  if (offhand) {
    const name = getBedrockItemName(offhand);
    if (name) {
      const count = Math.max(1, Math.min(127, Math.round(offhand.count || 1)));
      const damage = getItemDamage(offhand, name);
      items.push({
        Slot: 40,
        Count: count,
        Damage: damage,
        Name: name,
        WasPickedUp: 0
      });
    }
  }

  // Armor: 4 slots: 0 = head, 1 = chest, 2 = legs, 3 = feet
  const armorObj = inventory.armor || {};
  const armorSlots = [armorObj.head, armorObj.chest, armorObj.legs, armorObj.feet];
  const armor = armorSlots.map(it => {
    if (!it) return { Count: 0, Damage: 0, Name: '', WasPickedUp: 0 };
    const name = getBedrockItemName(it);
    if (!name) return { Count: 0, Damage: 0, Name: '', WasPickedUp: 0 };
    const count = Math.max(1, Math.min(127, Math.round(it.count || 1)));
    const damage = getItemDamage(it, name);
    return {
      Count: count,
      Damage: damage,
      Name: name,
      WasPickedUp: 0
    };
  });

  const offhandList = [
    offhand
      ? {
          Count: Math.max(1, Math.min(127, Math.round(offhand.count || 1))),
          Damage: getItemDamage(offhand, getBedrockItemName(offhand)),
          Name: getBedrockItemName(offhand) || '',
          WasPickedUp: 0
        }
      : { Count: 0, Damage: 0, Name: '', WasPickedUp: 0 }
  ];

  const isCreative = player.gamemode === 'creative';
  const abilities = {
    attackmobs: 1,
    attackplayers: 1,
    build: 1,
    doorsandswitches: 1,
    flySpeed: 0.05,
    flying: 0,
    instabuild: isCreative ? 1 : 0,
    invulnerable: isCreative ? 1 : 0,
    lightning: 0,
    mayfly: isCreative ? 1 : 0,
    mine: 1,
    op: 1,
    opencontainers: 1,
    teleport: 1,
    verticalFlySpeed: 1.0,
    walkSpeed: 0.1
  };

  const attributes = [
    {
      Base: 0.1,
      Current: 0.1,
      DefaultMax: 3.4028234663852886e+38,
      DefaultMin: 0.0,
      Max: 3.4028234663852886e+38,
      Min: 0.0,
      Name: 'minecraft:movement'
    },
    {
      Base: 0.02,
      Current: 0.02,
      DefaultMax: 3.4028234663852886e+38,
      DefaultMin: 0.0,
      Max: 3.4028234663852886e+38,
      Min: 0.0,
      Name: 'minecraft:underwater_movement'
    },
    {
      Base: 0.02,
      Current: 0.02,
      DefaultMax: 3.4028234663852886e+38,
      DefaultMin: 0.0,
      Max: 3.4028234663852886e+38,
      Min: 0.0,
      Name: 'minecraft:lava_movement'
    },
    {
      Base: 20.0,
      Current: Number(health),
      DefaultMax: 20.0,
      DefaultMin: 0.0,
      Max: 20.0,
      Min: 0.0,
      Name: 'minecraft:health'
    },
    {
      Base: 20.0,
      Current: Number(hunger),
      DefaultMax: 20.0,
      DefaultMin: 0.0,
      Max: 20.0,
      Min: 0.0,
      Name: 'minecraft:player.hunger'
    },
    {
      Base: 5.0,
      Current: Number(saturation),
      DefaultMax: 20.0,
      DefaultMin: 0.0,
      Max: 20.0,
      Min: 0.0,
      Name: 'minecraft:player.saturation'
    },
    {
      Base: 0.0,
      Current: Number(exhaustion),
      DefaultMax: 5.0,
      DefaultMin: 0.0,
      Max: 5.0,
      Min: 0.0,
      Name: 'minecraft:player.exhaustion'
    },
    {
      Base: 0.0,
      Current: Number(level),
      DefaultMax: 24791.0,
      DefaultMin: 0.0,
      Max: 24791.0,
      Min: 0.0,
      Name: 'minecraft:player.level'
    },
    {
      Base: 0.0,
      Current: Number(exp),
      DefaultMax: 1.0,
      DefaultMin: 0.0,
      Max: 1.0,
      Min: 0.0,
      Name: 'minecraft:player.experience'
    },
    {
      Base: 1.0,
      Current: 1.0,
      DefaultMax: 1.0,
      DefaultMin: 1.0,
      Max: 1.0,
      Min: 1.0,
      Name: 'minecraft:attack_damage'
    },
    {
      Base: 16.0,
      Current: 16.0,
      DefaultMax: 2048.0,
      DefaultMin: 0.0,
      Max: 2048.0,
      Min: 0.0,
      Name: 'minecraft:follow_range'
    },
    {
      Base: 0.0,
      Current: 0.0,
      DefaultMax: 1.0,
      DefaultMin: -2.0,
      Max: 1.0,
      Min: -2.0,
      Name: 'minecraft:knockback_resistance'
    },
    {
      Base: 0.0,
      Current: Number(absorption),
      DefaultMax: 16.0,
      DefaultMin: 0.0,
      Max: 16.0,
      Min: 0.0,
      Name: 'minecraft:absorption'
    },
    {
      Base: 0.0,
      Current: 0.0,
      DefaultMax: 1024.0,
      DefaultMin: -1024.0,
      Max: 1024.0,
      Min: -1024.0,
      Name: 'minecraft:luck'
    }
  ];

  return {
    Pos: [posX, posY, posZ],
    Motion: [velX, velY, velZ],
    Rotation: [yawDeg, pitchDeg],
    FallDistance: 0.0,
    Fire: 0,
    Air: air,
    OnGround: 1,
    Invulnerable: isCreative ? 1 : 0,
    Dead: 0,
    PortalCooldown: 0,
    DimensionId: 0,
    Sleeping: 0,
    SleepTimer: 0,
    SpawnX: spawnX,
    SpawnY: spawnY,
    SpawnZ: spawnZ,
    SpawnForced: 0,
    Health: health,
    AbsorptionAmount: absorption,
    foodLevel: hunger,
    foodSaturationLevel: saturation,
    foodExhaustionLevel: exhaustion,
    foodTickTimer: 0,
    PlayerLevel: level,
    PlayerLevelProgress: exp,
    SelectedItemSlot: activeSlot,
    SelectedInventorySlot: activeSlot,
    abilities: abilities,
    Attributes: attributes,
    Inventory: items,
    Armor: armor,
    Offhand: offhandList
  };
}

/**
 * Builds the Bedrock LevelDB metadata files:
 *  - CURRENT: points to MANIFEST-000001
 *  - MANIFEST-000001: log record with comparator "leveldb.BytewiseComparator"
 *  - 000002.log: WriteBatch with ~local_player and SubChunk blocks if mapData provided, empty log otherwise
 *
 * @param {object} [mapData]
 * @returns {{ current: Uint8Array, manifest: Uint8Array, log: Uint8Array }}
 */
export function buildLevelDbFiles(mapData = null) {
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

  let log = new Uint8Array(0);

  const batchEntries = [];

  // 1. If player or inventory data is provided, write ~local_player
  if (mapData && (mapData.player || mapData.inventory)) {
    const playerNbt = buildBedrockPlayerData(mapData);
    const playerNbtBytes = writeNbt(playerNbt, {
      littleEndian: true,
      rootName: '',
      types: BEDROCK_PLAYER_TYPES
    });
    batchEntries.push({
      key: new TextEncoder().encode('~local_player'),
      val: playerNbtBytes
    });
  }

  // 2. If chunk data is provided, write SubChunk records and version tags
  if (mapData && mapData.chunks) {
    const chunks = Array.isArray(mapData.chunks)
      ? mapData.chunks
      : Object.values(mapData.chunks);

    const chunkVoxels = new Uint16Array(16 * 64 * 16);

    for (const c of chunks) {
      if (!c || c.cx === undefined || c.cz === undefined || !c.voxels) continue;
      const cx = c.cx;
      const cz = c.cz;

      // Decode voxels RLE
      if (Array.isArray(c.voxels)) {
        let idx = 0;
        for (let i = 0; i < c.voxels.length; i += 2) {
          const val = c.voxels[i];
          const cnt = c.voxels[i + 1];
          chunkVoxels.fill(val, idx, idx + cnt);
          idx += cnt;
        }
      } else if (c.voxels instanceof Uint8Array || c.voxels instanceof Uint16Array) {
        chunkVoxels.set(c.voxels);
      } else {
        continue;
      }

      let hasAnyBlocks = false;
      // 4 subchunks for 64-block height (subY = 0..3)
      for (let subY = 0; subY < 4; subY++) {
        const subBlocks = new Array(4096);
        let hasNonAir = false;
        let bIdx = 0;
        for (let x = 0; x < 16; x++) {
          for (let z = 0; z < 16; z++) {
            for (let y = 0; y < 16; y++) {
              const worldY = subY * 16 + y;
              const v = chunkVoxels[(worldY * 16 + z) * 16 + x];
              if (v !== 0) hasNonAir = true;
              subBlocks[bIdx++] = getBedrockBlockName(v);
            }
          }
        }
        if (hasNonAir || subY === 0) {
          hasAnyBlocks = true;
          const subKey = new Uint8Array(10);
          const skv = new DataView(subKey.buffer);
          skv.setInt32(0, cx, true);
          skv.setInt32(4, cz, true);
          subKey[8] = 0x2F; // Tag 47: SubChunkBlocks
          subKey[9] = subY & 0xFF;

          const subVal = buildBedrockSubChunk(subY, subBlocks);
          batchEntries.push({ key: subKey, val: subVal });
        }
      }

      if (hasAnyBlocks) {
        // Tag 44: Version = 42
        const verKey = new Uint8Array(9);
        const vkv = new DataView(verKey.buffer);
        vkv.setInt32(0, cx, true);
        vkv.setInt32(4, cz, true);
        verKey[8] = 0x2C;
        batchEntries.push({ key: verKey, val: new Uint8Array([42]) });

        // Tag 54: ChunkVersion = 2
        const cVerKey = new Uint8Array(9);
        const cvkv = new DataView(cVerKey.buffer);
        cvkv.setInt32(0, cx, true);
        cvkv.setInt32(4, cz, true);
        cVerKey[8] = 0x36;
        batchEntries.push({ key: cVerKey, val: new Uint8Array([2, 0, 0, 0]) });
      }
    }
  }

  // If there are batch entries, encode into LevelDB WAL WriteBatch
  if (batchEntries.length > 0) {
    let totalBatchSize = 12; // 8 bytes seq + 4 bytes count
    const encodedEntries = [];

    for (const entry of batchEntries) {
      const kLenVarint = encodeVarint(entry.key.length);
      const vLenVarint = encodeVarint(entry.val.length);
      const opLen = 1 + kLenVarint.length + entry.key.length + vLenVarint.length + entry.val.length;
      totalBatchSize += opLen;
      encodedEntries.push({ entry, kLenVarint, vLenVarint });
    }

    const writeBatch = new Uint8Array(totalBatchSize);
    const bv = new DataView(writeBatch.buffer);
    bv.setBigUint64(0, 1n, true);
    bv.setUint32(8, batchEntries.length, true);

    let bPos = 12;
    for (const { entry, kLenVarint, vLenVarint } of encodedEntries) {
      writeBatch[bPos++] = 1; // kTypeValue
      writeBatch.set(kLenVarint, bPos);
      bPos += kLenVarint.length;
      writeBatch.set(entry.key, bPos);
      bPos += entry.key.length;
      writeBatch.set(vLenVarint, bPos);
      bPos += vLenVarint.length;
      writeBatch.set(entry.val, bPos);
      bPos += entry.val.length;
    }

    log = encodeLevelDbLog(writeBatch);
  }

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

  const spawnX = Math.round(Number(pos.x ?? player.spawnPosition?.x ?? 0));
  const spawnY = Math.round(Number(pos.y ?? player.spawnPosition?.y ?? 64));
  const spawnZ = Math.round(Number(pos.z ?? player.spawnPosition?.z ?? 0));

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

  const playerNbt = buildBedrockPlayerData(mapData);

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
    LimitedWorldOriginX: spawnX,
    LimitedWorldOriginY: spawnY,
    LimitedWorldOriginZ: spawnZ,
    RandomSeed: seedBigInt,
    RainTime: isRaining ? 10000 : 0,
    rainLevel: rainLevel,
    lightningLevel: 0.0,
    lightningTime: 0,
    commandsEnabled: 1,
    keepinventory: 1,
    hasBeenLoadedInCreative: player.gamemode === 'creative' ? 1 : 0,
    immutableWorld: 0,
    WorldVersion: 1,
    ServerChunkTickRange: 4,
    spawnMobs: 1,
    LastPlayed: BigInt(Math.floor(Date.now() / 1000)),
    experiments: {},
    Player: playerNbt
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
    LimitedWorldOriginX: TagType.INT,
    LimitedWorldOriginY: TagType.INT,
    LimitedWorldOriginZ: TagType.INT,
    RandomSeed: TagType.LONG,
    RainTime: TagType.INT,
    rainLevel: TagType.FLOAT,
    lightningLevel: TagType.FLOAT,
    lightningTime: TagType.INT,
    commandsEnabled: TagType.BYTE,
    keepinventory: TagType.BYTE,
    hasBeenLoadedInCreative: TagType.BYTE,
    immutableWorld: TagType.BYTE,
    WorldVersion: TagType.INT,
    ServerChunkTickRange: TagType.INT,
    spawnMobs: TagType.BYTE,
    LastPlayed: TagType.LONG,
    experiments: TagType.COMPOUND,
    Player: TagType.COMPOUND,
    ...BEDROCK_PLAYER_TYPES
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
  const { current, manifest, log } = buildLevelDbFiles(mapData);

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
