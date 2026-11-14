// House bot for SkyWars: a strategy program with no AI behind it (agentArena/bots/README.md). It uses only the arena's
// bot API (docs/strategy-api.md), as an agent's program does.
//
// Built from the lessons of the Gemini-vs-DeepSeek runs (agentArena/runs/gemini-vs-deepseek-sw*):
// - Rounds were lost to falls, not fights: a bridge stepped past its last block after "Cannot place a block inside
//   yourself" (sw3), a sneak at an island's edge (sw1). So: every block is placed from the centre of the block below,
//   the step forward follows only a placement that is seen in the world, the bot sneaks the whole time it bridges,
//   and on islands it walks with the pathfinder, which keeps off edges.
// - A program restarted mid-round went back to its first stage and walked off (sw5). So: no remembered stage; every
//   loop works out what to do from the world -- where I stand, what I carry, which chests are done, where the enemy is.
// - Nobody went looking (sw6, a tie with the players 19 blocks apart all round). So: after the middle, hunt; and once
//   the clock runs low, hunt whatever the loot.
// - The fights that decided rounds (sw2, sw4) were won by sprint hits at the attack cooldown, with a golden apple when
//   hurt. Kept, with a sprint reset (W-tap) before each hit for full knockback toward the void.

const MOVES = ['loot_own', 'rush_mid', 'loot_mid', 'hunt', 'camp_mid', 'rush_foe'];
const PLACES = { own: 0, mid: 1, foe: 2 };
const WALK = 4.3, BRIDGE_PER_BLOCK = 1.1, CHEST_S = 6, FIGHT_S = 8;

/**
 * One player in the abstract model. place: 'own' (its island), 'mid', 'foe' (the other's island), or 'way' (bridging);
 * gear grows with chests; blocks fall with bridging.
 */
function clonePlayer(p) { return { ...p, chests: { ...p.chests } }; }

/** The loot one chest gives, drawn: island chests mostly armour, blocks and a sword; the middle's better. */
function lootDraw(r, kind, greed) {
  const better = kind === 'mid' ? 1.6 : 1;
  return { armour: r() < 0.6 ? Math.round((1 + r() * 4) * better) : 0, weapon: r() < 0.4 ? Math.min(8, 4 + r() * 1.5 * better) : 0, blocks: r() < 0.7 ? Math.round(8 + r() * 24) : 0, apples: r() < (kind === 'mid' ? 0.4 : 0.15) ? 1 : 0 };
}

/** Where a move takes a player and how long it takes, in the model. */
function moveCost(world, p, move) {
  const gap = (a, b) => world.gaps[`${a}>${b}`] ?? 10;
  const travel = (to) => {
    if (p.place === to) return { t: 2 };
    const g = gap(p.place, to), built = world.bridges[`${p.place}>${to}`] || world.bridges[`${to}>${p.place}`];
    const dist = world.dists[`${p.place}>${to}`] ?? 24;
    if (built || g <= 0) return { t: dist / WALK };
    if (p.blocks < g) return null;
    return { t: dist / WALK + g * BRIDGE_PER_BLOCK, blocks: g, bridge: `${p.place}>${to}` };
  };
  switch (move) {
    case 'loot_own': return p.place === p.home && p.chests.own > 0 ? { t: CHEST_S, loot: 'own' } : null;
    case 'loot_mid': return p.place === 'mid' && world.midChests > 0 ? { t: CHEST_S, loot: 'mid' } : null;
    case 'rush_mid': { const c = p.place !== 'mid' && travel('mid'); return c ? { ...c, to: 'mid' } : null; }
    case 'rush_foe': { const c = p.place !== p.away && travel(p.away); return c ? { ...c, to: p.away } : null; }
    case 'hunt': { const at = p.target ?? 'mid', c = travel(at); return c ? { ...c, to: at } : null; }
    case 'camp_mid': return p.place === 'mid' ? { t: 6, camp: true } : null;
    default: return null;
  }
}

