// Ocean monument tests.
//
// Two things are specific to this structure and worth the assertion budget: it is a ROOM GRAPH rather than one
// hall (so the rooms must CONNECT), and its central room holds the documented number of GOLD BLOCKS. A
// prismarine box with rooms that do not connect and no gold would satisfy "a monument was built".
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateMonument, realizeMonument, buildMonument, MONUMENT_MATERIALS,
  MONUMENT_LEVELS, MONUMENT_GRID, MONUMENT_ROOM, MONUMENT_WIDTH, MONUMENT_GOLD, MONUMENT_ELDER_COUNT
} from '../src/worldgen/generators/monument.js';
import { createStructureEngine, GENERATORS, generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { BLOCKS } from '../src/blocks.js';

const deepOcean = { biomeAt: () => 'deep_ocean', surfaceY: (x, z, map) => (map === 'ocean_floor_wg' ? 40 : 62) };

test('the monument is registered in the deep oceans, and is a procedural-family structure', () => {
  assert.ok(generatorCoverage().implemented.includes('monument'));
  assert.ok(GENERATORS.monument.realize);
  const engine = createStructureEngine({ seed: 1, blockIds: BLOCKS, ...deepOcean });
  const entry = engine.registry.monument;
  assert.ok(entry.biomes.includes('deep_ocean'));
  assert.ok(entry.biomes.every((biome) => biome.startsWith('deep_')), 'a monument only generates in deep oceans');
  assert.equal(entry.family, 'procedural');
});

test('the plan is well formed, inside its size, and built only from monument materials', () => {
  const template = new StructureTemplate(buildMonument({ seed: 5 }), 'monument');
  const allowed = new Set(['minecraft:air', 'minecraft:jigsaw', ...Object.values(MONUMENT_MATERIALS)]);
  assert.equal(template.size[0], MONUMENT_WIDTH);
  for (const block of template.blocks) {
    const [x, y, z] = block.pos;
    const [sx, sy, sz] = template.size;
    assert.ok(x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz,
      'block ' + block.pos + ' is outside ' + template.size);
  }
  for (const entry of template.palette) {
    assert.ok(allowed.has(entry.name), 'used ' + entry.name + ', which is not a monument material');
  }
  // The documented content, at this scale: the gold blocks and the sea lanterns must be present in the PLAN.
  const nameOf = (block) => template.palette[block.state].name;
  assert.equal(template.blocks.filter((block) => nameOf(block) === MONUMENT_MATERIALS.gold).length, MONUMENT_GOLD,
    'the central room holds ' + MONUMENT_GOLD + ' gold blocks');
  assert.ok(template.blocks.filter((block) => nameOf(block) === MONUMENT_MATERIALS.lantern).length > 10, 'sea lanterns light it');
  // Dark prismarine belongs to the upper level, which is what distinguishes the levels from one another.
  const dark = template.blocks.filter((block) => nameOf(block) === MONUMENT_MATERIALS.dark);
  assert.ok(dark.length > 0, 'dark prismarine must appear');
  assert.ok(dark.every((block) => block.pos[1] >= (MONUMENT_LEVELS - 1) * 4), 'dark prismarine belongs to the upper level');
});

test('the rooms CONNECT, so the monument is a room graph rather than sealed cells', () => {
  const template = new StructureTemplate(buildMonument({ seed: 5 }), 'monument');
  // The wall plane between two vertically adjacent rooms in the grid: it must have a doorway at walking height.
  const wallZ = 1 + MONUMENT_ROOM;
  const gaps = [];
  for (let x = 0; x < MONUMENT_ROOM; x++) {
    const filled = template.blocks.some((block) => block.pos[2] === wallZ && block.pos[0] === 1 + x && block.pos[1] >= 1 && block.pos[1] <= 2);
    if (!filled) gaps.push(x);
  }
  assert.ok(gaps.length > 0, 'the wall between two rooms has no doorway, so the rooms are sealed');
  // And the doorway is at the middle of the wall, where a door belongs.
  assert.ok(gaps.includes(3), 'the doorway must be at the middle of the wall: gaps at ' + gaps.join(','));
});

test('realization writes the monument, counts its content, and places the elder guardians', () => {
  const start = generateMonument({ seed: 77, chunkX: 2, chunkZ: 2, context: deepOcean });
  const writes = [];
  const spawned = [];
  const report = realizeMonument(start, (x, y, z, blockId, meta) => { writes.push({ x, y, z, id: blockId, meta }); return true; }, BLOCKS, {
    spawnMob: (type) => { spawned.push(type); return true; }
  });
  assert.ok(report.written > 2000, 'expected a monument, wrote ' + report.written);
  assert.deepEqual(report.missingBlocks, [], 'could not resolve: ' + report.missingBlocks);
  assert.equal(report.counts.gold, MONUMENT_GOLD, 'the gold must survive realization');
  assert.ok(report.counts.lantern > 10, 'and the lanterns');
  assert.ok(report.counts.sponge > 0, 'sponge rooms are part of a monument');
  assert.equal(spawned.length, MONUMENT_ELDER_COUNT, 'three elder guardians, as the wiki describes');
  for (const write of writes) {
    assert.ok(start.pieces.some((piece) => piece.box.contains(write.x, write.y, write.z)),
      'block ' + write.x + ',' + write.y + ',' + write.z + ' is outside the piece box');
  }
  assert.match(report.note, /reduced scale/);
});

test('the monument sits on the OCEAN FLOOR, and generation is deterministic', () => {
  const start = generateMonument({ seed: 8, chunkX: 5, chunkZ: 1, context: deepOcean });
  // On the floor, not at the surface: a monument floating at sea level would be a different structure.
  assert.equal(start.meta.floor, 40, 'the monument must sit on the ocean floor the context reported');
  assert.ok(start.meta.floor < 62, 'and therefore well below the surface');
  assert.equal(start.pieces[0].family, 'procedural');

  const again = generateMonument({ seed: 8, chunkX: 5, chunkZ: 1, context: deepOcean });
  assert.deepEqual(again.pieces[0].box.toArray(), start.pieces[0].box.toArray());

  const collect = () => {
    const out = [];
    realizeMonument(start, (x, y, z, id) => { out.push(x + ',' + y + ',' + z + ',' + id); return true; }, BLOCKS);
    return out;
  };
  assert.deepEqual(collect(), collect(), 'two realizations of one plan must be identical');

  const engine = createStructureEngine({ seed: 31337, blockIds: BLOCKS, ...deepOcean });
  const located = engine.locate('monument', 0, 0, { maxRadiusChunks: 4096 });
  assert.ok(located && located.start, 'a monument must be findable through the real locate path');
  let written = 0;
  engine.realize(located.start, () => { written++; return true; }, { chunkX: located.start.chunkX, chunkZ: located.start.chunkZ });
  assert.ok(written > 0, 'the engine must realize the monument it located');
});
