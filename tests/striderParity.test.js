import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createMobDebugSession} from '../src/mobDebugSession.js';
import {mobScenarios} from '../src/mobShowcase.js';
import {boostStrider,spawnNaturalStrider,striderSpeed,serializeStrider,restoreStrider} from '../src/striderBehavior.js';
import {BLOCKS} from '../src/blocks.js';
const session=()=>{const s=createMobDebugSession(new THREE.Scene());s.reset('strider');return s;};
const use=(s,id,m=s.mob)=>{s.inventory.active=id?{id,count:4}:null;return s.manager.animalBehaviors.interact(m,s.player,s.inventory);};
const tick=(s,seconds)=>{for(let i=0;i<Math.round(seconds*30);i++)s.tick(1/30);};
for(const c of mobScenarios('strider'))test('inspector '+c.id,()=>{const s=session();s.startPosition=s.mob.mesh.position.clone();c.setup(s);tick(s,c.duration);assert.equal(c.check(s),true,JSON.stringify(s.snapshot()));assert.equal(s.manager.mobErrors.size,0);});
test('adult and baby dimensions; six separate nearest-filtered faces; hip pivots',()=>{const s=session(),m=s.mob;assert.deepEqual(s.manager.getMobDimensions('strider'),{width:.9,height:1.7});assert.equal(m.bodyMesh.material.length,6);assert.equal(m.bristles.length,6);assert.ok(m.legs.every(l=>l.getObjectByName('foot')&&l.position.y===.7));assert.ok(m.bodyMesh.material.every(v=>v.map.magFilter===THREE.NearestFilter));const baby=s.manager.spawnStrider(2,0,0,{isBaby:true});assert.equal(baby.mesh.scale.x,.5);assert.equal(baby.babyGrowthTimer,1200);});
test('babies cannot saddle or mount; equipment does not permit occupied mounting',()=>{const s=session();s.mob.isBaby=true;assert.equal(use(s,'saddle'),false);assert.equal(s.manager.animalBehaviors.mountMob(s.mob,s.player),false);s.mob.isBaby=false;use(s,'saddle');s.mob.rider={};assert.equal(use(s,null),false);});
test('boost duration endpoints, sine peak, no stacking, fishing rod at exhaustion',()=>{for(const [random,duration] of [[0,7],[.999999,49]]){const s=session();use(s,'saddle');use(s,null);s.player.gamemode='survival';s.manager.random=()=>random;s.inventory.active={id:'warped_fungus_on_a_stick',count:1,durability:1};assert.equal(boostStrider(s.manager.animalBehaviors,s.player,s.inventory.active),true);assert.equal(s.mob.boostDuration,duration);assert.equal(s.inventory.active.id,'fishing_rod');s.mob.isCold=false;s.mob.boostRemaining=duration/2;assert.ok(Math.abs(striderSpeed(s.mob,true)-9.116)<1e-9);assert.equal(boostStrider(s.manager.animalBehaviors,s.player,{id:'warped_fungus_on_a_stick'}),false);}});
test('offhand fungus stick steers automatically even with other item in main hand',()=>{const s=session();use(s,'saddle');use(s,null);s.inventory.active={id:'stone'};s.inventory.getOffhandItem=()=>({id:'warped_fungus_on_a_stick'});tick(s,1);assert.ok(s.mob.mesh.position.z<-1.7);});
test('rain shelter and snowfall protect Striders',()=>{for(const snow of [false,true]){const s=session();s.world.dimension='overworld';s.manager.game.weather.weatherType='rain';s.mob.walking=false;s.mob.timer=10;if(snow)s.world.getBiome=()=> 'snowy_plains';else for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++)s.world.setVoxel(x,3,z,BLOCKS.STONE);tick(s,2);assert.equal(s.mob.health,20);}});
test('source lava fall damage; flowing lava prevents fall damage',()=>{for(const level of [0,4]){const s=session();s.world.fluid=BLOCKS.LAVA;s.world.getLavaLevel=()=>level;s.mob.mesh.position.y=10;s.mob.walking=false;s.mob.timer=20;tick(s,3);assert.equal(s.mob.health,level?20:15);}});
test('peaceful removes piglin rider and keeps saddle',()=>{const s=session();s.manager.game.difficulty='peaceful';let n=0;s.manager.random=()=>n++<2?.5:0;const m=spawnNaturalStrider(s.manager,4,0,0);assert.ok(m.isSaddled);assert.equal(m.rider,undefined);});
test('baby feeding uses numeric block ID and never bypasses locked growth',()=>{const s=session();s.mob.isBaby=true;s.mob.babyGrowthTimer=1200;use(s,BLOCKS.WARPED_FUNGUS);assert.equal(s.mob.babyGrowthTimer,1080);use(s,'golden_dandelion');use(s,'warped_fungus');tick(s,2);assert.equal(s.mob.babyGrowthTimer,1200);const record=serializeStrider(s.mob),m=s.manager.spawnStrider(3,0,0);restoreStrider(m,record);assert.deepEqual(serializeStrider(m),record);assert.equal(m.mesh.scale.x,.5);});
test('adult string and saddle drop; only player or wolf kills earn XP; babies drop nothing',()=>{for(const kind of ['environment','player','baby']){const s=session();use(s,'saddle');if(kind==='baby')s.mob.isBaby=true;if(kind==='player')s.hit(100);else s.manager.damageMob(s.mob,100);tick(s,1);assert.equal(s.entities.xp>0,kind==='player');assert.equal(s.entities.drops.length,kind==='baby'?0:2);if(kind!=='baby'){const string=s.entities.drops.find(d=>d.id==='string');assert.ok(string.count>=2&&string.count<=5);}}});

