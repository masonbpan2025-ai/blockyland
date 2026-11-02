import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tryAcquire, acquireSlot, heldSlots } from '../scripts/testSlots.mjs';

const tempDir = t => {
  const dir = mkdtempSync(join(tmpdir(), 'test-slots-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

/** A slot held by another, live process (this test's parent stands in for one). */
function holdAsOther(dir, n, pid = process.ppid) {
  mkdirSync(join(dir, `slot-${n}`), { recursive: true });
  writeFileSync(join(dir, `slot-${n}`, 'owner.json'), JSON.stringify({ pid, label: 'other run' }));
}

test('slots are handed out until none is left, and a release frees one', t => {
  const dir = tempDir(t);
  const first = tryAcquire({ dir, slots: 2 });
  const second = tryAcquire({ dir, slots: 2 });
  assert.ok(first && second);
  assert.equal(tryAcquire({ dir, slots: 2 }), null);
  first();
  assert.ok(existsSync(join(dir, 'slot-1')) && !existsSync(join(dir, 'slot-0')));
  const third = tryAcquire({ dir, slots: 2 });
  assert.ok(third);
  second(); third();
});

test('a slot whose owner has exited is taken over', t => {
  const dir = tempDir(t);
  holdAsOther(dir, 0, 999999);
  const release = tryAcquire({ dir, slots: 1, isAlive: () => false });
  assert.ok(release, 'stale slot should be reclaimed');
  release();
});

test('a slot held by a live process is not taken', t => {
  const dir = tempDir(t);
  holdAsOther(dir, 0);
  assert.equal(tryAcquire({ dir, slots: 1 }), null);
  assert.equal(heldSlots(dir).length, 1);
});

test('a run waits for memory only while another run holds a slot', async t => {
  const dir = tempDir(t);
  const lowMemory = { getFree: () => 512 * 1024 ** 2, minFree: 2 * 1024 ** 3, log: () => {} };

  // Alone: starts even with little memory free.
  const alone = await acquireSlot({ dir, slots: 4, ...lowMemory, sleep: async () => { throw new Error('waited'); } });
  alone();

  // Another run going: waits until memory frees up.
  holdAsOther(dir, 0);
  let free = 512 * 1024 ** 2;
  let waits = 0;
  const release = await acquireSlot({
    dir, slots: 4, minFree: 2 * 1024 ** 3, log: () => {}, getFree: () => free,
    sleep: async () => { waits++; free = 4 * 1024 ** 3; },
  });
  assert.equal(waits, 1);
  release();
});
