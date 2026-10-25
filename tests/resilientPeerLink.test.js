import test from 'node:test';
import assert from 'node:assert/strict';
import { ResilientPeerLink } from '../src/multiplayer/resilientPeerLink.js';
import { ShareSession } from '../src/multiplayer/shareSession.js';
import { createFakeNetwork, nextEvent, settle } from './helpers/shareFakes.js';

function localChannels() {
  const channels = new Set();
  const create = (name) => {
    const channel = {
      name, closed: false, onmessage: null,
      postMessage(data) {
        for (const other of channels) if (other !== channel && other.name === name) {
          queueMicrotask(() => { if (!other.closed) other.onmessage?.({ data: structuredClone(data) }); });
        }
      },
      close() { channel.closed = true; channels.delete(channel); },
    };
    channels.add(channel);
    return channel;
  };
  return { create, channels };
}

function pair(t, { blocked = false, createChannel, createDirect } = {}) {
  const network = createFakeNetwork();
  network.linksBlocked = blocked;
  const local = localChannels();
  let host, guest;
  const factory = (initiator, recipient) => new ResilientPeerLink({
    initiator, fallbackMs: 5,
    createChannel: createChannel === undefined ? local.create : createChannel,
    createDirect: createDirect ?? network.peerFactory,
    onSignal: (data) => queueMicrotask(() => { void recipient().handleSignal(data); }),
  });
  host = factory(false, () => guest);
  guest = factory(true, () => host);
  t.after(() => { host.close(); guest.close(); });
  const received = [];
  let opens = 0;
  guest.onopen = () => { opens++; guest.send('hello'); };
  host.onmessage = (text) => { received.push(['host', text]); host.send('welcome'); };
  guest.onmessage = (text) => received.push(['guest', text]);
  return { host, guest, received, local, network, opens: () => opens };
}

test('a normal direct connection wins without opening a local channel', async (t) => {
  const p = pair(t);
  await p.guest.start();
  await settle(20);
  assert.equal(p.guest.mode, 'webrtc');
  assert.equal(p.host.mode, 'webrtc');
  assert.deepEqual(p.received, [['host', 'hello'], ['guest', 'welcome']]);
  assert.equal(p.local.channels.size, 0);
});

test('two local tabs exchange data when WebRTC never opens, and closing is reported', async (t) => {
  const p = pair(t, { blocked: true });
  await p.guest.start();
  await settle(25);
  assert.equal(p.guest.mode, 'local');
  assert.equal(p.host.mode, 'local');
  assert.equal(p.opens(), 1);
  assert.deepEqual(p.received, [['host', 'hello'], ['guest', 'welcome']]);
  assert.equal(p.guest.getDiagnostics().transport, 'local');
  assert.equal(p.guest.send({ bad: 'object' }), false);
  let closed;
  p.host.onclose = (reason) => { closed = reason; };
  await p.guest.drain();
  const draining = p.guest.drain();
  p.guest.close('left');
  await draining;
  await settle();
  assert.equal(closed, 'peer_closed');
  assert.equal(p.host.isOpen, false);
  assert.equal(p.local.channels.size, 0);
});

test('an explicit ICE failure also starts the local fallback', async (t) => {
  const p = pair(t, { blocked: true });
  await p.guest.start();
  await settle(1);
  p.guest.direct.close('ice_failed');
  await settle(20);
  assert.equal(p.guest.mode, 'local');
  assert.equal(p.host.mode, 'local');
  assert.equal(p.opens(), 1);
});

test('local tabs can connect even when the browser refuses to construct WebRTC', async (t) => {
  const p = pair(t, { createDirect: () => { throw new Error('Browser policy'); } });
  await p.guest.start();
  await settle(15);
  assert.equal(p.guest.mode, 'local');
  assert.deepEqual(p.received, [['host', 'hello'], ['guest', 'welcome']]);
});

test('local negotiation can finish while the original offer is still pending', async (t) => {
  let failOffer;
  const p = pair(t, { createDirect: (o) => ({
    onclose: null,
    async start() { await new Promise((_, reject) => { failOffer = reject; }); },
    async handleSignal() {},
    close() { this.onclose?.('closed'); },
  }) });
  const starting = p.guest.start();
  await settle(20);
  assert.equal(p.guest.mode, 'local');
  failOffer(new Error('The peer connection was closed during setLocalDescription'));
  await starting;
  assert.equal(p.guest.isOpen, true);
  assert.equal(p.opens(), 1);
});

