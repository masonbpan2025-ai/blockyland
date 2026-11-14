// The planner lab: does a model's planning make the house bot better? The planner bot is the house bot with a slow
// thinker (agentArena/plans/: DeepSeek, asked live during the game for JSON plans over general skills); its opponent is
// the same house bot with no thinker -- the scripted playbook alone, which is also what the planner falls back on. Both
// play at the same difficulty with the same skills and limits, so a difference in results is the planning's.
//
// Each round: games on SkyWars maps that do not fit the scripted play's habits (src/mods/skywars/templates.js:
// twin_peaks, tiers, sub_mids, rush) and the classic ring, and a Bed Wars game. Then DeepSeek (as a coding agent, in
// its own workspace) reads every game's record -- the plans it made and why, which rules ran, what happened -- and
// improves the planner's code: what the model is shown, the facts and actions it can use, when it is asked, the
// guide. The scripted play stays as it is (the opponent, and the planner's `default`), so whatever the planner wins
// it wins by planning.
//
//   node agentArena/plannerLab.mjs [--rounds 4] [--games 6] [--model deepseek-flash] [--effort high] [--run planner-lab]
//                                  [--final final-1] [--final-games 10]
// Logs: agentArena/runs/<run>/lab.log, results.json, games/, versions/. Workspace: ~/blockyland-arena/<run>/ws.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, appendFileSync, existsSync, cpSync, readdirSync, createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import { runBotMatch } from './botMatch.mjs';
import { createDeepSeekAsk, deepseekKey } from './plans/deepseekClient.mjs';
import { packsFor } from '../src/mods/skywars/packs.js';
import { LAYOUT_TEMPLATES, LAYOUT_IDS } from '../src/mods/bedwars/layouts.js';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const ROUNDS = Number(opt('rounds', 4));
const GAMES = Number(opt('games', 6));
const MODEL = opt('model', 'deepseek-flash'), EFFORT = opt('effort', 'high');
const RUN = opt('run', 'planner-lab');
const FINAL = opt('final', null), FINAL_GAMES = Number(opt('final-games', 10));
const PORT = Number(opt('port', 3093));
// --thinking off: the planner's model answers without reasoning (fast, about 2 s); on by default.
const THINKING = opt('thinking', 'on') !== 'off';
const repo = path.resolve(import.meta.dirname, '..');
const runDir = path.join(repo, 'agentArena', 'runs', RUN);
const ws = path.join(os.homedir(), 'blockyland-arena', RUN, 'ws');
const TURN_MINUTES = 35;
mkdirSync(runDir, { recursive: true });
const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); appendFileSync(path.join(runDir, 'lab.log'), `${l}\n`); };
const slash = (p) => p.replace(/\\/g, '/');
const rule = (p) => slash(p).replace(/^([A-Za-z]):/, (m, d) => `//${d.toLowerCase()}`);
const url = (rel) => pathToFileURL(path.join(repo, rel)).href;
const PLAN_FILES = ['facts.mjs', 'planRunner.mjs', 'thinker.mjs'];

// ---------- the workspace ----------
/** A planner file with its imports from outside planner/ pointing at the repository. */
const plannerSource = (f) => readFileSync(path.join(repo, 'agentArena', 'plans', f), 'utf8')
  .replaceAll("'../../packages/blockyland-mcp/guestPeer.js'", `'${url('packages/blockyland-mcp/guestPeer.js')}'`);

