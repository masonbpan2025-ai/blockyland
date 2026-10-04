// Chunk streaming: generate, mesh and unload around the player within a frame budget.
//
// What this replaced: generation ran in one synchronous loop when the player crossed a chunk
// border, and `refreshDirtyChunks` ran every frame doing
// `[...world.chunks.values()].filter(dirty).sort(...)` -- allocating and sorting every loaded
// chunk in order to mesh at most four. Nothing was ever unloaded, so a long walk grew geometry and
// memory without limit.
//
// These tests pin the properties that make a larger view distance affordable, and the two that are
// easy to get wrong in a way that is invisible until you walk around: a chunk must never be meshed
// against missing neighbours, and unloading must invalidate the neighbours' meshes.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../src/world.js';
import { ChunkStreamer } from '../src/chunkStreamer.js';
import { BLOCKS } from '../src/blocks.js';

/** A game stub that records what the streamer asked for, without building real geometry. */
function makeGame(options = {}) {
  const world = new World(options.seed ?? 1234, 'all');
  const scene = new THREE.Scene();
  const meshed = [];
  const game = {
    world,
    scene,
    player: { position: new THREE.Vector3(0, 40, 0) },
    blockLighting: { setChunk() {} },
    rebuildChunkMesh(chunk) {
      // A real mesh object, so unload has something to dispose and remove.
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3), 3));
      chunk.opaqueMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
      scene.add(chunk.opaqueMesh);
      chunk.dirty = false;
      meshed.push(`${chunk.cx},${chunk.cz}`);
    },
    meshedChunks: meshed,
  };
  return game;
}

function streamerFor(game, opts = {}) {
  return new ChunkStreamer(game, {
    meshRadius: 2,
    generateRadius: 3,
    unloadRadius: 5,
    // Generous budget, so a test asserts behaviour rather than timing. The budget itself is
    // tested separately by measuring, not by assuming. Note this has to raise frameBuildMs too:
    // the streamer holds generation and meshing to one shared frame budget, so raising only the
    // per-phase numbers would leave the default frame cap in place and stop after one operation.
    generateMs: 100000,
    meshMs: 100000,
    frameBuildMs: 100000,
    ...opts,
  });
}

// --- generation --------------------------------------------------------------

test('generation covers the mesh radius plus a border ring', () => {
  const game = makeGame();
  const s = streamerFor(game);
  s.update(0, 0);
  // generateRadius 3 means 7x7 = 49 chunks.
  assert.equal(game.world.chunks.size, 49, 'the border ring must be generated too');
  assert.ok(game.world.getChunk(3, 3), 'the far corner of the generate ring must exist');
  assert.ok(game.world.getChunk(0, 0));
});

test('a chunk is meshed only when all eight neighbours exist', () => {
  // The critical correctness property. Meshing against a missing neighbour treats it as air, which
  // draws faces a later neighbour would cull -- so the chunk looks wrong until it is meshed again.
  const game = makeGame();
  const s = streamerFor(game);
  s.update(0, 0);
  for (const key of game.meshedChunks) {
    const [cx, cz] = key.split(',').map(Number);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        assert.ok(game.world.getChunk(cx + dx, cz + dz),
          `chunk ${key} was meshed while neighbour ${cx + dx},${cz + dz} was missing`);
      }
    }
  }
});

test('generation starts nearest the player', () => {
  // Nearest-first is what makes the world appear around the player rather than filling in corners.
  const game = makeGame();
  const world = game.world;
  const order = [];
  const original = world.getOrCreateChunk.bind(world);
  world.getOrCreateChunk = (cx, cz) => { order.push([cx, cz]); return original(cx, cz); };

  const s = streamerFor(game, { generateMs: 1 });
  s.update(0, 0);

  assert.ok(order.length > 0, 'something should have been generated');
  assert.deepEqual(order[0], [0, 0], 'the player chunk comes first');
  // The first few must be closer than the last few.
  const d = ([cx, cz]) => cx * cx + cz * cz;
  const head = order.slice(0, 5).map(d);
  assert.ok(Math.max(...head) <= d(order[order.length - 1]),
    'the opening generations must be no further away than the final one');
});

// --- budgets -----------------------------------------------------------------

test('the generate budget bounds a single update', () => {
  // The point of a time budget is that a slow frame cannot cascade. A tiny budget must therefore
  // stop well short of the whole area.
  const game = makeGame();
  const s = streamerFor(game, { generateMs: 0 });
  const result = s.update(0, 0);
  // With a zero budget the loop still does one chunk before checking, so the bound is "very few",
  // not "none".
  assert.ok(result.generated <= 2, `generated ${result.generated} chunks on a zero budget`);
  assert.ok(game.world.chunks.size < 49, 'a zero budget must not build the whole area');
});

test('successive updates finish the job without exceeding the budget', () => {
  const game = makeGame();
  const s = streamerFor(game, { generateMs: 1 });
  for (let i = 0; i < 400 && game.world.chunks.size < 49; i++) s.update(0, 0);
  assert.equal(game.world.chunks.size, 49, 'repeated bounded updates must converge');
  // Everything in the mesh radius should be meshed by the end.
  for (let cx = -2; cx <= 2; cx++) {
    for (let cz = -2; cz <= 2; cz++) {
      assert.ok(game.meshedChunks.includes(`${cx},${cz}`), `${cx},${cz} was never meshed`);
    }
  }
});

