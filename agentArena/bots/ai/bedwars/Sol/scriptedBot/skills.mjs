// houseBotDs's skills: the house bot's (agentArena/skills/skills.mjs) unchanged, and the ones its own brains needed --
// its gear (the weapon that does the most damage a second, armour on), its eating (a golden apple before the blows, an
// ordinary meal when the bar is not full), its ground sense (the inside of an island, a safer step, a place to give
// ground, the line to a foe), its throw with a measured range, the round clock it keeps itself, its memory of the
// fight so far, and the base's own geometry for the Bed Wars plan. A skill answers a question the general view does not
// ask (what is my health, where is my forge, which way does my bed face); the playbooks ask them by name.
import { createSkills } from '../skills/skills.mjs';
import { islandRoute, routeLandmarks, middleLandmark } from './navigation.mjs';
import { bedDigPlan } from '../skills/mining.mjs';
import { squadFocus, combatTeamKey } from './teamRadio.mjs';
import { AUTOPILOT_MELEE_REACH, meleeReachDistance } from '../../../../../../packages/blockyland-mcp/guestPeer.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const xyz = (at) => (Array.isArray(at) ? { x: at[0], y: at[1], z: at[2] } : at);

export function createBotSkills(bot) {
  const house = createSkills(bot);
  const say = (summary) => { if (summary) bot.lastActionSummary = summary; };

  async function travel(at, { bridge = true, stopWithin = 1, summary = null, direct = false } = {}) {
    const target = xyz(at), p = bot.position;
    const key = `${target.x.toFixed(1)},${target.y.toFixed(1)},${target.z.toFixed(1)}`;
    if (bot.solRoute?.key !== key || Math.hypot(p.x - bot.solRoute.last.x, p.z - bot.solRoute.last.z) > 12) {
      bot.solRoute = { key, points: direct ? [target] : islandRoute(p, target, routeLandmarks(bot.bedwarsArena, bot.bedwarsState?.plan)), last: { ...p } };
    }
    const route = bot.solRoute;
    route.last = { ...p };
    while (route.points.length > 1 && Math.hypot(route.points[0].x - p.x, route.points[0].z - p.z) < 2
      && Math.abs(route.points[0].y - p.y) < 1.5) route.points.shift();
    let next = route.points[0] ?? target;
    const dist = Math.hypot(next.x - p.x, next.z - p.z);
    // A bed roof or an elevated bridge may be far from a lower goal. Get down wherever there is a safe landing,
    // before trying to span that whole distance at the wrong height and spending the last blocks.
    if (next.y < p.y - 1.5) {
      if (await bot.climbDown(next.x, next.z)) return { ok: true, reached: false };
    }
    // If combat left us underneath a high island, leave its roof before trying to ascend.
    if (next.y > p.y + 1.5) {
      const roof = [2, 3, 4, 5, 6, 7, 8].some((dy) => bot.isSolid(Math.floor(p.x), Math.floor(p.y) + dy, Math.floor(p.z)));
      const roofRadius = next.r || 10;
      if (roof && dist < roofRadius + 1) {
        let dx = p.x - next.x, dz = p.z - next.z;
        if (Math.hypot(dx, dz) < 0.1) { dx = 1; dz = 0; }
        const len = Math.hypot(dx, dz);
        next = { x: next.x + dx / len * (roofRadius + 5), y: p.y, z: next.z + dz / len * (roofRadius + 5) };
      }
    }
    say(summary);
    // Players push one another. Queue on a narrow bridge rather than crowding a teammate off it.
    const ownTeam = bot.me?.()?.team;
    const exposed = (bot.bedwarsState?.players ?? []).find((q) => q.id === bot.clientId)?.inVoid ?? 0;
    if (ownTeam && exposed <= 0 && bot.wideAt?.(p.x, p.y, p.z) === false) {
      const dx = next.x - p.x, dz = next.z - p.z, len = Math.hypot(dx, dz) || 1;
      const allies = new Set((bot.bedwarsState?.players ?? []).filter((q) => q.team === ownTeam && q.alive && !q.dead).map((q) => q.id));
      const blockedByMate = [...bot.peers.values()].some((q) => {
        if (!allies.has(q.id) || q.id === bot.clientId || Math.abs((q.y ?? p.y) - p.y) > 1.5) return false;
        const sx = q.x - p.x, sz = q.z - p.z, ahead = (sx * dx + sz * dz) / len;
        const sideways = Math.abs(sx * dz - sz * dx) / len;
        return Math.hypot(sx, sz) < 1.8 && sideways < 0.75
          && (ahead > 0.2 || Math.abs(ahead) <= 0.2 && String(q.name ?? q.id).localeCompare(String(bot.name ?? bot.clientId)) < 0);
      });
      if (blockedByMate) { await sleep(bot.profile.brainMoveDurationMs); return { ok: true, reached: false, mode: 'giving teammate bridge space' }; }
    }
    const needsBridge = bridge && (next.y > p.y + 0.8 || bot.voidOnLineTo(next.x, next.z, p.y));
    const r = await bot.moveStepToward(next.x, next.y, next.z, {
      avoidVoid: true, bridge: needsBridge && (bot.inventory.countPlaceableBlocks() > 0 || bot.gamemode === 'creative'),
      terrainTarget: true, stopWithin: route.points.length > 1 ? 1 : stopWithin,
      durationMs: bot.profile.brainMoveDurationMs,
    });
    return { ...r, reached: Boolean(r?.reached && route.points.length <= 1 && Math.abs(bot.position.y - target.y) < 1.8) };
  }

  return {
    ...house,
    strike: (target) => meleeReachDistance(bot.position, target) <= AUTOPILOT_MELEE_REACH && bot.meleeHit(target),
    travel,
    middle: () => middleLandmark(bot.bedwarsArena, bot.bedwarsState?.plan),
    timeLimit: () => bot.bedwarsState?.timeLimit ?? 600,
    focusEnemy: (foes, middle, group = 0) => squadFocus(combatTeamKey(bot), foes, middle, Date.now(), 4.75, group),
    bedDigInfo: (at) => bedDigPlan(bot, at, { reachOnly: false }),
    async attackBed(at, { summary = null } = {}) {
      const until = Date.now() + bot.profile.brainMoveDurationMs;
      let result;
      do {
        const z = house.zone();
        if (z && (house.inVoid() > 0 || Math.hypot(bot.position.x - z.x, bot.position.z - z.z) > z.radius - 7)) return { ok: false, reason: 'zone retreat' };
        result = house.breakBed(at, { summary });
        if (!result?.digging) return result;
        await sleep(bot.profile.stepDelayMs);
      } while (Date.now() < until && !bot.isDead);
      return result;
    },

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
      const r = bot.gameMode === 'bedwars'
        ? await travel(p, { bridge, stopWithin, summary })
        : await bot.moveStepToward(p.x, p.y, p.z, { avoidVoid: true, bridge, stopWithin, durationMs: bot.profile.brainMoveDurationMs });
      if (r?.reached) bot.sendPacket({ t: 'game', data: { type: 'collect', gen: id } });
      return r;
    },
  };
}
