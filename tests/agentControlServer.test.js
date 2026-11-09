// The MCP server (scripts/blockyland-mcp.mjs): the MCP handshake and tool list an AI app sees, pairing with a game
// tab by code, forwarding tool calls, the player-message queue, and the origin check that keeps other websites out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createAgentControlServer, clientLabel, SUPPORTED_MCP_VERSIONS } from '../scripts/blockyland-mcp.mjs';
import { TOOLS, isAllowedOrigin } from '../src/agentControl/protocol.js';

let rpcId = 0;
const rpc = (server, method, params) => server.handle({ jsonrpc: '2.0', id: ++rpcId, method, params });
const call = async (server, name, args = {}) => {
  // Most tests exercise pairing only. Listening behavior is exercised explicitly below.
  if (name === 'connect' && args.code) args = { listen: false, ...args };
  const response = await rpc(server, 'tools/call', { name, arguments: args });
  const [text, ...rest] = response.result.content;
  return { isError: response.result.isError, body: JSON.parse(text.text), images: rest };
};

async function startServer(t, options = {}) {
  const server = createAgentControlServer({ port: 0, ...options });
  const port = await server.listen();
  assert.ok(port, 'the server listens');
  t.after(() => server.close());
  await rpc(server, 'initialize', { protocolVersion: '2025-06-18', clientInfo: { name: options.clientName || 'claude-code', version: '2.1' }, capabilities: {} });
  return { server, port };
}

/** A game tab: connects with an Origin like a browser, says hello with its code, and answers calls with `answer`. */
async function fakeGame(t, port, { code = '123456', origin = 'http://localhost:3000', answer = null, token = null } = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
  t.after(() => ws.terminate());
  const inbox = [];
  const waiters = [];
  ws.on('message', data => {
    const message = JSON.parse(String(data));
    if (message.type === 'call' && answer) {
      Promise.resolve(answer(message)).then(reply => ws.send(JSON.stringify({ type: 'result', id: message.id, ...reply })));
      return;
    }
    inbox.push(message);
    for (const w of waiters.splice(0)) w();
  });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ type: 'hello', role: 'game', code, sessionToken: token, game: { title: 'Test world' } }));
  const next = async type => {
    for (;;) {
      const found = inbox.findIndex(m => m.type === type);
      if (found >= 0) return inbox.splice(found, 1)[0];
      await new Promise(resolve => waiters.push(resolve));
    }
  };
  await next('welcome');
  return { ws, next, send: m => ws.send(JSON.stringify(m)) };
}

test('initialize negotiates the protocol version and gives instructions', async () => {
  const server = createAgentControlServer({ port: 0 });
  const response = await rpc(server, 'initialize', { protocolVersion: '2025-06-18', clientInfo: { name: 'claude-code' } });
  assert.equal(response.result.protocolVersion, '2025-06-18');
  assert.deepEqual(response.result.capabilities, { tools: { listChanged: false }, logging: {} });
  assert.equal(response.result.serverInfo.name, 'blockyland');
  assert.match(response.result.instructions, /connect/);
  const unknownVersion = await rpc(server, 'initialize', { protocolVersion: '1999-01-01' });
  assert.ok(SUPPORTED_MCP_VERSIONS.includes(unknownVersion.result.protocolVersion));
  assert.equal(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null, 'notifications get no reply');
  assert.equal((await rpc(server, 'nope/nothing')).error.code, -32601);
  assert.deepEqual((await rpc(server, 'ping')).result, {});
});

test('tools/list offers every tool with an object schema', async () => {
  const server = createAgentControlServer({ port: 0 });
  const { result } = await rpc(server, 'tools/list');
  assert.deepEqual(result.tools.map(t => t.name), TOOLS.map(t => t.name));
  for (const tool of result.tools) {
    assert.equal(tool.inputSchema.type, 'object', tool.name);
    assert.ok(tool.description.length > 40, `${tool.name} explains itself`);
    assert.equal(typeof tool.annotations.readOnlyHint, 'boolean', tool.name);
  }
  assert.ok(result.tools.find(t => t.name === 'run_plan').annotations.destructiveHint);
});

test('game tools before pairing explain how to connect', async t => {
  const { server } = await startServer(t);
  const { isError, body } = await call(server, 'look_around');
  assert.equal(isError, true);
  assert.equal(body.kind, 'connection');
  assert.match(body.error, /6-digit code/);
});

test('arguments are checked against the tool schema', async t => {
  const { server } = await startServer(t);
  assert.equal((await call(server, 'connect', { code: '12ab' })).body.kind, 'usage');
  assert.equal((await call(server, 'run_command', {})).body.kind, 'usage');
  assert.equal((await call(server, 'say', { text: 'hi', extra: 1 })).body.kind, 'usage');
  assert.equal((await call(server, 'wait_for_player_message', { timeout_seconds: 0 })).body.kind, 'usage');
  assert.equal((await call(server, 'fly_to_moon')).body.kind, 'unknown');
});

