// Knockback is a Vector3 everywhere, and the motion code accepts a plain {x, z} as well.
//
// The bug: a goat's ram stored `target.knockback = { x, z }`, a plain object. The next time the polar bear it hit was
// stepped, the motion code called `knockback.lengthSq()` on it, threw, and the bear stopped updating for good.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { knockbackVector } from '../src/mobMotion.js';

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

test('a plain {x, z} knockback becomes a Vector3 with the same push', () => {
  const v = knockbackVector({ x: 2, z: -3 });
  assert.ok(v instanceof THREE.Vector3);
  assert.equal(v.x, 2);
  assert.equal(v.y, 0, 'knockback is horizontal');
  assert.equal(v.z, -3);
  assert.equal(typeof v.lengthSq(), 'number', 'the method the motion code calls now exists');
});

test('a Vector3 knockback is kept as it is, so the push that was applied is not copied away', () => {
  const original = new THREE.Vector3(1, 0, 1);
  assert.equal(knockbackVector(original), original);
});

test('a missing or malformed knockback is zero, not a crash', () => {
  for (const raw of [undefined, null, {}, { x: 'nope' }, { x: NaN, z: undefined }]) {
    const v = knockbackVector(raw);
    assert.equal(v.x, 0);
    assert.equal(v.z, 0);
    assert.equal(v.lengthSq(), 0);
  }
});

test('the goat\'s ram writes a Vector3', () => {
  const src = read('src/goatBehavior.js');
  assert.match(src, /target\.knockback = new THREE\.Vector3\(-dir\.x \* knockback, 0, -dir\.z \* knockback\);/);
  assert.doesNotMatch(src, /target\.knockback = \{/);
});

test('no code in the game writes a plain-object knockback any more', () => {
  const dir = join(process.cwd(), 'src');
  const offenders = [];
  const visit = (folder) => {
    for (const name of readdirSync(folder, { withFileTypes: true })) {
      const full = join(folder, name.name);
      if (name.isDirectory()) visit(full);
      else if (name.name.endsWith('.js')) {
        const text = readFileSync(full, 'utf8');
        if (/\.knockback\s*=\s*\{/.test(text)) offenders.push(full);
      }
    }
  };
  visit(dir);
  assert.deepEqual(offenders, [], 'every knockback write is a Vector3');
});

test('the motion code normalises the knockback before it reads it', () => {
  const src = read('src/mobMotion.js');
  const reads = [...src.matchAll(/const knockback = mob\.knockback \|\| new THREE\.Vector3\(\);/g)];
  assert.ok(reads.length >= 2, 'both motion paths read the knockback');
  for (const match of reads) {
    const before = src.slice(Math.max(0, match.index - 120), match.index);
    assert.match(before, /if \(mob\.knockback\) mob\.knockback = knockbackVector\(mob\.knockback\);/, 'normalised just before the read');
  }
});

test('the mob update makes the knockback a Vector3 before any mover reads it', () => {
  // A mover that reads it before the motion code does (a polar bear's) turned a plain {x, z} into a NaN height and
  // an update error that stopped the mob. The per-mob update normalises it first, inside its try.
  const src = read('src/mobs.js');
  const loop = src.indexOf('motionStartX = mob.mesh.position.x; motionStartZ = mob.mesh.position.z;');
  assert.ok(loop > 0, 'the per-mob update loop');
  const next = src.slice(loop, loop + 2000);
  assert.match(next, /if \(mob\.knockback\) mob\.knockback = knockbackVector\(mob\.knockback\);/);
  assert.ok(next.indexOf('knockbackVector') < next.indexOf('dismountIfChickenDead'), 'before anything else in the update');
});
