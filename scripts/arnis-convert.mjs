// Convert a Java 1.21 Anvil world into a Blockyland JSON save for local pilots.
// This is a block-only conversion: unsupported blocks and clipped heights are reported.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { readNbt } from '../src/io/nbt.js';
import { BLOCKS } from '../src/blocks.js';
import { encodeVoxelsRLE } from '../src/mapManager.js';

const WIDTH = 16, HEIGHT = 64, VOLUME = WIDTH * WIDTH * HEIGHT;
const substitutions = { light: 'AIR', cave_air: 'AIR', void_air: 'AIR', grass_block: 'GRASS_BLOCK' };

export function blockId(name) {
  const key = name.replace(/^minecraft:/, '');
  const alias = substitutions[key] ?? key.toUpperCase();
  return Number.isInteger(BLOCKS[alias]) ? BLOCKS[alias] : null;
}

// Since Java 1.16 each 64-bit word holds whole palette indices (none straddle words).
export function paletteIndex(data, index, paletteLength) {
  if (paletteLength === 1) return 0;
  const bits = Math.max(4, Math.ceil(Math.log2(paletteLength)));
  const perWord = Math.floor(64 / bits);
  if (!data || data.length <= Math.floor(index / perWord)) throw new Error('Truncated block-state data');
  const word = BigInt.asUintN(64, data[Math.floor(index / perWord)]);
  return Number((word >> BigInt((index % perWord) * bits)) & ((1n << BigInt(bits)) - 1n));
}

export function convertChunks(sourceChunks, { yOffset = 64, name = 'Arnis pilot' } = {}) {
  const chunks = [], structureOrientations = [], missing = {}, clipped = {}, ignored = {};
  const decoded = new Map();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const source of sourceChunks) {
    const cx = source.xPos, cz = source.zPos;
    if (!Number.isInteger(cx) || !Number.isInteger(cz)) throw new Error('Missing chunk coordinates');
    const voxels = new Uint16Array(VOLUME);
    minX = Math.min(minX, cx * WIDTH); maxX = Math.max(maxX, cx * WIDTH + 15);
    minZ = Math.min(minZ, cz * WIDTH); maxZ = Math.max(maxZ, cz * WIDTH + 15);
    for (const section of source.sections ?? []) {
      const states = section.block_states;
      if (!states?.palette?.length) continue;
      const palette = states.palette.map(p => ({ name: p.Name, id: blockId(p.Name), properties: p.Properties ?? {} }));
      for (let i = 0; i < 4096; i++) {
        const entry = palette[paletteIndex(states.data, i, palette.length)];
        if (!entry) throw new Error('Block-state index is outside the palette');
        if (entry.name === 'minecraft:air' || entry.name === 'minecraft:cave_air' || entry.name === 'minecraft:void_air') continue;
        const lx = i & 15, lz = (i >> 4) & 15, y = section.Y * 16 + (i >> 8) + yOffset;
        if (y < 0 || y >= HEIGHT) { clipped[entry.name] = (clipped[entry.name] ?? 0) + 1; continue; }
        if (entry.id === null) { missing[entry.name] = (missing[entry.name] ?? 0) + 1; continue; }
        if (entry.id === BLOCKS.AIR) { ignored[entry.name] = (ignored[entry.name] ?? 0) + 1; continue; }
        voxels[(y * WIDTH + lz) * WIDTH + lx] = entry.id;
        const p = entry.properties;
        if (p.facing || p.half || p.type || p.hinge) {
          structureOrientations.push({ x: cx * 16 + lx, y, z: cz * 16 + lz, id: entry.id,
            name: entry.name.replace(/^minecraft:/, ''), facing: p.facing, half: p.half,
            hinge: p.hinge, slabType: p.type });
        }
      }
    }
    chunks.push({ cx, cz, voxels: encodeVoxelsRLE(voxels) });
    decoded.set(`${cx},${cz}`, voxels);
  }
  if (!chunks.length) throw new Error('No chunks found');
  const x = Math.floor((minX + maxX) / 2), z = Math.floor((minZ + maxZ) / 2);
  const center = decoded.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`);
  let top = 0;
  if (center) for (let y = HEIGHT - 3; y >= 0; y--) {
    if (center[(y * WIDTH + (z & 15)) * WIDTH + (x & 15)] !== BLOCKS.AIR) { top = y; break; }
  }
  const map = { format: 'minecraft-web-map', version: 3, name, worldType: 'generated',
    generationMode: 'authored', seed: 4289, worldTime: 6000, chunks, structureOrientations,
    player: { position: { x: x + 0.5, y: top + 2, z: z + 0.5 }, gamemode: 'creative' },
    mobs: [], attribution: 'Map data © OpenStreetMap contributors, https://www.openstreetmap.org/copyright' };
  return { map, report: { chunks: chunks.length, yOffset, missing, clipped, ignored, blockEntities: sourceChunks.reduce((n, c) => n + (c.block_entities?.length ?? 0), 0) } };
}

export function readRegion(buffer) {
  if (buffer.length < 8192) throw new Error('Anvil region header is incomplete');
  const chunks = [];
  for (let i = 0; i < 1024; i++) {
    const location = buffer.readUInt32BE(i * 4), offset = (location >>> 8) * 4096, sectors = location & 255;
    if (!offset) continue;
    if (!sectors || offset < 8192 || offset + 5 > buffer.length) throw new Error('Invalid Anvil chunk offset');
    const length = buffer.readUInt32BE(offset);
    if (length < 1 || length + 4 > sectors * 4096 || offset + length + 4 > buffer.length) throw new Error('Invalid Anvil chunk length');
    const kind = buffer[offset + 4], data = buffer.subarray(offset + 5, offset + 4 + length);
    const options = { maxOutputLength: 16 * 1024 * 1024 };
    const bytes = kind === 2 ? zlib.inflateSync(data, options) : kind === 1 ? zlib.gunzipSync(data, options) : kind === 3 ? data : null;
    if (!bytes) throw new Error(`Unsupported Anvil compression ${kind}`);
    chunks.push(readNbt(bytes));
  }
  return chunks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [, , worldDir, output, offsetArg] = process.argv;
  if (!worldDir || !output) throw new Error('Usage: node scripts/arnis-convert.mjs <java-world-dir> <output.json> [y-offset]');
  const yOffset = offsetArg === undefined ? 64 : Number(offsetArg);
  if (!Number.isInteger(yOffset)) throw new Error('y-offset must be an integer');
  const regionDir = path.join(worldDir, 'region');
  const regions = fs.readdirSync(regionDir).filter(f => /^r\.-?\d+\.-?\d+\.mca$/.test(f)).sort();
  const all = regions.flatMap(f => readRegion(fs.readFileSync(path.join(regionDir, f))));
  const result = convertChunks(all, { yOffset });
  fs.writeFileSync(output, JSON.stringify(result.map));
  fs.writeFileSync(`${output}.report.json`, JSON.stringify(result.report, null, 2));
  console.log(JSON.stringify(result.report, null, 2));
}
