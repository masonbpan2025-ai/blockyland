import { BLOCKS } from './blocks.js';
import { LavaSimulation } from './lavaSimulation.js';
import { WaterSimulation } from './waterSimulation.js';

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
  constructor(seed = 4289) {
    this.seed = seed;
    this.noise = new FastNoise(seed);
    this.caveNoise = new FastNoise(seed + 101);
    this.biomeNoise = new FastNoise(seed + 202);
    this.chunks = new Map(); // key -> Chunk
    this.seaLevel = 22;
    this.water = new WaterSimulation(this);
    this.lava = new LavaSimulation(this);
  }

  reseed(seed = 4289) {
    this.seed = seed;
    this.noise = new FastNoise(seed);
    this.caveNoise = new FastNoise(seed + 101);
    this.biomeNoise = new FastNoise(seed + 202);
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
    const b = this.biomeNoise.noise2D(wx * 0.005, wz * 0.005);
    if (b < -0.2) return 'desert';
    if (b > 0.3) return 'mountains';
    if (b > 0.05) return 'forest';
    return 'plains';
  }

  getHeight(wx, wz, biome) {
    const base = this.noise.noise2D(wx * 0.015, wz * 0.015);
    const detail = this.noise.noise2D(wx * 0.05, wz * 0.05) * 0.3;

    if (biome === 'mountains') {
      const peak = Math.pow(Math.max(0, this.noise.noise2D(wx * 0.02, wz * 0.02)), 2);
      return Math.floor(28 + base * 12 + peak * 22 + detail * 6);
    } else if (biome === 'desert') {
      return Math.floor(23 + base * 4 + detail * 2);
    } else if (biome === 'forest') {
      return Math.floor(26 + base * 6 + detail * 3);
    } else {
      // plains
      return Math.floor(25 + base * 5 + detail * 2);
    }
  }

  generateChunkTerrain(chunk) {
    const cx = chunk.cx;
    const cz = chunk.cz;

    for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
        const wx = cx * CHUNK_SIZE_X + lx;
        const wz = cz * CHUNK_SIZE_Z + lz;

        const biome = this.getBiome(wx, wz);
        const height = Math.min(CHUNK_HEIGHT - 6, Math.max(5, this.getHeight(wx, wz, biome)));

        // Bedrock layer
        chunk.setVoxel(lx, 0, lz, BLOCKS.BEDROCK);

        // Stone & underground layers
        for (let y = 1; y <= height; y++) {
          // 3D Cave carving: preserve a solid surface crust (at least 6 blocks)
          const isCave = y < height - 6 && y > 3 && this.caveNoise.noise3D(wx * 0.05, y * 0.07, wz * 0.05) > 0.58;

          if (isCave) {
            continue; // air inside cave
          }

          if (y === height) {
            // Surface block
            if (biome === 'desert') {
              chunk.setVoxel(lx, y, lz, BLOCKS.SAND);
            } else if (biome === 'mountains' && y > 42) {
              chunk.setVoxel(lx, y, lz, BLOCKS.SNOW);
            } else if (height <= this.seaLevel + 1) {
              chunk.setVoxel(lx, y, lz, BLOCKS.SAND);
            } else {
              chunk.setVoxel(lx, y, lz, BLOCKS.GRASS);
            }
          } else if (y > height - 4) {
            // Subsurface dirt / sandstone
            if (biome === 'desert') {
              chunk.setVoxel(lx, y, lz, BLOCKS.SAND);
            } else {
              chunk.setVoxel(lx, y, lz, BLOCKS.DIRT);
            }
          } else {
            // Deep stone with ores
            let block = BLOCKS.STONE;
            const oreHash = Math.sin(wx * 12.9898 + y * 78.233 + wz * 43.1415) * 43758.5453;
            const oreVal = oreHash - Math.floor(oreHash);

            if (y < 14 && oreVal < 0.015) {
              block = BLOCKS.DIAMOND_ORE;
            } else if (y < 18 && oreVal < 0.025) {
              block = BLOCKS.REDSTONE_ORE;
            } else if (y < 28 && oreVal < 0.035) {
              block = BLOCKS.GOLD_ORE;
            } else if (y < 45 && oreVal < 0.065) {
              block = BLOCKS.IRON_ORE;
            } else if (oreVal < 0.1) {
              block = BLOCKS.COAL_ORE;
            }

            chunk.setVoxel(lx, y, lz, block);
          }
        }

        // Water in oceans / rivers below seaLevel
        if (height < this.seaLevel) {
          for (let y = height + 1; y <= this.seaLevel; y++) {
            chunk.setVoxel(lx, y, lz, BLOCKS.WATER);
          }
        }

        // Surface flora and decorations
        if (height >= this.seaLevel && height < CHUNK_HEIGHT - 10) {
          const plantHash = Math.abs(Math.sin(wx * 54.123 + wz * 31.987));
          if (biome === 'plains') {
            if (plantHash < 0.02) chunk.setVoxel(lx, height + 1, lz, BLOCKS.POPPY);
            else if (plantHash < 0.04) chunk.setVoxel(lx, height + 1, lz, BLOCKS.DANDELION);
          } else if (biome === 'desert') {
            if (plantHash < 0.015) {
              // 2-3 block cactus
              chunk.setVoxel(lx, height + 1, lz, BLOCKS.CACTUS);
              chunk.setVoxel(lx, height + 2, lz, BLOCKS.CACTUS);
            }
          }
        }
      }
    }

    // Trees generation
    for (let lx = 3; lx < CHUNK_SIZE_X - 3; lx += 4) {
      for (let lz = 3; lz < CHUNK_SIZE_Z - 3; lz += 4) {
        const wx = cx * CHUNK_SIZE_X + lx;
        const wz = cz * CHUNK_SIZE_Z + lz;
        const biome = this.getBiome(wx, wz);
        if (biome === 'desert') continue;

        const treeChance = (biome === 'forest') ? 0.65 : 0.18;
        const hash = Math.abs(Math.sin(wx * 91.23 + wz * 43.12));
        if (hash < treeChance) {
          const height = this.getHeight(wx, wz, biome);
          if (height >= this.seaLevel && height < CHUNK_HEIGHT - 10) {
            this.generateTree(chunk, lx, height + 1, lz);
          }
        }
      }
    }

    // Village generation in Chunk (0, 0)
    if (cx === 0 && cz === 0) {
      this.generateVillage(chunk);
    }
  }

  generateTree(chunk, lx, baseY, lz) {
    const trunkHeight = 5;
    // Trunk
    for (let y = 0; y < trunkHeight; y++) {
      chunk.setVoxel(lx, baseY + y, lz, BLOCKS.OAK_LOG);
    }

    // Leaves crown
    for (let dy = trunkHeight - 2; dy <= trunkHeight + 1; dy++) {
      const radius = dy >= trunkHeight ? 1 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && dy === trunkHeight + 1) continue;
          const x = lx + dx;
          const z = lz + dz;
          const y = baseY + dy;
          if (x >= 0 && x < CHUNK_SIZE_X && z >= 0 && z < CHUNK_SIZE_Z && y < CHUNK_HEIGHT) {
            if (chunk.getVoxel(x, y, z) === BLOCKS.AIR) {
              chunk.setVoxel(x, y, z, BLOCKS.OAK_LEAVES);
            }
          }
        }
      }
    }
  }

  generateVillage(chunk) {
    // House 1: Cozy Cobblestone & Wood Cottage at lx: 4, lz: 4
    const h1Y = 25;
    for (let x = 3; x <= 8; x++) {
      for (let z = 3; z <= 8; z++) {
        chunk.setVoxel(x, h1Y, z, BLOCKS.COBBLESTONE); // floor
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

  /**
   * Highest non-air block in a column, or 0 when the column is empty.
   *
   * Only consults already-generated chunks: it never creates one, so it is safe
   * to call from inside chunk generation without recursing.
   */
  getHighestSolidY(wx, wz) {
    const cx = Math.floor(wx / CHUNK_SIZE_X);
    const cz = Math.floor(wz / CHUNK_SIZE_Z);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return 0;

    const lx = ((wx % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
    const lz = ((wz % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z;
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      const id = chunk.getVoxel(lx, y, lz);
      if (id !== BLOCKS.AIR) return y;
    }
    return 0;
  }

  /** True when a column is free of water/lava at surface level (safe to stand on). */
  isDryColumn(wx, wz, groundY) {
    for (let y = groundY + 1; y <= Math.min(CHUNK_HEIGHT - 1, groundY + 2); y++) {
      const id = this.getVoxel(wx, y, wz);
      if (id === BLOCKS.WATER || id === BLOCKS.LAVA) return false;
    }
    return true;
  }

  /**
   * Y coordinate a player should stand at for a column: one block above the
   * highest solid block, so their feet rest on the surface rather than inside it.
   */
  getSurfaceStandY(wx, wz) {
    const ground = this.getHighestSolidY(wx, wz);
    if (ground <= 0) return 0;
    return Math.min(CHUNK_HEIGHT - 2, ground + 1);
  }

  getLavaLevel(wx, wy, wz) {
    if (this.getVoxel(wx, wy, wz) !== BLOCKS.LAVA) return -1;
    const chunk = this.getChunk(Math.floor(wx/16), Math.floor(wz/16));
    return chunk.waterLevels[chunk.getIndex(((wx%16)+16)%16,wy,((wz%16)+16)%16)];
  }

  getWaterLevel(wx, wy, wz) {
    if (this.getVoxel(wx, wy, wz) !== BLOCKS.WATER) return -1;
    const chunk = this.getChunk(Math.floor(wx / 16), Math.floor(wz / 16));
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
    // Water depth is averaged across all four columns at shared corners.
    const dx = lx === 0 ? -1 : (lx === CHUNK_SIZE_X - 1 ? 1 : 0);
    const dz = lz === 0 ? -1 : (lz === CHUNK_SIZE_Z - 1 ? 1 : 0);
    if (dx && dz) {
      const diagonal = this.getChunk(cx + dx, cz + dz);
      if (diagonal) diagonal.dirty = true;
    }
  }
}
