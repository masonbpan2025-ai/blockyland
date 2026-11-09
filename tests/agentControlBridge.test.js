// The game tab's bridge (src/agentControl/bridge.js) against the real MCP server: it finds the server, pairs by the
// code it shows, runs forwarded tools, passes on what the player types, and re-pairs by itself after a reload.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createAgentControlServer } from '../scripts/blockyland-mcp.mjs';
import { AgentControlBridge } from '../src/agentControl/bridge.js';
import { ToolFailure } from '../src/agentControl/gameTools.js';

/** The browser's WebSocket, as the page sees it: the server checks the Origin header a browser always sends. */
class PageSocket extends WebSocket {
  constructor(url) { super(url, { origin: 'http://localhost:3000' }); }
}

const memoryStore = () => {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
};

async function until(check, what, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(`timed out waiting for ${what}`);
}

async function callTool(server, name, args = {}) {
  if (name === 'connect' && args.code) args = { listen: false, ...args };
  const response = await server.handle({ jsonrpc: '2.0', id: Math.random(), method: 'tools/call', params: { name, arguments: args } });
  return { isError: response.result.isError, body: JSON.parse(response.result.content[0].text), content: response.result.content };
}

function makeBridge(t, port, overrides = {}) {
  const statuses = [];
  const bridge = new AgentControlBridge({
    WebSocketImpl: PageSocket, port, retryMs: 50, store: memoryStore(),
    onStatus: s => statuses.push(s.status),
    runTool: async (name, args) => ({ result: { ran: name, args } }),
    ...overrides,
  });
  t.after(() => bridge.disable());
  return { bridge, statuses };
}

async function startServer(t, port = 0) {
  const server = createAgentControlServer({ port });
  const listening = await server.listen();
  await server.handle({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { clientInfo: { name: 'claude-code' } } });
  t.after(() => server.close());
  return { server, port: listening };
}

test('the bridge finds the server, shows a code, and pairs when the AI app gives it', async t => {
  const { server, port } = await startServer(t);
  const { bridge, statuses } = makeBridge(t, port);
  assert.equal(bridge.status, 'off');
  bridge.enable();
  assert.match(bridge.code, /^\d{6}$/);
  await until(() => bridge.status === 'waiting', 'the server');
  // "waiting" comes when the socket opens; the server's welcome, naming the AI app, follows a moment later.
  await until(() => bridge.aiApp === 'Claude Code', 'the server naming the AI app it serves');
  const connected = await callTool(server, 'connect', { code: bridge.code });
  assert.equal(connected.isError, false);
  await until(() => bridge.connected, 'pairing');
  const transitions = statuses.filter((s, i) => s !== statuses[i - 1]);
  assert.deepEqual(transitions, ['searching', 'waiting', 'connected']);
});

test('forwarded tools run in the page; a ToolFailure keeps its kind', async t => {
  const { server, port } = await startServer(t);
  const { bridge } = makeBridge(t, port, {
    runTool: async (name, args) => {
      if (name === 'run_plan') throw new ToolFailure('confirm', 'Pass confirm: true.');
      if (name === 'screenshot') return { result: {}, images: [{ mimeType: 'image/jpeg', data: 'CCCC' }] };
      return { result: { ran: name, args } };
    },
  });
  bridge.enable();
  await until(() => bridge.status === 'waiting', 'the server');
  await callTool(server, 'connect', { code: bridge.code });
  await until(() => bridge.connected, 'pairing');

  const said = (await callTool(server, 'say', { text: 'hello' })).body;
  assert.deepEqual([said.ran, said.args], ['say', { text: 'hello' }]);
  assert.match(said.next_action, /wait_for_player_message/);
  const refused = await callTool(server, 'run_plan', { plan: { action: 'destroy' } });
  assert.deepEqual([refused.isError, refused.body.kind], [true, 'confirm']);
  const shot = await callTool(server, 'screenshot');
  assert.equal(shot.content[1].data, 'CCCC');
});

