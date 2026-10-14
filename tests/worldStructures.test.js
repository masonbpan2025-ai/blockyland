// Structures in a GENERATED WORLD.
//
// This file exists because its absence let the whole subsystem ship unused. Every other structure test drives
// the engine directly, so all of them passed while a generated world contained no structure at all -- the
// engine was imported by nothing except the Inspector page. The tests here start from `new World(seed)` and
// assert that a structure's blocks are IN a chunk, which is the only thing that answers "do I see structures
// when I generate a world?".
import test from 'node:test';
import assert from 'node:assert/strict';

import { World, CHUNK_SIZE_X, CHUNK_HEIGHT, CHUNK_SIZE_Z } from '../src/world.js';
import { createWorldStructures, locateNearestStructure, WORLD_STRUCTURE_IDS, STRUCTURE_SEARCH_RADIUS_CHUNKS } from '../src/worldStructures.js';
import { createStructureEngine } from '../src/worldgen/index.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';

const nameOf = (id) => BLOCK_DEFS[id]?.name ?? `block ${id}`;

/** Every distinct block id in a chunk. */
function chunkBlocks(chunk) {
  const seen = new Set();
  for (let i = 0; i < chunk.voxels.length; i++) {
    const id = chunk.voxels[i];
    if (id !== BLOCKS.AIR) seen.add(id);
  }
  return seen;
}

/** The chunk a structure's nearest instance starts in, found through the ENGINE at the same seed. */
function startChunkFor(seed, structureId, biome) {
  const engine = createStructureEngine({
    seed,
    blockIds: BLOCKS,
    biomeAt: () => biome,
    surfaceY: () => 40
  });
  const found = engine.locate(structureId, 0, 0, { maxRadiusChunks: 1024 });
  return found ? found.chunk : null;
}

test('the world actually generates the engine\'s structures', () => {
  // The core regression: a generated world must contain a structure. A desert world is used because the gate is
  // deterministic there, so a failure means the wiring is broken rather than the biome luck.
  //
  // What the structure IS is measured by DIFFERENCE against a world with the integration disabled, because
  // naming the blocks beforehand is how the first version of this test passed vacuously: it looked for
  // "chiselled sandstone", which this generator does not use, and found nothing while the pyramid was in fact
  // placed. A differential cannot be wrong about the names.
  const seed = 20250401;
  const world = new World(seed, 'desert');
  const without = new World(seed, 'desert');
  without.structures = createWorldStructures({
    seed,
    world: without,
    sizes: { x: CHUNK_SIZE_X, height: CHUNK_HEIGHT, z: CHUNK_SIZE_Z },
    enabledIds: []
  });

  const chunk = startChunkFor(seed, 'desert_pyramid', 'desert');
  assert.ok(chunk, 'the engine must be able to locate a desert pyramid at this seed');

  // The structure spans several chunks; the one it STARTS in holds most of it.
  const withVoxels = world.getOrCreateChunk(chunk[0], chunk[1]).voxels;
  const withoutVoxels = without.getOrCreateChunk(chunk[0], chunk[1]).voxels;
  const added = new Map();
  for (let i = 0; i < withVoxels.length; i++) {
    if (withVoxels[i] !== withoutVoxels[i]) {
      // Keyed by ID, not by name: `BLOCK_DEFS[id].name` is the DISPLAY name ("Stone Pressure Plate"), so a test
      // written against namespaced names would fail for the wrong reason.
      added.set(withVoxels[i], (added.get(withVoxels[i]) ?? 0) + 1);
    }
  }
  const addedNames = [...added.keys()].map(nameOf).join(', ');
  assert.ok(added.size > 0, 'the start chunk must contain structure blocks the plain world does not have');
  // The pyramid's trap is its most specific content: the wiki's desert pyramid hides a TNT trap triggered by a
  // stone pressure plate. Asserting the SIGNATURE rather than a block count means the test fails if the
  // structure is placed as an empty shell.
  assert.ok(added.has(BLOCKS.STONE_PRESSURE_PLATE), 'the pressure plate must be placed; found: ' + addedNames);
  assert.ok(added.has(BLOCKS.TNT), 'and the TNT trap with it');
  assert.ok(added.has(BLOCKS.CHEST), 'and the loot chests');
  assert.ok(world.structures.stats.structures > 0, 'the integration must report having placed a structure');
  assert.ok(world.structures.stats.blocks > 0, 'and having written blocks');
  assert.equal(world.structures.stats.outOfWorld, 0, 'every block of a surface structure fits this world');
});

