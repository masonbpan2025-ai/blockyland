// The general state (lives in the blockyland-mcp package so a headless guest can read it; src/mods/generalState.js
// re-exports it for the mods): what any game a mod runs looks like to a player who does not know that game -- the same shape
// for SkyWars, Bed Wars, and any game added later. A mod reports it beside its own state (`general` on its `state`
// message), and a bot that reads only this (agentArena/skills/view.mjs) can play a game it was never written for:
// a model reads the rules and the objectives and plans with general skills.
//
//   {
//     v: 1,
//     game: 'skywars',                 // the mod's id
//     phase: 'lobby' | 'countdown' | 'playing' | 'ended',
//     rules: {
//       goal: 'last_player' | 'last_team' | 'most_points' | ...,   // how a round is won, as a tag
//       text: 'Be the last player alive ...',                     // the rulebook, short, for a model to read
//       teams: false, respawn: false, timeLimit: 600 | null,
//     },
//     elapsed: 12,                     // seconds of play
//     timeLeft: 588 | null,
//     next: { label: 'Chest refill', in: 168 } | null,          // the next scheduled thing, if any
//     players: [{ id, name, team: null, alive: true, score: { kills: 0 } }],
//     teams: [{ id: 'red', alive: true, score: {...} }] | null,
//     objectives: [{ id, kind, at: [x, y, z], team, state, ...tags }],
//       // what is there to take, hold or destroy: 'chest' (state 'filled'), 'bed' ('standing' | 'broken'),
//       // 'generator' (state 'ready' | 'empty', with `resource`, `stock`), 'flag', ...
//     places: [{ id, kind, at: [x, y, z], team, ...tags }],
//       // where things are: 'spawn' (with `slot` or `team`), 'base', 'middle', 'shop', ...
//     winner: null, endReason: null,
//   }
//
// Positions are block coordinates (x, z at a block's middle where the mod says so). Nothing here is secret: it is what
// every player of the game is shown or could see. Live positions of players are not part of it (they come with every
// player's movement).

export const GENERAL_STATE_VERSION = 1;
export const PHASES = Object.freeze(['lobby', 'countdown', 'playing', 'ended']);
const MAX_LIST = 512;
const ID = /^[a-z0-9_:.-]{1,64}$/i;

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const point = (at) => (Array.isArray(at) && at.length === 3 && at.every(finite) ? [at[0], at[1], at[2]] : null);
const text = (s, max = 2000) => (typeof s === 'string' ? s.slice(0, max) : null);

/** Copy the plain extra fields of an entry (tags such as `slot`, `resource`, `stock`): numbers, strings, booleans. */
function tags(raw, skip) {
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (skip.has(k) || !ID.test(k)) continue;
    if (finite(v) || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 64);
    else if (v === null) out[k] = null;
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      // One level of numbers, for a stock or a score.
      const flat = {};
      for (const [kk, vv] of Object.entries(v)) if (ID.test(kk) && finite(vv)) flat[kk] = vv;
      out[k] = flat;
    }
  }
  return out;
}

const ENTRY_KEYS = new Set(['id', 'kind', 'at', 'team', 'state']);

/** One objective or place, or null when it is not one. */
function entry(raw, { needState }) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !ID.test(raw.id) || typeof raw.kind !== 'string' || !ID.test(raw.kind)) return null;
  const at = point(raw.at);
  if (!at) return null;
  const out = { id: raw.id, kind: raw.kind, at, team: typeof raw.team === 'string' && ID.test(raw.team) ? raw.team : null, ...tags(raw, ENTRY_KEYS) };
  if (needState) out.state = typeof raw.state === 'string' && ID.test(raw.state) ? raw.state : 'unknown';
  return out;
}

/**
 * A general state as a mod sent it, checked: the known fields of the right types, lists bounded; null when it is not
 * one. A guest keeps only what this returns.
 */
export function sanitizeGeneralState(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== GENERAL_STATE_VERSION || typeof raw.game !== 'string' || !ID.test(raw.game)) return null;
  if (!PHASES.includes(raw.phase)) return null;
  const rules = raw.rules && typeof raw.rules === 'object' ? raw.rules : {};
  const list = (xs, f) => (Array.isArray(xs) ? xs.slice(0, MAX_LIST).map(f).filter(Boolean) : []);
  return {
    v: GENERAL_STATE_VERSION,
    game: raw.game,
    phase: raw.phase,
    rules: {
      goal: typeof rules.goal === 'string' && ID.test(rules.goal) ? rules.goal : 'unknown',
      text: text(rules.text) ?? '',
      teams: rules.teams === true,
      respawn: rules.respawn === true,
      timeLimit: finite(rules.timeLimit) ? rules.timeLimit : null,
    },
    elapsed: finite(raw.elapsed) ? raw.elapsed : 0,
    timeLeft: finite(raw.timeLeft) ? raw.timeLeft : null,
    next: raw.next && typeof raw.next === 'object' && finite(raw.next.in) ? { label: text(raw.next.label, 64) ?? '', in: raw.next.in } : null,
    players: list(raw.players, (p) => (p && typeof p.id === 'string' && ID.test(p.id)
      ? { id: p.id, name: text(p.name, 32) ?? p.id, team: typeof p.team === 'string' && ID.test(p.team) ? p.team : null, alive: p.alive !== false, ...tags(p, new Set(['id', 'name', 'team', 'alive'])) }
      : null)),
    teams: Array.isArray(raw.teams) ? list(raw.teams, (t) => (t && typeof t.id === 'string' && ID.test(t.id) ? { id: t.id, alive: t.alive !== false, ...tags(t, new Set(['id', 'alive'])) } : null)) : null,
    objectives: list(raw.objectives, (o) => entry(o, { needState: true })),
    places: list(raw.places, (o) => entry(o, { needState: false })),
    winner: typeof raw.winner === 'string' ? raw.winner.slice(0, 64) : null,
    endReason: typeof raw.endReason === 'string' ? raw.endReason.slice(0, 64) : null,
  };
}

/** The game's phase in the general words: each mod names its own. */
export function generalPhase(phase) {
  if (phase === 'playing') return 'playing';
  if (phase === 'countdown' || phase === 'starting' || phase === 'cage' || phase === 'caged') return 'countdown';
  if (phase === 'ended' || phase === 'over' || phase === 'finished') return 'ended';
  return 'lobby';
}
