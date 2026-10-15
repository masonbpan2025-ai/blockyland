import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, Chunk } from '../src/world.js';
import { BLOCKS as B, BLOCK_DEFS } from '../src/blocks.js';
import { endColumn, END_OUTER_RADIUS } from '../src/endTerrain.js';
import { endStateFor, captureEndState, restoreEndState, addEndGateway, useEndGateway, findOuterEndLanding, cacheEndResidents, restoreEndResidents } from '../src/endProgression.js';
import { EndItemController, chorusTeleport } from '../src/endItems.js';
import { ChorusSystem } from '../src/chorus.js';
import { BossFightManager } from '../src/bossFights.js';
import { MobManager } from '../src/mobs.js';
import { spawnArrow, updateArrows } from '../src/arrows.js';
import { endSpikes, PLATFORM } from '../src/worldgen/generators/endFeatures.js';
import { serializeWorld, deserializeWorld } from '../src/mapManager.js';
import { recordingSpawner } from './helpers/presetGenerationFixture.js';
import { captureSessionState, applySessionState } from '../src/saveSchema.js';
import { createBlockGeometry } from '../src/blockGeometry.js';
import { updateAmbientLocomotion } from '../src/ambientLocomotion.js';
import { updateSnowballs } from '../src/netherCombat.js';

function world(seed=4289) {const w=new World(seed,'the_end');w.rebuildStructures({enabledIds:[]});return w;}
function fixture(w=world()) {
  const scene=new THREE.Scene(),sounds=new Proxy({},{get:()=>()=>{}}),drops=[],xp=[];
  const entities={spawnDroppedItem(pos,id,isBlock,count){drops.push({pos,id,isBlock,count});},spawnXpOrbs(pos,count){xp.push(count);},spawnDeathParticles(){},spawnExplosion(){}};
  const player={position:new THREE.Vector3(0,33,0),velocity:new THREE.Vector3(),yaw:0,pitch:0,health:20,hunger:20,gamemode:'survival',eyeHeight:1.62,
    eatFood(n){this.eaten=(this.eaten??0)+n;},takeDamage(n){this.health-=n;},update(){},statusEffects:new Map()};
  const inventory={hotbar:Array(9).fill(null),storage:Array(27).fill(null),activeSlot:0,getActiveItem(){return this.active;},consumeActiveItem(){this.used=(this.used??0)+1;},addItem(id){this.received=id;return true;}};
  const ui={setBossBar(){},removeBossBar(){},updateHotbar(){},updateStats(){},addChatMessage(){}};
  const manager=Object.assign(Object.create(MobManager.prototype),{world:w,scene,sounds,entities,mobs:[],arrows:[],customProjectiles:[],ui});
  const game={world:w,scene,player,inventory,entities,ui,mobs:manager,sounds,difficulty:'normal',worldTime:6000,currentDimension:w.dimension,
    camera:{getWorldDirection:v=>v.set(0,-.15,-1).normalize(),quaternion:{setFromEuler(){}}},loadChunksAroundPlayer(){},rebuildChunkMesh(){}};
  manager.game=game;w.game=game;
  game.bossManager=new BossFightManager(manager,w,sounds,ui,entities);game.bossManager.game=game;
  return{w,game,manager,player,inventory,boss:game.bossManager,drops,xp};
}

test('entering End from an Overworld world selects End terrain and leaving selects Overworld again',()=>{
  const w=new World(42,'plains');w.switchDimension('the_end');
  w.getOrCreateChunk(0,0);assert.equal(w.getBiome(10,0),'the_end');assert.equal(w.getVoxel(10,28,0),B.END_STONE);
  w.switchDimension('overworld');assert.equal(w.getBiome(10,0),'plains');assert.equal(w.seaLevel,22);
  const end=new World(42,'the_end');end.switchDimension('overworld');assert.notEqual(end.getBiome(10,0),'the_end');assert.equal(end.seaLevel,22);
});

