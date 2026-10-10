import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mc from 'minecraft-protocol';
import { createMultiplayerServer } from '../server/multiplayer.js';
import { openBridge } from './helpers/multiplayerBridge.js';

async function relayFixture(t, options = {}) {
  const relay = createMultiplayerServer(options);
  await relay.listen(0);
  t.after(() => relay.close());
  return { relay, origin: `http://127.0.0.1:${relay.server.address().port}` };
}
test('HTTP endpoints expose readiness, account-auth capabilities and validation errors', async t => {
  const { origin } = await relayFixture(t, { clientDir: 'missing-runtime', ping: async () => ({ version: { name: 'Fixture' }, players: { online: 2 } }) });
  assert.equal((await (await fetch(`${origin}/api/multiplayer/health`)).json()).ready, false);
  assert.equal((await fetch(origin)).status, 503);
  const capabilities = await (await fetch(`${origin}/api/vm/net/connect`)).json();
  assert.equal(capabilities.capabilities.authEndpoint, '/api/vm/net/auth');
  assert.equal(capabilities.capabilities.sessionEndpoint, '/api/vm/net/session');
  assert.equal((await fetch(`${origin}/api/multiplayer/status?address=bad/path`)).status, 400);
  assert.equal((await (await fetch(`${origin}/api/multiplayer/status?address=example.com`)).json()).players.online, 2);
  assert.equal((await fetch(`${origin}/config.json`)).status, 200);
  assert.equal((await fetch(`${origin}/api/vm/net/connect`, { headers: { Origin: 'https://untrusted.example' } })).status, 403);
});
test('ping failure returns a useful error without crashing the relay', async t => {
  const { origin } = await relayFixture(t, { ping: async () => { throw Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }); } });
  const response = await fetch(`${origin}/api/multiplayer/status?address=example.com`);
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /ECONNREFUSED/);
});
test('real Java status and compressed login/play packets pass through the WebSocket bridge', { timeout: 15000 }, async t => {
  const minecraft = mc.createServer({ host: '127.0.0.1', port: 0, version: '1.8.9', 'online-mode': false, motd: 'Multiplayer fixture' });
  await once(minecraft, 'listening');
  t.after(() => minecraft.close());
  minecraft.on('playerJoin', client => {
    client.write('login', { entityId: client.id, gameMode: 0, dimension: 0, difficulty: 1, maxPlayers: 10, levelType: 'default', reducedDebugInfo: false });
    client.write('position', { x: 5, y: 64, z: 8, yaw: 0, pitch: 0, flags: 0 });
    client.on('chat', packet => client.write('chat', { message: JSON.stringify({ text: `echo:${packet.message}:${'x'.repeat(1024)}` }), position: 0 }));
  });
  const { origin } = await relayFixture(t);
  const port = minecraft.socketServer.address().port;
  const statusBridge = await openBridge(origin, '127.0.0.1', port);
  t.after(() => statusBridge.socket.terminate());
  const status = await mc.ping({ host: '127.0.0.1', port, version: '1.8.9', stream: statusBridge.stream, closeTimeout: 5000 });
  assert.match(JSON.stringify(status.description), /Multiplayer fixture/);
  // Browser SRV resolution returns absolute DNS names with a trailing dot.
  const playBridge = await openBridge(origin, '127.0.0.1.', port);
  t.after(() => playBridge.socket.terminate());
  const client = mc.createClient({ host: '127.0.0.1', port, version: '1.8.9', username: 'BridgeTest', auth: 'offline',
    connect: client => queueMicrotask(() => { client.setSocket(playBridge.stream); client.emit('connect'); }),
  });
  t.after(() => playBridge.stream.destroy());
  const [position] = await once(client, 'position');
  assert.equal(position.y, 64);
  const chat = once(client, 'chat');
  client.write('chat', { message: 'hello' });
  assert.equal(JSON.parse((await chat)[0].message).text, `echo:hello:${'x'.repeat(1024)}`);
});

test('an occupied relay port rejects cleanly instead of crashing a WebSocket server', async t => {
  const { relay } = await relayFixture(t);
  const second = createMultiplayerServer();
  t.after(() => second.close());
  await assert.rejects(second.listen(relay.server.address().port), { code: 'EADDRINUSE' });
});
