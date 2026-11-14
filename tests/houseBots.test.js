// The house bots (agentArena/bots/): strategy programs with no AI behind them, for SkyWars and Bed Wars. They must be
// built from their sources, run in the arena's sandbox without errors, and decide by searching: the moves they weigh
// follow from what the model is told (blocks, gaps, strength, the clock), and their choices vary.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import path from 'node:path';

const bots = path.join(process.cwd(), 'agentArena', 'bots');

/** A built bot's planner, loaded outside the arena with stand-ins for the sandbox's globals. */
function planner(game) {
  const text = readFileSync(path.join(bots, `${game}.js`), 'utf8');
  const ctx = { module: { exports: {} }, console: { log() {} }, sleep: () => Promise.resolve(), Vec3: class { constructor(x, y, z) { Object.assign(this, { x, y, z }); } }, goals: {}, Math, Date, JSON };
  return vm.runInNewContext(`${text}\n;({ search, choose, newPersona, rng, MODEL: typeof SKYWARS_MODEL !== 'undefined' ? SKYWARS_MODEL : BEDWARS_MODEL })`, ctx);
}
const calm = { temperature: 0.5, explore: 1.2, nerve: 0, bias: {} };

test('the built bots are up to date with their sources', () => {
  const r = spawnSync(process.execPath, [path.join(bots, 'build.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('each bot loads in the arena sandbox and runs on a recorded game without errors', () => {
  for (const game of ['skywars', 'bedwars']) {
    const r = spawnSync(process.execPath, ['agentArena/cli.mjs', 'check', `agentArena/bots/${game}.js`], { encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0, r.stdout);
    assert.match(r.stdout, /loaded; ran 3 s .* 0 errors/);
  }
});

// A SkyWars position: me on my island, the middle 11 blocks of void away, the other island beyond it.
const skywars = (me = {}, foe = {}, t = 20) => ({
  t, limit: 300, midChests: 4, bridges: {}, guess: 'foe',
  gaps: { 'own>mid': 11, 'mid>own': 11, 'mid>foe': 11, 'foe>mid': 11, 'own>foe': 30, 'foe>own': 30 },
  dists: { 'own>mid': 24, 'mid>own': 24, 'mid>foe': 24, 'foe>mid': 24, 'own>foe': 48, 'foe>own': 48 },
  me: { home: 'own', away: 'foe', place: 'own', busy: t, hp: 20, apples: 0, armour: 4, weapon: 5, blocks: 30, chests: { own: 1 }, ...me },
  foe: { home: 'foe', away: 'own', place: 'foe', busy: t, hp: 20, apples: 0, armour: 4, weapon: 5, blocks: 30, chests: { own: 1 }, ...foe },
});

test('SkyWars: with no blocks there is no crossing the void, only what is on my island', () => {
  const { MODEL } = planner('skywars');
  const moves = MODEL.legal(skywars({ blocks: 0 }), []);
  assert.ok(moves.includes('loot_own'));
  for (const m of ['rush_mid', 'rush_foe', 'hunt']) assert.ok(!moves.includes(m), `${m} needs 11 blocks`);
  assert.ok(MODEL.legal(skywars({ blocks: 11 }), []).includes('rush_mid'), 'eleven blocks bridge eleven blocks of void');
});

test('SkyWars: the search values strength -- far better gear makes going to fight better than staying', async () => {
  const { search, MODEL } = planner('skywars');
  const strong = await search(skywars({ armour: 18, weapon: 7, apples: 2, chests: { own: 0 } }, { armour: 0, weapon: 1 }), MODEL, calm, { seed: 7, iterations: 1500 });
  const weak = await search(skywars({ armour: 0, weapon: 1, chests: { own: 0 } }, { armour: 18, weapon: 7, apples: 2 }), MODEL, calm, { seed: 7, iterations: 1500 });
  const best = (rs) => Math.max(...rs.map((r) => r.mean));
  assert.ok(best(strong) > 0.3, `strong: ${JSON.stringify(strong)}`);
  assert.ok(best(weak) < best(strong) - 0.3, `weak ${best(weak)} vs strong ${best(strong)}`);
});

test('SkyWars: when the clock is nearly out, a round that is not won is worth nothing', async () => {
  const { search, MODEL } = planner('skywars');
  const late = await search(skywars({ chests: { own: 0 } }, {}, 295), MODEL, calm, { seed: 3, iterations: 400 });
  for (const r of late) assert.ok(Math.abs(r.mean) < 0.15, `${r.move} ${r.mean}`);
});

test('the choice varies: the same estimates do not always give the same move, and the persona leans it', () => {
  const { choose, newPersona } = planner('skywars');
  const results = [{ move: 'loot_own', n: 420, mean: 0.5 }, { move: 'rush_mid', n: 380, mean: 0.48 }];
  const picks = new Set(Array.from({ length: 200 }, () => choose(results, calm)));
  assert.deepEqual([...picks].sort(), ['loot_own', 'rush_mid']);
  // A greedy bot opens the third chest more often than a bold one.
  const greedy = { ...calm, bias: { loot_own: 1.3, rush_mid: 0.7 } }, bold = { ...calm, bias: { loot_own: 0.7, rush_mid: 1.3 } };
  const share = (p) => Array.from({ length: 2000 }, () => choose(results, p)).filter((m) => m === 'loot_own').length / 2000;
  assert.ok(share(greedy) > share(bold) + 0.2, `greedy ${share(greedy)} vs bold ${share(bold)}`);
  assert.ok(newPersona(() => ({})).temperature > 0);
});

// A Bed Wars position: me at my base, the enemy base 30 blocks of void away.
const bedwars = (me = {}, foe = {}, t = 60) => ({
  t, limit: 600, bridges: {},
  gaps: { 'own>mid': 15, 'mid>own': 15, 'mid>foe': 15, 'foe>mid': 15, 'own>foe': 30, 'foe>own': 30 },
  dists: { 'own>mid': 40, 'mid>own': 40, 'mid>foe': 40, 'foe>mid': 40, 'own>foe': 80, 'foe>own': 80 },
  me: { home: 'own', away: 'foe', place: 'own', busy: t, iron: 0, gold: 0, wool: 0, sword: 4, armour: 7, bedAlive: true, cover: 0, ...me },
  foe: { home: 'foe', away: 'own', place: 'foe', busy: t, iron: 0, gold: 0, wool: 0, sword: 4, armour: 7, bedAlive: true, cover: 0, ...foe },
});

test('Bed Wars: what can be bought follows the iron carried, and a rush needs the wool to bridge the gap', () => {
  const { MODEL } = planner('bedwars');
  assert.deepEqual([...MODEL.legal(bedwars({ iron: 3 }), [])], ['farm']);
  assert.ok(MODEL.legal(bedwars({ iron: 4 }), []).includes('buy_wool'), 'wool is 4 iron');
  assert.ok(MODEL.legal(bedwars({ iron: 10 }), []).includes('buy_sword'), 'a stone sword is 10 iron');
  assert.ok(MODEL.legal(bedwars({ iron: 24 }), []).includes('buy_armour'), 'chainmail is 24 iron');
  assert.ok(!MODEL.legal(bedwars({ wool: 29 }), []).includes('rush'), '29 wool does not bridge 30 blocks');
  assert.ok(MODEL.legal(bedwars({ wool: 30 }), []).includes('rush'));
  // A bed already covered is not covered again; a broken bed is not covered at all.
  assert.ok(!MODEL.legal(bedwars({ wool: 16, cover: 1 }), []).includes('defend'));
  assert.ok(!MODEL.legal(bedwars({ wool: 16, bedAlive: false }), []).includes('defend'));
});

test('Bed Wars: with my bed gone and theirs standing, the search sees the danger', async () => {
  const { search, MODEL } = planner('bedwars');
  const safe = await search(bedwars({ wool: 40, sword: 5 }, { bedAlive: false }), MODEL, calm, { seed: 5, iterations: 1500 });
  const exposed = await search(bedwars({ wool: 40, sword: 5, bedAlive: false }, {}), MODEL, calm, { seed: 5, iterations: 1500 });
  const best = (rs) => Math.max(...rs.map((r) => r.mean));
  assert.ok(best(safe) > best(exposed) + 0.3, `their bed gone ${best(safe)} vs mine gone ${best(exposed)}`);
});
