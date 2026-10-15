// Maps (src/maps.js) against the wiki's Map page. Found by the wiki-tutorial play-test (Mapping: maps "automatically draw
// themselves as you move through the world"): a filled map was an inert item.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapCenter, createMapData, exploreMap, mapColorOf, mapZoomResult, MAP_SIZE } from '../src/maps.js';
import { BLOCKS } from '../src/blocks.js';

test('a map is centred on the 128 x 2^scale grid (the spawn area map spans -64..63)', () => {
  assert.equal(mapCenter(0, 0), 0);
  assert.equal(mapCenter(63, 0), 0);
  assert.equal(mapCenter(64, 0), 128);
  assert.equal(mapCenter(-65, 0), -128);
  assert.equal(mapCenter(10, 1), 64, 'scale 1 covers -64..191');
});

test('carrying it draws the top blocks, shaded by height', () => {
  const world = { getVoxel: (x, y, z) => (y === 4 ? (x < 0 ? BLOCKS.WATER : BLOCKS.GRASS) : y < 4 ? BLOCKS.DIRT : (x === 10 && z === 10 && y === 5 ? BLOCKS.STONE : BLOCKS.AIR)) };
  const m = createMapData(0, 0, 0);
  exploreMap(m, world, 0.5, 0.5, { columns: MAP_SIZE, top: 20 });
  const px = (x, z) => m.colors[(z - m.centerZ + 64) * MAP_SIZE + (x - m.centerX + 64)] & 0xffffff;
  const shade = (c, k) => (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);
  assert.equal(px(5, 5), shade(mapColorOf(BLOCKS.GRASS), 220 / 255), 'level grass');
  assert.equal(px(-5, 5), shade(mapColorOf(BLOCKS.WATER), 220 / 255), 'water');
  assert.equal(px(10, 10), shade(mapColorOf(BLOCKS.STONE), 1), 'a raised block is lighter');
  assert.ok(m.version > 0);
});

test('8 paper around a map zoom it out one scale, to at most 4', () => {
  const map = { id: 'filled_map', count: 1, mapData: createMapData(0, 0, 0) };
  const paper = () => ({ id: 'paper', count: 1 });
  const grid = [paper(), paper(), paper(), paper(), map, paper(), paper(), paper(), paper()];
  assert.equal(mapZoomResult(grid).mapData.scale, 1);
  map.mapData.scale = 4;
  assert.equal(mapZoomResult(grid), null);
});

test('the game makes, draws and shows maps', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /mapData: createMapData\(/);
  assert.match(main, /this\.ui\?\.renderHeldMap\?\.\(map, this\.player\);/);
});
