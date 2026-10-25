// The relay: when two browsers cannot connect directly -- a network that blocks peer-to-peer traffic, a browser that
// hides its local addresses -- the game's frames go through the introduction service instead, so joining still works.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { ResilientPeerLink } from '../src/multiplayer/resilientPeerLink.js';
import { ShareSession } from '../src/multiplayer/shareSession.js';
import { SignalingClient } from '../src/multiplayer/signaling.js';
import { createShareRendezvous, createRelayAllowance, SHARE_PATH } from '../server/shareRendezvous.js';
import { createFakeNetwork, nextEvent, settle } from './helpers/shareFakes.js';

/** A host link and a guest link whose direct connection never opens, joined by an in-memory relay. */
function relayPair(t, { relayMs = 10, blocked = true } = {}) {
  const network = createFakeNetwork();
  network.linksBlocked = blocked;
  let host, guest;
  const relayed = { toHost: 0, toGuest: 0 };
  const make = (initiator, other) => new ResilientPeerLink({
    initiator, relayMs, createChannel: null, createDirect: network.peerFactory,
    onSignal: (data) => queueMicrotask(() => { void other().handleSignal(data); }),
    relay: {
      send: (text) => { relayed[initiator ? 'toHost' : 'toGuest']++; queueMicrotask(() => other().receiveRelay(text)); return true; },
      bufferedAmount: () => 0,
    },
  });
  host = make(false, () => guest);
  guest = make(true, () => host);
  t.after(() => { host.close(); guest.close(); });
  const received = [];
  guest.onopen = () => guest.send('hello');
  host.onmessage = (text) => { received.push(['host', text]); host.send('welcome'); };
  guest.onmessage = (text) => received.push(['guest', text]);
  return { host, guest, received, relayed, network };
}

test('a guest whose direct connection never opens is carried by the relay', async (t) => {
  const p = relayPair(t);
  await p.guest.start();
  await settle(40);
  assert.equal(p.guest.mode, 'relay');
  assert.equal(p.host.mode, 'relay');
  assert.deepEqual(p.received, [['host', 'hello'], ['guest', 'welcome']]);
  assert.equal(p.relayed.toHost, 1);
  assert.equal(p.relayed.toGuest, 1);
  assert.equal(p.guest.getDiagnostics().transport, 'relay');
  assert.equal(p.guest.getDiagnostics().relayState, 'ready');
});

test('a failed direct connection asks for the relay at once, without waiting', async (t) => {
  const p = relayPair(t, { relayMs: 60_000 });
  await p.guest.start();
  await settle(1);
  p.guest.direct.close('ice_failed');
  await settle(20);
  assert.equal(p.guest.mode, 'relay');
  assert.deepEqual(p.received, [['host', 'hello'], ['guest', 'welcome']]);
});

test('a direct connection that opens is used, and the relay is never asked for', async (t) => {
  const p = relayPair(t, { blocked: false, relayMs: 30 });
  await p.guest.start();
  await settle(60);
  assert.equal(p.guest.mode, 'webrtc');
  assert.equal(p.host.mode, 'webrtc');
  assert.equal(p.guest.relayRequested, false);
  assert.equal(p.relayed.toHost + p.relayed.toGuest, 0);
});

test('relayed frames are ignored until the two sides agreed to use the relay', async (t) => {
  const p = relayPair(t, { relayMs: 60_000 });
  const got = [];
  p.host.onmessage = (text) => got.push(text);
  p.host.receiveRelay('sneaked in');
  // An answer nobody asked for does not switch a guest over either.
  await p.guest.handleSignal({ kind: 'relay_ok' });
  await settle(5);
  assert.deepEqual(got, []);
  assert.equal(p.host.mode, null);
  assert.equal(p.guest.mode, null);
});

test('closing a relayed link tells the other side, which closes too', async (t) => {
  const p = relayPair(t);
  await p.guest.start();
  await settle(40);
  let reason = null;
  p.host.onclose = (r) => { reason = r; };
  p.guest.close('left');
  await settle(5);
  assert.equal(reason, 'peer_closed');
  assert.equal(p.host.isOpen, false);
  assert.equal(p.guest.send('after'), false);
});

test('a link without a relay or a local channel still closes when the direct connection fails', async (t) => {
  const network = createFakeNetwork();
  network.linksBlocked = true;
  const link = new ResilientPeerLink({ initiator: true, createChannel: null, createDirect: network.peerFactory, onSignal: () => {} });
  t.after(() => link.close());
  let reason = null;
  link.onclose = (r) => { reason = r; };
  await link.start();
  link.direct.close('ice_failed');
  assert.equal(reason, 'ice_failed');
});

// --- the whole session over the relay ---------------------------------------------------------------------------

function relaySessions(t) {
  const network = createFakeNetwork();
  network.linksBlocked = true; // no direct connection between these two, ever
  const peerFactory = (o) => new ResilientPeerLink({ ...o, relayMs: 10, createChannel: null, createDirect: network.peerFactory });
  const make = () => new ShareSession({ signalingFactory: network.signalingFactory, peerFactory, timeouts: { connectMs: 2000 } });
  const host = make(), guest = make();
  t.after(() => { guest.disconnect(true); host.disconnect(true); });
  return { network, host, guest };
}