test('pairing: a wrong code is refused, the right one pairs and the game is told who connected', async t => {
  const { server, port } = await startServer(t);
  const game = await fakeGame(t, port, { code: '482193' });
  const wrong = await call(server, 'connect', { code: '000000' });
  assert.equal(wrong.body.kind, 'unknown');
  const status = await call(server, 'connect');
  assert.deepEqual([status.body.connected, status.body.gamesWaiting], [false, 1]);
  const right = await call(server, 'connect', { code: '482193' });
  assert.equal(right.isError, false);
  assert.equal(right.body.connected, true);
  const paired = await game.next('paired');
  assert.equal(paired.client, 'Claude Code');
  assert.match(paired.sessionToken, /^[0-9a-f]{32}$/);
});

test('a paired game runs the forwarded tools; images come back as image content', async t => {
  const { server, port } = await startServer(t);
  const seen = [];
  await fakeGame(t, port, {
    answer: message => {
      seen.push([message.tool, message.args]);
      if (message.tool === 'screenshot') return { ok: true, result: { note: 'view' }, images: [{ mimeType: 'image/jpeg', data: 'AAAA' }] };
      if (message.tool === 'run_command') return { ok: false, error: { error: 'Unknown command', kind: 'unknown' } };
      return { ok: true, result: { position: [1, 70, 2] } };
    },
  });
  await call(server, 'connect', { code: '123456' });
  const state = await call(server, 'get_state');
  assert.deepEqual(state.body, { position: [1, 70, 2] });
  const shot = await call(server, 'screenshot');
  assert.deepEqual(shot.images, [{ type: 'image', data: 'AAAA', mimeType: 'image/jpeg' }]);
  const failed = await call(server, 'run_command', { command: '/nope' });
  assert.deepEqual([failed.isError, failed.body.kind], [true, 'unknown']);
  assert.deepEqual(seen.map(s => s[0]), ['get_state', 'screenshot', 'run_command']);
  assert.deepEqual(seen[2][1], { command: '/nope' });
});

test('player messages wait for the AI, and a wait with nothing to read times out politely', async t => {
  const { server, port } = await startServer(t);
  const game = await fakeGame(t, port);
  await call(server, 'connect', { code: '123456' });
  await game.next('paired');

  const empty = await call(server, 'wait_for_player_message', { timeout_seconds: 1 });
  assert.equal(empty.body.waiting, true);

  // Sent before anyone waits: queued.
  game.send({ type: 'player_message', id: 7, text: 'build a lighthouse', images: [{ mimeType: 'image/jpeg', data: 'BBBB' }] });
  const queued = await call(server, 'wait_for_player_message', { timeout_seconds: 5 });
  assert.equal(queued.body.message, 'build a lighthouse');
  assert.deepEqual(queued.images, [{ type: 'image', data: 'BBBB', mimeType: 'image/jpeg' }]);
  assert.equal((await game.next('message_received')).id, 7, 'the game hears that its message was picked up');

  // Sent while the AI waits: delivered at once.
  const waiting = call(server, 'wait_for_player_message', { timeout_seconds: 5 });
  game.send({ type: 'player_message', id: 8, text: 'make it taller', images: [] });
  assert.equal((await waiting).body.message, 'make it taller');
});

test('the game hears when the AI app is back to waiting, its cue for "Done"', async t => {
  const { server, port } = await startServer(t);
  const game = await fakeGame(t, port);
  await call(server, 'connect', { code: '123456' });
  await game.next('paired');
  const first = call(server, 'wait_for_player_message', { timeout_seconds: 5 });
  await game.next('ai_waiting');
  game.send({ type: 'player_message', id: 1, text: 'hello', images: [] });
  assert.equal((await first).body.message, 'hello');

  // A message already queued is taken at once: no "waiting" in between, so no false "Done".
  game.send({ type: 'player_message', id: 2, text: 'queued', images: [] });
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal((await call(server, 'wait_for_player_message', { timeout_seconds: 5 })).body.message, 'queued');
  await game.next('message_received');
  await game.next('message_received');
  const sent = [];
  game.ws.on('message', data => sent.push(JSON.parse(String(data)).type));
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(!sent.includes('ai_waiting'));
});

