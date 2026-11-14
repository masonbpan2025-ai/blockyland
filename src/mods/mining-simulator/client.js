// Mining Simulator in the running game.
//
// The host's browser keeps the one Ledger (economy.js): every player's coins, pickaxe and house levels, the
// Superstick, kills, and their chests' contents. It builds the map (world.js), regrows the mine, rebuilds houses,
// judges every hit between players and saves the ledger, so players who come back under the same name keep their
// progress. Guests join through the game's world sharing with the room code and ask the host for what they want.
//
// Who decides what:
//   - the host: coins, purchases, kill credit and the coin transfer, which hits may land (shareSession attackPolicy),
//     the mine growing back, house rebuilding, saving;
//   - each player: their own inventory -- they take ores out of it to sell, and say how many (trusted, as this is a
//     game among friends) -- and their own spawn and death.
import * as THREE from 'three';
import { BLOCKS } from '../../blocks.js';
import {
  Ledger, PICKAXES, HOUSE_NAMES, ORE_VALUES, SUPERSTICK_DAMAGE, saleValue, nameKey,
} from './economy.js';
import {
  WORLD, TRADER, MINES, MINE_TOP, MINE_BOTTOM, terrainCells, plotLayout, mineAt, mineBlockAt, mineLabel, plotAt, MINE_ORE_BLOCKS,
} from './world.js';
import { createMiningUi, formatCoins } from './ui.js';

export const HOST_ID = 'host';
export const SAVE_KEY = 'blockyland-mining-simulator-v1';
export const MINING_TIME = 6000;
const GUEST_MESSAGES = new Set(['sell', 'buy', 'died', 'hello']);
/** Seconds before a mined cell grows back: ores after a minute, plain rock after two. */
export const ORE_REGROW_SECONDS = 60;
export const ROCK_REGROW_SECONDS = 120;
/** Seconds after a respawn in which a player cannot be hit. */
export const SPAWN_PROTECTION_SECONDS = 5;
/** How long after a Superstick hit a death still counts as that player's kill. */
export const KILL_CREDIT_SECONDS = 15;
/** The least time between two Superstick hits. */
export const SUPERSTICK_COOLDOWN_SECONDS = 0.5;
const SCAN_SECONDS = 2;
const SAVE_SECONDS = 15;

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** A tagged copy of a kit item: the mod gives and takes these, and they cannot be dropped or stored. */
export function kitPickaxe(level) {
  return { id: PICKAXES[level].id, isBlock: false, count: 1, miningSim: 'pickaxe' };
}
export function kitSuperstick() {
  return { id: 'stick', isBlock: false, count: 1, miningSim: 'superstick', customName: 'Superstick' };
}

/** Sanitise a guest's ore counts: only ores, whole numbers, no more than a full inventory holds. */
export function sanitizeCounts(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const id of Object.keys(ORE_VALUES)) {
    const n = Math.floor(Number(raw[id]));
    if (Number.isFinite(n) && n > 0) out[id] = Math.min(n, 36 * 64);
  }
  return out;
}

function labelSprite(lines) {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  sprite.renderOrder = 998;
  sprite.scale.set(3.2, 0.5 * lines.length, 1);
  if (canvas) {
    canvas.width = 640; canvas.height = 80 * lines.length;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = 'bold 44px system-ui, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      lines.forEach(([text, color], i) => {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(text, 323, 43 + i * 80);
        ctx.fillStyle = color ?? '#ffffff';
        ctx.fillText(text, 320, 40 + i * 80);
      });
      sprite.material.map = new THREE.CanvasTexture(canvas);
      sprite.material.needsUpdate = true;
    }
  }
  return sprite;
}

export class MiningSimManager {
  constructor(game, { storage = null } = {}) {
    this.game = game;
    this.active = false;
    this.storage = storage;
  }

  get sync() { return this.game.worldSync; }
  get session() { return this.game.worldSync?.client; }
  get isHost() { return !this.sync?.isJoined; }
  get myId() { return this.isHost ? HOST_ID : this.session?.clientId; }

  /** This player's row in the host's last state. */
  myRecord() { return this.state?.players?.find((p) => p.id === this.myId) ?? null; }
  plotOwner(plot) { return this.state?.plots?.find((p) => p.plot === plot) ?? null; }

  // --- the world opening and closing ------------------------------------------------------------------------

