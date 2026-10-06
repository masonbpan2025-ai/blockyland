// Settle the zombie villager's face by COMPARING PIXELS rather than by eye.
//
// Seven hypotheses have been eliminated and the render still carries white and red marks. The one possibility left
// unexamined is that THE RENDER IS CORRECT and the marks are the villager's own eye pixels at 8x magnification -- the
// head is 0.5 blocks tall carrying an 8-unit texture, so each source pixel is large on screen.
//
// The test: take the just-captured Inspector screenshot, isolate the face area, list its dominant colours, and check
// whether they exist in the sheet's own face row (y = 8..15 of the head rectangle). A match means the render is faithful
// and there is nothing to fix.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** Decode a PNG to {width, height, rgb(x,y)}. Handles the colour types this project's assets use. */
function decode(path) {
  const buf = readFileSync(path);
  const chunks = [];
  let i = 8;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    chunks.push({ type: buf.toString('ascii', i + 4, i + 8), data: buf.subarray(i + 8, i + 8 + len) });
    i += 12 + len;
  }
  const ihdr = chunks.find((c) => c.type === 'IHDR').data;
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const colour = ihdr[9];
  const pal = chunks.find((c) => c.type === 'PLTE')?.data;
  const trns = chunks.find((c) => c.type === 'tRNS')?.data;

  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const raw = inflateSync(idat);
  const chan = colour === 6 ? 4 : colour === 2 ? 3 : 1;
  const stride = width * chan;
  const px = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const f = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = px.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= chan ? cur[x - chan] : 0;
      const b = prev[x];
      const c = x >= chan ? prev[x - chan] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 0xff;
    }
  }
  return {
    width,
    height,
    colour,
    rgb(x, y) {
      if (colour === 3) {
        const idx = px[y * stride + x];
        const o = idx * 3;
        return [pal[o], pal[o + 1], pal[o + 2], trns && idx < trns.length ? trns[idx] : 255];
      }
      const o = y * stride + x * chan;
      return chan === 1 ? [px[o], px[o], px[o], 255] : [px[o], px[o + 1], px[o + 2], chan === 4 ? px[o + 3] : 255];
    }
  };
}

// --- the sheet's face row -------------------------------------------------------------------------------
const sheet = decode('public/assets/entity/zombie_villager/zombie_villager.png');
const sheetColours = new Map();
// The face row of the head rect is y = 8..15, across x 8..24 (front face) -- and the whole rect for completeness.
for (let y = 8; y < 16; y++) {
  for (let x = 0; x < 32; x++) {
    const [r, g, b, a] = sheet.rgb(x, y);
    if (a < 128) continue;
    const k = `${r},${g},${b}`;
    sheetColours.set(k, (sheetColours.get(k) || 0) + 1);
  }
}
console.log(`  sheet face area: ${sheetColours.size} distinct colours`);
const sheetWhites = [...sheetColours.keys()].filter((k) => {
  const [r, g, b] = k.split(',').map(Number);
  return r > 200 && g > 200 && b > 200;
});
const sheetReds = [...sheetColours.keys()].filter((k) => {
  const [r, g, b] = k.split(',').map(Number);
  return r > 140 && g < 90 && b < 90;
});
console.log(`    near-white colours in the face area: ${sheetWhites.join(' | ') || 'NONE'}`);
console.log(`    red colours in the face area:        ${sheetReds.join(' | ') || 'NONE'}`);

// --- the render -----------------------------------------------------------------------------------------
const shot = decode(process.argv[2]);
console.log(`\n  capture: ${shot.width}x${shot.height}`);

// The mob renders in the right-hand viewport. Sample its central band, above the readout panel.
const tallies = new Map();
for (let y = 120; y < 330; y++) {
  for (let x = 520; x < 700; x++) {
    const [r, g, b] = shot.rgb(x, y);
    const k = `${r},${g},${b}`;
    tallies.set(k, (tallies.get(k) || 0) + 1);
  }
}
const top = [...tallies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
console.log('  dominant colours in the mob area:');
for (const [k, n] of top) {
  const inSheet = sheetColours.has(k) ? 'IN sheet face' : '';
  console.log(`    rgb(${k})  x${String(n).padStart(5)}  ${inSheet}`);
}

// Focus on the bright marks, which are what read as "noise".
const bright = [...tallies.entries()].filter(([k]) => {
  const [r, g, b] = k.split(',').map(Number);
  return r > 150 && (r > g + 40 || (r > 200 && g > 200 && b > 200));
}).sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log('\n  the bright marks specifically:');
if (!bright.length) console.log('    none found');
for (const [k, n] of bright) {
  console.log(`    rgb(${k})  x${n}  ${sheetColours.has(k) ? 'MATCHES the sheet face area' : 'not in the sheet face area'}`);
}
