#!/usr/bin/env node
// Bring a checkout's block textures up to the state the tests expect.
//
// Why this exists. Three separate things have to happen in order, and doing them by hand has repeatedly
// cost a debugging cycle: the downloader fetches what the definitions reference, but two families of
// texture are COMPOSED from other textures rather than downloaded (the candle cakes and the potted
// plants), and the composers need their inputs fetched first. Skipping a step produces failures that look
// like code bugs -- a wall sign that meshes as a flower, a potted plant with no sprite -- when the only
// problem is that public/assets is gitignored and therefore empty in a fresh worktree.
//
// Usage:
//   node scripts/restore-block-assets.mjs
//
// Requires: network access, and Python with Pillow for the two composers.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function run(label, command, args, options = {}) {
  process.stdout.write(`\n--- ${label}\n`);
  try {
    const out = execFileSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, ...options });
    const tail = out.trim().split('\n').slice(-3).join('\n');
    if (tail) console.log(tail);
    return true;
  } catch (error) {
    const detail = (error.stdout || '') + (error.stderr || '');
    console.error(`FAILED: ${label}`);
    if (detail.trim()) console.error(detail.trim().split('\n').slice(-12).join('\n'));
    return false;
  }
}

const node = process.execPath;
let ok = true;

// 1. Everything the block definitions reference directly.
ok = run('fetch textures referenced by block definitions',
  node, ['scripts/block-parity/fetch-missing-textures.mjs', '--apply']) && ok;

// 2. The two composers' inputs. These are NOT referenced by any definition -- the definitions point at the
//    composed output -- so the downloader above does not fetch them, and the composers fail without them.
const COMPOSER_INPUTS = [
  'cake_top.png', 'cake_side.png', 'cake_bottom.png', 'candle.png',
  ...['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray',
    'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'].map((c) => `${c}_candle.png`),
  'flower_pot.png',
  ...['acacia_sapling', 'allium', 'azure_bluet', 'bamboo_stage0', 'birch_sapling', 'blue_orchid',
    'brown_mushroom', 'cactus_side', 'cherry_sapling', 'closed_eyeblossom', 'cornflower',
    'crimson_fungus', 'crimson_roots', 'dandelion', 'dark_oak_sapling', 'dead_bush', 'fern',
    'jungle_sapling', 'lily_of_the_valley', 'mangrove_propagule', 'oak_sapling', 'open_eyeblossom',
    'orange_tulip', 'oxeye_daisy', 'pale_oak_sapling', 'pink_tulip', 'poppy', 'red_mushroom',
    'red_tulip', 'spruce_sapling', 'torchflower', 'warped_fungus', 'warped_roots', 'white_tulip',
    'wither_rose', 'azalea_side', 'flowering_azalea_side'].map((p) => `${p}.png`),
];
const missingInputs = COMPOSER_INPUTS.filter((f) => !existsSync(path.join(root, 'public', 'assets', 'blocks', f)));
if (missingInputs.length) {
  console.log(`\n--- ${missingInputs.length} composer inputs absent; fetching them`);
  // Reuse the downloader's mirror logic by fetching here, so this script stays self-contained.
  const MIRROR = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.21.4';
  const { writeFileSync } = await import('node:fs');
  for (const file of missingInputs) {
    try {
      const res = await fetch(`${MIRROR}/blocks/${file}`);
      if (!res.ok) { console.error(`  MISS ${file}`); ok = false; continue; }
      writeFileSync(path.join(root, 'public', 'assets', 'blocks', file), Buffer.from(await res.arrayBuffer()));
      console.log(`  got ${file}`);
    } catch {
      console.error(`  FAIL ${file}`);
      ok = false;
    }
  }
} else {
  console.log('\n--- all composer inputs already present');
}

// 3. The texture transforms. All three need Python + Pillow; a missing Python is reported, not fatal,
//    since the blocks they feed fail their own tests with a message naming the script to run.
//
//    ORDER MATTERS BETWEEN THESE TWO. `slice-texture-frames.py` runs FIRST because the cauldron composer
//    overlays fluid tiles onto the pot, and two of those fluids (water, lava) are animation strips that
//    have to be sliced before they can be overlaid. Running the composer first would overlay a 16x512
//    strip onto a 16x16 pot, which Pillow would either refuse or silently misplace.
const TRANSFORMS = [
  'slice-texture-frames.py',
  'compose-candle-cakes.py',
  'compose-potted-plants.py',
  'compose-filled-cauldrons.py',
];

for (const script of TRANSFORMS) {
  const done = run(`transform via ${script}`, 'python', [path.join('scripts', script)]);
  if (!done) {
    console.error(`\n  ${script} did not run. The blocks it feeds will fail with a message naming it.`);
    console.error('  It needs Python 3 with Pillow.');
    ok = false;
  }
}

console.log(`\n=== block asset restore ${ok ? 'complete' : 'INCOMPLETE'}`);
process.exitCode = ok ? 0 : 1;
