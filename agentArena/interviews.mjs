// The agents' interviews (agentArena/run.mjs): one after every round, while it is fresh, and one at the end of a series
// of several rounds. The round interview is the agent's reflection: what went well, what went badly and why, and what it
// will change. It is asked with the round's own review report in the question (review/round-N/report.txt), so the
// answers rest on what happened rather than on memory, and before the agent starts improving its strategy, so the next
// round's work starts from it. The answers are for the film (agents/<name>/interview-round-N.md) and for the agent
// (notes/interview-round-N.md in its workspace).

export const ROUND_INTERVIEW_WORDS = 150;
export const FINAL_INTERVIEW_WORDS = 150;
/** A report longer than this is cut, keeping its head (the result, the timeline) and its tail (the latest log lines). */
const REPORT_MAX = 6000;

function clip(report) {
  const text = String(report ?? '').trim();
  if (text.length <= REPORT_MAX) return text;
  return `${text.slice(0, REPORT_MAX * 0.6)}\n[...]\n${text.slice(-REPORT_MAX * 0.4)}`;
}

/**
 * The question after a round.
 * @param {object} o
 * @param {string} o.name the agent
 * @param {number} o.round
 * @param {string} o.game 'skywars' | 'bedwars'
 * @param {string} o.result e.g. 'DeepSeek won (last_alive)'
 * @param {string} o.score e.g. 'Gemini -1, DeepSeek +1'
 * @param {string|null} o.report the agent's private review report of the round, or null when there is none
 * @param {{round: number, game: string}|null} o.next the next round, or null after the last
 */
export function roundInterviewPrompt({ name, round, game, result, score, report, next }) {
  const ahead = next
    ? `Round ${next.round} (${next.game}) is next.`
    : 'That was the last round.';
  const change = next
    ? `What will you change for round ${next.round}, and why do you expect it to help?`
    : 'What would you change if you played this round again, and why?';
  const evidence = report
    ? `Your private review of the round (review/round-${round}/report.txt):\n<<<REPORT\n${clip(report)}\nREPORT>>>\nBase every answer on this review, not on what you remember or intended. Where it shows something other than what you planned, say so plainly.`
    : 'There is no review report for this round: answer from what you saw, and say where you are unsure.';
  return `Round ${round} (${game}) is over: ${result}. Score: ${score}. ${ahead} You are ${name}.\n\n${evidence}\n\n`
    + `An interview for the film, right after the round, in plain text, at most ${ROUND_INTERVIEW_WORDS} words in all, without using any tools. `
    + `Be honest and specific, with times and numbers from the review where you can:\n`
    + `1) What went well, and why?\n2) What went badly, and why?\n3) ${change}`;
}

/** The question at the end of a series of several rounds. */
export function finalInterviewPrompt({ name, results, score, verdict }) {
  return `The arena is over. ${results}. Final score: ${score}. ${verdict} You are ${name}. `
    + `A short interview for the film, in plain text, at most ${FINAL_INTERVIEW_WORDS} words in all, without using any tools. `
    + `Look back over all the rounds (your notes/interview-round-N.md and notes/review-round-N.md say what you thought after each):\n`
    + `1) How do you feel about the result?\n2) What was the key moment of the series?\n`
    + `3) Which change between rounds helped most, which did not, and how do you know?\n4) What would you do differently in another series?`;
}

/**
 * The answer in an interview turn's transcript: Claude Code's final `result` (also DeepSeek's, which runs in Claude Code),
 * or Antigravity's (Gemini) `result.response`. Lines are JSON, one per line; anything else is skipped.
 */
export function interviewAnswer(transcriptText) {
  let answer = '';
  for (const line of String(transcriptText ?? '').split('\n')) {
    let j;
    try { j = JSON.parse(line); } catch { continue; }
    const text = j?.type === 'result' && !j.is_error ? j.result : j?.event === 'result' ? j.result?.response : null;
    if (typeof text === 'string' && text.trim()) answer = text.trim();
  }
  return answer;
}

/** The interview as the film and the agent keep it. */
export function interviewMarkdown({ name, round = null, game = null, answer }) {
  const title = round === null ? `# ${name} after the arena` : `# ${name} after round ${round}${game ? ` (${game})` : ''}`;
  return `${title}\n\n${answer.trim()}\n`;
}
