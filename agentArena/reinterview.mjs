#!/usr/bin/env node
// Ask a finished run's agents the round interview (interviews.mjs) from their saved sessions: for a run from before the
// arena interviewed after every round, or for an interview that came back empty. Each agent gets the same question the
// arena asks right after a round, its review report in it, and answers without tools.
//
//   node agentArena/reinterview.mjs --run gemini-vs-deepseek-sw3 [--round 1] [--player Gemini]
//
// Writes agents/<name>/interview-round-N.md (marked as asked after the run), the same file in the agent's notes (its
// live workspace and the run's copy), and the round interviews in film/series.json. A DeepSeek player needs
// DEEPSEEK_API_KEY (this process's, or the user's environment on Windows); the key goes only to that player's process.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, createWriteStream, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { roundInterviewPrompt, interviewAnswer, interviewMarkdown } from './interviews.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const run = opt('run', null);
if (!run) throw new Error('usage: node agentArena/reinterview.mjs --run <run> [--round N] [--player Name]');
const roundNo = Number(opt('round', '1'));
const only = opt('player', null);

const runDir = path.resolve(import.meta.dirname, 'runs', run);
const summary = JSON.parse(readFileSync(path.join(runDir, 'summary.json'), 'utf8'));
const match = summary.matches.find((m) => m.round === roundNo);
if (!match) throw new Error(`run ${run} has no round ${roundNo}`);
const next = summary.matches.find((m) => m.round === roundNo + 1) ?? null;
const scoreAfter = match.scoresAfter ?? summary.scores;
const score = Object.entries(scoreAfter).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ');
const liveRoot = path.join(os.homedir(), 'blockyland-arena', run);
const AGY = process.platform === 'win32' ? path.join(os.homedir(), 'AppData', 'Local', 'agy', 'bin', 'agy.exe') : 'agy';

/** The player's harness: recorded in newer runs; else Antigravity when its first turn's stream began with `init`. */
function harnessOf(p) {
  if (p.harness) return p.harness;
  const dir = path.join(runDir, 'agents', p.name);
  const first = existsSync(dir) ? readdirSync(dir).filter((f) => /^turn-.*\.jsonl$/.test(f)).sort()[0] : null;
  if (first && readFileSync(path.join(dir, first), 'utf8').includes('"event":"init"')) return 'agy';
  return /^deepseek/i.test(p.model) ? 'deepseek' : 'claude';
}

function deepseekKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  if (process.platform !== 'win32') return null;
  try { return spawnSync('powershell', ['-NoProfile', '-Command', "[Environment]::GetEnvironmentVariable('DEEPSEEK_API_KEY','User')"]).stdout.toString().trim() || null; } catch { return null; }
}

