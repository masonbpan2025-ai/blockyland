// houseBotDs shared core: helpers over the arena's bot API, run bridging, walking, combat reflexes, and the
// planner's search engine. Not a strategy by itself: houseBotDs/build.mjs puts it in front of each game's file
// (houseBotDs/<game>.game.js) to make the self-contained strategy the arena runs (houseBotDs/<game>.js).
//
// Built from the house bots' core, with these changes (notes/changes.md):
// - Bridging: blocks are placed in runs of up to three ahead of the player (the reach allows the third face),
//   then walked at full speed with a sneak/stop guard. No per-block re-centring; every step follows a block
//   seen in the world; a placement is retried rather than stepped through.
// - Fighting: hits at the arena's 0.8 s swing cap; jump-crits when the enemy has ground behind them, sprint
//   hits when the enemy is near a void edge or a one-block bridge; snowball/egg throws at a bridging enemy;
//   golden apple at 13 HP; strafing only onto solid ground; no chase over an edge.
// - Planner: measured walk/bridge rates, refills, cash-like resource and cover state, and time pressure.

const BLOCK_RE = /(planks|wool|stone$|cobblestone|hardened_clay|terracotta|sandstone|concrete|glass|_log$|andesite|diorite|granite|deepslate|bricks)$/;
const NOT_BLOCK = /(sword|pickaxe|_axe|shovel|hoe|helmet|chestplate|leggings|boots|bow|arrow|apple|pearl|bucket|egg|snowball|stick|potion|ingot|diamond$|emerald$)/;
const SWORD = { wooden_sword: 4, golden_sword: 4, stone_sword: 5, iron_sword: 6, diamond_sword: 7, netherite_sword: 8 };
const AXE = { wooden_axe: 3, golden_axe: 3, stone_axe: 4, iron_axe: 5, diamond_axe: 6 };
const ARMOR_TIER = { leather: 1, golden: 2, chainmail: 3, iron: 4, diamond: 5, netherite: 6 };
const ARMOR_SLOT = [['helmet', 'head'], ['chestplate', 'torso'], ['leggings', 'legs'], ['boots', 'feet']];
const ATTACK_MS = 780;            // the arena allows at most one swing every 0.8 s (a sword recharges in 0.6)
const GAPPLE_MS = 9000;
const FOOD = /(cooked_beef|cooked_porkchop|cooked_chicken|cooked_mutton|cooked_salmon|cooked_cod|baked_potato|bread|carrot|apple)$/;
const THROWABLE = /(snowball|egg)$/;
const WALK_SPEED = 3.1;           // blocks/s (agent rules)

const log = (...a) => console.log('[ds]', ...a);
const items = (bot) => { try { return bot.inventory.items() || []; } catch { return []; } };
const isBlock = (it) => it && it.count > 0 && BLOCK_RE.test(it.name) && !NOT_BLOCK.test(it.name);
const blockCount = (bot) => items(bot).filter(isBlock).reduce((n, it) => n + it.count, 0);
const weaponScore = (it) => (it ? SWORD[it.name] ?? AXE[it.name] ?? 0 : 0);
const v = (p) => new Vec3(p.x, p.y, p.z);
const solid = (bot, p) => { const b = bot.blockAt(p); return !!b && b.boundingBox === 'block'; };
const feetCell = (bot) => bot.entity.position.offset(0, -0.5, 0).floored();
const withTimeout = (p, ms) => Promise.race([p, sleep(ms).then(() => 'timeout')]).catch((e) => e);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function enemy(bot, { heard = false } = {}) {
  return bot.nearestEntity((e) => e.type === 'player' && e.username !== bot.username && (heard || !e.heard));
}

function solidAround(bot, cell) {
  let n = 0;
  for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) if (solid(bot, cell.offset(ox, 0, oz))) n++;
  return n;
}

/** The solid cell one *k* blocks from `from` toward `to`, at the floor level of `from`. */
function cellToward(from, to, k) {
  const dx = to.x - from.x, dz = to.z - from.z, len = Math.hypot(dx, dz) || 1;
  return new Vec3(Math.floor(from.x + (dx / len) * k), Math.floor(from.y - 0.5), Math.floor(from.z + (dz / len) * k));
}

async function holdBlock(bot) {
  if (isBlock(bot.heldItem)) return true;
  const best = items(bot).filter(isBlock).sort((a, b) => b.count - a.count)[0];
  if (!best) return false;
  try { await bot.equip(best, 'hand'); } catch { return false; }
  return true;
}

async function holdWeapon(bot) {
  const best = items(bot).sort((a, b) => weaponScore(b) - weaponScore(a))[0];
  if (!best || weaponScore(best) === 0 || (bot.heldItem && bot.heldItem.name === best.name)) return;
  try { await bot.equip(best, 'hand'); } catch { /* next time */ }
}

async function wearBestArmour(bot) {
  for (const [piece, dest] of ARMOR_SLOT) {
    const worn = bot.inventory.slots[{ head: 5, torso: 6, legs: 7, feet: 8 }[dest]];
    const tier = (it) => (it ? ARMOR_TIER[it.name.split('_')[0]] ?? 0 : 0);
    const best = items(bot).filter((it) => it.name.endsWith(`_${piece}`)).sort((a, b) => tier(b) - tier(a))[0];
    if (best && tier(best) > tier(worn)) { try { await bot.equip(best, dest); log('wearing', best.name); } catch { /* next time */ } }
  }
}

