// A Mineflayer-compatible bot for Blockyland (the replication run's client).
//
// Like Mineflayer, the bot keeps its own picture of the world from what the server sends: the chunks around its
// player, the entities it can see, its own state and inventory. Reads (`bot.blockAt`, `bot.entities`,
// `bot.inventory.items()`) answer from that picture, synchronously. Actions (`bot.dig`, `bot.placeBlock`,
// `bot.attack`, `bot.craft`, windows) go to the server, which runs them through the game's own code.
//
// The subset is what a survival game uses; docs/api.md (in the agents' workspace) lists it and every difference from
// Mineflayer. The pathfinder plugin is in pathfinder.js.
import { EventEmitter } from 'node:events';
import { Vec3 } from './vec3.js';
import { registry, itemFromStack } from './registry.js';
import { RECIPES_2X2, RECIPES_3X3, findMatchingRecipe } from '../../src/crafting.js';

const CONTROL_NAMES = ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak'];
const HEIGHT = 64;

class Block {
  constructor(r, id, pos) {
    const def = r.blocks[id] ?? { name: `unknown_${id}`, displayName: `Unknown ${id}`, hardness: 0, diggable: true, boundingBox: 'block', transparent: false };
    this.type = id; this.name = def.name; this.displayName = def.displayName; this.hardness = def.hardness;
    this.diggable = def.diggable; this.boundingBox = def.boundingBox; this.transparent = def.transparent;
    this.position = pos; this.metadata = 0; this.stateId = id; this.light = 15; this.skyLight = 15; this.biome = { name: 'unknown' };
  }
}

class Entity {
  constructor(id) { this.id = id; this.position = new Vec3(); this.velocity = new Vec3(); this.isValid = true; this.metadata = []; this.equipment = []; }
  update(e) {
    this.type = e.kind === 'mob' ? (HOSTILE.has(e.name) ? 'hostile' : 'mob') : e.kind === 'item' ? 'object' : e.kind === 'player' ? 'player' : e.kind === 'orb' ? 'orb' : 'object';
    this.name = e.kind === 'player' ? 'player' : e.name; this.displayName = e.name;
    this.kind = e.kind === 'mob' ? (HOSTILE.has(e.name) ? 'Hostile mobs' : 'Passive mobs') : e.kind;
    this.objectType = e.kind === 'item' ? 'Item' : undefined;
    this.username = e.username; this.health = e.health; this.isBaby = !!e.baby;
    this.velocity.set(e.pos[0] - this.position.x, e.pos[1] - this.position.y, e.pos[2] - this.position.z);
    this.position.set(e.pos[0], e.pos[1], e.pos[2]);
    this.yaw = e.yaw ?? 0; this.pitch = e.pitch ?? 0; this.height = e.height ?? (e.kind === 'item' ? .25 : 1.8); this.width = e.width ?? .6;
    this.onGround = true; this._item = e.item; this.heldItem = e.held ?? null;
  }
  getDroppedItem() { return this._item ? { ...itemFromStack({ name: this._item.name, count: this._item.count, slot: null }) } : null; }
}

const HOSTILE = new Set(['zombie', 'husk', 'drowned', 'skeleton', 'stray', 'creeper', 'spider', 'cave_spider', 'enderman', 'witch', 'slime', 'magma_cube', 'blaze', 'ghast', 'wither_skeleton', 'piglin_brute', 'hoglin', 'zoglin', 'phantom', 'silverfish', 'endermite', 'shulker', 'guardian', 'elder_guardian', 'pillager', 'vindicator', 'evoker', 'ravager', 'vex', 'ender_dragon', 'wither', 'zombie_villager', 'warden', 'bogged', 'breeze']);

