import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentSettings,
  DEFAULT_VENDOR,
  VENDORS,
  buildAgentRequest,
  encodeScreenshotDataUrl,
  extractAgentText,
  extractStreamDelta,
  getMaxOutputTokens,
  isTokenExhausted,
  parseAgentPlanJson
} from '../src/agentProviders.js';
import { WorldAgent, GeminiAgent } from '../src/worldAgent.js';
import { BLOCKS } from '../src/blocks.js';

// --- helpers ---------------------------------------------------------------

/** Minimal in-memory localStorage so vendor settings can be exercised in Node. */
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: key => { map.delete(key); },
    get size() { return map.size; },
    dump: () => Object.fromEntries(map)
  };
}

function fakeWorld() {
  const saved = new Map();
  return {
    saved,
    getVoxel: (x, y, z) => saved.get(`${x},${y},${z}`) ?? (y < 10 ? BLOCKS.DIRT : y === 10 ? BLOCKS.GRASS : BLOCKS.AIR),
    setVoxel: (x, y, z, id) => { saved.set(`${x},${y},${z}`, id); },
    getOrCreateChunk: () => ({ dirty: false }),
    chunks: new Map()
  };
}

function fixture(storage = memoryStorage()) {
  const world = fakeWorld();
  const game = {
    world,
    player: { position: { x: 4, y: 12, z: -6 }, yaw: Math.PI / 2, gamemode: 'creative' },
    worldTime: 6000,
    weather: { weatherType: 'clear', setWeather() {} },
    targetBlock: { x: 5, y: 10, z: -6, face: 1, blockId: BLOCKS.GRASS },
    sounds: { playMagic() {}, playLevelUp() {}, playClick() {} },
    rebuildChunkMesh() {}
  };
  // Construct the agent against the supplied storage so persisted preferences
  // (vendor, keys, offline mode) are read the way a page reload would read them.
  const agent = new WorldAgent(game);
  agent.settings = new AgentSettings(storage);
  // Every test in this file stubs `fetch`. If one ever misses that stub the request
  // would go to the real vendor and block on the production first-token window —
  // minutes of wall clock for a test that should take milliseconds. A short window
  // turns that mistake into a fast, obvious failure instead of a silent hang.
  agent.firstTokenTimeoutMs = 2000;
  agent.idleTimeoutMs = 2000;
  agent.reloadSettings();
  const fetchCalls = [];
  const mockFetch = (payloads, { ok = true, status = 200, statusText = 'OK' } = {}) => {
    const queue = Array.isArray(payloads) ? [...payloads] : [payloads];
    return async (url, options) => {
      fetchCalls.push({ url, options, body: JSON.parse(options.body) });
      if (!ok) return { ok: false, status, statusText };
      const payload = queue.length > 1 ? queue.shift() : queue[0];
      if (payload instanceof Error) throw payload;
      return { ok: true, json: async () => payload };
    };
  };
  return { agent, game, world, storage, fetchCalls, mockFetch };
}

const BUILD_PLAN = {
  action: 'build',
  name: 'Harbor Marker',
  structureType: 'custom',
  dimensions: { width: 2, height: 2, depth: 2 },
  operations: [{ type: 'fill_box', min: [0, 0, 0], max: [1, 1, 1], block: 'SNOW' }]
};

const geminiText = plan => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }] });
const chatText = plan => ({ choices: [{ message: { content: JSON.stringify(plan) }, finish_reason: 'stop' }] });

const baseRequest = {
  model: 'm',
  apiKey: 'k',
  systemPrompt: 'SYS',
  history: [],
  prompt: 'hello',
  images: []
};

// --- vendor catalogue ------------------------------------------------------

