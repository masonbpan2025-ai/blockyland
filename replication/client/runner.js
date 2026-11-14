// Runs an agent's program against its bot, as the paper's client did: the program is the body of an async function
// that receives `bot`; the pathfinder plugin is loaded; no helpers are added. It may `require` Node built-ins and the
// installed Mineflayer packages (vec3, minecraft-data, mineflayer-pathfinder), but not start processes, touch files or
// the network. Values on the global object persist between programs (one context per player).
//
// The client waits for the program up to the timeout the agent chose (60 s by default) and then prints what it logged
// and returned. A program that is still running at the timeout is not stopped by the timeout, as with Mineflayer: it
// keeps acting, and what it logs afterwards appears in the next output as "late output".
//
// Runaway programs: in the first agents' run (replication/runs/sonnet30) old programs kept steering players after
// their agents had moved on, and through their deaths, and caused most of the run's deaths. So a program can be stopped:
// `bl stop` stops every running program of the player, and a death stops them all (the player respawns with nothing;
// the old plan is void). Every output lists the programs still running. Stopping works without killing the client:
// each program runs in its own async context (AsyncLocalStorage), and once it is stopped, every action it asks for
// (a server call, a wait for ticks) fails with "program N was stopped", its movement is released, and the listeners
// it added are removed. A helper kept on `global` from an earlier program runs as whichever program calls it, so it
// keeps working.
import vm from 'node:vm';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import { Vec3, vec3 } from './vec3.js';
import { minecraftData } from './registry.js';
import * as pathfinderModule from './pathfinder.js';

const nodeRequire = createRequire(import.meta.url);
const ALLOWED = new Set(['util', 'events', 'assert', 'path', 'url', 'querystring', 'string_decoder', 'buffer', 'timers', 'timers/promises', 'perf_hooks', 'crypto', 'os', 'readline', 'stream']);
const PACKAGES = {
  vec3: Object.assign(vec3, { Vec3, default: vec3 }),
  'minecraft-data': minecraftData,
  'mineflayer-pathfinder': pathfinderModule,
  mineflayer: { Vec3 },
};

function safeRequire(name) {
  const n = String(name).replace(/^node:/, '');
  if (PACKAGES[n]) return PACKAGES[n];
  if (ALLOWED.has(n)) return nodeRequire(`node:${n}`);
  throw new Error(`require('${name}'): not available here. Allowed: Node built-ins ${[...ALLOWED].join(', ')}; packages ${Object.keys(PACKAGES).join(', ')}. Programs cannot start processes, use files or the network.`);
}

const show = (v) => {
  if (typeof v === 'string') return v;
  // An error made inside the program's context is that context's Error, not this one: recognise it by shape.
  if (v instanceof Error || (v && typeof v === 'object' && typeof v.message === 'string' && ('stack' in v || 'name' in v))) return v.stack ?? `${v.name ?? 'Error'}: ${v.message}`;
  try { return JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? String(x) : x)); } catch { return String(v); }
};

export class ProgramRunner {
  constructor(bot) {
    this.bot = bot;
    this.programs = 0;
    this.late = [];
    this.lastSeenMessage = 0;
    this.current = null;
    this.running = new Map(); // n -> program, while its code has not ended
    this.als = new AsyncLocalStorage();
    this.guardBot();
    // A death stops every program: they were acting for a player who no longer has their kit or their place.
    bot.on('death', () => this.als.exit(() => { this.raise('you died'); this.stopAll('you died'); }));
    // The safety kit's reflexes take over from the programs when the player is attacked (agent/kit/safety.js).
    bot.stopPrograms = (reason) => this.als.exit(() => { this.raise(reason); return this.stopAll(reason); });
    // An alert (attacked, died) holds every new program until the agent has read `bl news`: a command line that chains
    // programs (`bl run a && bl run b`, or through `| head`) would otherwise carry on blind. In dry8 a player died
    // inside such a line, 53 s long, its death message cut off by `| head -3`.
    this.alert = null;
    const sandbox = {
      require: safeRequire, Buffer, URL, URLSearchParams, TextEncoder, TextDecoder, structuredClone, queueMicrotask,
      setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate, AbortController, AbortSignal,
      performance: { now: () => performance.now() },
      process: { env: {}, platform: 'linux', version: process.version, versions: {}, nextTick: (f, ...a) => queueMicrotask(() => f(...a)), hrtime: process.hrtime, memoryUsage: () => ({}) },
    };
    sandbox.global = sandbox; sandbox.globalThis = sandbox;
    this.context = vm.createContext(sandbox, { name: `program context: ${bot.username}` });
    // A console that writes into whichever program's log is current (or the late log once that program is done).
    const runner = this;
    const write = (level) => (...args) => {
      const line = `[${((Date.now() - (runner.current?.start ?? Date.now())) / 1000).toFixed(1)}s]${level === 'log' ? '' : ` ${level}:`} ${args.map(show).join(' ')}`;
      const target = runner.current && !runner.current.done ? runner.current.log : runner.late;
      target.push(line);
      if (target.length > 2000) target.splice(0, target.length - 2000);
    };
    sandbox.console = { log: write('log'), info: write('log'), debug: write('log'), warn: write('warn'), error: write('error'), table: write('log'), dir: write('log') };
  }

