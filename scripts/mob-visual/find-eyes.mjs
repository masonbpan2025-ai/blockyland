#!/usr/bin/env node
/**
 * Locate a face by its EYES: find horizontal pairs of small dark clusters surrounded by lighter hide.
 *
 * A mob's face is identifiable by two small dark marks at the same height, separated by a lighter strip (the
 * muzzle bridge). That signature is more reliable than guessing an atlas offset, which is how the cow's face ended
 * up sampling body hide.
 *
 * Usage: node scripts/mob-visual/find-eyes.mjs <png> [--max 14] [--light 150]
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { decodePng } from './png.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? Number(args[i + 1]) : d; };
const maxEyes = opt('max', 14);
const lightCut = opt('light', 150);

const image = decodePng(readFileSync(file));
const { width, height, rgba } = image;
const lum = (x, y) => {
  const i = (y * width + x) * 4;
  if (rgba[i + 3] < 128) return -1;
  return rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
};

console.log(`${basename(file)}  ${width}x${height}  looking for eye pairs (dark clusters <= ${maxEyes}px wide)`);

/** Contiguous runs of dark texels on one scanline. */
function darkRuns(y) {
  const runs = [];
  let start = -1;
  for (let x = 0; x <= width; x++) {
    const dark = x < width && lum(x, y) >= 0 && lum(x, y) < 90;
    if (dark && start < 0) start = x;
    if (!dark && start >= 0) { runs.push([start, x - 1]); start = -1; }
  }
  return runs;
}

const found = [];
for (let y = 0; y < height; y++) {
  const dark = darkRuns(y);
  // An eye ROW is a row with several separate small dark clusters, or two clusters with a light gap between.
  const small = dark.filter(([a, b]) => b - a + 1 <= maxEyes);
  if (small.length < 2) continue;
  // Look for a light strip between the first two clusters.
  const [a0, a1] = small[0];
  const [b0] = small[1];
  let lightBetween = true;
  for (let x = a1 + 1; x < b0; x++) if (lum(x, y) >= 0 && lum(x, y) < lightCut) { lightBetween = false; break; }
  if (!lightBetween) continue;
  found.push({ y, clusters: small });
}

if (found.length === 0) {
  console.log('  no eye pair found; loosen --light or raise --max');
} else {
  for (const f of found.slice(0, 18)) {
    console.log(`  y=${String(f.y).padStart(3)}  clusters: ${f.clusters.map(([a, b]) => `${a}..${b}(w${b - a + 1})`).join('  ')}`);
  }
  console.log(`  ${found.length} candidate row(s) in total`);
}
