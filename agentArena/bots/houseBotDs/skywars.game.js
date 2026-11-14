// houseBotDs for SkyWars: a strategy program with no AI behind it, on the houseBotDs core.
//
// The round, from the research (notes/research.md): loot the island fast (armour -> weapon -> blocks), take the
// middle before the other player has it, and hold it; every chest refills at 3:00, so the middle is worth a second
// visit; knockback toward the void decides fights; and in the last part of a 5:00 round a player who does not hunt
// only ties. The planner keeps its Monte Carlo search, but the numbers it searches with now come from the map and
// from the bot's own measured bridge rate, and a few hard overrides make sure the clock never runs out on a loot.

const MOVES = ['loot_own', 'rush_mid', 'loot_mid', 'hunt', 'camp_mid', 'rush_foe', 'defend', 'wait'];
const SW_WALK = WALK_SPEED, SW_CHEST = 7, SW_FIGHT = 7, SW_REFILL = 180;

function clonePlayer(p) { return { ...p, chests: { ...p.chests } }; }

/** The loot one chest gives, drawn: island chests mostly armour, blocks and a sword; the middle's better. */
function lootDraw(r, kind) {
  if (kind === 'mid') {
    return {
      armour: r() < 0.8 ? 2 + Math.floor(r() * 5) : 0,
      weapon: r() < 0.4 ? 7 : 0,
      blocks: r() < 0.85 ? 8 + Math.floor(r() * 8) : 0,
      apples: r() < 0.35 ? 1 : 0,
      throwables: r() < 0.4 ? 1 : 0,
    };
  }
  return {
    armour: r() < 0.7 ? Math.round(1 + r() * 5) : 0,
    weapon: r() < 0.5 ? Math.round(5 + r()) : 0,
    blocks: r() < 0.8 ? 8 + Math.floor(r() * 8) : 0,
    apples: r() < 0.15 ? 1 : 0,
    throwables: r() < 0.25 ? 1 : 0,
  };
}

/** Where a move takes a player and how long it takes, in the model. */
function moveCost(world, p, move) {
  const gap = (a, b) => world.gaps[`${a}>${b}`] ?? 10;
  const travel = (to) => {
    if (p.place === to) return { t: 2 };
    const g = gap(p.place, to), built = world.bridges[`${p.place}>${to}`] || world.bridges[`${to}>${p.place}`];
    const dist = world.dists[`${p.place}>${to}`] ?? 24;
    if (built || g <= 0) return { t: dist / world.walk };
    if (p.blocks < g) return null;
    return { t: dist / world.walk + g * world.bridgeRate, blocks: g, bridge: `${p.place}>${to}` };
  };
  switch (move) {
    case 'loot_own': return p.place === p.home && p.chests.own > 0 ? { t: SW_CHEST, loot: 'own' } : null;
    case 'loot_mid': return p.place === 'mid' && world.midChests > 0 ? { t: SW_CHEST, loot: 'mid' } : null;
    case 'rush_mid': { if (p.place === 'mid') return null; const c = travel('mid'); return c ? { ...c, to: 'mid' } : null; }
    case 'rush_foe': { if (p.place === p.away) return null; const c = travel(p.away); return c ? { ...c, to: p.away } : null; }
    case 'hunt': { const at = p.target ?? 'mid'; if (p.place === at) return null; const c = travel(at); return c ? { ...c, to: at } : null; }
    case 'camp_mid': return p.place === 'mid' ? { t: 8, camp: true } : null;
    // Standing at home is only "defending" when someone is actually coming; otherwise it is just time thrown
    // away. Without this the model turned defend-at-home into a free camp and the bot idled at spawn for 11 s.
    // The same gate applies from elsewhere: walking home to defend from mid when nobody is heading at my island
    // cost round 2 thirty-three seconds (68 s -> 101 s) and the search still rated it a guaranteed win because
    // its foe policy hunts at t > 80 and fights a camper on my home ground.
    case 'defend': {
      if (!world.threat) return null;
      if (p.place === p.home) return { t: 6, camp: true };
      const c = travel(p.home); return c ? { ...c, to: p.home } : null;
    }
    case 'wait': return { t: 4 };
    default: return null;
  }
}

