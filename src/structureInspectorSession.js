// Structure Inspector session: the headless half of the inspector.
//
// Same shape as `src/mobDebugSession.js`, and for the same reason: the interesting behaviour must be
// exercisable without a browser, so the page is a thin view over this and the tests can assert on it.
// It never creates a chunk, a map, a save or the game entry point -- it plans a structure with the real
// placement engine and realizes it into a sparse preview grid.
//
// What it is for (mission §23): seeing placement, layout, bounding boxes, piece metadata and
// determinism for one structure at one seed, without generating a world. `/locate`-style nearest search
// is what makes it usable, because most structures are sparse enough that a chosen chunk is empty.

import { createStructureEngine, STRUCTURES, STRUCTURE_SETS, GeneratorFamily, getSetForStructure } from './worldgen/index.js';
import { BLOCKS } from './blocks.js';

/** Preview volume: a fixed height range, so a preview never depends on world height settings. */
export const PREVIEW_MIN_Y = 40;
export const PREVIEW_MAX_Y = 120;

/**
 * A sparse voxel volume plus the two terrain queries the engine needs.
 *
 * Deliberately NOT a `World`: no chunks, no meshes, no fluids. `surfaceY` returns a flat, configurable
 * height so a structure can be previewed at a chosen depth, and `biomeAt` returns a configurable biome
 * (defaulting to the structure's own first biome gate, so picking a structure usually finds a plan).
 */
export function createPreviewWorld({ biome = 'plains', surface = 70 } = {}) {
  const blocks = new Map();
  // Block metadata (a chest's loot table and facing, a spawner's mob, ...) is kept beside the block
  // rather than folded into the id, because the whole point of inspecting a structure is seeing that
  // these were initialised at all.
  const blockMeta = new Map();
  return {
    blocks,
    blockMeta,
    biome,
    surface,
    key: (x, y, z) => `${x},${y},${z}`,
    getBlock(x, y, z) {
      return blocks.get(`${x},${y},${z}`) ?? BLOCKS.AIR;
    },
    setBlock(x, y, z, id) {
      if (y < PREVIEW_MIN_Y || y > PREVIEW_MAX_Y) return false;
      blocks.set(`${x},${y},${z}`, id);
      return true;
    },
    setBlockMeta(x, y, z, meta) {
      blockMeta.set(`${x},${y},${z}`, meta);
    },
    getBlockMeta(x, y, z) {
      return blockMeta.get(`${x},${y},${z}`) ?? null;
    },
    clear() {
      blocks.clear();
      blockMeta.clear();
    },
    biomeAt() {
      return this.biome;
    },
    surfaceY() {
      return this.surface;
    }
  };
}

/** The picker list: every registry structure, with whether a generator exists yet. */
export function inspectorStructures(registry = STRUCTURES) {
  return Object.entries(registry)
    .filter(([, entry]) => entry)
    .map(([id, entry]) => {
      const set = getSetForStructure(id);
      return {
        id,
        label: `${id} (${entry.family})`,
        family: entry.family,
        dimension: entry.dimension,
        step: entry.step || 'surface_structures',
        terrainAdaptation: entry.terrainAdaptation || 'none',
        implemented: Boolean(entry.implementation),
        biomes: entry.biomes || [],
        defaultBiome: (entry.biomes && entry.biomes[0]) || 'plains',
        set: set ? set.name : null,
        placement: set
          ? (set.type === 'concentric_rings'
            ? `concentric_rings d=${set.distance} n=${set.count} spread=${set.spread}`
            : `random_spread spacing=${set.spacing} separation=${set.separation} salt=${set.salt}${set.spreadType === 'triangular' ? ' triangular' : ''}${set.frequency && set.frequency < 1 ? ` frequency=${set.frequency}` : ''}`)
          : 'no set',
        notes: entry.notes || ''
      };
    });
}

/**
 * Create a session.
 *
 * @param {object} [options]
 * @param {number|bigint} [options.seed]
 * @param {string} [options.structureId]
 * @param {number} [options.chunkX]
 * @param {number} [options.chunkZ]
 */
