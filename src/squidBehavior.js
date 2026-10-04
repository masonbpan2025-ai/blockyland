import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { applyHeat } from './heat.js';
import { updateHorseLead, releaseHorseLead } from './horseLead.js';
import { createSquidModel, poseSquid } from './squidModel.js';

export const isSquid=m=>['squid','glow_squid'].includes(typeof m==='string'?m:m?.type);
const random=manager=>manager.random||Math.random;
const voxel=(world,p,dy=0)=>world.getVoxel(Math.floor(p.x),Math.floor(p.y+dy),Math.floor(p.z));
export function squidInWater(manager,m) {
  const p=m.mesh.position, h=m.isBaby?.5:.8;
  // Test the mantle/body, not the long decorative tentacles.
  return voxel(manager.world,p,h*.5)===BLOCKS.WATER || !!manager.world.isWaterlogged?.(Math.floor(p.x),Math.floor(p.y+h*.5),Math.floor(p.z));
}
export function spawnSquid(manager,type,x,y,z,options={}) {
  const r=random(manager),model=createSquidModel(type==='glow_squid');
  const isBaby=options.isBaby??(options.natural===true&&r()<.05);
  const m={...model,type,name:type==='glow_squid'?'Glow Squid':'Squid',health:10,maxHealth:10,isAquatic:true,isGlowSquid:type==='glow_squid',isBaby,naturalSpawn:options.natural===true,
    velocity:new THREE.Vector3(),yaw:r()*Math.PI*2,pitch:0,swimCycle:0,timer:0,hitCooldown:0,darkSeconds:0,drySeconds:0,babyGrowthTimer:isBaby?1200:undefined,ageLocked:false};
  m.mesh.position.set(x,y,z);m.inWater=squidInWater(manager,m);poseSquid(m);
  manager.scene.add(m.mesh);manager.mobs.push(m);return m;
}
export function canInteractSquid(m,id) {
  return m.health>0 && (id==='lead'||id==='name_tag'||(id==='golden_dandelion'&&m.isBaby&&!(m.ageLockCooldown>0)));
}
export function interactSquid(b,m,p,inventory,id) {
  if(!canInteractSquid(m,id))return false;
  const consume=()=>{if(p.gamemode!=='creative')inventory.consumeActiveItem(1);};
  if(id==='golden_dandelion'){m.ageLocked=!m.ageLocked;m.babyGrowthTimer=1200;m.ageLockCooldown=2;consume();}
  if(id==='lead'){if(m.leashHolder||m.leashAnchor)releaseHorseLead(b.mobManager,m);else{m.leashHolder=p;m.persistent=true;consume();}}
  if(id==='name_tag'){const item=inventory.getActiveItem(),name=item?.customName||item?.name;if(!name||name==='Name Tag')return false;m.name=String(name).slice(0,64);m.persistent=true;consume();}
  return true;
}
export function hurtSquid(manager,m,attacker,origin) {
  if(m.isGlowSquid)m.darkSeconds=5;
  if(!squidInWater(manager,m))return;
  const pos=m.mesh.position.clone().add(new THREE.Vector3(0,.4,0));
  manager.spawnParticleBurst?.(pos,m.isGlowSquid?0x27c6b5:0x101827,30);
  if(!m.isGlowSquid)manager.spawnParticleBurst?.(pos,0x22486d,8);
  m.inkBursts=(m.inkBursts||0)+1;
  const from=attacker?.mesh?.position||attacker?.position||origin;
  if(from){m.fleeFrom=from.clone();m.fleeTime=2.5;}
  m.velocity.y=.4;manager.sounds?.playSquid?.('ink',m.isGlowSquid,m.isBaby);
}
export function updateSquidAge(m,dt) {
  m.ageLockCooldown=Math.max(0,(m.ageLockCooldown||0)-dt);
  if(m.isBaby&&!m.ageLocked){m.babyGrowthTimer=(m.babyGrowthTimer??1200)-dt;if(m.babyGrowthTimer<=0){m.isBaby=false;m.babyGrowthTimer=0;}}
}
export function updateSquid(manager,m,dt,player) {
  const r=random(manager),p=m.mesh.position;m.inWater=squidInWater(manager,m);
  m.darkSeconds=Math.max(0,(m.darkSeconds||0)-dt);
  m.playerCreditSeconds=Math.max(0,(m.playerCreditSeconds||0)-dt);
  m.swimCycle+=dt;m.fleeTime=Math.max(0,(m.fleeTime||0)-dt);
  if(m.isGlowSquid){m.glowParticleTimer=(m.glowParticleTimer||0)-dt;if(m.glowParticleTimer<=0){manager.spawnParticleBurst?.(p.clone().add(new THREE.Vector3((r()-.5)*.8,.4,(r()-.5)*.8)),0x84efcc,1);m.glowParticleTimer=.2;m.glowParticles=(m.glowParticles||0)+1;}}
  applyHeat(manager.world,m,p,dt,n=>manager.damageMob(m,n,null,false,null,true));
  if(m.vehicle?.kind==='minecart'){m.velocity.set(0,0,0);m.drySeconds=m.inWater?0:(m.drySeconds||0)+dt;if(m.drySeconds>=15)manager.damageMob(m,m.health,null,false,null,true);poseSquid(m);return;}
  if(m.inWater){
    m.drySeconds=0;m.onGround=false;delete m.squidFallPeak;
    const active=player?.gamemode!=='spectator'&&(!player?.position||player.position.distanceTo(p)<=32);
    if(active){
      let direction;
      if(m.fleeTime>0&&m.fleeFrom){direction=p.clone().sub(m.fleeFrom);direction.y=.35;direction.normalize();m.targetPos=null;}
      else {
        m.timer-=dt;
        if(!m.targetPos||m.timer<=0||m.targetPos.distanceTo(p)<.4){
          m.timer=2.5+r()*4;m.targetPos=null;
          for(let n=0;n<12;n++){const q=p.clone().add(new THREE.Vector3((r()-.5)*8,(r()-.5)*4,(r()-.5)*8));if(voxel(manager.world,q,.4)===BLOCKS.WATER&&!manager.checkMobCollision(m,q)){m.targetPos=q;break;}}
        }
        direction=m.targetPos?.clone().sub(p).normalize()||new THREE.Vector3();
      }
      const thrust=m.fleeTime>0?2.4:.2+1.2*Math.pow((Math.sin(m.swimCycle*3.5)+1)/2,2);
      m.velocity.lerp(direction.clone().multiplyScalar(thrust),Math.min(1,dt*4));
      if(direction.lengthSq()){m.yaw=Math.atan2(direction.x,direction.z);m.pitch=-Math.atan2(direction.y,Math.hypot(direction.x,direction.z));}
    }else m.velocity.set(0,0,0);
    updateHorseLead(manager,m);
  } else {
    m.drySeconds=(m.drySeconds||0)+dt;
    m.velocity.x=m.velocity.z=0;m.velocity.y=Math.max(-20,m.velocity.y-9.8*dt);
    m.squidFallPeak=Math.max(m.squidFallPeak??p.y,p.y);
    if(m.drySeconds>=15-1e-9)manager.damageMob(m,m.health,null,false,null,true);
    updateHorseLead(manager,m);m.velocity.x=m.velocity.z=0;
  }
  // Axis movement tests the body AABB only. Currents do not add velocity to squid.
  const kb=m.knockback||new THREE.Vector3();
  if(m.inWater&&player?.gamemode==='spectator')kb.set(0,0,0);
  for(const axis of ['x','z','y']) {
    const q=p.clone();q[axis]+=(m.velocity[axis]+kb[axis])*dt;
    if(!manager.checkMobCollision(m,q))p.copy(q);
    else {if(axis==='y'&&m.velocity.y<0){m.onGround=true;if(!m.inWater&&m.squidFallPeak!==undefined){const fall=m.squidFallPeak-p.y;if(fall>3)manager.damageMob(m,Math.ceil(fall-3),null,false,null,true);delete m.squidFallPeak;}}m.velocity[axis]=0;m.timer=0;}
  }
  kb.multiplyScalar(Math.exp(-8*dt));poseSquid(m);
  m.soundTimer=(m.soundTimer??10)-dt;if(m.soundTimer<=0){manager.sounds?.playSquid?.('idle',m.isGlowSquid,m.isBaby);m.soundTimer=10+r()*20;}
}
export function dropSquidLoot(manager,m,pos) {
  releaseHorseLead(manager,m);if(m.isBaby)return;
  const r=random(manager),credit=m.playerCreditSeconds>0||m.wolfKilled;
  const bonus=credit?Math.round(r()*(m.lootingLevel||0)):0;
  manager.entities?.spawnDroppedItem?.(pos,m.isGlowSquid?'glow_ink_sac':'ink_sac',false,1+Math.floor(r()*3)+bonus);
  if(credit)manager.entities?.spawnXpOrbs?.(pos,1+Math.floor(r()*3));
  manager.sounds?.playSquid?.('death',m.isGlowSquid,m.isBaby);
}
const fields=['isBaby','babyGrowthTimer','ageLocked','ageLockCooldown','darkSeconds','drySeconds','name','persistent','naturalSpawn','leashAnchor'];
export function serializeSquid(m){return isSquid(m)?Object.fromEntries(fields.filter(k=>m[k]!==undefined).map(k=>[k,m[k]])):undefined;}
export function restoreSquid(m,data){if(!isSquid(m)||!data)return;for(const k of fields)if(data[k]!==undefined)m[k]=data[k];poseSquid(m);}