function setUp() {
  for (const d of ['planner', 'ref', 'ref/playbooks', 'docs', 'notes', 'reviews', '.claude']) mkdirSync(path.join(ws, d), { recursive: true });
  for (const f of PLAN_FILES) if (!existsSync(path.join(ws, 'planner', f))) writeFileSync(path.join(ws, 'planner', f), plannerSource(f));
  cpSync(path.join(repo, 'agentArena', 'skills', 'skills.mjs'), path.join(ws, 'ref', 'skills.mjs'));
  cpSync(path.join(repo, 'agentArena', 'skills', 'view.mjs'), path.join(ws, 'ref', 'view.mjs'));
  for (const f of ['skywars.mjs', 'bedwars.mjs']) cpSync(path.join(repo, 'agentArena', 'scriptedBot', 'playbooks', f), path.join(ws, 'ref', 'playbooks', f));
  cpSync(path.join(repo, 'agentArena', 'scriptedBot', 'skills.mjs'), path.join(ws, 'ref', 'scriptedBot-skills.mjs'));
  cpSync(path.join(repo, 'packages', 'blockyland-mcp', 'generalState.js'), path.join(ws, 'ref', 'generalState.js'));
  cpSync(path.join(repo, 'src', 'mods', 'skywars', 'templates.js'), path.join(ws, 'ref', 'skywars-maps.js'));
  for (const f of ['skywars-rulebook.md', 'bedwars-rulebook.md']) cpSync(path.join(repo, 'agentArena', 'docs', f), path.join(ws, 'docs', f));
  const fake = url('tests/helpers/botFake.js'), playbooks = url('agentArena/scriptedBot/scriptedBot.mjs');
  writeFileSync(path.join(ws, 'check.mjs'), `// Checks planner/: it loads; it exports what the house bot uses; it names no game (the planner must stay general:
// the model learns the game from the rules text and the general state); a plan is checked, run and falls back to the
// scripted play; the thinker asks, takes a plan, and survives a bad answer.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const fail = (m) => { console.log('CHECK FAILED: ' + m); process.exit(1); };
for (const f of ['facts.mjs', 'planRunner.mjs']) {
  const src = readFileSync('planner/' + f, 'utf8');
  if (/skywars|bed ?wars/i.test(src)) fail('planner/' + f + ' names a game: the facts and the runner must work for any game');
}
for (const f of ${JSON.stringify(PLAN_FILES)}) {
  const src = readFileSync('planner/' + f, 'utf8');
  for (const m of src.matchAll(/\\bfrom\\s+['"]([^'"]+)['"]|\\bimport\\s*\\(\\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1] ?? m[2];
    if (!spec.startsWith('./') && spec !== ${JSON.stringify(url('packages/blockyland-mcp/guestPeer.js'))}) fail('planner/' + f + ' imports ' + spec + ': only ./ files and the guest module');
  }
  if (/\\brequire\\s*\\(|child_process|node:fs|fetch\\s*\\(/.test(src)) fail('planner/' + f + ': no require, files, processes or network (the model is passed in)');
}
let runner, thinker, facts, fake, house;
try {
  facts = await import(pathToFileURL('planner/facts.mjs').href + '?v=' + Date.now());
  runner = await import(pathToFileURL('planner/planRunner.mjs').href + '?v=' + Date.now());
  thinker = await import(pathToFileURL('planner/thinker.mjs').href + '?v=' + Date.now());
} catch (e) { fail('the planner does not load: ' + (e.stack || e.message)); }
for (const [m, names] of [[runner, ['validatePlan', 'runPlan']], [thinker, ['SlowThinker']], [facts, ['computeFacts']]]) for (const n of names) if (typeof m[n] !== 'function') fail('it must export ' + n);
fake = await import(${JSON.stringify(fake)});
house = await import(${JSON.stringify(playbooks)});
const { buildView } = await import(${JSON.stringify(url('agentArena/skills/view.mjs'))});
const createSkills = house.createBotSkills;
// A plan the guide's own example could be: checked and run on made-up rounds of both games, and 'default' is the playbook.
const settle = () => new Promise((r) => setTimeout(r, 0));
let ran = 0;
for (const [make, game] of [[fake.skywarsScenario, 'skywars'], [fake.bedwarsScenario, 'bedwars']]) for (let seed = 1; seed <= 40; seed++) {
  const bot = make(seed)(); const view = buildView(bot);
  if (!view || view.phase !== 'playing' || !view.me.canAct) continue;
  const skills = createSkills(bot);
  try {
    const f = facts.computeFacts(view, bot.findAliveEnemies(), bot);
    if (!f || typeof f !== 'object') fail('computeFacts must return the facts');
    const t = new thinker.SlowThinker({ ask: async () => 'not a plan' });
    t.observe(view, bot.findAliveEnemies(), bot); await settle(); await settle();
    if (t.plan) fail('a bad answer must not become a plan');
    const r = await runner.runPlan({ plan: null, view, skills, fallback: house.PLAYBOOKS[game], session: bot });
    if (!r) fail('runPlan must say what it did');
    const p = runner.validatePlan({ rules: [{ when: true, do: 'default' }] });
    if (!p.ok) fail('a plan of one default rule must be valid: ' + JSON.stringify(p.errors));
    await runner.runPlan({ plan: p.plan, view, skills, fallback: house.PLAYBOOKS[game], session: bot });
    ran++;
  } catch (e) { fail('a tick threw (' + game + ', scenario ' + seed + '): ' + (e.stack || e.message)); }
}
if (ran < 20) fail('too few rounds ran');
console.log('CHECK PASSED');
process.exit(0);
`);
  writeFileSync(path.join(ws, 'CLAUDE.md'), `# The planner: make a model's planning win games

A bot plays SkyWars and Bed Wars in Blockyland (a Minecraft-like game in the browser). Fast code plays it: general
**skills** (\`ref/skills.mjs\`: goTo, loot, fight, collect, buy, destroy, hide, flee, guard, ...) on a general **view** of
the round (\`ref/view.mjs\`, built from the general state every game reports: \`ref/generalState.js\`). A scripted
**playbook** per game (\`ref/playbooks/\`) decides what to do each tick.

The **planner** (\`planner/\`, yours) puts a model on top: while the game runs, a model (DeepSeek, \`${MODEL}\`) is asked for
a **plan** -- JSON rules over general facts -- whenever something changes, and fast code runs that plan every tick:
- \`planner/thinker.mjs\`: when the model is asked (triggers), what it is shown (\`describeForModel\`), the guide it reads
  (\`PLAN_GUIDE\`), and how its answer is taken.
- \`planner/facts.mjs\`: the facts a plan's conditions can test, computed from the view for any game.
- \`planner/planRunner.mjs\`: how a plan is checked (\`validatePlan\`) and run (\`runPlan\`): the reflex, the rules, the
  actions and targets, and \`default\` -- the scripted playbook for that tick.

**Your job: make the planner bot beat the scripted bot -- the same bot with no planner -- consistently, by making the
model's planning better**: show it what it needs to decide well, let it say what it decides (facts, actions, targets),
ask it at the right moments, guide it to good strategy for whatever game it is in. The games are SkyWars on maps that
do not suit the scripted play (\`ref/skywars-maps.js\`: twin_peaks has no middle but two peaks, one high and one low;
tiers keeps its best chests on a platform up a staircase; sub_mids has four lower sub-middles; rush has ready bridges
and close fights) and the classic ring, plus Bed Wars.

## Rules (\`node check.mjs\` enforces them)
- The planner stays **general**: \`facts.mjs\` and \`planRunner.mjs\` never name a game. Anything a game needs, the model
  learns from the rules text and the general state, and says in its plan. (The guide may give examples.)
- \`default\` stays the scripted playbook, unchanged; the skills and their limits (speed, reach, the difficulty) are fixed.
  A better bot must come from better plans, not from new hand-written play hidden in the runner.
- The model is passed in (\`ask(system, user)\`): no network, files or processes in the planner.
- Exports stay: \`SlowThinker\` (thinker.mjs), \`validatePlan\` and \`runPlan\` (planRunner.mjs), \`computeFacts\` (facts.mjs).

## Each round's record: \`reviews/round-N/<game>/\`
\`summary.md\` (who won, the map), \`plans.txt\` (every question: why it was asked, how long the model took, the plan it
gave -- its intent and rules -- or why it was rejected, and how often each rule of the plan before it ran),
\`steps.txt\` (what decided each tick: a rule, the reflex, or the default), \`timeline.txt\` (both bots every 0.5 s), \`chat.txt\`.

Write your research (\`notes/research.md\`) and changes (\`notes/changes.md\`). You can run one command, \`node check.mjs\`;
run it after every change -- a version that fails does not play.
`);
  writeFileSync(path.join(ws, '.claude', 'settings.json'), JSON.stringify({
    permissions: {
      allow: ['Bash(node check.mjs)', 'PowerShell(node check.mjs)', `Read(${rule(ws)}/**)`, `Edit(${rule(ws)}/planner/**)`, `Write(${rule(ws)}/planner/**)`, `Edit(${rule(ws)}/notes/**)`, `Write(${rule(ws)}/notes/**)`, 'WebSearch', 'WebFetch'],
      deny: [`Read(${rule(repo)}/**)`, `Edit(${rule(repo)}/**)`, `Edit(${rule(ws)}/.claude/**)`, `Edit(${rule(ws)}/ref/**)`, `Edit(${rule(ws)}/check.mjs)`],
    },
  }, null, 2));
}

