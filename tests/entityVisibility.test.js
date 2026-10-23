// Mobs past the edge of the drawn terrain. Flying fast in creative outran chunk meshing, and the mobs in the
// generated-but-unmeshed chunks were drawn floating in the sky beyond the terrain, where the fog should have hidden
// everything. A mob is now drawn only in a chunk whose terrain has been meshed, and short of the fog's far edge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { hiddenFromView, hideOutOfViewMobs, restoreHidden } from '../src/entityVisibility.js';

function fixture() {
  const chunks = new Map();
  const world = { getChunk: (cx, cz) => chunks.get(`${cx},${cz}`) };
  const camera = new THREE.PerspectiveCamera(); camera.position.set(8, 80, 8);
  const fog = new THREE.Fog(0xffffff, 90, 127);
  const mob = (x, z) => { const mesh = new THREE.Group(); mesh.position.set(x, 64, z); return { type: 'polar_bear', mesh }; };
  return { chunks, world, camera, fog, mob };
}

test('a mob in a chunk whose terrain is not drawn is not drawn either', () => {
  const { chunks, world, camera, fog, mob } = fixture();
  chunks.set('3,0', { cx: 3, cz: 0 });                    // generated, not meshed yet
  assert.equal(hiddenFromView(mob(56, 8), world, camera, fog), true);
  chunks.get('3,0').meshedOnce = true;
  assert.equal(hiddenFromView(mob(56, 8), world, camera, fog), false, 'drawn once its terrain is');
  assert.equal(hiddenFromView(mob(200, 8), world, camera, fog), true, 'no chunk at all');
});

test('a mob past the fog\'s far edge is left out, like the terrain the fog has swallowed', () => {
  const { chunks, world, camera, fog, mob } = fixture();
  chunks.set('8,0', { meshedOnce: true });
  chunks.set('7,0', { meshedOnce: true });
  assert.equal(hiddenFromView(mob(8 + 130, 8), world, camera, fog), true, '130 blocks out, fog ends at 127');
  assert.equal(hiddenFromView(mob(8 + 120, 8), world, camera, fog), false, 'inside the fog it is fogged, as terrain is');
  assert.equal(hiddenFromView(mob(8 + 130, 8), world, camera, new THREE.FogExp2(0xffffff, 0.01)), false, 'no far edge, no cut');
});

test('hiding is for one frame: the mob code\'s own visibility flags are put back', () => {
  const { chunks, world, camera, mob } = fixture();
  chunks.set('0,0', { meshedOnce: true });
  const near = mob(4, 4), far = mob(56, 8), invisible = mob(5, 5);
  invisible.mesh.visible = false; // an invisible mob (its own flag)
  const game = { mobs: { mobs: [near, far, invisible] }, world, scene: { fog: null }, camera };
  const hidden = hideOutOfViewMobs(game);
  assert.deepEqual(hidden, [far.mesh]);
  assert.equal(far.mesh.visible, false);
  assert.equal(near.mesh.visible, true);
  restoreHidden(hidden);
  assert.equal(far.mesh.visible, true, 'restored after the render');
  assert.equal(invisible.mesh.visible, false, 'and a flag it never set is left alone');
});

test('the game marks a chunk drawn when its mesh arrives, and the world render hides around itself', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const apply = main.slice(main.indexOf('  applyChunkGeometry(chunk, geometry) {'), main.indexOf('  applyChunkGeometry(chunk, geometry) {') + 2500);
  assert.match(apply, /chunk\.meshedOnce = true;/);
  const shader = readFileSync(new URL('../src/lightweightShader.js', import.meta.url), 'utf8');
  // Hidden for the render and put back after it -- with distant mobs' small parts too (mobLod.js).
  assert.match(shader, /const hidden=hideOutOfViewMobs\(g\);[\s\S]{0,200}const details=g\.mobDetailLod\?hideDistantMobDetails\(g\):\[\];\s*try\{this\.renderWorldPasses\(\);\}finally\{restoreHidden\(details\);restoreHidden\(hidden\);\}/);
});

test('minecarts, dropped items and orbs follow the same rule as mobs', () => {
  const { chunks, world, camera } = fixture();
  chunks.set('0,0', { meshedOnce: true });
  const at = (x, z) => { const g = new THREE.Group(); g.position.set(x, 13, z); return g; };
  // A mineshaft cart whose chunk was unloaded was left hanging in the sky; one in a drawn chunk stays.
  const strandedCart = { mesh: at(-112, 9) }, cart = { mesh: at(4, 4) }, item = { group: at(-60, 5) }, orb = { mesh: at(6, 6) };
  const game = { mobs: { mobs: [] }, railSystem: { carts: [strandedCart, cart], boats: [] }, entities: { droppedItems: [item], xpOrbs: [orb] }, world, scene: { fog: null }, camera };
  const hidden = hideOutOfViewMobs(game);
  assert.deepEqual(hidden, [strandedCart.mesh, item.group]);
  restoreHidden(hidden);
  assert.equal(strandedCart.mesh.visible, true);
});
