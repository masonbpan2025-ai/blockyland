// House bot for Bed Wars: a strategy program with no AI behind it, on the house bots' core (bots/core.js).
//
// Bed Wars is a race between economy, defence and attack: farm iron at the forge, buy wool and gear at the Item Shop,
// cover your bed with wool, bridge over and break the enemy's bed, then kill the enemy for good. None of these is always
// the right next step (cover the bed first, or rush before the enemy has wool? another sword, or armour?), so the
// planner (core.js: a Monte Carlo tree search over a model of the round) estimates the next move from the real state:
// what I carry, my bed and its cover, the enemy's bed and its cover (read from the world), the gaps to bridge (measured
// from the blocks), what I have seen of the enemy, and the clock. Each bot has its own personality, so games differ.

const BW_MOVES = ['farm', 'buy_wool', 'buy_sword', 'buy_armour', 'defend', 'rush', 'hunt', 'go_home'];
const IRON_PER_S = 1 / 1.5, GOLD_PER_S = 1 / 6, BW_WALK = 4.3, BW_BRIDGE = 1.1;
const RESPAWN_S = 5, BREAK_S = 3, COVER_BREAK_S = 5;

const bwClone = (p) => ({ ...p });

/** Travel in the model: walking where there is ground or a bridge, else bridging with wool. */
function bwTravel(world, p, to) {
  if (p.place === to) return { t: 1 };
  const key = `${p.place}>${to}`, g = world.gaps[key] ?? 15, d = world.dists[key] ?? 40;
  if (g <= 0 || world.bridges[key] || world.bridges[`${to}>${p.place}`]) return { t: d / BW_WALK, to };
  if (p.wool < g) return null;
  return { t: d / BW_WALK + g * BW_BRIDGE, wool: g, bridge: key, to };
}

/** What a move costs and gives in the model, or null when it cannot be done. */
function bwCost(world, p, move) {
  const home = p.place === p.home;
  switch (move) {
    case 'farm': return home ? { t: 8, iron: 8 * IRON_PER_S, gold: 8 * GOLD_PER_S } : null;
    case 'buy_wool': return home && p.iron >= 4 ? { t: 3, iron: -4, woolGain: 16 } : null;
    case 'buy_sword': return home && p.sword < 5 && p.iron >= 10 ? { t: 3, iron: -10, sword: 5 } : home && p.sword < 6 && p.gold >= 7 ? { t: 3, gold: -7, sword: 6 } : null;
    // Armour points worn: leather 7, with chainmail leggings and boots 9, with iron 11 (the shop sells those two).
    case 'buy_armour': return home && p.armour < 9 && p.iron >= 24 ? { t: 3, iron: -24, armour: 9 } : home && p.armour < 11 && p.gold >= 12 ? { t: 3, gold: -12, armour: 11 } : null;
    case 'defend': return home && p.bedAlive && p.cover < 1 && p.wool >= 8 ? { t: 8, woolUse: 8, cover: 1 } : null;
    case 'rush': { const c = p.foeBed() ? bwTravel(world, p, p.away) : null; return c ? { ...c, rush: true } : null; }
    case 'hunt': { const c = bwTravel(world, p, p.target ?? p.away); return c && p.place !== (p.target ?? p.away) ? c : null; }
    case 'go_home': { const c = !home && bwTravel(world, p, p.home); return c || null; }
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
  if (c.cover) p.cover += c.cover;
  if (c.bridge) world.bridges[c.bridge] = true;
  // Travel ends where it goes when it is done (the playout moves the player then).
  if (c.to) { p.dest = c.to; p.from = p.place; }
  p.rushing = !!c.rush;
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
    if (f.iron >= 24 && f.armour < 9) opts.push(['buy_armour', 1.2]);
    if (f.bedAlive && f.cover < 1 && f.wool >= 8) opts.push(['defend', 1.2]);
    opts.push(['farm', f.wool < need ? 2.5 : 0.8]);
  } else opts.push(['go_home', f.wool < 4 ? 2 : 0.3]);
  opts.push(['rush', f.wool >= need - 8 ? 3 : 0.3], ['hunt', world.t > 100 ? 1.2 : 0.3]);
  const legal = opts.filter(([m]) => bwCost(world, f, m));
  let total = legal.reduce((s, o) => s + o[1], 0), x = r() * total;
  for (const [m, w] of legal) if ((x -= w) <= 0) return m;
  return legal[0] ? legal[0][0] : null;
}

