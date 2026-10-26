import { mountainHeight, mountainColumn } from './worldgen/mountainTerrain.js';
import { CaveTerrain, decorateCaves, carveNetherCaves } from './worldgen/caveTerrain.js';
import { plantFireflyBushes } from './worldgen/fireflyBushes.js';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { Redstone } from './redstone.js';
import { LavaSimulation } from './lavaSimulation.js';
import { FallingBlocks } from './fallingBlocks.js';
import { LeafDecay } from './leafDecay.js';
import { WaterSimulation } from './waterSimulation.js';
import { BIOMES, getBiomeDef } from './biomes.js';
import { LightEngine } from './spawning/lightEngine.js';
import { JavaRandom } from './spawning/spawnRandom.js';
import { createWorldStructures, enabledStructureIds, withEndFixtures, GENERATION_COUNTS } from './worldStructures.js';
import { GenerationRecorder } from './generationRecorder.js';
import { netherOreAt, decorateNetherChunk } from './netherTerrain.js';
import { endColumn, decorateEndChunk } from './endTerrain.js';
import { isChorus, collapseChorusSupport } from './chorus.js';
import { decorateEndReturnGateway, restoreEndGatewaysInChunk } from './endProgression.js';
import { winningSpacingScale, winningSpacingOverrides } from './dataPackRuntime.js';
import { lootSeedFor } from './villageLoot.js';
import { rollStructureLoot } from './structureLoot.js';
import { BED_DIRECTIONS } from './bed.js';
import { isWallAttached, attachStateForStructure, rememberAttachment } from './wallAttached.js';
import { findSafeMobSpawnPosition } from './mobMotion.js';
import { settleChunkWater } from './worldgen/settleWater.js';

/**
 * How much water a new chunk's arrival may check (#settleNewWater), in cells: a frame's share. A long cascade's remainder
 * goes on in the ordinary simulation. A count rather than a time, so that a chunk comes out the same on every machine.
 */
const SETTLE_CELLS = 1000;

// Gradient tables, built once. They were nested array literals inside noise2D/noise3D, so every sample (thousands
// per chunk) allocated thirteen arrays; same values, so the same terrain.
const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
const GRAD2_X = Int8Array.of(1, -1, 1, -1, 1, -1, 0, 0, 1, -1, 0, 0);
const GRAD2_Y = Int8Array.of(1, 1, -1, -1, 0, 0, 1, -1, 1, 1, 0, 0);
const GRAD3_X = Int8Array.of(1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0);
const GRAD3_Y = Int8Array.of(1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1);
const GRAD3_Z = Int8Array.of(0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1);

// Fast Simplex Noise 2D & 3D implementation
class FastNoise {
  constructor(seed = 1337) {
    this.p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) this.p[i] = i;
    // Fisher-Yates shuffle with seed
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807) % 2147483647;
      const j = s % (i + 1);
      const tmp = this.p[i];
      this.p[i] = this.p[j];
      this.p[j] = tmp;
    }
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = this.p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise2D(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;

    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    const ii = i & 255;
    const jj = j & 255;


    let t0 = 0.5 - x0 * x0 - y0 * y0;
    let n0 = 0;
    if (t0 > 0) {
      t0 *= t0;
      const gi0 = this.permMod12[ii + this.perm[jj]];
      n0 = t0 * t0 * (GRAD2_X[gi0] * x0 + GRAD2_Y[gi0] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    let n1 = 0;
    if (t1 > 0) {
      t1 *= t1;
      const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]];
      n1 = t1 * t1 * (GRAD2_X[gi1] * x1 + GRAD2_Y[gi1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    let n2 = 0;
    if (t2 > 0) {
      t2 *= t2;
      const gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]];
      n2 = t2 * t2 * (GRAD2_X[gi2] * x2 + GRAD2_Y[gi2] * y2);
    }

    return 70.0 * (n0 + n1 + n2);
  }

  noise3D(xin, yin, zin) {
    const F3 = 1.0 / 3.0;
    const G3 = 1.0 / 6.0;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;
    const z0 = zin - Z0;

    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2.0 * G3;
    const y2 = y0 - j2 + 2.0 * G3;
    const z2 = z0 - k2 + 2.0 * G3;
    const x3 = x0 - 1.0 + 3.0 * G3;
    const y3 = y0 - 1.0 + 3.0 * G3;
    const z3 = z0 - 1.0 + 3.0 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;


    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    let n0 = 0;
    if (t0 > 0) {
      t0 *= t0;
      const gi0 = this.permMod12[ii + this.perm[jj + this.perm[kk]]];
      n0 = t0 * t0 * (GRAD3_X[gi0] * x0 + GRAD3_Y[gi0] * y0 + GRAD3_Z[gi0] * z0);
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    let n1 = 0;
    if (t1 > 0) {
      t1 *= t1;
      const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1 + this.perm[kk + k1]]];
      n1 = t1 * t1 * (GRAD3_X[gi1] * x1 + GRAD3_Y[gi1] * y1 + GRAD3_Z[gi1] * z1);
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    let n2 = 0;
    if (t2 > 0) {
      t2 *= t2;
      const gi2 = this.permMod12[ii + i2 + this.perm[jj + j2 + this.perm[kk + k2]]];
      n2 = t2 * t2 * (GRAD3_X[gi2] * x2 + GRAD3_Y[gi2] * y2 + GRAD3_Z[gi2] * z2);
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    let n3 = 0;
    if (t3 > 0) {
      t3 *= t3;
      const gi3 = this.permMod12[ii + 1 + this.perm[jj + 1 + this.perm[kk + 1]]];
      n3 = t3 * t3 * (GRAD3_X[gi3] * x3 + GRAD3_Y[gi3] * y3 + GRAD3_Z[gi3] * z3);
    }

    return 32.0 * (n0 + n1 + n2 + n3);
  }
}

export const CHUNK_SIZE_X = 16;
export const CHUNK_SIZE_Z = 16;
export const CHUNK_HEIGHT = 64;

// The local-coordinate lookup uses a bitmask instead of a modulo, which is only equivalent for a
// power of two. Fail loudly here rather than producing subtly wrong block reads if this changes.
if ((CHUNK_SIZE_X & (CHUNK_SIZE_X - 1)) !== 0 || (CHUNK_SIZE_Z & (CHUNK_SIZE_Z - 1)) !== 0) {
  throw new Error('CHUNK_SIZE_X and CHUNK_SIZE_Z must be powers of two for the bitmask lookup');
}

/**
 * The structure-orientation map, counting its changes.
 *
 * The monster and trial spawners tick 20 times a second, and each tick asked the world for its spawners by walking
 * every oriented block -- every stair, door and chest a structure placed, thousands in a village. With a change count
 * the world rebuilds those lists only after something was actually set or removed.
 */
export class OrientationMap extends Map {
  constructor(entries) { super(); this.version = 0; this.recorder = null; if (entries) for (const [k, v] of entries) this.set(k, v); }
  // `recorder` is set only while a chunk generates under a GenerationRecorder (generationRecorder.js).
  set(key, value) { this.version++; this.recorder?.mapSet(key, value); return super.set(key, value); }
  // Recorded even when absent here: the game's map can still hold the key from an earlier visit to the chunk.
  delete(key) { this.recorder?.mapDelete(key); const had = super.delete(key); if (had) this.version++; return had; }
  clear() { if (this.size) this.version++; super.clear(); }
}

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    // Voxel ids are stored 16-bit rather than 8-bit.
    //
    // This was a Uint8Array until generated parity content pushed the block id range past 255. The
    // failure was silent and nasty: `setVoxel(4, 4, 4, 270)` stored 270, the array wrapped it to 14,
    // and the chunk read back Sand. Nothing threw. The only symptom was a block that simply never
    // appeared, because the mesher never saw the id it was asked to draw.
    //
    // A quarter more memory than is strictly needed (192 ids fit in 8 bits today) buys immunity to
    // the same class of bug as the registry grows, and the save format is unaffected: the run-length
    // encoder in mapManager.js writes values, not bytes.
    this.voxels = new Uint16Array(CHUNK_SIZE_X * CHUNK_HEIGHT * CHUNK_SIZE_Z);
    this.waterLevels = new Uint8Array(this.voxels.length);
    this.opaqueMesh = null;
    this.transparentMesh = null;
    this.waterMesh = null;
    this.dirty = true;
  }

  getIndex(lx, ly, lz) {
    return (ly * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx;
  }

  getVoxel(lx, ly, lz) {
    if (lx < 0 || lx >= CHUNK_SIZE_X || ly < 0 || ly >= CHUNK_HEIGHT || lz < 0 || lz >= CHUNK_SIZE_Z) {
      return BLOCKS.AIR;
    }
    return this.voxels[this.getIndex(lx, ly, lz)];
  }

  setVoxel(lx, ly, lz, blockId) {
    if (lx < 0 || lx >= CHUNK_SIZE_X || ly < 0 || ly >= CHUNK_HEIGHT || lz < 0 || lz >= CHUNK_SIZE_Z) {
      return;
    }
    const index = this.getIndex(lx, ly, lz);
    this.voxels[index] = blockId;
    // Weather column caches must notice roof placement/removal immediately.
    this.weatherRevision = (this.weatherRevision || 0) + 1;
    this.waterLevels[index] = 0;
    this.dirty = true;
  }
}

/**
 * Direct-mapped cache in front of the chunk Map.
 *
 * `getVoxel` is the hottest function in the engine: the mesher alone calls it six times per
 * non-air voxel for face culling plus up to eight more for ambient occlusion, which is roughly
 * 130,000 lookups per chunk. The old implementation did `Math.floor` twice, built a template
 * string, and did a Map lookup on every one of those calls -- measured at 121ns each, so about
 * 16ms of pure lookup overhead per chunk.
 *
 * This replaces all of that with a mask, an array index, and a comparison. Hash collisions are
 * resolved by simply falling back to the Map, so correctness does not depend on the hash being
 * good -- only speed does. The mesher's meshing loop walks x, then y, then z within a chunk, so
 * consecutive lookups nearly always land in the same chunk slot and hit.
 */
const CHUNK_CACHE_BITS = 12;                    // 4096 slots, ~32KB of pointers
const CHUNK_CACHE_SIZE = 1 << CHUNK_CACHE_BITS;
const CHUNK_CACHE_MASK = CHUNK_CACHE_SIZE - 1;

/** Offset so negative chunk coordinates still produce a positive hash. */
const CHUNK_HASH_OFFSET = 1 << 20;

/**
 * Deterministic per-position hash in [0, 1), for placing features on a global grid.
 *
 * Must not depend on the chunk, or the same world position would produce a different answer in a
 * different chunk and trees would not span borders. The sine hash the previous code used is kept in
 * spirit but at a much larger multiplier, because `sin` of a small argument is smooth enough that
 * nearby positions came out correlated.
 */
