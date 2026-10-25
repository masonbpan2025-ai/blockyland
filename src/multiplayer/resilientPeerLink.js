import { PeerLink } from './peerLink.js';

const LOCAL_NAME = /^mc-local-[a-f0-9]{32}$/;

/** How long a guest waits for a direct connection before it also asks for the relay. */
export const RELAY_AFTER_MS = 5000;
/** Bytes queued on the relay socket above which a sender waits before the next frame. */
const RELAY_HIGH_WATER = 256 * 1024;

/** WebRTC first; then whichever fallback is ready first.
 *
 * - local: an origin/partition-scoped BroadcastChannel, which rescues two tabs of one browser when UDP/ICE fails.
 *   The random channel name is exchanged only through the existing, targeted room signaling. There is no room-wide
 *   broadcast bus: each admitted guest has its own link and still passes through ShareSession validation.
 * - relay: the game's frames go through the introduction service's WebSocket, which both sides already hold open.
 *   It works on any network that can load the site, so it is the answer for networks that block peer-to-peer
 *   connections (no TURN server is needed). It is slower than a direct link, so a guest asks for it only after the
 *   direct connection failed or has not opened within `relayMs`. `relay` is `{ send(text), bufferedAmount() }`.
 */
export class ResilientPeerLink {
  constructor({ initiator, onSignal, fallbackMs = 1500, relay = null, relayMs = RELAY_AFTER_MS,
    createDirect = (options) => new PeerLink(options),
    createChannel = typeof BroadcastChannel === 'function' ? (name) => new BroadcastChannel(name) : null,
    ...options }) {
    Object.assign(this, { initiator, onSignal, createChannel, relay, relayMs });
    this.closed = false;
    this.mode = null;
    this.local = null;
    this.localReady = false;
    this.relayRequested = false;
    this.relayReady = false;
    this.fallbackMs = fallbackMs;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    try {
      this.direct = createDirect({ ...options, initiator, onSignal });
      this.direct.onopen = () => {
        // The guest chooses once; the host follows the first application frame from that guest. This prevents
        // one side picking WebRTC while the other picks the local channel during a simultaneous open.
        if (initiator) this.select('webrtc');
      };
      this.direct.onmessage = (text) => this.receive('webrtc', text);
      this.direct.onclose = (reason) => {
        if (this.closed || this.mode === 'local' || this.mode === 'relay') return;
        if (this.mode === 'webrtc' || (!this.createChannel && !this.relay)) { this.close(reason); return; }
        if (initiator) {
          const local = this.startLocal();
          const relayed = this.startRelay();
          if (!local && !relayed) this.close(reason);
        } else if (this.createChannel) this.onSignal({ kind: 'local_request' });
      };
    } catch {
      // Some browser profiles disallow creating a peer connection altogether. A local tab or the relay can still work.
      this.direct = null;
    }
  }

  get pc() { return this.direct?.pc; }
  get isOpen() {
    if (this.closed) return false;
    if (this.mode === 'local') return Boolean(this.localReady);
    if (this.mode === 'relay') return this.relayReady;
    return this.mode === 'webrtc' && this.direct.isOpen;
  }

  async start() {
    if (this.closed) return;
    if (this.createChannel) {
      this.fallbackTimer = setTimeout(() => this.startLocal(), this.fallbackMs);
      this.fallbackTimer.unref?.();
    }
    if (this.initiator && this.relay) {
      this.relayTimer = setTimeout(() => this.startRelay(), this.relayMs);
      this.relayTimer.unref?.();
    }
    try {
      if (this.direct) await this.direct.start();
      else if (!this.startLocal() && !this.startRelay()) this.close('setup_failed');
    } catch {
      // Local negotiation can win while createOffer/setLocalDescription is still awaiting the browser.
      if (!this.closed && !this.mode && !this.startLocal() && !this.startRelay()) this.close('setup_failed');
    }
  }

  async handleSignal(data) {
    if (this.closed || !data || typeof data !== 'object') return;
    if (data.kind === 'local_request') {
      if (this.initiator) this.startLocal();
    } else if (data.kind === 'local_offer') {
      if (this.initiator || this.mode || this.local || !LOCAL_NAME.test(data.name)) return;
      if (this.openLocal(data.name)) this.local.postMessage({ t: 'probe' });
    } else if (data.kind === 'relay_request') {
      // The host agrees, and then follows the guest's first frame, as for the other transports.
      if (this.initiator || !this.relay || (this.mode && this.mode !== 'relay')) return;
      this.relayReady = true;
      this.onSignal({ kind: 'relay_ok' });
    } else if (data.kind === 'relay_ok') {
      if (!this.initiator || !this.relayRequested || this.mode) return;
      this.relayReady = true;
      this.select('relay');
    } else if (data.kind === 'relay_close') {
      if (this.mode === 'relay') this.close('peer_closed');
    } else await this.direct?.handleSignal(data);
  }