/** A meeting: the loser respawns at home with nothing carried (bed standing) or is out. */
function bwFight(world, a, b, r, persona) {
  const pA = 1 / (1 + Math.exp(-(bwPower(a) - bwPower(b) + (a.isMe ? persona.nerve : -persona.nerve)) / 3));
  const loser = r() < pA ? b : a;
  world.t += 6;
  if (!loser.bedAlive) loser.out = true;
  else Object.assign(loser, { place: loser.home, dest: null, busy: world.t + RESPAWN_S, wool: 0, iron: 0, gold: 0, sword: 4, rushing: false });
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
    // A rush that reached the enemy base with nobody there breaks the bed (through its cover).
    for (const [p, q] of [[me, foe], [foe, me]]) {
      if (p.rushing && p.place === p.away && q.bedAlive && q.place !== q.home) { q.bedAlive = false; p.rushing = false; p.busy += BREAK_S + q.cover * COVER_BREAK_S; }
    }
    // Meeting: the same place, or crossing each other on the way.
    const crossing = me.dest && foe.dest && me.dest === foe.from && foe.dest === me.from;
    if (me.place === foe.place || crossing) { if (crossing) { me.place = foe.place = 'mid'; me.dest = foe.dest = null; } bwFight(world, me, foe, r, persona); }
    if (me.out) return -1;
    if (foe.out) return 1;
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
    return BW_MOVES.filter((m) => bwCost(world, me, m));
  },
  rollout: bwRollout,
};
const bedwarsBias = (greed, aggression) => ({ farm: greed, buy_wool: 1, buy_sword: 1, buy_armour: greed, defend: 2 - aggression, rush: aggression, hunt: aggression, go_home: 1 });

// --- the real game ---------------------------------------------------------------------------------------------------

const bedAt = (bot, base) => { const b = bot.blockAt(v(base.bed.head)); return !!b && /bed/.test(b.name); };
/** The bed's cover cells: on top of both halves, and round them at bed level. */
function coverCells(base) {
  const f = v(base.bed.foot), h = v(base.bed.head), dir = h.minus(f);
  const side = new Vec3(dir.z, 0, -dir.x);
  const cells = [f.offset(0, 1, 0), h.offset(0, 1, 0), f.minus(dir), h.plus(dir), f.plus(side), f.minus(side), h.plus(side), h.minus(side)];
  return { cells, dir, f, h };
}
const coverCount = (bot, base) => coverCells(base).cells.filter((c) => solid(bot, c)).length;

async function buy(bot, base, key) {
  if (!(await walkTo(bot, v(base.shop), 2, 8000))) return false;
  const npc = bot.nearestEntity((e) => e.displayName === 'Item Shop' && (!e.team || e.team === base.team));
  if (!npc) return false;
  try {
    const w = await bot.activateEntity(npc);
    const win = w || bot.currentWindow;
    const slot = win ? win.slots.findIndex((s) => s && s.key === key) : -1;
    if (slot < 0) { log('no offer', key); return false; }
    await bot.clickWindow(slot, 0, 0);
    log('bought', key);
    return true;
  } catch (e) { log('shop:', e.message); return false; } finally { try { if (bot.currentWindow) bot.closeWindow(bot.currentWindow); } catch { /* closed */ } }
}

async function farm(bot, base, seconds) {
  if (!(await walkTo(bot, v(base.forge), 0.6, 8000))) return;
  for (let i = 0; i < seconds * 4; i++) {
    if (threatened(bot)) return; // hit, or someone close (seen or only heard): stop farming and turn to fight
    await bot.waitForTicks(5);
  }
}

