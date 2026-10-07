// Experience parity with https://minecraft.wiki/w/Experience (Java Edition, the 1.8+ curve).
//
// The wiki gives the curve in three bands and tabulates the cumulative totals, which makes the whole thing
// checkable: the per-level requirement, the running total, and the inverse. A single off-by-one in a band
// boundary is invisible in play but wrong for every level above it, so the boundaries are asserted
// explicitly and the total is checked against the sum rather than against a second formula.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getXpToNextLevel, getTotalXpForLevel, getLevelFromTotalXp,
  addPlayerExperience, consumePlayerLevels, getExpProgress,
} from '../src/experience.js';

const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-9,
  `${what}: expected ${expected}, got ${actual}`);

test('the XP needed for the next level follows the wiki\'s three bands', () => {
  // 0-15: 2L + 7. 16-30: 5L - 38. 31 and up: 9L - 158.
  near(getXpToNextLevel(0), 7, 'level 0 -> 1');
  near(getXpToNextLevel(1), 9, 'level 1 -> 2');
  near(getXpToNextLevel(15), 37, 'last level of the first band');
  near(getXpToNextLevel(16), 42, 'first level of the second band');
  near(getXpToNextLevel(29), 107, 'last level of the second band');
  near(getXpToNextLevel(30), 112, 'level 30 -> 31');
  near(getXpToNextLevel(31), 121, 'first level of the third band');
  near(getXpToNextLevel(100), 742, 'level 100 -> 101');
});

test('cumulative XP matches the totals the wiki tabulates', () => {
  near(getTotalXpForLevel(0), 0, 'level 0');
  near(getTotalXpForLevel(1), 7, 'level 1');
  near(getTotalXpForLevel(16), 352, 'level 16');
  near(getTotalXpForLevel(30), 1395, 'level 30, the enchanting cap');
  near(getTotalXpForLevel(31), 1507, 'level 31');
  near(getTotalXpForLevel(32), 1628, 'level 32, first of the third band');
  near(getTotalXpForLevel(100), 30970, 'level 100');
});

test('the cumulative total is exactly the sum of the per-level requirements', () => {
  // This is the check that catches a band formula that is right at the boundaries and wrong between them.
  let sum = 0;
  for (let level = 0; level < 120; level++) {
    sum += getXpToNextLevel(level);
    assert.equal(getTotalXpForLevel(level + 1), sum, `total for level ${level + 1}`);
  }
});

test('the level from total XP inverts the total, exactly and one point short', () => {
  for (const level of [0, 1, 15, 16, 17, 30, 31, 32, 50, 100]) {
    const total = getTotalXpForLevel(level);
    assert.equal(getLevelFromTotalXp(total), level, `exactly the total for level ${level}`);
    if (level > 0) {
      assert.equal(getLevelFromTotalXp(total - 1), level - 1, `one point short of level ${level}`);
    }
  }
  assert.equal(getLevelFromTotalXp(0), 0, 'no XP is level 0');
  assert.equal(getLevelFromTotalXp(-5), 0, 'a negative total cannot produce a level');
});

test('the XP bar is the fraction of the current level, and never overflows', () => {
  assert.equal(getExpProgress({ level: 0, exp: 0 }), 0, 'empty');
  near(getExpProgress({ level: 0, exp: 7 }), 1, 'exactly the requirement');
  near(getExpProgress({ level: 16, exp: 21 }), 0.5, 'half of the 42 needed at level 16');
  assert.equal(getExpProgress({ level: 0, exp: 99 }), 1, 'clamped to one');
  assert.equal(getExpProgress({ level: 5, exp: -3 }), 0, 'and to zero');
});

test('adding XP levels up repeatedly, across several levels at once', () => {
  const player = { level: 0, exp: 0 };
  const result = addPlayerExperience(player, 100);
  // The first seven levels cost 7+9+11+13+15+17+19 = 91, so 100 points leaves 9 into level 7.
  assert.equal(result.leveledUp, true, 'it reports the level-up');
  assert.equal(player.level, 7, 'seven levels from 100 points');
  assert.equal(player.exp, 9, 'and the remainder stays on the bar');
});

test('adding XP is a no-op for zero or negative amounts', () => {
  const player = { level: 3, exp: 4 };
  addPlayerExperience(player, 0);
  addPlayerExperience(player, -10);
  assert.equal(player.level, 3);
  assert.equal(player.exp, 4);
});

test('levels can be spent for enchanting, and an unaffordable spend changes nothing', () => {
  const player = { level: 5, exp: 0 };
  assert.equal(consumePlayerLevels(player, 3), true, 'three of five levels');
  assert.equal(player.level, 2);
  assert.equal(consumePlayerLevels(player, 3), false, 'three more is not affordable');
  assert.equal(player.level, 2, 'and the level is untouched by the refusal');
  assert.equal(consumePlayerLevels(player, 0), true, 'spending nothing always succeeds');
});
