// Writes public/assets/blocks/beacon.png: the beacon's core, drawn for this game (vanilla's beacon texture is not
// among the default textures). An original 16x16 tile: cyan, brightest at its middle, darker to its rim, with a
// little pixel speckle. The beacon model (src/blockModelShapes.js) draws it as the block's `inner` texture.
//
// Run: node scripts/generate-beacon-texture.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
const N = 16, rows = [];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rim = [38, 168, 170], body = [92, 226, 220], glow = [226, 255, 252];
const rand = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
for (let y = 0; y < N; y++) {
  const row = [0];
  for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5) / 7.5;                 // 0 at the middle, 1 at an edge's middle
    let c = d < 0.45 ? mix(glow, body, d / 0.45) : mix(body, rim, Math.min(1, (d - 0.45) / 0.75));
    c = mix(c, rand(x, y) > 0.5 ? [255, 255, 255] : [0, 60, 70], 0.08 + 0.06 * rand(y, x));
    if (x === 0 || y === 0 || x === N - 1 || y === N - 1) c = mix(c, rim, 0.5);
    row.push(...c, 255);
  }
  rows.push(Buffer.from(row));
}
const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync(new URL("../public/assets/blocks/beacon.png", import.meta.url), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]));