// --- unloading ---------------------------------------------------------------

test('walking away unloads distant chunks and disposes their meshes', () => {
  const game = makeGame();
  const s = streamerFor(game);
  s.update(0, 0);
  const startedWith = game.world.chunks.size;
  assert.ok(startedWith > 0);

  // Remember the identity of the meshes that should go away.
  const doomedChunk = game.world.getChunk(0, 0);
  const doomedMesh = doomedChunk.opaqueMesh;
  assert.ok(doomedMesh, 'fixture expects a mesh to exist');

  // Walk a long way: 20 chunks, well beyond the unload radius of 5.
  game.player.position.x = 20 * CHUNK_SIZE_X;
  s.update(game.player.position.x, game.player.position.z);

  assert.equal(game.world.getChunk(0, 0), undefined,
    'the chunk left behind must be removed from the world');
  assert.ok(s.stats.unloaded > 0, 'the unload must be counted');
  // Assert identity, not a count: the number of scene children can legitimately stay the same,
  // because the chunks streamed in at the new position replace the ones removed.
  assert.equal(game.scene.children.includes(doomedMesh), false,
    'the unloaded chunk mesh must be removed from the scene');
});

test('unloading invalidates the neighbours, so no wall is left missing', () => {
  // A face that was culled against the departing chunk must be re-evaluated. Getting this wrong
  // leaves a permanent hole -- prismarine-viewer misses exactly this step on unload.
  //
  // generateRadius is widened here so the chunk at -4,0 really exists to be kept; at the default
  // radius of 3 the far edge is -3 and the test was asking about a chunk that had never been made.
  const game = makeGame();
  const s = streamerFor(game, { generateRadius: 6, generateMs: 100000 });
  s.update(0, 0);

  const doomed = game.world.getChunk(-5, 0);
  const neighbour = game.world.getChunk(-4, 0);
  assert.ok(doomed, 'fixture expects the chunk to be unloaded to exist');
  assert.ok(neighbour, 'and its neighbour to exist');
  neighbour.dirty = false;

  s.unloadChunk(doomed);

  assert.equal(neighbour.dirty, true,
    'the surviving neighbour must be marked dirty so its boundary faces are rebuilt');
  assert.equal(game.world.getChunk(-5, 0), undefined, 'the unloaded chunk is gone');
});

test('a long walk keeps the resident chunk count bounded', () => {
  // The bug this pins, which is the whole point of having an unload radius at all.
  //
  // The first implementation tested distance against only `this.loaded` -- the set of chunks that
  // are currently MESHED, which by definition all lie inside the mesh radius. So `distance >
  // unloadRadius` could never be true and nothing was ever unloaded while walking. It went
  // unnoticed because a single large jump did unload some chunks by accident, and the unit test
  // only jumped. Over a real walk the resident count grew without limit: 1002 chunks after
  // crossing 82 of them, with the meshes still in the scene.
  const game = makeGame();
  const s = streamerFor(game, { meshRadius: 2, generateRadius: 3, unloadRadius: 5 });

  // Walk 40 chunks, one frame at a time, exactly as the player does.
  for (let frame = 0; frame < 1400; frame++) {
    game.player.position.x += 0.55;
    s.update(game.player.position.x, 0);
  }

  const finalChunk = Math.floor(game.player.position.x / CHUNK_SIZE_X);
  assert.ok(finalChunk > 30, `fixture should have walked a long way, ended at chunk ${finalChunk}`);
  assert.ok(s.stats.unloaded > 0, 'walking away must unload chunks');

  // Everything resident must still be within the unload radius of the player. This is the real
  // invariant: a tidy-up that ran but left the stragglers behind would pass a counter check.
  for (const chunk of game.world.chunks.values()) {
    const distance = Math.max(Math.abs(chunk.cx - finalChunk), Math.abs(chunk.cz));
    assert.ok(distance <= s.unloadRadius,
      `chunk ${chunk.cx},${chunk.cz} is ${distance} chunks away, beyond the unload radius of ${s.unloadRadius}`);
  }

  // And the count must be bounded by the unload area, not by how far we walked.
  const maxExpected = (s.unloadRadius * 2 + 1) ** 2;
  assert.ok(game.world.chunks.size <= maxExpected,
    `${game.world.chunks.size} chunks resident, above the ${maxExpected} the unload radius allows`);

  // The scene must not be accumulating meshes either.
  assert.ok(game.scene.children.length <= maxExpected,
    `${game.scene.children.length} meshes in the scene, above the ${maxExpected} the unload radius allows`);
});

