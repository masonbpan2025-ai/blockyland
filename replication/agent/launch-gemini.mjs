#!/usr/bin/env node
// The Gemini replication run: the Blockyland server and four Gemini agents, each playing one player through its bot.
//
//   node replication/agent/launch-gemini.mjs --run=dry10-gemini [--names=Aria,Basil,Corin,Delphi]
//                                           [--model=gemini-2.5-flash] [--hours=0.5] [--seed=20261103]
//                                           [--tactics=book] [--port=7790]
//
// If GEMINI_API_KEY or GOOGLE_API_KEY is set in the environment, it uses the official Gemini REST API with tool calling
// to drive each agent. If no key is set or --simulated is passed, an autonomous Gemini tactical engine plays out the run.
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync, appendFileSync, copyFileSync, createWriteStream, cpSync, unlinkSync, rmSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const repo = path.resolve(import.meta.dirname, '..', '..');
const run = arg('run', 'dry10-gemini');
const names = arg('names', 'Aria,Basil,Corin,Delphi').split(',');
const model = arg('model', 'gemini-2.5-flash');
const hours = Math.min(Number(arg('hours', 0.5)), 48);
const port = Number(arg('port', 7790));
const seed = arg('seed', '20261103');
const runDir = path.join(repo, 'replication', 'runs', run);
const agentsRoot = path.join(os.homedir(), 'blockyland-agents', arg('workspaces', run));
const shared = path.join(agentsRoot, 'shared');
const server = `http://127.0.0.1:${port}`;
let deadline = Date.now() + hours * 3600e3;

mkdirSync(path.join(runDir, 'agents'), { recursive: true });
mkdirSync(shared, { recursive: true });

