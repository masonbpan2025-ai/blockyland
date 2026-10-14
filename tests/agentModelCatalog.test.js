// The Agent Terminal's model list keeps up with the vendors: fetched live, cached, merged with the built-in
// notes, following a model family to its newest member, and recovering when a model is retired.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isUnknownModelError, labelFromId, listModelsRequest, mergeModels, newerInFamily, parseModelId, parseModelList,
  readCachedModels, replacementFor, writeCachedModels, MODEL_CACHE_TTL_MS
} from '../src/agentModelCatalog.js';
import { AgentSettings, VENDORS, resolveModel } from '../src/agentProviders.js';
import { WorldAgent } from '../src/worldAgent.js';
import { BLOCKS } from '../src/blocks.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
}

// --- families and versions ----------------------------------------------------------------------------------

test('a model id splits into its family and version', () => {
  assert.deepEqual(parseModelId('claude-opus-5-5'), { family: 'claude-opus', version: [5, 5], snapshot: null, preview: false });
  assert.deepEqual(parseModelId('claude-sonnet-4-5-20250929').version, [4, 5]);
  assert.equal(parseModelId('claude-sonnet-4-5-20250929').snapshot, '20250929');
  assert.deepEqual(parseModelId('gemini-3.8-flash'), { family: 'gemini-flash', version: [3, 8], snapshot: null, preview: false });
  assert.equal(parseModelId('gemini-3.1-pro-preview').preview, true);
  assert.equal(parseModelId('gemini-3.1-pro-preview').family, 'gemini-pro');
  assert.deepEqual(parseModelId('gpt-6.1-sol'), { family: 'gpt-sol', version: [6, 1], snapshot: null, preview: false });
  assert.deepEqual(parseModelId('deepseek-v4-pro').version, [4]);
  const dated = parseModelId('gpt-4o-2024-08-06');
  assert.equal(dated.family, 'gpt-4o', 'a date is a snapshot, not a version');
  assert.deepEqual(dated.version, []);
  assert.equal(labelFromId('claude-opus-5-6'), 'Claude Opus 5.6');
});

test('the newest model of the same family is found, and only a newer one', () => {
  const models = ['claude-opus-5-6', 'claude-opus-5-5', 'claude-sonnet-6-0', 'claude-haiku-5-5'].map(id => ({ id }));
  assert.equal(newerInFamily('claude-opus-5-5', models)?.id, 'claude-opus-5-6');
  assert.equal(newerInFamily('claude-opus-5-6', models), null, 'already the newest');
  assert.equal(newerInFamily('claude-haiku-5-5', models), null, 'another family is never an upgrade');
  assert.equal(newerInFamily('gemini-3.8-flash', [{ id: 'gemini-4.0-flash-preview' }]), null, 'a stable choice is not moved to a preview');
  assert.equal(newerInFamily('gemini-3.8-flash', [{ id: 'gemini-4.0-flash' }, { id: 'gemini-3.9-flash' }])?.id, 'gemini-4.0-flash');
  assert.equal(newerInFamily('my-private-model', models), null, 'an id with no version has no family to follow');
});

test('a retired model is replaced by the newest of its family, else the default', () => {
  const models = [{ id: 'claude-opus-5-6' }, { id: 'claude-sonnet-5-5' }];
  assert.equal(replacementFor('claude-opus-5-5', models, 'claude-sonnet-5-5').id, 'claude-opus-5-6');
  assert.equal(replacementFor('claude-fable-5-1', models, 'claude-sonnet-5-5').id, 'claude-sonnet-5-5');
});

// --- the vendors' list endpoints ----------------------------------------------------------------------------

