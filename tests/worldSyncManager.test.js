import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import * as THREE from 'three';
import { createWorldRelay } from '../server/worldRelay.js';
import { WorldSyncManager } from '../src/multiplayer/worldSyncManager.js';
import { BLOCKS } from '../src/blocks.js';

if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WebSocket;
}

// Minimal DOM mock for Node test environment
function setupMockDom() {
  const elements = new Map();
  const getOrCreate = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        textContent: '',
        value: '',
        style: {},
        classList: {
          classes: new Set(['hidden']),
          add(c) { this.classes.add(c); },
          remove(c) { this.classes.delete(c); },
          contains(c) { return this.classes.has(c); }
        },
        children: [],
        innerHTML: '',
        appendChild(child) { this.children.push(child); },
        addEventListener() {},
        removeEventListener() {}
      });
    }
    return elements.get(id);
  };

  globalThis.document = {
    getElementById: (id) => getOrCreate(id),
    createElement: (tag) => {
      const el = {
        tagName: tag,
        style: {},
        innerHTML: '',
        children: [],
        appendChild(c) { this.children.push(c); },
        getContext: () => ({
          beginPath() {},
          moveTo() {},
          lineTo() {},
          quadraticCurveTo() {},
          closePath() {},
          fill() {},
          stroke() {},
          fillText() {}
        })
      };
      return el;
    }
  };
}

// Minimal Game Mock
function createMockGame() {
  const scene = new THREE.Scene();
  const world = {
    seed: 42,
    voxels: new Map(),
    getVoxel(x, y, z) {
      return this.voxels.get(`${x},${y},${z}`) || BLOCKS.AIR;
    },
    setVoxel(x, y, z, blockId) {
      this.voxels.set(`${x},${y},${z}`, blockId);
    },
    getChunk() {
      return { cx: 0, cz: 0 };
    },
    chunks: new Map()
  };

  const player = {
    position: new THREE.Vector3(10, 64, 10),
    velocity: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    pitch: 0,
    isSneaking: false,
    isSprinting: false
  };

  const chatLog = [];
  const ui = {
    addChatMessage(msg) { chatLog.push(msg); },
    closeAllModals() {}
  };

  return {
    scene,
    world,
    player,
    ui,
    chatLog,
    worldGenerated: true,
    worldReady: true,
    worldTime: 1000,
    rebuildChunkMesh() {},
    generateNewWorld: async () => {}
  };
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

test('WorldSyncManager hosts world, updates DOM, and accepts joining guests', async (t) => {
  setupMockDom();
  const { wsUrl } = await setupRelayFixture(t);

  const hostGame = createMockGame();
  const hostSync = new WorldSyncManager(hostGame);
  hostSync.client.wsUrl = wsUrl;
  t.after(() => hostSync.client.disconnect());

  await hostSync.hostWorld('HostPlayer');
  assert.equal(hostSync.isHosting, true);
  assert.ok(hostSync.roomId);
  assert.equal(hostSync.hostRoomIdBadge.textContent, hostSync.roomId);
  assert.match(hostSync.hostShareLinkInput.value, /\?join=/);

  // Guest connects
  const guestGame = createMockGame();
  const guestSync = new WorldSyncManager(guestGame);
  guestSync.client.wsUrl = wsUrl;
  t.after(() => guestSync.client.disconnect());

  await guestSync.client.joinRoom(hostSync.roomId, 'GuestPlayer');
  assert.equal(guestSync.client.connected, true);

  await new Promise((r) => setTimeout(r, 60));
  assert.ok(hostSync.client.peers.size >= 2);
});

test('WorldSyncManager syncs block breaking and placement bidirectionally', async (t) => {
  setupMockDom();
  const { wsUrl } = await setupRelayFixture(t);

  const hostGame = createMockGame();
  const hostSync = new WorldSyncManager(hostGame);
  hostSync.client.wsUrl = wsUrl;
  t.after(() => hostSync.client.disconnect());

  await hostSync.hostWorld('Host1');

  const guestGame = createMockGame();
  const guestSync = new WorldSyncManager(guestGame);
  guestSync.client.wsUrl = wsUrl;
  t.after(() => guestSync.client.disconnect());

  await guestSync.client.joinRoom(hostSync.roomId, 'Guest1');
  await new Promise((r) => setTimeout(r, 60));

  // 1. Guest places a block
  guestSync.onBlockPlaced(5, 70, 5, BLOCKS.DIAMOND_BLOCK);
  await new Promise((r) => setTimeout(r, 80));

  assert.equal(hostGame.world.getVoxel(5, 70, 5), BLOCKS.DIAMOND_BLOCK);

  // 2. Host breaks a block
  hostSync.onBlockBroken(5, 70, 5);
  await new Promise((r) => setTimeout(r, 80));

  assert.equal(guestGame.world.getVoxel(5, 70, 5), BLOCKS.AIR);
});

test('WorldSyncManager syncs chat messages between players', async (t) => {
  setupMockDom();
  const { wsUrl } = await setupRelayFixture(t);

  const hostGame = createMockGame();
  const hostSync = new WorldSyncManager(hostGame);
  hostSync.client.wsUrl = wsUrl;
  t.after(() => hostSync.client.disconnect());

  await hostSync.hostWorld('Alice');

  const guestGame = createMockGame();
  const guestSync = new WorldSyncManager(guestGame);
  guestSync.client.wsUrl = wsUrl;
  t.after(() => guestSync.client.disconnect());

  await guestSync.client.joinRoom(hostSync.roomId, 'Bob');
  await new Promise((r) => setTimeout(r, 60));

  guestSync.onChatSent('Hi Alice!');
  await new Promise((r) => setTimeout(r, 80));

  const foundMsg = hostGame.chatLog.some((m) => m.includes('Bob') && m.includes('Hi Alice!'));
  assert.ok(foundMsg, 'Host should have received Bob\'s chat message');
});
