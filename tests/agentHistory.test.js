import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { WorldAgent } from '../src/worldAgent.js';
import {
  createAgentTurnRecord,
  saveAgentTurn,
  getAgentHistory,
  getLastTurn,
  clearAgentHistory,
  formatTurnDiagnostic,
  maskSecret,
  sanitizeHeaders,
  sanitizeUrl,
  sanitizeRequestBody
} from '../src/agentHistory.js';
import { BLOCKS } from '../src/blocks.js';

// Minimal mock game engine for WorldAgent tests
function createMockGame() {
  const voxels = new Map();
  return {
    world: {
      getVoxel: (x, y, z) => voxels.get(`${x},${y},${z}`) ?? BLOCKS.AIR,
      setVoxel: (x, y, z, id) => {
        voxels.set(`${x},${y},${z}`, id);
        return true;
      }
    },
    player: {
      position: { x: 0, y: 64, z: 0 },
      yaw: 0,
      pitch: 0,
      gamemode: 'survival',
      health: 20,
      maxHealth: 20,
      hunger: 20,
      maxHunger: 20
    },
    sounds: {
      playLevelUp: () => {},
      playClick: () => {}
    },
    weather: {
      setWeather: () => {}
    },
    worldTime: 1000
  };
}

function mockFetchResponse(status, body, { headers = { 'content-type': 'application/json' } } = {}) {
  const textBody = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {
      get: name => headers[name.toLowerCase()] || headers[name] || null
    },
    text: async () => textBody,
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    clone: function() { return this; }
  };
}

test('maskSecret & sanitization protect API keys while preserving debugging context', () => {
  assert.equal(maskSecret('AIzaSyB1234567890'), 'AIza***7890');
  assert.equal(maskSecret('sk-proj-1234567890abcdef'), 'sk-p***cdef');
  assert.equal(maskSecret('short'), '***');
  assert.equal(maskSecret(''), '');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sk-proj-1234567890abcdef',
    'x-goog-api-key': 'AIzaSySecretKey123456',
    'x-api-key': 'sk-ant-anthropic-key-7890',
    'anthropic-version': '2023-06-01'
  };

  const sanitized = sanitizeHeaders(headers);
  assert.equal(sanitized['Content-Type'], 'application/json');
  assert.equal(sanitized['anthropic-version'], '2023-06-01');
  assert.equal(sanitized['Authorization'], 'Bearer sk-p***cdef');
  assert.equal(sanitized['x-goog-api-key'], 'AIza***3456');
  assert.equal(sanitized['x-api-key'], 'sk-a***7890');

  const urlWithKey = 'https://generativelanguage.googleapis.com/v1beta/models/gemini?key=AIzaSySecret1234';
  assert.equal(sanitizeUrl(urlWithKey), 'https://generativelanguage.googleapis.com/v1beta/models/gemini?key=AIza***1234');
});

test('sanitizeRequestBody preserves full prompt & schema while summarizing base64 payloads', () => {
  const geminiBody = {
    systemInstruction: { parts: [{ text: 'You are an architect agent' }] },
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: 'A'.repeat(50000) } },
          { text: 'Build a castle based on this image' }
        ]
      }
    ],
    generationConfig: { responseMimeType: 'application/json' }
  };

  const sanitized = sanitizeRequestBody(geminiBody);
  assert.equal(sanitized.systemInstruction.parts[0].text, 'You are an architect agent');
  assert.equal(sanitized.contents[0].parts[1].text, 'Build a castle based on this image');
  assert.equal(sanitized.contents[0].parts[0].inlineData.dataLengthChars, 50000);
  assert.ok(sanitized.contents[0].parts[0].inlineData.preview.startsWith('AAAA'));
  assert.equal(sanitized.generationConfig.responseMimeType, 'application/json');

  const claudeBody = {
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'B'.repeat(40000) } },
          { type: 'text', text: 'Reconstruct this house' }
        ]
      }
    ]
  };

  const sanitizedClaude = sanitizeRequestBody(claudeBody);
  assert.equal(sanitizedClaude.messages[0].content[1].text, 'Reconstruct this house');
  assert.equal(sanitizedClaude.messages[0].content[0].source.dataLengthChars, 40000);
});

