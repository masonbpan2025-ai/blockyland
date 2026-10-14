import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { exposedToRain } from './weatherRules.js';
import { poseStrider } from './striderModel.js';
import { updateHorseLead, releaseHorseLead } from './horseLead.js';
import { BABY_GROWTH_SECONDS, accelerateBabyGrowth } from './babyGrowth.js';

export const isStriderFood=id=>id==='warped_fungus'||id===BLOCKS.WARPED_FUNGUS;
const heldItems=p=>[p?.inventory?.getActiveItem?.(),p?.inventory?.getOffhandItem?.()].filter(Boolean);
const steeringItem=p=>heldItems(p).find(i=>i.id==='warped_fungus_on_a_stick');
export function canInteractStrider(m,id){
  if(m.health<=0)return false;
  if(isStriderFood(id))return !!m.isBaby || !(m.breedingCooldown>0||m.inLove>0);
  if(id==='golden_dandelion')return !!m.isBaby&&!(m.ageLockCooldown>0);
  if(id==='lead'||id==='name_tag')return true;
  if(m.isBaby)return false;
  if(id==='saddle')return !m.isSaddled;
  if(id==='shears')return !!m.isSaddled;
  return !!m.isSaddled&&!m.rider;
}
export function interactStrider(b,m,p,inventory,id){
  if(!canInteractStrider(m,id))return false;
  const consume=()=>{if(p.gamemode!=='creative')inventory.consumeActiveItem(1);};
  if(isStriderFood(id)){
    if(m.isBaby){if(!m.ageLocked)accelerateBabyGrowth(m);}
    else{m.inLove=m.inLoveTimer=30;m.matingTimer=0;b.spawnHeartParticles(m.mesh.position);}
    consume();b.sounds?.playEat?.();return true;
  }
  if(id==='golden_dandelion'){m.ageLocked=!m.ageLocked;m.babyGrowthTimer=BABY_GROWTH_SECONDS;m.ageLockCooldown=2;consume();return true;}
  if(id==='lead'){if(m.leashHolder||m.leashAnchor)releaseHorseLead(b.mobManager,m);else{m.leashHolder=p;consume();}return true;}
  if(id==='name_tag'){const name=inventory.getActiveItem()?.customName;if(!name)return false;m.name=String(name).slice(0,64);m.persistent=true;consume();return true;}
  if(id==='saddle'){m.isSaddled=m.hasSaddle=true;m.saddleMesh.visible=true;consume();return true;}
  if(id==='shears'){m.isSaddled=m.hasSaddle=false;m.saddleMesh.visible=false;b.entities?.spawnDroppedItem(m.mesh.position.clone(),'saddle',false,1);return true;}
  return b.mountMob(m,p)!==false;
}
export function boostStrider(b,p,item){
  const m=b.mount?.mob;if(m?.type!=='strider'||!m.isSaddled||m.boostRemaining>0||item?.id!=='warped_fungus_on_a_stick')return false;
  m.boostDuration=(140+Math.floor((b.mobManager.random||Math.random)()*841))/20;m.boostRemaining=m.boostDuration;
  if(p.gamemode!=='creative'){
    item.durability=Math.max(0,(item.durability??100)-1);
    if(!item.durability){item.id='fishing_rod';item.durability=64;}
    p.inventory?.updateUI?.();
  }
  return true;
}
export function striderSpeed(m,ridden=false){
  let speed=ridden?(m.isCold?1.78:4.24):(m.isCold?.66:1.5);
  if(ridden&&m.boostRemaining>0)speed*=1+1.15*Math.sin(Math.PI*(1-m.boostRemaining/m.boostDuration));
  const effect=m.statusEffects?.get?.('speed')||m.statusEffects?.speed;if(effect)speed*=1+.2*(effect.amplifier!==undefined?effect.amplifier+1:effect.level||1);
  return speed;
}
export function steerStrider(b,m,p,dt,controls={}){
  if(p.keys?.ShiftLeft||p.keys?.ShiftRight||controls.dismount){b.dismount(p);return;}
  if(!m.isSaddled||!steeringItem(p)){m.velocity.x=m.velocity.z=0;return;}
  const look=new THREE.Vector3();p.camera?.getWorldDirection(look);look.y=0;
  if(!look.lengthSq())look.set(-Math.sin(p.yaw||0),0,-Math.cos(p.yaw||0));look.normalize();
  m.yaw=Math.atan2(look.x,look.z);const speed=striderSpeed(m,true);m.velocity.x=look.x*speed;m.velocity.z=look.z*speed;
}
export function safeStriderDismount(b,m,p){
  const from=m.mesh.position,dir=new THREE.Vector3(-Math.sin(p.yaw||0),0,-Math.cos(p.yaw||0));
  for(const distance of [1,2,3])for(const dy of [0,1,-1]){
    const target=from.clone().addScaledVector(dir,distance);target.y=Math.floor(from.y)+dy;
    if(b.mobManager.isBlockSolid(target.x,target.y-1,target.z)&&!b.mobManager.checkMobCollision({type:'player',width:.6,height:1.8},target)&&b.world.getVoxel(Math.floor(target.x),Math.floor(target.y),Math.floor(target.z))!==BLOCKS.LAVA){p.position.copy(target);return true;}
  }
  return false;
}
function voxel(manager,p,offset=0){return manager.world.getVoxel(Math.floor(p.x),Math.floor(p.y+offset),Math.floor(p.z));}
export function striderEnvironment(manager,m){
  const p=m.mesh.position;m.inLava=voxel(manager,p)===BLOCKS.LAVA||voxel(manager,p,-.06)===BLOCKS.LAVA;
  m.inWater=voxel(manager,p)===BLOCKS.WATER||voxel(manager,p,(m.isBaby?.85:1.7)*.5)===BLOCKS.WATER;
  m.isCold=!m.inLava&&!m.vehicle?.inLava;
}
function rainHits(manager,m){
  const p=m.mesh.position;
  return exposedToRain(manager.game?.weather,manager.world,{x:p.x,y:p.y+(m.isBaby?.85:1.7),z:p.z});
}
export function splashStriderWater(manager,position,radius=4){
  for(const m of manager.mobs)if(m.type==='strider'&&m.health>0&&m.mesh.position.distanceTo(position)<=radius)manager.damageMob(m,1,null,false,null,true);
}
function moveStrider(manager,m,dt){
  const p=m.mesh.position,collision=q=>manager.checkMobCollision(m,q),start=p.clone();
  const kb=m.knockback||new THREE.Vector3();
  let flowFactor=1;
  if(m.inLava&&manager.world.getLavaLevel){
    const x=Math.floor(p.x),y=Math.floor(p.y-.05),z=Math.floor(p.z),flow=new THREE.Vector3();
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const level=manager.world.getLavaLevel(x+dx,y,z+dz);if(level>0&&level<8)flow.add(new THREE.Vector3(dx*level,0,dz*level));
    }
    if(flow.dot(m.velocity)<0)flowFactor=.4;
  }
  const steps=Math.max(1,Math.ceil((Math.hypot(m.velocity.x+kb.x,m.velocity.z+kb.z)+Math.abs(m.velocity.y))*dt/.15));
  for(let i=0;i<steps;i++){
    const step=dt/steps;
    for(const axis of ['x','z']){const q=p.clone();q[axis]+=(m.velocity[axis]*flowFactor+kb[axis])*step;
      const waterAhead=voxel(manager,q)===BLOCKS.WATER;
      if(waterAhead&&!m.rider&&kb.lengthSq()<.1){m.walking=false;m.timer=0;continue;}
      if(!collision(q))p.copy(q);else{q.y=Math.floor(p.y+.05)+1;const floor=q.clone();floor.y-=.06;if(q.y-p.y<=1.05&&!collision(q)&&(collision(floor)||voxel(manager,floor)===BLOCKS.LAVA))p.copy(q);}}
    striderEnvironment(manager,m);
    const cellY=Math.floor(p.y-.06),under=voxel(manager,p,-.06),here=voxel(manager,p);
    if(here===BLOCKS.LAVA||under===BLOCKS.LAVA){
      let top=here===BLOCKS.LAVA?Math.floor(p.y):cellY;
      while(top<255&&manager.world.getVoxel(Math.floor(p.x),top+1,Math.floor(p.z))===BLOCKS.LAVA)top++;
      const level=manager.world.getLavaLevel?.(Math.floor(p.x),top,Math.floor(p.z))||0;
      const surface=top+(level===8?1:(8-level)/9);
      const q=p.clone();q.y=Math.min(surface,p.y+1.5*step);
      if(p.y>=surface-.1){q.y=surface;m.onGround=true;}else m.onGround=false;
      if(!collision(q))p.y=q.y;m.velocity.y=0;
      if(m.striderFallPeak!==undefined){const fall=m.striderFallPeak-surface;if(!level&&fall>3)manager.damageMob(m,Math.ceil(fall-3),null,false,null,true);delete m.striderFallPeak;}
    }else{
      m.velocity.y=Math.max(m.inWater?-.6:-40,m.velocity.y-(m.inWater?2:24)*step);
      const q=p.clone();q.y+=m.velocity.y*step;m.onGround=false;
      if(collision(q)){let free=p.y,solid=q.y;for(let n=0;n<12;n++){const probe=p.clone();probe.y=(free+solid)/2;if(collision(probe))solid=probe.y;else free=probe.y;}p.y=free;m.onGround=m.velocity.y<0;m.velocity.y=0;}
      else p.copy(q);
      if(!m.onGround)m.striderFallPeak=Math.max(m.striderFallPeak??start.y,p.y);
      else if(m.striderFallPeak!==undefined){const fall=m.striderFallPeak-p.y;if(fall>3)manager.damageMob(m,Math.ceil(fall-3),null,false,null,true);delete m.striderFallPeak;}
    }
  }
  m.knockback?.multiplyScalar(Math.exp(-8*dt));m.mesh.rotation.y=m.yaw;
}
export function updateStriderExposure(manager,m,dt){
  striderEnvironment(manager,m);
  if(voxel(manager,m.mesh.position)===BLOCKS.POWDER_SNOW){m.freezeClock=(m.freezeClock||0)+dt;if(m.freezeClock>=9){m.freezeClock=7;manager.damageMob(m,5,null,false,null,true);}}else m.freezeClock=Math.max(0,(m.freezeClock||0)-dt*2);
  const wet=m.inWater||rainHits(manager,m);
  m.waterDamageClock=wet?(m.waterDamageClock||0)+dt:0;
  while(m.waterDamageClock>=.5-1e-9){m.waterDamageClock-=.5;manager.damageMob(m,1,null,false,null,true);}
}
export function updateStrider(manager,m,dt,player){
  striderEnvironment(manager,m);
  updateStriderExposure(manager,m,dt);
  m.boostRemaining=Math.max(0,(m.boostRemaining||0)-dt);
  if(m.rider===player){steerStrider(manager.animalBehaviors,m,player,dt,manager.game?.controls);}
  else if(m.rider?.type==='zombified_piglin'&&(m.rider.angerTimer>0||m.rider.angerTime>0)){const delta=player.position.clone().sub(m.mesh.position);delta.y=0;delta.normalize();m.velocity.x=delta.x*striderSpeed(m,true);m.velocity.z=delta.z*striderSpeed(m,true);m.yaw=Math.atan2(delta.x,delta.z);}
  else if(m.fleeTime>0&&m.fleeFrom){m.fleeTime=Math.max(0,m.fleeTime-dt);const d=m.mesh.position.clone().sub(m.fleeFrom);d.y=0;d.normalize();m.velocity.x=d.x*striderSpeed(m)*1.6;m.velocity.z=d.z*striderSpeed(m)*1.6;m.yaw=Math.atan2(d.x,d.z);}
  else if(!(m.inLove>0)){
    let target=null;
    if(heldItems(player).some(i=>isStriderFood(i.id)||i.id==='warped_fungus_on_a_stick')&&player.position.distanceTo(m.mesh.position)<10)target=player.position;
    if(!target&&m.isBaby){let distance=16;for(const a of manager.mobs)if(a!==m&&a.type==='strider'&&!a.isBaby&&a.health>0){const d=a.mesh.position.distanceTo(m.mesh.position);if(d<distance){distance=d;target=a.mesh.position;}}}
    if(!target&&m.isCold){let nearest=8;for(let x=-6;x<=6;x++)for(let z=-6;z<=6;z++){const d=Math.hypot(x,z);if(d<nearest&&manager.world.getVoxel(Math.floor(m.mesh.position.x)+x,Math.floor(m.mesh.position.y)-1,Math.floor(m.mesh.position.z)+z)===BLOCKS.LAVA){nearest=d;target=m.mesh.position.clone().add(new THREE.Vector3(x,0,z));}}}
    if(target){const d=target.clone().sub(m.mesh.position);d.y=0;if(d.length()>1.25){d.normalize();m.velocity.x=d.x*striderSpeed(m);m.velocity.z=d.z*striderSpeed(m);m.yaw=Math.atan2(d.x,d.z);}else m.velocity.x=m.velocity.z=0;}
    else{m.timer-=dt;if(m.timer<=0){m.timer=2+(manager.random||Math.random)()*4;m.yaw+=(manager.random||Math.random)()*2-1;m.walking=(manager.random||Math.random)()>.25;}const speed=m.walking?striderSpeed(m):0;m.velocity.x=Math.sin(m.yaw)*speed;m.velocity.z=Math.cos(m.yaw)*speed;}
  }
  const oldPosition=m.mesh.position.clone();
  updateHorseLead(manager,m);moveStrider(manager,m,dt);poseStrider(m,dt);
  m.soundTimer=(m.soundTimer??10)-dt;if(m.soundTimer<=0){manager.sounds?.playStrider?.(m.fleeTime>0?'retreat':'idle');m.soundTimer=10+(manager.random||Math.random)()*20;}
  m.stepDistance=(m.stepDistance||0)+m.mesh.position.distanceTo(oldPosition);if(m.stepDistance>.8){m.stepDistance=0;manager.sounds?.playStep?.(m.inLava?'lava':'stone');}
  if(m.rider?.mesh){m.rider.mesh.position.copy(m.mesh.position).y+=1.7;m.rider.yaw=m.yaw;m.rider.mesh.rotation.y=m.yaw;m.rider.velocity.set(0,0,0);if(m.rider.type==='strider'){striderEnvironment(manager,m.rider);poseStrider(m.rider,dt);}}
}
export function serializeStrider(m){if(m.type!=='strider')return undefined;return Object.fromEntries(['isBaby','babyGrowthTimer','ageLocked','ageLockCooldown','isSaddled','breedingCooldown','inLove','name','persistent','leashAnchor'].map(k=>[k,m[k]]));}
export function restoreStrider(m,data){if(!m||m.type!=='strider'||!data)return;for(const key of Object.keys(serializeStrider(m)))if(data[key]!==undefined)m[key]=data[key];m.hasSaddle=!!m.isSaddled;m.saddleMesh.visible=!!m.isSaddled;m.mesh.scale.setScalar(m.isBaby?.5:1);}
export function attachStriderPassenger(m,rider){
  if(rider.type==='zombified_piglin'){
    rider.weapon='warped_fungus_on_a_stick';
    for(const child of rider.rightArm?.children||[])child.visible=false;
    let rod=rider.rightArm?.getObjectByName('fungus-stick');
    if(!rod){rod=new THREE.Mesh(new THREE.BoxGeometry(.035,.55,.035),new THREE.MeshLambertMaterial({color:0x84633e}));rod.name='fungus-stick';rod.position.set(0,-.3,.3);rod.rotation.x=.8;rider.rightArm?.add(rod);const fungus=new THREE.Mesh(new THREE.BoxGeometry(.16,.1,.16),new THREE.MeshLambertMaterial({color:0x249b91}));fungus.position.y=.3;rod.add(fungus);}
    rod.visible=true;
  }
  m.rider=rider;rider.vehicle=m;rider.persistent=true;rider.mesh.position.copy(m.mesh.position).y+=1.7;}
