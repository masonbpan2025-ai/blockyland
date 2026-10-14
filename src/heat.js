import {BLOCKS} from './blocks.js';
import { exposedToRain } from './weatherRules.js';
const states=new WeakMap();
export function applyHeat(world,actor,position,dt,damage){
  if (actor.fireImmune || actor.isFireImmune || actor.fireResistanceTime > 0 || actor.hasStatusEffect?.('fire_resistance')) return;
  const netherImmune = ['blaze', 'ghast', 'magma_cube', 'zombified_piglin', 'zombie_pigman', 'wither_skeleton', 'strider'];
  if (netherImmune.includes(actor.type)) return;
  const state=states.get(actor)||{burn:0,timer:0};
  const x=Math.floor(position.x),y=Math.floor(position.y+.2),z=Math.floor(position.z);
  let id=world.getVoxel(x,y,z);
  if(id===BLOCKS.LAVA){const level=world.getLavaLevel?.(x,y,z)||0;const height=level===8?1:(8-level)/9;if(position.y>y+height)id=BLOCKS.AIR;}
  if(id===BLOCKS.WATER||exposedToRain(world.game?.weather??world.weather,world,{x:position.x,y:position.y+.5,z:position.z})){state.burn=0;state.timer=0;}
  else{
    const burnBefore=state.burn;
    if(id===BLOCKS.LAVA||id===BLOCKS.FIRE)state.burn=id===BLOCKS.LAVA?15:8;
    else state.burn=Math.max(0,state.burn-dt);
    state.timer-=dt;
    if((state.burn>0||burnBefore>0)&&state.timer<=1e-8){damage(id===BLOCKS.LAVA?4:1);state.timer=id===BLOCKS.LAVA?.5:1;}
    if(id===BLOCKS.LAVA && actor.gamemode!=='creative' && actor.velocity && actor.type!=='strider'){actor.velocity.x*=.65;actor.velocity.z*=.65;actor.velocity.y=Math.max(-2,actor.velocity.y);}
  }
  actor.fireTicks = state.burn;
  actor.isOnFire = state.burn > 0;
  states.set(actor,state);
}

export function igniteActor(actor, seconds) {
  if (actor.fireImmune || actor.hasStatusEffect?.("fire_resistance")) return;
  const state = states.get(actor) || {burn:0,timer:1};
  state.burn = Math.max(state.burn, seconds); states.set(actor,state);
  actor.fireTicks=state.burn; actor.isOnFire=true;
}
