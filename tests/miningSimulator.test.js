// Mining Simulator: the economy's prices and transfers, the map's mine and plots, and the manager on a host and a
// guest joined through the share session over the in-memory network (as bedwarsClient.test.js does): selling ores,
// buying upgrades, the Superstick being the only harm, a kill taking a fifth of the victim's coins, the mine growing
// back, and progress surviving a restart.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ShareSession } from '../src/multiplayer/shareSession.js';
import { ChestManager } from '../src/chest.js';
import { BLOCKS } from '../src/blocks.js';
import { miningEffect } from '../src/miningRules.js';
import {
  Ledger, ORE_VALUES, pickaxeUpgradeCost, houseUpgradeCost, killTransfer, saleValue, SUPERSTICK_COST,
} from '../src/mods/mining-simulator/economy.js';
import {
  WORLD, PLOTS, TRADER, MINES, MINE_TOP, MINE_BOTTOM, inMine, mineBlockAt, mineColumn, plotAt, plotLayout, terrainCells,
} from '../src/mods/mining-simulator/world.js';
import { MiningSimManager, ORE_REGROW_SECONDS } from '../src/mods/mining-simulator/client.js';
import { createFakeNetwork, settle } from './helpers/shareFakes.js';

// --- the economy -------------------------------------------------------------------------------------------------

test('pickaxe upgrades: 500 for stone, then 300 more each time, up to netherite', () => {
  // Wooden -> stone 500; stone -> iron 800; iron -> diamond 1100; diamond -> netherite 1400; nothing past netherite.
  assert.deepEqual([1, 2, 3, 4, 5].map(pickaxeUpgradeCost), [500, 800, 1100, 1400, null]);
});

test('house upgrades: 750 for the first, then 400 more each time, up to level 5', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(houseUpgradeCost), [750, 1150, 1550, 1950, null]);
});

test('ores sell for coins, rarer ones for more; anything else is not bought', () => {
  assert.equal(ORE_VALUES.coal, 20, 'coal is the base 20');
  for (const rare of ['raw_iron', 'raw_gold', 'diamond', 'emerald']) assert.ok(ORE_VALUES[rare] > ORE_VALUES.coal, rare);
  assert.ok(ORE_VALUES.emerald > ORE_VALUES.diamond && ORE_VALUES.diamond > ORE_VALUES.raw_gold && ORE_VALUES.raw_gold > ORE_VALUES.raw_iron);
  const { coins, sold } = saleValue({ coal: 3, diamond: 1, cobblestone: 64, dirt: -5 });
  assert.equal(coins, 3 * 20 + ORE_VALUES.diamond);
  assert.deepEqual(sold, { coal: 3, diamond: 1 });
});

test('a kill moves a fifth of the victim\'s coins, rounded down, to the killer', () => {
  assert.equal(killTransfer(1234), 246);
  assert.equal(killTransfer(4), 0);
  const ledger = new Ledger();
  ledger.join('Ann'); ledger.join('Bob');
  ledger.get('Ann').coins = 1000;
  ledger.get('Bob').coins = 50;
  const result = ledger.died('Ann', 'Bob');
  assert.equal(result.coins, 200);
  assert.equal(ledger.get('Ann').coins, 800);
  assert.equal(ledger.get('Bob').coins, 250);
  assert.equal(ledger.died('Bob', null).coins, 0, 'no killer, no transfer');
  assert.equal(ledger.get('Bob').coins, 250);
});

test('buying: refused without the coins (and nothing changes), the Superstick only once', () => {
  const ledger = new Ledger();
  ledger.join('Ann');
  const ann = ledger.get('Ann');
  ann.coins = 499;
  assert.equal(ledger.buyPickaxe('Ann').ok, false);
  assert.equal(ann.coins, 499);
  assert.equal(ann.pickaxe, 1);
  ann.coins = 500 + SUPERSTICK_COST;
  assert.equal(ledger.buyPickaxe('Ann').ok, true);
  assert.equal(ann.pickaxe, 2);
  assert.equal(ledger.buySuperstick('Ann').ok, true);
  assert.equal(ann.coins, 0);
  ann.coins = 1000;
  assert.equal(ledger.buySuperstick('Ann').ok, false, 'one per player');
  assert.equal(ann.coins, 1000);
});

