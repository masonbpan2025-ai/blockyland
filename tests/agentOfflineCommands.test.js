import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiAgent } from '../src/worldAgent.js';
import { BLOCKS } from '../src/blocks.js';

function createAgentFixture() {
  const cells = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  const natural = (y) => (y < 10 ? BLOCKS.DIRT : y === 10 ? BLOCKS.GRASS : BLOCKS.AIR);

  const inventoryItems = [];
  const droppedEntities = [];
  const chatMessages = [];
  const spawnedMobs = [];
  let lightningStrikes = [];

  const game = {
    player: {
      position: {
        x: 0,
        y: 12,
        z: 0,
        set(x, y, z) {
          this.x = x;
          this.y = y;
          this.z = z;
        },
      },
      velocity: {
        x: 0,
        y: 0,
        z: 0,
        set(x, y, z) {
          this.x = x;
          this.y = y;
          this.z = z;
        },
      },
      fallDistance: 5,
      yaw: 0,
      pitch: 0,
      health: 20,
      maxHealth: 20,
      hunger: 20,
      maxHunger: 20,
      gamemode: 'survival',
      isFlying: true,
      difficulty: 'normal',
      statusEffects: new Map(),
      applyStatusEffect(effect, duration, amplifier = 0) {
        this.statusEffects.set(effect, { duration, amplifier });
      },
      clearStatusEffect(effect) {
        this.statusEffects.delete(effect);
      },
      die() {
        this.health = 0;
      },
    },
    worldTime: 6000,
    difficulty: 'normal',
    settings: {
      gameMode: 'survival',
      difficulty: 'normal',
      cheats: true,
    },
    world: {
      getVoxel: (x, y, z) => cells.get(key(x, y, z)) ?? natural(y),
      setVoxel: (x, y, z, id) => {
        cells.set(key(x, y, z), id);
      },
      getOrCreateChunk: () => null,
      chunks: new Map(),
    },
    inventory: {
      items: inventoryItems,
      addItem(id, isBlock, count = 1) {
        this.items.push({ id, isBlock, count });
        return true;
      },
      countRoomFor() {
        return 9999;
      },
    },
    entities: {
      spawnDroppedItem(pos, id, isBlock, count) {
        droppedEntities.push({ pos, id, isBlock, count });
      },
    },
    mobs: {
      mobs: spawnedMobs,
      spawnMob(type, x, y, z, options = {}) {
        const mob = {
          type,
          mesh: { position: { x, y, z } },
          health: 20,
          options,
          dead: false,
        };
        this.mobs.push(mob);
        return mob;
      },
      damageMob(mob, amount) {
        mob.health = Math.max(0, mob.health - amount);
        if (mob.health <= 0) mob.dead = true;
      },
    },
    weather: {
      current: 'clear',
      duration: 0,
      setWeather(type, duration = 0) {
        this.current = type;
        this.duration = duration;
      },
      triggerLightning(ambient, sun, pos) {
        lightningStrikes.push(pos);
        return true;
      },
    },
    sounds: {
      playMagic() {},
      playLevelUp() {},
      playClick() {},
    },
    ui: {
      chat: chatMessages,
      addChatMessage(text, type = 'system') {
        this.chat.push({ text, type });
      },
      updateHotbar() {},
    },
    rebuildChunkMesh() {},
    loadChunksAroundPlayer() {},
  };

  const agent = new GeminiAgent(game);
  const logs = [];
  agent.onLog = (message, type) => logs.push({ message, type });

  return {
    agent,
    game,
    cells,
    logs,
    inventoryItems,
    droppedEntities,
    chatMessages,
    spawnedMobs,
    getLightningStrikes: () => lightningStrikes,
  };
}

test('offline mode: weather controls (rain, thunder, clear with duration)', async () => {
  const { agent, game } = createAgentFixture();

  await agent.executePrompt('/weather rain 300');
  assert.equal(game.weather.current, 'rain');
  assert.equal(game.weather.duration, 300);

  await agent.executePrompt('thunderstorm');
  assert.equal(game.weather.current, 'thunder');

  await agent.executePrompt('make it clear');
  assert.equal(game.weather.current, 'clear');
});

test('offline mode: time controls (named times, ticks, add)', async () => {
  const { agent, game } = createAgentFixture();

  await agent.executePrompt('/time set night');
  assert.equal(game.worldTime, 18000);

  await agent.executePrompt('time noon');
  assert.equal(game.worldTime, 6000);

  await agent.executePrompt('/time set 14000');
  assert.equal(game.worldTime, 14000);

  await agent.executePrompt('/time add 2000');
  assert.equal(game.worldTime, 16000);

  await agent.executePrompt('sunrise');
  assert.equal(game.worldTime, 0);

  await agent.executePrompt('sunset');
  assert.equal(game.worldTime, 12000);
});

test('offline mode: gamemode and difficulty controls', async () => {
  const { agent, game } = createAgentFixture();

  await agent.executePrompt('/gamemode creative');
  assert.equal(game.player.gamemode, 'creative');
  assert.equal(game.settings.gameMode, 'creative');

  await agent.executePrompt('/gamemode survival');
  assert.equal(game.player.gamemode, 'survival');
  assert.equal(game.player.isFlying, false);

  await agent.executePrompt('/gamemode spectator');
  assert.equal(game.player.gamemode, 'spectator');

  await agent.executePrompt('/difficulty peaceful');
  assert.equal(game.difficulty, 'peaceful');
  assert.equal(game.player.difficulty, 'peaceful');
  assert.equal(game.settings.difficulty, 'peaceful');

  await agent.executePrompt('/difficulty hard');
  assert.equal(game.difficulty, 'hard');
});

