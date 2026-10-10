import { WorldRelayClient } from './worldRelayClient.js';
import { RemotePlayerManager } from './remotePlayerManager.js';
import { serializeWorld, deserializeWorldAsync } from '../mapManager.js';
import { BLOCKS } from '../blocks.js';

export class WorldSyncManager {
  constructor(game) {
    this.game = game;
    this.client = new WorldRelayClient();
    this.remotePlayers = new RemotePlayerManager(game);
    this.isHosting = false;
    this.isJoined = false;
    this.roomId = null;
    this.broadcastTimer = 0;

    // DOM Elements
    this.hostModal = document.getElementById('host-world-modal');
    this.hostRoomIdBadge = document.getElementById('host-room-id-badge');
    this.hostShareLinkInput = document.getElementById('host-share-link-input');
    this.btnCopyShareLink = document.getElementById('btn-copy-share-link');
    this.btnCloseHostWorld = document.getElementById('btn-close-host-world');
    this.btnDismissHostModal = document.getElementById('btn-dismiss-host-modal');
    this.hostConnectedList = document.getElementById('host-connected-players-list');

    this.joinOverlay = document.getElementById('join-connecting-overlay');
    this.joinProgressFill = document.getElementById('join-progress-fill');
    this.joinStatusText = document.getElementById('join-status-text');
    this.joinStatusSubtext = document.getElementById('join-status-subtext');
    this.btnJoinCancel = document.getElementById('btn-join-cancel');

    this.hudMultiplayerBadge = document.getElementById('hud-multiplayer-badge');
    this.hudMultiplayerText = document.getElementById('hud-multiplayer-text');

    this.btnHostWorldPause = document.getElementById('btn-host-world');
    this.btnStartHostWorld = document.getElementById('btn-start-host-world');

    this.wireClientEvents();
    this.wireUIEvents();
  }

