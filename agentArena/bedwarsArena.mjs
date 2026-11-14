#!/usr/bin/env node
// The Bed Wars arena: AI agents each write a bot for a team of four, then the teams play five-team Bed Wars
// (4v4v4v4v4): every agent's squad and a squad of the unchanged scripted bot, five games, one on each layout of the
// progression (src/mods/bedwars/layouts.js PROGRESSION), simplest first; each layout laid out afresh by a seed drawn only
// once the bots are frozen.
//
// As the SkyWars arena (scriptedArena.mjs, whose agent harnesses it uses): each agent gets a workspace of its own with a
// full copy of the scripted bot, the rules, references, `node check.mjs`, `node practice.mjs [layout] [seed] [squads]`
// (a real game, its squad against 1-4 scripted squads: bedwarsPractice.mjs) and `node test.mjs`; then its bot is frozen
// (runs/<run>/bots/<name>/) and the games begin, refereed (referee.mjs bedwarsReferee) and recorded (round-N-bedwars/).
// A team scores the teams it outlasts; teams still in at the time limit share their place.
//
//   node agentArena/bedwarsArena.mjs --players "Opus:claude:claude-opus-5-5:high,Sol:codex:gpt-6.1-sol:high,
//        Gemini:agy:gemini-3.8-flash-high:high,DeepSeek:deepseek:deepseek-flash:high,Scripted:scripted"
//        [--minutes 60] [--practice 5] [--time-limit 10] [--practice-time 6] [--difficulty hard] [--run <name>]
//        [--port 3195] [--no-agents] [--games-only] [--no-video]
// --no-agents: no coding (every squad plays the scripted bot): a dry run of everything else.
import { spawnSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, appendFileSync, existsSync, cpSync, rmSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runBotMatch } from './botMatch.mjs';
import { bedwarsReferee } from './referee.mjs';
import { exportFilm } from './filmExport.mjs';
import { servePractice } from './scriptedPractice.mjs';
import { GRANTS as AGY_GRANTS } from './scriptedArenaGuard.mjs';
import { parsePlayers, agentTurn, auditTranscript, INSTRUCTIONS, claudeAllow, check } from './scriptedArena.mjs';
import { PROGRESSION, LAYOUT_TEMPLATES, LAYOUT_IDS } from '../src/mods/bedwars/layouts.js';
import { TEAMS } from '../src/mods/bedwars/teams.js';
import { THEME_IDS } from '../src/mods/bedwars/arena.js';
import { CLOSING } from '../src/mods/closingZone.js';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const flag = (n) => args.includes(`--${n}`);
const repo = path.resolve(import.meta.dirname, '..');
const url = (rel) => pathToFileURL(path.join(repo, rel)).href;
const slash = (p) => p.replace(/\\/g, '/');
const rule = (p) => slash(p).replace(/^([A-Za-z]):/, (m, d) => `//${d.toLowerCase()}`);
const MODEL_NAMES = { 'claude-opus-5-5': 'Claude Opus 5.5', 'gpt-6.1-sol': 'GPT-6.1 Sol', 'gemini-3.8-flash-high': 'Gemini 3.8 Flash', 'deepseek-flash': 'DeepSeek V4.1 Flash' };

// --- the workspace ----------------------------------------------------------------------------------------------------

