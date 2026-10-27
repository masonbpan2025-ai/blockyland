// Bed Wars in the running game. As in SkyWars (../skywars/client.js, whose shape this follows), the host's browser runs
// the match (rules.js) and tells everyone what happens through the shared world's game channel; each browser does its
// own part: its player's spawn, inventory, shopping and respawns, the beds, generators and shopkeepers it draws, and the
// map, which every browser builds alike from { teams, theme, seed } (arena.js).
//
// Who decides what:
//   - the host: the clock, the generators' piles and who picks them up, deaths and respawns, beds, team upgrades and
//     traps, kill credit, and every hit between players (shareSession attackPolicy: no friendly fire);
//   - each player: their own inventory -- what they buy, what they carry -- reported to the host when it matters (what
//     they carried when they died goes to their killer).
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from '../../blocks.js';
import { ARENA, buildArena, normalizeMap, mapKey, isMapBlock, arenaDifferences, DEFAULT_MAP } from './arena.js';
import { BedWarsMatch, HOST_ID, PICKUP_REACH, SPLIT_REACH, RESOURCES } from './rules.js';
import { teamById } from './teams.js';
import {
  ITEM_SHOP, UPGRADES, TRAPS, RESOURCE_ITEMS, priceGroup, upgradeCost, trapCost, buy, newKit, afterDeath,
  armorFor, loadoutFor, enchantsFor, resourcesOf, canAfford, pay,
} from './shop.js';
import { EXPLOSIONS, explosionCells, explosionOn } from './explosions.js';
import { GeneratorView, textSprite, primedTntMesh, fireballMesh } from './visuals.js';
import { createBedWarsUi } from './ui.js';
import { rememberAttachment } from '../../wallAttached.js';

const GUEST_MESSAGES = new Set(['died', 'bed', 'collect', 'upgrade', 'trap', 'team', 'milk', 'boom', 'tnt']);
/** Hypixel's potion strengths and lengths, applied when one of the shop's potions is drunk. */
export const SHOP_POTIONS = Object.freeze({ speed: ['speed', 2, 45], jump: ['jump_boost', 5, 45], invis: ['invisibility', 1, 30] });
export const MILK_SECONDS = 30;
export const BEDWARS_TIME = 6000;