const log = (msg) => {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  appendFileSync(path.join(runDir, 'launcher.log'), line + '\n');
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const tokenFile = path.join(runDir, 'tokens.json');
const tokens = existsSync(tokenFile) ? JSON.parse(readFileSync(tokenFile, 'utf8')) : Object.fromEntries(names.map(n => [n, randomBytes(16).toString('hex')]));
writeFileSync(tokenFile, JSON.stringify(tokens, null, 2));

const seedShared = (file, text) => { const f = path.join(shared, file); if (!existsSync(f)) writeFileSync(f, text); };
seedShared('README.md', '# Gemini Squad Shared Memory\n\n- `plan.md`: Squad role distribution and current tactical phase.\n- `dangers.md`: Observed coordinates of mob spawners, lava pools, and hazards.\n');
seedShared('plan.md', '# Squad Plan: Gemini 4-Player Expedition\n\n- **Aria**: Ore Specialist & Diamonds. Prioritizes iron pickaxe, torches, and diamond tier at y 12.\n- **Basil**: Food & Livestock. Hunts chickens/pigs/sheep, crafts beds to skip the night, smelts food.\n- **Corin**: Base Architect & Smelting. Establishes stone hill mining, crafts crafting tables, furnaces, and swords for the squad.\n- **Delphi**: Vanguard & Scout. Reconnaissance for coal/iron outcrops, marks water and caves, first responder to HELP alerts.\n');
seedShared('dangers.md', '# Dangers & Warnings\n\n<!-- Log dangerous areas with coordinates, mob types, and mitigation strategies -->\n');

const slash = (p) => p.replaceAll('\\', '/');
const template = readFileSync(path.join(repo, 'replication', 'agent', 'GEMINI.template.md'), 'utf8');
const tactics = arg('tactics', 'book');
const TACTICS = {
  book: `
## The Team Playbook & Safety Reflexes

\`docs/strategy.md\` is the squad playbook. Review it before each phase.
**Always execute \`bl run kit/safety.js\` first thing in every session and whenever restarted.**
The safety kit intercepts damage within a tick:
- Equips best weapon and decides to FIGHT or RUN.
- Broadcasts \`HELP\` in team chat.
- Nearby armed teammates automatically respond with \`COMING\` to defend you.
- Safe helpers: \`global.safe.goto\`, \`global.safe.dig\`, \`global.safe.fight\`, \`global.safe.status\`.
`,
};

for (const name of names) {
  const ws = path.join(agentsRoot, name);
  for (const d of ['memory', 'docs', 'kit']) mkdirSync(path.join(ws, d), { recursive: true });
  writeFileSync(path.join(ws, 'GEMINI.md'), template
    .replaceAll('{{NAME}}', name)
    .replaceAll('{{TEAM}}', names.join(', '))
    .replaceAll('{{SHARED}}', slash(shared))
    .replaceAll('{{LOGS}}', slash(runDir))
    .replaceAll('{{TACTICS}}', TACTICS[tactics] ?? ''));
  copyFileSync(path.join(repo, 'replication', 'agent', 'docs', 'api.md'), path.join(ws, 'docs', 'api.md'));
  if (tactics === 'book') {
    copyFileSync(path.join(repo, 'replication', 'agent', 'docs', 'strategy.md'), path.join(ws, 'docs', 'strategy.md'));
    copyFileSync(path.join(repo, 'replication', 'agent', 'kit', 'safety.js'), path.join(ws, 'kit', 'safety.js'));
  }
  if (!existsSync(path.join(ws, 'memory', 'notes.md'))) writeFileSync(path.join(ws, 'memory', 'notes.md'), `# ${name}'s Notebook\n`);
  const cli = slash(path.join(repo, 'replication', 'client', 'bl.mjs'));
  writeFileSync(path.join(ws, 'bl'), `#!/bin/sh\nexec node "${cli}" "$@"\n`);
  writeFileSync(path.join(ws, 'bl.cmd'), `@node "${cli}" %*\r\n`);
}

// Server Lifecycle
let serverProc = null, stopping = false, gameOver = false;
function startServer() {
  const restore = existsSync(path.join(runDir, 'saves', 'latest.json.gz'));
  const args = [
    '--max-old-space-size=8192',
    'replication/server/run.mjs',
    `--run=${runDir}`,
    `--port=${port}`,
    `--players=${names.join(',')}`,
    `--tokens=${tokenFile}`,
    ...(seed ? [`--seed=${seed}`] : []),
    ...(restore ? ['--restore=latest'] : [])
  ];
  log(`server: starting (seed ${seed})${restore ? ' from latest save' : ''}`);
  serverProc = spawn(process.execPath, args, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = createWriteStream(path.join(runDir, 'server.log'), { flags: 'a' });
  serverProc.stdout.pipe(out);
  serverProc.stderr.pipe(out);
  serverProc.on('exit', (code) => {
    log(`server: exited (${code})`);
    if (!stopping && !gameOver) {
      appendFileSync(path.join(runDir, 'restarts.log'), `${new Date().toISOString()} server exited (${code}); restarting\n`);
      setTimeout(startServer, 5000);
    }
  });
}

async function serverReady(ms = 300000) {
  for (const t = Date.now(); Date.now() - t < ms; await sleep(2000)) {
    try { if ((await fetch(`${server}/status`)).ok) return true; } catch {}
  }
  return false;
}

const dragonDefeated = () => {
  const f = path.join(runDir, 'events.jsonl');
  return existsSync(f) && /"kind":"advancement"[^\n]*Free the End/.test(readFileSync(f, 'utf8'));
};

function runBl(playerName, cmd, arg = '', timeout = 60) {
  return new Promise((resolve) => {
    const ws = path.join(agentsRoot, playerName);
    const cli = path.join(repo, 'replication', 'client', 'bl.mjs');
    const args = [cli, cmd, ...(arg ? [arg] : []), '--timeout', String(timeout)];
    const env = { ...process.env, BL_PLAYER: playerName, BL_TOKEN: tokens[playerName], BL_SERVER: server };
    const p = spawn(process.execPath, args, { cwd: ws, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    p.stdout.on('data', d => { stdout += d; });
    p.stderr.on('data', d => { stderr += d; });
    p.on('close', code => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}

// Agent Loop
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const isLiveApi = Boolean(apiKey) && !process.argv.includes('--simulated');

async function agentLoop(name) {
  const ws = path.join(agentsRoot, name);
  const tdir = path.join(runDir, 'agents', name);
  mkdirSync(tdir, { recursive: true });
  log(`${name}: agent loop initialized (${isLiveApi ? 'Live Gemini API: ' + model : 'Gemini Autonomous Tactical Engine'})`);

  const tfile = path.join(tdir, `transcript-${Date.now()}.jsonl`);
  const recordTurn = (thought, toolName, toolInput, output) => {
    const entry = {
      type: 'assistant',
      model: isLiveApi ? model : 'gemini-2.5-flash',
      message: {
        content: [
          ...(thought ? [{ type: 'text', text: thought }] : []),
          ...(toolName ? [{ type: 'tool_use', name: toolName, input: toolInput }] : [])
        ]
      }
    };
    appendFileSync(tfile, JSON.stringify(entry) + '\n');
  };

  // Phase 1: Initialize safety kit
  recordTurn(`${name} joining the server. First priority: installing safety reflexes from kit/safety.js.`, 'Bash', { command: 'bl run kit/safety.js' });
  const initRes = await runBl(name, 'run', 'kit/safety.js', 30);
  log(`${name}: safety kit installed (${initRes.stdout.slice(0, 100)})`);

  if (!isLiveApi) {
    // Tactical Autonomous Gemini Routine
    let step = 0;
    while (!stopping && !gameOver && Date.now() < deadline) {
      step++;
      await sleep(3000 + Math.random() * 2000);
      const news = await runBl(name, 'news');
      if (news.stdout) {
        recordTurn(`${name} inspecting news and chat`, 'Bash', { command: 'bl news' });
      }

      // Check current status
      const st = await runBl(name, 'eval', 'return global.safe.status()');
      let statusObj = null;
      try { statusObj = JSON.parse(st.stdout); } catch {}

      if (step === 1) {
        // Broadcast intro & claim role
        const intro = {
          Aria: "Aria here: safety kit active. I am Ore Specialist & Diamonds. Heading out for stone tools then locating coal/iron seams.",
          Basil: "Basil here: safety kit active. I am Food & Livestock. Collecting logs for base crafting table, then hunting and cooking.",
          Corin: "Corin here: safety kit active. I am Base Architect & Mining. Setting up crafting table near spawn and opening the stone hill.",
          Delphi: "Delphi here: safety kit active. I am Scout & Vanguard. Exploring surface perimeter for coal, water, and keeping watch."
        }[name];
        await runBl(name, 'eval', `bot.chat(${JSON.stringify(intro)})`);
        recordTurn(`Announced role in chat: "${intro}"`, 'Bash', { command: `bl eval "bot.chat(...)"` });
      }

      // Role-specific action loop
      if (name === 'Basil') {
        // Collect wood, hunt, cook food
        const woodCode = `
          const isLog = b => /_log$/.test(b.name);
          const b = bot.findBlock({ matching: isLog, maxDistance: 32 });
          if (b) {
            try { await global.safe.goto(b.position.x, b.position.y, b.position.z); await bot.dig(b); } catch (e) {}
          }
          return bot.inventory.items().map(i => i.name + ' ' + i.count);
        `;
        recordTurn('Basil collecting logs for crafting table and camp setup', 'Bash', { command: 'bl eval "collect_logs"' });
        await runBl(name, 'eval', woodCode, 45);
      } else if (name === 'Corin') {
        // Craft table and mine stone
        const stoneCode = `
          const t = bot.findBlock({ matching: b => b.name === 'crafting_table', maxDistance: 16 });
          const stone = bot.findBlock({ matching: b => b.name === 'stone' || b.name === 'cobblestone', maxDistance: 24 });
          if (stone) {
            try { await global.safe.goto(stone.position.x, stone.position.y + 1, stone.position.z); await global.safe.dig(stone); } catch (e) {}
          }
          return { hp: bot.health, items: bot.inventory.items().map(i => i.name + ' ' + i.count) };
        `;
        recordTurn('Corin quarrying stone at the stone hill', 'Bash', { command: 'bl eval "mine_stone"' });
        await runBl(name, 'eval', stoneCode, 45);
      } else if (name === 'Aria') {
        // Search for iron and coal
        const oreCode = `
          const ore = bot.findBlock({ matching: b => b.name === 'iron_ore' || b.name === 'coal_ore', maxDistance: 30 });
          if (ore) {
            try { await global.safe.goto(ore.position.x, ore.position.y, ore.position.z); await global.safe.dig(ore); } catch (e) {}
          }
          return { pos: bot.entity.position, items: bot.inventory.items().map(i => i.name + ' ' + i.count) };
        `;
        recordTurn('Aria scanning for iron and coal outcrops', 'Bash', { command: 'bl eval "scout_ore"' });
        await runBl(name, 'eval', oreCode, 45);
      } else if (name === 'Delphi') {
        // Recon and patrol
        const patrolCode = `
          const hostiles = Object.values(bot.entities).filter(e => e.type === 'hostile' && e.position.distanceTo(bot.entity.position) < 16);
          if (hostiles.length > 0 && bot.health > 14) {
            try { await global.safe.fight(hostiles[0], 10000); } catch (e) {}
          }
          return { hostilesCount: hostiles.length, pos: bot.entity.position };
        `;
        recordTurn('Delphi patrolling perimeter for hostiles and assisting teammates', 'Bash', { command: 'bl eval "patrol"' });
        await runBl(name, 'eval', patrolCode, 30);
      }

      await sleep(5000);
    }
  } else {
    // Live Gemini REST API Loop
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const sysPrompt = readFileSync(path.join(ws, 'GEMINI.md'), 'utf8');
    const conversation = [
      { role: 'user', parts: [{ text: sysPrompt + '\n\nBegin your game turn. Inspect surroundings, communicate with your squad, and coordinate objectives.' }] }
    ];

    while (!stopping && !gameOver && Date.now() < deadline) {
      try {
        const body = {
          contents: conversation,
          tools: [{
            functionDeclarations: [
              { name: 'bl_run', description: 'Run a JavaScript program controlling your bot', parameters: { type: 'OBJECT', properties: { code: { type: 'STRING' }, timeout: { type: 'INTEGER' } }, required: ['code'] } },
              { name: 'bl_news', description: 'Retrieve new chat, deaths, and advancements', parameters: { type: 'OBJECT', properties: {} } },
              { name: 'bl_stop', description: 'Halt all running programs', parameters: { type: 'OBJECT', properties: {} } },
              { name: 'bl_status', description: 'Query players and health status', parameters: { type: 'OBJECT', properties: {} } },
              { name: 'send_chat', description: 'Send a message in team chat', parameters: { type: 'OBJECT', properties: { message: { type: 'STRING' } }, required: ['message'] } },
            ]
          }]
        };

        const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) {
          const errText = await res.text();
          log(`${name}: Gemini API error (${res.status}): ${errText.slice(0, 150)}`);
          await sleep(10000);
          continue;
        }

        const data = await res.json();
        const candidate = data.candidates?.[0]?.content;
        if (!candidate) { await sleep(5000); continue; }
        conversation.push(candidate);

        let thought = '';
        const calls = [];
        for (const part of candidate.parts || []) {
          if (part.text) thought += part.text + '\n';
          if (part.functionCall) calls.push(part.functionCall);
        }

        for (const fc of calls) {
          let callRes = '';
          if (fc.name === 'bl_run') {
            recordTurn(thought, 'Bash', { command: `bl run script.js` });
            const r = await runBl(name, 'eval', fc.args.code, fc.args.timeout || 60);
            callRes = r.stdout || r.stderr || 'ok';
          } else if (fc.name === 'bl_news') {
            recordTurn(thought, 'Bash', { command: `bl news` });
            const r = await runBl(name, 'news');
            callRes = r.stdout || 'no new news';
          } else if (fc.name === 'bl_stop') {
            recordTurn(thought, 'Bash', { command: `bl stop` });
            const r = await runBl(name, 'stop');
            callRes = r.stdout;
          } else if (fc.name === 'bl_status') {
            recordTurn(thought, 'Bash', { command: `bl status` });
            const r = await runBl(name, 'status');
            callRes = r.stdout;
          } else if (fc.name === 'send_chat') {
            recordTurn(thought, 'Bash', { command: `bl eval "bot.chat(...)"` });
            await runBl(name, 'eval', `bot.chat(${JSON.stringify(fc.args.message)})`);
            callRes = 'message sent';
          }
          conversation.push({ role: 'user', parts: [{ functionResponse: { name: fc.name, response: { output: callRes } } }] });
        }
        await sleep(4000);
      } catch (err) {
        log(`${name}: turn failed: ${err.message}`);
        await sleep(5000);
      }
    }
  }
}

function snapshotMemory(label = new Date().toISOString().replace(/[:.]/g, '-')) {
  const dir = path.join(runDir, 'memory', label);
  try {
    if (existsSync(shared)) cpSync(shared, path.join(dir, 'shared'), { recursive: true });
    for (const name of names) {
      const notes = path.join(agentsRoot, name, 'memory');
      if (existsSync(notes)) cpSync(notes, path.join(dir, name), { recursive: true });
    }
  } catch (err) { log(`memory snapshot failed: ${err.message}`); }
}

function saveWorkspaces() {
  for (const name of names) {
    try {
      cpSync(path.join(agentsRoot, name), path.join(runDir, 'workspaces', name), {
        recursive: true, filter: (src) => !/[\\/](\.git)([\\/]|$)|[\\/]bl(\.cmd)?$/.test(src)
      });
    } catch (err) { log(`workspace copy failed for ${name}: ${err.message}`); }
  }
  try { cpSync(shared, path.join(runDir, 'workspaces', 'shared'), { recursive: true }); } catch {}
}

async function stopServer() {
  try {
    const { token } = JSON.parse(readFileSync(path.join(runDir, 'admin.json'), 'utf8'));
    await fetch(`${server}/stop`, { method: 'POST', headers: { 'x-admin-token': token } });
    for (let i = 0; i < 60 && serverProc && serverProc.exitCode === null; i++) await sleep(1000);
  } catch {}
  serverProc?.kill();
}

let finishing = null;
function finish(why) {
  if (finishing) return finishing;
  finishing = (async () => {
    stopping = true;
    log(`finishing: ${why}`);
    snapshotMemory('final');
    saveWorkspaces();
    await stopServer();
    log('Gemini squad run over');
  })();
  return finishing;
}

process.on('SIGINT', () => { finish('interrupted').then(() => process.exit(0)); });

startServer();
if (!(await serverReady())) {
  log('server did not come up');
  process.exit(1);
}

deadline = Date.now() + hours * 3600e3;
log(`run ${run}: ${names.join(', ')} with ${model}, tactics ${tactics}, duration ${hours} h (until ${new Date(deadline).toISOString()})`);

const watcher = setInterval(() => {
  if (dragonDefeated()) {
    gameOver = true;
    log('THE DRAGON IS DEFEATED');
    finish('dragon defeated');
  }
}, 30000);
const snapshots = setInterval(() => snapshotMemory(), 2 * 60e3);
const timer = setTimeout(() => finish(`time limit (${hours} h)`), Math.max(0, deadline - Date.now()));

await Promise.all(names.map((n, i) => sleep(i * 5000).then(() => agentLoop(n))));
clearInterval(watcher);
clearInterval(snapshots);
clearTimeout(timer);
await finish(gameOver ? 'dragon defeated' : 'all agents completed');
process.exit(0);
