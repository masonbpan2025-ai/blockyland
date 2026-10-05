// Which entries in the generated harvest table have no corresponding block in the game?
//
// A harvest entry with no block is a block the generator has data for but the registry never adopted --
// which is how COBBLED_DEEPSLATE stayed invisible while its slab, stair and wall variants existed and
// referenced it.
//
// Run: node scripts/block-parity/parity-harvest-orphans.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLOCKS, BLOCK_DEFS } from '../../src/blocks.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const text = readFileSync(path.join(root, 'src/blockHarvestData.js'), 'utf8');
const keys = [...text.matchAll(/^  ([a-z0-9_]+):\s*\{/gm)].map((m) => m[1]);

const game = new Set();
for (const [k, v] of Object.entries(BLOCKS)) if (typeof v === 'number') game.add(k.toLowerCase());
for (const [, d] of Object.entries(BLOCK_DEFS)) {
  if (d?.name) game.add(String(d.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
}

const orphans = keys.filter((k) => !game.has(k));
console.log(`harvest-table entries: ${keys.length}`);
console.log(`harvest entries with NO game block: ${orphans.length}`);
console.log(orphans.join(', '));