test('the ledger saves and restores by name, ignoring case, and gives each new player a free plot', () => {
  const ledger = new Ledger();
  ledger.join('Ann');
  ledger.get('Ann').coins = 77;
  ledger.get('Ann').house = 3;
  const restored = new Ledger(JSON.parse(JSON.stringify(ledger.toJSON())));
  const again = restored.join('  ANN ');
  assert.equal(again.fresh, false);
  assert.equal(again.record.coins, 77);
  assert.equal(again.record.house, 3);
  assert.notEqual(restored.join('Bob').record.plot, again.record.plot);
  for (let i = 0; i < PLOTS.length - 2; i++) assert.equal(restored.join(`p${i}`).ok, true);
  assert.equal(restored.join('one too many').ok, false, 'one plot each, and only so many plots');
});

// --- the map -----------------------------------------------------------------------------------------------------

test('one mine per pickaxe tier: each holds only what its own pickaxe can harvest', () => {
  const tiers = { 1: 'wooden_pickaxe', 2: 'stone_pickaxe', 3: 'iron_pickaxe' };
  const h = WORLD.mineHalf;
  assert.deepEqual(MINES.map((m) => m.tier), [1, 2, 3]);
  const found = MINES.map(() => new Set());
  MINES.forEach((mine, i) => {
    for (let x = mine.x - h; x <= mine.x + h; x++) for (let z = mine.z - h; z <= mine.z + h; z++) for (let y = MINE_BOTTOM; y <= MINE_TOP; y++) {
      found[i].add(mineBlockAt(x, y, z));
    }
  });
  found.forEach((blocks, i) => {
    for (const id of blocks) assert.ok(miningEffect(id, null, tiers[MINES[i].tier]).canHarvest, `${MINES[i].name}: block ${id} harvestable with ${tiers[MINES[i].tier]}`);
  });
  assert.ok(found[0].has(BLOCKS.COAL_ORE), 'coal in the Wood Mine');
  assert.equal(miningEffect(BLOCKS.IRON_ORE, null, 'wooden_pickaxe').canHarvest, false, 'iron needs stone (vanilla)');
  assert.ok(found[1].has(BLOCKS.IRON_ORE), 'iron in the Stone Mine');
  assert.ok(found[2].has(BLOCKS.DEEPSLATE_DIAMOND_ORE), 'diamonds in the Iron Mine');
});

test('each mine is 32 blocks deep with bedrock under it, and the mines do not touch the plots or each other', () => {
  assert.equal(MINE_TOP - MINE_BOTTOM + 1, 32);
  const cells = new Map(terrainCells().map(([x, y, z, id]) => [`${x},${y},${z}`, id]));
  for (const mine of MINES) {
    for (let y = MINE_BOTTOM; y <= MINE_TOP; y++) assert.notEqual(cells.get(`${mine.x},${y},${mine.z}`), BLOCKS.BEDROCK);
    assert.equal(cells.get(`${mine.x},${MINE_BOTTOM - 1},${mine.z}`), BLOCKS.BEDROCK, `${mine.name} has a bedrock floor`);
    assert.equal(inMine(mine.x, MINE_BOTTOM - 1, mine.z), false, 'the bedrock is not part of the mine');
  }
  for (let x = -WORLD.extent; x <= WORLD.extent; x++) for (let z = -WORLD.extent; z <= WORLD.extent; z++) {
    assert.ok(!(mineColumn(x, z) && plotAt(x, z) !== null), `no plot on a mine at ${x},${z}`);
  }
});

