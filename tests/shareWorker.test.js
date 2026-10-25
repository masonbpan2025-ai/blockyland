// The Cloudflare share worker (cloudflare/share/src/index.js), the deployed twin of server/shareRendezvous.js, driven
// with fake hibernating sockets: rooms, introductions, and the relay for browsers that cannot connect directly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ShareRendezvous } from '../cloudflare/share/src/index.js';

function fakeSocket(address = '1.2.3.4') {
  let attachment = { role: null, room: null, guestId: null, bucket: 200, last: Date.now(), address };
  return {
    readyState: 1, sent: [], closedWith: null,
    send(text) { this.sent.push(JSON.parse(text)); },
    close(code) { this.readyState = 3; this.closedWith = code; },
    serializeAttachment(value) { attachment = structuredClone(value); },
    deserializeAttachment() { return structuredClone(attachment); },
    last() { return this.sent.at(-1); },
  };
}

function worker() {
  const sockets = [];
  const object = new ShareRendezvous({ getWebSockets: () => sockets.filter((s) => s.readyState === 1) });
  const connect = (address) => { const s = fakeSocket(address); sockets.push(s); return s; };
  const say = (socket, message) => object.webSocketMessage(socket, typeof message === 'string' ? message : JSON.stringify(message));
  return { object, connect, say, sockets };
}

async function room(w, code = '7341') {
  const host = w.connect();
  await w.say(host, { type: 'host', room: code });
  assert.deepEqual(host.last(), { type: 'hosted', room: code });
  const guest = w.connect('5.6.7.8');
  await w.say(guest, { type: 'join', room: code });
  const { guestId } = guest.last();
  assert.ok(guestId);
  return { host, guest, guestId };
}

test('worker: a guest joins a hosted room and their introductions pass between them', async () => {
  const w = worker();
  const { host, guest, guestId } = await room(w);
  await w.say(guest, { type: 'signal', data: { kind: 'offer' } });
  assert.deepEqual(host.last(), { type: 'signal', from: guestId, data: { kind: 'offer' } });
  await w.say(host, { type: 'signal', to: guestId, data: { kind: 'answer' } });
  assert.deepEqual(guest.last(), { type: 'signal', from: 'host', data: { kind: 'answer' } });
});

test('worker: game frames are relayed between the host and one guest, and to nobody else', async () => {
  const w = worker();
  const { host, guest, guestId } = await room(w);
  const other = w.connect('9.9.9.9');
  await w.say(other, { type: 'join', room: '7341' });
  const before = other.sent.length;
  await w.say(guest, { type: 'relay', data: '{"t":"hello"}' });
  assert.deepEqual(host.last(), { type: 'relay', from: guestId, data: '{"t":"hello"}' });
  await w.say(host, { type: 'relay', to: guestId, data: '{"t":"welcome"}' });
  assert.deepEqual(guest.last(), { type: 'relay', from: 'host', data: '{"t":"welcome"}' });
  assert.equal(other.sent.length, before, 'the third connection saw nothing');
});

test('worker: relayed frames have their own allowance -- a world\'s worth passes, the introductions are untouched', async () => {
  const w = worker();
  const { host, guest, guestId } = await room(w);
  const frame = 'x'.repeat(15000);
  for (let i = 0; i < 600; i++) await w.say(host, { type: 'relay', to: guestId, data: frame });
  assert.equal(guest.sent.filter((m) => m.type === 'relay').length, 600);
  assert.equal(host.closedWith, null);
  await w.say(guest, { type: 'signal', data: { kind: 'candidate' } });
  assert.equal(host.last().type, 'signal');
});

test('worker: a relay flood past its allowance closes the connection', async () => {
  const w = worker();
  const { host, guestId } = await room(w);
  for (let i = 0; i < 4100 && host.closedWith === null; i++) await w.say(host, { type: 'relay', to: guestId, data: 'x' });
  assert.equal(host.closedWith, 1008);
  assert.ok(host.sent.some((m) => m.type === 'error' && m.code === 'rate_limited'));
});

test('worker: a relayed frame must be text, and needs a room', async () => {
  const w = worker();
  const lone = w.connect();
  await w.say(lone, { type: 'relay', data: 'hello' });
  assert.equal(lone.last().code, 'unknown_type');
  const { guest } = await room(w, '1111');
  await w.say(guest, { type: 'relay', data: { not: 'text' } });
  assert.equal(guest.last().code, 'bad_message');
});

test('worker: a guest who left and another who took its place are told apart by the relay', async () => {
  const w = worker();
  const { host, guest, guestId } = await room(w);
  await w.say(host, { type: 'relay', to: guestId, data: 'one' });
  guest.readyState = 3; // gone
  await w.object.webSocketClose(guest);
  await w.say(host, { type: 'relay', to: guestId, data: 'two' });
  assert.equal(guest.sent.filter((m) => m.type === 'relay').length, 1, 'nothing goes to a closed socket');
});
