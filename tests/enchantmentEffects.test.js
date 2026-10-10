// Enchantment numeric effects.
//
// The melee call site held these inline, with the undead list spelled out as a literal array. Extracting
// them has a specific risk -- a tidy-up that quietly changes combat -- so the tests state the numbers
// that were true BEFORE the extraction and assert they still are. Bane of arthropods, fire aspect and the
// three non-Protection protection enchantments are the ones this module added.
//
// Values are vanilla's, cross-checked against the Mineclonia figures in docs/survival-parity-rules.md 2.5.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attackBonus, fireAspectSeconds, thornsReflect, unbreakingKeepsUse, depthStriderMultiplier,
  protectionEnchantmentFor, protectionPoints,
  UNDEAD, ARTHROPODS, AQUATIC,
} from '../src/enchantmentEffects.js';

const e = (id, level) => ({ id, level });

// --- the four protection enchantments -------------------------------------------

test('each protection answers its own damage type and nothing else', () => {
  // The wiki's split: Protection for almost everything, Fire Protection for fire/lava/blaze, Blast
  // Protection for explosions, Projectile Protection for projectiles. Only Protection was read before
  // this, so the other three were obtainable and inert.
  assert.equal(protectionEnchantmentFor('generic'), 'protection');
  assert.equal(protectionEnchantmentFor('zombie'), 'protection', 'a mob type falls through to Protection');
  assert.equal(protectionEnchantmentFor(undefined), 'protection');

  for (const type of ['fire', 'lava', 'blaze', 'hot_floor', 'campfire', 'lightning', 'dragon_breath']) {
    assert.equal(protectionEnchantmentFor(type), 'fire_protection', type);
  }
  for (const type of ['explosion', 'tnt', 'creeper', 'fireball', 'bed', 'wind_charge']) {
    assert.equal(protectionEnchantmentFor(type), 'blast_protection', type);
  }
  for (const type of ['arrow', 'projectile', 'trident', 'snowball', 'egg', 'firework', 'shulker_bullet']) {
    assert.equal(protectionEnchantmentFor(type), 'projectile_protection', type);
  }
  // Protection deliberately does not cover the bypassing sources.
  for (const type of ['void', 'starvation', 'wither', 'fall', 'magic']) {
    assert.equal(protectionEnchantmentFor(type), null, `${type} must not be absorbed by Protection`);
  }
});

test('protections sum across the armour, and only the matching one counts', () => {
  const full = (id, level) => [[e(id, level)], [e(id, level)], [e(id, level)], [e(id, level)]];
  assert.equal(protectionPoints(full('protection', 4), 'generic'), 16, 'four pieces of Protection IV');
  assert.equal(protectionPoints(full('fire_protection', 4), 'fire'), 16);
  assert.equal(protectionPoints(full('fire_protection', 4), 'arrow'), 0, 'fire protection is not projectile protection');
  assert.equal(protectionPoints(full('blast_protection', 2), 'explosion'), 8);
  assert.equal(protectionPoints(full('projectile_protection', 4), 'arrow'), 16);
  // A mixed set only counts the pieces carrying the relevant one.
  const mixed = [[e('protection', 2)], [e('fire_protection', 3)], [e('blast_protection', 1)], []];
  assert.equal(protectionPoints(mixed, 'generic'), 2);
  assert.equal(protectionPoints(mixed, 'fire'), 3);
  assert.equal(protectionPoints(mixed, 'explosion'), 1);
  assert.equal(protectionPoints(mixed, 'arrow'), 0);
  // Nonsense in, zero out rather than a throw.
  assert.equal(protectionPoints(null, 'generic'), 0);
  assert.equal(protectionPoints(undefined, 'fire'), 0);
  assert.equal(protectionPoints([null, [], [{ id: 'protection' }]], 'generic'), 0, 'a level-less entry counts nothing');
  assert.equal(protectionPoints(full('protection', 4), 'void'), 0);
});

test('sharpness keeps the numbers the inline code used', () => {
  // The pre-extraction formula was `0.5 * level + 0.5`, which at level 1 is a full extra point.
  assert.equal(attackBonus([e('sharpness', 1)], 'pig'), 1);
  assert.equal(attackBonus([e('sharpness', 2)], 'pig'), 1.5);
  assert.equal(attackBonus([e('sharpness', 5)], 'pig'), 3);
  assert.equal(attackBonus([e('sharpness', 1)], 'anything'), 1, 'sharpness has no target restriction');
});

test('smite keeps the numbers and the target list the inline code used', () => {
  for (const type of ['zombie', 'skeleton', 'wither_skeleton', 'zombified_piglin', 'zoglin',
    'drowned', 'zombie_villager', 'husk', 'stray', 'phantom']) {
    assert.equal(attackBonus([e('smite', 5)], type), 12.5, type + ' should take smite damage');
  }
  assert.equal(attackBonus([e('smite', 5)], 'pig'), 0, 'and a pig should not');
  assert.ok(UNDEAD.has('zombie') && UNDEAD.has('wither'), 'the undead set should cover both');
});

test('bane of arthropods is the new one, on smite\s pattern', () => {
  for (const type of ['spider', 'cave_spider', 'silverfish', 'endermite', 'bee']) {
    assert.equal(attackBonus([e('bane_of_arthropods', 5)], type), 12.5, type + ' is an arthropod');
  }
  assert.equal(attackBonus([e('bane_of_arthropods', 5)], 'zombie'), 0, 'an undead is not an arthropod');
  assert.equal(attackBonus([e('bane_of_arthropods', 1)], 'spider'), 2.5);
  // The two sets must not overlap, or a mob would take both bonuses and the sets would be wrong.
  for (const t of ARTHROPODS) assert.equal(UNDEAD.has(t), false, t + ' is in both groups');
});

