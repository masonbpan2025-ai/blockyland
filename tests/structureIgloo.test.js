// The igloo: the first structure that runs the whole template pipeline end to end.
//
// What these tests are for: a template-backed structure has many ways to be subtly wrong -- the biome gate,
// the 50% roll, the block-name resolution, the chest's loot reference, the two entities. Each of those is
// asserted separately here, because "an igloo appeared" would hide all of them.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createStructureEngine, GENERATORS, generatorCoverage } from '../src/worldgen/index.js';
import { generateIgloo, realizeIgloo, IGLOO_BASEMENT_CHANCE } from '../src/worldgen/generators/igloo.js';
import { buildIglooTop, buildIglooBasement } from '../src/worldgen/templates/igloo.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { createBlockIdResolver, enumKeyFor } from '../src/worldgen/blockIds.js';
import { BLOCKS } from '../src/blocks.js';
import { legacyFromLargeFeatureSeed } from '../src/worldgen/placement.js';

const snowy = { biomeAt: () => 'snowy_plains', surfaceY: () => 70 };

test('the igloo is registered, gated on the right biomes and now has a generator', () => {
  const coverage = generatorCoverage();
  // Membership, not an exact list: an exact list breaks every time another structure lands.
  assert.ok(coverage.implemented.includes('buried_treasure'));
  assert.ok(coverage.implemented.includes('igloo'));
  assert.ok(GENERATORS.igloo.realize, 'the igloo needs a realize step, not just a plan');
  const engine = createStructureEngine({ seed: 1, blockIds: BLOCKS, ...snowy });
  const entry = engine.registry.igloo;
  assert.deepEqual(entry.biomes, ['snowy_taiga', 'snowy_plains', 'snowy_slopes']);
  assert.equal(entry.implementation, 'igloo');
});

test('the templates are well formed and use the documented palette', () => {
  const top = new StructureTemplate(buildIglooTop(), 'minecraft:igloo/top');
  assert.deepEqual(top.size, [7, 5, 10]);
  assert.ok(top.blockCount > 40, `the dome needs a shell, a floor and a door, got ${top.blockCount} blocks`);
  const topNames = new Set(top.palette.map((entry) => entry.name));
  assert.ok(topNames.has('minecraft:snow_block'));
  assert.ok(topNames.has('minecraft:oak_trapdoor'), 'the entrance is a trapdoor in the vanilla structure');

  const basement = new StructureTemplate(buildIglooBasement(), 'minecraft:igloo/bottom');
  assert.deepEqual(basement.size, [7, 23, 10]);
  const basementNames = new Set(basement.palette.map((entry) => entry.name));
  assert.ok(basementNames.has('minecraft:iron_bars'), 'the villager is held behind bars');
  assert.ok(basementNames.has('minecraft:brewing_stand'), 'the cure needs a brewing stand');
  assert.ok(basementNames.has('minecraft:chest'));
  // Every block must be inside the declared size, or it would be clipped away silently.
  for (const template of [top, basement]) {
    for (const block of template.blocks) {
      const [x, y, z] = block.pos;
      assert.ok(x >= 0 && x < template.size[0] && y >= 0 && y < template.size[1] && z >= 0 && z < template.size[2],
        `${template.name}: block at ${block.pos} is outside ${template.size}`);
      assert.ok(block.state >= 0 && block.state < template.palette.length, `${template.name}: palette index ${block.state} out of range`);
    }
  }
});

test('the basement is a deterministic half of all igloos', () => {
  // The roll must come from the chunk's large-feature stream, so the same seed and chunk always agree --
  // and so the same seed gives the same answer however many times it is asked.
  let withBasement = 0;
  const total = 600;
  for (let chunkX = 0; chunkX < total; chunkX++) {
    const start = generateIgloo({ seed: 4242, chunkX, chunkZ: 0, context: snowy });
    if (start.meta.hasBasement) withBasement++;
    // Independently reproduce the roll: if these disagree, the generator drew from somewhere else.
    const expected = legacyFromLargeFeatureSeed(4242, chunkX, 0).nextFloat() < IGLOO_BASEMENT_CHANCE;
    assert.equal(start.meta.hasBasement, expected, `chunk ${chunkX} disagreed with the chunk random`);
  }
  assert.ok(withBasement > total * 0.4 && withBasement < total * 0.6,
    `expected roughly half of ${total} igloos to have a basement, got ${withBasement}`);
});