  /** Make the bot refuse a stopped program: its server calls and tick waits fail; the listeners it added are tracked. */
  guardBot() {
    const bot = this.bot, als = this.als;
    // A stopped program's first few calls fail (after a short pause), so code without a catch-all unwinds and ends;
    // after that its calls never answer, so a loop that catches every error and tries again parks for good instead
    // of spinning.
    const refuse = (p) => (++p.refusals > 3 ? new Promise(() => {}) : new Promise((_, reject) => setTimeout(() => reject(new Error(`program ${p.n} was stopped (${p.stopped})`)), 50)));
    const transport = bot.transport, call = transport.call.bind(transport);
    bot.transport = { ...transport, call: (method, ...args) => { const p = als.getStore(); return p?.stopped ? refuse(p) : call(method, ...args); } };
    const waitForTicks = bot.waitForTicks.bind(bot);
    bot.waitForTicks = async (n = 1) => {
      const p = als.getStore();
      if (p?.stopped) return refuse(p);
      await waitForTicks(n);
      if (p?.stopped) return refuse(p);
    };
    for (const name of ['on', 'addListener', 'prependListener']) {
      const add = bot[name].bind(bot);
      // (a `once` registers through `on` with a wrapper that has `.listener`: a one-shot wait, not the program's own)
      bot[name] = (event, fn) => { const p = als.getStore(); if (p && !fn?.listener) p.listeners.push([event, fn]); return add(event, fn); };
    }
  }

  /** Stop every running program; returns their numbers. */
  stopAll(reason) {
    const stopped = [];
    for (const p of this.running.values()) {
      if (p.stopped) continue;
      p.stopped = reason;
      for (const [event, fn] of p.listeners) this.bot.removeListener(event, fn);
      p.listeners = [];
      stopped.push(p.n);
      this.late.push(`[stopped] program ${p.n} was stopped: ${reason}.`);
    }
    if (stopped.length) { try { this.bot.pathfinder?.stop?.(); } catch {} try { this.bot.clearControlStates(); } catch {} }
    return stopped;
  }

  /** Hold new programs until the agent reads `bl news` (the first alert is kept: it says what started it). */
  raise(reason) { this.alert ??= { reason, at: Date.now() }; }

  /** `bl news`: the chat and messages since you last saw them, late output, and what is still running. */
  news() {
    const msgs = this.bot.received.splice(0), late = this.late.splice(0), lines = [];
    if (this.alert) { lines.push(`[alert] ${this.alert.reason} (${Math.round((Date.now() - this.alert.at) / 1000)} s ago). Programs run again now: check safe.status() before you go on.`); this.alert = null; }
    if (msgs.length) for (const m of msgs) lines.push(m.kind === 'chat' ? `<${m.from}> ${m.text}` : `[${m.kind}] ${m.text}`);
    else lines.push('No new chat or messages.');
    if (late.length) { lines.push('--- late output from earlier programs ---'); lines.push(...late); }
    const running = this.runningNote();
    if (running) lines.push(running);
    return lines.join('\n');
  }

