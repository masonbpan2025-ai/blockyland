import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { once } from 'node:events';
import { createWorldRelay } from '../server/worldRelay.js';

async function setupRelayFixture(t) {
  const relay = createWorldRelay({ path: '/ws/world-relay' });
  const server = http.createServer();
  server.on('upgrade', (req, socket, head) => {
    relay.handleUpgrade(req, socket, head);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  t.after(async () => {
    await relay.close();
    await new Promise((resolve) => server.close(resolve));
  });
  return { relay, port, wsUrl: `ws://127.0.0.1:${port}/ws/world-relay` };
}

function connectWs(url) {
  const ws = new WebSocket(url);
  const messages = [];
  ws.on('message', (data) => {
    try {
      messages.push(JSON.parse(data.toString()));
    } catch {}
  });
  const nextMessage = (filter = () => true, timeoutMs = 4000) => {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const interval = setInterval(() => {
        const idx = messages.findIndex(filter);
        if (idx !== -1) {
          clearInterval(interval);
          const [msg] = messages.splice(idx, 1);
          return resolve(msg);
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          reject(new Error(`Timed out waiting for message matching filter`));
        }
      }, 10);
      if (interval.unref) interval.unref();
    });
  };
  return { ws, messages, nextMessage };
}

test('World Relay allows hosting a room and generates valid room credentials', async (t) => {
  const { wsUrl } = await setupRelayFixture(t);
  const host = connectWs(wsUrl);
  await once(host.ws, 'open');
  t.after(() => host.ws.terminate());

  host.ws.send(JSON.stringify({
    type: 'host_room',
    roomId: 'test-room-1',
    playerName: 'Steve',
    worldInfo: { seed: 12345 }
  }));

  const msg = await host.nextMessage((m) => m.type === 'room_hosted');
  assert.equal(msg.roomId, 'test-room-1');
  assert.equal(msg.playerName, 'Steve');
  assert.ok(msg.clientId.startsWith('host_'));
});

test('Second player can join hosted world by room ID and receives peer and snapshot notifications', async (t) => {
  const { wsUrl } = await setupRelayFixture(t);
  const host = connectWs(wsUrl);
  await once(host.ws, 'open');
  t.after(() => host.ws.terminate());

  host.ws.send(JSON.stringify({
    type: 'host_room',
    roomId: 'share-world-42',
    playerName: 'HostPlayer'
  }));
  await host.nextMessage((m) => m.type === 'room_hosted');

  // Guest connects and joins
  const guest = connectWs(wsUrl);
  await once(guest.ws, 'open');
  t.after(() => guest.ws.terminate());

  guest.ws.send(JSON.stringify({
    type: 'join_room',
    roomId: 'share-world-42',
    playerName: 'GuestAlex'
  }));

  // Guest receives room_joined
  const guestJoined = await guest.nextMessage((m) => m.type === 'room_joined');
  assert.equal(guestJoined.roomId, 'share-world-42');
  assert.equal(guestJoined.playerName, 'GuestAlex');
  assert.equal(guestJoined.peers.length, 2);

  // Host receives request_snapshot
  const snapshotReq = await host.nextMessage((m) => m.type === 'request_snapshot');
  assert.equal(snapshotReq.peerName, 'GuestAlex');
  assert.equal(snapshotReq.targetPeerId, guestJoined.clientId);

  // Host sends world snapshot
  host.ws.send(JSON.stringify({
    type: 'world_snapshot',
    targetPeerId: snapshotReq.targetPeerId,
    snapshot: { seed: 9999, chunks: [{ cx: 0, cz: 0 }] }
  }));

  // Guest receives world snapshot
  const receivedSnapshot = await guest.nextMessage((m) => m.type === 'world_snapshot');
  assert.equal(receivedSnapshot.snapshot.seed, 9999);
});

test('Real-time block updates, player state, and chat are relayed bidirectionally between host and guest', async (t) => {
  const { wsUrl } = await setupRelayFixture(t);
  const host = connectWs(wsUrl);
  await once(host.ws, 'open');
  t.after(() => host.ws.terminate());

  host.ws.send(JSON.stringify({ type: 'host_room', roomId: 'play-room', playerName: 'Host' }));
  await host.nextMessage((m) => m.type === 'room_hosted');

  const guest = connectWs(wsUrl);
  await once(guest.ws, 'open');
  t.after(() => guest.ws.terminate());

  guest.ws.send(JSON.stringify({ type: 'join_room', roomId: 'play-room', playerName: 'Guest' }));
  await guest.nextMessage((m) => m.type === 'room_joined');

  // 1. Guest places a block
  guest.ws.send(JSON.stringify({
    type: 'block_update',
    x: 10,
    y: 65,
    z: -3,
    blockId: 5 // Oak wood
  }));

  const hostBlockUpdate = await host.nextMessage((m) => m.type === 'block_update');
  assert.equal(hostBlockUpdate.x, 10);
  assert.equal(hostBlockUpdate.y, 65);
  assert.equal(hostBlockUpdate.z, -3);
  assert.equal(hostBlockUpdate.blockId, 5);

  // 2. Host moves
  host.ws.send(JSON.stringify({
    type: 'player_state',
    state: { x: 12.5, y: 64, z: -2.1, yaw: 1.57, isSneaking: true }
  }));

  const guestPlayerState = await guest.nextMessage((m) => m.type === 'player_state');
  assert.equal(guestPlayerState.state.x, 12.5);
  assert.equal(guestPlayerState.state.isSneaking, true);

  // 3. Chat message
  guest.ws.send(JSON.stringify({
    type: 'chat',
    text: 'Hello from shared world!',
    sender: 'Guest'
  }));

  const hostChat = await host.nextMessage((m) => m.type === 'chat');
  assert.equal(hostChat.text, 'Hello from shared world!');
  assert.equal(hostChat.sender, 'Guest');
});

test('Joining non-existent room returns error', async (t) => {
  const { wsUrl } = await setupRelayFixture(t);
  const client = connectWs(wsUrl);
  await once(client.ws, 'open');
  t.after(() => client.ws.terminate());

  client.ws.send(JSON.stringify({
    type: 'join_room',
    roomId: 'room-that-does-not-exist',
    playerName: 'LostPlayer'
  }));

  const errorMsg = await client.nextMessage((m) => m.type === 'error');
  assert.match(errorMsg.message, /not found/i);
});

test('Guest disconnection notifies other players with peer_left', async (t) => {
  const { wsUrl } = await setupRelayFixture(t);
  const host = connectWs(wsUrl);
  await once(host.ws, 'open');
  t.after(() => host.ws.terminate());

  host.ws.send(JSON.stringify({ type: 'host_room', roomId: 'leave-room', playerName: 'Host' }));
  await host.nextMessage((m) => m.type === 'room_hosted');

  const guest = connectWs(wsUrl);
  await once(guest.ws, 'open');

  guest.ws.send(JSON.stringify({ type: 'join_room', roomId: 'leave-room', playerName: 'GuestToLeave' }));
  await guest.nextMessage((m) => m.type === 'room_joined');

  // Guest disconnects
  guest.ws.close();

  const peerLeft = await host.nextMessage((m) => m.type === 'peer_left');
  assert.equal(peerLeft.peerName, 'GuestToLeave');
});
