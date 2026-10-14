import { waterEvaporates } from './waterRules.js';
import { BLOCKS } from './blocks.js';
import { waterReplaceable } from './waterSimulation.js';
import { useCauldronBucket } from './cauldrons.js';

export const isBucket = item => item && !item.isBlock && ['bucket','water_bucket','lava_bucket','powder_snow_bucket'].includes(item.id);

// Empty buckets hit source liquids; full buckets look through water to the
// supporting block. A solid block always stops the ray, even for an empty bucket.
export function traceBucket(world, origin, direction, empty, reach=5.2) {
  const cell={x:Math.floor(origin.x),y:Math.floor(origin.y),z:Math.floor(origin.z)};
  const normal={x:0,y:0,z:0}, step={}, delta={}, next={};
  for(const axis of ['x','y','z']) {
    step[axis]=direction[axis]>0?1:-1;
    delta[axis]=direction[axis]===0?Infinity:Math.abs(1/direction[axis]);
    next[axis]=direction[axis]===0?Infinity:((step[axis]>0?cell[axis]+1:cell[axis])-origin[axis])/direction[axis];
  }
  let distance=0;
  while(distance<=reach) {
    const id=world.getVoxel(cell.x,cell.y,cell.z);
    const source=id===BLOCKS.WATER && world.getWaterLevel(cell.x,cell.y,cell.z)===0;
    if ((empty && (source||(id===BLOCKS.LAVA&&world.getLavaLevel(cell.x,cell.y,cell.z)===0))) || (id!==BLOCKS.AIR && id!==BLOCKS.WATER && id!==BLOCKS.LAVA)) return {...cell,normal:{...normal},blockId:id};
    const axis=next.x<next.y?(next.x<next.z?'x':'z'):(next.y<next.z?'y':'z');
    if(!Number.isFinite(next[axis])) break;
    cell[axis]+=step[axis]; distance=next[axis]; next[axis]+=delta[axis];
    normal.x=normal.y=normal.z=0; normal[axis]=-step[axis];
  }
  return null;
}

/**
 * Fill or empty a bucket at a traced cell.
 *
 * `dimension` decides whether poured water stays: "Water never generates in the Nether and disappears if placed
 * there with a bucket, but it works normally in the End" (Water). An evaporated pour still empties the bucket, and
 * the result says so, so the caller can play the hiss instead of the splash.
 */
export function useBucket(world, inventory, mode, hit, overflow=()=>{}, { dimension = null } = {}) {
  const active=inventory.getActiveItem();
  if(!isBucket(active)||!hit) return false;
  let {x,y,z}=hit;
  let replacement;
  let evaporated=false;
  const cauldron=useCauldronBucket(world,x,y,z,active.id);
  if(cauldron===false)return false;
  if(cauldron)replacement=cauldron;
  else if(active.id==='bucket') {
    const id=world.getVoxel(x,y,z);
    if(id===BLOCKS.WATER && world.getWaterLevel(x,y,z)===0) replacement='water_bucket';
    else if(id===BLOCKS.LAVA && world.getLavaLevel(x,y,z)===0) replacement='lava_bucket';
    else if(id===BLOCKS.POWDER_SNOW) replacement='powder_snow_bucket';
    else return false;
    world.setVoxel(x,y,z,BLOCKS.AIR);
  } else {
    if(!waterReplaceable(world.getVoxel(x,y,z))) {
      if(!hit.normal || !(Math.abs(hit.normal.x)+Math.abs(hit.normal.y)+Math.abs(hit.normal.z))) return false;
      x+=hit.normal.x; y+=hit.normal.y; z+=hit.normal.z;
    }
    if(y<0||y>=64) return false;
    world.getOrCreateChunk(Math.floor(x/16),Math.floor(z/16));
    const target=world.getVoxel(x,y,z), liquid=active.id==='water_bucket'?BLOCKS.WATER:active.id==='powder_snow_bucket'?BLOCKS.POWDER_SNOW:BLOCKS.LAVA;
    if(liquid===BLOCKS.POWDER_SNOW&&(target===BLOCKS.WATER||target===BLOCKS.LAVA))return false;
    if(!waterReplaceable(target) && !(target===BLOCKS.LAVA && liquid===BLOCKS.WATER)) return false;
    if(target===liquid && (liquid!==BLOCKS.WATER || world.getWaterLevel(x,y,z)===0)) return false;
    if(liquid===BLOCKS.WATER && waterEvaporates(dimension ?? (world.isNether ? 'nether' : null))) {
      // Boils away: nothing is placed, and the bucket is empty all the same.
      replacement='bucket';
      evaporated=true;
    } else {
    if(target!==BLOCKS.AIR && target!==BLOCKS.WATER && target!==BLOCKS.LAVA) world.water?.onDisplace?.(x,y,z,target);
    world.setVoxel(x,y,z,target===BLOCKS.LAVA?(world.getLavaLevel(x,y,z)===0?BLOCKS.OBSIDIAN:BLOCKS.COBBLESTONE):target===BLOCKS.WATER&&liquid===BLOCKS.LAVA?BLOCKS.STONE:liquid);
    replacement='bucket';
    }
  }
  if(mode!=='creative') {
    if(active.count===1) inventory.hotbar[inventory.activeSlot]={id:replacement,isBlock:false,count:1};
    else {
      inventory.consumeActiveItem();
      if(!inventory.addItem(replacement,false,1)) overflow(replacement);
    }
  } else if(active.id==='bucket' && ![...inventory.hotbar,...inventory.storage].some(item=>item?.id===replacement)) {
    // Creative keeps the empty bucket and adds the collected liquid once.
    if(!inventory.addItem(replacement,false,1)) overflow(replacement);
  }
  return evaporated?{x,y,z,evaporated:true}:{x,y,z};
}
