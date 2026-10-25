// The introduction service, over real WebSockets: it introduces a guest to a host and then carries only the few
// messages two browsers need to connect. It sees no gameplay and keeps no list of rooms.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { createShareRendezvous, SHARE_PATH } from '../server/shareRendezvous.js';
import { SignalingClient, ShareError, resolveSignalingUrl } from '../src/multiplayer/signaling.js';

async function start(options) {
  const rendezvous = createShareRendezvous(options);
  const server = http.createServer();
  server.on('upgrade', (req, socket, head) => { if (!rendezvous.handleUpgrade(req, socket, head)) socket.destroy(); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const url = `ws://127.0.0.1:${port}${SHARE_PATH}`;
  const clients = [];
  const connect = () => new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages = [];
    const waiters = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      const waiter = waiters.shift();
      if (waiter) waiter(msg); else messages.push(msg);
    });
    ws.on('open', () => resolve({
      ws,
      send: (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m)),
      next: (timeoutMs = 1000) => new Promise((res, rej) => {
        if (messages.length) return res(messages.shift());
        const timer = setTimeout(() => rej(new Error('no message')), timeoutMs);
        waiters.push((m) => { clearTimeout(timer); res(m); });
      }),
      closed: new Promise((res) => ws.on('close', (code) => res(code))),
    }));
    ws.on('error', reject);
    clients.push(ws);
  });
  const stop = async () => { for (const ws of clients) ws.terminate(); await rendezvous.close(); await new Promise((r) => server.close(r)); };
  return { rendezvous, server, url, connect, stop, port };
}

const ROOM = '4207';

test('a host registers a room and a guest can then join it', async () => {
  const s = await start();
  const host = await s.connect();
  host.send({ type: 'host', room: ROOM });
  assert.deepEqual(await host.next(), { type: 'hosted', room: ROOM });
  const guest = await s.connect();
  guest.send({ type: 'join', room: ROOM });
  const joined = await guest.next();
  assert.equal(joined.type, 'joined');
  assert.equal(joined.room, ROOM);
  assert.ok(joined.guestId);
  assert.deepEqual(s.rendezvous.stats(), { rooms: 1, guests: 1 });
  await s.stop();
});

test('a room code is accepted however it was typed', async () => {
  const s = await start();
  const host = await s.connect();
  host.send({ type: 'host', room: '42-07' });
  assert.equal((await host.next()).room, ROOM);
  const guest = await s.connect();
  guest.send({ type: 'join', room: ' 4 2 0 7 ' });
  assert.equal((await guest.next()).type, 'joined');
  await s.stop();
});

test('connection messages pass between the host and a guest, and nobody else sees them', async () => {
  const s = await start();
  const host = await s.connect();
  host.send({ type: 'host', room: ROOM });
  await host.next();
  const a = await s.connect();
  const b = await s.connect();
  a.send({ type: 'join', room: ROOM });
  b.send({ type: 'join', room: ROOM });
  const idA = (await a.next()).guestId;
  const idB = (await b.next()).guestId;

  a.send({ type: 'signal', data: { kind: 'offer', sdp: 'from-a' } });
  assert.deepEqual(await host.next(), { type: 'signal', from: idA, data: { kind: 'offer', sdp: 'from-a' } });

  host.send({ type: 'signal', to: idB, data: { kind: 'answer', sdp: 'for-b' } });
  assert.deepEqual(await b.next(), { type: 'signal', from: 'host', data: { kind: 'answer', sdp: 'for-b' } });
  await assert.rejects(a.next(150), /no message/, 'the other guest heard nothing');
  await s.stop();
});

test('a guest cannot address another guest: its messages go to the host only', async () => {
  const s = await start();
  const host = await s.connect();
  host.send({ type: 'host', room: ROOM });
  await host.next();
  const a = await s.connect();
  const b = await s.connect();
  a.send({ type: 'join', room: ROOM }); const idA = (await a.next()).guestId;
  b.send({ type: 'join', room: ROOM }); const idB = (await b.next()).guestId;
  a.send({ type: 'signal', to: idB, data: { kind: 'candidate' } });
  assert.equal((await host.next()).from, idA, 'it reached the host, with the sender named');
  await assert.rejects(b.next(150), /no message/);
  await s.stop();
});

test('an unknown room and a malformed code give the same answer, so a probe learns nothing', async () => {
  const s = await start();
  const a = await s.connect();
  a.send({ type: 'join', room: '9999' });
  const unknown = await a.next();
  const b = await s.connect();
  b.send({ type: 'join', room: 'x' });
  const malformed = await b.next();
  assert.equal(unknown.code, 'room_not_found');
  assert.deepEqual(malformed, unknown);
  await s.stop();
});

