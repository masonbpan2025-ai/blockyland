// Bubble columns (src/bubbleColumns.js) and two TNT rules, from the Construction play-test (Elevators, Blast chamber,
// Igniting TNT underwater).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOCKS as B } from '../src/blocks.js';
import { bubbleColumnAt, bubblePush } from '../src/bubbleColumns.js';

const world = (base) => ({ getVoxel: (x, y, z) => (x !== 0 || z !== 0 ? B.STONE : y === 4 ? base : y > 4 && y <= 12 ? B.WATER : y < 4 ? B.STONE : B.AIR) });

test('water over soul sand lifts, over magma drags down, over anything else does nothing', () => {
  assert.equal(bubbleColumnAt(world(B.SOUL_SAND), 0.5, 10, 0.5), 'up');
  assert.equal(bubbleColumnAt(world(B.MAGMA_BLOCK), 0.5, 10, 0.5), 'down');
  assert.equal(bubbleColumnAt(world(B.STONE), 0.5, 10, 0.5), null);
  assert.equal(bubbleColumnAt(world(B.SOUL_SAND), 0.5, 13.5, 0.5), null, 'not above the water');
  let vy = 0; for (let i = 0; i < 40; i++) vy = bubblePush('up', vy, 0.05);
  assert.equal(vy, 14, 'up to 0.7 blocks a tick'); let down = 0; for (let i = 0; i < 40; i++) down = bubblePush('down', down, 0.05);
  assert.equal(down, -6, 'down to 0.3 blocks a tick');
});

test('TNT drops every block it breaks, and breaks none when it goes off in water', () => {
  const src = readFileSync(new URL('../src/entities.js', import.meta.url), 'utf8');
  assert.match(src, /if \(drop\) this\.spawnDroppedItem\(pos, drop\.id, drop\.isBlock, 1\);/);
  assert.match(src, /const inWater = \[BLOCKS\.WATER, BLOCKS\.BUBBLE_COLUMN\]\.includes[\s\S]{0,300}if \(!inWater\) for \(const hitBlock of explosionBlocks/);
});

test('fences, fence gates and walls are 1.5 blocks tall for players and mobs (Tutorial:Ranching)', async () => {
  const THREE = await import('three');
  const { Player } = await import('../src/player.js');
  const world = { getVoxel: (x, y, z) => (x === 0 && y === 5 && z === 0 ? B.OAK_FENCE : B.AIR) };
  const p = Object.create(Player.prototype); Object.assign(p, { world, width: 0.6, height: 1.8, isSneaking: false });
  assert.equal(p.checkCollision(new THREE.Vector3(0.5, 6.2, 0.5)), true, 'inside the upper half block of the fence');
  assert.equal(p.checkCollision(new THREE.Vector3(0.5, 6.5, 0.5)), false, 'standing on top of it');
  const src = readFileSync(new URL('../src/mobs.js', import.meta.url), 'utf8');
  assert.match(src, /pos\.y \+ 0\.02 < below \+ 1\.5\) for/);
});

test('paintings hang on doors, fence gates, trapdoors and signs (Tutorial:Secret door); slabs go on top and stairs face the player', async () => {
  const { canSupportPainting } = await import('../src/paintings.js');
  for (const k of ['OAK_DOOR_OPEN', 'OAK_FENCE_GATE', 'OAK_TRAPDOOR']) assert.equal(canSupportPainting(B[k]), true, k);
  assert.equal(canSupportPainting(B.SHORT_GRASS), false);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /if \(placedDef\?\.slab && upper\) this\.world\.applyStructureOrientation/);
  assert.match(main, /half: upper \? 'top' : 'bottom'/);
});
