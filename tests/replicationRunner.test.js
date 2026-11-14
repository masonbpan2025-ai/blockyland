// The replication client's program runner (replication/client/runner.js): runaway programs can be stopped.
// In the first agents' run (replication/runs/sonnet30) a timed-out program kept steering its player after the agent
// had moved on, and through its deaths: most of the run's eleven deaths. These tests drive the runner with a stand-in
// bot and check what an agent would see: whether the old program's actions keep reaching the server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ProgramRunner } from '../replication/client/runner.js';

/** A bot whose server calls are recorded, ticking every 5 ms. */
function standInBot() {
  const bot = new EventEmitter();
  Object.assign(bot, {
    username: 'Ada', ready: true, received: [], tickCount: 0, calls: [], controls: null,
    transport: { call: async (method, ...args) => { bot.calls.push(method); if (method === 'setControls') bot.controls = args[1]; return true; } },
    async waitForTicks(n = 1) { const until = this.tickCount + n; while (this.tickCount < until) await new Promise(r => this.once('physicsTick', r)); },
    async dig() { await this.transport.call('dig', this.username); await this.waitForTicks(1); },
    clearControlStates() { this.transport.call('setControls', this.username, {}); },
    pathfinder: { stopped: 0, stop() { this.stopped++; } },
  });
  const timer = setInterval(() => { bot.tickCount++; bot.emit('physicsTick'); }, 5);
  bot.close = () => clearInterval(timer);
  return bot;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const digsSince = (bot, from) => bot.calls.slice(from).filter(c => c === 'dig').length;

test('a timed-out loop keeps acting, and `bl stop` ends it', async () => {
  const bot = standInBot(), runner = new ProgramRunner(bot);
  try {
    const first = await runner.run('while (true) { try { await bot.dig(); } catch (e) {} }', { timeout: .05 });
    assert.match(first.output, /\[timeout\].*bl stop/s, 'the timeout says how to stop it');
    let mark = bot.calls.length; await sleep(60);
    assert.ok(digsSince(bot, mark) > 3, 'after its timeout the loop still digs (as a Mineflayer program would)');
    const next = await runner.run('return 1');
    assert.match(next.output, /\[running\] program 1 .*still running.*bl stop/, 'the next output names the runaway');
    assert.deepEqual(runner.stopAll('stopped with bl stop'), [1]);
    assert.ok(bot.pathfinder.stopped >= 1, 'its pathfinding is stopped');
    assert.deepEqual(bot.controls, {}, 'its movement keys are released');
    await sleep(30); mark = bot.calls.length; await sleep(200);
    assert.equal(digsSince(bot, mark), 0, 'a loop that catches every error still reaches the server no more');
    assert.match((await runner.run('return 2')).output, /\[stopped\] program 1 was stopped: stopped with bl stop/);
  } finally { bot.close(); }
});

test('a death stops every running program', async () => {
  const bot = standInBot(), runner = new ProgramRunner(bot);
  try {
    await runner.run('for (;;) { await bot.dig(); }', { timeout: .05 });
    bot.emit('death');
    await sleep(30); const mark = bot.calls.length; await sleep(150);
    assert.equal(digsSince(bot, mark), 0, 'the dead player is not walked back to where it died');
    // the next program waits until the agent has read the news, which says what happened
    const held = await runner.run('await bot.dig(); return 1');
    assert.equal(held.record.status, 'refused');
    assert.match(held.output, /not run: you died.*bl news/s);
    assert.match(runner.news(), /\[alert\] you died.*program 1 was stopped: you died/s);
    assert.match((await runner.run('return 2')).output, /returned: 2/);
  } finally { bot.close(); }
});

// The safety kit takes over when the player is attacked (replication/agent/kit/safety.js calls bot.stopPrograms). In
// dry8 an agent ran `bl run mine3.js --timeout 40 && bl run collect.js --timeout 30 | head -3`: the kit stopped the
// first program, the second started anyway, and the player died inside it with the agent none the wiser.
test('when the safety kit takes over, the program stops and no new one runs until the agent reads `bl news`', async () => {
  const bot = standInBot(), runner = new ProgramRunner(bot);
  try {
    const long = runner.run('for (;;) await bot.dig();', { timeout: 30 });
    await sleep(40);
    assert.deepEqual(bot.stopPrograms('stopped by the safety kit: running from skeleton at 9 HP'), [1]);
    const first = await long;
    assert.equal(first.record.status, 'stopped');
    assert.equal(first.record.stopped, 'stopped by the safety kit: running from skeleton at 9 HP', 'the reason goes back to `bl`');
    assert.match(first.output, /\[stopped\] This program was stopped: stopped by the safety kit/);
    // the next program in the command line: not run, and it says why and what to do
    const mark = bot.calls.length;
    const second = await runner.run('await bot.dig(); await bot.dig(); return "mined"');
    assert.equal(second.record.status, 'refused');
    assert.match(second.output, /not run: stopped by the safety kit: running from skeleton.*bl news/s);
    assert.equal(digsSince(bot, mark), 0, 'its code never ran');
    assert.equal((await runner.run('return 3')).record.status, 'refused', 'still held: running again is not reading the news');
    // reading the news releases it
    assert.match(runner.news(), /\[alert\] stopped by the safety kit: running from skeleton at 9 HP/);
    const third = await runner.run('await bot.dig(); return "mined"');
    assert.match(third.output, /returned: mined/);
    assert.match(runner.news(), /No new chat or messages/, 'the alert is shown once');
  } finally { bot.close(); }
});

test('the kit taking over while no program runs also holds the next one; `bl stop` of your own does not', async () => {
  const bot = standInBot(), runner = new ProgramRunner(bot);
  try {
    assert.deepEqual(bot.stopPrograms('stopped by the safety kit: fighting zombie at 16 HP'), [], 'nothing was running');
    assert.equal((await runner.run('return 1')).record.status, 'refused', 'the agent still learns it was attacked');
    runner.news();
    await runner.run('for (;;) await bot.waitForTicks(1);', { timeout: .05 });
    runner.stopAll('stopped with bl stop');
    assert.match((await runner.run('return 2')).output, /returned: 2/, 'stopping your own program is your decision: nothing to read first');
  } finally { bot.close(); }
});

test('helpers kept on global still work after the program that made them is stopped', async () => {
  const bot = standInBot(), runner = new ProgramRunner(bot);
  try {
    await runner.run('global.chop = async (n) => { for (let i = 0; i < n; i++) await bot.dig(); return n; }; for (;;) await bot.waitForTicks(1);', { timeout: .05 });
    runner.stopAll('stopped with bl stop');
    const mark = bot.calls.length;
    const out = await runner.run('return await chop(3)');
    assert.match(out.output, /returned: 3/);
    assert.equal(digsSince(bot, mark), 3, 'the helper acts for the program that calls it');
  } finally { bot.close(); }
});

test('listeners a stopped program added are removed; the bot\'s own stay', async () => {
  const bot = standInBot(), runner = new ProgramRunner(bot);
  try {
    const own = bot.listenerCount('death');
    await runner.run('bot.on("chat", () => {}); bot.on("death", () => {}); for (;;) await bot.waitForTicks(1);', { timeout: .05 });
    assert.equal(bot.listenerCount('chat'), 1);
    runner.stopAll('stopped with bl stop');
    assert.equal(bot.listenerCount('chat'), 0);
    assert.equal(bot.listenerCount('death'), own, 'the runner\'s own death listener stays');
    assert.ok(bot.listenerCount('physicsTick') <= 1, 'no waits left behind');
  } finally { bot.close(); }
});

test('`bl news` shows new chat and messages once, without running a program, and what is still running', async () => {
  const bot = standInBot(), runner = new ProgramRunner(bot);
  try {
    await runner.run('for (;;) await bot.waitForTicks(1);', { timeout: .05 });
    // (messages that arrive before a program ends go into its output; these arrive after)
    bot.received.push({ kind: 'chat', from: 'Basil', text: 'cave at 10,14,-6 has zombies' }, { kind: 'death', text: 'Aria was slain by zombie' });
    const news = runner.news();
    assert.match(news, /<Basil> cave at 10,14,-6 has zombies/);
    assert.match(news, /\[death\] Aria was slain by zombie/);
    assert.match(news, /\[running\] program 1/);
    assert.match(runner.news(), /No new chat or messages/, 'each message is shown once');
    runner.stopAll('stopped with bl stop');
  } finally { bot.close(); }
});
