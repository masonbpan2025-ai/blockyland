// A practice game: one agent's strategy plays the real game against an opponent of its choosing (a dummy that never
// moves, a copy of its own strategy, or any strategy file it wrote), optionally from a setup it wrote (where each
// player starts and with what), then the agent gets a report of what both players did. Asked for with
// `arena practice` (cli.mjs) and run one at a time by run.mjs, within each agent's practice time.
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { runBotMatch } from './botMatch.mjs';
import { PRACTICE_SECONDS } from './readiness.mjs';

const jsonl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
const fmt = (p) => (p ? `${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}` : '?');
const stack = (s) => (s ? `${s.item}${s.count > 1 ? ` x${s.count}` : ''}` : null);

/**
 * @returns {Promise<{ text: string, summary: object }>} the report the agent reads, and the facts readiness checks
 */
export async function runPractice({ game, name, strategyFile, opponentFile = null, setup = null, outDir, statusDir, seconds = PRACTICE_SECONDS.default, port, log }) {
  const secs = Math.min(PRACTICE_SECONDS.max, Math.max(10, Number(seconds) || PRACTICE_SECONDS.default));
  const opponent = opponentFile ? 'Sparring' : 'Dummy';
  if (statusDir) mkdirSync(statusDir, { recursive: true });
  if (statusDir) appendFileSync(path.join(statusDir, `${name}.log`), `---- practice ${game} (${secs} s) against ${opponentFile ? path.basename(opponentFile) : 'the dummy'} starts ${new Date().toISOString()} ----\n`);
  const result = await runBotMatch({
    game, players: [{ name, strategyFile }, { name: opponent, strategyFile: opponentFile }], outDir, statusDir, port,
    // The three-island practice map: every mechanic of the full map, on far less memory and with less to load.
    maxSeconds: secs, video: false, practiceMap: true, setup: setup ? [setup.me ?? null, setup.opponent ?? null] : null, log: (l) => log(`[practice ${name}] ${l}`),
  });
  const mine = playerReport({ game, name, outDir, statusDir, result, secs, against: opponentFile ? `${opponent}, running ${path.basename(opponentFile)}` : 'a dummy that never moves (it stands on its own island)', setup });
  if (!opponentFile) return mine;
  // Against its own code, the agent sees the other side too: it is its own strategy.
  const theirs = playerReport({ game, name: opponent, outDir, statusDir, result, secs, against: name, setup: null, brief: true });
  return { text: `${mine.text}\n\n==== the other side: ${opponent} (${path.basename(opponentFile)}) ====\n${theirs.text}`, summary: mine.summary };
}