// ---------- DeepSeek, the coding agent ----------
let session = null;
const sessionFile = path.join(runDir, 'session.txt');
if (existsSync(sessionFile)) session = readFileSync(sessionFile, 'utf8').trim();
let turnNo = readdirSync(runDir).filter((f) => /^turn-\d+\.jsonl$/.test(f)).length;
function deepseek(prompt) {
  const key = deepseekKey();
  if (!key) throw new Error('DEEPSEEK_API_KEY is not set');
  const resume = !!session;
  if (!session) { session = randomUUID(); writeFileSync(sessionFile, session); }
  const transcript = path.join(runDir, `turn-${String(++turnNo).padStart(2, '0')}.jsonl`);
  const allowed = ['Bash(node check.mjs)', 'PowerShell(node check.mjs)', `Read(${rule(ws)}/**)`, `Edit(${rule(ws)}/planner/**)`, `Write(${rule(ws)}/planner/**)`, `Edit(${rule(ws)}/notes/**)`, `Write(${rule(ws)}/notes/**)`, `Glob(${rule(ws)}/**)`, `Grep(${rule(ws)}/**)`, 'WebSearch', 'WebFetch'];
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
    let answer = '', tools = 0;
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      out.write(`${line}\n`);
      try { const j = JSON.parse(line); if (j.type === 'result' && typeof j.result === 'string') answer = j.result; for (const b of j.message?.content ?? []) if (b.type === 'tool_use') tools++; } catch { /* not JSON */ }
    });
    child.stderr.on('data', (d) => appendFileSync(path.join(runDir, 'stderr.log'), d));
    const timer = setTimeout(() => { log(`turn ${turnNo}: ${TURN_MINUTES} minutes; stopping it`); if (win) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F']); else child.kill(); }, TURN_MINUTES * 60e3);
    child.on('exit', (code) => { clearTimeout(timer); out.end(); log(`turn ${turnNo} ended (code ${code}; ${tools} tool calls)`); resolve(answer); });
  });
}

