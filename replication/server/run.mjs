#!/usr/bin/env node
// The replication run's server: the Blockyland world in a headless page (server.html), a Mineflayer-style bot per
// player, and an HTTP API the agents' CLI calls to run programs.
//
//   node replication/server/run.mjs --run=replication/runs/run1 --players=Ada,Bo,Cy,Di [--port=7790] [--seed=N]
//
// HTTP (127.0.0.1 only):
//   POST /run     {player, code, timeout}  -> {output}      run a program as that player
//   GET  /status                            -> players' positions, dimensions, health
//   GET  /events?since=N                    -> the event log (chat, deaths, dimension changes, advancements)
// Everything is logged in the run folder: events.jsonl, programs/<player>.jsonl, chat.log.
import http from 'node:http';
import { mkdirSync, appendFileSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { launchServerPage } from './launch.mjs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readdirSync, copyFileSync, unlinkSync } from 'node:fs';
import { Worker } from 'node:worker_threads';

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const runDir = path.resolve(arg('run', 'replication/runs/dev'));
const port = Number(arg('port', 7790));
const seed = Number(arg('seed', 20261103));
const playerNames = arg('players', 'Ada').split(',').map(s => s.trim()).filter(Boolean);
// --tokens=<file>: {player: token}. Each agent's CLI sends its own (BL_TOKEN), so no agent can drive another's bot.
// The researchers' controls (dashboard): pause and resume the world, with this admin token.
mkdirSync(runDir, { recursive: true });
const adminFile = path.join(runDir, 'admin.json');
const adminToken = existsSync(adminFile) ? JSON.parse(readFileSync(adminFile, 'utf8')).token : (await import('node:crypto')).randomBytes(12).toString('hex');
writeFileSync(adminFile, JSON.stringify({ token: adminToken }));
const tokens = arg('tokens', null) ? JSON.parse(readFileSync(path.resolve(arg('tokens')), 'utf8')) : null;
mkdirSync(path.join(runDir, 'programs'), { recursive: true });

const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1);
const logEvent = (e) => { const line = JSON.stringify({ wall: new Date().toISOString(), ...e }); appendFileSync(path.join(runDir, 'events.jsonl'), line + '\n'); };

// --restore=latest | <file>: start from a save (the paper's server restarted from its latest save after a failure).
const savesDir = path.join(runDir, 'saves'); mkdirSync(savesDir, { recursive: true });
const restoreArg = arg('restore', null);
let save = null;
if (restoreArg) {
  const file = restoreArg === 'latest' ? path.join(savesDir, 'latest.json.gz') : path.resolve(restoreArg);
  save = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
  console.log(`[server] restoring ${file} (saved ${save.savedAt}, tick ${save.ticks})`);
}
console.log(`[server] starting world (seed ${save?.seed ?? seed}) in a headless page…`);
const s = await launchServerPage({ seed, save, onConsole: (k, m) => logEvent({ kind: 'page_' + k, message: m.slice(0, 500) }) });
if (save) logEvent({ kind: 'restored', from: save.savedAt, tick: save.ticks });
const { page } = s;
logEvent({ kind: 'server_start', seed, players: playerNames, spawn: s.started.spawn });

let pending = [];
const transport = {
  call(method, ...args) {
    return page.evaluate(([m, a]) => window.bridge[m](...a), [method, args]).catch(err => {
      const msg = String(err?.message ?? err).replace(/^.*?Error: /s, '').split('\n')[0];
      throw new Error(msg);
    });
  },
};

