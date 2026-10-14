import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS } from '../src/blocks.js';
import { moveGroundMob, wanderMob } from '../src/mobMotion.js';
import { posePolarBear } from '../src/polarBearBehavior.js';

function iceOverWaterWorld() {
  return {
    getVoxel: (x, y, z) => {
      x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
      if (y === 24) return BLOCKS.ICE;
      if (y < 24) return BLOCKS.WATER;
      return BLOCKS.AIR;
    },
  };
}

function testManager(world) {
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world,
    scene: new THREE.Scene(),
    sounds: new Proxy({}, { get: () => () => {} }),
    mobs: [], arrows: [], customProjectiles: [],
    isBlockSolid: (x, y, z) => {
      const v = world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z));
      return v !== BLOCKS.AIR && v !== BLOCKS.WATER && v !== BLOCKS.LAVA && v !== BLOCKS.FIRE;
    },
    getMobDimensions: (type) => (type === 'polar_bear' ? { width: 1.4, height: 1.4 } : { width: 0.9, height: 1.4 }),
  });
  manager.checkMobCollision = (mob, p) => {
    const hw = 0.7;
    const h = 1.4;
    const minX = Math.floor(p.x - hw + 0.02);
    const maxX = Math.floor(p.x + hw - 0.02);
    const minY = Math.floor(p.y + 0.02);
    const maxY = Math.floor(p.y + h - 0.02);
    const minZ = Math.floor(p.z - hw + 0.02);
    const maxZ = Math.floor(p.z + hw - 0.02);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (manager.isBlockSolid(x, y, z)) return true;
        }
      }
    }
    return false;
  };
  return manager;
}

test('polar bears can walk forward on 1-block thick ice over water without getting blocked', () => {
  const manager = testManager(iceOverWaterWorld());
  const head = new THREE.Group();
  const mob = {
    type: 'polar_bear',
    mesh: { position: new THREE.Vector3(0.5, 25, 0.5), rotation: { y: 0 } },
    head,
    legs: [new THREE.Group(), new THREE.Group(), new THREE.Group(), new THREE.Group()],
    velocity: new THREE.Vector3(0, 0, 1.2),
    knockback: new THREE.Vector3(),
    yaw: 0, // facing +z
    health: 30, maxHealth: 30, onGround: true,
  };
  manager.mobs.push(mob);

  // Take 30 physics steps forward along +z
  for (let i = 0; i < 30; i++) {
    moveGroundMob(manager, mob, 1 / 30);
  }

  // Polar bear should have walked forward along Z
  assert.ok(mob.mesh.position.z > 1.2, `expected bear to advance along Z, got z=${mob.mesh.position.z}`);
  assert.equal(mob.stuckTime, 0, 'bear should not be stuck');
});

test('polar bears wander naturally across ice without endlessly turning in place', () => {
  const manager = testManager(iceOverWaterWorld());
  const head = new THREE.Group();
  const mob = {
    type: 'polar_bear',
    mesh: { position: new THREE.Vector3(10.5, 25, 10.5), rotation: { y: 0 } },
    head,
    legs: [new THREE.Group(), new THREE.Group(), new THREE.Group(), new THREE.Group()],
    velocity: new THREE.Vector3(),
    knockback: new THREE.Vector3(),
    yaw: 0,
    health: 30, maxHealth: 30, onGround: true,
    state: 'idle',
    avoidTime: 0,
    stuckTime: 0,
  };
  manager.mobs.push(mob);

  const initialPos = mob.mesh.position.clone();
  // Simulate 8 seconds (240 frames) of wandering
  for (let i = 0; i < 240; i++) {
    wanderMob(manager, mob, 1 / 30, 1.2);
    moveGroundMob(manager, mob, 1 / 30);
    posePolarBear(mob, i * (1 / 30) * 6);
  }

  const distanceTravelled = mob.mesh.position.distanceTo(initialPos);
  assert.ok(distanceTravelled > 0.5, `bear should have wandered across ice, travelled ${distanceTravelled.toFixed(2)}`);
  assert.ok((mob.avoidTime || 0) <= 0.1, 'bear should not be stuck in avoidTime spin loop');
});

test('cliff drops of 2 or more blocks are still refused', () => {
  // World with a cliff: x <= 2 has ground at y=24, but x > 2 has deep drop to y=10
  const cliffWorld = {
    getVoxel: (x, y, z) => {
      x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
      if (x <= 2 && y === 24) return BLOCKS.STONE;
      if (x <= 2 && y < 24) return BLOCKS.STONE;
      if (x > 2 && y <= 10) return BLOCKS.STONE;
      return BLOCKS.AIR;
    },
  };
  const manager = testManager(cliffWorld);
  const mob = {
    type: 'cow',
    mesh: { position: new THREE.Vector3(1.5, 25, 0.5), rotation: { y: 0 } },
    velocity: new THREE.Vector3(2.5, 0, 0), // walking +x towards the drop
    knockback: new THREE.Vector3(),
    yaw: Math.PI / 2,
    health: 10, maxHealth: 10, onGround: true,
  };
  manager.mobs.push(mob);

  for (let i = 0; i < 60; i++) {
    moveGroundMob(manager, mob, 1 / 30);
  }

  // Mob must refuse to step off block x=2 into the cliff (x >= 3.0)
  assert.ok(mob.mesh.position.x < 3.0, `mob should refuse cliff drop, got x=${mob.mesh.position.x}`);
});

test('polar bear looks at nearby player when idle', () => {
  const head = new THREE.Group();
  const mob = {
    type: 'polar_bear',
    mesh: { position: new THREE.Vector3(0, 25, 0), rotation: { y: 0 } },
    head,
    legs: [new THREE.Group(), new THREE.Group(), new THREE.Group(), new THREE.Group()],
    velocity: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    health: 30, maxHealth: 30,
  };

  // Player is at (3, 25, 5), which is at an angle to the right of the bear
  const playerPos = new THREE.Vector3(3, 25, 5);
  for (let i = 0; i < 30; i++) {
    posePolarBear(mob, i * 0.1, playerPos);
  }

  // Expected yaw: Math.atan2(3, 5) approx 0.54 rad
  assert.ok(mob.head.rotation.y > 0.3 && mob.head.rotation.y < 0.8,
    `bear head should track player direction, got yaw=${mob.head.rotation.y}`);
});
