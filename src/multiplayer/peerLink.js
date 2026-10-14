// One direct connection between two browsers: a WebRTC peer connection with a single reliable data channel.
//
// WebRTC does the hard part -- finding a path between two players behind their routers -- and carries the traffic
// straight between them. This wraps it in the small interface the sharing session needs: text goes in, text comes
// out, and the connection reports when it opens and when it is gone.

/**
 * Public STUN servers, which tell a browser the address the outside world sees it at. They carry no game data. A
 * host who wants their own can set `window.MC_ICE_SERVERS` before the game loads.
 */
export const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/** The storage key a player can set to use their own STUN or TURN servers. */
export const ICE_STORAGE_KEY = 'mc-ice-servers';

/**
 * Turn a configured list of STUN/TURN servers into one that is safe to hand to the browser, or null.
 *
 * Accepts a JSON string or an array of `{ urls, username?, credential? }`. A server whose address is not a stun:, turn:
 * or turns: address is dropped, so a stray value can never point a connection at anything else.
 *
 * @param {unknown} value
 * @returns {RTCIceServer[]|null} null when nothing usable was given, so the defaults apply
 */
export function parseIceServers(value) {
  let list = value;
  if (typeof value === 'string') {
    try { list = JSON.parse(value); } catch { return null; }
  }
  if (!Array.isArray(list)) return null;
  const valid = (url) => typeof url === 'string' && /^(stun|turn|turns):[^\s]+$/i.test(url);
  const servers = [];
  for (const entry of list.slice(0, 8)) {
    if (!entry || typeof entry !== 'object') continue;
    const urls = (Array.isArray(entry.urls) ? entry.urls : [entry.urls]).filter(valid);
    if (!urls.length) continue;
    const server = { urls: urls.length === 1 ? urls[0] : urls };
    if (typeof entry.username === 'string') server.username = entry.username;
    if (typeof entry.credential === 'string') server.credential = entry.credential;
    servers.push(server);
  }
  return servers.length ? servers : null;
}

export const CHANNEL_LABEL = 'mc';
/** Stop queuing messages when this many bytes are waiting to go out: a world is sent in pieces, not all at once. */
export const BUFFER_HIGH = 1024 * 1024;
export const BUFFER_LOW = 256 * 1024;

export class PeerLink {
  /**
   * @param {object} options
   * @param {boolean} options.initiator the side that opens the data channel and makes the offer (the guest)
   * @param {(data: object) => void} options.onSignal called with a connection message to pass to the other side
   * @param {RTCIceServer[]} [options.iceServers]
   * @param {(config: RTCConfiguration) => RTCPeerConnection} [options.createConnection]
   * @param {number} [options.disconnectGraceMs] how long a "disconnected" connection may recover before it is dropped
   */
  constructor({ initiator, onSignal, iceServers = DEFAULT_ICE_SERVERS, createConnection = (config) => new RTCPeerConnection(config), disconnectGraceMs = 8000 }) {
    this.initiator = initiator;
    this.onSignal = onSignal;
    this.disconnectGraceMs = disconnectGraceMs;
    this.closed = false;
    this.opened = false;
    this.channel = null;
    this.queuedCandidates = [];
    this.drainWaiters = new Set();
    this.haveRemote = false;
    this.disconnectTimer = null;
    /** @type {(() => void)|null} */ this.onopen = null;
    /** @type {((text: string) => void)|null} */ this.onmessage = null;
    /** @type {((reason: string) => void)|null} */ this.onclose = null;

    this.pc = createConnection({ iceServers });
    this.pc.onicecandidate = (event) => {
      if (event.candidate) this.onSignal({ kind: 'candidate', candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate });
    };
    this.pc.onconnectionstatechange = () => this.connectionChanged();
    this.pc.ondatachannel = (event) => this.attach(event.channel);
    if (initiator) this.attach(this.pc.createDataChannel(CHANNEL_LABEL, { ordered: true }));
  }

  attach(channel) {
    this.channel = channel;
    channel.bufferedAmountLowThreshold = BUFFER_LOW;
    channel.onbufferedamountlow = () => this.releaseDrainWaiters();
    channel.onopen = () => {
      this.opened = true;
      this.onopen?.();
    };
    channel.onmessage = (event) => {
      // Only text is part of the protocol; a binary message is not ours.
      if (typeof event.data === 'string') this.onmessage?.(event.data);
    };
    channel.onclose = () => this.close('channel_closed');
    channel.onerror = () => this.close('channel_error');
    if (channel.readyState === 'open' && !this.opened) channel.onopen();
  }

  connectionChanged() {
    const state = this.pc.connectionState;
    if (state === 'connected') {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    } else if (state === 'failed') {
      this.close('ice_failed');
    } else if (state === 'closed') {
      this.close('closed');
    } else if (state === 'disconnected' && !this.disconnectTimer) {
      // A brief drop often heals by itself; give it a few seconds before giving up.
      this.disconnectTimer = setTimeout(() => this.close('disconnected'), this.disconnectGraceMs);
      this.disconnectTimer.unref?.();
    }
  }

  /** The initiator makes the offer. */
  async start() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.onSignal({ kind: 'offer', sdp: this.pc.localDescription.sdp });
  }

  /** Handle a connection message from the other side. */
  async handleSignal(data) {
    if (this.closed || !data || typeof data !== 'object') return;
    if (data.kind === 'offer' && !this.initiator) {
      await this.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
      this.haveRemote = true;
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.onSignal({ kind: 'answer', sdp: this.pc.localDescription.sdp });
      await this.flushCandidates();
    } else if (data.kind === 'answer' && this.initiator) {
      await this.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
      this.haveRemote = true;
      await this.flushCandidates();
    } else if (data.kind === 'candidate' && data.candidate) {
      if (!this.haveRemote) this.queuedCandidates.push(data.candidate);
      else await this.pc.addIceCandidate(data.candidate).catch(() => {});
    }
  }

  async flushCandidates() {
    const queued = this.queuedCandidates;
    this.queuedCandidates = [];
    for (const candidate of queued) await this.pc.addIceCandidate(candidate).catch(() => {});
  }

  get isOpen() {
    return !this.closed && this.channel?.readyState === 'open';
  }

  /** Send one text message; false when the channel is not open. */
  send(text) {
    if (!this.isOpen) return false;
    try { this.channel.send(text); return true; } catch { return false; }
  }

  /** Wait until the channel has drained enough to take more, so a large send does not exhaust memory. */
  drain() {
    if (!this.isOpen || this.channel.bufferedAmount <= BUFFER_HIGH) return Promise.resolve();
    return new Promise((resolve) => this.drainWaiters.add(resolve));
  }

  releaseDrainWaiters() {
    const waiters = [...this.drainWaiters];
    this.drainWaiters.clear();
    for (const resolve of waiters) resolve();
  }

  close(reason = 'closed') {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.disconnectTimer);
    // A sender waiting for the channel to drain must not wait forever on a link that is gone.
    this.releaseDrainWaiters();
    try { this.channel?.close(); } catch { /* already closed */ }
    try { this.pc.close(); } catch { /* already closed */ }
    this.onclose?.(reason);
  }
}
