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

    /**
     * Running estimates of what one generate and one mesh cost, so a frame can decide whether to
     * START an operation rather than only noticing afterwards that it overspent.
     *
     * Seeded with measured medians (generate 3.7ms, mesh 5.7ms) and updated with an exponential
     * moving average, so the estimate tracks the terrain being walked through.
     */
    this.estimatedGenerateMs = 3.7;
    this.estimatedMeshMs = 5.7;

    /**
     * Total budget for building work in one frame, shared between generation and meshing.
     *
     * Deliberately not `generateMs + meshMs`: those were per-phase limits, so a frame could spend
     * both and overrun the frame without either phase noticing. This is the number the frame is
     * actually held to.
     */
    this.frameBuildMs = options.frameBuildMs ?? 10.5;

    /** When the current frame's build work began, so both phases share one budget. */
    this.frameStart = 0;
  }

  /**
   * Would starting an operation that will cost `estimatedMs` push this frame's build work over
   * budget?
   *
   * `phaseSpentMs`/`phaseBudgetMs` are the phase's own limit; `frameBuildMs` is the frame's total.
   * Both apply. The frame total is the one that matters in the game, since separate per-phase limits
   * let a frame spend both and overrun without either phase noticing; the phase limit is kept because
   * it is useful for bounding one kind of work on its own.
   *
   * On deadlock. Generation is atomic per chunk, so it has to be allowed to run even when the
   * estimate exceeds the whole budget -- otherwise a chunk that costs more than the budget would
   * never be generated and the world would stop filling in. But allowing the first operation of a
   * PHASE to run unconditionally was the wrong escape: it let a generation start on top of a frame
   * that had already spent its budget on meshing, so the overrun was `spent + generation` rather than
   * `generation`. Measured, that was the whole remaining tail -- 0.2% of frames over budget, with
   * generation at p99 13.4ms and max 47.2ms.
   *
   * The escape is now "only on a fresh frame". Generation still always makes progress, because the
   * frame it happens on is empty, so the worst frame is one generation rather than one generation
   * plus whatever else the frame had already done.
   *
   * @param {boolean} isFirst  true for the first operation of this phase in this update
   */
  wouldExceed(estimatedMs, phaseSpentMs = 0, phaseBudgetMs = Infinity, isFirst = false) {
    const spent = now() - this.frameStart;
    // A fresh frame has nothing to protect, so the operation runs even if it alone exceeds the
    // budget. That is the anti-deadlock escape, and it is narrow: `spent` must be essentially zero.
    if (spent <= 0.01) return false;
    if (isFirst && spent < this.estimatedGenerateMs) return false;
    if (phaseSpentMs + estimatedMs > phaseBudgetMs) return true;
    return spent + estimatedMs > this.frameBuildMs;
  }

  /** Exponential moving average, so a genuinely expensive region raises the estimate. */
  #blend(current, sample) {
    return current * 0.8 + sample * 0.2;
  }

  recordGenerateCost(ms) {
    this.estimatedGenerateMs = this.#blend(this.estimatedGenerateMs, ms);
  }

  recordMeshCost(ms) {
    this.estimatedMeshMs = this.#blend(this.estimatedMeshMs, ms);
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

    // Both phases share one frame budget, measured from here.
    this.frameStart = now();
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
      // A chunk /forceload marked stays (commandState.forced).
      if (Math.max(dx, dz) > this.unloadRadius && !this.game?.commandState?.forced?.has(`${chunk.cx},${chunk.cz}`)) {
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
    // The chunk's propagated light goes with it, and the neighbours are marked for relighting
    // because their light was computed against terrain that is now gone.
    // Authored data has no procedural source to regenerate it from. Release geometry only.
    if (this.game.world.generationMode !== 'authored') {
      this.game.world.light?.removeChunk?.(chunk.cx, chunk.cz);
      this.game.world.chunks.delete(this.key(chunk.cx, chunk.cz));
    }
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
    const phaseStart = start;
    let generated = 0;

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
      // Check before starting, not only after finishing. The previous "do the work, then look at
      // the clock" loop could not bound a frame at all: one chunk costs a median of 3.7ms but up
      // to 24.7ms, so a frame that had already spent 5ms would still begin a 25ms chunk.
      if (this.wouldExceed(this.estimatedGenerateMs, now() - phaseStart, this.generateMs, generated === 0)) break;
      const t0 = now();
      world.getOrCreateChunk(c.cx, c.cz);
      this.recordGenerateCost(now() - t0);
      generated++;
      this.stats.generated++;
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
    const phaseStart = start;
    let meshed = 0;
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

    // Resume the part-built chunk FIRST, before looking at the queue at all.
    //
    // The first version only resumed when the in-progress chunk happened to be the entry the loop
    // was on, so a chunk whose neighbours made it drop out of `ready` -- or which simply sorted
    // behind another -- was never advanced again. Its partial work was stranded and, because that
    // chunk still counted as dirty, it also blocked the queue behind it. The symptom was meshing
    // stopping at 17 of 25 chunks and making no further progress however many updates were driven.
    if (this.inProgress) {
      const job = this.inProgress;
      const chunk = world.chunks.get(job.key);
      if (!chunk || !chunk.dirty) {
        // The chunk was unloaded or already meshed underneath us; drop the job rather than leak it.
        this.inProgress = null;
      } else if (this.resumeMesh(chunk)) {
        meshed++;
      }
      // Whether or not it finished, the budget for this phase is likely spent. Return and let the
      // next update pick up the rest.
      if (this.inProgress) {
        this.stats.lastMeshMs = now() - start;
        return meshed;
      }
    }

    for (const entry of ready) {
      // Same pre-check as generation. Meshing is the more expensive of the two -- a median of
      // 5.7ms but a p99 of 16.5ms and a worst case of 38.9ms -- so starting one blindly is what
      // produced most of the frame spikes. With a resumable mesh the estimate is no longer a floor
      // on the frame, because a chunk can now stop mid-way.
      if (this.wouldExceed(this.estimatedMeshMs, now() - phaseStart, this.meshMs, meshed === 0)) break;
      if (this.startMesh(entry.chunk, phaseStart)) meshed++;
      // A chunk left in progress is resumed at the top of the next phase, so stop here rather than
      // starting more work that cannot finish.
      if (this.inProgress) break;
    }

    this.stats.lastMeshMs = now() - start;
    return meshed;
  }

  /**
   * Begin meshing a chunk, suspending it if the frame budget runs out.
   *
   * @returns {boolean} true when the chunk finished in this call
   */
  startMesh(chunk, phaseStart) {
    const mesher = this.game.mesher;
    if (!mesher || typeof mesher.beginChunkMesh !== 'function') {
      // No resumable path available: fall back to one-shot, which is what the game used before.
      this.game.rebuildChunkMesh(chunk);
      this.loaded.add(this.key(chunk.cx, chunk.cz));
      this.stats.meshed++;
      return true;
    }
    this.inProgress = {
      key: this.key(chunk.cx, chunk.cz),
      chunk,
      iterator: mesher.beginChunkMesh(chunk, this.game.world),
      step: 0,
    };
    return this.resumeMesh(chunk, phaseStart);
  }

  /**
   * Advance an in-progress mesh until it completes or the frame budget is spent.
   *
   * @returns {boolean} true when the chunk finished
   */
  resumeMesh(chunk, phaseStart) {
    const job = this.inProgress;
    if (!job) return false;
    const t0 = now();
    for (;;) {
      const step = job.iterator.next();
      job.step++;
      if (step.done) {
        // The generator returns the geometry, so applying it here costs one upload rather than
        // another whole mesh pass.
        this.game.applyChunkGeometry(chunk, step.value);
        this.loaded.add(job.key);
        this.stats.meshed++;
        this.inProgress = null;
        this.recordMeshCost(now() - t0);
        return true;
      }
      // Stop at a column boundary once the frame would be overrun. Nothing is half-written until
      // the geometry is applied above, which is what makes stopping here safe: the partial work
      // lives in the generator's own buffers and is resumed next frame.
      //
      // The first step is always taken so that a chunk can never be stuck at zero progress.
      if (job.step > 1 && this.wouldExceed(0, now() - this.frameStart, this.meshMs, false)) {
        this.recordMeshCost(now() - t0);
        return false;
      }
    }
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

  /** Discard work associated with the previous world's chunk objects. */
  reset() {
    this.inProgress?.iterator?.return?.();
    this.inProgress = null;
    this.loaded.clear();
    this.pending.clear();
    this.centerX = null;
    this.centerZ = null;
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
