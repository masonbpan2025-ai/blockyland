// One arena match in the real game: a Vite server of this checkout, one browser tab per player (the first hosts the
// SkyWars or Bed Wars room, the others join it with its code, as friends do), the probe in each tab, and the loop that
// runs every player: look at the screen, run the strategy, hand its commands to the player's hands (humanInput.mjs).
// Everything is recorded for a film: each player's screen as video, every frame of every player, every block change,
// every input, every strategy log line and every chat line (recorder below; agentArena/docs/recording.md).
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { readFileSync, mkdirSync, appendFileSync, writeFileSync, existsSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { HumanInput, applyCommand } from './humanInput.mjs';
import { StrategyRunner } from './strategyRunner.mjs';

const here = import.meta.dirname;
const repo = path.resolve(here, '..');
const PROBE = readFileSync(path.join(here, 'page', 'probe.js'), 'utf8');
export const VIEWPORT = Object.freeze({ width: 960, height: 540 });
export const TICK_MS = 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The game's own Vite server, for this match only. `videoFiles` maps a player's name to the WebM file its tab's
 * recorder (probe.js startVideo) appends to, through POST /__arena/video/<name>.
 */
export async function startVite({ port = 3041, videoFiles = new Map() } = {}) {
  const videoRoute = {
    name: 'arena-video',
    configureServer(server) {
      server.middlewares.use('/__arena/video/', (req, res) => {
        const name = decodeURIComponent(req.url.replace(/^\//, '').split('?')[0]);
        const file = videoFiles.get(name);
        if (req.method !== 'POST' || !file) { res.statusCode = 404; res.end(); return; }
        const parts = [];
        req.on('data', (c) => parts.push(c));
        req.on('end', () => { try { appendFileSync(file, Buffer.concat(parts)); res.statusCode = 204; } catch { res.statusCode = 500; } res.end(); });
      });
    },
  };
  const vite = await createServer({
    configFile: path.join(repo, 'vite.config.js'), root: repo, cacheDir: 'node_modules/.vite-arena', logLevel: 'error',
    plugins: [videoRoute],
    // Other work in the checkout must not reload the players' pages mid-match, and the match's own recordings (under
    // agentArena/runs) must not keep a file watcher busy: with twenty bots that was a quarter of the process's time.
    // `watch: null` is dropped when Vite merges this over vite.config.js (a null override is skipped), so every path is
    // ignored instead, and the watcher closed.
    server: { host: '127.0.0.1', port, strictPort: false, hmr: false, watch: { ignored: () => true } },
  });
  await vite.watcher?.close?.()?.catch?.(() => {});
  await vite.listen();
  return { vite, base: vite.resolvedUrls.local[0].replace(/\/$/, '') };
}

export async function launchBrowser({ headed = false } = {}) {
  return chromium.launch({
    channel: 'msedge', headless: !headed,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
}

/** A player's tab: its own browser context (own storage), the game loaded, the player's name set. */
export async function openPlayerTab(browser, base, { name, onLog = () => {}, referee = false }) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  // The name the share screen sends (worldSyncManager.js playerName), set before the game reads it; a referee host runs
  // the match without playing in it (src/mods/bedwars/client.js refereeHost).
  await context.addInitScript(([n, r]) => { try { localStorage.setItem('mc-player-name', n); if (r) localStorage.setItem('mc-referee-host', '1'); } catch { /* fine */ } }, [name, referee]);
  const page = await context.newPage();
  page.on('pageerror', (e) => onLog(`${name} pageerror: ${e.message}`));
  await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: 'export const injectQuery=(u,q)=>u+(u.includes("?")?"&":"?")+q;export const createHotContext=()=>({accept(){},prune(){},dispose(){},on(){}});export const updateStyle=()=>{};export const removeStyle=()=>{};' }));
  await page.goto(`${base}/`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.game?.worldSync && window.game?.ui, null, { timeout: 300000 });
  return { context, page };
}

export async function installProbe(page) {
  await page.evaluate(PROBE);
  return page.evaluate(() => window.__arena.init());
}

const MOD_LABEL = { skywars: 'SkyWars', bedwars: 'Bed Wars' };

/** The host opens the game from the designed worlds and gets the room code, as e2e/skywarsBots.pw.js does. */
/**
 * Host a room in the referee's tab. `practice` hosts it on the practice map: three islands (SkyWars' practice template,
 * Bed Wars' practice layout), the full map's mechanics in a fraction of its size, for practice games.
 */
export async function hostRoom(page, game, { bedwarsMode = 'duel', bedwarsPace = 'fast', practice = false, bedwarsLayout = null, bedwarsSeed = null, skywarsTemplate = null, skywarsPack = null, skywarsSeed = null } = {}) {
  await page.click('#btn-start-designed-world');
  await page.waitForFunction((label) => (document.getElementById('map-designed-list')?.textContent ?? '').includes(label), MOD_LABEL[game], { timeout: 60000 });
  await page.locator('#map-designed-list > *', { hasText: MOD_LABEL[game] }).first().getByRole('button').first().click();
  const codeSel = game === 'skywars' ? '#skywars-code' : '#bedwars-code';
  await page.waitForFunction((sel) => /^[0-9]{4}$/.test(document.getElementById(sel.slice(1))?.textContent ?? '') && window.game.worldReady, codeSel, { timeout: 180000 });
  if (game === 'bedwars') {
    await page.click(`#bedwars-lobby button[data-id="${bedwarsMode}"]`);
    await page.waitForFunction((m) => window.game.bedwars?.state?.mode === m, bedwarsMode, { timeout: 30000 });
    await page.click(`#bedwars-lobby button[data-id="${bedwarsPace}"]`);
    await page.waitForFunction((p) => window.game.bedwars?.state?.pace === p, bedwarsPace, { timeout: 30000 });
    await page.waitForFunction(() => window.game.worldReady, null, { timeout: 120000 });
    // A Bed Wars layout other than the Classic Cross (src/mods/bedwars/layouts.js), laid out from the round's seed.
    if (bedwarsLayout && bedwarsLayout !== 'standard' && !practice) {
      await page.evaluate((l) => window.game.bedwars.chooseLayout(l), bedwarsLayout);
      await page.waitForFunction((l) => window.game.bedwars?.state?.map?.layout === l && window.game.worldReady, bedwarsLayout, { timeout: 60000 });
    }
    // A given seed (the five-team series plays each template on a seed of its own): set after the mode and the
    // layout, which each draw a fresh one, and published, so every browser and guest builds that map.
    if (Number.isFinite(bedwarsSeed) && !practice) {
      await page.evaluate((seed) => { const c = window.game.bedwars; c.match.map = { ...c.match.map, seed: seed >>> 0 }; c.publish(); }, bedwarsSeed);
      await page.waitForFunction((seed) => window.game.bedwars?.state?.map?.seed === (seed >>> 0) && window.game.worldReady, bedwarsSeed, { timeout: 60000 });
    }
  }
  if (game === 'skywars' && (skywarsTemplate && skywarsTemplate !== 'classic' || skywarsPack) && !practice) {
    await page.evaluate(({ t, p }) => window.game.skywars.chooseMap(t || 'classic', p), { t: skywarsTemplate, p: skywarsPack });
    await page.waitForFunction((t) => window.game.skywars?.state?.map?.template === (t || 'classic') && window.game.worldReady, skywarsTemplate, { timeout: 60000 });
  }
  // A given seed: the very islands a map's preview showed (agentArena/scriptedArena.mjs shows them to the agents before
  // they write their bots). Choosing a map draws a fresh seed, so the seed is set on the match after it and published:
  // every browser and guest builds the arena from the state's map.
  if (game === 'skywars' && Number.isFinite(skywarsSeed) && !practice) {
    await page.evaluate((seed) => { const c = window.game.skywars; c.match.map = { ...c.match.map, seed: seed >>> 0 }; c.publish(); }, skywarsSeed);
    await page.waitForFunction((seed) => window.game.skywars?.state?.map?.seed === (seed >>> 0) && window.game.worldReady, skywarsSeed, { timeout: 60000 });
  }
  if (practice) {
    if (game === 'skywars') {
      await page.evaluate(() => window.game.skywars.chooseMap('practice'));
      await page.waitForFunction(() => window.game.skywars?.state?.map?.template === 'practice' && window.game.worldReady, null, { timeout: 60000 });
    } else {
      await page.evaluate(() => window.game.bedwars.chooseLayout('practice'));
      await page.waitForFunction(() => window.game.bedwars?.state?.map?.layout === 'practice' && window.game.worldReady, null, { timeout: 60000 });
    }
  }
  return (await page.textContent(codeSel)).trim();
}

export async function joinRoom(page, code, game) {
  await page.click('#btn-start-join');
  await page.fill('#join-code-input', code);
  await page.click('#btn-join-code-confirm');
  await page.waitForFunction((g) => window.game?.worldSync?.isJoined && window.game.worldReady && window.game[g]?.state && window.game[g].me(), game, { timeout: 240000 });
}

export async function startRoom(page, game) {
  const sel = game === 'skywars' ? '#skywars-start' : '#bedwars-start';
  await page.waitForFunction((s) => { const b = document.querySelector(s); return b && !b.disabled; }, sel, { timeout: 60000 });
  await page.click(sel);
}

/** The Playwright hands of one tab: real key presses and clicks, and mouse motion as the mouse makes it. */
export function pageExecutor(page) {
  const cx = VIEWPORT.width / 2, cy = VIEWPORT.height / 2;
  const state = () => page.evaluate(() => ({ locked: !!document.pointerLockElement, screen: window.__arena.screen().kind }));
  /** Click back into the game, as a person does after closing a screen, so the mouse turns the view again. */
  const relock = async () => {
    const s = await state();
    if (s.locked || s.screen !== 'none') return s;
    await page.mouse.click(cx, cy);
    await page.waitForFunction(() => !!document.pointerLockElement, null, { timeout: 1500 }).catch(() => {});
    return state();
  };
  return {
    /** Give the game the mouse again when nothing is open on screen (a person clicks into the window). */
    focus: relock,
    key: (code, down) => (down ? page.keyboard.down(code) : page.keyboard.up(code)),
    mouse: async (button, down) => {
      if (down) {
        const s = await state();
        if (!s.locked && s.screen === 'none') await relock();
      }
      await page.mouse.move(cx, cy);
      return down ? page.mouse.down({ button }) : page.mouse.up({ button });
    },
    look: (dx, dy) => page.evaluate(([x, y]) => window.dispatchEvent(new MouseEvent('mousemove', { movementX: x, movementY: y, bubbles: true })), [dx, dy]),
    slot: async (id, { button, shift }) => {
      const sel = await page.evaluate((i) => window.__arena.slotSelector(i), id);
      if (!sel) throw new Error(`no "${id}" on this screen`);
      if (shift) await page.keyboard.down('Shift');
      try { await page.click(sel, { button, timeout: 1500 }); } finally { if (shift) await page.keyboard.up('Shift'); }
    },
    close: async () => {
      let s = await state();
      if (s.screen === 'inventory') await page.keyboard.press('KeyE');
      else if (s.screen !== 'none') await page.keyboard.press('Escape');
      await sleep(80);
      s = await state();
      if (s.screen === 'pause') { await page.click('#btn-resume', { timeout: 1500 }).catch(() => {}); await sleep(80); }
      await relock();
    },
    chat: async (text, charDelayMs) => {
      await page.keyboard.press('KeyT');
      await sleep(120);
      await page.keyboard.type(text, { delay: charDelayMs });
      await page.keyboard.press('Enter');
    },
  };
}

/**
 * Append-only JSON-lines files under the run's recording folder. Each file stays open as a stream: reopening a growing
 * file for every line (about 30 a second) stalls the loop on Windows, where a scanner reads each file as it closes.
 */
export class Recorder {
  constructor(dir) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    this.t0 = Date.now();
    this.streams = new Map();
  }
  t() { return +((Date.now() - this.t0) / 1000).toFixed(3); }
  stream(file) {
    let s = this.streams.get(file);
    if (!s) { s = createWriteStream(path.isAbsolute(file) ? file : path.join(this.dir, file), { flags: 'a' }); this.streams.set(file, s); }
    return s;
  }
  write(file, obj) { this.stream(file).write(`${JSON.stringify({ t: this.t(), ...obj })}\n`); }
  /** A line of plain text to a file outside the recording folder (the agents' logs). */
  line(absFile, text) { this.stream(absFile).write(`${text}\n`); }
  json(file, obj) { writeFileSync(path.join(this.dir, file), JSON.stringify(obj)); }
  async close() {
    await Promise.all([...this.streams.values()].map((s) => new Promise((r) => s.end(r))));
    this.streams.clear();
  }
}

