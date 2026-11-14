// SkyWars for a five-player free-for-all on maps the bot has never seen (Opus). It reads the map from the view every
// tick -- the chests and their rings, the spawns, the players' live positions -- and never assumes a layout.
//
// 1. Survive the moment: a foe in reach, or one who just hit me, is fought; two on me while low, back off and heal.
// 2. Third party: two foes fighting each other near me are left to it -- I keep out of reach on wide ground and shoot
//    or throw at them -- and when one goes down, the survivor (hurt) is attacked at once.
// 3. A foe walking up to me is fought (from wide ground, the fight's bridge defence).
// 4. Loot: my island's chests first, then the best chest by value / cost (the middle > connector islands > empty
//    islands; the void to bridge and the climb as cost; chests with a foe beside them skipped). After a refill, again.
// 5. Hunt: a duel at once; in a crowd from 4:30 when geared and healthy, from 6:30 regardless -- the cheapest, weakest
//    target by its live position.
// 6. Otherwise hold wide ground, facing the nearest foe, shooting at anyone on a bridge.
import { objectivesOf, placeOf } from '../../skills/view.mjs';
import { WEAPON_DAMAGE } from '../../../../../../../packages/blockyland-mcp/guestPeer.js';

const flat = (a, x, z) => Math.hypot((x ?? 0) - a.x, (z ?? 0) - a.z);
const ARMOR = {
  leather_helmet: 1, golden_helmet: 2, chainmail_helmet: 2, iron_helmet: 2, diamond_helmet: 3, netherite_helmet: 3,
  leather_chestplate: 3, golden_chestplate: 5, chainmail_chestplate: 5, iron_chestplate: 6, diamond_chestplate: 8, netherite_chestplate: 8,
  leather_leggings: 2, golden_leggings: 3, chainmail_leggings: 4, iron_leggings: 5, diamond_leggings: 6, netherite_leggings: 6,
  leather_boots: 1, golden_boots: 1, chainmail_boots: 1, iron_boots: 2, diamond_boots: 3, netherite_boots: 3,
};

/** A foe's strength as I can see it: the armour they wear and the weapon in their hand. */
function foeGear(f) {
  let a = 0;
  for (const piece of Array.isArray(f.armor) ? f.armor : []) if (piece?.id) a += ARMOR[piece.id] ?? 0;
  const w = WEAPON_DAMAGE[f.activeItem] ?? 1;
  return { armor: a, weapon: w, score: a + 2 * w };
}

const chestKey = (c) => `${c.at[0]},${c.at[1]},${c.at[2]}`;

function memory(skills) {
  let m = skills.flag('opusMem');
  if (!m) {
    m = { lastAlive: null, cleanupUntil: 0, blacklist: new Map(), fails: new Map(), target: null, lastPos: null, still: 0, thirdSince: null, holdUntil: 0 };
    skills.setFlag('opusMem', m);
  }
  return m;
}

/** Note progress toward a far goal; after several still ticks, blacklist it and get unstuck. True when stuck. */
async function noteProgress(skills, mem, key, far) {
  const p = skills.position();
  if (mem.target !== key) { mem.target = key; mem.still = 0; mem.lastPos = p; return false; }
  const moved = mem.lastPos ? Math.hypot(p.x - mem.lastPos.x, p.y - mem.lastPos.y, p.z - mem.lastPos.z) : 1;
  mem.lastPos = p;
  if (moved < 0.25 && far) mem.still++; else mem.still = Math.max(0, mem.still - 1);
  if (mem.still >= 5) {
    mem.still = 0;
    mem.blacklist.set(key, Date.now() + 25000);
    await skills.unstick();
    return true;
  }
  return false;
}

/**
 * The nearest cell within 5 blocks, at my height, with ground on all eight sides (and level ground two further on the
 * side away from the foe): somewhere a hit does not throw me into the void. Null when there is none.
 */
function safeSpotNear(skills, at, foe) {
  let best = null, bestD = Infinity;
  const y = at.y;
  for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
    const x = Math.floor(at.x) + dx + 0.5, z = Math.floor(at.z) + dz + 0.5, d = Math.hypot(dx, dz);
    if (d > 5 || d >= bestD) continue;
    if (!skills.islandSpot(x, y, z) || !skills.standable(x, y, z)) continue;
    // Further from the foe than they are from it would be walking into them: only spots not behind the foe.
    if (Math.hypot(x - foe.x, z - foe.z) < 2.5) continue;
    const ax = x - foe.x, az = z - foe.z, len = Math.hypot(ax, az) || 1;
    if (!skills.groundAt([x + (ax / len) * 2, y, z + (az / len) * 2])) continue;
    best = { x, z }; bestD = d;
  }
  return best;
}

