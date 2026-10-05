// Probe every remaining missing block for art under ANY suffix variant, plus the two special cases that
// defeated earlier rounds: the animated strips and the entity skin sheets.
//
// Why this is worth redoing: three separate batches were unblocked by finding art under a name that a
// bare-name probe missed (`_side`/`_top` for ancient debris, `_top` for tall grass, the composed candle
// cakes and potted plants). So the previous "no art" conclusions deserve a wider net before the goal is
// reported as art-blocked.
import { readFileSync } from 'node:fs';
import { compareBlockLists } from '../../src/blockNameMatch.js';

const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const MIRRORS = {
  '1.21.4': 'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.21.4/blocks',
  '1.20.2': 'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.20.2/blocks',
  entity: 'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.21.4/entity',
};

const vanilla = JSON.parse(readFileSync(root + '.cache/mc-data/blocks.json', 'utf8'));
const { missing } = compareBlockLists(vanilla.map((b) => b.name));

const VARIANTS = ['', '_top', '_side', '_bottom', '_front', '_back', '_0', '_stage0', '_stage_0', '_top_off', '_off', '_lit', '_inventory', '_plant', '_head', '_age0'];

async function head(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

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

const rows = await mapLimit(missing, 6, async (name) => {
  const hits = [];
  for (const suffix of VARIANTS) {
    const file = name + suffix + '.png';
    for (const [label, base] of Object.entries(MIRRORS)) {
      if (await head(`${base}/${file}`)) hits.push(`${label}:${file}`);
    }
  }
  return { name, hits };
});

const withArt = rows.filter((r) => r.hits.length);
const without = rows.filter((r) => !r.hits.length);

console.log(`missing blocks: ${missing.length}`);
console.log(`\n=== ART FOUND (${withArt.length}) ===`);
for (const r of withArt) console.log(`  ${r.name.padEnd(30)} ${r.hits.join('  ')}`);
console.log(`\n=== nothing found (${without.length}) ===`);
console.log('  ' + without.map((r) => r.name).join(', '));
