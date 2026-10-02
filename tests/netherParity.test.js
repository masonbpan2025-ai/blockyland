import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { HostileMobBehaviors } from '../src/hostileMobBehaviors.js';
import { AnimalBehaviors } from '../src/animalBehaviors.js';
import { EntityManager } from '../src/entities.js';
import { Inventory } from '../src/inventory.js';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { PIGLIN_BARTER_LOOT, barterReward, updatePiglin, updatePiglinHunt } from '../src/piglin.js';
import { updateHoglin, retaliateHoglins } from '../src/netherMobAI.js';
import { soulSpeedMultiplier, useBarterPotion, updateBarterEffects } from '../src/barterItems.js';
import { separatePlayerFromMobs } from '../src/mobPlayerCollision.js';
import { applyHeat } from '../src/heat.js';
import { spawnArrow, updateArrows } from '../src/arrows.js';
import { existsSync } from 'node:fs';

function fixture(terrain = (x,y,z) => y < 1 ? BLOCKS.STONE : BLOCKS.AIR) {
  const world = { dimension: 'nether', getVoxel: terrain }, scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const manager = Object.assign(Object.create(MobManager.prototype), { world, scene, sounds, mobs: [], arrows: [], customProjectiles: [], textures: { hoglin: new THREE.Texture() } });
  const inventory = new Inventory(sounds); inventory.hotbar.fill(null); inventory.storage.fill(null);
  const player = { position: new THREE.Vector3(8,1,0), velocity: new THREE.Vector3(), width: 0.6, height: 1.8, health: 20, gamemode: 'survival', inventory, takeDamage() {} };
  manager.game = { player, inventory, difficulty: 'normal' };
  manager.hostileBehaviors = new HostileMobBehaviors(manager, world, sounds, null);
  return { manager, world, player, inventory, scene, sounds, behavior: manager.hostileBehaviors };
}

