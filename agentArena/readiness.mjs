// What an agent must have done before the arena will start a round (agentArena/docs/agent-rules.md, "Preparation" and
// "Between rounds"): before the first, researched the game on the web, written down a strategy design, checked its
// strategy file and tried it in practice; before each later one, written its review of the round before.
// `arena ready` (cli.mjs) runs these checks for the agent; run.mjs counts the web research itself.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const RESEARCH = Object.freeze({ minUrls: 3, minChars: 1200, minWebCalls: 3 });
export const PLAN = Object.freeze({ minChars: 800 });
export const REVIEW = Object.freeze({ minChars: 600 });
/**
 * Practice: each agent has `budget` seconds of practice play in all, before the first round, split over as many
 * practice games as it likes (each at least `min`). Setting up a game is not charged, only play.
 */
export const PRACTICE_SECONDS = Object.freeze({ budget: 120, min: 10, default: 60, max: 120 });

const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const urls = (text) => new Set(text.match(/https?:\/\/[^\s)>\]"']+/g) ?? []).size;

/** Web searches and page reads in an agent's session transcripts (agents/<name>/turn-*.jsonl). */
export function countWebCalls(transcriptDir) {
  let n = 0;
  if (!existsSync(transcriptDir)) return 0;
  for (const f of readdirSync(transcriptDir).filter((x) => /^turn-.*\.jsonl$/.test(x))) {
    for (const line of read(path.join(transcriptDir, f)).split('\n')) {
      // Claude Code (Claude, DeepSeek): tool_use blocks named WebSearch or WebFetch.
      if (line.includes('"tool_use"')) {
        try {
          const j = JSON.parse(line);
          for (const b of j.message?.content ?? []) if (b.type === 'tool_use' && (b.name === 'WebSearch' || b.name === 'WebFetch')) n++;
        } catch { /* a partial line */ }
      }
      // Antigravity (Gemini): a finished search_web or read_url_content step.
      if (line.includes('"step_update"') && /"tool_name":"(search_web|read_url_content)"/.test(line)) {
        try { const u = JSON.parse(line).step_update; if (u?.state === 'DONE') n++; } catch { /* a partial line */ }
      }
    }
  }
  return n;
}

/** Practice reports for a player and game, newest last: { file, errors, loaded, ... } from their JSON summaries. */
export function practices(statusDir, player, game) {
  const dir = path.join(statusDir, 'practice');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.startsWith(`${player}-${game}-`) && f.endsWith('.json')).sort()
    .map((f) => { try { return { file: f, ...JSON.parse(read(path.join(dir, f))) }; } catch { return null; } }).filter(Boolean);
}

/**
 * The checks before a round. `webCalls` comes from the runner (the agent cannot see its own transcript count), and
 * `checkOk` from running `arena check` on the strategy file.
 * - Round 1: web research and notes, a plan for the game, a passing check, and at least one practice game (within the
 *   practice time) that ran with at most 5 tick errors.
 * - Later rounds: the review of the round before (notes/review-round-N.md), a plan if this game is new to the series,
 *   and a passing check.
 * @param {number} round 1-based
 * @param {string[]} earlierGames the games of the rounds before this one
 * @returns {{ ok: boolean, items: {ok: boolean, what: string}[] }}
 */
export function readiness({ ws, statusDir, player, game, webCalls, checkOk, round = 1, earlierGames = [] }) {
  const items = [];
  if (round === 1) {
    const research = read(path.join(ws, 'notes', 'research.md'));
    items.push({ ok: webCalls >= RESEARCH.minWebCalls, what: `searched or read the web at least ${RESEARCH.minWebCalls} times (so far: ${webCalls})` });
    items.push({ ok: research.length >= RESEARCH.minChars && urls(research) >= RESEARCH.minUrls, what: `notes/research.md: what you learned and how you will use it, with the source URLs (at least ${RESEARCH.minUrls} URLs and ${RESEARCH.minChars} characters; now ${urls(research)} URLs, ${research.length} characters)` });
  } else {
    const review = read(path.join(ws, 'notes', `review-round-${round - 1}.md`));
    items.push({ ok: review.length >= REVIEW.minChars, what: `notes/review-round-${round - 1}.md: what worked and what did not in round ${round - 1}, your reasoning, the new tactics you found on the web (with sources) and which you are trying, and the changes you made (at least ${REVIEW.minChars} characters; now ${review.length})` });
  }
  if (round === 1 || !earlierGames.includes(game)) {
    const plan = read(path.join(ws, 'notes', `plan-${game}.md`));
    items.push({ ok: plan.length >= PLAN.minChars, what: `notes/plan-${game}.md: your strategy design for ${game} (at least ${PLAN.minChars} characters; now ${plan.length})` });
  }
  items.push({ ok: !!checkOk, what: `arena check strategies/${game}.js passes` });
  if (round === 1) {
    const tried = practices(statusDir, player, game);
    const clean = tried.filter((p) => p.loaded && p.errorTicks <= 5);
    items.push({ ok: clean.length > 0, what: `at least one practice game of ${game} that ran with at most 5 tick errors (arena practice; ${tried.length} so far${tried.length ? `, last: ${tried.at(-1).errorTicks} error ticks` : ''})` });
  }
  return { ok: items.every((i) => i.ok), items };
}

export const FINAL = Object.freeze({ minChars: 1000 });

/**
 * The checks at the end of a series, after the last round (agent-rules.md, "After the last round"): the review of the
 * last round, a reflection on the whole series, and a final edit of every game's strategy, made after the last round
 * ended, that still passes `arena check`.
 * @param {number} lastRound
 * @param {string[]} games the games played in the series
 * @param {number} lastEndedAt when the last round ended (ms)
 * @param {Object<string, boolean>} checks `arena check` per game
 */
export function finalReadiness({ ws, lastRound, games, lastEndedAt, checks }) {
  const items = [];
  const review = read(path.join(ws, 'notes', `review-round-${lastRound}.md`));
  items.push({ ok: review.length >= REVIEW.minChars, what: `notes/review-round-${lastRound}.md: what worked and what did not in the last round (at least ${REVIEW.minChars} characters; now ${review.length})` });
  const final = read(path.join(ws, 'notes', 'final-reflection.md'));
  items.push({ ok: final.length >= FINAL.minChars, what: `notes/final-reflection.md: the whole series looked back on -- what you did well and badly across the rounds, which changes helped and which did not (and how you know), and what you learned (at least ${FINAL.minChars} characters; now ${final.length})` });
  for (const game of games) {
    const file = path.join(ws, 'strategies', `${game}.js`);
    let edited = false;
    try { edited = statSync(file).mtimeMs > lastEndedAt; } catch { /* no file */ }
    items.push({ ok: edited, what: `strategies/${game}.js: your final edit, made after the last round ended, with everything the series taught you` });
    items.push({ ok: !!checks[game], what: `arena check strategies/${game}.js passes` });
  }
  return { ok: items.every((i) => i.ok), items };
}

/** Practice time used so far, in seconds of play, over all of a player's practice games. */
export function practiceUsed(statusDir, player) {
  const dir = path.join(statusDir, 'practice');
  if (!existsSync(dir)) return 0;
  let s = 0;
  for (const f of readdirSync(dir).filter((x) => x.startsWith(`${player}-`) && x.endsWith('.json'))) {
    try { s += JSON.parse(read(path.join(dir, f))).played ?? 0; } catch { /* none */ }
  }
  return s;
}
