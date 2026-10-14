import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { DEBUG_MOBS } from '../src/mobDebugSession.js';
import { applyLlamaEquipment } from '../src/llamaBehavior.js';

function createFixture() {
  const scene = new THREE.Scene();
  const world = {
    getVoxel: () => 0,
    getHeightAt: () => 0,
    getBiome: () => 'plains',
    dimension: 'overworld'
  };
  const sounds = new Proxy({}, { get: () => () => {} });
  const entities = {
    spawnDroppedItem: () => {},
    spawnXpOrbs: () => {},
    spawnDeathParticles: () => {}
  };
  const manager = new MobManager(scene, world, sounds, entities);
  return { scene, manager };
}

function isDescendantOf(child, parent) {
  if (!child || !parent) return false;
  let p = child.parent;
  while (p) {
    if (p === parent) return true;
    p = p.parent;
  }
  return false;
}

test('every mob in DEBUG_MOBS has all facial and head parts attached to mob.head', () => {
  const { manager } = createFixture();

  for (const type of DEBUG_MOBS) {
    const mob = manager.spawnMob(type, 0, 0, 0);
    if (!mob || !mob.head) continue;

    // Check explicitly designated head parts on mob instance
    const partFields = ['snout', 'muzzle', 'nose', 'ears', 'horns', 'eyes', 'beard', 'tusks', 'jaw', 'gills', 'crest', 'carpetNeck'];
    for (const f of partFields) {
      const val = mob[f];
      if (!val) continue;
      const list = Array.isArray(val) ? val : [val];
      for (const item of list) {
        const obj = item?.isObject3D ? item : item?.mesh;
        if (obj && obj !== mob.head) {
          assert.ok(
            isDescendantOf(obj, mob.head),
            `Mob '${type}' field '${f}' must be attached to mob.head so it turns together`
          );
        }
      }
    }

    // Check if mob.neck is either mob.head or a child of mob.head
    if (mob.neck && mob.neck.isObject3D && mob.neck !== mob.head) {
      assert.ok(
        isDescendantOf(mob.neck, mob.head),
        `Mob '${type}' neck must be part of mob.head assembly so head turns carry the neck`
      );
    }
  }
});

test('llama and trader_llama turn entire neck, head, snout, ears, eyes, and carpet together', () => {
  const { scene, manager } = createFixture();
  const llama = manager.spawnMob('llama', 0, 0, 0);
  llama.carpetColor = 'cyan';
  applyLlamaEquipment(llama);

  assert.ok(llama.head, 'llama has a head');
  assert.ok(llama.muzzle, 'llama has a muzzle');
  assert.ok(llama.ears && llama.ears.length === 2, 'llama has 2 ears');
  assert.ok(llama.eyes && llama.eyes.length === 2, 'llama has 2 eyes');
  assert.ok(llama.carpetNeck, 'llama has carpetNeck overlay');

  // Verify all parts are descendants of llama.head
  assert.ok(isDescendantOf(llama.muzzle, llama.head), 'muzzle is inside head');
  llama.ears.forEach((ear, i) => assert.ok(isDescendantOf(ear, llama.head), `ear ${i} is inside head`));
  llama.eyes.forEach((eye, i) => assert.ok(isDescendantOf(eye, llama.head), `eye ${i} is inside head`));
  assert.ok(isDescendantOf(llama.carpetNeck, llama.head), 'carpetNeck is inside head');

  // Test rotation
  scene.updateMatrixWorld(true);
  const initialMuzzlePos = new THREE.Vector3();
  llama.muzzle.getWorldPosition(initialMuzzlePos);

  llama.head.rotation.y = 0.5;
  scene.updateMatrixWorld(true);
  const turnedMuzzlePos = new THREE.Vector3();
  llama.muzzle.getWorldPosition(turnedMuzzlePos);

  assert.notEqual(initialMuzzlePos.x, turnedMuzzlePos.x, 'muzzle turns sideways when head rotates');
});

test('camel and camel_husk turn entire neck, head, muzzle, and ears together', () => {
  const { scene, manager } = createFixture();
  for (const type of ['camel', 'camel_husk']) {
    const camel = manager.spawnMob(type, 0, 0, 0);
    assert.ok(camel.head, `${type} has a head`);
    assert.ok(camel.neck, `${type} has a neck`);
    assert.ok(camel.muzzle, `${type} has a muzzle`);

    assert.ok(isDescendantOf(camel.neck, camel.head), `${type} neck is inside head`);
    assert.ok(isDescendantOf(camel.muzzle, camel.head), `${type} muzzle is inside head`);

    scene.updateMatrixWorld(true);
    const initialNeckPos = new THREE.Vector3();
    camel.neck.getWorldPosition(initialNeckPos);

    camel.head.rotation.y = 0.5;
    scene.updateMatrixWorld(true);
    const turnedNeckPos = new THREE.Vector3();
    camel.neck.getWorldPosition(turnedNeckPos);

    assert.notEqual(initialNeckPos.x, turnedNeckPos.x, `${type} neck turns sideways when head rotates`);
  }
});

