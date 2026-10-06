// Pair each PART NAME to its (u, v) in a decompiled vanilla model, in the order the decompiler emits them.
//
// Round ninety-seven established that my by-eye pairing of `method_32101(u, v)` calls to boxes is the one step in this
// whole recipe that has NEVER been verified -- and that every failure (the fish, the camel twice) is consistent with the
// numbers belonging to a different part than I assumed.
//
// The decompiled shape is:
//
//   $$3.method_32117(
//      "tail", class_5606.method_32108().method_32101(122, 0).method_32097(...), class_5603...
//
// so a part name and its UV are on ADJACENT LINES, but not always -- some calls put the name on its own line and the
// builder on the next, and some parts are nested inside others. This reads them as a sequence rather than by eye.
import { readFileSync, readdirSync } from 'node:fs';

const [fileArg, classArg] = process.argv.slice(2);
let file = fileArg;

// A `.java` path is used directly; anything else is treated as a class id or readable name to look up.
if (!file || !file.endsWith('.java')) {
  const wanted = fileArg ?? classArg;
  const dir = process.env.TEMP + '/mob-decompile/decompiled';
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.java')); } catch { /* not decompiled yet */ }
  const found = files.find((f) => f === wanted + '.java')
    ?? files.find((f) => { try { return readFileSync(dir + '/' + f, 'utf8').includes(wanted); } catch { return false; } });
  if (!found) {
    console.log(`  ${wanted}: not in the decompiled cache (${files.length} file(s) there)`);
    console.log('  decompile it first:  node scripts/mob-visual/decompile-model.mjs <Name>');
    process.exit(0);
  }
  file = dir + '/' + found;
}
if (!file || !file.endsWith('.java')) { console.log('  usage: node pair-part-uv.mjs <Class.java | class_7751 | EntityModelName>'); process.exit(0); }

const src = readFileSync(file, 'utf8');
const lines = src.split('\n');

/** Collect every `method_32117("name", ...)` with the (u,v) and box size that follow it, up to the next part. */
const parts = [];
for (let i = 0; i < lines.length; i++) {
  const nameMatch = lines[i].match(/"([a-z_0-9]+)"\s*,\s*$/);
  if (!nameMatch) continue;

  // The name is on its own line; the builder follows, possibly a line or two later.
  let j = i + 1, uv = null, box = null;
  while (j < i + 6 && j < lines.length) {
    const uvM = lines[j].match(/method_32101\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/);
    if (uvM && !uv) uv = [Number(uvM[1]), Number(uvM[2])];
    const boxM = lines[j].match(/method_3209[78]\(\s*(-?[\d.]+)F\s*,\s*(-?[\d.]+)F\s*,\s*(-?[\d.]+)F\s*,\s*(-?[\d.]+)F\s*,\s*(-?[\d.]+)F\s*,\s*(-?[\d.]+)F/);
    if (boxM && !box) box = [Number(boxM[4]), Number(boxM[5]), Number(boxM[6])];
    if (uv && box) break;
    j++;
  }
  parts.push({ name: nameMatch[1], uv, box, line: i + 1 });
}

// Also catch parts where the name and builder are on the SAME line.
for (const [i, line] of lines.entries()) {
  const m = line.match(/\("([a-z_0-9]+)",\s*class_5606\.method_32108\(\)([^)]*(?:\([^)]*\)[^)]*)*)/);
  if (!m) continue;
  if (parts.some((p) => p.line === i + 1)) continue;
  const uvM = line.match(/method_32101\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/);
  const boxM = line.match(/method_3209[78]\(\s*(-?[\d.]+)F\s*,\s*(-?[\d.]+)F\s*,\s*(-?[\d.]+)F\s*,\s*(-?[\d.]+)F\s*,\s*(-?[\d.]+)F\s*,\s*(-?[\d.]+)F/);
  parts.push({
    name: m[1], line: i + 1,
    uv: uvM ? [Number(uvM[1]), Number(uvM[2])] : null,
    box: boxM ? [Number(boxM[4]), Number(boxM[5]), Number(boxM[6])] : null,
  });
}

// Texture size, which every rectangle is relative to.
const texM = src.match(/method_32110\(\$\$?\d+,\s*(\d+)\s*,\s*(\d+)\s*\)/);

console.log(`  ${file.split(/[\\/]/).pop()}   texture ${texM ? texM[1] + 'x' + texM[2] : '(not found)'}`);
console.log(`  ${parts.length} named part(s), in DECOMPILE ORDER:\n`);
console.log('    line   part name        (u, v)        box (w x h x d)');
for (const p of parts) {
  const uv = p.uv ? `(${p.uv[0]}, ${p.uv[1]})` : '--';
  const box = p.box ? `${p.box[0]} x ${p.box[1]} x ${p.box[2]}` : '--';
  console.log(`    ${String(p.line).padStart(4)}   ${p.name.padEnd(15)} ${uv.padEnd(13)} ${box}`);
}
