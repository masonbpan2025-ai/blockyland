// The team's safety kit. Run it once at the start of every session, and again whenever an output says your client
// was restarted:   bl run kit/safety.js
// It installs reflexes that act on their own, within a tick, while you think and while your programs run, and helpers
// on `global.safe` for your programs.
//
// When a hostile mob hurts you, the kit takes over: it stops your running programs (your `bl run` returns "stopped by
// the safety kit: ...", so you can see what happened), draws your best weapon, and decides by your gear (docs/strategy.md
// section 3):
//  - FIGHT: one mob you can reach, with a stone sword or better and over 10 HP (two mobs: an iron sword, or stone and
//    2+ armour pieces, and over 12 HP). It fights until the mob is dead or you drop to 10 HP, then runs.
//  - RUN: a creeper, an Enderman, 3+ mobs, an archer you cannot reach, no weapon, or 8 HP or less. It runs by path
//    (no drop over 3 blocks, no water) to a teammate who answered COMING, else home, else away from the mob; if it
//    cannot get away (a pit, a corner), it walls itself off from the mob with blocks (HOLD).
//  It calls `HELP <mob> at x y z, N HP, <gear>: FIGHTING|RUNNING|WALLED IN` in chat (at most every 15 s).
// When a teammate calls HELP, your kit answers for you (unless you set `safe.autoHelp = false`): with a stone sword or
// better, 14+ HP, within 32 blocks and not in a fight of your own, it says `COMING <name> ...`, stops your programs, goes
// there and fights beside them; one helper for a single melee mob, two for an archer or a group. Otherwise it says why
// it cannot (`CAN'T HELP <name>: ...`) when it is within 32 blocks.
// Also: in water with air at 8 or less, swim up; in lava, jump back out; hungry, or hurt with food under 18, eat.
//
// Helpers (they throw an Error with the reason when something is not safe):
//  safe.status()              hp, food, air, position, gear, danger, the reflexes' recent log
//  safe.setHome()             remember this spot as home (flee towards it)
//  safe.goto(x, y, z, range)  pathfind with safe settings (no drops over 3, no parkour, avoid water)
//  safe.dig(block)            dig unless lava/water is next to it, sand/gravel is above it, or it is under your feet
//  safe.fight(mobOrName, ms)  draw your best weapon and fight one mob (a program that fights on purpose uses this, so the
//                             kit does not stop it); returns { result, hits, hp }
//  safe.drawWeapon()          hold your best weapon; safe.gear() what you have: { weapon, tier, armor, shield }
//  safe.hold(mob)             wall yourself off from a mob with blocks from your inventory
//  safe.dangersNear(r)        lava and water blocks within r
//  safe.fled(since)           true if a reflex took over after time `since` (Date.now()): end your program then
const { goals, Movements } = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');

