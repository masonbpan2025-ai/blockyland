import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// Reuse Three's maintained FXAA implementation in the existing final composite
// pass. The effects path renders to a texture, so canvas MSAA alone cannot
// smooth stair silhouettes there. No extra scene render or render target.
const source = FXAAShader.fragmentShader;
const start = source.indexOf('#define EDGE_STEP_COUNT');
const end = source.lastIndexOf('void main()');
if (start < 0 || end <= start) throw new Error('Unsupported Three.js FXAA shader');
export const edgeAntialiasFunctions = source.slice(start, end);

export const edgeAntialiasFragment = `varying vec2 vUv;
uniform sampler2D sceneColor;
uniform vec2 sceneTexel;
${edgeAntialiasFunctions}
void main() {
  gl_FragColor = ApplyFXAA(sceneColor, sceneTexel, vUv);
  #include <colorspace_fragment>
}`;
