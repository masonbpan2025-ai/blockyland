// The client of the introduction service (server/shareRendezvous.js).
//
// A guest and a host cannot open a connection to each other from nothing: each browser is behind its own router and
// neither knows the other's address. They need to swap a few messages first. This talks to the service that carries
// them, and nothing else -- once the two browsers are connected they stop using it.
import { normalizeRoomCode } from './shareCode.js';

/** A failure with a code the interface can turn into a sentence. */
export class ShareError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ShareError';
    this.code = code;
  }
}

export const SIGNAL_PATH = '/ws/share';

/**
 * Where the introduction service is.
 *
 * The same site that served the game, unless the link says otherwise (`?signal=wss://...`): the game is a static
 * page, so a host running it from somewhere with no service of its own can point at one that is.
 *
 * @param {{protocol: string, host: string, search?: string}} location
 */
export function resolveSignalingUrl(location, { override } = {}) {
  const requested = override ?? new URLSearchParams(location.search ?? '').get('signal');
  if (requested) {
    try {
      const url = new URL(requested);
      if (url.protocol === 'ws:' || url.protocol === 'wss:') return url.href;
    } catch { /* fall through to the default */ }
  }
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}${SIGNAL_PATH}`;
}

const MESSAGES = {
  room_not_found: 'That world is not being shared right now. Ask your friend to check that they are still in it.',
  room_busy: 'Too many people are joining at once. Try again in a moment.',
  room_taken: 'That room code is already in use.',
  server_full: 'The sharing service is full. Try again later.',
  rate_limited: 'Too many requests. Wait a moment and try again.',
};

export class SignalingClient {
  /**
   * @param {object} options
   * @param {string} options.url
   * @param {typeof WebSocket} [options.WebSocketImpl]
   * @param {number} [options.timeoutMs]
   */
  constructor({ url, WebSocketImpl = globalThis.WebSocket, timeoutMs = 8000 }) {
    this.url = url;
    this.WebSocketImpl = WebSocketImpl;
    this.timeoutMs = timeoutMs;
    this.ws = null;
    this.handlers = new Map();
    this.pending = null; // { resolve, reject, expect }
    this.closed = false;
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  emit(event, payload) {
    for (const handler of this.handlers.get(event) ?? []) {
      try { handler(payload); } catch (error) { console.error(`[share] ${event} handler failed`, error); }
    }
  }

  connect() {
    return new Promise((resolve, reject) => {
      let socket;
      try { socket = new this.WebSocketImpl(this.url); }
      catch { reject(new ShareError('signalling_unreachable', 'Could not reach the sharing service.')); return; }
      this.ws = socket;
      const timer = setTimeout(() => {
        try { socket.close(); } catch { /* already closed */ }
        reject(new ShareError('signalling_unreachable', 'The sharing service did not answer.'));
      }, this.timeoutMs);
      timer.unref?.();
      socket.onopen = () => { clearTimeout(timer); resolve(); };
      socket.onerror = () => { clearTimeout(timer); reject(new ShareError('signalling_unreachable', 'Could not reach the sharing service.')); };
      socket.onmessage = (event) => this.receive(event.data);
      socket.onclose = () => {
        clearTimeout(timer);
        this.closed = true;
        if (this.pending) {
          this.pending.reject(new ShareError('signalling_unreachable', 'The connection to the sharing service was lost.'));
          this.pending = null;
        }
        this.emit('close');
      };
    });
  }

  receive(raw) {
    let msg;
    try { msg = JSON.parse(typeof raw === 'string' ? raw : String(raw)); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'error') {
      const error = new ShareError(msg.code ?? 'error', MESSAGES[msg.code] ?? msg.message ?? 'The sharing service refused that.');
      if (this.pending) { this.pending.reject(error); this.pending = null; } else this.emit('error', error);
      return;
    }
    if (this.pending && msg.type === this.pending.expect) {
      const { resolve } = this.pending;
      this.pending = null;
      resolve(msg);
      return;
    }
    if (msg.type === 'signal') this.emit('signal', { from: msg.from, data: msg.data });
    else if (msg.type === 'guest_left') this.emit('guest_left', { guestId: msg.guestId });
    else if (msg.type === 'host_left') this.emit('host_left');
  }

  request(payload, expect) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1) { reject(new ShareError('signalling_unreachable', 'Not connected to the sharing service.')); return; }
      this.pending = { resolve, reject, expect };
      this.ws.send(JSON.stringify(payload));
    });
  }

  /** Register as the host of `room`. */
  async host(room) {
    await this.request({ type: 'host', room: normalizeRoomCode(room) }, 'hosted');
  }

  /** Ask to join `room`. Rejects with `room_not_found` when nobody is hosting it. */
  async join(room) {
    const reply = await this.request({ type: 'join', room: normalizeRoomCode(room) }, 'joined');
    return { guestId: reply.guestId };
  }

  /** Send a connection message to the other side: to a guest when hosting, to the host when joining. */
  signal(data, to) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    this.ws.send(JSON.stringify({ type: 'signal', ...(to ? { to } : {}), data }));
    return true;
  }

  close() {
    this.closed = true;
    try { this.ws?.close(); } catch { /* already closed */ }
  }
}
