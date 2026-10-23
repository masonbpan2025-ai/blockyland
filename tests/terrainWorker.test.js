// Terrain generation on a worker thread (src/terrainWorkerClient.js): the same world, for far less main-thread time.
//
// Walking into new land used to stall: each chunk coming into range was generated whole on the main thread, in one
// frame. The worker moves that work to another thread. Two things must hold, and these tests hold the game to both:
//
//   - Nothing about the world changes. A chunk made by the worker and adopted by the game must leave the world --
//     blocks, water, orientations, the structures' requests, loot, light -- exactly as generating it in the game
//     would. That rests on generation reading no chunk but its own, which is tested directly.
//   - The main thread does much less per chunk. Measured as the time spent inside the streamer's update, which is
//     the time a frame loses, walking the same path with and without the worker.
//
// The worker here runs in-process (TerrainWorkerClient.inProcess), answering asynchronously as a real one does;
// e2e/terrainWorker.pw.js runs the real module worker in a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, CHUNK_SIZE_X } from '../src/world.js';
import { ChunkStreamer } from '../src/chunkStreamer.js';
import { TerrainWorkerClient, generationDifference } from '../src/terrainWorkerClient.js';
import { createTerrainService } from '../src/terrainService.js';

console.warn = () => {}; // the atlas-less texture stub is noisy and irrelevant here
const quiet = { warn() {} };
const J = (value) => JSON.stringify(value);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Everything about a world that generation can touch, in a comparable form. */
function worldState(world, chunkKeys) {
  const voxels = chunkKeys.map((key) => {
    const chunk = world.chunks.get(key);
    return chunk ? `${key}:${Buffer.from(chunk.voxels.buffer).toString('base64').length}:${hash(chunk.voxels)}:${hash(chunk.waterLevels)}` : `${key}:missing`;
  });
  return {
    voxels,
    orientations: [...world.structureOrientations.entries()].map(([k, v]) => k + J(v)).sort(),
    orientationRequests: world.structures.orientations.map(J).sort(),
    spawnRequests: world.structures.spawns.map(J).sort(),
    pending: world.structures.pendingSpawns.map((e) => e.kind + J(e.request)).sort(),
    loot: world.structures.loot.map(J).sort(),
    counts: J({ ...world.structures.stats, planned: 0 }),
  };
}

function hash(array) {
  let h = 2166136261;
  for (let i = 0; i < array.length; i++) h = Math.imul(h ^ array[i], 16777619);
  return h >>> 0;
}

/** A game stub for the streamer: no real meshes, but a real world and, optionally, a terrain worker. */
function makeGame({ seed = 2024, biome = 'all', worker = null } = {}) {
  const world = new World(seed, biome);
  const scene = new THREE.Scene();
  return {
    world, scene, worldReady: true, terrainWorker: worker,
    player: { position: new THREE.Vector3(8, 40, 8) },
    blockLighting: { setChunk() {} },
    rebuildChunkMesh(chunk) { chunk.dirty = false; },
  };
}

test('a chunk generated alone is the chunk generated among its neighbours', () => {
  // The property the whole design rests on: a worker holds only the chunk it is making.
  for (const [seed, biome] of [[99, 'all'], [12345, 'plains']]) {
    const full = new World(seed, biome);
    // Generation itself: once generated, a chunk's water runs on into the chunks beside it (world.js #settleNewWater).
    full.newWater = null;
    for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) full.getOrCreateChunk(cx, cz);
    for (const [cx, cz] of [[-1, -1], [1, 0], [0, 1], [1, 1], [-1, 1]]) {
      const alone = new World(seed, biome);
      const record = alone.generateDetached(cx, cz);
      const chunk = full.getChunk(cx, cz);
      assert.deepEqual([...record.voxels], [...chunk.voxels], `${seed} ${cx},${cz}: blocks`);
      assert.deepEqual([...record.waterLevels], [...chunk.waterLevels], `${seed} ${cx},${cz}: water`);
      assert.equal(alone.chunks.size, 0, 'the detached world keeps nothing');
    }
  }
});

