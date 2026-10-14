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
  explainFailureBriefly,
  isExternalFailure
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
  assert.match(explainFailure(new Error('DeepSeek API HTTP 401: Unauthorized')).summary, /key was turned down/i);
  assert.match(explainFailure(new Error('OpenAI API HTTP 429')).summary, /slow down/i);
  assert.match(explainFailure(new Error('DeepSeek API HTTP 402')).summary, /out of credit/i);
  // And a genuine scripting request still routes to the scripting advice.
  assert.match(explainFailure(new Error('Unsupported action: execute_javascript')).summary, /cannot run code/i);
  assert.match(explainFailure(new Error('ok'), { prompt: 'run this javascript for me' }).summary, /cannot run code/i);
});

test('the player-facing wording avoids jargon a new player would not know', () => {
  const reasons = [
    'API HTTP 401', 'API HTTP 402', 'API HTTP 429', 'API HTTP 400',
    'idle timeout', 'no json plan was returned', 'was malformed',
    'Unsupported action: execute_javascript', 'Structure not found: x',
    'no tracked blocks', 'exceeds world height', 'something odd'
  ];
  for (const reason of reasons) {
    const { summary, alternatives } = explainFailure(new Error(reason), { prompt: 'make a redstone computer' });
    const jargon = /HTTP|JSON|token|endpoint|stack trace|undefined|null/i;
    assert.doesNotMatch(summary, jargon, `summary must stay plain for: ${reason}`);
    for (const alternative of alternatives) {
      assert.doesNotMatch(alternative, jargon, `alternative must stay plain for: ${reason}`);
    }
  }
});

test('an external failure is distinguishable from the player asking the impossible', () => {
  // Used to decide whether to say "that was not your fault".
  assert.equal(isExternalFailure(new Error('DeepSeek API HTTP 402')), true);
  assert.equal(isExternalFailure(new Error('idle timeout')), true);
  assert.equal(isExternalFailure(new Error('The reply was malformed')), true);
  // A limit of the game is not a malfunction.
  assert.equal(isExternalFailure(new Error('Unsupported action: execute_javascript')), false);
  assert.equal(isExternalFailure(new Error('Structure not found: x')), false);
});

test('a request naming something the engine lacks is explained, not just refused', () => {
  const cases = [
    ['can we play together?', /share this world/i],
    ['make a redstone logic circuit that counts', /does not think/i],
    ['install a shaderpack', /cannot run code/i],
    ['build a nether portal to another dimension', /one world here/i],
    ['import a custom model', /fixed set/i],
    ['spawn 500 golems', /more than one request can carry/i]
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
  assert.match(brief, /Try this: /, 'and it suggests something');
});

test('the persona reaches the model as a helpful player sitting alongside', () => {
  const { agent } = fixture();
  const prompt = agent.buildSystemPrompt();

  assert.match(prompt, /WHO YOU ARE/);
  assert.match(prompt, /experienced Minecraft player sitting next to the player/);
  assert.match(prompt, /Never sound like a program, a form or a status report/);
  assert.match(prompt, /Always be helpful, even when the answer is no/, 'helpfulness is unconditional');
  assert.match(prompt, /No jargon, no error codes, no stack traces/, 'plain language is required');
  assert.match(prompt, /Never shame the player and never blame them/);
  assert.match(prompt, /Never answer with a bare error or a refusal/, 'and never just throw an error');
  assert.match(prompt, /Offer the nearest thing that IS possible/, 'always offer a way forward');
  assert.match(prompt, /never claim you did something you did not do/, 'without overclaiming');
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
  assert.ok(logs.some(entry => /could not do that one/i.test(entry.message)), 'and told plainly what happened');
  // The conversation memory keeps the advice, plus the reason for diagnosing.
  assert.match(agent.conversationHistory.at(-1).text, /I could not do that one/);
  assert.match(agent.conversationHistory.at(-1).text, /technical reason/);
});

test('a failure that was not the player\u2019s doing says so', async t => {
  const { agent } = fixture();
  t.mock.method(console, 'error', () => {});
  const logs = [];
  agent.onLog = (message, type) => logs.push({ message, type });
  t.mock.method(globalThis, 'fetch', async () => {
    const error = new Error('simulated drop');
    error.name = 'TypeError';
    throw error;
  });

  await agent.executePrompt('build a castle');
  assert.ok(agent.lastError, 'still recorded');
  assert.ok(logs.some(entry => /not your fault/i.test(entry.message)),
    'a dropped connection is visibly not the player\u2019s fault');
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
