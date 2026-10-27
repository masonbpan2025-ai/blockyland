// The rules of a Bed Wars match. Pure: no world, no network, no clock but the `dt` it is given, so the host runs it and
// tests can play whole matches -- as SkyWars' rules do (../skywars/rules.js), whose lobby, countdown, kill credit and
// snapshot this follows.
//
// The game, as the Hypixel wiki's Bed Wars article describes it:
//   - Teams spawn on their own island with a bed and a resource generator. "As long as a player's bed has not been
//     broken by an enemy team, they can respawn after a cooldown of 5 seconds following their death. However, once
//     their bed is destroyed, the player enters a 'final kill' status, meaning their next death will eliminate them."
//   - Generators: iron and gold at each base (the forge), diamonds on the islands between the bases, emeralds in the
//     middle; "Diamond and emerald generators alternate in leveling up."
//   - "Bed Destruction: All remaining beds are simultaneously destroyed"; then "Sudden Death"; the last team standing wins.
// The event times are the wiki timetable's: Diamond II 6:00, Emerald II 12:00, Diamond III 18:00, Emerald III 24:00, Bed
// Destruction 30:00, Sudden Death 40:00, Game End 50:00. The "fast" pace halves them, for a game among friends.
import { MODES, TEAMS } from './teams.js';
import { DEFAULT_MAP, normalizeMap } from './arena.js';
import { upgradeCost, trapCost, UPGRADES, TRAPS } from './shop.js';

export const PHASES = Object.freeze(['lobby', 'countdown', 'playing', 'ended']);
export const COUNTDOWN_SECONDS = 5;
export const RESPAWN_SECONDS = 5;
export const KILL_CREDIT_SECONDS = 10;
export const MIN_PLAYERS = 2;
export const HOST_ID = 'host';
export const PACES = Object.freeze({ normal: 1, fast: 0.5 });

/** The match's timed events, in seconds of play at the normal pace. */
export const EVENTS = Object.freeze([
  { at: 360, kind: 'tier', gen: 'diamond', tier: 2, label: 'Diamond II' },
  { at: 720, kind: 'tier', gen: 'emerald', tier: 2, label: 'Emerald II' },
  { at: 1080, kind: 'tier', gen: 'diamond', tier: 3, label: 'Diamond III' },
  { at: 1440, kind: 'tier', gen: 'emerald', tier: 3, label: 'Emerald III' },
  { at: 1800, kind: 'bed_gone', label: 'Bed Destruction' },
  { at: 2400, kind: 'sudden_death', label: 'Sudden Death' },
  { at: 3000, kind: 'game_end', label: 'Game End' },
]);

/**
 * How fast each generator makes what it makes, in seconds per item, and how many it holds before it stops (a pile left
 * on a generator does not grow for ever). Diamonds: about every 30 s at tier I (wiki); emeralds about every 65 s. The
 * forge's base rates and the forge upgrades' boosts (Iron Forge +50%, Golden Forge +100%, Emerald Forge adds emeralds,
 * Molten Forge +200%) are as Hypixel's upgrade menu states them.
 */
export const GENERATORS = Object.freeze({
  iron: { seconds: 1.5, cap: 48 },
  gold: { seconds: 6, cap: 12 },
  forgeEmerald: { seconds: 60, cap: 4 },
  diamond: { seconds: [30, 23, 12], cap: 4 },
  emerald: { seconds: [65, 50, 35], cap: 2 },
});
export const FORGE_SPEED = Object.freeze([1, 1.5, 2, 2, 3]);
/** How near a generator a player must stand to take from it, and teammates to share in a forge's pickup (blocks). */
export const PICKUP_REACH = 1.8;
export const SPLIT_REACH = 3;
/** A base's traps fire one at a time, and not again for this long. */
export const TRAP_COOLDOWN_SECONDS = 10;
export const RESOURCES = Object.freeze(['iron', 'gold', 'diamond', 'emerald']);

