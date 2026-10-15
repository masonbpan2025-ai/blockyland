// Endermite parity with https://minecraft.wiki/w/Endermite
//
// Endermite was another of the 38 missing types, and the one the Enderman's aggression rule
// was explicitly blocked on in the assessment ("Endermite aggression is not implemented, and
// cannot be until endermites exist"). This suite covers both halves.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import {
  ENDERMITE_HEALTH, ENDERMITE_DIMENSIONS, ENDERMITE_XP, ENDERMITE_DAMAGE,
  ENDERMITE_SIGHT_RANGE, ENDERMITE_PEARL_SPAWN_CHANCE, ENDERMITE_LIFETIME_SECONDS,
  ENDERMAN_ENDERMITE_RANGE, ENDERMITE_ATTACK_REACH,
  isEndermite, endermiteDamageFor, endermiteDrops, rollEndermiteSpawn,
  spawnEndermiteForPearl, updateEndermiteLifetime, updateEndermanEndermiteAggression,
  updateEndermiteHunt, createEndermiteModel, poseEndermiteLegs
} from '../src/endermiteBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ difficulty = 'normal', solid = () => false } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = { getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR), getHeightAt: () => 0, getLightLevel: () => 0 };
  const entities = new EntityManager(scene, world, sounds);
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {},
    isBlockSolid: (x, y, z) => solid(x, y, z) || world.getVoxel(x, y, z) === BLOCKS.STONE
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

test('endermite is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const mite = manager.spawnMob('endermite', 0, 1, 0);
  assert.equal(mite.type, 'endermite');
  assert.equal(mite.name, 'Endermite');
  assert.notEqual(mite.type, 'villager');
});

test('endermites have the reference 8 HP and the smallest hostile hitbox', () => {
  const { manager } = fixture();
  const mite = manager.spawnMob('endermite', 0, 1, 0);
  assert.equal(mite.maxHealth, ENDERMITE_HEALTH);
  assert.equal(mite.maxHealth, 8, 'wiki: 8 HP');
  assert.equal(mite.health, 8);
  // Wiki: 0.4 x 0.3, the smallest hostile hitbox in the game.
  assert.deepEqual(ENDERMITE_DIMENSIONS, { width: 0.4, height: 0.3 });
  assert.deepEqual(manager.getMobDimensions('endermite'), { width: 0.4, height: 0.3 });
  assert.deepEqual([mite.width, mite.height], [0.4, 0.3]);
});

test('the model has a rounded body, one emissive eye, antennae and six legs', () => {
  const { manager } = fixture();
  const mite = manager.spawnMob('endermite', 0, 1, 0);
  assert.ok(mite.head, 'head');
  assert.ok(mite.body, 'body');
  assert.equal(mite.legs.length, 6, 'six legs, as an arthropod');
  assert.equal(mite.eyes.length, 1, 'the single eye the wiki describes as glowing');
  // Its eye material is emissive, not a Lambert body material.
  assert.notEqual(mite.eyeMat.type, mite.bodyMat.type);
  const antennae = mite.head.children.filter(c => c.geometry?.parameters?.depth === 0.16);
  assert.equal(antennae.length, 2, 'two antennae');
});

test('the legs animate in two alternating groups', () => {
  const bodyMat = new THREE.MeshLambertMaterial();
  const eyeMat = new THREE.MeshBasicMaterial();
  const model = createEndermiteModel(bodyMat, eyeMat);
  const before = model.legs.map(l => l.mesh.position.x);
  poseEndermiteLegs(model, Math.PI / 2);
  const deltas = model.legs.map((l, i) => l.mesh.position.x - before[i]);
  assert.ok(deltas.some(d => Math.abs(d) > 1e-9), 'the pose moved the legs');
  assert.equal(Math.sign(deltas[0]), -Math.sign(deltas[1]), 'adjacent legs alternate');
  assert.equal(Math.sign(deltas[0]), Math.sign(deltas[2]), 'every other leg shares a group');
  assert.doesNotThrow(() => poseEndermiteLegs({}, 1));
  assert.doesNotThrow(() => poseEndermiteLegs(null, 1));
});

