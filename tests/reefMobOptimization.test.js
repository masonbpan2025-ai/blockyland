import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS } from '../src/blocks.js';
import { findPufferfishThreat, AQUATIC_TYPES, updatePufferfishPuff } from '../src/fishBehavior.js';
import { originalMobCollisions, originalPufferfishThreat, originalAquaticMob } from './helpers/reefMobBaseline.js';
import { originalCheckMobCollision } from './helpers/reefMobCollisionBaseline.js';
import { makeMob, makeManager, reefFixture, realReefFixture, snapshot, withRandom } from './helpers/reefMobFixture.js';

function collisionCase() {
  const mobs = [makeMob('horse', 0, 20, 0, { isBaby: true }),
    makeMob('squid', .1, 20, 0, { isBaby: true }),
    makeMob('pufferfish', .2, 20, 0, { width: .7, height: .7 }),
    makeMob('dolphin', .2, 20, 0), makeMob('tropical_fish', .2, 20, 0),
    makeMob('giant', 5, 20, 0), makeMob('cod', 6.7, 20, 0),
    makeMob('pig', 0, 23, 0), makeMob('cow', .1, 20, 0, { health: 0 }),
    makeMob('cow', .1, 20, 0, { dying: true }), { type: 'cow', health: 10 }];
  mobs[0].rider = mobs[1];
  // Zero values take the original fallback; overrides must not be silently clamped.
  mobs.push(makeMob('unknown', 2, 20, 0, { width: 0, height: 0 }));
  const manager = makeManager(mobs, { voxel: (x, y, z) => x === -1 || z === -1 ? BLOCKS.STONE : BLOCKS.WATER });
  return manager;
}

test('collision output exactly matches captured original for babies, puffed fish, riders, walls, dead and coincident mobs', () => {
  const original = collisionCase(), optimized = collisionCase();
  original.checkMobCollision = originalCheckMobCollision;
  for (let frame = 0; frame < 12; frame++) {
    originalMobCollisions.call(original, 1 / 60);
    optimized.applyMobCollisions(1 / 60);
    assert.deepEqual(snapshot(optimized.mobs), snapshot(original.mobs));
  }
});

for (const dense of [false, true]) test(`hundreds of ${dense ? 'crowded' : 'spread'} reef mobs preserve exact collision trajectory`, () => {
  const original = reefFixture(400, { dense }), optimized = reefFixture(400, { dense });
  for (let frame = 0; frame < 8; frame++) {
    originalMobCollisions.call(original, 1 / 60);
    optimized.applyMobCollisions(1 / 60);
    assert.deepEqual(snapshot(optimized.mobs), snapshot(original.mobs));
  }
});

test('collision dimensions are refreshed once per active mob on every pass, including size changes', () => {
  const manager = reefFixture(300, { countDimensions: true });
  manager.applyMobCollisions();
  assert.equal(manager.dimensionCalls, 300);
  manager.mobs[0].isBaby = !manager.mobs[0].isBaby;
  manager.mobs[1].width = .7; manager.mobs[1].height = .7;
  manager.mobs.push(makeMob('horse', 200, 20, 0, { isBaby: true }));
  manager.dimensionCalls = 0;
  manager.applyMobCollisions();
  assert.equal(manager.dimensionCalls, 301);
  const baseline = collisionCase(), optimized = collisionCase();
  originalMobCollisions.call(baseline); optimized.applyMobCollisions();
  for (const m of [baseline.mobs[0], optimized.mobs[0]]) m.isBaby = false;
  for (const m of [baseline.mobs[2], optimized.mobs[2]]) { m.width = .35; m.height = .35; }
  originalMobCollisions.call(baseline); optimized.applyMobCollisions();
  assert.deepEqual(snapshot(optimized.mobs), snapshot(baseline.mobs));
});

test('pufferfish threats preserve player-first and array-order ties, strict range and aquatic exceptions', () => {
  const fish = makeMob('pufferfish', 0, 0, 0);
  const player = { type: 'player', position: new THREE.Vector3(1, 0, 0) };
  const first = makeMob('cow', -1, 0, 0), second = makeMob('pig', 1, 0, 0);
  const manager = makeManager([fish, first, second]);
  assert.equal(findPufferfishThreat(manager, fish, player), player);
  assert.equal(findPufferfishThreat(manager, fish), first);
  for (const type of AQUATIC_TYPES) {
    const candidate = makeMob(type, .5, 0, 0);
    manager.mobs = [fish, candidate];
    assert.equal(findPufferfishThreat(manager, fish), type === 'axolotl' ? candidate : null);
  }
  manager.mobs = [fish, makeMob('cow', .1, 0, 0, { health: 0 }),
    { type: 'pig', health: 10 }, makeMob('cow', 3.5, 0, 0)];
  assert.equal(findPufferfishThreat(manager, fish), null);
  manager.mobs.push({ type: 'cow', health: 10, position: new THREE.Vector3(2, 0, 0) });
  for (const p of [null, player, { type: 'dolphin', position: player.position }]) {
    assert.equal(findPufferfishThreat(manager, fish, p), originalPufferfishThreat(manager, fish, p));
  }
  assert.equal(findPufferfishThreat(undefined, fish), null);
  assert.equal(findPufferfishThreat(manager, makeMob('cod')), null);
});