/** The other player's move in the model: plausible, randomised (loot, then the middle, then hunt). */
function foeMove(world, f, r) {
  const opts = [];
  if (f.place === f.home && f.chests.own > 0) opts.push(['loot_own', 3 - (f.chests.own === 1 ? 1.5 : 0)]);
  if (f.place !== 'mid') opts.push(['rush_mid', f.place === f.home && f.chests.own < 3 ? 2.5 : 1.2]);
  if (f.place === 'mid' && world.midChests > 0) opts.push(['loot_mid', 3]);
  opts.push(['hunt', world.t > 80 ? 2.5 : 0.6]);
  if (f.place === 'mid') opts.push(['camp_mid', 0.8]);
  opts.push(['wait', 0.2]);
  let total = opts.reduce((s, o) => s + o[1], 0), x = r() * total;
  for (const [m, w] of opts) { if ((x -= w) <= 0) return m; }
  return opts[0][0];
}

/** Apply a move to a player in the model; null if it cannot be done. */
function apply(world, p, move, r) {
  const c = moveCost(world, p, move);
  if (!c || c.t == null) return null;
  p.busy = world.t + c.t;
  if (c.blocks) p.blocks -= c.blocks;
  if (c.bridge) world.bridges[c.bridge] = true;
  if (c.to) { p.dest = c.to; p.from = p.place; }
  if (c.loot) {
    if (c.loot === 'own') p.chests.own--; else world.midChests--;
    const l = lootDraw(r, c.loot);
    p.armour = Math.min(20, p.armour + l.armour);
    p.weapon = Math.max(p.weapon, l.weapon);
    p.blocks += l.blocks;
    p.apples += l.apples;
    p.throwables = (p.throwables || 0) + l.throwables;
  }
  p.camping = !!c.camp;
  return p;
}

/** A fight in the model: the stronger side usually wins; a camper on its own ground has the first hit. */
function modelFight(world, me, foe, r, persona) {
  const edge = (me.camping ? 0.9 : 0) - (foe.camping ? 0.9 : 0)
    + (me.place === me.home ? 1.1 : 0) - (foe.place === foe.home ? 1.1 : 0)
    + persona.nerve;
  const pWin = 1 / (1 + Math.exp(-(powerOf(me) - powerOf(foe) + edge) / 3));
  world.t += SW_FIGHT;
  return r() < pWin ? 1 : -1;
}

/** Play the model out from here; my searched moves first, then the same sensible random policy as the other's. */
function rollout(root, plan, r, persona, horizon) {
  const world = { ...root, bridges: { ...root.bridges }, gaps: root.gaps, dists: root.dists };
  const me = clonePlayer(root.me), foe = clonePlayer(root.foe);
  me.throwables = me.throwables || 0; foe.throwables = foe.throwables || 0;
  let i = 0;
  const end = Math.min(root.t + horizon, root.limit);
  while (world.t < end) {
    if (!world.refilled && world.t >= SW_REFILL) {
      world.refilled = true;
      world.midChests = 4;
      me.chests.own = 3; foe.chests.own = 3;
    }
    for (const p of [me, foe]) if (p.dest && p.busy <= world.t) { p.place = p.dest; p.dest = null; }
    world.threat = foe.place === 'own' || foe.dest === 'own';
    const crossing = me.dest && foe.dest && me.dest === foe.from && foe.dest === me.from;
    if (me.place === foe.place || crossing) return modelFight(world, me, foe, r, persona);
    const actor = me.busy <= foe.busy ? me : foe;
    me.target = foe.place; foe.target = me.place;
    world.t = Math.max(world.t, actor.busy);
    if (world.t >= end) break;
    if (actor === me) {
      let move = plan[i++];
      if (!move) move = foeMove(world, me, r);
      if (!move || !apply(world, me, move, r)) me.busy = world.t + 3;
    } else if (!apply(world, foe, foeMove(world, foe, r), r)) foe.busy = world.t + 3;
  }
  if (world.t >= root.limit) return 0;
  // Not decided: how a fight would go, worth less the less time is left to have it (a tie is 0).
  return Math.tanh((powerOf(me) - powerOf(foe) + persona.nerve) / 6) * 0.55 * Math.max(0, (root.limit - world.t) / root.limit);
}