/** The other player's move in the model: plausible, randomised (loot, then the middle, then hunt). */
function foeMove(world, f, r) {
  const opts = [];
  if (f.place === f.home && f.chests.own > 0) opts.push(['loot_own', 3 - (f.chests.own === 1 ? 1.5 : 0)]);
  if (f.place !== 'mid') opts.push(['rush_mid', f.place === f.home && f.chests.own < 3 ? 2.5 : 1]);
  if (f.place === 'mid' && world.midChests > 0) opts.push(['loot_mid', 3]);
  opts.push(['hunt', world.t > 90 ? 2 : 0.5]);
  if (f.place === 'mid') opts.push(['camp_mid', 0.8]);
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
  // Travel ends where it goes when it is done (the playout moves the player then), not when it starts.
  if (c.to) { p.dest = c.to; p.from = p.place; }
  if (c.loot) {
    if (c.loot === 'own') p.chests.own--; else world.midChests--;
    const l = lootDraw(r, c.loot, 1);
    p.armour = Math.min(20, p.armour + l.armour); p.weapon = Math.max(p.weapon, l.weapon); p.blocks += l.blocks; p.apples += l.apples;
  }
  p.camping = !!c.camp;
  return p;
}

/** A fight in the model: the stronger side usually wins; a camper on its ground has the first hit. */
function modelFight(world, me, foe, r, persona) {
  const edge = (me.camping ? 1.5 : 0) - (foe.camping ? 1.5 : 0) + persona.nerve;
  const pWin = 1 / (1 + Math.exp(-(powerOf(me) - powerOf(foe) + edge) / 3));
  world.t += FIGHT_S;
  return r() < pWin ? 1 : -1;
}

/**
 * Play the model out from here: both players act whenever they are free, until a fight decides it, the clock runs out
 * or the horizon is reached. My moves are `plan` first, then random ones; returns +1 / -1 / a leaf estimate.
 */
function rollout(root, plan, r, persona, horizon) {
  const world = { ...root, bridges: { ...root.bridges }, gaps: root.gaps, dists: root.dists };
  const me = clonePlayer(root.me), foe = clonePlayer(root.foe);
  let i = 0;
  const end = Math.min(root.t + horizon, root.limit);
  while (world.t < end) {
    for (const p of [me, foe]) if (p.dest && p.busy <= world.t) { p.place = p.dest; p.dest = null; }
    // Meeting decides it: the same place, or crossing each other on the way between two places.
    const crossing = me.dest && foe.dest && me.dest === foe.from && foe.dest === me.from;
    if (me.place === foe.place || crossing) return modelFight(world, me, foe, r, persona);
    const actor = me.busy <= foe.busy ? me : foe;
    me.target = foe.place; foe.target = me.place;
    world.t = Math.max(world.t, actor.busy);
    if (world.t >= end) break;
    if (actor === me) {
      let move = plan[i++];
      if (!move) move = foeMove(world, me, r); // after the searched moves, the same sensible random policy as the other's
      if (!move || !apply(world, me, move, r)) me.busy = world.t + 3;
    } else if (!apply(world, foe, foeMove(world, foe, r), r)) foe.busy = world.t + 3;
  }
  // The clock ran out (a tie is worth nothing) or the horizon: how the fight would go, discounted.
  if (world.t >= root.limit) return 0;
  // Not decided: how a fight would go, worth less the less time is left to have it (a tie is 0).
  return Math.tanh((powerOf(me) - powerOf(foe) + persona.nerve) / 6) * 0.6 * Math.max(0, (root.limit - world.t) / root.limit);
}

