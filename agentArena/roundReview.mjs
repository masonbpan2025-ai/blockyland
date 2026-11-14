// After each round, each agent gets its own record of it in its own workspace, review/round-N/ (agentArena/docs/
// agent-rules.md, "Between rounds"):
// - private, its own side only: a report of what its player did and saw, its strategy's whole log, every action it
//   called, and its frames. The other agent's strategy code, log, actions, notes and thinking stay private to it.
// - public, the same for every player: the replay (replay.txt and replay-frames.jsonl: where every player went, what
//   each held and wore, its health, the hits, deaths, chat and block changes -- what anyone watching the game saw) and
//   the arena camera's view every five seconds.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { playerReport } from './practice.mjs';

const lines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean) : []);

/**
 * @param {object} o
 * @param {string} o.matchDir the round's folder (recording/, video/hud/)
 * @param {string} o.ws the agent's workspace
 * @param {string} o.name the agent's player
 * @param {number} o.round
 * @param {object} o.result the round's result (series.mjs runMatch)
 * @param {object} o.scores the score after this round, by player
 * @returns {string} the review folder
 */
export function writeRoundReview({ matchDir, ws, name, round, game, result, scores, statusDir }) {
  const dir = path.join(ws, 'review', `round-${round}`);
  mkdirSync(path.join(dir, 'screens'), { recursive: true });
  const rec = path.join(matchDir, 'recording');
  const outcome = result.winnerName ? (result.winnerName === name ? 'YOU WON' : `you lost: ${result.winnerName} won`) : `a tie (${result.endReason})`;
  const title = `ROUND ${round} (${game}): ${outcome}. Score now: ${Object.entries(scores).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ')}.`;
  const { text } = playerReport({ game, name, outDir: matchDir, statusDir, result, secs: result.maxSeconds, title, every: 5 });
  // Public: the chat everyone saw (deaths, the winner), as this player's screen showed it.
  const chat = lines(path.join(rec, 'chat.jsonl')).map((l) => JSON.parse(l)).filter((c) => c.who === name && !/recipe/i.test(c.text));
  const t0 = result.playingT ?? 0;
  const chatText = chat.length ? `\n\nChat on your screen:\n${chat.map((c) => `  ${Math.round(c.t - t0)}s ${c.text}`).join('\n')}` : '';
  writeFileSync(path.join(dir, 'report.txt'), `${text}${chatText}\n`);
  writeFileSync(path.join(dir, 'strategy-log.txt'), lines(path.join(rec, `strategy-${name}.jsonl`)).map((l) => { const j = JSON.parse(l); return `${Math.round(j.t - t0)}s ${j.line}`; }).join('\n'));
  writeFileSync(path.join(dir, 'actions.jsonl'), lines(path.join(rec, `actions-${name}.jsonl`)).join('\n'));
  writeFileSync(path.join(dir, 'frames.jsonl'), lines(path.join(rec, 'frames.jsonl')).filter((l) => l.includes(`"who":"${name}"`)).join('\n'));
  const hud = path.join(matchDir, 'video', 'hud');
  // The arena camera's stills (the same for both players): the player's own screen is not drawn in a bot match.
  if (existsSync(hud)) for (const f of readdirSync(hud).filter((x) => x.startsWith('arena-'))) copyFileSync(path.join(hud, f), path.join(dir, 'screens', f));
  const replay = publicReplay({ matchDir, round, game, result });
  writeFileSync(path.join(dir, 'replay.txt'), replay.text);
  writeFileSync(path.join(dir, 'replay-frames.jsonl'), replay.frames.map((f) => JSON.stringify(f)).join('\n'));
  return dir;
}

/** What a player shows to anyone watching: never its inventory, open screens, what it sees, or its program's thoughts. */
function publicState(f) {
  const m = f.me ?? {};
  return {
    t: f.t, who: f.who, pos: m.pos ?? null, yaw: m.yaw ?? null, pitch: m.pitch ?? null, health: m.health ?? null,
    held: m.held?.item ?? m.held ?? null, armor: m.armor ?? null, dead: !!m.dead, sneaking: !!m.sneaking, sprinting: !!m.sprinting,
    swinging: !!f.buttons?.left,
  };
}