  wireClientEvents() {
    this.client.on('request_snapshot', ({ targetPeerId, peerName }) => {
      console.log(`[Multiplayer] Snapshot requested by peer: ${peerName} (${targetPeerId})`);
      try {
        const mapData = serializeWorld(this.game, 'Hosted Multiplayer World');
        this.client.sendWorldSnapshot(targetPeerId, {
          mapData,
          hostPos: {
            x: Number(this.game.player.position.x.toFixed(3)),
            y: Number(this.game.player.position.y.toFixed(3)),
            z: Number(this.game.player.position.z.toFixed(3))
          },
          hostYaw: Number(this.game.player.yaw.toFixed(3))
        });
      } catch (err) {
        console.error('[Multiplayer] Failed to serialize world for guest:', err);
      }
    });

    this.client.on('peer_joined', ({ peerId, peerName, isHost }) => {
      this.remotePlayers.addPeer(peerId, peerName, isHost);
      this.game.ui?.addChatMessage?.(
        `<span style="color:#38bdf8;font-weight:bold;">✦ ${peerName} joined the world!</span>`
      );
      this.updateConnectedPlayersUI();
      this.updateHudBadge();
    });

    this.client.on('peer_left', ({ peerId, peerName }) => {
      this.remotePlayers.removePeer(peerId);
      this.game.ui?.addChatMessage?.(
        `<span style="color:#ef4444;">✦ ${peerName} left the world.</span>`
      );
      this.updateConnectedPlayersUI();
      this.updateHudBadge();
    });

    this.client.on('player_state', ({ peerId, state }) => {
      this.remotePlayers.updatePeerState(peerId, state);
    });

    this.client.on('block_update', ({ peerId, x, y, z, blockId }) => {
      this.game.world.setVoxel(x, y, z, blockId);
      const cx = Math.floor(x / 16);
      const cz = Math.floor(z / 16);
      const chunk = this.game.world.getChunk(cx, cz);
      if (chunk) {
        this.game.rebuildChunkMesh(chunk);
      }
      // Notify neighbor chunks if on border
      const lx = x & 15;
      const lz = z & 15;
      if (lx === 0) {
        const n = this.game.world.getChunk(cx - 1, cz);
        if (n) this.game.rebuildChunkMesh(n);
      } else if (lx === 15) {
        const n = this.game.world.getChunk(cx + 1, cz);
        if (n) this.game.rebuildChunkMesh(n);
      }
      if (lz === 0) {
        const n = this.game.world.getChunk(cx, cz - 1);
        if (n) this.game.rebuildChunkMesh(n);
      } else if (lz === 15) {
        const n = this.game.world.getChunk(cx, cz + 1);
        if (n) this.game.rebuildChunkMesh(n);
      }
    });

    this.client.on('chat', ({ sender, text }) => {
      if (sender !== this.client.playerName) {
        this.game.ui?.addChatMessage?.(
          `<span style="color:#38bdf8;font-weight:bold;">&lt;${sender}&gt;</span> ${text}`
        );
      }
    });

    this.client.on('host_disconnected', ({ message }) => {
      this.game.ui?.addChatMessage?.(
        `<span style="color:#ef4444;font-weight:bold;">⚠ ${message}</span>`
      );
      this.remotePlayers.clear();
      this.updateHudBadge();
    });
  }

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
      this.btnCopyShareLink.onclick = async () => {
        const link = this.hostShareLinkInput.value;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(link);
          } else {
            this.hostShareLinkInput.select();
            document.execCommand('copy');
          }
          const originalText = this.btnCopyShareLink.textContent;
          this.btnCopyShareLink.textContent = '✔ Copied!';
          this.btnCopyShareLink.style.background = '#10b981';
          setTimeout(() => {
            this.btnCopyShareLink.textContent = originalText;
            this.btnCopyShareLink.style.background = '';
          }, 2000);
        } catch (err) {
          console.warn('Copy link error:', err);
        }
      };
    }

    const closeHostModal = () => {
      if (this.hostModal) this.hostModal.classList.add('hidden');
    };
    if (this.btnCloseHostWorld) this.btnCloseHostWorld.onclick = closeHostModal;
    if (this.btnDismissHostModal) this.btnDismissHostModal.onclick = closeHostModal;
  }

  async hostWorld(playerName = 'Host') {
    if (!this.game.worldGenerated) {
      await this.game.generateNewWorld();
      const startOverlay = document.getElementById('start-overlay');
      if (startOverlay) startOverlay.style.display = 'none';
    }

    try {
      const data = await this.client.hostRoom(playerName, {
        seed: this.game.world.seed,
        worldTime: this.game.worldTime
      });

      this.isHosting = true;
      this.roomId = data.roomId;

      if (this.hostRoomIdBadge) this.hostRoomIdBadge.textContent = data.roomId;
      if (this.hostShareLinkInput) this.hostShareLinkInput.value = data.shareUrl;
      if (this.hostModal) this.hostModal.classList.remove('hidden');

      this.updateConnectedPlayersUI();
      this.updateHudBadge();

      this.game.ui?.addChatMessage?.(
        `<span style="color:#10b981;font-weight:bold;">🌐 World is now hosted! Share link with friends to play together.</span>`
      );
    } catch (err) {
      console.error('[Multiplayer] Failed to host world:', err);
      alert(`Could not host world: ${err.message}`);
    }
  }

  async joinWorld(roomId, playerName = 'Guest Player') {
    if (this.joinOverlay) {
      this.joinOverlay.classList.remove('hidden');
      if (this.joinStatusText) this.joinStatusText.textContent = `Connecting to world "${roomId}"...`;
      if (this.joinProgressFill) this.joinProgressFill.style.width = '30%';
    }

    const startOverlay = document.getElementById('start-overlay');
    if (startOverlay) startOverlay.style.display = 'none';

    try {
      // 1. Connect and join room
      const data = await this.client.joinRoom(roomId, playerName);
      this.roomId = data.roomId;
      this.isJoined = true;

      if (this.joinStatusText) this.joinStatusText.textContent = 'Connected to room! Requesting world terrain...';
      if (this.joinProgressFill) this.joinProgressFill.style.width = '55%';

      // 2. Await snapshot from host
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timed out waiting for world snapshot from host.'));
        }, 15000);

        this.client.on('world_snapshot', async ({ snapshot, fromPeerId }) => {
          clearTimeout(timeout);
          try {
            if (this.joinStatusText) this.joinStatusText.textContent = 'Synchronizing world blocks & chunks...';
            if (this.joinProgressFill) this.joinProgressFill.style.width = '80%';

            // Load world into game
            await deserializeWorldAsync(this.game, snapshot.mapData, {
              progress: (pct, stage) => {
                if (this.joinProgressFill) this.joinProgressFill.style.width = `${pct}%`;
                if (this.joinStatusSubtext) this.joinStatusSubtext.textContent = stage;
              }
            });

            // Set spawn position right near host
            if (snapshot.hostPos) {
              this.game.player.position.set(
                snapshot.hostPos.x + 1.2,
                snapshot.hostPos.y,
                snapshot.hostPos.z + 1.2
              );
              this.game.player.yaw = snapshot.hostYaw || 0;
            }

            this.game.worldGenerated = true;
            this.game.worldReady = true;

            // Add host avatar
            this.remotePlayers.addPeer(fromPeerId, 'Host', true);

            resolve();
          } catch (loadErr) {
            reject(loadErr);
          }
        });
      });

      if (this.joinProgressFill) this.joinProgressFill.style.width = '100%';
      if (this.joinOverlay) this.joinOverlay.classList.add('hidden');

      this.updateHudBadge();
      this.game.ui?.addChatMessage?.(
        `<span style="color:#10b981;font-weight:bold;">🌐 Joined world "${roomId}"! Welcome!</span>`
      );
    } catch (err) {
      console.error('[Multiplayer] Join world failed:', err);
      if (this.joinStatusText) this.joinStatusText.textContent = `Join failed: ${err.message}`;
      if (this.joinProgressFill) this.joinProgressFill.style.background = '#ef4444';
      if (this.btnJoinCancel) {
        this.btnJoinCancel.classList.remove('hidden');
        this.btnJoinCancel.onclick = () => {
          if (this.joinOverlay) this.joinOverlay.classList.add('hidden');
          if (startOverlay) startOverlay.style.display = 'flex';
        };
      }
    }
  }

  updateConnectedPlayersUI() {
    if (!this.hostConnectedList) return;
    this.hostConnectedList.innerHTML = '';

    // Add Host
    const hostEl = document.createElement('div');
    hostEl.style.cssText = 'font-size: 12px; color: #94a3b8; display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.3); padding: 5px 8px; border-radius: 4px;';
    hostEl.innerHTML = `<span>★ ${this.isHosting ? 'You (Host)' : 'Host'}</span><span style="color: #38bdf8; font-size: 11px; font-weight: bold;">HOST</span>`;
    this.hostConnectedList.appendChild(hostEl);

    // Add other peers
    for (const peer of this.client.peers.values()) {
      if (peer.isHost) continue;
      const peerEl = document.createElement('div');
      peerEl.style.cssText = 'font-size: 12px; color: #f1f5f9; display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.25); padding: 5px 8px; border-radius: 4px;';
      peerEl.innerHTML = `<span>👤 ${peer.name}</span><span style="color: #10b981; font-size: 11px;">CONNECTED</span>`;
      this.hostConnectedList.appendChild(peerEl);
    }
  }

  updateHudBadge() {
    if (!this.hudMultiplayerBadge) return;
    const totalCount = this.client.peers.size || 1;
    if (this.client.connected) {
      this.hudMultiplayerBadge.classList.remove('hidden');
      if (this.hudMultiplayerText) {
        this.hudMultiplayerText.textContent = `Multiplayer: ${totalCount} Player${totalCount > 1 ? 's' : ''}`;
      }
    } else {
      this.hudMultiplayerBadge.classList.add('hidden');
    }
  }

  onBlockPlaced(x, y, z, blockId) {
    if (this.client.connected) {
      this.client.sendBlockUpdate(x, y, z, blockId);
    }
  }

  onBlockBroken(x, y, z) {
    if (this.client.connected) {
      this.client.sendBlockUpdate(x, y, z, BLOCKS.AIR);
    }
  }

  onChatSent(text) {
    if (this.client.connected) {
      this.client.sendChat(text, this.client.playerName);
    }
  }

  update(dt) {
    this.remotePlayers.update(dt);

    if (this.client.connected && this.game.player) {
      this.broadcastTimer += dt;
      // Transmit at 25Hz (every 40ms)
      if (this.broadcastTimer >= 0.04) {
        this.broadcastTimer = 0;
        this.client.sendPlayerState({
          x: Number(this.game.player.position.x.toFixed(3)),
          y: Number(this.game.player.position.y.toFixed(3)),
          z: Number(this.game.player.position.z.toFixed(3)),
          yaw: Number(this.game.player.yaw.toFixed(3)),
          pitch: Number(this.game.player.pitch.toFixed(3)),
          isSneaking: this.game.player.isSneaking,
          isSprinting: this.game.player.isSprinting,
          isSwinging: this.game.isMouseDown || false,
          activeItem: this.game.inventory?.getActiveItem()?.id || null
        });
      }
    }
  }
}