test('complete Java barter table has 19 usable entries, exact weight 469 and Soul Speed I–III', () => {
  assert.equal(PIGLIN_BARTER_LOOT.length, 19);
  assert.equal(PIGLIN_BARTER_LOOT.reduce((n,e) => n+e.weight,0),469);
  let weight = 0;
  for (const e of PIGLIN_BARTER_LOOT) {
    const definition = e.isBlock ? BLOCK_DEFS[e.id] : ITEMS[e.id]; assert.ok(definition, String(e.id));
    const path = e.isBlock ? '/assets/blocks/'+(definition.textures.all || definition.textures.side || definition.textures.top) : definition.icon;
    assert.ok(existsSync('public'+path),path);
    for (const r of [0,0.5,0.99999]) {
      let calls=0;const reward=barterReward(()=>calls++===0?(weight+0.1)/469:r);
      assert.equal(reward.id,e.id);
      if(e.soulSpeed) assert.deepEqual(reward.enchantments,[{id:'soul_speed',level:1+Math.floor(r*3)}]);
    }
    weight+=e.weight;
  }
});
test('bartered enchantments survive real dropped-item pickup', t => {
  t.mock.method(THREE.TextureLoader.prototype,'load',()=>new THREE.Texture());
  const f=fixture();const entities=new EntityManager(f.scene,f.world,f.sounds);
  const enchantments=[{id:'soul_speed',level:3}];
  entities.spawnDroppedItem(f.player.position.clone().add(new THREE.Vector3(0,.8,0)),'iron_boots',false,1,{enchantments,pickupDelay:0});
  entities.update(.01,f.player,f.inventory);
  assert.deepEqual(f.inventory.hotbar.find(i=>i?.id==='iron_boots').enchantments,enchantments);
});
test('Soul Speed works on both soul surfaces; unenchanted soul sand slows walking',()=>{
  const f=fixture();f.world.getVoxel=()=>BLOCKS.SOUL_SAND;
  assert.equal(soulSpeedMultiplier(f.world,f.player),.4);
  f.inventory.armor.feet={enchantments:[{id:'soul_speed',level:3}]};
  assert.equal(soulSpeedMultiplier(f.world,f.player),1.615);
  f.world.getVoxel=()=>BLOCKS.SOUL_SOIL;assert.equal(soulSpeedMultiplier(f.world,f.player),1.615);
  f.world.getVoxel=()=>BLOCKS.STONE;assert.equal(soulSpeedMultiplier(f.world,f.player),1);
});
test('fire resistance potions consume, return bottles and actually prevent lava damage',()=>{
  const f=fixture();let effect;
  f.inventory.hotbar[0]={id:'potion_of_fire_resistance',isBlock:false,count:1};
  f.player.applyStatusEffect=(...args)=>effect=args;f.player.hasStatusEffect=id=>effect?.[0]===id;
  assert.ok(useBarterPotion({inventory:f.inventory,player:f.player}));assert.equal(effect[1],180);
  assert.ok(f.inventory.hotbar.find(i=>i?.id==='glass_bottle'));
  let damage=0;applyHeat({getVoxel:()=>BLOCKS.LAVA},f.player,f.player.position,1,n=>damage+=n);assert.equal(damage,0);
});
test('thrown splash potion collides with terrain and grants timed fire resistance nearby',()=>{
  const f=fixture();f.inventory.hotbar[0]={id:'splash_potion_of_fire_resistance',isBlock:false,count:1};
  f.player.applyStatusEffect=(id,duration)=>{f.player.effect=id;f.player.duration=duration;};
  const game={inventory:f.inventory,player:f.player,mobs:f.manager,camera:{getWorldDirection:v=>v.set(0,-1,0)}};
  useBarterPotion(game);assert.equal(f.manager.splashPotions.length,1);
  for(let i=0;i<120;i++) updateBarterEffects(f.manager,1/60,f.player);
  assert.equal(f.manager.splashPotions.length,0);assert.equal(f.player.effect,'fire_resistance');assert.ok(f.player.duration>90);
});
test('spectral arrows hit mobs and give a ten-second visible outline',()=>{
  const f=fixture();const mob=f.manager.spawnHoglin(0,1,2);
  f.manager.damageMob=()=>true;
  spawnArrow(f.manager,new THREE.Vector3(0,1.7,0),new THREE.Vector3(0,0,1),'player',{spectral:true});
  for(let i=0;i<10;i++)updateArrows(f.manager,.01,f.player);
  assert.equal(mob.glowingTime,10);updateBarterEffects(f.manager,.01,f.player);assert.ok(mob.glowOutline);
  updateBarterEffects(f.manager,11,f.player);assert.equal(mob.glowOutline,null);
});
test('adult Piglins coordinate a hunt; babies and bastion Piglins do not join',t=>{
  const f=fixture();const first=f.manager.spawnPiglin(0,1,0),second=f.manager.spawnPiglin(0,1,2),baby=f.manager.spawnPiglin(0,1,3),bastion=f.manager.spawnPiglin(1,1,3),prey=f.manager.spawnHoglin(5,1,0);
  baby.isBaby=true;bastion.bastionSpawn=true;t.mock.method(Math,'random',()=>0);
  updatePiglinHunt(f.behavior,first,.1);
  assert.equal(first.combatTarget,prey);assert.equal(second.combatTarget,prey);assert.equal(baby.combatTarget,undefined);assert.equal(bastion.combatTarget,undefined);
  assert.ok(first.huntCooldown>=30);
});
test('outnumbered hunting Piglins retreat and baby/protected Hoglins are not hunted',t=>{
  const f=fixture();const pig=f.manager.spawnPiglin(0,1,0),a=f.manager.spawnHoglin(3,1,0),b=f.manager.spawnHoglin(4,1,0);
  pig.combatTarget=a;updatePiglinHunt(f.behavior,pig,.1);assert.ok(pig.velocity.x<0);
  pig.combatTarget=null;a.isBaby=true;b.cannotBeHunted=true;pig.huntCheckTime=0;t.mock.method(Math,'random',()=>0);
  updatePiglinHunt(f.behavior,pig,.1);assert.equal(pig.combatTarget,null);
});
test('hunting arrows target the Hoglin rather than the player',()=>{
  const f=fixture();const pig=f.manager.spawnPiglin(0,1,0),prey=f.manager.spawnHoglin(4,1,0);
  pig.weapon='crossbow';pig.combatTarget=prey;updatePiglinHunt(f.behavior,pig,.1);
  assert.equal(f.manager.arrows[0].target,prey);
});
test('Hoglin group retaliation, baby fleeing, and outnumbered retreat',()=>{
  const f=fixture();const a=f.manager.spawnHoglin(0,1,0),b=f.manager.spawnHoglin(0,1,3),pig=f.manager.spawnPiglin(3,1,0);
  retaliateHoglins(f.manager,a,pig);assert.equal(b.combatTarget,pig);
  b.combatTarget=null;a.isBaby=true;retaliateHoglins(f.manager,a,pig);assert.equal(b.combatTarget,null);assert.equal(a.fleeTimer,5);
  updateHoglin(f.behavior,a,.1,f.player);assert.ok(a.velocity.x<0);
});
test('Hoglin speed is bounded, chase stops without oscillation, and attacks every two seconds',()=>{
  for(const fps of [30,60,144]) {
    const f=fixture();const hog=f.manager.spawnHoglin(0,1,0);let hits=0;f.player.takeDamage=()=>hits++;
    const positions=[];
    for(let i=0;i<fps*6;i++){f.manager.update(1/fps,f.player);if(i>fps*4)positions.push(hog.mesh.position.x);assert.ok(Math.hypot(hog.velocity.x,hog.velocity.z)<=2.5001);}
    assert.ok(hog.mesh.position.x>5);assert.ok(Math.max(...positions)-Math.min(...positions)<.01,'no jitter at '+fps);assert.ok(hits>=1 && hits<=3);
  }
});
test('Hoglins flee the placed repellent location, but not held fungus; creative players are ignored',()=>{
  const f=fixture();const hog=f.manager.spawnHoglin(0,1,0);f.inventory.hotbar[0]={id:'warped_fungus'};
  updateHoglin(f.behavior,hog,.1,f.player);assert.ok(hog.velocity.x>0);
  f.world.getVoxel=(x,y,z)=>x===-2&&y===1&&z===0?BLOCKS.WARPED_FUNGUS:0;hog.repellentTimer=0;
  updateHoglin(f.behavior,hog,.1,f.player);assert.ok(hog.velocity.x>0,'flee fungus to west, not player to east');assert.equal(hog.target,null);
  f.world.getVoxel=()=>0;hog.repellentTimer=0;f.player.gamemode='creative';updateHoglin(f.behavior,hog,.1,f.player);assert.equal(hog.target,null);
});
test('Hoglins convert after 15 seconds outside Nether; babies stay babies as Zoglins',()=>{
  const f=fixture();const hog=f.manager.spawnHoglin(0,1,0);hog.isBaby=true;f.world.dimension='overworld';
  updateHoglin(f.behavior,hog,14,f.player);assert.equal(hog.type,'hoglin');updateHoglin(f.behavior,hog,1,f.player);assert.equal(hog.type,'zoglin');assert.equal(hog.isBaby,true);assert.equal(hog.fireImmune,true);
});
test('crimson fungus breeds Hoglins and baby Piglins never grow up',()=>{
  const f=fixture();const animals=new AnimalBehaviors(f.manager,f.world,f.sounds,null);
  assert.ok(animals.isBreedingFood('hoglin',BLOCKS.CRIMSON_FUNGUS));
  const pig=f.manager.spawnPiglin(0,1,0);pig.isBaby=true;pig.babyGrowthTimer=.01;animals.update(.1,f.player);assert.equal(pig.isBaby,true);
});

