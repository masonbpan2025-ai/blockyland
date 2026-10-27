// Shared worlds, beyond the sword: arrows, snowballs and eggs that hit another player; a player dying where the others
// can see it (the fall, the smoke, the drops anyone can pick up, once); and what each player holds in their hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WorldSyncManager } from '../src/multiplayer/worldSyncManager.js';
import { ShareSession } from '../src/multiplayer/shareSession.js';
import { RemotePlayerManager, DEATH_SECONDS, deathTilt } from '../src/multiplayer/remotePlayerManager.js';
import { sanitizeAttack, refuseAttack, sanitizeDeathDrops, MAX_ATTACK_REACH, MAX_PROJECTILE_RANGE } from '../src/multiplayer/shareProtocol.js';
import { Player } from '../src/player.js';
import { BLOCKS } from '../src/blocks.js';
import { createFakeNetwork, nextEvent, settle } from './helpers/shareFakes.js';
import { readFileSync } from 'node:fs';

/** A small page, as in worldSyncManager.test.js: every element the manager looks up exists. */
function setupMockDom(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'document', previous); else delete globalThis.document; });
  const elements = new Map();
  const make = (tag, id = null) => ({
    tagName: tag, id, textContent: '', value: '', style: {}, children: [], onclick: null, title: '', className: '',
    classList: { classes: new Set(), add(c) { this.classes.add(c); }, remove(c) { this.classes.delete(c); }, contains(c) { return this.classes.has(c); }, toggle(c, on) { if (on) this.classes.add(c); else this.classes.delete(c); } },
    appendChild(child) { this.children.push(child); return child; }, append(...n) { this.children.push(...n); }, replaceChildren(...n) { this.children = [...n]; },
    addEventListener() {}, removeEventListener() {}, remove() {}, select() {},
    getContext: () => new Proxy({}, { get: (_, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true }),
  });
  const get = (id) => { if (!elements.has(id)) elements.set(id, make('div', id)); return elements.get(id); };
  globalThis.document = { getElementById: get, createElement: (tag) => make(tag), body: make('body'), execCommand() {} };
}

/** A game with a player that records the hits it takes, an inventory, and dropped items that can be counted. */
function mockGame() {
  const voxels = new Map();
  const chatLog = [];
  const hits = [];
  const game = {
    scene: new THREE.Scene(),
    world: { seed: 1, voxels, getVoxel: (x, y, z) => voxels.get(`${x},${y},${z}`) ?? BLOCKS.AIR, setVoxel: (x, y, z, id) => voxels.set(`${x},${y},${z}`, id), getChunk: (cx, cz) => ({ cx, cz }), chunks: new Map() },
    player: {
      position: new THREE.Vector3(0, 30, 0), yaw: 0, pitch: 0, health: 20, isDead: false,
      takeDamage(amount, source, type, _, options) { hits.push({ amount, source, type, options }); this.health -= amount; if (this.health <= 0) this.isDead = true; },
    },
    inventory: { held: null, getActiveItem() { return this.held; }, added: [], addItem(id, isBlock, count) { this.added.push({ id, isBlock, count }); return true; } },
    entities: {
      droppedItems: [], smoke: 0,
      itemVisuals: { created: [], create(id, isBlock) { this.created.push({ id, isBlock }); const g = new THREE.Group(); g.add(new THREE.Object3D(), new THREE.Object3D()); return g; }, release(o) { o.removeFromParent(); } },
      spawnDroppedItem(pos, itemType, isBlock, count) { const e = { group: new THREE.Group(), itemType, isBlock, count, position: pos.clone() }; this.droppedItems.push(e); return e; },
      spawnSmoke() { this.smoke++; },
    },
    ui: { addChatMessage: (m) => chatLog.push(m), closeAllModals() {}, updateStats() {}, updateHotbar() {} },
    chatLog, hits,
    worldGenerated: true, worldReady: true, worldTime: 1000, isMouseDown: false,
    rebuildChunkMesh() {}, generateNewWorld: async () => {},
  };
  return game;
}

function managerOn(network, name) {
  const game = mockGame();
  const session = new ShareSession({ signalingFactory: network.signalingFactory, peerFactory: network.peerFactory,
    location: { href: 'https://game.example/', protocol: 'https:', host: 'game.example', search: '' },
    timeouts: { connectMs: 400, heartbeatMs: 40, silenceMs: 400, resignalMs: 30 } });
  const serialize = (g) => ({ voxels: [...g.world.voxels.entries()] });
  const deserialize = async (g, data) => { for (const [k, v] of data.voxels) g.world.voxels.set(k, v); };
  const manager = new WorldSyncManager(game, { session, serialize, deserialize });
  manager.playerName = () => name;
  return { manager, game, session };
}

/** A host and a guest in one world, PvP on, each standing where `at` says, and each seeing the other there. */
async function duel(t, { hostAt = [0, 30, 0], guestAt = [0, 30, -20], pvp = true } = {}) {
  setupMockDom(t);
  const network = createFakeNetwork();
  const host = managerOn(network, 'Hosty'), guest = managerOn(network, 'Guesty');
  t.after(() => { guest.session.disconnect(true); host.session.disconnect(true); });
  await host.manager.hostWorld({ quiet: true, pvp });
  await guest.manager.joinWorld(host.manager.roomId);
  host.game.player.position.set(...hostAt);
  guest.game.player.position.set(...guestAt);
  for (let i = 0; i < 4; i++) { host.manager.update(0.05); guest.manager.update(0.05); await settle(5); }
  return { host, guest };
}