/**
 * What the bot has noticed lately: when it was last hurt (its own hits, or a health drop from an unseen arrow),
 * when it last saw or heard a player, the last wide ground it stood on, and the last time a walk was dropped for
 * a threat (so a caller can tell "no route" from "interrupted").
 */
const awareness = { hurtAt: 0, threatAt: 0, lastLand: null, lastHealth: 20, walkStoppedAt: 0 };

/**
 * Listen for my own hurts, once per program start. The hit event covers a sword or a punch; the health listener
 * covers damage from someone I cannot see at all (an arrow), which produces no hurt event on my entity.
 */
function watchForHits(bot) {
  bot.on('entityHurt', (e) => { if (e && (e === bot.entity || e.username === bot.username)) awareness.hurtAt = Date.now(); });
  bot.on('health', () => {
    if (typeof bot.health !== 'number') return;
    if (bot.health < awareness.lastHealth - 0.01) awareness.hurtAt = Date.now();
    awareness.lastHealth = bot.health;
  });
}

/**
 * Whether a long move (walking, farming, looting, covering, bridging) should stop for a threat: hit in the last
 * 1.5 s, or a player seen or only heard within `range`. A player behind me is heard, not seen; being hit by one
 * must still stop whatever I was doing.
 */
function threatened(bot, range = 10) {
  if (Date.now() - awareness.hurtAt < 1500) return true;
  const foe = enemy(bot, { heard: true });
  if (foe) awareness.threatAt = Date.now();
  return !!foe && bot.entity.position.distanceTo(foe.position) < range;
}

const hasBow = (bot) => items(bot).some((it) => it.name === 'bow') && bot.inventory.count('arrow') > 0;

/** One arrow at a foe: draw for a second, aiming above it for the drop over the distance, and loose. */
async function shoot(bot, foe) {
  const bow = items(bot).find((it) => it.name === 'bow');
  if (!bow) return false;
  try {
    bot.clearControlStates();
    await bot.equip(bow, 'hand');
    const aim = () => { const d = bot.entity.position.distanceTo(foe.position); return foe.position.offset(0, 1.4 + d * d * 0.0045, 0); };
    await bot.lookAt(aim());
    bot.activateItem();
    for (let i = 0; i < 4; i++) { await bot.waitForTicks(5); await bot.lookAt(aim()); }
    bot.deactivateItem();
    log('arrow at', foe.username, bot.entity.position.distanceTo(foe.position).toFixed(1));
    return true;
  } catch { try { bot.deactivateItem(); } catch { /* not drawn */ } return false; }
}

/**
 * Walk on the ground there is (the pathfinder keeps off edges); false if there is no walking route, or if a
 * threat comes up on the way (hit, or a player seen or heard within 6): a walk never keeps the bot from reacting.
 * Polling every two ticks instead of awaiting the pathfinder also means a failed route costs ticks, not seconds.
 */
async function walkTo(bot, p, range = 1.5, ms = 12000, { interrupt = true } = {}) {
  let failed = false;
  let going;
  try {
    going = bot.pathfinder.goto(new goals.GoalNear(p.x, p.y, p.z, range)).then(() => 'done', () => { failed = true; return 'failed'; });
  } catch { return false; }
  let outcome = null;
  going.then((r) => { outcome = r; });
  const until = Date.now() + ms;
  while (outcome === null && Date.now() < until) {
    if (interrupt && threatened(bot, 6)) { awareness.walkStoppedAt = Date.now(); bot.pathfinder.stop(); return false; }
    await bot.waitForTicks(2);
  }
  bot.pathfinder.stop();
  return outcome === 'done' && !failed;
}

/**
 * The block I stand on. Sneaking at an edge can leave my centre over air with my feet still on a block beside it;
 * that block is the one under the corner of my box nearest my centre.
 */
function standingCell(bot) {
  const p = bot.entity.position, under = feetCell(bot);
  if (solid(bot, under)) return under;
  const cells = [[-0.3, -0.3], [-0.3, 0.3], [0.3, -0.3], [0.3, 0.3]].map(([dx, dz]) => new Vec3(Math.floor(p.x + dx), under.y, Math.floor(p.z + dz)));
  return cells.filter((c) => solid(bot, c)).sort((a, b) => p.xzDistanceTo(a.offset(0.5, 0, 0.5)) - p.xzDistanceTo(b.offset(0.5, 0, 0.5)))[0] || null;
}

/**
 * Walk to the middle of a block's top, sneaking, in taps: the arena delays every press and release alike (150 ms
 * plus 0-60, about 0.18 s), so a held key overshoots by a third of a block; a tap stays a tap.
 */
async function stepTo(bot, cell, within = 0.2) {
  const goal = cell.offset(0.5, 1, 0.5);
  bot.setControlState('sneak', true);
  let aimed = null;
  for (let i = 0; i < 40; i++) {
    const p = bot.entity.position, d = p.xzDistanceTo(goal);
    if (d <= within) break;
    const yaw = Math.atan2(-(goal.x - p.x), -(goal.z - p.z));
    if (aimed === null || Math.abs(Math.atan2(Math.sin(yaw - aimed), Math.cos(yaw - aimed))) > 0.35) { await bot.look(yaw, -0.3); aimed = yaw; }
    if (d > 0.6) {
      bot.setControlState('forward', true);
      while (bot.entity.position.xzDistanceTo(goal) > 0.38 && i++ < 40) await bot.waitForTicks(1);
      bot.setControlState('forward', false);
      await bot.waitForTicks(4);
    } else {
      bot.setControlState('forward', true);
      await bot.waitForTicks(1);
      bot.setControlState('forward', false);
      await bot.waitForTicks(1);
    }
  }
}

