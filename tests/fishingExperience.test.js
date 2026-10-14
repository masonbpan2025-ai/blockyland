import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS as B } from '../src/blocks.js';
import { FishingController, FISHING_STATE as S } from '../src/fishingRod.js';
import { RailSystem } from '../src/rails.js';
import { createBoatModel, isBoatItem } from '../src/boatModel.js';
import { waterSurfaceAt } from '../src/waterContact.js';
import { useBoat } from '../src/boatPlacement.js';
import { EntityManager } from '../src/entities.js';
import { Player } from '../src/player.js';

function fixture({ level = 0, roof = B.AIR } = {}) {
  const scene = new THREE.Scene();
  const player = { position: new THREE.Vector3(0,4,0), eyeHeight: 1.62, keys: {}, gamemode: 'survival', statusEffects: new Map() };
  const rod = { id: 'fishing_rod', isBlock: false, count: 1, durability: 64, enchantments: [] };
  const game = { scene, player, camera: { getWorldDirection: v => v.set(0,-0.3,-1).normalize() },
    world: { getVoxel: (x,y,z) => y < 0 ? B.STONE : y <= 3 ? B.WATER : y === 6 ? roof : B.AIR, getWaterLevel: () => level, getBiome: () => 'plains' },
    inventory: { getActiveItem: () => rod, consumeActiveItem() { this.consumed = true; }, addItem: stack => { game.received = stack; return true; } },
    sounds: { playSplash() { this.splashes = (this.splashes ?? 0)+1; } }, ui: { addChatMessage() {}, updateHotbar() {} },
    entities: { droppedItems: [], spawnDroppedItem(pos,id,isBlock,count,options) { this.droppedItems.push({ group: new THREE.Group(), itemType:id, isBlock, count, ...options, velocity: new THREE.Vector3() }); this.droppedItems.at(-1).group.position.copy(pos); } },
    mobs: { mobs: [] }, weather: { isRaining: () => false } };
  game.railSystem = new RailSystem(game.world,game);
  return game;
}
function land(fishing, fps = 60) {
  for (let i=0; i<fps*5 && fishing.state === S.CASTING; i++) fishing.update(1/fps);
  assert.equal(fishing.state,S.WAITING);
}
function run(fishing, seconds, fps = 60) { for (let i=0;i<Math.round(seconds*fps);i++) fishing.update(1/fps); }

test('normal 20/30/60/120/144 FPS all advance the fishing wait at 20 ticks per second', () => {
  for (const fps of [20,30,60,120,144]) {
    const fishing = new FishingController(fixture()); fishing.cast(); land(fishing,fps);
    fishing.waitTicks = 200; fishing.waitAccumulator = 0; fishing.accumulator = 0;
    run(fishing,5,fps); assert.equal(fishing.waitTicks,100,`${fps} FPS`);
    fishing.cancel();
  }
});

test('casting follows a visible arc and crosses into water at the rendered surface', () => {
  const game=fixture(), f=new FishingController(game); f.cast();
  assert.equal(f.state,S.CASTING);
  const start=f.bobber.position.clone(); f.update(0.1);
  assert.ok(f.bobber.position.distanceTo(start)>1);
  assert.ok(f.bobber.position.z>-3,'cannot teleport to the distant ray hit');
  land(f); assert.ok(Math.abs(f.bobber.position.y-(3+8/9))<0.04);
  assert.deepEqual(f.waterBlock,{x:0,y:3,z:Math.floor(f.bobber.position.z)});
  assert.equal(f.openWater(),true); assert.ok(game.sounds.splashes>0);
  assert.ok(f.line.geometry.attributes.position.count>2,'curved fishing line');
  f.cancel();
});

test('an upward cast flies up then falls; a wall stops a cast without tunnelling', () => {
  const game=fixture(); game.camera.getWorldDirection=v=>v.set(0,0.2,-1).normalize();
  const f=new FishingController(game); f.cast(); const y=f.bobber.position.y;
  run(f,0.25); assert.ok(f.bobber.position.y>y); run(f,1); assert.ok(f.bobber.position.y<y);
  f.cancel(); game.world.getVoxel=(x,y,z)=>z===-2?B.STONE:B.AIR;
  game.camera.getWorldDirection=v=>v.set(0,0,-1); f.cast(); f.update(0.25);
  assert.equal(f.stuckInBlock,true); assert.ok(f.bobber.position.z>-2);
  const before=f.rod().durability; f.reel(); assert.equal(f.rod().durability,before-2);
});