export function spawnNaturalStrider(manager,x,y,z){
  const r=manager.random||Math.random,m=manager.spawnStrider(x,y,z);
  const babyRoll=r(),piglinRoll=r();
  if(babyRoll<.1){const baby=manager.spawnStrider(x,y+1.7,z,{isBaby:true});attachStriderPassenger(m,baby);}
  else if(piglinRoll<1/30){m.isSaddled=m.hasSaddle=true;m.saddleMesh.visible=true;if(manager.game?.difficulty!=='peaceful'){const rider=manager.spawnZombifiedPiglin(x,y+1.7,z,{natural:false,isBaby:false,weapon:'warped_fungus_on_a_stick'});attachStriderPassenger(m,rider);}}
  return m;
}
export function updateStriderSpawning(manager,dt,player){
  // Inspector worlds and designed maps own their population explicitly.
  if(!manager.world.chunks||manager.world.dimension!=='nether'||manager.game?.worldType==='designed'||!player?.position)return;
  manager.striderSpawnTimer=(manager.striderSpawnTimer??20)-dt;if(manager.striderSpawnTimer>0)return;manager.striderSpawnTimer=20;
  if(manager.mobs.filter(m=>m.type==='strider'&&!m.persistent&&!m.vehicle&&m.health>0).length>=10)return;
  const r=manager.random||Math.random;
  for(let attempt=0;attempt<12;attempt++){
    const angle=r()*Math.PI*2,distance=24+r()*64,x=Math.floor(player.position.x+Math.sin(angle)*distance),z=Math.floor(player.position.z+Math.cos(angle)*distance);
    for(let y=Math.min(254,Math.floor(player.position.y)+32);y>=Math.max(0,player.position.y-48);y--){
      if(manager.world.getVoxel(x,y,z)!==BLOCKS.LAVA||manager.world.getVoxel(x,y+1,z)!==BLOCKS.AIR)continue;
      const count=2+Math.floor(r()*3);for(let i=0;i<count;i++){const gx=x+i*2;if(manager.world.getVoxel(gx,y,z)===BLOCKS.LAVA&&manager.world.getVoxel(gx,y+1,z)===BLOCKS.AIR)spawnNaturalStrider(manager,gx+.5,y+1,z+.5);}return;
    }
  }
}