const check = () => { const c = spawnSync(process.execPath, ['check.mjs'], { cwd: ws, encoding: 'utf8', timeout: 180000 }); return { ok: c.status === 0, text: `${c.stdout}${c.stderr}` }; };
const keep = (label) => { const d = path.join(runDir, 'versions', label); mkdirSync(d, { recursive: true }); for (const f of PLAN_FILES) cpSync(path.join(ws, 'planner', f), path.join(d, f)); return d; };
let lastGood = null;
async function settle(label) {
  let r = check();
  if (!r.ok) {
    log(`${label}: the check failed; one turn to fix it`);
    await deepseek(`\`node check.mjs\` fails:\n\n${r.text.slice(-4000)}\n\nFix planner/, then run \`node check.mjs\` until it passes.`);
    r = check();
  }
  if (r.ok) { lastGood = keep(label); log(`${label}: check passes; kept as ${path.basename(lastGood)}`); }
  else if (lastGood) { for (const f of PLAN_FILES) cpSync(path.join(lastGood, f), path.join(ws, 'planner', f)); log(`${label}: still failing; the last good version plays`); }
  return r.ok;
}

// ---------- games ----------
const results = existsSync(path.join(runDir, 'results.json')) ? JSON.parse(readFileSync(path.join(runDir, 'results.json'), 'utf8')) : [];
const saveResults = () => writeFileSync(path.join(runDir, 'results.json'), JSON.stringify(results, null, 2));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const NEW_MAPS = ['twin_peaks', 'tiers', 'sub_mids', 'rush'];
/** The round's games: each new map once, the classic ring, then more new maps; a Bed Wars game last. */
function roundPlan(n) {
  const sky = [...NEW_MAPS, 'classic'];
  while (sky.length < n - 1) sky.push(pick(NEW_MAPS));
  return [...sky.slice(0, n - 1).map((t, i) => ({ game: 'skywars', template: t, difficulty: i % 2 ? 'hard' : 'normal' })), { game: 'bedwars', difficulty: pick(['normal', 'hard']) }];
}

