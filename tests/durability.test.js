// Tool durability, which did not exist.
//
// Mining a block never wore the tool and the only item in the registry with a durability value was the
// brush, so a diamond pickaxe was permanent. That removes one of the central pressures of survival mode,
// and it is why unbreaking sat on the outstanding list for three rounds: the thing it modifies was absent.
//
// The maxima are vanilla's, asserted directly rather than derived, because a name-derived lookup would
// silently return nothing for exactly the items most likely to be overlooked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MATERIAL_DURABILITY, FIXED_DURABILITY, maxDurabilityFor, isDurable,
  spendDurability, unbreakingLevel, durabilityFraction,
} from '../src/durability.js';

test('tool materials have vanilla durability', () => {
  // Swords use the same per-material figures as the other tools, so one table covers all five kinds.
  for (const [material, expected] of Object.entries(MATERIAL_DURABILITY)) {
    for (const kind of ['pickaxe', 'axe', 'shovel', 'hoe', 'sword']) {
      assert.equal(maxDurabilityFor(material + '_' + kind), expected,
        material + '_' + kind + ' should be ' + expected);
    }
  }
  // The specific figures, stated so a table edit has to be deliberate.
  assert.equal(maxDurabilityFor('wooden_pickaxe'), 59);
  assert.equal(maxDurabilityFor('stone_pickaxe'), 131);
  assert.equal(maxDurabilityFor('iron_pickaxe'), 250);
  assert.equal(maxDurabilityFor('golden_pickaxe'), 32, 'gold is the weakest, not the strongest');
  assert.equal(maxDurabilityFor('diamond_pickaxe'), 1561);
  assert.equal(maxDurabilityFor('netherite_pickaxe'), 2031, 'and netherite outlasts diamond');
});

test('the fixed-durability items carry their own figures', () => {
  assert.equal(maxDurabilityFor('shears'), 238);
  assert.equal(maxDurabilityFor('flint_and_steel'), 64);
  assert.equal(maxDurabilityFor('fishing_rod'), 64);
  assert.equal(maxDurabilityFor('bow'), 384);
  assert.equal(maxDurabilityFor('crossbow'), 465);
  assert.equal(maxDurabilityFor('shield'), 336);
  assert.equal(maxDurabilityFor('trident'), 250);
  assert.equal(maxDurabilityFor('elytra'), 432);
  assert.equal(maxDurabilityFor('brush'), 64);
  // Armour does not follow the tool table, because its multipliers differ.
  assert.equal(maxDurabilityFor('leather_helmet'), 55);
  assert.equal(maxDurabilityFor('netherite_chestplate'), 592);
  assert.equal(maxDurabilityFor('turtle_helmet_armor'), 275);
});

test('things that do not wear out return null rather than a wrong number', () => {
  for (const id of ['dirt', 'stone', 'diamond', 'apple', 'stick', 'oak_planks', '', null, undefined, 42]) {
    assert.equal(maxDurabilityFor(id), null, String(id) + ' should not wear out');
    assert.equal(isDurable(id), false);
  }
  // A material with no tool of that kind, and a kind with no such material, both return null.
  assert.equal(maxDurabilityFor('wooden_sword_extra'), null);
  assert.equal(maxDurabilityFor('copper_pickaxe'), null, 'copper tools are not in this game');
});

test('a stack with no recorded durability is treated as new', () => {
  const pick = { id: 'iron_pickaxe' };
  const result = spendDurability(pick, 1, () => 0);
  assert.equal(pick.maxDurability, 250, 'the maximum is recorded on first use');
  assert.equal(pick.durability, 249, 'and the point is spent');
  assert.equal(result.spent, 1);
  assert.equal(result.broke, false);
});

test('an item that does not wear out spends nothing', () => {
  const dirt = { id: 'dirt' };
  const result = spendDurability(dirt, 5, () => 0);
  assert.equal(result.spent, 0);
  assert.equal(result.broke, false);
  assert.equal(dirt.durability, undefined, 'and nothing is written on to it');
});

test('a tool breaks at exactly zero', () => {
  const pick = { id: 'wooden_pickaxe' };
  spendDurability(pick, 58, () => 0.5);
  assert.equal(pick.durability, 1, 'one point left after 58 of 59');
  assert.equal(spendDurability(pick, 1, () => 0.5).broke, true, 'the last point breaks it');
  assert.equal(pick.durability, 0);
});

