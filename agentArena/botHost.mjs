#!/usr/bin/env node
// A house-bot host: one Node process that plays bots in a SkyWars or Bed Wars room for the lobby's "Bot join"
// (server/houseBotsVite.js). It loads the game client and every bot (agentArena/bots/ai/index.mjs) as it starts, before
// anyone asks for a bot, so a bot it is asked for joins at once: no process to start, no modules to load.
//
// One process plays one group: a single SkyWars bot, or the bots of one Bed Wars team -- a squad shares its strategy's
// module, and with it any memory the strategy keeps (Gemini's team radio), so two teams never share a process.
//
// Messages from the parent (process.send / IPC):
//   { type: 'join', name, code, game, team?, ai, url, difficulty? }  -> { type: 'joined', name } or { type: 'failed', name, reason }
//   { type: 'leave', name }                                          -> the bot leaves the room
// To the parent: { type: 'ready' } once everything is loaded; { type: 'left', name } when a bot's room closes.
// It exits when its parent goes, or when its last bot has left.
import { pathToFileURL } from 'node:url';
import { AI_BOTS, aiBot } from './bots/ai/index.mjs';
import { arenaBlocks } from './arenaWorld.mjs';

const send = (m) => { try { process.send?.(m); } catch { /* parent gone */ } };
const modules = new Map(); // entry -> module
const sessions = new Map(); // name -> session

/** Every bot of every game, loaded now. */
export async function preload() {
  for (const bots of Object.values(AI_BOTS)) for (const b of bots) if (!modules.has(b.entry)) modules.set(b.entry, await import(pathToFileURL(b.entry).href));
}

/**
 * Start one bot in a room. `ai` names the bot (AI_BOTS). Resolves once it has joined (its team chosen, its brain on).
 * `Session` and `connect` options exist for tests.
 */
export async function startBot({ name, code, game, team = null, ai, url, difficulty = 'normal' }, { onLeft = () => {} } = {}) {
  const bot = aiBot(game, ai);
  if (!bot) throw new Error(`no ${game} bot named ${ai}`);
  if (!modules.has(bot.entry)) modules.set(bot.entry, await import(pathToFileURL(bot.entry).href));
  const { ScriptedBotSession } = modules.get(bot.entry);
  // It builds its own arena (no world from the host), and builds or digs its way out when stuck.
  const session = new ScriptedBotSession({ code, name, url, difficulty, buildWorld: arenaBlocks, escapeWhenStuck: true });
  session.handlePlayerChat = async () => ({ ok: true }); // a house bot plays; it does not chat
  await session.connect({ timeoutMs: 20000, team });
  session.startHouseBrain();
  sessions.set(name, session);
  // The room closed (or the bot was dropped): this bot is done.
  const watch = setInterval(() => {
    if (session.connected && session.ws) return;
    clearInterval(watch);
    sessions.delete(name);
    onLeft(name);
  }, 1000);
  watch.unref?.();
  return session;
}

export function stopBot(name) {
  const s = sessions.get(name);
  if (!s) return false;
  try { s.stopHouseBrain?.(); } catch { /* already */ }
  s.disconnect();
  sessions.delete(name);
  return true;
}

// --- as a child process ---------------------------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let started = 0;
  const leftOne = (name) => { send({ type: 'left', name }); if (started && !sessions.size) process.exit(0); };
  process.on('message', async (m) => {
    if (m?.type === 'join') {
      started++;
      try { await startBot(m, { onLeft: leftOne }); send({ type: 'joined', name: m.name }); }
      catch (err) { send({ type: 'failed', name: m.name, reason: err.message }); if (!sessions.size) process.exit(1); }
    } else if (m?.type === 'leave') { stopBot(m.name); leftOne(m.name); }
  });
  process.on('disconnect', () => process.exit(0));
  await preload();
  send({ type: 'ready' });
}