test('the central island, kilometre void separation and four outer habitats are real terrain',()=>{
  const w=world();const biomes=new Set();
  assert.equal(endColumn(w,0,0).top,32);
  for(const radius of [100,300,600,950])for(let a=0;a<6;a++)assert.equal(endColumn(w,Math.floor(Math.cos(a)*radius),Math.floor(Math.sin(a)*radius)).top,0);
  for(let x=1050;x<2600;x+=24)for(let z=-800;z<800;z+=24)biomes.add(w.getBiome(x,z));
  for(const biome of ['end_highlands','end_midlands','end_barrens','small_end_islands'])assert.ok(biomes.has(biome),biome);
  w.getOrCreateChunk(32,0);assert.ok(w.getChunk(32,0).voxels.every(id=>id===B.AIR));
});

test('new End worlds enable actual spikes, cages, inactive podium and arrival platform',()=>{
  const w=new World(4289,'the_end');
  for(const id of ['end_spike','end_podium','end_platform','end_city'])assert.ok(w.structures.enabledIds.includes(id));
  for(const spike of endSpikes(w.seed)) {
    w.getOrCreateChunk(Math.floor(spike.x/16),Math.floor(spike.z/16));
    assert.equal(w.getVoxel(spike.x,spike.top,spike.z),B.BEDROCK);
    assert.equal(w.getVoxel(spike.x,spike.top-1,spike.z),B.OBSIDIAN);
  }
  w.getOrCreateChunk(0,0);assert.equal(w.getVoxel(0,33,0),B.BEDROCK);assert.equal(w.getVoxel(1,33,0),B.AIR);
  w.getOrCreateChunk(6,0);assert.equal(w.getVoxel(PLATFORM.x,PLATFORM.y,0),B.OBSIDIAN);
  assert.equal(w.getVoxel(PLATFORM.x,PLATFORM.y+1,0),B.AIR);
});

test('outer island and branching chorus generation are independent of chunk order',()=>{
  const a=world(),b=world(),landing=findOuterEndLanding(a,1350,0);
  const cx=Math.floor(landing.x/16),cz=Math.floor(landing.z/16),positions=[];
  for(let x=cx-2;x<=cx+2;x++)for(let z=cz-2;z<=cz+2;z++)positions.push([x,z]);
  for(const p of positions)a.getOrCreateChunk(...p);for(const p of [...positions].reverse())b.getOrCreateChunk(...p);
  let flowers=0;for(const p of positions){assert.deepEqual(a.getChunk(...p).voxels,b.getChunk(...p).voxels);flowers+=a.getChunk(...p).voxels.filter(id=>id===B.CHORUS_FLOWER).length;}
  assert.ok(flowers>0);
});

test('Endermen spawn on real exposed End islands during Overworld daytime',()=>{
  const w=world(),f=recordingSpawner(w);f.game.player.gamemode='survival';f.game.player.position={x:0,y:33,z:0};
  for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++)w.getOrCreateChunk(x,z);
  f.manager.naturalSpawner.budgetMs=Infinity;
  for(let i=0;i<200;i++)f.manager.update(.05);
  assert.equal(w.getSkyLight(10,40,10),0);assert.ok(f.mobs.mobs.length>=3);assert.ok(f.mobs.mobs.every(m=>m.type==='enderman'));
});

test('real End city starts are on outer islands with loot and resident shulkers',()=>{
  const w=new World(4289,'the_end'),spawns=[];
  w.game={mobs:{spawnMob(type){spawns.push(type);return{};}}};
  const found=w.structures.engine.locate('end_city',1300,0,{maxRadiusChunks:128});assert.ok(found);
  assert.ok(Math.hypot(found.chunk[0]*16,found.chunk[1]*16)>=END_OUTER_RADIUS);
  const needed=new Set([found.chunk.join(',')]);
  w.structures.engine.realize(found.start,(x,y,z,id,meta)=>{if(meta?.lootTable)needed.add(`${Math.floor(x/16)},${Math.floor(z/16)}`);return true;});
  for(const request of found.start.entities??[])needed.add(`${Math.floor(request.x/16)},${Math.floor(request.z/16)}`);
  for(const key of needed)w.getOrCreateChunk(...key.split(',').map(Number));
  assert.ok(w.structures.loot.length>0);assert.ok(w.structures.spawns.some(m=>m.type==='shulker')||spawns.includes('shulker'));
});

