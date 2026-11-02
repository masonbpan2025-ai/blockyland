// Machine-wide job slots for test runs.
//
// Several agents often share this machine (AGENTS.md), and two full test runs at once can exhaust its memory.
// Horizon's parity runner shares PARITY_MACHINE_JOBS slots between every runner on the machine and admits a run only
// while memory is free; this is the same idea for scripts/test.mjs.
//
// A slot is a directory, `slot-<n>`, under the OS temp folder. mkdir is atomic, so two runs can't take the same
// slot. The owner's pid is written inside; a slot whose owner is gone is stale and is taken over. A run also waits
// while another run holds a slot and free memory is under the floor: alone, it always starts.
import { mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir, cpus, freemem } from 'node:os';
import { join } from 'node:path';

export const SLOT_DIR = join(tmpdir(), 'blockyland-test-slots');
export const DEFAULT_SLOTS = Math.max(1, Math.floor(cpus().length / 2));
export const MIN_FREE_BYTES = 2 * 1024 ** 3;

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

function owner(path) {
  try { return JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8')); } catch { return null; }
}

/** Slots held by live runs other than this process. */
export function heldSlots(dir = SLOT_DIR, isAlive = alive) {
  let names = [];
  try { names = readdirSync(dir).filter(n => n.startsWith('slot-')); } catch { return []; }
  return names.map(name => ({ name, owner: owner(join(dir, name)) }))
    .filter(s => s.owner && s.owner.pid !== process.pid && isAlive(s.owner.pid));
}

/** Try once to take a free or stale slot; returns its release function or null. */
export function tryAcquire({ dir = SLOT_DIR, slots = DEFAULT_SLOTS, label = '', isAlive = alive } = {}) {
  mkdirSync(dir, { recursive: true });
  for (let n = 0; n < slots; n++) {
    const path = join(dir, `slot-${n}`);
    try {
      mkdirSync(path);
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      const held = owner(path);
      // A slot is stale when its owner exited without releasing it (a killed run). A slot with no owner file yet
      // may be one another run created a moment ago, so it is left alone.
      if (!held || isAlive(held.pid)) continue;
      rmSync(path, { recursive: true, force: true });
      try { mkdirSync(path); } catch { continue; }
    }
    writeFileSync(join(path, 'owner.json'), JSON.stringify({ pid: process.pid, label, started: new Date().toISOString() }));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      rmSync(path, { recursive: true, force: true });
    };
  }
  return null;
}

/**
 * Wait for a slot, and for free memory when other runs hold slots.
 * @returns {Promise<() => void>} call it to release the slot (also done on process exit)
 */
export async function acquireSlot({
  dir = SLOT_DIR, slots = DEFAULT_SLOTS, label = '', minFree = MIN_FREE_BYTES,
  getFree = freemem, sleep = ms => new Promise(r => setTimeout(r, ms)), log = console.log, pollMs = 2000,
} = {}) {
  let said = '';
  for (;;) {
    const others = heldSlots(dir);
    const lowMemory = others.length > 0 && getFree() < minFree;
    const release = lowMemory ? null : tryAcquire({ dir, slots, label });
    if (release) {
      process.once('exit', release);
      return release;
    }
    const why = lowMemory
      ? `waiting for memory: ${(getFree() / 1024 ** 3).toFixed(1)} GB free, ${others.length} other test run(s) going`
      : `waiting for a test slot: all ${slots} taken (${others.map(o => o.owner.label || o.owner.pid).join(', ')})`;
    if (why.split(':')[0] !== said) { log(`${why}. Set BLOCKYLAND_TEST_SLOTS or pass --no-slots to override.`); said = why.split(':')[0]; }
    await sleep(pollMs);
  }
}
