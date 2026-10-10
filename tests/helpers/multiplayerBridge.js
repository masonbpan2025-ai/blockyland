import { once } from 'node:events';
import WebSocket, { createWebSocketStream } from 'ws';

export async function openBridge(origin, host, port) {
  const response = await fetch(`${origin}/api/vm/net/connect`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host, port }), signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  const socket = new WebSocket(`${origin.replace(/^http/, 'ws')}/api/vm/net/socket?token=${encodeURIComponent(data.token)}`);
  const stream = createWebSocketStream(socket);
  // minecraft-protocol expects the net.Socket subset used by its client.
  stream.setNoDelay = () => {};
  await once(socket, 'open');
  return { stream, socket };
}
