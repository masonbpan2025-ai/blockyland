// The SkyWars manager on a host and a guest, joined through the share session over the in-memory network: the lobby
// and cages, the start, chests filled by the host reaching the guest, deaths reported to the host, the void, and a dead
// player's loot that only one player can pick up.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ShareSession } from '../src/multiplayer/shareSession.js';
import { ChestManager } from '../src/chest.js';
import { SkyWarsManager } from '../src/mods/skywars/client.js';
import { ARENA, cellKey, buildArena } from '../src/mods/skywars/arena.js';
import { BLOCKS } from '../src/blocks.js';
import { createFakeNetwork, nextEvent, settle } from './helpers/shareFakes.js';

/** Just enough of a game for the manager: a voxel map, chests, a player, an inventory and dropped items. */
function fakeGame(session, { joined }) {
  const voxels = new Map();
  const game = {
    gamerules: {},
    world: {
      getVoxel: (x, y, z) => voxels.get(cellKey(x, y, z)) ?? BLOCKS.AIR,
      setVoxel: (x, y, z, id) => { if (id === BLOCKS.AIR) voxels.delete(cellKey(x, y, z)); else voxels.set(cellKey(x, y, z), id); },
      getChunk: () => null,
    },
    player: {
      position: new THREE.Vector3(), velocity: new THREE.Vector3(), yaw: 0, pitch: 0, health: 20, maxHealth: 20, hunger: 20,
      gamemode: 'survival', isDead: false, setGameMode(mode) { this.gamemode = mode; },
    },
    inventory: {
      hotbar: new Array(9).fill(null), storage: new Array(27).fill(null),
      clearCarried() { this.hotbar.fill(null); this.storage.fill(null); },
      addItem(id, isBlock, count, enchantments) {
        const free = this.hotbar.findIndex((s) => !s);
        if (free < 0) return false;
        this.hotbar[free] = { id, isBlock, count, ...(enchantments ? { enchantments } : {}) };
        return true;
      },
    },
    entities: {
      droppedItems: [],
      itemVisuals: { release() {} },
      spawnDroppedItem(pos, itemType, isBlock, count, options = {}) {
        const entry = { group: {}, itemType, isBlock, count, position: pos.clone(), ...options };
        this.droppedItems.push(entry);
        return entry;
      },
    },
    ui: { addChatMessage() {}, updateHotbar() {}, updateStats() {} },
    worldSync: {
      isJoined: joined, client: session, playerName: () => (joined ? 'Guesty' : 'Hosty'),
      remotePlayers: { remotePlayers: new Map() },
      async hostWorld() { return session.hostRoom('Hosty', { settings: { pvp: true } }); },
    },
  };
  game.chestManager = new ChestManager(game);
  game.chestManager.onContentsChanged = (chest) => session.sendContainer(chest.x, chest.y, chest.z, chest.items);
  session.on('container', ({ x, y, z, items }) => game.chestManager.setChestItems(x, y, z, items, { silent: true }));
  return { game, voxels };
}

async function pair(t) {
  const network = createFakeNetwork();
  const make = () => new ShareSession({ signalingFactory: network.signalingFactory, peerFactory: network.peerFactory });
  const hostSession = make(), guestSession = make();
  t.after(() => { hostSession.disconnect(true); guestSession.disconnect(true); });
  const hostSide = fakeGame(hostSession, { joined: false });
  const host = new SkyWarsManager(hostSide.game);
  hostSide.game.skywars = host;
  host.activate();
  await settle(5);
  const { roomId } = { roomId: hostSession.roomId };
  assert.match(roomId, /^[0-9]{4}$/, 'the lobby is open with a code');
  // The guest receives the host's world (here: the same arena) and opens SkyWars on it.
  const guestSide = fakeGame(guestSession, { joined: true });
  for (const [k, v] of hostSide.voxels) guestSide.voxels.set(k, v);
  const guest = new SkyWarsManager(guestSide.game);
  guestSide.game.skywars = guest;
  await guestSession.joinRoom(roomId, 'Guesty');
  guest.activate();
  await settle(5);
  return { host, guest, hostGame: hostSide.game, guestGame: guestSide.game, hostSession, guestSession };
}

const tick = async (managers, seconds, step = 0.1) => {
  for (let t = 0; t < seconds; t += step) { for (const m of managers) m.update(step); await settle(1); }
};

test('lobby: the host builds the islands, waits alone, and the guest who joins is put in its own cage', async (t) => {
  const { host, guest, hostGame, guestGame } = await pair(t);
  assert.equal(hostGame.world.getVoxel(0, ARENA.surfaceY, 0), BLOCKS.GRASS, 'the middle island exists');
  await tick([host, guest], 1.1);
  assert.equal(host.match.players.size, 2);
  assert.equal(guest.me()?.slot, 1);
  const spawn = buildArena(2015).spawns[1];
  assert.ok(Math.abs(guestGame.player.position.z - spawn.z) < 0.01);
  assert.equal(guestGame.player.gamemode, 'adventure');
  assert.equal(hostGame.player.gamemode, 'adventure');
  // A guest cannot start the game.
  guest.session.sendGame({ type: 'start' });
  await tick([host, guest], 0.5);
  assert.equal(host.match.phase, 'lobby');
});

