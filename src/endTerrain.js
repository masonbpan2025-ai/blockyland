import { BLOCKS as B } from './blocks.js';
import { netherRandom as coordinateRandom } from './netherTerrain.js';

export const END_OUTER_RADIUS = 1024;
export const END_CENTRAL_RADIUS = 72;

// One source of truth for terrain, biome selection and structure height checks.
// Horizontal distances are retained; vertical dimensions fit the 64-block engine.
export function endColumn(world, x, z) {
  const distance = Math.hypot(x, z);
  if (distance < END_CENTRAL_RADIUS) {
    const edge = distance / END_CENTRAL_RADIUS;
    const top = Math.floor(32 - edge * edge * 10 + world.detailNoise.noise2D(x * .045, z * .045) * 2);
    return { top, bottom: Math.max(5, Math.floor(13 + edge * edge * 7)), biome: 'the_end' };
  }
  if (distance < END_OUTER_RADIUS) return { top: 0, bottom: 0, biome: 'the_end' };
  const size = 128, cx = Math.floor(x / size), cz = Math.floor(z / size);
  let strength = -1, small = false;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const gx = cx + dx, gz = cz + dz;
    const random = salt => coordinateRandom(world.seed, gx, 0, gz, salt);
    if (random(201) < .18) continue;
    const px = gx * size + 64 + (random(203) - .5) * 50;
    const pz = gz * size + 64 + (random(205) - .5) * 50;
    const isSmall = random(207) < .22;
    const rx = isSmall ? 12 + random(209) * 15 : 35 + random(209) * 28;
    const rz = isSmall ? 12 + random(211) * 15 : 30 + random(211) * 32;
    const radius = Math.hypot((x - px) / rx, (z - pz) / rz);
    const value = 1 - radius + world.detailNoise.noise2D(x * .055, z * .055) * .07;
    if (value > strength) { strength = value; small = isSmall; }
  }
  if (strength <= 0) return { top: 0, bottom: 0, biome: 'small_end_islands' };
  const top = Math.floor((small ? 20 : 24) + strength * (small ? 5 : 9));
  const bottom = Math.max(6, Math.floor(top - 4 - strength * (small ? 6 : 16)));
  let biome = small ? 'small_end_islands' : strength > .45 ? 'end_highlands' : strength > .16 ? 'end_midlands' : 'end_barrens';
  if (world.selectedBiome !== 'the_end' && ['end_highlands','end_midlands','end_barrens','small_end_islands'].includes(world.selectedBiome)) biome = world.selectedBiome;
  return { top, bottom, biome };
}

export function decorateEndChunk(world, chunk) {
  const ox = chunk.cx * 16, oz = chunk.cz * 16;
  const put = (x, y, z, id) => {
    if (x < ox || x >= ox + 16 || z < oz || z >= oz + 16 || y >= 63 || y < 1) return;
    if (chunk.getVoxel(x-ox,y,z-oz) === B.AIR) chunk.setVoxel(x-ox,y,z-oz,id);
  };
  // A global candidate grid allows branching across chunk borders without
  // writing or generating neighbours; generation order cannot clip a tree.
  for (let gx = Math.floor((ox-5)/8); gx <= Math.floor((ox+20)/8); gx++) for (let gz = Math.floor((oz-5)/8); gz <= Math.floor((oz+20)/8); gz++) {
    const r = salt => coordinateRandom(world.seed,gx,0,gz,salt);
    if (r(221) > .24) continue;
    const x = gx*8+1+Math.floor(r(223)*6), z = gz*8+1+Math.floor(r(225)*6);
    const column = endColumn(world,x,z);
    if (column.top === 0 || column.biome !== 'end_highlands') continue;
    const y = column.top+1, height = 4+Math.floor(r(227)*5);
    for (let dy=0;dy<height;dy++) put(x,y+dy,z,B.CHORUS_PLANT);
    put(x,y+height,z,B.CHORUS_FLOWER);
    for (const [dx,dz,salt] of [[1,0,229],[-1,0,231],[0,1,233],[0,-1,235]]) {
      if (r(salt)>.6) continue;
      const branchY=y+height-2, length=1+Math.floor(r(salt+20)*3);
      for(let d=1;d<=length;d++) put(x+dx*d,branchY,z+dz*d,B.CHORUS_PLANT);
      for(let d=1;d<=2;d++) put(x+dx*length,branchY+d,z+dz*length,d===2?B.CHORUS_FLOWER:B.CHORUS_PLANT);
    }
  }
}
