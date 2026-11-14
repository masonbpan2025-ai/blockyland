// Bed Wars in the general state's words (../generalState.js): what any player of it is shown, for a bot that knows no
// Bed Wars. The rules text is agentArena/docs/bedwars-rulebook.md in short.
import { GENERAL_STATE_VERSION, generalPhase } from '../generalState.js';
import { RESPAWN_SECONDS } from './rules.js';

export const BEDWARS_RULES_TEXT = [
  'Bed Wars: teams start on their own islands, each with a bed, a forge that makes iron and gold, and a shop.',
  'Spend iron, gold, diamonds and emeralds at the shop for blocks, weapons, armour and tools; team upgrades cost diamonds.',
  `While your team's bed stands, you come back ${RESPAWN_SECONDS} seconds after dying. Once it is broken, a death is final.`,
  'Bridge to the other islands, break the enemy beds, and defend your own (cover it with blocks).',
  'Diamond generators sit between the bases; emerald generators in the middle.',
  'The last team with a player alive wins.',
].join(' ');

const at = (p) => [p.x, p.y, p.z];

/**
 * The general state of a Bed Wars round: `state` is the match's snapshot (rules.js), `arena` the map built for it
 * (arena.js buildArena: each base's bed, forge, shop and spawn; the diamond and emerald generators).
 */
export function describeBedWars(state, arena = null) {
  const teams = state?.teams ?? [];
  const bedOf = new Map(teams.map((t) => [t.id, t.bed !== false]));
  const stockOf = new Map((state?.gens ?? []).map((g) => [g.id, g]));
  const objectives = [], places = [];
  for (const b of arena?.bases ?? []) {
    objectives.push({ id: `bed-${b.team}`, kind: 'bed', at: [...b.bed.foot], team: b.team, state: bedOf.get(b.team) === false ? 'broken' : 'standing', head: b.bed.head.join(',') });
    const forge = stockOf.get(`f-${b.team}`);
    objectives.push({ id: `f-${b.team}`, kind: 'generator', at: at(b.forge), team: b.team, state: forgeReady(forge) ? 'ready' : 'empty', resource: 'iron', stock: { ...(forge?.stock ?? {}) } });
    places.push({ id: `spawn-${b.team}`, kind: 'spawn', at: at(b.spawn), team: b.team });
    places.push({ id: `base-${b.team}`, kind: 'base', at: [b.center.x, b.spawn.y, b.center.z], team: b.team, radius: b.radius ?? null });
    places.push({ id: `shop-${b.team}`, kind: 'shop', at: at(b.shop), team: b.team });
    places.push({ id: `upgrades-${b.team}`, kind: 'upgrades', at: at(b.upgrades), team: b.team });
  }
  for (const g of [...(arena?.diamonds ?? []), ...(arena?.emeralds ?? [])]) {
    const resource = g.kind ?? (String(g.id).startsWith('e') ? 'emerald' : 'diamond');
    const gen = stockOf.get(g.id);
    objectives.push({ id: g.id, kind: 'generator', at: at(g), team: null, state: (gen?.stock?.[resource] ?? 0) > 0 ? 'ready' : 'empty', resource, stock: { ...(gen?.stock ?? {}) } });
  }
  places.push({ id: 'middle', kind: 'middle', at: arena?.middle ? [arena.middle.x, arena.middle.y ?? 31, arena.middle.z] : [0.5, 31, 0.5], team: null });
  const next = state?.next ? { label: state.next.label, in: state.next.in } : null;
  return {
    v: GENERAL_STATE_VERSION,
    game: 'bedwars',
    phase: generalPhase(state?.phase),
    rules: { goal: 'last_team', text: BEDWARS_RULES_TEXT, teams: true, respawn: true, timeLimit: null },
    elapsed: Math.max(0, Number(state?.elapsed) || 0),
    timeLeft: null,
    next,
    players: (state?.players ?? []).map((p) => ({ id: p.id, name: p.name ?? p.id, team: p.team ?? null, alive: p.alive !== false && !p.dead, respawnIn: p.respawnIn ?? null, score: { kills: p.kills ?? 0, finalKills: p.finalKills ?? 0, beds: p.beds ?? 0 } })),
    teams: teams.map((t) => ({ id: t.id, alive: !t.eliminated, bed: t.bed !== false })),
    objectives,
    places,
    winner: state?.winner ?? null,
    endReason: state?.endReason ?? null,
  };
}

function forgeReady(gen) {
  return Boolean(gen && Object.values(gen.stock ?? {}).some((n) => n > 0));
}
