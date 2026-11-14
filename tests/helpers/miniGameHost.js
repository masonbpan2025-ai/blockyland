// A SkyWars or Bed Wars host for tests, in Node: the real share server (server/shareServer.js), a host ShareSession on
// it, and a minimal game the mini-game managers run on (the host's world as a sparse voxel map, a player, an inventory),
// answering a guest's request for the world as the game does. Guests (house bots, MCP agents) join it over real sockets.
import * as THREE from 'three';
import { WebSocket } from 'ws';
import { createShareServer } from '../../server/shareServer.js';
import { ShareSession } from '../../src/multiplayer/shareSession.js';
import { SignalingClient } from '../../src/multiplayer/signaling.js';
import { ChestManager } from '../../src/chest.js';
import { SkyWarsManager } from '../../src/mods/skywars/client.js';
import { BedWarsManager } from '../../src/mods/bedwars/client.js';
import { BLOCKS } from '../../src/blocks.js';
import { settle } from './shareFakes.js';

const key = (x, y, z) => `${x},${y},${z}`;

/** A sparse voxel map as the minimal RLE chunk map data a guest decodes. */
export function encodeVoxelsAsMapData(voxels) {
  const chunkMap = new Map();
  for (const [k, blockId] of voxels) {
    if (!blockId) continue;
    const [wx, wy, wz] = k.split(',').map(Number);
    if (wy < 0 || wy >= 64) continue;
    const ck = `${Math.floor(wx / 16)},${Math.floor(wz / 16)}`;
    let data = chunkMap.get(ck);
    if (!data) { data = new Uint16Array(16 * 64 * 16); chunkMap.set(ck, data); }
    data[(wy * 16 + (((wz % 16) + 16) % 16)) * 16 + (((wx % 16) + 16) % 16)] = blockId;
  }
  const chunks = [];
  for (const [ck, data] of chunkMap) {
    const [x, z] = ck.split(',').map(Number);
    const rle = [];
    let current = data[0], count = 1;
    for (let i = 1; i < data.length; i++) { if (data[i] === current) count++; else { rle.push(current, count); current = data[i]; count = 1; } }
    rle.push(current, count);
    chunks.push({ x, z, rle });
  }
  return { version: 2, name: 'Test World', worldTime: 6000, chunks };
}

function fakeGame(hostSession, voxels) {
  const game = {
    gamerules: {}, worldTime: 6000,
    world: {
      getVoxel: (x, y, z) => voxels.get(key(x, y, z)) ?? BLOCKS.AIR,
      setVoxel: (x, y, z, id) => { if (id === BLOCKS.AIR) voxels.delete(key(x, y, z)); else voxels.set(key(x, y, z), id); },
      getChunk: () => null,
    },
    player: {
      position: new THREE.Vector3(0.5, 31, 0.5), velocity: new THREE.Vector3(), yaw: 0, pitch: 0,
      health: 20, maxHealth: 20, hunger: 20, gamemode: 'survival', isDead: false,
      armor: { helmet: null, chestplate: null, leggings: null, boots: null },
      setGameMode(mode) { this.gamemode = mode; }, respawn() { this.health = 20; this.isDead = false; },
    },
    inventory: {
      activeSlot: 0, hotbar: new Array(9).fill(null), storage: new Array(27).fill(null), armor: { head: null, chest: null, legs: null, feet: null },
      clearCarried() { this.hotbar.fill(null); this.storage.fill(null); this.armor = { head: null, chest: null, legs: null, feet: null }; },
      getActiveItem() { return this.hotbar[this.activeSlot]; },
      setSlot(area, slot, item) { if (area === 'hotbar') this.hotbar[slot] = item; else if (area === 'storage') this.storage[slot] = item; },
      addItem(idOrObj, isBlock, count) {
        const entry = typeof idOrObj === 'object' && idOrObj !== null ? { id: idOrObj.id, isBlock: !!idOrObj.isBlock, count: idOrObj.count ?? 1 } : { id: idOrObj, isBlock: !!isBlock, count: count ?? 1 };
        const free = this.hotbar.findIndex((s) => !s); if (free >= 0) { this.hotbar[free] = entry; return true; }
        const store = this.storage.findIndex((s) => !s); if (store >= 0) { this.storage[store] = entry; return true; } return false;
      },
    },
    entities: { droppedItems: [], itemVisuals: { release() {} }, spawnDroppedItem(pos, itemType, isBlock, count, options = {}) { const e = { group: {}, itemType, isBlock, count, position: pos.clone(), ...options }; this.droppedItems.push(e); return e; } },
    ui: { addChatMessage() {}, updateHotbar() {}, updateStats() {} },
    worldSync: {
      isJoined: false, roomId: null, client: hostSession, playerName: () => 'Host', remotePlayers: { remotePlayers: new Map() },
      async hostWorld({ pvp = true } = {}) { const res = await hostSession.hostRoom('Host', { settings: { pvp } }); this.roomId = res.roomId; return res; },
    },
  };
  game.chestManager = new ChestManager(game);
  return game;
}

/**
 * A running mini-game host: `game` 'skywars' or 'bedwars'. Resolves when its lobby has a room code.
 * @returns {Promise<{ manager, game, session, shareUrl, code: string, tick(seconds): Promise<void>, close(): Promise<void> }>}
 */
export async function createMiniGameHost(kind) {
  const shareApp = createShareServer({ port: 0 });
  const port = await shareApp.listen(0, '127.0.0.1');
  const shareUrl = `ws://127.0.0.1:${port}/ws/share`;
  const voxels = new Map();
  const hostSession = new ShareSession({
    location: { href: `http://127.0.0.1:${port}/`, protocol: 'http:', host: `127.0.0.1:${port}`, search: '' },
    signalingFactory: (url) => new SignalingClient({ url, WebSocketImpl: WebSocket }),
  });
  const game = fakeGame(hostSession, voxels);
  hostSession.on('block_update', ({ x, y, z, blockId }) => game.world.setVoxel(x, y, z, blockId));
  hostSession.on('request_snapshot', ({ targetPeerId }) => {
    const p = game.player.position;
    void hostSession.sendWorldSnapshot(targetPeerId, { mapData: encodeVoxelsAsMapData(voxels), hostPos: { x: p.x, y: p.y, z: p.z }, hostYaw: 0, worldTime: game.worldTime });
  });
  const manager = kind === 'bedwars' ? new BedWarsManager(game) : new SkyWarsManager(game);
  game[kind] = manager;
  manager.activate();
  for (let i = 0; i < 100 && !manager.code; i++) await settle(2);
  if (!manager.code) throw new Error('the lobby never got a room code');
  return {
    manager, game, shareUrl, port, code: manager.code, session: hostSession,
    async tick(seconds, step = 0.1) { for (let t = 0; t < seconds; t += step) { manager.update(step); await settle(1); } },
    async close() { try { manager.deactivate(); } catch { /* already */ } hostSession.disconnect(true); await shareApp.close(); },
  };
}
