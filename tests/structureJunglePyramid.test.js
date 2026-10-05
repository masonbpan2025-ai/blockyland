// Jungle pyramid tests.
//
// The TRAP is this structure's point. A jungle pyramid whose treasure room has chests but no armed dispenser is
// a mossy box, so the assertions check the wire is COMPLETE -- two dispensers facing each other across the
// room, a tripwire hook at each end of a tripwire line, and a lever with a sticky piston -- rather than merely
// that each kind of block appears somewhere in the plan.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateJunglePyramid, realizeJunglePyramid, buildJunglePyramid, JUNGLE_MATERIALS,
  JUNGLE_BASE, JUNGLE_FLOORS, JUNGLE_DEPTH
} from '../src/worldgen/generators/junglePyramid.js';
import { createStructureEngine, GENERATORS, generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { BLOCKS } from '../src/blocks.js';

const jungle = { biomeAt: () => 'jungle', surfaceY: () => 70 };

test('the jungle pyramid is registered in the jungle, and is a hardcoded-family structure', () => {
  assert.ok(generatorCoverage().implemented.includes('jungle_pyramid'));
  assert.ok(GENERATORS.junglePyramid.realize);
  const engine = createStructureEngine({ seed: 1, blockIds: BLOCKS, ...jungle });
  const entry = engine.registry.jungle_pyramid;
  assert.ok(entry.biomes.includes('jungle'));
  assert.ok(entry.biomes.includes('bamboo_jungle'));
  assert.equal(entry.family, 'hardcoded');
});

test('the plan is well formed, inside its size, and built only from jungle pyramid materials', () => {
  const template = new StructureTemplate(buildJunglePyramid({ seed: 5 }), 'pyramid');
  const allowed = new Set(['minecraft:air', 'minecraft:jigsaw', ...Object.values(JUNGLE_MATERIALS)]);
  assert.deepEqual(template.size.slice(0, 1), [JUNGLE_BASE]);
  for (const block of template.blocks) {
    const [x, y, z] = block.pos;
    const [sx, sy, sz] = template.size;
    assert.ok(x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz,
      'block ' + block.pos + ' is outside ' + template.size);
  }
  for (const entry of template.palette) {
    assert.ok(allowed.has(entry.name), 'used ' + entry.name + ', which is not a pyramid material');
  }
  // THREE floors: each level's shell must be narrower than the one below, which is what makes it a pyramid
  // rather than a stack of boxes.
  const widths = [];
  for (let floor = 0; floor < JUNGLE_FLOORS; floor++) {
    const y = JUNGLE_DEPTH + floor;
    const at = template.blocks.filter((block) => block.pos[1] === y);
    if (!at.length) continue;
    const xs = at.map((block) => block.pos[0]);
    widths.push(Math.max.apply(null, xs) - Math.min.apply(null, xs) + 1);
  }
  assert.equal(widths.length, JUNGLE_FLOORS, 'expected three floors, got ' + widths.length);
  for (let i = 1; i < widths.length; i++) {
    assert.ok(widths[i] < widths[i - 1], 'floor ' + i + ' is not narrower than floor ' + (i - 1));
  }
});

test('the trap is COMPLETE and armed, and its dispensers face each other', () => {
  const start = generateJunglePyramid({ seed: 17, chunkX: 1, chunkZ: 1, context: jungle });
  const report = realizeJunglePyramid(start, () => true, BLOCKS);
  assert.equal(report.trap.dispensers.length, 2, 'two dispensers');
  assert.equal(report.trap.hooks.length, 2, 'a hook at each end of the wire');
  assert.equal(report.trap.pistons.length, 1, 'one sticky piston');
  assert.equal(report.trap.levers.length, 1, 'one lever');
  assert.ok(report.trap.wire > 0, 'the tripwire line must be laid');
  assert.equal(report.armed, true, 'a pyramid whose trap is not armed is not parity');
  // The dispensers must FACE EACH OTHER across the room, which is what makes the arrows cross it.
  const [a, b] = report.trap.dispensers.sort((first, second) => first.x - second.x);
  assert.equal(a.facing, 'east', 'the western dispenser must face east');
  assert.equal(b.facing, 'west', 'the eastern dispenser must face west');
  assert.equal(a.z, b.z, 'the two dispensers must be on the same line');
  // The hooks must sit at the ends of that line, not somewhere else in the room.
  const zs = report.trap.hooks.map((hook) => hook.z);
  assert.deepEqual(zs, [a.z, a.z], 'both hooks must be on the dispensers line');
  const hookXs = report.trap.hooks.map((hook) => hook.x).sort((first, second) => first - second);
  assert.equal(hookXs[0], a.x, 'one hook must be at the western dispenser');
  assert.equal(hookXs[1], b.x, 'and one at the eastern dispenser');
});

test('realization writes the pyramid, its chests, and resolves every id', () => {
  const start = generateJunglePyramid({ seed: 17, chunkX: 1, chunkZ: 1, context: jungle });
  const writes = [];
  const report = realizeJunglePyramid(start, (x, y, z, blockId, meta) => { writes.push({ x, y, z, id: blockId, meta }); return true; }, BLOCKS);
  assert.ok(report.written > 120, 'expected a pyramid, wrote ' + report.written);
  assert.deepEqual(report.missingBlocks, [], 'could not resolve: ' + report.missingBlocks);
  assert.equal(report.chests, 3, 'the treasure room holds three chests');
  for (const loot of report.chestLoot) assert.equal(loot, JUNGLE_MATERIALS.loot);
  // The dispensers carry their own table, which is the one block entity worth distinguishing.
  const dispenser = writes.find((write) => write.meta?.lootTable === JUNGLE_MATERIALS.dispenserLoot);
  assert.ok(dispenser, 'a dispenser must carry the dispenser loot table');
  for (const write of writes) {
    assert.ok(start.pieces.some((piece) => piece.box.contains(write.x, write.y, write.z)),
      'block ' + write.x + ',' + write.y + ',' + write.z + ' is outside the piece box');
  }
  assert.match(report.note, /depth is an approximation/);
});

test('the pyramid sits on the surface with its treasure room below, and generation is deterministic', () => {
  const start = generateJunglePyramid({ seed: 8, chunkX: 5, chunkZ: 1, context: jungle });
  // The pyramid's base must land on the surface with the treasure room beneath it.
  assert.equal(start.meta.y + JUNGLE_DEPTH, 70, 'the pyramid base must land on the surface');
  assert.ok(start.meta.treasureY < 70, 'the treasure room is below the base');
  assert.equal(start.pieces[0].family, 'hardcoded');

  const again = generateJunglePyramid({ seed: 8, chunkX: 5, chunkZ: 1, context: jungle });
  assert.deepEqual(again.pieces[0].box.toArray(), start.pieces[0].box.toArray());
  assert.equal(again.meta.rotation, start.meta.rotation);

  const collect = () => {
    const out = [];
    realizeJunglePyramid(start, (x, y, z, id) => { out.push(x + ',' + y + ',' + z + ',' + id); return true; }, BLOCKS);
    return out;
  };
  assert.deepEqual(collect(), collect(), 'two realizations of one plan must be identical');

  const engine = createStructureEngine({ seed: 31337, blockIds: BLOCKS, ...jungle });
  const located = engine.locate('jungle_pyramid', 0, 0, { maxRadiusChunks: 4096 });
  assert.ok(located && located.start, 'a pyramid must be findable through the real locate path');
  let written = 0;
  engine.realize(located.start, () => { written++; return true; }, { chunkX: located.start.chunkX, chunkZ: located.start.chunkZ });
  assert.ok(written > 0, 'the engine must realize the pyramid it located');
});
