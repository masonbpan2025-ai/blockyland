#!/usr/bin/env node
/**
 * Find bright or saturated spots in a dark atlas -- the glowing eyes, cores and other emissive details.
 *
 * The warden's face is almost black, so its eyes are not "dark marks on light hide" like a cow's; they are the few
 * texels that are notably brighter or more saturated than the surrounding sculk. This locates them.
 *
 * Usage: node scripts/mob-visual/find-bright.mjs <png> [--top 16] [--minLum 90]
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { decodePng } from './png.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? Number(args[i + 1]) : d; };
const top = opt('top', 16);
const minLum = opt('minLum', 90);

const image = decodePng(readFileSync(file));
const { width, height, rgba } = image;
console.log(`${basename(file)}  ${width}x${height}  brightest spots (lum >= ${minLum})`);

const spots = [];
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (rgba[i + 3] < 128) continue;
    const lum = rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
    if (lum < minLum) continue;
    // Cyan-ness: the warden's glow is blue-green, so green+blue well above red marks it.
    const cyan = (rgba[i + 1] + rgba[i + 2]) / 2 - rgba[i];
    spots.push({ x, y, lum: Math.round(lum), cyan: Math.round(cyan) });
  }
}
spots.sort((a, b) => (b.cyan - a.cyan) || (b.lum - a.lum));

// Cluster into 4px blocks so a large glowing area reports once rather than per texel.
const blocks = new Map();
for (const s of spots) {
  const key = `${Math.floor(s.x / 4) * 4},${Math.floor(s.y / 4) * 4}`;
  const cur = blocks.get(key) ?? { key, n: 0, maxLum: 0, maxCyan: -999 };
  cur.n++;
  cur.maxLum = Math.max(cur.maxLum, s.lum);
  cur.maxCyan = Math.max(cur.maxCyan, s.cyan);
  blocks.set(key, cur);
}
const list = [...blocks.values()].sort((a, b) => (b.maxCyan - a.maxCyan) || (b.n - a.n));
console.log(`  ${spots.length} texel(s) in ${list.length} cluster(s); brightest/most cyan first:`);
for (const b of list.slice(0, top)) {
  console.log(`    at ${b.key.padEnd(9)} texels=${String(b.n).padStart(3)}  maxLum=${b.maxLum}  cyan=${b.maxCyan}`);
}