/** The real state, as the model sees it. */
function modelState(bot, mem, P) {
  const t = bot.arena.time || 0, limit = bot.arena.timeLimit || 300;
  const place = (p) => {
    const d = { own: p.xzDistanceTo(P.own), mid: p.xzDistanceTo(P.mid), foe: p.xzDistanceTo(P.foe) };
    return Object.entries(d).sort((a, b) => a[1] - b[1])[0][0];
  };
  const worn = [5, 6, 7, 8].map((i) => bot.inventory.slots[i]?.name).filter(Boolean);
  const me = {
    home: 'own', away: 'foe', place: place(bot.entity.position), busy: t, hp: bot.health, apples: bot.inventory.count('golden_apple'),
    armour: armourPoints(worn), weapon: Math.max(1, ...items(bot).map(weaponScore)), blocks: blockCount(bot),
    chests: { own: P.ownChests.length },
  };
  // The other player: where it was seen lately, else where its plan most likely has it by now.
  const seen = mem.foe && t - mem.foe.t < 25 ? mem.foe : null;
  const guess = seen ? place(new Vec3(seen.x, seen.y, seen.z)) : t < 25 && !mem.foeBridging ? 'foe' : 'mid';
  const foe = {
    home: 'foe', away: 'own', place: guess, busy: t + 2, hp: 20, apples: t > 60 ? 0.4 : 0.1,
    armour: seen?.armour ?? Math.min(14, Math.round(t / 9)), weapon: seen?.weapon ?? Math.min(6, t < 6 ? 1 : 4 + t / 60),
    blocks: 32, chests: { own: t < 15 ? 3 : t < 35 ? 1 : 0 },
  };
  const gaps = {}, dists = {};
  for (const [a, b] of [['own', 'mid'], ['mid', 'foe'], ['own', 'foe']]) {
    const g = gapBetween(bot, P[a], P[b]), d = P[a].xzDistanceTo(P[b]);
    gaps[`${a}>${b}`] = gaps[`${b}>${a}`] = g; dists[`${a}>${b}`] = dists[`${b}>${a}`] = d;
  }
  return { t, limit, me, foe, gaps, dists, bridges: {}, midChests: P.midChests.length, guess };
}

/** Carry out a move in the real game, for at most `ms`. */
async function perform(bot, mem, move, P) {
  const here = bot.entity.position;
  const nearest = (list) => list.slice().sort((a, b) => here.distanceTo(v(a)) - here.distanceTo(v(b)))[0];
  switch (move) {
    case 'loot_own': if (P.ownChests.length) await loot(bot, nearest(P.ownChests), mem); return;
    case 'loot_mid': if (P.midChests.length) await loot(bot, nearest(P.midChests), mem); return;
    case 'rush_mid': log('to the middle:', await travel(bot, P.mid, { arrive: 7 })); return;
    case 'rush_foe': log('to their island:', await travel(bot, P.foe, { arrive: 5 })); return;
    case 'hunt': {
      const seen = mem.foe && bot.arena.time - mem.foe.t < 25 ? new Vec3(mem.foe.x, mem.foe.y, mem.foe.z) : null;
      log('hunting:', await travel(bot, seen || P.mid, { arrive: 3, interrupt: false }));
      return;
    }
    case 'camp_mid': {
      // Hold the middle near its chests, facing the way the other player would come.
      await walkTo(bot, P.mid, 3, 4000);
      await bot.lookAt(P.foe.offset(0, 1.5, 0));
      for (let i = 0; i < 20 && !enemy(bot); i++) await bot.waitForTicks(5);
      return;
    }
    default: await bot.waitForTicks(10);
  }
}