test('an adopted chunk leaves the world exactly as generating it there would', () => {
  for (const [seed, biome] of [[2024, 'all'], [31337, 'dark_forest'], [8, 'swamp']]) {
    const game = new World(seed, biome); // generates for itself
    const worker = new World(seed, biome); // the worker's copy
    const adopter = new World(seed, biome); // takes the worker's chunks
    const coords = [];
    for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) if (cx || cz) coords.push([cx, cz]);
    const adopt = (cx, cz) => adopter.adoptGeneratedChunk(structuredClone(
      worker.generateDetached(cx, cz, adopter.structures.appliedKeysFor(cx, cz), adopter.structures.realizedKeysFor(cx, cz))));
    for (const [cx, cz] of coords) { game.getOrCreateChunk(cx, cz); assert.ok(adopt(cx, cz)); }
    // Unload and come back, as the streamer does: the structures' memory of what is placed must be shared the same way.
    for (const [cx, cz] of coords.slice(0, 10)) {
      for (const w of [game, adopter]) { w.chunks.delete(`${cx},${cz}`); w.structures.forgetChunk(cx, cz); w.light.removeChunk(cx, cz); w.invalidateChunkCache(); }
      game.getOrCreateChunk(cx, cz);
      adopt(cx, cz);
    }
    const keys = coords.map(([cx, cz]) => `${cx},${cz}`);
    const a = worldState(game, keys), b = worldState(adopter, keys);
    for (const name of Object.keys(a)) assert.deepEqual(b[name], a[name], `${seed} ${biome}: ${name}`);
    assert.ok(a.orientationRequests.length > 0 || a.orientations.length > 0, 'the area has structures or features to compare');
    game.light.relightAll(); adopter.light.relightAll();
    for (const key of keys) {
      assert.deepEqual([...adopter.light.chunks.get(key).sky], [...game.light.chunks.get(key).sky], `${key}: sky light`);
      assert.deepEqual([...adopter.light.chunks.get(key).block], [...game.light.chunks.get(key).block], `${key}: block light`);
    }
    assert.equal(adopter.adoptGeneratedChunk(worker.generateDetached(1, 1)), null, 'a chunk the world already has is not replaced');
  }
});

test('a chunk unloaded and generated again gets its structures back, without their mobs a second time', () => {
  // Walk far enough away that a chunk is unloaded, then come back. The structure engine remembered it had written
  // its structures there and skipped them, so the chunk came back as bare terrain: holes in villages.
  for (const [seed, biome] of [[99, 'all'], [12345, 'plains']]) {
    const world = new World(seed, biome);
    // Water run on into loaded neighbours (world.js #settleNewWater) depends on which are loaded, and a plant it washed
    // away the first time may stand the second; that is settleWater.test.js's subject, the structures are this one's.
    world.newWater = null;
    const game = { world, scene: new THREE.Scene(), blockLighting: { setChunk() {} } };
    const streamer = new ChunkStreamer(game);
    let restored = 0, withStructures = 0;
    for (let cx = -6; cx <= 6; cx++) for (let cz = -6; cz <= 6; cz++) {
      if (!cx && !cz) continue;
      const chunk = world.getOrCreateChunk(cx, cz);
      const blocks = chunk.voxels.slice();
      const placed = world.structures.appliedKeysFor(cx, cz).length;
      const orientations = [...world.structureOrientations.values()].filter((o) => Math.floor(o.x / 16) === cx && Math.floor(o.z / 16) === cz).map(J).sort();
      const spawnRequests = world.structures.spawns.length;
      streamer.unloadChunk(chunk);
      assert.equal(world.getChunk(cx, cz), undefined, 'unloaded');
      const again = world.getOrCreateChunk(cx, cz);
      assert.deepEqual([...again.voxels], [...blocks], `${seed} ${cx},${cz}: the same blocks as the first time`);
      assert.deepEqual([...world.structureOrientations.values()].filter((o) => Math.floor(o.x / 16) === cx && Math.floor(o.z / 16) === cz).map(J).sort(), orientations);
      assert.equal(world.structures.spawns.length, spawnRequests, `${cx},${cz}: no second set of mobs`);
      if (placed) { withStructures++; restored++; }
    }
    assert.ok(withStructures > 0, `${seed}: some chunks held structures`);
  }
});

