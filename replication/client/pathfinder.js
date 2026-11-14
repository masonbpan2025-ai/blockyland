// mineflayer-pathfinder for the Blockyland client: the same interface (goals, Movements, bot.pathfinder.goto/setGoal/
// stop, its events), planning on the bot's own picture of the world as the real plugin does, and moving the player
// with the bot's controls, digs and block placements -- nothing a program could not do itself.
//
// Moves: walk, diagonal walk, step up one block, drop down (up to maxDropDown), dig through (canDig), pillar up by
// jumping and placing a scaffolding block (allow1by1towers), bridge over a gap by placing a block (scaffolding),
// swim. Not supported: parkour jumps across gaps, doors, ladders as moves (a ladder is climbed like water).
import { EventEmitter } from 'node:events';
import { Vec3 } from './vec3.js';

const AIR_LIKE = new Set(['air', 'cave_air', 'void_air']);
const AVOID = new Set(['lava', 'fire', 'soul_fire', 'cactus', 'magma_block', 'sweet_berry_bush', 'wither_rose', 'powder_snow', 'campfire', 'soul_campfire']);
const FALLING = new Set(['sand', 'red_sand', 'gravel', 'suspicious_sand', 'suspicious_gravel']);

// ---------- goals ----------
export class Goal { heuristic() { return 0; } isEnd() { return true; } hasChanged() { return false; } isValid() { return true; } }
export class GoalBlock extends Goal {
  constructor(x, y, z) { super(); this.x = Math.floor(x); this.y = Math.floor(y); this.z = Math.floor(z); }
  heuristic(n) { return Math.hypot(n.x - this.x, n.z - this.z) + Math.abs(n.y - this.y); }
  isEnd(n) { return n.x === this.x && n.y === this.y && n.z === this.z; }
}
export class GoalNear extends Goal {
  constructor(x, y, z, range) { super(); this.x = Math.floor(x); this.y = Math.floor(y); this.z = Math.floor(z); this.rangeSq = range * range; }
  heuristic(n) { return Math.hypot(n.x - this.x, n.z - this.z) + Math.abs(n.y - this.y); }
  isEnd(n) { return (n.x - this.x) ** 2 + (n.y - this.y) ** 2 + (n.z - this.z) ** 2 <= this.rangeSq; }
}
export class GoalXZ extends Goal {
  constructor(x, z) { super(); this.x = Math.floor(x); this.z = Math.floor(z); }
  heuristic(n) { return Math.hypot(n.x - this.x, n.z - this.z); }
  isEnd(n) { return n.x === this.x && n.z === this.z; }
}
export class GoalNearXZ extends Goal {
  constructor(x, z, range) { super(); this.x = Math.floor(x); this.z = Math.floor(z); this.rangeSq = range * range; }
  heuristic(n) { return Math.hypot(n.x - this.x, n.z - this.z); }
  isEnd(n) { return (n.x - this.x) ** 2 + (n.z - this.z) ** 2 <= this.rangeSq; }
}
export class GoalY extends Goal {
  constructor(y) { super(); this.y = Math.floor(y); }
  heuristic(n) { return Math.abs(n.y - this.y); }
  isEnd(n) { return n.y === this.y; }
}
export class GoalGetToBlock extends Goal {
  constructor(x, y, z) { super(); this.x = Math.floor(x); this.y = Math.floor(y); this.z = Math.floor(z); }
  heuristic(n) { return Math.hypot(n.x - this.x, n.z - this.z) + Math.abs(n.y - this.y); }
  isEnd(n) { const dx = Math.abs(n.x - this.x), dy = n.y - this.y, dz = Math.abs(n.z - this.z); return dx + dz === 1 && (dy === 0 || dy === -1) || dx + dz === 0 && (dy === 1 || dy === -2); }
}
export class GoalLookAtBlock extends Goal {
  // Standing where the block is within reach of the eyes AND one of its faces can be seen (the real goal raycasts too).
  constructor(pos, world, options = {}) { super(); this.pos = pos; this.world = world; this.reach = options.reach ?? 4.5; }
  heuristic(n) { return Math.max(0, Math.hypot(n.x + .5 - (this.pos.x + .5), n.y + 1.62 - (this.pos.y + .5), n.z + .5 - (this.pos.z + .5)) - this.reach); }
  isEnd(n) {
    if (Math.hypot(n.x + .5 - (this.pos.x + .5), n.y + 1.62 - (this.pos.y + .5), n.z + .5 - (this.pos.z + .5)) > this.reach) return false;
    if (n.x === this.pos.x && n.z === this.pos.z && n.y <= this.pos.y + 1 && n.y >= this.pos.y - 1) return false;
    return !this.world?.getBlock || seesBlock(this.world, { x: n.x + .5, y: n.y + 1.62, z: n.z + .5 }, this.pos);
  }
}
/** Can an eye at `eye` see a face of the block at `pos` (every block on the line to a face centre is empty)? */
export function seesBlock(world, eye, pos) {
  const faces = [[.5, 1.01, .5], [.5, -.01, .5], [1.01, .5, .5], [-.01, .5, .5], [.5, .5, 1.01], [.5, .5, -.01]];
  for (const [fx, fy, fz] of faces) {
    const tx = pos.x + fx, ty = pos.y + fy, tz = pos.z + fz;
    const d = Math.hypot(tx - eye.x, ty - eye.y, tz - eye.z), steps = Math.ceil(d / .1);
    let clear = true;
    for (let i = 1; i < steps && clear; i++) {
      const x = Math.floor(eye.x + (tx - eye.x) * i / steps), y = Math.floor(eye.y + (ty - eye.y) * i / steps), z = Math.floor(eye.z + (tz - eye.z) * i / steps);
      if (x === pos.x && y === pos.y && z === pos.z) break;
      const b = world.getBlock({ x, y, z });
      if (!b || b.boundingBox === 'block') clear = false;
    }
    if (clear) return true;
  }
  return false;
}
export const GoalBreakBlock = GoalLookAtBlock;
export class GoalPlaceBlock extends GoalLookAtBlock {}
export class GoalFollow extends Goal {
  constructor(entity, range) { super(); this.entity = entity; this.range = range; this.rangeSq = range * range; this.update(); }
  update() { const p = this.entity.position; this.x = Math.floor(p.x); this.y = Math.floor(p.y); this.z = Math.floor(p.z); }
  heuristic(n) { return Math.hypot(n.x - this.x, n.z - this.z) + Math.abs(n.y - this.y); }
  isEnd(n) { return (n.x - this.x) ** 2 + (n.y - this.y) ** 2 + (n.z - this.z) ** 2 <= this.rangeSq; }
  hasChanged() { const p = this.entity.position.floored(), moved = (p.x - this.x) ** 2 + (p.y - this.y) ** 2 + (p.z - this.z) ** 2 > this.rangeSq; if (moved) this.update(); return moved; }
  isValid() { return this.entity && this.entity.isValid !== false; }
}
export class GoalInvert extends Goal {
  constructor(goal) { super(); this.goal = goal; }
  heuristic(n) { return -this.goal.heuristic(n); }
  isEnd(n) { return !this.goal.isEnd(n); }
  hasChanged() { return this.goal.hasChanged(); }
}
export class GoalCompositeAny extends Goal {
  constructor(goals = []) { super(); this.goals = goals; }
  push(g) { this.goals.push(g); }
  heuristic(n) { return Math.min(...this.goals.map(g => g.heuristic(n))); }
  isEnd(n) { return this.goals.some(g => g.isEnd(n)); }
  hasChanged() { return this.goals.some(g => g.hasChanged()); }
}
export class GoalCompositeAll extends Goal {
  constructor(goals = []) { super(); this.goals = goals; }
  push(g) { this.goals.push(g); }
  heuristic(n) { return Math.max(...this.goals.map(g => g.heuristic(n))); }
  isEnd(n) { return this.goals.every(g => g.isEnd(n)); }
  hasChanged() { return this.goals.some(g => g.hasChanged()); }
}
export const goals = { Goal, GoalBlock, GoalNear, GoalXZ, GoalNearXZ, GoalY, GoalGetToBlock, GoalLookAtBlock, GoalBreakBlock, GoalPlaceBlock, GoalFollow, GoalInvert, GoalCompositeAny, GoalCompositeAll };