  activate() {
    this.deactivate();
    this.active = true;
    this.state = null;
    this.offs = [];
    this.clock = 0;
    this.publishTimer = 0;
    this.scanTimer = 0;
    this.saveTimer = 0;
    this.kitTimer = 0;
    this.spawned = false;
    this.lastHitAt = -Infinity;
    this.protectedUntil = 0;
    this.noticeAt = -Infinity;
    this.trader = null;
    this.labels = new Map();
    this.mineLabels = [];
    /** plot -> the house level this browser has built there */
    this.builtPlots = new Map();
    const game = this.game;
    this.saved = {
      rules: { doDaylightCycle: game.gamerules?.doDaylightCycle ?? true, doMobSpawning: game.gamerules?.doMobSpawning ?? true },
      difficulty: game.difficulty ?? 'normal',
    };
    game.gamerules = { ...(game.gamerules ?? {}), doDaylightCycle: false, doMobSpawning: false };
    if (typeof game.setDifficulty === 'function') game.setDifficulty('peaceful');
    else game.difficulty = 'peaceful';
    this.holdMidday();
    this.ui = createMiningUi(this);
    this.showMineLabels();
    if (this.isHost) this.startHosting();
    else this.listenAsGuest();
  }

  deactivate() {
    if (!this.active) return;
    if (this.isHost && this.ledger) this.save();
    this.active = false;
    for (const off of this.offs ?? []) { try { off(); } catch { /* gone */ } }
    this.offs = [];
    if (this.session && this.session.attackPolicy) this.session.attackPolicy = null;
    this.removeTrader();
    for (const sprite of [...(this.labels?.values() ?? []), ...(this.mineLabels ?? [])]) { sprite.material?.map?.dispose(); sprite.material?.dispose(); sprite.removeFromParent(); }
    this.labels?.clear();
    this.mineLabels = [];
    this.ui?.closeShop?.();
    this.ui?.dispose();
    this.ui = null;
    this.ledger = null;
    this.state = null;
    const game = this.game;
    if (game.gamerules && this.saved) Object.assign(game.gamerules, this.saved.rules);
    if (this.saved) {
      if (typeof game.setDifficulty === 'function') game.setDifficulty(this.saved.difficulty);
      else game.difficulty = this.saved.difficulty;
    }
  }

  holdMidday() {
    const game = this.game;
    if (game.worldTime !== MINING_TIME) { game.worldTime = MINING_TIME; game.sky?.setTime?.(MINING_TIME); }
  }

  on(event, handler) {
    const off = this.session?.on?.(event, handler);
    if (typeof off === 'function') this.offs.push(off);
  }

  // --- saving (the host) -------------------------------------------------------------------------------------

  get store() {
    if (this.storage) return this.storage;
    try { return globalThis.localStorage ?? null; } catch { return null; }
  }

  loadSaved() {
    try {
      const text = this.store?.getItem(SAVE_KEY);
      return text ? JSON.parse(text) : null;
    } catch { return null; }
  }

  save() {
    if (!this.ledger) return false;
    this.captureChests();
    try {
      this.store?.setItem(SAVE_KEY, JSON.stringify(this.ledger.toJSON()));
      return true;
    } catch { return false; }
  }

  /** What each owned plot's chests hold now, into the ledger (kit items never count). */
  captureChests() {
    const chests = this.game.chestManager;
    if (!chests || !this.ledger) return;
    for (const record of this.ledger.players.values()) {
      if (record.plot === null) continue;
      const layout = plotLayout(record.plot, record.house);
      record.chests = layout.chests.map(({ x, y, z }) => (chests.getChest?.(x, y, z)?.items ?? [])
        .slice(0, 27).map((item) => (item && !item.miningSim ? { ...item } : null)));
    }
  }

  // --- host -------------------------------------------------------------------------------------------------

