// Vindicator parity with https://minecraft.wiki/w/Vindicator
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  VINDICATOR_HEALTH, VINDICATOR_DIMENSIONS, VINDICATOR_SPEED, VINDICATOR_DAMAGE,
  VINDICATOR_ATTACK_REACH, VINDICATOR_ATTACK_COOLDOWN, VINDICATOR_SHIELD_DISABLE_SECONDS,
  ILLAGER_TYPES, isVindicator, isJohnnyVindicator, vindicatorTargetsMob,
  vindicatorDamageFor, vindicatorDrops, vindicatorXp, poseVindicator, updateVindicatorAI
} from '../src/vindicatorBehavior.js';

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
    isBlockSolid: (x, y, z) => y < 1,
    checkMobCollision: (mob, p) => p.y < 1
  });
  const player = {
    type: 'player',
    position: new THREE.Vector3(10, 1, 10),
    velocity: new THREE.Vector3(),
    gamemode: 'survival',
    health: 20,
    isBlocking: false,
    damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; }
  };
  return { manager, player, scene };
}

test('vindicator is a native mob with the wiki health and hitbox', () => {
  const { manager } = fixture();
  const vindicator = manager.spawnMob('vindicator', 0, 1, 0);

  assert.ok(isVindicator(vindicator), 'isVindicator recognizes vindicator');
  assert.equal(vindicator.health, VINDICATOR_HEALTH, 'health is 24');
  assert.equal(vindicator.maxHealth, VINDICATOR_HEALTH, 'maxHealth is 24');
  assert.equal(vindicator.width, VINDICATOR_DIMENSIONS.width, 'width is 0.6');
  assert.equal(vindicator.height, VINDICATOR_DIMENSIONS.height, 'height is 1.95');
  assert.equal(vindicator.speed, VINDICATOR_SPEED.walk, 'base speed is 0.25');
});

test('vindicator damage scales across difficulties according to wiki', () => {
  assert.equal(vindicatorDamageFor('peaceful'), 0, 'peaceful deals 0');
  assert.equal(vindicatorDamageFor('easy'), 7, 'easy deals 7');
  assert.equal(vindicatorDamageFor('normal'), 13, 'normal deals 13');
  assert.equal(vindicatorDamageFor('hard'), 19, 'hard deals 19');
});

test('standard vindicator targets players, villagers, golems and wandering traders', () => {
  const vindicator = { type: 'vindicator' };
  const player = { type: 'player', health: 20, gamemode: 'survival' };
  const creativePlayer = { type: 'player', health: 20, gamemode: 'creative' };
  const villager = { type: 'villager', health: 20, isBaby: false };
  const babyVillager = { type: 'villager', health: 20, isBaby: true };
  const ironGolem = { type: 'iron_golem', health: 100 };
  const snowGolem = { type: 'snow_golem', health: 4 };
  const wanderingTrader = { type: 'wandering_trader', health: 20 };
  const sheep = { type: 'sheep', health: 8 };

  assert.ok(vindicatorTargetsMob(vindicator, player), 'targets survival player');
  assert.ok(!vindicatorTargetsMob(vindicator, creativePlayer), 'ignores creative player');
  assert.ok(vindicatorTargetsMob(vindicator, villager), 'targets adult villager');
  assert.ok(!vindicatorTargetsMob(vindicator, babyVillager), 'ignores baby villager');
  assert.ok(vindicatorTargetsMob(vindicator, ironGolem), 'targets iron golem');
  assert.ok(vindicatorTargetsMob(vindicator, snowGolem), 'targets snow golem');
  assert.ok(vindicatorTargetsMob(vindicator, wanderingTrader), 'targets wandering trader');
  assert.ok(!vindicatorTargetsMob(vindicator, sheep), 'standard vindicator does not target sheep');
});