test('the damage table matches the wiki', () => {
  // Wiki: 2 on Easy and Normal, 3 on Hard.
  assert.deepEqual(ENDERMITE_DAMAGE, { peaceful: 0, easy: 2, normal: 2, hard: 3 });
  assert.equal(endermiteDamageFor('easy'), 2);
  assert.equal(endermiteDamageFor('normal'), 2);
  assert.equal(endermiteDamageFor('hard'), 3);
  assert.equal(endermiteDamageFor('peaceful'), 0, 'no damage on Peaceful');
  assert.equal(endermiteDamageFor('nonsense'), ENDERMITE_DAMAGE.normal, 'unknown falls back to normal');
});

test('endermites drop nothing, only 3 XP', () => {
  // Wiki: "Endermites drop 3 experience orbs when killed by a player or tamed wolf", and no
  // items. Asserted explicitly so "no drops" is not confused with an unwired mob.
  assert.deepEqual(endermiteDrops({ type: 'endermite' }), []);
  const { manager } = fixture();
  const mite = manager.spawnMob('endermite', 0, 1, 0);
  mite.playerDamaged = true;
  assert.deepEqual(manager.getMobDeathDrops(mite, () => 0.99), []);
});

test('endermites award 3 XP with credit and none without', () => {
  assert.equal(ENDERMITE_XP, 3);

  const credited = fixture();
  credited.entities.spawnDroppedItem = () => {};
  const mite = credited.manager.spawnMob('endermite', 0, 1, 0);
  mite.playerDamaged = true;
  credited.manager.damageMob(mite, 1000, null, false, credited.player);
  for (let i = 0; i < 12; i++) credited.manager.update(0.1, credited.player);
  assert.equal(xpFrom(credited.entities), ENDERMITE_XP, `expected 3 XP, got ${xpFrom(credited.entities)}`);

  const env = fixture();
  env.entities.spawnDroppedItem = () => {};
  const wild = env.manager.spawnMob('endermite', 0, 1, 0);
  env.manager.damageMob(wild, 1000, null, false, null);
  for (let i = 0; i < 12; i++) env.manager.update(0.1, env.player);
  assert.equal(xpFrom(env.entities), 0, 'no XP without credit');
});

test('the ender pearl spawn chance is 5% and spawns only on the roll', () => {
  assert.equal(ENDERMITE_PEARL_SPAWN_CHANCE, 0.05);
  assert.equal(rollEndermiteSpawn(() => 0.01), true, 'below the threshold spawns');
  assert.equal(rollEndermiteSpawn(() => 0.5), false, 'above the threshold does not');
  assert.equal(rollEndermiteSpawn(() => 0.0499), true);
  assert.equal(rollEndermiteSpawn(() => 0.05), false, 'the threshold is exclusive');

  const { manager } = fixture();
  const at = new THREE.Vector3(3, 1, 3);
  assert.equal(spawnEndermiteForPearl(manager, at, { random: () => 0.9 }), null, 'a failed roll spawns nothing');
  assert.equal(manager.mobs.length, 0);

  const spawned = spawnEndermiteForPearl(manager, at, { random: () => 0.001 });
  assert.ok(spawned, 'a successful roll spawns one');
  assert.equal(spawned.type, 'endermite');
  assert.equal(spawned.fromEnderPearl, true, 'and it is marked as pearl-spawned');
  assert.deepEqual([spawned.mesh.position.x, spawned.mesh.position.z], [3, 3], 'at the supplied site');
});

test('the pearl spawn helper is safe with no manager or no position', () => {
  assert.equal(spawnEndermiteForPearl(null, new THREE.Vector3()), null);
  const { manager } = fixture();
  assert.equal(spawnEndermiteForPearl(manager, null, { force: true }), null);
  // `force` bypasses the roll, for a caller that has already rolled.
  assert.ok(spawnEndermiteForPearl(manager, new THREE.Vector3(1, 1, 1), { force: true }));
});

