// What a playbook sees: the round in the general state's words (packages/blockyland-mcp/generalState.js) and the bot
// itself -- never a game's own state. A playbook that reads only this, and acts only through skills (skills.mjs), is
// not tied to SkyWars or Bed Wars: the same view, the same skills, serve any game a mod reports.
//
// The round comes from the mod (`session.generalState`, sent with its state). A host whose mod does not send one yet
// is described here from what the guest already keeps -- by the mod's own describe function, so both read the same.
import { describeSkyWars } from '../../src/mods/skywars/generalState.js';
import { describeBedWars } from '../../src/mods/bedwars/generalState.js';
import { WEAPON_DAMAGE } from '../../packages/blockyland-mcp/guestPeer.js';

const key = (at) => `${Math.floor(at[0])},${Math.floor(at[1])},${Math.floor(at[2])}`;

/** The round as the general state: the mod's, or described from the guest's own record of it. */
export function roundOf(session) {
  if (session.generalState) return session.generalState;
  if (session.gameMode === 'skywars' && session.skywarsState) {
    return describeSkyWars(session.skywarsState, { chests: [...session.chests.values()], spawns: session.skywarsSpawns, islands: [] });
  }
  if (session.gameMode === 'bedwars' && session.bedwarsState) return describeBedWars(session.bedwarsState, session.bedwarsArena);
  return null;
}

/** What the bot carries, by what it is for: currencies, blocks, weapons. Read when asked (a purchase changes it). */
function carrying(session) {
  const inv = session.inventory;
  const count = (id) => inv.countItem(id);
  return {
    count,
    has: (id) => inv.allSlots().some((s) => s && s.id === id),
    get blocks() { return inv.countPlaceableBlocks(); },
    get hasWeapon() { return inv.allSlots().some((s) => s && WEAPON_DAMAGE[s.id]); },
    /** Only a wooden sword, or no weapon at all. */
    get onlyStarterWeapon() { return inv.allSlots().every((s) => !s || s.id === 'wooden_sword' || !WEAPON_DAMAGE[s.id]); },
    get iron() { return count('iron_ingot'); }, get gold() { return count('gold_ingot'); },
    get diamond() { return count('diamond'); }, get emerald() { return count('emerald'); },
  };
}

/**
 * The view: { game, phase, rules, elapsed, timeLeft, next, players, teams, objectives, places, me }. Objectives the
 * bot has learned about carry what it learned: a chest it has looted (`looted`), a chest whose contents it has seen
 * (`seenItems`). `me` is the bot: where it stands, its team or slot, whether it can act, what it carries, and its
 * settings (difficulty, style, kit).
 */
export function buildView(session) {
  const round = roundOf(session);
  if (!round) return null;
  const meInRound = round.players.find((p) => p.id === session.clientId) ?? null;
  const objectives = round.objectives.map((o) => {
    if (o.kind !== 'chest') return o;
    const k = key(o.at), known = session.chests.get(k);
    return { ...o, looted: session.lootedChestKeys.has(k), seenItems: (known?.items ?? []).some(Boolean) };
  });
  const p = session.position;
  return {
    game: round.game, phase: round.phase, rules: round.rules, elapsed: round.elapsed, timeLeft: round.timeLeft, next: round.next,
    players: round.players, teams: round.teams, objectives, places: round.places,
    me: {
      id: session.clientId,
      inRound: meInRound,
      team: meInRound?.team ?? null,
      slot: meInRound?.slot ?? null,
      alive: Boolean(meInRound?.alive),
      // Able to act now: alive in the round, not dead or waiting to respawn here, playing (not watching).
      canAct: Boolean(meInRound?.alive) && !session.isDead && !session.waitingRespawn && session.gamemode === 'survival',
      at: { x: p.x, y: p.y, z: p.z },
      spawnPoint: { ...session.spawnPoint },
      difficulty: session.difficulty,
      style: session.strategy,
      carrying: carrying(session),
      /** What the shop has sold me this round (armour tier, tools): read when asked. */
      get kit() { return session.bedwarsKit ?? {}; },
      /** What my difficulty allows (the house bot's skills and the guest's profile). */
      ability: {
        shop: session.skills?.bedwarsShop ?? 'basic',
        usePearls: Boolean(session.profile?.usePearls),
        maxBedDefense: session.profile?.maxBedDefense ?? 0,
      },
    },
    // What the playbook keeps between decisions; the guest clears it when a round starts.
    memory: memoryOf(session),
  };
}

/** A playbook's memory between decisions, kept on the session (the guest resets the bed's count each round). */
function memoryOf(session) {
  return {
    get bedDefenseCount() { return session.bedDefenseCount ?? 0; },
    set bedDefenseCount(n) { session.bedDefenseCount = n; },
    get stockingSince() { return session.stockingSince ?? null; },
    set stockingSince(t) { session.stockingSince = t; },
  };
}

// --- reading a view -------------------------------------------------------------------------------------------------

export const dist2 = (a, at) => Math.hypot(at[0] - a.x, at[2] - a.z);
/** The objectives of a kind (and more filters: { team, state, notTeam }). */
export function objectivesOf(view, kind, { team, notTeam, state } = {}) {
  return view.objectives.filter((o) => o.kind === kind && (team === undefined || o.team === team) && (notTeam === undefined || o.team !== notTeam) && (state === undefined || o.state === state));
}
/** The first place of a kind (and more filters: { team, slot }). */
export function placeOf(view, kind, { team, slot } = {}) {
  return view.places.find((o) => o.kind === kind && (team === undefined || o.team === team) && (slot === undefined || o.slot === slot)) ?? null;
}
/** Nearest first, from the bot. */
export function byDistance(view, list) {
  return [...list].sort((a, b) => dist2(view.me.at, a.at) - dist2(view.me.at, b.at));
}
