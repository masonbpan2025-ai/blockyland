// Run one match from start to finish: the room, the lobby wait, the match, the recording. Used by run.mjs (agents) and
// play.mjs (strategy files only, to test the arena).
import { mkdirSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  startVite, launchBrowser, openPlayerTab, installProbe, hostRoom, joinRoom, startRoom,
  ArenaPlayer, Recorder, writeStatus, TICK_MS, sleep,
} from './match.mjs';

/**
 * The arena's time limit for each game, in seconds of play (from the end of the countdown). At the limit the arena ends
 * the game with no winner: a tie (agentArena/docs/agent-rules.md, "Rounds and scoring").
 */
export const MATCH_CAPS = Object.freeze({ skywars: 300, bedwars: 600 });

/**
 * @param {object} o
 * @param {'skywars'|'bedwars'} o.game
 * @param {{name:string, strategyFile:string}[]} o.players the first hosts the room
 * @param {string} o.outDir this match's folder: recording/, video/, versions/
 * @param {string} [o.statusDir] where `arena status` reads from
 * @param {() => number} [o.startAt] epoch ms when to start (polled, so it can move); default: as soon as everyone is in
 * @param {(line:string)=>void} [o.log]
 * @param {(info:object)=>void} [o.onPhase] the match's phase as it changes, with its schedule
 * @param {object[]} [o.setup] practice games only: per player, where to put it and what to give it once play begins
 *   (probe.js practiceSetup)
 */