/** How a death reads in the chat, as Hypixel words them, with "FINAL KILL!" when it is one. */
export function deathMessage(victim, killer, cause, final = false) {
  let text;
  if (cause === 'void') text = killer ? `${victim} was knocked into the void by ${killer}.` : `${victim} fell into the void.`;
  else if (cause === 'fall') text = killer ? `${victim} was knocked off a cliff by ${killer}.` : `${victim} fell from a high place.`;
  else if (cause === 'arrow') text = killer ? `${victim} was shot by ${killer}.` : `${victim} was shot.`;
  else if (cause === 'explosion') text = killer ? `${victim} was blown up by ${killer}.` : `${victim} blew up.`;
  else if (cause === 'left') text = `${victim} disconnected.`;
  else text = killer ? `${victim} was killed by ${killer}.` : `${victim} died.`;
  return final ? `${text} FINAL KILL!` : text;
}

const emptyStock = () => ({ iron: 0, gold: 0, diamond: 0, emerald: 0 });

export class BedWarsMatch {
  constructor({ mode = 'fours', pace = 'normal', theme = DEFAULT_MAP.theme, seed = 2017, random = Math.random } = {}) {
    this.random = random;
    this.mode = MODES[mode] ? mode : 'fours';
    this.pace = PACES[pace] ? pace : 'normal';
    this.seed = seed >>> 0;
    this.map = normalizeMap({ teams: MODES[this.mode].teams, theme, seed: this.newSeed() });
    this.phase = 'lobby';
    this.round = 1;
    /** @type {Map<string, object>} */
    this.players = new Map();
    this.teams = new Map();
    this.gens = [];
    this.countdown = 0;
    this.elapsed = 0;
    this.nextEvent = 0;
    this.winner = null;
    this.endReason = null;
    this.suddenDeath = false;
    this.lastHit = new Map();
    this.events = [];
    this.resetTeams();
  }

  emit(event) { this.events.push(event); }
  drainEvents() { const out = this.events; this.events = []; return out; }
  newSeed() { return Math.floor(this.random() * 0xffffffff) >>> 0; }
  get modeInfo() { return MODES[this.mode]; }
  /** The teams this map has, in order. */
  teamIds() { return TEAMS.slice(0, this.map.teams).map((t) => t.id); }

  resetTeams() {
    this.teams.clear();
    for (const id of this.teamIds()) {
      this.teams.set(id, { id, bed: true, eliminated: false, upgrades: { sharpness: 0, protection: 0, haste: 0, forge: 0, healPool: 0 }, traps: [], trapReadyAt: 0 });
    }
  }

  // --- the lobby ---------------------------------------------------------------------------------------------------

  members(teamId) { return [...this.players.values()].filter((p) => p.team === teamId); }

  /** The team with the most room, so teams fill evenly; null when every team is full. */
  openTeam() {
    let best = null;
    for (const id of this.teamIds()) {
      const n = this.members(id).length;
      if (n >= this.modeInfo.size) continue;
      if (!best || n < best.n) best = { id, n };
    }
    return best?.id ?? null;
  }

  join(id, name) {
    if (this.players.has(id)) return this.players.get(id);
    const team = this.phase === 'lobby' ? this.openTeam() : null;
    const player = { id, name: String(name ?? 'Player'), team, alive: team !== null && this.phase === 'lobby', dead: false, respawnAt: null,
      kills: 0, finalKills: 0, beds: 0, deaths: 0, connected: true };
    this.players.set(id, player);
    this.emit({ kind: 'joined', id, team });
    return player;
  }

  leave(id) {
    const player = this.players.get(id);
    if (!player) return;
    if (this.phase === 'playing' && player.alive) this.eliminate(player, null, 'left');
    if (this.phase !== 'playing') this.players.delete(id);
    else player.connected = false;
    if (this.phase === 'countdown' && this.contenders().length < MIN_PLAYERS) {
      this.phase = 'lobby';
      this.emit({ kind: 'cancelled' });
    }
  }

  /** A player picks a team in the lobby, if it has room. */
  chooseTeam(id, teamId) {
    const player = this.players.get(id);
    if (!player || this.phase !== 'lobby' || !this.teams.has(teamId) || player.team === teamId) return false;
    if (this.members(teamId).length >= this.modeInfo.size) return false;
    player.team = teamId;
    player.alive = true;
    return true;
  }