/** The real state, as the model sees it. Async only to spread the three line scans over three CPU slices. */
async function modelState(bot, mem, P) {
  const t = bot.arena.time || 0, limit = bot.arena.timeLimit || 300;
  const place = (p) => {
    const d = { own: p.xzDistanceTo(P.own), mid: p.xzDistanceTo(P.mid), foe: p.xzDistanceTo(P.foe) };
    return Object.entries(d).sort((a, b) => a[1] - b[1])[0][0];
  };
  const worn = [5, 6, 7, 8].map((i) => bot.inventory.slots[i]?.name).filter(Boolean);
  const me = {
    home: 'own', away: 'foe', place: place(bot.entity.position), busy: t, hp: bot.health, apples: bot.inventory.count('golden_apple'),
    armour: armourPoints(worn), weapon: Math.max(1, ...items(bot).map(weaponScore)), blocks: blockCount(bot),
    throwables: items(bot).filter((it) => THROWABLE.test(it.name)).reduce((n, it) => n + it.count, 0),
    chests: { own: P.ownChests.length },
  };
  // The other player: where it was seen lately; else what its blocks say; else where a sensible player is by now.
  const seen = mem.foe && t - mem.foe.t < 25 ? mem.foe : null;
  const incoming = mem.incomingAt && t - mem.incomingAt < 30;
  const guess = seen ? place(new Vec3(seen.x, seen.y, seen.z)) : incoming ? 'own' : t < 20 ? 'foe' : 'mid';
  const threat = !!incoming || guess === 'own' || !!(seen && new Vec3(seen.x, seen.y, seen.z).distanceTo(P.own) < 18);
  const foe = {
    home: 'foe', away: 'own', place: guess, busy: t + 2, hp: 20,
    apples: t > 60 ? 0.5 : 0.1, throwables: t > 40 ? 1 : 0,
    armour: seen?.armour ?? Math.min(17, Math.round(t / 8)),
    weapon: seen?.weapon ?? (t < 10 ? 4 : t < 40 ? 5 : t < 90 ? 6 : 7),
    blocks: seen?.blocks === true ? 16 : 24,
    chests: { own: t < 15 ? 3 : t < 40 ? 1 : 0 },
  };
  const gaps = {}, dists = {};
  for (const [a, b] of [['own', 'mid'], ['mid', 'foe'], ['own', 'foe']]) {
    gaps[`${a}>${b}`] = gaps[`${b}>${a}`] = gapBetween(bot, P[a], P[b]);
    dists[`${a}>${b}`] = dists[`${b}>${a}`] = P[a].xzDistanceTo(P[b]);
    await sleep(0);                       // one scan per 50 ms slice (Bed Wars round 1: three in one slice restarted main)
  }
  return {
    t, limit, me, foe, gaps, dists, bridges: {}, midChests: P.midChests.length, guess, threat,
    walk: SW_WALK, bridgeRate: mem.bridgeRate || 1.0, refilled: t >= SW_REFILL,
  };
}

