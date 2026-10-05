import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import { AnimalBehaviors, BREEDING_FOODS } from '../src/animalBehaviors.js';
import { moveGroundMob } from '../src/mobMotion.js';

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
  manager.spawnParticleBurst = (pos, color, count) => {
    particles.push({ pos, color, count });
  };
  manager.spawnXpOrbs = (pos, count) => {
    xpOrbs.push({ pos, count });
  };

  const player = {
    position: new THREE.Vector3(10, 1, 10),
    gamemode: 'survival',
    inventory: {
      activeItem: { id: 'wheat_seeds', count: 5, isBlock: false },
      getActiveItem() { return this.activeItem; },
      consumeActiveItem(n = 1) {
        if (this.activeItem) {
          this.activeItem.count -= n;
          if (this.activeItem.count <= 0) this.activeItem = null;
        }
      },
      addItem() {}
    },
    takeDamage() {}
  };

  return { manager, world, scene, sounds, soundCalls, entities, player, behaviors: manager.animalBehaviors };
}

test('Chicken mob anatomy, dimensions and initial properties', () => {
  const { manager } = createFixture();
  const chicken = manager.spawnChicken(5, 1, 5);

  assert.equal(chicken.type, 'chicken');
  assert.equal(chicken.name, 'Chicken');
  assert.equal(chicken.health, 4, 'Chicken has 4 HP (2 hearts)');
  assert.equal(chicken.maxHealth, 4);

  // Hitbox dimensions
  const dims = manager.getMobDimensions('chicken');
  assert.equal(dims.width, 0.4);
  assert.equal(dims.height, 0.7);

  // Model parts
  assert.ok(chicken.head, 'Chicken has head mesh');
  assert.ok(chicken.bill, 'Chicken has bill/beak mesh');
  assert.ok(chicken.wattle, 'Chicken has red wattle mesh');
  assert.ok(chicken.body, 'Chicken has torso body mesh');
  assert.ok(chicken.wingL, 'Chicken has left wing');
  assert.ok(chicken.wingR, 'Chicken has right wing');
  assert.ok(chicken.leftLeg, 'Chicken has left leg');
  assert.ok(chicken.rightLeg, 'Chicken has right leg');
  assert.equal(chicken.legs.length, 2);

  // Fall physics config
  assert.equal(chicken.maxFallSpeed, -1.5, 'Slow fall velocity capped at -1.5');
  assert.equal(chicken.gravity, 8.0, 'Gentle fall gravity');
});

test('Chicken breeding: All seed types initiate love mode', () => {
  const { manager, behaviors, player } = createFixture();
  const chicken = manager.spawnChicken(5, 1, 5);

  const seedTypes = ['wheat_seeds', 'seed', 'pumpkin_seeds', 'melon_seeds', 'beetroot_seeds'];
  for (const seed of seedTypes) {
    assert.ok(behaviors.isBreedingFood('chicken', seed), `${seed} is valid chicken breeding food`);
  }

  // Non-seed food is rejected
  assert.equal(behaviors.isBreedingFood('chicken', 'wheat'), false);
  assert.equal(behaviors.isBreedingFood('chicken', 'carrot'), false);
  assert.equal(behaviors.isBreedingFood('chicken', 'beef'), false);

  // Player feeds chicken wheat_seeds
  player.inventory.activeItem = { id: 'wheat_seeds', count: 2, isBlock: false };
  const handled = behaviors.interact(chicken, player);
  assert.equal(handled, true);
  assert.equal(chicken.inLove, 30.0, 'Chicken is in love for 30s');
  assert.equal(player.inventory.activeItem.count, 1, 'Consumed 1 seed');
});

test('Chicken breeding matchmaking: Two in-love chickens produce a baby chick and XP', () => {
  const { manager, behaviors, entities, soundCalls } = createFixture();
  const c1 = manager.spawnChicken(5, 1, 5);
  const c2 = manager.spawnChicken(6, 1, 5);

  c1.inLove = 30.0;
  c2.inLove = 30.0;

  behaviors.checkBreedingPair(c1);

  // Both chickens exited love mode and gained 5-minute cooldown
  assert.equal(c1.inLove, 0);
  assert.equal(c2.inLove, 0);
  assert.equal(c1.breedingCooldown, 300.0);
  assert.equal(c2.breedingCooldown, 300.0);

  // Baby chick was spawned
  const baby = manager.mobs.find(m => m.type === 'chicken' && m.isBaby);
  assert.ok(baby, 'Baby chick was spawned');
  assert.equal(baby.isBaby, true);
  assert.equal(baby.parent, c1);
  assert.ok(baby.babyGrowthTimer > 0);

  // XP orbs were dropped
  assert.ok(entities.xpOrbs.length > 0, 'XP orbs spawned on breeding');
  assert.ok(entities.xpOrbs[0].count >= 1 && entities.xpOrbs[0].count <= 7);

  // Chicken sound played
  assert.ok(soundCalls.some(s => s.prop === 'playChicken'));
});

