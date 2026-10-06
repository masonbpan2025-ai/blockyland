// Check, BEFORE binding a sheet, whether a mob's existing model has the same PROPORTIONS as vanilla's.
//
// Round seventy-three's revert is the reason this exists. The giant's model is bespoke (`createGiantModel` in a behaviour
// module), vanilla's is a scaled zombie, and binding the zombie sheet to boxes built for flat colours mangled the render --
// while a material report and a green test suite BOTH said success.
//
// Round sixty-one had already produced the rule by accident: the horse worked because its boxes are the same SHAPES as
// vanilla's at a smaller scale (torso .625x.625x1.375 against 10x10x12), and the strider failed because its body was a
// 1x1x1 box against 16x14x16. So the check is: COMPARE THE RATIOS, NOT THE SIZES.
//
// This reads the project's box dimensions from a spawner or model module, and vanilla's from the decompiled source, then
// reports whether each part's RATIO to the body matches. A part whose ratio is wrong will not receive the atlas rectangle
// sensibly, and the sheet should not be bound until it is resized.
import { readFileSync, readdirSync } from 'node:fs';

const args = process.argv.slice(2);
// The decompiled file is named by class id, so accept it as an optional third argument.
const [modulePath, classPrefix, intermediary] = args;
if (!modulePath) {
  console.log('  usage: node check-proportional-fit.mjs <src/module.js> [ClassPrefix]');
  console.log('  e.g.   node check-proportional-fit.mjs src/giantModel.js GiantEntityModel');
  process.exit(0);
}

// --- the project's boxes ---------------------------------------------------------------------------------
const src = readFileSync(modulePath, 'utf8');
const boxes = [...src.matchAll(/BoxGeometry\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/g)]
  .map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);

console.log(`  ${modulePath}: ${boxes.length} BoxGeometry(...) found`);
if (!boxes.length) { console.log('    (none -- the module may build geometry another way)'); process.exit(0); }

// The largest box is taken as the body, which is the convention in every model here.
const norm = (b) => {
  const max = Math.max(...b);
  return b.map((v) => (max ? +(v / max).toFixed(3) : 0));
};
console.log('    ratios (each box normalised to its own largest side):');
for (const b of boxes.slice(0, 10)) console.log(`      [${b.join(', ')}]  ->  [${norm(b).join(', ')}]`);

// --- vanilla's boxes -------------------------------------------------------------------------------------
if (classPrefix) {
  const dir = process.env.TEMP + '/mob-decompile/decompiled';
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.java')); } catch { /* nothing decompiled yet */ }

  const file = files.find((f) => {
    try {
      const text = readFileSync(dir + '/' + f, 'utf8');
      // Match either the readable name or the intermediary class id, because the decompiled file is NAMED by the class id
      // (`class_3969.java`) even when its contents mention the readable name only in a comment.
      return text.includes(classPrefix) || (intermediary && f.startsWith(intermediary + '.'));
    } catch { return false; }
  });

  if (!file) {
    console.log(`\n  vanilla ${classPrefix}: NOT decompiled yet.`);
    console.log(`    run: node scripts/mob-visual/decompile-model.mjs ${classPrefix.replace(/EntityModel$/, '')}EntityModel`);
  } else {
    const vsrc = readFileSync(dir + '/' + file, 'utf8');
    // The first method_32097/32098 per part is its box; the size is the 4th, 5th and 6th floats.
    const vboxes = [...vsrc.matchAll(/method_3209[78]\(\s*(-?[\d.]+)F\s*,\s*(-?[\d.]+)F\s*,\s*(-?[\d.]+)F\s*,\s*(-?[\d.]+)F\s*,\s*(-?[\d.]+)F\s*,\s*(-?[\d.]+)F/g)]
      .map((m) => [Number(m[4]), Number(m[5]), Number(m[6])])
      .filter((b) => b[0] > 0 && b[1] > 0 && b[2] > 0);

    console.log(`\n  vanilla ${classPrefix} (${file}): ${vboxes.length} boxes`);
    console.log('    ratios (each box normalised to its own largest side):');
    for (const b of vboxes.slice(0, 10)) console.log(`      [${b.join(', ')}]  ->  [${norm(b).join(', ')}]`);

    // The verdict: does any project box have a matching ratio set?
    const vRatios = vboxes.map(norm);
    const pRatios = boxes.map(norm);
    const matches = pRatios.filter((p) => vRatios.some((v) => p.every((x, i) => Math.abs(x - v[i]) < 0.12)));
    console.log(`\n  MATCHED PROPORTIONS: ${matches.length} of ${pRatios.length} project boxes`);
    if (matches.length === 0) {
      console.log('    NONE MATCH. Binding a sheet here will distort -- resize the boxes to vanilla\'s ratios first.');
    } else if (matches.length < pRatios.length) {
      console.log('    PARTIAL. Only the matched parts can take a rectangle safely.');
    } else {
      console.log('    ALL MATCH. The sheet can be bound with vanilla\'s rectangles.');
    }
  }
}
