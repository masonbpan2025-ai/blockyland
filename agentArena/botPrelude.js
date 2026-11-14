// The bot API as a strategy sees it (agentArena/docs/strategy-api.md), evaluated INSIDE each strategy's sandbox
// (botRunner.mjs). Nothing from the arena's process is reachable from here: the arena sends a JSON snapshot of what the
// player perceives, the world's block changes, events and results through __deliver(json), and collects the program's
// requests and log lines through __drain(). Every action is a request the arena carries out on the player after the
// reaction time; reading the world is answered here, from the snapshot.
'use strict';
const __reqs = [];
const __pending = new Map();
const __logs = [];
const __timers = [];
const __listeners = new Map();
const __world = { names: {}, cells: new Map(), bounds: null };
let __nextId = 1, __timerId = 1, __now = 0, __state = null, __exit = null, __control = {};

const __str = (x) => { if (typeof x === 'string') return x; try { return JSON.stringify(x); } catch { return String(x); } };
const console = { log: (...a) => { __logs.push(a.map(__str).join(' ').slice(0, 2000)); if (__logs.length > 400) __logs.splice(0, 200); } };
console.info = console.warn = console.error = console.debug = console.log;

class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    if (typeof x === 'object' && x !== null) { z = x.z; y = x.y; x = x.x; }
    this.x = Number(x) || 0; this.y = Number(y) || 0; this.z = Number(z) || 0;
  }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  offset(dx, dy, dz) { return new Vec3(this.x + dx, this.y + dy, this.z + dz); }
  plus(v) { return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z); }
  minus(v) { return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  subtract(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  scaled(s) { return new Vec3(this.x * s, this.y * s, this.z * s); }
  floored() { return new Vec3(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)); }
  floor() { this.x = Math.floor(this.x); this.y = Math.floor(this.y); this.z = Math.floor(this.z); return this; }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  distanceSquared(v) { return (this.x - v.x) ** 2 + (this.y - v.y) ** 2 + (this.z - v.z) ** 2; }
  xzDistanceTo(v) { return Math.hypot(this.x - v.x, this.z - v.z); }
  equals(v) { return !!v && this.x === v.x && this.y === v.y && this.z === v.z; }
  norm() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { const n = this.norm() || 1; return new Vec3(this.x / n, this.y / n, this.z / n); }
  toArray() { return [this.x, this.y, this.z]; }
  toString() { return `(${this.x}, ${this.y}, ${this.z})`; }
}
const __v = (p) => { if (!p) throw new Error('a position is needed'); const q = p.position ?? p; return new Vec3(q.x, q.y, q.z); };
const __plain = (v) => ({ x: Number(v.x) || 0, y: Number(v.y) || 0, z: Number(v.z) || 0 });

// --- timers, on the arena's clock (50 ms ticks) ---
function sleep(ms) { return new Promise((r) => { __timers.push({ id: __timerId++, at: __now + Math.max(0, Number(ms) || 0), fn: r }); }); }
function setTimeout(fn, ms, ...a) { const id = __timerId++; __timers.push({ id, at: __now + Math.max(0, Number(ms) || 0), fn: () => fn(...a) }); return id; }
function setInterval(fn, ms, ...a) { const id = __timerId++; const every = Math.max(50, Number(ms) || 0); __timers.push({ id, at: __now + every, every, fn: () => fn(...a) }); return id; }
function clearTimeout(id) { const i = __timers.findIndex((t) => t.id === id); if (i >= 0) __timers.splice(i, 1); }
const clearInterval = clearTimeout;

// --- requests to the arena ---
function __call(op, ...args) { const id = __nextId++; __reqs.push({ id, op, args }); return new Promise((res, rej) => __pending.set(id, { res, rej })); }
function __send(op, ...args) { __reqs.push({ id: 0, op, args }); }

// --- events ---
function __emit(name, ...args) {
  for (const l of [...(__listeners.get(name) ?? [])]) {
    if (l.once) __listeners.get(name).splice(__listeners.get(name).indexOf(l), 1);
    try { const r = l.fn(...args); if (r && typeof r.catch === 'function') r.catch((e) => console.log(`[error in ${name} handler] ${e && e.stack || e}`)); } catch (e) { console.log(`[error in ${name} handler] ${e && e.stack || e}`); }
  }
}