// --- the rules ---------------------------------------------------------------------------------------------------

test('a projectile hit: an arrow carries its damage, a snowball or an egg none; anything else is refused', () => {
  assert.deepEqual(sanitizeAttack({ target: 'p1', damage: 6, projectile: 'arrow', flame: true }), { target: 'p1', damage: 6, projectile: 'arrow', flame: true });
  assert.deepEqual(sanitizeAttack({ target: 'p1', damage: 5, projectile: 'snowball' }), { target: 'p1', damage: 0, projectile: 'snowball' });
  assert.deepEqual(sanitizeAttack({ target: 'p1', damage: 0, projectile: 'egg' }), { target: 'p1', damage: 0, projectile: 'egg' });
  assert.equal(sanitizeAttack({ target: 'p1', damage: 0, projectile: 'arrow' }), null, 'an arrow that does nothing is no hit');
  assert.equal(sanitizeAttack({ target: 'p1', damage: 6, projectile: 'laser' }), null);
  assert.equal(sanitizeAttack({ target: 'p1', damage: 0 }), null, 'a sword hit still needs damage');
});

test('the host lets a shot come from farther than a sword reaches, but not from anywhere', () => {
  const at = (x) => ({ x, y: 0, z: 0 });
  const settings = { pvp: true };
  assert.equal(refuseAttack({ settings, attackerId: 'a', targetId: 'b', attackerPos: at(0), targetPos: at(40) }), 'too_far', 'a sword from 40 blocks');
  assert.equal(refuseAttack({ settings, attackerId: 'a', targetId: 'b', attackerPos: at(0), targetPos: at(40), projectile: 'arrow' }), null);
  assert.equal(refuseAttack({ settings, attackerId: 'a', targetId: 'b', attackerPos: at(0), targetPos: at(MAX_PROJECTILE_RANGE + 5), projectile: 'arrow' }), 'too_far');
  assert.ok(MAX_PROJECTILE_RANGE > MAX_ATTACK_REACH * 10);
});

// --- arrows, snowballs and eggs --------------------------------------------------------------------------------------

test('an arrow the guest shoots through the host hurts the host as an arrow, from 20 blocks away', async (t) => {
  const { host, guest } = await duel(t);
  // The arrow's step: from just in front of the host to just behind it, at chest height.
  const hit = guest.manager.projectileHit(new THREE.Vector3(0, 31, -1), new THREE.Vector3(0, 31, 1), { kind: 'arrow', damage: 6 });
  assert.equal(hit, true, 'the arrow stops at the player');
  await settle(10);
  assert.equal(host.game.hits.length, 1);
  const [h] = host.game.hits;
  assert.equal(h.amount, 6);
  assert.equal(h.type, 'arrow', 'an arrow: shields and Projectile Protection answer it');
  assert.equal(h.options.fromPlayer, true, 'and it knocks back as a player\'s hit');
  assert.ok(Math.abs(h.source.z - -20) < 0.5, 'away from the shooter');
});

test('an arrow that misses, or flies past someone dead, hits nobody', async (t) => {
  const { host, guest } = await duel(t);
  assert.equal(guest.manager.projectileHit(new THREE.Vector3(3, 31, -1), new THREE.Vector3(3, 31, 1), { kind: 'arrow', damage: 6 }), false);
  guest.manager.remotePlayers.remotePlayers.get('host').dead = true;
  assert.equal(guest.manager.projectileHit(new THREE.Vector3(0, 31, -1), new THREE.Vector3(0, 31, 1), { kind: 'arrow', damage: 6 }), false);
  await settle(10);
  assert.equal(host.game.hits.length, 0);
});

test('a snowball or an egg hurts nobody but knocks the player back', async (t) => {
  const { host, guest } = await duel(t);
  for (const kind of ['snowball', 'egg']) assert.equal(guest.manager.projectileHit(new THREE.Vector3(0, 31, -1), new THREE.Vector3(0, 31, 1), { kind }), true);
  await settle(10);
  // Both reach the host (its player ignores the second inside the hurt window: player.js); neither deals damage.
  assert.equal(host.game.hits.length, 2);
  for (const h of host.game.hits) { assert.equal(h.amount, 0); assert.equal(h.type, 'player'); assert.equal(h.options.fromPlayer, true); }
});

test('with PvP off an arrow passes through the other player', async (t) => {
  const { host, guest } = await duel(t, { pvp: false });
  assert.equal(guest.manager.projectileHit(new THREE.Vector3(0, 31, -1), new THREE.Vector3(0, 31, 1), { kind: 'arrow', damage: 6 }), false);
  await settle(10);
  assert.equal(host.game.hits.length, 0);
});

test('shot dead: "was shot by", in Minecraft\'s words', async (t) => {
  const { host, guest } = await duel(t);
  host.game.player.health = 4;
  guest.manager.projectileHit(new THREE.Vector3(0, 31, -1), new THREE.Vector3(0, 31, 1), { kind: 'arrow', damage: 6 });
  await settle(10);
  assert.ok(host.game.chatLog.some((m) => /Hosty was shot by Guesty/.test(m)), host.game.chatLog.join('\n'));
});

