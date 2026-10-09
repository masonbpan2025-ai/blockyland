// Ender Dragon parity with https://minecraft.wiki/w/Ender_Dragon
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  ENDER_DRAGON_HEALTH, ENDER_DRAGON_DIMENSIONS, ENDER_DRAGON_DAMAGE,
  ENDER_DRAGON_CRYSTAL_BACKLASH, ENDER_DRAGON_XP, ENDER_DRAGON_BREATH_RADIUS,
  ENDER_DRAGON_BREATH_DAMAGE, ENDER_DRAGON_BREATH_DURATION,
  isEnderDragon, enderDragonDimensions, enderDragonDamageFor, enderDragonDrops,
  enderDragonXp, onCrystalDestroyed, collectDragonBreath, updateEnderDragonAI
} from '../src/enderDragonBehavior.js';

function fixture({ difficulty = 'normal' } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    getHeightAt: () => 0,
    surfaceHeightAt: () => 1,
    getLightLevel: () => 15,
    setVoxel() {}
  };
  const entities = {
    droppedItems: [],
    spawnDroppedItem(pos, itemType, isBlock = true, count = 1) {
      this.droppedItems.push({ itemType, isBlock, count });
    },
    spawnXpOrbs() {},
    spawnDeathParticles() {},
    spawnParticleBurst() {}
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [],
    game: { difficulty },
    ui: { setBossBar() {}, removeBossBar() {} },
    isBlockSolid: (x, y, z) => y < 1,
    checkMobCollision: (mob, p) => p.y < 1
  });
  const player = {
    type: 'player',
    position: new THREE.Vector3(10, 1, 10),
    velocity: new THREE.Vector3(),
    gamemode: 'survival',
    health: 20,
    takeDamage(n) { this.health -= n; },
    inventory: {
      items: [],
      active: { id: 'glass_bottle', type: 'glass_bottle' },
      getActiveItem() { return this.active; },
      consumeActiveItem() { this.active = null; },
      addItem(item) { this.items.push(item); }
    }
  };
  return { manager, player, scene };
}

test('ender dragon is a native boss with wiki health and hitbox dimensions', () => {
  const { manager } = fixture();
  const dragon = manager.spawnMob('ender_dragon', 0, 30, 0);

  assert.ok(isEnderDragon(dragon), 'isEnderDragon recognizes dragon');
  assert.equal(dragon.health, ENDER_DRAGON_HEALTH, 'health is 200 (100 hearts)');
  assert.equal(dragon.maxHealth, ENDER_DRAGON_HEALTH, 'maxHealth is 200');
  assert.equal(dragon.width, ENDER_DRAGON_DIMENSIONS.width, 'width is 16.0 (wingspan)');
  assert.equal(dragon.height, ENDER_DRAGON_DIMENSIONS.height, 'height is 8.0');
  assert.equal(dragon.isBoss, true, 'isBoss flag is set');
});

test('ender dragon wing buffet damage matches wiki across difficulties', () => {
  assert.equal(enderDragonDamageFor('peaceful'), 0, 'peaceful deals 0');
  assert.equal(enderDragonDamageFor('easy'), 6, 'easy deals 6');
  assert.equal(enderDragonDamageFor('normal'), 10, 'normal deals 10');
  assert.equal(enderDragonDamageFor('hard'), 15, 'hard deals 15');
});

test('destroying an End Crystal while healing damages the dragon for 10', () => {
  const { manager } = fixture();
  const dragon = manager.spawnMob('ender_dragon', 0, 30, 0);
  manager.enderDragon = dragon;

  const crystal = {
    position: new THREE.Vector3(10, 30, 0), // 10m away (< 38m)
    alive: true
  };

  const initialHp = dragon.health;
  const backlash = onCrystalDestroyed(manager, crystal);

  assert.equal(backlash, ENDER_DRAGON_CRYSTAL_BACKLASH, 'backlash is 10 damage');
  assert.equal(dragon.health, initialHp - 10, 'dragon took 10 backlash damage');
});

test('ender dragon is immune to arrows while perched on exit portal', () => {
  const { manager, player } = fixture();
  const dragon = manager.spawnMob('ender_dragon', 0, 31, 0);
  dragon.dragonPhase = 'perching';
  dragon.phaseTimer = 10.0;

  updateEnderDragonAI(manager, dragon, 0.1, player);

  assert.equal(dragon.isArrowImmune, true, 'arrow immunity is active while perched');
});

test('ender dragon awards 12,000 XP on first defeat', () => {
  const dragon = { type: 'ender_dragon' };
  assert.equal(enderDragonXp(dragon, true), 12000, 'awards 12,000 XP');
});

test('player can collect dragon breath into an empty glass bottle', () => {
  const { player } = fixture();
  const cloud = { position: new THREE.Vector3(10, 1, 10), radius: 3.5 };

  const collected = collectDragonBreath(cloud, player);
  assert.ok(collected, 'collected dragon breath successfully');
  assert.equal(player.inventory.active, null, 'consumed empty glass bottle');
  assert.ok(player.inventory.items.some(item => item.id === 'dragon_breath'), 'received dragon_breath item');
});