export function createStructureInspectorSession(options = {}) {
  const events = [];
  const log = (message) => {
    events.unshift(message);
    if (events.length > 40) events.length = 40;
  };

  const state = {
    seed: options.seed ?? 4242,
    structureId: options.structureId ?? 'buried_treasure',
    chunkX: options.chunkX ?? 0,
    chunkZ: options.chunkZ ?? 0,
    biomeOverride: null,
    surface: options.surface ?? 70,
    showChunkGrid: true,
    showPieceBoxes: true,
    showStartBox: true,
    showCandidateGrid: true
  };

  const world = createPreviewWorld({
    biome: options.biome || inspectorStructures().find((s) => s.id === state.structureId)?.defaultBiome || 'plains',
    surface: state.surface
  });

  let plan = null;
  let lastHash = null;
  let lastPlanKey = null;
  // The RAW plan is kept, not just its key: the Inspector's panels need pieces, connectors and boxes, and a
  // telemetry summary cannot be turned back into a plan.
  let lastPlan = null;
  // What the last realize did, so the panel can say how many cells were air and therefore skipped.
  let lastRealize = null;

  function buildEngine() {
    return createStructureEngine({
      seed: state.seed,
      dimension: 'overworld',
      blockIds: BLOCKS,
      biomeAt: world.biomeAt.bind(world),
      surfaceY: world.surfaceY.bind(world)
    });
  }

  /** Everything the panel shows about the current plan, plus the placement that produced it. */
  function telemetry() {
    if (!plan) {
      return {
        planned: false,
        structureId: state.structureId,
        seed: String(state.seed),
        chunk: [state.chunkX, state.chunkZ],
        hash: null,
        blocks: world.blocks.size,
        pieces: []
      };
    }
    const start = plan.start;
    const engine = buildEngine();
    const reference = start.placementReference();
    return {
      planned: true,
      structureId: start.structureId,
      set: start.set,
      seed: String(state.seed),
      biome: start.biome,
      chunk: [start.chunkX, start.chunkZ],
      step: start.generationStep,
      terrainAdaptation: start.terrainAdaptation,
      box: start.box ? start.box.toArray() : null,
      tightBox: start.tightBox ? start.tightBox.toArray() : null,
      reference: reference ? [reference.x, reference.y, reference.z] : null,
      hash: engine.hashStart(start),
      chunkCount: start.affectedChunks().length,
      chunks: start.affectedChunks().map((c) => [c.x, c.z]),
      blocks: world.blocks.size,
      // Air is never stored, so this counts the cells a template CLEARED. It is reported rather than hidden:
      // "realized 1170 blocks and cleared 40 cells" says more than a total that folds the two together.
      airSkipped: lastRealize ? lastRealize.airSkipped : 0,
      pieces: start.pieces.map((piece, index) => ({
        index,
        id: piece.id,
        type: piece.type,
        family: piece.family,
        box: piece.box.toArray(),
        rotation: piece.rotation,
        mirror: piece.mirror,
        depth: piece.depth,
        parentIndex: piece.parentIndex,
        pool: piece.pool,
        template: piece.template,
        projection: piece.projection,
        jointType: piece.jointType
      }))
    };
  }

  function applyStructureDefaults() {
    const entry = inspectorStructures().find((s) => s.id === state.structureId);
    if (entry && !state.biomeOverride) world.biome = entry.defaultBiome;
  }

  return {
    world,
    state,
    events,
    get plan() { return plan; },
    get info() { return inspectorStructures().find((s) => s.id === state.structureId) || null; },

    setSeed(seed) {
      // Accepts a string so the UI can pass an input straight through, but rejects non-integers rather
      // than coercing them: a silently-truncated seed would make the determinism check lie.
      const text = String(seed).trim();
      if (!/^-?\d+$/.test(text)) throw new Error(`seed must be an integer, got "${seed}"`);
      state.seed = BigInt(text) >= -(2n ** 63n) && BigInt(text) < 2n ** 63n ? text : state.seed;
      lastPlanKey = null;
      log(`seed = ${state.seed}`);
      return state.seed;
    },

    setStructure(structureId) {
      const entry = inspectorStructures().find((s) => s.id === structureId);
      if (!entry) throw new Error(`unknown structure "${structureId}"`);
      state.structureId = structureId;
      state.biomeOverride = null;
      applyStructureDefaults();
      plan = null;
      lastPlanKey = null;
      log(`structure = ${structureId}${entry.implemented ? '' : ' (no generator yet)'}`);
      return entry;
    },

    setChunk(chunkX, chunkZ) {
      state.chunkX = Math.trunc(chunkX);
      state.chunkZ = Math.trunc(chunkZ);
      log(`chunk = ${state.chunkX}, ${state.chunkZ}`);
      return [state.chunkX, state.chunkZ];
    },

    setBiome(biome) {
      state.biomeOverride = biome;
      world.biome = biome;
      log(`biome = ${biome}`);
      return biome;
    },

    setSurface(surface) {
      state.surface = Math.trunc(surface);
      world.surface = state.surface;
      log(`surface = ${state.surface}`);
      return state.surface;
    },

    /** Plan the structure whose start sits in the current chunk. Returns null when there is none. */
    planChunk() {
      applyStructureDefaults();
      const engine = buildEngine();
      plan = null;
      world.clear();
      const result = engine.planChunk(state.chunkX, state.chunkZ);
    lastPlan = result;
      if (!result) {
        log(`no structure in chunk ${state.chunkX}, ${state.chunkZ}`);
        return null;
      }
      plan = result;
      lastPlanKey = `${state.seed}|${state.structureId}|${state.chunkX},${state.chunkZ}`;
      log(`planned ${result.structureId} via ${result.set} at chunk ${result.start.chunkX}, ${result.start.chunkZ}`);
      return result;
    },

    /**
     * `/locate`-style: find the nearest instance of the selected structure and plan it.
     *
     * This is the default action because most structures are sparse: at spacing 34 a chosen chunk is
     * empty about 97% of the time, which would make the inspector look broken rather than empty.
     */
    planNearest({ maxRadiusChunks = 512 } = {}) {
      applyStructureDefaults();
      const engine = buildEngine();
      world.clear();
      const found = engine.locate(state.structureId, state.chunkX * 16, state.chunkZ * 16, { maxRadiusChunks });
    lastPlan = found;
      if (!found) {
        plan = null;
        log(`no ${state.structureId} within ${maxRadiusChunks} chunks of ${state.chunkX}, ${state.chunkZ}`);
        return null;
      }
      state.chunkX = found.chunk[0];
      state.chunkZ = found.chunk[1];
      plan = { structureId: found.structureId, set: found.set, start: found.start };
      lastPlanKey = `${state.seed}|${state.structureId}|${state.chunkX},${state.chunkZ}`;
      log(`located ${found.structureId} at chunk ${found.chunk[0]}, ${found.chunk[1]} (${found.distance.toFixed(0)} blocks away)`);
      return found;
    },

    /** Realize the planned start into the preview grid. */
    realize() {
      if (!plan) return 0;
      world.clear();
      const engine = buildEngine();
      // AIR IS NOT STORED, and this is deliberate rather than an optimisation. Templates write air to CARVE
      // their interiors out of terrain, but the preview world is empty, so every cell a template clears is
      // already empty: skipping it changes nothing about the result and stops the preview from being littered
      // with air cells. Those cells used to render as BLACK CUBES -- air is black in the palette -- which made
      // a village look like a handful of black blocks, and they inflated the reported block count.
      let airSkipped = 0;
      // Side effects must not be chained with `&&`: the writer has to return a real boolean, and the
      // metadata has to land whether or not the caller would have short-circuited.
      const written = engine.realize(plan.start, (x, y, z, id, meta) => {
        if (id === BLOCKS.AIR) { airSkipped++; return false; }
        if (!world.setBlock(x, y, z, id)) return false;
        if (meta) world.setBlockMeta(x, y, z, meta);
        return true;
      });
      lastRealize = { written, airSkipped };
      log(`realized ${written} block(s) into the preview${airSkipped ? ` (${airSkipped} air cell(s) skipped: the preview starts empty)` : ''}`);
      return written;
    },

    /**
     * The determinism check the inspector shows: plan the same structure twice from scratch and compare
     * hashes. A mismatch means something in the engine reads state that is not (seed, chunk).
     */
    determinismCheck() {
      applyStructureDefaults();
      const engineA = buildEngine();
      const engineB = buildEngine();
      const a = engineA.planChunk(state.chunkX, state.chunkZ);
      const b = engineB.planChunk(state.chunkX, state.chunkZ);
      if (!a || !b) {
        return { ok: a === null && b === null, reason: a || b ? 'one run planned and the other did not' : 'no structure here to compare' };
      }
      const hashA = engineA.hashStart(a.start);
      const hashB = engineB.hashStart(b.start);
      return { ok: hashA === hashB, hashA, hashB, reason: hashA === hashB ? 'identical plan' : 'hashes differ' };
    },

    /**
     * Placement candidates around the origin, for the mission §23 "structure-set candidate chunks"
     * overlay: every region's chosen chunk, flagged with whether the frequency/biome checks accepted it.
     */
    placementPreview({ radiusChunks = 96 } = {}) {
      applyStructureDefaults();
      const entry = getSetForStructure(state.structureId);
      if (!entry) return { chunks: [], spacing: null };
      const engine = buildEngine();
      const set = engine.sets.get(entry.name);
      if (!set) return { chunks: [], spacing: null };
      const placement = set.placement;
      const context = { seed: state.seed, placementForSet: (name) => engine.sets.get(name)?.placement || null };
      const chunks = [];
      const max = Math.max(1, Math.trunc(radiusChunks));
      for (let chunkX = state.chunkX - max; chunkX <= state.chunkX + max; chunkX += Math.max(1, placement.spacing || 1)) {
        for (let chunkZ = state.chunkZ - max; chunkZ <= state.chunkZ + max; chunkZ += Math.max(1, placement.spacing || 1)) {
          const accepted = placement.isStructureChunk(context, chunkX, chunkZ, entry.name);
          if (!accepted) continue;
          chunks.push({ chunkX, chunkZ, distance: Math.hypot(chunkX - state.chunkX, chunkZ - state.chunkZ) });
        }
      }
      chunks.sort((a, b) => a.distance - b.distance);
      return { chunks: chunks.slice(0, 400), spacing: placement.spacing || 1, set: entry.name, total: chunks.length };
    },

    /** Compact snapshot for tests and for the page's JSON pane. */
    /** The last plan, so a panel can render pieces, connectors and boxes rather than a summary. */
    currentPlan() {
      return lastPlan ?? null;
    },

    /** The engine's plan hash, which is the value a golden file records. */
    hashStart(start) {
      return buildEngine().hashStart(start);
    },

    /** The chunks a start touches, so a panel can show its footprint. */
    chunksForStart(start) {
      return buildEngine().chunksForStart(start);
    },

    /**
     * Realize with terrain adaptation applied, returning the engine's report plus the adaptation writes.
     *
     * The engine tags adaptation blocks through their meta, which is how they are told apart from the
     * structure's own blocks here: the panel needs the distinction, because "adaptation added 400 blocks" and
     * "the structure wrote 400 blocks" must not look the same.
     */
    realizeWithAdaptation({ surfaceY = null, foundationBlock = null, adaptation = null, airBlock = null } = {}) {
      const plan = lastPlan ?? null;
      if (!plan || !plan.start) return null;
      const engine = buildEngine();
      // A REPORT MUST NOT MUTATE THE PREVIEW. This used to clear `world` and realize back into it, CLIPPED to
      // the start's own chunk, and the adaptation panel runs on every refresh -- so merely drawing the panel
      // wiped the preview and left one chunk's worth of blocks behind. That is why a 20-piece village reported
      // 231 blocks and rendered as a dense blob: 1210 cells became 231 the moment the panel was rendered.
      //
      // Nothing needs storing here. The caller wants counts and sample positions, so the writer counts and
      // collects, and the preview volume is left exactly as `realize()` left it.
      const adaptationWrites = [];
      let airSkipped = 0;
      let structureCells = 0;
      const report = engine.realizeWithReport(plan.start, (x, y, z, id, meta) => {
        if (id === BLOCKS.AIR) { airSkipped++; return false; }
        if (meta && meta.terrainAdaptation) adaptationWrites.push({ x, y, z, id, kind: meta.terrainAdaptation });
        else structureCells++;
        return true;
      }, {
        // NO chunk clip: the report is about the whole structure, and clipping it to one chunk would report
        // adaptation for a fragment of what the reader is looking at.
        chunkX: null,
        chunkZ: null,
        surfaceY,
        foundationBlock,
        airBlock,
        adaptation
      });
      return { ...report, adaptationWrites, airSkipped, structureCells };
    },
    snapshot() {
      const info = telemetry();
      return {
        seed: String(state.seed),
        structureId: state.structureId,
        biome: world.biome,
        surface: world.surface,
        chunk: [state.chunkX, state.chunkZ],
        planKey: lastPlanKey,
        lastHash,
        ...info
      };
    },

    /** Record the current hash, so a caller can compare two snapshots itself. */
    stampHash() {
      lastHash = telemetry().hash;
      return lastHash;
    }
  };
}

export { STRUCTURES, STRUCTURE_SETS, GeneratorFamily };
