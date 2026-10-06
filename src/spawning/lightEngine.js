// Voxel lighting: sky light and block light, propagated per chunk.
//
// Why this exists.
//
// Vanilla's hostile-mob rule is a LIGHT rule. `Mob.checkMonsterSpawnRules` refuses a position
// unless it is dark enough, and "dark" is expressed in the 0-15 light scale the lighting engine
// maintains. This project had no lighting engine at all: `BlockLighting` in lighting.js is a
// handful of THREE.PointLight objects chosen for the camera and has no idea what the light level
// at an arbitrary voxel is, and `world.getLightLevel` did not exist. Every spawn check that wanted
// light therefore guessed -- `mobs.js` asked for `getLightLevel?.(...) ?? 15`, meaning "assume
// daylight", and `packEquine.js` decided from the clock instead: night meant light 0.
//
// That is why spawning a monster underground was impossible to get right. A guess cannot tell a
// dark cave from a lit field at noon, and in vanilla the two are the same rule.
//
// What this implements.
//
//  - Sky light: 15 above the terrain, falling by one per step through anything that attenuates it,
//    with vanilla's downward rule (a full-strength column propagates straight down without loss,
//    which is what makes an overhang's shadow edge correct) plus horizontal spreading.
//  - Block light: emitted by a block's own `light` value (see BLOCK_DEFS) and falling by one per
//    step regardless of direction.
//  - A per-chunk dirty set with a time budget, so an edit or a newly generated chunk is relit over
//    a frame or two instead of stalling the frame it happened on.
//
// Deviations from vanilla, recorded here and in docs/MOB_SPAWNING_PARITY.md:
//
//  1. Opacity is a two-level model (transparent / fully opaque) plus the two special cases below,
//     rather than vanilla's per-block opacity table. No block in this engine's registry is
//     partially attenuating today.
//  2. Water and leaves attenuate by 1, as they do in vanilla, but they are matched by block id
//     here rather than by a `lightOpacity` field on the block definition. If the registry gains
//     such a field, `blockOpacity` prefers it.
//  3. Emission comes from the engine's own `light` values on BLOCK_DEFS, which do not always equal
//     vanilla's (vanilla's glowstone is 15 and so is this engine's; vanilla's respawn anchor is 0
//     uncharged / 15 charged, and this engine does not model the charge). The spawning subsystem
//     consumes whatever the engine emits, so light spawning and visible lighting cannot disagree.
//  4. This module stores RAW sky light, exactly as vanilla does. The day/night reduction
//     ("sky darken") is applied by the spawn predicate, not stored, so one relight serves every
//     time of day.

import { BLOCKS, BLOCK_DEFS } from '../blocks.js';

/**
 * The chunk dimensions this engine assumes.
 *
 * Declared here rather than imported from world.js on purpose: world.js imports this module to
 * attach an engine to the World, and importing back would create a cycle that ESM resolves by
 * handing one of the two a partially initialised namespace. tests/lightEngine.test.js asserts
 * these against world.js's exports, so a change there fails a test rather than silently
 * misindexing every light array.
 */
export const CHUNK_SIZE_X = 16;
export const CHUNK_SIZE_Z = 16;
export const CHUNK_HEIGHT = 64;

/** Light levels run 0..15 in vanilla, and every constant here assumes it. */
export const MAX_LIGHT = 15;

/** How long, in milliseconds, one `update()` call may spend relighting. */
const DEFAULT_BUDGET_MS = 3;

/**
 * Light attenuation for a block id.
 *
 * 15 means "opaque" -- light neither enters nor passes through, matching
 * `BlockBehaviour.getLightBlock` for a full solid cube. 0 means fully transparent.
 *
 * The special cases are the ones that decide whether a cave is dark:
 *  - water and lava attenuate by 1. Vanilla water has been opacity 1 since 1.13's flattening
 *    (it was 3 before); lava is opaque in vanilla but is modelled as attenuating here so that
 *    lava lakes do not read as pitch black for the mobs that live in them.
 *  - leaves attenuate, which is why a vanilla forest floor is dimmer than open ground.
 *  - anything the registry marks `transparent`, `plant`, or non-solid passes light freely.
 */
