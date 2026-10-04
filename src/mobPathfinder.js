// Hazard-aware A* pathfinding for mobs.
//
// Written rather than adopted: mineflayer-pathfinder is a mineflayer plugin bound to the bot's
// chunk and event model, so it cannot run inside this render loop. The design here follows the
// same ideas -- movement types, a jump/fall cost model, a node limit -- against this engine's
// own getVoxel/isBlockSolid interface.
//
// The point of it is harm avoidance. Mobs used to steer straight at a target with no notion of
// terrain, so they walked into lava and fire. Costs come from ./hazards.js, so a route through
// lava is priced as dangerous and the search prefers the way around it. A mob that is immune
// (a blaze, a strider) simply does not pay that cost.
import { cellDanger, isLethalStep } from './hazards.js';

/** Tuning for the search. Exported so tests can tighten it. */
export const PATH_DEFAULTS = {
  maxNodes: 4000,      // hard cap on expanded nodes, so one mob cannot stall the frame
  maxFall: 3,          // how far a mob will willingly drop
  maxJump: 2,          // horizontal gap a mob can clear
  maxRise: 1,          // step-up height without a jump
  jumpCost: 1.2,
  fallCostPerBlock: 0.6,
  waterPenalty: 2,
  dangerWeight: 6,     // multiplier applied to hazard cost; higher = more timid
  goalRadius: 1,       // how close (in blocks, XZ) counts as arrived
};

/**
 * A binary min-heap keyed by f-score. Kept local so the pathfinder has no dependencies.
 */
class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(node, score) {
    const items = this.items;
    items.push({ node, score });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].score <= items[i].score) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop() {
    const items = this.items;
    if (!items.length) return null;
    const top = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < items.length && items[l].score < items[smallest].score) smallest = l;
        if (r < items.length && items[r].score < items[smallest].score) smallest = r;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top.node;
  }
}

const key = (x, y, z) => `${x},${y},${z}`;

/**
 * Build the movement context the hazard helpers need.
 *
 * @param {object} manager MobManager (provides world, isBlockSolid, getMobDimensions)
 * @param {object|null} mob
 */
export function pathContext(manager, mob = null) {
  const world = manager.world;
  return {
    mob,
    getVoxel: (x, y, z) => world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z)),
    isSolid: (x, y, z) => manager.isBlockSolid(Math.floor(x), Math.floor(y), Math.floor(z), mob?.type ?? null),
    aquaticFriendly: Boolean(mob?.isAquatic),
  };
}

/**
 * Can a mob with this body size occupy this cell? Checks the feet space and the head space.
 *
 * @returns {boolean}
 */
export function canOccupy(ctx, x, y, z, height = 2) {
  for (let dy = 0; dy < height; dy++) {
    if (ctx.isSolid(x, y + dy, z)) return false;
  }
  return true;
}

/** Is there a floor to stand on at this cell? */
export function hasFloor(ctx, x, y, z) {
  return ctx.isSolid(x, y - 1, z);
}

/**
 * Find the surface Y for a column, preferring the level the mob is already on.
 *
 * The starting level is tested first, then progressively lower landings. Scanning straight
 * down would skip a walkable level whose floor is hazardous -- the cell above lava has lava
 * beneath it, not a solid block -- and return a cell inside the lava instead.
 *
 * @param {number} fromY the level to prefer
 * @param {number} [depth] how far below to search for a lower landing
 */
/**
 * Is this a level the mob would willingly stand at?
 *
 * A floor test alone is not enough: the cell directly above a lava layer has the solid block
 * beneath the lava under it, so hasFloor accepts the level and a mob gets routed into the
 * lava. Checking the immunity-aware veto keeps this correct for both cases -- a blaze may use
 * the level over lava, a cow may not.
 */
function standableLevel(ctx, x, y, z) {
  if (!canOccupy(ctx, x, y, z, 2)) return false;
  if (isLethalStep(ctx, x, y, z)) return false;
  return hasFloor(ctx, x, y, z) || !ctx.isSolid(x, y - 1, z);
}

export function surfaceY(ctx, x, z, fromY, depth = 6) {
  // A mob stands where it stands.
  if (standableLevel(ctx, x, fromY, z)) return fromY;
  for (let y = fromY - 1; y >= fromY - depth; y--) {
    if (standableLevel(ctx, x, y, z)) return y;
  }
  return null;
}

