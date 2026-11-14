// Practice games for the scripted arena's agents, played by the arena, not by the agents: an agent's `node practice.mjs`
// files a request in its workspace (practice/queue/<id>.json) and waits for the answer (<id>.result.json). The arena
// serves the queues (servePractice), a few games at a time, each in a child process of its own (this file, run as
// `node scriptedPractice.mjs run <request.json>`): the agent's bot is loaded afresh every game, and an agent whose own
// commands run in a sandbox (Codex: no network, no browser) can practise as well as any other.
//
// A game: the agent's bot (its workspace's bot/) against 1-4 unchanged scripted bots, at the arena's difficulty, with
// the referee, on a SkyWars map (a template the agent names, or one drawn at random; a seed likewise). Written to
// practice/<n>/: summary.md, timeline.txt (every bot every 0.5 s), chat.txt, referee.txt, map.txt, recording/.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const here = import.meta.dirname;
const jl = (dir, f) => { const p = path.join(dir, 'recording', f); return existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []; };

/** Every numbered practice game a workspace has (finished or under way); a game the arena failed to play is not one. */
const gamesOf = (ws) => (existsSync(path.join(ws, 'practice')) ? readdirSync(path.join(ws, 'practice')).filter((d) => /^\d+$/.test(d)).map(Number) : []);
/** The numbers of a workspace's failed games (practice/failed-<n>), so a new game never takes a used number. */
const failedOf = (ws) => (existsSync(path.join(ws, 'practice')) ? readdirSync(path.join(ws, 'practice')).map((d) => /^failed-(\d+)$/.exec(d)?.[1]).filter(Boolean).map(Number) : []);

/**
 * Serves the agents' practice queues until stopped. workspaces: [{ name, ws, limit? }]. Returns { stop(), idle(), pending() }.
 *
 * Fair: whenever a slot is free, the next game is the waiting request of the agent with the fewest games played or under
 * way (then the oldest request), so no agent waits behind another's queue. A request the arena files itself ({ pre: true }:
 * a game of a frozen bot, played before its turn) takes a slot only when no agent's own request waits, and such games never hold more than all
 * but one of the slots. A new game starts only with `minFreeGb` of memory free. A game that runs past `gameTimeoutMs` is
 * stopped, and a game the arena fails to play does not count against the agent (its folder becomes practice/failed-<n>).
 */
