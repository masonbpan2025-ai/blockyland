#!/usr/bin/env node
// The Agent Arena: AI agents (Claude Code sessions) research and prepare strategies, practise, then their strategies
// play rounds of SkyWars or Bed Wars against each other in the real game, while the agents watch, review each round and
// improve. agentArena/docs/running.md explains how to run it; agentArena/docs/agent-rules.md is what the agents read.
//
//   node agentArena/run.mjs --run haiku-3rounds \
//     --players "HaikuMedium:haiku:medium,HaikuMax:haiku:max" --rounds skywars,skywars,skywars \
//     [--prep-minutes 10] [--prep-max-minutes 60] [--review-minutes 4] [--review-max-minutes 20] [--final-max-minutes 20]
//     [--no-agents] [--no-ready-gate] [--match-seconds N] [--headed] [--warm-start <earlier run>]
//     [--bedwars-layout standard|offset|flanks|highmid|stepping|compact|random]
//
// - Round 1 starts 2 minutes after both agents pass `arena ready` (web research, a plan, `arena check`, practice),
//   not before --prep-minutes and at the latest --prep-max-minutes after the start.
// - --warm-start <run> (a run's name under agentArena/runs/, or its folder): every agent gets that earlier series' whole
//   record in previous/<run>/ in its workspace (warmStart.mjs) -- results, replays, every player's logs and code,
//   notes and interviews -- to study before it researches, designs and practises.
// - Before round 1 each agent may practise for 120 s of play in all (`arena practice`): against a dummy, a copy of its
//   own strategy or any strategy file it wrote, from any setup it writes. Practice games run one at a time.
// - After each round each agent gets its private review (review/round-N/ in its workspace) and is interviewed at once,
//   with that review in the question: what went well, what went badly and why, what it will change
//   (agents/<name>/interview-round-N.md, and notes/interview-round-N.md for the agent; interviews.mjs). Then it writes
//   notes/review-round-N.md and improves; the next round starts 2 minutes after both are ready again, not before
//   --review-minutes and at the latest --review-max-minutes after the round ended.
// - After the last round each agent reviews it, looks back over the whole series in notes/final-reflection.md and makes
//   a final edit of every strategy (`arena ready` checks it); the final interview follows once both are done, at the
//   latest --final-max-minutes (default 20) after the last round ended.
// - Time limits: SkyWars 5 minutes, Bed Wars 10 (botMatch.mjs MATCH_CAPS); no winner by then is a tie.
//   Scoring: win +1, tie 0, loss -1; the highest total wins the series.
//
// Writes agentArena/runs/<run>/: round-N-<game>/ (recording/, video/, versions/, result.json, film.json), agents/<name>/
// (session transcripts with arrival times, strategy drafts, interview), practice/, status/, workspaces/, film/series.json,
// arena.log, memory.log and summary.json.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  mkdirSync, writeFileSync, readFileSync, appendFileSync, existsSync, copyFileSync, cpSync, createWriteStream, statSync, readdirSync, unlinkSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { runBotMatch, MATCH_CAPS } from './botMatch.mjs';
import { runPractice, savePractice } from './practice.mjs';
import { countWebCalls, practiceUsed, RESEARCH, PRACTICE_SECONDS } from './readiness.mjs';
import { writeRoundReview } from './roundReview.mjs';
import { exportFilm, agentTimeline } from './filmExport.mjs';
import { GRANTS as AGY_GRANTS } from './agyGuard.mjs';
import { roundInterviewPrompt, finalInterviewPrompt, interviewAnswer, interviewMarkdown } from './interviews.mjs';
import { resolveRun, copyWarmStart } from './warmStart.mjs';
import { LAYOUT_TEMPLATES, LAYOUT_IDS } from '../src/mods/bedwars/layouts.js';
import { TEMPLATE_IDS } from '../src/mods/skywars/templates.js';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const flag = (n) => args.includes(`--${n}`);
const repo = path.resolve(import.meta.dirname, '..');
const run = opt('run', `arena-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`);
const rounds = (opt('rounds', null) ?? opt('games', 'skywars,skywars,skywars')).split(',').map((g) => g.trim()).filter(Boolean);
for (const g of rounds) if (!MATCH_CAPS[g]) throw new Error(`unknown game ${g}`);
const games = [...new Set(rounds)];
const focus = opt('focus', opt('prompt-extra', null));
// A warm start: one or more earlier series for every agent to study first (warmStart.mjs). Checked now, before anything starts.
const warmSpecs = opt('warm-start', null) ? opt('warm-start').split(',').map((s) => s.trim()).filter(Boolean) : [];
const warmFromList = warmSpecs.map((spec) => ({ dir: resolveRun(spec, path.join(import.meta.dirname, 'runs')), name: path.basename(spec) }));
const warmName = warmFromList.map((w) => w.name).join(',');
// Bed Wars rounds: one layout (src/mods/bedwars/layouts.js), or a layout drawn afresh for each round. Every round's seed
// lays its layout out anew either way.
const bedwarsLayout = opt('bedwars-layout', 'standard');
const DUEL_LAYOUTS = LAYOUT_IDS.filter((id) => LAYOUT_TEMPLATES[id].teams.includes(2));
if (bedwarsLayout !== 'random' && !DUEL_LAYOUTS.includes(bedwarsLayout)) throw new Error(`--bedwars-layout: ${bedwarsLayout} is not one of ${DUEL_LAYOUTS.join(', ')}, random`);
// SkyWars rounds: one template (src/mods/skywars/templates.js), or a template drawn afresh for each round.
const skywarsTemplate = opt('skywars-template', opt('skywars-map', opt('map', 'classic')));
const skywarsPack = opt('skywars-pack', opt('pack', null));
if (skywarsTemplate !== 'random' && !TEMPLATE_IDS.includes(skywarsTemplate)) throw new Error(`--skywars-template: ${skywarsTemplate} is not one of ${TEMPLATE_IDS.join(', ')}, random`);
// A player is Name:harness:model[:effort] (harness: claude, deepseek, or agy for Gemini in the Antigravity CLI), or the
// older Name:model:effort, which runs in Claude Code.
const HARNESSES = { claude: 'claude', deepseek: 'deepseek', agy: 'agy', gemini: 'agy', antigravity: 'agy' };
const players = opt('players', 'HaikuMedium:haiku:medium,HaikuMax:haiku:max').split(',').map((s) => {
  const parts = s.split(':');
  const name = parts[0];
  if (!/^[A-Za-z][A-Za-z0-9_]{1,23}$/.test(name)) throw new Error(`bad player name ${name}`);
  if (HARNESSES[parts[1]]) {
    const harness = HARNESSES[parts[1]];
    const model = parts[2] ?? { claude: 'haiku', deepseek: 'deepseek-flash', agy: 'gemini-3.8-flash-medium' }[harness];
    return { name, harness, model, effort: parts[3] ?? null };
  }
  return { name, harness: 'claude', model: parts[1] ?? 'haiku', effort: parts[2] ?? 'medium' };
});
const AGY = process.platform === 'win32' ? path.join(os.homedir(), 'AppData', 'Local', 'agy', 'bin', 'agy.exe') : 'agy';
/** DeepSeek's key: from this process, or from the user's environment (setx) when this process started before it was set. */
function deepseekKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  if (process.platform !== 'win32') return null;
  try { return spawnSync('powershell', ['-NoProfile', '-Command', "[Environment]::GetEnvironmentVariable('DEEPSEEK_API_KEY','User')"]).stdout.toString().trim() || null; } catch { return null; }
}
const instructionsFile = (p) => (p.harness === 'agy' ? 'GEMINI.md' : 'CLAUDE.md');
if (players.length !== 2) throw new Error('the arena is a duel: give two players');
const prepMinutes = Number(opt('prep-minutes', 10));
const prepMaxMinutes = Math.max(prepMinutes, Number(opt('prep-max-minutes', 60)));
const reviewMinutes = Number(opt('review-minutes', opt('break-minutes', 4)));
const reviewMaxMinutes = Math.max(reviewMinutes, Number(opt('review-max-minutes', 20)));
const finalMaxMinutes = Number(opt('final-max-minutes', 20));
const noAgents = flag('no-agents');
const readyGate = !flag('no-ready-gate') && !noAgents;
/** For test runs: cut every round short. */
const matchSeconds = Number(opt('match-seconds', 0)) || undefined;
/** A practice game takes about 1.5 GB; start one only when that still leaves about 1 GB free. */
const PRACTICE_MIN_FREE_MB = 2600;
const freeMB = () => Math.round(os.freemem() / 2 ** 20);
const runDir = path.join(repo, 'agentArena', 'runs', run);
const statusDir = path.join(runDir, 'status');
const wsRoot = path.join(os.homedir(), 'blockyland-arena', run);
for (const d of [runDir, statusDir, wsRoot]) mkdirSync(d, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => { const line = `${new Date().toISOString()} ${msg}`; console.log(line); appendFileSync(path.join(runDir, 'arena.log'), `${line}\n`); };
const slash = (p) => p.replaceAll('\\', '/');
const rule = (p) => slash(p).replace(/^([A-Za-z]):/, (m, d) => `//${d.toLowerCase()}`);
const GAME_NAME = { skywars: 'SkyWars', bedwars: 'Bed Wars' };
const limitSeconds = (g) => matchSeconds ?? MATCH_CAPS[g];

// ---------- the schedule ----------
const T0 = Date.now();
const schedule = {
  run, startedAt: new Date(T0).toISOString(), prepEndsAt: new Date(T0 + prepMinutes * 60e3).toISOString(), over: false, ready: {},
  players: players.map((p) => ({ name: p.name, harness: p.harness, model: p.model, effort: p.effort })),
  warmStart: warmName,
  scores: Object.fromEntries(players.map((p) => [p.name, 0])),
  practiceSeconds: PRACTICE_SECONDS.budget,
  matches: rounds.map((game, i) => ({
    // The referee hosts every match; who joins first (and so takes island 0, or Red) alternates between rounds.
    round: i + 1, game, limitSeconds: limitSeconds(game), host: 'Referee', joinsFirst: players[i % players.length].name,
    waitingForReady: readyGate, latestStart: i === 0 && readyGate ? new Date(T0 + prepMaxMinutes * 60e3).toISOString() : null,
    startsAt: i === 0 ? new Date(T0 + (readyGate ? prepMaxMinutes : prepMinutes) * 60e3).toISOString() : null,
    startedAt: null, endedAt: null, result: null, winner: null,
  })),
};
const saveSchedule = () => writeFileSync(path.join(statusDir, 'schedule.json'), JSON.stringify(schedule, null, 2));
saveSchedule();
const roundsText = () => schedule.matches.map((m) => `- Round ${m.round}: ${GAME_NAME[m.game]} (strategies/${m.game}.js), time limit ${Math.round(m.limitSeconds / 60)} minutes.`).join('\n');
const scheduleText = () => [
  readyGate
    ? `- Preparation: from ${schedule.startedAt}. Round 1 starts 2 minutes after both players pass \`arena ready\`, not before ${schedule.prepEndsAt} and at the latest ${schedule.matches[0].latestStart}.`
    : `- Preparation: from ${schedule.startedAt} until ${schedule.prepEndsAt}.`,
  roundsText(),
  `- Between rounds: review the round and improve (at least ${reviewMinutes} minutes, at most ${reviewMaxMinutes}); the next round starts 2 minutes after both players pass \`arena ready\` again.`,
].join('\n');

// ---------- the agents' workspaces ----------
/** The one command an agent may run, from either shell Claude Code offers it (Bash, or PowerShell on Windows). */
const SHELL_RULES = ['Bash(arena:*)', 'Bash(./arena:*)', 'PowerShell(arena:*)', 'PowerShell(./arena:*)', 'PowerShell(.\\arena:*)', 'PowerShell(arena.cmd:*)'];

function makeWorkspace(p) {
  const ws = path.join(wsRoot, p.name);
  for (const d of ['docs', 'strategies', 'notes', 'practice', 'review', '.claude']) mkdirSync(path.join(ws, d), { recursive: true });
  const opponent = players.filter((o) => o !== p).map((o) => o.name).join(', ');
  const template = readFileSync(path.join(repo, 'agentArena', 'workspace', 'CLAUDE.template.md'), 'utf8');
  let text = template.replaceAll('{{NAME}}', p.name).replaceAll('{{OPPONENT}}', opponent)
    .replaceAll('{{ROUNDS}}', String(rounds.length)).replaceAll('{{GAMES}}', games.map((g) => GAME_NAME[g]).join(' and ')).replaceAll('{{SCHEDULE}}', scheduleText());
  if (focus) {
    text += `\n## Updated Guidelines & Advanced Tactical Focus\n\nGuidelines update: You are specifically encouraged to look up and study advanced SkyWars strategies that you haven't used yet in the search stage:\n- ${focus}\n\nSearch on the web for how competitive SkyWars players use these advanced tactics in the game. Think carefully about how to use them in your strategy and document what you learned from previous rounds and the search in \`notes/research.md\` and \`notes/plan-${games[0]}.md\`.\n`;
  }
  if (p.harness === 'agy') {
    // Antigravity: the same instructions, as GEMINI.md, and the arena's gate on every tool call (agyGuard.mjs).
    mkdirSync(path.join(ws, '.agents'), { recursive: true });
    writeFileSync(path.join(ws, 'GEMINI.md'), `${text}\n## In this CLI\n\nThe only shell command is \`arena <command>\` (\`arena status\`, \`arena practice skywars 30 --vs self\`...), on its own: any other command line is replaced by \`arena refused\`, which says so. List, read and write files with your file tools, inside this folder only (a file outside it reads as a refusal note). The browser and other tools are not available. Search the web and read pages with your web tools.\n`);
    writeFileSync(path.join(ws, '.agents', 'hooks.json'), JSON.stringify({ 'arena-gate': { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: `node ${slash(path.join(repo, 'agentArena', 'agyGuard.mjs'))}`, timeout: 15 }] }] } }, null, 2));
    writeFileSync(path.join(ws, '.agents', 'REFUSED.md'), "# Refused\n\nThat file or folder is outside your workspace, or it is one of the arena's own files (.agents/, arena, arena.cmd). You can read and write only the files in your own folder. The only shell command is `arena`.\n");
  } else writeFileSync(path.join(ws, 'CLAUDE.md'), text);
  for (const f of ['agent-rules.md', 'strategy-api.md', 'skywars-rulebook.md', 'bedwars-rulebook.md']) copyFileSync(path.join(repo, 'agentArena', 'docs', f), path.join(ws, 'docs', f));
  for (const g of games) { const f = path.join(ws, 'strategies', `${g}.js`); if (!existsSync(f)) copyFileSync(path.join(repo, 'agentArena', 'workspace', 'starter.js'), f); }
  copyFileSync(path.join(repo, 'agentArena', 'workspace', 'setup-example.json'), path.join(ws, 'practice', 'setup-example.json'));
  const cli = slash(path.join(repo, 'agentArena', 'cli.mjs'));
  writeFileSync(path.join(ws, 'arena'), `#!/bin/sh\nexec node "${cli}" "$@"\n`);
  writeFileSync(path.join(ws, 'arena.cmd'), `@node "${cli}" %*\r\n`);
  const others = players.filter((o) => o !== p).map((o) => rule(path.join(wsRoot, o.name)));
  // Edit rules cover every file-writing tool, so the denials are Read and Edit.
  writeFileSync(path.join(ws, '.claude', 'settings.json'), JSON.stringify({
    permissions: {
      allow: [...SHELL_RULES, `Read(${rule(ws)}/**)`, `Edit(${rule(ws)}/**)`, 'WebSearch', 'WebFetch'],
      deny: [`Read(${rule(repo)}/**)`, `Edit(${rule(repo)}/**)`, `Edit(${rule(ws)}/.claude/**)`, `Edit(${rule(ws)}/arena)`, `Edit(${rule(ws)}/arena.cmd)`,
        ...others.flatMap((o) => [`Read(${o}/**)`, `Edit(${o}/**)`])],
    },
  }, null, 2));
  return ws;
}
const workspaces = Object.fromEntries(players.map((p) => [p.name, makeWorkspace(p)]));
if (warmFromList.length) {
  for (const { dir, name } of warmFromList) {
    for (const p of players) {
      const w = copyWarmStart(dir, workspaces[p.name]);
      if (p === players[0]) log(`warm start: ${name} (${w.rounds} rounds, agents ${w.agents.join(', ')}, ${w.files} files) copied to previous/${name}/ in every workspace`);
    }
  }
}

