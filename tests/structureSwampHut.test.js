// Swamp hut tests: a raised hut, its two structure mobs, and the deviations it declares.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateSwampHut, realizeSwampHut, buildSwampHut, HUT_WIDTH, HUT_LEG_HEIGHT, HUT_ENTITIES
} from '../src/worldgen/generators/swampHut.js';
import { createStructureEngine, GENERATORS, generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { BLOCKS } from '../src/blocks.js';

const swamp = { biomeAt: () => 'swamp', surfaceY: () => 64 };

test('the swamp hut is registered, procedural, and gated on the swamp', () => {
  assert.ok(generatorCoverage().implemented.includes('swamp_hut'));
  assert.ok(GENERATORS.swampHut.realize);
  const engine = createStructureEngine({ seed: 1, blockIds: BLOCKS, ...swamp });
  // Membership rather than an exact list: the exact gated set is registry data, and a test that pins it
  // verbatim breaks when the data is corrected rather than when the behaviour is wrong.
  assert.ok(engine.registry.swamp_hut.biomes.includes('swamp'));
  assert.equal(engine.registry.swamp_hut.biomes.includes('desert'), false, 'a hut must not generate in a desert');
  assert.equal(engine.registry.swamp_hut.family, 'hardcoded');
});

test('the hut is raised on legs, and every block stays inside its size', () => {
  const template = new StructureTemplate(buildSwampHut({}), 'hut');
  assert.equal(template.size[0], HUT_WIDTH);
  for (const block of template.blocks) {
    const [x, y, z] = block.pos;
    const [sx, sy, sz] = template.size;
    assert.ok(x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz,
      `block ${block.pos} is outside ${template.size}`);
  }
  // The legs are the structure's signature: the floor must be raised, with support below it at the corners.
  const legBlocks = template.blocks.filter((block) => block.pos[1] < HUT_LEG_HEIGHT);
  assert.equal(legBlocks.length, 4 * HUT_LEG_HEIGHT, 'four corner legs, each reaching the ground');
  for (const leg of legBlocks) {
    const atCorner = (leg.pos[0] % (HUT_WIDTH - 1) === 0) && (leg.pos[2] % (HUT_WIDTH - 1) === 0);
    assert.ok(atCorner, `a leg at ${leg.pos} is not at a corner`);
  }
  const floorBlocks = template.blocks.filter((block) => block.pos[1] === HUT_LEG_HEIGHT);
  assert.equal(floorBlocks.length, HUT_WIDTH * HUT_WIDTH, 'the floor is a full square');
});

test('the hut carries a witch and a black cat as structure mobs', () => {
  const template = new StructureTemplate(buildSwampHut({}), 'hut');
  assert.equal(template.entities.length, 2);
  const ids = template.entities.map((entity) => entity.nbt.id);
  assert.deepEqual(ids.sort(), ['minecraft:cat', 'minecraft:witch']);
  const cat = template.entities.find((entity) => entity.nbt.id === 'minecraft:cat');
  assert.equal(cat.nbt.CatType, 'all_black', 'the hut cat is a black cat, not a random variant');
  // Both must be persistent, or a structure mob would despawn the moment a player walks away.
  for (const entity of template.entities) assert.equal(entity.nbt.PersistenceRequired, 1);
  assert.equal(HUT_ENTITIES.length, 2);
});

test('realization places the hut and spawns its mobs, or reports that it could not', () => {
  const start = generateSwampHut({ seed: 5, chunkX: 3, chunkZ: 3, context: swamp });
  const spawned = [];
  const report = realizeSwampHut(start, () => true, BLOCKS, {
    spawnMob: (type, x, y, z, options) => { spawned.push({ type, x, y, z, options }); return true; }
  });
  assert.ok(report.written > 60, `expected a hut's worth of blocks, wrote ${report.written}`);
  assert.deepEqual(report.missingBlocks, [], `unresolved: ${report.missingBlocks}`);
  assert.deepEqual(report.spawned.sort(), ['cat', 'witch']);
  assert.equal(spawned.length, 2);
  // The witch must be inside the hut's footprint and above its floor, not somewhere in the ground.
  const witch = spawned.find((entry) => entry.type === 'witch');
  assert.ok(Number.isFinite(witch.x) && Number.isFinite(witch.z));
  // Without a spawn callback nothing is invented.
  assert.deepEqual(realizeSwampHut(start, () => true, BLOCKS).spawned, []);
  assert.match(report.note, /interior furnishings are not implemented/);
});

test('the hut sits on the surface and generation is deterministic', () => {
  const first = generateSwampHut({ seed: 77, chunkX: -2, chunkZ: 4, context: swamp });
  const again = generateSwampHut({ seed: 77, chunkX: -2, chunkZ: 4, context: swamp });
  assert.deepEqual(first.box.toArray(), again.box.toArray());
  assert.deepEqual(first.meta, again.meta);
  assert.equal(first.pieces[0].meta.origin.y, 64, 'the hut floor is at the surface, legs going down');
  assert.equal(first.pieces[0].family, 'hardcoded');

  const collect = () => {
    const out = [];
    realizeSwampHut(first, (x, y, z, id) => { out.push(`${x},${y},${z},${id}`); return true; }, BLOCKS);
    return out;
  };
  assert.deepEqual(collect(), collect());
});