test('the page hears each tool call, with its arguments, before running it, and when the AI app waits again', async t => {
  const { server, port } = await startServer(t);
  const events = [];
  const { bridge } = makeBridge(t, port, {
    onToolCall: (tool, args) => events.push(['call', tool, args]),
    onAiWaiting: () => events.push(['waiting']),
    runTool: async name => { events.push(['run', name]); return { result: {} }; },
  });
  bridge.enable();
  await until(() => bridge.status === 'waiting', 'the server');
  await callTool(server, 'connect', { code: bridge.code });
  await until(() => bridge.connected, 'pairing');
  await callTool(server, 'run_command', { command: '/time set day' });
  assert.deepEqual(events.slice(0, 2), [['call', 'run_command', { command: '/time set day' }], ['run', 'run_command']]);
  const waiting = callTool(server, 'wait_for_player_message', { timeout_seconds: 1 });
  await until(() => events.some(e => e[0] === 'waiting'), 'the waiting signal');
  await waiting;
});

test('what the player types reaches the AI app, and the page hears it was picked up', async t => {
  const { server, port } = await startServer(t);
  const received = [];
  const { bridge } = makeBridge(t, port, { onMessageReceived: id => received.push(id) });
  assert.equal(bridge.sendPlayerMessage('too early'), null, 'nothing is sent before pairing');
  bridge.enable();
  await until(() => bridge.status === 'waiting', 'the server');
  await callTool(server, 'connect', { code: bridge.code });
  await until(() => bridge.connected, 'pairing');
  const id = bridge.sendPlayerMessage('build a bridge over the river', [{ mimeType: 'image/jpeg', data: 'DDDD' }]);
  const message = await callTool(server, 'wait_for_player_message', { timeout_seconds: 5 });
  assert.equal(message.body.message, 'build a bridge over the river');
  assert.equal(message.content[1].data, 'DDDD');
  await until(() => received.includes(id), 'the pick-up notice');
});

test('a server that starts later is found, and a restarted server needs the code again', async t => {
  // Reserve a port, then free it, so the bridge starts with nothing listening there.
  const probe = createAgentControlServer({ port: 0 });
  const port = await probe.listen();
  await probe.close();

  const { bridge } = makeBridge(t, port);
  bridge.enable();
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(bridge.status, 'searching');

  const first = createAgentControlServer({ port });
  await first.listen();
  await until(() => bridge.status === 'waiting', 'the late server');
  await callTool(first, 'connect', { code: bridge.code });
  await until(() => bridge.connected, 'pairing');
  await first.close();
  await until(() => bridge.status === 'searching', 'the lost server');

  const second = createAgentControlServer({ port });
  await second.listen();
  t.after(() => second.close());
  await until(() => bridge.status === 'waiting', 'the new server');
  assert.equal(bridge.connected, false, 'a new server process does not know the old session');
  await callTool(second, 'connect', { code: bridge.code });
  await until(() => bridge.connected, 're-pairing');
});

test('a reloaded page re-pairs from its stored session token, without a new code', async t => {
  const { server, port } = await startServer(t);
  const store = memoryStore();
  const first = makeBridge(t, port, { store }).bridge;
  first.enable();
  await until(() => first.status === 'waiting', 'the server');
  await callTool(server, 'connect', { code: first.code });
  await until(() => first.connected, 'pairing');
  // A reload: the old page goes away without a goodbye, the new one starts with the same tab storage.
  first.ws.terminate();
  first.status = 'off';
  const reloaded = makeBridge(t, port, { store }).bridge;
  reloaded.enable();
  await until(() => reloaded.connected, 'automatic re-pairing');
  assert.equal((await callTool(server, 'connect')).body.connected, true);
});

test('a server speaking another protocol version is named as the side to update', async t => {
  const { WebSocketServer } = await import('ws');
  for (const [serverProtocol, expected] of [[0, 'server'], [99, 'game'], [1, null]]) {
    const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise(resolve => wss.once('listening', resolve));
    wss.on('connection', ws => ws.on('message', () => ws.send(JSON.stringify({ type: 'welcome', protocol: serverProtocol, server: '0.9.0' }))));
    const { bridge } = makeBridge(t, wss.address().port);
    bridge.enable();
    await until(() => bridge.serverVersion === '0.9.0', 'the welcome');
    assert.equal(bridge.outdated, expected, `server protocol ${serverProtocol}`);
    bridge.disable();
    await new Promise(resolve => wss.close(resolve));
  }
});

