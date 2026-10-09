// Complete the half-applied structure->building rename so the batch-4 merge can be verified at all.
//
// The situation: commit b382bd8 renamed FILES only (structureLibrary.js -> buildingLibrary.js,
// structures/ -> buildings/, structureContext.js -> buildingContext.js, structureStudio.js ->
// buildingStudio.js) and updated the import paths in main.js. It did NOT rename the exported symbols,
// so on master:
//
//   buildingLibrary.js   imports './structures/index.js'          (deleted) and exports StructureLibrary
//   buildingStudio.js    imports './structureLibrary.js'          (deleted), 21 stale references
//   creativeCatalog.js   imports './structureLibrary.js'          (deleted)
//   inventory.js         imports './structureLibrary.js'          (deleted)
//   worldAgent.js        imports './structureContext.js'          (deleted)
//   buildings/index.js   exports BUILTIN_STRUCTURES, not BUILTIN_BUILDINGS
//
// Every test that loads the inventory or the catalogue therefore fails with ERR_MODULE_NOT_FOUND,
// which is why this batch could not be verified. A later commit on the working line finished the
// rename, so that tree runs. This takes the renamed files from there.
//
// Scope: only the files the rename touches. blocks.js, extraContent.js, the scripts, the docs and the
// tests are NOT copied, because those carry this batch and other agents' concurrent work.
import { copyFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';

const SRC = 'C:/Users/pope1/.gemini/antigravity/scratch/Minecraft_in_browser/';
const DST = 'C:/Users/pope1/AppData/Local/Temp/m4wt/';

/** Every file the rename touches, relative to a tree root. */
const FILES = [
  ...readdirSync(SRC + 'src/buildings').map((f) => `src/buildings/${f}`),
  'src/buildingLibrary.js',
  'src/buildingStudio.js',
  'src/buildingContext.js',
  'src/creativeCatalog.js',
  'src/inventory.js',
  'src/main.js',
  'src/worldAgent.js',
  'src/ui.js',
];

const copied = [];
for (const f of FILES) {
  if (!existsSync(SRC + f)) throw new Error(`source missing: ${f}`);
  const before = existsSync(DST + f) ? readFileSync(DST + f, 'utf8') : null;
  copyFileSync(SRC + f, DST + f);
  const after = readFileSync(DST + f, 'utf8');
  copied.push({ f, changed: before !== after });
}

console.log(`copied ${copied.length} files (${copied.filter((c) => c.changed).length} changed)`);
for (const c of copied.filter((c) => c.changed)) console.log('  updated ' + c.f);

// The renamed directory and files must exist, and the old names must be gone.
for (const must of ['src/buildings/index.js', 'src/buildingLibrary.js', 'src/buildingContext.js']) {
  if (!existsSync(DST + must)) throw new Error(`expected ${must} to exist`);
}
for (const mustNot of ['src/structures', 'src/structureLibrary.js', 'src/structureContext.js', 'src/structureStudio.js']) {
  if (existsSync(DST + mustNot)) throw new Error(`stale path still present: ${mustNot}`);
}

// No source file may reference the deleted modules or the deleted directory.
const stale = [];
for (const f of FILES) {
  const text = readFileSync(DST + f, 'utf8');
  for (const bad of ['structureLibrary', 'structureContext', 'structureStudio', "'./structures/"]) {
    if (text.includes(bad)) stale.push(`${f} -> ${bad}`);
  }
}
if (stale.length) throw new Error(`stale references remain:\n  ${stale.join('\n  ')}`);
console.log('\nrename complete; no stale references in the renamed files');
