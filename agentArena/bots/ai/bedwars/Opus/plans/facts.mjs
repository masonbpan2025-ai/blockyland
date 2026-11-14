// Facts: what a plan's conditions can test, measured from the view (../skills/view.mjs) in the same words for every game.
// A plan never names a game's own fields: it asks how many objectives of a kind are left, how far the nearest is, how
// far a place is, how many foes are alive and how near, how hurt and how equipped I am, how much time is left.
//
// Objective facts, for every kind K the round has ('chest', 'bed', 'generator', 'flag', ...) and each relation R --
//   any, mine (my team's, or on my island), enemy (another team's), neutral (no team's):
//   K.R.count       how many there are
//   K.R.open        how many are still there to take, hold or break (not looted, broken or empty)
//   K.R.looted      how many are gone (looted, broken or empty) -- count - open
//   K.R.nearest     blocks to the nearest open one (Infinity when none)
//   K.R.highest     the y of the highest open one; K.R.lowest likewise (and lowest is Infinity when none)
//   K.R.nearestDy / highestDy / lowestDy   that objective's height over mine (0 when none)
//   K.R.stock       the total of every numeric `stock` field on them (a generator's pile; 0 when empty)
//   K.R.void        void cells on the straight route to the nearest open one: the blocks a bridge there costs
//   K.R.foeDist     blocks from the nearest foe I have seen to the nearest open one (Infinity when none)
// Place facts, for every kind P ('spawn', 'base', 'middle', 'shop', ...):
//   place.P.dist    blocks to the nearest; place.P.mine.dist to my own (team or slot)
//   place.P.count, place.P.mine.count
//   place.P.highest / lowest / nearestDy      the places' heights; the nearest one's height over mine
//   place.P.mine.nearestDy
// Players:
//   enemies.alive, enemies.seen, enemies.nearest (blocks), enemies.nearestDy (their height over mine),
//   enemies.nearestVoid (void cells between me and the nearest seen foe; 0 = same solid side, inf = none),
//   enemies.nearestHealth, enemies.weakestHealth, enemies.above, enemies.below, enemies.close (within 8 blocks),
//   allies.alive, allies.nearest, players.alive
// Me:
//   me.health, me.absorption, me.food, me.blocks, me.weapon (best weapon damage, 1 for a fist), me.armor (best pieces,
//   one per slot, that I can wear), me.armorPoints (their points, at most 20),
//   me.voidNear (void cells within 3 blocks; 0 = solid ground around me),
//   me.dropNear (nearby cells whose ground is 3+ blocks lower: a ledge a step can fall from),
//   me.hasSword, me.hasPickaxe, me.hasAxe, me.hasShears, me.tools, me.wool,
//   me.gapples, me.pearls, me.arrows, me.hasBow, me.y, me.iron, me.gold, me.diamond, me.emerald
// Time:
//   time.elapsed, time.left (Infinity without a limit), time.next (seconds to the next scheduled event)
import { WEAPON_DAMAGE } from '../../../../../../packages/blockyland-mcp/guestPeer.js';

export const RELATIONS = Object.freeze(['any', 'mine', 'enemy', 'neutral']);
/** States that mean an objective is gone for now. */
const GONE = new Set(['broken', 'looted', 'empty', 'taken', 'captured']);

/** Whether an objective is mine, an enemy's or nobody's, from my team or my slot. */
export function relationOf(o, me) {
  if (o.team) return me.team && o.team === me.team ? 'mine' : 'enemy';
  if (o.slot !== null && o.slot !== undefined) return o.slot === me.slot ? 'mine' : 'enemy';
  return 'neutral';
}

/** Open: there to take, hold or break -- not broken, looted or empty, and not looted by me. */
export const isOpen = (o) => !GONE.has(o.state) && !o.looted;

const flat = (me, at) => Math.hypot(at[0] - me.at.x, at[2] - me.at.z);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v) => (finite(v) ? v : 0);

/** The total of an objective's numeric stock (a generator's pile). */
function stockOf(o) {
  let total = 0;
  if (o && o.stock && typeof o.stock === 'object') for (const v of Object.values(o.stock)) total += num(v);
  return total;
}

