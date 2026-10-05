// Regenerate the structure golden-seed file.
//
//   node scripts/update-structure-goldens.mjs
//
// Run this ONLY after checking that a change to the goldens is intended. The whole value of the file is that
// a diff in it means "structure generation changed"; re-running this script to make a failing test pass
// destroys that, which is why the test that reads it says so in its failure message.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { generateGoldens } from './structure-goldens.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, '..', 'tests', 'golden', 'structureSeeds.json');

const goldens = generateGoldens();
writeFileSync(target, `${JSON.stringify(goldens, null, 2)}\n`, 'utf8');

console.log(`wrote ${goldens.entries.length} golden entries to ${path.relative(process.cwd(), target)}`);
if (goldens.unfound.length) {
  console.log(`NOT FOUND within the search bound (no golden recorded): ${goldens.unfound.join(', ')}`);
}
for (const entry of goldens.entries) {
  console.log(`  ${entry.id.padEnd(22)} seed ${entry.seed} chunk ${entry.chunkX},${entry.chunkZ}  pieces ${entry.pieces}  blocks ${entry.blockCount}  ${entry.contentHash}`);
}
