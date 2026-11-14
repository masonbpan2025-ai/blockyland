#!/usr/bin/env node
// The houseBotDs lab: DeepSeek writes its own house bot (a strategy program with no AI at play time) from the existing
// one (agentArena/bots/), its web research and scripted bots it finds online, then improves it round by round against
// the existing house bot. Each iteration: a SkyWars round and a Bed Wars round, each on a random map and seed, each
// followed by DeepSeek reviewing the round's record and improving the bot.
//
//   node agentArena/dsBotLab.mjs [--iterations 5] [--model deepseek-flash] [--effort high] [--run housebotds-lab]
//
// DeepSeek works in its own folder (~/blockyland-arena/<run>/ws): it may read and write there, search and read the web,
// and run two commands, `node build.mjs` and `node check.mjs`. A version that does not build or pass the sandbox check
// gets one turn to be fixed, else the last good version plays. Everything is logged in agentArena/runs/<run>/.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, appendFileSync, existsSync, cpSync, readdirSync, createWriteStream, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { runBotMatch } from './botMatch.mjs';
import { publicReplay } from './roundReview.mjs';
import { TEMPLATE_IDS } from '../src/mods/skywars/templates.js';
import { packsFor } from '../src/mods/skywars/packs.js';
import { LAYOUT_TEMPLATES, LAYOUT_IDS } from '../src/mods/bedwars/layouts.js';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const ITERATIONS = Number(opt('iterations', 5));
const MODEL = opt('model', 'deepseek-flash'), EFFORT = opt('effort', 'high');
const RUN = opt('run', 'housebotds-lab');
const repo = path.resolve(import.meta.dirname, '..');
const runDir = path.join(repo, 'agentArena', 'runs', RUN);
const ws = path.join(os.homedir(), 'blockyland-arena', RUN, 'ws');
const TURN_MINUTES = 30;
mkdirSync(runDir, { recursive: true });
const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); appendFileSync(path.join(runDir, 'lab.log'), `${l}\n`); };
const slash = (p) => p.replace(/\\/g, '/');
const rule = (p) => slash(p).replace(/^([A-Za-z]):/, (m, d) => `//${d.toLowerCase()}`);

function deepseekKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  if (process.platform !== 'win32') return null;
  try { return spawnSync('powershell', ['-NoProfile', '-Command', "[Environment]::GetEnvironmentVariable('DEEPSEEK_API_KEY','User')"]).stdout.toString().trim() || null; } catch { return null; }
}

