// Clean-room ruined portal templates.
//
// PROVENANCE: this repository ships no Minecraft assets, so these are NOT vanilla's
// `ruined_portal/portal_1..10` or `giant_portal_1..3`. They are built from the wiki's description --
// a broken obsidian frame on a stone-brick or sandstone base, with netherrack spread, a few gold blocks,
// a chest, and obsidian that has partly turned to crying obsidian -- and are parameterised by the
// structure's `setups` entry (base material, mossiness, blackstone replacement, giant or not).
//
// Built by code rather than as literal block lists: the frame's damage is a per-portal roll, so the data
// is not a fixed list anyway. `integrity` is the caller's deterministic draw, which is why the same seed
// always produces the same portal.

import { LegacyRandom } from '../random.js';

/** Frame heights and sizes a portal can take, matching vanilla's "normal or giant" split. */
export const PORTAL_SHAPES = {
  normal: { size: [5, 6, 5], frameWidth: 4, frameHeight: 5 },
  giant: { size: [9, 8, 9], frameWidth: 7, frameHeight: 7 }
};

/**
 * @param {object} options
 * @param {'normal'|'giant'} [options.shape]
 * @param {string} [options.baseBlock]      the platform material, from the setup
 * @param {number} [options.goldBlocks]     how many gold blocks to scatter
 * @param {boolean} [options.withChest]
 * @param {number} [options.integrity]      0..1, how much of the frame survives
 * @param {number} [options.cryingChance]   per-obsidian chance of crying obsidian (0.15 in Java)
 * @param {number} [options.seed]           for the damage and crying rolls
 */
export function buildRuinedPortal({
  shape = 'normal',
  baseBlock = 'minecraft:stone_bricks',
  goldBlocks = 2,
  withChest = true,
  integrity = 0.75,
  cryingChance = 0.15,
  seed = 0
} = {}) {
  const { size, frameWidth, frameHeight } = PORTAL_SHAPES[shape];
  const [sx, sy, sz] = size;
  const random = new LegacyRandom(BigInt(seed) * 31n + BigInt(frameWidth));
  const palette = [
    { Name: 'minecraft:air' },
    { Name: 'minecraft:obsidian' },
    { Name: 'minecraft:crying_obsidian' },
    { Name: 'minecraft:netherrack' },
    { Name: baseBlock },
    { Name: 'minecraft:gold_block' },
    { Name: 'minecraft:chest', Properties: { facing: 'north', waterlogged: 'false' } },
    { Name: 'minecraft:magma_block' }
  ];
  const blocks = [];
  const set = (x, y, z, state) => {
    if (x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz) blocks.push({ pos: [x, y, z], state });
  };
  // Obsidian is obsidian only most of the time; the rest is crying obsidian, which is the visible sign of
  // a portal that failed.
  const obsidian = () => (random.nextFloat() < cryingChance ? 2 : 1);

  // Base platform, inset by one so the portal looks placed rather than minted.
  const inset = 1;
  for (let x = inset; x < sx - inset; x++) {
    for (let z = inset; z < sz - inset; z++) {
      set(x, 0, z, random.nextFloat() < 0.75 ? 4 : 7);
    }
  }

  // The frame: two uprights and a lintel, at the platform's middle, damaged by `integrity`.
  const frameZ = Math.floor(sz / 2);
  const frameX = Math.floor((sx - frameWidth) / 2);
  const survives = () => random.nextFloat() < integrity;
  for (let y = 1; y <= frameHeight; y++) {
    if (survives()) set(frameX, y, frameZ, obsidian());
    if (survives()) set(frameX + frameWidth - 1, y, frameZ, obsidian());
  }
  for (let x = frameX; x < frameX + frameWidth; x++) {
    if (survives()) set(x, frameHeight + 1 <= sy - 1 ? frameHeight : sy - 1, frameZ, obsidian());
  }

  // Netherrack spill, biased to one side as though the portal leaked.
  for (let i = 0; i < Math.max(3, Math.floor(sx * 1.5)); i++) {
    const x = inset + Math.floor(random.nextFloat() * (sx - 2 * inset));
    const z = inset + Math.floor(random.nextFloat() * (sz - 2 * inset));
    set(x, 1, z, 3);
  }

  // Gold blocks, then the loot chest in a corner of the platform.
  for (let i = 0; i < goldBlocks; i++) {
    const x = inset + Math.floor(random.nextFloat() * (sx - 2 * inset));
    const z = inset + Math.floor(random.nextFloat() * (sz - 2 * inset));
    set(x, 1, z, 5);
  }
  if (withChest) set(inset, 1, inset, 6);

  return {
    size,
    palette,
    blocks,
    entities: [],
    // Metadata the generator needs but a template does not carry in vanilla.
    meta: { shape, baseBlock, integrity, cryingChance }
  };
}

/** The shape names vanilla distinguishes, for the generator's giant roll. */
export const RUINED_PORTAL_SHAPES = Object.keys(PORTAL_SHAPES);
