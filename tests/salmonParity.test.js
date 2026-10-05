// Salmon parity with https://minecraft.wiki/w/Salmon
//
// The audit recorded salmon at 6 HP against a reference of 3 (the pre-18w10a value), noted
// that the three wiki sizes had no certified variant, and that no bucket capture exists.
// Sizes and the Java bone meal drop are covered here.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import {
  SALMON_SIZES, SALMON_BONE_MEAL_CHANCE, rollSalmonSize, salmonBonusDrops, isSalmonSize
} from '../src/salmonBehavior.js';
import { createMobDebugSession } from '../src/mobDebugSession.js';

function fixture() {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = { getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : (y < 3 ? BLOCKS.WATER : BLOCKS.AIR)) };
  const entities = new EntityManager(scene, world, sounds);
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: { salmon: new THREE.Texture() },
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  const player = { position: new THREE.Vector3(0, 1, 0), gamemode: 'survival', health: 20, keys: {}, takeDamage() {} };
  manager.game = { player, difficulty: 'normal', weather: { weatherType: 'clear' }, controls: {} };
  return { manager, entities, player, scene };
}

test('salmon have the reference 3 HP, not the pre-1.13 value of 6', () => {
  const { manager } = fixture();
  const salmon = manager.spawnSalmon(0, 1, 0);
  assert.equal(salmon.maxHealth, 3, 'wiki: 3 HP (18w10a lowered it from 20; 6 was never correct)');
  assert.equal(salmon.health, 3);
});

test('the size table matches the wiki hitboxes', () => {
  assert.deepEqual(SALMON_SIZES.small, { width: 0.35, height: 0.2, scale: 0.5, chance: 0.316 });
  assert.deepEqual(SALMON_SIZES.medium, { width: 0.7, height: 0.4, scale: 1, chance: 0.526 });
  assert.deepEqual(SALMON_SIZES.large, { width: 1.05, height: 0.6, scale: 1.5, chance: 0.158 });
  const total = Object.values(SALMON_SIZES).reduce((n, s) => n + s.chance, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `the spawn chances must sum to 1, got ${total}`);
});

test('the spawn size roll follows the wiki distribution', () => {
  // Band starts are unambiguous.
  assert.equal(rollSalmonSize(() => 0), 'small');
  assert.equal(rollSalmonSize(() => 0.315), 'small');
  assert.equal(rollSalmonSize(() => 0.316), 'medium', 'the small band ends at 31.6%');
  assert.equal(rollSalmonSize(() => 0.5), 'medium');
  assert.equal(rollSalmonSize(() => 0.999999), 'large');

  // The exact medium/large boundary is deliberately not asserted: 0.316 + 0.526 is
  // 0.8420000000000001 in binary floating point, so an equality test there would be
  // pinning a rounding artifact rather than the wiki's rule. The distribution is the
  // real requirement, so sample it instead.
  const counts = { small: 0, medium: 0, large: 0 };
  let seed = 12345;
  const random = () => {
    // Deterministic LCG so this cannot flake between runs.
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const samples = 60000;
  for (let i = 0; i < samples; i++) counts[rollSalmonSize(random)]++;

  for (const [size, band] of Object.entries(SALMON_SIZES)) {
    const observed = counts[size] / samples;
    assert.ok(
      Math.abs(observed - band.chance) < 0.01,
      `${size} should be about ${band.chance}, observed ${observed.toFixed(4)}`
    );
  }
  assert.equal(counts.small + counts.medium + counts.large, samples, 'every roll lands in a band');
});

test('a salmon spawns at a wiki size with a matching hitbox and model scale', () => {
  for (const size of ['small', 'medium', 'large']) {
    const { manager } = fixture();
    const salmon = manager.spawnSalmon(0, 1, 0, { size });
    assert.equal(salmon.size, size);
    assert.equal(salmon.width, SALMON_SIZES[size].width, 'instance hitbox width');
    assert.equal(salmon.height, SALMON_SIZES[size].height, 'instance hitbox height');
    assert.equal(salmon.mesh.scale.x, SALMON_SIZES[size].scale, 'the model is scaled to match');
    assert.equal(salmon.mesh.scale.y, SALMON_SIZES[size].scale);
    assert.equal(isSalmonSize(salmon, size), true);
    assert.equal(isSalmonSize(salmon, 'large'), size === 'large');
  }
});

test('the spawn size defaults to a roll when none is supplied', () => {
  const { manager } = fixture();
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const salmon = manager.spawnSalmon(0, 1, 0);
    assert.ok(SALMON_SIZES[salmon.size], `rolled an unknown size: ${salmon.size}`);
    seen.add(salmon.size);
  }
  assert.ok(seen.size >= 2, `expected a mix of sizes from the roll, saw ${[...seen].join(', ')}`);
});