// ---------- the workspace ----------
function setUp() {
  for (const d of ['bots', 'docs', 'houseBotDs', 'notes', 'reviews', '.claude']) mkdirSync(path.join(ws, d), { recursive: true });
  // The existing house bot: the opponent, and the starting point.
  for (const f of ['core.js', 'skywars.game.js', 'bedwars.game.js', 'build.mjs', 'README.md', 'skywars.js', 'bedwars.js']) cpSync(path.join(repo, 'agentArena', 'bots', f), path.join(ws, 'bots', f));
  for (const f of ['strategy-api.md', 'skywars-rulebook.md', 'bedwars-rulebook.md', 'agent-rules.md']) cpSync(path.join(repo, 'agentArena', 'docs', f), path.join(ws, 'docs', f));
  if (!existsSync(path.join(ws, 'houseBotDs', 'build.mjs'))) cpSync(path.join(repo, 'agentArena', 'bots', 'build.mjs'), path.join(ws, 'houseBotDs', 'build.mjs'));
  writeFileSync(path.join(ws, 'build.mjs'), `// Builds houseBotDs/skywars.js and houseBotDs/bedwars.js from houseBotDs/core.js and houseBotDs/<game>.game.js.
import { spawnSync } from 'node:child_process';
const r = spawnSync(process.execPath, ['houseBotDs/build.mjs'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
`);
  writeFileSync(path.join(ws, 'check.mjs'), `// Loads houseBotDs/skywars.js and houseBotDs/bedwars.js in the arena's real sandbox and runs each for 3 s on a
// recorded game state: they must load and run without errors (no require/import; at most 50 ms of CPU between awaits).
import { spawnSync } from 'node:child_process';
let ok = true;
for (const g of ['skywars', 'bedwars']) {
  const r = spawnSync(process.execPath, [${JSON.stringify(path.join(repo, 'agentArena', 'cli.mjs'))}, 'check', 'houseBotDs/' + g + '.js'], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const lines = out.split('\\n');
  console.log(lines.filter((l) => !/^log: /.test(l)).join('\\n').trim());
  const logs = lines.filter((l) => /^log: /.test(l));
  if (logs.length) console.log('(' + logs.length + ' log lines; the last: ' + logs.slice(-3).join(' | ') + ')');
  if (r.status !== 0 || !/0 errors/.test(out)) ok = false;
}
console.log(ok ? 'CHECK PASSED' : 'CHECK FAILED');
process.exit(ok ? 0 : 1);
`);
  writeFileSync(path.join(ws, 'CLAUDE.md'), `# houseBotDs

You are building **houseBotDs**: a bot that plays SkyWars and Bed Wars in Blockyland's Agent Arena purely by program --
no AI runs while it plays. It is a strategy file per game, run in the arena's sandbox against the bot API.

In this folder:
- \`bots/\`: the existing house bot, your starting point and your opponent. Read \`bots/README.md\` first: \`core.js\`
  (shared helpers, safe bridging, combat reflexes, a Monte Carlo tree search planner), \`skywars.game.js\` and
  \`bedwars.game.js\` (each game's model, moves and \`main\`); \`build.mjs\` joins core + game into the self-contained
  \`skywars.js\` / \`bedwars.js\` the arena runs. Do not edit \`bots/\`.
- \`docs/\`: the bot API (\`strategy-api.md\`), the two rule books, and the arena rules (reaction time, speeds, what a
  player sees, the 50 ms CPU limit between awaits).
- \`houseBotDs/\`: YOUR bot. Keep the same layout: \`houseBotDs/core.js\`, \`houseBotDs/skywars.game.js\`,
  \`houseBotDs/bedwars.game.js\` (or any structure you like, as long as \`node build.mjs\` writes the two self-contained
  files \`houseBotDs/skywars.js\` and \`houseBotDs/bedwars.js\`; a strategy file has no require/import, and exports
  \`module.exports = { main }\` with \`async function main(bot, mem)\`).
- \`notes/\`: your research (\`notes/research.md\`, with URLs) and your change log (\`notes/changes.md\`).
- \`reviews/\`: after each round, its record (the result, the public replay, both bots' logs, your bot's errors).

The only shell commands you can run are \`node build.mjs\` and \`node check.mjs\` (each on its own). Always build and
check after changing your bot: a version that fails the check does not play. Read and write files with your file tools,
inside this folder. Search and read the web with your web tools.
`);
  writeFileSync(path.join(ws, '.claude', 'settings.json'), JSON.stringify({
    permissions: {
      allow: ['Bash(node build.mjs)', 'Bash(node check.mjs)', 'PowerShell(node build.mjs)', 'PowerShell(node check.mjs)', `Read(${rule(ws)}/**)`, `Edit(${rule(ws)}/**)`, `Write(${rule(ws)}/**)`, 'WebSearch', 'WebFetch'],
      deny: [`Read(${rule(repo)}/**)`, `Edit(${rule(repo)}/**)`, `Edit(${rule(ws)}/.claude/**)`, `Edit(${rule(ws)}/bots/**)`, `Edit(${rule(ws)}/check.mjs)`, `Edit(${rule(ws)}/build.mjs)`],
    },
  }, null, 2));
}

// ---------- DeepSeek ----------
let session = null;
const sessionFile = path.join(runDir, 'session.txt');
if (existsSync(sessionFile)) session = readFileSync(sessionFile, 'utf8').trim();
let turnNo = readdirSync(runDir).filter((f) => /^turn-\d+\.jsonl$/.test(f)).length;

