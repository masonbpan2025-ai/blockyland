import { BLOCKS } from './blocks.js';
export const isCauldron=id=>[BLOCKS.CAULDRON,BLOCKS.WATER_CAULDRON,BLOCKS.LAVA_CAULDRON,BLOCKS.POWDER_SNOW_CAULDRON].includes(id);
export function cauldronLevel(world,x,y,z){return world.getVoxel(x,y,z)===BLOCKS.CAULDRON?0:world.cauldronLevels?.get(`${x},${y},${z}`)??3;}
export function setCauldronLevel(world,x,y,z,id,level){world.setVoxel(x,y,z,level?id:BLOCKS.CAULDRON);world.cauldronLevels??=new Map();if(level)world.cauldronLevels.set(`${x},${y},${z}`,level);else world.cauldronLevels.delete(`${x},${y},${z}`);}
export function useCauldronBucket(world,x,y,z,bucket){
  const id=world.getVoxel(x,y,z);if(!isCauldron(id))return null;
  if(bucket==='bucket'){
    const result=id===BLOCKS.WATER_CAULDRON?'water_bucket':id===BLOCKS.LAVA_CAULDRON?'lava_bucket':id===BLOCKS.POWDER_SNOW_CAULDRON?'powder_snow_bucket':null;
    if(!result||cauldronLevel(world,x,y,z)<3)return false;
    setCauldronLevel(world,x,y,z,BLOCKS.CAULDRON,0);return result;
  }
  const filled={water_bucket:BLOCKS.WATER_CAULDRON,lava_bucket:BLOCKS.LAVA_CAULDRON,powder_snow_bucket:BLOCKS.POWDER_SNOW_CAULDRON}[bucket];
  if(!filled||id===filled&&cauldronLevel(world,x,y,z)===3)return false;
  setCauldronLevel(world,x,y,z,filled,3);return 'bucket';
}
