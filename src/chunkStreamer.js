import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from './world.js';

/**
 * Budgeted chunk streaming: generate, mesh and unload around the player without stalling a frame.
 *
 * What this replaces, and why.
 *
 * The previous approach ran `loadChunksAroundPlayer()` on demand, which generated the whole view
 * area in one synchronous loop, and separately `refreshDirtyChunks()` every single frame, which
 * did `[...world.chunks.values()].filter(dirty).sort(...)` -- allocating and sorting an array of
 * every loaded chunk, every frame, to then mesh at most four of them. At the current view radius
 * of 4 that is 81 chunks and tolerable. At radius 16 it is 1089 chunks, and both the sort and the
 * synchronous generation become unusable. Nothing was ever unloaded, either, so memory only grew.
 *
 * The research (see docs/voxel-engine-plan.md) is consistent about the fix: noa gates work by TIME
 * budgets (`maxProcessingPerTick = 5ms`) rather than by counts, sorts by distance so nearby chunks
 * appear first, and never meshes a chunk until enough neighbours exist. Voxelize and Luanti both
 * separate the "which chunks should exist" question from the "which are meshed" question.
 *
 * Design:
 *   - `generateRadius` is one larger than `meshRadius`, so a chunk being meshed has real data in
 *     its border ring rather than air. This is what keeps water depth and face culling correct at
 *     seams.
 *   - Work is chosen per frame by distance and bounded by a millisecond budget.
 *   - A chunk is only meshed once all eight neighbours are generated, so a chunk that is meshed is
 *     never meshed against missing terrain (which would leave faces drawn that should be culled).
 *   - Chunks beyond `unloadRadius` are removed from the world and their meshes disposed, so a long
 *     walk does not accumulate geometry forever. Neighbours are marked dirty on unload, because
 *     faces that were culled against the departing chunk must be re-evaluated.
 */

/** Fraction of a frame that may be spent on streaming, so a slow frame cannot cascade. */
const DEFAULT_GENERATE_MS = 6;
const DEFAULT_MESH_MS = 8;

export class ChunkStreamer {
  /**
   * @param {object} game     the Game, for rebuildChunkMesh and the scene
   * @param {object} options  meshRadius, generateRadius, unloadRadius, budgets
   */
  constructor(game, options = {}) {
    this.game = game;
    this.meshRadius = options.meshRadius ?? 4;
    this.generateRadius = options.generateRadius ?? this.meshRadius + 1;
    this.unloadRadius = options.unloadRadius ?? this.meshRadius + 3;
    this.generateMs = options.generateMs ?? DEFAULT_GENERATE_MS;
    this.meshMs = options.meshMs ?? DEFAULT_MESH_MS;

    /** Chunks currently meshed or awaiting mesh, keyed like the world Map. */
    this.loaded = new Set();
    /**
     * Every chunk inside the mesh radius. Whether one is ready to mesh is decided from the chunk's
     * own dirty flag plus its neighbours being present, so this is a candidate set rather than a
     * work queue -- entries must never be removed for not being ready yet.
     */
    this.pending = new Set();
    /** Player chunk of the last update, so a rebuild is only planned when it changes. */
    this.centerX = null;
    this.centerZ = null;

    // Counters, for tests and for a debug readout.
    this.stats = { generated: 0, meshed: 0, unloaded: 0, lastGenerateMs: 0, lastMeshMs: 0 };
  }

  setRenderDistance(radius) {
    this.meshRadius = Math.max(1, Math.floor(radius));
    this.generateRadius = this.meshRadius + 1;
    this.unloadRadius = this.meshRadius + 3;
    // Force a replan on the next update.
    this.centerX = null;
  }

  key(cx, cz) {
    return `${cx},${cz}`;
  }

  /**
   * Plan which chunks should exist and which should be meshed, then do as much as the budget
   * allows.
   *
   * @returns {{generated:number, meshed:number, unloaded:number}}
   */
  update(px, pz) {
    const pcx = Math.floor(px / CHUNK_SIZE_X);
    const pcz = Math.floor(pz / CHUNK_SIZE_Z);
    const world = this.game.world;

    if (pcx !== this.centerX || pcz !== this.centerZ) {
      this.centerX = pcx;
      this.centerZ = pcz;
      this.plan(pcx, pcz);
    }

    const generated = this.runGeneration(world, pcx, pcz);
    const meshed = this.runMeshing(world, pcx, pcz);
    return { generated, meshed, unloaded: this.lastUnloaded || 0 };
  }

