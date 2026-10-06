// Is the remaining block gap a code gap or an asset gap?
//
// The generator only emits a block when `textureExists()` finds a PNG in `public/assets/blocks`, so a block
// with no texture cannot be added however well its geometry is understood. The headline parity percentage
// does not say which of those two the remaining gap is, and they need completely different work: one is
// code, the other is art.
//
// Run: node scripts/content-gap.mjs
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { VANILLA_ID_ALIASES } from '../src/resourceRegistry.js';

const BLOCKS_CACHE = '.cache/mc-data/blocks.json';
const ITEMS_CACHE = '.cache/mc-data/items.json';
export const CACHE_PRESENT = existsSync(BLOCKS_CACHE);
export const ITEMS_CACHE_PRESENT = existsSync(ITEMS_CACHE);

/**
 * Candidate texture names a generator could legitimately use for a missing block.
 *
 * Deliberately conservative: each candidate is a reuse the existing families already perform. The generator
 * draws a sign with its wood's plank texture, so a missing wall sign genuinely can reuse `oak_planks.png`.
 * It does NOT draw a sapling with one, so saplings are not counted as reusable even though the file exists
 * -- listing them would overstate what can be added without art, which is the whole point of the measure.
 */
export function textureCandidates(name) {
  const out = [name];
  out.push(name.replace('_wall_sign', '_sign'));
  out.push(name.replace('_wall_hanging_sign', '_hanging_sign'));
  out.push(name.replace('_wall_', '_'));
  const wood = name.match(/^([a-z_]+)_(sign|hanging_sign|door|trapdoor|fence|fence_gate|button|pressure_plate)$/);
  if (wood) out.push(wood[1] + '_planks');
  return [...new Set(out)];
}

/** Every block name the game registers, by registry name. */
export function presentBlockNames() {
  const present = new Set();
  for (const [k, v] of Object.entries(BLOCKS)) if (typeof v === 'number') present.add(k.toLowerCase());
  for (const [, d] of Object.entries(BLOCK_DEFS)) {
    if (!d?.name) continue;
    present.add(String(d.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''));
  }
  return present;
}

/**
 * Split the missing vanilla blocks by what blocks them.
 *
 * @returns {{total:number, present:number, missing:number, ownTexture:number, reusable:Array, needsArt:Array,
 *   textureCount:number}|null}
 */
export function measureBlockGap() {
  if (!CACHE_PRESENT) return null;
  const blocks = JSON.parse(readFileSync(BLOCKS_CACHE, 'utf8'));
  const textures = new Set(readdirSync('public/assets/blocks'));
  const present = presentBlockNames();
  const missing = blocks.map(b => b.name).filter(n => !present.has(n));
  const has = (n) => textures.has(n + '.png');

  const reusable = [];
  const needsArt = [];
  for (const n of missing) {
    const via = textureCandidates(n).slice(1).find(has);
    if (has(n)) reusable.push({ name: n, via: n, own: true });
    else if (via) reusable.push({ name: n, via, own: false });
    else needsArt.push(n);
  }

  return {
    total: blocks.length,
    present: blocks.length - missing.length,
    missing: missing.length,
    ownTexture: missing.filter(has).length,
    reusable,
    needsArt,
    textureCount: textures.size,
  };
}

/**
 * Split the missing vanilla ITEMS by what blocks them.
 *
 * Symmetric with the block measurement, and for the same reason: `tests/item_icons.test.js` requires a
 * non-empty PNG at `/assets/items/<name>.png` for every entry in ITEMS, so an item with no icon cannot be
 * added however well its behaviour is understood. Without this figure the item row in the coverage table
 * has the same ambiguity the block row had -- "82%" reads like missing code when it may be missing art.
 *
 * @returns {{total:number, present:number, missing:number, ownIcon:number, reusable:Array, needsArt:Array,
 *   iconCount:number}|null}
 */