test('a game that never answers times out, and a closed game fails its pending call', async t => {
  const { server, port } = await startServer(t);
  const game = await fakeGame(t, port, { answer: () => new Promise(() => {}) });
  await call(server, 'connect', { code: '123456' });
  const pending = call(server, 'get_state');
  await new Promise(resolve => setTimeout(resolve, 50));
  game.ws.close();
  const result = await pending;
  assert.deepEqual([result.isError, result.body.kind], [true, 'connection']);
  assert.equal((await call(server, 'get_state')).body.kind, 'connection', 'not paired any more');
});

test('a reloaded tab re-pairs with its session token; a new code drops the pairing', async t => {
  const { server, port } = await startServer(t);
  const first = await fakeGame(t, port);
  await call(server, 'connect', { code: '123456' });
  const { sessionToken } = await first.next('paired');
  first.ws.close();
  await new Promise(resolve => setTimeout(resolve, 50));

  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'http://localhost:3000' });
  t.after(() => ws.terminate());
  await new Promise(resolve => ws.once('open', resolve));
  const reply = new Promise(resolve => ws.once('message', data => resolve(JSON.parse(String(data)))));
  ws.send(JSON.stringify({ type: 'hello', code: '999999', sessionToken }));
  assert.equal((await reply).type, 'paired', 'the token re-pairs without a code');
  assert.equal((await call(server, 'connect')).body.connected, true);

  // The same tab asking for a new code (hello without the token) unpairs.
  const welcome = new Promise(resolve => ws.once('message', data => resolve(JSON.parse(String(data)))));
  ws.send(JSON.stringify({ type: 'hello', code: '555555', sessionToken: null }));
  assert.equal((await welcome).type, 'welcome');
  assert.equal((await call(server, 'connect')).body.connected, false);
});

test('pages from other websites are refused at the handshake', async t => {
  const { port } = await startServer(t);
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'https://evil.example' });
  t.after(() => ws.terminate());
  const outcome = await new Promise(resolve => {
    ws.once('open', () => resolve('open'));
    ws.once('unexpected-response', (req, res) => resolve(res.statusCode));
    ws.once('error', () => resolve('error'));
  });
  assert.equal(outcome, 403);
});

test('origins: localhost and the public site are allowed, everything else is not', () => {
  for (const ok of ['http://localhost:3000', 'http://127.0.0.1:4173', 'https://blockyland.online', 'https://localhost']) {
    assert.ok(isAllowedOrigin(ok), ok);
  }
  for (const bad of ['https://evil.example', 'http://localhost.evil.example', 'file://', 'null', '', undefined, 'chrome-extension://abc']) {
    assert.equal(isAllowedOrigin(bad), false, String(bad));
  }
  assert.ok(isAllowedOrigin('https://my.mirror', ['https://my.mirror']));
});

test('a busy port is reported to the AI app with what to do', async t => {
  const first = createAgentControlServer({ port: 0 });
  const port = await first.listen();
  t.after(() => first.close());
  const second = createAgentControlServer({ port });
  assert.equal(await second.listen(), null);
  const response = await second.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'connect', arguments: { code: '123456' } } });
  const body = JSON.parse(response.result.content[0].text);
  assert.equal(body.kind, 'connection');
  assert.match(body.error, /BLOCKYLAND_MCP_PORT/);
});

test('client names read the way a player knows them', () => {
  assert.equal(clientLabel({ name: 'claude-code' }), 'Claude Code');
  assert.equal(clientLabel({ name: 'gemini-cli-mcp-client' }), 'Gemini CLI');
  assert.equal(clientLabel({ name: 'codex-mcp-client' }), 'Codex');
  assert.equal(clientLabel(null), 'your AI app');
});

for (const clientName of ['claude-code', 'codex-mcp-client', 'gemini-cli-mcp-client', 'DeepSeek']) {
  test(`${clientName}: default connect immediately pairs and picks up a request without another tool call`, { timeout: 8000 }, async t => {
    const notifications = [];
    const { server, port } = await startServer(t, { clientName, notify: n => notifications.push(n) });
    const game = await fakeGame(t, port);
    // Raw RPC deliberately exercises the default, with no test helper's listen:false.
    const connecting = rpc(server, 'tools/call', {
      name: 'connect', arguments: { code: '123456' }, _meta: { progressToken: 'pair' },
    });
    assert.equal((await game.next('paired')).client, clientLabel({ name: clientName }));
    await game.next('ai_waiting');
    const sentAt = Date.now();
    game.send({ type: 'player_message', id: 42, text: 'build the attached house', images: [{ data: 'AAAA', mimeType: 'image/png' }] });
    const { result } = await connecting;
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.connected, true);
    assert.equal(body.message, 'build the attached house');
    assert.equal(body.request_id, 42);
    assert.deepEqual(result.content[1], { type: 'image', data: 'AAAA', mimeType: 'image/png' });
    assert.equal((await game.next('message_received')).id, 42);
    assert.ok(Date.now() - sentAt < 2000, 'event-driven delivery does not wait for a polling interval');
    assert.match(body.next_action, /report_progress/);
    assert.ok(notifications.some(n => n.method === 'notifications/message' && /Picked up/.test(n.params.data)));
    const updates = notifications.filter(n => n.method === 'notifications/progress');
    assert.ok(updates.length >= 2);
    assert.ok(updates.every((n, i) => n.params.progressToken === 'pair' && (i === 0 || n.params.progress > updates[i - 1].params.progress)));
  });
}

