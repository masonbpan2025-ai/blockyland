// Brewing parity against https://minecraft.wiki/w/Brewing, the Brewing Stand article and
// https://minecraft.wiki/w/Potion.
//
// This file pins the whole ruleset rather than a sample, because every failure mode here is silent: a
// missing recipe row means the brew simply does nothing, and a wrong duration constant means every
// potion in the game is wrong by the same factor with nothing to compare against.
//
// Faults this suite was written or rewritten for:
//   - the brew took 10 seconds where vanilla takes 20 (400 ticks). The comment above the constant
//     asserted 10 as well, so the code and its own documentation agreed with each other and disagreed
//     with the game -- as did the first version of this test.
//   - `potion_of_slowness + redstone` had no row, so the only way to an extended Slowness was to
//     corrupt an already-extended Swiftness; extending Slowness directly brewed nothing.
//   - the Potion of the Turtle Master had no extended or enhanced form at all, although its recipe
//     table lists all three. It was the only potion in the game with no way to extend it.
//   - nothing ever ticked a stand, so a brew had no duration in play and the timer was decorative.
//   - closing the window emptied the stand into the player's inventory, where vanilla keeps the
//     contents in the block and keeps brewing.
//   - a thrown Splash Potion of the Turtle Master granted a `turtle_master` status instead of its
//     Slowness and its Resistance, because only the drinking path expanded a compound effect.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BrewingStand, BrewingManager, BREW_DURATION, MAX_FUEL, BOTTLE_SLOTS,
  BASE_BREWING_RECIPES, POTION_DATA, getBrewingResult, potionDataFor, potionCoreFor,
} from '../src/brewing.js';
import { EFFECTS, effectsFor, compoundEffects, isKnownEffect } from '../src/statusEffects.js';
import { INSTANT_EFFECTS } from '../src/potionUse.js';

// --- the stand's constants -----------------------------------------------------

test('one brewing stage takes twenty seconds and one blaze powder is twenty stages', () => {
  // The Brewing Stand article: "Each piece brews 20 batches of potions, with each stage of brewing
  // counting separately. A single brew takes 20 seconds (400 ticks) to complete."
  assert.equal(BREW_DURATION, 20, '400 game ticks');
  assert.equal(MAX_FUEL, 20, 'one blaze powder is 20 operations');
  assert.equal(BOTTLE_SLOTS, 3, 'three bottle slots and one ingredient slot');

  const stand = new BrewingStand();
  assert.equal(stand.brewDuration, BREW_DURATION);
  assert.equal(stand.maxFuel, MAX_FUEL);
  assert.equal(stand.fuel, 0, 'a new stand is empty');
  assert.equal(stand.bottles.length, 3);
});

test('a stage lands after exactly twenty seconds of ticking, not before', () => {
  const stand = new BrewingStand();
  stand.addFuel({ id: 'blaze_powder' });
  stand.ingredient = { id: 'nether_wart', count: 1 };
  stand.bottles = [{ id: 'water_bottle', count: 1 }, null, null];

  // Nineteen seconds in, nothing has happened yet.
  let elapsed = 0;
  while (elapsed < 19) { stand.update(1.0); elapsed += 1; }
  assert.equal(stand.bottles[0].id, 'water_bottle', 'the potion must not change early');
  assert.ok(stand.isBrewing, 'and the stand is visibly mid-brew');
  assert.equal(stand.getProgress(), 19 / 20, 'the progress bar tracks the timer');

  // The twentieth tick completes it.
  assert.equal(stand.update(1.0), true, 'the stage completes on the twentieth second');
  assert.equal(stand.bottles[0].id, 'awkward_potion');
  assert.equal(stand.getProgress(), 0, 'and the timer is reset');
  assert.equal(stand.isBrewing, false);
});

