// Gravity-affected blocks (src/fallingBlocks.js), against the wiki's Falling Block, Concrete Powder and Anvil pages.
// Found by the wiki-tutorial play-test: "Your first 10 minutes" says "if you use sand, it will fall down", and in the
// game nothing fell at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOCKS } from '../src/blocks.js';
import { FallingBlocks, GRAVITY_BLOCKS, CONCRETE_OF } from '../src/fallingBlocks.js';

function makeWorld() {
  const cells = new Map(), drops = [], hurt = [];
  const world = {
    structureOrientations: new Map(),
    getVoxel: (x, y, z) => cells.get(`${x},${y},${z}`) ?? (y <= 0 ? BLOCKS.STONE : BLOCKS.AIR),
    setVoxel(x, y, z, id) { cells.set(`${x},${y},${z}`, id); this.fallingBlocks.notify(x, y, z); },
    game: {
      entities: { spawnDroppedItem: (pos, id, isBlock, count) => drops.push({ id, isBlock, count, y: pos.y }) },
      player: { position: { x: 100, y: 100, z: 100 }, height: 1.8, takeDamage: (n, source, type) => hurt.push(n) },
      mobs: { mobs: [] },
    },
  };
  world.fallingBlocks = new FallingBlocks(world);
  const run = (seconds) => { for (let i = 0; i < seconds * 30; i++) world.fallingBlocks.update(1 / 30); };
  return { world, drops, hurt, run };
}

test('the wiki\'s gravity blocks fall: sand, red sand, gravel, dragon egg, suspicious blocks, 16 concrete powders, 3 anvils', () => {
  for (const n of ['SAND', 'RED_SAND', 'GRAVEL', 'DRAGON_EGG', 'SUSPICIOUS_SAND', 'SUSPICIOUS_GRAVEL', 'ANVIL', 'CHIPPED_ANVIL', 'DAMAGED_ANVIL']) assert.ok(GRAVITY_BLOCKS.has(BLOCKS[n]), n);
  assert.equal(CONCRETE_OF.size, 16);
  for (const n of ['STONE', 'DIRT', 'GRASS', 'OAK_PLANKS']) assert.ok(!GRAVITY_BLOCKS.has(BLOCKS[n]), n);
});

test('sand placed in mid-air falls and becomes a block on the ground', () => {
  const { world, run } = makeWorld();
  world.setVoxel(0, 6, 0, BLOCKS.SAND);
  run(0.05);
  assert.equal(world.getVoxel(0, 6, 0), BLOCKS.SAND, 'not before the 2-tick delay');
  run(2);
  assert.equal(world.getVoxel(0, 6, 0), BLOCKS.AIR);
  assert.equal(world.getVoxel(0, 1, 0), BLOCKS.SAND, 'resting on the stone at y=0');
  assert.equal(world.fallingBlocks.entities.length, 0);
});

test('a fall follows 0.04 blocks/tick^2 with 0.98 drag: five blocks take about 17 ticks', () => {
  const { world } = makeWorld();
  world.setVoxel(0, 6, 0, BLOCKS.GRAVEL);
  let ticks = 0;
  for (let i = 0; i < 2; i++) world.fallingBlocks.tick();
  while (world.getVoxel(0, 1, 0) !== BLOCKS.GRAVEL && ticks < 100) { world.fallingBlocks.tick(); ticks++; }
  // v_n = -0.04 * sum 0.98^k ...; 5 blocks are covered on the 17th tick.
  let y = 0, v = 0, n = 0; while (y > -5) { v = (v - 0.04) * 0.98; y += v; n++; }
  assert.equal(ticks + 1, n, 'the block starts falling on the tick its support check runs');
});

test('a whole column falls when the block under it is mined', () => {
  const { world, run } = makeWorld();
  world.setVoxel(0, 1, 0, BLOCKS.DIRT);
  for (let y = 2; y <= 4; y++) world.setVoxel(0, y, 0, BLOCKS.SAND);
  run(0.5);
  assert.deepEqual([2, 3, 4].map((y) => world.getVoxel(0, y, 0)), [BLOCKS.SAND, BLOCKS.SAND, BLOCKS.SAND], 'supported: stays');
  world.setVoxel(0, 1, 0, BLOCKS.AIR);
  run(3);
  assert.deepEqual([1, 2, 3, 4].map((y) => world.getVoxel(0, y, 0)), [BLOCKS.SAND, BLOCKS.SAND, BLOCKS.SAND, BLOCKS.AIR]);
});