test('the arrows module asks the shared world about every step of this player\'s arrow', async () => {
  const { updateArrows, spawnArrow } = await import('../src/arrows.js');
  const calls = [];
  const manager = {
    arrows: [], mobs: [], scene: new THREE.Scene(),
    world: { getVoxel: () => BLOCKS.AIR, redstone: null },
    game: { worldSync: { projectileHit: (from, to, shot) => { calls.push({ from: from.clone(), to: to.clone(), shot }); return calls.length === 3; } } },
  };
  spawnArrow(manager, new THREE.Vector3(0, 31, 0), new THREE.Vector3(0, 0, -1), 'player', { speed: 30, damage: 6, flaming: true });
  updateArrows(manager, 0.05, { position: new THREE.Vector3(100, 0, 100) });
  assert.equal(calls.length, 3, 'stepped, and stopped at the hit');
  assert.deepEqual(calls[0].shot, { kind: 'arrow', damage: 6, flame: true });
  assert.ok(calls[1].from.distanceTo(calls[0].to) < 1e-9, 'consecutive steps');
  assert.equal(manager.arrows.length, 0, 'the arrow is gone');
});

// --- dying where the others can see -------------------------------------------------------------------------------------

test('a dead player tips over, red, then is gone in a puff of smoke; they stand again where they respawn', (t) => {
  setupMockDom(t);
  const game = mockGame();
  const players = new RemotePlayerManager(game);
  players.updatePeerState('p1', { x: 5, y: 30, z: 5, yaw: 0, pitch: 0 });
  const peer = players.remotePlayers.get('p1');
  players.updatePeerState('p1', { x: 5, y: 30, z: 5, dead: true });
  assert.equal(peer.dead, true);
  players.update(0.3);
  assert.ok(Math.abs(peer.avatar.mesh.rotation.z - deathTilt(0.3)) < 1e-9 && peer.avatar.mesh.rotation.z > 0.9, 'tipping: past 50 degrees after 6 ticks');
  players.update(0.2);
  assert.ok(peer.avatar.mesh.rotation.z > 1.3, 'nearly on its side after 10');
  assert.equal(peer.avatar.mesh.visible, true);
  players.update(DEATH_SECONDS - 0.5);
  assert.equal(peer.avatar.mesh.visible, false, 'gone');
  assert.ok(game.entities.smoke >= 10, 'in a puff of smoke');
  assert.equal(players.pickPlayer(new THREE.Vector3(5, 31, 0), new THREE.Vector3(0, 0, 1), 10), null, 'nobody to hit there');
  // Positions while dead do not move the body; the respawn does.
  players.updatePeerState('p1', { x: 50, y: 40, z: 50, dead: false });
  assert.equal(peer.dead, false);
  assert.equal(peer.avatar.mesh.visible, true);
  assert.equal(peer.avatar.mesh.rotation.z, 0);
  assert.equal(peer.avatar.mesh.position.x, 50, 'standing where they respawned, not sliding there');
  // Java's curve: sqrt((ticks - 1) / 20 x 1.6) of 90 degrees -- on its side at 13.5 ticks, and never past it.
  assert.ok(Math.abs(deathTilt(13.5 / 20) - Math.PI / 2) < 1e-9);
  assert.ok(deathTilt(10 / 20) < Math.PI / 2);
  assert.equal(deathTilt(5), Math.PI / 2);
});

test('the dead player\'s items drop for everyone; the first to walk over one gets it, once', async (t) => {
  const { host, guest } = await duel(t);
  const stacks = [{ id: 'diamond_sword', count: 1, isBlock: false, item: { id: 'diamond_sword', count: 1, isBlock: false, enchantments: [{ id: 'sharpness', level: 2 }] } },
    { id: BLOCKS.OAK_PLANKS, count: 12, isBlock: true }];
  assert.equal(guest.manager.shareDeathDrops(guest.game.player.position, stacks), true);
  await settle(10);
  for (const side of [host, guest]) {
    assert.deepEqual(side.game.entities.droppedItems.map((d) => [d.itemType, d.count]), [['diamond_sword', 1], [BLOCKS.OAK_PLANKS, 12]], 'both see both drops');
  }
  // Both walk over the sword; the host asks first.
  const sword = (side) => side.game.entities.droppedItems.find((d) => d.itemType === 'diamond_sword');
  sword(host).claim();
  sword(guest).claim();
  await settle(10);
  assert.deepEqual(host.game.inventory.added, [{ id: 'diamond_sword', isBlock: false, count: 1 }]);
  assert.deepEqual(guest.game.inventory.added, [], 'too late');
  for (const side of [host, guest]) assert.equal(sword(side), undefined, 'gone for both');
  assert.equal(guest.game.entities.droppedItems.length, 1, 'the planks are still there');
});

test('a death\'s drops appear where the player died, not wherever a guest says', async (t) => {
  const { host, guest } = await duel(t);
  guest.session.dropItems(500, 30, 500, [{ id: 'diamond', count: 64, isBlock: false }]);
  await settle(10);
  assert.equal(host.game.entities.droppedItems.length, 0);
  assert.equal(sanitizeDeathDrops({ x: 0, y: 0, z: 0, items: Array(50).fill({ id: 'stick', count: 1 }) }), null, 'more than a player carries');
});

test('dying in a shared world drops through it; alone, at the player\'s feet as before', () => {
  const drop = (worldSync) => {
    const spawned = [];
    const player = Object.create(Player.prototype);
    Object.assign(player, { deathDropsDone: false, position: new THREE.Vector3(1, 2, 3), level: 0, xpLevel: 0,
      inventory: { hotbar: [{ id: 'iron_sword', count: 1, isBlock: false }], storage: [], armor: {}, clearCarried() { this.hotbar = []; } },
      game: { worldSync, entities: { spawnDroppedItem: (...a) => spawned.push(a), spawnXpOrbs() {} }, ui: {} } });
    player.dropInventoryOnDeath();
    return spawned;
  };
  let shared = null;
  assert.equal(drop({ shareDeathDrops: (at, stacks) => { shared = stacks; return true; } }).length, 0, 'not dropped twice');
  assert.equal(shared[0].id, 'iron_sword');
  assert.equal(drop(null).length, 1);
  assert.equal(drop({ shareDeathDrops: () => false }).length, 1, 'not connected: dropped here');
});

