// Amethyst geodes: 1 in 24 chunks, three shells round a hollow sized like the wiki's drawn geode, 8.3% budding,
// crystals on budding amethyst, 95% cracked. Card AG1-AG5 + W1 runs in tests/structureWikiCards.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeode, generateGeode, realizeGeode, geodeIsCracked } from '../src/worldgen/generators/geode.js';
import { BLUEPRINTS } from '../src/worldgen/generators/blueprints/amethyst_geode.js';
import { BLOCKS } from '../src/blocks.js';

const count = (t) => { const n = {}; for (const b of t.blocks) { const k = t.palette[b.state].Name.replace('minecraft:', ''); n[k] = (n[k] ?? 0) + 1; } return n; };

test('a geode comes out about the size of the drawn one, 8.3% budding', () => {
  const drawn = { smooth_basalt: 697, calcite: 253, amethyst: 167 + 16 };
  let budding = 0; let amethyst = 0;
  for (let s = 1; s <= 30; s++) {
    const n = count(buildGeode({ seed: s }));
    assert.ok(Math.abs(n.smooth_basalt - drawn.smooth_basalt) / drawn.smooth_basalt < 0.3, `basalt ${n.smooth_basalt}`);
    assert.ok(Math.abs(n.calcite - drawn.calcite) / drawn.calcite < 0.4, `calcite ${n.calcite}`);
    budding += n.budding_amethyst; amethyst += n.budding_amethyst + n.amethyst_block;
  }
  assert.ok(Math.abs(budding / amethyst - 0.083) < 0.02, `${budding}/${amethyst}`);
  assert.equal(BLUEPRINTS.amethyst_geode.blocks.split(';').filter(Boolean).length, 697 + 253 + 167 + 16, 'the drawing is read (capital-L {{Layered blueprint}})');
});

test('95% cracked; 1 in 24 chunks; every block resolves', () => {
  let cracked = 0;
  for (let s = 1; s <= 1000; s++) if (geodeIsCracked(s)) cracked++;
  assert.ok(Math.abs(cracked / 1000 - 0.95) < 0.02);
  let found = 0;
  const ctx = { surfaceY: () => 40 };
  for (let i = 0; i < 2400; i++) {
    const s = generateGeode({ seed: 4, chunkX: i, chunkZ: -i, structureId: 'amethyst_geode', context: ctx });
    if (!s) continue;
    found++;
    if (found < 4) assert.deepEqual(realizeGeode(s, () => true, BLOCKS).missingBlocks, []);
    assert.ok(s.box.maxY <= 36);
  }
  assert.ok(Math.abs(found / 2400 - 1 / 24) < 0.012, `${found}`);
});
