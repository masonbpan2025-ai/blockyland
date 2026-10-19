import * as THREE from 'three';

// A packed atlas needs tile-aware sampling: ordinary trilinear/anisotropic
// filtering reads neighbouring tiles. Clamp every tap at each mip level and
// never descend below one texel per tile. Four taps bound the grazing-angle cost.
export const atlasSamplingShader = /* glsl */`
#ifdef USE_MAP
uniform vec2 blockAtlasSize;
uniform float blockAtlasGrid;
uniform float blockAtlasMaxMip;

vec4 blockAtlasLevel(vec2 uv, vec2 tile, float level) {
  vec2 halfTexel = vec2(exp2(level) * 0.5) / blockAtlasSize;
  vec2 lo = tile / blockAtlasGrid + halfTexel;
  vec2 hi = (tile + 1.0) / blockAtlasGrid - halfTexel;
  return textureLod(map, clamp(uv, lo, hi), max(level, 0.00001));
}

vec4 blockAtlasMip(vec2 uv, vec2 tile, float lod) {
  float lower = floor(lod);
  float upper = min(lower + 1.0, blockAtlasMaxMip);
  return mix(blockAtlasLevel(uv, tile, lower), blockAtlasLevel(uv, tile, upper), fract(lod));
}

vec4 sampleBlockAtlas(vec2 uv) {
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  float lx = length(dx * blockAtlasSize), ly = length(dy * blockAtlasSize);
  float major = max(lx, ly), minor = max(min(lx, ly), 0.00001);
  // Magnification keeps the original pixel art; only minification is smoothed.
  if (major <= 1.0) return textureLod(map, uv, 0.0);
  vec2 tile = clamp(floor(uv * blockAtlasGrid), vec2(0.0), vec2(blockAtlasGrid - 1.0));
  float taps = min(4.0, ceil(major / max(minor, 1.0)));
  float lod = clamp(log2(max(major / taps, minor)), 0.0, blockAtlasMaxMip);
  vec2 axis = lx >= ly ? dx : dy;
  vec4 result = vec4(0.0);
  for (int i = 0; i < 4; i++) {
    if (float(i) >= taps) break;
    vec2 offset = axis * ((float(i) + 0.5) / taps - 0.5);
    result += blockAtlasMip(uv + offset, tile, lod);
  }
  return result / taps;
}
#endif
`;

export function configureAtlasTexture(texture) {
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  // The shader implements anisotropy where samples can respect tile boundaries.
  texture.anisotropy = 1;
  return texture;
}

export function updateAtlasFiltering(manager) {
  const uniforms = manager.atlasFilteringUniforms ??= {
    blockAtlasSize: { value: new THREE.Vector2() },
    blockAtlasGrid: { value: manager.atlasGridSize },
    blockAtlasMaxMip: { value: 0 }
  };
  uniforms.blockAtlasSize.value.set(manager.atlasCanvas.width, manager.atlasCanvas.height);
  uniforms.blockAtlasGrid.value = manager.atlasGridSize;
  uniforms.blockAtlasMaxMip.value = Math.log2(manager.tileSize);
  return uniforms;
}

export function filterAtlasMaterial(material, manager) {
  const previousCompile = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  const uniforms = updateAtlasFiltering(manager);
  material.onBeforeCompile = function (shader, renderer) {
    previousCompile.call(this, shader, renderer);
    // These objects survive pack changes: Three may reuse a cached program
    // without calling onBeforeCompile again when only the map size changes.
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_pars_fragment>',
      '#include <map_pars_fragment>\n' + atlasSamplingShader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
      THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'sampleBlockAtlas( vMapUv )'));
  };
  material.customProgramCacheKey = () => `${cacheKey}|tile-safe-mips-v1`;
  return material;
}