/** One turn on the saved session, its stream saved line by line with `_at`; resolves with the transcript's text. */
function ask(p, harness, session, prompt, transcript) {
  const ws = path.join(liveRoot, p.name);
  if (!existsSync(ws)) throw new Error(`${p.name}'s workspace ${ws} is gone: its session cannot be resumed there`);
  let child;
  if (harness === 'agy') {
    child = spawn(AGY, ['-p', prompt, '--model', p.model, '--output-format', 'stream-json', '--disable-slash-commands', '--conversation', session],
      { cwd: ws, stdio: ['ignore', 'pipe', 'pipe'] });
  } else {
    const env = { ...process.env };
    if (harness === 'deepseek') {
      const key = deepseekKey();
      if (!key) throw new Error('DEEPSEEK_API_KEY is not set');
      Object.assign(env, {
        ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic', ANTHROPIC_API_KEY: key, ANTHROPIC_AUTH_TOKEN: key,
        ANTHROPIC_MODEL: p.model, ANTHROPIC_SMALL_FAST_MODEL: p.model, ANTHROPIC_DEFAULT_HAIKU_MODEL: p.model,
        ANTHROPIC_DEFAULT_SONNET_MODEL: p.model, ANTHROPIC_DEFAULT_OPUS_MODEL: p.model, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      });
    }
    // No tools are allowed: "don't ask" refuses every one, and one turn is all it gets.
    // The prompt goes in on stdin: cmd.exe would end the command at the prompt's first line break.
    const cliArgs = ['-p', '--resume', session, '--model', p.model, ...(p.effort ? ['--effort', p.effort] : []),
      '--output-format', 'stream-json', '--verbose', '--settings', path.join(ws, '.claude', 'settings.json'), '--setting-sources', 'project',
      '--strict-mcp-config', '--permission-mode', 'dontAsk', '--max-turns', '1'];
    const win = process.platform === 'win32';
    const quoted = win ? cliArgs.map((a) => `"${String(a).replace(/"/g, '""')}"`) : cliArgs;
    child = spawn('claude', quoted, { cwd: ws, env, stdio: ['pipe', 'pipe', 'pipe'], shell: win });
    child.stdin.on('error', () => {});
    child.stdin.end(prompt);
  }
  return new Promise((resolve) => {
    const out = createWriteStream(transcript);
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let j = null;
      try { j = JSON.parse(line); } catch { /* raw */ }
      out.write(`${JSON.stringify(j ? { ...j, _at: new Date().toISOString() } : { type: 'raw', text: line, _at: new Date().toISOString() })}\n`);
    });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => child.kill(), 240e3);
    child.on('exit', (code) => { clearTimeout(timer); out.end(() => resolve({ code, text: readFileSync(transcript, 'utf8'), err })); });
  });
}

const players = summary.players.filter((p) => !only || p.name === only);
const results = await Promise.all(players.map(async (p) => {
  const dir = path.join(runDir, 'agents', p.name);
  const session = readFileSync(path.join(dir, 'session.txt'), 'utf8').trim();
  const harness = harnessOf(p);
  const reportFile = [path.join(liveRoot, p.name, 'review', `round-${roundNo}`, 'report.txt'), path.join(runDir, 'workspaces', p.name, 'review', `round-${roundNo}`, 'report.txt')].find((f) => existsSync(f));
  const prompt = roundInterviewPrompt({
    name: p.name, round: roundNo, game: match.game, result: match.result, score,
    report: reportFile ? readFileSync(reportFile, 'utf8') : null,
    next: next ? { round: next.round, game: next.game } : null,
  });
  const transcript = path.join(dir, `interview-round-${roundNo}-followup.jsonl`);
  const { code, text, err } = await ask(p, harness, session, prompt, transcript);
  const answer = interviewAnswer(text);
  if (!answer) return { name: p.name, ok: false, why: `no answer (exit ${code}) ${err.slice(-300)}` };
  const md = `${interviewMarkdown({ name: p.name, round: roundNo, game: match.game, answer })}\n_Asked on ${new Date().toISOString().slice(0, 10)}, after the arena had ended, from the agent's saved session, with its review report of the round in the question._\n`;
  writeFileSync(path.join(dir, `interview-round-${roundNo}.md`), md);
  for (const ws of [path.join(liveRoot, p.name), path.join(runDir, 'workspaces', p.name)]) {
    if (!existsSync(ws)) continue;
    mkdirSync(path.join(ws, 'notes'), { recursive: true });
    writeFileSync(path.join(ws, 'notes', `interview-round-${roundNo}.md`), md);
  }
  return { name: p.name, ok: true, harness, answer };
}));

// The film's record of the series gets the round interviews.
const seriesFile = path.join(runDir, 'film', 'series.json');
if (existsSync(seriesFile)) {
  const series = JSON.parse(readFileSync(seriesFile, 'utf8'));
  series.roundInterviews ??= {};
  for (const p of summary.players) {
    const f = path.join(runDir, 'agents', p.name, `interview-round-${roundNo}.md`);
    if (existsSync(f)) (series.roundInterviews[p.name] ??= {})[roundNo] = readFileSync(f, 'utf8');
  }
  writeFileSync(seriesFile, JSON.stringify(series, null, 2));
}
for (const r of results) console.log(r.ok ? `${r.name} (${r.harness}):\n${r.answer}\n` : `${r.name}: ${r.why}`);
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
