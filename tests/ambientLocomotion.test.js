// Ambient locomotion for mobs that have no dedicated AI branch.
//
// The shared update loop does not apply `velocity` itself: a mob moves only if its own update
// branch sets a velocity and calls a mover. Eleven advertised mobs had no such branch, so they
// fell through to `moveGroundMob` carrying a zero velocity and stood in `state: 'idle'` forever —
// healthy, error-free and completely inert. The mooshroom was the clearest case: brought to parity
// on stats, drops, breeding and shearing, and it had never walked.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import {
  HOSTILE_LOCOMOTION, PASSIVE_LOCOMOTION, locomotionFor, hasAmbientLocomotion,
  updateAmbientLocomotion
} from '../src/ambientLocomotion.js';

function fixture({ playerAt = new THREE.Vector3(12, 1, 0), worldTime = 18000 } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = { getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR), getHeightAt: () => 0, getLightLevel: () => 0, setVoxel() {} };
  const entities = new EntityManager(scene, world, sounds);
  entities.spawnDroppedItem = () => {};
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, random: () => 0.5, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  const player = {
    position: playerAt.clone(), velocity: new THREE.Vector3(), gamemode: 'survival', health: 100,
    keys: {}, onGround: true, statusEffects: {}, damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; this.health -= n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  manager.game = { player, difficulty: 'normal', worldTime, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  return { manager, player };
}

test('the mobs that had no branch now have a declared role', () => {
  // These are the ones this fix is for. Each was measured frozen before it. `piglin` and `hoglin`
  // are deliberately NOT here: they already have path-following steering of their own, and driving
  // them from this table bypasses it and makes them shudder, which mobJitter.test.js measures.
  for (const type of ['mooshroom', 'polar_bear', 'panda', 'zoglin',
    'ravager', 'witch', 'vindicator', 'evoker', 'warden']) {
    const spec = locomotionFor(type);
    assert.ok(spec, `${type} should have a declared role`);
    assert.ok(['hostile', 'passive'].includes(spec.role), `${type} role`);
    assert.equal(typeof spec.speed, 'number');
  }
  assert.equal(hasAmbientLocomotion('mooshroom'), true);
  assert.equal(hasAmbientLocomotion('cow'), false, 'cow already had its own branch');
  assert.equal(hasAmbientLocomotion('piglin'), false, 'piglin steers itself');
  assert.equal(hasAmbientLocomotion('hoglin'), false, 'hoglin steers itself');
});

test('the passive roles never attack and the hostile ones do', () => {
  for (const [type, spec] of Object.entries(PASSIVE_LOCOMOTION)) {
    assert.equal(spec.speed >= 0, true, `${type} speed`);
  }
  assert.equal(locomotionFor('mooshroom').role, 'passive');
  assert.equal(locomotionFor('mooshroom').damage, 0, 'a mooshroom is not a threat');
  assert.equal(locomotionFor('polar_bear').damage, 0, 'not while merely wandering');
  // Hostiles carry real damage.
  for (const type of ['ravager', 'warden', 'vindicator']) {
    assert.ok(locomotionFor(type).damage > 0, `${type} should hit`);
    assert.ok(locomotionFor(type).attackReach > 0, `${type} needs a reach`);
  }
  // The wiki's big hitters are the big numbers here.
  assert.equal(locomotionFor('warden').damage, 30, 'wiki: warden melee is 30 on Normal');
  assert.equal(locomotionFor('ravager').damage, 12, 'wiki: ravager melee is 12 on Normal');
});

test('no declared role has a nonsense range, speed or reach', () => {
  for (const [type, spec] of Object.entries(HOSTILE_LOCOMOTION)) {
    assert.ok(spec.range > 0, `${type} range must be positive`);
    assert.ok(spec.speed >= 0, `${type} speed cannot be negative`);
    assert.ok(spec.attackReach >= 0, `${type} reach cannot be negative`);
    assert.ok(spec.attackReach <= spec.range || spec.speed === 0,
      `${type} cannot hit from further than it can see`);
    assert.ok(spec.damage >= 0, `${type} damage cannot be negative`);
  }
  for (const [type, spec] of Object.entries(PASSIVE_LOCOMOTION)) {
    assert.ok(spec.speed >= 0, `${type} speed cannot be negative`);
  }
});

test('a hostile mob chases the player when in range', () => {
  const { manager, player } = fixture({ playerAt: new THREE.Vector3(12, 1, 0) });
  const mob = manager.spawnMob('ravager', 0, 1, 0);
  const outcome = updateAmbientLocomotion(manager, mob, 1 / 60, player, { wander: () => { throw new Error('should not wander while chasing'); } });
  assert.equal(outcome, 'chasing');
  assert.equal(mob.state, 'chase');
  assert.ok(Math.hypot(mob.velocity.x, mob.velocity.z) > 0, 'it has a velocity to chase with');
});

test('a hostile mob wanders when the player is out of range', () => {
  const { manager, player } = fixture({ playerAt: new THREE.Vector3(200, 1, 200) });
  const mob = manager.spawnMob('ravager', 0, 1, 0);
  let wandered = 0;
  const outcome = updateAmbientLocomotion(manager, mob, 1 / 60, player, { wander: () => { wandered++; } });
  assert.equal(outcome, 'wandering');
  assert.equal(wandered, 1, 'it falls back to the shared wanderer');
  assert.equal(mob.state, 'idle');
});

test('a passive mob never chases, even with the player on top of it', () => {
  const { manager, player } = fixture({ playerAt: new THREE.Vector3(1, 1, 0) });
  const mob = manager.spawnMob('mooshroom', 0, 1, 0);
  let wandered = 0;
  const outcome = updateAmbientLocomotion(manager, mob, 1 / 60, player, { wander: () => { wandered++; } });
  assert.equal(outcome, 'wandering', 'a mooshroom wanders regardless of the player');
  assert.equal(wandered, 1);
  assert.equal(player.damageTaken, 0, 'and never damages the player');
});

test('a hostile mob in reach damages the player and then waits out its cooldown', () => {
  const { manager, player } = fixture({ playerAt: new THREE.Vector3(0.8, 1, 0) });
  const mob = manager.spawnMob('vindicator', 0, 1, 0);
  updateAmbientLocomotion(manager, mob, 1 / 60, player, { wander: () => {} });
  assert.equal(player.damageTaken, locomotionFor('vindicator').damage, 'one hit lands');
  assert.equal(mob.hitCooldown, 1.0, 'and the cooldown starts');

  // Inside the cooldown: no second hit.
  updateAmbientLocomotion(manager, mob, 1 / 60, player, { wander: () => {} });
  assert.equal(player.damageTaken, locomotionFor('vindicator').damage, 'no double hit');

  // Past the cooldown: it hits again.
  mob.hitCooldown = 0;
  updateAmbientLocomotion(manager, mob, 1 / 60, player, { wander: () => {} });
  assert.equal(player.damageTaken, locomotionFor('vindicator').damage * 2);
});

test('a declared stationary role stays put rather than drifting', () => {
  // The ender dragon and wither are driven by their own event code; the table records that they
  // are deliberately not ambient, so they must not start wandering.
  for (const type of ['ender_dragon', 'wither']) {
    assert.equal(locomotionFor(type).speed, 0, `${type} is declared stationary`);
  }
  const { manager, player } = fixture();
  const mob = manager.spawnMob('wither', 0, 1, 0);
  mob.velocity.set(5, 0, 5);
  const outcome = updateAmbientLocomotion(manager, mob, 1 / 60, player, { wander: () => { throw new Error('must not wander'); } });
  assert.equal(outcome, 'stationary');
  assert.equal(mob.velocity.x, 0);
  assert.equal(mob.velocity.z, 0);
});

test('mobs outside the table are left completely alone', () => {
  const { manager, player } = fixture();
  const cow = manager.spawnMob('cow', 0, 1, 0);
  cow.velocity.set(1, 0, 1);
  const outcome = updateAmbientLocomotion(manager, cow, 1 / 60, player, { wander: () => { throw new Error('must not run'); } });
  assert.equal(outcome, null, 'no opinion about a cow');
  assert.equal(cow.velocity.x, 1, 'and its velocity is untouched');
  assert.equal(updateAmbientLocomotion(manager, null, 0.1, player), null);
  assert.equal(updateAmbientLocomotion(manager, { type: 'nonsense', mesh: { position: new THREE.Vector3() } }, 0.1, player), null);
});

test('a mob with no velocity vector is skipped rather than throwing', () => {
  const { manager, player } = fixture();
  const malformed = { type: 'ravager', mesh: { position: new THREE.Vector3() } };
  assert.doesNotThrow(() => updateAmbientLocomotion(manager, malformed, 1 / 60, player));
});

test('the wanderer takes an injectable random so it can be tested', async () => {
  const { wanderMob } = await import('../src/mobMotion.js');
  const { manager } = fixture();
  const mob = manager.spawnMob('mooshroom', 0, 1, 0);
  mob.wanderTimer = 0;
  // A deterministic random must make the goal choice deterministic and repeatable.
  const run = () => {
    mob.wanderGoal = null;
    mob.wanderTimer = 0;
    let seed = 7;
    const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    wanderMob(manager, mob, 1 / 60, 1.0, random);
    return mob.wanderGoal ? mob.wanderGoal.toArray().map(n => +n.toFixed(4)) : null;
  };
  const first = run();
  const second = run();
  assert.deepEqual(first, second, 'the same random sequence gives the same goal');
  // And it still works with no random passed at all.
  assert.doesNotThrow(() => wanderMob(manager, mob, 1 / 60, 1.0));
});

test('the fix works through the real update loop for every mob it covers', () => {
  const frozen = [];
  for (const type of ['mooshroom', 'polar_bear', 'panda', 'zoglin',
    'ravager', 'witch', 'vindicator', 'evoker', 'warden']) {
    const { manager, player } = fixture();
    const mob = manager.spawnMob(type, 0, 1, 0);
    const start = mob.mesh.position.clone();
    let moved = 0;
    for (let i = 0; i < 600; i++) {
      manager.update(1 / 60, player);
      moved = Math.max(moved, mob.mesh.position.distanceTo(start));
    }
    if (moved < 0.25) frozen.push(`${type}: ${moved.toFixed(3)}`);
    assert.deepEqual([...(manager.mobErrors || [])], [], `${type} reported a fault`);
  }
  assert.deepEqual(frozen, [], `these mobs still do not move: ${frozen.join(', ')}`);
});

test('the mooshroom specifically walks like the cow it is', () => {
  // Both are 0.9 x 1.4 cattle, so if one walks the other should too. This is the case that
  // motivated the whole fix.
  const results = {};
  for (const type of ['mooshroom', 'cow']) {
    const { manager, player } = fixture();
    const mob = manager.spawnMob(type, 0, 1, 0);
    const start = mob.mesh.position.clone();
    let moved = 0;
    for (let i = 0; i < 600; i++) {
      manager.update(1 / 60, player);
      moved = Math.max(moved, mob.mesh.position.distanceTo(start));
    }
    results[type] = moved;
  }
  assert.ok(results.cow > 0.25, `the cow walks (${results.cow.toFixed(2)})`);
  assert.ok(results.mooshroom > 0.25,
    `the mooshroom must walk too, moved ${results.mooshroom.toFixed(2)}`);
});

test('the Inspector still updates covered mobs cleanly', async () => {
  const { createMobDebugSession } = await import('../src/mobDebugSession.js');
  for (const type of ['mooshroom', 'ravager', 'panda', 'warden']) {
    const s = createMobDebugSession(new THREE.Scene(), () => {});
    const mob = s.reset(type);
    assert.equal(mob.type, type);
    assert.doesNotThrow(() => { for (let i = 0; i < 120; i++) s.tick(1 / 60); });
    assert.ok(s.snapshot().health > 0, `${type} is still healthy`);
  }
});
