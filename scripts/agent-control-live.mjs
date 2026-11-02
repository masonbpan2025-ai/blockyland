// A live test of Agent Control with a real AI app (Claude Code today): costs a few minutes and real usage, so it is
// run by hand, never by a test suite. The deterministic checks are tests/agentControl*.test.js and
// e2e/agentControl.pw.js.
//
//   npm run test:agent-control:claude
//   node scripts/agent-control-live.mjs --request "build a small cobblestone watchtower next to me"
//   node scripts/agent-control-live.mjs --package blockyland-mcp@latest     the published package, through npx
//   GEMINI_API_KEY=... node scripts/agent-control-live.mjs --ai gemini      Gemini CLI instead of Claude Code
//
// What it does: starts its own dev server (port 3028, its own Vite cache), plays the player in Chrome (a Creative world
// started by clicking, C, Offline Mode off, read the code), runs `claude -p` with only the Blockyland MCP server and a
// prompt a player would type, types the request into the Agent Terminal once Claude has connected, and waits for the
// answer. It prints Claude's tool calls and checks that something was built and an answer was shown. Screenshots,
// the transcript and a result.json go to outputs/agent-control-live/<time>/.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const REQUEST = option('request', 'build a small cobblestone watchtower, about 6 blocks tall, right next to me');
const WEB_PORT = Number(option('web-port', 3028));
const MCP_PORT = Number(option('mcp-port', 47698));
const PACKAGE = option('package', null); // e.g. blockyland-mcp@latest, or a tarball from npm pack
const AI = option('ai', 'claude'); // claude, or gemini (Gemini CLI through npx)
const outDir = resolve('outputs', 'agent-control-live', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(outDir, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const children = [];
const shell = process.platform === 'win32';

function startDevServer() {
  const child = spawn('npx', ['vite', '--port', String(WEB_PORT), '--strictPort', '--host', '127.0.0.1'], {
    shell, env: { ...process.env, VITE_CACHE_DIR: 'node_modules/.vite-agent-control-live' }, stdio: 'ignore',
  });
  children.push(child);
  return child;
}

async function waitForHttp(url, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`${url} did not come up`);
}

/**
 * How the AI app starts the server. By default this checkout's script; with --package <spec>, the npm package through
 * npx, as players run it (a registry spec such as blockyland-mcp@latest, or a tarball from `npm pack`). npx needs the
 * explicit --package form for a tarball; on native Windows it runs through cmd, as Claude Code's docs say.
 */
export function serverCommand(spec = PACKAGE, platform = process.platform) {
  if (!spec) return { command: 'node', args: [resolve('scripts/blockyland-mcp.mjs')] };
  const npx = ['-y', '--package', spec, '--', 'blockyland-mcp'];
  return platform === 'win32' ? { command: 'cmd', args: ['/c', 'npx', ...npx] } : { command: 'npx', args: npx };
}

const PROMPT = code => `Connect to Blockyland with code ${code}. Then wait for my request in the game's Agent Terminal and carry it out, and answer me in the game. Stop after you have answered one request.`;
const toolName = name => String(name || '').replace(/^(mcp__)?blockyland__/, '');

/** Read a child's stdout as JSON lines; log each Blockyland tool call as it happens. */
function collect(child, label, toolsOf) {
  const messages = [];
  createInterface({ input: child.stdout }).on('line', line => {
    let m;
    try { m = JSON.parse(line); } catch { return; }
    messages.push(m);
    for (const [name, input] of toolsOf(m)) log(`${label} →`, toolName(name), JSON.stringify(input ?? {}).slice(0, 140));
  });
  child.stderr.on('data', d => writeFileSync(join(outDir, `${label}.err`), String(d), { flag: 'a' }));
  return messages;
}

/** Claude Code: claude -p with only the Blockyland server. */
function runClaude(code) {
  const config = { mcpServers: { blockyland: { ...serverCommand(), env: { BLOCKYLAND_MCP_PORT: String(MCP_PORT) } } } };
  const configPath = join(outDir, 'mcp.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  // The prompt goes on stdin: on Windows `claude` is a .cmd shim that needs a shell, and a shell would split a prompt
  // passed as an argument at its spaces. No other argument has a space or a quote in it.
  const child = spawn('claude', ['-p', '--mcp-config', configPath, '--strict-mcp-config',
    '--allowedTools', 'mcp__blockyland__*', '--output-format', 'stream-json', '--verbose', '--max-turns', '40'], { shell, cwd: outDir });
  child.stdin.end(PROMPT(code));
  children.push(child);
  const toolsOf = m => (m.type === 'assistant' ? m.message.content.filter(c => c.type === 'tool_use').map(c => [c.name, c.input]) : []);
  const messages = collect(child, 'claude', toolsOf);
  return new Promise(done => child.on('exit', exitCode => {
    const result = messages.find(m => m.type === 'result');
    done({
      exitCode, messages, model: messages.find(m => m.subtype === 'init')?.model,
      tools: messages.flatMap(toolsOf).map(([name]) => toolName(name)),
      turns: result?.num_turns, costUsd: result?.total_cost_usd, seconds: Math.round((result?.duration_ms ?? 0) / 1000),
    });
  }));
}

/**
 * Gemini CLI, through npx (@google/gemini-cli), signed in as the user already is. Its settings live in this run's
 * folder (.gemini/settings.json): only the Blockyland server, trusted so its tools run without a prompt, and the
 * built-in shell and file-writing tools excluded. No YOLO mode, which would approve every tool, shell included.
 */
function runGemini(code) {
  const settings = {
    mcpServers: { blockyland: { ...serverCommand(), env: { BLOCKYLAND_MCP_PORT: String(MCP_PORT) }, trust: true } },
    tools: { exclude: ['run_shell_command', 'write_file', 'replace', 'web_fetch', 'google_web_search'] },
    excludeTools: ['run_shell_command', 'write_file', 'replace', 'web_fetch', 'google_web_search'],
  };
  mkdirSync(join(outDir, '.gemini'), { recursive: true });
  writeFileSync(join(outDir, '.gemini', 'settings.json'), JSON.stringify(settings, null, 2));
  // -p is appended to stdin, so the prompt goes on stdin and -p carries one word (no spaces through the shell).
  // Sign-in: a GEMINI_API_KEY if one is set, else the Google login Gemini CLI already cached (~/.gemini). Set for this
  // run only, so the user's own Gemini settings are left as they are.
  // The run folder is this script's own, so Gemini CLI may trust it (headless runs refuse untrusted folders).
  // Google no longer serves Gemini CLI on the free personal login ("Gemini Code Assist for individuals"): use a
  // GEMINI_API_KEY from Google AI Studio.
  const env = { ...process.env, GEMINI_CLI_TRUST_WORKSPACE: 'true', ...(process.env.GEMINI_API_KEY ? {} : { GOOGLE_GENAI_USE_GCA: 'true' }) };
  const child = spawn('npx', ['-y', '@google/gemini-cli@latest', '-p', 'Begin.', '--allowed-mcp-server-names', 'blockyland',
    '--output-format', 'stream-json'], { shell, cwd: outDir, env });
  child.stdin.end(PROMPT(code));
  children.push(child);
  const toolsOf = m => (m.type === 'tool_use' ? [[m.tool_name ?? m.name, m.parameters ?? m.args ?? m.input]] : []);
  const messages = collect(child, 'gemini', toolsOf);
  const started = Date.now();
  return new Promise(done => child.on('exit', exitCode => {
    const result = messages.find(m => m.type === 'result');
    done({
      exitCode, messages, model: messages.find(m => m.type === 'init')?.model,
      tools: messages.flatMap(toolsOf).map(([name]) => toolName(name)),
      turns: result?.stats?.tool_calls ?? null, costUsd: null,
      seconds: Math.round((result?.stats?.duration_ms ?? Date.now() - started) / 1000),
    });
  }));
}

async function main() {
  // A server already on the port (a previous run still shutting down) would answer instead of ours, then vanish.
  if (await fetch(`http://127.0.0.1:${WEB_PORT}/`).then(() => true, () => false)) {
    throw new Error(`Port ${WEB_PORT} is in use: wait for the previous run to finish, or pass --web-port.`);
  }
  startDevServer();
  const base = `http://127.0.0.1:${WEB_PORT}`;
  await waitForHttp(base);
  log('dev server up on', base);

  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL === 'chromium' ? undefined : 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  let agentRun;
  try {
    await page.goto(`${base}/?agent-control-port=${MCP_PORT}`, { waitUntil: 'commit' });
    // Up to 5 minutes: the first load after a dependency change rebuilds Vite's cache.
    await page.waitForFunction(() => window.game?.ui, null, { timeout: 300000 });
    await page.click('#btn-start-new-world');
    await page.click('#world-mode-creative');
    await page.click('#btn-create-world-confirm');
    await page.waitForFunction(() => window.game.worldReady && window.game.lifecycle?.phase === 'ready', null, { timeout: 180000 });
    await page.keyboard.press('c');
    await page.locator('#gemini-modal').waitFor({ state: 'visible' });
    await page.click('#gemini-offline-btn');
    const code = (await page.locator('#agent-connect-code').textContent()).trim();
    log('world ready; code', code);

    agentRun = AI === 'gemini' ? runGemini(code) : runClaude(code);
    await page.waitForFunction(() => /CONNECTED/.test(document.getElementById('gemini-status-text').textContent), null, { timeout: 300000 });
    log('connected:', await page.locator('#gemini-status-text').textContent());
    await page.fill('#gemini-prompt-input', REQUEST);
    await page.press('#gemini-prompt-input', 'Enter');
    log('player typed:', REQUEST);
    await page.locator('#gemini-log-feed .ai-reply').first().waitFor({ state: 'visible', timeout: 900000 });
    const run = await agentRun;
    writeFileSync(join(outDir, `${AI}.jsonl`), run.messages.map(m => JSON.stringify(m)).join('\n'));

    const outcome = await page.evaluate(() => ({
      buildings: window.game.geminiAgent.builtBuildings.map(b => ({ id: b.id, name: b.name, origin: [b.startX, b.baseY, b.startZ], size: [b.width, b.height, b.depth] })),
      replies: [...document.querySelectorAll('#gemini-log-feed .ai-reply')].map(e => e.textContent.trim()),
    }));
    await page.screenshot({ path: join(outDir, 'terminal.png') });
    await page.click('#gemini-close-btn');
    await page.evaluate(() => {
      const b = window.game.geminiAgent.builtBuildings.at(-1);
      const p = window.game.player;
      if (b) p.yaw = Math.atan2(-(b.startX + b.width / 2 - p.position.x), -(b.startZ + b.depth / 2 - p.position.z));
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(outDir, 'result.png') });
    const summary = {
      request: REQUEST, ai: AI, server: serverCommand(), model: run.model, exitCode: run.exitCode,
      turns: run.turns, costUsd: run.costUsd, seconds: run.seconds, tools: run.tools, ...outcome, pageErrors,
    };
    writeFileSync(join(outDir, 'result.json'), JSON.stringify(summary, null, 2));
    const ok = run.exitCode === 0 && run.tools.includes('connect') && run.tools.includes('wait_for_player_message')
      && outcome.replies.length > 0 && pageErrors.length === 0;
    log(ok ? 'PASS' : 'FAIL', JSON.stringify({ ...summary, replies: outcome.replies.map(r => r.slice(0, 160)) }, null, 1));
    log('artifacts in', outDir);
    process.exitCode = ok ? 0 : 1;
  } catch (err) {
    log('FAIL:', err.message);
    await page.screenshot({ path: join(outDir, 'error.png') }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
    for (const child of children) {
      if (child.exitCode === null) {
        // Waited for, so the dev server is gone before this process exits (and before a next run starts).
        if (shell) spawnSync('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore' });
        else child.kill();
      }
    }
  }
}

main();
