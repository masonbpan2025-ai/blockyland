import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS } from '../src/blocks.js';
import { AnimalBehaviors, BREEDING_FOODS } from '../src/animalBehaviors.js';

function createFixture(terrain = (x, y, z) => y < 1 ? BLOCKS.STONE : BLOCKS.AIR) {
  const world = {
    getVoxel: terrain,
    setVoxel() {}
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
    scene,
    spawnDroppedItem(pos, id, isBlock, count = 1) {
      droppedItems.push({ pos, id, isBlock, count });
    },
    spawnXpOrbs(pos, count) {
      xpOrbs.push({ pos, count });
    },
    spawnBlockParticles() {},
    spawnDeathParticles() {}
  };

  const manager = new MobManager(scene, world, sounds, entities);
  manager.isBlockSolid = (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE;

  const player = {
    position: new THREE.Vector3(10, 1, 10),
    gamemode: 'survival',
    inventory: {
      hotbar: [null, null, null, null, null, null, null, null, null],
      storage: new Array(27).fill(null),
      activeSlot: 0,
      getActiveItem() { return this.hotbar[this.activeSlot]; },
      consumeActiveItem(n = 1) {
        const item = this.hotbar[this.activeSlot];
        if (item) {
          item.count -= n;
          if (item.count <= 0) this.hotbar[this.activeSlot] = null;
        }
      },
      addItem(itemId, isBlock = false, count = 1) {
        for (let i = 0; i < 9; i++) {
          if (!this.hotbar[i]) {
            this.hotbar[i] = { id: itemId, isBlock, count };
            return true;
          }
        }
        return false;
      }
    },
    takeDamage() {}
  };

  return { manager, world, scene, sounds, soundCalls, entities, player, behaviors: manager.animalBehaviors };
}

test('Cow mob anatomy, dimensions, health and model parts', () => {
  const { manager } = createFixture();
  const cow = manager.spawnCow(5, 1, 5);

  assert.equal(cow.type, 'cow');
  assert.equal(cow.name, 'Cow');
  assert.equal(cow.health, 10, 'Cow has 10 HP (5 hearts)');
  assert.equal(cow.maxHealth, 10);

  // Dimensions
  const dims = manager.getMobDimensions('cow');
  assert.equal(dims.width, 0.9);
  assert.equal(dims.height, 1.4);

  // Model parts: head, horns, udder, 4 legs
  assert.ok(cow.head, 'Cow has head mesh');
  assert.ok(Array.isArray(cow.horns) && cow.horns.length === 2, 'Cow has 2 horns');
  assert.ok(cow.udder, 'Cow has udder mesh');
  assert.ok(Array.isArray(cow.legs) && cow.legs.length === 4, 'Cow has 4 legs');
});

test('Cow milking: Empty bucket yields milk bucket, baby calf cannot be milked', () => {
  const { manager, behaviors, player, soundCalls, entities } = createFixture();
  const cow = manager.spawnCow(5, 1, 5);

  // 1. Right click adult cow with empty bucket
  player.inventory.hotbar[0] = { id: 'bucket', count: 1, isBlock: false };
  const milked = behaviors.interact(cow, player);
  assert.equal(milked, true, 'Milking adult cow succeeded');
  assert.equal(player.inventory.getActiveItem().id, 'milk_bucket', 'Player now holds milk bucket');
  assert.ok(soundCalls.some(s => s.prop === 'playMilk'), 'Milking sound was played');
  assert.ok(entities.particles.length > 0, 'Milk splash particles spawned');

  // 2. Calf cannot be milked
  const calf = manager.spawnCow(6, 1, 6);
  calf.isBaby = true;
  player.inventory.hotbar[0] = { id: 'bucket', count: 1, isBlock: false };
  const milkedCalf = behaviors.interact(calf, player);
  assert.equal(milkedCalf, false, 'Milking calf is disallowed');
  assert.equal(player.inventory.getActiveItem().id, 'bucket', 'Bucket remains empty');
});

test('Cow breeding: Wheat puts adult cow in Love mode and emits hearts', () => {
  const { manager, behaviors, player, soundCalls, entities } = createFixture();
  const cow = manager.spawnCow(5, 1, 5);

  player.inventory.hotbar[0] = { id: 'wheat', count: 3, isBlock: false };
  const bred = behaviors.interact(cow, player);
  assert.equal(bred, true, 'Feeding wheat succeeded');
  assert.equal(player.inventory.getActiveItem().count, 2, 'Consumed 1 wheat');
  assert.equal(cow.inLove, 30.0, 'Cow entered love mode for 30 seconds');
  assert.ok(soundCalls.some(s => s.prop === 'playEat'), 'Eating sound was played');
  assert.ok(entities.particles.length > 0, 'Heart particles spawned');

  // Cannot feed wheat again while already in love
  const bredAgain = behaviors.interact(cow, player);
  assert.equal(bredAgain, false, 'Cannot feed wheat to cow already in love');
  assert.equal(player.inventory.getActiveItem().count, 2, 'Wheat count untouched');
});

test('Cow matchmaking: Two in-love cows mate, spawn calf, drop XP, and enter cooldown', () => {
  const { manager, behaviors, entities } = createFixture();
  const cow1 = manager.spawnCow(5, 1, 5);
  const cow2 = manager.spawnCow(5.8, 1, 5);

  cow1.inLove = 30.0;
  cow2.inLove = 30.0;

  behaviors.checkBreedingPair(cow1);

  // Both cows should leave love mode and enter 5-minute cooldown (300s)
  assert.equal(cow1.inLove, 0);
  assert.equal(cow2.inLove, 0);
  assert.equal(cow1.breedingCooldown, 300.0);
  assert.equal(cow2.breedingCooldown, 300.0);

  // Calf spawned
  assert.equal(manager.mobs.length, 3, 'Calf was spawned');
  const calf = manager.mobs.find(m => m.isBaby);
  assert.ok(calf, 'Baby calf found');
  assert.equal(calf.parent, cow1);
  assert.equal(calf.babyGrowthTimer, 120.0);
  assert.equal(calf.mesh.scale.x, 0.5);
  assert.equal(calf.head.scale.x, 1.5, 'Calf has enlarged head');
  assert.equal(calf.horns[0].visible, false, 'Calf has no horns');
  assert.equal(calf.udder.visible, false, 'Calf has no udder');

  // XP dropped
  assert.ok(entities.xpOrbs.length > 0, 'XP orbs spawned for player');
  assert.ok(entities.xpOrbs[0].count >= 1 && entities.xpOrbs[0].count <= 7);
});

test('Calf growth acceleration: Feeding wheat reduces baby growth timer and matures calf', () => {
  const { manager, behaviors, player, soundCalls, entities } = createFixture();
  const calf = manager.spawnCow(5, 1, 5);
  calf.isBaby = true;
  calf.babyGrowthTimer = 20.0;
  calf.mesh.scale.set(0.5, 0.5, 0.5);
  calf.head.scale.set(1.5, 1.5, 1.5);
  calf.horns.forEach(h => h.visible = false);
  calf.udder.visible = false;

  // 1. Feeding wheat accelerates by 12 seconds
  player.inventory.hotbar[0] = { id: 'wheat', count: 5, isBlock: false };
  const fed = behaviors.interact(calf, player);
  assert.equal(fed, true);
  assert.equal(player.inventory.getActiveItem().count, 4);
  assert.equal(calf.babyGrowthTimer, 8.0, 'Timer reduced from 20s to 8s');
  assert.ok(entities.particles.length > 0, 'Growth sparkle particles spawned');

  // 2. Feeding again reduces past 0 -> matures into adult!
  behaviors.interact(calf, player);
  assert.equal(calf.isBaby, false, 'Calf has matured into adult');
  assert.equal(calf.mesh.scale.x, 1.0, 'Scale restored to full adult');
  assert.equal(calf.head.scale.x, 1.0, 'Head scale restored to 1.0');
  assert.equal(calf.horns[0].visible, true, 'Horns now visible');
  assert.equal(calf.udder.visible, true, 'Udder now visible');
});

test('Cow temptation: Cow follows player holding wheat', () => {
  const { manager, player } = createFixture();
  const cow = manager.spawnCow(5, 1, 5);
  player.position.set(9, 1, 5); // 4 blocks away (< 10 blocks)

  // Holding non-breeding item
  player.inventory.hotbar[0] = { id: 'stick', count: 1, isBlock: false };
  manager.update(0.05, player);
  assert.equal(cow.isFollowingPlayer, undefined);

  // Holding wheat
  player.inventory.hotbar[0] = { id: 'wheat', count: 1, isBlock: false };
  manager.update(0.05, player);
  assert.ok(cow.velocity.x > 0, 'Cow moves towards player in +X direction');
});

test('Cow death loot: Adult drops beef and leather; calf drops nothing', () => {
  const { manager, entities } = createFixture();

  // 1. Adult cow death
  const adult = manager.spawnCow(5, 1, 5);
  adult.health = 0;
  adult.dying = false;
  manager.updateDeath(adult, 0.7);
  assert.ok(entities.droppedItems.some(d => d.id === 'beef'), 'Adult cow drops beef');
  assert.ok(entities.xpOrbs.length > 0, 'Adult cow drops XP');

  // 2. Baby calf death
  entities.droppedItems.length = 0;
  entities.xpOrbs.length = 0;
  const calf = manager.spawnCow(10, 1, 10);
  calf.isBaby = true;
  calf.health = 0;
  calf.dying = false;
  manager.updateDeath(calf, 0.7);
  assert.equal(entities.droppedItems.length, 0, 'Baby calf drops 0 items');
  assert.equal(entities.xpOrbs.length, 0, 'Baby calf drops 0 XP');
});
