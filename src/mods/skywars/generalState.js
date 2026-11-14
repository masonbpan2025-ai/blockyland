// SkyWars in the general state's words (../generalState.js): what any player of it is shown, for a bot that knows no
// SkyWars. The rules text is agentArena/docs/skywars-rulebook.md in short.
import { GENERAL_STATE_VERSION, generalPhase } from '../generalState.js';
import { REFILL_TIMES, TIME_LIMIT_SECONDS } from './rules.js';

export const SKYWARS_RULES_TEXT = [
  'SkyWars: every player starts caged on their own island in the sky, with a chest or two of gear.',
  'When the cages open, loot your chests, bridge to other islands with blocks, and fight.',
  'The middle island has the best chests. Chests refill at 3:00 and 6:00.',
  'A player who dies or falls into the void is out for the round (no respawn).',
  `The last player alive wins; at ${TIME_LIMIT_SECONDS / 60}:00 the round ends in a draw among those alive.`,
].join(' ');

/**
 * The general state of a SkyWars round: `state` is the match's snapshot (rules.js), `arena` the islands built for it
 * (generator.js: spawns by slot, chests with their slot and kind, the islands with their roles).
 */
export function describeSkyWars(state, arena = null) {
  const elapsed = Math.max(0, Number(state?.elapsed) || 0);
  const timeLimit = Number(state?.timeLimit) || TIME_LIMIT_SECONDS;
  const refills = Number(state?.refills) || 0;
  const nextRefill = refills < REFILL_TIMES.length ? REFILL_TIMES[refills] : null;
  const objectives = (arena?.chests ?? []).map((c, i) => ({
    id: `chest-${i}`,
    kind: 'chest',
    at: [c.x, c.y, c.z],
    team: null,
    state: 'filled',
    // Whose island it is on (a spawn slot), and where: an island's own, the middle's, or a connector's.
    slot: Number.isInteger(c.slot) ? c.slot : null,
    ring: c.kind === 'center' || c.kind === 'mid' ? c.kind : 'island',
  }));
  const places = [];
  (arena?.spawns ?? []).forEach((s, slot) => { if (s) places.push({ id: `spawn-${slot}`, kind: 'spawn', at: [s.x, s.y, s.z], team: null, slot }); });
  // Every middle (a map may have two, at different heights: Twin Peaks), the first the main one; and the smaller
  // islands between (connectors, sub-middles, sector islands), each with its height.
  const middles = (arena?.islands ?? []).filter((i) => i.role === 'center');
  if (!middles.length) places.push({ id: 'middle', kind: 'middle', at: [0.5, 31, 0.5], team: null });
  middles.forEach((m, i) => places.push({ id: i ? `middle-${i + 1}` : 'middle', kind: 'middle', at: [m.x + 0.5, m.y + 1, m.z + 0.5], team: null }));
  (arena?.islands ?? []).filter((i) => i.role !== 'center' && i.role !== 'spawn').forEach((m, i) => places.push({ id: `island-${i + 1}`, kind: 'island', at: [m.x + 0.5, m.y + 1, m.z + 0.5], team: null, role: m.role }));
  return {
    v: GENERAL_STATE_VERSION,
    game: 'skywars',
    phase: generalPhase(state?.phase),
    rules: { goal: 'last_player', text: SKYWARS_RULES_TEXT, teams: false, respawn: false, timeLimit },
    elapsed,
    timeLeft: state?.phase === 'playing' ? Math.max(0, timeLimit - elapsed) : null,
    next: nextRefill !== null && state?.phase === 'playing' ? { label: 'Chest refill', in: Math.max(0, nextRefill - elapsed) } : null,
    players: (state?.players ?? []).map((p) => ({ id: p.id, name: p.name ?? p.id, team: null, alive: p.alive !== false, slot: p.slot ?? null, score: { kills: p.kills ?? 0 } })),
    teams: null,
    objectives,
    places,
    winner: state?.winner ?? null,
    endReason: state?.endReason ?? null,
  };
}
