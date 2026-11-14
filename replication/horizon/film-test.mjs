// Automatic re-filmable recording test: one Claude agent (Aria, a Horizon client) plays on the Horizon film server
// while the official Minecraft client with ReplayMod (the "Camera" player, started by mc-camera.mjs) follows her as a
// spectator and records everything it receives. At the end the camera is disconnected, and ReplayMod saves the
// recording to .minecraft/replay_recordings.
//
//   node replication/horizon/film-test.mjs [--model=claude-haiku-5-5] [--seconds=120]
//
// Expects: the film server (replication/runs/hz-film/server, 127.0.0.1:25591) with Camera (spectator, operator) and
// Aria joined; Aria controllable at replication/runs/hz-film/clients/Aria/control.json; her workspace
// C:/Users/pope1/blockyland-agents/hz-film/Aria. Horizon's /spectate refuses a spectator here, so the camera follows by
// teleporting above her every few seconds (it only has to stay near her: the recording is re-filmed afterwards).
import { spawn, execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, appendFileSync, createWriteStream } from 'node:fs';
import path from 'node:path';

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const model = arg('model', 'claude-haiku-5-5'), seconds = Number(arg('seconds', 120));
const repo = path.resolve(import.meta.dirname, '..', '..');
const film = path.join(repo, 'replication', 'runs', 'hz-film');
const out = path.join(film, 'test1'); mkdirSync(out, { recursive: true });
const horizon = 'C:/Users/pope1/AppData/Roaming/horizon-launcher/versions/nightly-2026-11-05-66f3981';
const workspace = 'C:/Users/pope1/blockyland-agents/hz-film/Aria';
const log = (m) => { const line = `${new Date().toISOString()} ${m}`; console.log(line); appendFileSync(path.join(out, 'director.log'), line + '\n'); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const console_ = (...cmd) => new Promise(r => execFile(path.join(horizon, 'horizon-server.exe'), ['--dir', path.join(film, 'server'), 'cmd', ...cmd], (e, so) => r(String(so).trim())));

const PLAY = ['state', 'events', 'wait_for', 'looking_at', 'entities', 'block', 'blocks', 'find_block', 'inventory', 'screen', 'messages',
  'move', 'goto', 'jump', 'look', 'turn', 'look_at', 'look_at_block', 'look_at_entity', 'break', 'place', 'interact', 'use_item', 'attack',
  'select', 'drop', 'release', 'stop', 'open_inventory', 'click_slot', 'close', 'ui', 'click', 'click_button', 'chat', 'respawn', 'wait'];
const killTree = (p) => p?.pid && spawn('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
function agent(deadline) {
  const id = randomUUID(), state = { proc: null, stopped: false, sessions: 0 };
  (async () => {
    while (!state.stopped && Date.now() < deadline - 15000) {
      const first = state.sessions === 0;
      const args = ['-p', first ? 'Begin. Read CLAUDE.md, then play until the session ends.' : 'Continue playing toward the goal. Check your state and inventory first.',
        ...(first ? ['--session-id', id] : ['--resume', id]), '--model', model, '--output-format', 'stream-json', '--verbose',
        '--mcp-config', path.join(workspace, 'mcp.json'), '--strict-mcp-config', '--setting-sources', 'project',
        '--allowedTools', PLAY.map(t => `mcp__horizon__${t}`).join(','), '--disallowedTools', 'Bash,PowerShell,Write,Edit,NotebookEdit,WebFetch,WebSearch,Task,Agent'];
      const p = spawn('claude', args.map(a => `"${String(a).replace(/"/g, '""')}"`), { cwd: workspace, shell: true, env: { ...process.env, MAX_THINKING_TOKENS: '4000' }, stdio: ['ignore', 'pipe', 'pipe'] });
      p.stdout.pipe(createWriteStream(path.join(out, 'Aria-transcript.jsonl'), { flags: 'a' }));
      p.stderr.pipe(createWriteStream(path.join(out, 'Aria-stderr.log'), { flags: 'a' }));
      state.proc = p;
      await new Promise(r => p.on('exit', r));
      state.sessions++; log(`Aria: session ${state.sessions} ended (${p.exitCode})`);
      await sleep(2000);
    }
  })();
  state.stop = () => { state.stopped = true; killTree(state.proc); };
  return state;
}

log(`film-test: Aria (${model}) for ${seconds} s, Camera (Minecraft + ReplayMod) following`);
const deadline = Date.now() + seconds * 1000;
const a = agent(deadline);
let follows = 0;
while (Date.now() < deadline) {
  const r = await console_('execute', 'as', 'Camera', 'at', 'Aria', 'run', 'tp', '@s', '~3', '~5', '~3', 'facing', 'entity', 'Aria');
  if (++follows === 1 || follows % 10 === 0) log(`camera: ${r}`);
  await sleep(3000);
}
a.stop();
log(`camera followed ${follows} times; disconnecting it so ReplayMod saves the recording`);
log(`kick: ${await console_('kick', 'Camera', 'Recording finished')}`);
await sleep(8000);
log('film-test: done');
process.exit(0);
