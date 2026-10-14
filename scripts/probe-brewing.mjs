// Fast brewing diagnostic: the production `BrewingStand` and `getBrewingResult`, no browser and no AI.
//
// This is the model layer only. It does NOT exercise the player bot's `brew` action, the brewing stand
// block, reach, or item collection into the inventory -- `e2e/brewing.pw.js` is the evidence for that
// route. Statuses are PASS / FAIL / GAP / SPEC_UNVERIFIED.
//
// Reference: https://minecraft.wiki/w/Brewing (and /w/Brewing_stand for the 20-second figure).
import { writeFile, mkdir } from 'node:fs/promises';
import {
  BrewingStand, getBrewingResult, potionDataFor, BASE_BREWING_RECIPES,
  BREW_DURATION, MAX_FUEL, BOTTLE_SLOTS,
} from '../src/brewing.js';

const rows = [];
const row = (id, status, expected, actual, note) => rows.push({ id, status, expected, actual, note });

/** A stand with one ingredient, one bottle and full fuel, ready to brew in one stage. */
function primed(bottleId, ingredientId = 'nether_wart', { bottles = 1, fuel = MAX_FUEL, ingredientCount = 1 } = {}) {
  const stand = new BrewingStand(0, 1, 0);
  stand.bottles = [null, null, null];
  for (let i = 0; i < bottles; i++) stand.bottles[i] = { id: bottleId, count: 1 };
  stand.ingredient = { id: ingredientId, count: ingredientCount };
  stand.fuel = fuel;
  return stand;
}

// --- B01..B05: base potions, the four ingredients the wiki allows on a water bottle ---
const baseCases = [
  ['B01', 'water_bottle', 'nether_wart', 'awkward_potion', 'Awkward Potion'],
  ['B02', 'water_bottle', 'glowstone_dust', 'thick_potion', 'Thick Potion'],
  ['B03', 'water_bottle', 'redstone', 'mundane_potion', 'Mundane Potion'],
  ['B04', 'water_bottle', 'fermented_spider_eye', 'potion_of_weakness', 'Potion of Weakness'],
];
for (const [id, bottle, ing, want, label] of baseCases) {
  const stand = primed(bottle, ing);
  const ok = stand.completeBrew();
  const got = stand.bottles[0]?.id ?? null;
  row(id, ok && got === want ? 'PASS' : 'FAIL', `${label} (${want})`, `${got}`, `${bottle} + ${ing}`);
}

// --- B05: the effect ingredients, each on an awkward potion ---
const effectCases = [
  ['sugar', 'potion_of_swiftness', 'Swiftness'],
  ['rabbit_foot', 'potion_of_leaping', 'Leaping'],
  ['blaze_powder', 'potion_of_strength', 'Strength'],
  ['glistering_melon_slice', 'potion_of_healing', 'Healing'],
  ['spider_eye', 'potion_of_poison', 'Poison'],
  ['ghast_tear', 'potion_of_regeneration', 'Regeneration'],
  ['magma_cream', 'potion_of_fire_resistance', 'Fire Resistance'],
  ['pufferfish', 'potion_of_water_breathing', 'Water Breathing'],
  ['golden_carrot', 'potion_of_night_vision', 'Night Vision'],
  ['phantom_membrane', 'potion_of_slow_falling', 'Slow Falling'],
  ['turtle_scute', 'potion_of_turtle_master', 'Turtle Master'],
];
const effectFails = [];
for (const [ing, want, label] of effectCases) {
  const stand = primed('awkward_potion', ing);
  stand.completeBrew();
  const got = stand.bottles[0]?.id ?? null;
  if (got !== want) effectFails.push(`${ing} -> ${got}, wanted ${want}`);
}
row('B05', effectFails.length ? 'FAIL' : 'PASS',
  `all ${effectCases.length} effect ingredients brew their potion`,
  effectFails.length ? effectFails.join('; ') : `${effectCases.length}/${effectCases.length} correct`,
  'awkward + effect ingredient');