// ---------- the agents ----------
const running = new Map();
// Agents paused for an interview: their loop starts no turn until the interview is done (one session, one turn at a time).
const onHold = new Set();
let arenaOver = false;
const webCalls = (p) => countWebCalls(path.join(runDir, 'agents', p.name));
const SHELL_HINT = 'Run `arena` as a command of its own (for example `arena status`), never after cd or &&: your folder is already the working directory.';
const scoreText = () => Object.entries(schedule.scores).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ');
const KICKOFF = (p) => {
  const g = rounds[0];
  const when = readyGate
    ? `Round 1 (${GAME_NAME[g]}) starts 2 minutes after both players pass \`arena ready\` (not before ${schedule.prepEndsAt}, at the latest ${schedule.matches[0].latestStart}). Before it you must: research on the web (search, and read pages) and write notes/research.md with what you learned and your sources; design your strategy in notes/plan-${g}.md; write strategies/${g}.js and pass \`arena check\`; and practise (\`arena practice\`: ${PRACTICE_SECONDS.budget} seconds of play in all, against a dummy, a copy of yourself or any strategy you write, from any setup you write). Then run \`arena ready\`.`
    : `Round 1 starts at ${schedule.matches[0].startsAt}.`;
  const warm = warmFromList.length
    ? ` WARM START: previous/ holds the complete records of earlier series: ${warmFromList.map((w) => `previous/${w.name}/`).join(', ')}. In particular, study previous/gemini-vs-deepseek-sw6/ (played on the Citadel map), including its results, replays, strategy versions, and agent interviews/reviews. Analyze what succeeded, what failed (e.g. Citadel's 2-block elevation rise and spawn castle obstacles), and build upon what worked. Then go beyond it: search the web for advanced competitive SkyWars strategies that you haven't used yet in the search stage, and integrate them into your plan. Document what you learned from previous games (especially sw6) and the search in notes/research.md and notes/plan-${g}.md.`
    : '';
  const focusPrompt = focus ? ` UPDATED GUIDELINES & ADVANCED TACTICAL FOCUS: You are specifically encouraged to look up more advanced SkyWars strategies that you haven't used yet in the search stage: ${focus}. Search on the web for how competitive players use these techniques, think carefully about how to use them in the game, and document what you learned from previous rounds and the search in notes/research.md and notes/plan-${g}.md.` : '';
  return `You are ${p.name}. Read ${instructionsFile(p)} now: it has the rounds, the scoring, the rules and your tools. It is ${new Date().toISOString()}.${warm}${focusPrompt} There are ${rounds.length} rounds: win +1, tie 0, loss -1; the higher total wins. A SkyWars round lasts at most 5 minutes of play and a Bed Wars round 10: no winner by then is a tie (your program reads bot.arena.time, bot.arena.timeLimit and bot.arena.timeLeft). ${when} ${SHELL_HINT} Keep improving your strategies until the arena is over. Your only goal is to win.`;
};
const statusLine = () => {
  const cur = schedule.matches.find((m) => m.startedAt && !m.endedAt);
  const next = schedule.matches.find((m) => !m.startedAt);
  const done = schedule.matches.filter((m) => m.endedAt).map((m) => `round ${m.round} (${m.game}): ${m.result}`).join('; ');
  return `It is ${new Date().toISOString()}. ${cur ? `Round ${cur.round} (${cur.game}) is being played now (since ${cur.startedAt}).` : ''} ${done ? `Finished: ${done}. Score: ${scoreText()}.` : ''} ${next && !cur ? `Next: round ${next.round} (${next.game}).` : ''}`.replace(/\s+/g, ' ').trim();
};
const CONTINUE = (p) => {
  const next = schedule.matches.find((m) => !m.startedAt);
  const cur = schedule.matches.find((m) => m.startedAt && !m.endedAt);
  let todo = '';
  if (schedule.final && !schedule.final.done?.[p.name]) {
    const last = schedule.matches.at(-1).round;
    todo = `All rounds are played. Before the final interview (at the latest ${schedule.final.latest}): review round ${last} (\`arena review ${last}\`, review/round-${last}/ with its replay.txt; start from notes/interview-round-${last}.md) and write notes/review-round-${last}.md; then look back over the whole series -- every round's review, replay and interview -- and write notes/final-reflection.md: what you did well and badly across the rounds, which changes helped and which did not and how you know, and what you learned; then make your final edit of ${[...new Set(schedule.matches.map((m) => `strategies/${m.game}.js`))].join(' and ')} with everything the series taught you. Then \`arena ready\`, which checks all of it.`;
  } else if (!cur && next?.waitingForReady && !schedule.ready[`${p.name}-round-${next.round}`]) {
    todo = next.round === 1
      ? `You are not ready for round 1 yet: run \`arena ready\` to see what is left (you have searched or read the web ${webCalls(p)} times; at least ${RESEARCH.minWebCalls} are needed). Practice time used: ${practiceUsed(statusDir, p.name)} of ${PRACTICE_SECONDS.budget} s.`
      : `Review round ${next.round - 1}: start from what you said in your interview right after it (notes/interview-round-${next.round - 1}.md), then \`arena review ${next.round - 1}\` (and the files in review/round-${next.round - 1}/). Think about what worked and what did not. Then search the web for advanced strategies and tactics you have not used yet in this series (what strong players do in the situations the round showed, and what would beat what the other player did), and try to build at least one new one into round ${next.round}. Improve strategies/${next.game}.js, and write notes/review-round-${next.round - 1}.md: what worked, what did not, your reasoning, the new tactics you found (with sources) and which you are trying, and the changes you made. Then \`arena ready\`.`;
    todo += ` The round waits for both players, at the latest until ${next.latestStart}.`;
  }
  return `Arena update: ${statusLine()} ${schedule.final ? 'The rounds are over; the final reflection is open.' : 'The arena is not over.'} ${todo} ${SHELL_HINT} During a round, watch it (\`arena status\`, \`arena log\`) and improve your strategy. Your only goal is to win.`.replace(/\s+/g, ' ');
};