  /** Rebuild the target set around a new player chunk and unload anything now out of range. */
  plan(pcx, pcz) {
    const world = this.game.world;
    const wantedDirty = new Set();

    for (let cx = pcx - this.meshRadius; cx <= pcx + this.meshRadius; cx++) {
      for (let cz = pcz - this.meshRadius; cz <= pcz + this.meshRadius; cz++) {
        wantedDirty.add(this.key(cx, cz));
      }
    }

    // Unload anything resident that is now far away.
    //
    // This deliberately scans the chunks actually in the world rather than only `this.loaded`.
    // `this.loaded` tracks what is currently MESHED, which by definition lies inside the mesh
    // radius -- so a distance test against the unload radius could never be true and nothing was
    // ever unloaded. That bug was invisible in a single update (which happened to catch a few by
    // accident) and obvious over a walk, where the resident count grew without limit: 1002 chunks
    // after crossing 82 of them.
    //
    // The gap between meshRadius and unloadRadius is deliberate: without it, walking back and
    // forth across a chunk border would generate and discard the same chunks repeatedly.
    let unloaded = 0;
    for (const chunk of world.chunks.values()) {
      const dx = Math.abs(chunk.cx - pcx);
      const dz = Math.abs(chunk.cz - pcz);
      if (Math.max(dx, dz) > this.unloadRadius) {
        this.unloadChunk(chunk);
        unloaded++;
      }
    }
    // Drop bookkeeping for chunks that are no longer meshed, but leave their meshes in place while
    // they are inside the unload radius so they do not visibly pop out of view.
    for (const key of this.loaded) {
      if (!wantedDirty.has(key)) this.loaded.delete(key);
    }
    this.stats.unloaded += unloaded;
    this.lastUnloaded = unloaded;

    // The candidate set is simply "everything inside the mesh radius". Whether a candidate is
    // actually ready to mesh is decided from the chunk's own dirty flag and its neighbours being
    // present, so a chunk cannot be lost by being planned before it is generated -- which is
    // exactly what happened when this was a queue that entries were removed from.
    this.pending = wantedDirty;
  }

