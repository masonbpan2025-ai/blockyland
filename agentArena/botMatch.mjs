// One bot match from start to finish (agentArena/docs/running.md): a referee browser tab hosts the room and runs the
// game's rules without playing (src/mods/bedwars/client.js refereeHost), each player is a guest bot driven by its
// strategy program (botRunner.mjs), and everything is recorded: the referee's camera, every player's state ten times a
// second, block changes, hits, deaths, chat, every action and every log line.
import { mkdirSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';
import { startVite, launchBrowser, openPlayerTab, installProbe, hostRoom, startRoom, Recorder, sleep } from './match.mjs';
import { GuestPeerSession } from '../packages/blockyland-mcp/guestPeer.js';
import { BotPlayer, TICK_MS } from './botRunner.mjs';
import { ScriptedBotSession } from './scriptedBot/scriptedBot.mjs';
import { ScriptedRecording } from './scriptedRecording.mjs';

/** The arena's time limit for each game, in seconds of play; at the limit the round is a tie. */
export const MATCH_CAPS = Object.freeze({ skywars: 300, bedwars: 600 });
const REFEREE = 'Referee';

/**
 * @param {object} o
 * @param {'skywars'|'bedwars'} o.game
 * @param {{name:string, strategyFile:string|null}[]} o.players a null strategy file stands still (the practice dummy)
 * @param {string} o.outDir this match's folder: recording/, video/, versions/
 * @param {object[]} [o.setup] practice only: per player, where to put it and what to give it once play begins
 * @param {boolean} [o.practiceMap] play on the three-island practice map (practice games), not the full one
 * @param {string} [o.bedwarsLayout] a Bed Wars layout (src/mods/bedwars/layouts.js); the Classic Cross when not given
 * @param {string} [o.bedwarsMode] a Bed Wars mode (src/mods/bedwars/teams.js MODES): 'duel' (4v4) when not given,
 *   'fives' for five teams of four; a player's `team` puts it on that team
 * @param {number} [o.bedwarsSeed] the Bed Wars map's seed (a fresh one when not given)
 */
export async function runBotMatch({ game, players, outDir, statusDir = null, startAt = () => 0, log = console.log, onPhase = () => {}, maxSeconds = MATCH_CAPS[game], port = 3041, schedule = {}, video = true, setup = null, headed = false, practiceMap = false, bedwarsLayout = null, bedwarsMode = 'duel', bedwarsSeed = null, skywarsTemplate = null, skywarsPack = null, skywarsSeed = null, difficulty = null, onTick = null, statusEveryTicks = 50 }) {
  mkdirSync(outDir, { recursive: true });
  if (statusDir) mkdirSync(statusDir, { recursive: true });
  const rec = new Recorder(path.join(outDir, 'recording'));
  const videoDir = video ? path.join(outDir, 'video') : null;
  const videoFiles = new Map();
  if (videoDir) { mkdirSync(path.join(videoDir, 'hud'), { recursive: true }); videoFiles.set(REFEREE, path.join(videoDir, 'arena.webm')); }
  const { vite, base } = await startVite({ port, videoFiles });
  const browser = await launchBrowser({ headed });
  const result = { game, players: players.map((p) => p.name), host: REFEREE, recorderT0: rec.t0, maxSeconds };
  const sessions = [];
  let tab = null;
  try {
    log(`${game}: opening the referee's tab on ${base}`);
    tab = await openPlayerTab(browser, base, { name: REFEREE, referee: true, onLog: (l) => { log(l); rec.write('events.jsonl', { kind: 'page_error', text: l.slice(0, 300) }); } });
    const code = await hostRoom(tab.page, game, { practice: practiceMap, bedwarsLayout, bedwarsMode, bedwarsSeed, skywarsTemplate, skywarsPack, skywarsSeed });
    // The room's Difficulty, which every autopilot guest (MCP or house) adopts.
    if (difficulty) await tab.page.evaluate(({ g, d }) => window.game[g].chooseDifficulty?.(d), { g: game, d: difficulty });
    await installProbe(tab.page);
    log(`${game}: room ${code}, refereed${practiceMap ? ', on the practice map' : ''}`);
    const url = `${base.replace(/^http/, 'ws')}/ws/share`;
    // The referee's chat box shows every game message (deaths, beds, the winner): each player gets them as `message`.
    const inbox = new Map(players.map((p) => [p.name, []]));
    const getMessages = (bp) => inbox.get(bp.name).splice(0);
    const arena = [];
    const scriptedRecordings = [];
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      // { name, autopilot: 'normal' }: an MCP guest with its built-in autopilot on, as join_game makes one.
      // { name, scripted: 'normal' }: the scripted bot (agentArena/scriptedBot/), or with p.sessionModule another
      // version of it (a module exporting ScriptedBotSession: an Agent Arena agent's, scriptedArena.mjs). The older
      // spelling { houseAutopilot: 'normal' } means the same.
      const scripted = p.scripted ?? p.houseAutopilot;
      if (p.autopilot || scripted) {
        let Session = ScriptedBotSession;
        if (scripted && p.sessionModule) {
          // The entry module evaluated afresh for every player; the files it imports are loaded once, so one agent's bots
          // can share memory through them (a team's own radio), never with another agent's (other files).
          const m = await import(`${pathToFileURL(p.sessionModule).href}?v=${Date.now()}-${i}`);
          Session = m.ScriptedBotSession ?? m.HouseAutopilotSession;
        }
        const session = scripted
          ? new Session({ code, name: p.name, url, difficulty: scripted, ...(p.brain ? { brain: p.brain } : {}), ...(p.planner ? { planner: p.planner } : {}), ...(p.runPlan ? { runPlan: p.runPlan } : {}) })
          : new GuestPeerSession({ code, name: p.name, url, autopilot: true, difficulty: p.autopilot });
        await session.connect({ timeoutMs: 60000, team: p.team ?? null });
        p.onSession?.(session); // e.g. a referee around its packets
        if (scripted) session.startHouseBrain();
        // Where its shots end (the bot API's projectile flight), in the events.
        if (scripted) EventEmitter.prototype.on.call(session.bot, 'projectileEnd', (e) => rec.write('events.jsonl', { kind: 'projectile', who: p.name, projectile: e.kind, hit: e.hit ? (session.peers.get(e.hit.id)?.name ?? e.hit.id) : null, block: e.block ?? null, lost: !!e.lost, ticks: e.ticks }));
        // Recorded for the film as a strategy player is: frames, hurts, block changes, the map, what it was doing.
        if (scripted) scriptedRecordings.push(new ScriptedRecording({ name: p.name, session, rec, game, watchBlocks: scriptedRecordings.length === 0 && arena.length === 0 }));
        sessions.push(session);
        log(`${game}: ${p.name} joined as ${scripted ? `a scripted bot${p.sessionModule ? ` (${p.sessionModule})` : ''}` : 'an MCP autopilot guest'}`);
        continue;
      }
      const session = new GuestPeerSession({ code, name: p.name, url, autopilot: false, difficulty: p.rules?.difficulty ?? 'normal' });
      await session.connect({ timeoutMs: 60000 });
      sessions.push(session);
      arena.push(new BotPlayer({ rules: p.rules,
        name: p.name, session, strategyFile: p.strategyFile, versionsDir: path.join(outDir, 'versions', p.name), recorder: rec, statusDir,
        seed: 1000 + i, game, getMatch: () => null, getMessages, timeLimit: maxSeconds,
      }));
      log(`${game}: ${p.name} joined (${session.me?.()?.team ?? `island ${session.me?.()?.slot}`})`);
    }
    rec.write('events.jsonl', { kind: 'room', game, code, host: REFEREE, players: players.map((p) => p.name) });
    const phaseOf = () => (game === 'bedwars' ? sessions[0].bedwarsState?.phase : sessions[0].skywarsState?.phase) ?? 'lobby';
    const statusExtra = (phase) => ({ game, arenaPhase: phase, startsAt: startAt() ? new Date(startAt()).toISOString() : null, schedule });
    const writeStatus = (a, phase, extra = {}) => {
      if (!statusDir) return;
      try {
        writeFileSync(path.join(statusDir, `${a.name}.json`), JSON.stringify(a.status({ ...statusExtra(phase), ...extra }), null, 1));
        const v = a.viewForAgent();
        if (v) writeFileSync(path.join(statusDir, `${a.name}.view.json`), JSON.stringify(v, null, 1));
      } catch { /* next second */ }
    };

    // The lobby: the players can look at their state (arena status) until the start.
    onPhase({ phase: 'lobby' });
    let lastStatus = 0;
    while (Date.now() < startAt()) {
      for (const a of arena) a.step({ playing: false });
      if (Date.now() - lastStatus > 1000) { lastStatus = Date.now(); for (const a of arena) writeStatus(a, 'lobby'); }
      await sleep(500);
    }
    for (const a of arena) { a.checkForUpdate(); log(`${a.name}: strategy version ${a.version}${a.loadError ? ` (load error: ${a.loadError.split('\n')[0]})` : ''}`); }

    // The arena's time limit on every screen and in every state the host publishes (the sidebar counts down to it).
    await tab.page.evaluate(({ g, limit }) => {
      const m = window.game[g]?.match;
      if (!m || m.__arenaLimit) return;
      const original = m.snapshot.bind(m);
      m.snapshot = () => {
        const s = original();
        s.arenaTimeLimit = limit;
        if (g === 'skywars') { s.timeLimit = limit; if (s.nextRefill !== null && s.nextRefill >= limit) s.nextRefill = null; }
        else if ((s.phase === 'playing' || s.phase === 'countdown') && !s.next) s.next = { label: 'Time limit (tie)', in: Math.max(0, Math.ceil(limit - (s.elapsed ?? 0))) };
        return s;
      };
      // The rules' own time limit too: their closing zone (src/mods/closingZone.js) and Bed Wars' Bed Destruction work back from it.
      m.timeLimit = limit;
      m.__arenaLimit = limit;
    }, { g: game, limit: maxSeconds }).catch((e) => log(`${game}: could not show the time limit: ${e.message}`));
    // For the film: a dead player's loot as it is dropped (who, where, what) and every pickup (who took which), as the
    // host's SkyWars client decides them (client.js dropFor, grantClaim). Collected with the chat below.
    if (game === 'skywars') await tab.page.evaluate(() => {
      const c = window.game.skywars, A = window.__arena;
      if (!c || c.__arenaDrops) return;
      A.drops = [];
      const nameOf = (id) => c.match?.players?.get(id)?.name ?? String(id);
      const dropFor = c.dropFor.bind(c), grantClaim = c.grantClaim.bind(c);
      c.dropFor = (peerId, data) => {
        const before = c.dropSeq ?? 0;
        dropFor(peerId, data);
        for (let s = before + 1; s <= (c.dropSeq ?? 0); s++) {
          const id = `${c.match.round}-${s}`, rec = c.dropRecords.get(id);
          if (rec) A.drops.push({ kind: 'drop', id, from: nameOf(peerId), x: data.x, y: data.y, z: data.z, item: { id: rec.item.id, count: rec.item.count, isBlock: rec.item.isBlock } });
        }
      };
      c.grantClaim = (by, id) => {
        const rec = c.dropRecords.get(id), was = rec?.taken;
        grantClaim(by, id);
        if (rec && !was && rec.taken) A.drops.push({ kind: 'taken', id, by: nameOf(by), item: { id: rec.item.id, count: rec.item.count, isBlock: rec.item.isBlock } });
      };
      c.__arenaDrops = true;
    }).catch((e) => log(`${game}: could not record drops: ${e.message}`));
    // The referee's camera: straight above the middle, the map's long axis across the screen, no HUD (F1), no fog.
    await tab.page.evaluate(() => {
      const g = window.game; const p = g.player;
      try { p.gamemode = 'spectator'; } catch { /* fine */ }
      const hold = () => { p.position.set(0.5, 86, 0.5); p.velocity?.set?.(0, 0, 0); p.yaw = Math.PI / 2; p.pitch = -1.52; if (g.scene?.fog) { g.scene.fog.near = 200; g.scene.fog.far = 400; } for (const c of g.camera?.children ?? []) c.visible = false; };
      hold();
      g.toggleHud?.();
      g.__arenaCamera = setInterval(hold, 200);
    }).catch(() => {});
    if (videoDir) {
      const mime = await tab.page.evaluate((u) => window.__arena.startVideo(u), `/__arena/video/${encodeURIComponent(REFEREE)}`).catch((e) => `failed: ${e.message}`);
      rec.write('events.jsonl', { kind: 'video_start', who: REFEREE, mime });
    }
    await startRoom(tab.page, game);
    const t0 = Date.now();
    log(`${game}: started`);
    rec.write('events.jsonl', { kind: 'start', game });

    let lastPhase = null, endedAt = null, lastShot = 0, shooting = null, playingAt = null, calledAt = null, wroteMap = false, tick = 0;
    for (;;) {
      const tickStart = Date.now();
      tick++;
      if (videoDir && !shooting && tickStart - lastShot >= 5000) {
        lastShot = tickStart;
        const at = rec.t().toFixed(1).padStart(7, '0');
        shooting = tab.page.screenshot({ path: path.join(videoDir, 'hud', `arena-${at}.jpg`), type: 'jpeg', quality: 60 }).catch(() => {}).finally(() => { shooting = null; });
      }
      // Game messages, from the referee's chat box, every 100 ms.
      if (tick % 2 === 0) {
        const news = await tab.page.evaluate(() => ({ ...window.__arena.takeNews(), drops: window.__arena.drops?.splice(0) ?? [] })).catch(() => ({ chat: [], drops: [] }));
        for (const d of news.drops ?? []) rec.write('events.jsonl', d);
        for (const c of news.chat) {
          if (/recipe|advancement|Loaded Mod|joined the world|PvP is on/i.test(c.text)) continue;
          rec.write('chat.jsonl', { who: REFEREE, text: c.text });
          for (const box of inbox.values()) box.push(c.text);
        }
      }
      const phase = phaseOf();
      const playing = phase === 'playing';
      if (phase !== lastPhase) { rec.write('events.jsonl', { kind: 'phase', phase }); lastPhase = phase; log(`${game}: phase ${phase}`); if (playing) onPhase({ phase: 'playing', startedAt: Date.now() }); }
      if (playing && !playingAt) {
        playingAt = Date.now();
        result.playingT = rec.t();
        // A practice setup, as play begins.
        for (let i = 0; i < sessions.length && setup; i++) if (setup[i]) { const done = applySetup(sessions[i], setup[i]); rec.write('events.jsonl', { kind: 'practice_setup', who: players[i].name, done }); arena.find((a) => a.name === players[i].name)?.log(`[arena] practice setup: ${done.join('; ')}`); }
      }
      // A diagnostic hook, every tick: the referee's page, the guests' sessions, the recorder.
      if (onTick) { try { await onTick({ page: tab.page, sessions, players, rec, playing, tick }); } catch (err) { log(`onTick: ${err.message}`); } }
      const steps = arena.map((a) => { try { return a.step({ playing }); } catch (err) { log(`${a.name} step: ${err.stack ?? err}`); return null; } });
      if (playing && !wroteMap && arena.length) {
        wroteMap = true;
        const dump = arena[0].worldDump();
        rec.json('arena-blocks.json', dump);
        rec.json('landmarks.json', steps[0]?.state?.arena?.landmarks ?? null);
      }
      if (steps[0]?.blocks?.length) rec.write('world.jsonl', { changes: steps[0].blocks });
      // The scripted players: the map once as play begins (when no strategy player wrote it), then every tick.
      if (playing && !wroteMap && scriptedRecordings.length) { wroteMap = true; rec.json('arena-blocks.json', scriptedRecordings[0].worldDump()); }
      for (const r of scriptedRecordings) r.step();
      if (tickStart - lastStatus > 1000) { lastStatus = tickStart; for (const a of arena) writeStatus(a, phase === 'ended' ? 'ended' : 'playing'); }
      // An MCP autopilot guest has no program log: its place and what it is doing go in the events, every 5 s.
      if (tick % statusEveryTicks === 0) players.forEach((p, i) => { if (!p.autopilot && !p.houseAutopilot && !p.scripted) return; const s = sessions[i]; rec.write('events.jsonl', { kind: 'autopilot_status', who: p.name, pos: { x: +s.position.x.toFixed(1), y: +s.position.y.toFixed(1), z: +s.position.z.toFixed(1) }, health: s.health, doing: s.lastActionSummary ?? null, busy: { brain: !!s.brainBusy, manual: !!s.manualActionBusy, chat: !!s.chatTaskBusy }, knockback: !!s.knockbackActive, onGround: s.onGround, sinceHit: s.lastMeleeAt ? Date.now() - s.lastMeleeAt : null, dead: !!s.isDead, mode: s.gamemode, held: s.inventory?.getActiveItem?.()?.id ?? null, food: s.food, absorption: s.absorption || 0 }); });
      const st = game === 'bedwars' ? sessions[0].bedwarsState : sessions[0].skywarsState;
      if (phase === 'ended' && !endedAt) {
        endedAt = Date.now();
        const winner = calledAt ? null : st?.winner ?? null;
        const winnerName = winner === null ? null : (st?.players ?? []).find((p) => p.id === winner || p.team === winner)?.name ?? null;
        Object.assign(result, { winner, winnerName, endReason: calledAt ? 'time_limit' : st?.endReason ?? null, scoreboard: st?.players ?? null, teams: st?.teams ?? null, endT: rec.t() });
        log(`${game}: ended (${result.endReason}), winner ${JSON.stringify(winnerName)}`);
      }
      if (endedAt && Date.now() - endedAt > 5000) break;
      if (!endedAt && playingAt && (Date.now() - playingAt) / 1000 > maxSeconds && !calledAt) {
        calledAt = Date.now();
        log(`${game}: time limit (${maxSeconds} s of play): a tie`);
        rec.write('events.jsonl', { kind: 'time_limit', seconds: maxSeconds });
        await tab.page.evaluate((g) => { const c = window.game[g]; c.match?.end?.(null, 'time'); c.publish?.(); }, game).catch((e) => log(`${game}: could not end the game: ${e.message}`));
      }
      if (!endedAt && ((calledAt && Date.now() - calledAt > 10000) || (Date.now() - t0) / 1000 > maxSeconds + 120)) {
        Object.assign(result, { winner: null, winnerName: null, endReason: 'time_limit', scoreboard: st?.players ?? null, teams: st?.teams ?? null, endT: rec.t() });
        log(`${game}: stopped at the time limit`);
        break;
      }
      await sleep(Math.max(0, TICK_MS - (Date.now() - tickStart)));
    }
    result.seconds = Math.round((Date.now() - t0) / 1000);
    result.strategies = Object.fromEntries(arena.map((a) => [a.name, { versions: a.version, errors: a.stats.errors, slowTicks: a.stats.slow, ticks: a.stats.ticks, inputs: a.stats.actions, failedActions: a.stats.failed, restarts: a.stats.restarts }]));
    for (const a of arena) a.stopActions();
    if (videoDir) {
      await shooting;
      const bytes = await tab.page.evaluate(() => window.__arena.stopVideo?.()).catch(() => null);
      rec.write('events.jsonl', { kind: 'video_stop', who: REFEREE, bytes });
      result.videos = ['video/arena.webm'];
    }
    for (const a of arena) writeStatus(a, 'ended', { result });
    rec.write('events.jsonl', { kind: 'end', result });
    await rec.close();
    return result;
  } finally {
    for (const s of sessions) { try { s.disconnect(); } catch { /* gone */ } }
    if (tab) await tab.context.close().catch(() => {});
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
    for (const file of videoFiles.values()) remux(file, log);
    writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2));
  }
}