// Each player's client (bot, pathfinder, program runner) runs in its own worker thread (botWorker.mjs). A client that
// stops acknowledging the world's packets for WATCHDOG_S seconds -- a program blocked it -- is restarted, as a crashed
// Mineflayer client reconnects; its globals are lost and it is told so in its next output.
const WATCHDOG_S = Number(process.env.WATCHDOG_S ?? 30);
const clients = new Map(), states = new Map(), deaths = new Map();
for (const name of playerNames) await page.evaluate(n => { window.server.addPlayer(n); }, name);
function startClient(name, restartNote = null) {
  // Each client gets its own memory cap: a program that allocates without end (dry7: the server process hit its 8 GB
  // heap and died, taking every player with it) then ends only its own client, which is restarted below.
  const worker = new Worker(new URL('./botWorker.mjs', import.meta.url), { workerData: { name, restartNote }, resourceLimits: { maxOldGenerationSizeMb: Number(process.env.CLIENT_HEAP_MB ?? 1536) } });
  const c = { name, worker, lastAck: Date.now(), lastSent: 0, runs: new Map(), nextRun: 1, dead: false };
  worker.on('message', async (m) => {
    if (m.type === 'ack') c.lastAck = Date.now();
    else if (m.type === 'call') {
      try { const value = await transport.call(m.method, ...m.args); if (!c.dead) worker.postMessage({ type: 'reply', id: m.id, ok: true, value }); }
      catch (err) { if (!c.dead) worker.postMessage({ type: 'reply', id: m.id, ok: false, error: err.message }); }
    } else if (m.type === 'result' || m.type === 'stopped' || m.type === 'news') { const r = c.runs.get(m.id); c.runs.delete(m.id); r?.(m); }
  });
  worker.on('error', (err) => logEvent({ kind: 'client_error', player: name, message: String(err?.stack ?? err).slice(0, 500) }));
  // A client thread that ends on its own (it crashed) is restarted at once; requests waiting on it would otherwise
  // hang forever (dry6: Delphi's and Corin's clients died on an unhandled rejection and every `bl` call hung).
  worker.on('exit', (code) => { const was = c.dead; c.dead = true; if (!was && !c.restarting) restartClient(name, `it crashed (exit ${code})`).catch(() => {}); });
  clients.set(name, c);
  return c;
}
async function restartClient(name, why) {
  const old = clients.get(name);
  if (old.restarting) return;
  old.restarting = true; old.dead = true;
  for (const resolve of old.runs.values()) resolve({ output: `=== your bot's client was restarted: ${why} ===\nEverything your programs kept on global is gone, and event listeners were removed. The player itself is unchanged.`, record: { status: 'client_restarted', why } });
  await old.worker.terminate().catch(() => {});
  // The new client first, then the bridge resends everything: a pull between the two would hand the resend to the
  // dead client and the new one would never get its inventory.
  startClient(name, `Your bot's client was restarted (${why}). Values on global and event listeners from before are gone.`);
  await page.evaluate(n => window.bridge.resetClient(n), name);
  logEvent({ kind: 'client_restarted', player: name, why });
}
for (const name of playerNames) startClient(name);
// Only a client that was sent packets and stopped acknowledging them is blamed: when the server itself stalls (no
// packets for anyone), every client looks silent, and dry7 restarted all four for it.
setInterval(() => { for (const [name, c] of clients) if (!c.dead && c.lastSent > c.lastAck && Date.now() - c.lastSent > WATCHDOG_S * 1000) restartClient(name, `a program kept it busy for more than ${WATCHDOG_S} s without letting it process the world (a blocking loop?)`).catch(() => {}); }, 2000);
await page.evaluate(() => window.startTicking());

// A save every five minutes (SAVE_EVERY seconds), the last twelve kept, latest.json.gz the newest.
async function saveNow(reason = 'periodic') {
  const t = Date.now();
  const json = await page.evaluate(() => window.snapshot());
  const file = path.join(savesDir, `save-${String(lastTick).padStart(9, '0')}.json.gz`);
  writeFileSync(file, gzipSync(json));
  copyFileSync(file, path.join(savesDir, 'latest.json.gz'));
  const all = readdirSync(savesDir).filter(f => /^save-\d+\.json\.gz$/.test(f)).sort();
  for (const old of all.slice(0, -12)) unlinkSync(path.join(savesDir, old));
  logEvent({ kind: 'saved', reason, file: path.basename(file), mb: +(json.length / 1e6).toFixed(1), ms: Date.now() - t });
}
setInterval(() => saveNow().catch(err => logEvent({ kind: 'save_error', message: String(err?.message ?? err) })), Number(process.env.SAVE_EVERY ?? 300) * 1000);

