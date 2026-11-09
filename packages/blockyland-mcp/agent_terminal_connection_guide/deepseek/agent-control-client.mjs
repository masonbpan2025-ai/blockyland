// Agent Control client. Lives next to the MCP server (packages/blockyland-mcp/agent_terminal_connection_guide/deepseek/) as a
// TEMPLATE: copy it, change what your setup needs, keep the two rules below and it stays honest.
//
//   * wait only while idle -- `ai_waiting` means "done" to the game (src/agentControl/requestTracker.js), so a client
//     that re-enters wait_for_player_message right after picking a request up makes the terminal print "Done in 0 s";
//   * a queued `say` ends the request; that is what produces "Done in Ns" with the true elapsed time;
//   * attachments are written to disk (img-<tool>-<n>.png) instead of being counted and dropped -- "build this (with
//     2 images)" is unanswerable otherwise;
//   * on pickup it calls look_around (a real, cheap tool) so the status line says something true and the AI gets the
//     player's position and the nearby buildings in one go.
//
// Usage: node agent-control-client.mjs [--code 123456] [--port 47615] [--state <dir>]
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
const code = flag('code', '');
const port = flag('port', '47615');

const here = new URL('./', import.meta.url);
const dir = fileURLToPath(here);
// Walk up to the Blockyland checkout: this file may sit under packages/blockyland-mcp/agent_terminal_connection_guide/deepseek/,
// so counting parent directories breaks the moment the folder is moved.
function findRepo(start) {
  let at = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(at, 'packages', 'blockyland-mcp', 'server.mjs'))) return at;
    const up = path.resolve(at, '..');
    if (up === at) break;
    at = up;
  }
  throw new Error(`Could not find the Blockyland checkout above ${start} (looked for packages/blockyland-mcp/server.mjs).`);
}
const repo = findRepo(dir);
const stateArg = args.indexOf('--state');
const stateDir = stateArg >= 0 && args[stateArg + 1] ? path.resolve(args[stateArg + 1]) : path.join(repo, 'node_modules', '.dsh-tmp');
const cmdFile = path.join(stateDir, 'mcp-cmd.txt');
const msgFile = path.join(stateDir, 'messages.log');
mkdirSync(stateDir, { recursive: true });

const serverEntry = path.join(repo, 'packages', 'blockyland-mcp', 'bin', 'blockyland-mcp.mjs');
const log = (...parts) => console.log(new Date().toISOString().slice(11, 19), ...parts);
const stamp = () => new Date().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const child = spawn(process.execPath, [serverEntry], {
  cwd: repo,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, BLOCKYLAND_MCP_PORT: String(port) },
});
// Self-pairing: the server announces `paired with a game tab` when the page dials in. With --code given, answer that
// announcement with `connect` immediately, so nobody has to re-run anything after opening Connect AI.
let pairedOnce = false;
async function pairIfCode() {
  if (!code || pairedOnce) return;
  pairedOnce = true;
  try {
    const out = await callTool('connect', { code }, 120000, 'connect');
    log('auto-connect ->', JSON.stringify(out.payload).slice(0, 300));
    if (out.isError) pairedOnce = false;
  } catch (error) {
    pairedOnce = false;
    log('auto-connect failed:', error.message);
  }
}
child.stderr.on('data', (chunk) => {
  for (const line of String(chunk).split(/\r?\n/).filter(Boolean)) {
    log('[server]', line);
    if (/paired with a game tab/.test(line)) void pairIfCode();
  }
});
child.on('exit', (exitCode, signal) => { log(`[server exited] code=${exitCode} signal=${signal}`); process.exit(exitCode ?? 1); });

const pending = new Map();
let nextId = 1;
createInterface({ input: child.stdout }).on('line', (line) => {
  const text = line.trim();
  if (!text) return;
  let message;
  try { message = JSON.parse(text); } catch { log('[unparsed]', text.slice(0, 200)); return; }
  if (message.id !== undefined && message.id !== null && pending.has(message.id)) {
    const { resolve, reject, timer } = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(timer);
    if (message.error) reject(new Error(`${message.error.code}: ${message.error.message}`));
    else resolve(message.result);
  }
});

function request(method, params, timeoutMs = 620000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}
const notify = (method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);

/** Write the image parts of a tool result to disk and return their paths. */
let imageSeq = 0;
function saveImages(parts, tag) {
  const files = [];
  for (const part of parts ?? []) {
    if (part?.type !== 'image' || !part.data) continue;
    const ext = String(part.mimeType || 'image/png').split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    const file = path.join(stateDir, `img-${tag}-${++imageSeq}.${ext}`);
    try {
      writeFileSync(file, Buffer.from(part.data, 'base64'));
      files.push(file);
    } catch (error) { log('could not save an attachment:', error.message); }
  }
  return files;
}

