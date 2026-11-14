// The Blockyland server for the replication run: several players in one survival world, each possibly in a different
// dimension, all simulated by the game's own code.
//
// The browser game is built for one player: `Game` owns the world, the mobs, the items and the managers, and every
// manager reads `game.player`. Rather than rewrite those systems, the server reuses them:
//
//   - A DIMENSION (`D`) is an object on `Game.prototype` holding what that dimension shares: its World, mob manager,
//     dropped items, spawner, furnaces, chests, beds, farms, portals, the End encounter. Managers are built with `D`
//     as their game, exactly as `Game.start` builds them with the game.
//   - A PLAYER CONTEXT (`P`) is an object whose prototype is its dimension, holding what belongs to one player: the
//     Player, the inventory, what it aims at, its bow and eating state, its advancements, a UI stand-in. So
//     `P.handleRightClick()` is the game's own method, reading `this.world` from the dimension and `this.player` from
//     the player. Moving to another dimension re-points the prototype.
//   - Managers built with `D` read `D.player`, `D.inventory`, `D.ui`: those are getters returning the player that is
//     acting at the moment (`server.acting`), set around every per-player call.
//   - Mobs and dropped items are updated once per player, each time on the slice of them nearest to that player, so a
//     mob attacks, follows and despawns by the nearest player, as in Minecraft, and nothing is moved twice.
//
// The page that runs this is replication/server.html; replication/server/run.mjs is the Node front that launches it.
import * as THREE from 'three';
import { Game } from '../../src/main.js';
import { World } from '../../src/world.js';
import { TextureManager } from '../../src/textures.js';
import { Player } from '../../src/player.js';
import { Inventory } from '../../src/inventory.js';
import { MobManager } from '../../src/mobs.js';
import { EntityManager } from '../../src/entities.js';
import { MobSpawnManager } from '../../src/spawning/mobSpawnManager.js';
import { FurnaceManager } from '../../src/furnace.js';
import { CampfireCooking } from '../../src/campfireCooking.js';
import { BedManager } from '../../src/bed.js';
import { ChestManager } from '../../src/chest.js';
import { DoorManager } from '../../src/door.js';
import { FarmingManager } from '../../src/farming.js';
import { EnchantingManager } from '../../src/enchanting.js';
import { NetherPortalManager } from '../../src/netherPortal.js';
import { BossFightManager } from '../../src/bossFights.js';
import { MonsterSpawners } from '../../src/monsterSpawner.js';
import { AdvancementTracker } from '../../src/advancements.js';
import { BowController } from '../../src/bow.js';
import { EatingController } from '../../src/eating.js';
import { EndItemController } from '../../src/endItems.js';
import { updateEndGatewayTravel } from '../../src/endProgression.js';
import { normaliseSettings } from '../../src/sessionSettings.js';
import { placePlayerOnSurface } from '../../src/worldSpawn.js';
import { BLOCKS } from '../../src/blocks.js';
import { skyDarkenForDimension } from '../../src/spawning/spawnClock.js';
import { restore as restoreSave } from './saves.js';
import { WeatherManager } from '../../src/weather.js';
import { pushPlayersApart } from '../../src/entityPush.js';
import { WORLD_STRUCTURE_IDS, withEndFixtures } from '../../src/worldStructures.js';

// The structures of the replication world: the game's default list, plus what a vanilla survival world has and a run
// to the dragon needs. The game's default leaves strongholds out (it builds a portal room beside the spawn instead);
// here they generate in their rings, as in Minecraft. Their generator fits them into the 64-block world (y 5-36).
export const REPLICATION_STRUCTURES = withEndFixtures([...WORLD_STRUCTURE_IDS, 'stronghold', 'village_desert', 'village_savanna', 'village_snowy', 'village_taiga',
  'ruined_portal', 'ruined_portal_desert', 'ruined_portal_jungle', 'ruined_portal_mountain', 'ruined_portal_swamp']);

const BLOCK_KEY = Object.fromEntries(Object.entries(BLOCKS).map(([k, v]) => [v, k]));

export const TICK = 1 / 20;
export const DIMENSIONS = ['overworld', 'the_nether', 'the_end'];
const WORLD_DIM = { overworld: 'overworld', the_nether: 'nether', the_end: 'the_end' };
const LOAD_RADIUS = 5; // chunks generated around each player (80 blocks); mobs spawn within this

