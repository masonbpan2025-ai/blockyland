// One player in a bot match (agentArena/docs/agent-rules.md, "Your player and the bot API"): a guest bot in the room
// (packages/blockyland-mcp/guestPeer.js, with Java Edition walking speeds and the guest's "normal" action times), driven
// by the agent's strategy program through the bot API (botPrelude.js) in a sandbox of its own.
//
// Only JSON crosses into or out of the sandbox. Every 50 ms the arena sends what the player perceives (perception.js
// rules: other players only while seen or heard), block changes, events and the results of finished actions, and
// collects the program's requests and log lines. Each request starts after a human reaction time (200 ms + 0-80 ms),
// in the order the program made them, and runs on the guest bot; reading the world costs nothing.
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { readFileSync, statSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  Vec3, goals as G, BLOCKS, BEDWARS_ITEM_SHOP, BEDWARS_UPGRADES, BEDWARS_TRAPS, NAME_BY_BLOCK, DIFFICULTY_PROFILES,
  AUTOPILOT_MELEE_REACH,
} from '../packages/blockyland-mcp/guestPeer.js';

const PRELUDE = readFileSync(path.join(import.meta.dirname, 'botPrelude.js'), 'utf8');
export const TICK_MS = 50;
/** The human limits (agent-rules.md, "Reaction time and human speed"). */
export const BOT_LIMITS = Object.freeze({ reactionMs: 150, reactionJitterMs: 60, chatCharsPerSecond: 12, reachBlocks: 4.5, entityReach: 4, cpuMs: 50, warmupCpuMs: 400 });
/** Java Edition: walking 4.317 blocks/s, sprinting 5.612; the guest's "normal" times for everything else. */
export const ARENA_PROFILE = Object.freeze({ ...DIFFICULTY_PROFILES.normal, id: 'arena', label: 'Agent Arena (Java speeds)', walkSpeed: 4.317, sprintSpeed: 5.612, sprintAllowed: true });

/**
 * The rules a program plays under. 'arena' (the Agent Arena's, for AI agents' strategy code): a human's reaction time
 * before every action, only what a player could see or hear, Java walking and sprinting speeds. 'autopilot': the same
 * standard as an MCP guest's built-in autopilot (join_game with autopilot on, guestPeer.js #brainSkyWars and the
 * others) at a difficulty -- that difficulty's speeds and hit cooldown (DIFFICULTY_PROFILES), the autopilot's hit reach
 * (3 blocks, eyes to the target's body, as in Minecraft: AUTOPILOT_MELEE_REACH), Java's weapon damage and recharge, no reaction delay, and every player's position
 * known, as the autopilot knows it. The lobby's "Bot join" bots use 'autopilot' at normal, so
 * they meet MCP agents on the same terms.
 */
export function playRules({ standard = 'arena', difficulty = 'normal' } = {}) {
  if (standard === 'arena') return { standard, profile: ARENA_PROFILE, reach: BOT_LIMITS.entityReach, reactionMs: BOT_LIMITS.reactionMs, reactionJitterMs: BOT_LIMITS.reactionJitterMs, omniscient: false };
  if (standard !== 'autopilot') throw new Error(`unknown rules "${standard}" (arena or autopilot)`);
  const profile = DIFFICULTY_PROFILES[difficulty];
  if (!profile) throw new Error(`unknown difficulty "${difficulty}" (${Object.keys(DIFFICULTY_PROFILES).join(', ')})`);
  return {
    standard, difficulty, reach: AUTOPILOT_MELEE_REACH, reactionMs: 0, reactionJitterMs: 0, omniscient: true,
    profile: Object.freeze({ ...profile, botMeleeReach: AUTOPILOT_MELEE_REACH }),
  };
}

const blockName = (id) => (id === 0 ? 'air' : (NAME_BY_BLOCK.get(id) ?? `block_${id}`).replace(/^grass$/, 'grass_block'));
const itemName = (stack) => (!stack ? null : typeof stack.id === 'number' ? blockName(stack.id) : String(stack.id));
const itemOf = (stack, slot) => (stack ? { name: itemName(stack), count: stack.count ?? 1, slot, displayName: itemName(stack), ...(stack.enchantments?.length ? { enchants: stack.enchantments.map((e) => ({ name: e.id, lvl: e.level })) } : {}) } : null);
const r2 = (v) => Math.round(v * 100) / 100;
const vec = (p) => ({ x: r2(p.x), y: r2(p.y), z: r2(p.z) });
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// --- perception ---------------------------------------------------------------------------------------------------
/** Horizontal and vertical half-angles of the view (70 degrees vertical at 16:9). */
const FOV = { h: (102 * Math.PI) / 360, v: (70 * Math.PI) / 360 };
const angleDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