// --- B06: redstone extends, glowstone enhances ---
const modifierCases = [
  ['potion_of_strength', 'redstone', 'potion_of_strength_long', 'extended Strength'],
  ['potion_of_strength', 'glowstone_dust', 'potion_of_strength_2', 'Strength II'],
  ['potion_of_regeneration', 'redstone', 'potion_of_regeneration_long', 'extended Regeneration'],
  ['potion_of_fire_resistance', 'redstone', 'potion_of_fire_resistance_long', 'extended Fire Resistance'],
  ['potion_of_night_vision', 'redstone', 'potion_of_night_vision_long', 'extended Night Vision'],
  ['potion_of_slowness', 'redstone', 'potion_of_slowness_long', 'extended Slowness'],
  ['potion_of_turtle_master', 'redstone', 'potion_of_turtle_master_long', 'extended Turtle Master'],
  ['potion_of_healing', 'glowstone_dust', 'potion_of_healing_2', 'Healing II'],
  ['potion_of_slowness', 'glowstone_dust', 'potion_of_slowness_2', 'Slowness IV'],
  ['potion_of_turtle_master', 'glowstone_dust', 'potion_of_turtle_master_2', 'Turtle Master II'],
];
const modFails = [];
for (const [bottle, ing, want, label] of modifierCases) {
  const stand = primed(bottle, ing);
  stand.completeBrew();
  const got = stand.bottles[0]?.id ?? null;
  if (got !== want) modFails.push(`${label}: ${got} (wanted ${want})`);
}
row('B06', modFails.length ? 'FAIL' : 'PASS',
  `all ${modifierCases.length} modifier recipes`,
  modFails.length ? modFails.join('; ') : `${modifierCases.length}/${modifierCases.length} correct`,
  'redstone extends, glowstone enhances');

// --- B07: fermented spider eye corrupts ---
const corruptCases = [
  ['potion_of_night_vision', 'potion_of_invisibility', 'Night Vision -> Invisibility'],
  ['potion_of_healing', 'potion_of_harming', 'Healing -> Harming'],
  ['potion_of_swiftness', 'potion_of_slowness', 'Swiftness -> Slowness'],
  ['potion_of_leaping', 'potion_of_slowness', 'Leaping -> Slowness'],
  ['potion_of_poison', 'potion_of_harming', 'Poison -> Harming'],
];
const corruptFails = [];
for (const [bottle, want, label] of corruptCases) {
  const stand = primed(bottle, 'fermented_spider_eye');
  stand.completeBrew();
  const got = stand.bottles[0]?.id ?? null;
  if (got !== want) corruptFails.push(`${label}: ${got} (wanted ${want})`);
}
row('B07', corruptFails.length ? 'FAIL' : 'PASS',
  `all ${corruptCases.length} corruptions`,
  corruptFails.length ? corruptFails.join('; ') : `${corruptCases.length}/${corruptCases.length} correct`,
  'fermented spider eye changes the effect');

// --- B08: the two corruptions the wiki says vanilla refuses ---
// "Corrupting an enhanced or extended potion into an effect that supports the modifier results in a potion
// with the same modifier applied. Enhanced potions of Leaping or Swiftness cannot be corrupted."
const refused = [];
for (const bottle of ['potion_of_swiftness_2', 'potion_of_leaping_2']) {
  const got = getBrewingResult(bottle, 'fermented_spider_eye');
  if (got !== null) refused.push(`${bottle} -> ${got}`);
}
row('B08', refused.length ? 'FAIL' : 'PASS',
  'enhanced Swiftness II and Leaping II cannot be corrupted at all',
  refused.length ? refused.join('; ') : 'both refused',
  'The table carries explicit rows for swiftness_2 and leaping_2, so the two potions vanilla refuses do brew.');