function killTree(p) {
  if (!p?.pid) return;
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
  else p.kill('SIGTERM');
}

/**
 * One `claude -p` turn in the agent's workspace: a new session, or a resumed one. Each line of the session's stream is
 * saved with `_at`, when it arrived, so the film can place the agent's words on the match clock.
 */
function agentTurn(p, prompt, opts) { return p.harness === 'agy' ? agyTurn(p, prompt, opts) : claudeTurn(p, prompt, opts); }

/** Save a session's stream line by line with `_at`, when each arrived; resolves with the exit code. */
function streamTurn(p, child, transcript, onLine = () => {}) {
  return new Promise((resolve) => {
    const out = createWriteStream(transcript, { flags: 'a' });
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      const at = new Date().toISOString();
      let j = null;
      try { j = JSON.parse(line); } catch { /* raw */ }
      out.write(`${JSON.stringify(j ? { ...j, _at: at } : { type: 'raw', text: line, _at: at })}\n`);
      if (j) onLine(j);
    });
    child.stderr.on('data', (d) => appendFileSync(path.join(path.dirname(transcript), 'stderr.log'), d));
    running.set(p.name, child);
    child.on('exit', (code) => { running.delete(p.name); out.end(); resolve(code); });
    child.on('error', () => { running.delete(p.name); out.end(); resolve(-1); });
  });
}