// The recording for the film (replication/runs/<run>/recording/): a frame every 0.5 s (players, and the mobs, items
// and crystals any player can see) and every block change, each with the game tick.
const recDir = path.join(runDir, 'recording'); mkdirSync(recDir, { recursive: true });
let pullCount = 0;
function record(data) {
  if (data.changes?.length) appendFileSync(path.join(recDir, 'blocks.jsonl'), data.changes.map(c => JSON.stringify([data.tick, ...c])).join('\n') + '\n');
  if (++pullCount % 10) return;
  const p = [], seen = new Map();
  for (const [name, packet] of Object.entries(data.players)) {
    const s = packet.state;
    p.push([name, s.dim, +s.pos[0].toFixed(2), +s.pos[1].toFixed(2), +s.pos[2].toFixed(2), +s.yaw.toFixed(2), +s.pitch.toFixed(2), +(+s.health).toFixed(1), s.food, s.held, s.armor, s.sleeping ? 1 : 0]);
    for (const e of packet.entities) if (e.kind !== 'player' && !seen.has(e.id)) seen.set(e.id, [e.id, s.dim, e.kind === 'item' ? 'item:' + e.item.name : e.name, +e.pos[0].toFixed(1), +e.pos[1].toFixed(1), +e.pos[2].toFixed(1), +(e.yaw ?? 0).toFixed(2), e.health ?? null]);
  }
  appendFileSync(path.join(recDir, 'frames.jsonl'), JSON.stringify({ t: data.tick, time: data.time, p, e: [...seen.values()] }) + '\n');
}

// The pull loop: one packet a tick for every player.
let pulling = false, lastTick = 0, pullStart = 0, pullStallLogged = false;
setInterval(async () => {
  if (pulling) {
    // A pull that takes seconds means the world page stalled: log it (once per stall), so the next one can be traced.
    if (!pullStallLogged && Date.now() - pullStart > 5000) { pullStallLogged = true; const m = process.memoryUsage(); logEvent({ kind: 'server_stall', sinceMs: Date.now() - pullStart, tick: lastTick, heapMB: Math.round(m.heapUsed / 1e6), rssMB: Math.round(m.rss / 1e6) }); }
    return;
  }
  pulling = true; pullStart = Date.now(); pullStallLogged = false;
  try {
    const data = await page.evaluate(() => window.bridge.pull());
    if (Date.now() - pullStart > 1000) logEvent({ kind: 'slow_pull', ms: Date.now() - pullStart, tick: data.tick });
    lastTick = data.tick;
    record(data);
    for (const [name, packet] of Object.entries(data.players)) {
      const c = clients.get(name); if (!c) continue;
      states.set(name, packet.state);
      if (!c.dead) { c.worker.postMessage({ type: 'packet', packet, time: data.time, tick: data.tick }); if (c.lastSent <= c.lastAck) c.lastSent = Date.now(); }
      for (const m of packet.messages) if (m.kind === 'chat' && name === playerNames[0]) appendFileSync(path.join(runDir, 'chat.log'), `${stamp()} <${m.from}> ${m.text}\n`);
    }
    for (const e of data.events) logEvent(e);
    const serverEvents = await page.evaluate(() => window.drainEvents());
    for (const e of serverEvents) { if (e.kind === 'death') deaths.set(e.player, (deaths.get(e.player) ?? 0) + 1); logEvent(e); }
  } catch (err) { logEvent({ kind: 'pull_error', message: String(err?.message ?? err).slice(0, 300) }); }
  finally { pulling = false; }
}, 50);