for(const type of ['chicken','pig','zombie','piglin','hoglin','iron_golem','ravager','ghast']) test(type+' cannot overlap player even at a corner',()=>{
  const f=fixture();f.player.position.set(0,1,0);const mesh=new THREE.Group();mesh.position.set(.1,1,.1);
  const mob={type,mesh,health:20,velocity:new THREE.Vector3(-1,0,-1)};f.manager.mobs.push(mob);
  separatePlayerFromMobs(f.manager,f.player,1/60);
  const half=(f.manager.getMobDimensions(type).width+.6)/2;
  assert.ok(Math.abs(mesh.position.x-f.player.position.x)>=half || Math.abs(mesh.position.z-f.player.position.z)>=half);
  assert.ok(f.player.position.length()<1.01);
});
test('small mobs cannot push; large mobs push slowly at all frame rates',()=>{
  for(const [type,push] of [['chicken',false],['hoglin',true]]) for(const fps of [30,60,144]) {
    const f=fixture();f.player.position.set(0,1,0);const mesh=new THREE.Group();const width=f.manager.getMobDimensions(type).width;
    const mob={type,mesh,health:20,velocity:new THREE.Vector3()};f.manager.mobs.push(mob);
    for(let i=0;i<fps;i++){mesh.position.set(f.player.position.x+(width+.6)/2-.05,1,0);separatePlayerFromMobs(f.manager,f.player,1/fps);}
    assert.ok(Math.abs(f.player.position.x)<=.801);assert.equal(Math.abs(f.player.position.x)>.1,push);
  }
});
test('collision respects walls, vertical separation, riders, and spectators',()=>{
  const f=fixture();f.player.position.set(0,1,0);const hog=f.manager.spawnHoglin(.5,1,0);
  f.player.checkCollision=()=>true;separatePlayerFromMobs(f.manager,f.player,.1);assert.equal(f.player.position.x,0);assert.ok(hog.mesh.position.x>=1);
  hog.mesh.position.set(0,4,0);separatePlayerFromMobs(f.manager,f.player,.1);assert.equal(hog.mesh.position.x,0);
  hog.mesh.position.set(0,1,0);hog.rider=f.player;separatePlayerFromMobs(f.manager,f.player,.1);assert.equal(hog.mesh.position.x,0);
  hog.rider=null;f.player.gamemode='spectator';separatePlayerFromMobs(f.manager,f.player,.1);assert.equal(hog.mesh.position.x,0);
});
test('a fast mob cannot tunnel completely through the player',()=>{
  const f=fixture();f.player.position.set(0,1,0);f.manager.playerContactStart=f.player.position.clone();
  const hog=f.manager.spawnHoglin(3,1,0);hog.contactStart=new THREE.Vector3(-3,1,0);
  separatePlayerFromMobs(f.manager,f.player,.1);assert.ok(hog.mesh.position.x<=-1);
});
import { Player } from '../src/player.js';
import { BowController } from '../src/bow.js';
import { calculateAnvilResult } from '../src/anvil.js';

