import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from './world.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createBlockGeometry } from './blockGeometry.js';
import { lavaCornerHeight, waterCornerHeight, waterCurrent } from './waterGeometry.js';
import { WATER_COLORS } from './water.js';
import { isSnowSurface, snowFaceTint } from './snowShading.js';
import { occludesWholeFace } from './blockOcclusion.js';

const AO_CURVE = [0.45, 0.62, 0.82, 1.0];

// --- Padded voxel window -----------------------------------------------------
//
// Face culling needs the six neighbours of every voxel and ambient occlusion needs the eight
// neighbours of each face corner, which reach one block beyond the chunk. Reading those through
// world.getVoxel meant roughly 14 map lookups per visible face -- and for AO the same cell was
// fetched repeatedly. Copying the chunk plus a one-block border into a flat array once per mesh
// turns all of that into array indexing.
//
// The padding is 1 in x and z. In y there is no padding because getVoxel already returns air
// outside 0..CHUNK_HEIGHT-1, so the clamped index below lands on a real cell whose value is the
// air it would have returned.
const PAD_X = CHUNK_SIZE_X + 2;
const PAD_Z = CHUNK_SIZE_Z + 2;
const PAD_STRIDE_Y = PAD_X * PAD_Z;

/** Scratch buffers, reused across meshes so a mesh allocates nothing for its border. */
let borderBlocks = null;
let skyCeilings = null;

function ensureBorderBuffers() {
  if (borderBlocks) return;
  // Match Chunk.voxels: coral and newer blocks have IDs above 255. Truncating
  // them here breaks occlusion and emits thousands of hidden reef/water faces.
  borderBlocks = new Uint16Array(PAD_STRIDE_Y * CHUNK_HEIGHT);
  skyCeilings = new Int16Array(PAD_STRIDE_Y);
}

/**
 * Copy the chunk and its one-block border into the scratch buffer.
 *
 * Interior columns are copied straight out of the chunk's own typed array; only the one-block
 * ring calls world.getVoxel. No noise is evaluated here.
 */
function fillBorder(chunk, world) {
  ensureBorderBuffers();
  const cx = chunk.cx;
  const cz = chunk.cz;
  const voxels = chunk.voxels;
  skyCeilings.fill(-1);

  for (let px = 0; px < PAD_X; px++) {
    const wx = cx * CHUNK_SIZE_X + px - 1;
    const insideX = px >= 1 && px <= CHUNK_SIZE_X;
    for (let pz = 0; pz < PAD_Z; pz++) {
      const wz = cz * CHUNK_SIZE_Z + pz - 1;
      const insideZ = pz >= 1 && pz <= CHUNK_SIZE_Z;
      const columnBase = (px * PAD_Z + pz) * CHUNK_HEIGHT;

      if (insideX && insideZ) {
        // Interior column: one bulk typed-array copy straight out of the chunk's own storage.
        // The chunk's index layout is (y * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx, so a column is
        // strided rather than contiguous; copying y-by-y is the cheapest correct form.
        const lx = px - 1;
        const lz = pz - 1;
        const columnStride = CHUNK_SIZE_X * CHUNK_SIZE_Z;
        const src = lz * CHUNK_SIZE_X + lx;
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          const id = voxels[y * columnStride + src];
          borderBlocks[columnBase + y] = id;
          const def = BLOCK_DEFS[id];
          if (id !== BLOCKS.AIR && def?.solid !== false && !def?.transparent && !def?.plant) skyCeilings[px * PAD_Z + pz] = y;
        }
      } else {
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          const id = world.getVoxel(wx, y, wz);
          borderBlocks[columnBase + y] = id === undefined ? 0 : id;
          const def = BLOCK_DEFS[id];
          if (id && def?.solid !== false && !def?.transparent && !def?.plant) skyCeilings[px * PAD_Z + pz] = y;
        }
      }
    }
  }
}

/** Voxel from the padded window. Out-of-range y is real air, which is what getVoxel returned. */
function padGet(x, y, z) {
  if (y < 0 || y >= CHUNK_HEIGHT) return BLOCKS.AIR;
  const px = x + 1;
  const pz = z + 1;
  if (px < 0 || px >= PAD_X || pz < 0 || pz >= PAD_Z) return BLOCKS.AIR;
  return borderBlocks[(px * PAD_Z + pz) * CHUNK_HEIGHT + y];
}

