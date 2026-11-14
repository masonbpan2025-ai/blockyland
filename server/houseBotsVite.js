// "Bot join" (the SkyWars and Bed Wars lobbies): the dev server plays house bots -- the bots AI models wrote in the Agent
// Arena, and the scripted bot they started from (agentArena/bots/ai/index.mjs) -- as guest players in a room, by its
// code. Only a server with Node can: the lobby asks GET /__house-bots first and shows the button only when it answers.
//   GET  /__house-bots          { available: true, bots: [{ name, game, code, team, ai }], teams: [{ code, team, ai }] }
//   POST /__house-bots/join     { code, game, team? } -> { ok, name, ai } or { ok: false, reason }
//
// Which bot: in SkyWars each bot that joins is one of the five, drawn at random; in Bed Wars a team is given one of the
// five when its first bot joins, and all its bots play that one.
//
// At once: the bots run in bot hosts (agentArena/botHost.mjs), Node processes that load the game client and every bot
// as they start. One is kept loaded and waiting from the moment a lobby asks whether bots are available, so a request
// is handed to a host that is already loaded, and the bot is in the room in about the time it takes to connect. A host
// plays one SkyWars bot, or all the bots of one Bed Wars team (a squad shares its strategy's memory, and two teams never
// do); a Bed Wars team's later bots join its host directly.
import { fork } from 'node:child_process';
import path from 'node:path';
import { drawBot } from '../agentArena/bots/ai/index.mjs';

const MAX_BOTS = 24;
/** Bot hosts kept loaded and waiting: two, so a second click right after the first finds one ready too. */
const SPARES = 2;
const GAMES = new Set(['skywars', 'bedwars']);

/** A bot host as a child process (the default `spawnHost`): fork() with an IPC channel. */
export function forkBotHost(log = () => {}) {
  const child = fork(path.resolve('agentArena/botHost.mjs'), [], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const say = (d) => { for (const line of String(d).trim().split('\n')) if (line) log(line); };
  child.stdout?.on('data', say);
  child.stderr?.on('data', say);
  return child;
}

/**
 * The plugin. Options (for tests): `maxBots`; `spawnHost()` returns a bot host (a ChildProcess-like object: send(msg),
 * on('message' | 'exit', fn), kill()); `random()` draws bots.
 */
export function houseBotsPlugin({ maxBots = MAX_BOTS, spawnHost = null, random = Math.random, spares: spareCount = SPARES } = {}) {
  const bots = new Map(); // name -> { host, game, code, team, ai }
  const teams = new Map(); // "code/team" -> { host, ai } (Bed Wars)
  const spares = []; // bot hosts loaded and waiting
  let counter = 0, logger = () => {};
  const json = (res, status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
  const readBody = (req) => new Promise((resolve) => {
    let text = '';
    req.on('data', (c) => { text += c; if (text.length > 2000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(text || '{}')); } catch { resolve(null); } });
  });

  const newHost = () => {
    const host = (spawnHost ?? (() => forkBotHost((l) => logger(`[house bot] ${l}`))))();
    host.on('message', (m) => {
      if (m?.type === 'left' || m?.type === 'failed') {
        bots.delete(m.name);
        if (m.type === 'failed') logger(`[house bot] ${m.name} could not join: ${m.reason}`);
      } else if (m?.type === 'joined') logger(`[house bot] ${m.name} joined`);
    });
    host.on('exit', () => {
      const i = spares.indexOf(host); if (i >= 0) spares.splice(i, 1);
      for (const [name, b] of bots) if (b.host === host) bots.delete(name);
      for (const [k, t] of teams) if (t.host === host) teams.delete(k);
    });
    return host;
  };
  /** Keep the waiting hosts loaded: start any missing. Returns the first. */
  const warm = () => { while (spares.length < Math.max(1, spareCount)) spares.push(newHost()); return spares[0]; };
  /** Take a waiting host for a new group, and start the next one loading. */
  const takeHost = () => { const host = warm(); spares.shift(); warm(); return host; };

  /** Start a bot: { code, game, team } -> { ok, name, ai } or { ok: false, status, reason }. */
  function join({ code, game, team, url }) {
    if (bots.size >= maxBots) return { ok: false, status: 429, reason: `at most ${maxBots} bots at once` };
    let host, ai;
    if (game === 'bedwars') {
      const key = `${code}/${team}`;
      let squad = teams.get(key);
      if (!squad) { squad = { host: takeHost(), ai: drawBot('bedwars', random).name }; teams.set(key, squad); }
      ({ host, ai } = squad);
    } else { host = takeHost(); ai = drawBot('skywars', random).name; }
    const name = `${ai}Bot-${++counter}`;
    bots.set(name, { host, game, code, team, ai });
    host.send({ type: 'join', name, code, game, team, ai, url });
    return { ok: true, name, ai };
  }

  const api = {
    name: 'house-bots',
    /** For tests: what is running. */
    state: () => ({ bots: [...bots].map(([name, b]) => ({ name, game: b.game, code: b.code, team: b.team, ai: b.ai })), teams: [...teams].map(([k, t]) => ({ key: k, ai: t.ai })), spares: spares.length }),
    join,
    warm,
    configureServer(server) {
      logger = (line) => server.config.logger.info(line);
      const stopAll = () => {
        for (const h of new Set([...[...bots.values()].map((b) => b.host), ...[...teams.values()].map((t) => t.host), ...spares])) { try { h.kill(); } catch { /* gone */ } }
        bots.clear(); teams.clear(); spares.length = 0;
      };
      server.httpServer?.on('close', stopAll);
      process.once('exit', stopAll);

      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0];
        if (url === '/__house-bots' && req.method === 'GET') {
          warm(); // a lobby is open: have a host loaded before anyone presses Bot join
          const s = api.state();
          return json(res, 200, { available: true, bots: s.bots, teams: s.teams.map((t) => ({ code: t.key.split('/')[0], team: t.key.split('/')[1], ai: t.ai })) });
        }
        if (url !== '/__house-bots/join' || req.method !== 'POST') return next();
        const body = await readBody(req);
        const code = String(body?.code ?? ''), game = String(body?.game ?? ''), team = body?.team ? String(body.team) : null;
        if (!/^[0-9]{4}$/.test(code) || !GAMES.has(game) || (team && !/^[a-z]{2,12}$/.test(team)) || (game === 'bedwars' && !team)) {
          return json(res, 400, { ok: false, reason: 'a room code, a game (skywars or bedwars) and, for Bed Wars, a team' });
        }
        const port = server.httpServer?.address()?.port ?? server.config.server.port ?? 3000;
        const r = join({ code, game, team, url: `ws://127.0.0.1:${port}/ws/share` });
        return r.ok ? json(res, 200, { ok: true, name: r.name, ai: r.ai }) : json(res, r.status, { ok: false, reason: r.reason });
      });
    },
  };
  return api;
}
