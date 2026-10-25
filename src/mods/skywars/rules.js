// The rules of a SkyWars match. Pure: no world, no network, no clock but the `dt` it is given, so the host runs it
// and tests can play whole matches.
//
// The flow, as players know it from SkyWars servers:
//   lobby     -- the host waits for players; each who joins gets an island and waits in its glass cage. The host can
//                start only once at least one other player has joined.
//   countdown -- 3, 2, 1 on screen; nobody can fight yet.
//   playing   -- the cages open. "The main goal is to be the last person or team alive to win" (Tutorial:SkyWars).
//                Chests refill twice, the second time adding ender pearls (Hypixel); time running out is a draw.
//   ended     -- the winner (or the draw) is shown; the host can play again, which rebuilds the islands.
//
// The map is the host's choice in the lobby: a template and a data pack (arena.js). Its seed is drawn afresh when the
// host picks a map, asks for new islands, or plays again, so no two rounds are fought on the same islands.
import { ARENA, DEFAULT_MAP, normalizeMap } from './arena.js';
import { MODES } from './loot.js';

export const PHASES = Object.freeze(['lobby', 'countdown', 'playing', 'ended']);
export const COUNTDOWN_SECONDS = 3;
/** When the chests refill, in seconds of play; the second refill adds ender pearls. */
export const REFILL_TIMES = Object.freeze([180, 360]);
/** A match still running after this many seconds ends as a draw among those alive. */
export const TIME_LIMIT_SECONDS = 600;
/** A death within this long of being hit by a player is that player's kill (a knock into the void included). */
export const KILL_CREDIT_SECONDS = 10;
export const MIN_PLAYERS = 2;
export const HOST_ID = 'host';

/** How a death reads in the chat, in Minecraft's words where it has them. */
export function deathMessage(victim, killer, cause) {
  if (cause === 'void') return killer ? `${victim} was knocked into the void by ${killer}` : `${victim} fell into the void`;
  if (cause === 'fall') return killer ? `${victim} hit the ground too hard whilst trying to escape ${killer}` : `${victim} hit the ground too hard`;
  if (cause === 'left') return `${victim} left the game`;
  if (killer) return `${victim} was slain by ${killer}`;
  return `${victim} died`;
}

export class SkyWarsMatch {
  constructor({ mode = 'normal', seed = 2015, map = null, random = Math.random } = {}) {
    this.mode = MODES.includes(mode) ? mode : 'normal';
    this.seed = seed >>> 0;
    this.random = random;
    this.map = normalizeMap(map ?? { ...DEFAULT_MAP, seed: this.newSeed() });
    this.phase = 'lobby';
    this.round = 1;
    /** @type {Map<string, {id:string,name:string,slot:number|null,alive:boolean,kills:number}>} */
    this.players = new Map();
    this.countdown = 0;
    this.elapsed = 0;
    this.refills = 0;
    this.winner = null;
    this.endReason = null;
    this.lastHit = new Map(); // target -> { by, at }
    this.events = [];
  }

  emit(event) { this.events.push(event); }
  drainEvents() { const out = this.events; this.events = []; return out; }

  freeSlot() {
    const taken = new Set([...this.players.values()].map((p) => p.slot).filter((s) => s !== null));
    for (let slot = 0; slot < ARENA.maxPlayers; slot++) if (!taken.has(slot)) return slot;
    return null;
  }

  /** A player arrives. In the lobby they get an island; later, or with every island taken, they watch. */
  join(id, name) {
    if (this.players.has(id)) return this.players.get(id);
    const slot = this.phase === 'lobby' ? this.freeSlot() : null;
    const player = { id, name: String(name ?? 'Player'), slot, alive: slot !== null && this.phase === 'lobby', kills: 0 };
    this.players.set(id, player);
    this.emit({ kind: 'joined', id, slot });
    return player;
  }

  /** A player leaves: gone from the lobby; out of a match being played. */
  leave(id) {
    const player = this.players.get(id);
    if (!player) return;
    if (this.phase === 'playing' && player.alive) this.eliminate(id, 'left');
    if (this.phase !== 'playing') this.players.delete(id);
    else player.connected = false;
    if (this.phase === 'countdown' && this.contenders().length < MIN_PLAYERS) {
      this.phase = 'lobby';
      this.emit({ kind: 'cancelled' });
    }
  }

  setMode(by, mode) {
    if (by !== HOST_ID || this.phase !== 'lobby' || !MODES.includes(mode)) return false;
    this.mode = mode;
    return true;
  }

  newSeed() { return Math.floor(this.random() * 0xffffffff) >>> 0; }

  /** The host picks a map (a template and one of its data packs) in the lobby: freshly generated. */
  setMap(by, { template, pack } = {}) {
    if (by !== HOST_ID || this.phase !== 'lobby') return false;
    this.map = normalizeMap({ template, pack, seed: this.newSeed() });
    return true;
  }

