// Sample the zombie villager sheet's HEAD rectangle, which is the one region I have not yet looked at directly.
//
// Five earlier explanations are already ruled out by measurement: the box helper's arithmetic (UVs match vanilla
// exactly), the explicit pixel arguments (identical either way), the material (the nose shares it and renders fine), the
// texture size (64x64 as assumed), and palette encoding (converted to RGBA, render unchanged).
//
// So print the pixels. The head's rectangle for an 8x8x8 box at (0,0) is x 0..32, y 0..16.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const path = 'public/assets/entity/zombie_villager/zombie_villager.png';
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
const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
const raw = inflateSync(idat);

const bpp = colour === 6 ? 4 : 3;
const stride = width * bpp;
const px = Buffer.alloc(height * stride);
let pos = 0;
for (let y = 0; y < height; y++) {
  const f = raw[pos++];
  const line = raw.subarray(pos, pos + stride);
  pos += stride;
  const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
  const cur = px.subarray(y * stride, (y + 1) * stride);
  for (let x = 0; x < stride; x++) {
    const a = x >= bpp ? cur[x - bpp] : 0;
    const b = prev[x];
    const c = x >= bpp ? prev[x - bpp] : 0;
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

const at = (x, y) => {
  const o = y * stride + x * bpp;
  const a = colour === 6 ? px[o + 3] : 255;
  return [px[o], px[o + 1], px[o + 2], a];
};

console.log(`  sheet ${width}x${height}, colour type ${colour}`);
console.log('\n  HEAD rectangle x 0..32, y 0..16 -- alpha as a character (# opaque, . transparent):');
const t0 = Date.now();
for (let y = 0; y < 16; y++) {
  let line = '    ';
  for (let x = 0; x < 32; x++) {
    const [, , , a] = at(x, y);
    line += a >= 128 ? '#' : (a > 0 ? '+' : '.');
  }
  line += '   y=' + y;
  console.log(line);
}
void t0;

// How much of the head rect is actually opaque?
let opaque = 0;
for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) if (at(x, y)[3] >= 128) opaque++;
console.log(`\n  opaque pixels in the head rect: ${opaque} / 512`);

// The distinct opaque colours, which is what a face should provide.
const seen = new Map();
for (let y = 0; y < 16; y++) {
  for (let x = 0; x < 32; x++) {
    const [r, g, b, a] = at(x, y);
    if (a < 128) continue;
    const k = `${r},${g},${b}`;
    seen.set(k, (seen.get(k) || 0) + 1);
  }
}
console.log(`  distinct opaque colours: ${seen.size}`);
[...seen.entries()].sort((p, q) => q[1] - p[1]).slice(0, 10)
  .forEach(([k, n]) => console.log(`    rgb(${k})  x${n}`));