function faceSkyExposure(x, y, z, nx, ny, nz, ceilings) {
  const column = (x + nx + 1) * PAD_Z + z + nz + 1;
  return y + ny > ceilings[column] ? 1 : 0;
}

/**
 * Biome of a column, in world coordinates.
 *
 * Deliberately NOT cached here. An earlier version cached this per padded chunk column in a
 * module-level array and it produced mismatched water tint across a chunk seam: the two chunks
 * either side of the seam disagreed about the same shared column. The cost is irrelevant anyway,
 * because the only caller (water tinting) already memoises by world column for the duration of a
 * mesh -- a whole chunk's water surface asks for each column once.
 */
function biomeAt(world, wx, wz) {
  return typeof world.getBiome === 'function' ? world.getBiome(wx, wz) : null;
}


// Vertex AO calculation: returns 0..3 based on solid neighbors
function vertexAO(side1, side2, corner) {
  if (side1 && side2) return 0;
  return 3 - (side1 + side2 + corner);
}

function isSolidBlock(blockId) {
  if (blockId === BLOCKS.AIR || blockId === BLOCKS.WATER) return 0;
  const def = BLOCK_DEFS[blockId];
  return (def && def.solid !== false && !def.plant) ? 1 : 0;
}

// --- Static per-face geometry tables -----------------------------------------
//
// The inner loop used to build, for every visible face, a 4-element array of [x,y,z] corner
// triples, a normal array, and an array of the eight ambient-occlusion sample offsets -- plus a
// closure (`addFace`) per voxel. A profiled chunk spends ~30% of its time in meshChunk and ~14% in
// addFace, with garbage collection at 5.5%. All of that per-face data is constant, so it lives in
// tables here and is read rather than rebuilt.
//
// Corner order for each face is exactly the order the previous code pushed them, and the UVs are
// emitted in the same sequence, so the vertex stream is unchanged.

/** Normal per face. */
const FACE_NORMAL = [
  [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0],
];

/**
 * Corner offsets per face, as flat triples relative to the block's minimum corner.
 *
 * The previous code derived the y extremes from `topY`/`botY` and the horizontal extremes from
 * `northZ`/`southZ`/`eastX`/`westX`, which are all `wy`/`wy+1`/`wz`/`wz+1` except for water
 * against glass. Those special cases are applied at write time by WET_FACE_HEIGHT below, so the
 * table holds the plain cube.
 */
const FACE_CORNERS = [
  // top (+Y): (0,1,1) (1,1,1) (1,1,0) (0,1,0)
  [0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0],
  // bottom (-Y): (0,0,0) (1,0,0) (1,0,1) (0,0,1)
  [0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1],
  // north (+Z): (0,0,1) (1,0,1) (1,1,1) (0,1,1)
  [0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1],
  // south (-Z): (1,0,0) (0,0,0) (0,1,0) (1,1,0)
  [1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0],
  // east (+X): (1,0,1) (1,0,0) (1,1,0) (1,1,1)
  [1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1],
  // west (-X): (0,0,0) (0,0,1) (0,1,1) (0,1,0)
  [0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0],
];

/**
 * Ambient-occlusion sample offsets per face per vertex, as (side1, side2, corner) triples.
 *
 * Only the top and bottom faces participate in this engine's AO; the four side faces keep the
 * default 3, which is what `vertexAO`'s callers previously produced by leaving ao at 3. Each entry
 * is two [dx,dy,dz] sides followed by the corner, flattened to 9 numbers per vertex.
 */
const AO_OFFSETS = {
  // top (+Y). Order matches s1,s2,s3,s4 and c1..c4 in the original.
  top: [
    -1, 1, 0, 0, 1, 1, -1, 1, 1,   // vertex 0: s1, s4, c4
    1, 1, 0, 0, 1, 1, 1, 1, 1,      // vertex 1: s2, s4, c3
    1, 1, 0, 0, 1, -1, 1, 1, -1,    // vertex 2: s2, s3, c2
    -1, 1, 0, 0, 1, -1, -1, 1, -1,  // vertex 3: s1, s3, c1
  ],
  // bottom (-Y). Vertex order s1,s3,c1 / s2,s3,c2 / s2,s4,c3 / s1,s4,c4.
  bottom: [
    -1, -1, 0, 0, -1, -1, -1, -1, -1,
    1, -1, 0, 0, -1, -1, 1, -1, -1,
    1, -1, 0, 0, -1, 1, 1, -1, 1,
    -1, -1, 0, 0, -1, 1, -1, -1, 1,
  ],
};

