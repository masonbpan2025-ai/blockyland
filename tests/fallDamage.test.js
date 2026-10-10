// Item parity batch 7: falling never hurt, and no effect ever scaled with its level.
//
// Two defects that had the same shape -- a rule that existed and was never reached.
//
// 1. `player.fallDistance` was accumulated while falling and then reset on landing without anything
//    applying damage. So a fall from any height was free, and two items whose entire purpose is fall
//    damage could not work: the Feather Falling branch inside `takeDamage` was unreachable, and the
//    Potion of Slow Falling had no reader. The shield code even lists `'fall'` among the damage types it
//    does not block, so the intended design clearly included it.
//
// 2. `player.applyStatusEffect` stores `level` (1-based). `statusEffects.js` read `amplifier` (0-based)
//    instead, which nothing in the game sets -- so every effect applied at level 1. Strength II was
//    indistinguishable from Strength I, and Resistance IV reduced damage by 20% where vanilla reduces it
//    by 59%. Both sides passed their own tests: `tests/statusEffects.test.js` builds `{amplifier}` by
//    hand, and the game builds `{level}`. The test at the bottom of this file is the one that would have
//    caught it, by requiring the two conventions to agree.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS } from '../src/blocks.js';
import { Inventory } from '../src/inventory.js';
import { Player, FALL_ABSORBING_BLOCKS } from '../src/player.js';
import {
  EFFECTS, fallDamage, hasSlowFalling, FALL_DAMAGE,
  attackDamageBonus, damageTakenMultiplier, speedMultiplier,
} from '../src/statusEffects.js';

const near = (actual, expected, message) => {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
};

/** Effects as `player.statusEffects` really holds them: `level`, 1-based. */
const atLevel = (...pairs) => new Map(pairs.map(([n, level = 1]) => [n, { duration: 30, level }]));

/** Effects in the 0-based shape the original table expected. */
const atAmplifier = (...pairs) => new Map(pairs.map(([n, amplifier = 0]) => [n, { amplifier }]));

// --- 1. the level convention -------------------------------------------------

test('the effects table reads the level the game actually stores', () => {
  // `applyStatusEffect(effect, duration, level)` -- this is that shape.
  near(attackDamageBonus(atLevel(['strength'])), 3, 'strength I');
  near(attackDamageBonus(atLevel(['strength', 2])), 6, 'strength II');
  near(damageTakenMultiplier(atLevel(['resistance', 4])), 0.2, 'resistance IV removes 80%');
  near(speedMultiplier(atLevel(['slowness', 4])), 1 - 0.15 * 4, 'slowness IV removes 60%');
});

test('an explicit amplifier is still honoured, because that is vanilla\'s field name', () => {
  near(attackDamageBonus(atAmplifier(['strength'])), 3, 'amplifier 0 is level I');
  near(attackDamageBonus(atAmplifier(['strength', 1])), 6, 'amplifier 1 is level II');
});

test('the two conventions cannot drift apart again', () => {
  // The defect in one assertion: every reader must agree whether a level is expressed as the 1-based
  // `level` this game stores or the 0-based `amplifier` vanilla names. If a future change reads one field
  // while a caller writes the other, these comparisons fail -- where the game itself would silently apply
  // everything at level 1.
  const cases = [['strength', attackDamageBonus], ['resistance', damageTakenMultiplier], ['speed', speedMultiplier]];
  for (const [effect, fn] of cases) {
    for (let level = 1; level <= 4; level++) {
      near(fn(atLevel([effect, level])), fn(atAmplifier([effect, level - 1])), `${effect} at level ${level}`);
    }
  }
  // And a level really does change the answer, so the loop above cannot pass by both sides being broken.
  assert.notEqual(attackDamageBonus(atLevel(['strength', 2])), attackDamageBonus(atLevel(['strength', 1])));
});

test('a level of zero or a missing field still means level I, not level 0', () => {
  near(attackDamageBonus(new Map([['strength', { duration: 5 }]])), 3, 'no level field');
  near(attackDamageBonus(new Map([['strength', { duration: 5, level: 0 }]])), 3, 'level 0 floors at I');
  near(attackDamageBonus(new Map([['strength', { duration: 5, level: -2 }]])), 3, 'a negative level floors at I');
});

// --- 2. the fall damage rule, on its own ------------------------------------

test('nothing hurts for the first three blocks, then one point each', () => {
  const none = new Map();
  for (const [distance, expected] of [[0, 0], [1, 0], [2.9, 0], [3, 0], [3.9, 0], [4, 1], [10, 7], [23.5, 20]]) {
    assert.equal(fallDamage(distance, none), expected, `${distance} blocks`);
  }
});

test('Slow Falling negates the damage and Jump Boost only shortens the fall', () => {
  assert.equal(fallDamage(23.5, atLevel(['slow_falling'])), 0);
  assert.equal(fallDamage(23.5, atLevel(['jump_boost', 2])), 20 - 2, 'two levels subtract two blocks');
  assert.equal(fallDamage(4, atLevel(['jump_boost', 4])), 0, 'enough jump boost makes a short fall safe');
  assert.equal(fallDamage(10, atLevel(['jump_boost', 1], ['slow_falling', 1])), 0, 'slow falling wins outright');
  assert.equal(hasSlowFalling(atLevel(['slow_falling', 1])), true);
  assert.equal(hasSlowFalling(atLevel(['speed', 2])), false);
});

