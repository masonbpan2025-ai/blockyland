// Team battle arena: ten players in one real Overworld, in two teams, each moved by its own player bot.
//
// Everything a player does goes through the game's own rules: the World generates the terrain, Player runs movement,
// hunger, health, armour and the PvP hurt window, PlayerBot walks, mines, crafts, places, cooks and eats, and the
// crafting recipes, mining rules and block drops are the game's. What this file adds is what one browser game does not
// have: several players at once, each with its own small stand-in for the Game object (as the bot's tests use), plus
// animals to hunt, a fight between players, a world border that closes in, rounds, and a recording to film.
//
// Time runs in rounds. Every living player hands in a plan (a few commands and the thinking behind them); then all
// plans play out at once for ROUND_SECONDS of game time; then each player gets a report and plans again.
import * as THREE from 'three';
import { World } from '../src/world.js';
import { BLOCKS, ITEMS, BLOCK_DEFS } from '../src/blocks.js';
import { Player } from '../src/player.js';
import { PlayerBot, parsePlayerCommand } from '../src/playerBot.js';
import { Inventory } from '../src/inventory.js';
import { FurnaceManager } from '../src/furnace.js';
import { DoorManager } from '../src/door.js';
import { FarmingManager, isHoe, getSeedCrop } from '../src/farming.js';
import { breakTimeSeconds, harvestsNothing } from '../src/miningRules.js';
import { blockDrops } from '../src/blockDrops.js';
import { foodFor } from '../src/foodData.js';
import { hitKnockback } from '../src/pvpCombat.js';
import { spendDurability } from '../src/durability.js';
import { buildArenaMap, surfaceY as mapSurfaceY } from './map.js';

export const ROUND_SECONDS = 30;
export const STEP = 1 / 20;
export const FRAME_SECONDS = 0.25;
const PICKUP_RADIUS = 3.5;

// Block ids by number, for naming what a player holds the way commands spell it (oak_log, cobblestone).
const BLOCK_KEY = Object.fromEntries(Object.entries(BLOCKS).map(([k, v]) => [v, k.toLowerCase()]));
/** An item as commands name it: "oak_log", "iron_sword". */
export function itemName(id) { return id == null ? null : typeof id === 'number' ? (BLOCK_KEY[id] ?? String(id)) : String(id); }

/** Seconds between two full-strength swings (Java's attack speed): a sword 0.625, an axe about 1, a fist 0.25. */
export function attackCooldown(itemId) {
  const id = String(itemId || '');
  if (/_sword$/.test(id)) return 0.625;
  if (/^(wooden|stone)_axe$/.test(id)) return 1.25;
  if (/^iron_axe$/.test(id)) return 1.11;
  if (/_axe$/.test(id)) return 1.0;
  if (/trident|mace/.test(id)) return 0.9;
  return 0.25;
}

/** Melee damage of what is in hand: the item's `attack` (iron sword 6, diamond 7), or a fist's 1. */
export function meleeDamage(itemId) {
  const attack = ITEMS[itemId]?.attack;
  if (typeof attack === 'number') return attack;
  if (/_axe$/.test(String(itemId))) return { wooden_axe: 7, stone_axe: 9, iron_axe: 9, golden_axe: 7, diamond_axe: 9, netherite_axe: 10 }[itemId] ?? 7;
  return 1;
}

// Animals to hunt. Health, drops and food are vanilla's (Minecraft Wiki).
const ANIMALS = {
  cow: { health: 10, drops: [['beef', 1, 3], ['leather', 0, 2]] },
  pig: { health: 10, drops: [['porkchop', 1, 3]] },
  sheep: { health: 8, drops: [['mutton', 1, 2], ['white_wool', 1, 1, true]] },
  chicken: { health: 4, drops: [['chicken', 1, 1], ['feather', 0, 2]] },
};

function seeded(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; };
}

export class ArenaSim {
  /**
   * @param {{seed?:number, biome?:string, teams:{name:string,color:string,players:string[]}[], spread?:number, borderStart?:number}} options
   */
  constructor({ seed = 20261102, biome = 'forest', teams, spread = 48, borderStart = 110, borderShrinkFrom = 16, borderShrinkPerRound = 6, borderMin = 14 } = {}) {
    this.seed = seed;
    this.random = seeded(seed);
    this.world = new World(seed, biome);
    this.time = 0;
    this.round = 0;
    this.border = { center: { x: 0, z: 0 }, radius: borderStart, shrinkFrom: borderShrinkFrom, perRound: borderShrinkPerRound, min: borderMin };
    this.droppedItems = [];
    this.animals = [];
    this.players = [];
    this.events = [];
    this.frames = [];
    this.blockChanges = [];
    this.nextFrameAt = 0;
    this.over = null;
    this.furnaceManager = new FurnaceManager({ world: this.world });
    this.teams = teams.map((t, i) => ({ ...t, index: i }));
    // The map (arena/map.js): caves filled, a clearing and a quarry for each camp, a richer quarry in the middle. Made
    // from the seed before recording starts; the film rebuilds it the same way.
    this.spread = spread;
    const map = buildArenaMap(this.world, { seed, spread });
    this.teams.forEach((team, ti) => {
      const camp = map.camps[ti];
      team.base = { x: camp.x, z: camp.z, y: camp.y };
      team.quarry = camp.quarry;
    });
    this.centre = map.centre;
    this.recordBlocks();
    // The two camps face each other across the map, on its long axis.
    this.teams.forEach((team, ti) => {
      const baseX = team.base.x;
      team.players.forEach((name, pi) => {
        const x = baseX + (pi - 2) * 2, z = (pi % 2 ? 2 : -2);
        this.players.push(this.createPlayer(name, team, x, z));
      });
      for (let i = 0; i < 8; i++) this.spawnAnimal(baseX + (this.random() - .5) * 40, (this.random() - .5) * 40);
    });
    for (let i = 0; i < 10; i++) this.spawnAnimal((this.random() - .5) * 60, (this.random() - .5) * 80);
    this.log('start', { teams: this.teams.map(t => ({ name: t.name, players: t.players, base: t.base })), border: this.border.radius });
  }

