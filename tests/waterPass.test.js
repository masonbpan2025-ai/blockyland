// The order the world is drawn in for water: everything behind the surface, a copy, the surface, then what is in
// front of it. Driven with a recording renderer so the order, the layers and the state each render sees are
// checked without a GPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  WaterPass, markWater, markOverWater, prepareWaterMaterial,
  WORLD_LAYER, WATER_LAYER, OVER_WATER_LAYER, WATER_STENCIL,
} from '../src/waterPass.js';
import { createWaterMaterial } from '../src/water.js';

function recordingRenderer({ width = 640, height = 360, target = null } = {}) {
  const log = [];
  return {
    log,
    target,
    getRenderTarget() { return this.target; },
    getDrawingBufferSize(v) { return v.set(width, height); },
    render(scene, camera) {
      const transparent = scene.userData.transparentMaterial;
      // What a draw of the over-water material would see right now.
      transparent?.onBeforeRender?.();
      log.push({
        kind: 'render',
        mask: camera.layers.mask,
        background: scene.background,
        matrices: scene.matrixWorldAutoUpdate,
        waterVisible: scene.userData.water?.visible,
        stencilTest: transparent?.stencilWrite,
        lightMask: scene.userData.light?.layers.mask,
      });
    },
    copyFramebufferToTexture(texture) { log.push({ kind: 'copy', width: texture.image.width, height: texture.image.height }); },
  };
}

function world() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x88aaff);
  const water = prepareWaterMaterial(createWaterMaterial());
  const transparent = new THREE.MeshLambertMaterial({ transparent: true });
  const waterMesh = markWater(new THREE.Mesh(new THREE.BoxGeometry(), water));
  const leaves = markOverWater(new THREE.Mesh(new THREE.BoxGeometry(), transparent));
  const light = new THREE.PointLight();
  scene.add(waterMesh, leaves, light);
  scene.userData = { water, transparentMaterial: transparent, light };
  const camera = new THREE.PerspectiveCamera();
  return { scene, camera, water, transparent, waterMesh, leaves, light };
}

test('water meshes are on the water layer and still on the world layer, so every other camera sees them', () => {
  const { waterMesh } = world();
  assert.ok(waterMesh.layers.isEnabled(WATER_LAYER));
  assert.ok(waterMesh.layers.isEnabled(WORLD_LAYER), 'a plain render (loading screen, a mod camera) still draws water');
});

test('see-through blocks are part of the refracted world and of the over-water pass', () => {
  const { leaves } = world();
  assert.ok(leaves.layers.isEnabled(WORLD_LAYER));
  assert.ok(leaves.layers.isEnabled(OVER_WATER_LAYER));
  assert.ok(!leaves.layers.isEnabled(WATER_LAYER));
});

test('the water material marks the stencil, writes depth, and draws in a single pass', () => {
  const { water } = world();
  assert.equal(water.stencilWrite, true);
  assert.equal(water.stencilRef, WATER_STENCIL);
  assert.equal(water.stencilZPass, THREE.ReplaceStencilOp);
  assert.equal(water.depthWrite, true, 'so what is in front of it can be told from what is behind');
  assert.equal(water.forceSinglePass, true, 'never the two-pass double-sided path');
});

test('one frame is: the world without water, one copy, then water and what is in front of it', () => {
  const { scene, camera, water } = world();
  const renderer = recordingRenderer();
  new WaterPass().render(renderer, scene, camera, water);
  assert.deepEqual(renderer.log.map((e) => e.kind), ['render', 'copy', 'render'], 'two renders and one copy, never more');
  const [first, copy, second] = renderer.log;

  assert.equal(first.mask, 1 << WORLD_LAYER, 'step 1 sees the world layer');
  assert.equal(first.waterVisible, false, 'with the water hidden');
  assert.equal(first.stencilTest, false, 'and no stencil test on the see-through blocks');
  assert.equal(first.matrices, true, 'matrices are brought up to date once');

  assert.deepEqual([copy.width, copy.height], [640, 360], 'the copy is the size of the target');

  assert.equal(second.mask, (1 << WATER_LAYER) | (1 << OVER_WATER_LAYER), 'step 3 sees water and the over-water set');
  assert.equal(second.waterVisible, true);
  assert.equal(second.background, null, 'the sky is not drawn over the world a second time');
  assert.equal(second.matrices, false, 'and the scene graph is not walked for matrices again');
  assert.equal(second.stencilTest, true, 'see-through blocks are limited to where water was drawn');
});

test('the lights reach the second render, so the surface is lit and no program is rebuilt per frame', () => {
  const { scene, camera, water, light } = world();
  const renderer = recordingRenderer();
  new WaterPass().render(renderer, scene, camera, water);
  const second = renderer.log[2];
  assert.ok((second.lightMask & second.mask) !== 0, 'the light is on a layer the second render sees');
  assert.ok(light.layers.isEnabled(WORLD_LAYER), 'and still lights the world');
});

