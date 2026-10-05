// Wolf parity with https://minecraft.wiki/w/Wolf
//
// The audit recorded "Wild should have 8 HP and tamed 40; taming does not change max
// health", against a flat 20 for both. It also listed wolf armor and the nine coat variants
// as missing.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import { AnimalBehaviors } from '../src/animalBehaviors.js';
import {
  WOLF_WILD_HEALTH, WOLF_TAMED_HEALTH, WOLF_DIMENSIONS, WOLF_TAME_CHANCE, WOLF_DEFAULT_COLLAR,
  isWolf, wolfMaxHealth, applyWolfTamed
} from '../src/wolfBehavior.js';
import { createMobDebugSession } from '../src/mobDebugSession.js';

function fixture() {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = { getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR), getHeightAt: () => 0 };
  const entities = new EntityManager(scene, world, sounds);
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: { wolf: new THREE.Texture() },
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  manager.animalBehaviors = new AnimalBehaviors(manager, world, sounds, entities);
  const player = { position: new THREE.Vector3(0, 1, 0), gamemode: 'survival', health: 20, keys: {}, takeDamage() {} };
  const inventory = {
    active: null, hotbar: [], storage: [], armor: {},
    getActiveItem() { return this.active; },
    consumeActiveItem(n = 1) { if (this.active) this.active.count -= n; },
    addItem(id, isBlock, count = 1) { this.storage.push({ id, isBlock, count }); return true; },
    updateUI() {}, updateHotbar() {}
  };
  player.inventory = inventory;
  manager.game = { player, inventory, difficulty: 'normal', weather: { weatherType: 'clear' }, controls: {} };
  return { manager, entities, player, inventory };
}

const held = (inventory, id, extra = {}) => { inventory.active = { id, count: 64, ...extra }; return inventory.active; };

function recordDrops(entities, into = []) {
  entities.spawnDroppedItem = (pos, itemType, isBlock = true, count = 1) => {
    into.push({ itemType, isBlock, count });
    return into[into.length - 1];
  };
  return into;
}

test('wild wolves have the reference 8 HP, not a flat 20', () => {
  const { manager } = fixture();
  const wolf = manager.spawnWolf(0, 1, 0);
  assert.equal(wolf.maxHealth, WOLF_WILD_HEALTH);
  assert.equal(wolf.maxHealth, 8, 'wiki: wild wolves have 8 HP');
  assert.equal(wolf.health, 8);
  assert.equal(wolf.isTamed, false);
});

test('taming raises maximum health from 8 to 40', () => {
  const { manager } = fixture();
  const wolf = manager.spawnWolf(0, 1, 0);
  applyWolfTamed(wolf);
  assert.equal(wolf.isTamed, true);
  assert.equal(wolf.maxHealth, WOLF_TAMED_HEALTH);
  assert.equal(wolf.maxHealth, 40, 'wiki: tamed wolves have 40 HP');
  // A wolf that was at full health is still at full health rather than looking hurt.
  assert.equal(wolf.health, 40, 'the health gain should carry into the current value');
});

test('taming an injured wolf keeps its injuries relative to the new maximum', () => {
  const { manager } = fixture();
  const wolf = manager.spawnWolf(0, 1, 0);
  wolf.health = 2; // badly hurt out of 8
  applyWolfTamed(wolf);
  assert.equal(wolf.maxHealth, 40);
  // The 32-point maximum gain is added, so the wolf keeps the same missing 6 HP.
  assert.equal(wolf.health, 34, `expected 34, got ${wolf.health}`);
  assert.ok(wolf.health < wolf.maxHealth, 'it must not be silently healed to full');
});

test('wolfMaxHealth reports the two wiki values and isTamed is the switch', () => {
  assert.equal(wolfMaxHealth(false), 8);
  assert.equal(wolfMaxHealth(true), 40);
  assert.equal(isWolf({ type: 'wolf' }), true);
  assert.equal(isWolf({ type: 'dog' }), false);
  assert.equal(applyWolfTamed({ type: 'cow' }), null, 'only wolves are affected');
});

