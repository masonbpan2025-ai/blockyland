// Food, saturation, and the hunger model that was never called.
//
// Three defects sat on top of each other here, and only the first was visible from the table:
//
//   1. `foodData.js` halved every saturation value, on the theory that minecraft-data reports them in doubled
//      internal units. The wiki's [Food] page gives the numbers plainly -- cooked porkchop 12.8, golden carrot
//      14.4, cooked mutton 9.6 -- and minecraft-data agrees with it, so all 41 foods restored half.
//   2. Most of the item definitions did not carry a saturation figure at all, so even the halved value was
//      unused.
//   3. `main.js` never called the hunger model. `hunger.js` has an `eat(state, hungerPoints, saturationPoints)`
//      that applies vanilla's cap -- saturation is bounded by the *final* hunger -- and the eating path did its
//      own arithmetic instead: hunger plus two health, and saturation never. Every meal was hunger with no
//      saturation, in a game whose hunger system spends saturation first.
//
// The figures below are the wiki's, quoted so a future change to the table has to argue with them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FOODS } from '../src/foodData.js';
import { ITEMS, BLOCK_DEFS } from '../src/blocks.js';
import { EXTRA_ITEMS } from '../src/extraItems.js';
import { eat, SATURATION_PER_HEALTH } from '../src/hunger.js';

/** [wikiname, hunger, saturation] from https://minecraft.wiki/w/Food -- "Food saturation values". */
const WIKI = [
  ['cooked_porkchop', 8, 12.8],
  ['cooked_beef', 8, 12.8],
  ['golden_carrot', 6, 14.4],
  ['cooked_mutton', 6, 9.6],
  ['cooked_salmon', 6, 9.6],
  ['golden_apple', 4, 9.6],
  ['rabbit_stew', 10, 12],
  ['cooked_chicken', 6, 7.2],
  ['bread', 5, 6],
  ['apple', 4, 2.4],
  ['carrot', 3, 3.6],
  ['cookie', 2, 0.4],
  ['dried_kelp', 1, 0.6],
];

test('the food table carries the saturation the wiki reports', () => {
  for (const [name, hunger, saturation] of WIKI) {
    const entry = FOODS[name];
    assert.ok(entry, `${name} should be in the food table`);
    assert.equal(entry.hunger, hunger, `${name} hunger`);
    assert.equal(entry.saturation, saturation, `${name} saturation`);
  }
});

test('every food the game defines can answer for its saturation', () => {
  // The eating path prefers the item's own figure and falls back to the table. This asserts the fallback is
  // always available, which is what makes the 30-odd definitions that omit the field harmless rather than a
  // silent zero.
  const all = { ...ITEMS, ...EXTRA_ITEMS };
  const without = [];
  for (const [id, def] of Object.entries(all)) {
    if (def?.food === undefined) continue;
    if (def.saturation === undefined && FOODS[id]?.saturation === undefined) without.push(id);
  }
  assert.deepEqual(without, [], 'these foods would restore no saturation at all');
});

test('eating applies vanilla\'s cap, not raw addition', () => {
  // Saturation is bounded by the hunger *after* the meal: a golden carrot eaten at hunger 3 gives less than
  // one eaten at full hunger. This is the rule `main.js` was not calling.
  const starving = { hunger: 3, saturation: 0 };
  eat(starving, 6, 14.4);
  assert.equal(starving.hunger, 9);
  assert.equal(starving.saturation, 9, 'capped at the final hunger, not 14.4');

  const full = { hunger: 20, saturation: 0 };
  eat(full, 6, 14.4);
  assert.equal(full.hunger, 20, 'hunger cannot exceed twenty');
  assert.equal(full.saturation, 14.4, 'and at full hunger the whole value lands');
});

test('the saturation boost spends what the wiki says', () => {
  // "Saturation boost heals 1HP by consuming 1.5 saturation." The food values are in the same units as that
  // figure, which is what proved the halving wrong: a doubled unit system would need 3 here.
  assert.equal(SATURATION_PER_HEALTH, 1.5);
});

test('the eating path calls the model rather than doing its own arithmetic', () => {
  // A wiring check, as for the buckets, bundles and brush. Eating goes through `Player.eatFood`, which owns the
  // model in `hunger.js` and keeps the player's fields in sync with it; doing the arithmetic in `main.js`, as
  // this path originally did, left the hunger system spending saturation that eating never granted.
  const main = readFileSync('src/main.js', 'utf8');
  assert.match(main, /this\.player\.eatFood\?\.\(it\.food \|\| 4, saturation\)/,
    'eating should go through the player, which owns the hunger model');
  assert.doesNotMatch(main, /this\.player\.health = Math\.min\(this\.player\.maxHealth, this\.player\.health \+ 2\)/,
    'eating should not grant instant health: vanilla heals through saturation');
  const player = readFileSync('src/player.js', 'utf8');
  assert.match(player, /eatFood\(hungerPoints, saturationPoints = 0\)/, 'the player owns the eating path');
});
