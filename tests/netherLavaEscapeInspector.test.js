// Can the escape be SEEN in the Mob Inspector?
//
// The Inspector renders createMobDebugSession()'s mob, driven by session.tick(), and shows the
// snapshot plus the mob's own properties. A manager-level test does not prove the Inspector will
// show the escape, so this drives the real session the Inspector uses, including the lava
// environment its "Environment" control selects.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';
import { BLOCKS } from '../src/blocks.js';

THREE.TextureLoader.prototype.load = () => new THREE.Texture();

/** A debug session with a lava pool at the level the mob stands on. */
function lavaSession() {
  const session = createMobDebugSession(new THREE.Scene(), () => {});
  // The debug world is a flat floor at y<0 with y<3 following world.fluid. Put lava in the layer
  // the mob stands on (y=-1) so it is wading, which is what the reported map showed.
  const originalGet = session.world.getVoxel.bind(session.world);
  session.world.getVoxel = (x, y, z) => {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (y === -1 && x >= -2 && x <= 2 && z >= -2 && z <= 2) return BLOCKS.LAVA;
    return originalGet(x, y, z);
  };
  return session;
}

test('the Inspector can show a hoglin escaping lava', () => {
  const session = lavaSession();
  const mob = session.reset('hoglin');
  assert.ok(mob, 'the Inspector can spawn a hoglin');

  const start = mob.mesh.position.clone();
  const samples = [];
  for (let i = 0; i < 300; i++) {
    session.tick(1 / 30);
    const p = mob.mesh.position;
    const overLava = session.world.getVoxel(Math.floor(p.x), -1, Math.floor(p.z)) === BLOCKS.LAVA;
    const snap = session.snapshot();
    samples.push({ pos: snap.position.slice(), fleeing: Boolean(mob.fleeingHazard), overLava });
    if (!overLava) break;
  }

  const last = samples[samples.length - 1];
  assert.equal(last.overLava, false,
    `a hoglin should leave the Inspector's lava, but stayed at (${last.pos[0]}, ${last.pos[2]})`);
  assert.ok(samples.some(s => s.fleeing), 'the snapshot data should show it fleeing');
  assert.ok(samples.some(s => s.pos.join() !== start.toArray().map(n => +n.toFixed(2)).join()),
    'and its reported position should change, so a tester can watch it move');
});

test('the Inspector can show a piglin escaping lava', () => {
  const session = lavaSession();
  const mob = session.reset('piglin');
  assert.ok(mob, 'the Inspector can spawn a piglin');

  let escaped = false;
  for (let i = 0; i < 300; i++) {
    session.tick(1 / 30);
    const p = mob.mesh.position;
    if (session.world.getVoxel(Math.floor(p.x), -1, Math.floor(p.z)) !== BLOCKS.LAVA) { escaped = true; break; }
  }
  assert.equal(escaped, true, 'a piglin should leave the Inspector\'s lava');
});

test('a genuinely immune mob is NOT pushed out of the Inspector lava', () => {
  // The escape must stay specific: a blaze is supposed to sit in lava, and the Inspector is where
  // that difference is easiest to see.
  const session = lavaSession();
  const mob = session.reset('blaze');
  const start = mob.mesh.position.clone();
  for (let i = 0; i < 120; i++) session.tick(1 / 30);
  const p = mob.mesh.position;
  const overLava = session.world.getVoxel(Math.floor(p.x), -1, Math.floor(p.z)) === BLOCKS.LAVA;
  assert.equal(overLava, true, 'a blaze should still be sitting in the lava');
  assert.equal(Boolean(mob.fleeingHazard), false, 'and not be flagged as fleeing it');
  assert.ok(p.distanceTo(start) < 6, 'it should not have been teleported away');
});

test('every mob the Inspector offers can be ticked in lava without erroring', () => {
  // The escape runs before the AI chain for every ground mob, so a fault here would break the
  // Inspector for whatever mob triggered it.
  const session = lavaSession();
  const failures = [];
  for (const type of DEBUG_MOBS) {
    try {
      session.reset(type);
      for (let i = 0; i < 30; i++) session.tick(1 / 30);
    } catch (e) {
      failures.push(`${type}: ${e.message}`);
    }
  }
  assert.deepEqual(failures, [], `the escape must not break any mob:\n${failures.join('\n')}`);
});