test('the others see a player dead: the state says so until the respawn', async (t) => {
  const { host, guest } = await duel(t);
  guest.game.player.health = 0;
  guest.game.player.isDead = true;
  for (let i = 0; i < 3; i++) { guest.manager.update(0.05); await settle(5); }
  assert.equal(host.manager.remotePlayers.remotePlayers.get(guest.session.clientId).dead, true);
  guest.game.player.health = 20;
  guest.game.player.isDead = false;
  for (let i = 0; i < 3; i++) { guest.manager.update(0.05); await settle(5); }
  assert.equal(host.manager.remotePlayers.remotePlayers.get(guest.session.clientId).dead, false);
});

// --- what is in each player's hand ----------------------------------------------------------------------------------

test('another player\'s sword, bow or block is drawn in their hand, and changes when they change it', async (t) => {
  const { host, guest } = await duel(t);
  const held = () => host.manager.remotePlayers.remotePlayers.get(guest.session.clientId).avatar.handSlot.children;
  const step = async () => { for (let i = 0; i < 3; i++) { guest.manager.update(0.05); await settle(5); } };
  guest.game.inventory.held = { id: 'diamond_sword', isBlock: false };
  await step();
  assert.equal(held().length, 1);
  assert.equal(held()[0].userData.itemId, 'diamond_sword');
  assert.deepEqual(host.game.entities.itemVisuals.created.at(-1), { id: 'diamond_sword', isBlock: false });
  guest.game.inventory.held = { id: BLOCKS.OAK_PLANKS, isBlock: true };
  await step();
  assert.equal(held()[0].userData.itemId, BLOCKS.OAK_PLANKS, 'a block travels as its number');
  assert.deepEqual(host.game.entities.itemVisuals.created.at(-1), { id: BLOCKS.OAK_PLANKS, isBlock: true });
  const made = host.game.entities.itemVisuals.created.length;
  await step();
  assert.equal(host.game.entities.itemVisuals.created.length, made, 'not rebuilt while it stays the same');
  guest.game.inventory.held = null;
  await step();
  assert.equal(held().length, 0, 'an empty hand');
});

test('the other way: the host\'s arrow and snowball reach the guest as an arrow and a snowball', async (t) => {
  const { host, guest } = await duel(t, { hostAt: [0, 30, -20], guestAt: [0, 30, 0] });
  assert.equal(host.manager.projectileHit(new THREE.Vector3(0, 31, -1), new THREE.Vector3(0, 31, 1), { kind: 'arrow', damage: 5, flame: true }), true);
  await settle(10);
  assert.equal(guest.game.hits.length, 1);
  assert.equal(guest.game.hits[0].type, 'arrow');
  assert.equal(guest.game.hits[0].amount, 5);
  assert.equal(host.manager.projectileHit(new THREE.Vector3(0, 31, -1), new THREE.Vector3(0, 31, 1), { kind: 'snowball' }), true);
  await settle(10);
  assert.equal(guest.game.hits.length, 2, 'a snowball arrives, with no damage');
  assert.equal(guest.game.hits[1].amount, 0);
  assert.equal(guest.game.hits[1].options.fromPlayer, true);
});

// --- seeing another player's shots ------------------------------------------------------------------------------------

test('a shot is where it left the hand and how fast, never faster than any bow; a landing is where and which potion', async () => {
  const { sanitizeShot, MAX_SHOT_SPEED } = await import('../src/multiplayer/shareProtocol.js');
  assert.deepEqual(sanitizeShot({ kind: 'arrow', x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: 30, flaming: true, extra: 'x' }),
    { kind: 'arrow', x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: 30, flaming: true });
  assert.deepEqual(sanitizeShot({ kind: 'snowball', x: 0, y: 0, z: 0, vx: 22, vy: 0, vz: 0, flaming: true }),
    { kind: 'snowball', x: 0, y: 0, z: 0, vx: 22, vy: 0, vz: 0 }, 'only an arrow burns');
  for (const kind of ['egg', 'ender_pearl', 'ender_eye']) assert.equal(sanitizeShot({ kind, x: 0, y: 0, z: 0, vx: 1, vy: 0, vz: 0 })?.kind, kind);
  assert.equal(sanitizeShot({ kind: 'trident', x: 0, y: 0, z: 0, vx: 1, vy: 0, vz: 0 }), null, 'nothing the game cannot throw');
  assert.deepEqual(sanitizeShot({ kind: 'firework', x: 0, y: 10, z: 0, top: 30 }), { kind: 'firework', x: 0, y: 10, z: 0, top: 30 });
  assert.equal(sanitizeShot({ kind: 'firework', x: 0, y: 10, z: 0, top: 500 }), null);
  assert.deepEqual(sanitizeShot({ kind: 'splash_potion', x: 1, y: 2, z: 3, item: 'splash_potion_of_harming' }), { kind: 'splash_potion', x: 1, y: 2, z: 3, item: 'splash_potion_of_harming' });
  assert.equal(sanitizeShot({ kind: 'splash_potion', x: 1, y: 2, z: 3, item: 'lingering_potion_of_harming' }), null, 'the item must be that kind of potion');
  assert.equal(sanitizeShot({ kind: 'lingering_potion', x: 1, y: 2, z: 3, item: '<img>' }), null);
  assert.deepEqual(sanitizeShot({ kind: 'experience_bottle', x: 1, y: 2, z: 3, vx: 9 }), { kind: 'experience_bottle', x: 1, y: 2, z: 3 });
  assert.equal(sanitizeShot({ kind: 'arrow', x: 0, y: 0, z: 0, vx: MAX_SHOT_SPEED + 1, vy: 0, vz: 0 }), null);
  assert.equal(sanitizeShot({ kind: 'arrow', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }), null);
  assert.equal(sanitizeShot({ kind: 'arrow', x: NaN, y: 0, z: 0, vx: 1, vy: 0, vz: 0 }), null);
});

