// houseBotDs's skills: the house bot's (agentArena/skills/skills.mjs) unchanged, and the ones its own brains needed --
// its gear (the weapon that does the most damage a second, armour on), its eating (a golden apple before the blows, an
// ordinary meal when the bar is not full), its ground sense (the inside of an island, a safer step, a place to give
// ground, the line to a foe), its throw with a measured range, the round clock it keeps itself, its memory of the
// fight so far, and the base's own geometry for the Bed Wars plan. A skill answers a question the general view does not
// ask (what is my health, where is my forge, which way does my bed face); the playbooks ask them by name.
import { createSkills } from '../skills/skills.mjs';
import { terrainPath, crossingCost, routeViaPlaces } from './navigation.mjs';
import { AUTOPILOT_MELEE_REACH, meleeReachDistance } from '../../../../../../packages/blockyland-mcp/guestPeer.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const xyz = (at) => (Array.isArray(at) ? { x: at[0], y: at[1], z: at[2] } : at);

export function createBotSkills(bot) {
  const house = createSkills(bot);
  const say = (summary) => { if (summary) bot.lastActionSummary = summary; };

  return {
    ...house,

    armorPoints: () => bot.armorPoints(),
    strikeNearby() {
      const foe = bot.findAliveEnemies().find((q) => meleeReachDistance(bot.position, q) <= AUTOPILOT_MELEE_REACH);
      if (foe) return bot.meleeHit(foe);
      return false;
    },
    chestInReach(chest) {
      const [x, y, z] = chest.at, p = bot.position;
      return Math.hypot(Math.max(0, Math.abs(p.x - x - 0.5) - 0.5), Math.max(0, Math.abs(p.y + 1.62 - y - 0.5) - 0.5), Math.max(0, Math.abs(p.z - z - 0.5) - 0.5)) <= 4.4;
    },
    travelCost: (at) => crossingCost(bot, bot.position, xyz(at)),
    drops: () => [...(bot.sharedDrops?.values() ?? [])].filter((d) => d.item).map((d) => ({ ...d })),
    async escapeEnclosure(at) {
      const p = bot.position, x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z);
      const faces = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      if (faces.some(([dx, dz]) => bot.standable(x + dx + 0.5, y, z + dz + 0.5))) return false;
      if (faces.filter(([dx, dz]) => bot.isSolid(x + dx, y, z + dz) || bot.isSolid(x + dx, y + 1, z + dz)).length < 3) return false;
      const goal = xyz(at ?? [p.x, p.y, p.z]);
      faces.sort(([ax, az], [bx, bz]) => Math.hypot(x + ax * 3 - goal.x, z + az * 3 - goal.z) - Math.hypot(x + bx * 3 - goal.x, z + bz * 3 - goal.z));
      const api = bot.bot;
      for (const [dx, dz] of faces) for (const dy of [1, 0]) {
        if (!bot.isSolid(x + dx, y + dy, z + dz)) continue;
        const block = api.blockAt({ x: x + dx, y: y + dy, z: z + dz });
        if (/chest|barrel|bed|enchanting_table/.test(block?.name ?? '')) continue;
        if (!api.canDigBlock(block) || api.digTime(block) > 1800) continue;
        say('digging a doorway out of the enclosure');
        await api.dig(block);
        bot.solPath = null;
        return true;
      }
      return false;
    },
    async navigate(at, { bridge = true, stopWithin = 2, places = [], summary = null } = {}) {
      say(summary);
      const goal = xyz(at), p = bot.position;
      const finalD = Math.hypot(goal.x - p.x, goal.z - p.z);
      if (finalD <= stopWithin && Math.abs(goal.y - p.y) <= 2) return { ok: true, reached: true };
      if (goal.y < p.y - 2.5 && finalD < 9 && !bot.knockbackActive) {
        if (await bot.climbDown(goal.x, goal.z, { minY: goal.y - 1 })) { bot.solPath = null; return { ok: true, mode: 'descent' }; }
      }
      const waypoint = finalD > 10 && bridge ? routeViaPlaces(bot, goal, places) : goal;
      const goalKey = `${waypoint.x},${waypoint.y},${waypoint.z}:${bridge}`;
      let cache = bot.solPath;
      if (!cache || cache.key !== goalKey || Date.now() - cache.at > 3000 || !cache.path.length
        || Math.hypot(cache.path[0].x - p.x, cache.path[0].z - p.z) > 5) {
        cache = bot.solPath = { key: goalKey, at: Date.now(), path: terrainPath(bot, waypoint, { bridge, radius: waypoint === goal ? stopWithin : 1.2 }) };
      }
      while (cache.path.length && Math.hypot(cache.path[0].x - p.x, cache.path[0].z - p.z) < 0.45 && Math.abs(cache.path[0].y - p.y) < 0.7) cache.path.shift();
      const next = cache.path[0];
      if (!next) {
        bot.solPath = null;
        if (goal.y < p.y - 2 && finalD < 7 && await bot.climbDown(goal.x, goal.z)) return { ok: true };
        return bot.moveStepToward(waypoint.x, waypoint.y, waypoint.z, { avoidVoid: true, bridge, stopWithin, durationMs: bot.profile.brainMoveDurationMs });
      }
      if (next.mode === 'pillar') {
        if (bot.skills.pillar && !bot.knockbackActive && bot.groundAt(p.x, p.y, p.z)
          && !bot.isSolid(Math.floor(p.x), Math.floor(p.y) + 2, Math.floor(p.z))) {
          const r = bot.placeBlockAt(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
          if (r.ok) {
            bot.position = { ...p, y: Math.floor(p.y) + 1 };
            bot.broadcastState();
            await sleep(bot.profile.bridgePlaceDelayMs);
            bot.solPath = null;
            return r;
          }
        }
        bot.solPath = null;
        return { ok: false };
      }
      let dest = next;
      const straightX = Math.abs(next.x - p.x) > Math.abs(next.z - p.z);
      for (let i = 1; i < Math.min(5, cache.path.length); i++) {
        const q = cache.path[i];
        if (q.mode !== next.mode || q.y !== next.y || (straightX ? q.z !== next.z : q.x !== next.x) || q.mode === 'pillar') break;
        dest = q;
      }
      if (next.y < p.y - 1.2 && Math.hypot(next.x - p.x, next.z - p.z) < 3) {
        bot.solPath = null;
        if (await bot.climbDown(next.x, next.z)) return { ok: true, mode: 'descent' };
      }
      // The generic edge buffer can clamp at 0.25 before a one-block rise, never reaching the riser.
      // This is an ordinary step between two verified adjacent footholds; the walk still performs its collision/step-up.
      const risingStep = next.mode === 'walk' && next.y === Math.floor(p.y) + 1
        && Math.hypot(next.x - p.x, next.z - p.z) < 1.65
        && bot.groundAt(p.x, p.y, p.z) && bot.standable(next.x, next.y, next.z);
      if (risingStep) dest = next; // a short step stays below the walker's sprint threshold
      return bot.moveStepToward(dest.x, dest.y, dest.z, {
        avoidVoid: !risingStep, bridge: next.mode === 'bridge', stopWithin: 0.18, durationMs: bot.profile.brainMoveDurationMs,
      });
    },
    async lootObjective(chest, places = []) {
      const [x, y, z] = chest.at, p = bot.position;
      const eyeDistance = Math.hypot(Math.max(0, Math.abs(p.x - x - 0.5) - 0.5), Math.max(0, Math.abs(p.y + 1.62 - y - 0.5) - 0.5), Math.max(0, Math.abs(p.z - z - 0.5) - 0.5));
      if (eyeDistance <= 4.4) {
        const r = await bot.lootChest({ position: chest.at, bridge: false, duration_ms: 0 });
        if (r.ok) { bot.solPath = null; bot.solLootProgress = null; }
        return r;
      }
      const k = chest.id ?? chest.at.join(',');
      let st = bot.solLootProgress;
      if (!st || st.key !== k || Math.hypot(st.x - p.x, st.z - p.z) > 1 || Math.abs(st.y - p.y) > 0.8) {
        st = bot.solLootProgress = { key: k, at: Date.now(), x: p.x, y: p.y, z: p.z };
      } else if (Date.now() - st.at > 6500) {
        (bot.solSkipped ??= new Map()).set(k, Date.now() + 18000);
        bot.solLootProgress = null; bot.solPath = null;
        await bot.unstick();
        return { ok: false, stalled: true };
      }
      return this.navigate([x + 0.5, y, z + 0.5], { places, stopWithin: 2, summary: `routing to ${chest.ring ?? 'island'} chest [${x},${y},${z}]` });
    },
    skipped: (chest) => (bot.solSkipped?.get(chest.id ?? chest.at.join(',')) ?? 0) > Date.now(),
    async bridgeCover(enemies) {
      if (!bot.skills.bridgeDefence || bot.knockbackActive) return false;
      const p = bot.position;
      if (bot.islandSpot(p.x, p.y, p.z)) return false;
      const threats = enemies.filter((e) => Math.hypot(e.x - p.x, e.z - p.z) < 11 && Math.abs(e.y - p.y) < 3);
      if (!threats.length || !bot.groundAt(p.x, p.y, p.z)) return false;
      if (bot.skills.throwables && threats.some((e) => bot.throwAtFoe(e, Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z)))) {
        bot.equipBattleGear(); await sleep(bot.profile.stepDelayMs); return true;
      }
      const safety = (x, z) => Math.min(...threats.map((e) => Math.hypot(x - e.x, z - e.z)));
      const initial = safety(p.x, p.z), options = [];
      for (const r of [3, 5, 8]) for (let i = 0; i < 12; i++) for (const dy of [0, -1, 1, -2, 2]) {
        const x = Math.floor(p.x + Math.cos(i * Math.PI / 6) * r) + 0.5;
        const z = Math.floor(p.z + Math.sin(i * Math.PI / 6) * r) + 0.5, y = Math.floor(p.y) + dy;
        const safe = safety(x, z);
        if (safe < Math.max(5, initial) || !bot.standable(x, y, z) || !bot.islandSpot(x, y, z)) continue;
        options.push({ x, y, z, score: r + Math.abs(dy) + Math.max(0, 10 - safe) });
      }
      for (const goal of options.sort((a, b) => a.score - b.score).slice(0, 6)) {
        const path = terrainPath(bot, goal, { bridge: false, radius: 0.8, limit: 1200 });
        const end = path.at(-1);
        if (!end || Math.hypot(end.x - goal.x, end.z - goal.z) > 1.2
          || path.some((q) => safety(q.x, q.z) < Math.min(4, initial - 0.5))) continue;
        this.strikeNearby();
        await this.navigate([goal.x, goal.y, goal.z], { bridge: false, stopWithin: 0.5, summary: 'leaving the exposed bridge for cover' });
        return true;
      }
      // No walkable escape: build a backstop with legal adjacent placements, one ordinary pause per block.
      const foe = threats.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      const dx = p.x - foe.x, dz = p.z - foe.z;
      const ox = Math.abs(dx) >= Math.abs(dz) ? Math.sign(dx) : 0;
      const oz = ox ? 0 : Math.sign(dz);
      const x = Math.floor(p.x) + ox, z = Math.floor(p.z) + oz, y = Math.floor(p.y);
      this.strikeNearby();
      if (bot.inventory.countPlaceableBlocks() > 1) for (const h of [-1, 0, 1]) {
        if (bot.isSolid(x, y + h, z)) continue;
        const result = bot.placeBlockAt(x, y + h, z);
        if (result.ok) { say('building a backstop on the exposed bridge'); await sleep(bot.profile.bridgePlaceDelayMs); return true; }
        break;
      }
      bot.faceToward(foe.x, foe.y + 1.2, foe.z);
      say('holding the protected bridge approach');
      await sleep(bot.profile.stepDelayMs);
      return true;
    },
    refuge(enemies) {
      const p = bot.position; let best = null, bestScore = -Infinity;
      const safety = (x, z) => Math.min(...enemies.map((e) => Math.hypot(x - e.x, z - e.z)));
      const current = safety(p.x, p.z);
      for (const r of [3, 5, 7]) for (let i = 0; i < 16; i++) {
        const a = i * Math.PI / 8, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        if (!bot.standable(x, p.y, z) || !bot.islandSpot(x, p.y, z)) continue;
        let safe = true;
        for (let t = 0.5; t <= r; t += 0.5) if (!bot.standable(p.x + Math.cos(a) * t, p.y, p.z + Math.sin(a) * t)) { safe = false; break; }
        // The retreat must leave room for the next knockback, whichever attacker supplies it.
        for (const e of enemies) {
          const dx = x - e.x, dz = z - e.z, len = Math.hypot(dx, dz) || 1;
          for (const k of [1, 2, 3]) if (!bot.groundAt(x + dx / len * k, p.y, z + dz / len * k)) safe = false;
        }
        if (!safe) continue;
        const score = safety(x, z) - r * 0.12;
        if (score > bestScore && score > current + 1) { bestScore = score; best = [x, p.y, z]; }
      }
      return best;
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
    baseBedFoot: (team) => {
      const b = bot.bedwarsArena?.bases?.find((x) => x.team === team);
      return b?.bed?.foot ? [...b.bed.foot] : null;
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
