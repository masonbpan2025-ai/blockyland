// Shipwreck tests: orientations, decay through block_rot, and the chest rule.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateShipwreck, realizeShipwreck, buildShipwreck, HULL_ORIENTATIONS, SHIPWRECK_CHESTS
} from '../src/worldgen/generators/shipwreck.js';
import { createStructureEngine, GENERATORS, generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { BLOCKS } from '../src/blocks.js';
import { createBlockIdResolver } from '../src/worldgen/blockIds.js';

const ocean = { biomeAt: () => 'ocean', surfaceY: (x, z, map) => (map === 'ocean_floor_wg' ? 40 : 62) };

test('both shipwreck ids are registered and gated on the right biomes', () => {
  const { implemented } = generatorCoverage();
  assert.ok(implemented.includes('shipwreck'));
  assert.ok(implemented.includes('shipwreck_beached'));
  assert.ok(GENERATORS.shipwreck.realize);
  const engine = createStructureEngine({ seed: 1, blockIds: BLOCKS, ...ocean });
  assert.deepEqual(engine.registry.shipwreck_beached.biomes, ['beach', 'snowy_beach']);
  assert.ok(engine.registry.shipwreck.biomes.includes('deep_ocean'));
});

test('all three orientations are reachable and every block stays inside the declared size', () => {
  const seen = new Set();
  for (let chunkX = 0; chunkX < 200; chunkX++) {
    seen.add(generateShipwreck({ seed: 4, chunkX, chunkZ: 0, structureId: 'shipwreck', context: ocean }).meta.orientation);
  }
  for (const orientation of HULL_ORIENTATIONS) {
    assert.ok(seen.has(orientation), `orientation ${orientation} never generated`);
    const json = buildShipwreck({ orientation, mast: true, length: 12 });
    const template = new StructureTemplate(json, orientation);
    for (const block of template.blocks) {
      const [x, y, z] = block.pos;
      const [sx, sy, sz] = template.size;
      assert.ok(x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz,
        `${orientation}: block ${block.pos} outside ${template.size}`);
    }
    // Sideways swaps the horizontal axis with the vertical, so its height must be the hull's width.
    if (orientation === 'sideways') assert.equal(template.size[2] > template.size[1], true,
      'a sideways hull must be taller along Z than its beam');
  }
});

test('a degraded wreck runs block_rot, and an intact one does not', () => {
  const find = (decayed) => {
    for (let chunkX = 0; chunkX < 400; chunkX++) {
      const start = generateShipwreck({ seed: 31, chunkX, chunkZ: 0, structureId: 'shipwreck', context: ocean });
      if (start.meta.decayed === decayed) return start;
    }
    throw new Error(`no ${decayed ? 'degraded' : 'intact'} wreck in 400 chunks`);
  };
  const degraded = realizeShipwreck(find(true), () => true, BLOCKS);
  const intact = realizeShipwreck(find(false), () => true, BLOCKS);
  assert.ok(degraded.processorTypes.includes('block_rot'), 'decay is block_rot, the documented mechanism');
  assert.ok(degraded.processorTypes.includes('block_age'));
  assert.deepEqual(intact.processorTypes, ['jigsaw_replacement'], 'an intact wreck is not aged');
  assert.ok(degraded.written < intact.written, 'a degraded wreck must lose blocks');
  assert.deepEqual(degraded.missingBlocks, []);
});

test('the chest rule holds: one to three chests, and two or more always includes the map', () => {
  const lootTables = SHIPWRECK_CHESTS.map((chest) => chest.lootTable);
  const mapLoot = SHIPWRECK_CHESTS[2].lootTable;
  let emptyWrecks = 0;
  for (let chunkX = 0; chunkX < 200; chunkX++) {
    const start = generateShipwreck({ seed: 77, chunkX, chunkZ: 0, structureId: 'shipwreck', context: ocean });
    assert.ok(start.meta.chests >= 1 && start.meta.chests <= SHIPWRECK_CHESTS.length,
      `chest count ${start.meta.chests} out of range`);
    // The rule is about the WRECK's sections, so it is asserted on the plan: a wreck planned with two or
    // more chests includes the map chest. Decay may then drop a chest block -- which is why the realized
    // count is allowed to be lower, and why its loot is checked against the planned set rather than
    // against the rule.
    if (start.meta.chests >= 2) {
      assert.ok(start.pieces[0].meta.loot.includes(mapLoot),
        `a wreck planned with ${start.meta.chests} chests must include its map chest`);
    }
    const report = realizeShipwreck(start, () => true, BLOCKS);
    assert.ok(report.chests <= report.plannedChests, 'decay may drop a chest but may not add one');
    // A degraded wreck CAN lose its only chest: block_rot drops blocks, chests included, and that is the
    // documented mechanism rather than a defect. So the survival check is statistical over the sample
    // instead of absolute per wreck.
    if (report.chests === 0) emptyWrecks++;
    for (const loot of report.chestLoot) assert.ok(lootTables.includes(loot), `unexpected loot table ${loot}`);
  }
  assert.ok(emptyWrecks < 200 * 0.25,
    `${emptyWrecks} of 200 wrecks had no surviving chest, which is more than decay can explain`);
});

test('beached wrecks sit on the surface and sunken ones on the ocean floor', () => {
  const beached = generateShipwreck({ seed: 9, chunkX: 1, chunkZ: 1, structureId: 'shipwreck_beached', context: ocean });
  const sunken = generateShipwreck({ seed: 9, chunkX: 1, chunkZ: 1, structureId: 'shipwreck', context: ocean });
  assert.equal(beached.meta.beached, true);
  assert.equal(sunken.meta.beached, false);
  assert.equal(beached.meta.y, 62, 'a beached wreck sits on the world surface');
  assert.ok(sunken.meta.y < beached.meta.y, 'a sunken wreck sits below the surface');
  assert.ok(sunken.meta.y >= 2, 'and never below the world floor');
});

test('generation and realization are deterministic, and every id resolves', () => {
  const first = generateShipwreck({ seed: 2024, chunkX: 6, chunkZ: -6, structureId: 'shipwreck', context: ocean });
  const again = generateShipwreck({ seed: 2024, chunkX: 6, chunkZ: -6, structureId: 'shipwreck', context: ocean });
  assert.deepEqual(first.box.toArray(), again.box.toArray());
  assert.deepEqual(first.meta, again.meta);

  const collect = () => {
    const out = [];
    realizeShipwreck(first, (x, y, z, id) => { out.push(`${x},${y},${z},${id}`); return true; }, BLOCKS);
    return out;
  };
  assert.deepEqual(collect(), collect());
  const report = realizeShipwreck(first, () => true, BLOCKS);
  assert.deepEqual(report.missingBlocks, []);
  assert.ok(createBlockIdResolver(BLOCKS).resolve('minecraft:chest') !== null);
});
