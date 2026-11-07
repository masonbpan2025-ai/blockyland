// Joining a multiplayer Blockyland game (Base Game shared world, SkyWars, and Bed Wars) as a playable guest
// participant through the MCP server (packages/blockyland-mcp): join_game, guest_status, guest_act, and leave_game.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WebSocket } from 'ws';
import { createShareServer } from '../server/shareServer.js';
import { createAgentControlServer } from '../packages/blockyland-mcp/server.mjs';
import { ShareSession } from '../src/multiplayer/shareSession.js';
import { SignalingClient } from '../src/multiplayer/signaling.js';
import { ChestManager } from '../src/chest.js';
import { SkyWarsManager } from '../src/mods/skywars/client.js';
import { ARENA as SW_ARENA, cellKey } from '../src/mods/skywars/arena.js';
import { BedWarsManager } from '../src/mods/bedwars/client.js';
import { BLOCKS } from '../src/blocks.js';
import { settle } from './helpers/shareFakes.js';

let rpcId = 0;
const rpc = (server, method, params) => server.handle({ jsonrpc: '2.0', id: ++rpcId, method, params });
const call = async (server, name, args = {}) => {
  const response = await rpc(server, 'tools/call', { name, arguments: args });
  const [text] = response.result.content;
  return { isError: response.result.isError, body: JSON.parse(text.text) };
};

/** Encode a sparse voxel map into a minimal RLE chunk mapData so the guest receives the host's blocks. */
function encodeVoxelsAsMapData(voxels) {
  const chunkMap = new Map();
  for (const [k, blockId] of voxels) {
    if (!blockId) continue;
    const [wx, wy, wz] = k.split(',').map(Number);
    if (wy < 0 || wy >= 64) continue;
    const cx = Math.floor(wx / 16);
    const cz = Math.floor(wz / 16);
    const lx = ((wx % 16) + 16) % 16;
    const lz = ((wz % 16) + 16) % 16;
    const ck = `${cx},${cz}`;
    let data = chunkMap.get(ck);
    if (!data) {
      data = new Uint16Array(16 * 64 * 16);
      chunkMap.set(ck, data);
    }
    data[(wy * 16 + lz) * 16 + lx] = blockId;
  }
  const chunks = [];
  for (const [ck, data] of chunkMap) {
    const [x, z] = ck.split(',').map(Number);
    const rle = [];
    let current = data[0];
    let count = 1;
    for (let i = 1; i < data.length; i++) {
      if (data[i] === current) count++;
      else { rle.push(current, count); current = data[i]; count = 1; }
    }
    rle.push(current, count);
    chunks.push({ x, z, rle });
  }
  return { version: 2, name: 'Test World', worldTime: 6000, chunks };
}

