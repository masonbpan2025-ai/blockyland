#!/usr/bin/env node
/**
 * Print the exact opaque extent of every atlas row and column.
 *
 * `atlas-map.mjs` shows the shape but counting characters is error-prone; this gives the numbers directly, which is
 * what the model UV rectangles are derived from.
 *
 * Usage: node scripts/mob-visual/atlas-extents.mjs <png> [--rows a-b] [--alpha 128]
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { decodePng } from './png.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const alphaCut = Number(opt('alpha', 128));
const rangeSpec = opt('rows', null);

const { width, height, rgba } = decodePng(readFileSync(file));
const at = (x, y) => rgba[(y * width + x) * 4 + 3];

let from = 0, to = height - 1;
if (rangeSpec) { const [a, b] = String(rangeSpec).split('-').map(Number); from = a; to = b; }

console.log(`${basename(file)}  ${width}x${height}`);
console.log('  row : first..last  (width)   runs');
for (let y = from; y <= to && y < height; y++) {
  // Contiguous runs of opaque texels, so a row that spans two parts is visible as two runs.
  const runs = [];
  let start = -1;
  for (let x = 0; x <= width; x++) {
    const solid = x < width && at(x, y) >= alphaCut;
    if (solid && start < 0) start = x;
    if (!solid && start >= 0) { runs.push(`${start}..${x - 1}`); start = -1; }
  }
  if (runs.length === 0) continue;
  const first = Number(runs[0].split('..')[0]);
  const last = Number(runs[runs.length - 1].split('..')[1]);
  console.log(`  ${String(y).padStart(3)} : ${String(first).padStart(3)}..${String(last).padStart(3)}  (${String(last - first + 1).padStart(3)})   ${runs.join('  ')}`);
}