  async startHosting() {
    this.ledger = new Ledger(this.loadSaved());
    /** peerId -> player name */
    this.names = new Map();
    /** victim peerId -> { by, at } */
    this.lastHits = new Map();
    /** peerId -> clock time their protection ends */
    this.protection = new Map();
    /** "x,y,z" -> clock time the mine cell was first seen empty */
    this.missing = new Map();
    this.buildWorld();
    this.hostJoin(HOST_ID, this.sync?.playerName?.() ?? 'Host');
    this.spawnTrader();
    this.publish();
    if (!this.sync?.hostWorld) return;
    try {
      const shared = await this.sync.hostWorld({ quiet: true, pvp: true });
      if (!this.active) return;
      this.code = shared?.roomId ?? null;
      this.ui?.setCode(this.code);
    } catch (error) {
      this.game.ui?.addChatMessage?.(`Mining Simulator could not open a room for friends (${escapeHtml(error?.message ?? error)}). You can still play alone.`, 'system');
    }
    if (!this.active) return;
    if (this.session) this.session.attackPolicy = (attacker, target) => this.canAttack(attacker, target);
    this.on('peer_joined', ({ peerId, peerName }) => { this.hostJoin(peerId, peerName); this.publish(); });
    this.on('peer_left', ({ peerId }) => { this.names.delete(peerId); this.save(); this.publish(); });
    this.on('attack_landed', ({ attackerId, targetId }) => this.lastHits.set(targetId, { by: attackerId, at: this.clock }));
    this.on('game', ({ peerId, data }) => this.fromGuest(peerId, data));
    // A guest's mined block: its regrowth clock starts now.
    this.on('block_update', ({ x, y, z, blockId }) => { if (blockId === BLOCKS.AIR) this.noteMined(x, y, z); });
  }

  /** The map as built, with every saved player's house at its level and its chests filled from the save. */
  buildWorld() {
    this.writeBlocks(terrainCells());
    for (const record of this.ledger.players.values()) {
      if (record.plot !== null) this.buildPlot(record.plot, record.house, record.chests ?? []);
    }
  }

  /** A player arrives: their saved record, or a new one with a free plot (its hut is built from the state). */
  hostJoin(id, name) {
    const result = this.ledger.join(name);
    if (!result.ok) {
      this.game.ui?.addChatMessage?.(`${escapeHtml(name)} cannot play: ${result.reason}`, 'system');
      return;
    }
    this.names.set(id, result.record.name);
    this.emit({ kind: 'joined', id, name: result.record.name, fresh: result.fresh });
    this.save();
  }

  /** What a guest may ask of the host; anything else is ignored. */
  fromGuest(peerId, data) {
    if (!this.ledger || !GUEST_MESSAGES.has(data?.type) || !this.names.has(peerId)) return;
    this.hostHandles(peerId, data);
    this.publish();
  }

  /** The host acts on a player's request -- its own too (`by` is HOST_ID). */
  hostHandles(by, data) {
    const name = this.names.get(by);
    if (!name) return;
    switch (data.type) {
      case 'sell': {
        const result = this.ledger.sell(name, sanitizeCounts(data.counts));
        this.emit(result.ok ? { kind: 'sold', id: by, coins: result.coins, total: result.total } : { kind: 'refused', id: by, reason: result.reason });
        break;
      }
      case 'buy': {
        const what = String(data.what ?? '');
        const result = what === 'pickaxe' ? this.ledger.buyPickaxe(name)
          : what === 'house' ? this.ledger.buyHouse(name)
            : what === 'superstick' ? this.ledger.buySuperstick(name)
              : { ok: false, reason: 'There is no such thing to buy.' };
        if (!result.ok) { this.emit({ kind: 'refused', id: by, reason: result.reason }); break; }
        this.emit({ kind: 'bought', id: by, name, what, level: result.level ?? null, cost: result.cost });
        break;
      }
      case 'died': {
        const hit = this.lastHits.get(by);
        const killerId = hit && hit.by !== by && this.clock - hit.at <= KILL_CREDIT_SECONDS ? hit.by : null;
        this.lastHits.delete(by);
        const result = this.ledger.died(name, killerId ? this.names.get(killerId) : null);
        this.protection.set(by, this.clock + SPAWN_PROTECTION_SECONDS);
        this.emit({ kind: 'death', id: by, name, killer: killerId, killerName: result.killer?.name ?? null, coins: result.coins });
        break;
      }
      case 'hello': this.sendPlotChests(); break;
      default: break;
    }
    this.save();
  }

  /** Every owned chest's contents, to everyone: a guest that has just arrived fills its own copies from these. */
  sendPlotChests() {
    const chestManager = this.game.chestManager;
    if (!chestManager || !this.session?.sendContainer) return;
    for (const record of this.ledger.players.values()) {
      if (record.plot === null) continue;
      for (const { x, y, z } of plotLayout(record.plot, record.house).chests) {
        const chest = chestManager.getChest?.(x, y, z);
        if (chest) this.session.sendContainer(x, y, z, chest.items);
      }
    }
  }