/** Whether the straight line between two points passes through no solid block. */
function clearLine(isSolid, a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const steps = Math.ceil(d / 0.25);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isSolid(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}

/**
 * What one player perceives of another: 'body' (in view and not hidden), 'nametag' (in view, name tag through walls,
 * not sneaking, within 64), 'heard' (within 16, otherwise unseen), or null.
 */
export function perceive({ eye, yaw, pitch, target, sneaking, isSolid }) {
  const dx = target.x - eye.x, dz = target.z - eye.z;
  const dist = Math.hypot(dx, target.y - eye.y, dz);
  const toYaw = Math.atan2(-dx, -dz);
  const head = { x: target.x, y: target.y + 1.5, z: target.z };
  const toPitch = Math.atan2(head.y - eye.y, Math.hypot(dx, dz));
  // Within arm's length a player fills the screen whichever way you face.
  if (dist <= 2) return 'body';
  const inView = Math.abs(angleDiff(toYaw, yaw)) <= FOV.h && Math.abs(toPitch - pitch) <= FOV.v + 0.2;
  if (inView && dist <= 96) {
    if (clearLine(isSolid, eye, head) || clearLine(isSolid, eye, { x: target.x, y: target.y + 0.4, z: target.z })) return 'body';
    if (!sneaking && dist <= 64) return 'nametag';
  }
  if (dist <= 16) return 'heard';
  return null;
}

// --- the sandbox --------------------------------------------------------------------------------------------------
export class Program {
  constructor(source, file, log) {
    this.context = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false }, microtaskMode: 'afterEvaluate' });
    vm.runInContext('var module = { exports: {} }; var exports = module.exports;', this.context);
    vm.runInContext(PRELUDE, this.context, { filename: 'bot-api.js', timeout: 1000 });
    vm.runInContext(source, this.context, { filename: path.basename(file), timeout: 1000 });
    this.log = log;
  }
  call(code, timeout) { return vm.runInContext(code, this.context, { timeout }); }
}

/**
 * A player: its guest bot (`session`), its strategy file, and everything between them.
 */
export class BotPlayer {
  constructor({ name, session, strategyFile = null, versionsDir = null, recorder, statusDir = null, seed = 1, game, getMatch, getMessages, timeLimit, refereeId = null, rules = {} }) {
    this.name = name;
    this.rules = playRules(rules);
    this.session = session;
    this.bot = session.bot;
    this.file = strategyFile;
    this.versionsDir = versionsDir;
    this.recorder = recorder;
    this.statusDir = statusDir;
    this.game = game;
    this.getMatch = getMatch;
    this.timeLimit = timeLimit;
    this.refereeId = refereeId;
    let s = seed >>> 0;
    this.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    this.program = null;
    this.version = 0;
    this.mtime = 0;
    this.loadError = null;
    this.mem = '{}';
    this.started = false;
    this.restartAt = 0;
    this.queue = [];          // requests waiting for their reaction time
    this.lastDue = 0;
    this.results = [];
    this.events = [];
    this.blockChanges = [];
    this.sentWorld = false;
    this.window = null;
    this.container = null;
    this.visible = new Map(); // id -> last perceived entity
    this.lastHealth = null;
    this.wasDead = false;
    this.t0 = Date.now();
    this.stats = { ticks: 0, errors: 0, slow: 0, actions: 0, failed: 0, restarts: 0 };
    this.logTail = [];
    this.lastError = null;
    this.attackingUntil = 0;
    this.lastStatus = 0;
    // Block changes, whoever made them, as this player's copy of the world gets them.
    const setVoxel = session.setVoxel.bind(session);
    session.setVoxel = (x, y, z, id) => { const before = session.getVoxel(x, y, z); setVoxel(x, y, z, id); if (before !== id) this.blockChanges.push([Math.floor(x), Math.floor(y), Math.floor(z), id]); };
    // The guest's own chat replies and autopilot stay off: only the program acts.
    session.handlePlayerChat = async () => ({ ok: true });
    Object.defineProperty(session, 'profile', { value: this.rules.profile, configurable: true });
    // The runner's own listeners go straight to the emitter: bot.on's are the program's, and a program's (re)start
    // (stopAll) removes those.
    const listen = (event, fn) => (this.bot instanceof EventEmitter ? EventEmitter.prototype.on.call(this.bot, event, fn) : this.bot.on(event, fn));
    listen('chat', (username, message) => { if (username !== this.name) this.events.push(['chat', username, message]); });
    // Where each of my shots ended (a player, a block, the void): in the recording, for reviews.
    listen('projectileEnd', (e) => {
      const r2p = (p) => (p ? { x: r2(p.x), y: r2(p.y), z: r2(p.z) } : null);
      const end = { kind: e.kind, hit: e.hit ? (session.peers.get(e.hit.id)?.name ?? e.hit.id) : null, block: e.block ?? null, at: r2p(e.at), lost: !!e.lost, ticks: e.ticks };
      this.recorder.write('events.jsonl', { kind: 'projectile', who: this.name, projectile: end.kind, hit: end.hit, block: end.block, at: end.at, lost: end.lost, ticks: end.ticks });
      this.events.push(['projectileEnd', end]);
    });
    this.getMessages = getMessages;
  }

  log(line) {
    this.logTail.push(line);
    if (this.logTail.length > 300) this.logTail.splice(0, 100);
    if (this.statusDir) this.recorder.line(path.join(this.statusDir, `${this.name}.log`), line);
  }

  now() { return Date.now() - this.t0; }