/** Carry out a move in the real game. Travel moves report their measured placement cost to the planner. */
async function perform(bot, mem, move, P) {
  const here = bot.entity.position;
  const nearest = (list) => list.slice().sort((a, b) => here.distanceTo(v(a)) - here.distanceTo(v(b)))[0];
  const durations = [];
  const onPlaced = (dt) => durations.push(dt);
  const go = async (target, opts = {}) => {
    const r = await travel(bot, target, { ...opts, onPlaced });
    if (durations.length) noteBridge(mem, durations);
    return r;
  };
  switch (move) {
    case 'loot_own': if (P.ownChests.length) await loot(bot, nearest(P.ownChests), mem); return;
    case 'loot_mid': if (P.midChests.length) await loot(bot, nearest(P.midChests), mem); return;
    case 'rush_mid': log('to the middle:', await go(P.mid, { arrive: 7 })); return;
    case 'rush_foe': log('to their island:', await go(P.foe, { arrive: 5 })); return;
    case 'hunt': {
      const seen = mem.foe && bot.arena.time - mem.foe.t < 20 ? new Vec3(mem.foe.x, mem.foe.y, mem.foe.z) : null;
      log('hunting:', await go(seen || P.mid, { arrive: 3 }));
      return;
    }
    case 'camp_mid': {
      await walkTo(bot, P.mid, 3, 4000);
      await bot.lookAt(P.foe.offset(0, 1.5, 0));
      // A long wait faces one way; a player heard behind me, or a hit, ends it (the main loop reacts).
      for (let i = 0; i < 24; i++) { if (enemy(bot, { heard: true }) || threatened(bot, 8)) break; await bot.waitForTicks(5); }
      return;
    }
    case 'defend': {
      log('defending home:', await go(P.own, { arrive: 4 }));
      const at = mem.foe && bot.arena.time - mem.foe.t < 20 ? new Vec3(mem.foe.x, mem.foe.y, mem.foe.z) : P.mid;
      await bot.lookAt(at.offset(0, 1.5, 0));
      for (let i = 0; i < 12; i++) { if (enemy(bot, { heard: true }) || threatened(bot, 8)) break; await bot.waitForTicks(5); }
      return;
    }
    case 'wait': await bot.lookAt(P.mid.offset(0, 1.5, 0)); await bot.waitForTicks(8); return;
    default: await bot.waitForTicks(10);
  }
}

