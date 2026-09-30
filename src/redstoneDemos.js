import {BLOCKS as B} from './blocks.js';
// Real components: no scripted movement; both examples run through piston physics.
export function redstoneDemoPlan(type,origin){
  const cells=type==='flyer'?[[0,3,0,B.SLIME_BLOCK],[0,3,1,B.PISTON,0],[0,4,0,B.OBSERVER,2],[1,3,1,B.SLIME_BLOCK],[1,3,0,B.STICKY_PISTON,1],[1,4,1,B.OBSERVER,2]]:
    [[0,0,0,B.STICKY_PISTON,2],[0,1,0,B.SLIME_BLOCK],[1,1,0,B.SLIME_BLOCK],[-1,0,0,B.LEVER],[1,0,2,B.STONE_BRICKS],[1,1,2,B.STONE_BRICKS]];
  return cells.map(([x,y,z,id,dir=0])=>({p:[origin[0]+x,origin[1]+y,origin[2]+z],id,dir}));
}
export function buildRedstoneDemo(world,type,origin){
  if(!['flyer','elevator'].includes(type))throw new Error('Use /redstone demo flyer or /redstone demo elevator');
  const cells=redstoneDemoPlan(type,origin);
  if(cells.some(c=>!world.redstone.loaded(c.p)||world.getVoxel(...c.p)!==B.AIR))throw new Error('The demo needs empty loaded space. Move into an open area and try again.');
  for(const c of cells){world.setVoxel(...c.p,c.id);world.redstone.configure(c.p,c.dir);}
  if(type==='flyer')world.redstone.state([origin[0],origin[1]+4,origin[2]]).until=world.redstone.tickNumber+2;
  return cells;
}
