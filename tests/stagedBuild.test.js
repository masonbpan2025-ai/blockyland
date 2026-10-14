// Large builds go up in stages.
//
// A medieval town asked of Claude in Building Studio failed with "No JSON plan was returned by Claude: it hit the
// 16000-token output limit while still reasoning". Three things were wrong: the "thinking off" retry did not
// turn thinking off (it left the field out), its budget was hard-coded at 16K, and a whole town does not fit in
// one reply at any budget. Now the retry really is plain and larger, and a request that still runs out of room
// is asked for again as a staged plan, whose parts are each written in their own reply.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS } from '../src/blocks.js';
import { validatePlan } from '../src/agentPlans.js';
import { AgentSettings, buildAgentRequest } from '../src/agentProviders.js';
import { WorldAgent } from '../src/worldAgent.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
}

const TOWN = {
  action: 'build_in_stages',
  name: 'Medieval Town',
  explanation: 'A walled town in parts',
  site: { width: 40, height: 16, depth: 40 },
  theme: 'Cobblestone footings, oak frames, spruce roofs',
  stages: [
    { name: 'Town square', description: 'A cobblestone square with a well', offset: [12, 0, 12], size: { width: 16, height: 4, depth: 16 } },
    { name: 'Chapel', description: 'A small stone chapel', offset: [0, 0, 0], size: { width: 10, height: 12, depth: 10 } },
    { name: 'Blacksmith', description: 'A forge with a chimney', offset: [28, 0, 0], size: { width: 10, height: 8, depth: 10 } }
  ]
};

function fixture() {
  const saved = new Map();
  const game = {
    world: {
      saved,
      getVoxel: (x, y, z) => saved.get(`${x},${y},${z}`) ?? (y < 10 ? BLOCKS.DIRT : y === 10 ? BLOCKS.GRASS : BLOCKS.AIR),
      setVoxel: (x, y, z, id) => saved.set(`${x},${y},${z}`, id), getOrCreateChunk: () => null, chunks: new Map()
    },
    player: { position: { x: 0, y: 11, z: 0 }, yaw: 0, pitch: 0, gamemode: 'creative' },
    worldTime: 6000, weather: { weatherType: 'clear', setWeather() {} },
    sounds: { playMagic() {}, playLevelUp() {}, playClick() {} }, rebuildChunkMesh() {}
  };
  const agent = new WorldAgent(game);
  agent.settings = new AgentSettings(memoryStorage());
  agent.firstTokenTimeoutMs = 2000;
  agent.idleTimeoutMs = 2000;
  agent.reloadSettings();
  agent.setVendor('claude');
  agent.setApiKey('sk-ant-test');
  const logs = [];
  agent.onLog = (message, type) => logs.push({ message, type });
  return { agent, game, logs };
}

const reasoningOnly = { content: [{ type: 'thinking', thinking: 'Planning the town...' }], stop_reason: 'max_tokens', usage: { output_tokens: 32000 } };
const replyWith = plan => ({ content: [{ type: 'text', text: JSON.stringify(plan) }], stop_reason: 'end_turn' });
const lastUserText = body => body.messages.at(-1).content.filter(b => b.type === 'text').map(b => b.text).join('\n');
const partFor = text => {
  const name = /Build part \d+ of \d+: "([^"]+)"/.exec(text)?.[1];
  return { action: 'build', name, dimensions: { width: 4, height: 3, depth: 4 }, operations: [{ type: 'fill_box', min: [0, 0, 0], max: [3, 2, 3], block: name === 'Chapel' ? 'STONE_BRICKS' : 'OAK_PLANKS' }] };
};

test('the staged plan is validated: a site, parts inside it, at most 64 per side', () => {
  assert.equal(validatePlan(structuredClone(TOWN)).action, 'build_in_stages');
  const outside = structuredClone(TOWN);
  outside.stages[2].offset = [35, 0, 0];
  assert.throws(() => validatePlan(outside), /does not fit inside the site/);
  const huge = structuredClone(TOWN);
  huge.stages[0].size.width = 80;
  assert.throws(() => validatePlan(huge), /at most 64/);
  assert.throws(() => validatePlan({ ...TOWN, stages: [] }), /1-24 stages/);
  assert.throws(() => validatePlan({ ...TOWN, site: { width: 300, height: 10, depth: 10 } }), /128/);
});

