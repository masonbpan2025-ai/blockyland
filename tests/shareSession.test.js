// A shared world, end to end, in memory: the host is the server, guests connect only to it, and it checks everything.
//
// The introduction service and the direct connections are replaced by the in-memory fakes in helpers/shareFakes.js, so
// every case runs in milliseconds and can make the network misbehave. The same session code is run against real
// browsers in e2e/share.pw.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ShareSession } from '../src/multiplayer/shareSession.js';
import { ShareError } from '../src/multiplayer/signaling.js';
import { encodeFrames, PROTOCOL_VERSION, MAX_PLAYERS } from '../src/multiplayer/shareProtocol.js';
import { parseJoinCode } from '../src/multiplayer/shareCode.js';
import { createFakeNetwork, nextEvent, settle } from './helpers/shareFakes.js';

const LOCATION = { href: 'https://game.example/play?debug=1', protocol: 'https:', host: 'game.example', search: '?debug=1' };

function sessionOn(network, options = {}) {
  return new ShareSession({
    signalingFactory: network.signalingFactory,
    peerFactory: network.peerFactory,
    location: LOCATION,
    timeouts: { connectMs: 500, heartbeatMs: 40, silenceMs: 200, resignalMs: 30 },
    ...options,
  });
}

/** A host with the world to share, and a way to add guests. */
async function openWorld(options = {}) {
  const network = createFakeNetwork();
  const host = sessionOn(network, options);
  const hosted = await host.hostRoom('Hana', { seed: 7 });
  const sessions = [host];
  const guest = async (name = 'Guest', guestOptions = {}) => {
    const g = sessionOn(network, guestOptions);
    sessions.push(g);
    const joined = g.joinRoom(hosted.roomId, name);
    const requested = nextEvent(host, 'request_snapshot');
    const data = await joined;
    await requested;
    return { session: g, data };
  };
  const close = () => { for (const s of sessions) s.disconnect(true); };
  return { network, host, hosted, guest, close };
}

/** What a malicious guest does: send a message the session itself never would. */
function rawSend(session, message) {
  const text = typeof message === 'string' ? message : JSON.stringify(message);
  for (const frame of encodeFrames(text)) session.hostLink.send(frame);
}

// --- hosting --------------------------------------------------------------------------

test('hosting registers a room and returns a link that carries only the join code', async () => {
  const { host, hosted, network, close } = await openWorld();
  assert.equal(host.isHost, true);
  assert.equal(host.connected, true);
  assert.match(hosted.roomId, /^[0-9a-hjkmnp-tv-z]{8}$/);
  assert.equal(parseJoinCode(hosted.shareUrl), hosted.roomId, 'the link names the room');
  assert.equal(new URL(hosted.shareUrl).origin, 'https://game.example', 'on the host\'s own address');
  assert.ok(!hosted.shareUrl.includes('debug'), 'the host\'s own query parameters are not copied into the link');
  assert.ok(network.rooms.has(hosted.roomId), 'the room is registered with the introduction service');
  assert.deepEqual([...host.peers.values()].map((p) => p.name), ['Hana']);
  close();
});

test('a custom introduction service chosen with ?signal= travels with the link', async () => {
  const network = createFakeNetwork();
  const host = sessionOn(network, { location: { ...LOCATION, href: 'https://game.example/?signal=wss%3A%2F%2Fmeet.example%2Fws', search: '?signal=wss%3A%2F%2Fmeet.example%2Fws' } });
  const hosted = await host.hostRoom('Hana');
  assert.equal(new URL(hosted.shareUrl).searchParams.get('signal'), 'wss://meet.example/ws');
  host.disconnect(true);
});

test('hosting fails clearly when the introduction service cannot be reached', async () => {
  const network = createFakeNetwork();
  network.signalingReachable = false;
  const host = sessionOn(network);
  await assert.rejects(host.hostRoom('Hana'), (e) => e instanceof ShareError && e.code === 'signalling_unreachable');
  assert.equal(host.connected, false);
});

// --- joining --------------------------------------------------------------------------