test('a room can be hosted once at a time, and a connection has one role', async () => {
  const s = await start();
  const host = await s.connect();
  host.send({ type: 'host', room: ROOM });
  await host.next();
  const other = await s.connect();
  other.send({ type: 'host', room: ROOM });
  assert.equal((await other.next()).code, 'room_taken');
  host.send({ type: 'host', room: '6789' });
  assert.equal((await host.next()).code, 'already_in_room');
  host.send({ type: 'join', room: ROOM });
  assert.equal((await host.next()).code, 'already_in_room');
  host.send({ type: 'host', room: 'bad' });
  await s.stop();
});

test('signals need a room and a payload', async () => {
  const s = await start();
  const stray = await s.connect();
  stray.send({ type: 'signal', data: { a: 1 } });
  assert.equal((await stray.next()).code, 'not_in_room');
  const host = await s.connect();
  host.send({ type: 'host', room: ROOM });
  await host.next();
  host.send({ type: 'signal', to: 'x' });
  assert.equal((await host.next()).code, 'bad_message');
  await s.stop();
});

test('garbage is answered, not crashed on', async () => {
  const s = await start();
  const c = await s.connect();
  c.send('{not json');
  assert.equal((await c.next()).code, 'bad_json');
  c.send('42');
  assert.equal((await c.next()).code, 'bad_message');
  c.send({ type: 'launch_missiles' });
  assert.equal((await c.next()).code, 'unknown_type');
  c.send({ type: 'host', room: ROOM });
  assert.equal((await c.next()).type, 'hosted', 'and it still works afterwards');
  await s.stop();
});

test('an oversized message is refused by closing the connection', async () => {
  const s = await start({ maxPayload: 1024 });
  const c = await s.connect();
  c.send(JSON.stringify({ type: 'signal', data: { pad: 'x'.repeat(5000) } }));
  assert.equal(await c.closed, 1009, 'message too big');
  await s.stop();
});

test('a flood of messages gets the connection closed', async () => {
  const s = await start();
  const c = await s.connect();
  for (let i = 0; i < 400; i++) c.send({ type: 'nonsense' });
  assert.equal(await c.closed, 1008);
  await s.stop();
});

test('when the host leaves, its guests are told and the room is gone', async () => {
  const s = await start();
  const host = await s.connect();
  host.send({ type: 'host', room: ROOM });
  await host.next();
  const guest = await s.connect();
  guest.send({ type: 'join', room: ROOM });
  await guest.next();
  host.ws.close();
  assert.deepEqual(await guest.next(), { type: 'host_left' });
  await guest.closed;
  assert.equal(s.rendezvous.stats().rooms, 0);
  const late = await s.connect();
  late.send({ type: 'join', room: ROOM });
  assert.equal((await late.next()).code, 'room_not_found');
  await s.stop();
});

test('when a guest leaves, the host is told which one', async () => {
  const s = await start();
  const host = await s.connect();
  host.send({ type: 'host', room: ROOM });
  await host.next();
  const guest = await s.connect();
  guest.send({ type: 'join', room: ROOM });
  const { guestId } = await guest.next();
  guest.ws.close();
  assert.deepEqual(await host.next(), { type: 'guest_left', guestId });
  assert.equal(s.rendezvous.stats().guests, 0);
  await s.stop();
});

test('the room fills: only so many may be joining at once', async () => {
  const s = await start({ maxGuestsPerRoom: 2 });
  const host = await s.connect();
  host.send({ type: 'host', room: ROOM });
  await host.next();
  for (let i = 0; i < 2; i++) { const g = await s.connect(); g.send({ type: 'join', room: ROOM }); assert.equal((await g.next()).type, 'joined'); }
  const extra = await s.connect();
  extra.send({ type: 'join', room: ROOM });
  assert.equal((await extra.next()).code, 'room_busy');
  await s.stop();
});

test('the service has a limit on rooms', async () => {
  const s = await start({ maxRooms: 1 });
  const a = await s.connect(); a.send({ type: 'host', room: ROOM }); await a.next();
  const b = await s.connect(); b.send({ type: 'host', room: '6789' });
  assert.equal((await b.next()).code, 'server_full');
  await s.stop();
});

test('there is no way to list rooms: the service exposes counts only', async () => {
  const s = await start();
  const host = await s.connect();
  host.send({ type: 'host', room: ROOM });
  await host.next();
  const stats = s.rendezvous.stats();
  assert.deepEqual(Object.keys(stats).sort(), ['guests', 'rooms']);
  assert.ok(!JSON.stringify(stats).includes(ROOM));
  await s.stop();
});

