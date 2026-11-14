// The server side of the Mineflayer-style client (replication/client/): what a Minecraft server sends a client, and
// what it does when the client acts.
//
// Every tick the Node front pulls a packet per player: the player's own state, the entities it can see, block
// changes and newly visible chunks in its dimension, chat and system messages. Actions (dig, place, attack, use,
// craft, windows, sleep, chat) arrive as calls and run through the game's own code, on the player's context, over as
// many ticks as they take. Nothing here makes an action easier than the game makes it: reach, mining time, line of
// sight and placement rules are the game's.
import * as THREE from 'three';
import { Chunk, CHUNK_HEIGHT } from '../../src/world.js';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../../src/blocks.js';
import { RECIPES_2X2, RECIPES_3X3, findMatchingRecipe } from '../../src/crafting.js';

export const VIEW_RADIUS = 5; // chunks sent to a client around its player
// What a vanilla 1.20.4 server checks when a client digs, places, uses a block or attacks: distance only (6 blocks from
// the eyes to the block's centre; an entity within 6 blocks), never line of sight -- a Mineflayer bot can dig a block
// it cannot see, as the paper's agents could.
const REACH = 6;
const ENTITY_REACH = 6;
const ENTITY_VIEW = 64;

const BLOCK_KEY = Object.fromEntries(Object.entries(BLOCKS).map(([k, v]) => [v, k]));

// Block changes, recorded at the chunk so every writer is seen (World.setVoxel, generators, water, explosions).
const changeLog = [];
const rawSet = Chunk.prototype.setVoxel;
Chunk.prototype.setVoxel = function (lx, ly, lz, id) {
  const before = this.voxels[(ly * 16 + lz) * 16 + lx];
  rawSet.call(this, lx, ly, lz, id);
  if (this.__dim && before !== id && ly >= 0 && ly < CHUNK_HEIGHT) changeLog.push([this.__dim, this.cx * 16 + lx, ly, this.cz * 16 + lz, id]);
};