// ---------- movements ----------
export class Movements {
  constructor(bot) {
    this.bot = bot;
    const r = bot.registry;
    this.canDig = true; this.digCost = 1; this.placeCost = 1; this.liquidCost = 1; this.entityCost = 1;
    this.allow1by1towers = true; this.allowFreeMotion = false; this.allowParkour = true; this.allowSprinting = true;
    this.dontCreateFlow = true; this.dontMineUnderFallingBlock = true; this.canOpenDoors = false; this.allowEntityDetection = true;
    this.maxDropDown = 4; this.infiniteLiquidDropdownDistance = true;
    // not part of Mineflayer's Movements: never step onto, into or down into water (the safety kit's run: a cost alone
    // still let a path cut a pond's corner)
    this.noWater = false;
    this.scafoldingBlocks = ['dirt', 'cobblestone', 'cobbled_deepslate', 'netherrack', 'stone', 'deepslate', 'andesite', 'diorite', 'granite', 'end_stone', 'oak_planks', 'spruce_planks', 'birch_planks'].map(n => r.itemsByName[n]?.id).filter(v => v !== undefined);
    this.blocksCantBreak = new Set(['chest', 'trapped_chest', 'crafting_table', 'furnace', 'lit_furnace', 'bedrock', 'end_portal_frame', 'end_portal', 'nether_portal', 'obsidian', 'barrier'].map(n => r.blocksByName[n]?.id).filter(v => v !== undefined));
    this.blocksToAvoid = new Set([...AVOID].map(n => r.blocksByName[n]?.id).filter(v => v !== undefined));
    this.liquids = new Set(['water', 'lava'].map(n => r.blocksByName[n]?.id).filter(v => v !== undefined));
    this.exclusionAreasStep = []; this.exclusionAreasBreak = []; this.exclusionAreasPlace = [];
  }
}

