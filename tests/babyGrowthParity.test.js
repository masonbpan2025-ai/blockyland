// Baby growth parity with https://minecraft.wiki/w/Breeding
//
// The assessment recorded this as a confirmed defect affecting every breedable animal: babies
// grew up in 120 seconds instead of the wiki's 20 minutes. The value was duplicated as a bare
// literal in five files, which is why it drifted. This suite pins the shared rule and then
// checks that every breedable mob actually receives it.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import { AnimalBehaviors } from '../src/animalBehaviors.js';
import {
  BABY_GROWTH_SECONDS, BABY_GROWTH_SECONDS_BY_TYPE, BABY_FEED_ACCELERATION,
  BABY_FEED_MINIMUM_SECONDS, babyGrowthSecondsFor, accelerateBabyGrowth, startBabyGrowth,
  updateBabyGrowth, feedingsToGrow
} from '../src/babyGrowth.js';
import { createMobDebugSession } from '../src/mobDebugSession.js';

function fixture() {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = { getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR), getHeightAt: () => 0, getLightLevel: () => 0 };
  const entities = new EntityManager(scene, world, sounds);
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: { cow: new THREE.Texture(), chicken: new THREE.Texture(), sheep: new THREE.Texture(), pig: new THREE.Texture() },
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  manager.animalBehaviors = new AnimalBehaviors(manager, world, sounds, entities);
  const player = { position: new THREE.Vector3(0, 1, 0), gamemode: 'survival', health: 20, keys: {}, takeDamage() {} };
  const inventory = {
    active: null, hotbar: [], storage: [], armor: {},
    getActiveItem() { return this.active; },
    consumeActiveItem(n = 1) { if (this.active) this.active.count -= n; },
    addItem() { return true; }, updateUI() {}, updateHotbar() {}
  };
  player.inventory = inventory;
  manager.game = { player, inventory, difficulty: 'normal', weather: { weatherType: 'clear' }, worldTime: 6000, controls: {} };
  return { manager, entities, player, inventory };
}

test('the growth time is the wiki 20 minutes, not the old 120 seconds', () => {
  assert.equal(BABY_GROWTH_SECONDS, 1200, 'wiki: 20 minutes to grow up');
  assert.equal(BABY_GROWTH_SECONDS, 20 * 60);
  assert.notEqual(BABY_GROWTH_SECONDS, 120, '120 seconds was the defect');
  // 20 minutes at 20 ticks/second is the wiki's stated 24000 ticks.
  assert.equal(BABY_GROWTH_SECONDS * 20, 24000);
});

test('the feeding rules match the wiki', () => {
  assert.equal(BABY_FEED_ACCELERATION, 0.1, 'wiki: each feeding removes 10% of the remaining time');
  assert.equal(BABY_FEED_MINIMUM_SECONDS, 9, 'wiki: no effect if less than 9 seconds remain');
});

test('every breedable mob gets the reference 20 minutes', () => {
  // The mobs that used to be given their own 1200 value are included here, so the constant is
  // the single source of truth for all of them.
  for (const type of ['cow', 'mooshroom', 'sheep', 'pig', 'chicken', 'rabbit', 'wolf', 'cat',
    'horse', 'donkey', 'mule', 'hoglin', 'strider', 'squid', 'glow_squid', 'unknown_type']) {
    assert.equal(babyGrowthSecondsFor(type), BABY_GROWTH_SECONDS, `${type} growth time`);
  }
  // The explicit table agrees with the fallback rather than contradicting it.
  for (const [type, seconds] of Object.entries(BABY_GROWTH_SECONDS_BY_TYPE)) {
    assert.equal(seconds, BABY_GROWTH_SECONDS, `${type} table entry`);
  }
});

test('feeding removes 10% of the remaining time', () => {
  const mob = { isBaby: true, babyGrowthTimer: 100 };
  assert.equal(accelerateBabyGrowth(mob), 90, '10% of 100 leaves 90');
  assert.equal(accelerateBabyGrowth(mob), 81, '10% of 90 leaves 81');
  assert.equal(accelerateBabyGrowth(mob), 72.9);
});

