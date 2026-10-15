// Where a compass points.
//
// Wiki (Compass): "A compass points to the world spawn point" in the Overworld; used on a lodestone it becomes a
// lodestone compass that "points to the lodestone it is linked to" in that lodestone's dimension, and spins at random
// if the lodestone is broken or the player is in another dimension; an ordinary compass spins in the Nether and the
// End. Found by the wiki-tutorial play-test (Navigation: "A world's original spawn point can be found easily using a
// compass"): the item existed with nothing computing where its needle should point.
import { BLOCKS } from './blocks.js';

/** The point a compass points at, or null when it spins. */
export function compassTarget(game, item) {
  if (!item || item.id !== 'compass') return null;
  const dimension = game?.currentDimension ?? game?.world?.dimension ?? 'overworld';
  const lodestone = item.lodestone;
  if (lodestone) {
    if (lodestone.dimension !== dimension) return null;
    if (game?.world?.getVoxel?.(lodestone.x, lodestone.y, lodestone.z) !== BLOCKS.LODESTONE) return null;
    return { x: lodestone.x + 0.5, y: lodestone.y, z: lodestone.z + 0.5 };
  }
  if (dimension !== 'overworld') return null;
  const spawn = game?.worldSpawn ?? game?.player?.spawnPosition;
  return spawn ? { x: spawn.x, y: spawn.y, z: spawn.z } : { x: 0.5, y: 64, z: 0.5 };
}

/**
 * The needle's angle on the icon, in radians clockwise from straight up, for a player at `position` facing `yaw`
 * (yaw 0 looks north, -Z, and grows turning left). A target dead ahead is 0; to the right, +PI/2.
 */
export function needleAngle(position, yaw, target) {
  const dx = target.x - position.x, dz = target.z - position.z;
  const bearing = Math.atan2(-dx, -dz); // the yaw that would face the target
  let a = yaw - bearing;
  a = Math.atan2(Math.sin(a), Math.cos(a));
  return a;
}

/** Right-click a lodestone with a compass: it becomes a lodestone compass linked to that block. */
export function attuneCompass(item, x, y, z, dimension) {
  if (!item || item.id !== 'compass') return false;
  item.lodestone = { x, y, z, dimension };
  return true;
}
