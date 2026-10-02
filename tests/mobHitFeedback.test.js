import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';

test('Ghast hit feedback flashes every body material and applies arrow recoil', () => {
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xf4f4f4, emissive: 0x181820, emissiveIntensity: 0.1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.6, 3.6), bodyMaterial);
  const mesh = new THREE.Group();
  mesh.add(body);
  mesh.position.set(0, 20, 0);
  const ghast = {
    type: 'ghast', name: 'Ghast', mesh, health: 10, dying: false,
    hitCooldown: 0, isFlying: true, velocity: new THREE.Vector3()
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    scene: new THREE.Scene(), mobs: [ghast], sounds: {}, entities: {}, game: null,
    isTrainingSiteMob: () => false
  });

  const original = bodyMaterial.color.clone();
  const accepted = manager.damageMob(ghast, 2, new THREE.Vector3(0, 20, -1));

  assert.equal(accepted, true);
  assert.equal(ghast.health, 8);
  assert.ok(bodyMaterial.color.r > 0.9 && bodyMaterial.color.g < 0.3, 'body flashes red');
  assert.ok(ghast.hurtTime > 0, 'hurt flash has a visible duration');
  assert.ok(ghast.hurtMaterials?.length === 1, 'all visible Ghast materials are tracked for restoration');
  assert.deepEqual(ghast.hurtScaleBase.toArray(), [1, 1, 1], 'the original mob scale is preserved');
  assert.ok(ghast.hurtScalePulse > 0, 'the hit feedback includes a small visual recoil pulse');
  assert.ok(ghast.knockback.z > 0, 'the hit produces a small recoil away from the arrow');
  assert.notDeepEqual(bodyMaterial.color.toArray(), original.toArray());
});

test('rapid hits refresh the flash without losing the original mob color', () => {
  const material = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  const mob = { type: 'pig', name: 'Pig', mesh, health: 20, dying: false, hitCooldown: 0 };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    scene: new THREE.Scene(), mobs: [mob], sounds: {}, entities: {}, game: null,
    isTrainingSiteMob: () => false
  });
  manager.damageMob(mob, 1);
  mob.hitCooldown = 0;
  manager.damageMob(mob, 1, undefined, true);
  assert.equal(mob.hurtMaterials[0].color.getHex(), 0xeeeeee);
  assert.ok(material.color.r > 0.95 && material.color.g < 0.3 && material.color.b < 0.3);
});