function b64(u16) {
  const bytes = new Uint8Array(u16.buffer, u16.byteOffset, u16.byteLength);
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const ids = new WeakMap(); let nextId = 1;
const idOf = (o) => { let v = ids.get(o); if (!v) { v = nextId++; ids.set(o, v); } return v; };

const wait = (server, ticks) => new Promise(r => { const until = server.ticks + ticks; const f = () => (server.ticks >= until ? r() : setTimeout(f, 10)); f(); });

export class Bridge {
  constructor(server) {
    this.server = server;
    this.sent = new Map(); // player -> {dim, chunks:Set}
    this.lastInventory = new Map();
    this.pendingEvents = []; // server-wide events for the log (deaths, advancements, dimension changes)
    this.recordFrames = [];
    server.bridge = this;
    for (const D of Object.values(server.dims)) this.markDimension(D);
    const dimension = server.dimension.bind(server);
    server.dimension = (name) => { const D = dimension(name); this.markDimension(D); return D; };
  }

  markDimension(D) {
    if (D.__bridged) return;
    D.__bridged = true;
    const world = D.world, get = world.getOrCreateChunk.bind(world), name = D.dimensionName;
    world.getOrCreateChunk = (cx, cz) => { const c = get(cx, cz); if (c && !c.__dim) c.__dim = name; return c; };
    for (const c of world.chunks.values()) c.__dim = name;
  }

  /** A client restarted: it will be sent its chunks and inventory again. */
  resetClient(name) { this.sent.delete(name); this.lastInventory.delete(name); return true; }

  ctx(name) { const P = this.server.players.get(name); if (!P) throw new Error(`no player ${name}`); return P; }

  // ---------- what the client is told ----------

  itemOf(stack, slot) {
    if (!stack) return null;
    const key = stack.isBlock ? (BLOCK_KEY[stack.id] ?? String(stack.id)).toLowerCase() : String(stack.id);
    return { slot, id: stack.id, isBlock: !!stack.isBlock, name: key, count: stack.count ?? 1, durability: stack.durability ?? null, maxDurability: stack.maxDurability ?? ITEMS[stack.id]?.durability ?? null, enchantments: stack.enchantments ?? null };
  }

  inventoryOf(P) {
    const inv = P.inventory, slots = [];
    // Mineflayer's player window: 5-8 armour (head, chest, legs, feet), 9-35 main, 36-44 hotbar, 45 off hand.
    ['head', 'chest', 'legs', 'feet'].forEach((k, i) => { slots[5 + i] = this.itemOf(inv.armor[k], 5 + i); });
    inv.storage.forEach((s, i) => { slots[9 + i] = this.itemOf(s, 9 + i); });
    inv.hotbar.forEach((s, i) => { slots[36 + i] = this.itemOf(s, 36 + i); });
    slots[45] = this.itemOf(inv.offhand, 45);
    return { slots, quickBar: inv.activeSlot };
  }

  playerState(P) {
    const p = P.player, D = this.server.dimensionOf(P);
    return {
      name: P.name, dim: D.dimensionName,
      pos: [p.position.x, p.position.y, p.position.z], vel: [p.velocity?.x ?? 0, p.velocity?.y ?? 0, p.velocity?.z ?? 0],
      yaw: p.yaw ?? 0, pitch: p.pitch ?? 0, onGround: !!p.onGround, inWater: !!p.inWater, inLava: !!p.inLava,
      health: p.isDead ? 0 : p.health, food: p.hunger ?? 20, saturation: p.saturation ?? 5, oxygen: p.air ?? p.oxygen ?? 20,
      xp: { level: p.xpLevel ?? p.level ?? 0, progress: p.exp ?? 0 }, sleeping: !!p.isSleeping, dead: !!p.isDead,
      effects: [...(p.statusEffects instanceof Map ? p.statusEffects.entries() : Object.entries(p.statusEffects ?? {}))].map(([id, e]) => ({ id, amplifier: e?.amplifier ?? e?.level ?? 0, duration: +(e?.duration ?? e?.remaining ?? 0).toFixed?.(1) || 0 })),
      spawnPoint: p.bedSpawnPosition ? [p.bedSpawnPosition.x, p.bedSpawnPosition.y, p.bedSpawnPosition.z] : null,
      // Weather as the dimension has it (Minecraft's game-state packets: rain level and thunder level, 0 or 1 here).
      raining: !!D.weather?.isRaining?.(), thundering: !!(D.weather?.isRaining?.() && D.weather.clock.thundering),
      held: this.itemOf(P.inventory.getActiveItem?.(), null)?.name ?? null,
      armor: ['head', 'chest', 'legs', 'feet'].map(k => this.itemOf(P.inventory.armor[k], 0)?.name ?? null),
      items: [...P.inventory.hotbar, ...P.inventory.storage].filter(Boolean).length,
    };
  }

  entitiesFor(P) {
    const D = this.server.dimensionOf(P), me = P.player.position, out = [];
    const near = (v) => v && Math.hypot(v.x - me.x, v.y - me.y, v.z - me.z) <= ENTITY_VIEW;
    for (const m of D.mobs.mobs) {
      const at = m.mesh?.position; if (!near(at) || m.health <= 0 && !m.dying) continue;
      out.push({ id: idOf(m), kind: 'mob', name: m.type, pos: [at.x, at.y, at.z], yaw: m.yaw ?? m.mesh.rotation?.y ?? 0, health: m.health, height: m.height ?? m.hitboxHeight ?? 1.8, width: m.width ?? m.hitboxWidth ?? .6, baby: !!m.isBaby });
    }
    for (const d of D.entities.droppedItems ?? []) {
      const at = d.group?.position; if (!near(at)) continue;
      const item = this.itemOf({ id: d.itemType, isBlock: d.isBlock, count: d.count });
      out.push({ id: idOf(d), kind: 'item', name: 'item', pos: [at.x, at.y, at.z], item: { name: item.name, count: item.count } });
    }
    for (const o of D.entities.xpOrbs ?? []) {
      const at = o.mesh?.position ?? o.group?.position ?? o.position; if (!near(at)) continue;
      out.push({ id: idOf(o), kind: 'orb', name: 'experience_orb', pos: [at.x, at.y, at.z] });
    }
    for (const a of D.mobs.arrows ?? []) {
      const at = a.mesh?.position; if (!near(at)) continue;
      out.push({ id: idOf(a), kind: 'projectile', name: 'arrow', pos: [at.x, at.y, at.z] });
    }
    for (const Q of this.server.players.values()) {
      if (Q === P || this.server.dimensionOf(Q) !== D || Q.player.isDead) continue;
      const at = Q.player.position; if (!near(at)) continue;
      out.push({ id: idOf(Q), kind: 'player', name: 'player', username: Q.name, pos: [at.x, at.y, at.z], yaw: Q.player.yaw, pitch: Q.player.pitch, health: Q.player.health, height: 1.8, width: .6, held: this.itemOf(Q.inventory.getActiveItem?.(), null)?.name ?? null });
    }
    for (const c of D.bossManager?.endCrystals ?? []) {
      const at = c.position; if (!c.alive || !near(at)) continue;
      out.push({ id: idOf(c), kind: 'object', name: 'end_crystal', pos: [at.x, at.y - 1, at.z], height: 2, width: 2 });
    }
    for (const Q of this.server.players.values()) for (const e of Q.enderEyes ?? []) {
      const at = e.mesh?.position; if (this.server.dimensionOf(Q) !== D || !near(at)) continue;
      out.push({ id: idOf(e), kind: 'object', name: 'eye_of_ender', pos: [at.x, at.y, at.z] });
    }
    return out;
  }

  chunksFor(P) {
    const D = this.server.dimensionOf(P);
    let s = this.sent.get(P.name);
    const fresh = !s || s.dim !== D.dimensionName;
    if (fresh) { s = { dim: D.dimensionName, chunks: new Set() }; this.sent.set(P.name, s); }
    const out = [], cx = Math.floor(P.player.position.x / 16), cz = Math.floor(P.player.position.z / 16);
    for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
      const k = `${cx + dx},${cz + dz}`; if (s.chunks.has(k)) continue;
      const chunk = D.world.getChunk(cx + dx, cz + dz); if (!chunk) continue;
      chunk.__dim ??= D.dimensionName;
      s.chunks.add(k);
      out.push([cx + dx, cz + dz, b64(chunk.voxels)]);
      if (out.length >= 24) break; // a few a tick, nearest rings first
    }
    return { reset: fresh, chunks: out };
  }

  /** Everything the clients need since the last pull. */
  pull() {
    const server = this.server;
    const changes = changeLog.splice(0);
    const players = {};
    for (const P of server.players.values()) {
      const msgs = P.messages.splice(0);
      const { reset, chunks } = this.chunksFor(P);
      const dim = server.dimensionOf(P).dimensionName;
      const inv = this.inventoryOf(P), invKey = JSON.stringify(inv);
      const invChanged = this.lastInventory.get(P.name) !== invKey;
      if (invChanged) this.lastInventory.set(P.name, invKey);
      players[P.name] = {
        state: this.playerState(P), entities: this.entitiesFor(P), inventory: invChanged ? inv : null,
        chunkReset: reset, chunks, blocks: changes.filter(c => c[0] === dim).map(c => c.slice(1)), messages: msgs,
      };
    }
    return { tick: server.ticks, time: server.dayCount * 24000 + server.worldTime, players, changes, events: this.pendingEvents.splice(0) };
  }

  // ---------- actions ----------

  aimAt(P, x, y, z) {
    const p = P.player, eye = p.getEyePosition(), dx = x - eye.x, dy = y - eye.y, dz = z - eye.z;
    p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    // Placement reads the camera (a bed's and a chest's facing): turn it with the player now, not next tick.
    try { p.updateCameraAndModel?.(0); } catch { /* the model may not exist in a test */ }
  }

  setControls(name, controls) {
    const P = this.ctx(name), keys = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sprint: 'ControlLeft', sneak: 'ShiftLeft' };
    const bot = {};
    for (const [k, on] of Object.entries(controls)) if (on && keys[k]) bot[keys[k]] = true;
    // Always an object: Player.update copies botControls into keys only while it is set, so null would leave the
    // last pressed keys held (a player walking on by itself after its program let go).
    P.player.botControls = bot;
    P.player.keys = { ...bot };
    P.player.isSneaking = !!controls.sneak;
    return true;
  }

  look(name, yaw, pitch) { const p = this.ctx(name).player; p.yaw = yaw; p.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch)); try { p.updateCameraAndModel?.(0); } catch {} return true; }

  /** Target a block directly, as the server takes the client's word for which block and face it clicked. */
  target(P, x, y, z, face = null) {
    const eye = P.player.getEyePosition();
    if (!face) { // the face toward the eyes
      const dx = eye.x - (x + .5), dy = eye.y - (y + .5), dz = eye.z - (z + .5), ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
      face = ax >= ay && ax >= az ? [Math.sign(dx), 0, 0] : ay >= az ? [0, Math.sign(dy), 0] : [0, 0, Math.sign(dz)];
    }
    const point = { x: x + .5 + face[0] * .5, y: y + .5 + face[1] * .5, z: z + .5 + face[2] * .5 };
    this.aimAt(P, point.x, point.y, point.z);
    const t = { x, y, z, normal: { x: face[0], y: face[1], z: face[2] }, blockId: P.world.getVoxel(x, y, z), point };
    P.targetBlock = t; P.targetMob = null;
    return t;
  }
  inReach(P, x, y, z) { const e = P.player.getEyePosition(); return Math.hypot(x + .5 - e.x, y + .5 - e.y, z + .5 - e.z) <= REACH; }

  /** Which block face the ray from the eye hits, if the block is in reach and in sight. */
  sightTo(P, x, y, z) {
    this.server.as(P, () => P.updateRaycast());
    const t = P.targetBlock;
    return t && t.x === x && t.y === y && t.z === z ? t : null;
  }

  /** Aim at a block: at its centre, else the centre of whichever face is visible. */
  aimBlock(P, x, y, z, face = null) {
    const eye = P.player.getEyePosition();
    const faces = face ? [face] : [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], null];
    const points = [[x + .5, y + .5, z + .5], ...faces.filter(Boolean).map(f => [x + .5 + f[0] * .49, y + .5 + f[1] * .49, z + .5 + f[2] * .49])];
    points.sort((a, b) => Math.hypot(a[0] - eye.x, a[1] - eye.y, a[2] - eye.z) - Math.hypot(b[0] - eye.x, b[1] - eye.y, b[2] - eye.z));
    for (const pt of face ? points.slice(1) : points) {
      this.aimAt(P, ...pt);
      const t = this.sightTo(P, x, y, z);
      if (t && (!face || (t.normal.x === face[0] && t.normal.y === face[1] && t.normal.z === face[2]))) return t;
    }
    return null;
  }

  async dig(name, x, y, z) {
    const P = this.ctx(name), server = this.server, W = P.world;
    const id = W.getVoxel(x, y, z);
    if (id === BLOCKS.AIR) throw new Error('No block to dig (air)');
    if (!this.inReach(P, x, y, z)) throw new Error('Block is out of reach (more than 6 blocks from your eyes)');
    this.target(P, x, y, z);
    P.digging = { x, y, z, id, aborted: false };
    P.forcedTarget = () => P.targetBlock && P.targetBlock.x === x && P.targetBlock.y === y && P.targetBlock.z === z ? P.targetBlock : this.target(P, x, y, z);
    P.isMouseDown = true;
    const start = server.ticks;
    let lastProgress = server.ticks, lastTime = -1;
    try {
      for (;;) {
        await wait(server, 1);
        if (P.digging?.aborted) throw new Error('Digging aborted');
        if (P.player.isDead) throw new Error('Died while digging');
        if (W.getVoxel(x, y, z) !== id) return { ok: true, ticks: server.ticks - start };
        if (P.miningTime > lastTime + 1e-6) { lastTime = P.miningTime; lastProgress = server.ticks; }
        else if (P.miningTime < lastTime) { lastTime = P.miningTime; }
        if (server.ticks - lastProgress > 40) { const t = P.targetBlock; throw new Error(`Digging made no progress for 2 s (aiming at ${t ? `${BLOCK_KEY[t.blockId]?.toLowerCase()} at ${t.x},${t.y},${t.z}` : 'nothing'}; on ground: ${!!P.player.onGround})`); }
        if (server.ticks - start > 20 * 120) throw new Error('Digging took over two minutes');
      }
    } finally { P.isMouseDown = false; P.digging = null; P.forcedTarget = null; }
  }

  stopDigging(name) { const P = this.ctx(name); if (P.digging) P.digging.aborted = true; P.isMouseDown = false; return true; }

  /** Place the held block against a face of a block, as a right click on that face does. */
  async place(name, x, y, z, face) {
    const P = this.ctx(name), W = P.world;
    const held = P.inventory.getActiveItem();
    if (!held) throw new Error('Nothing in hand to place');
    const tx = x + face[0], ty = y + face[1], tz = z + face[2];
    const before = W.getVoxel(tx, ty, tz);
    if (!this.inReach(P, x, y, z)) throw new Error('The reference block is out of reach (more than 6 blocks from your eyes)');
    if (P.world.getVoxel(x, y, z) === BLOCKS.AIR) throw new Error('The reference block is air: place against a solid block');
    P.lastRefusal = null; // the reason the game gives, if it refuses this one
    this.server.as(P, () => { this.target(P, x, y, z, face); P.handleRightClick(); });
    await wait(this.server, 1);
    const after = W.getVoxel(tx, ty, tz);
    if (after === before) throw new Error(`The block was not placed (the game refused: ${P.lastRefusal ?? 'occupied, unsupported, or not placeable'})`);
    return { ok: true, placed: BLOCK_KEY[after]?.toLowerCase() ?? after };
  }

  /** A right click on a block with whatever is held: doors, levers, beds, buckets on a block, eyes into frames. */
  async activateBlock(name, x, y, z, face = null) {
    const P = this.ctx(name);
    if (!this.inReach(P, x, y, z)) throw new Error('Block is out of reach (more than 6 blocks from your eyes)');
    this.server.as(P, () => { this.target(P, x, y, z, face); P.handleRightClick(); });
    await wait(this.server, 1);
    return { ok: true };
  }

  /** A right click with the held item where the player is looking (use item: throw, drink, fill a bucket, draw a bow). */
  async useItem(name, { hold = 0 } = {}) {
    const P = this.ctx(name);
    // As the right mouse button does in the game: a bow starts drawing, anything else is a right click.
    // In the air, as Mineflayer's activateItem: no block or mob is clicked (a bucket traces its own ray for fluids).
    this.server.as(P, () => { P.updateRaycast(); P.targetBlock = null; P.targetMob = null; if (!P.bow.start()) P.handleRightClick(); });
    if (hold > 0) await wait(this.server, hold);
    return { ok: true };
  }

  /** Let go of the use button: a drawn bow shoots, eating stops. */
  releaseUse(name) { const P = this.ctx(name); this.server.as(P, () => { P.bow.release(); P.eating?.release?.(); }); return { ok: true }; }

  wake(name) { const P = this.ctx(name); this.server.as(P, () => this.server.dimensionOf(P).bedManager.leaveBed?.()); return { ok: true }; }

  /** Start or finish holding "use" (a bow's draw, eating). */
  async holdUse(name, ticks) {
    const P = this.ctx(name);
    P.isRightMouseDown = true; P.player.isUsingItem = true;
    this.server.as(P, () => { P.updateRaycast(); P.handleRightClick(); });
    await wait(this.server, ticks);
    this.server.as(P, () => { P.isRightMouseDown = false; P.player.isUsingItem = false; P.bow?.release?.(); P.handleRightClickRelease?.(); });
    return { ok: true };
  }

  async attack(name, entityId) {
    const P = this.ctx(name), D = this.server.dimensionOf(P);
    // An End crystal is hit by the look ray (BossFightManager.checkCrystalHit): aim at it and swing.
    const crystal = (D.bossManager?.endCrystals ?? []).find(c => c.alive && ids.get(c) === entityId);
    if (crystal) {
      if (P.player.position.distanceTo(crystal.position) > ENTITY_REACH) throw new Error('Entity is out of reach (more than 6 blocks)');
      this.aimAt(P, crystal.position.x, crystal.position.y, crystal.position.z);
      this.server.as(P, () => { P.updateRaycast(); P.targetMob = null; P.handleLeftClick(); });
      return { ok: true };
    }
    const mob = D.mobs.mobs.find(m => ids.get(m) === entityId);
    const other = !mob && [...this.server.players.values()].find(Q => ids.get(Q) === entityId);
    const target = mob ?? other;
    if (!target) throw new Error('No such entity here');
    const at = mob ? mob.mesh.position : other.player.position, h = mob ? (mob.height ?? 1.4) : 1.8;
    if (P.player.position.distanceTo(at) > ENTITY_REACH) throw new Error('Entity is out of reach (more than 6 blocks)');
    this.aimAt(P, at.x, at.y + h * .6, at.z);
    this.server.as(P, () => { P.updateRaycast(); P.targetMob = mob ?? null; if (mob) P.targetBlock = null; P.handleLeftClick(); });
    if (mob) mob.lastPlayerAttacker = P; // the kill's credit (engine.partitioned)
    return { ok: true };
  }

  /** A right click on a mob (Mineflayer activateEntity): feed, breed, shear, trade, ride. */
  async activateEntity(name, entityId) {
    const P = this.ctx(name), D = this.server.dimensionOf(P);
    const mob = D.mobs.mobs.find(m => ids.get(m) === entityId);
    if (!mob) throw new Error('No such entity here');
    if (P.player.position.distanceTo(mob.mesh.position) > ENTITY_REACH) throw new Error('Entity is out of reach (more than 6 blocks)');
    this.aimAt(P, mob.mesh.position.x, mob.mesh.position.y + (mob.height ?? 1) * .6, mob.mesh.position.z);
    this.server.as(P, () => { P.updateRaycast(); P.targetMob = mob; P.targetBlock = null; P.handleRightClick(); });
    await wait(this.server, 1);
    return { ok: true };
  }

  async swing(name) { const P = this.ctx(name); this.server.as(P, () => { P.updateRaycast(); P.handleLeftClick(); }); return { ok: true }; }

  // ---------- inventory ----------

  /** Inventory list and index for a Mineflayer slot number. */
  slotRef(inv, slot) {
    if (slot >= 36 && slot <= 44) return [inv.hotbar, slot - 36];
    if (slot >= 9 && slot <= 35) return [inv.storage, slot - 9];
    if (slot >= 5 && slot <= 8) return ['armor', ['head', 'chest', 'legs', 'feet'][slot - 5]];
    if (slot === 45) return ['offhand', null];
    throw new Error(`No inventory slot ${slot}`);
  }
  getSlot(inv, slot) { const [l, i] = this.slotRef(inv, slot); return l === 'armor' ? inv.armor[i] : l === 'offhand' ? inv.offhand : l[i]; }
  setSlot(inv, slot, v) { const [l, i] = this.slotRef(inv, slot); if (l === 'armor') inv.armor[i] = v; else if (l === 'offhand') inv.offhand = v; else l[i] = v; }

  setQuickBarSlot(name, n) { const P = this.ctx(name); if (!(n >= 0 && n <= 8)) throw new Error('Quick bar slot must be 0-8'); P.inventory.activeSlot = n; return true; }

  /** Swap two slots (a window click pair), as moving an item between slots does. */
  moveSlot(name, from, to) {
    const inv = this.ctx(name).inventory, a = this.getSlot(inv, from), b = this.getSlot(inv, to);
    if (to >= 5 && to <= 8 && a) {
      const want = ['head', 'chest', 'legs', 'feet'][to - 5], item = ITEMS[a.id];
      const slot = item?.armorSlot ?? item?.slot;
      if (slot && slot !== want && !(want === 'chest' && slot === 'torso')) throw new Error(`${a.id} does not go in the ${want} slot`);
      if (!slot && !(want === 'head' && /head|skull|pumpkin/.test(String(a.id)))) throw new Error(`${a.id} is not armour`);
    }
    this.setSlot(inv, from, b ?? null); this.setSlot(inv, to, a ?? null);
    return true;
  }

  toss(name, slot, count) {
    const P = this.ctx(name), inv = P.inventory, s = this.getSlot(inv, slot);
    if (!s) throw new Error('That slot is empty');
    const n = Math.min(count ?? s.count, s.count);
    const p = P.player, dir = p.getViewVector?.() ?? new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const at = p.getEyePosition().clone().add(new THREE.Vector3(dir.x * .3, -.3, dir.z * .3));
    const D = this.server.dimensionOf(P);
    D.entities.spawnDroppedItem(at, s.id, !!s.isBlock, n, { enchantments: s.enchantments, durability: s.durability, pickupDelay: 2, velocity: new THREE.Vector3(dir.x * 3, 1.5, dir.z * 3) });
    const drop = D.entities.droppedItems.at(-1); if (drop) { drop.pickupDelay = Math.max(drop.pickupDelay ?? 0, 2); drop.durability = s.durability; }
    s.count -= n; if (s.count <= 0) this.setSlot(inv, slot, null);
    return true;
  }

  // ---------- crafting ----------

  /** Craft `count` times the recipe whose result is `resultName`, the recipe at `index` among those for it. */
  async craft(name, { result, index = 0, count = 1, table = null }) {
    const P = this.ctx(name), inv = P.inventory;
    if (table) {
      const eye = P.player.getEyePosition();
      if (P.world.getVoxel(table.x, table.y, table.z) !== BLOCKS.CRAFTING_TABLE) throw new Error('That block is not a crafting table');
      if (Math.hypot(table.x + .5 - eye.x, table.y + .5 - eye.y, table.z + .5 - eye.z) > REACH) throw new Error('The crafting table is out of reach');
    }
    const size = table ? 3 : 2;
    const list = (table ? RECIPES_3X3 : RECIPES_2X2).filter(r => r.result && sameItem(r.result, result) && fits(r, size));
    if (!list.length) throw new Error(table ? `No recipe makes ${result}` : `No 2x2 recipe makes ${result}: use a crafting table`);
    const recipe = list[index] ?? list[0];
    let made = 0;
    for (let n = 0; n < count; n++) {
      const grid = new Array(size * size).fill(null), taken = [];
      const rows = recipe.shapeless ? null : recipe.pattern;
      const cells = rows ? rows.flatMap((row, r) => row.map((want, c) => [r * size + c, want])) : (recipe.ingredients ?? []).map((want, i) => [i, want]);
      let ok = true;
      for (const [cell, want] of cells) {
        if (want == null) continue;
        const src = findIngredient(inv, want);
        if (!src) { ok = false; break; }
        grid[cell] = { id: src.stack.id, isBlock: src.stack.isBlock, count: 1 };
        src.stack.count--; taken.push(src);
        if (src.stack.count <= 0) src.list[src.index] = null;
      }
      const res = ok ? findMatchingRecipe(grid, size, size, table ? RECIPES_3X3 : RECIPES_2X2) : null;
      if (!ok || !res || !sameItem(res, result)) {
        for (const t of taken) { if (t.list[t.index]) t.list[t.index].count++; else t.list[t.index] = { ...t.stack, count: 1 }; }
        if (!made) throw new Error(ok ? `The ingredients did not make ${result}` : `Missing ingredients for ${result}`);
        break;
      }
      inv.addItem(res.id, !!res.isBlock, res.count ?? 1);
      made++;
      P.advancements?.onCraft?.(res);
    }
    return { ok: true, crafted: made };
  }

  // ---------- containers ----------

  containerAt(P, x, y, z) {
    const id = P.world.getVoxel(x, y, z), key = BLOCK_KEY[id] ?? '';
    const eye = P.player.getEyePosition();
    if (Math.hypot(x + .5 - eye.x, y + .5 - eye.y, z + .5 - eye.z) > REACH) throw new Error('The container at ' + x + ',' + y + ',' + z + ' is out of reach (your eyes are at ' + eye.x.toFixed(1) + ',' + eye.y.toFixed(1) + ',' + eye.z.toFixed(1) + '; reach is 6 blocks)');
    if (/FURNACE|SMOKER/.test(key)) return { kind: 'furnace', key };
    if (/CHEST|BARREL/.test(key)) return { kind: 'chest', key };
    throw new Error(`${key.toLowerCase() || 'That block'} is not a container this client can open`);
  }

  furnaceState(name, x, y, z) {
    const P = this.ctx(name); this.containerAt(P, x, y, z);
    const f = this.server.dimensionOf(P).furnaceManager.getOrCreateFurnace(x, y, z);
    return { input: this.itemOf(f.input, 0), fuel: this.itemOf(f.fuel, 1), output: this.itemOf(f.output, 2), progress: f.cookDuration ? f.cookTime / f.cookDuration : 0, fuelLeft: f.maxBurnTime ? f.burnTime / f.maxBurnTime : 0, lit: !!f.lit || f.burnTime > 0 };
  }

  furnacePut(name, x, y, z, which, slot, count) {
    const P = this.ctx(name); this.containerAt(P, x, y, z);
    const FM = this.server.dimensionOf(P).furnaceManager, inv = P.inventory, s = this.getSlot(inv, slot);
    if (!s) throw new Error('That inventory slot is empty');
    let moved = 0;
    while (moved < count && s.count > 0 && FM.addItem(x, y, z, s.id, !!s.isBlock, 1, which)) { s.count--; moved++; }
    if (s.count <= 0) this.setSlot(inv, slot, null);
    if (!moved) throw new Error(which === 'fuel' ? 'That is not fuel, or the fuel slot holds something else' : 'The input slot holds something else');
    return { ok: true, moved };
  }

  furnaceTake(name, x, y, z, which) {
    const P = this.ctx(name); this.containerAt(P, x, y, z);
    const FM = this.server.dimensionOf(P).furnaceManager, f = FM.getOrCreateFurnace(x, y, z);
    const s = f[which]; if (!s) return { ok: true, taken: 0 };
    const n = s.count;
    P.inventory.addItem(s.id, !!s.isBlock, n, s.enchantments ?? null);
    f[which] = null;
    if (which === 'output') { P.player.addExperience?.(Math.round(n * .7)); P.advancements?.onSmelt?.(s); }
    return { ok: true, taken: n, item: this.itemOf(s, 0)?.name };
  }

  chestItems(name, x, y, z) {
    const P = this.ctx(name); this.containerAt(P, x, y, z);
    const items = this.server.dimensionOf(P).chestManager.getCombinedItems(x, y, z) ?? [];
    return items.map((s, i) => this.itemOf(s, i));
  }

  chestMove(name, x, y, z, { fromChestSlot = null, toChestSlot = null, invSlot = null, count = 64 }) {
    const P = this.ctx(name); this.containerAt(P, x, y, z);
    const CM = this.server.dimensionOf(P).chestManager, inv = P.inventory;
    if (fromChestSlot != null) {
      const s = CM.getCombinedSlot(x, y, z, fromChestSlot); if (!s) throw new Error('That chest slot is empty');
      const n = Math.min(count, s.count), room = inv.countRoomFor?.(s.id, !!s.isBlock, n, s.enchantments ?? null) ?? n;
      const moved = Math.min(n, room); if (!moved) throw new Error('No room in the inventory');
      inv.addItem(s.id, !!s.isBlock, moved, s.enchantments ?? null);
      const left = s.count - moved;
      CM.setCombinedSlot(x, y, z, fromChestSlot, left > 0 ? { ...s, count: left } : null);
      return { ok: true, moved };
    }
    const s = this.getSlot(inv, invSlot); if (!s) throw new Error('That inventory slot is empty');
    const n = Math.min(count, s.count), items = CM.getCombinedItems(x, y, z) ?? [];
    let moved = 0;
    const limit = ITEMS[s.id]?.maxStack ?? 64;
    for (let i = 0; i < items.length && moved < n; i++) {
      if (toChestSlot != null && i !== toChestSlot) continue;
      const c = items[i];
      if (c && (c.id !== s.id || !!c.isBlock !== !!s.isBlock || c.enchantments)) continue;
      const add = Math.min(n - moved, limit - (c?.count ?? 0)); if (add <= 0) continue;
      CM.setCombinedSlot(x, y, z, i, { id: s.id, isBlock: !!s.isBlock, count: (c?.count ?? 0) + add, ...(s.durability != null ? { durability: s.durability } : {}) });
      moved += add;
    }
    if (!moved) throw new Error('The chest is full');
    s.count -= moved; if (s.count <= 0) this.setSlot(inv, invSlot, null);
    return { ok: true, moved };
  }

  chat(name, text) { this.server.chat(name, text); return true; }
}

function sameItem(r, name) {
  const key = r.isBlock ? (BLOCK_KEY[r.id] ?? '').toLowerCase() : String(r.id);
  return key === String(name).toLowerCase();
}
function fits(recipe, size) {
  if (recipe.shapeless) return (recipe.ingredients?.length ?? 9) <= size * size;
  return recipe.pattern.length <= size && recipe.pattern.every(row => row.length <= size);
}
/** An inventory stack that satisfies a recipe cell, by the game's own matcher (a one-cell probe recipe). */
const PROBE_RESULT = { id: '__probe__', isBlock: false, count: 1 };
function findIngredient(inv, want) {
  const probe = [{ pattern: [[want]], result: PROBE_RESULT }];
  const accepts = (s) => s && s.count > 0 && findMatchingRecipe([{ id: s.id, isBlock: !!s.isBlock, count: 1 }], 1, 1, probe) === PROBE_RESULT;
  for (const list of [inv.hotbar, inv.storage]) for (let i = 0; i < list.length; i++) if (accepts(list[i])) return { list, index: i, stack: list[i] };
  return null;
}
