// Trial chambers tests.
//
// Two things here are new to this structure and worth pinning: it chains VERTICALLY through a staircase, which
// no earlier part did, and it carries BLOCK ENTITIES whose data matters (trial spawners and vaults), which no
// earlier structure tested.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateTrialChambers, realizeTrialChambers, buildTrialPart, TRIAL_MATERIALS,
  TRIAL_Y_RANGE, CORRIDOR_SLOT, ROOM_SLOT
} from '../src/worldgen/generators/trialChambers.js';
import { createStructureEngine, GENERATORS, generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { splitOrientation } from '../src/worldgen/jigsaw.js';
import { BLOCKS } from '../src/blocks.js';

const PARTS = ['corridor', 'corridor_corner', 'staircase', 'room_small', 'room_large', 'intersection'];
const overworld = { biomeAt: () => 'plains', surfaceY: () => 70 };

test('the trial chambers are registered underground, in any overworld biome, and encapsulate', () => {
  assert.ok(generatorCoverage().implemented.includes('trial_chambers'));
  assert.ok(GENERATORS.trialChambers.realize);
  const engine = createStructureEngine({ seed: 1, blockIds: BLOCKS, ...overworld });
  const entry = engine.registry.trial_chambers;
  assert.equal(entry.step, 'underground_structures');
  assert.equal(entry.terrainAdaptation, 'encapsulate', 'rooms must be sealed off from the caves around them');
  assert.deepEqual(entry.biomes, [], 'gated by a tag with no explicit biome list');
});

test('every part is well formed, inside its size, and built only from trial chamber materials', () => {
  const allowed = new Set(['minecraft:air', 'minecraft:jigsaw', ...Object.values(TRIAL_MATERIALS)]);
  for (const kind of PARTS) {
    const template = new StructureTemplate(buildTrialPart(kind), 'trial/' + kind);
    assert.ok(template.blockCount > 0, kind + ' has no blocks');
    for (const block of template.blocks) {
      const [x, y, z] = block.pos;
      const [sx, sy, sz] = template.size;
      assert.ok(x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz,
        kind + ': block ' + block.pos + ' is outside ' + template.size);
    }
    for (const entry of template.palette) {
      assert.ok(allowed.has(entry.name), kind + ' used ' + entry.name + ', which is not a trial chamber material');
    }
    assert.ok(template.jigsaws().length > 0, kind + ' offers no connector');
  }
  assert.throws(() => buildTrialPart('not_a_part'), /unknown trial chamber part/);
});

test('a corridor chains at both ends and offers a room on each side', () => {
  const corridor = new StructureTemplate(buildTrialPart('corridor'), 'corridor');
  const names = corridor.jigsaws().map((jigsaw) => jigsaw.name);
  assert.equal(names.filter((name) => name === CORRIDOR_SLOT).length, 2, 'the corridor slot must be at both ends');
  assert.equal(names.filter((name) => name === ROOM_SLOT).length, 2, 'and a room slot on each side');
});

test('the staircase chains UPWARD, which no earlier part did', () => {
  const staircase = new StructureTemplate(buildTrialPart('staircase'), 'staircase');
  const exit = staircase.jigsaws().find((jigsaw) => jigsaw.pool === 'trial/corridors' && splitOrientation(jigsaw.orientation).front === 'up');
  // prefix would pass for an orientation whose TOP is up and whose front is horizontal, which is exactly the
  // A connector that FRONTS UP is what makes the engine place the next piece a level above this one.
  assert.ok(exit, 'the staircase needs a connector facing up');
  assert.match(exit.orientation, /^up_/, 'orientation is <front>_<top>, so an upward front reads `up_*`');
  const start = generateTrialChambers({ seed: 4242, chunkX: 0, chunkZ: 0, context: overworld });
  assert.ok(start.pieces.length > 2, 'expected a chamber, got ' + start.pieces.length + ' pieces');
  assert.equal(start.meta.connected, true, 'every piece must be reachable from the entrance corridor');
  assert.ok(start.meta.maxDepth <= 6, 'depth exceeded the cap');
});

test('the chamber is underground, and its pieces never overlap', () => {
  const start = generateTrialChambers({ seed: 7, chunkX: 1, chunkZ: 1, context: overworld });
  // Underground: the Y comes from the band, not from the terrain height the context reported.
  assert.ok(start.meta.y >= TRIAL_Y_RANGE[0] && start.meta.y <= TRIAL_Y_RANGE[1]);
  assert.ok(start.meta.y < overworld.surfaceY(), 'a trial chamber must sit below the surface');
  for (const piece of start.pieces) {
    for (const other of start.pieces) {
      if (piece === other) continue;
      assert.equal(piece.box.intersects(other.box), false, piece.meta.element + ' overlaps ' + other.meta.element);
    }
  }
});

test('realization writes the chamber and reports its trial spawners and vaults', () => {
  const start = generateTrialChambers({ seed: 77, chunkX: 2, chunkZ: 2, context: overworld });
  const writes = [];
  const report = realizeTrialChambers(start, (x, y, z, blockId, meta) => { writes.push({ x, y, z, id: blockId, meta }); return true; }, BLOCKS);
  assert.ok(report.written > 200, 'expected a chamber, wrote ' + report.written);
  assert.deepEqual(report.missingBlocks, [], 'could not resolve: ' + report.missingBlocks);
  // A chamber with no spawner or vault is a corridor system, not a trial chamber.
  assert.ok(report.vaults > 0, 'a trial chamber needs at least one vault');
  for (const entry of report.blockEntities) assert.match(entry.kind, /trial_spawner|vault/);
  for (const write of writes) {
    assert.ok(start.pieces.some((piece) => piece.box.contains(write.x, write.y, write.z)),
      'block ' + write.x + ',' + write.y + ',' + write.z + ' is outside every piece box');
  }
  // The vault must keep its loot table, since a vault with no table dispenses nothing.
  const vaultWrite = writes.find((write) => write.meta?.blockEntity === 'minecraft:vault');
  assert.ok(vaultWrite, 'the vault must be written as a block entity');
  assert.match(vaultWrite.meta.lootTable, /trial_chambers/);
});

test('generation is deterministic, and the engine can plan a chamber', () => {
  const first = generateTrialChambers({ seed: 31337, chunkX: 3, chunkZ: -3, context: overworld });
  const again = generateTrialChambers({ seed: 31337, chunkX: 3, chunkZ: -3, context: overworld });
  assert.deepEqual(first.pieces.map((piece) => piece.box.toArray()), again.pieces.map((piece) => piece.box.toArray()));
  assert.deepEqual(first.meta.partMix, again.meta.partMix);
  assert.equal(first.meta.y, again.meta.y);

  const engine = createStructureEngine({ seed: 31337, blockIds: BLOCKS, ...overworld });
  let plan = null;
  for (let chunkX = 0; chunkX < 3000 && !plan; chunkX++) {
    const candidate = engine.planChunk(chunkX, 0);
    if (candidate && candidate.structureId === 'trial_chambers') plan = candidate;
  }
  assert.ok(plan, 'a trial chamber must be findable through the real placement path');
  let written = 0;
  engine.realize(plan.start, () => { written++; return true; }, { chunkX: plan.start.chunkX, chunkZ: plan.start.chunkZ });
  assert.ok(written > 0, 'the engine must realize the chamber it planned');
});