export function servePractice({ workspaces, limit = 5, difficulty = 'hard', timeLimit = 480, concurrency = 2, portBase = 3200, log = () => {}, script = path.join(here, 'scriptedPractice.mjs'), describe = (j) => `${j.template ?? 'a random map'}, ${j.opponents} scripted bot${j.opponents > 1 ? 's' : ''}`, minFreeGb = 0, gameTimeoutMs = null }) {
  const running = new Map(); // request file -> { child, name, kill }
  let stopped = false, nextPort = 0, lowMemoryNoted = 0;
  const failed = new Set(); // game folders that failed (renamed to failed-<n> once the files are free)
  const played = (ws) => gamesOf(ws).filter((n) => !failed.has(path.join(ws, 'practice', String(n))));
  const answer = (q, body) => { writeFileSync(q.replace(/\.json$/, '.result.json.tmp'), JSON.stringify(body)); renameSync(q.replace(/\.json$/, '.result.json.tmp'), q.replace(/\.json$/, '.result.json')); rmSync(q, { force: true }); };
  const busy = (name) => [...running.values()].filter((r) => r.name === name).length;
  const waiting = () => {
    const list = [];
    for (const { name, ws, limit: own } of workspaces) {
      const dir = path.join(ws, 'practice', 'queue');
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir).filter((x) => /^[\w-]+\.json$/.test(x) && !x.endsWith('.result.json')).sort()) {
        const q = path.join(dir, f);
        if (running.has(q)) continue;
        let req;
        try { req = JSON.parse(readFileSync(q, 'utf8')); } catch { answer(q, { error: 'the request could not be read' }); continue; }
        list.push({ name, ws, limit: own ?? limit, q, req, at: Number(req.at) || 0 });
      }
    }
    return list.sort((a, b) => (!!a.req.pre - !!b.req.pre) || (played(a.ws).length + busy(a.name)) - (played(b.ws).length + busy(b.name)) || a.at - b.at);
  };
  const tick = () => {
    if (stopped) return;
    const list = waiting();
    for (const w of list) {
      if (running.size >= concurrency) return;
      const { name, ws, q, req } = w;
      const used = played(ws);
      if (used.length >= w.limit) { answer(q, { error: `No practice games left (${w.limit} played).` }); continue; }
      if (req.pre && ([...running.values()].filter((r) => r.pre).length >= Math.max(1, concurrency - 1) || list.some((x) => !x.req.pre && existsSync(x.q)))) continue;
      if (minFreeGb && os.freemem() / 2 ** 30 < minFreeGb) {
        if (Date.now() - lowMemoryNoted > 300000) { log(`practice: waiting for memory (${(os.freemem() / 2 ** 30).toFixed(1)} GB free, ${minFreeGb} needed)`); lowMemoryNoted = Date.now(); }
        return;
      }
      // The bot must pass its check first (run here: a sandboxed agent's own command may not start another process).
      const chk = spawnSync(process.execPath, ['check.mjs'], { cwd: ws, encoding: 'utf8', timeout: 300000, windowsHide: true });
      if (chk.status !== 0) { answer(q, { error: `your bot does not pass node check.mjs, so no game was played (this does not count):\n${`${chk.stdout ?? ''}${chk.stderr ?? ''}`.trim().slice(-2000)}` }); continue; }
      const n = Math.max(0, ...gamesOf(ws), ...failedOf(ws)) + 1;
      const dir = path.join(ws, 'practice', String(n));
      mkdirSync(dir, { recursive: true });
      const job = { name, ws, n, difficulty, timeLimit, port: portBase + (nextPort++ % 8) * 10, template: req.template ?? null, seed: req.seed ?? null, opponents: req.opponents ?? 1 };
      const jobFile = path.join(dir, 'job.json');
      writeFileSync(jobFile, JSON.stringify(job));
      log(`${name}: practice ${n} (${describe(job)})${req.pre ? ' [played by the arena]' : ''}`);
      const child = spawn(process.execPath, [script, 'run', jobFile], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let err = '', timedOut = false;
      child.stdout.on('data', () => {});
      child.stderr.on('data', (d) => { err += d; });
      const kill = () => { if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill(); };
      const timer = gameTimeoutMs ? setTimeout(() => { timedOut = true; log(`${name}: practice ${n} ran past ${Math.round(gameTimeoutMs / 60000)} min: stopped`); kill(); }, gameTimeoutMs) : null;
      running.set(q, { child, name, kill, pre: !!req.pre });
      child.on('exit', (code) => {
        clearTimeout(timer);
        running.delete(q);
        const summary = path.join(dir, 'summary.md');
        if (code === 0 && existsSync(summary)) answer(q, { n, summary: readFileSync(summary, 'utf8') });
        else {
          failed.add(dir);
          const rename = () => { try { renameSync(dir, path.join(ws, 'practice', `failed-${n}`)); failed.delete(dir); return true; } catch { return false; } };
          if (!rename()) setTimeout(rename, 3000);
          if (!stopped) answer(q, { error: `the arena failed to play this practice game (${timedOut ? 'it ran too long' : `code ${code}`}); it does not count against your games: request it again. ${err.trim().split('\n').slice(-3).join(' ').slice(0, 300)}` });
        }
        log(`${name}: practice ${n} done (${code === 0 ? 'played' : `failed: ${timedOut ? 'timed out' : code}`})`);
        setImmediate(tick);
      });
    }
  };
  const timer = setInterval(tick, 2000);
  tick();
  return {
    stop() { stopped = true; clearInterval(timer); for (const r of running.values()) r.kill(); },
    idle: () => running.size === 0,
    /** Requests waiting or playing, of a workspace (or all). */
    pending: (ws = null) => [...running.keys()].filter((q) => !ws || q.startsWith(ws)).length + waiting().filter((w) => !ws || w.ws === ws).length,
  };
}

