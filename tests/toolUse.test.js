// Using a tool on a block (src/toolUse.js): a shovel makes a dirt path, an axe strips a log. Found by the wiki-tutorial
// play-test (Navigation: "Dirt paths ... requiring only a shovel"); neither existed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toolUseOn, applyToolUse, STRIPPED } from '../src/toolUse.js';
import { BLOCKS } from '../src/blocks.js';

const world = (cells) => ({ structureOrientations: new Map(), getVoxel: (x, y, z) => cells[`${x},${y},${z}`] ?? BLOCKS.AIR, setVoxel(x, y, z, id) { cells[`${x},${y},${z}`] = id; this.structureOrientations.delete(`${x},${y},${z}`); } });

test('a shovel paves grass or dirt with air above, and nothing else', () => {
  const w = world({ '0,0,0': BLOCKS.GRASS, '1,0,0': BLOCKS.DIRT, '1,1,0': BLOCKS.STONE, '2,0,0': BLOCKS.STONE });
  assert.equal(toolUseOn(w, 'iron_shovel', 0, 0, 0)?.block, BLOCKS.DIRT_PATH);
  assert.equal(toolUseOn(w, 'iron_shovel', 1, 0, 0), null, '"that has air above it"');
  assert.equal(toolUseOn(w, 'iron_shovel', 2, 0, 0), null);
  assert.equal(toolUseOn(w, 'stone_pickaxe', 0, 0, 0), null);
});

test('an axe strips logs, wood, stems and hyphae, keeping the axis', () => {
  for (const n of ['OAK_LOG', 'BIRCH_WOOD', 'CRIMSON_STEM', 'WARPED_HYPHAE']) assert.equal(STRIPPED.get(BLOCKS[n]), BLOCKS[`STRIPPED_${n}`], n);
  const w = world({ '0,0,0': BLOCKS.SPRUCE_LOG });
  w.structureOrientations.set('0,0,0', { axis: 'x' });
  applyToolUse(w, 0, 0, 0, toolUseOn(w, 'stone_axe', 0, 0, 0));
  assert.equal(w.getVoxel(0, 0, 0), BLOCKS.STRIPPED_SPRUCE_LOG);
  assert.deepEqual(w.structureOrientations.get('0,0,0'), { axis: 'x' });
  assert.equal(toolUseOn(w, 'stone_axe', 0, 0, 0), null, 'already stripped');
});

test('right-click runs it and spends a point', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /const use = activeItem && !activeItem\.isBlock \? toolUseOn\(this\.world, activeItem\.id, bX, bY, bZ\) : null;/);
});
