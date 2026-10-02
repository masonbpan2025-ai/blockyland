import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS } from '../src/blocks.js';

function createTestEnvironment(voxelMap = {}) {
  const world = {
    getVoxel(x, y, z) {
      const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
      return voxelMap[key] !== undefined ? voxelMap[key] : (y < 1 ? BLOCKS.STONE : BLOCKS.AIR);
    },
    setVoxel(x, y, z, val) {
      const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
      voxelMap[key] = val;
    }
  };

  const scene = new THREE.Scene();
  const soundCalls = [];
  const sounds = new Proxy({}, {
    get(target, prop) {
      return (...args) => { soundCalls.push({ prop, args }); };
    }
  });

  const droppedItems = [];
  const xpOrbs = [];
  const particles = [];
  const entities = {
    droppedItems,
    xpOrbs,
    particles,
    spawnDroppedItem(pos, id, isBlock, count = 1) {
      droppedItems.push({ pos, id, isBlock, count });
    },
    spawnXpOrbs(pos, count) {
      xpOrbs.push({ pos, count });
    }
  };

  const manager = new MobManager(scene, world, sounds, entities);
  manager.spawnParticleBurst = (pos, color = 0xf43f5e, count = 8) => {
    particles.push({ pos: pos.clone(), color, count });
  };
  manager.spawnXpOrbs = (pos, count = 1) => {
    xpOrbs.push({ pos: pos.clone(), count });
  };

  const player = {
    position: new THREE.Vector3(5, 1, 5),
    camera: {
      position: new THREE.Vector3(5, 2.6, 5),
      getWorldDirection(v) {
        return v.set(0, 0, 1).normalize();
      }
    },
    gamemode: 'survival',
    inventory: {
      items: [{ id: 'wheat_seeds', count: 16, isBlock: false }],
      activeSlot: 0,
      getActiveItem() {
        return this.items[this.activeSlot] || null;
      },
      consumeActiveItem(n = 1) {
        const item = this.getActiveItem();
        if (item) {
          item.count -= n;
          if (item.count <= 0) this.items[this.activeSlot] = null;
        }
      },
      addItem() {}
    }
  };

  return { manager, world, scene, sounds, soundCalls, entities, player, behaviors: manager.animalBehaviors };
}

test('Mob Collision: Multiple chickens at identical position push apart and do not squeeze into one', () => {
  const { manager } = createTestEnvironment();
  // Spawn 3 chickens at the exact same location
  const c1 = manager.spawnChicken(10, 1, 10);
  const c2 = manager.spawnChicken(10, 1, 10);
  const c3 = manager.spawnChicken(10, 1, 10);

  // Before collision resolution, all 3 are squeezed into the exact same point
  assert.equal(c1.mesh.position.distanceTo(c2.mesh.position), 0);
  assert.equal(c2.mesh.position.distanceTo(c3.mesh.position), 0);

  // Apply mob collision separation
  manager.applyMobCollisions(0.05);

  // Now, all chickens must be separated and maintain physical space
  const dist12 = c1.mesh.position.distanceTo(c2.mesh.position);
  const dist23 = c2.mesh.position.distanceTo(c3.mesh.position);
  const dist13 = c1.mesh.position.distanceTo(c3.mesh.position);

  assert.ok(dist12 >= 0.40, `c1 and c2 separated: distance ${dist12.toFixed(3)} >= 0.40`);
  assert.ok(dist23 >= 0.40, `c2 and c3 separated: distance ${dist23.toFixed(3)} >= 0.40`);
  assert.ok(dist13 >= 0.40, `c1 and c3 separated: distance ${dist13.toFixed(3)} >= 0.40`);
});

test('Mob Collision: Collision separation respects solid voxel boundaries (pen walls)', () => {
  // Build a 1-wide pit with solid stone walls at x=9 and x=11
  const voxelMap = {
    '9,1,10': BLOCKS.STONE,
    '11,1,10': BLOCKS.STONE,
    '10,1,9': BLOCKS.STONE,
    '10,1,11': BLOCKS.STONE
  };
  const { manager } = createTestEnvironment(voxelMap);

  const c1 = manager.spawnChicken(10.0, 1, 10.0);
  const c2 = manager.spawnChicken(10.05, 1, 10.0);

  manager.applyMobCollisions(0.05);

  // Neither chicken should be pushed inside stone blocks
  assert.equal(manager.isBlockSolid(c1.mesh.position.x, c1.mesh.position.y, c1.mesh.position.z), false);
  assert.equal(manager.isBlockSolid(c2.mesh.position.x, c2.mesh.position.y, c2.mesh.position.z), false);
  // They still separated horizontally
  const d = c1.mesh.position.distanceTo(c2.mesh.position);
  assert.ok(d > 0.05, 'Separated within available pen width');
});