test('structures are placed through the world, and the world reports it', () => {
  const world = new World(4242, 'desert');
  const integration = world.structures;
  assert.ok(integration, 'the world must own the integration');
  assert.deepEqual(integration.enabledIds, WORLD_STRUCTURE_IDS);
  // Every enabled id must map to a set, or the chunk scan would skip it for ever.
  assert.ok(integration.enabledSets.length > 0, 'the enabled ids must belong to sets');
  assert.equal(integration.stats.chunks, 0, 'nothing is generated before a chunk is asked for');
  world.getOrCreateChunk(0, 0);
  assert.equal(integration.stats.chunks, 1, 'generating one chunk runs the integration once per chunk');
});

test('a chunk writes only its own voxels, so generation ORDER cannot change the world', () => {
  // The property the per-chunk clip buys, and the reason it was chosen over writing neighbours: generating the
  // chunks in a different order must give byte-identical results. If a structure wrote across borders, the
  // second order would find some of its blocks already written by a neighbour and drop them.
  const seed = 777;
  const first = new World(seed, 'desert');
  const second = new World(seed, 'desert');
  const orderA = [[0, 0], [1, 0], [0, 1], [1, 1]];
  const orderB = [[1, 1], [0, 1], [1, 0], [0, 0]];
  for (const [cx, cz] of orderA) first.getOrCreateChunk(cx, cz);
  for (const [cx, cz] of orderB) second.getOrCreateChunk(cx, cz);
  for (const [cx, cz] of orderA) {
    const a = first.getChunk(cx, cz).voxels;
    const b = second.getChunk(cx, cz).voxels;
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        assert.fail(`chunk ${cx},${cz} differs at index ${i}: ${nameOf(a[i])} vs ${nameOf(b[i])}`);
      }
    }
  }
});

test('the same seed generates the same structures, and a reseed places different ones', () => {
  const a = new World(31337, 'desert');
  const b = new World(31337, 'desert');
  // Generating the same chunks in the same order must give identical structure stats.
  for (const [cx, cz] of [[0, 0], [1, 0], [2, 0]]) a.getOrCreateChunk(cx, cz);
  for (const [cx, cz] of [[0, 0], [1, 0], [2, 0]]) b.getOrCreateChunk(cx, cz);
  assert.deepEqual(a.structures.stats, b.structures.stats, 'the same seed must place the same structures');

  // A reseed must FORGET the plans: keeping them would place the old seed's structures in the new world.
  const before = a.structures;
  a.reseed(999, 'desert');
  assert.notEqual(a.structures, before, 'a reseed must build a new integration');
  assert.equal(a.structures.stats.chunks, 0, 'and must start with no chunks seen');
});