  /** The host picks the mode: its number of teams and their size. Everyone is shared out into the new teams. */
  setMode(by, mode) {
    if (by !== HOST_ID || this.phase !== 'lobby' || !MODES[mode]) return false;
    this.mode = mode;
    this.map = normalizeMap({ ...this.map, teams: MODES[mode].teams, seed: this.newSeed() });
    this.resetTeams();
    const everyone = [...this.players.values()];
    for (const p of everyone) p.team = null;
    for (const p of everyone) { p.team = this.openTeam(); p.alive = p.team !== null; }
    return true;
  }

  setPace(by, pace) {
    if (by !== HOST_ID || this.phase !== 'lobby' || !PACES[pace]) return false;
    this.pace = pace;
    return true;
  }

  setTheme(by, theme) {
    if (by !== HOST_ID || this.phase !== 'lobby') return false;
    this.map = normalizeMap({ ...this.map, theme, seed: this.newSeed() });
    return this.map.theme === theme;
  }

  contenders() { return [...this.players.values()].filter((p) => p.team !== null); }
  /** Teams with someone on them. */
  activeTeams() { return this.teamIds().filter((id) => this.contenders().some((p) => p.team === id)); }

  canStart(by) {
    if (by !== HOST_ID) return { ok: false, reason: 'Only the host can start the game.' };
    if (this.phase !== 'lobby') return { ok: false, reason: 'The game has already started.' };
    if (this.contenders().length < MIN_PLAYERS) return { ok: false, reason: 'Waiting for at least one more player to join.' };
    if (this.activeTeams().length < 2) return { ok: false, reason: 'Everyone is on one team: at least two teams need a player.' };
    return { ok: true, reason: null };
  }

  start(by) {
    const check = this.canStart(by);
    if (!check.ok) return check;
    this.phase = 'countdown';
    this.countdown = COUNTDOWN_SECONDS;
    this.emit({ kind: 'countdown', seconds: COUNTDOWN_SECONDS });
    return check;
  }

  /** The game begins: generators made, and the beds of empty teams gone (Hypixel removes them). */
  begin() {
    this.phase = 'playing';
    this.elapsed = 0;
    this.nextEvent = 0;
    this.suddenDeath = false;
    this.lastHit.clear();
    this.resetTeams();
    for (const p of this.players.values()) { p.alive = p.team !== null; p.dead = false; p.respawnAt = null; }
    for (const team of this.teams.values()) if (!this.members(team.id).length) { team.bed = false; team.eliminated = true; }
    this.gens = [];
    for (const id of this.teamIds()) this.gens.push({ id: `f-${id}`, kind: 'forge', team: id, stock: emptyStock(), timers: { iron: 0, gold: 0, emerald: 0 } });
    const counts = { diamond: this.map.teams === 2 ? 2 : 4, emerald: this.map.teams === 8 ? 4 : 2 };
    for (const kind of ['diamond', 'emerald']) {
      for (let i = 0; i < counts[kind]; i++) this.gens.push({ id: `${kind[0]}${i}`, kind, tier: 1, stock: emptyStock(), timer: 0 });
    }
    this.emit({ kind: 'start' });
  }

  // --- the clock ---------------------------------------------------------------------------------------------------

  /** When the next timed event comes, in seconds of play, and its name. */
  upcoming() {
    const event = EVENTS[this.nextEvent];
    return event ? { label: event.label, at: event.at * PACES[this.pace] } : null;
  }

  update(dt) {
    if (this.phase === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown = Math.max(0, this.countdown - dt);
      const now = Math.ceil(this.countdown);
      if (now < before && now > 0) this.emit({ kind: 'countdown', seconds: now });
      if (this.countdown <= 0) this.begin();
      return;
    }
    if (this.phase !== 'playing') return;
    this.elapsed += dt;
    while (this.nextEvent < EVENTS.length && this.elapsed >= EVENTS[this.nextEvent].at * PACES[this.pace]) this.fire(EVENTS[this.nextEvent++]);
    if (this.phase !== 'playing') return;
    this.runGenerators(dt);
    for (const p of this.players.values()) {
      if (p.dead && p.alive && p.respawnAt !== null && this.elapsed >= p.respawnAt) {
        p.dead = false;
        p.respawnAt = null;
        this.emit({ kind: 'respawn', id: p.id });
      }
    }
  }

