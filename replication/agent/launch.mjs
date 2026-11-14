#!/usr/bin/env node
// The replication run: the Blockyland server and four Claude Code agents, each playing one player through its bot.
//
//   node replication/agent/launch.mjs --run=run1 [--names=Aria,Basil,Corin,Delphi] [--model=claude-opus-5-5]
//                                     [--hours=30] [--port=7790] [--seed=N] [--workspaces=<other run>]
//
// Least privilege: an agent can run its own bot's client (`bl`), git and ls in its workspace, read and write files in
// its workspace and the team's shared memory, and search the web. It cannot run other commands, read the game's
// source or the server's files, or touch another agent's workspace; its bot's token is its own.
//
// It can be stopped and started again: the server restarts from its latest save, and each agent resumes its own
// Claude Code session (context, workspace and notes where it left them).
//
// Layout:
//   replication/runs/<run>/                  server logs, saves, tokens, the agents' transcripts (in the repo)
//   <home>/blockyland-agents/<run>/<Name>/   an agent's workspace: CLAUDE.md, docs/, memory/, bl
//   <home>/blockyland-agents/<run>/shared/   the team's shared memory
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync, appendFileSync, copyFileSync, createWriteStream, cpSync, unlinkSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const repo = path.resolve(import.meta.dirname, '..', '..');
const run = arg('run', 'run1');
const names = arg('names', 'Aria,Basil,Corin,Delphi').split(',');
const model = arg('model', 'claude-opus-5-5');
const hours = Math.min(Number(arg('hours', 30)), 48);
// How much each agent may think per turn; its thinking is recorded in its transcripts (the film reads it).
const thinking = arg('thinking', '8000');
const port = Number(arg('port', 7790));
const seed = arg('seed', null);
const runDir = path.join(repo, 'replication', 'runs', run);
// --workspaces=<name> reuses another run's agent folders (Claude Code must trust a folder once before it applies the
// folder's permissions; reusing trusted folders avoids that step). The run's own data still goes to runs/<run>.
const agentsRoot = path.join(os.homedir(), 'blockyland-agents', arg('workspaces', run));
const shared = path.join(agentsRoot, 'shared');
const server = `http://127.0.0.1:${port}`;
// The run's clock starts when the server is ready (generating the world takes minutes), not at launch.
let deadline = Date.now() + hours * 3600e3;
mkdirSync(path.join(runDir, 'agents'), { recursive: true });
mkdirSync(shared, { recursive: true });

