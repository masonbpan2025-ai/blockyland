import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMobDebugSession } from '../src/mobDebugSession.js';
import { mobScenarios, MobShowcase } from '../src/mobShowcase.js';
import { createPackEquineModel, syncPackEquineAppearance } from '../src/packEquineModel.js';
import { packEquineStats, chestSlots, storePackItem, takePackItem, clickPackSlot, canSpawnDonkey, updateDonkeySpawning } from '../src/packEquine.js';
import { HORSE_FOODS, serializeHorse, restoreHorse, updateHorse } from '../src/horseBehavior.js';
import { usePackItem as use } from '../src/packEquineScenarios.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import { mobBounds } from '../src/mobPlayerCollision.js';
import { Inventory } from '../src/inventory.js';
import { renderHorseInventory } from '../src/horseInventory.js';
import { RailSystem } from '../src/rails.js';
import { EntityManager } from '../src/entities.js';
import { updatePackEquine } from '../src/packEquine.js';

const session=type=>{const s=createMobDebugSession(new THREE.Scene());s.reset(type);return s;};
const tick=(s,seconds)=>{for(let t=0;t<seconds-1e-9;t+=1/60)s.tick(1/60);};
// A scenario steps as MobShowcase steps it: its update hook (if any), then the session.
const run=(s,c)=>{for(let t=0;t<c.duration-1e-9;t+=1/60){c.update?.(s,t,1/60);s.tick(1/60);}};
for(const type of ['donkey','mule']) {
  for(const c of mobScenarios(type))test(`inspector ${type}: ${c.id}`,()=>{
    const s=session(type);s.startPosition=s.mob.mesh.position.clone();c.setup(s);run(s,c);assert.ok(c.check(s),c.label);assert.equal(s.manager.brokenMobs.has(s.mob),false);
  });
  test(`${type} showcase resets and completes every case`,()=>{
    const s=session(type),show=new MobShowcase(s);show.start(type);
    for(let n=0;n<10000&&show.running;n++)show.tick(1/60);
    assert.equal(show.running,false);assert.equal(show.results.length,mobScenarios(type).length);assert.ok(show.results.every(r=>r.status==='observed'),JSON.stringify(show.results.filter(r=>r.status!=='observed')));
  });
  test(`${type} spawn health is randomized and speed/jump are fixed`,()=>{
    for(const r of [0,.5,.999999]) {const stats=packEquineStats(()=>r);assert.equal(stats.maxHealth,r===0?15:r===.5?23:30);assert.equal(stats.movementSpeed,.175);assert.equal(stats.jumpStrength,.5);assert.equal(stats.temper,0);}
    const s=session(type);assert.equal(s.mob.health,s.mob.maxHealth);assert.equal(s.mob.isTamed,false);
  });
  test(`${type} equipment visible only on adults and no horse armor slot`,()=>{
    const s=session(type),m=s.mob;m.isTamed=true;use(s,'saddle');use(s,'chest');assert.ok(m.saddleMesh.visible&&m.chestMesh.visible);assert.equal(m.armorMesh,undefined);
    m.isBaby=true;syncPackEquineAppearance(m);assert.equal(m.mesh.scale.x,.5);assert.equal(m.head.scale.x,1.25);assert.ok(!m.chestMesh.visible&&!m.saddleMesh.visible&&!m.bridleMesh.visible);
    assert.equal(mobBounds(s.manager,m).height,type==='donkey'?.75:.8);assert.equal(mobBounds(s.manager,m).width,1.3965/2);
  });
  for(const [id,[heal,growth,temper]] of Object.entries(HORSE_FOODS))test(`${type} feeding ${id}: exact health/growth/temper`,()=>{
    const s=session(type);s.mob.maxHealth=30;s.mob.health=1;s.mob.isBaby=true;s.mob.babyGrowthTimer=1200;assert.ok(use(s,id));assert.equal(s.mob.health,1+heal);assert.equal(s.mob.babyGrowthTimer,1200-growth);assert.equal(s.mob.temper,temper);assert.ok(!s.mob.inLove);
  });
  test(`${type} full healthy tamed adult refuses useless food; creative keeps equipment`,()=>{
    const s=session(type);s.mob.isTamed=true;assert.equal(use(s,'apple'),false);assert.equal(s.inventory.active.count,4);s.player.gamemode='creative';use(s,'saddle');assert.equal(s.inventory.active.count,4);use(s,BLOCKS.CHEST);assert.equal(s.inventory.active.count,4);
  });
  test(`${type} foal matures at 20 minutes and cannot remount another passenger`,()=>{
    const s=session(type),m=s.mob;m.isBaby=true;m.babyGrowthTimer=.05;tick(s,.1);assert.equal(m.isBaby,false);assert.equal(m.mesh.scale.x,1);assert.equal(m.head.scale.x,1);assert.equal(m.isTamed,false);
    m.rider={};assert.equal(use(s,null),false);assert.equal(s.player.ridingMob,null);
  });
  test(`${type} chest holds fifteen stacks without loss or aliasing`,()=>{
    const s=session(type);s.mob.isTamed=true;use(s,BLOCKS.CHEST);
    for(let i=0;i<15;i++){s.inventory.active={id:`cargo_${i}`,count:64,customName:`Slot ${i}`};assert.ok(storePackItem(s.mob,s.inventory,i));assert.equal(s.inventory.active.count,0);}
    s.inventory.active={id:'extra',count:1};const before=JSON.stringify(chestSlots(s.mob));assert.equal(storePackItem(s.mob,s.inventory),false);assert.equal(s.inventory.active.count,1);assert.equal(JSON.stringify(chestSlots(s.mob)),before);
    s.inventory.hotbar=Array(9).fill({id:'full',count:64});s.inventory.storage=Array(27).fill({id:'full',count:64});assert.equal(takePackItem(s.mob,s.inventory,0),false);assert.equal(JSON.stringify(chestSlots(s.mob)),before);
    s.inventory.storage[26]=null;assert.ok(takePackItem(s.mob,s.inventory,14));assert.equal(s.inventory.storage[26].customName,'Slot 14');assert.equal(chestSlots(s.mob)[14],null);
  });
  test(`${type} cursor split/merge/swap preserves distinct enchantments`,()=>{
    const s=session(type);s.mob.isTamed=true;use(s,'chest');const slots=chestSlots(s.mob);
    slots[0]={id:'diamond',count:7,customName:'First',enchantments:[{id:'fortune',level:1}]};assert.ok(clickPackSlot(s.mob,s.inventory,0,true));assert.equal(s.inventory.cursorItem.count,4);assert.equal(slots[0].count,3);clickPackSlot(s.mob,s.inventory,1,true);assert.equal(slots[1].count,1);assert.equal(s.inventory.cursorItem.count,3);
    slots[2]={id:'diamond',count:2,customName:'Second',enchantments:[{id:'fortune',level:2}]};clickPackSlot(s.mob,s.inventory,2);assert.equal(slots[2].customName,'First');assert.equal(s.inventory.cursorItem.customName,'Second');assert.equal(s.inventory.cursorItem.count,2);
  });
  test(`${type} complete chest and equipment survive restoration`,()=>{
    const s=session(type),m=s.mob;m.isTamed=true;use(s,'saddle');use(s,'chest');chestSlots(m)[14]={id:'diamond_sword',count:1,enchantments:[{id:'sharpness',level:5}],customName:'Keepsake',durability:42};m.name='Pack animal';m.movementSpeed=.3;m.jumpStrength=.8;m.health-=2;
    const record=JSON.parse(JSON.stringify(serializeHorse(m))),next=s.manager.spawnMob(type,5,0,0);next.health=m.health;restoreHorse(next,record,s.manager);
    assert.deepEqual(serializeHorse(next),serializeHorse(m));assert.ok(next.saddleMesh.visible&&next.chestMesh.visible);assert.notEqual(next.chestInventory,m.chestInventory);assert.equal(next.health,m.health);
  });
  test(`${type} leather and looting bounds; player credit expires; babies drop nothing`,()=>{
    for(const looting of [0,1,2,3]){const s=session(type);s.manager.random=()=>.99999;s.inventory.active={id:'diamond_sword',count:1,enchantments:[{id:'looting',level:looting}]};s.hit(1000);tick(s,1.2);assert.equal(s.entities.drops.find(d=>d.id==='leather').count,2+looting);assert.equal(s.entities.xp,3);}
    const s=session(type);s.manager.random=()=>0;s.mob.isBaby=true;s.hit(1000);tick(s,1.2);assert.equal(s.entities.drops.length,0);assert.equal(s.entities.xp,0);
    const env=session(type);env.mob.playerCreditSeconds=.05;tick(env,.1);env.manager.damageMob(env.mob,1000);tick(env,1.2);assert.equal(env.entities.xp,0);
  });
  test(`${type} zero leather is possible and tamed wolf gives XP`,()=>{
    const s=session(type);s.manager.random=()=>0;s.manager.damageMob(s.mob,1000,null,false,{type:'wolf',isTamed:true});tick(s,1.2);assert.equal(s.entities.drops.length,0);assert.equal(s.entities.xp,1);
  });
  test(`${type} fall damage is shared with rider and water breaks a fall`,()=>{
    for(const [height,damage] of [[6,0],[7,1],[8,1],[9,2]]) {
      const s=session(type);s.mob.isTamed=true;use(s,'saddle');use(s,null);s.mob.mesh.position.y=height;const h=s.mob.health,p=s.player.health;tick(s,2);
      assert.equal(s.mob.health,h-damage,`fall ${height}`);assert.equal(s.player.health,p-damage,`rider fall ${height}`);
    }
    const s=session(type);s.world.fluid=BLOCKS.WATER;s.mob.mesh.position.y=12;const h=s.mob.health;tick(s,3);assert.equal(s.mob.health,h);
  });
  test(`${type} walks up a one-block slope but not through a narrow gap`,()=>{
    const s=session(type);s.mob.isTamed=true;use(s,'saddle');use(s,null);for(let x=-2;x<=2;x++)for(let z=-4;z<=-2;z++)s.world.setVoxel(x,0,z,BLOCKS.STONE);s.manager.game.controls={forward:true};tick(s,.6);assert.ok(s.mob.mesh.position.y>.9);assert.ok(s.mob.mesh.position.z<-1);
    for(const x of [-1,1])for(let y=0;y<3;y++)s.world.setVoxel(x,y,5,BLOCKS.STONE);assert.ok(s.manager.checkMobCollision(s.mob,new THREE.Vector3(.5,0,5.5)));s.mob.isBaby=true;assert.equal(s.manager.checkMobCollision(s.mob,new THREE.Vector3(.5,0,5.5)),false);
  });
  test(`${type} golden dandelion age lock survives reload and resumes`,()=>{
    const s=session(type);s.mob.isBaby=true;s.mob.babyGrowthTimer=20;use(s,'golden_dandelion');tick(s,3);assert.equal(s.mob.babyGrowthTimer,1200);const n=s.manager.spawnMob(type,4,0,0);restoreHorse(n,JSON.parse(JSON.stringify(serializeHorse(s.mob))),s.manager);assert.equal(n.ageLocked,true);assert.equal(n.mesh.scale.x,.5);use(s,'golden_dandelion');tick(s,1);assert.ok(s.mob.babyGrowthTimer<1200);
  });
  test(`${type} spawn egg on a same species makes a foal`,()=>{const s=session(type);assert.ok(use(s,`${type}_spawn_egg`));assert.equal(s.manager.mobs.length,2);const baby=s.manager.mobs[1];assert.ok(baby.isBaby);assert.equal(baby.mesh.scale.x,.5);assert.equal(baby.babyGrowthTimer,1200);});
}

