// Print the UV rectangles a model part maps to, and what the atlas actually contains there.
//
// This is the check that catches a face mapped to a transparent or blank patch before it shows up as a black
// silhouette in the Inspector.
//
// Usage: node scripts/mob-visual/dump-rects.mjs <png> --box w,h,d --uv u,v,tw,th,td [--tex 128x64]
import { readFileSync } from 'node:fs';
import { decodePng } from './png.mjs';
import { quadRects } from '../../src/mobVisuals/entityBox.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const val = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };

const [tw, th, td] = val('uv').split(',').slice(2).map(Number);
const [u, v] = val('uv').split(',').slice(0, 2).map(Number);
// Atlas size defaults to the image's own dimensions. Passing --tex explicitly overrides it, which is useful for
// checking a region against a differently sized sheet, but defaulting to a hard-coded 128x64 silently mis-located
// every rectangle on a 64x64 atlas.
const image = decodePng(readFileSync(file));
const [texW, texH] = val('tex')
  ? val('tex').split('x').map(Number)
  : [image.width, image.height];

const rects = quadRects(u, v, tw, th, td);
const NAMES = ['+X right', '-X left', '+Y top', '-Y bottom', '+Z front', '-Z back'];

console.log(`box ${val('box')}  uv ${val('uv')}  atlas ${texW}x${texH}`);
for (let i = 0; i < 6; i++) {
  const r = rects[i];
  let opaque = 0, dark = 0, n = 0;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) { n++; continue; }
      const p = (y * image.width + x) * 4;
      n++;
      if (image.rgba[p + 3] >= 128) {
        opaque++;
        if (image.rgba[p] * 0.299 + image.rgba[p + 1] * 0.587 + image.rgba[p + 2] * 0.114 < 90) dark++;
      }
    }
  }
  const pct = Math.round((opaque / Math.max(1, n)) * 100);
  const flag = r.w <= 0 || r.h <= 0 ? 'DEGENERATE'
    : opaque === 0 ? 'FULLY TRANSPARENT -> renders black'
      : pct < 60 ? 'mostly transparent'
        : '';
  console.log(`  ${NAMES[i].padEnd(10)} x=${String(r.x).padStart(4)} y=${String(r.y).padStart(4)}`
    + ` ${String(r.w).padStart(3)}x${String(r.h).padStart(3)}  opaque=${String(pct).padStart(3)}%  dark=${dark}  ${flag}`);
}