  /** The host asks for the same map generated again, differently. */
  newIslands(by) {
    if (by !== HOST_ID || this.phase !== 'lobby') return false;
    this.map = { ...this.map, seed: this.newSeed() };
    return true;
  }

  /** Players with an island, in the lobby or countdown. */
  contenders() { return [...this.players.values()].filter((p) => p.slot !== null); }
  alive() { return [...this.players.values()].filter((p) => p.alive); }

  /** Whether `by` may start now, and if not, why -- the lobby shows the reason on the Start button. */
  canStart(by) {
    if (by !== HOST_ID) return { ok: false, reason: 'Only the host can start the game.' };
    if (this.phase !== 'lobby') return { ok: false, reason: 'The game has already started.' };
    const n = this.contenders().length;
    if (n < MIN_PLAYERS) return { ok: false, reason: 'Waiting for at least one more player to join.' };
    return { ok: true, reason: null };
  }

  start(by) {
    const check = this.canStart(by);
    if (!check.ok) return check;
    this.phase = 'countdown';
    this.countdown = COUNTDOWN_SECONDS;
    for (const p of this.contenders()) p.alive = true;
    this.emit({ kind: 'countdown', seconds: COUNTDOWN_SECONDS });
    return check;
  }

  update(dt) {
    if (this.phase === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown = Math.max(0, this.countdown - dt);
      const now = Math.ceil(this.countdown);
      if (now < before && now > 0) this.emit({ kind: 'countdown', seconds: now });
      if (this.countdown <= 0) {
        this.phase = 'playing';
        this.elapsed = 0;
        this.refills = 0;
        this.lastHit.clear();
        this.emit({ kind: 'start' });
      }
      return;
    }
    if (this.phase !== 'playing') return;
    this.elapsed += dt;
    while (this.refills < REFILL_TIMES.length && this.elapsed >= REFILL_TIMES[this.refills]) {
      this.refills++;
      this.emit({ kind: 'refill', refill: this.refills });
    }
    if (this.elapsed >= TIME_LIMIT_SECONDS) this.end(null, 'time');
  }

  /** The host saw `attacker` hit `target`: remembered for the kill credit. */
  hit(attacker, target) {
    if (this.phase !== 'playing' || attacker === target) return;
    this.lastHit.set(target, { by: attacker, at: this.elapsed });
  }

  /** Who gets the kill if `id` dies now. */
  creditFor(id) {
    const last = this.lastHit.get(id);
    if (!last || this.elapsed - last.at > KILL_CREDIT_SECONDS) return null;
    const killer = this.players.get(last.by);
    return killer && killer.id !== id ? killer : null;
  }

  /** A player is out: killed, into the void, or gone. */
  eliminate(id, cause = 'player') {
    const victim = this.players.get(id);
    if (!victim || !victim.alive || this.phase !== 'playing') return null;
    victim.alive = false;
    const killer = this.creditFor(id);
    if (killer) killer.kills++;
    const message = deathMessage(victim.name, killer?.name ?? null, cause);
    this.emit({ kind: 'death', id, killer: killer?.id ?? null, cause, message });
    const left = this.alive();
    if (left.length <= 1) this.end(left[0]?.id ?? null, 'last_alive');
    return { victim, killer, message };
  }

  end(winnerId, reason) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.winner = winnerId;
    this.endReason = reason;
    this.emit({ kind: 'end', winner: winnerId, reason });
  }

  /** The host plays again: everyone here back on an island, kills cleared, the islands rebuilt. */
  reset(by) {
    if (by !== HOST_ID || this.phase !== 'ended') return false;
    this.round++;
    this.phase = 'lobby';
    this.map = { ...this.map, seed: this.newSeed() };
    this.winner = null;
    this.endReason = null;
    this.elapsed = 0;
    this.refills = 0;
    this.countdown = 0;
    this.lastHit.clear();
    const here = [...this.players.values()].filter((p) => p.connected !== false);
    this.players.clear();
    for (const p of here) this.join(p.id, p.name);
    this.emit({ kind: 'reset', round: this.round });
    return true;
  }

  /** Whether a hit between two players may land (shareSession attackPolicy): only in play, only among the living. */
  canAttack(attacker, target) {
    if (this.phase !== 'playing') return 'not_started';
    if (!this.players.get(attacker)?.alive || !this.players.get(target)?.alive) return 'spectator';
    return null;
  }

  /** What every player is told: data only. */
  snapshot() {
    return {
      type: 'state',
      phase: this.phase,
      round: this.round,
      mode: this.mode,
      seed: this.seed,
      map: { ...this.map },
      countdown: Math.ceil(this.countdown),
      elapsed: Math.floor(this.elapsed),
      refills: this.refills,
      nextRefill: this.refills < REFILL_TIMES.length ? REFILL_TIMES[this.refills] : null,
      timeLimit: TIME_LIMIT_SECONDS,
      winner: this.winner,
      endReason: this.endReason,
      players: [...this.players.values()].map(({ id, name, slot, alive, kills }) => ({ id, name, slot, alive, kills })),
    };
  }
}