// ---------- planning ----------
class Heap {
  constructor() { this.a = []; }
  push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

function planner(bot, mv) {
  const block = (x, y, z) => bot.blockAt(new Vec3(x, y, z));
  const name = (b) => b?.name ?? null;
  const empty = (b) => b && (AIR_LIKE.has(b.name) || (b.boundingBox === 'empty' && !mv.blocksToAvoid.has(b.type) && b.name !== 'lava'));
  const water = (b) => b && (b.name === 'water' || b.name === 'ladder');
  const solid = (b) => b && b.boundingBox === 'block' && !mv.blocksToAvoid.has(b.type);
  const avoid = (b) => b && (mv.blocksToAvoid.has(b.type) || b.name === 'lava');
  const fluidNear = (x, y, z) => [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, c]) => { const n = name(block(x + a, y + b, z + c)); return n === 'water' || n === 'lava'; });
  // mineflayer-pathfinder: laborCost = (1 + 3 * digTime) with the best harvest tool in the inventory.
  const tools = [null, ...new Set(bot.inventory.items().map(i => i.name))];
  const digTimeOf = (b) => Math.min(...tools.filter(t => bot.registry.canHarvest(b.type, t) || t === null).map(t => bot.registry.digTime(b.type, t))) / 1000;
  const canBreak = (b, x, y, z) => mv.canDig && b && b.diggable && !mv.blocksCantBreak.has(b.type) && !avoid(b) && !(mv.dontCreateFlow && fluidNear(x, y, z)) && !(mv.dontMineUnderFallingBlock && FALLING.has(name(block(x, y + 1, z))));
  const scaffolds = () => bot.inventory.items().filter(i => mv.scafoldingBlocks.includes(i.type)).reduce((a, i) => a + i.count, 0);
  // Cost of getting the cell (x,y,z) and its head cell clear; null when impossible.
  const clearCost = (x, y, z, digs) => {
    let cost = 0;
    for (const dy of [0, 1]) {
      const b = block(x, y + dy, z);
      if (!b) return null;
      if (empty(b) || water(b)) continue;
      if (avoid(b) || !canBreak(b, x, y + dy, z)) return null;
      digs.push([x, y + dy, z]); cost += 1 + digTimeOf(b) * 3 * mv.digCost;
    }
    return cost;
  };
  const standable = (x, y, z) => { const f = block(x, y - 1, z); return (solid(f) && !bot.registry.blocks[f.type]?.tall) || water(block(x, y, z)) || water(f); };

  function neighbors(n, budget) {
    const out = [];
    const here = block(n.x, n.y, n.z);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = n.x + dx, z = n.z + dz;
      // walk / step down with digging
      { const digs = []; const c = clearCost(x, n.y, z, digs);
        if (c !== null) {
          // (water at the feet or under them: a step onto a pond's surface is a swim, and costs as one; it was free, so
          // a path with liquidCost 100 still crossed the pond rather than go around)
          if (standable(x, n.y, z) && !(mv.noWater && (water(block(x, n.y, z)) || water(block(x, n.y - 1, z))))) out.push({ x, y: n.y, z, cost: 1 + c + (water(block(x, n.y, z)) || water(block(x, n.y - 1, z)) ? mv.liquidCost * 2 : 0), digs, places: [] });
          else {
            // drop down
            let y = n.y - 1, ok = false, wet = false;
            for (; y >= Math.max(0, n.y - mv.maxDropDown - 1); y--) {
              const b = block(x, y, z); if (!b) break;
              if (avoid(b)) break;
              if (water(b)) { ok = !mv.noWater; wet = true; break; }
              if (solid(b)) { y++; ok = n.y - y <= mv.maxDropDown; break; }
            }
            // (a drop into water lands in water: it costs as a swim)
            if (ok && !digs.length) out.push({ x, y, z, cost: 1 + (n.y - y) * .5 + (wet ? mv.liquidCost * 2 : 0), digs: [], places: [], drop: true });
            // bridge: place a floor block and walk on it
            const floor = block(x, n.y - 1, z);
            if (scaffolds() > 0 && floor && (empty(floor) || water(floor)) && !avoid(floor)) out.push({ x, y: n.y, z, cost: 1 + c + 2 * mv.placeCost, digs, places: [[x, n.y - 1, z]] });
          }
        } }
      // step up
      { const digs = [];
        const head = block(n.x, n.y + 2, n.z);
        if (head && !(empty(head) || water(head))) { if (!canBreak(head, n.x, n.y + 2, n.z)) continue; digs.push([n.x, n.y + 2, n.z]); }
        const c = clearCost(x, n.y + 1, z, digs);
        if (c !== null && standable(x, n.y + 1, z)) out.push({ x, y: n.y + 1, z, cost: 2 + c + digs.length * .5, digs, places: [], up: true });
      }
    }
    // diagonals (no digging)
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = n.x + dx, z = n.z + dz, d = [];
      // (a diagonal across water pays the swim cost too; with noWater it may not cut past water on either side, where
      // the player's body clips the corner: dry11's pond test found paths crossing a pond's corner this way)
      const wetAt = (wx, wz) => water(block(wx, n.y, wz)) || water(block(wx, n.y - 1, wz));
      const wetD = wetAt(x, z), wetSide = wetAt(n.x + dx, n.z) || wetAt(n.x, n.z + dz);
      if (clearCost(x, n.y, z, d) === 0 && clearCost(n.x + dx, n.y, n.z, d) === 0 && clearCost(n.x, n.y, n.z + dz, d) === 0 && standable(x, n.y, z) && !d.length && !(mv.noWater && (wetD || wetSide))) out.push({ x, y: n.y, z, cost: Math.SQRT2 + (wetD ? mv.liquidCost * 2 : 0), digs: [], places: [] });
    }
    // dig down
    { const below = block(n.x, n.y - 1, n.z), under = block(n.x, n.y - 2, n.z);
      if (below && !empty(below) && !water(below) && canBreak(below, n.x, n.y - 1, n.z) && under && (solid(under) || water(under)) && !avoid(under)) out.push({ x: n.x, y: n.y - 1, z: n.z, cost: 1 + digTimeOf(below) * 3, digs: [[n.x, n.y - 1, n.z]], places: [] }); }
    // swim or climb up in water / ladders
    if (water(here) || water(block(n.x, n.y + 1, n.z))) { const up = block(n.x, n.y + 1, n.z), head = block(n.x, n.y + 2, n.z); if (up && (empty(up) || water(up)) && head && (empty(head) || water(head))) out.push({ x: n.x, y: n.y + 1, z: n.z, cost: 2, digs: [], places: [], swim: true }); }
    // pillar up
    if (mv.allow1by1towers && scaffolds() > 0 && solid(block(n.x, n.y - 1, n.z)) || mv.allow1by1towers && scaffolds() > 0 && (n.tower)) {
      const head = block(n.x, n.y + 2, n.z), digs = [];
      if (head && !(empty(head) || water(head))) { if (canBreak(head, n.x, n.y + 2, n.z)) digs.push([n.x, n.y + 2, n.z]); else return out; }
      if (head) out.push({ x: n.x, y: n.y + 1, z: n.z, cost: 2 + mv.placeCost * 2 + digs.length, digs, places: [[n.x, n.y, n.z]], tower: true });
    }
    return out;
  }

  return { neighbors, standable, block };
}

