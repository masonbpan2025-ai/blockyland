import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { spawnArrow, updateArrows } from '../src/arrows.js';

function setup() {
  const player = { position: new THREE.Vector3(20, 20, 0), takeDamage() {} };
  const ghast = {
    type: 'ghast',
    mesh: new THREE.Group(),
    health: 10,
    dying: false
  };
  ghast.mesh.position.set(0, 20, 0);
  const manager = {
    scene: new THREE.Scene(),
    world: { getVoxel: () => 0 },
    sounds: {},
    arrows: [],
    mobs: [ghast],
    getMobDimensions: type => type === 'ghast' ? { width: 4, height: 4 } : { width: .6, height: 1.8 },
    damageMob(target, amount) { target.health -= amount; }
  };
  return { manager, player, ghast };
}

test('player arrows hit the ghast body using its 4x4 damageable hitbox', () => {
  const { manager, player, ghast } = setup();
  spawnArrow(manager, new THREE.Vector3(0, 22.5, 0), new THREE.Vector3(0, 0, 1), 'player', { speed: 30, damage: 4 });
  // The arrow crosses the body center at z=0.2; no solid blocks are present.
  manager.arrows[0].mesh.position.set(0, 22.5, -0.2);
  updateArrows(manager, .02, player);
  assert.equal(ghast.health, 6, 'an arrow crossing the body must damage the ghast');
  assert.equal(manager.arrows.length, 0, 'the hit arrow is removed');
});

test('arrows through ghast tentacles do not count as body hits', () => {
  const { manager, player, ghast } = setup();
  spawnArrow(manager, new THREE.Vector3(0, 20.4, 0), new THREE.Vector3(0, 0, 1), 'player', { speed: 30, damage: 4 });
  manager.arrows[0].mesh.position.set(0, 20.4, -0.2);
  updateArrows(manager, .02, player);
  assert.equal(ghast.health, 10, 'the tentacle region is outside the ghast hitbox');
  assert.equal(manager.arrows.length, 1, 'the arrow continues past the tentacles');
});