/**
 * One action toward a chest and its loot, at any height: down to a chest below me (the walk refuses drops), up to one
 * above me (a pillar), else the walk (bridging if allowed) and the open. A chest I stand by and cannot open for several
 * tries is left for a while.
 */
async function goLoot(skills, mem, me, c, { bridge, summary }) {
  const cx = c.at[0] + 0.5, cz = c.at[2] + 0.5, key = chestKey(c);
  const d = flat(me.at, cx, cz), dy = c.at[1] - me.at.y;
  if (await noteProgress(skills, mem, key, d > 2)) return;
  if (d < 5 && dy <= -2.5) { if (await skills.climbDown(cx, cz)) return; }
  if (d < 3.5 && dy >= 2.5 && me.carrying.blocks > 0) { if (await skills.pillarUp()) return; }
  const r = await skills.loot(c.at, { bridge, summary });
  if (r?.ok) { mem.fails.delete(key); return; }
  if (d < 6) {
    const n = (mem.fails.get(key) ?? 0) + 1;
    mem.fails.set(key, n);
    if (n >= 7) { mem.fails.delete(key); mem.blacklist.set(key, Date.now() + 40000); }
  }
}

export async function playSkyWars({ view, skills }) {
  if (view.phase !== 'playing') { skills.resetClock('skywars'); skills.setFlag('opusMem', null); return; }
  if (!view.me.canAct) return;
  const me = view.me;
  const mem = memory(skills);
  const now = Date.now();

  skills.heal();

  const elapsed = skills.clock('skywars');
  const health = skills.health();
  const blocks = me.carrying.blocks;
  const enemies = skills.enemies().filter((e) => Number.isFinite(e.x) && Number.isFinite(e.z) && (e.y ?? 31) > -3);
  const others = view.players.filter((p) => p.id !== me.id && p.alive !== false);
  const othersAlive = others.length;
  if (mem.lastAlive !== null && othersAlive < mem.lastAlive) mem.cleanupUntil = now + 9000; // someone just fell: a hurt survivor
  mem.lastAlive = othersAlive;

  const info = enemies.map((e) => {
    const d = flat(me.at, e.x, e.z), dy = (e.y ?? 31) - me.at.y;
    const busyWith = enemies.find((o) => o.id !== e.id && Math.hypot((o.x ?? 0) - e.x, (o.y ?? 31) - (e.y ?? 31), (o.z ?? 0) - e.z) < 4.5);
    return { e, d, dy, d3: Math.hypot(d, dy), busy: Boolean(busyWith), gear: foeGear(e) };
  });
  const nearest = info[0] ?? null;
  const foeDist = nearest ? nearest.d : Infinity;
  const hurtAgo = skills.hurtAgo();
  const canHeal = skills.hasCombatHeal() || skills.hasFood();

  // --- 1. Survive the moment ------------------------------------------------------------------------------------------
  const close = info.filter((i) => i.d3 <= 5.5);
  if (close.length >= 2 && health <= 10 && canHeal && (skills.absorption() < 1)) {
    const cx = close.reduce((s, i) => s + i.e.x, 0) / close.length, cz = close.reduce((s, i) => s + i.e.z, 0) / close.length;
    const spot = skills.backOffSpot(cx, cz);
    if (spot) {
      await skills.goTo([spot.x, me.at.y, spot.z], { stopWithin: 0.4, summary: 'backing out of a crowd to heal' });
      skills.heal();
      return;
    }
  }
  if (close.length) {
    // The one I am already trading with, else the one not busy with someone else (he is coming for me), else nearest.
    const pick = close.find((i) => !i.busy) ?? close[0];
    mem.thirdSince = null;
    await skills.fight(pick.e);
    return;
  }
  if (hurtAgo < 1500 && nearest && nearest.d3 <= 10) { await skills.fight(nearest.e); return; }

  // --- 2. Third party: two foes fighting each other near me ------------------------------------------------------------
  if (nearest && nearest.busy && nearest.d <= 14 && othersAlive >= 2) {
    mem.thirdSince ??= now;
    if (now - mem.thirdSince < 14000) {
      skills.equipBattleGear();
      if (skills.drawing() || (skills.hasBow() && skills.shoot(nearest.e))) return;
      if (skills.setting('throwables') && skills.throwAtFoe(nearest.e, nearest.d)) { skills.equipBattleGear(); return; }
      if (nearest.d < 7.5) {
        const spot = skills.backOffSpot(nearest.e.x, nearest.e.z);
        if (spot) { await skills.goTo([spot.x, me.at.y, spot.z], { stopWithin: 0.4, summary: 'letting them fight' }); return; }
      }
      skills.faceToward(nearest.e.x, (nearest.e.y ?? 31) + 1.2, nearest.e.z);
      skills.say(`watching ${nearest.e.name || nearest.e.id} fight`);
      await skills.pauseStep();
      return;
    }
  } else if (!nearest || !nearest.busy) mem.thirdSince = null;

  // A fight just ended near me: the survivor is hurt -- go now.
  if (now < mem.cleanupUntil && nearest && nearest.d <= 16 && health >= 10) { await skills.fight(nearest.e); return; }

  // --- 3. A foe walking up to me ---------------------------------------------------------------------------------------
  // On narrow ground (a small island's rim, a bridge) with a foe not yet in reach: get to the inside of an island first
  // -- the knock-back off a small island is the death, not the damage.
  if (nearest && foeDist <= 10 && foeDist > 4.5 && !skills.islandSpot(me.at.x, me.at.y, me.at.z)) {
    const spot = safeSpotNear(skills, me.at, nearest.e);
    if (spot) {
      await skills.goTo([spot.x, me.at.y, spot.z], { stopWithin: 0.3, summary: 'taking the inside of the island' });
      return;
    }
  }
  if (nearest && foeDist <= 8 && Math.abs(nearest.dy) < 6) { await skills.fight(nearest.e); return; }
  if (nearest && foeDist <= 18 && skills.setting('throwables') && skills.throwAtFoe(nearest.e, foeDist)) {
    skills.equipBattleGear();
    return;
  }
  if (nearest && foeDist <= 12 && !skills.isEating() && skills.absorption() < 1 && health > 14
    && me.carrying.count('golden_apple') > 0) {
    if (skills.startEating('golden_apple')) { skills.say('eating a golden apple before the fight'); await skills.pauseStep(); return; }
  }

  // --- 4/5. Loot or hunt -----------------------------------------------------------------------------------------------
  const mySlot = me.slot;
  const spawn = mySlot !== null && mySlot !== undefined ? placeOf(view, 'spawn', { slot: mySlot }) : null;
  const home = spawn ? { x: spawn.at[0], y: spawn.at[1], z: spawn.at[2] } : { x: me.spawnPoint.x ?? 0, y: me.spawnPoint.y ?? 31, z: me.spawnPoint.z ?? 0 };
  const occupied = new Set(others.map((p) => p.slot).filter((s) => s !== null && s !== undefined));
  for (const [k, until] of mem.blacklist) if (until < now) mem.blacklist.delete(k);

  const weapon = skills.bestWeaponDamage(), armor = skills.armorPoints();
  const geared = weapon >= 5 && armor >= 4;
  const strong = geared && health >= 14;

  // Hunting: a duel at once once I have a weapon; a crowd later.
  let huntNow = false;
  if (othersAlive === 1) huntNow = weapon >= 4 || elapsed >= 120;
  else if (elapsed >= 390) huntNow = true;
  else if (elapsed >= 270 && strong) huntNow = true;

  const chests = objectivesOf(view, 'chest').filter((c) => !c.looted && !mem.blacklist.has(chestKey(c)));
  const isHome = (c) => (c.slot !== null && c.slot !== undefined && mySlot !== null && mySlot !== undefined)
    ? c.slot === mySlot
    : Math.hypot(c.at[0] + 0.5 - home.x, c.at[2] + 0.5 - home.z) <= 10;
  const homeChests = chests.filter(isHome);
  const homeDist = flat(me.at, home.x, home.z);

  // My island's chests, first -- while I am on (or by) my island.
  if (homeChests.length && homeDist <= 14 && !huntNow) {
    const c = [...homeChests].sort((a, b) => flat(me.at, a.at[0] + 0.5, a.at[2] + 0.5) - flat(me.at, b.at[0] + 0.5, b.at[2] + 0.5))[0];
    await goLoot(skills, mem, me, c, { bridge: false, summary: `looting my chest at [${c.at.join(', ')}]` });
    return;
  }

  // The rest, by value over cost.
  let best = null;
  if (!huntNow || !enemies.length) {
    let bestScore = 0;
    for (const c of chests) {
      const home_ = isHome(c);
      let value;
      if (home_) value = 1.6;
      // The middle in the first minute is where every bot meets: worth less until I am geared for it.
      else if (c.ring === 'center') value = elapsed < 60 && !geared ? 1.8 : 3;
      else if (c.ring === 'mid' || c.ring === 'sector') value = 2.2;
      else if (c.slot !== null && c.slot !== undefined && occupied.has(c.slot)) continue; // someone's island: they are there
      else value = 1.0; // an empty or a dead player's island
      const cx = c.at[0] + 0.5, cz = c.at[2] + 0.5;
      const d = flat(me.at, cx, cz);
      const vc = d > 2 ? skills.voidCellsToward(cx, cz) : 0;
      if (vc > 0 && blocks < vc + 3) continue;
      const climb = Math.abs(c.at[1] - me.at.y);
      // A foe beside the chest: a fight on their ground. Foes near it: a risk.
      let danger = 0, tooHot = false;
      for (const i of info) {
        const fd = Math.hypot(i.e.x - cx, i.e.z - cz);
        if (fd < 8 && d > 4) tooHot = true;
        else if (fd < 16) danger += 15;
      }
      if (tooHot) continue;
      const cost = d + 2.5 * vc + 2 * climb + danger + 4;
      const score = value / cost;
      if (score > bestScore) { bestScore = score; best = { c, d, vc }; }
    }
    // Far-away low-value chests are not worth a trip late on, when the fights decide the game.
    if (best && !(elapsed > 330 && best.c.ring !== 'center' && best.d > 25)) {
      const c = best.c;
      await goLoot(skills, mem, me, c, { bridge: blocks > 0, summary: `looting ${c.ring ?? 'a'} chest at [${c.at.join(', ')}]` });
      return;
    }
  }

  // Hunting: the cheapest, weakest target, by where they are now.
  if ((huntNow || (!best && elapsed >= 200 && strong)) && info.length) {
    let tgt = null, tScore = Infinity;
    for (const i of info) {
      const vc = i.d > 2 ? skills.voidCellsToward(i.e.x, i.e.z) : 0;
      if (vc > 0 && blocks < vc + 2) continue;
      const narrow = !skills.wideAt(i.e.x, i.e.y ?? 31, i.e.z);
      const s = i.d + 1.5 * vc + 2 * Math.abs(i.dy) + 1.5 * i.gear.score - (narrow ? 4 : 0) - (i.busy ? 3 : 0);
      if (s < tScore) { tScore = s; tgt = i; }
    }
    if (tgt) {
      if (tgt.d <= 9) { await skills.fight(tgt.e); return; }
      const key = `hunt:${tgt.e.id}`;
      if (await noteProgress(skills, mem, key, true)) return;
      if (skills.hasBow() && tgt.d <= 30 && (skills.drawing() || skills.shoot(tgt.e))) return;
      await skills.goTo([tgt.e.x, me.at.y, tgt.e.z], { bridge: blocks > 0, stopWithin: 3, summary: `hunting ${tgt.e.name || tgt.e.id}` });
      return;
    }
  }
  // Hunting with nobody in sight: where a live player started.
  if (huntNow && !info.length) {
    let place = null, pd = Infinity;
    for (const p of others) {
      const sp = p.slot !== null && p.slot !== undefined ? placeOf(view, 'spawn', { slot: p.slot }) : null;
      if (!sp) continue;
      const d = flat(me.at, sp.at[0], sp.at[2]);
      if (d < pd) { pd = d; place = sp; }
    }
    if (place && pd > 3 && !(await noteProgress(skills, mem, `place:${place.id}`, true))) {
      await skills.goTo([place.at[0], place.at[1], place.at[2]], { bridge: blocks > 0, stopWithin: 2, summary: 'hunting from their island' });
      return;
    }
  }

  // --- 6. Hold wide ground ---------------------------------------------------------------------------------------------
  if (nearest && skills.hasBow() && nearest.d >= 12 && nearest.d <= 30 && (skills.drawing() || skills.shoot(nearest.e))) return;
  if (!skills.wideAt(me.at.x, me.at.y, me.at.z)) {
    // Back to land: my island (or the middle, if that is where the ground is and it is nearer).
    const mid = placeOf(view, 'middle');
    const midGround = mid && skills.groundAt([mid.at[0], mid.at[1], mid.at[2]]);
    const goal = midGround && flat(me.at, mid.at[0], mid.at[2]) < homeDist ? { x: mid.at[0], y: mid.at[1], z: mid.at[2] } : home;
    if (!(await noteProgress(skills, mem, 'hold', true))) {
      await skills.goTo([goal.x, goal.y, goal.z], { bridge: blocks > 0, stopWithin: 2, summary: 'back to wide ground' });
    }
    return;
  }
  if (nearest) skills.faceToward(nearest.e.x, (nearest.e.y ?? 31) + 1.2, nearest.e.z);
  skills.say('holding wide ground');
  await skills.pauseStep();
}
