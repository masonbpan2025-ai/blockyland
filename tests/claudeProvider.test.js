// Claude in the Agent Terminal: Anthropic's Messages API, its stream, its errors and its thinking settings.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentSettings,
  VENDORS,
  buildAgentRequest,
  extractAgentText,
  extractStreamDelta,
  getMaxOutputTokens,
  isTokenExhausted
} from '../src/agentProviders.js';
import { WorldAgent } from '../src/worldAgent.js';
import { BLOCKS } from '../src/blocks.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
}

function fixture() {
  const saved = new Map();
  const world = {
    saved,
    getVoxel: (x, y, z) => saved.get(`${x},${y},${z}`) ?? (y < 10 ? BLOCKS.DIRT : y === 10 ? BLOCKS.GRASS : BLOCKS.AIR),
    setVoxel: (x, y, z, id) => { saved.set(`${x},${y},${z}`, id); },
    getOrCreateChunk: () => ({ dirty: false }),
    chunks: new Map()
  };
  const game = {
    world,
    player: { position: { x: 4, y: 11, z: -6 }, yaw: 0, pitch: 0, gamemode: 'creative' },
    worldTime: 6000,
    weather: { weatherType: 'clear', setWeather() {} },
    sounds: { playMagic() {}, playLevelUp() {}, playClick() {} },
    rebuildChunkMesh() {}
  };
  const agent = new WorldAgent(game);
  agent.settings = new AgentSettings(memoryStorage());
  agent.firstTokenTimeoutMs = 2000;
  agent.idleTimeoutMs = 2000;
  agent.reloadSettings();
  agent.setVendor('claude');
  agent.setApiKey('sk-ant-key');
  return { agent, game, world };
}

const MARKER = {
  action: 'build', name: 'Marker', structureType: 'custom',
  dimensions: { width: 2, height: 2, depth: 2 },
  operations: [{ type: 'fill_box', min: [0, 0, 0], max: [1, 1, 1], block: 'SNOW' }]
};

const claudeReply = plan => ({
  content: [{ type: 'thinking', thinking: 'Planning a marker.' }, { type: 'text', text: JSON.stringify(plan) }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 900, output_tokens: 40 }
});

const baseRequest = { model: 'claude-sonnet-5-5', apiKey: 'sk-ant-test', systemPrompt: 'SYS', history: [], prompt: 'hello', images: [] };

