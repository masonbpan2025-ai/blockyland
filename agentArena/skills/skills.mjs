// The house bot's skills, by name: what a bot can do in any game, whichever game it is playing. A playbook (or a model
// planning a game it has not seen) calls these and reads the view (view.mjs); it never touches a game's own state or
// the session underneath.
//
// Each skill is the bot's own code (agentArena/scriptedBot/base.mjs, packages/blockyland-mcp/guestPeer.js), called
// with the arguments the original brains used, so a playbook that calls them plays exactly as the original did. Every
// action skill takes one brain action's time at most (the difficulty's brainMoveDurationMs) and returns what it did.
//
//   Movement:  goTo, climbDown, unstick, pearlClutch, follow, flee, hide, guard, lookAround
//   Combat:    fight, shoot, throwAt
//   Items:     loot, collect, buy, equipBest, heal, chooseTeam
//   Building:  place, breakBlock
//   Senses:    enemies, blockAt, isAir, groundAt, voidCellsToward, zone
//   The zone:  keepInZone (the closing zone of a timed SkyWars or Bed Wars match: src/mods/closingZone.js)
import { BLOCKS, BED_BLOCK_IDS } from '../../packages/blockyland-mcp/guestPeer.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const xyz = (at) => (Array.isArray(at) ? { x: at[0], y: at[1], z: at[2] } : at);

