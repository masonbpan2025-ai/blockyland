// Restore the block textures that the hand-added definitions need and that this checkout is missing.
//
// Why this exists. `public/assets/blocks` is gitignored, so a fresh worktree has no block art at all,
// and every hand-added block from the parity batches then fails the "texture exists" check. Doing this
// by hand each time is what this replaces, and it also makes the asset requirement reproducible: given
// network access, anyone can bring a checkout to a state where the block tests pass.
//
// What to fetch is derived from the DEFINITIONS rather than a hard-coded list, so a block added later
// needs no change here. Each missing file is tried against the asset mirror's version directories from
// newest to oldest, because some textures are 1.21.4 additions while others only exist in 1.20.2.
//
// Usage:
//   node scripts/block-parity/fetch-missing-textures.mjs          # report only
//   node scripts/block-parity/fetch-missing-textures.mjs --apply  # download what is missing
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const APPLY = process.argv.includes('--apply');

const MIRROR = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data';
// Newest first: a name present in several should come from the version the game's data is pinned to.
const VERSIONS = ['1.21.4', '1.21.1', '1.20.2', '1.19.1'];

const { BLOCK_DEFS } = await import(new URL('../../src/blocks.js', import.meta.url).href);
const BLOCK_DIR = path.join(root, 'public', 'assets', 'blocks');

// Only the hand-added range. The generated range carries pre-existing art debt that is tracked
// separately by scripts/block-parity/gap-summary.mjs, and is not this script's business.
const HAND_ADDED_ID_FLOOR = 946;

const wanted = new Set();
for (const [id, def] of Object.entries(BLOCK_DEFS)) {
  if (!def?.name || Number(id) < HAND_ADDED_ID_FLOOR) continue;
  for (const file of Object.values(def.textures ?? {})) {
    if (typeof file === 'string' && file.endsWith('.png')) wanted.add(file);
  }
}

// BLOCK TEXTURES THAT ARE COMPOSED RATHER THAN DOWNLOADED. These are outputs of the scripts in
// `scripts/compose-*.py`, which build them from other art, so a 404 under `blocks/` AND `items/` is the
// expected result rather than a failure. Listing them here is what stops the restore step reporting
// INCOMPLETE for a texture the NEXT step is about to produce -- which is exactly what happened with
// `bubble_column.png`, whose composer runs a few lines later in scripts/restore-block-assets.mjs.
//
// They are asserted to be produced by tests/blockRegistryIntegrity.test.js, so skipping them here does not
// let a silently-broken composer through: the test fails instead.
const COMPOSED_TEXTURES = new Set([
  'bubble_column.png',
]);
const composed = [...wanted].filter((f) => COMPOSED_TEXTURES.has(f));
const missing = [...wanted]
  .filter((f) => !COMPOSED_TEXTURES.has(f))
  .filter((f) => !existsSync(path.join(BLOCK_DIR, f)))
  .sort();
if (composed.length) {
  console.log(`${composed.length} texture(s) are composed rather than downloaded: ${composed.join(", ")}`);
}
console.log(`hand-added blocks reference ${wanted.size} textures; ${missing.length} are missing`);
if (!missing.length) {
  console.log('nothing to do');
  process.exit(0);
}
console.log(missing.join('\n'));

if (!APPLY) {
  console.log('\nrun again with --apply to download them');
  process.exit(0);
}

mkdirSync(BLOCK_DIR, { recursive: true });
let fetched = 0;
const failed = [];
for (const file of missing) {
  let done = false;
  for (const version of VERSIONS) {
    try {
      const res = await fetch(`${MIRROR}/${version}/blocks/${file}`);
      if (!res.ok) continue;
      writeFileSync(path.join(BLOCK_DIR, file), Buffer.from(await res.arrayBuffer()));
      console.log(`  ${file}  <- ${version}`);
      fetched++;
      done = true;
      break;
    } catch {
      // Try the next version.
    }
  }

  // SOME BLOCK TEXTURES ONLY EXIST AS ITEM SPRITES, and this is why the fetch above finds nothing for
  // them. A vanilla barrier, light and structure void are INVISIBLE and have NO block tile upstream at any
  // version; their ITEM sprite is the art. Without this fallback the restore step reports them as missing
  // and fails, even though the art is one directory away and the block tile is simply a copy of it.
  if (!done) {
    for (const version of VERSIONS) {
      try {
        const res = await fetch(`${MIRROR}/${version}/items/${file}`);
        if (!res.ok) continue;
        const bytes = Buffer.from(await res.arrayBuffer());
        writeFileSync(path.join(BLOCK_DIR, file), bytes);
        writeFileSync(path.join(path.dirname(BLOCK_DIR), "items", file), bytes);
        console.log(`  ${file}  <- ${version}/items (block tile is a copy of the item sprite)`);
        fetched++;
        done = true;
        break;
      } catch {
        // Try the next version.
      }
    }
  }
  if (!done) failed.push(file);
}

console.log(`\nfetched ${fetched} of ${missing.length}`);
if (failed.length) {
  console.error(`not found in any checked version (${VERSIONS.join(', ')}):`);
  for (const f of failed) console.error('  ' + f);
  process.exitCode = 1;
}
