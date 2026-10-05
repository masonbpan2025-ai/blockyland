import { releaseHorseLead } from './horseLead.js';
import { BLOCKS } from './blocks.js';
import { createHorseModel } from './horseModel.js';
import { isPackEquine, syncPackEquineAppearance } from './packEquineModel.js';
import { isChestItem, chestSlots, updatePackEquine } from './packEquine.js';
export const isEquine=m=>['horse','donkey','mule'].includes(typeof m==='string'?m:m.type);
export const HORSE_FOODS={sugar:[1,30,3],wheat:[2,20,3],apple:[3,60,3],carrot:[3,60,3],golden_carrot:[4,60,5],golden_apple:[10,240,10],enchanted_golden_apple:[10,240,10],hay_bale:[20,180,0]};
export const HORSE_ARMOR={leather_horse_armor:3,iron_horse_armor:5,golden_horse_armor:7,diamond_horse_armor:11};
export const goldenFood=id=>['golden_carrot','golden_apple','enchanted_golden_apple'].includes(id);
export const horseFood=id=>HORSE_FOODS[id!==undefined&&id===BLOCKS.HAY_BALE?'hay_bale':id];
export function canFeedHorse(m,id){const f=horseFood(id);return !!f&&(m.health<m.maxHealth||(m.isBaby&&!m.ageLocked)||(!m.isTamed&&(m.temper||0)<100&&f[2]>0)||(m.type!=='mule'&&!m.isBaby&&m.isTamed&&goldenFood(id)&&m.health===m.maxHealth&&!(m.breedingCooldown>0)&&!(m.inLove>0)));}
export function canInteractHorse(m,id){
 if(m.health<=0)return false;
 if(isPackEquine(m)&&id===`${m.type}_spawn_egg`)return true;
 if(id==='golden_dandelion')return !!m.isBaby&&!(m.ageLockCooldown>0);
 if(id==='lead')return true;if(id==='name_tag')return true;
 if(horseFood(id))return canFeedHorse(m,id);if(m.isBaby)return false;if(!id)return true;
 if(isPackEquine(m)&&id==='saddle'&&!m.isTamed)return true;
 return !!(m.isTamed&&((id==='shears'&&(m.horseArmor||m.isSaddled))||(id==='saddle'&&!m.isSaddled)||(m.type==='horse'&&HORSE_ARMOR[id]&&!m.horseArmor)||(isPackEquine(m)&&isChestItem(id)&&!m.hasChest)));
}
export function interactHorse(b,m,player,inventory,id){
 if(m.health<=0 || !canInteractHorse(m,id))return false;
 if(isPackEquine(m)&&id===`${m.type}_spawn_egg`){const p=m.mesh.position;const baby=b.mobManager.spawnMob(m.type,p.x+1,p.y,p.z);baby.isBaby=true;baby.babyGrowthTimer=1200;syncPackEquineAppearance(baby);if(player.gamemode!=='creative')inventory.consumeActiveItem();return true;}
 if(isPackEquine(m)&&id==='saddle'&&!m.isTamed){m.rearTime=1;b.sounds?.playDonkey?.('angry',m.isBaby);return true;}
 if(id==='golden_dandelion'){m.ageLocked=!m.ageLocked;m.babyGrowthTimer=1200;m.ageLockCooldown=2;if(player.gamemode!=='creative')inventory.consumeActiveItem(1);return true;}
 if(id==='lead'){if(m.leashHolder||m.leashAnchor){releaseHorseLead(b.mobManager,m);return true;}m.leashHolder=player;if(player.gamemode!=='creative')inventory.consumeActiveItem(1);return true;}
 if(id==='name_tag'){const item=inventory.getActiveItem();const name=item?.customName || item?.name;if(!name||name==='Name Tag')return false;m.name=String(name).slice(0,64);if(player.gamemode!=='creative')inventory.consumeActiveItem(1);return true;}
 if(horseFood(id)){
  const wasFull=m.health===m.maxHealth;
  const [heal,growth,temper]=horseFood(id);m.health=Math.min(m.maxHealth,m.health+heal);if(!m.isTamed)m.temper=Math.min(100,(m.temper||0)+temper);
  if(m.isBaby&&!m.ageLocked)m.babyGrowthTimer=Math.max(0,(m.babyGrowthTimer??1200)-growth);
  else if(m.type!=='mule'&&!m.isBaby&&m.isTamed&&goldenFood(id)&&(!isPackEquine(m)||wasFull)&&!(m.breedingCooldown>0)&&!(m.inLove>0)){m.inLove=m.inLoveTimer=30;m.matingTimer=0;b.spawnHeartParticles(m.mesh.position);}
  b.sounds?.playEat?.();
 }else if(id==='shears'){
  const removed=m.horseArmor||'saddle';if(m.horseArmor){m.horseArmor=null;m.armor=0;m.armorMesh.visible=false;}else{m.isSaddled=false;m.saddleMesh.visible=false;}
  b.entities?.spawnDroppedItem(m.mesh.position.clone(),removed,false,1);return true;
 }else if(id==='saddle'){m.isSaddled=true;m.saddleMesh.visible=true;}
 else if(HORSE_ARMOR[id]){m.horseArmor=id;m.armor=HORSE_ARMOR[id];m.armorMesh.visible=true;m.armorMesh.material.color.setHex({leather_horse_armor:0x8b5737,iron_horse_armor:0xc3ccd0,golden_horse_armor:0xecc34f,diamond_horse_armor:0x59d7db}[id]);}
 else if(isChestItem(id)){m.hasChest=true;chestSlots(m);if(m.chestMesh)m.chestMesh.visible=true;b.sounds?.playDonkey?.('chest',m.isBaby);}
 else{if(m.isTamed&&player.isSneaking&&b.mobManager.game?.ui?.openHorseInventory){b.mobManager.game.ui.openHorseInventory(m);return true;}if(b.mountMob(m,player)===false)return false;m.tameTimer=3;return true;}
 if(player.gamemode!=='creative')inventory.consumeActiveItem(1);return true;
}
export function randomHorseStats(r=Math.random){return {maxHealth:15+Math.floor(r()*8)+Math.floor(r()*9),movementSpeed:.1125+(r()+r()+r())*.075,jumpStrength:.4+(r()+r()+r())*.2,temper:0};}
export function inheritStat(a,b,min,max,r=Math.random){let v=(a+b)/2+(Math.abs(a-b)+(max-min)*.3)*((r()+r()+r())/3-.5);if(v>max)v=2*max-v;if(v<min)v=2*min-v;return v;}
export function inheritHorse(baby,a,b,manager){
 const r=manager.random||Math.random;baby.maxHealth=inheritStat(a.maxHealth,b.maxHealth,15,30,r);baby.health=baby.maxHealth;baby.movementSpeed=inheritStat(a.movementSpeed??.175,b.movementSpeed??.175,.1125,.3375,r);baby.jumpStrength=inheritStat(a.jumpStrength??.5,b.jumpStrength??.5,.4,1,r);
 if(baby.type==='horse'){
  const c=Math.floor(r()*9),m=Math.floor(r()*5);baby.coat=c<4?a.coat:c<8?b.coat:Math.floor(r()*7);baby.marking=m<2?a.marking:m<4?b.marking:Math.floor(r()*5);
  const position=baby.mesh.position.clone(),materials=new Set();baby.mesh.removeFromParent();baby.mesh.traverse(o=>{o.geometry?.dispose();if(o.material)materials.add(o.material);});materials.forEach(m=>m.dispose());
  Object.assign(baby,createHorseModel(baby.coat,baby.marking,manager.textures));baby.mesh.position.copy(position);manager.scene.add(baby.mesh);
 }
}
// Fit for the current wiki's jump endpoints, translated to this engine's gravity.
export function horseJumpHeight(s){return 4.5816666667*s*s+1.5301666667*s-.1921333333;}
export function updateHorse(m,dt,r=Math.random,sounds=null,player=null,manager=null){
 if(isPackEquine(m))updatePackEquine(m,dt,manager);
 if(m.health<=0)return;
 if(m.headArmorMesh)m.headArmorMesh.visible=!!m.horseArmor;if(m.bridleMesh)m.bridleMesh.visible=!m.isBaby&&!!m.isSaddled;
 m.neighTimer=(m.neighTimer??20)-dt;if(m.neighTimer<=0){if(isPackEquine(m))sounds?.playDonkey?.('ambient',m.isBaby);else sounds?.playHorse?.();m.neighTimer=20+r()*30;}
 m.rearTime=Math.max(0,(m.rearTime||0)-dt);
 if(!m.rider&&!m.inLove&&Math.hypot(m.velocity.x,m.velocity.z)<.1&&r()<dt/60)m.rearTime=1;
 if(isEquine(m)){m.mesh.rotation.x=-Math.sin(m.rearTime*Math.PI)*.45;if(m.rearTime>0)m.grazeTime=0;}
 if(m.health<m.maxHealth&&r()<1-Math.pow(899/900,dt*20))m.health=Math.min(m.maxHealth,m.health+1);
 m.horseClock=(m.horseClock||0)+dt;if(m.tail)m.tail.rotation.z=Math.sin(m.horseClock*2)*.12;
 m.grazeTime=Math.max(0,(m.grazeTime||0)-dt);if(!m.rider&&!m.inLove&&Math.hypot(m.velocity.x,m.velocity.z)<.1&&r()<dt/30)m.grazeTime=3;
 if(m.head&&isEquine(m))m.head.rotation.x=m.grazeTime>0?.9*Math.sin(Math.min(1,m.grazeTime)*Math.PI/2):0;
 if(isPackEquine(m)&&player?.position&&!m.rider&&!m.inLove){const p=player.position,from=m.mesh.position;const desired=p.distanceTo(from)<6?Math.atan2(p.x-from.x,p.z-from.z)-(m.yaw||0):0;const turn=Math.atan2(Math.sin(desired),Math.cos(desired));m.head.rotation.y+=(Math.max(-.6,Math.min(.6,turn))-m.head.rotation.y)*Math.min(1,dt*4);}
}