  // --- loading -----------------------------------------------------------------------------------------------------
  /** Load the strategy file if it changed; the running program keeps running if the new one does not load. */
  checkForUpdate() {
    if (!this.file) return false;
    let st;
    try { st = statSync(this.file); } catch { return false; }
    if (st.mtimeMs === this.mtime) return false;
    this.mtime = st.mtimeMs;
    let program;
    try { program = new Program(readFileSync(this.file, 'utf8'), this.file, (l) => this.log(l)); } catch (err) {
      this.loadError = `${err.name}: ${err.message}`;
      this.log(`[arena] version did not load (the previous one keeps running): ${this.loadError}`);
      this.recorder.write('events.jsonl', { kind: 'strategy_load_failed', who: this.name, error: this.loadError });
      return false;
    }
    if (this.program) { try { this.mem = this.program.call('__mem()', 200); } catch { /* keep the last */ } }
    this.stopActions();
    this.program = program;
    this.version++;
    this.loadError = null;
    this.started = false;
    this.sentWorld = false;
    this.warmup = 5;
    if (this.versionsDir) { mkdirSync(this.versionsDir, { recursive: true }); copyFileSync(this.file, path.join(this.versionsDir, `v${String(this.version).padStart(3, '0')}-${new Date().toISOString().replace(/[:.]/g, '-')}.js`)); }
    this.log(`[arena] loaded strategy version ${this.version}`);
    this.recorder.write('events.jsonl', { kind: 'strategy_loaded', who: this.name, version: this.version });
    return true;
  }

  /** Cancel everything the previous program asked for: pending and running actions, held controls, paths. */
  stopActions() {
    this.queue.length = 0;
    this.results.length = 0;
    this.window = null;
    this.container = null;
    try { this.bot.stopAll(); } catch { /* not connected */ }
  }

  // --- perception --------------------------------------------------------------------------------------------------
  isSolid = (x, y, z) => this.session.isSolid(x, y, z);

  perceived() {
    const s = this.session;
    const eye = { x: s.position.x, y: s.position.y + 1.62, z: s.position.z };
    const out = [];
    const seenNow = new Set();
    for (const peer of s.peers.values()) {
      if (peer.id === s.clientId || peer.isHost || peer.id === this.refereeId || peer.dead || peer.name === this.name) continue;
      if (peer.gamemode === 'spectator') continue;
      const target = { x: peer.x ?? 0, y: peer.y ?? 0, z: peer.z ?? 0 };
      const seen = this.rules.omniscient ? 'body' : perceive({ eye, yaw: s.yaw, pitch: s.pitch, target, sneaking: !!(peer.sneaking ?? peer.crouching), isSolid: this.isSolid });
      if (!seen) continue;
      seenNow.add(peer.id);
      const e = seen === 'heard'
        ? { id: peer.id, type: 'player', username: peer.name, position: { x: Math.round(target.x / 2) * 2, y: Math.round(target.y), z: Math.round(target.z / 2) * 2 }, heard: true }
        : {
          id: peer.id, type: 'player', username: peer.name, seen, position: vec(target), yaw: r2(peer.yaw ?? 0), pitch: r2(peer.pitch ?? 0),
          heldItem: peer.activeItem ? { name: itemName({ id: peer.activeItem }) } : null,
          equipment: Array.isArray(peer.armor) ? peer.armor.map((a) => (a ? itemName({ id: a.id ?? a }) : null)) : [],
          sneaking: !!(peer.sneaking ?? peer.crouching), sprinting: !!peer.sprinting, heard: false,
        };
      out.push(e);
    }
    for (const id of seenNow) if (!this.visible.has(id)) this.events.push(['entitySpawn', out.find((e) => e.id === id)]);
    for (const id of this.visible.keys()) if (!seenNow.has(id)) this.events.push(['entityGone', this.visible.get(id)]);
    this.visible = new Map(out.map((e) => [e.id, e]));
    // Non-player figures in plain view: the Bed Wars shopkeepers.
    for (const n of this.npcs()) out.push(n);
    return out;
  }

  npcs() {
    const arena = this.session.bedwarsArena;
    if (this.game !== 'bedwars' || !arena) return [];
    return arena.bases.flatMap((b) => [
      { id: `shop:${b.team}`, type: 'mob', name: 'villager', displayName: 'Item Shop', team: b.team, position: { x: b.shop.x, y: b.shop.y, z: b.shop.z } },
      { id: `upgrades:${b.team}`, type: 'mob', name: 'villager', displayName: 'Team Upgrades', team: b.team, position: { x: b.upgrades.x, y: b.upgrades.y, z: b.upgrades.z } },
    ]);
  }

  // --- what the program reads ----------------------------------------------------------------------------------------
  inventoryView() {
    const inv = this.session.inventory;
    const slots = new Array(46).fill(null);
    const armorSlot = { head: 5, chest: 6, legs: 7, feet: 8 };
    for (const [k, i] of Object.entries(armorSlot)) slots[i] = itemOf(inv.armor?.[k], i);
    (inv.storage ?? []).forEach((s, i) => { slots[9 + i] = itemOf(s, 9 + i); });
    (inv.hotbar ?? []).forEach((s, i) => { slots[36 + i] = itemOf(s, 36 + i); });
    slots[45] = itemOf(inv.offhand, 45);
    const items = slots.filter((s, i) => s && i >= 9 && i <= 44);
    return { slots, items, held: itemOf(inv.hotbar?.[inv.activeSlot], 36 + inv.activeSlot), quickBarSlot: inv.activeSlot };
  }

