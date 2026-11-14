// The scripted arena: AI agents each write their own scripted bot, then the bots play SkyWars, every player in every
// game (a duel with two, a free-for-all with more).
//
//   1. The agents get the game's rules and a full copy of the scripted bot (agentArena/scriptedBot/ and the skills, view
//      and plans it is built on) to use as a reference or a starting point. --mode unseen (the default): no map; they
//      are told there will be one game a map, each map new and more complex than the last. --mode seen: one map, laid
//      out for them (map/), every game on it.
//   2. They change anything they see fit and test it as they like: their own tests (tests/, `node test.mjs`),
//      `node check.mjs` (loadable, within the game's limits), `node practice.mjs [template] [seed] [opponents]` (a real
//      game against 1-4 scripted bots, played by the arena: scriptedPractice.mjs). The agents work at the same time,
//      each in its own harness:
//        claude    Claude Code on the Claude subscription it is logged in with (no API key in its environment);
//        deepseek  Claude Code on DeepSeek's API (DEEPSEEK_API_KEY): the only one that codes on an API;
//        codex     the Codex CLI logged in with ChatGPT (no OpenAI key in its environment), in its workspace sandbox;
//        agy       Gemini in the Antigravity CLI on its Google account, gated by scriptedArenaGuard.mjs;
//        scripted  no agent: the unchanged scripted bot plays.
//   3. When all are done (or their time is up), each bot is frozen as it stands and the games begin: unseen, one game on
//      each map of --maps in order (drawn only now); the join order turned from game to game, a referee on every hit,
//      each game recorded for film (round-N-skywars/), every player placed by when it fell, and summary.json.
//
//   node agentArena/scriptedArena.mjs --players "Opus:claude:claude-opus-5-5:high,Sol:codex:gpt-6.1-sol:high,
//        Gemini:agy:gemini-3.8-flash-high:high,DeepSeek:deepseek:deepseek-flash:high,Scripted:scripted"
//        [--mode unseen] [--maps classic,sectors,archipelago,twin_peaks,tiers] [--difficulty hard] [--minutes 45]
//        [--practice 5] [--run <name>] [--port 3095] [--no-agents] [--games-only] [--no-video] [--smoke]
//        seen mode: [--mode seen] [--template twin_peaks] [--pack meadow] [--seed 1234] [--games 3]
// A player is Name:harness[:model[:effort]]. --smoke gives each agent one short real task in a fresh workspace (edit the
// bot, check it, write and run a test, play one practice game) and reports whether each step happened; no games.
// --no-agents skips the coding (every player plays the scripted bot: a dry run of everything else). --games-only plays
// the bots already frozen in runs/<run>/bots/. The film: agentArena/docs/scripted-arena.md.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, appendFileSync, existsSync, cpSync, readdirSync, createWriteStream, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import { runBotMatch } from './botMatch.mjs';
import { referee } from './referee.mjs';
import { exportFilm } from './filmExport.mjs';
import { servePractice } from './scriptedPractice.mjs';
import { GRANTS as AGY_GRANTS } from './scriptedArenaGuard.mjs';
import { deepseekKey } from './plans/deepseekClient.mjs';
import { buildArena, normalizeMap } from '../src/mods/skywars/arena.js';
import { TEMPLATES, TEMPLATE_IDS } from '../src/mods/skywars/templates.js';
import { packsFor } from '../src/mods/skywars/packs.js';
import { describeSkyWars } from '../src/mods/skywars/generalState.js';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const flag = (n) => args.includes(`--${n}`);
const repo = path.resolve(import.meta.dirname, '..');
const url = (rel) => pathToFileURL(path.join(repo, rel)).href;
const slash = (p) => p.replace(/\\/g, '/');
const rule = (p) => slash(p).replace(/^([A-Za-z]):/, (m, d) => `//${d.toLowerCase()}`);
const AGY = process.platform === 'win32' ? path.join(os.homedir(), 'AppData', 'Local', 'agy', 'bin', 'agy.exe') : 'agy';

/**
 * The maps of an unseen series, simplest first: one ring at one height; slices with shared side islands; connector
 * islands at four heights; no middle island but two peaks twelve blocks apart; a tower with a staircase and stepping
 * islands high and low.
 */
export const DEFAULT_SERIES_MAPS = Object.freeze(['classic', 'sectors', 'archipelago', 'twin_peaks', 'tiers']);

/** Each harness's name (and its aliases), its default model, and the file its agent reads its instructions from. */
export const HARNESSES = Object.freeze({ claude: 'claude', deepseek: 'deepseek', codex: 'codex', chatgpt: 'codex', agy: 'agy', gemini: 'agy', antigravity: 'agy', scripted: 'scripted', none: 'scripted' });
const DEFAULT_MODEL = { claude: 'claude-opus-5-5', deepseek: 'deepseek-flash', codex: 'gpt-6.1-sol', agy: 'gemini-3.8-flash-high', scripted: null };
export const INSTRUCTIONS = Object.freeze({ claude: 'CLAUDE.md', deepseek: 'CLAUDE.md', codex: 'AGENTS.md', agy: 'GEMINI.md' });

/** Name:harness[:model[:effort]]; a scripted player is Name:scripted. */
export function parsePlayers(spec) {
  const players = String(spec).split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [name, h = 'deepseek', model, effort = null] = s.split(':');
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,15}$/.test(name)) throw new Error(`a player's name: ${name}`);
    const harness = HARNESSES[h];
    if (!harness) throw new Error(`harness ${h}: one of ${[...new Set(Object.values(HARNESSES))].join(', ')}`);
    return { name, harness, model: harness === 'scripted' ? null : model || DEFAULT_MODEL[harness], effort: harness === 'scripted' ? null : effort };
  });
  if (new Set(players.map((p) => p.name.toLowerCase())).size !== players.length) throw new Error('two players with one name');
  return players;
}

// --- the map --------------------------------------------------------------------------------------------------------

/**
 * The map as the agents get it: map.json (every island, chest and spawn, and the round in the general state's words)
 * and map.md (the same in prose, with a top view and a height view).
 */
