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
