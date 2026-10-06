// Check the zombie villager sheet's own dimensions and aspect.
//
// The hypothesis that `createBoxWithUV`'s explicit pixel arguments caused the head noise is now DISPROVED: they produce
// byte-identical face rectangles to the implicit path (tw=th=td=8 either way), and the plain zombie uses the implicit
// path with the same result. So the fault is not the box helper.
//
// What is left is the SHEET. Vanilla's zombie villager is unusual in pairing a 64x64 body texture with a 64x32 overlay,
// and `zombie_villager.png` at 1076 bytes is small for a 64x64 entity skin (comparable skins run 1000-2000 bytes, so
// that is plausible, but the ASPECT is what matters for a UV layout computed against texW = texH = 64).
import { readFileSync } from 'node:fs';

const path = 'public/assets/entity/zombie_villager/zombie_villager.png';
const b = readFileSync(path);
const width = b.readUInt32BE(16);
const height = b.readUInt32BE(20);
console.log(`  ${path}`);
console.log(`    declared size: ${width} x ${height}   (${b.length} bytes)`);
console.log(`    colour type:   ${b[25]}  (6 = RGBA, 2 = RGB)`);

// Compare against the skins already proven to render correctly.
for (const other of [
  'public/assets/entity/zombie/zombie.png',
  'public/assets/entity/chicken.png',
  'public/assets/entity/endermite.png'
]) {
  try {
    const o = readFileSync(other);
    console.log(`    ${other.padEnd(52)} ${o.readUInt32BE(16)} x ${o.readUInt32BE(20)}`);
  } catch { console.log(`    ${other}  (missing)`); }
}

console.log('\n  A UV layout computed with texW = texH = 64 assumes the sheet IS 64x64.');
console.log(`  This sheet is ${width}x${height}, so that assumption ${width === 64 && height === 64 ? 'HOLDS' : 'FAILS'}.`);
