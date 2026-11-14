// A wind charge in a shared world (multiplayer/): the others see it fly, a direct hit hurts them 1, and its burst pushes
// them -- judged by the host, applied in their own game -- as Java's burst pushes any player near it (Wind Charge,
// Explosion). Built on the same fake network as shareCombat.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WorldSyncManager } from '../src/multiplayer/worldSyncManager.js';
import { ShareSession } from '../src/multiplayer/shareSession.js';
import { sanitizeAttack, sanitizeShot, MOVING_SHOTS } from '../src/multiplayer/shareProtocol.js';
import { FLYING } from '../src/multiplayer/remoteShots.js';
import { WindChargeSystem } from '../src/windCharge.js';
import { BLOCKS } from '../src/blocks.js';
import { createFakeNetwork, settle } from './helpers/shareFakes.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

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

/** A game whose player records its hits and can be pushed, in an open world (nothing between anyone). */
function mockGame() {
  const voxels = new Map(), hits = [];
  return {
    scene: new THREE.Scene(),
    world: { seed: 1, voxels, getVoxel: (x, y, z) => voxels.get(`${x},${y},${z}`) ?? BLOCKS.AIR, setVoxel: (x, y, z, id) => voxels.set(`${x},${y},${z}`, id), getChunk: (cx, cz) => ({ cx, cz }), chunks: new Map() },
    player: {
      position: new THREE.Vector3(0, 30, 0), velocity: new THREE.Vector3(), onGround: true, yaw: 0, pitch: 0, health: 20, isDead: false,
      gamemode: 'survival', eyeHeight: 1.62, height: 1.8, fallDistance: 0,
      takeDamage(amount, source, type, _, options) { hits.push({ amount, source, type, options }); this.health -= amount; if (this.health <= 0) this.isDead = true; },
    },
    inventory: { armor: {}, held: null, getActiveItem() { return this.held; }, addItem() { return true; } },
    entities: { droppedItems: [], spawnDroppedItem() {}, spawnSmoke() {}, itemVisuals: { create: () => new THREE.Group(), release() {} } },
    ui: { addChatMessage() {}, closeAllModals() {}, updateStats() {}, updateHotbar() {} },
    hits, worldGenerated: true, worldReady: true, worldTime: 1000, isMouseDown: false,
    rebuildChunkMesh() {}, generateNewWorld: async () => {},
  };
}

function managerOn(network, name) {
  const game = mockGame();
  const session = new ShareSession({ signalingFactory: network.signalingFactory, peerFactory: network.peerFactory,
    location: { href: 'https://game.example/', protocol: 'https:', host: 'game.example', search: '' },
    timeouts: { connectMs: 400, heartbeatMs: 40, silenceMs: 400, resignalMs: 30 } });
  const manager = new WorldSyncManager(game, { session, serialize: (g) => ({ voxels: [...g.world.voxels.entries()] }), deserialize: async (g, d) => { for (const [k, v] of d.voxels) g.world.voxels.set(k, v); } });
  manager.playerName = () => name;
  game.worldSync = manager;
  game.windCharges = new WindChargeSystem(game, { random: () => 0.5 });
  return { manager, game, session };
}

async function duel(t, { hostAt = [0, 30, 0], guestAt = [0, 30, -20], pvp = true } = {}) {
  setupMockDom(t);
  const network = createFakeNetwork();
  const host = managerOn(network, 'Hosty'), guest = managerOn(network, 'Guesty');
  t.after(() => { guest.session.disconnect(true); host.session.disconnect(true); });
  await host.manager.hostWorld({ quiet: true, pvp });
  await guest.manager.joinWorld(host.manager.roomId);
  host.game.player.position.set(...hostAt);
  guest.game.player.position.set(...guestAt);
  for (let i = 0; i < 6; i++) { host.manager.update(0.05); guest.manager.update(0.05); await settle(5); }
  return { host, guest };
}

// --- the rules ---------------------------------------------------------------------------------------------------

test('a wind charge hit: 1 damage at most (a direct hit) or none (the burst), and always a push no stronger than 1.22 a tick', () => {
  const push = { x: 0, y: 1.22, z: 0 };
  assert.deepEqual(sanitizeAttack({ target: 'p1', damage: 1, projectile: 'wind_charge', push }), { target: 'p1', damage: 1, projectile: 'wind_charge', push });
  assert.deepEqual(sanitizeAttack({ target: 'p1', damage: 0, projectile: 'wind_charge', push, floorY: 31 }), { target: 'p1', damage: 0, projectile: 'wind_charge', push, floorY: 31 });
  assert.equal(sanitizeAttack({ target: 'p1', damage: 2, projectile: 'wind_charge', push }), null, 'more than a wind charge deals');
  assert.equal(sanitizeAttack({ target: 'p1', damage: 0, projectile: 'wind_charge', push: { x: 0, y: 5, z: 0 } }), null, 'a launch no burst gives');
  assert.equal(sanitizeAttack({ target: 'p1', damage: 1, projectile: 'wind_charge' }), null, 'no push');
});

