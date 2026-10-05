// Brewing parity against the rules researched from Mineclonia, section 2.6 of
// docs/survival-parity-rules.md.
//
// Three real faults are pinned here, all of them silent:
//   - the brew took 20 seconds where vanilla and Mineclonia both take 10, and the comment asserted 20 as
//     well, so the code and its own documentation agreed with each other and disagreed with the game
//   - potion_of_slowness did not exist at all, and no corruption row produced it, because the fermented
//     spider eye table covered night vision, healing and poison but not swiftness or leaping
//   - potion_of_slowness_2 then existed in the data with no recipe able to produce it, which is the same
//     fault in the other direction
//
// Referential integrity is therefore checked BOTH ways, since either direction can be broken silently.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BrewingStand, BASE_BREWING_RECIPES, POTION_DATA, getBrewingResult } from '../src/brewing.js';

test('a brew takes ten seconds, and twenty operations of fuel is twenty brews', () => {
  const stand = new BrewingStand();
  assert.equal(stand.brewDuration, 10, 'vanilla and Mineclonia both brew in 10 s');
  assert.equal(stand.maxFuel, 20, 'one blaze powder is 20 operations');
  assert.equal(stand.fuel, 0, 'and a new stand is empty');
  assert.equal(stand.bottles.length, 3, 'three bottle slots, one ingredient slot');
});

test('fuel is blaze powder only, and it fills to a ceiling', () => {
  const stand = new BrewingStand();
  assert.equal(stand.addFuel({ id: 'gunpowder' }), false, 'gunpowder is not fuel');
  assert.equal(stand.addFuel(null), false);
  assert.equal(stand.addFuel({ id: 'blaze_powder' }), true);
  assert.equal(stand.fuel, 20, 'one powder fills the stand');
  assert.equal(stand.addFuel({ id: 'blaze_powder' }), false, 'and it cannot overflow');
  assert.equal(stand.fuel, 20);
});

test('the researched duration constants hold', () => {
  // Base 180 s, extended by 8/3, halved by potency. Each is checked against a potion that demonstrates the
  // rule rather than against an implementation of it.
  //
  // An earlier version required a level II form for EVERY base potion and failed on fire resistance.
  // Vanilla gives amplitude forms to the potions whose strength is an amount -- speed, strength, leaping,
  // regeneration, poison, healing, harming, slowness -- and none to those whose only variable is duration:
  // fire resistance, night vision, water breathing, slow falling, weakness, invisibility. The data was
  // right and the expectation was wrong.
  const amplified = ['potion_of_swiftness', 'potion_of_strength', 'potion_of_leaping'];
  for (const id of amplified) {
    assert.equal(POTION_DATA[id].duration, 180, id + ' should have a 180 s base duration');
    const long = POTION_DATA[id + '_long'];
    assert.ok(long, id + ' should have an extended form');
    assert.equal(long.duration, 480, id + ' extended should be 180 x 8/3 = 480');
    assert.equal(long.duration, POTION_DATA[id].duration * 8 / 3, id + ' extended ratio');
    assert.equal(POTION_DATA[id + '_2'].duration, 90, id + ' at level II should be halved to 90');
  }

  // Duration-only potions are extended but never amplified.
  for (const id of ['potion_of_fire_resistance', 'potion_of_night_vision', 'potion_of_water_breathing']) {
    assert.equal(POTION_DATA[id].duration, 180, id + ' base');
    assert.equal(POTION_DATA[id + '_long'].duration, 480, id + ' extended');
    assert.equal(POTION_DATA[id + '_2'], undefined,
      id + ' has no level II in vanilla, because only its duration varies');
  }

  // The short base durations, which are their own constants rather than fractions of 180.
  assert.equal(POTION_DATA.potion_of_poison.duration, 45, 'poison is 45 s');
  assert.equal(POTION_DATA.potion_of_regeneration.duration, 45, 'regeneration is 45 s');
  assert.equal(POTION_DATA.potion_of_weakness.duration, 90, 'weakness is 90 s');
  assert.equal(POTION_DATA.potion_of_slowness.duration, 90, 'slowness is 90 s');
  // And their extended forms are the doubled figure, not the 8/3 one the 180 s potions use.
  assert.equal(POTION_DATA.potion_of_poison_long.duration, 90);
  assert.equal(POTION_DATA.potion_of_weakness_long.duration, 240);
  assert.equal(POTION_DATA.potion_of_slowness_long.duration, 240);
});