/** Every file of the bot an agent starts from (bot/ mirrors agentArena/). */
const BOT_FILES = [
  'scriptedBot/base.mjs', 'scriptedBot/scriptedBot.mjs', 'scriptedBot/skills.mjs', 'scriptedBot/playbooks/skywars.mjs',
  'scriptedBot/playbooks/bedwars.mjs', 'skills/skills.mjs', 'skills/view.mjs', 'plans/planRunner.mjs', 'plans/facts.mjs',
  'plans/thinker.mjs',
];
/** A bot file with its imports of the game (packages/, src/) pointing at the repository: the engine is not theirs. */
const botSource = (rel) => readFileSync(path.join(repo, 'agentArena', rel), 'utf8')
  .replace(/'(\.\.\/)+packages\//g, `'${url('packages')}/`).replace(/'(\.\.\/)+src\//g, `'${url('src')}/`);

/** check.mjs: the bot loads, keeps the game's limits, imports only the game, touches no item itself, plays 120 rounds. */
function writeCheck(ws) {
  const allowed = [url('packages'), url('src')];
  writeFileSync(path.join(ws, 'check.mjs'), `// Checks bot/: it loads and exports what the arena runs; it keeps the game's limits (the difficulty's skills and
// pace, the walking and sprinting speeds, reach, recharge -- as the repository's scripted bot has them); it uses only the
// game's modules and its own files; it makes no item and changes no game state itself (items come only from the game:
// the shop, the generators, pickups); and its Bed Wars playbook plays 120 recorded rounds without failing. A bot that
// fails this does not play.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const fail = (m) => { console.log('CHECK FAILED: ' + m); process.exit(1); };
const ALLOWED = ${JSON.stringify(allowed)};
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\\.m?js$/.test(f)) files.push(p); } };
walk('bot');
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\\bfrom\\s+['"]([^'"]+)['"]|\\bimport\\s*\\(\\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1] ?? m[2];
    if (spec.startsWith('.')) { const to = path.resolve(path.dirname(f), spec); if (!to.startsWith(path.resolve('bot'))) fail(f + ' imports ' + spec + ': outside bot/'); continue; }
    if (spec === 'three' || spec === 'node:events') continue;
    if (!ALLOWED.some((a) => spec.startsWith(a))) fail(f + ' imports ' + spec + ': only the game (packages/, src/ of the repository) and bot/ itself');
  }
  const code = src.replace(/\\/\\/.*$/gm, '').replace(/\\/\\*[\\s\\S]*?\\*\\//g, '');
  const rules = [
    [/\\brequire\\s*\\(|child_process|node:fs|node:net|node:http|\\bfetch\\s*\\(|\\bWebSocket\\b|\\bprocess\\.(env|exit|kill)|\\.ws\\b|sendPacket\\s*=|DIFFICULTY_PROFILES\\s*\\[[^\\]]*\\]\\s*=|Object\\.defineProperty\\s*\\(\\s*globalThis/, 'a bot plays through its session and skills, within the game'],
    [/\\baddItem\\s*\\(|\\b(hotbar|storage)\\s*\\[[^\\]]*\\]\\s*=\\s*[{[]|\\barmor\\s*(\\.\\w+|\\[[^\\]]*\\])\\s*=\\s*[{[]|\\.count\\s*(\\+\\+|\\+=|\\*=|=\\s*\\d)|\\bbedwarsKit\\s*(\\.\\w+\\s*)?=[^=]|\\b(bedwarsState|bedwarsArena|skywarsState)\\s*=[^=]|\\b(addItem|buyInBedWars|breakBlockAt|placeBlockAt)\\s*\\([^)]*\\)\\s*\\{|\\bsetVoxel\\s*\\(/, 'items come only from the game (the shop, generators, pickups), and the game state is the host\\'s: a bot moves its own stacks, never makes or grows one, and does not redefine how the game buys, breaks or places'],
  ];
  for (const [re, why] of rules) { const bad = code.match(re); if (bad) fail(f + ' uses "' + bad[0] + '": ' + why); }
}
let Bot, Repo, RepoBase, F, V;
try {
  Bot = await import(pathToFileURL('bot/scriptedBot/scriptedBot.mjs').href + '?v=' + Date.now());
  Repo = await import(${JSON.stringify(url('agentArena/scriptedBot/scriptedBot.mjs'))});
  RepoBase = await import(${JSON.stringify(url('agentArena/scriptedBot/base.mjs'))});
  F = await import(${JSON.stringify(url('tests/helpers/botFake.js'))});
  V = await import(pathToFileURL('bot/skills/view.mjs').href);
} catch (e) { fail('the bot does not load: ' + (e.stack || e.message)); }
for (const n of ['ScriptedBotSession', 'createBotSkills']) if (typeof Bot[n] !== 'function') fail('bot/scriptedBot/scriptedBot.mjs must export ' + n);
if (typeof Bot.PLAYBOOKS?.bedwars !== 'function') fail('bot/scriptedBot/scriptedBot.mjs must export PLAYBOOKS with bedwars');
try { assert.deepEqual(Bot.BOT_SKILLS, RepoBase.BOT_SKILLS); } catch { fail('BOT_SKILLS (what each difficulty may do, and its pace) must stay as the game has them'); }
const mk = (M) => new M.ScriptedBotSession({ code: '1234', name: 'C', url: 'ws://localhost:1/ws/share' });
for (const d of ['easy', 'normal', 'hard']) for (const bridging of [false, true]) {
  const a = mk(Repo), b = mk(Bot);
  a.setDifficulty(d); b.setDifficulty(d); a.bridgingNow = bridging; b.bridgingNow = bridging;
  try { assert.deepEqual(JSON.parse(JSON.stringify(b.profile)), JSON.parse(JSON.stringify(a.profile))); }
  catch { fail('the profile at ' + d + (bridging ? ' while bridging' : '') + ' (speeds, the brain\\'s pace, the bridge pause) must stay as the game has it'); }
  if (JSON.stringify(b.skills) !== JSON.stringify(RepoBase.BOT_SKILLS[d])) fail('skills at ' + d + ' must be BOT_SKILLS.' + d);
}
const s0 = mk(Bot);
if (typeof s0.startHouseBrain !== 'function' || typeof s0.runBrainTick !== 'function') fail('its session must keep startHouseBrain and runBrainTick (the arena starts the bot with them)');
let ran = 0;
for (let seed = 1; seed <= 120; seed++) {
  const bot = F.bedwarsScenario(seed)(Bot.ScriptedBotSession);
  const view = V.buildView(bot);
  if (!view) continue;
  try {
    await Promise.race([Bot.PLAYBOOKS.bedwars({ view, skills: Bot.createBotSkills(bot) }), new Promise((_, rej) => setTimeout(() => rej(new Error('a playbook tick took more than 5 s')), 5000))]);
    ran++;
  } catch (e) { fail('the Bed Wars playbook failed on recorded round ' + seed + ': ' + (e.stack || e.message).slice(0, 600)); }
}
if (ran < 100) fail('too few recorded rounds ran: ' + ran);
console.log('CHECK PASSED (' + ran + ' recorded Bed Wars rounds played)');
process.exit(0);
`);
}

/** A command's arguments: its own, or (Gemini, whose commands run as exact lines) the ones the gate saved for it. */
const ARGS_FROM_GATE = (command) => `(() => { const own = process.argv.slice(2); if (own.length) return own; try { const a = JSON.parse(readFileSync('.agents/args.json', 'utf8')); return a.command === ${JSON.stringify(command)} && Date.now() - a.at < 60000 ? a.argv : []; } catch { return []; } })()`;

function writeCommands(ws, { practiceLimit, practiceTime }) {
  writeFileSync(path.join(ws, 'practice.mjs'), `// node practice.mjs [layout] [seed] [squads]   or   node practice.mjs result
// A practice game of five-team Bed Wars: your squad (bot/, four players) against 1-4 squads of the unchanged scripted
// bot (squads, 1 by default), with the referee, on a layout you name (${LAYOUT_IDS.join(', ')}) or a random one, and the
// seed you give or a random one. ${practiceTime} minutes of play. ${practiceLimit} practice games in all. The arena plays it and
// writes practice/<n>/ (summary.md, timeline.txt, chat.txt, referee.txt, map.txt, recording/). This waits up to 4
// minutes; if it is still playing, \`node practice.mjs result\` waits again. Your bot must pass node check.mjs.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
const argv = ${ARGS_FROM_GATE('practice')};
const queue = path.join('practice', 'queue');
mkdirSync(queue, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id;
if (argv[0] === 'result') {
  const pending = readdirSync(queue).filter((f) => /^p\\d+\\.json$/.test(f)).sort();
  const answered = readdirSync(queue).filter((f) => /^p\\d+\\.result\\.json$/.test(f)).sort();
  id = (pending.at(-1) ?? answered.at(-1))?.replace(/(\\.result)?\\.json$/, '');
  if (!id) { console.log('No practice game is waiting. Your games so far: practice/<n>/summary.md.'); process.exit(0); }
} else {
  const [a, b, c] = argv;
  const req = { template: a ?? null, seed: b ?? null, opponents: Number(c ?? 1) };
  id = 'p' + Date.now();
  writeFileSync(path.join(queue, id + '.json'), JSON.stringify({ ...req, at: Date.now() }));
  console.log('Practice requested (' + (req.template ?? 'a random layout') + ', your squad and ' + req.opponents + ' scripted squad' + (req.opponents > 1 ? 's' : '') + '). Waiting for the arena to play it...');
}
const answer = path.join(queue, id + '.result.json');
for (let t = 0; t < 240 && !existsSync(answer); t++) await sleep(1000);
if (!existsSync(answer)) { console.log('Still playing (or waiting for its turn). Run node practice.mjs result to wait for it again.'); process.exit(0); }
const r = JSON.parse(readFileSync(answer, 'utf8'));
console.log(r.error ? 'Practice' + (r.n ? ' ' + r.n : '') + ': ' + r.error : r.summary);
process.exit(0);
`);
  writeFileSync(path.join(ws, 'test.mjs'), `// node test.mjs [tests/<file>]: runs your tests (every tests/*.test.mjs, or the one named) with Node's test runner,
// in this process (a sandboxed agent's commands may not start another).
import { readFileSync, readdirSync } from 'node:fs';
import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import path from 'node:path';
const argv = ${ARGS_FROM_GATE('test')};
const file = argv[0];
if (file && !path.resolve(file).startsWith(path.resolve('tests'))) { console.log('node test.mjs runs the tests in tests/ only.'); process.exit(1); }
const files = file ? [file] : readdirSync('tests').filter((f) => /\\.test\\.m?js$/.test(f)).map((f) => path.join('tests', f));
if (!files.length) { console.log('No tests yet: write tests/<name>.test.mjs.'); process.exit(1); }
let failed = false;
const stream = run({ files: files.map((f) => path.resolve(f)), isolation: 'none' });
stream.on('test:fail', () => { failed = true; });
const report = stream.compose(spec);
report.pipe(process.stdout, { end: false });
await new Promise((resolve) => report.on('end', resolve));
process.exit(failed ? 1 : 0);
`);
  writeFileSync(path.join(ws, 'refused.mjs'), `// What the shell runs instead of a command the arena does not allow.
console.log('Refused: the only commands are node check.mjs, node practice.mjs [...] and node test.mjs [...], each on its own line, run in your folder.');
`);
}

/** The instructions, in the file the agent's harness reads (CLAUDE.md, AGENTS.md, GEMINI.md). */
export function instructionsText({ player, players, difficulty, practiceLimit, practiceTime, minutes, timeLimit }) {
  const others = players.filter((p) => p !== player);
  const who = (p) => (p.harness === 'scripted' ? 'a squad of the unchanged scripted bot: no AI writes it' : `an AI agent, ${MODEL_NAMES[p.model] ?? p.model}, writing its own bot now as you write yours`);
  const min = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const L = timeLimit, zoneStart = L * CLOSING.start, zoneEnd = L * CLOSING.closed;
  const codex = player.harness === 'codex' ? '\nYour commands run in a sandbox that lets you write only inside this folder; the arena plays your practice games for you.\n' : '';
  return `# The Bed Wars arena: write the bot that wins five-team Bed Wars with a team of four

You are ${player.name}. Every AI agent writes a bot now; then the bots play **${PROGRESSION.length} games of Bed Wars in the five-team mode
(4v4v4v4v4)**, at **${difficulty}** difficulty. **Your bot plays all four players of your team** (${player.name}1, ${player.name}2,
${player.name}3, ${player.name}4: four copies of your bot/, each its own player). The other teams: ${others.map((p) => `**${p.name}** (${who(p)})`).join(', ')}.
The last team with a player standing wins a game. The bots play on their own: no AI is asked anything during the games.

## The five games: the maps get more complex, game by game
Each game is on a different Bed Wars layout, in this order (\`ref/bedwars-layouts.js\` builds them; \`docs/bedwars-rulebook.md\`
describes the map):
${PROGRESSION.map((id, i) => `${i + 1}. **${LAYOUT_TEMPLATES[id].name}** (\`${id}\`): ${LAYOUT_TEMPLATES[id].description}`).join('\n')}
Five bases stand evenly on a ring round the middle. Every layout is laid out afresh by a random seed -- distances, angles,
island sizes and heights -- drawn only once the bots are frozen, so nobody has seen the games' maps. Your team's base (its
colour: Red, Blue, Green, Yellow or Aqua) turns from game to game. **Write a bot that wins on any of these layouts**:
\`node practice.mjs <layout> <seed>\` lays one out for practice.

## The clock, the end of the beds, and the closing zone (read this twice)
Each game lasts at most **${L / 60} minutes** of play. The timetable (fractions of the limit; \`view\` shows the time):
- ${min(3 * 60)} Diamond II; ${min(6 * 60)} Emerald II (the generators speed up).
- **${min(zoneStart)} Bed Destruction: every bed still standing is destroyed. From then on every death is final.**
- **${min(zoneStart)} the zone starts to close**, and is **fully closed at ${min(zoneEnd)}**:
  - **a border closes in on the middle of the map**, from beyond every island to a circle of about 9 blocks round the middle;
  - **the void rises** from under the map to one block under the tops of the islands in the middle;
  - **hiding under an island counts as the void**: standing on blocks you placed with the map's own island above your head
    (trees and plants do not count as island; the map's own ground never counts as hiding);
  - a player outside the border, below the void's level, or hiding under an island is **in the void**. **Ten seconds in the
    void, all told, and the player is out for good** ("... was swallowed by the closing void."). Back inside, the count
    runs down at half the speed. The host decides it from where it sees each player; no bot can decline it.
  - The match state says where the zone is: \`zone: { x, z, radius, floor, progress, closedAt }\` (null until it starts), and
    each player's count in \`inVoid\`. Your skills read them: \`skills.zone()\`, \`skills.inVoid()\`, and \`skills.keepInZone()\`
    walks (and bridges) back inside. **Your bots must be in the middle, with blocks to get there, before ${min(zoneEnd)}.**
- ${min(L * 0.8)} Sudden Death (announced; no dragons in this game).
- ${min(L)} the time limit: teams still in share their place (rare: the zone has closed by then).

## Scoring
A team scores **one point for every team it outlasts** in a game (the winner outlasts all four: 4 points). A team is out
when its last player is out. Teams still standing at the time limit share the place. The series is the sum over five games.

## Rules that matter for a bot (\`node check.mjs\` and the referee enforce them; \`docs/bedwars-rulebook.md\` has the rest)
- **A bed is broken only within reach** (one half within 4.5 blocks of your eyes) **and through an open face**: a bed covered
  all round must be dug out first (\`skills.breakBed\` digs a covering block, then the bed). The host checks both.
- **Digging takes Java's time** (the table is in \`docs/bedwars-rulebook.md\`): each call of \`breakBlockAt\` (and of
  \`skills.breakBed\`) digs on, answering \`{ digging: true, progress }\` until the block breaks; a pause of more than 1.25 s, or
  another block, starts it over; only within 4.5 blocks of the eyes; the tool in hand counts. A bed: 0.3 s. Wool: 1.2 s by
  hand, 0.25 s with shears. End stone: 15 s by hand, 1.15 s with the wooden pickaxe. Obsidian: 22.75 s with the iron
  pickaxe, 4.2 s with the diamond one. Maniac Miner (Haste): 20% faster a level. A bed's cover now costs a rusher time.
- **Buying only at your team's shopkeepers**: items at the item shop, team upgrades and traps at the team upgrades keeper,
  within 6 blocks of the keeper (\`skills.baseKeepers(team)\`; the forge is close enough to both). Elsewhere a purchase fails.
- **Items come only from the game**: the shop, the generators, pickups. Your code moves its own stacks but never makes or
  grows one, and never sends a purchase, an upgrade or an explosion itself. The bot client has no TNT or fireball.
- The game's limits stay: the difficulty's skills and pace (\`BOT_SKILLS\`), walking and sprinting speeds, the brain's pace,
  the bridge pause, Java's reach (3 blocks), weapon recharge and damage. The referee drops any hit beyond reach, faster than
  the recharge or harder than the weapon, and any item, purchase or explosion outside the rules above.
- The bot imports only the game (the repository's \`packages/\` and \`src/\`) and its own files, and plays only through its
  session and skills: no network, files, processes, or changing the game itself.
- **Your four players run in one process**: the file \`bot/scriptedBot/scriptedBot.mjs\` is loaded afresh for each, and the
  files it imports are loaded once and shared, so your four may share memory through a module of your own (a team radio).
  That is allowed between your own four; you cannot reach another team's.
- \`bot/scriptedBot/scriptedBot.mjs\` keeps exporting \`ScriptedBotSession\`, \`createBotSkills\` and \`PLAYBOOKS\` (with \`bedwars\`).
- Fair play: work only in this folder (and read the repository files your bot imports). Reading another player's folder or
  the arena's own records disqualifies your bot.
${codex}
## What you have
- \`docs/bedwars-rulebook.md\`: the game (shop prices, generators, upgrades, the zone). \`docs/bots.md\`: how the bots work.
  \`docs/scripted-bot-history.md\`: how the scripted bot was improved, and why.
- \`bot/\`: **your bot, starting as a full copy of the scripted bot**, which already plays Bed Wars as a team: by the order
  of their names the four share the jobs -- a defender (covers the bed in wool, holds home), a collector (diamonds, emeralds,
  team upgrades), two rushers (go together, by a diamond island, for the nearest bed) -- and it keeps to the zone. Use it as
  a reference or a starting point, and change anything, or rewrite it:
  - \`bot/scriptedBot/playbooks/bedwars.mjs\`: what each player does each tick (the strategy, the roles).
  - \`bot/scriptedBot/skills.mjs\`, \`bot/skills/skills.mjs\`: what it can do (add new skills here).
  - \`bot/scriptedBot/scriptedBot.mjs\`, \`bot/scriptedBot/base.mjs\`: how it fights, eats, bridges, aims, gets unstuck.
  - \`bot/skills/view.mjs\`: what a playbook sees. (\`playbooks/skywars.mjs\` and \`bot/plans/\` are not used here.)
- \`ref/\` (read-only): \`guestPeer.js\` (the game client: movement, bridging, the shop, physics), \`generalState.js\`,
  \`bedwars-layouts.js\` and \`bedwars-arena.js\` (how maps are laid out and built), \`bedwars-shop.js\` (prices, upgrades),
  \`bedwars-rules.js\` (generators, respawns, the timetable), \`closingZone.js\` (the zone).
- \`tests/\`: yours. Write any tests you want (\`.mjs\`); \`check.mjs\` shows how to import your bot and the recorded-round
  fakes (the repository's \`tests/helpers/botFake.js\`, \`bedwarsScenario\`).

## Commands (each on its own line, run in this folder)
- \`node check.mjs\`: run it after every change. A bot that fails it does not play (the scripted bot plays for you).
- \`node practice.mjs [layout] [seed] [squads]\`: a real game of ${practiceTime} minutes (the same timetable, shortened: beds go at
  ${min(practiceTime * 60 * CLOSING.start)}, the zone closes by ${min(practiceTime * 60 * CLOSING.closed)}), your squad against 1-4 scripted squads, e.g.
  \`node practice.mjs archipelago 7 4\` for a full five-team game. ${practiceLimit} in all. The arena plays two games at a
  time, taking requests in turn (the player with the fewest games first), so a game may wait for its turn; one that the
  arena fails to play does not count. It waits up to 4 minutes, and
  \`node practice.mjs result\` waits again. Read \`practice/<n>/\` afterwards. Give these commands a timeout of at least 5
  minutes (300000 ms).
- \`node test.mjs [tests/<file>]\`: your own tests.

## Your task
1. Read the rule book, the bot and how the layouts are built. Write \`notes/plan.md\`: how a team of four wins five-team Bed
   Wars on these layouts -- roles, defending the bed, when and where to rush, the economy and the shop, the five-team game
   (who to attack, who will attack you), and the end: Bed Destruction and the closing zone.
2. Change \`bot/\` to carry it out. Test it however you like; practise it on different layouts; improve it.
3. Finish with \`node check.mjs\` passing and \`notes/changes.md\` saying what you changed and why.
You have about ${minutes} minutes. Work inside this folder.
`;
}

