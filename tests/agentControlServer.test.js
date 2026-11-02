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
  const response = await rpc(server, 'tools/call', { name, arguments: args });
  const [text, ...rest] = response.result.content;
  return { isError: response.result.isError, body: JSON.parse(text.text), images: rest };
};

async function startServer(t, options = {}) {
  const server = createAgentControlServer({ port: 0, ...options });
  const port = await server.listen();
  assert.ok(port, 'the server listens');
  t.after(() => server.close());
  await rpc(server, 'initialize', { protocolVersion: '2025-06-18', clientInfo: { name: 'claude-code', version: '2.1' }, capabilities: {} });
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
  assert.deepEqual(response.result.capabilities, { tools: { listChanged: false } });
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
