import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { canSpawnSquid, serializeSquid, restoreSquid } from './squidBehavior.js';
export function squidScenarios(type) {
  const cases=[],add=(id,label,duration,setup,check)=>cases.push({id,label,duration,setup,check});
  const water=s=>{s.world.fluid=BLOCKS.WATER;s.mob.mesh.position.y=1.2;s.player.gamemode='survival';s.player.position.set(0,1.2,6);};
  const use=(s,id)=>{s.inventory.active={id,count:8,customName:id==='name_tag'?'Aquarium Squid':undefined};return s.manager.animalBehaviors.interact(s.mob,s.player,s.inventory);};
  add('squid_model','Mantle, two eyes and eight tentacles',.1,water,s=>s.mob.type===type&&s.mob.tentacles.length===8&&s.mob.mantle.material.length===6&&s.mob.maxHealth===10);
  add('movement','Three-dimensional pulsing swimming',2,s=>{water(s);s.startPosition=s.mob.mesh.position.clone();s.mob.targetPos=s.mob.mesh.position.clone().add(new THREE.Vector3(2,.5,2));s.mob.timer=10;},s=>s.mob.mesh.position.distanceTo(s.startPosition)>.3&&s.mob.mesh.position.y>s.startPosition.y);
  add('squid_passive','Player and held food do not provoke it',2,s=>{water(s);s.player.position.set(0,1.2,1);s.inventory.active={id:'cod',count:8};s.initialHealth=s.player.health;},s=>s.player.health===s.initialHealth&&!s.mob.target);
  add('damage','Underwater hit releases ink and flees',.5,s=>{water(s);s.player.position.set(0,1.2,1);s.hit(1);s.startPosition=s.mob.mesh.position.clone();},s=>s.mob.inkBursts===1&&s.mob.fleeTime>0&&s.mob.mesh.position.z<s.startPosition.z);
  add('squid_spectator','Spectator pauses swimming without suppressing ink',1,s=>{water(s);s.player.gamemode='spectator';s.hit(1);s.startPosition=s.mob.mesh.position.clone();},s=>s.mob.inkBursts===1&&s.mob.mesh.position.distanceTo(s.startPosition)<.01);
  add('squid_dry','Beached squid stays still and suffocates after 15 seconds',15.5,s=>{s.world.fluid=BLOCKS.AIR;s.mob.mesh.position.set(0,0,0);s.initialXZ=[0,0];},s=>s.mob.health<=0&&Math.abs(s.mob.mesh.position.x)<.01&&Math.abs(s.mob.mesh.position.z)<.01);
  add('squid_no_breed','Cannot breed, saddle or be captured in a bucket',.2,s=>{s.rejected=['cod','wheat','saddle','water_bucket'].every(id=>!use(s,id));},s=>s.rejected&&!s.mob.inLove&&!s.mob.isSaddled);
  add('squid_baby','Baby growth and golden dandelion lock',.5,s=>{water(s);s.mob.isBaby=true;s.mob.babyGrowthTimer=.1;s.accepted=use(s,'golden_dandelion');},s=>s.accepted&&s.mob.isBaby&&s.mob.ageLocked&&s.mob.babyGrowthTimer===1200);
  add('squid_age','Baby becomes adult after its growth timer',.5,s=>{water(s);s.mob.isBaby=true;s.mob.babyGrowthTimer=.1;},s=>!s.mob.isBaby&&s.mob.mesh.scale.x===1);
  add('squid_lead','Lead and name tag work',.5,s=>{water(s);s.named=use(s,'name_tag');s.leashed=use(s,'lead');s.player.position.set(0,1.2,3);},s=>s.named&&s.leashed&&s.mob.name==='Aquarium Squid'&&s.mob.leashHolder===s.player&&!!s.mob.leashLine);
  add('squid_save','Age and dark countdown survive serialization',.1,s=>{s.mob.isBaby=true;s.mob.babyGrowthTimer=321;s.mob.ageLocked=true;s.mob.darkSeconds=4;s.record=serializeSquid(s.mob);const clone=s.manager.spawnMob(type,3,1,0);restoreSquid(clone,s.record);s.clone=clone;},s=>s.clone.isBaby&&s.clone.ageLocked&&s.clone.babyGrowthTimer===321&&s.clone.darkSeconds>3);
  add('squid_spawn','Wiki spawning restrictions',.1,s=>{s.world.dimension='overworld';s.world.getBiome=()=> 'ocean';s.world.getVoxel=(x,y,z)=>y>=0&&y<64?BLOCKS.WATER:BLOCKS.AIR;s.spawnValid=canSpawnSquid(s.manager,type,0,type==='squid'?60:20,0,0);s.spawnInvalid=canSpawnSquid(s.manager,type,0,type==='squid'?49:30,0,type==='squid'?0:1);},s=>s.spawnValid&&!s.spawnInvalid);
  if(type==='glow_squid') {
    add('squid_dark','Damage dims glow for five seconds',4,s=>{water(s);s.hit(1);},s=>s.mob.darkSeconds>.5&&s.mob.squidMaterials.every(m=>m.emissiveIntensity===0));
    add('squid_relight','Glow returns and crystalline particles continue',5.5,s=>{water(s);s.hit(1);s.player.gamemode='spectator';},s=>s.mob.darkSeconds===0&&s.mob.squidMaterials.every(m=>m.emissiveIntensity===1)&&s.mob.glowParticles>0&&!s.mob.mesh.children.some(o=>o.isLight));
  }
  add('squid_guardian','Guardian hunts squid',4,s=>{water(s);s.predator=s.manager.spawnGuardian(0,1.2,4);s.player.gamemode='spectator';},s=>s.mob.health<10);
  add('squid_axolotl','Axolotl hunts squid',3,s=>{water(s);s.predator=s.manager.spawnAxolotl(0,1.2,1);s.player.gamemode='spectator';},s=>s.mob.health<10);
  add('death','Correct ink and player-credit XP',1.2,s=>{water(s);s.hit(100);},s=>s.entities.drops.some(d=>d.id===(type==='glow_squid'?'glow_ink_sac':'ink_sac')&&d.count>=1&&d.count<=3)&&s.entities.xp>=1&&s.entities.xp<=3&&!s.manager.mobs.includes(s.mob));
  return cases;
}
