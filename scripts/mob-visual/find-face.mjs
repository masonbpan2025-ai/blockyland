#!/usr/bin/env node
/**
 * Find a mob's FACE on its atlas by bilateral symmetry of its OPAQUE shape.
 *
 * A face is mirror-symmetric about its vertical centre: whatever is drawn on the left has a counterpart at the
 * mirrored x on the right. Hide panels, legs and torsos are not symmetric, and a transparent corner opposite an
 * opaque one is a strong signal that a rectangle is NOT a face.
 *
 * Symmetry of the drawn shape (where alpha is present) is the discriminator, with colour agreement as a tie-break.
 * This is how a face is located without guessing an atlas offset.
 *
 * Usage: node scripts/mob-visual/find-face.mjs <png> [--w 8] [--h 8] [--top 8] [--min 0.6]
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { decodePng } from './png.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? Number(args[i + 1]) : d; };
const wantW = opt('w', 8);
const wantH = opt('h', 8);
const top = opt('top', 8);
const minOpaque = opt('min', 0.6);

const image = decodePng(readFileSync(file));
const { width, height, rgba } = image;
console.log(`${basename(file)}  ${width}x${height}  searching ${wantW}x${wantH} rectangles for a mirrored face`);

function score(x0, y0, w, h) {
  let alphaAgree = 0, pairs = 0, colourAgree = 0, colourPairs = 0, opaqueCount = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = 0; x < w; x++) {
      const mx = w - 1 - x;
      if (mx < x) continue;
      const i = (y * width + x0 + x) * 4;
      const j = (y * width + x0 + mx) * 4;
      pairs++;
      const ai = rgba[i + 3] >= 128 ? 1 : 0;
      const aj = rgba[j + 3] >= 128 ? 1 : 0;
      if (ai) opaqueCount++;
      if (ai === aj) alphaAgree++;
      if (ai && aj) {
        colourPairs++;
        const d = Math.abs(rgba[i] - rgba[j]) + Math.abs(rgba[i + 1] - rgba[j + 1]) + Math.abs(rgba[i + 2] - rgba[j + 2]);
        colourAgree += Math.max(0, 1 - d / 150);
      }
    }
  }
  const shape = pairs ? alphaAgree / pairs : 0;
  const colour = colourPairs ? colourAgree / colourPairs : 0;
  const opaque = opaqueCount / (w * h);
  // A fully transparent rectangle is trivially symmetric, so opacity is weighted in rather than gated on. This
  // keeps blank regions out of the running without hiding a face that has transparent corners.
  const total = (shape * 0.5 + colour * 0.3 + opaque * 0.2) * (0.4 + 0.6 * opaque);
  return { shape, colour, opaque, total };
}

const results = [];
for (let y0 = 0; y0 + wantH <= height; y0++) {
  for (let x0 = 0; x0 + wantW <= width; x0++) {
    const s = score(x0, y0, wantW, wantH);
    if (s.opaque < minOpaque) continue;
    results.push({ x: x0, y: y0, ...s });
  }
}
results.sort((a, b) => b.total - a.total);
console.log(`  ${results.length} candidate(s) at >= ${Math.round(minOpaque * 100)}% opaque; best first:`);
for (const r of results.slice(0, top)) {
  console.log(`    at (${String(r.x).padStart(3)},${String(r.y).padStart(3)})`
    + `  shape=${(r.shape * 100).toFixed(1)}%  colour=${(r.colour * 100).toFixed(1)}%`
    + `  opaque=${Math.round(r.opaque * 100)}%  total=${(r.total * 100).toFixed(1)}%`);
}
