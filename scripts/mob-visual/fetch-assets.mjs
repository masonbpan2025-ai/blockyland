#!/usr/bin/env node
/**
 * Fetch the visual assets the mob models need, from a pinned upstream source, and record provenance.
 *
 * Why this exists: several mobs were built from flat colours instead of their real skins, so the snow golem had
 * no carved pumpkin face and the husk was a tinted zombie rather than its own mob. Generated art cannot fix
 * that -- the models need the ACTUAL texture bytes. This script acquires them reproducibly and writes a lock
 * file with a SHA-256 per asset, so a fresh checkout can verify or restore exactly the same bytes.
 *
 * Usage:
 *   node scripts/mob-visual/fetch-assets.mjs            # download anything missing, then verify every asset
 *   node scripts/mob-visual/fetch-assets.mjs --verify    # verify only; fail if anything is missing or changed
 *   node scripts/mob-visual/fetch-assets.mjs --force     # re-download everything
 *
 * The upstream is a mirror of the vanilla client jar's assets. The wiki serves the same textures but blocks
 * scripted downloads (HTTP 403), which is why a mirror is used; both are the same original bytes.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/**
 * The pinned upstreams, newest first.
 *
 * More than one ref is needed because these mobs did not all exist in the same release: bogged arrived in 1.21,
 * while the zombie/skeleton skins and the pumpkin textures are byte-identical across both. The lock records the
 * ref each file actually came from, so provenance stays truthful instead of claiming one blanket version.
 */
export const SOURCES = [
  { repository: 'https://github.com/InventivetalentDev/minecraft-assets', ref: '1.21.4',
    base: 'https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21.4/assets/minecraft/textures' },
  { repository: 'https://github.com/InventivetalentDev/minecraft-assets', ref: '1.20.4',
    base: 'https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.4/assets/minecraft/textures' }
];

/** The default ref, tried first for every asset. */
export const SOURCE = SOURCES[0];

/**
 * Every asset a mob model needs, with where it comes from and what it is for.
 *
 * `path` is the upstream path under the textures root. `dest` is where it lands in this repo, under `public/`,
 * MIRRORING the vanilla layout so that a skin can be dropped straight in place of a generated placeholder:
 * `public/assets/entity/zombie/husk.png` and so on. That also makes each file's origin obvious from its path.
 */
export const ASSETS = [
  // --- Husk: its own skin, not a tinted zombie ------------------------------------------------
  { id: 'husk_skin', path: 'entity/zombie/husk.png', dest: 'assets/entity/zombie/husk.png', for: 'husk' },
  { id: 'zombie_skin', path: 'entity/zombie/zombie.png', dest: 'assets/entity/zombie/zombie.png', for: 'zombie/baseline' },
  { id: 'drowned_skin', path: 'entity/zombie/drowned.png', dest: 'assets/entity/zombie/drowned.png', for: 'drowned' },
  { id: 'stray_skin', path: 'entity/skeleton/stray.png', dest: 'assets/entity/skeleton/stray.png', for: 'stray' },
  { id: 'skeleton_skin', path: 'entity/skeleton/skeleton.png', dest: 'assets/entity/skeleton/skeleton.png', for: 'skeleton/baseline' },
  { id: 'bogged_skin', path: 'entity/skeleton/bogged.png', dest: 'assets/entity/skeleton/bogged.png', for: 'bogged' },
  // The mushroom overlay is a separate texture in vanilla, not part of the skin.
  { id: 'bogged_overlay', path: 'entity/skeleton/bogged_overlay.png', dest: 'assets/entity/skeleton/bogged_overlay.png', for: 'bogged mushrooms' },

  // --- Snow golem: a real carved pumpkin head -------------------------------------------------
  { id: 'snow_golem_skin', path: 'entity/snow_golem.png', dest: 'assets/entity/snow_golem.png', for: 'snow_golem' },
  { id: 'carved_pumpkin_face', path: 'block/carved_pumpkin.png', dest: 'assets/block/carved_pumpkin.png', for: 'snow_golem head' },
  { id: 'pumpkin_side', path: 'block/pumpkin_side.png', dest: 'assets/block/pumpkin_side.png', for: 'snow_golem head' },
  { id: 'pumpkin_top', path: 'block/pumpkin_top.png', dest: 'assets/block/pumpkin_top.png', for: 'snow_golem head' },

  // --- Reported mob families (visual parity pass 2) -------------------------------------------
  { id: 'polar_bear_skin', path: 'entity/bear/polarbear.png', dest: 'assets/entity/bear/polarbear.png', for: 'polar_bear' },
  { id: 'panda_skin', path: 'entity/panda/panda.png', dest: 'assets/entity/panda/panda.png', for: 'panda' },
  { id: 'cow_skin', path: 'entity/cow/cow.png', dest: 'assets/entity/cow/cow.png', for: 'cow' },
  { id: 'mooshroom_skin', path: 'entity/cow/red_mooshroom.png', dest: 'assets/entity/cow/red_mooshroom.png', for: 'mooshroom (red)' },
  { id: 'brown_mooshroom_skin', path: 'entity/cow/brown_mooshroom.png', dest: 'assets/entity/cow/brown_mooshroom.png', for: 'mooshroom (brown)' },
  // The spider: vanilla nests this one a directory deeper than a flat mirror suggests.
  { id: 'spider_skin', path: 'entity/spider/spider.png', dest: 'assets/entity/spider/spider.png', for: 'spider' },
  { id: 'cave_spider_skin', path: 'entity/spider/cave_spider.png', dest: 'assets/entity/spider/cave_spider.png', for: 'cave spider' },
  { id: 'spider_eyes', path: 'entity/spider/spider_eyes.png', dest: 'assets/entity/spider/spider_eyes.png', for: 'spider eyes' },
  { id: 'shulker_skin', path: 'entity/shulker/shulker.png', dest: 'assets/entity/shulker/shulker.png', for: 'shulker' },
  { id: 'warden_skin', path: 'entity/warden/warden.png', dest: 'assets/entity/warden/warden.png', for: 'warden' },
  { id: 'red_mushroom_block', path: 'block/red_mushroom_block.png', dest: 'assets/block/red_mushroom_block.png', for: 'mooshroom back' },
  { id: 'brown_mushroom_block', path: 'block/brown_mushroom_block.png', dest: 'assets/block/brown_mushroom_block.png', for: 'mooshroom back' },
  { id: 'mushroom_block_inside', path: 'block/mushroom_block_inside.png', dest: 'assets/block/mushroom_block_inside.png', for: 'mooshroom back' },
  // --- Illagers and the witch ---------------------------------------------------------------
  { id: 'vindicator_skin', path: 'entity/illager/vindicator.png', dest: 'assets/entity/illager/vindicator.png', for: 'vindicator' },
  { id: 'evoker_skin', path: 'entity/illager/evoker.png', dest: 'assets/entity/illager/evoker.png', for: 'evoker' },
  { id: 'vex_skin', path: 'entity/illager/vex.png', dest: 'assets/entity/illager/vex.png', for: 'vex' },
  { id: 'vex_charging_skin', path: 'entity/illager/vex_charging.png', dest: 'assets/entity/illager/vex_charging.png', for: 'vex charging state' },
  { id: 'witch_skin', path: 'entity/witch.png', dest: 'assets/entity/witch.png', for: 'witch' },
  // --- Reference skins for families this pass will reach next ---------------------------------
  { id: 'iron_golem_skin', path: 'entity/iron_golem/iron_golem.png', dest: 'assets/entity/iron_golem/iron_golem.png', for: 'iron_golem' }
];