test('threat selection matches captured original in a mixed 600-mob population', () => {
  const manager = reefFixture(600);
  manager.mobs.push(makeMob('axolotl', 1, 20, 1), makeMob('cow', 9, 20, 9));
  const player = { type: 'player', position: new THREE.Vector3(8, 20, 8) };
  for (const fish of manager.mobs.filter(m => m.type === 'pufferfish'))
    assert.equal(findPufferfishThreat(manager, fish, player), originalPufferfishThreat(manager, fish, player));
});

test('puff stage and dimensions still follow exact inner and outer boundaries', () => {
  const fish = makeMob('pufferfish', 0, 0, 0), manager = makeManager([fish]);
  const player = { type: 'player', position: new THREE.Vector3() };
  for (const [distance, stage, width] of [[1.8, 'puffed', .7], [1.80001, 'semi', .49], [3.49999, 'semi', .49], [3.5, 'unpuffed', .35]]) {
    player.position.x = distance;
    updatePufferfishPuff(manager, fish, player);
    assert.equal(fish.puffStage, stage); assert.equal(fish.width, width); assert.equal(fish.height, width);
  }
});

for (const habitat of ['open', 'coral', 'blocked', 'dry']) test(`aquatic ${habitat} updates preserve targets, RNG draws, movement and collision-query order`, () => {
  const voxel = (x, y, z) => habitat === 'dry' ? BLOCKS.AIR
    : habitat === 'coral' && (x === 3 || z === -2) ? BLOCKS.STONE : BLOCKS.WATER;
  function fixture() {
    const manager = makeManager([makeMob('tropical_fish', 0, 20, 0),
      makeMob('pufferfish', 2, 20, 2), makeMob('dolphin', 4, 20, 4)], { voxel });
    manager.queries = [];
    manager.checkMobCollision = (mob, pos, dims) => {
      manager.queries.push([mob.type, ...pos.toArray()]);
      return habitat === 'blocked' || MobManager.prototype.checkMobCollision.call(manager, mob, pos, dims);
    };
    return manager;
  }
  const original = fixture(), optimized = fixture();
  function simulate(manager, method) {
    return withRandom(1234, () => {
      for (let frame = 0; frame < 90; frame++) for (const mob of manager.mobs) method.call(manager, mob, 1 / 60, null);
      return snapshot(manager.mobs);
    });
  }
  assert.deepEqual(simulate(optimized, optimized.updateAquaticMob), simulate(original, originalAquaticMob));
  assert.deepEqual(optimized.queries, original.queries);
  if (habitat === 'open') {
    assert.notEqual(optimized.mobs[0].targetPos, optimized.mobs[1].targetPos);
    assert.notEqual(optimized.mobs[0].targetPos, optimized._aquaticScratch.point);
  }
});

test('aquatic target refresh resolves base dimensions once while keeping all 183 collision checks', () => {
  const manager = reefFixture(1, { aquaticOnly: true, countDimensions: true });
  let checks = 0;
  const check = manager.checkMobCollision;
  manager.checkMobCollision = function (...args) { checks++; return check.apply(this, args); };
  manager.updateAquaticMob(manager.mobs[0], 1 / 60, null);
  assert.equal(checks, 183);
  assert.equal(manager.dimensionCalls, 1);
});

test('real models and full mob update preserve trajectory against original collision and aquatic methods', () => {
  const original = realReefFixture(120), optimized = realReefFixture(120);
  original.applyMobCollisions = originalMobCollisions;
  original.updateAquaticMob = originalAquaticMob;
  original.checkMobCollision = originalCheckMobCollision;
  const simulate = manager => withRandom(888, () => {
    for (let frame = 0; frame < 60; frame++) manager.update(1 / 60, manager.game.player);
    assert.equal(manager.mobErrors.size, 0);
    return { mobs: snapshot(manager.mobs), player: manager.game.player.position.toArray() };
  });
  try { assert.deepEqual(simulate(optimized), simulate(original)); }
  finally { original.clearMobs(); optimized.clearMobs(); }
});