// Fields that belong to a player, read through the dimension by managers built with it.
const PLAYER_FIELDS = ['player', 'inventory', 'ui', 'camera', 'bow', 'eating', 'advancements', 'targetBlock', 'targetMob',
  'isMouseDown', 'miningTime', 'heldItemRenderer', 'enderEyes', 'tradingOpen'];

const silent = new Proxy({}, { get: (_, k) => (k === 'then' ? undefined : () => {}) });

/** The UI a player context has: no screen, but its messages are kept for the player's next program output. */
function uiFor(ctx) {
  const ui = {
    game: ctx,
    activeVillager: null,
    addChatMessage(text, kind = 'system') {
      const plain = String(text).replace(/<[^>]+>/g, '');
      // An advancement is announced to everyone, with the player's name, and logged (the paper's server logged them).
      const adv = plain.match(/^Player has (made the advancement|completed the challenge|reached the goal) \[(.+)\]/);
      if (adv) { ctx.server.advancement(ctx, adv[2], plain.replace(/^Player/, ctx.name)); return; }
      ctx.server.toPlayer(ctx, plain, kind);
    },
    showToast(text) { if (text) ctx.server.toPlayer(ctx, String(text), 'toast'); },
    isModalOpen: () => false, isGeminiOpen: () => false, isChatOpen: false, isPaused: false,
  };
  const VERB = /^(update|show|hide|set|open|close|render|refresh|toggle|play|clear|flash|notify|display|tick|init|bind|start|stop|request|apply|mark|sync|on[A-Z])/;
  return new Proxy(ui, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && VERB.test(k) ? () => {} : undefined)) });
}

function defineOwn(obj, key, value) { Object.defineProperty(obj, key, { value, writable: true, configurable: true, enumerable: true }); }

function deathMessage(name, c) {
  const by = c.by ? c.by.replace(/_/g, ' ') : null;
  switch (c.type) {
    case 'fall': return `${name} hit the ground too hard`;
    case 'drowning': return `${name} drowned`;
    case 'lava': return `${name} tried to swim in lava`;
    case 'in_fire': return `${name} went up in flames`;
    case 'fire': case 'burn': case 'on_fire': return `${name} burned to death`;
    case 'void': return `${name} fell out of the world`;
    case 'lightning_bolt': case 'lightning': return `${name} was struck by lightning`;
    case 'starvation': case 'starve': return `${name} starved to death`;
    case 'suffocation': return `${name} suffocated in a wall`;
    case 'explosion': return `${name} was blown up${by ? ` by ${by}` : ''}`;
    default: return by ? `${name} was slain by ${by}` : `${name} died (${c.type})`;
  }
}

export class BlockylandServer {
  constructor({ seed = 20261103, difficulty = 'easy', log = () => {} } = {}) {
    this.seed = seed;
    this.difficulty = difficulty;
    this.settings = normaliseSettings({ gameMode: 'survival', difficulty, cheats: false, seed });
    this.gamerules = { doImmediateRespawn: true, doMobSpawning: true, keepInventory: false };
    this.worldTime = 0; // time of day in ticks, 0-23999 (0 = dawn), as the game keeps it
    this.dayCount = 0;
    this.gamerules.doWeatherCycle = true;
    this.ticks = 0;
    this.dims = {};
    this.players = new Map();
    this.acting = null;
    const seenErrors = new Map();
    this.log = (kind, data) => {
      if (kind === 'error') {
        const key = `${data.where}|${data.message}`, n = (seenErrors.get(key) ?? 0) + 1;
        seenErrors.set(key, n);
        if (n > 1 && n !== 10 && n !== 100 && n % 1000) return; // logged at 1, 10, 100, then every 1000th
        data = { ...data, count: n };
      }
      log(kind, data);
    }; // (kind, data) => void: the event log
    this.events = [];
  }