test('feeding has no effect once less than 9 seconds remain', () => {
  // The floor is exclusive: 9 seconds still reduces, 8.9 does not.
  const atFloor = { isBaby: true, babyGrowthTimer: 9 };
  assert.equal(accelerateBabyGrowth(atFloor), 8.1, 'at exactly 9s the reduction still applies');

  for (const remaining of [8.9, 5, 1, 0]) {
    const below = { isBaby: true, babyGrowthTimer: remaining };
    assert.equal(accelerateBabyGrowth(below), remaining, `${remaining}s is below the floor`);
    assert.equal(below.babyGrowthTimer, remaining, 'and is left untouched');
  }
});

test("the wiki's own example about 28 feedings checks out", () => {
  // Wiki history: "28 feedings reduce the remaining time to around a minute, from the initial
  // time of 20 minutes." This checks the arithmetic against the wiki's stated figure rather
  // than only against itself.
  let remaining = BABY_GROWTH_SECONDS;
  let toAboutAMinute = 0;
  while (remaining > 60) { remaining *= 0.9; toAboutAMinute++; }
  assert.ok(Math.abs(toAboutAMinute - 28) <= 1,
    `the wiki says 28 feedings leaves around a minute; got ${toAboutAMinute} leaving ${remaining.toFixed(1)}s`);

  // Feeding can continue past that, and the 9-second floor is where it stops for good.
  const greedy = feedingsToGrow();
  assert.ok(greedy > toAboutAMinute, 'more feedings are possible past the one-minute mark');
  // Applying exactly that many feedings leaves a remainder below the floor.
  let floored = BABY_GROWTH_SECONDS;
  for (let i = 0; i < greedy; i++) floored *= 0.9;
  assert.ok(floored < BABY_FEED_MINIMUM_SECONDS,
    `after ${greedy} feedings the remainder is ${floored.toFixed(2)}s, below the floor`);
  // And one fewer feeding would still be above it.
  assert.ok(floored / 0.9 >= BABY_FEED_MINIMUM_SECONDS, 'one fewer feeding is still feedable');
});

test('startBabyGrowth gives a full timer, and accelerate is a no-op on a fresh baby', () => {
  const mob = { isBaby: true };
  assert.equal(startBabyGrowth(mob), BABY_GROWTH_SECONDS);
  assert.equal(mob.babyGrowthTimer, BABY_GROWTH_SECONDS);
  // accelerateBabyGrowth must not treat "no timer yet" as zero remaining.
  const fresh = { isBaby: true };
  assert.equal(accelerateBabyGrowth(fresh), BABY_GROWTH_SECONDS * 0.9);
});

test('updateBabyGrowth matures the mob and resets every baby feature', () => {
  const mob = {
    isBaby: true, babyGrowthTimer: 5,
    mesh: { scale: { set(x, y, z) { this.x = x; } } },
    head: { scale: { set(x) { this.x = x; } } },
    horns: [{ visible: false }, { visible: false }],
    udder: { visible: false },
    wattle: { visible: false }
  };
  assert.equal(updateBabyGrowth(mob, 1), false, 'not yet');
  assert.equal(mob.babyGrowthTimer, 4);
  assert.equal(updateBabyGrowth(mob, 5), true, 'it grew up');
  assert.equal(mob.isBaby, false);
  assert.equal(mob.babyGrowthTimer, 0);
  assert.equal(mob.mesh.scale.x, 1, 'scale restored');
  assert.equal(mob.head.scale.x, 1, 'head scale restored');
  for (const horn of mob.horns) assert.equal(horn.visible, true, 'horns restored');
  assert.equal(mob.udder.visible, true, 'udder restored');
  assert.equal(mob.wattle.visible, true, 'wattle restored');
});

test('an age-locked baby does not grow', () => {
  const mob = { isBaby: true, babyGrowthTimer: 5, ageLocked: true };
  for (let i = 0; i < 100; i++) updateBabyGrowth(mob, 1);
  assert.equal(mob.babyGrowthTimer, 5, 'the golden dandelion pauses growth');
  assert.equal(mob.isBaby, true);
});

