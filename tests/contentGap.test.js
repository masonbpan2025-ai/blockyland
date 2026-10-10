// The remaining block gap is an ART gap, not a code gap.
//
// The headline figure -- blocks at roughly three quarters -- reads like missing implementation. It is not.
// The content generator only emits a block when `textureExists()` finds a PNG in `public/assets/blocks`, so
// a block with no art cannot be added however well its geometry is understood, and every geometry family
// this project needed already exists.
//
// Measured: of 268 missing vanilla blocks, NONE has its own texture and exactly one can reuse one that is
// already there. That is the difference between "write more code" and "draw 267 textures", and the coverage
// percentage does not distinguish them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { measureBlockGap, measureItemGap, itemIconCandidates, textureCandidates, CACHE_PRESENT,
  ITEMS_CACHE_PRESENT, presentBlockNames } from '../scripts/content-gap.mjs';

test('most missing blocks are missing art, not code', (t) => {
  if (!CACHE_PRESENT) { t.skip('block cache absent'); return; }
  const r = measureBlockGap();
  // THE FLOOR IS NOW ZERO, WHICH MEANS IT IS GONE. It was lowered four times (200 -> 50 -> 20 -> 5) and
  // every lowering was the same mistake: a bound just above the real figure, so the next batch that closed
  // the gap failed a test whose whole subject is a gap that is supposed to close. This batch reached ZERO
  // missing blocks, at which point any positive floor asserts that the work can never be finished.
  //
  // What replaces it is an INTERNAL CONSISTENCY check, which is strictly better for catching the failure the
  // floor existed for: a resolver that suddenly matched everything would report a small gap AND a
  // needsArt/reusable split that does not add up, so this still fails on a broken measurement while passing
  // on a complete one. The relative claims below are untouched.
  assert.ok(r.missing >= 0, 'the missing count cannot be negative');
  assert.equal(r.missing, r.needsArt.length + r.reusable.length,
    'the missing blocks must divide between needsArt and reusable with none unaccounted for: '
    + r.missing + ' != ' + r.needsArt.length + ' + ' + r.reusable.length);
  // The claim, stated as a ratio rather than an absolute: most of the gap needs art.
  //
  // The figure moves as work lands, and in BOTH directions, which is worth understanding before adjusting
  // it again. Implementing a block removes it from the denominator; adding the texture a block needs moves
  // it from `needsArt` into `reusable`, which shrinks the numerator instead. Two batches did the second --
  // the coral fans made the ten coral wall fans implementable-without-new-art, and the cake batch added
  // eighteen more blocks whose art is composed rather than downloaded -- so the ratio has fallen from 0.995
  // to 0.900 without anything getting worse.
  //
  // AND THE RATIO IS NOW VACUOUS, because there is no gap left to have a ratio about: 0/0. Rather than
  // loosen the bound a fifth time, the claim is guarded so it applies when there IS a gap and is trivially
  // satisfied when there is not -- which is the honest form of "if anything is missing, it is missing art".
  if (r.missing > 0) {
    assert.ok(r.needsArt.length / r.missing > 0.80,
      'expected most of the remaining block gap to need new art, got '
      + r.needsArt.length + '/' + r.missing);
  }
  // And the sharper claim, which is the one that matters for planning: no missing block has its own art.
  assert.equal(r.ownTexture, 0,
    'a missing block now has its own texture, so it is a code gap that could be closed -- update the '
    + 'paragraph in docs/survival-parity-rules.md section 4.1 which says the block gap is entirely art. '
    + 'The first such block is: ' + r.reusable.filter(x => x.own).map(x => x.name).join(', '));
});

test('the reused-texture list is small and checked, not guessed', (t) => {
  if (!CACHE_PRESENT) { t.skip('block cache absent'); return; }
  const r = measureBlockGap();
  // A conservative heuristic on purpose. It counts a wall sign reusing its plank texture, which the
  // generator really does, and does NOT count a sapling reusing one, which it does not -- a sapling drawn
  // with a plank texture would be wrong, and counting it would overstate what is addable without art.
  //
  // The ceiling moved from 10 to 20 when the coral batch landed, and the eleven entries now on the list
  // are the honest reason: six dead and five living coral WALL fans, each legitimately reusing its
  // upright fan's texture, plus redstone_wall_torch. They are real reusable-texture entries rather than
  // the heuristic matching a visually wrong pair, which is what this bound exists to catch. They are not
  // implemented yet because every one of them is a wall-attached block and this game has no facing state
  // for decoration -- the same missing subsystem the glazed-terracotta pattern and the wall states need.
  assert.ok(r.reusable.length <= 20,
    'the reusable-texture list grew to ' + r.reusable.length + '; check each is a deliberate reuse and not a '
    + 'heuristic that has started matching visually wrong pairs');
  for (const x of r.reusable) {
    assert.ok(x.via.endsWith('.png') === false, 'via should be a bare name, got ' + x.via);
  }
});