test('houses: more chests each level, inside the plot, and a clear spawn outside the door', () => {
  const chestCounts = [1, 2, 3, 4, 5].map((level) => plotLayout(0, level).chests.length);
  assert.deepEqual(chestCounts, [1, 2, 3, 4, 6]);
  for (let plot = 0; plot < PLOTS.length; plot++) {
    for (let level = 1; level <= 5; level++) {
      const layout = plotLayout(plot, level);
      const cells = new Map(layout.cells.map(([x, y, z, id]) => [`${x},${y},${z}`, id]));
      for (const [x, , z] of layout.cells) assert.equal(plotAt(x, z), plot, `plot ${plot} level ${level} stays on its plot`);
      const s = layout.spawn;
      assert.equal(plotAt(s.x, s.z), plot);
      const sx = Math.floor(s.x), sz = Math.floor(s.z);
      assert.equal(cells.get(`${sx},${WORLD.ground + 1},${sz}`), BLOCKS.AIR, 'nothing in the way at the spawn');
      assert.equal(cells.get(`${sx},${WORLD.ground + 2},${sz}`), BLOCKS.AIR);
      for (const c of layout.chests) assert.equal(cells.get(`${c.x},${c.y},${c.z}`), BLOCKS.CHEST);
    }
  }
  assert.equal(plotAt(TRADER.x, TRADER.z), null, 'the trader is not on a plot');
});

// --- the game, on a host and a guest -----------------------------------------------------------------------------

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), data };
}

function fakeGame(session, { joined, name }) {
  const voxels = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  const game = {
    gamerules: {},
    difficulty: 'normal',
    setDifficulty(d) { this.difficulty = d; },
    scene: new THREE.Scene(),
    world: {
      getVoxel: (x, y, z) => voxels.get(key(x, y, z)) ?? BLOCKS.AIR,
      setVoxel: (x, y, z, id) => { if (id === BLOCKS.AIR) voxels.delete(key(x, y, z)); else voxels.set(key(x, y, z), id); },
      getChunk: () => null,
    },
    player: {
      position: new THREE.Vector3(), velocity: new THREE.Vector3(), yaw: 0, pitch: 0, health: 20, maxHealth: 20, hunger: 20,
      gamemode: 'survival', isDead: false, setGameMode(mode) { this.gamemode = mode; },
    },
    inventory: {
      hotbar: new Array(9).fill(null), storage: new Array(27).fill(null), activeSlot: 0,
      addItem(item, isBlock = false, count = 1) {
        const stack = typeof item === 'object' ? { ...item } : { id: item, isBlock, count };
        const same = [...this.hotbar, ...this.storage].find((s) => s && s.id === stack.id && !s.miningSim && !stack.miningSim);
        if (same) { same.count += stack.count; return true; }
        for (const list of [this.hotbar, this.storage]) { const i = list.indexOf(null); if (i >= 0) { list[i] = stack; return true; } }
        return false;
      },
      getActiveItem() { return this.hotbar[this.activeSlot]; },
    },
    mobs: { mobs: [], spawnMob(type, x, y, z) { const mob = { type, mesh: new THREE.Group() }; mob.mesh.position.set(x, y, z); this.mobs.push(mob); return mob; } },
    ui: { messages: [], addChatMessage(m) { this.messages.push(m); }, updateHotbar() {}, updateStats() {}, isModalOpen: () => false },
    worldSync: {
      isJoined: joined, client: session, playerName: () => name,
      async hostWorld() { return session.hostRoom(name, { settings: { pvp: true } }); },
      onBlockPlaced: (x, y, z, id) => { if (session.connected) session.sendBlockUpdate(x, y, z, id); },
      onBlockBroken: (x, y, z) => { if (session.connected) session.sendBlockUpdate(x, y, z, BLOCKS.AIR); },
    },
  };
  game.chestManager = new ChestManager(game);
  // As worldSyncManager.applyRemoteBlock does: another player's block change lands in this world.
  session.on('block_update', ({ x, y, z, blockId }) => game.world.setVoxel(x, y, z, blockId));
  return game;
}

const count = (inv, id) => [...inv.hotbar, ...inv.storage].filter((s) => s?.id === id).reduce((n, s) => n + s.count, 0);
const tick = async (managers, seconds, step = 0.25) => {
  for (let t = 0; t < seconds; t += step) { for (const m of managers) m.update(step); await settle(1); }
};

