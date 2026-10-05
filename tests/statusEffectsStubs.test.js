// The effect helpers must tolerate a stubbed player.
//
// `player.statusEffects` is a Map, but several tests and stubs build a Player-shaped object with a plain
// `{}` or leave the field undefined. Iterating those directly throws "is not iterable", which turns a
// stubbed player into a crash in the DAMAGE path rather than a no-op -- and tests/armadilloParity.test.js
// does exactly that (`statusEffects: {}`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { attackMultiplier, damageTakenMultiplier, speedMultiplier } from '../src/statusEffects.js';

test('a plain object works as well as a Map', () => {
  assert.equal(attackMultiplier({ strength: { amplifier: 0 } }), 1.3);
  assert.equal(damageTakenMultiplier({ resistance: { amplifier: 0 } }), 0.8);
  assert.equal(speedMultiplier({ speed: { amplifier: 0 } }), 1.2);
});

test('absent or empty effect state is a no-op rather than a crash', () => {
  for (const empty of [undefined, null, {}, new Map(), []]) {
    assert.equal(attackMultiplier(empty), 1, 'attack for ' + JSON.stringify(empty));
    assert.equal(damageTakenMultiplier(empty), 1, 'taken for ' + JSON.stringify(empty));
    assert.equal(speedMultiplier(empty), 1, 'speed for ' + JSON.stringify(empty));
  }
});

test('an entry without an amplifier is treated as level I', () => {
  assert.equal(attackMultiplier({ strength: {} }), 1.3, 'a bare entry is level I');
  assert.equal(attackMultiplier({ strength: { duration: 5 } }), 1.3, 'and so is one with only a duration');
  assert.equal(attackMultiplier(new Map([['strength', undefined]])), 1.3, 'and an undefined value');
});

test('an array of pairs is accepted', () => {
  assert.equal(attackMultiplier([['strength', { amplifier: 0 }]]), 1.3);
});