  arenaView() {
    const s = this.session;
    const m = this.getMatch();
    const st = this.game === 'bedwars' ? s.bedwarsState : s.skywarsState;
    const me = s.me?.() ?? null;
    const time = st?.elapsed ?? 0;
    const phase = st?.phase ?? 'lobby';
    const landmarks = this.game === 'bedwars' && s.bedwarsArena
      ? {
        bases: s.bedwarsArena.bases.map((b) => ({ team: b.team, spawn: b.spawn, bed: { foot: { x: b.bed.foot[0], y: b.bed.foot[1], z: b.bed.foot[2] }, head: { x: b.bed.head[0], y: b.bed.head[1], z: b.bed.head[2] } }, forge: b.forge, shop: b.shop, upgrades: b.upgrades, chest: b.chest, center: b.center })),
        diamonds: s.bedwarsArena.diamonds.map((d) => ({ id: d.id, x: d.x, y: d.y, z: d.z })),
        emeralds: s.bedwarsArena.emeralds.map((d) => ({ id: d.id, x: d.x, y: d.y, z: d.z })),
        // The layout differs every round (src/mods/bedwars/layouts.js): its name, the middle, and the other islands.
        layout: s.bedwarsArena.layout,
        middle: { x: 0.5, y: (s.bedwarsArena.midY ?? s.bedwarsArena.surfaceY) + 1, z: 0.5, radius: s.bedwarsArena.midRadius },
        islands: (s.bedwarsArena.islands ?? []).map((i) => ({ x: i.x + 0.5, y: i.y + 1, z: i.z + 0.5, radius: i.r, role: i.role })),
        surfaceY: s.bedwarsArena.surfaceY, voidY: s.bedwarsArena.voidY,
      }
      : this.game === 'skywars'
        ? {
          template: st?.map?.template ?? 'classic',
          pack: st?.map?.pack ?? 'meadow',
          spawns: (s.skywarsSpawns ?? []).map((p, i) => ({ island: i, x: p.x, y: p.y, z: p.z })),
          chests: [...(s.chests?.values() ?? [])].map((c) => ({ x: c.x, y: c.y, z: c.z, kind: c.kind ?? 'island', island: c.slot ?? null })),
          middle: { x: 0.5, y: 31, z: 0.5 }, surfaceY: 30, voidY: -4,
        }
        : m?.landmarks ?? null;
    return {
      game: this.game, phase, time: r2(time), timeLimit: this.timeLimit, timeLeft: Math.max(0, r2(this.timeLimit - (phase === 'playing' || phase === 'ended' ? time : 0))),
      me: { ...(me?.team ? { team: me.team } : {}), ...(me?.slot !== undefined && me?.slot !== null ? { slot: me.slot } : {}), alive: me ? me.alive !== false : true, ...(this.game === 'bedwars' ? { respawning: !!s.waitingRespawn } : {}) },
      ...(this.game === 'bedwars' && st ? { teams: (st.teams ?? []).map((t) => ({ id: t.id, bed: !!t.bed, eliminated: !!t.eliminated, upgrades: t.upgrades ?? {}, traps: t.traps ?? [] })), nextEvent: st.next ?? null } : {}),
      players: (st?.players ?? []).map((p) => ({ name: p.name, ...(p.team ? { team: p.team } : {}), ...(p.slot !== undefined ? { slot: p.slot } : {}), alive: p.alive !== false, kills: p.kills ?? 0, ...(p.finalKills !== undefined ? { finalKills: p.finalKills } : {}) })),
      winner: st?.winner ?? null,
      landmarks,
      rules: { standard: this.rules.standard, ...(this.rules.difficulty ? { difficulty: this.rules.difficulty } : {}), reach: this.rules.reach, reactionMs: this.rules.reactionMs },
    };
  }

  scoreboard(arena) {
    const lines = [this.game === 'bedwars' ? 'BED WARS' : 'SKYWARS'];
    if (arena.phase === 'playing') lines.push(`Time limit (tie) in ${clock(arena.timeLeft)}`);
    if (arena.teams) for (const t of arena.teams) lines.push(`${t.id[0].toUpperCase()}${t.id.slice(1)}: ${t.bed ? 'bed standing' : t.eliminated ? 'eliminated' : 'bed gone'}${t.id === arena.me.team ? ' (YOU)' : ''}`);
    else lines.push(`Players left: ${arena.players.filter((p) => p.alive).length}`);
    const me = arena.players.find((p) => p.name === this.name);
    if (me) lines.push(`Kills: ${me.kills}`);
    return lines;
  }

  state() {
    const s = this.session;
    const inv = this.inventoryView();
    const arena = this.arenaView();
    return {
      me: {
        username: this.name,
        entity: { id: s.clientId ?? 'self', type: 'player', username: this.name, position: vec(s.position), velocity: vec(s.velocity ?? { x: 0, y: 0, z: 0 }), yaw: r2(s.yaw), pitch: r2(s.pitch), onGround: !!s.onGround, height: 1.8, width: 0.6 },
        health: r2(s.health ?? 20), food: 20, dead: !!s.isDead, gamemode: s.gamemode, moving: this.bot.pathfinder.isMoving(),
        ...inv,
      },
      others: this.perceived(),
      arena,
      scoreboard: this.scoreboard(arena),
      window: this.window ? { title: this.window.title, kind: this.window.kind, slots: this.window.slots } : null,
    };
  }