test('managed dragon moves once, heals from one crystal and retains its fight on re-entry',()=>{
  const {boss,manager,w,player}=fixture();boss.initEndArena();const dragon=boss.enderDragon;
  dragon.health=100;boss.endCrystals[0].position.set(0,48,1);boss.endCrystals[1].position.set(0,48,2);
  const start=dragon.mesh.position.clone(),timer=dragon.phaseTimer;
  manager.updateMobTypeBehavior(dragon,.1,player,30);boss.update(.1,player);
  assert.ok(dragon.mesh.position.distanceTo(start)>0);assert.ok(Math.abs(dragon.health-100.2)<1e-6);assert.ok(Math.abs(timer-dragon.phaseTimer-.1)<1e-6);
  boss.destroyEndCrystal(boss.endCrystals[0]);assert.equal(endStateFor(w).crystals[0],false);
  const health=dragon.health;endStateFor(w).health=health;
  boss.initEndArena();assert.equal(manager.mobs.filter(m=>m.type==='ender_dragon').length,1);
  assert.equal(boss.enderDragon.health,health);assert.equal(boss.endCrystals.filter(c=>c.spikeIndex===0).length,0);
});

test('arrows destroy real encounter crystals and are removed after the collision',()=>{
  const {boss,game,manager,player}=fixture();boss.initEndArena();boss.endCrystals[0].position.set(0,40,0);
  spawnArrow(manager,new THREE.Vector3(0,40,4),new THREE.Vector3(0,0,-1),'player',{speed:30});
  updateArrows(manager,.25,player);assert.equal(boss.endCrystals[0].alive,false);assert.equal(manager.arrows.length,0);
  assert.equal(game.world.endState.crystals[0],false);
});

test('first victory awards XP once, opens exit and gateway; a saved defeated End never respawns a dragon',()=>{
  const {boss,w,player,xp,manager}=fixture();boss.initEndArena();boss.enderDragon.health=0;
  boss.update(.05,player);boss.update(.05,player);
  assert.deepEqual(xp,[12000]);assert.equal(endStateFor(w).kills,1);assert.equal(w.getVoxel(1,33,0),B.END_PORTAL);assert.equal(w.getVoxel(0,37,0),B.DRAGON_EGG);
  const saved=captureEndState(w);w.setVoxel(0,37,0,B.AIR);restoreEndState(w,saved);boss.initEndArena();
  assert.equal(boss.enderDragon,null);assert.equal(manager.mobs.filter(m=>m.type==='ender_dragon').length,0);assert.deepEqual(xp,[12000]);assert.equal(w.getVoxel(0,37,0),B.AIR);
});

test('four correctly placed crystals restore the spikes and a repeat dragon awarding 500 XP',()=>{
  const {boss,w,player,xp}=fixture();boss.initEndArena();boss.enderDragon.health=0;boss.update(.05,player);
  for(const [x,z]of [[3,0],[-3,0],[0,3],[0,-3]])assert.equal(boss.placeEndCrystal(x,34,z),true);
  assert.equal(w.endState.respawning,true);boss.update(29,player);assert.equal(boss.enderDragon,null);
  boss.update(1.1,player);assert.ok(boss.enderDragon);assert.equal(boss.enderDragon.health,200);assert.equal(boss.endCrystals.filter(c=>c.alive).length,10);
  boss.enderDragon.health=0;boss.update(.05,player);assert.deepEqual(xp,[12000,500]);assert.equal(w.endState.kills,2);
});

test('destroying a ritual crystal aborts the summon and restores the exit',()=>{
  const {boss,w,player}=fixture();boss.initEndArena();boss.enderDragon.health=0;boss.update(.05,player);
  for(const [x,z]of [[3,0],[-3,0],[0,3],[0,-3]])boss.placeEndCrystal(x,34,z);
  boss.destroyEndCrystal(boss.endCrystals.find(c=>c.placed));assert.equal(w.endState.respawning,false);assert.equal(w.getVoxel(1,33,0),B.END_PORTAL);
});

