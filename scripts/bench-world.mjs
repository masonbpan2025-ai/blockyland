#!/usr/bin/env node
/**
 * Performance harness for world generation, voxel access and chunk meshing.
 *
 *   node scripts/bench-world.mjs          human-readable report
 *   node scripts/bench-world.mjs --json   machine-readable, for comparing before/after
 *
 * This exists because "it feels laggy" is not a number, and because every performance change
 * should be justified by a measurement from here rather than by intuition.
 *
 * It measures the layers in the order they cost time:
 *
 *   1. getVoxel throughput   -- the hottest function in the engine: called for every face of every
 *                               non-air voxel, so ~6x per voxel per mesh, plus AO checks.
 *   2. Terrain generation    -- building a chunk's voxel data.
 *   3. Meshing               -- turning one chunk's voxels into geometry. A frame at 60fps is
 *                               16.7ms, so this number is only acceptable if it is well under it.
 *   4. Streaming while walking -- crossing a chunk boundary and generating + meshing whatever
 *                               newly comes into range. This is the stutter the player feels.
 *
 * Uses the real three.js with a DOM shim (see bench-dom-shim.mjs), so the geometry work measured
 * is exactly what the browser does.
 */
import { performance } from 'node:perf_hooks';
import { installDomShim } from './bench-dom-shim.mjs';

installDomShim();

const { World, CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } = await import('../src/world.js');
const { ChunkMesher } = await import('../src/mesher.js');
const { TextureManager } = await import('../src/textures.js');
const { BLOCKS } = await import('../src/blocks.js');

const asJson = process.argv.includes('--json');
const FRAME_MS = 1000 / 60;

const results = [];

function time(fn) {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}
function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function bench(label, runs, fn) {
  const samples = [];
  for (let i = 0; i < runs; i++) samples.push(time(fn));
  return { label, median: median(samples), min: Math.min(...samples), max: Math.max(...samples), runs };
}
function record(r) {
  results.push(r);
  if (!asJson) {
    console.log('  ' + r.label.padEnd(40)
      + r.median.toFixed(2).padStart(9) + ' ms'
      + '   min ' + r.min.toFixed(2).padStart(8)
      + '   max ' + r.max.toFixed(2).padStart(8));
  }
}

const mesher = new ChunkMesher(new TextureManager());

// --- 1. getVoxel throughput --------------------------------------------------

function benchGetVoxel(chunksWide = 4) {
  const world = new World(4242, 'all');
  for (let cx = 0; cx < chunksWide; cx++) {
    for (let cz = 0; cz < chunksWide; cz++) world.getOrCreateChunk(cx, cz);
  }
  const span = chunksWide * CHUNK_SIZE_X;
  const calls = 200000;
  const r = bench('getVoxel x200k', 5, () => {
    let acc = 0;
    for (let i = 0; i < calls; i++) {
      acc += world.getVoxel((i * 7) % span, (i * 3) % CHUNK_HEIGHT, (i * 13) % span);
    }
    if (acc === -1) throw new Error('unreachable');
  });
  r.perCall = (r.median * 1e6) / calls; // nanoseconds per call
  return r;
}

// --- 2. Terrain generation --------------------------------------------------

function benchGeneration(count = 16) {
  return bench('generate ' + count + ' chunks (terrain)', 3, () => {
    const world = new World(99, 'all');
    for (let i = 0; i < count; i++) world.getOrCreateChunk(i % 8, Math.floor(i / 8));
  });
}

// --- 3. Meshing -------------------------------------------------------------

function benchMeshing(count = 8) {
  const world = new World(7, 'all');
  const chunks = [];
  for (let i = 0; i < count; i++) chunks.push(world.getOrCreateChunk(i % 4, Math.floor(i / 4)));
  mesher.meshChunk(chunks[0], world); // warm up JIT and caches
  const r = bench('mesh ' + count + ' chunks', 3, () => {
    for (const chunk of chunks) mesher.meshChunk(chunk, world);
  });
  r.perChunk = r.median / count;
  return r;
}

/** Vertex counts, so a meshing change can be shown not to have changed the output. */
function meshStats() {
  const world = new World(7, 'all');
  let opaque = 0, transparent = 0, water = 0, light = 0;
  const perChunk = [];
  for (let i = 0; i < 8; i++) {
    const chunk = world.getOrCreateChunk(i % 4, Math.floor(i / 4));
    const g = mesher.meshChunk(chunk, world);
    const o = g.opaqueGeo ? g.opaqueGeo.attributes.position.count : 0;
    const t = g.transparentGeo ? g.transparentGeo.attributes.position.count : 0;
    const w = g.waterGeo ? g.waterGeo.attributes.position.count : 0;
    const l = g.lightGeo ? g.lightGeo.attributes.position.count : 0;
    opaque += o; transparent += t; water += w; light += l;
    perChunk.push({ cx: chunk.cx, cz: chunk.cz, opaque: o, transparent: t, water: w, light: l });
  }
  return { opaque, transparent, water, light, perChunk };
}