  /**
   * Whether a hit may land (shareSession attackPolicy): only from a Superstick owner, never on a player inside their
   * own plot or just respawned, nor from inside the attacker's own plot. Null when it may; why not, otherwise.
   */
  canAttack(attackerId, targetId) {
    if (!this.ledger) return null;
    const attacker = this.ledger.get(this.names.get(attackerId));
    const target = this.ledger.get(this.names.get(targetId));
    if (!attacker || !target) return 'unknown_player';
    if (!attacker.superstick) return 'no_superstick';
    if ((this.protection.get(targetId) ?? -Infinity) > this.clock) return 'spawn_protection';
    const inOwnPlot = (id, record) => {
      const at = this.positionOf(id);
      return Boolean(at && record.plot !== null && plotAt(at.x, at.z) === record.plot);
    };
    if (inOwnPlot(targetId, target) || inOwnPlot(attackerId, attacker)) return 'safe_zone';
    return null;
  }

  positionOf(id) {
    if (id === HOST_ID) { const p = this.game.player?.position; return p ? { x: p.x, y: p.y, z: p.z } : null; }
    return this.session?.positions?.get(id) ?? null;
  }

  emit(event) {
    (this.events ??= []).push(event);
  }

  snapshot() {
    const players = [];
    for (const [id, name] of this.names) {
      const r = this.ledger.get(name);
      if (r) players.push({ id, name: r.name, coins: r.coins, pickaxe: r.pickaxe, house: r.house, superstick: r.superstick, plot: r.plot, kills: r.kills, deaths: r.deaths });
    }
    const plots = [...this.ledger.players.values()].filter((r) => r.plot !== null).map((r) => ({ plot: r.plot, name: r.name, house: r.house }));
    return { type: 'state', players, plots };
  }

  publish() {
    if (!this.ledger) return;
    for (const event of (this.events ?? []).splice(0)) {
      this.session?.sendGame?.({ type: 'event', event });
      this.showEvent(event);
    }
    const state = this.snapshot();
    this.session?.sendGame?.(state);
    this.applyState(state);
  }

  /** A request to the host: sent by a guest, handled at once by the host. */
  ask(data) {
    if (this.isHost) { if (this.ledger) { this.hostHandles(HOST_ID, data); this.publish(); } }
    else this.session?.sendGame?.(data);
  }

  // --- the mine growing back (the host) ------------------------------------------------------------------------

  /**
   * Note the mine cells that are empty, and grow back those empty long enough: an ore a minute after it was mined.
   * Only a cell a player's body is in right now waits (it grows back once they step out of it).
   */
  regrowMine() {
    const world = this.game.world;
    if (!world) return;
    const h = WORLD.mineHalf;
    const people = [...this.names.keys()].map((id) => this.positionOf(id)).filter(Boolean);
    // A player is 0.6 wide and 1.8 tall, standing at p.
    const occupied = (x, y, z) => people.some((p) => Math.abs(p.x - (x + 0.5)) < 0.8 && Math.abs(p.z - (z + 0.5)) < 0.8 && p.y < y + 1 && p.y + 1.8 > y);
    const grow = [];
    for (const mine of MINES) {
      for (let x = mine.x - h; x <= mine.x + h; x++) {
        for (let z = mine.z - h; z <= mine.z + h; z++) {
          for (let y = MINE_BOTTOM; y <= MINE_TOP; y++) {
            const want = mineBlockAt(x, y, z);
            const key = `${x},${y},${z}`;
            if (world.getVoxel(x, y, z) === want) { this.missing.delete(key); continue; }
            const since = this.missing.get(key);
            if (since === undefined) { this.missing.set(key, this.clock); continue; }
            const wait = MINE_ORE_BLOCKS.has(want) ? ORE_REGROW_SECONDS : ROCK_REGROW_SECONDS;
            if (this.clock - since >= wait && !occupied(x, y, z)) { grow.push([x, y, z, want]); this.missing.delete(key); }
          }
        }
      }
    }
    if (grow.length) this.writeBlocks(grow, { share: true });
  }

  /** When a block was mined, from the moment it was (the scan alone would add up to two seconds). */
  noteMined(x, y, z) {
    if (this.missing && mineAt(x, y, z)) this.missing.set(`${x},${y},${z}`, this.clock);
  }

  // --- guest ------------------------------------------------------------------------------------------------