export function writeWorkspace({ ws, player, players, workspaces, difficulty, practiceLimit, practiceTime, minutes, runDir, timeLimit }) {
  for (const d of ['bot', 'docs', 'ref', 'notes', 'practice/queue', 'tests']) mkdirSync(path.join(ws, d), { recursive: true });
  for (const rel of BOT_FILES) { const to = path.join(ws, 'bot', rel); mkdirSync(path.dirname(to), { recursive: true }); if (!existsSync(to)) writeFileSync(to, botSource(rel)); }
  cpSync(path.join(repo, 'agentArena', 'docs', 'bedwars-rulebook.md'), path.join(ws, 'docs', 'bedwars-rulebook.md'));
  cpSync(path.join(repo, 'agentArena', 'bots', 'README.md'), path.join(ws, 'docs', 'bots.md'));
  cpSync(path.join(repo, 'agentArena', 'scriptedBot', 'notes', 'changes.md'), path.join(ws, 'docs', 'scripted-bot-history.md'));
  for (const [from, to] of [['packages/blockyland-mcp/guestPeer.js', 'guestPeer.js'], ['packages/blockyland-mcp/generalState.js', 'generalState.js'],
    ['src/mods/bedwars/layouts.js', 'bedwars-layouts.js'], ['src/mods/bedwars/arena.js', 'bedwars-arena.js'], ['src/mods/bedwars/shop.js', 'bedwars-shop.js'],
    ['src/mods/bedwars/rules.js', 'bedwars-rules.js'], ['src/mods/closingZone.js', 'closingZone.js']]) cpSync(path.join(repo, from), path.join(ws, 'ref', to));
  writeCheck(ws);
  writeCommands(ws, { practiceLimit, practiceTime });
  writeFileSync(path.join(ws, INSTRUCTIONS[player.harness]), instructionsText({ player, players, difficulty, practiceLimit, practiceTime, minutes, timeLimit }));
  const others = Object.entries(workspaces).filter(([n]) => n !== player.name).map(([, w]) => rule(w));
  if (player.harness === 'claude' || player.harness === 'deepseek') {
    mkdirSync(path.join(ws, '.claude'), { recursive: true });
    writeFileSync(path.join(ws, '.claude', 'settings.json'), JSON.stringify({
      permissions: { allow: claudeAllow(ws), deny: [`Read(${rule(repo)}/**)`, `Edit(${rule(repo)}/**)`, `Read(${rule(runDir)}/**)`, ...others.flatMap((o) => [`Read(${o}/**)`, `Edit(${o}/**)`]),
        `Edit(${rule(ws)}/.claude/**)`, ...['check.mjs', 'practice.mjs', 'test.mjs', 'refused.mjs'].map((f) => `Edit(${rule(ws)}/${f})`), `Edit(${rule(ws)}/ref/**)`, `Edit(${rule(ws)}/docs/**)`] },
    }, null, 2));
  }
  if (player.harness === 'agy') {
    mkdirSync(path.join(ws, '.agents'), { recursive: true });
    writeFileSync(path.join(ws, '.agents', 'hooks.json'), JSON.stringify({ 'arena-gate': { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: `node ${slash(path.join(repo, 'agentArena', 'scriptedArenaGuard.mjs'))}`, timeout: 15 }] }] } }, null, 2));
    writeFileSync(path.join(ws, '.agents', 'REFUSED.md'), "# Refused\n\nThat file or folder is outside your workspace, or it is one of the arena's own files (.agents/, check.mjs, practice.mjs, test.mjs). You can read and write only the files in your own folder. The only commands are node check.mjs, node practice.mjs and node test.mjs.\n");
  }
}