async function loadPlanner() {
  const v = `?v=${Date.now()}`;
  const runner = await import(pathToFileURL(path.join(ws, 'planner', 'planRunner.mjs')).href + v);
  const thinker = await import(pathToFileURL(path.join(ws, 'planner', 'thinker.mjs')).href + v);
  return { runner, thinker };
}

async function playGame(label, spec, reviewDir) {
  const { game, difficulty } = spec;
  const map = game === 'skywars'
    ? { template: spec.template, pack: pick(packsFor(spec.template)).id }
    : { layout: pick(LAYOUT_IDS.filter((id) => id !== 'practice' && LAYOUT_TEMPLATES[id].teams.includes(2))) };
  const { runner, thinker: T } = await loadPlanner();
  const usage = { calls: 0, input: 0, output: 0 };
  const thinker = new T.SlowThinker({ ask: createDeepSeekAsk({ model: MODEL, usage, thinking: THINKING }), notes: '' });
  const steps = {};
  let sampler = null;
  const planner = { name: 'Planner', scripted: difficulty, brain: 'planner', planner: thinker, runPlan: runner.runPlan,
    onSession: (s) => { sampler = setInterval(() => { const st = s.lastPlanStep; if (st) { const k = `${st.by} (${st.action})`; steps[k] = (steps[k] ?? 0) + 1; } }, 500); sampler.unref?.(); } };
  const scripted = { name: 'Scripted', scripted: difficulty };
  const players = Math.random() < 0.5 ? [planner, scripted] : [scripted, planner];
  if (game === 'bedwars') { players[0].team = 'red'; players[1].team = 'blue'; }
  const outDir = path.join(runDir, 'games', label);
  log(`${label}: ${game} at ${difficulty} on ${JSON.stringify(map)}; ${players[0].name} joins first`);
  let result;
  try {
    result = await runBotMatch({ game, players, outDir, video: false, port: PORT, difficulty, statusEveryTicks: 10,
      maxSeconds: game === 'skywars' ? 300 : 480, log: (l) => appendFileSync(path.join(runDir, 'matches.log'), `${new Date().toISOString()} ${l}\n`),
      ...(game === 'skywars' ? { skywarsTemplate: map.template, skywarsPack: map.pack } : { bedwarsLayout: map.layout }) });
  } catch (err) { clearInterval(sampler); log(`${label}: the game failed: ${err.message}`); return null; }
  clearInterval(sampler);
  const winner = result.winnerName ?? (game === 'bedwars' && result.winner ? players.find((p) => p.team === result.winner)?.name : null) ?? null;
  const plans = thinker.history;
  const ruleTicks = Object.entries(steps).filter(([k]) => !/^(fallback|otherwise) \(default\)/.test(k)).reduce((n, [, v]) => n + v, 0);
  const allTicks = Object.values(steps).reduce((n, v) => n + v, 0);
  const entry = { label, game, difficulty, map, first: players[0].name, winner, endReason: result.endReason, seconds: result.seconds,
    questions: plans.length, plansAccepted: plans.filter((p) => p.plan).length, meanMs: plans.length ? Math.round(plans.reduce((n, p) => n + p.ms, 0) / plans.length) : 0,
    planShare: allTicks ? +(ruleTicks / allTicks).toFixed(2) : 0, tokens: usage, thinking: THINKING };
  results.push(entry); saveResults();
  log(`${label}: ${winner ? `${winner} won` : `a draw (${result.endReason})`} after ${result.seconds} s; ${entry.plansAccepted}/${entry.questions} plans taken (mean ${entry.meanMs} ms); the plan decided ${Math.round(entry.planShare * 100)}% of ticks`);

  // The record DeepSeek reads.
  const rec = path.join(outDir, 'recording');
  const jl = (f) => (existsSync(path.join(rec, f)) ? readFileSync(path.join(rec, f), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
  const ev = jl('events.jsonl');
  const t0 = ev.find((e) => e.kind === 'phase' && e.phase === 'playing')?.t ?? ev[0]?.t ?? 0;
  const ts = (t) => `${(t - t0).toFixed(1)}s`;
  const dir = path.join(reviewDir, label);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'timeline.txt'), ['Every 0.5 s, each bot: time, who, position, health, what it held, what it was doing.',
    ...ev.filter((e) => e.kind === 'autopilot_status').map((e) => `${ts(e.t)} ${e.who.padEnd(9)} (${e.pos.x}, ${e.pos.y}, ${e.pos.z}) hp ${e.health}${e.absorption ? `+${e.absorption}` : ''} ${e.held ?? 'empty hand'} | ${e.doing ?? ''}${e.mode !== 'survival' ? ` [${e.mode}]` : ''}`)].join('\n'));
  writeFileSync(path.join(dir, 'chat.txt'), jl('chat.jsonl').filter((c) => !/HUD hidden|recipes|advancement/.test(c.text)).map((c) => `${ts(c.t)} ${c.text}`).join('\n'));
  writeFileSync(path.join(dir, 'plans.txt'), plans.map((p, i) => [
    `#${i + 1} at ${Math.round(p.at)} s of play; asked because: ${p.reasons.join('; ')}; the model took ${p.ms} ms`,
    `  the plan before it ran: ${JSON.stringify(p.previousRan ?? {})}`,
    p.plan ? `  PLAN: ${JSON.stringify(p.plan)}` : `  REJECTED: ${(p.errors ?? []).join('; ')}`,
  ].join('\n')).join('\n\n') || '(no questions)');
  writeFileSync(path.join(dir, 'steps.txt'), `What decided the planner bot's ticks (sampled every 0.5 s):\n${Object.entries(steps).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}\t${k}`).join('\n')}`);
  writeFileSync(path.join(dir, 'summary.md'), `# ${label}: ${winner ? `${winner} won` : 'no winner'}\n\n${game} at ${difficulty}; map ${JSON.stringify(map)}; ${players[0].name} joined first${game === 'bedwars' ? ` (team ${players[0].team})` : ''}. ${result.endReason} after ${result.seconds} s.\nThe model was asked ${plans.length} times (${entry.plansAccepted} plans taken, ${entry.meanMs} ms on average); the plan's rules (not the default) decided ${Math.round(entry.planShare * 100)}% of ticks.\n`);
  return entry;
}

