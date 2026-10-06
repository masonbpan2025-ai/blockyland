#!/usr/bin/env node
/**
 * Compare two PNGs pixel by pixel and report where they differ.
 *
 * A downloaded asset that is subtly wrong -- a re-encoded, upscaled or recoloured copy -- makes every UV
 * measurement derived from it wrong too. This establishes whether a sheet really is the original before its layout
 * is trusted.
 *
 * Usage: node scripts/mob-visual/compare-png.mjs <a.png> <b.png>
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { decodePng } from './png.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [a, b] = args;
const A = decodePng(readFileSync(a));
const B = decodePng(readFileSync(b));

console.log(`${basename(a)} ${A.width}x${A.height}  vs  ${basename(b)} ${B.width}x${B.height}`);
if (A.width !== B.width || A.height !== B.height) {
  console.log('  SIZES DIFFER -- the sheets are not the same atlas');
  process.exit(0);
}

let same = 0, diff = 0;
const boxes = [];
for (let y = 0; y < A.height; y++) {
  for (let x = 0; x < A.width; x++) {
    const i = (y * A.width + x) * 4;
    const equal = A.rgba[i] === B.rgba[i] && A.rgba[i + 1] === B.rgba[i + 1]
      && A.rgba[i + 2] === B.rgba[i + 2] && A.rgba[i + 3] === B.rgba[i + 3];
    if (equal) { same++; continue; }
    diff++;
    // Merge differing texels into coarse regions so the report says WHERE, not just how many.
    const key = `${Math.floor(x / 8) * 8},${Math.floor(y / 8) * 8}`;
    let box = boxes.find((b2) => b2.key === key);
    if (!box) { box = { key, n: 0 }; boxes.push(box); }
    box.n++;
  }
}
const total = same + diff;
console.log(`  identical=${same}/${total} (${Math.round((same / total) * 100)}%)  differing=${diff}`);
if (diff) {
  boxes.sort((p, q) => q.n - p.n);
  console.log('  regions that differ (8px blocks, top 12):');
  for (const bx of boxes.slice(0, 12)) console.log(`    at ${bx.key}  ${bx.n} texel(s)`);
}