  async init({ save = null } = {}) {
    this.textures = new TextureManager();
    await this.textures.init();
    if (save) { restoreSave(this, save); this.dimension('overworld'); return this; }
    this.dimension('overworld');
    const D = this.dims.overworld;
    // The world spawn, found as the game finds it for a new world.
    const probe = this.makeContext('__spawn_probe__', D);
    const spawn = placePlayerOnSurface(probe);
    this.worldSpawn = { x: probe.player.position.x, y: probe.player.position.y, z: probe.player.position.z, found: !!spawn?.found };
    this.dropContext(probe);
    this.loadAround(D, this.worldSpawn.x, this.worldSpawn.z, LOAD_RADIUS);
    this.log('server_start', { seed: this.seed, difficulty: this.difficulty, spawn: this.worldSpawn });
    return this;
  }

  /** The shared state of one dimension, built on first use. */
  dimension(name) {
    if (this.dims[name]) return this.dims[name];
    const server = this;
    const D = Object.create(Game.prototype);
    Object.assign(D, {
      server, dimensionName: name, currentDimension: WORLD_DIM[name],
      scene: new THREE.Scene(), textures: this.textures, sounds: silent,
      settings: this.settings, gamerules: this.gamerules, worldGenerated: true, worldReady: true,
      lifecycle: { phase: 'ready' }, worldType: 'generated',
    });
    for (const key of PLAYER_FIELDS) Object.defineProperty(D, key, { get() { return server.acting?.[key]; }, configurable: true });
    Object.defineProperty(D, 'difficulty', { get: () => server.difficulty, configurable: true });
    Object.defineProperty(D, 'worldTime', { get: () => server.worldTime, set: (v) => { server.worldTime = ((v % 24000) + 24000) % 24000; }, configurable: true });
    Object.defineProperty(D, 'dayCount', { get: () => server.dayCount, set: (v) => { server.dayCount = v; }, configurable: true });
    // Java's daytime: the sun is up from tick 23460 to 12542 of the day.
    Object.defineProperty(D, 'isDaytime', { get: () => server.worldTime < 12542 || server.worldTime > 23460, configurable: true });

    const world = new World(this.seed, 'all');
    world.game = D;
    world.generationMode = 'procedural';
    world.rebuildStructures({ enabledIds: REPLICATION_STRUCTURES });
    if (WORLD_DIM[name] !== 'overworld') world.switchDimension(WORLD_DIM[name]);
    D.world = world;
    D.entities = new EntityManager(D.scene, world, silent, this.textures);
    D.mobs = new MobManager(D.scene, world, silent, D.entities);
    D.mobs.game = D;
    D.entities.ui = null;
    D.spawnManager = new MobSpawnManager({ game: D });
    D.spawnManager.structureAt = (x, y, z) => world.structures?.structureIdAt?.(x, y, z) ?? null;
    // Every player in this dimension at once, as Java's spawn cycle sees them (MobSpawnManager.players() knows only
    // game.player): the cycle, the despawn checks and the world-wide timers (phantoms' time since rest, the wandering
    // trader) then run once a tick, not once per player.
    D.spawnManager.players = () => [...this.players.values()].filter(P => this.dimensionOf(P) === D && P.player?.position && P.player.gamemode !== 'spectator')
      .map(P => { const p = P.player.position; return { x: p.x, y: p.y, z: p.z, chunkX: Math.floor(p.x / 16), chunkZ: Math.floor(p.z / 16), spectator: false, entity: P.player }; });
    D.furnaceManager = new FurnaceManager(D);
    D.campfireCooking = new CampfireCooking({ drop: (x, y, z, id, isBlock, count) => D.entities.spawnDroppedItem(new THREE.Vector3(x + .5, y + 1.1, z + .5), id, isBlock, count), changed: () => {} });
    D.bedManager = new BedManager(D);
    this.multiplayerBeds(D.bedManager);
    D.chestManager = new ChestManager(D); world.chestManager = D.chestManager;
    D.doorManager = new DoorManager(D); world.doorManager = D.doorManager;
    D.farmingManager = new FarmingManager(D);
    D.enchantingManager = new EnchantingManager(D);
    D.portalManager = new NetherPortalManager(D);
    D.bossManager = new BossFightManager(D.mobs, world, silent, null, D.entities); D.bossManager.game = D;
    D.monsterSpawners = new MonsterSpawners({ world, mobs: D.mobs });
    D.endItems = new EndItemController(D);
    // Weather (src/weather.js), one world-wide weather as in Minecraft: the Overworld's runs the clock; the Nether and
    // the End share it (the game keeps them dry). Each sees only the chunks within the simulation distance of a
    // player, so lightning and snowfall happen where vanilla would have them, not on every chunk ever loaded.
    this.setUpWeather(D, name);
    world.water.onDisplace = (x, y, z, id) => D.spawnBlockDrops(new THREE.Vector3(x + .5, y + .5, z + .5), id);
    // A game method that rebuilds a chunk's mesh: nothing is drawn here.
    D.rebuildChunkMesh = () => {}; D.refreshDirtyChunks = () => {}; D.loadChunksAroundPlayer = () => {};
    D.vibration = () => 0;
    this.dims[name] = D;
    if (name === 'the_end') { D.endArenaBuilt = true; D.bossManager.initEndArena?.(); }
    return D;
  }