test('Baby chick growth acceleration via seeds and maturation', () => {
  const { manager, behaviors, player } = createFixture();
  const baby = manager.spawnChicken(5, 1, 5);
  baby.isBaby = true;
  baby.babyGrowthTimer = 20.0;

  player.inventory.activeItem = { id: 'melon_seeds', count: 5, isBlock: false };

  // Wiki: "each feeding reduces the remaining time to maturity by 10%". This used to assert a
  // flat 12-second reduction, which was 10% of the old (wrong) 120-second timer.
  const fed1 = behaviors.interact(baby, player);
  assert.equal(fed1, true);
  assert.equal(baby.babyGrowthTimer, 18.0, '10% of 20s leaves 18s');
  assert.equal(player.inventory.activeItem.count, 4);

  // A second feeding removes 10% of what is left, so it is still a baby.
  const fed2 = behaviors.interact(baby, player);
  assert.equal(fed2, true);
  assert.equal(baby.babyGrowthTimer, 16.2);
  assert.equal(baby.isBaby, true, 'two feedings are not enough from 20s');

  // Age it out instead, which is what actually matures it.
  baby.babyGrowthTimer = 0.01;
  behaviors.update(baby, 0.1);
  assert.equal(baby.isBaby, false, 'Matures into adult chicken');
  assert.equal(baby.mesh.scale.x, 1.0);
});

test('Chicken gliding physics: Slow fall speed and wing flapping in air', () => {
  const { manager, player } = createFixture((x, y, z) => y < -50 ? BLOCKS.STONE : BLOCKS.AIR);
  const chicken = manager.spawnChicken(0, 20, 0);
  chicken.onGround = false;
  chicken.velocity.y = 0;

  // Simulate falling for 1.0 second (60 ticks)
  let maxFlap = 0;
  for (let i = 0; i < 60; i++) {
    moveGroundMob(manager, chicken, 1 / 60);
    manager.update(1 / 60, player);
    maxFlap = Math.max(maxFlap, Math.abs(chicken.wingL.rotation.z));
  }

  // Downward speed must not exceed slow glide limit of -1.5
  assert.ok(chicken.velocity.y >= -1.51, `Velocity ${chicken.velocity.y} should be >= -1.5`);
  assert.ok(chicken.velocity.y <= -0.5, 'Chicken is descending');

  // Wings should flap in air
  assert.ok(maxFlap > 0.3, 'Wings flap rapidly while airborne');
});

test('Chicken temptation: Follows player when player holds seeds', () => {
  const { manager, player } = createFixture();
  const chicken = manager.spawnChicken(0, 1, 0);
  player.position.set(5, 1, 0); // 5 blocks away
  player.inventory.activeItem = { id: 'pumpkin_seeds', count: 1, isBlock: false };

  // Update AI
  manager.update(0.1, player);

  // Chicken should turn toward player and move in positive X direction
  assert.ok(chicken.velocity.x > 0.5, 'Chicken moves towards player holding seeds');
});

test('Chicken egg laying and thrown egg hatching', () => {
  const { manager, behaviors, entities, player } = createFixture();
  const chicken = manager.spawnChicken(5, 1, 5);
  chicken.eggTimer = 0.1;

  // 1. Egg laying timer expiration
  behaviors.update(0.2, player, {});
  assert.ok(entities.droppedItems.some(d => d.id === 'egg'), 'Adult chicken laid an egg');

  // 2. Throwing egg
  player.inventory.activeItem = { id: 'egg', count: 1, isBlock: false };
  const thrown = behaviors.handleActiveItemUse(player, player.inventory);
  assert.equal(thrown, true);
  assert.equal(manager.customProjectiles.length, 1);

  // Projectile impact hatching
  const egg = manager.customProjectiles[0];
  egg.position.y = -1; // hits ground
  const origRandom = Math.random;
  Math.random = () => 0.05; // triggers 12.5% hatch
  behaviors.update(0.1, player, {});
  Math.random = origRandom;

  const chick = manager.mobs.find(m => m.type === 'chicken' && m.isBaby);
  assert.ok(chick, 'Baby chick hatched from thrown egg');
});