/** Step to the centre of the block I stand on. */
async function centre(bot) {
  const cell = standingCell(bot);
  if (cell) await stepTo(bot, cell);
}

const cellXZ = (c) => new Vec3(Math.floor(c.x), 0, Math.floor(c.z));
function sameCell(a, b) { return Math.floor(a.x) === Math.floor(b.x) && Math.floor(a.z) === Math.floor(b.z); }

/** The axis step toward the target from the middle of `here`. */
function bridgeStep(here, target) {
  const dx = target.x - (here.x + 0.5), dz = target.z - (here.z + 0.5);
  if (Math.abs(dx) >= Math.abs(dz)) return new Vec3(Math.sign(dx), 0, 0);
  return new Vec3(0, 0, Math.sign(dz));
}

/**
 * Place up to four blocks ahead of `here`, each against the far face of the last solid cell in the line. The
 * reach allows the third reliably and the fourth when the feet are centred; hitting the 4.4 limit stops the run.
 */
async function buildRun(bot, here, step, onPlaced, railSides = null) {
  let last = here, count = 0;
  for (let i = 0; i < 4; i++) {
    const next = last.plus(step);
    if (solid(bot, next)) { last = next; count++; continue; }
    if (!(await holdBlock(bot))) return { kind: count ? 'ok' : 'no_blocks', last, count };
    const face = last.offset(0.5 + step.x * 0.5, 0.5 + step.y * 0.5, 0.5 + step.z * 0.5);
    const eye = bot.entity.position.offset(0, 1.62, 0);
    if (eye.distanceTo(face) > 4.4) break;
    const ref = bot.blockAt(last);
    if (!ref || ref.boundingBox !== 'block') break;
    const t0 = Date.now();
    try {
      await bot.lookAt(face);
      await bot.placeBlock(ref, step);
      if (onPlaced) onPlaced((Date.now() - t0) / 1000);
    } catch (e) { break; }
    await bot.waitForTicks(1);
    if (!solid(bot, next)) break;      // never walk onto a block that was not seen in the world
    last = next; count++;
    // Rails while an enemy is close: a block on the side a knockback would push me toward guards the width of
    // the walkway. Only in the direction of the push (both sides when the foe is nearly in line and the push is
    // along the lane), only when there are blocks to spare for the bridge itself, and only on a real block.
    if (railSides && blockCount(bot) > 16) {
      for (const s of railSides) {
        if (solid(bot, next.plus(s))) continue;
        const face = next.offset(0.5 + s.x * 0.5, 0.5, 0.5 + s.z * 0.5);
        if (bot.entity.position.offset(0, 1.62, 0).distanceTo(face) > 4.4) continue;
        try { await bot.placeBlock(bot.blockAt(next), s); } catch { /* the walkway itself is still there */ }
        await bot.waitForTicks(1);
      }
    }
  }
  return { kind: count ? 'ok' : 'stuck', last, count };
}

/**
 * Walk the run just placed, at walking speed, ending at the middle-ish of its last block. Sneak is turned on
 * with the release so that a delayed release at most stops at the block's edge instead of walking off.
 */
async function walkRun(bot, last, step, stopForEnemy) {
  const goal = last.offset(0.5, 0, 0.5);
  const startY = bot.entity.position.y;
  bot.setControlState('sprint', false);
  bot.setControlState('sneak', false);
  // When a threat is what I stop for, walk with my eyes along the run rather than down at the block just placed.
  // Placing looks at the face under my hand, and a player coming the other way is outside that view: in round 3 a
  // bow was loosed at 5.7 and a sword reached 2.4 before the foe was ever in `bot.entities`. The yaw is still the
  // run's (the point is straight past its far end), so the walk cannot veer; only the pitch is raised.
  if (stopForEnemy && bot.entity.position.xzDistanceTo(goal) >= 1.5) {
    try { await bot.lookAt(goal.offset(0, 1.9, 0)); } catch { /* the walk still goes */ }
  }
  bot.setControlState('forward', true);
  for (let i = 0; i < 90; i++) {
    if (bot.entity.position.y < startY - 2) return 'fell';
    if (stopForEnemy) {
      if (Date.now() - awareness.hurtAt < 1500) {
        bot.setControlState('forward', false); bot.setControlState('sneak', true);
        await bot.waitForTicks(3);
        return 'hit';
      }
      // What is behind me can still be heard (16 blocks, rough position): a heard player is a reason to stop,
      // not only one I have turned round to see.
      const foe = enemy(bot, { heard: true });
      if (foe && bot.entity.position.distanceTo(foe.position) <= (foe.heard ? 8 : 5)) {
        bot.setControlState('forward', false); bot.setControlState('sneak', true);
        await bot.waitForTicks(3);
        return 'enemy';
      }
    }
    const d = bot.entity.position.xzDistanceTo(goal);
    if (d <= 1.05) {
      // Release now; the delayed release stops near the middle, and sneak (called first) saves a long coast.
      bot.setControlState('sneak', true);
      bot.setControlState('forward', false);
      break;
    }
    // If the cell in front of my feet is air, this is the end of the run: stop, sneak, never step off.
    const front = feetCell(bot).plus(step);
    if (!solid(bot, front)) {
      bot.setControlState('sneak', true);
      bot.setControlState('forward', false);
      break;
    }
    await bot.waitForTicks(1);
  }
  bot.setControlState('forward', false);
  await bot.waitForTicks(5);
  return 'ok';
}

