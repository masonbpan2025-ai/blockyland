// Deterministic CPU/geometry benchmark: node scripts/bench-reef.mjs
import { performance } from 'node:perf_hooks';
import { World, CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../src/world.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { ChunkMesher } from '../src/mesher.js';
import { ChunkMesher as BeforeMesher } from '../tests/fixtures/reefBefore/mesher.js';
import { WaterSimulation as BeforeWater } from '../tests/fixtures/reefBefore/waterSimulation.js';
import { applyPresetFixture } from '../tests/helpers/presetGenerationFixture.js';

let cleanup;
applyPresetFixture({ after: fn => { cleanup = fn; } }, 'reef_life');
const tex = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };
const rounds = [];
try {
  for (let round = 0; round < 7; round++) for (const before of round % 2 ? [false, true] : [true, false]) {
    const world = new World(12345, 'warm_ocean');
    if (before) {
      world.water = new BeforeWater(world);
      world.getWaterLevel = function(x, y, z) {
        if (this.getVoxel(x, y, z) !== BLOCKS.WATER) return -1;
        const c = this.getChunk(Math.floor(x / CHUNK_SIZE_X), Math.floor(z / CHUNK_SIZE_Z));
        return c ? c.waterLevels[c.getIndex(x & 15, y, z & 15)] : -1;
      };
    }
    const t = performance.now();
    for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) world.getOrCreateChunk(cx, cz);
    const generationMs = performance.now() - t;
    const plants = [];
    for (const chunk of world.chunks.values()) for (let i = 0; i < chunk.voxels.length; i++) {
      if (BLOCK_DEFS[chunk.voxels[i]]?.waterPlant) plants.push([chunk, i, chunk.voxels[i]]);
      chunk.dirty = false;
    }
    let triangles = 0, waterTriangles = 0;
    const mesher = before ? new BeforeMesher(tex) : new ChunkMesher(tex);
    const m = performance.now();
    for (const chunk of world.chunks.values()) {
      const geometry = mesher.meshChunk(chunk, world);
      for (const [name, geo] of Object.entries(geometry)) if (geo) {
        const count = (geo.index?.count || geo.attributes.position.count) / 3;
        triangles += count; if (name === 'waterGeo') waterTriangles += count;
        geo.dispose();
      }
    }
    const meshMs = performance.now() - m;
    const initialPending = world.water.pending.size;
    const w = performance.now();
    let changes = 0;
    for (let i = 0; i < 40; i++) changes += world.water.tick();
    rounds.push({ version: before ? 'before' : 'after', warmup: round < 2, generationMs, meshMs, waterMs: performance.now() - w, triangles, waterTriangles,
      initialPending, changes, pending: world.water.pending.size, plants: plants.length,
      lostPlants: plants.filter(([c, i, id]) => c.voxels[i] !== id).length,
      dirtyChunks: [...world.chunks.values()].filter(c => c.dirty).length });
  }
  console.log(JSON.stringify({ seed: 12345, biome: 'warm_ocean', preset: 'reef_life', chunks: 25,
    rounds, medians: Object.fromEntries(['before', 'after'].map(version => {
      const values = rounds.filter(r => !r.warmup && r.version === version);
      return [version, Object.fromEntries(Object.keys(values[0]).filter(k => typeof values[0][k] === 'number')
        .map(k => [k, values.map(r => r[k]).sort((a,b)=>a-b)[2]]))];
    })) }, null, 2));
} finally { cleanup?.(); }
