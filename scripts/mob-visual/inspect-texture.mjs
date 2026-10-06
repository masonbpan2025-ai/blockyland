#!/usr/bin/env node
/**
 * Report and visualise a texture atlas, so box UV rectangles can be read off real pixels instead of guessed.
 *
 * Usage:
 *   node scripts/mob-visual/inspect-texture.mjs <png> [--cell 8] [--scale 8] [--out <png>]
 *
 * Prints the atlas size and every fully-opaque `cell`x`cell` block with its average colour, then optionally writes
 * a magnified, gridded PNG for eyeballing. This is the tool the mob models' UV numbers come from.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { decodePng, encodePng, magnify, opaqueCells } from './png.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: node scripts/mob-visual/inspect-texture.mjs <png> [--cell 8] [--scale 8] [--out out.png]');
  process.exit(2);
}
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
};
const cell = flag('cell', 8);
const scale = flag('scale', 8);

const image = decodePng(readFileSync(file));
console.log(`${basename(file)}  ${image.width}x${image.height}`);

const cells = opaqueCells(image, cell);
console.log(`fully-opaque ${cell}x${cell} cells: ${cells.length}`);
// Group into rows so the grid shape is visible in text form.
const byRow = new Map();
for (const c of cells) {
  if (!byRow.has(c.y)) byRow.set(c.y, []);
  byRow.get(c.y).push(c);
}
for (const y of [...byRow.keys()].sort((a, b) => a - b)) {
  const row = byRow.get(y).sort((a, b) => a.x - b.x);
  const desc = row.map((c) => `${c.x}:${c.r.toString(16).padStart(2, '0')}${c.g.toString(16).padStart(2, '0')}${c.b.toString(16).padStart(2, '0')}`).join(' ');
  console.log(`  v=${String(y).padStart(3)}  ${desc}`);
}

const outIndex = args.indexOf('--out');
if (outIndex >= 0 && args[outIndex + 1]) {
  const out = args[outIndex + 1];
  writeFileSync(out, encodePng(magnify(image, { scale, cell: cell === 8 ? 4 : cell })));
  console.log(`wrote ${out}`);
}