if (global.safe?.uninstall) global.safe.uninstall();
const S = global.safe = { home: global.safe?.home ?? null, autoHelp: global.safe?.autoHelp ?? true, danger: null, log: [], lastHelp: 0, fleeing: false, responding: null, engagedUntil: 0, coming: {} };
const note = (s) => { S.log.push(`t${bot.time.age} ${s}`); if (S.log.length > 15) S.log.shift(); };
const pos = () => bot.entity.position;
const fmt = (p) => `${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const within = (promise, ms) => Promise.race([promise, sleep(ms).then(() => { try { bot.pathfinder.stop(); } catch {} throw new Error(`took over ${ms / 1000} s`); })]);
const hostiles = (r, at = pos()) => Object.values(bot.entities).filter(e => e.type === 'hostile' && e.position && e.isValid !== false && e.position.distanceTo(at) < r);
// Cooked food first; raw meat only when starving (it feeds little: cook it), never raw chicken (it can poison).
const FOODS = ['cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'cooked_chicken', 'cooked_salmon', 'cooked_cod', 'bread', 'baked_potato', 'cooked_rabbit', 'golden_carrot', 'apple', 'carrot', 'melon_slice', 'sweet_berries'];
const RAW = ['beef', 'porkchop', 'mutton', 'cod', 'salmon', 'potato', 'rabbit'];
const RANGED = new Set(['skeleton', 'stray', 'bogged', 'pillager', 'witch', 'blaze', 'ghast']);
const NEVER_FIGHT = new Set(['creeper', 'enderman', 'warden', 'ghast']);
// Weapons by how hard they hit (Minecraft: sword damage 4 wood/gold, 5 stone, 6 iron, 7 diamond, 8 netherite).
const WEAPONS = [['netherite_sword', 6], ['diamond_sword', 5], ['netherite_axe', 5], ['iron_sword', 4], ['diamond_axe', 4], ['iron_axe', 3.5], ['stone_sword', 3], ['stone_axe', 2.5], ['wooden_sword', 2], ['golden_sword', 2], ['wooden_axe', 1.5], ['golden_axe', 1.5]];
const BUILD = ['cobblestone', 'cobbled_deepslate', 'dirt', 'stone', 'deepslate', 'netherrack', 'andesite', 'diorite', 'granite', 'tuff', 'oak_planks', 'spruce_planks', 'birch_planks', 'sand', 'gravel'];
const solid = (b) => b && b.boundingBox === 'block';

function bestWeapon() { for (const [name, tier] of WEAPONS) { const item = bot.inventory.items().find(i => i.name === name); if (item) return { item, name, tier }; } return null; }
S.gear = () => { const w = bestWeapon(); return { weapon: w?.name ?? null, tier: w?.tier ?? 0, armor: [5, 6, 7, 8].filter(i => bot.inventory.slots[i]).length, shield: bot.inventory.slots[45]?.name === 'shield' }; };
const gearText = (g) => `${g.weapon ?? 'no weapon'}${g.armor ? ` +${g.armor} armour` : ''}${g.shield ? ' +shield' : ''}`;
S.drawWeapon = async () => { const w = bestWeapon(); if (w && bot.heldItem?.name !== w.name) await bot.equip(w.item, 'hand'); return w?.name ?? null; };

/** Take over from the agent's programs: they would steer the player back into the fight. */
function takeOver(reason) {
  const stopped = bot.stopPrograms?.(`stopped by the safety kit: ${reason}`) ?? [];
  if (stopped.length) note(`stopped program ${stopped.join(', ')}: ${reason}`);
}

/** FIGHT or RUN, by the mob, how many, your health and your gear. */
function decide(mob, near, hp, g) {
  if (NEVER_FIGHT.has(mob.name) || hp <= 8 || near.length >= 3) return 'RUN';
  const armed = g.tier >= 2.5, strong = g.tier >= 4 || (g.tier >= 2.5 && g.armor >= 2);
  if (near.length === 2) return strong && hp > 12 ? 'FIGHT' : 'RUN';
  if (RANGED.has(mob.name)) {
    const reach = mob.position.distanceTo(pos()) <= 10 && Math.abs(mob.position.y - pos().y) <= 2.5;
    return armed && hp > 10 && reach ? 'FIGHT' : 'RUN';
  }
  return (armed && hp > 10) || (g.tier >= 1.5 && hp > 14) ? 'FIGHT' : 'RUN';
}

function callHelp(mob, plan, extra = '') {
  if (Date.now() - S.lastHelp < 15000) return;
  S.lastHelp = Date.now();
  bot.chat(`HELP ${mob.name} at ${fmt(pos())}, ${Math.round(bot.health)} HP, ${gearText(S.gear())}: ${plan}${extra}`);
}

/** Fight one mob: draw the weapon, close in, hit on the sword's cooldown; stop at `minHp` or when it is gone. */
async function fightOne(mob, ms = 15000, minHp = 10) {
  const t0 = Date.now(); let hits = 0;
  const drawn = await S.drawWeapon();
  note(`drew ${drawn ?? 'no weapon'} against ${mob.name}`);
  // (one or two more blows finish a mob at 6 health or less: keep at it down to 6 HP rather than run and be chased)
  const floor = () => (mob.health != null && mob.health <= 6 ? Math.min(minHp, 6) : minHp);
  while (Date.now() - t0 < ms && mob.isValid !== false && bot.entities[mob.id] && bot.health > floor()) {
    const d = mob.position.distanceTo(pos());
    if (d > 3) {
      if (d > 16) break;
      bot.pathfinder.setMovements(S.movements());
      try { await within(bot.pathfinder.goto(new goals.GoalNear(mob.position.x, mob.position.y, mob.position.z, 2)), 3000); } catch {}
      continue;
    }
    await within(bot.lookAt(mob.position.offset(0, (mob.height ?? 1.8) * .8, 0), true), 2000).catch(() => {});
    await within(bot.attack(mob), 2000).catch(() => {});
    hits++;
    await within(bot.waitForTicks(12), 2000).catch(() => {});
  }
  const result = mob.isValid === false || !bot.entities[mob.id] ? 'killed' : bot.health <= floor() ? 'low health' : 'gave up';
  return { result, hits, hp: Math.round(bot.health) };
}

/** Wall yourself off from a mob: blocks on its side at feet and head height, and a roof when it is above you. */
S.hold = async (from) => {
  const block = BUILD.map(n => bot.inventory.items().find(i => i.name === n)).find(Boolean);
  if (!block) { note('hold: no blocks to build with'); return 0; }
  await bot.equip(block, 'hand');
  const feet = pos().floored(), d = from.position.minus(pos());
  // the side(s) it is on: the main one, and the other too when it stands diagonally
  const big = Math.max(Math.abs(d.x), Math.abs(d.z));
  const sides = [[Math.abs(d.x) >= big * .5 ? Math.sign(d.x) : 0, 0], [0, Math.abs(d.z) >= big * .5 ? Math.sign(d.z) : 0]].filter(([x, z]) => x || z);
  const cells = sides.flatMap(([x, z]) => [feet.offset(x, 0, z), feet.offset(x, 1, z)]);
  if (from.position.y > pos().y + 2) cells.push(feet.offset(0, 2, 0));
  let placed = 0;
  for (const c of cells) {
    if (solid(bot.blockAt(c))) continue;
    for (const [x, y, z] of [[0, -1, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
      const ref = bot.blockAt(c.offset(x, y, z));
      if (!solid(ref)) continue;
      // wait for the block to show in your world view: the next one may rest on it
      try { await bot.placeBlock(ref, new Vec3(-x, -y, -z)); placed++; await bot.waitForTicks(2); break; } catch {}
    }
  }
  note(`walled in against ${from.name}: ${placed} blocks`);
  return placed;
};

async function flee(from, why) {
  if (S.fleeing) return;
  S.fleeing = true;
  try {
    try { bot.pathfinder.stop(); } catch {}
    bot.clearControlStates();
    const start = pos().clone();
    // Out of lava: jump and run back the way you came (no time to plan a path).
    if (from.name === 'lava') {
      await bot.lookAt(new Vec3(from.position.x, pos().y + 1.6, from.position.z).plus(pos().minus(from.position).scaled(2)), true);
      bot.setControlState('forward', true); bot.setControlState('jump', true); note(`ran from lava (${why})`);
      await bot.waitForTicks(30);
      return;
    }
    // Elsewhere the run is a path, never a blind sprint: no drop over 3 blocks, no water (dry10: the old sprint ran
    // Corin into a pond at 2 HP, and Basil off a roof). Towards a teammate coming to help, else home, else away from
    // the mob: straight away first, then the directions either side.
    const helper = (S.coming[bot.username] ?? []).filter(c => Date.now() - c.t < 30000).map(c => bot.players[c.from]?.entity?.position).find(Boolean);
    const away = pos().minus(from.position); away.y = 0;
    const dir = away.norm() > .01 ? away.normalize() : new Vec3(1, 0, 0);
    const turn = (a) => new Vec3(dir.x * Math.cos(a) - dir.z * Math.sin(a), 0, dir.x * Math.sin(a) + dir.z * Math.cos(a));
    const targets = [helper, S.home && S.home.distanceTo(pos()) > 4 ? S.home : null, ...[0, .6, -.6, 1.2, -1.2].map(a => pos().plus(turn(a).scaled(10)))].filter(Boolean);
    const m = S.movements(); m.maxDropDown = 3; m.liquidCost = 100; m.noWater = true; m.infiniteLiquidDropdownDistance = false; m.canDig = false;
    bot.pathfinder.setMovements(m);
    note(`ran from ${from.name} (${why})${helper ? ' towards a helper' : ''}`);
    for (const t of targets.slice(0, 4)) {
      try { await within(bot.pathfinder.goto(new goals.GoalNearXZ(t.x, t.z, 2)), 3500); } catch {}
      if (pos().distanceTo(start) >= 4 || pos().distanceTo(from.position) >= 10) break;
    }
    // Stuck (a pit, a corner, nowhere safe to go): wall off instead of standing in the open being shot.
    if (pos().distanceTo(start) < 1.5) { const n = await S.hold(from); callHelp(from, n ? 'WALLED IN' : 'STUCK'); }
  } catch (err) { note(`run failed: ${err.message}`); }
  finally { bot.clearControlStates(); S.fleeing = false; }
}

let lastHp = bot.health, hitting = false;
const onHealth = async () => {
  const hp = bot.health, hurt = hp < lastHp; lastHp = hp;
  if (!hurt || hp <= 0) return;
  const near = hostiles(12).sort((a, b) => a.position.distanceTo(pos()) - b.position.distanceTo(pos()));
  if (!near.length) return;
  // the archer that shot you may stand behind a nearer zombie; an arrow hit is most likely the nearest archer's
  // (a phantom wheeling overhead is near, but the hit is more likely the archer's: dry10-haiku's HELP calls named
  // phantoms while skeletons shot)
  const mob = near.find(e => e.position.distanceTo(pos()) < 3.5 && e.name !== 'phantom') ?? near.find(e => RANGED.has(e.name)) ?? near[0];
  S.danger = { mob: mob.name, at: fmt(pos()), hp: Math.round(hp), time: Date.now() };
  // A program fighting on purpose (safe.fight), or this kit helping a teammate, keeps control unless this is a run-now
  // situation; a helper hit on the way stops walking, and its help loop fights what is near.
  if ((Date.now() < S.engagedUntil || S.responding) && hp > 8 && !NEVER_FIGHT.has(mob.name)) { if (S.responding && !S.engagedUntil) try { bot.pathfinder.stop(); } catch {} return; }
  if (hitting || S.fleeing) return;
  const g = S.gear(), plan = decide(mob, near.filter(e => e.position.distanceTo(pos()) < 8), hp, g);
  takeOver(`${plan === 'FIGHT' ? 'fighting' : 'running from'} ${mob.name} at ${Math.round(hp)} HP`);
  if (plan === 'RUN') { callHelp(mob, 'RUNNING'); return flee(mob, `${Math.round(hp)} HP, ${near.length} near, ${gearText(g)}`); }
  hitting = true;
  try {
    callHelp(mob, 'FIGHTING');
    const r = await fightOne(mob, 15000, 10);
    note(`fought ${mob.name}: ${r.result} after ${r.hits} hits`);
    if (r.result === 'low health') { hitting = false; return flee(mob, 'low health in a fight'); }
  } catch (err) { note(`fight failed: ${err.message}`); }
  finally { hitting = false; }
};

// ---------- answering a teammate's HELP ----------
async function answer(caller, mobName, at, text) {
  const d = at.distanceTo(pos()), g = S.gear(), busy = S.danger && Date.now() - S.danger.time < 10000;
  if (d > 32) return; // too far to arrive in time (and maybe another dimension: HELP gives no dimension)
  const why = !S.autoHelp ? 'busy (autoHelp off)' : busy || S.fleeing || hitting ? 'in a fight myself' : S.responding ? `already helping ${S.responding}` : bot.health < 14 ? `${Math.round(bot.health)} HP` : g.tier < 2.5 ? `no stone sword or better (${g.weapon ?? 'none'})` : NEVER_FIGHT.has(mobName) ? `it is a ${mobName}: run from it` : null;
  if (why) { bot.chat(`CAN'T HELP ${caller}: ${why}`); return; }
  // nearer helpers claim first; an archer takes two (one draws its arrows, one closes in)
  const need = RANGED.has(mobName) ? 2 : 1;
  await sleep(200 + d * 40);
  if ((S.coming[caller] ?? []).filter(c => Date.now() - c.t < 20000).length >= need || S.responding) return;
  S.responding = caller;
  bot.chat(`COMING ${caller} from ${Math.round(d)} blocks, ${gearText(g)}, ${Math.round(bot.health)} HP`);
  takeOver(`going to help ${caller} (${mobName})`);
  // never longer than a minute, whatever hangs: a helper stuck "helping" would never help again
  const work = (async () => {
    await within(S.drawWeapon(), 3000);
    const there = () => bot.players[caller]?.entity?.position ?? at;
    bot.pathfinder.setMovements(S.movements());
    const p = there();
    note(`helping ${caller}: on the way (${Math.round(d)} blocks)`);
    // (a mob that turns on you on the way stops the walk: then fight it here)
    if (p.distanceTo(pos()) > 4) await within(bot.pathfinder.goto(new goals.GoalNear(p.x, p.y, p.z, 3)), 25000).catch(err => { if (!hostiles(6).length) throw err; note(`helping ${caller}: met a mob on the way`); });
    const t0 = Date.now(); let fought = 0;
    while (Date.now() - t0 < 30000 && bot.health > 10) {
      const foes = [...hostiles(10, there()), ...hostiles(6)].filter((e, i, a) => !NEVER_FIGHT.has(e.name) && a.indexOf(e) === i).sort((a, b) => a.position.distanceTo(pos()) - b.position.distanceTo(pos()));
      if (!foes.length) break;
      S.engagedUntil = Date.now() + 16000;
      const r = await fightOne(foes[0], 15000, 10); fought++;
      note(`helped ${caller}: ${foes[0].name} ${r.result}`);
    }
    bot.chat(bot.health > 10 ? `CLEAR ${caller}: ${fought ? `fought ${fought}` : 'no mobs left near you'}` : `BACKING OFF ${caller}, ${Math.round(bot.health)} HP`);
  })();
  try { await within(work, 60000); }
  catch (err) { note(`help failed: ${err.message}`); bot.chat(`CAN'T REACH ${caller}: ${String(err.message).slice(0, 60)}`); }
  finally { S.responding = null; S.engagedUntil = 0; }
}
const onChat = (from, text) => {
  if (from === bot.username || typeof text !== 'string') return;
  const coming = /^COMING (\S+)/.exec(text);
  if (coming) { (S.coming[coming[1]] ??= []).push({ from, t: Date.now() }); return; }
  const help = /^HELP (\S+) at (-?\d+) (-?\d+) (-?\d+), (\d+) HP/.exec(text);
  if (help) answer(from, help[1], new Vec3(+help[2] + .5, +help[3], +help[4] + .5), text).catch(err => note(`answer failed: ${err.message}`));
};

