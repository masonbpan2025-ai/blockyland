// Close the blind spot round ninety-two found: the content check passed 13 CONVERTED stubs.
//
// The old version keyed on the palette, so a palette stub was caught and the SAME image converted to RGBA (colour type 6)
// read as a normal file. That is the exact trap the tool exists to prevent, one level down, so the check now counts
// COLOURED PIXELS for both encodings -- which means decoding the image, not just reading its chunks.
//
// The decoder is the one validated in round eighty-eight against `pufferfish.png`, which it reports with real colour
// (252,229,188 and 191,132,27), so its verdict on a stub can be trusted. It handles 8-bit RGBA (type 6) and palette
// (type 3, depths 1/2/4/8) -- the two encodings this project's assets actually use.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';

const root = process.argv[2] ?? 'public/assets/entity';

/** Read a PNG's chunks. */
function chunks(file) {
  const buf = readFileSync(file);
  const out = { palette: [], trns: null, idat: [], width: 0, height: 0, depth: 0, colorType: 0, interlace: 0 };
  let pos = 8;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString();
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      out.width = data.readUInt32BE(0); out.height = data.readUInt32BE(4);
      out.depth = data[8]; out.colorType = data[9]; out.interlace = data[12];
    } else if (type === 'PLTE') {
      for (let i = 0; i + 2 < data.length; i += 3) out.palette.push([data[i], data[i + 1], data[i + 2]]);
    } else if (type === 'tRNS') out.trns = data;
    else if (type === 'IDAT') out.idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  return out;
}

/** Undo PNG's per-scanline filters. */
function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;
  const rows = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
    const A = (x) => (x >= bpp ? line[x - bpp] : 0);
    const B = (x) => prev[x];
    const C = (x) => (x >= bpp ? prev[x - bpp] : 0);
    for (let x = 0; x < stride; x++) {
      const a = A(x), b = B(x), c = C(x);
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + b) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    rows.push(line); prev = line;
  }
  return rows;
}

/** Count opaque and coloured pixels. Coloured means NOT grey (r === g === b). */
function analyse(file) {
  const c = chunks(file);
  if (c.interlace) return { unsupported: 'interlaced' };

  let bpp, rows, toRgb;
  try {
    if (c.colorType === 6 && c.depth === 8) {
      bpp = 4;
      rows = unfilter(inflateSync(Buffer.concat(c.idat)), c.width, c.height, bpp);
      toRgb = (line, x) => ({ r: line[x * 4], g: line[x * 4 + 1], b: line[x * 4 + 2], a: line[x * 4 + 3] });
    } else if (c.colorType === 3) {
      // Palette: 1, 2, 4 or 8 bits per pixel.
      bpp = 1;
      rows = unfilter(inflateSync(Buffer.concat(c.idat)), c.width, c.height, bpp);
      const perByte = 8 / c.depth;
      const mask = (1 << c.depth) - 1;
      toRgb = (line, x) => {
        const byte = line[Math.floor(x / perByte)];
        const shift = 8 - c.depth * ((x % perByte) + 1);
        const idx = (byte >> shift) & mask;
        const [r, g, b] = c.palette[idx] ?? [0, 0, 0];
        const a = c.trns && idx < c.trns.length ? c.trns[idx] : 255;
        return { r, g, b, a };
      };
    } else return { unsupported: `colourType ${c.colorType} depth ${c.depth}` };
  } catch (e) { return { unsupported: e.message }; }

  let opaque = 0, coloured = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const { r, g, b, a } = toRgb(rows[y], x);
      if (a === 0) continue;
      opaque++;
      if (!(r === g && g === b)) coloured++;
    }
  }
  return { width: c.width, height: c.height, colorType: c.colorType, depth: c.depth, opaque, coloured };
}

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.png')) files.push(full);
  }
})(root);

console.log(`  scanning ${files.length} PNG(s) under ${root}`);
console.log('  a sheet with ZERO coloured pixels cannot draw a mob that is not pure grey\n');

const suspects = [];
const unsupported = [];
for (const f of files) {
  const label = f.replace(/\\/g, '/').replace('public/assets/entity/', '');
  const r = analyse(f);
  if (r.unsupported) { unsupported.push([label, r.unsupported]); continue; }
  if (r.coloured === 0) suspects.push([label, `${r.opaque} opaque, 0 coloured  [${r.width}x${r.height} type ${r.colorType}]`]);
}

console.log(`  ZERO-COLOUR assets (${suspects.length}):`);
for (const [label, why] of suspects) console.log(`    ${label.padEnd(46)} ${why}`);
if (!suspects.length) console.log('    (none)');
if (unsupported.length) {
  console.log(`\n  not decoded (${unsupported.length}):`);
  for (const [label, why] of unsupported) console.log(`    ${label.padEnd(46)} ${why}`);
}
