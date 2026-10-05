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
  // The cauldron family's inputs. `cauldron.png` does not exist upstream, so the pot is three faces, and
  // the fluids have to be fetched for the composer to overlay. Same trap as `candle.png` above: the block
  // definitions name the COMPOSED output, so the downloader never sees these.
  'cauldron_top.png', 'cauldron_side.png', 'cauldron_bottom.png',
  'water_still.png', 'lava_still.png', 'powder_snow.png',
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

// 2b. The ENTITY SKIN SHEETS, which are not block textures and live in a different mirror directory. The
//     transformer that needs them crops mob head faces out of the standard head region, so it cannot run
//     without them. They are fetched into a nested `entity/<mob>/<mob>.png` layout because that is the
//     path the extractor names -- note that `download_assets.js` fetches some of the same sheets into a
//     FLAT `entity/<mob>.png` layout for the mob renderer, and the two are deliberately separate.
const ENTITY_SHEETS = [
  'skeleton/skeleton.png',
  'skeleton/wither_skeleton.png',
  'zombie/zombie.png',
  'creeper/creeper.png',
  'player/wide/steve.png',
  'piglin/piglin.png',
  // The ender dragon lives under its own mob directory rather than a bare mob name, and its sheet is a
  // 256x256 model texture rather than a 64x32 skin -- the extractor handles it as a special case.
  'enderdragon/dragon.png',
  // The sniffer, whose palette the sniffer egg's composer reads. Not a head, and not used by the extractor;
  // it is here because a composer needs it and this is the step that fetches entity art.
  'sniffer/sniffer.png',
  // THE BUBBLE PARTICLE, which is a composer input rather than entity art. It lives under `particle/`, and
  // `compose-bubble-column.py` cannot run without it -- it is the whole reason the bubble column has a
  // texture, since vanilla ships no `bubble_column` block tile at all. It is listed HERE rather than among
  // the block textures because `fetch-missing-textures.mjs` derives its list from the block DEFINITIONS and
  // only ever looks under `blocks/` and `items/`; a particle sprite is neither.
  '@particle/bubble.png',
];
{
  const assetsRoot = path.join(root, 'public', 'assets');
  // An entry beginning with `@` names a directory OTHER than `entity/`: `@particle/bubble.png` means
  // `particle/bubble.png`. Resolved here rather than with a second list so the presence check, the fetch
  // and the destination path all stay in one place.
  const resolve = (f) => (f.startsWith('@')
    ? { rel: f.slice(1), dir: '' }
    : { rel: f, dir: 'entity' });

  const absent = ENTITY_SHEETS.filter((f) => !existsSync(path.join(assetsRoot, resolve(f).dir, resolve(f).rel)));
  if (!absent.length) {
    console.log('\n--- all entity skin sheets and composer inputs already present');
  } else {
    console.log(`\n--- ${absent.length} entity/composer input(s) absent; fetching them`);
    const MIRROR = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.21.4';
    const { writeFileSync, mkdirSync } = await import('node:fs');
    for (const entry of absent) {
      const { rel, dir } = resolve(entry);
      const dest = path.join(assetsRoot, dir, rel);
      const urlPath = dir ? `${dir}/${rel}` : rel;
      try {
        const res = await fetch(`${MIRROR}/${urlPath}`);
        if (!res.ok) { console.error(`  MISS ${urlPath}`); ok = false; continue; }
        mkdirSync(path.dirname(dest), { recursive: true });
        writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
        console.log(`  got ${urlPath}`);
      } catch {
        console.error(`  FAIL ${urlPath}`);
        ok = false;
      }
    }
  }
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
  // Extracts head faces from the entity skin sheets. Independent of the others, so its position does not
  // matter; it is last only because it was added last.
  'extract-mob-head-textures.py',
  // Derives the two chest variants from the plain chest's own hand-made textures. It has NO downloader
  // input at all -- `chest_*.png` is not in the mirror -- so it depends on the files this repo ships rather
  // than on anything fetched above, which is why its position is safe at the end.
  'compose-chest-variants.py',
  // The sniffer egg and the end gateway. The egg reads its palette out of the sniffer's ENTITY sheet, so
  // this must run AFTER the entity step above; the gateway derives from `nether_portal.png`.
  'compose-egg-and-gateway.py',
  // The bubble column: water_still frame 0 plus four bubble particles. It slices the water tile
  // itself, because water_still is an animation strip.
  'compose-bubble-column.py',
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
