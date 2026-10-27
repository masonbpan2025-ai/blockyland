// Guards for the render-cost fixes that came with the water work. Each one was measured in a real browser
// (scripts/profile-water.mjs, docs/artifacts/water-profile-*.json); these keep the causes from coming back
// without needing a GPU to notice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { BlockLighting, activeLightSlots, MAX_BLOCK_LIGHTS } from '../src/lighting.js';
import { waterFragmentShader } from '../src/water.js';
import { compositeFragment } from '../src/lightweightShader.js';

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

test('the see-through block material draws in one pass', () => {
  // Three.js renders a transparent DoubleSide material twice and flags it for a program rebuild before each half.
  // Measured: about 400 program lookups a frame and 1.4-2 ms of CPU, gone with this flag.
  assert.match(read('src/textures.js'), /this\.transparentMaterial = new THREE\.MeshLambertMaterial\(\{[\s\S]*?forceSinglePass: true[\s\S]*?\}\);/);
});

test('every transparent double-sided material that draws in quantity is single-pass', () => {
  // The water material is the other big one.
  assert.match(read('src/water.js'), /side: THREE\.DoubleSide, forceSinglePass: true/);
});

test('chunk meshes have their matrices computed once, not on every frame', () => {
  const src = read('src/main.js');
  assert.match(src, /const settle = \(mesh\) => \{ mesh\.matrixAutoUpdate = false; mesh\.updateMatrix\(\); mesh\.updateMatrixWorld\(true\); return mesh; \};/);
  for (const kind of ['lightMesh', 'opaqueMesh', 'waterMesh', 'transparentMesh']) {
    assert.match(src, new RegExp(`chunk\\.${kind} = [^;]*settle\\(new THREE\\.Mesh`), `${kind} is settled`);
  }
});

test('the lava animation uploads one tile, not the whole atlas', () => {
  const src = read('src/textures.js');
  assert.match(src, /if\(!this\.uploadLavaTile\(tile\)\)this\.atlasTexture\.needsUpdate=true;/, 'the full upload is only the fallback');
  assert.match(src, /renderer\.copyTextureToTexture\(this\.lavaTileTexture,this\.atlasTexture,null,this\.lavaTilePosition\)/);
  assert.match(read('src/main.js'), /this\.textures\.renderer = this\.renderer;/, 'the texture manager has the renderer to do it with');
});

test('block lights are in the scene only as needed, in steps of four', () => {
  assert.equal(activeLightSlots(0), 0, 'no lamps, no lights');
  assert.equal(activeLightSlots(1), 4);
  assert.equal(activeLightSlots(4), 4);
  assert.equal(activeLightSlots(5), 8);
  assert.equal(activeLightSlots(99), MAX_BLOCK_LIGHTS, 'never more than the pool');
  // Three shader variants at most: none, four and eight.
  const counts = new Set(Array.from({ length: 30 }, (_, n) => activeLightSlots(n)));
  assert.deepEqual([...counts].sort((a, b) => a - b), [0, 4, 8]);
});

test('BlockLighting hides idle lights, so an empty valley pays for none', () => {
  const scene = new THREE.Scene();
  const lighting = new BlockLighting(scene);
  lighting.update(1, new THREE.Vector3());
  assert.ok(lighting.lights.every((l) => !l.visible), 'no sources: every slot hidden');
  lighting.setChunk(0, 0, [{ position: new THREE.Vector3(1, 1, 1), level: 14, color: 0xffaa66 }]);
  lighting.update(1, new THREE.Vector3());
  assert.equal(lighting.lights.filter((l) => l.visible).length, 4, 'one lamp: the first step of four');
  assert.ok(lighting.lights[0].intensity > 0 && lighting.lights[1].intensity === 0, 'only the first is lit');
});

