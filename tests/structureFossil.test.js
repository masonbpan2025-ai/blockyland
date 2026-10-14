// Fossils: the eight drawings, the 1-in-64 attempts, bone and ore integrity, buried. Card F1-F4 + W1 runs in
// tests/structureWikiCards.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFossil, generateFossil, realizeFossil, FOSSIL_DESIGNS } from '../src/worldgen/generators/fossil.js';
import { BLUEPRINTS } from '../src/worldgen/generators/blueprints/fossil.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { BLOCKS } from '../src/blocks.js';

test('the drawings match the materials column (the en-dash layer range is read)', () => {
  const want = { skull_1: 86, skull_2: 75, skull_3: 58, skull_4: 32, spine_1: 37, spine_2: 61, spine_3: 97, spine_4: 121 };
  for (const d of FOSSIL_DESIGNS) assert.equal(BLUEPRINTS[d].blocks.split(';').filter(Boolean).length, want[d], d);
});

test('bone at 0.9, ore at 0.1; coal above, deepslate diamond below', () => {
  let drawn = 0; let placed = 0; let ore = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const t = new StructureTemplate(buildFossil({ design: 'spine_4', seed }), 'f');
    drawn += 121; placed += t.blocks.length;
    ore += t.blocks.filter((b) => t.palette[b.state].name === 'minecraft:coal_ore').length;
  }
  assert.ok(Math.abs(placed / drawn - 0.91) < 0.03, `${placed}/${drawn}`);
  assert.ok(Math.abs(ore / drawn - 0.1) < 0.03, `${ore} ore`);
  const deep = new StructureTemplate(buildFossil({ design: 'skull_1', deep: true, seed: 3 }), 'f');
  assert.ok(deep.palette.some((p) => p.name === 'minecraft:deepslate_diamond_ore'));
  assert.ok(!deep.palette.some((p) => p.name === 'minecraft:coal_ore'));
});

test('about 2 in 64 chunks have one; buried below the ground; every block resolves', () => {
  const ctx = { biomeAt: () => 'desert', surfaceY: () => 40 };
  let found = 0;
  for (let i = 0; i < 3200; i++) {
    const s = generateFossil({ seed: 8, chunkX: i, chunkZ: 3, structureId: 'fossil', context: ctx });
    if (!s) continue;
    found++;
    assert.ok(s.box.maxY < 40);
    assert.deepEqual(realizeFossil(s, () => true, BLOCKS).missingBlocks, []);
  }
  assert.ok(found / 3200 > 0.022 && found / 3200 < 0.04, `${found} of 3200`);
});
