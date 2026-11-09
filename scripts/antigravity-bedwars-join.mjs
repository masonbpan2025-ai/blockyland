import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const code = flag('code', '7774');
let rawDifficulty = flag('difficulty', 'normal').toLowerCase();
const difficulty = rawDifficulty === 'medium' ? 'normal' : rawDifficulty;
const playerName = flag('name', 'Antigravity');
const team = flag('team', 'blue');
const strategy = flag('strategy', 'auto');
const url = flag('url', 'ws://localhost:3000/ws/share');

const here = new URL('./', import.meta.url);
const dir = fileURLToPath(here);
const cmdFile = path.join(dir, 'antigravity-cmd.txt');
const statusFile = path.join(dir, 'antigravity-bedwars-status.json');
mkdirSync(dir, { recursive: true });

const repo = path.resolve(dir, '..');
const serverEntry = path.join(repo, 'packages', 'blockyland-mcp', 'bin', 'blockyland-mcp.mjs');
const log = (...parts) => console.log(new Date().toISOString().slice(11, 19), ...parts);

const child = spawn(process.execPath, [serverEntry], { cwd: repo, stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
child.stderr.on('data', (chunk) => {
  for (const line of String(chunk).split(/\r?\n/).filter(Boolean)) log('[server]', line);
});
child.on('exit', (exitCode, signal) => { log(`[server exited] code=${exitCode} signal=${signal}`); process.exit(exitCode ?? 1); });

const pending = new Map();
let nextId = 1;
const rl = createInterface({ input: child.stdout });
rl.on('line', (line) => {
  const text = line.trim();
  if (!text) return;
  let message;
  try { message = JSON.parse(text); } catch { log('[unparsed]', text.slice(0, 300)); return; }
  if (message.id !== undefined && message.id !== null && pending.has(message.id)) {
    const { resolve, reject, timer } = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(timer);
    if (message.error) reject(new Error(`${message.error.code}: ${message.error.message}`));
    else resolve(message.result);
    return;
  }
  log('[notification]', JSON.stringify(message).slice(0, 400));
});

function request(method, params, timeoutMs = 240000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}
const notify = (method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);

async function callTool(name, toolArgs = {}, timeoutMs = 240000) {
  const result = await request('tools/call', { name, arguments: toolArgs }, timeoutMs);
  const text = result?.content?.find((part) => part.type === 'text')?.text ?? 'null';
  let payload;
  try { payload = JSON.parse(text); } catch { payload = text; }
  return { isError: Boolean(result?.isError), payload };
}

// Handshake
const init = await request('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: playerName, version: '1.0.0' },
});
notify('notifications/initialized', {});
log('connected to MCP server', JSON.stringify(init?.serverInfo ?? {}), 'protocol', init?.protocolVersion);

// Join game
log(`join_game: code=${code} difficulty=${difficulty} name=${playerName} team=${team} strategy=${strategy} url=${url}`);
const outcome = await callTool('join_game', { code, difficulty, name: playerName, team, autopilot: true, strategy, url }, 300000);
log('join_game ->', JSON.stringify(outcome.payload));
if (outcome.isError) {
  log('JOIN ERROR:', JSON.stringify(outcome.payload));
  child.kill();
  process.exit(1);
}

// Explicitly choose team if bedwars
try {
  const teamRes = await callTool('guest_act', { name: playerName, action: 'choose_team', team }, 30000);
  log('choose_team ->', JSON.stringify(teamRes.payload));
} catch (e) {
  log('choose_team warning:', e.message);
}

// Watch status loop & command draining
const summarise = (status) => {
  if (!status || typeof status !== 'object') return status;
  const bw = status.bedwars ?? null;
  const match = status.match ?? status.skywars ?? bw;
  const myPlayer = status.players?.find((p) => p.name === playerName);
  return {
    name: status.name ?? status.player?.name ?? playerName,
    connected: status.connected ?? true,
    position: status.position ?? status.player?.position ?? null,
    health: status.health ?? status.player?.health ?? null,
    gamemode: status.gamemode ?? null,
    inMatch: status.inMatch ?? status.joinedMatch ?? null,
    gameMode: status.gameMode ?? null,
    team: myPlayer?.team ?? bw?.myTeam ?? team,
    bedwars: bw ? {
      phase: bw.phase,
      round: bw.round,
      myTeam: bw.myTeam,
      teams: bw.teams?.map((t) => ({ id: t.id, bed: t.bed, eliminated: t.eliminated })),
      winner: bw.winner,
    } : null,
    match: match ? { phase: match.phase, round: match.round, slot: match.slot, team: match.me?.team ?? match.team, alive: match.alive, players: match.players?.length ?? null, difficulty: match.difficulty } : null,
    autopilot: status.autopilot ?? null,
    difficulty: status.difficulty ?? null,
    strategy: status.strategy ?? null,
  };
};

let beats = 0;
let lastSummary = '';
let lastStatusAt = 0;
while (true) {
  try {
    if (existsSync(cmdFile)) {
      const text = readFileSync(cmdFile, 'utf8');
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length) {
        writeFileSync(cmdFile, '');
        for (const line of lines) {
          try {
            const call = JSON.parse(line);
            const tool = call.tool || (call.action ? 'guest_act' : 'guest_status');
            const callArgs = { name: playerName, ...(call.args || (call.action ? call : {})) };
            const res = await callTool(tool, callArgs, 45000);
            log(`[cmd ${tool}] ->`, JSON.stringify(res.payload));
          } catch (err) {
            log('command error:', err.message);
          }
        }
      }
    }

    if (beats % 2 === 0) {
      const status = await callTool('guest_status', { name: playerName, radius: 24 }, 60000);
      writeFileSync(statusFile, JSON.stringify(status.payload, null, 2));
      const summary = summarise(status.payload);
      const line = JSON.stringify(summary);
      if (line !== lastSummary) {
        lastSummary = line;
        lastStatusAt = Date.now();
        log('status', line);
      } else if (Date.now() - lastStatusAt > 60 * 1000) {
        lastStatusAt = Date.now();
        log('heartbeat', JSON.stringify({ phase: summary.bedwars?.phase || summary.match?.phase, team: summary.team, position: summary.position, health: summary.health }));
      }
    }
    beats++;
  } catch (error) {
    log('loop error', error.message);
  }
  await new Promise((resolve) => setTimeout(resolve, 3000));
}