/** An agent's whole preparation: the task, then (time allowing) one turn to fix a failing check. */
export async function prepare({ player, ws, agentDir, minutes, log, prompt = null, session = null }) {
  let deadline = Date.now() + minutes * 60e3;
  mkdirSync(agentDir, { recursive: true });
  const t0 = Date.now();
  let paused = 0;
  const first = await untilDone({ player, ws, agentDir, log, deadline: () => deadline, pause: (ms) => { deadline += ms; paused += ms; }, session: session ?? randomUUID(), resume: !!session,
    prompt: prompt ?? `Read ${INSTRUCTIONS[player.harness]} and follow it: study the Bed Wars rules (the closing zone above all), the bot (it plays all four players of your team) and how the five layouts are built, write notes/plan.md, then make bot/ win five-team Bed Wars on layouts you have not seen. Write and run any tests you want (tests/, node test.mjs), run \`node check.mjs\` after every change, and \`node practice.mjs [layout] [seed] [squads]\` to test it in real games. Finish with the check passing and notes/changes.md written.` });
  writeFileSync(path.join(agentDir, 'session.txt'), String(first.session ?? ''));
  let r = check(ws);
  while (!r.ok && first.session && deadline - Date.now() > 3 * 60e3) {
    log(`${player.name}: the check fails; a turn to fix it`);
    await agentTurn({ player, ws, session: first.session, resume: true, agentDir, minutes: (deadline - Date.now()) / 60e3, log,
      prompt: `\`node check.mjs\` fails:\n\n${r.text.slice(-4000)}\n\nFix bot/ so it passes. Run \`node check.mjs\` until it does.` });
    r = check(ws);
    if (!r.ok) break;
  }
  return { ok: r.ok, check: r.text.trim().split('\n').at(-1), minutes: +((Date.now() - t0 - paused) / 60e3).toFixed(1), paused: +(paused / 60e3).toFixed(1) };
}

