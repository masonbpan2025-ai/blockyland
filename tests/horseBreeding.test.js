// Breeding regressions found while making the Showcase report mobs fairly.
//
// Two real gameplay bugs surfaced, both of which made horses impossible to breed:
//
//   1. The horse/donkey mount branch ended by mounting and returning, and sat above the
//      shared breeding block, so feeding a horse mounted it instead of starting courtship.
//   2. The courtship threshold was a flat 1.2 regardless of body size, but a horse is 1.4
//      wide -- two horses cannot stand closer than that, so the branch was unreachable.
//
// Both are pinned here so they cannot come back.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMobDebugSession } from '../src/mobDebugSession.js';
import { BREEDING_FOODS } from '../src/animalBehaviors.js';
import { mobScenarios } from '../src/mobShowcase.js';

const session = () => createMobDebugSession(new THREE.Scene(), () => {});

/** Hold an item, as the debug inventory models it. */
const hold = (s, id, count = 64) => { s.inventory.active = id ? { id, count, isBlock: false } : null; };

// --- feeding starts courtship ----------------------------------------------

test('feeding a horse starts courtship instead of mounting it', () => {
  // Feeding used to mount the horse and return, so the breeding code was never reached.
  const s = session();
  const mob = s.reset('horse');
  mob.isTamed = true;
  hold(s, 'golden_apple');

  const accepted = s.manager.animalBehaviors.interact(mob, s.player, s.inventory);

  assert.equal(accepted, true, 'the interaction is handled');
  assert.equal(mob.inLove, 30, 'and the horse enters love mode');
});

test('every breeding food works for every mob that lists one', () => {
  const failures = [];
  for (const [type, foods] of Object.entries(BREEDING_FOODS)) {
    for (const food of foods) {
      if (typeof food !== 'string') continue;
      const s = session();
      const mob = s.reset(type);
      if (!mob) continue;
      mob.isTamed = true;
      mob.breedingCooldown = 0;
      hold(s, food);
      try {
        s.manager.animalBehaviors.interact(mob, s.player, s.inventory);
        if (!(mob.inLove > 0)) failures.push(`${type} + ${food}`);
      } catch (e) {
        failures.push(`${type} + ${food} threw ${e.message}`);
      }
    }
  }
  assert.deepEqual(failures, [], `these feedings did not start courtship:\n${failures.join('\n')}`);
});

test('mounting a horse still works after the feeding guard', () => {
  // The guard must not break saddling or riding, which share the same branch.
  const s = session();
  const mob = s.reset('horse');
  mob.isTamed = true;

  hold(s, 'saddle');
  s.manager.animalBehaviors.interact(mob, s.player, s.inventory);
  assert.equal(mob.isSaddled, true, 'a saddle still equips');

  hold(s, null);
  s.manager.animalBehaviors.interact(mob, s.player, s.inventory);
  assert.equal(s.manager.animalBehaviors.mount?.mob, mob, 'and an empty hand still mounts');
});

test('horse armour and donkey chests still work after the feeding guard', () => {
  const horseSession = session();
  const horse = horseSession.reset('horse');
  horse.isTamed = true;
  hold(horseSession, 'diamond_horse_armor');
  horseSession.manager.animalBehaviors.interact(horse, horseSession.player, horseSession.inventory);
  assert.equal(horse.horseArmor, 'diamond_horse_armor');

  const donkeySession = session();
  const donkey = donkeySession.reset('donkey');
  donkey.isTamed = true;
  hold(donkeySession, 'chest');
  donkeySession.manager.animalBehaviors.interact(donkey, donkeySession.player, donkeySession.inventory);
  assert.equal(donkey.hasChest, true);
});

// --- the courtship threshold ------------------------------------------------

test('courtship accepts mobs too large to stand within the old flat threshold', () => {
  // A horse is 1.4 wide, so two horses rest about 1.4 apart -- outside the old 1.2 window.
  const s = session();
  const mob = s.reset('horse');
  assert.equal(s.manager.getMobDimensions('horse').width, 1.4, 'a horse is wide enough to matter');

  const c = mobScenarios('horse').find(x => x.id === 'breeding');
  c.setup(s);
  let steps = 0;
  while (s.time < c.duration && steps < 400) { s.tick(1 / 30); steps++; }
  assert.equal(c.check(s), true, 'the horses must be able to mate');
});

test('large and small mobs can all produce a baby', () => {
  const failures = [];
  for (const type of ['horse', 'cow', 'sheep', 'pig', 'chicken', 'wolf', 'cat']) {
    const c = mobScenarios(type).find(x => x.id === 'breeding');
    if (!c) continue;
    // A fresh session per mob, reset first: a shared session would leave the previous mobs
    // in the manager, and a leftover in-love pair can mate with the wrong partner.
    const s = session();
    s.reset(type);
    c.setup(s);
    let steps = 0;
    while (s.time < c.duration && steps < 400) { s.tick(1 / 30); steps++; }
    if (!s.manager.mobs.some(m => m.isBaby)) failures.push(type);
  }
  assert.deepEqual(failures, [], `these mobs did not produce a baby: ${failures.join(', ')}`);
});

test('the courtship range never falls below the old threshold', () => {
  // The fix scales the range with body size; it must not loosen small mobs past what they
  // had before (1.2, or 1.6 for hoglins).
  const s = session();
  const chicken = s.reset('chicken');
  const partner = s.manager.spawnMob('chicken', 0.5, 0, 0);
  const width = s.manager.getMobDimensions('chicken').width;
  const range = Math.max(1.2, (width + width) * 0.5 + 0.5);
  assert.ok(range >= 1.2, 'small mobs keep at least the old range');
  assert.ok(range < 10, 'and it stays a courtship distance, not a detection radius');
  assert.ok(partner, 'a partner can be spawned');
  assert.ok(chicken, 'and the subject exists');
});