test('an endermite despawns after two minutes', () => {
  assert.equal(ENDERMITE_LIFETIME_SECONDS, 120, 'wiki: 2 minutes, or around 2400 ticks');

  const { manager } = fixture();
  const mite = manager.spawnMob('endermite', 0, 1, 0);
  // Just short of the limit: still present.
  for (let i = 0; i < 119; i++) updateEndermiteLifetime(manager, mite, 1);
  assert.equal(manager.mobs.includes(mite), true, 'still alive at 119 seconds');
  assert.equal(mite.lifetime, 119);

  const removed = updateEndermiteLifetime(manager, mite, 1);
  assert.equal(removed, true, 'it despawned at 120 seconds');
  assert.equal(manager.mobs.includes(mite), false, 'and left the mob list');
  assert.equal(mite.mesh.parent, null, 'and the scene');
  assert.equal(mite.despawned, true);
});

test('a named endermite never despawns', () => {
  const { manager } = fixture();
  const mite = manager.spawnMob('endermite', 0, 1, 0);
  // A name tag sets both the name and the persistent flag; either should prevent despawn.
  mite.name = 'Mitey';
  for (let i = 0; i < 200; i++) updateEndermiteLifetime(manager, mite, 1);
  assert.equal(manager.mobs.includes(mite), true, 'a named endermite is permanent');
  assert.equal(mite.lifetime, 0, 'and its lifetime does not run down');

  const flagged = manager.spawnMob('endermite', 4, 1, 0);
  flagged.persistent = true;
  for (let i = 0; i < 200; i++) updateEndermiteLifetime(manager, flagged, 1);
  assert.equal(manager.mobs.includes(flagged), true, 'the persistent flag is enough');
});

test('the lifetime helper ignores non-endermites and the dead', () => {
  const { manager } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(updateEndermiteLifetime(manager, cow, 1000), false, 'a cow is not an endermite');
  assert.equal(manager.mobs.includes(cow), true);
  assert.equal(isEndermite(cow), false);

  const dead = manager.spawnMob('endermite', 4, 1, 0);
  dead.health = 0;
  assert.equal(updateEndermiteLifetime(manager, dead, 1000), false, 'the dead are skipped');
});

test('endermen hunt endermites within 64 blocks', () => {
  assert.equal(ENDERMAN_ENDERMITE_RANGE, 64);
  const { manager } = fixture();
  const enderman = manager.spawnMob('enderman', 0, 1, 0);
  const near = manager.spawnMob('endermite', 0, 1, 30);
  const far = manager.spawnMob('endermite', 0, 1, 200);

  const engaged = updateEndermanEndermiteAggression(manager);
  assert.equal(engaged.length, 1, `expected one pairing, got ${engaged.length}`);
  assert.equal(engaged[0].enderman, enderman);
  assert.equal(engaged[0].mite, near);
  assert.equal(enderman.endermiteTarget, near, 'the enderman targets the near endermite');
  assert.equal(near.endermanTarget, enderman, 'and the endermite targets it back');
  assert.equal(far.endermanTarget ?? null, null, 'the distant one is untouched');
});

test('a wall blocks the enderman hunt, since the wiki requires line of sight', () => {
  // Solid everywhere except the mobs' own tiles: no clear line of sight.
  const { manager } = fixture({ solid: (x, y, z) => (x > 0 && x < 4) });
  const enderman = manager.spawnMob('enderman', 0, 1, 0);
  const mite = manager.spawnMob('endermite', 8, 1, 0);
  const engaged = updateEndermanEndermiteAggression(manager);
  assert.equal(engaged.length, 0, 'the wall prevents the pairing');
  assert.equal(enderman.endermiteTarget ?? null, null);
  assert.equal(mite.endermanTarget ?? null, null);
});