test('fuel is blaze powder only, it fills to a ceiling, and one stage spends one charge', () => {
  const stand = new BrewingStand();
  assert.equal(stand.addFuel({ id: 'gunpowder' }), false, 'gunpowder is not fuel');
  assert.equal(stand.addFuel({ id: 'blaze_rod' }), false, 'a blaze rod is furnace fuel, not stand fuel');
  assert.equal(stand.addFuel(null), false);
  assert.equal(stand.addFuel({ id: 'blaze_powder' }), true);
  assert.equal(stand.fuel, MAX_FUEL, 'one powder fills the stand');
  assert.equal(stand.addFuel({ id: 'blaze_powder' }), false, 'and it cannot overflow');

  // "One powder is twenty operations": with an ingredient that always matches, the powder runs out on
  // the twentieth stage and not before. The bottle is refilled each time because a brewed potion is no
  // longer something the same ingredient reacts to, and a stage with nothing to transform is correctly
  // free rather than a charge.
  stand.ingredient = { id: 'glowstone_dust', count: 99 };
  let stages = 0;
  while (stand.fuel > 0) {
    stand.bottles[0] = { id: 'potion_of_slowness', count: 1 }; // glowstone -> Slowness IV
    assert.equal(stand.update(1.0, { instant: true }), true, 'stage ' + (stages + 1) + ' should brew');
    stages++;
    assert.ok(stages <= MAX_FUEL, 'the stand brewed more stages than it had fuel for');
  }
  assert.equal(stages, MAX_FUEL, 'one powder is exactly twenty stages');
  assert.equal(stand.fuel, 0);
  assert.equal(stand.ingredient.count, 99 - MAX_FUEL, 'and one ingredient per stage');
});

test('an ingredient nothing reacts to never starts a brew and never spends fuel', () => {
  // "Unlike furnaces, there is no time limit; fuel is consumed only when there are water bottles and an
  // ingredient to brew into it."
  const stand = new BrewingStand();
  stand.addFuel({ id: 'blaze_powder' });
  stand.bottles = [{ id: 'water_bottle', count: 1 }, null, null];
  stand.ingredient = { id: 'dirt', count: 1 };
  assert.equal(stand.canBrew(), false);

  stand.update(60, { instant: true });
  assert.equal(stand.fuel, MAX_FUEL, 'fuel survived an ingredient that does nothing');
  assert.equal(stand.ingredient.count, 1, 'and so did the ingredient');
  assert.equal(stand.bottles[0].id, 'water_bottle');

  // No fuel, no brew, even with a perfect ingredient.
  const dry = new BrewingStand();
  dry.ingredient = { id: 'nether_wart', count: 1 };
  dry.bottles = [{ id: 'water_bottle', count: 1 }, null, null];
  assert.equal(dry.canBrew(), false);
  assert.equal(dry.update(60, { instant: true }), false, 'and nothing happens without fuel');
  assert.equal(dry.ingredient.count, 1);
  assert.equal(dry.bottles[0].id, 'water_bottle');
});

test('every filled bottle slot is brewed at once, and an inert one is left alone', () => {
  const stand = new BrewingStand();
  stand.addFuel({ id: 'blaze_powder' });
  stand.ingredient = { id: 'sugar', count: 1 };
  stand.bottles = [
    { id: 'awkward_potion', count: 1 },
    { id: 'thick_potion', count: 1 },   // sugar does nothing to this
    { id: 'awkward_potion', count: 1 },
  ];
  assert.equal(stand.canBrew(), true);
  assert.equal(stand.completeBrew(), true);
  assert.equal(stand.bottles[0].id, 'potion_of_swiftness');
  assert.equal(stand.bottles[1].id, 'thick_potion', 'a bottle the ingredient does not match is untouched');
  assert.equal(stand.bottles[2].id, 'potion_of_swiftness');
  assert.equal(stand.fuel, MAX_FUEL - 1, 'one stage spends one charge however many bottles it fills');
  assert.equal(stand.ingredient, null, 'the last ingredient was consumed and the slot cleared');
});

// --- the recipe table against the wiki's ---------------------------------------