test('a structure outside this world\'s height is REPORTED, not silently dropped', () => {
  // Every registry structure fits this 64-tall world now (deep ones have their Y bands mapped onto it), so the rule is
  // exercised with a world made too short for one: an ancient city (its floor at y 13) in a world 10 blocks tall
  // must produce a COUNT of refused blocks rather than an empty chunk that looks like the wiring failed.
  const HEIGHT = 10;
  const stub = { getBiome: () => 'deep_dark', surfaceHeightAt: () => 8 };
  const integration = createWorldStructures({
    seed: 4242,
    world: stub,
    sizes: { x: CHUNK_SIZE_X, height: HEIGHT, z: CHUNK_SIZE_Z },
    enabledIds: ['ancient_city']
  });
  const found = integration.engine.locate('ancient_city', 0, 0, { maxRadiusChunks: 4096 });
  assert.ok(found, 'the engine must find an ancient city in a deep-dark world');

  // A chunk object shaped like the real one, so the integration's clamping is exercised for real.
  const voxels = new Uint16Array(CHUNK_SIZE_X * HEIGHT * CHUNK_SIZE_Z);
  const chunk = {
    cx: found.chunk[0],
    cz: found.chunk[1],
    voxels,
    getVoxel(lx, ly, lz) { return voxels[(ly * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx]; },
    setVoxel(lx, ly, lz, id) { voxels[(ly * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx] = id; }
  };
  integration.applyToChunk(chunk);
  assert.ok(integration.stats.outOfWorld > 0, 'every refused block must be COUNTED, not silently dropped');
  assert.ok(integration.stats.outOfWorld > integration.stats.blocks, 'and most of the city is refused');
});

test('disabling every structure writes nothing, so the gate is real', () => {
  // The control: if the previous tests passed for an integration that ignored its own id list, they would prove
  // nothing about gating.
  const seed = 20250401;
  const world = new World(seed, 'desert');
  const none = createWorldStructures({
    seed,
    world,
    sizes: { x: CHUNK_SIZE_X, height: CHUNK_HEIGHT, z: CHUNK_SIZE_Z },
    enabledIds: []
  });
  const chunk = startChunkFor(seed, 'desert_pyramid', 'desert');
  none.applyToChunk(world.getOrCreateChunk(chunk[0], chunk[1]));
  assert.equal(none.stats.structures, 0, 'nothing may be placed when nothing is enabled');
  assert.equal(none.stats.blocks, 0, 'and no blocks written');
  assert.equal(none.enabledSets.length, 0, 'and no sets are considered');
});

test('the search radius covers every enabled structure', () => {
  // A per-chunk scan only finds a structure whose START is within the radius, so the radius has to exceed the
  // horizontal reach of everything enabled. This derives the reach from a real plan rather than asserting a
  // number, so adding a larger structure to the list fails here instead of silently clipping it.
  const world = new World(20250401, 'desert');
  const integration = createWorldStructures({
    seed: 20250401,
    world,
    sizes: { x: CHUNK_SIZE_X, height: CHUNK_HEIGHT, z: CHUNK_SIZE_Z }
  });
  const reach = STRUCTURE_SEARCH_RADIUS_CHUNKS * CHUNK_SIZE_X;
  for (const id of WORLD_STRUCTURE_IDS) {
    // Find it somewhere, then check a start's own extent cannot exceed the scan.
    const biomes={igloo:'snowy_plains',village_plains:'plains',desert_pyramid:'desert',fortress:'nether_wastes',bastion_remnant:'nether_wastes',nether_fossil:'soul_sand_valley',ruined_portal_nether:'nether_wastes'};
    const dimension=['fortress','bastion_remnant','nether_fossil','ruined_portal_nether'].includes(id)?'nether':'overworld';
    const engine=createStructureEngine({seed:20250401,dimension,blockIds:BLOCKS,biomeAt:()=>biomes[id],surfaceY:()=>dimension==='nether'?20:40});
    const found = engine.locate(id, 0, 0, { maxRadiusChunks: 128 });
    if (!found) continue; // not in this world's biomes: nothing to measure
    const box = found.start.box;
    const centreX=found.chunk[0]*16+8,centreZ=found.chunk[1]*16+8;
    const extent = Math.max(Math.abs(box.minX-centreX),Math.abs(box.maxX-centreX),Math.abs(box.minZ-centreZ),Math.abs(box.maxZ-centreZ));
    assert.ok(extent <= reach,
      `${id} spans ${extent} blocks, more than the ${reach}-block scan radius: raise STRUCTURE_SEARCH_RADIUS_CHUNKS`);
  }
});

test('every enabled structure actually appears in a world of its biome', () => {
  // One structure passing does not mean the LIST works: each enabled id has its own set, its own biome gate and
  // its own Y band, and any of those can be wrong while the mechanism looks fine. Measured by difference against
  // a world with the integration disabled, so no block name is assumed.
  const cases = [
    { id: 'desert_pyramid', biome: 'desert' },
    { id: 'igloo', biome: 'snowy_plains' },
    { id: 'village_plains', biome: 'plains' }
  ];
  for (const { id, biome } of cases) {
    const seed = 4242;
    const world = new World(seed, biome);
    const without = new World(seed, biome);
    without.structures = createWorldStructures({
      seed, world: without, sizes: { x: CHUNK_SIZE_X, height: CHUNK_HEIGHT, z: CHUNK_SIZE_Z }, enabledIds: []
    });
    const found = createStructureEngine({ seed, blockIds: BLOCKS, biomeAt: () => biome, surfaceY: () => 40 })
      .locate(id, 0, 0, { maxRadiusChunks: 2048 });
    assert.ok(found, `${id} must be locatable in ${biome}`);

    const withVoxels = world.getOrCreateChunk(found.chunk[0], found.chunk[1]).voxels;
    const withoutVoxels = without.getOrCreateChunk(found.chunk[0], found.chunk[1]).voxels;
    let added = 0;
    for (let i = 0; i < withVoxels.length; i++) if (withVoxels[i] !== withoutVoxels[i]) added++;
    assert.ok(added > 0, `${id} placed nothing in its own start chunk (${found.chunk.join(',')})`);
    assert.equal(world.structures.stats.outOfWorld, 0, `${id} must fit inside this world's height`);
  }
});

// --- /locate structure -------------------------------------------------------

test('locate reports where the nearest structure is, and how far', () => {
  // The command that separates "far away" from "broken". The player has to WALK to the answer, so the centre of
  // the box is reported rather than a corner a village's 50-block width would make useless.
  const world = new World(4242, 'snowy_plains');
  const found = locateNearestStructure(world, 'igloo', 0, 0, { maxRadiusChunks: 1024 });
  assert.equal(found.structureId, 'igloo');
  assert.equal(found.chunk.length, 2);
  assert.ok(found.centre.x > found.box[0] && found.centre.x < found.box[3], 'the centre must be inside the box');
  assert.ok(found.distance > 0, 'a distance in blocks from where the player asked');
  assert.equal(found.biome, 'snowy_plains', 'and the biome, which is why it is there at all');
});

test('locate refuses a structure this world does not generate, and names the ones it does', () => {
  // An error that lists the alternatives is the difference between a dead end and an answer.
  const world = new World(4242, 'desert');
  assert.throws(() => locateNearestStructure(world, 'ancient_city', 0, 0), /not generated in this world; try: .*desert_pyramid/);
  assert.throws(() => createWorldStructures({ seed: 1, world, sizes: { x: 16, height: 64, z: 16 }, enabledIds: [] })
    && locateNearestStructure({ structures: { enabledIds: [], engine: null } }, '', 0, 0), /no structures are enabled/);
});

test('locate with no id uses the first enabled structure, so a bare command still answers', () => {
  const world = new World(4242, 'plains');
  const found = locateNearestStructure(world, '', 0, 0, { maxRadiusChunks: 2048 });
  assert.ok(world.structures.enabledIds.includes(found.structureId));
});

test('the default world has NO structure near spawn, which is why the command is needed', () => {
  // This is the reported complaint written down as a fact: the game creates `new World()` -- seed 4289, all
  // biomes -- and the nearest structure to spawn is hundreds of blocks away, so a player who generates a world
  // and looks around sees nothing at all. The structures are generated; they are sparse, as vanilla spacing
  // makes them. If placement ever becomes dense enough to see from spawn, this test should be updated rather
  // than deleted, because the number is the explanation.
  const world = new World(); // exactly what the game builds
  const found = locateNearestStructure(world, 'igloo', 0, 0, { maxRadiusChunks: 2048 });
  assert.ok(found.distance > 128, 'the nearest igloo is ' + found.distance + ' blocks from spawn');
  assert.equal(world.structures.stats.structures, 0, 'and nothing has been placed before any chunk is generated');
});