test('the pairing runs in the real update loop without manual setup', () => {
  const { manager, player } = fixture();
  manager.spawnMob('enderman', 0, 1, 0);
  manager.spawnMob('endermite', 0, 1, 10);
  player.position.set(0, 1, 0);
  manager.update(1 / 60, player);
  const enderman = manager.mobs.find(m => m.type === 'enderman');
  const mite = manager.mobs.find(m => m.type === 'endermite');
  assert.ok(enderman.endermiteTarget, 'the enderman acquired the endermite automatically');
  assert.equal(mite.endermanTarget, enderman);
});

test('endermites chase players within 16 blocks and bite', () => {
  assert.equal(ENDERMITE_SIGHT_RANGE, 16);

  const far = fixture();
  const distant = far.manager.spawnMob('endermite', 0, 1, 40);
  far.player.position.set(0, 1, 0);
  updateEndermiteHunt(far.manager, distant, 1 / 60, far.player);
  assert.equal(distant.velocity.x, 0, 'beyond 16 blocks it does not chase');
  assert.equal(distant.velocity.z, 0);

  const near = fixture();
  const mite = near.manager.spawnMob('endermite', 0, 1, 10);
  near.player.position.set(0, 1, 0);
  updateEndermiteHunt(near.manager, mite, 1 / 60, near.player);
  assert.ok(Math.hypot(mite.velocity.x, mite.velocity.z) > 0.5, 'inside 16 blocks it chases');

  // Bite.
  mite.mesh.position.set(0, 1, ENDERMITE_ATTACK_REACH - 0.1);
  mite.attackCooldown = 0;
  const before = near.player.health;
  updateEndermiteHunt(near.manager, mite, 1 / 60, near.player);
  assert.equal(near.player.health, before - 2, 'wiki: 2 damage on Normal');
  assert.ok(mite.attackCooldown > 0, 'the bite went on cooldown');
});

test('an endermite fights an enderman when one is targeting it', () => {
  const { manager, player } = fixture();
  const enderman = manager.spawnMob('enderman', 0, 1, 0);
  const mite = manager.spawnMob('endermite', 0, 1, 0);
  // Place them adjacent so the mite can reach.
  mite.mesh.position.set(0, 1, ENDERMITE_ATTACK_REACH - 0.1);
  mite.endermanTarget = enderman;
  const before = enderman.health;
  updateEndermiteHunt(manager, mite, 1 / 60, player);
  assert.ok(enderman.health < before, `wiki: endermites attack endermen, was ${before}, now ${enderman.health}`);
});

test('endermites are arthropods', () => {
  const { manager } = fixture();
  const mite = manager.spawnMob('endermite', 0, 1, 0);
  assert.equal(mite.isArthropod, true);
});

test('the Inspector can spawn the endermite and it is in the debug list', () => {
  assert.ok(DEBUG_MOBS.includes('endermite'), 'endermite must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const mite = s.reset('endermite');
  assert.equal(mite.type, 'endermite', 'the Inspector spawns a real endermite');
  assert.equal(s.snapshot().health, 8, 'Inspector telemetry shows 8 HP');
  assert.equal(s.snapshot().maxHealth, 8);
  assert.equal(typeof s.snapshot().lifetime, 'number', 'and the lifetime countdown');
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 8);
});

test('an endermite walks and animates without breaking the update loop', () => {
  const { manager, player } = fixture();
  const mite = manager.spawnMob('endermite', 0, 1, 0);
  player.position.set(6, 1, 0);
  assert.doesNotThrow(() => {
    for (let i = 0; i < 240; i++) manager.update(1 / 60, player);
  });
  assert.ok(manager.mobs.includes(mite), 'still alive');
  assert.ok((mite.endermitePhase || 0) > 0, 'the leg scuttle advanced');
  assert.ok(mite.mesh.position.y > 0.5, `should rest on the ground, y=${mite.mesh.position.y}`);
});
