// Repair the half-applied library rename that the batch-4 merge exposed.
//
// src/structureLibrary.js was deleted and src/buildingLibrary.js added, but only the FILE was renamed:
// the module still exports `StructureLibrary` with `getAllStructures`/`getStructure`/
// `executeStructureBuild`. main.js was moved to the new filename; creativeCatalog.js and inventory.js
// were not, so both imported a module that no longer exists and every test that loads the inventory or
// the catalogue failed with ERR_MODULE_NOT_FOUND.
//
// This fixes only the two import PATHS, which is the minimal change that makes them resolve. It leaves
// the symbol names alone, because they match what the module actually exports.
import { readFileSync, writeFileSync } from 'node:fs';

const W = 'C:/Users/pope1/AppData/Local/Temp/m4wt/';
const FILES = ['src/creativeCatalog.js', 'src/inventory.js'];
const FROM = "./structureLibrary.js";
const TO = "./buildingLibrary.js";

for (const file of FILES) {
  const before = readFileSync(W + file, 'utf8');
  if (!before.includes(FROM)) { console.log(`  ${file}: already correct`); continue; }
  const after = before.split(FROM).join(TO);
  writeFileSync(W + file, after, 'utf8');
  console.log(`  ${file}: import path repaired`);
}

// Verify no source file still names the deleted module, and that the replacement exists.
import { existsSync } from 'node:fs';
if (existsSync(W + 'src/structureLibrary.js')) throw new Error('structureLibrary.js exists after all');
if (!existsSync(W + 'src/buildingLibrary.js')) throw new Error('buildingLibrary.js is missing');

for (const file of FILES) {
  const text = readFileSync(W + file, 'utf8');
  if (text.includes(FROM)) throw new Error(`${file} still references the deleted module`);
  console.log(`  ${file}: clean`);
}
