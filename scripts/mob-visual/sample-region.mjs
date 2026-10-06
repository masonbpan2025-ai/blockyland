// What is ACTUALLY in the region the fish's body UVs sample?
//
// Round eighty-six listed this as the first candidate: the sheet is only 146-206 bytes, so the body region may simply BE
// white or mostly transparent. This reads the pixels and reports the truth, instead of reasoning about it again.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** Decode a PNG enough to report an RGBA pixel grid. Handles colour type 6 and 2, both 8-bit. */
function readPixels(file) {
  const buf = readFileSync(file);
  let pos = 8, width = 0, height = 0, colorType = 0, depth = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString();
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (colorType !== 6 || depth !== 8) return { width, height, colorType, depth, rows: null };
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = width * bpp;
  const rows = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
    // Undo the filter, which PNG applies per scanline.
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      if (filter === 1) line[x] = (line[x] + a) & 255;
      else if (filter === 2) line[x] = (line[x] + b) & 255;
      else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    rows.push(line); prev = line;
  }
  return { width, height, colorType, depth, rows };
}

const file = process.argv[2] ?? 'public/assets/entity/fish/tropical_a_pattern_1.png';
const { width, height, colorType, depth, rows } = readPixels(file);

console.log(`  ${file}`);
console.log(`  ${width}x${height}  colourType ${colorType}  depth ${depth}`);
if (!rows) { console.log('  (only 8-bit RGBA is decoded here)'); process.exit(0); }

// A summary of the whole sheet, then the SPECIFIC body region (0,0)-(8,9) the body rectangle covers.
const tally = new Map();
let opaque = 0;
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const i = x * 4;
  const [r, g, b, a] = [rows[y][i], rows[y][i + 1], rows[y][i + 2], rows[y][i + 3]];
  if (a > 0) opaque++;
  const key = a === 0 ? 'transparent' : `${r},${g},${b}`;
  tally.set(key, (tally.get(key) || 0) + 1);
}
console.log(`  opaque pixels: ${opaque} of ${width * height}`);
console.log('  most common:');
[...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([k, n]) => console.log(`    ${k}  x${n}`));

/** Report a sub-rectangle's pixels, which is what a UV rectangle actually samples. */
function region(label, x0, y0, w, h) {
  const counts = new Map();
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (y < 0 || y >= height || x < 0 || x >= width) { counts.set('outside', (counts.get('outside') || 0) + 1); continue; }
    const i = x * 4;
    const key = rows[y][i + 3] === 0 ? 'transparent' : `${rows[y][i]},${rows[y][i + 1]},${rows[y][i + 2]}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  console.log(`  ${label} (${x0},${y0}) ${w}x${h}: ` + [...counts.entries()].map(([k, n]) => `${k} x${n}`).join('  '));
}

// Vanilla's small-fish rectangles, as read from class_612.
region('body   ', 0, 0, 8, 9);
region('tail   ', 22, -6, 0, 9);
region('dorsal ', 10, -5, 0, 9);
region('finTop ', 2, 16, 2, 2);
region('finBot ', 2, 12, 2, 2);
