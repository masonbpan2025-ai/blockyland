#!/usr/bin/env node
/**
 * Test an atlas against the standard quadruped layout, so a batch of mobs can be classified at once.
 *
 * `QuadrupedModel.createBodyMesh(stanceWidth, Dilation)` is the shared template behind the cow, pig, sheep and their
 * relatives, and it fixes the layout: body 12x10x18 at (18,4), head 8x8x8 at (0,0), legs 4x12x4 at (0,16). A mob
 * whose sheet contains those rectangles can be rebuilt with `createEntityBox` and no guesswork.
 *
 * This exists because doing one mob per round does not scale to the remaining fifty. Reporting the whole set at once
 * turns "which mobs can I do the easy way" into a table.
 *
 * Usage: node scripts/mob-visual/check-quadruped.mjs <png> [<png> ...]
 *        node scripts/mob-visual/check-quadruped.mjs --dir public/assets/entity
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { decodePng } from './png.mjs';

/** The canonical quadruped parts, as (name, w, h, d, u, v). */
const PARTS = [
  ['head', 8, 8, 8, 0, 0],
  ['body', 12, 10, 18, 18, 4],
  ['leg', 4, 12, 4, 0, 16]
];

/** Vanilla's own layout rectangles for a box, in the order createEntityBox emits them. */
function rects(u, v, tw, th, td) {
  return [
    { x: u + td, y: v + td, w: td, h: th },
    { x: u + td + tw + td, y: v + td, w: td, h: th },
    { x: u + td, y: v, w: tw, h: td },
    { x: u + td + tw, y: v, w: tw, h: td },
    { x: u + td, y: v + td, w: tw, h: th },
    { x: u + td + tw, y: v + td, w: tw, h: th }
  ];
}

function opacity(image, r) {
  let opaque = 0, n = 0;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      n++;
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      if (image.rgba[(y * image.width + x) * 4 + 3] >= 128) opaque++;
    }
  }
  return n ? opaque / n : 0;
}

/** The worst face opacity across a part's six faces -- a part is only usable if its dimmest face has art. */
function partScore(image, [name, tw, th, td, u, v]) {
  if (td > tw) return { name, worst: 0, note: 'depth > half-width (needs explicit faces)' };
  const faces = rects(u, v, tw, th, td).map((r) => opacity(image, r));
  return { name, worst: Math.min(...faces) };
}

const args = process.argv.slice(2);
let files = args.filter((a) => !a.startsWith('--'));
const dirIndex = args.indexOf('--dir');
if (dirIndex >= 0) {
  const root = resolve(args[dirIndex + 1]);
  const walk = (d) => readdirSync(d).flatMap((e) => {
    const p = join(d, e);
    return statSync(p).isDirectory() ? walk(p) : (p.endsWith('.png') ? [p] : []);
  });
  files = walk(root);
}

console.log('quadruped layout: body 12x10x18 @(18,4), head 8x8x8 @(0,0), leg 4x12x4 @(0,16)');
console.log('mob                          head   body    leg    verdict');
for (const file of files.sort()) {
  let image;
  try { image = decodePng(readFileSync(file)); } catch { continue; }
  const scores = PARTS.map((p) => partScore(image, p));
  const worst = Math.min(...scores.map((s) => s.worst));
  const verdict = worst >= 0.85 ? 'QUADRUPED'
    : worst >= 0.6 ? 'partial'
      : 'no';
  const cells = scores.map((s) => `${Math.round(s.worst * 100)}%`.padStart(5)).join('  ');
  console.log(`${basename(file).padEnd(28)} ${cells}    ${verdict}`);
}
