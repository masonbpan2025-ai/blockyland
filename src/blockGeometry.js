import * as THREE from 'three';
import { BLOCK_DEFS } from './blocks.js';

// Geometry is in voxel coordinates, shared by world meshes and the held item.
export function createBlockGeometry(id, textures) {
  const def = BLOCK_DEFS[id];
  const torch = def.shape === 'torch';
  const geo = new THREE.BoxGeometry(torch ? 2 / 16 : 1, torch ? 10 / 16 : 1, torch ? 2 / 16 : 1);
  geo.translate(0.5, torch ? 5 / 16 : 0.5, 0.5);
  const uv = geo.attributes.uv;
  const faces = ['east', 'west', 'top', 'bottom', 'north', 'south'];
  const emission = new Float32Array(24);
  for (let face = 0; face < 6; face++) {
    const tile = textures.getFaceUVs(id, faces[face]);
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
      emission[i] = def.light ? (torch ? (face === 2 ? 1 : face === 3 ? 0 : uv.getY(i) > tile.v0 + (tile.v1 - tile.v0) * 0.5 ? 1 : 0) : 0.8) : 0;
    }
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(72).fill(1), 3));
  geo.setAttribute('emission', new THREE.Float32BufferAttribute(emission, 1));
  return geo;
}

export function enableBlockEmission(material) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float emission; varying float vBlockEmission;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlockEmission = emission;');
    shader.fragmentShader = 'varying float vBlockEmission;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight = max(outgoingLight, diffuseColor.rgb * vBlockEmission);\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => 'voxel-emission-v1';
}