/** Build a host game + ShareSession connected to the real local WebSocket share rendezvous. */
async function createHostEnvironment(t) {
  const shareApp = createShareServer({ port: 0 });
  const sharePort = await shareApp.listen(0, '127.0.0.1');
  t.after(() => shareApp.close());
  const shareUrl = `ws://127.0.0.1:${sharePort}/ws/share`;

  const mcpServer = createAgentControlServer({ port: 0, shareUrl, WebSocketImpl: WebSocket });
  const mcpPort = await mcpServer.listen();
  t.after(() => mcpServer.close());
  await rpc(mcpServer, 'initialize', {
    protocolVersion: '2025-06-18',
    clientInfo: { name: 'claude-code', version: '2.1' },
    capabilities: {},
  });

  const voxels = new Map();
  const hostSession = new ShareSession({
    location: { href: `http://127.0.0.1:${sharePort}/`, protocol: 'http:', host: `127.0.0.1:${sharePort}`, search: '' },
    signalingFactory: (url) => new SignalingClient({ url, WebSocketImpl: WebSocket }),
  });
  t.after(() => hostSession.disconnect(true));

  const hostDrops = [];
  const hostChats = [];
  const hostHurt = [];
  const game = {
    gamerules: {},
    worldTime: 6000,
    world: {
      getVoxel: (x, y, z) => voxels.get(cellKey(x, y, z)) ?? BLOCKS.AIR,
      setVoxel: (x, y, z, id) => {
        if (id === BLOCKS.AIR) voxels.delete(cellKey(x, y, z));
        else voxels.set(cellKey(x, y, z), id);
      },
      getChunk: () => null,
    },
    player: {
      position: new THREE.Vector3(0.5, 31, 0.5),
      velocity: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      health: 20,
      maxHealth: 20,
      hunger: 20,
      gamemode: 'survival',
      isDead: false,
      armor: { helmet: null, chestplate: null, leggings: null, boots: null },
      setGameMode(mode) { this.gamemode = mode; },
      respawn() { this.health = 20; this.isDead = false; },
    },
    inventory: {
      activeSlot: 0,
      hotbar: new Array(9).fill(null),
      storage: new Array(27).fill(null),
      armor: { head: null, chest: null, legs: null, feet: null },
      clearCarried() {
        this.hotbar.fill(null);
        this.storage.fill(null);
        this.armor = { head: null, chest: null, legs: null, feet: null };
      },
      getActiveItem() { return this.hotbar[this.activeSlot]; },
      setSlot(area, slot, item) {
        if (area === 'hotbar') this.hotbar[slot] = item;
        else if (area === 'storage') this.storage[slot] = item;
      },
      addItem(idOrObj, isBlock, count, enchantments) {
        const entry = typeof idOrObj === 'object' && idOrObj !== null
          ? { id: idOrObj.id, isBlock: Boolean(idOrObj.isBlock), count: idOrObj.count ?? 1, ...(idOrObj.enchantments ? { enchantments: idOrObj.enchantments } : {}) }
          : { id: idOrObj, isBlock: Boolean(isBlock), count: count ?? 1, ...(enchantments ? { enchantments } : {}) };
        const merge = (arr) => {
          for (const s of arr) {
            if (s && s.id === entry.id && !entry.enchantments && s.count + entry.count <= 64) { s.count += entry.count; return true; }
          }
          const free = arr.findIndex((s) => !s);
          if (free < 0) return false;
          arr[free] = entry;
          return true;
        };
        return merge(this.hotbar) || merge(this.storage);
      },
    },
    entities: {
      droppedItems: hostDrops,
      itemVisuals: { release() {} },
      spawnDroppedItem(pos, itemType, isBlock, count, options = {}) {
        const entry = { group: {}, itemType, isBlock, count, position: pos.clone(), ...options };
        hostDrops.push(entry);
        return entry;
      },
    },
    ui: {
      addChatMessage(msg) { hostChats.push(msg); },
      updateHotbar() {},
      updateStats() {},
    },
    worldSync: {
      isJoined: false,
      roomId: null,
      client: hostSession,
      playerName: () => 'Hosty',
      remotePlayers: { remotePlayers: new Map() },
      async hostWorld({ pvp = true } = {}) {
        const res = await hostSession.hostRoom('Hosty', { settings: { pvp } });
        this.roomId = res.roomId;
        return res;
      },
    },
  };

  game.chestManager = new ChestManager(game);
  game.chestManager.onContentsChanged = (chest) => {
    if (hostSession.connected) hostSession.sendContainer(chest.x, chest.y, chest.z, chest.items);
  };
  hostSession.on('container', ({ x, y, z, items }) => {
    game.chestManager.setChestItems(x, y, z, items, { silent: true });
  });
  hostSession.on('block_update', ({ x, y, z, blockId }) => {
    game.world.setVoxel(x, y, z, blockId);
  });
  hostSession.on('chat', (msg) => hostChats.push(msg));
  hostSession.on('hurt', (hit) => {
    hostHurt.push(hit);
    game.player.health = Math.max(0, game.player.health - hit.damage);
    if (game.player.health <= 0) game.player.isDead = true;
  });
  hostSession.on('request_snapshot', ({ targetPeerId }) => {
    const p = game.player.position;
    void hostSession.sendWorldSnapshot(targetPeerId, {
      mapData: encodeVoxelsAsMapData(voxels),
      hostPos: { x: p.x, y: p.y, z: p.z },
      hostYaw: game.player.yaw,
      worldTime: game.worldTime,
    }).then(() => {
      for (const chest of game.chestManager.chests.values()) {
        if (chest.items.some(Boolean)) hostSession.sendContainer(chest.x, chest.y, chest.z, chest.items);
      }
    });
  });

  return { sharePort, shareUrl, mcpServer, mcpPort, hostSession, game, voxels, hostChats, hostHurt };
}

const tickManagers = async (managers, seconds, step = 0.1) => {
  for (let t = 0; t < seconds; t += step) {
    for (const m of managers) m.update(step);
    await settle(1);
  }
};