test('donkey and mule models have different coats and sizes, coherent head features and leg pivots',()=>{
  const d=createPackEquineModel('donkey'),m=createPackEquineModel('mule');assert.notDeepEqual(d.mesh.getObjectByName('torso').material.map.image.data,m.mesh.getObjectByName('torso').material.map.image.data);assert.ok(d.rig.scale.x<m.rig.scale.x);
  for(const model of [d,m]){assert.equal(model.head.getObjectByName('ear').parent,model.head.getObjectByName('eye').parent);assert.equal(model.mesh.getObjectByName('mane').geometry.parameters.depth,.012);assert.equal(model.legs.length,4);for(const leg of model.legs)assert.equal(leg.getObjectByName('hoof').parent,leg);assert.equal(model.mesh.getObjectByName('torso').material.map.magFilter,THREE.NearestFilter);}
});
test('Java offspring inherit improved stats and stay untamed without equipment',()=>{
  for(const mateType of ['donkey','horse']){const s=session('donkey'),a=s.mob,b=s.manager.spawnMob(mateType,0,0,1.5);a.isTamed=b.isTamed=true;a.movementSpeed=.3;b.movementSpeed=.3;a.jumpStrength=b.jumpStrength=.85;a.maxHealth=b.maxHealth=28;a.health=b.health=28;a.inLove=b.inLove=30;s.manager.random=()=>.9;tick(s,4);const child=s.manager.mobs.find(m=>m.isBaby);assert.ok(child);assert.equal(child.type,mateType==='horse'?'mule':'donkey');assert.ok(child.movementSpeed>.3&&child.movementSpeed<=.3375);assert.ok(child.jumpStrength>.85&&child.jumpStrength<=1);assert.ok(child.maxHealth>=28&&child.maxHealth<=30);assert.equal(child.isTamed,false);assert.ok(!child.isSaddled&&!child.hasChest);assert.ok(s.entities.xp>=1&&s.entities.xp<=7);}
});
test('injured donkey golden food heals first; only another use at full health enters love',()=>{const s=session('donkey');s.mob.isTamed=true;s.mob.health-=4;use(s,'golden_carrot');assert.equal(s.mob.health,s.mob.maxHealth);assert.ok(!s.mob.inLove);use(s,'golden_carrot');assert.ok(s.mob.inLove>0);});
test('natural donkey spawning respects grass, light, biomes and pack size; no natural mules',()=>{
  const s=session('donkey');s.world.dimension='overworld';s.world.getBiome=()=> 'meadow';s.world.getHeightAt=()=>0;s.world.getLightLevel=()=>9;s.world.getVoxel=(x,y,z)=>y<0?BLOCKS.GRASS:BLOCKS.AIR;s.world.chunks=new Map([['0,0',{}]]);s.manager.random=()=>0;
  assert.ok(canSpawnDonkey(s.manager,0,0,0));updateDonkeySpawning(s.manager,31,s.player);assert.equal(s.manager.mobs.length,2);assert.ok(s.manager.mobs[1].isBaby);
  s.world.getLightLevel=()=>8;assert.equal(canSpawnDonkey(s.manager,0,0,0),false);s.world.getLightLevel=()=>15;s.world.getBiome=()=> 'forest';assert.equal(canSpawnDonkey(s.manager,0,0,0),false);s.world.getBiome=()=> 'savanna';s.world.dimension='nether';assert.equal(canSpawnDonkey(s.manager,0,0,0),false);assert.equal(s.manager.mobs.filter(m=>m.type==='mule').length,0);
});
test('mule egg is available in the real item catalog',()=>{assert.equal(ITEMS.mule_spawn_egg.mob,'mule');});