/** Each game's arrows and snowballs, as the mob manager keeps them. */
async function giveProjectiles(game) {
  const { spawnArrow } = await import('../src/arrows.js');
  game.mobs = {
    arrows: [], mobs: [], snowballs: [], scene: game.scene, world: game.world, game,
    spawnArrow(origin, direction, shooter, options) { return spawnArrow(this, origin, direction, shooter, options); },
    isBlockSolid: () => false, getMobDimensions: () => ({ width: 0.6, height: 1.8 }),
  };
  return game.mobs;
}

test('the guest\'s arrow is seen flying by the host, passes out of the guest\'s own body, and stops at the host unharmed', async (t) => {
  const { host, guest } = await duel(t);
  const { updateArrows } = await import('../src/arrows.js');
  await giveProjectiles(guest.game);
  const hostMobs = await giveProjectiles(host.game);
  // The guest, 20 blocks away at z = -20, shoots at the host.
  guest.game.worldSync = guest.manager;
  guest.game.mobs.spawnArrow(new THREE.Vector3(0, 31.5, -19.6), new THREE.Vector3(0, 0, 1), 'player', { speed: 50, damage: 6, flaming: true });
  await settle(10);
  assert.equal(hostMobs.arrows.length, 1, 'the host sees the arrow');
  const [arrow] = hostMobs.arrows;
  assert.equal(arrow.visual, true);
  assert.equal(arrow.flaming, true);
  assert.equal(arrow.pickup, false, 'nobody picks up an arrow that is only drawn');
  assert.equal(arrow.shooterId, guest.session.clientId);
  assert.ok(arrow.mesh.position.distanceTo(new THREE.Vector3(0, 31.5, -19.6)) < 1e-9);
  assert.ok(Math.abs(arrow.velocity.z - 50) < 1e-9);
  host.game.worldSync = host.manager;
  updateArrows(hostMobs, 0.05, host.game.player);
  assert.equal(hostMobs.arrows.length, 1, 'it leaves the shooter\'s body without stopping there');
  for (let i = 0; i < 20 && hostMobs.arrows.length; i++) updateArrows(hostMobs, 0.05, host.game.player);
  assert.equal(hostMobs.arrows.length, 0, 'gone where it reached the host');
  assert.equal(host.game.hits.length, 0, 'drawn only: the hit is the shooter\'s game\'s to report');
});

test('the host\'s snowball is seen by the guest; a mob\'s arrow and another player\'s drawn arrow are not passed on', async (t) => {
  const { host, guest } = await duel(t);
  const { useSnowball } = await import('../src/netherCombat.js');
  const guestMobs = await giveProjectiles(guest.game);
  await giveProjectiles(host.game);
  host.game.worldSync = host.manager;
  host.game.inventory.held = { id: 'snowball', count: 4 };
  host.game.inventory.consumeActiveItem = () => {};
  host.game.player.camera = { getWorldDirection: (v) => v.set(0, 0, -1) };
  host.game.player.gamemode = 'survival';
  assert.equal(useSnowball(host.game), true);
  // A skeleton's arrow and a drawn copy of someone's arrow stay where they are.
  host.game.mobs.spawnArrow(new THREE.Vector3(0, 31, 0), new THREE.Vector3(0, 0, -1), { mesh: null });
  host.game.mobs.spawnArrow(new THREE.Vector3(0, 31, 0), new THREE.Vector3(0, 0, -1), 'remote', { visual: true });
  await settle(10);
  assert.equal(guestMobs.snowballs.length, 1);
  assert.equal(guestMobs.snowballs[0].visual, true);
  assert.ok(Math.abs(guestMobs.snowballs[0].velocity.z - -22) < 1e-9);
  assert.equal(guestMobs.arrows.length, 0);
});

test('a guest\'s shot from far from where the host last saw it is not passed on', async (t) => {
  const { host, guest } = await duel(t);
  const shots = [];
  host.session.on('shot', (s) => shots.push(s));
  guest.session.sendShot({ kind: 'arrow', x: 0, y: 31.5, z: -19.6, vx: 0, vy: 0, vz: 30 });
  guest.session.sendShot({ kind: 'arrow', x: 0, y: 31.5, z: 40, vx: 0, vy: 0, vz: 30 });
  await settle(10);
  assert.equal(shots.length, 1);
  assert.equal(shots[0].peerId, guest.session.clientId);
});

// --- everything else that is seen: the look, and every throw ------------------------------------------------------------