test('gateways cross the void, create a counterpart, return safely and respect their cooldown',()=>{
  const {game,w,player}=fixture();const gate=addEndGateway(w,96,40,0);
  const before=w.chunks.size;assert.equal(useEndGateway(game,gate.x,gate.y,gate.z),true);assert.ok(Math.hypot(player.position.x,player.position.z)>1024);
  assert.ok(w.chunks.size-before<16,'search does not generate the entire void corridor');
  const peer=w.endState.gateways.find(g=>g.x!==96);assert.ok(peer);assert.equal(w.getVoxel(peer.x,peer.y,peer.z),B.END_GATEWAY);
  assert.equal(useEndGateway(game,peer.x,peer.y,peer.z),false);game.endGatewayCooldown=0;
  assert.equal(useEndGateway(game,peer.x,peer.y,peer.z),true);assert.equal(player.position.x,96.5);assert.equal(player.position.y,43);
});

test('chorus fruit works at full hunger, teleports over solid ground, resets falling and has a cooldown',()=>{
  const {game,w,inventory,player}=fixture();w.getOrCreateChunk(0,0);player.position.set(8,34,8);player.fallDistance=20;
  inventory.active={id:'chorus_fruit',isBlock:false};const items=new EndItemController(game,{random:()=>.5});
  assert.equal(items.use(),true);assert.equal(inventory.used,1);assert.equal(player.eaten,4);assert.equal(player.fallDistance,0);
  items.use();assert.equal(inventory.used,1);
  const blocked={getVoxel:()=>B.STONE};assert.equal(chorusTeleport(blocked,new THREE.Vector3(8,30,8),()=>.5),null);
});

test('a pearl flies before landing, teleports on impact, damages once and can reach a gateway',()=>{
  const {game,w,inventory,player}=fixture();w.getOrCreateChunk(0,0);player.position.set(8,34,8);inventory.active={id:'ender_pearl',isBlock:false};
  game.camera.getWorldDirection=v=>v.set(0,-.4,-1).normalize();const items=new EndItemController(game,{random:()=>.99});
  items.use();assert.equal(items.pearls.length,1);assert.equal(inventory.used,1);const start=player.position.clone();
  items.update(.1);assert.ok(player.position.equals(start));
  for(let i=0;i<60&&items.pearls.length;i++)items.update(1/60);
  assert.equal(items.pearls.length,0);assert.ok(player.position.distanceTo(start)>1);assert.equal(player.health,15);
  const gate=addEndGateway(w,8,40,0);player.position.set(8.5,38.88,4);items.pearlCooldown=0;
  game.camera.getWorldDirection=v=>v.set(0,0,-1);items.use();for(let i=0;i<30&&items.pearls.length;i++)items.update(1/60);
  assert.ok(player.position.x>1024 || Math.abs(player.position.z)>1024);
});

test('a planted chorus flower grows, branches, matures, saves age and collapses with fruit but no flowers',()=>{
  const w=world();w.chunks.clear();w.chunks.set(w.chunkKey(0,0),new Chunk(0,0));w.invalidateChunkCache();
  w.setVoxel(8,2,8,B.END_STONE);w.setVoxel(8,3,8,B.CHORUS_FLOWER);
  const system=new ChorusSystem(w,{random:()=>0});system.register(8,3,8,0);system.tick(8,3,8);
  assert.equal(w.getVoxel(8,3,8),B.CHORUS_PLANT);assert.equal(w.getVoxel(8,4,8),B.CHORUS_FLOWER);
  for(let y=4;y<7;y++)system.tick(8,y,8);
  const flowers=[...system.flowers.values()].filter(p=>w.getVoxel(p.x,p.y,p.z)===B.CHORUS_FLOWER);
  assert.ok(flowers.some(p=>p.x!==8||p.z!==8),'horizontal branching');
  const data=w.serializeOrientations();w.structureOrientations.clear();w.restoreOrientations(data);assert.ok(w.structureOrientations.size>0);
  const drops=[];w.game={entities:{spawnDroppedItem(...args){drops.push(args);}}};
  const oldRandom=Math.random;Math.random=()=>0;try{w.setVoxel(8,2,8,B.AIR);}finally{Math.random=oldRandom;}
  assert.equal(w.getVoxel(8,3,8),B.AIR);assert.ok(drops.some(d=>d[1]==='chorus_fruit'));assert.ok(drops.every(d=>d[1]!==B.CHORUS_FLOWER));
});