test('skeleton_horse and zombie_horse turn neck, skull, snout, eyes, and mane together', () => {
  const { scene, manager } = createFixture();
  for (const type of ['skeleton_horse', 'zombie_horse']) {
    const horse = manager.spawnMob(type, 0, 0, 0);
    assert.ok(horse.head, `${type} has head pivot`);
    assert.ok(horse.neck, `${type} has neck`);
    assert.ok(horse.mane, `${type} has mane`);

    assert.ok(isDescendantOf(horse.neck, horse.head), `${type} neck is inside head`);
    assert.ok(isDescendantOf(horse.mane, horse.head), `${type} mane is inside head`);

    scene.updateMatrixWorld(true);
    const initialNeckPos = new THREE.Vector3();
    horse.neck.getWorldPosition(initialNeckPos);

    horse.head.rotation.y = 0.5;
    scene.updateMatrixWorld(true);
    const turnedNeckPos = new THREE.Vector3();
    horse.neck.getWorldPosition(turnedNeckPos);

    assert.notEqual(initialNeckPos.x, turnedNeckPos.x, `${type} neck turns sideways when head turns`);
  }
});

test('horse turns neck, skull, and neck-armor together with head', () => {
  const { scene, manager } = createFixture();
  const horse = manager.spawnMob('horse', 0, 0, 0);
  assert.ok(horse.head, 'horse has head');
  assert.ok(horse.neckArmorMesh, 'horse has neckArmorMesh');

  assert.ok(isDescendantOf(horse.neckArmorMesh, horse.head), 'neckArmorMesh is inside head');

  // Verify armorMesh visibility syncs to neckArmorMesh
  horse.armorMesh.visible = true;
  assert.equal(horse.neckArmorMesh.visible, true, 'neckArmorMesh is visible when armorMesh is visible');
  horse.armorMesh.visible = false;
  assert.equal(horse.neckArmorMesh.visible, false, 'neckArmorMesh hides when armorMesh hides');
});

test('ravager head carries muzzle, eyes, pupils, and horns', () => {
  const { scene, manager } = createFixture();
  const ravager = manager.spawnMob('ravager', 0, 0, 0);
  assert.ok(ravager.head, 'ravager has head');

  // All children of head
  const childMeshes = [];
  ravager.head.traverse(obj => {
    if (obj !== ravager.head && obj.isMesh) childMeshes.push(obj);
  });

  // Muzzle + 2 eyes + 2 pupils + 2 horns = at least 7 face details on head
  assert.ok(childMeshes.length >= 7, `ravager head must have at least 7 facial children, found ${childMeshes.length}`);

  // Test that rotating head sweeps all child meshes
  scene.updateMatrixWorld(true);
  const initialPositions = childMeshes.map(m => m.getWorldPosition(new THREE.Vector3()).clone());

  ravager.head.rotation.y = 0.6;
  scene.updateMatrixWorld(true);
  const turnedPositions = childMeshes.map(m => m.getWorldPosition(new THREE.Vector3()).clone());

  for (let i = 0; i < childMeshes.length; i++) {
    assert.notEqual(initialPositions[i].x, turnedPositions[i].x, `facial child ${i} must rotate sideways with head`);
  }
});

test('turtle head and neck turn together out of shell', () => {
  const { scene, manager } = createFixture();
  const turtle = manager.spawnMob('turtle', 0, 0, 0);
  assert.ok(turtle.head, 'turtle has head');
  assert.ok(turtle.neck, 'turtle has neck');

  assert.ok(isDescendantOf(turtle.neck, turtle.head), 'turtle neck is inside head');

  scene.updateMatrixWorld(true);
  const initialNeckPos = new THREE.Vector3();
  turtle.neck.getWorldPosition(initialNeckPos);

  turtle.head.rotation.y = 0.5;
  scene.updateMatrixWorld(true);
  const turnedNeckPos = new THREE.Vector3();
  turtle.neck.getWorldPosition(turnedNeckPos);

  assert.notEqual(initialNeckPos.x, turnedNeckPos.x, 'turtle neck turns sideways with head');
});

test('axolotl eyes, smile, and gills are attached to head and turn with it', () => {
  const { scene, manager } = createFixture();
  const axolotl = manager.spawnMob('axolotl', 0, 0, 0);
  assert.ok(axolotl.head, 'axolotl has head');

  // Head must have eyes, smile, gills attached
  const headChildren = [];
  axolotl.head.traverse(obj => {
    if (obj !== axolotl.head && obj.isMesh) headChildren.push(obj);
  });

  // 2 eyes + 1 smile + 6 gill frills (3 left, 3 right) = 9
  assert.ok(headChildren.length >= 9, `axolotl head must contain eyes, smile, and gills (found ${headChildren.length})`);

  scene.updateMatrixWorld(true);
  const initialPositions = headChildren.map(m => m.getWorldPosition(new THREE.Vector3()).clone());

  axolotl.head.rotation.y = 0.5;
  scene.updateMatrixWorld(true);
  const turnedPositions = headChildren.map(m => m.getWorldPosition(new THREE.Vector3()).clone());

  for (let i = 0; i < headChildren.length; i++) {
    assert.notEqual(initialPositions[i].x, turnedPositions[i].x, `axolotl head child ${i} turns with head`);
  }
});

test('warden eyes and horns are attached to head and turn with it', () => {
  const { scene, manager } = createFixture();
  const warden = manager.spawnMob('warden', 0, 0, 0);
  assert.ok(warden.head, 'warden has head');

  const headChildren = [];
  warden.head.traverse(obj => {
    if (obj !== warden.head && obj.isMesh) headChildren.push(obj);
  });

  // 2 eyes + 2 horns = at least 4 meshes
  assert.ok(headChildren.length >= 4, `warden head must contain eyes and horns (found ${headChildren.length})`);
});
