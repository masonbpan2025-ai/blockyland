// Runs an agent's strategy.js: loaded into its own `vm` context, called every tick with what the player sees, and
// reloaded whenever the file changes (agentArena/docs/strategy-api.md). Nothing but JSON strings crosses into or out of the
// context, so the strategy holds no object of the arena's; each tick has a CPU time limit; a file that fails to load
// leaves the previous version running.
import vm from 'node:vm';
import { readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/** Code run in the strategy's context before strategy.js: `module`, `log`, `world`, `geom` and the input recorder. */
export const PRELUDE = String.raw`
'use strict';
var module = { exports: {} };
var exports = module.exports;
var __cmds = [], __logs = [], __mem = {}, __blocks = new Map(), __names = {}, __bounds = null, __landmarks = null;
function __key(x, y, z) { return x + ',' + y + ',' + z; }
function __text(v) { if (typeof v === 'string') return v; try { return JSON.stringify(v); } catch (e) { return String(v); } }
function log() { if (__logs.length < 40) __logs.push(Array.prototype.map.call(arguments, __text).join(' ').slice(0, 600)); }
var console = { log: log, info: log, warn: log, error: log, debug: log };
var NOT_SOLID = /^(air|water|lava|fire|short_grass|tall_grass|fern|poppy|dandelion|dead_bush|torch|wall_torch|snow_layer|vine|.*_carpet|.*_sign|.*_button|lever|.*_pressure_plate|rail|.*_rail|cobweb|.*_flower|tulip.*|.*_sapling|ladder)$/;
var world = {
  blockAt: function (x, y, z) { return __blocks.get(__key(Math.floor(x), Math.floor(y), Math.floor(z))) || 'air'; },
  isAir: function (x, y, z) { return world.blockAt(x, y, z) === 'air'; },
  isSolid: function (x, y, z) { var b = world.blockAt(x, y, z); return b !== 'air' && !NOT_SOLID.test(b); },
  findBlocks: function (match, opts) {
    opts = opts || {};
    var near = opts.near || null, radius = opts.radius || 48, max = opts.max || 32, out = [];
    var test = typeof match === 'function' ? match : match instanceof RegExp ? function (b) { return match.test(b); } : function (b) { return b === match; };
    __blocks.forEach(function (name, key) {
      if (!test(name)) return;
      var p = key.split(','), x = +p[0], y = +p[1], z = +p[2];
      var d = near ? Math.hypot(x + 0.5 - near.x, y + 0.5 - near.y, z + 0.5 - near.z) : 0;
      if (d <= radius) out.push({ x: x, y: y, z: z, block: name, distance: d });
    });
    out.sort(function (a, b) { return a.distance - b.distance; });
    return out.slice(0, max);
  },
  raycast: function (from, dir, maxDistance) {
    maxDistance = maxDistance || 6;
    var len = Math.hypot(dir.x, dir.y, dir.z) || 1, dx = dir.x / len, dy = dir.y / len, dz = dir.z / len;
    var px = Math.floor(from.x), py = Math.floor(from.y), pz = Math.floor(from.z);
    for (var t = 0; t <= maxDistance; t += 0.05) {
      var x = Math.floor(from.x + dx * t), y = Math.floor(from.y + dy * t), z = Math.floor(from.z + dz * t);
      if (x === px && y === py && z === pz && t > 0) continue;
      if (world.isSolid(x, y, z)) return { x: x, y: y, z: z, block: world.blockAt(x, y, z), distance: t, face: { x: Math.sign(px - x), y: Math.sign(py - y), z: Math.sign(pz - z) } };
      px = x; py = y; pz = z;
    }
    return null;
  },
};
Object.defineProperty(world, 'bounds', { get: function () { return __bounds; } });
var geom = {
  anglesTo: function (eye, point) {
    var dx = point.x - eye.x, dy = point.y - eye.y, dz = point.z - eye.z;
    return { yaw: Math.atan2(-dx, -dz), pitch: Math.max(-1.56, Math.min(1.56, Math.atan2(dy, Math.hypot(dx, dz)))) };
  },
  forward: function (yaw, pitch) { pitch = pitch || 0; return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) }; },
  distance: function (a, b) { return Math.hypot(a.x - b.x, (a.y || 0) - (b.y || 0), a.z - b.z); },
  distanceXZ: function (a, b) { return Math.hypot(a.x - b.x, a.z - b.z); },
  angleDiff: function (a, b) { var d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; },
};
function __push(c) { if (__cmds.length < 200) __cmds.push(c); }
function __num(v, name) { if (typeof v !== 'number' || !isFinite(v)) throw new Error(name + ' must be a finite number'); return v; }
var __input = Object.freeze({
  move: function (keys) { var k = {}; for (var n in (keys || {})) k[n] = !!keys[n]; __push({ type: 'move', keys: k }); },
  stop: function () { __push({ type: 'stop' }); },
  jump: function () { __push({ type: 'jump' }); },
  look: function (yaw, pitch) { __push({ type: 'look', yaw: __num(yaw, 'yaw'), pitch: __num(pitch, 'pitch') }); },
  turn: function (dyaw, dpitch) { __push({ type: 'turn', dyaw: __num(dyaw, 'dyaw'), dpitch: __num(dpitch || 0, 'dpitch') }); },
  lookAt: function (p) { __push({ type: 'lookAt', x: __num(p.x, 'x'), y: __num(p.y, 'y'), z: __num(p.z, 'z') }); },
  attack: function () { __push({ type: 'click', button: 'left' }); },
  use: function () { __push({ type: 'click', button: 'right' }); },
  holdAttack: function (down) { __push({ type: 'hold', button: 'left', down: down !== false }); },
  holdUse: function (down) { __push({ type: 'hold', button: 'right', down: down !== false }); },
  hotbar: function (slot) { __push({ type: 'hotbar', slot: __num(slot, 'slot') }); },
  drop: function () { __push({ type: 'drop' }); },
  swapHands: function () { __push({ type: 'swapHands' }); },
  openInventory: function () { __push({ type: 'openInventory' }); },
  closeScreen: function () { __push({ type: 'closeScreen' }); },
  clickSlot: function (id, opts) { opts = opts || {}; __push({ type: 'slot', id: String(id), button: opts.button === 'right' ? 'right' : 'left', shift: !!opts.shift }); },
  chat: function (text) { __push({ type: 'chat', text: String(text).slice(0, 100) }); },
});
function __load(blocksJson) {
  if (!blocksJson) return;
  var full = JSON.parse(blocksJson);
  __blocks.clear();
  __names = full.names || {};
  __bounds = full.bounds || null;
  var c = full.cells || [];
  for (var i = 0; i < c.length; i += 4) __blocks.set(__key(c[i], c[i + 1], c[i + 2]), __names[c[i + 3]] || ('block_' + c[i + 3]));
}
function __step(json) {
  var msg = JSON.parse(json);
  var changes = msg.blockChanges || [];
  for (var i = 0; i < changes.length; i++) {
    var ch = changes[i], key = __key(ch[0], ch[1], ch[2]);
    if (ch[3]) __blocks.set(key, __names[ch[3]] || ('block_' + ch[3])); else __blocks.delete(key);
  }
  if (msg.landmarks) __landmarks = msg.landmarks;
  var view = msg.view;
  view.world = world;
  view.landmarks = __landmarks;
  __cmds.length = 0; __logs.length = 0;
  var error = null;
  var mod = module.exports;
  var fn = mod && mod.tick;
  if (typeof fn === 'function') {
    try { fn.call(mod, view, __input, __mem); } catch (e) { error = String((e && e.stack) || e).slice(0, 1500); }
  } else {
    error = 'strategy.js must set module.exports = { tick(view, input, mem) { ... } }';
  }
  return JSON.stringify({ cmds: __cmds, logs: __logs, error: error });
}
function __setup() {
  var mod = module.exports;
  if (mod && typeof mod.setup === 'function') mod.setup(__mem);
  return 'ok';
}
`;

const memScript = new vm.Script('JSON.stringify(__mem)');
const stepScript = new vm.Script('__step(__in)');
const loadScript = new vm.Script('__load(__in)');
const setupScript = new vm.Script('__setup()');

/** A new context: a null-prototype global (so `this.constructor` leads nowhere), the prelude, then the strategy. */
function makeContext(source, filename, timeoutMs) {
  const sandbox = Object.create(null);
  const context = vm.createContext(sandbox, { name: filename, codeGeneration: { strings: false, wasm: false }, microtaskMode: 'afterEvaluate' });
  new vm.Script(PRELUDE, { filename: 'arena-prelude.js' }).runInContext(context, { timeout: timeoutMs });
  new vm.Script(source, { filename }).runInContext(context, { timeout: timeoutMs });
  return context;
}

export class StrategyRunner {
  /**
   * @param {object} o
   * @param {string} o.file the strategy file, watched for changes
   * @param {string} [o.versionsDir] every version that loads is copied here, numbered, for the record
   * @param {number} [o.tickTimeoutMs] the CPU time one tick may take
   */
  constructor({ file, versionsDir = null, tickTimeoutMs = 60, loadTimeoutMs = 2000, now = () => Date.now() }) {
    this.file = file;
    this.versionsDir = versionsDir;
    this.tickTimeoutMs = tickTimeoutMs;
    this.loadTimeoutMs = loadTimeoutMs;
    this.now = now;
    this.context = null;
    this.mtime = 0;
    this.version = 0;
    this.loadError = null;
    this.lastError = null;
    this.errorCount = 0;
    this.ticks = 0;
    this.slowTicks = 0;
    this.blocksJson = null;
    this.blocksPending = false;
    this.loads = [];
  }

  /** The full block map, sent into the context now and again after every reload. */
  setBlocks(full) {
    this.blocksJson = JSON.stringify(full);
    this.blocksPending = true;
  }

  /**
   * Reload if the file changed since the last look. `prepare` runs first (to hand over the blocks as they are now).
   * @returns whether a new version loaded
   */
  checkForUpdate(prepare = null) {
    let st;
    try { st = statSync(this.file); } catch { return false; }
    if (st.mtimeMs === this.mtime) return false;
    this.mtime = st.mtimeMs;
    prepare?.();
    return this.reload();
  }

  reload() {
    let source;
    try { source = readFileSync(this.file, 'utf8'); } catch (err) { this.loadError = `cannot read strategy: ${err.message}`; return false; }
    const at = this.now();
    let context;
    try {
      context = makeContext(source, path.basename(this.file), this.loadTimeoutMs);
    } catch (err) {
      this.loadError = `load failed, still running version ${this.version || 'none'}: ${String(err?.stack ?? err).split('\n').slice(0, 6).join('\n')}`;
      this.loads.push({ at, ok: false, error: this.loadError });
      return false;
    }
    // Carry `mem` over from the version being replaced.
    let memJson = '{}';
    if (this.context) {
      try { memJson = memScript.runInContext(this.context, { timeout: this.loadTimeoutMs }) ?? '{}'; } catch { memJson = '{}'; }
    }
    try {
      context.__in = memJson;
      new vm.Script('__mem = JSON.parse(__in) || {}').runInContext(context, { timeout: this.loadTimeoutMs });
      if (this.blocksJson) { context.__in = this.blocksJson; loadScript.runInContext(context, { timeout: this.loadTimeoutMs * 5 }); }
      setupScript.runInContext(context, { timeout: this.loadTimeoutMs });
    } catch (err) {
      this.loadError = `setup() failed, still running version ${this.version || 'none'}: ${String(err?.message ?? err).slice(0, 600)}`;
      this.loads.push({ at, ok: false, error: this.loadError });
      return false;
    }
    this.context = context;
    this.ticksSinceLoad = 0;
    this.blocksPending = false;
    this.version++;
    this.loadError = null;
    this.loads.push({ at, ok: true, version: this.version });
    if (this.versionsDir) {
      try { mkdirSync(this.versionsDir, { recursive: true }); writeFileSync(path.join(this.versionsDir, `v${String(this.version).padStart(3, '0')}-${new Date(at).toISOString().replace(/[:.]/g, '-')}.js`), source); } catch { /* the record is best effort */ }
    }
    return true;
  }

  /**
   * One tick: the view in, the strategy's commands and log lines out.
   * @returns {{cmds: object[], logs: string[], error: string|null, ms: number}}
   */
  step(view, { blockChanges = [], landmarks = null } = {}) {
    if (!this.context) return { cmds: [], logs: [], error: this.loadError ?? 'no strategy loaded', ms: 0 };
    if (this.blocksPending && this.blocksJson) {
      try { this.context.__in = this.blocksJson; loadScript.runInContext(this.context, { timeout: this.loadTimeoutMs * 5 }); this.blocksPending = false; } catch { /* next tick */ }
    }
    const t0 = performance.now();
    let out;
    try {
      this.context.__in = JSON.stringify({ view, blockChanges, landmarks });
      // The first ticks after a load also compile the code: they get more time.
      const limit = this.ticksSinceLoad < 5 ? this.tickTimeoutMs * 4 : this.tickTimeoutMs;
      this.ticksSinceLoad++;
      out = JSON.parse(stepScript.runInContext(this.context, { timeout: limit }));
    } catch (err) {
      const timedOut = /timed out/i.test(String(err?.message));
      if (timedOut) this.slowTicks++;
      out = { cmds: [], logs: [], error: timedOut ? `tick took longer than ${this.ticksSinceLoad <= 5 ? this.tickTimeoutMs * 4 : this.tickTimeoutMs} ms and was stopped` : String(err?.message ?? err).slice(0, 600) };
    }
    this.ticks++;
    if (out.error) { this.lastError = { tick: this.ticks, error: out.error }; this.errorCount++; }
    return { ...out, ms: performance.now() - t0 };
  }
}
