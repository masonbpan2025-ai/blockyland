import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Chunk } from '../src/world.js';
import { BLOCKS as B } from '../src/blocks.js';

function world() {
  const w = new World();
  for (let x = -1; x < 3; x++) for (let z = -1; z < 2; z++) w.chunks.set(w.chunkKey(x, z), new Chunk(x, z));
  return w;
}
const put = (w, p, id, dir = 0) => { w.setVoxel(...p, id); w.redstone.configure(p, dir); return w.redstone.state(p); };
const ticks = (w, n = 1, actors = []) => { for (let i = 0; i < n; i++) w.redstone.tick(actors); };

test('an oak door opens and closes by hand', () => {
  const w = world();
  put(w, [0, 2, 0], B.OAK_DOOR);
  ticks(w);

  const opened = w.redstone.interact([0, 2, 0]);
  ticks(w);
  assert.equal(opened, 'Door opened', 'the interaction reports opening');
  assert.equal(w.getVoxel(0, 2, 0), B.OAK_DOOR_OPEN, 'the block swaps to the open form');

  const closed = w.redstone.interact([0, 2, 0]);
  ticks(w);
  assert.equal(closed, 'Door closed');
  assert.equal(w.getVoxel(0, 2, 0), B.OAK_DOOR, 'and back to closed');
});

test('an oak trapdoor opens by hand too', () => {
  const w = world();
  put(w, [0, 2, 0], B.OAK_TRAPDOOR);
  ticks(w);
  w.redstone.interact([0, 2, 0]);
  ticks(w);
  assert.equal(w.getVoxel(0, 2, 0), B.OAK_TRAPDOOR_OPEN);
});

test('redstone opens a wooden door and holds it shut against a hand toggle', () => {
  const w = world();
  // Lever, then wire directly beside it, then the door beside the wire: every step
  // is an adjacent block, which is what a redstone signal can actually travel along.
  put(w, [0, 2, 0], B.LEVER);
  put(w, [0, 2, 1], B.REDSTONE_WIRE);
  put(w, [0, 2, 2], B.OAK_DOOR);
  ticks(w);
  assert.equal(w.getVoxel(0, 2, 2), B.OAK_DOOR, 'closed with no power');

  w.redstone.interact([0, 2, 0]); // lever on
  ticks(w, 4);
  assert.ok(w.redstone.input([0, 2, 2]) > 0, 'the door sees the signal through the wire');
  assert.equal(w.getVoxel(0, 2, 2), B.OAK_DOOR_OPEN, 'power opens it');

  const held = w.redstone.interact([0, 2, 2]);
  assert.match(held, /redstone/, 'you cannot hand-close a powered door');
  assert.equal(w.getVoxel(0, 2, 2), B.OAK_DOOR_OPEN, 'it stays open');

  w.redstone.interact([0, 2, 0]); // lever off
  ticks(w, 4);
  assert.equal(w.getVoxel(0, 2, 2), B.OAK_DOOR, 'and it closes when the power goes');
});

test('rails exist, are placeable and keep their direction', () => {
  const w = world();
  const rail = put(w, [0, 2, 0], B.RAIL, 1);
  assert.ok(rail, 'a rail gets simulator state');
  assert.equal(w.getVoxel(0, 2, 0), B.RAIL);
  assert.equal(rail.dir, 1, 'its direction is stored');
});

test('a powered rail is a redstone component that powers up', () => {
  const w = world();
  put(w, [0, 2, 1], B.LEVER);
  const rail = put(w, [0, 2, 0], B.POWERED_RAIL, 1);
  ticks(w);
  assert.equal(rail.output ?? 0, 0, 'unpowered to begin with');
  w.redstone.interact([0, 2, 1]);
  ticks(w, 2);
  assert.ok(w.redstone.input([0, 2, 0]) > 0, 'the rail receives power from the lever');
});
