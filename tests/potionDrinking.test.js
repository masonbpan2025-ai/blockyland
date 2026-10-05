// Potions can be drunk, and every brewable potion exists as an item.
//
// Two halves of the same hole. `POTION_DATA` defines 39 potions and the brewing stand can produce them, but
// nothing consumed a `type: 'potion'` item -- `main.js` handled `type === 'food'` and stopped there -- and
// only three of the 39 were registered as items at all. So the alchemy chain ended in an item that could
// neither be named nor used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ITEMS } from '../src/blocks.js';
import { POTION_DATA, getBrewingResult } from '../src/brewing.js';
import { drinkPotion, isDrinkablePotion, potionEffect } from '../src/potions.js';

/** A game stub that records what drinking did. */
function drinker(gamemode = 'survival') {
  const log = [];
  return {
    log,
    game: {
      player: {
        gamemode,
        applyStatusEffect: (id, duration, level) => log.push({ did: 'effect', id, duration, level }),
      },
      inventory: {
        consumeActiveItem: (n) => log.push({ did: 'consume', n }),
        addItem: (id, n) => log.push({ did: 'add', id, n }),
      },
      ui: { updateHotbar: () => log.push({ did: 'hotbar' }) },
      sounds: {},
    },
  };
}

test('every potion the brewing table can produce exists as an item', () => {
  // This is the check that was missing. `tests/item_icons.test.js` only walks ITEMS, so a potion the brewing
  // stand can hand the player while having no registry entry was invisible to every existing test.
  const absent = Object.keys(POTION_DATA).filter(id => !ITEMS[id]);
  assert.deepEqual(absent, [], 'these potions are brewable but have no item entry: ' + absent.join(', '));
});

test('every splash potion gunpowder can reach exists as an item', () => {
  // `getBrewingResult` maps any drinkable potion plus gunpowder to `splash_<id>`, so the reachable set is
  // derived rather than listed -- a potion added to the table without its splash form fails here.
  const reachable = Object.keys(POTION_DATA)
    .filter(id => !id.startsWith('splash_') && !id.startsWith('lingering_'))
    .filter(id => getBrewingResult(id, 'gunpowder') === 'splash_' + id);
  assert.ok(reachable.length > 20, 'gunpowder should reach most potions, got ' + reachable.length);
  const absent = reachable.map(id => 'splash_' + id).filter(id => !ITEMS[id]);
  assert.deepEqual(absent, [], 'gunpowder can brew these but they have no item entry: ' + absent.join(', '));
});

test('drinking applies the potion effect, consumes it, and leaves a bottle', () => {
  const { game, log } = drinker();
  assert.equal(drinkPotion(game, 'potion_of_strength'), true, 'a potion should be consumed');
  const effect = log.find(x => x.did === 'effect');
  assert.deepEqual(effect, { did: 'effect', id: 'strength', duration: 180, level: 1 },
    'the effect should come from POTION_DATA');
  assert.ok(log.some(x => x.did === 'consume' && x.n === 1), 'one potion should be used');
  assert.ok(log.some(x => x.did === 'add' && x.id === 'glass_bottle'),
    'and the empty bottle handed back, as vanilla does');
});

test('potency and duration come from the table, not from the code', () => {
  // A potion level and length must follow its own entry, or a Potion of Swiftness II would grant level 1.
  const { game, log } = drinker();
  drinkPotion(game, 'potion_of_swiftness_2');
  assert.deepEqual(log.find(x => x.did === 'effect'),
    { did: 'effect', id: 'speed', duration: POTION_DATA.potion_of_swiftness_2.duration, level: 2 });
  const { game: g2, log: l2 } = drinker();
  drinkPotion(g2, 'potion_of_regeneration_long');
  const long = POTION_DATA.potion_of_regeneration_long;
  assert.equal(l2.find(x => x.did === 'effect').duration, long.duration,
    'an extended potion should use its own longer duration');
});

test('a potion that grants nothing is still drunk and still leaves a bottle', () => {
  // A water bottle and the brewing intermediates are drinkable in vanilla and do nothing. Treating them as
  // "not a potion" would leave them stuck in the hand.
  for (const id of ['water_bottle', 'awkward_potion', 'thick_potion', 'mundane_potion']) {
    if (!ITEMS[id]) continue;
    assert.equal(isDrinkablePotion(id), true, id + ' is drinkable');
    assert.equal(potionEffect(id), null, id + ' grants no effect');
    const { game, log } = drinker();
    assert.equal(drinkPotion(game, id), true, id + ' should be consumed');
    assert.equal(log.some(x => x.did === 'effect'), false, id + ' should apply no effect');
    assert.ok(log.some(x => x.did === 'add' && x.id === 'glass_bottle'), id + ' should leave a bottle');
  }
});

test('splash and lingering potions are thrown, not drunk', () => {
  // Getting this wrong would make a splash potion drinkable and quietly delete the throw.
  for (const id of ['splash_potion_of_weakness', 'splash_potion_of_healing', 'lingering_potion_of_poison']) {
    assert.equal(isDrinkablePotion(id), false, id + ' must not be drinkable');
    const { game, log } = drinker();
    assert.equal(drinkPotion(game, id), false, id + ' must not be consumed by drinking');
    assert.deepEqual(log, [], id + ' must have no effect at all');
  }
});

test('anything that is not a potion falls through untouched', () => {
  for (const id of ['arrow', 'bread', 'diamond', 'bow', '', undefined, null]) {
    assert.equal(isDrinkablePotion(id), false, String(id) + ' is not a potion');
    assert.equal(potionEffect(id), null);
    const { game, log } = drinker();
    assert.equal(drinkPotion(game, id), false, String(id) + ' must not be swallowed');
    assert.deepEqual(log, [], String(id) + ' must not consume or grant anything');
  }
});

test('the creative inventory does not consume the bottle', () => {
  const { game, log } = drinker('creative');
  assert.equal(drinkPotion(game, 'potion_of_healing'), true);
  assert.ok(log.some(x => x.did === 'effect'), 'the effect still applies in creative');
  assert.equal(log.some(x => x.did === 'consume'), false, 'but nothing is used up');
});

test('the drink hook is wired into the use chain', () => {
  // Checked at the source because `main.js` needs most of an engine to drive. This proves the call exists
  // and is placed before the block-placement fallthrough, not that a specific click drinks a specific item.
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ drinkPotion \} from '\.\/potions\.js'/,
    'main.js should import the drinker');
  const call = source.indexOf('if (drinkPotion(this, activeItem?.id)) return;');
  assert.ok(call > 0, 'main.js should call drinkPotion in the use chain');
  const eat = source.indexOf("it.type === 'food'");
  const place = source.indexOf("['minecart', 'chest_minecart'");
  assert.ok(eat > 0 && place > 0, 'the eating and placing branches should both still exist');
  assert.ok(call > eat && call < place,
    'drinking should come after eating and before block placement');
});