/** Armour points of one worn item, by its material and piece (the Java numbers). */
const ARMOR_POINTS = {
  leather: { helmet: 1, chestplate: 3, leggings: 2, boots: 1 },
  chainmail: { helmet: 2, chestplate: 5, leggings: 4, boots: 1 },
  iron: { helmet: 2, chestplate: 6, leggings: 5, boots: 2 },
  golden: { helmet: 2, chestplate: 5, leggings: 3, boots: 1 },
  diamond: { helmet: 3, chestplate: 8, leggings: 6, boots: 3 },
  netherite: { helmet: 3, chestplate: 8, leggings: 6, boots: 3 },
};
function armorPointsOf(item) {
  const id = typeof item === 'string' ? item : item?.id;
  const m = /^([a-z]+)_(helmet|chestplate|leggings|boots)$/.exec(String(id ?? ''));
  if (!m) return 0;
  const tier = m[1] === 'chain' ? 'chainmail' : m[1] === 'gold' ? 'golden' : m[1];
  return ARMOR_POINTS[tier]?.[m[2]] ?? 0;
}

/** Every fact of a view, as a flat { name: number } map. `enemies` are the players I have taken in (skills.enemies()). */
export function computeFacts(view, enemies = [], session = null) {
  const me = view.me, f = {};
  const kinds = new Set(view.objectives.map((o) => o.kind));
  for (const kind of kinds) {
    for (const rel of RELATIONS) {
      const list = view.objectives.filter((o) => o.kind === kind && (rel === 'any' || relationOf(o, me) === rel));
      const open = list.filter(isOpen);
      const near = open.reduce((a, b) => (a === null || flat(me, b.at) < flat(me, a.at) ? b : a), null);
      const high = open.reduce((a, b) => (a === null || b.at[1] > a.at[1] ? b : a), null);
      const low = open.reduce((a, b) => (a === null || b.at[1] < a.at[1] ? b : a), null);
      f[`${kind}.${rel}.count`] = list.length;
      f[`${kind}.${rel}.open`] = open.length;
      f[`${kind}.${rel}.looted`] = list.length - open.length;
      f[`${kind}.${rel}.nearest`] = near ? flat(me, near.at) : Infinity;
      f[`${kind}.${rel}.highest`] = high ? high.at[1] : -Infinity;
      f[`${kind}.${rel}.lowest`] = low ? low.at[1] : Infinity;
      f[`${kind}.${rel}.nearestDy`] = near ? near.at[1] - me.at.y : 0;
      f[`${kind}.${rel}.highestDy`] = high ? high.at[1] - me.at.y : 0;
      f[`${kind}.${rel}.lowestDy`] = low ? low.at[1] - me.at.y : 0;
      f[`${kind}.${rel}.stock`] = list.reduce((n, o) => n + stockOf(o), 0);
      // The bridge budget to the nearest open one: void cells on the straight route (what a crossing actually costs).
      // It is the general sense the movement skills use, not a map rule; inf when there is no target or no world.
      let voidCost = Infinity;
      if (near && typeof session?.voidCellsToward === 'function') {
        try {
          const cells = session.voidCellsToward(near.at[0], near.at[2]);
          voidCost = Number.isFinite(cells) ? cells : Infinity;
        } catch { voidCost = Infinity; }
      }
      f[`${kind}.${rel}.void`] = voidCost;
      let foeDist = Infinity;
      for (const e of enemies) for (const o of open) foeDist = Math.min(foeDist, Math.hypot((e.x ?? 0) - o.at[0], (e.z ?? 0) - o.at[2]));
      f[`${kind}.${rel}.foeDist`] = foeDist;
    }
  }
  for (const kind of new Set(view.places.map((p) => p.kind))) {
    const all = view.places.filter((p) => p.kind === kind);
    const near = all.reduce((a, b) => (a === null || flat(me, b.at) < flat(me, a.at) ? b : a), null);
    const mine = all.filter((p) => relationOf(p, me) === 'mine');
    const nearMine = mine.reduce((a, b) => (a === null || flat(me, b.at) < flat(me, a.at) ? b : a), null);
    f[`place.${kind}.count`] = all.length;
    f[`place.${kind}.dist`] = near ? flat(me, near.at) : Infinity;
    f[`place.${kind}.highest`] = all.length ? Math.max(...all.map((p) => p.at[1])) : -Infinity;
    f[`place.${kind}.lowest`] = all.length ? Math.min(...all.map((p) => p.at[1])) : Infinity;
    f[`place.${kind}.nearestDy`] = near ? near.at[1] - me.at.y : 0;
    f[`place.${kind}.mine.count`] = mine.length;
    f[`place.${kind}.mine.dist`] = nearMine ? flat(me, nearMine.at) : Infinity;
    f[`place.${kind}.mine.nearestDy`] = nearMine ? nearMine.at[1] - me.at.y : 0;
  }
  const foes = view.players.filter((p) => p.id !== me.id && p.alive && (!me.team || p.team !== me.team));
  const allies = view.players.filter((p) => p.id !== me.id && p.alive && me.team && p.team === me.team);
  const foeDist = (p) => Math.hypot((p.x ?? 0) - me.at.x, (p.z ?? 0) - me.at.z);
  f['enemies.alive'] = foes.length;
  f['allies.alive'] = allies.length;
  f['allies.nearest'] = allies.length ? Math.min(...allies.map(foeDist)) : Infinity;
  f['players.alive'] = view.players.filter((p) => p.alive).length;
  f['enemies.seen'] = enemies.length;
  f['enemies.nearest'] = enemies.length ? Math.hypot((enemies[0].x ?? 0) - me.at.x, (enemies[0].z ?? 0) - me.at.z) : Infinity;
  // The void a chase would have to cross: the same general sense the movement skills use, on the straight route
  // from me to the nearest seen foe. 0 means the foe is on my side of the gap; inf means there is no foe (or no world).
  let foeVoid = Infinity;
  if (enemies.length && typeof session?.voidCellsToward === 'function') {
    try {
      const cells = session.voidCellsToward(enemies[0].x, enemies[0].z);
      foeVoid = Number.isFinite(cells) ? cells : Infinity;
    } catch { foeVoid = Infinity; }
  }
  f['enemies.nearestVoid'] = foeVoid;
  f['enemies.nearestDy'] = enemies.length ? (enemies[0].y ?? me.at.y) - me.at.y : 0;
  f['enemies.nearestHealth'] = enemies.length ? num(enemies[0].health ?? 20) : 20;
  f['enemies.weakestHealth'] = enemies.length ? Math.min(...enemies.map((e) => num(e.health ?? 20))) : 20;
  f['enemies.above'] = enemies.filter((e) => (e.y ?? me.at.y) > me.at.y + 1).length;
  f['enemies.below'] = enemies.filter((e) => (e.y ?? me.at.y) < me.at.y - 1).length;
  f['enemies.close'] = enemies.filter((e) => Math.hypot((e.x ?? 0) - me.at.x, (e.z ?? 0) - me.at.z) <= 8).length;
  const c = me.carrying;
  const slots = session?.inventory?.allSlots?.() ?? [];
  const items = slots.filter(Boolean);
  const ids = items.map((s) => s.id);
  const countMatching = (re) => items.filter((s) => re.test(String(s.id ?? ''))).reduce((n, s) => n + num(s.count ?? 1), 0);
  f['me.health'] = session?.health ?? 20;
  f['me.absorption'] = session?.absorption ?? 0;
  f['me.food'] = session?.food ?? 20;
  f['me.blocks'] = c.blocks;
  f['me.weapon'] = Math.max(1, ...items.map((s) => WEAPON_DAMAGE[s.id] ?? 0));
  // Armour protection is at most one piece per slot. The session's armour map may list worn pieces, spare pieces in
  // the pack, or both -- a bot with one full set reported 42, 67 and 70 when every entry was summed. Flatten every
  // source, keep the best piece per slot, and cap the total at the Java maximum (20). Never count two helmets.
  const armorSlotOf = (item) => {
    const id = typeof item === 'string' ? item : item?.id;
    const m = /_(helmet|chestplate|leggings|boots)$/.exec(String(id ?? ''));
    return m ? m[1] : null;
  };
  const armorSource = [];
  const armorMap = session?.inventory?.armor;
  if (armorMap && typeof armorMap === 'object') {
    for (const v of Object.values(armorMap)) {
      if (!v) continue;
      if (Array.isArray(v)) armorSource.push(...v.filter(Boolean));
      else armorSource.push(v);
    }
  }
  if (armorSource.length === 0) for (const s of items) if (armorSlotOf(s)) armorSource.push(s);
  const bestArmor = {};
  for (const it of armorSource) {
    const slot = armorSlotOf(it);
    if (!slot) continue;
    if (!bestArmor[slot] || armorPointsOf(it) > armorPointsOf(bestArmor[slot])) bestArmor[slot] = it;
  }
  const armorItems = Object.values(bestArmor);
  f['me.armor'] = armorItems.length;
  f['me.armorPoints'] = Math.min(20, armorItems.reduce((n, it) => n + armorPointsOf(it), 0));
  // How close the void and a big drop are: sample the ground in a ring around my feet. voidNear counts cells with no
  // ground (the void); dropNear counts cells whose ground is three or more blocks lower (a ledge or tower edge). A
  // knockback at a void edge and a blind flee off a tower are both round-ending, but only the first is void. Both are
  // general senses of the world, not map rules; outside play the ground may not be loaded, so both report 0.
  let voidNear = 0, dropNear = 0;
  if (view.phase === 'playing' && typeof session?.groundAt === 'function') {
    const cx = Math.floor(me.at.x), cz = Math.floor(me.at.z), cy = Math.floor(me.at.y);
    const solidAt = typeof session?.isSolid === 'function'
      ? (x, y, z) => { try { return session.isSolid(x, y, z); } catch { return true; } }
      : typeof session?.isAir === 'function'
        ? (x, y, z) => { try { return !session.isAir(x, y, z); } catch { return true; } }
        : null;
    const ring = [];
    for (const [dx, dz] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) ring.push([dx, dz]);
    for (const [dx, dz] of [[0,2],[0,-2],[2,0],[-2,0],[2,2],[2,-2],[-2,2],[-2,-2]]) ring.push([dx, dz]);
    for (const [dx, dz] of [[0,3],[0,-3],[3,0],[-3,0],[3,3],[3,-3],[-3,3],[-3,-3]]) ring.push([dx, dz]);
    for (const [dx, dz] of ring) {
      let ground = false;
      try { ground = Boolean(session.groundAt(cx + dx + 0.5, cy, cz + dz + 0.5)); } catch { /* unknown */ }
      if (!ground) { voidNear++; continue; }
      // Ground is there; is it far enough below my feet that a step off is a fall? Two air blocks under the next
      // cell means the ground is at least three blocks below my feet -- a fall that can hurt and, from a tower, kill.
      if (solidAt && !solidAt(cx + dx, cy - 1, cz + dz) && !solidAt(cx + dx, cy - 2, cz + dz)) dropNear++;
    }
  }
  f['me.voidNear'] = voidNear;
  f['me.dropNear'] = dropNear;
  f['me.hasSword'] = ids.some((id) => /_sword$/.test(String(id ?? ''))) ? 1 : 0;
  f['me.hasPickaxe'] = ids.some((id) => /_pickaxe$/.test(String(id ?? ''))) ? 1 : 0;
  f['me.hasAxe'] = ids.some((id) => /_axe$/.test(String(id ?? ''))) ? 1 : 0;
  f['me.hasShears'] = ids.some((id) => /shears$/.test(String(id ?? ''))) ? 1 : 0;
  f['me.tools'] = f['me.hasPickaxe'] + f['me.hasAxe'] + f['me.hasShears'];
  f['me.wool'] = countMatching(/_wool$/);
  f['me.gapples'] = c.count('golden_apple');
  f['me.pearls'] = c.count('ender_pearl');
  f['me.arrows'] = c.count('arrow');
  f['me.hasBow'] = c.has('bow') ? 1 : 0;
  f['me.y'] = me.at.y;
  for (const k of ['iron', 'gold', 'diamond', 'emerald']) f[`me.${k}`] = c[k];
  f['time.elapsed'] = view.elapsed ?? 0;
  f['time.left'] = view.timeLeft ?? Infinity;
  f['time.next'] = view.next?.in ?? Infinity;
  return f;
}

/** The facts as short lines for a prompt: all of them, rounded; Infinity is shown as inf (none). */
export function factsText(facts) {
  const fmt = (v) => (v === Infinity ? 'inf' : v === -Infinity ? '-inf' : String(Math.round(v * 10) / 10));
  return Object.entries(facts).filter(([, v]) => typeof v === 'number').map(([k, v]) => `${k}=${fmt(v)}`).join(' ');
}