  listenAsGuest() {
    this.on('game', ({ data }) => this.fromHost(data));
    // A trader the host's world carried in its snapshot is a plain villager here: this browser draws its own.
    this.spawnTrader();
    this.session?.sendGame?.({ type: 'hello' });
  }

  fromHost(data) {
    if (data?.type === 'state') this.applyState(data);
    else if (data?.type === 'event' && data.event) this.showEvent(data.event);
  }

  // --- everyone ----------------------------------------------------------------------------------------------

  applyState(state) {
    if (!this.active || !state) return;
    const before = this.myRecord();
    this.state = state;
    const me = this.myRecord();
    if (me && before && (me.pickaxe !== before.pickaxe || me.superstick !== before.superstick)) this.ensureKit();
    // Every player's house at its level, built here by this browser: so a guest sees its own new house at once,
    // without waiting for block changes that may arrive while its world is still loading.
    for (const p of state.plots ?? []) {
      if (this.builtPlots.get(p.plot) !== p.house) this.buildPlot(p.plot, p.house);
    }
    if (me && !this.spawned) { this.spawned = true; this.spawnAtBase(); }
    this.syncLabels();
    this.ui?.render();
  }

  /**
   * Build (or rebuild) one plot's house at `level`, the same in every browser. On an upgrade each chest's contents
   * move to the chest with the same number in the new house (the new one always has at least as many); `saved` fills
   * them from the host's save instead. A first build keeps whatever the chests already hold.
   */
  buildPlot(plot, level, saved = null) {
    const chests = this.game.chestManager;
    const before = this.builtPlots.get(plot);
    let contents = saved;
    if (!contents && before !== undefined && before !== level && chests) {
      contents = plotLayout(plot, before).chests.map(({ x, y, z }) => {
        const chest = chests.getChest?.(x, y, z);
        if (!chest) return [];
        chests.chests.delete(chests.getKey(x, y, z));
        return chest.items.map((item) => (item ? { ...item } : null));
      });
    }
    const layout = plotLayout(plot, level);
    this.writeBlocks(layout.cells);
    layout.chests.forEach(({ x, y, z, facing }, i) => {
      if (!chests) return;
      if (contents) chests.setChestItems(x, y, z, contents[i] ?? [], { silent: true, facing });
      else if (!chests.getChest?.(x, y, z)) chests.adoptChest?.([x, y, z], facing);
    });
    this.builtPlots.set(plot, level);
  }

  showEvent(event) {
    const chat = (text) => this.game.ui?.addChatMessage?.(text, 'system');
    const mine = event.id === this.myId;
    const sounds = this.game.sounds;
    switch (event.kind) {
      case 'joined':
        chat(mine ? (event.fresh ? 'Welcome to Mining Simulator! Mine ores in the pit, sell them to the Trader for coins, and buy better pickaxes, a bigger house and the Superstick.' : `Welcome back, ${escapeHtml(event.name)}!`)
          : `${escapeHtml(event.name)} joined the mine.`);
        break;
      case 'sold':
        if (mine) { chat(`Sold ores for ${formatCoins(event.coins)}. You have ${formatCoins(event.total)}.`); this.ui?.say(`+${formatCoins(event.coins)}`); sounds?.playTone?.(990, 0.12); }
        break;
      case 'bought': {
        const what = event.what === 'pickaxe' ? PICKAXES[event.level]?.name : event.what === 'house' ? HOUSE_NAMES[event.level] : 'Superstick';
        if (mine) { chat(`You bought the ${what} for ${formatCoins(event.cost)}.`); this.ui?.say(`Bought: ${what}`); sounds?.playTone?.(1320, 0.15); this.ensureKit(); }
        else chat(`${escapeHtml(event.name)} bought the ${what}.`);
        break;
      }
      case 'refused':
        if (mine) { this.ui?.say(event.reason); chat(escapeHtml(event.reason)); }
        break;
      case 'death': {
        const text = event.killerName
          ? `${escapeHtml(event.name)} was struck down by ${escapeHtml(event.killerName)}${event.coins > 0 ? `, who took ${formatCoins(event.coins)}` : ''}.`
          : `${escapeHtml(event.name)} died.`;
        chat(text);
        if (event.killer === this.myId) sounds?.playTone?.(1500, 0.1);
        break;
      }
      default: break;
    }
  }