test('a look is checked: real armour and trims, a held id in the off hand, flags as flags, a bobber near its player', async () => {
  const { sanitizePlayerState } = await import('../src/multiplayer/shareProtocol.js');
  const s = sanitizePlayerState({
    x: 0, y: 30, z: 0,
    armor: [{ id: 'diamond_helmet', trim: { pattern: 'coast', material: 'gold' } }, { id: 'iron_chestplate', trim: { pattern: '<b>' } }, null, { id: 'BAD ID' }],
    offhand: 'shield', blocking: true, using: 'bow', burning: 1, invisible: true, bobber: [3, 29, 4],
  });
  assert.deepEqual(s.armor, [{ id: 'diamond_helmet', trim: { pattern: 'coast', material: 'gold' } }, { id: 'iron_chestplate' }, null, null]);
  assert.equal(s.offhand, 'shield');
  assert.equal(s.blocking, true);
  assert.equal(s.using, 'bow');
  assert.equal(s.burning, false, 'a flag is true or nothing');
  assert.equal(s.invisible, true);
  assert.deepEqual(s.bobber, [3, 29, 4]);
  assert.equal(sanitizePlayerState({ x: 0, y: 30, z: 0, bobber: [500, 29, 4] }).bobber, null, 'a bobber far from its player');
  assert.equal(sanitizePlayerState({ x: 0, y: 30, z: 0, using: 'dance' }).using, null);
  assert.equal(sanitizePlayerState({ x: 0, y: 30, z: 0 }).armor, undefined, 'no armour said: none changed');
});

test('this player\'s look is what it wears, holds in the off hand and does', async () => {
  const { lookOf } = await import('../src/multiplayer/playerLook.js');
  const game = {
    inventory: { armor: { head: null, chest: { id: 'netherite_chestplate', count: 1, trim: { pattern: 'rib', material: 'diamond' } }, legs: null, feet: { id: 'iron_boots', count: 1 } }, offhand: { id: 'shield', count: 1 } },
    player: { isBlocking: true, fireTicks: 3, hasStatusEffect: (id) => id === 'invisibility' },
    bow: { drawing: false }, eating: { eating: true },
    fishing: { bobber: { position: new THREE.Vector3(1.234, 2, 3) } },
  };
  assert.deepEqual(lookOf(game), {
    armor: [null, { id: 'netherite_chestplate', trim: { pattern: 'rib', material: 'diamond' } }, null, { id: 'iron_boots' }],
    offhand: 'shield', blocking: true, using: 'eat', burning: true, invisible: true, bobber: [1.23, 2, 3],
  });
});

const exchange = async (host, guest, rounds = 4) => {
  for (let i = 0; i < rounds; i++) { host.manager.update(0.05); guest.manager.update(0.05); await settle(5); }
};

test('the host\'s armour, shield, flames, invisibility and fishing line are seen on its avatar by the guest', async (t) => {
  const { host, guest } = await duel(t);
  const hp = host.game.player;
  host.game.inventory.armor = { head: { id: 'diamond_helmet', count: 1 }, chest: { id: 'iron_chestplate', count: 1, trim: { pattern: 'coast', material: 'gold' } }, legs: null, feet: { id: 'golden_boots', count: 1 } };
  host.game.inventory.offhand = { id: 'shield', count: 1 };
  Object.assign(hp, { isBlocking: true, isOnFire: true, hasStatusEffect: (id) => id === 'invisibility' });
  host.game.fishing = { bobber: { position: new THREE.Vector3(2, 29, 3) } };
  await exchange(host, guest);
  const peer = guest.manager.remotePlayers.remotePlayers.get('host');
  const model = peer.avatar.mesh;
  for (const slot of ['head', 'chest', 'feet']) assert.ok(model.hasArmor(slot), `wears its ${slot} armour`);
  assert.equal(model.hasArmor('legs'), false);
  assert.equal(model.equippedArmorState.chest.trimKey, 'coast_gold', 'with its trim');
  assert.equal(peer.avatar.offhandSlot.children[0]?.userData.itemId, 'shield', 'the shield in its off hand');
  guest.manager.remotePlayers.update(0.05);
  assert.ok(peer.avatar.leftArm.rotation.x < -0.5, 'the shield raised');
  assert.equal(peer.avatar.flames?.visible, true, 'on fire');
  // Invisible: the body and the name tag go; the armour and the shield stay, as in Java.
  const kept = (c) => { for (let o = c; o && o !== model; o = o.parent) if (/^armor_|^hand_slot$|^flames$/.test(o.name)) return true; return false; };
  const shown = [];
  model.traverse((c) => { if (c.isMesh && c.visible) shown.push(c); });
  assert.ok(shown.length > 0 && shown.every(kept), 'only armour, items and flames are seen');
  assert.equal(peer.avatar.nametag.visible, false);
  assert.ok(peer.bobber && peer.bobber.position.distanceTo(new THREE.Vector3(2, 29, 3)) < 1e-9, 'its bobber, where it is');
  // All of it goes away again.
  host.game.inventory.armor = { head: null, chest: null, legs: null, feet: null };
  host.game.inventory.offhand = null;
  Object.assign(hp, { isBlocking: false, isOnFire: false, hasStatusEffect: () => false });
  host.game.fishing = { bobber: null };
  await exchange(host, guest);
  for (const slot of ['head', 'chest', 'legs', 'feet']) assert.equal(model.hasArmor(slot), false);
  assert.equal(peer.avatar.offhandSlot.children.length, 0);
  assert.equal(peer.avatar.flames.visible, false);
  assert.equal(peer.avatar.nametag.visible, true);
  const body = [];
  model.traverse((c) => { if (c.isMesh && c.visible && !kept(c)) body.push(c); });
  assert.ok(body.length >= 6, 'the body is back');
  assert.equal(peer.bobber, null);
});

