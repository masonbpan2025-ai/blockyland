// Size the remaining mobs BEFORE starting any of them, using the pattern round sixty-six recorded:
// a FLAT `entity/<name>.png` means a single-appearance mob; a NESTED `entity/<group>/<name>.png` means variants or an
// equipment axis, and therefore more work.
//
// This is cheaper than decompiling each model to find out, and it orders the remaining work by cost rather than by
// whatever comes to mind.
import { execFileSync } from 'node:child_process';

const jar = process.env.APPDATA + '\\.minecraft\\versions\\1.20.4\\1.20.4.jar';

/** The mobs still without a model or skin, from the flat-skin audit, minus the non-mobs. */
const remaining = [
  'armadillo', 'breeze', 'camel', 'camel_husk', 'copper_golem', 'creaking',
  'elder_guardian', 'ender_dragon', 'giant', 'happy_ghast', 'illusioner',
  'piglin_brute', 'pufferfish', 'sniffer', 'trader_llama', 'undead_horse',
  'wandering_trader', 'zombie_horse', 'zombified_piglin', 'tropical_fish'
];

const rows = [];
for (const name of remaining) {
  let out = '';
  try {
    out = execFileSync('node', ['scripts/mob-visual/extract-from-jar.mjs', '--jar', jar, '--find', name], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch { /* the finder exits non-zero when nothing matches */ }

  const paths = [...out.matchAll(/assets\/minecraft\/textures\/entity\/[^\s]+\.png/g)].map((m) => m[0]);
  // Nested means there is a directory between `entity/` and the file.
  const nested = paths.filter((p) => p.replace('assets/minecraft/textures/entity/', '').includes('/'));
  rows.push({ name, total: paths.length, nested: nested.length, sample: (nested[0] ?? paths[0] ?? '(none)').replace('assets/minecraft/textures/entity/', '') });
}

rows.sort((a, b) => (a.nested - b.nested) || (a.total - b.total) || a.name.localeCompare(b.name));

console.log('  mob                 sheets  nested  first path');
for (const r of rows) {
  // CORRECTED: nesting alone is NOT the tell. `fish/pufferfish.png` and `piglin/piglin_brute.png` are CATEGORY FOLDERS
  // holding a single sheet, while the tropical fish has fourteen. The real tell is HOW MANY sheets a mob has: one sheet
  // means a single-appearance mob wherever it sits, and several means variants or an equipment axis.
  const verdict = r.total === 0 ? '?' : (r.total === 1 ? 'SINGLE' : 'VARIANTS/EQUIPMENT');
  console.log(`    ${r.name.padEnd(18)} ${String(r.total).padStart(5)}  ${String(r.nested).padStart(6)}  ${r.sample.padEnd(38)} ${verdict}`);
}
