// The game's side of sharing a world: the dialogs, the link, and keeping the shared world in step.
//
// All of the networking is in `ShareSession`. This connects it to the game: it serialises the world for a joining guest,
// applies other players' block edits and movement, shows who is here, and turns failures into sentences a person can act on.
import { ShareSession } from './shareSession.js';
import { parseIceServers, ICE_STORAGE_KEY } from './peerLink.js';
import { RemotePlayerManager } from './remotePlayerManager.js';
import { ShareError } from './signaling.js';
import { serializeWorld, deserializeWorldAsync } from '../mapManager.js';
import { BLOCKS, BLOCK_DEFS } from '../blocks.js';
import { buildShareUrl, isLocalOnlyAddress, parseJoinCode } from './shareCode.js';
import { escapeHtml, sanitizeName, MAX_PLAYERS } from './shareProtocol.js';

const NAME_KEY = 'mc-player-name';

/** The player's own STUN/TURN servers, from `window.MC_ICE_SERVERS` or local storage, when they have set any. */
export function configuredIceServers() {
  let stored = null;
  try { stored = globalThis.localStorage?.getItem(ICE_STORAGE_KEY); } catch { /* storage blocked */ }
  return parseIceServers(globalThis.window?.MC_ICE_SERVERS) ?? parseIceServers(stored) ?? undefined;
}

/** What a failure means for the person, and what they can do about it. */
export function describeShareError(error) {
  const code = error instanceof ShareError ? error.code : null;
  switch (code) {
    case 'room_not_found': return 'That world is not being shared right now. Ask your friend to make sure they are still in it, and to send the link again.';
    case 'bad_code': return 'That link does not contain a valid world code. Ask your friend to copy it again.';
    case 'room_full': return `That world is full (${MAX_PLAYERS} players). Try again when someone leaves.`;
    case 'room_busy': return 'Too many people are joining at once. Try again in a moment.';
    case 'version_mismatch': return 'Your friend is on a different version of the game. Ask them to share a fresh link.';
    case 'signalling_unreachable': return 'Could not reach the sharing service. Check your connection, and that this page was opened from the same place as the link.';
    case 'connect_timeout': return 'Could not make a direct connection to the host. Some networks (offices, schools, some mobile networks) block peer-to-peer connections. Try a different network.';
    case 'connect_failed': return error.message || 'The connection to the host could not be made.';
    default: return error?.message || 'Something went wrong while joining.';
  }
}

export class WorldSyncManager {
  /**
   * @param {object} game
   * @param {object} [options] seams for tests: a ready-made session, and the functions that save and load a world
   */
  constructor(game, options = {}) {
    this.game = game;
    this.client = options.session ?? new ShareSession({
      isBlockId: (id) => Number.isInteger(id) && (id === BLOCKS.AIR || Boolean(BLOCK_DEFS[id])),
      iceServers: configuredIceServers(),
    });
    this.serialize = options.serialize ?? serializeWorld;
    this.deserialize = options.deserialize ?? deserializeWorldAsync;
    this.remotePlayers = new RemotePlayerManager(game);
    this.isHosting = false;
    this.isJoined = false;
    this.roomId = null;
    this.shareUrl = null;
    this.broadcastTimer = 0;

    const $ = (id) => document.getElementById(id);
    this.hostModal = $('host-world-modal');
    this.hostRoomIdBadge = $('host-room-id-badge');
    this.hostShareLinkInput = $('host-share-link-input');
    this.btnCopyShareLink = $('btn-copy-share-link');
    this.btnCloseHostWorld = $('btn-close-host-world');
    this.btnDismissHostModal = $('btn-dismiss-host-modal');
    this.btnStopSharing = $('btn-stop-sharing');
    this.hostConnectedList = $('host-connected-players-list');
    this.hostLocalWarning = $('host-local-warning');
    this.hostLanLinks = $('host-lan-links');
    this.hostNotice = $('host-status-notice');
    this.hostNoticeText = $('host-status-text');
    this.hostError = $('host-error');
    this.hostLinkSection = $('host-link-section');

    this.joinOverlay = $('join-connecting-overlay');
    this.joinOverlayTitle = $('join-overlay-title');
    this.joinProgressFill = $('join-progress-fill');
    this.joinStatusText = $('join-status-text');
    this.joinStatusSubtext = $('join-status-subtext');
    this.btnJoinCancel = $('btn-join-cancel');

    this.hudBadge = $('hud-multiplayer-badge');
    this.hudText = $('hud-multiplayer-text');

    this.btnHostWorldPause = $('btn-host-world');
    this.btnStartHostWorld = $('btn-start-host-world');

    this.wireClientEvents();
    this.wireUIEvents();
  }