test('generated Nether spawning runs every 20 seconds in groups of 2-4; inspector never auto-spawns',async()=>{
 const {updateStriderSpawning}=await import('../src/striderBehavior.js');
 const s=session();s.world.chunks=new Map();s.world.getVoxel=(x,y,z)=>y===0?BLOCKS.LAVA:BLOCKS.AIR;s.manager.random=()=>.5;s.player.position.set(0,1,0);
 updateStriderSpawning(s.manager,19.9,s.player);assert.equal(s.manager.mobs.length,1);updateStriderSpawning(s.manager,.2,s.player);assert.equal(s.manager.mobs.length,4);
 updateStriderSpawning(s.manager,19,s.player);assert.equal(s.manager.mobs.length,4);
 const debug=session();updateStriderSpawning(debug.manager,30,debug.player);assert.equal(debug.manager.mobs.length,1);
});
test('safe dismount searches solid land in facing direction and never teleports to a wall',()=>{
 const s=session();s.world.fluid=BLOCKS.LAVA;s.mob.mesh.position.set(.5,2.89,.5);use(s,'saddle');use(s,null);
 for(let y=0;y<3;y++)s.world.setVoxel(0,y,-2,BLOCKS.STONE);s.world.setVoxel(0,3,-2,BLOCKS.AIR);s.world.setVoxel(0,4,-2,BLOCKS.AIR);
 s.player.yaw=0;s.manager.animalBehaviors.dismount(s.player);assert.equal(s.player.position.y,3);assert.equal(s.player.position.z,-1.5);assert.equal(s.player.ridingMob,null);
});
test('one-block ledges are stepped up without jumping',()=>{
 const s=session();s.mob.mesh.position.set(.5,0,.5);s.world.setVoxel(0,0,-1,BLOCKS.STONE);use(s,'saddle');use(s,null);s.inventory.active={id:'warped_fungus_on_a_stick'};tick(s,.7);assert.ok(s.mob.mesh.position.y>.95);assert.ok(s.mob.mesh.position.z<0);
});
test('carried baby keeps warm and receives subsequent hits; death releases passenger',()=>{
 const s=session();s.world.fluid=BLOCKS.LAVA;s.manager.random=()=>0;const m=spawnNaturalStrider(s.manager,4,2.89,0),baby=m.rider;tick(s,.1);assert.equal(baby.isCold,false);s.manager.damageMob(baby,1);tick(s,.5);assert.equal(s.manager.damageMob(baby,1),true);assert.equal(baby.health,18);s.manager.damageMob(m,100);tick(s,.5);assert.equal(baby.vehicle,null);
});
test('lava flow slows upstream riding',()=>{
 const run=yaw=>{const s=session();s.world.fluid=BLOCKS.LAVA;s.world.getLavaLevel=(x,y,z)=>x>0?4:0;s.mob.mesh.position.set(.5,2.89,.5);use(s,'saddle');use(s,null);s.inventory.active={id:'warped_fungus_on_a_stick'};s.player.yaw=yaw;tick(s,.5);return Math.abs(s.mob.mesh.position.x-.5);};
 assert.ok(run(Math.PI/2)<run(-Math.PI/2)*.7);
});
test('splash water potion follows the actual projectile path and hurts Strider without granting fire resistance',async()=>{
 const {useBarterPotion}=await import('../src/barterItems.js');const s=session();s.player.gamemode='survival';s.player.position.set(0,0,3);s.inventory.active={id:'splash_potion',count:1};s.player.camera={getWorldDirection:v=>v.set(0,0,-1)};
 assert.equal(useBarterPotion({...s.manager.game,camera:s.player.camera,mobs:s.manager,inventory:s.inventory}),true);tick(s,.6);assert.equal(s.mob.health,19);assert.equal(s.mob.fireResistanceTime,0);assert.equal(s.inventory.active.count,0);
});
test('map save/load restores age, saddle and passenger links through real map API',async()=>{
 const {serializeWorld,deserializeWorld}=await import('../src/mapManager.js');const {World}=await import('../src/world.js');const s=session();s.manager.random=()=>0;const m=spawnNaturalStrider(s.manager,3,0,0);m.isSaddled=true;m.rider.ageLocked=true;m.rider.babyGrowthTimer=876;
 const game={...s.manager.game,world:new World(123),mobs:s.manager,scene:s.manager.scene,inventory:s.inventory,worldTime:0,mechanisms:null,loadChunksAroundPlayer(){},rebuildChunkMesh(){}};s.player.pitch=0;s.player.update=()=>{};const record=JSON.parse(JSON.stringify(serializeWorld(game)));deserializeWorld(game,record);
 const parent=s.manager.mobs[1],baby=s.manager.mobs[2];assert.ok(parent.saddleMesh.visible);assert.equal(baby.vehicle,parent);assert.equal(parent.rider,baby);assert.equal(baby.babyGrowthTimer,876);assert.equal(baby.ageLocked,true);
});

test('speed effects use the engine Map and amplify both land and lava speeds',()=>{const s=session(),m=s.mob;m.statusEffects=new Map([['speed',{duration:30,level:1}]]);m.isCold=false;assert.ok(Math.abs(striderSpeed(m,true)-4.24*1.2)<1e-9);m.isCold=true;assert.ok(Math.abs(striderSpeed(m,true)-1.78*1.2)<1e-9);});
test('baby passenger still takes rain damage while its parent is in lava',()=>{const s=session();s.world.fluid=BLOCKS.LAVA;s.world.dimension='overworld';s.manager.game.weather.weatherType='rain';s.manager.random=()=>0;const m=spawnNaturalStrider(s.manager,4,2.89,0);tick(s,2);assert.equal(m.rider.health,16);});