/**
 * Bridge toward `target` (a point), flat, from the island I stand on. Runs of three blocks are placed ahead and
 * then walked; the bot sneaks only where the run ends, and never steps onto a block it has not seen.
 * @returns 'arrived' | 'enemy' | 'hit' | 'no_blocks' | 'fell' | 'stuck'
 */
async function bridgeTo(bot, target, { stopForEnemy = true, arrive = 2.5, onPlaced = null } = {}) {
  const startY = bot.entity.position.y;
  let fails = 0, best = Infinity, bestAt = 0;
  bot.setControlState('sneak', true);
  try {
    for (let guard = 0; guard < 500; guard++) {
      if (bot.entity.position.y < startY - 3) return 'fell';
      const dist = bot.entity.position.xzDistanceTo(target);
      if (dist <= arrive) return 'arrived';
      if (dist < best - 0.3) { best = dist; bestAt = guard; } else if (guard - bestAt > 120) return 'stuck';
      if (stopForEnemy) {
        if (Date.now() - awareness.hurtAt < 1500) return 'hit';
        const foe = enemy(bot, { heard: true });
        if (foe && bot.entity.position.distanceTo(foe.position) <= (foe.heard ? 8 : 5)) return 'enemy';
      }
      let here = feetCell(bot);
      if (!solid(bot, here)) {
        const cell = standingCell(bot);
        if (!cell) { await bot.waitForTicks(2); continue; }   // in the air: landing, or falling
        await stepTo(bot, cell);
        here = feetCell(bot);
        if (!solid(bot, here)) { await bot.waitForTicks(2); continue; }
      }
      const step = bridgeStep(here, target);
      if (step.x === 0 && step.z === 0) { await bot.waitForTicks(2); continue; }
      const next = here.plus(step);
      // Ground ahead already (an island, not my bridge): with something at body height in the way, or simply on
      // land again, the pathfinder walks the rest, round whatever stands there.
      if (solid(bot, next) && (solid(bot, next.offset(0, 1, 0)) || solid(bot, next.offset(0, 2, 0)) || solid(bot, next.plus(step)))) {
        const edge = launchPoint(bot, target);
        if (!edge.equals(here)) {
          bot.setControlState('sneak', false);
          await walkTo(bot, edge.offset(0.5, 1, 0.5), 0.9, 8000);
          bot.setControlState('sneak', true);
          continue;
        }
      }
      if (solid(bot, next)) { await stepTo(bot, next, 0.3); continue; }
      // A rail on the side the knockback would push me toward -- one block per block, not two -- only while the
      // foe is within reach of this lane (16) and only from blocks beyond what the bridge still needs. The house
      // bot rails both sides of every block for 20 s after any sight of the foe, which can spend the bridge.
      let railSides = null;
      const threat = enemy(bot, { heard: true });
      if (threat && bot.entity.position.distanceTo(threat.position) <= 16 && blockCount(bot) > Math.ceil(dist) + 8) {
        const s1 = new Vec3(step.z, 0, -step.x), s2 = new Vec3(-step.z, 0, step.x);
        const p = bot.entity.position;
        const d1 = s1.x * (p.x - threat.position.x) + s1.z * (p.z - threat.position.z);
        railSides = Math.abs(d1) < 4 ? [s1, s2] : [d1 > 0 ? s1 : s2];
      }
      const run = await buildRun(bot, here, step, onPlaced, railSides);
      if (run.kind === 'no_blocks') return 'no_blocks';
      if (run.kind === 'stuck') { fails++; if (fails >= 3) return 'stuck'; await bot.waitForTicks(3); continue; }
      const walked = await walkRun(bot, run.last, step, stopForEnemy);
      if (walked === 'enemy') return 'enemy';
      if (walked === 'hit') return 'hit';
      if (walked === 'fell') return 'fell';
      fails = 0;
    }
    return 'stuck';
  } finally {
    bot.setControlState('forward', false);
    bot.setControlState('sneak', false);
    bot.setControlState('sprint', false);
  }
}

/** The solid cell of my island farthest along the way to `target`: where a bridge toward it starts. */
function launchPoint(bot, target) {
  const from = feetCell(bot), to = new Vec3(Math.floor(target.x), from.y, Math.floor(target.z));
  const d = Math.hypot(to.x - from.x, to.z - from.z) || 1;
  let last = from;
  for (let t = 1; t < d; t++) {
    const c = new Vec3(Math.floor(from.x + ((to.x - from.x) * t) / d), from.y, Math.floor(from.z + ((to.z - from.z) * t) / d));
    if (!solid(bot, c)) break;
    last = c;
  }
  return last;
}

/**
 * Get to `target` however: walk if there is ground, else walk to my island's edge facing it and bridge.
 * A walk dropped for a threat is not a failed route: the opposite of the house bot, which bridges on toward the
 * target after the same stop and can end up fighting on a half-built bridge. Here the planner gets 'threat' back
 * and the main loop reacts (reactToThreat) before anything else.
 */
async function travel(bot, target, opts = {}) {
  if (await walkTo(bot, target, 2, 6000)) return 'arrived';
  if (Date.now() - awareness.walkStoppedAt < 600) return 'threat';
  const start = launchPoint(bot, target);
  if (!(await walkTo(bot, start.offset(0.5, 1, 0.5), 0.6, 6000)) && Date.now() - awareness.walkStoppedAt < 600) return 'threat';
  return bridgeTo(bot, target, opts);
}

