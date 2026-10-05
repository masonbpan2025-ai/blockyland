// Nether fossil tests: a structure whose INTERESTING property is what it does NOT do.
//
// The wiki is explicit that nether fossils "do not have a lowered structure integrity and no blocks are
// replaced with coal or diamond ore", unlike the overworld fossil. So the tests here assert the absence of
// block_rot and of an ore overlay, because copying the overworld behaviour is the obvious mistake.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateNetherFossil, realizeNetherFossil, buildNetherFossil,
  NETHER_FOSSIL_VARIANTS, NETHER_FOSSIL_SIZE_RANGE, NETHER_FOSSIL_Y_RANGE
} from '../src/worldgen/generators/netherFossil.js';
import { createStructureEngine, GENERATORS, generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { BLOCKS } from '../src/blocks.js';
import { createBlockIdResolver } from '../src/worldgen/blockIds.js';

const valley = { biomeAt: () => 'soul_sand_valley', surfaceY: () => 40 };

test('the nether fossil is registered in the nether, gated on soul sand valley only', () => {
  assert.ok(generatorCoverage().implemented.includes('nether_fossil'));
  assert.ok(GENERATORS.netherFossil.realize);
  const engine = createStructureEngine({ seed: 1, dimension: 'nether', blockIds: BLOCKS, ...valley });
  const entry = engine.registry.nether_fossil;
  assert.equal(entry.dimension, 'nether');
  assert.deepEqual(entry.biomes, ['soul_sand_valley']);
  assert.equal(entry.step, 'underground_structures');
});

test('every one of the fourteen variants is reachable and grows with its index', () => {
  const seen = new Set();
  for (let chunkX = 0; chunkX < 400; chunkX++) {
    const start = generateNetherFossil({ seed: 88, chunkX, chunkZ: 0, context: valley });
    seen.add(start.meta.variant);
  }
  for (let variant = 1; variant <= NETHER_FOSSIL_VARIANTS; variant++) {
    assert.ok(seen.has(variant), `variant ${variant} never generated in 400 chunks`);
  }

  // Variants step through the documented bone-block range rather than all being a similar size.
  const smallest = new StructureTemplate(buildNetherFossil({ variant: 1 }), 'small');
  const largest = new StructureTemplate(buildNetherFossil({ variant: NETHER_FOSSIL_VARIANTS }), 'large');
  assert.ok(smallest.blockCount < largest.blockCount,
    `variant 1 has ${smallest.blockCount} blocks and variant 14 has ${largest.blockCount}`);
  assert.ok(smallest.blockCount >= NETHER_FOSSIL_SIZE_RANGE[0] - 2, 'variant 1 must be near the documented minimum');
  assert.ok(largest.blockCount >= 20, `variant 14 should be a large fossil, got ${largest.blockCount} blocks`);
  // Out-of-range variants clamp rather than throwing, which is what a data-driven caller needs.
  assert.equal(buildNetherFossil({ variant: 99 }).meta.variant, NETHER_FOSSIL_VARIANTS);
  assert.equal(buildNetherFossil({ variant: 0 }).meta.variant, 1);
});

test('the Y comes from the documented band and is not a constant', () => {
  const [minY, maxY] = NETHER_FOSSIL_Y_RANGE;
  const ys = new Set();
  for (let chunkX = 0; chunkX < 300; chunkX++) {
    const start = generateNetherFossil({ seed: 5, chunkX, chunkZ: 0, context: valley });
    assert.ok(start.meta.y >= minY && start.meta.y <= maxY, `Y ${start.meta.y} outside the band`);
    ys.add(start.meta.y);
  }
  assert.ok(ys.size > 10, `expected a spread of Y values, saw ${ys.size}`);
});

test('no processor runs: no integrity loss and no ore overlay', () => {
  // This is the documented difference from the overworld fossil, so it is asserted rather than assumed.
  const start = generateNetherFossil({ seed: 9, chunkX: 3, chunkZ: -4, context: valley });
  const written = [];
  const report = realizeNetherFossil(start, (x, y, z, id) => { written.push(id); return true; }, BLOCKS);

  assert.deepEqual(report.processorTypes, [], 'a nether fossil must run no processors at all');
  assert.deepEqual(report.requirements, []);
  assert.deepEqual(report.missingBlocks, []);
  assert.equal(written.length, report.written, 'nothing may be dropped, which is what integrity loss would do');

  const boneId = createBlockIdResolver(BLOCKS).resolve('minecraft:bone_block');
  assert.notEqual(boneId, null, 'the fossil is made of bone blocks, so they must resolve');
  assert.ok(written.every((id) => id === boneId), 'every block of a nether fossil is a bone block');
});

test('a placed fossil stays inside the box its piece advertises', () => {
  const start = generateNetherFossil({ seed: 13, chunkX: 5, chunkZ: 6, context: valley });
  const piece = start.pieces[0];
  const written = [];
  realizeNetherFossil(start, (x, y, z, id) => { written.push({ x, y, z }); return true; }, BLOCKS);
  assert.ok(written.length > 0);
  for (const block of written) {
    assert.ok(piece.box.contains(block.x, block.y, block.z),
      `block ${block.x},${block.y},${block.z} is outside the piece box ${piece.box}`);
  }
});

test('generation is deterministic, and rotation is applied', () => {
  const first = generateNetherFossil({ seed: 4242, chunkX: 7, chunkZ: 7, context: valley });
  const again = generateNetherFossil({ seed: 4242, chunkX: 7, chunkZ: 7, context: valley });
  assert.deepEqual(first.box.toArray(), again.box.toArray());
  assert.equal(first.pieces[0].rotation, again.pieces[0].rotation);
  assert.equal(first.meta.variant, again.meta.variant);

  const rotations = new Set();
  for (let chunkX = 0; chunkX < 200; chunkX++) {
    const start = generateNetherFossil({ seed: 3, chunkX, chunkZ: 0, context: valley });
    rotations.add(start.pieces[0].rotation);
    // The box must be the template's box transformed by its own rotation, or the plan lies about its extent.
    const template = new StructureTemplate(buildNetherFossil(start.pieces[0].meta.params), 'check');
    assert.deepEqual(start.pieces[0].box.toArray(),
      template.boundingBox(start.pieces[0].meta.origin, start.pieces[0].rotation).toArray());
  }
  assert.ok(rotations.size > 1, `expected the rotation roll to vary, saw ${[...rotations]}`);
});

test('realization is deterministic, and block ids all resolve', () => {
  const start = generateNetherFossil({ seed: 21, chunkX: 2, chunkZ: 2, context: valley });
  const collect = () => {
    const out = [];
    realizeNetherFossil(start, (x, y, z, id) => { out.push(`${x},${y},${z},${id}`); return true; }, BLOCKS);
    return out;
  };
  assert.deepEqual(collect(), collect());
  assert.deepEqual(realizeNetherFossil(start, () => true, BLOCKS).missingBlocks, []);
});

test('the engine plans a fossil in the nether through the real placement path', () => {
  const engine = createStructureEngine({ seed: 777, dimension: 'nether', blockIds: BLOCKS, ...valley });
  assert.ok(engine.sets.has('nether_fossils'), 'the nether fossil set must be present in the nether');
  assert.equal(engine.sets.has('buried_treasures'), false, 'an overworld set must not leak into the nether');

  let plan = null;
  for (let chunkX = 0; chunkX < 400 && !plan; chunkX++) {
    const candidate = engine.planChunk(chunkX, 0);
    if (candidate && candidate.structureId === 'nether_fossil') plan = candidate;
  }
  assert.ok(plan, 'spacing 2 must yield a fossil quickly');
  assert.equal(plan.set, 'nether_fossils');
  let written = 0;
  engine.realize(plan.start, () => { written++; return true; }, { chunkX: plan.start.chunkX, chunkZ: plan.start.chunkZ });
  assert.ok(written > 0, 'the engine must be able to realize the fossil it planned');
});
