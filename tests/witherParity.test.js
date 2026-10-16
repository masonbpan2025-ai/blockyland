// Wither parity with https://minecraft.wiki/w/Wither
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  WITHER_HEALTH, WITHER_DIMENSIONS, WITHER_BIRTH_CHARGE_SECONDS,
  WITHER_ARMOR_THRESHOLD, WITHER_SKULL_SPEED, WITHER_SKULL_DAMAGE,
  WITHER_XP, WITHER_UNDEAD_TRAITS, isWither, witherDimensions,
  isWitherArmored, witherDrops, witherXp, witherSkullDamageFor,
  fireWitherSkull, updateWitherAI
} from '../src/witherBossBehavior.js';

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
    applyStatusEffect() {}
  };
  return { manager, player, scene };
}

test('wither is a native boss with wiki health and hitbox dimensions', () => {
  const { manager } = fixture();
  const wither = manager.spawnMob('wither', 0, 10, 0);

  assert.ok(isWither(wither), 'isWither recognizes wither');
  assert.equal(wither.health, WITHER_HEALTH, 'health is 300 (150 hearts)');
  assert.equal(wither.maxHealth, WITHER_HEALTH, 'maxHealth is 300');
  assert.equal(wither.width, WITHER_DIMENSIONS.width, 'width is 0.9');
  assert.equal(wither.height, WITHER_DIMENSIONS.height, 'height is 3.5');
  assert.equal(wither.isBoss, true, 'isBoss flag is set');
});

test('wither has the full suite of undead traits and does not burn in daylight', () => {
  const { manager } = fixture();
  const wither = manager.spawnMob('wither', 0, 10, 0);

  assert.equal(wither.undead, true, 'is undead');
  assert.equal(wither.poisonImmune, true, 'immune to poison');
  assert.equal(wither.witherImmune, true, 'immune to wither effect');
  assert.equal(wither.invertedHealing, true, 'inverted healing effect');
  assert.equal(wither.sensitiveToSmite, true, 'takes extra smite damage');
  assert.equal(wither.burnsInDaylight, false, 'does not burn in daylight');
});

test('wither birth charge lasts 11 seconds with invulnerability', () => {
  const { manager, player } = fixture();
  const wither = manager.spawnMob('wither', 0, 10, 0);
  wither.summonChargeTimer = WITHER_BIRTH_CHARGE_SECONDS;

  // During charge
  updateWitherAI(manager, wither, 0.1, player);
  assert.equal(wither.isInvulnerable, true, 'invulnerable while charging');
  assert.ok(wither.summonChargeTimer < WITHER_BIRTH_CHARGE_SECONDS, 'charge timer decrements');

  // Complete charge
  wither.summonChargeTimer = 0.05;
  updateWitherAI(manager, wither, 0.1, player);
  assert.equal(wither.isInvulnerable, false, 'invulnerability ends after birth');
  assert.equal(wither.health, WITHER_HEALTH, 'restores to full 300 HP');
});

test('wither skull damage scales with difficulty and blue skulls deal 1.5x damage', () => {
  assert.equal(witherSkullDamageFor('peaceful'), 0, 'peaceful deals 0');
  assert.equal(witherSkullDamageFor('easy'), 5, 'easy deals 5');
  assert.equal(witherSkullDamageFor('normal'), 8, 'normal deals 8');
  assert.equal(witherSkullDamageFor('hard'), 12, 'hard deals 12');

  // Blue skull 1.5x multiplier
  assert.equal(witherSkullDamageFor('normal', true), 12, 'blue skull normal deals 12');
  assert.equal(witherSkullDamageFor('hard', true), 18, 'blue skull hard deals 18');
});

test('wither gains Wither Armor below 50% HP (<= 150 HP) making it immune to projectiles', () => {
  const wither = { type: 'wither', health: 300, maxHealth: 300 };
  assert.equal(isWitherArmored(wither), false, 'not armored at full health');

  wither.health = 150; // exactly 50%
  assert.equal(isWitherArmored(wither), true, 'armored at 150 HP');

  wither.health = 80; // below 50%
  assert.equal(isWitherArmored(wither), true, 'armored below 150 HP');

  const { manager, player } = fixture();
  const liveWither = manager.spawnMob('wither', 0, 10, 0);
  liveWither.summonChargeTimer = 0;
  liveWither.health = 140;

  updateWitherAI(manager, liveWither, 0.1, player);
  assert.equal(liveWither.isImmuneToProjectiles, true, 'immune to projectiles when armored');
  assert.equal(liveWither.hasWitherArmor, true, 'hasWitherArmor set to true');
});

test('wither always drops exactly 1 Nether Star and 50 XP upon death', () => {
  const wither = { type: 'wither' };
  const drops = witherDrops(wither, { killedByPlayer: true });

  assert.equal(drops.length, 1, 'drops 1 item entry');
  assert.equal(drops[0].id, 'nether_star', 'item is nether_star');
  assert.equal(drops[0].count, 1, 'count is exactly 1');

  assert.equal(witherXp(wither, true), 50, 'drops 50 XP when killed by player');
  assert.equal(witherXp(wither, false), 0, 'drops 0 XP without player credit');
});

test('fireWitherSkull spawns projectile moving at 22 m/s', () => {
  const { manager } = fixture();
  const from = new THREE.Vector3(0, 5, 0);
  const target = new THREE.Vector3(10, 5, 0);

  const skull = fireWitherSkull(manager, from, target, false);
  assert.ok(skull, 'spawned skull');
  assert.ok(Math.abs(skull.velocity.length() - WITHER_SKULL_SPEED) < 0.01, 'speed is 22 m/s');
  assert.equal(skull.isBlue, false, 'black skull');

  const blueSkull = fireWitherSkull(manager, from, target, true);
  assert.equal(blueSkull.isBlue, true, 'blue skull created');
});

test('a newly summoned wither survives its birth charge (it starts at a third of its health)', async () => {
  const { updateWitherAI } = await import('../src/witherBossBehavior.js');
  const THREE = await import('three');
  const wither = { type: 'wither', health: 300, maxHealth: 300, summonChargeTimer: 11, mesh: { position: new THREE.Vector3(), scale: new THREE.Vector3(1, 1, 1) }, velocity: new THREE.Vector3() };
  const manager = { game: { difficulty: 'normal' }, mobs: [wither], ui: null };
  updateWitherAI(manager, wither, 1 / 30, null);
  assert.ok(wither.health >= 100, `health after the first frame: ${wither.health}`);
});
