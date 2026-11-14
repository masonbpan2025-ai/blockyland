// SkyWars playbook for a five-player free-for-all on a map the bot has never seen.
//
// The map is read from what the round reports: every chest carries its island (`slot` for a spawn,
// `ring` 'center' for a middle chest, 'mid' for connector/sector/sub-mid chests), and `places`
// carries the middle and all spawns. No template is assumed.
//
// Each tick, in order:
//   1. A fight I am in comes first (a foe inside 6; or 12 when it is hurt or I out-gear it on ground
//      I can stand on).
//   2. A foe on narrow ground within a throw's range: one clean hit there is a fall.
//   3. An apple down before a melee I can see coming.
//   4. Loot, in this order:
//        - every chest on my spawn island (it holds all the block stacks I will need);
//        - the cheapest crossing among the middle/connector chests, so a far middle is reached
//          through the connector islands that hold blocks, not in one long bridge;
//        - another spawn's chests when strong, when few are left, or late.
//      A chest across the void is only attempted with `voidCellsToward + reserve` blocks, so the
//      bot never arrives at the far side with an empty hand and never tries a bridge it cannot
//      finish. One chest is committed to for up to 35 s; a marginal recount does not flip it.
//   5. Nothing left to loot: hunt the best foe visible (wounded first, then nearest) only when its
//      ground is walkable or the crossing is affordable; otherwise hunt the nearest other spawn;
//      otherwise fall back to solid ground instead of standing at the tip of a one-wide bridge.
//
// This replaces the two-player scripted order (home -> middle -> "the other player") with a
// free-for-all one: it values kills, wounded targets, a route through connector islands, and never
// bridging into a contested middle or overreaching its block budget.
import { objectivesOf, placeOf } from '../../skills/view.mjs';

const flat = (me, x, z) => Math.hypot((x ?? 0) - me.at.x, (z ?? 0) - me.at.z);
const chestKey = (c) => `${c.at[0]},${c.at[1]},${c.at[2]}`;
const isHome = (c, slot) => slot !== null && slot !== undefined && c.slot !== null && c.slot !== undefined && c.slot === slot;
const isMiddle = (c) => c.ring === 'center' || c.ring === 'mid' || c.ring === 'sector';

/** The foe to swing at now: the nearest is the one already hitting me. */
function nearestFoe(enemies, me) {
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    if (e.alive === false || e.dead) continue;
    const d = flat(me, e.x, e.z);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best ? { foe: best, d: bestD } : { foe: null, d: Infinity };
}