test('ripples approach the bobber, bite dips and splashes, missed bites recover without sinking', () => {
  const g=fixture(),f=new FishingController(g); f.cast(); land(f);
  for (let attempt=0;attempt<3;attempt++) {
    f.waitTicks=0; f.update(0.05); assert.equal(f.state,S.APPROACHING);
    f.effects.clear(); f.approachDuration=2; f.approachLeft=2; f.approachAngle=0;
    f.emitTrail(0.1); const first=f.effects.particles.at(-1).mesh.position.distanceTo(f.bobber.position);
    f.approachLeft=0.5; f.emitTrail(0.1); const last=f.effects.particles.at(-1).mesh.position.distanceTo(f.bobber.position);
    assert.ok(last<first,'the trail travels towards the bait');
    f.approachLeft=0; f.update(0.05); assert.equal(f.state,S.BITING);
    assert.ok(f.bobber.position.y<f.surfaceY-0.2); assert.ok(f.effects.particles.length>=11);
    f.biteLeft=0; f.update(0.05); assert.equal(f.state,S.WAITING);
    assert.ok(Math.abs(f.bobber.position.y-f.surfaceY)<0.04,'returns to its original surface');
  }
  f.cancel(); assert.equal(g.scene.children.length,0,'effects and line are cleaned up');
});

test('a bite occurs without fish mobs at 60 FPS and reeling produces a moving catch, XP and durability cost', () => {
  const game=fixture(), f=new FishingController(game); f.cast(); land(f);
  const original=Math.random;
  try {
    Math.random=()=>0.25; f.waitTicks=20; run(f,3);
    assert.equal(f.state,S.BITING); f.reel();
    assert.equal(game.entities.droppedItems.length,1);
    const drop=game.entities.droppedItems[0]; assert.ok(drop.velocity.z>0,'catch flies towards player');
    assert.ok(drop.itemData?.id); assert.equal(f.rod().durability,63);
    assert.ok(game.player.exp>=1 && game.player.exp<=6);
  } finally { Math.random=original; f.cancel(); }
});

test('real dropped-item physics deliver a catch to inventory, preserve metadata and leave it when full', () => {
  for (const full of [false,true]) {
    const g=fixture();g.sounds.playClick=()=>{};
    g.entities=new EntityManager(g.scene,g.world,g.sounds);
    g.inventory.addItem=stack=> { if(full)return false; g.received=stack; return true; };
    const f=new FishingController(g); f.cast();land(f);
    const stack={id:'fishing_rod',isBlock:false,count:1,durability:8,enchantments:[{id:'lure',level:1}]};
    f.giveToPlayer(stack); f.reel();
    for(let i=0;i<120;i++)g.entities.update(1/60,g.player,g.inventory);
    if(full) { assert.equal(g.entities.droppedItems.length,1);assert.deepEqual(g.entities.droppedItems[0].itemData,stack); }
    else { assert.equal(g.entities.droppedItems.length,0);assert.deepEqual(g.received,stack); }
    f.cancel();g.entities.itemVisuals.dispose();
  }
});

test('caught gear preserves damage and enchantments on its physical drop and inventory fallback', () => {
  const g=fixture(),f=new FishingController(g); f.cast(); land(f);
  const stack={id:'fishing_rod',isBlock:false,count:1,durability:7,enchantments:[{id:'lure',level:2}]};
  f.giveToPlayer(stack); assert.deepEqual(g.entities.droppedItems[0].itemData,stack);
  g.entities=null; f.giveToPlayer(stack); assert.deepEqual(g.received,stack); f.cancel();
});

test('glass/carpet allow direct sky exposure; ice, leaves and solid roofs slow fishing', () => {
  for (const [roof,expected] of [[B.GLASS,true],[B.WHITE_CARPET,true],[B.ICE,false],[B.OAK_LEAVES,false],[B.STONE,false]]) {
    const g=fixture({roof}),f=new FishingController(g); f.cast(); land(f);
    assert.equal(f.conditions().exposedToSky,expected,String(roof)); f.cancel();
  }
});

