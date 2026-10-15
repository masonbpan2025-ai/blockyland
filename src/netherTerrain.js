import { BLOCKS as B, BLOCK_DEFS } from './blocks.js';

// Coordinate hashing makes decoration independent of chunk load order and of
// Math.random. Densities and heights are adapted to the engine's 64-block world.
export function netherRandom(seed,x,y,z,salt=0) {
  let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(z|0,1274126177)^Math.imul(seed|0,1597334677)^salt;
  h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;
}

export function netherOreAt(seed,x,y,z) {
  const cell=netherRandom(seed,Math.floor(x/3),Math.floor(y/3),Math.floor(z/3),31);
  const r=netherRandom(seed,x,y,z,53);
  // Ancient debris is buried, uncommon and concentrated deep in the lower strata.
  if(y>=5 && y<=16 && netherRandom(seed,x,y,z,79)<0.0007)return B.ANCIENT_DEBRIS;
  if(cell<0.045 && r<0.3)return B.NETHER_GOLD_ORE;
  if(cell>=0.045 && cell<0.12 && r<0.3)return B.NETHER_QUARTZ_ORE;
  if(y<25 && cell>0.94)return B.BLACKSTONE;
  return B.NETHERRACK;
}

export function decorateNetherChunk(world,chunk) {
  const ox=chunk.cx*16,oz=chunk.cz*16;
  const floorAt=(x,z)=>Math.min(36,Math.max(8,world.getHeight(x,z,world.getBiome(x,z))));
  const put=(x,y,z,id)=>{
    if(x<ox||x>=ox+16||z<oz||z>=oz+16||y<1||y>=63)return;
    const old=chunk.getVoxel(x-ox,y,z-oz);
    if(old===B.AIR || BLOCK_DEFS[old]?.plant)chunk.setVoxel(x-ox,y,z-oz,id);
  };
  // Huge fungi use a global candidate grid and write only this chunk's part of
  // each canopy, including trees rooted across its border.
  for(let gx=Math.floor((ox-3)/7);gx<=Math.floor((ox+18)/7);gx++)for(let gz=Math.floor((oz-3)/7);gz<=Math.floor((oz+18)/7);gz++) {
    const x=gx*7+1+Math.floor(netherRandom(world.seed,gx,0,gz,101)*5);
    const z=gz*7+1+Math.floor(netherRandom(world.seed,gx,0,gz,103)*5);
    const biome=world.getBiome(x,z),crimson=biome==='crimson_forest';
    if(!crimson&&biome!=='warped_forest')continue;
    if(netherRandom(world.seed,gx,0,gz,107)>0.65)continue;
    const floor=floorAt(x,z);if(floor<=world.seaLevel+1||(world.caves&&world.caves.cellAt(x,floor,z)!==null))continue;
    const height=4+Math.floor(netherRandom(world.seed,x,0,z,109)*5),cap=floor+height;
    const stem=crimson?B.CRIMSON_STEM:B.WARPED_STEM,wart=crimson?B.NETHER_WART_BLOCK:B.WARPED_WART_BLOCK;
    for(let y=floor+1;y<=cap;y++)put(x,y,z,stem);
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++) {
      if(Math.abs(dx)===2&&Math.abs(dz)===2)continue;
      put(x+dx,cap,z+dz,wart);put(x+dx,cap+1,z+dz,wart);
      if(netherRandom(world.seed,x+dx,cap,z+dz,113)<0.16)put(x+dx,cap-1,z+dz,B.SHROOMLIGHT);
      else if(Math.abs(dx)===2||Math.abs(dz)===2)put(x+dx,cap-1,z+dz,wart);
    }
    if(crimson)for(let dx=-1;dx<=1;dx++)if(netherRandom(world.seed,x+dx,cap,z,127)<0.4) {
      for(let y=cap-2;y>=cap-4;y--)put(x+dx,y,z,B.WEEPING_VINES);
    }
  }
  // Small mushrooms of BOTH colours are food ingredients. Crimson/warped fungi
  // are separate plants used for breeding, repellents and renewable timber.
  for(let x=ox;x<ox+16;x++)for(let z=oz;z<oz+16;z++) {
    const biome=world.getBiome(x,z),floor=floorAt(x,z),y=floor+1;
    if(floor<=world.seaLevel||chunk.getVoxel(x-ox,y,z-oz)!==B.AIR||![B.CRIMSON_NYLIUM,B.WARPED_NYLIUM,B.NETHERRACK,B.SOUL_SAND,B.SOUL_SOIL,B.BASALT,B.BLACKSTONE,B.GRAVEL].includes(chunk.getVoxel(x-ox,floor,z-oz)))continue;
    const r=netherRandom(world.seed,x,y,z,131);
    if(r<0.035)put(x,y,z,B.BROWN_MUSHROOM);
    else if(r<0.07)put(x,y,z,B.RED_MUSHROOM);
    else if(biome==='crimson_forest') {
      if(r<0.13)put(x,y,z,B.CRIMSON_FUNGUS);
      else if(r<0.15)put(x,y,z,B.WARPED_FUNGUS);
      else if(r<0.4)put(x,y,z,B.CRIMSON_ROOTS);
    } else if(biome==='warped_forest') {
      if(r<0.14)put(x,y,z,B.WARPED_FUNGUS);
      else if(r<0.36)put(x,y,z,B.WARPED_ROOTS);
      else if(r<0.45)put(x,y,z,B.NETHER_SPROUTS);
      else if(r<0.48)for(let dy=0;dy<3;dy++)put(x,y+dy,z,B.TWISTING_VINES);
    }
  }
}
