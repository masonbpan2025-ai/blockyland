// Item parity batch 2: a brewing stand produced ids that were not items.
//
// `brewing.js` has 36 potions in POTION_DATA and derives a splash and a lingering form from any of
// them, so the stand can yield 108 ids. Five were registered, which means a brewed potion went down
// the same path as a mob drop with no definition: a fallback sprite and a stack nothing can resolve.
// The items are generated from POTION_DATA rather than hand-written, so the assertions here are mostly
// about the generator staying faithful to that source -- a hand-typed list of 103 names would drift the
// first time a potion is added, and the drift would be invisible.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ITEMS } from '../src/blocks.js';
import { POTION_DATA, BASE_BREWING_RECIPES, getBrewingResult, potionDataFor } from '../src/brewing.js';
import { POTION_ITEMS, POTION_ITEM_COUNT } from '../src/extraPotions.js';
import { danglingReferences, registry, resolveResource } from '../src/resourceRegistry.js';

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8');

/** Every id the brewing stand can produce: each potion, its splash form and its lingering form. */
function derivablePotionIds() {
  const ids = new Set();
  for (const core of Object.keys(POTION_DATA)) {
    if (core.startsWith('splash_') || core.startsWith('lingering_')) continue;
    ids.add(core);
    const splash = getBrewingResult(core, 'gunpowder');
    if (splash) {
      ids.add(splash);
      const lingering = getBrewingResult(splash, 'dragon_breath');
      if (lingering) ids.add(lingering);
    }
  }
  for (const row of BASE_BREWING_RECIPES) ids.add(row.result);
  return ids;
}

// --- the gap this batch closes ----------------------------------------------

test('every id a brewing stand can produce is a registered item', () => {
  // The whole category rather than a sample: this is the invariant that was violated, and it is
  // derived from `getBrewingResult` so it cannot fall behind a new potion or a new recipe.
  const reg = registry();
  const unresolved = [...derivablePotionIds()].filter((id) => !resolveResource(id, reg));
  assert.deepEqual(unresolved, []);
});

test('no brewing recipe produces or consumes an id that does not exist', () => {
  const offenders = danglingReferences(registry()).filter((p) => p.kind === 'brewing');
  assert.deepEqual(offenders.map((p) => `${p.from} -> ${p.id}`), []);
});

test('brewing each recipe row end to end yields a real item', () => {
  for (const row of BASE_BREWING_RECIPES) {
    const produced = getBrewingResult(row.bottle, row.ingredient);
    assert.ok(produced, `${row.bottle} + ${row.ingredient} should brew something`);
    assert.ok(ITEMS[produced], `${row.bottle} + ${row.ingredient} produces ${produced}, which is not an item`);
  }
});

// --- the generated module matches its source --------------------------------

test('the generated potion set is exactly the derivable set', () => {
  const generated = new Set(Object.keys(POTION_ITEMS));
  const derivable = derivablePotionIds();
  // Hand-written potions are deliberately absent from the generated module: the generator leaves them
  // to `blocks.js` so it can never replace hand-tuned art or names.
  const handWritten = [...derivable].filter((id) => ITEMS[id] && !generated.has(id));
  const missing = [...derivable].filter((id) => !resolveResource(id, registry()));
  const extra = [...generated].filter((id) => !derivable.has(id));
  assert.deepEqual(missing, [], 'derivable potions with no item');
  assert.deepEqual(extra, [], 'generated potions that nothing can produce');
  assert.deepEqual(handWritten.sort(), [
    'potion_of_fire_resistance', 'splash_potion_of_fire_resistance', 'splash_potion_of_weakness',
    'water_bottle',
  ].sort(), 'the hand-written potions this generator must not touch');
});

test('the module reports its own size consistently', () => {
  assert.equal(POTION_ITEM_COUNT, Object.keys(POTION_ITEMS).length);
  assert.ok(POTION_ITEM_COUNT > 90, 'this game has three forms of 36 potions');
});

