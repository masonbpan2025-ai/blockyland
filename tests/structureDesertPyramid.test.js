// Desert pyramid: the wiki's blueprint, block for block, with the cellar sand and collapsed roof randomised as the
// /Structure page describes. The full fact card (P1-P8 + W1) is in src/structureAuditCards.js.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateDesertPyramid, realizeDesertPyramid, buildDesertPyramid, PYRAMID_BASE, PYRAMID_BASE_Y, PYRAMID_CHEST_LOOT, PYRAMID_ARCHAEOLOGY_LOOT
} from '../src/worldgen/generators/desertPyramid.js';
import { STRUCTURE_BLUEPRINTS } from '../src/worldgen/generators/structureBlueprintData.js';
import { createStructureEngine, GENERATORS, generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { auditStructure } from '../src/structureAudit.js';
import { STRUCTURE_AUDIT_CARDS } from '../src/structureAuditCards.js';
import { BLOCKS } from '../src/blocks.js';

const desert = { biomeAt: () => 'desert', surfaceY: () => 40 };
const counts = (template) => {
  const out = {};
  for (const block of template.blocks) { const n = template.palette[block.state].name.replace('minecraft:', ''); out[n] = (out[n] ?? 0) + 1; }
  return out;
};

test('the desert pyramid is registered, procedural, and gated on the desert', () => {
  assert.ok(generatorCoverage().implemented.includes('desert_pyramid'));
  assert.ok(GENERATORS.desertPyramid.realize);
  const engine = createStructureEngine({ seed: 1, blockIds: BLOCKS, ...desert });
  assert.deepEqual(engine.registry.desert_pyramid.biomes, ['desert']);
});

test('the template is the wiki blueprint: the materials table, exactly', () => {
  const template = new StructureTemplate(buildDesertPyramid({ seed: 5 }), 'pyramid');
  assert.equal(template.size[0], PYRAMID_BASE);
  assert.equal(template.size[2], PYRAMID_BASE);
  const n = counts(template);
  // /Structure, Materials: fixed counts.
  assert.deepEqual([n.cut_sandstone, n.chiseled_sandstone, n.orange_terracotta, n.blue_terracotta, n.sandstone_stairs, n.sandstone_slab, n.tnt, n.chest, n.stone_pressure_plate],
    [238, 62, 66, 2, 17, 2, 9, 4, 1]);
  // Sand 101-103 and sandstone "2885+" with 6-8 suspicious sand: the random blocks add up to the table's totals.
  assert.ok(n.suspicious_sand >= 6 && n.suspicious_sand <= 8, `${n.suspicious_sand} suspicious sand`);
  assert.equal(n.sand + n.sandstone + n.suspicious_sand, 8 + 2876 + 83 + 2 + 25, 'every placeholder became sand, sandstone or suspicious sand');
  for (const wool of ['red_wool', 'green_wool', 'blue_wool']) assert.equal(n[wool], undefined, `${wool} is a placeholder and never generates`);
});

test('the random blocks differ between pyramids, and stay within the page\'s rules', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const template = new StructureTemplate(buildDesertPyramid({ seed }), 'pyramid');
    const sus = template.blocks.filter((b) => template.palette[b.state].name === 'minecraft:suspicious_sand');
    assert.ok(sus.length >= 6 && sus.length <= 8);
    for (const b of sus) assert.equal(b.nbt?.LootTable, PYRAMID_ARCHAEOLOGY_LOOT);
    seen.add(sus.map((b) => b.pos.join(',')).sort().join(';'));
  }
  assert.ok(seen.size >= 15, 'suspicious sand lands in different places');
});

test('four chests with the desert pyramid table, the trap armed, the ground floor at the surface', () => {
  const start = generateDesertPyramid({ seed: 17, chunkX: 2, chunkZ: 2, context: desert });
  assert.equal(start.meta.groundFloorY, 40);
  assert.equal(start.meta.y + PYRAMID_BASE_Y, 40);
  const report = realizeDesertPyramid(start, () => true, BLOCKS);
  assert.deepEqual(report.missingBlocks, []);
  assert.deepEqual(report.chests, [PYRAMID_CHEST_LOOT, PYRAMID_CHEST_LOOT, PYRAMID_CHEST_LOOT, PYRAMID_CHEST_LOOT]);
  assert.equal(report.trap.armed, true);
  assert.equal(report.trap.tnt, 9);
});

test('every fact on the card passes, in flat and real-world mode', async () => {
  for (const [mode, seed] of [['flat', 20250401], ['world', 2024], ['world', 7]]) {
    const result = await auditStructure('desert_pyramid', { mode, seed });
    assert.deepEqual(result.rows.filter((r) => r.status === 'fail').map((r) => `${r.id}: ${r.detail}`), [], `${mode} ${seed}`);
    assert.equal(result.rows.find((r) => r.id === 'W1').status, 'pass');
  }
});

test('SENSITIVITY: the card fails a pyramid with the wrong materials, a moved plate or missing suspicious sand', async () => {
  const card = STRUCTURE_AUDIT_CARDS.desert_pyramid;
  const fact = (id) => card.facts.find((f) => f.id === id);
  const result = await auditStructure('desert_pyramid', { mode: 'flat', seed: 20250401 });
  const o = result.observation;
  const without = (pred) => ({ ...o, writes: o.writes.filter((w) => !pred(w)), count: (name) => o.writes.filter((w) => !pred(w) && w.name === name).length });
  assert.equal(fact('P3').check(without((w) => w.name === 'cut_sandstone' && w.x % 2 === 0)).ok, false, 'missing cut sandstone');
  assert.equal(fact('P7').check(without((w) => w.name === 'suspicious_sand')).ok, false, 'no suspicious sand');
  assert.equal(fact('P5').check(without((w) => w.name === 'tnt' && w.x % 2 === 0)).ok, false, 'TNT missing from the grid');
});

test('rotation varies, each box matches its rotation, and generation is deterministic', () => {
  const rotations = new Set();
  for (let chunkX = 0; chunkX < 60; chunkX++) {
    const candidate = generateDesertPyramid({ seed: 3, chunkX, chunkZ: 0, context: desert });
    rotations.add(candidate.pieces[0].rotation);
    const template = new StructureTemplate(buildDesertPyramid(candidate.pieces[0].meta.params), 'check');
    assert.deepEqual(candidate.pieces[0].box.toArray(), template.boundingBox(candidate.pieces[0].meta.origin, candidate.pieces[0].rotation).toArray());
  }
  assert.ok(rotations.size > 1);
  const first = generateDesertPyramid({ seed: 4242, chunkX: -3, chunkZ: 6, context: desert });
  const collect = () => { const out = []; realizeDesertPyramid(first, (x, y, z, id) => { out.push(`${x},${y},${z},${id}`); return true; }, BLOCKS); return out; };
  assert.deepEqual(collect(), collect());
  assert.ok(STRUCTURE_BLUEPRINTS.desert_pyramid.minLayer === -14);
});
