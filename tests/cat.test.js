import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS } from '../src/blocks.js';

function createMockFixture() {
  const world = { getVoxel: (x, y, z) => (y < 1 ? BLOCKS.GRASS_BLOCK : BLOCKS.AIR) };
  const scene = new THREE.Scene();
  const sounds = {
    playCat: () => {},
    playWolf: () => {}
  };
  const entities = {};
  const manager = new MobManager(scene, world, sounds, entities);
  return { manager, scene, world };
}

test('Cat mob anatomy: body, head, ears, muzzle, 4 legs, 2-segment tail, and collar', () => {
  const { manager } = createMockFixture();
  const cat = manager.spawnCat(0, 1, 0, 'tuxedo');

  assert.ok(cat, 'Cat mob created');
  assert.equal(cat.type, 'cat');
  assert.equal(cat.name, 'Cat');
  assert.equal(cat.breed, 'tuxedo');
  assert.equal(cat.health, 10);
  assert.equal(cat.maxHealth, 10);

  // Model parts
  assert.ok(cat.body, 'Cat has body mesh');
  assert.ok(cat.head, 'Cat has head mesh');
  assert.ok(cat.snout, 'Cat has snout/muzzle mesh');
  assert.ok(Array.isArray(cat.ears) && cat.ears.length === 2, 'Cat has 2 triangular ears');
  assert.ok(cat.collarMesh, 'Cat has collar mesh');
  assert.equal(cat.collarMesh.visible, false, 'Collar is initially hidden until tamed');
  assert.ok(Array.isArray(cat.legs) && cat.legs.length === 4, 'Cat has 4 articulated legs');
  assert.ok(cat.tailUpper, 'Cat has upper tail segment');
  assert.ok(cat.tailLower, 'Cat has lower tail segment');
});

test('Cat breeds: Supports Tuxedo, Tabby, Siamese, British Shorthair, and Ocelot', () => {
  const { manager } = createMockFixture();
  const breeds = ['tuxedo', 'tabby', 'siamese', 'british', 'ocelot'];

  for (const breed of breeds) {
    const cat = manager.spawnCat(0, 1, 0, breed);
    assert.equal(cat.breed, breed);
    assert.ok(cat.mesh.children.length > 0);
  }
});

test('Ocelot mob anatomy: Spawns as ocelot with distinct breed and full model parts', () => {
  const { manager } = createMockFixture();
  const ocelot = manager.spawnOcelot(2, 1, 2);

  assert.equal(ocelot.type, 'ocelot');
  assert.equal(ocelot.name, 'Ocelot');
  assert.equal(ocelot.breed, 'ocelot');
  assert.ok(ocelot.body);
  assert.ok(ocelot.head);
  assert.ok(ocelot.ears.length === 2);
  assert.ok(ocelot.legs.length === 4);
  assert.ok(ocelot.tailUpper);
});

test('Cat procedural texture generator: Pixel drawing with eyes, pupils, snout, whiskers, and paws', () => {
  const { manager } = createMockFixture();

  // Create a mock 2D canvas context to verify drawing operations
  const fillRectCalls = [];
  const fillStyleHistory = [];
  const mockCtx = {
    set fillStyle(val) {
      fillStyleHistory.push(val);
      this._style = val;
    },
    get fillStyle() {
      return this._style || '#000000';
    },
    fillRect(x, y, w, h) {
      fillRectCalls.push({ x, y, w, h, style: this._style });
    }
  };

  const mockCanvas = () => ({
    width: 64,
    height: 32,
    getContext: (type) => (type === '2d' ? mockCtx : null)
  });

  const tex = manager.createCatTexture('tuxedo', mockCanvas);
  assert.ok(tex, 'Texture created from mock canvas');
  assert.ok(fillRectCalls.length > 10, 'Multiple pixel art elements drawn');

  // Verify emerald green eyes (#22c55e) and pink nose (#f472b6) are painted
  assert.ok(fillStyleHistory.includes('#22c55e'), 'Emerald eyes included for Tuxedo');
  assert.ok(fillStyleHistory.includes('#f472b6'), 'Pink nose included for Tuxedo');
  assert.ok(fillStyleHistory.includes('#f3f4f6'), 'White chest and paws included for Tuxedo');
});

test('Cat sitting posture and tail swishing in update loop', () => {
  const { manager } = createMockFixture();
  const cat = manager.spawnCat(0, 1, 0, 'tuxedo');
  const player = { position: new THREE.Vector3(5, 1, 5), gamemode: 'survival', takeDamage() {} };

  // 1. Standing posture: Walking causes leg swings
  cat.wanderGoal = new THREE.Vector3(10, 1, 0);
  cat.wanderTimer = 10;
  manager.update(0.1, player);
  assert.notEqual(cat.legs[0].rotation.x, 0, 'Front leg swings when walking');
  // The body box is modelled upright and laid flat by a quarter turn. The walk pose reset it to 0, which stood
  // the body on end: the Inspector showed it right while static and wrong as soon as the showcase ran.
  assert.equal(cat.body.rotation.x, Math.PI / 2, 'Body lies horizontal while walking');

  // 2. Sitting posture: Toggled to sitting
  cat.isSitting = true;
  cat.velocity.set(0, 0, 0);
  manager.update(0.1, player);

  // Vanilla CatModel sits with the body at an eighth of a turn: front raised, not upright.
  assert.equal(cat.body.rotation.x, Math.PI / 4, 'Cat body raises its front when sitting');
  assert.equal(cat.legs[0].rotation.x, 0, 'Front legs extend straight when sitting');
  assert.equal(cat.legs[2].rotation.x, -Math.PI / 2, 'Hind legs tuck forward when sitting');
  assert.equal(cat.tailUpper.rotation.x, 1.35, 'Tail curls upward when sitting');
});

test('Wolf mob anatomy: Upgraded with ears, eyes, and black nose on muzzle', () => {
  const { manager } = createMockFixture();
  const wolf = manager.spawnWolf(0, 1, 0);

  assert.ok(wolf, 'Wolf mob created');
  assert.equal(wolf.type, 'wolf');
  // Wiki: wild wolves have 8 HP. This previously read 20, which is neither the wild value
  // (8) nor the tamed value (40).
  assert.equal(wolf.health, 8);
  assert.equal(wolf.maxHealth, 8);
  assert.equal(wolf.isTamed, false);

  // Head has attached ears, eyes, and muzzle has black nose
  assert.ok(wolf.head);
  assert.ok(wolf.head.children.length >= 3, 'Wolf head has attached ears and eyes');
  assert.ok(wolf.collarMesh);
  assert.equal(wolf.collarMesh.visible, false);
});