/** Did a turn end on the subscription's usage limit (Claude Code: "You've hit your ... limit")? */
export function hitUsageLimit(agentDir) {
  const turns = readdirSync(agentDir).filter((f) => /^turn-\d+\.jsonl$/.test(f)).sort();
  if (!turns.length) return false;
  const tail = readFileSync(path.join(agentDir, turns.at(-1)), 'utf8').slice(-6000);
  return /hit your (5-hour|weekly|usage|session)? ?limit|usage limit reached|rate_limit_error/i.test(tail);
}

/**
 * A turn, and when the usage limit ends it, a wait (15 minutes at a time) and the same session resumed with the time
 * still left; the waiting is not the agent's time (pause() moves the deadline).
 */
async function untilDone({ player, ws, agentDir, log, deadline, pause, session, resume, prompt }) {
  let turn = await agentTurn({ player, ws, session, resume, agentDir, minutes: (deadline() - Date.now()) / 60e3, log, prompt });
  for (let tries = 0; tries < 24 && hitUsageLimit(agentDir) && deadline() - Date.now() > 60e3; tries++) {
    const left = deadline() - Date.now();
    log(`${player.name}: the usage limit stopped the turn with ${(left / 60e3).toFixed(1)} min left; waiting 15 min, then resuming`);
    const t = Date.now();
    await new Promise((r) => setTimeout(r, 15 * 60e3));
    pause(Date.now() - t);
    turn = await agentTurn({ player, ws, session: turn.session ?? session, resume: true, agentDir, minutes: (deadline() - Date.now()) / 60e3, log,
      prompt: `A usage limit interrupted you; carry on with your task where you left off. About ${Math.round((deadline() - Date.now()) / 60e3)} minutes remain.` });
  }
  return turn;
}