export function measureItemGap() {
  if (!ITEMS_CACHE_PRESENT) return null;
  const items = JSON.parse(readFileSync(ITEMS_CACHE, 'utf8'));
  const icons = new Set(readdirSync('public/assets/items'));

  // The registry keys plus the block-item names, which `ITEMS` carries under a lower-case id.
  const present = new Set(Object.keys(ITEMS).map(k => k.toLowerCase()));
  for (const [, d] of Object.entries(BLOCK_DEFS)) {
    if (!d?.name) continue;
    present.add(String(d.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''));
  }
  // A vanilla name this game holds under another id is present, not missing. This measurement and the
  // Inspector's `missingVanillaItems` are two implementations of the same question, and they count different
  // things on purpose -- this one counts every vanilla item name, the Inspector's counts what its registry
  // resolves -- so the two totals are not meant to be equal. They must not disagree about a single *name*, and
  // they did about two: `splash_potion` and `lingering_potion`, which are this game's splash and lingering
  // water bottles. Reconciling both through the same alias table is what keeps them comparable.
  for (const [gameId, vanillaId] of Object.entries(VANILLA_ID_ALIASES)) {
    if (ITEMS[gameId] !== undefined) present.add(vanillaId);
  }

  const missing = items.map(i => i.name).filter(n => !present.has(n));
  const has = (n) => icons.has(n + '.png');
  const reusable = [];
  const needsArt = [];
  for (const n of missing) {
    if (has(n)) { reusable.push({ name: n, via: n, own: true }); continue; }
    const via = itemIconCandidates(n).find(has);
    if (via) reusable.push({ name: n, via, own: false });
    else needsArt.push(n);
  }
  return {
    total: items.length,
    present: items.length - missing.length,
    missing: missing.length,
    ownIcon: missing.filter(has).length,
    reusable,
    needsArt,
    iconCount: icons.size,
  };
}

/**
 * Candidate icons a missing item could legitimately reuse.
 *
 * Conservative, and deliberately much shorter than the block list. A spawn egg is a real reuse -- the game
 * already draws every egg from a shared texture -- and a wall/sign variant is not applicable to items. A
 * boat named after a wood must NOT be offered `oak_boat.png`, because a birch boat drawn as an oak one is
 * a visual bug rather than a reuse, which is the mistake the block measurement made first time.
 */
export function itemIconCandidates(name) {
  const out = [];
  if (/_spawn_egg$/.test(name)) out.push('spawn_egg');
  return [...new Set(out)];
}

if (process.argv[1]?.endsWith('content-gap.mjs')) {
  if (!CACHE_PRESENT) {
    console.error('block cache missing; run scripts/generate-mc-data.mjs first');
    process.exit(1);
  }
  const r = measureBlockGap();
  console.log('=== WHY THE REMAINING BLOCKS ARE MISSING ===');
  console.log('vanilla blocks                    : ' + r.total);
  console.log('present                           : ' + r.present);
  console.log('missing                           : ' + r.missing);
  console.log('');
  console.log('has its OWN texture               : ' + r.ownTexture);
  console.log('could REUSE one already present   : ' + r.reusable.length);
  console.log('needs NEW art                     : ' + r.needsArt.length);
  console.log('');
  console.log('textures in public/assets/blocks  : ' + r.textureCount);
  console.log('present blocks per texture        : ' + (r.present / r.textureCount).toFixed(1));
  if (r.reusable.length) {
    console.log('\n=== could be added with code plus existing art ===');
    for (const x of r.reusable) console.log('  ' + x.name.padEnd(30) + 'via ' + x.via + '.png');
  }
  console.log('\n=== first 20 that genuinely need new art ===');
  for (const n of r.needsArt.slice(0, 20)) console.log('  ' + n);

  const i = ITEMS_CACHE_PRESENT ? measureItemGap() : null;
  if (!i) {
    console.log('\n(item cache missing; item gap not measured)');
  } else {
    console.log('\n=== WHY THE REMAINING ITEMS ARE MISSING ===');
    console.log('vanilla items                     : ' + i.total);
    console.log('present                           : ' + i.present);
    console.log('missing                           : ' + i.missing);
    console.log('');
    console.log('has its OWN icon                  : ' + i.ownIcon);
    console.log('could REUSE one already present   : ' + i.reusable.length);
    console.log('needs NEW art                     : ' + i.needsArt.length);
    console.log('');
    console.log('icons in public/assets/items      : ' + i.iconCount);
    console.log('present items per icon            : ' + (i.present / i.iconCount).toFixed(1));
    if (i.reusable.length) {
      console.log('\n=== item gap: could reuse an icon ===');
      for (const x of i.reusable.slice(0, 20)) console.log('  ' + x.name.padEnd(30) + 'via ' + x.via + '.png');
      if (i.reusable.length > 20) console.log('  ... and ' + (i.reusable.length - 20) + ' more');
    }
    console.log('\n=== item gap: first 20 needing new art ===');
    for (const n of i.needsArt.slice(0, 20)) console.log('  ' + n);
  }
}
