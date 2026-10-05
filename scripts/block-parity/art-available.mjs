// Report every missing vanilla block whose texture (or an oriented variant of it) exists in the asset
// mirror, so batches can be chosen by available art rather than by guessing family names.
//
// Why this and not a family-by-family probe: a bare-name probe is what made three rounds report azalea,
// dripleaf, tall grass and ancient debris as "art-blocked" when their textures were present under
// part-suffixed names. This checks the suffix variants in one pass.
//
// Usage: node scripts/block-parity/art-available.mjs [--limit N]
import { readFileSync } from 'node:fs';
import { compareBlockLists } from '../../src/blockNameMatch.js';

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const MIRROR = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.21.4';

const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

const vanilla = JSON.parse(readFileSync(root + '.cache/mc-data/blocks.json', 'utf8'));
const { missing } = compareBlockLists(vanilla.map((b) => b.name));

// The suffix variants an orientable block's textures can carry. `_top`/`_side`/`_bottom` are the
// common ones; the numbered ones cover frosted ice and the growth stages.
const VARIANTS = ['', '_top', '_side', '_bottom', '_front', '_0', '_1', '_top_off', '_front_off'];

const found = [];
const absent = [];

async function checkFile(file) {
  try {
    const res = await fetch(`${MIRROR}/blocks/${file}`, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

// Run with a small concurrency window: ~190 blocks x 9 variants is over 1700 requests, and firing them
// all at once gets rate-limited rather than answered.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

await mapLimit(missing, 8, async (name) => {
  const results = await mapLimit(VARIANTS, 3, (suffix) => checkFile(name + suffix + '.png'));
  const hit = VARIANTS.filter((_, i) => results[i]).map((s) => name + s + '.png');
  if (hit.length) found.push({ name, files: hit });
  else absent.push(name);
});

console.log(`missing blocks: ${missing.length}`);
console.log(`\n=== ART AVAILABLE (${found.length}) ===`);
for (const f of found.slice(0, LIMIT)) console.log(`  ${f.name.padEnd(34)} ${f.files.join(', ')}`);
console.log(`\n=== no art found under any variant (${absent.length}) ===`);
console.log('  ' + absent.slice(0, Math.min(absent.length, 60)).join(', '));