async function main(bot, mem) {
  mem.looted = mem.looted || {};
  mem.persona = mem.persona || newPersona(skywarsBias);
  bot.clearControlStates();
  log('started; island', bot.arena.me && bot.arena.me.slot, 'persona', JSON.stringify({ greed: +mem.persona.greed.toFixed(2), aggression: +mem.persona.aggression.toFixed(2), temperature: +mem.persona.temperature.toFixed(2) }));
  bot.on('death', () => log('died'));
  watchForHits(bot);
  // Blocks appearing far from me: the other player building (toward the middle, most often).
  bot.on('blockUpdate', (oldB, newB) => {
    if (!newB || newB.boundingBox !== 'block' || (oldB && oldB.boundingBox === 'block')) return;
    if (newB.position && bot.entity.position.distanceTo(newB.position) > 6) mem.foeBridging = (mem.foeBridging || 0) + 1;
  });
  for (;;) {
    try {
      if (bot.arena.phase !== 'playing' || (bot.arena.me && bot.arena.me.alive === false)) { await bot.waitForTicks(5); continue; }
      const L = bot.arena.landmarks || {};
      const slot = bot.arena.me && bot.arena.me.slot != null ? bot.arena.me.slot : 0;
      const here = bot.entity.position;
      trackFoe(bot, mem);

      // Reflexes first: a hit or a foe in sight (reactToThreat), then a foe in reach of a fight.
      if (await reactToThreat(bot, mem)) continue;
      const foe = enemy(bot);
      // Fight a foe close by -- with bare hands too (their knockback still sends a player over an edge): standing and
      // watching is the worst answer.
      if (foe && here.distanceTo(foe.position) <= (items(bot).some(weaponScore) ? 10 : 7)) { await fight(bot, foe, mem); continue; }
      const heard = enemy(bot, { heard: true });
      if (heard && heard.heard && here.distanceTo(heard.position) < 5) await bot.lookAt(heard.position.offset(0, 1.5, 0));

      // The places, and what is left to loot.
      const chests = L.chests || [];
      const todo = (list) => list.filter((c) => !mem.looted[`${c.x},${c.y},${c.z}`]);
      const spawns = L.spawns || [];
      const ownSpawn = spawns.find((s) => s.island === slot) || { x: 0.5, y: 31, z: -23.5 };
      const foeSpawn = spawns.filter((s) => s.island !== slot).sort((a, b) => v(a).distanceTo(v(ownSpawn)) - v(b).distanceTo(v(ownSpawn))).pop() || { x: 0.5, y: 31, z: 24.5 };
      const P = {
        own: v(ownSpawn), mid: v(L.middle || { x: 0.5, y: 31, z: 0.5 }), foe: v(foeSpawn),
        ownChests: todo(chests.filter((c) => c.kind === 'island' && c.island === slot)),
        midChests: todo(chests.filter((c) => c.kind === 'center' || c.kind === 'mid')),
      };

      // The planner: which move next, estimated by simulation, chosen with some freedom.
      const root = modelState(bot, mem, P);
      const results = await search(root, SKYWARS_MODEL, mem.persona);
      if (!results.length) { await bot.waitForTicks(10); continue; }
      let move = choose(results, mem.persona);
      // Never off my island bare-handed while my own chests still hold a weapon or armour: a foe that loots first and
      // then rushes (the MCP autopilot does) meets me on my bridge with an axe.
      if (move !== 'loot_own' && P.ownChests.length && !items(bot).some(weaponScore) && root.me.place === root.me.home) move = 'loot_own';
      log(`plan ${move} | ${results.sort((a, b) => b.n - a.n).map((x) => `${x.move} ${x.n} ${x.mean >= 0 ? '+' : ''}${x.mean.toFixed(2)}`).join(', ')} | me ${root.me.place} a${root.me.armour} w${root.me.weapon.toFixed(1)} b${root.me.blocks}; foe ~${root.guess} a${root.foe.armour}`);
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
    const world = { ...root, bridges: { ...root.bridges } };
    const me = clonePlayer(root.me);
    for (const m of prefix) { apply(world, me, m, () => 0.5); if (me.dest) { me.place = me.dest; me.dest = null; } }
    return MOVES.filter((m) => moveCost(world, me, m));
  },
  rollout,
};
const skywarsBias = (greed, aggression) => ({ loot_own: greed, loot_mid: greed, rush_mid: aggression, hunt: aggression, rush_foe: aggression * 0.9, camp_mid: 2 - aggression });

module.exports = { main };
