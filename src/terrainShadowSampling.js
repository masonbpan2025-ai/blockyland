import { ShaderChunk } from 'three';

// PCF samples different positions on a receiver plane. Comparing every tap
// against the CENTER depth mistakes the plane's own slope for an occluder:
// stripes crawl across sand/snow as the sun moves. Follow the plane depth at
// each tap, with only a one-texel allowance for hardware's 2x2 filtering.
// This is shading only; foliage's wind weights and geometry stay unchanged.
export function terrainShadowChunk(source = ShaderChunk.shadowmap_pars_fragment) {
  const depthMarker = 'shadowCoord.z += shadowBias;';
  if (!source.includes(depthMarker)) throw new Error('Unsupported Three.js shadow sampling chunk');
  let chunk = source.replace(depthMarker, `${depthMarker}
    vec3 receiverDx = dFdx(shadowCoord.xyz);
    vec3 receiverDy = dFdy(shadowCoord.xyz);
    float receiverDet = receiverDx.x * receiverDy.y - receiverDx.y * receiverDy.x;
    vec2 receiverSlope = vec2(0.0);
    if (abs(receiverDet) > 1e-12) {
      receiverSlope = vec2(
        receiverDx.z * receiverDy.y - receiverDy.z * receiverDx.y,
        receiverDy.z * receiverDx.x - receiverDx.z * receiverDy.x
      ) / receiverDet;
    }
    shadowCoord.z -= dot(abs(receiverSlope), 1.0 / shadowMapSize);
  `);
  let taps = 0;
  chunk = chunk.replace(/vec3\( shadowCoord\.xy \+ (vogelDiskSample\( \d, 5, phi \) \* radius), shadowCoord\.z \)/g,
    (_, offset) => { taps++; return `vec3( shadowCoord.xy + ${offset}, shadowCoord.z + dot(receiverSlope, ${offset}) )`; });
  if (taps !== 5) throw new Error(`Unsupported Three.js PCF taps: ${taps}`);
  return chunk;
}

export const TERRAIN_SHADOW_CHUNK = terrainShadowChunk();