async function pair(t, storage = memoryStorage()) {
  const network = createFakeNetwork();
  const make = () => new ShareSession({ signalingFactory: network.signalingFactory, peerFactory: network.peerFactory });
  const hostSession = make(), guestSession = make();
  const hostGame = fakeGame(hostSession, { joined: false, name: 'Hosty' });
  const host = new MiningSimManager(hostGame, { storage });
  hostGame.miningSim = host;
  t.after(() => { host.deactivate(); guest.deactivate(); hostSession.disconnect(true); guestSession.disconnect(true); });
  host.activate();
  await settle(5);
  const guestGame = fakeGame(guestSession, { joined: true, name: 'Guesty' });
  const guest = new MiningSimManager(guestGame);
  guestGame.miningSim = guest;
  await guestSession.joinRoom(hostSession.roomId, 'Guesty');
  guest.activate();
  await settle(5);
  await tick([host, guest], 0.5);
  return { host, guest, hostGame, guestGame, hostSession, guestSession, storage };
}

test('start: peaceful, no mobs spawning, everyone at their own plot with a wooden pickaxe', async (t) => {
  const { host, guest, hostGame, guestGame } = await pair(t);
  for (const [manager, game] of [[host, hostGame], [guest, guestGame]]) {
    assert.equal(game.difficulty, 'peaceful');
    assert.equal(game.gamerules.doMobSpawning, false);
    const me = manager.myRecord();
    assert.ok(me, 'the host knows this player');
    assert.equal(plotAt(game.player.position.x, game.player.position.z), me.plot, 'spawned on their own plot');
    assert.equal(count(game.inventory, 'wooden_pickaxe'), 1);
    assert.equal(me.coins, 0);
  }
  assert.notEqual(host.myRecord().plot, guest.myRecord().plot);
  for (const mine of MINES) assert.notEqual(hostGame.world.getVoxel(mine.x, MINE_TOP, mine.z), BLOCKS.AIR, `the ${mine.name} is built`);
  assert.equal(hostGame.mobs.mobs.filter((m) => m.miningTrader).length, 1, 'the trader stands at the plaza');
});

test('selling and buying: the guest sells ores for coins, then buys the stone pickaxe, which replaces the wooden one', async (t) => {
  const { host, guest, guestGame } = await pair(t);
  guestGame.inventory.addItem('coal', false, 10);
  guestGame.inventory.addItem('diamond', false, 2);
  guestGame.inventory.addItem('cobblestone', true, 5);
  guest.sellAll();
  await tick([host, guest], 0.5);
  assert.equal(guest.myRecord().coins, 10 * 20 + 2 * ORE_VALUES.diamond);
  assert.equal(count(guestGame.inventory, 'coal'), 0, 'the ores are gone');
  assert.equal(count(guestGame.inventory, 'cobblestone'), 5, 'what is not an ore stays');
  assert.equal([...guestGame.inventory.hotbar, ...guestGame.inventory.storage].some((s) => /coin/i.test(s?.id ?? '')), false);
  guest.buy('pickaxe');
  await tick([host, guest], 0.5);
  assert.equal(guest.myRecord().pickaxe, 2);
  assert.equal(guest.myRecord().coins, 10 * 20 + 2 * ORE_VALUES.diamond - 500);
  assert.equal(count(guestGame.inventory, 'stone_pickaxe'), 1);
  assert.equal(count(guestGame.inventory, 'wooden_pickaxe'), 0);
});

test('a house upgrade rebuilds the plot bigger and keeps what the chest held', async (t) => {
  const { host, guest, hostGame } = await pair(t);
  const record = host.ledger.get('Hosty');
  const [hut] = plotLayout(record.plot, 1).chests;
  hostGame.chestManager.setChestItems(hut.x, hut.y, hut.z, [{ id: 'raw_iron', isBlock: false, count: 7 }]);
  record.coins = 750;
  host.buy('house');
  await tick([host, guest], 0.5);
  assert.equal(record.house, 2);
  const cottage = plotLayout(record.plot, 2);
  assert.equal(cottage.chests.length, 2);
  const [first] = cottage.chests;
  assert.equal(hostGame.world.getVoxel(first.x, first.y, first.z), BLOCKS.CHEST);
  assert.equal(hostGame.chestManager.getChest(first.x, first.y, first.z).items[0]?.count, 7, 'the chest contents moved in');
});

