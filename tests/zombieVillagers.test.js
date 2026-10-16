// Zombies hunting and converting villagers (src/zombieVillagers.js). Wiki (Villager); Tutorial:Curing a zombie villager.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { villagerTarget, convertsOnDeath, zombieDamage } from '../src/zombieVillagers.js';

const at = (x, type) => ({ type, health: 20, mesh: { position: new THREE.Vector3(x, 5, 0) } });

test('a zombie goes for a villager within 35 blocks unless the player is nearer', () => {
  const z = at(0, 'zombie'), v = at(10, 'villager');
  assert.equal(villagerTarget(z, [z, v], { position: new THREE.Vector3(20, 5, 0) }), v);
  assert.equal(villagerTarget(z, [z, v], { position: new THREE.Vector3(5, 5, 0) }), null, 'the player is nearer');
  assert.equal(villagerTarget(z, [z, v], { position: new THREE.Vector3(5, 5, 0), gamemode: 'creative' }), v, 'a creative player is no target');
  assert.equal(villagerTarget(z, [z, at(40, 'villager')], null), null, 'beyond 35 blocks');
  assert.equal(villagerTarget(at(0, 'skeleton'), [v], null), null);
});

test('"0% on Easy, 50% on Normal, and 100% on Hard"; only zombie kills convert', () => {
  let n = 0; for (let i = 0; i < 4000; i++) if (convertsOnDeath('zombie', 'normal')) n++;
  assert.ok(Math.abs(n / 4000 - 0.5) < 0.04);
  assert.equal(convertsOnDeath('husk', 'hard', () => 0.99), true);
  assert.equal(convertsOnDeath('zombie', 'easy', () => 0), false);
  assert.equal(convertsOnDeath('skeleton', 'hard', () => 0), false);
  assert.equal(zombieDamage('hard'), 4.5);
});
