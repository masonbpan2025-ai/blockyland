import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HeldItemRenderer } from '../src/heldItem.js';
import { skinManager } from '../src/skinManager.js';
import { BLOCKS } from '../src/blocks.js';

test('HeldItemRenderer empty hand creates authentic player arm with dual-layer sleeve and proper UVs', () => {
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.05, 10);
  const held = new HeldItemRenderer(camera);

  // 1. Initial empty hand
  held.setItem(null);
  assert.ok(held.currentMesh, 'arm mesh exists for empty hand');
  assert.equal(held.currentMesh.type, 'Mesh');

  // Verify Base Arm UVs: must be mapped to right arm texture region (u in [0.625, 0.875]), NOT full [0, 1] skin!
  const baseUvs = held.currentMesh.geometry.attributes.uv;
  assert.ok(baseUvs, 'arm geometry has UV coordinates');

  let minU = Infinity, maxU = -Infinity;
  for (let i = 0; i < baseUvs.count; i++) {
    const u = baseUvs.getX(i);
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
  }
  assert.ok(minU >= 0.60 && minU <= 0.65, `min U (${minU}) must be around 40/64 (0.625) for right arm, not 0`);
  assert.ok(maxU >= 0.80 && maxU <= 0.90, `max U (${maxU}) must be around 56/64 (0.875) for right arm, not 1`);

  // Verify Sleeve Overlay exists as a child mesh with outer layer UVs (texY = 32)
  assert.equal(held.currentMesh.children.length, 1, 'arm has sleeve overlay mesh child');
  const sleeveMesh = held.currentMesh.children[0];
  const sleeveUvs = sleeveMesh.geometry.attributes.uv;
  let minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < sleeveUvs.count; i++) {
    const v = sleeveUvs.getY(i);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  // texY = 32 on 64h texture: v between 1 - 48/64 (0.25) and 1 - 32/64 (0.50)
  assert.ok(minV >= 0.20 && minV <= 0.30, `sleeve overlay V min (${minV}) must be around 0.25`);
  assert.ok(maxV >= 0.45 && maxV <= 0.55, `sleeve overlay V max (${maxV}) must be around 0.50`);

  // Verify arm orientation: fist (-Y) points forward into screen (-Z)
  held.container.updateMatrixWorld(true);
  const fistLocal = new THREE.Vector3(0, -0.375, 0);
  const shoulderLocal = new THREE.Vector3(0, 0.375, 0);
  const fistWorld = held.currentMesh.localToWorld(fistLocal.clone());
  const shoulderWorld = held.currentMesh.localToWorld(shoulderLocal.clone());

  assert.ok(fistWorld.z < shoulderWorld.z, 'fist is positioned further forward into the screen (-Z) than shoulder');
  assert.ok(fistWorld.y > shoulderWorld.y, 'fist is angled upwards compared to shoulder at bottom-right');
});

test('HeldItemRenderer empty hand adapts to slim skin model width', () => {
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.05, 10);
  const held = new HeldItemRenderer(camera);

  // Equip Alex (slim 3px arm)
  skinManager.equipSkin('alex');
  held.setItem(null, true);
  const alexArmWidth = held.currentMesh.geometry.parameters.width;

  // Equip Steve (classic 4px arm)
  skinManager.equipSkin('steve');
  held.setItem(null, true);
  const steveArmWidth = held.currentMesh.geometry.parameters.width;

  assert.ok(alexArmWidth < steveArmWidth, `slim arm width (${alexArmWidth}) must be narrower than classic arm width (${steveArmWidth})`);
});

test('HeldItemRenderer switching between empty hand, blocks, and items cleans up properly', () => {
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.05, 10);
  const held = new HeldItemRenderer(camera);

  held.setItem(null);
  assert.equal(held.currentMesh.children.length, 1);

  // Switch to diamond sword
  held.setItem({ id: 'diamond_sword', isBlock: false });
  assert.ok(held.currentMesh.userData.isItem);

  // Switch back to empty hand
  held.setItem(null);
  assert.ok(held.currentMesh);
  assert.equal(held.currentMesh.children.length, 1);
});
