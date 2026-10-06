// Print the atlas rectangles a createBoxWithUV call produces, so the legacy layout can be compared with the
// standard quad layout the newer helpers use.
//
// Usage: node scripts/mob-visual/legacy-rects.mjs <png> --box 8,8,8 --uv 0,0
import { readFileSync } from 'node:fs';
import { decodePng } from './png.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const val = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const [w, h, d] = val('box').split(',').map(Number);
const [u, v] = val('uv').split(',').map(Number);

const image = decodePng(readFileSync(file));
const texW = image.width, texH = image.height;

// Mirrors createBoxWithUV in src/mobs.js exactly.
const tw = w, th = h, td = d;
const faceUVMap = [
  { x: u + td + tw, y: v + td, w: td, h: th },
  { x: u, y: v + td, w: td, h: th },
  { x: u + td, y: v, w: tw, h: td },
  { x: u + td + tw, y: v, w: tw, h: td },
  { x: u + td, y: v + td, w: tw, h: th },
  { x: u + td + tw + td, y: v + td, w: tw, h: th }
];
const NAMES = ['+X right', '-X left', '+Y top', '-Y bottom', '+Z front', '-Z back'];
console.log(`${file} ${texW}x${texH}  createBoxWithUV(${w},${h},${d}, ${u},${v})`);
for (let i = 0; i < 6; i++) {
  const r = faceUVMap[i];
  let opaque = 0, n = 0, dark = 0;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      n++;
      if (x < 0 || y < 0 || x >= texW || y >= texH) continue;
      const p = (y * texW + x) * 4;
      if (image.rgba[p + 3] >= 128) {
        opaque++;
        if (image.rgba[p] * 0.299 + image.rgba[p + 1] * 0.587 + image.rgba[p + 2] * 0.114 < 90) dark++;
      }
    }
  }
  console.log(`  ${NAMES[i].padEnd(10)} x=${String(r.x).padStart(4)} y=${String(r.y).padStart(4)}`
    + ` ${String(r.w).padStart(3)}x${String(r.h).padStart(3)}  opaque=${Math.round((opaque / Math.max(1, n)) * 100)}%  dark=${dark}`);
}
