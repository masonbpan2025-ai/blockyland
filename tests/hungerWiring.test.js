// Every exhaustion cost in `hunger.js` has to be charged by something.
//
// `EXHAUSTION` is a table of eight costs, and a table is not a mechanic: each one needs a call site in the
// running game. Auditing that by grepping for `EXHAUSTION.` missed the dig charge, because that one is written
// as the literal `0.005`, and it missed the whole hunger loop, because the search output was truncated and I
// read the first ten lines as if they were all of it. Twice I concluded a mechanic was unwired when it was
// wired, and once I nearly added a second charge for digging.
//
// So the pairing is explicit here: every key in the table, the value it holds, and the call site that spends
// it. A new cost in the table fails this test until it is charged, and a cost whose call site is deleted fails
// it too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHungerState, EXHAUSTION, EXHAUSTION_THRESHOLD, SATURATION_PER_HEALTH } from '../src/hunger.js';
import { Player } from '../src/player.js';

/**
 * [key in EXHAUSTION, the value it must hold, the file that charges it, and what the charge looks like].
 *
 * `regen` is absent on purpose: it is charged by `tickHunger` itself, inside the model, rather than by a
 * caller in the game.
 */
const CHARGES = [
  ['dig', 0.005, 'src/main.js', /addExhaustion\?\.\(0\.005\)/, 'per block broken'],
  ['jump', 0.05, 'src/player.js', /EXHAUSTION\.jump\b/, 'per standing jump'],
  ['sprintJump', 0.2, 'src/player.js', /EXHAUSTION\.sprintJump/, 'per jump while sprinting'],
  // Charged where the hit lands. This row used to look for `EXHAUSTION.attack` anywhere in player.js, which a stray
  // copy in the Player constructor satisfied while attacking cost nothing at all (found by the tutorial play-test).
  ['attack', 0.1, 'src/main.js', /this\.player\.addExhaustion\?\.\(EXHAUSTION\.attack\)/, 'per landed hit'],
  ['swim', 0.01, 'src/player.js', /EXHAUSTION\.swim/, 'per metre swum'],
  ['sprint', 0.1, 'src/player.js', /EXHAUSTION\.sprint\b/, 'per metre sprinted'],
  ['damage', 0.1, 'src/player.js', /EXHAUSTION\.damage/, 'per hit taken'],
];

test('the exhaustion table is exactly the costs with a charger, plus regen', () => {
  const charged = new Set([...CHARGES.map(([key]) => key), 'regen']);
  assert.deepEqual(Object.keys(EXHAUSTION).sort(), [...charged].sort(),
    'a cost was added or removed: give it a call site and a row above, or take it out of the table');
});

test('each cost is charged where the table says', () => {
  for (const [key, value, file, pattern, when] of CHARGES) {
    assert.equal(EXHAUSTION[key], value, `${key} value (${when})`);
    const source = readFileSync(file, 'utf8');
    assert.match(source, pattern, `${key} is in the table but nothing in ${file} charges it`);
  }
});

test('the model\'s own constants are the wiki\'s', () => {
  // Vanilla pays one hunger or saturation point per four exhaustion, and heals a point of health for 1.5
  // saturation. Both figures are the wiki's, and both are what the food table's units were proved against.
  assert.equal(EXHAUSTION_THRESHOLD, 4.0);
  assert.equal(SATURATION_PER_HEALTH, 1.5);
});

test('the player spends the saturation gained from a meal before losing hunger', () => {
  const player = Object.assign(Object.create(Player.prototype), {
    gamemode: 'survival', hunger: 8, saturation: 0, exhaustion: 0, health: 20, maxHealth: 20,
    _hungerState: createHungerState(),
  });
  player.eatFood(4, 2);
  player.addExhaustion(4);
  player.updateHungerModel(0.05);
  assert.equal(player.hunger, 12);
  assert.equal(player.saturation, 1);
});