  /**
   * Beds for several players. The game's bed manager holds one sleeper; here each player keeps its own sleep state,
   * swapped into the manager around every call, and the night is skipped only when every player in the Overworld has
   * slept long enough (Java multiplayer, playersSleepingPercentage 100). Until then a sleeper stays in bed.
   */
  multiplayerBeds(bm) {
    const server = this, KEYS = ['isSleeping', 'sleepingBed', 'sleepTimer', 'savedCameraPos'];
    const load = (P) => { P.sleepState ??= { isSleeping: false, sleepingBed: null, sleepTimer: 0, savedCameraPos: null }; for (const k of KEYS) bm[k] = P.sleepState[k]; };
    const save = (P) => { for (const k of KEYS) P.sleepState[k] = bm[k]; };
    for (const m of ['interact', 'startSleeping', 'leaveBed', 'update']) {
      const orig = bm[m].bind(bm);
      bm[m] = (...a) => { const P = server.acting; if (!P) return orig(...a); load(P); try { return orig(...a); } finally { save(P); } };
    }
    const wake = bm.wakeUp.bind(bm);
    bm.wakeUp = () => {
      const P = server.acting;
      const sleepers = [...server.players.values()].filter(Q => server.dimensionOf(Q) === server.dims.overworld && !Q.player.isDead);
      const ready = (Q) => Q === P ? bm.isSleeping : Q.sleepState?.isSleeping && Q.sleepState.sleepTimer >= bm.sleepDuration;
      if (!sleepers.every(ready)) return; // stay in bed until everyone sleeps
      wake(); // morning: time advances once, this player stands up
      save(P);
      for (const Q of sleepers) if (Q !== P && Q.sleepState?.isSleeping) server.as(Q, () => { load(Q); bm.leaveBed(); save(Q); server.toPlayer(Q, 'Good morning.', 'system'); });
      server.log('night_skipped', { by: sleepers.map(Q => Q.name), day: server.dayCount });
    };
  }

  setUpWeather(D, name) {
    const server = this;
    const weather = new WeatherManager(D.scene, silent);
    if (name === 'overworld') this.overworldWeather = weather;
    else weather.clock = this.overworldWeather?.clock ?? weather.clock;
    // What the weather sees: the dimension, its players (game.players), and its world restricted to the chunks near them.
    const view = Object.create(D.world);
    view.chunks = new Map();
    const game = Object.create(D);
    Object.defineProperty(game, 'world', { value: view, writable: true });
    Object.defineProperty(game, 'players', { get: () => [...server.players.values()].filter(P => server.dimensionOf(P) === D).map(P => P.player) });
    weather.game = game;
    // Every bolt is logged, with whoever it struck.
    const trigger = weather.triggerLightning.bind(weather);
    weather.triggerLightning = (ambient, sun, strike = null, options = {}) => {
      const done = trigger(ambient, sun, strike, options);
      if (done && strike) server.log('lightning', { dim: name, at: { x: +strike.x.toFixed(1), y: +strike.y.toFixed(1), z: +strike.z.toFixed(1) }, natural: !!options.natural });
      return done;
    };
    D.weather = weather;
    D.weatherView = view;
    Object.defineProperty(D, 'players', { get: () => game.players, configurable: true });
  }