test('impaling covers vanilla aquatic mobs, which is WIDER than the inline code', () => {
  // The inline code restricted impaling to squid and glow_squid. Vanilla 1.21 applies it to aquatic mobs
  // generally, so this is a deliberate change rather than a faithful extraction, and it is asserted as
  // such so the difference is not mistaken for a regression later.
  for (const type of ['squid', 'glow_squid', 'dolphin', 'guardian', 'elder_guardian', 'turtle', 'cod']) {
    assert.ok(AQUATIC.has(type), type + ' should be aquatic');
    assert.equal(attackBonus([e('impaling', 5)], type), 12.5);
  }
  assert.equal(attackBonus([e('impaling', 5)], 'pig'), 0);
});

test('bonuses from several enchantments add up', () => {
  assert.equal(attackBonus([e('sharpness', 2), e('smite', 3)], 'zombie'), 9, '1.5 from sharpness + 7.5 from smite');
  assert.equal(attackBonus([e('sharpness', 1), e('bane_of_arthropods', 2)], 'spider'), 6, '1 + 5');
});

test('a malformed enchantment list is ignored rather than throwing', () => {
  assert.equal(attackBonus(undefined, 'pig'), 0);
  assert.equal(attackBonus(null, 'pig'), 0);
  assert.equal(attackBonus([], 'pig'), 0);
  assert.equal(attackBonus([null, undefined], 'pig'), 0);
  assert.equal(attackBonus([{ id: 'sharpness' }], 'pig'), 0, 'a level that is not a number is skipped');
  assert.equal(attackBonus([e('unknown_enchantment', 5)], 'pig'), 0);
});

test('fire aspect burns for four seconds per level', () => {
  assert.equal(fireAspectSeconds(0), 0);
  assert.equal(fireAspectSeconds(-1), 0, 'a negative level should not un-burn anything');
  assert.equal(fireAspectSeconds(1), 4);
  assert.equal(fireAspectSeconds(2), 8);
  assert.equal(fireAspectSeconds(3), 12);
});

test('thorns reflects per piece, at 15% per level', () => {
  // A random of 0 passes every proc check AND rolls the MINIMUM damage of 1, so four level-III pieces
  // give 4 procs and 4 damage. An earlier version of this test expected the maximum, which needs a random
  // near 1 -- and it would have been easy to "fix" by changing the code instead of the expectation.
  const all = thornsReflect([[e('thorns', 3)], [e('thorns', 3)], [e('thorns', 3)], [e('thorns', 3)]], () => 0);
  assert.equal(all.procs, 4, 'every piece should proc');
  assert.equal(all.damage, 4, 'and each should deal the minimum of 1');

  // At a random just under 1 nothing procs even at level III, because the threshold is 0.45.
  const none = thornsReflect([[e('thorns', 3)]], () => 0.999);
  assert.equal(none.procs, 0);
  assert.equal(none.damage, 0);

  // A piece without thorns contributes nothing.
  assert.deepEqual(thornsReflect([[e('protection', 4)]], () => 0), { damage: 0, procs: 0 });
  assert.equal(thornsReflect(undefined, () => 0).damage, 0, 'no armour means no thorns');

  // The proc threshold scales with level: 0.2 is below 0.15*2 but above 0.15*1, so the same random procs
  // on a level II piece and not on a level I one. This is the check that the level is actually used.
  assert.equal(thornsReflect([[e('thorns', 1)]], () => 0.2).procs, 0, 'level I procs only below 0.15');
  assert.equal(thornsReflect([[e('thorns', 2)]], () => 0.2).procs, 1, 'level II procs below 0.30');

  // And the damage roll spans 1 to 4 inclusive. The first call decides the proc, the second the damage.
  const damageAt = (r) => {
    const seq = [0, r];
    let i = 0;
    return thornsReflect([[e('thorns', 3)]], () => seq[i++]).damage;
  };
  assert.equal(damageAt(0), 1, 'the low end of the damage range');
  assert.equal(damageAt(0.999), 4, 'and the high end');
});

test('unbreaking keeps a use with probability level / (level + 1)', () => {
  assert.equal(unbreakingKeepsUse(1, () => 0.49), true, 'level I keeps at 0.50');
  assert.equal(unbreakingKeepsUse(1, () => 0.51), false);
  assert.equal(unbreakingKeepsUse(3, () => 0.74), true, 'level III keeps at 0.75');
  assert.equal(unbreakingKeepsUse(3, () => 0.76), false);
  assert.equal(unbreakingKeepsUse(0, () => 0), false, 'no unbreaking means the use is always spent');
  assert.equal(unbreakingKeepsUse(undefined, () => 0), false);
});

test('depth strider reaches 1.75 at level III and is clamped above it', () => {
  assert.equal(depthStriderMultiplier(0), 1, 'no enchantment, no change');
  assert.ok(Math.abs(depthStriderMultiplier(1) - 1.0833333) < 1e-6);
  assert.equal(depthStriderMultiplier(3), 1.75);
  assert.equal(depthStriderMultiplier(9), 1.75, 'vanilla caps the effect at level III');
});