  /** Everyone's name over their plot. */
  syncLabels() {
    const scene = this.game.scene;
    if (!scene) return;
    const want = new Map((this.state?.plots ?? []).map((p) => [p.plot, `${p.name}|${p.house}`]));
    for (const [plot, sprite] of this.labels) {
      if (want.get(plot) === sprite.userData.key) continue;
      sprite.material?.map?.dispose(); sprite.material?.dispose(); sprite.removeFromParent();
      this.labels.delete(plot);
    }
    for (const p of this.state?.plots ?? []) {
      if (this.labels.has(p.plot)) continue;
      const sprite = labelSprite([[`${p.name}'s Base`, '#fde047'], [HOUSE_NAMES[p.house] ?? '', '#e7e5e4']]);
      const at = plotLayout(p.plot, p.house).label;
      sprite.position.set(at.x, at.y, at.z);
      sprite.userData.key = `${p.name}|${p.house}`;
      scene.add(sprite);
      this.labels.set(p.plot, sprite);
    }
  }

  writeBlocks(changes, { share = false } = {}) {
    const world = this.game.world;
    if (!world) return 0;
    const touched = new Set();
    let n = 0;
    for (const [x, y, z, block] of changes) {
      if (world.getVoxel(x, y, z) === block) continue;
      world.setVoxel(x, y, z, block);
      n++;
      if (share) {
        if (block === BLOCKS.AIR) this.sync?.onBlockBroken?.(x, y, z);
        else this.sync?.onBlockPlaced?.(x, y, z, block);
      }
      const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
      touched.add(`${cx},${cz}`);
      if ((x & 15) === 0) touched.add(`${cx - 1},${cz}`);
      if ((x & 15) === 15) touched.add(`${cx + 1},${cz}`);
      if ((z & 15) === 0) touched.add(`${cx},${cz - 1}`);
      if ((z & 15) === 15) touched.add(`${cx},${cz + 1}`);
    }
    for (const key of touched) {
      const [cx, cz] = key.split(',').map(Number);
      const chunk = world.getChunk?.(cx, cz);
      if (chunk) this.game.rebuildChunkMesh?.(chunk);
    }
    return n;
  }

  // --- the trader ----------------------------------------------------------------------------------------------

  spawnTrader() {
    this.removeTrader();
    const mobs = this.game.mobs;
    // Any plain villager standing where the trader stands came with the world (a save, or the host's snapshot).
    for (const mob of [...(mobs?.mobs ?? [])]) {
      const at = mob.mesh?.position ?? mob.position;
      if (mob.type === 'villager' && at && Math.hypot(at.x - TRADER.x, at.z - TRADER.z) < 3) {
        mobs.mobs.splice(mobs.mobs.indexOf(mob), 1);
        mob.mesh?.removeFromParent();
      }
    }
    if (!mobs?.spawnMob) return;
    const mob = mobs.spawnMob('villager', TRADER.x, TRADER.y, TRADER.z, { persistent: true });
    if (!mob) return;
    Object.assign(mob, { frozen: true, invulnerable: true, persistent: true, noDespawn: true, survivesPeaceful: true, miningTrader: true });
    if (mob.mesh) {
      mob.mesh.position.set(TRADER.x, TRADER.y, TRADER.z);
      mob.mesh.rotation.y = TRADER.yaw;
      mob.yaw = TRADER.yaw;
      const label = labelSprite([['TRADER', '#fde047'], ['RIGHT CLICK', '#ffffff']]);
      label.position.y = 2.6;
      mob.mesh.add(label);
      mob.miningLabel = label;
    }
    this.trader = mob;
  }

  removeTrader() {
    const mob = this.trader;
    if (!mob) return;
    mob.miningLabel?.material?.map?.dispose();
    mob.miningLabel?.removeFromParent();
    const mobs = this.game.mobs;
    const i = mobs?.mobs?.indexOf(mob) ?? -1;
    if (i >= 0) mobs.mobs.splice(i, 1);
    mob.mesh?.removeFromParent();
    this.trader = null;
  }

  // --- this player ---------------------------------------------------------------------------------------------

  heal(p) {
    p.isDead = false;
    p.health = p.maxHealth ?? 20;
    p.hunger = 20;
    if (p._hungerState) { p._hungerState.hunger = 20; p._hungerState.saturation = 5; }
    p.isOnFire = false; p.fireTicks = 0;
    p.velocity?.set?.(0, 0, 0);
    p.fallDistance = 0;
    p.deathDropsDone = false;
    if (typeof document !== 'undefined') document.getElementById('death-overlay')?.classList.add('hidden');
  }

