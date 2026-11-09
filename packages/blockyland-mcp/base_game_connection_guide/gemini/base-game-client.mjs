// Base Game guest client for Gemini.
// Lives in packages/blockyland-mcp/base_game_connection_guide/gemini/
//
// Joins a shared Blockyland world (Share World / M) as an autonomous or guided player peer.
// Spawns blockyland-mcp server and uses join_game, guest_status, and guest_act tools.
//
// Usage: node base-game-client.mjs --code 1234 [--name Gemini] [--autopilot false] [--url ws://localhost:3000/ws/share] [--state <dir>]
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const code = flag('code', args.find((a) => /^[0-9]{4}$/.test(a)) || '');
const name = flag('name', 'Gemini');
const autopilot = flag('autopilot', 'false') === 'true';
const url = flag('url', process.env.BLOCKYLAND_SHARE_URL || 'ws://localhost:3000/ws/share');

const here = new URL('./', import.meta.url);
const dir = fileURLToPath(here);

function findRepo(start) {
  let at = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(at, 'packages', 'blockyland-mcp', 'server.mjs'))) return at;
    const up = path.resolve(at, '..');
    if (up === at) break;
    at = up;
  }
  throw new Error(`Could not find Blockyland checkout above ${start}.`);
}
const repo = findRepo(dir);
const stateArg = args.indexOf('--state');
const stateDir = stateArg >= 0 && args[stateArg + 1] ? path.resolve(args[stateArg + 1]) : path.join(repo, 'node_modules', '.gemini-base-tmp');
const cmdFile = path.join(stateDir, 'base-cmd.txt');
const logFile = path.join(stateDir, 'base.log');
const statusFile = path.join(stateDir, 'status.json');
mkdirSync(stateDir, { recursive: true });

const serverEntry = path.join(repo, 'packages', 'blockyland-mcp', 'bin', 'blockyland-mcp.mjs');
const log = (...parts) => console.log(new Date().toISOString().slice(11, 19), ...parts);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!code || !/^[0-9]{4}$/.test(code)) {
  console.error('Error: Provide a 4-digit room code from the host\'s Share World menu (--code 1234)');
  process.exit(1);
}

const child = spawn(process.execPath, [serverEntry], {
  cwd: repo,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, BLOCKYLAND_SHARE_URL: url },
});
child.stderr.on('data', (chunk) => {
  for (const line of String(chunk).split(/\r?\n/).filter(Boolean)) log('[server]', line);
});
child.on('exit', (exitCode, signal) => {
  log(`[server exited] code=${exitCode} signal=${signal}`);
  process.exit(exitCode ?? 1);
});

const pending = new Map();
let nextId = 1;
createInterface({ input: child.stdout }).on('line', (line) => {
  const text = line.trim();
  if (!text) return;
  let message;
  try { message = JSON.parse(text); } catch { return; }
  if (message.id !== undefined && message.id !== null && pending.has(message.id)) {
    const { resolve, reject, timer } = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(timer);
    if (message.error) reject(new Error(`${message.error.code}: ${message.error.message}`));
    else resolve(message.result);
  }
});

function request(method, params, timeoutMs = 60000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}
const notify = (method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);

async function callTool(toolName, toolArgs = {}, timeoutMs = 60000) {
  const result = await request('tools/call', { name: toolName, arguments: toolArgs }, timeoutMs);
  const content = result?.content ?? [];
  const text = content.find((part) => part.type === 'text')?.text ?? 'null';
  let payload;
  try { payload = JSON.parse(text); } catch { payload = text; }
  return { isError: Boolean(result?.isError), payload };
}

await request('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'gemini', title: 'Gemini Co-Op', version: '2.0.0' },
});
notify('notifications/initialized', {});
log('MCP server initialized. Connecting to room', code, 'as', name, 'at', url);

// Join the game room
const joinRes = await callTool('join_game', { code, name, autopilot, url });
if (joinRes.isError) {
  log('Failed to join room:', JSON.stringify(joinRes.payload));
  process.exit(1);
}
log('Joined successfully:', JSON.stringify(joinRes.payload));

// Initial status
const initialStatus = await callTool('guest_status', { radius: 32 });
if (!initialStatus.isError) {
  writeFileSync(statusFile, JSON.stringify(initialStatus.payload, null, 2));
  log('Spawned at:', initialStatus.payload?.position, 'Health:', initialStatus.payload?.health);
}

// Command queue processing
let draining = false;
async function drain() {
  if (draining) return;
  draining = true;
  try {
    if (!existsSync(cmdFile)) return;
    const text = readFileSync(cmdFile, 'utf8');
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    writeFileSync(cmdFile, '');
    for (const line of lines) {
      let call;
      try { call = JSON.parse(line); } catch { log('bad queued command:', line); continue; }
      const tool = call.tool || (call.action ? 'guest_act' : 'guest_status');
      const callArgs = call.args || (call.action ? call : {});
      try {
        const out = await callTool(tool, callArgs, 45000);
        log(`[${tool}] ->`, typeof out.payload === 'string' ? out.payload : JSON.stringify(out.payload));
        appendFileSync(logFile, `[${new Date().toISOString()}] ${tool}: ${JSON.stringify(out.payload)}\n`);
        if (tool === 'leave_game') {
          log('Leaving game as requested.');
          process.exit(0);
        }
      } catch (err) {
        log(`[${tool}] failed:`, err.message);
      }
    }
  } finally {
    draining = false;
  }
}

if (existsSync(cmdFile)) {
  try { watch(cmdFile, { persistent: true }, () => { void drain(); }); } catch {}
}
setInterval(() => { void drain(); }, 1500);

// Heartbeat status poll
setInterval(async () => {
  try {
    const st = await callTool('guest_status', { radius: 24 }, 10000);
    if (!st.isError && st.payload) {
      writeFileSync(statusFile, JSON.stringify(st.payload, null, 2));
    }
  } catch {}
}, 10000);

log('Base game client running. Queue commands in', cmdFile);

