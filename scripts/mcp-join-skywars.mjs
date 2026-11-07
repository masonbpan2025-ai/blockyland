// MCP guest runner for SkyWars at localhost:3000 with difficulty and autopilot
import { WebSocket } from 'ws';
import { createAgentControlServer } from '../packages/blockyland-mcp/server.mjs';

const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback;
}

const code = getArg('code', '5563');
const difficulty = getArg('difficulty', 'easy');
const name = getArg('name', 'Antigravity');
const url = getArg('url', 'ws://localhost:3000/ws/share');

console.log(`[MCP SkyWars] Initializing Blockyland MCP Server...`);
console.log(`[MCP SkyWars] Target: ${url} | Room: ${code} | Difficulty: ${difficulty} | Name: ${name}`);

const server = createAgentControlServer({
  port: 0,
  shareUrl: url,
  WebSocketImpl: WebSocket,
  log: (msg) => console.log(`[MCP Server] ${msg}`),
});

let rpcId = 0;
const rpc = (method, params) => server.handle({ jsonrpc: '2.0', id: ++rpcId, method, params });
const callTool = async (toolName, toolArgs) => {
  const response = await rpc('tools/call', { name: toolName, arguments: toolArgs });
  const [content] = response?.result?.content ?? [];
  return {
    isError: Boolean(response?.result?.isError),
    body: content?.text ? JSON.parse(content.text) : null,
  };
};

await server.listen();
await rpc('initialize', {
  protocolVersion: '2025-06-18',
  clientInfo: { name: 'Antigravity MCP Client', version: '1.0.0' },
  capabilities: {},
});

console.log(`[MCP SkyWars] MCP Server ready. Calling join_game...`);

let joined = false;
let retryCount = 0;

while (!joined) {
  const res = await callTool('join_game', {
    code,
    difficulty,
    name,
    url,
    autopilot: true,
    strategy: 'auto',
  });

  if (!res.isError && res.body) {
    joined = true;
    console.log(`[MCP SkyWars] SUCCESS: Joined game room ${code}!`);
    console.log(`[MCP SkyWars] Status:`, JSON.stringify(res.body, null, 2));
    break;
  }

  const errMessage = res.body?.error || res.body?.message || JSON.stringify(res.body);
  retryCount++;
  if (retryCount % 5 === 1) {
    console.log(`[MCP SkyWars] Waiting for host at room ${code}... (${errMessage}) [Attempt ${retryCount}]`);
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));
}

// Monitor game loop
let lastPhase = null;
let lastAction = null;
let lastHealth = null;

setInterval(async () => {
  try {
    const statusRes = await callTool('guest_status', { name });
    if (statusRes.isError || !statusRes.body) return;

    const s = statusRes.body;
    const sw = s.skywars;
    const phase = sw?.phase || 'lobby';
    const action = s.lastAction || 'idle';
    const health = s.health ?? 20;

    if (phase !== lastPhase || action !== lastAction || Math.abs(health - (lastHealth ?? health)) >= 2) {
      const players = sw?.players ? sw.players.map((p) => `${p.name}#${p.slot ?? '-'}${p.alive ? '' : '(out)'}`).join(', ') : 'waiting';
      console.log(`[SkyWars] Phase: ${phase.toUpperCase()} | Health: ${health}/20 | Action: ${action} | Players: [${players}]`);
      lastPhase = phase;
      lastAction = action;
      lastHealth = health;
    }

    if (sw?.winner) {
      console.log(`[SkyWars] Match Finished! Winner: ${sw.winner}`);
    }
  } catch (err) {
    console.error(`[MCP SkyWars] Error polling guest status:`, err.message);
  }
}, 1000);