/** Face names in the order the constants below are indexed. */
const FACE_NAMES = ['top', 'bottom', 'north', 'south', 'east', 'west'];
const FACES = FACE_NAMES;



export class ChunkMesher {
  constructor(textureManager) {
    this.tm = textureManager;
  }

  meshChunk(chunk, world) {
    // Non-resumable path: drive the generator to completion in one call, which is what every
    // existing caller and test uses. The work is identical either way.
    const state = this.beginChunkMesh(chunk, world);
    let step = state.next();
    while (!step.done) step = state.next();
    return step.value;
  }

  /**
   * Start a mesh that can be suspended and resumed between columns.
   *
   * Why this exists. Generation and meshing were atomic per chunk, so the worst frame was
   * `budget + longest single chunk` -- measured p99 16.5ms and max 38.9ms against a 16.7ms frame.
   * No amount of pre-checking can bound a frame below the cost of one indivisible chunk, which is
   * why the streaming budget could not be a hard bound. Yielding per column makes a chunk
   * interruptible, so the real bound becomes the budget plus one column.
   *
   * Usage:
   *   const it = mesher.beginChunkMesh(chunk, world);
   *   ... loop { const r = it.next(); if (r.done) return r.value; } until out of time
   *   ... next frame, keep calling it.next() on the same iterator
   *
   * @returns {Generator<void, {opaqueGeo, transparentGeo, waterGeo, lightGeo}>}
   */
  beginChunkMesh(chunk, world) {
    return this.#buildChunkMesh(chunk, world, true);
  }

  *#buildChunkMesh(chunk, world, resumable) {
    // Resolve model coverage once per block type, not six times per voxel.
    // Snapshot each build so a resumed mesh keeps its own table and newly
    // registered mod definitions are picked up by the next build.
    const faceOcclusion = new Uint8Array(65536);
    for (const id in BLOCK_DEFS) faceOcclusion[id] = occludesWholeFace(BLOCK_DEFS[id]) ? 1 : 0;
    const lightGeometries = [];
    const lightSources = [];
    const cx = chunk.cx;
    const cz = chunk.cz;
    const worldOffsetX = cx * CHUNK_SIZE_X;
    const worldOffsetZ = cz * CHUNK_SIZE_Z;

    // Buffers for opaque blocks
    const opPos = [];
    const opNorm = [];
    const opUv = [];
    const opCol = [];
    const opWind = [];
    const opSnow = [];
    const opIdx = [];
    let opVertCount = 0;

    // Buffers for transparent blocks (glass, leaves, plants)
    const trPos = [];
    const trNorm = [];
    const trUv = [];
    const trCol = [];
    const trWind = [];
    const trSnow = [];
    const trIdx = [];
    let trVertCount = 0;

    // Buffers for water
    const wtPos = [];
    const wtNorm = [];
    const wtUv = [];
    const wtCol = [];
    const wtIdx = [];
    const wtDepth = [];
    const wtFlow = [];
    let wtVertCount = 0;
    // Reusable per-voxel neighbour scratch, so the hot loop allocates nothing.
    const neighbors = new Int32Array(6);
    const depthCache = new Map();
    const tintCache = new Map();
    const cornerCache = new Map();
    const flowCache = new Map();

    // Copy the chunk and its border once. Everything the inner loop needs is then a flat array
    // read rather than a world lookup.
    fillBorder(chunk, world);
    const snowSkyCeilings = skyCeilings.slice();

