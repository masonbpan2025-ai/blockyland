// A shared world: one host, a few guests, and no server in between.
//
// The host's browser IS the server. It holds the world, accepts guests, assigns each an identity, checks what they send,
// and passes it on to the others. Guests connect only to the host, never to each other, so there is exactly one
// authority and one set of rules. The two sides use WebRTC, with a BroadcastChannel fallback for local tabs; the introduction service
// (server/shareRendezvous.js) is used once, to set the connection up, and is not involved after that.
//
//   guest                      introduction service                 host
//     | -- join(room) ----------------> |                             |
//     | -- offer ---------------------> | ------------------------->  |
//     | <------------------ answer ---- | <---------------------------|
//     | <================ direct data channel ========================> |
//     | -- hello ------------------------------------------------->   |
//     | <---------------------------------------- welcome, snapshot -- |
//
// Events (same names the game already listened for): room_hosted, room_joined, peer_joined, peer_left, request_snapshot,
// world_snapshot, player_state, block_update, chat, host_disconnected, signalling_lost, error, disconnect, and for PvP:
// hurt (this player was hit by another) and settings (the host changed a setting, such as whether PvP is on).
import { ShareError, SignalingClient, resolveSignalingUrl } from './signaling.js';
import { ResilientPeerLink } from './resilientPeerLink.js';
import { generateRoomCode, normalizeRoomCode, isValidRoomCode, buildShareUrl } from './shareCode.js';
import {
  PROTOCOL_VERSION, MAX_PLAYERS, GUEST_TO_HOST, HOST_TO_GUEST, FrameReassembler, ProtocolError, encodeFrames,
  packSnapshot, unpackSnapshot, sanitizeName, sanitizeChat, sanitizePlayerState, sanitizeBlockUpdate, guestLimiters,
  sanitizeAttack, refuseAttack, sanitizeShareSettings, MAX_ATTACK_DAMAGE, sanitizeGameData, sanitizeContainer, sanitizeSkin,
} from './shareProtocol.js';

const HOST_ID = 'host';

export const DEFAULT_TIMEOUTS = Object.freeze({
  /** A guest has this long to get from "joined the room" to "talking to the host". */
  connectMs: 25_000,
  heartbeatMs: 5_000,
  /** A peer that has said nothing for this long is gone. */
  silenceMs: 20_000,
  /** Retry delay when the introduction service drops while hosting. */
  resignalMs: 3_000,
});

export class ShareSession {
  /**
   * @param {object} [options]
   * @param {object} [options.timeouts]
   * @param {(url: string) => object} [options.signalingFactory]
   * @param {(options: object) => object} [options.peerFactory]
   * @param {(id: number) => boolean} [options.isBlockId] whether a block id exists; the game passes its own table
   * @param {() => number} [options.now]
   * @param {RTCIceServer[]} [options.iceServers]
   * @param {{href: string, protocol: string, host: string, search: string}} [options.location]
   */
  constructor(options = {}) {
    this.options = options;
    this.timeouts = { ...DEFAULT_TIMEOUTS, ...(options.timeouts ?? {}) };
    this.now = options.now ?? (() => Date.now());
    this.listeners = new Map();
    this.signalingFactory = options.signalingFactory ?? ((url) => new SignalingClient({ url }));
    this.peerFactory = options.peerFactory ?? ((o) => new ResilientPeerLink({ ...o, ...(options.iceServers ? { iceServers: options.iceServers } : {}) }));
    this.resetState();
  }

  resetState() {
    this.roomId = null;
    this.clientId = null;
    this.hostId = null;
    this.playerName = 'Player';
    this.isHost = false;
    this.connected = false;
    this.peers = new Map(); // id -> { id, name, isHost }
    this.signaling = null;
    this.worldInfo = {};
    /** The host's choices (shareProtocol.js DEFAULT_SHARE_SETTINGS): the host's own, or as the host last sent them. */
    this.settings = sanitizeShareSettings(null);
    /** Host: where each player last said it was, by id. The host judges every attack by these, not by what a guest claims. */
    this.positions = new Map();
    /** Each player's skin, by id (`{png, model}`): the host keeps everyone's, so a newcomer sees them all at once. */
    this.skins = new Map();
    /** This player's own skin, sent when connected and whenever it changes. */
    this.mySkin = this.mySkin ?? null;
    // host side
    this.links = new Map(); // signalId -> entry (pending and ready)
    this.guests = new Map(); // peerId -> entry (ready)
    this.peerSeq = 0;
    // guest side
    this.hostLink = null;
    this.hostFrames = null;
    this.hostLastSeen = 0;
    this.heartbeat = null;
    this.resignalTimer = null;
    this.lastJoinDiagnostics = null;
    this.stopping = false;
  }

