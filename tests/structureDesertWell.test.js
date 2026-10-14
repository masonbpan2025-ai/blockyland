// Desert well: the wiki's blueprint, with the suspicious sand placed as /Structure describes. Card DW1-DW3 + W1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDesertWell, DESERT_WELL_LOOT } from '../src/worldgen/generators/desertWell.js';
import { generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { STRUCTURE_AUDIT_CARDS } from '../src/structureAuditCards.js';

const counts = (template) => {
  const out = {};
  for (const block of template.blocks) { const n = template.palette[block.state].name.replace('minecraft:', ''); out[n] = (out[n] ?? 0) + 1; }
  return out;
};

test('the desert well is registered as an implemented desert feature', () => {
  assert.ok(generatorCoverage().implemented.includes('desert_well'));
});

test('every seed gives the materials table, with the suspicious sand moving about', () => {
  const spots = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const template = new StructureTemplate(buildDesertWell({ seed }), 'well');
    const n = counts(template);
    assert.deepEqual([n.sandstone, n.sand, n.sandstone_slab, n.water, n.suspicious_sand], [89, 4, 12, 5, 2]);
    for (const b of template.blocks.filter((b) => template.palette[b.state].name === 'minecraft:suspicious_sand')) {
      assert.equal(b.nbt.LootTable, DESERT_WELL_LOOT);
      spots.add(b.pos.join());
    }
  }
  assert.ok(spots.size > 2, 'the suspicious sand is not always in the same place');
});

test('the card notices a well with the wrong materials', () => {
  const dw2 = STRUCTURE_AUDIT_CARDS.desert_well.facts.find((f) => f.id === 'DW2');
  const writes = [...Array(89)].map(() => ({ name: 'sandstone' }));
  assert.equal(dw2.check({ writes }).ok, false);
});