for(const type of ['donkey','mule']){
  test(`${type} hurt panic flees without retaliating and rider sits at saddle height`,()=>{const s=session(type);s.hit(1);tick(s,.8);assert.ok(s.mob.panicSeconds>0);assert.ok(s.mob.mesh.position.z<-.5);assert.equal(s.player.health,100);assert.ok(!s.mob.combatTarget);s.mob.isTamed=true;use(s,'saddle');use(s,null);tick(s,.1);assert.ok(Math.abs(s.player.position.y-s.mob.mesh.position.y-1.4*s.mob.rig.scale.y)<1e-6);});
  test(`${type} adult cannot board a boat; foal boards and stays seated`,()=>{const s=session(type);s.world.fluid=BLOCKS.WATER;const rail=new RailSystem(s.world,{scene:s.manager.scene,mobs:s.manager});const boat=rail.spawnBoat([0,1,0]);s.mob.mesh.position.copy(boat.position);rail.updateBoats(.1);assert.ok(!boat.passenger);s.mob.isBaby=true;syncPackEquineAppearance(s.mob);rail.updateBoats(.1);assert.equal(boat.passenger,s.mob);rail.updateBoats(.1);const pos=s.mob.mesh.position.clone();s.tick(.1);assert.deepEqual(s.mob.mesh.position.toArray(),pos.toArray());});
  test(`${type} moving empty cart transports it and removal releases it`,()=>{const s=session(type);s.world.setVoxel(0,0,0,BLOCKS.RAIL);const rail=new RailSystem(s.world,{scene:s.manager.scene,mobs:s.manager});const cart=rail.spawnCart([0,0,0]);cart.speed=1;cart.heading=[1,0,0];s.mob.mesh.position.copy(cart.position);rail.updateCarts(.1);assert.equal(cart.rider,s.mob);assert.equal(s.mob.vehicle,cart);const pos=s.mob.mesh.position.clone();s.tick(.1);assert.deepEqual(s.mob.mesh.position.toArray(),pos.toArray());rail.remove(cart);assert.equal(s.mob.vehicle,null);});
  test(`${type} complete cargo survives the real world map round trip`,async()=>{const {serializeWorld,deserializeWorld}=await import('../src/mapManager.js');const {World}=await import('../src/world.js');const s=session(type);s.mob.isTamed=true;use(s,'saddle');use(s,'chest');s.inventory.active={id:'diamond_sword',count:1,customName:'Pack sword',durability:21,enchantments:[{id:'sharpness',level:2}]};storePackItem(s.mob,s.inventory,14);s.mob.name='Trail companion';s.mob.health=13;const game={...s.manager.game,world:new World(123),mobs:s.manager,scene:s.manager.scene,inventory:s.inventory,worldTime:0,mechanisms:null,loadChunksAroundPlayer(){},rebuildChunkMesh(){}};s.player.pitch=0;s.player.update=()=>{};const record=JSON.parse(JSON.stringify(serializeWorld(game)));deserializeWorld(game,record);const m=s.manager.mobs[0];assert.equal(m.type,type);assert.equal(m.health,13);assert.deepEqual(serializeHorse(m),{...serializeHorse(m),...record.mobs[0].equine});assert.equal(chestSlots(m)[14].durability,21);assert.ok(m.saddleMesh.visible&&m.chestMesh.visible);});
  test(`${type} submerged head uses 15 seconds of air, then takes drowning damage`,()=>{const s=session(type);s.world.fluid=BLOCKS.WATER;s.mob.mesh.position.set(0,0,0);for(let i=0;i<150;i++)updatePackEquine(s.mob,.1,s.manager);assert.equal(s.mob.health,s.mob.maxHealth);for(let i=0;i<11;i++)updatePackEquine(s.mob,.1,s.manager);assert.equal(s.mob.health,s.mob.maxHealth-2);s.world.fluid=BLOCKS.AIR;updatePackEquine(s.mob,4,s.manager);assert.equal(s.mob.airSeconds,15);});
}
test('natural spawning uses the actual World surfaceHeightAt API',()=>{const s=session('donkey');s.world.dimension='overworld';s.world.chunks=new Map([['0,0',{}]]);s.world.getHeightAt=undefined;s.world.surfaceHeightAt=()=>4;s.world.getBiome=()=> 'meadow';s.world.getVoxel=(x,y,z)=>y===4?BLOCKS.GRASS:BLOCKS.AIR;s.manager.random=()=>0;updateDonkeySpawning(s.manager,31,s.player);assert.equal(s.manager.mobs.length,2);assert.equal(s.manager.mobs[1].mesh.position.y,5);});
test('cargo death drops and pickup retain names, durability and enchantments',()=>{const s=session('mule'),entity=new EntityManager(s.manager.scene,s.world,s.manager.sounds);entity.itemVisuals.create=()=>new THREE.Group();s.manager.entities=entity;s.mob.isTamed=true;use(s,'chest');const cargo={id:'diamond_sword',count:1,isBlock:false,customName:'Trail blade',durability:33,enchantments:[{id:'looting',level:2}]};s.inventory.active=structuredClone(cargo);storePackItem(s.mob,s.inventory,14);s.hit(1000);tick(s,1.1);const drop=entity.droppedItems.find(d=>d.itemType==='diamond_sword');assert.deepEqual(drop.itemData,cargo);const inv=new Inventory(s.manager.sounds);assert.ok(inv.addItem({...drop.itemData,count:1}));assert.deepEqual(inv.hotbar.find(i=>i?.id==='diamond_sword'),cargo);});

test('inventory renders exactly fifteen real storage slots and never shows pack horse armor',()=>{
  class Element {constructor(tag){this.tagName=tag;this.children=[];this.style={};}append(...c){this.children.push(...c);}setAttribute(k,v){this[k]=v;}remove(){}}
  const s=session('donkey');s.mob.isTamed=true;use(s,'chest');
  const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag),getElementById:()=>null};
  try{const modal=new Element('div');const ui={inv:s.inventory,player:s.player,mobs:s.manager,invModal:modal,renderSlotContent:(slot,item)=>slot.item=item,renderInventoryGrids(){},updateHotbar(){},updateFloatingCursor(){}};renderHorseInventory(ui,s.mob);const panel=modal.children[0];assert.ok(!panel.children.some(c=>c.textContent?.startsWith('Horse armor')));const grid=panel.children.find(c=>c.id==='pack-storage');assert.equal(grid.children.length,15);s.inventory.cursorItem={id:'diamond',count:3,customName:'Cargo'};grid.children[14].onclick({shiftKey:false});assert.equal(chestSlots(s.mob)[14].customName,'Cargo');assert.equal(chestSlots(s.mob)[14].count,3);assert.equal(s.inventory.cursorItem,null);}finally{globalThis.document=previous;}
});