// --- 3. the rule as the player actually experiences it ----------------------

/** A player standing in a world whose only solid block is at `floorY`. */
function playerOn(block, { gamemode = 'survival' } = {}) {
  const camera = new THREE.PerspectiveCamera();
  const domElement = { requestPointerLock: () => {} };
  const sounds = { playHurt: () => {}, playStep: () => {}, playShieldBlock: () => {} };
  const world = {
    getVoxel: (x, y, z) => (y === 4 ? block : BLOCKS.AIR),
    setVoxel: () => {},
    redstone: { interact: () => null },
  };
  const player = new Player(camera, domElement, world, sounds);
  player.inventory = new Inventory(sounds);
  player.gamemode = gamemode;
  player.health = 20;
  player.position.set(0.5, 5, 0.5);
  player.invulnerableTimer = 0;
  return player;
}

test('landing after a ten block fall costs seven health', () => {
  const player = playerOn(BLOCKS.AIR);
  const dealt = player.applyFallDamage(10, 4);
  assert.equal(dealt, 7);
  assert.equal(player.health, 13, 'the damage reaches the health bar, not just the return value');
});

test('the block landed on decides how much of it is taken', () => {
  const cases = [
    [BLOCKS.HAY_BLOCK, 1], [BLOCKS.HONEY_BLOCK, 1],
    [BLOCKS.SLIME_BLOCK, 0], [BLOCKS.POWDER_SNOW, 0], [BLOCKS.WATER, 0],
    [BLOCKS.STONE, 7], [BLOCKS.AIR, 7],
  ];
  for (const [block, expected] of cases) {
    const player = playerOn(block);
    assert.equal(player.applyFallDamage(10, 4), expected, `landing on block id ${block}`);
    assert.equal(player.health, 20 - expected);
  }
  // Every entry in the table is a real block, so a typo cannot silently make a block safe.
  for (const id of FALL_ABSORBING_BLOCKS.keys()) {
    assert.equal(typeof id, 'number', 'a fall-absorbing key is not a block id');
  }
});

test('Slow Falling makes the landing free, which is the whole point of the potion', () => {
  const player = playerOn(BLOCKS.STONE);
  player.applyStatusEffect('slow_falling', 30, 1);
  assert.equal(player.applyFallDamage(40, 4), 0);
  assert.equal(player.health, 20);
});

test('Feather Falling now reduces something, because there is now something to reduce', () => {
  // This branch existed in `takeDamage` and could never run: nothing in the game ever passed a `'fall'`
  // damage type. It is reachable from this batch onward, so its value starts to matter.
  const withBoots = (enchantments) => {
    const player = playerOn(BLOCKS.STONE);
    player.inventory.armor.feet = { id: 'diamond_boots', enchantments };
    return player;
  };
  const bare = withBoots([]);
  const level3 = withBoots([{ id: 'feather_falling', level: 3 }]);
  assert.equal(bare.applyFallDamage(20, 4), 17);
  assert.ok(level3.applyFallDamage(20, 4) < 17, 'Feather Falling III should reduce the damage');
  assert.ok(level3.health > bare.health, 'and leave more health behind');
});

test('creative mode does not take fall damage', () => {
  const player = playerOn(BLOCKS.STONE, { gamemode: 'creative' });
  assert.equal(player.applyFallDamage(40, 4), 0);
  assert.equal(player.health, 20);
});

test('a harmless landing does not touch the player at all', () => {
  // Above the threshold the landing is silent: no hurt sound, no invulnerability window, no exhaustion.
  const player = playerOn(BLOCKS.STONE);
  let hurt = 0;
  player.sounds.playHurt = () => { hurt++; };
  assert.equal(player.applyFallDamage(3, 4), 0);
  assert.equal(player.invulnerableTimer, 0, 'a safe landing should not grant invulnerability frames');
  assert.equal(hurt, 0);
  assert.equal(player.health, 20);
});

// --- 4. the descent, not just the landing -----------------------------------

test('Slow Falling holds the descent as well as the landing', () => {
  const fall = (withEffect) => {
    const player = playerOn(BLOCKS.AIR);
    if (withEffect) player.applyStatusEffect('slow_falling', 30, 1);
    player.position.set(0.5, 200, 0.5);
    player.onGround = false;
    for (let i = 0; i < 60; i++) player.update(1 / 20);
    return player.velocity.y;
  };
  const normal = fall(false);
  const slow = fall(true);
  assert.ok(normal < -FALL_DAMAGE.slowFallingSpeed, `expected a normal fall to exceed the cap, got ${normal}`);
  assert.ok(slow >= -FALL_DAMAGE.slowFallingSpeed - 1e-6, `expected the capped descent, got ${slow}`);
});

test('the cap is a cap and not a floor: rising is untouched', () => {
  const player = playerOn(BLOCKS.AIR);
  player.applyStatusEffect('slow_falling', 30, 1);
  player.velocity.y = 5;
  player.update(1 / 20);
  assert.ok(player.velocity.y > 0, 'a jumping player should still rise under Slow Falling');
});

