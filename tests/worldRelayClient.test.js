import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { createWorldRelay } from '../server/worldRelay.js';
import { WorldRelayClient } from '../src/multiplayer/worldRelayClient.js';

// Polyfill WebSocket in Node test environment for WorldRelayClient
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WebSocket;
}

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

test('WorldRelayClient hostRoom creates room and generates share URL', async (t) => {
  const { wsUrl } = await setupRelayFixture(t);
  const hostClient = new WorldRelayClient({ wsUrl });
  t.after(() => hostClient.disconnect());

  const result = await hostClient.hostRoom('HostPlayer', { seed: 42 });
  assert.ok(result.roomId);
  assert.ok(result.clientId);
  assert.match(result.shareUrl, /\?join=/);
  assert.equal(hostClient.isHost, true);
  assert.equal(hostClient.connected, true);
});

test('WorldRelayClient joinRoom connects to host, exchanges snapshot, blocks, and chat', async (t) => {
  const { wsUrl } = await setupRelayFixture(t);
  const hostClient = new WorldRelayClient({ wsUrl });
  t.after(() => hostClient.disconnect());

  const hostResult = await hostClient.hostRoom('AliceHost', { seed: 101 });

  const guestClient = new WorldRelayClient({ wsUrl });
  t.after(() => guestClient.disconnect());

  let snapshotReceived = null;
  guestClient.on('world_snapshot', ({ snapshot }) => {
    snapshotReceived = snapshot;
  });

  hostClient.on('request_snapshot', ({ targetPeerId }) => {
    hostClient.sendWorldSnapshot(targetPeerId, {
      seed: 101,
      testData: 'world-voxels'
    });
  });

  const guestResult = await guestClient.joinRoom(hostResult.roomId, 'BobGuest');
  assert.equal(guestResult.roomId, hostResult.roomId);
  assert.equal(guestClient.connected, true);
  assert.equal(guestClient.isHost, false);

  // Wait for snapshot
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(snapshotReceived);
  assert.equal(snapshotReceived.seed, 101);

  // Test block sync
  let guestSawBlock = null;
  guestClient.on('block_update', (data) => {
    guestSawBlock = data;
  });

  hostClient.sendBlockUpdate(15, 60, -8, 1); // Place stone
  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.ok(guestSawBlock);
  assert.equal(guestSawBlock.x, 15);
  assert.equal(guestSawBlock.y, 60);
  assert.equal(guestSawBlock.blockId, 1);

  // Test chat sync
  let hostSawChat = null;
  hostClient.on('chat', (data) => {
    hostSawChat = data;
  });

  guestClient.sendChat('Awesome world!', 'BobGuest');
  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.ok(hostSawChat);
  assert.equal(hostSawChat.text, 'Awesome world!');
  assert.equal(hostSawChat.sender, 'BobGuest');
});