test('an igloo plan has the right pieces for its basement roll', () => {
  const withoutBasement = generateIgloo({ seed: 1, chunkX: 0, chunkZ: 0, context: snowy });
  const withBasement = (() => {
    for (let chunkX = 0; chunkX < 200; chunkX++) {
      const start = generateIgloo({ seed: 7, chunkX, chunkZ: 0, context: snowy });
      if (start.meta.hasBasement) return start;
    }
    throw new Error('no igloo with a basement in 200 chunks, which cannot be right at 50%');
  })();

  assert.equal(withoutBasement.meta.hasBasement ? 2 : 1, withoutBasement.pieces.length);
  assert.equal(withBasement.pieces.length, 2);
  assert.deepEqual(withBasement.pieces.map((piece) => piece.template).sort(),
    ['minecraft:igloo/bottom', 'minecraft:igloo/top']);
  for (const piece of withBasement.pieces) {
    assert.equal(piece.type, 'template');
    assert.equal(piece.family, 'template');
    assert.equal(piece.box.sizeY > 0, true);
  }
  // The basement sits below the dome, and the dome's box starts at the surface.
  const [top, bottom] = withBasement.pieces;
  assert.equal(top.box.minY, 70);
  assert.ok(bottom.box.minY < top.box.minY, 'the basement must be under the dome');
});

test('the biome gate refuses a warm biome and accepts every snowy one', () => {
  // Count IGLOO plans, not plans in general: other implemented structures (ruined portals) legitimately
  // generate in a desert, so "no plan at all in a desert" stopped being a statement about the igloo.
  const warm = createStructureEngine({ seed: 3, blockIds: BLOCKS, biomeAt: () => 'desert', surfaceY: () => 70 });
  let planned = 0;
  for (let chunk = 0; chunk < 300; chunk++) {
    const plan = warm.planChunk(chunk, 0);
    if (plan && plan.structureId === 'igloo') planned++;
  }
  assert.equal(planned, 0, 'no igloo may generate in a desert');

  for (const biome of ['snowy_plains', 'snowy_taiga', 'snowy_slopes']) {
    const engine = createStructureEngine({ seed: 3, blockIds: BLOCKS, biomeAt: () => biome, surfaceY: () => 70 });
    let found = 0;
    for (let chunk = 0; chunk < 3000 && found === 0; chunk++) {
      const plan = engine.planChunk(chunk, 0);
      if (plan && plan.structureId === 'igloo') found++;
    }
    assert.equal(found, 1, `an igloo must be findable in ${biome}`);
  }
});

test('realization resolves real block ids and writes the dome', () => {
  const start = generateIgloo({ seed: 11, chunkX: 4, chunkZ: -3, context: snowy });
  const written = [];
  const report = realizeIgloo(start, (x, y, z, id) => { written.push({ x, y, z, id }); return true; }, BLOCKS);

  assert.ok(report.written > 40, `expected a dome's worth of blocks, wrote ${report.written}`);
  assert.ok(written.every((entry) => typeof entry.id === 'number' && entry.id !== undefined));
  // The dome is snow: at least a quarter of the placed blocks must be the snow block, and the id must be a
  // real registry value rather than undefined sneaking through.
  const snowId = createBlockIdResolver(BLOCKS).resolve('minecraft:snow_block');
  assert.notEqual(snowId, null, 'snow_block must resolve or the igloo has no shell');
  const snowCount = written.filter((entry) => entry.id === snowId).length;
  assert.ok(snowCount > 20, `expected a snow shell, found ${snowCount} snow blocks`);
  assert.deepEqual(report.missingBlocks, [], `these palette blocks did not resolve: ${report.missingBlocks}`);
});

test('the basement places its entities and does not treat them as blocks', () => {
  let start = null;
  for (let chunkX = 0; chunkX < 200 && !start; chunkX++) {
    const candidate = generateIgloo({ seed: 7, chunkX, chunkZ: 0, context: snowy });
    if (candidate.meta.hasBasement) start = candidate;
  }
  const spawned = [];
  const report = realizeIgloo(start, () => true, BLOCKS, {
    spawnMob: (type, x, y, z) => { spawned.push({ type, x, y, z }); return true; }
  });
  assert.deepEqual(report.spawned.sort(), ['villager', 'zombie_villager'],
    'a villager and a zombie villager are the point of the basement');
  assert.equal(spawned.length, 2);
  for (const entity of spawned) {
    assert.ok(Number.isFinite(entity.x) && Number.isFinite(entity.y) && Number.isFinite(entity.z));
  }
  // Without a spawn callback nothing is invented, and the report says the entities were not placed.
  assert.deepEqual(realizeIgloo(start, () => true, BLOCKS).spawned, []);
});

test('the chest keeps its loot reference through the pipeline', () => {
  // The chest in the basement must carry an identifiable block entity, or the "loot" is decorative.
  const written = [];
  let start = null;
  for (let chunkX = 0; chunkX < 200 && !start; chunkX++) {
    const candidate = generateIgloo({ seed: 7, chunkX, chunkZ: 0, context: snowy });
    if (candidate.meta.hasBasement) start = candidate;
  }
  realizeIgloo(start, (x, y, z, id, meta) => { written.push({ x, y, z, id, meta }); return true; }, BLOCKS);
  const chestId = createBlockIdResolver(BLOCKS).resolve('minecraft:chest');
  const chest = written.find((entry) => entry.id === chestId);
  assert.ok(chest, 'the basement must contain a chest');
  assert.ok(chest.meta?.state, 'the chest keeps its state so a later loot-table pass can find it');
  assert.match(chest.meta.state.name, /chest/);
});