// The other half of the same wiki sentence: a corruption into a line that supports the modifier keeps it.
const kept = [];
for (const [bottle, want] of [
  ['potion_of_night_vision_long', 'potion_of_invisibility_long'],
  ['potion_of_healing_2', 'potion_of_harming_2'],
  ['potion_of_poison_2', 'potion_of_harming_2'],
  ['potion_of_swiftness_long', 'potion_of_slowness_long'],
  ['potion_of_leaping_long', 'potion_of_slowness_long'],
]) {
  const got = getBrewingResult(bottle, 'fermented_spider_eye');
  if (got !== want) kept.push(`${bottle} -> ${got} (wanted ${want})`);
}
row('B08b', kept.length ? 'FAIL' : 'PASS',
  'a corrupted potion keeps the modifier when the target effect supports it',
  kept.length ? kept.join('; ') : 'all five keep their modifier');

// --- B09: gunpowder and dragon breath ---
const g = (b) => getBrewingResult(b, 'gunpowder');
const d = (b) => getBrewingResult(b, 'dragon_breath');
const delivery = [
  ['water_bottle', 'splash_potion', 'water bottle -> splash water bottle', 'spec'],
  ['potion_of_strength', 'splash_potion_of_strength', 'Strength -> Splash Strength', 'spec'],
  ['splash_potion', 'lingering_potion', 'splash water -> lingering water', 'spec'],
  ['splash_potion_of_strength', 'lingering_potion_of_strength', 'Splash Strength -> Lingering Strength', 'spec'],
];
const deliveryFails = [];
for (const [bottle, want, label] of delivery) {
  const got = bottle.startsWith('splash_') ? d(bottle) : g(bottle);
  if (got !== want) deliveryFails.push(`${label}: ${got} (wanted ${want})`);
}
row('B09', deliveryFails.length ? 'FAIL' : 'PASS',
  'gunpowder makes splash, dragon breath makes lingering',
  deliveryFails.length ? deliveryFails.join('; ') : 'all four conversions correct',
  'B09a is unverified for the water bottle, see below');
// The wiki says water_bottle + dragon_breath gives a lingering water bottle, but also that dragon's
// breath acts on a SPLASH potion. It does not state whether a plain water bottle accepts it directly, so
// the two readings are recorded rather than asserted.
row('B09a', 'SPEC_UNVERIFIED',
  'water_bottle + dragon_breath: vanilla behaviour not settled by the wiki page',
  `getBrewingResult('water_bottle','dragon_breath') = ${JSON.stringify(d('water_bottle'))}`,
  'The wiki lists it under "when added to water bottle" AND says dragon breath turns a SPLASH potion into a lingering one; no verified statement covers the plain-water case.');
// Gunpowder must not re-splash a potion that is already splash. (Dragon's breath on an already-lingering
// potion is recorded too, but the wiki's rule is stated for gunpowder; the lingering case is simply
// defensive and is not the parity claim.)
const gSplash = g('splash_potion');
row('B09b', gSplash === null ? 'PASS' : 'FAIL',
  'a splash potion cannot be splashed a second time',
  `gunpowder on splash_potion -> ${JSON.stringify(gSplash)}; dragon_breath on lingering_potion -> ${JSON.stringify(d('lingering_potion'))} (defensive, not a parity claim)`);

// --- B10: splash and lingering potions take the same modifiers ---
// "a splash water bottle can be brewed with any of the base ingredients; the result remains a splash
// potion" -- so the expected result is the SPLASH awkward potion, not the drinkable one.
const prefixed = [
  ['splash_potion', 'nether_wart', 'splash_awkward_potion'],
  ['lingering_potion', 'nether_wart', 'lingering_awkward_potion'],
  ['splash_potion', 'glowstone_dust', 'splash_thick_potion'],
];
const prefixedFails = prefixed.filter(([b, ing, want]) => getBrewingResult(b, ing) !== want);
row('B10', prefixedFails.length ? 'FAIL' : 'PASS',
  'a splash or lingering water potion keeps its form through a base ingredient',
  prefixedFails.length
    ? prefixedFails.map(([b, ing, want]) => `${b} + ${ing} -> ${getBrewingResult(b, ing)} (wanted ${want})`).join('; ')
    : prefixed.map(([b, ing]) => `${b} + ${ing} -> ${getBrewingResult(b, ing)}`).join(' | '),
  'wiki: "a splash water bottle can be brewed with any of the base ingredients; the result remains a splash potion"');