// Extend existing aquatic predators with their squid prey; their other AI stays
// in the normal aquatic update when no squid is available.
export function updateSquidPredator(manager,m,dt) {
  if(!['guardian','elder_guardian','axolotl'].includes(m.type)||!squidInWater(manager,m))return false;
  m.squidHuntCooldown=Math.max(0,(m.squidHuntCooldown||0)-dt);
  if(m.type==='axolotl'&&m.squidHuntCooldown>0)return false;
  let target=null,nearest=m.type==='axolotl'?8:15;
  for(const prey of manager.mobs){if(!isSquid(prey)||prey.health<=0||!squidInWater(manager,prey))continue;const d=m.mesh.position.distanceTo(prey.mesh.position);if(d<nearest){nearest=d;target=prey;}}
  if(!target){if(m.squidPrey){m.squidPrey=null;m.laserTimer=0;if(m.laserLine){m.laserLine.removeFromParent();m.laserLine.geometry.dispose();m.laserLine.material.dispose();m.laserLine=null;}}return false;}
  if(m.squidPrey!==target){m.laserTimer=0;m.squidAttackClock=0;}m.squidPrey=target;
  const delta=target.mesh.position.clone().sub(m.mesh.position),dir=delta.clone().normalize();m.yaw=Math.atan2(dir.x,dir.z);m.mesh.rotation.y=m.yaw;
  m.squidAttackClock=Math.max(0,(m.squidAttackClock||0)-dt);
  if(m.type==='axolotl'){
    m.velocity.copy(dir).multiplyScalar(nearest>1?1.6:0);
    if(nearest<1.3&&m.squidAttackClock<=0){manager.damageMob(target,2,m.mesh.position,false,m);m.squidAttackClock=1;if(target.health<=0)m.squidHuntCooldown=120;}
    if(m.tail)m.tail.rotation.y=Math.sin((m.swimCycle=(m.swimCycle||0)+dt)*6)*.35;
  }else{
    m.velocity.copy(dir).multiplyScalar(nearest<3?-1:0);
    if(nearest>=3&&m.squidAttackClock<=0){
      // A wall interrupts the laser rather than letting it damage through stone.
      for(let d=.5;d<nearest;d+=.5){const p=m.mesh.position.clone().addScaledVector(dir,d);if(manager.isBlockSolid(Math.floor(p.x),Math.floor(p.y+.4),Math.floor(p.z))){m.laserTimer=0;return true;}}
      m.laserTimer=(m.laserTimer||0)+dt;
      const from=m.mesh.position.clone().add(new THREE.Vector3(0,.4,0)),to=target.mesh.position.clone().add(new THREE.Vector3(0,.4,0));
      if(!m.laserLine){m.laserLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x975ce8}));manager.scene.add(m.laserLine);}m.laserLine.geometry.setFromPoints([from,to]);m.laserLine.material.color.setRGB(Math.min(1,m.laserTimer/2),.5,.8);
      if(m.laserTimer>=2){const difficulty=manager.game?.difficulty||'normal';manager.damageMob(target,m.isElder?8:difficulty==='hard'?9:difficulty==='easy'?4:6,m.mesh.position,false,m);m.laserTimer=0;m.squidAttackClock=3;m.laserLine.removeFromParent();m.laserLine.geometry.dispose();m.laserLine.material.dispose();m.laserLine=null;}
    }
  }
  const q=m.mesh.position.clone().addScaledVector(m.velocity,dt);if(!manager.checkMobCollision(m,q)&&squidInWater(manager,{...m,mesh:{position:q}}))m.mesh.position.copy(q);return true;
}

