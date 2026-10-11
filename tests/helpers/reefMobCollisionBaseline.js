// Captured before optimizing voxel collision queries; public dimension lookup remains unchanged.
import { isSquid } from '../../src/squidBehavior.js';

export function originalCheckMobCollision(mob, pos) {
    const dims = this.getMobDimensions(mob.type);
    const scale = mob.isBaby ? (isSquid(mob) ? .625 : mob.type==='horse' ? 0.7 : 0.5) : 1;
    const hw = (mob.width || dims.width) * scale / 2;
    const h = (mob.height || dims.height) * scale;

    // Small inset (0.02) to prevent precision sticking to block walls
    const minX = Math.floor(pos.x - hw + 0.02);
    const maxX = Math.floor(pos.x + hw - 0.02);
    const minY = Math.floor(pos.y + 0.02);
    const maxY = Math.floor(pos.y + h - 0.02);
    const minZ = Math.floor(pos.z - hw + 0.02);
    const maxZ = Math.floor(pos.z + hw - 0.02);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.isBlockSolid(x, y, z, mob?.type)) {
            return true;
          }
        }
      }
    }
    return false;
  }