// --- B11: the full chain the wiki chart implies ---
const chain = [];
const step = (bottle, ing) => { const r = getBrewingResult(bottle, ing); chain.push(`${bottle} + ${ing} -> ${r}`); return r; };
const awkward = step('water_bottle', 'nether_wart');
const strength = step(awkward, 'blaze_powder');
const extended = step(strength, 'redstone');
const enhanced = step(strength, 'glowstone_dust');
row('B11', awkward === 'awkward_potion' && strength === 'potion_of_strength' && extended === 'potion_of_strength_long' && enhanced === 'potion_of_strength_2' ? 'PASS' : 'FAIL',
  'water -> awkward -> Strength; then redstone extends and glowstone enhances',
  chain.join(' | '));

// --- B12: an ingredient that transforms nothing must not brew or spend fuel ---
const inert = primed('potion_of_healing', 'nether_wart');
const inertBrewed = inert.update(1.0);
const fuelAfterInert = inert.fuel;
row('B12', inertBrewed === false && fuelAfterInert === MAX_FUEL && inert.bottles[0].id === 'potion_of_healing' ? 'PASS' : 'FAIL',
  'an ingredient nothing reacts to never starts a brew, and never spends fuel',
  `brewed=${inertBrewed} fuel=${fuelAfterInert} bottle=${inert.bottles[0].id}`);

// --- B13: the stand with no fuel cannot brew ---
const dry = primed('water_bottle', 'nether_wart', { fuel: 0 });
row('B13', dry.canBrew() === false && dry.update(1.0) === false && dry.bottles[0].id === 'water_bottle' ? 'PASS' : 'FAIL',
  'no fuel means no brew',
  `canBrew=${dry.canBrew()} bottle=${dry.bottles[0].id}`);

// --- B14: one stage takes 20 seconds (400 ticks), and not a tick less ---
const timed = primed('water_bottle', 'nether_wart');
let elapsed = 0;
let brewedAt = null;
const STEP = 1 / 30;
while (elapsed < 30 && brewedAt === null) {
  if (timed.update(STEP)) brewedAt = elapsed + STEP;
  elapsed += STEP;
}
row('B14', BREW_DURATION === 20 && brewedAt !== null && Math.abs(brewedAt - 20) < 0.05 ? 'PASS' : 'FAIL',
  'one stage completes at 20.0 s (400 ticks)',
  `BREW_DURATION=${BREW_DURATION}s, stage landed at ${brewedAt?.toFixed(3)}s`,
  'wiki Brewing stand: "Each brewing operation takes 20 seconds (400 game ticks)."');

// --- B15: fuel is blaze powder only, 20 charges, one stage spends one ---
const fuelStand = primed('water_bottle', 'nether_wart', { fuel: 0 });
const acceptedWrong = fuelStand.addFuel({ id: 'gunpowder' });
const acceptedRight = fuelStand.addFuel({ id: 'blaze_powder' });
const fuelFull = fuelStand.fuel;
const acceptedOverfill = fuelStand.addFuel({ id: 'blaze_powder' });
fuelStand.completeBrew();
row('B15', acceptedWrong === false && acceptedRight === true && fuelFull === MAX_FUEL && acceptedOverfill === false && fuelStand.fuel === MAX_FUEL - 1 ? 'PASS' : 'FAIL',
  'blaze powder only, fills to 20, one stage spends one charge',
  `gunpowder=${acceptedWrong} blaze=${acceptedRight} fuel=${fuelFull} overfill=${acceptedOverfill} afterOneStage=${fuelStand.fuel}`);