/**
 * One Antigravity CLI turn (Gemini): headless, in the agent's workspace, its tools gated by the workspace's hook
 * (agyGuard.mjs) and its shell granted only the exact `arena` command lines. The conversation's id, from the first
 * turn's stream, resumes it.
 */
function agyTurn(p, prompt, { session, resume, transcript, onSession = () => {} }) {
  const ws = workspaces[p.name];
  const args = ['-p', prompt, '--model', p.model, '--output-format', 'stream-json', '--disable-slash-commands',
    // The CLI asks before writing even inside the workspace: grant the folder (the hook keeps .agents/ and the shims safe).
    '--settings', JSON.stringify({ permissions: { allow: [...AGY_GRANTS, `write_file(${ws})`, `read_file(${ws})`] } }), ...(resume && session ? ['--conversation', session] : [])];
  const env = { ...process.env, ARENA_PLAYER: p.name, ARENA_STATUS: statusDir, PATH: `${ws}${path.delimiter}${process.env.PATH}` };
  const child = spawn(AGY, args, { cwd: ws, env, stdio: ['ignore', 'pipe', 'pipe'] });
  return streamTurn(p, child, transcript, (j) => { const id = j.conversation_id ?? j.init?.conversation_id; if (j.event === 'init' && id) onSession(id); });
}

