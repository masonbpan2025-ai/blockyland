// GENERATED -- do not edit. The mesher as it was at HEAD (before the allocation-free rewrite), kept so a performance change to the
// mesher can be measured against what it replaced. Regenerate with:
//   cmd /c "git cat-file blob <rev>:src/mesher.js > %TEMP%\mesher_src.js"
//   $env:MESHER_SOURCE="$env:TEMP\mesher_src.js"; node scripts/make-mesher-fixture.mjs
// Imported only by tests/mesherPerformance.test.js.
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from '../../src/blocks.js';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from '../../src/world.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createBlockGeometry } from '../../src/blockGeometry.js';
import { lavaCornerHeight, waterCornerHeight, waterCurrent } from '../../src/waterGeometry.js';
import { WATER_COLORS } from '../../src/water.js';

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

function ensureBorderBuffers() {
  if (borderBlocks) return;
  borderBlocks = new Uint8Array(PAD_STRIDE_Y * CHUNK_HEIGHT);
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
          borderBlocks[columnBase + y] = voxels[y * columnStride + src];
        }
      } else {
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          const id = world.getVoxel(wx, y, wz);
          borderBlocks[columnBase + y] = id === undefined ? 0 : id;
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

export class ChunkMesher {
  constructor(textureManager) {
    this.tm = textureManager;
  }

  meshChunk(chunk, world) {
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
    const opIdx = [];
    let opVertCount = 0;

    // Buffers for transparent blocks (glass, leaves, plants)
    const trPos = [];
    const trNorm = [];
    const trUv = [];
    const trCol = [];
    const trWind = [];
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
    const depthCache = new Map();
    const tintCache = new Map();

    // Copy the chunk and its border once. Everything the inner loop needs is then a flat array
    // read rather than a world lookup.
    fillBorder(chunk, world);

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
      return { depth: Math.max(0.25, depth / 4), tint: tint.multiplyScalar(0.25) };
    };

    for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
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
              const neighbor = BLOCK_DEFS[world.getVoxel(wx + dx, wy + dy, wz + dz)];
              return !neighbor || neighbor.transparent;
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
            const addCrossQuad = (p1, p2, p3, p4) => {
              const baseIdx = trVertCount;
              trPos.push(...p1, ...p2, ...p3, ...p4);
              trNorm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
              trUv.push(uv.u0, uv.v0, uv.u1, uv.v0, uv.u1, uv.v1, uv.u0, uv.v1);
              trCol.push(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
              trWind.push(0,0,1,1);
              trIdx.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
              trVertCount += 4;
            };
            addCrossQuad([wx, wy, wz], [wx + 1, wy, wz + 1], [wx + 1, wy + 1, wz + 1], [wx, wy + 1, wz]);
            addCrossQuad([wx, wy, wz + 1], [wx + 1, wy, wz], [wx + 1, wy + 1, wz], [wx, wy + 1, wz + 1]);
            continue;
          }

          // Check all 6 faces. Sampled from the padded window in LOCAL coordinates, which is the
          // same data getVoxel(world coords) returned, without the per-call map lookup.
          const neighbors = {
            top: padGet(lx, ly + 1, lz),
            bottom: padGet(lx, ly - 1, lz),
            north: padGet(lx, ly, lz + 1),
            south: padGet(lx, ly, lz - 1),
            east: padGet(lx + 1, ly, lz),
            west: padGet(lx - 1, ly, lz)
          };

          const addFace = (face, positions, normal) => {
            const neighborId = neighbors[face];
            const nDef = BLOCK_DEFS[neighborId];

            // Culling condition
            if (isWater) {
              if (neighborId === BLOCKS.WATER) return; // cull water adjacent to water
              if (nDef && !nDef.transparent) return; // cull water against solid blocks
            } else if (isTransparent) {
              if (neighborId === blockId) return;
              if (nDef && !nDef.transparent) return;
            } else {
              // Opaque block: only render face if neighbor is transparent or air
              if (neighborId !== BLOCKS.AIR && (!nDef || !nDef.transparent)) return;
            }

            if (isWater && face !== 'bottom') {
              positions = positions.map(([x,y,z]) => [x, y > wy ? wy + waterCornerHeight(world, Math.round(x), wy, Math.round(z)) : y, z]);
            }
            const uv = this.tm.getFaceUVs(blockId, face);

            // Compute Ambient Occlusion for the 4 vertices of this face
            let ao0 = 3, ao1 = 3, ao2 = 3, ao3 = 3;
            if (!isWater && !isTransparent) {
              if (face === 'top') {
                const s1 = isSolidBlock(padGet(lx - 1, ly + 1, lz));
                const s2 = isSolidBlock(padGet(lx + 1, ly + 1, lz));
                const s3 = isSolidBlock(padGet(lx, ly + 1, lz - 1));
                const s4 = isSolidBlock(padGet(lx, ly + 1, lz + 1));
                const c1 = isSolidBlock(padGet(lx - 1, ly + 1, lz - 1));
                const c2 = isSolidBlock(padGet(lx + 1, ly + 1, lz - 1));
                const c3 = isSolidBlock(padGet(lx + 1, ly + 1, lz + 1));
                const c4 = isSolidBlock(padGet(lx - 1, ly + 1, lz + 1));
                ao0 = vertexAO(s1, s4, c4);
                ao1 = vertexAO(s2, s4, c3);
                ao2 = vertexAO(s2, s3, c2);
                ao3 = vertexAO(s1, s3, c1);
              } else if (face === 'bottom') {
                const s1 = isSolidBlock(padGet(lx - 1, ly - 1, lz));
                const s2 = isSolidBlock(padGet(lx + 1, ly - 1, lz));
                const s3 = isSolidBlock(padGet(lx, ly - 1, lz - 1));
                const s4 = isSolidBlock(padGet(lx, ly - 1, lz + 1));
                const c1 = isSolidBlock(padGet(lx - 1, ly - 1, lz - 1));
                const c2 = isSolidBlock(padGet(lx + 1, ly - 1, lz - 1));
                const c3 = isSolidBlock(padGet(lx + 1, ly - 1, lz + 1));
                const c4 = isSolidBlock(padGet(lx - 1, ly - 1, lz + 1));
                ao0 = vertexAO(s1, s3, c1);
                ao1 = vertexAO(s2, s3, c2);
                ao2 = vertexAO(s2, s4, c3);
                ao3 = vertexAO(s1, s4, c4);
              }
            }

            // Biome Tinting
            let baseR = 1.0, baseG = 1.0, baseB = 1.0;
            if (blockId === BLOCKS.GRASS && face === 'top') {
              baseR = 0.48; baseG = 0.74; baseB = 0.31;
            } else if (blockId === BLOCKS.OAK_LEAVES) {
              baseR = 0.35; baseG = 0.65; baseB = 0.22;
            } else if (blockId === BLOCKS.WATER) {
              // Water shader computes vibrant azure coloring; vertex colors carry ambient light
              baseR = 1.0; baseG = 1.0; baseB = 1.0;
            }

            let light0 = AO_CURVE[ao0];
            let light1 = AO_CURVE[ao1];
            let light2 = AO_CURVE[ao2];
            let light3 = AO_CURVE[ao3];
            if (def?.portal) {
              light0 = light1 = light2 = light3 = 1.0;
            }

            // Select Target Buffers
            let tPos = opPos, tNorm = opNorm, tUv = opUv, tCol = opCol, tIdx = opIdx;
            let vCount = opVertCount;
            if (isWater) {
              tPos = wtPos; tNorm = wtNorm; tUv = wtUv; tCol = wtCol; tIdx = wtIdx;
              vCount = wtVertCount;
            } else if (isTransparent) {
              tPos = trPos; tNorm = trNorm; tUv = trUv; tCol = trCol; tIdx = trIdx;
              vCount = trVertCount;
            }

            // Wind moves foliage only; terrain and buildings stay fixed.
            const isFoliage = Boolean(def && def.name && def.name.toLowerCase().includes('leaves'));
            if(!isWater)(isTransparent?trWind:opWind).push(...new Array(4).fill(isFoliage?1:0));
            // Push Positions
            for (let i = 0; i < 4; i++) {
              tPos.push(positions[i][0], positions[i][1], positions[i][2]);
              tNorm.push(normal[0], normal[1], normal[2]);
            }

            // Push UVs
            tUv.push(
              uv.u0, uv.v0,
              uv.u1, uv.v0,
              uv.u1, uv.v1,
              uv.u0, uv.v1
            );

            // Push Vertex Colors (AO * Tint)
            if (isWater) {
              for (const position of positions) {
                const corner = waterCorner(Math.round(position[0]), wy, Math.round(position[2]));
                wtCol.push(corner.tint.r, corner.tint.g, corner.tint.b);
                wtDepth.push(corner.depth);
                const flow = waterCurrent(world, wx, wy, wz);
                wtFlow.push(flow.x, flow.z);
              }
            } else {
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
          };

          // Water surface height is slightly lowered (0.90) for open air top to create fluid meniscus line,
          // and slightly inset against glass to avoid coplanar z-fighting with glass panes
          const topY = isWater
            ? (neighbors.top === BLOCKS.AIR ? (wy + 0.90) : (neighbors.top === BLOCKS.GLASS ? (wy + 0.995) : (wy + 1)))
            : (wy + 1);
          const botY = (isWater && neighbors.bottom === BLOCKS.GLASS) ? (wy + 0.005) : wy;
          const northZ = (isWater && neighbors.north === BLOCKS.GLASS) ? (wz + 0.995) : (wz + 1);
          const southZ = (isWater && neighbors.south === BLOCKS.GLASS) ? (wz + 0.005) : wz;
          const eastX = (isWater && neighbors.east === BLOCKS.GLASS) ? (wx + 0.995) : (wx + 1);
          const westX = (isWater && neighbors.west === BLOCKS.GLASS) ? (wx + 0.005) : wx;

          // Top face (+Y)
          addFace('top', [
            [wx, topY, wz + 1],
            [wx + 1, topY, wz + 1],
            [wx + 1, topY, wz],
            [wx, topY, wz]
          ], [0, 1, 0]);

          // Bottom face (-Y)
          addFace('bottom', [
            [wx, botY, wz],
            [wx + 1, botY, wz],
            [wx + 1, botY, wz + 1],
            [wx, botY, wz + 1]
          ], [0, -1, 0]);

          // North face (+Z)
          addFace('north', [
            [wx, wy, northZ],
            [wx + 1, wy, northZ],
            [wx + 1, topY, northZ],
            [wx, topY, northZ]
          ], [0, 0, 1]);

          // South face (-Z)
          addFace('south', [
            [wx + 1, wy, southZ],
            [wx, wy, southZ],
            [wx, topY, southZ],
            [wx + 1, topY, southZ]
          ], [0, 0, -1]);

          // East face (+X)
          addFace('east', [
            [eastX, wy, wz + 1],
            [eastX, wy, wz],
            [eastX, topY, wz],
            [eastX, topY, wz + 1]
          ], [1, 0, 0]);

          // West face (-X)
          addFace('west', [
            [westX, wy, wz],
            [westX, wy, wz + 1],
            [westX, topY, wz + 1],
            [westX, topY, wz]
          ], [-1, 0, 0]);
        }
      }
    }

    // Helper to create Three.js BufferGeometry
    const createGeo = (pos, norm, uv, col, idx, wind = null) => {
      if (pos.length === 0) return null;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setAttribute('emission', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1));
      if(wind)geo.setAttribute('wind',new THREE.Float32BufferAttribute(wind,1));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      return geo;
    };

    const waterGeo = createGeo(wtPos, wtNorm, wtUv, wtCol, wtIdx);
    if (waterGeo) {
      waterGeo.setAttribute('waterDepth', new THREE.Float32BufferAttribute(wtDepth, 1));
      waterGeo.setAttribute('waterFlow', new THREE.Float32BufferAttribute(wtFlow, 2));
    }
    const lightGeo = lightGeometries.length ? mergeGeometries(lightGeometries) : null;
    if (lightGeo) lightGeo.userData.sources = lightSources;
    for (const geometry of lightGeometries) geometry.dispose();
    return {
      lightGeo,
      opaqueGeo: createGeo(opPos, opNorm, opUv, opCol, opIdx, opWind),
      transparentGeo: createGeo(trPos, trNorm, trUv, trCol, trIdx, trWind),
      waterGeo
    };
  }
}
