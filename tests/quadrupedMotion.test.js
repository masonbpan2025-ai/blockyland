import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMobDebugSession } from '../src/mobDebugSession.js';
import { MobShowcase, mobScenarios } from '../src/mobShowcase.js';
import { QUADRUPED_MOBS, quadrupedMode, quadrupedLegs, updateQuadrupedMotion } from '../src/quadrupedMotion.js';

for (const type of QUADRUPED_MOBS) {
  test(`${type}: actual native model gets anatomical gait and gentle head motion`, () => {
    const s = createMobDebugSession(new THREE.Scene()); s.reset(type);
    const m = s.mob; m.onGround = true; m.health = m.maxHealth;
    m.isHostile = false; m.isSitting = false; m.isSleeping = false;
    const legs = quadrupedLegs(m);
    assert.equal(legs.length, 4, `${type} exposes four limbs`);
    assert.ok(m.head, `${type} exposes a head`);
    const directions = new Set(); const heads = [];
    for (let i = 0; i < 360; i++) {
      updateQuadrupedMotion(m, 1 / 60, { distance: 1.2 / 60 });
      heads.push(m.head.rotation.y);
      if (quadrupedMode(m) === 'hop') continue;
      const values = legs.map(l => l.mesh.rotation.x * l.side * (l.front ? 1 : -1));
      assert.ok(values.every(v => Math.abs(v - values[0]) < 1e-9), 'front legs oppose, diagonals match irrespective of array ordering');
      if (Math.abs(values[0]) > 0.08) directions.add(Math.sign(values[0]));
    }
    if (quadrupedMode(m) !== 'hop') assert.equal(directions.size, 2, 'both stride directions occur');
    assert.ok(Math.max(...heads) - Math.min(...heads) > 0.08, 'head moves independently');
    for (let i = 0; i < 120; i++) updateQuadrupedMotion(m, 1 / 60);
    if (quadrupedMode(m) !== 'hop') assert.ok(legs.every(l => Math.abs(l.mesh.rotation.x) < 1e-6), 'feet settle');
    assert.ok(mobScenarios(type).some(c => /idle_(head|look)/.test(c.id)), 'visible head scenario');
  });
}

test('special actions, swimming, hops and rider head control are not overwritten', () => {
  for (const action of ['isSitting', 'isSleeping', 'isRolling', 'isLyingDown', 'isMauling', 'pouncePhase', 'ramState', 'spitCharge', 'tuskAttackTime', 'grazeTime', 'rearTime', 'playingDead', 'tongueTarget', 'isLayingEggs']) {
    const s = createMobDebugSession(new THREE.Scene()); s.reset('cow');
    const m = s.mob; m[action] = true;
    m.legs.forEach(l => l.rotation.x = 1); m.head.rotation.set(0.4, 0.3, 0);
    updateQuadrupedMotion(m, 0.1, { distance: 0.1 });
    assert.ok(m.legs.every(l => l.rotation.x === 1), action);
    assert.equal(m.head.rotation.x, 0.4); assert.equal(m.head.rotation.y, 0.3);
  }
  for (const type of ['turtle', 'axolotl', 'rabbit', 'frog']) {
    const s = createMobDebugSession(new THREE.Scene()); s.reset(type); s.mob.onGround = true;
    const legs = quadrupedLegs(s.mob); legs.forEach(l => l.mesh.rotation.x = 0.4);
    updateQuadrupedMotion(s.mob, 0.1, { distance: 0.1, inWater: true });
    assert.ok(legs.every(l => l.mesh.rotation.x === 0.4));
  }
  const s = createMobDebugSession(new THREE.Scene()); s.reset('horse');
  s.mob.rider = {}; s.mob.head.rotation.y = 0.4;
  updateQuadrupedMotion(s.mob, 0.1, { distance: 0.1 });
  assert.equal(s.mob.head.rotation.y, 0.4);
});

test('axolotl eyes, smile and gills follow its head without changing the rest pose', () => {
  const s = createMobDebugSession(new THREE.Scene()); s.reset('axolotl');
  const m = s.mob;
  assert.equal(m.gillsL.parent, m.head); assert.equal(m.gillsR.parent, m.head);
  assert.equal(m.head.children.length, 5);
  const before = m.gillsL.getWorldPosition(new THREE.Vector3());
  m.onGround = true;
  for (let i=0;i<120;i++) updateQuadrupedMotion(m,1/60);
  const after = m.gillsL.getWorldPosition(new THREE.Vector3());
  assert.ok(before.distanceTo(after)>0.01, 'face and frills turn with the head');
});

test('nearby player interest is bounded and idle nods never accumulate on the model pitch', () => {
  const s = createMobDebugSession(new THREE.Scene()); s.reset('camel_husk');
  const m = s.mob; m.onGround = true; m.head.rotation.x = 0.12;
  const player = { position: new THREE.Vector3(3, 0, 0) };
  for (let i = 0; i < 2400; i++) updateQuadrupedMotion(m, 1 / 60, { player });
  assert.ok(Math.abs(m.head.rotation.x - 0.12) < 0.03, 'undead model droop preserved without drift');
  assert.ok(m.head.rotation.y > 0.15 && m.head.rotation.y <= 0.25);
});

test('custom four-leg rigs participate, while spiders and six-legged rigs do not', () => {
  const legs = [new THREE.Object3D(), new THREE.Object3D(), new THREE.Object3D(), new THREE.Object3D()];
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([x,z],i)=>legs[i].position.set(x,0,z));
  const m = { type:'custom', isCustomMob:true, legs, head:new THREE.Object3D(), mesh:new THREE.Object3D(), health:10 };
  assert.equal(quadrupedMode(m), 'walk');
  updateQuadrupedMotion(m, 0.1, { distance:0.1 });
  assert.equal(legs[0].rotation.x, legs[3].rotation.x);
  assert.equal(legs[0].rotation.x + legs[1].rotation.x, 0);
  assert.equal(quadrupedMode('spider'), null); assert.equal(quadrupedMode('sniffer'), null);
  m.legs.push(new THREE.Object3D(),new THREE.Object3D()); assert.equal(quadrupedMode(m), null);
});

test('different animals do not perform identical synchronized idle glances', () => {
  const s = createMobDebugSession(new THREE.Scene()); s.reset('cow'); const a = s.mob;
  s.reset('cow'); const b = s.mob; a.yaw = 0; b.yaw = 1;
  for (let i=0;i<120;i++) for (const m of [a,b]) updateQuadrupedMotion(m,1/60);
  assert.ok(Math.abs(a.head.rotation.y-b.head.rotation.y)>0.1);
});

test('all quadruped motion Inspector scenarios report observed through the live simulation', () => {
  const failures = [];
  for (const type of QUADRUPED_MOBS) {
    const s = createMobDebugSession(new THREE.Scene());
    for (const c of mobScenarios(type).filter(c=>c.id.startsWith('quadruped_') || c.id.startsWith('polar_bear_'))) {
      const show = new MobShowcase(s); show.start(type, c.id);
      for (let i=0;show.running&&i<600;i++) show.tick(1/60);
      for (const r of show.results) if(r.status!=='observed') failures.push(`${type}: ${r.id}: ${r.status}: ${r.detail}`);
    }
  }
  assert.deepEqual(failures, []);
});