    // Column depth for water corner heights. Keys stay in WORLD coordinates so the two sides of a
    // chunk seam agree on the depth of the shared column.
    const columnDepth = (x, y, z) => {
      const key = `${x},${y},${z}`;
      if (depthCache.has(key)) return depthCache.get(key);
      let depth = 0;
      while (depth < 24 && y - depth >= 0 && world.getVoxel(x, y - depth, z) === BLOCKS.WATER) depth++;
      depthCache.set(key, depth);
      return depth;
    };
    // Shared world-coordinate corners produce matching depth/tint on both sides of a chunk seam.
    const waterCorner = (x, y, z) => {
      const cornerKey = `${x},${y},${z}`;
      if (cornerCache.has(cornerKey)) return cornerCache.get(cornerKey);
      let depth = 0;
      const tint = new THREE.Color(0, 0, 0);
      for (let dx = -1; dx <= 0; dx++) for (let dz = -1; dz <= 0; dz++) {
        depth += columnDepth(x + dx, y, z + dz);
        const key = `${x + dx},${z + dz}`;
        if (!tintCache.has(key)) {
          tintCache.set(key, WATER_COLORS[biomeAt(world, x + dx, z + dz)] || WATER_COLORS.plains);
        }
        tint.add(tintCache.get(key));
      }
      const result = { depth: Math.max(0.25, depth / 4), tint: tint.multiplyScalar(0.25), height: null };
      cornerCache.set(cornerKey, result);
      return result;
    };
    const cachedCurrent = (x, y, z) => {
      const key = `${x},${y},${z}`;
      if (!flowCache.has(key)) flowCache.set(key, waterCurrent(world, x, y, z));
      return flowCache.get(key);
    };