async function playSet(name, plan) {
  const reviewDir = path.join(ws, 'reviews', name);
  mkdirSync(reviewDir, { recursive: true });
  const out = [];
  for (let i = 0; i < plan.length; i++) {
    const label = `${name}-${i + 1}-${plan[i].game}-${plan[i].template ?? 'bw'}-${plan[i].difficulty}`;
    const had = results.find((r) => r.label === label || r.label === `${label}-retry`);
    if (had) { out.push(had); continue; }
    let g = await playGame(label, plan[i], reviewDir);
    if (!g) { log(`${label}: trying it once more`); await new Promise((r) => setTimeout(r, 20000)); g = await playGame(`${label}-retry`, plan[i], reviewDir); }
    if (g) out.push(g);
  }
  return out;
}
const score = (games) => { const w = games.filter((g) => g.winner === 'Planner').length, l = games.filter((g) => g.winner === 'Scripted').length; return `Planner ${w}, Scripted ${l}, drawn ${games.length - w - l}`; };
const usageOf = (games) => games.reduce((u, g) => ({ calls: u.calls + (g.tokens?.calls ?? 0), input: u.input + (g.tokens?.input ?? 0), output: u.output + (g.tokens?.output ?? 0) }), { calls: 0, input: 0, output: 0 });

// ---------- the lab ----------
setUp();
log(`lab ${RUN}: ${FINAL ? `final ${FINAL}, ${FINAL_GAMES} games` : `${ROUNDS} rounds of ${GAMES} games`}; DeepSeek ${MODEL} (${EFFORT}); workspace ${ws}`);
if (!(await settle('start'))) { log('the planner does not pass its check at the start; stopping'); process.exit(1); }
if (args.includes('--check-only')) process.exit(0);
if (args.includes('--dry')) {
  // One game, no coding turns: the workspace, the check and a game with the model planning live.
  const games = await playSet('dry', [{ game: 'skywars', template: opt('template', 'twin_peaks'), difficulty: 'normal' }]);
  log(`dry: ${score(games)}; model calls ${JSON.stringify(usageOf(games))}`);
  process.exit(0);
}
if (FINAL) {
  const plan = Array.from({ length: FINAL_GAMES }, (_, i) => (i === FINAL_GAMES - 1 ? { game: 'bedwars', difficulty: 'normal' } : { game: 'skywars', template: [...NEW_MAPS, 'classic'][i % 5], difficulty: i % 2 ? 'hard' : 'normal' }));
  const games = await playSet(FINAL, plan);
  log(`${FINAL}: ${score(games)}; model calls ${JSON.stringify(usageOf(games))}`);
  for (const t of [...NEW_MAPS, 'classic', 'bedwars']) { const g = games.filter((x) => (x.map.template ?? 'bedwars') === t); if (g.length) log(`${FINAL} on ${t}: ${score(g)}`); }
  process.exit(0);
}
const state = existsSync(path.join(runDir, 'state.json')) ? JSON.parse(readFileSync(path.join(runDir, 'state.json'), 'utf8')) : { round: 0, briefed: false };
const saveState = () => writeFileSync(path.join(runDir, 'state.json'), JSON.stringify(state));
if (!state.briefed) {
  await deepseek(`Read CLAUDE.md, then planner/thinker.mjs, planner/planRunner.mjs and planner/facts.mjs in full, ref/skills.mjs, ref/view.mjs, ref/playbooks/skywars.mjs and bedwars.mjs with ref/scriptedBot-skills.mjs (the scripted bot's play: your opponent and your default), ref/generalState.js, the rule books in docs/, and ref/skywars-maps.js (the maps). Research SkyWars and Bed Wars strategy on the web, and how to make an LLM plan well for a real-time game (what to show it, how to ask, what to let it say); write notes/research.md with URLs.

Then improve the planner before the first games, so that its plans beat the scripted play on these maps. Run \`node check.mjs\` after every change. End by writing notes/changes.md: what you changed and why.`);
  state.briefed = true; saveState();
  await settle('briefed');
}
while (state.round < ROUNDS) {
  const round = state.round + 1;
  const games = await playSet(`round-${round}`, roundPlan(GAMES));
  log(`round ${round}: ${score(games)}; model calls ${JSON.stringify(usageOf(games))}`);
  state.round = round; saveState();
  if (round === ROUNDS) break;
  await deepseek(`Round ${round} of ${ROUNDS}: ${score(games)}.
${games.map((g) => `- ${g.label}: ${g.winner ? `${g.winner} won` : `draw (${g.endReason})`} in ${g.seconds} s; ${g.plansAccepted}/${g.questions} plans taken, ${g.meanMs} ms each; the plan's rules decided ${Math.round(g.planShare * 100)}% of ticks`).join('\n')}

The records are in reviews/round-${round}/ (summary.md, plans.txt, steps.txt, timeline.txt, chat.txt per game). Study every game: where the planner's plans helped, where they hurt, where the model was not asked when it should have been, could not say what it wanted (a missing fact, action or target), was shown too little or too much, or answered too slowly. Then improve planner/ so its planning beats the scripted play -- through the model's planning, not hand-written play. Run \`node check.mjs\` after every change; add a "Round ${round}" section to notes/changes.md.`);
  await settle(`round-${round}`);
}
log('lab done');
process.exit(0);
