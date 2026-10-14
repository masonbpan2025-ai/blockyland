// A harmed camel runs away, and a sitting camel cannot be pushed.
//
// The bug: camels never moved when hit. The camel branch read `mob.fleeing`, a flag nothing ever set, while the hurt
// code records `fleeFrom` and `fleeTime`. Reference: https://minecraft.wiki/w/Camel: "Camels immediately flee after
// being harmed, even when sitting." and "A sitting camel cannot be pushed by players or mobs."
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { camelFleeVelocity, updateCamelSitting, CAMEL_SPEED } from '../src/camelBehavior.js';

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

function camel(over = {}) {
  return { type: 'camel', isBaby: false, isSitting: false, sitTimer: 0, standTimer: 99, ...over };
}

test('a harmed camel runs directly away from the blow, at sprint speed', () => {
  const v = camelFleeVelocity({ x: 10, z: 0 }, { x: 8, z: 0 }, CAMEL_SPEED.sprint);
  assert.ok(Math.abs(v.x - CAMEL_SPEED.sprint) < 1e-9, 'away from a blow struck from the west: east');
  assert.ok(Math.abs(v.z) < 1e-9);
  const diagonal = camelFleeVelocity({ x: 1, z: 1 }, { x: 0, z: 0 }, 10);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - 10) < 1e-9, 'the speed is held on a diagonal');
  assert.ok(diagonal.x > 0 && diagonal.z > 0);
});

test('struck on the spot, a camel still runs, along +x, rather than standing still', () => {
  const v = camelFleeVelocity({ x: 3, z: 3 }, { x: 3, z: 3 }, 7);
  assert.deepEqual(v, { x: 7, z: 0 });
});

test('with nothing to run from, there is no flight', () => {
  assert.equal(camelFleeVelocity(null, { x: 0, z: 0 }), null);
  assert.equal(camelFleeVelocity({ x: 0, z: 0 }, null), null);
});

test('the flight speed is the sprint speed, the wiki giving none of its own', () => {
  const v = camelFleeVelocity({ x: 1, z: 0 }, { x: 0, z: 0 });
  assert.ok(Math.abs(v.x - CAMEL_SPEED.sprint) < 1e-9);
});

test('a sitting camel that is harmed stands up at once (it flees even when sitting)', () => {
  const mob = camel({ isSitting: true });
  const result = updateCamelSitting(mob, 1 / 30, { clearance: 3, fleeing: true, alerted: true });
  assert.equal(result, 'stood', 'the wiki\'s "even when sitting"');
  assert.equal(mob.isSitting, false);
});

test('a sitting camel with no room to stand stays down, as the wiki says, rather than suffocating', () => {
  const mob = camel({ isSitting: true });
  const result = updateCamelSitting(mob, 1 / 30, { clearance: 0, fleeing: true, alerted: true });
  assert.notEqual(result, 'stood');
  assert.equal(mob.isSitting, true);
});

test('the camel branch reads the flight the hurt code records, not the flag nothing sets', () => {
  const src = read('src/mobs.js');
  const at = src.indexOf("if(mob.type==='camel'){");
  const branch = src.slice(at, src.indexOf("if(mob.type==='wandering_trader'){", at));
  assert.match(branch, /const fleeing = \(mob\.fleeTime \?\? 0\) > 0;/);
  assert.doesNotMatch(branch, /mob\.fleeing === true/, 'the unset flag is gone from the camel branch');
  assert.match(branch, /camelFleeVelocity\(mob\.mesh\.position, mob\.fleeFrom, CAMEL_SPEED\.sprint\)/);
  assert.match(branch, /mob\.fleeTime = Math\.max\(0, mob\.fleeTime - dt\)/, 'the flight ends when its timer does');
});

test('a sitting camel is not pushed: its knockback is cleared while it sits and is not fleeing', () => {
  const src = read('src/mobs.js');
  const at = src.indexOf("if(mob.type==='camel'){");
  const branch = src.slice(at, src.indexOf("if(mob.type==='wandering_trader'){", at));
  assert.match(branch, /else if \(mob\.isSitting\) \{[\s\S]*?mob\.knockback\?\.set\?\.\(0, 0, 0\);/);
});

test('harm sets the flight the camel branch now reads', () => {
  const src = read('src/mobs.js');
  assert.match(src, /mob\.fleeFrom = knockbackOrigin\.clone\(\);\s*mob\.fleeTime = 2\.5;/, 'the hurt code records a 2.5 s flight');
});