test('a drawn bow is held out in both arms, and food at the mouth', async (t) => {
  const { host, guest } = await duel(t);
  host.game.bow = { drawing: true };
  await exchange(host, guest, 3);
  const peer = guest.manager.remotePlayers.remotePlayers.get('host');
  guest.manager.remotePlayers.update(0.05);
  assert.ok(Math.abs(peer.avatar.rightArm.rotation.x + Math.PI / 2) < 0.2 && Math.abs(peer.avatar.leftArm.rotation.x + Math.PI / 2) < 0.2);
  host.game.bow = { drawing: false };
  host.game.eating = { eating: true };
  await exchange(host, guest, 3);
  guest.manager.remotePlayers.update(0.05);
  assert.equal(peer.using, 'eat');
  assert.ok(peer.avatar.rightArm.rotation.x < -0.9);
});

test('every throw is seen: an egg, a pearl and an Eye of Ender fly and break; potions, bottles and fireworks show where they go', async (t) => {
  const { host, guest } = await duel(t);
  const { LingeringClouds } = await import('../src/lingeringPotion.js');
  const bursts = [], rockets = [];
  guest.game.mobs = { scene: guest.game.scene, spawnParticleBurst: (at, color) => bursts.push({ at: at.clone(), color }) };
  guest.game.entities.spawnFireworkRocket = (at, top) => rockets.push({ at: at.clone(), top });
  guest.game.lingeringClouds = new LingeringClouds(guest.game);
  const send = (kind, at, velocity, extra) => host.manager.shareShot(kind, new THREE.Vector3(...at), velocity && new THREE.Vector3(...velocity), extra);
  send('egg', [5, 31.5, 0], [0, 0, 20]);
  send('ender_pearl', [-5, 31.5, 0], [0, 0, 30]);
  send('ender_eye', [0, 31.5, 5], [2, 6, 0]);
  send('firework', [0, 31.5, 0], null, { top: 50 });
  send('splash_potion', [3, 30, 3], null, { item: 'splash_potion_of_harming' });
  send('lingering_potion', [-3, 30, -3], null, { item: 'lingering_potion_of_poison' });
  send('experience_bottle', [1, 31, 1]);
  await settle(15);
  const flying = guest.manager.remoteShots.flying;
  assert.deepEqual(flying.map((s) => s.kind).sort(), ['egg', 'ender_eye', 'ender_pearl']);
  assert.equal(rockets.length, 1);
  assert.equal(rockets[0].top, 50);
  assert.equal(bursts.length, 3, 'two potions splash, a bottle breaks');
  assert.equal(guest.game.lingeringClouds.clouds.length, 1, 'the cloud lies there');
  assert.equal(guest.game.lingeringClouds.clouds[0].playerOnly, true, 'and it is for this player alone');
  // Stone below y = 25: the egg and the pearl fall and break on it; the eye's flight ends in the air.
  guest.game.world.getVoxel = (x, y) => (y < 25 ? BLOCKS.STONE : BLOCKS.AIR);
  for (let i = 0; i < 100 && guest.manager.remoteShots.flying.length; i++) guest.manager.update(0.05);
  assert.equal(guest.manager.remoteShots.flying.length, 0);
  assert.equal(bursts.length, 3 + 2, 'the egg and the pearl break in a burst where they land');
  assert.equal(guest.game.hits.length, 0);
});

