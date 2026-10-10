import { WebSocketServer } from 'ws';

/**
 * In-memory room store for hosted Minecraft browser worlds.
 * Maps roomId -> { id, hostId, hostWs, clients: Map<clientId, { id, ws, name, isHost }>, createdAt }
 */
export function createWorldRelay({ path = '/ws/world-relay' } = {}) {
  const rooms = new Map();
  const allSockets = new Set();
  const wss = new WebSocketServer({ noServer: true });

  const safeSend = (ws, payload) => {
    if (!ws || ws.readyState !== 1 /* OPEN */) return false;
    try {
      ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  };

  const broadcastToRoom = (room, payload, excludeClientId = null) => {
    const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
    for (const [clientId, client] of room.clients.entries()) {
      if (clientId !== excludeClientId) {
        safeSend(client.ws, json);
      }
    }
  };

  wss.on('connection', (ws) => {
    allSockets.add(ws);
    let currentRoomId = null;
    let currentClientId = null;

    ws.on('message', (raw) => {
      let data;
      try {
        data = JSON.parse(raw.toString());
      } catch (err) {
        safeSend(ws, { type: 'error', message: 'Invalid JSON payload' });
        return;
      }

      const { type } = data;

      // 1. Host creates a new room
      if (type === 'host_room') {
        const roomId = String(data.roomId || Math.random().toString(36).substring(2, 8)).trim().toLowerCase();
        const playerName = String(data.playerName || 'Host').trim();
        const clientId = 'host_' + Math.random().toString(36).substring(2, 8);

        // If room already existed, clean up previous
        if (rooms.has(roomId)) {
          const oldRoom = rooms.get(roomId);
          broadcastToRoom(oldRoom, { type: 'host_disconnected', message: 'Host restarted the room.' });
          for (const client of oldRoom.clients.values()) {
            if (client.ws !== ws) {
              try { client.ws.close(); } catch {}
            }
          }
        }

        const room = {
          id: roomId,
          hostId: clientId,
          hostWs: ws,
          worldInfo: data.worldInfo || {},
          clients: new Map(),
          createdAt: Date.now()
        };

        const hostClient = { id: clientId, ws, name: playerName, isHost: true };
        room.clients.set(clientId, hostClient);
        rooms.set(roomId, room);

        currentRoomId = roomId;
        currentClientId = clientId;

        safeSend(ws, {
          type: 'room_hosted',
          roomId,
          clientId,
          hostId: clientId,
          playerName
        });
        return;
      }

      // 2. Guest joins an existing room
      if (type === 'join_room') {
        const roomId = String(data.roomId || '').trim().toLowerCase();
        const playerName = String(data.playerName || 'Player').trim();

        if (!rooms.has(roomId)) {
          safeSend(ws, { type: 'error', message: `Room "${roomId}" not found or host is offline.` });
          return;
        }

        const room = rooms.get(roomId);
        const clientId = 'guest_' + Math.random().toString(36).substring(2, 8);
        const guestClient = { id: clientId, ws, name: playerName, isHost: false };
        room.clients.set(clientId, guestClient);

        currentRoomId = roomId;
        currentClientId = clientId;

        // Send confirmation to guest
        safeSend(ws, {
          type: 'room_joined',
          roomId,
          clientId,
          hostId: room.hostId,
          playerName,
          worldInfo: room.worldInfo,
          peers: Array.from(room.clients.values()).map(c => ({ id: c.id, name: c.name, isHost: c.isHost }))
        });

        // Notify other peers and host
        broadcastToRoom(room, {
          type: 'peer_joined',
          peerId: clientId,
          peerName: playerName,
          isHost: false
        }, clientId);

        // Ask host to send world snapshot to new guest
        safeSend(room.hostWs, {
          type: 'request_snapshot',
          targetPeerId: clientId,
          peerName: playerName
        });
        return;
      }

      // Ensure client is in a room for subsequent game packets
      if (!currentRoomId || !rooms.has(currentRoomId)) {
        safeSend(ws, { type: 'error', message: 'You are not in an active room.' });
        return;
      }

      const room = rooms.get(currentRoomId);

      // 3. Host sends world snapshot to target guest
      if (type === 'world_snapshot') {
        const { targetPeerId, snapshot } = data;
        const target = room.clients.get(targetPeerId);
        if (target) {
          safeSend(target.ws, {
            type: 'world_snapshot',
            fromPeerId: currentClientId,
            snapshot
          });
        }
        return;
      }

      // 4. Real-time player movement and state sync
      if (type === 'player_state') {
        broadcastToRoom(room, {
          type: 'player_state',
          peerId: currentClientId,
          state: data.state
        }, currentClientId);
        return;
      }

      // 5. Real-time block update (break or place)
      if (type === 'block_update') {
        broadcastToRoom(room, {
          type: 'block_update',
          peerId: currentClientId,
          x: data.x,
          y: data.y,
          z: data.z,
          blockId: data.blockId,
          playerName: data.playerName
        }, currentClientId);
        return;
      }

      // 6. In-game Chat message
      if (type === 'chat') {
        const client = room.clients.get(currentClientId);
        const sender = client ? client.name : 'Unknown';
        broadcastToRoom(room, {
          type: 'chat',
          peerId: currentClientId,
          sender: data.sender || sender,
          text: data.text
        });
        return;
      }

      // 7. Generic event forwarding
      if (type === 'relay_event') {
        broadcastToRoom(room, {
          type: 'relay_event',
          peerId: currentClientId,
          event: data.event,
          payload: data.payload
        }, currentClientId);
        return;
      }
    });

    ws.on('close', () => {
      allSockets.delete(ws);
      if (!currentRoomId || !rooms.has(currentRoomId)) return;
      const room = rooms.get(currentRoomId);
      const client = room.clients.get(currentClientId);
      const clientName = client ? client.name : 'Player';

      room.clients.delete(currentClientId);

      if (client?.isHost) {
        // Host disconnected
        broadcastToRoom(room, {
          type: 'host_disconnected',
          message: 'Host has closed or left the world.'
        });
        rooms.delete(currentRoomId);
      } else {
        // Guest disconnected
        broadcastToRoom(room, {
          type: 'peer_left',
          peerId: currentClientId,
          peerName: clientName
        });
        if (room.clients.size === 0) {
          rooms.delete(currentRoomId);
        }
      }
    });

    ws.on('error', () => {
      try { ws.close(); } catch {}
    });
  });

  const handleUpgrade = (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === path || url.pathname.startsWith(path + '/')) {
      wss.handleUpgrade(req, socket, head, (client) => {
        wss.emit('connection', client, req);
      });
      return true;
    }
    return false;
  };

  const getRooms = () => {
    return Array.from(rooms.values()).map(r => ({
      id: r.id,
      playerCount: r.clients.size,
      createdAt: r.createdAt
    }));
  };

  const close = async () => {
    for (const ws of allSockets) {
      try { ws.terminate(); } catch {}
    }
    allSockets.clear();
    rooms.clear();
    await new Promise((resolve) => wss.close(resolve));
  };

  return {
    wss,
    rooms,
    handleUpgrade,
    getRooms,
    close
  };
}
