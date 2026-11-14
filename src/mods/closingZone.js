// The closing zone: how a SkyWars or Bed Wars match under a time limit makes its last players meet, instead of running
// out the clock apart. Over the last stretch of the time limit a border closes in on the middle of the map and the void
// rises to just under the tops of the middle's islands: a player outside the border, or down in the rising void
// (hiding under an island, on blocks it placed there), is "in the void" and soon out. Battle-royale games close a
// zone this way; Hypixel's Bed Wars forces the end with Bed Destruction and Sudden Death.
//
// The void also takes a player hiding under an island: standing on blocks it placed there, with the map's island over
// its head (what both hiders of the five-bots series did). The map's islands narrow downward, so none of their own
// ground is under another of their blocks; a lower island, a building's floor, the ground under a tree are the map's.
//
// Plants are not islands: a tree's leaves over a bridge into the middle are no roof to hide under.
//
// Pure: the host's rules ask where the zone is and whom it has taken, from the positions the host sees, so a player's
// own browser or bot cannot decline it. Every player is told the zone in the match state.

import { BLOCKS } from '../blocks.js';

/** Trees, mushrooms, flowers, vines, roots, dripstone: the map's growth, which is no island over anyone's head. */
const GROWTH = /LEAVES|_LOG$|_WOOD$|_STEM$|MUSHROOM|SAPLING|POPPY|DANDELION|SHORT_GRASS|TALL_GRASS|FERN|DEAD_BUSH|CACTUS|VINE|ROOTS|DRIPSTONE|ICICLE|AZALEA|LILY|TULIP|ORCHID|ALLIUM|BLUET|DAISY|CORNFLOWER|LILAC|PEONY|ROSE_BUSH|SUNFLOWER/;
export const GROWTH_IDS = new Set(Object.entries(BLOCKS).filter(([name]) => GROWTH.test(name)).map(([, id]) => id));

/** The schedule, as fractions of the time limit, and how long a player may stay in the void before it takes them. */
export const CLOSING = Object.freeze({
  /** The border starts to close (60% of the time limit: 4:48 of 8:00, 6:00 of 10:00). */
  start: 0.6,
  /** Fully closed (90%): the last tenth is fought on the middle. */
  closed: 0.9,
  /** Seconds in the void, all told, before it takes a player (the vanilla void, at 4 a second, kills in 5). */
  exposure: 10,
  /** Back in the zone, the count runs down at half the speed it ran up. */
  recovery: 0.5,
  /** The closed border's radius, at the least. */
  minRadius: 9,
  /** The closed border holds at least this many columns of island. */
  minColumns: 60,
  /** The void stops this far under the closed zone's island tops (its lowest tenth): one block, so a bridge hung below the
   * middle's edge is no place to wait the game out (Bed Wars arena game 4: a squad stood two below and drew). */
  floorBelowTops: 1,
});

/**
 * A map's zone, from its island columns: `columns` is [x, z, topY] for every column with a block (the top block's y).
 * It starts beyond the farthest island with the void at `voidY`, and closes on a circle round `centre` holding at least
 * CLOSING.minColumns columns, the void rising to just under the tops there. `cells` (the map's [key, id] entries) lets
 * the zone tell who is hiding under an island.
 * @returns {{ x:number, z:number, startRadius:number, endRadius:number, startFloor:number, endFloor:number }}
 */
export function planZone(columns, { voidY, centre = { x: 0, z: 0 }, cells = null }) {
  const under = cells ? mapCells(cells) : null;
  const list = [...columns].map(([x, z, top]) => ({ d: Math.hypot(x + 0.5 - centre.x, z + 0.5 - centre.z), top }))
    .sort((a, b) => a.d - b.d);
  if (!list.length) return { x: centre.x, z: centre.z, startRadius: 64, endRadius: CLOSING.minRadius, startFloor: voidY, endFloor: voidY, under };
  const enough = list[Math.min(list.length, CLOSING.minColumns) - 1].d;
  const endRadius = Math.max(CLOSING.minRadius, Math.ceil(enough + 1));
  const tops = list.filter((c) => c.d <= endRadius).map((c) => c.top).sort((a, b) => a - b);
  const lowTop = tops[Math.floor(tops.length * 0.1)] ?? voidY;
  return {
    x: centre.x, z: centre.z,
    startRadius: Math.ceil(list.at(-1).d + 4), endRadius,
    startFloor: voidY, endFloor: Math.max(voidY, lowTop - CLOSING.floorBelowTops), under,
  };
}