test('offline mode: heal and feed', async () => {
  const { agent, game } = createAgentFixture();
  game.player.health = 5;
  game.player.hunger = 3;

  await agent.executePrompt('/heal');
  assert.equal(game.player.health, 20);
  assert.equal(game.player.hunger, 20);

  game.player.hunger = 8;
  await agent.executePrompt('feed me');
  assert.equal(game.player.hunger, 20);
});

test('offline mode: mob spawning and summoning with coordinates and lightning', async () => {
  const { agent, game, spawnedMobs, getLightningStrikes } = createAgentFixture();

  await agent.executePrompt('/summon cow');
  assert.ok(spawnedMobs.some((m) => m.type === 'cow'));

  await agent.executePrompt('/spawn zombie 3');
  const zombies = spawnedMobs.filter((m) => m.type === 'zombie');
  assert.equal(zombies.length, 3);

  await agent.executePrompt('spawn warden');
  assert.ok(spawnedMobs.some((m) => m.type === 'warden'));

  await agent.executePrompt('/summon pig 10 65 20');
  const customPig = spawnedMobs.find((m) => m.type === 'pig' && m.mesh.position.x === 10);
  assert.ok(customPig);
  assert.equal(customPig.mesh.position.y, 65);
  assert.equal(customPig.mesh.position.z, 20);

  await agent.executePrompt('/summon lightning_bolt');
  assert.ok(getLightningStrikes().length >= 1);
});

test('offline mode: give command with items, blocks, bundles, and counts', async () => {
  const { agent, inventoryItems } = createAgentFixture();

  await agent.executePrompt('/give @p diamond 64');
  assert.ok(inventoryItems.some((i) => i.id === 'diamond' && i.count === 64));

  await agent.executePrompt('/give @p oak_planks 32');
  assert.ok(inventoryItems.some((i) => i.count === 32));

  await agent.executePrompt('give me full diamond armor');
  assert.ok(inventoryItems.some((i) => i.id === 'diamond_helmet'));
  assert.ok(inventoryItems.some((i) => i.id === 'diamond_chestplate'));
  assert.ok(inventoryItems.some((i) => i.id === 'diamond_leggings'));
  assert.ok(inventoryItems.some((i) => i.id === 'diamond_boots'));

  await agent.executePrompt('give food');
  assert.ok(inventoryItems.some((i) => i.id === 'bread'));

  await agent.executePrompt('give 16 torches and 64 glass');
  assert.ok(inventoryItems.some((i) => i.count === 16));
  assert.ok(inventoryItems.some((i) => i.count === 64));
});

test('offline mode: teleportation (coordinates, spawn)', async () => {
  const { agent, game } = createAgentFixture();

  await agent.executePrompt('/tp 120 75 -240');
  assert.equal(game.player.position.x, 120);
  assert.equal(game.player.position.y, 75);
  assert.equal(game.player.position.z, -240);
  assert.equal(game.player.velocity.x, 0);
  assert.equal(game.player.fallDistance, 0);

  await agent.executePrompt('/tp spawn');
  // Teleport to spawn executes placePlayerOnSurface
  assert.equal(agent.lastError, null);
});

test('offline mode: kill entities', async () => {
  const { agent, game, spawnedMobs } = createAgentFixture();

  game.mobs.spawnMob('zombie', 0, 10, 0);
  game.mobs.spawnMob('skeleton', 1, 10, 0);
  game.mobs.spawnMob('cow', 2, 10, 0);

  // Kill monsters
  await agent.executePrompt('/kill hostile');
  const zombie = spawnedMobs.find((m) => m.type === 'zombie');
  const skeleton = spawnedMobs.find((m) => m.type === 'skeleton');
  const cow = spawnedMobs.find((m) => m.type === 'cow');

  assert.equal(zombie.dead, true);
  assert.equal(skeleton.dead, true);
  assert.equal(cow.dead, false);

  // Kill player
  await agent.executePrompt('/kill @s');
  assert.equal(game.player.health, 0);
});

test('offline mode: status effects (apply and clear)', async () => {
  const { agent, game } = createAgentFixture();

  await agent.executePrompt('/effect give @p speed 30 1');
  assert.ok(game.player.statusEffects.has('speed'));
  assert.equal(game.player.statusEffects.get('speed').duration, 30);
  assert.equal(game.player.statusEffects.get('speed').amplifier, 1);

  await agent.executePrompt('/effect clear @p speed');
  assert.ok(!game.player.statusEffects.has('speed'));

  await agent.executePrompt('/effect give @p strength 60');
  await agent.executePrompt('/effect give @p regeneration 45');
  assert.equal(game.player.statusEffects.size, 2);

  await agent.executePrompt('/effect clear @p');
  assert.equal(game.player.statusEffects.size, 0);
});

test('offline mode: direct slash command fallback and build intent protection', async () => {
  const { agent, game, logs } = createAgentFixture();

  // /seed runs directly via buildCommandContext + runCommand
  await agent.executePrompt('/seed');
  assert.equal(agent.lastError, null);

  // explicit build requests without API key must continue to explain API key requirement
  await agent.executePrompt('build a flying dragon');
  assert.equal(agent.lastError, null);
  assert.ok(logs.some((l) => /API key/.test(l.message)));
});