/** The wiki's Java Edition brewing table, written out. */
const VANILLA_RECIPES = [
  // Base potions: the four things a water bottle can become directly.
  ['water_bottle', 'nether_wart', 'awkward_potion'],
  ['water_bottle', 'redstone', 'mundane_potion'],
  ['water_bottle', 'glowstone_dust', 'thick_potion'],
  ['water_bottle', 'fermented_spider_eye', 'potion_of_weakness'],

  // Effect ingredients, all on an awkward potion.
  ['awkward_potion', 'sugar', 'potion_of_swiftness'],
  ['awkward_potion', 'rabbit_foot', 'potion_of_leaping'],
  ['awkward_potion', 'glistering_melon_slice', 'potion_of_healing'],
  ['awkward_potion', 'spider_eye', 'potion_of_poison'],
  ['awkward_potion', 'pufferfish', 'potion_of_water_breathing'],
  ['awkward_potion', 'magma_cream', 'potion_of_fire_resistance'],
  ['awkward_potion', 'golden_carrot', 'potion_of_night_vision'],
  ['awkward_potion', 'blaze_powder', 'potion_of_strength'],
  ['awkward_potion', 'ghast_tear', 'potion_of_regeneration'],
  ['awkward_potion', 'turtle_scute', 'potion_of_turtle_master'],
  ['awkward_potion', 'phantom_membrane', 'potion_of_slow_falling'],

  // Corruption: the five effect pairs vanilla converts.
  ['potion_of_night_vision', 'fermented_spider_eye', 'potion_of_invisibility'],
  ['potion_of_healing', 'fermented_spider_eye', 'potion_of_harming'],
  ['potion_of_poison', 'fermented_spider_eye', 'potion_of_harming'],
  ['potion_of_swiftness', 'fermented_spider_eye', 'potion_of_slowness'],
  ['potion_of_leaping', 'fermented_spider_eye', 'potion_of_slowness'],

  // Redstone: every potion the wiki marks as extendable.
  ['potion_of_regeneration', 'redstone', 'potion_of_regeneration_long'],
  ['potion_of_swiftness', 'redstone', 'potion_of_swiftness_long'],
  ['potion_of_fire_resistance', 'redstone', 'potion_of_fire_resistance_long'],
  ['potion_of_poison', 'redstone', 'potion_of_poison_long'],
  ['potion_of_strength', 'redstone', 'potion_of_strength_long'],
  ['potion_of_night_vision', 'redstone', 'potion_of_night_vision_long'],
  ['potion_of_water_breathing', 'redstone', 'potion_of_water_breathing_long'],
  ['potion_of_leaping', 'redstone', 'potion_of_leaping_long'],
  ['potion_of_slowness', 'redstone', 'potion_of_slowness_long'],
  ['potion_of_invisibility', 'redstone', 'potion_of_invisibility_long'],
  ['potion_of_slow_falling', 'redstone', 'potion_of_slow_falling_long'],
  ['potion_of_weakness', 'redstone', 'potion_of_weakness_long'],
  ['potion_of_turtle_master', 'redstone', 'potion_of_turtle_master_long'],

  // Glowstone: every potion the wiki marks as enhanceable.
  ['potion_of_healing', 'glowstone_dust', 'potion_of_healing_2'],
  ['potion_of_regeneration', 'glowstone_dust', 'potion_of_regeneration_2'],
  ['potion_of_swiftness', 'glowstone_dust', 'potion_of_swiftness_2'],
  ['potion_of_poison', 'glowstone_dust', 'potion_of_poison_2'],
  ['potion_of_strength', 'glowstone_dust', 'potion_of_strength_2'],
  ['potion_of_leaping', 'glowstone_dust', 'potion_of_leaping_2'],
  ['potion_of_harming', 'glowstone_dust', 'potion_of_harming_2'],
  ['potion_of_slowness', 'glowstone_dust', 'potion_of_slowness_2'],
  ['potion_of_turtle_master', 'glowstone_dust', 'potion_of_turtle_master_2'],
];

test('every recipe in the wiki table is implemented', () => {
  const missing = [];
  for (const [bottle, ingredient, result] of VANILLA_RECIPES) {
    const got = getBrewingResult(bottle, ingredient);
    if (got !== result) missing.push(`${bottle} + ${ingredient}: want ${result}, got ${got}`);
  }
  assert.deepEqual(missing, []);
});

