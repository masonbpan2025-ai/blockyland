#!/usr/bin/env node
/**
 * Print the exact RGBA of a list of texels, so "why is this black" can be answered with numbers.
 *
 * Usage: node scripts/mob-visual/sample-pixels.mjs <png> 30,38 31,39 ...
 */
import { readFileSync } from 'node:fs';
import { decodePng } from './png.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const image = decodePng(readFileSync(file));
console.log(`${file}  ${image.width}x${image.height}`);
for (const spec of args.filter((a) => /^\d+,\d+$/.test(a))) {
  const [x, y] = spec.split(',').map(Number);
  const i = (y * image.width + x) * 4;
  const [r, g, b, a] = [image.rgba[i], image.rgba[i + 1], image.rgba[i + 2], image.rgba[i + 3]];
  const lum = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
  console.log(`  (${x},${y}) rgba=${r},${g},${b},${a}  lum=${lum}`);
}