test('Chicken damage and death drops', () => {
  const { manager, entities, player, soundCalls } = createFixture();
  const chicken = manager.spawnChicken(5, 1, 5);

  // Take damage
  manager.damageMob(chicken, 2, new THREE.Vector3(4, 1, 5));
  assert.equal(chicken.health, 2);
  assert.ok(soundCalls.some(s => s.prop === 'playChicken'), 'Cluck sound played on damage');

  // Fatal damage after hitCooldown expires
  chicken.hitCooldown = 0;
  manager.damageMob(chicken, 10, new THREE.Vector3(4, 1, 5));
  assert.ok(chicken.health <= 0);

  // Process death animation
  for (let i = 0; i < 15; i++) {
    manager.update(0.1, player);
  }

  // Check drops: chicken and feather
  assert.ok(entities.droppedItems.some(d => d.id === 'chicken'), 'Dropped raw chicken');
  assert.ok(entities.droppedItems.some(d => d.id === 'feather'), 'Dropped feathers');
});

test('Chicken temptation with seed aliases and offhand holding', () => {
  const { manager, behaviors, player } = createFixture();
  const chicken = manager.spawnChicken(0, 1, 0);
  player.position.set(6, 1, 0);

  // 1. Offhand holding seeds works
  player.inventory.activeItem = null;
  player.inventory.getOffhandItem = () => ({ id: 'wheat_seed', count: 1, isBlock: false });
  manager.update(0.1, player);
  assert.ok(chicken.velocity.x > 0.5, 'Follows player holding wheat_seed in offhand');

  // 2. Main hand holding alias 'seeds'
  player.inventory.getOffhandItem = () => null;
  player.inventory.activeItem = { id: 'seeds', count: 1, isBlock: false };
  manager.update(0.1, player);
  assert.ok(chicken.velocity.x > 0.5, 'Follows player holding "seeds"');

  // 3. Head tracking towards player
  assert.ok(chicken.head.rotation.y !== undefined);

  // 4. Breeding with alias 'seeds' works
  const chicken2 = manager.spawnChicken(1, 1, 0);
  const bred = behaviors.interact(chicken2, player);
  assert.equal(bred, true, 'Can breed chicken using alias "seeds"');
  assert.equal(chicken2.inLove, 30.0);
});

test('Baby chick wattle is hidden and restored on maturation', () => {
  const { manager, behaviors, player } = createFixture();
  const chick = manager.spawnChicken(0, 1, 0);
  chick.isBaby = true;
  chick.babyGrowthTimer = 10.0;
  if (chick.wattle) chick.wattle.visible = false;

  assert.equal(chick.wattle.visible, false, 'Chick has no wattle visible');

  player.inventory.activeItem = { id: 'wheat_seeds', count: 2, isBlock: false };
  // Wiki: "reduces the remaining time to maturity by 10%, having no effect if less than 9
  // seconds remain". The floor is exclusive, so 10s -> 9s, and 8.1s is below the floor and
  // cannot be fed down any further. This used to assert a flat 12-second reduction.
  behaviors.interact(chick, player);
  assert.equal(chick.babyGrowthTimer, 9.0, '10% of 10s leaves 9s');
  assert.equal(chick.isBaby, true, 'and it is still a baby');
  behaviors.interact(chick, player);
  assert.equal(chick.babyGrowthTimer, 8.1, 'at exactly 9s the reduction still applies');
  const floored = chick.babyGrowthTimer;
  behaviors.interact(chick, player);
  assert.equal(chick.babyGrowthTimer, floored, 'below 9s feeding does nothing at all');
  assert.equal(chick.wattle.visible, false, 'so the wattle stays hidden');

  // Ageing past the floor is what matures it.
  behaviors.update(chick, 8.5);
  assert.equal(chick.isBaby, false);
  assert.equal(chick.wattle.visible, true, 'Wattle becomes visible when matured to adult');
});