/**
 * Everything one player is in the match: its tab, hands, strategy, and what it has seen.
 */
export class ArenaPlayer {
  constructor({ name, label, page, strategyFile, versionsDir, recorder, statusDir, limits = {}, seed = 1 }) {
    this.name = name;
    this.label = label ?? name;
    this.page = page;
    this.recorder = recorder;
    this.statusDir = statusDir;
    let s = seed >>> 0;
    const random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    this.executor = pageExecutor(page);
    this.input = new HumanInput({
      executor: this.executor, random, limits,
      onExecuted: (e) => { if (e.issuedAt) { this.lagSum = (this.lagSum ?? 0) + (e.at - e.issuedAt); this.lagCount = (this.lagCount ?? 0) + 1; } recorder.write(`inputs-${name}.jsonl`, { ...e, issuedAt: undefined, due: undefined, lagMs: e.issuedAt ? Math.round(e.at - e.issuedAt) : undefined }); },
    });
    this.runner = new StrategyRunner({ file: strategyFile, versionsDir });
    this.cells = new Map();
    this.names = {};
    this.bounds = null;
    this.landmarks = null;
    this.sentLandmarksFor = -1;
    this.lastView = null;
    this.logTail = [];
    this.tick = 0;
    this.stopped = false;
    this.pumpBusy = false;
    this.started = false;
    this.timing = { evalMs: 0, runMs: 0, n: 0 };
  }