async function callTool(name, toolArgs = {}, timeoutMs = 620000, tag = 'tool') {
  const result = await request('tools/call', { name, arguments: toolArgs }, timeoutMs);
  const content = result?.content ?? [];
  const text = content.find((part) => part.type === 'text')?.text ?? 'null';
  let payload;
  try { payload = JSON.parse(text); } catch { payload = text; }
  const images = saveImages(content, tag);
  if (images.length) log(`saved ${images.length} attachment(s):`, images.join(', '));
  // The log is truncated; the full answer goes to a file so long outputs (look_around's terrain map, a plan's log)
  // can be read whole instead of half.
  try {
    writeFileSync(path.join(stateDir, `last-${name}.json`),
      typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2));
  } catch { /* a missing file only costs convenience */ }
  return { isError: Boolean(result?.isError), payload, images };
}

await request('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'deepseek', version: '4.0.0' },
});
notify('notifications/initialized', {});
log('MCP server up on port', port);

// --- the request lifecycle ------------------------------------------------------------------------------
let busy = false;
let requests = 0;

function finishRequest(why) {
  if (!busy) return;
  busy = false;
  log(`request ${requests} finished (${why}); waiting for the next one`);
}

// --- a queued call runs the moment it is written ---------------------------------------------------------
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
      try { call = JSON.parse(line); } catch { log('bad queued call:', line.slice(0, 200)); continue; }
      if (call.control === 'done') { finishRequest('control: done'); continue; }
      const started = Date.now();
      try {
        const out = await callTool(call.tool, call.args ?? {}, 620000, call.tool);
        const ms = Date.now() - started;
        const body = typeof out.payload === 'string' ? out.payload : JSON.stringify(out.payload);
        log(`tool ${call.tool} (${ms} ms) ->`, body.slice(0, 1400));
        if (call.tool === 'connect' && !out.isError) log('paired; idle until a request arrives');
        if (call.tool === 'say' && !out.isError) finishRequest('answered');
      } catch (error) {
        log(`tool ${call.tool} failed:`, error.message);
      }
    }
  } finally {
    draining = false;
  }
}

if (existsSync(cmdFile)) {
  try { watch(cmdFile, { persistent: true }, () => { void drain(); }); } catch { /* the timer below covers it */ }
}
setInterval(() => { void drain(); }, 2000);

// --- pair -------------------------------------------------------------------------------------------------
if (code) {
  for (let attempt = 1; attempt <= 24; attempt++) {
    const out = await callTool('connect', { code }, 120000, 'connect');
    log(`connect attempt ${attempt} ->`, JSON.stringify(out.payload).slice(0, 300));
    if (!out.isError) break;
    await sleep(3000);
  }
} else {
  log('no pairing code yet: queue {"tool":"connect","args":{"code":"123456"}} to pair');
}

// --- wait only while idle, and label the pickup -----------------------------------------------------------
let complained = '';
while (true) {
  if (busy) { await sleep(400); continue; }
  try {
    const out = await callTool('wait_for_player_message', { timeout_seconds: 300 }, 320000, 'message');
    const payload = out.payload;
    if (payload?.message) {
      requests += 1;
      busy = true;
      complained = '';
      appendFileSync(msgFile, `${JSON.stringify({ at: stamp(), n: requests, message: payload.message, images: payload.images ?? 0, files: out.images })}\n`);
      log(`PICKED UP #${requests}:`, JSON.stringify(payload.message), `images:${payload.images ?? 0}`, out.images.length ? `-> ${out.images.join(', ')}` : '');
      // report_progress is the tool for exactly this: a public work update that does NOT end the request (say does).
      // It runs in the server, so it works even before the tab answers; then look_around gives the AI the situation.
      void callTool('report_progress', { message: `Reading your request (${out.images.length} attachment(s))` }, 15000, 'progress')
        .then((progress) => log('progress shown:', JSON.stringify(progress.payload).slice(0, 200)))
        .catch((error) => log('report_progress failed:', error.message));
      void callTool('look_around', {}, 30000, 'look')
        .then((look) => {
          const text = typeof look.payload === 'string' ? look.payload : JSON.stringify(look.payload);
          log('world at pickup:', text.slice(0, 500));
        })
        .catch((error) => log('pickup look_around failed:', error.message));
    } else if (out.isError) {
      const complaint = JSON.stringify(payload).slice(0, 200);
      if (complaint !== complained) { complained = complaint; log('not paired yet:', complaint); }
      await sleep(3000);
    }
  } catch (error) {
    if (error.message !== complained) { complained = error.message; log('wait error:', error.message); }
    await sleep(3000);
  }
}