function search(bot, mv, goal, { timeout = 3000, maxNodes = 40000 } = {}) {
  const P = planner(bot, mv);
  const p = bot.entity.position;
  const start = { x: Math.floor(p.x), y: Math.floor(p.y + .01), z: Math.floor(p.z), g: 0, parent: null, move: null };
  start.h = goal.heuristic(start); start.f = start.h;
  const open = new Heap(), best = new Map(), key = (n) => `${n.x},${n.y},${n.z}`;
  open.push(start); best.set(key(start), 0);
  let closest = start, visited = 0;
  const t0 = Date.now();
  while (open.size) {
    const n = open.pop();
    if (goal.isEnd(n)) return { status: 'success', path: unwind(n), visited };
    if (n.h < closest.h) closest = n;
    if (++visited > maxNodes || open.size > 4 * maxNodes || Date.now() - t0 > timeout) break;
    for (const m of P.neighbors(n)) {
      const g = n.g + m.cost, k = key(m);
      if (best.has(k) && best.get(k) <= g) continue;
      best.set(k, g);
      const node = { x: m.x, y: m.y, z: m.z, g, parent: n, move: m };
      node.h = goal.heuristic(node); node.f = g + node.h;
      open.push(node);
    }
  }
  return closest === start ? { status: 'noPath', path: [], visited } : { status: 'partial', path: unwind(closest), visited };
}
function unwind(n) { const out = []; for (; n.parent; n = n.parent) out.unshift(n); return out; }