  /** The programs still running, as a line for an output; null when there are none. */
  runningNote(except = null) {
    const list = [...this.running.values()].filter(p => p !== except && !p.stopped);
    if (!list.length) return null;
    return `[running] ${list.map(p => `program ${p.n} (started ${((Date.now() - p.start) / 1000).toFixed(0)} s ago)`).join(', ')} still running and acting for you. \`bl stop\` stops every running program.`;
  }

  /** Run a program; resolve with its output text and a record for the log. */
  async run(code, { timeout = 60 } = {}) {
    const timeoutMs = Math.max(1, Math.min(Number(timeout) || 60, 1800)) * 1000;
    // A program runs on a spawned bot: wait for the first state from the server (a Mineflayer program starts after 'spawn').
    for (let i = 0; i < 600 && !this.bot.ready; i++) await new Promise(r => setTimeout(r, 50));
    if (this.alert) {
      const ago = Math.round((Date.now() - this.alert.at) / 1000);
      const output = `=== not run: ${this.alert.reason} (${ago} s ago) ===\nYour program was not run, and none will be until you read what happened: run \`bl news\`, then decide.`;
      return { output, record: { n: null, status: 'refused', stopped: this.alert.reason, seconds: 0, error: null, result: null, log: [], late: [], messages: [] } };
    }
    await this.bot.waitForTicks(2);
    const late = this.late.splice(0);
    const prog = { n: ++this.programs, start: Date.now(), log: [], done: false, stopped: null, refusals: 0, listeners: [] };
    if (this.current && !this.current.done) this.current.overtaken = true;
    this.current = prog;
    let result, error = null, status = 'ok';
    let fn;
    try {
      fn = vm.runInContext(`(async (bot) => {\n${code}\n})`, this.context, { filename: `program-${prog.n}.js`, lineOffset: -1 });
    } catch (err) { error = err; status = 'syntax error'; }
    if (fn) {
      this.running.set(prog.n, prog);
      // The program's own async context: every call it makes, however deep, can tell which program asked.
      const running = this.als.run(prog, () => Promise.resolve().then(() => fn(this.bot)));
      const ended = () => { this.running.delete(prog.n); };
      running.then(ended, (err) => { ended(); if (prog.done && !prog.stopped) this.late.push(`[late] program ${prog.n} failed: ${show(err)}`); });
      let timer;
      const outcome = await Promise.race([
        running.then(v => ({ v }), e => ({ e })),
        new Promise(r => { timer = setTimeout(() => r({ timeout: true }), timeoutMs); }),
      ]);
      clearTimeout(timer);
      if (outcome.timeout) { status = 'timeout'; }
      else if (prog.stopped) { status = 'stopped'; }
      else if ('e' in outcome) { error = outcome.e; status = 'error'; }
      else result = outcome.v;
    }
    prog.done = true;
    const seconds = ((Date.now() - prog.start) / 1000).toFixed(1);
    // Chat and messages since the last program.
    const msgs = this.bot.received.splice(0);
    const lines = [];
    lines.push(`=== program ${prog.n} (${this.bot.username}): ${status}, ${seconds} s ===`);
    lines.push(...prog.log);
    if (status === 'timeout') lines.push(`[timeout] Still running after ${timeoutMs / 1000} s. It was not stopped: it keeps acting until it ends or you run \`bl stop\`. Its later output will be shown with your next program.`);
    if (status === 'stopped') lines.push(`[stopped] This program was stopped: ${prog.stopped}.`);
    if (error) lines.push(`error: ${show(error)}`);
    if (status === 'ok' && result !== undefined) lines.push(`returned: ${show(result)}`);
    const stillRunning = this.runningNote(status === 'timeout' ? null : prog);
    if (stillRunning) lines.push(stillRunning);
    if (late.length) { lines.push('--- late output from earlier programs ---'); lines.push(...late); }
    if (msgs.length) {
      lines.push('--- chat and messages since your last program ---');
      for (const m of msgs) lines.push(m.kind === 'chat' ? `<${m.from}> ${m.text}` : `[${m.kind}] ${m.text}`);
    }
    return { output: lines.join('\n'), record: { n: prog.n, status, stopped: prog.stopped, seconds: +seconds, error: error ? show(error) : null, result: status === 'ok' ? show(result) : null, log: prog.log, late, messages: msgs } };
  }
}