test('a guest joins from the link\'s code, and both sides know each other', async () => {
  const { host, guest, close } = await openWorld();
  const joined = nextEvent(host, 'peer_joined');
  const { session, data } = await guest('Alex');
  const arrival = await joined;
  assert.equal(arrival.peerName, 'Alex');
  assert.equal(data.hostId, 'host');
  assert.equal(session.connected, true);
  const names = (s) => [...s.peers.values()].map((p) => p.name).sort();
  assert.deepEqual(names(host), ['Alex', 'Hana']);
  assert.deepEqual(names(session), ['Alex', 'Hana'], 'the guest is told who is already there');
  assert.equal(session.peers.get('host').isHost, true);
  close();
});

test('the host assigns identities, so a guest cannot claim to be someone else', async () => {
  const { host, guest, close } = await openWorld();
  const a = await guest('Alex');
  const b = await guest('Alex');
  assert.notEqual(a.data.clientId, b.data.clientId);
  assert.match(a.data.clientId, /^p\d+$/);
  assert.notEqual(a.data.clientId, 'host', 'nobody but the host is "host"');
  const names = [...host.peers.values()].map((p) => p.name);
  assert.equal(new Set(names).size, names.length, 'two guests named Alex are told apart');
  assert.ok(names.includes('Alex') && names.includes('Alex (2)'));
  close();
});

