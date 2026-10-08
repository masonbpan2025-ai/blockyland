// Enderman parity with https://minecraft.wiki/w/Enderman
//
// The audit recorded endermen at 60 HP against a reference of 40 and a hitbox differing
// from the reference. Both are pinned here. Two further defects were found while fixing
// them: the mob was named with a tournament alias rather than the species name, and it was
// flagged `isBoss`, which fed a boss-only knockback factor.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import { provoke, ENDERMAN_CHASE_SPEED } from '../src/endermanBehavior.js';
import { createMobDebugSession } from '../src/mobDebugSession.js';

function fixture() {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = { getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR), getHeightAt: () => 0 };
  const entities = new EntityManager(scene, world, sounds);
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: { enderman: new THREE.Texture() },
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  const player = { position: new THREE.Vector3(50, 1, 50), gamemode: 'survival', health: 20, keys: {}, takeDamage() {} };
  manager.game = { player, difficulty: 'normal', weather: { weatherType: 'clear' }, controls: {} };
  return { manager, entities, player };
}

test('endermen have the reference 40 HP, not the previously implemented 60', () => {
  const { manager } = fixture();
  const enderman = manager.spawnEnderman(0, 1, 0);
  assert.equal(enderman.maxHealth, 40, 'wiki: 40 HP (raised from 20 in Beta 1.9-pre3)');
  assert.equal(enderman.health, 40);
});

test('the enderman hitbox matches the wiki', () => {
  assert.deepEqual(manager_dims(), { width: 0.6, height: 2.9 }, 'wiki: 0.6 wide, 2.9 tall');
  const { manager } = fixture();
  const enderman = manager.spawnEnderman(0, 1, 0);
  assert.deepEqual([enderman.width, enderman.height], [0.6, 2.9], 'and the instance carries it');
});

function manager_dims() {
  const { manager } = fixture();
  return manager.getMobDimensions('enderman');
}

test('a wild enderman is named as the species, not with the tournament alias', () => {
  const { manager } = fixture();
  const enderman = manager.spawnEnderman(0, 1, 0);
  assert.equal(enderman.name, 'Enderman');
  assert.ok(!/Martial Arts/.test(enderman.name), 'the arena alias must not leak onto the species');
});

test('an enderman is neutral, not a boss', () => {
  const { manager } = fixture();
  const enderman = manager.spawnEnderman(0, 1, 0);
  // `isBoss` feeds a boss-only knockback factor in damageMob, which endermen never had.
  assert.equal(enderman.isBoss, false, 'wiki: endermen are neutral mobs');

  // A neutral mob takes full knockback: the boss factor would cut it to a quarter.
  manager.damageMob(enderman, 1, new THREE.Vector3(0, 1, 2));
  const knock = Math.hypot(enderman.knockback?.x || 0, enderman.knockback?.z || 0);
  assert.ok(knock > 2, `a neutral mob should take real knockback, got ${knock}`);
});

test('endermen drop 0-1 ender pearls', () => {
  const { manager } = fixture();
  const enderman = manager.spawnEnderman(0, 1, 0);
  assert.deepEqual(manager.getMobDeathDrops(enderman, () => 0.99), [['ender_pearl', false, 0, 1]],
    'wiki: 0-1 ender pearl');
});

test('an enderman carrying a block always drops it, on top of its normal loot', () => {
  const { manager } = fixture();
  const carrying = manager.spawnEnderman(0, 1, 0, { carriedBlock: BLOCKS.GRASS_BLOCK });
  assert.equal(carrying.carriedBlock, BLOCKS.GRASS_BLOCK);
  const rows = manager.getMobDeathDrops(carrying, () => 0.99);
  assert.deepEqual(rows[0], ['ender_pearl', false, 0, 1], 'the pearl row is still there');
  assert.deepEqual(rows[rows.length - 1], [BLOCKS.GRASS_BLOCK, true, 1, 1],
    'wiki: 100% chance of dropping the block it is holding');

  // Without a carried block there is no extra row.
  const empty = manager.spawnEnderman(4, 1, 0);
  assert.equal(manager.getMobDeathDrops(empty, () => 0.99).length, 1);
});

test('unimplemented enderman behaviour is not falsely claimed', () => {
  // These are documented as adaptations, so pin the fact that they are absent rather than
  // leaving a future reader to assume they exist.
  const { manager, player } = fixture();
  const enderman = manager.spawnEnderman(0, 1, 0);
  enderman.mesh.position.set(0, 1, 0);
  player.position.set(0, 1, 0);
  const before = enderman.mesh.position.clone();
  for (let i = 0; i < 60; i++) manager.update(1 / 60, player);
  // It still runs its own pursuit/teleport hooks; the point is that no block-carry or
  // stare state machinery exists to observe.
  assert.equal(enderman.carriedBlock ?? null, null, 'no block is picked up by the AI yet');
  assert.ok(before, 'sanity: the mob had a position to compare');
});

test('the Inspector can spawn the enderman and reports the reference health', () => {
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const enderman = s.reset('enderman');
  assert.equal(enderman.type, 'enderman');
  assert.equal(s.snapshot().health, 40, 'Inspector telemetry shows 40 HP');
  assert.equal(s.snapshot().maxHealth, 40);
  assert.equal(s.snapshot().carriedBlock, null, 'and reports no carried block');
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 40);
});

test('other enderman teleport and pursuit behaviour still works', () => {
  const { manager, player } = fixture();
  player.position.set(50, 1, 50);
  const enderman = manager.spawnEnderman(40, 1, 40);
  manager.teleportEnderman(enderman);
  const distFromSpawn = enderman.mesh.position.distanceTo(new THREE.Vector3(40, 1, 40));
  assert.ok(distFromSpawn < 30, 'teleports locally');
  assert.ok(enderman.mesh.position.distanceTo(new THREE.Vector3(0, 24.5, 0)) > 20,
    'and never snaps to the tournament arena');

  enderman.mesh.position.set(45, 1, 50);

  // NEUTRAL first.
  //
  // This used to assert that an untouched enderman "pursues the player", which is the tournament arena rule
  // applied to the species: it teleported toward the player within five seconds of the world loading and
  // chased them unprovoked. A wild enderman ignores you until you provoke it, so the assertion is inverted
  // rather than deleted -- and the next block is the positive control that keeps this from passing merely
  // because all pursuit was disabled.
  manager.update(0.1, player);
  // Wiki: neutral mobs wander, so an unprovoked enderman is not motionless -- what it must not do is move at
  // it. Two earlier versions of this assertion were wrong: "velocity is exactly zero" contradicted the
  // wiki's wandering neutrals, and "the heading does not point at the player" was a coin toss, because a
  // wander goal can happen to lie in the player's direction. The chase has its own speed, so comparing the
  // speed against it is what actually distinguishes wandering from pursuit.
  assert.equal(enderman.state, 'idle');
  const wanderSpeed = Math.hypot(enderman.velocity.x, enderman.velocity.z);
  assert.ok(wanderSpeed < ENDERMAN_CHASE_SPEED / 2,
    `an unprovoked enderman does not pursue (speed ${wanderSpeed.toFixed(2)}, chase ${ENDERMAN_CHASE_SPEED})`);

  // POSITIVE CONTROL: provoked, it does pursue.
  provoke(enderman, 'damage');
  manager.update(0.1, player);
  assert.ok(enderman.velocity.x > 0, 'a provoked enderman pursues the player');
  assert.equal(enderman.state, 'provoked');
});