  /** In front of this player's house, with their kit. */
  spawnAtBase() {
    const p = this.game.player;
    const me = this.myRecord();
    if (!p || !me || me.plot === null) return;
    const { spawn } = plotLayout(me.plot, me.house);
    this.heal(p);
    p.setGameMode?.('survival');
    p.position.set(spawn.x, spawn.y, spawn.z);
    p.yaw = spawn.yaw; p.pitch = 0;
    this.protectedUntil = this.clock + SPAWN_PROTECTION_SECONDS;
    this.ensureKit();
    this.game.ui?.updateStats?.();
  }

  /**
   * The kit this player owns, and nothing else of it: one pickaxe of their level, kept at full durability, and the
   * Superstick once bought. Kit items put in a chest come back out of it.
   */
  ensureKit() {
    const inv = this.game.inventory;
    const me = this.myRecord();
    if (!inv || !me) return;
    if (this.game.ui?.isModalOpen?.() && !this.ui?.shopOpen) return;
    const pick = kitPickaxe(me.pickaxe);
    const slots = [inv.hotbar, inv.storage];
    let havePick = false, haveStick = false, changed = false;
    for (const list of slots) {
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item?.miningSim) continue;
        const keep = item.miningSim === 'pickaxe' ? (!havePick && item.id === pick.id) : (item.miningSim === 'superstick' && me.superstick && !haveStick);
        if (!keep) { list[i] = null; changed = true; continue; }
        if (item.miningSim === 'pickaxe') {
          havePick = true;
          if (typeof item.maxDurability === 'number' && item.durability !== item.maxDurability) item.durability = item.maxDurability;
        } else haveStick = true;
      }
    }
    if (!havePick) { changed = true; if (!inv.hotbar[0]) inv.hotbar[0] = pick; else inv.addItem(pick); }
    if (me.superstick && !haveStick) { changed = true; if (!inv.hotbar[1]) inv.hotbar[1] = kitSuperstick(); else inv.addItem(kitSuperstick()); }
    // Kit items stored in a chest.
    const chests = this.game.chestManager;
    for (const chest of chests?.chests?.values() ?? []) {
      if (!chest.items.some((item) => item?.miningSim)) continue;
      chests.setChestItems(chest.x, chest.y, chest.z, chest.items.map((item) => (item?.miningSim ? null : item)), { facing: chest.facing });
    }
    if (changed) this.game.ui?.updateHotbar?.();
  }

  /** How many of each ore this player carries. */
  oreCounts() {
    const inv = this.game.inventory;
    const counts = {};
    for (const item of [...(inv?.hotbar ?? []), ...(inv?.storage ?? [])]) {
      if (!item || item.isBlock || !ORE_VALUES[item.id] || item.miningSim) continue;
      counts[item.id] = (counts[item.id] ?? 0) + (item.count ?? 1);
    }
    return counts;
  }

  /** Take every ore out of the inventory and sell it. */
  sellAll() {
    const inv = this.game.inventory;
    const counts = this.oreCounts();
    if (saleValue(counts).coins <= 0) { this.ui?.say('You are not carrying any ores.'); return; }
    for (const list of [inv.hotbar, inv.storage]) {
      for (let i = 0; i < list.length; i++) if (list[i] && !list[i].isBlock && ORE_VALUES[list[i].id] && !list[i].miningSim) list[i] = null;
    }
    this.game.ui?.updateHotbar?.();
    this.ask({ type: 'sell', counts });
  }

  buy(what) { this.ask({ type: 'buy', what }); }

  /** The player died: the host moves the coins; this player is back at their base at once. */
  onLocalDeath() {
    if (!this.active) return false;
    this.ask({ type: 'died' });
    this.spawnAtBase();
    this.game.ui?.addChatMessage?.('You died and respawned at your base.', 'system');
    return true;
  }

  /** Whether a hit on this player may land here: not during spawn protection, not inside their own plot. */
  locallyProtected() {
    if (this.clock < this.protectedUntil) return true;
    const me = this.myRecord();
    const p = this.game.player?.position;
    return Boolean(me && p && me.plot !== null && plotAt(p.x, p.z) === me.plot);
  }

  /**
   * The damage this player takes, or null for none: only another player's Superstick hurts, by 2.5 a hit.
   */
  damageFor(amount, damageType, options = {}) {
    if (damageType !== 'player' || !options?.fromPlayer || options.weapon !== 'stick') return null;
    if (this.locallyProtected()) return null;
    return SUPERSTICK_DAMAGE;
  }

  /** A swing at another player: only the Superstick, no faster than its cooldown. */
  superstickHit() {
    const item = this.game.inventory?.getActiveItem?.();
    if (item?.miningSim !== 'superstick') {
      if (this.clock - this.noticeAt > 4) { this.noticeAt = this.clock; this.game.ui?.addChatMessage?.('Only the Superstick can hurt other players.', 'system'); }
      return false;
    }
    if (this.clock - this.lastHitAt < SUPERSTICK_COOLDOWN_SECONDS) return false;
    this.lastHitAt = this.clock;
    return true;
  }

  // --- the rules of the world -----------------------------------------------------------------------------------

  /** Only the mines can be dug, and each only with its own tier of pickaxe or better. */
  canBreakBlock(x, y, z) {
    if (!this.active) return undefined;
    const mine = mineAt(x, y, z);
    if (!mine) return false;
    const level = this.myRecord()?.pickaxe ?? 1;
    if (level >= mine.tier) return true;
    if (this.clock - (this.tierNoticeAt ?? -Infinity) > 3) {
      this.tierNoticeAt = this.clock;
      this.game.ui?.addChatMessage?.(`The ${mine.name} needs a ${mine.needs} or better. The Trader sells pickaxe upgrades.`, 'system');
    }
    return false;
  }

  /** A block was broken here: the host starts its regrowth clock now. */
  onBlockBroken(x, y, z) {
    if (this.active) this.noteMined(x, y, z);
  }

  /** The mines' names, over their north rims. */
  showMineLabels() {
    const scene = this.game.scene;
    if (!scene) return;
    for (const mine of MINES) {
      const sprite = labelSprite([[mine.name.toUpperCase(), '#fde047'], [`${mine.needs} or better`, '#e7e5e4']]);
      const at = mineLabel(mine);
      sprite.position.set(at.x, at.y, at.z);
      scene.add(sprite);
      this.mineLabels.push(sprite);
    }
  }

  /** Nothing is built by hand: houses come from the trader. */
  canPlaceBlock() {
    if (!this.active) return undefined;
    return false;
  }

  /** Right-click: the trader, and other players' chests (locked). */
  interact({ mob, block }) {
    if (!this.active) return false;
    if (mob?.miningTrader) { this.ui?.openShop(); return true; }
    if (block && this.game.world?.getVoxel(block.x, block.y, block.z) === BLOCKS.CHEST) {
      const plot = plotAt(block.x, block.z);
      const owner = plot === null ? null : this.plotOwner(plot);
      const me = this.myRecord();
      if (owner && me && owner.plot !== me.plot) {
        this.game.ui?.addChatMessage?.(`This chest belongs to ${escapeHtml(owner.name)}.`, 'system');
        return true;
      }
    }
    return false;
  }

  // --- every frame ------------------------------------------------------------------------------------------

  update(dt) {
    if (!this.active) return;
    this.clock += dt;
    this.holdMidday();
    const p = this.game.player;
    if (p) {
      // Peaceful: never hungry.
      if (p.hunger < 20) { p.hunger = 20; if (p._hungerState) p._hungerState.hunger = 20; }
      // Out of the map (or under it): back to the base.
      const far = Math.abs(p.position.x) > WORLD.extent + 4 || Math.abs(p.position.z) > WORLD.extent + 4;
      if ((p.position.y < MINE_BOTTOM - 4 || far) && this.myRecord()) this.spawnAtBase();
      if (p.gamemode !== 'survival' && p.gamemode !== 'spectator' && this.myRecord()) p.setGameMode?.('survival');
    }
    this.kitTimer -= dt;
    if (this.kitTimer <= 0) { this.kitTimer = 0.5; this.ensureKit(); }
    if (!this.ledger) return;
    this.scanTimer -= dt;
    if (this.scanTimer <= 0) { this.scanTimer = SCAN_SECONDS; this.regrowMine(); }
    this.saveTimer += dt;
    if (this.saveTimer >= SAVE_SECONDS) { this.saveTimer = 0; this.save(); }
    this.publishTimer += dt;
    if ((this.events?.length ?? 0) > 0 || this.publishTimer >= 2) { this.publishTimer = 0; this.publish(); }
  }

  isModalOpen() {
    return Boolean(this.active && this.ui?.shopOpen);
  }
}

export { nameKey };