test('Base Game (Share World): MCP agent joins by 4-digit code, moves, loots chests, builds/mines blocks, chats, and fights', async (t) => {
  const { mcpServer, hostSession, game, voxels, hostChats, hostHurt } = await createHostEnvironment(t);

  // Build a small stone platform around (0, 30, 0) and place a chest with a diamond sword & cobblestone.
  for (let x = -6; x <= 6; x++) {
    for (let z = -6; z <= 6; z++) {
      voxels.set(cellKey(x, 30, z), BLOCKS.STONE);
    }
  }
  voxels.set(cellKey(2, 31, 0), BLOCKS.CHEST);
  game.chestManager.setChestItems(2, 31, 0, [
    { id: 'diamond_sword', count: 1, isBlock: false },
    { id: BLOCKS.COBBLESTONE, count: 16, isBlock: true },
  ]);
  voxels.set(cellKey(-2, 31, 0), BLOCKS.OAK_PLANKS);

  const { roomId } = await game.worldSync.hostWorld({ pvp: true });
  hostSession.sendPlayerState({ x: 0.5, y: 31, z: 0.5, yaw: 0, pitch: 0, heldItem: null });

  // Join the shared world via MCP join_game
  const joined = await call(mcpServer, 'join_game', { code: roomId, name: 'BuilderBot', autopilot: false });
  assert.equal(joined.isError, false, JSON.stringify(joined.body));
  assert.equal(joined.body.connected, true);
  assert.equal(joined.body.roomCode, roomId);
  assert.equal(joined.body.mod, 'default');
  assert.ok(hostSession.peers.size === 2, 'host sees the joined MCP guest player');

  // Inspect status via guest_status
  const status = await call(mcpServer, 'guest_status', { radius: 16 });
  assert.equal(status.isError, false);
  assert.equal(status.body.nearbyChests.length, 1, 'guest sees the chest and its contents');

  // Loot the chest at (2, 31, 0)
  const looted = await call(mcpServer, 'guest_act', { action: 'loot_chest', position: [2, 31, 0] });
  assert.equal(looted.isError, false, JSON.stringify(looted.body));
  assert.ok(looted.body.taken.some((item) => item.id === 'diamond_sword'));
  assert.equal(looted.body.heldItem?.id, 'diamond_sword', 'auto-equipped the diamond sword');

  // Place a cobblestone block at (1, 31, 1) and verify the host world receives it
  const placed = await call(mcpServer, 'guest_act', {
    action: 'place_block',
    position: [1, 31, 1],
    block: 'cobblestone',
  });
  assert.equal(placed.isError, false, JSON.stringify(placed.body));
  for (let i = 0; i < 15 && game.world.getVoxel(1, 31, 1) !== BLOCKS.COBBLESTONE; i++) await settle(1);
  assert.equal(game.world.getVoxel(1, 31, 1), BLOCKS.COBBLESTONE, 'host world updated with placed block');

  // Break the oak planks block at (-2, 31, 0)
  const broken = await call(mcpServer, 'guest_act', {
    action: 'break_block',
    position: [-2, 31, 0],
  });
  assert.equal(broken.isError, false, JSON.stringify(broken.body));
  for (let i = 0; i < 15 && game.world.getVoxel(-2, 31, 0) !== BLOCKS.AIR; i++) await settle(1);
  assert.equal(game.world.getVoxel(-2, 31, 0), BLOCKS.AIR, 'host world updated with broken block');

  // Send a chat message
  const chatted = await call(mcpServer, 'guest_act', {
    action: 'chat',
    message: 'Hello from MCP guest!',
  });
  assert.equal(chatted.isError, false);
  for (let i = 0; i < 20 && !hostChats.some((c) => c?.text === 'Hello from MCP guest!'); i++) {
    await settle(1);
  }
  assert.ok(hostChats.some((c) => c?.text === 'Hello from MCP guest!'), 'host received guest chat');

  // Attack the host player
  const attacked = await call(mcpServer, 'guest_act', {
    action: 'attack',
    target: 'host',
    count: 1,
  });
  assert.equal(attacked.isError, false, JSON.stringify(attacked.body));
  for (let i = 0; i < 15 && hostHurt.length === 0; i++) await settle(1);
  assert.equal(hostHurt.length, 1, 'host received PvP attack from MCP guest');
  assert.ok(hostHurt[0].damage >= 7, 'diamond sword damage applied');

  // Leave the game
  const left = await call(mcpServer, 'leave_game', {});
  assert.equal(left.isError, false);
  assert.equal(left.body.left, true);
});

test('SkyWars: MCP agent joins by 4-digit lobby code, unlocks match start, loots island chest, bridges, and wins', async (t) => {
  const { mcpServer, hostSession, game } = await createHostEnvironment(t);
  const hostSkywars = new SkyWarsManager(game);
  game.skywars = hostSkywars;
  hostSkywars.activate();
  t.after(() => hostSkywars.deactivate());
  for (let i = 0; i < 60 && !hostSkywars.code; i++) await settle(2);

  const code = hostSkywars.code;
  assert.match(code, /^[0-9]{4}$/, 'SkyWars lobby has a 4-digit code');
  assert.equal(hostSkywars.match.canStart('host').ok, false, 'cannot start alone');

  // MCP agent joins SkyWars using the 4-digit code
  const joined = await call(mcpServer, 'join_game', { code, name: 'SkyAgent', autopilot: false });
  assert.equal(joined.isError, false, JSON.stringify(joined.body));
  await tickManagers([hostSkywars], 1.1);

  assert.equal(hostSkywars.match.players.size, 2, 'SkyWars match has 2 players');
  assert.equal(hostSkywars.match.canStart('host').ok, true, '2 players unlock SkyWars start');

  const lobbyStatus = await call(mcpServer, 'guest_status', {});
  assert.equal(lobbyStatus.body.mod, 'skywars');
  assert.equal(lobbyStatus.body.skywars.phase, 'lobby');
  assert.equal(lobbyStatus.body.skywars.me?.slot, 1, 'assigned island slot 1');
  const spawn1 = hostSkywars.arena.spawns[1];
  assert.ok(Math.hypot(lobbyStatus.body.position[0] - spawn1.x, lobbyStatus.body.position[2] - spawn1.z) < 1.5, 'spawned in cage 1');

  // Host starts the match and ticks through countdown (3s)
  hostSkywars.requestStart();
  await tickManagers([hostSkywars], 3.4);
  assert.equal(hostSkywars.phase, 'playing');
  // Put the host player at center so positions are tracked for combat
  game.player.position.set(0.5, SW_ARENA.surfaceY + 1, 0.5);
  hostSession.sendPlayerState({ x: 0.5, y: SW_ARENA.surfaceY + 1, z: 0.5, yaw: 0, pitch: 0 });
  hostSkywars.update(0.1);
  await settle(3);

  // Agent loots its island chest
  const islandChest = hostSkywars.arena.chests.find((c) => c.slot === 1);
  assert.ok(islandChest, 'island 1 has a chest');
  const looted = await call(mcpServer, 'guest_act', {
    action: 'loot_chest',
    position: [islandChest.x, islandChest.y, islandChest.z],
  });
  assert.equal(looted.isError, false, JSON.stringify(looted.body));
  assert.ok(looted.body.taken.length > 0, 'looted items from the SkyWars island chest');

  // Agent bridges toward the center island
  const bridged = await call(mcpServer, 'guest_act', {
    action: 'bridge_to',
    position: [0.5, SW_ARENA.surfaceY + 1, 0.5],
  });
  assert.equal(bridged.isError, false, JSON.stringify(bridged.body));

  // Agent attacks the host at center and wins the match
  game.player.health = 5;
  const attacked = await call(mcpServer, 'guest_act', {
    action: 'attack',
    target: 'host',
    count: 2,
  });
  assert.equal(attacked.isError, false, JSON.stringify(attacked.body));
  assert.equal(attacked.body.ok, true, JSON.stringify(attacked.body));
  await settle(3);
  if (game.player.isDead) hostSkywars.onLocalDeath();
  await tickManagers([hostSkywars], 0.5);

  assert.equal(hostSkywars.match.phase, 'ended');
  assert.equal(hostSkywars.match.winner, joined.body.clientId, 'MCP agent won the SkyWars match');
});

