// Nether fortresses: the /Structure drawings joined at the doorways found in them, the start crossing at
// chunk-local 11, 11, the piece limits, blaze spawners, the 1-in-3 turn chests, pillars to the ground. Card NF1-NF5 +
// W1 runs in tests/structureWikiCards.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFortress, generateFortress, realizeFortress, FORTRESS_PIECES, FORTRESS_LOOT } from '../src/worldgen/generators/fortress.js';
import { findOpenings, placeDrawing, drawingPiece } from '../src/worldgen/drawnPieces.js';
import { BLUEPRINTS } from '../src/worldgen/generators/blueprints/nether_fortress.js';
import { generatorCoverage } from '../src/worldgen/index.js';
import { BLOCKS } from '../src/blocks.js';

test('doorways are read from the drawings', () => {
  const sides = (name) => findOpenings(BLUEPRINTS[name], undefined, { minWidth: 3, maxWidth: 5 }).map((o) => o.side).sort();
  assert.deepEqual(sides('bridge'), ['north', 'south']);
  assert.deepEqual(sides('corridor_intersection'), ['east', 'north', 'south', 'west']);
  assert.deepEqual(sides('curved_corridor'), ['south', 'west']);
  assert.deepEqual(sides('bridge_staircases'), ['south'], 'the small room has one way in');
});

test('placing a piece turns it so its entrance meets the exit', () => {
  const corridor = drawingPiece(BLUEPRINTS.straight_corridor, (c) => c, { minWidth: 3 });
  for (const dir of ['north', 'south', 'east', 'west']) {
    const placed = placeDrawing(corridor, 0, { x: 100, y: 40, z: 100, dir });
    assert.ok(placed.box.contains(100, 40, 100), `${dir}: the entrance block is at the exit point`);
    assert.equal(placed.exits.length, 1);
    assert.equal(placed.exits[0].dir, dir, 'a straight corridor carries on the same way');
  }
});

test('fortresses keep to the limits, have their spawners and chest odds, and resolve', () => {
  assert.ok(generatorCoverage().implemented.includes('fortress'));
  let turns = 0; let chests = 0;
  for (let s = 1; s <= 6; s++) {
    const { canvas, counts } = buildFortress({ seed: s, x: 11, z: 11 });
    for (const [k, d] of Object.entries(FORTRESS_PIECES)) assert.ok((counts[k] ?? 0) <= d.limit, k);
    const cells = [...canvas.cells.values()];
    assert.equal(cells.filter((c) => c.name === 'spawner').length, counts.blaze_platform ?? 0);
    turns += counts.turn ?? 0;
    chests += cells.filter((c) => c.name === 'chest').length;
    for (const c of cells.filter((x) => x.name === 'chest')) assert.equal(c.nbt.LootTable, FORTRESS_LOOT);
  }
  assert.ok(turns > 10 && chests > 0 && chests < turns, `${chests} chests in ${turns} turns`);
  const st = generateFortress({ seed: 2, chunkX: 4, chunkZ: 4, structureId: 'fortress', context: { surfaceY: () => 20 } });
  assert.deepEqual(realizeFortress(st, () => true, BLOCKS).missingBlocks, []);
});
