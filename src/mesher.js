import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from './world.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createBlockGeometry } from './blockGeometry.js';
import { lavaCornerHeight, waterCornerHeight, waterCurrent } from './waterGeometry.js';
import { WATER_COLORS } from './water.js';

const AO_CURVE = [0.45, 0.62, 0.82, 1.0];

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
        if (!tintCache.has(key)) tintCache.set(key, WATER_COLORS[world.getBiome(x + dx, z + dz)] || WATER_COLORS.plains);
        tint.add(tintCache.get(key));
      }
      return { depth: Math.max(0.25, depth / 4), tint: tint.multiplyScalar(0.25) };
    };

    // Helper to get voxel from world for seamless chunk borders
    const getVoxelWorld = (x, y, z) => {
      return world.getVoxel(x, y, z);
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
          if (def?.chest) {
            const state = world.game?.chestManager?.getChest(wx, wy, wz) || {};
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

          // Check all 6 faces
          const neighbors = {
            top: getVoxelWorld(wx, wy + 1, wz),
            bottom: getVoxelWorld(wx, wy - 1, wz),
            north: getVoxelWorld(wx, wy, wz + 1),
            south: getVoxelWorld(wx, wy, wz - 1),
            east: getVoxelWorld(wx + 1, wy, wz),
            west: getVoxelWorld(wx - 1, wy, wz)
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
                const s1 = isSolidBlock(getVoxelWorld(wx - 1, wy + 1, wz));
                const s2 = isSolidBlock(getVoxelWorld(wx + 1, wy + 1, wz));
                const s3 = isSolidBlock(getVoxelWorld(wx, wy + 1, wz - 1));
                const s4 = isSolidBlock(getVoxelWorld(wx, wy + 1, wz + 1));
                const c1 = isSolidBlock(getVoxelWorld(wx - 1, wy + 1, wz - 1));
                const c2 = isSolidBlock(getVoxelWorld(wx + 1, wy + 1, wz - 1));
                const c3 = isSolidBlock(getVoxelWorld(wx + 1, wy + 1, wz + 1));
                const c4 = isSolidBlock(getVoxelWorld(wx - 1, wy + 1, wz + 1));
                ao0 = vertexAO(s1, s4, c4);
                ao1 = vertexAO(s2, s4, c3);
                ao2 = vertexAO(s2, s3, c2);
                ao3 = vertexAO(s1, s3, c1);
              } else if (face === 'bottom') {
                const s1 = isSolidBlock(getVoxelWorld(wx - 1, wy - 1, wz));
                const s2 = isSolidBlock(getVoxelWorld(wx + 1, wy - 1, wz));
                const s3 = isSolidBlock(getVoxelWorld(wx, wy - 1, wz - 1));
                const s4 = isSolidBlock(getVoxelWorld(wx, wy - 1, wz + 1));
                const c1 = isSolidBlock(getVoxelWorld(wx - 1, wy - 1, wz - 1));
                const c2 = isSolidBlock(getVoxelWorld(wx + 1, wy - 1, wz - 1));
                const c3 = isSolidBlock(getVoxelWorld(wx + 1, wy - 1, wz + 1));
                const c4 = isSolidBlock(getVoxelWorld(wx - 1, wy - 1, wz + 1));
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

            const light0 = AO_CURVE[ao0];
            const light1 = AO_CURVE[ao1];
            const light2 = AO_CURVE[ao2];
            const light3 = AO_CURVE[ao3];

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
            if(!isWater)(isTransparent?trWind:opWind).push(...new Array(4).fill(blockId===BLOCKS.OAK_LEAVES?1:0));
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