test('bobber floats above water plants, uses flowing levels and falls when water is removed', () => {
  const g=fixture(),f=new FishingController(g);
  const get=g.world.getVoxel; g.world.getVoxel=(x,y,z)=>y===3?B.SEAGRASS:get(x,y,z);
  f.cast(); land(f); assert.equal(f.openWater(),true);
  g.world.getVoxel=()=>B.AIR; f.update(0.05); assert.equal(f.state,S.CASTING); f.cancel();
  const flowing=fixture({level:4}),ff=new FishingController(flowing); ff.cast(); land(ff);
  assert.ok(Math.abs(ff.surfaceY-(3+4/9))<0.001); assert.equal(ff.openWater(),false); ff.cancel();
});

test('hooks collide with mobs and actual dropped-item groups, never award fish loot for an entity', () => {
  for (const kind of ['mob','item']) {
    const g=fixture(); g.camera.getWorldDirection=v=>v.set(0,0,-1);
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,0.5)); mesh.position.set(0,5.6,-1.2);
    const target={health:20,velocity:new THREE.Vector3(),[kind==='mob'?'mesh':'group']:mesh};
    (kind==='mob'?g.mobs.mobs:g.entities.droppedItems).push(target);
    const f=new FishingController(g); f.cast(); f.update(0.15);
    assert.equal(f.state,S.HOOKED); assert.equal(f.hooked.ref,target);
    f.reel(); assert.equal(g.entities.droppedItems.length,kind==='item'?1:0);
    assert.ok(target.velocity.z>0); assert.equal(f.rod().durability,kind==='item'?61:59);
  }
});

test('boat has an open hull, seats, shaped paddles and chest variants in the production model', () => {
  const model=createBoatModel();
  model.group.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,2,0),new THREE.Vector3(0,-1,0));
  const hit=ray.intersectObject(model.group,true)[0];
  assert.equal(hit.object.name,'floor'); assert.ok(hit.point.y<=0.181,'interior is not a solid block');
  assert.ok(model.group.getObjectByName('bow')); assert.ok(model.group.getObjectByName('seat-1'));
  assert.ok(model.leftOar.getObjectByName('oar-blade'));
  const chest=createBoatModel('cherry_chest_boat'); assert.ok(chest.group.getObjectByName('chest-latch'));
});

test('boats float on source/flowing water immediately and rise from deep water and plants', () => {
  for (const level of [0,4,8]) {
    const g=fixture({level}),rails=g.railSystem;
    const boat=rails.spawnBoat([0,1,0]);
    const surface=waterSurfaceAt(g.world,boat.position.x,1,boat.position.z).surfaceY;
    assert.ok(Math.abs(boat.position.y-(surface-0.13))<0.001);
    for(let i=0;i<120;i++) rails.updateBoats(1/60);
    assert.ok(Math.abs(boat.position.y-(surface-0.13))<0.001); assert.equal(boat.surface,'water');
    assert.ok(boat.position.y+0.55>surface); assert.equal(boat.mesh.position.y,boat.position.y); rails.reset();
  }
});

test('thin flowing water over a solid floor supports a boat without sinking or jitter', () => {
  const g=fixture({level:7});g.world.getVoxel=(x,y,z)=>y<3?B.STONE:y===3?B.WATER:B.AIR;
  const boat=g.railSystem.spawnBoat([0,3,0]);
  for(let i=0;i<600;i++)g.railSystem.updateBoats(1/60);
  assert.equal(boat.position.y,3);assert.equal(boat.surface,'water');assert.equal(boat.velocity.y,0);
  g.railSystem.reset();
});

test('boat water placement traces water rather than the seabed and consumes only after placement', () => {
  const g=fixture(); g.targetBlock={x:0,y:-1,z:-4,normal:{x:0,y:1,z:0}};
  for(const id of ['oak_boat','birch_boat','cherry_chest_boat','bamboo_raft']) {
    assert.equal(isBoatItem(id),true); assert.equal(useBoat(g,{id,isBlock:false}),true);
    const boat=g.railSystem.boats.at(-1); assert.ok(boat.position.y>3); assert.equal(boat.subType,id);
    assert.equal(boat.hasChest,id.includes('chest')); assert.equal(g.inventory.consumed,true);
    g.railSystem.remove(boat);
  }
  g.targetBlock=null;g.world.getVoxel=()=>B.AIR;g.inventory.consumed=false;
  useBoat(g,{id:'oak_boat'}); assert.equal(g.railSystem.boats.length,0); assert.equal(g.inventory.consumed,false);
});