/** Record how long this bot really takes per placement (the extra cost per bridge block), for the model. */
function noteBridge(mem, durations) {
  if (!durations || durations.length < 3) return;
  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
  const rate = clamp(mean, 0.45, 2.5);
  mem.bridgeRate = mem.bridgeRate ? mem.bridgeRate * 0.7 + rate * 0.3 : rate;
}

/** The key of a chest for this refill epoch (SkyWars chests refill at 3:00). */
function chestKey(bot, chest) {
  const epoch = (bot.arena.time || 0) >= 180 ? 1 : 0;
  return `${chest.x},${chest.y},${chest.z}#${epoch}`;
}

async function loot(bot, chest, mem) {
  const key = chestKey(bot, chest);
  if (mem.looted[key]) return;
  if ((mem.lootRetry[key] || 0) > (bot.arena.time || 0)) return;
  if (!(await walkTo(bot, chest, 2.5, 8000))) {
    // A walk dropped for a threat is not a failed route: retry the chest when it is clear, not in 25 s.
    if (Date.now() - awareness.walkStoppedAt >= 600) mem.lootRetry[key] = (bot.arena.time || 0) + 25;
    return;
  }
  const block = bot.blockAt(v(chest));
  if (!block || !block.name.includes('chest')) { mem.looted[key] = true; return; }
  try {
    const c = await bot.openContainer(block);
    const order = (it) => (weaponScore(it) ? 0 : /helmet|chestplate|leggings|boots/.test(it.name) ? 1 : isBlock(it) ? 2 : /golden_apple|pearl|snowball|egg/.test(it.name) ? 3 : 4);
    for (const it of c.containerItems().sort((a, b) => order(a) - order(b))) {
      // A chest is not worth being hit in: a player seen or only heard within 8, or a hit I have just taken,
      // ends the loot -- the same rule as the house bot, so a chest raided with someone behind me is not a death.
      if (threatened(bot, 8)) break;
      try { await c.withdraw(it.name, null, it.count); } catch { /* full, or gone */ }
    }
    try { await c.close(); } catch { /* closed */ }
    mem.looted[key] = true;          // only a chest that really opened counts as looted
  } catch (e) {
    log('chest:', e.message);
    mem.lootRetry[key] = (bot.arena.time || 0) + 20;
  }
  await wearBestArmour(bot);
  await holdWeapon(bot);
}

async function eatIfNeeded(bot, mem, foeDist) {
  if (bot.health <= 13 && foeDist > 3.2 && Date.now() - (mem.ate || 0) > GAPPLE_MS) {
    const apple = items(bot).find((it) => it.name === 'golden_apple');
    if (apple) {
      try { bot.clearControlStates(); await bot.equip(apple, 'hand'); await bot.consume(); mem.ate = Date.now(); log('golden apple'); } catch { /* next time */ }
      return true;
    }
  }
  if (bot.food <= 13 && foeDist > 6 && Date.now() - (mem.foodAt || 0) > 18000) {
    const food = items(bot).find((it) => FOOD.test(it.name) && it.name !== 'golden_apple');
    if (food) {
      try { await bot.equip(food, 'hand'); await bot.consume(); mem.foodAt = Date.now(); } catch { /* next time */ }
      return true;
    }
  }
  return false;
}

/**
 * Give ground along solid footing, never diagonally off a ledge. Of the four ground-level neighbours, take the
 * solid one most directly away from the foe and walk to the middle of its top. The `back` key is relative to the
 * gaze (which is on the foe), so on a narrow lane "directly away" can be off the bridge; the pathfinder turns us.
 * Returns false when every neighbour is toward the foe or there is no solid neighbour.
 */
async function backOff(bot, foe) {
  const p = bot.entity.position, here = feetCell(bot);
  const dx = foe.position.x - p.x, dz = foe.position.z - p.z, len = Math.hypot(dx, dz) || 1;
  let best = null;
  for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const c = here.offset(ax, 0, az);
    if (!solid(bot, c)) continue;
    const dot = (ax * dx + az * dz) / len;
    if (dot >= -0.15) continue;
    if (!best || dot < best.dot) best = { c, dot };
  }
  if (!best) return false;
  // Full walking speed, not a sneak: the foe closes at the same speed, so a slow retreat is caught mid-bridge.
  // The pathfinder picks the path; the goal is the top of a solid neighbour, so the stop cannot be over the void.
  bot.setControlState('sprint', false);
  await walkTo(bot, best.c.offset(0.5, 1, 0.5), 0.4, 800, { interrupt: false });
  return true;
}

/**
 * One beat of a fight: face, close in without walking off an edge, eat when hurt, hit on the cooldown.
 * A sprint hit is used when the enemy can be pushed into the void; otherwise a jump-crit (x1.5) when there is
 * ground to land on. On a one-block bridge the bot sneaks and never sprints (the old lesson: a sprint on a
 * narrow bridge walks its owner off).
 */
