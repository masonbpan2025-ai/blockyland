// Find every mob whose texture is GENERATED rather than loaded, across ALL source modules.
//
// Round fifty-two found the wither skeleton drawing its whole skin with an 8x8 procedural `boneTexture()` while a real
// 64x32 sheet existed. `audit-procedural-sources.mjs` MISSED IT, because that script only reads `src/mobs.js` and this
// generator lives in `src/witherSkeletonModel.js`. A spawner can look innocent while the model it calls generates its
// own texture.
//
// So this walks every module and reports, per file, the generators it defines AND whether that file ever loads a real
// sheet. A file that generates a texture and never calls `loadTexture` is the exact shape of the wither skeleton's
// defect.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = 'src';

/** Every .js file under src/. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = walk(root);
const rows = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const defines = [...new Set([...src.matchAll(/(?:export\s+)?function\s+(create\w*Texture|boneTexture|blazeSkin)\s*\(/g)].map((m) => m[1]))];
  if (!defines.length) continue;

  const callsOwnGenerator = defines.some((name) => new RegExp(`\\b${name}\\s*\\(`).test(
    src.replace(new RegExp(`function\\s+${name}\\s*\\(`, 'g'), '')
  ));
  const loadsSheet = /loadTexture\(/.test(src);
  const hasSheetPath = /_SKIN_PATH|\.png'/.test(src);

  rows.push({
    file: relative('.', file).replace(/\\/g, '/'),
    defines,
    callsOwnGenerator,
    loadsSheet,
    hasSheetPath
  });
}

console.log('  modules that DEFINE a texture generator:');
for (const r of rows) {
  const verdict = r.loadsSheet
    ? 'loads a real sheet too (fallback)'
    : (r.hasSheetPath ? 'NAMES a sheet but never loads it' : 'GENERATES ONLY -- no real sheet at all');
  console.log(`    ${r.file.padEnd(34)} [${r.defines.join(', ')}]`);
  console.log(`    ${''.padEnd(34)} ${verdict}`);
}

const suspects = rows.filter((r) => !r.loadsSheet);
console.log(`\n  ${rows.length} module(s) define a generator; ${suspects.length} never load a real sheet.`);
for (const r of suspects) console.log(`    SUSPECT: ${r.file}`);
