// In-memory stand-ins for the two things the share session needs from the outside: the introduction service and a
// direct connection between two browsers. They follow the same interfaces as the real ones (SignalingClient and
// PeerLink), so a session cannot tell the difference, and a test can make either misbehave.
import { ShareError } from '../../src/multiplayer/signaling.js';
import { normalizeRoomCode, isValidRoomCode } from '../../src/multiplayer/shareCode.js';

let linkCounter = 0;

/** Everything one test needs: a hub of rooms and a table of live links. */
export function createFakeNetwork({ latencyMs = 0 } = {}) {
  const rooms = new Map(); // code -> { host: FakeSignaling, guests: Map<id, FakeSignaling> }
  const links = new Map(); // id -> FakeLink
  const log = { signals: [], frames: 0 };
  let guestSeq = 0;
  const later = (fn) => (latencyMs ? setTimeout(fn, latencyMs) : queueMicrotask(fn));

  class FakeSignaling {
    constructor() {
      this.handlers = new Map();
      this.role = null;
      this.room = null;
      this.guestId = null;
      this.closed = false;
      this.reachable = true;
    }

    on(event, fn) {
      if (!this.handlers.has(event)) this.handlers.set(event, new Set());
      this.handlers.get(event).add(fn);
      return () => this.handlers.get(event).delete(fn);
    }

    emit(event, payload) { for (const fn of this.handlers.get(event) ?? []) fn(payload); }

    async connect() {
      if (!network.signalingReachable) throw new ShareError('signalling_unreachable', 'Could not reach the sharing service.');
    }

    async host(code) {
      const room = normalizeRoomCode(code);
      if (!isValidRoomCode(room)) throw new ShareError('bad_room', 'That is not a room code.');
      if (rooms.has(room)) throw new ShareError('room_taken', 'That room code is already in use.');
      rooms.set(room, { host: this, guests: new Map() });
      this.role = 'host';
      this.room = room;
    }

    async join(code) {
      const room = normalizeRoomCode(code);
      const target = rooms.get(room);
      if (!target) throw new ShareError('room_not_found', 'That world is not being shared right now.');
      this.guestId = `g${++guestSeq}`;
      this.role = 'guest';
      this.room = room;
      target.guests.set(this.guestId, this);
      return { guestId: this.guestId };
    }

    signal(data, to) {
      if (this.closed) return false;
      log.signals.push({ role: this.role, to, kind: data?.kind });
      const target = rooms.get(this.room);
      if (!target) return false;
      later(() => {
        if (this.role === 'guest') target.host.emit('signal', { from: this.guestId, data });
        else target.guests.get(to)?.emit('signal', { from: 'host', data });
      });
      return true;
    }

    /** A game frame carried by the service, as server/shareRendezvous.js relays it. */
    relay(text, to) {
      if (this.closed || typeof text !== 'string') return false;
      log.relayed = (log.relayed ?? 0) + 1;
      const target = rooms.get(this.room);
      if (!target) return false;
      later(() => {
        if (this.role === 'guest') target.host.emit('relay', { from: this.guestId, data: text });
        else target.guests.get(to)?.emit('relay', { from: 'host', data: text });
      });
      return true;
    }

    bufferedAmount() { return 0; }

    close() {
      if (this.closed) return;
      this.closed = true;
      const target = rooms.get(this.room);
      if (target) {
        if (this.role === 'host') {
          rooms.delete(this.room);
          for (const guest of target.guests.values()) guest.emit('host_left');
        } else {
          target.guests.delete(this.guestId);
          target.host.emit('guest_left', { guestId: this.guestId });
        }
      }
      this.emit('close');
    }

    /** Test control: the service drops this connection without the client asking. */
    drop() { this.close(); }
  }

  class FakeLink {
    constructor({ initiator, onSignal }) {
      this.id = ++linkCounter;
      this.initiator = initiator;
      this.onSignal = onSignal;
      this.closed = false;
      this.isOpenFlag = false;
      this.peer = null;
      this.silent = false; // when true, nothing leaves this side: a dead network
      this.sent = [];
      this.onopen = null;
      this.onmessage = null;
      this.onclose = null;
      links.set(this.id, this);
    }

    get isOpen() { return this.isOpenFlag && !this.closed; }

    async start() {
      this.onSignal({ kind: 'offer', sdp: `fake-offer:${this.id}` });
    }

    async handleSignal(data) {
      if (this.closed) return;
      if (data.kind === 'offer' && !this.initiator) {
        const initiator = links.get(Number(String(data.sdp).split(':')[1]));
        if (!initiator || initiator.closed) return;
        this.peer = initiator;
        initiator.peer = this;
        this.onSignal({ kind: 'answer', sdp: `fake-answer:${this.id}` });
        // Both ends open once the answer has been exchanged.
        later(() => {
          if (network.linksBlocked) return;
          this.isOpenFlag = true;
          initiator.isOpenFlag = true;
          initiator.onopen?.();
          this.onopen?.();
        });
      }
    }

    send(text) {
      if (!this.isOpen) return false;
      this.sent.push(text);
      log.frames++;
      const peer = this.peer;
      if (!this.silent && peer && !peer.closed) later(() => { if (!peer.closed) peer.onmessage?.(text); });
      return true;
    }

    async drain() {}

    close(reason = 'closed') {
      if (this.closed) return;
      this.closed = true;
      this.isOpenFlag = false;
      this.onclose?.(reason);
      const peer = this.peer;
      if (peer && !peer.closed) later(() => peer.close('peer_closed'));
    }
  }

  const network = {
    rooms,
    links,
    log,
    signalingReachable: true,
    linksBlocked: false,
    signalingFactory: () => {
      const s = new FakeSignaling();
      network.lastSignaling = s;
      network.allSignalings.push(s);
      return s;
    },
    allSignalings: [],
    peerFactory: (options) => new FakeLink(options),
    /** Every signalling connection that is hosting a room. */
    hostSignaling: (code) => rooms.get(code)?.host,
  };
  return network;
}

/** Wait for an event on a session. */
export function nextEvent(session, event, { timeoutMs = 2000 } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { off(); reject(new Error(`timed out waiting for "${event}"`)); }, timeoutMs);
    const off = session.on(event, (data) => { clearTimeout(timer); off(); resolve(data); });
  });
}

/** Let queued microtasks and zero-delay timers run. */
export const settle = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
