// Report the pixel content of candidate face rectangles on an atlas, so a "blank face" can be traced to the exact
// texels being sampled rather than to a guess.
//
// Usage: node scripts/mob-visual/sample-rect.mjs <png> --rect x,y,w,h [--rect ...] [--flip]
import { readFileSync } from 'node:fs';
import { decodePng } from './png.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const rects = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--rect' && args[i + 1]) {
    const [x, y, w, h] = args[i + 1].split(',').map(Number);
    rects.push({ x, y, w, h });
  }
}
const { width, height, rgba } = decodePng(readFileSync(file));
const at = (x, y) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return { r: 0, g: 0, b: 0, a: 0 };
  const i = (y * width + x) * 4;
  return { r: rgba[i], g: rgba[i + 1], b: rgba[i + 2], a: rgba[i + 3] };
};

for (const r of rects) {
  let transparent = 0, dark = 0, sum = 0, n = 0;
  const rows = [];
  for (let y = r.y; y < r.y + r.h; y++) {
    let row = '';
    for (let x = r.x; x < r.x + r.w; x++) {
      const p = at(x, y);
      n++;
      if (p.a < 128) { row += ' '; transparent++; continue; }
      const lum = p.r * 0.299 + p.g * 0.587 + p.b * 0.114;
      sum += lum;
      if (lum < 90) { row += '#'; dark++; } else if (lum < 170) row += '+'; else row += '.';
    }
    rows.push(row);
  }
  console.log(`rect ${r.x},${r.y} ${r.w}x${r.h}  transparent=${transparent}/${n} dark=${dark} avgLum=${Math.round(sum / Math.max(1, n - transparent))}`);
  for (const row of rows) console.log('   |' + row + '|');
}