  fire(event) {
    if (event.kind === 'tier') {
      for (const gen of this.gens) if (gen.kind === event.gen) gen.tier = event.tier;
      this.emit({ kind: 'tier', gen: event.gen, tier: event.tier, message: `${event.gen === 'diamond' ? 'Diamond' : 'Emerald'} Generators have been upgraded to Tier ${event.tier === 2 ? 'II' : 'III'}` });
    } else if (event.kind === 'bed_gone') {
      for (const team of this.teams.values()) team.bed = false;
      this.emit({ kind: 'bed_gone', message: 'All beds have been destroyed!' });
    } else if (event.kind === 'sudden_death') {
      this.suddenDeath = true;
      // Hypixel sends ender dragons at every island here; this game has no dragons for it yet, so it is announced only.
      this.emit({ kind: 'sudden_death', message: `SUDDEN DEATH! The game ends in ${Math.round(((3000 - 2400) * PACES[this.pace]) / 60)} minutes.` });
    } else if (event.kind === 'game_end') {
      this.end(null, 'time');
    }
  }

  runGenerators(dt) {
    const add = (gen, resource, cap) => { if (gen.stock[resource] < cap) gen.stock[resource]++; };
    for (const gen of this.gens) {
      if (gen.kind === 'forge') {
        const team = this.teams.get(gen.team);
        if (!team || team.eliminated) continue;
        const speed = FORGE_SPEED[team.upgrades.forge] ?? 1;
        for (const resource of ['iron', 'gold']) {
          gen.timers[resource] += dt * speed;
          const every = GENERATORS[resource].seconds;
          while (gen.timers[resource] >= every) { gen.timers[resource] -= every; add(gen, resource, GENERATORS[resource].cap); }
        }
        if (team.upgrades.forge >= 3) {
          gen.timers.emerald += dt;
          while (gen.timers.emerald >= GENERATORS.forgeEmerald.seconds) { gen.timers.emerald -= GENERATORS.forgeEmerald.seconds; add(gen, 'emerald', GENERATORS.forgeEmerald.cap); }
        }
      } else {
        const every = GENERATORS[gen.kind].seconds[gen.tier - 1];
        gen.timer += dt;
        while (gen.timer >= every) { gen.timer -= every; add(gen, gen.kind, GENERATORS[gen.kind].cap); }
      }
    }
  }

  /**
   * `by` stands on generator `genId`: they take its pile. On a forge, teammates standing on it too get as much again
   * -- Hypixel's "generator split" -- by `near(id)`, the host's record of who is near.
   * @returns {Array<{id:string, items:object}>} who gets what
   */
  collect(by, genId, near = () => false) {
    const player = this.players.get(by);
    const gen = this.gens.find((g) => g.id === genId);
    if (this.phase !== 'playing' || !player?.alive || player.dead || !gen) return [];
    const items = { ...gen.stock };
    if (!RESOURCES.some((r) => items[r] > 0)) return [];
    gen.stock = emptyStock();
    const grants = [{ id: by, items }];
    if (gen.kind === 'forge') {
      const split = { iron: items.iron, gold: items.gold, diamond: 0, emerald: 0 };
      if (split.iron || split.gold) {
        for (const mate of this.members(player.team)) if (mate.id !== by && mate.alive && !mate.dead && near(mate.id)) grants.push({ id: mate.id, items: { ...split } });
      }
    }
    return grants;
  }

  // --- fighting, dying and beds ------------------------------------------------------------------------------------

  hit(attacker, target) {
    if (this.phase !== 'playing' || attacker === target) return;
    this.lastHit.set(target, { by: attacker, at: this.elapsed });
  }

  creditFor(id) {
    const last = this.lastHit.get(id);
    if (!last || this.elapsed - last.at > KILL_CREDIT_SECONDS) return null;
    const killer = this.players.get(last.by);
    return killer && killer.id !== id && killer.team !== this.players.get(id)?.team ? killer : null;
  }

