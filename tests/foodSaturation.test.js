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
import { FOODS } from '../src/foodData.js';
import { ITEMS, BLOCK_DEFS } from '../src/blocks.js';
import { EXTRA_ITEMS } from '../src/extraItems.js';
import { createHungerState, eat, SATURATION_PER_HEALTH } from '../src/hunger.js';
import { finishFoodUse } from '../src/foodUse.js';
import { Inventory } from '../src/inventory.js';
import { Player } from '../src/player.js';

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

test('eating a porkchop restores eight food and 12.8 saturation without instantly healing', () => {
  const player = Object.assign(Object.create(Player.prototype), {
    gamemode: 'survival', hunger: 10, saturation: 1, exhaustion: 0, health: 6, maxHealth: 20,
    _hungerState: createHungerState(), statusEffects: new Map(),
  });
  const inventory = new Inventory();
  inventory.hotbar[0] = { id: 'cooked_porkchop', count: 1, isBlock: false };
  assert.equal(finishFoodUse({ player, inventory }, inventory.getActiveItem()), true);
  assert.equal(player.hunger, 18);
  assert.equal(player.saturation, 13.8);
  assert.equal(player.health, 6);
  assert.equal(inventory.getActiveItem(), null);
});
