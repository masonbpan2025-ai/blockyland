// Players push each other apart (src/entityPush.js), as Minecraft Java's Entity.push does. On the replication server
// players walked through each other, stood in one spot, and one pillared up inside another's head (run sonnet30).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { pushBetween, boxesOverlap, pushPlayersApart } from '../src/entityPush.js';

/** A player stand-in in a world whose solid cells are listed (no floor needed: pushing is horizontal). */
function player(x, z, solid = new Set(), y = 0) {
  return { position: new THREE.Vector3(x, y, z), width: 0.6, height: 1.8,
    checkCollision(p) { for (const cx of [Math.floor(p.x - .3), Math.floor(p.x + .3)]) for (const cz of [Math.floor(p.z - .3), Math.floor(p.z + .3)]) if (solid.has(`${cx},${cz}`)) return true; return false; } };
}

test('the push between two centres follows Java: 0.05 scaled by 1/sqrt(max offset)', () => {
  // Hand calculation: offset (0.25, 0): d = 0.25 -> sqrt 0.5; unit-ish offset (0.5, 0); f = min(1, 2) = 1; x 0.5 x 0.05.
  const p = pushBetween({ x: 0, z: 0 }, { x: 0.25, z: 0 });
  assert.ok(Math.abs(p.x - 0.025) < 1e-12 && p.z === 0, JSON.stringify(p));
  // Offset (0.5, 0.5): d = 0.5 -> sqrt 0.7071; offset / d = 0.7071 each; f = 1; x 0.05 = 0.03536 each.
  const q = pushBetween({ x: 0, z: 0 }, { x: 0.5, z: 0.5 });
  assert.ok(Math.abs(q.x - 0.0353553) < 1e-6 && Math.abs(q.z - 0.0353553) < 1e-6, JSON.stringify(q));
  assert.equal(pushBetween({ x: 0, z: 0 }, { x: 0.005, z: 0 }), null, 'centres (almost) together: Java pushes nothing');
});

test('two players standing in each other move apart until their boxes no longer overlap', () => {
  const a = player(0.5, 0.5), b = player(0.7, 0.5);
  assert.ok(boxesOverlap(a.position, b.position));
  let ticks = 0;
  while (boxesOverlap(a.position, b.position) && ticks < 200) { pushPlayersApart([a, b]); ticks++; }
  assert.ok(!boxesOverlap(a.position, b.position), 'they end up side by side');
  assert.ok(ticks < 40, `within two seconds (${ticks} ticks)`);
  assert.ok(a.position.x < 0.5 && b.position.x > 0.7, 'each moved away from the other');
});

test('players apart, above one another, or spectating are not pushed', () => {
  const a = player(0, 0), far = player(2, 0), above = player(0.1, 0, new Set(), 2), ghost = Object.assign(player(0.1, 0), { gamemode: 'spectator' });
  assert.equal(pushPlayersApart([a, far]), 0);
  assert.equal(pushPlayersApart([a, above]), 0, 'a player standing on a block above another is not in their box');
  assert.equal(pushPlayersApart([a, ghost]), 0);
});

test('a push never moves a player into a wall', () => {
  // A wall at x = 1: b, pressed against it, cannot be pushed further; a still is.
  const wall = new Set(['1,0']);
  const a = player(0.4, 0.5, wall), b = player(0.69, 0.5, wall);
  for (let i = 0; i < 20; i++) pushPlayersApart([a, b]);
  assert.ok(b.position.x <= 0.7, `b stays out of the wall (${b.position.x.toFixed(3)})`);
  assert.ok(a.position.x < 0.4, 'a is pushed back instead');
});
