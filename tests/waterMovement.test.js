// Movement speed selection, and depth strider's part in it.
//
// The speed was chosen by a ladder of conditionals inside `update`, with the depth strider factor nested
// in the water branch. Reaching that line through `update` needs most of a game engine stubbed, so the
// ladder is now `selectBaseSpeed()` and asserted directly. An untestable branch is one that quietly stops
// being applied, which is exactly what happened to depth strider for several rounds: the formula was
// implemented and tested, and nothing called it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/player.js';
import { depthStriderMultiplier } from '../src/enchantmentEffects.js';

/** A Player-shaped object with the movement fields only. */
function mover(opts = {}) {
  const p = Object.create(Player.prototype);
  p.walkSpeed = 4.3;
  p.flySpeed = 11;
  p.sprintSpeed = 5.6;
  p.sneakSpeed = 1.3;
  p.isFlying = !!opts.flying;
  p.isBlocking = !!opts.blocking;
  p.isSprinting = !!opts.sprinting;
  p.isSneaking = !!opts.sneaking;
  p.inWater = !!opts.inWater;
  p.statusEffects = new Map(opts.effects || []);
  p.inventory = { armor: opts.armor ?? null };
  return p;
}

const boots = (level) => ({ feet: { enchantments: level ? [{ id: 'depth_strider', level }] : [] } });

test('the state ladder picks the expected base speed', () => {
  assert.equal(mover().selectBaseSpeed(), 4.3, 'walking');
  assert.equal(mover({ flying: true }).selectBaseSpeed(), 11, 'flying');
  assert.equal(mover({ sprinting: true }).selectBaseSpeed(), 5.6, 'sprinting');
  assert.equal(mover({ sneaking: true }).selectBaseSpeed(), 1.3, 'sneaking');
  assert.equal(mover({ blocking: true }).selectBaseSpeed(), 1.3, 'blocking');
});

test('the ladder keeps its precedence', () => {
  // The order was a chain of else-ifs and is now early returns; if the order changed, a flying sprinting
  // player would get a different speed than before.
  assert.equal(mover({ flying: true, sprinting: true }).selectBaseSpeed(), 11, 'flying wins over sprinting');
  assert.equal(mover({ sprinting: true, sneaking: true }).selectBaseSpeed(), 5.6, 'sprinting wins over sneaking');
  assert.equal(mover({ blocking: true, sprinting: true }).selectBaseSpeed(), 1.3, 'blocking wins over sprinting');
});

test('water applies the 0.65 penalty', () => {
  const expected = 4.3 * 0.65;
  assert.ok(Math.abs(mover({ inWater: true }).selectBaseSpeed() - expected) < 1e-9,
    'expected ' + expected);
});

test('depth strider reduces the water penalty, per level', () => {
  for (const level of [1, 2, 3]) {
    const p = mover({ inWater: true, armor: boots(level) });
    const expected = 4.3 * 0.65 * depthStriderMultiplier(level);
    assert.ok(Math.abs(p.selectBaseSpeed() - expected) < 1e-9,
      'level ' + level + ': expected ' + expected + ', got ' + p.selectBaseSpeed());
  }
  // Level III is where the penalty is gone: the water speed exceeds the land speed.
  const three = mover({ inWater: true, armor: boots(3) }).selectBaseSpeed();
  assert.ok(three > 4.3, 'level III should be faster than walking, got ' + three);
});

test('depth strider is clamped above level III', () => {
  const nine = mover({ inWater: true, armor: boots(9) }).selectBaseSpeed();
  const three = mover({ inWater: true, armor: boots(3) }).selectBaseSpeed();
  assert.equal(nine, three, 'vanilla caps the effect at level III');
});

test('depth strider changes nothing on land or in the air', () => {
  // The factor lives inside the water branch, so boots must not affect any other state.
  assert.equal(mover({ armor: boots(3) }).selectBaseSpeed(), 4.3, 'land');
  assert.equal(mover({ flying: true, armor: boots(3) }).selectBaseSpeed(), 11, 'flying');
  assert.equal(mover({ sprinting: true, armor: boots(3) }).selectBaseSpeed(), 5.6, 'sprinting');
});

test('dolphins grace multiplies the water speed and stacks with depth strider', () => {
  const grace = new Map([['dolphins_grace', { duration: 10 }]]);
  const plain = mover({ inWater: true, effects: grace }).selectBaseSpeed();
  assert.ok(Math.abs(plain - 4.3 * 0.65 * 2.2) < 1e-9, 'expected ' + (4.3 * 0.65 * 2.2));
  const both = mover({ inWater: true, effects: grace, armor: boots(3) }).selectBaseSpeed();
  assert.ok(both > plain, 'the two effects should add up');
});

test('armourEnchantmentLevel takes the highest across pieces, not the sum', () => {
  // A single-piece effect: two pieces carrying depth strider do not stack, and in practice only boots
  // can hold it, so the highest level is the right answer.
  const p = mover({
    armor: {
      head: { enchantments: [{ id: 'depth_strider', level: 1 }] },
      feet: { enchantments: [{ id: 'depth_strider', level: 3 }] },
    },
  });
  assert.equal(p.armourEnchantmentLevel('depth_strider'), 3, 'the highest wins');
  assert.equal(p.armourEnchantmentLevel('thorns'), 0, 'an absent enchantment is level 0');
  assert.equal(mover().armourEnchantmentLevel('depth_strider'), 0, 'no armour at all');
});

test('malformed armour does not break the speed calculation', () => {
  for (const armor of [null, {}, { feet: null }, { feet: {} }, { feet: { enchantments: null } },
    { feet: { enchantments: [null, {}] } }]) {
    const p = mover({ inWater: true, armor });
    assert.equal(p.selectBaseSpeed(), 4.3 * 0.65,
      'armour ' + JSON.stringify(armor) + ' should behave like no depth strider');
  }
});
