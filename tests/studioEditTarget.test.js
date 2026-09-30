// An edit must resolve to the structure open in Structure Studio.
//
// Regression guard: the studio edits a library structure directly and never
// records it in builtStructures, so the model had no valid edit target. Asked to
// "create a bridge next to the entrance of the castle" it invented an id
// (custom_castle_with_bridge_muo14677) and the plan died with
// "Structure not found", even though the castle was open on screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldAgent } from '../src/worldAgent.js';
import { StructureStudioManager } from '../src/structureStudio.js';
import { StructureLibrary } from '../src/structureLibrary.js';
import { BLOCKS } from '../src/blocks.js';

function fixture({ studioOpen = true } = {}) {
  const world = {
    getVoxel: () => BLOCKS.AIR,
    setVoxel() {},
    getOrCreateChunk: () => ({ dirty: false }),
    chunks: new Map()
  };
  const studio = new StructureStudioManager({});
  studio.game = {};
  if (studioOpen) {
    studio.loadStructure(StructureLibrary.getStructure('castle'), {});
    studio.isActive = true;
  }
  const game = {
    world,
    player: { position: { x: 0, y: 12, z: 0 }, yaw: 0, gamemode: 'creative' },
    worldTime: 6000,
    weather: { weatherType: 'clear' },
    sounds: { playMagic() {}, playLevelUp() {}, playClick() {}, playPlace() {}, playBreak() {} },
    rebuildChunkMesh() {},
    structureStudio: studio
  };
  studio.game = game;
  const agent = new WorldAgent(game);
  agent.setVendor('deepseek');
  agent.setApiKey('k');
  return { agent, studio, game, world };
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

// --- resolution -------------------------------------------------------------

test('the open studio structure resolves by id, name and type', () => {
  const { agent } = fixture();
  assert.equal(agent.resolveStructure('studio_castle')?.isStudioStructure, true);
  assert.equal(agent.resolveStructure('Castle')?.isStudioStructure, true);
  assert.equal(agent.resolveStructure('castle')?.isStudioStructure, true);
  assert.equal(agent.resolveStructure({ id: 'studio_castle', isStudioStructure: true }) !== null, true);
});

test('pronouns resolve to the open studio structure', () => {
  const { agent } = fixture();
  for (const reference of ['it', 'that', 'this', 'the structure', 'the open structure']) {
    assert.equal(agent.resolveStructure(reference)?.isStudioStructure, true, `"${reference}" should resolve`);
  }
});

test('nothing resolves to the studio when it is closed', () => {
  const { agent } = fixture({ studioOpen: false });
  assert.equal(agent.resolveStructure('studio_castle'), null);
  assert.equal(agent.resolveStructure('it'), null);
});

// --- the reported failure ---------------------------------------------------

test('an invented structure id is redirected to the open studio structure', async t => {
  const { agent } = fixture();
  const logs = [];
  agent.onLog = (message, type) => logs.push({ message, type });

  // Exactly the failing case: the model names a structure that does not exist.
  t.mock.method(globalThis, 'fetch', async () => sse(JSON.stringify({
    action: 'edit',
    targetStructure: 'custom_castle_with_bridge_muo14677',
    name: 'Castle Bridge',
    dimensions: { width: 4, height: 2, depth: 4 },
    operations: [{ type: 'fill_box', min: [0, 0, 0], max: [3, 1, 3], block: 'OAK_PLANKS' }],
    explanation: 'Adding a bridge beside the gate'
  })));

  await agent.executePrompt('create a bridge next to the entrance of the castle');

  assert.equal(agent.lastError, null, `should no longer fail: ${agent.lastError?.message}`);
  assert.ok(logs.some(entry => /is not a known structure; applying this to "Castle"/.test(entry.message)),
    'the redirect is explained to the player');
  assert.match(agent.conversationHistory.at(-1).text, /completed/, 'the plan actually ran');
});

test('a wrong id still fails when no studio structure is open', async t => {
  const { agent } = fixture({ studioOpen: false });
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async () => sse(JSON.stringify({
    action: 'edit',
    targetStructure: 'custom_castle_with_bridge_muo14677',
    operations: [{ type: 'fill_box', min: [0, 0, 0], max: [1, 1, 1], block: 'STONE' }]
  })));

  await agent.executePrompt('edit that');
  assert.ok(agent.lastError, 'a genuinely unknown target is still an error');
  assert.match(agent.lastError.message, /Structure not found/);
});

test('a destroy with a wrong id is redirected too, since it is likewise unambiguous', async t => {
  const { agent } = fixture();
  agent.onLog = () => {};
  t.mock.method(globalThis, 'fetch', async () => sse(JSON.stringify({
    action: 'destroy',
    targetStructure: 'made_up_id_123',
    explanation: 'Removing it'
  })));

  await agent.executePrompt('destroy it');
  assert.equal(agent.lastError, null, `destroy should redirect as well: ${agent.lastError?.message}`);
});

test('the prompt gives the model the exact id to use and forbids inventing one', async t => {
  const { agent } = fixture();
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(JSON.parse(options.body));
    return sse(JSON.stringify({ action: 'message', explanation: 'ok' }));
  });

  await agent.executePrompt('what is open?');
  const system = calls[0].messages[0].content;
  assert.match(system, /id: studio_castle/, 'the usable id is stated');
  assert.match(system, /NEVER invent a structure id/, 'and inventing one is forbidden');
  assert.match(system, /does not exist and the request will fail/, 'with the consequence spelled out');
});
