// Item (entity): "an item despawns after existing for 6000 game ticks (5 minutes)". Found by the wiki-tutorial
// play-test (The second day: "head back to your death location to collect your items within 5 minutes"): only XP
import { readFileSync } from 'node:fs';
// orbs had the timer, and dropped items stayed forever.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EntityManager, ITEM_DESPAWN_SECONDS } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';

test('a dropped item is gone after five minutes, not before', () => {
  const world = { getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR) };
  const em = new EntityManager(new THREE.Scene(), world, new Proxy({}, { get: () => () => {} }));
  em.spawnDroppedItem(new THREE.Vector3(0.5, 1.2, 0.5), 'stick', false, 1);
  const player = { position: new THREE.Vector3(20, 1, 20), velocity: new THREE.Vector3() };
  const inventory = { addItem: () => false };
  assert.equal(ITEM_DESPAWN_SECONDS, 300);
  for (let t = 0; t < 299; t += 0.1) em.update(0.1, player, inventory);
  assert.equal(em.droppedItems.length, 1, 'still there at 4 min 59 s');
  for (let t = 0; t < 1.5; t += 0.1) em.update(0.1, player, inventory);
  assert.equal(em.droppedItems.length, 0, 'gone at 5 min');
});

// Beginner's guide: "On death, you will drop any items ... You can then retrieve your items by returning to where you
// died". The pickup did not check for death, so the drop flew back into the dead player's inventory a second later.
test('a dead player does not pick up items', () => {
  const world = { getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR) };
  const em = new EntityManager(new THREE.Scene(), world, new Proxy({}, { get: () => () => {} }));
  em.spawnDroppedItem(new THREE.Vector3(0.5, 1.2, 0.5), 'stick', false, 1);
  const added = [];
  const inventory = { addItem: (...a) => { added.push(a); return true; } };
  const player = { position: new THREE.Vector3(0.5, 1, 0.5), velocity: new THREE.Vector3(), isDead: true, health: 0 };
  for (let i = 0; i < 30; i++) em.update(0.1, player, inventory);
  assert.equal(added.length, 0, 'nothing picked up while dead');
  player.isDead = false; player.health = 20;
  for (let i = 0; i < 5; i++) em.update(0.1, player, inventory);
  assert.equal(added.length, 1, 'and picked up once alive');
});

test('pickup delay: half a second for a dropped item, 2 seconds for one a player threw (wiki, Item (entity))', () => {
  const src = readFileSync(new URL('../src/entities.js', import.meta.url), 'utf8');
  assert.match(src, /pickupDelay: options\.pickupDelay \?\? \(options\.thrownByPlayer \? 2\.0 : 0\.5\)/);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /dropHeldItem[\s\S]{0,1500}thrownByPlayer: true/);
});