test('the real taming interaction raises max health, not just a helper', () => {
  const { manager, player, inventory } = fixture();
  const wolf = manager.spawnWolf(0, 1, 0);
  // Wiki: each bone has a 1/3 chance, so drive the roll rather than sampling it.
  const original = Math.random;
  Math.random = () => 0;
  try {
    held(inventory, 'bone');
    assert.equal(manager.animalBehaviors.interact(wolf, player, inventory), true);
  } finally {
    Math.random = original;
  }
  assert.equal(wolf.isTamed, true, 'the wolf was tamed');
  assert.equal(wolf.maxHealth, 40, 'and taming raised its maximum health');
  assert.equal(wolf.owner, player);
  assert.equal(wolf.collarColor, WOLF_DEFAULT_COLLAR, 'wiki: the default collar is red');
  assert.equal(wolf.collarMesh.visible, true);
});

test('a failed taming attempt leaves the wolf wild at 8 HP', () => {
  const { manager, player, inventory } = fixture();
  const wolf = manager.spawnWolf(0, 1, 0);
  const original = Math.random;
  Math.random = () => 0.99; // above the 1/3 chance
  try {
    held(inventory, 'bone');
    manager.animalBehaviors.interact(wolf, player, inventory);
  } finally {
    Math.random = original;
  }
  assert.equal(wolf.isTamed, false);
  assert.equal(wolf.maxHealth, 8, 'a wild wolf stays at 8 HP');
  assert.equal(inventory.active.count, 63, 'the bone is still consumed');
});

test('the taming chance constant is the wiki one third', () => {
  assert.ok(Math.abs(WOLF_TAME_CHANCE - 1 / 3) < 1e-9);
});

test('the wolf hitbox matches the wiki for adults and babies', () => {
  assert.deepEqual(WOLF_DIMENSIONS.adult, { width: 0.6, height: 0.85 });
  assert.deepEqual(WOLF_DIMENSIONS.baby, { width: 0.3, height: 0.425 });
  const { manager } = fixture();
  assert.deepEqual(manager.getMobDimensions('wolf'), { width: 0.6, height: 0.85 });

  const baby = manager.spawnWolf(0, 1, 0, { isBaby: true });
  assert.equal(baby.isBaby, true);
  assert.equal(baby.mesh.scale.x, 0.5, 'the baby model is half scale');
  assert.deepEqual([baby.width, baby.height], [0.3, 0.425], 'and the baby hitbox is used');
});

test('wolf armor drops on death regardless of the killer', () => {
  const { manager, entities, player } = fixture();
  const drops = recordDrops(entities);
  const wolf = manager.spawnWolf(0, 1, 0, { wolfArmor: 'wolf_armor' });
  wolf.isTamed = true;
  assert.equal(wolf.wolfArmor, 'wolf_armor');

  manager.damageMob(wolf, 1000, null, false, player);
  for (let i = 0; i < 12; i++) manager.update(0.1, player);
  assert.ok(drops.some(d => d.itemType === 'wolf_armor'),
    `wiki: the armor is always dropped, got ${JSON.stringify(drops)}`);
});

test('a wolf without armor drops nothing extra', () => {
  const { manager, entities, player } = fixture();
  const drops = recordDrops(entities);
  const wolf = manager.spawnWolf(0, 1, 0);
  manager.damageMob(wolf, 1000, null, false, player);
  for (let i = 0; i < 12; i++) manager.update(0.1, player);
  assert.ok(!drops.some(d => d.itemType === 'wolf_armor'));
  assert.equal(wolf.wolfArmor, null);
});

test('the Inspector can spawn the wolf and reports the reference health', () => {
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const wolf = s.reset('wolf');
  assert.equal(wolf.type, 'wolf');
  assert.equal(s.snapshot().health, 8, 'Inspector telemetry shows 8 HP for a wild wolf');
  assert.equal(s.snapshot().maxHealth, 8);
  assert.equal(s.snapshot().tamed, false);
  assert.equal(s.snapshot().wolfArmor, null);
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 8);
});

test('existing taming, sitting and collar behaviour is unchanged', () => {
  const { manager, player, inventory } = fixture();
  const wolf = manager.spawnWolf(0, 1, 0);
  applyWolfTamed(wolf);
  wolf.owner = player;

  // Sitting toggle.
  held(inventory, null);
  manager.animalBehaviors.interact(wolf, player, inventory);
  assert.equal(wolf.isSitting, true, 'a tamed wolf sits on use');

  // Collar dyeing.
  held(inventory, 'blue_dye');
  manager.animalBehaviors.interact(wolf, player, inventory);
  assert.equal(wolf.collarColor, 'blue');
  assert.equal(inventory.active.count, 63, 'the dye is consumed');
});
