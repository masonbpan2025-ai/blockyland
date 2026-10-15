// Phantom spawning (PhantomMechanism) against the wiki's Phantom page, Java Edition. Found by the wiki-tutorial
// play-test (Phantom-proofing: they "spawn at night or during a thunderstorm", "only spawn above sea level", "within
// 20-34 blocks above the player, as long as there are no blocks to stop skylight access"): they spawned 28 above, at any
// hour, under any roof, in groups of up to 4 on every difficulty.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PhantomMechanism } from '../src/spawning/specialSpawners.js';

function setup({ skyDarken = 11, sky = 15, y = 30, difficulty = 'normal' } = {}) {
  const spawned = [];
  let n = 0;
  const manager = {
    peacefulMode: false, difficulty, skyDarken, mobs: [],
    world: { dimension: 'overworld', seaLevel: 22, getSkyLight: () => sky },
    specialRandom: { nextInt: (b) => (n++ % 2 ? b - 1 : 0), nextDouble: () => 0 },
    createMob: (type, x, yy, z) => { spawned.push({ type, x, y: yy, z }); return {}; },
  };
  const m = new PhantomMechanism({ mobSpawnManager: manager });
  m.insomniaTicks = 100000; m.timer = 5000; m.nextAttempt = 0;
  m.tick([{ x: 0.5, y, z: 0.5 }]);
  return spawned;
}

test('at night, with open sky, above sea level: a group 20-34 blocks above the player', () => {
  const s = setup();
  assert.ok(s.length >= 1 && s.length <= 3, `${s.length} on Normal (1-3)`);
  for (const p of s) assert.ok(p.y >= 50 && p.y <= 64, `y ${p.y} is 20-34 above 30`);
});

test('not by day, not under a roof, not below sea level', () => {
  assert.equal(setup({ skyDarken: 0 }).length, 0, 'day');
  assert.equal(setup({ sky: 0 }).length, 0, 'roofed');
  assert.equal(setup({ y: 10 }).length, 0, 'below sea level');
});

test('group size grows with difficulty: up to 2 on Easy, 4 on Hard', () => {
  assert.ok(setup({ difficulty: 'easy' }).length <= 2);
  assert.ok(setup({ difficulty: 'hard' }).length <= 4);
});
