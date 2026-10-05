// Levitation.
//
// `statusEffects.js` defines it and nothing consumed it: absent from `speedMultiplier` and from
// `damageTakenMultiplier`, and `player.js` never read it. Applying it did nothing at all -- the same shape as
// Absorption before the last round.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { levitationRise, LEVITATION_BLOCKS_PER_SECOND_PER_LEVEL } from '../src/levitation.js';
import { effectNames, isKnownEffect } from '../src/statusEffects.js';

test('the rise is one block per second per level', () => {
  // Vanilla's 0.05 blocks per tick is one block per second at twenty ticks a second.
  assert.equal(LEVITATION_BLOCKS_PER_SECOND_PER_LEVEL, 1.0);
  assert.equal(levitationRise(1), 1);
  assert.equal(levitationRise(2), 2);
  assert.equal(levitationRise(5), 5);
  assert.equal(levitationRise(10), 10);
});

test('the rise is never negative and never NaN', () => {
  // The value is assigned straight to `velocity.y`, where a negative would invert the effect into a
  // fall and a NaN would poison the position.
  for (const level of [NaN, undefined, null, -1, -100, 'two', {}, []]) {
    const rise = levitationRise(level);
    assert.ok(Number.isFinite(rise), 'levitationRise(' + String(level) + ') was ' + rise);
    assert.ok(rise >= 0, 'levitationRise(' + String(level) + ') was ' + rise);
  }
  assert.equal(levitationRise(0), 0, 'level zero lifts nothing rather than being an error');
  assert.equal(levitationRise(1.9), 1, 'a fractional level floors');
});

test('the effect is one the table actually knows', () => {
  // A guard against this file and `statusEffects.js` drifting apart.
  assert.ok(isKnownEffect('levitation'));
  assert.ok(effectNames().includes('levitation'));
});

test('the movement chain gives levitation its own branch, overriding gravity', () => {
  const source = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ levitationRise \} from '\.\/levitation\.js'/, 'the helper should be imported');
  const branch = source.indexOf("} else if (this.hasStatusEffect('levitation')) {");
  assert.ok(branch > 0, 'the movement chain should have a levitation branch');
  // It must assign rather than subtract, or it would be a reduced gravity rather than a climb.
  const body = source.slice(branch, source.indexOf('} else if (this.inWater) {', branch));
  assert.match(body, /this\.velocity\.y = levitationRise\(/, 'it should assign the rise, not modify gravity');
  assert.equal(/velocity\.y\s*-=/.test(body), false, 'and must not subtract from gravity as well');
  // Order: creative flight beats it, and it beats swimming and gliding, because it is a forced effect.
  const flying = source.indexOf('if (this.isFlying) {', branch - 1500);
  const water = source.indexOf('} else if (this.inWater) {', branch);
  assert.ok(flying > 0 && flying < branch, 'creative flight should come first');
  assert.ok(water > branch, 'and water should come after');
});

test('the effect expires through the ordinary tick path', () => {
  // Levitation's danger is that it ends: the player falls from whatever height it reached. That firing is the
  // shared duration countdown, not something this file has to do.
  const source = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  assert.match(source, /if\(data\.duration<=0\)this\.statusEffects\.delete\(effect\)/,
    'the shared tick should remove an expired effect, so levitation stops climbing on its own');
});