/**
 * The round's public replay, the same for every player: every player's visible state (every frame, and a timeline
 * every 5 seconds), the hits (with the player most likely to have landed each: the nearest other one within reach),
 * deaths and the chat, and how many blocks were placed and broken.
 */
export function publicReplay({ matchDir, round, game, result }) {
  const rec = path.join(matchDir, 'recording');
  const json = (f) => lines(path.join(rec, f)).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const t0 = result.playingT ?? 0;
  const frames = json('frames.jsonl').filter((f) => f.t >= t0 - 1 && f.who).map(publicState);
  const names = [...new Set(frames.map((f) => f.who))];
  const out = (line) => out.lines.push(line);
  out.lines = [];
  const fmt = (p) => (p ? `${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}` : '?');
  const armour = (a) => Object.values(a ?? {}).filter(Boolean).map((x) => String(x).replace(/_(helmet|chestplate|leggings|boots)$/, '')).join('/') || 'none';
  out(`REPLAY of round ${round} (${game}): ${result.winnerName ? `${result.winnerName} won` : 'no winner'} (${result.endReason ?? 'unknown'}) after ${result.seconds ?? '?'} s.`);
  out('Public: what anyone watching saw. Every player gets the same replay; no one gets another player\'s code, log or notes.');
  out(`\nTimeline (seconds from the start of play), each player: position x y z, health, holds, armour.`);
  for (let s = 0; ; s += 5) {
    const at = t0 + s;
    if (!frames.some((f) => f.t >= at)) break;
    const row = names.map((n) => {
      const f = frames.filter((x) => x.who === n && x.t <= at + 0.3).at(-1);
      if (!f) return `${n}: -`;
      return f.dead ? `${n}: OUT` : `${n}: at ${fmt(f.pos)} hp ${f.health} holds ${f.held ?? '-'} armour ${armour(f.armor)}`;
    });
    out(`  ${String(s).padStart(4)}s  ${row.join('  |  ')}`);
  }
  const near = (who, t) => frames.filter((f) => f.who === who && Math.abs(f.t - t) <= 0.6).sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0];
  const hits = json('events.jsonl').filter((e) => e.kind === 'hurt' && e.t >= t0);
  out(`\nHits (${hits.length}):`);
  for (const h of hits) {
    const v = near(h.who, h.t);
    let by = null, best = Infinity;
    for (const n of names.filter((x) => x !== h.who)) {
      const o = near(n, h.t);
      if (!o?.pos || !v?.pos) continue;
      const d = Math.hypot(o.pos.x - v.pos.x, o.pos.y - v.pos.y, o.pos.z - v.pos.z);
      if (d <= 4.5 && d < best) { best = d; by = `${n} (${d.toFixed(1)} blocks away, holding ${o.held ?? 'nothing'})`; }
    }
    out(`  ${(h.t - t0).toFixed(1)}s  ${h.who} took ${h.amount}${h.health != null ? ` (health ${h.health})` : ''}${by ? `, most likely from ${by}` : ', not from a player within reach (a fall, the void or a projectile)'}`);
  }
  const chat = json('chat.jsonl').filter((c) => c.t >= t0 - 5 && !/recipe|advancement|HUD hidden/i.test(c.text));
  const seen = new Set();
  out('\nChat and game messages (deaths, beds, the winner):');
  for (const c of chat) { const k = `${Math.round(c.t)}|${c.text}`; if (seen.has(c.text) && seen.has(k)) continue; seen.add(c.text); seen.add(k); out(`  ${Math.round(c.t - t0)}s ${c.text}`); }
  let placed = 0, broken = 0;
  for (const w of json('world.jsonl')) for (const [, , , id] of w.changes ?? []) { if (id) placed++; else broken++; }
  out(`\nBlocks: ${placed} placed, ${broken} broken in all (replay-frames.jsonl has every player's visible state, several times a second).`);
  return { text: `${out.lines.join('\n')}\n`, frames };
}