export class BedWarsManager {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.arena = buildArena(DEFAULT_MAP);
    this.arenaKey = null;
  }

  get sync() { return this.game.worldSync; }
  get session() { return this.game.worldSync?.client; }
  get isHost() { return !this.sync?.isJoined; }
  get myId() { return this.isHost ? HOST_ID : this.session?.clientId; }
  get phase() { return this.state?.phase ?? 'lobby'; }
  me() { return this.state?.players?.find((p) => p.id === this.myId) ?? null; }
  myTeam() { const me = this.me(); return me?.team ? this.state.teams.find((t) => t.id === me.team) ?? null : null; }
  myBase() { const me = this.me(); return me?.team ? this.arena.bases.find((b) => b.team === me.team) ?? null : null; }
  get group() { return priceGroup(this.state?.mode ?? 'fours'); }

  // --- the world opening and closing ------------------------------------------------------------------------

  activate() {
    this.deactivate();
    this.active = true;
    this.state = null;
    this.round = 0;
    this.arenaKey = null;
    this.placedRound = 0;
    this.offs = [];
    this.publishTimer = 0;
    this.collectTimer = 0;
    this.tickTimer = 0;
    this.kit = newKit();
    this.npcs = [];
    this.genViews = new Map();
    this.tnts = [];
    this.fireballs = [];
    this.eggs = [];
    this.milkUntil = new Map();
    this.waitingRespawn = false;
    this.error = null;
    const game = this.game;
    this.savedRules = { doDaylightCycle: game.gamerules?.doDaylightCycle ?? true, doMobSpawning: game.gamerules?.doMobSpawning ?? true };
    game.gamerules = { ...(game.gamerules ?? {}), doDaylightCycle: false, doMobSpawning: false };
    this.holdMidday();
    this.ui = createBedWarsUi(this);
    if (this.isHost) this.startHosting();
    else this.listenAsGuest();
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;
    for (const off of this.offs ?? []) { try { off(); } catch { /* gone */ } }
    this.offs = [];
    if (this.session && this.session.attackPolicy) this.session.attackPolicy = null;
    this.removeNpcs();
    for (const view of this.genViews?.values() ?? []) view.dispose();
    this.genViews?.clear();
    for (const t of this.tnts ?? []) t.mesh.userData.release?.();
    for (const f of [...(this.fireballs ?? []), ...(this.eggs ?? [])]) { f.mesh.removeFromParent(); f.mesh.traverse((c) => { c.geometry?.dispose(); c.material?.dispose(); }); }
    this.tnts = []; this.fireballs = []; this.eggs = [];
    this.ui?.dispose();
    this.ui = null;
    this.match = null;
    this.state = null;
    const game = this.game;
    if (game.gamerules && this.savedRules) Object.assign(game.gamerules, this.savedRules);
  }

  holdMidday() {
    const game = this.game;
    if (game.worldTime !== BEDWARS_TIME) { game.worldTime = BEDWARS_TIME; game.sky?.setTime?.(BEDWARS_TIME); }
  }

  on(event, handler) {
    const off = this.session?.on?.(event, handler);
    if (typeof off === 'function') this.offs.push(off);
  }

  // --- host -------------------------------------------------------------------------------------------------

  async startHosting() {
    this.match = new BedWarsMatch({ seed: Math.floor(Math.random() * 0xffffffff) });
    this.match.join(HOST_ID, this.sync?.playerName?.() ?? 'Host');
    this.applyState(this.match.snapshot());
    try {
      const shared = await this.sync.hostWorld({ quiet: true, pvp: true });
      if (!this.active) return;
      this.code = shared?.roomId ?? null;
      this.ui?.setCode(this.code);
      const me = this.match.players.get(HOST_ID);
      if (me && this.session?.playerName) me.name = this.session.playerName;
    } catch (error) {
      this.error = `Could not open the lobby: ${error?.message ?? error}`;
    }
    if (!this.active) return;
    if (this.session) this.session.attackPolicy = (attacker, target) => this.match?.canAttack(attacker, target) ?? null;
    this.on('peer_joined', ({ peerId, peerName }) => { this.match.join(peerId, peerName); this.publish(); });
    this.on('peer_left', ({ peerId }) => { this.match.leave(peerId); this.publish(); });
    this.on('attack_landed', ({ attackerId, targetId }) => this.match.hit(attackerId, targetId));
    this.on('game', ({ peerId, data }) => this.fromGuest(peerId, data));
    this.publish();
  }

  /** What a guest may ask of the host; anything else is ignored. */
  fromGuest(peerId, data) {
    if (!this.match || !GUEST_MESSAGES.has(data?.type)) return;
    this.hostHandles(peerId, data);
    this.publish();
  }

  /** The host acts on a player's request -- its own too (`by` is HOST_ID). */
  hostHandles(by, data) {
    const m = this.match;
    switch (data.type) {
      case 'died': m.died(by, ['void', 'fall', 'player', 'arrow', 'explosion', 'other'].includes(data.cause) ? data.cause : 'other', data.resources ?? {}); break;
      case 'bed': m.bedBroken(String(data.team ?? ''), by); break;
      case 'collect': this.hostCollect(by, String(data.gen ?? '')); break;
      case 'upgrade': m.buyUpgrade(by, String(data.key ?? '')); break;
      case 'trap': m.buyTrap(by, String(data.trap ?? '')); break;
      case 'team': if (m.chooseTeam(by, String(data.team ?? ''))) m.emit({ kind: 'team_change', id: by }); break;
      case 'milk': this.milkUntil.set(by, m.elapsed + MILK_SECONDS); break;
      case 'boom': this.hostBoom(by, data); break;
      case 'tnt': this.hostRelay({ type: 'tnt', by, x: Number(data.x), y: Number(data.y), z: Number(data.z) }); break;
      default: break;
    }
  }

  /** Where the host last saw a player: its own player, or a guest's last position. */
  positionOf(id) {
    if (id === HOST_ID) { const p = this.game.player?.position; return p ? { x: p.x, y: p.y, z: p.z } : null; }
    return this.session?.positions?.get(id) ?? null;
  }

  hostCollect(by, genId) {
    const at = this.genPosition(genId);
    const pos = this.positionOf(by);
    // Only from where the player stands, as the host sees it: a little slack for positions a few updates old.
    if (!at || !pos || Math.hypot(pos.x - at.x, pos.z - at.z) > PICKUP_REACH + 1.5 || Math.abs(pos.y - at.y) > 3) return;
    const near = (id) => { const q = this.positionOf(id); return Boolean(q && Math.hypot(q.x - at.x, q.z - at.z) <= SPLIT_REACH && Math.abs(q.y - at.y) <= 3); };
    for (const grant of this.match.collect(by, genId, near)) this.match.emit({ kind: 'grant', id: grant.id, items: grant.items, pickup: true });
  }

  /** An explosion someone set off: everyone feels it, and the host credits the hits. */
  hostBoom(by, data) {
    const kind = data.kind === 'fireball' ? 'fireball' : 'tnt';
    const center = { x: Number(data.x), y: Number(data.y), z: Number(data.z) };
    if (![center.x, center.y, center.z].every(Number.isFinite)) return;
    for (const p of this.match.players.values()) {
      const pos = this.positionOf(p.id);
      if (p.id !== by && pos && Math.hypot(pos.x - center.x, pos.y + 0.9 - center.y, pos.z - center.z) <= EXPLOSIONS[kind].radius + 1) this.match.hit(by, p.id);
    }
    this.hostRelay({ type: 'boom', by, kind, ...center });
  }

  /** A message every browser acts on, the host's own included. */
  hostRelay(message) {
    this.session?.sendGame?.(message);
    this.fromHost(message);
  }

  chooseMode(mode) { if (this.isHost && this.match?.setMode(HOST_ID, mode)) this.publish(); }
  choosePace(pace) { if (this.isHost && this.match?.setPace(HOST_ID, pace)) this.publish(); }
  chooseTheme(theme) { if (this.isHost && this.match?.setTheme(HOST_ID, theme)) this.publish(); }
  chooseTeam(team) { this.ask({ type: 'team', team }); }

  requestStart() {
    if (!this.isHost || !this.match) return;
    const result = this.match.start(HOST_ID);
    if (!result.ok) { this.error = result.reason; this.render(); return; }
    this.error = null;
    try { (this.game.renderer?.domElement ?? null)?.requestPointerLock?.(); } catch { /* not allowed now */ }
    this.publish();
  }

  requestReset() { if (this.isHost && this.match?.reset(HOST_ID)) this.publish(); }

  /** A request to the host: sent by a guest, handled at once by the host. */
  ask(data) {
    if (this.isHost) { if (this.match) { this.hostHandles(HOST_ID, data); this.publish(); } }
    else this.session?.sendGame?.(data);
  }

  publish() {
    if (!this.match) return;
    for (const event of this.match.drainEvents()) {
      this.session?.sendGame?.({ type: 'event', event });
      this.showEvent(event);
    }
    const state = this.match.snapshot();
    this.session?.sendGame?.(state);
    this.applyState(state);
  }

  // --- guest ------------------------------------------------------------------------------------------------

  listenAsGuest() { this.on('game', ({ data }) => this.fromHost(data)); }

  fromHost(data) {
    if (data?.type === 'state') this.applyState(data);
    else if (data?.type === 'event' && data.event) this.showEvent(data.event);
    else if (data?.type === 'boom') this.feelBoom(data);
    else if (data?.type === 'tnt' && data.by !== this.myId) this.showTnt(data, false);
  }

  // --- everyone: the state -----------------------------------------------------------------------------------

  applyState(state) {
    if (!this.active || !state) return;
    const previous = this.state;
    this.state = state;
    const map = normalizeMap(state.map ?? DEFAULT_MAP);
    if (mapKey(map) !== this.arenaKey) this.switchArena(map);
    else if (state.round !== this.round && this.round !== 0) this.restoreArena();
    if (state.round !== this.round) { this.round = state.round; this.placedRound = 0; this.kit = newKit(); }
    const me = this.me();
    const phase = state.phase;
    if ((phase === 'lobby' || phase === 'countdown') && this.placedRound !== state.round) {
      this.enterLobby();
      this.placedRound = state.round;
    }
    if (phase === 'playing' && previous?.phase !== 'playing') {
      this.restoreArena();
      this.spawnNpcs();
      if (me?.alive) this.spawnAtBase({ fresh: true });
      else this.becomeSpectator();
    }
    if (phase === 'playing' || phase === 'ended') {
      this.enforceBeds();
      if (me && !me.alive && this.game.player?.gamemode !== 'spectator') this.becomeSpectator();
    }
    if (phase !== 'playing') this.removeNpcs();
    // Generators drawn from the host's piles.
    this.syncGenerators(phase === 'playing' ? state.gens : []);
    // Those out, or dead and waiting, are not seen.
    for (const [id, peer] of this.sync?.remotePlayers?.remotePlayers ?? []) {
      const p = state.players.find((q) => q.id === id);
      const hidden = (phase === 'playing' || phase === 'ended') && p && (!p.alive || p.dead);
      if (peer.avatar?.mesh) peer.avatar.mesh.visible = !hidden;
    }
    if (me?.dead && me.respawnIn !== null && phase === 'playing') this.ui?.title('YOU DIED!', `You will respawn in ${me.respawnIn} second${me.respawnIn === 1 ? '' : 's'}!`, 1.2, '#ff5555');
    this.render();
  }

  render() {
    if (this.isModalOpen() && typeof document !== 'undefined' && document.pointerLockElement) {
      try { document.exitPointerLock(); } catch { /* none held */ }
    }
    this.ui?.render(this.state, {
      isHost: this.isHost, myId: this.myId, error: this.error, mapName: this.arena?.name ?? '',
      startCheck: this.isHost && this.match ? this.match.canStart(HOST_ID) : null,
    });
  }

  showEvent(event) {
    const ui = this.game.ui, sounds = this.game.sounds, mine = (id) => id === this.myId;
    const chat = (text) => ui?.addChatMessage?.(text, 'system');
    switch (event.kind) {
      case 'countdown': this.ui?.title(String(event.seconds), event.seconds === 5 ? 'The game starts in…' : '', 0.9, '#ffff55'); sounds?.playTone?.(660, 0.12); break;
      case 'start':
        this.ui?.title('BED WARS', 'Protect your bed and destroy the enemy beds.', 3, '#ff5555');
        chat('Bed Wars: protect your bed and destroy the enemy beds. Upgrade yourself and your team by collecting iron, gold, emeralds and diamonds from the generators to access powerful upgrades.');
        sounds?.playTone?.(990, 0.3);
        break;
      case 'death':
        chat(event.message);
        if (mine(event.id) && event.final) this.ui?.title('YOU DIED!', 'You are now a spectator.', 3, '#ff5555');
        if (mine(event.killer)) sounds?.playTone?.(event.final ? 1500 : 1320, 0.1);
        break;
      case 'respawn': if (mine(event.id)) this.spawnAtBase({ fresh: false }); break;
      case 'grant': if (mine(event.id)) this.receive(event.items, event.from); break;
      case 'bed': {
        chat(event.message);
        this.removeBed(event.team);
        const myTeam = this.me()?.team;
        if (event.team === myTeam) { this.ui?.title('BED DESTROYED!', 'You will no longer respawn!', 3, '#ff5555'); sounds?.playExplosion?.(); }
        else sounds?.playTone?.(400, 0.25);
        break;
      }
      case 'bed_gone': chat(event.message); for (const b of this.arena.bases) this.removeBed(b.team); this.ui?.title('BED DESTRUCTION', 'All beds have been destroyed!', 3, '#ff5555'); break;
      case 'tier': chat(event.message); break;
      case 'sudden_death': chat(event.message); this.ui?.title('SUDDEN DEATH', '', 2.5, '#ff5555'); break;
      case 'team_out': chat(event.message); break;
      case 'upgrade': {
        const def = UPGRADES[event.key];
        if (mine(event.by)) { pay(this.game.inventory, { diamond: event.cost ?? 0 }); this.game.ui?.updateHotbar?.(); }
        if (event.team === this.me()?.team) chat(`${this.nameOf(event.by)} purchased ${def?.levels?.[event.level - 1] ?? def?.name}${def?.max > 1 && !def?.levels ? ` ${['I', 'II', 'III', 'IV'][event.level - 1]}` : ''}`);
        this.applyUpgrades();
        break;
      }
      case 'trap_bought':
        if (mine(event.by)) { pay(this.game.inventory, { diamond: event.cost ?? 0 }); this.game.ui?.updateHotbar?.(); }
        if (event.team === this.me()?.team) chat(`${this.nameOf(event.by)} purchased ${TRAPS[event.trap]?.name}`);
        break;
      case 'trap': this.trapFired(event); break;
      case 'end': {
        const winner = teamById(event.winner);
        const won = winner && this.me()?.team === winner.id;
        this.ui?.title(won ? 'VICTORY!' : winner ? 'GAME OVER!' : 'DRAW', winner ? `${winner.name} Team wins!` : 'Time ran out.', 4, won ? '#ffaa00' : '#ff5555');
        chat(winner ? `${winner.name} Team won Bed Wars!` : 'Bed Wars ended in a draw.');
        if (won) this.game.entities?.launchTournamentFireworks?.();
        try { document.exitPointerLock?.(); } catch { /* none held */ }
        break;
      }
      case 'cancelled': chat('Not enough players: back to the lobby.'); break;
      default: break;
    }
  }

  nameOf(id) { return this.state?.players?.find((p) => p.id === id)?.name ?? 'Someone'; }

  // --- the map --------------------------------------------------------------------------------------------------

  switchArena(map) {
    const old = this.arenaKey ? this.arena : null;
    this.arena = buildArena(map);
    this.arenaKey = mapKey(map);
    const chests = this.game.chestManager?.chests;
    if (old && chests) for (const b of old.bases) chests.delete(`${b.chest.x},${b.chest.y},${b.chest.z}`);
    for (const view of this.genViews.values()) view.dispose();
    this.genViews.clear();
    this.removeNpcs();
    this.restoreArena(old?.bounds ?? null);
  }

  /** Write the map back as built: every placed block gone, every bed back, every chest empty. */
  restoreArena(also = null) {
    const world = this.game.world;
    if (!world) return 0;
    const changes = arenaDifferences(this.arena, (x, y, z) => world.getVoxel(x, y, z), also);
    this.writeBlocks(changes);
    for (const b of this.arena.bases) {
      this.game.chestManager?.setChestItems?.(b.chest.x, b.chest.y, b.chest.z, [], { silent: true, facing: b.chest.facing });
      this.game.bedManager?.registerBed?.(b.bed.foot, b.bed.head, b.bed.dir, b.bed.colour);
    }
    return changes.length;
  }

  writeBlocks(changes) {
    const world = this.game.world;
    if (!world) return;
    const touched = new Set();
    for (const [x, y, z, block] of changes) {
      world.setVoxel(x, y, z, block);
      touched.add(`${Math.floor(x / 16)},${Math.floor(z / 16)}`);
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

  baseOf(teamId) { return this.arena.bases.find((b) => b.team === teamId) ?? null; }

  /** Whose bed a cell is, or null. */
  bedAt(x, y, z) {
    for (const b of this.arena.bases) {
      for (const [bx, by, bz] of [b.bed.foot, b.bed.head]) if (bx === x && by === y && bz === z) return b.team;
    }
    return null;
  }

  removeBed(teamId) {
    const base = this.baseOf(teamId);
    if (!base) return;
    const world = this.game.world;
    const changes = [base.bed.foot, base.bed.head].filter(([x, y, z]) => world?.getVoxel(x, y, z) !== BLOCKS.AIR).map(([x, y, z]) => [x, y, z, BLOCKS.AIR]);
    if (changes.length) this.writeBlocks(changes);
    this.game.bedManager?.beds?.delete?.(`${base.bed.foot.join(',')}`);
    this.game.bedManager?.beds?.delete?.(`${base.bed.head.join(',')}`);
  }

  /** Each bed as the host says: gone where it was broken, back where a break was refused. */
  enforceBeds() {
    const world = this.game.world;
    if (!world || !this.state?.teams) return;
    for (const team of this.state.teams) {
      const base = this.baseOf(team.id);
      if (!base) continue;
      const t = teamById(team.id);
      if (!team.bed) { this.removeBed(team.id); continue; }
      const want = [[...base.bed.foot, t.bedFoot], [...base.bed.head, t.bedHead]].filter(([x, y, z, id]) => world.getVoxel(x, y, z) !== id);
      if (want.length) { this.writeBlocks(want); this.game.bedManager?.registerBed?.(base.bed.foot, base.bed.head, base.bed.dir, base.bed.colour); }
    }
  }

  // --- shopkeepers ------------------------------------------------------------------------------------------

  spawnNpcs() {
    this.removeNpcs();
    const mobs = this.game.mobs;
    if (!mobs?.spawnMob) return;
    for (const base of this.arena.bases) {
      if (!this.state?.teams?.some((t) => t.id === base.team)) continue;
      for (const [spot, kind, title] of [[base.shop, 'items', 'ITEM SHOP'], [base.upgrades, 'upgrades', 'TEAM UPGRADES']]) {
        const mob = mobs.spawnMob('villager', spot.x, spot.y, spot.z, { persistent: true });
        if (!mob) continue;
        Object.assign(mob, { frozen: true, invulnerable: true, persistent: true, bedwarsShop: kind, noDespawn: true });
        if (mob.mesh) {
          mob.mesh.position.set(spot.x, spot.y, spot.z);
          mob.mesh.rotation.y = spot.yaw;
          mob.yaw = spot.yaw;
          const label = textSprite([[title, '#55ffff'], ['RIGHT CLICK', '#ffff55']], { scale: 0.8 });
          label.position.y = 2.55;
          mob.mesh.add(label);
          mob.bedwarsLabel = label;
        }
        this.npcs.push(mob);
      }
    }
  }

  removeNpcs() {
    const mobs = this.game.mobs;
    for (const mob of this.npcs ?? []) {
      mob.bedwarsLabel?.material?.map?.dispose();
      mob.bedwarsLabel?.removeFromParent();
      const i = mobs?.mobs?.indexOf(mob) ?? -1;
      if (i >= 0) mobs.mobs.splice(i, 1);
      mob.mesh?.removeFromParent();
    }
    this.npcs = [];
  }

  // --- generators -------------------------------------------------------------------------------------------

  /** Where a generator is: a team's forge, a diamond or an emerald generator. */
  genPosition(genId) {
    if (genId.startsWith('f-')) return this.baseOf(genId.slice(2))?.forge ?? null;
    return [...this.arena.diamonds, ...this.arena.emeralds].find((g) => g.id === genId) ?? null;
  }

  syncGenerators(gens = []) {
    const live = new Set();
    for (const gen of gens) {
      const at = this.genPosition(gen.id);
      if (!at) continue;
      live.add(gen.id);
      let view = this.genViews.get(gen.id);
      if (!view) { view = new GeneratorView(this.game, { id: gen.id, kind: gen.kind, x: at.x, y: at.y, z: at.z }); this.genViews.set(gen.id, view); }
      view.state = gen;
    }
    for (const [id, view] of this.genViews) if (!live.has(id)) { view.dispose(); this.genViews.delete(id); }
  }

  /** Iron, gold, diamonds and emeralds into the inventory. */
  receive(items = {}, from = null) {
    const inv = this.game.inventory;
    if (!inv) return;
    for (const r of RESOURCES) if (items[r] > 0) inv.addItem(RESOURCE_ITEMS[r], false, Math.min(items[r], 2304));
    if (from) {
      const got = RESOURCES.filter((r) => items[r] > 0).map((r) => `+${items[r]} ${r === 'iron' ? 'Iron' : r === 'gold' ? 'Gold' : r === 'diamond' ? 'Diamond' : 'Emerald'}`);
      if (got.length) this.game.ui?.addChatMessage?.(`${got.join(', ')} (from ${from})`, 'system');
    }
    this.game.sounds?.playPickup?.() ?? this.game.sounds?.playClick?.();
    this.game.ui?.updateHotbar?.();
  }

  // --- this player --------------------------------------------------------------------------------------------

  heal(p) {
    p.isDead = false;
    p.health = p.maxHealth ?? 20;
    p.hunger = 20;
    if (p._hungerState) { p._hungerState.hunger = 20; p._hungerState.saturation = 5; }
    p.statusEffects?.clear?.();
    p.isOnFire = false; p.fireTicks = 0;
    p.velocity?.set?.(0, 0, 0);
    p.fallDistance = 0;
    p.deathDropsDone = false;
    if (typeof document !== 'undefined') document.getElementById('death-overlay')?.classList.add('hidden');
  }

  /** Before the game: in the glass room above the middle, empty-handed. */
  enterLobby() {
    const p = this.game.player;
    if (!p) return;
    this.heal(p);
    p.setGameMode?.('adventure');
    const at = this.arena.lobby;
    p.position.set(at.x, at.y, at.z);
    p.yaw = 0; p.pitch = 0;
    this.game.inventory?.clearCarried?.();
    this.game.ui?.updateHotbar?.();
    this.game.ui?.updateStats?.();
  }

  /** At the team's spawn, with the loadout: on the first spawn a fresh kit, after a death what the kit kept. */
  spawnAtBase({ fresh = false } = {}) {
    const p = this.game.player;
    const base = this.myBase();
    if (!p || !base) return;
    if (fresh) this.kit = newKit();
    this.waitingRespawn = false;
    this.heal(p);
    p.setGameMode?.('survival');
    p.position.set(base.spawn.x, base.spawn.y, base.spawn.z);
    p.yaw = base.spawn.yaw; p.pitch = 0;
    const inv = this.game.inventory;
    if (inv) {
      inv.clearCarried?.();
      for (const item of loadoutFor(this.kit, this.myTeam()?.upgrades)) inv.addItem({ ...item });
      Object.assign(inv.armor, armorFor(this.kit, this.myTeam()?.upgrades));
    }
    this.game.ui?.updateHotbar?.();
    this.game.ui?.updateStats?.();
  }

  becomeSpectator() {
    const p = this.game.player;
    if (!p) return;
    this.heal(p);
    p.setGameMode?.('spectator');
    const at = this.arena.spectator;
    p.position.set(at.x, at.y, at.z);
    this.game.ui?.updateStats?.();
  }

  /** The player died: what they carried of resources goes to their killer; the kit drops a tool tier; they wait. */
  onLocalDeath() {
    if (!this.active) return false;
    const p = this.game.player;
    const me = this.me();
    if (this.phase !== 'playing' || !me?.team) { this.enterLobby(); return true; }
    if (me.alive && !me.dead && !this.waitingRespawn) {
      const inv = this.game.inventory;
      const resources = inv ? resourcesOf(inv) : {};
      inv?.clearCarried?.();
      this.game.ui?.updateHotbar?.();
      this.kit = afterDeath(this.kit);
      const cause = p.position.y < ARENA.voidY ? 'void' : ['player', 'arrow', 'fall', 'explosion'].includes(this.lastDamageType) ? this.lastDamageType : 'other';
      this.waitingRespawn = true;
      this.ask({ type: 'died', cause, resources });
    }
    // Waiting to respawn (or out): watching from above the middle.
    this.heal(p);
    p.setGameMode?.('spectator');
    const at = this.arena.spectator;
    p.position.set(at.x, at.y, at.z);
    return true;
  }

  /** The team's upgrades on what the player carries and wears, and their effects (Haste, the Heal Pool). */
  applyUpgrades() {
    const team = this.myTeam(), inv = this.game.inventory, p = this.game.player;
    if (!team || !inv || !p || p.gamemode !== 'survival') return;
    const up = team.upgrades;
    let changed = false;
    for (const list of [inv.hotbar, inv.storage]) {
      for (const stack of list) {
        if (!stack) continue;
        for (const e of enchantsFor(stack.id, up)) {
          if ((stack.enchantments ?? []).some((x) => x.id === e.id && x.level >= e.level)) continue;
          stack.enchantments = [...(stack.enchantments ?? []).filter((x) => x.id !== e.id), e];
          changed = true;
        }
      }
    }
    // The armour is the kit's, with the team's enchantments: put back if it was taken off or changed.
    const wanted = armorFor(this.kit, up);
    for (const slot of ['head', 'chest', 'legs', 'feet']) {
      const worn = inv.armor[slot];
      if (!worn || worn.id !== wanted[slot].id || JSON.stringify(worn.enchantments ?? []) !== JSON.stringify(wanted[slot].enchantments ?? [])) { inv.armor[slot] = wanted[slot]; changed = true; }
    }
    if (up.haste > 0) p.applyStatusEffect?.('haste', 2, up.haste);
    const base = this.myBase();
    if (up.healPool && base && Math.hypot(p.position.x - base.center.x, p.position.z - base.center.z) <= base.radius) p.applyStatusEffect?.('regeneration', 2, 1);
    if (changed) this.game.ui?.updateHotbar?.();
  }

  // --- the shops ------------------------------------------------------------------------------------------------

  shopContext() {
    const me = this.me();
    return { inv: this.game.inventory, kit: this.kit, team: teamById(me?.team), group: this.group, mode: this.state?.mode, enchantSword: enchantsFor('x_sword', this.myTeam()?.upgrades ?? {}) };
  }

  /** Buy from the Item Shop. */
  buyItem(key) {
    const entry = ITEM_SHOP.find((e) => e.key === key);
    if (!entry || this.phase !== 'playing' || !this.me()?.alive) return { ok: false, reason: 'Not now' };
    const result = buy(entry, this.shopContext());
    if (result.ok) {
      if (result.kitChanged) {
        const inv = this.game.inventory;
        // A new tool tier replaces the old one; the kit's armour is worn at once.
        if (entry.kind === 'tool') {
          const prefix = `_${entry.tool}`;
          for (const list of [inv.hotbar, inv.storage]) for (let i = 0; i < list.length; i++) if (list[i] && String(list[i].id).endsWith(prefix)) list[i] = null;
          const def = loadoutFor(this.kit, this.myTeam()?.upgrades).find((s) => String(s.id).endsWith(prefix));
          if (def) inv.addItem({ ...def });
        } else if (entry.kind === 'shears') inv.addItem({ id: 'shears', isBlock: false, count: 1 });
        this.applyUpgrades();
      }
      this.game.sounds?.playClick?.();
      this.game.ui?.addChatMessage?.(`You purchased ${entry.name}`, 'system');
      this.game.ui?.updateHotbar?.();
    } else {
      this.game.sounds?.playTone?.(200, 0.12);
    }
    this.ui?.refreshShop?.();
    return result;
  }

  /** Buy a team upgrade or a trap: the host decides, and the diamonds are paid when it says yes. */
  buyUpgrade(key) {
    const team = this.myTeam();
    const level = (team?.upgrades?.[key] ?? 0) + 1;
    const price = upgradeCost(key, level, this.group);
    if (!team || price === null) return { ok: false, reason: 'Maxed' };
    if (!canAfford(this.game.inventory, { diamond: price })) return { ok: false, reason: 'Not enough diamonds' };
    this.ask({ type: 'upgrade', key });
    return { ok: true };
  }

  buyTrap(trap) {
    const team = this.myTeam();
    const price = trapCost(team?.traps?.length ?? 3);
    if (!team || price === null) return { ok: false, reason: 'Trap queue full' };
    if (!canAfford(this.game.inventory, { diamond: price })) return { ok: false, reason: 'Not enough diamonds' };
    this.ask({ type: 'trap', trap });
    return { ok: true };
  }

  /** A team's trap went off: the intruder suffers it, or the team is helped by it. */
  trapFired(event) {
    const p = this.game.player;
    const me = this.me();
    const trap = TRAPS[event.trap];
    if (event.intruder === this.myId && p) {
      if (event.trap === 'its_a_trap') { p.applyStatusEffect?.('blindness', 8, 1); p.applyStatusEffect?.('slowness', 8, 1); }
      if (event.trap === 'miner') p.applyStatusEffect?.('mining_fatigue', 10, 1);
      if (event.trap === 'alarm') p.statusEffects?.delete?.('invisibility');
      this.ui?.title('', `You set off ${trap?.name ?? 'a trap'}!`, 2);
    }
    if (me?.team === event.team) {
      this.ui?.title('TRAP TRIGGERED!', `${trap?.name ?? 'A trap'} was set off${event.trap === 'alarm' ? ` by ${this.nameOf(event.intruder)}` : ''}!`, 2.5, '#ff5555');
      this.game.sounds?.playTone?.(880, 0.25);
      const base = this.myBase();
      if (event.trap === 'counter' && p && base && Math.hypot(p.position.x - base.center.x, p.position.z - base.center.z) <= base.radius + 6) {
        p.applyStatusEffect?.('speed', 15, 2);
        p.applyStatusEffect?.('jump_boost', 15, 2);
      }
    }
  }

  /** A shop potion: Hypixel's strength and length, in place of vanilla's (main.js finishDrinking calls this). */
  onDrink(item) {
    const spec = SHOP_POTIONS[item?.bedwars];
    const p = this.game.player;
    if (!spec || !p) return;
    const [effect, level, seconds] = spec;
    p.statusEffects?.delete?.(effect);
    p.applyStatusEffect?.(effect, seconds, level);
  }

  // --- the rules of the world -----------------------------------------------------------------------------------

  /** Only blocks players placed, and enemy beds, can be broken -- and only in play, by the living. */
  canBreakBlock(x, y, z) {
    if (!this.active) return undefined;
    const me = this.me();
    if (this.phase !== 'playing' || !me?.alive || me.dead) return false;
    const bed = this.bedAt(x, y, z);
    if (bed) return bed !== me.team;
    return !isMapBlock(this.arena, x, y, z);
  }

  /** A broken enemy bed is reported to the host, which announces it (or puts it back if the break does not count). */
  onBlockBroken(x, y, z) {
    if (!this.active) return;
    const team = this.bedAt(x, y, z);
    if (!team) return;
    this.removeBed(team);
    this.ask({ type: 'bed', team });
  }

  /** Not on a generator or a spawn, not above the build limit, and only in play. */
  canPlaceBlock(x, y, z) {
    if (!this.active) return undefined;
    if (this.phase !== 'playing') return false;
    if (y > ARENA.surfaceY + 20 || y < ARENA.minY) return false;
    const clear = ARENA.keepClear;
    const spots = [...this.arena.bases.flatMap((b) => [b.forge, b.spawn, b.shop, b.upgrades]), ...this.arena.diamonds, ...this.arena.emeralds];
    return !spots.some((s) => Math.abs(x + 0.5 - s.x) <= clear && Math.abs(z + 0.5 - s.z) <= clear && y >= s.y - 1 && y <= s.y + 2);
  }

  /** Right-click: the shopkeepers, beds (no sleeping), and the items that are not what they look like. */
  interact({ mob, block, item }) {
    if (!this.active) return false;
    if (mob?.bedwarsShop) {
      if (this.phase === 'playing' && this.me()?.alive) this.ui?.openShop(mob.bedwarsShop);
      return true;
    }
    if (block && this.bedAt(block.x, block.y, block.z)) return true;
    if (this.phase !== 'playing' || !item) return false;
    const special = item.bedwars;
    if (special === 'fireball') { this.throwFireball(); this.useOne(); return true; }
    if (special === 'bridge_egg') { this.throwBridgeEgg(); this.useOne(); return true; }
    if (special === 'popup_tower') { if (this.buildTower()) this.useOne(); return true; }
    if (special === 'magic_milk') {
      this.useOne();
      this.ask({ type: 'milk' });
      this.game.player?.statusEffects?.clear?.();
      this.game.ui?.addChatMessage?.('Magic Milk: traps will not trigger on you for 30 seconds.', 'system');
      this.game.sounds?.playMilk?.();
      return true;
    }
    if (item.isBlock && item.id === BLOCKS.TNT && block?.normal) {
      const at = { x: block.x + block.normal.x, y: block.y + block.normal.y, z: block.z + block.normal.z };
      if (this.game.world?.getVoxel(at.x, at.y, at.z) !== BLOCKS.AIR || this.canPlaceBlock(at.x, at.y, at.z) === false) return true;
      this.useOne();
      this.showTnt({ ...at, by: this.myId }, true);
      this.ask({ type: 'tnt', ...at });
      return true;
    }
    return false;
  }

  useOne() {
    const p = this.game.player;
    if (p?.gamemode !== 'creative') this.game.inventory?.consumeActiveItem?.(1);
    this.game.ui?.updateHotbar?.();
  }

  // --- TNT, fireballs, bridge eggs and towers ----------------------------------------------------------------

  /** A lit TNT block, counting down; the one who lit it sets off the explosion. */
  showTnt({ x, y, z }, mine) {
    const mesh = primedTntMesh(this.game);
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.game.scene?.add(mesh);
    this.tnts.push({ mesh, x: x + 0.5, y: y + 0.5, z: z + 0.5, fuse: EXPLOSIONS.tnt.fuseSeconds, mine });
    this.game.sounds?.playFuse?.() ?? this.game.sounds?.playTone?.(300, 0.2);
  }

  throwFireball() {
    const p = this.game.player, camera = this.game.camera;
    if (!p || !camera) return;
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const at = p.position.clone().add(new THREE.Vector3(0, p.eyeHeight ?? 1.62, 0)).addScaledVector(dir, 0.8);
    const mesh = fireballMesh();
    mesh.position.copy(at);
    this.game.scene?.add(mesh);
    const velocity = dir.multiplyScalar(EXPLOSIONS.fireball.speed);
    this.fireballs.push({ mesh, velocity, age: 0 });
    this.game.worldSync?.shareShot?.('fireball', at, velocity);
    this.game.sounds?.playTone?.(220, 0.2);
  }

  /** A Bridge Egg lays the thrower's wool under its flight. */
  throwBridgeEgg() {
    const p = this.game.player, camera = this.game.camera;
    const team = teamById(this.me()?.team);
    if (!p || !camera || !team) return;
    const dir = camera.getWorldDirection(new THREE.Vector3());
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    const at = p.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), new THREE.MeshLambertMaterial({ color: 0xf5f5dc }));
    mesh.position.copy(at);
    this.game.scene?.add(mesh);
    const velocity = dir.multiplyScalar(20);
    this.eggs.push({ mesh, velocity, age: 0, wool: team.wool, floorY: Math.floor(p.position.y) - 1 });
    this.game.worldSync?.shareShot?.('egg', at, velocity);
  }

  /** Place blocks as if by hand: in the world, to everyone, and drawn. */
  placeBlocks(cells) {
    const world = this.game.world;
    const placed = [], seen = new Set();
    for (const [x, y, z, id] of cells) {
      const key = `${x},${y},${z}`;
      if (seen.has(key) || world.getVoxel(x, y, z) !== BLOCKS.AIR || this.canPlaceBlock(x, y, z) === false) continue;
      seen.add(key);
      placed.push([x, y, z, id]);
    }
    this.writeBlocks(placed);
    for (const [x, y, z, id] of placed) this.game.worldSync?.onBlockPlaced?.(x, y, z, id);
    return placed.length;
  }

  /**
   * The Compact Pop-up Tower, as Hypixel's: a tower of the team's wool built round the player in an instant -- walls three
   * across and five high, a ladder up the back wall, and a railed platform on top to fight from.
   */
  buildTower() {
    const p = this.game.player;
    const team = teamById(this.me()?.team);
    if (!p || !team || !this.game.camera) return false;
    const fx = Math.floor(p.position.x), fy = Math.floor(p.position.y), fz = Math.floor(p.position.z);
    if (fy + 7 > ARENA.surfaceY + 20) return false;
    // The ladder goes on the wall behind the player.
    const look = this.game.camera.getWorldDirection(new THREE.Vector3());
    const back = Math.abs(look.x) > Math.abs(look.z) ? { x: -Math.sign(look.x), z: 0 } : { x: 0, z: -Math.sign(look.z) || 1 };
    const wall = back.x === 1 ? 'east' : back.x === -1 ? 'west' : back.z === 1 ? 'south' : 'north';
    const cells = [];
    for (let h = 0; h <= 4; h++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (dx || dz) cells.push([fx + dx, fy + h, fz + dz, team.wool]);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (dx || dz) cells.push([fx + dx, fy + 5, fz + dz, team.wool]);
      if (Math.abs(dx) === 2 || Math.abs(dz) === 2) cells.push([fx + dx, fy + 6, fz + dz, team.wool]);
    }
    const ladders = [];
    for (let h = 0; h <= 5; h++) ladders.push([fx, fy + h, fz, BLOCKS.LADDER]);
    p.position.set(fx + 0.5, fy, fz + 0.5);
    p.velocity?.set?.(0, 0, 0);
    this.placeBlocks(cells);
    const world = this.game.world;
    for (const [x, y, z, id] of ladders) if (world.getVoxel(x, y, z) === BLOCKS.AIR) rememberAttachment(world, x, y, z, id, { wall });
    this.placeBlocks(ladders);
    this.game.sounds?.playPlace?.('cloth');
    return true;
  }

  /** The player who set it off breaks the blocks and tells everyone, who each feel it. */
  explode(kind, center) {
    const world = this.game.world;
    if (world) {
      const cells = explosionCells(center, kind, (x, y, z) => world.getVoxel(x, y, z), (x, y, z) => !isMapBlock(this.arena, x, y, z));
      this.writeBlocks(cells.map(([x, y, z]) => [x, y, z, BLOCKS.AIR]));
      for (const [x, y, z] of cells) this.game.worldSync?.onBlockBroken?.(x, y, z);
    }
    this.ask({ type: 'boom', kind, x: center.x, y: center.y, z: center.z });
  }

  /** An explosion near this player: hurt as an enemy, less as its thrower, not at all as a teammate; pushed either way. */
  feelBoom({ by, kind, x, y, z }) {
    const p = this.game.player;
    this.game.sounds?.playExplosion?.();
    this.game.mobs?.spawnParticleBurst?.(new THREE.Vector3(x, y, z), 0xffa500, 24);
    this.game.entities?.spawnSmoke?.(new THREE.Vector3(x, y, z), 0.3, 0.8);
    const me = this.me();
    if (!p || this.phase !== 'playing' || !me?.alive || me.dead || p.gamemode !== 'survival') return;
    const thrower = this.state?.players?.find((q) => q.id === by);
    const relation = by === this.myId ? 'self' : thrower?.team && thrower.team === me.team ? 'teammate' : 'enemy';
    const hit = explosionOn({ x, y, z }, p.position, kind, relation);
    if (!hit) return;
    p.velocity?.set?.(p.velocity.x + hit.velocity.x, Math.max(p.velocity.y, hit.velocity.y), p.velocity.z + hit.velocity.z);
    p.onGround = false;
    if (hit.damage > 0) { this.lastDamageType = 'explosion'; p.takeDamage?.(hit.damage, { x, y, z }, 'explosion'); this.game.ui?.updateStats?.(); }
  }

  updateProjectiles(dt) {
    const world = this.game.world;
    const solid = (v) => { const id = world?.getVoxel(Math.floor(v.x), Math.floor(v.y), Math.floor(v.z)); return id && id !== BLOCKS.AIR && id !== BLOCKS.WATER && BLOCK_DEFS[id]?.solid !== false; };
    for (let i = this.tnts.length - 1; i >= 0; i--) {
      const t = this.tnts[i];
      t.fuse -= dt;
      const flash = t.mesh.userData.flash;
      if (flash) flash.material.opacity = Math.sin(t.fuse * 18) > 0 ? 0.55 : 0;
      if (t.fuse < 0.3) t.mesh.scale.setScalar(1 + (0.3 - t.fuse) * 0.6);
      if (t.fuse > 0) continue;
      t.mesh.userData.release?.();
      this.tnts.splice(i, 1);
      if (t.mine) this.explode('tnt', { x: t.x, y: t.y, z: t.z });
    }
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i];
      f.age += dt;
      const from = f.mesh.position.clone();
      let boom = f.age >= EXPLOSIONS.fireball.lifeSeconds;
      const steps = Math.max(1, Math.ceil(f.velocity.length() * dt / 0.25));
      for (let s = 0; s < steps && !boom; s++) {
        f.mesh.position.addScaledVector(f.velocity, dt / steps);
        boom = solid(f.mesh.position) || Boolean(this.game.worldSync?.projectileTouches?.(from, f.mesh.position, { pad: 0.3 }));
      }
      if (!boom) continue;
      f.mesh.removeFromParent();
      f.mesh.traverse((c) => { c.geometry?.dispose(); c.material?.dispose(); });
      this.fireballs.splice(i, 1);
      this.explode('fireball', { x: f.mesh.position.x, y: f.mesh.position.y, z: f.mesh.position.z });
    }
    for (let i = this.eggs.length - 1; i >= 0; i--) {
      const e = this.eggs[i];
      e.age += dt;
      const from = e.mesh.position.clone();
      e.mesh.position.addScaledVector(e.velocity, dt);
      // Its trail, along the whole of this frame's flight (a slow frame must not leave gaps): the wool under the egg.
      const cells = [];
      const steps = Math.max(1, Math.ceil(from.distanceTo(e.mesh.position) / 0.4));
      for (let s = 1; s <= steps; s++) {
        const at = from.clone().lerp(e.mesh.position, s / steps);
        cells.push([Math.floor(at.x), e.floorY, Math.floor(at.z), e.wool]);
      }
      this.placeBlocks(cells);
      if (e.age < 1.5 && !solid(e.mesh.position)) continue;
      e.mesh.removeFromParent(); e.mesh.geometry.dispose(); e.mesh.material.dispose();
      this.eggs.splice(i, 1);
    }
  }

  // --- every frame ------------------------------------------------------------------------------------------

  update(dt) {
    if (!this.active) return;
    this.holdMidday();
    const p = this.game.player;
    const phase = this.phase;
    const me = this.me();
    for (const view of this.genViews.values()) view.update(view.state, dt);
    this.updateProjectiles(dt);
    // Waiting players stay in the glass room.
    if ((phase === 'lobby' || phase === 'countdown') && p) {
      const at = this.arena.lobby;
      if (Math.hypot(p.position.x - at.x, p.position.z - at.z) > 7 || p.position.y < at.y - 3) { p.position.set(at.x, at.y, at.z); p.velocity?.set?.(0, 0, 0); p.fallDistance = 0; }
    }
    if (phase === 'playing' && me?.alive && !me.dead && p && !this.waitingRespawn && p.gamemode === 'survival') {
      // Into the void: dead at once.
      if (p.position.y < ARENA.voidY) { this.lastDamageType = 'void'; this.onLocalDeath(); }
      // Standing on a generator: take its pile.
      this.collectTimer -= dt;
      if (this.collectTimer <= 0) {
        this.collectTimer = 0.25;
        for (const gen of this.state?.gens ?? []) {
          if (!RESOURCES.some((r) => gen.stock[r] > 0)) continue;
          const at = this.genPosition(gen.id);
          if (at && Math.hypot(p.position.x - at.x, p.position.z - at.z) <= PICKUP_REACH && Math.abs(p.position.y - at.y) <= 2) this.ask({ type: 'collect', gen: gen.id });
        }
      }
      this.tickTimer -= dt;
      if (this.tickTimer <= 0) { this.tickTimer = 0.5; this.applyUpgrades(); }
    }
    if (!this.match) return;
    this.match.update(dt);
    if (this.match.phase === 'playing') {
      // A guest far below the islands is dead, whatever its browser says.
      for (const player of this.match.players.values()) {
        if (player.id === HOST_ID || !player.alive || player.dead) continue;
        const pos = this.session?.positions?.get(player.id);
        if (pos && pos.y < ARENA.voidY - 30) this.match.died(player.id, 'void', {});
      }
      const inBase = (id, team) => {
        const pos = this.positionOf(id), base = this.baseOf(team);
        return Boolean(pos && base && Math.hypot(pos.x - base.center.x, pos.z - base.center.z) <= base.radius && Math.abs(pos.y - ARENA.surfaceY) < 12);
      };
      this.match.checkTraps(inBase, (id) => (this.milkUntil.get(id) ?? -1) > this.match.elapsed);
    }
    this.publishTimer += dt;
    if (this.match.events.length || this.publishTimer >= 0.5) { this.publishTimer = 0; this.publish(); }
  }

  isModalOpen() {
    return Boolean(this.active && this.ui?.needsPointer(this.state, this.isHost));
  }
}