/** Practice setups: where the player stands and what it has, as play begins (agent-rules.md, Practice). */
function applySetup(session, spec) {
  const done = [];
  const inv = session.inventory;
  if (spec.clear) { inv.hotbar.fill(null); inv.storage.fill(null); for (const k of Object.keys(inv.armor ?? {})) inv.armor[k] = null; done.push('cleared'); }
  for (const { item, count = 1 } of spec.give ?? []) {
    const id = session.resolveBlockId?.(item);
    const ok = Number.isInteger(id) && id > 0 ? inv.addItem(id, true, count) : inv.addItem(String(item), false, count);
    done.push(`${item} x${count}: ${ok === false ? 'no room' : 'given'}`);
  }
  for (const [slot, item] of Object.entries(spec.armor ?? {})) if (item && inv.armor && slot in inv.armor) { inv.armor[slot] = { id: item, isBlock: false, count: 1 }; done.push(`wearing ${item}`); }
  if (spec.at) { session.position = { x: spec.at.x, y: spec.at.y, z: spec.at.z }; done.push(`moved to ${spec.at.x} ${spec.at.y} ${spec.at.z}`); }
  if (typeof spec.yaw === 'number') session.yaw = spec.yaw;
  session.broadcastState?.();
  return done;
}

function remux(file, log) {
  if (!existsSync(file)) return;
  const tmp = file.replace(/.webm$/, '.remux.webm');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-c', 'copy', tmp], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status === 0 && existsSync(tmp)) { unlinkSync(file); renameSync(tmp, file); }
  else { log(`video ${file}: kept as recorded (ffmpeg: ${r.error?.message ?? String(r.stderr ?? '').slice(0, 200)})`); if (existsSync(tmp)) unlinkSync(tmp); }
}
