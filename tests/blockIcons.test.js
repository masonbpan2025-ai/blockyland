// Blocks shown as little 3D cubes in slots (src/blockIcons.js): which blocks are drawn so, with which face where, and
// that the three faces meet as a cube's do. The drawing itself needs a browser; what it draws from is checked here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS } from '../src/blocks.js';
import { blockIconFaces, blockIdOf, faceTransforms, ICON_SIZE } from '../src/blockIcons.js';

test('full cubes and slabs are drawn as cubes; plants, torches, doors, panes and the like keep a flat icon', () => {
  for (const id of [BLOCKS.DIRT, BLOCKS.STONE, BLOCKS.OAK_LOG, BLOCKS.GLASS, BLOCKS.OAK_LEAVES, BLOCKS.BEACON, BLOCKS.TNT]) assert.ok(blockIconFaces(id), `cube: ${id}`);
  assert.equal(blockIconFaces(BLOCKS.STONE_SLAB).height, 0.5, 'a slab is half a cube');
  assert.equal(blockIconFaces(BLOCKS.DIRT).height, 1);
  for (const id of [BLOCKS.TORCH, BLOCKS.DANDELION, BLOCKS.OAK_DOOR, BLOCKS.GLASS_PANE, BLOCKS.CHEST, BLOCKS.RED_CARPET, BLOCKS.WATER, BLOCKS.AIR, BLOCKS.CACTUS])
    assert.equal(blockIconFaces(id), null, `flat: ${id}`);
});

test('each face shows its own texture: the top on top, a front on the left face, the side on the right', () => {
  assert.deepEqual(
    (({ top, left, right }) => ({ top, left, right }))(blockIconFaces(BLOCKS.FURNACE)),
    { top: 'furnace_top.png', left: 'furnace_front.png', right: 'furnace_side.png' });
  const log = blockIconFaces(BLOCKS.OAK_LOG);
  assert.equal(log.top, 'oak_log_top.png'); assert.equal(log.right, 'oak_log.png');
  // Grass is grey in its texture and green in the world; its top is coloured, its dirt sides are not.
  const grass = blockIconFaces(BLOCKS.GRASS);
  assert.ok(grass.topTint && !grass.sideTint);
  assert.ok(blockIconFaces(BLOCKS.OAK_LEAVES).sideTint, 'leaves are coloured all over');
});

test('the faces meet as a cube\'s: three faces sharing the front corner, inside the icon', () => {
  for (const height of [1, 0.5]) {
    const { top, left, right } = faceTransforms(ICON_SIZE, height);
    // A face's corner (u, v), u and v from 0 to 1, as the canvas transform [a, b, c, d, e, f] puts it.
    const at = ([a, b, c, d, e, f], u, v) => [a * u + c * v + e, b * u + d * v + f].map((n) => Math.round(n * 1000) / 1000);
    // The top's texture runs from its left corner across to the back (u) and to the front (v).
    assert.deepEqual(at(top, 0, 1), at(left, 1, 0), 'the top\'s front corner is the left face\'s top-right');
    assert.deepEqual(at(left, 1, 0), at(right, 0, 0), 'and the right face\'s top-left');
    assert.deepEqual(at(top, 0, 0), at(left, 0, 0), 'the left edges meet');
    assert.deepEqual(at(top, 1, 1), at(right, 1, 0), 'the right edges meet');
    for (const t of [top, left, right]) for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const [x, y] = at(t, u, v);
      assert.ok(x >= 0 && x <= ICON_SIZE && y >= 0 && y <= ICON_SIZE, `inside the ${ICON_SIZE}px icon: ${x},${y}`);
    }
  }
  // The top is a diamond half as tall as it is wide, as Minecraft's slots show a block.
  const { top } = faceTransforms();
  assert.equal(Math.abs(top[1]) * 2, top[0]);
});

test('a slot\'s item finds its block: a block id, or an item that places one', () => {
  assert.equal(blockIdOf({ id: BLOCKS.DIRT, isBlock: true }), BLOCKS.DIRT);
  assert.equal(blockIdOf({ id: 'beacon', isBlock: true }), BLOCKS.BEACON);
  assert.equal(blockIdOf({ id: 'diamond', isBlock: false }), null);
  assert.equal(blockIdOf(null), null);
});