export function describeMap({ template, pack, seed }) {
  const map = normalizeMap({ template, pack, seed });
  const arena = buildArena(map);
  const spec = TEMPLATES[map.template];
  const general = describeSkyWars({ phase: 'playing', elapsed: 0, refills: 0, players: [] }, arena);
  const islands = arena.islands.map((i) => ({ role: i.role, slot: i.slot ?? null, x: i.x, y: i.y, z: i.z, radius: i.radius, surfaceY: i.y, cells: i.cells.length }));
  const chests = arena.chests.map((c) => ({ x: c.x, y: c.y, z: c.z, kind: c.kind, slot: c.slot ?? null }));
  const spawns = arena.spawns.map((s, slot) => (s ? { slot, x: s.x, y: s.y, z: s.z } : null)).filter(Boolean);
  const json = { map, name: spec?.name ?? map.template, description: spec?.description ?? '', source: spec?.source ?? '', bounds: arena.bounds, spawns, islands, chests, general };

  // A top view, one character a block: the topmost block's kind; and a height view: its y less 30 (+ above, - below).
  const top = new Map();
  for (const [k, id] of arena.blocks) {
    const [x, y, z] = k.split(',').map(Number);
    const key = `${x},${z}`;
    if (!top.has(key) || top.get(key).y < y) top.set(key, { y, id });
  }
  const chestAt = new Set(chests.map((c) => `${c.x},${c.z}`));
  const spawnAt = new Map(spawns.map((s) => [`${Math.floor(s.x)},${Math.floor(s.z)}`, s.slot]));
  const roleAt = new Map();
  for (const i of arena.islands) for (const [x, z] of i.cells) roleAt.set(`${x},${z}`, i.role);
  const { minX, maxX, minZ, maxZ } = arena.bounds;
  const rowsTop = [], rowsHeight = [];
  for (let z = minZ; z <= maxZ; z++) {
    let a = '', b = '';
    for (let x = minX; x <= maxX; x++) {
      const k = `${x},${z}`, t = top.get(k);
      if (!t) { a += ' '; b += ' '; continue; }
      const role = roleAt.get(k);
      a += spawnAt.has(k) ? String(spawnAt.get(k)) : chestAt.has(k) ? 'C' : role === 'center' ? 'M' : role === 'spawn' ? '#' : role ? 'm' : '+';
      const dy = t.y - 30;
      b += dy === 0 ? '0' : dy > 0 ? (dy > 9 ? '^' : String(dy)) : (dy < -9 ? 'v' : String.fromCharCode(96 + Math.min(9, -dy)));
    }
    rowsTop.push(`${String(z).padStart(4)} ${a.replace(/\s+$/, '')}`);
    rowsHeight.push(`${String(z).padStart(4)} ${b.replace(/\s+$/, '')}`);
  }
  const header = `     x from ${minX} (left) to ${maxX} (right); z from ${minZ} (top) to ${maxZ} (bottom); north is up (-z).`;
  const md = `# The map: ${json.name} (${map.template}, pack ${map.pack}, seed ${map.seed})

${json.description}

Source: ${json.source}

## Spawns (two players take slots 0 and 1: the first to join slot 0. The join order swaps between games, so plan for both)
${spawns.map((s) => `- slot ${s.slot}: (${s.x}, ${s.y}, ${s.z})`).join('\n')}

## Islands (surface y; 30 is the spawn islands' usual height)
${islands.map((i) => `- ${i.role}${i.slot !== null ? ` ${i.slot}` : ''}: centre (${i.x}, ${i.z}), surface y ${i.y}, radius ${i.radius}, ${i.cells} columns`).join('\n')}

## Chests (kind: island = a spawn island's own, center = the middle's best loot, mid = a connector or sub-middle)
${chests.map((c) => `- (${c.x}, ${c.y}, ${c.z}) ${c.kind}${c.slot !== null ? ` (slot ${c.slot})` : ''}`).join('\n')}

## Top view (one character per block column)
Digits 0-7: a player's spawn (its slot); C a chest; M the middle; # a spawn island; m a connector/sub-middle island;
+ a structure (bridge, tower); space: the void.
\`\`\`
${header}
${rowsTop.join('\n')}
\`\`\`

## Height view (the top block's y less 30)
0 level with the spawns; 1-9 that many above; a-i 1-9 below; ^ more than 9 above; v more than 9 below.
\`\`\`
${header}
${rowsHeight.join('\n')}
\`\`\`

## The same round in the general state's words (what your bot's view.objectives and view.places hold)
See map.json \`general\`: objectives (every chest, with its slot and ring) and places (spawns, the middle(s), the
other islands, with their heights).
`;
  return { map, arena, json, md };
}

// --- the agents' workspaces ------------------------------------------------------------------------------------------