  /** The arena's blocks as this player's client has them, sent to the strategy. */
  async loadBlocks() {
    const dump = await this.page.evaluate(() => window.__arena.dumpBlocks());
    if (!dump) return false;
    this.cells.clear();
    for (let i = 0; i < dump.cells.length; i += 4) this.cells.set(`${dump.cells[i]},${dump.cells[i + 1]},${dump.cells[i + 2]}`, dump.cells[i + 3]);
    this.names = dump.names;
    this.bounds = dump.bounds;
    this.runner.setBlocks(this.fullBlocks());
    this.landmarks = await this.page.evaluate(() => window.__arena.landmarks());
    return true;
  }

  fullBlocks() {
    const cells = [];
    for (const [key, id] of this.cells) { const [x, y, z] = key.split(',').map(Number); cells.push(x, y, z, id); }
    return { bounds: this.bounds, names: this.names, cells };
  }

  log(line) {
    this.logTail.push(line);
    if (this.logTail.length > 300) this.logTail.splice(0, 100);
    if (this.statusDir) this.recorder.line(path.join(this.statusDir, `${this.name}.log`), line);
  }

  /** One tick: see, think, act, record. */
  async step({ playing }) {
    const e0 = performance.now();
    const snap = await this.page.evaluate(() => ({ view: window.__arena.view(), news: window.__arena.takeNews(), blocks: window.__arena.takeBlockChanges() }));
    this.timing.evalMs += performance.now() - e0; this.timing.n++;
    const { view, news, blocks } = snap;
    for (const [x, y, z, id] of blocks) { const k = `${x},${y},${z}`; if (id) this.cells.set(k, id); else this.cells.delete(k); }
    this.input.observe(view.me.yaw, view.me.pitch);
    // The game lost the mouse with nothing open (a teleport, a respawn): click back in, as a person would, once a second
    // at most. Not one of the strategy's actions.
    if (playing && !view.pointerLocked && view.screen.kind === 'none' && !view.me.dead && Date.now() - (this.lastFocus ?? 0) > 1000) {
      this.lastFocus = Date.now();
      this.executor.focus().then(() => this.recorder.write('events.jsonl', { kind: 'refocus', who: this.name })).catch(() => {});
    }
    this.tick++;
    // The clock: seconds of play so far, the arena's time limit, and what is left of it (a tie when it runs out).
    const time = view.match?.elapsed ?? 0;
    const limit = this.timeLimit ?? null;
    const agentView = {
      tick: this.tick, time, timeLimit: limit, timeLeft: limit === null ? null : Math.max(0, Math.round((limit - (view.match?.phase === 'playing' || view.match?.phase === 'ended' ? time : 0)) * 10) / 10),
      phase: view.match?.phase ?? null, game: view.match?.game ?? null,
      me: view.me, crosshair: view.crosshair, players: view.players, screen: view.screen, match: view.match, titles: view.titles,
      chat: news.chat.map((c) => c.text), hurt: news.hurt.map((h) => h.amount), pointerLocked: view.pointerLocked,
      input: { keys: { ...this.input.keys }, buttons: { ...this.input.buttons }, pending: this.input.pending() },
    };
    this.lastView = agentView;
    const rec = this.recorder;
    rec.write('frames.jsonl', { who: this.name, me: { pos: view.me.pos, vel: view.me.vel, yaw: view.me.yaw, pitch: view.me.pitch, health: view.me.health, absorption: view.me.absorption, hunger: view.me.hunger, armorPoints: view.me.armorPoints, held: view.me.held?.item ?? null, slot: view.me.selectedSlot, armor: Object.fromEntries(Object.entries(view.me.armor).map(([k, v]) => [k, v?.item ?? null])), sneaking: view.me.sneaking, sprinting: view.me.sprinting, onGround: view.me.onGround, dead: view.me.dead, gamemode: view.me.gamemode, using: view.me.using }, screen: view.screen.kind, crosshair: view.crosshair ? { kind: view.crosshair.kind, name: view.crosshair.name, block: view.crosshair.block, x: view.crosshair.x, y: view.crosshair.y, z: view.crosshair.z } : null, keys: agentView.input.keys, buttons: agentView.input.buttons, sees: view.players.filter((p) => p.seen !== 'heard').map((p) => p.name), phase: agentView.phase });
    for (const c of news.chat) rec.write('chat.jsonl', { who: this.name, text: c.text });
    for (const h of news.hurt) rec.write('events.jsonl', { kind: 'hurt', who: this.name, amount: h.amount, health: view.me.health });
    if (!playing) return { view: agentView, blocks };
    // A changed strategy file loads now, with the blocks as they are now.
    if (this.runner.checkForUpdate(() => this.runner.setBlocks(this.fullBlocks()))) {
      this.log(`[arena] loaded strategy version ${this.runner.version}`);
      rec.write('events.jsonl', { kind: 'strategy_loaded', who: this.name, version: this.runner.version });
    } else if (this.runner.loadError && this.runner.loadError !== this.lastLoadError) {
      this.log(`[arena] ${this.runner.loadError}`);
      rec.write('events.jsonl', { kind: 'strategy_load_failed', who: this.name, error: this.runner.loadError });
    }
    this.lastLoadError = this.runner.loadError;
    const sendLandmarks = this.sentLandmarksFor !== this.runner.version;
    const r0 = performance.now();
    const out = this.runner.step(agentView, { blockChanges: blocks, landmarks: sendLandmarks ? this.landmarks : null });
    this.timing.runMs += performance.now() - r0;
    if (sendLandmarks) this.sentLandmarksFor = this.runner.version;
    for (const line of out.logs) { this.log(`[${agentView.time.toFixed?.(1) ?? agentView.time}s] ${line}`); rec.write(`strategy-${this.name}.jsonl`, { line }); }
    if (out.error) {
      if (out.error !== this.lastStepError) { this.log(`[arena] tick error: ${out.error}`); rec.write('events.jsonl', { kind: 'strategy_error', who: this.name, error: out.error.slice(0, 400) }); }
      this.lastStepError = out.error;
    } else this.lastStepError = null;
    const bad = [];
    for (const cmd of out.cmds) {
      try { applyCommand(this.input, cmd, agentView); } catch (err) { bad.push(`${cmd.type}: ${err.message}`); }
    }
    if (out.cmds.length) rec.write(`commands-${this.name}.jsonl`, { tick: this.tick, cmds: out.cmds });
    if (bad.length) this.log(`[arena] rejected commands: ${bad.slice(0, 3).join('; ')}`);
    return { view: agentView, blocks, out };
  }