test('an unknown size falls back to a roll rather than producing an undefined hitbox', () => {
  const { manager } = fixture();
  const salmon = manager.spawnSalmon(0, 1, 0, { size: 'enormous' });
  assert.ok(SALMON_SIZES[salmon.size], `expected a real size, got ${salmon.size}`);
  assert.equal(typeof salmon.width, 'number');
  assert.equal(typeof salmon.height, 'number');
});

test('salmon drop raw salmon, and cooked salmon when killed while burning', () => {
  const { manager } = fixture();
  const raw = manager.spawnSalmon(0, 1, 0);
  const rawIds = manager.getMobDeathDrops(raw, () => 0.9).map(r => r[0]);
  assert.ok(rawIds.includes('salmon'), `expected raw salmon, got ${JSON.stringify(rawIds)}`);
  assert.ok(!rawIds.includes('cooked_salmon'));

  const burning = manager.spawnSalmon(0, 1, 0);
  burning.fireTicks = 20;
  const cookedIds = manager.getMobDeathDrops(burning, () => 0.9).map(r => r[0]);
  assert.ok(cookedIds.includes('cooked_salmon'), `expected cooked salmon, got ${JSON.stringify(cookedIds)}`);
  assert.ok(!cookedIds.includes('salmon'));
});

test('salmon have a flat 5% bone meal chance, independent of the salmon drop', () => {
  const { manager } = fixture();
  const salmon = manager.spawnSalmon(0, 1, 0);

  // Below the threshold: bone meal is added alongside the always-present raw salmon.
  const withBone = manager.getMobDeathDrops(salmon, () => 0.01);
  assert.ok(withBone.some(r => r[0] === 'bone_meal'), `expected bone meal, got ${JSON.stringify(withBone)}`);
  assert.ok(withBone.some(r => r[0] === 'salmon'), 'raw salmon still drops');

  // Above the threshold: no bone meal, but the salmon drop is unaffected.
  const without = manager.getMobDeathDrops(salmon, () => 0.99);
  assert.ok(!without.some(r => r[0] === 'bone_meal'), 'no bone meal above the chance');
  assert.ok(without.some(r => r[0] === 'salmon'), 'raw salmon still drops');
  assert.equal(without.length, 1, 'raw salmon is the only base drop');

  assert.equal(SALMON_BONE_MEAL_CHANCE, 0.05);
});

test('the bone meal helper is scoped to salmon and cannot exceed one', () => {
  assert.deepEqual(salmonBonusDrops({ type: 'salmon' }, () => 0), [['bone_meal', false, 1, 1]]);
  assert.deepEqual(salmonBonusDrops({ type: 'salmon' }, () => 0.999), []);
  assert.deepEqual(salmonBonusDrops({ type: 'cod' }, () => 0), [], 'cod are not salmon');
  assert.deepEqual(salmonBonusDrops(null, () => 0), []);
});

test('bone meal does not leak into other mobs', () => {
  const { manager } = fixture();
  const cod = manager.spawnCod(0, 1, 0);
  const ids = manager.getMobDeathDrops(cod, () => 0.001).map(r => r[0]);
  assert.ok(!ids.includes('bone_meal'), `cod must not drop bone meal, got ${JSON.stringify(ids)}`);
});

test('salmon still swim and stay in their water volume at every size', () => {
  for (const size of ['small', 'medium', 'large']) {
    const { manager, player } = fixture();
    const salmon = manager.spawnSalmon(2, 2, 2, { size });
    let travelled = 0;
    for (let i = 0; i < 300; i++) {
      const before = salmon.mesh.position.clone();
      manager.update(1 / 60, player);
      travelled += salmon.mesh.position.distanceTo(before);
      assert.equal(manager.checkMobCollision(salmon, salmon.mesh.position), false,
        `${size} salmon must not clip terrain`);
    }
    assert.ok(travelled > 0.5, `${size} salmon should swim rather than sit still`);
  }
});

test('the Inspector can spawn the salmon and reports the reference health', () => {
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const salmon = s.reset('salmon');
  assert.equal(salmon.type, 'salmon');
  assert.equal(s.snapshot().health, 3, 'Inspector telemetry shows 3 HP');
  assert.equal(s.snapshot().maxHealth, 3);
  assert.ok(SALMON_SIZES[salmon.size], 'and a real size');
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 3);
});