// --- a game -------------------------------------------------------------------------------------------------------------

/** The players of game g: each agent's squad of four on a team, the teams turning by one from game to game. */
export function squadsFor(players, g, { difficulty, bots, referee, violations }) {
  const k = (g - 1) % players.length;
  const order = [...players.slice(k), ...players.slice(0, k)];
  return {
    order,
    specs: order.flatMap((p, ti) => Array.from({ length: 4 }, (_, i) => ({
      name: `${p.name}${i + 1}`, team: TEAMS[ti].id, scripted: difficulty,
      ...(bots?.[p.name]?.module ? { sessionModule: bots[p.name].module } : {}), onSession: referee(`${p.name}${i + 1}`, violations),
    }))),
  };
}

/** When each team went out, from a game's chat ("TEAM ELIMINATED > Red Team has been eliminated!"). */
function teamOuts(matchDir) {
  const f = path.join(matchDir, 'recording', 'chat.jsonl');
  if (!existsSync(f)) return [];
  const out = [];
  for (const l of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
    let c; try { c = JSON.parse(l); } catch { continue; }
    const m = /TEAM ELIMINATED > (\w+) Team/.exec(c.text ?? '');
    const team = m && TEAMS.find((t) => t.name === m[1])?.id;
    if (team && !out.some((o) => o.team === team)) out.push({ team, t: c.t });
  }
  return out;
}

/**
 * Where each squad finished: the winning team first, then by how long they lasted (the last out second...); teams still in
 * at the time limit share a place. Points: the teams each one outlasted.
 */