test('a corrupted or extended potion keeps its modifier', () => {
  // "Corrupting an extended or enhanced potion results in a corrupted potion with the same modifier, if
  // it is supported by the corrupted effect."
  assert.equal(getBrewingResult('potion_of_night_vision_long', 'fermented_spider_eye'), 'potion_of_invisibility_long');
  assert.equal(getBrewingResult('potion_of_swiftness_long', 'fermented_spider_eye'), 'potion_of_slowness_long');
  assert.equal(getBrewingResult('potion_of_leaping_long', 'fermented_spider_eye'), 'potion_of_slowness_long');
  assert.equal(getBrewingResult('potion_of_healing_2', 'fermented_spider_eye'), 'potion_of_harming_2');
  assert.equal(getBrewingResult('potion_of_poison_2', 'fermented_spider_eye'), 'potion_of_harming_2');
  // Harming cannot be extended, so an extended Poison corrupts to plain Harming rather than to a form
  // that does not exist.
  assert.equal(getBrewingResult('potion_of_poison_long', 'fermented_spider_eye'), 'potion_of_harming');
  assert.equal(POTION_DATA.potion_of_harming_long, undefined, 'vanilla has no extended Harming');
});

test('the enhanced Swiftness and Leaping are the two corruptions vanilla refuses', () => {
  // "Enhanced potions of Leaping or Swiftness cannot be corrupted." The Potion of Slowness page agrees
  // from the other side: its brewing ingredients list only the regular and extended Swiftness and Leaping,
  // with no enhanced form. The table used to carry rows corrupting both into a plain Slowness, which brewed
  // the one potion vanilla refuses to make this way and gave Slowness IV a second source.
  assert.equal(getBrewingResult('potion_of_swiftness_2', 'fermented_spider_eye'), null);
  assert.equal(getBrewingResult('potion_of_leaping_2', 'fermented_spider_eye'), null);
  // The forms vanilla does allow still corrupt, and keep their modifier.
  assert.equal(getBrewingResult('potion_of_swiftness', 'fermented_spider_eye'), 'potion_of_slowness');
  assert.equal(getBrewingResult('potion_of_swiftness_long', 'fermented_spider_eye'), 'potion_of_slowness_long');
  assert.equal(getBrewingResult('potion_of_leaping', 'fermented_spider_eye'), 'potion_of_slowness');
  assert.equal(getBrewingResult('potion_of_leaping_long', 'fermented_spider_eye'), 'potion_of_slowness_long');
  // Slowness IV's one source is glowstone on Slowness, which is what vanilla brews.
  assert.equal(getBrewingResult('potion_of_slowness', 'glowstone_dust'), 'potion_of_slowness_2');
});

test('a generic splash or lingering water potion keeps its form through a base ingredient', () => {
  // "a splash water bottle can be brewed with any of the base ingredients; the result remains a splash
  // potion". Vanilla's generic splash and lingering potions ARE the water ones, and their ids are
  // `splash_potion` / `lingering_potion` -- which strip to the meaningless `potion`, so the base-ingredient
  // lookup used to find no recipe and these brewed nothing.
  assert.equal(getBrewingResult('splash_potion', 'nether_wart'), 'splash_awkward_potion');
  assert.equal(getBrewingResult('lingering_potion', 'nether_wart'), 'lingering_awkward_potion');
  assert.equal(getBrewingResult('splash_potion', 'glowstone_dust'), 'splash_thick_potion');
  assert.equal(getBrewingResult('lingering_potion', 'fermented_spider_eye'), 'lingering_potion_of_weakness');
  // And the derived forms still brew on from there, keeping the prefix.
  assert.equal(getBrewingResult('splash_awkward_potion', 'sugar'), 'splash_potion_of_swiftness');
  assert.equal(getBrewingResult('lingering_awkward_potion', 'sugar'), 'lingering_potion_of_swiftness');
  // The generic ids are still recognised as potions by the accessors.
  assert.equal(potionCoreFor('splash_potion'), 'water_bottle');
  assert.equal(potionCoreFor('lingering_potion'), 'water_bottle');
});

