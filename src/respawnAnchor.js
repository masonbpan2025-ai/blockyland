import * as THREE from 'three';
import { BLOCKS as B, BLOCK_DEFS, blockIdForPlacement } from './blocks.js';

export function anchorCharges(world,x,y,z) {
  const state=world.structureOrientations?.get(`${x},${y},${z}`);
  return state?.anchorDimension && state.anchorDimension!==world.dimension?0:state?.anchorCharges??0;
}
function setCharges(world,x,y,z,n) {
  world.structureOrientations??=new Map();
  world.structureOrientations.set(`${x},${y},${z}`,{x,y,z,id:B.RESPAWN_ANCHOR,anchorCharges:n,anchorDimension:world.dimension});
  const chunk=world.getChunk?.(Math.floor(x/16),Math.floor(z/16));if(chunk)chunk.dirty=true;
  world.light?.markBlockChanged?.(x,y,z);
  if(chunk)world.game?.rebuildChunkMesh?.(chunk);
}
export function useRespawnAnchor(game,x,y,z) {
  const world=game.world;if(world.getVoxel(x,y,z)!==B.RESPAWN_ANCHOR)return false;
  const item=game.inventory.getActiveItem(),charge=anchorCharges(world,x,y,z);
  if(item && blockIdForPlacement(item)===B.GLOWSTONE && charge<4) {
    setCharges(world,x,y,z,charge+1);
    if(game.player.gamemode!=='creative')game.inventory.consumeActiveItem();
    game.ui?.updateHotbar?.();game.sounds?.playPlace?.('stone');
    game.ui?.addChatMessage?.(`Respawn anchor: ${charge+1}/4 charges.`, 'system');return true;
  }
  if(charge===0)return true;
  if(!['nether','the_nether'].includes(world.dimension)) {
    // The same explosive bed interaction supplies terrain damage, knockback,
    // blast particles and sound; charged anchors are unsafe outside the Nether.
    game.bedManager?.explode?.(x,y,z);return true;
  }
  game.player.anchorSpawn={x,y,z,dimension:world.dimension};
  game.player.bedSpawnPosition=null;
  game.ui?.addChatMessage?.('Respawn point set at the anchor.', 'system');return true;
}
export function consumeAnchorRespawn(player) {
  const a=player.anchorSpawn,w=player.world;if(!a||!w)return null;
  if(a.dimension!==w.dimension||w.getVoxel(a.x,a.y,a.z)!==B.RESPAWN_ANCHOR||anchorCharges(w,a.x,a.y,a.z)<=0)return null;
  const solid=id=>id!==B.AIR && BLOCK_DEFS[id]?.solid!==false && !BLOCK_DEFS[id]?.plant;
  const safe=(x,y,z)=>{
    const feet=w.getVoxel(x,y,z),head=w.getVoxel(x,y+1,z),below=w.getVoxel(x,y-1,z);
    return !solid(feet)&&!solid(head)&&solid(below)&&![B.LAVA,B.FIRE,B.SOUL_FIRE].includes(feet)&&![B.LAVA,B.FIRE,B.SOUL_FIRE].includes(head)&&below!==B.MAGMA_BLOCK;
  };
  for(const dy of [0,1,-1])for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++) {
    if(dx===0&&dz===0)continue;
    if(safe(a.x+dx,a.y+dy,a.z+dz)) {
      setCharges(w,a.x,a.y,a.z,anchorCharges(w,a.x,a.y,a.z)-1);
      return new THREE.Vector3(a.x+dx+.5,a.y+dy,a.z+dz+.5);
    }
  }
  return null;
}
