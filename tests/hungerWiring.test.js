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
import { EXHAUSTION, EXHAUSTION_THRESHOLD, SATURATION_PER_HEALTH } from '../src/hunger.js';

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
  ['attack', 0.1, 'src/player.js', /EXHAUSTION\.attack/, 'per landed hit'],
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

test('the hunger model is ticked and the player owns the state', () => {
  // The other half of the pairing: the charges are useless if nothing runs the model. `Player.update` calls
  // it, and `Player.eatFood` is the one place eating goes through -- `main.js` used to do that arithmetic
  // itself, which left the hunger system spending saturation that eating never granted.
  const player = readFileSync('src/player.js', 'utf8');
  assert.match(player, /this\.updateHungerModel\(dt\)/, 'the player should tick the hunger model');
  assert.match(player, /eatFood\(hungerPoints, saturationPoints = 0\)/, 'and own the eating path');
  const main = readFileSync('src/main.js', 'utf8');
  assert.match(main, /this\.player\.eatFood\?\.\(it\.food \|\| 4, saturation\)/,
    'eating in the game should go through the player');
});