  /**
   * A player died. With their bed standing they respawn in 5 s; without it, it is a final kill and they are out. What
   * they carried of iron, gold, diamonds and emeralds goes to whoever killed them (Hypixel).
   * @returns {{final:boolean, killer:object|null}|null}
   */
  died(id, cause = 'player', resources = {}) {
    const victim = this.players.get(id);
    if (this.phase !== 'playing' || !victim?.alive || victim.dead) return null;
    const killer = this.creditFor(id);
    const team = this.teams.get(victim.team);
    const final = !team?.bed;
    victim.deaths++;
    this.lastHit.delete(id);
    if (killer) { if (final) killer.finalKills++; else killer.kills++; }
    const message = deathMessage(victim.name, killer?.name ?? null, cause, final);
    if (final) {
      victim.alive = false;
      victim.dead = false;
    } else {
      victim.dead = true;
      victim.respawnAt = this.elapsed + RESPAWN_SECONDS;
    }
    this.emit({ kind: 'death', id, killer: killer?.id ?? null, final, cause, message, team: victim.team });
    const loot = {};
    for (const r of RESOURCES) if (Number.isInteger(resources?.[r]) && resources[r] > 0) loot[r] = Math.min(resources[r], 2304);
    if (killer && Object.keys(loot).length) this.emit({ kind: 'grant', id: killer.id, items: loot, from: victim.name });
    if (final) this.checkTeam(victim.team);
    return { final, killer };
  }

  /** Out without dying in play: a player who left. */
  eliminate(player, killer, cause) {
    player.alive = false;
    player.dead = false;
    this.emit({ kind: 'death', id: player.id, killer: killer?.id ?? null, final: true, cause, message: deathMessage(player.name, killer?.name ?? null, cause, true), team: player.team });
    this.checkTeam(player.team);
  }

  /** A team with nobody left in it is eliminated; the last team standing wins. */
  checkTeam(teamId) {
    const team = this.teams.get(teamId);
    if (!team || team.eliminated) return;
    if (this.members(teamId).some((p) => p.alive)) return;
    team.eliminated = true;
    team.bed = false;
    this.emit({ kind: 'team_out', team: teamId, message: `TEAM ELIMINATED > ${TEAMS.find((t) => t.id === teamId)?.name} Team has been eliminated!` });
    const left = [...this.teams.values()].filter((t) => !t.eliminated);
    if (left.length <= 1) this.end(left[0]?.id ?? null, 'last_team');
  }

  /** `by` broke `teamId`'s bed. Not their own, and only while it stands. */
  bedBroken(teamId, by) {
    const team = this.teams.get(teamId);
    const breaker = this.players.get(by);
    if (this.phase !== 'playing' || !team?.bed || !breaker?.alive || breaker.dead || breaker.team === teamId) return false;
    team.bed = false;
    breaker.beds++;
    const name = TEAMS.find((t) => t.id === teamId)?.name;
    this.emit({ kind: 'bed', team: teamId, by, message: `BED DESTRUCTION > ${name} Bed was destroyed by ${breaker.name}!` });
    // A team whose players are all already out of respawns is gone with its bed.
    this.checkTeam(teamId);
    return true;
  }

  // --- team upgrades and traps -------------------------------------------------------------------------------------

  /** `by` buys the next tier of a team upgrade. @returns the new level, or null when there is none to buy */
  buyUpgrade(by, key) {
    const player = this.players.get(by);
    const team = this.teams.get(player?.team);
    const def = UPGRADES[key];
    if (this.phase !== 'playing' || !player?.alive || !team || !def) return null;
    const level = team.upgrades[key] ?? 0;
    if (level >= def.max) return null;
    team.upgrades[key] = level + 1;
    this.emit({ kind: 'upgrade', team: team.id, key, level: level + 1, by, cost: upgradeCost(key, level + 1, this.modeInfo.prices) });
    return level + 1;
  }