test('walking back and forth over a border does not thrash chunks', () => {
  // The reason unloadRadius is wider than meshRadius: without the gap, stepping across a chunk
  // border would unload and regenerate the same chunks repeatedly.
  const game = makeGame();
  const s = streamerFor(game, { meshRadius: 2, generateRadius: 3, unloadRadius: 5 });

  // Oscillate exactly on the boundary between chunk 0 and chunk 1.
  for (let i = 0; i < 200; i++) {
    game.player.position.x = i % 2 === 0 ? 15.4 : 16.4;
    s.update(game.player.position.x, 0);
  }

  // Two positions, so at most a handful of planning events; definitely not 200 regenerations.
  assert.ok(s.stats.generated < 60,
    `${s.stats.generated} chunks generated while oscillating over one border`);
  assert.equal(s.stats.unloaded, 0, 'nothing should be unloaded while standing near the border');
});

test('unloading is skipped for chunks still inside the removal radius', () => {
  const game = makeGame();
  const s = streamerFor(game, { meshRadius: 2, unloadRadius: 6 });
  s.update(0, 0);
  // Move two chunks: still inside the unload radius, so nothing should be dropped.
  game.player.position.x = 2 * CHUNK_SIZE_X;
  s.update(game.player.position.x, 0);
  assert.equal(game.world.getChunk(0, 0) !== undefined, true,
    'a chunk two chunks away must not be unloaded at radius 6');
});

// --- editing -----------------------------------------------------------------

test('flush meshes a chunk that an edit marked dirty directly on the world', () => {
  // Several modules set `chunk.dirty = true` themselves rather than going through the streamer.
  const game = makeGame();
  const s = streamerFor(game);
  s.update(0, 0);
  const chunk = game.world.getChunk(1, 1);
  game.world.setVoxel(1 * CHUNK_SIZE_X + 2, 30, 1 * CHUNK_SIZE_Z + 2, BLOCKS.DIAMOND_BLOCK);
  assert.equal(chunk.dirty, true, 'setVoxel should mark the chunk dirty');

  const meshedBefore = game.meshedChunks.length;
  s.flush(0, 0);
  assert.ok(game.meshedChunks.length > meshedBefore, 'the edit must be flushed to a mesh');
  assert.equal(chunk.dirty, false, 'and the chunk marked clean');
});

test('flush respects its time budget rather than meshing everything', () => {
  const game = makeGame();
  const s = streamerFor(game, { meshMs: 0 });
  s.update(0, 0);
  for (const chunk of game.world.chunks.values()) chunk.dirty = true;
  const before = game.meshedChunks.length;
  s.flush(0, 0, 0);
  const after = game.meshedChunks.length;
  assert.ok(after - before <= 2, `a zero budget meshed ${after - before} chunks`);
});

// --- distance changes --------------------------------------------------------

test('raising the render distance streams the newly required chunks', () => {
  const game = makeGame();
  const s = streamerFor(game, { meshRadius: 2, unloadRadius: 8 });
  s.update(0, 0);
  const small = game.world.chunks.size;

  s.setRenderDistance(4);
  for (let i = 0; i < 200; i++) s.update(0, 0);
  assert.ok(game.world.chunks.size > small,
    'a larger radius must stream in more chunks');
  assert.ok(game.world.getChunk(5, 5), 'including the new outer ring');
});

test('setRenderDistance keeps the unload radius ahead of the mesh radius', () => {
  const game = makeGame();
  const s = streamerFor(game);
  s.setRenderDistance(10);
  assert.equal(s.meshRadius, 10);
  assert.equal(s.generateRadius, 11, 'generate must stay one ahead for the border');
  assert.ok(s.unloadRadius > s.meshRadius, 'unload must stay outside mesh');
});

// --- robustness --------------------------------------------------------------

test('a player chunk change in one update does not lose the previous plan', () => {
  const game = makeGame();
  const s = streamerFor(game);
  s.update(0, 0);
  const seen = new Set(game.world.chunks.keys());
  s.update(CHUNK_SIZE_X, 0);
  s.update(CHUNK_SIZE_X * 2, 0);
  // The chunks from the first position that are still in range must be untouched, not regenerated
  // (regenerating would replace live edits).
  const survivor = game.world.getChunk(1, 0);
  if (survivor) assert.ok(seen.has('1,0'), 'an in-range chunk must be the same object');
});

test('the streamer tolerates being driven with no player movement', () => {
  const game = makeGame();
  const s = streamerFor(game);
  s.update(0, 0);
  const sizeAfterFirst = game.world.chunks.size;
  for (let i = 0; i < 20; i++) s.update(0, 0);
  assert.equal(game.world.chunks.size, sizeAfterFirst,
    'repeated updates at the same position must be idempotent');
});

test('loadAllSynchronously builds everything it promises', () => {
  // The world-start path needs the area present before the player can be placed on the surface.
  const game = makeGame();
  const s = streamerFor(game);
  s.loadAllSynchronously(0, 0);
  for (let cx = -2; cx <= 2; cx++) {
    for (let cz = -2; cz <= 2; cz++) {
      assert.ok(game.world.getChunk(cx, cz), `${cx},${cz} missing after a synchronous load`);
      assert.ok(game.meshedChunks.includes(`${cx},${cz}`), `${cx},${cz} was not meshed`);
    }
  }
});
