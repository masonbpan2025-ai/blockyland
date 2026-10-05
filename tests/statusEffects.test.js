// Status effect rules, and the three places they are wired in.
//
// The values are the ones verified against Mineclonia in docs/survival-parity-rules.md: poison 1 HP per
// 1.25 s, wither 1 HP per 2 s, regeneration +1 HP per 2.5 s, strength x1.3, weakness x0.8, resistance
// -20% per level capped at IV. A table is only worth having if the numbers in it are checked, so each
// one is asserted against the researched figure rather than against the implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EFFECTS, effectFor, isKnownEffect, attackMultiplier, damageTakenMultiplier, speedMultiplier,
  tickEffect, effectNames,
} from '../src/statusEffects.js';
import { Player } from '../src/player.js';

/** Effect entries shaped the way player.statusEffects yields them. */
const active = (...pairs) => new Map(pairs.map(([n, a = 0]) => [n, { amplifier: a }]));
const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-9,
  what + ': expected ' + expected + ', got ' + actual);

test('the researched damage-over-time intervals are exact', () => {
  near(EFFECTS.poison.tickInterval, 1.25, 'poison interval');
  near(EFFECTS.wither.tickInterval, 2, 'wither interval');
  near(EFFECTS.regeneration.tickInterval, 2.5, 'regeneration interval');
  assert.equal(EFFECTS.poison.damagePerTick, 1);
  assert.equal(EFFECTS.wither.damagePerTick, 1);
  assert.equal(EFFECTS.regeneration.healPerTick, 1);
});

test('poison cannot kill and wither can, which vanilla distinguishes', () => {
  // The guard is on health rather than on the effect, so the table only carries the flag.
  assert.equal(EFFECTS.poison.cannotKill, true, 'poison must not be fatal');
  assert.equal(EFFECTS.wither.cannotKill, false, 'wither must be able to kill');
});

test('strength and weakness multiply damage dealt, per level', () => {
  near(attackMultiplier(active(['strength'])), 1.3, 'strength I');
  near(attackMultiplier(active(['strength', 1])), 1.69, 'strength II');
  near(attackMultiplier(active(['weakness'])), 0.8, 'weakness I');
  near(attackMultiplier(active(['weakness', 1])), 0.64, 'weakness II');
  // Applied in turn, so they do not cancel exactly -- which is vanilla's behaviour.
  near(attackMultiplier(active(['strength'], ['weakness'])), 1.04, 'strength and weakness together');
  near(attackMultiplier(active()), 1, 'no effects');
  near(attackMultiplier(active(['poison'])), 1, 'an effect with no attack modifier changes nothing');
});

test('resistance reduces damage taken and is capped at level IV', () => {
  near(damageTakenMultiplier(active(['resistance'])), 0.8, 'resistance I');
  near(damageTakenMultiplier(active(['resistance', 1])), 0.64, 'resistance II');
  near(damageTakenMultiplier(active(['resistance', 3])), 0.4096, 'resistance IV');
  // Above IV the cap holds, so resistance can never reach immunity through stacking.
  near(damageTakenMultiplier(active(['resistance', 9])), 0.4096, 'resistance X is capped at IV');
  near(damageTakenMultiplier(active()), 1, 'no effects');
});

test('speed and slowness multiply movement, and the result stays sane', () => {
  near(speedMultiplier(active(['speed'])), 1.2, 'speed I');
  near(speedMultiplier(active(['slowness'])), 0.85, 'slowness I');
  near(speedMultiplier(active()), 1, 'no effects');
  // A pile of slowness cannot produce a zero or negative speed.
  const piled = speedMultiplier(active(['slowness', 20]));
  assert.ok(piled > 0 && piled <= 5, 'speed multiplier out of range: ' + piled);
});

test('tickEffect fires only when the interval has elapsed', () => {
  assert.equal(tickEffect('poison', { tickTimer: 0 }, 1), null, 'not yet due');
  const fired = tickEffect('poison', { tickTimer: 1 }, 0.25);
  assert.equal(fired?.damage, 1, 'due after 1.25 s');
  assert.equal(fired?.cannotKill, true, 'and carries the flag');
  // The timer carries the REMAINDER rather than resetting to zero. Resetting would let a slow frame
  // push the next tick later, so the interval would drift with frame rate instead of staying at 1.25 s.
  const data = { tickTimer: 0 };
  assert.equal(tickEffect('poison', data, 1.4)?.damage, 1, 'fires when the interval is exceeded');
  assert.ok(Math.abs(data.tickTimer - 0.15) < 1e-9,
    'the remainder should be 0.15 s, got ' + data.tickTimer);
  assert.equal(tickEffect('poison', data, 0.1), null, 'and the next tick is not due yet');
  assert.equal(tickEffect('strength', { tickTimer: 100 }, 100), null,
    'an effect with no interval never ticks');
});

test('an unknown effect name is handled rather than throwing', () => {
  assert.equal(effectFor('definitely_not_an_effect'), null);
  assert.equal(isKnownEffect('definitely_not_an_effect'), false);
  assert.equal(isKnownEffect('poison'), true);
  assert.equal(tickEffect('definitely_not_an_effect', {}, 10), null);
  // And the multipliers ignore names they do not know, so a stale save cannot break combat.
  near(attackMultiplier(active(['definitely_not_an_effect'])), 1, 'unknown effect');
});

test('every effect has a name and a category', () => {
  for (const [key, def] of Object.entries(EFFECTS)) {
    assert.equal(typeof def.name, 'string', key + ' needs a display name');
    assert.ok(def.name.length > 0, key + ' has an empty display name');
    assert.ok(['beneficial', 'harmful', 'neutral'].includes(def.category),
      key + ' has an unknown category ' + def.category);
  }
  assert.ok(effectNames().length >= 20, 'expected the researched effect set');
});

test('a Player exposes the effect multipliers, and they default to 1', () => {
  // The melee call site asks the player rather than importing the table, so these methods are the
  // contract between combat and the effect rules.
  const p = Object.create(Player.prototype);
  p.statusEffects = new Map();
  near(p.attackDamageMultiplier(), 1, 'no effects means no change to damage dealt');
  near(p.damageTakenMultiplier(), 1, 'and none to damage taken');

  p.statusEffects.set('strength', { amplifier: 0, duration: 10 });
  near(p.attackDamageMultiplier(), 1.3, 'strength reaches the player');
  p.statusEffects.set('resistance', { amplifier: 0, duration: 10 });
  near(p.damageTakenMultiplier(), 0.8, 'and so does resistance');
});

test('the Player methods are not shadowed by their own names', () => {
  // The methods share their names with the imported helpers. A class method is not in lexical scope, so
  // the bare name inside resolves to the import -- but that is subtle enough to deserve a test, since
  // recursion would blow the stack rather than return a wrong number.
  const p = Object.create(Player.prototype);
  p.statusEffects = new Map([['weakness', { amplifier: 0, duration: 10 }]]);
  near(p.attackDamageMultiplier(), 0.8, 'weakness through the method');
  assert.ok(Number.isFinite(p.damageTakenMultiplier()), 'and the other method is finite');
});
