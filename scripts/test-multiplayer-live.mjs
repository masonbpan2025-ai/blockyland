import mc from 'minecraft-protocol';
import { once } from 'node:events';
import { createMultiplayerServer } from '../server/multiplayer.js';
import { openBridge } from '../tests/helpers/multiplayerBridge.js';
import { HYPIXEL, parseServerAddress } from '../src/multiplayer/serverAddress.js';

const destination = parseServerAddress(process.argv[2] || HYPIXEL.address);
const relay = createMultiplayerServer();
await relay.listen(0);
let bridge;
let loginBridge;
try {
  const origin = `http://127.0.0.1:${relay.server.address().port}`;
  bridge = await openBridge(origin, destination.host, destination.port);
  const result = await mc.ping({ host: destination.host, port: destination.port, version: HYPIXEL.version, stream: bridge.stream, closeTimeout: 10000, noPongTimeout: 3000 });
  delete result.favicon;
  // Verify login negotiation separately from status. Stop at the encryption
  // challenge; joining online mode requires the player's Microsoft identity.
  loginBridge = await openBridge(origin, destination.host, destination.port);
  const client = new mc.Client(false, HYPIXEL.version);
  client.setSocket(loginBridge.stream);
  const challenge = once(client, 'encryption_begin', { signal: AbortSignal.timeout(10000) });
  client.write('set_protocol', { protocolVersion: 769, serverHost: destination.host, serverPort: destination.port, nextState: 2 });
  client.state = mc.states.LOGIN;
  client.write('login_start', { username: 'WebClientTest', playerUUID: '00000000-0000-0000-0000-000000000000' });
  const [encryption] = await challenge;
  if (!encryption.publicKey?.length) throw new Error('Server did not send an encryption key.');
  loginBridge.stream.destroy();
  console.log(JSON.stringify({ server: destination.address, transport: 'WebSocket → local TCP relay → Java server', status: result, loginNegotiation: 'PASS: received online-mode encryption challenge', authenticatedJoin: 'NOT TESTED: complete Microsoft sign-in in the browser' }, null, 2));
} catch (error) {
  console.error(`Live connection failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  bridge?.socket.terminate();
  loginBridge?.socket.terminate();
  await relay.close();
}
