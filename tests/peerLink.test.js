// The direct connection between two browsers: ICE server configuration, and the PeerLink wrapper over a stand-in for
// RTCPeerConnection, so the connection logic is checked without a browser. Real WebRTC runs in e2e/share.pw.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerLink, parseIceServers, DEFAULT_ICE_SERVERS, ICE_STORAGE_KEY, CHANNEL_LABEL, BUFFER_HIGH } from '../src/multiplayer/peerLink.js';
import { configuredIceServers } from '../src/multiplayer/worldSyncManager.js';

// --- configuration --------------------------------------------------------------------------

test('the defaults are public STUN servers, which carry no game data', () => {
  assert.ok(DEFAULT_ICE_SERVERS.length >= 1);
  for (const server of DEFAULT_ICE_SERVERS) assert.match(server.urls, /^stun:/);
});

test('a player\'s own servers are accepted from JSON or an array, and cleaned', () => {
  assert.deepEqual(parseIceServers('[{"urls":"stun:s.example:3478"}]'), [{ urls: 'stun:s.example:3478' }]);
  assert.deepEqual(parseIceServers([{ urls: ['turn:t.example', 'turns:t.example:443'], username: 'u', credential: 'c' }]),
    [{ urls: ['turn:t.example', 'turns:t.example:443'], username: 'u', credential: 'c' }]);
  assert.deepEqual(parseIceServers([{ urls: 'stun:a' }, null, 5, { urls: 'ftp://x' }, { nothing: 1 }]), [{ urls: 'stun:a' }]);
});

test('anything that is not a STUN or TURN address is dropped, so a stray value cannot aim a connection elsewhere', () => {
  for (const bad of ['http://evil.example', 'javascript:alert(1)', 'stun:', 'stun: spaced', 'ws://x', '', 5, null, {}]) {
    assert.equal(parseIceServers([{ urls: bad }]), null, String(bad));
  }
  assert.equal(parseIceServers([{ urls: ['http://a', 'stun:ok'] }])[0].urls, 'stun:ok', 'only the valid address of a mixed list survives');
});

test('nothing usable means "use the defaults"', () => {
  for (const nothing of [undefined, null, '', 'not json', '{}', '[]', 42, []]) assert.equal(parseIceServers(nothing), null, String(nothing));
});

test('a list is capped, and credentials must be strings', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ urls: `stun:s${i}.example` }));
  assert.equal(parseIceServers(many).length, 8);
  const server = parseIceServers([{ urls: 'turn:t', username: 5, credential: { a: 1 } }])[0];
  assert.ok(!('username' in server) && !('credential' in server));
});

test('the game reads the servers from the page, then from local storage', () => {
  const win = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const store = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    delete globalThis.window;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k) => (k === ICE_STORAGE_KEY ? '[{"urls":"stun:stored.example"}]' : null) } });
    assert.deepEqual(configuredIceServers(), [{ urls: 'stun:stored.example' }]);
    globalThis.window = { MC_ICE_SERVERS: [{ urls: 'turn:page.example' }] };
    assert.deepEqual(configuredIceServers(), [{ urls: 'turn:page.example' }], 'the page wins');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => { throw new Error('blocked'); } } });
    delete globalThis.window;
    assert.equal(configuredIceServers(), undefined, 'blocked storage means the defaults');
  } finally {
    if (win) Object.defineProperty(globalThis, 'window', win); else delete globalThis.window;
    if (store) Object.defineProperty(globalThis, 'localStorage', store); else delete globalThis.localStorage;
  }
});

// --- the link over a stand-in connection ---------------------------------------------------------------

/** Just enough of RTCPeerConnection and RTCDataChannel for PeerLink to drive. */
function fakeConnection() {
  const calls = [];
  const pc = {
    calls, connectionState: 'new', localDescription: null, candidates: [],
    createDataChannel(label, options) {
      calls.push(['createDataChannel', label, options]);
      pc.channel = fakeChannel();
      return pc.channel;
    },
    async createOffer() { calls.push(['createOffer']); return { type: 'offer', sdp: 'OFFER' }; },
    async createAnswer() { calls.push(['createAnswer']); return { type: 'answer', sdp: 'ANSWER' }; },
    async setLocalDescription(d) { pc.localDescription = d; calls.push(['setLocal', d.type]); },
    async setRemoteDescription(d) { calls.push(['setRemote', d.type]); },
    async addIceCandidate(c) { calls.push(['addCandidate', c.candidate]); },
    close() { calls.push(['close']); },
  };
  return pc;
}

function fakeChannel() {
  const listeners = new Map();
  return {
    readyState: 'connecting', bufferedAmount: 0, bufferedAmountLowThreshold: 0, sent: [],
    send(text) { this.sent.push(text); },
    close() { this.readyState = 'closed'; },
    addEventListener(e, fn) { listeners.set(e, fn); },
    removeEventListener(e) { listeners.delete(e); },
    open() { this.readyState = 'open'; this.onopen?.(); },
    lowBuffer() { this.bufferedAmount = 0; this.onbufferedamountlow?.(); },
  };
}

