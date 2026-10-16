import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  updateCreeper,
  detonateCreeper,
  fuseProgress,
  setCreeperVisuals,
  CREEPER_FUSE_SECONDS,
  CREEPER_IGNITE_RANGE,
  CREEPER_CANCEL_RANGE,
  CREEPER_POWER,
  CHARGED_CREEPER_POWER
} from '../src/creeperBehavior.js';
import { EntityManager } from '../src/entities.js';

function createMockCreeper(x = 0, y = 0, z = 0, charged = false) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const mat = new THREE.MeshLambertMaterial({ color: 0x55ff55 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.7, 0.6), mat);
  group.add(mesh);

  return {
    type: 'creeper',
    charged,
    mesh: group,
    mat: mat,
    health: 20,
    maxHealth: 20,
    velocity: new THREE.Vector3(),
    yaw: 0,
    fuseTime: 0,
    swelling: false,
    isFlashing: false
  };
}

test('creeper swelling and flashing: scales up and turns emissive white', () => {
  const creeper = createMockCreeper();

  // Initially at rest: scale 1, emissive 0,0,0
  setCreeperVisuals(creeper, 0, false);
  assert.equal(creeper.mesh.scale.x, 1);
  assert.equal(creeper.mesh.scale.y, 1);
  assert.equal(creeper.mesh.scale.z, 1);
  assert.equal(creeper.mat.emissive.r, 0);
  assert.equal(creeper.mat.emissive.g, 0);
  assert.equal(creeper.mat.emissive.b, 0);

  // Halfway through fuse (p = 0.5) with isFlashing = true:
  setCreeperVisuals(creeper, 0.5, true);
  assert.ok(creeper.mesh.scale.x > 1.1, `swelling X scale should be inflated: ${creeper.mesh.scale.x}`);
  assert.ok(creeper.mat.emissive.r >= 0.7, `bright white flash emissive r: ${creeper.mat.emissive.r}`);
  assert.ok(creeper.mat.color.r >= 1.4, `brightened texture color r: ${creeper.mat.color.r}`);

  // Non-flashing interval (p = 0.5, isFlashing = false):
  setCreeperVisuals(creeper, 0.5, false);
  assert.ok(creeper.mat.emissive.r < 0.5 && creeper.mat.emissive.r > 0, 'base glow should be active during fuse');

  // Defused back to 0:
  setCreeperVisuals(creeper, 0, false);
  assert.equal(creeper.mesh.scale.x, 1);
  assert.equal(creeper.mesh.scale.y, 1);
  assert.equal(creeper.mesh.scale.z, 1);
  assert.equal(creeper.mat.emissive.r, 0);
  assert.equal(creeper.mat.emissive.g, 0);
  assert.equal(creeper.mat.emissive.b, 0);
});

test('creeper AI update: hisses when ignited inside 3 blocks and flashes over fuse', () => {
  let fusePlayed = false;
  const manager = {
    sounds: {
      playFuse: () => { fusePlayed = true; }
    },
    mobs: []
  };

  const creeper = createMockCreeper(0, 0, 0);
  const player = {
    position: new THREE.Vector3(0, 0, 2), // 2 blocks away (< CREEPER_IGNITE_RANGE = 3)
    gamemode: 'survival'
  };

  // First tick inside ignite range starts swelling and plays fuse hiss
  const exploded = updateCreeper(manager, creeper, 0.1, player, 2);
  assert.equal(exploded, false);
  assert.equal(creeper.swelling, true);
  assert.equal(fusePlayed, true, 'playFuse should be called when swelling begins');
  assert.ok(creeper.fuseTime > 0, 'fuse timer should advance');

  // Simulate fuse burn up to near detonation: check alternating isFlashing states
  let sawFlashingTrue = false;
  let sawFlashingFalse = false;
  for (let t = 0; t < 1.2; t += 0.05) {
    updateCreeper(manager, creeper, 0.05, player, 2);
    if (creeper.isFlashing) sawFlashingTrue = true;
    else sawFlashingFalse = true;
  }
  assert.ok(sawFlashingTrue, 'creeper must flash white (isFlashing=true)');
  assert.ok(sawFlashingFalse, 'creeper must have alternating flash intervals');
});