  /** Every block the world changes after the start, for the film to replay. */
  recordBlocks() {
    const world = this.world, sim = this, set = world.setVoxel.bind(world);
    world.setVoxel = (x, y, z, id, ...rest) => {
      const result = set(x, y, z, id, ...rest);
      sim.blockChanges.push([+sim.time.toFixed(2), x, y, z, id]);
      return result;
    };
  }

  loadAround(x, z, radius = 3) {
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) this.world.getOrCreateChunk(cx + dx, cz + dz);
  }

  surfaceY(x, z) {
    for (let y = 62; y > 1; y--) {
      const v = this.world.getVoxel(Math.floor(x), y - 1, Math.floor(z));
      const def = BLOCK_DEFS[v];
      if (v !== BLOCKS.AIR && v !== BLOCKS.WATER && def?.solid !== false && !/leaves|log/i.test(def?.name || '')) return y;
    }
    return 30;
  }

  spawnAnimal(x, z, type = null) {
    const types = Object.keys(ANIMALS);
    type ??= types[Math.floor(this.random() * types.length)];
    this.loadAround(x, z, 1);
    const y = this.surfaceY(x, z);
    const animal = { id: `${type}-${this.animals.length}`, type, health: ANIMALS[type].health, maxHealth: ANIMALS[type].health,
      mesh: { position: new THREE.Vector3(Math.floor(x) + .5, y, Math.floor(z) + .5) }, height: type === 'chicken' ? .7 : 1.3, wander: 0, heading: this.random() * Math.PI * 2, fleeing: 0 };
    this.animals.push(animal);
    return animal;
  }

  createPlayer(name, team, x, z) {
    const world = this.world, sim = this;
    this.loadAround(x, z, 2);
    const camera = new THREE.PerspectiveCamera();
    const player = new Player(camera, { addEventListener() {}, requestPointerLock() {} }, world, { playStep() {}, playJump() {}, playHurt() {} });
    player.position.set(Math.floor(x) + .5, this.surfaceY(x, z), Math.floor(z) + .5);
    player.onGround = true;
    player.gamemode = 'survival';
    player.health = 20; player.maxHealth = 20; player.hunger = 20; player.saturation = 5;
    const inventory = new Inventory({ playClick() {}, playPop() {} });
    const sounds = new Proxy({}, { get: () => () => {} });
    const game = {
      world, player, inventory, sounds, camera,
      difficulty: 'easy',
      worldReady: true,
      currentDimension: 'overworld',
      worldTime: 1000,
      furnaceManager: this.furnaceManager,
      mobs: { get mobs() { return sim.animals; } },
      entities: {
        get droppedItems() { return sim.droppedItems; },
        spawnDroppedItem(pos, itemType, isBlock, count = 1) {
          const p = new THREE.Vector3(pos.x ?? pos[0], pos.y ?? pos[1], pos.z ?? pos[2]);
          // What a player breaks or hunts is theirs to pick up first: they stand right by it, as a player would.
          const item = { itemType, isBlock, count, age: 0, pickupDelay: .5, owner: entry, group: { position: p } };
          sim.droppedItems.push(item);
          return item;
        },
        spawnXpOrbs() {},
      },
      ui: { isGeminiOpen: () => true, isModalOpen: () => false, updateHotbar() {}, updateUI() {}, updateStats() {}, addChatMessage() {} },
      miningTime: 0, isMouseDown: false, targetBlock: null, targetMob: null,
    };
    game.doorManager = new DoorManager(game);
    game.farmingManager = new FarmingManager(game);
    player.game = game;
    player.inventory = inventory;
    const entry = { name, team, player, inventory, game, camera, alive: true, plan: [], current: null, thought: '', chatOut: [], lastResults: [], attackReady: 0, killedBy: null, kills: 0, damageDealt: 0, label: 'idle', swing: 0 };
    game.handleLeftClick = () => this.leftClick(entry);
    game.handleRightClick = () => this.rightClick(entry);
    entry.bot = new PlayerBot(game, { log: (message, kind) => { if (kind === 'warning' || kind === 'success') entry.botLog = String(message); } });
    game.playerBot = entry.bot;
    return entry;
  }

  // --- the clicks a bot makes, as one browser game would handle them ---------------------------------------------
  leftClick(entry) {
    const { game, inventory } = entry, mob = game.targetMob;
    entry.swing = .3;
    if (mob && mob.health > 0) {
      const held = inventory.getActiveItem()?.id;
      mob.health -= meleeDamage(held);
      mob.fleeing = 3;
      if (mob.health <= 0) this.killAnimal(mob, entry);
    }
  }

  killAnimal(mob, entry) {
    const pos = mob.mesh.position;
    for (const [id, min, max, isBlock] of ANIMALS[mob.type].drops) {
      const count = min + Math.floor(this.random() * (max - min + 1));
      if (count > 0) entry.game.entities.spawnDroppedItem(pos, id, !!isBlock, count);
    }
    this.animals = this.animals.filter(a => a !== mob);
    this.log('hunt', { player: entry.name, animal: mob.type });
  }

  rightClick(entry) {
    const { game, inventory, player } = entry, world = this.world;
    const active = inventory.getActiveItem();
    if (!active) return;
    const food = foodFor(active.id);
    if (food && player.hunger < 20) {
      inventory.consumeActiveItem();
      player.eatFood(food.hunger, food.saturation);
      return;
    }
    if (ITEMS[active.id]?.armorSlot && inventory.equipArmorItem) { inventory.equipArmorItem(true); return; }
    const t = game.targetBlock;
    if (!t?.normal) return;
    if (isHoe(active.id) && game.farmingManager.till(t.x, t.y, t.z, player)) return;
    if (getSeedCrop(active.id) && game.farmingManager.plant(t.x, t.y, t.z, active.id, player)) return;
    const at = [t.x + t.normal.x, t.y + t.normal.y, t.z + t.normal.z];
    const blockId = active.isBlock
      ? (active.blockId ?? (typeof active.id === 'number' ? active.id : BLOCKS[String(active.id).toUpperCase()]))
      : (ITEMS[active.id]?.blockId ?? BLOCKS[String(active.id).toUpperCase()]);
    if (typeof blockId !== 'number' || world.getVoxel(...at) !== BLOCKS.AIR) return;
    // Not inside a player.
    for (const other of this.players) {
      if (!other.alive) continue;
      const p = other.player.position;
      if (Math.floor(p.x) === at[0] && Math.floor(p.z) === at[2] && (Math.floor(p.y) === at[1] || Math.floor(p.y) + 1 === at[1])) return;
    }
    world.setVoxel(...at, blockId);
    inventory.consumeActiveItem();
  }

  // --- plans ----------------------------------------------------------------------------------------------------
  /**
   * Hand in a player's plan for the next round: up to six steps, run in order. A plan replaces whatever was left of the
   * last one. Steps are the player bot's commands ("mine 4 oak_log", "craft 1 stone_sword", "place cobblestone at x y
   * z", "go to x y z", "acquire 1 iron_sword", "eat cooked_beef", "attack cow") or the arena's own: "attack player
   * <name>", "shoot player <name>", "follow <name>", "guard", "wait".
   */
  submit(name, { thought = '', plan = [], chat = '' } = {}) {
    const entry = this.byName(name);
    if (!entry) throw new Error(`No player called ${name}.`);
    if (!entry.alive) return { ok: false, error: 'You have been eliminated.' };
    const steps = (Array.isArray(plan) ? plan : [plan]).map(s => String(s).trim()).filter(Boolean).slice(0, 6);
    const rejected = [];
    const accepted = [];
    // "continue" keeps the step in progress and the rest of the last plan: a long step (an acquire that gathers,
    // crafts and smelts) can take more than one round, and a new plan would cut it off.
    const keepGoing = steps.length === 1 && /^continue\b/i.test(steps[0]);
    for (const step of keepGoing ? [] : steps) {
      const problem = this.checkStep(step);
      if (problem) rejected.push({ step, problem }); else accepted.push(step);
    }
    entry.thought = String(thought).slice(0, 2000);
    if (keepGoing) accepted.push('continue');
    else if (accepted.length) {
      // A plan that starts with the step already running carries on with it rather than starting it again.
      if (entry.current && accepted[0].toLowerCase() === String(entry.current.step).toLowerCase()) entry.plan = accepted.slice(1);
      else { this.stopCurrent(entry); entry.plan = accepted; }
    }
    if (chat) {
      const message = { round: this.round, time: +this.time.toFixed(1), from: name, team: entry.team.name, text: String(chat).slice(0, 400) };
      this.chat ??= [];
      this.chat.push(message);
    }
    this.log('plan', { player: name, team: entry.team.name, thought: entry.thought, plan: accepted, rejected, chat: chat || undefined });
    return { ok: true, accepted, rejected };
  }

  checkStep(step) {
    const s = step.toLowerCase();
    if (/^(attack|shoot|fight)\s+player\s+\S+/.test(s) || /^follow\s+\S+/.test(s) || /^(guard|wait)\b/.test(s)) {
      const who = s.match(/player\s+(\S+)|^follow\s+(\S+)/);
      const name = who && (who[1] || who[2]);
      if (name && !this.byName(name)) return `There is no player called ${name}.`;
      return null;
    }
    try {
      const parsed = parsePlayerCommand(step);
      if (!parsed) return 'Not a command the player can do. See the command list.';
      if (parsed.type === 'command') return 'Chat commands (/give and the like) are not allowed: this is Survival.';
      if (parsed.type === 'pvp') return 'Use "attack player <name>".';
      return null;
    } catch (error) { return error.message; }
  }

  byName(name) { return this.players.find(p => p.name.toLowerCase() === String(name).toLowerCase()); }

  stopCurrent(entry) {
    if (entry.bot.task) entry.bot.stop('Replaced by a new plan.');
    entry.current = null;
  }

  // --- the round --------------------------------------------------------------------------------------------------
  /** Play one round: every plan at once for ROUND_SECONDS. Returns each player's report. */
  async playRound() {
    if (this.over) return this.over;
    this.round++;
    for (const e of this.players) { e.lastResults = []; e.roundStart = { health: e.player.health, hunger: e.player.hunger }; e.hurtBy = new Set(); }
    this.log('round', { round: this.round, border: this.borderRadius() });
    const steps = Math.round(ROUND_SECONDS / STEP);
    for (let i = 0; i < steps && !this.over; i++) {
      this.step(STEP);
      // The bots' path searches resolve between ticks.
      if (i % 4 === 0) await Promise.resolve();
    }
    return this.over;
  }

  borderRadius() {
    const b = this.border;
    return Math.max(b.min, b.radius - Math.max(0, this.round - b.shrinkFrom) * b.perRound);
  }

  step(dt) {
    this.time += dt;
    for (const e of this.players) if (e.alive) this.stepPlayer(e, dt);
    this.stepAnimals(dt);
    this.furnaceManager.update(dt);
    this.pickups(dt);
    this.checkDeaths();
    if (this.time >= this.nextFrameAt) { this.recordFrame(); this.nextFrameAt = this.time + FRAME_SECONDS; }
  }

  stepPlayer(e, dt) {
    const { player, game, bot } = e;
    e.swing = Math.max(0, e.swing - dt);
    e.attackReady = Math.max(0, e.attackReady - dt);
    if (!e.current && e.plan.length) this.startStep(e, e.plan.shift());
    if (e.current?.arena) this.stepArenaAction(e, dt);
    if (bot.task) bot.tick(dt);
    player.update(dt);
    // The world border: 1 health a second outside it.
    const r = this.borderRadius(), p = player.position;
    if (Math.hypot(p.x - this.border.center.x, p.z - this.border.center.z) > r) {
      e.borderDamage = (e.borderDamage || 0) + dt;
      if (e.borderDamage >= 1) { e.borderDamage = 0; player.takeDamage(1, null, 'generic'); e.lastHurtCause = 'the world border'; }
    }
    if (Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) this.loadAround(p.x, p.z, 2);
    this.raycast(e);
    if (bot.task) bot.afterRaycast();
    this.mine(e, dt);
    if (e.current && !e.current.arena && !bot.task && e.current.promise) {
      // The bot finished (its promise settled): on to the next step.
      if (e.current.done) e.current = null;
    }
  }

  startStep(e, step) {
    const s = step.toLowerCase().trim();
    e.label = step;
    let m;
    if ((m = s.match(/^(attack|fight)\s+player\s+(\S+)/))) { e.current = { arena: 'melee', target: this.byName(m[2]), step }; return; }
    if ((m = s.match(/^shoot\s+player\s+(\S+)/))) { e.current = { arena: 'shoot', target: this.byName(m[1]), step, draw: 0 }; return; }
    if ((m = s.match(/^follow\s+(\S+)/))) { e.current = { arena: 'follow', target: this.byName(m[1]), step }; return; }
    if (/^guard\b/.test(s)) { e.current = { arena: 'guard', step, at: e.player.position.clone() }; return; }
    if (/^wait\b/.test(s)) { e.current = { arena: 'wait', step, until: this.time + 10 }; return; }
    const current = { step, done: false };
    e.current = current;
    current.promise = e.bot.run(step).then(
      (result) => { current.done = true; this.result(e, step, !!result?.ok, result?.message ?? ''); },
      (error) => { current.done = true; this.result(e, step, false, error?.message ?? String(error)); });
  }

  result(e, step, ok, message) {
    e.lastResults.push({ step, ok, message: String(message).slice(0, 300) });
    this.log('result', { player: e.name, step, ok, message: String(message).slice(0, 300) });
  }

  // --- fighting, following, guarding -------------------------------------------------------------------------------
  stepArenaAction(e, dt) {
    const c = e.current, me = e.player;
    const finish = (ok, message) => { this.result(e, c.step, ok, message); if (e.bot.task) e.bot.stop('Done.'); e.current = null; };
    if (c.arena === 'wait') { if (this.time >= c.until) finish(true, 'Waited.'); return; }
    if (c.arena === 'guard') {
      const enemy = this.nearestEnemy(e, 10);
      if (enemy) { this.melee(e, enemy, dt); return; }
      if (me.position.distanceTo(c.at) > 3 && !e.bot.task) this.walkTo(e, c.at);
      return;
    }
    const target = c.target;
    if (!target || !target.alive) { finish(true, target ? `${target.name} is down.` : 'No target.'); return; }
    if (c.arena === 'follow') {
      if (me.position.distanceTo(target.player.position) > 3) this.chase(e, target);
      else if (e.bot.task) e.bot.stop('Caught up.');
      return;
    }
    if (c.arena === 'melee') { this.melee(e, target, dt); return; }
    if (c.arena === 'shoot') this.shoot(e, target, dt, finish);
  }

  nearestEnemy(e, within) {
    let best = null, bestD = within;
    for (const o of this.players) {
      if (!o.alive || o.team === e.team) continue;
      const d = o.player.position.distanceTo(e.player.position);
      if (d < bestD) { best = o; bestD = d; }
    }
    return best;
  }

  walkTo(e, to) {
    if (e.bot.task) e.bot.stop('Re-routing.');
    e.walkTarget = to.clone ? to.clone() : new THREE.Vector3(to.x, to.y, to.z);
    e.bot.run({ type: 'goto', position: [Math.floor(to.x), Math.floor(to.y), Math.floor(to.z)] }).catch(() => {});
  }

  /**
   * Walk toward a moving player. A new route only when the walk has ended or the target has moved well away from where
   * the last one led, and no more than every 3 s: a path search across the map takes longer than a second, and
   * restarting it every 1.5 s meant no chase ever left the spot.
   */
  chase(e, target) {
    const tp = target.player.position;
    const ended = !e.bot.task;
    const drifted = e.walkTarget && e.walkTarget.distanceTo(tp) > Math.max(4, e.player.position.distanceTo(tp) * .3);
    if (ended || ((drifted || !e.walkTarget) && (e.repathAt ?? 0) < this.time)) {
      e.repathAt = this.time + 3;
      this.walkTo(e, tp);
    }
  }

  face(e, pos) {
    const p = e.player.position, dx = pos.x - p.x, dz = pos.z - p.z;
    e.player.yaw = Math.atan2(-dx, -dz);
    e.player.pitch = Math.atan2(pos.y + 1.2 - (p.y + 1.62), Math.hypot(dx, dz));
  }

  /** A melee fight: close in, face the target, and swing whenever the weapon's cooldown has run out. */
  melee(e, target, dt) {
    const me = e.player, them = target.player;
    const d = me.position.distanceTo(them.position);
    if (d > 3) { this.chase(e, target); return; }
    if (e.bot.task) e.bot.stop('In reach.');
    this.face(e, them.position);
    if (e.attackReady > 0) return;
    const held = e.inventory.getActiveItem();
    const weapon = held?.id;
    e.attackReady = attackCooldown(weapon);
    e.swing = .3;
    const before = them.health;
    them.takeDamage(meleeDamage(weapon), me.position.clone(), 'player', me, { weapon: String(weapon || '') });
    hitKnockback(them.velocity, { position: them.position, from: me.position, onGround: them.onGround });
    if (held && /_(sword|axe)$/.test(String(weapon))) spendDurability(held, 1, this.random);
    this.recordHit(e, target, before - them.health, 'melee', weapon);
  }

  /** A bow shot: needs a bow and an arrow, a clear line, and a second to draw. Closer and stiller targets are easier. */
  shoot(e, target, dt, finish) {
    const me = e.player, them = target.player;
    const bow = this.countOf(e, 'bow'), arrows = this.countOf(e, 'arrow');
    if (!bow) { finish(false, 'No bow.'); return; }
    if (!arrows) { finish(false, 'No arrows left.'); return; }
    const d = me.position.distanceTo(them.position);
    if (d > 40 || !this.lineOfSight(me.position, them.position)) { e.current.draw = 0; this.chase(e, target); return; }
    if (e.bot.task) e.bot.stop('In range.');
    e.bot.equip?.(s => s?.id === 'bow');
    this.face(e, them.position);
    e.current.draw = (e.current.draw || 0) + dt;
    me.bowDraw = Math.min(1, e.current.draw);
    if (e.current.draw < 1) return;
    e.current.draw = 0; me.bowDraw = 0;
    this.takeOne(e, 'arrow');
    const moving = Math.hypot(them.velocity.x, them.velocity.z) > 1 ? .2 : 0;
    const chance = Math.max(.15, .95 - d * .018 - moving);
    const hit = this.random() < chance;
    this.log('arrow', { from: e.name, to: target.name, hit, a: me.position.toArray().map(v => +v.toFixed(1)), b: them.position.toArray().map(v => +v.toFixed(1)) });
    if (!hit) { this.log('miss', { player: e.name, target: target.name, distance: +d.toFixed(1) }); return; }
    const before = them.health;
    them.takeDamage(6 + Math.floor(this.random() * 4), me.position.clone(), 'arrow', me);
    this.recordHit(e, target, before - them.health, 'arrow', 'bow');
  }

  recordHit(e, target, amount, kind, weapon) {
    if (amount <= 0) return;
    e.damageDealt += amount;
    target.hurtBy?.add(e.name);
    target.lastAttacker = e;
    target.lastHurtCause = `${e.name}'s ${kind === 'arrow' ? 'arrow' : weapon ? String(weapon).replace(/_/g, ' ') : 'fist'}`;
    this.log('hit', { from: e.name, to: target.name, amount: +amount.toFixed(1), how: kind, weapon: itemName(weapon) || 'fist', health: +target.player.health.toFixed(1) });
    // Reflex: someone hit from close by who is not already fighting hits back, as a player would.
    if (kind === 'melee' && target.alive && !['melee', 'shoot'].includes(target.current?.arena)) {
      target.reflex = (target.reflex || 0) + 1;
      this.stopCurrent(target);
      target.plan.unshift(`attack player ${e.name}`);
      target.lastResults.push({ step: '(reflex)', ok: true, message: `${e.name} attacked you, so you turned to fight back.` });
    }
  }

  lineOfSight(a, b) {
    const from = { x: a.x, y: a.y + 1.62, z: a.z }, to = { x: b.x, y: b.y + 1.4, z: b.z };
    const d = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    for (let s = .5; s < d; s += .3) {
      const k = s / d, v = this.world.getVoxel(Math.floor(from.x + (to.x - from.x) * k), Math.floor(from.y + (to.y - from.y) * k), Math.floor(from.z + (to.z - from.z) * k));
      if (v !== BLOCKS.AIR && BLOCK_DEFS[v]?.solid !== false && !/leaves|glass/i.test(BLOCK_DEFS[v]?.name || '')) return false;
    }
    return true;
  }

  countOf(e, id) {
    const inv = e.inventory;
    return [...inv.hotbar, ...(inv.storage || [])].filter(s => s && s.id === id).reduce((n, s) => n + s.count, 0);
  }

  takeOne(e, id) {
    const inv = e.inventory;
    for (const list of [inv.hotbar, inv.storage || []]) for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s && s.id === id) { s.count--; if (s.count <= 0) list[i] = null; return true; }
    }
    return false;
  }

  // --- the world's own ticking: what the browser game's frame loop does for one player ------------------------------
  raycast(e) {
    const { player, camera, game } = e, world = this.world;
    camera.position.set(player.position.x, player.position.y + (player.isSneaking ? 1.38 : player.eyeHeight || 1.62), player.position.z);
    const cp = Math.cos(player.pitch || 0);
    const dir = new THREE.Vector3(-Math.sin(player.yaw || 0) * cp, Math.sin(player.pitch || 0), -Math.cos(player.yaw || 0) * cp).normalize();
    camera.getWorldDirection = (v = new THREE.Vector3()) => v.copy(dir);
    game.targetBlock = null;
    for (let d = 0; d < 5.2; d += .05) {
      const p = camera.position.clone().addScaledVector(dir, d);
      const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z), id = world.getVoxel(x, y, z);
      if (id !== BLOCKS.AIR && id !== BLOCKS.WATER) {
        const prev = p.clone().sub(dir.clone().multiplyScalar(.05));
        const normal = { x: Math.floor(prev.x) - x, y: Math.floor(prev.y) - y, z: Math.floor(prev.z) - z };
        if (!normal.x && !normal.y && !normal.z) normal.y = 1;
        game.targetBlock = { x, y, z, blockId: id, normal };
        break;
      }
    }
    game.targetMob = null;
    for (const mob of this.animals) if (mob.health > 0 && camera.position.distanceTo(mob.mesh.position) < 4) { game.targetMob = mob; break; }
  }

  mine(e, dt) {
    const { game, inventory } = e;
    if (!game.isMouseDown || !game.targetBlock) { game.miningTime = 0; return; }
    const b = game.targetBlock, held = inventory.getActiveItem();
    game.miningTime += dt;
    e.swing = .3;
    if (game.miningTime < breakTimeSeconds(b.blockId, ITEMS[held?.id], held?.id)) return;
    this.world.setVoxel(b.x, b.y, b.z, BLOCKS.AIR);
    game.miningTime = 0;
    if (held && /_(pickaxe|axe|shovel|hoe)$/.test(String(held.id))) spendDurability(held, 1, this.random);
    if (!harvestsNothing(b.blockId, ITEMS[held?.id], held?.id)) {
      for (const drop of blockDrops(b.blockId, this.random)) game.entities.spawnDroppedItem({ x: b.x + .5, y: b.y + .5, z: b.z + .5 }, drop.id, drop.isBlock, drop.count);
    }
  }

  pickups(dt) {
    for (let i = this.droppedItems.length - 1; i >= 0; i--) {
      const item = this.droppedItems[i];
      item.age += dt;
      // Items fall to the ground (a log from the top of a tree would otherwise hang where it was).
      const ip = item.group.position, below = this.world.getVoxel(Math.floor(ip.x), Math.floor(ip.y - .3), Math.floor(ip.z));
      if ((below === BLOCKS.AIR || below === BLOCKS.WATER || BLOCK_DEFS[below]?.solid === false) && ip.y > 0) ip.y -= Math.min(ip.y, 8 * dt);
      // Its owner gets it at once: the bot's next step (crafting with the logs it just cut) should not miss it.
      if (item.age < item.pickupDelay && !item.owner?.alive) continue;
      // The one who broke or hunted it picks it up from where they stand; anyone else has to walk over it (a fallen
      // player's things are anyone's).
      let best = null, bestD = 1.8;
      const owner = item.owner?.alive ? item.owner : null;
      if (owner && item.group.position.distanceTo(owner.player.position) < 8) best = owner;
      else for (const e of this.players) {
        if (!e.alive || (owner && item.age < 4)) continue;
        const d = item.group.position.distanceTo(e.player.position);
        if (d < bestD) { best = e; bestD = d; }
      }
      if (best && best.inventory.addItem(item.itemType, item.isBlock, item.count) !== false) {
        this.droppedItems.splice(i, 1);
        if (item.loot) this.log('loot', { player: best.name, item: item.itemType, count: item.count, from: item.loot });
      }
    }
  }

  stepAnimals(dt) {
    for (const a of this.animals) {
      a.wander -= dt;
      if (a.wander <= 0) { a.wander = 2 + this.random() * 4; a.heading = this.random() * Math.PI * 2; a.moving = this.random() < .5; }
      const speed = a.fleeing > 0 ? 3 : a.moving ? .8 : 0;
      a.fleeing = Math.max(0, a.fleeing - dt);
      if (!speed) continue;
      const p = a.mesh.position, nx = p.x + Math.sin(a.heading) * speed * dt, nz = p.z + Math.cos(a.heading) * speed * dt;
      const ny = this.surfaceY(nx, nz);
      if (Math.abs(ny - p.y) <= 1 && this.world.getVoxel(Math.floor(nx), ny - 1, Math.floor(nz)) !== BLOCKS.WATER) p.set(nx, ny, nz);
      else a.heading += Math.PI / 2;
    }
    // A few more wander in over time, away from the players, so food does not run out.
    if (this.animals.length < 14 && this.random() < dt * .05) {
      const x = (this.random() - .5) * 140, z = (this.random() - .5) * 140;
      if (this.players.every(e => !e.alive || Math.hypot(e.player.position.x - x, e.player.position.z - z) > 24)) this.spawnAnimal(x, z);
    }
  }

  checkDeaths() {
    for (const e of this.players) {
      if (!e.alive) continue;
      const p = e.player;
      if (p.health > 0 && !p.isDead && p.position.y > -10) continue;
      e.alive = false;
      const killer = e.lastAttacker?.alive ? e.lastAttacker : null;
      if (killer) killer.kills++;
      e.killedBy = killer?.name ?? null;
      const before = this.droppedItems.length;
      if (!p.isDead) p.die?.();
      for (const item of this.droppedItems.slice(before)) item.loot = e.name;
      if (e.bot.task) e.bot.stop('Eliminated.');
      e.current = null; e.plan = [];
      this.log('death', { player: e.name, team: e.team.name, by: e.killedBy, cause: e.lastHurtCause || 'unknown', at: p.position.toArray().map(v => +v.toFixed(1)) });
    }
    const standing = this.teams.filter(t => this.players.some(e => e.team === t && e.alive));
    if (standing.length <= 1 && !this.over) {
      this.over = { winner: standing[0]?.name ?? null, round: this.round, time: +this.time.toFixed(1),
        survivors: this.players.filter(e => e.alive).map(e => e.name) };
      this.log('game_over', this.over);
    }
  }

  recordFrame() {
    this.frames.push({
      t: +this.time.toFixed(2),
      p: this.players.map(e => {
        const p = e.player;
        return [+p.position.x.toFixed(2), +p.position.y.toFixed(2), +p.position.z.toFixed(2), +(p.yaw || 0).toFixed(2), +(p.pitch || 0).toFixed(2),
          e.alive ? +p.health.toFixed(1) : 0, e.inventory.getActiveItem()?.id ?? null, e.swing > 0 ? 1 : 0,
          Object.values(e.inventory.armor || {}).map(a => a?.id ?? null)];
      }),
      a: this.animals.map(a => [a.id, a.type, +a.mesh.position.x.toFixed(1), +a.mesh.position.y.toFixed(1), +a.mesh.position.z.toFixed(1), +(a.heading || 0).toFixed(2)]),
    });
  }

  log(kind, data) {
    this.events.push({ t: +this.time.toFixed(2), round: this.round, kind, ...data });
    this.onLog?.({ t: +this.time.toFixed(2), round: this.round, kind, ...data });
  }

  // --- what a player sees ----------------------------------------------------------------------------------------
  /** The report a player plans from: themselves, their team, enemies in sight, a map of the area, and team chat. */
  observe(name) {
    const e = this.byName(name);
    const me = e.player, p = me.position, inv = e.inventory;
    const items = {};
    for (const s of [...inv.hotbar, ...(inv.storage || [])]) if (s) { const id = itemName(s.id); items[id] = (items[id] || 0) + s.count; }
    const pos = (v) => [Math.floor(v.x), Math.floor(v.y), Math.floor(v.z)];
    const mates = this.players.filter(o => o.team === e.team && o !== e).map(o => ({ name: o.name, alive: o.alive, at: o.alive ? pos(o.player.position) : null, health: o.alive ? Math.round(o.player.health) : 0, doing: o.alive ? o.label : 'eliminated' }));
    const enemies = this.players.filter(o => o.team !== e.team).map(o => {
      if (!o.alive) return { name: o.name, alive: false };
      const d = o.player.position.distanceTo(p);
      const seen = d < 48 && (d < 12 || this.lineOfSight(p, o.player.position));
      return seen ? { name: o.name, alive: true, at: pos(o.player.position), distance: Math.round(d), health: Math.round(o.player.health), holding: itemName(o.inventory.getActiveItem()?.id) ?? 'nothing', armor: Object.values(o.inventory.armor || {}).filter(Boolean).map(a => a.id) } : { name: o.name, alive: true, seen: false };
    });
    const chat = (this.chat || []).filter(m => m.team === e.team && m.round >= this.round - 1).map(m => `${m.from}: ${m.text}`);
    const hp = me.health;
    return {
      you: { name: e.name, team: e.team.name, alive: e.alive, at: pos(p), health: Math.round(hp * 10) / 10, hunger: me.hunger, holding: itemName(inv.getActiveItem()?.id) ?? 'nothing', armor: Object.values(inv.armor || {}).filter(Boolean).map(a => a.id), inventory: items, doing: e.current ? e.label : 'nothing (idle)', still_working: !!e.current, plan_left: e.plan },
      round: this.round, game_time_s: Math.round(this.time), round_seconds: ROUND_SECONDS,
      border: { center: [0, 0], radius: this.borderRadius(), next_radius: Math.max(this.border.min, this.borderRadius() - (this.round + 1 > this.border.shrinkFrom ? this.border.perRound : 0)), shrinks_from_round: this.border.shrinkFrom },
      your_base: [e.team.base.x, e.team.base.y, e.team.base.z],
      your_quarry: [e.team.quarry.x, this.surfaceY(e.team.quarry.x, e.team.quarry.z), e.team.quarry.z],
      centre_quarry: [0, this.surfaceY(0, 0), 0],
      teammates: mates,
      enemies,
      last_round: e.lastResults,
      team_chat: chat,
      map: this.asciiMap(e),
      over: this.over,
    };
  }

  /** A 25 x 25 top-down map around the player, one character a block. */
  asciiMap(e, R = 12) {
    const p = e.player.position, cx = Math.floor(p.x), cz = Math.floor(p.z), rows = [];
    const marks = new Map();
    for (const a of this.animals) marks.set(`${Math.floor(a.mesh.position.x)},${Math.floor(a.mesh.position.z)}`, { cow: 'c', pig: 'p', sheep: 's', chicken: 'h' }[a.type]);
    for (const o of this.players) if (o.alive) marks.set(`${Math.floor(o.player.position.x)},${Math.floor(o.player.position.z)}`, o === e ? '@' : o.team === e.team ? 'A' : 'X');
    for (let z = cz - R; z <= cz + R; z++) {
      let row = '';
      for (let x = cx - R; x <= cx + R; x++) {
        const mark = marks.get(`${x},${z}`);
        if (mark) { row += mark; continue; }
        let y = 62; while (y > 1 && this.world.getVoxel(x, y, z) === BLOCKS.AIR) y--;
        const name = BLOCK_DEFS[this.world.getVoxel(x, y, z)]?.name?.toLowerCase() || '';
        row += /water/.test(name) ? '~' : /leaves|log/.test(name) ? 'T' : /crafting/.test(name) ? 'C' : /furnace/.test(name) ? 'F' : /chest/.test(name) ? 'H'
          : /planks|cobblestone|brick|wool|fence|door/.test(name) ? '#' : /stone|ore|andesite|diorite|granite|gravel/.test(name) ? 'o' : /sand/.test(name) ? ':' : '.';
      }
      rows.push(row);
    }
    return { top_left: [cx - R, cz - R], rows, legend: '@ you, A teammate, X enemy, c cow, p pig, s sheep, h chicken, T tree, o stone/ore, ~ water, : sand, # built blocks, C crafting table, F furnace, H chest, . ground. Rows run north (-z) to south (+z), columns west (-x) to east (+x).' };
  }

  /** The recording for the film: the world seed, every block change, a frame every 0.25 s, and the events. */
  recording() {
    return {
      version: 2, seed: this.seed, biome: this.world.selectedBiome, spread: this.spread, roundSeconds: ROUND_SECONDS, frameSeconds: FRAME_SECONDS,
      border: { radius: this.border.radius, shrinkFrom: this.border.shrinkFrom, perRound: this.border.perRound, min: this.border.min },
      teams: this.teams.map(t => ({ name: t.name, color: t.color, players: t.players, base: t.base })),
      players: this.players.map(e => ({ name: e.name, team: e.team.name, killedBy: e.killedBy, kills: e.kills, damageDealt: Math.round(e.damageDealt) })),
      over: this.over, blockChanges: this.blockChanges, frames: this.frames, events: this.events,
    };
  }
}
