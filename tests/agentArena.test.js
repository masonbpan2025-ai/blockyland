// The Agent Arena's two halves that decide fairness (agentArena/docs/agent-rules.md): the hands every strategy acts through
// (agentArena/humanInput.mjs: reaction time, click rate, turning speed, order) and the box strategies run in
// (agentArena/strategyRunner.mjs: ticks, memory across reloads, broken versions, runaway ticks, no way out).
// Expected values come from the rules' numbers and hand calculations, not from the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, utimesSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HumanInput, anglesTo, RADIANS_PER_PIXEL } from '../agentArena/humanInput.mjs';
import { StrategyRunner } from '../agentArena/strategyRunner.mjs';
import { roundInterviewPrompt, finalInterviewPrompt, interviewAnswer, interviewMarkdown, ROUND_INTERVIEW_WORDS } from '../agentArena/interviews.mjs';

/** Hands on a fake clock, recording what reaches the keyboard and mouse and when. */
function hands({ random = () => 0, limits } = {}) {
  let now = 0;
  const done = [];
  let yaw = 0, pitch = 0;
  const executor = {
    key: (code, down) => { done.push({ at: now, what: `${code} ${down ? 'down' : 'up'}` }); },
    mouse: (button, down) => { done.push({ at: now, what: `${button} ${down ? 'down' : 'up'}` }); },
    look: (dx, dy) => { yaw -= dx * RADIANS_PER_PIXEL; pitch -= dy * RADIANS_PER_PIXEL; },
    slot: (id) => { done.push({ at: now, what: `slot ${id}` }); },
    close: () => { done.push({ at: now, what: 'close' }); },
    chat: (text) => { done.push({ at: now, what: `chat ${text}` }); },
  };
  const input = new HumanInput({ executor, clock: () => now, random, limits });
  return {
    input, done, view: () => ({ yaw, pitch }),
    /** Run the hands every 10 ms up to `until` ms, telling them where the view points, as the arena does. */
    async runTo(until) { for (; now <= until; now += 10) { input.observe(yaw, pitch); await input.pump(); } },
  };
}

test('an input happens a human reaction time after it is issued: 200 ms, plus up to 80 ms', async () => {
  const fast = hands({ random: () => 0 });
  fast.input.move({ forward: true });
  await fast.runTo(190);
  assert.deepEqual(fast.done, [], 'nothing before 200 ms');
  await fast.runTo(210);
  assert.deepEqual(fast.done.map((d) => d.what), ['KeyW down']);
  assert.equal(fast.done[0].at, 200);

  const slow = hands({ random: () => 0.999 });
  slow.input.move({ forward: true });
  await slow.runTo(270);
  assert.deepEqual(slow.done, [], 'the slowest reaction is just under 280 ms');
  await slow.runTo(290);
  assert.equal(slow.done.length, 1);
});

test('inputs happen in the order they were issued, even when a later one draws a quicker reaction', async () => {
  const draws = [0.99, 0];
  const h = hands({ random: () => draws.shift() ?? 0 });
  h.input.move({ sneak: true });
  h.input.move({ jump: true });
  await h.runTo(400);
  assert.deepEqual(h.done.map((d) => d.what), ['ShiftLeft down', 'Space down']);
});

test('holding a key that is already held queues nothing more', async () => {
  const h = hands();
  for (let i = 0; i < 5; i++) h.input.move({ forward: true });
  h.input.move({ forward: false });
  await h.runTo(600);
  assert.deepEqual(h.done.map((d) => d.what), ['KeyW down', 'KeyW up']);
});

test('a mouse button is pressed at most ten times a second however fast the strategy clicks', async () => {
  const h = hands();
  for (let i = 0; i < 5; i++) h.input.click('left');
  await h.runTo(1500);
  const presses = h.done.filter((d) => d.what === 'left down').map((d) => d.at);
  assert.equal(presses.length, 5);
  for (let i = 1; i < presses.length; i++) assert.ok(presses[i] - presses[i - 1] >= 100, `presses ${presses[i - 1]} and ${presses[i]} are under 100 ms apart`);
  assert.equal(h.done.filter((d) => d.what === 'left up').length, 5, 'every press is released');
});

test('the view turns toward a target no faster than 900 degrees a second, and gets there', async () => {
  const h = hands();
  h.input.look(Math.PI / 2, 0); // a quarter turn to the west
  await h.runTo(190); // within the reaction time: no motion yet
  assert.equal(h.view().yaw, 0);
  await h.runTo(250); // at most 50 ms of turning since 200 ms: at most 45 degrees
  assert.ok(h.view().yaw <= (45 + 1) * Math.PI / 180, `turned ${(h.view().yaw * 180 / Math.PI).toFixed(1)} degrees in 50 ms`);
  assert.ok(h.view().yaw > 0);
  await h.runTo(400); // 90 degrees take 100 ms
  assert.ok(Math.abs(h.view().yaw - Math.PI / 2) < 0.01, `ended at ${h.view().yaw}`);
});

test('a window click waits at least 150 ms after the previous one', async () => {
  const h = hands();
  h.input.clickSlot('chest:0', { shift: true });
  h.input.clickSlot('chest:1', { shift: true });
  await h.runTo(800);
  const at = h.done.filter((d) => d.what.startsWith('slot')).map((d) => d.at);
  assert.equal(at.length, 2);
  assert.ok(at[1] - at[0] >= 150);
});