// ---------- walking a path ----------
async function walk(bot, mv, path, state) {
  for (const node of path) {
    if (state.stopped) throw stopError();
    const m = node.move;
    try { await walkNode(bot, mv, path, node, m, state); }
    catch (err) { err.node ??= node; err.move ??= m.tower ? 'tower' : m.places.length ? 'bridge' : m.digs.length ? 'dig' : m.up ? 'up' : m.drop ? 'drop' : m.swim ? 'swim' : 'walk'; throw err; }
  }
  bot.clearControlStates();
}

async function walkNode(bot, mv, path, node, m, state) {
  {
    bot.pathfinder._mining = m.digs.length > 0;
    for (const [x, y, z] of m.digs) {
      const b = bot.blockAt(new Vec3(x, y, z));
      if (!b || b.boundingBox === 'empty' || b.name === 'water') continue;
      await equipTool(bot, b);
      await bot.dig(b, true);
    }
    bot.pathfinder._mining = false;
    if (m.tower) { await tower(bot, mv, node, state); return; }
    if (m.places.length) {
      bot.pathfinder._building = true;
      for (const [x, y, z] of m.places) await placeUnder(bot, mv, new Vec3(x, y, z));
      bot.pathfinder._building = false;
    }
    const i = path.indexOf(node), nxt = path[i + 1];
    // Stop at this node when it is the last, or when the next move digs, places, towers or drops.
    const last = !nxt || nxt.move.digs.length > 0 || nxt.move.places.length > 0 || nxt.move.tower || m.drop;
    await stepTo(bot, node, m, state, last, nxt);
    bot.emit('path_update', { status: 'partial', path: path.slice(path.indexOf(node) + 1) });
  }
}

function stopError() { const e = new Error('Path was stopped before it could be completed! Thus, the desired goal was not reached.'); e.name = 'PathStopped'; return e; }