async function fight(bot, foe, mem) {
  if (bot.currentWindow) { try { bot.closeWindow(bot.currentWindow); } catch { /* closed */ } }
  const p = bot.entity.position;
  const d = p.distanceTo(foe.position);
  if (await eatIfNeeded(bot, mem, d)) await holdWeapon(bot);

  // A crit in progress: do not re-aim (every look costs a reaction); hit as soon as we are falling.
  if (mem.critAt != null) {
    if (Date.now() - mem.critAt > 120 && (bot.entity.velocity.y < 0.02 || Date.now() - mem.critAt > 480)) {
      bot.setControlState('sprint', false);
      try { await bot.attack(foe); mem.hit = Date.now(); log('crit at', foe.username, d.toFixed(1)); } catch { /* out of reach now */ }
      mem.critAt = null;
    }
    return;
  }

  await holdWeapon(bot);
  await bot.lookAt(foe.position.offset(0, 1.5, 0));

  const dx = foe.position.x - p.x, dz = foe.position.z - p.z, len = Math.hypot(dx, dz) || 1;
  const toward = (k) => p.offset((dx / len) * k, -0.5, (dz / len) * k).floored();
  const under = feetCell(bot);
  const ground = solidAround(bot, under);
  const narrow = ground < 6;
  const forwardSafe = solid(bot, toward(0.9)) && (narrow ? solid(bot, toward(0.2)) : solid(bot, toward(1.7)));
  const side = new Vec3(-dz / len, 0, dx / len);
  const sideCell = (k) => p.offset(side.x * k, -0.5, side.z * k).floored();
  const sideSafe = solid(bot, sideCell(0.9)) && solid(bot, sideCell(1.5));

  // The enemy's footing: solid behind them means a crit; air behind them means a sprint hit can end it.
  const foeUnder = foe.position.offset(0, -0.5, 0).floored();
  const beyond = new Vec3(Math.floor(foe.position.x + (dx / len) * 1.6), foeUnder.y, Math.floor(foe.position.z + (dz / len) * 1.6));
  const foeEdge = !solid(bot, beyond) || !solid(bot, foeUnder);
  const foeNarrow = solidAround(bot, foeUnder) <= 3;

  // Snowball/egg at an enemy strung out on a narrow bridge: no damage, but it can end the round.
  if (d > 5 && d < 16 && foeNarrow && Date.now() - (mem.throwAt || 0) > 2500) {
    const proj = items(bot).find((it) => THROWABLE.test(it.name));
    if (proj) {
      try {
        await bot.equip(proj, 'hand');
        await bot.lookAt(foe.position.offset(0, 1.2, 0));
        await bot.activateItem();
        await bot.waitForTicks(1);
        bot.deactivateItem();
        mem.throwAt = Date.now();
        log('threw', proj.name, 'at', foe.username, d.toFixed(1));
        await holdWeapon(bot);
      } catch { /* no throw this time */ }
      return;
    }
  }

  // Never trade blows with a void at my back. Knockback follows the attacker->victim line, so a hit taken at an
  // angle carries the victim toward the cell two blocks behind: if that cell is air, a single ordinary hit can
  // end the round (round 2 SkyWars: hit at 2.9 blocks from an adjacent lane, fell 21 blocks). The test that
  // matters is that cell, not the width of the lane: a one-wide lane with the lane itself behind me is safe to
  // fight on, and treating every narrow place as a ledge made round 2 Bed Wars retreat from a foe 5-8 blocks away
  // for 75 s on the stepping map, where every lane is narrow.
  const rearSafe = solid(bot, toward(-2.0));
  const ledged = !rearSafe;
  // Give ground only to a foe I cannot hit yet. At 2.6 blocks the old threshold sat inside sword reach: the
  // knockback of their hit opens the gap to about 3, every beat re-read that as "ledged, retreat", and round 3
  // was lost trading 19 retreats for 4 unanswered hits without a single swing. A hit lands at 3; between 3 and
  // 4.2 the bot closes (walk, or one block of bridge over a gap) and swings at 3.
  if (ledged && d > 4.2 && (await backOff(bot, foe))) {
    if (Date.now() - (mem.backAt || 0) > 2500) { mem.backAt = Date.now(); log('back to land'); }
    return;
  }

  const ready = Date.now() - (mem.hit || 0) >= ATTACK_MS;
  if (d <= 3 && ready) {
    if (narrow) {
      // On a one-block bridge never sprint or step forward: keep the footing and swing. No step back after the
      // swing either: at this distance it only delays the next one, and a knockback taken is not prevented by
      // leaving after it -- the top of the next beat decides with the fresh distance.
      bot.setControlState('sneak', true);
      bot.setControlState('sprint', false);
      try { await bot.attack(foe); mem.hit = Date.now(); log('swing at', foe.username, d.toFixed(1)); } catch { /* out of reach now */ }
      return;
    }
    if (foeEdge && forwardSafe) {
      // Sprint reset (W-tap): a fresh sprint adds knockback; aim it at the void behind them.
      bot.setControlState('sneak', false);
      bot.setControlState('sprint', false);
      await bot.waitForTicks(1);
      bot.setControlState('forward', true);
      bot.setControlState('sprint', true);
      try { await bot.attack(foe); mem.hit = Date.now(); log('knockback swing at', foe.username, d.toFixed(1)); } catch { /* out of reach now */ }
      await bot.waitForTicks(1);
      bot.setControlState('forward', false);
      bot.setControlState('sprint', false);
      return;
    }
    // Ground behind them: jump and hit while falling for a critical (no sprint).
    bot.setControlState('sneak', false);
    bot.setControlState('sprint', false);
    if (bot.entity.onGround) {
      bot.setControlState('jump', true);
      await bot.waitForTicks(1);
      bot.setControlState('jump', false);
      mem.critAt = Date.now();
      return;
    }
    try { await bot.attack(foe); mem.hit = Date.now(); log('swing at', foe.username, d.toFixed(1)); } catch { /* out of reach now */ }
    return;
  }

  if (d > 3) {
    if (forwardSafe) {
      bot.setControlState('sneak', narrow);
      bot.setControlState('forward', true);
      if (!narrow) bot.setControlState('sprint', true);
      await bot.waitForTicks(narrow ? 1 : 2);
      bot.setControlState('forward', false);
      bot.setControlState('sprint', false);
    } else {
      bot.clearControlStates();
      // Ground runs out between us: a bow is worth more than a bridge built toward them (the shots land; the
      // bridge would put me on a half-built lane within their reach). With no bow, build until in reach.
      if (hasBow(bot) && d >= 6 && Date.now() - (mem.shotAt || 0) > 2500) { mem.shotAt = Date.now(); await shoot(bot, foe); }
      else if (d < 14) await bridgeTo(bot, foe.position, { stopForEnemy: false, arrive: 2.8 });
    }
    return;
  }

  // In range, waiting for the cooldown: circle onto solid ground only, to change the knockback angle.
  bot.setControlState('sneak', narrow);
  bot.setControlState('sprint', false);
  if (!narrow && sideSafe && Date.now() - (mem.strafeAt || 0) > 450) {
    mem.strafeDir = -(mem.strafeDir || 1);
    mem.strafeAt = Date.now();
  }
  if (!narrow && sideSafe) {
    bot.setControlState(mem.strafeDir > 0 ? 'left' : 'right', true);
    await bot.waitForTicks(1);
    bot.setControlState('left', false);
    bot.setControlState('right', false);
  } else await bot.waitForTicks(1);
}