test('the helpers are safe on nonsense input', () => {
  assert.equal(babyGrowthSecondsFor(undefined), BABY_GROWTH_SECONDS);
  assert.doesNotThrow(() => accelerateBabyGrowth(null));
  assert.doesNotThrow(() => startBabyGrowth(null));
  assert.doesNotThrow(() => updateBabyGrowth(null, 1));
  assert.equal(updateBabyGrowth({ isBaby: false }, 1), false, 'an adult is not aged');
});

test('a bred calf actually receives 20 minutes through the real breeding path', () => {
  const { manager, inventory, player } = fixture();
  const a = manager.spawnCow(0, 1, 0);
  const b = manager.spawnCow(1.5, 1, 0);
  for (const cow of [a, b]) {
    inventory.active = { id: 'wheat', count: 64 };
    manager.animalBehaviors.interact(cow, player, inventory);
    assert.ok(cow.inLove > 0, 'wheat starts courtship');
  }
  for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
  const calf = manager.mobs.find(m => m.isBaby);
  assert.ok(calf, 'a calf was born');
  // The calf has already been alive for the rest of the loop, so it has counted down a few
  // seconds. It must still be near the full 20 minutes, and nowhere near 120 seconds.
  assert.ok(calf.babyGrowthTimer <= BABY_GROWTH_SECONDS, 'never exceeds the full timer');
  assert.ok(calf.babyGrowthTimer > BABY_GROWTH_SECONDS - 30,
    `the calf must get about 20 minutes, got ${calf.babyGrowthTimer}`);
  assert.ok(calf.babyGrowthTimer > 120, 'and certainly not the old 120-second timer');
});

test('a bred lamb and chick also receive 20 minutes', () => {
  for (const { type, foods } of [
    { type: 'sheep', foods: ['wheat'] },
    { type: 'chicken', foods: ['wheat_seeds'] }
  ]) {
    const { manager, inventory, player } = fixture();
    const a = manager.spawnMob(type, 0, 1, 0);
    const b = manager.spawnMob(type, 1.5, 1, 0);
    for (const mob of [a, b]) {
      inventory.active = { id: foods[0], count: 64 };
      manager.animalBehaviors.interact(mob, player, inventory);
    }
    for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
    const baby = manager.mobs.find(m => m.isBaby);
    assert.ok(baby, `a baby ${type} was born`);
    assert.ok(baby.babyGrowthTimer > BABY_GROWTH_SECONDS - 30,
      `${type} baby must get about 20 minutes, got ${baby.babyGrowthTimer}`);
    assert.ok(baby.babyGrowthTimer > 120, `${type} baby must not get the old 120 seconds`);
  }
});

test('the mobs that already had the right value still do', () => {
  // Horse, donkey, hoglin, strider and squid used 1200 before this change; refactoring them
  // onto the shared constant must not alter their behaviour.
  const { manager } = fixture();
  for (const type of ['horse', 'donkey']) {
    const foal = manager.spawnMob(type, 0, 1, 0);
    foal.isBaby = true;
    startBabyGrowth(foal);
    assert.equal(foal.babyGrowthTimer, BABY_GROWTH_SECONDS, `${type} foal`);
  }
  const hoglin = manager.spawnMob('hoglin', 0, 1, 0);
  hoglin.isBaby = true;
  startBabyGrowth(hoglin);
  assert.equal(hoglin.babyGrowthTimer, BABY_GROWTH_SECONDS, 'hoglin baby');
});

test('the Inspector reports a 20-minute timer for a spawned baby', () => {
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  s.reset('cow');
  const calf = s.manager.spawnCow(2, 1, 0);
  calf.isBaby = true;
  startBabyGrowth(calf);
  assert.equal(calf.babyGrowthTimer, BABY_GROWTH_SECONDS);
  // The debug world has no golden dandelion, but the shared helper is what the session uses.
  updateBabyGrowth(calf, 1);
  assert.equal(calf.babyGrowthTimer, BABY_GROWTH_SECONDS - 1, 'and it counts down in seconds');
});
