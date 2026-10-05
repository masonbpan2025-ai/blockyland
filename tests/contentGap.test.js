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
  assert.ok(r.missing > 200, 'the gap should still be substantial, got ' + r.missing);
  // The claim, stated as a ratio rather than an absolute so it survives content growth: nearly all of the
  // gap needs art.
  assert.ok(r.needsArt.length / r.missing > 0.95,
    'expected over 95% of the block gap to need new art, got ' + r.needsArt.length + '/' + r.missing);
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
  assert.ok(r.reusable.length <= 10,
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
  assert.ok(i.missing > 150, 'the item gap should still be substantial, got ' + i.missing);
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
  // Several blocks share a texture, which is why 241 textures cover 827 blocks and why new families need
  // new art rather than new code.
  assert.ok(r.present / r.textureCount > 2,
    'present blocks should outnumber textures substantially, got ' + r.present + '/' + r.textureCount);
});