test('the corruptions vanilla does not have are absent', () => {
  // "Corrupting a potion of Strength doesn't turn it into Weakness. Instead, that is brewed by corrupting
  // a Water Bottle."
  const absent = [
    ['potion_of_strength', 'fermented_spider_eye'],
    ['potion_of_weakness', 'fermented_spider_eye'],
    ['potion_of_invisibility', 'fermented_spider_eye'],
    ['potion_of_regeneration', 'fermented_spider_eye'],
    ['potion_of_fire_resistance', 'fermented_spider_eye'],
    ['potion_of_water_breathing', 'fermented_spider_eye'],
    ['potion_of_slow_falling', 'fermented_spider_eye'],
    ['potion_of_turtle_master', 'fermented_spider_eye'],
    ['potion_of_harming', 'fermented_spider_eye'],
    // Enhancement and extension are mutually exclusive: neither applies to a potion already carrying
    // the other.
    ['potion_of_healing_2', 'glowstone_dust'],
    ['potion_of_slowness_long', 'glowstone_dust'],
    ['potion_of_strength_long', 'redstone'],
    ['potion_of_swiftness_2', 'redstone'],
  ];
  const wrong = absent
    .filter(([bottle, ingredient]) => getBrewingResult(bottle, ingredient) !== null)
    .map(([bottle, ingredient]) => `${bottle} + ${ingredient} -> ${getBrewingResult(bottle, ingredient)}`);
  assert.deepEqual(wrong, []);
});

test('only the four base ingredients go straight onto a water bottle', () => {
  // "When added directly to a water bottle, most of these ingredients produce a mundane potion. The
  // exceptions to this are the golden carrot, pufferfish, turtle shell, and phantom membrane, which
  // cannot be added directly to a water bottle." This game has no mundane-from-effect-ingredient rule,
  // so the only things a water bottle accepts are the four base ingredients; what matters is that the
  // four exceptions do nothing rather than brewing something plausible.
  const effectIngredients = [
    'sugar', 'rabbit_foot', 'glistering_melon_slice', 'spider_eye', 'pufferfish', 'magma_cream',
    'golden_carrot', 'blaze_powder', 'ghast_tear', 'turtle_scute', 'phantom_membrane',
  ];
  const brewed = effectIngredients
    .filter((ingredient) => getBrewingResult('water_bottle', ingredient) !== null)
    .map((ingredient) => `water_bottle + ${ingredient} -> ${getBrewingResult('water_bottle', ingredient)}`);
  assert.deepEqual(brewed, []);
});

test('gunpowder and dragon breath convert any potion to the right delivery form', () => {
  // "A splash water bottle can be brewed with any of the base ingredients; the result remains a splash
  // potion." The prefix mechanism is what makes that true for all 119 ids rather than a list.
  assert.equal(getBrewingResult('water_bottle', 'gunpowder'), 'splash_potion', 'vanilla\'s generic splash potion');
  assert.equal(getBrewingResult('potion_of_healing', 'gunpowder'), 'splash_potion_of_healing');
  assert.equal(getBrewingResult('potion_of_turtle_master_2', 'gunpowder'), 'splash_potion_of_turtle_master_2');
  assert.equal(getBrewingResult('splash_potion', 'dragon_breath'), 'lingering_potion');
  assert.equal(getBrewingResult('splash_potion_of_swiftness_2', 'dragon_breath'), 'lingering_potion_of_swiftness_2');

  // A splash potion cannot be splashed twice, and dragon's breath needs a splash to work on.
  assert.equal(getBrewingResult('splash_potion_of_healing', 'gunpowder'), null);
  assert.equal(getBrewingResult('lingering_potion_of_healing', 'gunpowder'), null);
  assert.equal(getBrewingResult('potion_of_healing', 'dragon_breath'), null);
  assert.equal(getBrewingResult('water_bottle', 'dragon_breath'), null);

  // And the splash of every brewable potion is itself brewable into a lingering one. The water bottle is
  // the one id whose forms are vanilla's generic ones, so its pair is `splash_potion`/`lingering_potion`
  // rather than a prefixed name; `VANILLA_GENERIC_POTION_FORMS` is what says so.
  const notConvertible = Object.keys(POTION_DATA)
    .filter((id) => !id.startsWith('splash_') && !id.startsWith('lingering_'))
    .filter((id) => {
      const splash = getBrewingResult(id, 'gunpowder');
      if (!splash) return true;
      const lingering = getBrewingResult(splash, 'dragon_breath');
      return id === 'water_bottle' ? lingering !== 'lingering_potion' : lingering !== `lingering_${id}`;
    });
  assert.deepEqual(notConvertible, []);
});

