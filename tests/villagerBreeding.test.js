// Villager breeding (src/villagerBreeding.js) against the wiki's Villager page. Found by the wiki-tutorial play-test
// (Creating a village): villagers could not breed.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { updateVillagerBreeding, WILLING_FOOD, VILLAGER_FOOD } from '../src/villagerBreeding.js';

function setup(beds = 3) {
  const mobs = [];
  const mk = (x) => ({ type: 'villager', health: 20, mesh: { position: new THREE.Vector3(x, 1, 0), scale: { setScalar() {} } } });
  const a = mk(0), b = mk(2); mobs.push(a, b);
  const drops = [];
  const manager = {
    mobs, entities: { droppedItems: drops },
    game: { bedManager: { beds: new Map(Array.from({ length: beds }, (_, i) => [`k${i}`, { footPos: [i * 3, 1, 5] }])) } },
    spawnVillager: (x, y, z) => { const v = mk(x); mobs.push(v); return v; },
  };
  const drop = (type, count, at) => drops.push({ itemType: type, count, age: 5, pickupDelay: 1, group: { position: at.clone(), removeFromParent() {} } });
  return { manager, a, b, drop, mobs };
}

test('"3 bread" makes a villager willing; two willing villagers and a free bed make a baby', () => {
  const { manager, a, b, drop, mobs } = setup();
  assert.equal(VILLAGER_FOOD.bread * 3, WILLING_FOOD);
  drop('bread', 3, a.mesh.position); drop('carrot', 12, b.mesh.position);
  updateVillagerBreeding(manager, a, 0.1);
  updateVillagerBreeding(manager, b, 0.1);
  assert.equal(mobs.length, 3);
  assert.equal(mobs[2].isBaby, true);
  assert.equal(a.breedCooldown, 300, 'five minutes before the next');
  assert.equal(a.foodPoints, 0);
});

test('no free bed, no baby; too little food, not willing', () => {
  const s1 = setup(2); // two beds, two villagers: none free
  s1.drop('bread', 3, s1.a.mesh.position); s1.drop('bread', 3, s1.b.mesh.position);
  updateVillagerBreeding(s1.manager, s1.a, 0.1); updateVillagerBreeding(s1.manager, s1.b, 0.1);
  assert.equal(s1.mobs.length, 2);
  const s2 = setup();
  s2.drop('bread', 2, s2.a.mesh.position);
  updateVillagerBreeding(s2.manager, s2.a, 0.1);
  assert.equal(s2.a.willing, false);
});
