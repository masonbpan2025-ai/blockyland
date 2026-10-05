// Looting raises the rare drop chances, which is the rule the drop table could not previously express.
//
// The live rows are `[id, isBlock, min, max]` -- a range with no probability -- so a drop that happens one
// time in a hundred and twenty could not be written down. The optional fifth field carries it, and the
// consumer rolls `chance + 0.01 * level`, capped at one, reading `mob.lootingLevel` which the kill path
// already sets from the killer's weapon.
//
// This drives `updateDeath` rather than reading the table, because the roll happens in the death handler and
// a test of the table alone would pass whether or not anything ever rolled it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDropFixture } from '../scripts/mob-drop-live.mjs';

/**
 * Kill a mob and report what it dropped.
 *
 * The roll is forced to a constant, which is what makes the rule testable: with one value for every roll the
 * outcome is a pure function of the effective chance. 0.02 sits above a zombie's iron ingot chance of
 * 0.008333 and below the same chance with Looting III, which is 0.038333.
 */
function dropsFor(mobType, { roll = 0.02, looting = 0 } = {}) {
  const { manager } = makeDropFixture();
  const dropped = [];
  manager.entities.spawnDroppedItem = (pos, id, isBlock, count) => dropped.push({ id, count });
  manager.random = () => roll;
  const mob = manager.spawnMob(mobType, 0, 1, 0);
  assert.ok(mob, mobType + ' should spawn');
  mob.playerDamaged = true;
  mob.lootingLevel = looting;
  mob.health = 0;
  mob.lootDropped = false;
  // The first call runs the death initialisation -- it sets `dying`, `deathMaterials` and zeroes
  // `deathTime`. Setting `dying` by hand instead skips that and the fade loop then throws on
  // `deathMaterials`, so the real init is allowed to run before the clock is wound forward.
  manager.updateDeath(mob, 0.001);
  assert.equal(mob.lootDropped, false, 'the drop block should not have run yet');
  // The drop block runs once `deathTime` passes 0.65.
  mob.deathTime = 0.64;
  manager.updateDeath(mob, 0.02);
  assert.ok(mob.lootDropped, mobType + ' should have reached the drop block, so the test is measuring it');
  return { dropped, ids: dropped.map(d => d.id) };
}

test('a rare drop does not happen at its base chance when the roll is above it', () => {
  const { ids } = dropsFor('zombie', { roll: 0.02, looting: 0 });
  // 0.02 >= 0.008333, so the three rare rows are skipped while rotten flesh, which has no chance field,
  // still drops.
  assert.ok(ids.includes('rotten_flesh'), 'the guaranteed drop should still happen');
  assert.equal(ids.includes('iron_ingot'), false, 'the rare drop should not happen at a 0.02 roll');
  assert.equal(ids.includes('carrot'), false);
  assert.equal(ids.includes('potato'), false);
});

test('Looting III turns the same roll into a drop', () => {
  // 0.008333 + 0.01 * 3 = 0.038333, so the identical roll of 0.02 now passes. This is the whole rule: the
  // drop is not made more likely by rerolling, it is made likely by moving the threshold.
  const { ids } = dropsFor('zombie', { roll: 0.02, looting: 3 });
  assert.ok(ids.includes('iron_ingot'), 'Looting III should make the iron ingot drop, got ' + ids.join(', '));
  assert.ok(ids.includes('carrot'), 'and the carrot');
  assert.ok(ids.includes('potato'), 'and the potato');
  assert.ok(ids.includes('rotten_flesh'), 'without disturbing the guaranteed drop');
});

test('each level of Looting moves the threshold by one percent', () => {
  // Sweep the roll across the interesting band. A roll of r drops the ingot when r < 0.008333 + 0.01 * L,
  // so the boundary between level 0 and level 1 is 0.008333 and between 1 and 2 is 0.018333.
  const ingotAt = (roll, looting) => dropsFor('zombie', { roll, looting }).ids.includes('iron_ingot');
  // Just below the base chance: drops with no Looting at all.
  assert.equal(ingotAt(0.008, 0), true, 'a roll inside the base chance drops');
  // Above the base chance but inside level 1.
  assert.equal(ingotAt(0.015, 0), false, 'level 0 should miss at 0.015');
  assert.equal(ingotAt(0.015, 1), true, 'level 1 should hit at 0.015');
  // Above level 1 but inside level 2.
  assert.equal(ingotAt(0.025, 1), false, 'level 1 should miss at 0.025');
  assert.equal(ingotAt(0.025, 2), true, 'level 2 should hit at 0.025');
  // And level 3 reaches 0.038333.
  assert.equal(ingotAt(0.035, 2), false, 'level 2 should miss at 0.035');
  assert.equal(ingotAt(0.035, 3), true, 'level 3 should hit at 0.035');
});

test('a high roll misses a rare drop and a zero roll lands it', () => {
  // This test used to be called "the effective chance is capped at one", and mutation testing showed it does
  // not check that: `Math.min(1, x)` and `x` behave identically whenever the roll is below one, which
  // `Math.random` guarantees, so the cap is unobservable through this path and is defensive rather than
  // load-bearing. Removing the cap fails no test here. What this does check is the two ends of the
  // comparison, which an inverted comparison would break.
  const missed = dropsFor('drowned', { roll: 0.999, looting: 3 });
  assert.equal(missed.ids.includes('copper_ingot'), false,
    'a 0.999 roll should miss the drowned\'s 11% copper ingot even with Looting III');
  const landed = dropsFor('drowned', { roll: 0, looting: 0 });
  assert.ok(landed.ids.includes('copper_ingot'), 'and a zero roll should land it');
});

test('a mob with no Looting behaves exactly as before', () => {
  // The default path must be unchanged: an unenchanted kill uses the base chance and nothing else.
  const plain = dropsFor('husk', { roll: 0.008, looting: 0 });
  assert.ok(plain.ids.includes('iron_ingot'), 'a roll inside the base chance drops with no enchantment');
  const alsoPlain = dropsFor('husk', { roll: 0.008, looting: undefined });
  assert.deepEqual(alsoPlain.ids, plain.ids, 'an absent lootingLevel should behave like zero');
});

test('a mob that was not killed by a player still rolls the table', () => {
  // The chance rows are gated on the roll, not on kill credit -- credit is handled by the rows the per-mob
  // helpers build. This pins that a non-player death does not silently skip the whole table.
  const { manager } = makeDropFixture();
  const dropped = [];
  manager.entities.spawnDroppedItem = (pos, id) => dropped.push(id);
  manager.random = () => 0.008;
  const mob = manager.spawnMob('zombie', 0, 1, 0);
  mob.playerDamaged = false;
  mob.health = 0;
  mob.lootDropped = false;
  manager.updateDeath(mob, 0.001);
  mob.deathTime = 0.64;
  manager.updateDeath(mob, 0.02);
  assert.ok(mob.lootDropped, 'the drop block should have run');
  assert.ok(dropped.includes('rotten_flesh'), 'rotten flesh is not conditional on the player');
});
