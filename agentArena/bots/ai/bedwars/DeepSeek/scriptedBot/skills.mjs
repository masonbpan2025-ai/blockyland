// houseBotDs's skills: the house bot's (agentArena/skills/skills.mjs) unchanged, and the ones its own brains needed --
// its gear (the weapon that does the most damage a second, armour on), its eating (a golden apple before the blows, an
// ordinary meal when the bar is not full), its ground sense (the inside of an island, a safer step, a place to give
// ground, the line to a foe), its throw with a measured range, the round clock it keeps itself, its memory of the
// fight so far, and the base's own geometry for the Bed Wars plan. A skill answers a question the general view does not
// ask (what is my health, where is my forge, which way does my bed face); the playbooks ask them by name.
import { createSkills } from '../skills/skills.mjs';
import { AUTOPILOT_MELEE_REACH } from '../../../../../../packages/blockyland-mcp/guestPeer.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const xyz = (at) => (Array.isArray(at) ? { x: at[0], y: at[1], z: at[2] } : at);

export function createBotSkills(bot) {
  const house = createSkills(bot);
  const say = (summary) => { if (summary) bot.lastActionSummary = summary; };

  return {
    ...house,

    // -- what my brain read from the session, as questions the view can answer only through a skill ----------------

    /** Seconds into the round, from my own clock (never the host's countdown read backwards). */
    clock: (game) => bot.houseElapsed(game),
    /** A new round starts its clock clean. */
    resetClock: (game) => bot.resetHouseClock(game),
    health: () => bot.health,
    absorption: () => bot.absorption ?? 0,
    isEating: () => bot.isEating(),
    startEating: (item) => bot.startEating(item),
    /** One brain step's pause -- the same wait the shared eat and bow take. */
    pauseStep: () => sleep(bot.profile.stepDelayMs),
    /** A difficulty's skill flag (throwables, bridgeDefence, pearls, ...), as the profile sets it. */
    setting: (name) => bot.skills?.[name],
    creative: () => bot.gamemode === 'creative',

    bestWeaponDamage: () => bot.bestWeaponDamage(),
    armorPieces: () => bot.armorPieces(),
    /** Armour on and the best weapon for a second in hand: mine, before any blow. */
    equipBattleGear: () => bot.equipBattleGear(),
    /** The foe has not hit me for 1.5 s while this fight is on: they are eating, or have broken off. */
    foeQuiet: () => bot.foeQuiet(),
    hasCombatHeal: () => bot.hasCombatHeal(),
    hasFood: () => bot.hasFood(),
    bestFood: () => bot.bestFood(),

    // -- ground: the inside of an island, a safer step, a place to give ground, the void on a line ------------------

    /** A cell a step from me with ground around it, still in reach, and ground behind it. */
    saferSpot: (fx, fz) => bot.saferSpot(fx, fz, AUTOPILOT_MELEE_REACH),
    /** A cell away from the foe with safe ground under the way: room to eat. */
    backOffSpot: (fx, fz) => bot.backOffSpot(fx, fz),
    /** A cell that puts the foe's back to the void on my line. */
    edgeSpot: (foe) => bot.edgeSpot(foe, AUTOPILOT_MELEE_REACH),
    /** At home on wide ground with them on a bridge: wait, do not walk out. */
    holdGroundAgainst: (foe, dist) => bot.holdGroundAgainst(foe, dist),
    wideAt: (x, y, z) => bot.wideAt(x, y, z),
    /** Void within four blocks on the line their hit would send me along. */
    voidBehind: (fx, fz) => bot.voidBehind(fx, fz),
    /** Void behind them on my line: my hit there is a step toward theirs. */
    voidBehindOf: (foe) => bot.voidBehindOf(foe),
    voidOnLineTo: (fx, fz, y) => bot.voidOnLineTo(fx, fz, y),
    standable: (x, y, z) => bot.standable(x, y, z),
    faceToward: (x, y, z) => bot.faceToward(x, y, z),
    /** Throw at a foe, given the distance my brain measured (the flat one, not the 3D the shared skill uses). */
    throwAtFoe: (target, dist) => bot.throwAtFoe(target, dist),

    // -- the base's own geometry, for the Bed Wars plan --------------------------------------------------------------

    /** The teams with a base, in the round's own order. */
    baseTeams: () => (bot.bedwarsState?.teams ?? [])
      .filter((t) => bot.bedwarsArena?.bases?.some((b) => b.team === t.id)).map((t) => t.id),
    baseSpawn: (team) => {
      const b = bot.bedwarsArena?.bases?.find((x) => x.team === team);
      return b?.spawn ? { x: b.spawn.x, y: b.spawn.y, z: b.spawn.z } : null;
    },
    baseFacing: (team) => {
      const b = bot.bedwarsArena?.bases?.find((x) => x.team === team);
      return { x: b?.facing?.x ?? 0, z: b?.facing?.z ?? 0 };
    },
    /** Where my team's shopkeepers stand: { shop, upgrades }, each { x, y, z }. Buying works within 6 blocks of one. */
    baseKeepers: (team) => {
      const b = bot.bedwarsArena?.bases?.find((x) => x.team === team);
      return b ? { shop: { ...b.shop }, upgrades: { ...b.upgrades } } : null;
    },
    baseBedFoot: (team) => {
      const b = bot.bedwarsArena?.bases?.find((x) => x.team === team);
      return b?.bed?.foot ? [...b.bed.foot] : null;
    },
    /**
     * The middle island: { x, y, z, r }, where y is the height a player stands at on it. The layouts always put the
     * middle at the world origin; the host publishes its height and radius in the plan (bedwarsArena.midY/midRadius).
     */
    arenaMiddle: () => {
      const a = bot.bedwarsArena;
      if (!a) return null;
      const top = Number.isFinite(a.midY) ? a.midY : 30;
      return { x: 0.5, y: top + 1, z: 0.5, r: Number.isFinite(a.midRadius) ? a.midRadius : 10, top };
    },
    /** The islands of the round's layout: { x, y, z, r, role } (generator islands and stepping stones). */
    arenaIslands: () => (bot.bedwarsArena?.islands ?? []).map((i) => ({ ...i })),
    /** Place a named block (a shop key such as 'end_stone'), not whatever placeable is first in the pack. */
    placeOf: (at, block) => {
      const p = xyz(at);
      return bot.placeBlockAt(p.x, p.y, p.z, block);
    },
    /** My teammates in the game and not respawning, where they stand (Bed Wars): { id, name, x, y, z }. */
    teammates: () => {
      const team = bot.me?.()?.team;
      if (!team) return [];
      const live = new Set((bot.bedwarsState?.players ?? []).filter((p) => p.team === team && p.alive && !p.dead && p.id !== bot.clientId).map((p) => p.id));
      return [...bot.peers.values()].filter((p) => live.has(p.id)).map((p) => ({ id: p.id, name: p.name, x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0 }));
    },
    /** A team upgrade's level (protection, ...), 0 when it has none. */
    teamUpgrade: (team, key) => bot.bedwarsState?.teams?.find((t) => t.id === team)?.upgrades?.[key] ?? 0,

    // -- what the fight remembers from decision to decision -----------------------------------------------------------

    flag: (name) => bot[name],
    setFlag: (name, value) => { bot[name] = value; },

    /**
     * Walk to a generator and take it -- but a collection counts (the collect packet) only when the walk says it
     * arrived, which is what the old brain recorded. The shared collect sends the packet whether or not it got there.
     */
    async collectIfReached(id, at, { bridge = false, stopWithin = 0.6, summary = null } = {}) {
      say(summary);
      const p = xyz(at);
      const r = await bot.moveStepToward(p.x, p.y, p.z, { avoidVoid: true, bridge, stopWithin, durationMs: bot.profile.brainMoveDurationMs });
      if (r?.reached) bot.sendPacket({ t: 'game', data: { type: 'collect', gen: id } });
      return r;
    },
  };
}
