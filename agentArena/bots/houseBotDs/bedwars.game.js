// houseBotDs for Bed Wars: a strategy program with no AI behind it, on the houseBotDs core.
//
// Bed Wars is an economy rush and then a manhunt: farm iron at the forge, buy wool and a sword, cover the bed,
// bridge at the enemy bed as early as the map allows, break it, then finish the player while the bed is gone.
// The house bot's known weakness is the last part, so this version has a hard finish mode: when the enemy bed
// falls it hunts the last seen position, the enemy spawn (especially during the 5 s respawn window), the middle
// and its own base, and it never goes back to farming while the enemy is still alive - unless it is out of the
// blocks it needs to reach them, which is the one economy trip worth making.
//
// The planner is the house bot's Monte Carlo search with a less rough model: numeric bed cover, real walk and
// measured bridge rates, the killer taking the victim's resources, the 5 s gearless respawn, and a bed-break
// cost that reflects digging one cover block and the bed rather than eight.

const BW_MOVES = ['farm', 'buy_wool', 'buy_sword', 'buy_armour', 'defend', 'rush', 'hunt', 'go_home', 'wait'];
const IRON_PER_S = 1 / 1.5, GOLD_PER_S = 1 / 6, BW_WALK = WALK_SPEED, BW_BRIDGE = 1.0;
const RESPAWN_S = 5, BREAK_S = 1.2, COVER_BREAK_S = 0.5;

const bwClone = (p) => ({ ...p, chests: p.chests ? { ...p.chests } : undefined });

/** Travel in the model: walking where there is ground or a bridge, else bridging with wool. */
function bwTravel(world, p, to) {
  if (p.place === to) return { t: 1, to };
  const key = `${p.place}>${to}`, g = world.gaps[key] ?? 15, d = world.dists[key] ?? 40;
  if (g <= 0 || world.bridges[key] || world.bridges[`${to}>${p.place}`]) return { t: d / world.walk, to };
  if (p.wool < g) return null;
  return { t: d / world.walk + g * world.bridgeRate, wool: g, bridge: key, to };
}

/** What a move costs and gives in the model, or null when it cannot be done. */
function bwCost(world, p, move) {
  const home = p.place === p.home;
  switch (move) {
    case 'farm': return home ? { t: 8, iron: 8 * IRON_PER_S, gold: 8 * GOLD_PER_S } : null;
    case 'buy_wool': return home && p.iron >= 4 ? { t: 4, iron: -4, woolGain: 16 } : null;
    case 'buy_sword':
      if (home && p.sword < 5 && p.iron >= 10) return { t: 4, iron: -10, sword: 5 };
      if (home && p.sword < 6 && p.gold >= 7) return { t: 4, gold: -7, sword: 6 };
      return null;
    // The shop's armour set replaces leggings and boots: leather full is 7, chainmail 9, iron 11.
    case 'buy_armour':
      if (home && p.armour < 11 && p.gold >= 12) return { t: 4, gold: -12, armour: 11 };
      if (home && p.armour < 9 && p.iron >= 24) return { t: 4, iron: -24, armour: 9 };
      return null;
    case 'defend': {
      if (!home || !p.bedAlive || p.cover >= 8 || p.wool < 1) return null;
      const n = Math.min(8 - p.cover, p.wool);
      return { t: 1.4 * n, woolUse: n, cover: n };
    }
    case 'rush': {
      if (!p.foeBed || !p.foeBed()) return null;
      const c = bwTravel(world, p, p.away);
      return c ? { ...c, rush: true } : null;
    }
    case 'hunt': {
      const at = p.target ?? p.away;
      if (p.place === at) return { t: 2 };
      const c = bwTravel(world, p, at);
      return c || null;
    }
    case 'go_home': return !home ? bwTravel(world, p, p.home) : null;
    case 'wait': return { t: 4 };
    default: return null;
  }
}

function bwApply(world, p, move) {
  const c = bwCost(world, p, move);
  if (!c) return null;
  p.busy = world.t + c.t;
  if (c.iron) p.iron += c.iron;
  if (c.gold) p.gold += c.gold;
  if (c.woolGain) p.wool += c.woolGain;
  if (c.woolUse) p.wool -= c.woolUse;
  if (c.wool) p.wool -= c.wool;
  if (c.sword) p.sword = c.sword;
  if (c.armour) p.armour = c.armour;
  if (c.cover) p.cover = Math.min(8, p.cover + c.cover);
  if (c.bridge) world.bridges[c.bridge] = true;
  if (c.to) { p.dest = c.to; p.from = p.place; }
  p.rushing = !!c.rush;
  p.camping = move === 'wait';
  return p;
}

const bwPower = (p) => powerOf({ armour: p.armour, weapon: p.sword, hp: 20, apples: 0 });

