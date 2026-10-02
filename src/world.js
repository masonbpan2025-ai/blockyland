import { BLOCKS } from './blocks.js';
import { Redstone } from './redstone.js';
import { LavaSimulation } from './lavaSimulation.js';
import { WaterSimulation } from './waterSimulation.js';
import { BIOMES, getBiomeDef } from './biomes.js';

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
    const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
    const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
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

    const grad3 = [
      [1, 1], [-1, 1], [1, -1], [-1, -1],
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [-1, 1], [0, 0], [0, 0]
    ];

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    let n0 = 0;
    if (t0 > 0) {
      t0 *= t0;
      const gi0 = this.permMod12[ii + this.perm[jj]];
      n0 = t0 * t0 * (grad3[gi0][0] * x0 + grad3[gi0][1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    let n1 = 0;
    if (t1 > 0) {
      t1 *= t1;
      const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]];
      n1 = t1 * t1 * (grad3[gi1][0] * x1 + grad3[gi1][1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    let n2 = 0;
    if (t2 > 0) {
      t2 *= t2;
      const gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]];
      n2 = t2 * t2 * (grad3[gi2][0] * x2 + grad3[gi2][1] * y2);
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

    const grad3 = [
      [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
      [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
      [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
    ];

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    let n0 = 0;
    if (t0 > 0) {
      t0 *= t0;
      const gi0 = this.permMod12[ii + this.perm[jj + this.perm[kk]]];
      n0 = t0 * t0 * (grad3[gi0][0] * x0 + grad3[gi0][1] * y0 + grad3[gi0][2] * z0);
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    let n1 = 0;
    if (t1 > 0) {
      t1 *= t1;
      const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1 + this.perm[kk + k1]]];
      n1 = t1 * t1 * (grad3[gi1][0] * x1 + grad3[gi1][1] * y1 + grad3[gi1][2] * z1);
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    let n2 = 0;
    if (t2 > 0) {
      t2 *= t2;
      const gi2 = this.permMod12[ii + i2 + this.perm[jj + j2 + this.perm[kk + k2]]];
      n2 = t2 * t2 * (grad3[gi2][0] * x2 + grad3[gi2][1] * y2 + grad3[gi2][2] * z2);
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    let n3 = 0;
    if (t3 > 0) {
      t3 *= t3;
      const gi3 = this.permMod12[ii + 1 + this.perm[jj + 1 + this.perm[kk + 1]]];
      n3 = t3 * t3 * (grad3[gi3][0] * x3 + grad3[gi3][1] * y3 + grad3[gi3][2] * z3);
    }

    return 32.0 * (n0 + n1 + n2 + n3);
  }
}

export const CHUNK_SIZE_X = 16;
export const CHUNK_SIZE_Z = 16;
export const CHUNK_HEIGHT = 64;

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.voxels = new Uint8Array(CHUNK_SIZE_X * CHUNK_HEIGHT * CHUNK_SIZE_Z);
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
    this.waterLevels[index] = 0;
    this.dirty = true;
  }
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
    this.water = new WaterSimulation(this);
    this.lava = new LavaSimulation(this);
    this.redstone = new Redstone(this);

    this.reseed(seed, selectedBiome);
  }

  reseed(seed = 4289, selectedBiome = this.selectedBiome) {
    this.seed = seed;
    this.selectedBiome = selectedBiome || 'all';
    this.noise = new FastNoise(seed);
    this.caveNoise = new FastNoise(seed + 101);
    this.biomeNoise = new FastNoise(seed + 202);
    this.detailNoise = new FastNoise(seed + 303);
    this.featureNoise = new FastNoise(seed + 404);
    this.chunks.clear();

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
  }

  switchDimension(newDim) {
    if (this.dimension === newDim) return;
    this.dimensionChunks[this.dimension] = this.chunks;
    this.dimension = newDim;
    if (!this.dimensionChunks[newDim]) {
      this.dimensionChunks[newDim] = new Map();
    }
    this.chunks = this.dimensionChunks[newDim];
    this.currentDimension = newDim;
    this.isNether = (newDim === 'nether');
    if (newDim === 'nether') {
      this.seaLevel = 14;
    } else {
      const def = getBiomeDef(this.selectedBiome);
      this.seaLevel = def.seaLevel !== undefined ? def.seaLevel : 22;
    }
  }

  chunkKey(cx, cz) {
    return `${cx},${cz}`;
  }

  getChunk(cx, cz) {
    return this.chunks.get(this.chunkKey(cx, cz));
  }

  getOrCreateChunk(cx, cz) {
    const key = this.chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      this.generateChunkTerrain(chunk);
      this.chunks.set(key, chunk);
      this.water.initChunk(chunk);
    }
    return chunk;
  }

  getBiome(wx, wz) {
    const isNetherDim = this.dimension === 'nether' || this.currentDimension === 'nether' || this.isNether || this.selectedBiome === 'nether';
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
    if (this.selectedBiome && this.selectedBiome !== 'all') {
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

  getHeight(wx, wz, biomeId) {
    const def = getBiomeDef(biomeId);
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
      if (distFromOrigin < 45) {
        return Math.floor(28 + base * 4 + detail * 2);
      }
      const islandNoise = this.noise.noise2D(wx * 0.015, wz * 0.015);
      return Math.floor(26 + islandNoise * 8 + detail * 3);
    }

    if (def.isVoid) {
      return 30;
    }

    if (def.isCavern) {
      return Math.floor(def.baseHeight + base * 6 + detail * 3);
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

  generateChunkTerrain(chunk) {
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
      if (cx === 0 && cz === 0) {
        for (let x = 4; x <= 11; x++) {
          for (let z = 4; z <= 11; z++) {
            const isCenter = (x === 7 || x === 8) && (z === 7 || z === 8);
            chunk.setVoxel(x, 30, z, isCenter ? BLOCKS.OBSIDIAN : BLOCKS.BEDROCK);
          }
        }
      }
      return;
    }

    // --- 2. SPECIAL DIMENSION: THE END ---
    if (centerDef.isEnd) {
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
          const wx = cx * CHUNK_SIZE_X + lx;
          const wz = cz * CHUNK_SIZE_Z + lz;
          const dist = Math.hypot(wx, wz);

          let hasIsland = false;
          let topY = 28;
          let botY = 18;

          if (centerBiomeId === 'the_end' && dist < 55) {
            hasIsland = true;
            topY = Math.floor(28 + Math.cos(dist * 0.05) * 4);
            botY = Math.max(14, Math.floor(20 - Math.cos(dist * 0.05) * 4));
          } else if (dist >= 60 || centerBiomeId !== 'the_end') {
            const islandMask = this.noise.noise2D(wx * 0.02, wz * 0.02);
            if (islandMask > 0.15) {
              hasIsland = true;
              topY = Math.floor(26 + islandMask * 8);
              botY = Math.max(16, Math.floor(20 - islandMask * 5));
            }
          }

          if (hasIsland) {
            for (let y = botY; y <= topY; y++) {
              chunk.setVoxel(lx, y, lz, BLOCKS.END_STONE);
            }

            // Chorus plants on outer islands
            if (dist > 60 || centerBiomeId.includes('highlands') || centerBiomeId.includes('midlands')) {
              const plantHash = Math.abs(Math.sin(wx * 43.12 + wz * 71.9));
              if (plantHash < 0.025 && topY < CHUNK_HEIGHT - 12) {
                this.generateChorusPlant(chunk, lx, topY + 1, lz);
              }
            }
          }
        }
      }

      // Obsidian pillars on central End Island
      if (centerBiomeId === 'the_end' && cx === 0 && cz === 0) {
        for (let y = 28; y <= 46; y++) {
          for (let ox = -1; ox <= 1; ox++) {
            for (let oz = -1; oz <= 1; oz++) {
              chunk.setVoxel(8 + ox, y, 8 + oz, BLOCKS.OBSIDIAN);
            }
          }
        }
        chunk.setVoxel(8, 47, 8, BLOCKS.SEA_LANTERN);
      }
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
              const oreHash = Math.abs(Math.sin(wx * 17.3 + y * 41.2 + wz * 13.7));
              if (oreHash < 0.035) {
                chunk.setVoxel(lx, y, lz, BLOCKS.GOLD_ORE); // Nether Gold Ore
              } else if (oreHash < 0.065) {
                chunk.setVoxel(lx, y, lz, BLOCKS.COAL_ORE); // Nether Quartz Ore
              }
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
            chunk.setVoxel(lx, y, lz, BLOCKS.NETHERRACK);
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
                chunk.setVoxel(lx, floorHeight + 1, lz, BLOCKS.SOUL_TORCH);
              } else if (hash < 0.065) {
                this.generateBoneFossil(chunk, lx, floorHeight + 1, lz);
              } else if (hash < 0.1) {
                this.generateBasaltPillar(chunk, lx, floorHeight + 1, lz);
              }
            } else if (bId === 'crimson_forest') {
              if (hash < 0.055) {
                this.generateNetherFungus(chunk, lx, floorHeight + 1, lz, 'crimson');
              } else if (hash < 0.12) {
                chunk.setVoxel(lx, floorHeight + 1, lz, BLOCKS.RED_MUSHROOM_BLOCK);
              }
            } else if (bId === 'warped_forest') {
              if (hash < 0.055) {
                this.generateNetherFungus(chunk, lx, floorHeight + 1, lz, 'warped');
              } else if (hash < 0.12) {
                chunk.setVoxel(lx, floorHeight + 1, lz, BLOCKS.BROWN_MUSHROOM_BLOCK);
              }
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
      return;
    }

    // --- 4. STANDARD & CAVE OVERWORLD GENERATION ---
    for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
        const wx = cx * CHUNK_SIZE_X + lx;
        const wz = cz * CHUNK_SIZE_Z + lz;

        const bId = this.getBiome(wx, wz);
        const def = getBiomeDef(bId);
        const height = Math.min(CHUNK_HEIGHT - 6, Math.max(4, this.getHeight(wx, wz, bId)));

        // Bedrock layer
        chunk.setVoxel(lx, 0, lz, BLOCKS.BEDROCK);

        // Stone & underground strata
        for (let y = 1; y <= height; y++) {
          // 3D Cave carving: preserve solid surface crust
          const isCave = !def.isCavern && y < height - 6 && y > 3 && this.caveNoise.noise3D(wx * 0.05, y * 0.07, wz * 0.05) > 0.58;
          if (isCave) continue;

          if (y === height) {
            // Surface block
            let surf = def.surfaceBlock || BLOCKS.GRASS;
            if (def.isJagged && y > 42) surf = BLOCKS.SNOW;
            else if (height <= this.seaLevel + 1 && def.category === 'offshore') surf = BLOCKS.SAND;
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
              chunk.setVoxel(lx, y, lz, def.subsurfaceBlock || BLOCKS.DIRT);
            }
          } else {
            // Deep underground stone / ores
            let block = def.deepBlock || BLOCKS.STONE;
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
        }

        // Surface flora and decorations
        if (height >= this.seaLevel && height < CHUNK_HEIGHT - 10) {
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

    // --- 5. BIOME TREES & GIANT VEGETATION ---
    for (let lx = 3; lx < CHUNK_SIZE_X - 3; lx += 4) {
      for (let lz = 3; lz < CHUNK_SIZE_Z - 3; lz += 4) {
        const wx = cx * CHUNK_SIZE_X + lx;
        const wz = cz * CHUNK_SIZE_Z + lz;
        const bId = this.getBiome(wx, wz);
        const def = getBiomeDef(bId);

        if (def.treeDensity <= 0 || def.treeType === 'none') continue;

        const hash = Math.abs(Math.sin(wx * 91.23 + wz * 43.12 + this.seed * 0.01));
        if (hash < def.treeDensity) {
          const height = this.getHeight(wx, wz, bId);
          if (height >= this.seaLevel && height < CHUNK_HEIGHT - 12) {
            this.generateTree(chunk, lx, height + 1, lz, def.treeType);
          }
        }
      }
    }

    // --- 6. VILLAGE GENERATION IN CHUNK (0, 0) ---
    // Civilised Overworld biomes get a starting village
    const allowsVillage = centerDef.dimension === 'overworld' &&
      !centerDef.isCavern &&
      !centerDef.isVoid &&
      centerDef.category !== 'offshore';

    if (cx === 0 && cz === 0 && allowsVillage) {
      this.generateVillage(chunk);
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
        this.generateHugeMushroom(chunk, lx, baseY, lz, Math.random() > 0.5 ? 'red' : 'brown');
        break;
      case 'ice_spike':
        this.generateIceSpike(chunk, lx, baseY, lz);
        break;
      case 'oak_and_birch':
        if (Math.random() < 0.4) this.generateBirchTree(chunk, lx, baseY, lz);
        else this.generateOakTree(chunk, lx, baseY, lz);
        break;
      case 'spruce_and_oak':
        if (Math.random() < 0.5) this.generateSpruceTree(chunk, lx, baseY, lz);
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
              if (isSnowy && y + 1 < CHUNK_HEIGHT) chunk.setVoxel(x, y + 1, z, BLOCKS.SNOW);
            }
          }
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
          const h = 4 + Math.floor(Math.random() * 5);
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
    const stemHeight = 4 + Math.floor(Math.random() * 3);
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
            chunk.setVoxel(x, capY, z, BLOCKS.GLOWSTONE); // Embedded shroomlight
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
    const spikeHeight = 12 + Math.floor(Math.random() * 12);
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
    const h = 4 + Math.floor(Math.random() * 4);
    for (let y = 0; y < h; y++) {
      if (baseY + y < CHUNK_HEIGHT) {
        chunk.setVoxel(lx, baseY + y, lz, y === h - 1 ? BLOCKS.CHORUS_FLOWER : BLOCKS.CHORUS_PLANT);
      }
    }
  }

  generateBasaltPillar(chunk, lx, baseY, lz) {
    const h = 5 + Math.floor(Math.random() * 6);
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
    const cx = Math.floor(wx / CHUNK_SIZE_X);
    const cz = Math.floor(wz / CHUNK_SIZE_Z);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return BLOCKS.AIR;

    const lx = ((wx % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
    const lz = ((wz % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z;
    return chunk.getVoxel(lx, wy, lz);
  }

  getHighestSolidY(wx, wz) {
    const cx = Math.floor(wx / CHUNK_SIZE_X);
    const cz = Math.floor(wz / CHUNK_SIZE_Z);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return 0;

    const lx = ((wx % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
    const lz = ((wz % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z;

    const isNetherCavern = this.isNether || this.dimension === 'nether' || getBiomeDef(this.selectedBiome)?.isNether;
    if (isNetherCavern) {
      // Find cavern air space beneath bedrock ceiling (below y=62), then find solid floor under that air space
      let foundAir = false;
      for (let y = CHUNK_HEIGHT - 2; y >= 1; y--) {
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
    const chunk = this.getChunk(Math.floor(wx / 16), Math.floor(wz / 16));
    if (!chunk) return -1;
    return chunk.waterLevels[chunk.getIndex(((wx % 16) + 16) % 16, wy, ((wz % 16) + 16) % 16)];
  }

  getWaterLevel(wx, wy, wz) {
    if (this.getVoxel(wx, wy, wz) !== BLOCKS.WATER) return -1;
    const chunk = this.getChunk(Math.floor(wx / 16), Math.floor(wz / 16));
    if (!chunk) return -1;
    return chunk.waterLevels[chunk.getIndex(((wx % 16) + 16) % 16, wy, ((wz % 16) + 16) % 16)];
  }

  setVoxel(wx, wy, wz, blockId, waterLevel = 0, fluidUpdate = false) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return;
    const cx = Math.floor(wx / CHUNK_SIZE_X);
    const cz = Math.floor(wz / CHUNK_SIZE_Z);
    const chunk = this.getOrCreateChunk(cx, cz);

    const lx = ((wx % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
    const lz = ((wz % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z;
    const level = (blockId === BLOCKS.WATER || blockId === BLOCKS.LAVA) ? Math.max(0, Math.min(8, waterLevel)) : 0;
    const index = chunk.getIndex(lx, wy, lz);
    if (chunk.voxels[index] === blockId && chunk.waterLevels[index] === level) return;
    chunk.setVoxel(lx, wy, lz, blockId);
    chunk.waterLevels[index] = level;
    this.water.notify(wx, wy, wz, !fluidUpdate);
    this.lava.notify(wx, wy, wz, !fluidUpdate);
    this.redstone.notify(wx, wy, wz);

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
  }
}
