// Nether fossils: the 14 /Structure drawings (5 to 27 bone blocks, no integrity, no ores), soul sand valleys, a dried
// ghast beside a third of them. Card NX1-NX3 + W1 runs in tests/structureWikiCards.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNetherFossil, generateNetherFossil, realizeNetherFossil, NETHER_FOSSIL_VARIANTS, DRIED_GHAST_CHANCE } from '../src/worldgen/generators/netherFossil.js';
import { generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { BLOCKS } from '../src/blocks.js';

const TABLE = [10, 10, 6, 6, 5, 21, 18, 6, 15, 8, 24, 11, 17, 26];

test('the 14 drawings: bone only, every block, matching the table', () => {
  assert.ok(generatorCoverage().implemented.includes('nether_fossil'));
  for (let v = 1; v <= NETHER_FOSSIL_VARIANTS; v++) {
    const t = new StructureTemplate(buildNetherFossil({ variant: v }), 'f');
    assert.equal(t.blocks.length, TABLE[v - 1], `fossil_${v}`);
    assert.ok(t.palette.every((p) => p.name === 'minecraft:air' || p.name === 'minecraft:bone_block'));
  }
});

test('a third have a dried ghast beside them; on the valley floor; every block resolves', () => {
  let ghasts = 0; const N = 600;
  const ctx = { biomeAt: () => 'soul_sand_valley', surfaceY: () => 20 };
  for (let i = 0; i < N; i++) {
    const s = generateNetherFossil({ seed: 6, chunkX: i, chunkZ: 2 * i, structureId: 'nether_fossil', context: ctx });
    if (s.meta.ghast) ghasts++;
    assert.equal(s.box.minY, 21);
    if (i < 5) assert.deepEqual(realizeNetherFossil(s, () => true, BLOCKS).missingBlocks, []);
  }
  assert.ok(Math.abs(ghasts / N - DRIED_GHAST_CHANCE) < 0.06, `${ghasts}/${N}`);
});