test('breath projectiles create one finite cloud; bottles collect the actual live cloud',()=>{
  const {boss,manager,game,inventory,player}=fixture();player.position.set(4,33,4);
  boss.shootDragonBreathFireball(new THREE.Vector3(4,34,4),player.position);boss.updateDragonBreath(.1,player);
  assert.equal(manager.customProjectiles.length,0);assert.equal(boss.dragonBreathClouds.length,1);
  inventory.active={id:'glass_bottle',isBlock:false};const items=new EndItemController(game);assert.equal(items.use(),true);assert.equal(inventory.received,'dragon_breath');
  boss.updateDragonBreath(9,player);assert.equal(boss.dragonBreathClouds.length,0);
});

test('city residents and encounter progress persist through departure and real map save/load',()=>{
  const {boss,w,game,manager}=fixture();
  w.switchDimension('overworld');w.setVoxel(2,7,2,B.DIAMOND_BLOCK);w.structureOrientations.set('2,7,2',{x:2,y:7,z:2,id:B.DIAMOND_BLOCK,facing:'north'});
  w.switchDimension('the_end');w.setVoxel(2,7,2,B.END_STONE);game.currentDimension='the_end';boss.initEndArena();
  const shulker=manager.spawnMob('shulker',12,33,12);shulker.health=11;cacheEndResidents(game);
  const before=manager.mobs.length;manager.mobs=manager.mobs.filter(m=>m.type!=='shulker');restoreEndResidents(game);assert.equal(manager.mobs.length,before);assert.equal(manager.mobs.find(m=>m.type==='shulker').health,11);
  boss.enderDragon.health=0;boss.update(.05,game.player);
  const map=serializeWorld(game,'End audit');const restored=fixture(new World(99,'plains'));deserializeWorld(restored.game,map);
  assert.equal(restored.w.dimension,'the_end');assert.equal(restored.w.endState.defeated,true);assert.equal(restored.boss.enderDragon,null);
  assert.equal(restored.w.getVoxel(2,7,2),B.END_STONE);restored.w.switchDimension('overworld');assert.equal(restored.w.getVoxel(2,7,2),B.DIAMOND_BLOCK);assert.equal(restored.w.structureOrientations.get('2,7,2').facing,'north');
});

test('session state stores End progression without scene objects and a new seed clears it',()=>{
  const {w,game}=fixture();endStateFor(w).kills=4;const saved=captureSessionState(game);assert.doesNotThrow(()=>JSON.stringify(saved));
  const fresh=fixture();applySessionState(fresh.game,saved);assert.equal(fresh.w.endState.kills,4);
  fresh.w.reseed(999,'the_end');assert.equal(endStateFor(fresh.w).kills,0);
});

test('mature chorus flower model uses its dead texture while young flowers use their live texture',()=>{
  const seen=[],tm={getFaceUVs(name){seen.push(name);return{u0:0,v0:0,u1:1,v1:1};}};
  createBlockGeometry(B.CHORUS_FLOWER,tm,{plantAge:5});assert.ok(seen.every(n=>n==='chorus_flower_dead.png'));
  seen.length=0;createBlockGeometry(B.CHORUS_FLOWER,tm,{plantAge:0});assert.ok(seen.every(n=>n==='chorus_flower.png'));
});

test('shulkers respect walls, Peaceful, Creative, Spectator and dead players',()=>{
  const {manager,game,player}=fixture();const mob=manager.spawnMob('shulker',0,33,0);player.position.set(0,33,5);
  let shots=0;const fire=()=>shots++;
  for(const mode of ['creative','spectator']){player.gamemode=mode;updateAmbientLocomotion(manager,mob,2,player,{fire});}
  player.gamemode='survival';player.isDead=true;updateAmbientLocomotion(manager,mob,2,player,{fire});player.isDead=false;
  game.difficulty='peaceful';updateAmbientLocomotion(manager,mob,2,player,{fire});game.difficulty='normal';
  manager.isBlockSolid=(x,y,z)=>z===2;updateAmbientLocomotion(manager,mob,2,player,{fire});assert.equal(shots,0);
  manager.isBlockSolid=()=>false;updateAmbientLocomotion(manager,mob,2,player,{fire});assert.equal(shots,1);assert.equal(mob.persistenceRequired,true);
});

