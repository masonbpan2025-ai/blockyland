import {BLOCKS} from './blocks.js';
const states=new WeakMap();
export function applyHeat(world,actor,position,dt,damage){
  const state=states.get(actor)||{burn:0,timer:0};
  const x=Math.floor(position.x),y=Math.floor(position.y+.2),z=Math.floor(position.z);
  let id=world.getVoxel(x,y,z);
  if(id===BLOCKS.LAVA){const level=world.getLavaLevel?.(x,y,z)||0;const height=level===8?1:(8-level)/9;if(position.y>y+height)id=BLOCKS.AIR;}
  if(id===BLOCKS.WATER){state.burn=0;state.timer=0;}
  else{
    if(id===BLOCKS.LAVA||id===BLOCKS.FIRE)state.burn=id===BLOCKS.LAVA?15:8;
    else state.burn=Math.max(0,state.burn-dt);
    state.timer-=dt;
    if(state.burn>0&&state.timer<=0){damage(id===BLOCKS.LAVA?4:1);state.timer=id===BLOCKS.LAVA?.5:1;}
    if(id===BLOCKS.LAVA && actor.gamemode!=='creative' && actor.velocity){actor.velocity.x*=.65;actor.velocity.z*=.65;actor.velocity.y=Math.max(-2,actor.velocity.y);}
  }
  states.set(actor,state);
}