test('the agent ships four vendors, defaults to DeepSeek V4.1 Flash at high effort', () => {
  assert.deepEqual(Object.keys(VENDORS).sort(), ['chatgpt', 'claude', 'deepseek', 'gemini']);
  assert.equal(DEFAULT_VENDOR, 'deepseek');

  const settings = new AgentSettings(memoryStorage());
  assert.equal(settings.vendor, 'deepseek');
  assert.equal(settings.modelFor('deepseek'), 'deepseek-flash');
  assert.equal(settings.effortFor('deepseek'), 'high');

  // Every vendor has a default model that is part of its own catalogue.
  for (const [id, vendor] of Object.entries(VENDORS)) {
    assert.equal(settings.modelFor(id), vendor.defaultModel, `${id} default model`);
    assert.ok(vendor.models.some(model => model.id === vendor.defaultModel), `${id} lists its default`);
  }

  assert.equal(WorldAgent.defaultModelFor('deepseek'), 'deepseek-flash');
  assert.equal(WorldAgent.defaultEffortFor('deepseek'), 'high');
  assert.equal(WorldAgent.supportsEffort('deepseek'), true);
  assert.equal(WorldAgent.supportsEffort('gemini'), true);
  assert.equal(WorldAgent.defaultEffortFor('gemini'), 'medium');
});

test('preferences persist but keys are session-only; legacy plaintext is retired', () => {
  const storage = memoryStorage({ gemini_api_key: 'legacy-google-key' });
  const settings = new AgentSettings(storage);

  // The pre-existing single-vendor key is adopted by the Gemini slot.
  assert.equal(settings.keyFor('gemini'), 'legacy-google-key');

  settings.setVendor('chatgpt');
  settings.setModel('chatgpt', 'gpt-6-luna');
  settings.setEffort('chatgpt', 'low');
  settings.setKey('chatgpt', 'sk-openai');
  settings.setModel('deepseek', 'deepseek-v4-pro');
  settings.setKey('gemini', 'fresh-google-key');

  const reloaded = new AgentSettings(storage);
  assert.equal(reloaded.vendor, 'chatgpt');
  assert.equal(reloaded.modelFor('chatgpt'), 'gpt-6-luna');
  assert.equal(reloaded.effortFor('chatgpt'), 'low');
  assert.equal(reloaded.keyFor('chatgpt'), '');
  assert.equal(reloaded.modelFor('deepseek'), 'deepseek-v4-pro');
  // Writing the Gemini key retires the legacy entry.
  assert.equal(reloaded.keyFor('gemini'), '');
  assert.equal(settings.keyFor('chatgpt'), 'sk-openai');
  assert.equal(settings.keyFor('gemini'), 'fresh-google-key');
  assert.equal(storage.getItem('mc_agent_key_chatgpt'), null);
  assert.equal(storage.getItem('gemini_api_key'), null);
});

// --- request assembly ------------------------------------------------------

