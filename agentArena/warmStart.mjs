// Warm start (agentArena/run.mjs --warm-start <run>): before a new series, every agent gets the whole record of an
// earlier series to learn from -- results, every round's replay and screens, every player's program log and every
// version of its strategy that played, and every agent's final strategies, notes, reviews, interviews and practice
// reports. An agent can read only its own workspace, so the record is copied into it, as previous/<run>/, the same for
// every agent. Left out: the videos and the agents' raw session transcripts (large; their notes say what they thought).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { publicReplay } from './roundReview.mjs';

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const files = (dir, test = () => true) => (isDir(dir) ? readdirSync(dir).filter((f) => !isDir(path.join(dir, f)) && test(f)) : []);
const jsonl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);

/** The folder of an earlier run: a path, or a run's name under agentArena/runs/. */
export function resolveRun(spec, runsDir) {
  const dir = isDir(spec) ? path.resolve(spec) : path.join(runsDir, spec);
  if (!existsSync(path.join(dir, 'summary.json'))) throw new Error(`--warm-start: ${spec} is not a finished arena run (no summary.json in ${dir})`);
  return dir;
}

/**
 * Copy an earlier run's record into a workspace as previous/<run>/.
 * @param {string} fromDir the earlier run's folder (agentArena/runs/<run>)
 * @param {string} ws the workspace
 * @returns {{ dir: string, rounds: number, agents: string[], files: number }}
 */
export function copyWarmStart(fromDir, ws) {
  const summary = JSON.parse(readFileSync(path.join(fromDir, 'summary.json'), 'utf8'));
  const name = path.basename(fromDir);
  const out = path.join(ws, 'previous', name);
  let n = 0;
  const put = (rel, text) => { const f = path.join(out, rel); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, text); n++; };
  const copy = (src, rel) => { if (!existsSync(src)) return; const f = path.join(out, rel); mkdirSync(path.dirname(f), { recursive: true }); copyFileSync(src, f); n++; };

  put('summary.json', JSON.stringify(summary, null, 2));
  const players = (summary.players ?? []).map((p) => p.name);
  const roundLines = [];
  for (const m of summary.matches ?? []) {
    const folder = m.folder ?? `round-${m.round}-${m.game}`;
    const src = path.join(fromDir, folder);
    if (!isDir(src)) continue;
    const rel = path.join('rounds', folder);
    const resultFile = path.join(src, 'result.json');
    const result = existsSync(resultFile) ? JSON.parse(readFileSync(resultFile, 'utf8')) : (m.details ?? {});
    copy(resultFile, path.join(rel, 'result.json'));
    // The replay, as both players got it after the round.
    try {
      const replay = publicReplay({ matchDir: src, round: m.round, game: m.game, result });
      put(path.join(rel, 'replay.txt'), replay.text);
      put(path.join(rel, 'replay-frames.jsonl'), replay.frames.map((f) => JSON.stringify(f)).join('\n'));
    } catch { /* a round without a recording */ }
    // Every player's program log, and every version of its strategy that played the round.
    for (const p of players) {
      const log = jsonl(path.join(src, 'recording', `strategy-${p}.jsonl`));
      const t0 = result.playingT ?? 0;
      if (log.length) put(path.join(rel, 'strategy-logs', `${p}.txt`), log.map((l) => `${Math.round(l.t - t0)}s ${l.line}`).join('\n'));
      for (const f of files(path.join(src, 'versions', p), (x) => x.endsWith('.js'))) copy(path.join(src, 'versions', p, f), path.join(rel, 'strategy-versions', p, f));
    }
    for (const f of files(path.join(src, 'video', 'hud'), (x) => /^arena-.*\.jpg$/.test(x))) copy(path.join(src, 'video', 'hud', f), path.join(rel, 'screens', f));
    roundLines.push(`- \`rounds/${folder}/\`: round ${m.round} (${m.game}): ${m.result ?? 'no result'}`);
  }

  // Every agent's own work, as it stood at the end of that series.
  for (const p of players) {
    const wsCopy = path.join(fromDir, 'workspaces', p), agentDir = path.join(fromDir, 'agents', p);
    for (const sub of ['strategies', 'notes', 'practice']) {
      for (const f of files(path.join(wsCopy, sub))) copy(path.join(wsCopy, sub, f), path.join('agents', p, sub, f));
    }
    for (const f of files(agentDir, (x) => /^interview.*\.md$/.test(x))) copy(path.join(agentDir, f), path.join('agents', p, 'interviews', f));
    // Its own report of each round (private then, open now).
    const reviews = path.join(wsCopy, 'review');
    for (const d of isDir(reviews) ? readdirSync(reviews).filter((x) => /^round-\d+$/.test(x)) : []) copy(path.join(reviews, d, 'report.txt'), path.join('agents', p, 'reviews', d, 'report.txt'));
    for (const f of files(path.join(fromDir, 'status', 'practice'), (x) => x.startsWith(`${p}-`) && x.endsWith('.txt'))) copy(path.join(fromDir, 'status', 'practice', f), path.join('agents', p, 'practice-reports', f));
  }

  const scores = Object.entries(summary.scores ?? {}).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ');
  put('README.md', `# An earlier series: ${name}

${(summary.players ?? []).map((p) => `${p.name} (${p.model}${p.harness ? `, ${p.harness}` : ''})`).join(' vs ')}. Final score: ${scores || 'none'}${summary.winner ? `; ${summary.winner === 'tie' ? 'a tied series' : `${summary.winner} won the series`}` : ''}.

Everything from that series, for you to learn from before you research, design and practise your own strategy. Every
player's code and notes are here, not only yours: study what each tried, what worked and what did not, and why. Reuse
any idea or code you like; the rules and the bot API are those of this series (docs/), so check anything you reuse.

${roundLines.join('\n') || '- (no rounds were recorded)'}
  - \`result.json\`: the result; \`replay.txt\` / \`replay-frames.jsonl\`: the public replay (where every player went,
    what each held and wore, the hits, deaths and chat); \`strategy-logs/<player>.txt\`: each program's log;
    \`strategy-versions/<player>/\`: every version of each strategy that played the round; \`screens/\`: the arena camera.
- \`agents/<player>/\`: each agent's final \`strategies/\`, its \`notes/\` (research, plans, reviews, final reflection),
  its \`interviews/\`, its own report of each round (\`reviews/round-N/report.txt\`) and its \`practice-reports/\`.
- \`summary.json\`: the series as the arena saw it.
`);
  return { dir: out, rounds: roundLines.length, agents: players, files: n };
}
