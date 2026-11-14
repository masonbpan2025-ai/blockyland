#!/usr/bin/env node
// One bot joining a SkyWars or Bed Wars room as a guest player, from the command line: for trying a brain by hand. (The
// lobby's "Bot join" no longer runs this: it plays the Agent Arena's bots in bot hosts already loaded,
// agentArena/botHost.mjs, from server/houseBotsVite.js.) It plays until the room closes or it is told to stop.
//
//   node agentArena/scriptedBotJoin.mjs --code 1234 --game skywars|bedwars [--team blue] [--name Bot-1] [--url ws://localhost:3000/ws/share]
//                                       [--brain scripted|mcp|program] [--rules autopilot|arena] [--difficulty easy|normal|hard]
//
// Brains:
// - scripted (the default): the scripted bot (agentArena/scriptedBot/). Its difficulty follows the room's Difficulty
//   button (the guest adopts the room's setting whenever the room's state changes); --difficulty is only where it starts.
// - mcp: the MCP guest's own autopilot (packages/blockyland-mcp/guestPeer.js #brainSkyWars / #brainBedWars), exactly as
//   `join_game` runs it for an MCP agent: the yardstick for the fork.
// - program: a strategy program (agentArena/bots/<game>.js) through the arena's bot runner, under --rules (autopilot:
//   the autopilot's standard at --difficulty; arena: the Agent Arena's human limits).
import path from 'node:path';
import os from 'node:os';
import { mkdirSync, appendFileSync } from 'node:fs';
import { GuestPeerSession } from '../packages/blockyland-mcp/guestPeer.js';
import { BotPlayer, TICK_MS } from './botRunner.mjs';
import { ScriptedBotSession } from './scriptedBot/scriptedBot.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const code = opt('code'), game = opt('game');
if (!/^[0-9]{4}$/.test(code ?? '') || !['skywars', 'bedwars'].includes(game)) {
  console.error('usage: node agentArena/scriptedBotJoin.mjs --code <4 digits> --game skywars|bedwars [--team <id>] [--name <name>] [--url <ws url>] [--brain scripted|mcp|program]');
  process.exit(2);
}
const name = opt('name', `Bot-${Math.floor(100 + Math.random() * 900)}`);
const url = opt('url', 'ws://localhost:3000/ws/share');
const team = opt('team', null);
// "house" is the old name of the scripted brain.
const brain = opt('brain', 'scripted') === 'house' ? 'scripted' : opt('brain', 'scripted');
if (!['scripted', 'mcp', 'program'].includes(brain)) { console.error(`unknown brain "${brain}" (scripted, mcp or program)`); process.exit(2); }
const isScripted = brain === 'scripted';
const rules = { standard: opt('rules', 'autopilot'), difficulty: opt('difficulty', 'normal') };
const log = (...a) => console.log(new Date().toISOString(), `[${name}]`, ...a);

// What a bot did, for reading after a game: <temp>/blockyland-house-bots/<room>-<name>/<name>.log.
const statusDir = path.join(os.tmpdir(), 'blockyland-house-bots', `${code}-${name}`);
mkdirSync(statusDir, { recursive: true });
const logFile = path.join(statusDir, `${name}.log`);
const note = (text) => { try { appendFileSync(logFile, `${new Date().toISOString()} ${text}\n`); } catch { /* full disk */ } };

const session = isScripted
  ? new ScriptedBotSession({ code, name, url, difficulty: rules.difficulty })
  : new GuestPeerSession({ code, name, url, autopilot: brain === 'mcp', difficulty: rules.difficulty });
// A house bot does not answer chat (no model behind it); its game play is all it does.
session.handlePlayerChat = async () => ({ ok: true });
await session.connect({ timeoutMs: 60000, team });
if (isScripted) session.startHouseBrain();
log(`joined room ${code} (${game}${team ? `, team ${team}` : ''}; brain ${brain})`);
log('log:', logFile);
note(`joined room ${code} (${game}; brain ${brain})`);

let player = null;
if (brain === 'program') {
  const recorder = { write() {}, json() {}, line(file, text) { try { appendFileSync(file, `${new Date().toISOString()} ${text}\n`); } catch { /* full disk */ } } };
  player = new BotPlayer({
    name, session, game, recorder, statusDir, strategyFile: path.join(import.meta.dirname, 'bots', `${game}.js`),
    seed: Math.floor(Math.random() * 2 ** 31), getMatch: () => null, getMessages: () => [],
    timeLimit: game === 'skywars' ? 600 : 3000, rules,
  });
}

let stopping = false;
const stop = (why) => {
  if (stopping) return;
  stopping = true;
  log('leaving:', why);
  note(`leaving: ${why}`);
  try { session.disconnect(); } catch { /* gone */ }
  setTimeout(() => process.exit(0), 300);
};
process.on('SIGTERM', () => stop('stopped'));
process.on('SIGINT', () => stop('stopped'));

const phase = () => (game === 'bedwars' ? session.bedwarsState?.phase : session.skywarsState?.phase) ?? 'lobby';
let idleSince = Date.now(), lastNote = 0, lastSummary = '', lastPhase = '';
for (;;) {
  if (stopping) break;
  if (!session.connected) { stop('the room closed'); break; }
  const p = phase();
  if (player) { try { player.step({ playing: p === 'playing' }); } catch (err) { log('step:', err.message); } }
  else {
    // An autopilot plays by itself (its own timers); the log gets its phase, difficulty and what it is doing.
    const summary = session.lastActionSummary ?? 'idle';
    if (p !== lastPhase) { note(`phase ${p}; difficulty ${session.difficulty}`); lastPhase = p; }
    if (summary !== lastSummary && Date.now() - lastNote > 1000) {
      lastNote = Date.now(); lastSummary = summary;
      const at = session.position;
      note(`[${session.difficulty}] ${summary} at ${at.x.toFixed(1)} ${at.y.toFixed(1)} ${at.z.toFixed(1)}, health ${session.health}`);
    }
  }
  // A room left in its lobby for half an hour is let go.
  if (p === 'playing' || p === 'countdown') idleSince = Date.now();
  else if (Date.now() - idleSince > 30 * 60e3) { stop('idle for 30 minutes'); break; }
  await new Promise((r) => setTimeout(r, TICK_MS));
}
