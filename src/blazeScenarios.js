import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { shootBlazeFireball, useSnowball } from './netherCombat.js';
import { useBarterPotion } from './barterItems.js';

export function blazeScenarios(){
  const cases=[];
  const add=(id,label,duration,setup,check,update)=>cases.push({id,label,duration,setup,check,update});
  const combat=s=>{s.player.gamemode='survival';s.player.position.set(0,0,8);};
  const wall=(s,id)=>{for(let x=-3;x<=3;x++)for(let y=0;y<7;y++)s.world.setVoxel(x,y,3,id);};
  add('appearance','Model: head, face, 12 textured rods, smoke',2,()=>{},s=>s.mob.head.geometry.parameters.width===.5 && s.mob.tiers.flatMap(t=>t.children).length===12 && s.mob.tiers.every(t=>t.children.every(r=>r.material.map)) && s.mob.smoke.children.every(p=>p.isSprite));
  add('movement','Idle orbiting rods and slow falling',3,s=>{s.mob.mesh.position.y=4;s.initialRod=s.mob.tiers[0].rotation.y;},s=>s.mob.mesh.position.y<4 && s.mob.velocity.y>=-1.2 && s.mob.tiers[0].rotation.y!==s.initialRod);
  add('hover','Approach and hover above the target',3,combat,s=>s.mob.mesh.position.y>=.5 && s.mob.mesh.position.y<=3.5 && s.mob.mesh.position.z>0);
  add('attack','3-second charge, 3 shots and 5-second cooldown',8,combat,s=>s.mob.shotsFired===3 && s.player.damageEvents>=3 && !s.mob.charging);
  add('cover','A blocked volley pauses, then resumes',7,s=>{combat(s);s.wallUp=s.wallDown=false;},s=>s.coverShots===1 && s.resumeShots===1 && s.mob.shotsFired===3,(s,t)=>{if(t>=3.1&&!s.wallUp){s.wallUp=true;s.coverShots=s.mob.shotsFired;wall(s,BLOCKS.STONE);}if(t>=5&&!s.wallDown){s.wallDown=true;s.resumeShots=s.mob.shotsFired;wall(s,BLOCKS.AIR);}});
  add('range','Targets outside 48 blocks are ignored',4,s=>{combat(s);s.player.position.z=49;},s=>!s.mob.shotsFired && !s.mob.charging);
  add('creative','Creative players ignored',2,s=>{s.player.gamemode='creative';},s=>!s.mob.shotsFired&&!s.mob.charging);
  add('spectator','Spectator players ignored',2,s=>{s.player.gamemode='spectator';},s=>!s.mob.shotsFired&&!s.mob.charging);
  add('peaceful','Peaceful difficulty prevents attacks',2,s=>{combat(s);s.manager.game.difficulty='peaceful';},s=>!s.mob.shotsFired&&s.player.health===100);
  add('melee','Contact melee bypasses Fire Resistance, no ignition',1.1,s=>{combat(s);s.player.position.z=.5;s.player.statusEffects.fire_resistance=true;},s=>s.player.health<=94&&!s.player.isOnFire);
  add('shield','Small fireballs stop at a raised shield',1,s=>{combat(s);s.player.isBlocking=true;shootBlazeFireball(s.manager,s.mob,s.player.position.clone().add(new THREE.Vector3(0,1,0)));},s=>s.player.health===100&&!s.player.isOnFire);
  add('resistance','Fire Resistance prevents fireball damage',1,s=>{combat(s);s.player.statusEffects.fire_resistance=true;shootBlazeFireball(s.manager,s.mob,s.player.position.clone().add(new THREE.Vector3(0,1,0)));},s=>s.player.health===100&&!s.player.isOnFire);
  add('retaliation','A damaged Blaze alerts nearby Blazes',1,s=>{s.ally=s.manager.spawnBlaze(2,0,0);combat(s);s.hit(1);},s=>s.ally.blazeTarget===s.player&&s.mob.blazeTarget===s.player);
  add('water','Water contact deals 1 HP every half second',2,s=>{s.world.fluid=BLOCKS.WATER;},s=>s.mob.health<=16);
  add('rain','Exposed Blaze takes rain damage',2,s=>{s.world.dimension='overworld';s.manager.game.weather.weatherType='rain';},s=>s.mob.health<=16);
  add('roof','A roof blocks rain damage',2,s=>{s.world.dimension='overworld';s.manager.game.weather.weatherType='rain';for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)s.world.setVoxel(x,3,z,BLOCKS.STONE);},s=>s.mob.health===20);
  add('lava','Fire and lava immunity',2,s=>{s.world.fluid=BLOCKS.LAVA;},s=>s.mob.health===20);
  add('powder','Powder snow: freeze, then 5 HP damage',7.2,s=>{s.world.fluid=BLOCKS.POWDER_SNOW;},s=>s.mob.health===15);
  add('snowball','Thrown snowball deals exactly 3 HP',1,s=>{s.player.position.set(0,0,3);s.player.camera=new THREE.PerspectiveCamera();s.inventory.active={id:'snowball',count:1};useSnowball({player:s.player,inventory:s.inventory,mobs:s.manager});},s=>s.mob.health===17);
  add('splash_water','Splash water bottle deals exactly 1 HP',1,s=>{s.player.position.set(0,0,2);s.player.camera=new THREE.PerspectiveCamera();s.inventory.active={id:'splash_water_bottle',count:1};useBarterPotion({player:s.player,camera:s.player.camera,inventory:s.inventory,mobs:s.manager});},s=>s.mob.health===19);
  add('damage','Damage flash and knockback',.6,s=>{s.hit(1);s.flash=s.mob.hurtTime>0;},s=>s.flash && s.mob.health===19);
  add('death','Death animation and player-credit loot',2,s=>s.hit(100),s=>!s.manager.mobs.includes(s.mob)&&s.entities.xp===10&&s.entities.drops.every(d=>d.id==='blaze_rod'&&d.count<=1));
  return cases;
}