/** One practice game (the child process). */
async function runOne(jobFile) {
  const job = JSON.parse(readFileSync(jobFile, 'utf8'));
  const { runBotMatch } = await import('./botMatch.mjs');
  const { referee } = await import('./referee.mjs');
  const { TEMPLATE_IDS } = await import('../src/mods/skywars/templates.js');
  const { packsFor } = await import('../src/mods/skywars/packs.js');
  const template = TEMPLATE_IDS.includes(job.template) ? job.template : TEMPLATE_IDS[Math.floor(Math.random() * TEMPLATE_IDS.length)];
  const packs = packsFor(template), pack = packs[Math.floor(Math.random() * packs.length)].id;
  const seed = Number.isFinite(Number(job.seed)) && job.seed !== null ? Number(job.seed) >>> 0 : Math.floor(Math.random() * 1e9);
  const opponents = Math.max(1, Math.min(4, Math.floor(Number(job.opponents) || 1)));
  const dir = path.dirname(jobFile);
  const violations = [];
  const me = { name: job.name, scripted: job.difficulty, sessionModule: path.join(job.ws, 'bot', 'scriptedBot', 'scriptedBot.mjs'), onSession: referee(job.name, violations) };
  const others = Array.from({ length: opponents }, (_, i) => ({ name: opponents > 1 ? `Scripted${i + 1}` : 'Scripted', scripted: job.difficulty, onSession: referee(opponents > 1 ? `Scripted${i + 1}` : 'Scripted', violations) }));
  // My place in the join order (my spawn) turns from game to game.
  const players = [...others]; players.splice((job.n - 1) % (opponents + 1), 0, me);
  writeFileSync(path.join(dir, 'map.txt'), `template ${template}, pack ${pack}, seed ${seed}; ${opponents} scripted bot${opponents > 1 ? 's' : ''}; you join ${players.indexOf(me) + 1} of ${players.length}\n`);
  const result = await runBotMatch({ game: 'skywars', players, outDir: dir, video: false, port: job.port, difficulty: job.difficulty, statusEveryTicks: 5, maxSeconds: job.timeLimit ?? 480,
    skywarsTemplate: template, skywarsPack: pack, skywarsSeed: seed, log: () => {} });
  const ev = jl(dir, 'events.jsonl');
  const t0 = ev.find((e) => e.kind === 'phase' && e.phase === 'playing')?.t ?? 0;
  const ts = (t) => `${(t - t0).toFixed(1)}s`;
  writeFileSync(path.join(dir, 'timeline.txt'), ev.filter((e) => e.kind === 'autopilot_status').map((e) => `${ts(e.t)} ${e.who.padEnd(10)} (${e.pos.x}, ${e.pos.y}, ${e.pos.z}) hp ${e.health}${e.absorption ? `+${e.absorption}` : ''} ${e.held ?? 'empty hand'} | ${e.doing ?? ''}`).join('\n'));
  const chat = jl(dir, 'chat.jsonl').filter((c) => !/HUD hidden|recipes|advancement/.test(c.text)).map((c) => `${ts(c.t)} ${c.text}`);
  writeFileSync(path.join(dir, 'chat.txt'), chat.join('\n'));
  writeFileSync(path.join(dir, 'referee.txt'), violations.map((v) => `${v.who}: ${v.kind}: ${v.detail}${v.dropped ? ' (DROPPED)' : ''}`).join('\n') || '(nothing)');
  const winner = result.winnerName ?? null;
  const verdict = winner === job.name ? 'you won' : winner ? `${winner} won` : `no winner (${result.endReason})`;
  const summary = `# Practice ${job.n} (${template}, seed ${seed}, ${opponents} scripted bot${opponents > 1 ? 's' : ''}): ${verdict} after ${result.seconds} s\n\n${chat.slice(-10).join('\n')}\n\nReferee: ${violations.length ? `${violations.length} notes (see referee.txt)` : 'nothing'}\nFiles: practice/${job.n}/timeline.txt (every bot every 0.5 s), chat.txt, referee.txt, map.txt, recording/ (everything).`;
  writeFileSync(path.join(dir, 'summary.md'), summary);
}

if (process.argv[2] === 'run' && import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runOne(process.argv[3]).then(() => process.exit(0), (err) => { console.error(err?.stack ?? err); process.exit(1); });
}
