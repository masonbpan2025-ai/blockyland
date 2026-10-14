import { WebSocketServer } from 'ws';
import { isValidRoomCode, normalizeRoomCode } from '../src/multiplayer/shareCode.js';

export const SHARE_PATH = '/ws/share';

/**
 * The introduction service for shared worlds.
 *
 * It does one job: a guest holding a link names a room, and the host of that room and the guest swap the small
 * messages two browsers need to connect to each other directly. After that the two talk peer to peer and this
 * service is no longer involved. It never carries gameplay, never sees the world, and keeps no record: a room
 * exists only while its host is connected.
 *
 * Wire protocol (JSON text frames):
 *
 *   host  -> { type: 'host', room }          <- { type: 'hosted', room }
 *   guest -> { type: 'join', room }          <- { type: 'joined', room, guestId }
 *   either-> { type: 'signal', to?, data }   -> peer gets { type: 'signal', from, data }
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
} = {}) {
  const rooms = new Map(); // code -> { code, host: ws, guests: Map<guestId, ws> }
  const wss = new WebSocketServer({ noServer: true, maxPayload });

  const send = (ws, payload) => {
    if (!ws || ws.readyState !== 1) return false;
    try { ws.send(JSON.stringify(payload)); return true; } catch { return false; }
  };
  const fail = (ws, code, message) => send(ws, { type: 'error', code, message });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    // A connection is a host of one room, or a guest of one room, never both, and never two.
    let role = null;
    let room = null;
    let guestId = null;
    // Introductions are small and few; a stream of them is an attack, not a join.
    let bucket = 200;
    let last = Date.now();

    ws.on('message', (raw) => {
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
        const target = isValidRoomCode(code) ? rooms.get(code) : null;
        // The same answer for a malformed code and an unknown one: a probe learns nothing about what exists.
        if (!target) { fail(ws, 'room_not_found', 'That world is not being shared right now.'); return; }
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
