// Measure the UVs `createBoxWithUV` produces with and without explicit pixel dimensions.
//
// The plain zombie renders a correct head with `createBoxWithUV(0.5,0.5,0.5, 0,0, 64,64)` -- NO explicit pixels, so
// tw/th/td are derived as 8/8/8 from the world size. The zombie villager's rebuild passes `8,8,8` explicitly and its
// head renders as noise. If those two produce identical UVs, the pixel arguments are innocent and the fault is
// elsewhere; if they differ, the explicit path is the bug.
import { readFileSync } from 'node:fs';

const src = readFileSync('src/mobs.js', 'utf8');

// Re-implement the function's own arithmetic, read straight from the source so it cannot drift.
const body = src.slice(src.indexOf('function createBoxWithUV'), src.indexOf('function createBoxWithUV') + 1400);
const mapMatch = body.match(/const faceUVMap = \[([\s\S]*?)\];/);
if (!mapMatch) { console.log('  faceUVMap not found'); process.exit(0); }

const faces = [...mapMatch[1].matchAll(/\{\s*x:\s*([^,]+),\s*y:\s*([^,]+),\s*w:\s*([^,]+),\s*h:\s*([^}]+)\}/g)]
  .map((m) => ({ x: m[1].trim(), y: m[2].trim(), w: m[3].trim(), h: m[4].trim() }));

console.log('  face rectangles as written (u = 0, v = 0):');
const names = ['Right(+X)', 'Left(-X)', 'Top(+Y)', 'Bottom(-Y)', 'Front(+Z)', 'Back(-Z)'];
faces.forEach((f, i) => console.log(`    ${names[i].padEnd(11)} x=${f.x.padEnd(16)} y=${f.y.padEnd(12)} w=${f.w.padEnd(6)} h=${f.h}`));

// Evaluate with tw = th = td = 8, texW = texH = 64.
const env = { u: 0, v: 0, tw: 8, th: 8, td: 8 };
console.log('\n  evaluated with tw=th=td=8, texW=texH=64:');
for (const [i, f] of faces.entries()) {
  const x = Function(...Object.keys(env), `return ${f.x};`)(...Object.values(env));
  const y = Function(...Object.keys(env), `return ${f.y};`)(...Object.values(env));
  const w = Function(...Object.keys(env), `return ${f.w};`)(...Object.values(env));
  const h = Function(...Object.keys(env), `return ${f.h};`)(...Object.values(env));
  const u0 = (x / 64).toFixed(3);
  const u1 = ((x + w) / 64).toFixed(3);
  const v1 = (1 - y / 64).toFixed(3);
  const v0 = (1 - (y + h) / 64).toFixed(3);
  console.log(`    ${names[i].padEnd(11)} u ${u0}..${u1}   v ${v0}..${v1}`);
}

console.log('\n  vanilla layout for an 8x8x8 box at (0,0):');
console.log('    Right  x=16  u 0.250..0.375');
console.log('    Front  x= 8  u 0.125..0.250');
console.log('    Left   x= 0  u 0.000..0.125');
console.log('    Back   x=24  u 0.375..0.500');
console.log('    Top    x= 8  v (row 1)');
