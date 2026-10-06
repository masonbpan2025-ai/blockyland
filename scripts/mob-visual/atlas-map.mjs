#!/usr/bin/env node
/**
 * Print an ASCII opacity map of an atlas, so the layout's gutters and part boundaries are visible as text.
 *
 * Tighter than a rendered image for this purpose: each character is one texel (or a 2x2 block with --block 2), so
 * a face, a paw or a transparent gutter shows up as a distinct shape and coordinates can be read straight off the
 * axes.
 *
 * Usage: node scripts/mob-visual/atlas-map.mjs <png> [--block 1] [--alpha 128]
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { decodePng } from './png.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
};
const block = Math.max(1, opt('block', 1));
const alphaCut = opt('alpha', 128);

const { width, height, rgba } = decodePng(readFileSync(file));
const at = (x, y) => {
  const i = (y * width + x) * 4;
  return { r: rgba[i], g: rgba[i + 1], b: rgba[i + 2], a: rgba[i + 3] };
};

// Classify each block by its average colour so the map distinguishes e.g. black fur from white fur from a hole.
const classify = (r, g, b) => {
  const lum = (r * 0.299 + g * 0.587 + b * 0.114);
  if (lum < 70) return '#';        // dark fur / eye / nose
  if (lum < 150) return '+';       // mid tone
  return '.';                      // light fur
};

console.log(`${basename(file)}  ${width}x${height}  block=${block}`);
const cols = Math.ceil(width / block);
// A column header every 4 source pixels, so coordinates are readable without counting.
let header = '     ';
for (let cx = 0; cx < cols; cx++) header += (cx * block) % 8 === 0 ? '|' : ' ';
console.log(header);
let header2 = '     ';
for (let cx = 0; cx < cols; cx++) header2 += (cx * block) % 8 === 0 ? String(Math.floor((cx * block) / 8) % 10) : ' ';
console.log(header2);

for (let by = 0; by < height; by += block) {
  let line = String(by).padStart(3) + '  ';
  for (let bx = 0; bx < width; bx += block) {
    let solid = 0, r = 0, g = 0, b = 0, n = 0;
    for (let y = by; y < Math.min(by + block, height); y++) {
      for (let x = bx; x < Math.min(bx + block, width); x++) {
        const p = at(x, y);
        n++;
        if (p.a >= alphaCut) { solid++; r += p.r; g += p.g; b += p.b; }
      }
    }
    if (solid === 0) line += ' ';
    else if (solid < n * 0.5) line += ':';   // partially transparent edge
    else line += classify(r / solid, g / solid, b / solid);
  }
  console.log(line);
}