test('anglesTo uses the game convention: yaw 0 faces north (-z), pi/2 faces west (-x)', () => {
  const eye = { x: 0, y: 0, z: 0 };
  assert.ok(Math.abs(anglesTo(eye, { x: 0, y: 0, z: -5 }).yaw) < 1e-9);
  assert.ok(Math.abs(anglesTo(eye, { x: -5, y: 0, z: 0 }).yaw - Math.PI / 2) < 1e-9);
  // Looking 1 down over 1 across is 45 degrees below level.
  assert.ok(Math.abs(anglesTo(eye, { x: 0, y: -1, z: -1 }).pitch + Math.PI / 4) < 1e-9);
});

// --- the strategy box ------------------------------------------------------------------------------------------------

function strategyFile(source) {
  const dir = mkdtempSync(path.join(tmpdir(), 'arena-strategy-'));
  const file = path.join(dir, 'strategy.js');
  writeFileSync(file, source);
  return {
    file,
    /** Replace the file with a new version, with a clearly later modification time. */
    save(next, at) { writeFileSync(file, next); utimesSync(file, at, at); },
  };
}

const VIEW = { tick: 1, phase: 'playing', me: { pos: { x: 0, y: 31, z: 0 }, eye: { x: 0, y: 32.62, z: 0 }, yaw: 0, pitch: 0 }, players: [] };

test('a strategy sees the view, sends inputs, and keeps mem from tick to tick and through a reload', () => {
  const s = strategyFile(`
    function tick(view, input, mem) { mem.n = (mem.n || 0) + 1; input.move({ forward: true }); log('tick', mem.n, view.me.pos.y); }
    module.exports = { tick };`);
  const runner = new StrategyRunner({ file: s.file });
  assert.equal(runner.checkForUpdate(), true);
  runner.step(VIEW);
  const second = runner.step(VIEW);
  assert.deepEqual(second.cmds, [{ type: 'move', keys: { forward: true } }]);
  assert.deepEqual(second.logs, ['tick 2 31']);
  s.save(`function tick(view, input, mem) { mem.n += 10; log('v2', mem.n); } module.exports = { tick };`, new Date(Date.now() + 5000));
  assert.equal(runner.checkForUpdate(), true);
  assert.deepEqual(runner.step(VIEW).logs, ['v2 12'], 'the count of 2 carried over into version 2');
  assert.equal(runner.version, 2);
});

test('a version that does not load leaves the previous one running, and says why', () => {
  const s = strategyFile(`module.exports = { tick(view, input) { input.jump(); } };`);
  const runner = new StrategyRunner({ file: s.file });
  runner.checkForUpdate();
  s.save('module.exports = { tick(view, input) { input.jump( } };', new Date(Date.now() + 5000));
  assert.equal(runner.checkForUpdate(), false);
  assert.match(runner.loadError, /SyntaxError/);
  assert.deepEqual(runner.step(VIEW).cmds, [{ type: 'jump' }], 'version 1 still plays');
});

test('a tick that runs away is stopped at its time limit and the next tick runs', () => {
  // The seventh tick loops for ever (the first five after a load have a longer, warm-up limit).
  const s = strategyFile(`module.exports = { tick(view, input, mem) { mem.t = (mem.t || 0) + 1; if (mem.t === 7) { for (;;) {} } input.jump(); } };`);
  const runner = new StrategyRunner({ file: s.file, tickTimeoutMs: 50 });
  runner.checkForUpdate();
  for (let i = 0; i < 6; i++) assert.equal(runner.step(VIEW).error, null);
  const t0 = Date.now();
  const seventh = runner.step(VIEW);
  assert.ok(Date.now() - t0 < 2000);
  assert.match(seventh.error, /longer than 50 ms/);
  assert.deepEqual(runner.step(VIEW).cmds, [{ type: 'jump' }]);
});

test('a strategy cannot reach the arena process', () => {
  const s = strategyFile(`
    function probe(f) { try { return String(f()); } catch (e) { return 'blocked'; } }
    module.exports = { tick(view) {
      log(typeof process, typeof require, typeof globalThis.process);
      log(probe(() => view.constructor.constructor('return typeof process')()));
      log(probe(() => this.constructor.constructor('return typeof process')()));
    } };`);
  const runner = new StrategyRunner({ file: s.file });
  runner.checkForUpdate();
  const out = runner.step(VIEW);
  assert.equal(out.error, null);
  assert.deepEqual(out.logs, ['undefined undefined undefined', 'blocked', 'blocked']);
});

test('the world a strategy queries is the arena blocks plus every change since', () => {
  const s = strategyFile(`module.exports = { tick() { log(world.blockAt(1, 30, 1), world.blockAt(2, 30, 1), world.isSolid(1, 30, 1), world.findBlocks('stone').length); } };`);
  const runner = new StrategyRunner({ file: s.file });
  runner.setBlocks({ names: { 1: 'stone', 2: 'red_wool' }, bounds: null, cells: [1, 30, 1, 1, 5, 30, 5, 1] });
  runner.checkForUpdate();
  assert.deepEqual(runner.step(VIEW).logs, ['stone air true 2']);
  assert.deepEqual(runner.step(VIEW, { blockChanges: [[2, 30, 1, 2], [1, 30, 1, 0]] }).logs, ['air red_wool false 1']);
});

// --- readiness: the arena waits for research, a plan, a passing check and practice; later rounds for a review ---------

