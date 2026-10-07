import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { Inventory } from '../src/inventory.js';
import { BLOCKS } from '../src/blocks.js';
import { moveGroundMob } from '../src/mobMotion.js';
import { MobLibrary } from '../src/mobLibrary.js';
import { provoke } from '../src/endermanBehavior.js';

function fixture(terrain = (x,y,z) => y < 1 ? BLOCKS.STONE : BLOCKS.AIR) {
  const world = { getVoxel: terrain }, scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const entities = new EntityManager(scene, world, sounds);
  // Use real mob models/AI without browser texture loading.
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world,
    scene,
    sounds,
    entities,
    mobs: [],
    arrows: [],
    customProjectiles: [],
    textures: { pig: new THREE.Texture(), salmon: new THREE.Texture(), enderman: new THREE.Texture() },
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  const player = { position: new THREE.Vector3(100,1,100), gamemode: 'survival', takeDamage() {} };
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

test('enderman teleports locally in normal world and pursues without jittering into player', () => {
  const { manager, player } = fixture();
  player.position.set(50, 1, 50);
  const enderman = manager.spawnEnderman(40, 1, 40);
  // Wiki: 0.6 wide, 2.9 tall. These were previously pinned at the pre-fix 0.5 / 2.85.
  assert.equal(enderman.width, 0.6);
  assert.equal(enderman.height, 2.9);
  assert.equal(enderman.maxHealth, 40, 'wiki: endermen have 40 HP');

  // In a normal world, teleportEnderman should NOT teleport to arena coordinates (0, 24.5, 0)
  manager.teleportEnderman(enderman);
  const distFromSpawn = enderman.mesh.position.distanceTo(new THREE.Vector3(40, 1, 40));
  const distFromArenaCenter = enderman.mesh.position.distanceTo(new THREE.Vector3(0, 24.5, 0));
  assert.ok(distFromSpawn < 30, `Enderman should teleport locally, actual pos: ${JSON.stringify(enderman.mesh.position)}`);
  assert.ok(distFromArenaCenter > 20, 'Enderman should not snap to tournament arena (0, 24.5, 0)');

  // Test pursuit without 60Hz jitter.
  //
  // Wiki: an enderman is neutral and "attacks only when provoked", by being attacked or by the player
  // looking at it. A wild enderman therefore ignores the player entirely (src/mobs.js says so where it
  // decides `hostile`), so pursuit is asserted on one that has been provoked -- which is the state the
  // jitter guard is about anyway.
  provoke(enderman, 'attack');
  enderman.mesh.position.set(45, 1, 50);
  manager.update(0.1, player);
  assert.ok(enderman.velocity.x > 0, 'Enderman pursues towards player');
  const yawBefore = enderman.yaw;
  manager.update(0.1, player);
  assert.ok(Math.abs(enderman.yaw - yawBefore) < 0.2, 'Enderman yaw should be stable without alternating thrash');
});

test('fire_dragon has boss-tier stats, large scale, and enters flight/combat states in survival', () => {
  const preset = MobLibrary.getMob('fire_dragon');
  assert.ok(preset, 'fire_dragon preset exists');
  assert.ok(preset.look.scale >= 2.5, 'Fire dragon scale should be >= 2.5 (significantly bigger)');
  assert.ok(preset.behavior.health >= 250, 'Fire dragon health should be boss tier (>= 250)');
  assert.equal(preset.behavior.type, 'boss');

  const { manager, player } = fixture();
  player.position.set(0, 1, 0);
  player.gamemode = 'survival';

  const dragon = manager.spawnCustomMob(preset, 0, 15, 0);
  assert.equal(dragon.isFlying, true);
  assert.ok(dragon.health >= 250);

  // Update in survival mode should initialize dragon combat AI
  manager.update(0.1, player);
  assert.ok(['circling', 'swooping', 'ascending'].includes(dragon.dragonState), 'Dragon should enter combat state machine in survival mode');

  // Trigger swooping state to test dive
  dragon.dragonState = 'swooping';
  dragon.dragonStateTimer = 4.0;
  manager.update(0.1, player);
  assert.ok(dragon.velocity.length() > 5.0, 'Dragon swoops towards player at high velocity');

  // Test dragon fireball spawning
  manager.spawnDragonFireball(dragon.mesh.position, player.position, 15);
  assert.ok(manager.customProjectiles.length > 0, 'Dragon fireball projectile spawned');
  const fb = manager.customProjectiles[manager.customProjectiles.length - 1];
  assert.equal(fb.isDragonFireball, true);

  // Creative mode: dragon enters peaceful cruising
  player.gamemode = 'creative';
  manager.update(0.1, player);
  assert.ok(dragon.isFlying);
});

test('ocean biomes have isOcean flag and authentic ocean mob spawn lists', async () => {
  const { BIOMES } = await import('../src/biomes.js');
  const oceanBiomeIds = [
    'ocean', 'deep_ocean', 'warm_ocean', 'lukewarm_ocean',
    'deep_lukewarm_ocean', 'cold_ocean', 'deep_cold_ocean',
    'frozen_ocean', 'deep_frozen_ocean'
  ];

  for (const id of oceanBiomeIds) {
    const biome = BIOMES[id];
    assert.ok(biome, `Biome ${id} should exist`);
    assert.equal(biome.isOcean, true, `Biome ${id} should have isOcean: true`);
    assert.ok(Array.isArray(biome.mobs), `Biome ${id} should have mobs list`);
    assert.ok(biome.mobs.length > 0, `Biome ${id} mobs list should not be empty`);
  }
});

test('ocean mobs spawn with authentic models, textures, and aquatic AI updates', () => {
  const { manager, player } = fixture((x, y, z) => BLOCKS.WATER);
  player.position.set(0, 10, 0);

  // 1. Guardian
  const guardian = manager.spawnGuardian(2, 5, 2);
  assert.ok(guardian, 'Guardian should spawn');
  assert.equal(guardian.isAquatic, true);
  assert.equal(guardian.type, 'guardian');
  assert.ok(guardian.spikes && guardian.spikes.length === 12, 'Guardian should have 12 spikes');
  assert.ok(guardian.tailSegments && guardian.tailSegments.length === 2, 'Guardian should have 2 tail segments');

  // 2. Elder Guardian
  const elder = manager.spawnElderGuardian(5, 5, 5);
  assert.ok(elder, 'Elder Guardian should spawn');
  assert.equal(elder.isAquatic, true);
  assert.equal(elder.isElder, true);
  assert.ok(elder.maxHealth >= 80);

  // 3. Glow Squid
  const glowSquid = manager.spawnGlowSquid(3, 5, 3);
  assert.ok(glowSquid, 'Glow Squid should spawn');
  assert.equal(glowSquid.isAquatic, true);
  assert.equal(glowSquid.isGlowSquid, true);
  assert.ok(glowSquid.tentacles && glowSquid.tentacles.length === 8, 'Glow Squid should have 8 tentacles');

  // 4. Cod
  const cod = manager.spawnCod(4, 5, 4);
  assert.ok(cod, 'Cod should spawn');
  assert.equal(cod.isAquatic, true);
  assert.equal(cod.type, 'cod');
  assert.ok(cod.tail, 'Cod should have articulated tail');

  // 5. Drowned
  const drowned = manager.spawnDrowned(6, 5, 6);
  assert.ok(drowned, 'Drowned should spawn');
  assert.equal(drowned.isDrowned, true);
  assert.equal(drowned.isAquatic, true);

  // 6. Verify update cycle runs without errors for all ocean mobs
  for (let i = 0; i < 5; i++) {
    manager.update(0.05, player);
  }

  assert.ok(guardian.tailSegments[0].rotation.y !== undefined);
  assert.ok(glowSquid.tentacles[0].rotation.x !== undefined);
});