test('each vendor is asked with its own endpoint and its own authentication', () => {
  const claude = listModelsRequest('claude', 'sk-ant');
  assert.match(claude.url, /^https:\/\/api\.anthropic\.com\/v1\/models/);
  assert.equal(claude.headers['x-api-key'], 'sk-ant');
  assert.equal(claude.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(listModelsRequest('chatgpt', 'sk').headers.Authorization, 'Bearer sk');
  assert.equal(listModelsRequest('deepseek', 'sk').url, 'https://api.deepseek.com/models');
  const gemini = listModelsRequest('gemini', 'AIza');
  assert.equal(gemini.headers['x-goog-api-key'], 'AIza');
  assert.ok(!gemini.url.includes('AIza'), 'the key never goes in the URL');
  assert.equal(listModelsRequest('nobody', 'k'), null);
});

test('list responses are read into chat models only, newest first', () => {
  const claude = parseModelList('claude', { data: [
    { type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-05-01T00:00:00Z' },
    { type: 'model', id: 'claude-opus-5-6', display_name: 'Claude Opus 5.6', created_at: '2026-09-01T00:00:00Z' },
    { type: 'model', id: 'claude-opus-5-6', display_name: 'duplicate' }
  ] });
  assert.deepEqual(claude.map(m => m.id), ['claude-opus-5-6', 'claude-opus-5-5']);
  assert.equal(claude[0].label, 'Claude Opus 5.6');

  const openai = parseModelList('chatgpt', { data: [
    { id: 'gpt-6-astra', created: 1790000000 }, { id: 'text-embedding-3-large', created: 1 }, { id: 'whisper-1' },
    { id: 'gpt-6-astra-tts' }, { id: 'dall-e-3' }, { id: 'o3-mini', created: 1700000000 }
  ] });
  assert.deepEqual(openai.map(m => m.id).sort(), ['gpt-6-astra', 'o3-mini']);

  const gemini = parseModelList('gemini', { models: [
    { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
    { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] }
  ] });
  assert.deepEqual(gemini.map(m => m.id), ['gemini-3.8-flash']);

  assert.deepEqual(parseModelList('deepseek', { object: 'list', data: [{ id: 'deepseek-flash', object: 'model' }] }).map(m => m.id), ['deepseek-flash']);
  assert.deepEqual(parseModelList('claude', { unexpected: true }), [], 'a surprise shape is an empty list, never a throw');
  assert.deepEqual(parseModelList('gemini', null), []);
});

test('the live list wins, borrowing the built-in notes, and unknown models are marked new', () => {
  const merged = mergeModels(VENDORS.claude.models, [{ id: 'claude-opus-5-6', label: 'Claude Opus 5.6' }, { id: 'claude-sonnet-5-5', label: 'x' }]);
  assert.deepEqual(merged.map(m => m.id), ['claude-opus-5-6', 'claude-sonnet-5-5']);
  assert.equal(merged[0].isNew, true);
  assert.equal(merged[1].label, 'Claude Sonnet 5.5', 'the built-in label and note are kept');
  assert.ok(merged[1].note);
  assert.deepEqual(mergeModels(VENDORS.claude.models, null).map(m => m.id), VENDORS.claude.models.map(m => m.id), 'no live list: the built-in one');
});

test('the cache lasts a day', () => {
  const store = memoryStorage();
  writeCachedModels(store, 'claude', [{ id: 'claude-opus-5-6' }], 1000);
  assert.equal(readCachedModels(store, 'claude', 1000 + 1000).stale, false);
  assert.equal(readCachedModels(store, 'claude', 1000 + MODEL_CACHE_TTL_MS + 1).stale, true);
  store.setItem('mc_agent_models_claude', '{not json');
  assert.equal(readCachedModels(store, 'claude'), null);
});

test('a model id the built-in list does not know survives a reload', () => {
  assert.equal(resolveModel('claude', 'claude-opus-5-6'), 'claude-opus-5-6');
  assert.equal(resolveModel('chatgpt', 'gpt-7-nova'), 'gpt-7-nova');
  assert.equal(resolveModel('claude', ''), VENDORS.claude.defaultModel);
  assert.equal(resolveModel('claude', 'not a model id!'), VENDORS.claude.defaultModel);
  const store = memoryStorage();
  new AgentSettings(store).setModel('claude', 'claude-opus-5-6');
  assert.equal(new AgentSettings(store).modelFor('claude'), 'claude-opus-5-6');
});

test('only "model not found" errors count as a retired model', () => {
  assert.equal(isUnknownModelError(404, '{"type":"error","error":{"type":"not_found_error","message":"model: claude-opus-5-5"}}'), true);
  assert.equal(isUnknownModelError(404, 'The model `gpt-6-astra` does not exist or you do not have access to it.'), true);
  assert.equal(isUnknownModelError(400, 'Model Not Exist'), true, 'DeepSeek\'s wording for an unknown model');
  assert.equal(isUnknownModelError(400, 'models/gemini-2.0-flash is not found for API version v1beta'), true);
  assert.equal(isUnknownModelError(400, 'Your credit balance is too low'), false);
  assert.equal(isUnknownModelError(401, 'model not found'), false, 'a key problem is not a model problem');
});

// --- the agent ------------------------------------------------------------------------------------------------

function agent(vendor = 'claude') {
  const saved = new Map();
  const game = {
    world: {
      getVoxel: (x, y, z) => saved.get(`${x},${y},${z}`) ?? (y < 10 ? BLOCKS.DIRT : y === 10 ? BLOCKS.GRASS : BLOCKS.AIR),
      setVoxel: (x, y, z, id) => saved.set(`${x},${y},${z}`, id), getOrCreateChunk: () => null, chunks: new Map()
    },
    player: { position: { x: 0, y: 11, z: 0 }, yaw: 0, pitch: 0, gamemode: 'creative' },
    worldTime: 6000, weather: { weatherType: 'clear', setWeather() {} },
    sounds: { playMagic() {}, playLevelUp() {}, playClick() {} }, rebuildChunkMesh() {}
  };
  const a = new WorldAgent(game);
  a.settings = new AgentSettings(memoryStorage());
  a.firstTokenTimeoutMs = 2000;
  a.idleTimeoutMs = 2000;
  a.reloadSettings();
  a.setVendor(vendor);
  a.setApiKey('sk-test');
  const logs = [];
  a.onLog = (message, type) => logs.push({ message, type });
  return { agent: a, logs };
}

const claudeList = ids => ({ data: ids.map((id, i) => ({ type: 'model', id, display_name: labelFromId(id), created_at: new Date(2026, 9 - i, 1).toISOString() })) });
const reply = text => ({ content: [{ type: 'text', text: JSON.stringify({ action: 'message', explanation: text }) }], stop_reason: 'end_turn' });

test('refreshing fetches the live list, caches it, and the dropdown offers it', async t => {
  const { agent: a, logs } = agent();
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => claudeList(['claude-opus-5-6', 'claude-sonnet-5-5', 'claude-opus-5-5']) };
  });
  assert.equal(a.modelListInfo().source, 'built-in');
  const result = await a.refreshModels();
  assert.equal(result.source, 'live');
  assert.match(calls[0].url, /api\.anthropic\.com\/v1\/models/);
  assert.equal(calls[0].options.method, 'GET');
  assert.ok(a.getVendorModels().some(m => m.id === 'claude-opus-5-6' && m.isNew));
  assert.equal(a.modelListInfo().source, 'live');

  // A second refresh within the day uses the cache.
  await a.refreshModels();
  assert.equal(calls.length, 1);
  await a.refreshModels({ force: true });
  assert.equal(calls.length, 2);
  void logs;
});

