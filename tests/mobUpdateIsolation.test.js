// One broken mob must not freeze the rest of the world.
//
// Regression guard: the whole per-mob loop ran inside a single try/catch in main.js.
// When any mob threw, every other mob stopped being updated mid-step — they froze in
// place and stopped reacting to hits — and the only trace was one console line. This
// happened for real: 28 of the 49 spawners left `mat` undefined, and `mob.mat.color`
// threw for all of them.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';

function managerFixture() {
  const textures = new Proxy({}, {
    get: (target, key) => {
      if (typeof key === 'symbol') return undefined;
      if (!target[key]) target[key] = new THREE.Texture();
      return target[key];
    }
  });
  return Object.assign(Object.create(MobManager.prototype), {
    scene: new THREE.Scene(),
    world: { getVoxel: () => 0, setVoxel() {} },
    sounds: {},
    mobs: [],
    arrows: [],
    customProjectiles: [],
    textures,
    entities: null,
    game: null
  });
}

/** A mob object that only needs to behave well enough to be iterated. */
function plainMob(type, extra = {}) {
  const mesh = new THREE.Group();
  mesh.position.set(0, 20, 0);
  return {
    type, name: type, mesh, health: 10, maxHealth: 10, dying: false,
    hitCooldown: 0, hurtTime: 0, velocity: new THREE.Vector3(),
    position: mesh.position, legs: [], ...extra
  };
}

/** A mob whose very first property read throws, so it faults inside the loop. */
function poisonedMob(type) {
  const mob = plainMob(type);
  Object.defineProperty(mob, 'hitCooldown', {
    get() { throw new TypeError(`poisoned ${type}`); },
    set() {},
    configurable: true
  });
  return mob;
}

test('a mob that throws does not stop the other mobs updating', () => {
  const manager = managerFixture();
  const poisoned = poisonedMob('pig');
  const healthy = plainMob('cow');
  // Reverse iteration means the last entry is visited first, so the poisoned mob
  // is hit before the healthy one — exactly the ordering that used to freeze it.
  manager.mobs = [healthy, poisoned];

  assert.doesNotThrow(() => manager.update(0.05, null),
    'the update must contain the fault instead of propagating it');

  assert.ok(manager.brokenMobs.has(poisoned), 'the failing mob is marked broken');
  assert.ok(!manager.brokenMobs.has(healthy), 'the healthy mob is left alone');
});

test('a broken mob is skipped afterwards rather than throwing every frame', () => {
  const manager = managerFixture();
  const poisoned = poisonedMob('pig');
  manager.mobs = [poisoned];

  manager.update(0.05, null);
  assert.equal(manager.brokenMobs.has(poisoned), true);

  // Further frames must not retry it, or the loop would pay the cost forever.
  let reads = 0;
  Object.defineProperty(poisoned, 'hitCooldown', {
    get() { reads++; throw new TypeError('poisoned pig'); },
    set() {}, configurable: true
  });
  for (let i = 0; i < 5; i++) manager.update(0.05, null);
  assert.equal(reads, 0, 'the broken mob is no longer touched at all');
  assert.doesNotThrow(() => manager.update(0.05, null));
});

test('the same fault is reported once and counted, not logged every frame', () => {
  const manager = managerFixture();
  manager.ensureFaultTracking();
  const mob = plainMob('pig');
  const error = new TypeError('boom');

  manager.reportMobError(error, mob);
  manager.reportMobError(error, mob);
  manager.reportMobError(error, mob);

  const entries = [...manager.mobErrors.entries()];
  assert.equal(entries.length, 1, 'one entry per distinct error');
  const [key, record] = entries[0];
  assert.match(key, /TypeError: boom/, 'the key names the error kind and message');
  assert.equal(record.count, 3, 'repeats are counted');
  assert.ok(record.mobs.size >= 1, 'and the affected mob is recorded');
});

test('different faults are tracked separately', () => {
  const manager = managerFixture();
  manager.ensureFaultTracking();
  const mob = plainMob('cow');

  manager.reportMobError(new TypeError('one'), mob);
  manager.reportMobError(new RangeError('two'), mob);

  assert.equal(manager.mobErrors.size, 2, 'each distinct error gets its own entry');
});

test('a mob that starts working again can be cleared and updated', () => {
  const manager = managerFixture();
  const poisoned = poisonedMob('pig');
  manager.mobs = [poisoned];
  manager.update(0.05, null);
  assert.equal(manager.brokenMobs.has(poisoned), true);

  // Replacing the mob (as a respawn would) yields a fresh, working instance.
  const replacement = plainMob('pig');
  manager.mobs = [replacement];
  assert.doesNotThrow(() => manager.update(0.05, null));
  assert.equal(manager.brokenMobs.has(replacement), false, 'the replacement updates normally');
});
