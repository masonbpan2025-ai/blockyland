// Trial spawners and vaults: range and sight, the trial chambers' values, completion, the key-or-item reward, the
// cooldown; vaults once per player with a trial key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TrialSpawners, Vaults, trialValues, TRIAL_RANGE, TRIAL_COOLDOWN } from '../src/trialSpawner.js';
import { BLOCKS } from '../src/blocks.js';

function fixture(mob = 'zombie', { wall = false } = {}) {
  const world = {
    getVoxel: (x, y, z) => (x === 0 && y === 10 && z === 0 ? BLOCKS.TRIAL_SPAWNER : y < 9 ? BLOCKS.STONE : wall && x === 5 ? BLOCKS.STONE : BLOCKS.AIR),
    trialSpawners: () => [{ x: 0, y: 10, z: 0, mob, kind: 'normal' }]
  };
  const mobs = { list: [], spawnMob(type, x, y, z) { const m = { type, health: 20, dead: false }; this.list.push(m); return m; } };
  const drops = [];
  let seed = 3; const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  return { trial: new TrialSpawners({ world, mobs, drop: (p, s) => drops.push(s), random }), mobs, drops };
}
const player = (x) => [{ id: 'p', position: { x, y: 10, z: 0.5 }, gamemode: 'survival' }];

test('the values: breeze 2 total / 1 at once; others 6 / 3; slow 4 at once every 160 ticks', () => {
  assert.deepEqual(trialValues('breeze'), { interval: 20, total: 2, totalPerPlayer: 1, simultaneous: 1, simultaneousPerPlayer: 0.5 });
  assert.equal(trialValues('zombie').total, 6);
  assert.equal(trialValues('zombie').simultaneous, 3);
  assert.equal(trialValues('skeleton', 'slow').interval, 160);
});

test('it needs a player in range and in sight; Peaceful never; spectators never', () => {
  const far = fixture(); for (let i = 0; i < 200; i++) far.trial.tick(player(TRIAL_RANGE + 2)); assert.equal(far.mobs.list.length, 0);
  const hidden = fixture('zombie', { wall: true }); for (let i = 0; i < 200; i++) hidden.trial.tick(player(8)); assert.equal(hidden.mobs.list.length, 0);
  const calm = fixture(); for (let i = 0; i < 200; i++) calm.trial.tick(player(3), { difficulty: 'peaceful' }); assert.equal(calm.mobs.list.length, 0);
  const spec = fixture(); for (let i = 0; i < 200; i++) spec.trial.tick([{ id: 'p', position: { x: 3, y: 10, z: 0 }, gamemode: 'spectator' }]); assert.equal(spec.mobs.list.length, 0);
});

test('it spawns up to 3 at once and 6 in all; when they die it rewards and cools down', () => {
  const f = fixture();
  for (let i = 0; i < 400; i++) { f.trial.tick(player(3)); assert.ok(f.mobs.list.filter((m) => !m.dead).length <= 3); }
  assert.equal(f.mobs.list.length, 3, 'three at once, then it waits');
  for (const m of f.mobs.list) m.dead = true;
  for (let i = 0; i < 400; i++) f.trial.tick(player(3));
  assert.equal(f.mobs.list.length, 6);
  for (const m of f.mobs.list) m.dead = true;
  for (let i = 0; i < 100; i++) f.trial.tick(player(3));
  assert.equal(f.drops.length, 1, 'one reward for the one player: a key or an item');
  const state = [...f.trial.state.values()][0];
  assert.equal(state.phase, 'cooldown');
  assert.ok(state.timer > TRIAL_COOLDOWN - 200);
});

test('a vault opens once per player and ejects 2-5 stacks', () => {
  const drops = [];
  const v = new Vaults({ drop: (p, s) => drops.push(s) });
  const out = v.use(1, 2, 3, 'alice');
  assert.ok(out.length >= 2 && out.length <= 5);
  assert.equal(v.use(1, 2, 3, 'alice'), null);
  assert.ok(v.use(1, 2, 3, 'bob'));
});