test('names are stripped of markup, control characters and excess length', async () => {
  const { host, guest, close } = await openWorld();
  const { data } = await guest('<img src=x onerror=alert(1)>\u0007 ' + 'z'.repeat(60));
  const name = host.peers.get(data.clientId).name;
  assert.ok(!/[<>&"']/.test(name), `markup removed from ${JSON.stringify(name)}`);
  assert.ok(!/[\u0000-\u001f]/.test(name));
  assert.ok(name.length <= 24);
  close();
});

test('a wrong code, a malformed code and a missing host each fail with their own reason', async () => {
  const { network, hosted, close } = await openWorld();
  const stranger = sessionOn(network);
  await assert.rejects(stranger.joinRoom('zzzzzzzz', 'X'), (e) => e.code === 'room_not_found');
  await assert.rejects(stranger.joinRoom('nope', 'X'), (e) => e.code === 'bad_code');
  await assert.rejects(stranger.joinRoom('', 'X'), (e) => e.code === 'bad_code');
  close();
  await assert.rejects(sessionOn(network).joinRoom(hosted.roomId, 'X'), (e) => e.code === 'room_not_found', 'the host has left');
});

test('a code typed with look-alike characters and spaces still works', async () => {
  const { network, hosted, close } = await openWorld();
  const typed = hosted.roomId.toUpperCase().replace(/1/g, 'l').replace(/0/g, 'O').replace(/^(....)/, '$1 - ');
  const g = sessionOn(network);
  const data = await g.joinRoom(typed, 'Typist');
  assert.equal(data.roomId, hosted.roomId);
  g.disconnect(true);
  close();
});

test('joining fails clearly when the introduction service cannot be reached', async () => {
  const { network, hosted, close } = await openWorld();
  network.signalingReachable = false;
  await assert.rejects(sessionOn(network).joinRoom(hosted.roomId, 'X'), (e) => e.code === 'signalling_unreachable');
  close();
});

test('a connection that cannot be made times out with advice about the network', async () => {
  const { network, hosted, close } = await openWorld();
  network.linksBlocked = true; // the browsers never manage to connect to each other
  const g = sessionOn(network, { timeouts: { connectMs: 60, heartbeatMs: 40, silenceMs: 200, resignalMs: 30 } });
  await assert.rejects(g.joinRoom(hosted.roomId, 'X'), (e) => e.code === 'connect_timeout' && /network/i.test(e.message));
  assert.equal(g.connected, false);
  close();
});

test('the world is full at eight players, and the ninth is turned away', async () => {
  const { host, guest, network, hosted, close } = await openWorld();
  for (let i = 1; i < MAX_PLAYERS; i++) await guest(`Guest${i}`);
  assert.equal(host.peers.size, MAX_PLAYERS);
  await assert.rejects(sessionOn(network).joinRoom(hosted.roomId, 'Late'), (e) => e.code === 'room_full');
  assert.equal(host.peers.size, MAX_PLAYERS, 'nobody was displaced');
  close();
});

test('a guest on a different version of the game is refused with an explanation', async () => {
  const { network, hosted, close } = await openWorld();
  const old = sessionOn(network);
  // Make this guest speak an older protocol.
  const original = old.onHostFrame.bind(old);
  const send = old.send.bind(old);
  old.send = (link, message) => send(link, message.t === 'hello' ? { ...message, protocol: PROTOCOL_VERSION - 1 } : message);
  old.onHostFrame = original;
  await assert.rejects(old.joinRoom(hosted.roomId, 'Old'), (e) => e.code === 'version_mismatch' && /version/i.test(e.message));
  close();
});

// --- the world ------------------------------------------------------------------------

test('the world is sent whole, compressed and in frames, and arrives identical', async () => {
  const { host, guest, close } = await openWorld();
  const world = { name: 'W', chunks: Array.from({ length: 400 }, (_, i) => ({ cx: i, cz: -i, voxels: Array.from({ length: 200 }, (_, j) => (i * j) % 17) })), spawn: { x: 1.5, y: 64, z: -3 } };
  const { session, data } = await guest('Alex');
  const received = nextEvent(session, 'world_snapshot');
  const ok = await host.sendWorldSnapshot(data.clientId, world);
  assert.equal(ok, true);
  const { snapshot, fromPeerId } = await received;
  // Compared as JSON would carry it: a -0 in the sample (cz: -0) is 0 on the other side, which is what a world file holds too.
  assert.deepEqual(snapshot, JSON.parse(JSON.stringify(world)));
  assert.equal(fromPeerId, 'host');
  close();
});

test('sending a world to a guest who has left reports failure instead of throwing', async () => {
  const { host, close } = await openWorld();
  assert.equal(await host.sendWorldSnapshot('p99', { any: 1 }), false);
  close();
});

// --- relaying -------------------------------------------------------------------------

test('a guest\'s movement reaches the host and the other guests, but not itself', async () => {
  const { host, guest, close } = await openWorld();
  const a = await guest('Ann');
  const b = await guest('Bob');
  const atHost = nextEvent(host, 'player_state');
  const atBob = nextEvent(b.session, 'player_state');
  let echoed = false;
  a.session.on('player_state', () => { echoed = true; });
  a.session.sendPlayerState({ x: 1.25, y: 64, z: -2, yaw: 1, pitch: 0.5, isSneaking: true, activeItem: 'diamond_sword' });
  const h = await atHost;
  const g = await atBob;
  assert.equal(h.peerId, a.data.clientId);
  assert.deepEqual(g.state, h.state);
  assert.equal(g.state.x, 1.25);
  assert.equal(g.state.activeItem, 'diamond_sword');
  await settle();
  assert.equal(echoed, false);
  close();
});

test('the host\'s own movement reaches every guest, marked as the host\'s', async () => {
  const { host, guest, close } = await openWorld();
  const a = await guest('Ann');
  const got = nextEvent(a.session, 'player_state');
  host.sendPlayerState({ x: 5, y: 70, z: 5, yaw: 0, pitch: 0 });
  const msg = await got;
  assert.equal(msg.peerId, 'host');
  close();
});

test('block edits are relayed to everyone else and applied by the host', async () => {
  const { host, guest, close } = await openWorld();
  const a = await guest('Ann');
  const b = await guest('Bob');
  const atHost = nextEvent(host, 'block_update');
  const atBob = nextEvent(b.session, 'block_update');
  a.session.sendBlockUpdate(10, 20, -30, 5);
  assert.deepEqual({ ...(await atHost) }, { peerId: a.data.clientId, x: 10, y: 20, z: -30, blockId: 5, playerName: 'Ann' });
  const forBob = await atBob;
  assert.equal(forBob.x, 10);
  assert.equal(forBob.blockId, 5);
  close();
});

test('the host\'s edits reach all guests', async () => {
  const { host, guest, close } = await openWorld();
  const a = await guest('Ann');
  const got = nextEvent(a.session, 'block_update');
  host.sendBlockUpdate(1, 2, 3, 0);
  const msg = await got;
  assert.deepEqual([msg.x, msg.y, msg.z, msg.blockId, msg.peerId], [1, 2, 3, 0, 'host']);
  close();
});

test('the host refuses edits no world could hold: bad coordinates, unknown blocks, wrong types', async () => {
  const { host, guest, close } = await openWorld({ isBlockId: (id) => Number.isInteger(id) && id >= 0 && id < 500 });
  const a = await guest('Ann');
  const seen = [];
  host.on('block_update', (b) => seen.push(b));
  for (const bad of [
    { x: 1, y: 999, z: 1, blockId: 1 },
    { x: 1, y: -1, z: 1, blockId: 1 },
    { x: 1e12, y: 5, z: 1, blockId: 1 },
    { x: 1.5, y: 5, z: 1, blockId: 1 },
    { x: '1', y: 5, z: 1, blockId: 1 },
    { x: 1, y: 5, z: 1, blockId: 99999 },
    { x: 1, y: 5, z: 1, blockId: -3 },
    { x: 1, y: 5, z: 1 },
  ]) rawSend(a.session, { t: 'block_update', ...bad });
  rawSend(a.session, { t: 'block_update', x: 1, y: 5, z: 1, blockId: 4 });
  await settle(20);
  assert.equal(seen.length, 1, 'only the legitimate edit got through');
  assert.equal(seen[0].blockId, 4);
  close();
});

test('movement from a guest is clamped and stripped to the fields the game uses', async () => {
  const { host, guest, close } = await openWorld();
  const a = await guest('Ann');
  const states = [];
  host.on('player_state', (s) => states.push(s.state));
  rawSend(a.session, { t: 'player_state', state: { x: 9e99, y: 5, z: NaN, yaw: 0 } });
  rawSend(a.session, { t: 'player_state', state: { x: 1, y: 2, z: 3, yaw: 'up', pitch: 99, activeItem: '<script>', isAdmin: true, health: 9999 } });
  await settle(20);
  assert.equal(states.length, 1, 'a state with a non-finite position is refused');
  assert.equal(states[0].pitch <= Math.PI / 2, true, 'pitch is clamped');
  assert.equal(states[0].activeItem, null, 'an item id may not contain markup');
  assert.ok(!('isAdmin' in states[0]) && !('health' in states[0]), 'extra fields are dropped');
  close();
});

test('chat shows the host\'s name for the guest, never a name the guest supplies', async () => {
  const { host, guest, close } = await openWorld();
  const a = await guest('Ann');
  const b = await guest('Bob');
  const atHost = nextEvent(host, 'chat');
  const atBob = nextEvent(b.session, 'chat');
  rawSend(a.session, { t: 'chat', sender: 'Hana', text: 'hello\u0007 there' });
  const h = await atHost;
  assert.equal(h.sender, 'Ann', 'the guest cannot pass as the host');
  assert.equal(h.text, 'hello there', 'control characters are removed');
  assert.equal((await atBob).sender, 'Ann');
  close();
});

test('chat is bounded in length and limited in rate', async () => {
  const { host, guest, close } = await openWorld();
  const a = await guest('Ann');
  const chats = [];
  host.on('chat', (c) => chats.push(c.text));
  a.session.sendChat('x'.repeat(5000));
  for (let i = 0; i < 40; i++) a.session.sendChat(`spam ${i}`);
  await settle(30);
  assert.ok(chats[0].length <= 256, 'long messages are cut');
  assert.ok(chats.length <= 7, `a flood is limited: ${chats.length} of 41 got through`);
  assert.ok(chats.length >= 1);
  close();
});

test('a guest cannot send the messages only a host sends, and a stream of nonsense gets it dropped', async () => {
  const { host, guest, close } = await openWorld();
  const a = await guest('Ann');
  const gone = nextEvent(host, 'peer_left');
  for (let i = 0; i < 30; i++) {
    rawSend(a.session, { t: 'snapshot', packed: { enc: 'json', data: '{}' } });
    rawSend(a.session, 'not json at all');
    rawSend(a.session, { t: 'welcome' });
  }
  const left = await gone;
  assert.equal(left.reason, 'misbehaving');
  assert.equal(host.peers.has(a.data.clientId), false);
  close();
});

test('a connection that never says hello is dropped, so a stranger cannot hold a place', async () => {
  const { network, hosted, host, close } = await openWorld({ timeouts: { connectMs: 60, heartbeatMs: 40, silenceMs: 200, resignalMs: 30 } });
  // A guest whose side opens a link but never sends hello.
  const mute = sessionOn(network);
  mute.send = async () => true; // swallow the hello
  const attempt = mute.joinRoom(hosted.roomId, 'Mute').catch((e) => e);
  await settle(120);
  assert.equal(host.links.size, 0, 'the half-open connection was dropped');
  assert.equal(host.peers.size, 1);
  await attempt;
  close();
});

// --- leaving and losing connections -----------------------------------------------------

test('when a guest leaves, the host and the other guests are told', async () => {
  const { host, guest, close } = await openWorld();
  const a = await guest('Ann');
  const b = await guest('Bob');
  const atHost = nextEvent(host, 'peer_left');
  const atBob = nextEvent(b.session, 'peer_left');
  a.session.disconnect();
  assert.equal((await atHost).peerName, 'Ann');
  assert.equal((await atBob).peerName, 'Ann');
  assert.equal(host.peers.has(a.data.clientId), false);
  assert.equal(b.session.peers.has(a.data.clientId), false);
  close();
});

test('when the host stops sharing, every guest is told', async () => {
  const { host, guest, close } = await openWorld();
  const a = await guest('Ann');
  const b = await guest('Bob');
  const toA = nextEvent(a.session, 'host_disconnected');
  const toB = nextEvent(b.session, 'host_disconnected');
  host.disconnect();
  assert.match((await toA).message, /closed/i);
  await toB;
  assert.equal(a.session.connected, false);
  close();
});

test('a guest that goes silent is dropped after the timeout', async () => {
  const { host, guest, close } = await openWorld();
  const a = await guest('Ann');
  const gone = nextEvent(host, 'peer_left');
  a.session.hostLink.silent = true; // its network dies: nothing arrives from it, not even pings
  assert.equal((await gone).reason, 'timeout');
  close();
});

test('a guest notices a host that goes silent', async () => {
  const { host, guest, close } = await openWorld();
  const a = await guest('Ann');
  const lost = nextEvent(a.session, 'host_disconnected');
  const hostLinks = [...host.guests.values()].map((e) => e.link);
  for (const link of hostLinks) link.silent = true;
  assert.match((await lost).message, /Lost the connection/);
  close();
});

test('leaving does not announce a host that was not lost', async () => {
  const { guest, close } = await openWorld();
  const a = await guest('Ann');
  let announced = false;
  a.session.on('host_disconnected', () => { announced = true; });
  a.session.disconnect();
  await settle(20);
  assert.equal(announced, false);
  close();
});

test('if the introduction service drops while hosting, guests stay connected and the room is registered again', async () => {
  const { network, host, hosted, guest, close } = await openWorld();
  const a = await guest('Ann');
  const lost = nextEvent(host, 'signalling_lost');
  const restored = nextEvent(host, 'signalling_restored');
  network.hostSignaling(hosted.roomId).drop();
  await lost;
  assert.equal(a.session.connected, true, 'an existing guest is unaffected: it talks to the host directly');
  await restored;
  assert.ok(network.rooms.has(hosted.roomId), 'the same room code is live again');
  const late = sessionOn(network);
  const joined = await late.joinRoom(hosted.roomId, 'Late');
  assert.equal(joined.roomId, hosted.roomId, 'and a new friend can still join with the same link');
  late.disconnect(true);
  close();
});

test('hosting again replaces the earlier room', async () => {
  const { network, host, hosted, close } = await openWorld();
  const again = await host.hostRoom('Hana');
  assert.notEqual(again.roomId, hosted.roomId);
  assert.ok(!network.rooms.has(hosted.roomId), 'the old room is gone');
  assert.ok(network.rooms.has(again.roomId));
  close();
});