function link(options = {}) {
  const pc = fakeConnection();
  const signals = [];
  const l = new PeerLink({ initiator: true, onSignal: (d) => signals.push(d), createConnection: () => pc, ...options });
  return { l, pc, signals };
}

test('the initiator opens the data channel and makes the offer', async () => {
  const { l, pc, signals } = link();
  assert.deepEqual(pc.calls[0], ['createDataChannel', CHANNEL_LABEL, { ordered: true }]);
  await l.start();
  assert.deepEqual(signals, [{ kind: 'offer', sdp: 'OFFER' }]);
});

test('the other side answers an offer and does not open a channel of its own', async () => {
  const { l, pc, signals } = link({ initiator: false });
  assert.ok(!pc.calls.some((c) => c[0] === 'createDataChannel'));
  await l.handleSignal({ kind: 'offer', sdp: 'THEIR-OFFER' });
  assert.deepEqual(signals, [{ kind: 'answer', sdp: 'ANSWER' }]);
  assert.deepEqual(pc.calls.filter((c) => c[0] === 'setRemote'), [['setRemote', 'offer']]);
});

test('an initiator ignores an offer, and the other side ignores an answer', async () => {
  const a = link();
  await a.l.handleSignal({ kind: 'offer', sdp: 'x' });
  assert.ok(!a.pc.calls.some((c) => c[0] === 'setRemote'));
  const b = link({ initiator: false });
  await b.l.handleSignal({ kind: 'answer', sdp: 'x' });
  assert.ok(!b.pc.calls.some((c) => c[0] === 'setRemote'));
});

test('candidates that arrive before the offer or answer are held until it is applied', async () => {
  const { l, pc } = link();
  await l.handleSignal({ kind: 'candidate', candidate: { candidate: 'early-1' } });
  await l.handleSignal({ kind: 'candidate', candidate: { candidate: 'early-2' } });
  assert.ok(!pc.calls.some((c) => c[0] === 'addCandidate'), 'not added yet');
  await l.handleSignal({ kind: 'answer', sdp: 'A' });
  assert.deepEqual(pc.calls.filter((c) => c[0] === 'addCandidate').map((c) => c[1]), ['early-1', 'early-2']);
  await l.handleSignal({ kind: 'candidate', candidate: { candidate: 'late' } });
  assert.equal(pc.calls.filter((c) => c[0] === 'addCandidate').length, 3, 'later ones go straight in');
});

test('malformed connection messages are ignored', async () => {
  const { l, pc } = link();
  for (const junk of [null, undefined, 5, 'x', {}, { kind: 'candidate' }, { kind: 'nonsense' }]) await l.handleSignal(junk);
  assert.deepEqual(pc.calls.map((c) => c[0]), ['createDataChannel']);
});

test('local candidates are passed on as they are found', () => {
  const { pc, signals } = link();
  pc.onicecandidate({ candidate: { toJSON: () => ({ candidate: 'cand-1' }) } });
  pc.onicecandidate({ candidate: null });
  assert.deepEqual(signals, [{ kind: 'candidate', candidate: { candidate: 'cand-1' } }]);
});

test('connection reports contain candidate types and error codes, never addresses or credentials', async () => {
  const { l, pc } = link({ iceServers: [{ urls: 'turn:private.example', username: 'secret-user', credential: 'secret-password' }] });
  pc.iceConnectionState = 'checking';
  pc.iceGatheringState = 'complete';
  pc.onicecandidate({ candidate: { type: 'relay', candidate: 'candidate:1 1 udp 1 192.168.1.55 1234 typ relay', toJSON() { return { candidate: this.candidate }; } } });
  await l.handleSignal({ kind: 'candidate', candidate: { candidate: 'candidate:2 1 udp 1 203.0.113.7 4567 typ host' } });
  pc.onicecandidateerror({ errorCode: 701, url: 'turn:private.example', errorText: '192.168.1.55 could not connect' });
  pc.onicecandidateerror({ errorCode: 701 });
  const report = l.getDiagnostics();
  assert.equal(report.turnConfigured, true);
  assert.deepEqual(report.localCandidates, { relay: 1 });
  assert.deepEqual(report.remoteCandidates, { host: 1 });
  assert.deepEqual(report.iceErrorCodes, [701]);
  assert.equal(report.iceConnectionState, 'checking');
  assert.equal(report.remoteDescriptionReceived, false);
  assert.doesNotMatch(JSON.stringify(report), /192\.168|203\.0|private\.example|secret-/);
  report.localCandidates.relay = 100;
  assert.equal(l.getDiagnostics().localCandidates.relay, 1, 'reports do not mutate live counters');
  pc.onicecandidate({ candidate: { type: 'host', address: 'private-hostname.local', candidate: 'candidate:1 1 udp 1 private-hostname.local 1234 typ host' } });
  await l.handleSignal({ kind: 'candidate', candidate: { candidate: 'candidate:2 1 udp 1 another-hostname.local 1234 typ host' } });
  assert.equal(l.getDiagnostics().localMdnsCandidates, 1);
  assert.equal(l.getDiagnostics().remoteMdnsCandidates, 1);
  assert.doesNotMatch(JSON.stringify(l.getDiagnostics()), /private-hostname|another-hostname/);
  l.close();
});