test('names come from POTION_DATA, prefixed by form', () => {
  for (const [id, def] of Object.entries(POTION_ITEMS)) {
    const data = potionDataFor(id);
    assert.ok(data, `${id} should resolve to POTION_DATA`);
    const expected = data.splash ? `Splash ${data.name}` : data.lingering ? `Lingering ${data.name}` : data.name;
    assert.equal(def.name, expected, `${id} name`);
  }
});

test('every potion declares a stack size of one, as vanilla does', () => {
  for (const [id, def] of Object.entries(POTION_ITEMS)) {
    assert.equal(def.stackSize, 1, `${id} must not stack`);
    assert.equal(def.type, 'potion');
  }
});

// --- the generated art -------------------------------------------------------

test('splash and lingering forms share their core potion icon', () => {
  for (const id of ['splash_potion_of_healing', 'lingering_potion_of_healing']) {
    assert.equal(ITEMS[id].icon, ITEMS.potion_of_healing.icon, `${id} shares the core icon`);
  }
});

test('every potion icon file exists, and none was invented without a reference', () => {
  // The icon generator writes the path an item DECLARES, and this checks both directions: a declared
  // path must exist, and a generated file must be declared by something. An earlier version of that
  // generator invented 34 files named after item keys, which no code path could ever load.
  const declared = new Set();
  for (const def of Object.values(ITEMS)) {
    if (!def.icon) continue;
    declared.add(def.icon);
    const file = join(process.cwd(), 'public', def.icon.replace(/^\//, ''));
    assert.ok(existsSync(file), `${def.name} declares ${def.icon}, which does not exist`);
  }
  for (const id of Object.keys(POTION_ITEMS)) {
    assert.ok(declared.has(ITEMS[id].icon), `${id} declares an icon nothing else uses`);
  }
});

// --- the accessor the use-action will need ----------------------------------

test('potionDataFor resolves all three forms and reports which one', () => {
  const core = potionDataFor('potion_of_healing');
  assert.equal(core.base, 'potion_of_healing');
  assert.equal(core.effect, 'instant_health');
  assert.equal(core.amount, 4);
  assert.equal(core.splash, false);
  assert.equal(core.lingering, false);

  const splash = potionDataFor('splash_potion_of_healing');
  assert.equal(splash.base, 'potion_of_healing');
  assert.equal(splash.effect, 'instant_health');
  assert.equal(splash.splash, true);

  const lingering = potionDataFor('lingering_potion_of_strength');
  assert.equal(lingering.base, 'potion_of_strength');
  assert.equal(lingering.effect, 'strength');
  assert.equal(lingering.duration, 180);
  assert.equal(lingering.lingering, true);
});

test('potionDataFor returns null for anything that is not a potion', () => {
  for (const id of ['diamond_sword', 'glass_bottle', 'nether_wart', '', null, undefined, 'potion_of_nothing']) {
    assert.equal(potionDataFor(id), null, `${String(id)} is not a potion`);
  }
});

test('every potion resolves through the accessor', () => {
  const unresolved = Object.keys(POTION_ITEMS).filter((id) => !potionDataFor(id));
  assert.deepEqual(unresolved, []);
});

// --- the hand-written potions were left alone --------------------------------

test('the hand-written fire resistance potion kept its own name and art', () => {
  // The two hand-written potions predate POTION_DATA and use different art; a generator that replaced
  // them would have silently changed what an existing save shows.
  const def = ITEMS.potion_of_fire_resistance;
  assert.equal(def.name, 'Potion of Fire Resistance (3:00)');
  assert.equal(def.icon, '/assets/items/fire_resistance.svg');
  assert.equal(POTION_ITEMS.potion_of_fire_resistance, undefined, 'it is hand-written, not generated');
});

test('the generator carries its own output forward rather than emptying itself', () => {
  // `generate-items.mjs` documents this trap: once `blocks.js` has merged the generated entries, every
  // id looks hand-written, so a naive re-run emits nothing and deletes the file's contents.
  const source = read('scripts/generate-potion-items.mjs');
  assert.match(source, /function previouslyGenerated\(\)/, 'the carry-forward read exists');
  assert.match(source, /previous\.has\(form\.id\)/, 'and is consulted before skipping an existing id');
});
