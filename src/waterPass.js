// Draws the world in the order water needs: what lies behind the surface first, then the surface, then whatever
// is in front of it.
//
// Water used to be one transparent overlay drawn after the opaque world and BEFORE the other see-through blocks.
// That order had two visible faults. Seagrass, kelp and every other plant are see-through blocks that do not
// write depth, so they were drawn after the water and painted straight over its surface -- crisp and untinted,
// as if the water were not there. And the surface could not bend what was under it, because nothing it could
// read held the scene behind it.
//
// The order now:
//
//   1. Everything except water: terrain, plants, mobs, sky, particles. The water material is hidden for this
//      pass rather than the water meshes being moved off layer 0, so any other camera or render path in the game
//      still draws water without knowing about this module.
//   2. A copy of that colour buffer becomes the refraction texture. One GPU copy, no extra scene render.
//   3. Water (layer 1 as well as 0). It samples the copy with its normals bent, absorbs light by depth, and writes depth and
//      a stencil mark where it is drawn.
//   4. See-through things that may sit IN FRONT of the water (layer 2): leaves over a river, glass, rain. They
//      were already drawn in step 1, so they are redrawn only where the stencil says water covered them, and the
//      depth test keeps the ones behind the surface hidden. A pane of glass is never tinted twice.
//
// Steps 3 and 4 are one render call, so the whole world costs two scene traversals and one texture copy.
import * as THREE from 'three';

/** Everything except water. Three.js's default layer, so existing objects need no change. */
export const WORLD_LAYER = 0;
/** Water meshes, and nothing else. They stay on the world layer too. */
export const WATER_LAYER = 1;
/** See-through things that also have to be drawn over the water where they are in front of it. */
export const OVER_WATER_LAYER = 2;

/** The stencil value water writes where it is drawn. */
export const WATER_STENCIL = 1;

/**
 * Put a water mesh on the water layer, keeping it on the world layer for every other camera.
 * @param {THREE.Object3D} mesh
 */
export function markWater(mesh) {
  mesh.layers.enable(WATER_LAYER);
  return mesh;
}

/**
 * Let a see-through object be redrawn over the water where it is in front of it.
 *
 * The object keeps its normal layer, so it is still part of the scene the water refracts. Its material is given a
 * stencil test that is switched on only for the over-water pass -- the material is shared by every chunk, so
 * the switch is made per draw rather than by swapping materials.
 *
 * @param {THREE.Object3D} object
 */
export function markOverWater(object) {
  object.layers.enable(OVER_WATER_LAYER);
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  for (const material of materials) if (material) prepareOverWaterMaterial(material);
  return object;
}

const prepared = new WeakSet();
let overWaterPass = false;

function prepareOverWaterMaterial(material) {
  if (prepared.has(material)) return;
  prepared.add(material);
  const previous = material.onBeforeRender;
  material.stencilRef = WATER_STENCIL;
  material.stencilFunc = THREE.EqualStencilFunc;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.KeepStencilOp;
  // `stencilWrite` is the flag three.js reads to enable the stencil test at all. Off for the main pass, on for
  // the over-water pass: a state change only, so it never forces a program rebuild.
  material.onBeforeRender = function (...args) {
    material.stencilWrite = overWaterPass;
    if (previous && previous !== THREE.Material.prototype.onBeforeRender) previous.apply(this, args);
  };
}

/** Configure the water material to mark the stencil where it is drawn and to occlude what is behind it. */
export function prepareWaterMaterial(material) {
  material.stencilWrite = true;
  material.stencilRef = WATER_STENCIL;
  material.stencilFunc = THREE.AlwaysStencilFunc;
  material.stencilZPass = THREE.ReplaceStencilOp;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  // The surface is solid once it carries the refracted scene: it writes depth so the over-water pass can tell what
  // is in front of it, and it draws over nothing it should not because the refracted scene IS what is behind it.
  material.depthWrite = true;
  return material;
}

/**
 * The refraction copy: a texture the size of the target, refilled from the colour buffer once a frame.
 */
export class WaterPass {
  constructor() {
    this.size = new THREE.Vector2();
    this.texture = null;
    this.layersWorld = new THREE.Layers();
    this.layersWorld.set(WORLD_LAYER);
    this.layersWater = new THREE.Layers();
    this.layersWater.set(WATER_LAYER);
    this.layersWater.enable(OVER_WATER_LAYER);
    this.savedLayers = new THREE.Layers();
    this.frustum = new THREE.Frustum();
    this.viewProjection = new THREE.Matrix4();
    this.stats = { copies: 0, renders: 0, skipped: 0 };
  }

  /** The refraction texture for a target of this size, recreated only when the size changes. */
  ensureTexture(width, height) {
    if (this.texture && this.texture.image.width === width && this.texture.image.height === height) return this.texture;
    this.texture?.dispose();
    this.texture = new THREE.FramebufferTexture(width, height);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    return this.texture;
  }

