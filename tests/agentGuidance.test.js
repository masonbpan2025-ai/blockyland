// A request that cannot be carried out must tell the player what to do instead.
//
// Regression guard: failures used to print the raw reason the code objected to —
// "Unsupported action: execute_javascript", "Structure not found: made_up_id" —
// which says nothing about how to reach the goal.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPABILITIES,
  explainFailure,
  explainFailureBriefly
} from '../src/agentCapabilities.js';
import { WorldAgent } from '../src/worldAgent.js';
import { BLOCKS } from '../src/blocks.js';

// --- the catalogue ----------------------------------------------------------

test('every failure explanation offers at least one way forward', () => {
  const reasons = [
    'DeepSeek API HTTP 401: Unauthorized',
    'DeepSeek API HTTP 402: Payment Required',
    'DeepSeek API HTTP 429: Too Many Requests',
    'DeepSeek API HTTP 400: Bad Request',
    'Request to DeepSeek failed after 60.0s: idle timeout',
    'DeepSeek stopped sending data for 60s mid-response',
    'No JSON plan was returned by DeepSeek: finish reason: stop',
    'The reply from DeepSeek was not a usable plan',
    'Unsupported action: execute_javascript',
    'Structure not found: custom_thing_123',
    'No tracked blocks exist for this structure.',
    'The requested operations did not select any blocks.',
    'Requested region exceeds world height (1-63).',
    'something nobody anticipated'
  ];

  for (const reason of reasons) {
    const explanation = explainFailure(new Error(reason));
    assert.ok(explanation.summary.length > 10, `needs a summary: ${reason}`);
    assert.ok(explanation.alternatives.length >= 1, `needs at least one suggestion: ${reason}`);
    assert.match(explanation.advice, /•/, 'the advice is a readable list');
    assert.equal(explanation.reason, reason, 'and the technical reason is retained');
  }
});

test('credential and rate-limit failures are not mistaken for scripting requests', () => {
  // "API HTTP 401" contains "API"; an earlier version matched it as a scripting
  // request and answered an auth failure with advice about running code.
  assert.match(explainFailure(new Error('DeepSeek API HTTP 401: Unauthorized')).summary, /API key was rejected/);
  assert.match(explainFailure(new Error('OpenAI API HTTP 429')).summary, /rate limiting/);
  assert.match(explainFailure(new Error('DeepSeek API HTTP 402')).summary, /out of credit/);
  // And a genuine scripting request still routes to the scripting advice.
  assert.match(explainFailure(new Error('Unsupported action: execute_javascript')).summary, /cannot run code/);
  assert.match(explainFailure(new Error('ok'), { prompt: 'run this javascript for me' }).summary, /cannot run code/);
});

test('a request naming something the engine lacks is explained, not just refused', () => {
  const cases = [
    ['can we play together?', /no multiplayer/i],
    ['make a redstone logic circuit that counts', /no redstone logic/i],
    ['install a shaderpack', /cannot run code/i],
    ['build a nether portal to another dimension', /one generated overworld/i],
    ['import a custom model', /fixed atlas/i],
    ['spawn 500 golems', /practical limits/i]
  ];
  for (const [prompt, expected] of cases) {
    const explanation = explainFailure(new Error('unsupported'), { prompt });
    assert.match(explanation.summary, expected, `for prompt "${prompt}"`);
    assert.ok(explanation.alternatives.length >= 1);
  }
});

test('the brief form is one line with a concrete suggestion', () => {
  const brief = explainFailureBriefly(new Error('Unsupported action: execute_javascript'));
  assert.doesNotMatch(brief, /\n/, 'no line breaks');
  assert.match(brief, /Try: /, 'and it suggests something');
});

test('the capability catalogue documents the main systems with alternatives', () => {
  for (const key of ['build', 'edit', 'fluids', 'terrain', 'mobs', 'weather', 'inventory', 'agentLimits']) {
    const entry = CAPABILITIES[key];
    assert.ok(entry, `missing capability: ${key}`);
    assert.ok(entry.summary.length > 20, `${key} needs a summary`);
    assert.ok(entry.alternatives.length >= 1, `${key} needs alternatives`);
  }
});

test('explainFailure accepts a string, an Error, or nothing at all', () => {
  assert.ok(explainFailure('boom').summary);
  assert.ok(explainFailure(new Error('boom')).summary);
  assert.ok(explainFailure(null).summary);
  assert.ok(explainFailure(undefined).summary);
});

// --- and it reaches the player ----------------------------------------------

function fixture() {
  const game = {
    world: {
      getVoxel: () => BLOCKS.AIR, setVoxel() {},
      getOrCreateChunk: () => ({ dirty: false }), chunks: new Map()
    },
    player: { position: { x: 0, y: 12, z: 0 }, yaw: 0, pitch: 0, gamemode: 'creative' },
    worldTime: 6000,
    weather: { weatherType: 'clear' },
    sounds: { playMagic() {}, playLevelUp() {}, playClick() {}, playPlace() {}, playBreak() {} },
    rebuildChunkMesh() {}
  };
  const agent = new WorldAgent(game);
  agent.setVendor('deepseek');
  agent.setApiKey('k');
  return { agent, game };
}

function sse(content) {
  const encoder = new TextEncoder();
  const body = encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`);
  let sent = false;
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: { get: n => (n.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
    body: { getReader: () => ({ read: async () => (sent ? { done: true, value: undefined } : (sent = true, { done: false, value: body })) }) }
  };
}

test('a failure the model reported as an unknown action reaches the player as guidance', async t => {
  const { agent } = fixture();
  t.mock.method(console, 'error', () => {});
  const logs = [];
  agent.onLog = (message, type) => logs.push({ message, type });

  // The shape that produced "Unsupported action: execute_javascript".
  t.mock.method(globalThis, 'fetch', async () => sse(JSON.stringify({
    action: 'multi',
    steps: [{ action: 'build', structureType: 'custom', operations: [{ type: 'fill_box', min: [0, 0, 0], max: [1, 1, 1], block: 'STONE' }] },
      { action: 'execute_javascript', code: 'while(true){}' }]
  })));

  await agent.executePrompt('make a redstone computer');

  // The raw failure is still recorded, but the terminal explains and suggests.
  assert.ok(agent.lastError, 'the failure is still recorded honestly');
  const guidance = logs.filter(entry => entry.type === 'info' && entry.message.startsWith('• '));
  assert.ok(guidance.length >= 1, 'the player is given suggestions, not just an error');
  assert.ok(logs.some(entry => /Could not do that:/.test(entry.message)), 'and told what could not be done');
  // The conversation memory keeps the advice for the next turn.
  assert.match(agent.conversationHistory.at(-1).text, /Could not do that:/);
  assert.match(agent.conversationHistory.at(-1).text, /technical reason/);
});

test('a network failure gives recovery steps rather than a bare status', async t => {
  const { agent } = fixture();
  t.mock.method(console, 'error', () => {});
  const logs = [];
  agent.onLog = (message, type) => logs.push({ message, type });
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 402, statusText: 'Payment Required' }));

  await agent.executePrompt('build a castle');
  assert.match(agent.lastError.message, /402/);
  assert.ok(logs.some(entry => /out of credit/i.test(entry.message)), 'explains the situation');
  assert.ok(logs.some(entry => entry.type === 'info' && /• /.test(entry.message)), 'and offers next steps');
});