test('others see it fly: a wind charge is a shot, straight and without gravity', () => {
  assert.ok(MOVING_SHOTS.includes('wind_charge'));
  assert.deepEqual(sanitizeShot({ kind: 'wind_charge', x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: -30 }), { kind: 'wind_charge', x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: -30 });
  assert.equal(FLYING.wind_charge.gravity, 0);
});

// --- through the host --------------------------------------------------------------------------------------------

test('the guest\'s burst beside the host pushes the host as Java would, hurts it nothing, and its fall counts from the burst', async (t) => {
  const { host, guest } = await duel(t, { hostAt: [0.5, 30, 0.5], guestAt: [0.5, 30, -6] });
  // The burst at the host's feet, 1.2 blocks to its side: (1 - 1.2 / 2.4) x 1.22 = 0.61 blocks a tick, toward its eyes.
  guest.game.windCharges.burst(new THREE.Vector3(-0.7, 30, 0.5), { source: 'player', owner: guest.game.player });
  await settle(15);
  assert.equal(host.game.hits.length, 0, 'the burst deals no damage');
  const v = host.game.player.velocity;
  near(v.length() / 20, 0.61, 1e-3);
  assert.ok(v.x > 0 && v.y > 0, 'up and away from the burst');
  assert.equal(host.game.player.windChargeFloorY, 30, 'a player\'s charge: the fall counts only below the burst');
});

test('a direct hit on the other player: 1 damage and the push, in one message', async (t) => {
  const { host, guest } = await duel(t, { hostAt: [0.5, 30, -5.5], guestAt: [0.5, 30, 0.5] });
  const p = guest.game.player;
  p.yaw = 0; p.pitch = 0; // looking along -z, at the host
  guest.game.inventory.held = { id: 'wind_charge', isBlock: false, count: 3 };
  guest.game.inventory.consumeActiveItem = () => {};
  assert.equal(guest.game.windCharges.use(), true);
  for (let i = 0; i < 20 && guest.game.windCharges.charges.length; i++) guest.game.windCharges.update(0.05);
  await settle(15);
  assert.equal(host.game.hits.length, 1);
  assert.equal(host.game.hits[0].amount, 1);
  assert.equal(host.game.hits[0].type, 'wind_charge');
  assert.ok(host.game.player.velocity.length() > 0, 'and pushed');
});

test('Blast Protection IV on the other player takes 60% off the push it receives', async (t) => {
  const { host, guest } = await duel(t, { hostAt: [0.5, 30, 0.5], guestAt: [0.5, 30, -6] });
  host.game.inventory.armor = { chest: { id: 'iron_chestplate', enchantments: [{ id: 'blast_protection', level: 4 }] } };
  guest.game.windCharges.burst(new THREE.Vector3(0.5, 30, 0.5), { source: 'player', owner: guest.game.player });
  await settle(15);
  near(host.game.player.velocity.y / 20, 1.22 * 0.4, 1e-3);
});

test('with PvP off the burst leaves the other player where they are', async (t) => {
  const { host, guest } = await duel(t, { hostAt: [0.5, 30, 0.5], guestAt: [0.5, 30, -6], pvp: false });
  guest.game.windCharges.burst(new THREE.Vector3(0.5, 30, 0.5), { source: 'player', owner: guest.game.player });
  await settle(15);
  assert.equal(host.game.player.velocity.length(), 0);
});

test('a charge this player did not throw (a breeze\'s) is not sent to the others: their own game flies their breezes', async (t) => {
  const { host, guest } = await duel(t, { hostAt: [0.5, 30, 0.5], guestAt: [0.5, 30, -6] });
  guest.game.windCharges.burst(new THREE.Vector3(0.5, 30, 0.5), { source: 'breeze', owner: { type: 'breeze' } });
  await settle(15);
  assert.equal(host.game.player.velocity.length(), 0);
});

test('the throw is shown to the others: they see a wind charge leave the thrower\'s hand', async (t) => {
  const { host, guest } = await duel(t, { hostAt: [0.5, 30, -40], guestAt: [0.5, 30, 0.5] });
  guest.game.inventory.held = { id: 'wind_charge', isBlock: false, count: 3 };
  guest.game.inventory.consumeActiveItem = () => {};
  guest.game.windCharges.use();
  await settle(15);
  const seen = host.manager.remoteShots.flying.filter((s) => s.kind === 'wind_charge' || s.look === FLYING.wind_charge);
  assert.equal(seen.length, 1);
});