test('a guest joins, gets the world and plays through the relay when a direct connection is impossible', async (t) => {
  const { network, host, guest } = relaySessions(t);
  const { roomId } = await host.hostRoom('Hosty', { name: 'Relay World' });
  const wantsSnapshot = nextEvent(host, 'request_snapshot');
  const joined = await guest.joinRoom(roomId, 'Guesty');
  assert.equal(joined.hostId, 'host');
  assert.equal(guest.hostLink.mode, 'relay');
  // The relayed guest keeps its introduction connection: it is the link now.
  assert.ok(guest.signaling, 'the guest keeps the service connection');

  const { targetPeerId } = await wantsSnapshot;
  const gotWorld = nextEvent(guest, 'world_snapshot');
  const blocks = 'x'.repeat(60_000); // several frames
  await host.sendWorldSnapshot(targetPeerId, { blocks });
  const snapshot = await gotWorld;
  assert.equal(snapshot.snapshot?.blocks ?? snapshot.blocks, blocks);

  const moved = nextEvent(host, 'player_state');
  guest.sendPlayerState({ x: 1, y: 70, z: 2, yaw: 0, pitch: 0 });
  assert.equal((await moved).state.x, 1);

  const chat = nextEvent(guest, 'chat');
  host.sendChat?.('hi over the relay');
  if (host.sendChat) assert.equal((await chat).text, 'hi over the relay');
  assert.ok(network.log.relayed > 3);
});

test('a relayed guest learns at once when the host stops sharing', async (t) => {
  const { host, guest } = relaySessions(t);
  const { roomId } = await host.hostRoom('Hosty');
  await guest.joinRoom(roomId, 'Guesty');
  const gone = nextEvent(guest, 'host_disconnected');
  host.disconnect(true);
  await gone;
  assert.equal(guest.connected, false);
});

test('the host drops a relayed guest whose service connection went', async (t) => {
  const { host, guest } = relaySessions(t);
  const { roomId } = await host.hostRoom('Hosty');
  const arrived = nextEvent(host, 'peer_joined');
  await guest.joinRoom(roomId, 'Guesty');
  await arrived;
  const left = nextEvent(host, 'peer_left');
  guest.signaling.drop();
  const { reason } = await left;
  assert.ok(reason);
  assert.equal(host.guests.size, 0);
});

// --- the real service ---------------------------------------------------------------------------------------

async function service(options) {
  const rendezvous = createShareRendezvous(options);
  const server = http.createServer();
  server.on('upgrade', (req, socket, head) => { if (!rendezvous.handleUpgrade(req, socket, head)) socket.destroy(); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${server.address().port}${SHARE_PATH}`;
  const clients = [];
  const client = () => { const c = new SignalingClient({ url, WebSocketImpl: WebSocket }); clients.push(c); return c; };
  return {
    client,
    stop: async () => { for (const c of clients) c.close(); await rendezvous.close(); await new Promise((r) => server.close(r)); },
  };
}

test('the service relays game frames between the host and one guest, and to nobody else', async () => {
  const s = await service();
  const host = s.client(); await host.connect(); await host.host('5150');
  const guest = s.client(); await guest.connect(); const { guestId } = await guest.join('5150');
  const other = s.client(); await other.connect(); await other.join('5150');
  const overheard = [];
  other.on('relay', (m) => overheard.push(m));

  const atHost = new Promise((resolve) => host.on('relay', resolve));
  assert.equal(guest.relay('{"t":"hello"}'), true);
  assert.deepEqual(await atHost, { from: guestId, data: '{"t":"hello"}' });

  const atGuest = new Promise((resolve) => guest.on('relay', resolve));
  host.relay('{"t":"welcome"}', guestId);
  assert.deepEqual(await atGuest, { from: 'host', data: '{"t":"welcome"}' });
  await settle(30);
  assert.deepEqual(overheard, []);
  await s.stop();
});

test('relayed frames do not use up the introductions allowance: a world\'s worth passes', async () => {
  const s = await service();
  const host = s.client(); await host.connect(); await host.host('5151');
  const guest = s.client(); await guest.connect(); const { guestId } = await guest.join('5151');
  let got = 0;
  const all = new Promise((resolve) => guest.on('relay', () => { if (++got === 600) resolve(); }));
  const frame = 'f'.repeat(15000);
  for (let i = 0; i < 600; i++) host.relay(frame, guestId);
  await all;
  assert.equal(got, 600);
  // The introductions still work afterwards.
  const atHost = new Promise((resolve) => host.on('signal', resolve));
  guest.signal({ kind: 'candidate' });
  assert.deepEqual((await atHost).data, { kind: 'candidate' });
  await s.stop();
});

test('a relay flood beyond its allowance gets the connection closed', async () => {
  const s = await service({ relayLimits: { burst: 50, perSecond: 1, burstBytes: 1e9, bytesPerSecond: 1 } });
  const host = s.client(); await host.connect(); await host.host('5152');
  const closed = new Promise((resolve) => host.on('close', resolve));
  for (let i = 0; i < 80; i++) host.relay('x', 'nobody');
  await closed;
  await s.stop();
});

test('nothing is relayed for a connection that has not hosted or joined a room', async () => {
  const s = await service();
  const lone = s.client(); await lone.connect();
  const refused = new Promise((resolve) => lone.on('error', resolve));
  lone.relay('{"t":"hello"}');
  assert.equal((await refused).code, 'unknown_type');
  await s.stop();
});

test('the relay allowance counts messages and bytes, and refills with time', () => {
  let now = 0;
  const allowance = createRelayAllowance({ burst: 2, perSecond: 1, burstBytes: 100, bytesPerSecond: 50 }, () => now);
  assert.equal(allowance.take(40), true);
  assert.equal(allowance.take(40), true);
  assert.equal(allowance.take(1), false, 'out of messages');
  now = 1000;
  assert.equal(allowance.take(80), false, 'one message back, but not enough bytes');
  assert.equal(allowance.take(50), true);
});