test('Mob Collision: Mobs on different vertical levels do not collide horizontally', () => {
  const { manager } = createTestEnvironment();
  const c1 = manager.spawnChicken(5, 1, 5); // ground level (height ~0.7)
  const c2 = manager.spawnChicken(5, 4, 5); // 3 blocks above

  manager.applyMobCollisions(0.05);

  // Positions should not displace each other horizontally
  assert.equal(c1.mesh.position.x, 5);
  assert.equal(c2.mesh.position.x, 5);
  assert.equal(c1.mesh.position.z, 5);
  assert.equal(c2.mesh.position.z, 5);
});

test('Step 1 & 2: Holding seeds lures unfed chickens towards the player', () => {
  const { manager, player } = createTestEnvironment();
  const chicken = manager.spawnChicken(2, 1, 5);
  player.position.set(6, 1, 5); // player is 4 blocks away in +X

  // Player holds wheat seeds
  player.inventory.items[0] = { id: 'wheat_seeds', count: 5 };
  manager.update(0.1, player);

  // Chicken should move in +X direction towards player
  assert.ok(chicken.velocity.x > 0.5, 'Unfed chicken follows player holding seeds');
});

test('Step 3: Luring multiple chickens with seeds does not collapse them into one position', () => {
  const { manager, player } = createTestEnvironment();
  // Two chickens lured towards the same player
  const c1 = manager.spawnChicken(4.9, 1, 2.0);
  const c2 = manager.spawnChicken(5.1, 1, 2.0);
  player.position.set(5.0, 1, 4.0); // player stands ahead at (5, 1, 4)

  player.inventory.items[0] = { id: 'wheat_seeds', count: 10 };

  // Simulate multiple AI + physics updates
  for (let frame = 0; frame < 15; frame++) {
    manager.update(0.05, player);
  }

  // Verify distance between chickens is maintained and they do not squeeze into one point
  const dist = c1.mesh.position.distanceTo(c2.mesh.position);
  assert.ok(dist >= 0.40, `Chickens stay separated while following seeds (dist: ${dist.toFixed(3)})`);
});

test('Step 4 & 5: Feeding first and second chickens with seeds puts both into Love Mode with hearts', () => {
  const { manager, behaviors, entities, player, soundCalls } = createTestEnvironment();
  const c1 = manager.spawnChicken(5, 1, 5);
  const c2 = manager.spawnChicken(5.6, 1, 5);

  player.inventory.items[0] = { id: 'wheat_seeds', count: 2 };

  // Step 4: Approach first chicken and feed it
  assert.equal(behaviors.canInteract(c1, player), true, 'First chicken can be fed');
  const fed1 = behaviors.interact(c1, player);
  assert.equal(fed1, true, 'First chicken accepted seed');
  assert.equal(c1.inLove, 30.0, 'First chicken entered Love mode (30s)');
  assert.equal(player.inventory.getActiveItem().count, 1, 'First seed consumed');
  assert.ok(entities.particles.length > 0, 'Red heart particles appeared over first chicken');
  assert.ok(soundCalls.some(s => s.prop === 'playEat'), 'Eat sound played');

  // Once c1 is in love, it cannot be fed again
  assert.equal(behaviors.canInteract(c1, player), false, 'Already in love chicken cannot be fed again');

  // Step 5: Approach second chicken and feed it
  assert.equal(behaviors.canInteract(c2, player), true, 'Second chicken can still be fed');
  const fed2 = behaviors.interact(c2, player);
  assert.equal(fed2, true, 'Second chicken accepted seed');
  assert.equal(c2.inLove, 30.0, 'Second chicken entered Love mode (30s)');
  assert.equal(player.inventory.getActiveItem(), null, 'Second seed consumed (inventory emptied)');
  assert.ok(entities.particles.length >= 2, 'Red heart particles appeared over second chicken');
});