export function placeTeams({ squads, outs, winner }) {
  const outAt = new Map(outs.map((o) => [o.team, o.t]));
  const names = squads.map((s) => s.name), teamOf = new Map(squads.map((s) => [s.name, s.team]));
  const fallen = names.filter((n) => outAt.has(teamOf.get(n))).sort((a, b) => outAt.get(teamOf.get(b)) - outAt.get(teamOf.get(a)));
  const standing = names.filter((n) => !outAt.has(teamOf.get(n)));
  const winnerName = winner ? names.find((n) => teamOf.get(n) === winner) ?? null : null;
  const groups = [...(winnerName ? [[winnerName], standing.filter((n) => n !== winnerName)] : [standing]), ...fallen.map((n) => [n])].filter((g) => g.length);
  const places = {}, points = {};
  let place = 1, below = names.length;
  for (const g of groups) { below -= g.length; for (const n of g) { places[n] = place; points[n] = below; } place += g.length; }
  return { places, points, winner: winnerName };
}

// --- the arena ----------------------------------------------------------------------------------------------------------

async function main() {
  const players = parsePlayers(opt('players', 'Opus:claude:claude-opus-5-5:high,Sol:codex:gpt-6.1-sol:high,Gemini:agy:gemini-3.8-flash-high:high,DeepSeek:deepseek:deepseek-flash:high,Scripted:scripted'));
  if (players.length !== 5) throw new Error('five squads: the five-team mode has five bases');
  const difficulty = opt('difficulty', 'hard');
  const timeLimit = Math.round(Number(opt('time-limit', 10)) * 60), practiceTime = Number(opt('practice-time', 6));
  const minutes = Number(opt('minutes', 60)), practiceLimit = Number(opt('practice', 5)), port = Number(opt('port', 3195));
  const noAgents = flag('no-agents');
  const run = opt('run', `bedwars-five-${new Date().toISOString().slice(5, 16).replace(/[-:T]/g, '')}`);
  const runDir = path.join(repo, 'agentArena', 'runs', run);
  mkdirSync(runDir, { recursive: true });
  const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); appendFileSync(path.join(runDir, 'arena.log'), `${l}\n`); };
  const statePath = path.join(runDir, 'state.json');
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
  const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
  const agents = players.filter((p) => p.harness !== 'scripted');
  log(`bed wars arena ${run}: ${players.map((p) => (p.harness === 'scripted' ? `${p.name} (the scripted bot)` : `${p.name} (${p.harness} ${p.model}${p.effort ? ` ${p.effort}` : ''})`)).join(', ')}; five-team Bed Wars at ${difficulty}, ${timeLimit / 60}-minute games on ${PROGRESSION.join(', ')}; ${noAgents ? 'no agents' : `${minutes} min to code, ${practiceLimit} practice games of ${practiceTime} min each`}`);

  // 1. The agents write their bots, each in a workspace of its own whose path says nothing of the run or the player.
  const botsDir = path.join(runDir, 'bots');
  state.workspaces ??= Object.fromEntries(agents.map((p) => [p.name, path.join(os.homedir(), 'blockyland-arena', `bw-${randomBytes(6).toString('hex')}`, 'work')]));
  save();
  if (!state.coded && !flag('games-only')) {
    const workspaces = state.workspaces;
    for (const p of agents) writeWorkspace({ ws: workspaces[p.name], player: p, players, workspaces, difficulty, practiceLimit, practiceTime, minutes, runDir, timeLimit });
    const service = noAgents ? null : servePractice({ workspaces: agents.map((p) => ({ name: p.name, ws: workspaces[p.name] })), limit: practiceLimit, difficulty, timeLimit: practiceTime * 60,
      concurrency: Number(opt('practice-concurrency', 2)), minFreeGb: 2.5, gameTimeoutMs: (practiceTime * 3 + 5) * 60e3, portBase: port + 100, log, script: path.join(repo, 'agentArena', 'bedwarsPractice.mjs'),
      describe: (j) => `${j.template ?? 'a random layout'}, ${j.opponents} scripted squad${j.opponents > 1 ? 's' : ''}` });
    const results = await Promise.all(agents.map(async (player) => {
      const ws = workspaces[player.name];
      if (noAgents) { const r = check(ws); return { player, ws, ok: r.ok, check: r.text.trim().split('\n').at(-1), minutes: 0 }; }
      return { player, ws, ...(await prepare({ player, ws, agentDir: path.join(runDir, 'agents', player.name), minutes, log })) };
    }));
    // Practice games still under way finish before the bots are frozen (the agents' time is up; the games are not theirs).
    for (let i = 0; i < 600 && service && !service.idle(); i++) await new Promise((r) => setTimeout(r, 1000));
    service?.stop();
    // 2. Each bot frozen as it stands: what plays is this copy, not the workspace.
    state.bots = {};
    for (const r of results) {
      const to = path.join(botsDir, r.player.name);
      rmSync(to, { recursive: true, force: true });
      const audit = noAgents ? [] : auditTranscript(path.join(runDir, 'agents', r.player.name), { ws: r.ws, otherWorkspaces: Object.entries(workspaces).filter(([n]) => n !== r.player.name).map(([, w]) => w), runDir });
      if (r.ok) {
        cpSync(path.join(r.ws, 'bot'), to, { recursive: true });
        for (const f of ['plan.md', 'changes.md']) if (existsSync(path.join(r.ws, 'notes', f))) cpSync(path.join(r.ws, 'notes', f), path.join(to, `notes-${f}`));
        if (existsSync(path.join(r.ws, 'tests'))) cpSync(path.join(r.ws, 'tests'), path.join(to, 'agent-tests'), { recursive: true });
        if (existsSync(path.join(r.ws, 'practice'))) cpSync(path.join(r.ws, 'practice'), path.join(runDir, 'agents', r.player.name, 'practice'), { recursive: true, filter: (src) => !/[\\/]recording([\\/]|$)/.test(src) });
        state.bots[r.player.name] = { module: path.join(to, 'scriptedBot', 'scriptedBot.mjs'), check: r.check, minutes: r.minutes, baseline: false, audit };
      } else state.bots[r.player.name] = { module: null, check: r.check, minutes: r.minutes, baseline: true, audit };
      log(`${r.player.name}: ${r.ok ? `bot frozen (${r.check}; ${r.minutes} min)` : `the check fails (${r.check}): the scripted bot plays for it`}${audit.length ? `; AUDIT: ${audit.join('; ')}` : ''}`);
    }
    state.coded = true;
    save();
    if (flag('stop-after-coding')) { log('stopped after the coding, as asked (--stop-after-coding)'); return; }
  }

  // 3. The games: one on each layout of the progression, its seed drawn now; the teams turning by one each game.
  if (!state.maps) {
    state.maps = PROGRESSION.map((layout) => ({ teams: 5, layout, seed: Math.floor(Math.random() * 1e9), theme: THEME_IDS[Math.floor(Math.random() * THEME_IDS.length)] }));
    save();
    log(`the games' maps: ${state.maps.map((m) => `${m.layout}/${m.seed}`).join(', ')}`);
  }
  state.matches ??= [];
  const names = players.map((p) => p.name);
  const totals = Object.fromEntries(names.map((n) => [n, 0])), wins = Object.fromEntries(names.map((n) => [n, 0]));
  const tally = (m) => { for (const n of names) totals[n] += m.points?.[n] ?? 0; if (m.winner) wins[m.winner] += 1; };
  for (const m of state.matches) tally(m);
  for (let g = state.matches.length + 1; g <= state.maps.length; g++) {
    const folder = `round-${g}-bedwars`;
    const violations = [];
    const { order, specs } = squadsFor(players, g, { difficulty, bots: state.bots, referee: bedwarsReferee, violations });
    const map = state.maps[g - 1];
    const squads = order.map((p, ti) => ({ name: p.name, team: TEAMS[ti].id }));
    log(`${folder}: ${LAYOUT_TEMPLATES[map.layout].name} (${map.layout}, seed ${map.seed}); ${squads.map((s) => `${s.name} ${s.team}`).join(', ')}`);
    mkdirSync(path.join(runDir, folder), { recursive: true });
    writeFileSync(path.join(runDir, folder, 'map.json'), JSON.stringify({ ...map, name: LAYOUT_TEMPLATES[map.layout].name, squads }, null, 2));
    let result;
    try {
      result = await runBotMatch({ game: 'bedwars', bedwarsMode: 'fives', bedwarsLayout: map.layout, bedwarsSeed: map.seed, players: specs, outDir: path.join(runDir, folder),
        video: !flag('no-video'), port, difficulty, statusEveryTicks: 5, maxSeconds: timeLimit, log: (l) => appendFileSync(path.join(runDir, 'matches.log'), `${new Date().toISOString()} ${l}\n`) });
    } catch (err) { log(`${folder}: the game failed: ${err.message}; once more`); g--; await new Promise((r) => setTimeout(r, 15000)); if ((state.failures = (state.failures ?? 0) + 1) > 3) break; save(); continue; }
    const outs = teamOuts(path.join(runDir, folder));
    const { places, points, winner } = placeTeams({ squads, outs, winner: result.winner ?? null });
    writeFileSync(path.join(runDir, folder, 'referee.json'), JSON.stringify(violations, null, 2));
    const m = { round: g, game: 'bedwars', folder, map: { ...map, name: LAYOUT_TEMPLATES[map.layout].name }, squads, winner, winnerTeam: result.winner ?? null, endReason: result.endReason, seconds: result.seconds,
      outs, places, points, refereeNotes: violations.length, dropped: violations.filter((v) => v.dropped).length };
    tally(m);
    try { log(`${folder} film: ${JSON.stringify(exportFilm({ matchDir: path.join(runDir, folder), result, players: specs.map((s) => ({ name: s.name })), agentsDir: null, round: g, game: 'bedwars', scores: { ...totals } }))}`); } catch (err) { log(`${folder}: film export failed: ${err.message}`); }
    state.matches.push(m);
    save();
    log(`${folder}: ${winner ? `${winner} won` : `no winner (${result.endReason})`} after ${result.seconds} s; places ${Object.entries(places).sort((a, b) => a[1] - b[1]).map(([n, p]) => `${p}. ${n}`).join(', ')}; referee: ${violations.length} notes (${m.dropped} dropped)`);
  }

  // 4. The summary.
  const ranking = [...names].sort((a, b) => totals[b] - totals[a] || wins[b] - wins[a]);
  const top = ranking[0], tied = ranking.filter((n) => totals[n] === totals[top] && wins[n] === wins[top]);
  const summary = {
    run, mode: 'bedwars-arena', game: 'bedwars', format: 'fives', difficulty, timeLimit,
    mapsPlayed: state.maps.map((m) => ({ ...m, name: LAYOUT_TEMPLATES[m.layout].name })),
    players: players.map((p) => ({ name: p.name, harness: p.harness, model: p.model, effort: p.effort, bot: state.bots?.[p.name] ?? null })),
    rounds: state.matches.map(() => 'bedwars'), points: totals, wins, ranking, scores: totals,
    winner: tied.length === 1 ? top : null,
    matches: state.matches.map((m) => ({ ...m, result: m.winner ? `${m.winner} won (${m.endReason})` : `no winner (${m.endReason})` })),
  };
  writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
  log(`done: ${ranking.map((n) => `${n} ${totals[n]} pts (${wins[n]} wins)`).join(', ')}; ${summary.winner ? `${summary.winner} wins the series` : 'a shared first place'}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