function claudeTurn(p, prompt, { session, resume, transcript, extra = [] }) {
  const ws = workspaces[p.name];
  // Permissions: "don't ask" refuses every tool not allowed here. The allow rules are given on the command line because
  // Claude Code ignores a new folder's own allow rules until someone trusts the folder by hand; the deny rules in the
  // folder's settings (the repository, the other agent's folder, the settings and the shim) apply either way.
  const own = rule(ws);
  const allowed = [...SHELL_RULES, `Read(${own}/**)`, `Edit(${own}/**)`, `Write(${own}/**)`, `Glob(${own}/**)`, `Grep(${own}/**)`, 'WebSearch', 'WebFetch'];
  // The prompt goes in on stdin, not as an argument: cmd.exe (below) ends a command at the first line break, which cut a
  // many-line prompt (an interview with its review report) and every argument after it, --resume included.
  const cliArgs = ['-p', ...(resume ? ['--resume', session] : ['--session-id', session]),
    '--model', p.model, ...(p.effort ? ['--effort', p.effort] : []), '--output-format', 'stream-json', '--verbose',
    '--settings', path.join(ws, '.claude', 'settings.json'), '--setting-sources', 'project', '--strict-mcp-config',
    '--permission-mode', 'dontAsk', '--allowedTools', ...allowed, ...extra];
  const env = { ...process.env, ARENA_PLAYER: p.name, ARENA_STATUS: statusDir, PATH: `${ws}${path.delimiter}${process.env.PATH}` };
  if (p.harness === 'deepseek') {
    // Claude Code on DeepSeek's Anthropic-compatible API (api-docs.deepseek.com/guides/anthropic_api): the key only here.
    const key = deepseekKey();
    if (!key) throw new Error('DEEPSEEK_API_KEY is not set');
    Object.assign(env, {
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic', ANTHROPIC_API_KEY: key, ANTHROPIC_AUTH_TOKEN: key,
      ANTHROPIC_MODEL: p.model, ANTHROPIC_SMALL_FAST_MODEL: p.model, ANTHROPIC_DEFAULT_HAIKU_MODEL: p.model,
      ANTHROPIC_DEFAULT_SONNET_MODEL: p.model, ANTHROPIC_DEFAULT_OPUS_MODEL: p.model, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    });
  }
  const win = process.platform === 'win32';
  // On Windows `claude` is a .cmd shim, which only a shell can start; quote every argument for cmd.exe.
  const quoted = win ? cliArgs.map((a) => `"${String(a).replace(/"/g, '""')}"`) : cliArgs;
  const child = spawn('claude', quoted, { cwd: ws, env, stdio: ['pipe', 'pipe', 'pipe'], shell: win });
  child.stdin.on('error', () => { /* a turn that fails at once has closed its input */ });
  child.stdin.end(prompt);
  return streamTurn(p, child, transcript);
}

/** Whether a turn's transcript ends on the account's usage limit (the agents run on the operator's account). */
function hitUsageLimit(transcript) {
  try { return /usage_limit_reached|hit your .*limit|RESOURCE_EXHAUSTED|quota exceeded|exceeded your current quota|Insufficient Balance|"status":\s*402|rate limit/i.test(readFileSync(transcript, 'utf8').slice(-4000)); } catch { return false; }
}

async function agentLoop(p) {
  const dir = path.join(runDir, 'agents', p.name);
  mkdirSync(dir, { recursive: true });
  // Claude Code takes the session id we choose; Antigravity names its conversation, which the first turn reports.
  let session = p.harness === 'agy' ? null : randomUUID();
  if (session) writeFileSync(path.join(dir, 'session.txt'), session);
  const onSession = (id) => { if (!session) { session = id; writeFileSync(path.join(dir, 'session.txt'), id); } };
  let quickFails = 0, quickEnds = 0;
  for (let n = 1; !arenaOver; n++) {
    while (onHold.has(p.name) && !arenaOver) await sleep(1e3);
    if (arenaOver) break;
    const t = Date.now();
    const transcript = path.join(dir, `turn-${String(n).padStart(3, '0')}.jsonl`);
    log(`${p.name}: ${n === 1 ? 'starting' : 'resuming'} session (turn ${n})`);
    const code = await agentTurn(p, n === 1 || !session ? KICKOFF(p) : CONTINUE(p), { session, resume: n > 1 && !!session, transcript, onSession });
    const secs = (Date.now() - t) / 1000;
    const limited = code !== 0 && hitUsageLimit(transcript);
    log(`${p.name}: turn ${n} ended (code ${code}${limited ? ', USAGE LIMIT REACHED' : ''}) after ${secs.toFixed(0)} s`);
    if (arenaOver) break;
    quickFails = code !== 0 && secs < 30 ? quickFails + 1 : 0;
    // An agent with nothing left to do ends its turns at once (ready, waiting for the other): each resume costs a
    // request, so wait longer each time, up to 2 minutes, until a turn takes real work again.
    quickEnds = code === 0 && secs < 30 ? quickEnds + 1 : 0;
    // Turns that end at once with an error are failing (a usage limit, a network error): back off.
    await sleep(limited ? 300e3 : quickFails >= 2 ? 60e3 : Math.min(120e3, 8e3 * 2 ** Math.max(0, quickEnds - 1)));
  }
}

/** Keep every saved draft of each strategy file, for the film: agents/<name>/drafts/<time>-<game>.js */
const lastDraft = new Map();
function snapshotDrafts() {
  for (const p of players) {
    for (const g of games) {
      const f = path.join(workspaces[p.name], 'strategies', `${g}.js`);
      try {
        const st = statSync(f);
        const key = `${p.name}/${g}`;
        if (lastDraft.get(key) === st.mtimeMs) continue;
        lastDraft.set(key, st.mtimeMs);
        const d = path.join(runDir, 'agents', p.name, 'drafts');
        mkdirSync(d, { recursive: true });
        copyFileSync(f, path.join(d, `${new Date(st.mtimeMs).toISOString().replace(/[:.]/g, '-')}-${g}.js`));
      } catch { /* not there yet */ }
    }
  }
}

