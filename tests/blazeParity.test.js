import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMobDebugSession } from '../src/mobDebugSession.js';
import { MobShowcase } from '../src/mobShowcase.js';
import { blazeScenarios } from '../src/blazeScenarios.js';
import { shootBlazeFireball, updateBlazeFireball, updateBlaze } from '../src/netherCombat.js';
import { BLOCKS } from '../src/blocks.js';
import { applyHeat, igniteActor } from '../src/heat.js';
import { Player } from '../src/player.js';
const fixture=()=>{const s=createMobDebugSession(new THREE.Scene());s.reset('blaze');return s;};
for(const c of blazeScenarios())test(`Blaze inspector: ${c.label}`,()=>{const s=fixture(),r=new MobShowcase(s);r.start('blaze',c.id);for(let i=0;i<2000&&r.running;i++)r.tick(1/60);assert.equal(r.running,false);assert.deepEqual(r.results.map(x=>x.status),['observed'],JSON.stringify(r.results));});
test('Blaze appearance is deterministic, textured on all six faces, and exposes two eyes',()=>{const s=fixture(),m=s.mob;assert.equal(m.head.geometry.parameters.height,.5);assert.ok(m.head.material.every(x=>x.map));const pixels=m.head.material[4].map.image.data;for(const x of [3,12])assert.deepEqual([...pixels.slice((7*16+x)*4,(7*16+x)*4+3)],[61,38,17]);for(const t of m.tiers)for(const rod of t.children){assert.equal(rod.geometry.parameters.width,.125);assert.equal(rod.geometry.parameters.height,.5);}assert.ok(m.smoke.children.every(p=>p.isSprite));});
test('Blocked volley preserves remaining shots and timer until visibility returns',()=>{const s=fixture();s.player.gamemode='survival';for(let i=0;i<187;i++)updateBlaze(s.manager,s.mob,s.player,1/60);assert.equal(s.mob.shotsFired,1);const timer=s.mob.blazeTimer;s.manager.isBlockSolid=()=>true;for(let i=0;i<120;i++)updateBlaze(s.manager,s.mob,s.player,1/60);assert.equal(s.mob.shotsFired,1);assert.equal(s.mob.blazeTimer,timer);s.manager.isBlockSolid=()=>false;for(let i=0;i<45;i++)updateBlaze(s.manager,s.mob,s.player,1/60);assert.equal(s.mob.shotsFired,3);});
for(const [difficulty,fire,melee] of [['easy',3.5,4],['normal',5,6],['hard',7.5,9]])test(`Blaze ${difficulty} projectile and contact damage`,()=>{const s=fixture();s.manager.game.difficulty=difficulty;s.player.gamemode='survival';s.player.position.set(0,0,2);shootBlazeFireball(s.manager,s.mob,new THREE.Vector3(0,1,2));updateBlazeFireball(s.manager,s.manager.customProjectiles[0],s.player,.2);assert.equal(s.player.health,100-fire);s.player.health=100;s.player.position.z=.5;updateBlaze(s.manager,s.mob,s.player,.01);assert.equal(s.player.health,100-melee);});
test('Real Player shield blocks fireball without ignition',()=>{const s=fixture();s.player.position.set(0,0,2);s.player.gamemode='survival';s.player.isBlocking=true;s.player.inventory.getOffhandItem=()=>({id:'shield'});s.player.sounds={playShieldBlock(){}};s.player.addExhaustion=()=>{};s.player.takeDamage=Player.prototype.takeDamage;shootBlazeFireball(s.manager,s.mob,new THREE.Vector3(0,1,2));updateBlazeFireball(s.manager,s.manager.customProjectiles[0],s.player,.2);assert.equal(s.player.health,100);assert.ok(!s.player.isOnFire);});
test('A blaze fireball cannot be reflected; it can hit another mob and ignite it',()=>{const s=fixture();s.player.position.z=8;const victim=s.manager.spawnMob('pig',0,0,2);shootBlazeFireball(s.manager,s.mob,new THREE.Vector3(0,.5,2));assert.equal(s.manager.hostileBehaviors.handlePlayerAttackProjectile(s.mob.mesh.position,new THREE.Vector3(0,0,1)),false);updateBlazeFireball(s.manager,s.manager.customProjectiles[0],s.player,.2);assert.equal(victim.health,victim.maxHealth-5);assert.equal(victim.isOnFire,true);});
test('Fireball burn lasts five one-second damage ticks and water extinguishes it',()=>{const s=fixture();igniteActor(s.player,5);let damage=0;for(let i=0;i<5;i++)applyHeat(s.world,s.player,s.player.position,1,n=>damage+=n);assert.equal(damage,5);igniteActor(s.player,5);s.world.fluid=BLOCKS.WATER;applyHeat(s.world,s.player,s.player.position,.1,n=>damage+=n);assert.equal(s.player.isOnFire,false);});
test('Seven snowball-equivalent hits kill a Blaze, with damage flash on each',()=>{const s=fixture();for(let i=0;i<6;i++){s.mob.hitCooldown=0;s.manager.damageMob(s.mob,3,s.player.position,false,s.player);assert.ok(s.mob.hurtTime>0);}assert.equal(s.mob.health,2);s.mob.hitCooldown=0;s.manager.damageMob(s.mob,3,s.player.position,false,s.player);assert.ok(s.mob.health<=0);});
test('Looting and tamed wolf credit apply to Blaze drops; mob attackers alert the group',()=>{const s=fixture();s.inventory.active={id:'diamond_sword',enchantments:[{id:'looting',level:3}]};s.hit(1);assert.equal(s.mob.blazeLooting,3);const other=s.manager.spawnBlaze(1,0,0);const wolf=s.manager.spawnMob('wolf',0,0,3);wolf.isTamed=true;s.mob.hitCooldown=0;s.manager.damageMob(s.mob,1,wolf.mesh.position,false,wolf);assert.equal(s.mob.playerDamaged,true);assert.equal(other.blazeTarget,wolf);});
test('Inspector reset clears damage counters, shields, weather and effect state',()=>{const s=fixture();s.player.damageEvents=5;s.player.statusEffects.fire_resistance=true;s.player.isBlocking=true;s.manager.game.weather.weatherType='rain';s.reset('blaze');assert.equal(s.player.damageEvents,0);assert.equal(s.player.isBlocking,false);assert.equal(s.player.hasStatusEffect('fire_resistance'),false);assert.equal(s.manager.game.weather.weatherType,'clear');});


test('Environmental and non-player kills do not award Blaze rods or XP',()=>{
  for(const source of ['environment','golem']){
    const s=fixture();const golem=source==='golem'?s.manager.spawnMob('iron_golem',2,0,0):null;
    s.manager.damageMob(s.mob,100,golem?.mesh.position || null);
    for(let i=0;i<70;i++)s.tick(1/60);
    assert.equal(s.mob.playerDamaged,undefined);assert.deepEqual(s.entities.drops,[]);assert.equal(s.entities.xp,0);
  }
});

test('Looting III can award four rods and player kills award exactly ten XP',()=>{
  const s=fixture();
  s.manager.random=()=>.999;s.inventory.active={id:'diamond_sword',enchantments:[{id:'looting',level:3}]};s.hit(100);for(let i=0;i<70;i++)s.tick(1/60);
  assert.deepEqual(s.entities.drops,[{id:'blaze_rod',isBlock:false,count:4}]);assert.equal(s.entities.xp,10);
});
