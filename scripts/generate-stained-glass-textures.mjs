// Writes the 16 stained glass textures, public/assets/blocks/<colour>_stained_glass.png, from the game's own glass.png
// and the dye colours (src/colourPalette.js).
//
// Stained glass is glass in a colour: the same frame and glints, in the dye's colour, with the clear middle filled by a
// see-through wash of that colour (so a beacon beam, a sunset or a mob behind it shows through, tinted). The block
// definitions pick these files up by name (scripts/generate-content-expansion.mjs: a stained glass, or its pane, uses
// `<colour>_stained_glass.png` where the file exists).
//
// Run: node scripts/generate-stained-glass-textures.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { DYE_COLOURS } from '../src/colourPalette.js';

/** How opaque the coloured wash in the middle is: enough to read the colour, clear enough to see through. */
export const FILL_ALPHA = 0.5;

/** An 8-bit RGBA, non-interlaced PNG, as [width, height, Uint8Array of RGBA]. */
export function decodePng(buffer) {
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  if (buffer[24] !== 8 || buffer[25] !== 6 || buffer[28] !== 0) throw new Error('expected an 8-bit RGBA, non-interlaced PNG');
  const parts = [];
  for (let o = 8; o < buffer.length;) {
    const length = buffer.readUInt32BE(o), type = buffer.toString('ascii', o + 4, o + 8);
    if (type === 'IDAT') parts.push(buffer.subarray(o + 8, o + 8 + length));
    o += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(parts)), stride = width * 4, out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? out[y * stride + x - 4] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= 4 && y ? out[(y - 1) * stride + x - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predict = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      out[y * stride + x] = (line[x] + predict) & 255;
    }
  }
  return [width, height, out];
}

export function encodePng(width, height, rgba) {
  const crc = (buf) => { let c = ~0; for (const v of buf) { c ^= v; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = []; for (let y = 0; y < height; y++) rows.push(Buffer.from([0]), Buffer.from(rgba.subarray(y * width * 4, (y + 1) * width * 4)));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

/** Glass in a dye colour: its frame and glints take the colour (keeping their light and shade), its middle a wash of it. */
export function stainGlass(glass, hex) {
  const dye = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)), out = new Uint8Array(glass.length);
  for (let i = 0; i < glass.length; i += 4) {
    const alpha = glass[i + 3] / 255, light = (glass[i] + glass[i + 1] + glass[i + 2]) / (3 * 255);
    // A frame or glint pixel: the dye at that pixel's lightness, a touch brighter than the wash so the frame reads.
    const frame = dye.map((c) => Math.min(255, c * (0.55 + 0.75 * light)));
    for (let k = 0; k < 3; k++) out[i + k] = Math.round(frame[k] * alpha + dye[k] * (1 - alpha));
    out[i + 3] = Math.round(255 * Math.max(alpha, FILL_ALPHA));
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = new URL('../public/assets/blocks/', import.meta.url);
  const [width, height, glass] = decodePng(readFileSync(new URL('glass.png', dir)));
  for (const [colour, hex] of Object.entries(DYE_COLOURS)) {
    writeFileSync(new URL(`${colour}_stained_glass.png`, dir), encodePng(width, height, stainGlass(glass, hex)));
  }
  console.log(`wrote ${Object.keys(DYE_COLOURS).length} stained glass textures`);
}
