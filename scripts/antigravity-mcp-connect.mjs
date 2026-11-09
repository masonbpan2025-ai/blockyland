import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

const CODE = process.argv[2] || '412190';
const serverPath = resolve('packages/blockyland-mcp/bin/blockyland-mcp.mjs');

console.log(`[MCP Client] Starting Blockyland MCP server: ${serverPath}`);
const child = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: { ...process.env, BLOCKYLAND_MCP_PORT: '47615' }
});

const pending = new Map();
let nextId = 1;

const rl = createInterface({ input: child.stdout });
rl.on('line', (line) => {
  const text = line.trim();
  if (!text) return;
  let msg;
  try { msg = JSON.parse(text); } catch { return; }
  if (msg.id !== undefined && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});

function request(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

function notify(method, params = {}) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

async function callTool(name, toolArgs = {}) {
  const res = await request('tools/call', { name, arguments: toolArgs });
  const text = res?.content?.find((c) => c.type === 'text')?.text;
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { isError: Boolean(res?.isError), data: parsed };
}

async function main() {
  const init = await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'Antigravity', version: '2.0.0' }
  });
  notify('notifications/initialized');
  console.log(`[MCP Client] Initialized with server:`, init.serverInfo);

  console.log(`[MCP Client] Attempting to pair with Blockyland code ${CODE}...`);
  let connected = false;
  for (let attempt = 1; attempt <= 30; attempt++) {
    const res = await callTool('connect', { code: CODE });
    if (!res.isError && res.data?.connected) {
      console.log(`[MCP Client] Successfully paired with Blockyland!`, JSON.stringify(res.data));
      connected = true;
      break;
    }
    if (res.data?.error) {
      console.log(`[MCP Client] Attempt ${attempt}: ${res.data.error}`);
    } else {
      console.log(`[MCP Client] Attempt ${attempt}: waiting for game tab...`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (!connected) {
    console.error(`[MCP Client] Failed to pair with code ${CODE} within 30 seconds.`);
    child.kill();
    process.exit(1);
  }

  // Get current game state
  try {
    const state = await callTool('get_state');
    console.log(`[MCP Client] Current game state:`, JSON.stringify(state.data, null, 2));
  } catch (err) {
    console.warn(`[MCP Client] get_state warning:`, err.message);
  }

  // Send a greeting in the Agent Terminal and chat
  try {
    await callTool('say', { text: `Antigravity connected via MCP with code ${CODE}!` });
    console.log(`[MCP Client] Sent greeting to Agent Terminal.`);
  } catch (err) {
    console.warn(`[MCP Client] say warning:`, err.message);
  }

  console.log(`[MCP Client] Agent Control is now connected and active. Listening for player messages...`);

  // Message loop: wait for player message and log/respond
  while (true) {
    try {
      const msgRes = await callTool('wait_for_player_message', { timeout_seconds: 50 });
      if (msgRes.data?.message) {
        console.log(`[MCP Client] Received player message: "${msgRes.data.message}"`);
        await callTool('say', { text: `Antigravity received: "${msgRes.data.message}"` });
      }
    } catch (err) {
      console.error(`[MCP Client] Message loop error:`, err.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

main().catch((err) => {
  console.error('[MCP Client] Fatal error:', err);
  child.kill();
  process.exit(1);
});