test('failed ICE state is retained before closing, and rejected remote candidates are counted', async () => {
  const { l, pc } = link();
  pc.addIceCandidate = async () => { throw new Error('Invalid remote address'); };
  await l.handleSignal({ kind: 'candidate', candidate: { candidate: 'candidate:1 1 udp 1 203.0.113.7 1 typ srflx' } });
  await l.handleSignal({ kind: 'answer', sdp: 'ANSWER' });
  assert.equal(l.getDiagnostics().rejectedCandidates, 1);
  pc.connectionState = 'failed';
  pc.iceConnectionState = 'failed';
  pc.close = () => { pc.connectionState = 'closed'; pc.iceConnectionState = 'closed'; };
  pc.onconnectionstatechange();
  assert.equal(l.finalDiagnostics.connectionState, 'failed');
  assert.equal(l.finalDiagnostics.iceConnectionState, 'failed');
  assert.equal(l.finalDiagnostics.closeReason, 'ice_failed');
  assert.equal(l.finalDiagnostics.turnConfigured, false);
  assert.equal(l.finalDiagnostics.remoteDescriptionReceived, true);
});

test('the link reports opening, passes text up and ignores anything that is not text', () => {
  const { l, pc } = link();
  const log = [];
  l.onopen = () => log.push('open');
  l.onmessage = (t) => log.push(t);
  pc.channel.open();
  pc.channel.onmessage({ data: 'hello' });
  pc.channel.onmessage({ data: new ArrayBuffer(4) });
  assert.deepEqual(log, ['open', 'hello']);
  assert.equal(l.isOpen, true);
});

test('sending works only while the channel is open', () => {
  const { l, pc } = link();
  assert.equal(l.send('early'), false, 'not open yet');
  pc.channel.open();
  assert.equal(l.send('now'), true);
  assert.deepEqual(pc.channel.sent, ['now']);
  l.close();
  assert.equal(l.send('late'), false);
});

test('a link that closes reports why, once, and releases the connection', () => {
  const { l, pc } = link();
  const reasons = [];
  l.onclose = (r) => reasons.push(r);
  l.close('first');
  l.close('second');
  assert.deepEqual(reasons, ['first']);
  assert.ok(pc.calls.some((c) => c[0] === 'close'));
  assert.equal(l.isOpen, false);
});

test('a channel that closes or fails ends the link', () => {
  for (const event of ['onclose', 'onerror']) {
    const { l, pc } = link();
    const reasons = [];
    l.onclose = (r) => reasons.push(r);
    pc.channel[event]();
    assert.equal(reasons.length, 1, event);
  }
});

test('a failed connection ends the link; a brief drop is given time to heal', async () => {
  const failed = link();
  const reasons = [];
  failed.l.onclose = (r) => reasons.push(r);
  failed.pc.connectionState = 'failed';
  failed.pc.onconnectionstatechange();
  assert.deepEqual(reasons, ['ice_failed']);

  const flaky = link({ disconnectGraceMs: 30 });
  const flakyReasons = [];
  flaky.l.onclose = (r) => flakyReasons.push(r);
  flaky.pc.connectionState = 'disconnected';
  flaky.pc.onconnectionstatechange();
  flaky.pc.connectionState = 'connected';
  flaky.pc.onconnectionstatechange();
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(flakyReasons, [], 'it recovered, so it stays');

  const gone = link({ disconnectGraceMs: 20 });
  const goneReasons = [];
  gone.l.onclose = (r) => goneReasons.push(r);
  gone.pc.connectionState = 'disconnected';
  gone.pc.onconnectionstatechange();
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(goneReasons, ['disconnected'], 'it did not recover');
});

test('a large send waits for the channel to drain, and is released when the link closes', async () => {
  const { l, pc } = link();
  pc.channel.open();
  pc.channel.bufferedAmount = BUFFER_HIGH + 1;
  let drained = false;
  const waiting = l.drain().then(() => { drained = true; });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(drained, false, 'held back while the buffer is full');
  pc.channel.lowBuffer();
  await waiting;
  assert.equal(drained, true);

  pc.channel.bufferedAmount = BUFFER_HIGH + 1;
  let released = false;
  const second = l.drain().then(() => { released = true; });
  l.close();
  await second;
  assert.equal(released, true, 'a closed link never leaves a sender waiting');
});