test('the worker is used only after it reproduces chunks the game generated itself', async () => {
  const client = TerrainWorkerClient.inProcess({ log: quiet });
  const game = makeGame({ worker: client });
  client.sync(game);
  assert.equal(client.state, 'starting');
  assert.equal(client.canGenerate(game.world, 3, 3), false, 'not trusted before it is checked');
  // The game's own next chunks become the probes.
  game.world.getOrCreateChunk(4, 1);
  game.world.getOrCreateChunk(-2, 5);
  game.world.getOrCreateChunk(0, 0); // the start village chunk is never a probe
  assert.equal(client.probeList.length, 2);
  assert.equal(game.world.generationProbe, null, 'recording stops once there are enough');
  for (let i = 0; i < 50 && client.state !== 'ready'; i++) await tick();
  assert.equal(client.state, 'ready', client.failure ?? '');
  assert.equal(client.canGenerate(game.world, 3, 3), true);
  assert.equal(client.canGenerate(game.world, 0, 0), false);
  // A new world (a reseed builds a new structure engine) needs a new check.
  game.world.reseed(5, 'all');
  client.sync(game);
  assert.equal(client.state, 'starting');
  client.stop();
});

test('a worker that disagrees with the game is never used', async () => {
  // A worker whose copy of the world has the wrong seed: everything it makes differs from the game's terrain.
  const client = new TerrainWorkerClient({
    log: quiet,
    connect: (onMessage) => {
      const service = createTerrainService({ sharedRealm: true });
      return {
        post: (message) => setTimeout(() => {
          const sent = structuredClone(message);
          if (sent.type === 'init') sent.config.seed += 1;
          onMessage(structuredClone(service.handle(sent).reply));
        }, 0),
        terminate() {},
      };
    },
  });
  const game = makeGame({ worker: client });
  const streamer = new ChunkStreamer(game, { meshRadius: 1, generateRadius: 2, unloadRadius: 4 });
  for (let frame = 0; frame < 200; frame++) { streamer.update(8, 8); await tick(); }
  assert.equal(client.state, 'failed');
  assert.match(client.failure, /disagrees with the game/);
  assert.equal(streamer.stats.adopted, 0, 'nothing it made was put in the world');
  assert.equal(game.world.chunks.size, 25, 'the game generated the area itself');
});

test('chunks the worker cannot make are left to the game', async () => {
  const client = TerrainWorkerClient.inProcess({ log: quiet });
  const game = makeGame({ worker: client });
  client.sync(game);
  game.world.getOrCreateChunk(5, 5); game.world.getOrCreateChunk(6, 5);
  for (let i = 0; i < 50 && client.state !== 'ready'; i++) await tick();
  assert.equal(client.state, 'ready', client.failure ?? '');
  const { world } = game;
  assert.equal(client.canGenerate(world, 0, 0), false, 'the start village chunk');
  world.biomeOverrides = new Map([['1,1', 'desert']]);
  assert.equal(client.canGenerate(world, 3, 3), false, '/fillbiome overrides');
  world.biomeOverrides = null;
  world.switchDimension('nether');
  assert.equal(client.canGenerate(world, 3, 3), false, 'the Nether');
  world.switchDimension('overworld');
  assert.equal(client.canGenerate(world, 3, 3), true);
  client.setEnabled(false);
  assert.equal(client.canGenerate(world, 3, 3), false, 'switched off');
});

/**
 * Walk the same path with and without the worker. Returns the world and, for every update that brought a chunk
 * into the world, the milliseconds that update took on the calling thread.
 */
async function walk({ worker }) {
  const game = makeGame({ seed: 2024, biome: 'all', worker });
  const streamer = new ChunkStreamer(game, { meshRadius: 2, generateRadius: 3, unloadRadius: 6 });
  // The first chunks around the start are generated by the game, as the loading screen does. The game starts the
  // worker before that (Game.generateNewWorld calls prepare), so these chunks are what it is checked against.
  worker?.prepare(game);
  streamer.loadAllSynchronously(8, 8);
  const busy = [];
  let x = 8;
  const step = async (moveBy) => {
    x += moveBy;
    const before = game.world.chunks.size;
    const t0 = performance.now();
    streamer.update(x, 8);
    const ms = performance.now() - t0;
    if (game.world.chunks.size !== before) busy.push(ms);
    await tick(); // the worker's replies arrive between frames, as they would in the browser
  };
  for (let frame = 0; frame < 30; frame++) await step(0);
  // Walk four chunks east at a sprint (5.6 blocks a second, 60 frames a second).
  while (x < 8 + 4 * CHUNK_SIZE_X) await step(5.6 / 60);
  // Then stand still until everything in range is generated.
  for (let frame = 0; frame < 2000; frame++) {
    await step(0);
    const pcx = Math.floor(x / CHUNK_SIZE_X);
    let missing = 0;
    for (let cx = pcx - 3; cx <= pcx + 3; cx++) for (let cz = -3; cz <= 3; cz++) if (!game.world.getChunk(cx, cz)) missing++;
    if (missing === 0 && !worker?.inFlight.size) break;
  }
  return { game, streamer, busy, pcx: Math.floor(x / CHUNK_SIZE_X) };
}

