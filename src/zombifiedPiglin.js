import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
import { canSee } from './piglin.js';
import { steerGround } from './netherMobAI.js';
import { wanderMob } from './mobMotion.js';
import { syncZombifiedWeapon } from './zombifiedPiglinModel.js';
export const isZombifiedPiglin = m => ['zombified_piglin','zombie_pigman'].includes(typeof m==='string'?m:m?.type);
const position = a => a?.mesh?.position || a?.position;
const random = manager => manager.random || Math.random;
const level = (item,id) => item?.enchantments?.find(e=>e.id===id)?.level || 0;
export function setZombifiedBaby(m,baby) {
  m.isBaby=!!baby;m.mesh.scale.setScalar(baby?.5:1);m.width=baby?.98:.6;m.height=baby?1.96:1.95;
  // Babies keep their oversized heads and never grow into adults.
  m.head.scale.setScalar(baby?1.35:1);m.hurtScaleBase=null;
}
export function initializeZombified(manager,m,options={}) {
  const r=random(manager),difficulty=manager.game?.difficulty || 'normal';
  m.applyStatusEffect=(id,duration=0,amplifier=1,source=null)=>applyZombifiedEffect(manager,m,id,duration,amplifier,source);m.hasStatusEffect=id=>(m.statusEffects?.[id]||0)>0;
  m.undead=true;m.fireImmune=true;m.armor=2;m.followRange=33+r()*22;m.angerTimer=0;m.equipment={};
  m.weapon=options.weapon!==undefined?options.weapon:(r()<.05?'golden_spear':'golden_sword');
  m.canPickUpLoot=options.canPickUpLoot??(difficulty!=='easy'&&difficulty!=='peaceful'&&r()<.55*(manager.game?.regionalDifficulty??1));
  m.canBreakDoors=difficulty==='hard'&&r()<.1;
  m.isLeader=options.isLeader??(difficulty==='hard'&&r()<.05*(manager.game?.regionalDifficulty??1));
  m.reinforcementChance=m.isLeader?.5+r()*.25+r()*.1:0;
  if(m.isLeader)m.health=m.maxHealth=40+r()*60;
  setZombifiedBaby(m,options.isBaby??r()<.05);syncZombifiedWeapon(m);
  if(options.natural!==false&&m.isBaby){
    const p=m.mesh.position;
    const nearby=manager.mobs.find(other=>other.type==='chicken'&&!other.rider&&Math.abs(other.mesh.position.x-p.x)<2.5&&Math.abs(other.mesh.position.z-p.z)<2.5&&Math.abs(other.mesh.position.y-p.y)<1.5);
    if(nearby&&r()<.05)mountZombified(m,nearby);else if(r()<.05)mountZombified(m,manager.spawnChicken(p.x,p.y,p.z));
  }
}
export function mountZombified(m,mount){m.jockeyMount=mount;mount.rider=m;mount.isJockey=true;m.persistent=true;}
export function clearZombifiedAnger(m){m.angerTimer=0;m.target=null;m.aggroToPlayer=false;m.spearPhase=null;m.velocity.x=m.velocity.z=0;}
function validTarget(manager,target){return position(target)&&target.health>0&&!target.isDead&&(target!==manager.game?.player||!['creative','spectator'].includes(target.gamemode));}
function angerOne(manager,m,target){
  if(!isZombifiedPiglin(m)||m.health<=0||m.target===target&&m.angerTimer>0)return;
  m.target=target;m.aggroToPlayer=target===manager.game?.player;m.angerTimer=20+random(manager)()*35;m.alarmTimer=0;
  manager.sounds?.playZombie?.();
}
export function alertZombified(manager,source,target){
  if(!validTarget(manager,target)||['ghast','goat'].includes(target.type))return;
  const p=source.mesh.position,range=source.followRange??35;
  for(const peer of manager.mobs){const q=peer.mesh.position;if(isZombifiedPiglin(peer)&&Math.abs(q.x-p.x)<=range&&Math.abs(q.y-p.y)<=10&&Math.abs(q.z-p.z)<=range)angerOne(manager,peer,target);}
}
export function hurtZombified(manager,m,attacker){
  if(!attacker||['ghast','goat'].includes(attacker.type))return;
  const credit=attacker===manager.game?.player || attacker.type==='wolf'&&attacker.isTamed;
  if(credit){m.playerDamaged=true;m.zpCreditTime=5;m.zpLooting=level(attacker.inventory?.getActiveItem?.(),'looting');}
  // A lethal first hit has no surviving piglin to sound an alarm.
  if(m.health<=0)return;
  alertZombified(manager,m,attacker);
  if(m.isLeader&&manager.game?.difficulty==='hard'&&m.target&&random(manager)()<m.reinforcementChance){
    const r=random(manager),p=m.mesh.position;
    for(let i=0;i<16;i++){
      const angle=r()*Math.PI*2,d=7+r()*12,x=p.x+Math.sin(angle)*d,z=p.z+Math.cos(angle)*d,y=manager.world.getHeightAt?.(x,z)??p.y;
      const candidate=new THREE.Vector3(x,y,z);
      if(!manager.isBlockSolid(x,y-1,z)||manager.checkMobCollision(m,candidate)||manager.mobs.some(o=>o!==m&&o.mesh.position.distanceTo(candidate)<1))continue;
      const peer=manager.spawnZombifiedPiglin(x,y,z,{natural:false,isLeader:false});angerOne(manager,peer,attacker);m.reinforcementChance=Math.max(0,m.reinforcementChance-.05);break;
    }
  }
}
export function zombifiedDamage(m,difficulty='normal',target=null){
  const weapon=m.equipment?.weapon?.id??m.weapon;
  const base=weapon?.includes('spear')?10:weapon?.includes('axe')?11:weapon?.includes('sword')?4+(ITEMS[weapon]?.attack??4):5;
  const item=m.equipment?.weapon,sharpness=level(item,'sharpness'),smite=target?.undead||['zombie','skeleton','zoglin','wither_skeleton','zombie_villager','drowned'].includes(target?.type)?level(item,'smite'):0;
  const n=Math.max(0,base+(sharpness?.5+sharpness*.5:0)+smite*2.5-(m.hasWeakness?4:0));
  return difficulty==='peaceful'?0:difficulty==='easy'?n/2+1:difficulty==='hard'?n*1.5:n;
}
function pickup(manager,m){
  if(!m.canPickUpLoot||manager.world.mobGriefing===false)return;
  const drops=manager.entities?.droppedItems||[];
  for(const drop of drops){
    if(drop.count<=0||(drop.age??0)<(drop.pickupDelay??0)||!drop.group?.position||drop.group.position.distanceTo(m.mesh.position)>1.1)continue;
    const id=drop.itemType,meta=ITEMS[id],slot=meta?.armorSlot||((/_(sword|axe|spear)$/.test(String(id)))?'weapon':id==='shield'?'offhand':null);
    if(!slot)continue;
    const old=m.equipment[slot]||(slot==='weapon'&&m.weapon?{id:m.weapon}:null);
    const score=item=>slot==='weapon'?(ITEMS[item?.id]?.attack||0):(ITEMS[item?.id]?.armor||0);
    if(old&&(score({id})<score(old)||score({id})===score(old)&&!(drop.enchantments?.length&&!old.enchantments?.length)&&!(drop.durability>(old.durability??Infinity))))continue;
    if(old)manager.entities.spawnDroppedItem(m.mesh.position.clone(),old.id,false,1,{pickupDelay:.5,enchantments:old.enchantments,durability:old.durability});
    m.equipment[slot]={id,count:1,pickedUp:true,enchantments:drop.enchantments,durability:drop.durability};
    if(slot==='weapon')m.weapon=id;m.persistent=true;
    if(--drop.count===0){drop.group.removeFromParent();manager.entities.itemVisuals?.release(drop.group);drops.splice(drops.indexOf(drop),1);}break;
  }
}
export function syncZombifiedEquipment(m){
  syncZombifiedWeapon(m);m.armor=2+Object.values(m.equipment||{}).reduce((n,item)=>n+(ITEMS[item.id]?.armor||0),0);
  const visuals=m.equipmentVisuals||={};
  for(const [slot,item] of Object.entries(m.equipment||{})){
    if(slot==='weapon'||visuals[slot]?.id===item.id)continue;
    if(visuals[slot])for(const o of visuals[slot].meshes){o.removeFromParent();o.geometry.dispose();o.material.dispose();}
    const mat=new THREE.MeshLambertMaterial({color:item.id.startsWith('golden_')?0xe7b82f:item.id.startsWith('diamond_')?0x58d9db:0xbac1c9}),meshes=[];
    const box=(parent,size,y)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);o.position.y=y;parent.add(o);meshes.push(o);};
    if(slot==='offhand')box(m.leftArm,[.35,.5,.07],-.63);
    if(slot==='head')box(m.head,[.65,.2,.53],.19);
    if(slot==='chest')box(m.mesh,[.54,.56,.3],1.18);
    if(slot==='legs')for(const leg of [m.leftLeg,m.rightLeg])box(leg,[.27,.42,.27],-.21);
    if(slot==='feet')for(const leg of [m.leftLeg,m.rightLeg])box(leg,[.28,.22,.29],-.64);
    visuals[slot]={id:item.id,meshes};
  }
}
function attack(manager,m,target,damage){
  m.attackAnimation=.3;
  if(target===manager.game?.player)target.takeDamage?.(damage,m.mesh.position,'zombified_piglin');
  else manager.damageMob(target,damage,m.mesh.position,false,m);
  if(target.health<=0&&target.type==='villager'&&manager.game?.difficulty!=='easy'&&(manager.game?.difficulty==='hard'||random(manager)()<.5)){
    const p=position(target);manager.spawnMob('zombie_villager',p.x,p.y,p.z);target.noLoot=true;
  }
}
export function updateZombified(manager,m,dt){
  if(m.health<=0||m.frozen)return;
  if(manager.game?.difficulty==='peaceful'){m.noLoot=true;m.health=0;clearZombifiedAnger(m);return;}
  if(m.zpCreditTime!==undefined){m.zpCreditTime=Math.max(0,m.zpCreditTime-dt);if(m.zpCreditTime===0)m.playerDamaged=false;}
  pickup(manager,m);syncZombifiedEquipment(m);
  m.attackCooldown=Math.max(0,(m.attackCooldown||0)-dt);m.attackAnimation=Math.max(0,(m.attackAnimation||0)-dt);m.nauseaTime=Math.max(0,(m.nauseaTime||0)-dt);
  for(const id of Object.keys(m.statusEffects||{}))m.statusEffects[id]=Math.max(0,m.statusEffects[id]-dt);
  if(m.statusEffects?.weakness!==undefined)m.hasWeakness=m.statusEffects.weakness>0;
  const target=m.target,p=position(target),pos=m.mesh.position;
  if(m.angerTimer>0){
    if(!validTarget(manager,target)){clearZombifiedAnger(m);return;}
    const distance=p.distanceTo(pos),visible=distance<=(m.followRange??35)&&canSee(manager,pos.clone().add(new THREE.Vector3(0,m.isBaby?.7:1.6,0)),p.clone().add(new THREE.Vector3(0,target.height?target.height*.8:1,0)));
    // Freeze forgiveness while the target remains visible and in follow range.
    if(!visible)m.angerTimer=Math.max(0,m.angerTimer-dt);
    if(m.angerTimer===0){clearZombifiedAnger(m);return;}
    m.alarmTimer=(m.alarmTimer||0)-dt;
    if(visible&&m.alarmTimer<=0){alertZombified(manager,m,target);m.alarmTimer=4+random(manager)()*2;}
    if(breakZombifiedDoor(manager,m,p,dt))return;
    const speed=(m.isBaby?5.07:3.38)*(m.hasStatusEffect?.('slowness')?.85:1);
    if(m.weapon?.includes('spear')){
      m.spearTime=(m.spearTime||0)+dt;
      if(!m.spearPhase)m.spearPhase='charge';
      if(m.spearPhase==='charge'){
        steerGround(manager,m,p,dt,speed,1);if(distance<2.2&&visible&&m.attackCooldown===0){attack(manager,m,target,zombifiedDamage(m,manager.game?.difficulty,target));m.attackCooldown=1;}
        if(distance<1.4||m.spearTime>=3){m.spearPhase='retreat';m.spearTime=0;}
      }else{
        const away=pos.clone().sub(p).setY(0).normalize();steerGround(manager,m,pos.clone().addScaledVector(away,4),dt,speed);
        if(distance>5||m.spearTime>2){m.spearPhase='charge';m.spearTime=0;}
      }
    }else{
      steerGround(manager,m,p,dt,speed,1.2);
      if(distance<1.8&&visible&&m.attackCooldown===0){attack(manager,m,target,zombifiedDamage(m,manager.game?.difficulty));m.attackCooldown=1;}
    }
    m.state='angry';

  }else{m.state='idle';wanderMob(manager,m,dt,m.isBaby?3.42:2.28);}
  m.head.rotation.z=m.nauseaTime>0?Math.sin(m.nauseaTime*5)*.08:0;
  m.rightArm.rotation.x=-1.2-Math.sin(m.attackAnimation/.3*Math.PI)*.4;
  if(m.weaponMesh)m.weaponMesh.rotation.x=m.weapon?.includes('spear')?-.3:1.2;
  m.leftArm.rotation.x=-1.2+Math.sin(m.walkCycle||0)*.1;
  if(m.jockeyMount?.health>0){m.jockeyMount.velocity.x=m.velocity.x;m.jockeyMount.velocity.z=m.velocity.z;m.jockeyMount.yaw=m.yaw;}
}
export function dropZombifiedLoot(manager,m,pos){
  if(m.noLoot)return;
  const r=random(manager),looting=m.zpLooting||0,credit=!!m.playerDamaged;
  for(const id of ['rotten_flesh','gold_nugget']){const count=Math.floor(r()*2)+Math.round(r()*looting);if(count)manager.entities?.spawnDroppedItem(pos,id,false,count);}
  if(credit&&r()<.025+looting*.01)manager.entities?.spawnDroppedItem(pos,'gold_ingot',false,1);
  let xp=m.isBaby?12:5;
  const weapon=m.equipment?.weapon||{id:m.weapon};
  for(const item of [weapon,...Object.entries(m.equipment||{}).filter(([slot])=>slot!=='weapon').map(([,v])=>v)]){
    if(!item.id)continue;const dropped=item.pickedUp||(credit&&r()<.085+looting*.01);
    if(dropped){manager.entities?.spawnDroppedItem(pos,item.id,false,1,{enchantments:item.enchantments,durability:item.durability});if(item===weapon&&m.weaponMesh)m.weaponMesh.visible=false;}
    else if(!item.pickedUp)xp+=1+Math.floor(r()*3);
  }
  if(credit)manager.entities?.spawnXpOrbs(pos,xp);
}
export function serializeZombified(m,manager){if(!isZombifiedPiglin(m))return;return {...(manager?{targetIsPlayer:m.target===manager.game?.player,targetMobIndex:manager.mobs.indexOf(m.target),jockeyMountIndex:manager.mobs.indexOf(m.jockeyMount)}:{}),...Object.fromEntries(['isBaby','weapon','equipment','persistent','canPickUpLoot','isLeader','maxHealth','followRange','angerTimer','canBreakDoors','reinforcementChance','zpLooting','zpCreditTime','playerDamaged'].map(k=>[k,m[k]]))};}
export function restoreZombified(m,data,manager){if(!data||!isZombifiedPiglin(m))return;Object.assign(m,data);setZombifiedBaby(m,m.isBaby);syncZombifiedEquipment(m);if(m.angerTimer>0&&data.targetIsPlayer!==false)m.target=manager.game?.player;}