test('nothing hurts but the Superstick: falls, lava and drowning do nothing, a Superstick hit takes 2.5', async (t) => {
  const { guest, guestGame } = await pair(t);
  guest.protectedUntil = 0;
  guestGame.player.position.set(0.5, WORLD.ground + 1, -14.5); // the plaza, off every plot
  for (const type of ['fall', 'lava', 'drowning', 'fire', 'starvation', 'void', 'explosion', 'arrow']) {
    assert.equal(guest.damageFor(10, type, {}), null, type);
  }
  assert.equal(guest.damageFor(1, 'player', { fromPlayer: true, weapon: 'wooden_pickaxe' }), null, 'a pickaxe hit does nothing');
  assert.equal(guest.damageFor(1, 'player', { fromPlayer: true, weapon: 'stick' }), 2.5);
  guestGame.player.position.set(PLOTS[guest.myRecord().plot].x + 0.5, WORLD.ground + 1, PLOTS[guest.myRecord().plot].z + 0.5);
  assert.equal(guest.damageFor(1, 'player', { fromPlayer: true, weapon: 'stick' }), null, 'safe on your own plot');
});

test('hits: only a Superstick owner may land one, never on someone in their own plot; a kill takes a fifth of the coins', async (t) => {
  const { host, guest, hostGame, guestGame, hostSession, guestSession } = await pair(t);
  const guestId = guestSession.clientId;
  // Both on the plaza, a block apart.
  hostGame.player.position.set(0.5, WORLD.ground + 1, -15.5);
  guestGame.player.position.set(1.5, WORLD.ground + 1, -15.5);
  hostSession.positions.set('host', { x: 0.5, y: WORLD.ground + 1, z: -15.5 });
  hostSession.positions.set(guestId, { x: 1.5, y: WORLD.ground + 1, z: -15.5 });
  host.protection.clear();
  assert.equal(host.canAttack(guestId, 'host'), 'no_superstick');
  host.ledger.get('Guesty').coins = SUPERSTICK_COST;
  guest.buy('superstick');
  await tick([host, guest], 0.5);
  assert.equal(count(guestGame.inventory, 'stick'), 1, 'the Superstick is in the guest\'s inventory');
  assert.equal(host.canAttack(guestId, 'host'), null);
  assert.equal(host.canAttack('host', guestId), 'no_superstick', 'the host has none');
  const home = PLOTS[host.myRecord().plot];
  hostGame.player.position.set(home.x + 0.5, WORLD.ground + 1, home.z + 0.5);
  assert.equal(host.canAttack(guestId, 'host'), 'safe_zone');
  hostGame.player.position.set(0.5, WORLD.ground + 1, -15.5);

  host.ledger.get('Hosty').coins = 1234;
  assert.equal(guestSession.attackPlayer('host', 2.5, { weapon: 'stick' }), null);
  await tick([host, guest], 0.25);
  host.onLocalDeath();
  await tick([host, guest], 0.5);
  assert.equal(host.myRecord().coins, 1234 - 246);
  assert.equal(guest.myRecord().coins, 246);
  assert.equal(plotAt(hostGame.player.position.x, hostGame.player.position.z), host.myRecord().plot, 'respawned at the base');
  assert.equal(host.canAttack(guestId, 'host'), 'spawn_protection');
});