  // --- events ------------------------------------------------------------------------------

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event, data) {
    for (const handler of this.listeners.get(event) ?? []) {
      try { handler(data); } catch (error) { console.error(`[share] listener for ${event} failed`, error); }
    }
  }

  get location() {
    return this.options.location ?? (typeof window !== 'undefined' ? window.location : { href: 'http://localhost:3000/', protocol: 'http:', host: 'localhost:3000', search: '' });
  }

  /** The link a host sends to friends. */
  getShareUrl(roomId = this.roomId) {
    const loc = this.location;
    // A custom introduction service chosen with ?signal= travels with the link, so guests use the same one.
    const signal = new URLSearchParams(loc.search ?? '').get('signal');
    return buildShareUrl(loc.href, roomId, signal ? { signal } : {});
  }

  signalUrl() {
    return resolveSignalingUrl(this.location);
  }

  // --- sending helpers ---------------------------------------------------------------------

  /** Send one message over a link, in frames when it is long. Resolves false if the link is not open. */
  async sendText(link, text) {
    const frames = encodeFrames(text);
    for (const frame of frames) {
      if (!link.send(frame)) return false;
      if (frames.length > 1) await link.drain();
    }
    return true;
  }

  send(link, message) {
    return this.sendText(link, JSON.stringify(message));
  }

  broadcast(message, exceptPeerId = null) {
    const text = JSON.stringify(message);
    for (const [peerId, entry] of this.guests) {
      if (peerId !== exceptPeerId) void this.sendText(entry.link, text);
    }
  }

  // ===========================================================================================
  // Hosting
  // ===========================================================================================

  /**
   * Start sharing the world: register a room and return its code and link.
   * @returns {Promise<{roomId: string, clientId: string, shareUrl: string}>}
   */
  async hostRoom(playerName = 'Host', worldInfo = {}) {
    this.disconnect(true);
    this.resetState();
    this.isHost = true;
    this.playerName = sanitizeName(playerName, 'Host');
    this.worldInfo = worldInfo;
    this.settings = sanitizeShareSettings(worldInfo?.settings);
    this.emit('settings', { ...this.settings });
    // Four digits: another host may hold the code drawn, so a taken one is drawn again (shareCode.js).
    let roomId;
    for (let attempt = 1; ; attempt++) {
      roomId = generateRoomCode(this.options.fillRandom);
      try { await this.registerRoom(roomId); break; } catch (error) {
        if (error?.code !== 'room_taken' || attempt >= 10) throw error;
      }
    }
    this.roomId = roomId;
    this.clientId = HOST_ID;
    this.hostId = HOST_ID;
    this.connected = true;
    this.peers.set(HOST_ID, { id: HOST_ID, name: this.playerName, isHost: true });
    this.startHeartbeat();
    const data = { roomId, clientId: HOST_ID, shareUrl: this.getShareUrl(roomId) };
    this.emit('room_hosted', data);
    return data;
  }

  async registerRoom(roomId) {
    const signaling = this.signalingFactory(this.signalUrl());
    try {
      await signaling.connect();
      await signaling.host(roomId);
    } catch (error) {
      // A refused code (taken, or the service full) leaves the connection open but useless.
      try { signaling.close?.(); } catch { /* already closed */ }
      throw error;
    }
    this.signaling = signaling;
    signaling.on('signal', ({ from, data }) => this.onGuestSignal(from, data));
    // Frames of guests whose networks could not connect directly come through the service (resilientPeerLink.js).
    signaling.on('relay', ({ from, data }) => this.links.get(from)?.link.receiveRelay?.(data));
    signaling.on('guest_left', ({ guestId }) => {
      // A guest that never finished connecting is simply dropped; one that did is handled by its link closing --
      // except a relayed one, whose link is this service.
      const entry = this.links.get(guestId);
      if (entry && (!entry.ready || entry.link.mode === 'relay')) this.dropGuest(entry, 'left');
    });
    signaling.on('close', () => this.onSignalingClosed(roomId));
  }

  /**
   * The introduction service dropped. Guests already connected are unaffected -- they talk to the host directly -- but
   * nobody new can join until the room is registered again, so try that.
   */
  onSignalingClosed(roomId) {
    if (this.stopping || !this.isHost || !this.connected) return;
    this.signaling = null;
    this.emit('signalling_lost', { roomId });
    const attempt = async (left) => {
      if (this.stopping || !this.connected) return;
      try {
        await this.registerRoom(roomId);
        this.emit('signalling_restored', { roomId });
      } catch {
        if (left > 1) {
          this.resignalTimer = setTimeout(() => attempt(left - 1), this.timeouts.resignalMs);
          this.resignalTimer.unref?.();
        }
      }
    };
    this.resignalTimer = setTimeout(() => attempt(5), this.timeouts.resignalMs);
    this.resignalTimer.unref?.();
  }

  onGuestSignal(signalId, data) {
    if (this.stopping || !data || typeof data !== 'object') return;
    let entry = this.links.get(signalId);
    if (!entry) {
      if (data.kind !== 'offer' && data.kind !== 'local_offer' && data.kind !== 'relay_request') return;
      if (this.peers.size + this.links.size - this.guests.size >= MAX_PLAYERS) {
        this.signaling?.signal({ kind: 'reject', code: 'room_full' }, signalId);
        return;
      }
      entry = this.createGuestEntry(signalId);
    }
    entry.link.handleSignal(data).catch(() => this.dropGuest(entry, 'bad_signal'));
  }

  createGuestEntry(signalId) {
    const entry = {
      signalId, peerId: null, name: null, ready: false, strikes: 0,
      limiters: guestLimiters(this.now), frames: new FrameReassembler(), lastSeen: this.now(), timer: null,
      link: this.peerFactory({
        initiator: false,
        onSignal: (data) => this.signaling?.signal(data, signalId),
        relay: { send: (text) => this.signaling?.relay?.(text, signalId) ?? false, bufferedAmount: () => this.signaling?.bufferedAmount?.() ?? 0 },
      }),
    };
    entry.link.onmessage = (frame) => this.onGuestFrame(entry, frame);
    entry.link.onclose = (reason) => this.dropGuest(entry, reason);
    // A connection that never gets as far as saying hello is dropped, so strangers cannot hold places.
    entry.timer = setTimeout(() => { if (!entry.ready) this.dropGuest(entry, 'handshake_timeout'); }, this.timeouts.connectMs);
    entry.timer.unref?.();
    this.links.set(signalId, entry);
    return entry;
  }

  strike(entry) {
    if (++entry.strikes > 20) this.dropGuest(entry, 'misbehaving');
  }

  onGuestFrame(entry, frame) {
    let text;
    try { text = entry.frames.push(frame); } catch (error) { if (error instanceof ProtocolError) this.dropGuest(entry, 'protocol'); return; }
    if (text === null) return;
    entry.lastSeen = this.now();
    if (!entry.limiters.any.take()) return;
    let msg;
    try { msg = JSON.parse(text); } catch { this.strike(entry); return; }
    if (!msg || typeof msg !== 'object' || !GUEST_TO_HOST.includes(msg.t)) { this.strike(entry); return; }

    if (!entry.ready) {
      if (msg.t === 'hello') this.acceptHello(entry, msg);
      else this.strike(entry);
      return;
    }

    switch (msg.t) {
      case 'ping': void this.send(entry.link, { t: 'pong' }); break;
      case 'pong': break;
      case 'hello': this.strike(entry); break;
      case 'player_state': {
        if (!entry.limiters.state.take()) break;
        const state = sanitizePlayerState(msg.state);
        if (!state) { this.strike(entry); break; }
        this.positions.set(entry.peerId, state);
        this.emit('player_state', { peerId: entry.peerId, state });
        this.broadcast({ t: 'player_state', peerId: entry.peerId, state }, entry.peerId);
        break;
      }
      case 'block_update': {
        if (!entry.limiters.block.take()) break;
        const block = sanitizeBlockUpdate(msg, { isBlockId: this.options.isBlockId });
        if (!block) { this.strike(entry); break; }
        this.emit('block_update', { peerId: entry.peerId, ...block, playerName: entry.name });
        this.broadcast({ t: 'block_update', peerId: entry.peerId, ...block }, entry.peerId);
        break;
      }
      case 'chat': {
        if (!entry.limiters.chat.take()) break;
        const text = sanitizeChat(msg.text);
        if (text === null) break;
        // The sender is who the host knows this guest to be, never a name the guest claims for itself.
        this.emit('chat', { peerId: entry.peerId, sender: entry.name, text });
        this.broadcast({ t: 'chat', peerId: entry.peerId, sender: entry.name, text }, entry.peerId);
        break;
      }
      case 'attack': {
        if (!entry.limiters.attack.take()) break;
        const attack = sanitizeAttack(msg);
        if (!attack) { this.strike(entry); break; }
        this.deliverAttack(entry.peerId, entry.name, attack);
        break;
      }
      case 'game': {
        // For the world's own game (a mod), which decides what the data means. It is not passed on.
        if (!entry.limiters.game.take()) break;
        const data = sanitizeGameData(msg.data);
        if (!data) { this.strike(entry); break; }
        this.emit('game', { peerId: entry.peerId, data });
        break;
      }
      case 'container': {
        if (!entry.limiters.container.take()) break;
        const container = sanitizeContainer(msg);
        if (!container) { this.strike(entry); break; }
        this.emit('container', { peerId: entry.peerId, ...container });
        this.broadcast({ t: 'container', ...container }, entry.peerId);
        break;
      }
      case 'skin': {
        if (!entry.limiters.skin.take()) break;
        const skin = sanitizeSkin(msg);
        if (!skin) { this.strike(entry); break; }
        this.skins.set(entry.peerId, skin);
        this.emit('skin', { peerId: entry.peerId, ...skin });
        this.broadcast({ t: 'skin', peerId: entry.peerId, ...skin }, entry.peerId);
        break;
      }
      default: break;
    }
  }

  uniqueName(wanted) {
    const taken = new Set([...this.peers.values()].map((p) => p.name.toLowerCase()));
    if (!taken.has(wanted.toLowerCase())) return wanted;
    for (let n = 2; n < 100; n++) {
      const candidate = `${wanted.slice(0, 20)} (${n})`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${wanted.slice(0, 16)} ${this.peerSeq + 1}`;
  }

  acceptHello(entry, msg) {
    if (msg.protocol !== PROTOCOL_VERSION) {
      void this.send(entry.link, { t: 'error', code: 'version_mismatch', message: 'This world was shared from a different version of the game. Ask for a fresh link.' })
        .then(() => this.dropGuest(entry, 'version_mismatch'));
      return;
    }
    if (this.peers.size >= MAX_PLAYERS) {
      void this.send(entry.link, { t: 'error', code: 'room_full', message: 'This world is full.' }).then(() => this.dropGuest(entry, 'room_full'));
      return;
    }
    clearTimeout(entry.timer);
    entry.name = this.uniqueName(sanitizeName(msg.name, 'Guest'));
    entry.peerId = `p${++this.peerSeq}`;
    entry.ready = true;
    this.guests.set(entry.peerId, entry);
    this.peers.set(entry.peerId, { id: entry.peerId, name: entry.name, isHost: false });
    void this.send(entry.link, {
      t: 'welcome', protocol: PROTOCOL_VERSION, roomId: this.roomId,
      you: { id: entry.peerId, name: entry.name },
      host: { id: HOST_ID, name: this.playerName },
      peers: [...this.peers.values()],
      worldInfo: this.worldInfo,
      settings: this.settings,
    });
    this.broadcast({ t: 'peer_joined', peerId: entry.peerId, peerName: entry.name }, entry.peerId);
    // The skins of everyone already here, the host's included.
    if (this.mySkin) void this.send(entry.link, { t: 'skin', peerId: HOST_ID, ...this.mySkin });
    for (const [peerId, skin] of this.skins) if (peerId !== entry.peerId) void this.send(entry.link, { t: 'skin', peerId, ...skin });
    this.emit('peer_joined', { peerId: entry.peerId, peerName: entry.name, isHost: false });
    this.emit('request_snapshot', { targetPeerId: entry.peerId, peerName: entry.name });
  }

  dropGuest(entry, reason = 'closed') {
    if (entry.dropped) return;
    entry.dropped = true;
    clearTimeout(entry.timer);
    this.links.delete(entry.signalId);
    try { entry.link.close(reason); } catch { /* already closed */ }
    if (!entry.ready) return;
    this.guests.delete(entry.peerId);
    this.peers.delete(entry.peerId);
    this.positions.delete(entry.peerId);
    this.skins.delete(entry.peerId);
    this.broadcast({ t: 'peer_left', peerId: entry.peerId, peerName: entry.name });
    this.emit('peer_left', { peerId: entry.peerId, peerName: entry.name, reason });
  }

  /** Host: send the world to one guest. The snapshot is compressed, then sent in frames. */
  async sendWorldSnapshot(targetPeerId, snapshot) {
    const entry = this.guests.get(targetPeerId);
    if (!entry) return false;
    const packed = await packSnapshot(snapshot);
    return this.send(entry.link, { t: 'snapshot', packed });
  }

  // ===========================================================================================
  // Joining
  // ===========================================================================================

  /**
   * Join a shared world by its code.
   * @returns {Promise<{roomId: string, clientId: string, hostId: string, peers: object[]}>}
   * @throws {ShareError} with a `code` the interface turns into a sentence
   */
  async joinRoom(code, playerName = 'Player') {
    const room = normalizeRoomCode(code);
    if (!isValidRoomCode(room)) throw new ShareError('bad_code', 'That link does not contain a valid world code.');
    this.disconnect(true);
    this.resetState();
    this.isHost = false;
    this.playerName = sanitizeName(playerName, 'Player');
    this.roomId = room;

    const signaling = this.signalingFactory(this.signalUrl());
    this.signaling = signaling;
    let fail;
    const failed = new Promise((_, reject) => { fail = reject; });
    failed.catch(() => {}); // a rejection nobody raced against is not an unhandled one

    try {
      await signaling.connect();
      await signaling.join(room);
      const link = this.peerFactory({
        initiator: true,
        onSignal: (data) => signaling.signal(data),
        relay: { send: (text) => signaling.relay?.(text) ?? false, bufferedAmount: () => signaling.bufferedAmount?.() ?? 0 },
      });
      this.hostLink = link;
      this.hostFrames = new FrameReassembler();

      let welcomed;
      const welcome = new Promise((resolve) => { welcomed = resolve; });
      this.welcomed = welcomed;

      signaling.on('signal', ({ data }) => {
        if (data?.kind === 'reject') fail(new ShareError(data.code ?? 'rejected', data.code === 'room_full' ? 'This world is full.' : 'The host did not accept the connection.'));
        else link.handleSignal(data).catch(() => fail(new ShareError('connect_failed', 'The connection to the host could not be set up.')));
      });
      signaling.on('relay', ({ data }) => link.receiveRelay?.(data));
      // After joining, the service matters only to a relayed link, which goes when it goes.
      signaling.on('host_left', () => {
        if (!this.connected) fail(new ShareError('room_not_found', 'The host closed the world before you could join.'));
        else if (link.mode === 'relay') this.hostGone('The host closed the world.');
      });
      signaling.on('close', () => {
        if (!this.connected) fail(new ShareError('signalling_unreachable', 'The connection to the sharing service was lost.'));
        else if (link.mode === 'relay') this.hostGone('Lost the connection to the host.');
      });
      link.onmessage = (frame) => this.onHostFrame(frame, fail);
      link.onopen = () => { void this.send(link, { t: 'hello', protocol: PROTOCOL_VERSION, name: this.playerName }); };
      link.onclose = (reason) => {
        if (!this.connected) fail(new ShareError('connect_failed', reason === 'ice_failed'
          ? 'A direct connection to the host could not be made. Some networks block peer-to-peer connections.'
          : 'The connection to the host closed before it was ready.'));
        else this.hostGone('Lost the connection to the host.');
      };

      const timer = setTimeout(() => fail(new ShareError('connect_timeout',
        'Could not make a direct connection to the host. Some networks block peer-to-peer connections; trying another network can help.')), this.timeouts.connectMs);
      timer.unref?.();
      try {
        await link.start();
        const data = await Promise.race([welcome, failed]);
        // From here two browsers that connected directly do not need the introduction service any more. A relayed
        // link still goes through it.
        if (link.mode !== 'relay') {
          signaling.close();
          this.signaling = null;
        }
        this.startHeartbeat();
        return data;
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      this.lastJoinDiagnostics = this.hostLink?.finalDiagnostics ?? this.hostLink?.getDiagnostics?.() ?? null;
      if (this.lastJoinDiagnostics) console.info('[Sharing] connection diagnostics', this.lastJoinDiagnostics);
      this.cleanupFailedJoin();
      throw error instanceof ShareError ? error : new ShareError('connect_failed', error?.message ?? 'Could not join that world.');
    }
  }

  cleanupFailedJoin() {
    try { this.hostLink?.close('join_failed'); } catch { /* closed */ }
    try { this.signaling?.close(); } catch { /* closed */ }
    this.hostLink = null;
    this.signaling = null;
    this.connected = false;
  }

  onHostFrame(frame, fail) {
    let text;
    try { text = this.hostFrames.push(frame); } catch { this.hostGone('The host sent something this version cannot read.'); return; }
    if (text === null) return;
    this.hostLastSeen = this.now();
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    if (!msg || typeof msg.t !== 'string' || !HOST_TO_GUEST.includes(msg.t)) return;

    switch (msg.t) {
      case 'welcome': {
        if (this.connected) break;
        if (msg.protocol !== PROTOCOL_VERSION) { fail(new ShareError('version_mismatch', 'This world was shared from a different version of the game. Ask for a fresh link.')); break; }
        this.clientId = String(msg.you?.id ?? '');
        this.hostId = String(msg.host?.id ?? HOST_ID);
        this.peers.clear();
        for (const p of Array.isArray(msg.peers) ? msg.peers.slice(0, MAX_PLAYERS) : []) {
          if (p && typeof p.id === 'string') this.peers.set(p.id, { id: p.id, name: sanitizeName(p.name), isHost: p.id === this.hostId });
        }
        this.peers.set(this.clientId, { id: this.clientId, name: sanitizeName(msg.you?.name, this.playerName), isHost: false });
        this.playerName = this.peers.get(this.clientId).name;
        this.connected = true;
        this.worldInfo = msg.worldInfo && typeof msg.worldInfo === 'object' ? msg.worldInfo : {};
        this.settings = sanitizeShareSettings(msg.settings);
        this.emit('settings', { ...this.settings });
        const data = { roomId: this.roomId, clientId: this.clientId, hostId: this.hostId, peers: [...this.peers.values()] };
        this.emit('room_joined', data);
        this.welcomed?.(data);
        break;
      }
      case 'error':
        if (!this.connected) fail(new ShareError(String(msg.code ?? 'error'), String(msg.message ?? 'The host refused the connection.')));
        else this.emit('error', { message: String(msg.message ?? 'Error from the host.') });
        break;
      case 'snapshot':
        unpackSnapshot(msg.packed).then(
          (snapshot) => this.emit('world_snapshot', { snapshot, fromPeerId: this.hostId, bytes: msg.packed?.data?.length ?? 0 }),
          () => this.emit('error', { message: 'The world the host sent could not be read.' }),
        );
        break;
      case 'peer_joined': {
        if (!this.connected || typeof msg.peerId !== 'string') break;
        const peerName = sanitizeName(msg.peerName);
        this.peers.set(msg.peerId, { id: msg.peerId, name: peerName, isHost: false });
        this.emit('peer_joined', { peerId: msg.peerId, peerName, isHost: false });
        break;
      }
      case 'peer_left': {
        if (typeof msg.peerId !== 'string') break;
        const known = this.peers.get(msg.peerId);
        this.peers.delete(msg.peerId);
        this.emit('peer_left', { peerId: msg.peerId, peerName: known?.name ?? sanitizeName(msg.peerName) });
        break;
      }
      case 'player_state': {
        const state = sanitizePlayerState(msg.state);
        if (state && typeof msg.peerId === 'string') this.emit('player_state', { peerId: msg.peerId, state });
        break;
      }
      case 'skin': {
        const skin = sanitizeSkin(msg);
        if (skin && typeof msg.peerId === 'string' && msg.peerId !== this.clientId) {
          this.skins.set(msg.peerId, skin);
          this.emit('skin', { peerId: msg.peerId, ...skin });
        }
        break;
      }
      case 'block_update': {
        const block = sanitizeBlockUpdate(msg, { isBlockId: this.options.isBlockId });
        if (block && typeof msg.peerId === 'string') this.emit('block_update', { peerId: msg.peerId, ...block, playerName: this.peers.get(msg.peerId)?.name });
        break;
      }
      case 'chat': {
        const text = sanitizeChat(msg.text);
        if (text !== null && typeof msg.peerId === 'string') this.emit('chat', { peerId: msg.peerId, sender: sanitizeName(msg.sender), text });
        break;
      }
      case 'ping': if (this.hostLink) void this.send(this.hostLink, { t: 'pong' }); break;
      case 'host_closing': this.hostGone('The host closed the world.'); break;
      case 'settings': {
        this.settings = sanitizeShareSettings(msg.settings);
        this.emit('settings', { ...this.settings });
        break;
      }
      case 'game': {
        const data = sanitizeGameData(msg.data);
        if (data) this.emit('game', { peerId: this.hostId, data });
        break;
      }
      case 'container': {
        const container = sanitizeContainer(msg);
        if (container) this.emit('container', { peerId: this.hostId, ...container });
        break;
      }
      case 'time_sync': {
        const time = Number(msg.worldTime);
        if (Number.isFinite(time)) {
          this.emit('time_sync', { worldTime: ((time % 24000) + 24000) % 24000 });
        }
        break;
      }
      case 'peer_hurt': {
        if (typeof msg.peerId === 'string') {
          const from = msg.from && [msg.from.x, msg.from.y, msg.from.z].every(Number.isFinite) ? { x: msg.from.x, y: msg.from.y, z: msg.from.z } : null;
          const damage = Number(msg.damage);
          this.emit('peer_hurt', {
            peerId: msg.peerId,
            attackerName: sanitizeName(msg.attackerName),
            from,
            isCritical: Boolean(msg.isCritical),
            isSprint: Boolean(msg.isSprint),
            damage: damage > 0 && damage <= MAX_ATTACK_DAMAGE ? damage : 0,
          });
        }
        break;
      }
      case 'hurt': {
        // The host has judged the hit already; this only refuses a malformed one, or one while PvP is off here.
        if (!this.settings.pvp) break;
        const damage = Number(msg.damage);
        if (!(damage > 0 && damage <= MAX_ATTACK_DAMAGE)) break;
        const from = msg.from && [msg.from.x, msg.from.y, msg.from.z].every(Number.isFinite)
          ? { x: msg.from.x, y: msg.from.y, z: msg.from.z, ...(Number.isFinite(msg.from.yaw) ? { yaw: msg.from.yaw } : {}) } : null;
        const level = (v, max) => (Number.isInteger(v) && v > 0 ? Math.min(max, v) : 0);
        this.emit('hurt', {
          knockbackLevel: level(msg.knockbackLevel, 3),
          fireAspect: level(msg.fireAspect, 2),
          attackerId: String(msg.attackerId ?? ''),
          attackerName: sanitizeName(msg.attackerName),
          damage,
          from,
          isCritical: Boolean(msg.isCritical),
          isSprint: Boolean(msg.isSprint),
          weapon: typeof msg.weapon === 'string' ? msg.weapon : null,
        });
        break;
      }
      default: break;
    }
  }

  /** Guest: the host is no longer there. */
  hostGone(message) {
    if (!this.connected || this.stopping) return;
    this.connected = false;
    this.stopHeartbeat();
    try { this.hostLink?.close('host_gone'); } catch { /* closed */ }
    this.hostLink = null;
    this.peers.clear();
    this.emit('host_disconnected', { message });
  }

  // ===========================================================================================
  // Keeping everyone in step
  // ===========================================================================================

  startHeartbeat() {
    this.stopHeartbeat();
    this.hostLastSeen = this.now();
    this.heartbeat = setInterval(() => this.beat(), this.timeouts.heartbeatMs);
    this.heartbeat.unref?.();
  }

  stopHeartbeat() {
    clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  beat() {
    const now = this.now();
    if (this.isHost) {
      this.broadcast({ t: 'ping' });
      for (const entry of [...this.guests.values()]) {
        if (now - entry.lastSeen > this.timeouts.silenceMs) this.dropGuest(entry, 'timeout');
      }
    } else if (this.hostLink) {
      void this.send(this.hostLink, { t: 'ping' });
      if (now - this.hostLastSeen > this.timeouts.silenceMs) this.hostGone('Lost the connection to the host.');
    }
  }

  // ===========================================================================================
  // What the game sends
  // ===========================================================================================

  /** Share this player's pose and held item. */
  sendPlayerState(state) {
    if (!this.connected) return;
    if (this.isHost) this.positions.set(HOST_ID, state);
    if (this.isHost) this.broadcast({ t: 'player_state', peerId: HOST_ID, state });
    else if (this.hostLink) void this.send(this.hostLink, { t: 'player_state', state });
  }

  // --- players attacking players ------------------------------------------------------------

  /**
   * Attack another player. A guest asks the host; the host decides, for its own hits as for its guests'.
   * @returns {string|null} why it was refused here (on a guest, only that PvP is off), or null when sent
   */
  attackPlayer(targetId, damage, options = {}) {
    if (!this.connected) return 'not_connected';
    const attack = sanitizeAttack({ target: targetId, damage, ...options });
    if (!attack) return 'bad_attack';
    if (this.isHost) return this.deliverAttack(HOST_ID, this.playerName, attack);
    if (!this.settings.pvp) return 'pvp_off';
    if (this.hostLink) void this.send(this.hostLink, { t: 'attack', ...attack });
    return null;
  }

  /**
   * Host: judge an attack (refuseAttack) and hand a hit that lands to its target: the host's own player through the
   * 'hurt' event, a guest by message. The attacker's position goes with it, so the target is knocked away from it.
   * @returns {string|null} why it was refused, or null when it landed
   */
  deliverAttack(attackerId, attackerName, attack) {
    const { target, damage } = attack;
    if (!this.peers.has(target)) return 'bad_target';
    const attackerPos = this.positions.get(attackerId);
    const reason = refuseAttack({ settings: this.settings, attackerId, targetId: target, attackerPos, targetPos: this.positions.get(target) })
      // The world's own game may refuse more: nobody fights in a lobby, and a spectator neither hits nor is hit.
      ?? this.attackPolicy?.(attackerId, target) ?? null;
    if (reason) return reason;
    const hit = {
      attackerId,
      attackerName,
      damage,
      // Where the attacker stood and faced: a hit pushes away from it, and a sprint or Knockback hit along its facing.
      from: { x: attackerPos.x, y: attackerPos.y, z: attackerPos.z, ...(Number.isFinite(attackerPos.yaw) ? { yaw: attackerPos.yaw } : {}) },
      isCritical: Boolean(attack.isCritical),
      isSprint: Boolean(attack.isSprint),
      weapon: attack.weapon || null,
      knockbackLevel: attack.knockbackLevel ?? 0,
      fireAspect: attack.fireAspect ?? 0,
    };
    this.emit('attack_landed', { attackerId, targetId: target, damage });
    if (target === HOST_ID) this.emit('hurt', hit);
    else {
      const entry = this.guests.get(target);
      if (!entry) return 'bad_target';
      void this.send(entry.link, { t: 'hurt', ...hit });
    }
    // Everyone else sees the hit land: the red flash and the damage hearts (the attacker shows its own at once).
    const seen = { peerId: target, attackerId, attackerName, from: hit.from, isCritical: hit.isCritical, isSprint: hit.isSprint, damage };
    for (const [peerId, entry] of this.guests) {
      if (peerId !== target && peerId !== attackerId) void this.send(entry.link, { t: 'peer_hurt', ...seen });
    }
    if (target !== HOST_ID && attackerId !== HOST_ID) this.emit('peer_hurt', seen);
    return null;
  }

  /** Host: turn PvP on or off, and tell everyone. */
  setPvp(on) {
    this.settings = { ...this.settings, pvp: Boolean(on) };
    if (this.isHost && this.connected) this.broadcast({ t: 'settings', settings: this.settings });
    this.emit('settings', { ...this.settings });
  }

  /**
   * A message of the world's own game (a mod). The host sends to one guest (`to`) or to all; a guest always to the
   * host. Data only, and small (shareProtocol.js sanitizeGameData).
   * @returns {boolean} whether it went
   */
  sendGame(data, to = null) {
    if (!this.connected) return false;
    const clean = sanitizeGameData(data);
    if (!clean) return false;
    if (!this.isHost) { if (this.hostLink) void this.send(this.hostLink, { t: 'game', data: clean }); return Boolean(this.hostLink); }
    if (to) { const entry = this.guests.get(to); if (!entry) return false; void this.send(entry.link, { t: 'game', data: clean }); return true; }
    this.broadcast({ t: 'game', data: clean });
    return true;
  }

  /** One chest's new contents, for everyone else: a guest tells the host, which tells the rest. */
  sendContainer(x, y, z, items) {
    if (!this.connected) return false;
    const container = sanitizeContainer({ x, y, z, items });
    if (!container) return false;
    if (this.isHost) this.broadcast({ t: 'container', ...container });
    else if (this.hostLink) void this.send(this.hostLink, { t: 'container', ...container });
    return true;
  }

  /**
   * This player's skin, for everyone else: a guest tells the host, which tells the rest (and every later arrival).
   * Kept, so it can be sent again when this player connects. `skin` is `{png, model}` (shareProtocol.js sanitizeSkin).
   * @returns {boolean} whether it went
   */
  sendSkin(skin) {
    const clean = sanitizeSkin(skin);
    if (!clean) return false;
    this.mySkin = clean;
    if (!this.connected) return false;
    if (this.isHost) this.broadcast({ t: 'skin', peerId: HOST_ID, ...clean });
    else if (this.hostLink) void this.send(this.hostLink, { t: 'skin', ...clean });
    return true;
  }

  /** Host: broadcast current world time to all guests. */
  sendTimeSync(worldTime) {
    if (!this.connected || !this.isHost) return;
    this.broadcast({ t: 'time_sync', worldTime: Number(worldTime) });
  }

  /** Share a placed or broken block. */
  sendBlockUpdate(x, y, z, blockId) {
    if (!this.connected) return;
    if (this.isHost) this.broadcast({ t: 'block_update', peerId: HOST_ID, x, y, z, blockId });
    else if (this.hostLink) void this.send(this.hostLink, { t: 'block_update', x, y, z, blockId });
  }

  /** Say something to everyone. */
  sendChat(text) {
    if (!this.connected) return;
    const clean = sanitizeChat(text);
    if (clean === null) return;
    if (this.isHost) this.broadcast({ t: 'chat', peerId: HOST_ID, sender: this.playerName, text: clean });
    else if (this.hostLink) void this.send(this.hostLink, { t: 'chat', text: clean });
  }

  /**
   * Stop sharing, or leave a world you joined.
   * @param {boolean} [quiet] do not announce it (used when starting a new session over an old one)
   */
  disconnect(quiet = false) {
    const wasActive = this.connected || this.signaling || this.hostLink || this.guests.size;
    if (!wasActive) return;
    this.stopping = true;
    // Cleared first: closing the host link fires its close handler, which must not announce a host that we left.
    this.connected = false;
    this.stopHeartbeat();
    clearTimeout(this.resignalTimer);
    if (this.isHost) {
      this.broadcast({ t: 'host_closing' });
      for (const entry of [...this.links.values()]) {
        entry.dropped = true;
        clearTimeout(entry.timer);
        // Give the goodbye a moment to leave before the channel closes.
        setTimeout(() => { try { entry.link.close('host_closed'); } catch { /* closed */ } }, 50).unref?.();
      }
    }
    try { this.hostLink?.close('left'); } catch { /* closed */ }
    try { this.signaling?.close(); } catch { /* closed */ }
    this.links.clear();
    this.guests.clear();
    this.peers.clear();
    this.hostLink = null;
    this.signaling = null;
    this.roomId = null;
    this.stopping = false;
    if (!quiet) this.emit('disconnect', { reason: 'left' });
  }
}