/** One DeepSeek turn in Claude Code, on the lab's session; the prompt on stdin. Resolves with the final answer text. */
function deepseek(prompt) {
  const key = deepseekKey();
  if (!key) throw new Error('DEEPSEEK_API_KEY is not set');
  const resume = !!session;
  if (!session) { session = randomUUID(); writeFileSync(sessionFile, session); }
  const transcript = path.join(runDir, `turn-${String(++turnNo).padStart(2, '0')}.jsonl`);
  const allowed = ['Bash(node build.mjs)', 'Bash(node check.mjs)', 'PowerShell(node build.mjs)', 'PowerShell(node check.mjs)', `Read(${rule(ws)}/**)`, `Edit(${rule(ws)}/**)`, `Write(${rule(ws)}/**)`, `Glob(${rule(ws)}/**)`, `Grep(${rule(ws)}/**)`, 'WebSearch', 'WebFetch'];
  const cliArgs = ['-p', ...(resume ? ['--resume', session] : ['--session-id', session]), '--model', MODEL, '--effort', EFFORT,
    '--output-format', 'stream-json', '--verbose', '--settings', path.join(ws, '.claude', 'settings.json'), '--setting-sources', 'project',
    '--strict-mcp-config', '--permission-mode', 'dontAsk', '--allowedTools', ...allowed];
  const env = { ...process.env, ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic', ANTHROPIC_API_KEY: key, ANTHROPIC_AUTH_TOKEN: key,
    ANTHROPIC_MODEL: MODEL, ANTHROPIC_SMALL_FAST_MODEL: MODEL, ANTHROPIC_DEFAULT_HAIKU_MODEL: MODEL, ANTHROPIC_DEFAULT_SONNET_MODEL: MODEL,
    ANTHROPIC_DEFAULT_OPUS_MODEL: MODEL, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
  const win = process.platform === 'win32';
  const quoted = win ? cliArgs.map((a) => `"${String(a).replace(/"/g, '""')}"`) : cliArgs;
  log(`DeepSeek turn ${turnNo} (${MODEL}, ${EFFORT})`);
  return new Promise((resolve) => {
    const child = spawn('claude', quoted, { cwd: ws, env, stdio: ['pipe', 'pipe', 'pipe'], shell: win });
    child.stdin.on('error', () => {});
    child.stdin.end(prompt);
    const out = createWriteStream(transcript);
    let answer = '', tools = 0, web = 0;
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      out.write(`${line}\n`);
      try {
        const j = JSON.parse(line);
        if (j.type === 'result' && typeof j.result === 'string') answer = j.result;
        for (const b of j.message?.content ?? []) if (b.type === 'tool_use') { tools++; if (/^Web/.test(b.name)) web++; }
      } catch { /* not JSON */ }
    });
    child.stderr.on('data', (d) => appendFileSync(path.join(runDir, 'stderr.log'), d));
    const timer = setTimeout(() => { log(`turn ${turnNo}: ${TURN_MINUTES} minutes; stopping it`); if (win) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F']); else child.kill(); }, TURN_MINUTES * 60e3);
    child.on('exit', (code) => { clearTimeout(timer); out.end(); log(`turn ${turnNo} ended (code ${code}; ${tools} tool calls, ${web} on the web)`); resolve(answer); });
  });
}

// ---------- build, check, keep the good versions ----------
function buildAndCheck() {
  const b = spawnSync(process.execPath, ['build.mjs'], { cwd: ws, encoding: 'utf8' });
  if (b.status !== 0) return { ok: false, text: `node build.mjs failed:\n${b.stdout}${b.stderr}` };
  const c = spawnSync(process.execPath, ['check.mjs'], { cwd: ws, encoding: 'utf8', timeout: 120000 });
  return { ok: c.status === 0, text: `${c.stdout}${c.stderr}` };
}
const goodDir = path.join(runDir, 'versions');
function keep(label) { const d = path.join(goodDir, label); mkdirSync(d, { recursive: true }); cpSync(path.join(ws, 'houseBotDs'), d, { recursive: true }); return d; }
function restore(d) { rmSync(path.join(ws, 'houseBotDs'), { recursive: true, force: true }); cpSync(d, path.join(ws, 'houseBotDs'), { recursive: true }); }
let lastGood = null;

/** After a DeepSeek turn: built and checked, or one turn to fix it, or back to the last good version. */
async function settle(label) {
  let r = buildAndCheck();
  if (!r.ok) {
    log(`${label}: the check failed; one turn to fix it`);
    await deepseek(`Your bot does not pass: \`node build.mjs\` and \`node check.mjs\` say:\n\n${r.text.slice(-4000)}\n\nFix it, then run both again until the check passes.`);
    r = buildAndCheck();
  }
  if (r.ok) { lastGood = keep(label); log(`${label}: built and checked; kept as ${path.relative(repo, lastGood)}`); return true; }
  log(`${label}: still failing; the last good version plays`);
  if (lastGood) restore(lastGood);
  return false;
}

// ---------- a round ----------
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const results = existsSync(path.join(runDir, 'results.json')) ? JSON.parse(readFileSync(path.join(runDir, 'results.json'), 'utf8')) : [];

async function playRound(iter, game) {
  const map = game === 'skywars'
    ? (() => { const t = pick(TEMPLATE_IDS); return { template: t, pack: pick(packsFor(t)).id }; })()
    : { layout: pick(LAYOUT_IDS.filter((id) => LAYOUT_TEMPLATES[id].teams.includes(2))) };
  const label = `iter-${iter}-${game}`;
  const outDir = path.join(runDir, 'rounds', label);
  // Who joins first (island 0 / Red) is drawn too.
  const ds = { name: 'HouseBotDs', strategyFile: path.join(ws, 'houseBotDs', `${game}.js`) };
  const hb = { name: 'HouseBot', strategyFile: path.join(repo, 'agentArena', 'bots', `${game}.js`) };
  const players = Math.random() < 0.5 ? [ds, hb] : [hb, ds];
  log(`${label}: ${game} on ${JSON.stringify(map)}; ${players[0].name} joins first`);
  let result;
  try {
    result = await runBotMatch({ game, players, outDir, video: false, port: 3091, log: (l) => appendFileSync(path.join(runDir, 'matches.log'), `${new Date().toISOString()} ${l}\n`),
      ...(game === 'skywars' ? { skywarsTemplate: map.template, skywarsPack: map.pack } : { bedwarsLayout: map.layout }) });
  } catch (err) {
    log(`${label}: the match failed: ${err.message}`);
    return null;
  }
  const outcome = result.winnerName === 'HouseBotDs' ? 'houseBotDs WON' : result.winnerName === 'HouseBot' ? 'houseBotDs LOST' : `a draw (${result.endReason})`;
  log(`${label}: ${outcome} after ${result.seconds} s`);
  results.push({ iteration: iter, game, map, first: players[0].name, winner: result.winnerName ?? null, endReason: result.endReason, seconds: result.seconds });
  writeFileSync(path.join(runDir, 'results.json'), JSON.stringify(results, null, 2));

  // The record DeepSeek reads.
  const rec = path.join(outDir, 'recording');
  const jl = (f) => (existsSync(path.join(rec, f)) ? readFileSync(path.join(rec, f), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
  const t0 = result.playingT ?? 0;
  const strat = (n) => jl(`strategy-${n}.jsonl`).map((l) => `${Math.round(l.t - t0)}s ${l.line}`);
  const dir = path.join(ws, 'reviews', label);
  mkdirSync(dir, { recursive: true });
  const replay = publicReplay({ matchDir: outDir, round: iter, game, result });
  writeFileSync(path.join(dir, 'replay.txt'), replay.text);
  const mine = strat('HouseBotDs'), theirs = strat('HouseBot');
  writeFileSync(path.join(dir, 'your-log.txt'), mine.join('\n'));
  writeFileSync(path.join(dir, 'opponent-log.txt'), theirs.join('\n'));
  const errors = jl('events.jsonl').filter((e) => /strategy_(error|load_failed)/.test(e.kind) && e.who === 'HouseBotDs').map((e) => `${Math.round(e.t - t0)}s ${e.kind}: ${e.error}`);
  const failed = jl('actions-HouseBotDs.jsonl').filter((a) => a.error);
  const kinds = {};
  for (const a of failed) { const k = String(a.error).replace(/-?[0-9.]+/g, '#').slice(0, 120); kinds[k] = (kinds[k] ?? 0) + 1; }
  writeFileSync(path.join(dir, 'errors.txt'), [`Program errors and restarts (${errors.length}):`, ...errors, '', `Actions that failed (${failed.length}), by kind:`, ...Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n}x ${k}`)].join('\n'));
  const summary = `# ${label}: ${outcome}\n\nGame: ${game}; map: ${JSON.stringify(map)} (a fresh random seed); ${players[0].name} joined first (${game === 'skywars' ? 'island 0' : 'Red'}).\nResult: ${result.winnerName ? `${result.winnerName} won` : 'no winner'} (${result.endReason}) after ${result.seconds} s of play.\n\nFiles: replay.txt (the public replay: both players' positions, gear and health over time, every hit, deaths, chat), your-log.txt (your program's whole log), opponent-log.txt (the existing house bot's log), errors.txt (your program's errors, restarts and failed actions).\n`;
  writeFileSync(path.join(dir, 'summary.md'), summary);
  return { label, outcome, dir: `reviews/${label}` };
}

// ---------- the lab ----------
setUp();
log(`lab ${RUN}: ${ITERATIONS} iterations, DeepSeek ${MODEL} (${EFFORT}); workspace ${ws}`);
if (!existsSync(path.join(ws, 'houseBotDs', 'skywars.game.js'))) {
  await deepseek(`Read CLAUDE.md, then everything in bots/ and docs/.

Then research online, thoroughly: the best SkyWars and Bed Wars strategies (openings, looting, bridging and rushing, bed
defence and breaking, PvP technique such as W-tapping, strafing, knockback toward the void, the endgame against the
clock), and scripted Minecraft bots and their code -- for example https://github.com/3ndetz/autoclef and
https://github.com/CreepyNightmares/BedwarsPracticeBot, and others you find (Mineflayer bots, Baritone, PvP bots).
Read their code and docs on GitHub. Write notes/research.md: what you learned, what you will use, and the URLs.

Then create houseBotDs in houseBotDs/: start from a copy of bots/core.js, bots/skywars.game.js and bots/bedwars.game.js,
and make your own improvements -- to its decisions, its moves, its fighting, its bridging, anything you judge will win
more. Known weak spots of the existing bot: in Bed Wars it rarely finishes the opponent off once beds are broken, and its
bridging is slow; its planner's model is rough. Run \`node build.mjs\` and \`node check.mjs\` until the check passes.
Write notes/changes.md: what you changed and why.

houseBotDs will then play the existing house bot: a SkyWars round and a Bed Wars round on random maps, five times; after
each round you get its record and improve the bot.`);
  if (!(await settle('v0'))) { log('the first version never passed the check: stopping'); process.exit(1); }
} else if (buildAndCheck().ok) lastGood = keep('v0-resume');

/**
 * The inbox: a message for DeepSeek dropped into agentArena/runs/<run>/inbox.md (by the person running the lab) is sent
 * as a turn of its own before the next round, then built and checked like any change; the file is kept as
 * inbox-sent-<n>.md.
 */
async function checkInbox() {
  const inbox = path.join(runDir, 'inbox.md');
  if (!existsSync(inbox)) return;
  const text = readFileSync(inbox, 'utf8');
  const n = readdirSync(runDir).filter((f) => /^inbox-sent-\d+\.md$/.test(f)).length + 1;
  writeFileSync(path.join(runDir, `inbox-sent-${n}.md`), text);
  rmSync(inbox);
  log(`inbox message ${n} for DeepSeek`);
  await deepseek(text);
  await settle(`inbox-${n}`);
}
await checkInbox();

const startIter = Math.max(1, ...results.map((r) => r.iteration + (r.game === 'bedwars' ? 1 : 0)));
for (let iter = startIter; iter <= ITERATIONS; iter++) {
  for (const game of ['skywars', 'bedwars']) {
    if (results.some((r) => r.iteration === iter && r.game === game)) continue;
    await checkInbox();
    const round = await playRound(iter, game);
    if (!round) continue;
    await deepseek(`Round ${iter} of ${ITERATIONS}, ${game}: ${round.outcome}. Its record is in ${round.dir}/ -- start with summary.md, then
replay.txt, your-log.txt, opponent-log.txt and errors.txt.

Study it: what did houseBotDs do well, what did it do badly, and why (find the moments in the logs and the replay).
Then improve houseBotDs -- search the web again for techniques if that helps -- run \`node build.mjs\` and
\`node check.mjs\` until the check passes, and add to notes/changes.md: this round, what you saw, what you changed.`);
    await settle(`iter-${iter}-${game}`);
  }
}

// The final bot, into the repository beside the house bot.
const final = path.join(repo, 'agentArena', 'bots', 'houseBotDs');
mkdirSync(final, { recursive: true });
cpSync(path.join(ws, 'houseBotDs'), final, { recursive: true });
cpSync(path.join(ws, 'notes'), path.join(final, 'notes'), { recursive: true });
const won = results.filter((r) => r.winner === 'HouseBotDs').length, lost = results.filter((r) => r.winner === 'HouseBot').length;
log(`lab done: houseBotDs won ${won}, lost ${lost}, drew ${results.length - won - lost} of ${results.length} rounds; the bot is in ${path.relative(repo, final)}`);
