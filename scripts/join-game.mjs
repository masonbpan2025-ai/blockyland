// Headless guest runner for joining a Blockyland multiplayer game (Base Game, SkyWars, Bed Wars).
//
// Usage:
//   node scripts/join-game.mjs --code 2393
//   node scripts/join-game.mjs --code 2393 --name "Gemini" --url ws://localhost:3000/ws/share

import { WebSocket } from 'ws';
import { GuestPeerSession } from '../packages/blockyland-mcp/guestPeer.js';

const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback;
}

const code = getArg('code', '2393');
const name = getArg('name', 'Gemini');
const url = getArg('url', 'ws://localhost:3000/ws/share');
const strategy = getArg('strategy', 'auto');
const difficulty = getArg('difficulty', 'normal');

console.log(`[JoinGame] Connecting to ${url} with room code "${code}" as "${name}"...`);

const guest = new GuestPeerSession({
  code,
  name,
  url,
  WebSocketImpl: WebSocket,
  autopilot: true,
  strategy,
  difficulty,
});

let lastPhase = null;
let lastAction = null;
let lastHealth = null;

function logState() {
  const status = guest.status();
  const sw = status.skywars;
  const phase = sw?.phase || 'unknown';
  const action = guest.lastActionSummary || 'idle';
  const health = guest.health;

  if (phase !== lastPhase || action !== lastAction || Math.abs(health - (lastHealth ?? health)) >= 2) {
    const alivePlayers = sw?.players ? sw.players.filter((p) => p.alive).map((p) => p.name).join(', ') : 'unknown';
    console.log(
      `[SkyWars] Phase: ${phase.toUpperCase()} | Health: ${health}/20 | Action: ${action} | Alive: [${alivePlayers}]`
    );
    lastPhase = phase;
    lastAction = action;
    lastHealth = health;
  }

  if (sw?.winner) {
    console.log(`[SkyWars] Match finished! Winner: ${sw.winner}`);
  }
}

try {
  const initial = await guest.connect({ timeoutMs: 30000 });
  console.log(`[JoinGame] Successfully joined room ${code}! Client ID: ${guest.clientId}`);
  console.log(`[JoinGame] Game mode: ${initial.gameMode || 'skywars'} | Phase: ${initial.skywars?.phase || 'lobby'} | Difficulty: ${guest.difficulty}`);

  // Greet the game in chat
  setTimeout(() => {
    guest.sendChat("Hello! I've joined the SkyWars match.");
  }, 1000);

  // Monitor loop
  const interval = setInterval(() => {
    if (!guest.connected) {
      console.log('[JoinGame] Disconnected from server.');
      clearInterval(interval);
      process.exit(0);
    }
    logState();
  }, 1000);

  const cleanup = () => {
    console.log('[JoinGame] Leaving game...');
    clearInterval(interval);
    guest.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
} catch (err) {
  console.error('[JoinGame] Error joining game:', err.message);
  process.exit(1);
}
