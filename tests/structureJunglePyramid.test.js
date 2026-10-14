// Jungle pyramid: the wiki's /Structure blueprint block for block, with its Blueprint table's facings. The full fact
// card (J1-J6 + W1) is in src/structureAuditCards.js and runs in tests/structureWikiCards.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateJunglePyramid, realizeJunglePyramid, buildJunglePyramid, JUNGLE_MATERIALS, JUNGLE_CHEST_LOOT, JUNGLE_DISPENSER_LOOT, JUNGLE_GROUND
} from '../src/worldgen/generators/junglePyramid.js';
import { createStructureEngine, GENERATORS, generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { STRUCTURE_AUDIT_CARDS } from '../src/structureAuditCards.js';
import { BLOCKS } from '../src/blocks.js';

const jungle = { biomeAt: () => 'jungle', surfaceY: () => 70 };
const counts = (template) => {
  const out = {};
  for (const block of template.blocks) { const n = template.palette[block.state].name.replace('minecraft:', ''); out[n] = (out[n] ?? 0) + 1; }
  return out;
};

test('the jungle pyramid is registered in jungles and bamboo jungles', () => {
  assert.ok(generatorCoverage().implemented.includes('jungle_pyramid'));
  assert.ok(GENERATORS.junglePyramid.realize);
  const engine = createStructureEngine({ seed: 1, blockIds: BLOCKS, ...jungle });
  assert.deepEqual([...engine.registry.jungle_pyramid.biomes].sort(), ['bamboo_jungle', 'jungle']);
});

test('the template is the materials table, exactly, with a different cobblestone mix per pyramid', () => {
  const mixes = new Set();
  for (let seed = 1; seed <= 8; seed++) {
    const n = counts(new StructureTemplate(buildJunglePyramid({ seed }), 'pyramid'));
    const { cobblestone, ...fixed } = JUNGLE_MATERIALS;
    for (const [name, count] of Object.entries(fixed)) assert.equal(n[name], count, `${name}`);
    assert.equal(n.cobblestone + n.mossy_cobblestone, cobblestone);
    for (const placeholder of ['trapped_chest', 'piston', 'redstone_dust', 'vines', 'redstone_repeater']) assert.equal(n[placeholder], undefined, placeholder);
    mixes.add(n.mossy_cobblestone);
  }
  assert.ok(mixes.size > 1, 'the mossy cobblestone is not the same on every pyramid');
});

test('the Blueprint table facings: chests, stairs and the piston that faces up', () => {
  const template = new StructureTemplate(buildJunglePyramid({ seed: 3 }), 'pyramid');
  const of = (name) => template.blocks.filter((b) => template.palette[b.state].name === `minecraft:${name}`).map((b) => ({ pos: b.pos, ...template.palette[b.state].properties, nbt: b.nbt }));
  assert.deepEqual(of('chest').map((c) => c.facing).sort(), ['east', 'north']);
  for (const c of of('chest')) assert.equal(c.nbt.LootTable, JUNGLE_CHEST_LOOT);
  for (const d of of('dispenser')) assert.equal(d.nbt.LootTable, JUNGLE_DISPENSER_LOOT);
  assert.deepEqual(of('sticky_piston').map((p) => p.facing).sort(), ['north', 'north', 'up']);
  const stairs = of('cobblestone_stairs');
  const byFacing = (f) => stairs.filter((s) => s.facing === f).length;
  assert.deepEqual([byFacing('east'), byFacing('west'), byFacing('north'), byFacing('south')], [10, 12, 1, 1]);
  // Layer 5 (the roof landing): "10x 5y North", "10x 8y South".
  const landing = stairs.filter((s) => s.pos[1] === JUNGLE_GROUND + 5);
  assert.deepEqual(landing.map((s) => `${s.pos[2]}:${s.facing}`).sort(), ['4:north', '7:south']);
});

test('the ground layer sits on the surface, and realization is deterministic and complete', () => {
  const start = generateJunglePyramid({ seed: 8, chunkX: 5, chunkZ: 1, structureId: 'jungle_pyramid', context: jungle });
  assert.equal(start.meta.y + JUNGLE_GROUND, 70);
  const collect = () => { const out = []; realizeJunglePyramid(start, (x, y, z, id) => { out.push(`${x},${y},${z},${id}`); return true; }, BLOCKS); return out; };
  assert.deepEqual(collect(), collect());
  const report = realizeJunglePyramid(start, () => true, BLOCKS);
  assert.deepEqual(report.missingBlocks, []);
  assert.deepEqual(report.chests.sort(), [JUNGLE_CHEST_LOOT, JUNGLE_CHEST_LOOT, JUNGLE_DISPENSER_LOOT, JUNGLE_DISPENSER_LOOT].sort());
});

test('the card notices a pyramid whose dispensers do not face their vines', () => {
  const j4 = STRUCTURE_AUDIT_CARDS.jungle_pyramid.facts.find((f) => f.id === 'J4');
  const writes = [
    { name: 'dispenser', x: 0, y: 0, z: 0, props: { facing: 'east' }, lootTable: JUNGLE_DISPENSER_LOOT },
    { name: 'dispenser', x: 5, y: 0, z: 0, props: { facing: 'west' }, lootTable: JUNGLE_DISPENSER_LOOT },
    { name: 'vine', x: 0, y: 0, z: 1 }, { name: 'vine', x: 4, y: 0, z: 0 }
  ];
  assert.equal(j4.check({ writes }).ok, false);
});