test('referential integrity holds in both directions', () => {
  // Either direction can break silently: a recipe pointing at a potion that does not exist yields a
  // phantom stack, and a potion with no recipe is unreachable in play.
  const brokenResults = BASE_BREWING_RECIPES
    .filter(r => !POTION_DATA[r.result])
    .map(r => `${r.bottle} + ${r.ingredient} -> ${r.result}`);
  assert.deepEqual(brokenResults, [], 'recipes pointing at a potion that does not exist');

  const producible = new Set(BASE_BREWING_RECIPES.map(r => r.result));
  for (const id of Object.keys(POTION_DATA)) {
    const splash = getBrewingResult(id, 'gunpowder');
    if (splash) producible.add(splash);
  }
  for (const splash of [...producible]) {
    const lingering = getBrewingResult(splash, 'dragon_breath');
    if (lingering) producible.add(lingering);
  }
  const unreachable = Object.keys(POTION_DATA).filter(id => id !== 'water_bottle' && !producible.has(id));
  assert.deepEqual(unreachable, [], 'these potions exist but nothing can produce them');
});

test('an unknown combination returns null rather than a wrong potion', () => {
  assert.equal(getBrewingResult('potion_of_swiftness', 'dirt'), null);
  assert.equal(getBrewingResult('not_a_potion', 'nether_wart'), null);
  assert.equal(getBrewingResult('water_bottle', 'not_an_item'), null);
  assert.equal(getBrewingResult(undefined, undefined), null);
  assert.equal(getBrewingResult(null, 'nether_wart'), null);
  assert.equal(getBrewingResult('water_bottle', ''), null);
  assert.equal(getBrewingResult('water_bottle', 'nether_wart'), 'awkward_potion', 'the base case still works');
});

// --- durations and effects -----------------------------------------------------

test('the researched duration constants hold', () => {
  // Base 180 s, extended by 8/3, halved by potency. Each is checked against a potion that demonstrates
  // the rule rather than against an implementation of it.
  //
  // Vanilla gives amplitude forms to the potions whose strength is an amount -- speed, strength, leaping,
  // regeneration, poison, healing, harming, slowness, turtle master -- and none to those whose only
  // variable is duration: fire resistance, night vision, water breathing, slow falling, weakness,
  // invisibility.
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
  assert.equal(POTION_DATA.potion_of_slow_falling.duration, 90, 'slow falling is 90 s');
  // And their extended forms are the doubled figure, not the 8/3 one the 180 s potions use.
  assert.equal(POTION_DATA.potion_of_poison_long.duration, 90);
  assert.equal(POTION_DATA.potion_of_weakness_long.duration, 240);
  assert.equal(POTION_DATA.potion_of_slowness_long.duration, 240);
  assert.equal(POTION_DATA.potion_of_slow_falling_long.duration, 240);
  // Amplified forms of the short potions are halved, not quartered.
  assert.equal(POTION_DATA.potion_of_regeneration_2.duration, 22, 'regeneration II is 0:22');
  assert.equal(POTION_DATA.potion_of_poison_2.duration, 21, 'poison II is 0:21');
  assert.equal(POTION_DATA.potion_of_slowness_2.duration, 20, 'slowness IV is 0:20');
  assert.equal(POTION_DATA.potion_of_slowness_2.level, 4, 'and it is level IV, not II');
});

test('the Potion of the Turtle Master has all three of vanilla\'s forms', () => {
  // The wiki's recipe table for the potion lists a regular, an extended and an enhanced form. Only the
  // regular one existed, so extending the potion brewed nothing at all.
  assert.deepEqual(
    ['potion_of_turtle_master', 'potion_of_turtle_master_long', 'potion_of_turtle_master_2']
      .filter(id => !POTION_DATA[id]),
    []);
  assert.equal(POTION_DATA.potion_of_turtle_master.duration, 20, 'regular 0:20');
  assert.equal(POTION_DATA.potion_of_turtle_master_long.duration, 40, 'extended 0:40');
  assert.equal(POTION_DATA.potion_of_turtle_master_2.duration, 20, 'enhanced 0:20');
  assert.equal(POTION_DATA.potion_of_turtle_master_2.level, 2);
  for (const id of ['potion_of_turtle_master', 'potion_of_turtle_master_long', 'potion_of_turtle_master_2']) {
    assert.equal(POTION_DATA[id].effect, 'turtle_master', id + ' is the compound effect');
  }
  // The enhanced tier is the only one carrying a level, so the base one is level I by default.
  assert.equal(POTION_DATA.potion_of_turtle_master.level, undefined);
});