let swimming = false, eating = false;
const onTick = () => {
  const e = bot.entity;
  if (e.isInWater && bot.oxygenLevel <= 8 && !swimming) { swimming = true; bot.setControlState('jump', true); note('swimming up: low air'); }
  else if (swimming && (!e.isInWater || bot.oxygenLevel >= 18)) { swimming = false; bot.setControlState('jump', false); }
  if (e.isInLava && !S.fleeing) {
    S.danger = { mob: 'lava', at: fmt(pos()), hp: Math.round(bot.health), time: Date.now() };
    const back = e.velocity ? new Vec3(-e.velocity.x, 0, -e.velocity.z) : new Vec3(1, 0, 0);
    takeOver('in lava');
    flee({ name: 'lava', position: pos().plus(back.scaled(-3)) }, 'in lava');
  }
  // Eat when hungry, and when hurt below full food (health regenerates only at food 18+).
  if ((bot.food <= 14 || (bot.health < 16 && bot.food < 18)) && !eating && !S.fleeing && !hitting && !S.responding && !bot.pathfinder.isMoving?.()) {
    const pick = (list) => list.map(n => bot.inventory.items().find(i => i.name === n)).find(Boolean);
    const food = pick(FOODS) ?? (bot.food <= 6 ? pick(RAW) : null);
    if (food) {
      eating = true;
      (async () => { const held = bot.heldItem; await bot.equip(food, 'hand'); await bot.consume(); note(`ate ${food.name}`); if (held) await bot.equip(held, 'hand').catch(() => {}); })()
        .catch(err => note(`eat failed: ${err.message}`)).finally(() => { eating = false; });
    }
  }
};
bot.on('health', onHealth);
bot.on('physicsTick', onTick);
bot.on('chat', onChat);
S.uninstall = () => { bot.removeListener('health', onHealth); bot.removeListener('physicsTick', onTick); bot.removeListener('chat', onChat); };