  /** Guest: ask the host to carry this link over the introduction service. */
  startRelay() {
    if (this.closed || this.mode || !this.initiator || !this.relay) return false;
    if (!this.relayRequested) {
      this.relayRequested = true;
      this.onSignal({ kind: 'relay_request' });
    }
    return true;
  }

  /** A frame that came through the relay. Ignored until both sides agreed to use it. */
  receiveRelay(text) {
    if (this.closed || !this.relayReady || typeof text !== 'string') return;
    this.receive('relay', text);
  }

  startLocal() {
    if (this.closed || this.mode || !this.initiator || !this.createChannel) return false;
    if (this.local) return true;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const name = `mc-local-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    if (!this.openLocal(name)) return false;
    this.onSignal({ kind: 'local_offer', name });
    return true;
  }

  openLocal(name) {
    if (!this.createChannel) return false;
    try { this.local = this.createChannel(name); } catch { this.createChannel = null; return false; }
    this.local.onmessage = ({ data }) => {
      if (this.closed || (this.mode && this.mode !== 'local') || !data || typeof data !== 'object') return;
      if (data.t === 'probe' && this.initiator) this.local.postMessage({ t: 'ack' });
      else if (data.t === 'ack' && !this.initiator) {
        this.localReady = true;
        this.local.postMessage({ t: 'ready' });
      } else if (data.t === 'ready' && this.initiator) {
        this.localReady = true;
        this.select('local');
      } else if (data.t === 'data' && this.localReady && typeof data.text === 'string') this.receive('local', data.text);
      else if (data.t === 'close' && this.mode === 'local') this.close('peer_closed');
    };
    return true;
  }

  select(mode) {
    if (this.closed || this.mode) return;
    this.mode = mode;
    clearTimeout(this.fallbackTimer);
    clearTimeout(this.relayTimer);
    if (mode !== 'webrtc') this.direct?.close(`${mode}_transport`);
    if (mode !== 'local') { this.local?.close(); this.local = null; }
    if (mode !== 'relay') this.relayReady = false;
    this.onopen?.();
  }

  receive(mode, text) {
    if (this.closed) return;
    if (!this.mode && !this.initiator) this.select(mode);
    if (this.mode === mode) this.onmessage?.(text);
  }

  send(text) {
    if (!this.isOpen || typeof text !== 'string') return false;
    if (this.mode === 'webrtc') return this.direct.send(text);
    if (this.mode === 'relay') { try { return this.relay.send(text) !== false; } catch { return false; } }
    try { this.local.postMessage({ t: 'data', text }); return true; } catch { return false; }
  }

  /** A task's worth of yielding, without background-tab setTimeout throttling. */
  yieldTask() {
    if (this.closed) return Promise.resolve();
    // Message tasks yield without background-tab setTimeout throttling: the host is normally in the other tab.
    // A timer per frame can otherwise turn a large snapshot into minutes of waiting in normal Chrome.
    if (!this.yieldChannel) {
      this.yieldWaiters = [];
      this.yieldChannel = new MessageChannel();
      this.yieldChannel.port1.onmessage = () => this.yieldWaiters.shift()?.();
    }
    return new Promise((resolve) => {
      this.yieldWaiters.push(resolve);
      this.yieldChannel.port2.postMessage(null);
    });
  }

  async drain() {
    if (this.mode === 'local') return this.yieldTask();
    if (this.mode !== 'relay') return this.direct?.drain() ?? undefined;
    // The socket queues what it cannot send yet; wait while that queue is long, so a large world is not all
    // buffered in memory at once.
    for (let waited = 0; !this.closed && (this.relay.bufferedAmount?.() ?? 0) > RELAY_HIGH_WATER && waited < 600; waited++) {
      await new Promise((resolve) => { const t = setTimeout(resolve, 25); t.unref?.(); });
    }
    return this.yieldTask();
  }

  getDiagnostics() {
    const direct = this.direct?.finalDiagnostics ?? this.direct?.getDiagnostics?.() ?? {};
    return {
      ...direct,
      transport: this.mode ?? 'pending',
      localChannelState: this.localReady ? 'ready' : this.local ? 'probing' : 'none',
      relayState: this.relayReady ? 'ready' : this.relayRequested ? 'requested' : this.relay ? 'available' : 'none',
    };
  }

  close(reason = 'closed') {
    if (this.closed) return;
    this.finalDiagnostics = { ...this.getDiagnostics(), closeReason: reason };
    const wasRelay = this.mode === 'relay';
    this.closed = true;
    clearTimeout(this.fallbackTimer);
    clearTimeout(this.relayTimer);
    for (const resolve of this.yieldWaiters ?? []) resolve();
    this.yieldWaiters = [];
    this.yieldChannel?.port1.close();
    this.yieldChannel?.port2.close();
    if (this.mode === 'local') { try { this.local.postMessage({ t: 'close' }); } catch { /* already gone */ } }
    if (wasRelay && reason !== 'peer_closed') { try { this.onSignal({ kind: 'relay_close' }); } catch { /* signaling gone */ } }
    this.relayReady = false;
    this.local?.close();
    this.direct?.close(reason);
    this.onclose?.(reason);
  }
}
