// Silverfish parity with https://minecraft.wiki/w/Silverfish
//
// Silverfish was another of the 38 missing types. Its defining behaviours are that it drops
// nothing but XP, and that hitting one calls other silverfish in a wide area to help.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import {
  SILVERFISH_HEALTH, SILVERFISH_DIMENSIONS, SILVERFISH_XP, SILVERFISH_DAMAGE,
  SILVERFISH_ALERT_RANGE, SILVERFISH_ANGER_SECONDS, SILVERFISH_ATTACK_REACH,
  isSilverfish, silverfishDamageFor, silverfishDrops, alertSilverfish, angerSilverfish,
  updateSilverfishAnger, updateSilverfishHunt, createSilverfishModel, poseSilverfishLegs
} from '../src/silverfishBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ difficulty = 'normal' } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = { getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR), getHeightAt: () => 0, getLightLevel: () => 0 };
  const entities = new EntityManager(scene, world, sounds);
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  const player = {
    position: new THREE.Vector3(0, 1, 0), gamemode: 'survival', health: 20, keys: {}, onGround: true,
    statusEffects: {}, damageEvents: 0,
    takeDamage(n) { this.damageEvents++; this.health = Math.max(0, this.health - n); },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  manager.game = { player, difficulty, weather: { weatherType: 'clear' }, worldTime: 18000, controls: {} };
  return { manager, entities, player };
}

function xpFrom(entities) {
  return (entities.xpOrbs || []).reduce((n, orb) => n + (orb.value || 0), 0);
}

test('silverfish is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const fish = manager.spawnMob('silverfish', 0, 1, 0);
  assert.equal(fish.type, 'silverfish');
  assert.equal(fish.name, 'Silverfish');
  assert.notEqual(fish.type, 'villager');
});

test('silverfish have the reference 8 HP and the smallest-tier hitbox', () => {
  const { manager } = fixture();
  const fish = manager.spawnMob('silverfish', 0, 1, 0);
  assert.equal(fish.maxHealth, SILVERFISH_HEALTH);
  assert.equal(fish.maxHealth, 8, 'wiki: silverfish have 8 HP (reduced from 20 in Beta 1.9-pre2)');
  assert.equal(fish.health, 8);
  // Wiki: 0.4 x 0.3.
  assert.deepEqual(SILVERFISH_DIMENSIONS, { width: 0.4, height: 0.3 });
  assert.deepEqual(manager.getMobDimensions('silverfish'), { width: 0.4, height: 0.3 });
  assert.deepEqual([fish.width, fish.height], [0.4, 0.3]);
  assert.ok(fish.width > fish.height, 'wider than tall, like the wiki');
});

test('the model has a segmented body, antennae, six legs and two eyes', () => {
  const { manager } = fixture();
  const fish = manager.spawnMob('silverfish', 0, 1, 0);
  assert.ok(fish.head, 'head');
  assert.ok(fish.body && fish.mid && fish.tail, 'three body segments');
  assert.equal(fish.legs.length, 6, 'six legs');
  assert.equal(fish.eyes.length, 2, 'two eyes');
  // Antennae are attached to the head, which is what distinguishes the silhouette.
  const antennae = fish.head.children.filter(c => c.geometry?.parameters?.depth === 0.22);
  assert.equal(antennae.length, 2, 'two antennae on the head');
});

test('the legs animate in two alternating groups', () => {
  const bodyMat = new THREE.MeshLambertMaterial();
  const eyeMat = new THREE.MeshBasicMaterial();
  const model = createSilverfishModel(bodyMat, eyeMat);
  const before = model.legs.map(l => l.mesh.position.x);
  poseSilverfishLegs(model, Math.PI / 2);
  const after = model.legs.map(l => l.mesh.position.x);
  const deltas = after.map((x, i) => x - before[i]);
  assert.ok(deltas.some(d => Math.abs(d) > 1e-9), 'the pose moved the legs');
  // Legs 0 and 1 are in opposite groups, so they swing in opposite directions.
  assert.equal(Math.sign(deltas[0]), -Math.sign(deltas[1]), 'adjacent legs alternate');
  assert.equal(Math.sign(deltas[0]), Math.sign(deltas[2]), 'every other leg shares a group');
  assert.doesNotThrow(() => poseSilverfishLegs({}, 1));
  assert.doesNotThrow(() => poseSilverfishLegs(null, 1));
});

test('the damage table matches the wiki across difficulties', () => {
  // Wiki: 1 on Easy and Normal, 1.5 on Hard.
  assert.deepEqual(SILVERFISH_DAMAGE, { peaceful: 0, easy: 1, normal: 1, hard: 1.5 });
  assert.equal(silverfishDamageFor('easy'), 1);
  assert.equal(silverfishDamageFor('normal'), 1);
  assert.equal(silverfishDamageFor('hard'), 1.5);
  assert.equal(silverfishDamageFor('peaceful'), 0, 'no damage on Peaceful');
  assert.equal(silverfishDamageFor('nonsense'), SILVERFISH_DAMAGE.normal, 'unknown falls back to normal');
});