test('saveAgentTurn writes to agent_history.json and agent_history_latest.json on disk', async () => {
  const testDir = path.resolve(process.cwd(), '.test_history_tmp');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  try {
    const turn = createAgentTurnRecord({
      turnId: 101,
      vendor: 'deepseek',
      vendorLabel: 'DeepSeek',
      model: 'deepseek-flash',
      prompt: 'build a stone bridge'
    });

    turn.recordRequestAttempt({
      url: 'https://api.deepseek.com/chat/completions',
      headers: { Authorization: 'Bearer sk-deepseek-test-key-1234' },
      body: { model: 'deepseek-flash', messages: [{ role: 'user', content: 'build a stone bridge' }] }
    });

    turn.recordResponse({
      status: 200,
      rawText: '{"action":"build","buildingType":"bridge","material":"stone"}',
      reasoning: 'The player requested a bridge made of stone.'
    });

    turn.recordPlan({
      parsedPlan: { action: 'build', buildingType: 'bridge', material: 'stone' },
      validatedPlan: { action: 'build', buildingType: 'bridge', material: 'stone' }
    });

    turn.finalizeExecution({
      status: 'completed',
      explanation: 'Built stone bridge'
    });

    await saveAgentTurn(turn, { cwd: testDir });

    // Check files on disk in test directory
    const historyPath = path.resolve(testDir, 'agent_history.json');
    const latestPath = path.resolve(testDir, 'agent_history_latest.json');
    assert.ok(fs.existsSync(historyPath), 'agent_history.json must exist');
    assert.ok(fs.existsSync(latestPath), 'agent_history_latest.json must exist');

    const latestContent = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    assert.equal(latestContent.turnId, 101);
    assert.equal(latestContent.vendor, 'deepseek');
    assert.equal(latestContent.prompt, 'build a stone bridge');
    assert.equal(latestContent.request.url, 'https://api.deepseek.com/chat/completions');
    assert.equal(latestContent.request.headers.Authorization, 'Bearer sk-d***1234');
    assert.equal(latestContent.response.status, 200);
    assert.equal(latestContent.response.reasoning, 'The player requested a bridge made of stone.');
    assert.equal(latestContent.execution.status, 'completed');

    // Diagnostic formatting check
    const diagnostic = formatTurnDiagnostic(turn);
    assert.ok(diagnostic.includes('Agent Turn Diagnostic'));
    assert.ok(diagnostic.includes('DeepSeek'));
    assert.ok(diagnostic.includes('build a stone bridge'));
    assert.ok(diagnostic.includes('The player requested a bridge made of stone.'));
  } finally {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  }
});

