// The bonus chest: on the highest block in the spawn chunk, four torches round it, the bonus loot; off by default.
import test from 'node:test';
import assert from 'node:assert/strict';
import { placeBonusChest, BONUS_CHEST_LOOT } from '../src/bonusChest.js';
import { normaliseSettings, DEFAULT_SETTINGS } from '../src/sessionSettings.js';
import { rollStructureLoot } from '../src/structureLoot.js';
import { BLOCKS } from '../src/blocks.js';

function flatWorld(top = 20) {
  const v = new Map();
  return {
    getVoxel: (x, y, z) => v.get(`${x},${y},${z}`) ?? (y <= top ? BLOCKS.STONE : BLOCKS.AIR),
    setVoxel: (x, y, z, id) => v.set(`${x},${y},${z}`, id)
  };
}

test('the option is off unless chosen', () => {
  assert.equal(DEFAULT_SETTINGS.bonusChest, false);
  assert.equal(normaliseSettings({}).bonusChest, false);
  assert.equal(normaliseSettings({ bonusChest: true }).bonusChest, true);
});

test('the chest sits on the ground in the spawn chunk with a torch on each side and the bonus loot', () => {
  const w = flatWorld();
  let adopted = null;
  const spot = placeBonusChest(w, 5, 5, (x, y, z, loot) => { adopted = { x, y, z, loot }; });
  assert.equal(spot.y, 21);
  assert.ok(spot.x >= 0 && spot.x < 16 && spot.z >= 0 && spot.z < 16);
  assert.equal(w.getVoxel(spot.x, spot.y, spot.z), BLOCKS.CHEST);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.equal(w.getVoxel(spot.x + dx, spot.y, spot.z + dz), BLOCKS.TORCH);
  assert.equal(adopted.loot, BONUS_CHEST_LOOT);
  assert.ok(rollStructureLoot(BONUS_CHEST_LOOT, 3).some(Boolean));
});