function readyWorld() {
  const root = mkdtempSync(path.join(tmpdir(), 'arena-ready-'));
  const ws = path.join(root, 'ws'), statusDir = path.join(root, 'status'), agentDir = path.join(root, 'agent');
  for (const d of [path.join(ws, 'notes'), path.join(statusDir, 'practice'), agentDir]) mkdirSync(d, { recursive: true });
  return { ws, statusDir, agentDir };
}

test('before round 1 a player is ready only with web research, notes with sources, a plan, a passing check and a practice game', async () => {
  const { readiness, countWebCalls } = await import('../agentArena/readiness.mjs');
  const { ws, statusDir, agentDir } = readyWorld();
  const call = (name) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input: {} }] }, _at: '2026-11-10T00:00:00Z' });
  writeFileSync(path.join(agentDir, 'turn-001.jsonl'), [call('WebSearch'), call('Read'), call('WebFetch')].join('\n'));
  writeFileSync(path.join(agentDir, 'turn-002.jsonl'), call('WebSearch'));
  assert.equal(countWebCalls(agentDir), 3, 'two searches and one page read, across turns; the Read does not count');

  const ask = (checkOk = true, webCalls = 3) => readiness({ ws, statusDir, player: 'Ada', game: 'skywars', webCalls, checkOk, round: 1 });
  assert.equal(ask().ok, false, 'nothing written yet');
  writeFileSync(path.join(ws, 'notes', 'research.md'), `${'notes '.repeat(250)}\nhttps://a.example/1 https://b.example/2`);
  writeFileSync(path.join(ws, 'notes', 'plan-skywars.md'), 'plan '.repeat(200));
  assert.equal(ask().items[1].ok, false, 'two sources are not enough');
  writeFileSync(path.join(ws, 'notes', 'research.md'), `${'notes '.repeat(250)}\nhttps://a.example/1 https://b.example/2 https://c.example/3`);
  writeFileSync(path.join(statusDir, 'practice', 'Ada-skywars-001.json'), JSON.stringify({ loaded: true, errorTicks: 40, played: 30 }));
  assert.equal(ask().ok, false, 'a practice game full of errors does not count');
  // Losing a practice battle against your own copy is part of practising: it counts.
  writeFileSync(path.join(statusDir, 'practice', 'Ada-skywars-002.json'), JSON.stringify({ loaded: true, errorTicks: 0, died: true, played: 7 }));
  assert.equal(ask().ok, true);
  assert.equal(ask(false).ok, false, 'a strategy that fails arena check is not ready');
  assert.equal(ask(true, 2).ok, false, 'too little web research');
});

test('before a later round a player is ready only with a written review of the round before', async () => {
  const { readiness } = await import('../agentArena/readiness.mjs');
  const { ws, statusDir } = readyWorld();
  const ask = (game = 'skywars') => readiness({ ws, statusDir, player: 'Ada', game, webCalls: 0, checkOk: true, round: 2, earlierGames: ['skywars'] });
  assert.equal(ask().ok, false, 'no review of round 1 yet; research and practice are not asked for again');
  writeFileSync(path.join(ws, 'notes', 'review-round-1.md'), 'what worked, what did not, why, what I changed. '.repeat(15));
  assert.equal(ask().ok, true);
  assert.equal(ask('bedwars').ok, false, 'a game new to the series needs its plan');
  writeFileSync(path.join(ws, 'notes', 'plan-bedwars.md'), 'plan '.repeat(200));
  assert.equal(ask('bedwars').ok, true);
});

test('practice time is the seconds of play over all of a player’s practice games, and only that player’s', async () => {
  const { practiceUsed, PRACTICE_SECONDS } = await import('../agentArena/readiness.mjs');
  const { statusDir } = readyWorld();
  writeFileSync(path.join(statusDir, 'practice', 'Ada-skywars-001.json'), JSON.stringify({ played: 45 }));
  writeFileSync(path.join(statusDir, 'practice', 'Ada-skywars-003.json'), JSON.stringify({ played: 30 }));
  writeFileSync(path.join(statusDir, 'practice', 'Bo-skywars-002.json'), JSON.stringify({ played: 60 }));
  assert.equal(practiceUsed(statusDir, 'Ada'), 75);
  assert.equal(PRACTICE_SECONDS.budget - practiceUsed(statusDir, 'Ada'), 45, 'of two minutes, 45 s are left');
});

// --- the film record ----------------------------------------------------------------------------------------------------