  /** The chunks within the simulation distance (8 chunks) of the players in D, for its weather. */
  refreshWeatherView(D, players) {
    const view = D.weatherView, R = 8;
    view.chunks.clear();
    for (const P of players) {
      const cx = Math.floor(P.player.position.x / 16), cz = Math.floor(P.player.position.z / 16);
      for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) { const c = D.world.getChunk(cx + dx, cz + dz); if (c) view.chunks.set(`${cx + dx},${cz + dz}`, c); }
    }
  }

  /** A player context in a dimension: the game's methods, this player's state. */
  makeContext(name, D) {
    const P = Object.create(D);
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, .1, 200);
    defineOwn(P, 'name', name);
    defineOwn(P, 'camera', camera);
    defineOwn(P, 'ui', uiFor(P));
    const player = new Player(camera, document.createElement('div'), D.world, silent, this.settings);
    player.game = P;
    player.gamemode = 'survival';
    const inventory = new Inventory(silent);
    inventory.recipeGate = () => true;
    player.inventory = inventory;
    defineOwn(P, 'player', player);
    defineOwn(P, 'inventory', inventory);
    for (const key of ['targetBlock', 'targetMob', 'enderEyes']) defineOwn(P, key, null);
    defineOwn(P, 'isMouseDown', false);
    defineOwn(P, 'miningTime', 0);
    defineOwn(P, 'tradingOpen', false);
    defineOwn(P, 'heldItemRenderer', new Proxy({}, { get: (_, k) => (k === 'then' ? undefined : () => {}) })); // first-person rendering only
    defineOwn(P, 'bow', new BowController(P));
    // The bow asks for pointer lock (a mouse held to the window); a server player has no window.
    P.bow.canUse = () => !P.player.isDead && P.player.health > 0;
    defineOwn(P, 'eating', new EatingController(P));
    defineOwn(P, 'advancements', new AdvancementTracker(P));
    // The portal manager times one player's stay in a portal: each player has its own.
    defineOwn(P, 'portalManager', new NetherPortalManager(P));
    defineOwn(P, 'server', this);
    // Dimension travel moves this player between the server's worlds rather than swapping one world's dimension.
    defineOwn(P, 'travelToDimension', (newDim, targetPos = null, { arrive = null } = {}) => { this.moveToDimension(P, newDim, targetPos); arrive?.(); return Promise.resolve(); });
    defineOwn(P, 'switchDimension', (newDim, targetPos = null) => this.moveToDimension(P, newDim, targetPos));
    defineOwn(P, 'messages', []);
    // Deaths are logged with their cause (the last damage taken), and the player hears of it, as a death message.
    const takeDamage = player.takeDamage.bind(player);
    player.takeDamage = (amount, sourcePos = null, type = 'generic', attacker = null, options = {}) => {
      // Who did it: the attacker if named, else the mob standing where the hit came from.
      let by = attacker?.type ?? (attacker?.player ? attacker.name : null) ?? (typeof sourcePos === 'string' ? sourcePos : null);
      if (!by && sourcePos?.x !== undefined) {
        let best = 3.5;
        for (const m of this.dimensionOf(P).mobs.mobs) { const d = m.mesh?.position?.distanceTo?.(sourcePos); if (d !== undefined && d < best) { best = d; by = m.type; } }
      }
      P.lastDamage = { amount, type, by, t: this.ticks };
      return takeDamage(amount, sourcePos, type, attacker, options);
    };
    const die = player.die.bind(player);
    player.die = () => {
      if (player.isDead) return die();
      const cause = P.lastDamage && this.ticks - P.lastDamage.t < 100 ? P.lastDamage : { type: 'unknown' };
      const D = this.dimensionOf(P), at = player.position;
      const text = deathMessage(name, cause);
      for (const Q of this.players.values()) this.toPlayer(Q, text, 'death');
      // What Minecraft's death screen and recovery compass give the player who died: where it happened.
      this.toPlayer(P, `You died at ${Math.floor(at.x)}, ${Math.floor(at.y)}, ${Math.floor(at.z)} in ${D.dimensionName === 'overworld' ? 'the Overworld' : D.dimensionName === 'the_end' ? 'the End' : 'the Nether'}. Your items dropped there and vanish after 5 minutes.`, 'system');
      this.log('death', { player: name, dim: D.dimensionName, at: { x: +at.x.toFixed(1), y: +at.y.toFixed(1), z: +at.z.toFixed(1) }, cause: cause.type, by: cause.by ?? null, message: text });
      // Death sends the player back to the Overworld (bed or world spawn), so leave this dimension first.
      const result = die();
      return result;
    };
    // Respawning happens in the Overworld, at the bed or the world spawn, whichever dimension the death was in.
    const respawn = player.respawn.bind(player);
    player.respawn = () => {
      const O = this.dims.overworld;
      if (this.dimensionOf(P) !== O) { Object.setPrototypeOf(P, O); player.world = O.world; }
      const r = respawn();
      this.loadAround(O, player.position.x, player.position.z, LOAD_RADIUS);
      this.log('respawn', { player: name, at: { x: +player.position.x.toFixed(1), y: +player.position.y.toFixed(1), z: +player.position.z.toFixed(1) } });
      return r;
    };
    P.buildTargetHighlightMeshes(); // the aim box and crack overlay: never drawn, but mining reads and moves them
    // Eyes of Ender as vanilla throws them (EyeOfEnder.signalTo): toward the nearest stronghold's portal room, at most
    // 12 blocks out and 8 up from where it was thrown, for 80 ticks; then it drops as an item (80%) or shatters. Nothing
    // is announced: the eye's path is the only clue, as in Minecraft. The game's own throw aimed at a room it builds
    // beside the spawn and printed the bearing in chat.
    defineOwn(P, 'throwEnderEye', () => this.throwEnderEye(P));
    defineOwn(P, 'updateEnderEyes', (dt) => this.updateEnderEyes(P, dt));
    return P;
  }

  dropContext(P) { this.players.delete(P.name); }

  /** Where an eye of ender leads: the nearest stronghold's start (its entrance staircase), as vanilla's eye points to
      the structure's start, not to the portal room; null if there is none. Also its whole extent, for tests. */
  strongholdNear(world, x, z) {
    try {
      const found = world.structures?.engine?.locate?.('stronghold', Math.floor(x), Math.floor(z), { maxRadiusChunks: 512 });
      if (!found) return null;
      const box = (b) => Array.isArray(b) ? { minX: b[0], minY: b[1], minZ: b[2], maxX: b[3], maxY: b[4], maxZ: b[5] } : b;
      const b = box(found.start.box), s = found.start.meta?.start;
      const at = s ? { x: s[0] + .5, y: s[1], z: s[2] + .5 } : { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, z: (b.minZ + b.maxZ) / 2 };
      return { ...at, box: b };
    } catch { return null; }
  }

  throwEnderEye(P) {
    const D = this.dimensionOf(P), p = P.player;
    if (D.dimensionName !== 'overworld') return null; // no strongholds to find: the eye is not thrown
    const target = this.strongholdNear(D.world, p.position.x, p.position.z);
    if (!target) return null;
    const eye = p.getEyePosition().clone();
    let tx = target.x, ty = target.y, tz = target.z;
    const dx = tx - eye.x, dz = tz - eye.z, d = Math.hypot(dx, dz);
    if (d > 12) { tx = eye.x + dx / d * 12; tz = eye.z + dz / d * 12; ty = eye.y + 8; }
    const mesh = new THREE.Object3D(); mesh.position.copy(eye);
    P.enderEyes ??= [];
    P.enderEyes.push({ mesh, start: eye, target: new THREE.Vector3(tx, ty, tz), age: 0, survives: Math.random() >= 0.2 });
    P.inventory.consumeActiveItem(1);
    this.log('ender_eye', { player: P.name, from: { x: +eye.x.toFixed(1), z: +eye.z.toFixed(1) }, stronghold: { x: Math.round(target.x), y: Math.round(target.y), z: Math.round(target.z) }, distance: Math.round(d) });
    return { target };
  }

  updateEnderEyes(P, dt) {
    if (!P.enderEyes?.length) return;
    const D = this.dimensionOf(P), keep = [];
    for (const e of P.enderEyes) {
      e.age += dt * 20;
      // Glide toward the signal point over about 2.5 s, rising, then hang there bobbing until the 80 ticks are up.
      const f = Math.min(1, e.age / 50), ease = 1 - (1 - f) ** 2;
      e.mesh.position.set(e.start.x + (e.target.x - e.start.x) * ease, e.start.y + (e.target.y - e.start.y) * ease + Math.sin(e.age / 4) * .1, e.start.z + (e.target.z - e.start.z) * ease);
      if (e.age < 80) { keep.push(e); continue; }
      if (e.survives) D.entities.spawnDroppedItem(e.mesh.position.clone(), 'ender_eye', false, 1); // else it shatters, silently
    }
    P.enderEyes = keep;
  }

  /** A block id's name in the block table (OAK_LOG). */
  blockKey(id) { return BLOCK_KEY[id] ?? String(id); }

  /** A new player at the world spawn. */
  addPlayer(name) {
    if (this.players.has(name)) return this.players.get(name);
    const P = this.makeContext(name, this.dims.overworld);
    const s = this.worldSpawn;
    P.player.position.set(s.x, s.y, s.z);
    P.player.spawnPosition = new THREE.Vector3(s.x, s.y, s.z);
    this.players.set(name, P);
    this.log('join', { player: name, at: s });
    return P;
  }

  dimensionOf(P) { return Object.getPrototypeOf(P); }

  moveToDimension(P, newDim, targetPos) {
    const name = newDim === 'nether' ? 'the_nether' : newDim;
    const from = this.dimensionOf(P);
    const D = this.dimension(name);
    if (from === D) return;
    Object.setPrototypeOf(P, D);
    P.player.world = D.world;
    if (targetPos) P.player.position.set(targetPos.x, targetPos.y, targetPos.z);
    P.player.velocity?.set?.(0, 0, 0);
    this.loadAround(D, P.player.position.x, P.player.position.z, LOAD_RADIUS);
    this.log('dimension', { player: P.name, from: from.dimensionName, to: name, at: P.player.position });
  }

  loadAround(D, x, z, radius) {
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) D.world.getOrCreateChunk(cx + dx, cz + dz);
  }

  /** A message for one player's next program output. */
  toPlayer(P, text, kind = 'system') {
    text = String(text).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    P.messages.push({ t: this.ticks, kind, text });
    if (P.messages.length > 200) P.messages.splice(0, P.messages.length - 200);
  }

  advancement(P, title, text) {
    for (const Q of this.players.values()) this.toPlayer(Q, text, 'advancement');
    this.log('advancement', { player: P.name, title, dim: this.dimensionOf(P).dimensionName });
  }

  /** Chat from one player to all. */
  chat(fromName, text) {
    const message = { t: this.ticks, kind: 'chat', from: fromName, text: String(text).slice(0, 256) };
    for (const P of this.players.values()) P.messages.push(message);
    this.log('chat', { from: fromName, text: message.text });
  }

  /** Run `fn` as player P: managers built with P's dimension see P as `game.player`. */
  // Game events (a kill, a meal) go to the acting player's advancements: without the switch they went to whichever
  // tracker updated last, the last player in the list (dry8: Basil's skeleton kill was logged as Delphi's).
  as(P, fn) {
    const before = this.acting;
    this.acting = P;
    P?.advancements?.activate?.();
    try { return fn(); } finally { this.acting = before; before?.advancements?.activate?.(); }
  }

  /** Partition a manager's positioned lists by nearest player, run `update` once per player on its slice. */
  partitioned(manager, keys, players, update) {
    // The named lists, and any other list on the manager whose entries have a mesh or group: fireballs, pearls and
    // other projectiles the server was not told about move once a tick too.
    const moving = (k) => { const a = manager[k]; return Array.isArray(a) && a.length && (a[0]?.mesh?.position || a[0]?.group?.position); };
    const lists = [...new Set([...keys.filter(k => Array.isArray(manager[k])), ...Object.keys(manager).filter(moving)])];
    const posOf = (o) => o?.mesh?.position ?? o?.group?.position ?? o?.position ?? null;
    const slices = new Map(players.map(P => [P, {}]));
    for (const k of lists) {
      for (const P of players) slices.get(P)[k] = [];
      for (const o of manager[k]) {
        const at = posOf(o);
        let best = players[0], bestD = Infinity;
        // A mob a player has just killed is updated as that player, so the kill is theirs (Monster Hunter and the rest).
        if (o?.lastPlayerAttacker && (o.dying || o.health <= 0) && players.includes(o.lastPlayerAttacker)) { slices.get(o.lastPlayerAttacker)[k].push(o); continue; }
        if (at) for (const P of players) { const p = P.player.position, d = (p.x - at.x) ** 2 + (p.z - at.z) ** 2; if (d < bestD) { bestD = d; best = P; } }
        slices.get(best)[k].push(o);
      }
    }
    const merged = Object.fromEntries(lists.map(k => [k, []]));
    for (const P of players) {
      for (const k of lists) manager[k] = slices.get(P)[k];
      try { this.as(P, () => update(P)); } catch (err) { this.log('error', { where: `${manager.constructor.name}.update`, player: P.name, message: err?.message, stack: String(err?.stack).slice(0, 600) }); }
      for (const k of lists) merged[k].push(...manager[k]);
    }
    for (const k of lists) manager[k] = merged[k];
  }

  /** One game tick: 1/20 s. */
  tick() {
    const dt = TICK;
    this.ticks++;
    if (++this.worldTime >= 24000) { this.worldTime -= 24000; this.dayCount++; }
    // The weather clock turns once a tick for the whole world, whoever is where.
    this.overworldWeather?.clock.advance(dt, this.gamerules.doWeatherCycle !== false);
    for (const D of Object.values(this.dims)) {
      const players = [...this.players.values()].filter(P => this.dimensionOf(P) === D);
      if (!players.length) continue; // an empty dimension is unloaded, as Minecraft unloads it
      const raining = D.weather.isRaining(), thundering = raining && D.weather.clock.thundering;
      D.world.light.skyDarken = skyDarkenForDimension(D.currentDimension, this.worldTime, { rain: raining, thunder: thundering });
      this.refreshWeatherView(D, players);
      const guard = (where, fn) => { try { fn(); } catch (err) { this.log('error', { where, dim: D.dimensionName, message: err?.message, stack: String(err?.stack).slice(0, 600) }); } };
      // Players push each other apart, as in Minecraft (src/entityPush.js): they no longer stand inside one another.
      guard('push', () => pushPlayersApart(players.map(P => P.player)));
      guard('weather', () => D.weather.tickGameplay(dt, { advanceClock: false }));
      for (const P of players) {
        this.loadAround(D, P.player.position.x, P.player.position.z, LOAD_RADIUS);
        this.as(P, () => {
          guard('player', () => {
            P.bow.update(dt); P.eating.update(dt); P.advancements.update(dt);
            P.player.update(dt);
            P.updateRaycast();
            if (P.forcedTarget) P.targetBlock = P.forcedTarget(); // a dig in progress keeps its block (bridge.dig)
            P.updateMining(dt);
            P.portalManager.update(dt, P.player, P);
            P.updateEndPortalTravel(dt);
            updateEndGatewayTravel(P, dt);
            P.updateEnderEyes(dt);
          });
          guard('spawners', () => D.monsterSpawners.tick({ position: P.player.position, gamemode: 'survival' }, { difficulty: this.difficulty }));
        });
      }
      this.partitioned(D.mobs, ['mobs', 'arrows', 'snowballs', 'windCharges'], players, (P) => D.mobs.update(dt, P.player));
      this.partitioned(D.entities, ['droppedItems', 'xpOrbs'], players, (P) => D.entities.update(dt, P.player, P.inventory));
      // (once a tick for everyone: run once per player, it advanced the world-wide timers four times a tick with four
      // players, so dry10-haiku's phantoms came after 15 minutes instead of 3 days without sleep)
      for (const P of players) this.as(P, () => guard('spawning', () => D.world.structures?.flushSpawns?.()));
      this.as(players[0], () => guard('spawning', () => D.spawnManager.update(dt)));
      if (D.dimensionName === 'the_end') this.as(players[0], () => guard('boss', () => D.bossManager.update(dt, players[0].player)));
      this.as(players[0], () => {
        guard('furnaces', () => { D.furnaceManager.update(dt); D.campfireCooking.update(dt); });
        guard('beds', () => { for (const P of players) this.as(P, () => D.bedManager.update(dt)); });
        guard('farming', () => D.farmingManager.update(dt, players[0].player.position));
        guard('endItems', () => D.endItems.update(dt));
        guard('world', () => { D.world.water.update(dt); D.world.fallingBlocks?.update(dt); D.world.leafDecay?.update(dt); D.world.light?.update?.(); });
      });
    }
  }
}