test('new code unpairs; disable stops looking and forgets the session', async t => {
  const { server, port } = await startServer(t);
  const store = memoryStore();
  const { bridge } = makeBridge(t, port, { store });
  bridge.enable();
  await until(() => bridge.status === 'waiting', 'the server');
  const oldCode = bridge.code;
  await callTool(server, 'connect', { code: oldCode });
  await until(() => bridge.connected, 'pairing');

  bridge.newCode();
  assert.notEqual(bridge.code, oldCode);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal((await callTool(server, 'connect')).body.connected, false, 'the server dropped the pairing');
  assert.equal((await callTool(server, 'connect', { code: oldCode })).body.kind, 'unknown', 'the old code no longer works');
  await callTool(server, 'connect', { code: bridge.code });
  await until(() => bridge.connected, 'pairing with the new code');

  bridge.disable();
  assert.equal(bridge.status, 'off');
  assert.equal(store.getItem('blockyland_agent_control_session'), null);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(bridge.ws, null, 'no reconnection after disable');
});

test('the bridge streams tool progress before the result and delivers public activity updates', async t => {
  const notifications = [];
  const server = createAgentControlServer({ port: 0, notify: n => notifications.push(n) });
  const port = await server.listen();
  t.after(() => server.close());
  const events = [];
  let finish, report;
  const { bridge } = makeBridge(t, port, {
    onActivity: (message, progress) => events.push(['activity', message, progress]),
    onToolResult: (tool, ok) => events.push(['result', tool, ok]),
    runTool: async (name, args, { onProgress }) => {
      report = onProgress;
      onProgress(25, 'Placing walls');
      await new Promise(resolve => { finish = resolve; });
      onProgress(100, 'Walls complete');
      return { result: { built: true } };
    },
  });
  bridge.enable();
  await until(() => bridge.aiApp, 'welcome');
  await callTool(server, 'connect', { code: bridge.code });
  await until(() => bridge.connected, 'pairing');
  await callTool(server, 'report_progress', { message: 'Choosing materials', progress: 10 });
  await until(() => events.some(e => e[0] === 'activity'), 'a public summary');
  assert.deepEqual(events[0], ['activity', 'Choosing materials', 10]);
  const building = server.handle({ jsonrpc: '2.0', id: 88, method: 'tools/call', params: {
    name: 'run_plan', arguments: { plan: { action: 'build' } }, _meta: { progressToken: 'walls' },
  } });
  await until(() => notifications.some(n => /Placing walls/.test(n.params.message)), 'streamed work');
  assert.ok(!events.some(e => e[0] === 'result'), 'progress arrived while the tool was still running');
  finish();
  assert.equal(JSON.parse((await building).result.content[0].text).built, true);
  assert.deepEqual(events.at(-1), ['result', 'run_plan', true]);
  const before = notifications.length;
  report(50, 'late callback');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(notifications.length, before);
});

test('connected and listening are separate states, and a timeout or cancellation updates the game', async t => {
  const { server, port } = await startServer(t);
  const { bridge } = makeBridge(t, port);
  bridge.enable();
  await until(() => bridge.aiApp, 'welcome');
  await callTool(server, 'connect', { code: bridge.code });
  await until(() => bridge.connected, 'pairing');
  assert.equal(bridge.listening, false);
  const waiting = callTool(server, 'wait_for_player_message', { timeout_seconds: 1 });
  await until(() => bridge.listening, 'listening state');
  assert.equal((await callTool(server, 'connect')).body.listening, true);
  await waiting;
  await until(() => !bridge.listening, 'listen timeout');
  assert.equal(bridge.connected, true);
  const id = 'cancel-listen';
  const cancelled = server.handle({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'wait_for_player_message', arguments: {} } });
  await until(() => bridge.listening, 'second listen');
  await server.handle({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: id } });
  await cancelled;
  await until(() => !bridge.listening, 'cancelled listen');
});