test('the frame leaves the camera, the scene and the water exactly as it found them', () => {
  const { scene, camera, water, transparent } = world();
  camera.layers.enable(5);
  const mask = camera.layers.mask;
  const background = scene.background;
  new WaterPass().render(recordingRenderer(), scene, camera, water);
  assert.equal(camera.layers.mask, mask, 'camera layers restored');
  assert.equal(scene.background, background, 'background restored');
  assert.equal(scene.matrixWorldAutoUpdate, true, 'matrix updates restored');
  assert.equal(water.visible, true, 'water visible again');
  transparent.onBeforeRender();
  assert.equal(transparent.stencilWrite, false, 'the stencil test is off outside the pass');
  assert.equal(water.uniforms.uRefraction.value, 0, 'a later render with no fresh copy gets the translucent look');
});

test('a failing render still restores everything', () => {
  const { scene, camera, water } = world();
  const renderer = recordingRenderer();
  renderer.copyFramebufferToTexture = () => { throw new Error('no copy on this driver'); };
  const mask = camera.layers.mask;
  assert.throws(() => new WaterPass().render(renderer, scene, camera, water), /no copy/);
  assert.equal(camera.layers.mask, mask);
  assert.equal(water.visible, true);
  assert.notEqual(scene.background, null);
});

test('the refraction copy is fed to the water, and says which colour space it holds', () => {
  const { scene, camera, water } = world();
  const pass = new WaterPass();
  let seen = null;
  const renderer = recordingRenderer({ width: 800, height: 450 });
  const render = renderer.render.bind(renderer);
  renderer.render = (s, c) => { if (renderer.log.length === 2) seen = { ...water.uniforms.uRefraction, tex: water.uniforms.tRefraction.value, res: water.uniforms.uResolution.value.clone(), srgb: water.uniforms.uRefractionSRGB.value }; render(s, c); };
  pass.render(renderer, scene, camera, water);
  assert.equal(seen.value, 1, 'refraction on while the water draws');
  assert.equal(seen.tex, pass.texture);
  assert.deepEqual([seen.res.x, seen.res.y], [800, 450]);
  assert.equal(seen.srgb, 1, 'the canvas holds encoded sRGB');

  const target = new THREE.WebGLRenderTarget(320, 180);
  const off = recordingRenderer({ target });
  const offRender = off.render.bind(off);
  let srgb = null;
  off.render = (s, c) => { if (off.log.length === 2) srgb = water.uniforms.uRefractionSRGB.value; offRender(s, c); };
  pass.render(off, scene, camera, water);
  assert.equal(srgb, 0, 'a render target holds linear light');
  assert.deepEqual([off.log[1].width, off.log[1].height], [320, 180], 'the copy follows the target size');
});

test('the copy texture is reused while the size holds and replaced when it changes', () => {
  const { scene, camera, water } = world();
  const pass = new WaterPass();
  pass.render(recordingRenderer({ width: 640, height: 360 }), scene, camera, water);
  const first = pass.texture;
  pass.render(recordingRenderer({ width: 640, height: 360 }), scene, camera, water);
  assert.equal(pass.texture, first, 'no new texture for an unchanged size');
  pass.render(recordingRenderer({ width: 1280, height: 720 }), scene, camera, water);
  assert.notEqual(pass.texture, first, 'a resize makes a new one');
  assert.equal(pass.texture.image.width, 1280);
});

// Performance: the copy and the second traversal exist only to draw water. A frame with none in view -- a cave, the
// Nether, a desert -- is the first step alone, and the picture is the same: the over-water redraw is limited to
// where water marked the stencil, which on such a frame is nowhere.
test('a frame with no water in view is one render and no copy', () => {
  const { scene, camera, water, waterMesh } = world();
  camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0);
  waterMesh.position.set(0, 0, 60); // behind the camera, which looks toward -z
  scene.updateMatrixWorld(true);
  const renderer = recordingRenderer();
  const pass = new WaterPass();
  const mask = camera.layers.mask;
  pass.render(renderer, scene, camera, water, { waterMeshes: [waterMesh] });
  assert.deepEqual(renderer.log.map((e) => e.kind), ['render'], 'one render, no copy');
  assert.equal(renderer.log[0].mask, 1 << WORLD_LAYER, 'the world layer, as step 1 sees it');
  assert.equal(camera.layers.mask, mask, 'camera layers restored');
  assert.equal(pass.stats.skipped, 1);

  // In view again: the full four steps.
  waterMesh.position.set(0, 0, 0); scene.updateMatrixWorld(true);
  const again = recordingRenderer();
  pass.render(again, scene, camera, water, { waterMeshes: [waterMesh] });
  assert.deepEqual(again.log.map((e) => e.kind), ['render', 'copy', 'render']);

  // A hidden mesh does not count, and no list at all keeps the old behaviour.
  waterMesh.visible = false;
  const hidden = recordingRenderer();
  pass.render(hidden, scene, camera, water, { waterMeshes: [waterMesh] });
  assert.deepEqual(hidden.log.map((e) => e.kind), ['render']);
  const legacy = recordingRenderer();
  pass.render(legacy, scene, camera, water);
  assert.deepEqual(legacy.log.map((e) => e.kind), ['render', 'copy', 'render']);
});

test('the shader hands the water pass the loaded chunks\' water meshes', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/lightweightShader.js', import.meta.url), 'utf8');
  assert.match(src, /waterPass\.render\(r,g\.scene,c,g\.textures\?\.waterMaterial\|\|null,\{waterMeshes:this\.waterMeshes\(\)\}\)/);
  assert.match(src, /for\(const chunk of chunks\.values\(\)\)if\(chunk\.waterMesh\)yield chunk\.waterMesh/);
});