test('an explosion changes no shader: its flash is an ambient glow, its shaders compiled before and kept', async () => {
  // A point light shown and hidden changed the light count every lit shader is compiled for, so each creeper recompiled
  // every shader in view twice -- a frame of up to 1.7 s. An ambient light's count and intensity are in no shader.
  const src = read('src/entities.js');
  assert.match(src, /this\.blastLight = new THREE\.AmbientLight\(/);
  assert.doesNotMatch(src, /blastLight\.visible\s*=/, 'never shown or hidden');
  const THREE = await import('three');
  const { EntityManager, blastGlow } = await import('../src/entities.js');
  const scene = new THREE.Scene();
  const em = new EntityManager(scene, { getVoxel: () => 0 }, {}, null);
  const pointLights = () => { let n = 0; scene.traverse((o) => { if (o.isPointLight && o.visible) n++; }); return n; };
  const before = pointLights();
  em.spawnExplosion(new THREE.Vector3(0, 30, 0), 3);
  assert.equal(pointLights(), before, 'no light appears');
  assert.ok(em.blastLight.intensity > 0, 'it flashes');
  for (let i = 0; i < 10; i++) em.update(0.1, { position: new THREE.Vector3(0, 30, 0), isDead: false }, null);
  assert.equal(em.blastLight.intensity, 0, 'and fades out');
  const at = new THREE.Vector3(0, 30, 0);
  assert.ok(blastGlow(0.35, 1, new THREE.Vector3(0, 30, 3), at) > blastGlow(0.35, 1, new THREE.Vector3(0, 30, 20), at), 'brighter near it');
  assert.equal(blastGlow(0.35, 1, new THREE.Vector3(0, 30, 40), at), 0, 'nothing far off');
  // The smoke and sparks share one geometry each, which the explosion's end does not throw away.
  em.spawnExplosion(at, 3);
  const shared = em.particles.filter((p) => p.sharedGeometry);
  assert.ok(shared.length > 60, 'puffs and sparks');
  assert.equal(new Set(shared.map((p) => p.mesh.geometry)).size, 2, 'on two geometries between them');
  // The warm-up: a few frames of each material, drawn in front of the camera, then removed, the materials kept.
  const camera = new THREE.PerspectiveCamera();
  assert.equal(em.prewarm(camera), true);
  assert.equal(em.prewarm(camera), false, 'once');
  assert.equal(em.warmGroup.parent, scene);
  for (let i = 0; i < 3; i++) em.update(0.016, { position: new THREE.Vector3(), isDead: false }, null);
  assert.equal(em.warmGroup, null, 'gone from the scene');
  assert.equal(em.warmMaterials.length, 3, 'its materials, and so their programs, kept');
  assert.match(read('src/main.js'), /if \(this\.worldReady && this\.entities && !this\.entities\.prewarmed\) this\.entities\.prewarm\?\.\(this\.camera\);/);
});

test('lamp shadows are redrawn when the lamp moves or four times a second, not on the sun\'s clock', () => {
  const src = read('src/lightweightShader.js');
  assert.match(src, /updateShadows\(dt\)\{/);
  assert.match(src, /const lampDue=this\.lampClock>=\.25;/);
  assert.match(src, /g\.sunLight\.shadow\.needsUpdate=true/);
});

// --- the shader's own budget -------------------------------------------------------

const count = (src, re) => (src.match(re) ?? []).length;

test('the water surface reads the scene once and keeps its loops short', () => {
  assert.equal(count(waterFragmentShader, /texture2D\(tRefraction/g), 1, 'one refraction lookup per pixel');
  const loops = [...waterFragmentShader.matchAll(/for \(int i = 0; i < (\w+); i\+\+\)/g)].map((m) => m[1]);
  for (const bound of loops) {
    assert.ok(bound === 'NUM_POINT_LIGHTS' || Number(bound) <= 3, `loop bound ${bound}`);
  }
  // The old surface spent nine value-noise lookups on finite-difference slopes; the swells are analytic now.
  assert.ok(count(waterFragmentShader, /noise\(/g) <= 9, 'value-noise calls are bounded');
  assert.match(waterFragmentShader, /void wave\(vec2 p, vec2 dir, float k, float amp, float speed, inout vec3 h\)/);
});

test('the sun on the water is capped below the bloom threshold that turned it into white patches', () => {
  assert.match(waterFragmentShader, /float sparkle = min\(/);
  assert.match(waterFragmentShader, /, 0\.85\);/);
});

test('the underwater light shafts take a fixed six samples per pixel', () => {
  assert.match(compositeFragment, /for\(int i=0;i<6;i\+\+\)/);
  assert.match(compositeFragment, /float reach=min\(distanceToEye,18\.0\)/, 'and never march further than 18 blocks');
});
