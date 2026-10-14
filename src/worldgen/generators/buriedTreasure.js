// Buried treasure, from the wiki (https://minecraft.wiki/w/Buried_Treasure).
//
// From the page:
//   * beaches and snowy beaches (Java; stony shore and mushroom field shore are Bedrock only);
//   * one chest, "always facing east", "at chunk section relative 9 (out of 0 through 15) on both the X and Z axis";
//   * "The treasure chest is almost always buried by some material ... a sand or gravel block covering it": the chest
//     goes one block under the top of the ground (the ocean floor, when underwater), so the ground block covers it;
//   * loot: the buried treasure table ("A heart of the sea is always present").
//
// Not modelled: "If the chest is exposed to water, it generates waterlogged" (this game has no waterlogging).
//
// The 1% per-chunk chance lives in the structure set (`buried_treasures`, `frequency: 0.01`).

import { BlockBox } from '../geometry.js';
import { StructurePiece, StructureStart } from '../start.js';

export const BURIED_TREASURE_OFFSET = { x: 9, z: 9 };
export const BURIED_TREASURE_LOOT = 'minecraft:chests/buried_treasure';

export function generateBuriedTreasure({ seed, chunkX, chunkZ, context }) {
  const x = chunkX * 16 + BURIED_TREASURE_OFFSET.x;
  const z = chunkZ * 16 + BURIED_TREASURE_OFFSET.z;
  // The top of the ground (the sea floor under water); the chest is buried one below it.
  const ground = context.surfaceY ? context.surfaceY(x, z, 'ocean_floor') : 63;
  const y = ground - 1;

  const piece = new StructurePiece({
    id: 'minecraft:buried_treasure',
    type: 'hardcoded',
    family: 'hardcoded',
    box: new BlockBox(x, y, z, x, y, z),
    meta: { lootTable: BURIED_TREASURE_LOOT, facing: 'east', block: 'chest', waterloggable: true }
  });

  const start = new StructureStart({
    structureId: 'buried_treasure',
    chunkX,
    chunkZ,
    pieces: [piece],
    biome: context.biomeAt ? context.biomeAt(x, z) : null,
    seed
  });
  start.meta = { ground, y };
  return start;
}

/**
 * Realise the chest into a voxel setter. `setBlock(x, y, z, blockId, meta)` is the caller's writer. Returns the
 * number of blocks written.
 */
export function realizeBuriedTreasure(start, setBlock, blockIds) {
  let written = 0;
  for (const piece of start.pieces) {
    const { x, y, z } = { x: piece.box.minX, y: piece.box.minY, z: piece.box.minZ };
    const state = { name: 'minecraft:chest', properties: { facing: 'east' } };
    if (setBlock(x, y, z, blockIds.CHEST, { state, facing: 'east', lootTable: piece.meta.lootTable })) written++;
  }
  return written;
}
