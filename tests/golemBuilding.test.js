// Building iron and snow golems (src/golemBuilding.js). Found by the wiki-tutorial play-test: neither could be built.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS } from '../src/blocks.js';
import { tryBuildGolem } from '../src/golemBuilding.js';

function game() {
  const voxels = new Map(); const spawned = [];
  const world = { getVoxel: (x, y, z) => voxels.get(`${x},${y},${z}`) ?? BLOCKS.AIR, setVoxel: (x, y, z, id) => voxels.set(`${x},${y},${z}`, id) };
  return { world, spawned, mobs: { spawnMob: (type, x, y, z) => { const m = { type, x, y, z }; spawned.push(m); return m; } } };
}

test('Iron Golem: "four blocks of iron in a T-shape" and a carved pumpkin on top', () => {
  const g = game(), w = g.world;
  w.setVoxel(0, 1, 0, BLOCKS.IRON_BLOCK); for (const x of [-1, 0, 1]) w.setVoxel(x, 2, 0, BLOCKS.IRON_BLOCK);
  w.setVoxel(0, 3, 0, BLOCKS.CARVED_PUMPKIN);
  const golem = tryBuildGolem(g, 0, 3, 0);
  assert.equal(golem?.type, 'iron_golem'); assert.equal(golem.playerCreated, true);
  assert.equal(w.getVoxel(0, 1, 0), BLOCKS.AIR); assert.equal(w.getVoxel(1, 2, 0), BLOCKS.AIR);
});

test('Iron Golem: a jack o\'lantern works too, but the bottom corners must be open', () => {
  const g = game(), w = g.world;
  w.setVoxel(0, 1, 0, BLOCKS.IRON_BLOCK); for (const z of [-1, 0, 1]) w.setVoxel(0, 2, z, BLOCKS.IRON_BLOCK);
  w.setVoxel(0, 1, 1, BLOCKS.DIRT); w.setVoxel(0, 3, 0, BLOCKS.JACK_O_LANTERN);
  assert.equal(tryBuildGolem(g, 0, 3, 0), null);
  w.setVoxel(0, 1, 1, BLOCKS.AIR);
  assert.equal(tryBuildGolem(g, 0, 3, 0)?.type, 'iron_golem');
});

test('Snow Golem: "two snow blocks stacked", a pumpkin head; a plain pumpkin is not a head', () => {
  const g = game(), w = g.world;
  w.setVoxel(5, 1, 5, BLOCKS.SNOW); w.setVoxel(5, 2, 5, BLOCKS.SNOW); w.setVoxel(5, 3, 5, BLOCKS.PUMPKIN);
  assert.equal(tryBuildGolem(g, 5, 3, 5), null);
  w.setVoxel(5, 3, 5, BLOCKS.CARVED_PUMPKIN);
  assert.equal(tryBuildGolem(g, 5, 3, 5)?.type, 'snow_golem');
  assert.equal(w.getVoxel(5, 1, 5), BLOCKS.AIR);
});
