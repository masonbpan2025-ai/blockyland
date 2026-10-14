// Ancient cities: the Blueprints page's drawings on our plan, the fixed floor (mapped into this world), the reinforced
// deepslate frame, corridors, buildings, walls and the two loot tables. Card AC1-AC5 + W1 runs in
// tests/structureWikiCards.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAncientCity, generateAncientCity, realizeAncientCity, CITY_FLOOR_Y, CITY_LOOT, BUILDINGS } from '../src/worldgen/generators/ancientCity.js';
import { BLUEPRINTS } from '../src/worldgen/generators/blueprints/ancient_city.js';
import { generatorCoverage } from '../src/worldgen/index.js';
import { BLOCKS } from '../src/blocks.js';

test('the drawings are read from the Blueprints subpages', () => {
  assert.ok(generatorCoverage().implemented.includes('ancient_city'));
  for (const name of BUILDINGS) assert.ok(Object.values(BLUEPRINTS).some((b) => b.source.endsWith(`/${name}.txt`)), name);
});

test('every city: the centre, the entrance, corridors, buildings, walls; inside the world; one floor level', () => {
  for (let s = 1; s <= 6; s++) {
    const { canvas, pieces } = buildAncientCity({ seed: s, x: 0, z: 0 });
    const kinds = pieces.map((p) => p.kind);
    assert.equal(kinds.filter((k) => k === 'city_center').length, 2, 'the drawn half and its mirror');
    assert.ok(kinds.includes('entrance') && kinds.filter((k) => k === 'building').length >= 6 && kinds.includes('wall'));
    const cells = [...canvas.cells.values()];
    assert.ok(cells.every((c) => c.y >= 1 && c.y <= 62));
    assert.ok(cells.some((c) => c.name === 'reinforced_deepslate'));
    for (const c of cells.filter((x) => x.name === 'chest')) assert.ok(Object.values(CITY_LOOT).includes(c.nbt.LootTable));
    assert.ok(pieces.filter((p) => p.kind === 'corridor').every((p) => p.box.minY === CITY_FLOOR_Y - 1));
  }
});

test('realization resolves every block and places no mob', () => {
  const st = generateAncientCity({ seed: 2, chunkX: 30, chunkZ: 30, structureId: 'ancient_city', context: {} });
  const spawns = [];
  const r = realizeAncientCity(st, () => true, BLOCKS, { spawnMob: (t) => spawns.push(t) });
  assert.deepEqual(r.missingBlocks, []);
  assert.equal(spawns.length, 0);
});