export class Bot extends EventEmitter {
  /**
   * @param {string} username
   * @param {{call:(method:string,...args:any[])=>Promise<any>}} transport the server bridge
   */
  constructor(username, transport) {
    super();
    this.setMaxListeners(100);
    this.username = username;
    this.transport = transport;
    this.registry = registry();
    this.version = '1.20.4';
    this.majorVersion = '1.20';
    this.chunks = new Map();
    this.entities = {};
    this.players = {};
    this.entity = new Entity(0);
    Object.assign(this.entity, { type: 'player', name: 'player', username, height: 1.8, width: .6 });
    this.entities[0] = this.entity;
    this.game = { dimension: 'overworld', difficulty: 'easy', gameMode: 'survival', hardcore: false, minY: 0, height: HEIGHT, levelType: 'default' };
    this.time = { timeOfDay: 0, day: 0, age: 0, isDay: true, time: 0 };
    this.health = 20; this.food = 20; this.foodSaturation = 5; this.oxygenLevel = 20;
    this.experience = { level: 0, points: 0, progress: 0 };
    this.isSleeping = false; this.isRaining = false; this.rainState = 0; this.thunderState = 0; this.spawnPoint = null; this.usingHeldItem = false;
    this.controlState = Object.fromEntries(CONTROL_NAMES.map(k => [k, false]));
    this.quickBarSlot = 0;
    this.inventory = makeInventory(this);
    this.currentWindow = null;
    this.targetDigBlock = null;
    this.ready = false;
    this.tickCount = 0;
    this.received = []; // chat and system messages, for the program output
    this.pathfinder = null; // installed by pathfinder.js
    // prismarine-world's interface, as goals and programs use it
    this.world = { getBlock: (p) => this.blockAt(p), getBlockType: (p) => this.blockAt(p)?.type ?? 0 };
  }

  // ---------- from the server ----------

  /** One tick's packet for this player (bridge.pull). */
  receive(packet, time) {
    const s = packet.state;
    if (packet.chunkReset || s.dim !== this.game.dimension) { this.chunks.clear(); for (const id of Object.keys(this.entities)) if (id !== '0') { this.entities[id].isValid = false; delete this.entities[id]; } }
    if (s.dim !== this.game.dimension) { this.game.dimension = s.dim; this.emit('dimensionChange', s.dim); }
    for (const [cx, cz, data] of packet.chunks) this.chunks.set(`${cx},${cz}`, decode(data));
    for (const [x, y, z, id] of packet.blocks) {
      const c = this.chunks.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`);
      if (!c) continue;
      const i = (y * 16 + (z - Math.floor(z / 16) * 16)) * 16 + (x - Math.floor(x / 16) * 16), old = c[i];
      c[i] = id;
      if (old !== id && this.listenerCount('blockUpdate')) this.emit('blockUpdate', new Block(this.registry, old, new Vec3(x, y, z)), new Block(this.registry, id, new Vec3(x, y, z)));
    }
    const e = this.entity, wasDead = this.health <= 0;
    e.velocity.set(...s.vel); e.position.set(...s.pos); e.yaw = s.yaw; e.pitch = s.pitch; e.onGround = s.onGround;
    e.isInWater = s.inWater; e.isInLava = s.inLava;
    const oldHealth = this.health, oldFood = this.food;
    this.health = s.health; this.food = s.food; this.foodSaturation = s.saturation; this.oxygenLevel = s.oxygen;
    this.experience = { level: s.xp.level, points: Math.round(s.xp.progress * 100), progress: s.xp.progress };
    this.isSleeping = s.sleeping; this.spawnPoint = s.spawnPoint ? new Vec3(...s.spawnPoint) : null;
    // Mineflayer: bot.isRaining, bot.rainState, bot.thunderState, and 'rain' when it starts or stops; 'weatherUpdate'.
    const wasRaining = this.isRaining, oldThunder = this.thunderState;
    this.isRaining = !!s.raining; this.rainState = s.raining ? 1 : 0; this.thunderState = s.thundering ? 1 : 0;
    if (this.ready && wasRaining !== this.isRaining) { this.emit('rain'); this.emit('weatherUpdate'); }
    else if (this.ready && oldThunder !== this.thunderState) this.emit('weatherUpdate');
    e.effects = Object.fromEntries((s.effects ?? []).map(x => [x.id, x]));
    if (packet.inventory) applyInventory(this, packet.inventory);
    // entities
    const seen = new Set(['0']);
    this.players = { [this.username]: { username: this.username, entity: e, ping: 0, gamemode: 0 } };
    for (const raw of packet.entities) {
      const key = String(raw.id); seen.add(key);
      let ent = this.entities[key];
      const isNew = !ent;
      if (!ent) { ent = new Entity(raw.id); this.entities[key] = ent; }
      ent.update(raw);
      if (raw.kind === 'player') this.players[raw.username] = { username: raw.username, entity: ent, ping: 0, gamemode: 0 };
      if (isNew && this.ready) this.emit('entitySpawn', ent);
    }
    for (const key of Object.keys(this.entities)) if (!seen.has(key)) { const ent = this.entities[key]; ent.isValid = false; delete this.entities[key]; if (this.ready) this.emit('entityGone', ent); }
    // time
    const t = time;
    this.time = { age: t, time: t, timeOfDay: ((t % 24000) + 24000) % 24000, day: Math.floor(t / 24000), isDay: (((t % 24000) + 24000) % 24000) < 12542 || (((t % 24000) + 24000) % 24000) > 23460 };
    // messages
    for (const m of packet.messages) {
      this.received.push(m);
      if (m.kind === 'chat') { this.emit('chat', m.from, m.text, null, null, null); this.emit('messagestr', `<${m.from}> ${m.text}`, 'chat'); }
      else this.emit('messagestr', m.text, 'system');
    }
    if (this.received.length > 400) this.received.splice(0, this.received.length - 400);
    if (!this.ready) { this.ready = true; this.emit('spawn'); this.emit('login'); }
    if (this.health !== oldHealth || this.food !== oldFood) this.emit('health');
    if (!wasDead && this.health <= 0) this.emit('death');
    if (wasDead && this.health > 0) { this.emit('respawn'); this.emit('spawn'); }
    this.tickCount++;
    this.emit('physicsTick'); this.emit('physicTick');
    this.emit('time');
    this.emit('move');
  }

  // ---------- world queries ----------

  blockAt(point) {
    const x = Math.floor(point.x), y = Math.floor(point.y), z = Math.floor(point.z);
    if (y < 0 || y >= HEIGHT) return y >= HEIGHT ? new Block(this.registry, 0, new Vec3(x, y, z)) : null;
    const c = this.chunks.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`);
    if (!c) return null;
    return new Block(this.registry, c[(y * 16 + (z - Math.floor(z / 16) * 16)) * 16 + (x - Math.floor(x / 16) * 16)], new Vec3(x, y, z));
  }