function treeHash(wx, wz, seed) {
  const h = Math.sin(wx * 127.1 + wz * 311.7 + seed * 0.017) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * A chunk plus the ability to be written to in coordinates that may fall outside it.
 *
 * The tree generators work in chunk-local coordinates and routinely reach two blocks past the
 * chunk. They used to guard every write with bounds checks, which silently truncated any tree near
 * an edge. This presents the same `setVoxel`/`getVoxel` interface they already use and simply drops
 * out-of-range writes, so a canopy can be drawn by whichever chunk it overlaps and each chunk stays
 * independently generatable -- no chunk ever needs another to exist first.
 */
class ChunkVoxelWriter {
  constructor(chunk, seedForTree = 0, phase = 'all') {
    this.chunk = chunk;
    /** 'trunk', 'canopy' or 'all': which part of the tree this writer is allowed to write. */
    this.phase = phase;
    /**
     * Seeded per-tree random source, replacing Math.random in the generators.
     *
     * World generation must be a pure function of the seed. Eight generators used Math.random for
     * tree shape -- the oak/birch mix, mushroom colour, bamboo and fungus heights, ice spikes,
     * chorus plants, basalt pillars -- which made the same world position produce different terrain
     * in different runs and, worse, in different chunk generation ORDERS. That showed up as a chunk
     * holding nine different leaves depending on whether its neighbours had been generated first.
     * Carrying the generator on the writer means each tree gets its own reproducible stream without
     * threading a parameter through seventeen function signatures.
     */
    this.rng = mulberry32(seedForTree);
  }

  getVoxel(lx, ly, lz) {
    return this.chunk.getVoxel(lx, ly, lz);
  }

  setVoxel(lx, ly, lz, blockId) {
    if (lx < 0 || lx >= CHUNK_SIZE_X || lz < 0 || lz >= CHUNK_SIZE_Z) return;
    // Trees are written trunk-first and canopy-second so that one tree's leaves cannot bury another
    // tree's trunk. The phase filter is what separates the two passes.
    if (this.phase === 'trunk' && !isLog(blockId)) return;
    if (this.phase === 'canopy' && isLog(blockId)) return;
    // A tree never replaces another block of itself either: the generators place leaves over the
    // trunk's own top rows, which capped trunks in leaves and made trees look truncated. This is
    // in addition to the trunk-before-canopy ordering, because within one tree the generators
    // interleave the two.
    if (isLog(this.chunk.getVoxel(lx, ly, lz)) && !isLog(blockId)) return;
    // In the original code trees replaced anything; inside the tree passes the only things present
    // at a tree's own coordinates are that tree's own blocks, so a non-air guard is safe and keeps
    // a canopy from eating terrain.
    const existing = this.chunk.getVoxel(lx, ly, lz);
    // A trunk may not be written into a canopy that is already there. Two trees four blocks apart
    // overlap, so this happens whenever an earlier tree in grid order reached into this cell; the
    // later tree is dropped. Skipping it is correct -- its canopy would have overlapped the earlier
    // tree anyway -- and it is deterministic, because within a chunk trees are decided in grid order
    // and a canopy is only written by a tree earlier in that same order. Without this the trunk
    // landed on leaves and the tree appeared to float.
    if (isLog(blockId) && !isLog(existing) && existing !== BLOCKS.AIR) return;
    // And a canopy may not replace a trunk, for the same overlap reason the other way round.
    if (isLog(existing) && !isLog(blockId)) return;
    // Trees never replace terrain; they fill air or their own earlier output only.
    if (existing !== BLOCKS.AIR && !isPartOfTree(this, lx, ly, lz)) return;
    this.chunk.setVoxel(lx, ly, lz, blockId);
  }
}

/**
 * Whether a cell already holds a block belonging to a tree, i.e. a log or a leaf.
 *
 * Used to let the two tree passes overwrite their own previous output while keeping them from
 * touching terrain.
 */
function isPartOfTree(writer, lx, ly, lz) {
  const id = writer.chunk.getVoxel(lx, ly, lz);
  if (isLog(id)) return true;
  const def = BLOCK_DEFS[id];
  return Boolean(def?.name && (def.name.toLowerCase().includes('leaves')
    || def.name.toLowerCase().includes('wart_block')));
}

/** True for any log or stem: the trunk of a tree. */
function isLog(blockId) {
  const def = BLOCK_DEFS[blockId];
  return Boolean(def?.name && def.name.toLowerCase().includes('log'))
    || blockId === BLOCKS.CRIMSON_STEM || blockId === BLOCKS.WARPED_STEM;
}

function isLogOrLeaves(blockId) {
  if (isLog(blockId)) return true;
  const def = BLOCK_DEFS[blockId];
  return Boolean(def?.name && (def.name.toLowerCase().includes('leaves')
    || def.name.toLowerCase().includes('wart_block')));
}

/**
 * A small seeded PRNG, so a decision made during generation depends only on position and seed.
 *
 * mulberry32: 32-bit state, passes the usual small-scale randomness tests, and is a few operations
 * per call, which matters because this sits inside the terrain loop.
 */
function mulberry32(seed) {
  let a = (seed | 0) >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable 32-bit seed from a world position, so the same tree always looks the same. */
function treeSeed(wx, wz, seed) {
  return (Math.imul(wx | 0, 0x9E3779B1) ^ Math.imul(wz | 0, 0x85EBCA77) ^ Math.imul(seed | 0, 0xC2B2AE3D)) | 0;
}

/**
 * The random source for a tree being written.
 *
 * A tree is always written through a ChunkVoxelWriter, which carries its own seeded stream. The
 * fallback keeps the generators callable with a bare chunk -- the nether fungi helpers are called
 * that way from the nether branch -- without changing their signatures.
 */
function rngOf(target) {
  return target && typeof target.rng === 'function' ? target.rng : Math.random;
}

/**
 * Deterministic per-position hash in [0, 1), for placing features on a global grid.
 *
 * Must not depend on the chunk, or the same world position would produce a different answer in a
 * different chunk and trees would not span borders. The sine hash the previous code used is kept in
 * spirit but at much larger multipliers, because `sin` of a nearby argument is smooth enough that
 * neighbouring positions came out correlated -- and because this is also used as the candidate
 * ACCEPTANCE test, that correlation was visible as banding.
 *
 * This accepts the candidate, and the small jitter inside a cell is added separately by `treeHash`,
 * so the two concerns stay independent.
 */
function candidateAt(gx, gz, seed) {
  const h = Math.sin(gx * 127.1 + gz * 311.7 + seed * 0.017) * 43758.5453;
  return h - Math.floor(h);
}

/** The jittered world position of a candidate trunk, deterministically derived from its cell. */
function jitterOf(gx, gz, seed) {
  return treeHash(gx * 7 + 1, gz * 13 + 3, seed);
}

/**
 * Blocks a trunk may stand on.
 *
 * Anything that is terrain. Leaves are excluded deliberately: a neighbouring tree's canopy can
 * reach into this cell, and a trunk written on top of leaves floats.
 */
function isTrunkGround(blockId) {
  if (blockId === BLOCKS.AIR) return false;
  if (blockId === BLOCKS.WATER || blockId === BLOCKS.LAVA) return false;
  const def = BLOCK_DEFS[blockId];
  if (!def) return false;
  if (def.plant) return false;
  if (def.name && def.name.toLowerCase().includes('leaves')) return false;
  if (def.name && def.name.toLowerCase().includes('log')) return false;
  return true;
}

export class World {
  constructor(seed = 4289, selectedBiome = 'all') {
    this.seed = seed;
    this.selectedBiome = selectedBiome || 'all';
    this.dimension = 'overworld';
    this.chunks = new Map(); // key -> Chunk
    this.dimensionChunks = { overworld: this.chunks, nether: new Map() };
    this.seaLevel = 22;
    this.isFlatWorld = false;
    // Authored maps own their terrain; missing chunks are empty, never biome terrain.
    this.generationMode = 'procedural';
    // Building Studio's invisible ground: every cell below this height reads as solid (a barrier) without being
    // stored or drawn, and nothing can be placed there. -Infinity everywhere else, which disables it.
    this.floorY = -Infinity;
    /** Direct-mapped lookup cache; see CHUNK_CACHE_* above. Not authoritative -- the Map is. */
    this.chunkCache = new Array(CHUNK_CACHE_SIZE).fill(null);
    this.chunkCacheHits = 0;
    this.chunkCacheMisses = 0;
    this.water = new WaterSimulation(this);
    /** New terrain's water, run to rest as each chunk arrives (#settleNewWater); the game's own flows stay in `water`. */
    this.newWater = new WaterSimulation(this, { queuesOwnChanges: true });
    this.lava = new LavaSimulation(this);
    this.redstone = new Redstone(this);
    this.fallingBlocks = new FallingBlocks(this);
    this.leafDecay = new LeafDecay(this);
    /**
     * Sky and block light, propagated per chunk and kept per dimension.
     *
     * Natural mob spawning is gated on light level, so without this every spawn rule had to guess
     * (the old code answered "15" for every position). See src/spawning/lightEngine.js.
     *
     * One engine per dimension, not one per world: the three dimensions reuse the same chunk keys
     * (`0,0` names a chunk in each of them), so a single engine would answer with the surface
     * dimension's light while the player stood in the Nether.
     */
    this.lightByDimension = {
      overworld: new LightEngine(this),
      nether: new LightEngine(this),
      the_end: new LightEngine(this),
    };
    /**
     * Seeded generator for natural spawning.
     *
     * Derived from the world seed rather than from `Math.random`, so the spawn decisions that are
     * not player-movement dependent replay identically for a given seed, which is what makes the
     * differential and travel regression tests possible.
     */
    this.spawnRandom = new JavaRandom(seed ^ 0x5EED5EED);

    this.reseed(seed, selectedBiome);
  }

  /** The light engine for the dimension currently being played. */
  get light() {
    return this.lightByDimension[this.currentDimension] || this.lightByDimension.overworld;
  }

  /**
   * (Re)create the structure engine from the CURRENT seed and the data packs applied right now.
   *
   * `reseed` calls this, and so does `generateNewWorld` once it has applied the packs. Both are needed: the
   * setup screen reseeds BEFORE the packs are applied, so an engine built only in `reseed` captured the
   * default three structures and vanilla spacing and never saw the chosen preset (Structure Hunter generated
   * three structures, 400+ blocks apart).
   */
  rebuildStructures({ enabledIds = withEndFixtures(enabledStructureIds()) } = {}) {
    this.structures = createWorldStructures({
      seed: this.seed,
      world: this,
      sizes: { x: CHUNK_SIZE_X, height: CHUNK_HEIGHT, z: CHUNK_SIZE_Z },
      enabledIds,
      // A pack can ask for denser structures (Structure Hunter); 1 is vanilla spacing.
      spacingScale: winningSpacingScale(),
      spacingOverrides: winningSpacingOverrides(),
      // While a chunk generates under a recorder (a terrain worker, or the game checking one), the request is
      // also written down; see generationRecorder.js. Without one, these are the plain hooks.
      onOrientation: (request) => this.generationRecorder
        ? this.generationRecorder.orient(request, (r) => this.applyStructureOrientation(r))
        : this.applyStructureOrientation(request),
      onSpawn: (request) => this.generationRecorder
        ? this.generationRecorder.spawn(request, (r) => this.spawnStructureMob(r))
        : this.spawnStructureMob(request),
    });
    return this.structures;
  }

  /** Villagers, the iron golem and the pen animals of a generated village: a structure's spawn request. */
  spawnStructureMob(request) {
    const mobs = this.game?.mobs;
    if (!mobs || typeof mobs.spawnMob !== 'function') return false;
    // A swamp hut's witch does not spawn on Peaceful (the wiki says so); it is dropped, not retried.
    if ((request.type === 'witch' || request.type === 'zombie_villager') && this.game.difficulty === 'peaceful') return true;
    // The End crystals on the spikes belong to the dragon fight, which places them (bossFights.initEndArena).
    if (request.type === 'end_crystal') return true;
    // A mineshaft's chest is a minecart with a chest, standing on its rail.
    if (request.type === 'chest_minecart') {
      const rails = this.game?.railSystem;
      if (!rails) return false;
      const cart = rails.spawnCart([request.x, request.y, request.z], { subType: 'chest_minecart' });
      if (cart && request.options?.lootTable) cart.items = rollStructureLoot(request.options.lootTable, lootSeedFor(Math.floor(request.x), Math.floor(request.y), Math.floor(request.z), this.seed));
      return true;
    }
    if (request.type === 'iron_golem' || request.type === 'villager' || request.type === 'camel') {
      const safe = findSafeMobSpawnPosition(this, mobs, request.type, request.x, request.y, request.z);
      if (safe) {
        request.x = safe.x;
        request.y = safe.y;
        request.z = safe.z;
      }
    }
    const mob = mobs.spawnMob(request.type, request.x, request.y, request.z, request.options);
    if (!mob) return false;
    // Structure mobs do not despawn by distance (the wiki, for the hut's witch and cat, and the same rule
    // holds for a village's golem and animals): the despawn pass reads this flag.
    if (request.options?.persistent && typeof mob === 'object') mob.persistenceRequired = true;
    return true;
  }

  /**
   * Which way a structure's door, bed, chest or stair faces.
   *
   * The voxel world stores block ids only, so orientation lives with the managers that already own it: the door
   * manager (facing, hinge), the bed manager (the foot-to-head direction), the chest manager (facing and
   * contents) and, for stairs, `structureOrientations`, which the mesher reads. Returns false when a manager is
   * not up yet, so the request waits and is retried (`flushSpawns`).
   *
   * Everything applied is remembered in `structureOrientations` so a save can write it down and a load can apply
   * it again; breaking the block forgets it (see `setVoxel`).
   */
  applyStructureOrientation(request) {
    const key0 = `${request.x},${request.y},${request.z}`;
    // A monster spawner: the mob it spawns lives with the block's other structure data (and is saved with it).
    if (request.spawner || request.trialSpawner || request.vault || request.plantAge !== undefined || request.anchorCharges !== undefined || request.berries !== undefined || request.verticalDirection !== undefined) {
      this.structureOrientations.set(key0, { ...request });
      return true;
    }
    // A ladder or vine: which wall it hangs on (wallAttached.js).
    if (isWallAttached(request.id)) {
      rememberAttachment(this, request.x, request.y, request.z, request.id, attachStateForStructure(request.id, request));
      return true;
    }
    if (request.slabType === 'top' && BLOCK_DEFS[request.id]?.slab) {
      this.structureOrientations.set(key0, { ...request });
      return true;
    }
    // A sign: which way it faces (the mesher turns its board) and, from an imported block entity, its text
    // (signText.js draws it). Kept here so a save writes both down and breaking the sign forgets both.
    const signDef = BLOCK_DEFS[request.id];
    if (signDef?.sign || signDef?.wallSign || signDef?.hangingSign) {
      const dir = { east: 0, west: 1, south: 2, north: 3 }[request.facing] ?? 3;
      this.structureOrientations.set(key0, { ...request, dir });
      this.game?.signText?.refresh?.();
      return true;
    }
    // A brewing stand a structure stocks (the End ship's two potions of Healing II), in its bottle slots, once.
    if (request.id === BLOCKS.BREWING_STAND && request.extraItems?.length) {
      const brewing = this.game?.ui?.brewingManager ?? this.game?.brewingManager;
      if (!brewing) return false;
      if (!brewing.getStand(request.x, request.y, request.z)) {
        const stand = brewing.getOrCreateStand(request.x, request.y, request.z);
        request.extraItems.slice(0, stand.bottles.length).forEach((item, i) => { stand.bottles[i] = { id: item.id, count: 1, isBlock: false }; });
      }
      return true;
    }
    const index = { east: 0, west: 1, south: 2, north: 3 }[request.facing];
    if (index === undefined) return true;
    const def = BLOCK_DEFS[request.id];
    const key = `${request.x},${request.y},${request.z}`;
    if (def?.door) {
      if (request.half === 'upper') return true; // the lower half registers both
      const doors = this.game?.doorManager || this.doorManager;
      if (!doors) return false;
      doors.adoptDoor([request.x, request.y, request.z], index, request.hinge || 'left');
    } else if (def?.bed && !def.isHead && request.half !== 'head' && !/_head$/.test(request.name ?? '')) {
      const beds = this.game?.bedManager;
      if (!beds) return false;
      const offset = BED_DIRECTIONS[index];
      beds.registerBed([request.x, request.y, request.z], [request.x + offset[0], request.y, request.z + offset[2]], index);
    } else if (request.id === BLOCKS.CHEST) {
      const chests = this.game?.chestManager || this.chestManager;
      if (!chests) return false;
      // Chest facing uses its own order: 0 south, 1 west, 2 north, 3 east.
      const chestFacing = { south: 0, west: 1, north: 2, east: 3 }[request.facing];
      const items = request.lootTable ? rollStructureLoot(request.lootTable, lootSeedFor(request.x, request.y, request.z, this.seed)) : [];
      // Items a structure puts in a chest besides its loot (the End ship's elytra), in the first free slots.
      for (const extra of request.extraItems ?? []) {
        const slot = items.findIndex((item) => !item);
        const stack = { id: extra.id, isBlock: false, count: extra.count ?? 1 };
        if (slot >= 0) items[slot] = stack; else if (items.length < 27) items.push(stack);
      }
      const existing = chests.getChest(request.x, request.y, request.z);
      if (Array.isArray(request.items)) {
        // Exact contents from an imported block entity: they replace whatever the chest held, so a schematic
        // that changes and is loaded again shows its new contents.
        if (existing) existing.items = request.items.slice(0, 27).map((item) => (item ? { ...item } : null));
        else chests.adoptChest([request.x, request.y, request.z], chestFacing, request.items);
      } else if (!existing) chests.adoptChest([request.x, request.y, request.z], chestFacing, items);
    } else if (def?.stair) {
      this.structureOrientations.set(key, { ...request, dir: index, isTop: request.half === 'top' });
      return true;
    } else {
      return true;
    }
    this.structureOrientations.set(key, { ...request, dir: index });
    return true;
  }

  /** The orientations to write into a save: plain data, enough to apply each one again on load. */
  /** The trial spawners structures placed: `[{ x, y, z, mob, kind }]`. */
  trialSpawners() {
    return this.#orientationList('trialSpawners', (o) => o.trialSpawner ? { x: o.x, y: o.y, z: o.z, mob: o.trialSpawner.mob, kind: o.trialSpawner.kind ?? 'normal' } : null);
  }

  /**
   * The entries `pick` keeps from the orientation map, rebuilt only when the map has changed (OrientationMap).
   * A plain Map, which tests and older saves may still hand in, is walked every time as before.
   */
  #orientationList(name, pick) {
    const map = this.structureOrientations;
    const cached = (this.orientationLists ??= {})[name];
    if (map instanceof OrientationMap && cached?.map === map && cached.version === map.version) return cached.list.slice();
    const list = [];
    for (const o of map.values()) { const entry = pick(o); if (entry) list.push(entry); }
    if (map instanceof OrientationMap) this.orientationLists[name] = { map, version: map.version, list };
    return list.slice();
  }

  /** A vault's data (ominous or not), if a structure placed one here. */
  vaultAt(x, y, z) {
    return this.structureOrientations.get(`${x},${y},${z}`)?.vault ?? null;
  }

  /** The monster spawners structures placed: `[{ x, y, z, mob }]`. */
  spawners() {
    return this.#orientationList('spawners', (o) => o.spawner ? { x: o.x, y: o.y, z: o.z, mob: o.spawner } : null);
  }

  serializeOrientations(orientations=this.structureOrientations) {
    return [...orientations.values()].map((o) => ({
      x: o.x, y: o.y, z: o.z, id: o.id, name: o.name, facing: o.facing, half: o.half, hinge: o.hinge, lootTable: o.lootTable, slabType: o.slabType ?? null,
      ...(o.signText ? { signText: o.signText } : {}), ...(o.rotation !== undefined ? { rotation: o.rotation } : {}),
      ...(o.spawner ? { spawner: o.spawner } : {}), ...(o.trialSpawner ? { trialSpawner: o.trialSpawner } : {}), ...(o.vault ? { vault: o.vault } : {})
      ,...(o.plantAge!==undefined?{plantAge:o.plantAge}:{}),...(o.anchorCharges!==undefined?{anchorCharges:o.anchorCharges,anchorDimension:o.anchorDimension}:{})
      ,...(o.berries!==undefined?{berries:o.berries}:{}),...(o.verticalDirection?{verticalDirection:o.verticalDirection,thickness:o.thickness}:{})
    }));
  }

  /** Apply saved orientations. A chest keeps the contents it was saved with, so its loot is not rolled again. */
  restoreOrientations(list) {
    for (const o of Array.isArray(list) ? list : []) {
      if (this.getVoxel(o.x, o.y, o.z) !== o.id) continue; // the block was changed since: nothing to restore
      this.applyStructureOrientation({ ...o, lootTable: o.id === BLOCKS.CHEST ? null : o.lootTable });
    }
  }

  reseed(seed = 4289, selectedBiome = this.selectedBiome) {
    this.endState=null;
    this.structureOrientations = new OrientationMap();
    this.seed = seed;
    this.selectedBiome = selectedBiome || 'all';
    this.noise = new FastNoise(seed);
    this.caveNoise = new FastNoise(seed + 101);
    this.biomeNoise = new FastNoise(seed + 202);
    this.detailNoise = new FastNoise(seed + 303);
    this.featureNoise = new FastNoise(seed + 404);
    this.caves = new CaveTerrain(this);
    /**
     * Structure generation for this seed.
     *
     * Built here rather than in the constructor because a RESEED must forget every plan: structures are a
     * pure function of the seed, so keeping the old engine would place the previous seed's structures in the
     * new world. The chunk sizes are passed in rather than imported by that module, which would make the two
     * files circular.
     *
     * Before this existed, a generated world contained exactly one structure -- the starting village in the
     * spawn chunk -- and none of the thirty structures in `src/worldgen/` ever appeared in game.
     */
    this.rebuildStructures();
    this.chunks.clear();
    this.genColumns = null; // the terrain columns structures asked about belong to the old seed
    // The Map is now empty, so any cached slot would answer for a chunk that no longer exists.
    this.invalidateChunkCache();
    // Light is stored per chunk, so every engine must forget its chunks too -- otherwise a reseed
    // would keep lighting a world that no longer exists at those coordinates.
    for (const engine of Object.values(this.lightByDimension)) engine.clear();
    // A new seed is a new sequence of spawn decisions.
    if (this.spawnRandom?.setSeed) this.spawnRandom.setSeed(seed ^ 0x5EED5EED);

    const def = getBiomeDef(this.selectedBiome);
    if (def?.isNether || def?.dimension === 'nether' || this.selectedBiome === 'nether') {
      this.dimension = 'nether';
      this.currentDimension = 'nether';
      this.isNether = true;
      this.seaLevel = 14;
      this.dimensionChunks = { overworld: new Map(), nether: this.chunks };
    } else if (def?.isEnd || def?.dimension === 'end') {
      this.dimension = 'the_end';
      this.currentDimension = 'the_end';
      this.isNether = false;
      this.seaLevel = 0;
      this.dimensionChunks = { overworld: new Map(), the_end: this.chunks };
    } else {
      this.dimension = 'overworld';
      this.currentDimension = 'overworld';
      this.isNether = false;
      this.seaLevel = def?.seaLevel !== undefined ? def.seaLevel : 22;
      this.dimensionChunks = { overworld: this.chunks, nether: new Map() };
    }
    this.dimensionOrientations={[this.dimension]:this.structureOrientations};
  }

  switchDimension(newDim) {
    if (this.dimension === newDim) return;
    this.dimensionChunks[this.dimension] = this.chunks;
    this.dimensionOrientations??={};
    this.dimensionOrientations[this.dimension]=this.structureOrientations;
    this.dimension = newDim;
    if (!this.dimensionChunks[newDim]) {
      this.dimensionChunks[newDim] = new Map();
    }
    this.chunks = this.dimensionChunks[newDim];
    this.structureOrientations=this.dimensionOrientations[newDim]??=new OrientationMap();
    // `this.chunks` now points at a different Map. A slot cached from the previous dimension
    // would answer with a chunk from the wrong world, so the cache must be dropped.
    this.invalidateChunkCache();
    this.currentDimension = newDim;
    this.isNether = (newDim === 'nether');
    if (newDim === 'nether') {
      this.seaLevel = 14;
    } else {
      const def = getBiomeDef(this.selectedBiome);
      this.seaLevel = newDim === 'the_end' ? 0 : (!def.isEnd&&!def.isNether&&def.seaLevel!==undefined?def.seaLevel:22);
    }
  }

  chunkKey(cx, cz) {
    return `${cx},${cz}`;
  }

  /** Hash a chunk coordinate to a slot. Only speed depends on this, never correctness. */
  chunkSlot(cx, cz) {
    return ((cx + CHUNK_HASH_OFFSET) * 31 + (cz + CHUNK_HASH_OFFSET)) & CHUNK_CACHE_MASK;
  }

  /**
   * Reset the lookup cache. Anything that clears or replaces `this.chunks` must call this, or a
   * stale slot would answer for a chunk that no longer exists in the current dimension.
   */
  invalidateChunkCache() {
    const cache = this.chunkCache;
    if (cache) cache.fill(null);
  }

  getChunk(cx, cz) {
    const slot = ((cx + CHUNK_HASH_OFFSET) * 31 + (cz + CHUNK_HASH_OFFSET)) & CHUNK_CACHE_MASK;
    const cached = this.chunkCache[slot];
    if (cached !== null && cached.cx === cx && cached.cz === cz) {
      this.chunkCacheHits++;
      return cached;
    }
    this.chunkCacheMisses++;
    const chunk = this.chunks.get(`${cx},${cz}`);
    // Only cache a real chunk; a miss must not be cached, because the chunk may be generated
    // moments later and a negative entry would then hide it.
    if (chunk !== undefined) this.chunkCache[slot] = chunk;
    return chunk;
  }

  getOrCreateChunk(cx, cz) {
    const cached = this.getChunk(cx, cz);
    if (cached) return cached;

    const chunk = new Chunk(cx, cz);
    // Register before generating: terrain placement can touch neighbouring chunks (trees at a
    // border, cross-chunk structures) and those lookups must find this chunk, not recurse into
    // creating another copy of it.
    this.chunks.set(`${cx},${cz}`, chunk);
    this.chunkCache[((cx + CHUNK_HASH_OFFSET) * 31 + (cz + CHUNK_HASH_OFFSET)) & CHUNK_CACHE_MASK] = chunk;
    if (this.generationMode !== 'authored') {
      this.generatingChunks = (this.generatingChunks || 0) + 1;
      try {
        // A terrain worker being checked asks for a record of a few chunks generated here (terrainWorkerClient.js).
        const probe = this.generationProbe?.accept?.(this, cx, cz) ? this.generationProbe : null;
        if (probe) {
          const appliedBefore = this.structures?.appliedKeysFor?.(cx, cz) ?? [];
          const realizedBefore = this.structures?.realizedKeysFor?.(cx, cz) ?? [];
          const record = this.#generateRecorded(chunk, new GenerationRecorder());
          probe.add({ ...record, cx, cz, appliedBefore, realizedBefore, voxels: chunk.voxels.slice(), waterLevels: chunk.waterLevels.slice(), weatherRevision: chunk.weatherRevision ?? 0 });
        } else {
          this.generateChunkTerrain(chunk);
        }
      } finally { this.generatingChunks--; }
    }
    this.#finishNewChunk(chunk);
    return chunk;
  }

  /**
   * Generate a chunk without keeping it, and say everything the generation did: what a terrain worker runs.
   *
   * The chunk is registered while it generates, as `getOrCreateChunk` does, and dropped afterwards; generation reads
   * no other chunk, so this world never needs to hold more than the one. `appliedKeys` are the structure starts
   * the game holds written into this chunk now, and `realizedKeys` the ones it has ever written there, so this copy
   * of the engine skips, and re-writes without mobs, exactly the ones the game's own would.
   *
   * @returns {{cx, cz, voxels: Uint16Array, waterLevels: Uint8Array, weatherRevision: number, ops: Array,
   *   loot: Array, appliedKeys: string[], stats: object}}
   */
  generateDetached(cx, cz, appliedKeys = [], realizedKeys = []) {
    // This copy's own memory of the chunk is replaced by the game's: the game may have unloaded it since.
    this.structures?.forgetChunk?.(cx, cz);
    this.structures?.markApplied?.(appliedKeys);
    this.structures?.markRealized?.(realizedKeys);
    const key = `${cx},${cz}`;
    const chunk = new Chunk(cx, cz);
    this.chunks.set(key, chunk);
    this.chunkCache[((cx + CHUNK_HASH_OFFSET) * 31 + (cz + CHUNK_HASH_OFFSET)) & CHUNK_CACHE_MASK] = chunk;
    this.generatingChunks = (this.generatingChunks || 0) + 1;
    try {
      const record = this.#generateRecorded(chunk, new GenerationRecorder({ capture: true }));
      return { ...record, cx, cz, voxels: chunk.voxels, waterLevels: chunk.waterLevels, weatherRevision: chunk.weatherRevision ?? 0, waterAtRest: !!chunk.waterAtRest };
    } finally {
      this.generatingChunks--;
      this.chunks.delete(key);
      this.invalidateChunkCache();
    }
  }

  /**
   * Put a chunk a terrain worker generated into the world, as if `getOrCreateChunk` had generated it here.
   *
   * The voxels are copied in, then the worker's record is replayed in order: orientation map writes, and the
   * structures' orientation and spawn requests through the engine's own dispatch (so a door, chest or villager
   * reaches the same manager by the same path, and waits to be retried in the same way when that manager is not
   * up). The rest -- water, light, the creature population pass -- is the same tail every new chunk gets.
   *
   * @returns {Chunk|null} the chunk, or null when the world already has one there (generated here meanwhile)
   */
  adoptGeneratedChunk(result) {
    const { cx, cz } = result;
    if (this.chunks.get(`${cx},${cz}`)) return null;
    const chunk = new Chunk(cx, cz);
    chunk.voxels.set(result.voxels);
    chunk.waterLevels.set(result.waterLevels);
    if (result.weatherRevision) chunk.weatherRevision = result.weatherRevision;
    chunk.waterAtRest = !!result.waterAtRest;
    this.chunks.set(`${cx},${cz}`, chunk);
    this.chunkCache[((cx + CHUNK_HASH_OFFSET) * 31 + (cz + CHUNK_HASH_OFFSET)) & CHUNK_CACHE_MASK] = chunk;
    this.generatingChunks = (this.generatingChunks || 0) + 1;
    try {
      const structures = this.structures;
      structures?.adoptGenerated?.(result);
      for (const op of result.ops ?? []) {
        if (op[0] === 'set') this.structureOrientations.set(op[1], op[2]);
        else if (op[0] === 'delete') this.structureOrientations.delete(op[1]);
        else structures?.replayRequest?.(op[0], op[1]);
      }
    } finally { this.generatingChunks--; }
    this.#finishNewChunk(chunk);
    return chunk;
  }

  /** Generate a chunk's terrain with a recorder listening, and collect what it did besides its voxels. */
  #generateRecorded(chunk, recorder) {
    const structures = this.structures;
    const lootBefore = structures?.loot?.length ?? 0;
    const statsBefore = structures?.stats ? { ...structures.stats } : {};
    const appliedBefore = new Set(structures?.appliedKeysFor?.(chunk.cx, chunk.cz) ?? []);
    const map = this.structureOrientations;
    this.generationRecorder = recorder;
    if (map instanceof OrientationMap) map.recorder = recorder;
    try {
      this.generateChunkTerrain(chunk);
    } finally {
      this.generationRecorder = null;
      if (map instanceof OrientationMap) map.recorder = null;
    }
    const stats = {};
    for (const name of GENERATION_COUNTS) stats[name] = (structures?.stats?.[name] ?? 0) - (statsBefore[name] ?? 0);
    return {
      ops: recorder.ops,
      loot: recorder.copy(structures?.loot?.slice(lootBefore) ?? []),
      appliedKeys: (structures?.appliedKeysFor?.(chunk.cx, chunk.cz) ?? []).filter((key) => !appliedBefore.has(key)),
      stats,
      // Something could not be copied: a worker must not be trusted with this record, nor a check pass on it.
      unrecordable: recorder.unrecordable,
    };
  }

  /** What every new chunk gets once its voxels are in: water, light, and the creature population pass. */
  /**
   * Run a new chunk's water to rest before the chunk is drawn, flowing into and out of the chunks already loaded.
   *
   * The generator settles each chunk's water by itself (worldgen/settleWater.js), but a chunk cannot see its
   * neighbours: an ocean over a cave that runs on under the next chunk, a lake beside a neighbour's ravine. That
   * water used to move after the world appeared -- thousands of changes in its first half minute, each re-meshing a
   * chunk and waking the sand above it. It is moved here instead, while the chunk still waits for its neighbours
   * before it is meshed. It wakes no sand and drops no washed-away plants, and a cascade too long for one arrival is
   * left to the ordinary simulation. It counts as generation: a neighbour it flows into is not marked modified,
   * since the same flow is made again when that neighbour is generated again beside this chunk.
   */
  #settleNewWater(chunk) {
    const water = this.newWater;
    if (!water || this.floorY > 0) return false;
    // Its inside is at rest already (generateChunkTerrain); what can move is at its edges, now that it has neighbours.
    water.wakeChunk(chunk, { edgesOnly: true });
    this.settlingNewWater = true;
    this.generatingChunks = (this.generatingChunks || 0) + 1;
    try {
      for (let cells = 0; water.pending.size && cells < SETTLE_CELLS;) {
        const budget = SETTLE_CELLS - cells;
        cells += Math.min(budget, water.pending.size);
        water.tick(budget);
      }
    } finally {
      this.settlingNewWater = false;
      this.generatingChunks--;
      for (const key of water.pending) this.water.pending.add(key);
      water.pending.clear();
    }
    return true;
  }

  #finishNewChunk(chunk) {
    const { cx, cz } = chunk;
    // Settled terrain's water is at rest, inside (the generator) and at its edges (#settleNewWater): nothing to wake.
    const settled = this.#settleNewWater(chunk) && chunk.waterAtRest;
    this.water.initChunk(chunk, { wake: !settled });
    // Allocate lighting; initChunk queues propagation and its arrays initially contain zeroes.
    this.light.initChunk(cx, cz);
    // Chunk-generation creature population.
    //
    // Deliberately here rather than in the streamer: chunks are also created by the world start, by
    // `placePlayerOnSurface`'s padding ring, and by the structure and studio paths, and a page of
    // terrain that skipped population would be a visible hole in the animal distribution. The
    // generator is idempotent per chunk, so a chunk created twice is still populated once.
    const generationSpawner = this.game?.spawnManager?.chunkGenerationSpawner;
    if (this.generationMode !== 'authored' && generationSpawner?.onChunkGenerated) {
      // Population is a one-shot pass. Waiting for the frame's budgeted light update would make
      // every animal see light 0 here, fail its predicate, and never get another generation attempt.
      this.light.relightChunk(cx, cz);
      generationSpawner.onChunkGenerated(cx, cz);
    }
  }

  /**
   * Light level at a world position, as mob spawn predicates and several mob behaviours ask for it.
   *
   * This accessor is what `world.getLightLevel?.() ?? 15` used to be missing: callers now get a
   * real propagated value instead of a literal fallback. Kept on the World rather than requiring
   * every caller to know about `world.light`, because `getLightLevel` is the name the existing
   * mob code already probes for.
   *
   * @param {number} wx
   * @param {number} wy
   * @param {number} wz
   * @param {number} [skyDarken] day/night reduction applied to sky light only
   */
  getLightLevel(wx, wy, wz, skyDarken) {
    return this.light.getLightLevel(Math.floor(wx), Math.floor(wy), Math.floor(wz), skyDarken);
  }

  /** Raw sky light (0..15) at a world position, before any day/night reduction. */
  getSkyLight(wx, wy, wz) {
    return this.light.getSkyLight(Math.floor(wx), Math.floor(wy), Math.floor(wz));
  }

  /** Raw block light (0..15) at a world position. */
  getBlockLight(wx, wy, wz) {
    return this.light.getBlockLight(Math.floor(wx), Math.floor(wy), Math.floor(wz));
  }

  getBiome(wx, wz) {
    // /fillbiome (advancedCommands.js) writes column overrides.
    const override = this.biomeOverrides?.get(`${Math.floor(wx)},${Math.floor(wz)}`);
    if (override) return override;
    if (this.dimension === 'the_end' || this.currentDimension === 'the_end') return endColumn(this,wx,wz).biome;
    const isNetherDim = this.dimension === 'nether' || this.currentDimension === 'nether' || this.isNether;
    if (isNetherDim) {
      if (this.selectedBiome && this.selectedBiome !== 'all' && this.selectedBiome !== 'nether' && getBiomeDef(this.selectedBiome)?.isNether) {
        return this.selectedBiome;
      }
      const netherNoise = this.biomeNoise.noise2D(wx * 0.005, wz * 0.005);
      const detail = this.detailNoise.noise2D(wx * 0.005 + 200, wz * 0.005 + 200);
      if (netherNoise < -0.3) return 'soul_sand_valley';
      if (netherNoise < 0.0) return 'crimson_forest';
      if (netherNoise < 0.3) return 'warped_forest';
      if (detail > 0.25) return 'basalt_deltas';
      return 'nether_wastes';
    }

    // If user selected a specific biome, every chunk faithfully generates that biome
    if (this.selectedBiome && this.selectedBiome !== 'all' && !getBiomeDef(this.selectedBiome)?.isEnd && !getBiomeDef(this.selectedBiome)?.isNether) {
      return this.selectedBiome;
    }

    // Dynamic Multi-Biome Overworld generator
    const temp = this.biomeNoise.noise2D(wx * 0.003, wz * 0.003);
    const humid = this.detailNoise.noise2D(wx * 0.003 + 500, wz * 0.003 + 500);
    const elev = this.noise.noise2D(wx * 0.0035 + 1000, wz * 0.0035 + 1000);

    if (elev > 0.45) {
      if (temp < -0.2) return 'frozen_peaks';
      if (temp < 0.1) return 'jagged_peaks';
      if (humid > 0.2) return 'cherry_grove';
      if (humid > -0.1) return 'meadow';
      return 'stony_peaks';
    }

    // Cold mountain foothills transition through slopes and spruce groves,
    // rather than jumping directly from an icy summit into ordinary plains.
    if (elev > 0.25 && temp < -0.08) {
      return elev > 0.34 ? 'snowy_slopes' : 'grove';
    }

    if (elev < -0.38) {
      if (temp < -0.25) return 'frozen_ocean';
      if (temp > 0.35) return 'warm_ocean';
      if (temp > 0.15) return 'lukewarm_ocean';
      if (humid < -0.25 && Math.abs(elev) > 0.5) return 'mushroom_fields';
      return 'ocean';
    }

    if (temp < -0.3) return 'snowy_plains';
    if (temp < -0.15) return 'taiga';

    if (temp > 0.35) {
      if (humid < -0.2) return 'badlands';
      if (humid < 0.1) return 'desert';
      if (humid < 0.3) return 'savanna';
      return 'jungle';
    }

    if (humid > 0.35) return 'swamp';
    if (humid > 0.15) return 'dark_forest';
    if (humid > 0.0) return 'forest';
    if (humid > -0.15) return 'flower_forest';
    return 'plains';
  }

  /**
   * The y of the terrain surface column at a world position, clamped exactly as generation clamps it.
   *
   * Both the terrain pass and the tree pass must agree on this or trees land at the wrong height.
   * They did not: terrain clamps to `CHUNK_HEIGHT - 6`, while tree placement used the raw height, so
   * near the ceiling a trunk started above the ground and floated.
   */
  /**
   * Whether terrain generation leaves a solid block at a point (Overworld): below the surface and not carved by a
   * cave. Pure noise, like `surfaceHeightAt`, so a structure can test the ground it will stand in (a monster room
   * needs solid floor and ceiling and a cave beside it) without generating a chunk.
   */
  solidAtGen(wx, wy, wz) {
    if(this.isFlatWorld)return wy>=0&&wy<=4;
    if(this.dimension==='the_end'){const c=endColumn(this,wx,wz);return c.top>0&&wy>=c.bottom&&wy<=c.top;}
    if(this.dimension==='nether'){
      if(wy<0||wy>63)return false;if(wy===0||wy===63)return true;
      const h=this.surfaceHeightAt(wx,wz),floor=Math.min(36,Math.max(8,h)),c=this.caves.column(wx,wz);
      if(wy<=floor)return wy<2||!this.caves.kindAt(wx,wy,wz,c);
      if(wy>=54)return wy>=62||this.caveNoise.noise3D(wx*.06,wy*.12,wz*.06)<=.52;
      return false;
    }
    if (wy <= 0) return true;
    // The column's biome and height, kept for the last few thousand columns: a structure asks about many blocks of
    // the same few columns.
    this.genColumns ??= new Map();
    // A numeric key, as in plansAt: this runs for every block a planned structure tests.
    const ck = (wx + 33554432) * 67108864 + (wz + 33554432);
    let column = this.genColumns.get(ck);
    if (!column) {
      const bId = this.getBiome(wx, wz);
      column = { biome: bId, height: this.surfaceHeightAt(wx, wz, bId) };
      if (this.genColumns.size > 4096) this.genColumns.clear();
      this.genColumns.set(ck, column);
    }
    const { biome, height } = column;
    if (wy > height) return false;
    return this.caves.cellAt(wx,wy,wz,this.caves.column(wx,wz,height,biome))===null;
  }

  /** Index the Nether portal blocks of every chunk held (after a load: setVoxel indexes the rest). */
  rescanPortals() {
    this.portalBlocks = {};
    const maps = { ...(this.dimensionChunks ?? {}), [this.dimension || 'overworld']: this.chunks };
    for (const [dim, chunks] of Object.entries(maps)) {
      const set = (this.portalBlocks[dim] ??= new Set());
      for (const c of chunks?.values?.() ?? []) {
        const v = c.voxels; if (!v) continue;
        for (let i = 0; i < v.length; i++) if (v[i] === BLOCKS.NETHER_PORTAL) set.add(`${c.cx * 16 + (i & 15)},${i >> 8},${c.cz * 16 + ((i >> 4) & 15)}`);
      }
    }
  }

  /** Underground biomes are three-dimensional; surface weather still uses getBiome. */
  getBiomeAt(wx,wy,wz){return this.caves.biomeAt(Math.floor(wx),Math.floor(wy),Math.floor(wz));}

  surfaceHeightAt(wx, wz, biomeId = this.getBiome(wx, wz)) {
    if (this.dimension === 'the_end' || getBiomeDef(biomeId)?.isEnd) return endColumn(this,wx,wz).top;
    return Math.min(CHUNK_HEIGHT - 6, Math.max(4, this.getHeight(wx, wz, biomeId)));
  }

  getHeight(wx, wz, biomeId) {
    if (this.dimension === 'the_end' || getBiomeDef(biomeId)?.isEnd) return endColumn(this,wx,wz).top;
    const def = getBiomeDef(biomeId);
    if(def.mountainProfile)return mountainHeight(this,wx,wz,def.mountainProfile);
    const base = this.noise.noise2D(wx * 0.012, wz * 0.012);
    const detail = this.detailNoise.noise2D(wx * 0.04, wz * 0.04) * 0.35;

    if (def.isNether) {
      // Nether terrain: vast cavern floor with valleys dipping into the lava sea and towering crags
      const valley = this.noise.noise2D(wx * 0.015, wz * 0.015);
      const crags = Math.pow(Math.abs(this.detailNoise.noise2D(wx * 0.035, wz * 0.035)), 1.4) * 8;
      const floor = (def.baseHeight || 16) - 2 + valley * 9 + detail * 3 + crags * 0.4;
      return Math.floor(Math.max(8, Math.min(34, floor)));
    }

    if (def.isEnd) {
      // Floating island height
      const distFromOrigin = Math.hypot(wx, wz);
      // The main island, as the End's chunk generator shapes it (so the exit podium sits on its top block).
      if (distFromOrigin < 55) {
        return Math.floor(28 + Math.cos(distFromOrigin * 0.05) * 4);
      }
      const islandNoise = this.noise.noise2D(wx * 0.015, wz * 0.015);
      return Math.floor(26 + islandNoise * 8 + detail * 3);
    }

    if (def.isVoid) {
      return 30;
    }

    if (def.isCavern) {
      // A cave preset has terrain above its cavern, not a moss/sculk plain open
      // to the sky. The interior floor/ceiling come from CaveTerrain.
      return Math.floor(49 + base * 5 + detail * 2);
    }

    if (def.isJagged) {
      const peak = Math.pow(Math.abs(this.noise.noise2D(wx * 0.018, wz * 0.018)), 1.6);
      return Math.floor(def.baseHeight + peak * 26 + base * 8 + detail * 5);
    }

    if (def.isPlateau) {
      const mesa = Math.min(8, Math.max(-2, base * 12));
      return Math.floor(def.baseHeight + mesa + detail * 2);
    }

    if (def.isWindswept) {
      return Math.floor(def.baseHeight + base * 14 + detail * 8);
    }

    if (def.category === 'offshore') {
      return Math.floor(def.baseHeight + base * 4 + detail * 2);
    }

    if (def.category === 'highland') {
      return Math.floor(def.baseHeight + base * 8 + detail * 4);
    }

    return Math.floor((def.baseHeight || 25) + base * (def.heightScale || 5) + detail * 3);
  }

  /**
   * A chunk's terrain, with its water already at rest (worldgen/settleWater.js). A barrier floor rewrites the cells
   * below it in every world lookup, which the chunk-only settling cannot see, so such worlds leave it to run time.
   */
  generateChunkTerrain(chunk) {
    this.#generateTerrain(chunk);
    if (!(this.floorY > 0)) settleChunkWater(chunk, { orientations: this.structureOrientations });
  }

  #generateTerrain(chunk) {
    if (this.isFlatWorld) {
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
          chunk.setVoxel(lx, 0, lz, BLOCKS.BEDROCK);
          chunk.setVoxel(lx, 1, lz, BLOCKS.DIRT);
          chunk.setVoxel(lx, 2, lz, BLOCKS.DIRT);
          chunk.setVoxel(lx, 3, lz, BLOCKS.DIRT);
          chunk.setVoxel(lx, 4, lz, BLOCKS.GRASS);
        }
      }
      return;
    }

    const cx = chunk.cx;
    const cz = chunk.cz;

    // First sample chunk center to get representative biome
    const centerBiomeId = this.getBiome(cx * CHUNK_SIZE_X + 8, cz * CHUNK_SIZE_Z + 8);
    const centerDef = getBiomeDef(centerBiomeId);

    // --- 1. SPECIAL DIMENSION: THE VOID ---
    if (centerDef.isVoid) {
      // The void start platform is a feature (src/worldgen/generators/voidPlatform.js), placed like any other.
      this.structures?.applyToChunk(chunk);
      return;
    }

    // --- 2. SPECIAL DIMENSION: THE END ---
    if (this.dimension === 'the_end' || centerDef.isEnd) {
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
        const column = endColumn(this, cx * CHUNK_SIZE_X + lx, cz * CHUNK_SIZE_Z + lz);
        if (!column.top) continue;
        for (let y = column.bottom; y <= column.top; y++) chunk.setVoxel(lx, y, lz, BLOCKS.END_STONE);
      }
      decorateEndChunk(this,chunk);
      this.structures?.applyToChunk(chunk);
      decorateEndReturnGateway(this,chunk);
      restoreEndGatewaysInChunk(this,chunk);
      return;
    }
    // --- 3. SPECIAL DIMENSION: THE NETHER ---
    if (centerDef.isNether || this.isNether || this.dimension === 'nether') {
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
          const wx = cx * CHUNK_SIZE_X + lx;
          const wz = cz * CHUNK_SIZE_Z + lz;
          const bId = this.getBiome(wx, wz);
          const def = getBiomeDef(bId);

          // Bedrock floor & ceiling
          chunk.setVoxel(lx, 0, lz, BLOCKS.BEDROCK);
          chunk.setVoxel(lx, CHUNK_HEIGHT - 1, lz, BLOCKS.BEDROCK);

          const floorHeight = Math.min(36, Math.max(8, this.getHeight(wx, wz, bId)));
          const ceilHeight = Math.max(floorHeight + 14, Math.min(CHUNK_HEIGHT - 2, 54));

          // Floor strata
          const isLavaCovered = floorHeight < this.seaLevel;
          for (let y = 1; y <= floorHeight; y++) {
            if (y === floorHeight) {
              if (isLavaCovered) {
                // Ocean bed under lava: Magma blocks, soul sand, gravel or netherrack
                const subHash = Math.abs(Math.sin(wx * 33.7 + wz * 47.1));
                if (subHash < 0.35) chunk.setVoxel(lx, y, lz, BLOCKS.MAGMA_BLOCK);
                else if (subHash < 0.55) chunk.setVoxel(lx, y, lz, BLOCKS.SOUL_SAND);
                else if (subHash < 0.70) chunk.setVoxel(lx, y, lz, BLOCKS.GRAVEL);
                else chunk.setVoxel(lx, y, lz, def.surfaceBlock || BLOCKS.NETHERRACK);
              } else if (floorHeight <= this.seaLevel + 1) {
                // Shorelines transition: Magma blocks and beaches along the lava sea
                const shoreHash = Math.abs(Math.sin(wx * 21.3 + wz * 19.7));
                if (shoreHash < 0.45) chunk.setVoxel(lx, y, lz, BLOCKS.MAGMA_BLOCK);
                else if (shoreHash < 0.70) chunk.setVoxel(lx, y, lz, BLOCKS.SOUL_SAND);
                else chunk.setVoxel(lx, y, lz, def.surfaceBlock || BLOCKS.NETHERRACK);
              } else {
                chunk.setVoxel(lx, y, lz, def.surfaceBlock || BLOCKS.NETHERRACK);
              }
            } else if (y > floorHeight - 3) {
              chunk.setVoxel(lx, y, lz, def.subsurfaceBlock || BLOCKS.NETHERRACK);
            } else {
              chunk.setVoxel(lx, y, lz, def.deepBlock || BLOCKS.NETHERRACK);
            }

            // Ore veins inside deep netherrack strata
            if (y > 2 && y < floorHeight - 1) {
              if(chunk.getVoxel(lx,y,lz)===BLOCKS.NETHERRACK)chunk.setVoxel(lx,y,lz,netherOreAt(this.seed,wx,y,wz));
            }
          }

          // Lava sea below seaLevel=14
          if (floorHeight < this.seaLevel) {
            for (let y = floorHeight + 1; y <= this.seaLevel; y++) {
              chunk.setVoxel(lx, y, lz, BLOCKS.LAVA);
            }
          }

          // Ceiling lava falls descending into the cavern
          const lavaFallHash = Math.abs(Math.sin((wx + 73.1) * 12.7 + (wz + 41.9) * 37.9));
          if (lavaFallHash < 0.012 && ceilHeight > floorHeight + 6) {
            const bottomY = Math.max(floorHeight + 1, this.seaLevel);
            for (let y = ceilHeight; y >= bottomY; y--) {
              chunk.setVoxel(lx, y, lz, BLOCKS.LAVA);
            }
          }

          // Nether ceiling
          for (let y = ceilHeight; y < CHUNK_HEIGHT - 1; y++) {
            chunk.setVoxel(lx, y, lz, netherOreAt(this.seed,wx,y,wz));
          }

          // Ceiling Glowstone clusters
          if (Math.abs(Math.sin(wx * 28.1 + wz * 19.3)) < 0.035) {
            for (let dy = 0; dy <= 3; dy++) {
              chunk.setVoxel(lx, ceilHeight - dy, lz, BLOCKS.GLOWSTONE);
            }
          }

          // Floor features & flora
          if (floorHeight >= this.seaLevel && floorHeight < CHUNK_HEIGHT - 12) {
            const hash = Math.abs(Math.sin(wx * 54.12 + wz * 31.98));
            if (bId === 'nether_wastes' || bId === 'nether') {
              if (hash < 0.04) {
                chunk.setVoxel(lx, floorHeight + 1, lz, BLOCKS.FIRE);
              } else if (hash < 0.08) {
                chunk.setVoxel(lx, floorHeight, lz, BLOCKS.SOUL_SAND);
              } else if (hash < 0.12) {
                chunk.setVoxel(lx, floorHeight, lz, BLOCKS.GRAVEL);
              }
            } else if (bId === 'soul_sand_valley') {
              if (hash < 0.04) {
                chunk.setVoxel(lx, floorHeight + 1, lz, BLOCKS.SOUL_FIRE);
              } else if (hash < 0.065) {
                this.generateBoneFossil(chunk, lx, floorHeight + 1, lz);
              } else if (hash < 0.1) {
                this.generateBasaltPillar(chunk, lx, floorHeight + 1, lz);
              }
            } else if (bId === 'crimson_forest') {
              // Seeded fungi and understory are placed after all terrain columns.
            } else if (bId === 'warped_forest') {
              // Seeded fungi and understory are placed after all terrain columns.
            } else if (bId === 'basalt_deltas') {
              if (hash < 0.08) {
                this.generateBasaltPillar(chunk, lx, floorHeight + 1, lz);
              } else if (hash < 0.16) {
                chunk.setVoxel(lx, floorHeight, lz, BLOCKS.MAGMA_BLOCK);
              }
            }
          }
        }
      }
      carveNetherCaves(this,chunk);
      decorateNetherChunk(this,chunk);
      // Nether structures (fortresses, bastions, Nether fossils, ruined portals), clipped to this chunk.
      this.structures?.applyToChunk(chunk);
      return;
    }

    // --- 4. STANDARD & CAVE OVERWORLD GENERATION ---
    for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
        const wx = cx * CHUNK_SIZE_X + lx;
        const wz = cz * CHUNK_SIZE_Z + lz;

        const bId = this.getBiome(wx, wz);
        const def = getBiomeDef(bId);
        const height = this.surfaceHeightAt(wx, wz, bId);
        const mountain = mountainColumn(this,wx,wz,def,height);
        const caveColumn=this.caves.column(wx,wz,height,bId);

        // Bedrock layer
        chunk.setVoxel(lx, 0, lz, BLOCKS.BEDROCK);

        // Stone & underground strata
        for (let y = 1; y <= height; y++) {
          const caveBlock=this.caves.cellAt(wx,y,wz,caveColumn);
          if(caveBlock!==null){if(caveBlock!==BLOCKS.AIR)chunk.setVoxel(lx,y,lz,caveBlock);continue;}

          const mountainBlock=mountain?.blockAt(y);
          if(mountainBlock!==null && mountainBlock!==undefined){
            chunk.setVoxel(lx,y,lz,mountainBlock);
          } else if (y === height) {
            // Surface block
            let surf = def.isCavern?BLOCKS.GRASS:(def.surfaceBlock || BLOCKS.GRASS);
            if (height <= this.seaLevel + 1 && def.category === 'offshore') surf = BLOCKS.SAND;
            chunk.setVoxel(lx, y, lz, surf);
          } else if (y > height - 4) {
            // Subsurface layer
            if (def.hasTerracottaBands) {
              const band = (y + Math.floor(Math.sin(wx * 0.1) * 2)) % 12;
              if (band < 2) chunk.setVoxel(lx, y, lz, BLOCKS.RED_TERRACOTTA);
              else if (band < 4) chunk.setVoxel(lx, y, lz, BLOCKS.ORANGE_TERRACOTTA);
              else if (band < 6) chunk.setVoxel(lx, y, lz, BLOCKS.YELLOW_TERRACOTTA);
              else if (band < 8) chunk.setVoxel(lx, y, lz, BLOCKS.WHITE_TERRACOTTA);
              else chunk.setVoxel(lx, y, lz, BLOCKS.TERRACOTTA);
            } else {
              chunk.setVoxel(lx, y, lz, def.isCavern?BLOCKS.DIRT:(def.subsurfaceBlock || BLOCKS.DIRT));
            }
          } else {
            // Deep underground stone / ores
            let block = y<9?BLOCKS.DEEPSLATE:(def.deepBlock || BLOCKS.STONE);
            const oreHash = Math.sin(wx * 12.9898 + y * 78.233 + wz * 43.1415) * 43758.5453;
            const oreVal = oreHash - Math.floor(oreHash);

            if (y < 14 && oreVal < 0.015) block = BLOCKS.DIAMOND_ORE;
            else if (y < 18 && oreVal < 0.025) block = BLOCKS.REDSTONE_ORE;
            else if (y < 28 && oreVal < 0.035) block = BLOCKS.GOLD_ORE;
            else if (y < 45 && oreVal < 0.065) block = BLOCKS.IRON_ORE;
            else if (oreVal < 0.1) block = BLOCKS.COAL_ORE;

            chunk.setVoxel(lx, y, lz, block);
          }
        }

        if(mountain?.layer&&chunk.getVoxel(lx,height,lz)!==BLOCKS.AIR)chunk.setVoxel(lx,height+1,lz,BLOCKS.SNOW_LAYER);

        // Water in oceans / rivers below seaLevel
        if (height < this.seaLevel) {
          const fluid = def.waterBlock || BLOCKS.WATER;
          for (let y = height + 1; y <= this.seaLevel; y++) {
            if (y === this.seaLevel && def.hasIceSheet) {
              chunk.setVoxel(lx, y, lz, BLOCKS.ICE);
            } else {
              chunk.setVoxel(lx, y, lz, fluid);
            }
          }

          // Underwater flora (seagrass, kelp, sea pickles) on ocean/river floor
          this.decorateOceanFloorColumn(chunk, lx, height, lz, wx, wz, bId, def);
        }

        // Surface flora and decorations
        if (height >= this.seaLevel && height < CHUNK_HEIGHT - 10 && chunk.getVoxel(lx,height,lz)!==BLOCKS.AIR) {
          const plantHash = Math.abs(Math.sin(wx * 54.123 + wz * 31.987));
          if (def.floraType === 'sunflowers' && plantHash < 0.3) {
            chunk.setVoxel(lx, height + 1, lz, BLOCKS.SUNFLOWER);
          } else if (def.floraType === 'cherry_petals' && plantHash < 0.25) {
            chunk.setVoxel(lx, height + 1, lz, BLOCKS.POPPY);
          } else if (def.floraType === 'wildflowers' || def.floraType === 'dense_flowers') {
            if (plantHash < 0.12) chunk.setVoxel(lx, height + 1, lz, BLOCKS.POPPY);
            else if (plantHash < 0.24) chunk.setVoxel(lx, height + 1, lz, BLOCKS.DANDELION);
          } else if (def.floraType === 'cactus' && plantHash < 0.02) {
            chunk.setVoxel(lx, height + 1, lz, BLOCKS.CACTUS);
            chunk.setVoxel(lx, height + 2, lz, BLOCKS.CACTUS);
          } else if (def.floraType === 'lily_pads' && height <= this.seaLevel + 1 && plantHash < 0.15) {
            chunk.setVoxel(lx, height + 1, lz, BLOCKS.LILY_PAD);
          } else if (bId === 'plains') {
            if (plantHash < 0.02) chunk.setVoxel(lx, height + 1, lz, BLOCKS.POPPY);
            else if (plantHash < 0.04) chunk.setVoxel(lx, height + 1, lz, BLOCKS.DANDELION);
          }
        }
      }
    }

    decorateCaves(this,chunk);
    // --- 5. BIOME TREES & GIANT VEGETATION ---
    this.plantTreesForChunk(chunk, cx, cz);
    plantFireflyBushes(this,chunk);

    // --- 5.5 CORAL REEFS IN WARM OCEANS ---
    this.generateCoralReefsForChunk(chunk, cx, cz);

    // --- 6. VILLAGE GENERATION IN CHUNK (0, 0) ---
    // Civilised Overworld biomes get a starting village
    const allowsVillage = centerDef.dimension === 'overworld' &&
      !centerDef.isCavern &&
      !centerDef.isVoid &&
      centerDef.category !== 'offshore';

    if (cx === 0 && cz === 0 && allowsVillage) {
      this.generateVillage(chunk);
    }

    // --- 7. STRUCTURES ---
    // Every enabled structure whose box OVERLAPS this chunk, realized CLIPPED to it. Each chunk writes only
    // its own voxels, so a structure is complete whichever order chunks are generated in and generating a
    // chunk never has to generate a neighbour. See src/worldStructures.js.
    this.structures?.applyToChunk(chunk);
  }

  /**
   * Place trees for one chunk from a GLOBAL grid, so canopies cross chunk borders.
   *
   * What this replaces, and why it mattered. Trees used to be placed on a per-chunk grid:
   *
   *     for (let lx = 3; lx < CHUNK_SIZE_X - 3; lx += 4)
   *
   * which had two visible defects. Every tree sat on a multiple of 4 measured from the chunk's own
   * corner, so the same pattern repeated in every chunk and read as a grid rather than as a forest.
   * And because leaves are only written where `x` and `z` land inside the chunk, a tree near an edge
   * was clipped, so the code simply refused to place one there at all -- leaving a bare 3-block
   * margin around every chunk.
   *
   * Now candidate trunks come from a global grid of spacing 4 in WORLD coordinates. Which cells
   * carry a tree, and exactly where inside the cell, both come from the cell's own coordinates, so
   * the forest has no chunk-periodic structure at all -- the previous placement put every trunk on
   * a local multiple of 4, which repeated identically in every chunk.
   *
   * Every chunk draws every tree whose canopy can reach it, clipped to itself, rather than only the
   * chunk holding the trunk. That is what keeps a canopy whole across a border, and it means no
   * chunk depends on another having been generated first -- which matters because chunks arrive in
   * whatever order the player walks. The cost is that a straddling tree is evaluated by two chunks,
   * which is a couple of extra hash lookups for the few trees near an edge.
   */
  plantTreesForChunk(chunk, cx, cz) {
    const SPACING = 4;
    // How far a canopy can reach from its trunk. OAK's radius is 2, and the mangrove root cage is 1,
    // so 2 covers every generator here.
    const CANOPY_REACH = 2;
    const baseX = cx * CHUNK_SIZE_X;
    const baseZ = cz * CHUNK_SIZE_Z;

    // Wider than the chunk by the canopy reach, so a trunk just outside can still drop leaves here.
    const firstGX = Math.floor((baseX - CANOPY_REACH) / SPACING);
    const lastGX = Math.floor((baseX + CHUNK_SIZE_X - 1 + CANOPY_REACH) / SPACING);
    const firstGZ = Math.floor((baseZ - CANOPY_REACH) / SPACING);
    const lastGZ = Math.floor((baseZ + CHUNK_SIZE_Z - 1 + CANOPY_REACH) / SPACING);

    // Pass 1: decide every tree. The decision depends ONLY on world coordinates and the seed -- the
    // grid cell, the biome, the terrain height -- and never on what is currently in the chunk. That
    // is what makes chunk generation order-independent, which it was not before: an earlier version
    // asked whether the ground under a trunk was solid, and since a neighbouring tree's canopy can
    // reach into the cell, the answer changed depending on which chunk had been generated first.
    const trees = [];
    const claimed = new Set();
    // Room for structures. Trees are planted before structures are written, so a tree whose canopy would reach a
    // planned structure piece is not planted at all: clearing it afterwards would leave half a tree floating beside
    // the wall. Structure plans are a pure function of the seed, so this keeps generation order-independent.
    const STRUCTURE_GAP = CANOPY_REACH + 1;
    const TREE_TALL = 14;
    const structureBoxes = this.structures?.pieceBoxesNear?.(cx, cz, CANOPY_REACH + STRUCTURE_GAP) ?? [];
    const crowdsStructure = (wx, wz, height) => structureBoxes.some((b) =>
      wx + STRUCTURE_GAP >= b.minX && wx - STRUCTURE_GAP <= b.maxX && wz + STRUCTURE_GAP >= b.minZ && wz - STRUCTURE_GAP <= b.maxZ
      && height + TREE_TALL >= b.minY && height < b.maxY + 1);
    for (let gx = firstGX; gx <= lastGX; gx++) {
      for (let gz = firstGZ; gz <= lastGZ; gz++) {
        const bId = this.getBiome(gx * SPACING, gz * SPACING);
        const def = getBiomeDef(bId);
        if (def.treeDensity <= 0 || def.treeType === 'none') continue;
        if (candidateAt(gx, gz, this.seed) >= def.treeDensity) continue;

        // Jitter inside the cell so trunks do not sit on a visible lattice.
        const wx = gx * SPACING + Math.floor(jitterOf(gx, gz, this.seed) * SPACING);
        const wz = gz * SPACING + Math.floor(jitterOf(gx + 8171, gz + 3313, this.seed) * SPACING);

        // The SAME clamped height the terrain pass uses. The raw getHeight was a real bug here:
        // terrain clamps to CHUNK_HEIGHT - 6, the tree did not, so on high ground a trunk began
        // above the surface and floated.
        const height = this.surfaceHeightAt(wx, wz, this.getBiome(wx, wz));
        if (height < this.seaLevel || height >= CHUNK_HEIGHT - 12) continue;
        if(!this.solidAtGen(wx,height,wz))continue;
        if(['dripstone_pillar','ice_stalactite'].includes(def.treeType))continue;
        if (structureBoxes.length && crowdsStructure(wx, wz, height)) continue;

        // Claim the trunk cell, so two trees cannot fight over it and a later canopy cannot bury an
        // earlier trunk. Deterministic because the claim order is the grid order.
        const key = `${wx},${wz}`;
        if (claimed.has(key)) continue;
        claimed.add(key);
        trees.push({ wx, wz, gx, gz, height, treeType: def.treeType });
      }
    }

    // Pass 2: trunks first, then canopies.
    //
    // Order matters within a chunk. Two trees four blocks apart have overlapping canopies, so if the
    // first tree's leaves were written before the second tree's trunk, the trunk would be buried and
    // the tree would look like it floats. Writing every trunk before any leaves removes that, and it
    // needs no information from outside this chunk.
    for (const tree of trees) {
      const writer = new ChunkVoxelWriter(chunk, treeSeed(tree.gx, tree.gz, this.seed), 'trunk');
      this.generateTree(writer, tree.wx - baseX, tree.height + 1, tree.wz - baseZ, tree.treeType);
    }
    for (const tree of trees) {
      const writer = new ChunkVoxelWriter(chunk, treeSeed(tree.gx, tree.gz, this.seed), 'canopy');
      this.generateTree(writer, tree.wx - baseX, tree.height + 1, tree.wz - baseZ, tree.treeType);
    }
  }

  generateTree(chunk, lx, baseY, lz, treeType = 'oak') {
    switch (treeType) {
      case 'cherry':
        this.generateCherryTree(chunk, lx, baseY, lz);
        break;
      case 'birch':
        this.generateBirchTree(chunk, lx, baseY, lz, false);
        break;
      case 'tall_birch':
        this.generateBirchTree(chunk, lx, baseY, lz, true);
        break;
      case 'spruce':
      case 'snowy_spruce':
        this.generateSpruceTree(chunk, lx, baseY, lz, false, treeType === 'snowy_spruce');
        break;
      case 'mega_spruce':
        this.generateSpruceTree(chunk, lx, baseY, lz, true, false);
        break;
      case 'jungle':
        this.generateJungleTree(chunk, lx, baseY, lz);
        break;
      case 'bamboo':
        this.generateBambooGrove(chunk, lx, baseY, lz);
        break;
      case 'dark_oak':
        this.generateDarkOakTree(chunk, lx, baseY, lz);
        break;
      case 'acacia':
        this.generateAcaciaTree(chunk, lx, baseY, lz);
        break;
      case 'mangrove':
        this.generateMangroveTree(chunk, lx, baseY, lz);
        break;
      case 'pale_oak':
        this.generatePaleOakTree(chunk, lx, baseY, lz);
        break;
      case 'huge_mushroom':
        this.generateHugeMushroom(chunk, lx, baseY, lz, rngOf(chunk)() > 0.5 ? 'red' : 'brown');
        break;
      case 'ice_spike':
        this.generateIceSpike(chunk, lx, baseY, lz);
        break;
      case 'oak_and_birch':
        if (rngOf(chunk)() < 0.4) this.generateBirchTree(chunk, lx, baseY, lz);
        else this.generateOakTree(chunk, lx, baseY, lz);
        break;
      case 'spruce_and_oak':
        if (rngOf(chunk)() < 0.5) this.generateSpruceTree(chunk, lx, baseY, lz);
        else this.generateOakTree(chunk, lx, baseY, lz);
        break;
      default:
        this.generateOakTree(chunk, lx, baseY, lz);
        break;
    }
  }

  generateOakTree(chunk, lx, baseY, lz) {
    const trunkHeight = 5;
    for (let y = 0; y < trunkHeight; y++) {
      chunk.setVoxel(lx, baseY + y, lz, BLOCKS.OAK_LOG);
    }
    for (let dy = trunkHeight - 2; dy <= trunkHeight + 1; dy++) {
      const radius = dy >= trunkHeight ? 1 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && dy === trunkHeight + 1) continue;
          const x = lx + dx, z = lz + dz, y = baseY + dy;
          if (x >= 0 && x < CHUNK_SIZE_X && z >= 0 && z < CHUNK_SIZE_Z && y < CHUNK_HEIGHT) {
            if (chunk.getVoxel(x, y, z) === BLOCKS.AIR) chunk.setVoxel(x, y, z, BLOCKS.OAK_LEAVES);
          }
        }
      }
    }
  }

  generateCherryTree(chunk, lx, baseY, lz) {
    const trunkHeight = 5;
    for (let y = 0; y < trunkHeight; y++) {
      chunk.setVoxel(lx, baseY + y, lz, BLOCKS.CHERRY_LOG);
    }
    for (let dy = trunkHeight - 2; dy <= trunkHeight + 1; dy++) {
      const radius = dy >= trunkHeight ? 1 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && dy === trunkHeight + 1) continue;
          const x = lx + dx, z = lz + dz, y = baseY + dy;
          if (x >= 0 && x < CHUNK_SIZE_X && z >= 0 && z < CHUNK_SIZE_Z && y < CHUNK_HEIGHT) {
            if (chunk.getVoxel(x, y, z) === BLOCKS.AIR) chunk.setVoxel(x, y, z, BLOCKS.CHERRY_LEAVES);
          }
        }
      }
    }
  }

  generateBirchTree(chunk, lx, baseY, lz, isTall = false) {
    const trunkHeight = isTall ? 8 : 6;
    for (let y = 0; y < trunkHeight; y++) {
      chunk.setVoxel(lx, baseY + y, lz, BLOCKS.BIRCH_LOG);
    }
    for (let dy = trunkHeight - 3; dy <= trunkHeight + 1; dy++) {
      const radius = dy >= trunkHeight ? 1 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && dy === trunkHeight + 1) continue;
          const x = lx + dx, z = lz + dz, y = baseY + dy;
          if (x >= 0 && x < CHUNK_SIZE_X && z >= 0 && z < CHUNK_SIZE_Z && y < CHUNK_HEIGHT) {
            if (chunk.getVoxel(x, y, z) === BLOCKS.AIR) chunk.setVoxel(x, y, z, BLOCKS.BIRCH_LEAVES);
          }
        }
      }
    }
  }

  generateSpruceTree(chunk, lx, baseY, lz, isMega = false, isSnowy = false) {
    const trunkHeight = isMega ? 10 : 7;
    for (let y = 0; y < trunkHeight; y++) {
      chunk.setVoxel(lx, baseY + y, lz, BLOCKS.SPRUCE_LOG);
    }
    for (let dy = 2; dy <= trunkHeight + 1; dy++) {
      const radius = Math.max(0, Math.floor((trunkHeight + 1 - dy) * 0.45));
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const x = lx + dx, z = lz + dz, y = baseY + dy;
          if (x >= 0 && x < CHUNK_SIZE_X && z >= 0 && z < CHUNK_SIZE_Z && y < CHUNK_HEIGHT) {
            if (chunk.getVoxel(x, y, z) === BLOCKS.AIR) {
              chunk.setVoxel(x, y, z, BLOCKS.SPRUCE_LEAVES);
            }
          }
        }
      }
    }
    // Finish the canopy first. Snow placed during the leaf loop occupied the
    // next row and prevented leaves from being generated, making striped trees.
    if(isSnowy){
      const radius=Math.floor((trunkHeight-1)*.45);
      for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++){
        const x=lx+dx,z=lz+dz;
        for(let y=baseY+2;y<=Math.min(CHUNK_HEIGHT-2,baseY+trunkHeight+1);y++){
          if(chunk.getVoxel(x,y,z)===BLOCKS.SPRUCE_LEAVES && chunk.getVoxel(x,y+1,z)===BLOCKS.AIR)chunk.setVoxel(x,y+1,z,BLOCKS.SNOW_LAYER);
        }
      }
    }

  }

  generateJungleTree(chunk, lx, baseY, lz) {
    const trunkHeight = 11;
    for (let y = 0; y < trunkHeight; y++) {
      chunk.setVoxel(lx, baseY + y, lz, BLOCKS.JUNGLE_LOG);
    }
    for (let dy = trunkHeight - 3; dy <= trunkHeight + 1; dy++) {
      const radius = dy >= trunkHeight ? 1 : 3;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const x = lx + dx, z = lz + dz, y = baseY + dy;
          if (x >= 0 && x < CHUNK_SIZE_X && z >= 0 && z < CHUNK_SIZE_Z && y < CHUNK_HEIGHT) {
            if (chunk.getVoxel(x, y, z) === BLOCKS.AIR) chunk.setVoxel(x, y, z, BLOCKS.JUNGLE_LEAVES);
          }
        }
      }
    }
  }

  generateBambooGrove(chunk, lx, baseY, lz) {
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const x = lx + ox, z = lz + oz;
        if (x >= 0 && x < CHUNK_SIZE_X && z >= 0 && z < CHUNK_SIZE_Z) {
          const h = 4 + Math.floor(rngOf(chunk)() * 5);
          for (let y = 0; y < h; y++) {
            if (baseY + y < CHUNK_HEIGHT) chunk.setVoxel(x, baseY + y, z, BLOCKS.BAMBOO);
          }
        }
      }
    }
  }

  generateDarkOakTree(chunk, lx, baseY, lz) {
    const trunkHeight = 6;
    for (let y = 0; y < trunkHeight; y++) {
      for (let dx = 0; dx <= 1; dx++) {
        for (let dz = 0; dz <= 1; dz++) {
          const x = lx + dx, z = lz + dz;
          if (x < CHUNK_SIZE_X && z < CHUNK_SIZE_Z) chunk.setVoxel(x, baseY + y, z, BLOCKS.DARK_OAK_LOG);
        }
      }
    }
    for (let dy = trunkHeight - 2; dy <= trunkHeight + 1; dy++) {
      const radius = 3;
      for (let dx = -radius; dx <= radius + 1; dx++) {
        for (let dz = -radius; dz <= radius + 1; dz++) {
          const x = lx + dx, z = lz + dz, y = baseY + dy;
          if (x >= 0 && x < CHUNK_SIZE_X && z >= 0 && z < CHUNK_SIZE_Z && y < CHUNK_HEIGHT) {
            if (chunk.getVoxel(x, y, z) === BLOCKS.AIR) chunk.setVoxel(x, y, z, BLOCKS.DARK_OAK_LEAVES);
          }
        }
      }
    }
  }

  generateAcaciaTree(chunk, lx, baseY, lz) {
    const trunkHeight = 6;
    for (let y = 0; y < trunkHeight; y++) {
      const ox = y > 3 ? 1 : 0;
      const x = lx + ox;
      if (x < CHUNK_SIZE_X) chunk.setVoxel(x, baseY + y, lz, BLOCKS.ACACIA_LOG);
    }
    const topX = Math.min(CHUNK_SIZE_X - 1, lx + 1);
    const topY = baseY + trunkHeight;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const x = topX + dx, z = lz + dz;
        if (x >= 0 && x < CHUNK_SIZE_X && z >= 0 && z < CHUNK_SIZE_Z && topY < CHUNK_HEIGHT) {
          if (chunk.getVoxel(x, topY, z) === BLOCKS.AIR) chunk.setVoxel(x, topY, z, BLOCKS.ACACIA_LEAVES);
        }
      }
    }
  }

  generateMangroveTree(chunk, lx, baseY, lz) {
    // Root cage
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const x = lx + dx, z = lz + dz;
        if (x >= 0 && x < CHUNK_SIZE_X && z >= 0 && z < CHUNK_SIZE_Z) {
          chunk.setVoxel(x, baseY, z, BLOCKS.MANGROVE_ROOTS);
          chunk.setVoxel(x, baseY + 1, z, BLOCKS.MANGROVE_ROOTS);
        }
      }
    }
    const trunkHeight = 6;
    for (let y = 2; y < trunkHeight; y++) {
      chunk.setVoxel(lx, baseY + y, lz, BLOCKS.MANGROVE_LOG);
    }
    for (let dy = trunkHeight - 2; dy <= trunkHeight + 1; dy++) {
      const radius = dy >= trunkHeight ? 1 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const x = lx + dx, z = lz + dz, y = baseY + dy;
          if (x >= 0 && x < CHUNK_SIZE_X && z >= 0 && z < CHUNK_SIZE_Z && y < CHUNK_HEIGHT) {
            if (chunk.getVoxel(x, y, z) === BLOCKS.AIR) chunk.setVoxel(x, y, z, BLOCKS.MANGROVE_LEAVES);
          }
        }
      }
    }
  }

  generatePaleOakTree(chunk, lx, baseY, lz) {
    const trunkHeight = 6;
    for (let y = 0; y < trunkHeight; y++) {
      chunk.setVoxel(lx, baseY + y, lz, BLOCKS.PALE_OAK_LOG);
    }
    for (let dy = trunkHeight - 2; dy <= trunkHeight + 1; dy++) {
      const radius = dy >= trunkHeight ? 1 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const x = lx + dx, z = lz + dz, y = baseY + dy;
          if (x >= 0 && x < CHUNK_SIZE_X && z >= 0 && z < CHUNK_SIZE_Z && y < CHUNK_HEIGHT) {
            if (chunk.getVoxel(x, y, z) === BLOCKS.AIR) chunk.setVoxel(x, y, z, BLOCKS.PALE_OAK_LEAVES);
          }
        }
      }
    }
  }

  generateHugeMushroom(chunk, lx, baseY, lz, type = 'red') {
    const stemHeight = 5;
    const blockId = type === 'red' ? BLOCKS.RED_MUSHROOM_BLOCK : BLOCKS.BROWN_MUSHROOM_BLOCK;
    for (let y = 0; y < stemHeight; y++) {
      chunk.setVoxel(lx, baseY + y, lz, BLOCKS.MUSHROOM_STEM);
    }
    const capY = baseY + stemHeight;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const x = lx + dx, z = lz + dz;
        if (x >= 0 && x < CHUNK_SIZE_X && z >= 0 && z < CHUNK_SIZE_Z && capY < CHUNK_HEIGHT) {
          chunk.setVoxel(x, capY, z, blockId);
          if (type === 'red') chunk.setVoxel(x, capY - 1, z, blockId);
        }
      }
    }
  }

  generateNetherFungus(chunk, lx, baseY, lz, type = 'crimson') {
    const stemId = type === 'crimson' ? BLOCKS.CRIMSON_STEM : BLOCKS.WARPED_STEM;
    const wartId = type === 'crimson' ? BLOCKS.NETHER_WART_BLOCK : BLOCKS.WARPED_WART_BLOCK;
    const stemHeight = 4 + Math.floor(rngOf(chunk)() * 3);
    for (let y = 0; y < stemHeight; y++) {
      if (baseY + y < CHUNK_HEIGHT - 2) {
        chunk.setVoxel(lx, baseY + y, lz, stemId);
      }
    }
    const capY = baseY + stemHeight;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const x = lx + dx, z = lz + dz;
        if (x >= 0 && x < CHUNK_SIZE_X && z >= 0 && z < CHUNK_SIZE_Z && capY < CHUNK_HEIGHT) {
          if (dx === 0 && dz === 0) {
            chunk.setVoxel(x, capY, z, BLOCKS.SHROOMLIGHT);
          } else {
            chunk.setVoxel(x, capY, z, wartId);
          }
        }
      }
    }
  }

  generateBoneFossil(chunk, lx, baseY, lz) {
    const block = BLOCKS.CALCITE || BLOCKS.SMOOTH_STONE;
    const h = 3;
    for (let y = 0; y <= h; y++) {
      if (baseY + y < CHUNK_HEIGHT - 2) {
        if (lx - 1 >= 0) chunk.setVoxel(lx - 1, baseY + y, lz, block);
        if (lx + 1 < CHUNK_SIZE_X) chunk.setVoxel(lx + 1, baseY + y, lz, block);
      }
    }
    if (baseY + h < CHUNK_HEIGHT - 2) {
      chunk.setVoxel(lx, baseY + h, lz, block);
    }
  }

  generateIceSpike(chunk, lx, baseY, lz) {
    const spikeHeight = 12 + Math.floor(rngOf(chunk)() * 12);
    for (let y = 0; y < spikeHeight; y++) {
      const radius = y > spikeHeight - 3 ? 0 : (y > spikeHeight - 6 ? 1 : 2);
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const x = lx + dx, z = lz + dz, wy = baseY + y;
          if (x >= 0 && x < CHUNK_SIZE_X && z >= 0 && z < CHUNK_SIZE_Z && wy < CHUNK_HEIGHT) {
            chunk.setVoxel(x, wy, z, BLOCKS.PACKED_ICE);
          }
        }
      }
    }
  }

  generateChorusPlant(chunk, lx, baseY, lz) {
    const h = 4 + Math.floor(rngOf(chunk)() * 4);
    for (let y = 0; y < h; y++) {
      if (baseY + y < CHUNK_HEIGHT) {
        chunk.setVoxel(lx, baseY + y, lz, y === h - 1 ? BLOCKS.CHORUS_FLOWER : BLOCKS.CHORUS_PLANT);
      }
    }
  }

  generateBasaltPillar(chunk, lx, baseY, lz) {
    const h = 5 + Math.floor(rngOf(chunk)() * 6);
    for (let y = 0; y < h; y++) {
      if (baseY + y < CHUNK_HEIGHT) chunk.setVoxel(lx, baseY + y, lz, BLOCKS.BASALT);
    }
  }

  generateVillage(chunk) {
    const h1Y = 25;
    for (let x = 3; x <= 8; x++) {
      for (let z = 3; z <= 8; z++) {
        chunk.setVoxel(x, h1Y, z, BLOCKS.COBBLESTONE);
        for (let y = 1; y <= 4; y++) {
          const isCorner = (x === 3 || x === 8) && (z === 3 || z === 8);
          const isWall = x === 3 || x === 8 || z === 3 || z === 8;
          const isDoor = x === 5 && z === 3 && (y === 1 || y === 2);
          const isWindow = (x === 6 && z === 3 && y === 2) || (x === 5 && z === 8 && y === 2);

          if (isCorner) {
            chunk.setVoxel(x, h1Y + y, z, BLOCKS.OAK_LOG);
          } else if (isDoor) {
            chunk.setVoxel(x, h1Y + y, z, BLOCKS.AIR);
          } else if (isWindow) {
            chunk.setVoxel(x, h1Y + y, z, BLOCKS.GLASS);
          } else if (isWall) {
            chunk.setVoxel(x, h1Y + y, z, BLOCKS.OAK_PLANKS);
          }
        }
      }
    }
    // Cottage Roof
    for (let x = 2; x <= 9; x++) {
      for (let z = 2; z <= 9; z++) {
        chunk.setVoxel(x, h1Y + 5, z, BLOCKS.OAK_PLANKS);
      }
    }
    // Interior furniture
    chunk.setVoxel(7, h1Y + 1, 7, BLOCKS.CRAFTING_TABLE);
    chunk.setVoxel(4, h1Y + 1, 7, BLOCKS.FURNACE);
    chunk.setVoxel(4, h1Y + 3, 5, BLOCKS.TORCH);

    // Village Path
    for (let z = 1; z <= 14; z++) {
      chunk.setVoxel(2, 25, z, BLOCKS.GRAVEL);
      chunk.setVoxel(1, 25, z, BLOCKS.GRAVEL);
    }
  }

  getVoxel(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return BLOCKS.AIR;
    if (wy < this.floorY) return BLOCKS.BARRIER;
    // Math.floor, not truncation: wx = -1 must be chunk -1, not chunk 0. The old code used
    // Math.floor here and the correctness of every negative coordinate depends on it.
    const cx = Math.floor(wx / CHUNK_SIZE_X);
    const cz = Math.floor(wz / CHUNK_SIZE_Z);

    const slot = ((cx + CHUNK_HASH_OFFSET) * 31 + (cz + CHUNK_HASH_OFFSET)) & CHUNK_CACHE_MASK;
    let chunk = this.chunkCache[slot];
    if (chunk === null || chunk.cx !== cx || chunk.cz !== cz) {
      // Counted here as well as in getChunk: this is the path the engine actually uses, so
      // leaving it uncounted would make the hit-rate metric measure nothing.
      this.chunkCacheMisses++;
      chunk = this.chunks.get(`${cx},${cz}`);
      if (chunk === undefined) return BLOCKS.AIR;
      this.chunkCache[slot] = chunk;
    } else {
      this.chunkCacheHits++;
    }

    // Local coordinate via mask. This requires the chunk size to be a power of two, and it works
    // for negatives because two's complement makes -1 & 15 === 15, which is the cell we want.
    const lx = wx & (CHUNK_SIZE_X - 1);
    const lz = wz & (CHUNK_SIZE_Z - 1);
    return chunk.voxels[(wy * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx];
  }

  isBlockSolid(wx, wy, wz, mobType = null) {
    const b = this.getVoxel(Math.floor(wx), Math.floor(wy), Math.floor(wz));
    if (!b || b === BLOCKS.AIR || b === BLOCKS.WATER || b === BLOCKS.FIRE || b === BLOCKS.LAVA) return false;
    const def = BLOCK_DEFS[b];
    return def ? def.solid !== false && !def.plant : true;
  }

  getHighestSolidY(wx, wz) {
    const cx = Math.floor(wx / CHUNK_SIZE_X);
    const cz = Math.floor(wz / CHUNK_SIZE_Z);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return 0;

    const lx = wx & (CHUNK_SIZE_X - 1);
    const lz = wz & (CHUNK_SIZE_Z - 1);

    if(this.generationMode!=='authored'&&!this.isFlatWorld&&getBiomeDef(this.selectedBiome)?.isCavern){
      // Skip the open sky, then the roof; choose a walkable floor INSIDE the
      // cavern. A cave-biome world must not start the player on its roof.
      let roof=false,inside=false;
      for(let y=CHUNK_HEIGHT-2;y>=2;y--){const id=chunk.getVoxel(lx,y,lz),def=BLOCK_DEFS[id];
        const solid=id!==BLOCKS.AIR&&id!==BLOCKS.WATER&&id!==BLOCKS.LAVA&&def?.solid!==false&&!def?.plant;
        if(!roof){if(solid)roof=true;continue;}
        if(!solid){if(id===BLOCKS.AIR)inside=true;continue;}
        const clear=dy=>{const above=chunk.getVoxel(lx,y+dy,lz),d=BLOCK_DEFS[above];return above===BLOCKS.AIR||above!==BLOCKS.WATER&&above!==BLOCKS.LAVA&&(d?.plant||d?.solid===false);};
        if(inside&&clear(1)&&clear(2)&&y<this.caves.column(wx,wz).ceiling)return y;
      }
      return 0; // a solid pillar is not permission to spawn on top of the roof
    }

    const isNetherCavern = this.isNether || this.dimension === 'nether' || getBiomeDef(this.selectedBiome)?.isNether;
    if (isNetherCavern&&this.generationMode!=='authored') {
      // Prefer the main inhabited cavern, not a small tunnel in the roof.
      let foundAir = false;
      for (let y = CHUNK_HEIGHT - 12; y >= 1; y--) {
        const id = chunk.getVoxel(lx, y, lz);
        if (id === BLOCKS.AIR) {
          foundAir = true;
        } else if (foundAir) {
          // First solid block under cavern air is the walkable floor
          return y;
        }
      }
    }

    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      const id = chunk.getVoxel(lx, y, lz);
      if (id !== BLOCKS.AIR) return y;
    }
    return 0;
  }

  isDryColumn(wx, wz, groundY) {
    for (let y = groundY + 1; y <= Math.min(CHUNK_HEIGHT - 1, groundY + 2); y++) {
      const id = this.getVoxel(wx, y, wz);
      if (id === BLOCKS.WATER || id === BLOCKS.LAVA) return false;
    }
    return true;
  }

  getSurfaceStandY(wx, wz) {
    const ground = this.getHighestSolidY(wx, wz);
    if (ground <= 0) return 0;
    return Math.min(CHUNK_HEIGHT - 2, ground + 1);
  }

  getLavaLevel(wx, wy, wz) {
    if (this.getVoxel(wx, wy, wz) !== BLOCKS.LAVA) return -1;
    const chunk = this.getChunk(Math.floor(wx / CHUNK_SIZE_X), Math.floor(wz / CHUNK_SIZE_Z));
    if (!chunk) return -1;
    return chunk.waterLevels[chunk.getIndex(wx & (CHUNK_SIZE_X - 1), wy, wz & (CHUNK_SIZE_Z - 1))];
  }

  getWaterLevel(wx, wy, wz) {
    const blockId = this.getVoxel(wx, wy, wz);
    // Sea plants contain source water; they support adjacent water without
    // being replaced by it. Ordinary dry plants still return -1.
    if (BLOCK_DEFS[blockId]?.waterPlant) return 0;
    if (blockId !== BLOCKS.WATER) return -1;
    const chunk = this.getChunk(Math.floor(wx / CHUNK_SIZE_X), Math.floor(wz / CHUNK_SIZE_Z));
    if (!chunk) return -1;
    return chunk.waterLevels[chunk.getIndex(wx & (CHUNK_SIZE_X - 1), wy, wz & (CHUNK_SIZE_Z - 1))];
  }

  setVoxel(wx, wy, wz, blockId, waterLevel = 0, fluidUpdate = false) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return;
    // Nothing is built into Building Studio's ground; everything stands on it.
    if (wy < this.floorY) return;
    const cx = Math.floor(wx / CHUNK_SIZE_X);
    const cz = Math.floor(wz / CHUNK_SIZE_Z);
    const chunk = this.getOrCreateChunk(cx, cz);

    const lx = wx & (CHUNK_SIZE_X - 1);
    const lz = wz & (CHUNK_SIZE_Z - 1);
    const level = (blockId === BLOCKS.WATER || blockId === BLOCKS.LAVA) ? Math.max(0, Math.min(8, waterLevel)) : 0;
    const index = chunk.getIndex(lx, wy, lz);
    if (chunk.voxels[index] === blockId && chunk.waterLevels[index] === level) return;
    const previous=chunk.voxels[index];
    chunk.setVoxel(lx, wy, lz, blockId);
    // Nether portal blocks, per dimension, for the zombified piglins portals spawn (netherPortal.js).
    if (blockId === BLOCKS.NETHER_PORTAL || previous === BLOCKS.NETHER_PORTAL) {
      this.portalBlocks ??= {}; const set = (this.portalBlocks[this.dimension || 'overworld'] ??= new Set()); const k = `${wx},${wy},${wz}`;
      if (blockId === BLOCKS.NETHER_PORTAL) set.add(k); else set.delete(k);
    }
    // A change after generation: the chunk now holds something its seed cannot regenerate, so the streamer keeps it
    // when it unloads (chunkStreamer.js unloadChunk).
    if (!this.generatingChunks) chunk.modified = true;
    this.cauldronLevels?.delete(`${wx},${wy},${wz}`);
    chunk.waterLevels[index] = level;
    if (this.structureOrientations.size > 0) this.structureOrientations.delete(`${wx},${wy},${wz}`);
    // New terrain's settling water queues its own next cells (#settleNewWater); the game's water is not woken by it.
    if (!this.settlingNewWater) this.water.notify(wx, wy, wz, !fluidUpdate);
    this.lava.notify(wx, wy, wz, !fluidUpdate);
    this.redstone.notify(wx, wy, wz);
    // Nor does it wake the sand above it: generated terrain does not react to itself.
    if (!this.settlingNewWater) this.fallingBlocks?.notify(wx, wy, wz);
    // A job site placed: villagers that found none look again (mobs.js; the set is villagerEconomy.js JOB_SITE_BLOCKS).
    if (this.jobSiteBlocks?.has(blockId)) this.jobSitesPlaced = (this.jobSitesPlaced || 0) + 1;
    this.leafDecay?.notify(wx, wy, wz, previous, blockId);

    // If voxel is at border of chunk, mark neighbor chunks dirty too
    if (lx === 0) {
      const neighbor = this.getChunk(cx - 1, cz);
      if (neighbor) neighbor.dirty = true;
    } else if (lx === CHUNK_SIZE_X - 1) {
      const neighbor = this.getChunk(cx + 1, cz);
      if (neighbor) neighbor.dirty = true;
    }
    if (lz === 0) {
      const neighbor = this.getChunk(cx, cz - 1);
      if (neighbor) neighbor.dirty = true;
    } else if (lz === CHUNK_SIZE_Z - 1) {
      const neighbor = this.getChunk(cx, cz + 1);
      if (neighbor) neighbor.dirty = true;
    }
    const dx = lx === 0 ? -1 : (lx === CHUNK_SIZE_X - 1 ? 1 : 0);
    const dz = lz === 0 ? -1 : (lz === CHUNK_SIZE_Z - 1 ? 1 : 0);
    if (dx && dz) {
      const diagonal = this.getChunk(cx + dx, cz + dz);
      if (diagonal) diagonal.dirty = true;
    }

    // Light is a derived quantity, so a block change invalidates it. Marked rather than recomputed
    // here: `setVoxel` is called in tight loops by fluid flow and redstone, and relighting inside
    // it would make one edit cost a chunk relight. LightEngine.update() does the work on a budget.
    this.light.markBlockChanged(wx, wy, wz);
    if(previous!==blockId && (isChorus(previous)||previous===BLOCKS.END_STONE))collapseChorusSupport(this,wx,wy,wz,{drop:(pos,id,isBlock,count)=>this.game?.entities?.spawnDroppedItem?.(pos,id,isBlock,count)});
  }

  decorateOceanFloorColumn(chunk, lx, height, lz, wx, wz, bId, def) {
    const depth = this.seaLevel - height;
    if (depth < 2) return;

    const floorBlock = chunk.getVoxel(lx, height, lz);
    const isEligible = floorBlock === BLOCKS.SAND || floorBlock === BLOCKS.GRAVEL ||
                       floorBlock === BLOCKS.DIRT || floorBlock === BLOCKS.STONE ||
                       floorBlock === BLOCKS.CLAY;
    if (!isEligible) return;

    const plantHash = Math.abs(Math.sin(wx * 37.719 + wz * 73.193));

    // 1. Warm Ocean (sea pickles and seagrass)
    if (bId === 'warm_ocean' || def.floraType === 'sea_pickle') {
      const pickleDensity = def.floraDensity || 0.08;
      if (plantHash < pickleDensity) {
        chunk.setVoxel(lx, height + 1, lz, BLOCKS.SEA_PICKLE);
      } else {
        const grassHash = Math.abs(Math.sin(wx * 83.17 + wz * 49.31));
        if (grassHash < 0.38) {
          if (grassHash < 0.12 && depth >= 3) {
            chunk.setVoxel(lx, height + 1, lz, BLOCKS.TALL_SEAGRASS);
            chunk.setVoxel(lx, height + 2, lz, BLOCKS.TALL_SEAGRASS);
          } else {
            chunk.setVoxel(lx, height + 1, lz, BLOCKS.SEAGRASS);
          }
        }
      }
      return;
    }

    // 2. Kelp-bearing oceans (ocean, lukewarm_ocean, cold_ocean, deep_ocean, etc.)
    if (def.floraType === 'kelp') {
      const patchNoise = this.noise.noise2D(wx * 0.06, wz * 0.06);
      const kelpHash = Math.abs(Math.sin(wx * 61.47 + wz * 29.83));
      if (patchNoise > 0.05 && depth >= 4 && kelpHash < 0.70) {
        const maxKelpHeight = Math.min(18, depth - 2);
        const kelpH = 2 + Math.floor(kelpHash * (maxKelpHeight - 1));
        for (let ky = 1; ky < kelpH; ky++) {
          chunk.setVoxel(lx, height + ky, lz, BLOCKS.KELP_PLANT);
        }
        chunk.setVoxel(lx, height + kelpH, lz, BLOCKS.KELP);
        return;
      }

      const grassHash = Math.abs(Math.sin(wx * 83.17 + wz * 49.31));
      if (grassHash < 0.35) {
        if (grassHash < 0.10 && depth >= 3) {
          chunk.setVoxel(lx, height + 1, lz, BLOCKS.TALL_SEAGRASS);
          chunk.setVoxel(lx, height + 2, lz, BLOCKS.TALL_SEAGRASS);
        } else {
          chunk.setVoxel(lx, height + 1, lz, BLOCKS.SEAGRASS);
        }
      }
      return;
    }

    // 3. Rivers & other wetland waters (seagrass)
    if (def.floraType === 'seagrass' || bId === 'river') {
      const grassHash = Math.abs(Math.sin(wx * 83.17 + wz * 49.31));
      if (grassHash < 0.30) {
        if (grassHash < 0.08 && depth >= 3) {
          chunk.setVoxel(lx, height + 1, lz, BLOCKS.TALL_SEAGRASS);
          chunk.setVoxel(lx, height + 2, lz, BLOCKS.TALL_SEAGRASS);
        } else {
          chunk.setVoxel(lx, height + 1, lz, BLOCKS.SEAGRASS);
        }
      }
    }
  }

  generateCoralReefsForChunk(chunk, cx, cz) {
    const SPACING = 5;
    const REEF_REACH = 3;
    const baseX = cx * CHUNK_SIZE_X;
    const baseZ = cz * CHUNK_SIZE_Z;

    const firstGX = Math.floor((baseX - REEF_REACH) / SPACING);
    const lastGX = Math.floor((baseX + CHUNK_SIZE_X - 1 + REEF_REACH) / SPACING);
    const firstGZ = Math.floor((baseZ - REEF_REACH) / SPACING);
    const lastGZ = Math.floor((baseZ + CHUNK_SIZE_Z - 1 + REEF_REACH) / SPACING);

    for (let gx = firstGX; gx <= lastGX; gx++) {
      for (let gz = firstGZ; gz <= lastGZ; gz++) {
        const wx = gx * SPACING + Math.floor(jitterOf(gx, gz, this.seed) * SPACING);
        const wz = gz * SPACING + Math.floor(jitterOf(gx + 8171, gz + 3313, this.seed) * SPACING);
        const bId = this.getBiome(wx, wz);
        const def = getBiomeDef(bId);

        if (def.treeType !== 'coral' || def.treeDensity <= 0) continue;
        if (candidateAt(gx, gz, this.seed) >= def.treeDensity) continue;

        const floorY = this.surfaceHeightAt(wx, wz, bId);
        if (floorY >= this.seaLevel - 3 || floorY < 4) continue;

        const rng = mulberry32(treeSeed(gx, gz, this.seed));
        this.generateCoralReef(chunk, wx - baseX, floorY, wz - baseZ, rng);
      }
    }
  }

  generateCoralReef(chunk, rx, floorY, rz, rng) {
    const CORAL_PALETTES = [
      { block: BLOCKS.TUBE_CORAL_BLOCK, plant: BLOCKS.TUBE_CORAL, fan: BLOCKS.TUBE_CORAL_FAN, wallFan: BLOCKS.TUBE_CORAL_WALL_FAN },
      { block: BLOCKS.BRAIN_CORAL_BLOCK, plant: BLOCKS.BRAIN_CORAL, fan: BLOCKS.BRAIN_CORAL_FAN, wallFan: BLOCKS.BRAIN_CORAL_WALL_FAN },
      { block: BLOCKS.BUBBLE_CORAL_BLOCK, plant: BLOCKS.BUBBLE_CORAL, fan: BLOCKS.BUBBLE_CORAL_FAN, wallFan: BLOCKS.BUBBLE_CORAL_WALL_FAN },
      { block: BLOCKS.FIRE_CORAL_BLOCK, plant: BLOCKS.FIRE_CORAL, fan: BLOCKS.FIRE_CORAL_FAN, wallFan: BLOCKS.FIRE_CORAL_WALL_FAN },
      { block: BLOCKS.HORN_CORAL_BLOCK, plant: BLOCKS.HORN_CORAL, fan: BLOCKS.HORN_CORAL_FAN, wallFan: BLOCKS.HORN_CORAL_WALL_FAN }
    ];

    const primary = CORAL_PALETTES[Math.floor(rng() * CORAL_PALETTES.length)];
    const secondary = CORAL_PALETTES[Math.floor(rng() * CORAL_PALETTES.length)];

    const setVoxelWaterOnly = (x, y, z, blockId) => {
      if (x >= 0 && x < CHUNK_SIZE_X && z >= 0 && z < CHUNK_SIZE_Z && y > 0 && y < this.seaLevel) {
        const cur = chunk.getVoxel(x, y, z);
        if (cur === BLOCKS.WATER || BLOCK_DEFS[cur]?.waterPlant) {
          chunk.setVoxel(x, y, z, blockId);
          return true;
        }
      }
      return false;
    };

    const maxReefY = Math.min(this.seaLevel - 2, floorY + 6);
    const height = Math.max(2, Math.min(maxReefY - floorY, 2 + Math.floor(rng() * 4)));
    const reefType = Math.floor(rng() * 3);

    const coralBlockList = [];

    if (reefType === 0) {
      for (let y = 1; y <= height; y++) {
        if (setVoxelWaterOnly(rx, floorY + y, rz, primary.block)) {
          coralBlockList.push({ x: rx, y: floorY + y, z: rz });
        }
      }
      const branches = [
        [1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [-1, 1], [1, -1], [-1, -1]
      ];
      const branchCount = 2 + Math.floor(rng() * 3);
      for (let b = 0; b < branchCount; b++) {
        const [dx, dz] = branches[Math.floor(rng() * branches.length)];
        const branchY = floorY + Math.max(1, height - Math.floor(rng() * 2));
        const pal = rng() < 0.7 ? primary : secondary;
        if (setVoxelWaterOnly(rx + dx, branchY, rz + dz, pal.block)) {
          coralBlockList.push({ x: rx + dx, y: branchY, z: rz + dz });
        }
        if (rng() < 0.5 && branchY + 1 < this.seaLevel - 1) {
          if (setVoxelWaterOnly(rx + dx, branchY + 1, rz + dz, pal.block)) {
            coralBlockList.push({ x: rx + dx, y: branchY + 1, z: rz + dz });
          }
        }
      }
    } else if (reefType === 1) {
      const radius = 1 + Math.floor(rng() * 2);
      for (let dy = 1; dy <= height; dy++) {
        const r = dy === height ? Math.max(0, radius - 1) : radius;
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (dx * dx + dz * dz <= r * r + 0.5) {
              const pal = rng() < 0.8 ? primary : secondary;
              if (setVoxelWaterOnly(rx + dx, floorY + dy, rz + dz, pal.block)) {
                coralBlockList.push({ x: rx + dx, y: floorY + dy, z: rz + dz });
              }
            }
          }
        }
      }
    } else {
      let curX = rx, curZ = rz;
      const dirX = rng() > 0.5 ? 1 : -1;
      const dirZ = rng() > 0.5 ? 1 : -1;
      for (let y = 1; y <= height; y++) {
        if (y > 2 && rng() < 0.6) {
          if (rng() < 0.5) curX += dirX;
          else curZ += dirZ;
        }
        const pal = rng() < 0.75 ? primary : secondary;
        if (setVoxelWaterOnly(curX, floorY + y, curZ, pal.block)) {
          coralBlockList.push({ x: curX, y: floorY + y, z: curZ });
        }
        if (rng() < 0.4) {
          setVoxelWaterOnly(curX + (rng() < 0.5 ? 1 : -1), floorY + y, curZ, pal.block);
        }
      }
    }

    for (const cb of coralBlockList) {
      const topDecorRoll = rng();
      if (topDecorRoll < 0.35) {
        setVoxelWaterOnly(cb.x, cb.y + 1, cb.z, primary.plant);
      } else if (topDecorRoll < 0.65) {
        setVoxelWaterOnly(cb.x, cb.y + 1, cb.z, primary.fan);
      } else if (topDecorRoll < 0.82) {
        setVoxelWaterOnly(cb.x, cb.y + 1, cb.z, BLOCKS.SEA_PICKLE);
      }

      const sideDirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [sdx, sdz] of sideDirs) {
        if (rng() < 0.20) {
          setVoxelWaterOnly(cb.x + sdx, cb.y, cb.z + sdz, primary.wallFan);
        }
      }
    }
  }
}