  buyTrap(by, trap) {
    const player = this.players.get(by);
    const team = this.teams.get(player?.team);
    if (this.phase !== 'playing' || !player?.alive || !team || !TRAPS[trap] || team.traps.length >= 3) return false;
    const cost = trapCost(team.traps.length);
    team.traps.push(trap);
    this.emit({ kind: 'trap_bought', team: team.id, trap, by, cost });
    return true;
  }

  /**
   * An enemy standing in a base with traps set off its first trap (Hypixel: traps fire in order, one at a time). `inBase`
   * says whether a player is inside a team's base; `immune` whether they drank Magic Milk recently.
   */
  checkTraps(inBase, immune = () => false) {
    if (this.phase !== 'playing') return;
    for (const team of this.teams.values()) {
      if (team.eliminated || !team.traps.length || this.elapsed < team.trapReadyAt) continue;
      const intruder = [...this.players.values()].find((p) => p.alive && !p.dead && p.team && p.team !== team.id && inBase(p.id, team.id) && !immune(p.id));
      if (!intruder) continue;
      const trap = team.traps.shift();
      team.trapReadyAt = this.elapsed + TRAP_COOLDOWN_SECONDS;
      this.emit({ kind: 'trap', team: team.id, trap, intruder: intruder.id, intruderTeam: intruder.team, message: `${TRAPS[trap].name} was set off!` });
    }
  }

  /** Whether a hit may land: in play, between living players of different teams (no friendly fire). */
  canAttack(attacker, target) {
    if (this.phase !== 'playing') return 'not_started';
    const a = this.players.get(attacker), b = this.players.get(target);
    if (!a?.alive || !b?.alive || a.dead || b.dead) return 'spectator';
    if (a.team === b.team) return 'teammate';
    return null;
  }

  end(winnerTeam, reason) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.winner = winnerTeam;
    this.endReason = reason;
    this.emit({ kind: 'end', winner: winnerTeam, reason });
  }

  /** The host plays again: everyone back in the lobby, teams kept where they fit, a fresh map. */
  reset(by) {
    if (by !== HOST_ID || this.phase !== 'ended') return false;
    this.round++;
    this.phase = 'lobby';
    this.map = { ...this.map, seed: this.newSeed() };
    this.winner = null;
    this.endReason = null;
    this.elapsed = 0;
    this.nextEvent = 0;
    this.countdown = 0;
    this.gens = [];
    this.suddenDeath = false;
    this.lastHit.clear();
    this.resetTeams();
    const here = [...this.players.values()].filter((p) => p.connected !== false);
    this.players.clear();
    for (const p of here) {
      const again = this.join(p.id, p.name);
      if (p.team && this.members(p.team).length < this.modeInfo.size && again.team !== p.team) { again.team = p.team; again.alive = true; }
    }
    this.emit({ kind: 'reset', round: this.round });
    return true;
  }

  snapshot() {
    const next = this.upcoming();
    return {
      type: 'state',
      phase: this.phase,
      round: this.round,
      mode: this.mode,
      pace: this.pace,
      map: { ...this.map },
      countdown: Math.ceil(this.countdown),
      elapsed: Math.floor(this.elapsed),
      next: next ? { label: next.label, in: Math.max(0, Math.ceil(next.at - this.elapsed)) } : null,
      suddenDeath: this.suddenDeath,
      winner: this.winner,
      endReason: this.endReason,
      players: [...this.players.values()].map(({ id, name, team, alive, dead, respawnAt, kills, finalKills, beds }) => ({
        id, name, team, alive, dead, respawnIn: dead && respawnAt !== null ? Math.max(0, Math.ceil(respawnAt - this.elapsed)) : null, kills, finalKills, beds,
      })),
      teams: [...this.teams.values()].map((t) => ({ id: t.id, bed: t.bed, eliminated: t.eliminated, upgrades: { ...t.upgrades }, traps: [...t.traps] })),
      gens: this.gens.map((g) => ({
        id: g.id, kind: g.kind, team: g.team ?? null, tier: g.tier ?? null, stock: { ...g.stock },
        next: g.kind === 'forge' ? null : Math.max(0, Math.ceil(GENERATORS[g.kind].seconds[g.tier - 1] - g.timer)),
      })),
    };
  }
}
