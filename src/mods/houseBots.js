// "Bot join" for the SkyWars and Bed Wars lobbies: ask the dev server to play a bot -- one of the Agent Arena's bots,
// written by AI models (agentArena/bots/ai/) -- that joins this room as a player (server/houseBotsVite.js). A server without Node
// (the deployed game) has no such route, and the button stays hidden.

let available = null; // null: not asked yet; a promise while asking; then true or false

/** Whether this server can start house bots. Asked once; `onAnswer` runs when the answer arrives. */
export function houseBotsAvailable(onAnswer = () => {}) {
  if (available === true || available === false) return available;
  if (!available) {
    available = fetch('/__house-bots', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null)).then((j) => j?.available === true).catch(() => false)
      .then((yes) => { available = yes; onAnswer(yes); return yes; });
  }
  return false;
}

/**
 * Start a bot in a room.
 * @returns {Promise<{ok: boolean, name?: string, reason?: string}>}
 */
export async function requestHouseBot({ code, game, team = null }) {
  try {
    const r = await fetch('/__house-bots/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, game, team }) });
    const j = await r.json().catch(() => null);
    return j ?? { ok: false, reason: `the server answered ${r.status}` };
  } catch (err) {
    return { ok: false, reason: `no bot server (${err.message})` };
  }
}
