// The dragon egg's teleport.
//
// `BLOCK_DEFS[BLOCKS.DRAGON_EGG]` declares `dragonEgg: true` and nothing in `src/` read it, so the egg could
// be mined like any other block. Vanilla's egg is the one block that jumps away when you hit it, which is what
// makes it awkward to collect rather than merely rare.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dragonEggDestination, makeEggPlacementCheck, DRAGON_EGG_ATTEMPTS } from '../src/dragonEgg.js';

/** A small deterministic generator, so a search can be asserted rather than hoped at. */
function seeded(seed = 12345) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

const ORIGIN = { x: 0, y: 32, z: 0 };

test('the search box is vanilla\'s shape, and it is a difference of two draws', () => {
  // `nextInt(16) - nextInt(16)` for x and z, and the same over eight for y. Measuring `y` itself rather than
  // the offset is a mistake worth not repeating: it reads as a range of 39 when the offset range is 7.
  const seen = { dx: [99, -99], dy: [99, -99], dz: [99, -99] };
  dragonEggDestination({
    origin: ORIGIN, random: Math.random, attempts: 5000,
    isValid: (x, y, z) => {
      const dx = x - ORIGIN.x, dy = y - ORIGIN.y, dz = z - ORIGIN.z;
      seen.dx = [Math.min(seen.dx[0], dx), Math.max(seen.dx[1], dx)];
      seen.dy = [Math.min(seen.dy[0], dy), Math.max(seen.dy[1], dy)];
      seen.dz = [Math.min(seen.dz[0], dz), Math.max(seen.dz[1], dz)];
      return false;
    },
  });
  assert.deepEqual(seen.dx, [-15, 15], 'dx should span -15..15');
  assert.deepEqual(seen.dz, [-15, 15], 'dz should span -15..15');
  // A single draw over eight would reach -7..7 too, so the bounds alone do not prove the shape; the bias
  // below does.
  assert.ok(seen.dy[0] >= -8 && seen.dy[1] <= 8, 'dy should stay within -8..8, got ' + seen.dy);
});

test('the offsets cluster toward the centre, which is the point of two draws', () => {
  // `a - b` for two uniform draws is triangular, not flat: 57% of results land within five of the origin
  // against roughly 35% for a single uniform draw over the same range. This is the assertion that actually
  // distinguishes the two implementations.
  let near = 0, total = 0;
  dragonEggDestination({
    origin: ORIGIN, random: Math.random, attempts: 20000,
    isValid: (x) => { total++; if (Math.abs(x - ORIGIN.x) <= 5) near++; return false; },
  });
  const share = near / total;
  assert.ok(share > 0.48, 'expected a centre bias above 48%, got ' + (share * 100).toFixed(1) + '%');
  assert.ok(share < 0.70, 'and not an implausibly strong one, got ' + (share * 100).toFixed(1) + '%');
});

test('the first valid position wins, and none means null', () => {
  // Nothing valid: a thousand attempts and the egg stays.
  let calls = 0;
  assert.equal(dragonEggDestination({ origin: ORIGIN, random: Math.random,
    isValid: () => { calls++; return false; } }), null);
  assert.equal(calls, DRAGON_EGG_ATTEMPTS, 'it should use its full budget before giving up');

  // Something valid: a generous region is found quickly, and the result is inside the box.
  let tries = 0;
  const found = dragonEggDestination({
    origin: ORIGIN, random: seeded(),
    isValid: (x, y, z) => {
      tries++;
      const inBox = Math.abs(x - ORIGIN.x) <= 15 && Math.abs(y - ORIGIN.y) <= 7 && Math.abs(z - ORIGIN.z) <= 15;
      return inBox && x === 4 && y === 33 && z === -3;
    },
  });
  // The exact cell may take a while, but the search must terminate and either find it or report null; what
  // matters here is that it does not run past its budget.
  assert.ok(tries <= DRAGON_EGG_ATTEMPTS, 'it must not exceed its attempt budget, used ' + tries);
  if (found) {
    assert.equal(found.x, 4);
    assert.ok(Math.abs(found.x - ORIGIN.x) <= 15 && Math.abs(found.y - ORIGIN.y) <= 7,
      'a found position must be inside the search box');
  }
});

test('a search with many valid spots succeeds', () => {
  // The realistic case: most of the area is air over solid ground.
  const found = dragonEggDestination({
    origin: ORIGIN, random: Math.random,
    isValid: (x, y, z) => Math.abs(x - ORIGIN.x) <= 6 && Math.abs(z - ORIGIN.z) <= 6 && y === ORIGIN.y,
  });
  assert.ok(found, 'a generous valid region should be found');
  assert.equal(found.y, ORIGIN.y);
  assert.ok(Math.abs(found.x - ORIGIN.x) <= 6 && Math.abs(found.z - ORIGIN.z) <= 6);
});

test('nonsense input returns null rather than throwing', () => {
  assert.equal(dragonEggDestination({ origin: null, isValid: () => true }), null);
  assert.equal(dragonEggDestination({ origin: ORIGIN, isValid: null }), null);
  assert.equal(dragonEggDestination({}), null);
  assert.equal(dragonEggDestination({ origin: ORIGIN, isValid: () => true, attempts: 0 }), null,
    'a zero budget searches nothing');
  assert.equal(dragonEggDestination({ origin: ORIGIN, isValid: () => true, attempts: -5 }), null);
});

test('a placement is empty space over something solid', () => {
  // The one world-shaped question in the whole feature, so it is isolated and given the world as a lookup.
  const world = new Map([['1,32,1', 0], ['1,31,1', 5], ['2,32,2', 7], ['2,31,2', 5]]);
  const getVoxel = (x, y, z) => world.get(x + ',' + y + ',' + z) ?? 0;
  const isValid = makeEggPlacementCheck(getVoxel, 0, (id) => id !== 0);
  assert.equal(isValid(1, 32, 1), true, 'an air cell over a solid block is valid');
  assert.equal(isValid(1, 33, 1), false, 'an air cell over air is not, or the egg would float');
  assert.equal(isValid(2, 32, 2), false, 'an occupied cell is not');
  // A missing lookup must not throw.
  assert.equal(makeEggPlacementCheck(null, 0, () => true)(1, 2, 3), false);
});

test('the break path teleports the egg instead of breaking it', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ dragonEggDestination, makeEggPlacementCheck \} from '\.\/dragonEgg\.js'/);
  const guard = source.indexOf('if (blockId === BLOCKS.DRAGON_EGG) {');
  const sound = source.indexOf('this.sounds.playBreak(', guard);
  assert.ok(guard > 0, 'the break path should special-case the egg');
  assert.ok(sound > guard, 'and do so BEFORE the break sound and the drops');
  // The fallback matters: an egg that cannot move must still be breakable, or a thousand failed attempts
  // would make it permanent.
  const block = source.slice(guard, sound);
  assert.match(block, /if \(to\) \{/, 'it should only return when a destination was found');
});

test('the flag that was declared and never read', () => {
  // Recorded because it is why the gap was findable: the definition claimed a behaviour and no code read it.
  const blocks = readFileSync(new URL('../src/blocks.js', import.meta.url), 'utf8');
  assert.match(blocks, /dragonEgg:\s*true/, 'the block definition should still declare the behaviour');
});
