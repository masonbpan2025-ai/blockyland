const SIGNAL_PATH = '/ws/share';
// Room codes are four digits (src/multiplayer/shareCode.js), so wrong codes are limited per address, as in
// server/shareRendezvous.js: ten a minute makes running through all 10,000 take most of a day.
const ROOM_ALPHABET = '0123456789';
const ROOM_CODE_LENGTH = 4;
const WRONG_CODES_PER_WINDOW = 10;
const WRONG_CODE_WINDOW_MS = 60_000;
const MAX_GUESTS_PER_ROOM = 16;
const MAX_ROOMS = 1000;
const MAX_PAYLOAD_BYTES = 64 * 1024;
const RENDEZVOUS_ID = 'all-shared-world-rooms';
// Relayed game frames, for browsers that cannot connect directly (src/multiplayer/resilientPeerLink.js). The same
// allowance as server/shareRendezvous.js RELAY_LIMITS, counted apart from the introductions.
const RELAY_LIMITS = { burst: 4000, perSecond: 800, burstBytes: 16 * 1024 * 1024, bytesPerSecond: 4 * 1024 * 1024 };

export default {
  async fetch(request, env) {
    const id = env.SHARE_ROOMS.idFromName(RENDEZVOUS_ID);
    return env.SHARE_ROOMS.get(id).fetch(request);
  },
};

function normalizeRoomCode(value) {
  if (typeof value !== 'string') return '';
  return [...value.trim().toLowerCase().replace(/[\s-]+/g, '')]
    .map((character) => ({ i: '1', l: '1', o: '0' })[character] ?? character)
    .join('');
}

function isValidRoomCode(value) {
  return typeof value === 'string'
    && value.length === ROOM_CODE_LENGTH
    && [...value].every((character) => ROOM_ALPHABET.includes(character));
}

function send(socket, payload) {
  if (socket?.readyState !== 1) return false;
  try {
    socket.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function fail(socket, code, message) {
  send(socket, { type: 'error', code, message });
}

function attachment(socket) {
  try {
    return socket.deserializeAttachment() ?? {};
  } catch {
    return {};
  }
}

function roomSockets(ctx, roomCode) {
  const hosts = [];
  const guests = [];
  for (const socket of ctx.getWebSockets()) {
    const state = attachment(socket);
    if (state.room !== roomCode) continue;
    if (state.role === 'host') hosts.push(socket);
    else if (state.role === 'guest') guests.push({ socket, guestId: state.guestId });
  }
  return { hosts, guests };
}

function randomGuestId() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 12);
}

export class ShareRendezvous {
  constructor(ctx) {
    this.ctx = ctx;
    this.wrongCodes = new Map(); // address -> { misses, until }
    // In memory only: after the object hibernates an allowance starts full again, and the lookup is rebuilt.
    this.relayAllowances = new WeakMap(); // socket -> { messages, bytes, last }
    this.relayTargets = new Map(); // `${room}/${guestId or 'host'}` -> socket
  }

  takeRelayAllowance(socket, size) {
    const now = Date.now();
    const a = this.relayAllowances.get(socket) ?? { messages: RELAY_LIMITS.burst, bytes: RELAY_LIMITS.burstBytes, last: now };
    const seconds = Math.max(0, (now - a.last) / 1000);
    a.last = now;
    a.messages = Math.min(RELAY_LIMITS.burst, a.messages + seconds * RELAY_LIMITS.perSecond);
    a.bytes = Math.min(RELAY_LIMITS.burstBytes, a.bytes + seconds * RELAY_LIMITS.bytesPerSecond);
    this.relayAllowances.set(socket, a);
    if (a.messages < 1 || a.bytes < size) return false;
    a.messages -= 1;
    a.bytes -= size;
    return true;
  }