test('Bed Wars: MCP agent joins by 4-digit code, picks team, collects forge resources, buys from shop, bridges, and breaks enemy bed', async (t) => {
  const { mcpServer, game } = await createHostEnvironment(t);
  const hostBedwars = new BedWarsManager(game);
  game.bedwars = hostBedwars;
  hostBedwars.activate();
  t.after(() => hostBedwars.deactivate());
  for (let i = 0; i < 60 && !hostBedwars.code; i++) await settle(2);

  const code = hostBedwars.code;
  assert.match(code, /^[0-9]{4}$/, 'Bed Wars lobby has a 4-digit code');
  hostBedwars.chooseTeam('red');

  // MCP agent joins Bed Wars and selects blue team
  const joined = await call(mcpServer, 'join_game', { code, name: 'BedAgent', team: 'blue', autopilot: false });
  assert.equal(joined.isError, false, JSON.stringify(joined.body));
  await tickManagers([hostBedwars], 1.1);

  const guestPlayer = hostBedwars.match.players.get(joined.body.clientId);
  assert.ok(guestPlayer, 'host registered the MCP guest in Bed Wars');
  assert.equal(guestPlayer.team, 'blue', 'guest is on blue team');
  assert.equal(hostBedwars.match.canStart('host').ok, true, 'two teams ready to start');

  // Start the match and tick through the 3s countdown + 11s of generator spawns
  hostBedwars.requestStart();
  await tickManagers([hostBedwars], 14.0);
  assert.equal(hostBedwars.phase, 'playing');

  // Agent collects iron and gold from its team forge
  const collected = await call(mcpServer, 'guest_act', {
    action: 'collect_resources',
    target: 'forge',
    duration_ms: 250,
  });
  assert.equal(collected.isError, false, JSON.stringify(collected.body));
  await tickManagers([hostBedwars], 0.5);

  const afterCollect = await call(mcpServer, 'guest_status', {});
  const ironCount = afterCollect.body.bedwars.resources.iron;
  assert.ok(ironCount >= 4, `expected at least 4 iron ingots from team forge, got ${ironCount}`);

  // Agent buys 16 wool from the Bed Wars Item Shop (costs 4 iron)
  const boughtWool = await call(mcpServer, 'guest_act', {
    action: 'buy',
    item: 'wool',
  });
  assert.equal(boughtWool.isError, false, JSON.stringify(boughtWool.body));
  assert.equal(boughtWool.body.bought, 'wool');

  // Agent bridges toward red team's base and breaks red team's bed
  let brokeBed;
  for (let i = 0; i < 4; i++) {
    brokeBed = await call(mcpServer, 'guest_act', { action: 'break_bed', team: 'red' });
    if (brokeBed.body.ok) break;
  }
  assert.equal(brokeBed.isError, false, JSON.stringify(brokeBed.body));
  assert.equal(brokeBed.body.ok, true, JSON.stringify(brokeBed.body));
  await tickManagers([hostBedwars], 0.5);

  assert.equal(hostBedwars.match.teams.get('red').bed, false, 'red bed was destroyed by the MCP guest');
});

