// The player's difficulty reads the game's, so there is one authority.
//
// `updateHungerModel` read `this.difficulty`, a second copy kept on the Player. `game.difficulty` is what
// every mob behaviour, the spawner and the boot path read, so the two could disagree -- and the player's copy
// went stale the moment the difficulty changed, because nothing wrote to it after construction.
//
// Kept separate from `hungerWiring.test.js`, which covers the exhaustion-cost table rather than who owns the
// difficulty.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Player } from '../src/player.js';
import { DIFFICULTIES, normaliseSettings } from '../src/sessionSettings.js';

/** A Player-shaped object, which is how the hunger model is driven in tests. */
function makePlayer(over = {}) {
  const p = Object.create(Player.prototype);
  p.difficulty = 'easy';
  return Object.assign(p, over);
}

test('the game difficulty wins over the player\'s own copy', () => {
  const p = makePlayer({ game: { difficulty: 'hard' } });
  assert.equal(p.difficultyLevel, 'hard');
  // The stale copy is irrelevant while a game is attached.
  p.difficulty = 'peaceful';
  assert.equal(p.difficultyLevel, 'hard', 'the game is the authority');
});

test('a later difficulty change is followed, with no re-sync step', () => {
  // This is the bug: the player kept a copy written once and never again.
  const p = makePlayer({ game: { difficulty: 'normal' } });
  for (const d of DIFFICULTIES) {
    p.game.difficulty = d;
    assert.equal(p.difficultyLevel, d, 'follows ' + d);
  }
});

test('the instance value is the documented fallback when there is no game', () => {
  // Tests drive Player-shaped stubs that never had a game attached.
  assert.equal(makePlayer({ game: undefined }).difficultyLevel, 'easy');
  assert.equal(makePlayer({ game: null }).difficultyLevel, 'easy');
  assert.equal(makePlayer({ game: {} }).difficultyLevel, 'easy', 'a game without a difficulty falls back');
});

test('with neither, it is normal rather than undefined', () => {
  const p = Object.create(Player.prototype);
  assert.equal(p.difficultyLevel, 'normal');
  p.game = { difficulty: undefined };
  p.difficulty = undefined;
  assert.equal(p.difficultyLevel, 'normal');
});

test('the value is normalised, so casing cannot break the comparison', () => {
  // It matters, because the peaceful check is an equality test.
  assert.equal(makePlayer({ game: { difficulty: 'PEACEFUL' } }).difficultyLevel, 'peaceful');
  assert.equal(makePlayer({ game: { difficulty: 'Peaceful' } }).difficultyLevel === 'peaceful', true);
  assert.equal(makePlayer({ game: { difficulty: ' hard ' } }).difficultyLevel, 'hard');
});

test('the hunger model reads the authority, not the stale copy', () => {
  // A source guard, because the behavioural tests above only prove the getter works -- the model has to use
  // it. `this.difficulty` appearing inside the model is the regression.
  const source = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  const start = source.indexOf('updateHungerModel(dt) {');
  const fn = source.slice(start, source.indexOf('\n  }', start));
  assert.ok(start > 0, 'the model is found');
  assert.equal(/this\.difficulty\s*\?\?/.test(fn), false, 'it never reads the raw copy');
  // Both uses: the peaceful switch and the starvation floor.
  assert.ok((fn.match(/this\.difficultyLevel/g) || []).length >= 2,
    'peaceful and the starvation floor both read the authority');
});

test('peaceful is the only value that removes starvation', () => {
  // The floor comes from the shared model, so the authority has to reach it as a plain lowercase string.
  const source = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('updateHungerModel(dt) {'));
  assert.match(fn, /peaceful: this\.difficultyLevel === 'peaceful'/);
  assert.match(fn, /starvationFloor\(this\.difficultyLevel\)/);
});

test('the difficulty a world is created with reaches both the game and the player', () => {
  // The wiring the plan reports as missing. Settings are the source; `applyWorldSettings` distributes them,
  // which is what makes the two agree from the start rather than only after a change.
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /this\.difficulty = this\.settings\.difficulty/, 'the game takes it from the settings');
  assert.match(main, /this\.player\.difficulty = this\.settings\.difficulty/, 'and so does the player');
  assert.equal(normaliseSettings({ difficulty: 'hard' }).difficulty, 'hard');
});