  /** The hands, run every frame. */
  startPump() {
    this.pumpTimer = setInterval(async () => {
      if (this.pumpBusy || this.stopped) return;
      this.pumpBusy = true;
      try { await this.input.pump(); } catch (err) { this.log(`[arena] input error: ${err.message}`); } finally { this.pumpBusy = false; }
    }, 16);
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.pumpTimer);
    for (let i = 0; i < 50 && this.pumpBusy; i++) await sleep(20);
    await this.input.releaseAll().catch(() => {});
  }

  /** What `arena status` shows the agent. */
  status(extra = {}) {
    const v = this.lastView;
    return {
      name: this.name, ...extra,
      strategy: { version: this.runner.version, loadError: this.runner.loadError, lastError: this.runner.lastError, errors: this.runner.errorCount, ticks: this.runner.ticks, slowTicks: this.runner.slowTicks },
      input: { pending: this.input.pending(), executed: this.input.executed, recentErrors: this.input.errors.slice(-5) },
      view: v ? { time: v.time, timeLimit: v.timeLimit, timeLeft: v.timeLeft, phase: v.phase, me: { pos: v.me.pos, health: v.me.health, hunger: v.me.hunger, armorPoints: v.me.armorPoints, held: v.me.held, dead: v.me.dead, gamemode: v.me.gamemode, hotbar: v.me.hotbar.map((s) => (s ? `${s.item} x${s.count}` : null)) }, crosshair: v.crosshair, players: v.players, screen: v.screen?.kind, match: v.match } : null,
      logTail: this.logTail.slice(-25),
    };
  }
}

/** Write the status files `arena status` reads. */
export function writeStatus(statusDir, player, extra) {
  if (!statusDir) return;
  try {
    writeFileSync(path.join(statusDir, `${player.name}.json`), JSON.stringify(player.status(extra), null, 1));
    if (player.lastView) writeFileSync(path.join(statusDir, `${player.name}.view.json`), JSON.stringify(player.lastView, null, 1));
  } catch { /* next second */ }
}

export { sleep, existsSync, applyCommand };