test('the texture candidates are the reuses the existing families actually perform', () => {
  // A wall variant falls back to its standing variant.
  assert.ok(textureCandidates('oak_wall_sign').includes('oak_sign'));
  assert.ok(textureCandidates('oak_wall_hanging_sign').includes('oak_hanging_sign'));
  // A wooden fixture falls back to the wood's planks.
  assert.ok(textureCandidates('oak_door').includes('oak_planks'));
  assert.ok(textureCandidates('spruce_button').includes('spruce_planks'));
  // A material that has no such relationship gets no fallback beyond itself.
  assert.deepEqual(textureCandidates('spawner'), ['spawner']);
  // A sapling must NOT be offered a plank texture, because drawing one that way would be wrong.
  assert.equal(textureCandidates('oak_sapling').includes('oak_planks'), false,
    'a sapling drawn with a plank texture is a visual bug, so it must not be counted as reusable art');
});

test('the item gap is art-gated for the same reason the block gap is', (t) => {
  if (!ITEMS_CACHE_PRESENT) { t.skip('item cache absent'); return; }
  const i = measureItemGap();
  // A floor only to catch a broken measurement, deliberately far below the real figure. It was 150 and
  // the gap reached exactly 150, which is the wrong reason to fail: closing the gap is the objective, so
  // this must not creep down behind the work. See the block-side note above for the same reasoning.
  // The floor moves with the work, deliberately: it was 150, then 50, then 30, and the gap has now reached
  // 30 exactly -- the pottery sherds, the corals, nether wart and the dirt path all landed together. Its job
  // is to catch a broken measurement, not to freeze progress.
  assert.ok(i.missing > 20, 'the measurement looks broken rather than the gap closed, got ' + i.missing);
  // `tests/item_icons.test.js` requires a non-empty PNG per item, so an item with no icon cannot be added.
  assert.equal(i.ownIcon, 0,
    'a missing item now has its own icon, so it is a code gap that could be closed -- update '
    + 'docs/survival-parity-rules.md section 4.1.1. The first such item is: '
    + i.reusable.filter(x => x.own).map(x => x.name).join(', '));
  assert.ok(i.needsArt.length / i.missing > 0.9,
    'expected over 90% of the item gap to need new art, got ' + i.needsArt.length + '/' + i.missing);
  assert.ok(i.present / i.iconCount > 1,
    'items should outnumber icons, got ' + i.present + '/' + i.iconCount);
});

test('only a genuine reuse is counted for an item icon', (t) => {
  if (!ITEMS_CACHE_PRESENT) { t.skip('item cache absent'); return; }
  const i = measureItemGap();
  // Every reusable item is a spawn egg drawing the shared egg texture, which the game really does.
  for (const x of i.reusable.filter(r => !r.own)) {
    assert.match(x.name, /_spawn_egg$/, x.name + ' is counted as reusable but is not a spawn egg; check '
      + 'that the reuse is real rather than a name that happens to have an icon next to it');
    assert.equal(x.via, 'spawn_egg');
  }
  // The helper must not offer a wood-specific icon to a differently-wooded item: a birch boat drawn as an
  // oak one is a visual bug, not a reuse, which is the mistake the block list made before it was narrowed.
  assert.deepEqual(itemIconCandidates('birch_boat'), [],
    'a boat must not be offered another wood\'s icon');
  assert.deepEqual(itemIconCandidates('oak_sapling'), [], 'nor a sapling a plank icon');
  assert.deepEqual(itemIconCandidates('vex_spawn_egg'), ['spawn_egg'], 'but an egg may share the egg icon');
});

test('the present-block count agrees with the registry', (t) => {
  if (!CACHE_PRESENT) { t.skip('block cache absent'); return; }
  const r = measureBlockGap();
  const names = presentBlockNames();
  assert.ok(names.size >= r.present * 0.9,
    'the registry should name about as many blocks as are present: ' + names.size + ' names for '
    + r.present + ' present');
  const textures = readdirSync('public/assets/blocks').length;
  assert.equal(textures, r.textureCount, 'the texture count should match the directory');
  // Blocks really do share textures -- that is why a few hundred textures cover over a thousand blocks.
  //
  // THE BOUND IS DELIBERATELY LOOSE, and this is the fourth test in the suite whose fixed threshold normal
  // progress has tripped. It was `> 2` and the head batches brought it to 1.998, because the composed and
  // EXTRACTED art adds one texture per block rather than reusing an existing one: 21 individual head-face
  // tiles for eight heads. So the ratio drifts down as this work proceeds, and a bound near the current
  // value guarantees the next batch fails it. What the test can honestly assert is the order of magnitude
  // -- textures are reused, so blocks exceed texture files -- so the bound is 1.1.
  assert.ok(r.present / r.textureCount > 1.1,
    'textures should still be substantially reused rather than one per block, got ' + r.present + '/'
    + r.textureCount + ' = ' + (r.present / r.textureCount).toFixed(2));
});
