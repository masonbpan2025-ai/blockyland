import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { Inventory } from '../src/inventory.js';
import { BLOCKS } from '../src/blocks.js';
import { moveGroundMob } from '../src/mobMotion.js';

function fixture(terrain = (x,y,z) => y < 1 ? BLOCKS.STONE : BLOCKS.AIR) {
  const world = { getVoxel: terrain }, scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const entities = new EntityManager(scene, world, sounds);
  // Use real mob models/AI without browser texture loading.
  const manager = Object.assign(Object.create(MobManager.prototype), { world, scene, sounds, entities, mobs: [], arrows: [], textures: { pig: new THREE.Texture(), salmon: new THREE.Texture() } });
  const player = { position: new THREE.Vector3(100,1,100), takeDamage() {} };
  return { manager, entities, player, sounds };
}

test('wandering continues at a steady speed and remains grounded across frame rates', t => {
  t.mock.method(Math, 'random', () => 0.6);
  for (const fps of [30, 60, 144]) {
    const { manager, player } = fixture();
    const pig = manager.spawnPig(0,1,0);
    pig.wanderGoal = new THREE.Vector3(20,1,0); pig.wanderTimer = 30;
    let minY = Infinity, maxY = -Infinity;
    for(let i=0;i<fps*3;i++) {
      manager.update(1/fps,player);
      if(i>fps) {minY=Math.min(minY,pig.mesh.position.y);maxY=Math.max(maxY,pig.mesh.position.y);}
    }
    assert.ok(pig.mesh.position.x > 3.3 && pig.mesh.position.x < 3.6);
    assert.ok(maxY-minY < 0.002, `vertical jitter at ${fps} FPS`);
  }
});

test('mobs step up one-block obstacles without climbing through tall walls', () => {
  for (const wallHeight of [1, 3]) {
    const { manager } = fixture((x,y,z) => y<1 || (x>=2 && y<1+wallHeight) ? BLOCKS.STONE : BLOCKS.AIR);
    const pig=manager.spawnPig(0,1,0);
    for(let i=0;i<180;i++){pig.velocity.x=1.15;moveGroundMob(manager,pig,1/60);}
    if(wallHeight===1){assert.ok(pig.mesh.position.x>2.5);assert.ok(pig.mesh.position.y>1.9);}
    else {assert.ok(pig.mesh.position.x<1.6);assert.ok(pig.mesh.position.y<1.1);}
  }
});

test('dying pig rolls over, drops pork once, then fades; loot can be collected', t => {
  t.mock.method(THREE.TextureLoader.prototype, 'load', () => new THREE.Texture());
  const {manager,entities,player,sounds}=fixture();
  const pig=manager.spawnPig(0,1,0);
  manager.damageMob(pig,20);
  manager.update(0.1,player);
  assert.equal(manager.mobs.length,1);
  assert.ok(pig.mesh.rotation.z>0);
  const health=pig.health;manager.damageMob(pig,20);assert.equal(pig.health,health);
  for(let i=0;i<12;i++)manager.update(0.1,player);
  assert.equal(manager.mobs.length,0);
  assert.equal(entities.droppedItems.length,1);
  const item=entities.droppedItems[0];assert.equal(item.itemType,'porkchop');
  const count=item.count;
  const inventory=new Inventory(sounds);inventory.hotbar.fill(null);inventory.storage.fill(null);
  player.position.set(0,1,0);
  entities.update(0.1,player,inventory);
  assert.equal(entities.droppedItems.length,1,'loot must remain visible before pickup');
  for(let i=0;i<180;i++)entities.update(1/60,player,inventory);
  assert.equal(entities.droppedItems.length,0);
  assert.equal(inventory.hotbar.find(s=>s?.id==='porkchop').count,count);
});

test('a nearly full inventory only collects available space and leaves the remaining loot', t => {
  t.mock.method(THREE.TextureLoader.prototype, 'load', () => new THREE.Texture());
  const {entities,player,sounds}=fixture();const inventory=new Inventory(sounds);
  inventory.hotbar=Array.from({length:9},()=>({id:'beef',isBlock:false,count:64}));
  inventory.storage=Array.from({length:27},()=>({id:'beef',isBlock:false,count:64}));
  inventory.hotbar[0]={id:'porkchop',isBlock:false,count:63};
  player.position.set(0,1,0);
  entities.spawnDroppedItem(new THREE.Vector3(0,1.1,0),'porkchop',false,3,{pickupDelay:0});
  entities.update(0.01,player,inventory);
  assert.equal(inventory.hotbar[0].count,64);
  assert.equal(entities.droppedItems[0].count,2);
  entities.update(0.01,player,inventory);assert.equal(entities.droppedItems[0].count,2);
});

test('fish swim without leaving their water volume or clipping aquarium walls', t => {
  t.mock.method(Math, 'random', () => 0.6);
  const {manager,player}=fixture((x,y,z)=>x<0||x>=8||z<0||z>=8||y<1||y>=5?BLOCKS.STONE:BLOCKS.WATER);
  const fish=manager.spawnSalmon(3.5,2.5,3.5);
  let travelled=0;
  for(let i=0;i<600;i++) {
    const before=fish.mesh.position.clone();manager.update(1/60,player);travelled+=fish.mesh.position.distanceTo(before);
    assert.equal(manager.checkMobCollision(fish,fish.mesh.position),false);
    assert.equal(fish.inWater,true);
  }
  assert.ok(travelled>2,'fish should travel rather than jitter in one location');
});
