// The game side of Agent Control (src/agentControl/gameTools.js), on a real WorldAgent in a small flat world: what an
// AI app's run_plan, run_command, say, screenshot, look_around and the rest do to the game.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldAgent } from '../src/worldAgent.js';
import { BLOCKS } from '../src/blocks.js';
import { runGameTool, planActions, commandName, ToolFailure } from '../src/agentControl/gameTools.js';

/** Dirt below y=10, grass at 10, air above; the player stands at (0, 11, 0) facing north. */
function flatWorld() {
  const cells = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  const natural = y => (y < 10 ? BLOCKS.DIRT : y === 10 ? BLOCKS.GRASS : BLOCKS.AIR);
  const vector = (x, y, z) => ({ x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; } });
  const chat = [];
  const replies = [];
  const game = {
    player: {
      position: vector(0.5, 11, 0.5), velocity: vector(0, 0, 0), yaw: 0, pitch: 0,
      health: 18, maxHealth: 20, hunger: 15, gamemode: 'creative', statusEffects: new Map(),
    },
    worldTime: 6000,
    currentDimension: 'overworld',
    settings: { gameMode: 'creative', difficulty: 'normal', cheats: true },
    world: {
      getVoxel: (x, y, z) => cells.get(key(x, y, z)) ?? natural(y),
      setVoxel: (x, y, z, id) => { cells.set(key(x, y, z), id); },
      getOrCreateChunk: () => null,
      invalidateChunkCache: () => {},
      chunks: new Map(),
    },
    inventory: {
      activeSlot: 0,
      hotbar: [{ id: BLOCKS.STONE, count: 12, name: 'Stone' }, null, null, null, null, null, null, null, null],
      getActiveItem() { return this.hotbar[this.activeSlot]; },
      addItem() { return true; },
      countRoomFor() { return 9999; },
    },
    mobs: { mobs: [], spawnMob() { return null; } },
    weather: { weatherType: 'clear', setWeather(type) { this.weatherType = type; } },
    sounds: { playMagic() {}, playLevelUp() {}, playClick() {} },
    ui: {
      addChatMessage(text, kind = 'system') { chat.push({ text, kind }); },
      addAgentReply(text, label) { replies.push({ text, label }); },
      updateHotbar() {},
    },
    rebuildChunkMesh() {},
    loadChunksAroundPlayer() {},
  };
  const agent = new WorldAgent(game);
  const logs = [];
  agent.onLog = (message, type) => logs.push({ message, type });
  const count = id => [...cells.values()].filter(v => v === id).length;
  const ctx = (extra = {}) => ({ game, agent, ui: game.ui, clientLabel: () => 'Claude Code', allowScreenshots: () => true, ...extra });
  return { game, agent, cells, count, chat, replies, logs, ctx };
}

const pillar = (height = 3) => ({
  action: 'build', name: 'Stone pillar', buildingType: 'custom', explanation: 'A stone pillar',
  dimensions: { width: 1, height, depth: 1 },
  operations: [{ type: 'fill_box', min: [0, 0, 0], max: [0, height - 1, 0], block: 'STONE' }],
});

async function failure(promise) {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof ToolFailure, `expected a ToolFailure, got ${err}`);
    return err;
  }
  assert.fail('expected the tool to fail');
}

test('run_plan builds in the world and reports the building with its id', async () => {
  const { count, ctx, logs } = flatWorld();
  const { result } = await runGameTool('run_plan', { plan: pillar(4), request: 'build a stone pillar' }, ctx());
  assert.equal(result.ok, true);
  assert.equal(count(BLOCKS.STONE), 4, 'exactly the four blocks of the pillar were placed');
  assert.equal(result.buildings.length, 1);
  const [building] = result.buildings;
  assert.ok(building.id, 'the building has an id for later edits');
  assert.deepEqual(building.size, [1, 4, 1]);
  assert.ok(result.log.length > 0, 'what happened is reported back');
  assert.ok(logs.some(l => l.message.includes('Claude Code: A stone pillar')), 'the terminal shows who asked for it');
});

