// SkyWars in the running game. The host's browser runs the match (rules.js) and tells everyone what happens through
// the shared world's game channel (shareSession.js sendGame); each browser then does its own part: its player in a
// cage, its inventory, its spectating, the cages opening, the islands rebuilt for the next round. Chest contents
// travel as chest updates (shareSession.js sendContainer), and a dead player's loot is claimed through the host so
// two players cannot both pick up the same sword. The islands are built from the match's map -- a template, a data
// pack and a seed (arena.js) -- by every browser alike, so a new map costs one small message, not thousands of blocks.
import * as THREE from 'three';
import { ARENA, buildArena, arenaDifferences, allCageCells, DEFAULT_MAP, mapKey, normalizeMap } from './arena.js';
import { fillChests } from './loot.js';
import { SkyWarsMatch, HOST_ID } from './rules.js';
import { createSkyWarsUi } from './ui.js';
import { collectDeathDrops } from '../../deathAndRespawn.js';
import { BLOCKS } from '../../blocks.js';

/** The seed of the map a lobby is built on before the match names one. */
export const ARENA_SEED = DEFAULT_MAP.seed;
const GUEST_MESSAGES = new Set(['died', 'drop_items', 'claim', 'start', 'reset', 'mode']);

export class SkyWarsManager {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.arena = buildArena(DEFAULT_MAP);
    /** The map the world holds, or null before this browser has built one. */
    this.arenaKey = null;
  }

  get sync() { return this.game.worldSync; }
  get session() { return this.game.worldSync?.client; }
  get isHost() { return !this.sync?.isJoined; }
  get myId() { return this.isHost ? HOST_ID : this.session?.clientId; }
  get phase() { return this.state?.phase ?? 'lobby'; }
  me() { return this.state?.players?.find((p) => p.id === this.myId) ?? null; }

  // --- the world opening and closing ------------------------------------------------------------------------

  activate() {
    this.deactivate();
    this.active = true;
    this.state = null;
    this.round = 0;
    this.cagedRound = 0;
    this.arenaKey = null;
    this.lastPhase = null;
    this.error = null;
    this.drops = new Map(); // id -> { entry, item }
    this.dropRecords = new Map(); // host: id -> { item, taken }
    this.dropSeq = 0;
    this.offs = [];
    this.publishTimer = 0;
    const game = this.game;
    if (game.gamerules) game.gamerules.doDaylightCycle = false;
    game.worldTime = 6000;
    game.sky?.setTime?.(6000);
    this.ui = createSkyWarsUi(this);
    if (this.isHost) this.startHosting();
    else this.listenAsGuest();
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;
    for (const off of this.offs ?? []) { try { off(); } catch { /* gone */ } }
    this.offs = [];
    if (this.session && this.session.attackPolicy) this.session.attackPolicy = null;
    for (const { entry } of this.drops?.values() ?? []) this.removeDropVisual(entry);
    this.drops?.clear();
    this.ui?.dispose();
    this.ui = null;
    this.match = null;
    this.state = null;
    if (this.game.gamerules) this.game.gamerules.doDaylightCycle = true;
  }

  on(event, handler) {
    const off = this.session?.on?.(event, handler);
    if (typeof off === 'function') this.offs.push(off);
  }

  // --- host ------------------------------------------------------------------------------------------------

  async startHosting() {
    this.match = new SkyWarsMatch({ seed: Math.floor(Math.random() * 0xffffffff) });
    this.match.join(HOST_ID, this.sync?.playerName?.() ?? 'Host');
    this.applyState(this.match.snapshot());
    try {
      const shared = await this.sync.hostWorld({ quiet: true, pvp: true });
      if (!this.active) return;
      this.code = shared?.roomId ?? null;
      this.ui?.setCode(this.code);
      // The host's own name, as the session settled it.
      const me = this.match.players.get(HOST_ID);
      if (me && this.session?.playerName) me.name = this.session.playerName;
    } catch (error) {
      this.error = `Could not open the lobby: ${error?.message ?? error}`;
    }
    if (!this.active) return;
    this.session.attackPolicy = (attacker, target) => this.match?.canAttack(attacker, target) ?? null;
    this.on('peer_joined', ({ peerId, peerName }) => { this.match.join(peerId, peerName); this.publish(); });
    this.on('peer_left', ({ peerId }) => { this.match.leave(peerId); this.publish(); });
    this.on('attack_landed', ({ attackerId, targetId }) => this.match.hit(attackerId, targetId));
    this.on('game', ({ peerId, data }) => this.fromGuest(peerId, data));
    this.publish();
  }

  /** What a guest may ask of the host. Anything else is ignored. */
  fromGuest(peerId, data) {
    if (!this.match || !GUEST_MESSAGES.has(data?.type)) return;
    if (data.type === 'died') {
      const cause = ['void', 'fall', 'player', 'other'].includes(data.cause) ? data.cause : 'other';
      this.match.eliminate(peerId, cause);
      this.publish();
    } else if (data.type === 'drop_items') {
      this.dropFor(peerId, data);
    } else if (data.type === 'claim') {
      this.grantClaim(peerId, String(data.id ?? ''));
    }
    // 'start', 'reset' and 'mode' are the host's alone: a guest asking is refused by the rules (by !== host).
  }

  chooseMode(mode) {
    if (!this.isHost || !this.match?.setMode(HOST_ID, mode)) return;
    this.publish();
  }

  /** The host picks a map: a template, and one of its data packs (the template's first when none is named). */
  chooseMap(template, pack = null) {
    if (!this.isHost || !this.match?.setMap(HOST_ID, { template, pack })) return;
    this.publish();
  }

  /** The host asks for the same map, generated again. */
  newIslands() {
    if (!this.isHost || !this.match?.newIslands(HOST_ID)) return;
    this.publish();
  }

  requestStart() {
    if (!this.isHost || !this.match) return;
    const result = this.match.start(HOST_ID);
    if (!result.ok) { this.error = result.reason; this.render(); return; }
    this.error = null;
    // The click that started the game may also take the mouse back for play.
    try { (this.game.renderer?.domElement ?? null)?.requestPointerLock?.(); } catch { /* not allowed now */ }
    this.publish();
  }

  requestReset() {
    if (!this.isHost || !this.match?.reset(HOST_ID)) return;
    this.publish();
  }

  /** Send the state, and each event, to everyone, and act on them here. */
  publish() {
    if (!this.match) return;
    for (const event of this.match.drainEvents()) {
      this.hostEvent(event);
      this.session?.sendGame?.({ type: 'event', event });
      this.showEvent(event);
    }
    const state = this.match.snapshot();
    this.session?.sendGame?.(state);
    this.applyState(state);
  }

  /** The host's own part of an event: the world it owns. */
  hostEvent(event) {
    if (event.kind === 'start') this.fillAllChests(0);
    else if (event.kind === 'refill') this.fillAllChests(event.refill);
    // The islands of the next round are rebuilt by applyState, on every browser, from the new map.
    else if (event.kind === 'reset') for (const [, record] of this.dropRecords) record.taken = true;
  }

  fillAllChests(refill) {
    const lists = fillChests(this.arena, { mode: this.match.mode, seed: this.match.seed + this.match.round, refill });
    this.arena.chests.forEach((c, i) => this.game.chestManager?.setChestItems?.(c.x, c.y, c.z, lists[i], { facing: c.facing }));
  }

  /** A dead player's loot, as drops everyone sees; the host says who gets each one. */
  dropFor(peerId, { x, y, z, items }) {
    if (![x, y, z].every(Number.isFinite) || !Array.isArray(items)) return;
    const drops = [];
    for (const raw of items.slice(0, 41)) {
      if (!raw || (typeof raw.id !== 'string' && !Number.isInteger(raw.id)) || !Number.isInteger(raw.count) || raw.count < 1 || raw.count > 64) continue;
      const item = { id: raw.id, count: raw.count, isBlock: Boolean(raw.isBlock), ...(Array.isArray(raw.enchantments) ? { enchantments: raw.enchantments.slice(0, 12) } : {}),
        ...(Number.isFinite(raw.durability) ? { durability: raw.durability } : {}) };
      const id = `${this.match.round}-${++this.dropSeq}`;
      this.dropRecords.set(id, { item, taken: false });
      drops.push({ id, x, y: Math.max(y, ARENA.voidY + 2), z, item, from: peerId });
    }
    if (!drops.length) return;
    this.session?.sendGame?.({ type: 'drops', drops });
    this.spawnDrops(drops);
  }

  grantClaim(by, id) {
    const record = this.dropRecords.get(id);
    if (!record || record.taken) return;
    const player = this.match?.players.get(by);
    if (!player?.alive || this.phase !== 'playing') return;
    record.taken = true;
    const message = { type: 'taken', id, by, item: record.item };
    this.session?.sendGame?.(message);
    this.taken(message);
  }

  // --- guest -----------------------------------------------------------------------------------------------

  listenAsGuest() {
    this.on('game', ({ data }) => this.fromHost(data));
  }

  fromHost(data) {
    if (data?.type === 'state') this.applyState(data);
    else if (data?.type === 'event' && data.event) this.showEvent(data.event);
    else if (data?.type === 'drops' && Array.isArray(data.drops)) this.spawnDrops(data.drops);
    else if (data?.type === 'taken') this.taken(data);
  }

  // --- everyone --------------------------------------------------------------------------------------------

  /** Make this browser match the match: the islands, this player's cage or spectating, and the screen. */
  applyState(state) {
    if (!this.active || !state) return;
    const previous = this.state;
    this.state = state;
    const map = normalizeMap(state.map ?? DEFAULT_MAP);
    if (mapKey(map) !== this.arenaKey) {
      this.switchArena(map);
      this.cagedRound = 0;
    } else if (state.round !== this.round && this.round !== 0) {
      this.restoreArena({ clearChests: true });
    }
    if (state.round !== this.round) {
      if (this.round !== 0) for (const { entry } of this.drops.values()) this.removeDropVisual(entry);
      if (this.round !== 0) this.drops.clear();
      this.round = state.round;
    }
    const me = this.me();
    const phase = state.phase;
    if ((phase === 'lobby' || phase === 'countdown') && me?.slot !== null && me?.slot !== undefined && this.cagedRound !== state.round) {
      this.enterCage(me.slot);
      this.cagedRound = state.round;
    }
    if (me && me.slot === null && phase !== 'ended' && this.game.player?.gamemode !== 'spectator') this.becomeSpectator();
    if (phase === 'playing' && previous?.phase !== 'playing') this.openCages(me);
    if ((phase === 'playing' || phase === 'ended') && me && !me.alive && this.game.player?.gamemode !== 'spectator') this.becomeSpectator();
    // Those out of the match are not seen.
    for (const [id, peer] of this.sync?.remotePlayers?.remotePlayers ?? []) {
      const p = state.players.find((q) => q.id === id);
      const hidden = (phase === 'playing' || phase === 'ended') && p && !p.alive;
      if (peer.avatar?.mesh) peer.avatar.mesh.visible = !hidden;
    }
    if (previous?.phase !== phase) this.game.ui?.updateHotbar?.();
    this.lastPhase = phase;
    this.render();
  }

  render() {
    // A panel that needs the mouse gets it: a locked pointer would send the click into the game instead.
    if (this.isModalOpen() && typeof document !== 'undefined' && document.pointerLockElement) {
      try { document.exitPointerLock(); } catch { /* nothing held */ }
    }
    this.ui?.render(this.state, {
      isHost: this.isHost, myId: this.myId,
      startCheck: this.isHost && this.match ? this.match.canStart(HOST_ID) : null,
      mapName: this.arena?.name ?? '',
      error: this.error,
    });
  }

  /** What every player sees and hears when something happens. */
  showEvent(event) {
    const sounds = this.game.sounds;
    if (event.kind === 'countdown') {
      this.ui?.title(String(event.seconds), event.seconds === 3 ? 'The cages open in…' : '', 0.9);
      sounds?.playTone?.(660, 0.12);
    } else if (event.kind === 'start') {
      this.ui?.title('Fight!', 'Loot your chests. Last one alive wins.', 1.6);
      sounds?.playTone?.(990, 0.3);
    } else if (event.kind === 'death') {
      this.game.ui?.addChatMessage?.(event.message, 'system');
      if (event.id === this.myId) this.ui?.title('You died!', 'You are now watching.', 2);
      else if (event.killer === this.myId) sounds?.playTone?.(1320, 0.1);
    } else if (event.kind === 'refill') {
      this.game.ui?.addChatMessage?.(event.refill >= 2 ? 'All chests have been refilled, with ender pearls!' : 'All chests have been refilled!', 'system');
      sounds?.playChestOpen?.();
    } else if (event.kind === 'end') {
      const winner = this.state?.players?.find((p) => p.id === event.winner) ?? null;
      const mine = event.winner && event.winner === this.myId;
      this.ui?.title(mine ? 'Victory!' : winner ? `${winner.name} won!` : 'Draw', event.reason === 'time' ? 'Time ran out.' : '', 3);
      this.game.ui?.addChatMessage?.(winner ? `${winner.name} won SkyWars!` : 'SkyWars ended in a draw.', 'system');
      if (mine) this.game.entities?.launchTournamentFireworks?.();
      try { document.exitPointerLock?.(); } catch { /* none held */ }
    } else if (event.kind === 'cancelled') {
      this.game.ui?.addChatMessage?.('Not enough players: back to the lobby.', 'system');
    }
  }

  // --- the islands ------------------------------------------------------------------------------------------

  /**
   * Write the arena: everything that differs from it, rebuilt where it changed. `also` is a further box to clear (the
   * previous map's); `clearChests` empties every chest, here only, as each browser does the same.
   */
  restoreArena({ also = null, clearChests = false } = {}) {
    const world = this.game.world;
    if (!world) return 0;
    const changes = arenaDifferences(this.arena, (x, y, z) => world.getVoxel(x, y, z), also);
    this.writeBlocks(changes);
    for (const c of this.arena.chests) {
      if (clearChests || !this.game.chestManager?.getChest?.(c.x, c.y, c.z)) this.game.chestManager?.setChestItems?.(c.x, c.y, c.z, [], { silent: true, facing: c.facing });
    }
    return changes.length;
  }

  /** Build another map in place of this one: its islands, with the old one's cleared away and its chests forgotten. */
  switchArena(map) {
    const old = this.arenaKey ? this.arena : null;
    this.arena = buildArena(map);
    this.arenaKey = mapKey(map);
    const chests = this.game.chestManager?.chests;
    if (old && chests) for (const c of old.chests) chests.delete(`${c.x},${c.y},${c.z}`);
    return this.restoreArena({ also: old?.bounds ?? null, clearChests: true });
  }

  writeBlocks(changes) {
    const world = this.game.world;
    const touched = new Set();
    for (const [x, y, z, block] of changes) {
      world.setVoxel(x, y, z, block);
      touched.add(`${Math.floor(x / 16)},${Math.floor(z / 16)}`);
      // A cell on a chunk edge also changes the face its neighbour draws.
      if ((x & 15) === 0) touched.add(`${Math.floor(x / 16) - 1},${Math.floor(z / 16)}`);
      if ((x & 15) === 15) touched.add(`${Math.floor(x / 16) + 1},${Math.floor(z / 16)}`);
      if ((z & 15) === 0) touched.add(`${Math.floor(x / 16)},${Math.floor(z / 16) - 1}`);
      if ((z & 15) === 15) touched.add(`${Math.floor(x / 16)},${Math.floor(z / 16) + 1}`);
    }
    for (const key of touched) {
      const [cx, cz] = key.split(',').map(Number);
      const chunk = world.getChunk?.(cx, cz);
      if (chunk) this.game.rebuildChunkMesh?.(chunk);
    }
  }

  /** The cages open for everyone at once, so this is done here rather than sent as hundreds of block changes. */
  openCages(me) {
    const changes = [];
    for (const [x, y, z] of allCageCells(this.arena)) changes.push([x, y, z, BLOCKS.AIR]);
    this.writeBlocks(changes);
    const p = this.game.player;
    if (me?.alive && p) {
      p.setGameMode('survival');
      this.game.ui?.updateStats?.();
    }
  }

  // --- this player -----------------------------------------------------------------------------------------

  enterCage(slot) {
    const p = this.game.player;
    if (!p) return;
    const spot = this.arena.spawns[slot];
    p.isDead = false;
    p.setGameMode('adventure');
    p.position.set(spot.x, spot.y, spot.z);
    p.velocity?.set(0, 0, 0);
    p.yaw = spot.yaw;
    p.pitch = 0;
    p.fallDistance = 0;
    p.health = p.maxHealth ?? 20;
    p.hunger = 20;
    if (p._hungerState) { p._hungerState.hunger = 20; p._hungerState.saturation = 5; }
    p.statusEffects?.clear?.();
    p.isOnFire = false; p.fireTicks = 0;
    // "Players start empty-handed": everything comes from the chests.
    this.game.inventory?.clearCarried?.();
    p.deathDropsDone = false;
    if (typeof document !== 'undefined') document.getElementById('death-overlay')?.classList.add('hidden');
    this.game.ui?.updateHotbar?.();
    this.game.ui?.updateStats?.();
  }

  becomeSpectator() {
    const p = this.game.player;
    if (!p) return;
    p.isDead = false;
    p.health = p.maxHealth ?? 20;
    p.setGameMode('spectator');
    const spot = this.arena.spectator;
    p.position.set(spot.x, spot.y, spot.z);
    p.velocity?.set(0, 0, 0);
    p.fallDistance = 0;
    if (typeof document !== 'undefined') document.getElementById('death-overlay')?.classList.add('hidden');
    this.game.ui?.updateStats?.();
  }

  /** This player died in the match: their loot drops for the others, and they watch. */
  onLocalDeath() {
    if (!this.active) return false;
    const p = this.game.player;
    const me = this.me();
    // Before the match nothing is lost: back into the cage.
    if ((this.phase === 'lobby' || this.phase === 'countdown') && me?.slot !== null && me?.slot !== undefined) {
      this.enterCage(me.slot);
      return true;
    }
    if (this.phase === 'playing' && me?.alive) {
      const items = collectDeathDrops(this.game.inventory).map(({ item }) => ({ ...item }));
      this.game.inventory?.clearCarried?.();
      this.game.ui?.updateHotbar?.();
      const at = { x: p.position.x, y: p.position.y, z: p.position.z };
      const cause = this.lastDamageType === 'player' ? 'player' : this.lastDamageType === 'fall' ? 'fall' : p.position.y < ARENA.voidY ? 'void' : 'other';
      this.report(cause, at, items);
    }
    this.becomeSpectator();
    return true;
  }

  report(cause, at, items = []) {
    if (this.isHost) {
      if (items.length) this.dropFor(HOST_ID, { ...at, items });
      this.match?.eliminate(HOST_ID, cause);
      this.publish();
    } else {
      if (items.length) this.session?.sendGame?.({ type: 'drop_items', ...at, items });
      this.session?.sendGame?.({ type: 'died', cause });
    }
  }

  // --- shared drops -----------------------------------------------------------------------------------------

  spawnDrops(drops) {
    const entities = this.game.entities;
    if (!entities?.spawnDroppedItem) return;
    for (const drop of drops) {
      if (this.drops.has(drop.id) || !drop.item) continue;
      const entry = entities.spawnDroppedItem(new THREE.Vector3(drop.x, drop.y, drop.z), drop.item.id, drop.item.isBlock, drop.item.count, {
        ...(drop.item.enchantments ? { enchantments: drop.item.enchantments } : {}),
        ...(Number.isFinite(drop.item.durability) ? { durability: drop.item.durability } : {}),
      });
      if (!entry) continue;
      entry.claim = () => {
        if (this.isHost) this.grantClaim(HOST_ID, drop.id);
        else this.session?.sendGame?.({ type: 'claim', id: drop.id });
      };
      this.drops.set(drop.id, { entry, item: drop.item });
    }
  }

  taken({ id, by, item }) {
    const known = this.drops.get(id);
    if (known) { this.removeDropVisual(known.entry); this.drops.delete(id); }
    if (by !== this.myId || !item) return;
    const inventory = this.game.inventory;
    for (let n = 0; n < item.count; n++) inventory?.addItem?.(item.id, item.isBlock, 1, item.enchantments ?? null);
    this.game.sounds?.playClick?.();
    this.game.ui?.updateHotbar?.();
  }

  removeDropVisual(entry) {
    const entities = this.game.entities;
    if (!entities || !entry) return;
    const index = entities.droppedItems?.indexOf(entry) ?? -1;
    if (index >= 0) entities.droppedItems.splice(index, 1);
    entities.itemVisuals?.release?.(entry.group);
  }

  // --- every frame ------------------------------------------------------------------------------------------

  update(dt) {
    if (!this.active) return;
    const p = this.game.player;
    const phase = this.phase;
    const me = this.me();
    // Waiting players stay in their cages, whatever moved them (the join places a guest beside the host first).
    if ((phase === 'lobby' || phase === 'countdown') && me?.slot !== null && me?.slot !== undefined && p) {
      const spot = this.arena.spawns[me.slot];
      if (Math.hypot(p.position.x - spot.x, p.position.z - spot.z) > 1.2 || Math.abs(p.position.y - spot.y) > 2.5) {
        p.position.set(spot.x, spot.y, spot.z);
        p.velocity?.set(0, 0, 0);
        p.fallDistance = 0;
        if (p.gamemode !== 'adventure') p.setGameMode('adventure');
      }
    }
    // Into the void: out at once, as SkyWars servers do (the vanilla void only starts hurting 64 blocks under the world).
    if (phase === 'playing' && me?.alive && p && p.position.y < ARENA.voidY && !this.reportedVoid) {
      this.reportedVoid = true;
      // What a player carries into the void is lost with them: nothing drops where anyone could reach it.
      this.game.inventory?.clearCarried?.();
      this.game.ui?.updateHotbar?.();
      this.report('void', { x: p.position.x, y: p.position.y, z: p.position.z });
      this.becomeSpectator();
    }
    if (phase !== 'playing') this.reportedVoid = false;
    if (!this.match) return;
    // Host: the rules' clock, and the void for everyone by the positions their browsers send.
    this.match.update(dt);
    if (this.match.phase === 'playing') {
      for (const player of this.match.alive()) {
        const pos = player.id === HOST_ID ? null : this.session?.positions?.get(player.id);
        if (pos && pos.y < ARENA.voidY) this.match.eliminate(player.id, 'void');
      }
    }
    this.publishTimer += dt;
    if (this.match.events.length || this.publishTimer >= 1) {
      this.publishTimer = 0;
      this.publish();
    }
  }

  /** Whether the panels need the mouse, which keeps the game from taking it. */
  isModalOpen() {
    return Boolean(this.active && this.ui?.needsPointer(this.state, this.isHost));
  }
}
