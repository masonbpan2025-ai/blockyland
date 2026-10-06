#!/usr/bin/env node
/**
 * Report the atlas as a grid of average colours plus the bounding box of each solid opaque band.
 *
 * Vanilla packs a mob's parts into one sheet, sometimes without transparent gutters, so the part boundaries are not
 * always visible from opacity alone. Printing brightness per cell shows where a face (dark markings on light hide)
 * or a solid body panel actually sits.
 *
 * Usage: node scripts/mob-visual/atlas-bands.mjs <png> [--cell 2]
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { decodePng } from './png.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const ci = args.indexOf('--cell');
const cell = ci >= 0 ? Number(args[ci + 1]) : 2;

const image = decodePng(readFileSync(file));
const { width, height, rgba } = image;
console.log(`${basename(file)}  ${width}x${height}  cell=${cell}`);

const at = (x, y) => {
  const i = (y * width + x) * 4;
  return { r: rgba[i], g: rgba[i + 1], b: rgba[i + 2], a: rgba[i + 3] };
};

let header = '     ';
for (let x = 0; x < width; x += cell) header += (x % (cell * 8) === 0) ? '|' : ' ';
console.log(header);
let axis = '     ';
for (let x = 0; x < width; x += cell) axis += (x % (cell * 8) === 0) ? String(Math.floor(x / (cell * 8)) % 10) : ' ';
console.log(axis);

for (let y = 0; y < height; y += cell) {
  let line = String(y).padStart(3) + '  ';
  for (let x = 0; x < width; x += cell) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let j = y; j < Math.min(y + cell, height); j++) {
      for (let i = x; i < Math.min(x + cell, width); i++) {
        const p = at(i, j); r += p.r; g += p.g; b += p.b; a += p.a; n++;
      }
    }
    if (a / n < 100) { line += ' '; continue; }
    const lum = (r / n) * 0.299 + (g / n) * 0.587 + (b / n) * 0.114;
    line += lum < 50 ? '@' : lum < 110 ? '#' : lum < 170 ? '+' : lum < 215 ? '.' : ':';
  }
  console.log(line);
}