test('a broken tool cannot be used further', () => {
  // Without this guard the caller has to remember not to use a broken tool, and the outcome reports a
  // point spent on something unusable.
  const pick = { id: 'wooden_pickaxe' };
  spendDurability(pick, 59, () => 0.5);
  const again = spendDurability(pick, 1, () => 0.5);
  assert.equal(again.spent, 0, 'nothing left to spend');
  assert.equal(again.broke, true);
  assert.equal(pick.durability, 0, 'and it stays at zero rather than going negative');
});

test('unbreaking multiplies the tool lifetime by level + 1', () => {
  // Vanilla: the point is kept with probability level / (level + 1), so the expected lifetime is the base
  // multiplied by level + 1. Measured over trials rather than asserted from the formula, because the
  // formula and its implementation could be wrong in the same direction.
  const base = 250;
  for (const level of [0, 1, 2, 3]) {
    let total = 0;
    const trials = 200;
    for (let t = 0; t < trials; t++) {
      const pick = { id: 'iron_pickaxe' };
      if (level) pick.enchantments = [{ id: 'unbreaking', level }];
      spendDurability(pick, 0, () => 0);
      let uses = 0;
      while (pick.durability > 0 && uses < 6000) { spendDurability(pick, 1); uses++; }
      total += uses;
    }
    const mean = total / trials;
    const expected = base * (level + 1);
    // Within 8%, which is generous enough for a 200-trial sample and tight enough to catch a missing or
    // inverted multiplier, which would be off by a factor of two at least.
    assert.ok(Math.abs(mean - expected) / expected < 0.08,
      'unbreaking ' + level + ': expected about ' + expected + ' uses, measured ' + Math.round(mean));
  }
});

test('unbreaking with a failing roll still spends, so the worst case is unchanged', () => {
  // The roll only ever KEEPS a point; it never removes one. A random that always fails the keep check must
  // give exactly the base lifetime whatever the level, or unbreaking would be improving the worst case too.
  for (const level of [0, 1, 2, 3]) {
    const pick = { id: 'iron_pickaxe' };
    if (level) pick.enchantments = [{ id: 'unbreaking', level }];
    spendDurability(pick, 0, () => 0);
    let uses = 0;
    while (pick.durability > 0 && uses < 6000) { spendDurability(pick, 1, () => 0.999); uses++; }
    assert.equal(uses, 250, 'level ' + level + ' should still use 250 points when every roll fails');
  }
});

test('unbreakingLevel reads the highest level and tolerates junk', () => {
  assert.equal(unbreakingLevel([{ id: 'unbreaking', level: 3 }]), 3);
  assert.equal(unbreakingLevel([{ id: 'unbreaking', level: 1 }, { id: 'unbreaking', level: 2 }]), 2);
  assert.equal(unbreakingLevel([{ id: 'efficiency', level: 5 }]), 0, 'a different enchantment is not unbreaking');
  assert.equal(unbreakingLevel(null), 0);
  assert.equal(unbreakingLevel([null, {}, { id: 'unbreaking' }]), 0, 'a level that is not a number');
});

test('the durability fraction is usable for a bar', () => {
  assert.equal(durabilityFraction({ id: 'dirt' }), null, 'nothing to show for an unbreakable item');
  assert.equal(durabilityFraction({ id: 'iron_pickaxe' }), 1, 'an untouched tool is full');
  const half = { id: 'iron_pickaxe', durability: 125, maxDurability: 250 };
  assert.equal(durabilityFraction(half), 0.5);
  assert.equal(durabilityFraction({ id: 'iron_pickaxe', durability: 0, maxDurability: 250 }), 0);
  // A stack whose durability somehow exceeds its maximum is clamped rather than reporting over 1.
  assert.equal(durabilityFraction({ id: 'iron_pickaxe', durability: 999, maxDurability: 250 }), 1);
  assert.equal(durabilityFraction(null), null);
});

test('breaking a block wears the held tool, in survival only', () => {
  // The wiring, checked at the source because driving breakTargetBlock needs a whole Game. This is
  // weaker than an integration test and is labelled as such: it proves the call exists and is gated,
  // not that a specific block break produces a specific wear.
  const source = readFileSync('src/main.js', 'utf8');
  const fn = source.slice(source.indexOf('  breakTargetBlock() {'));
  const body = fn.slice(0, fn.indexOf('\n  }'));
  assert.ok(body.includes('spendDurability('), 'breakTargetBlock should spend durability');
  assert.ok(/gamemode === 'survival'/.test(body), 'and only in survival');
  assert.ok(body.includes('consumeActiveItem'), 'and clear the slot when the tool breaks');
});