test('full request and response capture works end-to-end for all 4 vendor types', async () => {
  const originalFetch = globalThis.fetch;

  try {
    const game = createMockGame();
    const agent = new WorldAgent(game);
    agent.setOfflineMode(false);

    // 1. Google Gemini
    agent.setVendor('gemini');
    agent.apiKey = 'AIzaSyGoogleGeminiKey12345';
    let capturedReq = null;
    globalThis.fetch = async (url, options) => {
      capturedReq = { url, options, body: JSON.parse(options.body) };
      return mockFetchResponse(200, {
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ action: 'time', time: 'day', explanation: 'Setting world time to day' }) }]
            },
            finishReason: 'STOP'
          }
        ],
        usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 40, totalTokenCount: 190 }
      });
    };

    await agent.executePrompt('set time to day');
    let turn = await agent.getLastTurn();
    assert.equal(turn.vendor, 'gemini');
    assert.equal(turn.request.url.includes('generativelanguage.googleapis.com'), true);
    assert.equal(turn.request.headers['x-goog-api-key'], 'AIza***2345');
    assert.ok(turn.request.body.contents.length > 0);
    assert.equal(turn.response.status, 200);
    assert.equal(turn.plan.action, 'time');
    assert.equal(turn.execution.status, 'completed');

    // 2. DeepSeek
    agent.setVendor('deepseek');
    agent.apiKey = 'sk-deepseek-api-key-98765';
    globalThis.fetch = async (url, options) => {
      capturedReq = { url, options, body: JSON.parse(options.body) };
      return mockFetchResponse(200, {
        choices: [
          {
            message: {
              content: JSON.stringify({ action: 'weather', weather: 'clear', explanation: 'Clearing skies' }),
              reasoning_content: 'User wants clear weather so set weather to clear.'
            },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 180, completion_tokens: 50, total_tokens: 230 }
      });
    };

    await agent.executePrompt('clear the weather');
    turn = await agent.getLastTurn();
    assert.equal(turn.vendor, 'deepseek');
    assert.equal(turn.request.url, 'https://api.deepseek.com/chat/completions');
    assert.equal(turn.request.headers.Authorization, 'Bearer sk-d***8765');
    assert.ok(turn.request.body.thinking?.type, 'enabled');
    assert.equal(turn.response.reasoning, 'User wants clear weather so set weather to clear.');
    assert.equal(turn.plan.action, 'weather');
    assert.equal(turn.execution.status, 'completed');

    // 3. OpenAI ChatGPT
    agent.setVendor('chatgpt');
    agent.apiKey = 'sk-proj-chatgpt-key-43210';
    globalThis.fetch = async (url, options) => {
      capturedReq = { url, options, body: JSON.parse(options.body) };
      return mockFetchResponse(200, {
        choices: [
          {
            message: {
              content: JSON.stringify({ action: 'gamemode', mode: 'creative', explanation: 'Switching to creative mode' })
            },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 210, completion_tokens: 35, total_tokens: 245 }
      });
    };

    await agent.executePrompt('switch to creative');
    turn = await agent.getLastTurn();
    assert.equal(turn.vendor, 'chatgpt');
    assert.equal(turn.request.url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(turn.request.headers.Authorization, 'Bearer sk-p***3210');
    assert.deepEqual(turn.request.body.response_format, { type: 'json_object' });
    assert.equal(turn.plan.action, 'gamemode');
    assert.equal(turn.execution.status, 'completed');

    // 4. Anthropic Claude
    agent.setVendor('claude');
    agent.apiKey = 'sk-ant-claude-test-key-55555';
    globalThis.fetch = async (url, options) => {
      capturedReq = { url, options, body: JSON.parse(options.body) };
      return mockFetchResponse(200, {
        content: [
          { type: 'thinking', thinking: 'I will apply night vision status effect.' },
          { type: 'text', text: JSON.stringify({ action: 'effect', mode: 'give', operation: 'give', effect: 'night_vision', seconds: 120, explanation: 'Granting night vision' }) }
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 250, output_tokens: 60 }
      });
    };

    await agent.executePrompt('give me night vision');
    turn = await agent.getLastTurn();
    assert.equal(turn.vendor, 'claude');
    assert.equal(turn.request.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(turn.request.headers['x-api-key'], 'sk-a***5555');
    assert.equal(turn.request.headers['anthropic-dangerous-direct-browser-access'], 'true');
    assert.ok(turn.request.body.thinking);
    assert.equal(turn.response.reasoning, 'I will apply night vision status effect.');
    assert.equal(turn.plan.action, 'effect');
    assert.equal(turn.execution.status, 'completed');

  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('captures HTTP errors, 401 rejected keys, and 429 quota failures immediately into history', async () => {
  const originalFetch = globalThis.fetch;

  try {
    const game = createMockGame();
    const agent = new WorldAgent(game);
    agent.setOfflineMode(false);
    agent.setVendor('deepseek');
    agent.apiKey = 'sk-bad-key-1111';

    globalThis.fetch = async () => {
      return mockFetchResponse(401, {
        error: { message: 'Authentication failed: Invalid API key', code: 'invalid_api_key' }
      });
    };

    await agent.executePrompt('build a fortress');

    const lastTurn = await agent.getLastTurn();
    assert.equal(lastTurn.vendor, 'deepseek');
    assert.equal(lastTurn.prompt, 'build a fortress');
    assert.equal(lastTurn.execution.status, 'failed');
    assert.equal(lastTurn.response.status, 401);
    assert.ok(lastTurn.error);
    assert.equal(lastTurn.error.type, 'http');
    assert.ok(lastTurn.error.message.includes('API key was rejected'));
    assert.equal(lastTurn.error.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('captures empty response and invalid plan action in history', async () => {
  const originalFetch = globalThis.fetch;

  try {
    const game = createMockGame();
    const agent = new WorldAgent(game);
    agent.setOfflineMode(false);
    agent.setVendor('gemini');
    agent.apiKey = 'AIzaSyGoodKey1234';

    // 1. Model returns empty content
    globalThis.fetch = async () => {
      return mockFetchResponse(200, {
        candidates: [{
          content: { parts: [{ text: '' }] },
          finishReason: 'STOP'
        }]
      });
    };

    await agent.executePrompt('make a house');

    let lastTurn = await agent.getLastTurn();
    assert.equal(lastTurn.vendor, 'gemini');
    assert.equal(lastTurn.execution.status, 'failed');
    assert.ok(lastTurn.error);
    assert.ok(lastTurn.plan.unreadable);
    assert.ok(lastTurn.error.message.includes('No JSON plan was returned'));

    // 2. Model returns an invalid plan action
    globalThis.fetch = async () => {
      return mockFetchResponse(200, {
        candidates: [{
          content: { parts: [{ text: JSON.stringify({ action: 'destroy_the_entire_universe_now' }) }] },
          finishReason: 'STOP'
        }]
      });
    };

    await agent.executePrompt('destroy the world');
    lastTurn = await agent.getLastTurn();
    assert.equal(lastTurn.execution.status, 'failed');
    assert.ok(lastTurn.error);
    assert.equal(lastTurn.error.type, 'validation');
    assert.ok(lastTurn.error.message.includes('not a usable plan'));

  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('captures offline execution commands and plans when no API key is set', async () => {
  await clearAgentHistory();
  const game = createMockGame();
  const agent = new WorldAgent(game);
  agent.setVendor('deepseek');
  agent.apiKey = ''; // offline mode

  await agent.executePrompt('/time set noon');

  const turn = await agent.getLastTurn();
  assert.equal(turn.offline, true);
  assert.equal(turn.prompt, '/time set noon');
  assert.equal(turn.plan.action, 'time');
  assert.equal(turn.execution.status, 'completed');
  assert.equal(game.worldTime, 6000);

  assert.ok(fs.existsSync(path.resolve(process.cwd(), 'agent_history_latest.json')), 'agent_history_latest.json must exist on disk');
  const onDiskRaw = fs.readFileSync(path.resolve(process.cwd(), 'agent_history_latest.json'), 'utf8');
  const onDisk = JSON.parse(onDiskRaw);
  assert.ok(onDisk.timestamp, 'recorded turn must contain timestamp');
  assert.ok(onDisk.execution, 'recorded turn must contain execution');
});
