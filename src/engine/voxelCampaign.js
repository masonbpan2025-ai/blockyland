import { BLOCKS } from '../blocks.js';
// Game generators return terrain descriptors; the engine owns actual chunk storage and meshing.
export function installVoxelCampaign(game, tiles, seed,{decorativeProps=false}={}) {
  for(const chunk of game.world.chunks.values())for(const slot of ['opaqueMesh','transparentMesh','waterMesh','lightMesh']){
    if(chunk[slot]){game.scene.remove(chunk[slot]);chunk[slot].geometry?.dispose();}
  }
  game.streamer?.reset();game.world.reseed(seed,'all');game.world.generationMode='authored';
  const surfaces=[BLOCKS.GRASS,BLOCKS.RED_SAND??BLOCKS.SAND,BLOCKS.MOSS_BLOCK??BLOCKS.GRASS,BLOCKS.SNOW_BLOCK??BLOCKS.WHITE_WOOL,BLOCKS.OBSIDIAN];
  const put=(x,y,z,id)=>{const chunk=game.world.getOrCreateChunk(Math.floor(x/16),Math.floor(z/16));chunk.setVoxel(x&15,y,z&15,id);};
  for(const t of tiles)for(let dx=0;dx<2;dx++)for(let dz=0;dz<2;dz++){
    const x=t.x*2+dx,z=t.z*2+dz,top=t.wet?19:19+Math.round(t.h);
    for(let y=17;y<=top;y++)put(x,y,z,y===top?(t.bridge?BLOCKS.OAK_PLANKS:t.road?BLOCKS.COBBLESTONE:surfaces[t.b]):BLOCKS.STONE);
    if(t.wet)put(x,20,z,t.b===4?BLOCKS.LAVA:BLOCKS.WATER);
    if(!decorativeProps&&t.prop&&t.block&&!t.wet){const h=t.prop===1?4:2;for(let y=top+1;y<=top+h;y++)put(x,y,z,t.prop===1?BLOCKS.OAK_LOG:BLOCKS.STONE);
      if(t.prop===1)put(x,top+h+1,z,t.b===3?BLOCKS.SNOW_BLOCK??BLOCKS.WHITE_WOOL:BLOCKS.OAK_LEAVES);}
  }
  // Neighbour reads during meshing may populate the cache but cannot generate procedural terrain.
  game.world.invalidateChunkCache();
  for(const chunk of game.world.chunks.values())game.rebuildChunkMesh(chunk);
}