  // --- who the player is ----------------------------------------------------------------------

  /** The name this player goes by: remembered between sessions, or a friendly default. */
  playerName() {
    let stored = null;
    try { stored = globalThis.localStorage?.getItem(NAME_KEY); } catch { /* storage blocked */ }
    if (stored) return sanitizeName(stored);
    const generated = `Player-${Math.floor(1000 + Math.random() * 9000)}`;
    try { globalThis.localStorage?.setItem(NAME_KEY, generated); } catch { /* storage blocked */ }
    return generated;
  }

  // --- the network's events -------------------------------------------------------------------

  chat(html) {
    this.game.ui?.addChatMessage?.(html);
  }

  wireClientEvents() {
    this.client.on('request_snapshot', ({ targetPeerId, peerName }) => {
      // The world is serialised on the host's machine and sent to the one guest that asked, in compressed pieces.
      setTimeout(async () => {
        try {
          const t0 = performance.now();
          const mapData = this.serialize(this.game, 'Shared World');
          const serializeMs = Math.round(performance.now() - t0);
          const p = this.game.player;
          /** How long the host was busy for a joining friend: the part that blocks the game is `serializeMs`. */
          this.snapshotTimings = { serializeMs };
          await this.client.sendWorldSnapshot(targetPeerId, {
            mapData,
            hostPos: { x: Number(p.position.x.toFixed(3)), y: Number(p.position.y.toFixed(3)), z: Number(p.position.z.toFixed(3)) },
            hostYaw: Number(p.yaw.toFixed(3)),
          });
          this.snapshotTimings.totalMs = Math.round(performance.now() - t0);
          console.info(`[Sharing] sent the world to ${peerName}`, this.snapshotTimings);
        } catch (error) {
          console.error(`[Sharing] could not send the world to ${peerName}:`, error);
        }
      }, 0);
    });

    this.client.on('peer_joined', ({ peerId, peerName, isHost }) => {
      this.remotePlayers.addPeer(peerId, peerName, isHost);
      this.chat(`<span style="color:#38bdf8;font-weight:bold;">✦ ${escapeHtml(peerName)} joined the world!</span>`);
      this.refreshPeople();
    });

    this.client.on('peer_left', ({ peerId, peerName }) => {
      this.remotePlayers.removePeer(peerId);
      this.chat(`<span style="color:#ef4444;">✦ ${escapeHtml(peerName)} left the world.</span>`);
      this.refreshPeople();
    });

    this.client.on('player_state', ({ peerId, state }) => {
      this.remotePlayers.updatePeerState(peerId, state);
    });

    this.client.on('block_update', ({ x, y, z, blockId }) => this.applyRemoteBlock(x, y, z, blockId));

    this.client.on('chat', ({ peerId, sender, text }) => {
      if (peerId === this.client.clientId) return;
      this.chat(`<span style="color:#38bdf8;font-weight:bold;">&lt;${escapeHtml(sender)}&gt;</span> ${escapeHtml(text)}`);
    });

    this.client.on('host_disconnected', ({ message }) => {
      this.remotePlayers.clear();
      this.isJoined = false;
      this.refreshPeople();
      this.showEnded(message);
    });

    this.client.on('signalling_lost', () => {
      this.setHostNotice('Reconnecting to the sharing service. Friends already here are not affected, but nobody new can join until it is back.', '#f59e0b');
    });
    this.client.on('signalling_restored', () => {
      this.setHostNotice('Your world is live. Anyone opening the link will join it.', '#10b981');
    });

    this.client.on('error', ({ message }) => {
      this.chat(`<span style="color:#f59e0b;">⚠ ${escapeHtml(message)}</span>`);
    });
  }