// --- pathfinder goals: plain descriptions the arena turns into the pathfinder's goals ---
const goals = {
  GoalNear: class { constructor(x, y, z, range = 1) { Object.assign(this, { kind: 'near', x, y, z, range }); } },
  GoalBlock: class { constructor(x, y, z) { Object.assign(this, { kind: 'block', x, y, z }); } },
  GoalXZ: class { constructor(x, z) { Object.assign(this, { kind: 'xz', x, z }); } },
  GoalNearXZ: class { constructor(x, z, range = 1) { Object.assign(this, { kind: 'nearxz', x, z, range }); } },
  GoalY: class { constructor(y) { Object.assign(this, { kind: 'y', y }); } },
  GoalGetToBlock: class { constructor(x, y, z) { Object.assign(this, { kind: 'gettoblock', x, y, z }); } },
  GoalFollow: class { constructor(entity, range = 2) { Object.assign(this, { kind: 'follow', id: entity && entity.id, range }); } },
  GoalInvert: class { constructor(goal) { Object.assign(this, { kind: 'invert', goal }); } },
  GoalCompositeAny: class { constructor(list = []) { Object.assign(this, { kind: 'any', goals: list }); } },
  GoalCompositeAll: class { constructor(list = []) { Object.assign(this, { kind: 'all', goals: list }); } },
};