test('initial listen timeout explains how to keep serving, and cancellation does not consume the next request', { timeout: 8000 }, async t => {
  const { server, port } = await startServer(t);
  const game = await fakeGame(t, port);
  const connected = await call(server, 'connect', { code: '123456', listen: true, timeout_seconds: 1 });
  assert.equal(connected.body.connected, true);
  assert.equal(connected.body.waiting, true);
  assert.match(connected.body.next_action, /immediately/);
  const id = ++rpcId;
  const listening = server.handle({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'wait_for_player_message', arguments: { timeout_seconds: 50 } } });
  await server.handle({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: id } });
  assert.equal(JSON.parse((await listening).result.content[0].text).kind, 'state');
  game.send({ type: 'player_message', id: 9, text: 'still here' });
  assert.equal((await call(server, 'wait_for_player_message', { timeout_seconds: 1 })).body.message, 'still here');
});

test('a disconnect or tab switch ends the old listener instead of giving it another tab\'s request', { timeout: 8000 }, async t => {
  const { server, port } = await startServer(t);
  const first = await fakeGame(t, port);
  await call(server, 'connect', { code: '123456' });
  const listening = call(server, 'wait_for_player_message');
  const second = await fakeGame(t, port, { code: '654321' });
  await call(server, 'connect', { code: '654321' });
  assert.equal((await listening).body.kind, 'connection');
  second.send({ type: 'player_message', id: 10, text: 'second tab' });
  assert.equal((await call(server, 'wait_for_player_message')).body.message, 'second tab');
  const disconnected = call(server, 'wait_for_player_message');
  second.ws.close();
  assert.equal((await disconnected).body.kind, 'connection');
  first.ws.close();
});

test('work updates reach the game and logs; build progress uses active MCP tokens and stops at completion', { timeout: 8000 }, async t => {
  const notifications = [];
  const { server, port } = await startServer(t, { notify: n => notifications.push(n) });
  const game = await fakeGame(t, port);
  await call(server, 'connect', { code: '123456' });
  await call(server, 'report_progress', { message: 'Planning the roof', progress: 20 });
  assert.deepEqual(await game.next('agent_activity'), { type: 'agent_activity', message: 'Planning the roof', progress: 20 });
  assert.equal((await call(server, 'report_progress', { message: 'bad', progress: 101 })).body.kind, 'usage');
  assert.equal((await rpc(server, 'logging/setLevel', { level: 'invalid' })).error.code, -32602);
  await rpc(server, 'logging/setLevel', { level: 'warning' });
  const logged = notifications.filter(n => n.method === 'notifications/message').length;
  await call(server, 'report_progress', { message: 'Preparing blocks' });
  assert.equal(notifications.filter(n => n.method === 'notifications/message').length, logged, 'logging level is respected');

  const building = rpc(server, 'tools/call', { name: 'run_plan', arguments: { plan: { action: 'build' } }, _meta: { progressToken: 0 } });
  const task = await game.next('call');
  game.send({ type: 'tool_progress', id: task.id, progress: 40, message: 'Placing walls' });
  game.send({ type: 'tool_progress', id: task.id, progress: 100, message: 'Walls finished' });
  game.send({ type: 'tool_progress', id: task.id, progress: 10, message: 'Starting roof' });
  game.send({ type: 'result', id: task.id, ok: true, result: { built: true } });
  assert.equal(JSON.parse((await building).result.content[0].text).built, true);
  const progress = notifications.filter(n => n.method === 'notifications/progress');
  assert.ok(progress.some(n => /Placing walls \(40%\)/.test(n.params.message)));
  assert.ok(progress.every((n, i) => n.params.progressToken === 0 && (i === 0 || n.params.progress > progress[i - 1].params.progress)));
  const count = notifications.length;
  game.send({ type: 'tool_progress', id: task.id, progress: 100, message: 'late' });
  await rpc(server, 'ping');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(notifications.length, count, 'no notifications after the tool response');
  const state = call(server, 'get_state');
  const read = await game.next('call');
  game.send({ type: 'result', id: read.id, ok: true, result: {} });
  await state;
  assert.equal(notifications.filter(n => n.method === 'notifications/progress').length, progress.length, 'clients without tokens still work');
});
