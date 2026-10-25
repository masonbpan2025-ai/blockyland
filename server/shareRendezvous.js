import { WebSocketServer } from 'ws';
import { isValidRoomCode, normalizeRoomCode } from '../src/multiplayer/shareCode.js';

export const SHARE_PATH = '/ws/share';

/**
 * Wrong codes one address may try in a window. Codes are four digits (shareCode.js): at ten a minute, running through
 * all 10,000 takes about seventeen hours, while a person who mistypes a few times is not held up.
 */
export const WRONG_CODES_PER_WINDOW = 10;
export const WRONG_CODE_WINDOW_MS = 60_000;

/**
 * What one connection may push through the relay (resilientPeerLink.js), for browsers that cannot connect directly:
 * a burst large enough for a world being sent, then a steady game's worth. Counted apart from the introductions.
 */
export const RELAY_LIMITS = Object.freeze({ burst: 4000, perSecond: 800, burstBytes: 16 * 1024 * 1024, bytesPerSecond: 4 * 1024 * 1024 });

/** A token bucket of messages and of bytes, for the relay. */
export function createRelayAllowance({ burst, perSecond, burstBytes, bytesPerSecond } = RELAY_LIMITS, now = () => Date.now()) {
  let messages = burst, bytes = burstBytes, last = now();
  return {
    take(size) {
      const t = now(), seconds = Math.max(0, (t - last) / 1000);
      last = t;
      messages = Math.min(burst, messages + seconds * perSecond);
      bytes = Math.min(burstBytes, bytes + seconds * bytesPerSecond);
      if (messages < 1 || bytes < size) return false;
      messages -= 1;
      bytes -= size;
      return true;
    },
  };
}

/** Counts each address's wrong codes in a fixed window. Kept small: an address's count goes when its window ends. */
export function createGuessLimiter({ max = WRONG_CODES_PER_WINDOW, windowMs = WRONG_CODE_WINDOW_MS, now = () => Date.now() } = {}) {
  const counts = new Map(); // address -> { misses, until }
  const current = (address) => {
    const entry = counts.get(address);
    if (entry && entry.until <= now()) { counts.delete(address); return null; }
    return entry ?? null;
  };
  return {
    blocked: (address) => (current(address)?.misses ?? 0) >= max,
    miss(address) {
      const entry = current(address) ?? { misses: 0, until: now() + windowMs };
      entry.misses++;
      counts.set(address, entry);
      if (counts.size > 10000) for (const [key, value] of counts) if (value.until <= now()) counts.delete(key);
    },
  };
}

/**
 * The introduction service for shared worlds.
 *
 * It does one job: a guest holding a link names a room, and the host of that room and the guest swap the small
 * messages two browsers need to connect to each other directly. After that the two talk peer to peer and this
 * service is no longer involved, unless their networks block a direct connection: then it relays their game frames
 * without reading them. It keeps no record: a room exists only while its host is connected.
 *
 * Wire protocol (JSON text frames):
 *
 *   host  -> { type: 'host', room }          <- { type: 'hosted', room }
 *   guest -> { type: 'join', room }          <- { type: 'joined', room, guestId }
 *   either-> { type: 'signal', to?, data }   -> peer gets { type: 'signal', from, data }
 *   either-> { type: 'relay', to?, data }    -> peer gets { type: 'relay', from, data }
 *
 * `relay` carries game frames (a string each) for two browsers whose networks will not let them connect directly.
 * The service passes them on without reading them, under a larger allowance than the introductions'.
 *   server-> { type: 'guest_left', guestId } (to the host), { type: 'host_left' } (to the guests)
 *   server-> { type: 'error', code, message }
 *
 * `to` is a guest id when the host is the sender; a guest's messages always go to the host.
 */