export async function runMatch({ game, players, outDir, statusDir = null, startAt = () => 0, log = console.log, onPhase = () => {}, headed = false, limits = {}, maxSeconds = MATCH_CAPS[game], port = 3041, schedule = {}, video = true, onStarted = null, setup = null }) {
  mkdirSync(outDir, { recursive: true });
  if (statusDir) mkdirSync(statusDir, { recursive: true });
  const rec = new Recorder(path.join(outDir, 'recording'));
  const videoDir = video ? path.join(outDir, 'video') : null;
  const videoFiles = new Map();
  if (videoDir) {
    mkdirSync(path.join(videoDir, 'hud'), { recursive: true });
    for (const p of players) videoFiles.set(p.name, path.join(videoDir, `${p.name}.webm`));
  }
  const { vite, base } = await startVite({ port, videoFiles });
  const browser = await launchBrowser({ headed });
  const tabs = [];
  // recorderT0: the wall-clock moment the recording's `t` counts from, to place other records (the agents' thinking) on it.
  const result = { game, players: players.map((p) => p.name), host: players[0].name, recorderT0: rec.t0, maxSeconds };
  try {
    log(`${game}: opening ${players.length} tabs on ${base}`);
    for (const p of players) tabs.push(await openPlayerTab(browser, base, { name: p.name, onLog: (l) => { log(l); rec.write('events.jsonl', { kind: 'page_error', text: l.slice(0, 300) }); } }));
    const code = await hostRoom(tabs[0].page, game);
    log(`${game}: room ${code} hosted by ${players[0].name}`);
    for (let i = 1; i < players.length; i++) { await joinRoom(tabs[i].page, code, game); log(`${game}: ${players[i].name} joined`); }
    for (const t of tabs) await installProbe(t.page);
    const arena = players.map((p, i) => new ArenaPlayer({
      name: p.name, page: tabs[i].page, strategyFile: p.strategyFile, versionsDir: path.join(outDir, 'versions', p.name),
      recorder: rec, statusDir, limits, seed: 1000 + i,
    }));
    rec.write('events.jsonl', { kind: 'room', game, code, host: players[0].name, players: players.map((p) => p.name) });

    const statusExtra = (phase) => ({ game, arenaPhase: phase, startsAt: startAt() ? new Date(startAt()).toISOString() : null, startsInSeconds: startAt() ? Math.max(0, Math.round((startAt() - Date.now()) / 1000)) : null, schedule });
    // The lobby: everyone can look at the view (arena status) until the start.
    onPhase({ phase: 'lobby' });
    let lastStatus = 0;
    while (Date.now() < startAt()) {
      for (const a of arena) await a.step({ playing: false }).catch((e) => log(`${a.name} lobby step: ${e.message}`));
      if (Date.now() - lastStatus > 1000) { lastStatus = Date.now(); for (const a of arena) writeStatus(statusDir, a, statusExtra('lobby')); }
      await sleep(1000);
    }
    for (const a of arena) {
      a.runner.checkForUpdate();
      log(`${a.name}: strategy version ${a.runner.version}${a.runner.loadError ? ` (load error: ${a.runner.loadError.split('\n')[0]})` : ''}`);
    }
    // Each player's view is filmed from here to the end (probe.js startVideo), the countdown included.
    if (videoDir) {
      for (let i = 0; i < tabs.length; i++) {
        const mime = await tabs[i].page.evaluate((u) => window.__arena.startVideo(u), `/__arena/video/${encodeURIComponent(players[i].name)}`).catch((e) => `failed: ${e.message}`);
        rec.write('events.jsonl', { kind: 'video_start', who: players[i].name, mime });
      }
    }
    // The arena's time limit, on every player's screen and in every view: the host's game publishes it in place of its
    // own longer limit (the SkyWars sidebar counts down to it; the Bed Wars sidebar shows it as the next event).
    await tabs[0].page.evaluate(({ g, limit }) => {
      const m = window.game[g]?.match;
      if (!m || m.__arenaLimit) return;
      const original = m.snapshot.bind(m);
      m.snapshot = () => {
        const s = original();
        s.arenaTimeLimit = limit;
        if (g === 'skywars') {
          s.timeLimit = limit;
          if (s.nextRefill !== null && s.nextRefill >= limit) s.nextRefill = null;
        } else if (s.phase === 'playing' || s.phase === 'countdown') {
          const left = Math.max(0, Math.ceil(limit - (s.elapsed ?? 0)));
          if (!s.next || s.next.in >= left) s.next = { label: 'Time limit (tie)', in: left };
        }
        return s;
      };
      m.__arenaLimit = limit;
    }, { g: game, limit: maxSeconds }).catch((e) => log(`${game}: could not show the time limit: ${e.message}`));
    for (const a of arena) a.timeLimit = maxSeconds;
    await startRoom(tabs[0].page, game);
    await tabs[0].page.waitForFunction((g) => ['countdown', 'playing'].includes(window.game[g]?.phase), game, { timeout: 30000 });
    const t0 = Date.now();
    log(`${game}: started`);
    rec.write('events.jsonl', { kind: 'start', game });
    onPhase({ phase: 'playing', startedAt: t0 });
    for (const a of arena) {
      await a.loadBlocks();
      a.startPump();
    }
    rec.json('arena-blocks.json', arena[0].fullBlocks());
    rec.json('landmarks.json', arena[0].landmarks);
    await onStarted?.(tabs.map((t) => t.page));

    let lastPhase = null, endedAt = null, lastShot = 0, shooting = null, playingAt = null, calledAt = null;
    while (true) {
      const tickStart = Date.now();
      // A still of each whole screen, HUD and open windows included, every five seconds.
      if (videoDir && !shooting && tickStart - lastShot >= 5000) {
        lastShot = tickStart;
        const at = rec.t().toFixed(1).padStart(7, '0');
        shooting = Promise.all(tabs.map((t, i) => t.page.screenshot({ path: path.join(videoDir, 'hud', `${players[i].name}-${at}.jpg`), type: 'jpeg', quality: 60 }).catch(() => {})))
          .finally(() => { shooting = null; });
      }
      const steps = await Promise.all(arena.map((a) => a.step({ playing: true }).catch((e) => { log(`${a.name} step: ${e.message}`); return null; })));
      const hostView = steps[0]?.view;
      if (steps[0]?.blocks?.length) rec.write('world.jsonl', { changes: steps[0].blocks });
      const phase = hostView?.phase;
      if (phase && phase !== lastPhase) { rec.write('events.jsonl', { kind: 'phase', phase }); lastPhase = phase; log(`${game}: phase ${phase}`); }
      if (phase === 'playing' && !playingAt) {
        playingAt = Date.now();
        result.playingT = rec.t();
        // A practice setup: each player where its setup says, with what it says, as play begins.
        for (let i = 0; i < tabs.length && setup; i++) {
          if (!setup[i]) continue;
          const done = await tabs[i].page.evaluate((s) => window.__arena.practiceSetup(s), setup[i]).catch((e) => [`setup failed: ${e.message}`]);
          rec.write('events.jsonl', { kind: 'practice_setup', who: players[i].name, done });
          arena[i].log(`[arena] practice setup: ${done.join('; ')}`);
        }
      }
      if (Date.now() - lastStatus > 1000) { lastStatus = Date.now(); for (const a of arena) writeStatus(statusDir, a, statusExtra(phase === 'ended' ? 'ended' : 'playing')); }
      if (phase === 'ended' && !endedAt) {
        endedAt = Date.now();
        Object.assign(result, { winner: calledAt ? null : hostView.match.winner, endReason: calledAt ? 'time_limit' : hostView.match.endReason, scoreboard: hostView.match.players, teams: hostView.match.teams ?? null, endT: rec.t() });
        log(`${game}: ended (${result.endReason}), winner ${JSON.stringify(result.winner)}`);
      }
      // Five more seconds of film after the end: the titles and the winner.
      if (endedAt && Date.now() - endedAt > 5000) break;
      // The arena's time limit: the host's game ends the match with no winner, so the players see it end. If the game
      // does not end within 10 s, the arena stops recording anyway.
      if (!endedAt && playingAt && (Date.now() - playingAt) / 1000 > maxSeconds && !calledAt) {
        calledAt = Date.now();
        log(`${game}: time limit (${maxSeconds} s of play): a tie`);
        rec.write('events.jsonl', { kind: 'time_limit', seconds: maxSeconds });
        await tabs[0].page.evaluate((g) => { const c = window.game[g]; c.match?.end?.(null, 'time'); c.publish?.(); }, game).catch((e) => log(`${game}: could not end the game: ${e.message}`));
      }
      if (!endedAt && ((calledAt && Date.now() - calledAt > 10000) || (Date.now() - t0) / 1000 > maxSeconds + 120)) {
        Object.assign(result, { winner: null, endReason: 'time_limit', scoreboard: hostView?.match?.players ?? null, teams: hostView?.match?.teams ?? null, endT: rec.t() });
        log(`${game}: stopped at the time limit`);
        break;
      }
      await sleep(Math.max(0, TICK_MS - (Date.now() - tickStart)));
    }
    result.seconds = Math.round((Date.now() - t0) / 1000);
    // Who the winner id is, by name.
    const roster = steps0Roster(arena);
    if (result.winner !== undefined && result.winner !== null) {
      const w = result.winner;
      result.winnerName = roster.get(w) ?? (typeof w === 'string' ? w : null);
    }
    result.strategies = Object.fromEntries(arena.map((a) => [a.name, { versions: a.runner.version, loads: a.runner.loads, errors: a.runner.errorCount, slowTicks: a.runner.slowTicks, ticks: a.runner.ticks, inputs: a.input.executed, avgEvalMs: +(a.timing.evalMs / Math.max(1, a.timing.n)).toFixed(1), avgRunMs: +(a.timing.runMs / Math.max(1, a.timing.n)).toFixed(1), avgLagMs: a.lagCount ? Math.round(a.lagSum / a.lagCount) : null }]));
    for (const a of arena) await a.stop();
    if (videoDir) {
      await shooting;
      for (let i = 0; i < tabs.length; i++) {
        const bytes = await tabs[i].page.evaluate(() => window.__arena.stopVideo?.()).catch(() => null);
        rec.write('events.jsonl', { kind: 'video_stop', who: players[i].name, bytes });
      }
      result.videos = players.map((p) => `video/${p.name}.webm`);
    }
    for (const a of arena) writeStatus(statusDir, a, { ...statusExtra('ended'), result });
    rec.write('events.jsonl', { kind: 'end', result });
    await rec.close();
    return result;
  } finally {
    for (const t of tabs) await t.context.close().catch(() => {});
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
    // A recorder's WebM has no duration or index; copying it through ffmpeg (when there is one) adds them.
    for (const file of videoFiles.values()) remux(file, log);
    writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2));
  }
}

/** Player ids (as the match state names them) to names, from the host's last view. */
function steps0Roster(arena) {
  const m = new Map();
  const match = arena[0].lastView?.match;
  for (const p of match?.players ?? []) m.set(p.id ?? p.name, p.name);
  return m;
}

/** Rewrite a WebM with its duration and cues, without re-encoding; the raw file is kept if ffmpeg is missing or fails. */
function remux(file, log) {
  if (!existsSync(file)) return;
  const tmp = file.replace(/.webm$/, '.remux.webm');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-c', 'copy', tmp], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status === 0 && existsSync(tmp)) { unlinkSync(file); renameSync(tmp, file); }
  else { log(`video ${file}: kept as recorded (ffmpeg: ${r.error?.message ?? String(r.stderr ?? '').slice(0, 200)})`); if (existsSync(tmp)) unlinkSync(tmp); }
}