test('Claude is a vendor with the Claude 5 models, Sonnet 5.5 by default', () => {
  const claude = VENDORS.claude;
  assert.equal(claude.label, 'Claude');
  assert.equal(claude.endpoint, 'https://api.anthropic.com/v1/messages');
  assert.deepEqual(claude.models.map(m => m.id), ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1']);
  assert.equal(claude.defaultModel, 'claude-sonnet-5-5');
  assert.equal(claude.supportsEffort, true);
  assert.equal(claude.supportsImages, true);
  const settings = new AgentSettings(memoryStorage());
  assert.equal(settings.modelFor('claude'), 'claude-sonnet-5-5');
  assert.equal(settings.effortFor('claude'), 'medium');
});

test('a Claude request uses the Messages API shape: system apart, images as base64 blocks, adaptive thinking', () => {
  const request = buildAgentRequest({
    ...baseRequest,
    vendor: 'claude',
    effort: 'high',
    history: [
      { role: 'assistant', text: 'orphan reply' },
      { role: 'user', text: 'first' },
      { role: 'user', text: 'again' },
      { role: 'assistant', text: 'ok' }
    ],
    images: [{ mimeType: 'image/jpeg', base64: 'VIEW', caption: 'the view' }],
    stream: true
  });
  assert.equal(request.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(request.headers['x-api-key'], 'sk-ant-test');
  assert.equal(request.headers['anthropic-version'], '2023-06-01');
  assert.equal(request.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(request.headers.Authorization, undefined, 'the key never goes in a Bearer header');
  const body = request.body;
  assert.equal(body.system, 'SYS');
  assert.equal(body.model, 'claude-sonnet-5-5');
  assert.equal(body.stream, true);
  assert.deepEqual(body.thinking, { type: 'adaptive' });
  assert.deepEqual(body.output_config, { effort: 'high' });
  assert.equal(body.max_tokens, 64000, 'room for a large build (a 16K budget lost a whole medieval town)');
  assert.equal(body.response_format, undefined, 'Claude has no response_format field');
  // The conversation opens with the user, alternates, and same-role turns are merged.
  assert.deepEqual(body.messages.map(m => m.role), ['user', 'assistant', 'user']);
  assert.deepEqual(body.messages[0].content.map(b => b.text), ['first', 'again']);
  const last = body.messages.at(-1).content;
  assert.deepEqual(last[0], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'VIEW' } });
  assert.deepEqual(last.at(-1), { type: 'text', text: 'hello' });
});

test('Claude effort maps the terminal levels, and thinking off is said explicitly', () => {
  const minimal = buildAgentRequest({ ...baseRequest, vendor: 'claude', effort: 'minimal' });
  assert.deepEqual(minimal.body.output_config, { effort: 'low' });
  const plain = buildAgentRequest({ ...baseRequest, vendor: 'claude', thinking: false, effort: 'max' });
  // Leaving the field out let a model keep thinking, which is how the "thinking off" retry ran out of room.
  assert.deepEqual(plain.body.thinking, { type: 'disabled' });
  assert.equal(plain.body.max_tokens, 32000);
  assert.deepEqual(plain.body.output_config, { effort: 'max' });
  assert.equal(getMaxOutputTokens('claude', { thinking: true }), 64000);
});

test('Claude replies and stream events are read into text, reasoning and a stop reason', () => {
  const whole = extractAgentText('claude', claudeReply(MARKER));
  assert.deepEqual(JSON.parse(whole.text), MARKER);
  assert.equal(whole.reasoning, 'Planning a marker.');
  assert.equal(whole.finishReason, 'end_turn');

  assert.equal(extractStreamDelta('claude', { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hmm' } }).reasoning, 'hmm');
  assert.equal(extractStreamDelta('claude', { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"a"' } }).content, '{"a"');
  const end = extractStreamDelta('claude', { type: 'message_delta', delta: { stop_reason: 'max_tokens' }, usage: { output_tokens: 32000 } });
  assert.equal(end.finishReason, 'max_tokens');
  assert.equal(isTokenExhausted(end), true, 'max_tokens is Claude running out of room');
  assert.equal(extractStreamDelta('claude', { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }).error, 'Overloaded');
});

test('the agent talks to Claude end to end and builds what it plans', async t => {
  const { agent, world } = fixture();
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return { ok: true, json: async () => claudeReply(MARKER) };
  });
  await agent.executePrompt('build a marker here');
  assert.equal(agent.lastError, null, agent.lastError?.message);
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].options.headers['x-api-key'], 'sk-ant-key');
  assert.match(calls[0].body.system, /ENVIRONMENT/);
  assert.ok([...world.saved.values()].includes(BLOCKS.SNOW), 'the planned blocks were placed');
});

test('a streamed Claude reply is assembled from its server-sent events', async t => {
  const { agent } = fixture();
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 10 } } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Just say hello.' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '{"action":"message",' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '"explanation":"Hello there!"}' } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 12 } },
    { type: 'message_stop' }
  ];
  const sse = events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  t.mock.method(globalThis, 'fetch', async () => {
    let sent = false;
    return {
      ok: true,
      headers: { get: () => 'text/event-stream' },
      body: { getReader: () => ({ read: async () => (sent ? { done: true } : (sent = true, { done: false, value: new TextEncoder().encode(sse) })), cancel: async () => {} }) }
    };
  });
  const logs = [];
  agent.onLog = (message, type) => logs.push({ message, type });
  await agent.executePrompt('hi');
  assert.equal(agent.lastError, null, agent.lastError?.message);
  assert.ok(logs.some(l => l.message.includes('Hello there!')), 'the answer reached the terminal');
  assert.ok(logs.some(l => l.type === 'thought' && l.message.includes('Just say hello.')), 'and so did the thinking');
});

test('a Claude model that rejects the thinking settings is asked again without them', async t => {
  const { agent } = fixture();
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(JSON.parse(options.body));
    if (calls.length === 1) {
      const text = JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'adaptive thinking is not supported on this model' } });
      return { ok: false, status: 400, statusText: 'Bad Request', clone: () => ({ text: async () => text }), json: async () => JSON.parse(text) };
    }
    return { ok: true, json: async () => claudeReply({ action: 'message', explanation: 'Hello!' }) };
  });
  await agent.executePrompt('hi');
  assert.equal(agent.lastError, null, agent.lastError?.message);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].thinking);
  assert.equal(calls[1].thinking, undefined);
  assert.equal(calls[1].output_config, undefined);
});

test('an out-of-credit Claude account is explained with the Anthropic billing link', async t => {
  const { agent } = fixture();
  const message = 'Your credit balance is too low to access the Anthropic API.';
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: false, status: 400, statusText: 'Bad Request',
    clone: () => ({ text: async () => message }),
    json: async () => ({ type: 'error', error: { type: 'invalid_request_error', message } })
  }));
  await agent.executePrompt('hi');
  assert.match(agent.lastError?.message || '', /console\.anthropic\.com\/settings\/billing/);
});