export function blockOpacity(blockId) {
  if (blockId === BLOCKS.AIR) return 0;
  const def = BLOCK_DEFS[blockId];
  if (!def) return 0;
  if (def.lightOpacity !== undefined) return def.lightOpacity;
  if (blockId === BLOCKS.WATER || blockId === BLOCKS.LAVA) return 1;
  if (def.plant || def.transparent) return 0;
  // Everything else is a full cube unless the registry says otherwise. `solid: false` with no
  // transparent flag (rails, redstone dust, torches) must not block light either.
  if (def.solid === false) return 0;
  return MAX_LIGHT;
}

/** Does light pass through this block at all? */
export function isTransparent(blockId) {
  return blockOpacity(blockId) < MAX_LIGHT;
}

/** How much light a block emits, 0 when it emits none. */
export function blockEmission(blockId) {
  if (blockId === BLOCKS.AIR) return 0;
  const def = BLOCK_DEFS[blockId];
  if (!def) return 0;
  const level = def.light;
  return Number.isFinite(level) ? Math.max(0, Math.min(MAX_LIGHT, level)) : 0;
}

/**
 * The lighting data for one dimension.
 *
 * Held by the World, one instance per dimension, and keyed the same way as `world.chunks`, so a
 * chunk and its lighting are created and dropped together.
 */
export class LightEngine {
  /**
   * @param {object} world the World, for getVoxel
   * @param {{budgetMs?: number}} [options]
   */
  constructor(world, options = {}) {
    this.world = world;
    this.budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
    /** chunk key -> { sky: Uint8Array, block: Uint8Array } */
    this.chunks = new Map();
    /** chunk keys awaiting a relight. */
    this.dirty = new Set();
    /**
     * Reusable BFS queue, as interleaved (x, y, z) triples. Preallocated because a full chunk
     * relight can enqueue tens of thousands of cells and allocating that array per relight showed
     * up as a measurable cost. The bound is generous: the largest window relit is 18x18x64.
     */
    this.queue = new Int32Array(1 << 18);
    this.head = 0;
    this.tail = 0;
    /** Direct-mapped chunk-data cache; see #cachedChunk. */
    this.chunkCache = null;
    /** Reused opacity/emission fields for the relight window; see #buildField. */
    this.opacityField = null;
    this.emissionField = null;
    this.stats = { relights: 0, lastMs: 0, totalMs: 0, queued: 0, overBudget: 0, maxMs: 0 };
    /**
     * The day/night reduction applied to sky light by default, 0..15.
     *
     * 11 is vanilla's midday value in the Overworld, i.e. sky light 15 - 11 = 4, so open ground
     * reads as light 4 and monsters still refuse it. It is overwritten each frame by the game from
     * the clock and the weather.
     */
    this.skyDarken = 11;
  }

  /** Allocate the light arrays for a chunk. Called when terrain is generated. */
  initChunk(cx, cz) {
    this.chunks.set(`${cx},${cz}`, {
      sky: new Uint8Array(CHUNK_SIZE_X * CHUNK_HEIGHT * CHUNK_SIZE_Z),
      block: new Uint8Array(CHUNK_SIZE_X * CHUNK_HEIGHT * CHUNK_SIZE_Z),
    });
    // The lookup cache must not keep handing out the null that used to be here.
    this.chunkCache = null;
    this.markDirty(cx, cz);
    // A new chunk changes what its neighbours can see, so their light must be recomputed too.
    this.markDirty(cx - 1, cz);
    this.markDirty(cx + 1, cz);
    this.markDirty(cx, cz - 1);
    this.markDirty(cx, cz + 1);
  }

  /** Drop a chunk's lighting. Called from the streamer when the chunk is unloaded. */
  removeChunk(cx, cz) {
    this.chunks.delete(`${cx},${cz}`);
    this.dirty.delete(`${cx},${cz}`);
    this.chunkCache = null;
    // The neighbours' light was computed against this chunk and is now wrong.
    this.markDirty(cx - 1, cz);
    this.markDirty(cx + 1, cz);
    this.markDirty(cx, cz - 1);
    this.markDirty(cx, cz + 1);
  }