async function main(bot, mem) {
  mem.looted = mem.looted || {};
  mem.lootRetry = mem.lootRetry || {};
  mem.persona = mem.persona || newPersona(skywarsBias);
  bot.clearControlStates();
  log('started; island', bot.arena.me && bot.arena.me.slot, 'persona', JSON.stringify({ greed: +mem.persona.greed.toFixed(2), aggression: +mem.persona.aggression.toFixed(2), temperature: +mem.persona.temperature.toFixed(2) }));
  bot.on('death', () => log('died'));
  watchForHits(bot);          // my own hurts: a sword, or a health drop from an arrow I never saw
  // Blocks appearing away from me: the other player building. Those near my spawn are a bridge at me.
  bot.on('blockUpdate', (oldB, newB) => {
    if (!newB || newB.boundingBox !== 'block' || (oldB && oldB.boundingBox === 'block')) return;
    if (!newB.position || bot.entity.position.distanceTo(newB.position) <= 6) return;
    mem.foeBridging = (mem.foeBridging || 0) + 1;
    const L = bot.arena.landmarks || {};
    const spawns = L.spawns || [];
    const slot = bot.arena.me && bot.arena.me.slot != null ? bot.arena.me.slot : 0;
    const own = spawns.find((s) => s.island === slot);
    if (own && newB.position.distanceTo(v(own)) < 16) mem.incomingAt = bot.arena.time;
  });
  for (;;) {
    try {
      if (bot.arena.phase !== 'playing' || (bot.arena.me && bot.arena.me.alive === false)) { await bot.waitForTicks(5); continue; }
      const L = bot.arena.landmarks || {};
      const slot = bot.arena.me && bot.arena.me.slot != null ? bot.arena.me.slot : 0;
      const here = bot.entity.position;
      trackFoe(bot, mem);

      // Whatever just happened to me comes first: a hit, or a player seen or only heard near me.
      if (await reactToThreat(bot, mem)) continue;

      // Reflexes: a foe close enough to hit, or on the same land as me with a weapon in hand.
      const foe = enemy(bot);
      if (foe) {
        const d = here.distanceTo(foe.position);
        const armed = items(bot).some(weaponScore);
        // The line scan only runs when it can change the answer: a foe in melee is engaged anyway, and a foe
        // beyond nine blocks is not chased by this reflex.
        // A sword reaches 3; a player at 5-6 closes that in under a second, and the house bot loosed a bow at
        // 5.7 in round 3 while this bot kept bridging (5.5 was 0.2 too far). Six: close and trade, not bridge.
        const close = d <= (armed ? 6 : 3.5);
        const sameLand = !close && armed && d <= 9 && gapBetween(bot, here, foe.position) === 0;
        if (close || sameLand) { await fight(bot, foe, mem); continue; }
      }

      // The places, and what is left to loot (a chest is per refill epoch: 3:00 refills every chest).
      const chests = L.chests || [];
      const todo = (list) => list.filter((c) => !mem.looted[chestKey(bot, c)] && (mem.lootRetry[chestKey(bot, c)] || 0) <= (bot.arena.time || 0));
      const spawns = L.spawns || [];
      const ownSpawn = spawns.find((s) => s.island === slot) || { x: 0.5, y: 31, z: -23.5 };
      const foeSpawn = spawns.filter((s) => s.island !== slot).sort((a, b) => v(a).distanceTo(v(ownSpawn)) - v(b).distanceTo(v(ownSpawn))).pop() || { x: 0.5, y: 31, z: 24.5 };
      const P = {
        own: v(ownSpawn), mid: v(L.middle || { x: 0.5, y: 31, z: 0.5 }), foe: v(foeSpawn),
        ownChests: todo(chests.filter((c) => c.kind === 'island' && c.island === slot)),
        midChests: todo(chests.filter((c) => c.kind === 'center' || c.kind === 'mid')),
      };

      const root = await modelState(bot, mem, P);
      let move;
      const lead = powerOf(root.me) - powerOf(root.foe);
      const timeLeft = bot.arena.timeLeft != null ? bot.arena.timeLeft : root.limit - root.t;
      // The clock is the harshest opponent: never let a loot or a camp run it out with a fight still available.
      if (timeLeft <= 70 && lead > -2) move = 'hunt';
      else if (lead > 4 && timeLeft <= 120) move = 'hunt';
      else if (mem.incomingAt && root.t - mem.incomingAt < 30 && root.me.place !== 'own') move = 'defend';
      // Loot first: an unlooted chest on my own island with no real kit beats any plan. In round 1 the search
      // spent the first 11 s on defend/wait at spawn before opening the first chest, while the house bot geared.
      else if (!root.threat && root.me.place === 'own' && P.ownChests.length && (root.me.weapon < 5 || root.me.blocks < 16 || root.me.armour < 8)) move = 'loot_own';
      else {
        // 600 iterations, not 900: eight per CPU slice, and the round-3 opening had one move taking 836 of 900
        // visits anyway. A plan is re-drawn every second or two; a coarser search costs little.
        const results = await search(root, SKYWARS_MODEL, mem.persona, { iterations: 600 });
        if (!results.length) { await bot.waitForTicks(10); continue; }
        move = choose(results, mem.persona);
        log(`plan ${move} | ${results.sort((a, b) => b.n - a.n).map((x) => `${x.move} ${x.n} ${x.mean >= 0 ? '+' : ''}${x.mean.toFixed(2)}`).join(', ')} | me ${root.me.place} a${root.me.armour} w${root.me.weapon.toFixed(1)} b${root.me.blocks}; foe ~${root.guess} a${root.foe.armour}`);
      }
      if (move === 'hunt') log('endgame hunt; time left', Math.round(timeLeft), 'lead', lead.toFixed(1));
      await perform(bot, mem, move, P);
      await bot.waitForTicks(1);
    } catch (e) {
      log('error:', e.message);
      bot.clearControlStates();
      await bot.waitForTicks(4);
    }
  }
}

/** SkyWars for the search: the moves open after a prefix of mine, and a playout. */
const SKYWARS_MODEL = {
  legal(root, prefix) {
    const world = { ...root, bridges: { ...root.bridges }, threat: root.threat };
    const me = clonePlayer(root.me);
    for (const m of prefix) { apply(world, me, m, () => 0.5); if (me.dest) { me.place = me.dest; me.dest = null; } }
    const legal = MOVES.filter((m) => moveCost(world, me, m));
    // Waiting is a fallback for having literally nothing else to do, not a plan: the search used it to dodge
    // the fight and coast a tie. Keep it only when no other move exists.
    return legal.length > 1 ? legal.filter((m) => m !== 'wait') : legal;
  },
  rollout,
};
const skywarsBias = (greed, aggression) => ({
  loot_own: greed, loot_mid: greed * 1.1, rush_mid: aggression * 1.2, hunt: aggression,
  rush_foe: aggression * 0.8, camp_mid: 1.5 - aggression * 0.5, defend: 1, wait: 0.2,
});

module.exports = { main };