test('normal melee hits impart directional knockback; invulnerability prevents repeated impulses',()=>{
  const f=fixture();const player=Object.assign(Object.create(Player.prototype),f.player,{statusEffects:new Map(),sounds:f.sounds,invulnerableTimer:0});
  delete player.takeDamage;
  player.takeDamage(3,new THREE.Vector3(9,1,0),'zombie');
  assert.equal(player.health,17);assert.ok(player.velocity.x<0);assert.ok(player.velocity.y>0);
  const velocity=player.velocity.clone();player.takeDamage(3,new THREE.Vector3(9,1,0),'zombie');assert.deepEqual(player.velocity,velocity);
});
test('Piglins can be distracted by gold while chasing but not immediately after being hit',()=>{
  const f=fixture();const pig=f.manager.spawnPiglin(0,1,0);f.inventory.hotbar[0]={id:'gold_ingot',count:2,isBlock:false};
  updatePiglin(f.behavior,pig,.1,f.player);assert.equal(pig.target,f.player);
  assert.equal(f.behavior.interactPiglin(pig,f.player),true);pig.isBartering=false;pig.admireDisabledTime=20;
  assert.equal(f.behavior.interactPiglin(pig,f.player),false);assert.equal(f.inventory.hotbar[0].count,1);
});
test('hunting Piglins celebrate and consume only nearby pork, never leather',t=>{
  const f=fixture();const pig=f.manager.spawnPiglin(0,1,0);pig.combatTarget={type:'hoglin',health:0};t.mock.method(Math,'random',()=>0);
  updatePiglinHunt(f.behavior,pig,.1);assert.ok(pig.danceTime>0);assert.ok(pig.leftArm.rotation.z>1);
  const group=new THREE.Group();group.position.set(0,1,0);
  const pork={itemType:'porkchop',count:2,group}, leather={itemType:'leather',count:1,group};
  f.behavior.entities={droppedItems:[pork,leather]};f.player.inventory.armor.head={id:'golden_helmet'};
  updatePiglin(f.behavior,pig,.1,f.player);assert.equal(pork.count,1);assert.equal(leather.count,1);
  updatePiglin(f.behavior,pig,.1,f.player);assert.equal(pork.count,1);
});
test('Hoglin group retreat occurs when Piglins outnumber adults',()=>{
  const f=fixture();const hog=f.manager.spawnHoglin(0,1,0),a=f.manager.spawnPiglin(3,1,0);f.manager.spawnPiglin(4,1,1);
  retaliateHoglins(f.manager,hog,a);updateHoglin(f.behavior,hog,.1,f.player);assert.ok(hog.velocity.x<0);
});
test('adult Hoglin toss still applies against a shield, but baby attacks do not launch',()=>{
  const f=fixture();f.player.position.set(1.8,1,0);let damage=0;f.player.takeDamage=n=>damage=n;
  const hog=f.manager.spawnHoglin(0,1,0);updateHoglin(f.behavior,hog,.1,f.player);assert.ok(damage>=3&&damage<=8);assert.equal(f.player.velocity.y,4);
  hog.isBaby=true;hog.attackCooldown=0;f.player.position.x=1;f.player.velocity.set(0,0,0);updateHoglin(f.behavior,hog,.1,f.player);assert.equal(damage,.5);assert.equal(f.player.velocity.y,0);
});
test('Hoglins retain a steering direction around a wall without alternating each frame',()=>{
  const f=fixture((x,y,z)=>y<1||(x===2&&z>=-1&&z<=1&&y<4)?BLOCKS.STONE:0);const hog=f.manager.spawnHoglin(0,1,0);
  for(let i=0;i<600;i++)f.manager.update(1/60,f.player);
  assert.ok(hog.mesh.position.x>3,'must navigate past wall');assert.ok(!f.manager.checkMobCollision(hog,hog.mesh.position));
});
test('Hoglin courtship completes despite their wider collision bodies',t=>{
  t.mock.method(Math,'random',()=>.6);const f=fixture();f.player.gamemode='creative';f.player.position.x=40;
  f.manager.animalBehaviors=new AnimalBehaviors(f.manager,f.world,f.sounds,null);
  const a=f.manager.spawnHoglin(0,1,0),b=f.manager.spawnHoglin(1.5,1,0);a.inLove=b.inLove=60;
  for(let i=0;i<150;i++)f.manager.update(1/60,f.player);
  const baby=f.manager.mobs.find(m=>m.isBaby);assert.ok(baby);assert.ok(baby.babyGrowthTimer>1199);
});
test('Soul Speed book transfers through the anvil and spectral arrows are valid bow ammunition',()=>{
  const f=fixture();const result=calculateAnvilResult({id:'iron_boots',count:1,isBlock:false},{id:'enchanted_book',count:1,isBlock:false,enchantments:[{id:'soul_speed',level:2}]});
  assert.ok(result);assert.deepEqual(result.result.enchantments,[{id:'soul_speed',level:2}]);
  f.inventory.hotbar[1]={id:'spectral_arrow',isBlock:false,count:8};assert.equal(new BowController({player:f.player,inventory:f.inventory}).ammo().id,'spectral_arrow');
});


