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

// Swimming article: "Surface of still water: 2.20" blocks/s, "Partially submerged: 1.97". These replace the old
// flat 0.65 x walking penalty (2.8 blocks/s), which made swimming faster than the wiki says.
test('swimming speed is the wiki figure: 2.20 at the surface, 1.97 with the head under', () => {
  assert.equal(mover({ inWater: true }).selectBaseSpeed(), 2.2, 'surface');
  const under = mover({ inWater: true });
  under.headInWater = true;
  assert.equal(under.selectBaseSpeed(), 1.97, 'submerged');
});

test('sprinting at the surface does not outrun swimming: the land sprint speed is not used in water', () => {
  assert.equal(mover({ inWater: true, sprinting: true }).selectBaseSpeed(), 2.2);
});

test('sprint-swimming is 3.918 m/s, and 5.305 with Depth Strider III', () => {
  const swimmer = mover({ inWater: true });
  swimmer.isSwimming = true;
  assert.ok(Math.abs(swimmer.selectBaseSpeed() - 3.918) < 1e-9, 'plain sprint-swim');
  const strider = mover({ inWater: true, armor: boots(3) });
  strider.isSwimming = true;
  assert.ok(Math.abs(strider.selectBaseSpeed() - 5.305) < 1e-9, 'with Depth Strider III');
});

test('depth strider adds a third of the gap to walking speed per level', () => {
  // Water: Depth Strider "increases water movement efficiency by 1/3". At III the gap is closed.
  for (const level of [1, 2, 3]) {
    const p = mover({ inWater: true, armor: boots(level) });
    const expected = 2.2 + (4.3 - 2.2) * (level / 3);
    assert.ok(Math.abs(p.selectBaseSpeed() - expected) < 1e-9,
      'level ' + level + ': expected ' + expected + ', got ' + p.selectBaseSpeed());
  }
  const three = mover({ inWater: true, armor: boots(3) }).selectBaseSpeed();
  assert.ok(Math.abs(three - 4.3) < 1e-9, 'level III swims at walking speed, got ' + three);
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
  assert.ok(Math.abs(plain - 2.2 * 2.2) < 1e-9, 'expected ' + (2.2 * 2.2));
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
    assert.equal(p.selectBaseSpeed(), 2.2,
      'armour ' + JSON.stringify(armor) + ' should behave like no depth strider');
  }
});

// Climbing out of water. Java (LivingEntity.travel, in water): "if horizontalCollision and isFree(dx, dy + 0.6 - y + y0,
// dz) then deltaMovement.y = 0.3" -- 0.3 blocks a tick, 6 a second, enough to step onto a bank one block above the
// water. Without it a swimmer at a pond's edge could only bob against the bank.
import * as THREE from 'three';
import { BLOCKS } from '../src/blocks.js';
function swimmerAgainst(bankHeight) {
  // Water at x = 0 (y 0); a stone bank at x = 1, `bankHeight` blocks tall from y 0.
  const world = { getVoxel: (x, y, z) => (z !== 0 ? BLOCKS.STONE : x === 0 && y === 0 ? BLOCKS.WATER : x === 1 && y >= 0 && y < bankHeight ? BLOCKS.STONE : y < 0 ? BLOCKS.STONE : BLOCKS.AIR) };
  const p = mover({ inWater: true });
  Object.assign(p, { world, width: 0.6, height: 1.8, gamemode: 'survival', onGround: false, isSneaking: false });
  p.position = new THREE.Vector3(0.65, 0.55, 0.5);
  p.velocity = new THREE.Vector3(2.2, 0, 0);
  try { p.moveWithCollision(0.05); } catch { /* the vertical sweep may want more of a game; the lift is set before it */ }
  return p.velocity.y;
}
test('a swimmer pushing against a one-block bank is lifted out of the water (Java: 0.3 blocks a tick)', () => {
  assert.equal(swimmerAgainst(1), 6);
});
test('a swimmer against a wall two blocks high is not lifted', () => {
  assert.notEqual(swimmerAgainst(2), 6);
});
