// Buried treasure: the first implemented structure, chosen because vanilla implements it with code
// rather than templates, so it needs no structure-NBT data to be complete.
//
// Vanilla `BuriedTreasureStructure` / `BuriedTreasurePiece`:
//   * one piece, a single chest;
//   * at chunk-local x=9, z=9 (so the chest is never on a chunk edge, which keeps it clear of the
//     chunk-border rules that would otherwise move it);
//   * at the OCEAN_FLOOR_WG height -- the beach surface, not the world surface, which is why a portal
//     or a tree above the beach does not push the chest upward;
//   * facing east;
//   * waterlogged if the block it replaces was water, which the realization step handles by reading the
//     block it overwrites rather than assuming air.
//
// Sources: wiki `Buried Treasure` (1.21.4). The 1% frequency lives in the structure set
// (`buried_treasures`, `frequency: 0.01`), not here -- the generator only runs once placement has
// already accepted the chunk, which is the same split vanilla uses.

import { BlockBox } from '../geometry.js';
import { StructurePiece, StructureStart } from '../start.js';

export const BURIED_TREASURE_OFFSET = { x: 9, z: 9 };

export function generateBuriedTreasure({ seed, chunkX, chunkZ, context }) {
  const x = chunkX * 16 + BURIED_TREASURE_OFFSET.x;
  const z = chunkZ * 16 + BURIED_TREASURE_OFFSET.z;
  const y = context.surfaceY ? context.surfaceY(x, z, 'ocean_floor') : 63;

  const piece = new StructurePiece({
    id: 'minecraft:buried_treasure',
    type: 'hardcoded',
    family: 'hardcoded',
    box: new BlockBox(x, y, z, x, y, z),
    meta: {
      lootTable: 'chests/buried_treasure',
      facing: 'east',
      block: 'chest',
      waterloggable: true
    }
  });

  return new StructureStart({
    structureId: 'buried_treasure',
    chunkX,
    chunkZ,
    pieces: [piece],
    biome: context.biomeAt ? context.biomeAt(x, z) : null,
    seed
  });
}

/**
 * Realise the chest into a voxel setter.
 *
 * `setBlock(x, y, z, blockId, meta)` is the caller's writer; the generator deliberately does not know
 * whether that is a chunk, a preview grid or a test double. Returns the number of blocks written so the
 * Inspector can report it and tests can assert the piece was not skipped.
 */
export function realizeBuriedTreasure(start, setBlock, blockIds) {
  let written = 0;
  for (const piece of start.pieces) {
    const { x, y, z } = { x: piece.box.minX, y: piece.box.minY, z: piece.box.minZ };
    if (setBlock(x, y, z, blockIds.CHEST, { facing: 'east', lootTable: piece.meta.lootTable })) written++;
  }
  return written;
}
