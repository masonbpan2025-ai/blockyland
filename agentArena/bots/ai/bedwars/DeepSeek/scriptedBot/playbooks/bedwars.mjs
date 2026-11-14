// Bed Wars on a five-team map: gear at home, then take and hold the middle -- the only ground still inside the
// closing zone at 9:00. See notes/plan.md for the reasoning. The short version:
//
//  - Every bed is destroyed by the clock at 60% of the limit, and the zone starts closing at that same instant. A
//    bed rush therefore buys almost nothing in this mode; the game is decided on the middle island.
//  - So all four of us farm the forge at home until the gear is complete (wool for the whole crossing, a stone
//    sword, chainmail, an iron sword, golden apples), then cross together at one clock threshold and stand on the
//    middle before the zone starts. Nothing pulls us off it afterwards: fights are taken only close by, or on a
//    foe who is himself inside the circle.
//  - The crossing is aimed at the middle island's rim, found by probing the blocks, not at its centre: when the
//    middle stands above the bases (High Middle, Archipelago) the walk stairs up the last blocks and we pillar the
//    rest, one block a tick, so the island's cliff can never strand us.
//
// What a playbook is still allowed to do is unchanged: read the general view, act through skills, one action a tick.
import { objectivesOf } from '../../skills/view.mjs';

const near = (me, x, z) => Math.hypot((x ?? 0) - me.at.x, (z ?? 0) - me.at.z);

/** My job on the team: the members still in the game (alive, or respawning), in name order, share them out. */
export function teamRole(view) {
  const me = view.me;
  const mates = (view.players ?? []).filter((p) => p.team && p.team === me.team && (p.alive || (p.respawnIn !== null && p.respawnIn !== undefined)) || p.id === me.id)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (mates.length <= 1) return 'solo';
  const rank = Math.max(0, mates.findIndex((p) => p.id === me.id));
  if (rank === 0) return 'anchorman';
  if (mates.length >= 3 && rank === 1) return 'collector';
  return 'rusher';
}

/** The other rushers of my team (their ids), by the same order teamRole shares the jobs out. */
export function rushPartners(view) {
  const me = view.me;
  const mates = (view.players ?? []).filter((p) => p.team && p.team === me.team && (p.alive || (p.respawnIn !== null && p.respawnIn !== undefined)) || p.id === me.id)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const first = mates.length >= 3 ? 2 : 1;
  return mates.slice(first).filter((p) => p.id !== me.id).map((p) => p.id);
}

/**
 * The way round to a bed: a diamond island off the middle that is not much out of the way. Kept from the duel
 * playbook (unused by the five-team plan, but a useful measure of whether a detour is worth it).
 */
export function flankVia(gens, from, to, { detour = 1.4, middle = 13 } = {}) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const straight = d(from, to);
  let best = null;
  for (const g of gens) {
    const at = { x: g.at[0], z: g.at[2] };
    if (Math.hypot(at.x, at.z) < middle) continue;
    const way = d(from, at) + d(at, to);
    if (way <= straight * detour && (!best || way < best.way)) best = { id: g.id, x: at.x, y: g.at[1], z: at.z, way };
  }
  return best;
}

