// Horizon pilot: one Claude agent plays real Minecraft (Horizon, Java Edition 26.3 in Rust) on a local horizon-server
// while a spectator "Camera" player films it in seven styles, one clip each, for comparison.
//
//   node replication/horizon/pilot.mjs [--model=claude-haiku-5-5] [--seconds=330]
//
// Expects (set up by hand for the pilot, see replication/STATUS.md "Horizon"):
//   - horizon-server running on 127.0.0.1:25590 (offline names), replication/runs/hz-pilot/server
//   - two clients joined and controllable: Aria (the agent) and Camera (an operator, in spectator mode), each with its
//     control socket at replication/runs/hz-pilot/clients/<Name>/control.json
//   - the Camera window titled "HZ Camera", fully on screen (ffmpeg gdigrab records that window)
//   - the agent's workspace C:/Users/pope1/blockyland-agents/hz-pilot/Aria (CLAUDE.md, mcp.json)
//
// Out: replication/runs/hz-pilot/clips/<style>.mp4, events.jsonl (Aria's chat, items, deaths), director.log, the
// agent's transcript, and a Studio .mcpr recording made by the Camera client.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import readline from 'node:readline';
import { mkdirSync, appendFileSync, createWriteStream } from 'node:fs';
import path from 'node:path';

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const model = arg('model', 'claude-haiku-5-5');
const agentSeconds = Number(arg('seconds', 330));
const repo = path.resolve(import.meta.dirname, '..', '..');
const run = path.join(repo, 'replication', 'runs', 'hz-pilot');
const clips = path.join(run, 'clips'); mkdirSync(clips, { recursive: true });
const exe = 'C:/Users/pope1/AppData/Roaming/horizon-launcher/versions/nightly-2026-11-05-66f3981/horizon-ctl.exe';
const workspace = 'C:/Users/pope1/blockyland-agents/hz-pilot/Aria';
const log = (m) => { const line = `${new Date().toISOString()} ${m}`; console.log(line); appendFileSync(path.join(run, 'director.log'), line + '\n'); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** A persistent horizon-ctl session on one client: commands in, one JSON reply per line out. */
function session(name) {
  const p = spawn(exe, ['--socket', path.join(run, 'clients', name, 'control.json'), '-']);
  const rl = readline.createInterface({ input: p.stdout }), queue = [];
  rl.on('line', l => queue.shift()?.(l));
  const send = (c) => new Promise(r => { queue.push(r); p.stdin.write(c + '\n'); });
  return { send, json: async (c) => { try { return JSON.parse(await send(c)); } catch { return null; } }, end: () => p.stdin.end() };
}
const cam = session('Camera'), aria = session('Aria');

// --- the agent: Claude Code with Horizon's MCP tools, survival tools only ---
const PLAY = ['state', 'events', 'wait_for', 'looking_at', 'entities', 'block', 'blocks', 'find_block', 'inventory', 'screen', 'messages',
  'move', 'goto', 'jump', 'look', 'turn', 'look_at', 'look_at_block', 'look_at_entity', 'break', 'place', 'interact', 'use_item', 'attack',
  'select', 'drop', 'release', 'stop', 'open_inventory', 'click_slot', 'close', 'ui', 'click', 'click_button', 'chat', 'respawn', 'wait'];
// A non-interactive Claude session ends whenever the model ends its turn, so the agent is resumed (same session,
// its context kept) until the time is up, as replication/agent/launch.mjs does for the Blockyland agents.
const sessionId = randomUUID();
function agentLoop() {
  const deadline = Date.now() + agentSeconds * 1000;
  const state = { proc: null, stopped: false, sessions: 0 };
  (async () => {
    while (!state.stopped && Date.now() < deadline - 15000) {
      state.proc = startAgent(state.sessions === 0);
      await new Promise(r => state.proc.on('exit', r));
      state.sessions++;
      log(`agent: session ${state.sessions} ended (${state.proc.exitCode})`);
      await sleep(2000);
    }
    state.done = true;
  })();
  state.stop = () => { state.stopped = true; killTree(state.proc); };
  return state;
}
function startAgent(first) {
  const prompt = first ? 'Begin. Read CLAUDE.md, then play until the session ends.' : 'Continue playing toward the goal. Check your state and inventory first.';
  const args = ['-p', prompt, ...(first ? ['--session-id', sessionId] : ['--resume', sessionId]), '--model', model, '--output-format', 'stream-json', '--verbose',
    '--mcp-config', path.join(workspace, 'mcp.json'), '--strict-mcp-config', '--setting-sources', 'project',
    '--allowedTools', PLAY.map(t => `mcp__horizon__${t}`).join(','),
    '--disallowedTools', 'Bash,PowerShell,Write,Edit,NotebookEdit,WebFetch,WebSearch,Task,Agent'];
  const quoted = args.map(a => `"${String(a).replace(/"/g, '""')}"`);
  const p = spawn('claude', quoted, { cwd: workspace, shell: true, env: { ...process.env, MAX_THINKING_TOKENS: '4000' }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.pipe(createWriteStream(path.join(run, 'agent-transcript.jsonl'), { flags: 'a' }));
  p.stderr.pipe(createWriteStream(path.join(run, 'agent-stderr.log'), { flags: 'a' }));
  log(`agent: ${model}, pid ${p.pid}`);
  return p;
}
const killTree = (p) => p?.pid && spawn('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });

// --- what Aria does, for captions: her events, polled ---
let since = 0, polling = true;
(async () => {
  while (polling) {
    const r = await aria.json(`events --since ${since}`);
    for (const e of r?.events ?? []) appendFileSync(path.join(run, 'events.jsonl'), JSON.stringify({ wall: Date.now(), ...e }) + '\n');
    if (r?.last !== undefined) since = r.last;
    await sleep(2000);
  }
})();

// --- the camera ---
async function ariaPose() {
  const s = await aria.json('state');
  const p = s?.player?.position; if (!p) return null;
  return { x: p[0], y: p[1], z: p[2], yaw: s.player.yaw ?? 0 };
}
/** Record the camera window for `seconds` while `step(t)` moves the camera (t: 0..1); returns frames captured. */
async function shot(name, seconds, step = null) {
  const out = path.join(clips, `${name}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'gdigrab', '-framerate', '30', '-t', String(seconds), '-i', 'title=HZ Camera', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', out]);
  const done = new Promise(r => ff.on('exit', r));
  const t0 = Date.now(); let moves = 0;
  if (step) while (Date.now() - t0 < seconds * 1000) { await step((Date.now() - t0) / (seconds * 1000)); moves++; }
  await done;
  log(`shot ${name}: ${seconds} s${step ? `, ${(moves / seconds).toFixed(1)} camera moves/s` : ''}`);
}
let perspective = 0; // 0 first person, 1 third person behind, 2 third person in front (F5 cycles)
async function setPerspective(n) { while (perspective !== n) { await cam.send('key f5 tap'); perspective = (perspective + 1) % 3; await sleep(150); } }
const at = (p, dy = 1.6) => `${p.x.toFixed(2)} ${(p.y + dy).toFixed(2)} ${p.z.toFixed(2)}`;
async function freeCamera() { await setPerspective(0); await cam.send('command spectate'); await sleep(1200); }
const smooth = { x: null };
function ease(target, k = .12) {
  if (smooth.x === null) Object.assign(smooth, target);
  for (const a of ['x', 'y', 'z']) smooth[a] += (target[a] - smooth[a]) * k;
  return smooth;
}

const STYLES = [
  ['01-first-person', 40, async () => { await cam.send('command spectate Aria'); await setPerspective(0); await sleep(800); }, null],
  ['02-third-person-behind', 40, async () => { await cam.send('command spectate Aria'); await setPerspective(1); await sleep(800); }, null],
  ['03-third-person-front', 35, async () => { await cam.send('command spectate Aria'); await setPerspective(2); await sleep(800); }, null],
  ['04-chase', 45, async () => { await freeCamera(); smooth.x = null; }, async () => {
    const p = await ariaPose(); if (!p) return;
    const r = p.yaw * Math.PI / 180, fx = -Math.sin(r), fz = Math.cos(r); // Minecraft yaw: 0 faces +z
    const c = ease({ x: p.x - fx * 5, y: p.y + 2.6, z: p.z - fz * 5 });
    await cam.send(`tp ${c.x.toFixed(2)} ${c.y.toFixed(2)} ${c.z.toFixed(2)}`); await cam.send(`look-at ${at(p, 1.3)}`);
  }],
  ['05-orbit', 40, async () => { await freeCamera(); smooth.x = null; }, async (t) => {
    const p = await ariaPose(); if (!p) return; const a = t * Math.PI * 1.5;
    const c = ease({ x: p.x + Math.sin(a) * 6, y: p.y + 4, z: p.z + Math.cos(a) * 6 }, .25);
    await cam.send(`tp ${c.x.toFixed(2)} ${c.y.toFixed(2)} ${c.z.toFixed(2)}`); await cam.send(`look-at ${at(p, 1)}`);
  }],
  ['06-drone', 35, async () => { await freeCamera(); smooth.x = null; }, async (t) => {
    const p = await ariaPose(); if (!p) return; const a = t * Math.PI * .6;
    const c = ease({ x: p.x + Math.sin(a) * 6, y: p.y + 16, z: p.z + Math.cos(a) * 6 }, .1);
    await cam.send(`tp ${c.x.toFixed(2)} ${c.y.toFixed(2)} ${c.z.toFixed(2)}`); await cam.send(`look-at ${at(p, 0)}`);
  }],
  ['07-tripod', 40, async () => {
    await freeCamera(); const p = await ariaPose(); if (!p) return;
    tripod = { x: p.x + 7, y: p.y + 3, z: p.z + 5 }; await cam.send(`tp ${tripod.x.toFixed(2)} ${tripod.y.toFixed(2)} ${tripod.z.toFixed(2)}`); await sleep(500);
  }, async () => { const p = await ariaPose(); if (!p) return; await cam.send(`look-at ${at(p, 1.2)}`); await sleep(30); }],
];
let tripod = null;

log('pilot: start');
const studio = await cam.send('studio record start hz-pilot'); log(`studio record: ${studio}`);
const agent = agentLoop();
const stopAt = setTimeout(() => { log('agent: time up'); agent.stop(); }, agentSeconds * 1000);
await sleep(20000); // let the agent read its brief and start moving
for (const [name, seconds, setup, step] of STYLES) {
  if (agent.done) { log('agent: finished; stopping the shots'); break; }
  await setup(); await shot(name, seconds, step);
}
await cam.send('command spectate Aria'); await setPerspective(0);
log(`studio stop: ${await cam.send('studio record stop')}`);
clearTimeout(stopAt); agent.stop();
polling = false; await sleep(2500);
cam.end(); aria.end();
log('pilot: done');
process.exit(0);
