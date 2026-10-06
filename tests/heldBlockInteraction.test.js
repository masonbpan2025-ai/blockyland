import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS } from '../src/blocks.js';

/**
 * The inventory holds a block by its NUMERIC id and an item by its NAME. `canInteract` and
 * `interact` are written against names and used to call `itemId.endsWith(...)` directly, which threw
 * `itemId.endsWith is not a function` on any block.
 *
 * That mattered far outside animal handling: `Game.handleRightClick` asks `canInteract` for every mob
 * in the world *before* it reaches block placement, so with a sheep, wolf or horse anywhere on the
 * map, holding any block and right-clicking threw and no block could ever be placed.
 */
function harness() {
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    setVoxel() {},
  };
  const sounds = new Proxy({}, { get: () => () => {} });
  const manager = new MobManager(new THREE.Scene(), world, sounds, {
    spawnDroppedItem() {},
    spawnXpOrbs() {},
    spawnParticleBurst() {},
  });
  const player = {
    position: new THREE.Vector3(5, 1, 5),
    camera: {
      position: new THREE.Vector3(5, 2.6, 5),
      getWorldDirection: (v) => v.set(0, 0, 1),
    },
    gamemode: 'creative',
    inventory: {
      items: [{ id: BLOCKS.WHITE_WOOL, isBlock: true, count: 64 }],
      activeSlot: 0,
      getActiveItem() { return this.items[this.activeSlot] || null; },
      consumeActiveItem() {},
    },
  };
  return { manager, behaviors: manager.animalBehaviors, player };
}

/** Every mob whose interaction rules run a string operation on the item id. */
function spawnAssortment(manager) {
  return [
    manager.spawnSheep(5, 1, 5),
    manager.spawnWolf(7, 1, 5),
    manager.spawnHorse(9, 1, 5),
    manager.spawnCow(11, 1, 5),
    manager.spawnPig(13, 1, 5),
    manager.spawnChicken(15, 1, 5),
  ];
}

test('holding a block: asking whether a mob can be interacted with does not throw', () => {
  const { manager, behaviors, player } = harness();
  for (const mob of spawnAssortment(manager)) {
    assert.doesNotThrow(
      () => behaviors.canInteract(mob, player, player.inventory),
      `${mob.type}: canInteract threw on a held block`,
    );
  }
});

test('holding a block is not an interaction, for every mob scanned in the right-click loop', () => {
  const { manager, behaviors, player } = harness();
  // This is the shape of the offending loop: it asks about every living mob, not just a target.
  const sheep = manager.spawnSheep(5, 1, 5);
  const cow = manager.spawnCow(7, 1, 5);
  const chicken = manager.spawnChicken(9, 1, 5);
  for (const mob of [sheep, cow, chicken]) {
    assert.equal(behaviors.canInteract(mob, player, player.inventory), false, `${mob.type}: a held block is not an interaction`);
  }
});

test('interacting while holding a block does not throw either', () => {
  const { manager, behaviors, player } = harness();
  const sheep = manager.spawnSheep(5, 1, 5);
  const wolf = manager.spawnWolf(7, 1, 5);
  assert.doesNotThrow(() => behaviors.interact(sheep, player, player.inventory), 'sheep: interact threw on a held block');
  assert.doesNotThrow(() => behaviors.interact(wolf, player, player.inventory), 'wolf: interact threw on a held block');
});

test('name-keyed interactions still work while items, not blocks, are held', () => {
  const { manager, behaviors, player } = harness();
  const sheep = manager.spawnSheep(5, 1, 5);

  // Woolly: shears take the wool, and dye is offered. Sheared: neither, until the wool regrows.
  player.inventory.items[0] = { id: 'shears', count: 1, isBlock: false };
  assert.equal(behaviors.canInteract(sheep, player, player.inventory), true, 'shears on a woolly sheep');

  player.inventory.items[0] = { id: 'red_dye', count: 1, isBlock: false };
  assert.equal(behaviors.canInteract(sheep, player, player.inventory), true, 'dye on a woolly sheep');

  sheep.isSheared = true;
  assert.equal(behaviors.canInteract(sheep, player, player.inventory), false, 'dye is not offered once the wool is gone');
  player.inventory.items[0] = { id: 'shears', count: 1, isBlock: false };
  assert.equal(behaviors.canInteract(sheep, player, player.inventory), false, 'nor are shears');

  player.inventory.items[0] = { id: BLOCKS.WHITE_WOOL, isBlock: true, count: 64 };
  assert.equal(behaviors.canInteract(sheep, player, player.inventory), false, 'and a held block is never an interaction');
});
