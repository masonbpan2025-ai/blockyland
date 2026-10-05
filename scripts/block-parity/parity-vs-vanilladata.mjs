// Gap analysis against the repo's own pinned vanilla data (pc/1.21.4), so the result is independent of
// the wiki page's newer revision. Name matching uses the shared vocabulary in src/blockNameMatch.js.
//
// Run: node scripts/parity-audit/parity-vs-vanilladata.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareBlockLists, gameKeysNamedByVanilla } from '../../src/blockNameMatch.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const cache = path.join(root, '.cache', 'mc-data', 'blocks.json');

if (!existsSync(cache)) {
  console.error(`vanilla cache absent at ${cache}; run scripts/generate-mc-data.mjs first`);
  process.exit(1);
}

// minecraft-data names are snake_case identifiers, which the matcher accepts directly.
const vanilla = JSON.parse(readFileSync(cache, 'utf8')).map((x) => x.name);
const { covered, missing } = compareBlockLists(vanilla);
const { named } = gameKeysNamedByVanilla(vanilla);

const fam = {};
for (const n of missing) {
  const parts = n.split('_');
  const suffix = parts.length > 1 ? parts.slice(1).join('_') : parts[0];
  fam[suffix] = (fam[suffix] || 0) + 1;
}

console.log(`pinned vanilla blocks implemented: ${covered.length} / ${vanilla.length}`
  + `  (${(100 * covered.length / vanilla.length).toFixed(1)}%)`);
console.log(`pinned vanilla blocks missing:     ${missing.length}`);
console.log(`game registry keys this list names: ${named.size}`);
console.log('\ntop missing families:');
for (const [k, v] of Object.entries(fam).sort((a, b) => b[1] - a[1]).slice(0, 45)) {
  console.log(String(v).padStart(4), k);
}

writeFileSync(path.join(here, 'missing-vs-vanilladata.txt'), [...missing].sort().join('\n'), 'utf8');
