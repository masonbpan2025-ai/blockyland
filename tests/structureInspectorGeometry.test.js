// The Inspector's voxel geometry and material.
//
// These are the only tests in the suite that can catch the black-blob defect, and they exist because the first
// two attempts to fix it were GUESSES that a screenshot had to disprove. The defect lives entirely in three's
// shader chunks, and those chunks are readable here even though a WebGL context is not creatable:
//
//   * `USE_COLOR` is defined by `material.vertexColors`, and the vertex stage then does `vColor.rgb *= color`
//     with the GEOMETRY's `color` attribute. A BoxGeometry has position, normal and uv but no `color`, so the
//     shader read a disabled attribute's default of ZERO and multiplied every block to black.
//   * `USE_INSTANCING_COLOR` is defined by the mere presence of `instanceColor`, and the FRAGMENT stage applies
//     `vColor` only under `USE_COLOR`. So turning `vertexColors` off would silently ignore the palette.
//
// Both halves are therefore required, and both are asserted below on a real geometry built by the shipped code
// rather than by inspecting its source.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  createVoxelGeometry, createVoxelMaterial, applyInstanceColours, VOXEL_COLOUR_ATTRIBUTE
} from '../src/structureInspectorGeometry.js';

test('the block geometry carries WHITE vertex colours, which is what stops blocks rendering black', () => {
  const geometry = createVoxelGeometry(THREE);
  const attribute = geometry.attributes[VOXEL_COLOUR_ATTRIBUTE];
  // Without this attribute the shader multiplies vColor by zero, because the material asks for vertex colours.
  assert.ok(attribute, 'the geometry must carry a colour attribute');
  assert.equal(attribute.itemSize, 3, 'colours are rgb');
  assert.equal(attribute.count, geometry.attributes.position.count, 'one colour per vertex');
  for (let i = 0; i < attribute.count; i++) {
    assert.deepEqual([attribute.getX(i), attribute.getY(i), attribute.getZ(i)], [1, 1, 1],
      'vertex colour ' + i + ' must be white, so instance colours are what shows');
  }
});

test('the plain BoxGeometry really has no colour attribute, which is the bug being guarded against', () => {
  // The control. If three ever started shipping a colour attribute on BoxGeometry this test would fail and the
  // reason above would need re-reading, which is exactly when someone should look again.
  const plain = new THREE.BoxGeometry(1, 1, 1);
  assert.equal(plain.attributes[VOXEL_COLOUR_ATTRIBUTE], undefined, 'a bare BoxGeometry has no colour attribute');
  assert.deepEqual(Object.keys(plain.attributes).sort(), ['normal', 'position', 'uv']);
});

test('the material asks for vertex colours, or the fragment stage ignores the palette', () => {
  const material = createVoxelMaterial(THREE);
  // three's fragment chunk applies vColor only under USE_COLOR, which this flag defines.
  assert.equal(material.vertexColors, true, 'vertexColors must be on for the palette to reach the screen');
});

test('instance colours are set per instance and marked for upload', () => {
  const geometry = createVoxelGeometry(THREE);
  const mesh = new THREE.InstancedMesh(geometry, createVoxelMaterial(THREE), 3);
  const entries = [['0,0,0', 1], ['1,0,0', 2], ['2,0,0', 3]];
  const colours = { 1: new THREE.Color('#ff0000'), 2: new THREE.Color('#00ff00'), 3: new THREE.Color('#0000ff') };
  let asked = 0;
  applyInstanceColours(mesh, entries, (id) => { asked++; return colours[id]; });

  assert.equal(asked, 3, 'every instance must be given a colour');
  assert.ok(mesh.instanceColor, 'setColorAt must have created the instance colour attribute');
  assert.equal(mesh.instanceColor.count, 3);
  // The values must be the ones asked for: red, green, blue, in order.
  assert.deepEqual([mesh.instanceColor.getX(0), mesh.instanceColor.getY(0), mesh.instanceColor.getZ(0)], [1, 0, 0]);
  assert.deepEqual([mesh.instanceColor.getX(1), mesh.instanceColor.getY(1), mesh.instanceColor.getZ(1)], [0, 1, 0]);
  assert.deepEqual([mesh.instanceColor.getX(2), mesh.instanceColor.getY(2), mesh.instanceColor.getZ(2)], [0, 0, 1]);
  // A buffer that is filled but never marked dirty is never uploaded, and would draw with its initial zeros.
  // three's `needsUpdate` is a WRITE-ONLY trigger that bumps `version`, so it cannot be read back as a boolean
  // -- asserting `version` is the way to prove the upload was requested.
  assert.ok(mesh.instanceColor.version > 0, 'the helper must mark the colour buffer for upload');
});

test('the helper refuses to run without the three namespace instead of failing obscurely later', () => {
  assert.throws(() => createVoxelGeometry(null), /needs the three namespace/);
  assert.throws(() => createVoxelMaterial({}), /needs the three namespace/);
});
