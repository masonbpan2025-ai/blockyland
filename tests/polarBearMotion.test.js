import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { posePolarBear } from '../src/polarBearBehavior.js';
import { createMobDebugSession } from '../src/mobDebugSession.js';
import { MobShowcase } from '../src/mobShowcase.js';

function bear(isBaby = false) {
  const s = createMobDebugSession(new THREE.Scene());
  s.reset('polar_bear'); s.mob.isBaby = isBaby;
  return s.mob;
}
test('adult and cub walk with opposing forelegs and diagonal pairs through complete strides', () => {
  for (const baby of [false, true]) {
    const m = bear(baby); m.velocity.set(0, 0, 1.2);
    const signs = new Set();
    for (let i = 0; i < 300; i++) {
      posePolarBear(m, i / 10);
      const [fl, fr, bl, br] = m.legs.map(l => l.rotation.x);
      assert.equal(fl, br); assert.equal(fr, bl); assert.equal(fl + fr, 0); assert.equal(bl + br, 0);
      if (Math.abs(fl) > 0.1) signs.add(Math.sign(fl));
    }
    assert.equal(signs.size, 2, 'both halves of the stride actually occur');
  }
});
test('stopping settles the feet and head scans gently without rotating the body', () => {
  const m = bear(); m.velocity.set(1.2, 0, 0);
  for (let i = 0; i < 60; i++) posePolarBear(m, i / 10);
  m.velocity.set(0, 0, 0);
  const headings = [];
  for (let i = 60; i < 600; i++) {
    posePolarBear(m, i / 10); headings.push(m.head.rotation.y);
    assert.ok(Math.abs(m.head.rotation.y) <= 0.57);
    assert.ok(Math.abs(m.head.rotation.x) <= 0.09);
    assert.equal(m.mesh.rotation.x, 0);
  }
  assert.ok(m.legs.every(l => Math.abs(l.rotation.x) < 0.001));
  assert.ok(Math.max(...headings) - Math.min(...headings) > 0.7);
});
test('stride cadence follows speed and vertical motion alone does not walk', () => {
  const slow = bear(), fast = bear(), vertical = bear();
  slow.velocity.z = 0.6; fast.velocity.z = 1.2; vertical.velocity.y = 3;
  for (let i = 0; i < 60; i++) for (const m of [slow, fast, vertical]) posePolarBear(m, i / 10);
  assert.ok(Math.abs(fast.polarWalkPhase - slow.polarWalkPhase * 2) < 1e-9);
  assert.ok(vertical.legs.every(l => l.rotation.x === 0));
});
test('rearing still overrides gait and returns smoothly to a neutral pose', () => {
  const m = bear(); m.velocity.z = 1.2; m.isMauling = true;
  for (let i = 0; i < 30; i++) posePolarBear(m, i / 10);
  assert.equal(m.mesh.rotation.x, -0.45);
  assert.ok(m.legs.every(l => l.rotation.x === -0.7));
  m.isMauling = false; m.velocity.set(0, 0, 0); posePolarBear(m, 3);
  assert.equal(m.mesh.rotation.x, 0);
  assert.ok(m.legs.every(l => Math.abs(l.rotation.x) < 0.01));
});
test('Inspector observes both gait and idle head scenarios through real simulation ticks', () => {
  const s = createMobDebugSession(new THREE.Scene());
  for (const id of ['polar_bear_diagonal_walk', 'polar_bear_idle_look']) {
    const show = new MobShowcase(s); show.start('polar_bear', id);
    for (let i = 0; show.running && i < 500; i++) show.tick(1 / 60);
    assert.equal(show.running, false);
    assert.equal(show.results.length, 1);
    assert.equal(show.results[0].status, 'observed', JSON.stringify(show.results));
  }
});