test('a real build streams measured progress while preserving the terminal callback', async () => {
  const { agent, ctx, count } = flatWorld();
  const terminal = [], remote = [];
  const original = (pct, label) => terminal.push([pct, label]);
  agent.onProgress = original;
  await runGameTool('run_plan', { plan: pillar(8) }, ctx({ onProgress: (pct, label) => remote.push([pct, label]) }));
  assert.equal(count(BLOCKS.STONE), 8);
  assert.ok(remote.length > 0, 'a caller sees build progress before its result');
  assert.deepEqual(remote, terminal);
  assert.ok(remote.every(([pct, label]) => Number.isFinite(pct) && pct >= 0 && pct <= 100 && typeof label === 'string'));
  assert.equal(agent.onProgress, original);
  const before = remote.length;
  agent.onProgress(10, 'A later offline task');
  assert.equal(remote.length, before, 'the finished MCP call no longer receives updates');
});

test('chat names the AI app as the builder, not a vendor', async () => {
  const { agent, chat, ctx } = flatWorld();
  agent.chatLabel = 'World Agent';
  await runGameTool('run_plan', { plan: pillar() }, ctx());
  const mirrored = chat.filter(c => c.text.startsWith('✦'));
  assert.ok(mirrored.length > 0, 'the build is mirrored to chat');
  assert.ok(mirrored.every(c => c.text.startsWith('✦ [Claude Code]')), JSON.stringify(mirrored));
  assert.equal(agent.chatLabel, 'World Agent', 'the terminal\'s own label is restored');
});

test('destroy needs confirm, and with it removes the building', async () => {
  const { count, ctx } = flatWorld();
  const built = (await runGameTool('run_plan', { plan: pillar(3) }, ctx())).result.buildings[0];
  const destroy = { action: 'destroy', targetBuilding: built.id, explanation: 'Remove the pillar' };
  const refused = await failure(runGameTool('run_plan', { plan: destroy }, ctx()));
  assert.equal(refused.kind, 'confirm');
  assert.equal(count(BLOCKS.STONE), 3, 'nothing was removed without confirm');
  await runGameTool('run_plan', { plan: destroy, confirm: true }, ctx());
  assert.equal(count(BLOCKS.STONE), 0);
});

test('a destructive step inside multi also needs confirm', async () => {
  const { ctx } = flatWorld();
  const plan = { action: 'multi', steps: [{ action: 'message', explanation: 'ok' }, { action: 'clear', explanation: 'flatten' }] };
  assert.deepEqual(planActions(plan), ['multi', 'message', 'clear']);
  assert.equal((await failure(runGameTool('run_plan', { plan }, ctx()))).kind, 'confirm');
});

test('invalid plans are refused with a usage error that points to the reference', async () => {
  const { ctx, count } = flatWorld();
  const err = await failure(runGameTool('run_plan', { plan: { action: 'teleport_to_mars' } }, ctx()));
  assert.equal(err.kind, 'usage');
  assert.match(err.message, /Unsupported action: teleport_to_mars.*plan_reference/);
  // build_in_stages needed the in-game model, which is gone: a large build is several run_plan calls.
  assert.equal((await failure(runGameTool('run_plan', { plan: { action: 'build_in_stages', name: 'Town' } }, ctx()))).kind, 'usage');
  assert.equal(count(BLOCKS.STONE), 0);
});

test('a plan while another is running is refused as busy, and the agent is released after each run', async () => {
  const { agent, ctx } = flatWorld();
  agent.isExecuting = true;
  assert.equal((await failure(runGameTool('run_plan', { plan: pillar() }, ctx()))).kind, 'busy');
  agent.isExecuting = false;
  const previousLogger = agent.onLog;
  await runGameTool('run_plan', { plan: pillar() }, ctx());
  assert.equal(agent.isExecuting, false);
  assert.equal(agent.onLog, previousLogger, 'the terminal logger is restored');
});