/** A player's move in a playout: farm and buy toward a bridge, cover the bed, then rush or hunt; random, but sensible. */
function bwFoeMove(world, f, r) {
  const opts = [];
  const home = f.place === f.home;
  const need = Math.min(64, (world.gaps[`${f.home}>${f.away}`] ?? 30) + 8);
  if (home) {
    if (f.iron >= 4 && f.wool < need) opts.push(['buy_wool', 3]);
    if (f.iron >= 10 && f.sword < 5) opts.push(['buy_sword', 2]);
    if (f.gold >= 12 && f.armour < 11) opts.push(['buy_armour', 1.5]);
    if (f.bedAlive && f.cover < 8 && f.wool >= 4) opts.push(['defend', f.cover < 4 ? 2 : 1]);
    opts.push(['farm', f.wool < need ? 2.5 : 0.8]);
  } else opts.push(['go_home', f.wool < 4 ? 2 : 0.3]);
  opts.push(['rush', f.wool >= need - 8 ? 3 : 0.3], ['hunt', world.t > 100 ? 1.5 : 0.3], ['wait', 0.1]);
  const legal = opts.filter(([m]) => bwCost(world, f, m));
  if (!legal.length) return null;
  let total = legal.reduce((s, o) => s + o[1], 0), x = r() * total;
  for (const [m, w] of legal) if ((x -= w) <= 0) return m;
  return legal[0][0];
}

/** A meeting: the loser respawns at home with nothing carried (bed standing) or is out. The killer gets the loot. */
function bwFight(world, a, b, r, persona) {
  const pA = 1 / (1 + Math.exp(-(bwPower(a) - bwPower(b) + (a.isMe ? persona.nerve : -persona.nerve)) / 3));
  const [winner, loser] = r() < pA ? [a, b] : [b, a];
  world.t += 6;
  winner.iron += loser.iron; winner.gold += loser.gold;        // a kill hands over the carried resources
  if (!loser.bedAlive) { loser.out = true; return { winner, loser }; }
  Object.assign(loser, { place: loser.home, dest: null, busy: world.t + RESPAWN_S, wool: 0, iron: 0, gold: 0, sword: 4, rushing: false });
  return { winner, loser };
}

/** A playout: both act when free; rushes break beds, meetings fight; ends with an elimination, the clock or the horizon. */
function bwRollout(root, plan, r, persona, horizon) {
  const world = { ...root, bridges: { ...root.bridges } };
  const me = bwClone(root.me), foe = bwClone(root.foe);
  me.isMe = true; me.foeBed = () => foe.bedAlive; foe.foeBed = () => me.bedAlive;
  let i = 0;
  const end = Math.min(root.t + horizon, root.limit);
  while (world.t < end) {
    if (me.out) return -1;
    if (foe.out) return 1;
    for (const p of [me, foe]) if (p.dest && p.busy <= world.t) { p.place = p.dest; p.dest = null; }
    // A rush that reached the enemy base with nobody there breaks the bed (through one cover layer).
    for (const [p, q] of [[me, foe], [foe, me]]) {
      if (p.rushing && p.place === p.away && q.bedAlive && q.place !== q.home) {
        q.bedAlive = false; p.rushing = false;
        p.busy += BREAK_S + Math.min(q.cover, 4) * COVER_BREAK_S;
      }
    }
    // Meeting: the same place, or crossing each other on the way.
    const crossing = me.dest && foe.dest && me.dest === foe.from && foe.dest === me.from;
    if (me.place === foe.place || crossing) {
      if (crossing) { me.place = foe.place = 'mid'; me.dest = foe.dest = null; }
      const { winner, loser } = bwFight(world, me, foe, r, persona);
      if (me.out) return -1;
      if (foe.out) return 1;
      // The winner standing at the other's base can start breaking its bed while the loser respawns.
      if (winner.place === loser.home && loser.bedAlive) { loser.bedAlive = false; winner.busy += BREAK_S + Math.min(loser.cover, 4) * COVER_BREAK_S; }
    }
    const actor = me.busy <= foe.busy ? me : foe;
    world.t = Math.max(world.t, actor.busy);
    if (world.t >= end) break;
    me.target = foe.place; foe.target = me.place;
    if (actor === me) {
      let move = plan[i++];
      if (!move) move = bwFoeMove(world, me, r);
      if (!move || !bwApply(world, me, move)) me.busy = world.t + 3;
    } else {
      const m = bwFoeMove(world, foe, r);
      if (!m || !bwApply(world, foe, m)) foe.busy = world.t + 3;
    }
  }
  if (world.t >= root.limit) return 0;
  // Not decided by the horizon: how it stands, worth less the less time is left to turn it into a win (a tie is 0).
  const beds = (me.bedAlive ? 1 : -1) - (foe.bedAlive ? 1 : -1);
  return Math.tanh((bwPower(me) - bwPower(foe) + persona.nerve) / 6 + beds * 0.4) * 0.7 * Math.max(0, (root.limit - world.t) / root.limit);
}