test('Step 6: In-love chickens ignore held seeds, approach each other, court with hearts, and spawn baby chick a few seconds later', () => {
  const { manager, behaviors, entities, player, soundCalls } = createTestEnvironment();
  // Place two chickens 2.5 blocks apart
  const c1 = manager.spawnChicken(4, 1, 5);
  const c2 = manager.spawnChicken(6.5, 1, 5);

  c1.inLove = 30.0;
  c2.inLove = 30.0;

  // Even though player is holding seeds nearby, in-love chickens MUST ignore player and walk towards each other
  player.position.set(10, 1, 5);
  player.inventory.items[0] = { id: 'pumpkin_seeds', count: 5 };

  // Run update: chickens move toward each other
  manager.update(0.1, player);
  assert.ok(c1.velocity.x > 0, 'Chicken 1 moves in +X towards Chicken 2 (not towards player at 10)');
  assert.ok(c2.velocity.x < 0, 'Chicken 2 moves in -X towards Chicken 1');

  // Bring them close (< 1.2 blocks) to begin courtship
  c1.mesh.position.set(5.0, 1, 5.0);
  c2.mesh.position.set(5.6, 1, 5.0);

  // During courtship (first 1.0 second), baby chick has NOT spawned yet; hearts are continuously emitted
  entities.particles.length = 0;
  for (let tick = 0; tick < 10; tick++) {
    behaviors.update(0.1, player, {});
  }

  assert.equal(c1.inLove > 0, true, 'Still in courtship love mode after 1.0s');
  assert.equal(c2.inLove > 0, true, 'Still in courtship love mode after 1.0s');
  const babyBefore = manager.mobs.find(m => m.type === 'chicken' && m.isBaby);
  assert.equal(babyBefore, undefined, 'Baby chick has not appeared immediately (courtship delay)');
  assert.ok(entities.particles.length > 0, 'Red love hearts continuously appear during courtship');

  // Advance remaining courtship time (another 1.2s -> total > 2.0s)
  for (let tick = 0; tick < 12; tick++) {
    behaviors.update(0.1, player, {});
  }

  // After a few seconds, the baby chick appears!
  const babyAfter = manager.mobs.find(m => m.type === 'chicken' && m.isBaby);
  assert.ok(babyAfter, 'Baby chick appeared a few seconds later');
  assert.equal(babyAfter.isBaby, true);
  assert.equal(babyAfter.parent, c1);
  assert.equal(babyAfter.mesh.scale.x, 0.5, 'Baby chick is 50% scale');

  // Both parents exited love mode and entered 5-minute breeding cooldown
  assert.equal(c1.inLove, 0);
  assert.equal(c2.inLove, 0);
  assert.ok(c1.breedingCooldown > 295 && c1.breedingCooldown <= 300.0, 'c1 entered 5-minute breeding cooldown');
  assert.ok(c2.breedingCooldown > 295 && c2.breedingCooldown <= 300.0, 'c2 entered 5-minute breeding cooldown');

  // XP orbs dropped
  assert.ok(entities.xpOrbs.length > 0, 'XP orbs spawned for breeding');
  // Cluck sound played
  assert.ok(soundCalls.some(s => s.prop === 'playChicken'));
});

test('AnimalBehaviors canInteract correctly identifies feeding capability', () => {
  const { manager, behaviors, player } = createTestEnvironment();
  const chicken = manager.spawnChicken(5, 1, 5);

  player.inventory.items[0] = { id: 'wheat_seeds', count: 1 };
  assert.equal(behaviors.canInteract(chicken, player), true, 'Can interact with unfed adult chicken using seeds');

  // Chicken enters love mode
  chicken.inLove = 30;
  assert.equal(behaviors.canInteract(chicken, player), false, 'Cannot interact with chicken already in love');

  // Chicken on breeding cooldown
  chicken.inLove = 0;
  chicken.breedingCooldown = 150;
  assert.equal(behaviors.canInteract(chicken, player), false, 'Cannot interact with chicken on breeding cooldown');

  // Baby chicken can interact to accelerate growth
  chicken.isBaby = true;
  chicken.breedingCooldown = 0;
  assert.equal(behaviors.canInteract(chicken, player), true, 'Can interact with baby chicken to feed and accelerate growth');

  // Non-food item cannot interact
  player.inventory.items[0] = { id: 'dirt', count: 1 };
  assert.equal(behaviors.canInteract(chicken, player), false, 'Cannot feed dirt to chicken');
});
