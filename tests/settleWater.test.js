// New terrain's water comes to rest before its chunk appears (worldgen/settleWater.js, world.js #settleNewWater).
// A new world used to settle after it appeared: thousands of water changes in its first half minute, each re-meshing
// a chunk and waking the sand above it, so the first ten seconds ran at two frames a second.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Chunk } from '../src/world.js';
import { BLOCKS } from '../src/blocks.js';
import { settleChunkWater } from '../src/worldgen/settleWater.js';

/** Stone up to y=12, with a pool of source water on top feeding a shaft down into a tunnel. */
function cavern(chunk) {
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y <= 12; y++) chunk.setVoxel(x, y, z, BLOCKS.STONE);
  for (let x = 1; x <= 5; x++) for (let z = 6; z <= 10; z++) chunk.setVoxel(x, 12, z, BLOCKS.WATER);
  for (let y = 5; y <= 11; y++) chunk.setVoxel(3, y, 8, BLOCKS.AIR);
  for (let x = 3; x <= 13; x++) for (const y of [5, 6]) chunk.setVoxel(x, y, 8, BLOCKS.AIR);
  chunk.setVoxel(9, 5, 8, BLOCKS.SHORT_GRASS);
  return chunk;
}

const solid = (chunk) => { for (let i = 0; i < chunk.voxels.length; i++) if ((i >> 8) <= 20) chunk.voxels[i] = BLOCKS.STONE; return chunk; };

test('a chunk\'s water settles in the generator exactly as the game\'s water would run it, edges as walls', () => {
  const settled = cavern(new Chunk(0, 0));
  const changed = settleChunkWater(settled);
  assert.ok(changed > 10, `${changed} cells changed`);
  // Down the shaft, then seven blocks along the tunnel floor, as flowing water goes.
  assert.deepEqual([3, 4, 10].map((x) => settled.waterLevels[(5 * 16 + 8) * 16 + x]), [8, 1, 7]);
  assert.equal(settled.voxels[(5 * 16 + 8) * 16 + 11], BLOCKS.AIR, 'and no further');
  assert.equal(settled.voxels[(5 * 16 + 8) * 16 + 9], BLOCKS.WATER, 'and washed the grass away');
  // The same chunk run by the world's own simulation, walled in by solid neighbours.
  const world = new World();
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) world.chunks.set(`${cx},${cz}`, cx || cz ? solid(new Chunk(cx, cz)) : cavern(new Chunk(0, 0)));
  world.invalidateChunkCache();
  world.water.initChunk(world.getChunk(0, 0));
  for (let t = 0; t < 400 && world.water.pending.size; t++) world.water.tick();
  assert.deepEqual([...settled.voxels], [...world.getChunk(0, 0).voxels]);
  assert.deepEqual([...settled.waterLevels], [...world.getChunk(0, 0).waterLevels]);
  assert.equal(settleChunkWater(settled), 0, 'and it is at rest');
});

/**
 * Chunk 0,0 holds a pool against its +x edge; chunk 1,0 arrives with a tunnel from that edge, a plant in it and sand
 * over it. Everything else is solid.
 */
function edgeWorld() {
  const world = new World();
  world.generateChunkTerrain = (chunk) => {
    solid(chunk);
    if (chunk.cx === 0 && chunk.cz === 0) for (let x = 11; x <= 15; x++) for (let z = 6; z <= 10; z++) chunk.setVoxel(x, 20, z, BLOCKS.WATER);
    if (chunk.cx === 1 && chunk.cz === 0) {
      for (let x = 0; x <= 8; x++) chunk.setVoxel(x, 20, 8, BLOCKS.AIR);
      chunk.setVoxel(4, 20, 8, BLOCKS.SHORT_GRASS);
      chunk.setVoxel(3, 21, 8, BLOCKS.SAND);
    }
  };
  let displaced = 0;
  world.water.onDisplace = () => displaced++;
  return { world, displaced: () => displaced };
}