test('Piglins admire and visibly equip dropped golden armor without paying a barter reward',()=>{
  const f=fixture();const pig=f.manager.spawnPiglin(0,1,0);pig.equipment={};
  const group=new THREE.Group();group.position.set(.4,1,0);let rewards=0;
  f.behavior.entities={droppedItems:[{itemType:'golden_helmet',count:1,isBlock:false,group}],spawnDroppedItem:()=>rewards++};
  f.player.inventory.armor.head={id:'golden_helmet'};
  updatePiglin(f.behavior,pig,.1,f.player);assert.ok(pig.isBartering);
  updatePiglin(f.behavior,pig,6,f.player);updatePiglin(f.behavior,pig,.1,f.player);
  assert.equal(pig.equipment.head.id,'golden_helmet');assert.ok(pig.equipmentVisuals.head.meshes.length>0);assert.equal(rewards,0);
});
test('a crowd cannot accelerate the player beyond the shared push budget',()=>{
  const f=fixture();f.player.position.set(0,1,0);
  for(let i=0;i<10;i++)f.manager.spawnHoglin(.5,1,i*.01);
  separatePlayerFromMobs(f.manager,f.player,1/60);
  assert.ok(Math.hypot(f.player.position.x,f.player.position.z)<=.8/60+.00001);
  for(const mob of f.manager.mobs)assert.ok(Math.abs(mob.mesh.position.x-f.player.position.x)>=1||Math.abs(mob.mesh.position.z-f.player.position.z)>=1);
});

test('Soul Speed cannot be applied to swords or helmets through a book',()=>{
  for(const id of ['iron_sword','golden_helmet']) {
    const result=calculateAnvilResult({id,count:1,isBlock:false},{id:'enchanted_book',count:1,isBlock:false,enchantments:[{id:'soul_speed',level:3}]});
    assert.equal(result.valid,false);
  }
});
