// Nether fossil: the generator and its clean-room templates, kept in one file because the templates are
// built by code and used nowhere else.
//
// From the wiki (`Nether Fossil`, 1.21.4 revision) and `Structure definition`:
//   * soul sand valley only, structure set `nether_fossils` (spacing 2, separation 1, salt 14357921);
//   * 14 template variants named `nether_fossils/fossil_1` .. `fossil_14`, of 5 to 27 bone blocks;
//   * "Unlike regular fossils, they do not have a lowered structure integrity and no blocks are replaced
//     with coal or diamond ore" -- so NO `block_rot`, and no ore overlay. That is the whole reason this is
//     cheap to implement and easy to get wrong by copying the overworld fossil's behaviour;
//   * a `start_height` height provider decides the Y.
//
// PROVENANCE: this repository ships no Minecraft assets, so the templates are NOT vanilla's fossil_1..14.
// They are bone-block ribcages built from the described shape and size range.
//
// APPROXIMATIONS, stated rather than hidden:
//   1. the wiki does not publish the nether fossil's `start_height` values, so Y is uniform over the
//      nether's fossil band (documented in `NETHER_FOSSIL_Y_RANGE`);
//   2. vanilla rotates these; the 1.21.4 wiki page does not say so, so the rotation is applied and
//      recorded as an assumption in docs/STRUCTURE_PARITY.md.

import { StructurePiece, StructureStart } from '../start.js';
import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { placeTemplate } from '../templatePlacement.js';
import { StructureTemplate } from '../template.js';
import { createBlockIdResolver } from '../blockIds.js';

/** Vanilla's 14 variants. */
export const NETHER_FOSSIL_VARIANTS = 14;

/** The bone-block counts vanilla's variants span, used here as the length range. */
export const NETHER_FOSSIL_SIZE_RANGE = [5, 27];

/** Where nether fossils sit. The wiki does not publish the provider's values; this is an approximation. */
export const NETHER_FOSSIL_Y_RANGE = [33, 60];

/**
 * Build one fossil: a spine of bone blocks with ribs rising from it, rooted at the bottom north-west
 * corner so the piece box is predictable.
 *
 * @param {object} options
 * @param {number} options.variant  1..14, which selects a length and rib count
 */
export function buildNetherFossil({ variant = 1 } = {}) {
  const index = Math.min(NETHER_FOSSIL_VARIANTS, Math.max(1, Math.trunc(variant)));
  const [minBlocks, maxBlocks] = NETHER_FOSSIL_SIZE_RANGE;
  // Variants step through the documented size range, so variant 1 really is the smallest and 14 the
  // largest rather than all of them being a similar size.
  const length = Math.round(minBlocks + ((maxBlocks - minBlocks) * (index - 1)) / (NETHER_FOSSIL_VARIANTS - 1) - 3);
  const spine = Math.max(2, length);
  const size = [spine + 1, 3, 3];
  const palette = [
    { Name: 'minecraft:air' },
    { Name: 'minecraft:bone_block', Properties: { axis: 'x' } },
    { Name: 'minecraft:bone_block', Properties: { axis: 'y' } }
  ];
  const blocks = [];
  const set = (x, y, z, state) => {
    const [sx, sy, sz] = size;
    if (x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz) blocks.push({ pos: [x, y, z], state });
  };

  // Spine along X at the lowest level, in the middle of the 3-wide band.
  for (let x = 0; x <= spine; x++) set(x, 0, 1, 1);

  // Ribs: every other block of the spine, rising one block on each side of it.
  for (let x = 1; x <= spine; x += 2) {
    set(x, 1, 0, 2);
    set(x, 1, 2, 2);
    if (x % 4 === 1) set(x, 2, 1, 2);
  }

  return { size, palette, blocks, entities: [], meta: { variant: index, spine } };
}

export function generateNetherFossil({ seed, chunkX, chunkZ, context }) {
  const originX = chunkX * 16 + 4;
  const originZ = chunkZ * 16 + 4;

  // Draws in a fixed order from the chunk's large-feature stream: variant, rotation, then Y. Adding a
  // draw later must not shift these.
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const variant = 1 + random.nextIntBound(NETHER_FOSSIL_VARIANTS);
  const rotation = random.nextIntBound(4);
  const [minY, maxY] = NETHER_FOSSIL_Y_RANGE;
  const y = minY + random.nextIntBound(maxY - minY + 1);

  const params = { variant };
  const template = new StructureTemplate(buildNetherFossil(params), `minecraft:nether_fossils/fossil_${variant}`);

  const piece = new StructurePiece({
    id: template.name,
    type: 'template',
    family: 'template',
    template: template.name,
    rotation,
    box: template.boundingBox({ x: originX, y, z: originZ }, rotation),
    meta: { origin: { x: originX, y, z: originZ }, params }
  });

  const start = new StructureStart({
    structureId: 'nether_fossil',
    chunkX,
    chunkZ,
    pieces: [piece],
    biome: context.biomeAt ? context.biomeAt(originX, originZ) : null,
    seed
  });
  start.meta = { variant, rotation, y };
  return start;
}

export function realizeNetherFossil(start, setBlock, blockIds) {
  const resolver = createBlockIdResolver(blockIds || undefined);
  const piece = start.pieces[0];
  const template = new StructureTemplate(buildNetherFossil(piece.meta.params), piece.template);
  const random = new LegacyRandom(BigInt(start.seed ?? 0) + BigInt(start.chunkX) * 7907n + BigInt(start.chunkZ));

  // No processor list at all, which is the documented behaviour: no integrity loss and no ore overlay.
  const placement = placeTemplate({
    template,
    origin: piece.meta.origin,
    rotation: piece.rotation,
    mirror: piece.mirror,
    random,
    world: null
  });

  const missingBlocks = new Set();
  let written = 0;
  for (const block of placement.blocks) {
    const id = resolver.resolveState(block.state);
    if (id === null) { missingBlocks.add(block.state.name); continue; }
    if (setBlock(block.x, block.y, block.z, id, { state: block.state })) written++;
  }
  return {
    written,
    missingBlocks: [...missingBlocks].sort(),
    requirements: placement.requirements,
    processorTypes: placement.processorTypes,
    note: 'clean-room bone ribcage; Y range and rotation are approximations'
  };
}