test('"it breaks and drops as an item" on a torch or a bottom slab, but rests on a top slab', () => {
  const { world, drops, run } = makeWorld();
  world.setVoxel(0, 1, 0, BLOCKS.TORCH);
  world.setVoxel(0, 5, 0, BLOCKS.GRAVEL);
  run(2);
  assert.equal(world.getVoxel(0, 1, 0), BLOCKS.TORCH, 'the torch stays');
  assert.deepEqual(drops.map((d) => [d.id, d.isBlock]), [[BLOCKS.GRAVEL, true]], 'gravel drops itself, not its flint roll');
  world.setVoxel(3, 1, 0, BLOCKS.OAK_SLAB);
  world.setVoxel(3, 5, 0, BLOCKS.SAND);
  run(2);
  assert.equal(world.getVoxel(3, 2, 0), BLOCKS.AIR);
  assert.equal(drops.length, 2, 'bottom slab: an item');
  world.structureOrientations.set('6,1,0', { slabType: 'top' });
  world.setVoxel(6, 1, 0, BLOCKS.OAK_SLAB);
  world.setVoxel(6, 5, 0, BLOCKS.SAND);
  run(2);
  assert.equal(world.getVoxel(6, 2, 0), BLOCKS.SAND, 'top slab: a block');
});

test('it falls through short grass and comes to rest in its place', () => {
  const { world, run } = makeWorld();
  world.setVoxel(0, 1, 0, BLOCKS.SHORT_GRASS);
  world.setVoxel(0, 4, 0, BLOCKS.SAND);
  run(2);
  assert.equal(world.getVoxel(0, 1, 0), BLOCKS.SAND);
});

test('concrete powder "placed next to" or falling "into" water becomes concrete', () => {
  const { world, run } = makeWorld();
  world.setVoxel(0, 1, 0, BLOCKS.STONE);
  world.setVoxel(1, 2, 0, BLOCKS.WATER);
  world.setVoxel(0, 2, 0, BLOCKS.RED_CONCRETE_POWDER);
  run(0.3);
  assert.equal(world.getVoxel(0, 2, 0), BLOCKS.RED_CONCRETE);
  world.setVoxel(5, 1, 0, BLOCKS.WATER);
  world.setVoxel(5, 6, 0, BLOCKS.BLUE_CONCRETE_POWDER);
  run(2);
  assert.equal(world.getVoxel(5, 1, 0), BLOCKS.BLUE_CONCRETE);
  world.setVoxel(9, 4, 0, BLOCKS.WHITE_CONCRETE_POWDER);
  run(2);
  assert.equal(world.getVoxel(9, 1, 0), BLOCKS.WHITE_CONCRETE_POWDER, 'dry: stays powder');
});

test('an anvil deals 2 HP per block fallen after the first, and may degrade 5% per block', () => {
  const { world, hurt, run } = makeWorld();
  world.game.player.position = { x: 0.5, y: 1, z: 0.5 };
  world.fallingBlocks.random = () => 0.99;
  world.setVoxel(0, 5, 0, BLOCKS.ANVIL);
  run(2);
  assert.deepEqual(hurt, [6], '"an anvil that falls 4 blocks deals 6 damage"');
  assert.equal(world.getVoxel(0, 1, 0), BLOCKS.ANVIL);
  world.fallingBlocks.random = () => 0.1; // < 5% x 4 blocks
  world.setVoxel(3, 5, 0, BLOCKS.ANVIL);
  run(2);
  assert.equal(world.getVoxel(3, 1, 0), BLOCKS.CHIPPED_ANVIL);
  world.setVoxel(6, 5, 0, BLOCKS.DAMAGED_ANVIL);
  run(2);
  assert.equal(world.getVoxel(6, 1, 0), BLOCKS.AIR, 'a damaged anvil that degrades breaks');
});

test('suspicious sand "breaks" on landing and drops nothing', () => {
  const { world, drops, run } = makeWorld();
  world.setVoxel(0, 4, 0, BLOCKS.SUSPICIOUS_SAND);
  run(2);
  assert.equal(world.getVoxel(0, 1, 0), BLOCKS.AIR);
  assert.equal(drops.length, 0);
});

test('the real world notifies it and the game loop runs it', () => {
  const world = readFileSync(new URL('../src/world.js', import.meta.url), 'utf8');
  assert.match(world, /this\.fallingBlocks = new FallingBlocks\(this\);/);
  assert.match(world, /this\.fallingBlocks\?\.notify\(wx, wy, wz\);/);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /this\.world\.fallingBlocks\?\.update\(worldDt\);/);
});