test('boats use live WASD for forward/backward/turn, stop rowing on key release and clear passengers on removal', () => {
  const g=fixture(); g.player.keys={KeyW:true,KeyA:true};
  const boat=g.railSystem.spawnBoat([0,3,0],{rider:g.player});
  for(let i=0;i<60;i++)g.railSystem.updateBoats(1/60);
  assert.ok(boat.yaw>0); assert.ok(boat.position.distanceTo(new THREE.Vector3(0.5,3.75,0.5))>1);
  assert.ok(boat.leftOar.rotation.y!==0);
  const speed=boat.velocity.length();g.player.keys={};
  for(let i=0;i<60;i++)g.railSystem.updateBoats(1/60);
  assert.ok(boat.velocity.length()<speed);
  boat.passenger={isRiding:true,ridingBoat:boat};const p=boat.passenger;g.railSystem.remove(boat);
  assert.equal(p.isRiding,false);assert.equal(p.ridingBoat,null);assert.equal(g.scene.children.length,0);
});

test('boat rowing and drag give identical travel at 20, 60 and 144 FPS', () => {
  const positions=[];
  for(const fps of [20,60,144]) {
    const g=fixture();g.player.keys={KeyW:true};
    const boat=g.railSystem.spawnBoat([0,3,0],{rider:g.player});
    for(let i=0;i<fps*3;i++)g.railSystem.updateBoats(1/fps);
    positions.push(boat.position.clone());g.railSystem.reset();
  }
  for(const p of positions)assert.ok(p.distanceTo(positions[0])<1e-8);
});

test('boat hull stops before a bank and a backwards rowing input moves the boat backwards', () => {
  const g=fixture(),get=g.world.getVoxel;
  g.world.getVoxel=(x,y,z)=>z===-4&&y>=3?B.STONE:get(x,y,z);
  g.player.keys={KeyW:true};const boat=g.railSystem.spawnBoat([0,3,0],{rider:g.player});
  for(let i=0;i<240;i++)g.railSystem.updateBoats(1/60);
  assert.ok(boat.position.z-0.9375>=-3.03,'bow cannot overlap the bank');
  const start=boat.position.z;g.player.keys={KeyS:true};
  for(let i=0;i<60;i++)g.railSystem.updateBoats(1/60);
  assert.ok(boat.position.z>start);g.railSystem.reset();
});

test('catch produces a real XP orb in the normal EntityManager', () => {
  const g=fixture();g.entities=new EntityManager(g.scene,g.world,g.sounds);
  const f=new FishingController(g);f.cast();land(f);f.state=S.BITING;f.reel();
  assert.ok(g.entities.xpOrbs.length>0);
  const amount=g.entities.xpOrbs.reduce((n,orb)=>n+orb.value,0);
  assert.ok(amount>=1&&amount<=6);f.cancel();g.entities.itemVisuals.dispose();
});

test('mounted player does not apply walking or gravity after boat seating', () => {
  const g=fixture(),p=g.player;Object.setPrototypeOf(p,Player.prototype);
  p.world=g.world;p.game=g;p.health=20;p.velocity=new THREE.Vector3(5,-8,5);
  g.inventory.getOffhandItem=()=>null;
  p.tickBreath=()=>{};p.isEyeInWater=()=>false;p.areControlsDisabled=()=>false;p.updateSwimming=()=>{};
  p.updateCameraAndModel=()=>{p.cameraUpdated=true;};
  p.selectBaseSpeed=()=>{throw new Error('Mounted player cannot start walking');};
  g.riding=g.railSystem.spawnBoat([0,3,0],{rider:p});
  const before=p.position.clone();p.update(1/60);
  assert.deepEqual(p.position,before);assert.equal(p.velocity.length(),0);assert.equal(p.cameraUpdated,true);
  g.railSystem.remove(g.riding);assert.equal(g.riding,null);
});