/**
 * Search for a walkable route from `start` to `goal`.
 *
 * @param {object} manager MobManager
 * @param {object|null} mob the mob that will walk it (drives immunities and body size)
 * @param {{x:number,y:number,z:number}} start
 * @param {{x:number,y:number,z:number}} goal
 * @param {object} [options] overrides for PATH_DEFAULTS
 * @returns {{path: Array<{x:number,y:number,z:number}>, cost: number, nodes: number,
 *            danger: number, reached: boolean}} the path EXCLUDES the start cell
 */
export function findPath(manager, mob, start, goal, options = {}) {
  const opt = { ...PATH_DEFAULTS, ...options };
  // Cells the caller knows are unusable, e.g. a waypoint the mob has proved it cannot reach.
  const avoid = options.avoid || null;
  const ctx = pathContext(manager, mob);
  const dims = manager.getMobDimensions?.(mob?.type) || { width: 0.6, height: 1.8 };
  // A mob narrower than a block still needs one clear block; taller mobs need their head clear.
  const bodyHeight = dims.height > 1.05 ? 2 : 1;

  const sx = Math.floor(start.x), sz = Math.floor(start.z);
  const sy = surfaceY(ctx, sx, sz, Math.floor(start.y), 8) ?? Math.floor(start.y);
  const startNode = { x: sx, y: sy, z: sz };

  const gx = Math.floor(goal.x), gz = Math.floor(goal.z);
  const gy = Math.floor(goal.y);

  const heuristic = (x, y, z) => {
    const dx = x - gx, dz = z - gz;
    const horizontal = Math.sqrt(dx * dx + dz * dz);
    const vertical = Math.abs(y - gy);
    return horizontal + vertical * 0.5;
  };

  const goalReached = (x, y, z) => {
    const dx = x - gx, dz = z - gz;
    if (Math.sqrt(dx * dx + dz * dz) > opt.goalRadius) return false;
    // Arriving on the wrong level (on a roof, or in a pit) is not arrival. Only the goal
    // level or the one above it counts, so a route cannot end inside a hazard layer.
    if (y !== gy && y !== gy + 1) return false;
    return hasFloor(ctx, x, y, z) && canOccupy(ctx, x, y, z, bodyHeight);
  };

  const open = new MinHeap();
  const gScore = new Map();
  const cameFrom = new Map();
  const startKey = key(startNode.x, startNode.y, startNode.z);
  gScore.set(startKey, 0);
  open.push(startNode, heuristic(startNode.x, startNode.y, startNode.z));

  let nodes = 0;
  let best = null;
  let bestH = Infinity;
  let bestDanger = 0;

  const moves = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];

  while (open.size && nodes < opt.maxNodes) {
    const current = open.pop();
    nodes++;

    const ck = key(current.x, current.y, current.z);
    const currentG = gScore.get(ck);
    if (currentG === undefined) continue;

    // Track the closest approach so a partially blocked route still yields something useful.
    const h = heuristic(current.x, current.y, current.z);
    if (h < bestH) { bestH = h; best = current; bestDanger = current.danger || 0; }

    if (goalReached(current.x, current.y, current.z)) {
      return buildResult(cameFrom, current, currentG, nodes, current.danger || 0, true);
    }

    for (const [dx, dz] of moves) {
      // Try three vertical offsets: level, step up, and fall.
      const candidates = [];
      candidates.push({ y: current.y, cost: 1, kind: 'walk' });
      candidates.push({ y: current.y + 1, cost: 1 + opt.jumpCost, kind: 'step' });
      for (let fall = 1; fall <= opt.maxFall; fall++) {
        candidates.push({ y: current.y - fall, cost: 1 + fall * opt.fallCostPerBlock, kind: 'fall' });
      }

      for (const cand of candidates) {
        const nx = current.x + dx, nz = current.z + dz, ny = cand.y;

        // The destination must be open, and floored unless we are still falling onto it.
        if (!canOccupy(ctx, nx, ny, nz, bodyHeight)) continue;
        if (avoid && avoid.has(key(nx, ny, nz))) continue;
        if (!hasFloor(ctx, nx, ny, nz)) {
          // If there is no floor, look further down for a landing inside the fall budget.
          let landed = -1;
          for (let drop = 1; drop <= opt.maxFall; drop++) {
            if (hasFloor(ctx, nx, ny - drop, nz) && canOccupy(ctx, nx, ny - drop, nz, bodyHeight)) { landed = ny - drop; break; }
            if (!canOccupy(ctx, nx, ny - drop, nz, bodyHeight)) break;
          }
          if (landed < 0) continue;
          cand.y = landed;
          cand.cost = 1 + (current.y - landed) * opt.fallCostPerBlock;
        }

        // Head room above the step-up.
        if (cand.y > current.y && !canOccupy(ctx, current.x, current.y + bodyHeight, current.z, 1)) continue;

        // Hard veto: never route a mob through something that will hurt it right now.
        if (isLethalStep(ctx, nx, cand.y, nz)) {
          // A fire-immune mob already has these filtered out by hazardKind; anything reaching
          // here would take damage, so the route is rejected outright.
          continue;
        }

        // A step-up or a jump passes over the cell in between, so price that too.
        const transitDanger = cand.y > current.y
          ? cellDanger(ctx, nx, current.y, nz)
          : 0;
        const danger = cellDanger(ctx, nx, cand.y, nz) + transitDanger;
        const stepCost = cand.cost + danger * opt.dangerWeight;

        const nk = key(nx, cand.y, nz);
        const tentative = currentG + stepCost;
        const known = gScore.get(nk);
        if (known !== undefined && known <= tentative) continue;

        gScore.set(nk, tentative);
        cameFrom.set(nk, { x: current.x, y: current.y, z: current.z });
        const node = { x: nx, y: cand.y, z: nz, danger };
        open.push(node, tentative + heuristic(nx, cand.y, nz));
      }

      // Jumping a gap: allow a two-block horizontal hop when the far side is safe.
      if (opt.maxJump >= 2) {
        const jx = current.x + dx * 2, jz = current.z + dz * 2;
        for (const jy of [current.y, current.y + 1]) {
          if (!canOccupy(ctx, jx, jy, jz, bodyHeight)) continue;
          if (avoid && avoid.has(key(jx, jy, jz))) continue;
          if (!hasFloor(ctx, jx, jy, jz)) continue;
          if (isLethalStep(ctx, jx, jy, jz)) continue;
          // The gap itself must be clear of solids at body height, or it is a wall not a gap.
          const mid = { x: current.x + dx, z: current.z + dz };
          if (!canOccupy(ctx, mid.x, current.y, mid.z, bodyHeight)) continue;
          const jdanger = cellDanger(ctx, jx, jy, jz);
          const cost = 1 + opt.jumpCost * 2 + (current.y === jy ? 0 : opt.jumpCost) + jdanger * opt.dangerWeight;
          const jk = key(jx, jy, jz);
          const tentative = currentG + cost;
          const known = gScore.get(jk);
          if (known !== undefined && known <= tentative) continue;
          gScore.set(jk, tentative);
          cameFrom.set(jk, { x: current.x, y: current.y, z: current.z });
          open.push({ x: jx, y: jy, z: jz, danger: jdanger }, tentative + heuristic(jx, jy, jz));
        }
      }
    }
  }

  // No complete route: hand back the closest approach rather than nothing, so a mob still
  // makes progress toward the player instead of standing still.
  if (best) {
    return buildResult(cameFrom, best, gScore.get(key(best.x, best.y, best.z)) ?? Infinity, nodes, bestDanger, false);
  }
  return { path: [], cost: Infinity, nodes, danger: 0, reached: false };
}

