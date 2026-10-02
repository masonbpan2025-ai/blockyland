import * as THREE from 'three';
import { MobManager } from './mobs.js';
import { BLOCKS } from './blocks.js';

export const DEBUG_MOBS = 'blaze magma_cube ghast piglin zombified_piglin hoglin zoglin strider wither_skeleton zombie skeleton creeper pig cow sheep chicken horse donkey wolf cat ocelot villager iron_golem pillager ravager witch slime enderman shulker guardian elder_guardian drowned cod salmon squid glow_squid dolphin axolotl mooshroom polar_bear panda warden phantom vindicator evoker vex ender_dragon wither tournament_host site_manager jackie_chun'.split(' ');

// An infinite flat floor and sparse edits: no chunks, map generator or saved worlds.
export function createDebugWorld() {
  const edits = new Map();
  return {
    dimension:'nether', selectedBiome:'nether', fluid:BLOCKS.AIR,
    getVoxel(x,y,z) { x=Math.floor(x);y=Math.floor(y);z=Math.floor(z);return edits.get(`${x},${y},${z}`) ?? (y<0?BLOCKS.STONE:(y<3?this.fluid:BLOCKS.AIR)); },
    setVoxel(x,y,z,id) { edits.set(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`,id); },
    getHeightAt(){return 0;}, getBiome(){return 'nether';}, reset(){edits.clear();}
  };
}

export function createMobDebugSession(scene, onEvent=()=>{}) {
  const world=createDebugWorld();
  const sounds=new Proxy({}, {get:()=>()=>{}});
  const entities={items:[],spawnDroppedItem(pos,id,isBlock,count=1){onEvent(`Drop: ${count} Ã— ${id}`);},spawnXpOrbs(pos,n){onEvent(`XP: ${n}`);},spawnDeathParticles(){},spawnEndermanParticles(){},spawnBlockBreakParticles(){}};
  const inventory={armor:{},hotbar:[],storage:[],active:null,
    getActiveItem(){return this.active;},getOffhandItem:()=>null,
    consumeActiveItem(n=1){if(this.active)this.active.count-=n;},
    addItem(id,isBlock,count=1){this.storage.push({id,isBlock,count});onEvent(`Received: ${count} × ${id}`);return true;},
    updateUI(){},updateHotbar(){}};
  const player={position:new THREE.Vector3(0,0,6),velocity:new THREE.Vector3(),width:.6,height:1.8,health:100,gamemode:'spectator',yaw:0,inventory,
    takeDamage(n,from,type){this.health=Math.max(0,this.health-n);onEvent(`Target hit: ${n} (${type || 'attack'})`);},hasStatusEffect:()=>false,applyStatusEffect(id){onEvent(`Target effect: ${id}`);},checkCollision:()=>false,updateCameraAndModel(){}};
  const manager=new MobManager(scene,world,sounds,entities);
  manager.game={player,inventory,difficulty:'normal',weather:{weatherType:'clear'},mechanisms:{isFeatureEnabled:()=>false}};
  let mob=null,time=0;
  return {manager,world,player,
    inventory, events:[],
    get mob(){return mob;},get time(){return time;},
    reset(type='blaze') {
      // Preview-owned resources can be released without touching shared texture maps.
      const mats=new Set();
      for(const m of manager.mobs)m.mesh.traverse(o=>{for(const mat of Array.isArray(o.material)?o.material:[o.material])if(mat)mats.add(mat);});
      manager.clearMobs();mats.forEach(m=>m.dispose());
      for(const p of manager.snowballs || []){p.mesh.removeFromParent();p.mesh.geometry.dispose();p.mesh.material.dispose();}manager.snowballs=[];
      manager.animalBehaviors.dismount(player);manager.game.controls={};inventory.active=null;inventory.storage=[];inventory.hotbar=[];
      world.reset();world.fluid=BLOCKS.AIR;world.dimension='nether';player.gamemode='spectator';player.health=100;player.position.set(0,0,6);player.velocity.set(0,0,0);time=0;
      mob=typeof type==='object'?manager.spawnCustomMob(type,0,0,0):manager.spawnMob(type,0,0,0);mob.yaw=0;mob.mesh.rotation.y=0;
      return mob;
    },
    tick(dt) {dt=Math.min(.1,Math.max(0,dt));manager.update(dt,player);time+=dt;},
    hit(amount=3){if(mob)manager.damageMob(mob,amount,player.position,false,player);},
    snapshot(){return {time:+time.toFixed(2),type:mob?.type,health:mob?.health,maxHealth:mob?.maxHealth,phase:mob?.blazePhase || mob?.state,charging:!!mob?.charging,cooldown:+(mob?.blazeTimer || 0).toFixed(2),position:mob?.mesh.position.toArray().map(n=>+n.toFixed(2)),velocity:mob?.velocity.toArray().map(n=>+n.toFixed(2)),onGround:!!mob?.onGround,rods:mob?.tiers?.reduce((n,t)=>n+t.children.length,0),smokePuffs:mob?.smoke?.children.length,liveMobs:manager.mobs.length,projectiles:manager.customProjectiles?.length || 0,targetHealth:player.health};}
  };
}