test('block ids resolve through the enum, the shared matcher and the definition name', () => {
  const resolver = createBlockIdResolver(BLOCKS);
  // 1. A hand-written enum key.
  assert.equal(resolver.resolve('minecraft:stone'), BLOCKS.STONE);
  // 2. A generated extra block whose enum key is not the vanilla name.
  assert.notEqual(resolver.resolve('minecraft:snow_block'), null);
  // 3. A name that does not exist is recorded, not silently dropped.
  assert.equal(resolver.resolve('minecraft:definitely_not_a_block'), null);
  assert.deepEqual(resolver.missing, ['definitely_not_a_block']);
  // Resolution is cached, so a big structure does not repeat the search per block.
  const before = resolver.cacheSize;
  resolver.resolve('minecraft:stone');
  assert.equal(resolver.cacheSize, before);
  assert.equal(enumKeyFor('minecraft:oak_trapdoor'), 'OAK_TRAPDOOR');
  assert.equal(enumKeyFor('stone'), 'STONE');
});

test('realization is deterministic and chunk-clipping does not disturb other chunks', () => {
  const start = generateIgloo({ seed: 5, chunkX: 2, chunkZ: 2, context: snowy });
  const collect = () => {
    const out = [];
    realizeIgloo(start, (x, y, z, id) => { out.push(`${x},${y},${z},${id}`); return true; }, BLOCKS);
    return out;
  };
  assert.deepEqual(collect(), collect(), 'two realizations of the same plan must be identical');

  // Clipping to a far chunk must write nothing; clipping to the structure's own chunk must write something.
  const engine = createStructureEngine({ seed: 5, blockIds: BLOCKS, ...snowy });
  const far = [];
  engine.realize(start, (x, y, z, id) => { far.push({ x, z, id }); return true; }, { chunkX: 40, chunkZ: 40 });
  assert.equal(far.length, 0);
  const near = [];
  engine.realize(start, (x, y, z, id) => { near.push({ x, z, id }); return true; }, { chunkX: 2, chunkZ: 2 });
  assert.ok(near.length > 0, 'the structure writes into its own chunk');
});

// ---- Wiki parity: the blueprint and the fact card ----------------------------------------------------------------

test('the igloo is the wiki blueprint: the dome and basement counts match the materials table', async () => {
  const { buildIglooTop: top, buildIglooBasement: bottom } = await import('../src/worldgen/templates/igloo.js');
  const count = (data) => {
    const out = {};
    for (const b of data.blocks) { const n = data.palette[b.state].Name.replace('minecraft:', ''); out[n] = (out[n] ?? 0) + 1; }
    return out;
  };
  const dome = count(top({ hasBasement: true }));
  assert.deepEqual([dome.snow_block, dome.white_carpet, dome.light_gray_carpet, dome.ice, dome.furnace, dome.crafting_table, dome.redstone_torch, dome.oak_trapdoor],
    [94, 9, 3, 2, 1, 1, 1, 1]);
  const plain = count(top({ hasBasement: false }));
  assert.equal(plain.snow_block, 95, 'without a basement the trapdoor is a snow block');
  assert.equal(plain.oak_trapdoor, undefined);
  const cellar = count(bottom({ seed: 4 }));
  assert.deepEqual([cellar.chiseled_stone_bricks, cellar.infested_chiseled_stone_bricks, cellar.mossy_stone_bricks, cellar.infested_mossy_stone_bricks,
    cellar.infested_stone_bricks, cellar.cracked_stone_bricks, cellar.stone, cellar.iron_bars, cellar.water_cauldron, cellar.brewing_stand, cellar.potted_cactus, cellar.chest],
  [7, 2, 17, 1, 6, 8, 11, 4, 1, 1, 1, 1]);
  // Where the drawing and the table differ, the drawing is followed; pinned so a wiki edit shows up here.
  assert.equal(cellar.stone_bricks, 172, 'the table says 176');
  assert.equal(cellar.ladder, 21, 'the table says 22');
});

test('every igloo fact passes, with and without a basement, in flat and real-world mode', async () => {
  const { auditStructure } = await import('../src/structureAudit.js');
  const seen = new Set();
  for (const [mode, seed] of [['flat', 20250401], ['flat', 3], ['world', 2024], ['world', 7]]) {
    const result = await auditStructure('igloo', { mode, seed });
    seen.add(result.observation.start.meta.hasBasement);
    assert.deepEqual(result.rows.filter((r) => r.status === 'fail').map((r) => `${r.id}: ${r.detail}`), [], `${mode} ${seed}`);
  }
  assert.equal(seen.size, 2, 'both variants were checked');
});