test('the film record credits a hit to the other player only when it stood within reach', async () => {
  const { exportFilm } = await import('../agentArena/filmExport.mjs');
  const dir = mkdtempSync(path.join(tmpdir(), 'arena-film-'));
  const rec = path.join(dir, 'recording');
  mkdirSync(rec, { recursive: true });
  const frame = (t, who, x) => JSON.stringify({ t, who, me: { pos: { x, y: 31, z: 0 }, yaw: 0, pitch: 0, health: 20, held: 'iron_sword', armorPoints: 0, armor: {} }, buttons: { left: who === 'Bo' }, screen: 'none' });
  // Ada stands at x 0. Bo is 2 blocks away at 10 s, then 20 blocks away at 20 s.
  writeFileSync(path.join(rec, 'frames.jsonl'), [frame(10, 'Ada', 0), frame(10, 'Bo', 2), frame(20, 'Ada', 0), frame(20, 'Bo', 20)].join('\n'));
  writeFileSync(path.join(rec, 'events.jsonl'), [{ t: 5, kind: 'start' }, { t: 10.1, kind: 'hurt', who: 'Ada', amount: 6, health: 14 }, { t: 20.1, kind: 'hurt', who: 'Ada', amount: 3, health: 11 }].map((e) => JSON.stringify(e)).join('\n'));
  writeFileSync(path.join(rec, 'chat.jsonl'), [JSON.stringify({ t: 21, who: 'Ada', text: 'Ada was knocked into the void by Bo' }), JSON.stringify({ t: 21, who: 'Bo', text: 'Ada was knocked into the void by Bo' })].join('\n'));
  exportFilm({ matchDir: dir, result: { winnerName: 'Bo', endReason: 'last_alive', endT: 21 }, players: [{ name: 'Ada' }, { name: 'Bo' }], agentsDir: null, round: 1, game: 'skywars', scores: { Ada: -1, Bo: 1 } });
  const film = JSON.parse(readFileSync(path.join(dir, 'film.json'), 'utf8'));
  const hits = film.events.filter((e) => e.kind === 'hit');
  assert.deepEqual(hits.map((h) => [h.who, h.by, h.amount]), [['Ada', 'Bo', 6], ['Ada', 'world', 3]]);
  const deaths = film.events.filter((e) => e.kind === 'death');
  assert.deepEqual(deaths.map((d) => [d.who, d.by]), [['Ada', 'Bo']], 'the death once, though both screens showed it');
  assert.equal(film.frames[0].p[1][9], 'a', 'Bo was attacking');
});

// --- bot matches: what a player perceives, and the strategy's sandbox (agentArena/botRunner.mjs) ----------------------

test('a player sees another in view and in the open, hears one behind it within 16 blocks, and nothing farther', async () => {
  const { perceive } = await import('../agentArena/botRunner.mjs');
  const open = () => false;
  const eye = { x: 0, y: 32.62, z: 0 };
  // Facing north (yaw 0): a player 10 blocks north is in view; the same player 10 blocks south is behind.
  assert.equal(perceive({ eye, yaw: 0, pitch: 0, target: { x: 0, y: 31, z: -10 }, sneaking: false, isSolid: open }), 'body');
  assert.equal(perceive({ eye, yaw: 0, pitch: 0, target: { x: 0, y: 31, z: 10 }, sneaking: false, isSolid: open }), 'heard');
  assert.equal(perceive({ eye, yaw: 0, pitch: 0, target: { x: 0, y: 31, z: 30 }, sneaking: false, isSolid: open }), null);
  // A wall between: the name tag shows through it unless the other player sneaks (then only hearing, within 16).
  const wall = (x, y, z) => Math.floor(z) === -5;
  assert.equal(perceive({ eye, yaw: 0, pitch: 0, target: { x: 0, y: 31, z: -10 }, sneaking: false, isSolid: wall }), 'nametag');
  assert.equal(perceive({ eye, yaw: 0, pitch: 0, target: { x: 0, y: 31, z: -10 }, sneaking: true, isSolid: wall }), 'heard');
  assert.equal(perceive({ eye, yaw: 0, pitch: 0, target: { x: 0, y: 31, z: -20 }, sneaking: true, isSolid: wall }), null);
});

/** A strategy loaded into the bot sandbox, driven as the arena drives it: deliver, then drain. */
async function sandbox(source) {
  const { Program } = await import('../agentArena/botRunner.mjs');
  const program = new Program(source, 'strategy.js');
  const state = { me: { username: 'Ada', entity: { id: 'a', position: { x: 0.5, y: 31, z: 0.5 }, yaw: 0, pitch: 0 }, health: 20, items: [{ name: 'red_wool', count: 16, slot: 36 }], slots: [] }, others: [], arena: { game: 'bedwars', phase: 'playing', time: 1, timeLimit: 600, timeLeft: 599, me: { team: 'red' } }, scoreboard: [], window: null };
  let now = 0;
  return {
    deliver(extra = {}) { now += 50; program.call(`__deliver(${JSON.stringify(JSON.stringify({ now, state, results: [], events: [], ...extra }))})`, 1000); },
    start(world = { names: { 1: 'grass_block' }, cells: [0, 30, 0, 1] }) { program.call(`__deliver(${JSON.stringify(JSON.stringify({ now, world, state, results: [], events: [] }))})`, 1000); program.call('__start("{}")', 1000); },
    drain() { return JSON.parse(program.call('__drain()', 1000)); },
  };
}

test('a strategy reads the world at once, and its actions go out as requests that resolve when the arena answers', async () => {
  const s = await sandbox(`async function main(bot, mem) {
    console.log(bot.blockAt({ x: 0, y: 30, z: 0 }).name, bot.blockAt({ x: 1, y: 30, z: 0 }).name, bot.inventory.count('red_wool'), bot.arena.timeLeft);
    const placed = await bot.placeBlock(bot.blockAt({ x: 0, y: 30, z: 0 }), new Vec3(1, 0, 0));
    console.log('placed', JSON.stringify(placed));
    try { await bot.dig(bot.blockAt({ x: 0, y: 30, z: 0 })); } catch (e) { console.log('dig failed:', e.message); }
  }
  module.exports = { main };`);
  s.start();
  const first = s.drain();
  assert.deepEqual(first.logs, ['grass_block air 16 599'], 'reading costs nothing: answered in the same moment');
  assert.deepEqual(first.reqs.map((r) => [r.op, r.args]), [['placeBlock', [{ x: 0, y: 30, z: 0 }, { x: 1, y: 0, z: 0 }]]]);
  s.deliver({ results: [{ id: first.reqs[0].id, ok: true, value: { x: 1, y: 30, z: 0 } }] });
  const second = s.drain();
  assert.deepEqual(second.logs, ['placed {"x":1,"y":30,"z":0}']);
  assert.equal(second.reqs[0].op, 'dig');
  s.deliver({ results: [{ id: second.reqs[0].id, ok: false, error: 'out of reach' }] });
  assert.deepEqual(s.drain().logs, ['dig failed: out of reach'], 'a refused action rejects with the reason');
});

