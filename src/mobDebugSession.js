import { isSquid } from './squidBehavior.js';
import { isKillerBunny } from './rabbitBehavior.js';
import * as THREE from 'three';
import { MobManager } from './mobs.js';
import { BLOCKS } from './blocks.js';

export const DEBUG_MOBS = 'blaze magma_cube ghast piglin zombified_piglin hoglin zoglin strider wither_skeleton zombie skeleton creeper spider cave_spider silverfish endermite rabbit bat fox bee goat llama turtle frog tadpole parrot armadillo husk stray bogged breeze sniffer allay wandering_trader trader_llama camel parched creaking killer_bunny snow_golem illusioner skeleton_horse zombie_horse pufferfish tropical_fish giant piglin_brute camel_husk pig cow sheep chicken horse donkey mule wolf cat ocelot villager iron_golem pillager ravager witch slime enderman shulker guardian elder_guardian drowned cod salmon squid glow_squid dolphin axolotl mooshroom polar_bear panda warden phantom vindicator evoker vex ender_dragon wither tournament_host site_manager jackie_chun'.split(' ');

// An infinite flat floor and sparse edits: no chunks, map generator or saved worlds.
export function createDebugWorld() {
  const edits = new Map();
  return {
    edits, dimension:'nether', selectedBiome:'nether', fluid:BLOCKS.AIR,
    getVoxel(x,y,z) { x=Math.floor(x);y=Math.floor(y);z=Math.floor(z);return edits.get(`${x},${y},${z}`) ?? (y<0?BLOCKS.STONE:(y<3?this.fluid:BLOCKS.AIR)); },
    setVoxel(x,y,z,id) { edits.set(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`,id); },
    getHeightAt(){return 0;}, getBiome(){return 'nether';}, reset(){edits.clear();}
  };
}

export function createMobDebugSession(scene, onEvent=()=>{}) {
  const world=createDebugWorld();
  const sounds=new Proxy({}, {get:()=>()=>{}});
  const entities={items:[],drops:[],xp:0,spawnDroppedItem(pos,id,isBlock,count=1){this.drops.push({id,isBlock,count});onEvent(`Drop: ${count} × ${id}`);},spawnXpOrbs(pos,n){this.xp+=n;onEvent(`XP: ${n}`);},spawnDeathParticles(){},spawnEndermanParticles(){},spawnBlockBreakParticles(){}};
  const inventory={armor:{},hotbar:[],storage:[],active:null,
    getActiveItem(){return this.active;},getOffhandItem:()=>null,
    consumeActiveItem(n=1){if(this.active)this.active.count-=n;},
    addItem(id,isBlock,count=1){this.storage.push({id,isBlock,count});onEvent(`Received: ${count} x ${id}`);return true;},
    updateUI(){},updateHotbar(){}};
  const player={position:new THREE.Vector3(0,0,6),velocity:new THREE.Vector3(),width:.6,height:1.8,health:100,gamemode:'spectator',yaw:0,inventory,
    // Counted so a scenario can tell that damage landed even if the target healed
    // afterwards, which would otherwise look like nothing happened.
    damageEvents:0,statusEffects:{},isBlocking:false,
    takeDamage(n,from,type){if(this.isBlocking || (this.hasStatusEffect('fire_resistance') && ['fire','burn','blaze_fireball'].includes(type)))return;this.damageEvents++;this.health=Math.max(0,this.health-n);onEvent(`Target hit: ${n} (${type || 'attack'})`);},hasStatusEffect(id){return !!this.statusEffects[id];},applyStatusEffect(id){this.statusEffects[id]=true;onEvent(`Target effect: ${id}`);},checkCollision:()=>false,updateCameraAndModel(){}};
  const manager=new MobManager(scene,world,sounds,entities);
  manager.game={player,inventory,difficulty:'normal',weather:{weatherType:'clear'},mechanisms:{isFeatureEnabled:()=>false}};
  let mob=null,time=0;
  return {manager,world,player,
    inventory, entities, events:[],
    get mob(){return mob;},get time(){return time;},
    reset(type='blaze') {
      // Preview-owned resources can be released without touching shared texture maps.
      const mats=new Set();
      for(const m of manager.mobs)m.mesh.traverse(o=>{for(const mat of Array.isArray(o.material)?o.material:[o.material])if(mat)mats.add(mat);});
      manager.clearMobs();mats.forEach(m=>m.dispose());
      for(const p of manager.snowballs || []){p.mesh.removeFromParent();p.mesh.geometry.dispose();p.mesh.material.dispose();}manager.snowballs=[];
      manager.animalBehaviors.dismount(player);manager.game.controls={};inventory.active=null;inventory.storage=[];inventory.hotbar=[];
      entities.drops=[];entities.xp=0;player.statusEffects={};player.isBlocking=false;player.isOnFire=false;player.fireTicks=0;manager.game.difficulty='normal';manager.game.isDaytime=false;manager.random=()=>.5;
      manager.game.weather.weatherType='clear';
      world.reset();world.fluid=BLOCKS.AIR;world.dimension='nether';player.damageEvents=0;player.gamemode='spectator';player.health=100;player.keys={};player.position.set(0,0,6);player.velocity.set(0,0,0);time=0;
      mob=typeof type==='object'?manager.spawnCustomMob(type,0,0,0):manager.spawnMob(type,0,0,0);mob.yaw=0;mob.mesh.rotation.y=0;
      if(isSquid(mob)){world.fluid=BLOCKS.WATER;world.dimension='overworld';mob.mesh.position.y=1.2;mob.inWater=true;}
      return mob;
    },
    tick(dt) {dt=Math.min(.1,Math.max(0,dt));manager.update(dt,player);time+=dt;},
    hit(amount=3){if(mob)manager.damageMob(mob,amount,player.position,false,player);},
    snapshot(){return {chested:mob?.hasChest,cargoStacks:mob?.chestInventory?.filter(Boolean).length,leftHanded:mob?.leftHanded,fleeingWolf:mob?.fleeingWolf,seekingShade:mob?.seekingShade,witherSeconds:mob?.witherEffect?.duration,creditSeconds:mob?.type==='wither_skeleton'?mob.creditSeconds:undefined,darkSeconds:mob?.darkSeconds,glowing:mob?.isGlowSquid?!(mob.darkSeconds>0):undefined,drySeconds:mob?.drySeconds,inkBursts:mob?.inkBursts,glowParticles:mob?.glowParticles,weapon:mob?.weapon,anger:mob?.angerTimer===undefined?undefined:+mob.angerTimer.toFixed(2),target:mob?.target?.type || (mob?.target===player?'player':undefined),spearPhase:mob?.spearPhase,leader:mob?.isLeader,pickup:mob?.canPickUpLoot,equipment:mob?.equipment?Object.values(mob.equipment).map(i=>i.id).join(', '):undefined,jockey:mob?.jockeyMount?.type,cold:mob?.isCold,inLava:mob?.inLava,inWater:mob?.inWater,boostSeconds:mob?.boostRemaining,ageLocked:mob?.ageLocked,babyGrowthSeconds:mob?.babyGrowthTimer,passenger:mob?.rider?.type,shotsFired:mob?.shotsFired || 0,freezeTime:mob?.freezeTime || 0,coat:mob?.coat,marking:mob?.marking,woolColor:mob?.type==='sheep'?mob.woolColor:undefined,sheared:mob?.type==='sheep'?!!mob.isSheared:undefined,woolVisible:mob?.woolMesh?.visible,variant:mob?.type==='mooshroom'?mob.variant:undefined,stewEffect:mob?.type==='mooshroom'?(mob.stewEffect?.effect ?? null):undefined,mushrooms:mob?.mushroomMeshes?.filter(m=>m.visible).length,salmonSize:mob?.type==='salmon'?mob.size:undefined,moistness:mob?.type==='dolphin'?+(mob.moistness??0).toFixed(1):undefined,gotFish:mob?.type==='dolphin'?!!mob.gotFish:undefined,carriedBlock:mob?.type==='enderman'?(mob.carriedBlock??null):undefined,cubeSize:(mob?.type==='slime'||mob?.type==='magma_cube')?mob.slimeSize:undefined,wolfArmor:mob?.type==='wolf'?(mob.wolfArmor??null):undefined,spiderAnger:(mob?.type==='spider'||mob?.type==='cave_spider')?+(mob.angerTimer??0).toFixed(2):undefined,climbing:(mob?.type==='spider'||mob?.type==='cave_spider')?!!mob.isClimbing:undefined,silverfishAnger:mob?.type==='silverfish'?+(mob.angerTimer??0).toFixed(2):undefined,rabbitType:mob?.type==='rabbit'?mob.rabbitType:undefined,killerBunny:mob?.type==='rabbit'?isKillerBunny(mob):undefined,retreatSeconds:mob?.type==='rabbit'?+(mob.retreatTimer??0).toFixed(2):undefined,hanging:mob?.type==='bat'?!!mob.isHanging:undefined,batFleeing:mob?.type==='bat'?!!mob.isFleeing:undefined,foxCoat:mob?.type==='fox'?mob.coat:undefined,heldItem:mob?.type==='fox'?(mob.heldItem??null):undefined,sleeping:mob?.type==='fox'?!!mob.isSleeping:undefined,trusted:mob?.type==='fox'?!!mob.trustedPlayer:undefined,pounce:mob?.type==='fox'?(mob.pouncePhase??null):undefined,beeAnger:mob?.type==='bee'?+(mob.angerTimer??0).toFixed(2):undefined,hasStung:mob?.type==='bee'?!!mob.hasStung:undefined,hasNectar:mob?.type==='bee'?!!mob.hasNectar:undefined,goatScreaming:mob?.type==='goat'?!!mob.isScreamingGoat:undefined,goatRam:mob?.type==='goat'?(mob.ramState??null):undefined,goatHorns:mob?.type==='goat'?((mob.hasLeftHorn?1:0)+(mob.hasRightHorn?1:0)):undefined,goatHornVariant:mob?.type==='goat'?mob.hornVariant:undefined,goatJumping:mob?.type==='goat'?!!mob.isGoatJumping:undefined,llamaVariant:mob?.type==='llama'?mob.variant:undefined,llamaStrength:mob?.type==='llama'?mob.strength:undefined,llamaSlots:mob?.type==='llama'?mob.chestSlots:undefined,llamaChest:mob?.type==='llama'?!!mob.hasChest:undefined,llamaSpitting:mob?.type==='llama'?!!mob.pendingSpitTarget:undefined,llamaSpits:mob?.type==='llama'?(manager?.llamaSpits?.length??0):undefined,turtleHasEgg:mob?.type==='turtle'?!!mob.hasEgg:undefined,turtleInWater:mob?.type==='turtle'?!!mob.inWater:undefined,turtleState:mob?.type==='turtle'?(mob.state??null):undefined,frogVariant:mob?.type==='frog'?mob.variant:undefined,frogInWater:mob?.type==='frog'?!!mob.inWater:undefined,frogTongue:mob?.type==='frog'?!!mob.tongueTarget:undefined,tadpoleInWater:mob?.type==='tadpole'?!!mob.inWater:undefined,tadpoleDry:+(mob?.type==='tadpole'?(mob.drySeconds??0):0).toFixed(2),tadpoleGrowth:+(mob?.type==='tadpole'?(mob.growthTimer??0):0).toFixed(0),allayHeld:mob?.type==='allay'?(mob.heldItem??null):undefined,allayCarrying:+(mob?.type==='allay'?(mob.carriedCount??0):0),allayDancing:mob?.type==='allay'?!!mob.isDancing:undefined,snifferDig:mob?.type==='sniffer'?(mob.digState??null):undefined,snifferBaby:mob?.type==='sniffer'?!!mob.isBaby:undefined,armadilloState:mob?.type==='armadillo'?(mob.rollState??null):undefined,armadilloScute:+(mob?.type==='armadillo'?(mob.scuteTimer??0):0).toFixed(1),pandaPersonality:mob?.type==='panda'?(mob.personality??null):undefined,pandaMainGene:mob?.type==='panda'?(mob.mainGene??null):undefined,pandaHiddenGene:mob?.type==='panda'?(mob.hiddenGene??null):undefined,phantomState:mob?.type==='phantom'?(mob.state??null):undefined,phantomSwoop:mob?.type==='phantom'?(mob.swoopState??null):undefined,phantomBurning:mob?.type==='phantom'?!!mob.isBurning:undefined,phantomTarget:!!mob?.target,parrotVariant:mob?.type==='parrot'?mob.variantName:undefined,parrotTamed:mob?.type==='parrot'?!!mob.isTamed:undefined,parrotSitting:mob?.type==='parrot'?!!mob.isSitting:undefined,parrotShoulder:mob?.type==='parrot'?(mob.perchedOn??null):undefined,parrotDancing:mob?.type==='parrot'?!!mob.isDancing:undefined,parrotImitating:mob?.type==='parrot'?(mob.imitating??null):undefined,lifetime:mob?.type==='endermite'?+(mob.lifetime??0).toFixed(1):undefined,endermanTarget:mob?.type==='endermite'?!!mob.endermanTarget:undefined,temper:mob?.temper,tamed:mob?.isTamed,saddled:mob?.isSaddled,movementSpeed:mob?.movementSpeed,jumpStrength:mob?.jumpStrength,jumpCharge:mob?.jumpCharge,baby:mob?.isBaby,love:mob?.inLove,armor:mob?.horseArmor,time:+time.toFixed(2),type:mob?.type,health:mob?.health,maxHealth:mob?.maxHealth,phase:mob?.blazePhase || mob?.state,charging:!!mob?.charging,cooldown:+(mob?.blazeTimer || 0).toFixed(2),position:mob?.mesh.position.toArray().map(n=>+n.toFixed(2)),velocity:mob?.velocity.toArray().map(n=>+n.toFixed(2)),onGround:!!mob?.onGround,rods:mob?.tiers?.reduce((n,t)=>n+t.children.length,0),smokePuffs:mob?.smoke?.children.length,liveMobs:manager.mobs.length,projectiles:manager.customProjectiles?.length || 0,targetHealth:player.health};}
  };
}