test('instant potions carry an amount rather than a duration', () => {
  for (const id of ['potion_of_healing', 'potion_of_harming']) {
    assert.equal(POTION_DATA[id].duration, undefined, id + ' is instant');
    assert.ok(typeof POTION_DATA[id].amount === 'number', id + ' should carry an amount');
  }
  assert.equal(POTION_DATA.potion_of_healing.effect, 'instant_health');
  assert.equal(POTION_DATA.potion_of_harming.effect, 'instant_damage');
  assert.equal(POTION_DATA.potion_of_healing.amount, 4, 'healing restores 4 HP');
  assert.equal(POTION_DATA.potion_of_healing_2.amount, 8, 'healing II restores 8');
  assert.equal(POTION_DATA.potion_of_harming.amount, 6, 'harming deals 6');
  // Harming hits harder than healing restores, which is vanilla's asymmetry.
  assert.ok(POTION_DATA.potion_of_harming.amount > POTION_DATA.potion_of_healing.amount,
    'harming should out-damage healing');
});

test('the compound effect scales to the enhanced tier', () => {
  // Slowness IV + Resistance III regular, Slowness VI + Resistance IV enhanced. One `level` field could
  // not express two different levels, so the pair lives in the effect table and scales by the potion's
  // tier.
  assert.deepEqual(compoundEffects('turtle_master', 1), [['slowness', 4], ['resistance', 3]]);
  assert.deepEqual(compoundEffects('turtle_master', 2), [['slowness', 6], ['resistance', 4]]);
  assert.deepEqual(effectsFor('turtle_master', 1), [['slowness', 4], ['resistance', 3]]);
  assert.deepEqual(effectsFor('turtle_master', 2), [['slowness', 6], ['resistance', 4]]);
  // An ordinary effect is itself, at its own level, which is what the splash path needs.
  assert.deepEqual(effectsFor('speed', 1), [['speed', 1]]);
  assert.deepEqual(effectsFor('instant_health', 2), [['instant_health', 2]]);
  assert.deepEqual(effectsFor(null), []);
  assert.deepEqual(effectsFor(undefined), []);
});

test('every potion\'s effect is one the game can actually apply', () => {
  // A potion naming an effect nothing implements is a potion that does nothing when drunk, silently.
  //
  // Every effect a potion names is now in the `statusEffects` table, including Instant Health and Instant
  // Damage. Those two are marked `instant` there rather than left out: the table is where an effect's id,
  // name, category and amount live, and a heal that resolves once is still an effect the game defines.
  // `applyPotionEffect` branches on `INSTANT_EFFECT_IDS` for how to apply it, not on whether it exists.
  const unknown = Object.entries(POTION_DATA)
    .filter(([, data]) => data.effect && !isKnownEffect(data.effect))
    .map(([id, data]) => `${id} -> ${data.effect}`);
  assert.deepEqual(unknown, []);
  // Everything a potion can name is table-registered, so nothing falls outside it.
  const outsideTable = [...new Set(Object.values(POTION_DATA).map((d) => d.effect))]
    .filter((effect) => effect && !isKnownEffect(effect));
  assert.deepEqual(outsideTable, []);
  // And the two that resolve once are flagged as such in the table and in the shared set.
  for (const id of ['instant_health', 'instant_damage']) {
    assert.equal(EFFECTS[id].instant, true, `${id} is marked instant`);
    assert.equal(INSTANT_EFFECTS.has(id), true, `${id} is in the instant set`);
  }
  assert.equal(INSTANT_EFFECTS.size, 2, 'and those are the only two');
});