/** Every file of the bot an agent starts from, and where it goes in the workspace (bot/ mirrors agentArena/). */
const BOT_FILES = [
  'scriptedBot/base.mjs', 'scriptedBot/scriptedBot.mjs', 'scriptedBot/skills.mjs', 'scriptedBot/playbooks/skywars.mjs',
  'scriptedBot/playbooks/bedwars.mjs', 'skills/skills.mjs', 'skills/view.mjs', 'plans/planRunner.mjs', 'plans/facts.mjs',
  'plans/thinker.mjs',
];
/** A bot file with its imports of the game (packages/, src/) pointing at the repository: the engine is not theirs. */
const botSource = (rel) => readFileSync(path.join(repo, 'agentArena', rel), 'utf8')
  .replace(/'(\.\.\/)+packages\//g, `'${url('packages')}/`).replace(/'(\.\.\/)+src\//g, `'${url('src')}/`);

/** check.mjs: the bot loads, keeps the game's limits, imports only the game, and plays 120 recorded rounds. */
function writeCheck(ws) {
  const allowed = [url('packages'), url('src')];
  writeFileSync(path.join(ws, 'check.mjs'), `// Checks bot/: it loads and exports what the arena runs; it keeps the game's limits (the difficulty's skills and
// pace, the walking and sprinting speeds, reach, recharge -- as the repository's scripted bot has them); it uses only the
// game's modules and its own files, and nothing outside the game; its playbook plays 120 recorded SkyWars rounds
// without failing. A bot that fails this does not play.
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
    if (spec === 'three' || spec.startsWith('node:') && ['node:events'].includes(spec)) continue;
    if (!ALLOWED.some((a) => spec.startsWith(a))) fail(f + ' imports ' + spec + ': only the game (packages/, src/ of the repository) and bot/ itself');
  }
  const code = src.replace(/\\/\\/.*$/gm, '').replace(/\\/\\*[\\s\\S]*?\\*\\//g, '');
  const bad = code.match(/\\brequire\\s*\\(|child_process|node:fs|node:net|node:http|\\bfetch\\s*\\(|\\bWebSocket\\b|\\bprocess\\.(env|exit|kill)|\\.ws\\b|sendPacket\\s*=|DIFFICULTY_PROFILES\\s*\\[[^\\]]*\\]\\s*=|Object\\.defineProperty\\s*\\(\\s*globalThis/);
  if (bad) fail(f + ' uses "' + bad[0] + '": a bot plays through its session and skills, within the game');
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
if (typeof Bot.PLAYBOOKS?.skywars !== 'function') fail('bot/scriptedBot/scriptedBot.mjs must export PLAYBOOKS with skywars');
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
  const bot = F.skywarsScenario(seed)(Bot.ScriptedBotSession);
  const view = V.buildView(bot);
  if (!view) continue;
  try {
    await Promise.race([Bot.PLAYBOOKS.skywars({ view, skills: Bot.createBotSkills(bot) }), new Promise((_, rej) => setTimeout(() => rej(new Error('a playbook tick took more than 5 s')), 5000))]);
    ran++;
  } catch (e) { fail('the SkyWars playbook failed on recorded round ' + seed + ': ' + (e.stack || e.message).slice(0, 600)); }
}
if (ran < 100) fail('too few recorded rounds ran: ' + ran);
console.log('CHECK PASSED (' + ran + ' recorded rounds played)');
process.exit(0);
`);
}

/** A command's arguments: its own, or (Gemini, whose commands run as exact lines) the ones the gate saved for it. */
const ARGS_FROM_GATE = (command) => `(() => { const own = process.argv.slice(2); if (own.length) return own; try { const a = JSON.parse(readFileSync('.agents/args.json', 'utf8')); return a.command === ${JSON.stringify(command)} && Date.now() - a.at < 60000 ? a.argv : []; } catch { return []; } })()`;

function writeCommands(ws, { practiceLimit, mapInfo }) {
  const unseen = !mapInfo;
  writeFileSync(path.join(ws, 'practice.mjs'), `// node practice.mjs ${unseen ? '[template] [seed] [opponents]' : '[opponents]'}   or   node practice.mjs result
// A practice game: your bot (bot/) against 1-4 unchanged scripted bots (opponents, 1 by default), with the referee,
// ${unseen ? 'on a SkyWars map: the template you name (ref/skywars-maps.js) or a random one, and the seed you give or a random one' : "on the arena's map"}.
// ${practiceLimit} practice games in all. The arena plays it and writes practice/<n>/ (summary.md, timeline.txt, chat.txt,
// referee.txt, map.txt, recording/). This waits up to 4 minutes for it; if it is still playing, \`node practice.mjs result\`
// waits again. Your bot must pass node check.mjs (the arena runs it before the game).
// (No child processes here or in test.mjs: a sandboxed agent's commands may not start one.)
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
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
  const req = ${unseen ? "{ template: a ?? null, seed: b ?? null, opponents: Number(c ?? 1) }" : `{ template: ${JSON.stringify(mapInfo?.map.template)}, pack: ${JSON.stringify(mapInfo?.map.pack)}, seed: ${mapInfo?.map.seed}, opponents: Number(a ?? 1) }`};
  id = 'p' + Date.now();
  writeFileSync(path.join(queue, id + '.json'), JSON.stringify({ ...req, at: Date.now() }));
  console.log('Practice requested (' + (req.template ?? 'a random map') + ', ' + req.opponents + ' scripted bot' + (req.opponents > 1 ? 's' : '') + '). Waiting for the arena to play it...');
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
// Node's --test takes files, not a folder: every *.test.mjs / *.test.js in tests/ (or the one named).
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
function instructionsText({ player, players, mapInfo, games, difficulty, practiceLimit, minutes, timeLimit = 480 }) {
  const unseen = !mapInfo;
  const others = players.filter((p) => p !== player);
  const MODEL_NAMES = { 'claude-opus-5-5': 'Claude Opus 5.5', 'gpt-6.1-sol': 'GPT-6.1 Sol', 'gemini-3.8-flash-high': 'Gemini 3.8 Flash', 'gemini-3.8-flash-medium': 'Gemini 3.8 Flash', 'deepseek-flash': 'DeepSeek V4.1 Flash' };
  const who = (p) => (p.harness === 'scripted' ? 'the unchanged scripted bot: no AI writes it' : `an AI agent, ${MODEL_NAMES[p.model] ?? p.model}, writing its own bot now as you write yours`);
  const field = others.map((p) => `${p.name} (${who(p)})`).join(', ');
  const fight = players.length > 2 ? `a free-for-all of all ${players.length} players: ${player.name} (you), ${field}. The last one standing wins the game; the others are placed by how long they last` : `a duel against ${field}`;
  const where = unseen
    ? `**${games} games of SkyWars**, at **${difficulty}** difficulty, **each on a different map, and the maps get more complex game
by game**: from one ring of islands at one height towards maps with connector and side islands, several heights, more
than one middle, towers and staircases. You do not see the maps now, and nobody will tell you which they are: your bot
learns each map when its game starts, from what it sees (\`view.places\`, \`view.objectives\`, the blocks around it). The
join order turns from game to game, so your bot plays from different spawns. **Write a bot that wins on any map.**`
    : `SkyWars on the map in \`map/\`, at **${difficulty}** difficulty, ${games} games, from different spawns (the join order turns).`;
  const codex = player.harness === 'codex' ? `\nYour commands run in a sandbox that lets you write only inside this folder; the arena plays your practice games for you.\n` : '';
  return `# The scripted arena: write the bot that wins ${unseen ? 'on maps you have not seen' : 'this game, on this map'}

You are ${player.name}. Each game is ${fight}. Every AI agent writes its own bot now; then the bots play
${where}

Each game lasts at most ${timeLimit / 60} minutes of play (\`view\` shows the time left); then everyone still standing shares the
place. Each game scores you by how many players you outlast (the winner outlasts them all). The bots play on their own: no AI
is asked anything during the games. Whatever wins is what you write now.
${players.length > 2 ? `
## ${players.length} players in every game
Every game has all ${players.length} bots in it at once, each against all the others: ${players.map((p) => p.name).join(', ')}. This is not a
duel, and the scripted bot was mostly tuned in duels. Think it through before you code: several opponents at once, some
of them fighting each other, attacks from more than one side, who to fight and when to stay away, the loot a fallen player
drops where it falls, the scoring (every player you outlast counts). Write in \`notes/plan.md\` how your bot will deal with
it, and test it: \`node practice.mjs <template> <seed> 4\` plays your bot against four scripted bots at once.
` : ''}
## What you have
- \`docs/skywars-rulebook.md\`: the game. \`docs/bots.md\`: how the bots work (read "The scripted bot").
  \`docs/scripted-bot-history.md\`: how the scripted bot was improved, game by game, and why.
${unseen ? '' : `- \`map/map.md\` and \`map/map.json\`: the map you will play on -- every island and its height, every chest and its kind, the
  spawns, a top view and a height view.
`}- \`bot/\`: **your bot, starting as a full copy of the scripted bot**. Use it as a reference or a starting point, and change
  anything you like -- strategy, new skills, fighting, movement, how it reads a map -- or rewrite it:
  - \`bot/scriptedBot/playbooks/skywars.mjs\`: what it does each tick (the strategy).
  - \`bot/scriptedBot/skills.mjs\`, \`bot/skills/skills.mjs\`: what it can do (add new skills here).
  - \`bot/scriptedBot/scriptedBot.mjs\`, \`bot/scriptedBot/base.mjs\`: how it fights, eats, bridges, aims, gets unstuck.
  - \`bot/skills/view.mjs\`: what a playbook sees. (\`bot/plans/\`: a planner the bot does not use here.)
- \`ref/\`: read-only references: \`guestPeer.js\` (the game client the bot runs on: movement, bridging, looting, physics),
  \`generalState.js\`, \`skywars-maps.js\` (how SkyWars maps are built${unseen ? ': the kinds of map the games are drawn from' : ''}), \`skywars-loot.js\` (what the chests hold).
- \`tests/\`: yours. Write any tests you want (\`.mjs\` files); they may import your bot and the game's modules -- \`check.mjs\`
  shows how, with the recorded-round fakes in the repository's \`tests/helpers/botFake.js\`.

## Rules (\`node check.mjs\` enforces them; a referee watches every game)
- The game's limits stay: the difficulty's skills and pace (\`BOT_SKILLS\`), walking and sprinting speeds, the brain's pace,
  the bridge pause, Minecraft Java's reach (3 blocks), weapon recharge and damage. The referee drops any hit beyond reach,
  faster than the recharge, harder than the weapon, or a critical or sprint hit the difficulty lacks.
- The bot imports only the game (the repository's \`packages/\` and \`src/\`) and its own files, and plays only through its
  session and skills: no network, files, processes, or changing the game itself.
- \`bot/scriptedBot/scriptedBot.mjs\` keeps exporting \`ScriptedBotSession\`, \`createBotSkills\` and \`PLAYBOOKS\`.
- Fair play: work only in this folder (and read the repository files your bot imports). Reading another player's folder
  or the arena's own records disqualifies your bot.
${codex}
## Commands (each on its own line, run in this folder)
- \`node check.mjs\`: run it after every change. A bot that fails it does not play (the scripted bot plays for you).
- \`node practice.mjs ${unseen ? '[template] [seed] [opponents]' : '[opponents]'}\`: a real game${unseen ? ' on a SkyWars map (a random one, or the template you name, e.g. `node practice.mjs tiers`)' : ' on this map'} against 1-4
  scripted bots (e.g. \`node practice.mjs ${unseen ? 'classic 7 4' : '4'}\` for a ${unseen ? '' : ''}five-player game). ${practiceLimit} in all; each takes a minute or
  two once its turn comes. It waits up to 4 minutes; if the game is still on, \`node practice.mjs result\` waits again.
  Read \`practice/<n>/\` afterwards. Give these commands a timeout of at least 5 minutes (300000 ms).
- \`node test.mjs [tests/<file>]\`: your own tests (all of tests/, or one file).

## Your task
1. Read the rule book and the bot${unseen ? ', and how maps are built' : ' and the map'}. Write \`notes/plan.md\`: ${unseen ? 'what changes from map to map (heights, middles,\n   chests, routes, dangers), what a bot must handle to win on all of them' : 'what this map rewards (heights, the chests, the routes,\n   the dangers)'}${players.length > 2 ? ', how to come out on top of a free-for-all,' : ''} and your strategy.
2. Change \`bot/\` to carry it out. Test it however you like; practise it${unseen ? ' on different maps' : ''}; improve it.
3. Finish with \`node check.mjs\` passing and \`notes/changes.md\` saying what you changed and why.
You have about ${minutes} minutes. Work inside this folder.
`;
}

function writeWorkspace({ ws, player, players, workspaces, mapInfo, games, difficulty, practiceLimit, minutes, runDir, timeLimit }) {
  const unseen = !mapInfo;
  for (const d of ['bot', 'docs', 'ref', 'notes', 'practice/queue', 'tests', ...(unseen ? [] : ['map'])]) mkdirSync(path.join(ws, d), { recursive: true });
  for (const rel of BOT_FILES) { const to = path.join(ws, 'bot', rel); mkdirSync(path.dirname(to), { recursive: true }); if (!existsSync(to)) writeFileSync(to, botSource(rel)); }
  for (const f of ['skywars-rulebook.md', 'bedwars-rulebook.md']) cpSync(path.join(repo, 'agentArena', 'docs', f), path.join(ws, 'docs', f));
  cpSync(path.join(repo, 'agentArena', 'bots', 'README.md'), path.join(ws, 'docs', 'bots.md'));
  cpSync(path.join(repo, 'agentArena', 'scriptedBot', 'notes', 'changes.md'), path.join(ws, 'docs', 'scripted-bot-history.md'));
  cpSync(path.join(repo, 'packages', 'blockyland-mcp', 'guestPeer.js'), path.join(ws, 'ref', 'guestPeer.js'));
  cpSync(path.join(repo, 'packages', 'blockyland-mcp', 'generalState.js'), path.join(ws, 'ref', 'generalState.js'));
  cpSync(path.join(repo, 'src', 'mods', 'skywars', 'templates.js'), path.join(ws, 'ref', 'skywars-maps.js'));
  cpSync(path.join(repo, 'src', 'mods', 'skywars', 'loot.js'), path.join(ws, 'ref', 'skywars-loot.js'));
  if (!unseen) {
    writeFileSync(path.join(ws, 'map', 'map.json'), JSON.stringify(mapInfo.json, null, 2));
    writeFileSync(path.join(ws, 'map', 'map.md'), mapInfo.md);
  }
  writeCheck(ws);
  writeCommands(ws, { practiceLimit, mapInfo });
  writeFileSync(path.join(ws, INSTRUCTIONS[player.harness]), instructionsText({ player, players, mapInfo, games, difficulty, practiceLimit, minutes, timeLimit }));
  const others = Object.entries(workspaces).filter(([n]) => n !== player.name).map(([, w]) => rule(w));
  if (player.harness === 'claude' || player.harness === 'deepseek') {
    mkdirSync(path.join(ws, '.claude'), { recursive: true });
    writeFileSync(path.join(ws, '.claude', 'settings.json'), JSON.stringify({
      permissions: { allow: claudeAllow(ws), deny: [`Read(${rule(repo)}/**)`, `Edit(${rule(repo)}/**)`, `Read(${rule(runDir)}/**)`, ...others.flatMap((o) => [`Read(${o}/**)`, `Edit(${o}/**)`]),
        `Edit(${rule(ws)}/.claude/**)`, ...['check.mjs', 'practice.mjs', 'test.mjs', 'refused.mjs'].map((f) => `Edit(${rule(ws)}/${f})`), `Edit(${rule(ws)}/ref/**)`, `Edit(${rule(ws)}/map/**)`, `Edit(${rule(ws)}/docs/**)`] },
    }, null, 2));
  }
  if (player.harness === 'agy') {
    mkdirSync(path.join(ws, '.agents'), { recursive: true });
    writeFileSync(path.join(ws, '.agents', 'hooks.json'), JSON.stringify({ 'arena-gate': { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: `node ${slash(path.join(repo, 'agentArena', 'scriptedArenaGuard.mjs'))}`, timeout: 15 }] }] } }, null, 2));
    writeFileSync(path.join(ws, '.agents', 'REFUSED.md'), "# Refused\n\nThat file or folder is outside your workspace, or it is one of the arena's own files (.agents/, check.mjs, practice.mjs, test.mjs). You can read and write only the files in your own folder. The only commands are node check.mjs, node practice.mjs and node test.mjs.\n");
  }
}