// --- B16: one ingredient and one fuel unit are consumed per stage, for three bottles at once ---
const multi = primed('water_bottle', 'nether_wart', { bottles: 3, ingredientCount: 2 });
multi.completeBrew();
row('B16', multi.bottles.every((b) => b?.id === 'awkward_potion') && multi.ingredient?.count === 1 && multi.fuel === MAX_FUEL - 1 ? 'PASS' : 'FAIL',
  'three bottles brew at once for one ingredient and one fuel charge',
  `bottles=${multi.bottles.map((b) => b?.id).join(',')} ingredientLeft=${multi.ingredient?.count} fuel=${multi.fuel}`);

// --- B17: an inert bottle beside a valid one is left alone ---
const mixed = primed('water_bottle', 'nether_wart', { bottles: 1 });
mixed.bottles = [{ id: 'water_bottle', count: 1 }, { id: 'potion_of_healing', count: 1 }, { id: 'water_bottle', count: 1 }];
mixed.completeBrew();
row('B17', mixed.bottles[0].id === 'awkward_potion' && mixed.bottles[1].id === 'potion_of_healing' && mixed.bottles[2].id === 'awkward_potion' ? 'PASS' : 'FAIL',
  'every filled slot brews at once, and a slot this ingredient cannot transform is left as it was',
  mixed.bottles.map((b) => b.id).join(','),
  'wiki: "Different potions can be placed in the bottle slots to combine each of them separately with the modifier."');

// --- B18: BOTTLE_SLOTS is vanilla's three ---
row('B18', BOTTLE_SLOTS === 3 ? 'PASS' : 'FAIL', 'three bottle slots', String(BOTTLE_SLOTS));

// --- B19: table integrity ---
const danglingResults = [...new Set(BASE_BREWING_RECIPES.map((r) => r.result))].filter((id) => !potionDataFor(id));
const unknownBottles = [...new Set(BASE_BREWING_RECIPES.map((r) => r.bottle))].filter((id) => !potionDataFor(id));
row('B19', danglingResults.length || unknownBottles.length ? 'FAIL' : 'PASS',
  'every recipe result and bottle resolves to potion data',
  `results=${danglingResults.join(',') || 'all ok'} bottles=${unknownBottles.join(',') || 'all ok'}`,
  `${BASE_BREWING_RECIPES.length} recipes`);

// --- B20: instant potions carry an amount, timed potions a duration ---
const instant = potionDataFor('potion_of_healing');
const timedPotion = potionDataFor('potion_of_strength');
row('B20', instant?.amount === 4 && instant?.duration === undefined && timedPotion?.duration === 180 && timedPotion?.amount === undefined ? 'PASS' : 'FAIL',
  'Healing carries amount 4 and no duration; Strength carries duration 180 and no amount',
  `healing=${JSON.stringify({ amount: instant?.amount, duration: instant?.duration })} strength=${JSON.stringify({ amount: timedPotion?.amount, duration: timedPotion?.duration })}`);

const report = {
  referenceProfile: 'Java Edition 1.21.4 brewing; https://minecraft.wiki/w/Brewing and /w/Brewing_stand.',
  layer: 'production BrewingStand + getBrewingResult model only; the bot brew action and stand block are tested in e2e/brewing.pw.js',
  summary: {
    total: rows.length,
    pass: rows.filter((r) => r.status === 'PASS').length,
    fail: rows.filter((r) => r.status === 'FAIL').length,
    gap: rows.filter((r) => r.status === 'GAP').length,
    specUnverified: rows.filter((r) => r.status === 'SPEC_UNVERIFIED').length,
  },
  rows,
};

if (process.argv.includes('--write')) {
  await mkdir('docs/artifacts', { recursive: true });
  await writeFile('docs/artifacts/brewing-probe.json', JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(process.argv.includes('--write') ? { artifact: 'docs/artifacts/brewing-probe.json', summary: report.summary, rows: rows.map((r) => `${r.id} ${r.status} :: ${r.actual}`) } : report, null, 2));
