import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { HostileMobBehaviors } from '../src/hostileMobBehaviors.js';
import { setMagmaSize, useSnowball, updateSnowballs, updateBlaze, updateMagmaCube, shootBlazeFireball, updateBlazeFireball } from '../src/netherCombat.js';
import { moveGroundMob } from '../src/mobMotion.js';
import { BLOCKS } from '../src/blocks.js';
import { applyHeat } from '../src/heat.js';
function fixture() {
  const world = {dimension:'nether', getVoxel:(x,y,z)=>y<0?BLOCKS.STONE:BLOCKS.AIR, setVoxel(){}};
  const manager = new MobManager(new THREE.Scene(),world,null,null);
  manager.isBlockSolid=(x,y,z)=>world.getVoxel(Math.floor(x),Math.floor(y),Math.floor(z))===BLOCKS.STONE;
  manager.customProjectiles=[];
  manager.hostileBehaviors=new HostileMobBehaviors(manager,world,null,null);
  const player={position:new THREE.Vector3(10,0,0),health:20,gamemode:'survival',takeDamage(n){this.health-=n;}};
  manager.game={player};
  return {manager,world,player};
}
test('Blaze model has twelve rods, one front face, smoke and charging flames',()=>{
 const {manager}=fixture(); const m=manager.spawnBlaze(0,0,0);
 assert.equal(m.tiers.reduce((n,t)=>n+t.children.length,0),12);
 assert.notEqual(m.head.material[4],m.head.material[0]);
 assert.equal(m.smoke.children.length,10); assert.equal(m.flames.visible,false);
});
test('Blaze charges for three seconds, fires three shots, and cools down; cover cancels firing',()=>{
 const {manager,player}=fixture(); const m=manager.spawnBlaze(0,0,0);
 updateBlaze(manager,m,player,.1);
 for(let i=0;i<29;i++)updateBlaze(manager,m,player,.1);
 assert.equal(manager.customProjectiles.length,0);
 for(let i=0;i<12;i++)updateBlaze(manager,m,player,.1);
 assert.equal(manager.customProjectiles.length,3); assert.equal(m.charging,false);
 for(let i=0;i<40;i++)updateBlaze(manager,m,player,.1);
 assert.equal(manager.customProjectiles.length,3);
 manager.isBlockSolid=()=>true; updateBlaze(manager,m,player,1);
 assert.equal(m.charging,false);
});
test('Blaze fireballs sweep terrain, ignite adjacent air, and do not explode or tunnel',()=>{
 const {manager,world,player}=fixture();player.position.x=5;
 world.getVoxel=(x)=>x===2?BLOCKS.STONE:BLOCKS.AIR;
 const edits=[];world.setVoxel=(...args)=>edits.push(args);
 const m=manager.spawnBlaze(0,0,0);shootBlazeFireball(manager,m,player.position.clone().add(new THREE.Vector3(0,1,0)));
 assert.equal(updateBlazeFireball(manager,manager.customProjectiles[0],player,.5),false);
 assert.equal(player.health,20);assert.equal(edits.length,1);assert.equal(edits[0][3],BLOCKS.FIRE);
});
test('Blaze projectile deals finite damage and burns; resistance and shields prevent burning',()=>{
 for(const blocked of [false,true]) {
 const {manager,world,player}=fixture();player.position.x=2;
 if(blocked)player.takeDamage=()=>{};
 const m=manager.spawnBlaze(0,0,0);shootBlazeFireball(manager,m,player.position.clone().add(new THREE.Vector3(0,1,0)));
 updateBlazeFireball(manager,manager.customProjectiles[0],player,.2);
 assert.equal(player.health,blocked?20:15);assert.equal(!!player.isOnFire,!blocked);
 if(!blocked){applyHeat(world,player,player.position,1,n=>player.takeDamage(n));assert.equal(player.health,14);}
 }
});
test('Blaze takes water damage and slowly descends; creative players are ignored',()=>{
 const {manager,world,player}=fixture();const m=manager.spawnBlaze(0,0,0);
 world.getVoxel=()=>BLOCKS.WATER;player.gamemode='creative';
 updateBlaze(manager,m,player,.5);assert.equal(m.health,19);assert.ok(m.velocity.y>=-1.2);assert.equal(manager.customProjectiles.length,0);
});
test('Magma size determines health, armor, hitbox and mesh consistently',()=>{
 const {manager}=fixture();const m=manager.spawnMagmaCube(0,0,0);
 for(const size of [1,2,4]){setMagmaSize(m,size);assert.equal(m.health,size*size);assert.equal(m.armor,size*3);assert.equal(m.width,.51*size);assert.equal(m.mesh.scale.x,.51*size/.8);}
 assert.equal(m.layers.length,8);assert.notEqual(m.layers[0].material[4],m.layers[0].material[0]);
 assert.ok(m.layers[0].geometry.attributes.uv.getY(0)<=.125);
});
test('Magma hops only on ground and lands without midair resets or jitter',()=>{
 const {manager,player}=fixture();const m=manager.spawnMagmaCube(0,0,0);setMagmaSize(m,1);m.onGround=true;m.jumpTimer=0;
 updateMagmaCube(manager,m,player,.05);const initial=m.velocity.y;assert.ok(initial>6);
 updateMagmaCube(manager,m,player,1);assert.equal(m.velocity.y,initial);
 let peak=0;for(let i=0;i<100;i++){moveGroundMob(manager,m,.02);peak=Math.max(peak,m.mesh.position.y);if(m.onGround)break;}
 assert.ok(peak>.8&&peak<1.1);assert.equal(m.onGround,true);
});
test('All magma sizes attack on contact, including tiny cubes; lava is harmless',()=>{
 const {manager,player,world}=fixture();const m=manager.spawnMagmaCube(0,0,0);setMagmaSize(m,1);player.position.set(.4,0,0);
 updateMagmaCube(manager,m,player,.1);assert.equal(player.health,17);
 updateMagmaCube(manager,m,player,.1);assert.equal(player.health,17);
 world.getVoxel=()=>BLOCKS.LAVA;updateMagmaCube(manager,m,player,.1);assert.equal(m.gravity,0);assert.ok(m.velocity.y>0);assert.equal(m.health,1);
});
test('Magma splits once into two to four half-sized children with squared health; tiny cubes never split or drop cream',()=>{
 const {manager}=fixture();const m=manager.spawnMagmaCube(0,0,0);
 manager.hostileBehaviors.handleMobDeathSplitting(m);
 const children=manager.mobs.slice(1);assert.ok(children.length>=2&&children.length<=4);
 for(const c of children){assert.equal(c.slimeSize,2);assert.equal(c.health,4);assert.equal(c.width,1.02);}
 manager.hostileBehaviors.handleMobDeathSplitting(m);assert.equal(manager.mobs.length,children.length+1);
 const tiny=children[0];setMagmaSize(tiny,1);assert.equal(manager.hostileBehaviors.handleMobDeathSplitting(tiny),false);
});
test('Magma armor reduces attack damage and submerged cubes drown after fifteen seconds',()=>{
 const {manager,world,player}=fixture();const m=manager.spawnMagmaCube(0,0,0);
 manager.damageMob(m,5);assert.ok(m.health>11&&m.health<16);m.hitCooldown=0;
 world.getVoxel=()=>BLOCKS.WATER;const before=m.health;updateMagmaCube(manager,m,player,15);assert.equal(m.health,before);
 updateMagmaCube(manager,m,player,1);assert.ok(m.health<before);
});
test('The complete mob update advances Blaze projectiles exactly once',()=>{
 const {manager,player}=fixture(); const m=manager.spawnBlaze(0,0,0);player.position.set(30,0,0);
 shootBlazeFireball(manager,m,player.position.clone().add(new THREE.Vector3(0,1,0)));
 const p=manager.customProjectiles[0], start=p.position.clone();
 manager.update(.1,player);
 assert.ok(Math.abs(p.position.distanceTo(start)-1.8)<1e-6);
 assert.ok(p.mesh.position.distanceTo(p.position)<1e-8);assert.ok(Number.isFinite(player.health));
});
test('Actual death path awards Blaze XP only for player kills and no cream for tiny cubes',()=>{
 for(const type of ['blaze','magma_cube'])for(const credited of [false,true]){
 const {manager}=fixture();const drops=[],xp=[];
 manager.entities={spawnDeathParticles(){},spawnDroppedItem:(p,id)=>drops.push(id),spawnXpOrbs:(p,n)=>xp.push(n)};
 const m=manager.spawnMob(type,0,0,0);if(type==='magma_cube')setMagmaSize(m,1);
 m.playerDamaged=credited;m.health=0;manager.updateDeath(m,.7);
 if(type==='magma_cube')assert.ok(!drops.includes('magma_cream'));
 if(!credited){assert.deepEqual(drops,[]);assert.deepEqual(xp,[]);}
 else assert.deepEqual(xp,[type==='blaze'?10:1]);
 }
});
test('Thrown snowballs consume inventory and deal three damage to Blaze',()=>{
 const {manager,player}=fixture();player.position.set(0,0,3);player.camera=new THREE.PerspectiveCamera();
 let used=0;const game={player,mobs:manager,inventory:{getActiveItem:()=>({id:'snowball'}),consumeActiveItem:()=>used++}};
 const m=manager.spawnBlaze(0,0,0);assert.equal(useSnowball(game),true);assert.equal(used,1);
 updateSnowballs(manager,.2);assert.equal(m.health,17);assert.equal(manager.snowballs.length,0);
});
test('Fire resistance negates Blaze projectile damage and burning',()=>{
 const {manager,player}=fixture();player.position.x=2;player.hasStatusEffect=id=>id==='fire_resistance';
 const m=manager.spawnBlaze(0,0,0);shootBlazeFireball(manager,m,player.position.clone().add(new THREE.Vector3(0,1,0)));
 updateBlazeFireball(manager,manager.customProjectiles[0],player,.2);assert.equal(player.health,20);assert.ok(!player.isOnFire);
});
