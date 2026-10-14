import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';

function managerFixture() {
  const scene = new THREE.Scene();
  const world = { getVoxel: () => 0 };
  // Every built-in renderer can request a different atlas entry. Supplying a
  // texture for arbitrary keys keeps this test focused on the mesh contract
  // instead of browser asset loading.
  const textures = new Proxy({}, {
    get: (target, key) => {
      if (typeof key === 'symbol') return undefined;
      if (!target[key]) target[key] = new THREE.Texture();
      return target[key];
    }
  });
  return Object.assign(Object.create(MobManager.prototype), {
    scene,
    world,
    sounds: {},
    mobs: [],
    arrows: [],
    customProjectiles: [],
    textures,
    entities: null
  });
}

function meshesOf(mob) {
  const meshes = [];
  mob.mesh?.traverse(node => { if (node.isMesh) meshes.push(node); });
  return meshes;
}

function hasVisibleSkin(mob) {
  return meshesOf(mob).some(mesh => {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return materials.some(material => {
      if (!material) return false;
      if (material.map instanceof THREE.Texture) return true;
      return material.color instanceof THREE.Color && material.color.getHex() !== 0xffffff;
    });
  });
}

test('Ravager has a real skin atlas and modeled face details', () => {
  const manager = managerFixture();
  const ravager = manager.spawnRavager(0, 1, 0);
  const meshes = meshesOf(ravager);
  assert.ok(meshes.length >= 10, 'Ravager should include body, legs, horns and face details');

  const hideMeshes = meshes.filter(mesh => mesh.material?.map === manager.textures.ravager);
  assert.ok(hideMeshes.length >= 6, 'body, head and legs should use the Ravager skin atlas');
  assert.ok(meshes.some(mesh => mesh.material?.color?.getHex() === 0x1b2228), 'dark muzzle is modeled');
  assert.ok(meshes.some(mesh => mesh.material?.color?.getHex() === 0xe5e7eb), 'eyes are modeled');
});

test('every built-in mob type produces a visible skinned or colored mesh', () => {
  const manager = managerFixture();
  const builtIns = [
    'villager', 'enderman',
    'iron_golem', 'pillager', 'zombie', 'zombie_villager', 'skeleton', 'creeper',
    'pig', 'cow', 'sheep', 'chicken', 'cod', 'salmon', 'dolphin', 'squid',
    'axolotl', 'mooshroom', 'polar_bear', 'panda', 'warden', 'blaze', 'piglin',
    'zombified_piglin', 'hoglin', 'ghast', 'magma_cube', 'shulker', 'horse',
    'donkey', 'wolf', 'cat', 'ocelot', 'slime', 'witch', 'wither_skeleton',
    'strider', 'guardian', 'elder_guardian', 'drowned', 'glow_squid', 'phantom',
    'vindicator', 'evoker', 'vex', 'ravager', 'ender_dragon', 'wither'
  ];

  for (const type of builtIns) {
    const mob = manager.spawnMob(type, 0, 1, 0);
    assert.ok(mob, `${type} should spawn`);
    assert.ok(meshesOf(mob).length > 0, `${type} should have renderable meshes`);
    assert.ok(hasVisibleSkin(mob), `${type} should have a visible skin/material`);
  }
});

test('Ravager skin generator degrades safely without a DOM canvas', () => {
  const manager = Object.assign(Object.create(MobManager.prototype), {});
  assert.doesNotThrow(() => manager.createRavagerTexture());
  assert.ok(manager.createRavagerTexture() instanceof THREE.Texture);
});

test('horse and donkey use coat textures instead of flat placeholder colors', () => {
  const manager = managerFixture();
  const horse = manager.spawnHorse(0, 1, 0);
  const donkey = manager.spawnDonkey(2, 1, 0);
  for (const [mob, label] of [[horse, 'horse'], [donkey, 'donkey']]) {
    const meshes = meshesOf(mob);
    assert.ok(meshes.some(mesh => mesh.material?.map instanceof THREE.Texture), `${label} coat should use a texture`);
    assert.ok(meshes.length >= 8, `${label} should have a complete blocky model`);
  }
  assert.doesNotThrow(() => manager.createHorseTexture(0x78350f));
});