test('run_command runs chat commands; destructive ones need confirm; unknown ones say so', async () => {
  const { game, ctx } = flatWorld();
  const { result } = await runGameTool('run_command', { command: '/weather rain' }, ctx());
  assert.equal(result.ok, true);
  assert.equal(game.weather.weatherType, 'rain');
  assert.equal(commandName('/FILL 0 0 0 1 1 1 stone'), 'fill');
  assert.equal((await failure(runGameTool('run_command', { command: '/fill 0 11 0 2 13 2 stone' }, ctx()))).kind, 'confirm');
  assert.equal((await failure(runGameTool('run_command', { command: 'setblock 0 11 0 stone' }, ctx()))).kind, 'confirm', 'with or without the slash');
  assert.equal((await failure(runGameTool('run_command', { command: '/definitelynotacommand' }, ctx()))).kind, 'unknown');
});

test('say shows the answer in the terminal, labelled with the AI app', async () => {
  const { replies, agent, ctx } = flatWorld();
  await runGameTool('say', { text: 'Built you a pillar by the lake.' }, ctx());
  assert.deepEqual(replies, [{ text: 'Built you a pillar by the lake.', label: 'Claude Code' }]);
  assert.equal(agent.conversationHistory.at(-1).text, 'Built you a pillar by the lake.');
});

test('screenshot returns the view as an image, unless the player turned screenshots off', async () => {
  const { game, ctx } = flatWorld();
  game.captureCurrentView = () => ({ mimeType: 'image/jpeg', base64: 'SU1BR0U=' });
  const { images } = await runGameTool('screenshot', {}, ctx());
  assert.deepEqual(images, [{ mimeType: 'image/jpeg', data: 'SU1BR0U=' }]);
  assert.equal((await failure(runGameTool('screenshot', {}, ctx({ allowScreenshots: () => false })))).kind, 'denied');
});

test('get_state and look_around describe the player and the world', async () => {
  const { ctx } = flatWorld();
  const { result: state } = await runGameTool('get_state', {}, ctx());
  assert.deepEqual(state.position, [0.5, 11, 0.5]);
  assert.equal(state.facing, 'north (-Z)');
  assert.deepEqual([state.health, state.food, state.gameMode, state.dimension], [18, 15, 'creative', 'overworld']);
  assert.deepEqual(state.heldItem, { name: 'Stone', count: 12 });
  const { result: view } = await runGameTool('look_around', {}, ctx());
  assert.match(view.description, /PLAYER: at \(0\.5, 11\.0, 0\.5\), facing north/);
  assert.match(view.description, /LOCAL TERRAIN/);
  assert.match(view.description, /BUILDINGS MADE THIS SESSION/);
});

test('plan_reference carries the plan language, adapted to tools', async () => {
  const { ctx } = flatWorld();
  const { result } = await runGameTool('plan_reference', {}, ctx());
  assert.match(result.reference, /pass that plan to\s+run_plan/);
  assert.match(result.reference, /RESOLVING WHAT THE PLAYER MEANS/);
  assert.match(result.reference, /"action": "build"/);
  assert.match(result.reference, /fill_box/);
  assert.doesNotMatch(result.reference, /You are the World Agent/, 'the vendor preamble is left out');
});

test('run_plan follows the Agent Terminal rule: no world changes in Survival with cheats off', async () => {
  const { game, count, ctx } = flatWorld();
  game.allowsAgentTerminal = () => false;
  const err = await failure(runGameTool('run_plan', { plan: pillar() }, ctx()));
  assert.equal(err.kind, 'denied');
  assert.equal(count(BLOCKS.STONE), 0);
  // Looking and talking stay available.
  assert.ok((await runGameTool('look_around', {}, ctx())).result.description);
  game.allowsAgentTerminal = () => true;
  await runGameTool('run_plan', { plan: pillar() }, ctx());
  assert.equal(count(BLOCKS.STONE), 3);
});

test('without a world, tools say the player is on the start screen', async () => {
  const { game, agent } = flatWorld();
  const err = await failure(runGameTool('get_state', {}, { game: { ...game, world: null, player: null }, agent }));
  assert.equal(err.kind, 'state');
  assert.match(err.message, /start screen/);
});