  /** The socket of the host of `room` (`who` 'host') or of one of its guests, without scanning every socket each frame. */
  relayTarget(room, who) {
    const key = `${room}/${who}`;
    const known = this.relayTargets.get(key);
    if (known?.readyState === 1) {
      const state = attachment(known);
      if (state.room === room && (who === 'host' ? state.role === 'host' : state.guestId === who)) return known;
    }
    this.relayTargets.delete(key);
    const peers = roomSockets(this.ctx, room);
    const found = who === 'host' ? peers.hosts[0] : peers.guests.find((guest) => guest.guestId === who)?.socket;
    if (found) {
      if (this.relayTargets.size > 5000) this.relayTargets.clear();
      this.relayTargets.set(key, found);
    }
    return found ?? null;
  }

  relay(socket, state, text, size) {
    let messageData;
    try { messageData = JSON.parse(text); } catch { fail(socket, 'bad_json', 'Messages must be JSON.'); return; }
    if (typeof messageData?.data !== 'string') { fail(socket, 'bad_message', 'A relayed frame must be text.'); return; }
    if (!this.takeRelayAllowance(socket, size)) {
      fail(socket, 'rate_limited', 'Too many messages.');
      socket.close(1008, 'Too many messages');
      return;
    }
    if (state.role === 'guest') send(this.relayTarget(state.room, 'host'), { type: 'relay', from: state.guestId, data: messageData.data });
    else send(this.relayTarget(state.room, String(messageData.to)), { type: 'relay', from: 'host', data: messageData.data });
  }

  wrongCodeCount(address) {
    const entry = this.wrongCodes.get(address);
    if (entry && entry.until <= Date.now()) { this.wrongCodes.delete(address); return null; }
    return entry ?? null;
  }

  missCode(address) {
    const entry = this.wrongCodeCount(address) ?? { misses: 0, until: Date.now() + WRONG_CODE_WINDOW_MS };
    entry.misses++;
    this.wrongCodes.set(address, entry);
    if (this.wrongCodes.size > 10000) {
      for (const [key, value] of this.wrongCodes) if (value.until <= Date.now()) this.wrongCodes.delete(key);
    }
  }

  async fetch(request) {
    if (new URL(request.url).pathname !== SIGNAL_PATH) {
      return new Response('Not found', { status: 404 });
    }
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }

    const origin = request.headers.get('Origin');
    if (origin) {
      try {
        if (new URL(origin).host !== new URL(request.url).host) {
          return new Response('Use the game site to connect', { status: 403 });
        }
      } catch {
        return new Response('Invalid origin', { status: 403 });
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const address = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    server.serializeAttachment({ role: null, room: null, guestId: null, bucket: 200, last: Date.now(), address });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket, message) {
    const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
    const size = new TextEncoder().encode(text).byteLength;
    if (size > MAX_PAYLOAD_BYTES) {
      fail(socket, 'bad_message', 'Messages must be no larger than 64 KiB.');
      socket.close(1009, 'Message too large');
      return;
    }

    const state = attachment(socket);
    // Relayed game frames have their own, larger allowance, so they are told apart before the introductions' one.
    if (state.role && state.room && text.startsWith('{"type":"relay"')) {
      this.relay(socket, state, text, size);
      return;
    }
    const now = Date.now();
    const bucket = Math.min(200, (state.bucket ?? 200) + ((now - (state.last ?? now)) / 1000) * 20) - 1;
    state.bucket = bucket;
    state.last = now;
    socket.serializeAttachment(state);
    if (bucket < 0) {
      fail(socket, 'rate_limited', 'Too many messages.');
      socket.close(1008, 'Too many messages');
      return;
    }

    let messageData;
    try {
      messageData = JSON.parse(text);
    } catch {
      fail(socket, 'bad_json', 'Messages must be JSON.');
      return;
    }
    if (!messageData || typeof messageData !== 'object' || Array.isArray(messageData)) {
      fail(socket, 'bad_message', 'Messages must be objects.');
      return;
    }

    if (messageData.type === 'host') {
      if (state.role) {
        fail(socket, 'already_in_room', 'This connection already has a room.');
        return;
      }
      const room = normalizeRoomCode(messageData.room);
      if (!isValidRoomCode(room)) {
        fail(socket, 'bad_room', 'That is not a room code.');
        return;
      }
      const existing = roomSockets(this.ctx, room);
      if (existing.hosts.length) {
        fail(socket, 'room_taken', 'That room is already being hosted.');
        return;
      }
      if (existing.guests.length) {
        fail(socket, 'room_taken', 'That room is already being hosted.');
        return;
      }
      const activeRooms = new Set();
      for (const peer of this.ctx.getWebSockets()) {
        const peerState = attachment(peer);
        if (peerState.role === 'host' && peerState.room) activeRooms.add(peerState.room);
      }
      if (activeRooms.size >= MAX_ROOMS) {
        fail(socket, 'server_full', 'This service is full. Try again later.');
        return;
      }

      state.role = 'host';
      state.room = room;
      state.guestId = null;
      socket.serializeAttachment(state);
      send(socket, { type: 'hosted', room });
      return;
    }

    if (messageData.type === 'join') {
      if (state.role) {
        fail(socket, 'already_in_room', 'This connection already has a room.');
        return;
      }
      const room = normalizeRoomCode(messageData.room);
      // Over its allowance, an address is refused even the right code, so a guesser learns nothing until it waits.
      if ((this.wrongCodeCount(state.address ?? 'unknown')?.misses ?? 0) >= WRONG_CODES_PER_WINDOW) {
        fail(socket, 'too_many_codes', 'Too many wrong codes. Wait a minute, then try again.');
        return;
      }
      const peers = isValidRoomCode(room) ? roomSockets(this.ctx, room) : { hosts: [], guests: [] };
      if (!peers.hosts.length) {
        this.missCode(state.address ?? 'unknown');
        fail(socket, 'room_not_found', 'That world is not being shared right now.');
        return;
      }
      if (peers.guests.length >= MAX_GUESTS_PER_ROOM) {
        fail(socket, 'room_busy', 'Too many people are joining. Try again in a moment.');
        return;
      }

      const guestId = randomGuestId();
      state.role = 'guest';
      state.room = room;
      state.guestId = guestId;
      socket.serializeAttachment(state);
      send(socket, { type: 'joined', room, guestId });
      return;
    }

    if (messageData.type === 'signal') {
      if (!state.role || !state.room) {
        fail(socket, 'not_in_room', 'Join or host a room first.');
        return;
      }
      if (!messageData.data || typeof messageData.data !== 'object' || Array.isArray(messageData.data)) {
        fail(socket, 'bad_message', 'A signal needs data.');
        return;
      }
      const peers = roomSockets(this.ctx, state.room);
      if (state.role === 'guest') {
        send(peers.hosts[0], { type: 'signal', from: state.guestId, data: messageData.data });
      } else {
        const target = peers.guests.find((guest) => guest.guestId === String(messageData.to));
        if (target) send(target.socket, { type: 'signal', from: 'host', data: messageData.data });
      }
      return;
    }

    fail(socket, 'unknown_type', 'Unknown message type.');
  }

  async webSocketClose(socket) {
    this.leave(socket);
  }

  async webSocketError(socket) {
    this.leave(socket);
    try { socket.close(1011, 'Connection error'); } catch { /* already closed */ }
  }

  leave(socket) {
    const state = attachment(socket);
    if (!state.room || !state.role) return;
    const peers = roomSockets(this.ctx, state.room);
    if (state.role === 'host') {
      for (const guest of peers.guests) {
        send(guest.socket, { type: 'host_left' });
        try { guest.socket.close(1001, 'host left'); } catch { /* already closed */ }
      }
    } else if (state.role === 'guest') {
      const host = peers.hosts[0];
      if (host) send(host, { type: 'guest_left', guestId: state.guestId });
    }
    try { socket.serializeAttachment({ role: null, room: null, guestId: null, bucket: 200, last: Date.now(), address: state.address }); } catch { /* closing */ }
  }
}
