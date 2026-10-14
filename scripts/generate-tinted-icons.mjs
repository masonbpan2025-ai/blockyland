// node scripts/generate-tinted-icons.mjs
//
// Icons for potions and tipped arrows, made from the art the game has. A potion's liquid is found by comparing the
// plain bottle with a coloured one (potion.png against potion_of_healing.png) and recoloured with the effect's
// colour (POTION_DATA, the wiki's particle colours), keeping each pixel's shading; existing potion icons are left
// alone. A tipped arrow is the arrow (arrow.png) with its head tinted the potion's colour, as the wiki's renders
// show it -- the three it had were coloured squares, so every arrow is drawn here.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { POTION_DATA } from '../src/brewing.js';
import { TIPPED_ARROWS } from '../src/tippedArrowItems.js';

const DIR = 'public/assets/items';

function decode(buffer) {
  let at = 8; let width = 0; let height = 0; let type = 0; const idat = [];
  while (at < buffer.length) {
    const len = buffer.readUInt32BE(at); const kind = buffer.toString('ascii', at + 4, at + 8);
    const data = buffer.subarray(at + 8, at + 8 + len);
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); type = data[9]; if (data[8] !== 8 || data[12]) throw new Error('only 8-bit, non-interlaced PNGs'); }
    if (kind === 'IDAT') idat.push(data);
    at += 12 + len;
  }
  const channels = { 6: 4, 2: 3 }[type];
  if (!channels) throw new Error(`colour type ${type} not handled`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels; const out = Buffer.alloc(width * height * 4);
  const prev = Buffer.alloc(stride); const line = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= channels ? line[x - channels] : 0; const b = prev[x]; const c = x >= channels ? prev[x - channels] : 0;
      const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
      line[x] = (v + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter]) & 255;
    }
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < 3; k++) out[(y * width + x) * 4 + k] = line[x * channels + k];
      out[(y * width + x) * 4 + 3] = channels === 4 ? line[x * 4 + 3] : 255;
    }
    line.copy(prev);
  }
  return { width, height, data: out };
}

function encode({ width, height, data }) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (kind, body) => { const len = Buffer.alloc(4); len.writeUInt32BE(body.length); const kb = Buffer.concat([Buffer.from(kind, 'ascii'), body]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(kb)); return Buffer.concat([len, kb, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Recolour the pixels where `plain` and `coloured` differ, keeping the coloured icon's shading. */
function tint(plainFile, colouredFile, hex) {
  const plain = decode(readFileSync(`${DIR}/${plainFile}`));
  const coloured = decode(readFileSync(`${DIR}/${colouredFile}`));
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const out = Buffer.from(plain.data);
  for (let i = 0; i < out.length; i += 4) {
    const differs = Math.abs(plain.data[i] - coloured.data[i]) + Math.abs(plain.data[i + 1] - coloured.data[i + 1]) + Math.abs(plain.data[i + 2] - coloured.data[i + 2]) > 24;
    if (!differs || coloured.data[i + 3] === 0) continue;
    const shade = Math.max(coloured.data[i], coloured.data[i + 1], coloured.data[i + 2]) / 255;
    out[i] = Math.round(r * shade); out[i + 1] = Math.round(g * shade); out[i + 2] = Math.round(b * shade); out[i + 3] = coloured.data[i + 3];
  }
  return encode({ width: plain.width, height: plain.height, data: out });
}

let made = 0;
for (const id of ['potion_of_oozing', 'potion_of_weaving', 'potion_of_wind_charging', 'potion_of_infestation']) {
  const file = `${DIR}/${id}.png`;
  if (existsSync(file)) continue;
  writeFileSync(file, tint('potion.png', 'potion_of_healing.png', POTION_DATA[id].color));
  made++;
}
/** The arrow with its head (the grey pixels at the top right) tinted. */
function tippedArrow(hex) {
  const arrow = decode(readFileSync(`${DIR}/arrow.png`));
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const out = Buffer.from(arrow.data);
  for (let y = 0; y <= 6; y++) {
    for (let x = 9; x < arrow.width; x++) {
      const i = (y * arrow.width + x) * 4;
      if (!out[i + 3]) continue;
      const shade = Math.max(out[i], out[i + 1], out[i + 2]) / 255;
      if (Math.max(out[i], out[i + 1], out[i + 2]) - Math.min(out[i], out[i + 1], out[i + 2]) > 25) continue; // the shaft
      out[i] = Math.round(r * (0.35 + 0.65 * shade)); out[i + 1] = Math.round(g * (0.35 + 0.65 * shade)); out[i + 2] = Math.round(b * (0.35 + 0.65 * shade));
    }
  }
  return encode({ width: arrow.width, height: arrow.height, data: out });
}
for (const arrow of TIPPED_ARROWS) {
  writeFileSync(`${DIR}/${arrow.id}.png`, tippedArrow(POTION_DATA[arrow.potion].color));
  made++;
}
console.log(`made ${made} icons`);