test('missing or blocked BroadcastChannel does not prevent a working direct connection', async (t) => {
  for (const createChannel of [null, () => { throw new Error('Storage denied'); }]) {
    const p = pair(t, { createChannel });
    await p.guest.start();
    await settle(15);
    assert.equal(p.guest.mode, 'webrtc');
    assert.equal(p.guest.isOpen, true);
  }
});

test('local offers require a random per-link channel name and cannot replace a chosen transport', async (t) => {
  const p = pair(t);
  for (const name of ['', 'shared-world', 'mc-local-123', '__proto__']) await p.host.handleSignal({ kind: 'local_offer', name });
  assert.equal(p.local.channels.size, 0);
  await p.guest.start();
  await settle(20);
  await p.host.handleSignal({ kind: 'local_offer', name: `mc-local-${'a'.repeat(32)}` });
  assert.equal(p.host.mode, 'webrtc');
  assert.equal(p.local.channels.size, 0);
});

test('racing a direct open against the local handshake never opens the guest twice', async (t) => {
  const p = pair(t, { blocked: true });
  await p.guest.start();
  await settle(1);
  p.guest.startLocal();
  p.guest.direct.isOpenFlag = true;
  p.host.direct.isOpenFlag = true;
  p.guest.direct.onopen();
  await settle(20);
  assert.equal(p.guest.mode, 'webrtc');
  assert.equal(p.host.mode, 'webrtc');
  assert.equal(p.opens(), 1);
  assert.deepEqual(p.received, [['host', 'hello'], ['guest', 'welcome']]);
});

test('a full sharing session transfers a large world and edits over the fallback without the signaling service', async (t) => {
  const network = createFakeNetwork();
  network.linksBlocked = true;
  const local = localChannels();
  const options = {
    signalingFactory: network.signalingFactory,
    peerFactory: (o) => new ResilientPeerLink({ ...o, createDirect: network.peerFactory, createChannel: local.create, fallbackMs: 5 }),
    timeouts: { connectMs: 500, heartbeatMs: 100, silenceMs: 1000 },
  };
  const host = new ShareSession(options), guest = new ShareSession(options);
  t.after(() => { host.disconnect(true); guest.disconnect(true); });
  const { roomId } = await host.hostRoom('Host');
  const world = { chunks: Array.from({ length: 10000 }, (_, i) => ({ index: i, value: i * 131 })) };
  host.on('request_snapshot', ({ targetPeerId }) => { void host.sendWorldSnapshot(targetPeerId, world); });
  const snapshot = nextEvent(guest, 'world_snapshot');
  await guest.joinRoom(roomId, 'Guest');
  assert.equal(guest.signaling, null);
  assert.equal(guest.hostLink.mode, 'local');
  assert.deepEqual((await snapshot).snapshot, world);
  const edit = nextEvent(host, 'block_update');
  guest.sendBlockUpdate(2, 10, 4, 3);
  assert.equal((await edit).blockId, 3);
  const chat = nextEvent(guest, 'chat');
  host.sendChat('Hello local guest');
  assert.equal((await chat).text, 'Hello local guest');
});

test('a host relays between a local guest and a WebRTC guest with separate per-guest channels', async (t) => {
  const network = createFakeNetwork();
  const local = localChannels();
  const make = (withoutRTC = false) => new ShareSession({
    signalingFactory: network.signalingFactory,
    peerFactory: (o) => new ResilientPeerLink({
      ...o, fallbackMs: 5, createChannel: local.create,
      createDirect: withoutRTC ? () => { throw new Error('Blocked'); } : network.peerFactory,
    }),
    timeouts: { connectMs: 500, heartbeatMs: 100, silenceMs: 1000 },
  });
  const host = make(), nearby = make(true), remote = make();
  t.after(() => { host.disconnect(true); nearby.disconnect(true); remote.disconnect(true); });
  const { roomId } = await host.hostRoom('Host');
  await nearby.joinRoom(roomId, 'Local');
  await remote.joinRoom(roomId, 'Remote');
  assert.equal(nearby.hostLink.mode, 'local');
  assert.equal(remote.hostLink.mode, 'webrtc');
  assert.equal(host.peers.size, 3);
  const edit = nextEvent(remote, 'block_update');
  nearby.sendBlockUpdate(3, 10, 3, 4);
  assert.equal((await edit).peerId, nearby.clientId);
  const chat = nextEvent(nearby, 'chat');
  remote.sendChat('Both transports work');
  assert.equal((await chat).sender, 'Remote');
  const departed = nextEvent(remote, 'peer_left');
  nearby.disconnect(true);
  assert.equal((await departed).peerId, nearby.clientId);
  assert.equal(remote.connected, true);
  assert.equal(local.channels.size, 0);
});
