/**
 * WorldRelayClient
 * Handles bidirectional client-to-host and client-to-peer networking for
 * hosting a Minecraft world and letting other players join via shared link.
 */

export class WorldRelayClient {
  constructor(options = {}) {
    this.ws = null;
    this.bc = null;
    this.roomId = null;
    this.clientId = null;
    this.playerName = 'Player';
    this.isHost = false;
    this.connected = false;
    this.peers = new Map(); // peerId -> { id, name, isHost }
    this.listeners = new Map();
    this.wsUrl = options.wsUrl || null;
    this.reconnectAttempts = 0;
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(handler);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const handler of this.listeners.get(event)) {
        try { handler(data); } catch (e) { console.error(`[WorldRelayClient] Error in listener for ${event}:`, e); }
      }
    }
  }

  getShareUrl(roomId = this.roomId) {
    if (typeof window === 'undefined') return `http://localhost:3000/?join=${roomId}`;
    const url = new URL(window.location.href);
    url.searchParams.set('join', roomId);
    return url.href;
  }

  _resolveWsUrl() {
    if (this.wsUrl) return this.wsUrl;
    if (typeof window === 'undefined') return 'ws://127.0.0.1:3000/ws/world-relay';
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws/world-relay`;
  }

  _setupBroadcastChannel(roomId) {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      if (this.bc) this.bc.close();
      this.bc = new BroadcastChannel(`mc_world_sync_${roomId}`);
      this.bc.onmessage = (event) => {
        const msg = event.data;
        if (!msg || msg.senderId === this.clientId) return;
        this._handlePacket(msg, 'broadcast');
      };
    } catch (e) {
      console.warn('[WorldRelayClient] BroadcastChannel unavailable:', e);
    }
  }

  _broadcastLocal(payload) {
    if (this.bc) {
      try {
        this.bc.postMessage({ ...payload, senderId: this.clientId });
      } catch (e) {
        console.warn('[WorldRelayClient] BC postMessage error:', e);
      }
    }
  }

  _sendWs(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
        return true;
      } catch (e) {
        console.warn('[WorldRelayClient] WS send error:', e);
      }
    }
    return false;
  }

  _handlePacket(data, source = 'ws') {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'room_hosted':
        this.roomId = data.roomId;
        this.clientId = data.clientId;
        this.isHost = true;
        this.connected = true;
        this.peers.set(this.clientId, { id: this.clientId, name: this.playerName, isHost: true });
        this.emit('room_hosted', {
          roomId: this.roomId,
          clientId: this.clientId,
          shareUrl: this.getShareUrl(this.roomId)
        });
        break;

      case 'room_joined':
        this.roomId = data.roomId;
        this.clientId = data.clientId;
        this.isHost = false;
        this.connected = true;
        this.peers.clear();
        if (data.peers) {
          for (const p of data.peers) {
            this.peers.set(p.id, p);
          }
        }
        this.peers.set(this.clientId, { id: this.clientId, name: this.playerName, isHost: false });
        this.emit('room_joined', {
          roomId: this.roomId,
          clientId: this.clientId,
          hostId: data.hostId,
          peers: Array.from(this.peers.values())
        });
        break;

      case 'peer_joined':
        this.peers.set(data.peerId, { id: data.peerId, name: data.peerName, isHost: !!data.isHost });
        this.emit('peer_joined', {
          peerId: data.peerId,
          peerName: data.peerName,
          isHost: !!data.isHost
        });
        break;

      case 'peer_left':
        const leavingPeer = this.peers.get(data.peerId);
        this.peers.delete(data.peerId);
        this.emit('peer_left', {
          peerId: data.peerId,
          peerName: data.peerName || leavingPeer?.name || 'Player'
        });
        break;

      case 'request_snapshot':
        this.emit('request_snapshot', {
          targetPeerId: data.targetPeerId,
          peerName: data.peerName
        });
        break;

      case 'world_snapshot':
        this.emit('world_snapshot', {
          snapshot: data.snapshot,
          fromPeerId: data.fromPeerId
        });
        break;

      case 'player_state':
        this.emit('player_state', {
          peerId: data.peerId,
          state: data.state
        });
        break;

      case 'block_update':
        this.emit('block_update', {
          peerId: data.peerId,
          x: data.x,
          y: data.y,
          z: data.z,
          blockId: data.blockId,
          playerName: data.playerName
        });
        break;

      case 'chat':
        this.emit('chat', {
          peerId: data.peerId,
          sender: data.sender,
          text: data.text
        });
        break;

      case 'host_disconnected':
        this.emit('host_disconnected', {
          message: data.message || 'Host has disconnected from the room.'
        });
        break;

      case 'error':
        this.emit('error', { message: data.message });
        break;

      case 'relay_event':
        this.emit('relay_event', {
          peerId: data.peerId,
          event: data.event,
          payload: data.payload
        });
        break;
    }
  }

  async _connectSocket() {
    return new Promise((resolve, reject) => {
      const url = this._resolveWsUrl();
      let socket;
      try {
        socket = new WebSocket(url);
      } catch (err) {
        return reject(err);
      }

      this.ws = socket;

      let timer = null;
      socket.onopen = () => {
        if (timer) clearTimeout(timer);
        this.reconnectAttempts = 0;
        resolve(socket);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this._handlePacket(data, 'ws');
        } catch (e) {
          console.error('[WorldRelayClient] Message parse error:', e);
        }
      };

      socket.onerror = (error) => {
        if (timer) clearTimeout(timer);
        this.emit('ws_error', error);
      };

      socket.onclose = (event) => {
        if (timer) clearTimeout(timer);
        this.connected = false;
        this.emit('disconnect', { code: event.code, reason: event.reason });
      };

      // Timeout connection after 6 seconds
      timer = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          try { socket.close(); } catch {}
          reject(new Error('Connection to world relay timed out.'));
        }
      }, 6000);
      if (timer.unref) timer.unref();
    });
  }

  /**
   * Host a world room and obtain a shareable join link.
   */
  async hostRoom(playerName = 'Host', worldInfo = {}) {
    this.playerName = playerName || 'Host';
    const roomId = 'world-' + Math.random().toString(36).substring(2, 8);
    this.roomId = roomId;
    this._setupBroadcastChannel(roomId);

    try {
      await this._connectSocket();
      this._sendWs({
        type: 'host_room',
        roomId,
        playerName: this.playerName,
        worldInfo
      });
    } catch (wsErr) {
      console.warn('[WorldRelayClient] WS connect failed, falling back to local BroadcastChannel:', wsErr);
      // Fallback for offline / direct tab testing
      this.clientId = 'host_' + Math.random().toString(36).substring(2, 8);
      this.isHost = true;
      this.connected = true;
      this.peers.set(this.clientId, { id: this.clientId, name: this.playerName, isHost: true });
      setTimeout(() => {
        this.emit('room_hosted', {
          roomId,
          clientId: this.clientId,
          shareUrl: this.getShareUrl(roomId)
        });
      }, 50);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Hosting world timed out.'));
      }, 10000);

      this.on('room_hosted', (data) => {
        clearTimeout(timer);
        resolve(data);
      });
      this.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(err.message));
      });
    });
  }

  /**
   * Join an existing hosted world room by room ID.
   */
  async joinRoom(roomId, playerName = 'Player 2') {
    if (!roomId) throw new Error('Missing room ID to join.');
    this.roomId = roomId.trim().toLowerCase();
    this.playerName = playerName || 'Player 2';
    this._setupBroadcastChannel(this.roomId);

    try {
      await this._connectSocket();
      this._sendWs({
        type: 'join_room',
        roomId: this.roomId,
        playerName: this.playerName
      });
    } catch (wsErr) {
      console.warn('[WorldRelayClient] WS join failed, using local BroadcastChannel:', wsErr);
      this.clientId = 'guest_' + Math.random().toString(36).substring(2, 8);
      this.isHost = false;
      this.connected = true;
      this._broadcastLocal({
        type: 'peer_joined',
        peerId: this.clientId,
        peerName: this.playerName,
        isHost: false
      });
      this._broadcastLocal({
        type: 'request_snapshot',
        targetPeerId: this.clientId,
        peerName: this.playerName
      });
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Joining world timed out or host is unreachable.'));
      }, 12000);

      this.on('room_joined', (data) => {
        clearTimeout(timer);
        resolve(data);
      });
      this.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(err.message));
      });
      this.on('host_disconnected', (data) => {
        clearTimeout(timer);
        reject(new Error(data.message));
      });
    });
  }

  /**
   * Host sends world snapshot to joining peer.
   */
  sendWorldSnapshot(targetPeerId, snapshot) {
    const payload = {
      type: 'world_snapshot',
      targetPeerId,
      snapshot
    };
    this._sendWs(payload);
    this._broadcastLocal(payload);
  }

  /**
   * Broadcast player position, rotation, held item, sneaking, swinging.
   */
  sendPlayerState(state) {
    const payload = {
      type: 'player_state',
      state
    };
    this._sendWs(payload);
    this._broadcastLocal(payload);
  }

  /**
   * Broadcast placed or broken block.
   */
  sendBlockUpdate(x, y, z, blockId) {
    const payload = {
      type: 'block_update',
      x,
      y,
      z,
      blockId,
      playerName: this.playerName
    };
    this._sendWs(payload);
    this._broadcastLocal(payload);
  }

  /**
   * Broadcast chat message.
   */
  sendChat(text, sender = this.playerName) {
    const payload = {
      type: 'chat',
      sender,
      text
    };
    this._sendWs(payload);
    this._broadcastLocal(payload);
  }

  disconnect() {
    this.connected = false;
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    if (this.bc) {
      try { this.bc.close(); } catch {}
      this.bc = null;
    }
    this.peers.clear();
    this.emit('disconnect', { code: 1000, reason: 'Manual disconnect' });
  }
}
