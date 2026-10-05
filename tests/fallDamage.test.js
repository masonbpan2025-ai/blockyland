// Fall damage.
//
// There was none. `player.fallDistance` accumulated on every downward step and was read in exactly one
// place, `farmingManager.checkTrample`, so falling from any height was completely harmless -- which removes
// one of the most basic pressures of survival mode. Cliffs, ravines and a bad jump cost nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fallDamageFor, FALL_DAMAGE_THRESHOLD } from '../src/fallDamage.js';

test('a fall under three blocks is free', () => {
  assert.equal(FALL_DAMAGE_THRESHOLD, 3);
  for (const d of [0, 0.5, 1, 2, 3, 3.5, 3.999]) {
    assert.equal(fallDamageFor(d), 0, 'a fall of ' + d + ' should cost nothing');
  }
});

test('past three blocks it costs one point per block', () => {
  // Vanilla's formula, in half-hearts: a four-block fall costs half a heart.
  assert.equal(fallDamageFor(4), 1);
  assert.equal(fallDamageFor(5), 2);
  assert.equal(fallDamageFor(6), 3);
  assert.equal(fallDamageFor(10), 7);
  // The floor is what makes 4.9 cost the same as 4 rather than rounding up.
  assert.equal(fallDamageFor(4.9), 1);
  assert.equal(fallDamageFor(5.1), 2);
});

test('twenty-three blocks kills an unarmoured player, which is the check on the formula', () => {
  // Vanilla's best-known fall figure: 20 health is a full bar, so this is exactly lethal. If the threshold or
  // the floor were wrong, this is the assertion that would move.
  assert.equal(fallDamageFor(23), 20, 'a 23-block fall should deal exactly a full health bar');
  assert.ok(fallDamageFor(22) < 20, 'and 22 should not be lethal');
  assert.ok(fallDamageFor(24) > 20, 'and 24 should overshoot it');
});

test('water and gliding negate it entirely', () => {
  // Handled inside the calculation rather than at the call site, because a caller that forgot one would
  // silently restore the bug. An elytra's whole point is that it saves you from the fall.
  for (const d of [10, 23, 100, 1000]) {
    assert.equal(fallDamageFor(d, { gliding: true }), 0, 'gliding from ' + d + ' should be free');
    assert.equal(fallDamageFor(d, { inWater: true }), 0, 'landing in water from ' + d + ' should be free');
  }
  // Not gliding and not in water is the ordinary case and must still hurt.
  assert.equal(fallDamageFor(23, { gliding: false, inWater: false }), 20);
  assert.equal(fallDamageFor(23, {}), 20, 'an absent state should not accidentally negate the damage');
});

test('a nonsense distance deals nothing rather than NaN', () => {
  // The damage flows into `takeDamage`, where a NaN would poison the health bar.
  for (const d of [NaN, undefined, null, Infinity, -Infinity, 'ten']) {
    const damage = fallDamageFor(d);
    assert.ok(Number.isFinite(damage), 'fallDamageFor(' + String(d) + ') should be finite, got ' + damage);
    assert.ok(damage >= 0, 'and never negative, got ' + damage);
  }
  // A negative distance is a rise, not a fall.
  assert.equal(fallDamageFor(-50), 0);
});

test('the damage is never negative, whatever the input', () => {
  for (let d = -5; d < 200; d += 0.5) {
    const damage = fallDamageFor(d);
    assert.ok(damage >= 0, 'a fall of ' + d + ' produced ' + damage);
    assert.ok(Number.isInteger(damage), 'damage should be whole points, got ' + damage);
  }
});

test('the landing path applies it, before clearing the distance', () => {
  // Checked at the source because driving `moveWithCollision` to a landing needs a world. This proves the
  // call exists, that it reads `fallDistance` before it is zeroed, and that it passes the 'fall' type so
  // Feather Falling and Protection apply and a shield does not.
  const source = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ fallDamageFor \} from '\.\/fallDamage\.js'/, 'the helper should be imported');
  const compute = source.indexOf('const landingDamage = fallDamageFor(this.fallDistance');
  const clear = source.indexOf('this.fallDistance = 0;', compute);
  const apply = source.indexOf("this.takeDamage(landingDamage, null, 'fall')", compute);
  assert.ok(compute > 0, 'the landing path should compute fall damage');
  assert.ok(clear > compute && apply > clear,
    'the damage must be computed before the distance is cleared and applied after it');
  // And the type must be 'fall', or armour, Feather Falling and the shield exclusion all misbehave.
  assert.match(source, /takeDamage\(landingDamage, null, 'fall'\)/);
});

test('the type is one takeDamage already knows how to handle', () => {
  // Fall is excluded from shield blocking, reduced by Feather Falling, and skipped by Thorns. All three were
  // already written against a damage type that nothing ever produced.
  const source = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  assert.match(source, /\['fall',\s*'starvation',\s*'void',\s*'wither'\]\.includes\(damageType\)/,
    'fall should already be excluded from shield blocking');
  assert.match(source, /damageType === 'fall' && this\.inventory\?\.armor\?\.feet/,
    'and Feather Falling should already apply to it');
});