  /** Remove a chunk's meshes and its voxel data. */
  unloadChunk(chunk) {
    const game = this.game;
    for (const slot of ['opaqueMesh', 'transparentMesh', 'waterMesh', 'lightMesh']) {
      const mesh = chunk[slot];
      if (!mesh) continue;
      game.scene.remove(mesh);
      mesh.geometry?.dispose();
      chunk[slot] = null;
    }
    this.game.blockLighting?.setChunk?.(chunk.cx, chunk.cz, []);
    this.game.world.chunks.delete(this.key(chunk.cx, chunk.cz));
    this.game.world.invalidateChunkCache();
    this.loaded.delete(this.key(chunk.cx, chunk.cz));
    this.pending.delete(this.key(chunk.cx, chunk.cz));

    // Faces that were culled against this chunk must be re-evaluated, or the neighbour keeps a
    // hole where the removed chunk used to be. prismarine-viewer misses exactly this step on
    // unload, and the result is permanently missing walls.
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const neighbour = this.game.world.getChunk(chunk.cx + dx, chunk.cz + dz);
      if (neighbour) neighbour.dirty = true;
    }
  }

  /** Generate terrain nearest-first until the budget is spent. */
  runGeneration(world, pcx, pcz) {
    const start = now();
    let generated = 0;
    const budget = this.generateMs;

    // Collect candidates: inside generateRadius and not yet in the world.
    const candidates = [];
    for (let cx = pcx - this.generateRadius; cx <= pcx + this.generateRadius; cx++) {
      for (let cz = pcz - this.generateRadius; cz <= pcz + this.generateRadius; cz++) {
        if (world.getChunk(cx, cz)) continue;
        const dx = cx - pcx, dz = cz - pcz;
        candidates.push({ cx, cz, d: dx * dx + dz * dz });
      }
    }
    candidates.sort((a, b) => a.d - b.d);

    for (const c of candidates) {
      world.getOrCreateChunk(c.cx, c.cz);
      generated++;
      this.stats.generated++;
      if (now() - start >= budget) break;
    }

    this.stats.lastGenerateMs = now() - start;
    return generated;
  }

  /**
   * Mesh dirty chunks nearest-first until the budget is spent.
   *
   * A chunk is only meshed when all eight neighbours exist: meshing against a missing neighbour
   * treats it as air, which draws faces that a later neighbour would cull, and the chunk then has
   * to be meshed a second time.
   */
  runMeshing(world, pcx, pcz) {
    const start = now();
    let meshed = 0;
    const budget = this.meshMs;
    const pending = this.pending || new Set();

    const ready = [];
    for (const key of pending) {
      const chunk = world.chunks.get(key);
      // Not generated yet, or already meshed: touch nothing. This must NOT remove the key from the
      // candidate set -- doing that is what lost chunks permanently when they were planned before
      // generation finished.
      if (!chunk || !chunk.dirty) continue;
      const cx = chunk.cx, cz = chunk.cz;
      let surrounded = true;
      for (let dx = -1; dx <= 1 && surrounded; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (!world.getChunk(cx + dx, cz + dz)) { surrounded = false; break; }
        }
      }
      if (!surrounded) continue;
      const ddx = cx - pcx, ddz = cz - pcz;
      ready.push({ chunk, d: ddx * ddx + ddz * ddz });
    }
    ready.sort((a, b) => a.d - b.d);

    for (const entry of ready) {
      const key = this.key(entry.chunk.cx, entry.chunk.cz);
      this.game.rebuildChunkMesh(entry.chunk);
      this.loaded.add(key);
      meshed++;
      this.stats.meshed++;
      if (now() - start >= budget) break;
    }

    this.stats.lastMeshMs = now() - start;
    return meshed;
  }

  /**
   * Flush dirty chunks near the player, bounded by a time budget.
   *
   * This is the entry point for edits: a block change marks its chunk dirty, and this picks it up
   * without the caller needing to know anything about streaming. Chunks marked dirty directly on
   * the world (which several modules do) are adopted here, so no path can leave a chunk unmeshed.
   */
  flush(px, pz, budgetMs = this.meshMs) {
    const world = this.game.world;
    const pcx = Math.floor(px / CHUNK_SIZE_X);
    const pcz = Math.floor(pz / CHUNK_SIZE_Z);

    // Surrounding chunks that something else marked dirty are picked up by runMeshing directly
    // from the chunk's dirty flag, so there is nothing to adopt here. If no plan exists yet (for
    // example a flush before the first update), build one.
    if (!this.pending || this.pending.size === 0) this.plan(pcx, pcz);

    const previous = this.meshMs;
    this.meshMs = budgetMs;
    try {
      return this.runMeshing(world, pcx, pcz);
    } finally {
      this.meshMs = previous;
    }
  }

  /** Mark a chunk for remeshing, as a block edit does. */
  markDirty(cx, cz) {
    const chunk = this.game.world.chunks.get(this.key(cx, cz));
    if (chunk) chunk.dirty = true;
  }

  /** Load everything in the mesh radius immediately, for a synchronous world start. */
  loadAllSynchronously(px, pz) {
    const pcx = Math.floor(px / CHUNK_SIZE_X);
    const pcz = Math.floor(pz / CHUNK_SIZE_Z);
    const world = this.game.world;
    for (let cx = pcx - this.generateRadius; cx <= pcx + this.generateRadius; cx++) {
      for (let cz = pcz - this.generateRadius; cz <= pcz + this.generateRadius; cz++) {
        world.getOrCreateChunk(cx, cz);
      }
    }
    for (let cx = pcx - this.meshRadius; cx <= pcx + this.meshRadius; cx++) {
      for (let cz = pcz - this.meshRadius; cz <= pcz + this.meshRadius; cz++) {
        this.game.rebuildChunkMesh(world.getOrCreateChunk(cx, cz));
        this.loaded.add(this.key(cx, cz));
      }
    }
    this.centerX = pcx;
    this.centerZ = pcz;
  }
}

/** `performance.now()` where available, so the streamer works in Node tests too. */
function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}
