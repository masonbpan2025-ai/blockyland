// Ocean ruin tests: the cluster rule, the two variants, and multi-piece realization.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateOceanRuin, realizeOceanRuin, buildOceanRuin, planCluster,
  LARGE_RUIN_CHANCE, CLUSTER_SIZE_RANGE, OCEAN_RUIN_VARIANTS
} from '../src/worldgen/generators/oceanRuin.js';
import { createStructureEngine, GENERATORS, generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { BLOCKS } from '../src/blocks.js';

const ocean = { biomeAt: () => 'ocean', surfaceY: () => 42 };

test('both ocean ruin ids are registered and gated on the right oceans', () => {
  const { implemented } = generatorCoverage();
  assert.ok(implemented.includes('ocean_ruin_cold'));
  assert.ok(implemented.includes('ocean_ruin_warm'));
  assert.ok(GENERATORS.oceanRuin.realize);
  const engine = createStructureEngine({ seed: 1, blockIds: BLOCKS, ...ocean });
  assert.ok(engine.registry.ocean_ruin_cold.biomes.includes('deep_cold_ocean'));
  assert.ok(engine.registry.ocean_ruin_warm.biomes.includes('warm_ocean'));
  assert.equal(engine.registry.ocean_ruin_warm.biomes.includes('deep_cold_ocean'), false,
    'the warm variant must not be gated on cold oceans');
});

test('thirty percent of ocean ruins are large clusters of four to eight', () => {
  let large = 0;
  const total = 500;
  for (let chunkX = 0; chunkX < total; chunkX++) {
    const plan = planCluster({ seed: 31337, chunkX, chunkZ: 0 });
    if (plan.large) {
      large++;
      assert.ok(plan.count >= CLUSTER_SIZE_RANGE[0] && plan.count <= CLUSTER_SIZE_RANGE[1],
        `a large cluster must hold 4..8 ruins, got ${plan.count}`);
      assert.equal(plan.offsets.length, plan.count);
    } else {
      // A small ruin is a single ruin, not a small cluster.
      assert.equal(plan.count, 1);
    }
  }
  const rate = large / total;
  assert.ok(rate > LARGE_RUIN_CHANCE - 0.07 && rate < LARGE_RUIN_CHANCE + 0.07,
    `expected roughly 30% large, measured ${(rate * 100).toFixed(1)}%`);
});

test('a cluster is planned deterministically and its ruins are spread out', () => {
  const first = generateOceanRuin({ seed: 5, chunkX: 9, chunkZ: -2, structureId: 'ocean_ruin_cold', context: ocean });
  const again = generateOceanRuin({ seed: 5, chunkX: 9, chunkZ: -2, structureId: 'ocean_ruin_cold', context: ocean });
  assert.equal(first.meta.ruinCount, again.meta.ruinCount);
  assert.deepEqual(first.pieces.map((piece) => piece.box.toArray()), again.pieces.map((piece) => piece.box.toArray()));
  assert.equal(first.pieces.length, first.meta.ruinCount, 'each ruin is its own piece, for chunk safety');

  // Large clusters must actually differ in position, or they would be 4-8 ruins in one spot.
  let sawSpread = false;
  for (let chunkX = 0; chunkX < 200 && !sawSpread; chunkX++) {
    const start = generateOceanRuin({ seed: 31337, chunkX, chunkZ: 0, structureId: 'ocean_ruin_cold', context: ocean });
    if (!start.meta.large) continue;
    const xs = new Set(start.pieces.map((piece) => piece.box.minX));
    if (xs.size > 1) sawSpread = true;
  }
  assert.ok(sawSpread, 'a large cluster must place its ruins at different positions');
});

test('every ruin variant builds inside its size and only from its own materials', () => {
  for (const variant of Object.keys(OCEAN_RUIN_VARIANTS)) {
    const spec = OCEAN_RUIN_VARIANTS[variant];
    for (let seed = 0; seed < 25; seed++) {
      const template = new StructureTemplate(buildOceanRuin({ variant, seed }), variant);
      for (const block of template.blocks) {
        const [x, y, z] = block.pos;
        const [sx, sy, sz] = template.size;
        assert.ok(x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz,
          `${variant} seed ${seed}: block ${block.pos} outside ${template.size}`);
      }
      // Every palette entry must come from the variant's own material set (or its accent/suspicious/coral).
      // Air is always present: the holes in a ruin are carved with it.
      const allowed = new Set(['minecraft:air', ...spec.blocks, spec.accent, spec.suspicious, ...spec.coral]);
      for (const entry of template.palette) {
        assert.ok(allowed.has(entry.name), `${variant} used ${entry.name}, which is not in its material set`);
      }
    }
  }
});

test('realization places the cluster, its suspicious blocks and its variant extras', () => {
  const written = [];
  const cold = generateOceanRuin({ seed: 11, chunkX: 3, chunkZ: 3, structureId: 'ocean_ruin_cold', context: ocean });
  const coldReport = realizeOceanRuin(cold, (x, y, z, id, meta) => { written.push({ x, y, z, id, meta }); return true; }, BLOCKS);

  assert.ok(coldReport.written > 0);
  assert.deepEqual(coldReport.missingBlocks, [], `unresolved: ${coldReport.missingBlocks}`);
  assert.equal(coldReport.pieces, cold.meta.ruinCount);
  // One suspicious block per ruin, each carrying the variant's archaeology table.
  assert.equal(coldReport.suspicious.length, cold.meta.ruinCount);
  for (const entry of coldReport.suspicious) {
    assert.equal(entry.lootTable, OCEAN_RUIN_VARIANTS.cold.archaeology);
    assert.match(entry.block, /suspicious/);
  }
  // Every block must land inside the box of the piece that owns it.
  for (const block of written) {
    const owner = cold.pieces.find((piece) => piece.box.contains(block.x, block.y, block.z));
    assert.ok(owner, `block ${block.x},${block.y},${block.z} is outside every piece box`);
  }

  // Warm ruins use sandstone and carry coral; cold ones must not.
  const warm = generateOceanRuin({ seed: 11, chunkX: 3, chunkZ: 3, structureId: 'ocean_ruin_warm', context: ocean });
  const warmNames = new Set();
  realizeOceanRuin(warm, (x, y, z, id, meta) => { warmNames.add(meta.state.name); return true; }, BLOCKS);
  assert.ok([...warmNames].some((name) => /coral|sea_pickle/.test(name)), 'a warm ruin carries coral');
  assert.ok([...warmNames].some((name) => /sandstone/.test(name)), 'a warm ruin is built of sandstone');
  assert.equal([...warmNames].some((name) => /cobblestone/.test(name)), false, 'and never of cobblestone');
});

test('a realization is deterministic and reports nothing unresolved', () => {
  const start = generateOceanRuin({ seed: 99, chunkX: -4, chunkZ: 7, structureId: 'ocean_ruin_warm', context: ocean });
  const collect = () => {
    const out = [];
    realizeOceanRuin(start, (x, y, z, id) => { out.push(`${x},${y},${z},${id}`); return true; }, BLOCKS);
    return out;
  };
  assert.deepEqual(collect(), collect());
  assert.deepEqual(realizeOceanRuin(start, () => true, BLOCKS).missingBlocks, []);
});
