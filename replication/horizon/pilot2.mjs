// Horizon pilot 2: two Claude agents (Aria, Basil) play real Minecraft (Horizon) on the local horizon-server, and
// each agent's own window is filmed continuously: no extra camera player, so nobody is ever out of shot, in any
// dimension. Partway through, each window is switched to the game's third-person views (F5: behind, then in front)
// and back. Each client also makes a Studio recording (.mcpr) of everything it receives, to test re-filming later.
//
//   node replication/horizon/pilot2.mjs [--model=claude-haiku-5-5] [--seconds=240]
//
// Expects: horizon-server on 127.0.0.1:25590 (spawn-protection 0); clients Aria and Basil joined, controllable at
// replication/runs/hz-pilot/clients/<Name>/control.json, their windows titled "HZ Aria" and "HZ Basil", fully on
// screen; workspaces C:/Users/pope1/blockyland-agents/hz-pilot/<Name> (CLAUDE.md, mcp.json).
// Out: replication/runs/hz-pilot/pilot2/<Name>.mp4, events.jsonl, director.log, <Name>-transcript.jsonl.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import readline from 'node:readline';
import { mkdirSync, appendFileSync, createWriteStream } from 'node:fs';
import path from 'node:path';

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const model = arg('model', 'claude-haiku-5-5');
const seconds = Number(arg('seconds', 240));
const repo = path.resolve(import.meta.dirname, '..', '..');
const run = path.join(repo, 'replication', 'runs', 'hz-pilot');
const out = path.join(run, 'pilot2'); mkdirSync(out, { recursive: true });
const exe = 'C:/Users/pope1/AppData/Roaming/horizon-launcher/versions/nightly-2026-11-05-66f3981/horizon-ctl.exe';
const NAMES = ['Aria', 'Basil'];
const log = (m) => { const line = `${new Date().toISOString()} ${m}`; console.log(line); appendFileSync(path.join(out, 'director.log'), line + '\n'); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function session(name) {
  const p = spawn(exe, ['--socket', path.join(run, 'clients', name, 'control.json'), '-']);
  const rl = readline.createInterface({ input: p.stdout }), queue = [];
  rl.on('line', l => queue.shift()?.(l));
  const send = (c) => new Promise(r => { queue.push(r); p.stdin.write(c + '\n'); });
  return { send, json: async (c) => { try { return JSON.parse(await send(c)); } catch { return null; } }, end: () => p.stdin.end() };
}
const ctl = Object.fromEntries(NAMES.map(n => [n, session(n)]));

// --- the agents: survival tools only; resumed (same session) until the time is up ---
const PLAY = ['state', 'events', 'wait_for', 'looking_at', 'entities', 'block', 'blocks', 'find_block', 'inventory', 'screen', 'messages',
  'move', 'goto', 'jump', 'look', 'turn', 'look_at', 'look_at_block', 'look_at_entity', 'break', 'place', 'interact', 'use_item', 'attack',
  'select', 'drop', 'release', 'stop', 'open_inventory', 'click_slot', 'close', 'ui', 'click', 'click_button', 'chat', 'respawn', 'wait'];
const killTree = (p) => p?.pid && spawn('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
function agent(name, deadline) {
  const workspace = `C:/Users/pope1/blockyland-agents/hz-pilot/${name}`, id = randomUUID();
  const state = { proc: null, stopped: false, sessions: 0 };
  (async () => {
    while (!state.stopped && Date.now() < deadline - 15000) {
      const first = state.sessions === 0;
      const args = ['-p', first ? 'Begin. Read CLAUDE.md, then play until the session ends.' : 'Continue playing toward the goal. Check your state, inventory and the team chat first.',
        ...(first ? ['--session-id', id] : ['--resume', id]), '--model', model, '--output-format', 'stream-json', '--verbose',
        '--mcp-config', path.join(workspace, 'mcp.json'), '--strict-mcp-config', '--setting-sources', 'project',
        '--allowedTools', PLAY.map(t => `mcp__horizon__${t}`).join(','), '--disallowedTools', 'Bash,PowerShell,Write,Edit,NotebookEdit,WebFetch,WebSearch,Task,Agent'];
      const p = spawn('claude', args.map(a => `"${String(a).replace(/"/g, '""')}"`), { cwd: workspace, shell: true, env: { ...process.env, MAX_THINKING_TOKENS: '4000' }, stdio: ['ignore', 'pipe', 'pipe'] });
      p.stdout.pipe(createWriteStream(path.join(out, `${name}-transcript.jsonl`), { flags: 'a' }));
      p.stderr.pipe(createWriteStream(path.join(out, `${name}-stderr.log`), { flags: 'a' }));
      state.proc = p;
      await new Promise(r => p.on('exit', r));
      state.sessions++; log(`${name}: session ${state.sessions} ended (${p.exitCode})`);
      await sleep(2000);
    }
  })();
  state.stop = () => { state.stopped = true; killTree(state.proc); };
  return state;
}

// --- both windows filmed for the whole session ---
function film(name, secs) {
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'gdigrab', '-framerate', '30', '-t', String(secs), '-i', `title=HZ ${name}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', path.join(out, `${name}.mp4`)]);
  ff.stderr.on('data', d => appendFileSync(path.join(out, 'ffmpeg.log'), `[${name}] ${d}`));
  return new Promise(r => ff.on('exit', r));
}

// --- what happened, for captions ---
let polling = true;
const since = Object.fromEntries(NAMES.map(n => [n, 0]));
(async () => {
  while (polling) {
    for (const n of NAMES) {
      const r = await ctl[n].json(`events --since ${since[n]}`);
      for (const e of r?.events ?? []) appendFileSync(path.join(out, 'events.jsonl'), JSON.stringify({ wall: Date.now(), player: n, ...e }) + '\n');
      if (r?.last !== undefined) since[n] = r.last;
    }
    await sleep(2000);
  }
})();

// --- the view schedule: first person, then the game's third-person views, and back (F5 cycles first > behind > front) ---
const t0 = Date.now();
const SCHEDULE = [
  [60, 'Aria', 'third person behind'], [90, 'Aria', 'third person in front'], [110, 'Aria', 'first person'],
  [130, 'Basil', 'third person behind'], [160, 'Basil', 'third person in front'], [180, 'Basil', 'first person'],
];
const views = [];

log(`pilot2: ${NAMES.join(', ')} with ${model}, ${seconds} s`);
for (const n of NAMES) log(`${n} studio: ${await ctl[n].send(`studio record start pilot2-${n}`)}`);
const filming = NAMES.map(n => film(n, seconds));
const deadline = Date.now() + seconds * 1000;
const agents = [];
for (const n of NAMES) { agents.push(agent(n, deadline)); log(`${n}: agent started`); await sleep(8000); }
for (const [at, who, view] of SCHEDULE) {
  const wait = t0 + at * 1000 - Date.now(); if (wait > 0) await sleep(wait);
  if (Date.now() > deadline) break;
  await ctl[who].send('key f5 tap');
  views.push({ t: +((Date.now() - t0) / 1000).toFixed(1), who, view }); log(`${who}: ${view}`);
}
const left = deadline - Date.now(); if (left > 0) await sleep(left);
for (const a of agents) a.stop();
await Promise.all(filming);
for (const n of NAMES) log(`${n} studio stop: ${await ctl[n].send('studio record stop')}`);
appendFileSync(path.join(out, 'views.json'), JSON.stringify(views) + '\n');
polling = false; await sleep(2500);
for (const n of NAMES) ctl[n].end();
log('pilot2: done');
process.exit(0);