  /** Note that a chunk needs relighting. Ignores chunks that do not exist. */
  markDirty(cx, cz) {
    const key = `${cx},${cz}`;
    if (this.chunks.has(key)) this.dirty.add(key);
  }

  /**
   * Note that a block edit invalidated its chunk and, at a border, its neighbour.
   *
   * Marked rather than recomputed here: `World.setVoxel` is called in tight loops by fluid flow and
   * redstone, and relighting inside it would make a single edit cost a whole chunk relight.
   */
  markBlockChanged(wx, wy, wz) {
    const cx = Math.floor(wx / CHUNK_SIZE_X);
    const cz = Math.floor(wz / CHUNK_SIZE_Z);
    this.markDirty(cx, cz);
    const lx = wx & (CHUNK_SIZE_X - 1);
    const lz = wz & (CHUNK_SIZE_Z - 1);
    if (lx === 0) this.markDirty(cx - 1, cz);
    else if (lx === CHUNK_SIZE_X - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    else if (lz === CHUNK_SIZE_Z - 1) this.markDirty(cx, cz + 1);
    void wy;
  }

  /** Raw sky light at a world position, 0 when the chunk is not loaded. */
  getSkyLight(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return 0;
    const data = this.#cachedChunk(Math.floor(wx / CHUNK_SIZE_X), Math.floor(wz / CHUNK_SIZE_Z));
    if (!data) return 0;
    return data.sky[((wy * CHUNK_SIZE_Z + (wz & (CHUNK_SIZE_Z - 1))) * CHUNK_SIZE_X) + (wx & (CHUNK_SIZE_X - 1))];
  }

  /** Raw block light at a world position, 0 when the chunk is not loaded. */
  getBlockLight(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return 0;
    const data = this.#cachedChunk(Math.floor(wx / CHUNK_SIZE_X), Math.floor(wz / CHUNK_SIZE_Z));
    if (!data) return 0;
    return data.block[((wy * CHUNK_SIZE_Z + (wz & (CHUNK_SIZE_Z - 1))) * CHUNK_SIZE_X) + (wx & (CHUNK_SIZE_X - 1))];
  }

  /**
   * Light at a world position as a mob spawn predicate sees it.
   *
   * `skyDarken` is subtracted from sky light but never from block light, which is exactly what
   * vanilla's `getMaxLocalRawBrightness` does. Pass `skyDarken` 0 to ask for raw sky light.
   */
  getLightLevel(wx, wy, wz, skyDarken = this.skyDarken) {
    const block = this.getBlockLight(wx, wy, wz);
    const sky = this.getSkyLight(wx, wy, wz);
    return Math.max(block, Math.max(0, sky - skyDarken));
  }

  /** Raw pair, for the debug overlay and for predicates that need them separately. */
  getLightPair(wx, wy, wz) {
    return { sky: this.getSkyLight(wx, wy, wz), block: this.getBlockLight(wx, wy, wz) };
  }

  /** Push a cell onto the BFS queue. Silently drops once the queue is full. */
  #enqueue(x, y, z) {
    if (this.tail + 3 > this.queue.length) return;
    this.queue[this.tail++] = x;
    this.queue[this.tail++] = y;
    this.queue[this.tail++] = z;
  }