test('start: the cages open for both, chests the host fills reach the guest, and only the living fight', async (t) => {
  const { host, guest, hostGame, guestGame } = await pair(t);
  await tick([host, guest], 1.1);
  host.requestStart();
  assert.equal(host.match.phase, 'countdown');
  await tick([host, guest], 3.4);
  assert.equal(guest.phase, 'playing');
  for (const g of [hostGame, guestGame]) {
    assert.equal(g.player.gamemode, 'survival');
    const s = buildArena(2015).spawns[1];
    assert.equal(g.world.getVoxel(Math.floor(s.x) + 1, s.y, Math.floor(s.z)), BLOCKS.AIR, 'cage open');
  }
  const chest = host.arena.chests.find((c) => c.slot === 1);
  const atHost = hostGame.chestManager.getChest(chest.x, chest.y, chest.z).items.filter(Boolean);
  const atGuest = guestGame.chestManager.getChest(chest.x, chest.y, chest.z).items.filter(Boolean);
  assert.ok(atHost.length > 0);
  assert.deepEqual(atGuest, atHost, 'the guest sees the same loot');
  assert.equal(host.session.attackPolicy('host', guest.myId), null, 'PvP on in play');
});

test('a guest killed by the host: the kill is the host\'s, the guest watches, and its loot drops for both', async (t) => {
  const { host, guest, hostGame, guestGame } = await pair(t);
  await tick([host, guest], 1.1);
  host.requestStart();
  await tick([host, guest], 3.4);
  guestGame.inventory.hotbar[0] = { id: 'iron_sword', count: 1, isBlock: false };
  guestGame.inventory.hotbar[1] = { id: BLOCKS.OAK_PLANKS, count: 12, isBlock: true };
  host.session.emit('attack_landed', { attackerId: 'host', targetId: guest.myId, damage: 6 });
  guest.lastDamageType = 'player';
  assert.equal(guest.onLocalDeath(), true, 'the match handles the death');
  await tick([host, guest], 1.2);
  assert.equal(host.match.phase, 'ended', 'the host is the last one alive');
  assert.equal(host.match.winner, 'host');
  assert.equal(host.match.players.get('host').kills, 1);
  assert.equal(guestGame.player.gamemode, 'spectator');
  assert.ok(guestGame.inventory.hotbar.every((s) => !s), 'the guest no longer carries it');
  assert.equal(hostGame.entities.droppedItems.length, 2);
  assert.equal(guestGame.entities.droppedItems.length, 2, 'both see the drops');
});

test('a dead player\'s loot goes to the first who claims it, once', async (t) => {
  const { host, guest, hostGame, guestGame } = await pair(t);
  await tick([host, guest], 1.1);
  host.requestStart();
  await tick([host, guest], 3.4);
  // A third player still in the match, so the host's death does not end it.
  host.match.join('p9', 'Third');
  host.match.players.get('p9').alive = true;
  host.match.players.get('p9').slot = 2;
  hostGame.inventory.hotbar[0] = { id: 'diamond_sword', count: 1, isBlock: false, enchantments: [{ id: 'sharpness', level: 1 }] };
  host.onLocalDeath(); // the host dies, and its loot drops
  await tick([host, guest], 0.3);
  assert.equal(host.match.phase, 'playing');
  const [dropId] = [...guest.drops.keys()];
  assert.ok(dropId, 'the guest sees the drop');
  // The guest walks over it: a claim goes to the host, which gives it to the guest and removes it everywhere.
  const entry = guestGame.entities.droppedItems[0];
  entry.claim(entry);
  await tick([host, guest], 0.3);
  assert.deepEqual(guestGame.inventory.hotbar[0], { id: 'diamond_sword', isBlock: false, count: 1, enchantments: [{ id: 'sharpness', level: 1 }] });
  assert.equal(guestGame.entities.droppedItems.length, 0);
  assert.equal(hostGame.entities.droppedItems.length, 0);
  // A second claim of the same drop gives nothing.
  guest.session.sendGame({ type: 'claim', id: dropId });
  await tick([host, guest], 0.3);
  assert.equal(guestGame.inventory.hotbar.filter(Boolean).length, 1);
});

test('the void: a guest who falls below the islands is out, seen by the host from its position', async (t) => {
  const { host, guest, guestGame } = await pair(t);
  await tick([host, guest], 1.1);
  host.requestStart();
  await tick([host, guest], 3.4);
  // The position the guest's browser sends, under the islands.
  host.session.positions.set(guest.myId, { x: 0, y: ARENA.voidY - 5, z: 30 });
  await tick([host, guest], 0.3);
  assert.equal(host.match.players.get(guest.myId).alive, false);
  assert.equal(host.match.winner, 'host');
  await tick([host, guest], 1.1);
  assert.equal(guestGame.player.gamemode, 'spectator');
});