  /** Apply another player's block edit to this world, and redraw what it touches. */
  applyRemoteBlock(x, y, z, blockId) {
    const world = this.game.world;
    world.setVoxel(x, y, z, blockId);
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    const rebuild = (chunkX, chunkZ) => {
      const chunk = world.getChunk(chunkX, chunkZ);
      if (chunk) this.game.rebuildChunkMesh(chunk);
    };
    rebuild(cx, cz);
    // An edit on a chunk's edge changes the face its neighbour draws.
    const lx = x & 15;
    const lz = z & 15;
    if (lx === 0) rebuild(cx - 1, cz); else if (lx === 15) rebuild(cx + 1, cz);
    if (lz === 0) rebuild(cx, cz - 1); else if (lz === 15) rebuild(cx, cz + 1);
  }

  // --- the dialogs ----------------------------------------------------------------------------

  wireUIEvents() {
    if (this.btnHostWorldPause) {
      this.btnHostWorldPause.onclick = () => {
        this.game.ui?.closeAllModals?.();
        this.hostWorld();
      };
    }

    if (this.btnStartHostWorld) {
      this.btnStartHostWorld.onclick = async () => {
        if (!this.game.worldGenerated) {
          const startOverlay = document.getElementById('start-overlay');
          if (startOverlay) startOverlay.style.display = 'none';
          await this.game.generateNewWorld();
        }
        this.hostWorld();
      };
    }

    if (this.btnCopyShareLink && this.hostShareLinkInput) {
      this.btnCopyShareLink.onclick = () => this.copy(this.hostShareLinkInput.value, this.btnCopyShareLink);
    }

    const closeHostModal = () => { if (this.hostModal) this.hostModal.classList.add('hidden'); };
    if (this.btnCloseHostWorld) this.btnCloseHostWorld.onclick = closeHostModal;
    if (this.btnDismissHostModal) this.btnDismissHostModal.onclick = closeHostModal;
    if (this.btnStopSharing) this.btnStopSharing.onclick = () => { this.leave(); closeHostModal(); };
    if (this.hudBadge) this.hudBadge.onclick = () => { if (this.isHosting) this.showHostModal(); };

    if (typeof window !== 'undefined') {
      // Closing the tab should tell everyone, rather than leaving them to notice the silence.
      window.addEventListener('pagehide', () => this.client.disconnect(true));
    }
  }

