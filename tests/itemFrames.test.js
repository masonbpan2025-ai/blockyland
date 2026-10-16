// Item frames (src/itemFrames.js). Found by the wiki-tutorial play-test (Combination locks): there were none.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS as B } from '../src/blocks.js';
import { ItemFrameManager, frameSignal } from '../src/itemFrames.js';
import { Redstone } from '../src/redstone.js';

function rig() {
  const voxels = new Map(), drops = [];
  const world = { getVoxel: (x, y, z) => voxels.get(`${x},${y},${z}`) ?? B.AIR, getChunk: () => ({}), light: null };
  const game = { world, currentDimension: 'overworld', entities: { spawnDroppedItem: (p, id) => drops.push(id) } };
  world.redstone = new Redstone(world); world.redstone.game = game;
  world.set = (x, y, z, id) => { voxels.set(`${x},${y},${z}`, id); world.redstone.notify(x, y, z); };
  game.itemFrames = new ItemFrameManager(game);
  return { world, game, frames: game.itemFrames, drops };
}

test('a frame hangs on a face, holds one item, turns through 8 positions, and a comparator reads 1 to 8', () => {
  const { world, frames } = rig();
  world.set(0, 5, 0, B.STONE);
  const frame = frames.place({ x: 1, y: 5, z: 0 }, { x: 1, y: 0, z: 0 });
  assert.ok(frame);
  assert.equal(frameSignal(frame), 0, 'empty: 0');
  const held = { id: 'diamond', count: 3 };
  frames.use(frame, held); assert.equal(held.count, 2); assert.equal(frameSignal(frame), 1);
  for (let i = 0; i < 6; i++) frames.use(frame, held);
  assert.equal(frameSignal(frame), 7); frames.use(frame, held); assert.equal(frameSignal(frame), 8);
  frames.use(frame, held); assert.equal(frameSignal(frame), 1, 'eight positions, then round again');
  assert.equal(held.count, 2, 'turning it uses nothing');
  assert.equal(frames.place({ x: 2, y: 5, z: 0 }, { x: 1, y: 0, z: 0 }), null, 'nothing to hang on');
});

test('a comparator facing away from the frame reads its rotation; hitting pops the item, then breaks the frame', () => {
  const { world, game, frames, drops } = rig();
  world.set(0, 5, 0, B.STONE);
  const frame = frames.place({ x: 0, y: 5, z: 1 }, { x: 0, y: 0, z: 1 });
  frames.use(frame, { id: 'stick', count: 1 }); frames.use(frame, { id: 'stick', count: 1 }); frames.use(frame, { id: 'stick', count: 1 });
  world.set(0, 5, 2, B.COMPARATOR); world.redstone.configure([0, 5, 2], 4); // facing +z, rear at the frame's cell
  for (let i = 0; i < 4; i++) world.redstone.tick([]);
  assert.equal(world.redstone.state([0, 5, 2]).output, 3, 'rotation 2 reads as 3');
  assert.equal(frames.hit(frame), 'item'); assert.deepEqual(drops, ['stick']);
  assert.equal(frames.hit(frame), 'frame'); assert.deepEqual(drops, ['stick', 'item_frame']);
  void game;
});

test('a frame whose block is gone drops', () => {
  const { world, frames, drops } = rig();
  world.set(0, 5, 0, B.STONE);
  frames.place({ x: 0, y: 6, z: 0 }, { x: 0, y: 1, z: 0 }, { glow: true });
  world.set(0, 5, 0, B.AIR); frames.update(1);
  assert.deepEqual(drops, ['glow_item_frame']); assert.equal(frames.frames.length, 0);
  void THREE;
});
