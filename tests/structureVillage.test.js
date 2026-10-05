// Village tests: five ids through one generator, and the first MULTI-DEPTH pool graph.
//
// The outpost graph was one level deep; a village chains streets into streets until `max_depth` stops it. That
// chaining is what deviation 0e blocked for four rounds, so the depth assertion here is the one that matters.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateVillage, realizeVillage, buildVillagePart, VILLAGE_BIOMES,
  VILLAGE_MAX_DEPTH, STREET_SLOT, HOUSE_SLOT
} from '../src/worldgen/generators/village.js';
import { createStructureEngine, GENERATORS, generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { BLOCKS } from '../src/blocks.js';

const VILLAGE_IDS = Object.keys(VILLAGE_BIOMES);
const PARTS = ['town_centre', 'street', 'house_small', 'house_large', 'farm', 'terminus'];
const contextFor = (biome) => ({ biomeAt: () => biome, surfaceY: () => 70 });

test('all five village ids are registered, gated on their own biome, and adapt to terrain', () => {
  const { implemented } = generatorCoverage();
  for (const id of VILLAGE_IDS) assert.ok(implemented.includes(id), id + ' has no generator');
  assert.ok(GENERATORS.village.realize);
  const engine = createStructureEngine({ seed: 1, blockIds: BLOCKS, ...contextFor('plains') });
  for (const id of VILLAGE_IDS) {
    const entry = engine.registry[id];
    assert.equal(entry.family, 'jigsaw');
    assert.equal(entry.terrainAdaptation, 'beard_thin', id + ' must bed into the terrain');
    assert.ok(entry.biomes.includes(VILLAGE_BIOMES[id].biome), id + ' is gated on the wrong biome');
  }
});

test('every part is well formed and uses only its own biome materials', () => {
  for (const [id, spec] of Object.entries(VILLAGE_BIOMES)) {
    for (const kind of PARTS) {
      const template = new StructureTemplate(buildVillagePart(kind, spec), id + '/' + kind);
      assert.ok(template.blockCount > 0, id + '/' + kind + ' has no blocks');
      for (const block of template.blocks) {
        const [x, y, z] = block.pos;
        const [sx, sy, sz] = template.size;
        assert.ok(x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz,
          id + '/' + kind + ': block ' + block.pos + ' is outside ' + template.size);
      }
      // A desert village built from oak planks would pass a block-count check and be obviously wrong.
      const allowed = new Set(['minecraft:air', 'minecraft:jigsaw', 'minecraft:chest', ...Object.values(spec)]);
      for (const entry of template.palette) {
        assert.ok(allowed.has(entry.name), id + '/' + kind + ' used ' + entry.name + ', which is not its material');
      }
      if (kind !== 'town_centre') assert.ok(template.jigsaws().length > 0, id + '/' + kind + ' offers no connector');
    }
  }
  assert.throws(() => buildVillagePart('not_a_part', VILLAGE_BIOMES.village_plains), /unknown village part/);
});

test('a village grows several levels deep through the street chain', () => {
  const start = generateVillage({ seed: 4242, chunkX: 0, chunkZ: 0, structureId: 'village_plains', context: contextFor('plains') });
  assert.ok(start.pieces.length > 3, 'expected a village, got ' + start.pieces.length + ' pieces');
  assert.equal(start.meta.connected, true, 'every piece must be reachable from the town centre');
  assert.equal(start.pieces[0].meta.element, 'town_centre', 'the town centre is the root');
  // THE assertion this structure exists to make: growth several levels deep, which the single-level outpost
  // never did and which deviation 0e blocked until the connector-instance fix.
  assert.ok(start.meta.maxDepth >= 2, 'expected multi-level growth, reached depth ' + start.meta.maxDepth);
  assert.ok(start.meta.maxDepth <= VILLAGE_MAX_DEPTH, 'depth exceeded the cap');
  assert.ok(start.meta.partMix.includes('street'));
  assert.ok(start.meta.partMix.some((part) => part === 'house_small' || part === 'house_large' || part === 'farm'));
  for (const piece of start.pieces) {
    for (const other of start.pieces) {
      if (piece === other) continue;
      assert.equal(piece.box.intersects(other.box), false, piece.meta.element + ' overlaps ' + other.meta.element);
    }
  }
});

test('streets chain at both ends, and a terminus closes the chain', () => {
  const spec = VILLAGE_BIOMES.village_plains;
  const street = new StructureTemplate(buildVillagePart('street', spec), 'street');
  const slots = street.jigsaws().map((jigsaw) => jigsaw.name);
  assert.equal(slots.filter((name) => name === STREET_SLOT).length, 2, 'a street needs the street slot at each end');
  assert.equal(slots.filter((name) => name === HOUSE_SLOT).length, 2, 'and a house slot on each side');
  // A terminus must NOT offer a street slot, or a village would be an endless line rather than stopping.
  const terminus = new StructureTemplate(buildVillagePart('terminus', spec), 'terminus');
  assert.equal(terminus.jigsaws().some((jigsaw) => jigsaw.pool === 'village/streets'), false);
  assert.equal(terminus.jigsaws().length, 1);
});

test('realization writes the village, keeps the chest loot per biome, and stays inside the piece boxes', () => {
  for (const id of VILLAGE_IDS) {
    const spec = VILLAGE_BIOMES[id];
    const start = generateVillage({ seed: 77, chunkX: 1, chunkZ: 1, structureId: id, context: contextFor(spec.biome) });
    const writes = [];
    const spawned = [];
    const report = realizeVillage(start, (x, y, z, blockId, meta) => { writes.push({ x, y, z, id: blockId, meta }); return true; }, BLOCKS, {
      spawnMob: (type) => { spawned.push(type); return true; }
    });
    assert.ok(report.written > 50, id + ' wrote only ' + report.written + ' blocks');
    assert.deepEqual(report.missingBlocks, [], id + ' could not resolve: ' + report.missingBlocks);
    for (const loot of report.chestLoot) assert.equal(loot, spec.loot, id + ' chest used ' + loot);
    assert.deepEqual(spawned, ['villager'], 'the town centre is marked with a villager');
    for (const write of writes) {
      assert.ok(start.pieces.some((piece) => piece.box.contains(write.x, write.y, write.z)),
        id + ': block ' + write.x + ',' + write.y + ',' + write.z + ' is outside every piece box');
    }
  }
});

test('the five villages differ in materials, not in their shape, and generation is deterministic', () => {
  const shapes = new Set();
  const materials = new Set();
  for (const id of VILLAGE_IDS) {
    const spec = VILLAGE_BIOMES[id];
    const start = generateVillage({ seed: 909, chunkX: 2, chunkZ: 2, structureId: id, context: contextFor(spec.biome) });
    shapes.add(start.pieces.map((piece) => piece.meta.element + ':' + piece.rotation).join('|'));
    const names = new Set();
    realizeVillage(start, (x, y, z, blockId, meta) => { if (meta?.state?.name) names.add(meta.state.name); return true; }, BLOCKS);
    materials.add([...names].sort().join(','));
  }
  assert.equal(shapes.size, 1, 'one generator serves all five ids, so the plans must match');
  assert.equal(materials.size, VILLAGE_IDS.length, 'but the materials must differ per biome');

  const first = generateVillage({ seed: 31337, chunkX: 3, chunkZ: -3, structureId: 'village_taiga', context: contextFor('taiga') });
  const again = generateVillage({ seed: 31337, chunkX: 3, chunkZ: -3, structureId: 'village_taiga', context: contextFor('taiga') });
  assert.deepEqual(first.pieces.map((piece) => piece.box.toArray()), again.pieces.map((piece) => piece.box.toArray()));
  assert.deepEqual(first.meta.partMix, again.meta.partMix);
});

test('the engine plans a village through the real placement path', () => {
  const engine = createStructureEngine({ seed: 31337, blockIds: BLOCKS, ...contextFor('plains') });
  let plan = null;
  for (let chunkX = 0; chunkX < 2000 && !plan; chunkX++) {
    const candidate = engine.planChunk(chunkX, 0);
    if (candidate && candidate.structureId.startsWith('village_')) plan = candidate;
  }
  assert.ok(plan, 'a village must be findable through the real placement path');
  let written = 0;
  engine.realize(plan.start, () => { written++; return true; }, { chunkX: plan.start.chunkX, chunkZ: plan.start.chunkZ });
  assert.ok(written > 0, 'the engine must realize the village it planned');
});