// --- 4. Streaming while walking ---------------------------------------------

function benchWalking(renderDistance = 4, steps = 6) {
  const world = new World(2024, 'all');
  const warm = (pcx, pcz) => {
    for (let cx = pcx - renderDistance; cx <= pcx + renderDistance; cx++) {
      for (let cz = pcz - renderDistance; cz <= pcz + renderDistance; cz++) {
        const chunk = world.getOrCreateChunk(cx, cz);
        if (chunk.dirty) { mesher.meshChunk(chunk, world); chunk.dirty = false; }
      }
    }
  };
  warm(0, 0);
  const stepTimes = [];
  for (let step = 1; step <= steps; step++) {
    const t0 = performance.now();
    warm(step, 0);
    stepTimes.push(performance.now() - t0);
  }
  const total = stepTimes.reduce((a, b) => a + b, 0);
  return {
    label: 'walk (view radius ' + renderDistance + ')',
    median: total / steps,
    min: Math.min(...stepTimes),
    max: Math.max(...stepTimes),
    runs: steps,
  };
}

/** How many chunks a view radius keeps, and how much voxel memory that is. */
function viewArea(radius) {
  const side = radius * 2 + 1;
  const chunks = side * side;
  // voxels + waterLevels, both Uint8
  const bytesPerChunk = CHUNK_SIZE_X * CHUNK_HEIGHT * CHUNK_SIZE_Z * 2;
  return { radius, side, chunks, mb: (chunks * bytesPerChunk) / 1048576, voxels: chunks * CHUNK_SIZE_X * CHUNK_HEIGHT * CHUNK_SIZE_Z };
}

// --- report -----------------------------------------------------------------

if (!asJson) {
  console.log('\nWorld performance benchmark');
  console.log('='.repeat(74));
  console.log('(60fps frame budget = ' + FRAME_MS.toFixed(1) + 'ms; anything per-chunk above that stutters)\n');
  console.log('[1] Voxel access -- the hottest path');
}
const voxelBench = benchGetVoxel();
record(voxelBench);
if (!asJson) console.log('  ' + ' '.repeat(40) + (voxelBench.perCall).toFixed(0).padStart(9) + ' ns/call');

if (!asJson) console.log('\n[2] Terrain generation');
record(benchGeneration());

if (!asJson) console.log('\n[3] Meshing');
const meshBench = benchMeshing();
record(meshBench);
if (!asJson) {
  console.log('  ' + ' '.repeat(40) + (meshBench.perChunk).toFixed(2).padStart(9) + ' ms/chunk'
    + '   = ' + (meshBench.perChunk / FRAME_MS).toFixed(1) + ' frames of budget');
}
const stats = meshStats();
if (!asJson) {
  console.log('\n  mesh output for 8 chunks (guards against a change altering geometry):');
  console.log('    opaque ' + stats.opaque + '  transparent ' + stats.transparent
    + '  water ' + stats.water + '  light ' + stats.light + '  vertices');
}

if (!asJson) console.log('\n[4] Streaming while walking');
const walk = [];
for (const radius of [4, 6, 8]) {
  const r = benchWalking(radius);
  walk.push(r);
  record(r);
  if (!asJson) console.log('  ' + ' '.repeat(40) + (r.max / FRAME_MS).toFixed(1).padStart(9) + ' frames worst case');
}

if (!asJson) {
  console.log('\n[5] View area footprint (voxel data only, before geometry)');
  for (const radius of [4, 6, 8, 12, 16]) {
    const v = viewArea(radius);
    console.log('  radius ' + String(radius).padStart(2)
      + '  ' + v.side + 'x' + v.side + ' = ' + String(v.chunks).padStart(4) + ' chunks'
      + '   ' + (v.voxels / 1e6).toFixed(1).padStart(6) + 'M voxels'
      + '   ' + v.mb.toFixed(1).padStart(6) + ' MB');
  }
  console.log('');
}

if (asJson) {
  console.log(JSON.stringify({
    frameBudgetMs: FRAME_MS,
    getVoxelNsPerCall: voxelBench.perCall,
    generate16ChunksMs: results.find(r => r.label.startsWith('generate'))?.median,
    meshPerChunkMs: meshBench.perChunk,
    meshStats: { opaque: stats.opaque, transparent: stats.transparent, water: stats.water, light: stats.light },
    walk: walk.map(r => ({ radius: Number(r.label.match(/\d+/)[0]), medianMs: r.median, worstMs: r.max })),
    viewAreas: [4, 6, 8, 12, 16].map(viewArea),
  }, null, 2));
}