test('only its own path is upgraded', async () => {
  const s = await start();
  const status = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${s.port}/somewhere-else`);
    ws.on('error', () => resolve('refused'));
    ws.on('open', () => resolve('open'));
  });
  assert.equal(status, 'refused');
  await s.stop();
});

// --- the client of the service ---------------------------------------------------------------------

test('the client hosts, joins and exchanges signals through a real service', async () => {
  const s = await start();
  const hostClient = new SignalingClient({ url: s.url, WebSocketImpl: WebSocket });
  await hostClient.connect();
  await hostClient.host(ROOM);
  const guestClient = new SignalingClient({ url: s.url, WebSocketImpl: WebSocket });
  await guestClient.connect();
  const { guestId } = await guestClient.join(ROOM.toUpperCase());
  const atHost = new Promise((resolve) => hostClient.on('signal', resolve));
  guestClient.signal({ kind: 'offer', sdp: 'x' });
  assert.deepEqual(await atHost, { from: guestId, data: { kind: 'offer', sdp: 'x' } });
  const atGuest = new Promise((resolve) => guestClient.on('signal', resolve));
  hostClient.signal({ kind: 'answer', sdp: 'y' }, guestId);
  assert.deepEqual(await atGuest, { from: 'host', data: { kind: 'answer', sdp: 'y' } });
  const left = new Promise((resolve) => hostClient.on('guest_left', resolve));
  guestClient.close();
  assert.deepEqual(await left, { guestId });
  hostClient.close();
  await s.stop();
});

test('the client turns the service\'s refusals into errors a person can read', async () => {
  const s = await start();
  const c = new SignalingClient({ url: s.url, WebSocketImpl: WebSocket });
  await c.connect();
  await assert.rejects(c.join('9999'), (e) => e instanceof ShareError && e.code === 'room_not_found' && /not being shared/.test(e.message));
  c.close();
  await s.stop();
});

test('the client reports a service that is not there', async () => {
  const c = new SignalingClient({ url: 'ws://127.0.0.1:1/ws/share', WebSocketImpl: WebSocket, timeoutMs: 1500 });
  await assert.rejects(c.connect(), (e) => e.code === 'signalling_unreachable');
});

test('the client reports a service that drops while it waits', async () => {
  const s = await start();
  const c = new SignalingClient({ url: s.url, WebSocketImpl: WebSocket });
  await c.connect();
  const pending = c.join(ROOM).catch((e) => e);
  await s.stop();
  const error = await pending;
  assert.ok(error instanceof ShareError, 'rejected rather than left waiting forever');
});

test('the service address is the game\'s own site unless the link names another', () => {
  assert.equal(resolveSignalingUrl({ protocol: 'https:', host: 'play.example', search: '' }), 'wss://play.example/ws/share');
  assert.equal(resolveSignalingUrl({ protocol: 'http:', host: '192.168.1.5:3000', search: '?join=x' }), 'ws://192.168.1.5:3000/ws/share');
  assert.equal(resolveSignalingUrl({ protocol: 'https:', host: 'a', search: '?signal=wss%3A%2F%2Fmeet.example%2Fws' }), 'wss://meet.example/ws');
  for (const hostile of ['javascript:alert(1)', 'http://meet.example/', 'not a url', 'data:text/html,x']) {
    assert.equal(resolveSignalingUrl({ protocol: 'https:', host: 'play.example', search: `?signal=${encodeURIComponent(hostile)}` }), 'wss://play.example/ws/share', `${hostile} is ignored`);
  }
});

test('an address that tries too many wrong codes is refused, even the right one, until its minute is up', async () => {
  // Codes are four digits: without this, a script could run through all 10,000 in minutes.
  let clock = 1_000_000;
  const s = await start({ maxWrongCodes: 3, wrongCodeWindowMs: 60_000, now: () => clock });
  const host = await s.connect();
  host.send({ type: 'host', room: ROOM });
  await host.next();
  for (const wrong of ['0001', '0002', '0003']) {
    const c = await s.connect();
    c.send({ type: 'join', room: wrong });
    assert.equal((await c.next()).code, 'room_not_found', wrong);
  }
  const blocked = await s.connect();
  blocked.send({ type: 'join', room: ROOM });
  const refusal = await blocked.next();
  assert.equal(refusal.code, 'too_many_codes', 'the right code is refused too: a guesser learns nothing');
  clock += 60_001;
  const later = await s.connect();
  later.send({ type: 'join', room: ROOM });
  assert.equal((await later.next()).type, 'joined', 'after the minute it joins');
  await s.stop();
});

test('a person who mistypes a code a few times still gets in', async () => {
  const s = await start();
  const host = await s.connect();
  host.send({ type: 'host', room: ROOM });
  await host.next();
  for (const typo of ['4208', '4270']) {
    const c = await s.connect();
    c.send({ type: 'join', room: typo });
    assert.equal((await c.next()).code, 'room_not_found');
  }
  const right = await s.connect();
  right.send({ type: 'join', room: ROOM });
  assert.equal((await right.next()).type, 'joined');
  await s.stop();
});