test('the dragon survives Peaceful and a save at zero health resolves one defeat',()=>{
  const {boss,manager,w,xp}=fixture();boss.initEndArena();assert.equal(boss.enderDragon.survivesPeaceful,true);assert.equal(boss.enderDragon.persistenceRequired,true);
  endStateFor(w).health=0;boss.initEndArena();assert.equal(boss.enderDragon,null);assert.deepEqual(xp,[12000]);
  boss.initEndArena();assert.deepEqual(xp,[12000]);assert.equal(manager.mobs.filter(m=>m.type==='ender_dragon').length,0);
});

test('crystals cannot be punched through solid walls or beyond melee reach',()=>{
  const {boss,manager}=fixture();const c=boss.spawnEndCrystal(0,40,5);
  manager.isBlockSolid=(x,y,z)=>z===2;
  assert.equal(boss.checkCrystalHit(new THREE.Vector3(0,40,0),new THREE.Vector3(0,0,1)),false);assert.equal(c.alive,true);
  manager.isBlockSolid=()=>false;
  assert.equal(boss.checkCrystalHit(new THREE.Vector3(0,40,-3),new THREE.Vector3(0,0,1)),false);
  assert.equal(boss.checkCrystalHit(new THREE.Vector3(0,40,0),new THREE.Vector3(0,0,1)),true);
});

test('arrows and snowballs harvest chorus flowers as items',()=>{
  for(const projectile of ['arrow','snowball']){
    const {w,manager,player,drops}=fixture();w.chunks.set(w.chunkKey(0,0),new Chunk(0,0));w.invalidateChunkCache();
    w.setVoxel(8,39,8,B.CHORUS_PLANT);w.setVoxel(8,40,8,B.CHORUS_FLOWER);
    if(projectile==='arrow'){spawnArrow(manager,new THREE.Vector3(8.5,40.5,10),new THREE.Vector3(0,0,-1),'player',{speed:20});updateArrows(manager,.15,player);}
    else {const mesh=new THREE.Mesh(new THREE.SphereGeometry(.1),new THREE.MeshBasicMaterial());mesh.position.set(8.5,40.5,10);manager.snowballs=[{mesh,velocity:new THREE.Vector3(0,0,-20),life:5,owner:player}];updateSnowballs(manager,.15);}
    assert.equal(w.getVoxel(8,40,8),B.AIR);assert.ok(drops.some(d=>d.id===B.CHORUS_FLOWER&&d.isBlock));
  }
});

test('End portal renders as a thin luminous starfield surface, not a Nether cube',()=>{
  const def=BLOCK_DEFS[B.END_PORTAL];assert.equal(def.solid,false);assert.equal(def.light,15);assert.equal(def.textures.all,'end_gateway.png');
  const geometry=createBlockGeometry(B.END_PORTAL,{getFaceUVs:()=>({u0:0,v0:0,u1:1,v1:1})});geometry.computeBoundingBox();
  assert.ok(geometry.boundingBox.max.y-geometry.boundingBox.min.y<.01);
});

test('malformed resident state is ignored and chorus teleport rejects submerged heads',()=>{
  const w=world();assert.doesNotThrow(()=>restoreEndState(w,{seed:w.seed,residents:{bad:true}}));assert.deepEqual(w.endState.residents,[]);
  const wet={getVoxel:(x,y)=>y<10?B.END_STONE:y===11?B.WATER:B.AIR};
  assert.equal(chorusTeleport(wet,new THREE.Vector3(8,10,8),()=>.5),null);
});

test('Wither skull updates continue outside the End',()=>{
  const {w,boss,player}=fixture();w.switchDimension('overworld');let ticks=0;boss.updateWitherSkulls=()=>ticks++;
  boss.update(.1,player);assert.equal(ticks,1);
});