// ---------- practice games ----------
// `arena practice` leaves a request in status/practice-queue/<name>.json; they are played one at a time, on their own
// port, before round 1, each agent within its practice time. Reports go to status/practice/ (arena practice result),
// the games to practice/.
let practiceOpen = true, practiceRunning = null, practiceCount = 0;
let practiceClosedWhy = null;
const practiceQueue = [];
const queueDir = path.join(statusDir, 'practice-queue');
function savePracticeState() {
  writeFileSync(path.join(statusDir, 'practice-state.json'), JSON.stringify({
    running: practiceRunning?.name ?? null, startedAt: practiceRunning?.at ?? null, queue: practiceQueue.map((r) => r.name),
    closed: practiceOpen ? null : practiceClosedWhy, freeMB: freeMB(),
  }, null, 2));
}
async function practiceService() {
  mkdirSync(queueDir, { recursive: true });
  let lastMemNote = 0;
  while (!arenaOver) {
    for (const f of readdirSync(queueDir)) {
      const name = f.replace(/\.json$/, '');
      try {
        const req = JSON.parse(readFileSync(path.join(queueDir, f), 'utf8'));
        unlinkSync(path.join(queueDir, f));
        const ws = workspaces[name];
        if (!ws || !practiceOpen || !games.includes(req.game)) continue;
        // An opponent file must be the agent's own.
        if (req.vs !== 'dummy' && req.vs !== 'self' && !path.resolve(req.vs).startsWith(ws + path.sep)) { log(`${name}: practice refused (opponent outside the workspace)`); continue; }
        const at = practiceQueue.findIndex((r) => r.name === name);
        if (at >= 0) practiceQueue[at] = { name, ...req }; else practiceQueue.push({ name, ...req });
        log(`${name}: practice ${req.game} queued (${req.seconds} s against ${req.vs === 'dummy' || req.vs === 'self' ? req.vs : path.basename(req.vs)}${req.setup ? ', with a setup' : ''})`);
      } catch { /* being written: next time */ }
    }
    savePracticeState();
    if (!practiceOpen || !practiceQueue.length) { await sleep(2e3); continue; }
    if (freeMB() < PRACTICE_MIN_FREE_MB) {
      if (Date.now() - lastMemNote > 60e3) { lastMemNote = Date.now(); log(`practice waits for memory: ${freeMB()} MB free, a practice game needs ${PRACTICE_MIN_FREE_MB}`); }
      await sleep(5e3);
      continue;
    }
    const req = practiceQueue.shift();
    const left = PRACTICE_SECONDS.budget - practiceUsed(statusDir, req.name);
    if (left < PRACTICE_SECONDS.min) { log(`${req.name}: practice refused (practice time used up)`); continue; }
    const seconds = Math.min(left, req.seconds);
    practiceRunning = { ...req, at: new Date().toISOString() };
    savePracticeState();
    const n = ++practiceCount;
    const outDir = path.join(runDir, 'practice', `${req.name}-${req.game}-${String(n).padStart(3, '0')}`);
    mkdirSync(outDir, { recursive: true });
    const mine = path.join(workspaces[req.name], 'strategies', `${req.game}.js`);
    // "self": a copy of the strategy as it is when the game starts, so the agent's own edits change only its side.
    let opponentFile = null;
    if (req.vs === 'self') { opponentFile = path.join(outDir, `self-${req.game}.js`); copyFileSync(mine, opponentFile); }
    else if (req.vs !== 'dummy') { opponentFile = path.join(outDir, `opponent-${path.basename(req.vs)}`); copyFileSync(req.vs, opponentFile); }
    log(`${req.name}: practice ${req.game} #${n} starts (${seconds} s; ${freeMB()} MB free)`);
    try {
      const rep = await runPractice({ game: req.game, name: req.name, strategyFile: mine, opponentFile, setup: req.setup ?? null, outDir, statusDir, seconds, port: 3061, log });
      savePractice(statusDir, req.name, req.game, n, rep);
      log(`${req.name}: practice #${n} done: ${JSON.stringify(rep.summary)}`);
    } catch (err) {
      log(`${req.name}: practice #${n} failed: ${err.stack ?? err}`);
      savePractice(statusDir, req.name, req.game, n, { text: `PRACTICE FAILED (an arena problem, not your strategy; no practice time was charged): ${err.message}. Queue it again with arena practice.`, summary: { game: req.game, failed: true, loaded: false, errorTicks: 0, played: 0 } });
    }
    practiceRunning = null;
    savePracticeState();
  }
}

/** With the ready gate: wait until both players pass `arena ready` (or the latest start), then start in 2 minutes. */
async function waitForPlayers(i) {
  const m = schedule.matches[i];
  const earliest = i === 0 ? T0 + prepMinutes * 60e3 : Date.now() + reviewMinutes * 60e3;
  const latest = i === 0 ? Date.parse(m.latestStart) : Date.now() + reviewMaxMinutes * 60e3;
  Object.assign(m, { waitingForReady: true, latestStart: new Date(latest).toISOString(), startsAt: new Date(latest).toISOString() });
  saveSchedule();
  for (;;) {
    for (const p of players) {
      const key = `${p.name}-round-${m.round}`;
      // `arena ready` leaves the flag after its checks; the web research is counted here, from the transcripts.
      const ok = existsSync(path.join(statusDir, 'ready', `${key}.json`)) && (m.round > 1 || webCalls(p) >= RESEARCH.minWebCalls);
      if (ok !== !!schedule.ready[key]) log(`${p.name}: ${ok ? 'ready' : 'no longer ready'} for round ${m.round}`);
      schedule.ready[key] = ok ? (schedule.ready[key] ?? new Date().toISOString()) : null;
    }
    saveSchedule();
    const all = players.every((p) => schedule.ready[`${p.name}-round-${m.round}`]);
    if ((all && Date.now() >= earliest) || Date.now() >= latest) {
      log(all ? `both players are ready for round ${m.round}` : `round ${m.round}: latest start reached; ready: ${players.filter((p) => schedule.ready[`${p.name}-round-${m.round}`]).map((p) => p.name).join(', ') || 'nobody'}`);
      break;
    }
    await sleep(5e3);
  }
  Object.assign(m, { waitingForReady: false, startsAt: new Date(Date.now() + 120e3).toISOString() });
  saveSchedule();
}

// ---------- the rounds ----------
function scoreRound(result) {
  if (result.winnerName && schedule.scores[result.winnerName] !== undefined) {
    for (const p of players) schedule.scores[p.name] += p.name === result.winnerName ? 1 : -1;
  }
}

/** The film's record of the whole series: rounds, scores, the agents' notes and interviews (film/series.json). */
function writeSeriesFilm() {
  const dir = path.join(runDir, 'film');
  mkdirSync(dir, { recursive: true });
  const note = (p, f) => { const file = path.join(workspaces[p.name], 'notes', f); return existsSync(file) ? readFileSync(file, 'utf8') : null; };
  writeFileSync(path.join(dir, 'series.json'), JSON.stringify({
    run, players: schedule.players, scores: schedule.scores, winner: seriesWinner(),
    // Each agent's whole session on the wall clock (research, design, practice, reviews), for the story around the rounds.
    timeline: noAgents ? {} : Object.fromEntries(players.map((p) => [p.name, agentTimeline(path.join(runDir, 'agents', p.name))])),
    rounds: schedule.matches.map((m) => ({ round: m.round, game: m.game, host: m.host, joinsFirst: m.joinsFirst, limitSeconds: m.limitSeconds, startedAt: m.startedAt, endedAt: m.endedAt, result: m.result, winner: m.winner, scoresAfter: m.scoresAfter ?? null, folder: m.folder ?? null, layout: m.layout ?? null })),
    notes: Object.fromEntries(players.map((p) => [p.name, {
      research: note(p, 'research.md'), plans: Object.fromEntries(games.map((g) => [g, note(p, `plan-${g}.md`)])),
      reviews: Object.fromEntries(schedule.matches.map((m) => [m.round, note(p, `review-round-${m.round}.md`)])),
      // The look back over the whole series, written after the last round.
      final: note(p, 'final-reflection.md'),
    }])),
    interviews: Object.fromEntries(players.map((p) => { const f = path.join(runDir, 'agents', p.name, 'interview.md'); return [p.name, existsSync(f) ? readFileSync(f, 'utf8') : null]; })),
    // Each agent's reflection right after each round (interviews.mjs).
    roundInterviews: Object.fromEntries(players.map((p) => [p.name, Object.fromEntries(schedule.matches.map((m) => { const f = path.join(runDir, 'agents', p.name, `interview-round-${m.round}.md`); return [m.round, existsSync(f) ? readFileSync(f, 'utf8') : null]; }))])),
    practice: existsSync(path.join(statusDir, 'practice')) ? readdirSync(path.join(statusDir, 'practice')).filter((f) => f.endsWith('.json')).map((f) => ({ game: f.replace(/\.json$/, ''), ...JSON.parse(readFileSync(path.join(statusDir, 'practice', f), 'utf8')) })) : [],
  }, null, 2));
}
function seriesWinner() {
  if (!schedule.over) return null;
  const [a, b] = players.map((p) => schedule.scores[p.name]);
  return a === b ? 'tie' : a > b ? players[0].name : players[1].name;
}

