// Tipped arrows can be fired, and carry their potion's effect.
//
// The three tipped-arrow items existed, mobs dropped them, and `updateArrows` already knew how to apply an
// effect to whatever an arrow hit -- but `bow.js` only looked for plain and spectral arrows when choosing
// ammo, and passed no effect when it fired. So the items were droppable loot with no use: the one thing you
// are meant to do with a tipped arrow was impossible.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tipsFor, makeBowFixture } from './helpers/bowFixture.mjs';
import { TIPPED_ARROW_DURATION_FACTOR, TIPPED_ARROW_SOURCE, isTippedArrow, tippedArrowEffect }
  from '../src/tippedArrows.js';
import { POTION_DATA } from '../src/brewing.js';

test('the duration is one eighth of the potion, and derived rather than typed in', () => {
  assert.equal(TIPPED_ARROW_DURATION_FACTOR, 1 / 8);
  // Each arrow's duration must follow from its potion, so the two cannot drift apart.
  for (const [arrow, potionKey] of Object.entries(TIPPED_ARROW_SOURCE)) {
    const potion = POTION_DATA[potionKey];
    assert.ok(potion, potionKey + ' should exist in the potion table');
    const effect = tippedArrowEffect(arrow);
    assert.equal(effect.id, potion.effect, arrow + ' should carry its potion\'s effect');
    assert.equal(effect.duration, Math.floor(potion.duration * TIPPED_ARROW_DURATION_FACTOR),
      arrow + ' should last one eighth of ' + potionKey + '\'s ' + potion.duration + 's');
  }
});

test('the two durations vanilla states are reproduced exactly', () => {
  // Wiki: an Arrow of Weakness is eleven seconds from a 1:30 potion, and an Arrow of Poison is five seconds
  // from a 0:45 one. These are the check on the factor and on flooring rather than rounding: rounding would
  // make the poison arrow six.
  assert.deepEqual(tippedArrowEffect('tipped_arrow_weakness'), { id: 'weakness', duration: 11, level: 1 });
  assert.deepEqual(tippedArrowEffect('tipped_arrow_poison'), { id: 'poison', duration: 5, level: 1 });
});

test('the slowness arrow is the one value this data cannot confirm', () => {
  // The potion table gives Slowness 90s, so the eighth rule yields 11s. The wiki figure often quoted for an
  // Arrow of Slowness is thirty seconds, which would be a third rather than an eighth. Nothing in
  // `.cache/mc-data` carries potion durations, so this cannot be settled from the data the project has, and
  // the rule is applied consistently rather than special-cased on a half-remembered number.
  //
  // If somebody has the source, this is the assertion to change -- and only this one.
  assert.deepEqual(tippedArrowEffect('tipped_arrow_slowness'),
    { id: 'slowness', duration: 11, level: 1 });
});

test('an arrow with no known potion is not guessed at', () => {
  assert.equal(tippedArrowEffect('tipped_arrow_of_something'), null);
  assert.equal(tippedArrowEffect('tipped_arrow'), null, 'a bare tipped arrow has no source potion');
  assert.equal(tippedArrowEffect('arrow'), null);
  assert.equal(tippedArrowEffect('spectral_arrow'), null);
  assert.equal(tippedArrowEffect(undefined), null);
  assert.equal(tippedArrowEffect(null), null);
  // And the predicate is narrow, because it decides what may be loaded into a bow.
  assert.equal(isTippedArrow('tipped_arrow_poison'), true);
  assert.equal(isTippedArrow('arrow'), false);
  assert.equal(isTippedArrow('spectral_arrow'), false);
  assert.equal(isTippedArrow(''), false);
  assert.equal(isTippedArrow(undefined), false);
});

test('an effect is never zero seconds', () => {
  // A potion with a short duration must still produce a usable arrow rather than an effect of length zero,
  // which status-effect code would drop or apply for no time at all.
  for (const arrow of Object.keys(TIPPED_ARROW_SOURCE)) {
    assert.ok(tippedArrowEffect(arrow).duration >= 1, arrow + ' should last at least a second');
  }
});

test('the bow accepts a tipped arrow as ammo and passes its effect', async () => {
  const t = await tipsFor();
  // Before this change the ammo search matched only 'arrow' and 'spectral_arrow'.
  assert.equal(t.ammoIdFor('tipped_arrow_poison'), 'tipped_arrow_poison',
    'a tipped arrow should be selectable as ammo');
  assert.equal(t.ammoIdFor('arrow'), 'arrow', 'and a plain arrow still should be');
  assert.equal(t.ammoIdFor('spectral_arrow'), 'spectral_arrow');
  assert.equal(t.ammoIdFor('stick'), null, 'but a non-arrow must not be');
  assert.equal(t.ammoIdFor('tipped_arrow_poison_block', true), null, 'nor a block');
  assert.equal(t.ammoIdFor('arrow', false, 0), null, 'nor an empty stack');

  // And the effect reaches spawnArrow, which is the only thing that was missing.
  const fired = t.fireWith('tipped_arrow_weakness');
  assert.deepEqual(fired.effect, { id: 'weakness', duration: 11, level: 1 });
  assert.equal(fired.arrowItem, 'tipped_arrow_weakness');
  assert.equal(t.fireWith('arrow').effect, null, 'a plain arrow carries no effect');
  assert.equal(t.fireWith('spectral_arrow').spectral, true, 'a spectral arrow still does');
});

test('an empty or malformed slot does not throw', () => {
  // The failure this guards against was real and shipped briefly: the rewritten ammo search evaluated
  // `i.count > 0` before checking the id, so a null slot -- which every hotbar has -- threw a TypeError
  // instead of being skipped. The old form was safe only by accident, because `includes(i?.id)`
  // short-circuited first, and `tests/netherParity.test.js` is what caught the regression.
  const { bow, hotbar, game } = makeBowFixture();
  hotbar.length = 0;
  hotbar.push(null, undefined, { id: 'stick', isBlock: false, count: 1 }, null,
    { id: 'arrow', isBlock: false, count: 1 });
  assert.doesNotThrow(() => bow.ammo(), 'a null hotbar slot must be skipped, not dereferenced');
  assert.equal(bow.ammo().id, 'arrow', 'and the real arrow further along should still be found');
  // An entirely empty inventory is not an error either; `start` treats a missing ammo as "do not draw".
  hotbar.length = 0;
  assert.doesNotThrow(() => bow.ammo());
  assert.equal(bow.ammo(), undefined);
  void game;
});

test('the ammo search is a real expression, not a broken one', () => {
  // `a || b && c` binds as `a || (b && c)`, so a version of this fix written without parentheses would let
  // a tipped arrow with `isBlock` true or `count` 0 through. The fixture tests the behaviour; this pins the
  // shape so a later edit cannot quietly reintroduce the precedence bug.
  const source = readFileSync(new URL('../src/bow.js', import.meta.url), 'utf8');
  const ammo = /ammo\(\)\{([^}]*)\}/.exec(source);
  assert.ok(ammo, 'the ammo method should exist');
  assert.ok(/!\s*i\.isBlock/.test(ammo[1]), 'the block check should be negated');
  assert.ok(/i\s*&&/.test(ammo[1]),
    'a null slot must be rejected before anything is read from it; putting the count check first is the '
    + 'regression that made every hotbar with an empty slot throw');
});
