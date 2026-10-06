// Confirm the coordinate invariant across the mobs already converted, so the remaining ones can be converted ONCE.
//
// Round fifty concluded that the frame conversion should come FIRST rather than last, because the silverfish, blaze and
// zombie villager each ended with one placement number unconverted. Before applying that to a new mob, check whether the
// converted mobs actually share one convention -- if they do, it is a rule and not a per-mob judgement.
//
// For each part position found in the decompiled sources, print `y` and `24 - y`, because 24 units is one and a half
// blocks and appears repeatedly in vanilla's entity models.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.env.TEMP + '/mob-decompile/decompiled';
let files = [];
try { files = readdirSync(dir).filter((f) => f.endsWith('.java')); }
catch { console.log('  no decompiled sources at ' + dir); process.exit(0); }

const models = [
  ['silverfish', 'class_604'],
  ['endermite', 'class_565'],
  ['zombie villager', 'class_619'],
  ['blaze', 'class_555'],
  ['wolf', 'class_624'],
  ['frog', 'class_7198'],
  ['warden', 'class_7280']
];

console.log('  mob              part offsets found (method_32090 / method_32091 first argument)');
for (const [name, cls] of models) {
  const file = files.find((f) => f.startsWith(cls));
  if (!file) { console.log(`    ${name.padEnd(16)} (not decompiled)`); continue; }
  const src = readFileSync(join(dir, file), 'utf8');
  const ys = [...src.matchAll(/method_3209[01]\(\s*(-?[\d.]+)F/g)].map((m) => Number(m[1]));
  const uniq = [...new Set(ys)].sort((a, b) => a - b);
  const heightOffsets = [...new Set(uniq.map((y) => Number((24 - y).toFixed(1))))].sort((a, b) => a - b);
  console.log(`    ${name.padEnd(16)} y = ${uniq.join(', ')}`);
  console.log(`    ${''.padEnd(16)} 24 - y = ${heightOffsets.join(', ')}`);
}

console.log('\n  Vanilla entity models are authored with the entity at its OWN origin, which for a land mob sits at the');
console.log('  FEET. This project uses the group origin as the feet too, so a straight transcription should need only a');
console.log('  vertical shift of the whole assembly -- which is exactly what groundModel does. Where that has failed, the');
console.log('  fault has been a part placed in a DIFFERENT sub-frame (a bone, a rod ring, an arm pivot).');