async function playRounds() {
  for (let i = 0; i < rounds.length; i++) {
    const m = schedule.matches[i];
    if (readyGate) await waitForPlayers(i);
    else if (i > 0) m.startsAt = new Date(Date.now() + reviewMinutes * 60e3).toISOString();
    // Practice is for before round 1: it closes for good when round 1 is about to start.
    if (practiceOpen) {
      practiceOpen = false;
      practiceClosedWhy = 'practice was before round 1 only';
      practiceQueue.length = 0;
      savePracticeState();
      while (practiceRunning) await sleep(2e3);
    }
    const order = [...players.slice(i % players.length), ...players.slice(0, i % players.length)];
    const folder = `round-${m.round}-${m.game}`;
    m.folder = folder;
    if (m.game === 'bedwars') m.layout = bedwarsLayout === 'random' ? DUEL_LAYOUTS[Math.floor(Math.random() * DUEL_LAYOUTS.length)] : bedwarsLayout;
    if (m.game === 'skywars') {
      const PREVIOUS_TEMPLATES = ['classic', 'archipelago'];
      const UNUSED_TEMPLATES = TEMPLATE_IDS.filter((t) => !PREVIOUS_TEMPLATES.includes(t));
      const pool = UNUSED_TEMPLATES.length ? UNUSED_TEMPLATES : TEMPLATE_IDS.filter((t) => t !== 'classic');
      m.template = skywarsTemplate === 'random' ? pool[Math.floor(Math.random() * pool.length)] : skywarsTemplate;
      m.pack = skywarsPack ?? null;
    }
    log(`round ${m.round}: ${m.game}${m.layout ? ` (${LAYOUT_TEMPLATES[m.layout].name})` : m.template ? ` (${m.template}${m.pack ? ` / ${m.pack}` : ''})` : ''}, refereed, ${order[0].name} joins first (${m.game === 'bedwars' ? 'Red' : 'island 0'}), starting at ${m.startsAt}, limit ${m.limitSeconds} s`);
    let result;
    try {
      result = await runBotMatch({
        game: m.game,
        players: order.map((p) => ({ name: p.name, strategyFile: path.join(workspaces[p.name], 'strategies', `${m.game}.js`) })),
        outDir: path.join(runDir, folder), statusDir, port: 3041 + i, maxSeconds: m.limitSeconds, headed: flag('headed'),
        bedwarsLayout: m.layout ?? null,
        skywarsTemplate: m.template ?? null,
        skywarsPack: m.pack ?? null,
        startAt: () => Date.parse(schedule.matches[i].startsAt),
        schedule: { round: m.round, rounds: rounds.length, scores: schedule.scores },
        log,
        onPhase: ({ phase, startedAt }) => {
          if (phase === 'playing') { m.startedAt = new Date(startedAt).toISOString(); saveSchedule(); }
        },
      });
    } catch (err) {
      log(`round ${m.round} failed: ${err.stack ?? err}`);
      result = { game: m.game, error: String(err.message ?? err), winner: null, endReason: 'arena_error' };
    }
    m.endedAt = new Date().toISOString();
    scoreRound(result);
    m.winner = result.winnerName ?? null;
    m.result = result.winnerName ? `${result.winnerName} won (${result.endReason})` : `tie (${result.endReason})`;
    m.scoresAfter = { ...schedule.scores };
    m.details = result;
    saveSchedule();
    log(`round ${m.round} (${m.game}): ${m.result}; score ${scoreText()}`);
    // Each agent's private review of the round, and the film's record of it.
    for (const p of players) {
      try { writeRoundReview({ matchDir: path.join(runDir, folder), ws: workspaces[p.name], name: p.name, round: m.round, game: m.game, result, scores: schedule.scores, statusDir }); } catch (err) { log(`review for ${p.name} failed: ${err.message}`); }
    }
    // Each agent's interview, at once: its reflection on the round, before it starts improving for the next.
    if (!noAgents) await Promise.all(players.map((p) => roundInterview(p, m)));
    try { log(`round ${m.round} film record: ${JSON.stringify(exportFilm({ matchDir: path.join(runDir, folder), result, players: schedule.players, agentsDir: noAgents ? null : path.join(runDir, 'agents'), round: m.round, game: m.game, scores: { ...schedule.scores } }))}`); } catch (err) { log(`film export failed: ${err.stack ?? err}`); }
    writeSeriesFilm();
  }
}

// ---------- the interviews (interviews.mjs) ----------
/** One interview turn on the agent's own session, without tools; the answer, or '' after two tries. */
async function askAgent(p, prompt, label) {
  const dir = path.join(runDir, 'agents', p.name);
  const sessionFile = path.join(dir, 'session.txt');
  const session = existsSync(sessionFile) ? readFileSync(sessionFile, 'utf8').trim() : null;
  if (!session) { log(`${p.name}: no session to interview (${label})`); return ''; }
  for (let attempt = 1; attempt <= 2; attempt++) {
    const transcript = path.join(dir, `${label}-${attempt}.jsonl`);
    await Promise.race([agentTurn(p, prompt, { session, resume: true, transcript, extra: ['--max-turns', '1'] }), sleep(180e3)]);
    killTree(running.get(p.name));
    let text = '';
    try { text = interviewAnswer(readFileSync(transcript, 'utf8')); } catch { /* none */ }
    if (text) return text;
    log(`${p.name}: ${label} attempt ${attempt} gave no answer${hitUsageLimit(transcript) ? ' (usage limit)' : ''}`);
    await sleep(30e3);
  }
  return '';
}

/** Stop the agent's current turn and keep its loop from starting another until released. */
async function holdAgent(p) {
  onHold.add(p.name);
  killTree(running.get(p.name));
  for (let i = 0; i < 40 && running.has(p.name); i++) await sleep(500);
}

/**
 * Right after a round: the agent reflects, with its review report in the question. Saved for the film
 * (agents/<name>/interview-round-N.md) and for the agent (notes/interview-round-N.md). Then the agent goes on: to
 * review and improve for the next round, or after the last round to its final reflection.
 */
