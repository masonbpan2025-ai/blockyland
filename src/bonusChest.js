// The bonus chest, from the wiki (https://minecraft.wiki/w/Bonus_Chest).
//
// "If the 'Bonus Chest' option is enabled in the create new world screen ... a single bonus chest is generated in the
// world ... within the chunk at the world spawn point, with four torches generated around it on adjacent blocks. It
// always generates on the highest block"; "The torches may be overridden if the torch locations are obstructed".
// Loot: the spawn bonus chest table. Not available in Hardcore (this game has no Hardcore mode).

import { BLOCKS, BLOCK_DEFS } from './blocks.js';

export const BONUS_CHEST_LOOT = 'minecraft:chests/spawn_bonus_chest';

/** The chest's spot: the highest block of the spawn chunk nearest the spawn, with its four sides free above ground. */
export function bonusChestSpot(world, spawnX, spawnZ) {
  const cx = Math.floor(spawnX / 16) * 16; const cz = Math.floor(spawnZ / 16) * 16;
  const topOf = (x, z) => { for (let y = 62; y > 0; y--) { const id = world.getVoxel(x, y, z); if (id !== BLOCKS.AIR && BLOCK_DEFS[id]?.solid !== false) return y; } return null; };
  let best = null;
  for (let dx = 1; dx < 15; dx++) for (let dz = 1; dz < 15; dz++) {
    const x = cx + dx; const z = cz + dz;
    const y = topOf(x, z);
    if (y === null || world.getVoxel(x, y + 1, z) !== BLOCKS.AIR) continue;
    const d = Math.hypot(x - spawnX, z - spawnZ);
    if (d < 2) continue; // not on the player
    if (!best || d < best.d) best = { x, y: y + 1, z, d };
  }
  return best;
}

/** Place it; `adoptChest(x, y, z, lootTable)` hands the chest to the game. Returns the spot or null. */
export function placeBonusChest(world, spawnX, spawnZ, adoptChest) {
  const spot = bonusChestSpot(world, spawnX, spawnZ);
  if (!spot) return null;
  world.setVoxel(spot.x, spot.y, spot.z, BLOCKS.CHEST);
  adoptChest?.(spot.x, spot.y, spot.z, BONUS_CHEST_LOOT);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    // A torch on each adjacent block, unless something is in the way.
    if (world.getVoxel(spot.x + dx, spot.y, spot.z + dz) === BLOCKS.AIR) world.setVoxel(spot.x + dx, spot.y, spot.z + dz, BLOCKS.TORCH);
  }
  return spot;
}
