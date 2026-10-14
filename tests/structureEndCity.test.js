// End cities: the /Structure drawings (base, towers, rooms, bridges, the ship), bridges at 50%, at most one ship,
// shulkers, the treasure, and the wool stair markers. Card EC1-EC5 + W1 runs in tests/structureWikiCards.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEndCity, generateEndCity, realizeEndCity, MAX_SHIPS, END_CITY_LOOT } from '../src/worldgen/generators/endCity.js';
import { BLUEPRINTS } from '../src/worldgen/generators/blueprints/end_city.js';
import { generatorCoverage } from '../src/worldgen/index.js';
import { BLOCKS } from '../src/blocks.js';

test('every piece is drawn (the room pages\' pipe-less legends are read)', () => {
  assert.ok(generatorCoverage().implemented.includes('end_city'));
  for (const name of ['base_room', 'empty_room', 'small_tower_base', 'small_tower_extention', 'small_room', 'large_room', 'two_storey', 'three_storey', 'loot_room', 'bridge', 'gentle_stairs', 'steep_stairs', 'dock', 'end_ship']) {
    assert.ok(BLUEPRINTS[name]?.blocks.length > 0, name);
  }
});

test('cities: a base first, at most one ship, never any wool, chests with the treasure', () => {
  let shipCities = 0;
  for (let s = 1; s <= 80; s++) {
    const { canvas, pieces, ships } = buildEndCity({ seed: s, x: 0, y: 29, z: 0 });
    assert.equal(pieces[0].kind, 'base_room');
    assert.ok(ships <= MAX_SHIPS);
    if (ships) shipCities++;
    const cells = [...canvas.cells.values()];
    assert.ok(!cells.some((c) => /_wool$/.test(c.name)), 'the wool markers are not placed');
    for (const c of cells.filter((x) => x.name === 'chest')) assert.equal(c.nbt.LootTable, END_CITY_LOOT);
    assert.ok(canvas.entities.every((e) => e.type === 'shulker'));
    for (const c of cells) assert.ok(c.y <= 62);
  }
  assert.ok(shipCities > 0, 'some cities have a ship');
});

test('a ship\'s first chest carries the elytra; realization resolves every block', () => {
  let found = false;
  for (let s = 1; s <= 200 && !found; s++) {
    const { canvas, ships } = buildEndCity({ seed: s, x: 0, y: 29, z: 0 });
    if (!ships) continue;
    found = [...canvas.cells.values()].some((c) => c.name === 'chest' && c.nbt.extra?.some((i) => i.id === 'elytra'));
  }
  assert.ok(found);
  const st = generateEndCity({ seed: 3, chunkX: 40, chunkZ: 0, structureId: 'end_city', context: { surfaceY: () => 28 } });
  assert.deepEqual(realizeEndCity(st, () => true, BLOCKS).missingBlocks, []);
});
