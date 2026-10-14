// Pillager outpost: the wiki's watchtower and feature blueprints on the jigsaw engine. The fact card (O1-O7 + W1) is
// in src/structureAuditCards.js.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generatePillagerOutpost, realizePillagerOutpost, buildOutpostPart, createOutpostPools, OUTPOST_POOLS, FEATURES,
  MAX_FEATURES, OUTPOST_PILLAGERS
} from '../src/worldgen/generators/pillagerOutpost.js';
import { createStructureEngine, GENERATORS, generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { BlockBox } from '../src/worldgen/geometry.js';
import { auditStructure } from '../src/structureAudit.js';
import { STRUCTURE_AUDIT_CARDS } from '../src/structureAuditCards.js';
import { BLOCKS } from '../src/blocks.js';

const plains = { biomeAt: () => 'plains', surfaceY: () => 40 };
const counts = (data) => {
  const out = {};
  for (const b of data.blocks) { const n = data.palette[b.state].Name.replace('minecraft:', ''); out[n] = (out[n] ?? 0) + 1; }
  return out;
};

test('the outpost is registered as a jigsaw structure with a tower pool and a 1-in-13 feature pool', () => {
  assert.ok(generatorCoverage().implemented.includes('pillager_outpost'));
  assert.ok(GENERATORS.pillagerOutpost.realize);
  const pools = createOutpostPools();
  assert.equal(pools.resolve(OUTPOST_POOLS.tower).elements.length, 1);
  const features = pools.resolve(OUTPOST_POOLS.features);
  assert.equal(features.elements.reduce((s, e) => s + e.weight, 0), 13);
  assert.deepEqual(features.elements.filter((e) => !e.isEmpty).map((e) => e.name).sort(), Object.keys(FEATURES).sort());
});

test('the watchtower is the wiki blueprint (its materials table), with 15 feature connectors', () => {
  const tower = buildOutpostPart('watchtower');
  const n = counts(tower);
  assert.deepEqual([n.dark_oak_log, n.birch_planks, n.dark_oak_fence, n.dark_oak_slab, n.cobblestone_stairs, n.dark_oak_stairs, n.cobblestone_wall, n.cobblestone_slab, n.white_wall_banner, n.chest],
    [144, 244, 48, 45, 33, 16, 8, 4, 8, 1]);
  assert.equal((n.torch ?? 0) + (n.wall_torch ?? 0), 4);
  // Where the drawing and the table differ, the drawing is followed (pinned so a wiki edit shows up here).
  assert.equal(n.dark_oak_planks, 393, 'the table says 347');
  assert.equal(n.cobblestone, 208, 'the table says 207');
  assert.equal(new StructureTemplate(tower, 'tower').jigsaws().length, 15);
  assert.equal(tower.entities.length, OUTPOST_PILLAGERS);
  assert.equal(tower.entities.filter((e) => e.nbt.patrolLeader).length, 1);
});

test('every feature is its blueprint, well formed, with one connector; cages hold their mobs', () => {
  const want = {
    feature_cage: { dark_oak_log: 12, dark_oak_fence: 24, dark_oak_slab: 4, dark_oak_stairs: 8 },
    feature_cage_allay: { dark_oak_log: 12, dark_oak_fence: 28, dark_oak_slab: 4, dark_oak_stairs: 8 },
    feature_logs: { dark_oak_log: 21 }
  };
  for (const name of Object.keys(FEATURES)) {
    const data = buildOutpostPart(name);
    const template = new StructureTemplate(data, name);
    assert.equal(template.jigsaws().length, 1, name);
    for (const b of template.blocks) {
      const [x, y, z] = b.pos;
      assert.ok(x >= 0 && y >= 0 && z >= 0 && x < template.size[0] && y < template.size[1] && z < template.size[2], `${name}: ${b.pos}`);
    }
    if (want[name]) { const n = counts(data); for (const [block, c] of Object.entries(want[name])) assert.equal(n[block], c, `${name} ${block}`); }
  }
  assert.deepEqual(buildOutpostPart('feature_cage').entities.map((e) => e.nbt.type), ['iron_golem']);
  assert.deepEqual(buildOutpostPart('feature_cage_allay').entities.map((e) => e.nbt.type), ['allay', 'allay']);
  assert.throws(() => buildOutpostPart('base_plate'), /unknown pillager outpost part/);
});

test('a tower always, at most four features, none overlapping', () => {
  const featureCounts = new Set();
  for (let seed = 1; seed <= 80; seed++) {
    const start = generatePillagerOutpost({ seed, chunkX: seed * 5, chunkZ: -seed, context: plains });
    assert.equal(start.meta.partMix[0], 'watchtower');
    assert.ok(start.meta.features <= MAX_FEATURES);
    featureCounts.add(start.meta.features);
    for (const a of start.pieces) for (const b of start.pieces) if (a !== b) assert.equal(a.box.intersects(b.box), false);
  }
  assert.ok(featureCounts.size >= 2, `feature counts vary: ${[...featureCounts]}`);
});

test('realization writes every piece, resolves every block, spawns once per mob even chunk by chunk', () => {
  const start = generatePillagerOutpost({ seed: 9, chunkX: 4, chunkZ: 4, context: plains });
  const whole = realizePillagerOutpost(start, () => true, BLOCKS);
  assert.deepEqual(whole.missingBlocks, []);
  assert.equal(whole.spawned.filter((s) => s.type === 'pillager').length, 8);
  const perChunk = [];
  for (let cx = Math.floor(start.box.minX / 16); cx <= Math.floor(start.box.maxX / 16); cx++) {
    for (let cz = Math.floor(start.box.minZ / 16); cz <= Math.floor(start.box.maxZ / 16); cz++) {
      realizePillagerOutpost(start, () => true, BLOCKS, { clip: BlockBox.columnOfChunk(cx, cz, -64, 320), spawnMob: (t, x, y, z) => perChunk.push(`${t}@${x},${y},${z}`) });
    }
  }
  assert.equal(perChunk.length, whole.spawned.length);
  assert.equal(new Set(perChunk).size, perChunk.length);
});

test('every fact on the card passes, in flat and real-world mode', async () => {
  for (const [mode, seed] of [['flat', 20250401], ['world', 2024], ['world', 7]]) {
    const result = await auditStructure('pillager_outpost', { mode, seed });
    assert.deepEqual(result.rows.filter((r) => r.status === 'fail').map((r) => `${r.id}: ${r.detail}`), [], `${mode} ${seed}`);
  }
});

test('SENSITIVITY: a missing captain, a missing caged golem or an extra feature fail the card', async () => {
  const card = STRUCTURE_AUDIT_CARDS.pillager_outpost;
  const fact = (id) => card.facts.find((f) => f.id === id);
  const o = (await auditStructure('pillager_outpost', { mode: 'flat', seed: 20250401 })).observation;
  const noCaptain = { ...o, spawnsOf: (t) => o.spawnsOf(t).map((s) => ({ ...s, options: { ...s.options, patrolLeader: false } })) };
  assert.equal(fact('O6').check(noCaptain).ok, false);
  const extraCage = { ...o, start: { ...o.start, meta: { ...o.start.meta, partMix: [...o.start.meta.partMix, 'feature_cage'] } } };
  assert.equal(fact('O5').check(extraCage).ok, false);
  assert.equal((await fact('O3').check({ ...extraCage, start: { ...o.start, meta: { ...o.start.meta, partMix: ['watchtower', 'a', 'b', 'c', 'd', 'e'] } } })).ok, false);
});

test('generation is deterministic and the engine plans an outpost through the real placement path', () => {
  const a = generatePillagerOutpost({ seed: 31, chunkX: 2, chunkZ: 7, context: plains });
  const b = generatePillagerOutpost({ seed: 31, chunkX: 2, chunkZ: 7, context: plains });
  assert.deepEqual(a.pieces.map((p) => p.box.toArray()), b.pieces.map((p) => p.box.toArray()));
  const engine = createStructureEngine({ seed: 31337, blockIds: BLOCKS, ...plains });
  let plan = null;
  for (let chunkX = 0; chunkX < 3000 && !plan; chunkX++) {
    const candidate = engine.planChunk(chunkX, 0);
    if (candidate?.structureId === 'pillager_outpost') plan = candidate;
  }
  assert.ok(plan);
});