test('Autonomous Competitive AI (autopilot: true): SkyWars agent automatically loots chests, bridges to mid, and defeats opponent with zero manual guest_act calls', async (t) => {
  const { mcpServer, hostSession, game, hostHurt } = await createHostEnvironment(t);
  const hostSkywars = new SkyWarsManager(game);
  game.skywars = hostSkywars;
  hostSkywars.activate();
  t.after(() => hostSkywars.deactivate());
  for (let i = 0; i < 60 && !hostSkywars.code; i++) await settle(2);

  // Join with default autopilot: true (verify default difficulty is 'normal')
  const joined = await call(mcpServer, 'join_game', { code: hostSkywars.code, name: 'AutoSkyPro', strategy: 'rusher' });
  assert.equal(joined.isError, false, JSON.stringify(joined.body));
  assert.equal(joined.body.autopilot, true, 'autopilot enabled by default');
  assert.equal(joined.body.difficulty, 'normal', 'difficulty defaults to normal');
  await tickManagers([hostSkywars], 1.1);

  // Host can also switch difficulty in lobby UI (e.g. 'hard' or 'easy') and it syncs to the joined guest
  hostSkywars.chooseDifficulty('hard');
  await tickManagers([hostSkywars], 0.5);
  const syncedDiff = await call(mcpServer, 'guest_status', {});
  assert.equal(syncedDiff.body.difficulty, 'hard', 'host lobby difficulty synced to guest');
  assert.equal(syncedDiff.body.skywars.difficulty, 'hard');

  // Switch back to default 'normal' difficulty and start match
  hostSkywars.chooseDifficulty('normal');
  await tickManagers([hostSkywars], 0.5);

  // Host starts the match and waits for countdown (3s)
  game.player.health = 6;
  hostSkywars.requestStart();
  await tickManagers([hostSkywars], 3.4);
  assert.equal(hostSkywars.phase, 'playing');

  // Place host at center island; let the autonomous agent brain run at human speed
  game.player.position.set(0.5, SW_ARENA.surfaceY + 1, 0.5);
  hostSession.sendPlayerState({ x: 0.5, y: SW_ARENA.surfaceY + 1, z: 0.5, yaw: 0, pitch: 0 });

  for (let i = 0; i < 110 && !game.player.isDead; i++) {
    hostSkywars.update(0.1);
    await new Promise((r) => setTimeout(r, 100));
  }
  if (game.player.isDead) hostSkywars.onLocalDeath();
  await tickManagers([hostSkywars], 0.5);

  const finalStatus = await call(mcpServer, 'guest_status', {});
  assert.ok(hostHurt.length > 0, `expected autonomous SkyWars agent to attack host, got ${hostHurt.length} hits (lastAction: ${finalStatus.body.lastAction})`);
  assert.equal(hostSkywars.match.phase, 'ended');
  assert.equal(hostSkywars.match.winner, joined.body.clientId, 'autonomous SkyWars agent won the match on its own');
});

