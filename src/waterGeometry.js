import { BLOCKS } from './blocks.js';

export function waterHeight(world,x,y,z) {
  if(world.getVoxel(x,y,z)!==BLOCKS.WATER) return 0;
  const level=world.getWaterLevel?.(x,y,z) ?? 0;
  if(level===8 || world.getVoxel(x,y+1,z)===BLOCKS.WATER) return 1;
  return (8-level)/9;
}

// World-coordinate corners are shared across chunk boundaries and side faces.
export function waterCornerHeight(world,x,y,z) {
  let sum=0, weights=0;
  for(let dx=-1;dx<=0;dx++) for(let dz=-1;dz<=0;dz++) {
    const id=world.getVoxel(x+dx,y,z+dz);
    if(id===BLOCKS.WATER) {
      if(world.getVoxel(x+dx,y+1,z+dz)===BLOCKS.WATER) return 1;
      const height=waterHeight(world,x+dx,y,z+dz), weight=height>=8/9?10:1;
      sum+=height*weight; weights+=weight;
    } else if(id===BLOCKS.AIR) weights++;
  }
  return weights?sum/weights:0;
}

export function waterCurrent(world,x,y,z) {
  const level=world.getWaterLevel?.(x,y,z) ?? -1;
  if(level<0) return {x:0,y:0,z:0};
  const base=level===8?0:level;
  let vx=0,vz=0;
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const adjacent=world.getWaterLevel(x+dx,y,z+dz);
    if(adjacent>=0) {
      const gradient=(adjacent===8?0:adjacent)-base;
      vx+=dx*gradient; vz+=dz*gradient;
    } else if(world.getVoxel(x+dx,y,z+dz)===BLOCKS.AIR && world.getVoxel(x+dx,y-1,z+dz)===BLOCKS.WATER) { vx+=dx*8; vz+=dz*8; }
  }
  const length=Math.hypot(vx,vz)||1;
  return {x:vx/length,y:level===8?-1:0,z:vz/length};
}