test('silverfish drop nothing at all, only XP', () => {
  // Wiki: "Silverfish have no drops other than 5 experience points when killed by a player or
  // tamed wolf." This is asserted explicitly so "no drops" cannot be confused with a mob
  // nobody wired up.
  assert.deepEqual(silverfishDrops({ type: 'silverfish' }), []);
  assert.deepEqual(silverfishDrops({ type: 'silverfish', playerDamaged: true }), [],
    'still nothing even with kill credit');

  const { manager } = fixture();
  const fish = manager.spawnMob('silverfish', 0, 1, 0);
  fish.playerDamaged = true;
  assert.deepEqual(manager.getMobDeathDrops(fish, () => 0.99), []);
});

test('silverfish award 5 XP with credit and none without', () => {
  assert.equal(SILVERFISH_XP, 5);

  const credited = fixture();
  credited.entities.spawnDroppedItem = () => {};
  const fish = credited.manager.spawnMob('silverfish', 0, 1, 0);
  fish.playerDamaged = true;
  credited.manager.damageMob(fish, 1000, null, false, credited.player);
  for (let i = 0; i < 12; i++) credited.manager.update(0.1, credited.player);
  assert.equal(xpFrom(credited.entities), SILVERFISH_XP, `expected 5 XP, got ${xpFrom(credited.entities)}`);

  const env = fixture();
  env.entities.spawnDroppedItem = () => {};
  const wild = env.manager.spawnMob('silverfish', 0, 1, 0);
  env.manager.damageMob(wild, 1000, null, false, null);
  for (let i = 0; i < 12; i++) env.manager.update(0.1, env.player);
  assert.equal(xpFrom(env.entities), 0, 'no XP without player or tamed-wolf credit');
});

test('the alert area matches the wiki 21x11x21 cube', () => {
  assert.deepEqual(SILVERFISH_ALERT_RANGE, { x: 21, y: 11, z: 21 });
});

test('hitting one silverfish calls the others in range', () => {
  const { manager, player } = fixture();
  const hit = manager.spawnMob('silverfish', 0, 1, 0);
  // Within the 21x11x21 area (half-extents 10.5, 5.5, 10.5).
  const near = manager.spawnMob('silverfish', 8, 1, 0);
  const nearZ = manager.spawnMob('silverfish', 0, 1, -8);
  // Outside it.
  const far = manager.spawnMob('silverfish', 40, 1, 0);
  const overhead = manager.spawnMob('silverfish', 0, 20, 0);

  const before = [near, nearZ, far, overhead].map(m => m.angerTimer);
  const alerted = alertSilverfish(manager, hit, player);

  assert.equal(alerted.length, 2, `expected 2 responders, got ${alerted.length}`);
  assert.ok(alerted.includes(near) && alerted.includes(nearZ), 'both in-range silverfish responded');
  assert.equal(near.angerTimer, SILVERFISH_ANGER_SECONDS);
  assert.equal(nearZ.angerTimer, SILVERFISH_ANGER_SECONDS);
  assert.equal(near.attacker, player, 'they inherit the attacker');
  assert.equal(far.angerTimer, before[2], 'the distant one is untouched');
  assert.equal(overhead.angerTimer, before[3], 'and so is the one far above');
  assert.ok(before.every(v => v === 0), 'nothing was angry to begin with');
});

test('the real damage path calls the swarm with no manual setup', () => {
  const { manager, player } = fixture();
  const hit = manager.spawnMob('silverfish', 0, 1, 0);
  const peer = manager.spawnMob('silverfish', 5, 1, 5);
  assert.equal(peer.angerTimer, 0);

  manager.damageMob(hit, 1, null, false, player);
  assert.ok(hit.angerTimer > 0, 'the hit one is angered');
  assert.ok(peer.angerTimer > 0, 'and the peer was called through the damage path');
  assert.equal(peer.attacker, player);
});

test('the alert ignores non-silverfish, the dead and the caller itself', () => {
  const { manager, player } = fixture();
  const hit = manager.spawnMob('silverfish', 0, 1, 0);
  const cow = manager.spawnCow(2, 1, 0);
  const dead = manager.spawnMob('silverfish', 3, 1, 0);
  dead.health = 0;

  const alerted = alertSilverfish(manager, hit, player);
  assert.ok(!alerted.includes(cow), 'cows are not silverfish');
  assert.ok(!alerted.includes(dead), 'the dead do not respond');
  assert.ok(!alerted.includes(hit), 'the caller does not alert itself');
  assert.equal(alertSilverfish(manager, cow, player).length, 0, 'a non-silverfish caller alerts nobody');
});