test('a potion\'s declared level matches the level its name advertises', () => {
  // `Potion of Slowness IV` carrying `level: 2` would apply Slowness II and look right in the inventory.
  const advertised = { potion_of_slowness_2: 4 };
  for (const [id, level] of Object.entries(advertised)) {
    assert.equal(POTION_DATA[id].level, level, id);
  }
  // Every other enhanced potion is level II, and none of the base forms declares a level at all.
  for (const [id, data] of Object.entries(POTION_DATA)) {
    if (id.endsWith('_2') && id !== 'potion_of_slowness_2') {
      assert.equal(data.level, 2, id + ' should be level II');
    }
    if (!id.endsWith('_2') && !id.endsWith('_long')) {
      assert.equal(data.level, undefined, id + ' is a base form and carries no level');
    }
  }
});

// --- the stand in the world ----------------------------------------------------

test('a manager keeps one stand per block and ticks them all', () => {
  const manager = new BrewingManager();
  const a = manager.getOrCreateStand(4.7, 64, -3.2);
  const b = manager.getOrCreateStand(4.7, 64, -3.2);
  assert.equal(a, b, 'the same block yields the same stand');
  assert.equal(a.x, 4, 'a stand is addressed by the block it is in');
  assert.equal(a.z, -4, 'including below the origin, where floor and truncate differ');

  const other = manager.getOrCreateStand(5, 64, -4);
  assert.notEqual(other, a, 'the neighbouring block is a different stand');

  a.addFuel({ id: 'blaze_powder' });
  a.ingredient = { id: 'nether_wart', count: 1 };
  a.bottles = [{ id: 'water_bottle', count: 1 }, null, null];
  other.addFuel({ id: 'blaze_powder' });
  other.ingredient = { id: 'sugar', count: 1 };
  other.bottles = [{ id: 'awkward_potion', count: 1 }, null, null];

  // All stands advance together, which is what makes a brew keep running while its window is closed.
  const completed = manager.update(BREW_DURATION);
  assert.equal(completed, 2, 'both stands finished their stage');
  assert.equal(a.bottles[0].id, 'awkward_potion');
  assert.equal(other.bottles[0].id, 'potion_of_swiftness');
  assert.equal(manager.isBrewingAt(4, 64, -4), false, 'and both are idle afterwards');
});

test('breaking a stand hands back its stand so its contents can be dropped', () => {
  const manager = new BrewingManager();
  const stand = manager.getOrCreateStand(1, 2, 3);
  stand.addFuel({ id: 'blaze_powder' });
  const removed = manager.removeStand(1, 2, 3);
  assert.equal(removed, stand, 'the caller gets what was inside');
  assert.equal(manager.getStand(1, 2, 3), null, 'and the position starts empty again');
  assert.equal(manager.removeStand(9, 9, 9), null, 'removing nothing is not an error');
});

test('a stand left alone with no ingredient does not tick itself into a brew', () => {
  const manager = new BrewingManager();
  const stand = manager.getOrCreateStand(0, 0, 0);
  stand.addFuel({ id: 'blaze_powder' });
  assert.equal(manager.update(1000), 0);
  assert.equal(stand.fuel, MAX_FUEL, 'nothing was brewed and nothing was spent');
  assert.equal(stand.getProgress(), 0);
});

// --- the accessors -------------------------------------------------------------

test('potionDataFor resolves every form of every potion', () => {
  for (const id of Object.keys(POTION_DATA)) {
    const data = potionDataFor(id);
    assert.ok(data, id + ' should resolve');
    assert.equal(data.base, id, id + ' is its own core');
    assert.equal(data.splash, false);
    assert.equal(data.lingering, false);
    // And the two derived forms resolve back to the same core with the same effect behind them.
    for (const form of [potionDataFor(`splash_${id}`), potionDataFor(`lingering_${id}`)]) {
      assert.ok(form, `a derived form of ${id} should resolve`);
      assert.equal(form.base, id, `a derived form of ${id} should resolve to ${id}`);
      assert.equal(form.effect, POTION_DATA[id].effect);
      assert.equal(form.duration, POTION_DATA[id].duration);
    }
  }
  // The generic splash and lingering potions are the water bottle's forms, so they resolve to it rather
  // than to an id of their own that does not exist.
  assert.equal(potionDataFor('splash_potion').base, 'water_bottle');
  assert.equal(potionDataFor('lingering_potion').base, 'water_bottle');
  assert.equal(potionDataFor('splash_potion').splash, true);
  assert.equal(potionDataFor('lingering_potion').lingering, true);
});

