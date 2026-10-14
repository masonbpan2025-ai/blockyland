// Village engine tests: five village types through one generator and the multi-depth jigsaw pool graph.
//
// The wiki parity of what is built lives in tests/villageWiki.test.js; this file checks the engine side: every
// element is a well-formed template with a connector, the street graph grows several levels deep without overlaps,
// realization stays inside its piece boxes, and generation is deterministic.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateVillage, realizeVillage, buildVillagePart, villageElement, VILLAGE_BIOMES, VILLAGE_MAX_DEPTH, STREET_SLOT, HOUSE_SLOT
} from '../src/worldgen/generators/village.js';
import { CATALOGUE, houseEntries } from '../src/worldgen/generators/villageCatalogue.js';
import { VILLAGE_TYPES, STYLES } from '../src/worldgen/generators/villageStyles.js';
import { createStructureEngine, GENERATORS, generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { BLOCKS } from '../src/blocks.js';

const VILLAGE_IDS = Object.keys(VILLAGE_BIOMES);
const contextFor = (biome) => ({ biomeAt: () => biome, surfaceY: () => 70 });
const elementNames = (type) => ['street', 'terminus', ...CATALOGUE[type].meetings.map((m) => m.name),
  ...houseEntries(type).map((e) => e.name), ...(CATALOGUE[type].lamps ?? [CATALOGUE[type].lamp]).map((l) => l.name)];

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

test('every element of every type is well formed, inside its declared size, with exactly the connectors it needs', () => {
  for (const type of VILLAGE_TYPES) {
    for (const name of elementNames(type)) {
      const template = new StructureTemplate(buildVillagePart(type, name), type + '/' + name);
      assert.ok(template.blockCount > 0, `${type}/${name} has no blocks`);
      const [sx, sy, sz] = template.size;
      for (const block of template.blocks) {
        const [x, y, z] = block.pos;
        assert.ok(x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz, `${type}/${name}: block ${block.pos} outside ${template.size}`);
      }
      const jigsaws = template.jigsaws();
      const role = villageElement(type, name).role;
      if (role === 'meeting') assert.equal(jigsaws.filter((j) => j.name === STREET_SLOT).length, 4, `${name}: a street leaves each side`);
      else if (role === 'street') assert.deepEqual(jigsaws.map((j) => j.name).sort(), [HOUSE_SLOT, HOUSE_SLOT, STREET_SLOT, STREET_SLOT]);
      else if (role === 'terminus') assert.deepEqual(jigsaws.map((j) => j.pool), ['minecraft:empty'], 'a terminus offers no street onward');
      else assert.deepEqual(jigsaws.map((j) => j.name), [HOUSE_SLOT], `${type}/${name}: one connector to its street`);
    }
  }
  assert.throws(() => buildVillagePart('plains', 'not_a_part'), /Cannot read|undefined|no plains element/);
});

test('a village grows several levels deep through the street chain, with no two pieces overlapping', () => {
  for (const type of VILLAGE_TYPES) {
    const start = generateVillage({ seed: 4242, chunkX: 0, chunkZ: 0, structureId: 'village_' + type, context: contextFor(STYLES[type].biome) });
    assert.ok(start.pieces.length >= 10, `${type}: ${start.pieces.length} pieces`);
    assert.equal(start.meta.connected, true, 'every piece is reachable from the meeting point');
    assert.equal(villageElement(type, start.pieces[0].meta.element).role, 'meeting', 'the meeting point is the root');
    assert.ok(start.meta.maxDepth >= 2 && start.meta.maxDepth <= VILLAGE_MAX_DEPTH, `${type}: depth ${start.meta.maxDepth}`);
    assert.ok(start.meta.partMix.includes('street'));
    for (const piece of start.pieces) for (const other of start.pieces) {
      if (piece !== other) assert.equal(piece.box.intersects(other.box), false, `${piece.meta.element} overlaps ${other.meta.element}`);
    }
  }
});

test('the meeting point is drawn at random from the type\'s list, and rotated', () => {
  for (const type of VILLAGE_TYPES) {
    const meetings = new Set();
    const rotations = new Set();
    for (let seed = 1; seed <= 40; seed++) {
      const start = generateVillage({ seed, chunkX: seed * 3, chunkZ: -seed * 7, structureId: 'village_' + type, context: contextFor(STYLES[type].biome) });
      meetings.add(start.meta.meetingPoint.replace(/^zombie\//, ''));
      rotations.add(start.pieces[0].rotation);
    }
    assert.equal(meetings.size, CATALOGUE[type].meetings.length, `${type}: every meeting point appears (${[...meetings]})`);
    assert.ok(rotations.size >= 3, `${type}: meeting points face different ways`);
  }
});

test('realization stays inside the piece boxes, resolves every block, and gives chests their tables', () => {
  for (const id of VILLAGE_IDS) {
    const spec = VILLAGE_BIOMES[id];
    const start = generateVillage({ seed: 77, chunkX: 1, chunkZ: 1, structureId: id, context: contextFor(spec.biome) });
    const writes = [];
    const report = realizeVillage(start, (x, y, z, blockId) => { writes.push({ x, y, z, id: blockId }); return true; }, BLOCKS);
    assert.ok(report.written > 500, id + ' wrote only ' + report.written + ' blocks');
    assert.deepEqual(report.missingBlocks, [], id + ' could not resolve: ' + report.missingBlocks);
    for (const loot of report.chestLoot) assert.match(loot, /^minecraft:chests\/village\/village_/);
    for (const write of writes) {
      assert.ok(start.pieces.some((piece) => piece.box.contains(write.x, write.y, write.z)), `${id}: ${write.x},${write.y},${write.z} outside every piece`);
    }
  }
});

test('the five types build different villages, and generation is deterministic', () => {
  const plans = new Set();
  const materials = new Set();
  for (const id of VILLAGE_IDS) {
    const start = generateVillage({ seed: 909, chunkX: 2, chunkZ: 2, structureId: id, context: contextFor(VILLAGE_BIOMES[id].biome) });
    plans.add(start.meta.partMix.join('|'));
    const names = new Set();
    realizeVillage(start, (x, y, z, blockId, meta) => { if (meta?.state?.name) names.add(meta.state.name); return true; }, BLOCKS);
    materials.add([...names].sort().join(','));
  }
  // Each type draws from its own building list (the wiki), so the plans differ as well as the materials.
  assert.equal(plans.size, VILLAGE_IDS.length);
  assert.equal(materials.size, VILLAGE_IDS.length);
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