// Health of the server process, every 10 s: memory, and what the bots hold.
setInterval(() => { const m = process.memoryUsage(); logEvent({ kind: 'mem', heapMB: Math.round(m.heapUsed / 1e6), rssMB: Math.round(m.rss / 1e6), clients: [...clients.values()].map(c => ({ n: c.name, ackAgoMs: Date.now() - c.lastAck })) }); }, Number(process.env.MEM_EVERY ?? 60000));

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((resolve, reject) => { let b = ''; req.on('data', d => { b += d; if (b.length > 2e6) req.destroy(); }); req.on('end', () => resolve(b)); req.on('error', reject); });

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST' && url.pathname === '/run') {
      const { player, code, timeout } = JSON.parse(await readBody(req));
      if (tokens && tokens[player] !== req.headers['x-bl-token']) return json(res, 403, { error: 'Wrong or missing token for that player.' });
      const c = clients.get(player);
      if (!c) return json(res, 404, { error: `No player ${player}` });
      const started = Date.now();
      const { output, record } = await new Promise((resolve) => { const id = c.nextRun++; c.runs.set(id, resolve); c.worker.postMessage({ type: 'run', id, code: String(code ?? ''), timeout: timeout ?? 60 }); });
      appendFileSync(path.join(runDir, 'programs', `${player}.jsonl`), JSON.stringify({ wall: new Date(started).toISOString(), tick: lastTick, code, timeout: timeout ?? 60, ...record }) + '\n');
      logEvent({ kind: 'program', player, n: record.n, status: record.status, seconds: record.seconds });
      return json(res, 200, { output, status: record.status, stopped: record.stopped ?? null });
    }
    // `bl news`: the player's new chat and messages, without running a program.
    if (req.method === 'POST' && url.pathname === '/news') {
      const { player } = JSON.parse(await readBody(req));
      if (tokens && tokens[player] !== req.headers['x-bl-token']) return json(res, 403, { error: 'Wrong or missing token for that player.' });
      const c = clients.get(player);
      if (!c) return json(res, 404, { error: `No player ${player}` });
      const { output } = await new Promise((resolve) => { const id = c.nextRun++; c.runs.set(id, resolve); c.worker.postMessage({ type: 'news', id }); });
      return json(res, 200, { output });
    }
    // `bl stop`: end every program the player has running (they keep acting after a timeout otherwise).
    if (req.method === 'POST' && url.pathname === '/stop-programs') {
      const { player } = JSON.parse(await readBody(req));
      if (tokens && tokens[player] !== req.headers['x-bl-token']) return json(res, 403, { error: 'Wrong or missing token for that player.' });
      const c = clients.get(player);
      if (!c) return json(res, 404, { error: `No player ${player}` });
      const { stopped } = await new Promise((resolve) => { const id = c.nextRun++; c.runs.set(id, resolve); c.worker.postMessage({ type: 'stop', id }); });
      logEvent({ kind: 'programs_stopped', player, programs: stopped });
      return json(res, 200, { stopped });
    }
    // Development only (--dev): evaluate code in the server page. Never enabled for an agents' run.
    if (req.method === 'POST' && url.pathname === '/page' && process.argv.includes('--dev')) {
      const { code } = JSON.parse(await readBody(req));
      const value = await page.evaluate(c => (0, eval)(c), String(code));
      return json(res, 200, { value });
    }
    // Development only (--dev): restart a player's client, ending its programs (the parts tests, between parts).
    if (req.method === 'POST' && url.pathname === '/reset-client' && process.argv.includes('--dev')) {
      const who = url.searchParams.get('player');
      await restartClient(who, 'reset by the test runner');
      await page.evaluate(n => { const P = window.server.players.get(n); P.player.botControls = null; P.isMouseDown = false; P.forcedTarget = null; return true; }, who);
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/dashboard') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(readFileSync(path.join(import.meta.dirname, 'dashboard.html'))); }
    if (req.method === 'POST' && (url.pathname === '/pause' || url.pathname === '/resume')) {
      if (req.headers['x-admin-token'] !== adminToken) return json(res, 403, { error: 'admin token' });
      await page.evaluate(p => (p === '/pause' ? window.stopTicking() : window.startTicking()), url.pathname);
      logEvent({ kind: url.pathname.slice(1) });
      return json(res, 200, { ok: url.pathname.slice(1) });
    }
    // The launcher ends a run here: a last save, then the server stops (a kill on Windows would skip the save).
    if (req.method === 'POST' && url.pathname === '/stop') {
      if (req.headers['x-admin-token'] !== adminToken) return json(res, 403, { error: 'admin token' });
      json(res, 200, { ok: 'stopping' });
      setTimeout(() => stop(), 100);
      return;
    }
    if (url.pathname === '/status') {
      return json(res, 200, { tick: lastTick, players: playerNames.map(n => { const st = states.get(n); return st ? { name: n, dim: st.dim, pos: st.pos.map(v => +v.toFixed(1)), health: +(+st.health).toFixed(1), food: st.food, held: st.held, armor: st.armor, deaths: deaths.get(n) ?? 0, items: st.items } : { name: n }; }) });
    }
    if (url.pathname === '/events') {
      const since = Number(url.searchParams.get('since') ?? 0);
      const file = path.join(runDir, 'events.jsonl');
      const lines = existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n') : [];
      return json(res, 200, { next: lines.length, events: lines.slice(since).map(l => JSON.parse(l)) });
    }
    json(res, 404, { error: 'not found' });
  } catch (err) { json(res, 500, { error: String(err?.message ?? err) }); }
}).listen(port, '127.0.0.1', () => console.log(`[server] ready: http://127.0.0.1:${port}  players ${playerNames.join(', ')}  run folder ${runDir}`));

const stop = async () => { console.log('[server] stopping'); try { await saveNow('stop'); } catch {} logEvent({ kind: 'server_stop' }); await s.close(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
