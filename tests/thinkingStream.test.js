// Does the model's reasoning actually reach the UI callback during a real call?
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldAgent } from '../src/worldAgent.js';
import { BLOCKS } from '../src/blocks.js';

function fixture() {
  const game = {
    world: { getVoxel: () => BLOCKS.AIR, setVoxel() {}, getOrCreateChunk: () => ({ dirty: false }), chunks: new Map() },
    player: { position: { x: 0, y: 12, z: 0 }, yaw: 0, pitch: 0, gamemode: 'creative' },
    worldTime: 6000, weather: { weatherType: 'clear' },
    sounds: { playMagic() {}, playLevelUp() {}, playClick() {}, playPlace() {}, playBreak() {} },
    rebuildChunkMesh() {}
  };
  const agent = new WorldAgent(game);
  agent.setVendor('deepseek');
  agent.setApiKey('k');
  return { agent, game };
}

/** DeepSeek-style SSE: reasoning_content first, then the JSON answer. */
function reasoningStream() {
  const events = [
    { choices: [{ delta: { reasoning_content: 'The player wants to know about the world. ' } }] },
    { choices: [{ delta: { reasoning_content: 'I have the terrain map, so I can describe it. ' } }] },
    { choices: [{ delta: { content: '{"action":"message","explanation":"You are standing on grass.' } }] },
    { choices: [{ delta: { content: '"}' } }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { completion_tokens: 42 } }
  ];
  const encoder = new TextEncoder();
  const body = encoder.encode(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n');
  let sent = false;
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: { get: n => (n.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
    body: {
      getReader: () => ({
        read: async () => (sent ? { done: true, value: undefined } : (sent = true, { done: false, value: body })),
        cancel: async () => {}
      })
    }
  };
}

test('reasoning tokens reach onThought so the terminal can show thinking', async t => {
  const { agent } = fixture();
  const seen = [];
  agent.onThought = payload => seen.push(payload);
  agent.thinkingEnabled = true;
  t.mock.method(globalThis, 'fetch', async () => reasoningStream());

  await agent.executePrompt('tell me about this world');

  assert.ok(seen.length > 0, 'onThought must be called at all');
  const phases = seen.map(s => s.phase);
  assert.ok(phases.includes('start'), 'the start phase fires so the UI can reset');

  const reasoning = seen.map(s => s.reasoning || '').join('');
  assert.match(reasoning, /terrain map/, 'the model\'s reasoning text reaches the UI');
  const content = seen.map(s => s.content || '').join('');
  assert.match(content, /standing on grass/, 'and so does the answer as it arrives');

  // The final plan must still be applied.
  assert.equal(agent.lastError, null, `unexpected error: ${agent.lastError?.message}`);
});

test('thinking can be switched off without breaking the request', async t => {
  const { agent } = fixture();
  const seen = [];
  agent.onThought = payload => seen.push(payload);
  agent.thinkingEnabled = false;
  t.mock.method(globalThis, 'fetch', async () => reasoningStream());

  await agent.executePrompt('tell me about this world');
  assert.equal(agent.lastError, null, 'the request still completes');
  // The agent may still emit thought events; the UI decides whether to render them.
  assert.ok(Array.isArray(seen));
});