  /**
   * Render the scene into the renderer's current target (null for the canvas), in the four steps above.
   *
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {THREE.ShaderMaterial|null} waterMaterial the shared water material; its `tRefraction`, `uResolution`,
   *   `uRefraction` and `uRefractionSRGB` uniforms are set here
   * @param {object} [options]
   * @param {Iterable<THREE.Object3D>} [options.waterMeshes] every water mesh in the scene. When given and none is in
   *   view, the frame is the first step alone: the copy and the second traversal would only draw water nobody can
   *   see, and over-water objects redraw only where water marked the stencil -- nowhere. Same picture, one render.
   */
  render(renderer, scene, camera, waterMaterial, { waterMeshes = null } = {}) {
    if (waterMeshes && !this.waterInView(camera, waterMeshes)) {
      this.savedLayers.mask = camera.layers.mask;
      camera.layers.mask = this.layersWorld.mask;
      try {
        renderer.render(scene, camera);
        this.stats.renders++;
        this.stats.skipped++;
      } finally {
        camera.layers.mask = this.savedLayers.mask;
      }
      return;
    }
    const uniforms = waterMaterial?.uniforms;
    const target = renderer.getRenderTarget();
    if (target) this.size.set(target.width, target.height);
    else renderer.getDrawingBufferSize(this.size);
    const width = Math.max(1, Math.floor(this.size.x));
    const height = Math.max(1, Math.floor(this.size.y));

    // Lights are gathered through the camera's layers too. Without this the second render would see no lights at
    // all: the water and the glass in front of it would be drawn unlit, and every lit material would rebuild its
    // program twice a frame as the light set flipped between the two renders.
    this.shareLights(scene);

    this.savedLayers.mask = camera.layers.mask;
    try {
      // 1. Everything but water.
      camera.layers.mask = this.layersWorld.mask;
      if (waterMaterial) waterMaterial.visible = false;
      try {
        renderer.render(scene, camera);
        this.stats.renders++;
      } finally {
        if (waterMaterial) waterMaterial.visible = true;
      }

      // 2. The refraction copy.
      const texture = this.ensureTexture(width, height);
      renderer.copyFramebufferToTexture(texture);
      this.stats.copies++;
      if (uniforms) {
        if (uniforms.tRefraction) uniforms.tRefraction.value = texture;
        if (uniforms.uResolution) uniforms.uResolution.value.set(width, height);
        if (uniforms.uRefraction) uniforms.uRefraction.value = 1;
        // A render target holds linear light; the canvas holds encoded sRGB, which the shader must decode.
        if (uniforms.uRefractionSRGB) uniforms.uRefractionSRGB.value = target ? 0 : 1;
      }

      // 3 and 4. Water, then the see-through things in front of it. The background is not drawn again, and the
      // buffers are not cleared, so the water is tested against the depth step 1 left.
      // Every matrix was brought up to date by step 1, so the second render does not walk the scene graph again.
      const background = scene.background;
      const autoMatrices = scene.matrixWorldAutoUpdate;
      scene.background = null;
      scene.matrixWorldAutoUpdate = false;
      overWaterPass = true;
      camera.layers.mask = this.layersWater.mask;
      try {
        renderer.render(scene, camera);
        this.stats.renders++;
      } finally {
        scene.background = background;
        scene.matrixWorldAutoUpdate = autoMatrices;
      }
    } finally {
      overWaterPass = false;
      camera.layers.mask = this.savedLayers.mask;
      // Any other render this frame (a capture, a paused frame) has no fresh copy, so it gets the translucent look.
      if (uniforms?.uRefraction) uniforms.uRefraction.value = 0;
    }
  }

  /** Is any of these water meshes visible and inside the camera's view? */
  waterInView(camera, waterMeshes) {
    camera.updateMatrixWorld();
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProjection);
    for (const mesh of waterMeshes) {
      if (!mesh || !mesh.visible || !mesh.geometry) continue;
      if (mesh.frustumCulled === false || this.frustum.intersectsObject(mesh)) return true;
    }
    return false;
  }

  /**
   * Put every light at the scene's top level on the water layers as well. The game adds its lights to the scene
   * root, so a walk over the root's children is enough and costs one property check each.
   */
  shareLights(scene) {
    const mask = (1 << WATER_LAYER) | (1 << OVER_WATER_LAYER);
    const children = scene.children;
    for (let i = 0; i < children.length; i++) {
      const object = children[i];
      if (object.isLight && (object.layers.mask & mask) !== mask) object.layers.mask |= mask;
    }
  }

  dispose() {
    this.texture?.dispose();
    this.texture = null;
  }
}
