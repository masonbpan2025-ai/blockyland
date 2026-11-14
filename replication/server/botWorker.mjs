// One player's client, in its own thread: the Mineflayer-style bot, its pathfinder and its program runner. As each
// Mineflayer bot runs in its own process, a program that blocks (a `while (true) {}`) blocks only its own player; the
// server's watchdog restarts a thread that stops answering (run.mjs), like a client that crashed and reconnected.
//
// Messages in:  {type:'packet', packet, time}  {type:'run', id, code, timeout}  {type:'stop', id}  {type:'news', id}  {type:'reply', id, ok, value, error}
// Messages out: {type:'ack', tick}  {type:'call', id, method, args}  {type:'result', id, output, record}  {type:'stopped', id, stopped}
import { parentPort, workerData } from 'node:worker_threads';
import { Bot } from '../client/bot.js';
import { pathfinder } from '../client/pathfinder.js';
import { ProgramRunner } from '../client/runner.js';

const { name } = workerData;
let nextId = 1;
const waiting = new Map();
const transport = {
  call(method, ...args) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      parentPort.postMessage({ type: 'call', id, method, args });
    });
  },
};
const bot = new Bot(name, transport);
pathfinder(bot);
bot.loadPlugin = (plugin) => { if (typeof plugin === 'function') plugin(bot); };
bot.loadPlugins = (list) => list.forEach(p => bot.loadPlugin(p));
const runner = new ProgramRunner(bot);
if (workerData.restartNote) bot.received.push({ kind: 'system', text: workerData.restartNote });
// A program that starts an action without awaiting it (`bot.attack(e)` on a mob that left) leaves a rejected promise
// nobody handles. Node ends the whole thread for that, and with it the player's client; report it to the agent instead,
// as a late output line, and keep the client alive.
process.on('unhandledRejection', (err) => { runner.late.push(`[late] an action you did not await failed: ${err?.message ?? err}`); });
process.on('uncaughtException', (err) => { runner.late.push(`[late] uncaught error in your program: ${err?.message ?? err}`); });

parentPort.on('message', async (m) => {
  if (m.type === 'packet') {
    try { bot.receive(m.packet, m.time); } catch (err) { /* a listener a program added threw: Mineflayer would print it */ runner.late.push(`[late] an event listener threw: ${err?.message ?? err}`); }
    parentPort.postMessage({ type: 'ack', tick: m.packet?.state ? m.tick : 0 });
  } else if (m.type === 'reply') {
    const w = waiting.get(m.id); if (!w) return;
    waiting.delete(m.id);
    if (m.ok) w.resolve(m.value); else w.reject(new Error(m.error));
  } else if (m.type === 'news') {
    // `bl news`: new chat and messages without running a program.
    parentPort.postMessage({ type: 'news', id: m.id, output: runner.news() });
  } else if (m.type === 'stop') {
    // `bl stop`: every running program of this player ends (runner.js).
    parentPort.postMessage({ type: 'stopped', id: m.id, stopped: runner.stopAll('stopped with bl stop') });
  } else if (m.type === 'run') {
    const { output, record } = await runner.run(m.code, { timeout: m.timeout });
    parentPort.postMessage({ type: 'result', id: m.id, output, record });
  }
});