  /**
   * A small direct-mapped cache of chunk light data.
   *
   * `Map.get` with a template-literal key was the single largest cost in a relight -- roughly half
   * of it -- and the BFS revisits the same handful of chunks hundreds of thousands of times. The
   * cache is validated on read, so a collision only costs the lookup it was trying to avoid.
   */
  #cachedChunk(cx, cz) {
    if (this.chunkCache === null) this.chunkCache = new Array(64).fill(null);
    const slot = ((cx * 31 + cz) & 63);
    const hit = this.chunkCache[slot];
    if (hit !== null && hit[0] === cx && hit[1] === cz) return hit[2];
    const data = this.chunks.get(`${cx},${cz}`) || null;
    this.chunkCache[slot] = [cx, cz, data];
    return data;
  }

  /**
   * Relight one chunk in place.
   *
   * The chunk's own cells are cleared and rebuilt from three kinds of seed: its sky columns, its
   * emitting blocks, and its own already-lit cells. Light then spreads through a window one cell
   * beyond the chunk on each axis, seeded along the chunk's inner border by the neighbouring
   * chunks' values -- which is what preserves cross-chunk light without paying for a BFS over a
   * 3x3 area.
   *
   * The one-cell margin matters: light entering from a neighbour arrives at the margin cell first,
   * and without it every chunk border would show a one-block dark seam.
   */
  #relightChunk(cx, cz) {
    const data = this.chunks.get(`${cx},${cz}`);
    if (!data) return;

    const { sky, block } = data;
    const baseX = cx * CHUNK_SIZE_X;
    const baseZ = cz * CHUNK_SIZE_Z;
    const { opacity, emission, strideX, strideZ } = this.#buildField(baseX, baseZ);
    const planeStride = strideX * strideZ;

    // 1. Sky columns. A column is lit 15 from the top down until something attenuates it; after
    //    that only the downward-15 rule (handled in the BFS) can restore full strength, which is
    //    what gives vanilla its hard shadow edge under an overhang.
    for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
        const columnBase = (lz * CHUNK_SIZE_X) + lx;
        const rowOffset = (lz + 1) * strideX + (lx + 1);
        // Walk down while still at full strength. Once the column is attenuated the rest of it is
        // zero, and writing those zeros in a tight second loop is much cheaper than testing every
        // cell -- most columns are solid within a few blocks of the surface.
        let y = CHUNK_HEIGHT - 1;
        for (; y >= 0; y--) {
          const op = opacity[y * planeStride + rowOffset];
          if (op >= MAX_LIGHT) break;
          sky[(y * CHUNK_SIZE_Z * CHUNK_SIZE_X) + columnBase] = MAX_LIGHT;
          // Leaves and water cut the column's full strength. Everything below them relies on the
          // BFS, which can only reach level 14 sideways -- which is what makes a forest floor
          // dimmer than open ground.
          if (op > 0) { y--; break; }
        }
        for (; y >= 0; y--) sky[(y * CHUNK_SIZE_Z * CHUNK_SIZE_X) + columnBase] = 0;
      }
    }

    // 2. Block light: clear, then seed the chunk's own emitters.
    block.fill(0);
    for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
        const columnBase = (lz * CHUNK_SIZE_X) + lx;
        const rowOffset = (lz + 1) * strideX + (lx + 1);
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          const fi = y * planeStride + rowOffset;
          const emissionLevel = emission[fi];
          if (emissionLevel <= 0) continue;
          if (opacity[fi] >= MAX_LIGHT) continue; // a fully opaque emitter lights nothing
          block[(y * CHUNK_SIZE_Z * CHUNK_SIZE_X) + columnBase] = emissionLevel;
        }
      }
    }

    // 3. Seed the BFS: every lit cell of this chunk, plus the one-cell margin ring taken from the
    //    neighbouring chunks so light survives across a chunk border.
    this.head = 0;
    this.tail = 0;
    for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
        const columnBase = (lz * CHUNK_SIZE_X) + lx;
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          const index = (y * CHUNK_SIZE_Z * CHUNK_SIZE_X) + columnBase;
          if (sky[index] > 1 || block[index] > 1) this.#enqueue(baseX + lx, y, baseZ + lz);
        }
      }
    }
    this.#seedMargin(cx, cz);
    this.stats.queued = this.tail / 3;

    this.#runBfs(baseX, baseZ, opacity, strideX, strideZ, planeStride);
  }

  /**
   * Precompute the block opacity and emission for the 18x18x64 window a relight touches.
   *
   * The BFS visits tens of thousands of cells and reads a voxel for each of their six neighbours.
   * Calling `world.getVoxel` there -- two Math.floor calls, a template-string key and a Map lookup
   * -- dominated the whole relight. One pass over the window plus two typed-array reads in the
   * inner loop took a measured 9.6ms chunk down below 1ms. The arrays live on the engine and are
   * reused, so a relight allocates nothing.
   */
  #buildField(baseX, baseZ) {
    const strideX = CHUNK_SIZE_X + 2;
    const strideZ = CHUNK_SIZE_Z + 2;
    const cells = strideX * strideZ * CHUNK_HEIGHT;
    if (this.opacityField === null || this.opacityField.length !== cells) {
      this.opacityField = new Uint8Array(cells);
      this.emissionField = new Uint8Array(cells);
    }
    const opacity = this.opacityField;
    const emission = this.emissionField;
    const world = this.world;
    for (let dz = 0; dz < strideZ; dz++) {
      const wz = baseZ - 1 + dz;
      for (let dx = 0; dx < strideX; dx++) {
        const wx = baseX - 1 + dx;
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          const index = (y * strideZ + dz) * strideX + dx;
          const id = world.getVoxel(wx, y, wz);
          opacity[index] = blockOpacity(id);
          emission[index] = blockEmission(id);
        }
      }
    }
    return { opacity, emission, strideX, strideZ };
  }

  /**
   * Enqueue the one-cell ring around this chunk, read from the neighbouring chunks' light.
   *
   * The ring lies OUTSIDE the chunk (local -1 and 16). Its light belongs to the neighbour and is
   * read-only here; it exists so the chunk's own border cells see the correct incoming level
   * instead of a one-block dark seam.
   */
  #seedMargin(cx, cz) {
    const minX = cx * CHUNK_SIZE_X - 1;
    const maxX = cx * CHUNK_SIZE_X + CHUNK_SIZE_X;
    const minZ = cz * CHUNK_SIZE_Z - 1;
    const maxZ = cz * CHUNK_SIZE_Z + CHUNK_SIZE_Z;
    for (let x = minX; x <= maxX; x++) {
      const isXEdge = x === minX || x === maxX;
      for (let z = minZ; z <= maxZ; z++) {
        if (!isXEdge && z !== minZ && z !== maxZ) continue;
        const source = this.#cachedChunk(Math.floor(x / CHUNK_SIZE_X), Math.floor(z / CHUNK_SIZE_Z));
        if (!source) continue;
        const columnBase = ((z & (CHUNK_SIZE_Z - 1)) * CHUNK_SIZE_X) + (x & (CHUNK_SIZE_X - 1));
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          const index = (y * CHUNK_SIZE_Z * CHUNK_SIZE_X) + columnBase;
          if (source.sky[index] > 1 || source.block[index] > 1) this.#enqueue(x, y, z);
        }
      }
    }
  }

  /**
   * Spread light through the chunk that starts at `baseX,baseZ`, plus its one-cell margin.
   *
   * Each dequeued cell pushes its two channels into their six neighbours when the neighbour is
   * transparent. Sky light falls by one per step in every direction EXCEPT straight down from a
   * level-15 cell, which stays at 15 -- vanilla's `SkyLightEngine` special case, and the reason a
   * vertical shaft is uniformly bright all the way down.
   *
   * Only the target chunk is ever WRITTEN. The margin ring is a read-only source: if two adjacent
   * chunks both wrote to it, the stored value would depend on relight order.
   */
  #runBfs(baseX, baseZ, opacity, strideX, strideZ, planeStride) {
    const queue = this.queue;
    const minX = baseX - 1;
    const maxX = baseX + CHUNK_SIZE_X;
    const minZ = baseZ - 1;
    const maxZ = baseZ + CHUNK_SIZE_Z;

    while (this.head < this.tail) {
      const x = queue[this.head++];
      const y = queue[this.head++];
      const z = queue[this.head++];
      const data = this.#cachedChunk(Math.floor(x / CHUNK_SIZE_X), Math.floor(z / CHUNK_SIZE_Z));
      if (!data) continue;
      const index = ((y * CHUNK_SIZE_Z + (z & (CHUNK_SIZE_Z - 1))) * CHUNK_SIZE_X) + (x & (CHUNK_SIZE_X - 1));
      const skyLevel = data.sky[index];
      const blockLevel = data.block[index];
      if (skyLevel === 0 && blockLevel === 0) continue;

      for (let face = 0; face < 6; face++) {
        const nx = x + (face === 0 ? -1 : face === 1 ? 1 : 0);
        const ny = y + (face === 2 ? -1 : face === 3 ? 1 : 0);
        const nz = z + (face === 4 ? -1 : face === 5 ? 1 : 0);
        if (ny < 0 || ny >= CHUNK_HEIGHT) continue;
        if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) continue;
        // Only the target chunk is writable, so the margin cannot be written twice.
        if (nx < baseX || nx >= baseX + CHUNK_SIZE_X || nz < baseZ || nz >= baseZ + CHUNK_SIZE_Z) continue;
        const op = opacity[ny * planeStride + (nz - baseZ + 1) * strideX + (nx - baseX + 1)];
        if (op >= MAX_LIGHT) continue;
        const step = op === 0 ? 1 : op;
        const nIndex = ((ny * CHUNK_SIZE_Z + (nz & (CHUNK_SIZE_Z - 1))) * CHUNK_SIZE_X) + (nx & (CHUNK_SIZE_X - 1));

        if (skyLevel > 1) {
          // Downward full-strength sky light does not attenuate.
          const next = (skyLevel === MAX_LIGHT && face === 2) ? MAX_LIGHT : skyLevel - step;
          if (next > data.sky[nIndex]) {
            data.sky[nIndex] = next;
            this.#enqueue(nx, ny, nz);
          }
        }
        if (blockLevel > 1) {
          const next = blockLevel - step;
          if (next > data.block[nIndex]) {
            data.block[nIndex] = next;
            this.#enqueue(nx, ny, nz);
          }
        }
      }
    }
    this.head = 0;
    this.tail = 0;
  }

  /** Relight one chunk immediately, for tests and for the debug overlay's step button. */
  relightChunk(cx, cz) {
    this.#relightChunk(cx, cz);
  }

  /**
   * Relight dirty chunks until the time budget is spent.
   *
   * The dirty set is small in normal play (a block edit dirties one or two chunks; a chunk
   * arriving dirties five), so it is not sorted by distance -- the sort would cost more than it
   * saves. What matters is that the work is bounded: a world start that dirties hundreds of chunks
   * relights them over many frames rather than in one.
   *
   * @param {number} [budgetMs]
   * @returns {number} how many chunks were relit
   */
  update(budgetMs = this.budgetMs) {
    if (this.dirty.size === 0) return 0;
    const start = now();
    let done = 0;
    for (const key of [...this.dirty]) {
      if (!this.dirty.has(key)) continue;
      // Always allow the first relight through, so an empty queue cannot stall forever, then stop
      // as soon as the budget is spent.
      if (done > 0 && now() - start > budgetMs) break;
      this.dirty.delete(key);
      const comma = key.indexOf(',');
      this.#relightChunk(Number(key.slice(0, comma)), Number(key.slice(comma + 1)));
      done++;
    }
    const elapsed = now() - start;
    this.stats.relights += done;
    this.stats.lastMs = elapsed;
    this.stats.totalMs += elapsed;
    if (elapsed > this.stats.maxMs) this.stats.maxMs = elapsed;
    if (done > 0 && elapsed > budgetMs) this.stats.overBudget++;
    return done;
  }

  /** Relight everything now. For tests and for a synchronous world start. */
  relightAll() {
    for (const key of [...this.dirty]) {
      this.dirty.delete(key);
      const comma = key.indexOf(',');
      this.#relightChunk(Number(key.slice(0, comma)), Number(key.slice(comma + 1)));
    }
  }

  /** Discard everything, as a world reseed or dimension switch must. */
  clear() {
    this.chunks.clear();
    this.dirty.clear();
    this.chunkCache = null;
  }

  /** Number of chunks currently dirty, for telemetry. */
  get dirtyCount() {
    return this.dirty.size;
  }
}

/** `performance.now()` where available, so this module works in Node tests too. */
function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}