/** What one player did in a recorded game, as its agent reads it (practice reports, round reviews). */
export function playerReport({ game, name, outDir, statusDir, result, secs, against, setup, brief = false, title = null, every = 10 }) {
  const rec = path.join(outDir, 'recording');
  const events = jsonl(path.join(rec, 'events.jsonl'));
  // Seconds count from the end of the countdown, when play begins.
  const t0 = result.playingT ?? events.find((e) => e.kind === 'start')?.t ?? 0;
  const frames = jsonl(path.join(rec, 'frames.jsonl')).filter((f) => f.who === name && f.t >= t0);
  const logs = jsonl(path.join(rec, `strategy-${name}.jsonl`));
  const chat = jsonl(path.join(rec, 'chat.jsonl')).filter((c) => c.who === name);
  const st = result.strategies?.[name] ?? {};
  const lines = [];
  const out = (s = '') => lines.push(s);
  if (title) out(title);
  else if (!brief) out(`PRACTICE ${game}: ${name} (your strategy) against ${against}. ${secs} s at most.${setup ? ' From your setup.' : ''}`);
  const setupDone = events.filter((e) => e.kind === 'practice_setup' && e.who === name).flatMap((e) => e.done);
  if (setupDone.length) out(`Setup for ${name}: ${setupDone.join('; ')}`);
  out(`Result: ${result.winnerName ? `${result.winnerName} won` : 'no winner'} (${result.endReason ?? 'unknown'}) after ${result.seconds ?? '?'} s.`);
  out(`Strategy: ${st.versions ?? 0} version(s) ran, ${st.ticks ?? 0} ticks, ${st.errors ?? 0} ticks with errors, ${st.slowTicks ?? 0} too slow, ${st.inputs ?? 0} inputs done.`);

  // Where the player was and what it had, every 10 seconds.
  out('\nTimeline (seconds from the start; position x y z; health; armour points; held; open screen; players seen):');
  let next = 0, travelled = 0, prev = null, lowest = Infinity;
  for (const f of frames) {
    const s = f.t - t0;
    if (prev && f.me?.pos && prev.me?.pos) travelled += Math.hypot(f.me.pos.x - prev.me.pos.x, f.me.pos.z - prev.me.pos.z);
    if (f.me?.pos) lowest = Math.min(lowest, f.me.pos.y);
    prev = f;
    if (s < next) continue;
    next += every;
    const m = f.me ?? {};
    out(`  ${String(Math.round(s)).padStart(4)}s  at ${fmt(m.pos)}  hp ${m.health}  armour ${m.armorPoints ?? (Object.values(m.armor ?? {}).filter(Boolean).map((a) => a.replace(/_(helmet|chestplate|leggings|boots)$/, '')).join('/') || 'none')}  holds ${m.held?.item ?? m.held ?? '-'}  screen ${f.screen}${m.dead ? '  DEAD' : ''}${f.sees?.length ? `  sees ${f.sees.join(',')}` : ''}`);
  }
  out(`Walked about ${Math.round(travelled)} blocks; lowest point y ${Number.isFinite(lowest) ? lowest.toFixed(1) : '?'} (the void is below y -4).`);

  const view = statusDir && existsSync(path.join(statusDir, `${name}.view.json`)) ? JSON.parse(readFileSync(path.join(statusDir, `${name}.view.json`), 'utf8')) : null;
  if (view?.me) {
    const me = view.me;
    out(`\nAt the end: armour ${['head', 'chest', 'legs', 'feet'].map((k) => `${k} ${stack(me.armor?.[k]) ?? '-'}`).join(', ')}.`);
    out(`Hotbar: ${(me.hotbar ?? []).map((h, i) => `${i}:${stack(h) ?? '-'}`).join('  ')}`);
    const inv = (me.inventory ?? []).map(stack).filter(Boolean);
    out(`Inventory: ${inv.length ? inv.join(', ') : 'empty'}`);
  }
  const deaths = chat.filter((c) => new RegExp(`\\b${name}\\b`).test(c.text) && /void|slain|killed|died|fell|knocked/i.test(c.text));
  if (deaths.length) out(`\nDeaths and kills in chat: ${deaths.map((c) => `${Math.round(c.t - t0)}s "${c.text}"`).join('; ')}`);
  const pageErrors = events.filter((e) => e.kind === 'page_error').length;
  if (pageErrors) out(`(${pageErrors} game page messages were logged; they are the game's, not your strategy's.)`);

  const hurts = events.filter((e) => e.kind === 'hurt' && e.who === name && e.t >= t0);
  if (hurts.length) out(`Damage taken: ${hurts.map((h) => `${Math.round(h.t - t0)}s -${h.amount}`).join(', ')}`);

  out(`\n${name}'s strategy log, last ${brief ? 30 : 60} lines${brief ? '' : ' (all of it: arena log 400)'}:`);
  for (const l of logs.slice(brief ? -30 : -60)) out(`  ${Math.round(l.t - t0)}s ${l.line}`);
  if (!logs.length) out('  (nothing logged: log() what your strategy decides, so practice shows you why it did what it did)');

  const summary = {
    // played: seconds of play, which is what practice time is charged for.
    game, at: new Date().toISOString(), seconds: result.seconds ?? null, played: result.playingT != null ? Math.round((result.endT ?? (result.playingT + secs)) - result.playingT) : 0, endReason: result.endReason ?? null, winner: result.winnerName ?? null,
    loaded: (st.versions ?? 0) > 0, ticks: st.ticks ?? 0, errorTicks: st.errors ?? 0, slowTicks: st.slowTicks ?? 0, travelled: Math.round(travelled),
    died: deaths.length > 0 || frames.some((f) => f.me?.dead),
  };
  return { text: lines.join('\n'), summary };
}

/** Save a report where `arena practice result` and readiness find it. */
export function savePractice(statusDir, name, game, n, { text, summary }) {
  const dir = path.join(statusDir, 'practice');
  mkdirSync(dir, { recursive: true });
  const base = `${name}-${game}-${String(n).padStart(3, '0')}`;
  writeFileSync(path.join(dir, `${base}.txt`), text);
  writeFileSync(path.join(dir, `${base}.json`), JSON.stringify(summary, null, 2));
  return base;
}
