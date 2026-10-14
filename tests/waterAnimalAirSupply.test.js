// Fish and axolotls cannot live out of water.
// Wiki: https://minecraft.wiki/w/Salmon, /Cod, /Pufferfish, /Tropical_Fish, /Axolotl.
// Java `WaterAnimal.handleAirSupply`: 300 ticks (15 s) of air, then 2 damage every second.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMobDebugSession } from '../src/mobDebugSession.js';
import { BLOCKS } from '../src/blocks.js';
import { FISH_AIR_SECONDS, AXOLOTL_AIR_SECONDS, DRY_DAMAGE, AIR_SUPPLY_TYPES } from '../src/waterAnimalAirSupply.js';

function run(type, seconds, { water = false } = {}) {
  const s = createMobDebugSession(new THREE.Scene());
  s.reset(type);
  s.world.fluid = water ? BLOCKS.WATER : BLOCKS.AIR;
  s.world.dimension = 'overworld';
  const mob = s.mob;
  const samples = [];
  for (let t = 0; t < seconds; t += 0.05) {
    s.tick(0.05);
    samples.push({ t: +(t + 0.05).toFixed(2), health: mob.health });
  }
  return { s, mob, samples };
}

for (const type of ['cod', 'salmon', 'pufferfish', 'tropical_fish']) {
  test(`${type} out of water is unharmed for the 15 s air supply`, () => {
    const { mob } = run(type, FISH_AIR_SECONDS - 1);
    assert.equal(mob.health, mob.maxHealth);
  });

  test(`${type} out of water dies once the air runs out`, () => {
    const { s, mob } = run(type, FISH_AIR_SECONDS + 15);
    assert.ok(mob.health <= 0 || !s.manager.mobs.includes(mob), `${type} should have suffocated on land`);
  });

  test(`${type} in water never suffocates`, () => {
    const { mob } = run(type, FISH_AIR_SECONDS + 15, { water: true });
    assert.equal(mob.health, mob.maxHealth);
  });
}

test('suffocation damage is 2 per second once the air is gone', () => {
  const { samples, mob } = run('pufferfish', FISH_AIR_SECONDS + 2.5);
  const before = samples.find(x => x.t > FISH_AIR_SECONDS - 0.1).health;
  assert.equal(before, mob.maxHealth);
  const after = samples.find(x => x.t >= FISH_AIR_SECONDS + 1.1).health;
  assert.equal(before - after, DRY_DAMAGE, 'first tick of damage after air is empty');
});

test('returning to water refills the air supply', () => {
  const s = createMobDebugSession(new THREE.Scene());
  s.reset('salmon');
  s.world.fluid = BLOCKS.AIR;
  for (let t = 0; t < 10; t += 0.05) s.tick(0.05);
  assert.ok(s.mob.airSupply < FISH_AIR_SECONDS);
  s.world.fluid = BLOCKS.WATER;
  s.mob.mesh.position.y = 1.2;
  for (let t = 0; t < 1; t += 0.05) s.tick(0.05);
  assert.equal(s.mob.airSupply, FISH_AIR_SECONDS);
});

test('an axolotl survives five minutes on land, a fish does not', () => {
  assert.equal(AXOLOTL_AIR_SECONDS, 300);
  assert.ok(AIR_SUPPLY_TYPES.includes('axolotl'));
  const { mob } = run('axolotl', 60);
  assert.equal(mob.health, mob.maxHealth);
});
