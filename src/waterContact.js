import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { waterCornerHeight } from './waterGeometry.js';

export const isWaterCell = id => id === BLOCKS.WATER || !!BLOCK_DEFS[id]?.waterPlant || id === BLOCKS.BUBBLE_COLUMN;

// Use the rendered surface, including flowing water levels. A water plant occupies a
// source-water cell. Search upwards only through connected water, never through a roof.
export function waterSurfaceAt(world, x, y, z) {
  const bx = Math.floor(x), bz = Math.floor(z);
  let top = Math.floor(y);
  if (!isWaterCell(world.getVoxel(bx, top, bz))) {
    top--;
    if (!isWaterCell(world.getVoxel(bx, top, bz))) return null;
  }
  for (let i = 0; i < 320 && isWaterCell(world.getVoxel(bx, top + 1, bz)); i++) top++;
  const sample = {
    getVoxel: (sx, sy, sz) => {
      const id = world.getVoxel(sx, sy, sz);
      return isWaterCell(id) ? BLOCKS.WATER : id;
    },
    getWaterLevel: (sx, sy, sz) => world.getVoxel(sx, sy, sz) === BLOCKS.WATER ? (world.getWaterLevel?.(sx, sy, sz) ?? 0) : 0,
  };
  const fx = x - bx, fz = z - bz;
  const h00 = waterCornerHeight(sample, bx, top, bz);
  const h10 = waterCornerHeight(sample, bx + 1, top, bz);
  const h01 = waterCornerHeight(sample, bx, top, bz + 1);
  const h11 = waterCornerHeight(sample, bx + 1, top, bz + 1);
  return { x: bx, y: top, z: bz, surfaceY: top + (h00 * (1-fx) + h10 * fx) * (1-fz) + (h01 * (1-fx) + h11 * fx) * fz };
}

export function findBoatPlacement(world, origin, direction, reach = 5) {
  for (let t = 0.1; t <= reach; t += 0.1) {
    const p = origin.clone().addScaledVector(direction, t);
    const id = world.getVoxel(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    if (isWaterCell(id)) {
      const water = waterSurfaceAt(world, p.x, p.y, p.z);
      if (p.y <= water.surfaceY) return [p.x, water.surfaceY, p.z];
    } else if (id !== BLOCKS.AIR && BLOCK_DEFS[id]?.solid !== false) return null;
  }
  return null;
}