  async copy(text, button) {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const field = document.createElement('textarea');
        field.value = text;
        document.body.appendChild(field);
        field.select();
        document.execCommand('copy');
        field.remove();
      }
      const original = button.textContent;
      button.textContent = '✔ Copied!';
      setTimeout(() => { button.textContent = original; }, 2000);
    } catch (error) {
      console.warn('[Sharing] could not copy the link:', error);
    }
  }

  setHostNotice(text, color = '#10b981') {
    if (this.hostNoticeText) this.hostNoticeText.textContent = text;
    if (this.hostNotice) this.hostNotice.style.color = color;
  }

  showHostModal() {
    if (this.hostModal) this.hostModal.classList.remove('hidden');
    this.refreshPeople();
  }

  // --- hosting --------------------------------------------------------------------------------

  /** Start sharing this world, or show the link again when it is already shared. */
  async hostWorld() {
    if (!this.game.worldGenerated) {
      await this.game.generateNewWorld();
      const startOverlay = document.getElementById('start-overlay');
      if (startOverlay) startOverlay.style.display = 'none';
    }
    if (this.isHosting) { this.showHostModal(); return; }

    if (this.hostError) this.hostError.classList.add('hidden');
    try {
      const data = await this.client.hostRoom(this.playerName(), { seed: this.game.world.seed, worldTime: this.game.worldTime });
      this.isHosting = true;
      this.roomId = data.roomId;
      this.shareUrl = data.shareUrl;
      this.presentLink(data);
      this.showHostModal();
      this.refreshPeople();
      this.chat('<span style="color:#10b981;font-weight:bold;">🌐 Your world is shared. Send the link to friends; keep this tab open while they play.</span>');
    } catch (error) {
      console.error('[Sharing] could not start sharing:', error);
      this.showHostError(describeShareError(error));
    }
  }

  showHostError(message) {
    if (this.hostLinkSection) this.hostLinkSection.classList.add('hidden');
    if (this.hostError) {
      this.hostError.textContent = message;
      this.hostError.classList.remove('hidden');
    }
    if (this.hostModal) this.hostModal.classList.remove('hidden');
  }

  presentLink({ roomId, shareUrl }) {
    if (this.hostLinkSection) this.hostLinkSection.classList.remove('hidden');
    if (this.hostRoomIdBadge) this.hostRoomIdBadge.textContent = roomId;
    if (this.hostShareLinkInput) this.hostShareLinkInput.value = shareUrl;
    this.setHostNotice('Your world is live. Anyone opening the link will join it.');
    // Only this computer can open a localhost address, so say so, and offer the addresses that a friend could use.
    const local = isLocalOnlyAddress(shareUrl);
    if (this.hostLocalWarning) this.hostLocalWarning.classList.toggle('hidden', !local);
    void this.loadNetworkLinks(roomId, shareUrl, local);
  }

  /** The addresses other computers on this network can reach the game at, each as a ready link. */
  async loadNetworkLinks(roomId, shareUrl, local) {
    if (!this.hostLanLinks) return;
    this.hostLanLinks.replaceChildren();
    let info;
    try {
      const response = await fetch('/api/share/info');
      if (!response.ok) return;
      info = await response.json();
    } catch {
      return;
    }
    const signal = new URL(shareUrl).searchParams.get('signal');
    // On a public address the link already works for everyone; on localhost, the network links are the useful ones.
    if (!local || !info?.lan?.length) return;
    const heading = document.createElement('div');
    heading.textContent = 'For friends on the same Wi-Fi or network:';
    heading.style.cssText = 'font-size:12px;color:#94a3b8;margin:4px 0;';
    this.hostLanLinks.appendChild(heading);
    for (const lan of info.lan) {
      const link = buildShareUrl(lan.url, roomId, signal ? { signal } : {});
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px;';
      const text = document.createElement('input');
      text.type = 'text';
      text.readOnly = true;
      text.value = link;
      text.className = 'mc-input-text';
      text.style.cssText = 'flex:1;font-family:monospace;font-size:12px;background:#090d16;padding:6px 8px;';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mc-btn';
      button.textContent = '📋';
      button.title = 'Copy this link';
      button.onclick = () => this.copy(link, button);
      row.append(text, button);
      this.hostLanLinks.appendChild(row);
    }
  }

  // --- joining --------------------------------------------------------------------------------

  setJoinStatus(title, percent, text, subtext = '') {
    if (this.joinOverlay) this.joinOverlay.classList.remove('hidden');
    if (this.joinOverlayTitle) this.joinOverlayTitle.textContent = title;
    if (this.joinProgressFill) {
      this.joinProgressFill.style.width = `${percent}%`;
      this.joinProgressFill.style.background = '';
    }
    if (this.joinStatusText) this.joinStatusText.textContent = text;
    if (this.joinStatusSubtext) this.joinStatusSubtext.textContent = subtext;
    if (this.btnJoinCancel) this.btnJoinCancel.classList.add('hidden');
  }

  /** A join that cannot continue: say why, and offer the way back. */
  showJoinFailure(message) {
    this.setJoinStatus('🌐 Could not join', 100, message);
    if (this.joinProgressFill) this.joinProgressFill.style.background = '#ef4444';
    this.offerWayBack();
  }

  /** The host has gone: a world you joined does not outlive its host. */
  showEnded(message) {
    this.setJoinStatus('🌐 The world was closed', 100, message, 'Your own worlds are untouched.');
    if (this.joinProgressFill) this.joinProgressFill.style.background = '#f59e0b';
    this.offerWayBack();
  }

  offerWayBack() {
    if (!this.btnJoinCancel) return;
    this.btnJoinCancel.textContent = 'Back to Main';
    this.btnJoinCancel.classList.remove('hidden');
    this.btnJoinCancel.onclick = () => {
      this.leave();
      this.joinOverlay?.classList.add('hidden');
      document.getElementById('btn-title-screen')?.click();
      // Back to Main is only wired once the pause menu exists; if it is not there yet, show the start screen.
      const start = document.getElementById('start-overlay');
      if (start) start.style.display = 'flex';
      // A link's code is spent once the player chooses to leave, so a reload does not try to join again.
      try { history.replaceState(null, '', location.pathname); } catch { /* not allowed here */ }
    };
  }

  /**
   * Join the world a page's address names. A link with no usable code says so rather than doing nothing.
   * @param {string} search `location.search`
   */
  joinFromLink(search) {
    const code = parseJoinCode(search);
    if (!code) {
      this.showJoinFailure(describeShareError(new ShareError('bad_code', 'bad code')));
      return Promise.resolve();
    }
    return this.joinWorld(code);
  }

  /**
   * Join the world a link names.
   * Everything the player sees is on the join overlay: finding the host, connecting, receiving the world.
   */
  async joinWorld(roomId, playerName = this.playerName()) {
    const started = performance.now();
    /** How long each stage of a join took, in milliseconds, kept for diagnosis and for the tests. */
    this.joinTimings = {};
    const mark = (stage) => { this.joinTimings[stage] = Math.round(performance.now() - started); };
    this.setJoinStatus('🌐 Joining a shared world', 15, 'Finding the host…', 'Connecting through the sharing service.');
    const startOverlay = document.getElementById('start-overlay');
    if (startOverlay) startOverlay.style.display = 'none';

    // The host sends the world the moment this player says hello, so listen for it before joining.
    let offSnapshot = () => {};
    let timer;
    const snapshot = new Promise((resolve, reject) => {
      const settle = (fn) => (value) => { clearTimeout(timer); fn(value); };
      offSnapshot = this.client.on('world_snapshot', settle(resolve));
      const offError = this.client.on('error', ({ message }) => { offError(); settle(reject)(new Error(message)); });
      const offGone = this.client.on('host_disconnected', ({ message }) => { offGone(); settle(reject)(new ShareError('host_left', message)); });
      timer = setTimeout(() => reject(new ShareError('connect_timeout', 'The host did not send the world in time.')), 90_000);
      timer.unref?.();
    });
    snapshot.catch(() => {}); // handled where it is awaited

    try {
      const joined = await this.client.joinRoom(roomId, playerName);
      mark('connected');
      this.roomId = joined.roomId;
      this.isJoined = true;
      this.setJoinStatus('🌐 Joining a shared world', 45, 'Connected directly to the host. Receiving the world…', 'This can take a few seconds for a large world.');

      const { snapshot: data, bytes } = await snapshot;
      mark('received');
      this.joinTimings.snapshotBytes = bytes;
      this.setJoinStatus('🌐 Joining a shared world', 70, 'Building the world…');
      await this.deserialize(this.game, data.mapData, {
        progress: (percent, stage) => this.setJoinStatus('🌐 Joining a shared world', Math.max(70, Math.min(99, percent)), 'Building the world…', stage),
      });

      if (data.hostPos) {
        this.game.player.position.set(data.hostPos.x + 1.2, data.hostPos.y, data.hostPos.z + 1.2);
        this.game.player.yaw = data.hostYaw || 0;
      }
      this.game.worldGenerated = true;
      this.game.worldReady = true;
      this.game.worldType = 'shared';
      mark('built');
      console.info('[Sharing] joined in', this.joinTimings);

      // Everyone already here, not only the host.
      for (const peer of this.client.peers.values()) {
        if (peer.id !== this.client.clientId) this.remotePlayers.addPeer(peer.id, peer.name, peer.isHost);
      }
      if (this.joinOverlay) this.joinOverlay.classList.add('hidden');
      this.refreshPeople();
      this.chat(`<span style="color:#10b981;font-weight:bold;">🌐 You joined ${escapeHtml(this.client.peers.get('host')?.name ?? 'a')}'s world. Welcome!</span>`);
    } catch (error) {
      console.error('[Sharing] could not join:', error);
      this.client.disconnect(true);
      this.isJoined = false;
      this.showJoinFailure(describeShareError(error));
    } finally {
      offSnapshot();
    }
  }

  // --- leaving --------------------------------------------------------------------------------

  /** Stop sharing, or leave the world you joined, and forget everyone. */
  leave() {
    this.client.disconnect(true);
    this.remotePlayers.clear();
    this.isHosting = false;
    this.isJoined = false;
    this.roomId = null;
    this.shareUrl = null;
    this.hostModal?.classList.add('hidden');
    this.refreshPeople();
  }

  // --- what is on screen ----------------------------------------------------------------------

  refreshPeople() {
    this.updateConnectedPlayersUI();
    this.updateHudBadge();
  }

  updateConnectedPlayersUI() {
    if (!this.hostConnectedList) return;
    this.hostConnectedList.replaceChildren();
    const row = (label, tag, color, background) => {
      const el = document.createElement('div');
      el.style.cssText = `font-size:12px;color:#f1f5f9;display:flex;align-items:center;justify-content:space-between;background:${background};padding:5px 8px;border-radius:4px;`;
      const name = document.createElement('span');
      name.textContent = label; // text, never markup: a name comes from another player
      const state = document.createElement('span');
      state.textContent = tag;
      state.style.cssText = `color:${color};font-size:11px;font-weight:bold;`;
      el.append(name, state);
      this.hostConnectedList.appendChild(el);
    };
    row(`★ ${this.isHosting ? 'You (Host)' : (this.client.peers.get('host')?.name ?? 'Host')}`, 'HOST', '#38bdf8', 'rgba(0,0,0,0.3)');
    for (const peer of this.client.peers.values()) {
      if (peer.isHost) continue;
      row(`👤 ${peer.id === this.client.clientId ? `${peer.name} (you)` : peer.name}`, 'CONNECTED', '#10b981', 'rgba(0,0,0,0.25)');
    }
  }

  updateHudBadge() {
    if (!this.hudBadge) return;
    const count = this.client.peers.size || 1;
    if (this.client.connected) {
      this.hudBadge.classList.remove('hidden');
      this.hudBadge.style.cursor = this.isHosting ? 'pointer' : 'default';
      if (this.hudText) this.hudText.textContent = `${this.isHosting ? 'Sharing' : 'Joined'}: ${count} player${count > 1 ? 's' : ''}`;
    } else {
      this.hudBadge.classList.add('hidden');
    }
  }

  // --- what the game tells us -----------------------------------------------------------------

  onBlockPlaced(x, y, z, blockId) {
    if (this.client.connected) this.client.sendBlockUpdate(x, y, z, blockId);
  }

  onBlockBroken(x, y, z) {
    if (this.client.connected) this.client.sendBlockUpdate(x, y, z, BLOCKS.AIR);
  }

  onChatSent(text) {
    if (this.client.connected) this.client.sendChat(text);
  }

  update(dt) {
    this.remotePlayers.update(dt);
    // With nobody else here there is nobody to tell.
    if (!this.client.connected || !this.game.player || this.client.peers.size < 2) return;
    this.broadcastTimer += dt;
    if (this.broadcastTimer < 0.04) return; // 25 updates a second
    this.broadcastTimer = 0;
    const p = this.game.player;
    this.client.sendPlayerState({
      x: Number(p.position.x.toFixed(3)),
      y: Number(p.position.y.toFixed(3)),
      z: Number(p.position.z.toFixed(3)),
      yaw: Number(p.yaw.toFixed(3)),
      pitch: Number(p.pitch.toFixed(3)),
      isSneaking: Boolean(p.isSneaking),
      isSprinting: Boolean(p.isSprinting),
      isSwinging: Boolean(this.game.isMouseDown),
      activeItem: this.game.inventory?.getActiveItem()?.id || null,
    });
  }
}