const BEDWARS_MODEL = {
  legal(root, prefix) {
    const world = { ...root, bridges: { ...root.bridges } };
    const me = bwClone(root.me);
    me.foeBed = () => root.foe.bedAlive;
    for (const m of prefix) { bwApply(world, me, m); if (me.dest) { me.place = me.dest; me.dest = null; } }
    const legal = BW_MOVES.filter((m) => bwCost(world, me, m));
    // `wait` is a stranded fallback, not a strategy: drop it whenever anything real is legal.
    return legal.length > 1 ? legal.filter((m) => m !== 'wait') : legal;
  },
  rollout: bwRollout,
};
const bedwarsBias = (greed, aggression) => ({
  farm: greed, buy_wool: 1.2, buy_sword: 1.1, buy_armour: greed * 0.8, defend: 2 - aggression * 0.5,
  rush: aggression * 1.3, hunt: aggression * 1.2, go_home: 0.8, wait: 0.2,
});

// --- the real game ---------------------------------------------------------------------------------------------------

const bedAt = (bot, base) => {
  if (!base || !base.bed) return false;
  const h = bot.blockAt(v(base.bed.head)), f = bot.blockAt(v(base.bed.foot));
  return [h, f].some((b) => b && /bed/.test(b.name));
};

/** The bed's cover cells: on top of both halves, and round them at bed level. */
function coverCells(base) {
  const f = v(base.bed.foot), h = v(base.bed.head), dir = h.minus(f);
  const side = new Vec3(dir.z, 0, -dir.x);
  const cells = [f.offset(0, 1, 0), h.offset(0, 1, 0), f.minus(dir), h.plus(dir), f.plus(side), f.minus(side), h.plus(side), h.minus(side)];
  return { cells, dir, f, h };
}
const coverCount = (bot, base) => (base && base.bed ? coverCells(base).cells.filter((c) => solid(bot, c)).length : 0);
const exposed = (bot, cell) => {
  for (const [dx, dy, dz] of [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
    const b = bot.blockAt(cell.offset(dx, dy, dz));
    if (!b || b.name === 'air' || b.boundingBox !== 'block') return true;
  }
  return false;
};

// Shop offers are matched by item name and display name: the window is the API's general one, and a slot's exact
// `key` is not promised. Wool is the team colour (red_wool / blue_wool), armour is sold as a set (e.g. iron_boots).
const SLOT_MATCHERS = {
  wool: (s) => /wool/.test(s.name) || /wool/i.test(s.displayName),
  stone_sword: (s) => /stone_sword/.test(s.name) || /stone sword/i.test(s.displayName),
  iron_sword: (s) => /iron_sword/.test(s.name) || /iron sword/i.test(s.displayName),
  chainmail: (s) => /chainmail/.test(s.name) || /chainmail/i.test(s.displayName),
  iron_armor: (s) => /iron_(helmet|chestplate|leggings|boots)/.test(s.name) || /iron armou?r/i.test(s.displayName),
};

/**
 * One trip to the Item Shop: opens the keeper once and clicks the wanted offers in order. Later offers are skipped
 * when a click rejects (not affordable), so a priority list is enough. Buying a sword while already there saves a
 * whole walk back; the extra purchase only ever helps.
 */
async function shopVisit(bot, base, wanted) {
  if (!(await walkTo(bot, v(base.shop), 2.2, 8000))) return [];
  let npc = bot.nearestEntity((e) => e.type !== 'player' && /shop/i.test(e.displayName || '') && (!e.position || v(base.shop).distanceTo(e.position) < 10));
  if (!npc) npc = bot.nearestEntity((e) => e.type !== 'player' && /shop/i.test(e.displayName || ''));
  if (!npc) { log('no shopkeeper'); return []; }
  const bought = [];
  try {
    await bot.activateEntity(npc);
    let win = bot.currentWindow;
    if (!win) { await bot.waitForTicks(4); win = bot.currentWindow; }
    if (!win) return bought;
    for (const key of wanted) {
      const match = SLOT_MATCHERS[key];
      if (!match) continue;
      const idx = win.slots.findIndex((s) => s && s.name && match(s));
      if (idx < 0) continue;
      try { await bot.clickWindow(idx, 0, 0); bought.push(key); } catch (e) { log('buy', key, 'refused:', e.message); }
      await bot.waitForTicks(1);
    }
  } catch (e) { log('shop:', e.message); }
  finally { try { if (bot.currentWindow) bot.closeWindow(bot.currentWindow); } catch { /* closed */ } }
  await wearBestArmour(bot);
  await holdWeapon(bot);
  if (bought.length) log('bought', bought.join(','));
  return bought;
}

const bestWeapon = (bot) => Math.max(0, ...items(bot).map(weaponScore));

async function farm(bot, base, seconds) {
  if (!(await walkTo(bot, v(base.forge), 0.8, 8000))) return;
  for (let i = 0; i < seconds * 4; i++) {
    // A farm stops for a threat, heard as well as seen: round 1 it kept farming while hit from behind.
    if (threatened(bot)) return;
    const foe = enemy(bot, { heard: true });
    if (foe) {
      const atBed = base.bed && foe.position.distanceTo(v(base.bed.head)) < 8 && bot.entity.position.distanceTo(v(base.bed.head)) < 16;
      if (atBed) return;
    }
    await bot.waitForTicks(5);
  }
}

/** Cover the bed with the blocks I carry: tops (against the bed) first, then the sides (against the ground). */
async function coverBed(bot, base) {
  const { cells, dir, f } = coverCells(base);
  const stand = f.minus(new Vec3(dir.x * 2, 0, dir.z * 2)).offset(0.5, 0, 0.5);
  if (!(await walkTo(bot, stand, 1.2, 6000)) && Date.now() - awareness.walkStoppedAt < 600) return;
  const order = [...cells.slice(0, 2), ...cells.slice(2)];
  const faces = [[0, -1, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  // One cell, every face: a face out of reach is skipped before the call (the 389 round-1 reach errors were attempts
  // on cells more than 4.4 from the eyes from a fixed stand).
  const tryPlace = async (c) => {
    const eye = bot.entity.position.offset(0, 1.62, 0);
    for (const [ox, oy, oz] of faces) {
      const ref = c.offset(ox, oy, oz);
      const b = bot.blockAt(ref);
      if (!b || b.name === 'air') continue;
      if (b.boundingBox !== 'block' && !/bed|wool|planks|terracotta|stone|clay|glass/.test(b.name)) continue;
      const face = ref.offset(0.5 - ox * 0.5, 0.5 - oy * 0.5, 0.5 - oz * 0.5);
      if (eye.distanceTo(face) > 4.4) continue;
      try {
        await bot.lookAt(ref.offset(0.5, 0.5, 0.5));
        await bot.placeBlock(b, new Vec3(-ox, -oy, -oz));
        return true;
      } catch { /* try the next face */ }
    }
    return false;
  };
  for (const c of order) {
    if (solid(bot, c)) continue;
    // A player near the bed is worth more than the last side of it: the main loop fights, a later plan returns.
    if (threatened(bot)) { log('cover: threat'); return; }
    if (!(await holdBlock(bot))) return;
    let placed = await tryPlace(c);
    if (!placed) {
      // Step toward the cell (one side of the bed is always out of arm's length from a single stand) and retry once.
      const p = bot.entity.position;
      const dx = c.x + 0.5 - p.x, dz = c.z + 0.5 - p.z, len = Math.hypot(dx, dz) || 1;
      await walkTo(bot, new Vec3(p.x + (dx / len) * 1.6, p.y, p.z + (dz / len) * 1.6), 0.9, 2500);
      if (Date.now() - awareness.walkStoppedAt < 600) return;
      placed = await tryPlace(c);
    }
    if (!placed) log('could not cover', c.x, c.y, c.z);
    await bot.waitForTicks(1);
  }
  log('bed covered:', coverCount(bot, base), 'of', cells.length);
}

/**
 * Break the enemy bed: walk to the middle side, then dig the nearest blocking cover and the bed itself, moving
 * closer when a block is out of reach. Every few seconds it looks up: a defender who comes back interrupts the
 * digging (the main loop then fights, and the next plan comes back to finish the bed).
 */
async function breakBed(bot, mem, base) {
  const { cells, dir, f, h } = coverCells(base);
  const approach = h.plus(new Vec3(dir.x * 2, 0, dir.z * 2)).offset(0.5, 1, 0.5);
  const durations = [];
  const r = await travel(bot, approach, { arrive: 2.5, onPlaced: (dt) => durations.push(dt) });
  if (durations.length) noteBridge(mem, durations);
  if (r === 'enemy') return 'enemy';
  if (r === 'hit') return 'hit';
  if (r === 'no_blocks') { log('rush: no blocks'); return 'no_blocks'; }
  if (r !== 'arrived') log('rush:', r);
  let digs = 0;
  for (let tries = 0; tries < 44 && bedAt(bot, base); tries++) {
    // Hit while digging: stop (a dig holds me still, and the next dig can finish it); a defender in reach too.
    if (Date.now() - awareness.hurtAt < 1500) return 'hit';
    const foe = enemy(bot);
    if (foe && bot.entity.position.distanceTo(foe.position) < 4.5) return 'enemy';
    let target = null;
    for (const c of [h, f]) {
      const b = bot.blockAt(c);
      if (b && /bed/.test(b.name) && exposed(bot, c) && bot.canDigBlock(b)) { target = c; break; }
    }
    if (!target) {
      const covers = cells.filter((c) => solid(bot, c)).sort((a, b) => bot.entity.position.distanceTo(a) - bot.entity.position.distanceTo(b));
      target = covers.find((c) => bot.canDigBlock(bot.blockAt(c))) || covers[0] || null;
      if (!target) { await walkTo(bot, h.offset(0.5, 1, 0.5), 2.2, 4000); continue; }
    }
    const b = bot.blockAt(target);
    if (!b) continue;
    if (!bot.canDigBlock(b)) { await walkTo(bot, target.offset(0.5, 1, 0.5), 2.4, 4000); continue; }
    try { await bot.lookAt(target.offset(0.5, 0.5, 0.5)); await bot.dig(b); digs++; } catch (e) { log('dig:', e.message); await bot.waitForTicks(3); }
    await bot.waitForTicks(2);
  }
  const alive = bedAt(bot, base);
  log(alive ? 'the bed still stands' : 'BROKE THE BED');
  if (!alive) { mem.brokeFoeBedAt = bot.arena.time; mem.foeBedGone = true; }
  return alive ? 'timeout' : 'broken';
}

/** The real state, as the Bed Wars model sees it. Async: the three gap scans are the only expensive work between awaits. */
async function bwState(bot, mem, B) {
  const t = bot.arena.time || 0, limit = bot.arena.timeLimit || 600;
  const place = (p) => {
    const d = { own: p.xzDistanceTo(B.own), mid: p.xzDistanceTo(B.mid), foe: p.xzDistanceTo(B.foe) };
    return Object.entries(d).sort((a, b) => a[1] - b[1])[0][0];
  };
  const worn = [5, 6, 7, 8].map((i) => bot.inventory.slots[i]?.name).filter(Boolean);
  const myBed = bedAt(bot, B.mine), foeBed = bedAt(bot, B.theirsBase);
  const me = {
    home: 'own', away: 'foe', place: place(bot.entity.position), busy: t,
    iron: bot.inventory.count('iron_ingot'), gold: bot.inventory.count('gold_ingot'),
    wool: blockCount(bot), sword: Math.max(1, ...items(bot).map(weaponScore)), armour: armourPoints(worn),
    bedAlive: myBed, cover: coverCount(bot, B.mine),
  };
  // The other player: where it was seen lately; a respawn window at home after a death; else by the clock.
  const seen = mem.foe && t - mem.foe.t < 22 ? mem.foe : null;
  const deadFor = mem.foeDiedAt != null ? t - mem.foeDiedAt : Infinity;
  const respawning = deadFor >= 0 && deadFor < RESPAWN_S + 1;
  const guess = seen ? place(new Vec3(seen.x, seen.y, seen.z)) : respawning ? 'foe' : t < 30 ? 'foe' : 'mid';
  const foe = {
    home: 'foe', away: 'own', place: guess, busy: respawning ? t + (RESPAWN_S - deadFor) : t + 2,
    iron: respawning ? 0 : Math.min(24, t * IRON_PER_S * 0.45), gold: respawning ? 0 : Math.min(8, t * GOLD_PER_S * 0.4),
    wool: respawning ? 0 : t < 15 ? 0 : 24, sword: respawning ? 4 : seen?.weapon ?? (t < 20 ? 4 : 5),
    armour: seen?.armour ?? (t < 20 ? 7 : t < 120 ? 9 : 11),
    bedAlive: foeBed, cover: coverCount(bot, B.theirsBase),
  };
  // Routes my own crossings have opened. A place I have walked to can be walked back even when the straight-line
  // scan disagrees -- round 2 the bot was stranded at mid with 22 wool while its own bridge home was under its
  // feet, every move but `wait` was illegal in the model, and it waited 355 s. Two legs open the third.
  const bridges = { ...(mem.bridges || {}) };
  if (bridges['own>mid'] && bridges['mid>foe']) bridges['own>foe'] = bridges['foe>own'] = true;
  const gaps = {}, dists = {};
  for (const [a, b] of [['own', 'mid'], ['mid', 'foe'], ['own', 'foe']]) {
    const d = B[a].xzDistanceTo(B[b]);
    // The scan counts void columns on the straight line; where the walkable route leaves that line it is a lower
    // bound on the wool a crossing needs. Round 2 left with 72 wool for a crossing that took ~84 and was stranded
    // 34 blocks short; a margin makes the model buy enough *before* it goes.
    const g = Math.min(Math.ceil(d), Math.round(gapBetween(bot, B[a], B[b]) * 1.35) + 4);
    gaps[`${a}>${b}`] = gaps[`${b}>${a}`] = g;
    dists[`${a}>${b}`] = dists[`${b}>${a}`] = d;
    await sleep(0);                       // one scan per 50 ms slice: 3 scans of a 116-block line were the round-1 restarts
  }
  return { t, limit, me, foe, gaps, dists, bridges, walk: BW_WALK, bridgeRate: mem.bridgeRate || BW_BRIDGE };
}

/** The state-based opening: it guarantees the fast first rush no matter what the search thinks of it. */
function openingChoice(root, mem) {
  const me = root.me;
  if (!root.foe.bedAlive) return null;
  if (me.place !== 'own') return null;
  // A cell that proved unreachable must not hold the whole opening hostage: cover what can be covered, keep playing,
  // and only try the bed again when the cover count changes (the stuck mark is set and cleared by main). A cover
  // attempt that placed nothing at all expires, so a bad position gets another chance instead of a permanent ban.
  const stuck = mem.coverStuckAt != null && me.cover >= mem.coverStuckAt && root.t < (mem.coverStuckUntil ?? 0);
  if (me.bedAlive && me.cover < 8 && me.wool >= 4 && !stuck) return 'defend';
  if (me.sword < 5 && me.iron >= 10) return 'buy_sword';
  if (me.wool < 16 && me.iron >= 4) return 'buy_wool';
  // The map is ~116 blocks base to base: `need` must scale with the measured gap, not a small fixed cap.
  const need = Math.min(224, (root.gaps['own>foe'] || 24) + 12);
  if (me.sword >= 5 && me.wool < need && me.iron >= 4) return 'buy_wool';
  if (me.sword >= 5 && me.wool >= need) return 'rush';
  return null;
}

/** After the enemy bed falls the only move that matters is finding the player; economy only to reach them. */
function finishChoice(root) {
  if (root.foe.bedAlive) return null;
  const recent = root.t - (root.me.lastSeenAt ?? -100) < 8;
  if (!recent && root.me.wool < 4) {
    if (root.me.place !== 'own') return 'hunt';           // we may be stranded; the hunt will at least search here
    return root.me.iron >= 4 ? 'buy_wool' : 'farm';
  }
  return 'hunt';
}

async function bwPerform(bot, mem, move, B) {
  const durations = [];
  const go = async (target, opts = {}) => {
    const r = await travel(bot, target, { ...opts, onPlaced: (dt) => durations.push(dt) });
    if (durations.length) noteBridge(mem, durations);
    return r;
  };
  switch (move) {
    case 'farm': await farm(bot, B.mine, 8); return;
    case 'buy_wool': {
      // One shop trip buys several 16-wool packs (up to 4 a visit) instead of walking back for each, and only buys a
      // stone sword when one is actually missing. Iron for the sword is reserved before the wool packs are counted.
      const keys = [];
      let iron = bot.inventory.count('iron_ingot');
      const sword = bestWeapon(bot) < 5 && iron >= 10;
      if (sword) { keys.push('stone_sword'); iron -= 10; }
      const packs = Math.min(4, Math.floor(iron / 4));
      for (let i = 0; i < packs; i++) keys.push('wool');
      await shopVisit(bot, B.mine, keys.length ? keys : ['wool']);
      return;
    }
    case 'buy_sword': {
      const keys = [];
      if (bestWeapon(bot) < 5 && bot.inventory.count('iron_ingot') >= 10) keys.push('stone_sword');
      if (bestWeapon(bot) < 6 && bot.inventory.count('gold_ingot') >= 7) keys.push('iron_sword');
      const packs = Math.min(3, Math.floor((bot.inventory.count('iron_ingot') - (bestWeapon(bot) < 5 && bot.inventory.count('iron_ingot') >= 10 ? 10 : 0)) / 4));
      for (let i = 0; i < packs; i++) keys.push('wool');
      await shopVisit(bot, B.mine, keys.length ? keys : ['wool']);
      return;
    }
    case 'buy_armour': {
      const keys = [];
      const gold = bot.inventory.count('gold_ingot'), iron = bot.inventory.count('iron_ingot');
      if (gold >= 12) keys.push('iron_armor');
      else if (iron >= 24) keys.push('chainmail');
      const spare = iron - (gold < 12 && iron >= 24 ? 24 : 0);
      const packs = Math.min(2, Math.floor(spare / 4));
      for (let i = 0; i < packs; i++) keys.push('wool');
      await shopVisit(bot, B.mine, keys.length ? keys : ['wool']);
      return;
    }
    case 'defend': await coverBed(bot, B.mine); return;
    case 'rush': {
      if (bedAt(bot, B.theirsBase)) await breakBed(bot, mem, B.theirsBase);
      else await huntFoe(bot, mem, B, go);
      return;
    }
    case 'hunt': await huntFoe(bot, mem, B, go); return;
    case 'go_home': log('home:', await go(v(B.mine.spawn), { arrive: 3 })); return;
    case 'wait': await bot.lookAt(B.mid.offset(0, 1.5, 0)); await bot.waitForTicks(8); return;
    default: await bot.waitForTicks(10);
  }
}

/** Hunt a player whose bed is gone: their last sighting, their spawn during a respawn, and a sweep of the map. */
async function huntFoe(bot, mem, B, go) {
  const seen = mem.foe && bot.arena.time - mem.foe.t < 18 ? new Vec3(mem.foe.x, mem.foe.y, mem.foe.z) : null;
  if (seen) { log('hunting seen:', await go(seen, { arrive: 3 })); return; }
  const deadFor = mem.foeDiedAt != null ? bot.arena.time - mem.foeDiedAt : Infinity;
  if (deadFor >= 0 && deadFor < 9) { log('hunting respawn:', await go(B.foe, { arrive: 3 })); return; }
  // Sweep: their base (most likely), the middle, my own base (in case they are counter-rushing).
  const targets = [B.foe, B.mid, v(B.mine.spawn)];
  const i = (mem.sweep || 0) % targets.length;
  mem.sweep = (i + 1) % targets.length;
  const target = targets[i];
  if (bot.entity.position.xzDistanceTo(target) < 8) {
    // Already there and nobody seen: wait a moment, facing the likely approach, before the next sweep step.
    await bot.lookAt(target.offset(0, 1.5, 0));
    for (let k = 0; k < 10; k++) { if (enemy(bot, { heard: true }) || threatened(bot, 8)) break; await bot.waitForTicks(5); }
    return;
  }
  log('hunting sweep', i, ':', await go(target, { arrive: 4 }));
}

async function main(bot, mem) {
  mem.persona = mem.persona || newPersona(bedwarsBias);
  mem.lootRetry = mem.lootRetry || {};
  bot.clearControlStates();
  log('started; team', bot.arena.me && bot.arena.me.team, 'persona', JSON.stringify({ greed: +mem.persona.greed.toFixed(2), aggression: +mem.persona.aggression.toFixed(2), temperature: +mem.persona.temperature.toFixed(2) }));
  const foeName = () => {
    if (mem.foeName) return mem.foeName;
    const n = Object.keys(bot.players || {}).filter((x) => x !== bot.username);
    if (n.length === 1) mem.foeName = n[0];
    return mem.foeName;
  };
  bot.on('death', () => { mem.myDiedAt = bot.arena.time; mem.critAt = null; log('died'); });
  bot.on('spawn', () => { mem.critAt = null; log('respawned; carrying', items(bot).map((i) => `${i.name}x${i.count}`).join(',') || 'nothing'); });
  watchForHits(bot);          // my own hurts: a sword, or a health drop from an arrow I never saw
  bot.on('message', (text) => {
    const name = foeName();
    if (!name || !text || !text.includes(name)) return;
    if (/fell|died|was killed|slain|eliminated|void|final kill/i.test(text) && !/won/i.test(text)) {
      mem.foeDiedAt = bot.arena.time;
      log('foe death:', text);
    }
  });
  for (;;) {
    try {
      const me = bot.arena.me || {};
      if (bot.arena.phase !== 'playing' || me.alive === false || me.respawning) { await bot.waitForTicks(5); continue; }
      const L = bot.arena.landmarks || {};
      const bases = L.bases || [];
      const mine = bases.find((b) => b.team === me.team), theirs = bases.find((b) => b.team !== me.team);
      if (!mine || !theirs) { await bot.waitForTicks(10); continue; }
      const here = bot.entity.position;
      foeName();
      trackFoe(bot, mem);
      // Whatever just happened to me comes first: a hit, or a player seen or only heard near me.
      if (await reactToThreat(bot, mem)) continue;
      const foe = enemy(bot);
      const myBedAlive = bedAt(bot, mine);
      if (!myBedAlive && !mem.myBedGone) { mem.myBedGone = true; log('MY BED IS GONE'); }
      const theirBedAlive = bedAt(bot, theirs);
      if (!theirBedAlive && !mem.foeBedGone) { mem.foeBedGone = true; log('their bed is gone'); }
      // Reflex: a foe close by, or at my bed while I am there to defend it. With my bed gone a fair fight can end
      // the round, so the engage radius shrinks when I am hurt.
      const atMyBed = foe && mine.bed && foe.position.distanceTo(v(mine.bed.head)) < 7 && here.distanceTo(v(mine.bed.head)) < 16;
      // A foe outside sword reach is not a reason to drop a plan: at 8 blocks, round 2's reflex backed off from a
      // foe on the way to the shop, walked at them again, backed off again, and never made the trip (75 s at -30).
      const reach = !myBedAlive && bot.health < 12 ? 4.5 : 5.5;
      // Across a gap, only fight what is close enough to hit; bridging at a foe eight blocks away is how a
      // decided rush gets thrown away. (The hunt itself brings us to them before this radius matters.) The scan
      // only runs when it can change the answer: a foe within melee range is already engaged, and a distant one is
      // never fought, so a third long line scan is avoided.
      const foeDist = foe ? here.distanceTo(foe.position) : Infinity;
      const sameLand = foe && foeDist <= 12 ? gapBetween(bot, here, foe.position) === 0 : false;
      const engageDist = sameLand ? reach : 3.5;
      if (foe && (foeDist <= engageDist || atMyBed)) { await fight(bot, foe, mem); continue; }

      const mid = L.middle ? v(L.middle) : new Vec3(0.5, 31, 0.5);
      const B = { mine, theirsBase: theirs, own: v(mine.spawn), foe: v(theirs.spawn), mid };
      // Which of the three places I am in, and which legs I have crossed. A leg crossed once is walkable from then
      // on (placed blocks stay); the model needs it or a bot away from home with little wool has no legal move but
      // `wait` -- the 355 s of round 2. A death trip home (foe -> own) still proves both legs: it had walked there.
      const placeNow = (p) => {
        const d = { own: p.xzDistanceTo(B.own), mid: p.xzDistanceTo(B.mid), foe: p.xzDistanceTo(B.foe) };
        return Object.entries(d).sort((a, b) => a[1] - b[1])[0][0];
      };
      const now = placeNow(bot.entity.position);
      mem.bridges = mem.bridges || {};
      const last = mem.lastPlace ?? 'own';        // fresh memory: I spawned at own
      const crossed = last === now ? [] : last === 'mid' || now === 'mid' ? [[last, now]] : [['own', 'mid'], ['mid', 'foe']];
      for (const [a, b] of crossed) { mem.bridges[`${a}>${b}`] = true; mem.bridges[`${b}>${a}`] = true; }
      mem.lastPlace = now;
      const root = await bwState(bot, mem, B);
      root.me.lastSeenAt = mem.foe ? mem.foe.t : -100;
      const timeLeft = bot.arena.timeLeft != null ? bot.arena.timeLeft : root.limit - root.t;
      const foeSeen = mem.foe && root.t - mem.foe.t < 12 ? new Vec3(mem.foe.x, mem.foe.y, mem.foe.z) : null;

      let move = null;

      // 1) The endgame: with the enemy bed gone, find the player; with the clock low, the bed is the only win.
      // Round 2 this rule fired at 110 s and sent the bot to hunt a player whose bed was still standing, and
      // hunting while their bed stands only gives them a respawn. It now starts at 150 s and always aims at the
      // bed: with wool, go; without, walk home and buy, then go again (each trip extends the bridge).
      if (!root.foe.bedAlive) move = finishChoice(root);
      if (!move && timeLeft <= 150) {
        const need = Math.min(224, (root.gaps['own>foe'] || 24) + 12);
        if (!root.foe.bedAlive) move = 'hunt';
        else if (root.me.place === 'own') move = root.me.wool < need ? (root.me.iron >= 4 ? 'buy_wool' : 'farm') : 'rush';
        else move = root.me.wool >= 8 ? 'rush' : 'go_home';
      }
      // 2) Our bed is uncovered and the enemy is on their way: cover it rather than lose to one death.
      const stuck = mem.coverStuckAt != null && root.me.cover >= mem.coverStuckAt && root.t < (mem.coverStuckUntil ?? 0);
      if (!move && foeSeen && root.me.bedAlive && root.me.cover < 8 && !stuck && foeSeen.distanceTo(v(mine.bed.head)) < 14 && here.distanceTo(v(mine.bed.head)) < 20) move = 'defend';
      // 3) The opening: a state-based guarantee of the fast first rush.
      if (!move) move = openingChoice(root, mem);
      // 4) The search decides the rest.
      if (!move) {
        // 600 iterations, not 900: the search yields every 16, and Bed Wars has at most nine first moves, so the
        // extra visits bought nothing but CPU time. (Round 2: four >50 ms restarts, all inside a 900-visit search.)
        const results = await search(root, BEDWARS_MODEL, mem.persona, { horizon: 180, iterations: 600 });
        if (!results.length) { await farm(bot, mine, 4); continue; }
        move = choose(results, mem.persona);
        // A cover cell that cannot be reached would otherwise win every plan: take the best move that is not defend.
        if (move === 'defend' && stuck) {
          const alt = results.filter((x) => x.move !== 'defend');
          if (alt.length) move = choose(alt, mem.persona);
        }
        log(`plan ${move} | ${results.sort((a, b) => b.n - a.n).map((x) => `${x.move} ${x.n} ${x.mean >= 0 ? '+' : ''}${x.mean.toFixed(2)}`).join(', ')} | me ${root.me.place} i${root.me.iron} g${root.me.gold} b${root.me.wool} s${root.me.sword} a${root.me.armour} bed${root.me.bedAlive ? root.me.cover : 'X'}; foe ~${root.foe.place} bed${root.foe.bedAlive ? root.foe.cover : 'X'}`);
      } else log('rule', move, '| me', root.me.place, 'i' + root.me.iron, 'g' + root.me.gold, 'b' + root.me.wool, 's' + root.me.sword, 'bed', root.me.bedAlive ? root.me.cover : 'X', '; foe bed', root.foe.bedAlive ? root.foe.cover : 'X');
      await bwPerform(bot, mem, move, B);
      // Remember a cover attempt that made no progress. A partly covered bed is the mark of one unreachable cell and
      // the mark stands until cover increases. An attempt that covered nothing at all is retried after 25 s (a bad
      // position must not ban defend forever); an attempt made with too few blocks sets no mark at all.
      if (move === 'defend') {
        const after = coverCount(bot, mine), tt = bot.arena.time || 0;
        if (after > root.me.cover) { mem.coverStuckAt = null; mem.coverStuckUntil = 0; }
        else if (root.me.wool >= 4) {
          mem.coverStuckAt = after;
          mem.coverStuckUntil = after > 0 ? 1e9 : tt + 25;
        }
      }
      await bot.waitForTicks(1);
    } catch (e) {
      log('error:', e.message);
      bot.clearControlStates();
      await bot.waitForTicks(4);
    }
  }
}

module.exports = { main };