test('Base Game interactive T chat & Mineflayer API: AI writes code against Mineflayer bot API, replies in chat, and executes actions', async (t) => {
  const { mcpServer, hostSession, game, voxels, hostChats } = await createHostEnvironment(t);

  // Flat grass/stone ground from -16..16 so the agent can walk and build around the player
  for (let x = -16; x <= 16; x++) {
    for (let z = -16; z <= 16; z++) {
      voxels.set(cellKey(x, 30, z), BLOCKS.STONE);
    }
  }

  const { roomId } = await game.worldSync.hostWorld({ pvp: true });
  game.player.position.set(0.5, 31, 0.5);
  hostSession.sendPlayerState({ x: 0.5, y: 31, z: 0.5, yaw: 0, pitch: 0, heldItem: null });

  // Supply a mock AI brain to the joined companion bot that decides whether to chat or write Mineflayer code
  const mockAiBrain = async ({ sender, message, world }) => {
    const text = message.toLowerCase();
    if (text.includes('how are you') || text.includes('hello') || text.includes('hey')) {
      return { reply: `Hello ${sender}! I am doing great!`, code: null };
    }
    if (text.includes('stay') || text.includes('wait')) {
      return {
        reply: `Staying right here, ${sender}!`,
        code: `bot.pathfinder.stop(); bot.clearControlStates();`,
      };
    }
    if (text.includes('come with') || text.includes('follow')) {
      return {
        reply: `On my way ${sender}!`,
        code: `
          const target = bot.players['${sender}']?.entity || player;
          if (target) {
            await bot.pathfinder.goto(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 2));
            bot.chat('Here I am with you!');
          }
        `,
      };
    }
    if (text.includes('tower')) {
      return {
        reply: `Building a cobblestone pillar tower for you, ${sender}!`,
        code: `
          const base = bot.entity.position.floored().offset(2, 0, 0);
          bot._session.inventory.addItem(BLOCKS.COBBLESTONE, true, 32);
          for (let y = 0; y < 4; y++) {
            bot._session.placeBlockAt(base.x, base.y + y, base.z, BLOCKS.COBBLESTONE);
          }
          bot.chat('Finished the tower!');
        `,
      };
    }
    if (text.includes('sword') && text.includes('pickaxe')) {
      return {
        reply: `Crafting a wooden sword and pickaxe for you, ${sender}!`,
        code: `
          // Acquire oak_planks and sticks, craft sword and pickaxe using Mineflayer recipes
          bot._session.inventory.addItem('oak_planks', true, 16);
          bot._session.inventory.addItem('stick', false, 8);
          bot._session.placeBlockAt(Math.floor(bot.entity.position.x) + 1, Math.floor(bot.entity.position.y), Math.floor(bot.entity.position.z), BLOCKS.CRAFTING_TABLE);
          const table = bot.findBlock({ matching: mcData.blocksByName.crafting_table.id, maxDistance: 4 });
          const [swordRecipe] = bot.recipesFor(mcData.itemsByName.wooden_sword.id, null, 1, table);
          const [pickRecipe] = bot.recipesFor(mcData.itemsByName.wooden_pickaxe.id, null, 1, table);
          await bot.craft(swordRecipe, 1, table);
          await bot.craft(pickRecipe, 1, table);
          await bot.lookAt(player ? player.position : bot.entity.position);
          await bot.toss(mcData.itemsByName.wooden_sword.id, null, 1);
          await bot.toss(mcData.itemsByName.wooden_pickaxe.id, null, 1);
          bot.chat('I crafted your wooden sword and wooden pickaxe!');
        `,
      };
    }
    return { reply: `I hear you, ${sender}!`, code: null };
  };

  const joined = await call(mcpServer, 'join_game', { code: roomId, name: 'CompanionBot', autopilot: false });
  assert.equal(joined.isError, false, JSON.stringify(joined.body));
  assert.equal(joined.body.difficulty, 'normal', 'defaults to normal human-like speed');

  const guestSession = mcpServer.state.activeGuest;
  guestSession.brain = mockAiBrain;

  // 1. Verify human movement speed (~4.3 to 5.6 blocks/sec, not instant teleport)
  const moveStart = Date.now();
  const moved = await call(mcpServer, 'guest_act', {
    action: 'move',
    direction: 'east',
    distance: 3,
  });
  const moveElapsedMs = Date.now() - moveStart;
  assert.equal(moved.isError, false);
  assert.ok(moveElapsedMs >= 350, `expected human walking/sprinting cadence (>=350ms for 3 blocks), took ${moveElapsedMs}ms`);

  // 2. Player presses T and sends a casual chat message -> AI replies in chat ONLY without taking action or moving
  const posBeforeChat = (await call(mcpServer, 'guest_status', {})).body.position;
  const blocksBeforeChat = voxels.size;
  hostChats.length = 0;
  hostSession.sendChat('hey there! how are you doing today?');

  for (let i = 0; i < 30 && !hostChats.some((c) => c?.sender === 'CompanionBot'); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  const casualReply = hostChats.find((c) => c?.sender === 'CompanionBot');
  assert.ok(casualReply, 'AI replied in chat to casual player message');
  const posAfterChat = (await call(mcpServer, 'guest_status', {})).body.position;
  assert.deepEqual(posAfterChat, posBeforeChat, 'bot did not move when player was just chatting');
  assert.equal(voxels.size, blocksBeforeChat, 'bot did not place/break blocks when player was just chatting');

  // 3. Player asks agent to stay put -> AI writes and executes code to stop pathfinder
  hostChats.length = 0;
  hostSession.sendChat('please stay here and wait');
  for (let i = 0; i < 30 && !hostChats.some((c) => c?.sender === 'CompanionBot'); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(hostChats.some((c) => c?.sender === 'CompanionBot'), 'agent acknowledged stay command in chat');

  // 4. Player walks away and asks in T chat to come with them -> AI writes code using bot.pathfinder.goto
  game.player.position.set(-6.5, 31, 0.5);
  hostSession.sendPlayerState({ x: -6.5, y: 31, z: 0.5, yaw: 0, pitch: 0 });
  await settle(2);
  hostChats.length = 0;
  hostSession.sendChat('come with me over here!');
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 60));
    const st = (await call(mcpServer, 'guest_status', {})).body;
    if (Math.hypot(st.position[0] - (-6.5), st.position[2] - 0.5) <= 3.0) break;
  }
  const followStatus = (await call(mcpServer, 'guest_status', {})).body;
  assert.ok(hostChats.some((c) => c?.sender === 'CompanionBot'), 'agent replied in chat before walking to player');
  assert.ok(
    Math.hypot(followStatus.position[0] - (-6.5), followStatus.position[2] - 0.5) <= 3.5,
    `expected agent to walk to player at (-6.5, 0.5), got ${JSON.stringify(followStatus.position)}`
  );

  // 5. Player asks agent in T chat to build a tower -> AI writes code to place blocks
  hostChats.length = 0;
  const blocksBeforeBuild = voxels.size;
  hostSession.sendChat('can you build a cobblestone tower for us?');
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 60));
    const replies = hostChats.filter((c) => c?.sender === 'CompanionBot');
    if (replies.length >= 2 && voxels.size > blocksBeforeBuild + 2) break;
  }
  const buildReplies = hostChats.filter((c) => c?.sender === 'CompanionBot');
  assert.ok(buildReplies.length >= 1, 'agent replied in chat when asked to build a tower');
  assert.ok(voxels.size > blocksBeforeBuild + 2, `expected agent to place tower blocks in world (before=${blocksBeforeBuild}, after=${voxels.size})`);

  // 6. Player asks agent to "build wooden sword and pickaxe" -> AI writes code using bot.recipesFor, bot.craft, and bot.toss!
  hostChats.length = 0;
  const blocksBeforeCraft = voxels.size;
  const hostReceivedDrops = [];
  hostSession.on('drops', ({ drops }) => hostReceivedDrops.push(...drops));
  hostSession.sendChat('build wooden sword and pickaxe');
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 60));
    const replies = hostChats.filter((c) => c?.sender === 'CompanionBot');
    if (replies.length >= 2 && hostReceivedDrops.length >= 2) break;
  }
  const craftReplies = hostChats.filter((c) => c?.sender === 'CompanionBot');
  assert.ok(craftReplies.some((c) => /wooden sword/i.test(c.text) && /wooden pickaxe/i.test(c.text)), 'agent confirmed crafting wooden sword and wooden pickaxe');
  assert.ok(voxels.size - blocksBeforeCraft <= 2, 'agent did not build a 70-block house when asked to build a wooden sword and pickaxe');
  assert.ok(hostReceivedDrops.some((d) => d.item?.id === 'wooden_sword'), 'host received dropped wooden_sword');
  assert.ok(hostReceivedDrops.some((d) => d.item?.id === 'wooden_pickaxe'), 'host received dropped wooden_pickaxe');

  // 7. Verify guest_act run_code action directly executes Mineflayer code
  const codeResult = await call(mcpServer, 'guest_act', {
    action: 'run_code',
    code: 'bot.chat("Mineflayer code execution verified!"); return { health: bot.health, items: bot.inventory.items().length };',
  });
  assert.equal(codeResult.isError, false, JSON.stringify(codeResult.body));
  assert.equal(codeResult.body.result?.health, 20);
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(hostChats.some((c) => c.text === 'Mineflayer code execution verified!'));

  // 8. Verify auto-crafting from raw logs without prior planks/sticks/table
  const autoCraftResult = await call(mcpServer, 'guest_act', {
    action: 'run_code',
    code: `
      bot._session.inventory.addItem('oak_log', true, 3);
      await bot.craft('wooden_pickaxe', 1);
      return {
        hasPickaxe: bot.inventory.count('wooden_pickaxe'),
        hasSticks: bot.inventory.count('stick'),
      };
    `,
  });
  assert.equal(autoCraftResult.isError, false, JSON.stringify(autoCraftResult.body));
  assert.equal(autoCraftResult.body.result?.hasPickaxe, 1, 'auto-crafted wooden_pickaxe from logs');

  // 9. Verify informative error when recipe is undefined
  const undefinedCraftResult = await call(mcpServer, 'guest_act', {
    action: 'run_code',
    code: 'await bot.craft(undefined);',
  });
  assert.equal(undefinedCraftResult.body.ok, false);
  assert.ok(undefinedCraftResult.body.error.includes('No recipe provided to bot.craft()'));

  // 10. Verify automated code syntax repair for common LLM quirks (trailing braces, uncalled functions)
  const trailingBraceResult = await call(mcpServer, 'guest_act', {
    action: 'run_code',
    code: 'return 42;\n}\n}\n;',
  });
  assert.equal(trailingBraceResult.isError, false);
  assert.equal(trailingBraceResult.body.result, 42, 'repaired trailing braces successfully');

  const fnResult = await call(mcpServer, 'guest_act', {
    action: 'run_code',
    code: 'async function() { return 99; }',
  });
  assert.equal(fnResult.isError, false);
  assert.equal(fnResult.body.result, 99, 'wrapped and executed anonymous function successfully');

  // 11. Full Minecraft survival progression tree: bare hands -> wood -> stone -> furnace -> iron tools
  const progressionResult = await call(mcpServer, 'guest_act', {
    action: 'run_code',
    code: `
      // Setup world blocks around the bot
      const pos = bot.entity.position.floored();
      // Put a solid platform under the bot
      for (let dx = -4; dx <= 4; dx++) {
        for (let dz = -4; dz <= 4; dz++) {
          bot._session.setVoxel(pos.x + dx, pos.y - 1, pos.z + dz, BLOCKS.DIRT);
        }
      }
      // Place progression blocks
      const logPos = pos.offset(2, 0, 0);
      const stonePos1 = pos.offset(0, 0, 2);
      const stonePos2 = pos.offset(0, 0, 3);
      const ironOrePos1 = pos.offset(-2, 0, 0);
      const ironOrePos2 = pos.offset(-3, 0, 0);
      const coalOrePos = pos.offset(0, 0, -2);

      bot._session.setVoxel(logPos.x, logPos.y, logPos.z, BLOCKS.OAK_LOG);
      bot._session.setVoxel(stonePos1.x, stonePos1.y, stonePos1.z, BLOCKS.STONE);
      bot._session.setVoxel(stonePos2.x, stonePos2.y, stonePos2.z, BLOCKS.STONE);
      bot._session.setVoxel(ironOrePos1.x, ironOrePos1.y, ironOrePos1.z, BLOCKS.IRON_ORE);
      bot._session.setVoxel(ironOrePos2.x, ironOrePos2.y, ironOrePos2.z, BLOCKS.IRON_ORE);
      bot._session.setVoxel(coalOrePos.x, coalOrePos.y, coalOrePos.z, BLOCKS.COAL_ORE);

      // --- Step A: Bare hands harvest test ---
      // Bare hands digging stone should NOT yield cobblestone
      const cobbleBeforeHand = bot.inventory.count('cobblestone');
      await bot.dig(bot.blockAt(stonePos1));
      const cobbleAfterHand = bot.inventory.count('cobblestone');
      const handStoneDropBlocked = (cobbleBeforeHand === cobbleAfterHand);

      // Bare hands digging wood yields oak_log
      await bot.dig(bot.blockAt(logPos));
      const gotLog = bot.inventory.count('oak_log') > 0;

      // --- Step B: Craft wooden pickaxe from logs ---
      // Add extra logs for planks/sticks
      bot._session.inventory.addItem('oak_log', true, 4);
      await bot.craft('wooden_pickaxe', 1);
      const gotWoodenPick = bot.inventory.count('wooden_pickaxe') > 0;
      await bot.equip('wooden_pickaxe', 'hand');

      // --- Step C: Wooden pickaxe harvests stone ---
      await bot.dig(bot.blockAt(stonePos2));
      const gotCobblestone = bot.inventory.count('cobblestone') > 0;

      // Wooden pickaxe on iron ore should NOT yield raw_iron (tier gate)
      const rawIronBefore = bot.inventory.count('raw_iron');
      await bot.dig(bot.blockAt(ironOrePos1));
      const rawIronAfterWooden = bot.inventory.count('raw_iron');
      const woodenIronDropBlocked = (rawIronBefore === rawIronAfterWooden);

      // --- Step D: Stone Tier ---
      // Add enough cobblestone to craft stone_pickaxe and furnace
      bot._session.inventory.addItem('cobblestone', true, 12);
      await bot.craft('stone_pickaxe', 1);
      const gotStonePick = bot.inventory.count('stone_pickaxe') > 0;
      await bot.equip('stone_pickaxe', 'hand');

      // --- Step E: Stone pickaxe harvests iron ore and coal ---
      await bot.dig(bot.blockAt(ironOrePos2));
      const gotRawIron = bot.inventory.count('raw_iron') > 0;

      await bot.dig(bot.blockAt(coalOrePos));
      const gotCoal = bot.inventory.count('coal') > 0;

      // --- Step F: Furnace & Smelting to Iron Tier ---
      // Add more raw iron and coal for full iron tools set
      bot._session.inventory.addItem('raw_iron', false, 5);
      bot._session.inventory.addItem('coal', false, 2);

      // Smelt raw iron using furnace
      await bot.smelt('raw_iron', 'coal', 3);
      const gotIronIngot = bot.inventory.count('iron_ingot') >= 3;

      // Craft iron pickaxe using iron ingots
      await bot.craft('iron_pickaxe', 1);
      const gotIronPick = bot.inventory.count('iron_pickaxe') > 0;

      // Auto-smelt remaining raw iron into iron sword directly via bot.craft
      await bot.craft('iron_sword', 1);
      const gotIronSword = bot.inventory.count('iron_sword') > 0;

      await bot.equip('iron_sword', 'hand');
      const heldIsIronSword = bot.heldItem?.name === 'iron_sword';

      return {
        handStoneDropBlocked,
        gotLog,
        gotWoodenPick,
        gotCobblestone,
        woodenIronDropBlocked,
        gotStonePick,
        gotRawIron,
        gotCoal,
        gotIronIngot,
        gotIronPick,
        gotIronSword,
        heldIsIronSword,
      };
    `,
  });
  assert.equal(progressionResult.isError, false, JSON.stringify(progressionResult.body));
  const pRes = progressionResult.body.result;
  assert.ok(pRes.handStoneDropBlocked, 'bare hands cannot harvest stone (vanilla gate)');
  assert.ok(pRes.gotLog, 'bare hands harvested oak_log');
  assert.ok(pRes.gotWoodenPick, 'crafted wooden_pickaxe from logs');
  assert.ok(pRes.gotCobblestone, 'wooden pickaxe harvested stone into cobblestone');
  assert.ok(pRes.woodenIronDropBlocked, 'wooden pickaxe cannot harvest iron ore (vanilla gate)');
  assert.ok(pRes.gotStonePick, 'crafted stone_pickaxe');
  assert.ok(pRes.gotRawIron, 'stone pickaxe harvested iron ore into raw_iron');
  assert.ok(pRes.gotCoal, 'harvested coal ore into coal');
  assert.ok(pRes.gotIronIngot, 'furnace smelted raw_iron into iron_ingot');
  assert.ok(pRes.gotIronPick, 'crafted iron_pickaxe');
  assert.ok(pRes.gotIronSword, 'crafted iron_sword with auto-smelting');
  assert.ok(pRes.heldIsIronSword, 'equipped iron_sword in hand');
});