test('creeper cancels swelling and resets visuals if player retreats past 7 blocks', () => {
  const manager = {
    sounds: { playFuse: () => {} },
    mobs: []
  };
  const creeper = createMockCreeper(0, 0, 0);
  const player = { position: new THREE.Vector3(0, 0, 2), gamemode: 'survival' };

  // Prime for 0.5 seconds
  for (let i = 0; i < 10; i++) updateCreeper(manager, creeper, 0.05, player, 2);
  assert.equal(creeper.swelling, true);
  assert.ok(creeper.fuseTime > 0.4);

  // Player retreats to 8 blocks (> CREEPER_CANCEL_RANGE = 7)
  player.position.set(0, 0, 8);
  updateCreeper(manager, creeper, 0.05, player, 8);
  assert.equal(creeper.swelling, false, 'swelling should be cancelled');

  // Wind fuse completely down
  for (let i = 0; i < 20; i++) updateCreeper(manager, creeper, 0.1, player, 8);
  assert.equal(creeper.fuseTime, 0, 'fuseTime should wind down to 0');
  assert.equal(creeper.isFlashing, false);
  assert.equal(creeper.mesh.scale.x, 1, 'scale should reset to 1');
  assert.equal(creeper.mat.emissive.r, 0, 'emissive should reset to 0');
});

test('creeper detonate: triggers explosion with power, deals damage, spawns blast debris, and drops no loot', () => {
  let explosionCenter = null;
  let explosionPower = null;
  let explosionSoundPlayed = false;
  let debrisCount = 0;
  let damageDealt = 0;

  const manager = {
    game: { difficulty: 'normal' },
    sounds: {
      playExplosion: () => { explosionSoundPlayed = true; }
    },
    entities: {
      spawnExplosion: (center, power) => {
        explosionCenter = center;
        explosionPower = power;
      },
      spawnBlastDebris: () => { debrisCount++; },
      spawnDroppedItem: () => {}
    },
    world: {
      getVoxel: () => 1, // stone
      setVoxel: () => {}
    },
    mobs: [],
    damageMob: () => {}
  };

  const creeper = createMockCreeper(5, 10, 5);
  const player = {
    position: new THREE.Vector3(5, 10, 6),
    gamemode: 'survival',
    takeDamage: (dmg) => { damageDealt = dmg; }
  };

  detonateCreeper(manager, creeper, player);

  assert.equal(explosionSoundPlayed, true, 'explosion sound should play');
  assert.ok(explosionCenter !== null, 'spawnExplosion should be called');
  assert.equal(explosionPower, CREEPER_POWER, 'explosion power should be passed');
  assert.ok(damageDealt > 0, `player should take explosion damage: ${damageDealt}`);
  assert.ok(debrisCount > 0, `blast debris should be spawned: ${debrisCount}`);
  assert.equal(creeper.exploded, true);
  assert.equal(creeper.noLoot, true, 'exploded creeper drops no loot');
  assert.equal(creeper.mat.emissive.r, 0, 'emissive resets after detonation');
});

test('EntityManager.spawnExplosion generates dense white explosion clouds, dark smoke and sparks', () => {
  const scene = new THREE.Scene();
  const mockWorld = { getVoxel: () => 0 };
  const em = new EntityManager(scene, mockWorld, { playClick: () => {} }, null);

  const center = new THREE.Vector3(10, 20, 10);
  em.spawnExplosion(center, 3);

  assert.equal(em.blastLight.visible, true);
  assert.ok(em.particles.length > 50, `should spawn a rich explosion particle burst: ${em.particles.length}`);

  const whiteClouds = em.particles.filter(p => p.smoke && p.baseOpacity > 0.8);
  assert.ok(whiteClouds.length >= 35, `should have dense billowing white explosion clouds: ${whiteClouds.length}`);

  const darkSmokes = em.particles.filter(p => p.smoke && p.baseOpacity <= 0.7);
  assert.ok(darkSmokes.length >= 10, `should have rising dark smoke puffs: ${darkSmokes.length}`);

  const sparks = em.particles.filter(p => p.spark);
  assert.ok(sparks.length >= 25, `should have fiery flying sparks: ${sparks.length}`);

  // Update particles: ensure opacities and scales update smoothly
  const initialCloudScale = whiteClouds[0].mesh.scale.x;
  em.update(0.1, { position: new THREE.Vector3(0, 0, 0) }, null);
  assert.ok(whiteClouds[0].mesh.scale.x > initialCloudScale, 'clouds should billow and grow');
});