test('a strategy in the bot sandbox cannot reach the arena process', async () => {
  const s = await sandbox(`function probe(f) { try { return String(f()); } catch (e) { return 'blocked'; } }
  async function main(bot) {
    console.log(typeof process, typeof require, typeof globalThis.process);
    console.log(probe(() => bot.constructor.constructor('return typeof process')()));
    console.log(probe(() => bot.blockAt.constructor('return typeof process')()));
    console.log(probe(() => (async () => {}).constructor('return typeof process')()));
  }
  module.exports = { main };`);
  s.start();
  assert.deepEqual(s.drain().logs, ['undefined undefined undefined', 'blocked', 'blocked', 'blocked']);
});

// --- bot matches: a strategy saved during play takes effect (agentArena/botRunner.mjs BotPlayer.step) ----------------

/** A stand-in for the guest bot a BotPlayer drives: enough of it to play, with nothing around. */
function fakeSession() {
  const voxels = new Map();
  const handlers = {};
  return {
    clientId: 'p1', name: 'Ada', position: { x: 0.5, y: 31, z: 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, onGround: true,
    health: 20, isDead: false, gamemode: 'survival', peers: new Map(), chests: new Map(), skywarsSpawns: [{ x: 0.5, y: 31, z: -23.5 }],
    skywarsState: { phase: 'playing', elapsed: 1, players: [{ id: 'p1', name: 'Ada', slot: 0, alive: true }] },
    inventory: { hotbar: new Array(9).fill(null), storage: new Array(27).fill(null), armor: { head: null, chest: null, legs: null, feet: null }, offhand: null, activeSlot: 0 },
    me() { return { id: 'p1', slot: 0, alive: true }; },
    getVoxel(x, y, z) { return voxels.get(`${x},${y},${z}`) ?? 0; },
    setVoxel(x, y, z, id) { voxels.set(`${x},${y},${z}`, id); },
    isSolid(x, y, z) { return (voxels.get(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`) ?? 0) !== 0; },
    bot: { controlState: {}, on(e, f) { handlers[e] = f; }, stopAll() {}, pathfinder: { isMoving: () => false } },
  };
}
const quietRecorder = { write() {}, line() {}, json() {} };

/** Run the player's loop, as the match does every 50 ms, for `ms` of real time. */
async function play(player, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { player.step({ playing: true }); await new Promise((r) => setTimeout(r, 50)); }
}

test('a strategy saved during play takes effect within a second, and keeps its mem', async () => {
  const { BotPlayer } = await import('../agentArena/botRunner.mjs');
  const s = strategyFile(`async function main(bot, mem) { mem.starts = (mem.starts || 0) + 1; console.log('v1 start', mem.starts); for (;;) await sleep(200); }
    module.exports = { main };`);
  const player = new BotPlayer({ name: 'Ada', session: fakeSession(), strategyFile: s.file, recorder: quietRecorder, game: 'skywars', getMatch: () => null, getMessages: () => [], timeLimit: 300 });
  player.checkForUpdate(); // what the match does as play begins
  await play(player, 1500); // the first start waits a moment, as after any load
  assert.equal(player.version, 1);
  assert.ok(player.logTail.some((l) => l.endsWith('v1 start 1')), player.logTail.join('\n'));

  s.save(`async function main(bot, mem) { mem.starts += 1; console.log('v2 start', mem.starts); for (;;) await sleep(200); }
    module.exports = { main };`, new Date(Date.now() + 5000));
  const saved = Date.now();
  while (player.version === 1 && Date.now() - saved < 3000) await play(player, 50);
  assert.equal(player.version, 2, 'the saved version was never loaded');
  assert.ok(Date.now() - saved <= 1200, `loaded ${Date.now() - saved} ms after the save; the rules promise within a second`);
  await play(player, 1500);
  assert.ok(player.logTail.some((l) => l.endsWith('v2 start 2')), `version 2 runs, and mem carried the count: ${player.logTail.join(' | ')}`);
});

test('a strategy saved during play that does not load leaves the running version playing, and says why', async () => {
  const { BotPlayer } = await import('../agentArena/botRunner.mjs');
  const s = strategyFile(`async function main(bot, mem) { for (;;) { console.log('v1 tick'); await sleep(100); } }
    module.exports = { main };`);
  const player = new BotPlayer({ name: 'Ada', session: fakeSession(), strategyFile: s.file, recorder: quietRecorder, game: 'skywars', getMatch: () => null, getMessages: () => [], timeLimit: 300 });
  player.checkForUpdate();
  await play(player, 1500);
  s.save('async function main(bot, mem) { for (;;) { await sleep(100) }', new Date(Date.now() + 5000));
  await play(player, 1500);
  assert.equal(player.version, 1, 'the broken save did not replace the running version');
  assert.match(player.loadError, /SyntaxError/);
  assert.ok(player.logTail.some((l) => /did not load/.test(l)), 'the agent is told, in its log');
  const ticks = player.logTail.filter((l) => l.endsWith('v1 tick')).length;
  await play(player, 500);
  assert.ok(player.logTail.filter((l) => l.endsWith('v1 tick')).length > ticks, 'version 1 keeps playing');
});

test('outside play the arena does not reload: the round starts with the file as it is then', async () => {
  const { BotPlayer } = await import('../agentArena/botRunner.mjs');
  const s = strategyFile('async function main() {} module.exports = { main };');
  const player = new BotPlayer({ name: 'Ada', session: fakeSession(), strategyFile: s.file, recorder: quietRecorder, game: 'skywars', getMatch: () => null, getMessages: () => [], timeLimit: 300 });
  for (let i = 0; i < 30; i++) { player.step({ playing: false }); await new Promise((r) => setTimeout(r, 50)); }
  assert.equal(player.version, 0, 'the lobby loads nothing');
  assert.equal(player.checkForUpdate(), true);
  assert.equal(player.version, 1);
});

test('after a round the agent is asked to reflect, with its own review report in the question', () => {
  const report = 'ROUND 1 (skywars): you lost: DeepSeek won.\n  12s Placed bridge block at (0, 30, -20)\n  41s Placed bridge block at (0, 30, -10)';
  const between = roundInterviewPrompt({ name: 'Gemini', round: 1, game: 'skywars', result: 'DeepSeek won (last_alive)', score: 'Gemini -1, DeepSeek +1', report, next: { round: 2, game: 'bedwars' } });
  // The report itself, so the answers rest on what happened.
  assert.ok(between.includes('41s Placed bridge block at (0, 30, -10)'));
  // The three reflection questions: what went well, what went badly, and what changes for the next round.
  assert.match(between, /What went well, and why\?/);
  assert.match(between, /What went badly, and why\?/);
  assert.match(between, /What will you change for round 2/);
  assert.match(between, new RegExp(`at most ${ROUND_INTERVIEW_WORDS} words`));
  assert.match(between, /without using any tools/);
  // After the last round there is no next round to prepare for: what would it change if it played again.
  const last = roundInterviewPrompt({ name: 'Gemini', round: 3, game: 'skywars', result: 'tie (time_limit)', score: 'Gemini 0, DeepSeek 0', report, next: null });
  assert.match(last, /That was the last round/);
  assert.match(last, /What would you change if you played this round again/);
  assert.doesNotMatch(last, /round 4/);
  // No report: it says so instead of pretending there is one.
  assert.match(roundInterviewPrompt({ name: 'A', round: 1, game: 'bedwars', result: 'tie', score: 'A 0', report: null, next: null }), /There is no review report/);
});

test('a long review report keeps its head and its tail in the interview question', () => {
  const lines = Array.from({ length: 400 }, (_, i) => `  ${i}s line number ${i} of the strategy log`);
  const prompt = roundInterviewPrompt({ name: 'A', round: 1, game: 'skywars', result: 'tie', score: 'A 0', report: `RESULT LINE\n${lines.join('\n')}`, next: null });
  assert.ok(prompt.includes('RESULT LINE'));
  assert.ok(prompt.includes('399s line number 399'));
  assert.ok(prompt.includes('[...]'));
  assert.ok(prompt.length < 8000, `prompt is ${prompt.length} characters`);
});

test('the final interview of a series looks back over the rounds, what helped and what did not', () => {
  const q = finalInterviewPrompt({ name: 'A', results: 'round 1 (skywars): A won; round 2 (skywars): B won', score: 'A 0, B 0', verdict: 'The series is a tie.' });
  assert.match(q, /Which change between rounds helped most, which did not/);
  assert.match(q, /What would you do differently in another series\?/);
  assert.match(q, /notes\/interview-round-N\.md/);
});

test("an interview's answer is read from either harness's stream, and an error result is no answer", () => {
  const claude = [JSON.stringify({ type: 'system' }), JSON.stringify({ type: 'result', is_error: false, result: ' It went well. ' })].join('\n');
  assert.equal(interviewAnswer(claude), 'It went well.');
  const agy = [JSON.stringify({ event: 'init' }), 'not json', JSON.stringify({ event: 'result', result: { response: 'Bridging was slow.' } })].join('\n');
  assert.equal(interviewAnswer(agy), 'Bridging was slow.');
  assert.equal(interviewAnswer(JSON.stringify({ type: 'result', is_error: true, result: 'usage limit' })), '');
  assert.equal(interviewMarkdown({ name: 'A', round: 2, game: 'bedwars', answer: 'x' }), '# A after round 2 (bedwars)\n\nx\n');
});

test('after the last round, the arena is done with an agent only once it has reviewed it, looked back over the series and given every strategy its final edit', async () => {
  const { finalReadiness, FINAL, REVIEW } = await import('../agentArena/readiness.mjs');
  const ws = mkdtempSync(path.join(tmpdir(), 'final-'));
  mkdirSync(path.join(ws, 'notes')); mkdirSync(path.join(ws, 'strategies'));
  const lastEndedAt = Date.now() - 60_000;
  const games = ['skywars', 'bedwars'];
  const ask = (checks = { skywars: true, bedwars: true }) => finalReadiness({ ws, lastRound: 3, games, lastEndedAt, checks });
  // Nothing written yet: not done, and it says what is missing.
  let r = ask();
  assert.equal(r.ok, false);
  assert.ok(r.items.some((i) => !i.ok && /final-reflection\.md/.test(i.what)));
  assert.ok(r.items.some((i) => !i.ok && /review-round-3\.md/.test(i.what)));
  writeFileSync(path.join(ws, 'notes', 'review-round-3.md'), 'x'.repeat(REVIEW.minChars));
  writeFileSync(path.join(ws, 'notes', 'final-reflection.md'), 'x'.repeat(FINAL.minChars));
  // Strategies last saved before the last round ended are not a final edit.
  for (const g of games) { const f = path.join(ws, 'strategies', `${g}.js`); writeFileSync(f, '// v1'); utimesSync(f, new Date(lastEndedAt - 120_000), new Date(lastEndedAt - 120_000)); }
  r = ask();
  assert.equal(r.ok, false);
  assert.equal(r.items.filter((i) => !i.ok).length, 2, 'both strategies still need their final edit');
  // Edited after the round: done, unless one no longer passes arena check.
  for (const g of games) writeFileSync(path.join(ws, 'strategies', `${g}.js`), '// v2, with what the series taught');
  assert.equal(ask().ok, true);
  assert.equal(ask({ skywars: true, bedwars: false }).ok, false);
  // A reflection too short to say anything is not one.
  writeFileSync(path.join(ws, 'notes', 'final-reflection.md'), 'I did well.');
  assert.equal(ask().ok, false);
});

test("the round's replay is public and the same for every player, but shows nothing private: no code, logs, inventory or screens", async () => {
  const { publicReplay } = await import('../agentArena/roundReview.mjs');
  const dir = mkdtempSync(path.join(tmpdir(), 'replay-'));
  const rec = path.join(dir, 'recording');
  mkdirSync(rec);
  const frame = (t, who, x, extra = {}) => ({ t, who, me: { pos: { x, y: 31, z: 0 }, yaw: 0, pitch: 0, health: 20, held: 'stone_sword', armor: { chest: 'iron_chestplate' }, ...extra }, buttons: { left: true }, screen: 'chest', sees: ['B'], inventory: [{ item: 'diamond', count: 3 }] });
  const jl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n');
  writeFileSync(path.join(rec, 'frames.jsonl'), jl([frame(10, 'A', 0), frame(10, 'B', 2), frame(15, 'A', 1), frame(15, 'B', 2.5, { health: 13 })]));
  writeFileSync(path.join(rec, 'events.jsonl'), jl([{ t: 14.9, kind: 'hurt', who: 'B', amount: 7, health: 13 }]));
  writeFileSync(path.join(rec, 'chat.jsonl'), jl([{ t: 16, who: 'Referee', text: 'B was slain by A' }]));
  writeFileSync(path.join(rec, 'world.jsonl'), jl([{ t: 12, changes: [[0, 30, 1, 1], [0, 30, 2, 0]] }]));
  writeFileSync(path.join(rec, 'strategy-A.jsonl'), jl([{ t: 11, line: 'SECRET PLAN: rush mid' }]));
  const r = publicReplay({ matchDir: dir, round: 2, game: 'skywars', result: { playingT: 10, winnerName: 'A', endReason: 'last_alive', seconds: 6 } });
  // Both players, their hits and the chat.
  assert.match(r.text, /A: at 0\.0 31\.0 0\.0 hp 20 holds stone_sword armour iron/);
  assert.match(r.text, /B: at 2\.0 31\.0 0\.0/);
  assert.match(r.text, /B took 7 \(health 13\), most likely from A/);
  assert.match(r.text, /B was slain by A/);
  assert.match(r.text, /1 placed, 1 broken/);
  // Nothing private.
  assert.doesNotMatch(r.text, /SECRET PLAN|diamond|chest'|sees/);
  for (const f of r.frames) for (const k of ['inventory', 'sees', 'screen', 'me', 'buttons']) assert.ok(!(k in f), `${k} is private`);
  assert.equal(r.frames[0].swinging, true);
});

test('a warm start gives every agent the whole record of an earlier series: replays, results, every agent\'s code, logs, notes and interviews', async () => {
  const { resolveRun, copyWarmStart } = await import('../agentArena/warmStart.mjs');
  const runs = mkdtempSync(path.join(tmpdir(), 'runs-'));
  const run = path.join(runs, 'old-series');
  const w = (rel, text) => { const f = path.join(run, rel); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, text); };
  const jl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n');
  w('summary.json', JSON.stringify({ run: 'old-series', players: [{ name: 'A', model: 'm1' }, { name: 'B', model: 'm2' }], scores: { A: 1, B: -1 }, winner: 'A',
    matches: [{ round: 1, game: 'skywars', folder: 'round-1-skywars', result: 'A won (last_alive)' }] }));
  w('round-1-skywars/result.json', JSON.stringify({ playingT: 10, winnerName: 'A', endReason: 'last_alive', seconds: 40 }));
  w('round-1-skywars/recording/frames.jsonl', jl([{ t: 10, who: 'A', me: { pos: { x: 0, y: 31, z: 0 }, health: 20 } }, { t: 10, who: 'B', me: { pos: { x: 3, y: 31, z: 0 }, health: 20 } }]));
  w('round-1-skywars/recording/strategy-A.jsonl', jl([{ t: 12, line: 'A rushes mid' }]));
  w('round-1-skywars/recording/strategy-B.jsonl', jl([{ t: 13, line: 'B loots first' }]));
  w('round-1-skywars/versions/A/v001.js', '// A v1');
  w('round-1-skywars/versions/B/v001.js', '// B v1');
  w('round-1-skywars/video/arena.webm', 'big video');
  w('round-1-skywars/video/hud/arena-0005.0.jpg', 'jpg');
  for (const p of ['A', 'B']) {
    w(`workspaces/${p}/strategies/skywars.js`, `// ${p} final`);
    w(`workspaces/${p}/notes/final-reflection.md`, `${p} learned things`);
    w(`workspaces/${p}/review/round-1/report.txt`, `${p} report`);
    w(`agents/${p}/interview-round-1.md`, `# ${p} after round 1`);
    w(`agents/${p}/turn-001.jsonl`, 'raw transcript');
  }
  assert.throws(() => resolveRun(path.join(runs, 'nothing-here'), runs), /not a finished arena run/);
  const ws = mkdtempSync(path.join(tmpdir(), 'ws-'));
  const r = copyWarmStart(resolveRun('old-series', runs), ws);
  const prev = path.join(ws, 'previous', 'old-series');
  const read = (rel) => readFileSync(path.join(prev, rel), 'utf8');
  assert.deepEqual(r.agents, ['A', 'B']);
  // Both agents' work, not only one side's.
  for (const p of ['A', 'B']) {
    assert.equal(read(`agents/${p}/strategies/skywars.js`), `// ${p} final`);
    assert.equal(read(`agents/${p}/notes/final-reflection.md`), `${p} learned things`);
    assert.equal(read(`agents/${p}/interviews/interview-round-1.md`), `# ${p} after round 1`);
    assert.equal(read(`agents/${p}/reviews/round-1/report.txt`), `${p} report`);
    assert.equal(read(`rounds/round-1-skywars/strategy-versions/${p}/v001.js`), `// ${p} v1`);
  }
  assert.match(read('rounds/round-1-skywars/strategy-logs/B.txt'), /3s B loots first/);
  assert.match(read('rounds/round-1-skywars/replay.txt'), /A: at 0\.0 31\.0 0\.0[\s\S]*B: at 3\.0/);
  assert.match(read('README.md'), /A won the series/);
  // Not the bulky raw material.
  assert.ok(!existsSync(path.join(prev, 'rounds', 'round-1-skywars', 'arena.webm')));
  assert.ok(!readdirSync(prev, { recursive: true }).some((f) => String(f).includes('turn-001')));
  assert.ok(existsSync(path.join(prev, 'rounds', 'round-1-skywars', 'screens', 'arena-0005.0.jpg')));
});

test('rules: under the autopilot standard a program knows where every player is and has its reach; under the arena\'s a player behind is only heard', async () => {
  const { BotPlayer } = await import('../agentArena/botRunner.mjs');
  const s = strategyFile('async function main(bot) { for (;;) await sleep(200); }\nmodule.exports = { main };');
  const make = (rules) => {
    const session = fakeSession();
    // Facing -Z (yaw 0); a player 10 blocks behind, on +Z, in the open.
    session.peers.set('p2', { id: 'p2', name: 'Bea', x: 0.5, y: 31, z: 10.5 });
    session.skywarsState.players.push({ id: 'p2', name: 'Bea', slot: 1, alive: true });
    return new BotPlayer({ name: 'Ada', session, strategyFile: s.file, recorder: quietRecorder, game: 'skywars', getMatch: () => null, getMessages: () => [], timeLimit: 300, rules });
  };
  const arena = make({ standard: 'arena' }).state();
  const bea = arena.others.find((e) => e.username === 'Bea');
  assert.equal(bea.heard, true, 'behind me and within 16 blocks: heard, not seen');
  assert.equal(arena.arena.rules.standard, 'arena');
  assert.equal(arena.arena.rules.reach, 4);

  const auto = make({ standard: 'autopilot', difficulty: 'normal' }).state();
  const seen = auto.others.find((e) => e.username === 'Bea');
  assert.equal(seen.heard, false, 'the autopilot knows every player\'s place: so does a program under its rules');
  assert.deepEqual(seen.position, { x: 0.5, y: 31, z: 10.5 });
  assert.equal(auto.arena.rules.reach, 3); // Minecraft's survival reach, eyes to body
  assert.equal(auto.arena.rules.reactionMs, 0);
});

test('the runner still hears chat and the program\'s shots after the program restarts (its restart drops only the program\'s own listeners)', async () => {
  const { BotPlayer } = await import('../agentArena/botRunner.mjs');
  const { GuestPeerSession } = await import('../packages/blockyland-mcp/guestPeer.js');
  const session = new GuestPeerSession({ code: '1234', name: 'Ada', url: 'ws://localhost:1/ws/share' });
  const s = strategyFile('async function main(bot) { for (;;) await sleep(200); }\nmodule.exports = { main };');
  const player = new BotPlayer({ name: 'Ada', session, strategyFile: s.file, recorder: quietRecorder, game: 'skywars', getMatch: () => null, getMessages: () => [], timeLimit: 300 });
  session.bot.on('chat', () => {}); // a program's own listener
  session.bot.stopAll();            // what a (re)start does
  session.bot.emit('chat', 'Bea', 'hello');
  session.bot.emit('projectileEnd', { kind: 'arrow', hit: null, block: { x: 1, y: 2, z: 3 }, at: { x: 1, y: 2.5, z: 3 }, ticks: 4 });
  assert.ok(player.events.some((e) => e[0] === 'chat' && e[2] === 'hello'), 'chat reaches the program');
  assert.ok(player.events.some((e) => e[0] === 'projectileEnd' && e[1].kind === 'arrow'), 'a shot\'s end reaches the program');
});
