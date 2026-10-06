// Convert a palette-PNG (colour type 3) or greyscale PNG (type 0) to RGBA, matching every other sheet in the project.
//
// Vanilla ships several entity sheets as PALETTE PNGs, where transparency is an INDEX rather than an alpha channel.
// This project has been bitten by exactly that class before -- the husk rendered black from a bitmap that did not upload
// correctly -- so converting removes the hazard rather than relying on the browser's palette handling.
//
// Usage: node scripts/mob-visual/to-rgba.mjs <path.png>
//        (no argument = the zombie villager, the sheet this was first written for)
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

const path = process.argv[2] ?? 'public/assets/entity/zombie_villager/zombie_villager.png';
const buf = readFileSync(path);

function chunks(data) {
  const out = [];
  let i = 8;
  while (i < data.length) {
    const len = data.readUInt32BE(i);
    out.push({ type: data.toString('ascii', i + 4, i + 8), data: data.subarray(i + 8, i + 8 + len) });
    i += 12 + len;
  }
  return out;
}

const cs = chunks(buf);
const ihdr = cs.find((c) => c.type === 'IHDR').data;
const width = ihdr.readUInt32BE(0);
const height = ihdr.readUInt32BE(4);
const depth = ihdr[8];
const colour = ihdr[9];

console.log(`  ${path}`);
if (colour === 6 || colour === 2) {
  console.log(`    colour type ${colour}: already truecolour, nothing to do`);
  process.exit(0);
}
if (colour !== 3 || ![1, 2, 4, 8].includes(depth)) {
  console.log(`    unsupported: colour ${colour}, depth ${depth}`);
  process.exit(1);
}

const plte = cs.find((c) => c.type === 'PLTE').data;
const trns = cs.find((c) => c.type === 'tRNS')?.data;
const idat = Buffer.concat(cs.filter((c) => c.type === 'IDAT').map((c) => c.data));

const palette = [];
for (let i = 0; i < plte.length; i += 3) {
  const index = i / 3;
  palette.push([plte[i], plte[i + 1], plte[i + 2], trns && index < trns.length ? trns[index] : 255]);
}
console.log(`    ${width}x${height}, colour type ${colour}, ${palette.length} palette entries`);

// --- unfilter -----------------------------------------------------------------------------------------
// At depths below 8 the scanlines are BIT-PACKED: 8/depth pixels share each byte, and the packing is per scanline.
// The filter's byte-level arithmetic still runs on the packed bytes, so unfiltering happens first and the indices are
// unpacked afterwards.
const raw = inflateSync(idat);
const bpp = 1;
const packedStride = Math.ceil((width * depth) / 8);
const scanned = Buffer.alloc(height * packedStride);
let pos = 0;
for (let y = 0; y < height; y++) {
  const filter = raw[pos++];
  const line = raw.subarray(pos, pos + packedStride);
  pos += packedStride;
  const prev = y > 0 ? scanned.subarray((y - 1) * packedStride, y * packedStride) : Buffer.alloc(packedStride);
  const cur = scanned.subarray(y * packedStride, (y + 1) * packedStride);
  for (let x = 0; x < packedStride; x++) {
    const a = x >= bpp ? cur[x - bpp] : 0;
    const b = prev[x];
    const c = x >= bpp ? prev[x - bpp] : 0;
    let v = line[x];
    if (filter === 1) v += a;
    else if (filter === 2) v += b;
    else if (filter === 3) v += (a + b) >> 1;
    else if (filter === 4) {
      const p = a + b - c;
      const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
      v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
    }
    cur[x] = v & 0xff;
  }
}

/** One palette index per pixel, unpacking the packed bit depth. */
const indices = new Uint8Array(width * height);
const perByte = 8 / depth;
const mask = (1 << depth) - 1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const byte = scanned[y * packedStride + Math.floor(x / perByte)];
    const shift = 8 - depth * ((x % perByte) + 1);
    indices[y * width + x] = (byte >> shift) & mask;
  }
}
const stride = width;

// --- expand to RGBA -----------------------------------------------------------------------------------
const rgba = Buffer.alloc(height * (1 + width * 4));
for (let y = 0; y < height; y++) {
  const rowStart = y * (1 + width * 4);
  rgba[rowStart] = 0;
  for (let x = 0; x < width; x++) {
    const [r, g, b, a] = palette[indices[y * stride + x]];
    const o = rowStart + 1 + x * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a;
  }
}

// --- write --------------------------------------------------------------------------------------------
function crc32(data) {
  let c = ~0;
  for (const byte of data) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

const newIhdr = Buffer.alloc(13);
newIhdr.writeUInt32BE(width, 0);
newIhdr.writeUInt32BE(height, 4);
newIhdr[8] = 8; newIhdr[9] = 6; newIhdr[10] = 0; newIhdr[11] = 0; newIhdr[12] = 0;

writeFileSync(path, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', newIhdr),
  chunk('IDAT', deflateSync(rgba, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]));
const check = readFileSync(path);
console.log(`    wrote ${check.length} bytes, colour type ${check[25]}`);
