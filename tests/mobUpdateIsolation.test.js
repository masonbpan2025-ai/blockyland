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

// --- the update seam ---------------------------------------------------------
//
// update() delegates each subsystem to a named method. These pin that delegation so a
// later edit cannot quietly skip a subsystem, and so a method's "stop here" result is
// still honoured the way the old inline `continue` was.

/** A manager whose extracted subsystem methods are spies recording their calls. */
function spyFixture(mob, { aquaticStops = false, behaviorStops = false } = {}) {
  const manager = managerFixture();
  manager.mobs = [mob];
  manager.calls = [];
  manager.updateMobHealthBar = m => { manager.calls.push('healthBar'); };
  manager.updateMobAnimation = (m, dt, vx, vz) => { manager.calls.push('animation'); };
  manager.updateAquaticMob = m => { manager.calls.push('aquatic'); return aquaticStops; };
  manager.updateMobTypeBehavior = (m, dt, p, dist) => {
    manager.calls.push('behavior');
    manager.distSeen = dist;
    return behaviorStops;
  };
  // The aquatic branch only short-circuits once the peripheral systems are ready;
  // `isTrainingSiteMob` arriving late is what defers it in the game's first frames.
  manager.isTrainingSiteMob = () => true;
  return manager;
}

test('update delegates to the named subsystem methods', () => {
  const mob = plainMob('cow');
  const manager = spyFixture(mob);

  manager.update(0.1, null);

  assert.deepEqual(manager.calls, ['healthBar', 'behavior', 'animation'],
    'every subsystem runs, in the order the loop declares');
});

test('an aquatic mob runs the aquatic subsystem before the generic chain', () => {
  const mob = plainMob('salmon', { isAquatic: true });
  const manager = spyFixture(mob);

  manager.update(0.1, null);

  // Aquatic handling refines a mob rather than replacing its type AI, so both run —
  // the aquatic pass first. Only a `true` result skips the rest, which the next test
  // covers.
  const aquaticAt = manager.calls.indexOf('aquatic');
  const behaviorAt = manager.calls.indexOf('behavior');
  assert.ok(aquaticAt >= 0, 'the aquatic subsystem ran');
  assert.ok(behaviorAt > aquaticAt, 'and the generic chain still ran, after it');
});

test('a subsystem returning true stops that mob for the frame, like continue did', () => {
  const mob = plainMob('salmon', { isAquatic: true });
  const manager = spyFixture(mob, { aquaticStops: true });

  manager.update(0.1, null);

  assert.deepEqual(manager.calls, ['healthBar', 'aquatic'],
    'nothing after the stopping subsystem runs for this mob');
});

test('the behaviour chain receives the distance the loop computed', () => {
  const mob = plainMob('zombie');
  mob.mesh.position.set(3, 20, 4);
  const player = { position: new THREE.Vector3(0, 20, 0) };
  const manager = spyFixture(mob);

  manager.update(0.1, player);

  assert.equal(manager.distSeen, 5, 'distance to the player is 3-4-5');
});

test('a dead mob is removed and never reaches the AI subsystems', () => {
  const mob = plainMob('pig', { health: 0 });
  const manager = spyFixture(mob);
  let deaths = 0;
  manager.updateDeath = () => { deaths++; };

  manager.update(0.1, null);

  assert.equal(deaths, 1, 'death handling runs');
  assert.deepEqual(manager.calls, ['healthBar'], 'and no AI runs for a corpse');
});