/**
 * The first beat of every main loop: answer what just happened to me before any plan.
 * - hit while on a narrow bridge by someone I cannot reach: walk back to the last wide ground (a knockback on a
 *   lane is how a round gets lost); within sword reach, fight() gives ground itself.
 * - a player only heard within 10: turn to it, so the next beat can see it (what the bot sees is what it faces).
 * - a player in sight within 6: fight.
 * - a player in sight within 25 with a bow and arrows: shoot.
 * - hit by someone I can neither see nor hear (an arrow from behind a wall): turn right round and look.
 * Returns true when it did something, so the caller can skip its plan this beat.
 */
async function reactToThreat(bot, mem) {
  const under = feetCell(bot), ground = solidAround(bot, under);
  if (ground >= 6) awareness.lastLand = under;      // the ground to retreat to from a bridge
  const p = bot.entity.position;
  const hit = Date.now() - awareness.hurtAt < 1200;
  const foe = enemy(bot, { heard: true });
  if (foe) awareness.threatAt = Date.now();
  const d = foe ? p.distanceTo(foe.position) : Infinity;
  if (!(hit || (foe && (d <= 10 || (!foe.heard && d <= 25 && hasBow(bot)))))) return false;

  if (hit && ground < 6 && awareness.lastLand && d > 4) {
    log('hit on a bridge: back to land');
    await walkTo(bot, awareness.lastLand.offset(0.5, 1, 0.5), 1, 5000, { interrupt: false });
    return true;
  }
  if (!foe) {
    bot.setControlState('sneak', true);
    try { await bot.look((bot.entity.yaw + Math.PI) % (Math.PI * 2), -0.2); } catch { /* next beat */ }
    return true;
  }
  if (foe.heard) {
    // The position of a heard player is rough, but one this close whose hit I have just taken is already the
    // fight: turning to look at it costs the beat in which the next hit lands (round 3 was hit four times while
    // answering with looks). Further out, or unhurt, the look is the cheaper answer.
    if (hit && d <= 4.5) { await fight(bot, foe, mem); return true; }
    try { await bot.lookAt(foe.position.offset(0, 1.5, 0)); } catch { /* next beat */ }
    return true;
  }
  if (d <= 6) { await fight(bot, foe, mem); return true; }
  if (d <= 25 && Date.now() - (mem.shotAt || 0) > 2500 && (await shoot(bot, foe))) { mem.shotAt = Date.now(); return true; }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------------
// The planner: which macro move next. A small Monte Carlo tree search over an abstract model of the round.
// What it knows goes into the model: gear, health, blocks, apples, refills, the gaps measured from the blocks,
// the beds and cover read from the world, the clock, and what has been seen of the other player. The measured
// bridge rate (noteBridge) keeps its travel estimates honest.

/** A player's fighting strength: armour points worn, weapon damage, health, golden apples. */
function powerOf({ armour = 0, weapon = 1, hp = 20, apples = 0 }) { return armour * 0.9 + weapon * 1.6 + hp * 0.25 + apples * 2; }

const ARMOUR_POINTS = { helmet: [1, 2, 2, 2, 3, 3], chestplate: [3, 5, 5, 6, 8, 8], leggings: [2, 3, 4, 5, 6, 6], boots: [1, 1, 1, 2, 3, 3] };
const TIER_INDEX = { leather: 0, golden: 1, chainmail: 2, iron: 3, diamond: 4, netherite: 5 };

function armourPoints(names) {
  let p = 0;
  for (const n of names) {
    if (!n) continue;
    const [tier, piece] = [n.split('_')[0], n.split('_').slice(1).join('_')];
    const row = ARMOUR_POINTS[piece];
    if (row && TIER_INDEX[tier] != null) p += row[TIER_INDEX[tier]];
  }
  return p;
}

/** A seeded-enough random number source, so a search can be replayed from its log if needed. */
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/**
 * The search: UCT over my next two moves, rollouts after. Returns each first move's visits and mean value.
 * Spread over awaits so no step uses more than a few ms of CPU.
 */
async function search(root, model, persona, { iterations = 900, horizon = 150, seed = Date.now() } = {}) {
  const r = rng(seed);
  const nodes = new Map();
  const legalAt = (prefix) => model.legal(root, prefix);
  const rollout = (state, plan, rr, p, h) => model.rollout(state, plan, rr, p, h);
  const firstMoves = legalAt([]);
  if (!firstMoves.length) return [];
  const seconds = new Map(firstMoves.map((m) => [m, legalAt([m])]));
  const stat = (k) => nodes.get(k) || nodes.set(k, { n: 0, w: 0 }).get(k);
  const uct = (parent, child) => (child.n === 0 ? Infinity : child.w / child.n + persona.explore * Math.sqrt(Math.log(parent.n + 1) / child.n));
  const rootStat = stat('');
  // Give every first move a floor of playouts before UCT takes over. One unlucky early rollout (a -1 loss)
  // must not lock out the only sensible move for the whole search; it did exactly that at spawn in round 1.
  const MIN_VISITS = 20;
  for (let it = 0; it < iterations; it++) {
    const thin = firstMoves.find((m) => stat(m).n < MIN_VISITS);
    const m1 = thin || firstMoves.reduce((a, b) => (uct(rootStat, stat(b)) > uct(rootStat, stat(a)) ? b : a));
    const s1 = stat(m1);
    const opts2 = seconds.get(m1);
    const m2 = opts2.length ? opts2.reduce((a, b) => (uct(s1, stat(`${m1},${b}`)) > uct(s1, stat(`${m1},${a}`)) ? b : a)) : null;
    const value = rollout(root, m2 ? [m1, m2] : [m1], r, persona, horizon);
    rootStat.n++; s1.n++; s1.w += value;
    if (m2) { const s2 = stat(`${m1},${m2}`); s2.n++; s2.w += value; }
    // Yield by count, not by wall clock: the arena counts CPU time between awaits, and a clock that does not
    // advance while the program computes (as in the check and at some points in play) never triggers a yield.
    // The round-2 Bed Wars restarts (four >50 ms stalls) all happened inside one search with 'wait' the only move.
    // Eight iterations per slice, not sixteen: a slice has to fit in 50 ms on the arena's machine, not on the
    // check's, and no plan needs the extra speed (round 3 SkyWars stalled twice inside a 5 s fight).
    if (it % 8 === 7) await sleep(0);
  }
  return firstMoves.map((m) => ({ move: m, n: stat(m).n, mean: stat(m).w / Math.max(1, stat(m).n) }));
}

/** Choose from the search: more visits, more likely; the temperature sets how loosely. */
function choose(results, persona, r = Math.random) {
  const weights = results.map((x) => Math.pow(x.n + 1, 1 / persona.temperature) * (persona.bias[x.move] || 1));
  let total = weights.reduce((a, b) => a + b, 0), x = r() * total;
  for (let i = 0; i < results.length; i++) if ((x -= weights[i]) <= 0) return results[i].move;
  return results[0].move;
}

/** A personality, drawn once per match. Kept milder than the house bot's: a wrong move costs more than variety. */
function newPersona(biasFor = () => ({}), r = Math.random) {
  const greed = 0.8 + r() * 0.4, aggression = 0.8 + r() * 0.4;
  return {
    temperature: 0.5 + r() * 0.35,
    explore: 0.25 + r() * 0.25,
    nerve: (aggression - 1) * 1.5,
    bias: biasFor(greed, aggression),
    greed, aggression,
  };
}

/** Void columns at ground level on the straight way from a to b (island ground and any bridge count as land). */
function gapBetween(bot, a, b) {
  const y = Math.floor(Math.min(a.y, b.y)) - 1, d = Math.hypot(b.x - a.x, b.z - a.z);
  if (d < 0.01) return 0;
  const seen = new Set();
  let air = 0;
  // One sample per block, not two: on the wide maps this scan is the only expensive thing between awaits
  // (a 120-block base-to-base line at 0.5 was the 50 ms strategy_error in round 1 of Bed Wars).
  for (let t = 0; t <= d; t += 1.0) {
    const x = Math.floor(a.x + ((b.x - a.x) * t) / d), z = Math.floor(a.z + ((b.z - a.z) * t) / d), k = `${x},${z}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (!solid(bot, new Vec3(x, y, z))) air++;
  }
  return air;
}

/** What I know of the other player: last seen where and when, wearing and holding what, moving how. */
function trackFoe(bot, mem) {
  const foe = enemy(bot);
  if (!foe) return;
  const now = Date.now(), prev = mem.foe;
  let vx = 0, vz = 0;
  if (prev && prev.ms && now > prev.ms && now - prev.ms < 1200) {
    const dt = (now - prev.ms) / 1000;
    vx = clamp((foe.position.x - prev.x) / dt, -8, 8);
    vz = clamp((foe.position.z - prev.z) / dt, -8, 8);
  }
  const eq = [].concat(foe.equipment || []).map((e) => (e && (e.name || e)) || null).filter((n) => typeof n === 'string');
  mem.foe = {
    x: foe.position.x, y: foe.position.y, z: foe.position.z, t: bot.arena.time, ms: now, vx, vz,
    armour: eq.length ? armourPoints(eq) : mem.foe?.armour ?? null,
    weapon: foe.heldItem ? SWORD[foe.heldItem.name] ?? AXE[foe.heldItem.name] ?? 1 : mem.foe?.weapon ?? null,
    blocks: isBlock(foe.heldItem), sneaking: !!foe.sneaking,
  };
}