test('walking with the worker builds the same world and costs the main thread far less per chunk', async () => {
  const withoutWorker = await walk({ worker: null });
  const client = TerrainWorkerClient.inProcess({ log: quiet });
  const withWorker = await walk({ worker: client });

  assert.equal(client.state, 'ready', client.failure ?? '');
  assert.ok(withWorker.streamer.stats.adopted >= 20, `the worker made most of the new chunks (${withWorker.streamer.stats.adopted})`);

  // The same world. Unloading differs a little with timing, so compare the area both still hold.
  const keys = [];
  for (let cx = withWorker.pcx - 3; cx <= withWorker.pcx + 3; cx++) for (let cz = -3; cz <= 3; cz++) keys.push(`${cx},${cz}`);
  const a = worldState(withoutWorker.game.world, keys).voxels;
  const b = worldState(withWorker.game.world, keys).voxels;
  assert.deepEqual(b, a, 'the same blocks and water in every chunk');

  // The main thread's cost per frame that brought chunks in. With the worker that frame adopts a finished chunk
  // instead of generating one. Compared as ratios of the two runs, on the same machine in the same process,
  // because absolute times on a shared machine mean little.
  const sorted = (values) => [...values].sort((p, q) => p - q);
  const median = (values) => sorted(values)[Math.floor(values.length / 2)];
  const worst = (values) => sorted(values).at(-1);
  const sync = { median: median(withoutWorker.busy), worst: worst(withoutWorker.busy) };
  const off = { median: median(withWorker.busy), worst: worst(withWorker.busy) };
  console.log(`main-thread ms per chunk-adding update: without worker median ${sync.median.toFixed(1)} worst ${sync.worst.toFixed(1)};`
    + ` with worker median ${off.median.toFixed(1)} worst ${off.worst.toFixed(1)}`);
  assert.ok(off.median < sync.median * 0.5, `median ${off.median.toFixed(1)}ms with the worker against ${sync.median.toFixed(1)}ms without`);
  assert.ok(off.worst < sync.worst * 0.5, `worst ${off.worst.toFixed(1)}ms with the worker against ${sync.worst.toFixed(1)}ms without`);
  client.stop();
});

test('generationDifference names what differs', () => {
  const base = { cx: 1, cz: 2, voxels: new Uint16Array([1, 2]), waterLevels: new Uint8Array(2), weatherRevision: 3, ops: [['set', 'a', 1]], loot: [], appliedKeys: [], stats: {} };
  assert.equal(generationDifference(base, structuredClone(base)), null);
  assert.equal(generationDifference(base, { ...structuredClone(base), voxels: new Uint16Array([1, 3]) }), 'blocks');
  assert.equal(generationDifference(base, { ...structuredClone(base), ops: [] }), 'orientations or structure requests');
  assert.equal(generationDifference(base, null), 'no result');
  assert.equal(generationDifference({ ...structuredClone(base), unrecordable: true }, structuredClone(base)), 'generation did something that could not be recorded');
});

test('recording never interrupts generation, even when a value cannot be copied', async () => {
  const { GenerationRecorder } = await import('../src/generationRecorder.js');
  const recorder = new GenerationRecorder();
  recorder.mapSet('1,2,3', { x: 1, onBreak() {} }); // a function cannot be cloned
  assert.equal(recorder.unrecordable, true);
  let applied = false;
  assert.equal(recorder.orient({ x: 1 }, () => { applied = true; return false; }), false, 'the hook\'s own answer, in the game');
  assert.equal(applied, true);
});
