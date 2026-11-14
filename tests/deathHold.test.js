// The arena films hold a dying player where they fell (src/cinema/deathHold.js), not where the game moved them for
// spectating. The frames below follow the shape of a real recording (public/cinema-arena-duel/ds-low-vs-max): a frame
// every 0.25 s, and the move to the spectators' spot (0.5, 44, 0.5) one frame before the death is logged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deathHolds } from '../src/cinema/deathHold.js';

const SPECTATE = [0.5, 44, 0.5];
const frame = (t, a, b) => ({ t, p: [[...a, 0, 0, 20], [...b, 0, 0, 20]] });
const names = ['Low', 'Max'];

test('a player killed by a sword is held at the last spot before the game moved them up to spectate', () => {
  const low = [0, 31, 0];
  const frames = [
    frame(104.79, low, [3, 31, 1.2]),
    frame(105.04, low, [3, 31, 1.2]),
    frame(105.29, low, SPECTATE),
    frame(105.54, low, SPECTATE),
  ];
  const [hold] = deathHolds(frames, names, [{ t: 105.41, player: 'Max' }]);
  assert.equal(hold.i, 1);
  assert.deepEqual(frames[hold.frame].p[1].slice(0, 3), [3, 31, 1.2], 'where they fell, not the spectators\' spot');
  assert.equal(hold.from, 105.04, 'held from that frame, so the film never draws the glide up');
});

test('a player knocked into the void is held at the bottom of the fall, not at the spectators\' spot', () => {
  const frames = [
    frame(156.42, [0, 31, 0], [5.7, 21.1, -6.7]),
    frame(156.67, [0, 31, 0], [5.7, 14.6, -6.8]),
    frame(156.92, [0, 31, 0], [5.7, 6.7, -6.9]),
    frame(157.17, [0, 31, 0], SPECTATE),
  ];
  const [hold] = deathHolds(frames, names, [{ t: 157.41, player: 'Max' }]);
  // The fall itself moves 8 blocks a frame, but the move to spectate is the later jump.
  assert.deepEqual(frames[hold.frame].p[1].slice(0, 3), [5.7, 6.7, -6.9]);
});

test('with no move recorded, the hold starts at the frame of the death', () => {
  const frames = [frame(10, [0, 31, 0], [1, 31, 1]), frame(10.25, [0, 31, 0], [1.2, 31, 1]), frame(10.5, [0, 31, 0], [1.3, 31, 1])];
  const [hold] = deathHolds(frames, names, [{ t: 10.3, player: 'Max' }]);
  assert.equal(hold.frame, 1);
  assert.equal(hold.from, 10.25);
});