/** The foe worth chasing: a wounded one nearby is a placement; otherwise the nearest. */
function bestFoe(enemies, me) {
  let best = null, bestScore = Infinity;
  for (const e of enemies) {
    if (e.alive === false || e.dead) continue;
    const d = flat(me, e.x, e.z);
    const hp = Number.isFinite(e.health) ? e.health : 20;
    const score = d + (hp <= 8 ? -10 : hp <= 14 ? -4 : 0);
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}

/** Where another player started (their island), nearest first: the fallback for a hidden foe. */
function enemyPlace(view) {
  const me = view.me;
  let best = null, bestD = Infinity;
  for (const q of view.players) {
    if (q.id === me.id || q.slot === me.slot || q.alive === false) continue;
    if (q.slot === null || q.slot === undefined) continue;
    const sp = placeOf(view, 'spawn', { slot: q.slot });
    if (!sp) continue;
    const d = flat(me, sp.at[0], sp.at[2]);
    if (d < bestD) { bestD = d; best = { x: sp.at[0], y: sp.at[1], z: sp.at[2], name: q.name || q.id }; }
  }
  return best;
}

/**
 * The blocks a crossing needs beyond the void cells on the line. A one-wide bridge laid diagonally
 * also fills a corner block each step, and I must not arrive at the far side with an empty hand:
 * that is how practice 2 ended, stranded four blocks short of the middle.
 */
const reserveFor = (need) => Math.max(6, Math.ceil(need * 0.4));

/**
 * Can I take this chest now? A chest with no void on the straight line at my foot level is on my
 * island and is always reachable; across the void I need the crossing's blocks plus the reserve.
 * A chest marked unreachable recently (a failed loot, typically a tower or a wall) is skipped, so
 * the bot does not stand under it for the rest of the round.
 */
function reachable(skills, me, c, blocks, bad, elapsed, margin = null) {
  const k = chestKey(c);
  const marked = bad instanceof Map ? bad.get(k) : undefined;
  if (marked !== undefined && elapsed - marked < 45) return false;
  const need = skills.voidCellsToward(c.at[0] + 0.5, c.at[2] + 0.5);
  if (need === 0) return true;
  return blocks >= need + (margin === null ? reserveFor(need) : margin);
}

/** Can I put my feet on the ground under (x, z) without laying a block? */
const onFoot = (skills, x, z) => skills.voidCellsToward(x, z) === 0;

/**
 * The cheapest crossing among the reachable middle chests. On a map with connector islands the
 * connector chest on my side is nearer in blocks than the middle, so the route is spawn -> connector
 * -> middle and each hop refills the block supply from the chest it reaches.
 */
function cheapest(skills, me, list) {
  let best = null, bestScore = Infinity;
  for (const c of list) {
    const need = skills.voidCellsToward(c.at[0] + 0.5, c.at[2] + 0.5);
    const score = need + flat(me, c.at[0] + 0.5, c.at[2] + 0.5) * 0.05;
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best;
}

const nearestOf = (list, me) => [...list].sort((a, b) =>
  flat(me, a.at[0] + 0.5, a.at[2] + 0.5) - flat(me, b.at[0] + 0.5, b.at[2] + 0.5))[0];

/** Marks of failed chest attempts this round (a Map key -> seconds, expiring). */
function badChests(skills) {
  let bad = skills.flag('skyBadChests');
  if (!(bad instanceof Map)) { bad = new Map(); skills.setFlag('skyBadChests', bad); }
  return bad;
}

/** Wide ground where I stand: at least 6 of the 9 cells round me have a floor (an island, not a bridge). */
function wideHere(skills, me) {
  let n = 0;
  for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
    if (skills.groundAt([me.at.x + ox, me.at.y, me.at.z + oz])) n++;
  }
  return n >= 6;
}

export async function playSkyWars({ view, skills }) {
  if (view.phase !== 'playing') {
    skills.resetClock('skywars');
    skills.setFlag('skyBadChests', new Map());
    skills.setFlag('skyChestTarget', null);
    skills.setFlag('skyLastWide', null);
    return;
  }
  if (!view.me.canAct) return;
  const me = view.me;
  const mySlot = me.slot;
  if (wideHere(skills, me)) skills.setFlag('skyLastWide', { x: me.at.x, y: me.at.y, z: me.at.z });

  skills.heal();

  const elapsed = skills.clock('skywars');
  const enemies = skills.enemies();
  const { foe, d: foeDist } = nearestFoe(enemies, me);
  const blocks = me.carrying.blocks;
  const armed = skills.bestWeaponDamage() >= 5;
  const armour = skills.armorPieces();
  const strong = skills.bestWeaponDamage() >= 6 && armour >= 2 && skills.health() >= 14;
  const alive = view.players.filter((p) => p.alive !== false && p.slot !== null).length;
  const foeOnFoot = foe ? onFoot(skills, foe.x ?? 0, foe.z ?? 0) : false;
  const foeFair = foe && (foeOnFoot || blocks >= skills.voidCellsToward(foe.x ?? 0, foe.z ?? 0) + 4);

  // 1. The fight I am in comes first. Inside 6 blocks there is no choice; at 6-12 only when the foe
  //    is hurt (a kill and a placement) or I clearly out-gear it and can actually get to it.
  if (foe && (foeDist <= 6 || (foeDist <= 12 && ((foe.health ?? 20) <= 12 || (strong && foeFair))))) {
    await skills.fight(foe, { summary: `fighting ${foe.name || foe.id}` });
    return;
  }
  // 2. A foe on narrow ground within a throw's range: one clean hit there is a fall.
  if (foe && foeDist <= 18 && skills.setting('throwables') && skills.throwAtFoe(foe, foeDist)) {
    skills.equipBattleGear();
    return;
  }
  // 3. An apple down before a melee I can see coming, with the foe 9-12 blocks out and closing.
  if (foe && foeDist <= 12 && !skills.isEating() && skills.absorption() < 1 && skills.health() > 14
    && me.carrying.count('golden_apple') > 0) {
    if (skills.startEating('golden_apple')) {
      skills.say('eating a golden apple before the fight');
      await skills.pauseStep();
      return;
    }
  }

  // 4. Loot what I can reach, in the order that buys the crossing and then the winning gear.
  const bad = badChests(skills);
  const unlooted = objectivesOf(view, 'chest').filter((c) => !c.looted);
  const homeChests = unlooted.filter((c) => isHome(c, mySlot));
  const midChests = unlooted.filter((c) => !isHome(c, mySlot) && isMiddle(c));
  const otherChests = unlooted.filter((c) => !isHome(c, mySlot) && !isMiddle(c) && c.slot !== null && c.slot !== undefined);

  const mySpawn = mySlot !== null && mySlot !== undefined ? placeOf(view, 'spawn', { slot: mySlot }) : null;
  const onHome = mySpawn ? flat(me, mySpawn.at[0], mySpawn.at[2]) < 8 : false;
  const homeNow = homeChests.filter((c) => reachable(skills, me, c, blocks, bad, elapsed, 0));
  const midNow = midChests.filter((c) => reachable(skills, me, c, blocks, bad, elapsed));
  const otherNow = otherChests.filter((c) => reachable(skills, me, c, blocks, bad, elapsed));
  // A crossing with the reserve is the safe plan. If none is affordable, the cheapest crossing
  // with only the void cells themselves (plus one block) is still worth taking: every middle and
  // connector chest holds a block stack, so reaching it refills the supply. Standing on the spawn
  // with blocks in hand while nothing is "safe enough" is how a game is lost without being hit.
  const midRaw = midChests.filter((c) => reachable(skills, me, c, blocks, bad, elapsed, 1));
  // Finish my own island before crossing: it holds every block stack I will need, and a chest left
  // behind is a crossing I cannot finish.
  const homeFirst = onHome && homeNow.length > 0;

  // Commit to one chest until it is looted, unreachable or stale. Re-picking the "nearest" every
  // 300 ms tick made the bot pace between two islands' chests and never reach either.
  const all = objectivesOf(view, 'chest');
  let target = null;
  const was = skills.flag('skyChestTarget');
  if (was && typeof was === 'object' && !homeFirst) {
    const c = all.find((x) => !x.looted && chestKey(x) === was.key);
    // While committed, only the hard limit drops the target: a recount of the void as I take one
    // step must not make the bot change its mind and spend its blocks on a different island.
    if (c && elapsed - was.since < 35 && skills.voidCellsToward(c.at[0] + 0.5, c.at[2] + 0.5) <= blocks) target = c;
    else skills.setFlag('skyChestTarget', null);
  }
  if (!target) {
    if (homeFirst) target = nearestOf(homeNow, me);
    else if (midNow.length) target = cheapest(skills, me, midNow);
    else if (homeNow.length && blocks < 8) target = nearestOf(homeNow, me);
    // Other players' spawn chests are contested and far: only when strong, late, or few are left.
    else if (otherNow.length && (alive <= 2 || elapsed >= 150 || strong)) target = nearestOf(otherNow, me);
    // Nothing safe: take the cheapest crossing I can just barely afford.
    else if (midRaw.length) target = cheapest(skills, me, midRaw);
    if (target) skills.setFlag('skyChestTarget', { key: chestKey(target), since: elapsed });
  }

  if (target) {
    const k = chestKey(target);
    const need = skills.voidCellsToward(target.at[0] + 0.5, target.at[2] + 0.5);
    const across = need > 0;
    // Never start a bridge with a foe inside 10 blocks: deal with the foe first.
    if (across && foe && foeDist <= 10) {
      await skills.fight(foe, { summary: `meeting ${foe.name || foe.id} before the bridge` });
      return;
    }
    const r = await skills.loot(target.at, {
      bridge: across,
      summary: `looting ${isHome(target, mySlot) ? 'my' : isMiddle(target) ? 'the middle' : 'another spawn'}'s chest at [${target.at.join(', ')}] (${blocks} blocks)`,
    });
    if (r && r.ok === false) { // a tower, a wall, a chest out of reach: try another
      bad.set(k, elapsed);
      skills.setFlag('skyChestTarget', null);
    }
    return;
  }

  // 5. Nothing left to loot anywhere reachable: hunt, but only across ground I can afford to take.
  const chase = bestFoe(enemies, me);
  if (chase) {
    const x = chase.x ?? 0, y = chase.y ?? 31, z = chase.z ?? 0;
    const need = skills.voidCellsToward(x, z);
    if (need === 0 || blocks >= need + 4) {
      await skills.goTo([x, y, z], { bridge: need > 0, stopWithin: 2.2, summary: `hunting ${chase.name || chase.id}` });
      return;
    }
  }
  const place = enemyPlace(view);
  if (place) {
    const need = skills.voidCellsToward(place.x, place.z);
    if (need === 0 || blocks >= need + 4) {
      await skills.goTo([place.x, place.y, place.z], { bridge: need > 0, stopWithin: 2.2, summary: `hunting from ${place.name}'s island` });
      return;
    }
  }
  // Nothing I can afford to cross and nothing left to loot here: get back to solid ground. A bot
  // that stands at the tip of a one-wide bridge is a snowball away from the void.
  const land = mySpawn ? { x: mySpawn.at[0], y: mySpawn.at[1], z: mySpawn.at[2] } : skills.flag('skyLastWide');
  if (blocks < 8 && land && typeof land === 'object' && flat(me, land.x, land.z) > 2.5) {
    await skills.goTo([land.x, land.y, land.z], { bridge: false, stopWithin: 2.2, summary: 'falling back to solid ground' });
    return;
  }
  // Stay put on wide ground: waiting with a full hand is better than walking off the edge.
}