    for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
      // A resumable build yields once per column (x slice), which is the unit the streamer
      // time-slices on. `yield` is only legal directly inside the generator body, not inside the
      // closures above, which is why the yield sits here rather than deeper in.
      if (resumable) yield lx;
      for (let ly = 0; ly < CHUNK_HEIGHT; ly++) {
        for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
          const blockId = chunk.getVoxel(lx, ly, lz);
          if (blockId === BLOCKS.AIR) continue;

          const def = BLOCK_DEFS[blockId];
          const isWater = blockId === BLOCKS.WATER;
          const isPlant = def && def.plant;
          const isTransparent = def && (def.transparent || isPlant);

          const wx = worldOffsetX + lx;
          const wy = ly;
          const wz = worldOffsetZ + lz;

          // Partial-cube shapes -- slabs, panes, carpets -- cannot use the plain-cube fast path, so
          // they are routed through createBlockGeometry. An unrecognised shape falls through to the
          // fast path and is drawn full size, which for any of these looks like a rendering bug
          // rather than a missing feature.
          if (def?.slab || def?.pane || def?.carpet || def?.stair || def?.candle || def?.chain || def?.fence || def?.wall || def?.pressurePlate || def?.button || def?.fenceGate || def?.banner || def?.hangingSign || def?.wallSign || def?.wallFan || def?.head || def?.wallHead || def?.sign || def?.rod || def?.rail || def?.flowerPot) {
            // A structure's stair carries its facing in `structureOrientations`; everything else here reads redstone state.
            const state = world.redstone?.state([wx, wy, wz]) || ((def.stair || def.slab) && world.structureOrientations?.get(`${wx},${wy},${wz}`)) || {};
            const geometry = createBlockGeometry(blockId, this.tm, state);
            if (def.snowLayer) {
              const normals = geometry.attributes.normal, exposure = new Float32Array(normals.count);
              for (let i = 0; i < normals.count; i++) exposure[i] = faceSkyExposure(lx, ly, lz, normals.getX(i), normals.getY(i), normals.getZ(i), snowSkyCeilings);
              geometry.setAttribute('snowExposure', new THREE.Float32BufferAttribute(exposure, 1));
            } else geometry.setAttribute('snowExposure', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count), 1));
            geometry.translate(wx, wy, wz);
            const origin = new Float32Array(geometry.attributes.position.count * 3);
            for (let i = 0; i < origin.length; i += 3) origin.set([wx + 0.5, wy + 0.5, wz + 0.5], i);
            geometry.setAttribute('lightOrigin', new THREE.Float32BufferAttribute(origin, 3));
            lightGeometries.push(geometry);
            // A shaped emitter reaches this branch and used to `continue` straight past the emissive branch
            // below, so its light was never registered: the light manager had no source for an end rod, and
            // the emitting-block sweep had nothing to read. Candles and lanterns come through here too.
            if (def.light) {
              lightSources.push({ position: new THREE.Vector3(wx + 0.5, wy + (def.shape === 'torch' ? 0.7 : 0.5), wz + 0.5), level: def.light, color: def.lightColor || 0xffc477 });
            }
            continue;
          }
          if (def?.door) {
            const doorMgr = world.game?.doorManager || this.game?.doorManager || world.doorManager;
            const state = doorMgr?.getDoor(wx, wy, wz) || {};
            const geometry = createBlockGeometry(blockId, this.tm, state);
            geometry.translate(wx, wy, wz);
            const origin = new Float32Array(geometry.attributes.position.count * 3);
            for (let i = 0; i < origin.length; i += 3) origin.set([wx + 0.5, wy + 0.5, wz + 0.5], i);
            geometry.setAttribute('lightOrigin', new THREE.Float32BufferAttribute(origin, 3));
            lightGeometries.push(geometry);
            continue;
          }
          if (def?.trapdoor) {
            const state = world.redstone?.state([wx, wy, wz]) || {};
            const geometry = createBlockGeometry(blockId, this.tm, state);
            geometry.translate(wx, wy, wz);
            const origin = new Float32Array(geometry.attributes.position.count * 3);
            for (let i = 0; i < origin.length; i += 3) origin.set([wx + 0.5, wy + 0.5, wz + 0.5], i);
            geometry.setAttribute('lightOrigin', new THREE.Float32BufferAttribute(origin, 3));
            lightGeometries.push(geometry);
            continue;
          }
          if (def?.redstone) {
            const state=world.redstone?.state([wx,wy,wz]) || {};
            const geometry=createBlockGeometry(blockId,this.tm,state);geometry.translate(wx,wy,wz);
            const origin=new Float32Array(geometry.attributes.position.count*3);for(let i=0;i<origin.length;i+=3)origin.set([wx+.5,wy+.5,wz+.5],i);
            geometry.setAttribute('lightOrigin',new THREE.Float32BufferAttribute(origin,3));lightGeometries.push(geometry);
            const level=blockId===BLOCKS.REDSTONE_LAMP&&state.on?15:blockId===BLOCKS.REDSTONE_TORCH&&state.output?7:0;
            if(level)lightSources.push({position:new THREE.Vector3(wx+.5,wy+.5,wz+.5),level,color:blockId===BLOCKS.REDSTONE_TORCH?0xff4335:0xffc477});
            continue;
          }
          if (def?.bed) {
            const state = world.game?.bedManager?.getBed(wx, wy, wz) || {};
            const geometry = createBlockGeometry(blockId, this.tm, state);
            geometry.translate(wx, wy, wz);
            const origin = new Float32Array(geometry.attributes.position.count * 3);
            for (let i = 0; i < origin.length; i += 3) origin.set([wx + 0.5, wy + 0.5, wz + 0.5], i);
            geometry.setAttribute('lightOrigin', new THREE.Float32BufferAttribute(origin, 3));
            lightGeometries.push(geometry);
            continue;
          }
          if (def?.chest || blockId === BLOCKS.CHEST) {
            const chestMgr = world.game?.chestManager || this.game?.chestManager || world.chestManager;
            const state = chestMgr?.getChest(wx, wy, wz) || {};
            const geometry = createBlockGeometry(blockId, this.tm, state);
            geometry.translate(wx, wy, wz);
            const origin = new Float32Array(geometry.attributes.position.count * 3);
            for (let i = 0; i < origin.length; i += 3) origin.set([wx + 0.5, wy + 0.5, wz + 0.5], i);
            geometry.setAttribute('lightOrigin', new THREE.Float32BufferAttribute(origin, 3));
            lightGeometries.push(geometry);
            continue;
          }
          if (def?.light) {
            // Separate emitters so their distance-shadow material can suppress
            // self-shadowing while retaining shadows from the sun/other lamps.
            const exposed = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].some(([dx,dy,dz]) => {
              return !faceOcclusion[world.getVoxel(wx + dx, wy + dy, wz + dz)];
            });
            if (exposed) {
              const geometry = createBlockGeometry(blockId, this.tm);
              if(blockId===BLOCKS.LAVA){
                const pos=geometry.attributes.position;

                for(let i=0;i<pos.count;i++)if(pos.getY(i)>.5)pos.setY(i,lavaCornerHeight(world,wx+Math.round(pos.getX(i)),wy,wz+Math.round(pos.getZ(i))));
              }
              geometry.translate(wx, wy, wz);
              const origin = new Float32Array(geometry.attributes.position.count * 3);
              for (let i = 0; i < origin.length; i += 3) origin.set([wx + 0.5, wy + (def.shape === 'torch' ? 0.7 : 0.5), wz + 0.5], i);
              geometry.setAttribute('lightOrigin', new THREE.Float32BufferAttribute(origin, 3));
              lightGeometries.push(geometry);
              lightSources.push({ position: new THREE.Vector3(wx + 0.5, wy + (def.shape === 'torch' ? 0.7 : 0.5), wz + 0.5), level: def.light, color: def.lightColor || 0xffc477 });
            }
            continue;
          }

          // Cross-quad rendering for flowers (Poppy, Dandelion)
          if (isPlant) {
            const uv = this.tm.getFaceUVs(blockId, 'all');
            // A plant anchored to a ceiling draws downward from the block's top face, so its texture has
            // to be flipped: the artwork's top edge belongs at the ceiling, not at the floor. The quad's
            // vertex POSITIONS are unchanged -- the cell is the cell -- so this is a V swap, and the
            // winding is left alone because the quad is double-sided in effect through the second
            // crossing quad.
            const hanging = Boolean(def.hang);
            const addCrossQuad = (p1, p2, p3, p4) => {
              const baseIdx = trVertCount;
              trPos.push(...p1, ...p2, ...p3, ...p4);
              trNorm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
              if (hanging) {
                trUv.push(uv.u0, uv.v1, uv.u1, uv.v1, uv.u1, uv.v0, uv.u0, uv.v0);
              } else {
                trUv.push(uv.u0, uv.v0, uv.u1, uv.v0, uv.u1, uv.v1, uv.u0, uv.v1);
              }
              trCol.push(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
              trWind.push(0,0,1,1);
              trSnow.push(0,0,0,0);
              trIdx.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
              trVertCount += 4;
            };
            addCrossQuad([wx, wy, wz], [wx + 1, wy, wz + 1], [wx + 1, wy + 1, wz + 1], [wx, wy + 1, wz]);
            addCrossQuad([wx, wy, wz + 1], [wx + 1, wy, wz], [wx + 1, wy + 1, wz], [wx, wy + 1, wz + 1]);
            continue;
          }

          // Check all 6 faces. Sampled from the padded window in LOCAL coordinates, which is the
          // same data getVoxel(world coords) returned, without the per-call map lookup.
          //
          // A reusable array rather than a fresh {top,bottom,...} object per voxel: the object
          // literal was one allocation for every non-air voxel in the chunk.
          neighbors[0] = padGet(lx, ly + 1, lz);
          neighbors[1] = padGet(lx, ly - 1, lz);
          neighbors[2] = padGet(lx, ly, lz + 1);
          neighbors[3] = padGet(lx, ly, lz - 1);
          neighbors[4] = padGet(lx + 1, ly, lz);
          neighbors[5] = padGet(lx - 1, ly, lz);

          // Water surface height is slightly lowered (0.90) for open air top to create fluid meniscus line,
          // and slightly inset against glass to avoid coplanar z-fighting with glass panes
          const topY = isWater
            ? (neighbors[0] === BLOCKS.AIR ? (wy + 0.90) : (neighbors[0] === BLOCKS.GLASS ? (wy + 0.995) : (wy + 1)))
            : (wy + 1);
          const botY = (isWater && neighbors[1] === BLOCKS.GLASS) ? (wy + 0.005) : wy;
          const northZ = (isWater && neighbors[2] === BLOCKS.GLASS) ? (wz + 0.995) : (wz + 1);
          const southZ = (isWater && neighbors[3] === BLOCKS.GLASS) ? (wz + 0.005) : wz;
          const eastX = (isWater && neighbors[4] === BLOCKS.GLASS) ? (wx + 0.995) : (wx + 1);
          const westX = (isWater && neighbors[5] === BLOCKS.GLASS) ? (wx + 0.005) : wx;
          const faceX = [wx, wx, northZ, southZ, eastX, westX];
          const faceZ = [wz, wz, northZ, southZ, wz, wz];
          const faceTop = [topY, botY, topY, topY, topY, topY];

          for (let face = 0; face < 6; face++) {
            const neighborId = neighbors[face];
            const nDef = BLOCK_DEFS[neighborId];

            // Culling condition
            if (isWater) {
              if (neighborId === BLOCKS.WATER || nDef?.waterPlant) continue; // cull water adjacent to water or water plants
              if (faceOcclusion[neighborId]) continue; // partial neighbours leave water visible
            } else if (isTransparent) {
              if (neighborId === blockId) continue;
              if (faceOcclusion[neighborId]) continue;
            } else {
              // Texture opacity is not shape coverage: a carpet beside a furnace
              // must never remove its entire side or bottom.
              if (faceOcclusion[neighborId]) continue;
            }

            // The texture manager keys faces by NAME ('top', 'side', 'bottom', ...), not by the
            // numeric slot this loop uses. Passing the number made every face of a block whose
            // definition has no `all` texture -- grass, every log, furnaces, sandstone and the
            // rest of the 40-odd multi-texture blocks -- miss every branch and fall through to
            // the manager's missing-texture fallback, which is why their surfaces rendered black.
            const uv = this.tm.getFaceUVs(blockId, FACE_NAMES[face]);
            const corners = FACE_CORNERS[face];
            const normal = FACE_NORMAL[face];

            // Ambient occlusion. Only the top and bottom faces participate; the sides keep 3,
            // which is what the previous code left them at.
            let ao0 = 3, ao1 = 3, ao2 = 3, ao3 = 3;
            const aoOffsets = AO_OFFSETS[FACES[face]];
            if (aoOffsets && !isWater && !isTransparent) {
              const v0 = vertexAO(
                isSolidBlock(padGet(lx + aoOffsets[0], ly + aoOffsets[1], lz + aoOffsets[2])),
                isSolidBlock(padGet(lx + aoOffsets[3], ly + aoOffsets[4], lz + aoOffsets[5])),
                isSolidBlock(padGet(lx + aoOffsets[6], ly + aoOffsets[7], lz + aoOffsets[8])));
              const v1 = vertexAO(
                isSolidBlock(padGet(lx + aoOffsets[9], ly + aoOffsets[10], lz + aoOffsets[11])),
                isSolidBlock(padGet(lx + aoOffsets[12], ly + aoOffsets[13], lz + aoOffsets[14])),
                isSolidBlock(padGet(lx + aoOffsets[15], ly + aoOffsets[16], lz + aoOffsets[17])));
              const v2 = vertexAO(
                isSolidBlock(padGet(lx + aoOffsets[18], ly + aoOffsets[19], lz + aoOffsets[20])),
                isSolidBlock(padGet(lx + aoOffsets[21], ly + aoOffsets[22], lz + aoOffsets[23])),
                isSolidBlock(padGet(lx + aoOffsets[24], ly + aoOffsets[25], lz + aoOffsets[26])));
              const v3 = vertexAO(
                isSolidBlock(padGet(lx + aoOffsets[27], ly + aoOffsets[28], lz + aoOffsets[29])),
                isSolidBlock(padGet(lx + aoOffsets[30], ly + aoOffsets[31], lz + aoOffsets[32])),
                isSolidBlock(padGet(lx + aoOffsets[33], ly + aoOffsets[34], lz + aoOffsets[35])));
              ao0 = v0; ao1 = v1; ao2 = v2; ao3 = v3;
            }

            // Biome Tinting
            let baseR = 1.0, baseG = 1.0, baseB = 1.0;
            if (blockId === BLOCKS.GRASS && face === 0) {
              baseR = 0.48; baseG = 0.74; baseB = 0.31;
            } else if (blockId === BLOCKS.OAK_LEAVES) {
              baseR = 0.35; baseG = 0.65; baseB = 0.22;
            }

            let light0 = AO_CURVE[ao0];
            let light1 = AO_CURVE[ao1];
            let light2 = AO_CURVE[ao2];
            let light3 = AO_CURVE[ao3];
            if (isSnowSurface(blockId)) {
              const tint = snowFaceTint(...normal);
              baseR *= tint[0]; baseG *= tint[1]; baseB *= tint[2];
            }
            if (def?.portal) {
              light0 = light1 = light2 = light3 = 1.0;
            }

            // Select Target Buffers
            let tPos = opPos, tNorm = opNorm, tUv = opUv, tCol = opCol, tIdx = opIdx;
            if (isWater) {
              tPos = wtPos; tNorm = wtNorm; tUv = wtUv; tCol = wtCol; tIdx = wtIdx;
            } else if (isTransparent) {
              tPos = trPos; tNorm = trNorm; tUv = trUv; tCol = trCol; tIdx = trIdx;
            }
            const vCount = isWater ? wtVertCount : (isTransparent ? trVertCount : opVertCount);

            // Wind moves foliage only; terrain and buildings stay fixed.
            const isFoliage = Boolean(def && def.name && def.name.toLowerCase().includes('leaves'));
            if (!isWater) {
              const w = isFoliage ? 1 : 0;
              (isTransparent ? trWind : opWind).push(w, w, w, w);
              const exposure = isSnowSurface(blockId) ? faceSkyExposure(lx, ly, lz, ...normal, snowSkyCeilings) : 0;
              (isTransparent ? trSnow : opSnow).push(exposure, exposure, exposure, exposure);
            }

            for (let v = 0; v < 4; v++) {
              const co = v * 3;
              const px = wx + corners[co];
              const pz = wz + corners[co + 2];
              // The corner table holds the plain cube; the original code replaced the y extremes
              // with topY/botY BEFORE deciding whether to lower a corner for water. That order
              // matters: on the top face every corner is at the top plane, so every corner gets
              // the water surface lookup, whereas testing the raw corner first would skip half of
              // them and flatten the surface.
              let py;
              if (face === 0) py = topY;
              else if (face === 1) py = botY;
              else py = (corners[co + 1] === 1 ? topY : wy);
              const corner = isWater ? waterCorner(Math.round(px), wy, Math.round(pz)) : null;
              // Water lowers only the corners sitting on the block's top plane.
              if (isWater && face !== 1 && py > wy) {
                if (corner.height === null) corner.height = waterCornerHeight(world, Math.round(px), wy, Math.round(pz));
                py = wy + corner.height;
              }
              tPos.push(px, py, pz);
              tNorm.push(normal[0], normal[1], normal[2]);
              if (isWater) {
                wtCol.push(corner.tint.r, corner.tint.g, corner.tint.b);
                wtDepth.push(corner.depth);
                // Inline rather than indexing per-face arrays of corner coordinates: those were
                // two four-element arrays allocated for every visible face.
                const vx = face === 2 || face === 3 || face === 4 ? faceX[face] + (v === 1 || v === 2 ? 1 : 0) : wx;
                const vz = face === 0 || face === 1 ? wz : faceZ[face] + (v >= 2 ? 1 : 0);
                const flow = cachedCurrent(vx, wy, vz);
                wtFlow.push(flow.x, flow.z);
              }
            }

            // Push UVs
            tUv.push(uv.u0, uv.v0, uv.u1, uv.v0, uv.u1, uv.v1, uv.u0, uv.v1);

            // Push Vertex Colors (AO * Tint)
            if (!isWater) {
              tCol.push(
                baseR * light0, baseG * light0, baseB * light0,
                baseR * light1, baseG * light1, baseB * light1,
                baseR * light2, baseG * light2, baseB * light2,
                baseR * light3, baseG * light3, baseB * light3
              );
            }

            // Push Quad Indices (flipping diagonal if AO requires smooth shading)
            if (ao0 + ao2 > ao1 + ao3) {
              tIdx.push(vCount, vCount + 1, vCount + 2, vCount, vCount + 2, vCount + 3);
            } else {
              tIdx.push(vCount + 1, vCount + 2, vCount + 3, vCount + 1, vCount + 3, vCount);
            }

            if (isWater) wtVertCount += 4;
            else if (isTransparent) trVertCount += 4;
            else opVertCount += 4;
          }
        }
      }
    }

    // Helper to create Three.js BufferGeometry
    const createGeo = (pos, norm, uv, col, idx, wind = null, snow = null) => {
      if (pos.length === 0) return null;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setAttribute('emission', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1));
      if(wind)geo.setAttribute('wind',new THREE.Float32BufferAttribute(wind,1));
      if(snow)geo.setAttribute('snowExposure',new THREE.Float32BufferAttribute(snow,1));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      return geo;
    };

    const waterGeo = createGeo(wtPos, wtNorm, wtUv, wtCol, wtIdx);
    if (waterGeo) {
      waterGeo.setAttribute('waterDepth', new THREE.Float32BufferAttribute(wtDepth, 1));
      waterGeo.setAttribute('waterFlow', new THREE.Float32BufferAttribute(wtFlow, 2));
    }
    for (const geo of lightGeometries) if (!geo.attributes.snowExposure) geo.setAttribute('snowExposure', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
    const lightGeo = lightGeometries.length ? mergeGeometries(lightGeometries) : null;
    if (lightGeo) lightGeo.userData.sources = lightSources;
    for (const geometry of lightGeometries) geometry.dispose();
    return {
      lightGeo,
      opaqueGeo: createGeo(opPos, opNorm, opUv, opCol, opIdx, opWind, opSnow),
      transparentGeo: createGeo(trPos, trNorm, trUv, trCol, trIdx, trWind, trSnow),
      waterGeo
    };
  }
}
