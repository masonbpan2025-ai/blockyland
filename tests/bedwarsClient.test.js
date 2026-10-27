// The Bed Wars manager on a host and a guest, joined through the share session over the in-memory network (as
// skywarsClient.test.js does for SkyWars): the waiting room, the start at each base with the starting kit, generators
// picked up, the shop, a bed broken, a death and the respawn five seconds later, and which blocks may be broken.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ShareSession } from '../src/multiplayer/shareSession.js';
import { ChestManager } from '../src/chest.js';
import { BedWarsManager } from '../src/mods/bedwars/client.js';
import { ARENA, cellKey } from '../src/mods/bedwars/arena.js';
import { teamById } from '../src/mods/bedwars/teams.js';
import { countItem } from '../src/mods/bedwars/shop.js';
import { BLOCKS } from '../src/blocks.js';
import { createFakeNetwork, settle } from './helpers/shareFakes.js';

function fakeGame(session, { joined }) {
  const voxels = new Map();
  const game = {
    gamerules: {},
    scene: new THREE.Scene(),
    world: {
      getVoxel: (x, y, z) => voxels.get(cellKey(x, y, z)) ?? BLOCKS.AIR,
      setVoxel: (x, y, z, id) => { if (id === BLOCKS.AIR) voxels.delete(cellKey(x, y, z)); else voxels.set(cellKey(x, y, z), id); },
      getChunk: () => null,
    },
    player: {
      position: new THREE.Vector3(), velocity: new THREE.Vector3(), yaw: 0, pitch: 0, health: 20, maxHealth: 20, hunger: 20,
      gamemode: 'survival', isDead: false, statusEffects: new Map(), setGameMode(mode) { this.gamemode = mode; },
      applyStatusEffect(name, seconds, level) { this.statusEffects.set(name, { duration: seconds, level }); },
      takeDamage(n) { this.health -= n; },
    },
    inventory: {
      hotbar: new Array(9).fill(null), storage: new Array(27).fill(null), armor: { head: null, chest: null, legs: null, feet: null }, activeSlot: 0,
      clearCarried() { this.hotbar.fill(null); this.storage.fill(null); this.armor = { head: null, chest: null, legs: null, feet: null }; },
      addItem(item, isBlock, count) {
        const stack = typeof item === 'object' ? { ...item } : { id: item, isBlock, count };
        const same = [...this.hotbar, ...this.storage].find((s) => s && s.id === stack.id && !s.enchantments && !stack.enchantments && !s.bedwars && !stack.bedwars);
        if (same) { same.count += stack.count; return true; }
        for (const list of [this.hotbar, this.storage]) { const i = list.indexOf(null); if (i >= 0) { list[i] = stack; return true; } }
        return false;
      },
      getActiveItem() { return this.hotbar[this.activeSlot]; },
      consumeActiveItem() { const s = this.hotbar[this.activeSlot]; if (s && --s.count <= 0) this.hotbar[this.activeSlot] = null; },
    },
    mobs: { mobs: [], spawnMob(type, x, y, z) { const mob = { type, mesh: new THREE.Group() }; mob.mesh.position.set(x, y, z); this.mobs.push(mob); return mob; } },
    bedManager: { beds: new Map(), registerBed(foot, head) { this.beds.set(foot.join(','), { foot, head }); } },
    entities: {},
    ui: { messages: [], addChatMessage(m) { this.messages.push(m); }, updateHotbar() {}, updateStats() {} },
    worldSync: {
      isJoined: joined, client: session, playerName: () => (joined ? 'Guesty' : 'Hosty'),
      remotePlayers: { remotePlayers: new Map() },
      async hostWorld() { return session.hostRoom('Hosty', { settings: { pvp: true } }); },
    },
  };
  game.chestManager = new ChestManager(game);
  return { game, voxels };
}

async function pair(t) {
  const network = createFakeNetwork();
  const make = () => new ShareSession({ signalingFactory: network.signalingFactory, peerFactory: network.peerFactory });
  const hostSession = make(), guestSession = make();
  t.after(() => { host.deactivate(); guest.deactivate(); hostSession.disconnect(true); guestSession.disconnect(true); });
  const hostSide = fakeGame(hostSession, { joined: false });
  const host = new BedWarsManager(hostSide.game);
  hostSide.game.bedwars = host;
  host.activate();
  await settle(5);
  const guestSide = fakeGame(guestSession, { joined: true });
  const guest = new BedWarsManager(guestSide.game);
  guestSide.game.bedwars = guest;
  await guestSession.joinRoom(hostSession.roomId, 'Guesty');
  guest.activate();
  await settle(5);
  return { host, guest, hostGame: hostSide.game, guestGame: guestSide.game };
}

const tick = async (managers, seconds, step = 0.1) => {
  for (let t = 0; t < seconds; t += step) { for (const m of managers) m.update(step); await settle(1); }
};

async function started(t) {
  const s = await pair(t);
  await tick([s.host, s.guest], 0.6);
  s.host.chooseMode('solo');
  s.host.requestStart();
  await tick([s.host, s.guest], 5.6);
  assert.equal(s.host.phase, 'playing');
  assert.equal(s.guest.phase, 'playing');
  return s;
}

test('lobby: both players wait in the glass room above the middle, each on a team of their own', async (t) => {
  const { host, guest, hostGame, guestGame } = await pair(t);
  await tick([host, guest], 0.6);
  assert.equal(host.match.players.size, 2);
  assert.notEqual(host.me().team, guest.me().team);
  for (const game of [hostGame, guestGame]) {
    assert.equal(game.player.gamemode, 'adventure');
    assert.ok(Math.abs(game.player.position.y - (ARENA.lobbyY + 1)) < 0.01, 'in the waiting room');
    assert.equal(game.world.getVoxel(0, ARENA.surfaceY, 0) !== BLOCKS.AIR, true, 'the map is built');
  }
  assert.equal(hostGame.gamerules.doMobSpawning, false, 'no mobs wandering the islands');
});

