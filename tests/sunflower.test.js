// The sunflower is two blocks tall (https://minecraft.wiki/w/Sunflower): Sunflower Plains used to grow only its head,
// one block high on the grass. Now a stalk (SUNFLOWER_STALK) stands under every head, the pair is placed and broken
// together, and one sunflower drops, whichever half is broken.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { canSupportPlant } from '../src/resourceVisualPolicy.js';
import { buildBiomeWorld, sunflowerCounts, biomeChecks } from '../src/biomeInspectorSession.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('the stalk is the sunflower\'s lower half: a plant with its own texture, dropping the sunflower', () => {
  const stalk = BLOCK_DEFS[BLOCKS.SUNFLOWER_STALK];
  assert.equal(BLOCKS.SUNFLOWER_STALK, 1418);
  assert.equal(stalk.name, 'Sunflower');
  assert.equal(stalk.plant, true);
  assert.equal(stalk.solid, false);
  assert.equal(stalk.drop, BLOCKS.SUNFLOWER, 'broken at the stalk, the pair drops the sunflower');
  assert.equal(stalk.lowerHalfOf, BLOCKS.SUNFLOWER);
  assert.equal(stalk.textures.all, 'sunflower_bottom.png');
  assert.ok(existsSync(new URL('../public/assets/blocks/sunflower_bottom.png', import.meta.url)), 'the stalk texture exists');
  assert.equal(BLOCK_DEFS[BLOCKS.SUNFLOWER].drop, BLOCKS.SUNFLOWER);
  assert.ok(canSupportPlant(BLOCKS.SUNFLOWER_STALK, BLOCKS.SUNFLOWER), 'the head stands on its stalk');
  assert.ok(!canSupportPlant(BLOCKS.SUNFLOWER_STALK, BLOCKS.POPPY), 'nothing else does');
});

test('Sunflower Plains grows every sunflower two blocks tall', async () => {
  const built = await buildBiomeWorld({ biome: 'sunflower_plains', seed: 4242 });
  const { heads, onStalks } = sunflowerCounts(built);
  assert.ok(heads > 100, `${heads} sunflowers near the spawn`);
  assert.equal(onStalks, heads, 'each on its stalk');
  assert.deepEqual(biomeChecks(built).filter((c) => !c.ok), []);
});

test('placing a sunflower takes two blocks, and breaking either half takes the other without a second drop', () => {
  const main = read('src/main.js');
  assert.match(main, /const twoTall = blockIdToPlace === BLOCKS\.SUNFLOWER;/);
  assert.match(main, /if \(twoTall && this\.world\.getVoxel\(placeX, placeY \+ 1, placeZ\) !== BLOCKS\.AIR\) return;/, 'it needs room above');
  assert.match(main, /if \(twoTall\) \{ this\.world\.setVoxel\(placeX, placeY \+ 1, placeZ, BLOCKS\.SUNFLOWER\);/);
  assert.match(main, /const otherHalf = blockId === BLOCKS\.SUNFLOWER \? \[y - 1, BLOCKS\.SUNFLOWER_STALK\] : blockId === BLOCKS\.SUNFLOWER_STALK \? \[y \+ 1, BLOCKS\.SUNFLOWER\] : null;/);
  // Removed before the support check below it runs, so the head does not also fall as a dropped sunflower.
  const breakAt = main.indexOf('const otherHalf = blockId === BLOCKS.SUNFLOWER');
  assert.ok(breakAt > 0 && breakAt < main.indexOf('// Support loss: if the block above was a plant relying on this substrate'));
  assert.match(read('src/world.js'), /chunk\.setVoxel\(lx, height \+ 1, lz, BLOCKS\.SUNFLOWER_STALK\);\s*chunk\.setVoxel\(lx, height \+ 2, lz, BLOCKS\.SUNFLOWER\);/);
});