test('each vendor receives its own protocol, auth header and JSON mode', () => {
  const gemini = buildAgentRequest({ ...baseRequest, vendor: 'gemini' });
  assert.match(gemini.url, /generativelanguage\.googleapis\.com\/v1beta\/models\/m:generateContent$/);
  assert.equal(gemini.headers['x-goog-api-key'], 'k');
  assert.equal(gemini.body.systemInstruction.parts[0].text, 'SYS');
  assert.equal(gemini.body.generationConfig.responseMimeType, 'application/json');
  assert.equal(gemini.body.contents.at(-1).role, 'user');

  const deepseek = buildAgentRequest({ ...baseRequest, vendor: 'deepseek', effort: 'high' });
  assert.equal(deepseek.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(deepseek.headers.Authorization, 'Bearer k');
  assert.equal(deepseek.body.model, 'm');
  assert.equal(deepseek.body.reasoning_effort, 'high');
  assert.deepEqual(deepseek.body.thinking, { type: 'enabled' });
  assert.deepEqual(deepseek.body.response_format, { type: 'json_object' });
  assert.equal(deepseek.body.messages[0].role, 'system');
  assert.equal(deepseek.body.messages.at(-1).content, 'hello');

  const chatgpt = buildAgentRequest({ ...baseRequest, vendor: 'chatgpt', effort: 'medium' });
  assert.equal(chatgpt.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(chatgpt.headers.Authorization, 'Bearer k');
  assert.equal(chatgpt.body.reasoning_effort, 'medium');
  assert.equal(chatgpt.body.max_completion_tokens > 0, true);
  assert.equal(chatgpt.body.thinking, undefined);
  assert.equal(chatgpt.body.response_format.type, 'json_object');
});

test('images use each vendor image block shape and keep history in order', () => {
  const history = [
    { role: 'user', text: 'build a dock' },
    { role: 'assistant', text: '{"status":"completed"}' }
  ];

  const chat = buildAgentRequest({
    ...baseRequest,
    vendor: 'chatgpt',
    history,
    images: [{ mimeType: 'image/jpeg', base64: 'AAA', caption: 'view' }]
  });
  assert.deepEqual(chat.body.messages.map(m => m.role), ['system', 'user', 'assistant', 'user']);
  const blocks = chat.body.messages.at(-1).content;
  assert.equal(blocks[0].type, 'image_url');
  assert.equal(blocks[0].image_url.url, 'data:image/jpeg;base64,AAA');
  assert.equal(blocks.at(-1).text, 'hello');

  const gem = buildAgentRequest({
    ...baseRequest,
    vendor: 'gemini',
    history,
    images: [{ mimeType: 'image/png', base64: 'BBB', caption: 'view' }]
  });
  assert.deepEqual(gem.body.contents.map(c => c.role), ['user', 'model', 'user']);
  assert.deepEqual(gem.body.contents.at(-1).parts[0].inlineData, { mimeType: 'image/png', data: 'BBB' });
});

test('reasoning effort is applied to Gemini with thinkingConfig', () => {
  const gemini = buildAgentRequest({ ...baseRequest, vendor: 'gemini', effort: 'high' });
  assert.equal(gemini.effort, 'high');
  assert.equal(gemini.body.generationConfig.thinkingConfig.thinkingLevel, 'high');

  const gemini25 = buildAgentRequest({ ...baseRequest, vendor: 'gemini', model: 'gemini-2.5-flash', effort: 'low' });
  assert.equal(gemini25.effort, 'low');
  assert.equal(gemini25.body.generationConfig.thinkingConfig.thinkingBudget, 2048);

  const geminiOff = buildAgentRequest({ ...baseRequest, vendor: 'gemini', thinking: false });
  assert.equal(geminiOff.body.generationConfig.thinkingConfig.thinkingLevel, 'minimal');
});

// --- response parsing ------------------------------------------------------

test('assistant text is extracted from each response shape, ignoring thoughts', () => {
  assert.deepEqual(
    extractAgentText('gemini', {
      candidates: [{ content: { parts: [{ thought: true, text: 'secret' }, { text: '{"a":1}' }] }, finishReason: 'STOP' }]
    }),
    { text: '{"a":1}', reasoning: '', finishReason: 'STOP', usage: null }
  );

  assert.deepEqual(
    extractAgentText('deepseek', {
      choices: [{ message: { content: '{"a":1}', reasoning_content: 'because' }, finish_reason: 'stop' }],
      usage: { completion_tokens: 5 }
    }),
    { text: '{"a":1}', reasoning: 'because', finishReason: 'stop', usage: { completion_tokens: 5 } }
  );

  assert.equal(extractAgentText('chatgpt', { choices: [{ message: { content: '{"a":1}' } }] }).text, '{"a":1}');
  assert.equal(extractAgentText('chatgpt', {}).text, '');
});

test('planner JSON parsing tolerates markdown fences and rejects empty replies', () => {
  assert.deepEqual(parseAgentPlanJson('```json\n{"action":"message"}\n```'), { action: 'message' });
  assert.deepEqual(parseAgentPlanJson('{"action":"message"}'), { action: 'message' });
  assert.throws(() => parseAgentPlanJson(''), /Empty response/);
  assert.throws(() => parseAgentPlanJson('not json'), SyntaxError);
});

test('screenshots are downscaled and JPEG-encoded', () => {
  const canvas = { width: 2048, height: 1024, toDataURL: (type, quality) => `data:${type};q=${quality};base64,ZZZ` };
  const encoded = encodeScreenshotDataUrl(canvas, { maxWidth: 1024, quality: 0.7 });
  assert.equal(encoded.mimeType, 'image/jpeg');
  assert.equal(encoded.base64, 'ZZZ');
  assert.equal(encodeScreenshotDataUrl(null), null);
  assert.equal(encodeScreenshotDataUrl({ width: 0 }), null);
});

// --- agent integration -----------------------------------------------------

test('the active vendor is used for the request and the terminal reports it', async t => {
  const { agent, fetchCalls, mockFetch } = fixture();
  // OpenAI-compatible vendors reply with choices[0].message.content.
  t.mock.method(globalThis, 'fetch', mockFetch(chatText({ action: 'message', explanation: 'hi' })));

  assert.equal(agent.vendor, 'deepseek');
  assert.equal(agent.apiKey, '');

  agent.setApiKey('ds-key');
  assert.equal(agent.vendorLabel, 'DeepSeek');
  await agent.executePrompt('say hi');
  assert.equal(agent.lastError, null);
  assert.equal(fetchCalls[0].url, 'https://api.deepseek.com/chat/completions');
  assert.equal(fetchCalls[0].body.model, 'deepseek-flash');
  assert.equal(agent.lastRequestInfo.vendor, 'deepseek');

  // Switching vendor redirects the next request without losing the DeepSeek key.
  agent.setVendor('chatgpt');
  agent.setApiKey('oa-key');
  await agent.executePrompt('say hi again');
  assert.equal(fetchCalls[1].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(fetchCalls[1].body.model, 'gpt-6-astra');
  assert.equal(agent.getApiKey('deepseek'), 'ds-key');

  agent.setVendor('gemini');
  agent.setApiKey('g-key');
  await agent.executePrompt('say hi a third time');
  assert.match(fetchCalls[2].url, /generativelanguage\.googleapis\.com/);
});

test('every request carries the world state, the current view and prior conversation', async t => {
  const { agent, fetchCalls, mockFetch } = fixture();
  t.mock.method(globalThis, 'fetch', mockFetch(chatText(BUILD_PLAN)));
  agent.setApiKey('ds-key');

  await agent.executePrompt('build a marker here', null, {
    viewImage: { mimeType: 'image/jpeg', base64: 'VIEWDATA' }
  });
  assert.equal(agent.lastError, null);

  const first = fetchCalls[0].body;
  const system = first.messages[0].content;
  assert.match(system, /LOCAL TERRAIN/);
  assert.match(system, /World height: Y=1\.\.63/);
  assert.match(system, /player is at XYZ: \(4\.0, 12\.0, -6\.0\)/);
  assert.match(system, /currently on Grass Block at \(5, 10, -6\)/);
  // A quarter turn of positive yaw faces -X. This used to read "facing east", which was the wrong way round.
  assert.match(system, /facing west/);
  // 33 columns per terrain row.
  assert.equal(system.split('\n').some(line => /^[."#dgsSTt~!*ioc+]{33}$/.test(line)), true);

  // The player's own view is attached ahead of any uploaded reference image.
  const blocks = first.messages.at(-1).content;
  assert.equal(blocks[0].image_url.url, 'data:image/jpeg;base64,VIEWDATA');
  assert.match(blocks[0].type, /image_url/);

  // The next turn replays the tool-visible conversation and the new world state.
  await agent.executePrompt('now make it taller');
  const second = fetchCalls[1].body;
  assert.deepEqual(second.messages.slice(0, 3).map(m => m.role), ['system', 'user', 'assistant']);
  assert.match(second.messages[1].content, /build a marker here/);
  assert.ok(agent.conversationHistory.length >= 2);
});

test('the current view is only attached when the player has one', async t => {
  const { agent, fetchCalls, mockFetch } = fixture();
  t.mock.method(globalThis, 'fetch', mockFetch(chatText({ action: 'message', explanation: 'ok' })));
  agent.setApiKey('ds-key');

  await agent.executePrompt('what is around me');
  const blocks = fetchCalls[0].body.messages.at(-1).content;
  assert.equal(Array.isArray(blocks), false);
  assert.equal(blocks, 'what is around me');
});

test('a vendor failure is reported with the vendor name and never falls back offline', async t => {
  const { agent, world, mockFetch } = fixture();
  t.mock.method(console, 'error', () => {});
  let completed = false;
  agent.onComplete = () => { completed = true; };
  t.mock.method(globalThis, 'fetch', mockFetch(null, { ok: false, status: 401, statusText: 'Unauthorized' }));
  agent.setApiKey('bad-key');

  await agent.executePrompt('build a lighthouse');
  assert.match(agent.lastError.message, /DeepSeek API HTTP 401/);
  assert.equal(world.saved.size, 0);
  assert.equal(completed, true);
  assert.equal(agent.isExecuting, false);
});

test('offline mode still works with no key on any vendor and names the active one', async () => {
  const { agent, world, storage } = fixture();
  agent.setVendor('chatgpt');
  const logs = [];
  agent.onLog = (message, type) => logs.push({ message, type });

  await agent.executePrompt('build a lighthouse');
  assert.equal(agent.lastError, null);
  assert.ok(world.saved.size > 0, 'offline presets still build');
  assert.equal(storage.getItem('mc_agent_key_chatgpt'), null);
});

test('output budgets leave room for reasoning tokens', () => {
  // The bug this guards: a thinking model spending the whole budget on
  // reasoning and never emitting its JSON.
  const deepseek = buildAgentRequest({ ...baseRequest, vendor: 'deepseek', effort: 'high' });
  assert.equal(deepseek.body.thinking.type, 'enabled');
  assert.equal(deepseek.body.max_tokens, 65536);

  const nonThinking = buildAgentRequest({ ...baseRequest, vendor: 'deepseek', thinking: false });
  assert.equal(nonThinking.body.thinking.type, 'disabled');
  assert.equal(nonThinking.body.max_tokens, 8192);
  assert.equal(nonThinking.body.reasoning_effort, undefined, 'effort must be dropped when thinking is off');
  assert.equal(nonThinking.effort, '');

  const openai = buildAgentRequest({ ...baseRequest, vendor: 'chatgpt', effort: 'medium' });
  assert.equal(openai.body.max_completion_tokens, 32768);

  // An explicit override always wins (used by the retry path).
  const overridden = buildAgentRequest({ ...baseRequest, vendor: 'deepseek', maxOutputTokens: 1234 });
  assert.equal(overridden.body.max_tokens, 1234);

  assert.equal(getMaxOutputTokens('deepseek', { thinking: true }), 65536);
  assert.equal(getMaxOutputTokens('deepseek', { thinking: false }), 8192);
  assert.equal(getMaxOutputTokens('gemini', { thinking: true }) > 0, true);
});

test('token exhaustion is recognised from finish reason or usage details', () => {
  assert.equal(isTokenExhausted({ finishReason: 'length' }), true);
  assert.equal(isTokenExhausted({ finishReason: 'MAX_TOKENS' }), true);
  assert.equal(isTokenExhausted({ finishReason: 'stop' }), false);
  assert.equal(isTokenExhausted({ finishReason: 'stop', usage: { completion_tokens: 500, completion_tokens_details: { reasoning_tokens: 500 } } }), true);
  assert.equal(isTokenExhausted({ finishReason: 'stop', usage: { completion_tokens: 500, completion_tokens_details: { reasoning_tokens: 12 } } }), false);
  assert.equal(isTokenExhausted({}), false);
  // Gemini reports MAX_TOKENS as a finish reason.
  assert.equal(extractAgentText('gemini', { candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] }).finishReason, 'MAX_TOKENS');
});

test('a reasoning-truncated reply is retried once with thinking mode off', async t => {
  const { agent, fetchCalls, mockFetch } = fixture();
  const responses = [
    // First attempt: budget consumed by reasoning, no content at all.
    {
      choices: [{
        message: { content: '', reasoning_content: 'thinking very hard about lighthouse radii' },
        finish_reason: 'length'
      }],
      usage: { completion_tokens: 65536, completion_tokens_details: { reasoning_tokens: 65536 } }
    },
    // Retry with thinking off returns a usable plan.
    { choices: [{ message: { content: JSON.stringify(BUILD_PLAN) }, finish_reason: 'stop' }] }
  ];
  t.mock.method(globalThis, 'fetch', mockFetch(responses));
  agent.setApiKey('ds-key');

  await agent.executePrompt('build a lighthouse');
  assert.equal(agent.lastError, null);
  assert.equal(fetchCalls.length, 2, 'exactly one retry');

  assert.equal(fetchCalls[0].body.thinking.type, 'enabled');
  assert.equal(fetchCalls[0].body.max_tokens, 65536);
  assert.equal(fetchCalls[1].body.thinking.type, 'disabled');
  assert.equal(fetchCalls[1].body.max_tokens, 8192);
  assert.equal(fetchCalls[1].body.reasoning_effort, undefined);
  // The retry replays the same conversation and world context.
  assert.match(fetchCalls[1].body.messages[0].content, /LOCAL TERRAIN/);
  assert.ok(agent.builtStructures.length === 1);
});

test('a retry that is also empty reports the truncation clearly', async t => {
  const { agent, world, fetchCalls, mockFetch } = fixture();
  t.mock.method(console, 'error', () => {});
  const truncated = {
    choices: [{ message: { content: '', reasoning_content: 'still reasoning' }, finish_reason: 'length' }],
    usage: { completion_tokens: 65536, completion_tokens_details: { reasoning_tokens: 65536 } }
  };
  t.mock.method(globalThis, 'fetch', mockFetch([truncated]));
  agent.setApiKey('ds-key');

  await agent.executePrompt('build a lighthouse');
  // The request, the retry with thinking off, then one ask for the build as stages before giving up.
  assert.equal(fetchCalls.length, 3);
  assert.match(fetchCalls[2].body.messages.at(-1).content, /build_in_stages/);
  assert.match(agent.lastError.message, /hit the 8192-token output limit while still reasoning/);
  assert.match(agent.lastError.message, /Nothing was executed/);
  assert.equal(world.saved.size, 0);
});

test('a non-truncated empty reply is not retried', async t => {
  const { agent, fetchCalls, mockFetch } = fixture();
  t.mock.method(console, 'error', () => {});
  // Refusal-style empty content with a clean stop must fail fast.
  t.mock.method(globalThis, 'fetch', mockFetch({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] }));
  agent.setApiKey('ds-key');

  await agent.executePrompt('build a lighthouse');
  assert.equal(fetchCalls.length, 1);
  assert.match(agent.lastError.message, /finish reason: stop/);
});

/** Build a streaming Response stub out of SSE payloads. */
function sseResponse(payloads) {
  const chunks = payloads.map(payload => `data: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n\n`);
  chunks.push('data: [DONE]\n\n');
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: name => (name.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
    body: {
      getReader: () => ({
        read: async () => (index < chunks.length
          ? { done: false, value: encoder.encode(chunks[index++]) }
          : { done: true, value: undefined })
      })
    }
  };
}

/** Read back every chunk a mocked fetch was called with. */
function streamingMockFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const call = { url, options, body: JSON.parse(options.body) };
    calls.push(call);
    return handler(call, calls.length - 1);
  };
  return { fetchImpl, calls };
}

const deepseekDeltas = [
  { choices: [{ delta: { reasoning_content: 'Weighing the tower radii. ' } }] },
  { choices: [{ delta: { reasoning_content: 'Sand terrain, so a stone base.' } }] },
  { choices: [{ delta: { content: JSON.stringify(BUILD_PLAN) } }] },
  { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { completion_tokens: 42, total_tokens: 900, completion_tokens_details: { reasoning_tokens: 30 } } }
];

// --- streaming and live progress -------------------------------------------

test('stream deltas are read from OpenAI-compatible and Gemini chunk shapes', () => {
  const side = {};
  assert.deepEqual(
    extractStreamDelta('deepseek', { choices: [{ delta: { reasoning_content: 'think' } }] }, side),
    { reasoning: 'think', content: '', finishReason: '', usage: null }
  );
  assert.deepEqual(
    extractStreamDelta('chatgpt', { choices: [{ delta: { content: '{"a":' }, finish_reason: null }], usage: { completion_tokens: 3 } }, {}),
    { reasoning: '', content: '{"a":', finishReason: '', usage: { completion_tokens: 3 } }
  );
  assert.deepEqual(
    extractStreamDelta('deepseek', { choices: [{ delta: {}, finish_reason: 'length' }] }, {}),
    { reasoning: '', content: '', finishReason: 'length', usage: null }
  );

  // Gemini repeats accumulated text per chunk, so only the new tail is returned.
  const gem = {};
  assert.equal(extractStreamDelta('gemini', { candidates: [{ content: { parts: [{ thought: true, text: 'step one' }] } }] }, gem).reasoning, 'step one');
  assert.equal(extractStreamDelta('gemini', { candidates: [{ content: { parts: [{ thought: true, text: 'step one and two' }] } }] }, gem).reasoning, ' and two');
  assert.equal(extractStreamDelta('gemini', { candidates: [{ content: { parts: [{ text: '{"a"' }] } }] }, gem).content, '{"a"');
  assert.equal(extractStreamDelta('gemini', { candidates: [{ content: { parts: [{ text: '{"a":1}' }] }, finishReason: 'STOP' }] }, gem).content, ':1}');
});

test('streaming requests ask for SSE from every vendor', () => {
  assert.equal(buildAgentRequest({ ...baseRequest, vendor: 'deepseek', stream: true }).body.stream, true);
  assert.equal(buildAgentRequest({ ...baseRequest, vendor: 'chatgpt', stream: true }).body.stream, true);
  assert.match(buildAgentRequest({ ...baseRequest, vendor: 'gemini', stream: true }).url, /\?alt=sse$/);
  // Default stays non-streaming for callers that just want one body.
  assert.equal(buildAgentRequest({ ...baseRequest, vendor: 'deepseek' }).body.stream, false);
  assert.equal(buildAgentRequest({ ...baseRequest, vendor: 'gemini' }).url.includes('alt=sse'), false);
});

test('the agent streams reasoning through onThought and still parses the plan', async t => {
  const { agent, mockFetch } = fixture();
  const { fetchImpl, calls } = streamingMockFetch(() => sseResponse(deepseekDeltas));
  t.mock.method(globalThis, 'fetch', fetchImpl);
  agent.setApiKey('ds-key');

  const thoughts = [];
  const logs = [];
  agent.onThought = event => thoughts.push(event);
  agent.onLog = (message, type) => logs.push({ message, type });

  await agent.executePrompt('build a beautiful lighthouse with spiral stairs');
  assert.equal(agent.lastError, null);
  assert.equal(calls.length, 1, 'streaming needs no retry');
  assert.equal(calls[0].body.stream, true);
  assert.equal(calls[0].options.headers.Accept, 'text/event-stream');

  // The user gets a start signal plus live reasoning with elapsed time.
  assert.equal(thoughts[0].phase, 'start');
  const live = thoughts.filter(event => event.phase === 'thinking');
  assert.ok(live.length >= 1, 'reasoning was reported live');
  assert.match(live[0].reasoning, /Weighing the tower radii/);
  assert.equal(typeof live.at(-1).elapsedMs, 'number');

  // The final trace is logged once with the token accounting.
  const trace = logs.find(entry => entry.type === 'thought');
  assert.match(trace.message, /Sand terrain, so a stone base/);
  assert.match(trace.message, /Reasoning \(30 reasoning tokens\) after/);
  assert.ok(logs.some(entry => /Token usage: 42 output/.test(entry.message)));
  assert.equal(agent.builtStructures.length, 1);
});

test('a silent vendor is reported as an idle stall, not a hang', async t => {
  const { agent } = fixture();
  const encoder = new TextEncoder();
  const delivered = [false, false];
  let attempt = 0;
  const chunk = encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"thinking"}}]}\n\n');

  // Each attempt streams one reasoning chunk, then goes quiet. Pending reads
  // reject when the idle watchdog aborts the signal, exactly like a real body.
  const stalledStream = (url, options = {}) => {
    const index = attempt++;
    const signal = options.signal;
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: name => (name.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
      body: {
        getReader: () => ({
          read: () => {
            if (!delivered[index]) {
              delivered[index] = true;
              return Promise.resolve({ done: false, value: chunk });
            }
            return new Promise((resolve, reject) => {
              if (!signal) return; // never settles: the stall under test
              if (signal.aborted) return reject(new Error('stream stalled'));
              signal.addEventListener('abort', () => reject(new Error('stream stalled')), { once: true });
            });
          },
          cancel: async () => {}
        })
      }
    };
  };

  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async (url, options) => stalledStream(url, options));
  agent.setApiKey('ds-key');
  agent.idleTimeoutMs = 80;

  const thoughts = [];
  agent.onThought = event => thoughts.push(event);

  await agent.executePrompt('build a lighthouse');
  // The user saw live reasoning before the stall, so it never looked frozen.
  assert.ok(thoughts.some(event => event.phase === 'thinking' && /thinking/.test(event.reasoning)));
  assert.match(agent.lastError.message, /sent nothing|stopped sending data/);
  assert.match(agent.lastError.message, /Nothing was executed/);
});