/** The skills over one house-bot session. */
export function createSkills(bot) {
  const action = () => bot.profile.brainMoveDurationMs;
  const say = (summary) => { if (summary) bot.lastActionSummary = summary; };

  const skills = {
    // --- movement -----------------------------------------------------------------------------------------------
    /**
     * Walk toward `at` for one action, never off a ledge into the void; with `bridge`, placing blocks over gaps.
     * Stops `stopWithin` blocks short.
     */
    async goTo(at, { bridge = false, stopWithin = 1, summary = null } = {}) {
      const p = xyz(at);
      say(summary);
      return bot.moveStepToward(p.x, p.y, p.z, { avoidVoid: true, bridge, stopWithin, durationMs: action() });
    },
    /** Down from a height toward (x, z): the smallest safe drop first, never into the void. */
    climbDown: (x, z) => bot.climbDown(x, z),
    /** Off a ledge or out of a corner: a short walk to open ground. */
    unstick: () => bot.unstick(),
    /** Knocked over the void with an ender pearl: throw it back to land. True when it threw. */
    pearlClutch: () => bot.pearlClutch(),
    /** Keep about `distance` blocks from a player, for one action. */
    async follow(player, { distance = 4, bridge = false } = {}) {
      return skills.goTo([player.x ?? 0, player.y ?? 31, player.z ?? 0], { bridge, stopWithin: distance, summary: `following ${player.name || player.id}` });
    },
    /** Away from a point (a player, a danger), `distance` blocks, on ground that is there. */
    async flee(from, { distance = 6 } = {}) {
      const f = xyz(from), p = bot.position;
      const dx = p.x - f.x, dz = p.z - f.z, len = Math.hypot(dx, dz) || 1;
      const to = { x: p.x + (dx / len) * distance, y: p.y, z: p.z + (dz / len) * distance };
      return skills.goTo([to.x, to.y, to.z], { stopWithin: 0.5, summary: 'getting away' });
    },
    /**
     * Out of sight of `from`: the nearest spot within `radius` (on ground) with a solid block between it and `from`
     * at eye height; there for one action. False when there is none.
     */
    async hide(from, { radius = 8 } = {}) {
      const f = xyz(from), p = bot.position, y = Math.floor(p.y);
      let best = null, bestD = Infinity;
      for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
        const x = Math.floor(p.x) + dx, z = Math.floor(p.z) + dz, d = Math.hypot(dx, dz);
        if (d > radius || d >= bestD || !bot.groundAt(x + 0.5, y, z + 0.5) || bot.isSolid(x, y, z) || bot.isSolid(x, y + 1, z)) continue;
        if (!skills.blocked([x + 0.5, y + 1.6, z + 0.5], [f.x, (f.y ?? y) + 1.6, f.z])) continue;
        best = [x + 0.5, y, z + 0.5]; bestD = d;
      }
      if (!best) return false;
      await skills.goTo(best, { stopWithin: 0.3, summary: 'taking cover' });
      return true;
    },
    /** Stay within `radius` of `at`; back to it when further. */
    async guard(at, { radius = 6 } = {}) {
      const c = xyz(at), p = bot.position;
      if (Math.hypot(p.x - c.x, p.z - c.z) <= radius) { skills.lookAround(); await sleep(action()); return { ok: true, mode: 'guarding' }; }
      return skills.goTo([c.x, c.y, c.z], { stopWithin: radius * 0.5, summary: 'back to guard' });
    },
    /** A turn of the head, doing nothing else (a human's pause). */
    /** Say what I am doing (the status others and the records see). */
    say(summary) { say(summary); },
    lookAround() {
      say('looking around');
      bot.yaw += (Math.random() - 0.5) * 1.2;
      bot.broadcastState();
    },

    // --- combat -------------------------------------------------------------------------------------------------
    /** One action of a fight with `target` (a player): close in, swing at the recharge, heal, keep off the edge. */
    fight(target, { summary = null } = {}) { say(summary); return bot.engageEnemy(target); },
    /** The bow at `target`, at the difficulty's range and aim; true while drawing or when it shot. */
    shoot(target) {
      const d = Math.hypot((target.x ?? 0) - bot.position.x, (target.y ?? 31) - bot.position.y, (target.z ?? 0) - bot.position.z);
      return bot.bowAction(target, d);
    },
    /** A snowball or an egg at `target`, flown for real. */
    throwAt(target) {
      const d = Math.hypot((target.x ?? 0) - bot.position.x, (target.y ?? 31) - bot.position.y, (target.z ?? 0) - bot.position.z);
      return bot.throwAtFoe(target, d);
    },

    // --- items --------------------------------------------------------------------------------------------------
    /** Walk to the chest at `at` (bridging if asked) and take what is in it, at a human's pace. */
    async loot(at, { bridge = false, summary = null } = {}) {
      say(summary);
      return bot.lootChest({ position: [...at], bridge, duration_ms: action() });
    },
    /** Walk onto a generator at `at` and take what it has made. */
    async collect(generatorId, at, { bridge = false, stopWithin = 0.6, summary = null } = {}) {
      await skills.goTo(at, { bridge, stopWithin, summary });
      bot.sendPacket({ t: 'game', data: { type: 'collect', gen: generatorId } });
      return { ok: true };
    },
    /** Buy from the game's shop (Bed Wars' item keys). */
    buy: (item, count = 1) => bot.buyInBedWars(item, count),
    /** Hold the best weapon, wear the best armour. */
    equipBest: () => bot.inventory.equipBest(),
    /** Eat or drink to heal when it is time to (Java's eating rules, the shared guest code). */
    heal: () => bot.consumeHealingItem(),
    /** Join a team in the lobby. */
    chooseTeam(team) { bot.chooseTeam(team); say(`joined ${team} team`); },

    // --- building -----------------------------------------------------------------------------------------------
    place(at) { const p = xyz(at); return bot.placeBlockAt(p.x, p.y, p.z); },
    breakBlock(at) { const p = xyz(at); return bot.breakBlockAt(p.x, p.y, p.z); },
    /**
     * Dig at a bed at `at` (its foot), call after call: through an open face, else first a block that covers it. Digging
     * takes Java's time (the held tool, Efficiency, Haste): each call digs on, one block at a time, and the answer says
     * { digging: true, progress } until the block breaks. Hold a pickaxe for end stone, shears for wool.
     */
    breakBed(at, { summary = null } = {}) {
      const [bx, by, bz] = at;
      say(summary);
      const r = bot.breakBlockAt(bx, by, bz);
      if (r?.ok || r?.digging || !/covered/.test(r?.reason ?? '')) return r;
      // Covered all round: dig one covering block, the nearest in reach (on top first), and try again next step.
      const halves = [[bx, by, bz], ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [bx + dx, by, bz + dz]).filter((c) => BED_BLOCK_IDS.has(bot.getVoxel(...c)))];
      const covers = halves.flatMap(([x, y, z]) => [[x, y + 1, z], [x + 1, y, z], [x - 1, y, z], [x, y, z + 1], [x, y, z - 1]])
        .filter((c) => { const v = bot.getVoxel(...c); return v !== BLOCKS.AIR && !BED_BLOCK_IDS.has(v); })
        .map((c) => ({ c, d: Math.hypot(c[0] + 0.5 - bot.position.x, c[1] + 0.5 - (bot.position.y + 1.62), c[2] + 0.5 - bot.position.z) + (c[1] > by ? -0.5 : 0) }))
        .sort((a, b) => a.d - b.d);
      if (!covers.length) return r;
      // Keep on the block already being dug, if it still covers the bed (starting another starts over).
      const was = bot.digTarget;
      const pick = covers.find((c) => was && c.c.every((v, i) => v === was[i])) ?? covers[0];
      const dug = bot.breakBlockAt(...pick.c);
      return { ...r, digging: !!dug?.digging, progress: dug?.progress, dug: dug?.ok ? pick.c : null };
    },

    // --- senses -------------------------------------------------------------------------------------------------
    /** The players against me in the round, as I have taken them in (a reaction time late): nearest first. */
    enemies: () => bot.findAliveEnemies(),
    /**
     * The closing zone as the host publishes it -- { x, z, radius, floor, progress, closedAt } -- or null before it
     * starts closing; and how many seconds the host has counted me in its void (10 and I am out).
     */
    zone: () => (bot.gameMode === 'bedwars' ? bot.bedwarsState?.zone : bot.skywarsState?.zone) ?? null,
    inVoid: () => ((bot.gameMode === 'bedwars' ? bot.bedwarsState : bot.skywarsState)?.players ?? []).find((p) => p.id === bot.clientId)?.inVoid ?? 0,
    /**
     * When the zone closes in: back toward its middle if I am outside it, near its edge (it keeps closing), below its
     * void line, or being counted in its void (under an island). @returns the walk, or null when I am well inside
     */
    keepInZone({ margin = 4 } = {}) {
      const z = skills.zone();
      if (!z) return null;
      const p = bot.position, d = Math.hypot(p.x - z.x, p.z - z.z);
      if (d <= z.radius - margin && p.y >= z.floor + 1 && skills.inVoid() <= 0) return null;
      return skills.goTo([z.x + 0.5, Math.max(p.y, z.floor + 2), z.z + 0.5], {
        bridge: true, stopWithin: Math.max(2, Math.min(z.radius - margin, z.radius * 0.5)), summary: 'into the closing zone',
      });
    },
    blockAt(at) { const p = xyz(at); return bot.getVoxel(p.x, p.y, p.z); },
    isAir(at) { return skills.blockAt(at) === BLOCKS.AIR; },
    groundAt(at) { const p = xyz(at); return bot.groundAt(p.x, p.y, p.z); },
    /** How many blocks of void lie on the straight way to (x, z): the blocks a bridge there needs. */
    voidCellsToward: (x, z) => bot.voidCellsToward(x, z),
    /** Whether a solid block stands on the straight line from `a` to `b` (both [x, y, z]). */
    blocked(a, b) {
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.25);
      for (let i = 1; i < n; i++) {
        const t = i / n;
        if (bot.isSolid(Math.floor(a[0] + (b[0] - a[0]) * t), Math.floor(a[1] + (b[1] - a[1]) * t), Math.floor(a[2] + (b[2] - a[2]) * t))) return true;
      }
      return false;
    },
  };
  return skills;
}

/** The skills' names, by kind: for a model's prompt, and for tests that every one is there. */
export const SKILL_NAMES = Object.freeze({
  movement: ['goTo', 'climbDown', 'unstick', 'pearlClutch', 'follow', 'flee', 'hide', 'guard', 'lookAround', 'say'],
  combat: ['fight', 'shoot', 'throwAt'],
  items: ['loot', 'collect', 'buy', 'equipBest', 'heal', 'chooseTeam'],
  building: ['place', 'breakBlock', 'breakBed'],
  senses: ['enemies', 'blockAt', 'isAir', 'groundAt', 'voidCellsToward', 'blocked', 'zone', 'inVoid'],
  zone: ['keepInZone'],
});