const DEST_ROOT = join(repoRoot, 'public');
const LOCK_PATH = join(here, 'assets.lock.json');

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const type = res.headers.get('content-type') ?? '';
  const buffer = Buffer.from(await res.arrayBuffer());
  // A HTML body means we were served an error page or a proxy block, not an image.
  if (/text\/html/i.test(type) || !buffer.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new Error(`not a PNG (content-type ${type}, ${buffer.length} bytes) for ${url}`);
  }
  return buffer;
}

function readLock() {
  if (!existsSync(LOCK_PATH)) return null;
  try { return JSON.parse(readFileSync(LOCK_PATH, 'utf8')); } catch { return null; }
}

/**
 * Try each pinned ref in turn and return the first that has the file.
 *
 * A 404 is expected here rather than exceptional: bogged simply does not exist in 1.20.4. Any OTHER failure
 * (a 403 from a proxy, an HTML body, a network error) is reported with its cause, so a genuine outage cannot be
 * mistaken for "this mob is not in that version".
 */
async function downloadFirstAvailable(asset) {
  const failures = [];
  for (const source of SOURCES) {
    const url = `${source.base}/${asset.path}`;
    try {
      const bytes = await download(url);
      return { bytes, url, ref: source.ref };
    } catch (error) {
      failures.push(`${source.ref}: ${error.message}`);
    }
  }
  throw new Error(`no pinned ref has ${asset.path} -- ${failures.join('; ')}`);
}

async function main() {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes('--verify');
  const force = args.includes('--force');

  mkdirSync(DEST_ROOT, { recursive: true });
  const lock = readLock() ?? { sources: SOURCES, assets: {} };
  lock.sources = SOURCES;

  const problems = [];
  let downloaded = 0;
  let verified = 0;

  for (const asset of ASSETS) {
    const destPath = join(DEST_ROOT, asset.dest);
    const recorded = lock.assets?.[asset.id];

    mkdirSync(dirname(destPath), { recursive: true });
    let bytes = (!force && existsSync(destPath)) ? readFileSync(destPath) : null;
    let url = recorded?.url ?? `${SOURCE.base}/${asset.path}`;
    let ref = recorded?.ref ?? SOURCE.ref;

    if (!bytes) {
      if (verifyOnly) {
        problems.push(`${asset.id}: missing at ${asset.dest}`);
        continue;
      }
      const fetched = await downloadFirstAvailable(asset);
      bytes = fetched.bytes;
      url = fetched.url;
      ref = fetched.ref;
      writeFileSync(destPath, bytes);
      downloaded++;
    }

    const hash = sha256(bytes);
    if (recorded && recorded.sha256 !== hash && !force) {
      // A changed file is a failure unless we are deliberately re-locking.
      problems.push(`${asset.id}: hash ${hash.slice(0, 12)} does not match lock ${recorded.sha256.slice(0, 12)}`);
      continue;
    }
    lock.assets[asset.id] = {
      path: asset.path,
      dest: asset.dest,
      url,
      ref,
      sha256: hash,
      bytes: bytes.length,
      for: asset.for
    };
    verified++;
  }

  if (!verifyOnly) writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2) + '\n');

  console.log(`assets: ${verified} present, ${downloaded} downloaded, ${problems.length} problem(s)`);
  for (const p of problems) console.log('  PROBLEM ' + p);
  if (problems.length && verifyOnly) process.exitCode = 1;
}

/** Only run when executed directly, not when imported by a test. */
const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  const normalise = (p) => resolve(p).replace(/\\/g, '/').toLowerCase();
  return normalise(entry) === normalise(fileURLToPath(import.meta.url));
})();

if (invokedDirectly) {
  await main();
}