test('Johnny vindicator targets almost all mobs except illagers and ghasts', () => {
  const johnny = { type: 'vindicator', customName: 'Johnny' };
  assert.ok(isJohnnyVindicator(johnny), 'identified as Johnny');

  const sheep = { type: 'sheep', health: 8 };
  const zombie = { type: 'zombie', health: 20 };
  const spider = { type: 'spider', health: 16 };
  const ravager = { type: 'ravager', health: 100 };
  const evoker = { type: 'evoker', health: 24 };
  const pillager = { type: 'pillager', health: 24 };
  const witch = { type: 'witch', health: 26 };
  const ghast = { type: 'ghast', health: 10 };

  assert.ok(vindicatorTargetsMob(johnny, sheep), 'Johnny targets sheep');
  assert.ok(vindicatorTargetsMob(johnny, zombie), 'Johnny targets zombie');
  assert.ok(vindicatorTargetsMob(johnny, spider), 'Johnny targets spider');
  assert.ok(!vindicatorTargetsMob(johnny, evoker), 'Johnny ignores evoker');
  assert.ok(!vindicatorTargetsMob(johnny, pillager), 'Johnny ignores pillager');
  assert.ok(!vindicatorTargetsMob(johnny, ravager), 'Johnny ignores ravager');
  assert.ok(!vindicatorTargetsMob(johnny, witch), 'Johnny ignores witch');
  assert.ok(!vindicatorTargetsMob(johnny, ghast), 'Johnny ignores ghast');
});

test('vindicator drops 0-1 emerald, chance of iron axe, and 5 XP', () => {
  const vindicator = { type: 'vindicator' };

  // Guaranteed emerald roll
  const emeraldDrop = vindicatorDrops(vindicator, {
    looting: 0,
    random: () => 0.99 // Math.floor(0.99 * 2) = 1
  });
  assert.ok(emeraldDrop.some(d => d.id === 'emerald' && d.count === 1), 'drops 1 emerald');

  // Iron axe roll (chance 0.085)
  const axeDrop = vindicatorDrops(vindicator, {
    killedByPlayer: true,
    looting: 0,
    random: () => 0.05 // < 0.085
  });
  assert.ok(axeDrop.some(d => d.id === 'iron_axe'), 'drops iron axe on lucky roll');

  // XP
  assert.equal(vindicatorXp(vindicator, true), 5, 'drops 5 XP when killed by player');
  assert.equal(vindicatorXp(vindicator, false), 0, 'drops 0 XP without player credit');
});

test('vindicator poses arms folded when neutral and raised when hostile', () => {
  const { manager } = fixture();
  const vindicator = manager.spawnMob('vindicator', 0, 1, 0);

  poseVindicator(vindicator, false);
  if (vindicator.foldedArms) {
    assert.equal(vindicator.foldedArms.visible, true, 'folded arms visible when neutral');
  }

  poseVindicator(vindicator, true);
  if (vindicator.foldedArms) {
    assert.equal(vindicator.foldedArms.visible, false, 'folded arms hidden when aggressive');
  }
  if (vindicator.rightArm) {
    assert.ok(vindicator.rightArm.rotation.x < -1.0, 'right arm raised for axe strike');
  }
});

test('vindicator disables player shield for 5 seconds on block', () => {
  const { manager, player } = fixture();
  const vindicator = manager.spawnMob('vindicator', 10, 1, 10.5); // 0.5m away (within reach 1.5)
  player.isBlocking = true;

  updateVindicatorAI(manager, vindicator, 0.1, player);

  assert.equal(player.isBlocking, false, 'shield was disabled');
  assert.equal(player.shieldDisabledTimer, VINDICATOR_SHIELD_DISABLE_SECONDS, 'shield timer set to 5s');
  assert.ok(player.damageTaken > 0, 'damage dealt through disabled shield');
});

test('vindicator chases target in update loop at sprint speed', () => {
  const { manager, player } = fixture();
  const vindicator = manager.spawnMob('vindicator', 0, 1, 0);
  player.position.set(10, 1, 0); // 10m away

  const handled = updateVindicatorAI(manager, vindicator, 0.1, player);
  assert.ok(handled, 'handled vindicator update');
  assert.equal(vindicator.target, player, 'acquired player target');
  assert.ok(vindicator.velocity.x > 0, 'moving toward player along x');
});