test('water runs on into a chunk as it arrives, before it is drawn, waking no sand and dropping nothing', () => {
  const { world, displaced } = edgeWorld();
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) if (cx !== 1) world.getOrCreateChunk(cx, cz);
  // A flow of the game's own, waiting elsewhere: arriving terrain must not hurry it along.
  world.water.pending.clear();
  world.setVoxel(-8, 25, -8, BLOCKS.WATER, 1);
  const ownFlow = new Set(world.water.pending);
  assert.ok(ownFlow.size > 0);
  for (let cz = -1; cz <= 1; cz++) world.getOrCreateChunk(1, cz);
  assert.equal(world.getWaterLevel(22, 20, 8), 7, 'the water ran seven blocks along the tunnel');
  assert.equal(world.getVoxel(20, 20, 8), BLOCKS.WATER, 'washing the grass away');
  assert.equal(displaced(), 0, 'without dropping it as an item');
  assert.equal(world.getVoxel(19, 21, 8), BLOCKS.SAND, 'the sand over the tunnel stays where it was generated');
  assert.equal(world.fallingBlocks.pending.size, 0);
  assert.equal(world.getChunk(0, 0).modified, undefined, 'the chunk it flowed out of can still be generated again');
  for (const key of ownFlow) assert.ok(world.water.pending.has(key), 'the game\'s own flow is still waiting for its tick');
  assert.equal(world.getVoxel(-8, 24, -8), BLOCKS.AIR, 'and has not run on down');
});

test('a generated world\'s water is at rest when it appears', () => {
  const run = (arrival) => {
    const world = new World(12345);
    if (!arrival) world.newWater = null;
    for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) world.getOrCreateChunk(cx, cz);
    let changes = 0;
    for (let t = 0; t < 300 && world.water.pending.size; t++) changes += world.water.tick();
    return changes;
  };
  const before = run(false), after = run(true);
  assert.ok(before > 200, `without it the water moved ${before} times after the world appeared`);
  assert.ok(after < before / 10, `${after} changes after the world appeared, against ${before}`);
});

test('the water\'s route search gives the answers it always gave', async () => {
  // directions() was rewritten without the strings and sets it made for every cell it visited (most of the water's
  // time, and of settling it). This is the search as it was, run against the new one on random rubble.
  const { WaterSimulation } = await import('../src/waterSimulation.js');
  const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function before(sim, x, y, z) {
    const costs = SIDES.map(([dx, dz]) => {
      if (!sim.passable(x + dx, y, z + dz)) return Infinity;
      const queue = [[x + dx, z + dz, 0]], seen = new Set([`${x},${z}`]);
      for (let i = 0; i < queue.length; i++) {
        const [px, pz, depth] = queue[i], k = `${px},${pz}`;
        if (seen.has(k)) continue;
        seen.add(k);
        if (sim.canFall(px, y, pz)) return depth;
        if (depth >= 3) continue;
        for (const [sx, sz] of SIDES) if (sim.passable(px + sx, y, pz + sz)) queue.push([px + sx, pz + sz, depth + 1]);
      }
      return Infinity;
    });
    const best = Math.min(...costs);
    return SIDES.filter((_, i) => costs[i] === best);
  }
  let seed = 7;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const world = new World();
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) {
    const c = new Chunk(cx, cz);
    for (let i = 0; i < c.voxels.length; i++) { const y = i >> 8; c.voxels[i] = y < 4 ? BLOCKS.STONE : y < 7 && random() < 0.45 ? BLOCKS.STONE : y < 7 && random() < 0.15 ? BLOCKS.WATER : BLOCKS.AIR; }
    world.chunks.set(`${cx},${cz}`, c);
  }
  world.invalidateChunkCache();
  const sim = new WaterSimulation(world);
  let checked = 0;
  for (let x = -12; x < 28; x++) for (let z = -12; z < 28; z++) for (let y = 4; y < 7; y++) {
    sim.routes.clear();
    assert.deepEqual(sim.directions(x, y, z), before(sim, x, y, z), `${x},${y},${z}`);
    checked++;
  }
  assert.equal(checked, 40 * 40 * 3);
});
