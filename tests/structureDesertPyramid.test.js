// Desert pyramid tests: a procedural structure, its hidden room, its trap, and its four chests.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateDesertPyramid, realizeDesertPyramid, buildDesertPyramid,
  PYRAMID_BASE, PYRAMID_LEVELS, PYRAMID_BASE_Y, PYRAMID_CHESTS
} from '../src/worldgen/generators/desertPyramid.js';
import { createStructureEngine, GENERATORS, generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { BLOCKS } from '../src/blocks.js';

const desert = { biomeAt: () => 'desert', surfaceY: () => 70 };

test('the desert pyramid is registered, procedural, and gated on the desert', () => {
  assert.ok(generatorCoverage().implemented.includes('desert_pyramid'));
  assert.ok(GENERATORS.desertPyramid.realize);
  const engine = createStructureEngine({ seed: 1, blockIds: BLOCKS, ...desert });
  assert.deepEqual(engine.registry.desert_pyramid.biomes, ['desert']);
  assert.equal(engine.registry.desert_pyramid.family, 'hardcoded',
    'the pyramid is procedural, not a template family member');
});

test('the pyramid is a stepped structure whose levels shrink toward the top', () => {
  const template = new StructureTemplate(buildDesertPyramid({}), 'pyramid');
  assert.equal(template.size[0], PYRAMID_BASE);
  assert.equal(template.size[2], PYRAMID_BASE);
  for (const block of template.blocks) {
    const [x, y, z] = block.pos;
    const [sx, sy, sz] = template.size;
    assert.ok(x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz,
      `block ${block.pos} is outside ${template.size}`);
  }

  // Measure the footprint of each level: it must shrink monotonically, which is what makes it a pyramid.
  const footprint = (level) => {
    const y = PYRAMID_BASE_Y + level;
    const at = template.blocks.filter((block) => block.pos[1] === y);
    if (!at.length) return 0;
    const xs = at.map((block) => block.pos[0]);
    return Math.max(...xs) - Math.min(...xs) + 1;
  };
  const widths = [];
  for (let level = 0; level <= PYRAMID_LEVELS; level++) {
    const width = footprint(level);
    if (width > 0) widths.push(width);
  }
  assert.ok(widths.length >= 3, `expected several levels, measured ${JSON.stringify(widths)}`);
  for (let i = 1; i < widths.length; i++) {
    assert.ok(widths[i] <= widths[i - 1], `level ${i} (${widths[i]}) is wider than level ${i - 1} (${widths[i - 1]})`);
  }
  assert.equal(widths[0], PYRAMID_BASE, 'the base level is the full pyramid width');
});

test('the treasure room holds four chests with distinct loot tables', () => {
  const template = new StructureTemplate(buildDesertPyramid({}), 'pyramid');
  const chests = template.blocks.filter((block) => block.nbt?.LootTable);
  assert.equal(chests.length, 4, 'the wiki says the treasure room holds four chests');
  const lootTables = chests.map((block) => block.nbt.LootTable);
  assert.equal(new Set(lootTables).size, 2,
    'one chest is the decorated variant and three are plain, so there are two distinct tables');
  assert.ok(lootTables.includes('minecraft:chests/desert_pyramid_decorated'));
  for (const loot of lootTables) assert.ok(PYRAMID_CHESTS.includes(loot));
  // Every chest is below the pyramid's base, i.e. hidden rather than on the surface.
  for (const chest of chests) assert.ok(chest.pos[1] < PYRAMID_BASE_Y, 'chests must be inside the hidden room');
});

test('the trap is armed: a pressure plate directly above TNT', () => {
  const template = new StructureTemplate(buildDesertPyramid({}), 'pyramid');
  const plates = template.blocks.filter((block) => template.palette[block.state].name === 'minecraft:stone_pressure_plate');
  const tnt = template.blocks.filter((block) => template.palette[block.state].name === 'minecraft:tnt');
  assert.equal(plates.length, 1, 'exactly one pressure plate');
  assert.ok(tnt.length >= 1, 'the pit is filled with TNT');
  // The plate must sit directly above a TNT block, or stepping on it does nothing.
  const plate = plates[0].pos;
  const below = tnt.some((block) => block.pos[0] === plate[0] && block.pos[1] === plate[1] - 1 && block.pos[2] === plate[2]);
  assert.ok(below, `no TNT directly beneath the plate at ${plate}`);
});

test('realization writes the pyramid, its chests and its armed trap', () => {
  const start = generateDesertPyramid({ seed: 17, chunkX: 2, chunkZ: 2, context: desert });
  const report = realizeDesertPyramid(start, () => true, BLOCKS);
  assert.ok(report.written > 200, `expected a pyramid's worth of blocks, wrote ${report.written}`);
  assert.deepEqual(report.missingBlocks, [], `unresolved: ${report.missingBlocks}`);
  assert.equal(report.chests.length, 4);
  assert.equal(report.trap.armed, true, 'a pyramid whose trap is not armed is not parity');
  assert.ok(report.trap.tnt > 1);
  assert.equal(report.trap.pressurePlate, true);
  assert.match(report.note, /terrain adaptation is not applied/);
});

test('the structure sits on the surface and its room hangs below it', () => {
  const start = generateDesertPyramid({ seed: 8, chunkX: 5, chunkZ: 1, context: desert });
  // The pyramid's base must be at the sand surface, with the treasure room beneath.
  assert.equal(start.meta.y + PYRAMID_BASE_Y, 70, 'the pyramid base must land on the surface');
  assert.ok(start.meta.treasureY < start.meta.y + PYRAMID_BASE_Y, 'the room is below the base');
  assert.equal(start.pieces[0].family, 'hardcoded');

  // Rotation must vary, and each piece box must match its own rotation.
  const rotations = new Set();
  for (let chunkX = 0; chunkX < 60; chunkX++) {
    const candidate = generateDesertPyramid({ seed: 3, chunkX, chunkZ: 0, context: desert });
    rotations.add(candidate.pieces[0].rotation);
    const template = new StructureTemplate(buildDesertPyramid(candidate.pieces[0].meta.params), 'check');
    assert.deepEqual(candidate.pieces[0].box.toArray(),
      template.boundingBox(candidate.pieces[0].meta.origin, candidate.pieces[0].rotation).toArray());
  }
  assert.ok(rotations.size > 1, `the entrance rotation must vary, saw ${[...rotations]}`);
});

test('generation and realization are deterministic', () => {
  const first = generateDesertPyramid({ seed: 4242, chunkX: -3, chunkZ: 6, context: desert });
  const again = generateDesertPyramid({ seed: 4242, chunkX: -3, chunkZ: 6, context: desert });
  assert.deepEqual(first.box.toArray(), again.box.toArray());
  assert.deepEqual(first.meta, again.meta);
  const collect = () => {
    const out = [];
    realizeDesertPyramid(first, (x, y, z, id) => { out.push(`${x},${y},${z},${id}`); return true; }, BLOCKS);
    return out;
  };
  assert.deepEqual(collect(), collect());
});
