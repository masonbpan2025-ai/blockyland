// A block cannot be placed inside another player or a mob (src/main.js Game.placementBlockedByOthers), as Minecraft's
// Level.isUnobstructed refuses a block with a collision shape that would intersect a living entity. The game checked
// only the placer's own box: on the replication server Delphi pillared up by placing dirt under her feet, which was
// inside Basil's head below her, and Basil suffocated (run sonnet30).
//
// main.js needs a browser to import, so the method is taken from its source and run on stand-ins, as
// tests/inspectorPicker.test.js does for the Inspector navigation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';

const source = readFileSync(join(process.cwd(), 'src/main.js'), 'utf8');
const signature = 'placementBlockedByOthers(x, y, z, blockId) {';
const from = source.indexOf(signature), end = source.indexOf('\n  }', from);
const blocked = new Function('BLOCK_DEFS', `return ({ ${source.slice(from, end + 4)} }).placementBlockedByOthers;`)(BLOCK_DEFS);

const at = (x, y, z) => ({ position: new THREE.Vector3(x, y, z), width: 0.6, height: 1.8, gamemode: 'survival' });
function game({ others = [], mobs = [] } = {}) {
  const self = at(0.5, 30, 0.5);
  return { player: self, players: [self, ...others], mobs: { mobs, getMobDimensions: (type) => ({ zombie: { width: 0.6, height: 1.95 }, chicken: { width: 0.4, height: 0.7 } }[type]) } };
}
const mob = (type, x, y, z, extra = {}) => ({ type, mesh: { position: new THREE.Vector3(x, y, z) }, health: 10, ...extra });

test('the Basil case: dirt under the placer\'s feet that is inside the head of the player below is refused', () => {
  // Basil stands at (8.5, 20, -1.5): his head fills block (8, 21, -2). Delphi above places dirt there.
  const g = game({ others: [at(8.49, 20, -1.46)] });
  assert.equal(blocked.call(g, 8, 21, -2, BLOCKS.DIRT), true);
  assert.equal(blocked.call(g, 8, 22, -2, BLOCKS.DIRT), false, 'the block above his head is free');
  assert.equal(blocked.call(g, 8, 19, -2, BLOCKS.DIRT), false, 'and so is the one he stands on');
});

test('blocks cannot be placed inside a living mob, a baby mob\'s smaller box included', () => {
  const g = game({ mobs: [mob('zombie', 3.5, 10, 3.5), mob('chicken', 6.5, 10, 6.5, { isBaby: true })] });
  assert.equal(blocked.call(g, 3, 11, 3, BLOCKS.STONE), true, 'a zombie\'s chest');
  assert.equal(blocked.call(g, 6, 10, 6, BLOCKS.STONE), true, 'a chick');
  assert.equal(blocked.call(g, 6, 11, 6, BLOCKS.STONE), false, 'above the chick (0.35 tall)');
});

test('blocks you walk through, dead mobs and the placer themself are not counted here', () => {
  const g = game({ others: [at(2.5, 5, 2.5)], mobs: [mob('zombie', 4.5, 5, 4.5, { health: 0 })] });
  assert.equal(blocked.call(g, 2, 5, 2, BLOCKS.TORCH), false, 'a torch may go at a player\'s feet');
  assert.equal(blocked.call(g, 4, 5, 4, BLOCKS.STONE), false, 'a dead mob does not block');
  assert.equal(blocked.call(g, 0, 30, 0, BLOCKS.STONE), false, 'the placer\'s own box is the caller\'s check');
  assert.equal(blocked.call({ player: at(0, 0, 0), mobs: { mobs: [] } }, 0, 0, 0, BLOCKS.STONE), false, 'a single-player game has no others');
});