test('streaming explains key and quota failures in actionable terms', async t => {
  const cases = [[401, /API key was rejected/], [402, /out of credit/], [429, /rate limit or quota exceeded/], [400, /request was rejected/]];
  for (const [status, expected] of cases) {
    const { agent } = fixture();
    t.mock.method(console, 'error', () => {});
    t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status, statusText: 'nope' }));
    agent.setApiKey('ds-key');
    await agent.executePrompt('build a lighthouse');
    assert.match(agent.lastError.message, expected, `status ${status}`);
    assert.match(agent.lastError.message, /Nothing was executed/);
    t.mock.restoreAll();
  }
});

test('forced offline mode keeps the key but stops calling the vendor', async t => {
  const { agent, world, fetchCalls } = fixture();
  const { fetchImpl, calls } = streamingMockFetch(() => sseResponse(deepseekDeltas));
  t.mock.method(globalThis, 'fetch', fetchImpl);
  agent.setApiKey('ds-key');

  // Save a key, then deliberately drop back to the offline presets.
  agent.setOfflineMode(true);
  assert.equal(agent.offlineMode, true);
  assert.equal(agent.apiKey, 'ds-key', 'the key is retained');
  assert.equal(agent.canUseApi, false);
  assert.equal(agent.isOffline, true);

  const logs = [];
  agent.onLog = (message, type) => logs.push({ message, type });

  await agent.executePrompt('build a lighthouse');
  assert.equal(calls.length, 0, 'no network call while offline');
  assert.equal(fetchCalls.length, 0, 'the fixture fetch was never reached');
  assert.equal(agent.lastError, null, 'offline presets are not an error');
  assert.ok(world.saved.size > 0, 'the preset still built something');
  assert.ok(logs.some(entry => /Offline mode is on/.test(entry.message)));

  // Switching back re-enables the API with the same key.
  agent.setOfflineMode(false);
  assert.equal(agent.canUseApi, true);
  await agent.executePrompt('build a lighthouse');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions');
});

