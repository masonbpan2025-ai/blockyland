// The film's record of one round (agentArena/docs/running.md, "Recording"): the round's raw recording gathered into one
// replayable file, round-N-<game>/film.json, in the spirit of the team battle film's recording.json
// (src/cinema/arenaFilm.js): every player's state every 0.25 s, every block change, every hit (with who most likely
// landed it), every death, the chat, each strategy's log lines and each agent's own words while it played, all on the
// recording's clock. The map is recording/arena-blocks.json; the players' own screens are video/<name>.webm.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { agyThoughts } from './agyTranscript.mjs';

const jsonl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
const r2 = (v) => Math.round(v * 100) / 100;
export const FRAME_SECONDS = 0.25;

/**
 * The agent's own words and actions from its session transcripts (agents/<name>/turn-*.jsonl, whose lines carry `_at`,
 * the wall-clock time the arena received them), placed on the recording's clock.
 */
export function agentWords(agentDir, recorderT0, from, to) {
  const out = [];
  if (!existsSync(agentDir)) return out;
  // A Gemini player (Antigravity CLI): its reasoning and replies are in Antigravity's own store, not in the stream.
  const session = existsSync(path.join(agentDir, 'session.txt')) ? readFileSync(path.join(agentDir, 'session.txt'), 'utf8').trim() : null;
  const firstTurn = readdirSync(agentDir).filter((x) => /^turn-.*\.jsonl$/.test(x)).sort()[0];
  if (session && firstTurn && readFileSync(path.join(agentDir, firstTurn), 'utf8').includes('"event":"init"')) {
    for (const { at, text } of agyThoughts(session)) {
      if (!at) continue;
      const t = r2((at - recorderT0) / 1000);
      if (t >= from && t <= to) out.push({ t, kind: 'thought', text });
    }
  }
  for (const f of readdirSync(agentDir).filter((x) => /^turn-.*\.jsonl$/.test(x)).sort()) {
    for (const j of jsonl(path.join(agentDir, f))) {
      if (!j._at) continue;
      const t = r2((Date.parse(j._at) - recorderT0) / 1000);
      if (t < from || t > to) continue;
      // Antigravity (Gemini): each tool step as it starts, and each turn's answer.
      if (j.event === 'step_update' && j.step_update?.state === 'ACTIVE' && j.step_update.tool_info) {
        const ti = j.step_update.tool_info, pr = ti.parameters ?? {};
        const what = pr.CommandLine ?? pr.query ?? pr.Url ?? pr.Path ?? pr.TargetFile ?? pr.AbsolutePath ?? ti.name;
        out.push({ t, kind: 'action', tool: ti.name, text: String(what).slice(0, 300) });
        continue;
      }
      if (j.event === 'result' && j.result?.response) { out.push({ t, kind: 'said', text: String(j.result.response).trim() }); continue; }
      if (j.type !== 'assistant') continue;
      for (const b of j.message?.content ?? []) {
        if (b.type === 'text' && b.text.trim()) out.push({ t, kind: 'said', text: b.text.trim() });
        else if (b.type === 'thinking' && b.thinking?.trim()) out.push({ t, kind: 'thought', text: b.thinking.trim() });
        else if (b.type === 'tool_use') {
          const i = b.input ?? {};
          const what = i.command ?? (i.file_path ? `${b.name} ${path.basename(i.file_path)}` : i.query ?? i.url ?? b.name);
          out.push({ t, kind: 'action', tool: b.name, text: String(what).slice(0, 300), ...(b.name === 'Edit' ? { edit: { from: String(i.old_string ?? '').slice(0, 2000), to: String(i.new_string ?? '').slice(0, 2000) } } : {}) });
        }
      }
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * An agent's whole session, preparation and reviews included, on the wall clock: [{ at (ISO time), kind, text, tool? }],
 * for the film's story around the rounds (film/series.json).
 */
export function agentTimeline(agentDir) {
  return agentWords(agentDir, 0, -Infinity, Infinity).map(({ t, ...rest }) => ({ at: new Date(t * 1000).toISOString(), ...rest }));
}

/**
 * @param {object} o
 * @param {string} o.matchDir the round's folder (recording/, video/, versions/)
 * @param {object} o.result the round's result (series.mjs runMatch)
 * @param {{name, model, effort}[]} o.players
 * @param {string} o.agentsDir agents/ (session transcripts), or null when no agents played
 */
export function exportFilm({ matchDir, result, players, agentsDir, round, game, scores }) {
  const rec = path.join(matchDir, 'recording');
  const names = players.map((p) => p.name);
  const frames = jsonl(path.join(rec, 'frames.jsonl'));
  const events = jsonl(path.join(rec, 'events.jsonl'));
  const t0 = events.find((e) => e.kind === 'start')?.t ?? 0;
  const tEnd = (result.endT ?? frames.at(-1)?.t ?? t0) + 5;

  // Every player every 0.25 s: [x, y, z, yaw, pitch, health, held, armour points, [head, chest, legs, feet], flags]
  // flags: d dead, s sneaking, r sprinting, a attacking (left button down), u using (right button down), o screen open.
  const buckets = new Map();
  for (const f of frames) {
    if (f.t < t0 - 1 || !f.me?.pos) continue;
    const k = Math.round(f.t / FRAME_SECONDS);
    if (!buckets.has(k)) buckets.set(k, {});
    const m = f.me;
    const flags = `${m.dead ? 'd' : ''}${m.sneaking ? 's' : ''}${m.sprinting ? 'r' : ''}${f.buttons?.left ? 'a' : ''}${f.buttons?.right ? 'u' : ''}${f.screen && f.screen !== 'none' ? 'o' : ''}`;
    buckets.get(k)[f.who] = [r2(m.pos.x), r2(m.pos.y), r2(m.pos.z), r2(m.yaw), r2(m.pitch), m.health, m.held, m.armorPoints, ['head', 'chest', 'legs', 'feet'].map((s) => m.armor?.[s] ?? null), flags];
  }
  const filmFrames = [...buckets.keys()].sort((a, b) => a - b).map((k) => ({ t: r2(k * FRAME_SECONDS), p: names.map((n) => buckets.get(k)[n] ?? null) }));

  const blockChanges = [];
  for (const w of jsonl(path.join(rec, 'world.jsonl'))) for (const [x, y, z, id] of w.changes ?? []) blockChanges.push([w.t, x, y, z, id]);

  // Who landed a hit: in a duel, the other player when it was within reach and swinging; otherwise the world.
  const near = (who, t) => { let best = null; for (const f of frames) { if (f.who !== who || f.t > t + 0.3) continue; if (f.t >= t - 0.6) best = f; } return best; };
  const filmEvents = [];
  for (const e of events) {
    if (e.kind === 'hurt') {
      const victim = near(e.who, e.t);
      let by = null, dist = null;
      for (const other of names.filter((n) => n !== e.who)) {
        const o = near(other, e.t);
        if (!o || !victim) continue;
        const d = Math.hypot(o.me.pos.x - victim.me.pos.x, o.me.pos.y - victim.me.pos.y, o.me.pos.z - victim.me.pos.z);
        if (d <= 4.5 && (dist === null || d < dist)) { by = other; dist = r2(d); }
      }
      filmEvents.push({ t: e.t, kind: 'hit', who: e.who, by: by ?? 'world', amount: e.amount, health: e.health, ...(dist !== null ? { distance: dist } : {}) });
    } else if (['phase', 'start', 'time_limit', 'strategy_loaded', 'strategy_load_failed', 'strategy_error', 'video_start', 'room', 'drop', 'taken'].includes(e.kind)) {
      filmEvents.push({ ...e, error: e.error ? String(e.error).slice(0, 200) : undefined });
    }
  }
  // Deaths and the winner, once each: every player's screen shows the same line within a moment, but the same words
  // later on ("X fell into the void." again) are a new event.
  const lastSeen = new Map();
  for (const c of jsonl(path.join(rec, 'chat.jsonl'))) {
    if (/recipe|advancement/i.test(c.text)) continue;
    if (c.t - (lastSeen.get(c.text) ?? -Infinity) < 2) continue;
    lastSeen.set(c.text, c.t);
    const death = names.find((n) => c.text.startsWith(`${n} `) && /void|slain|killed|died|fell|knocked|shot/i.test(c.text));
    const killer = death ? names.find((n) => n !== death && c.text.includes(` ${n}`)) ?? null : null;
    filmEvents.push(death ? { t: c.t, kind: 'death', who: death, by: killer, text: c.text } : { t: c.t, kind: 'chat', text: c.text });
  }
  filmEvents.sort((a, b) => a.t - b.t);

  // The thinking: each strategy's log lines, and each agent's own words while the round was on (and a minute either side).
  const thoughts = [];
  for (const n of names) {
    for (const l of jsonl(path.join(rec, `strategy-${n}.jsonl`))) thoughts.push({ t: l.t, who: n, kind: 'strategy', text: l.line });
    if (agentsDir && result.recorderT0) for (const w of agentWords(path.join(agentsDir, n), result.recorderT0, t0 - 60, tEnd + 60)) thoughts.push({ ...w, who: n });
  }
  thoughts.sort((a, b) => a.t - b.t);

  const film = {
    version: 1, game, round, frameSeconds: FRAME_SECONDS,
    clock: { start: t0, playing: result.playingT ?? null, end: result.endT ?? null, recorderT0: result.recorderT0 ?? null, note: 'seconds on the recording clock; wall time = recorderT0 + t * 1000' },
    players: players.map((p) => ({ ...p, video: `video/${p.name}.webm`, screens: `video/hud/${p.name}-*.jpg`, versions: `versions/${p.name}/` })),
    result: { winner: result.winnerName ?? null, endReason: result.endReason ?? null, seconds: result.seconds ?? null, scoresAfter: scores },
    map: 'recording/arena-blocks.json', landmarks: 'recording/landmarks.json',
    frameLayout: ['x', 'y', 'z', 'yaw', 'pitch', 'health', 'held', 'armorPoints', 'armor[head,chest,legs,feet]', 'flags (d dead, s sneak, r sprint, a attack, u use, o screen)'],
    frames: filmFrames, blockChanges, events: filmEvents, thoughts,
  };
  writeFileSync(path.join(matchDir, 'film.json'), JSON.stringify(film));
  return { frames: filmFrames.length, blockChanges: blockChanges.length, events: filmEvents.length, thoughts: thoughts.length };
}
