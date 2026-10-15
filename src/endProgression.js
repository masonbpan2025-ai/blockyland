import * as THREE from 'three';
import { BLOCKS as B, BLOCK_DEFS } from './blocks.js';
import { endColumn, END_OUTER_RADIUS } from './endTerrain.js';
import { CellCanvas } from './worldgen/cellStructure.js';
import { buildGateway, PLATFORM } from './worldgen/generators/endFeatures.js';
import { netherRandom as coordinateRandom } from './netherTerrain.js';
import { serializeMobState, restoreMobState } from './mobState.js';

export function createEndState(seed) {
  return { seed, initialized: false, defeated: false, kills: 0, health: 200,
    crystals: Array(10).fill(true), gateways: [], residents: [], respawning: false };
}
export function endStateFor(world) {
  if (!world.endState || world.endState.seed !== world.seed) world.endState = createEndState(world.seed);
  return world.endState;
}
export function captureEndState(world,game=world?.game) {
  if(world?.dimension==='the_end'&&game?.mobs)cacheEndResidents(game);
  return world?.endState ? JSON.parse(JSON.stringify(world.endState)) : null;
}
export function restoreEndState(world, saved) {
  const state = createEndState(world.seed);
  if (saved && saved.seed === world.seed) {
    state.initialized = saved.initialized === true;
    state.defeated = saved.defeated === true;
    state.kills = Math.max(0, Math.min(100000, Math.floor(Number(saved.kills) || 0)));
    state.health = Math.max(0, Math.min(200, Number(saved.health) || 0));
    state.crystals = Array.from({length:10},(_,i)=>saved.crystals?.[i] !== false);
    state.gateways = (Array.isArray(saved.gateways) ? saved.gateways : []).filter(g=>[g.x,g.y,g.z].every(Number.isFinite)).map(g=>({x:g.x,y:g.y,z:g.z,destination:g.destination && [g.destination.x,g.destination.y,g.destination.z].every(Number.isFinite)?{...g.destination}:null}));
    // A save during the ritual restarts the ritual on next arena entry.
    state.respawning = saved.respawning === true;
    state.residents=(Array.isArray(saved.residents)?saved.residents:[]).filter(m=>m&&['enderman','shulker'].includes(m.type)&&[m.x,m.y,m.z,m.health].every(Number.isFinite));
  }
  world.endState = state;
  return state;
}
export function cacheEndResidents(game) {
  if(game.world?.dimension!=='the_end')return;
  endStateFor(game.world).residents=(game.mobs?.mobs??[]).filter(m=>['enderman','shulker'].includes(m.type)&&m.health>0&&!m.dying).map(m=>({type:m.type,x:m.mesh.position.x,y:m.mesh.position.y,z:m.mesh.position.z,health:m.health,yaw:m.yaw??0,state:serializeMobState(m,game)}));
}
export function restoreEndResidents(game) {
  for(const record of endStateFor(game.world).residents??[]) {
    const mob=game.mobs?.spawnMob?.(record.type,record.x,record.y,record.z);
    if(mob){mob.health=record.health;mob.yaw=record.yaw;restoreMobState(mob,record.state,{player:game.player});}
  }
}
export function writeEndCanvas(world, canvas, game=world.game) {
  const chunks = new Set();
  for (const cell of canvas.cells.values()) {
    const id=B[cell.name.toUpperCase()];
    if(id===undefined || cell.y<0 || cell.y>=64) continue;
    world.setVoxel(cell.x,cell.y,cell.z,id);
    if(cell.props?.facing) world.applyStructureOrientation?.({...cell,id,facing:cell.props.facing});
    chunks.add(`${Math.floor(cell.x/16)},${Math.floor(cell.z/16)}`);
  }
  for(const key of chunks) {
    const chunk=world.getChunk?.(...key.split(',').map(Number));
    if(chunk) game?.rebuildChunkMesh?.(chunk);
  }
}
export function addEndGateway(world, x, y, z, destination=null) {
  const state=endStateFor(world);
  let gateway=state.gateways.find(g=>g.x===x&&g.y===y&&g.z===z);
  if(!gateway) { gateway={x,y,z,destination}; state.gateways.push(gateway); }
  const canvas=new CellCanvas();buildGateway(canvas,x,y,z);writeEndCanvas(world,canvas);
  return gateway;
}
export function decorateEndReturnGateway(world,chunk) {
  const x=chunk.cx*16+8,z=chunk.cz*16+8;
  if(Math.hypot(x,z)<END_OUTER_RADIUS||coordinateRandom(world.seed,chunk.cx,0,chunk.cz,251)>=.01)return;
  const c=endColumn(world,x,z);
  if(c.top) addEndGateway(world,x,c.top+3,z,{x:PLATFORM.x+.5,y:PLATFORM.y+1,z:PLATFORM.z+.5});
}
export function findOuterEndLanding(world, x, z) {
  // Search pure columns, not generated chunks: a gateway must not generate the
  // thousand-block void corridor while looking for an island.
  for(let radius=0;radius<=192;radius+=4) {
    for(let dx=-radius;dx<=radius;dx+=4) for(const dz of radius===0?[0]:[-radius,radius]) {
      const px=Math.floor(x+dx),pz=Math.floor(z+dz),c=endColumn(world,px,pz);
      if(Math.hypot(px,pz)<END_OUTER_RADIUS || !c.top)continue;
      if([[2,0],[-2,0],[0,2],[0,-2]].every(([nx,nz])=>endColumn(world,px+nx,pz+nz).top>0))return{x:px,y:c.top+1,z:pz};
    }
    for(let dz=-radius+4;dz<radius;dz+=4) for(const dx of [-radius,radius]) {
      const px=Math.floor(x+dx),pz=Math.floor(z+dz),c=endColumn(world,px,pz);
      if(c.top && Math.hypot(px,pz)>=END_OUTER_RADIUS && [[2,0],[-2,0],[0,2],[0,-2]].every(([nx,nz])=>endColumn(world,px+nx,pz+nz).top>0))return{x:px,y:c.top+1,z:pz};
    }
  }
  return null;
}
export function useEndGateway(game,x,y,z) {
  const w=game.world,p=game.player;
  if(w.dimension!=='the_end'||w.getVoxel(x,y,z)!==B.END_GATEWAY||p.isDead||p.gamemode==='spectator')return false;
  if((game.endGatewayCooldown??0)>0)return false;
  const state=endStateFor(w);
  let gate=state.gateways.find(g=>g.x===x&&g.y===y&&g.z===z);
  if(!gate){gate={x,y,z,destination:null};state.gateways.push(gate);}
  if(!gate.destination) {
    if(Math.hypot(x,z)<END_OUTER_RADIUS) {
      const length=Math.hypot(x,z)||1, landing=findOuterEndLanding(w,x/length*1280,z/length*1280);
      if(!landing)return false;
      // A counterpart on the selected island; stand atop its bedrock cap so
      // teleportation cannot arrive inside chorus plants or the portal itself.
      const peer=addEndGateway(w,landing.x,landing.y+2,landing.z,{x:x+.5,y:y+3,z:z+.5});
      gate.destination={x:peer.x+.5,y:peer.y+3,z:peer.z+.5};
    } else gate.destination={x:PLATFORM.x+.5,y:PLATFORM.y+1,z:PLATFORM.z+.5};
  }
  const to=gate.destination;
  w.getOrCreateChunk?.(Math.floor(to.x/16),Math.floor(to.z/16));
  p.position.set(to.x,to.y,to.z);p.velocity?.set(0,0,0);p.fallDistance=0;
  game.endGatewayCooldown=2;
  game.camera?.position?.copy(p.position)?.add?.(new THREE.Vector3(0,p.eyeHeight??1.62,0));
  game.loadChunksAroundPlayer?.();game.sounds?.playLevelUp?.();
  return true;
}
export function updateEndGatewayTravel(game,dt) {
  game.endGatewayCooldown=Math.max(0,(game.endGatewayCooldown??0)-dt);
  if(game.world?.dimension!=='the_end'||!game.player?.position)return;
  const p=game.player.position;
  for(const y of [Math.floor(p.y),Math.floor(p.y+(game.player.eyeHeight??1.62))]) {
    if(useEndGateway(game,Math.floor(p.x),y,Math.floor(p.z)))break;
  }
}
export function endReturnArrival(game) {
  const p=game.player,w=game.world;
  for(const candidate of [p.commandSpawnPosition,p.bedDimension==='overworld'?p.bedSpawnPosition:null,p.spawnPosition]) {
    if(!candidate)continue;
    const x=Math.floor(candidate.x),y=Math.floor(candidate.y),z=Math.floor(candidate.z);
    w.getOrCreateChunk?.(Math.floor(x/16),Math.floor(z/16));
    const solid=id=>id!==B.AIR&&BLOCK_DEFS[id]?.solid!==false&&!BLOCK_DEFS[id]?.plant;
    if(!solid(w.getVoxel(x,y,z))&&!solid(w.getVoxel(x,y+1,z))&&solid(w.getVoxel(x,y-1,z)))return{x:candidate.x,y:candidate.y,z:candidate.z};
  }
  return null;
}
