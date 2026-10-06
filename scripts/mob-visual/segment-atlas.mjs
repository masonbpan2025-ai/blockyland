#!/usr/bin/env node
/**
 * Segment a Minecraft entity atlas into its opaque regions and report each one's bounding box.
 *
 * Model part rectangles are opaque blocks of texture with transparent padding between them. Reporting the actual
 * connected regions turns "find the head's UV" from guesswork into arithmetic, and it also shows when two parts
 * share a region (which happens on atlases where a leg is drawn once and reused).
 *
 * Usage: node scripts/mob-visual/segment-atlas.mjs <png> [--min 12]
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { decodePng } from './png.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const minIndex = args.indexOf('--min');
const minPixels = minIndex >= 0 ? Number(args[minIndex + 1]) : 12;

const { width, height, rgba } = decodePng(readFileSync(file));
const opaque = (x, y) => rgba[(y * width + x) * 4 + 3] >= 128;

// Label 4-connected opaque components.
const seen = new Uint8Array(width * height);
const regions = [];
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (seen[y * width + x] || !opaque(x, y)) continue;
    const stack = [[x, y]];
    seen[y * width + x] = 1;
    let x0 = x, x1 = x, y0 = y, y1 = y, count = 0;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      count++;
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
      const neighbours = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
      for (const [nx, ny] of neighbours) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (seen[ny * width + nx] || !opaque(nx, ny)) continue;
        seen[ny * width + nx] = 1;
        stack.push([nx, ny]);
      }
    }
    regions.push({ x0, y0, x1, y1, count });
  }
}

regions.sort((a, b) => (b.count - a.count));
console.log(`${basename(file)}  ${width}x${height}  ${regions.length} opaque region(s)`);
for (const r of regions) {
  if (r.count < minPixels) continue;
  const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1;
  console.log(`  x=${String(r.x0).padStart(3)}..${String(r.x1).padStart(3)} (w=${String(w).padStart(3)})`
    + `  y=${String(r.y0).padStart(3)}..${String(r.y1).padStart(3)} (h=${String(h).padStart(3)})`
    + `  pixels=${r.count}`);
}