export function applyZombifiedEffect(manager,m,id,duration=0,amplifier=1,source=null){
 if(['poison','regeneration'].includes(id))return false;
 if(['instant_health','healing','instant_damage','harming'].includes(id)){
  if(['instant_health','healing'].includes(id))manager.damageMob(m,6*2**Math.max(0,amplifier-1),null,false,source,true);
  else m.health=Math.min(m.maxHealth,m.health+4*2**Math.max(0,amplifier-1));
  return true;
 }
 (m.statusEffects||={})[id]=Math.max(m.statusEffects?.[id]||0,duration);if(id==='weakness')m.hasWeakness=true;return true;
}
export function breakZombifiedDoor(manager,m,target,dt){
 if(!m.canBreakDoors||manager.game?.difficulty!=='hard'||manager.world.mobGriefing===false)return false;
 const pos=m.mesh.position,dir=target.clone().sub(pos).setY(0).normalize(),x=Math.floor(pos.x+dir.x*.8),y=Math.floor(pos.y),z=Math.floor(pos.z+dir.z*.8),id=manager.world.getVoxel(x,y,z),def=BLOCK_DEFS[id];
 if(!def?.door||def.isIron||!def.solid){m.doorBreakTime=0;return false;}
 m.yaw=Math.atan2(dir.x,dir.z);m.velocity.x=m.velocity.z=0;m.state='breaking door';m.doorBreakTime=(m.doorBreakTime||0)+dt;
 if(m.doorBreakTime>=12){manager.world.setVoxel(x,y,z,BLOCKS.AIR);if(BLOCK_DEFS[manager.world.getVoxel(x,y+1,z)]?.door)manager.world.setVoxel(x,y+1,z,BLOCKS.AIR);manager.entities?.spawnDroppedItem(pos.clone(),def.dropItem||'oak_door',false,1);m.doorBreakTime=0;}
 return true;
}
export function convertLightningPigs(manager,strike){
 const converted=[];if(manager.game?.difficulty==='peaceful')return converted;
 for(const pig of [...manager.mobs]){const p=pig.mesh.position;if(pig.type!=='pig'||pig.health<=0||Math.abs(p.x-strike.x)>4||Math.abs(p.z-strike.z)>4||p.y<strike.y-8||p.y>strike.y+4)continue;
  const m=manager.spawnZombifiedPiglin(p.x,p.y,p.z,{natural:false,isBaby:!!pig.isBaby});m.name=pig.name;m.persistent=!!pig.persistent;m.mesh.rotation.copy(pig.mesh.rotation);m.yaw=pig.yaw;manager.removeDebugLabel?.(pig);pig.mesh.removeFromParent();manager.mobs.splice(manager.mobs.indexOf(pig),1);converted.push(m);
 }return converted;
}

export function restoreZombifiedLinks(m,data,mobs){if(!data||!isZombifiedPiglin(m))return;if(data.targetMobIndex>=0&&mobs[data.targetMobIndex]){m.target=mobs[data.targetMobIndex];m.aggroToPlayer=false;}if(data.jockeyMountIndex>=0&&mobs[data.jockeyMountIndex]){const mount=mobs[data.jockeyMountIndex];mountZombified(m,mount);if(mount.type==='strider'){mount.isSaddled=true;if(mount.saddleMesh)mount.saddleMesh.visible=true;}}}
