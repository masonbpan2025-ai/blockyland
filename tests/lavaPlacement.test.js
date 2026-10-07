// Regression guards for the two lava behaviours that were reported broken:
//
//   1. "when a lava block is placed, it doesn't flow"
//   2. "it doesn't become obsidian when it meets water"
//
// Both symptoms have the same shape -- the placed lava is never processed by the simulation -- so every
// test here STARTS FROM A PLACEMENT rather than seeding the voxel and the scheduler separately. The
// existing lava tests build their world with `new Chunk()` and write voxels directly, which cannot
// distinguish "the simulation works" from "the placement path registers the block". These do.
//
// The `placedWorld` helper is deliberately the realistic arrangement: a world whose chunk exists the way
// the game leaves it after generation, with the block committed through `world.setVoxel` exactly as
// main.js commits a placement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Chunk } from '../src/world.js';
import { BLOCKS } from '../src/blocks.js';
import { LAVA_TICK } from '../src/lavaSimulation.js';

/** A world with a stone floor at y=0 and open air above, one chunk is enough for these. */
function flatWorld() {
  const w = new World();
  const c = new Chunk(0, 0);
  w.chunks.set('0,0', c);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) c.setVoxel(x, 0, z, BLOCKS.STONE);
  return w;
}

/** Advance the fluid simulation the way the game loop does: fixed water ticks. */
function run(w, ticks = 40) {
  for (let i = 0; i < ticks; i++) w.water.update(LAVA_TICK / 6);
}

test('a PLACED lava block flows: placement alone must schedule and spread it', () => {
  const w = flatWorld();
  // This is the whole point of the test -- commit the block the way a player placement does.
  w.setVoxel(5, 1, 5, BLOCKS.LAVA);

  // Placement must register the block with the scheduler. If this fails, nothing downstream can work.
  assert.equal(w.getLavaLevel(5, 1, 5), 0, 'the placed block must read back as a level-0 lava source');
  assert.ok(w.lava.lavaCells.size >= 1, 'placement must register the block in lavaCells');
  assert.ok(w.lava.pending.size > 0, 'placement must enqueue its neighbours for the simulation');

  run(w, 20);

  // It must have spread in all four open directions, one level down per step.
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    assert.equal(w.getVoxel(5 + dx, 1, 5 + dz), BLOCKS.LAVA,
      `placed lava must flow to (${dx},${dz}); it did not spread there`);
    assert.equal(w.getLavaLevel(5 + dx, 1, 5 + dz), 2,
      `flowing lava at (${dx},${dz}) must be one level below the source`);
  }
});

test('a placed lava block falls when there is nothing beneath it', () => {
  const w = flatWorld();
  // A hole in the floor: the lava must fall into it rather than only spreading sideways.
  w.getChunk(0, 0).setVoxel(5, 0, 5, BLOCKS.AIR);
  w.setVoxel(5, 3, 5, BLOCKS.LAVA);

  run(w, 60);

  assert.equal(w.getVoxel(5, 0, 5), BLOCKS.LAVA,
    'placed lava must fall into an open column below it');
});

test('PLACED lava becomes obsidian when water reaches it', () => {
  const w = flatWorld();
  w.setVoxel(5, 1, 5, BLOCKS.LAVA);
  // Water placed directly against the source, as a player would.
  w.setVoxel(6, 1, 5, BLOCKS.WATER);

  run(w, 20);

  assert.equal(w.getVoxel(5, 1, 5), BLOCKS.OBSIDIAN,
    'a lava SOURCE meeting water must become obsidian');
});

test('water flowing into placed lava, from a distance, still makes obsidian', () => {
  const w = flatWorld();
  w.setVoxel(5, 1, 5, BLOCKS.LAVA);
  // Water several tiles away: it has to travel to the lava for the contact to happen.
  w.setVoxel(9, 1, 5, BLOCKS.WATER);

  run(w, 120);

  assert.equal(w.getVoxel(5, 1, 5), BLOCKS.OBSIDIAN,
    'water that flows to a placed lava source must still convert it');
});

test('water falling onto placed lava makes obsidian', () => {
  const w = flatWorld();
  w.setVoxel(5, 1, 5, BLOCKS.LAVA);
  w.setVoxel(5, 4, 5, BLOCKS.WATER);

  run(w, 60);

  assert.equal(w.getVoxel(5, 1, 5), BLOCKS.OBSIDIAN,
    'water falling onto lava must convert the lava it lands on');
});

test('the lava scheduler processes a placement even with a large existing lava body', () => {
  // The reported symptoms could also come from a placement being STARVED by a big queue, which is the
  // situation in the Nether lava sea. This fills the queue with unrelated work and then checks that a
  // fresh placement is still handled within a bounded number of ticks.
  const w = flatWorld();
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) w.setVoxel(x, 1, z, BLOCKS.LAVA);
  assert.ok(w.lava.pending.size > 200, 'the setup should have queued a lot of work');

  // Now place a distinguishable block elsewhere and require it to spread.
  const c = new Chunk(1, 0);
  w.chunks.set('1,0', c);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) c.setVoxel(x, 0, z, BLOCKS.STONE);
  w.setVoxel(20, 1, 5, BLOCKS.LAVA);

  run(w, 120);

  assert.equal(w.getVoxel(21, 1, 5), BLOCKS.LAVA,
    'a fresh placement must still flow even when the queue already holds a lot of lava');
});

test('removing the source lets placed lava drain away', () => {
  const w = flatWorld();
  w.setVoxel(5, 1, 5, BLOCKS.LAVA);
  run(w, 20);
  assert.equal(w.getVoxel(6, 1, 5), BLOCKS.LAVA, 'precondition: it spread');

  w.setVoxel(5, 1, 5, BLOCKS.AIR);
  run(w, 120);

  assert.equal(w.getVoxel(6, 1, 5), BLOCKS.AIR,
    'flowing lava must recede once its source is removed');
});