test('instant potions carry an amount rather than a duration', () => {
  for (const id of ['potion_of_healing', 'potion_of_harming']) {
    assert.equal(POTION_DATA[id].duration, undefined, id + ' is instant');
    assert.ok(typeof POTION_DATA[id].amount === 'number', id + ' should carry an amount');
  }
  assert.equal(POTION_DATA.potion_of_healing.effect, 'instant_health');
  assert.equal(POTION_DATA.potion_of_harming.effect, 'instant_damage');
  // Harming hits harder than healing restores, which is vanilla's asymmetry.
  assert.ok(POTION_DATA.potion_of_harming.amount > POTION_DATA.potion_of_healing.amount,
    'harming should out-damage healing');
});

test('slowness exists and is brewable from swiftness or leaping', () => {
  for (const id of ['potion_of_slowness', 'potion_of_slowness_long', 'potion_of_slowness_2']) {
    assert.ok(POTION_DATA[id], id + ' should exist');
    assert.equal(POTION_DATA[id].effect, 'slowness');
  }
  // Vanilla reaches slowness from EITHER of these, so both rows belong.
  assert.equal(getBrewingResult('potion_of_swiftness', 'fermented_spider_eye'), 'potion_of_slowness', 'from swiftness');
  assert.equal(getBrewingResult('potion_of_leaping', 'fermented_spider_eye'), 'potion_of_slowness', 'from leaping');
  assert.equal(getBrewingResult('potion_of_swiftness_long', 'fermented_spider_eye'), 'potion_of_slowness_long');
  // And Slowness IV comes from glowstone, which is the same rule as every other level II potion.
  assert.equal(getBrewingResult('potion_of_slowness', 'glowstone_dust'), 'potion_of_slowness_2');
});

test('the fermented spider eye table covers every vanilla conversion', () => {
  // Vanilla's list, complete: night vision to invisibility, healing to harming, poison to harming,
  // swiftness to slowness, leaping to slowness. Missing rows fail silently -- the brew simply does nothing.
  const expected = [
    ['potion_of_night_vision', 'potion_of_invisibility'],
    ['potion_of_healing', 'potion_of_harming'],
    ['potion_of_poison', 'potion_of_harming'],
    ['potion_of_swiftness', 'potion_of_slowness'],
    ['potion_of_leaping', 'potion_of_slowness'],
  ];
  for (const [bottle, result] of expected) {
    assert.equal(getBrewingResult(bottle, 'fermented_spider_eye'), result,
      bottle + ' + fermented spider eye should give ' + result);
  }
});

test('a corruption works on the extended form of its potion too', () => {
  // A player who extends a potion before corrupting it must not lose the extension, which is what a
  // missing `_long` row would do.
  assert.equal(getBrewingResult('potion_of_night_vision_long', 'fermented_spider_eye'), 'potion_of_invisibility_long');
  assert.equal(getBrewingResult('potion_of_swiftness_long', 'fermented_spider_eye'), 'potion_of_slowness_long');
});

test('every recipe result is a potion that exists', () => {
  const broken = BASE_BREWING_RECIPES
    .filter(r => !POTION_DATA[r.result])
    .map(r => r.bottle + ' + ' + r.ingredient + ' -> ' + r.result);
  assert.deepEqual(broken, [], 'recipes pointing at a potion that does not exist');
});

test('every potion can be produced by some recipe, except the base water bottle', () => {
  // The other direction, which is how Slowness IV hid: present in the data, unreachable in play.
  const producible = new Set(BASE_BREWING_RECIPES.map(r => r.result));
  const unreachable = Object.keys(POTION_DATA).filter(id => !producible.has(id));
  // water_bottle is the exception and is not brewed -- a bottle is filled at water.
  assert.deepEqual(unreachable, ['water_bottle'],
    'these potions exist but no recipe can produce them');
});

test('an unknown combination returns null rather than a wrong potion', () => {
  assert.equal(getBrewingResult('potion_of_swiftness', 'dirt'), null);
  assert.equal(getBrewingResult('not_a_potion', 'nether_wart'), null);
  assert.equal(getBrewingResult(undefined, undefined), null);
  assert.equal(getBrewingResult('water_bottle', 'nether_wart'), 'awkward_potion', 'the base case still works');
});
