// What a shared world's own game (a mod such as SkyWars) and its chests send between players: a small validated data
// channel, chest contents, and the host's say over which hits may land.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ShareSession } from '../src/multiplayer/shareSession.js';
import { sanitizeGameData, sanitizeContainer, MAX_GAME_DATA_CHARS, CONTAINER_SLOTS } from '../src/multiplayer/shareProtocol.js';
import { createFakeNetwork, nextEvent, settle } from './helpers/shareFakes.js';

async function arena(t, guests = 2) {
  const network = createFakeNetwork();
  const make = () => new ShareSession({ signalingFactory: network.signalingFactory, peerFactory: network.peerFactory });
  const host = make();
  const { roomId } = await host.hostRoom('Hosty', { settings: { pvp: true } });
  const list = [];
  for (let i = 0; i < guests; i++) { const g = make(); await g.joinRoom(roomId, `G${i}`); list.push(g); }
  await settle(5);
  t.after(() => { for (const g of list) g.disconnect(true); host.disconnect(true); });
  return { host, guests: list };
}

const slots = (fill = {}) => Array.from({ length: CONTAINER_SLOTS }, (_, i) => fill[i] ?? null);

test('game data: plain small objects with a type pass; anything else is refused', () => {
  assert.deepEqual(sanitizeGameData({ type: 'state', phase: 'lobby', players: [{ id: 'p1' }] }), { type: 'state', phase: 'lobby', players: [{ id: 'p1' }] });
  for (const bad of [null, 'text', [1, 2], { phase: 'no type' }, { type: 5 }, { type: 'x'.repeat(41) }, { type: 'big', blob: 'x'.repeat(MAX_GAME_DATA_CHARS) }]) {
    assert.equal(sanitizeGameData(bad), null, JSON.stringify(bad)?.slice(0, 40));
  }
  const sneaky = sanitizeGameData(JSON.parse('{"type":"x","__proto__":{"admin":true}}'));
  assert.equal(sneaky.admin, undefined);
  assert.equal(Object.getPrototypeOf(sneaky), Object.prototype);
});

test('chest contents: 27 slots of real stacks at a block in the world', () => {
  const items = slots({ 0: { id: 'iron_sword', count: 1, isBlock: false, enchantments: [{ id: 'sharpness', level: 1, name: 'Sharpness' }] }, 5: { id: 10, count: 16, isBlock: true } });
  assert.deepEqual(sanitizeContainer({ x: 3, y: 31, z: -3, items }), { x: 3, y: 31, z: -3, items });
  assert.equal(sanitizeContainer({ x: 3, y: 31, z: -3, items: items.slice(1) }), null, 'not 27');
  assert.equal(sanitizeContainer({ x: 3, y: 99, z: -3, items }), null, 'outside the world');
  assert.equal(sanitizeContainer({ x: 3.5, y: 31, z: -3, items }), null);
  for (const bad of [{ id: 'iron_sword', count: 0 }, { id: 'iron_sword', count: 65 }, { id: 'x y', count: 1 }, { id: -4, count: 1 }, 'sword']) {
    assert.equal(sanitizeContainer({ x: 0, y: 0, z: 0, items: slots({ 0: bad }) }), null, JSON.stringify(bad));
  }
});

test('game channel: the host sends to all or to one; a guest sends only to the host, who does not pass it on', async (t) => {
  const { host, guests: [a, b] } = await arena(t);
  const toA = nextEvent(a, 'game'), toB = nextEvent(b, 'game');
  assert.equal(host.sendGame({ type: 'state', phase: 'lobby' }), true);
  assert.deepEqual((await toA).data, { type: 'state', phase: 'lobby' });
  assert.deepEqual((await toB).data, { type: 'state', phase: 'lobby' });
  let bHeard = 0;
  b.on('game', () => bHeard++);
  const atHost = nextEvent(host, 'game');
  a.sendGame({ type: 'died', cause: 'void' });
  const heard = await atHost;
  assert.equal(heard.peerId, a.clientId, 'the host knows who sent it');
  assert.deepEqual(heard.data, { type: 'died', cause: 'void' });
  const onlyA = nextEvent(a, 'game');
  host.sendGame({ type: 'taken', id: '1-1' }, a.clientId);
  assert.deepEqual((await onlyA).data, { type: 'taken', id: '1-1' });
  await settle(10);
  assert.equal(bHeard, 0);
  assert.equal(host.sendGame({ no: 'type' }), false);
});

test('chests: a guest\'s change reaches the host and the other guests; the host\'s reaches everyone', async (t) => {
  const { host, guests: [a, b] } = await arena(t);
  const items = slots({ 2: { id: 'golden_apple', count: 2, isBlock: false } });
  const atHost = nextEvent(host, 'container'), atB = nextEvent(b, 'container');
  let aEcho = 0;
  a.on('container', () => aEcho++);
  assert.equal(a.sendContainer(3, 31, 3, items), true);
  assert.deepEqual((await atHost).items, items);
  assert.deepEqual((await atB).items, items);
  await settle(10);
  assert.equal(aEcho, 0, 'not sent back to the one who changed it');
  const atA = nextEvent(a, 'container');
  host.sendContainer(-3, 31, 3, slots());
  assert.deepEqual(await atA, { peerId: 'host', x: -3, y: 31, z: 3, items: slots() });
});

test('the host\'s game decides which hits land, and is told of each that does', async (t) => {
  const { host, guests: [a, b] } = await arena(t);
  for (const [id, x] of [['host', 0], [a.clientId, 1], [b.clientId, 2]]) host.positions.set(id, { x, y: 30, z: 0 });
  host.attackPolicy = (attacker, target) => (target === b.clientId ? 'spectator' : null);
  const landed = [];
  host.on('attack_landed', (e) => landed.push(e));
  assert.equal(host.attackPlayer(b.clientId, 5), 'spectator');
  assert.equal(host.attackPlayer(a.clientId, 5), null);
  assert.deepEqual(landed, [{ attackerId: 'host', targetId: a.clientId, damage: 5 }]);
});
