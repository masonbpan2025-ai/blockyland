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

// Time since rest is each player's own (Java's TIME_SINCE_REST statistic): in the replication server one counter
// for the whole world, ticked once per player, brought phantoms after 15 minutes to a team that never slept.
function twoPlayers() {
  const spawned = [];
  let n = 0;
  const manager = {
    peacefulMode: false, difficulty: 'normal', skyDarken: 11, mobs: [],
    world: { dimension: 'overworld', seaLevel: 22, getSkyLight: () => 15 },
    specialRandom: { nextInt: (b) => (n++ % 2 ? b - 1 : 0), nextDouble: () => 0 },
    createMob: (type, x, y, z) => { spawned.push({ type, x, y, z }); return {}; },
  };
  const rested = { name: 'rested' }, sleepless = { name: 'sleepless' };
  const players = [{ x: 0.5, y: 30, z: 0.5, entity: rested }, { x: 500.5, y: 30, z: 500.5, entity: sleepless }];
  return { m: new PhantomMechanism({ mobSpawnManager: manager }), spawned, players, rested, sleepless };
}

test('each player has their own time since rest: phantoms come only for the one who has not slept in 3 days', () => {
  const { m, spawned, players, rested, sleepless } = twoPlayers();
  m.sinceRest.set(rested, 1000); m.sinceRest.set(sleepless, 100000);
  m.timer = 5000; m.nextAttempt = 0;
  m.tick(players);
  assert.ok(spawned.length >= 1, 'the sleepless player gets phantoms');
  for (const p of spawned) assert.ok(Math.abs(p.x - 500) <= 11 && Math.abs(p.z - 500) <= 11, `over the sleepless player, not at ${p.x},${p.z}`);
});

test('one tick of the world adds one tick to each player, however many players there are', () => {
  const { m, players, rested, sleepless } = twoPlayers();
  for (let i = 0; i < 100; i++) m.tick(players);
  assert.equal(m.sinceRest.get(rested), 100);
  assert.equal(m.sinceRest.get(sleepless), 100);
});

test('sleeping resets only the sleeper; with no player named, everyone', () => {
  const { m, rested, sleepless } = twoPlayers();
  m.sinceRest.set(rested, 90000); m.sinceRest.set(sleepless, 90000);
  m.reset(rested);
  assert.equal(m.sinceRest.get(rested), 0);
  assert.equal(m.sinceRest.get(sleepless), 90000);
  m.reset();
  assert.equal(m.insomniaTicks, 0);
});

test('the hostile-mob behaviours no longer spawn phantoms of their own (they ignored night and any cap)', async () => {
  const { HostileMobBehaviors } = await import('../src/hostileMobBehaviors.js');
  const spawns = [];
  const mobManager = { mobs: [], spawnMob: (type) => { spawns.push(type); return null; } };
  const behaviours = new HostileMobBehaviors(mobManager, { dimension: 'overworld' }, null, null);
  behaviours.insomniaTicks = 500000;
  const player = { position: { x: 0, y: 30, z: 0, distanceTo: () => 99 } };
  for (let i = 0; i < 4000; i++) behaviours.update(0.05, player); // 200 s by day or night: the old timer fired every 60-120 s
  assert.deepEqual(spawns.filter(t => t === 'phantom'), []);
});