/** The cells that cover a bed in one layer: on top of both halves and all round them at its level. */
export function bedCover(foot, head) {
  const halves = [foot, head], isBed = (x, y, z) => halves.some((h) => h[0] === x && h[1] === y && h[2] === z);
  const out = [];
  for (const [x, y, z] of halves) for (const [dx, dy, dz] of [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
    const c = [x + dx, y + dy, z + dz];
    if (!isBed(...c) && !out.some((o) => o[0] === c[0] && o[1] === c[1] && o[2] === c[2])) out.push(c);
  }
  return out;
}

/** The middle island: centre, the height a player stands at there, and its radius. Always at the world origin. */
function middleOf(view, skills) {
  const m = skills.arenaMiddle?.();
  if (m && Number.isFinite(m.x) && Number.isFinite(m.z)) return m;
  // Fallback: the emerald generators are on the middle island.
  const gens = objectivesOf(view, 'generator', { team: null }).filter((g) => String(g.id).startsWith('e'));
  if (gens.length) {
    const x = gens.reduce((s, g) => s + g.at[0], 0) / gens.length;
    const z = gens.reduce((s, g) => s + g.at[2], 0) / gens.length;
    return { x, y: Math.max(...gens.map((g) => g.at[1])), z, r: 9 };
  }
  const zone = skills.zone?.();
  if (zone) return { x: zone.x, y: 31, z: zone.z, r: 9 };
  return { x: 0.5, y: 31, z: 0.5, r: 10 };
}

/**
 * The length of the round in seconds. The general view does not always carry it (`rules.timeLimit` can be absent),
 * and the plan's whole clock is a fraction of it -- practice 2 showed the bot still farming at the forge at 4:10 of
 * a 6:00 game because the fallback was 10:00. So: the explicit limit, else the countdown left, else the next
 * scheduled event that is defined as a fraction of the round (Bed Destruction 60%, Sudden Death 80%), else the
 * zone's own closedAt (90%), else the arena's default.
 */
function timeLimitOf(view, skills, elapsed) {
  const limit = Number(view.rules?.timeLimit);
  if (Number.isFinite(limit) && limit > 0) return limit;
  const next = view.next;
  if (next && Number.isFinite(next.in)) {
    const at = elapsed + next.in;
    const label = String(next.label ?? '');
    if (/bed destruction/i.test(label)) return at / 0.6;
    if (/sudden death/i.test(label)) return at / 0.8;
    if (/game end/i.test(label)) return at;
  }
  const left = Number(view.timeLeft);
  if (Number.isFinite(left) && left > 0) return elapsed + left;
  const zone = skills.zone?.();
  if (zone && Number.isFinite(zone.closedAt) && zone.closedAt > 0) return zone.closedAt / 0.9;
  return 600;
}

/** The point of the middle island's rim on the line from the middle to me, and the direction outward. */
function rimToward(mid, me, skills) {
  const dx = me.at.x - mid.x, dz = me.at.z - mid.z, d = Math.hypot(dx, dz) || 1;
  const ux = dx / d, uz = dz / d;
  let ex = mid.x, ez = mid.z, found = false;
  for (let t = 1; t <= Math.max(4, (mid.r ?? 10) + 8); t += 1) {
    const x = mid.x + ux * t, z = mid.z + uz * t;
    if (!skills.groundAt(x, mid.y, z)) break;
    ex = x; ez = z; found = true;
  }
  // Nothing of the island found along the line (a bad middle estimate): aim at the centre itself.
  if (!found) return { x: mid.x, z: mid.z, ux, uz };
  return { x: ex, z: ez, ux, uz };
}

/** The cell on the middle the squad holds: a couple of blocks from the centre, one per player. */
function postSpot(mid, me) {
  const slot = Math.abs(Number(me.slot) || 0);
  const a = (slot % 4) * (Math.PI / 2);
  const r = Math.min(2.5, Math.max(1, (mid.r ?? 8) * 0.3));
  return { x: mid.x + Math.cos(a) * r, z: mid.z + Math.sin(a) * r };
}

/** Buy the next thing worth buying at our own shopkeeper (only the difficulties whose shop sells it). */
function buyNext(me, skills, s) {
  const shop = me.ability?.shop ?? 'basic';
  if (shop === 'wool') {
    if (s.iron >= 4 && s.blocks < s.need) return skills.buy('wool', 1).ok;
    return false;
  }
  const buy = (key) => skills.buy(key, 1).ok;
  // Blocks for the whole crossing always come first: nothing else can be bought once we have left.
  if (s.blocks < s.need && s.iron >= 4) return buy('wool');
  if (s.sword < 5 && s.iron >= 10 && s.blocks >= 8) return buy('stone_sword');
  if (s.sword < 6 && s.gold >= 7) return buy('iron_sword');
  if (s.kitArmor < 1 && s.iron >= 24) return buy('chain_armor');
  if (s.gold >= 3 && s.count('golden_apple') < 2) return buy('gapple');
  if (shop === 'full' && s.kitArmor < 2 && s.gold >= 12) return buy('iron_armor');
  if (shop === 'full' && s.emerald >= 3 && s.sword < 7) return buy('diamond_sword');
  if (shop === 'full' && s.emerald >= 6 && s.kitArmor < 3) return buy('diamond_armor');
  return false;
}

/**
 * One action toward the middle: walk, bridge, stair up the island's side, or pillar the last blocks.
 * Returns after one action, whatever happened, so the brain keeps its pace.
 */
async function travelToMiddle({ me, skills, mid, blocks }) {
  const p = me.at;
  const dCentre = Math.hypot(p.x - mid.x, p.z - mid.z);
  // On the island's own top: walk in to the hold post.
  if (p.y >= mid.y - 0.5 && dCentre <= (mid.r ?? 10) + 2 && skills.groundAt(p.x, mid.y, p.z)) {
    const post = postSpot(mid, me);
    await skills.goTo([post.x, mid.y, post.z], { bridge: false, stopWithin: 1.0, summary: 'holding the middle' });
    return;
  }
  const rim = rimToward(mid, me, skills);
  // At the island's foot and below its top (High Middle, Archipelago): build a step outward and climb it -- one
  // block a tick. Building outward, never into the cliff, is what makes the climb safe; the walk back in then
  // descends our own staircase. The engine's own stair never starts, because it flattens a target whose ground is
  // air, and the ground at a rim cell's height is the cliff.
  if (p.y < mid.y - 0.5 && Math.hypot(p.x - rim.x, p.z - rim.z) <= 4.5 && blocks > 0) {
    const stepX = Math.floor(p.x - rim.ux * 1.05), stepZ = Math.floor(p.z - rim.uz * 1.05);
    const stepY = Math.floor(p.y);
    if ((stepX !== Math.floor(p.x) || stepZ !== Math.floor(p.z)) && skills.isAir([stepX, stepY, stepZ]) && skills.isAir([stepX, stepY + 1, stepZ])) {
      if (skills.place([stepX, stepY, stepZ])?.ok) {
        await skills.goTo([stepX + 0.5, p.y + 1, stepZ + 0.5], { bridge: false, stopWithin: 0.35, summary: 'climbing onto the middle' });
        return;
      }
    }
  }
  // Bridge (or walk) at the island's height toward the hold post -- a point inside the island, so the walk keeps
  // going until its own ground check says the island is under us (a point on the rim's edge would stop short of it).
  const post = postSpot(mid, me);
  await skills.goTo([post.x, Math.max(p.y, mid.y), post.z], {
    bridge: blocks > 0, stopWithin: 1.0, summary: 'crossing to the middle',
  });
}

export async function playBedWars({ view, skills }) {
  const me = view.me;
  // The lobby is a new game: its clock starts when the playing phase does.
  if (view.phase !== 'playing') skills.resetClock('bedwars');

  // 1. Auto-select a team in lobby if unassigned (the emptiest one).
  if (view.phase === 'lobby' && !me.team) {
    const counts = new Map();
    for (const t of view.teams ?? []) counts.set(t.id, 0);
    for (const p of view.players) if (p.team && counts.has(p.team)) counts.set(p.team, counts.get(p.team) + 1);
    let chosen = null;
    for (const [tid, n] of counts.entries()) if (n === 0) { chosen = tid; break; }
    if (!chosen) chosen = counts.keys().next().value || 'blue';
    skills.chooseTeam(chosen);
    return;
  }

  if (view.phase !== 'playing' || !me.canAct) return;

  const team = me.team;
  if (!team) return;
  const elapsed = skills.clock('bedwars');
  const T = timeLimitOf(view, skills, elapsed);
  const bedsGone = elapsed >= 0.6 * T;
  // Leave once the crossing's blocks and a sword are in hand, from 42% of the limit: early enough to be standing
  // on the middle before the zone starts (60%), late enough to have the whole kit (sword, armour, apples).
  const leaveAt = 0.42 * T, forceAt = 0.52 * T;

  const role = teamRole(view);
  const beds = objectivesOf(view, 'bed');
  const myBed = beds.find((b) => b.team === team) ?? null;
  const bedStanding = myBed?.state === 'standing';
  const forge = objectivesOf(view, 'generator', { team })[0] ?? null;
  const mid = middleOf(view, skills);
  const zone = skills.zone();

  const c = me.carrying;
  const blocks = c.blocks, iron = c.iron, gold = c.gold, emerald = c.emerald;
  const kitArmor = me.kit?.armor ?? 0;
  const sword = skills.bestWeaponDamage();
  // Blocks for the crossing: the void cells on the straight line home, plus margin for the stair/pillar at the
  // rim (up to 6 blocks up on High Middle and Archipelago) and for a fight that costs a few.
  const need = Math.max(24, Math.min(112, skills.voidCellsToward(mid.x, mid.z) + 20));

  skills.heal();

  const distMid = Math.hypot(me.at.x - mid.x, me.at.z - mid.z);
  const homeDist = myBed ? Math.hypot(me.at.x - (myBed.at[0] + 0.5), me.at.z - (myBed.at[2] + 0.5)) : Infinity;
  // On the middle: inside its plan radius, at its height, with the island under our feet. (A bridge of our own at
  // the same height also has ground under it, hence the radius test: short of the island, this stays false and the
  // crossing keeps going.)
  const onMiddle = distMid <= (mid.r ?? 10) && me.at.y >= mid.y - 1.5 && skills.groundAt(me.at.x, mid.y, me.at.z);

  const foes = skills.enemies();
  const foe = foes[0] ?? null;
  const foeDist = foe ? near(me, foe.x, foe.z) : Infinity;
  const foeInZone = foe ? (!zone || Math.hypot((foe.x ?? 0) - (zone.x ?? mid.x), (foe.z ?? 0) - (zone.z ?? mid.z)) <= Math.max(7, zone.radius - 3)) : false;

  // 2. An intruder at my bed while it stands: whoever is home (or close) answers it.
  if (myBed && bedStanding && foe) {
    const intruder = foes.find((f) => Math.hypot((f.x ?? 0) - (myBed.at[0] + 0.5), (f.z ?? 0) - (myBed.at[2] + 0.5)) <= 13) ?? null;
    if (intruder && (homeDist <= 30 || near(me, intruder.x, intruder.z) <= 8)) {
      await skills.fight(intruder, { summary: `defending my bed from ${intruder.name || intruder.id}` });
      return;
    }
  }

  // 3. A foe close by is fought -- once the zone is on, only inside it: never chase into the closing void.
  if (foe && foeDist <= 9 && (foeDist <= 5 || foeInZone || !zone)) {
    await skills.fight(foe);
    return;
  }

  // 4. The closing zone: back to the middle, before anything else.
  if (zone) {
    const dCentre = Math.hypot(me.at.x - zone.x, me.at.z - zone.z);
    if (dCentre > Math.max(5, zone.radius - 5) || me.at.y < zone.floor + 1 || skills.inVoid() > 0) {
      await travelToMiddle({ me, skills, mid, blocks });
      return;
    }
  }

  // 5. Their bed in my reach is broken at once (worth nothing after Bed Destruction, so not chased down).
  if (!bedsGone) {
    const target = beds.filter((b) => b.team !== team && b.state === 'standing')
      .sort((a, b) => Math.hypot(a.at[0] - me.at.x, a.at[2] - me.at.z) - Math.hypot(b.at[0] - me.at.x, b.at[2] - me.at.z))[0];
    if (target && Math.hypot(target.at[0] + 0.5 - me.at.x, target.at[2] + 0.5 - me.at.z) <= 4.2) {
      await skills.breakBed(target.at, { summary: `breaking the ${target.team} bed!` });
      return;
    }
  }

  // 6. At home: shop, farm, and leave when the clock says so and the gear is there.
  if (homeDist <= 30 && !onMiddle) {
    // Never set foot on the void with fewer blocks than the crossing takes: the shop below is buying them as the
    // iron comes, so this waits at the forge only as long as it must.
    const mayLeave = blocks >= need && (elapsed >= leaveAt || (elapsed >= forceAt && sword >= 5));
    // 6a. The anchorman seals the bed before the squad leaves. Wool breaks in 1.2 s by hand; end stone takes 15 s
    // without a pickaxe, so a rusher cannot open the bed before the clock destroys every bed at 60% of the round.
    if (mayLeave && !bedsGone && bedStanding && myBed && role === 'anchorman' && !skills.flag('bedSealed') && blocks >= need + 8) {
      const facing = skills.baseFacing(team);
      const head = [myBed.at[0] + (facing.x ?? 0), myBed.at[1], myBed.at[2] + (facing.z ?? 0)];
      const gaps = bedCover(myBed.at, head).filter((cell) => skills.isAir(cell))
        .sort((a, b) => Math.hypot(a[0] - me.at.x, a[2] - me.at.z) - Math.hypot(b[0] - me.at.x, b[2] - me.at.z));
      if (!gaps.length) skills.setFlag('bedSealed', true);
      else {
        const g = gaps[0];
        if (!skills.flag('bedStone') && iron >= 24) {
          if (skills.buy('end_stone', 1).ok) { skills.setFlag('bedStone', true); return; }
        }
        if (Math.hypot(g[0] + 0.5 - me.at.x, g[2] + 0.5 - me.at.z) > 3) {
          await skills.goTo([g[0] + 0.5, myBed.at[1], g[2] + 0.5], { bridge: false, stopWithin: 2.0, summary: 'sealing the bed in end stone' });
          return;
        }
        if (skills.placeOf(g, 'end_stone')?.ok) return;
        if (skills.place(g)?.ok) return;
      }
    }
    if (buyNext(me, skills, { blocks, iron, gold, emerald, kitArmor, sword, need, count: c.count })) return;
    if (!mayLeave) {
      if (forge) {
        await skills.collectIfReached(`f-${team}`, forge.at, { bridge: false, stopWithin: 1.2, summary: 'gearing up at the forge' });
      }
      return;
    }
    await travelToMiddle({ me, skills, mid, blocks });
    return;
  }

  // 7. On the middle: hold the post, face the nearest foe, and let the zone do the rest.
  if (onMiddle) {
    const post = postSpot(mid, me);
    if (Math.hypot(me.at.x - post.x, me.at.z - post.z) > 1.8) {
      await skills.goTo([post.x, mid.y, post.z], { bridge: false, stopWithin: 1.0, summary: 'holding the middle' });
      return;
    }
    if (foe) skills.faceToward(foe.x ?? 0, (foe.y ?? 31) + 1.2, foe.z ?? 0);
    else skills.faceToward(mid.x + (me.at.x - mid.x), mid.y + 1.2, mid.z + (me.at.z - mid.z));
    return;
  }

  // 8. Somewhere between: cross -- or, out of blocks over the void before the zone starts, walk back and re-gear.
  // (Once it is closing, walking away from the middle is only a longer death: keep trying for the island.)
  if (blocks < 1 && homeDist > 30 && forge && !zone) {
    await skills.goTo([forge.at[0], forge.at[1], forge.at[2]], { bridge: false, stopWithin: 1.2, summary: 'out of blocks: back to the forge' });
    return;
  }
  await travelToMiddle({ me, skills, mid, blocks });
}