/** The map's own blocks by column ("x,z" -> their ys, sorted), from its cells ([key "x,y,z", block id]), growth aside. */
function mapCells(cells) {
  const out = new Map();
  for (const [key, id] of cells) {
    if (GROWTH_IDS.has(id)) continue;
    const [x, y, z] = String(key).split(',').map(Number);
    const k = `${x},${z}`;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(y);
  }
  for (const ys of out.values()) ys.sort((a, b) => a - b);
  return out;
}

/** Hiding under an island: not standing on the map's own ground, with the map's island over the head (2+ up). */
export function underIsland(plan, pos) {
  const ys = plan?.under?.get(`${Math.floor(pos.x)},${Math.floor(pos.z)}`);
  if (!ys) return false;
  const feet = Math.floor(pos.y + 1e-3);
  return !ys.includes(feet - 1) && ys.some((y) => y >= feet + 2);
}

/** The island columns of a map's blocks (`Map<"x,y,z", id>`), below `maxY` (a waiting room or cages above aside). */
export function islandColumns(blocks, { maxY = Infinity, skip = () => false } = {}) {
  const tops = new Map();
  for (const [key, id] of blocks) {
    if (skip(id)) continue;
    const [x, y, z] = key.split(',').map(Number);
    if (y >= maxY) continue;
    const k = `${x},${z}`, was = tops.get(k);
    if (was === undefined || y > was[2]) tops.set(k, [x, z, y]);
  }
  return tops.values();
}

/** When it closes, for a time limit in seconds. */
export const zoneSchedule = (timeLimit) => ({ startsAt: timeLimit * CLOSING.start, closedAt: timeLimit * CLOSING.closed });

/**
 * The zone `elapsed` seconds into play: null before it starts closing; then its centre, radius and the void's level,
 * eased from where they start to where they end.
 */
export function zoneAt(plan, timeLimit, elapsed) {
  if (!plan || !(timeLimit > 0)) return null;
  const { startsAt, closedAt } = zoneSchedule(timeLimit);
  if (elapsed < startsAt) return null;
  const k = Math.min(1, (elapsed - startsAt) / Math.max(1, closedAt - startsAt));
  const lerp = (a, b) => a + (b - a) * k;
  return { plan, x: plan.x, z: plan.z, radius: +lerp(plan.startRadius, plan.endRadius).toFixed(2), floor: +lerp(plan.startFloor, plan.endFloor).toFixed(2), progress: +k.toFixed(3), closedAt };
}

/**
 * Whether a player at `pos` (its feet) is in the void: outside the border, below the void's level, or hiding under an
 * island (the zone's plan knows the map's blocks; a zone as published to players does not, and judges the first two).
 */
export const outsideZone = (zone, pos) => Boolean(zone && pos
  && (Math.hypot(pos.x - zone.x, pos.z - zone.z) > zone.radius || pos.y < zone.floor || underIsland(zone.plan, pos)));

/** The zone as every player is told it: where and how far closed, without the map's blocks. */
export const publishedZone = (zone) => (zone ? { x: zone.x, z: zone.z, radius: zone.radius, floor: zone.floor, progress: zone.progress, closedAt: zone.closedAt } : null);

/** How long each player has been in the void, all told; whom it has taken. */
export class ZoneWatch {
  constructor() { this.exposure = new Map(); }
  reset() { this.exposure.clear(); }
  of(id) { return this.exposure.get(id) ?? 0; }
  /**
   * One step: `players` is [id, pos] for everyone still in the game (pos null when unknown: not judged).
   * @returns {string[]} the ids the void has taken this step
   */
  update(dt, zone, players) {
    const taken = [];
    for (const [id, pos] of players) {
      if (!pos) continue;
      let e = this.of(id);
      e = outsideZone(zone, pos) ? e + dt : Math.max(0, e - dt * CLOSING.recovery);
      this.exposure.set(id, e);
      if (e >= CLOSING.exposure) { taken.push(id); this.exposure.delete(id); }
    }
    return taken;
  }
}