async function stepTo(bot, node, m, state, last = true, next = null) {
  // Walk to the node; an intermediate node is passed through without stopping (within half a block), the last one is
  // reached (within 0.3). The look is sent only when it changes.
  const target = new Vec3(node.x + .5, node.y, node.z + .5);
  const t0 = bot.tickCount;
  let lastDist = Infinity, stuckSince = bot.tickCount;
  for (;;) {
    if (state.stopped) { bot.clearControlStates(); throw stopError(); }
    const p = bot.entity.position, dx = target.x - p.x, dz = target.z - p.z, flat = Math.hypot(dx, dz);
    const levelOk = m.drop ? p.y < node.y + .6 && (bot.entity.onGround || bot.entity.isInWater) : Math.abs(p.y - node.y) < .6 || m.swim && p.y > node.y - .2;
    if (flat < (last ? .3 : .55) && levelOk) break;
    const yaw = Math.atan2(-dx, -dz);
    if (Math.abs(((yaw - (bot._sentYaw ?? 99)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) > .08) { bot._sentYaw = yaw; bot.entity.yaw = yaw; bot.look(yaw, 0, true).catch(() => {}); }
    const controls = { forward: flat > .15, jump: !!(m.up || m.swim || (bot.entity.isInWater && node.y >= Math.floor(p.y))), sprint: !!(bot.pathfinder.movements?.allowSprinting && !last && !m.up) };
    for (const [k, v] of Object.entries(controls)) if (bot.controlState[k] !== v) bot.setControlState(k, v);
    await bot.waitForTicks(1);
    const d = flat + Math.abs(p.y - node.y);
    if (d < lastDist - .05) { lastDist = d; stuckSince = bot.tickCount; }
    if (bot.tickCount - stuckSince > 40) { bot.clearControlStates(); throw Object.assign(new Error('Stuck while walking the path'), { name: 'Stuck' }); }
    if (bot.tickCount - t0 > 200) { bot.clearControlStates(); throw Object.assign(new Error('Step took too long'), { name: 'Stuck' }); }
  }
  if (last) for (const k of ['forward', 'jump', 'sprint']) if (bot.controlState[k]) bot.setControlState(k, false);
}

async function equipTool(bot, block) {
  let best = null, bestT = bot.registry.digTime(block.type, bot.heldItem?.name ?? null);
  for (const it of bot.inventory.items()) { const t = bot.registry.digTime(block.type, it.name); if (t < bestT - 1 && bot.registry.canHarvest(block.type, it.name)) { best = it; bestT = t; } }
  if (best && best.slot !== 36 + bot.quickBarSlot) await bot.equip(best, 'hand');
}

async function equipScaffold(bot, mv) {
  const it = bot.inventory.items().find(i => mv.scafoldingBlocks.includes(i.type));
  if (!it) throw Object.assign(new Error('No scaffolding blocks left'), { name: 'NoScaffold' });
  if (it.slot !== 36 + bot.quickBarSlot) await bot.equip(it, 'hand');
}

async function placeUnder(bot, mv, at) {
  const here = bot.blockAt(at);
  if (here && here.boundingBox === 'block') return;
  await equipScaffold(bot, mv);
  for (const [dx, dy, dz] of [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
    const ref = bot.blockAt(at.offset(dx, dy, dz));
    if (ref && ref.boundingBox === 'block') { try { await bot.placeBlock(ref, new Vec3(-dx, -dy, -dz)); return; } catch { /* try another face */ } }
  }
  throw Object.assign(new Error('Could not place a block to walk on'), { name: 'NoPlace' });
}

async function tower(bot, mv, node, state) {
  await equipScaffold(bot, mv);
  const startY = Math.floor(bot.entity.position.y), floor = bot.blockAt(new Vec3(node.x, startY - 1, node.z));
  await bot.look(bot.entity.yaw, -Math.PI / 2, true);
  bot.setControlState('jump', true);
  for (let i = 0; i < 30; i++) {
    await bot.waitForTicks(1);
    if (bot.entity.position.y > startY + 1.05) {
      try { await bot.placeBlock(floor, new Vec3(0, 1, 0)); } catch { /* landing will tell */ }
      break;
    }
  }
  bot.setControlState('jump', false);
  for (let i = 0; i < 20 && !bot.entity.onGround; i++) await bot.waitForTicks(1);
  if (Math.floor(bot.entity.position.y + .01) < startY + 1) throw Object.assign(new Error('Pillaring up failed'), { name: 'Stuck' });
}

// ---------- the plugin ----------
export function pathfinder(bot) {
  if (bot.pathfinder) return;
  const pf = new EventEmitter();
  pf.movements = new Movements(bot);
  pf.thinkTimeout = 5000; pf.tickTimeout = 40; pf.searchRadius = -1;
  pf.goal = null; pf._state = null; pf.failures = []; pf._mining = false; pf._building = false;
  pf.setMovements = (m) => { pf.movements = m; };
  pf.isMoving = () => !!pf._state && !pf._state.stopped;
  pf.isMining = () => pf._mining;
  pf.isBuilding = () => pf._building;
  pf.stop = () => { if (pf._state) pf._state.stopped = true; bot.clearControlStates(); };
  pf.setGoal = (goal, dynamic = false) => {
    pf.stop();
    if (!goal) { pf.goal = null; bot.emit('path_reset', 'goal_updated'); return; }
    pf.goto(goal).catch(() => {});
  };
  pf.getPathTo = (movements, goal, timeout) => { const r = search(bot, movements ?? pf.movements, goal, { timeout: timeout ?? pf.thinkTimeout }); return { status: r.status, path: r.path.map(n => new Vec3(n.x, n.y, n.z)), visitedNodes: r.visited, cost: r.path.at(-1)?.g ?? 0, time: 0 }; };
  pf.bestHarvestTool = (block) => { let best = null, t = Infinity; for (const it of bot.inventory.items()) { const d = bot.registry.digTime(block.type, it.name); if (d < t && bot.registry.canHarvest(block.type, it.name)) { t = d; best = it; } } return best; };
  pf.goto = async (goal) => {
    if (pf._state) pf._state.stopped = true;
    const state = { stopped: false };
    pf._state = state; pf.goal = goal;
    let noProgress = 0, replans = 0;
    try {
      for (;;) {
        if (state.stopped) throw stopError();
        const p = bot.entity.position, here = { x: Math.floor(p.x), y: Math.floor(p.y + .01), z: Math.floor(p.z) };
        if (goal.isEnd(here)) { bot.emit('goal_reached', goal); return; }
        if (goal.isValid && !goal.isValid()) throw Object.assign(new Error('Goal is no longer valid'), { name: 'GoalChanged' });
        const r = search(bot, pf.movements, goal, { timeout: pf.thinkTimeout });
        bot.emit('path_update', { status: r.status, path: r.path.map(n => new Vec3(n.x, n.y, n.z)), visitedNodes: r.visited });
        if (r.status === 'noPath' || !r.path.length) throw Object.assign(new Error('No path to the goal!'), { name: 'NoPath' });
        const before = goal.heuristic(here);
        try { await walk(bot, pf.movements, r.status === 'partial' ? r.path : r.path, state); }
        catch (err) {
          if (err.name === 'PathStopped') throw err;
          // What went wrong, for a program that asks (bot.pathfinder.failures) and for the 'path_failed' event.
          const p = bot.entity.position, at = err.node ? `${err.node.x},${err.node.y},${err.node.z}` : null;
          const failure = { error: err.message, move: err.move ?? null, node: at, from: `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}` };
          pf.failures.push(failure); if (pf.failures.length > 20) pf.failures.shift();
          bot.emit('path_failed', failure);
          if (++replans > 25) throw err;
          await bot.waitForTicks(2);
        }
        if (goal.hasChanged?.()) continue;
        const q = bot.entity.position, now = goal.heuristic({ x: Math.floor(q.x), y: Math.floor(q.y + .01), z: Math.floor(q.z) });
        if (now >= before - .5) { if (++noProgress >= 4) throw Object.assign(new Error('No path to the goal! (no progress after several attempts)'), { name: 'NoPath' }); } else noProgress = 0;
      }
    } finally {
      bot.clearControlStates();
      if (pf._state === state) { pf._state = null; pf.goal = null; }
      if (state.stopped) bot.emit('path_stop');
    }
  };
  bot.pathfinder = pf;
}