  findBlocks({ matching, point = null, maxDistance = 16, count = 1, useExtraInfo = null } = {}) {
    const test = typeof matching === 'function' ? (b) => matching(b) : Array.isArray(matching) ? (b) => matching.includes(b.type) : (b) => b.type === matching;
    const fnTakesBlock = typeof matching === 'function';
    const o = (point ?? this.entity.position).floored(), out = [];
    const R = Math.min(Math.floor(maxDistance), 128);
    const scratch = new Block(this.registry, 0, new Vec3());
    scratch.reset = function (id, x, y, z) { const d = this.r.blocks[id]; this.type = id; this.stateId = id; this.name = d?.name ?? `unknown_${id}`; this.displayName = d?.displayName ?? this.name; this.hardness = d?.hardness ?? 0; this.diggable = d?.diggable ?? true; this.boundingBox = d?.boundingBox ?? 'block'; this.transparent = d?.transparent ?? false; this.position.set(x, y, z); };
    scratch.r = this.registry;
    // nearest first: shells of growing Chebyshev radius, then sorted by true distance within the result
    for (let r = 0; r <= R && out.length < count * 4; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
        const y = o.y + dy; if (y < 0 || y >= HEIGHT) continue;
        const x = o.x + dx, z = o.z + dz;
        const c = this.chunks.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`); if (!c) continue;
        const id = c[(y * 16 + (z - Math.floor(z / 16) * 16)) * 16 + (x - Math.floor(x / 16) * 16)];
        if (!fnTakesBlock) { if (Array.isArray(matching) ? !matching.includes(id) : id !== matching) continue; }
        // A function sees a Block; one scratch Block is reused per cell, a fresh one kept only for a match.
        if (fnTakesBlock) { scratch.reset(id, x, y, z); if (!test(scratch)) continue; }
        const b = new Block(this.registry, id, new Vec3(x, y, z));
        if (useExtraInfo && typeof useExtraInfo === 'function' && !useExtraInfo(b)) continue;
        if (Math.hypot(dx, dy, dz) <= maxDistance) out.push(b.position);
      }
    }
    out.sort((a, b) => a.distanceTo(o) - b.distanceTo(o));
    return out.slice(0, count);
  }

  findBlock(options) { const p = this.findBlocks({ ...options, count: 1 })[0]; return p ? this.blockAt(p) : null; }

  /** Is the block visible from the eyes (nothing solid on the line from the eyes to its centre)? */
  canSeeBlock(block) {
    const eye = this.entity.position.offset(0, 1.62, 0), t = block.position.offset(.5, .5, .5);
    const d = eye.distanceTo(t), steps = Math.ceil(d / .1);
    for (let i = 1; i < steps; i++) {
      const p = eye.plus(t.minus(eye).scaled(i / steps)).floored();
      if (p.equals(block.position)) return true;
      const b = this.blockAt(p); if (b && b.boundingBox === 'block') return false;
    }
    return true;
  }

  canDigBlock(block) { return !!block && block.diggable && this.entity.position.offset(0, 1.62, 0).distanceTo(block.position.offset(.5, .5, .5)) <= 5.1; }

  digTime(block) { return this.registry.digTime(block.type, this.heldItem?.name ?? null); }

  blockAtCursor(maxDistance = 256) {
    const eye = this.entity.position.offset(0, 1.62, 0), dir = viewVector(this.entity.yaw, this.entity.pitch);
    for (let s = 0; s <= maxDistance; s += .05) { const b = this.blockAt(eye.plus(dir.scaled(s))); if (!b) return null; if (b.boundingBox === 'block') return b; }
    return null;
  }

  nearestEntity(match = (e) => true) {
    let best = null, bestD = Infinity;
    for (const e of Object.values(this.entities)) { if (e === this.entity || !match(e)) continue; const d = e.position.distanceTo(this.entity.position); if (d < bestD) { bestD = d; best = e; } }
    return best;
  }

  get heldItem() { return this.inventory.slots[36 + this.quickBarSlot] ?? null; }

  // ---------- actions ----------

  async call(method, ...args) {
    const result = await this.transport.call(method, this.username, ...args);
    await this.waitForTicks(1); // the next packet carries what the action changed
    return result;
  }

  async waitForTicks(n = 1) {
    const until = this.tickCount + Math.max(1, n);
    while (this.tickCount < until) await new Promise(r => this.once('physicsTick', r));
  }

  setControlState(control, state) {
    if (!CONTROL_NAMES.includes(control)) throw new Error(`Unknown control: ${control}`);
    this.controlState[control] = !!state;
    this.transport.call('setControls', this.username, { ...this.controlState }).catch(() => {});
  }
  getControlState(control) { return !!this.controlState[control]; }
  clearControlStates() { for (const k of CONTROL_NAMES) this.controlState[k] = false; this.transport.call('setControls', this.username, {}).catch(() => {}); }

  async look(yaw, pitch, force = true) { this.entity.yaw = yaw; this.entity.pitch = pitch; await this.transport.call('look', this.username, yaw, pitch); }
  async lookAt(point, force = true) {
    const eye = this.entity.position.offset(0, 1.62, 0), d = point.minus(eye);
    await this.look(Math.atan2(-d.x, -d.z), Math.atan2(d.y, Math.hypot(d.x, d.z)), force);
  }

  async dig(block, forceLook = true, digFace = null) {
    if (!block) throw new Error('dig: no block');
    this.targetDigBlock = block;
    try {
      const r = await this.call('dig', block.position.x, block.position.y, block.position.z);
      this.emit('diggingCompleted', block);
      return r;
    } catch (err) { this.emit('diggingAborted', block); throw err; }
    finally { this.targetDigBlock = null; }
  }
  stopDigging() { return this.transport.call('stopDigging', this.username); }

  async placeBlock(referenceBlock, faceVector) {
    if (!referenceBlock) throw new Error('placeBlock: no reference block');
    const f = [Math.sign(faceVector.x), Math.sign(faceVector.y), Math.sign(faceVector.z)];
    const r = await this.call('place', referenceBlock.position.x, referenceBlock.position.y, referenceBlock.position.z, f);
    return r;
  }

  async activateBlock(block, direction = null) {
    const f = direction ? [Math.sign(direction.x), Math.sign(direction.y), Math.sign(direction.z)] : null;
    return this.call('activateBlock', block.position.x, block.position.y, block.position.z, f);
  }

  /** Use the held item (right click): throw a pearl or an eye, fill or empty a bucket, start drawing a bow. */
  async activateItem(offHand = false) { this.usingHeldItem = true; this._useStart = this.tickCount; await this.call('useItem', {}); }
  /** Release the held item: shoot the bow drawn since activateItem. */
  async deactivateItem() {
    const ticks = Math.max(1, this.tickCount - (this._useStart ?? this.tickCount));
    this.usingHeldItem = false;
    await this.call('releaseUse', ticks);
  }

  async consume() {
    const held = this.heldItem;
    if (!held) throw new Error('consume: nothing in hand');
    const before = held.count;
    await this.call('useItem', { hold: 0 });
    for (let i = 0; i < 60; i++) { await this.waitForTicks(1); const h = this.heldItem; if (!h || h.name !== held.name || h.count < before) return; }
    throw new Error(`Could not eat ${held.name} (full, or it is not food)`);
  }

  async attack(entity) {
    if (!entity) throw new Error('attack: no entity');
    await this.call('attack', entity.id);
  }
  async swingArm() { await this.call('swing'); }
  async activateEntity(entity) { if (!entity) throw new Error('activateEntity: no entity'); await this.call('activateEntity', entity.id); }
  async useOn(entity) { return this.activateEntity(entity); }

  async equip(item, destination = 'hand') {
    const it = typeof item === 'number' ? this.inventory.findInventoryItem(item, null, false) : item;
    if (!it) throw new Error('equip: you do not have that item');
    const slot = it.slot;
    if (destination === 'hand') {
      if (slot >= 36 && slot <= 44) { await this.setQuickBarSlot(slot - 36); return; }
      const target = 36 + this.quickBarSlot;
      await this.call('moveSlot', slot, target);
      return;
    }
    const dest = { head: 5, torso: 6, legs: 7, feet: 8, 'off-hand': 45 }[destination];
    if (dest === undefined) throw new Error(`equip: unknown destination ${destination}`);
    await this.call('moveSlot', slot, dest);
  }
  async unequip(destination) {
    const src = { hand: 36 + this.quickBarSlot, head: 5, torso: 6, legs: 7, feet: 8, 'off-hand': 45 }[destination];
    const free = this.inventory.firstEmptyInventorySlot();
    if (free === null) throw new Error('unequip: no free slot');
    await this.call('moveSlot', src, free);
  }
  async setQuickBarSlot(n) { this.quickBarSlot = n; await this.transport.call('setQuickBarSlot', this.username, n); }

  async toss(itemType, metadata, count) {
    let left = count ?? this.inventory.count(itemType);
    for (const it of this.inventory.items().filter(i => i.type === itemType)) {
      if (left <= 0) break;
      const n = Math.min(left, it.count); await this.call('toss', it.slot, n); left -= n;
    }
  }
  async tossStack(item) { await this.call('toss', item.slot, item.count); }

  async sleep(bedBlock) {
    await this.activateBlock(bedBlock);
    await this.waitForTicks(2);
    if (!this.isSleeping) throw new Error(this.received.at(-1)?.text ?? 'Could not sleep');
    this.emit('sleep');
  }
  async wake() { await this.call('wake'); this.emit('wake'); }

  chat(message) { this.transport.call('chat', this.username, String(message)).catch(() => {}); }
  whisper(username, message) { this.chat(`@${username} ${message}`); }

  // ---------- crafting ----------

  recipesAll(itemType, metadata = null, craftingTable = null) { return recipeList(this, itemType, craftingTable, false, 1); }
  recipesFor(itemType, metadata = null, minResultCount = 1, craftingTable = null) { return recipeList(this, itemType, craftingTable, true, minResultCount ?? 1); }

  async craft(recipe, count = 1, craftingTable = null) {
    if (!recipe) throw new Error('craft: no recipe');
    if (recipe.requiresTable && !craftingTable) throw new Error('craft: this recipe needs a crafting table');
    const table = craftingTable ? { x: craftingTable.position.x, y: craftingTable.position.y, z: craftingTable.position.z } : null;
    return this.call('craft', { result: recipe._result, index: recipe._index, count, table });
  }

  // ---------- windows ----------

  async openFurnace(block) {
    const at = [block.position.x, block.position.y, block.position.z];
    const state = await this.call('furnaceState', ...at);
    const bot = this;
    const furnace = Object.assign(new EventEmitter(), {
      type: 'minecraft:furnace', _state: state,
      async refresh() { this._state = await bot.transport.call('furnaceState', bot.username, ...at); this.fuel = this._state.fuelLeft; this.progress = this._state.progress; return this._state; },
      inputItem() { return itemFromStack(this._state.input); }, fuelItem() { return itemFromStack(this._state.fuel); }, outputItem() { return itemFromStack(this._state.output); },
      async putInput(itemType, metadata, count) { await put(bot, at, 'input', itemType, count); await this.refresh(); },
      async putFuel(itemType, metadata, count) { await put(bot, at, 'fuel', itemType, count); await this.refresh(); },
      async takeInput() { const r = await bot.call('furnaceTake', ...at, 'input'); await this.refresh(); return r; },
      async takeFuel() { const r = await bot.call('furnaceTake', ...at, 'fuel'); await this.refresh(); return r; },
      async takeOutput() { const r = await bot.call('furnaceTake', ...at, 'output'); await this.refresh(); return r; },
      close() { clearInterval(this._timer); if (bot.currentWindow === this) bot.currentWindow = null; this.emit('close'); },
    });
    furnace.fuel = state.fuelLeft; furnace.progress = state.progress;
    furnace._timer = setInterval(() => furnace.refresh().then(() => furnace.emit('update')).catch(() => {}), 500);
    this.currentWindow = furnace;
    return furnace;
  }

  async openContainer(block) {
    const at = [block.position.x, block.position.y, block.position.z];
    const bot = this;
    const win = Object.assign(new EventEmitter(), {
      type: 'minecraft:generic_9x3', slots: [],
      async refresh() { const list = await bot.transport.call('chestItems', bot.username, ...at); this.slots = list.map((s, i) => (s ? itemFromStack({ ...s, slot: i }) : null)); this.inventoryStart = this.slots.length; return this.slots; },
      containerItems() { return this.slots.filter(Boolean); },
      items() { return this.containerItems(); },
      count(itemType) { return this.containerItems().filter(i => i.type === itemType).reduce((a, i) => a + i.count, 0); },
      async deposit(itemType, metadata, count) {
        let left = count ?? bot.inventory.count(itemType);
        if (!bot.inventory.count(itemType)) throw new Error('deposit: you do not have that item');
        for (const it of bot.inventory.items().filter(i => i.type === itemType)) { if (left <= 0) break; const r = await bot.call('chestMove', ...at, { invSlot: it.slot, count: Math.min(left, it.count) }); left -= r.moved; }
        await this.refresh();
      },
      async withdraw(itemType, metadata, count) {
        await this.refresh();
        let left = count ?? this.count(itemType);
        if (!this.count(itemType)) throw new Error('withdraw: the container has none of that item');
        for (const it of this.containerItems().filter(i => i.type === itemType)) { if (left <= 0) break; const r = await bot.call('chestMove', ...at, { fromChestSlot: it.slot, count: Math.min(left, it.count) }); left -= r.moved; }
        await this.refresh();
      },
      close() { if (bot.currentWindow === this) bot.currentWindow = null; this.emit('close'); },
    });
    await win.refresh();
    this.currentWindow = win;
    return win;
  }
  openChest(block) { return this.openContainer(block); }
  openBlock(block) { return this.openContainer(block); }
  closeWindow(window) { window?.close?.(); }
}

async function put(bot, at, which, itemType, count) {
  let left = count;
  const items = bot.inventory.items().filter(i => i.type === itemType);
  if (!items.length) throw new Error(`You have no ${bot.registry.items[itemType]?.name ?? itemType}`);
  for (const it of items) { if (left <= 0) break; const r = await bot.call('furnacePut', ...at, which, it.slot, Math.min(left, it.count)); left -= r.moved; }
}

function viewVector(yaw, pitch) { return new Vec3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)); }

function decode(b64) {
  const bin = Buffer.from(b64, 'base64');
  return new Uint16Array(bin.buffer, bin.byteOffset, bin.byteLength / 2).slice();
}

function makeInventory(bot) {
  return {
    slots: new Array(46).fill(null), inventoryStart: 9, inventoryEnd: 45, hotbarStart: 36, type: 'minecraft:inventory', id: 0,
    items() { return this.slots.slice(9, 46).filter(Boolean); },
    count(itemType) { const t = typeof itemType === 'string' ? bot.registry.itemsByName[itemType]?.id : itemType; return this.items().filter(i => i.type === t).reduce((a, i) => a + i.count, 0); },
    findInventoryItem(itemType, metadata, notFull) { const t = typeof itemType === 'string' ? bot.registry.itemsByName[itemType]?.id : itemType; return this.items().find(i => i.type === t && (!notFull || i.count < i.stackSize)) ?? null; },
    emptySlotCount() { let n = 0; for (let i = 9; i <= 44; i++) if (!this.slots[i]) n++; return n; },
    firstEmptyInventorySlot() { for (let i = 36; i <= 44; i++) if (!this.slots[i]) return i; for (let i = 9; i <= 35; i++) if (!this.slots[i]) return i; return null; },
    firstEmptyHotbarSlot() { for (let i = 36; i <= 44; i++) if (!this.slots[i]) return i; return null; },
  };
}

function applyInventory(bot, inv) {
  for (let i = 0; i < 46; i++) bot.inventory.slots[i] = inv.slots[i] ? itemFromStack(inv.slots[i]) : null;
  bot.quickBarSlot = inv.quickBar;
  bot.emit('heldItemChanged', bot.heldItem);
}

// ---------- recipes, worked out from the client's own inventory, as Mineflayer does ----------

const PROBE = { id: '__probe__', isBlock: false, count: 1 };
function stackAccepts(want, item, reg) {
  const def = reg.items[item.type];
  const stack = { id: def?.isBlock || reg.blocks[item.type] && item.type < 100000 ? item.type : item.name, isBlock: item.type < 100000, count: 1 };
  return findMatchingRecipe([stack], 1, 1, [{ pattern: [[want]], result: PROBE }]) === PROBE;
}
function keyOfResult(r, reg) {
  if (r.isBlock && typeof r.id === 'number') return reg.blocks[r.id]?.name;
  return typeof r.id === 'number' ? reg.blocks[r.id]?.name : String(r.id);
}
function fitsSize(recipe, size) {
  if (recipe.shapeless) return (recipe.ingredients?.length ?? 9) <= size * size;
  return recipe.pattern.length <= size && recipe.pattern.every(row => row.length <= size);
}
function recipeList(bot, itemType, craftingTable, needInventory, minResultCount) {
  const reg = bot.registry, wantName = typeof itemType === 'string' ? itemType : reg.items[itemType]?.name;
  if (!wantName) return [];
  const size = craftingTable ? 3 : 2;
  const list = (craftingTable ? RECIPES_3X3 : RECIPES_2X2).filter(r => r.result && keyOfResult(r.result, reg) === wantName && fitsSize(r, size));
  const out = [];
  list.forEach((r, index) => {
    const cells = r.shapeless ? r.ingredients : r.pattern.flat();
    const wants = cells.filter(c => c != null);
    // Which inventory items fill each cell, and how many crafts the inventory allows.
    const counts = new Map(); for (const it of bot.inventory.items()) counts.set(it, it.count);
    const delta = new Map();
    let ok = true;
    for (const want of wants) {
      const it = [...counts.keys()].find(i => stackAccepts(want, i, reg));
      if (!it) { ok = false; if (needInventory) break; continue; }
      delta.set(it.type, (delta.get(it.type) ?? 0) + 1);
    }
    const resultCount = r.result.count ?? 1;
    if (needInventory) {
      if (!ok) return;
      const times = Math.min(...[...delta.entries()].map(([t, n]) => Math.floor(bot.inventory.count(t) / n)));
      if (times * resultCount < minResultCount) return;
    }
    const resultId = reg.itemsByName[wantName]?.id;
    out.push({
      result: { id: resultId, count: resultCount, metadata: null },
      inShape: r.shapeless ? null : r.pattern.map(row => row.map(c => (c == null ? null : { id: typeof c === 'number' ? c : reg.itemsByName[c]?.id ?? -1, metadata: null, count: 1 }))),
      ingredients: r.shapeless ? r.ingredients.map(c => ({ id: typeof c === 'number' ? c : reg.itemsByName[c]?.id ?? -1, metadata: null, count: 1 })) : null,
      delta: [...[...delta.entries()].map(([id, n]) => ({ id, metadata: null, count: -n })), { id: resultId, metadata: null, count: resultCount }],
      requiresTable: !fitsSize(r, 2),
      _result: wantName, _index: index,
    });
  });
  return out;
}
