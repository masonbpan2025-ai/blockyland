// The compass (src/compass.js) against the wiki's Compass page. Found by the wiki-tutorial play-test (Navigation: "A
// world's original spawn point can be found easily using a compass"): nothing computed where a compass pointed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compassTarget, needleAngle, attuneCompass } from '../src/compass.js';
import { BLOCKS } from '../src/blocks.js';

const game = (dimension = 'overworld', blocks = {}) => ({
  currentDimension: dimension,
  player: { spawnPosition: { x: 10.5, y: 64, z: -20.5 } },
  world: { getVoxel: (x, y, z) => blocks[`${x},${y},${z}`] ?? BLOCKS.AIR },
});

test('a compass points at the world spawn in the Overworld and spins elsewhere', () => {
  assert.deepEqual(compassTarget(game(), { id: 'compass' }), { x: 10.5, y: 64, z: -20.5 });
  assert.equal(compassTarget(game('nether'), { id: 'compass' }), null);
  assert.equal(compassTarget(game('the_end'), { id: 'compass' }), null);
});

test('a lodestone compass points at its lodestone, and spins if it is broken or in another dimension', () => {
  const item = { id: 'compass' };
  assert.ok(attuneCompass(item, 3, 70, 4, 'nether'));
  assert.deepEqual(compassTarget(game('nether', { '3,70,4': BLOCKS.LODESTONE }), item), { x: 3.5, y: 70, z: 4.5 });
  assert.equal(compassTarget(game('nether'), item), null, 'lodestone gone');
  assert.equal(compassTarget(game('overworld', { '3,70,4': BLOCKS.LODESTONE }), item), null, 'other dimension');
});

test('the needle: ahead is 0, right is +90 degrees, behind is 180', () => {
  const at = { x: 0, z: 0 };
  assert.ok(Math.abs(needleAngle(at, 0, { x: 0, z: -10 })) < 1e-9, 'north while facing north');
  assert.ok(Math.abs(needleAngle(at, 0, { x: 10, z: 0 }) - Math.PI / 2) < 1e-9, 'east is to the right');
  assert.ok(Math.abs(Math.abs(needleAngle(at, 0, { x: 0, z: 10 })) - Math.PI) < 1e-9);
  assert.ok(Math.abs(needleAngle(at, Math.PI / 2, { x: -10, z: 0 })) < 1e-9, 'west while facing west');
});

test('the game attunes on a lodestone and the hotbar draws the needle', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /clickedBlock === BLOCKS\.LODESTONE && activeItem\?\.id === 'compass'/);
  assert.match(main, /this\.ui\?\.updateCompassNeedles\?\.\(this\);/);
  const ui = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.match(ui, /needle\.className = 'compass-needle'/);
});
