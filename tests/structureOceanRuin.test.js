// Ocean ruins: the wiki's drawings (12 cold designs in three materials, 12 warm), the large/small and cluster odds,
// integrity, suspicious blocks, chests and drowned. Cards OR1-OR6 + W1 run in tests/structureWikiCards.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateOceanRuin, realizeOceanRuin, buildOceanRuin, integrityOf, ruinDrawing,
  LARGE_RUIN_CHANCE, CLUSTER_SIZE_RANGE, COLD_BIG, COLD_SMALL, COLD_MATERIALS, WARM_BIG, WARM_SMALL, RUIN_LOOT, RUIN_ARCHAEOLOGY, RUIN_DROWNED
} from '../src/worldgen/generators/oceanRuin.js';
import { createStructureEngine, generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { STRUCTURE_AUDIT_CARDS } from '../src/structureAuditCards.js';
import { BLOCKS } from '../src/blocks.js';

const ocean = { biomeAt: () => 'ocean', surfaceY: () => 30 };

test('both ids are implemented, gated on their oceans; every design is drawn', () => {
  const { implemented } = generatorCoverage();
  assert.ok(implemented.includes('ocean_ruin_cold') && implemented.includes('ocean_ruin_warm'));
  const engine = createStructureEngine({ seed: 1, blockIds: BLOCKS, ...ocean });
  assert.ok(!engine.registry.ocean_ruin_warm.biomes.includes('cold_ocean'));
  assert.deepEqual([COLD_BIG.length, COLD_SMALL.length, WARM_BIG.length, WARM_SMALL.length], [4, 8, 4, 8]);
  for (const design of [...COLD_BIG, ...COLD_SMALL]) for (const material of COLD_MATERIALS) assert.ok(ruinDrawing({ climate: 'cold', design, material })?.blocks.length > 0, `${design}_${material}`);
  for (const design of [...WARM_BIG, ...WARM_SMALL]) assert.ok(ruinDrawing({ climate: 'warm', design })?.blocks.length > 0, design);
});

test('30% large; a large ruin brings 4-8 small ones 90% of the time', () => {
  let large = 0; let clustered = 0;
  const N = 1500;
  for (let i = 0; i < N; i++) {
    const s = generateOceanRuin({ seed: 5, chunkX: i, chunkZ: -i, structureId: 'ocean_ruin_cold', context: ocean });
    if (s.meta.big) {
      large++;
      if (s.meta.cluster) { clustered++; assert.ok(s.meta.cluster >= CLUSTER_SIZE_RANGE[0] && s.meta.cluster <= CLUSTER_SIZE_RANGE[1]); }
    } else assert.equal(s.meta.cluster, 0);
  }
  assert.ok(Math.abs(large / N - LARGE_RUIN_CHANCE) < 0.04, `large share ${large / N}`);
  assert.ok(Math.abs(clustered / large - 0.9) < 0.05, `cluster share ${clustered / large}`);
});

test('integrity: the table, and the blocks kept', () => {
  assert.equal(integrityOf({ climate: 'cold', big: true, material: 'brick' }), 0.9);
  assert.equal(integrityOf({ climate: 'cold', big: false, material: 'brick' }), 0.8);
  assert.equal(integrityOf({ climate: 'cold', big: true, material: 'cracked' }), 0.7);
  assert.equal(integrityOf({ climate: 'cold', big: false, material: 'mossy' }), 0.5);
  assert.equal(integrityOf({ climate: 'warm', big: true }), 0.9);
  assert.equal(integrityOf({ climate: 'warm', big: false }), 0.8);
  const drawn = ruinDrawing({ climate: 'cold', design: 'big_ruin3', material: 'mossy' }).blocks.split(';').filter(Boolean).length;
  const kept = new StructureTemplate(buildOceanRuin({ climate: 'cold', design: 'big_ruin3', material: 'mossy', seed: 4 }), 'r').blocks.length;
  assert.ok(Math.abs(kept / drawn - 0.5) < 0.06, `${kept}/${drawn}`);
});

test('suspicious blocks, chest loot, light blue terracotta and drowned', () => {
  let suspicious = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const cold = new StructureTemplate(buildOceanRuin({ climate: 'cold', design: 'big_ruin1', material: 'brick', seed }), 'r');
    for (const b of cold.blocks) {
      const name = cold.palette[b.state].name;
      if (name === 'minecraft:suspicious_gravel') { suspicious++; assert.equal(b.nbt.LootTable, RUIN_ARCHAEOLOGY.cold); }
      if (name === 'minecraft:chest') assert.equal(b.nbt.LootTable, RUIN_LOOT.big);
      assert.notEqual(name, 'minecraft:suspicious_sand');
    }
    assert.ok(cold.entities.length >= 1 && cold.entities.length <= RUIN_DROWNED.big_ruin1[1], 'big_ruin1: 1-2 drowned');
  }
  assert.ok(suspicious > 0);
  const warm = new StructureTemplate(buildOceanRuin({ climate: 'warm', design: 'ruin_warm6', seed: 1 }), 'r');
  const names = warm.palette.map((p) => p.name);
  assert.ok(names.includes('minecraft:light_blue_terracotta') && !names.includes('minecraft:blue_terracotta'));
  const chest = warm.blocks.find((b) => warm.palette[b.state].name === 'minecraft:chest');
  assert.equal(chest.nbt.LootTable, RUIN_LOOT.small);
});

test('realization: every block resolves, every piece written, deterministic', () => {
  for (const structureId of ['ocean_ruin_cold', 'ocean_ruin_warm']) {
    for (let i = 0; i < 12; i++) {
      const s = generateOceanRuin({ seed: 21, chunkX: i, chunkZ: i, structureId, context: ocean });
      const a = []; const r = realizeOceanRuin(s, (x, y, z, id) => { a.push(`${x},${y},${z},${id}`); return true; }, BLOCKS);
      assert.deepEqual(r.missingBlocks, []);
      const b = []; realizeOceanRuin(s, (x, y, z, id) => { b.push(`${x},${y},${z},${id}`); return true; }, BLOCKS);
      assert.deepEqual(a, b);
      for (const piece of s.pieces) assert.ok(a.some((k) => { const [x, y, z] = k.split(',').map(Number); return piece.box.contains(x, y, z); }));
    }
  }
});

test('the card notices a small ruin with a cluster round it', () => {
  const or2 = STRUCTURE_AUDIT_CARDS.ocean_ruin_cold.facts.find((f) => f.id === 'OR2');
  const piece = (design) => ({ meta: { params: { design, material: 'brick' } } });
  assert.equal(or2.check({ pieces: [piece('ruin1'), piece('ruin2')] }).ok, false);
  assert.equal(or2.check({ pieces: [piece('big_ruin1'), ...['ruin1', 'ruin2', 'ruin3', 'ruin4'].map(piece)] }).ok, true);
});
