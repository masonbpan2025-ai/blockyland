// Is the remaining block gap a code gap or an asset gap?
//
// The generator only emits a block when `textureExists()` finds a PNG in `public/assets/blocks`, so a block
// with no texture cannot be added however well its geometry is understood. The headline parity percentage
// does not say which of those two the remaining gap is, and they need completely different work: one is
// code, the other is art.
//
// Run: node scripts/content-gap.mjs
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';

const BLOCKS_CACHE = '.cache/mc-data/blocks.json';
export const CACHE_PRESENT = existsSync(BLOCKS_CACHE);

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
}