test('start: each player at their own base, in survival, with a wooden sword and leather armour; shopkeepers stand by', async (t) => {
  const { host, guest, hostGame, guestGame } = await started(t);
  for (const [manager, game] of [[host, hostGame], [guest, guestGame]]) {
    const base = manager.myBase();
    assert.equal(game.player.gamemode, 'survival');
    assert.ok(game.player.position.distanceTo(new THREE.Vector3(base.spawn.x, base.spawn.y, base.spawn.z)) < 0.01);
    assert.equal(countItem(game.inventory, 'wooden_sword'), 1);
    assert.equal(game.inventory.armor.chest.id, 'leather_chestplate');
    assert.equal(game.mobs.mobs.filter((m) => m.bedwarsShop).length, 2 * manager.state.teams.length, 'an item shop and team upgrades on every island, empty ones too');
    assert.ok(game.mobs.mobs.every((m) => m.frozen && m.invulnerable));
  }
});

test('standing on the forge picks up its iron and gold; the shop turns iron into the team\'s wool', async (t) => {
  const { host, guest, hostGame } = await started(t);
  await tick([host, guest], 3.2);
  const forge = host.myBase().forge;
  hostGame.player.position.set(forge.x, forge.y, forge.z);
  await tick([host, guest], 0.6);
  const iron = countItem(hostGame.inventory, 'iron_ingot');
  assert.ok(iron >= 2, `picked up iron (${iron})`);
  hostGame.inventory.addItem('iron_ingot', false, 4);
  assert.equal(host.buyItem('wool').ok, true);
  assert.equal(countItem(hostGame.inventory, teamById(host.me().team).wool), 16);
});

test('the guest breaks the host\'s bed: everyone is told, it is gone on both, and the host\'s next death is final', async (t) => {
  const { host, guest, hostGame, guestGame } = await started(t);
  const hostTeam = host.me().team;
  const bed = host.myBase().bed;
  assert.equal(guest.canBreakBlock(...bed.foot), true, 'an enemy bed');
  assert.equal(host.canBreakBlock(...bed.foot), false, 'not your own');
  assert.equal(guest.canBreakBlock(bed.foot[0], ARENA.surfaceY, bed.foot[2]), false, 'nor the map');
  guestGame.world.setVoxel(...bed.foot, BLOCKS.AIR);
  guest.onBlockBroken(...bed.foot);
  await tick([host, guest], 0.6);
  assert.equal(host.state.teams.find((t2) => t2.id === hostTeam).bed, false);
  for (const game of [hostGame, guestGame]) {
    assert.equal(game.world.getVoxel(...bed.foot), BLOCKS.AIR);
    assert.equal(game.world.getVoxel(...bed.head), BLOCKS.AIR);
  }
  assert.ok(hostGame.ui.messages.some((m) => /BED DESTRUCTION > .* Bed was destroyed by Guesty!/.test(m)));
  // Now a death is the end.
  host.onLocalDeath();
  await tick([host, guest], 0.6);
  assert.equal(host.phase, 'ended');
  assert.equal(host.state.winner, guest.me().team);
  assert.equal(hostGame.player.gamemode, 'spectator');
});

test('a death with the bed standing: watching for five seconds, then back at the base, tools a tier lower', async (t) => {
  const { host, guest, hostGame, guestGame } = await started(t);
  host.kit.pickaxe = 3;
  guestGame.inventory.addItem('iron_ingot', false, 7);
  guest.onLocalDeath();
  await tick([host, guest], 0.5);
  assert.equal(guestGame.player.gamemode, 'spectator');
  assert.equal(guest.me().dead, true);
  assert.equal(countItem(guestGame.inventory, 'iron_ingot'), 0, 'what was carried is gone');
  await tick([host, guest], 5);
  assert.equal(guest.me().dead, false);
  assert.equal(guestGame.player.gamemode, 'survival');
  const spawn = guest.myBase().spawn;
  assert.ok(guestGame.player.position.distanceTo(new THREE.Vector3(spawn.x, spawn.y, spawn.z)) < 0.01, 'back at the base');
  assert.equal(countItem(guestGame.inventory, 'wooden_sword'), 1);
});

test('blocks: placed ones can be broken, the map\'s cannot; nothing can be placed on a generator or a spawn', async (t) => {
  const { host } = await started(t);
  const base = host.myBase();
  const free = { x: Math.floor(base.center.x) + 3, y: ARENA.surfaceY + 1, z: Math.floor(base.center.z) + 3 };
  assert.equal(host.canBreakBlock(free.x, ARENA.surfaceY, free.z), false, 'the island');
  assert.equal(host.canBreakBlock(free.x, free.y, free.z), true, 'air-built: what a player placed');
  assert.equal(host.canPlaceBlock(Math.floor(base.forge.x), base.forge.y, Math.floor(base.forge.z)), false, 'the forge');
  assert.equal(host.canPlaceBlock(Math.floor(base.spawn.x), base.spawn.y + 1, Math.floor(base.spawn.z)), false, 'the spawn');
  assert.equal(host.canPlaceBlock(free.x, free.y, free.z), true);
  assert.equal(host.canPlaceBlock(free.x, ARENA.surfaceY + 25, free.z), false, 'the build limit');
});