test('Claude\'s "thinking off" retry really turns thinking off, with room for a big plan', () => {
  const retry = buildAgentRequest({ vendor: 'claude', model: 'claude-sonnet-5-5', apiKey: 'k', systemPrompt: 'S', prompt: 'p', thinking: false, maxOutputTokens: 32000 });
  assert.deepEqual(retry.body.thinking, { type: 'disabled' }, 'leaving the field out let the model keep thinking');
  assert.equal(retry.body.max_tokens, 32000);
  const first = buildAgentRequest({ vendor: 'claude', model: 'claude-sonnet-5-5', apiKey: 'k', systemPrompt: 'S', prompt: 'p' });
  assert.equal(first.body.max_tokens, 64000);
});

test('a town that runs out of room is asked for again in stages, and every part is built', async t => {
  const { agent, game, logs } = fixture();
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = JSON.parse(options.body);
    bodies.push(body);
    const text = lastUserText(body);
    if (/Build part \d+ of \d+/.test(text)) return { ok: true, json: async () => replyWith(partFor(text)) };
    if (/build_in_stages/.test(text) && /ran out of room/.test(text)) return { ok: true, json: async () => replyWith(TOWN) };
    return { ok: true, json: async () => reasoningOnly }; // the first try and the "thinking off" retry
  });
  await agent.executePrompt('build a medieval town');
  assert.equal(agent.lastError, null, agent.lastError?.message);

  // 1: the request; 2: thinking off at 32K; 3: asked for stages; 4-6: one per part.
  assert.equal(bodies.length, 6);
  assert.deepEqual(bodies[1].thinking, { type: 'disabled' });
  assert.equal(bodies[1].max_tokens, 32000);
  assert.ok(bodies.slice(3).every(b => b.messages.length === 1), 'each part is written without the whole conversation');
  assert.ok(bodies[3].system.length < bodies[0].system.length, 'and with a lean prompt');

  const parts = agent.builtStructures.filter(b => b.partOf === 'Medieval Town');
  assert.deepEqual(parts.map(p => p.name), ['Town square', 'Chapel', 'Blacksmith']);
  // Parts stand at their offsets inside one site.
  const square = parts[0], chapel = parts[1];
  assert.equal(square.startX - chapel.startX, 12);
  assert.equal(square.startZ - chapel.startZ, 12);
  assert.ok([...game.world.saved.values()].includes(BLOCKS.STONE_BRICKS));
  assert.ok(logs.some(l => /Medieval Town" is complete: all 3 parts built/.test(l.message)));
});

test('a part that fails does not lose the rest', async t => {
  const { agent, logs } = fixture();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const text = lastUserText(JSON.parse(options.body));
    if (/Build part \d+ of \d+: "Chapel"/.test(text)) return { ok: true, json: async () => replyWith({ action: 'message', explanation: 'no' }) };
    if (/Build part/.test(text)) return { ok: true, json: async () => replyWith(partFor(text)) };
    return { ok: true, json: async () => replyWith(TOWN) }; // asked for the town, it plans stages straight away
  });
  await agent.executePrompt('build a medieval town');
  assert.equal(agent.lastError, null, agent.lastError?.message);
  assert.deepEqual(agent.builtStructures.map(b => b.name), ['Town square', 'Blacksmith']);
  assert.ok(logs.some(l => /Built 2 of 3 parts.*Not built: Chapel/.test(l.message)));
});

test('in Building Studio the whole town is adopted as one building to save', async t => {
  const { agent, game } = fixture();
  const adopted = [];
  game.buildingStudio = { isActive: true, adoptCustomBuild: entry => adopted.push(entry), handleAgentPrompt: () => false, adoptFromPlan: () => false };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const text = lastUserText(JSON.parse(options.body));
    return { ok: true, json: async () => replyWith(/Build part/.test(text) ? partFor(text) : TOWN) };
  });
  await agent.executePrompt('build a medieval town');
  assert.equal(agent.lastError, null, agent.lastError?.message);
  assert.equal(adopted.length, 1, 'once, for the whole town, not once per part');
  assert.equal(adopted[0].name, 'Medieval Town');
  assert.equal(adopted[0].blocks.length, 3 * 4 * 3 * 4);
});
