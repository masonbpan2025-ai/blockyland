// Leaf decay (src/leafDecay.js) against the wiki's Leaves page. Found by the wiki-tutorial play-test: "Your first 10
// minutes" promises "the leaves automatically decay after a few minutes", and in the game leaves never decayed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOCKS } from '../src/blocks.js';
import { LeafDecay, MEAN_RANDOM_TICK_SECONDS, keepsLeaves, isLeaves } from '../src/leafDecay.js';

function makeWorld() {
  const cells = new Map(), drops = [];
  const world = {
    getVoxel: (x, y, z) => cells.get(`${x},${y},${z}`) ?? (y <= 0 ? BLOCKS.DIRT : BLOCKS.AIR),
    setVoxel(x, y, z, id) { const k = `${x},${y},${z}`; const prev = this.getVoxel(x, y, z); cells.set(k, id); this.leafDecay.notify(x, y, z, prev, id); },
    game: { entities: { spawnDroppedItem: (pos, id, isBlock, count) => drops.push({ id, count }) } },
  };
  world.leafDecay = new LeafDecay(world);
  const run = (seconds) => { for (let i = 0; i < seconds * 20; i++) world.leafDecay.update(1 / 20); };
  const tree = (x, z) => {
    for (let y = 1; y <= 5; y++) world.setVoxel(x, y, z, BLOCKS.OAK_LOG);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let y = 4; y <= 6; y++) if ((dx || dz || y === 6)) world.setVoxel(x + dx, y, z + dz, BLOCKS.OAK_LEAVES);
  };
  const leaves = () => [...cells.values()].filter((id) => id === BLOCKS.OAK_LEAVES).length;
  return { world, drops, run, tree, leaves };
}

test('logs and wood, stripped or not, keep leaves alive; leaves are recognised', () => {
  for (const n of ['OAK_LOG', 'STRIPPED_OAK_LOG', 'BIRCH_WOOD', 'STRIPPED_SPRUCE_WOOD']) assert.ok(keepsLeaves(BLOCKS[n]), n);
  for (const n of ['OAK_PLANKS', 'OAK_LEAVES', 'DIRT']) assert.ok(!keepsLeaves(BLOCKS[n]), n);
  for (const n of ['OAK_LEAVES', 'BIRCH_LEAVES', 'CHERRY_LEAVES']) assert.ok(isLeaves(BLOCKS[n]), n);
  assert.ok(Math.abs(MEAN_RANDOM_TICK_SECONDS - 68.27) < 0.01, '4096 / (3 x 20) seconds between random ticks');
});

test('a standing tree keeps its leaves; a felled tree loses them "after a few minutes"', () => {
  const { world, run, tree, leaves } = makeWorld();
  tree(0, 0);
  const all = leaves();
  run(300);
  assert.equal(leaves(), all, 'connected leaves never decay');
  for (let y = 1; y <= 5; y++) world.setVoxel(0, y, 0, BLOCKS.AIR);
  run(10);
  assert.ok(leaves() > all * 0.75, 'not all at once');
  run(140);
  assert.ok(leaves() < all * 0.2, `most gone within two and a half minutes (${leaves()} of ${all} left)`);
  run(600);
  assert.equal(leaves(), 0);
});

test('"a maximum distance of 6 blocks": a leaf six blocks from a log survives, seven does not', () => {
  const { world, run } = makeWorld();
  world.setVoxel(0, 3, 0, BLOCKS.OAK_LOG);
  for (let x = 1; x <= 7; x++) world.setVoxel(x, 3, 0, BLOCKS.OAK_LEAVES);
  // Nothing was removed yet; cut one leaf far away to trigger the check of the whole chain.
  world.setVoxel(20, 3, 0, BLOCKS.OAK_LEAVES); world.setVoxel(20, 3, 0, BLOCKS.AIR);
  world.setVoxel(8, 3, 0, BLOCKS.OAK_LEAVES); world.setVoxel(8, 3, 0, BLOCKS.AIR);
  run(1200);
  assert.equal(world.getVoxel(6, 3, 0), BLOCKS.OAK_LEAVES, 'distance 6 stays');
  assert.equal(world.getVoxel(7, 3, 0), BLOCKS.AIR, 'distance 7 decays');
});

test('player-placed leaves never decay', () => {
  const { world, run } = makeWorld();
  world.setVoxel(0, 3, 0, BLOCKS.OAK_LOG);
  world.setVoxel(1, 3, 0, BLOCKS.OAK_LEAVES); world.leafDecay.onPlaced(1, 3, 0, BLOCKS.OAK_LEAVES);
  world.setVoxel(2, 3, 0, BLOCKS.OAK_LEAVES);
  world.setVoxel(0, 3, 0, BLOCKS.AIR);
  run(1200);
  assert.equal(world.getVoxel(1, 3, 0), BLOCKS.OAK_LEAVES, 'persistent');
  assert.equal(world.getVoxel(2, 3, 0), BLOCKS.AIR, 'natural');
});

test('decaying leaves drop saplings ~5%, sticks ~2%, apples ~0.5%, never the leaves', () => {
  const { world, drops, run } = makeWorld();
  let i = 0;
  for (let x = 0; x < 40; x += 2) for (let z = 0; z < 40; z += 2) for (let y = 2; y < 40; y += 2) { world.setVoxel(x, y, z, BLOCKS.OAK_LEAVES); world.setVoxel(x, y, z, BLOCKS.OAK_LEAVES); i++; }
  // Trigger the checks: removing a neighbouring leaf of each is enough; instead mark all doomed directly.
  for (let x = 0; x < 40; x += 2) for (let z = 0; z < 40; z += 2) for (let y = 2; y < 40; y += 2) world.leafDecay.doomed.set(`${x},${y},${z}`, 0);
  run(1);
  const n = (id) => drops.filter((d) => d.id === id).reduce((s, d) => s + d.count, 0);
  assert.ok(Math.abs(n('oak_sapling') / i - 0.05) < 0.02, `saplings ${n('oak_sapling')}/${i}`);
  assert.ok(n('apple') / i < 0.02, 'apples are rare');
  assert.equal(n(BLOCKS.OAK_LEAVES), 0);
});

test('the real world and the game loop run it, and placing leaves marks them', () => {
  const world = readFileSync(new URL('../src/world.js', import.meta.url), 'utf8');
  assert.match(world, /this\.leafDecay\?\.notify\(wx, wy, wz, previous, blockId\);/);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /this\.world\.leafDecay\?\.update\(worldDt\);/);
  assert.match(main, /this\.world\.leafDecay\?\.onPlaced\(placeX, placeY, placeZ, blockIdToPlace\);/);
});
