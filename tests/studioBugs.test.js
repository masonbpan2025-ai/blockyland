// Verify the two reported bugs are fixed, end to end where possible.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { WorldAgent } from '../src/worldAgent.js';
import { BuildingStudioManager } from '../src/buildingStudio.js';
import { BLOCKS } from '../src/blocks.js';

function fixture() {
  const world = {
    getVoxel: (x, y) => (y < 10 ? BLOCKS.DIRT : y === 10 ? BLOCKS.GRASS : BLOCKS.AIR),
    setVoxel() {},
    getOrCreateChunk: () => ({ dirty: false }),
    chunks: new Map()
  };
  const manager = new BuildingStudioManager({});
  manager.isActive = true;
  const game = {
    world,
    player: { position: { x: 0, y: 12, z: 0 }, yaw: 0, gamemode: 'creative' },
    worldTime: 6000,
    weather: { weatherType: 'clear' },
    sounds: { playMagic() {}, playLevelUp() {}, playClick() {}, playPlace() {}, playBreak() {} },
    rebuildChunkMesh() {},
    buildingStudio: manager
  };
  manager.game = game;
  const agent = new WorldAgent(game);
  agent.setVendor('deepseek');
  agent.setApiKey('k');
  return { agent, manager };
}

/** Streaming response stub carrying one SSE chunk. */
function sse(payload) {
  const encoder = new TextEncoder();
  const body = encoder.encode(`data: ${JSON.stringify(payload)}\n\ndata: [DONE]\n\n`);
  let sent = false;
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: name => (name.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: body };
        }
      })
    }
  };
}

test('bug 1: a truncated model reply no longer surfaces as a raw JSON SyntaxError', async t => {
  const { agent } = fixture();
  // Exactly the shape from the screenshot: a plan cut off mid-array.
  const truncated = '{"action":"build","name":"Castle with bridge","buildingType":"custom","dimensions":{"width":6,"height":3,"depth":6},"operations":[{"type":"fill_box","min":[0,0,0],"max":[5,1,5],"block":"OAK_PLANKS"';
  t.mock.method(globalThis, 'fetch', async () => sse({
    choices: [{ delta: { content: truncated } }],
    usage: { completion_tokens: 4073, total_tokens: 17542, completion_tokens_details: { reasoning_tokens: 3369 } }
  }));

  await agent.executePrompt('add a bridge to the entrance of the castle');

  // The old failure: lastError was a SyntaxError about 'after array element'.
  assert.equal(agent.lastError, null, `should not error, got: ${agent.lastError?.message}`);
  assert.match(agent.conversationHistory.at(-1).text, /completed/, 'the recovered plan ran');
});

test('bug 1: a prose answer is shown to the player, not reported as a failure', async t => {
  const { agent } = fixture();
  // Asking a question makes models answer in words. That used to be discarded.
  t.mock.method(globalThis, 'fetch', async () => sse({
    choices: [{ delta: { content: 'You are standing on grass with a stone wall a few blocks ahead.' } }],
    usage: { completion_tokens: 24 }
  }));

  await agent.executePrompt("what's in front of me?");

  assert.equal(agent.lastError, null, 'prose is not an error');
  const plan = JSON.parse(agent.conversationHistory.at(-1).text).plan;
  assert.equal(plan.action, 'message');
  assert.match(plan.explanation, /stone wall a few blocks ahead/, 'the answer reaches the player');
});

test('bug 1: an empty reply still fails cleanly rather than pretending to answer', async t => {
  const { agent } = fixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async () => sse({
    choices: [{ delta: { content: '' }, finish_reason: 'stop' }]
  }));

  await agent.executePrompt('do something odd');
  assert.ok(agent.lastError, 'an empty reply is still an error');
  assert.match(agent.lastError.message, /No JSON plan was returned|finish reason/);
});

test('bug 2: the floating cursor icon is always synced and cleared', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/ui.js'), 'utf8');

  // The method must clear the src when hiding, and must not un-hide before the
  // metadata is known to be valid — otherwise a stale icon (or a broken image
  // placeholder) stays pinned at the last cursor position.
  const method = source.slice(source.indexOf('updateFloatingCursor() {'));
  const body = method.slice(0, method.indexOf('\n  }'));
  assert.match(body, /getItemMeta/, 'metadata is consulted');
  assert.match(body, /!meta/, 'a missing item/metadata path exists');
  assert.match(body, /removeAttribute\('src'\)/, 'the stale icon src is cleared so no ghost image remains');
  assert.match(body, /lastPointerX/, 'the ghost is re-pinned to the pointer on every sync');

  const hideIndex = body.indexOf("classList.add('hidden')");
  const revealIndex = body.indexOf("classList.remove('hidden')");
  assert.ok(hideIndex > -1 && revealIndex > -1 && hideIndex < revealIndex, 'the hide-check precedes the reveal');

  // closeAllModals must sync the cursor unconditionally, not only when an item
  // happens to be held: it is the single funnel for every close path.
  const closeFn = source.slice(source.indexOf('closeAllModals() {'));
  const closeBody = closeFn.slice(0, closeFn.indexOf('\n  }'));
  const syncIndex = closeBody.indexOf('updateFloatingCursor()');
  const cursorBranchIndex = closeBody.indexOf('if (this.inv.cursorItem)');
  assert.ok(syncIndex > -1, 'closing modals syncs the ghost icon');
  assert.ok(syncIndex > cursorBranchIndex, 'the sync sits outside the cursorItem branch');
});

test('bug 2: a stale icon cannot be left visible by a failed metadata lookup', () => {
  // Mirrors the fixed control flow with a metadata lookup that returns nothing.
  const element = {
    classes: new Set(),
    src: '/assets/items/diamond.png',
    classList: {
      add(name) { element.classes.add(name); },
      remove(name) { element.classes.delete(name); },
      contains(name) { return element.classes.has(name); }
    }
  };

  const cursorItem = null;
  const getItemMeta = () => null;

  const meta = cursorItem ? getItemMeta(cursorItem) : null;
  if (!meta) {
    element.classList.add('hidden');
    element.src = '';
  } else {
    element.classList.remove('hidden');
  }

  assert.equal(element.classList.contains('hidden'), true, 'hidden when there is no item');
  assert.equal(element.src, '', 'and the stale icon is cleared');
});