test('every throw in the game tells the shared world', () => {
  const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
  assert.match(read('arrows.js'), /shareShot\?\.\('arrow'/);
  assert.match(read('netherCombat.js'), /shareShot\?\.\('snowball'/);
  assert.match(read('animalBehaviors.js'), /shareShot\?\.\('egg'/);
  assert.match(read('endItems.js'), /shareShot\?\.\('ender_pearl'/);
  assert.match(read('fireworks.js'), /shareShot\?\.\('firework'/);
  const main = read('main.js');
  for (const kind of ['ender_eye', 'splash_potion', 'lingering_potion', 'experience_bottle']) assert.match(main, new RegExp(`shareShot\\?\\.\\('${kind}'`), kind);
});

// --- potions on other players --------------------------------------------------------------------------------------

/** The host's player as a potion sees it: effects it is given, and the magic damage it takes. */
function takesPotions(game) {
  game.player.maxHealth = 20;
  game.player.effects = [];
  game.player.applyStatusEffect = (name, seconds, level) => game.player.effects.push([name, seconds, level]);
  return game.player;
}

test('the guest\'s Splash Potion of Harming at the host\'s feet hurts the host, as magic, and is the guest\'s hit', async (t) => {
  const { host, guest } = await duel(t, { guestAt: [0, 30, -3] });
  const player = takesPotions(host.game);
  const landed = [];
  host.session.on('attack_landed', (e) => landed.push(e));
  guest.manager.shareShot('splash_potion', new THREE.Vector3(0.5, 30, 0.5), null, { item: 'splash_potion_of_harming' });
  await settle(15);
  assert.equal(host.game.hits.length, 1);
  assert.equal(host.game.hits[0].amount, 6, 'Instant Damage I: 6');
  assert.equal(host.game.hits[0].type, 'magic');
  assert.deepEqual(landed, [{ attackerId: guest.session.clientId, targetId: 'host', damage: 0 }], 'a kill by it is the thrower\'s');
  // One landing far away reaches nobody.
  guest.manager.shareShot('splash_potion', new THREE.Vector3(0, 30, -8), null, { item: 'splash_potion_of_harming' });
  await settle(15);
  assert.equal(host.game.hits.length, 1);
  assert.equal(landed.length, 1);
  assert.equal(player.health, 14);
});

test('with PvP off a harmful splash leaves the other player alone, and a helpful one still helps', async (t) => {
  const { host, guest } = await duel(t, { pvp: false, guestAt: [0, 30, -3] });
  const player = takesPotions(host.game);
  guest.manager.shareShot('splash_potion', new THREE.Vector3(0, 30, 0), null, { item: 'splash_potion_of_poison' });
  guest.manager.shareShot('splash_potion', new THREE.Vector3(0, 30, 0), null, { item: 'splash_potion_of_swiftness' });
  player.health = 10;
  guest.manager.shareShot('splash_potion', new THREE.Vector3(0, 30, 0), null, { item: 'splash_potion_of_healing' });
  await settle(15);
  assert.deepEqual(player.effects.map(([name]) => name), ['speed']);
  assert.equal(player.health, 14, 'Instant Health I: 4');
  assert.equal(host.game.hits.length, 0);
});

test('the world\'s own game rules too: in a SkyWars lobby, or on a spectator, a potion harms nobody', async (t) => {
  const { host, guest } = await duel(t, { guestAt: [0, 30, -3] });
  const player = takesPotions(host.game);
  host.session.attackPolicy = () => 'not_started';
  guest.manager.shareShot('splash_potion', new THREE.Vector3(0, 30, 0), null, { item: 'splash_potion_of_harming' });
  await settle(15);
  assert.equal(host.game.hits.length, 0);
  assert.equal(player.health, 20);
});

test('the host\'s splash reaches the guest the same way: harm when the host allows it', async (t) => {
  const { host, guest } = await duel(t, { guestAt: [0, 30, -3] });
  takesPotions(guest.game);
  host.manager.shareShot('splash_potion', new THREE.Vector3(0, 30, -3), null, { item: 'splash_potion_of_weakness' });
  await settle(15);
  assert.deepEqual(guest.game.player.effects.map(([name, , level]) => [name, level]), [['weakness', 1]]);
});

test('another player\'s lingering cloud gives its effect to this player only, and its harm only as the host rules', async (t) => {
  const { host, guest } = await duel(t, { pvp: false, guestAt: [0, 30, -3] });
  const { LingeringClouds } = await import('../src/lingeringPotion.js');
  const player = takesPotions(host.game);
  host.game.mobs = { mobs: [{ type: 'pig', health: 10, mesh: { position: new THREE.Vector3(0, 30, 0) }, applyStatusEffect() { throw new Error('the guest\'s cloud is not this world\'s mobs\' business'); } }], scene: host.game.scene, spawnParticleBurst() {} };
  host.game.lingeringClouds = new LingeringClouds(host.game);
  host.game.world.getVoxel = (x, y) => (y < 30 ? BLOCKS.STONE : BLOCKS.AIR);
  guest.manager.shareShot('lingering_potion', new THREE.Vector3(0, 30, 0), null, { item: 'lingering_potion_of_poison' });
  guest.manager.shareShot('lingering_potion', new THREE.Vector3(0.5, 30, 0.5), null, { item: 'lingering_potion_of_regeneration' });
  await settle(15);
  assert.equal(host.game.lingeringClouds.clouds.length, 2);
  for (let i = 0; i < 20; i++) host.game.lingeringClouds.update(0.1);
  assert.deepEqual([...new Set(player.effects.map(([name]) => name))], ['regeneration'], 'PvP off: no poison from it');
});

test('a Splash Potion of Healing heals the player who throws it at their feet, and Harming hurts them', async () => {
  const { throwSplashPotion } = await import('../src/splashPotion.js');
  const hurt = [];
  const player = { position: new THREE.Vector3(), health: 10, maxHealth: 20, applyStatusEffect() { throw new Error('an instant effect is not a timed one'); }, takeDamage: (n, src, type) => hurt.push([n, type]) };
  throwSplashPotion({ player, mobs: { mobs: [] } }, new THREE.Vector3(1, 0, 0), 'splash_potion_of_healing');
  assert.equal(player.health, 14);
  throwSplashPotion({ player, mobs: { mobs: [] } }, new THREE.Vector3(1, 0, 0), 'splash_potion_of_harming');
  assert.deepEqual(hurt, [[6, 'magic']]);
});

// --- flames on whatever burns ------------------------------------------------------------------------------------------

test('a burning mob, or a burning player\'s avatar, shows flames sized to it; they go out with the fire', async () => {
  const { updateFlames, isBurning } = await import('../src/burningFlames.js');
  const mesh = new THREE.Group();
  assert.equal(updateFlames(mesh, false, 0.05), null, 'nothing made for what never burns');
  const flames = updateFlames(mesh, true, 0.05, () => ({ width: 1.4, height: 2.7 }));
  assert.equal(flames.parent, mesh);
  assert.equal(flames.visible, true);
  assert.ok(Math.abs(flames.children[0].position.y - 1.35) < 1e-9, 'standing on its feet, as tall as it');
  assert.equal(updateFlames(mesh, false, 0.05), flames);
  assert.equal(flames.visible, false);
  for (const actor of [{ isBurning: true }, { isOnFire: true }, { fireTicks: 2 }]) assert.equal(isBurning(actor), true);
  assert.equal(isBurning({ isBurning: false, fireTicks: 0 }), false);
  const mobs = readFileSync(new URL('../src/mobs.js', import.meta.url), 'utf8');
  assert.match(mobs, /updateFlames\(mob\.mesh, mob\.health > 0 && isBurning\(mob\), dt/, 'every mob, every frame');
});