const log = (msg) => { const line = `${new Date().toISOString()} ${msg}`; console.log(line); appendFileSync(path.join(runDir, 'launcher.log'), line + '\n'); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Each bot's token, so an agent can drive only its own player.
const tokenFile = path.join(runDir, 'tokens.json');
const tokens = existsSync(tokenFile) ? JSON.parse(readFileSync(tokenFile, 'utf8')) : Object.fromEntries(names.map(n => [n, randomBytes(16).toString('hex')]));
writeFileSync(tokenFile, JSON.stringify(tokens, null, 2));

// The team's shared folder starts with a README of its files and an empty danger list (kept if they exist).
const seedShared = (file, text) => { const f = path.join(shared, file); if (!existsSync(f)) writeFileSync(f, text); };
seedShared('README.md', '# The team\'s shared memory\n\nEvery player reads and writes these files.\n\n- `plan.md`: who does what, and the plan. Keep it current.\n- `dangers.md`: where someone died or nearly did, what did it, and how to go there safely.\n- Anything else the team needs: bases, chests, portals, what works and what does not.\n');
seedShared('dangers.md', '# Dangers\n\n<!-- One line per place: coordinates and depth, what killed or hurt whom, when, and how to go there safely. -->\n');

// ---------- workspaces ----------
const slash = (p) => p.replaceAll('\\', '/');
const rule = (p) => slash(p).replace(/^([A-Za-z]):/, (m, d) => `//${d.toLowerCase()}`);
const template = readFileSync(path.join(repo, 'replication', 'agent', 'CLAUDE.template.md'), 'utf8');
// --tactics=flee adds one piece of game strategy to the instructions: run from hostile mobs and call for help. The
// paper gave its agents no strategy, so a run with it is not a faithful replication; it is off by default.
const tactics = arg('tactics', '');
const TACTICS = {
  flee: `
## When a hostile mob attacks you

- **Run away and call for help; do not stand and trade blows.** As soon as a hostile mob hurts you, stop what you are
  doing, sprint away from it (towards your base or a teammate, not into the dark or water), and say in chat what is
  attacking you and where: \`Help! zombie at x y z\`. Fight only when you have to: cornered, or with good health,
  a weapon and armour.
- **Your programs must do this themselves.** You cannot react while a program runs, and most deaths happen then. Keep
  a guard on \`global\` and start it at the top of every program that moves or digs: on the \`health\` event, if your
  health dropped and a hostile entity (\`type === 'hostile'\`) is within about 8 blocks, stop the program's work
  (\`bot.pathfinder.stop()\`, \`bot.clearControlStates()\`), sprint away from the mob for a few seconds, call for help with
  \`bot.chat\`, and end the program, reporting what happened. Test the guard on a short task first.
- **Answer calls for help.** Check chat when each program ends. If a teammate calls for help and you are nearby, armed
  and healthy, go to them; if you cannot, say so in chat, so they know to keep running.
`,
  // The full playbook (replication/agent/docs/strategy.md, copied into each workspace): the route, safety rules,
  // combat (including flee and call for help), mining, teamwork and the End fight, from Minecraft guides and the
  // deaths of earlier dry runs.
  book: `
## The team's playbook

\`docs/strategy.md\` is your team's playbook: the route to the dragon, the safety rules that cost lives in earlier
games, combat (fight or run by your gear, and call for help), mining, teamwork and the End fight. Read it before you start,
and again before each new phase. Follow its **Never** rules; when you break one, write down why in \`memory/notes.md\`.

**First thing in every session, and whenever an output says your client was restarted: \`bl run kit/safety.js\`.**
It installs reflexes that keep you alive while you think and while your programs run: when a mob hurts you they stop
your programs, draw your best weapon, fight or run by your gear, and call HELP; they answer your teammates' HELP calls
(going to fight beside them when you are armed and near); they swim up when out of air, climb out of lava and eat when
hungry. Safe helpers are on \`global.safe\` (\`safe.goto\`, \`safe.dig\`, \`safe.fight\`, \`safe.status\`, \`safe.setHome\`).
A program that ends "stopped by the safety kit" means you were attacked: check \`safe.status()\` and \`bl news\` first.
Use \`safe.goto\`, \`safe.dig\` and \`safe.fight\` instead of the raw pathfinder, \`bot.dig\` and \`bot.attack\`. Read
the top of \`kit/safety.js\` for what it does; improve your copy if you need to, and tell the team.
`,
};
if (tactics && !TACTICS[tactics]) throw new Error(`unknown --tactics=${tactics} (known: ${Object.keys(TACTICS).join(', ')})`);
for (const name of names) {
  const ws = path.join(agentsRoot, name);
  for (const d of ['memory', 'docs', '.claude']) mkdirSync(path.join(ws, d), { recursive: true });
  writeFileSync(path.join(ws, 'CLAUDE.md'), template.replaceAll('{{NAME}}', name).replaceAll('{{TEAM}}', names.join(', ')).replaceAll('{{SHARED}}', slash(shared)).replaceAll('{{LOGS}}', slash(runDir)).replaceAll('{{TACTICS}}', TACTICS[tactics] ?? ''));
  copyFileSync(path.join(repo, 'replication', 'agent', 'docs', 'api.md'), path.join(ws, 'docs', 'api.md'));
  const book = path.join(ws, 'docs', 'strategy.md');
  if (tactics === 'book') copyFileSync(path.join(repo, 'replication', 'agent', 'docs', 'strategy.md'), book);
  else if (existsSync(book)) unlinkSync(book);
  // The safety kit (reflexes + helpers, tested by replication/tests/kit.mjs) comes with the playbook.
  const kit = path.join(ws, 'kit');
  if (tactics === 'book') { mkdirSync(kit, { recursive: true }); copyFileSync(path.join(repo, 'replication', 'agent', 'kit', 'safety.js'), path.join(kit, 'safety.js')); }
  else if (existsSync(kit)) rmSync(kit, { recursive: true, force: true });
  if (!existsSync(path.join(ws, 'memory', 'notes.md'))) writeFileSync(path.join(ws, 'memory', 'notes.md'), `# ${name}'s notes\n`);
  const cli = slash(path.join(repo, 'replication', 'client', 'bl.mjs'));
  writeFileSync(path.join(ws, 'bl'), `#!/bin/sh\nexec node "${cli}" "$@"\n`);
  writeFileSync(path.join(ws, 'bl.cmd'), `@node "${cli}" %*\r\n`);
  const others = names.filter(n => n !== name).map(n => rule(path.join(agentsRoot, n)));
  writeFileSync(path.join(ws, '.claude', 'settings.json'), JSON.stringify({
    permissions: {
      allow: ['Bash(bl:*)', 'Bash(./bl:*)', 'Bash(git:*)', 'Bash(ls:*)', `Read(${rule(ws)}/**)`, `Edit(${rule(ws)}/**)`, `Write(${rule(ws)}/**)`,
        `Read(${rule(shared)}/**)`, `Edit(${rule(shared)}/**)`, `Write(${rule(shared)}/**)`, `Read(${rule(path.join(runDir, 'events.jsonl'))})`, `Read(${rule(path.join(runDir, 'programs'))}/${name}.jsonl)`, 'WebSearch'],
      deny: [`Read(${rule(repo)}/src/**)`, `Read(${rule(repo)}/replication/server/**)`, `Read(${rule(repo)}/replication/client/**)`, `Read(${rule(tokenFile)})`, `Read(${rule(path.join(runDir, 'admin.json'))})`,
        `Edit(${rule(repo)}/**)`, `Write(${rule(repo)}/**)`, ...others.flatMap(o => [`Read(${o}/**)`, `Edit(${o}/**)`, `Write(${o}/**)`])],
    },
  }, null, 2));
}

// ---------- the server, restarted from its latest save if it stops ----------
let serverProc = null, stopping = false, gameOver = false;
function startServer() {
  const restore = existsSync(path.join(runDir, 'saves', 'latest.json.gz'));
  const args = ['--max-old-space-size=8192', 'replication/server/run.mjs', `--run=${runDir}`, `--port=${port}`, `--players=${names.join(',')}`, `--tokens=${tokenFile}`, ...(seed ? [`--seed=${seed}`] : []), ...(restore ? ['--restore=latest'] : [])];
  log(`server: starting${restore ? ' from the latest save' : ''}`);
  serverProc = spawn(process.execPath, args, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = createWriteStream(path.join(runDir, 'server.log'), { flags: 'a' });
  serverProc.stdout.pipe(out); serverProc.stderr.pipe(out);
  serverProc.on('exit', (code) => {
    log(`server: exited (${code})`);
    if (!stopping && !gameOver) { appendFileSync(path.join(runDir, 'restarts.log'), `${new Date().toISOString()} server exited with ${code}; restarting from the latest save\n`); setTimeout(startServer, 5000); }
  });
}
async function serverReady(ms = 300000) {
  for (const t = Date.now(); Date.now() - t < ms; await sleep(2000)) { try { if ((await fetch(`${server}/status`)).ok) return true; } catch {} }
  return false;
}
const dragonDefeated = () => { const f = path.join(runDir, 'events.jsonl'); return existsSync(f) && /"kind":"advancement"[^\n]*Free the End/.test(readFileSync(f, 'utf8')); };

// ---------- the agents ----------
const KICKOFF = 'Begin. Read CLAUDE.md and docs/api.md, then play: work with your team toward the objective until the Ender Dragon is defeated.';
const CONTINUE = 'Continue playing toward the objective. Start by reading memory/notes.md and the shared memory folder for where you left off. Keep playing: nobody reads your reports, so do not stop to summarise.';

/** The usage limit a session ran into, from its transcript's rate_limit_event: {type, resetsAt (unix s)} or null. */
function usageLimit(file) {
  if (!existsSync(file)) return null;
  for (const line of readFileSync(file, 'utf8').split('\n').reverse()) {
    if (!line.includes('rate_limit_event')) continue;
    try { const info = JSON.parse(line).rate_limit_info; if (info?.status === 'rejected' && info.resetsAt) return { type: info.rateLimitType, resetsAt: info.resetsAt }; } catch {}
    return null;
  }
  return null;
}

async function agentLoop(name) {
  const ws = path.join(agentsRoot, name), sessionFile = path.join(ws, '.session');
  const tdir = path.join(runDir, 'agents', name); mkdirSync(tdir, { recursive: true });
  let session = existsSync(sessionFile) ? readFileSync(sessionFile, 'utf8').trim() : null;
  for (let n = 1; !stopping && !gameOver && Date.now() < deadline; n++) {
    const first = !session;
    if (first) { session = randomUUID(); writeFileSync(sessionFile, session); }
    const args = ['-p', first ? KICKOFF : CONTINUE, ...(first ? ['--session-id', session] : ['--resume', session]),
      '--model', model, '--output-format', 'stream-json', '--verbose', '--settings', path.join(ws, '.claude', 'settings.json'),
      // Only this workspace's settings, and none of the operator's MCP servers (mail, documents...).
      '--setting-sources', 'project', '--strict-mcp-config'];
    const env = { ...process.env, MAX_THINKING_TOKENS: thinking, BL_PLAYER: name, BL_TOKEN: tokens[name], BL_SERVER: server, PATH: `${ws}${path.delimiter}${process.env.PATH}` };
    log(`${name}: ${first ? 'starting' : 'resuming'} session ${session}`);
    const t0 = Date.now();
    const transcriptName = `transcript-${Date.now()}.jsonl`;
    const out = createWriteStream(path.join(tdir, transcriptName));
    const code = await new Promise((resolve) => {
      // On Windows `claude` is a .cmd shim, which only a shell can start; quote each argument for cmd.exe so the
      // prompt's spaces do not split it.
      const win = process.platform === 'win32';
      const quoted = win ? args.map(a => `"${String(a).replace(/"/g, '""')}"`) : args;
      const p = spawn('claude', quoted, { cwd: ws, env, stdio: ['ignore', 'pipe', 'pipe'], shell: win });
      p.stdout.pipe(out); p.stderr.on('data', d => appendFileSync(path.join(tdir, 'stderr.log'), d));
      running.set(name, p);
      p.on('exit', (c) => { running.delete(name); resolve(c); }); p.on('error', () => { running.delete(name); resolve(-1); });
    });
    log(`${name}: session ended (code ${code}) after ${((Date.now() - t0) / 60000).toFixed(1)} min`);
    if (gameOver || stopping) break;
    const err = existsSync(path.join(tdir, 'stderr.log')) ? readFileSync(path.join(tdir, 'stderr.log'), 'utf8').slice(-400) : '';
    // A usage limit is reported in the transcript, not on stderr (dry9: every session ended at once for 28 minutes):
    // wait until it resets, or the run's end, instead of retrying every minute.
    const limit = usageLimit(path.join(tdir, transcriptName));
    if (limit) {
      const until = Math.min(deadline, limit.resetsAt * 1000 + 60e3);
      log(`${name}: usage limit (${limit.type}) until ${new Date(limit.resetsAt * 1000).toISOString()}; waiting`);
      while (!stopping && !gameOver && Date.now() < until) await sleep(Math.min(60e3, until - Date.now()));
      continue;
    }
    // A session that ended cleanly (the agent finished a turn and reported) resumes at once; only quick failures back
    // off (dry5: agents ending turns every minute spent half the run in the 60 s pause).
    await sleep(/limit|rate|overloaded|529|429/i.test(err) ? 15 * 60e3 : (code !== 0 && Date.now() - t0 < 60e3 ? 60e3 : 5e3));
  }
}

// ---------- recording what the agents keep: notes, shared memory, their tools ----------
const running = new Map(); // name -> the claude process of its current session
function snapshotMemory(label = new Date().toISOString().replace(/[:.]/g, '-')) {
  const dir = path.join(runDir, 'memory', label);
  try {
    if (existsSync(shared)) cpSync(shared, path.join(dir, 'shared'), { recursive: true });
    for (const name of names) { const notes = path.join(agentsRoot, name, 'memory'); if (existsSync(notes)) cpSync(notes, path.join(dir, name), { recursive: true }); }
  } catch (err) { log(`memory snapshot failed: ${err.message}`); }
}
function saveWorkspaces() {
  for (const name of names) {
    try { cpSync(path.join(agentsRoot, name), path.join(runDir, 'workspaces', name), { recursive: true, filter: (src) => !/[\\/](\.git|\.claude)([\\/]|$)|[\\/]bl(\.cmd)?$|\.session$/.test(src) }); } catch (err) { log(`workspace copy failed for ${name}: ${err.message}`); }
  }
  try { cpSync(shared, path.join(runDir, 'workspaces', 'shared'), { recursive: true }); } catch {}
}
/** End a claude session and everything it started (on Windows the shell, node and its children). */
function killTree(p) {
  if (!p?.pid) return;
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
  else p.kill('SIGTERM');
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
    stopping = true; log(`finishing: ${why}`);
    for (const p of running.values()) killTree(p);
    snapshotMemory('final'); saveWorkspaces();
    await stopServer();
    log('run over');
  })();
  return finishing;
}

process.on('SIGINT', () => { finish('interrupted').then(() => process.exit(0)); });
startServer();
if (!(await serverReady())) { log('server did not come up'); process.exit(1); }
deadline = Date.now() + hours * 3600e3;
log(`run ${run}: ${names.join(', ')} with ${model}${tactics ? `, tactics ${tactics}` : ''}, at most ${hours} h (until ${new Date(deadline).toISOString()}); workspaces in ${agentsRoot}`);
const watcher = setInterval(() => { if (dragonDefeated()) { gameOver = true; log('THE DRAGON IS DEFEATED'); finish('dragon defeated'); } }, 30000);
const snapshots = setInterval(() => snapshotMemory(), 2 * 60e3);
// The run's time limit is hard: sessions in progress are ended, not left to run on.
const timer = setTimeout(() => finish(`time limit (${hours} h)`), Math.max(0, deadline - Date.now()));
await Promise.all(names.map((n, i) => sleep(i * 20000).then(() => agentLoop(n))));
clearInterval(watcher); clearInterval(snapshots); clearTimeout(timer);
await finish(gameOver ? 'dragon defeated' : 'all agents stopped');
process.exit(0);