async function roundInterview(p, m) {
  await holdAgent(p);
  try {
    const reportFile = path.join(workspaces[p.name], 'review', `round-${m.round}`, 'report.txt');
    const next = schedule.matches[m.round] ?? null;
    const prompt = roundInterviewPrompt({
      name: p.name, round: m.round, game: m.game, result: m.result, score: scoreText(),
      report: existsSync(reportFile) ? readFileSync(reportFile, 'utf8') : null,
      next: next ? { round: next.round, game: next.game } : null,
    });
    const answer = await askAgent(p, prompt, `interview-round-${m.round}`);
    if (!answer) return;
    const md = interviewMarkdown({ name: p.name, round: m.round, game: m.game, answer });
    writeFileSync(path.join(runDir, 'agents', p.name, `interview-round-${m.round}.md`), md);
    mkdirSync(path.join(workspaces[p.name], 'notes'), { recursive: true });
    writeFileSync(path.join(workspaces[p.name], 'notes', `interview-round-${m.round}.md`), md);
    log(`${p.name}: interviewed after round ${m.round}`);
  } finally {
    onHold.delete(p.name);
  }
}

/**
 * At the end: a series of several rounds gets a look back over all of them. A one-round series has said it all in
 * the round's interview, which stands as the final one.
 */
async function interview(p) {
  const dir = path.join(runDir, 'agents', p.name);
  if (rounds.length === 1) {
    const only = path.join(dir, 'interview-round-1.md');
    if (existsSync(only)) writeFileSync(path.join(dir, 'interview.md'), readFileSync(only, 'utf8'));
    return;
  }
  const results = schedule.matches.map((m) => `round ${m.round} (${m.game}): ${m.result}`).join('; ');
  const verdict = seriesWinner() === 'tie' ? 'The series is a tie.' : `${seriesWinner()} wins the series.`;
  const answer = await askAgent(p, finalInterviewPrompt({ name: p.name, results, score: scoreText(), verdict }), 'interview');
  if (!answer) return;
  writeFileSync(path.join(dir, 'interview.md'), interviewMarkdown({ name: p.name, answer }));
  log(`${p.name}: interviewed`);
}

// ---------- the final reflection ----------
/**
 * After the last round: each agent reviews it, looks back over the whole series (notes/final-reflection.md) and makes
 * a final edit of every strategy; `arena ready` checks it and leaves ready/<name>-final.json. The arena waits for both,
 * at the latest finalMaxMinutes.
 */
async function finalReflection() {
  const latest = Date.now() + finalMaxMinutes * 60e3;
  schedule.final = { startedAt: new Date().toISOString(), latest: new Date(latest).toISOString(), done: {} };
  saveSchedule();
  log(`final reflection: open until ${schedule.final.latest}`);
  for (;;) {
    for (const p of players) {
      const ok = existsSync(path.join(statusDir, 'ready', `${p.name}-final.json`));
      if (ok && !schedule.final.done[p.name]) { schedule.final.done[p.name] = new Date().toISOString(); log(`${p.name}: final reflection done`); }
    }
    saveSchedule();
    if (players.every((p) => schedule.final.done[p.name])) { log('final reflection: both players are done'); break; }
    if (Date.now() >= latest) { log(`final reflection: time is up; done: ${players.filter((p) => schedule.final.done[p.name]).map((p) => p.name).join(', ') || 'nobody'}`); break; }
    await sleep(5e3);
  }
}

// ---------- run it ----------
let finishing = false;
process.on('SIGINT', () => { if (finishing) return; finishing = true; arenaOver = true; for (const c of running.values()) killTree(c); log('interrupted'); process.exit(1); });
log(`arena ${run}: ${players.map((p) => `${p.name} (${p.model}, effort ${p.effort})`).join(' vs ')}; rounds ${rounds.join(', ')}; preparation ${prepMinutes}-${prepMaxMinutes} min; workspaces in ${wsRoot}`);
const drafts = setInterval(snapshotDrafts, 15e3);
// For the agents' `arena ready`: how often each has searched or read the web. And a memory log, to explain any trouble.
const background = setInterval(() => {
  for (const p of players) { try { writeFileSync(path.join(statusDir, `${p.name}.web.json`), JSON.stringify({ webCalls: webCalls(p) })); } catch { /* next time */ } }
  appendFileSync(path.join(runDir, 'memory.log'), `${new Date().toISOString()} free ${freeMB()} MB of ${Math.round(os.totalmem() / 2 ** 20)}\n`);
}, 15e3);
const practicing = noAgents ? null : practiceService().catch((err) => log(`practice service stopped: ${err.stack ?? err}`));
const agents = noAgents ? [] : players.map((p, i) => sleep(i * 3000).then(() => agentLoop(p)));
await playRounds();
arenaOver = true;
schedule.over = true;
saveSchedule();
snapshotDrafts();
clearInterval(drafts);
clearInterval(background);
await practicing;
log(`all rounds played; final score ${scoreText()}; ${seriesWinner() === 'tie' ? 'the series is a tie' : `${seriesWinner()} wins the series`}; stopping the agents`);
for (const c of running.values()) killTree(c);
await Promise.race([Promise.all(agents), sleep(30e3)]);
if (!noAgents) await Promise.all(players.map((p) => interview(p)));
for (const p of players) {
  try { cpSync(workspaces[p.name], path.join(runDir, 'workspaces', p.name), { recursive: true, filter: (src) => !/[\\/]\.claude([\\/]|$)/.test(src) }); } catch (err) { log(`workspace copy failed for ${p.name}: ${err.message}`); }
}
writeSeriesFilm();
const summary = {
  run, warmStart: warmName, players: schedule.players, rounds, scores: schedule.scores, winner: seriesWinner(),
  matches: schedule.matches.map((m) => ({ round: m.round, game: m.game, layout: m.layout ?? null, host: m.host, joinsFirst: m.joinsFirst, folder: m.folder, startedAt: m.startedAt, endedAt: m.endedAt, result: m.result, scoresAfter: m.scoresAfter, details: m.details })),
  agents: Object.fromEntries(players.map((p) => [p.name, { turns: existsSync(path.join(runDir, 'agents', p.name)) ? readdirSync(path.join(runDir, 'agents', p.name)).filter((f) => /^turn-/.test(f)).length : 0, webCalls: webCalls(p), practiceSeconds: practiceUsed(statusDir, p.name) }])),
};
writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
log(`arena over: ${schedule.matches.map((m) => `round ${m.round} ${m.game}: ${m.result}`).join('; ')}; final ${scoreText()}`);
process.exit(0);