export function canSpawnSquid(manager,type,x,y,z,light=0) {
  const w=manager.world,biome=String(w.getBiome?.(x,z)||w.selectedBiome||'').toLowerCase().replaceAll(' ','_');
  if(w.dimension&&w.dimension!=='overworld')return false;
  const water=w.getVoxel(x,y,z)===BLOCKS.WATER;
  if((!water&&!(type==='squid'&&w.isWaterlogged?.(x,y,z)))||manager.checkMobCollision({type},new THREE.Vector3(x+.5,y,z+.5)))return false;
  if(type==='glow_squid')return y<30&&light===0&&!['deep_dark','sulfur_caves'].includes(biome);
  // This engine compresses ocean height (default sea level 22); preserve the
  // Java 13-block depth window relative to its sea rather than spawning in air.
  const sea=w.seaLevel??63;
  return y>=sea-13&&y<=sea&&/(ocean|river)/.test(biome)&&w.getVoxel(x,y+1,z)===BLOCKS.WATER&&(w.getVoxel(x,y-1,z)===BLOCKS.WATER||w.isWaterlogged?.(x,y-1,z));
}
function spawnLight(manager,x,y,z) {
  if(manager.world.getLightLevel)return manager.world.getLightLevel(x,y,z);
  // The voxel renderer has no propagated light grid. Conservatively reject sky
  // exposure and nearby light sources rather than spawn glowing animals in daylight.
  const w=manager.world;
  let roof=false;for(let sy=y+1;sy<=Math.max(255,w.getHeightAt?.(x,z)||0);sy++){if(manager.isBlockSolid(x,sy,z)){roof=true;break;}}
  if(!roof)return 15;
  const lights=new Set(['TORCH','LANTERN','GLOWSTONE','SEA_LANTERN','SHROOMLIGHT','LAVA','FIRE','SOUL_TORCH','SOUL_LANTERN'].map(k=>BLOCKS[k]).filter(v=>v!==undefined));
  for(let dx=-14;dx<=14;dx++)for(let dy=-14;dy<=14;dy++)for(let dz=-14;dz<=14;dz++){if(Math.abs(dx)+Math.abs(dy)+Math.abs(dz)<15&&lights.has(w.getVoxel(x+dx,y+dy,z+dz)))return 1;}
  return 0;
}
export function updateSquidSpawning(manager,dt,player) {
  if(!manager.world.chunks||manager.world.dimension!=='overworld'||manager.game?.worldType==='designed'||!player?.position)return;
  manager.squidSpawnTimer=(manager.squidSpawnTimer??20)-dt;if(manager.squidSpawnTimer>0)return;manager.squidSpawnTimer=20;
  const r=random(manager);
  for(const type of ['squid','glow_squid']) {
    const cap=5;
    let room=cap-manager.mobs.filter(m=>m.health>0&&!m.persistent&&(m.type===type||(type==='squid'&&m.type==='dolphin'))).length;
    if(room<=0)continue;
    for(let n=0;n<12;n++) {
      const angle=r()*Math.PI*2,d=24+r()*64,x=Math.floor(player.position.x+Math.sin(angle)*d),z=Math.floor(player.position.z+Math.cos(angle)*d);
      const sea=manager.world.seaLevel??63;
      const min=type==='squid'?sea-13:Math.max(0,Math.floor(player.position.y)-48),max=type==='squid'?sea:29;
      let spawned=false;
      for(let y=max;y>=min;y--) {
        if(!canSpawnSquid(manager,type,x,y,z,type==='glow_squid'?1:0)) {
          if(type!=='glow_squid'||manager.world.getVoxel(x,y,z)!==BLOCKS.WATER)continue;
          if(!canSpawnSquid(manager,type,x,y,z,spawnLight(manager,x,y,z)))continue;
        }
        // Check the category cap before the group, as Minecraft does; a complete
        // school may take the population slightly over that cap.
        const count=type==='glow_squid'?4+Math.floor(r()*3):2+Math.floor(r()*3);
        for(let i=0;i<count;i++){const sx=x+i;if(canSpawnSquid(manager,type,sx,y,z,type==='glow_squid'?spawnLight(manager,sx,y,z):0)){spawnSquid(manager,type,sx+.5,y,z+.5,{natural:true});room--;spawned=true;}}
        if(spawned)break;
      }
      if(spawned)break;
    }
  }
}
