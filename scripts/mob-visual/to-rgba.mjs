// Convert the palette-PNG zombie villager sheet to RGBA, matching every other skin in the project.
//
// The JAR ships `zombie_villager.png` as COLOUR TYPE 3 (palette) while every other entity sheet here is type 6 (RGBA).
// A palette PNG carries transparency as an INDEX, and this project has been bitten by exactly this before -- the husk
// rendered black from a bitmap that never uploaded correctly. Converting to RGBA removes the class of problem rather
// than relying on the browser's palette handling.
//
// Only PNG colour types 3 and 0 need this; 2 and 6 are written straight through.
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

const path = 'public/assets/entity/zombie_villager/zombie_villager.png';
const buf = readFileSync(path);

// --- chunk reader -------------------------------------------------------------------------------------
function chunks(data) {
  const out = [];
  let i = 8;
  while (i < data.length) {
    const len = data.readUInt32BE(i);
    const type = data.toString('ascii', i + 4, i + 8);
    out.push({ type, data: data.subarray(i + 8, i + 8 + len) });
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

if (colour === 6 || colour === 2) { console.log(`  colour type ${colour}: already truecolour, nothing to do`); process.exit(0); }
if (colour !== 3 || depth !== 8) { console.log(`  unsupported: colour ${colour}, depth ${depth}`); process.exit(1); }

const plte = cs.find((c) => c.type === 'PLTE').data;
const trns = cs.find((c) => c.type === 'tRNS')?.data;
const idat = Buffer.concat(cs.filter((c) => c.type === 'IDAT').map((c) => c.data));

const palette = [];
for (let i = 0; i < plte.length; i += 3) {
  palette.push([plte[i], plte[i + 1], plte[i + 2], trns && i / 3 < trns.length ? trns[i / 3] : 255]);
}
console.log(`  palette entries: ${palette.length}`);

// --- unfilter -----------------------------------------------------------------------------------------
const raw = inflateSync(idat);
const bpp = 1;                          // one palette index per pixel
const stride = width * bpp;
const out = Buffer.alloc(height * stride);
let pos = 0;
for (let y = 0; y < height; y++) {
  const filter = raw[pos++];
  const line = raw.subarray(pos, pos + stride);
  pos += stride;
  const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
  const cur = out.subarray(y * stride, (y + 1) * stride);
  for (let x = 0; x < stride; x++) {
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
console.log(`  unfiltered ${width}x${height}`);

// --- expand to RGBA -----------------------------------------------------------------------------------
const rgba = Buffer.alloc(height * (1 + width * 4));
for (let y = 0; y < height; y++) {
  const rowStart = y * (1 + width * 4);
  rgba[rowStart] = 0;                    // filter: none
  for (let x = 0; x < width; x++) {
    const [r, g, b, a] = palette[out[y * stride + x]];
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

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', newIhdr),
  chunk('IDAT', deflateSync(rgba, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

writeFileSync(path, png);
const check = readFileSync(path);
console.log(`  wrote ${check.length} bytes, colour type ${check[25]}`);
