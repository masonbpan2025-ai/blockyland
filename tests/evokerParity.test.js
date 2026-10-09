// Evoker parity with https://minecraft.wiki/w/Evoker
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  EVOKER_HEALTH, EVOKER_DIMENSIONS, EVOKER_SPEED, EVOKER_FANG_DAMAGE,
  EVOKER_FANG_COOLDOWN, EVOKER_VEX_COOLDOWN, EVOKER_WOLOLO_COOLDOWN,
  isEvoker, evokerTargetsMob, evokerDrops, evokerXp,
  castEvokerFangs, castSummonVexes, castWololo, updateEvokerAI
} from '../src/evokerBehavior.js';

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
    takeDamage(n) { this.health -= n; }
  };
  return { manager, player, scene };
}

test('evoker is a native mob with the wiki health and hitbox', () => {
  const { manager } = fixture();
  const evoker = manager.spawnMob('evoker', 0, 1, 0);

  assert.ok(isEvoker(evoker), 'isEvoker recognizes evoker');
  assert.equal(evoker.health, EVOKER_HEALTH, 'health is 24');
  assert.equal(evoker.maxHealth, EVOKER_HEALTH, 'maxHealth is 24');
  assert.equal(evoker.width, EVOKER_DIMENSIONS.width, 'width is 0.6');
  assert.equal(evoker.height, EVOKER_DIMENSIONS.height, 'height is 1.95');
  assert.equal(evoker.speed, EVOKER_SPEED.walk, 'base speed is 0.25');
});

test('evoker targets players, villagers, golems and wandering traders', () => {
  const evoker = { type: 'evoker' };
  const player = { type: 'player', health: 20, gamemode: 'survival' };
  const creativePlayer = { type: 'player', health: 20, gamemode: 'creative' };
  const villager = { type: 'villager', health: 20, isBaby: false };
  const ironGolem = { type: 'iron_golem', health: 100 };
  const wanderingTrader = { type: 'wandering_trader', health: 20 };
  const vindicator = { type: 'vindicator', health: 24 };

  assert.ok(evokerTargetsMob(evoker, player), 'targets survival player');
  assert.ok(!evokerTargetsMob(evoker, creativePlayer), 'ignores creative player');
  assert.ok(evokerTargetsMob(evoker, villager), 'targets villager');
  assert.ok(evokerTargetsMob(evoker, ironGolem), 'targets iron golem');
  assert.ok(evokerTargetsMob(evoker, wanderingTrader), 'targets wandering trader');
  assert.ok(!evokerTargetsMob(evoker, vindicator), 'ignores fellow illager vindicator');
});

test('evoker drops always include 1 totem of undying, 0-1 emerald, and 10 XP', () => {
  const evoker = { type: 'evoker' };

  // Drops without looting
  const dropsZero = evokerDrops(evoker, { looting: 0, random: () => 0 });
  assert.ok(dropsZero.some(d => d.id === 'totem_of_undying' && d.count === 1), 'always drops 1 totem of undying');

  // Drops with high emerald roll
  const dropsEmerald = evokerDrops(evoker, { looting: 0, random: () => 0.99 });
  assert.ok(dropsEmerald.some(d => d.id === 'emerald' && d.count === 1), 'drops 1 emerald on high roll');
  assert.ok(dropsEmerald.some(d => d.id === 'totem_of_undying' && d.count === 1), 'totem unaffected');

  // XP
  assert.equal(evokerXp(evoker, true), 10, 'drops 10 XP when killed by player');
  assert.equal(evokerXp(evoker, false), 0, 'drops 0 XP without player credit');
});

test('castEvokerFangs creates a line toward target dealing 6 unblockable damage', () => {
  const { manager } = fixture();
  const evoker = { mesh: { position: new THREE.Vector3(0, 1, 0) } };
  const targetPos = new THREE.Vector3(8, 1, 0);

  const fangs = castEvokerFangs(manager, evoker, targetPos, false);
  assert.ok(fangs.length >= 3, 'spawned a line of fangs');
  assert.equal(fangs[0].damage, EVOKER_FANG_DAMAGE, 'fangs deal 6 damage');
  assert.equal(fangs[0].owner, evoker, 'fangs belong to evoker');
  assert.ok(manager.activeFangs.length >= 3, 'added to active fangs list');
});

test('castEvokerFangs creates a ring around evoker when target is close', () => {
  const { manager } = fixture();
  const evoker = { mesh: { position: new THREE.Vector3(0, 1, 0) } };
  const targetPos = new THREE.Vector3(2, 1, 0);

  const fangs = castEvokerFangs(manager, evoker, targetPos, true);
  assert.equal(fangs.length, 8, 'spawned ring of 8 fangs');
  assert.equal(fangs[0].damage, 6, 'ring fangs deal 6 damage');
});

test('castSummonVexes spawns 3 vexes with evoker owner', () => {
  const { manager } = fixture();
  manager.spawnMob = (type, x, y, z) => ({ type, position: new THREE.Vector3(x, y, z) });
  const evoker = { mesh: { position: new THREE.Vector3(0, 1, 0) } };

  const vexes = castSummonVexes(manager, evoker);
  assert.equal(vexes.length, 3, 'spawned 3 vexes');
  assert.equal(vexes[0].type, 'vex', 'spawned vex mob');
  assert.equal(vexes[0].owner, evoker, 'assigned evoker as owner');
});

test('Wololo easter egg converts blue sheep wool to red', () => {
  const { manager } = fixture();
  const evoker = { mesh: { position: new THREE.Vector3(0, 1, 0) } };
  const blueSheep = {
    type: 'sheep',
    woolColor: 'blue',
    mesh: { position: new THREE.Vector3(4, 1, 0) },
    woolMesh: { material: { color: new THREE.Color() } }
  };

  const converted = castWololo(manager, evoker, blueSheep);
  assert.ok(converted, 'wololo spell converted sheep');
  assert.equal(blueSheep.woolColor, 'red', 'wool color became red');
});

test('evoker flees when enemy is within 3.5 blocks', () => {
  const { manager, player } = fixture();
  const evoker = manager.spawnMob('evoker', 0, 1, 0);
  player.position.set(2, 1, 0); // 2 blocks away (< 3.5)

  updateEvokerAI(manager, evoker, 0.1, player);
  assert.ok(evoker.velocity.x < 0, 'evoker flees in opposite direction from player');
});