test('the anger window decays', () => {
  const { manager, player } = fixture();
  const fish = manager.spawnMob('silverfish', 0, 1, 0);
  angerSilverfish(fish, player);
  assert.ok(fish.angerTimer > 0);
  updateSilverfishAnger(fish, SILVERFISH_ANGER_SECONDS + 1);
  assert.equal(fish.angerTimer, 0, 'the retaliation window expires');
  assert.equal(isSilverfish(fish), true);
  assert.equal(angerSilverfish({ type: 'cow' }, player), false, 'only silverfish');
});

test('silverfish chase the player and bite at the reference damage', () => {
  const { manager, player } = fixture({ difficulty: 'normal' });
  const fish = manager.spawnMob('silverfish', 0, 1, 6);
  player.position.set(0, 1, 0);
  const before = fish.mesh.position.clone();

  // Chases through the real loop so locomotion is exercised, not just the decision.
  for (let i = 0; i < 180; i++) manager.update(1 / 60, player);
  assert.ok(fish.mesh.position.distanceTo(before) > 0.5,
    'a silverfish should close on the player');

  // It will already have bitten during that chase, so measure the controlled bite from here.
  const healthBefore = player.health;
  const eventsBefore = player.damageEvents;
  fish.mesh.position.set(0, 1, SILVERFISH_ATTACK_REACH - 0.1);
  fish.hitCooldown = 0;
  assert.equal(updateSilverfishHunt(manager, fish, 1 / 60, player), true, 'it acted');
  assert.equal(player.damageEvents, eventsBefore + 1, 'it bit the player once');
  assert.equal(player.health, healthBefore - 1, 'wiki: 1 damage on Normal');
  assert.ok(fish.hitCooldown > 0, 'the bite went on cooldown');
});

test('a hard-difficulty silverfish bites for 1.5', () => {
  const { manager, player } = fixture({ difficulty: 'hard' });
  const fish = manager.spawnMob('silverfish', 0, 1, 0);
  fish.mesh.position.set(0, 1, SILVERFISH_ATTACK_REACH - 0.1);
  fish.hitCooldown = 0;
  updateSilverfishHunt(manager, fish, 1 / 60, player);
  assert.equal(player.health, 18.5, 'wiki: 1.5 damage on Hard');
});

test('a silverfish on Peaceful deals no damage', () => {
  const { manager, player } = fixture({ difficulty: 'peaceful' });
  const fish = manager.spawnMob('silverfish', 0, 1, 0);
  fish.mesh.position.set(0, 1, SILVERFISH_ATTACK_REACH - 0.1);
  fish.hitCooldown = 0;
  updateSilverfishHunt(manager, fish, 1 / 60, player);
  assert.equal(player.damageEvents, 0, 'no damage on Peaceful');
});

test('silverfish are arthropods and immune to Infested', () => {
  const { manager } = fixture();
  const fish = manager.spawnMob('silverfish', 0, 1, 0);
  // Wiki: arthropod; immune to the Infested status effect.
  assert.equal(fish.isArthropod, true);
  assert.equal(fish.infestedImmune, true);
});

test('the Inspector can spawn the silverfish and it is in the debug list', () => {
  assert.ok(DEBUG_MOBS.includes('silverfish'), 'silverfish must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const fish = s.reset('silverfish');
  assert.equal(fish.type, 'silverfish', 'the Inspector spawns a real silverfish');
  assert.equal(s.snapshot().health, 8, 'Inspector telemetry shows 8 HP');
  assert.equal(s.snapshot().maxHealth, 8);
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 8);
});

test('a silverfish walks and animates without breaking the update loop', () => {
  const { manager, player } = fixture();
  const fish = manager.spawnMob('silverfish', 0, 1, 0);
  player.position.set(6, 1, 0);
  assert.doesNotThrow(() => {
    for (let i = 0; i < 240; i++) manager.update(1 / 60, player);
  });
  assert.ok(manager.mobs.includes(fish), 'still alive');
  assert.ok((fish.silverfishPhase || 0) > 0, 'the leg scuttle advanced');
  assert.ok(fish.mesh.position.y > 0.5, `should rest on the ground, y=${fish.mesh.position.y}`);
});

test('a whole swarm responds to one hit across the real loop', () => {
  const { manager, player } = fixture();
  const fish = [];
  for (let i = 0; i < 6; i++) fish.push(manager.spawnMob('silverfish', i * 2, 1, 0));
  manager.damageMob(fish[0], 1, null, false, player);
  const angry = manager.mobs.filter(m => m.type === 'silverfish' && m.angerTimer > 0);
  assert.equal(angry.length, 6, `the whole swarm should respond, got ${angry.length}`);
});