test('offline mode survives a reload and is cleared when turned off', () => {
  const storage = memoryStorage();
  const first = fixture(storage).agent;
  first.setOfflineMode(true);
  assert.equal(storage.getItem('mc_agent_offline'), '1');
  assert.equal(fixture(storage).agent.offlineMode, true, 'reload keeps offline mode');

  const second = fixture(storage).agent;
  second.setOfflineMode(false);
  assert.equal(storage.getItem('mc_agent_offline'), null);
  assert.equal(fixture(storage).agent.offlineMode, false, 'reload keeps the API switch');
});

test('offline mode is not confused with a missing key', () => {
  const { agent } = fixture();
  // No key, offline mode off: offline because there is nothing to call with.
  assert.equal(agent.offlineMode, false);
  assert.equal(agent.canUseApi, false);
  assert.equal(agent.isOffline, true);

  // Key present, offline mode off: the API is used.
  agent.setApiKey('ds-key');
  assert.equal(agent.canUseApi, true);
  assert.equal(agent.isOffline, false);

  // Offline mode on overrides a present key.
  agent.setOfflineMode(true);
  assert.equal(agent.canUseApi, false);
  assert.equal(agent.apiKey, 'ds-key');
});

test('the legacy GeminiAgent import keeps working', () => {
  assert.equal(GeminiAgent, WorldAgent);
});