// --- what the player sees ---
function __entity(e) {
  if (!e) return null;
  const out = { ...e, position: new Vec3(e.position) };
  if (e.velocity) out.velocity = new Vec3(e.velocity);
  return out;
}
function __block(p) {
  const v = new Vec3(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
  const id = __world.cells.get(`${v.x},${v.y},${v.z}`) ?? 0;
  const name = id === 0 ? 'air' : (__world.names[id] ?? `block_${id}`);
  return { name, type: id, position: v, boundingBox: id === 0 || /water|lava|torch|flower|grass$|ladder/.test(name) && name !== 'grass_block' ? 'empty' : 'block', diggable: id !== 0 };
}
function __matcher(matching) {
  if (typeof matching === 'function') return (b) => { try { return !!matching(b); } catch { return false; } };
  const list = (Array.isArray(matching) ? matching : [matching]).map((m) => (typeof m === 'number' ? __world.names[m] : String(m)));
  return (b) => list.includes(b.name);
}
const __window = () => (__state && __state.window ? { ...__state.window, slots: __state.window.slots.map((s) => (s ? { ...s } : null)) } : null);

const bot = {
  get username() { return __state ? __state.me.username : ''; },
  get entity() { return __state ? __entity(__state.me.entity) : null; },
  get health() { return __state ? __state.me.health : 20; },
  get food() { return __state ? __state.me.food : 20; },
  get heldItem() { return __state && __state.me.held ? { ...__state.me.held } : null; },
  get quickBarSlot() { return __state ? __state.me.quickBarSlot : 0; },
  get players() {
    const out = {};
    if (!__state) return out;
    out[__state.me.username] = { username: __state.me.username, entity: __entity(__state.me.entity) };
    for (const e of __state.others) if (e.type === 'player') out[e.username] = { username: e.username, entity: __entity(e) };
    return out;
  },
  get entities() {
    const out = {};
    if (!__state) return out;
    out[__state.me.entity.id] = __entity(__state.me.entity);
    for (const e of __state.others) out[e.id] = __entity(e);
    return out;
  },
  nearestEntity(filter = () => true) {
    if (!__state) return null;
    const me = __state.me.entity.position;
    let best = null, bd = Infinity;
    for (const e of __state.others) {
      const ent = __entity(e);
      let ok = false; try { ok = filter(ent); } catch { ok = false; }
      if (!ok) continue;
      const d = Math.hypot(e.position.x - me.x, e.position.y - me.y, e.position.z - me.z);
      if (d < bd) { bd = d; best = ent; }
    }
    return best;
  },
  get arena() { return __state ? JSON.parse(JSON.stringify(__state.arena)) : null; },
  get scoreboard() { return __state ? [...__state.scoreboard] : []; },
  get currentWindow() { return __window(); },
  get time() { return { now: __now }; },
  inventory: {
    items() { return __state ? __state.me.items.map((i) => ({ ...i })) : []; },
    count(name) { return __state ? __state.me.items.filter((i) => i.name === name).reduce((n, i) => n + i.count, 0) : 0; },
    findInventoryItem(name) { const i = __state && __state.me.items.find((x) => x.name === name); return i ? { ...i } : null; },
    get slots() { return __state ? __state.me.slots.map((s) => (s ? { ...s } : null)) : []; },
  },
  blockAt(p) { return __block(__v(p)); },
  findBlocks({ matching, maxDistance = 16, count = 1, point } = {}) {
    const test = __matcher(matching);
    const c = point ? __v(point) : (__state ? new Vec3(__state.me.entity.position) : new Vec3(0, 0, 0));
    const r = Math.min(64, Math.max(1, Number(maxDistance) || 16));
    const found = [];
    for (const [k, id] of __world.cells) {
      const [x, y, z] = k.split(',').map(Number);
      const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y, z + 0.5 - c.z);
      if (d > r) continue;
      const b = { name: __world.names[id] ?? `block_${id}`, type: id, position: new Vec3(x, y, z) };
      if (test(b)) found.push([d, b.position]);
    }
    found.sort((a, b) => a[0] - b[0]);
    return found.slice(0, Math.max(1, Number(count) || 1)).map((f) => f[1]);
  },
  findBlock(opts = {}) { const p = bot.findBlocks({ ...opts, count: 1 })[0]; return p ? __block(p) : null; },
  canDigBlock(block) {
    if (!__state || !block) return false;
    const e = __state.me.entity.position; const p = __v(block);
    return Math.hypot(p.x + 0.5 - e.x, p.y + 0.5 - (e.y + 1.62), p.z + 0.5 - e.z) <= 4.5 && __block(p).name !== 'air';
  },

  controlState: __control,
  setControlState(control, on) { __control[control] = !!on; __send('control', String(control), !!on); },
  getControlState(control) { return !!__control[control]; },
  clearControlStates() { for (const k of Object.keys(__control)) __control[k] = false; __send('clearControls'); },
  lookAt(point) { return __call('lookAt', __plain(__v(point))); },
  look(yaw, pitch) { return __call('look', Number(yaw) || 0, Number(pitch) || 0); },

  pathfinder: {
    goto(goal) { return __call('goto', goal); },
    setGoal(goal, dynamic = false) { __send('setGoal', goal || null, !!dynamic); },
    stop() { __send('stopPath'); },
    isMoving() { return !!(__state && __state.me.moving); },
    setMovements() {},
  },

  placeBlock(referenceBlock, faceVector) { return __call('placeBlock', __plain(__v(referenceBlock)), __plain(new Vec3(faceVector || { x: 0, y: 1, z: 0 }))); },
  dig(block) { return __call('dig', __plain(__v(block))); },
  stopDigging() { __send('stopDigging'); },
  attack(entity) { return __call('attack', entity && entity.id); },
  equip(item, destination = 'hand') { return __call('equip', typeof item === 'string' ? item : item && item.name, destination); },
  unequip(destination = 'hand') { return __call('unequip', destination); },
  consume() { return __call('consume'); },
  activateItem() { __send('activateItem'); },
  deactivateItem() { __send('deactivateItem'); },
  toss(name, _metadata, count) { return __call('toss', typeof name === 'string' ? name : name && name.name, count ?? null); },
  tossStack(item) { return __call('toss', item && item.name, item && item.count); },
  setQuickBarSlot(slot) { __send('quickBar', Number(slot) || 0); },
  activateBlock(block) { return __call('activateBlock', __plain(__v(block))); },
  activateEntity(entity) { return __call('activateEntity', entity && entity.id).then(() => __window()); },
  async openContainer(block) {
    await __call('openContainer', __plain(__v(block)));
    return {
      get slots() { const w = __window(); return w ? w.slots : []; },
      containerItems() { const w = __window(); return w ? w.slots.filter(Boolean) : []; },
      withdraw(name, _m, count) { return __call('withdraw', name, count ?? null); },
      deposit(name, _m, count) { return __call('deposit', name, count ?? null); },
      close() { __send('closeWindow'); },
    };
  },
  clickWindow(slot, mouseButton = 0, mode = 0) { return __call('clickWindow', Number(slot), Number(mouseButton) || 0, Number(mode) || 0); },
  closeWindow() { __send('closeWindow'); },
  chat(text) { __send('chat', String(text ?? '').slice(0, 100)); },
  whisper(_u, text) { bot.chat(text); },
  waitForTicks(n = 1) { return sleep(Math.max(1, Number(n) || 1) * 50); },

  on(name, fn) { if (!__listeners.has(name)) __listeners.set(name, []); __listeners.get(name).push({ fn, once: false }); return bot; },
  once(name, fn) { if (!__listeners.has(name)) __listeners.set(name, []); __listeners.get(name).push({ fn, once: true }); return bot; },
  off(name, fn) { const l = __listeners.get(name); if (l) { const i = l.findIndex((x) => x.fn === fn); if (i >= 0) l.splice(i, 1); } return bot; },
  removeListener(name, fn) { return bot.off(name, fn); },
  removeAllListeners(name) { if (name) __listeners.delete(name); else __listeners.clear(); return bot; },
  addListener(name, fn) { return bot.on(name, fn); },
};
for (const k of ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak']) __control[k] = false;

// --- the arena's side ---
globalThis.__deliver = (json) => {
  const d = JSON.parse(json);
  __now = d.now;
  if (d.world) { __world.names = d.world.names; __world.bounds = d.world.bounds; __world.cells = new Map(); const c = d.world.cells; for (let i = 0; i < c.length; i += 4) __world.cells.set(`${c[i]},${c[i + 1]},${c[i + 2]}`, c[i + 3]); }
  for (const [x, y, z, id] of d.blocks ?? []) { const k = `${x},${y},${z}`; const old = __world.cells.get(k) ?? 0; if (id) __world.cells.set(k, id); else __world.cells.delete(k); if (old !== id) d.events.push(['blockUpdate', { x, y, z, old, id }]); }
  if (d.state) __state = d.state;
  for (const r of d.results ?? []) {
    const p = __pending.get(r.id);
    if (!p) continue;
    __pending.delete(r.id);
    if (r.ok) p.res(r.value); else p.rej(new Error(r.error));
  }
  for (const [name, ...args] of d.events ?? []) {
    if (name === 'blockUpdate') { const a = args[0]; const pos = new Vec3(a.x, a.y, a.z); __emit('blockUpdate', { name: __world.names[a.old] ?? 'air', type: a.old, position: pos }, { name: __world.names[a.id] ?? 'air', type: a.id, position: pos }); }
    else if (name === 'entitySpawn' || name === 'entityGone' || name === 'entityHurt') __emit(name, __entity(args[0]));
    else if (name === 'windowOpen') __emit(name, __window());
    else __emit(name, ...args);
  }
  // Timers that are due, in time order (an interval comes round again).
  for (let guard = 0; guard < 1000; guard++) {
    let next = -1;
    for (let i = 0; i < __timers.length; i++) if (__timers[i].at <= __now && (next < 0 || __timers[i].at < __timers[next].at)) next = i;
    if (next < 0) break;
    const t = __timers[next];
    if (t.every) t.at += t.every; else __timers.splice(next, 1);
    try { t.fn(); } catch (e) { console.log(`[error in timer] ${e && e.stack || e}`); }
  }
};
globalThis.__drain = () => { const out = JSON.stringify({ reqs: __reqs.splice(0), logs: __logs.splice(0), exit: __exit }); __exit = null; return out; };
globalThis.__start = (memJson) => {
  globalThis.mem = JSON.parse(memJson || '{}');
  const main = module.exports && module.exports.main;
  if (typeof main !== 'function') { __exit = { error: 'the strategy file has no main(bot, mem): set module.exports = { main }' }; return; }
  Promise.resolve().then(() => main(bot, globalThis.mem)).then(() => { __exit = { done: true }; }, (e) => { __exit = { error: String(e && e.stack || e).slice(0, 1500) }; });
};
globalThis.__mem = () => { try { return JSON.stringify(globalThis.mem ?? {}); } catch { return '{}'; } };
