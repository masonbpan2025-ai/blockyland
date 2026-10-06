#!/usr/bin/env node
/**
 * Search a texture atlas for the box layout that best matches a part, by trying candidate sizes and origins and
 * scoring how opaque every face's rectangle is.
 *
 * This turns "where is the cow's body on its atlas" into a measurement. A face that samples a transparent region
 * renders as BLACK with an opaque material, so a layout whose six faces are all opaque is what we want; the search
 * reports the best few so the numbers can be pasted straight into a model definition.
 *
 * Usage:
 *   node scripts/mob-visual/fit-box.mjs <png> --w 12,14,16 --h 8,10,12 --d 4,6,8 [--min 90] [--top 6]
 *
 * The search assumes vanilla's standard quad layout, which is what `createEntityBox` implements.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { decodePng } from './png.mjs';
import { quadRects } from '../../src/mobVisuals/entityBox.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const list = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1].split(',').map(Number) : fallback;
};
const widths = list('w', [8, 10, 12]);
const heights = list('h', [8, 10, 12]);
const depths = list('d', [4, 6, 8]);
const minOpaque = Number((args[args.indexOf('--min') + 1]) || 90);
const top = Number((args[args.indexOf('--top') + 1]) || 5);

const image = decodePng(readFileSync(file));
console.log(`${basename(file)}  ${image.width}x${image.height}  searching w=${widths} h=${heights} d=${depths}`);

const at = (x, y) => (x < 0 || y < 0 || x >= image.width || y >= image.height) ? 0 : image.rgba[(y * image.width + x) * 4 + 3];

/** Fraction of a rectangle's texels that are opaque, and the fraction that is dark (detail). */
function scoreRect(r) {
  let opaque = 0, dark = 0, n = 0;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      n++;
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const i = (y * image.width + x) * 4;
      if (image.rgba[i + 3] >= 128) {
        opaque++;
        if (image.rgba[i] * 0.299 + image.rgba[i + 1] * 0.587 + image.rgba[i + 2] * 0.114 < 90) dark++;
      }
    }
  }
  return { opaque: opaque / Math.max(1, n), dark: dark / Math.max(1, n) };
}

const results = [];
for (const w of widths) {
  for (const h of heights) {
    for (const d of depths) {
      // The layout is `w + 2d` wide and `d + h` tall, so it only fits inside the atlas within these bounds.
      const totalW = w + 2 * d;
      const totalH = d + h;
      if (totalW > image.width || totalH > image.height) continue;
      for (let v = 0; v + totalH <= image.height; v++) {
        for (let u = 0; u + totalW <= image.width; u++) {
          const rects = quadRects(u, v, w, h, d);
          const scores = rects.map(scoreRect);
          const worst = Math.min(...scores.map((s) => s.opaque));
          if (worst * 100 < minOpaque) continue;
          const avgDark = scores.reduce((a, s) => a + s.dark, 0) / 6;
          results.push({ u, v, w, h, d, worst: Math.round(worst * 100), avgDark: Math.round(avgDark * 100) });
        }
      }
    }
  }
}

results.sort((a, b) => (b.worst - a.worst) || (b.avgDark - a.avgDark));
console.log(`  ${results.length} layout(s) with every face at least ${minOpaque}% opaque; top ${top}:`);
for (const r of results.slice(0, top)) {
  console.log(`    u=${String(r.u).padStart(3)} v=${String(r.v).padStart(3)}  box ${r.w}x${r.h}x${r.d}`
    + `  worstFace=${r.worst}%  detail=${r.avgDark}%`);
}
if (results.length === 0) console.log('    none -- loosen --min or widen the size lists');