/** What Claude Code may do in a workspace: its files, the three commands (any arguments), the web. */
export const claudeAllow = (ws) => ['Bash(node check.mjs)', 'PowerShell(node check.mjs)', 'Bash(node practice.mjs)', 'PowerShell(node practice.mjs)', 'Bash(node practice.mjs:*)', 'PowerShell(node practice.mjs:*)',
  'Bash(node test.mjs)', 'PowerShell(node test.mjs)', 'Bash(node test.mjs:*)', 'PowerShell(node test.mjs:*)',
  `Read(${rule(ws)}/**)`, `Edit(${rule(ws)}/bot/**)`, `Write(${rule(ws)}/bot/**)`, `Edit(${rule(ws)}/notes/**)`, `Write(${rule(ws)}/notes/**)`, `Edit(${rule(ws)}/tests/**)`, `Write(${rule(ws)}/tests/**)`,
  `Glob(${rule(ws)}/**)`, `Grep(${rule(ws)}/**)`, 'WebSearch', 'WebFetch'];

// --- the agents: one turn of each harness -----------------------------------------------------------------------------

/** The environment without any Anthropic or OpenAI key: a subscription harness must not code on an API. */
function subscriptionEnv() {
  const env = { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
  for (const k of Object.keys(env)) if (/^(ANTHROPIC_|OPENAI_API_KEY$|OPENAI_KEY$|OPENAI_BASE_URL$|CODEX_API_KEY$|DEEPSEEK_API_KEY$|GEMINI_API_KEY$|GOOGLE_API_KEY$)/.test(k)) delete env[k];
  return env;
}

/**
 * One turn of an agent in its workspace: a new session, or (resume) the one it had. Saves the stream to
 * agentDir/turn-NN.jsonl; resolves with { code, tools, session }.
 */
export function agentTurn({ player, ws, prompt, session, resume, agentDir, minutes, log }) {
  mkdirSync(agentDir, { recursive: true });
  const turnNo = readdirSync(agentDir).filter((f) => /^turn-\d+\.jsonl$/.test(f)).length + 1;
  const transcript = path.join(agentDir, `turn-${String(turnNo).padStart(2, '0')}.jsonl`);
  const win = process.platform === 'win32';
  const env = subscriptionEnv();
  let command, cliArgs, stdin = prompt, viaShell = false;
  if (player.harness === 'claude' || player.harness === 'deepseek') {
    cliArgs = ['-p', ...(resume ? ['--resume', session] : ['--session-id', session]), '--model', player.model, ...(player.effort ? ['--effort', player.effort] : []),
      '--output-format', 'stream-json', '--verbose', '--settings', path.join(ws, '.claude', 'settings.json'), '--setting-sources', 'project',
      '--strict-mcp-config', '--permission-mode', 'dontAsk', '--allowedTools', ...claudeAllow(ws)];
    command = 'claude'; viaShell = win;
    if (player.harness === 'deepseek') {
      const key = deepseekKey();
      if (!key) throw new Error('DEEPSEEK_API_KEY is not set');
      Object.assign(env, { ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic', ANTHROPIC_API_KEY: key, ANTHROPIC_AUTH_TOKEN: key,
        ANTHROPIC_MODEL: player.model, ANTHROPIC_SMALL_FAST_MODEL: player.model, ANTHROPIC_DEFAULT_HAIKU_MODEL: player.model,
        ANTHROPIC_DEFAULT_SONNET_MODEL: player.model, ANTHROPIC_DEFAULT_OPUS_MODEL: player.model });
    }
  } else if (player.harness === 'codex') {
    // Codex logged in with ChatGPT: its own sandbox (writes only in the workspace, no network) and the web search tool.
    // The user's config is left out (its plugins -- a browser, computer use -- are not arena tools); Windows needs its
    // sandbox named, or the workspace is read-only and every command is refused.
    const common = ['--json', '--skip-git-repo-check', '--ignore-user-config', '-m', player.model, '-c', `model_reasoning_effort="${player.effort ?? 'high'}"`,
      '-c', 'sandbox_mode="workspace-write"', '-c', 'approval_policy="never"', ...(win ? ['-c', 'windows.sandbox="unelevated"'] : [])];
    cliArgs = ['--search', 'exec', ...(resume ? ['resume', ...common, session, '-'] : [...common, '-C', ws, '-'])];
    command = 'codex'; viaShell = win;
  } else if (player.harness === 'agy') {
    cliArgs = ['-p', prompt, '--model', player.model, ...(player.effort ? ['--effort', player.effort] : []), '--output-format', 'stream-json', '--disable-slash-commands',
      '--settings', JSON.stringify({ permissions: { allow: [...AGY_GRANTS, `write_file(${ws})`, `read_file(${ws})`] } }), ...(resume && session ? ['--conversation', session] : [])];
    command = AGY; stdin = null;
  } else throw new Error(`no agent for harness ${player.harness}`);
  const quoted = viaShell ? cliArgs.map((a) => `"${String(a).replace(/"/g, '""')}"`) : cliArgs;
  log(`${player.name}: turn ${turnNo} (${player.harness} ${player.model}${player.effort ? `, effort ${player.effort}` : ''}, at most ${Math.round(minutes)} min)`);
  return new Promise((resolve) => {
    const child = spawn(command, quoted, { cwd: ws, env, stdio: [stdin === null ? 'ignore' : 'pipe', 'pipe', 'pipe'], shell: viaShell, windowsHide: true });
    if (stdin !== null) { child.stdin.on('error', () => {}); child.stdin.end(stdin); }
    const out = createWriteStream(transcript);
    let tools = 0, sid = session;
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      out.write(`${JSON.stringify((() => { try { return { ...JSON.parse(line), _at: new Date().toISOString() }; } catch { return { type: 'raw', text: line, _at: new Date().toISOString() }; } })())}\n`);
      try {
        const j = JSON.parse(line);
        for (const b of j.message?.content ?? []) if (b.type === 'tool_use') tools++;
        if (j.type === 'item.completed' && /command_execution|file_change|web_search/.test(j.item?.type ?? '')) tools++;
        if (j.type === 'thread.started' && j.thread_id) sid = j.thread_id;
        // Antigravity: step_update events, each with the conversation's id; a tool step counts once, when done.
        const conv = j.conversation_id ?? j.init?.conversation_id ?? j.step_update?.conversation_id;
        if (player.harness === 'agy' && conv) sid = conv;
        if (player.harness === 'agy' && j.step_update?.step_type === 'tool' && j.step_update.state === 'DONE') tools++;
      } catch { /* not JSON */ }
    });
    child.stderr.on('data', (d) => appendFileSync(path.join(agentDir, 'stderr.log'), d));
    const timer = setTimeout(() => { log(`${player.name}: time is up; stopping the turn`); if (win) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F']); else child.kill(); }, Math.max(1, minutes) * 60e3);
    child.on('error', (err) => appendFileSync(path.join(agentDir, 'stderr.log'), `spawn failed: ${err.message}\n`));
    child.on('exit', (code) => { clearTimeout(timer); out.end(); log(`${player.name}: turn ${turnNo} ended (code ${code}; ${tools} tool calls)`); resolve({ code, tools, session: sid }); });
  });
}

export const check = (ws) => { const c = spawnSync(process.execPath, ['check.mjs'], { cwd: ws, encoding: 'utf8', timeout: 300000 }); return { ok: c.status === 0, text: `${c.stdout}${c.stderr}` }; };

/** An agent's whole preparation: the task, then (time allowing) one turn to fix a failing check. */
async function prepare({ player, ws, agentDir, minutes, log, unseen }) {
  const deadline = Date.now() + minutes * 60e3;
  mkdirSync(agentDir, { recursive: true });
  const t0 = Date.now();
  const first = await agentTurn({ player, ws, session: randomUUID(), resume: false, agentDir, minutes, log,
    prompt: unseen
      ? `Read ${INSTRUCTIONS[player.harness]} and follow it: study the rules, the bot and how SkyWars maps vary, write notes/plan.md, then make bot/ win games on maps you have not seen, getting more complex game by game. Write and run any tests you want (tests/, node test.mjs), run \`node check.mjs\` after every change, and \`node practice.mjs [template] [seed] [opponents]\` to test it in real games on different maps. Finish with the check passing and notes/changes.md written.`
      : `Read ${INSTRUCTIONS[player.harness]} and follow it: study the rules and the map, write notes/plan.md, then make bot/ win on this map. Run \`node check.mjs\` after every change and \`node practice.mjs\` to test it in a real game. Finish with the check passing and notes/changes.md written.` });
  writeFileSync(path.join(agentDir, 'session.txt'), String(first.session ?? ''));
  let r = check(ws);
  while (!r.ok && first.session && deadline - Date.now() > 3 * 60e3) {
    log(`${player.name}: the check fails; a turn to fix it`);
    await agentTurn({ player, ws, session: first.session, resume: true, agentDir, minutes: (deadline - Date.now()) / 60e3, log,
      prompt: `\`node check.mjs\` fails:\n\n${r.text.slice(-4000)}\n\nFix bot/ so it passes. Run \`node check.mjs\` until it does.` });
    r = check(ws);
    if (!r.ok) break;
  }
  return { ok: r.ok, check: r.text.trim().split('\n').at(-1), minutes: +((Date.now() - t0) / 60e3).toFixed(1) };
}

/**
 * Fair play, after the fact: every path an agent's transcript names that is outside its own workspace and the
 * repository files a bot may read -- another player's workspace, the arena's records (runs/). Codex's sandbox cannot
 * stop reads, so this is how a read would be found.
 */
export function auditTranscript(agentDir, { ws, otherWorkspaces, runDir }) {
  const text = existsSync(agentDir) ? readdirSync(agentDir).filter((f) => f.endsWith('.jsonl')).map((f) => readFileSync(path.join(agentDir, f), 'utf8')).join('\n') : '';
  const norm = (p) => slash(p).toLowerCase();
  const hay = text.replace(/\\\\/g, '/').replace(/\\/g, '/').toLowerCase();
  const found = [];
  for (const o of otherWorkspaces) if (hay.includes(norm(o))) found.push(`another player's folder: ${o}`);
  // The run's own folder by its full path (a document that names agentArena/runs/... is not a read of the records).
  if (hay.includes(norm(runDir))) found.push(`the arena's records: ${runDir}`);
  return found;
}

// --- the smoke test: can every harness work in its workspace? ----------------------------------------------------------

const SMOKE_PROMPT = (p) => `This is a short setup test of your tools, not the real task. Read ${INSTRUCTIONS[p.harness]} only for the commands. Then do exactly this, in order, and stop:
1. In bot/scriptedBot/playbooks/skywars.mjs add the line \`// smoke: ${p.name} was here\` at the very top.
2. Run \`node check.mjs\` and make sure it passes.
3. Write tests/smoke.test.mjs: a node:test test that imports ./../bot/scriptedBot/scriptedBot.mjs and asserts PLAYBOOKS.skywars is a function. Run \`node test.mjs\`.
4. Run \`node practice.mjs classic 7 1\` (one practice game; if it says it is still playing, run \`node practice.mjs result\` until it gives the result).
5. Write notes/smoke.md with one line per step: done or not, and what the command printed last.`;

async function smoke({ players, run, difficulty, minutes, port, log }) {
  const agents = players.filter((p) => p.harness !== 'scripted');
  const root = path.join(os.homedir(), 'blockyland-arena', `smoke-${randomBytes(4).toString('hex')}`);
  const runDir = path.join(repo, 'agentArena', 'runs', run);
  const workspaces = Object.fromEntries(agents.map((p) => [p.name, path.join(root, p.name)]));
  for (const p of agents) writeWorkspace({ ws: workspaces[p.name], player: p, players, workspaces, mapInfo: null, games: 5, difficulty, practiceLimit: 2, minutes, runDir });
  const service = servePractice({ workspaces: agents.map((p) => ({ name: p.name, ws: workspaces[p.name] })), limit: 2, difficulty, concurrency: 2, portBase: port + 100, log });
  const results = await Promise.all(agents.map(async (p) => {
    const ws = workspaces[p.name], agentDir = path.join(runDir, 'agents', p.name);
    const t0 = Date.now();
    const turn = await agentTurn({ player: p, ws, prompt: SMOKE_PROMPT(p), session: randomUUID(), resume: false, agentDir, minutes, log });
    const edited = readFileSync(path.join(ws, 'bot', 'scriptedBot', 'playbooks', 'skywars.mjs'), 'utf8').includes(`smoke: ${p.name} was here`);
    const checked = check(ws).ok;
    const tested = existsSync(path.join(ws, 'tests', 'smoke.test.mjs')) && spawnSync(process.execPath, ['test.mjs'], { cwd: ws, encoding: 'utf8' }).status === 0;
    const practised = existsSync(path.join(ws, 'practice', '1', 'summary.md'));
    const notes = existsSync(path.join(ws, 'notes', 'smoke.md'));
    const audit = auditTranscript(agentDir, { ws, otherWorkspaces: Object.entries(workspaces).filter(([n]) => n !== p.name).map(([, w]) => w), runDir });
    return { name: p.name, harness: p.harness, model: p.model, effort: p.effort, exit: turn.code, tools: turn.tools, minutes: +((Date.now() - t0) / 60e3).toFixed(1), edited, checked, tested, practised, notes, audit, ws };
  }));
  for (let i = 0; i < 300 && !service.idle(); i++) await new Promise((r) => setTimeout(r, 1000));
  service.stop();
  writeFileSync(path.join(runDir, 'smoke.json'), JSON.stringify(results, null, 2));
  for (const r of results) log(`SMOKE ${r.name} (${r.harness} ${r.model} ${r.effort ?? ''}): exit ${r.exit}, ${r.tools} tool calls, ${r.minutes} min | edited ${r.edited ? 'yes' : 'NO'} | check ${r.checked ? 'passes' : 'FAILS'} | test ${r.tested ? 'passes' : 'NO'} | practice ${r.practised ? 'played' : 'NO'} | notes ${r.notes ? 'yes' : 'NO'}${r.audit.length ? ` | AUDIT: ${r.audit.join('; ')}` : ''}`);
  return results;
}

// --- the games: placing every player -----------------------------------------------------------------------------------

/**
 * Where each player finished: the winner first, then the others by how long they lasted (the last to fall second...);
 * players still standing when time ran out share a place. Points: the players each one outlasted.
 */
export function placeGame({ names, deaths, winner }) {
  const fallAt = new Map();
  for (const d of deaths) if (names.includes(d.who) && !fallAt.has(d.who)) fallAt.set(d.who, d.t);
  const standing = names.filter((n) => !fallAt.has(n));
  const fallen = names.filter((n) => fallAt.has(n)).sort((a, b) => fallAt.get(b) - fallAt.get(a));
  const groups = [...(winner ? [[winner], standing.filter((n) => n !== winner)] : [standing]), ...fallen.map((n) => [n])].filter((g) => g.length);
  const places = {}, points = {};
  let place = 1, below = names.length;
  for (const g of groups) { below -= g.length; for (const n of g) { places[n] = place; points[n] = below; } place += g.length; }
  return { places, points };
}

/** Deaths in a recorded game, in order, from its chat (the line every player's screen shows). */
function deathsOf(matchDir, names) {
  const f = path.join(matchDir, 'recording', 'chat.jsonl');
  if (!existsSync(f)) return [];
  const out = [];
  for (const l of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
    let c; try { c = JSON.parse(l); } catch { continue; }
    const who = names.find((n) => c.text?.startsWith(`${n} `) && /void|slain|killed|died|fell|knocked|shot|blew|burn|drown/i.test(c.text));
    if (who && !out.some((d) => d.who === who)) out.push({ who, t: c.t, text: c.text });
  }
  return out;
}

// --- the arena ---------------------------------------------------------------------------------------------------------

async function main() {
  const players = parsePlayers(opt('players', 'DS-Low:deepseek:deepseek-flash:low,DS-Max:deepseek:deepseek-flash:max'));
  if (players.length < 2 || players.length > 8) throw new Error('2 to 8 players');
  const difficulty = opt('difficulty', 'hard');
  const mode = opt('mode', 'unseen');
  if (!['unseen', 'seen'].includes(mode)) throw new Error('--mode unseen or seen');
  const unseen = mode === 'unseen';
  const mapList = String(opt('maps', DEFAULT_SERIES_MAPS.join(','))).split(',').map((s) => s.trim()).filter(Boolean);
  for (const t of mapList) if (!TEMPLATE_IDS.includes(t)) throw new Error(`no SkyWars map ${t}: ${TEMPLATE_IDS.join(', ')}`);
  // A game's time limit (--time-limit, minutes): then those standing share the place. The bots' clocks show it (botMatch).
  const timeLimit = Math.round(Number(opt('time-limit', 8)) * 60);
  const minutes = Number(opt('minutes', 45)), games = unseen ? mapList.length : Number(opt('games', 3)), practiceLimit = Number(opt('practice', unseen ? 5 : 3)), port = Number(opt('port', 3095));
  const noAgents = flag('no-agents');
  const run = opt('run', `${players.map((p) => p.name.toLowerCase()).join('-vs-').slice(0, 60)}-${new Date().toISOString().slice(5, 16).replace(/[-:T]/g, '')}`);
  const runDir = path.join(repo, 'agentArena', 'runs', run);
  mkdirSync(runDir, { recursive: true });
  const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); appendFileSync(path.join(runDir, 'arena.log'), `${l}\n`); };
  if (flag('smoke')) { await smoke({ players, run, difficulty, minutes: Number(opt('minutes', 15)), port, log }); return; }
  const statePath = path.join(runDir, 'state.json');
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
  const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
  const agents = players.filter((p) => p.harness !== 'scripted');

  // 1. The map: in seen mode, drawn (or given) now and shown to the agents; unseen, the games' maps are drawn only once
  // the bots are frozen (step 4), so nothing an agent runs can find them.
  const drawMap = (template) => normalizeMap({ template, pack: packsFor(template)[Math.floor(Math.random() * packsFor(template).length)].id, seed: Math.floor(Math.random() * 1e9) });
  let mapInfo = null;
  if (!unseen) {
    if (!state.map) {
      const template = opt('template', null) ?? TEMPLATE_IDS[Math.floor(Math.random() * TEMPLATE_IDS.length)];
      const pack = opt('pack', null) ?? packsFor(template)[Math.floor(Math.random() * packsFor(template).length)].id;
      const seed = Number(opt('seed', Math.floor(Math.random() * 1e9)));
      state.map = normalizeMap({ template, pack, seed });
      save();
    }
    mapInfo = describeMap(state.map);
    mkdirSync(path.join(runDir, 'map'), { recursive: true });
    writeFileSync(path.join(runDir, 'map', 'map.json'), JSON.stringify(mapInfo.json, null, 2));
    writeFileSync(path.join(runDir, 'map', 'map.md'), mapInfo.md);
  }
  log(`scripted arena ${run}: ${players.map((p) => (p.harness === 'scripted' ? `${p.name} (the scripted bot)` : `${p.name} (${p.harness} ${p.model}${p.effort ? ` ${p.effort}` : ''})`)).join(', ')}; SkyWars at ${difficulty}; ${unseen ? `${games} games on maps the agents do not see, simplest first: ${mapList.join(', ')}` : `${games} games on ${mapInfo.json.name} (${JSON.stringify(state.map)})`}; ${noAgents ? 'no agents (every player plays the scripted bot)' : `${minutes} min to code, ${practiceLimit} practice games each`}`);

  // 2. The agents write their bots, side by side, each in a workspace of its own whose path says nothing of the run or the
  // player (Codex's sandbox does not stop reads: an unguessable path, and the audit after, do).
  const botsDir = path.join(runDir, 'bots');
  state.workspaces ??= Object.fromEntries(agents.map((p) => [p.name, path.join(os.homedir(), 'blockyland-arena', randomBytes(6).toString('hex'), 'work')]));
  save();
  if (!state.coded && !flag('games-only')) {
    const workspaces = state.workspaces;
    for (const p of agents) writeWorkspace({ ws: workspaces[p.name], player: p, players, workspaces, mapInfo, games, difficulty, practiceLimit, minutes, runDir, timeLimit });
    const service = noAgents ? null : servePractice({ workspaces: agents.map((p) => ({ name: p.name, ws: workspaces[p.name] })), limit: practiceLimit, difficulty, timeLimit, concurrency: 2, portBase: port + 100, log });
    const results = await Promise.all(agents.map(async (player) => {
      const ws = workspaces[player.name];
      if (noAgents) { const r = check(ws); return { player, ws, ok: r.ok, check: r.text.trim().split('\n').at(-1), minutes: 0 }; }
      const prep = await prepare({ player, ws, agentDir: path.join(runDir, 'agents', player.name), minutes, log, unseen });
      return { player, ws, ...prep };
    }));
    service?.stop();
    // 3. Each bot frozen as it stands: what plays is this copy, not the workspace.
    state.bots = {};
    for (const r of results) {
      const to = path.join(botsDir, r.player.name);
      rmSync(to, { recursive: true, force: true });
      const audit = noAgents ? [] : auditTranscript(path.join(runDir, 'agents', r.player.name), { ws: r.ws, otherWorkspaces: Object.entries(workspaces).filter(([n]) => n !== r.player.name).map(([, w]) => w), runDir });
      if (r.ok) {
        cpSync(path.join(r.ws, 'bot'), to, { recursive: true });
        for (const f of ['plan.md', 'changes.md']) if (existsSync(path.join(r.ws, 'notes', f))) cpSync(path.join(r.ws, 'notes', f), path.join(to, `notes-${f}`));
        if (existsSync(path.join(r.ws, 'tests'))) cpSync(path.join(r.ws, 'tests'), path.join(to, 'agent-tests'), { recursive: true });
        state.bots[r.player.name] = { module: path.join(to, 'scriptedBot', 'scriptedBot.mjs'), check: r.check, minutes: r.minutes, baseline: false, audit };
      } else state.bots[r.player.name] = { module: null, check: r.check, minutes: r.minutes, baseline: true, audit };
      log(`${r.player.name}: ${r.ok ? `bot frozen (${r.check}; ${r.minutes} min)` : `the check fails (${r.check}): the scripted bot plays for it`}${audit.length ? `; AUDIT: ${audit.join('; ')}` : ''}`);
    }
    state.coded = true;
    save();
  }

  // 4. The games: every player in every game, the join order turned by one each game.
  state.matches ??= [];
  if (unseen && !state.maps) { state.maps = mapList.map(drawMap); save(); log(`the games' maps: ${state.maps.map((m) => `${m.template}/${m.pack}/${m.seed}`).join(', ')}`); }
  const mapOf = (g) => (unseen ? state.maps[g - 1] : state.map);
  const names = players.map((p) => p.name);
  const totals = Object.fromEntries(names.map((n) => [n, 0])), wins = Object.fromEntries(names.map((n) => [n, 0]));
  const tally = (m) => { for (const n of names) totals[n] += m.points?.[n] ?? 0; if (m.winner) wins[m.winner] += 1; };
  for (const m of state.matches) tally(m);
  for (let g = state.matches.length + 1; g <= games; g++) {
    const folder = `round-${g}-skywars`;
    const k = (g - 1) % players.length;
    const order = [...players.slice(k), ...players.slice(0, k)];
    const violations = [];
    const specs = order.map((p) => {
      const bot = state.bots?.[p.name];
      return { name: p.name, scripted: difficulty, ...(bot?.module ? { sessionModule: bot.module } : {}), onSession: referee(p.name, violations) };
    });
    const map = mapOf(g), about = describeMap(map);
    log(`${folder}: join order ${order.map((p) => p.name).join(', ')}; the map: ${about.json.name} (${map.template}, pack ${map.pack}, seed ${map.seed})`);
    mkdirSync(path.join(runDir, folder), { recursive: true });
    writeFileSync(path.join(runDir, folder, 'map.md'), about.md);
    writeFileSync(path.join(runDir, folder, 'map.json'), JSON.stringify(about.json, null, 2));
    let result;
    try {
      result = await runBotMatch({ game: 'skywars', players: specs, outDir: path.join(runDir, folder), video: !flag('no-video'), port, difficulty, statusEveryTicks: 5, maxSeconds: timeLimit,
        skywarsTemplate: map.template, skywarsPack: map.pack, skywarsSeed: map.seed, log: (l) => appendFileSync(path.join(runDir, 'matches.log'), `${new Date().toISOString()} ${l}\n`) });
    } catch (err) { log(`${folder}: the game failed: ${err.message}; once more`); g--; await new Promise((r) => setTimeout(r, 15000)); if ((state.failures = (state.failures ?? 0) + 1) > 3) break; save(); continue; }
    const winner = result.winnerName ?? null;
    const deaths = deathsOf(path.join(runDir, folder), names);
    const { places, points } = placeGame({ names, deaths, winner });
    writeFileSync(path.join(runDir, folder, 'referee.json'), JSON.stringify(violations, null, 2));
    const m = { round: g, game: 'skywars', folder, map: { ...map, name: about.json.name }, joinOrder: order.map((p) => p.name), joinsFirst: order[0].name, winner, endReason: result.endReason, seconds: result.seconds,
      deaths, places, points, refereeNotes: violations.length, dropped: violations.filter((v) => v.dropped).length };
    tally(m);
    try { log(`${folder} film: ${JSON.stringify(exportFilm({ matchDir: path.join(runDir, folder), result, players: order, agentsDir: null, round: g, game: 'skywars', scores: { ...totals } }))}`); } catch (err) { log(`${folder}: film export failed: ${err.message}`); }
    state.matches.push(m);
    save();
    log(`${folder}: ${winner ? `${winner} won` : `no winner (${result.endReason})`} after ${result.seconds} s; places ${Object.entries(places).sort((a, b) => a[1] - b[1]).map(([n, p]) => `${p}. ${n}`).join(', ')}; referee: ${violations.length} notes`);
  }

  // 5. The summary the film tools read.
  const ranking = [...names].sort((a, b) => totals[b] - totals[a] || wins[b] - wins[a]);
  const top = ranking[0], tied = ranking.filter((n) => totals[n] === totals[top] && wins[n] === wins[top]);
  const summary = {
    run, mode: 'scripted-arena', maps: unseen ? 'unseen' : 'seen', game: 'skywars', difficulty,
    ...(unseen ? { mapsPlayed: (state.maps ?? []).map((m) => ({ ...m, name: TEMPLATES[m.template]?.name ?? m.template })) } : { map: { ...state.map, name: mapInfo.json.name } }),
    players: players.map((p) => ({ name: p.name, harness: p.harness, model: p.model, effort: p.effort, bot: state.bots?.[p.name] ?? null })),
    rounds: state.matches.map(() => 'skywars'), points: totals, wins, ranking,
    // Two players: the win/loss score the duel films read (+1 a win, -1 a loss).
    scores: players.length === 2 ? Object.fromEntries(names.map((n) => [n, state.matches.reduce((s, m) => s + (m.winner === n ? 1 : m.winner ? -1 : 0), 0)])) : totals,
    winner: tied.length === 1 ? top : null,
    matches: state.matches.map((m) => ({ ...m, result: m.winner ? `${m.winner} won (${m.endReason})` : `no winner (${m.endReason})` })),
  };
  writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
  log(`done: ${ranking.map((n) => `${n} ${totals[n]} pts (${wins[n]} wins)`).join(', ')}; ${summary.winner ? `${summary.winner} wins the series` : 'a shared first place'}. Film data: node scripts/arena-series-film-data.mjs agentArena/runs/${run} public/cinema-arena-duel/${run}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