export function serializeHorse(m){
 if(!isEquine(m))return undefined;
 return Object.fromEntries(['coat','marking','maxHealth','movementSpeed','jumpStrength','temper','isTamed','isSaddled','horseArmor','isBaby','babyGrowthTimer','ageLocked','ageLockCooldown','breedingCooldown','hasChest','chestInventory','name','leashAnchor'].map(k=>[k,m[k]]));
}
export function restoreHorse(m,data,manager){
 if(!data||!isEquine(m))return;
 const oldHealth=m.health;for(const key of Object.keys(serializeHorse(m)))if(data[key]!==undefined)m[key]=data[key];
 if(m.type==='horse'){
  m.coat=Math.max(0,Math.min(6,m.coat|0));m.marking=Math.max(0,Math.min(4,m.marking|0));
  const pos=m.mesh.position.clone();m.mesh.removeFromParent();const mats=new Set();m.mesh.traverse(o=>{o.geometry?.dispose();if(o.material)mats.add(o.material);});mats.forEach(m=>m.dispose());
  Object.assign(m,createHorseModel(m.coat,m.marking,manager.textures));m.mesh.position.copy(pos);manager.scene.add(m.mesh);
 }
 m.health=Math.min(oldHealth,m.maxHealth);m.mesh.scale.setScalar(m.isBaby?.7:1);m.saddleMesh.visible=!!m.isSaddled;
 if(m.armorMesh){m.armorMesh.visible=!!HORSE_ARMOR[m.horseArmor];m.armor=HORSE_ARMOR[m.horseArmor]||0;m.armorMesh.material.color.setHex({leather_horse_armor:0x8b5737,iron_horse_armor:0xc3ccd0,golden_horse_armor:0xecc34f,diamond_horse_armor:0x59d7db}[m.horseArmor]||0xc3ccd0);}
 if(m.chestMesh)m.chestMesh.visible=!!m.hasChest;
 if(isPackEquine(m)){m.horseArmor=null;m.armor=0;chestSlots(m);syncPackEquineAppearance(m);}
}