async function coverBed(bot, base) {
  const { cells, dir, f } = coverCells(base);
  // Stand behind the bed (its foot side), in reach of every cover cell.
  const stand = f.minus(dir.scaled ? dir.scaled(2) : new Vec3(dir.x * 2, 0, dir.z * 2));
  await walkTo(bot, stand.offset(0.5, 0, 0.5), 1, 6000);
  // Sides first (on the ground), then the tops (against the bed, or a side placed).
  for (const c of [...cells.slice(2), ...cells.slice(0, 2)]) {
    if (threatened(bot)) return;
    if (solid(bot, c)) continue;
    if (!(await holdBlock(bot))) return;
    const refs = [[new Vec3(0, -1, 0)], [new Vec3(1, 0, 0)], [new Vec3(-1, 0, 0)], [new Vec3(0, 0, 1)], [new Vec3(0, 0, -1)]];
    for (const [off] of refs) {
      const ref = c.plus(off);
      const b = bot.blockAt(ref);
      if (!b || b.name === 'air' || (b.boundingBox !== 'block' && !/bed/.test(b.name))) continue;
      try { await bot.lookAt(ref.offset(0.5, 0.5, 0.5)); await bot.placeBlock(b, new Vec3(-off.x, -off.y, -off.z)); break; } catch { /* the next face */ }
    }
  }
  log('bed covered:', coverCount(bot, base), 'of 8');
}

async function breakBed(bot, base) {
  const { cells, dir, h } = coverCells(base);
  // Come at it from the middle's side: the bed's head faces the middle.
  const r = await travel(bot, h.plus(new Vec3(dir.x * 2, 0, dir.z * 2)).offset(0.5, 1, 0.5), { arrive: 2 });
  if (r !== 'arrived') { log('rush:', r); return; }
  for (let tries = 0; tries < 12 && bedAt(bot, base); tries++) {
    if (Date.now() - awareness.hurtAt < 1500) return; // hit while breaking it: fight first
    try { await bot.dig(bot.blockAt(h)); } catch (e) {
      // Covered: dig the cover nearest me first.
      const c = cells.filter((x) => solid(bot, x)).sort((a, b) => bot.entity.position.distanceTo(a) - bot.entity.position.distanceTo(b))[0];
      if (!c) break;
      try { await bot.dig(bot.blockAt(c)); } catch { await bot.waitForTicks(4); }
    }
  }
  log(bedAt(bot, base) ? 'the bed still stands' : 'BROKE THE BED');
}

/** The real state, as the Bed Wars model sees it. */
function bwState(bot, mem, B) {
  const t = bot.arena.time || 0, limit = bot.arena.timeLimit || 600;
  const place = (p) => {
    const d = { own: p.xzDistanceTo(B.own), mid: p.xzDistanceTo(B.mid), foe: p.xzDistanceTo(B.foe) };
    return Object.entries(d).sort((a, b) => a[1] - b[1])[0][0];
  };
  const worn = [5, 6, 7, 8].map((i) => bot.inventory.slots[i]?.name).filter(Boolean);
  const me = {
    home: 'own', away: 'foe', place: place(bot.entity.position), busy: t, iron: bot.inventory.count('iron_ingot'), gold: bot.inventory.count('gold_ingot'),
    wool: blockCount(bot), sword: Math.max(1, ...items(bot).map(weaponScore)), armour: armourPoints(worn), bedAlive: bedAt(bot, B.mine), cover: coverCount(bot, B.mine) >= 6 ? 1 : 0,
  };
  const seen = mem.foe && t - mem.foe.t < 25 ? mem.foe : null;
  const foe = {
    home: 'foe', away: 'own', place: seen ? place(new Vec3(seen.x, seen.y, seen.z)) : t < 30 ? 'foe' : 'mid', busy: t + 2,
    iron: Math.min(20, t * IRON_PER_S * 0.4), gold: 0, wool: t < 15 ? 0 : 24, sword: seen?.weapon ?? (t < 20 ? 4 : 5), armour: seen?.armour ?? (t < 90 ? 7 : 12),
    bedAlive: bedAt(bot, B.theirsBase), cover: coverCount(bot, B.theirsBase) >= 6 ? 1 : 0,
  };
  const gaps = {}, dists = {};
  for (const [a, b] of [['own', 'mid'], ['mid', 'foe'], ['own', 'foe']]) {
    const g = gapBetween(bot, B[a], B[b]), d = B[a].xzDistanceTo(B[b]);
    gaps[`${a}>${b}`] = gaps[`${b}>${a}`] = g; dists[`${a}>${b}`] = dists[`${b}>${a}`] = d;
  }
  return { t, limit, me, foe, gaps, dists, bridges: {} };
}