export function createShareRendezvous({
  path = SHARE_PATH,
  maxGuestsPerRoom = 16,
  maxRooms = 1000,
  maxPayload = 64 * 1024,
  heartbeatMs = 30_000,
  randomId = () => Math.random().toString(36).slice(2, 10),
  maxWrongCodes = WRONG_CODES_PER_WINDOW,
  wrongCodeWindowMs = WRONG_CODE_WINDOW_MS,
  now = () => Date.now(),
  relayLimits = RELAY_LIMITS,
} = {}) {
  const rooms = new Map(); // code -> { code, host: ws, guests: Map<guestId, ws> }
  const guesses = createGuessLimiter({ max: maxWrongCodes, windowMs: wrongCodeWindowMs, now });
  const wss = new WebSocketServer({ noServer: true, maxPayload });

  const send = (ws, payload) => {
    if (!ws || ws.readyState !== 1) return false;
    try { ws.send(JSON.stringify(payload)); return true; } catch { return false; }
  };
  const fail = (ws, code, message) => send(ws, { type: 'error', code, message });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    // Who is guessing codes: the address the connection came from (shared by everyone behind one router, which is
    // the cost of counting by it).
    const address = req?.socket?.remoteAddress ?? 'unknown';
    ws.on('pong', () => { ws.isAlive = true; });
    // A connection is a host of one room, or a guest of one room, never both, and never two.
    let role = null;
    let room = null;
    let guestId = null;
    // Introductions are small and few; a stream of them is an attack, not a join.
    let bucket = 200;
    let last = Date.now();
    const relayAllowance = createRelayAllowance(relayLimits, now);

    ws.on('message', (raw) => {
      // Relayed game frames have their own, larger allowance, so they are told apart before the introductions' one.
      if (role && room && raw.length <= maxPayload && raw.toString('utf8', 0, 16).startsWith('{"type":"relay"')) {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { fail(ws, 'bad_json', 'Messages must be JSON.'); return; }
        if (typeof msg?.data !== 'string') { fail(ws, 'bad_message', 'A relayed frame must be text.'); return; }
        if (!relayAllowance.take(raw.length)) { fail(ws, 'rate_limited', 'Too many messages.'); ws.close(1008); return; }
        if (role === 'guest') send(room.host, { type: 'relay', from: guestId, data: msg.data });
        else {
          const guest = room.guests.get(String(msg.to));
          if (guest) send(guest, { type: 'relay', from: 'host', data: msg.data });
        }
        return;
      }
      const now = Date.now();
      bucket = Math.min(200, bucket + ((now - last) / 1000) * 20);
      last = now;
      if (--bucket < 0) { fail(ws, 'rate_limited', 'Too many messages.'); ws.close(1008); return; }

      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { fail(ws, 'bad_json', 'Messages must be JSON.'); return; }
      if (!msg || typeof msg !== 'object') { fail(ws, 'bad_message', 'Messages must be objects.'); return; }

      if (msg.type === 'host') {
        if (role) { fail(ws, 'already_in_room', 'This connection already has a room.'); return; }
        const code = normalizeRoomCode(msg.room);
        if (!isValidRoomCode(code)) { fail(ws, 'bad_room', 'That is not a room code.'); return; }
        if (rooms.has(code)) { fail(ws, 'room_taken', 'That room is already being hosted.'); return; }
        if (rooms.size >= maxRooms) { fail(ws, 'server_full', 'This service is full. Try again later.'); return; }
        room = { code, host: ws, guests: new Map() };
        rooms.set(code, room);
        role = 'host';
        send(ws, { type: 'hosted', room: code });
        return;
      }

      if (msg.type === 'join') {
        if (role) { fail(ws, 'already_in_room', 'This connection already has a room.'); return; }
        const code = normalizeRoomCode(msg.room);
        // Over its allowance, an address is refused even the right code, so a guesser learns nothing until it waits.
        if (guesses.blocked(address)) { fail(ws, 'too_many_codes', 'Too many wrong codes. Wait a minute, then try again.'); return; }
        const target = isValidRoomCode(code) ? rooms.get(code) : null;
        // The same answer for a malformed code and an unknown one: a probe learns nothing about what exists.
        if (!target) { guesses.miss(address); fail(ws, 'room_not_found', 'That world is not being shared right now.'); return; }
        if (target.guests.size >= maxGuestsPerRoom) { fail(ws, 'room_busy', 'Too many people are joining. Try again in a moment.'); return; }
        guestId = randomId();
        target.guests.set(guestId, ws);
        room = target;
        role = 'guest';
        send(ws, { type: 'joined', room: code, guestId });
        return;
      }

      if (msg.type === 'signal') {
        if (!role || !room) { fail(ws, 'not_in_room', 'Join or host a room first.'); return; }
        if (!msg.data || typeof msg.data !== 'object') { fail(ws, 'bad_message', 'A signal needs data.'); return; }
        if (role === 'guest') {
          send(room.host, { type: 'signal', from: guestId, data: msg.data });
        } else {
          const guest = room.guests.get(String(msg.to));
          if (guest) send(guest, { type: 'signal', from: 'host', data: msg.data });
        }
        return;
      }

      fail(ws, 'unknown_type', 'Unknown message type.');
    });

    const leave = () => {
      if (!room) return;
      if (role === 'host') {
        for (const guest of room.guests.values()) {
          send(guest, { type: 'host_left' });
          try { guest.close(1001, 'host left'); } catch { /* already closed */ }
        }
        if (rooms.get(room.code) === room) rooms.delete(room.code);
      } else if (role === 'guest') {
        room.guests.delete(guestId);
        send(room.host, { type: 'guest_left', guestId });
      }
      room = null;
      role = null;
    };
    ws.on('close', leave);
    ws.on('error', () => { try { ws.terminate(); } catch { /* gone */ } leave(); });
  });

  // Drop connections that stopped answering, so a host that lost its network does not hold its room forever.
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* closing */ }
    }
  }, heartbeatMs);
  timer.unref?.();

  const handleUpgrade = (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname !== path) return false;
    wss.handleUpgrade(req, socket, head, (client) => wss.emit('connection', client, req));
    return true;
  };

  return {
    wss,
    rooms,
    path,
    handleUpgrade,
    /** Counts only: the service has no room list to show, by design. */
    stats: () => ({ rooms: rooms.size, guests: [...rooms.values()].reduce((n, r) => n + r.guests.size, 0) }),
    async close() {
      clearInterval(timer);
      for (const ws of wss.clients) { try { ws.terminate(); } catch { /* gone */ } }
      rooms.clear();
      await new Promise((resolve) => wss.close(resolve));
    },
  };
}