test('a newer model of the chosen family is offered, or chosen when the player asked to follow the newest', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => claudeList(['claude-opus-5-6', 'claude-opus-5-5', 'claude-sonnet-5-5']) }));

  const offered = agent();
  offered.agent.setModel('claude-opus-5-5');
  const first = await offered.agent.refreshModels();
  assert.equal(first.available, 'claude-opus-5-6');
  assert.equal(offered.agent.model, 'claude-opus-5-5', 'the choice is the player\'s');
  assert.ok(offered.logs.some(l => /Claude Opus 5\.6 is available/.test(l.message)));
  await offered.agent.refreshModels({ force: true });
  assert.equal(offered.logs.filter(l => /is available/.test(l.message)).length, 1, 'mentioned once, not on every refresh');

  const followed = agent();
  followed.agent.setModel('claude-opus-5-5');
  followed.agent.setAutoUpgrade(true);
  const second = await followed.agent.refreshModels();
  assert.equal(second.upgradedTo, 'claude-opus-5-6');
  assert.equal(followed.agent.model, 'claude-opus-5-6');
});

test('when the list cannot be fetched the built-in list stays, and nothing throws', async t => {
  const { agent: a } = agent();
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 401, json: async () => ({}) }));
  const result = await a.refreshModels({ force: true });
  assert.equal(result.source, 'built-in');
  assert.match(result.error, /401/);
  assert.deepEqual(a.getVendorModels().map(m => m.id), VENDORS.claude.models.map(m => m.id));

  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  assert.equal((await a.refreshModels({ force: true })).error, 'offline');

  const noKey = agent();
  noKey.agent.setApiKey('');
  assert.equal((await noKey.agent.refreshModels({ force: true })).source, 'built-in');
});

test('a retired model is replaced by the newest of its family and the request is sent again', async t => {
  const { agent: a, logs } = agent();
  a.setModel('claude-opus-5-5');
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (/\/v1\/models/.test(url)) return { ok: true, json: async () => claudeList(['claude-opus-5-6', 'claude-sonnet-5-5']) };
    const body = JSON.parse(options.body);
    sent.push(body.model);
    if (body.model === 'claude-opus-5-5') {
      const text = JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'model: claude-opus-5-5' } });
      return { ok: false, status: 404, statusText: 'Not Found', clone: () => ({ text: async () => text }), json: async () => JSON.parse(text) };
    }
    return { ok: true, json: async () => reply('Hello from the new model') };
  });
  await a.executePrompt('hi');
  assert.equal(a.lastError, null, a.lastError?.message);
  assert.deepEqual(sent, ['claude-opus-5-5', 'claude-opus-5-6']);
  assert.equal(a.model, 'claude-opus-5-6', 'and the new choice is kept');
  assert.ok(logs.some(l => /no longer serves claude-opus-5-5; switched to claude-opus-5-6/.test(l.message)));
});

test('a retired Gemini model is swapped in the URL, where Gemini names the model', async t => {
  const { agent: a } = agent('gemini');
  a.setModel('gemini-3.7-flash');
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (/\/models\?/.test(url)) return { ok: true, json: async () => ({ models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }] }) };
    urls.push(url);
    if (url.includes('gemini-3.7-flash')) {
      const text = 'models/gemini-3.7-flash is not found for API version v1beta';
      return { ok: false, status: 404, clone: () => ({ text: async () => text }), json: async () => ({ error: { message: text } }) };
    }
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ action: 'message', explanation: 'hi' }) }] } }] }) };
  });
  await a.executePrompt('hi');
  assert.equal(a.lastError, null, a.lastError?.message);
  assert.ok(urls.at(-1).includes('gemini-3.8-flash'));
});
