import * as THREE from 'three';
import { redstoneGeometry } from './redstoneGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { createBedGeometry } from './bed.js';
import { createChestGeometry } from './chest.js';
import { createDoorGeometry, createTrapdoorGeometry } from './door.js';

// Geometry is in voxel coordinates, shared by world meshes and the held item.
export function createBlockGeometry(id, textures, state = {}) {
  const numericId = typeof id === 'string' ? (BLOCKS[id.toUpperCase()] ?? (id === 'chest' ? BLOCKS.CHEST : (id === 'oak_door' ? BLOCKS.OAK_DOOR : (id === 'iron_door' ? BLOCKS.IRON_DOOR : (id === 'oak_trapdoor' ? BLOCKS.OAK_TRAPDOOR : (id === 'iron_trapdoor' ? BLOCKS.IRON_TRAPDOOR : id)))))) : id;
  const def = BLOCK_DEFS[numericId] || BLOCK_DEFS[id];
  if (def?.door) {
    const isTop = Boolean(def.isTop || numericId === BLOCKS.OAK_DOOR_TOP || numericId === BLOCKS.OAK_DOOR_TOP_OPEN || numericId === BLOCKS.IRON_DOOR_TOP || numericId === BLOCKS.IRON_DOOR_TOP_OPEN);
    const facing = state.facing !== undefined ? state.facing : 3;
    const open = state.open !== undefined ? state.open : (numericId === BLOCKS.OAK_DOOR_OPEN || numericId === BLOCKS.OAK_DOOR_TOP_OPEN || numericId === BLOCKS.IRON_DOOR_OPEN || numericId === BLOCKS.IRON_DOOR_TOP_OPEN);
    const isIron = Boolean(def.isIron);
    const hinge = state.hinge || 'left';
    return createDoorGeometry(isTop, facing, open, isIron, hinge, textures);
  }
  if (def?.trapdoor) {
    const facing = state.facing !== undefined ? state.facing : 3;
    const open = state.open !== undefined ? state.open : (numericId === BLOCKS.OAK_TRAPDOOR_OPEN || numericId === BLOCKS.IRON_TRAPDOOR_OPEN);
    const isIron = Boolean(def.isIron);
    return createTrapdoorGeometry(facing, open, isIron, textures);
  }
  if (def?.redstone && numericId !== BLOCKS.REDSTONE_TORCH) return redstoneGeometry(numericId, textures, state);
  if (def?.bed || numericId === BLOCKS.RED_BED_FOOT || numericId === BLOCKS.RED_BED_HEAD) {
    const isHead = (numericId === BLOCKS.RED_BED_HEAD) || Boolean(def?.isHead);
    const dir = state.dir !== undefined ? state.dir : 3;
    return createBedGeometry(isHead, dir, textures);
  }
  if (def?.chest || numericId === BLOCKS.CHEST || id === 'chest') {
    const isDouble = Boolean(state.isDouble);
    const isLeft = Boolean(state.isLeft);
    const facing = state.facing !== undefined ? state.facing : 0;
    return createChestGeometry(isDouble, isLeft, facing, textures);
  }
  if (numericId === BLOCKS.FIRE) {
    const planes=[new THREE.PlaneGeometry(.9,1),new THREE.PlaneGeometry(.9,1)];
    planes[0].rotateY(Math.PI/4);planes[1].rotateY(-Math.PI/4);
    for(const p of planes)p.translate(.5,.5,.5);
    const geo=mergeGeometries(planes);planes.forEach(p=>p.dispose());
    const tile=textures.getFaceUVs(numericId,'all'),uv=geo.attributes.uv;
    for(let i=0;i<uv.count;i++)uv.setXY(i,THREE.MathUtils.lerp(tile.u0,tile.u1,uv.getX(i)),THREE.MathUtils.lerp(tile.v0,tile.v1,uv.getY(i)));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(24).fill(1),3));
    geo.setAttribute('emission',new THREE.Float32BufferAttribute(new Float32Array(8).fill(1),1));
    geo.setAttribute('flame',new THREE.Float32BufferAttribute(new Float32Array(8).fill(1),1));return geo;
  }
  const torch = def?.shape === 'torch';
  const geo = new THREE.BoxGeometry(torch ? 2 / 16 : 1, torch ? 10 / 16 : 1, torch ? 2 / 16 : 1);
  geo.translate(0.5, torch ? 5 / 16 : 0.5, 0.5);
  const uv = geo.attributes.uv;
  const faces = ['east', 'west', 'top', 'bottom', 'north', 'south'];
  const emission = new Float32Array(24);
  const colors = new Float32Array(72).fill(1);
  for (let face = 0; face < 6; face++) {
    const tile = textures.getFaceUVs(numericId, faces[face]);
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      let u = uv.getX(i), t = uv.getY(i);
      if (torch) {
        // Only the central two texture pixels contain the stick. The top cap
        // samples the burning head; the bottom samples the wooden base.
        u = (7 + u * 2) / 16;
        t = face === 2 ? (8 + t * 2) / 16 : face === 3 ? t * 2 / 16 : t * 10 / 16;
      }
      uv.setXY(i, THREE.MathUtils.lerp(tile.u0, tile.u1, u), THREE.MathUtils.lerp(tile.v0, tile.v1, t));
      const torchGlow = face === 2 ? 1 : face === 3 ? 0 : t > 0.5 ? 1 : 0;
      const cubeGlow = numericId === BLOCKS.LIT_FURNACE ? (face === 4 ? 0.8 : 0) : numericId === BLOCKS.ENCHANTING_TABLE ? 0.2 : 0.8;
      emission[i] = numericId === BLOCKS.REDSTONE_TORCH && state.output === 0 ? 0 : def?.light ? (torch ? torchGlow : cubeGlow) : 0;
      if (numericId === BLOCKS.OAK_LEAVES) colors.set([0.35, 0.65, 0.22], i * 3);
      if (numericId === BLOCKS.GRASS && face === 2) colors.set([0.48, 0.74, 0.31], i * 3);
    }
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('emission', new THREE.Float32BufferAttribute(emission, 1));
  geo.setAttribute('flame', new THREE.Float32BufferAttribute(new Float32Array(24), 1));
  return geo;
}

export function enableBlockEmission(material) {
  material.userData.animationTime = { value: 0 };
  material.userData.windStrength = { value: 0 };
  material.defaultAttributeValues = { ...(material.defaultAttributeValues || {}), flame: [0], wind: [0] };
  material.onBeforeCompile = shader => {
    shader.uniforms.blockTime = material.userData.animationTime;
    shader.uniforms.windStrength = material.userData.windStrength;
    shader.vertexShader = 'attribute float wind; uniform float windStrength; attribute float emission; attribute float flame; uniform float blockTime; varying float vBlockEmission;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlockEmission = emission; transformed.x += wind * windStrength * (sin(blockTime*1.5+position.x*.65+position.z*.4)*.075); transformed.z += wind * windStrength * sin(blockTime*1.1+position.x*.4)*.04; transformed.x += flame * sin(blockTime*8.0 + position.y*5.0 + position.z*3.0) * 0.045 * (0.3 + 0.7 * abs(normal.y));');
    shader.fragmentShader = 'varying float vBlockEmission;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight = max(outgoingLight, diffuseColor.rgb * vBlockEmission);\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => 'voxel-emission-wind-v3';
}