test('only the mines can be dug, each with its own tier of pickaxe; a mined ore grows back after a minute', async (t) => {
  const { host, guest, hostGame } = await pair(t);
  const [wood, stone, iron] = MINES;
  assert.equal(host.canBreakBlock(wood.x, MINE_TOP, wood.z), true, 'a wooden pickaxe digs the Wood Mine');
  assert.equal(host.canBreakBlock(stone.x, MINE_TOP, stone.z), false, 'but not the Stone Mine');
  assert.equal(host.canBreakBlock(iron.x, MINE_TOP, iron.z), false, 'nor the Iron Mine');
  assert.equal(host.canBreakBlock(wood.x, MINE_BOTTOM - 1, wood.z), false, 'nor the bedrock');
  assert.equal(host.canBreakBlock(0, WORLD.ground, 20), false, 'nor the meadow');
  assert.equal(guest.canBreakBlock(wood.x + WORLD.mineHalf + 1, MINE_TOP - 3, wood.z), false, 'nor the mine wall');
  host.ledger.get('Hosty').coins = 500;
  host.buy('pickaxe');
  await tick([host, guest], 0.5);
  assert.equal(host.canBreakBlock(stone.x, MINE_TOP, stone.z), true, 'the stone pickaxe opens the Stone Mine');
  assert.equal(host.canBreakBlock(iron.x, MINE_TOP, iron.z), false);

  const h = WORLD.mineHalf;
  let ore = null;
  for (let x = wood.x - h; x <= wood.x + h && !ore; x++) for (let z = wood.z - h; z <= wood.z + h && !ore; z++) if (mineBlockAt(x, MINE_TOP, z) === BLOCKS.COAL_ORE) ore = [x, MINE_TOP, z];
  assert.ok(ore, 'some coal at the surface');
  // The guest mines it, standing right next to it.
  guest.game.player.position.set(ore[0] + 1.5, MINE_TOP + 1, ore[2] + 0.5);
  guest.game.world.setVoxel(...ore, BLOCKS.AIR);
  guest.game.worldSync.onBlockBroken(...ore);
  await tick([host, guest], 1);
  assert.equal(hostGame.world.getVoxel(...ore), BLOCKS.AIR, 'the host sees it mined');
  await tick([host, guest], 50, 1);
  assert.equal(hostGame.world.getVoxel(...ore), BLOCKS.AIR, 'not back before a minute');
  await tick([host, guest], 12, 1);
  assert.equal(hostGame.world.getVoxel(...ore), BLOCKS.COAL_ORE, 'back after a minute, though the guest stands beside it');
  assert.equal(guest.game.world.getVoxel(...ore), BLOCKS.COAL_ORE, 'and the guest sees it back');
});

test('every player has a house of their own with a chest, seen in every browser', async (t) => {
  const { host, guest, hostGame, guestGame } = await pair(t);
  for (const manager of [host, guest]) {
    const me = manager.myRecord();
    const [chest] = plotLayout(me.plot, me.house).chests;
    for (const game of [hostGame, guestGame]) {
      assert.equal(game.world.getVoxel(chest.x, chest.y, chest.z), BLOCKS.CHEST, `${me.name}'s chest, seen by ${game === hostGame ? 'the host' : 'the guest'}`);
      assert.ok(game.chestManager.getChest(chest.x, chest.y, chest.z), 'and it opens');
    }
  }
});

test('progress is saved: a new session restores coins and levels by name', async (t) => {
  const storage = memoryStorage();
  {
    const { host } = await pair(t, storage);
    host.ledger.get('Guesty').coins = 321;
    host.ledger.get('Guesty').pickaxe = 3;
    host.deactivate();
  }
  const restored = new Ledger(JSON.parse(storage.getItem('blockyland-mining-simulator-v1')));
  assert.equal(restored.get('guesty').coins, 321);
  assert.equal(restored.get('Guesty').pickaxe, 3);
});

test('the whole map fits in the world\'s height', async () => {
  const { CHUNK_HEIGHT } = await import('../src/world.js');
  const { terrainCells } = await import('../src/mods/mining-simulator/world.js');
  const cells = [...terrainCells()];
  for (let plot = 0; plot < PLOTS.length; plot++) for (let level = 1; level <= 5; level++) cells.push(...plotLayout(plot, level).cells);
  const outside = cells.filter(([, y]) => y < 0 || y >= CHUNK_HEIGHT);
  assert.deepEqual(outside.slice(0, 3), [], `every block between y 0 and ${CHUNK_HEIGHT - 1}`);
});
