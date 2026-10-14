import {BLOCKS as B} from '../blocks.js';
const HABITATS=new Set(['swamp','mangrove_swamp','badlands','eroded_badlands','wooded_badlands','river']);
// Local water checks keep decoration independent of neighbouring chunk load order.
export function plantFireflyBushes(world,chunk){
  for(let x=1;x<15;x++)for(let z=1;z<15;z++){
    const wx=chunk.cx*16+x,wz=chunk.cz*16+z;if(!HABITATS.has(world.getBiome(wx,wz)))continue;
    const roll=(((Math.imul(wx,73856093)^Math.imul(wz,19349663)^(world.seed||0))>>>0)%101)/101;if(roll>.07)continue;
    for(let y=62;y>=1;y--){
      const id=chunk.getVoxel(x,y,z);if(id===B.AIR)continue;
      if(![B.GRASS,B.DIRT,B.SAND,B.RED_SAND,B.MUD].includes(id)||chunk.getVoxel(x,y+1,z)!==B.AIR)break;
      if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>[0,1].some(dy=>chunk.getVoxel(x+dx,y+dy,z+dz)===B.WATER)))chunk.setVoxel(x,y+1,z,B.FIREFLY_BUSH);
      break;
    }
  }
}