// ---------- helpers ----------
S.setHome = () => { S.home = pos().clone(); return fmt(S.home); };
S.fled = (since) => !!(S.danger && S.danger.time > since);
S.status = () => ({ hp: Math.round(bot.health), food: bot.food, air: bot.oxygenLevel, pos: fmt(pos()), dim: bot.game.dimension, time: bot.time.timeOfDay, night: bot.time.timeOfDay >= 12500 && bot.time.timeOfDay < 23500, gear: gearText(S.gear()), autoHelp: S.autoHelp, danger: S.danger, home: S.home && fmt(S.home), log: S.log.slice(-6) });
S.dangersNear = (r = 5) => bot.findBlocks({ matching: b => b.name === 'lava' || b.name === 'water', maxDistance: r, count: 50 }).map(p => `${bot.blockAt(p).name} ${fmt(p)}`);
// (no drop over 3, even into water: a drop "into water" of any depth was allowed, the way into a flooded ravine)
S.movements = () => { const m = new Movements(bot); m.maxDropDown = 3; m.allowParkour = false; m.liquidCost = 20; m.infiniteLiquidDropdownDistance = false; return m; };
S.goto = async (x, y, z, range = 1) => {
  const start = Date.now();
  bot.pathfinder.setMovements(S.movements());
  try { await bot.pathfinder.goto(new goals.GoalNear(x, y, z, range)); }
  catch (err) { if (S.fled(start)) throw new Error(`stopped: the kit took over (${S.danger.mob} at ${S.danger.at})`); throw err; }
  if (S.fled(start)) throw new Error(`stopped: the kit took over (${S.danger.mob} at ${S.danger.at})`);
};
S.fight = async (target, ms = 20000) => {
  const mob = typeof target === 'string' ? hostiles(16).filter(e => e.name === target).sort((a, b) => a.position.distanceTo(pos()) - b.position.distanceTo(pos()))[0] : target;
  if (!mob) throw new Error(`safe.fight: no ${target} within 16 blocks`);
  S.engagedUntil = Date.now() + ms + 1000;
  try { return await fightOne(mob, ms, 10); } finally { S.engagedUntil = 0; }
};
S.dig = async (block) => {
  if (!block) throw new Error('safe.dig: no block');
  const p = block.position, feet = pos().floored();
  if (p.x === feet.x && p.z === feet.z && p.y === feet.y - 1) throw new Error('safe.dig: that is the block under your feet; dig a staircase instead');
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const n = bot.blockAt(p.offset(dx, dy, dz));
    if (n && (n.name === 'lava' || n.name === 'water')) throw new Error(`safe.dig: ${n.name} next to ${fmt(p)} (at ${fmt(n.position)}); block it first`);
  }
  const above = bot.blockAt(p.offset(0, 1, 0));
  if (above && (above.name === 'gravel' || above.name === 'sand') && p.y >= feet.y) throw new Error(`safe.dig: ${above.name} above ${fmt(p)} would fall on you`);
  await bot.dig(block);
};
return `safety kit installed: when hurt it stops your programs and FIGHTs or RUNs by your gear, calls HELP; answers teammates' HELP (autoHelp ${S.autoHelp}); swims up, leaves lava, eats; helpers on global.safe. ${JSON.stringify(S.status())}`;