/** Walk the parent chain back to the start and reverse it. */
function buildResult(cameFrom, end, cost, nodes, danger, reached) {
  const path = [];
  let cur = end;
  let guard = 0;
  for (;;) {
    const k = key(cur.x, cur.y, cur.z);
    const prev = cameFrom.get(k);
    if (!prev) break;
    path.push({ x: cur.x, y: cur.y, z: cur.z });
    cur = prev;
    if (++guard > 4096) break;
  }
  path.reverse();
  return { path, cost, nodes, danger, reached };
}

/**
 * Is the straight line to the target free of harm? Used to decide whether a mob can simply
 * steer at its target instead of paying for a full search.
 */
export function directRouteIsSafe(manager, mob, from, to) {
  const ctx = pathContext(manager, mob);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.001) return true;
  const steps = Math.ceil(dist);
  const ux = dx / dist, uz = dz / dist;
  let lastSafeY = Math.floor(from.y);
  for (let i = 1; i <= steps; i++) {
    const x = Math.floor(from.x + ux * i);
    const z = Math.floor(from.z + uz * i);
    // Start from the mob's own level. Using lastSafeY + 1 scanned downward from one block
    // ABOVE it, which over a lava lake finds the level above the lava and makes the line
    // look clear.
    const y = surfaceY(ctx, x, z, lastSafeY, 4);
    if (y === null) return false;
    if (isLethalStep(ctx, x, y, z)) return false;
    lastSafeY = y;
  }
  return true;
}

export { key as pathKey };