async function bwPerform(bot, mem, move, B) {
  switch (move) {
    case 'farm': await farm(bot, B.mine, 8); return;
    case 'buy_wool': await buy(bot, B.mine, 'wool'); return;
    case 'buy_sword': await buy(bot, B.mine, bot.inventory.count('iron_ingot') >= 10 ? 'stone_sword' : 'iron_sword'); await holdWeapon(bot); return;
    case 'buy_armour': await buy(bot, B.mine, bot.inventory.count('iron_ingot') >= 24 ? 'chain_armor' : 'iron_armor'); return;
    case 'defend': await coverBed(bot, B.mine); return;
    case 'rush': await breakBed(bot, B.theirsBase); return;
    case 'hunt': {
      const seen = mem.foe && bot.arena.time - mem.foe.t < 25 ? new Vec3(mem.foe.x, mem.foe.y, mem.foe.z) : B.foe;
      log('hunting:', await travel(bot, seen, { arrive: 3, interrupt: false }));
      return;
    }
    case 'go_home': log('home:', await travel(bot, v(B.mine.spawn), { arrive: 3 })); return;
    default: await bot.waitForTicks(10);
  }
}

async function main(bot, mem) {
  mem.persona = mem.persona || newPersona(bedwarsBias);
  bot.clearControlStates();
  log('started; team', bot.arena.me && bot.arena.me.team, 'persona', JSON.stringify({ greed: +mem.persona.greed.toFixed(2), aggression: +mem.persona.aggression.toFixed(2), temperature: +mem.persona.temperature.toFixed(2) }));
  bot.on('death', () => log('died'));
  watchForHits(bot);
  for (;;) {
    try {
      const me = bot.arena.me || {};
      if (bot.arena.phase !== 'playing' || me.alive === false || me.respawning) { await bot.waitForTicks(5); continue; }
      const L = bot.arena.landmarks || {};
      const bases = L.bases || [];
      const mine = bases.find((b) => b.team === me.team), theirs = bases.find((b) => b.team !== me.team);
      if (!mine || !theirs) { await bot.waitForTicks(10); continue; }
      const here = bot.entity.position;
      trackFoe(bot, mem);
      const foe = enemy(bot);
      // Reflexes: a hit or a foe in sight (reactToThreat), a foe close by, or at my bed while I am there to defend it.
      if (await reactToThreat(bot, mem)) continue;
      const atMyBed = foe && foe.position.distanceTo(v(mine.bed.head)) < 7 && here.distanceTo(v(mine.bed.head)) < 16;
      if (foe && (here.distanceTo(foe.position) <= 8 || atMyBed)) { await fight(bot, foe, mem); continue; }

      const mid = L.middle ? v(L.middle) : new Vec3(0.5, 31, 0.5);
      const B = { mine, theirsBase: theirs, own: v(mine.spawn), foe: v(theirs.spawn), mid };
      const root = bwState(bot, mem, B);
      const results = await search(root, BEDWARS_MODEL, mem.persona, { horizon: 180 });
      if (!results.length) { await farm(bot, mine, 4); continue; }
      const move = choose(results, mem.persona);
      log(`plan ${move} | ${results.sort((a, b) => b.n - a.n).map((x) => `${x.move} ${x.n} ${x.mean >= 0 ? '+' : ''}${x.mean.toFixed(2)}`).join(', ')} | me ${root.me.place} i${root.me.iron} w${root.me.wool} s${root.me.sword} a${root.me.armour} bed${root.me.bedAlive ? root.me.cover : 'X'}; foe bed${root.foe.bedAlive ? root.foe.cover : 'X'}`);
      await bwPerform(bot, mem, move, B);
      await bot.waitForTicks(1);
    } catch (e) {
      log('error:', e.message);
      bot.clearControlStates();
      await bot.waitForTicks(4);
    }
  }
}

module.exports = { main };