test('guest peer: bot.craft auto-gathers logs from world to craft multiple wooden tools without prior inventory', async (t) => {
  const { mcpServer, hostSession, game } = await createHostEnvironment(t);
  const { roomId } = await game.worldSync.hostWorld({ pvp: true });
  const joined = await call(mcpServer, 'join_game', { code: roomId, name: 'GatherBot', autopilot: false });
  assert.equal(joined.isError, false, JSON.stringify(joined.body));

  const runResult = await call(mcpServer, 'guest_act', {
    action: 'run_code',
    code: `
      const pos = bot.entity.position.floored();
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          bot._session.setVoxel(pos.x + dx, pos.y - 1, pos.z + dz, BLOCKS.DIRT);
        }
      }
      bot._session.setVoxel(pos.x + 1, pos.y, pos.z, BLOCKS.OAK_LOG);
      bot._session.setVoxel(pos.x - 1, pos.y, pos.z, BLOCKS.OAK_LOG);
      bot._session.setVoxel(pos.x, pos.y, pos.z + 1, BLOCKS.OAK_LOG);
      bot._session.setVoxel(pos.x, pos.y, pos.z - 1, BLOCKS.OAK_LOG);

      await bot.craft('wooden_pickaxe', 1);
      await bot.craft('wooden_axe', 1);
      await bot.craft('wooden_shovel', 1);

      return {
        pickaxe: bot.inventory.count('wooden_pickaxe'),
        axe: bot.inventory.count('wooden_axe'),
        shovel: bot.inventory.count('wooden_shovel'),
      };
    `,
  });

  assert.equal(runResult.isError, false, JSON.stringify(runResult.body));
  const res = runResult.body.result;
  assert.equal(res.pickaxe, 1, 'crafted wooden_pickaxe with auto-gathered wood');
  assert.equal(res.axe, 1, 'crafted wooden_axe with auto-gathered wood');
  assert.equal(res.shovel, 1, 'crafted wooden_shovel with auto-gathered wood');
});




