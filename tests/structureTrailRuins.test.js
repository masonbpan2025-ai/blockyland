// Trail ruins: buried but for the tower top, a terracotta tower with two halls, roads, buildings and decor, solid,
// and the wiki's processors (dirt 20%, coarse dirt 10%, then 2 common or 6 common + 3 rare suspicious gravel).
// Card TR1-TR4 + W1 runs in tests/structureWikiCards.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrailRuins, generateTrailRuins, realizeTrailRuins, TRAIL_LOOT } from '../src/worldgen/generators/trailRuins.js';
import { generatorCoverage } from '../src/worldgen/index.js';
import { BLOCKS } from '../src/blocks.js';

test('implemented; no chests and no suspicious sand -- the loot is in suspicious gravel', () => {
  assert.ok(generatorCoverage().implemented.includes('trail_ruins'));
  for (let s = 1; s <= 10; s++) {
    const cells = [...buildTrailRuins({ seed: s, x: 0, z: 0, ground: 40 }).canvas.cells.values()];
    assert.ok(!cells.some((c) => c.name === 'chest' || c.name === 'suspicious_sand'));
    for (const c of cells.filter((x) => x.name === 'suspicious_gravel')) assert.ok(Object.values(TRAIL_LOOT).includes(c.nbt.LootTable));
  }
});

test('the processors: per piece, 2 common (tower top, roads) or 6 common + 3 rare; dirt and coarse dirt among the gravel', () => {
  const { canvas, pieces } = buildTrailRuins({ seed: 4, x: 0, z: 0, ground: 40 });
  const cells = [...canvas.cells.values()];
  for (const p of pieces) {
    const inside = cells.filter((c) => c.name === 'suspicious_gravel' && p.box.contains(c.x, c.y, c.z));
    const rare = inside.filter((c) => c.nbt.LootTable === TRAIL_LOOT.rare).length;
    if (p.archaeology === 'top') assert.equal(rare, 0, p.kind);
    assert.ok(inside.length <= (p.archaeology === 'top' ? 2 : 9) + 9, `${p.kind}: ${inside.length}`);
  }
  const dirt = cells.filter((c) => c.name === 'dirt').length; const coarse = cells.filter((c) => c.name === 'coarse_dirt').length; const gravel = cells.filter((c) => c.name === 'gravel').length;
  assert.ok(dirt > 0 && coarse > 0 && dirt > coarse && gravel > dirt);
});

test('buried: only the tower top above the ground; every block resolves', () => {
  const st = generateTrailRuins({ seed: 2, chunkX: 3, chunkZ: 3, structureId: 'trail_ruins', context: { surfaceY: () => 40 } });
  const top = st.pieces.find((p) => p.meta.kind === 'tower_top').box;
  for (const c of st.meta.cells) if (c.y > 40) assert.ok(top.contains(c.x, c.y, c.z));
  assert.deepEqual(realizeTrailRuins(st, () => true, BLOCKS).missingBlocks, []);
});
