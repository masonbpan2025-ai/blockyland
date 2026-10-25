// Skins in a shared world: each player's chosen skin reaches the others, a newcomer sees everyone's at once, a change
// is seen at once, and another player's avatar wears that player's skin -- never this player's own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ShareSession } from '../src/multiplayer/shareSession.js';
import { sanitizeSkin, MAX_SKIN_CHARS } from '../src/multiplayer/shareProtocol.js';
const HOST_ID = 'host';
import { RemotePlayerManager } from '../src/multiplayer/remotePlayerManager.js';
import { skinManager } from '../src/skinManager.js';
import { createFakeNetwork, nextEvent, settle } from './helpers/shareFakes.js';

const png = (tag) => `data:image/png;base64,iVBORw0KGgo${tag}AAAA==`;
const RED = { png: png('RED'), model: 'default' };
const BLUE = { png: png('BLUE'), model: 'slim' };

async function room(t, guests = 2) {
  const network = createFakeNetwork();
  const make = () => new ShareSession({ signalingFactory: network.signalingFactory, peerFactory: network.peerFactory });
  const host = make();
  const { roomId } = await host.hostRoom('Hosty');
  const list = [];
  const join = async (name) => { const g = make(); await g.joinRoom(roomId, name); list.push(g); await settle(5); return g; };
  for (let i = 0; i < guests; i++) await join(`G${i}`);
  t.after(() => { for (const g of list) g.disconnect(true); host.disconnect(true); });
  return { host, guests: list, join };
}

test('a skin is a PNG data URL and an arm model -- nothing to fetch, no other kind of file, nothing huge', () => {
  assert.deepEqual(sanitizeSkin(BLUE), BLUE);
  assert.deepEqual(sanitizeSkin({ png: RED.png, model: 'giant' }), RED, 'an unknown model is the classic one');
  for (const bad of [null, 'x', { png: 'https://example.com/skin.png' }, { png: 'data:image/svg+xml;base64,PHN2Zz4=' },
    { png: 'data:image/jpeg;base64,AAAA' }, { png: 'data:image/png;base64,<script>' }, { png: 42 },
    { png: `data:image/png;base64,${'A'.repeat(MAX_SKIN_CHARS)}` }]) {
    assert.equal(sanitizeSkin(bad), null, JSON.stringify(bad)?.slice(0, 50));
  }
});

test('a guest changes skin: the host and the other guests see it, the guest is not sent its own back', async (t) => {
  const { host, guests: [a, b] } = await room(t);
  let echoed = 0;
  a.on('skin', () => echoed++);
  const atHost = nextEvent(host, 'skin'), atB = nextEvent(b, 'skin');
  assert.equal(a.sendSkin(BLUE), true);
  assert.deepEqual(await atHost, { peerId: a.clientId, ...BLUE });
  assert.deepEqual(await atB, { peerId: a.clientId, ...BLUE });
  await settle(10);
  assert.equal(echoed, 0);
});

test('the host\'s skin reaches every guest', async (t) => {
  const { host, guests: [a, b] } = await room(t);
  const atA = nextEvent(a, 'skin'), atB = nextEvent(b, 'skin');
  host.sendSkin(RED);
  assert.deepEqual(await atA, { peerId: HOST_ID, ...RED });
  assert.deepEqual(await atB, { peerId: HOST_ID, ...RED });
});

test('a newcomer receives the skins of everyone already there; one who left is forgotten', async (t) => {
  const { host, guests: [a, b], join } = await room(t);
  host.sendSkin(RED);
  a.sendSkin(BLUE);
  b.sendSkin(RED);
  await settle(10);
  b.disconnect();
  await settle(10);
  // Skins sent during the join arrive before the test can listen; the session keeps them.
  const c = await join('Late');
  assert.deepEqual(c.skins.get(HOST_ID), RED);
  assert.deepEqual(c.skins.get(a.clientId), BLUE);
  assert.equal(c.skins.has(b.clientId), false, 'gone with the guest');
});

test('a flood of skin changes is held back', async (t) => {
  const { host, guests: [a] } = await room(t, 1);
  let heard = 0;
  host.on('skin', () => heard++);
  for (let i = 0; i < 20; i++) a.sendSkin(i % 2 ? RED : BLUE);
  await settle(20);
  assert.ok(heard <= 3, `${heard} of 20 passed`);
  assert.ok(heard >= 1);
});

test('a skin chosen before sharing is kept and given to whoever joins', async (t) => {
  const network = createFakeNetwork();
  const make = () => new ShareSession({ signalingFactory: network.signalingFactory, peerFactory: network.peerFactory });
  const host = make();
  assert.equal(host.sendSkin(BLUE), false, 'not shared yet');
  const { roomId } = await host.hostRoom('Hosty');
  const guest = make();
  t.after(() => { guest.disconnect(true); host.disconnect(true); });
  await guest.joinRoom(roomId, 'G');
  await settle(10);
  assert.deepEqual(guest.skins.get(HOST_ID), BLUE);
});

test('another player\'s avatar wears that player\'s skin, arriving before or after it, and never this player\'s own', (t) => {
  // The nametag above an avatar is drawn on a canvas: a surface that accepts every call is enough here.
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'document', previous); else delete globalThis.document; });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) }) };
  const scene = { add() {}, remove() {} };
  const players = new RemotePlayerManager({ scene });
  players.setSkin('p1', BLUE);
  const early = players.addPeer('p1', 'Ann');
  assert.deepEqual(early.skin, BLUE, 'a skin that came first is worn from the start');
  const later = players.addPeer('p2', 'Bob');
  assert.equal(later.skin, null, 'Steve until a skin arrives');
  const calls = [];
  later.avatar.mesh.updateSkin = (url) => calls.push(url);
  players.setSkin('p2', RED);
  assert.deepEqual(calls, [RED.png]);
  assert.deepEqual(later.skin, RED);
  // This player changing skin changes nothing on the others.
  const before = calls.length;
  const other = skinManager.getAllSkins().find((s) => s.id !== skinManager.equippedSkinId);
  const was = skinManager.equippedSkinId;
  skinManager.equipSkin(other.id);
  skinManager.equipSkin(was);
  assert.equal(calls.length, before);
  assert.deepEqual(later.skin, RED);
});