  worldDump() {
    const s = this.session;
    const a = s.bedwarsArena;
    const R = this.game === 'bedwars' ? 64 : 48;
    const cells = [];
    const names = {};
    for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) for (let y = 0; y < 64; y++) {
      const id = s.getVoxel(x, y, z);
      if (!id) continue;
      cells.push(x, y, z, id);
      if (!names[id]) names[id] = blockName(id);
    }
    for (const id of Object.values(BLOCKS)) if (!names[id]) names[id] = blockName(id);
    return { names, bounds: { minX: -R, maxX: R, minY: 0, maxY: 63, minZ: -R, maxZ: R }, cells, surfaceY: a?.surfaceY ?? 30 };
  }

  // --- the loop ----------------------------------------------------------------------------------------------------
  /** One pump: send what changed, let the program run, collect what it asks for, start what is due. */
  step({ playing }) {
    const s = this.session;
    // Health and life, as events.
    if (this.lastHealth !== null && s.health < this.lastHealth - 1e-6) {
      this.recorder.write('events.jsonl', { kind: 'hurt', who: this.name, amount: r2(this.lastHealth - s.health), health: r2(s.health) });
      this.events.push(['health'], ['entityHurt', { id: s.clientId, type: 'player', username: this.name, position: vec(s.position) }]);
    } else if (this.lastHealth !== null && s.health !== this.lastHealth) this.events.push(['health']);
    this.lastHealth = s.health;
    if (s.isDead && !this.wasDead) { this.events.push(['death']); this.window = null; }
    if (!s.isDead && this.wasDead) this.events.push(['spawn']);
    this.wasDead = !!s.isDead;
    for (const text of this.getMessages(this)) this.events.push(['message', text]);

    // A saved strategy file takes effect within a second (agent-rules.md, "During a round"), practice games included.
    if (playing && Date.now() - (this.lastFileCheck ?? 0) >= 1000) { this.lastFileCheck = Date.now(); this.checkForUpdate(); }
    const state = this.state();
    this.lastState = state;
    const blocks = this.blockChanges.splice(0);
    if (!playing || !this.program) { this.recordFrame(state); return { state, blocks }; }
    if (!this.started && Date.now() >= this.restartAt) {
      this.deliver({ world: this.worldDump(), state, results: [], events: [] });
      this.sentWorld = true;
      try { this.program.call(`__start(${JSON.stringify(this.mem)})`, 1000); } catch (err) { this.fail(`main did not start: ${err.message}`); }
      this.started = true;
    } else if (this.started) {
      this.deliver({ state, blocks, results: this.results.splice(0), events: this.events.splice(0) });
    }
    this.collect();
    this.pumpQueue();
    this.recordFrame(state);
    this.stats.ticks++;
    if (this.stats.ticks % 20 === 0 && this.program) { try { this.mem = this.program.call('__mem()', 200); } catch { /* next time */ } }
    return { state, blocks };
  }

  deliver(payload) {
    const t0 = performance.now();
    const limit = this.warmup > 0 ? BOT_LIMITS.warmupCpuMs : BOT_LIMITS.cpuMs;
    if (this.warmup > 0) this.warmup--;
    try {
      this.program.call(`__deliver(${JSON.stringify(JSON.stringify({ now: this.now(), ...payload }))})`, limit);
    } catch (err) {
      const slow = /timed out/i.test(err.message);
      if (slow) this.stats.slow++;
      this.fail(slow ? `the program ran longer than ${limit} ms without awaiting (a loop that never awaits?): restarting main` : `error: ${err.message}`);
    }
    this.cpuMs = performance.now() - t0;
  }

  collect() {
    let out;
    try { out = JSON.parse(this.program.call('__drain()', 200)); } catch (err) { this.fail(`could not read the program's requests: ${err.message}`); return; }
    for (const line of out.logs) { this.log(`[${(this.lastState?.arena?.time ?? 0).toFixed(1)}s] ${line}`); this.recorder.write(`strategy-${this.name}.jsonl`, { line }); }
    if (out.exit?.error) this.fail(`main stopped with an error: ${out.exit.error}`);
    else if (out.exit?.done) { this.log('[arena] main returned; it starts again in a second'); this.restart(); }
    for (const req of out.reqs) {
      const due = Math.max(Date.now() + this.rules.reactionMs + this.random() * this.rules.reactionJitterMs, this.lastDue);
      this.lastDue = due;
      this.queue.push({ ...req, issued: Date.now(), due });
    }
  }

  /** The program failed: log it and start main again after a second, with mem as it was. */
  fail(message) {
    this.stats.errors++;
    this.lastError = { at: this.lastState?.arena?.time ?? 0, error: message.slice(0, 600) };
    this.log(`[arena] ${message.slice(0, 600)}`);
    this.recorder.write('events.jsonl', { kind: 'strategy_error', who: this.name, error: message.slice(0, 400) });
    this.restart();
  }

  restart() {
    if (!this.file) return;
    try { this.mem = this.program.call('__mem()', 200); } catch { /* keep the last */ }
    this.stopActions();
    // A fresh sandbox for the same version: whatever state the failure left is gone.
    try { this.program = new Program(readFileSync(this.file, 'utf8'), this.file, (l) => this.log(l)); } catch { /* the loaded version is still in this.program */ }
    this.started = false;
    this.warmup = 5;
    this.restartAt = Date.now() + 1000;
    this.stats.restarts++;
  }

  pumpQueue() {
    const now = Date.now();
    while (this.queue.length && this.queue[0].due <= now) {
      const req = this.queue.shift();
      this.stats.actions++;
      const started = Date.now();
      this.recorder.write(`actions-${this.name}.jsonl`, { op: req.op, args: req.args, id: req.id, lagMs: started - req.issued });
      Promise.resolve().then(() => this.exec(req)).then(
        (value) => { if (req.id) this.results.push({ id: req.id, ok: true, value: value ?? null }); this.recorder.write(`actions-${this.name}.jsonl`, { done: req.id || req.op, ms: Date.now() - started }); },
        (err) => {
          this.stats.failed++;
          const msg = String(err?.message ?? err).slice(0, 300);
          if (req.id) this.results.push({ id: req.id, ok: false, error: msg });
          this.recorder.write(`actions-${this.name}.jsonl`, { failed: req.id || req.op, error: msg, ms: Date.now() - started });
        },
      );
    }
  }

  // --- the actions -------------------------------------------------------------------------------------------------
  eyeDistance(p) { const s = this.session.position; return Math.hypot(p.x + 0.5 - s.x, p.y + 0.5 - (s.y + 1.62), p.z + 0.5 - s.z); }
  inReach(p, what) { const d = this.eyeDistance(p); if (d > BOT_LIMITS.reachBlocks) throw new Error(`${what} at ${p.x} ${p.y} ${p.z} is ${d.toFixed(1)} blocks from your eyes; reach is ${BOT_LIMITS.reachBlocks}`); }
  alive() { if (this.session.isDead || this.session.gamemode === 'spectator') throw new Error('you are not in play (dead or waiting to respawn)'); }

  goal(g) {
    if (!g || typeof g !== 'object') throw new Error('a goal is needed: new goals.GoalNear(x, y, z, range)');
    switch (g.kind) {
      case 'near': return new G.GoalNear(g.x, g.y, g.z, g.range);
      case 'block': return new G.GoalBlock(g.x, g.y, g.z);
      case 'xz': return new G.GoalXZ(g.x, g.z);
      case 'nearxz': return new G.GoalNearXZ(g.x, g.z, g.range);
      case 'y': return new G.GoalY(g.y);
      case 'gettoblock': return new G.GoalGetToBlock(g.x, g.y, g.z);
      case 'follow': {
        // Follow what you can perceive: the target's last perceived place.
        const me = this;
        const entity = { get position() { const e = me.visible.get(g.id); return e ? new Vec3(e.position.x, e.position.y, e.position.z) : new Vec3(me.session.position.x, me.session.position.y, me.session.position.z); } };
        return new G.GoalFollow(entity, g.range);
      }
      case 'invert': return new G.GoalInvert(this.goal(g.goal));
      case 'any': return new G.GoalCompositeAny((g.goals ?? []).map((x) => this.goal(x)));
      case 'all': return new G.GoalCompositeAll((g.goals ?? []).map((x) => this.goal(x)));
      default: throw new Error(`unknown goal ${g.kind}`);
    }
  }

  async exec({ op, args }) {
    const b = this.bot;
    const s = this.session;
    switch (op) {
      case 'control': { if (args[0] === 'sprint' && args[1]) s.isSprinting = true; b.setControlState(args[0], args[1]); return null; }
      case 'clearControls': b.clearControlStates(); return null;
      case 'lookAt': await b.lookAt(new Vec3(args[0])); return null;
      case 'look': await b.look(args[0], args[1]); return null;
      case 'goto': this.alive(); await b.pathfinder.goto(this.goal(args[0])); return null;
      case 'setGoal': if (args[0]) b.pathfinder.setGoal(this.goal(args[0]), args[1]); else b.pathfinder.stop(); return null;
      case 'stopPath': b.pathfinder.stop(); return null;
      case 'placeBlock': {
        this.alive();
        const ref = new Vec3(args[0]), face = new Vec3(args[1]);
        const target = ref.plus(face);
        this.inReach(target, 'The place');
        if (!s.isSolid(ref.x, ref.y, ref.z)) throw new Error(`the reference block at ${ref.x} ${ref.y} ${ref.z} is not solid`);
        await b.placeBlock(b.blockAt(ref), face);
        return { x: target.x, y: target.y, z: target.z };
      }
      case 'dig': { this.alive(); const p = new Vec3(args[0]); this.inReach(p, 'The block'); await b.dig(b.blockAt(p)); return null; }
      case 'stopDigging': b.stopDigging?.(); return null;
      case 'attack': {
        this.alive();
        const seen = this.visible.get(args[0]);
        if (!seen || seen.heard) throw new Error('that player is not in sight');
        const peer = s.peers.get(args[0]);
        if (!peer) throw new Error('that player is gone');
        this.attackingUntil = Date.now() + 300;
        await b.attack({ id: args[0], position: new Vec3(peer.x, peer.y, peer.z) });
        return null;
      }
      case 'equip': await b.equip(args[0], args[1]); return null;
      case 'unequip': await b.unequip(args[0]); return null;
      case 'consume': this.alive(); await b.consume(); return null;
      // A bow draws (and deactivateItem looses the arrow), a snowball, egg or ender pearl is thrown, food is eaten.
      case 'activateItem': this.alive(); await b.activateItem(); return null;
      case 'deactivateItem': this.alive(); b.deactivateItem(); return null;
      case 'toss': this.alive(); await b.toss(args[0], null, args[1]); return null;
      case 'quickBar': b.setQuickBarSlot(args[0]); return null;
      case 'activateBlock': { this.alive(); const p = new Vec3(args[0]); this.inReach(p, 'The block'); await b.activateBlock(b.blockAt(p)); return null; }
      case 'activateEntity': return this.openEntityWindow(args[0]);
      case 'openContainer': return this.openChest(new Vec3(args[0]));
      case 'clickWindow': return this.clickWindow(args[0], args[1], args[2]);
      case 'withdraw': return this.withdraw(args[0], args[1]);
      case 'deposit': throw new Error('putting items into a chest is not supported in this arena yet');
      case 'closeWindow': this.window = null; this.container = null; return null;
      case 'chat': {
        const text = String(args[0] ?? '');
        await new Promise((r) => setTimeout(r, (text.length / BOT_LIMITS.chatCharsPerSecond) * 1000));
        b.chat(text);
        this.recorder.write('events.jsonl', { kind: 'chat_sent', who: this.name, text });
        return null;
      }
      default: throw new Error(`unknown action ${op}`);
    }
  }

  // --- windows: shops and chests, as a player clicks them ----------------------------------------------------------
  openEntityWindow(id) {
    this.alive();
    const npc = this.npcs().find((n) => n.id === id);
    if (!npc) throw new Error('nothing there to activate (a shopkeeper is an entity in bot.entities)');
    const s = this.session.position;
    const d = Math.hypot(npc.position.x - s.x, npc.position.y - s.y, npc.position.z - s.z);
    if (d > BOT_LIMITS.entityReach) throw new Error(`${npc.displayName} is ${d.toFixed(1)} blocks away; reach is ${BOT_LIMITS.entityReach}`);
    const st = this.session.bedwarsState;
    const group = ['solo', 'doubles'].includes(st?.mode) ? 'small' : 'large';
    const price = (p) => Object.entries(p?.[group] ?? {}).map(([res, n]) => `${n} ${res}`).join(' + ');
    let slots;
    if (id.startsWith('shop:')) {
      // A slot shows the item you get, as a shop window's slot does in Minecraft: `name` is its item id, `displayName` the
      // offer, `lore` the price. `key` is the shop's own name for the offer, which a click uses.
      const team = this.session.me?.()?.team ?? 'white';
      const teamBlock = { wool: `${team}_wool`, clay: `${team}_terracotta`, glass: `${team}_stained_glass` };
      const kit = this.session.bedwarsKit ?? {};
      const toolTier = (n) => ['wooden', 'wooden', 'iron', 'golden', 'diamond'][Math.min(4, n + 1)];
      const itemFor = (e) => {
        if (e.kind === 'teamBlock') return teamBlock[e.block];
        if (e.kind === 'item') return typeof e.give.id === 'number' ? blockName(e.give.id) : String(e.give.id);
        if (e.kind === 'sword') return e.key;
        if (e.kind === 'armor') return `${['leather', 'chainmail', 'iron', 'diamond'][e.tier]}_boots`;
        if (e.kind === 'shears') return 'shears';
        if (e.kind === 'tool') return `${toolTier(kit[e.tool] ?? 0)}_${e.tool}`;
        return e.key;
      };
      slots = BEDWARS_ITEM_SHOP.filter((e) => !e.notIn?.includes(st?.mode)).map((e) => {
        const p = e.kind === 'tool' ? e.tiers[kit[e.tool] ?? 0] : e.price;
        return { name: itemFor(e), key: e.key, displayName: e.name, count: e.count ?? 1, category: e.category, lore: [p ? `Cost: ${price(p)}` : 'Not available'] };
      });
    } else {
      const team = (st?.teams ?? []).find((t) => t.id === this.session.me?.()?.team);
      slots = [
        ...Object.entries(BEDWARS_UPGRADES).map(([key, u]) => { const lvl = team?.upgrades?.[key] ?? 0; const cost = u[group]?.[lvl]; return { name: key, key, displayName: `${u.name}${u.max > 1 ? ` ${lvl + 1}` : ''}`, count: 1, category: 'upgrade', lore: [lvl >= u.max ? 'Maxed' : `Cost: ${cost} diamond`] }; }),
        ...Object.entries(BEDWARS_TRAPS).map(([key, name]) => ({ name: key, key, displayName: name, count: 1, category: 'trap', lore: [`Cost: ${[1, 2, 4][team?.traps?.length ?? 0] ?? '-'} diamond`] })),
      ];
    }
    this.window = { kind: id.startsWith('shop:') ? 'shop' : 'upgrades', title: npc.displayName, slots, at: npc.position };
    this.events.push(['windowOpen']);
    return null;
  }

  async openChest(p) {
    this.alive();
    this.inReach(p, 'The chest');
    const container = await this.bot.openContainer(this.bot.blockAt(p));
    this.container = container;
    const items = typeof container.containerItems === 'function' ? container.containerItems() : [];
    // Each stack in its own slot of the chest's 27, as the chest holds it.
    this.window = { kind: 'chest', title: 'Chest', slots: Array.from({ length: 27 }, (_, i) => { const it = items.find((x) => x.slot === i); return it ? { name: it.name, count: it.count, displayName: it.name } : null; }), at: { x: p.x, y: p.y, z: p.z } };
    this.events.push(['windowOpen']);
    return null;
  }

  async clickWindow(slot, _button, _mode) {
    this.alive();
    const w = this.window;
    if (!w) throw new Error('no window is open');
    const item = w.slots[slot];
    if (!item) throw new Error(`slot ${slot} is empty`);
    if (w.at) { const s = this.session.position; if (Math.hypot(w.at.x - s.x, w.at.z - s.z) > BOT_LIMITS.entityReach + 1.5) { this.window = null; throw new Error('you walked away: the window closed'); } }
    await new Promise((r) => setTimeout(r, 150));
    if (w.kind === 'shop' || w.kind === 'upgrades') {
      const r = this.session.buyInBedWars(item.key ?? item.name, 1);
      if (!r?.ok) throw new Error(r?.reason ?? 'could not buy that');
      this.recorder.write('events.jsonl', { kind: 'bought', who: this.name, item: item.key ?? item.name });
      if (w.kind === 'shop') this.openEntityWindow(`shop:${this.session.me?.()?.team}`);
      return { bought: item.name };
    }
    if (w.kind === 'chest') return this.withdraw(item.name, item.count);
    throw new Error('nothing to click there');
  }

  async withdraw(name, count) {
    if (!this.container) throw new Error('no chest is open');
    await this.container.withdraw(name, null, count ?? null);
    if (this.window?.at) await this.openChest(new Vec3(this.window.at));
    return null;
  }

  // --- recording ---------------------------------------------------------------------------------------------------
  recordFrame(state) {
    if (this.stats.frame = (this.stats.frame ?? 0) + 1, this.stats.frame % 2) return; // 10 a second
    const me = state.me;
    const armor = Object.fromEntries(['head', 'chest', 'legs', 'feet'].map((k, i) => [k, me.slots[5 + i]?.name ?? null]));
    this.recorder.write('frames.jsonl', {
      who: this.name,
      me: { pos: me.entity.position, yaw: me.entity.yaw, pitch: me.entity.pitch, health: me.health, held: me.held?.name ?? null, armorPoints: null, armor, sneaking: !!this.bot.controlState?.sneak, sprinting: !!this.session.isSprinting, onGround: me.entity.onGround, dead: me.dead, gamemode: me.gamemode },
      buttons: { left: Date.now() < this.attackingUntil, right: false }, screen: state.window ? state.window.kind : 'none',
      sees: state.others.filter((e) => e.type === 'player' && !e.heard).map((e) => e.username), phase: state.arena.phase,
    });
  }

  /** What `arena status` and `arena view` show the agent. */
  status(extra = {}) {
    const st = this.lastState;
    return {
      name: this.name, ...extra,
      strategy: { version: this.version, loadError: this.loadError, lastError: this.lastError, errors: this.stats.errors, ticks: this.stats.ticks, slowTicks: this.stats.slow, restarts: this.stats.restarts },
      input: { pending: this.queue.length, executed: this.stats.actions, failed: this.stats.failed, recentErrors: [] },
      view: st ? {
        time: st.arena.time, timeLimit: st.arena.timeLimit, timeLeft: st.arena.timeLeft, phase: st.arena.phase,
        me: { pos: st.me.entity.position, health: st.me.health, hunger: 20, armorPoints: null, held: st.me.held ? { item: st.me.held.name } : null, dead: st.me.dead, gamemode: st.me.gamemode, hotbar: st.me.slots.slice(36, 45).map((x) => (x ? `${x.name} x${x.count}` : null)) },
        crosshair: null, screen: st.window?.kind ?? 'none',
        players: st.others.filter((e) => e.type === 'player').map((e) => ({ name: e.username, seen: e.heard ? 'heard' : e.seen, distance: r2(Math.hypot(e.position.x - st.me.entity.position.x, e.position.z - st.me.entity.position.z)), held: e.heldItem?.name })),
        match: { players: st.arena.players, teams: st.arena.teams },
      } : null,
      logTail: this.logTail.slice(-25),
    };
  }

  /** The bot API's view for `arena view` and the round reports: the snapshot the program reads. */
  viewForAgent() {
    const st = this.lastState;
    if (!st) return null;
    return {
      ...st,
      // The shape the practice and round reports read (practice.mjs playerReport).
      me: { ...st.me, armor: Object.fromEntries(['head', 'chest', 'legs', 'feet'].map((k, i) => [k, st.me.slots[5 + i] ? { item: st.me.slots[5 + i].name, count: 1 } : null])), hotbar: st.me.slots.slice(36, 45).map((x) => (x ? { item: x.name, count: x.count } : null)), inventory: st.me.slots.slice(9, 36).map((x) => (x ? { item: x.name, count: x.count } : null)) },
    };
  }
}

export { existsSync };
