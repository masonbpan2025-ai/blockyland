// Bed Wars, houseBotDs's brain as a playbook over the general view and the skills only. Decision for decision the old
// brainBedWars: the same priorities in the same order, with the same distances, the same purchases and the same skills.
//
// 1. The lobby: join the emptiest team.
// 2. My bed is the thing I can lose: an intruder at it comes first, unless they are on the void's ground and I am not.
// 3. Their bed in my reach: break it now.
// 4. A foe on me: fight (unless bridge defence says wait).
// 5. The shop: sword, blocks, armour, the full shop's extras.
// 6. A stocked diamond or emerald generator within reach (hard): collect it.
// 7. The forge while it is safe: iron and gold are the fight's real currency.
// 8. When to go, then bridge to their bed and break it.
// 9. Their bed down: hunt the last player at their base.
// 10. Not time to push: hold the way to my bed.
//
// On a team (two or more of us still in the game) the jobs are shared, by the order of our names, with no messages:
// - the defender covers the bed in wool, keeps the forge's iron coming and holds the way in; it never leaves a
//   standing bed;
// - the collector (with three or more) takes the diamonds and emeralds and buys the team upgrades, and joins the push
//   later;
// - the rushers go for the nearest enemy bed together, as soon as they have a sword and the blocks.
// Alone (the last of the team, or a solo game) the bot plays every job itself, as before.
import { objectivesOf } from '../../skills/view.mjs';
import { upgradeCost } from '../../../src/mods/bedwars/shop.js';

const near = (me, x, z) => Math.hypot((x ?? 0) - me.at.x, (z ?? 0) - me.at.z);

/** My job on the team: the members still in the game (alive, or respawning), in name order, share them out. */
export function teamRole(view) {
  const me = view.me;
  const mates = (view.players ?? []).filter((p) => p.team && p.team === me.team && (p.alive || (p.respawnIn !== null && p.respawnIn !== undefined)) || p.id === me.id)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (mates.length <= 1) return 'solo';
  const rank = Math.max(0, mates.findIndex((p) => p.id === me.id));
  if (rank === 0) return 'defender';
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
 * The way round to a bed: a diamond island off the middle that is not much out of the way (the straight line goes over
 * the middle, where their rushers come the other way). Null: go straight.
 */
export function flankVia(gens, from, to, { detour = 1.4, middle = 13 } = {}) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const straight = d(from, to);
  let best = null;
  for (const g of gens) {
    const at = { x: g.at[0], z: g.at[2] }; // a generator's spot is its block's centre
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

/** The upgrades the team's collector buys, in order, while it has the diamonds: armour, then swords, then the forge. */
const UPGRADE_ORDER = [['protection', 1], ['sharpness', 1], ['forge', 1], ['protection', 2], ['healPool', 1]];

export async function playBedWars({ view, skills }) {
  const me = view.me;
  // The lobby is a new game: its clock starts when the playing phase does.
  if (view.phase !== 'playing') skills.resetClock('bedwars');

  // 1. Auto-select a team in lobby if unassigned.
  if (view.phase === 'lobby' && !me.team) {
    const counts = new Map();
    for (const t of view.teams ?? []) counts.set(t.id, 0);
    for (const p of view.players) if (p.team && counts.has(p.team)) counts.set(p.team, counts.get(p.team) + 1);
    let chosen = null;
    for (const [tid, c] of counts.entries()) if (c === 0) { chosen = tid; break; }
    if (!chosen) chosen = counts.keys().next().value || 'blue';
    skills.chooseTeam(chosen);
    return;
  }

  if (view.phase !== 'playing' || !me.canAct) return;

  const team = me.team;
  const role = teamRole(view);
  const beds = objectivesOf(view, 'bed');
  const bed = beds.find((b) => b.team === team) ?? null;
  const forge = objectivesOf(view, 'generator', { team })[0] ?? null;
  const teamState = (view.teams ?? []).find((t) => t.id === team) ?? null;
  if (!bed || !forge || !teamState) return;
  const bedStanding = bed.state === 'standing';

  skills.heal();

  const elapsed = skills.clock('bedwars');
  if (elapsed < 30) {
    skills.setFlag('housePushing', false);
    skills.setFlag('housePushWanted', false);
    skills.setFlag('houseSawFoe', false);
  }
  const foes = skills.enemies();
  const foe = foes[0] ?? null;
  if (foe) skills.setFlag('houseSawFoe', true);
  const foeDist = foe ? near(me, foe.x, foe.z) : Infinity;
  const c = me.carrying;
  const iron = c.iron, gold = c.gold, diamond = c.diamond, emerald = c.emerald, blocks = c.blocks;
  const shop = me.ability.shop;
  const kitArmor = me.kit?.armor ?? 0;
  const sword = skills.bestWeaponDamage();
  const myBed = bedStanding ? bed.at : null;
  // On my own island (its 17 x 17 square reaches 12 from the bed at the most).
  const atHomeBase = Math.hypot(me.at.x - (bed.at[0] + 0.5), me.at.z - (bed.at[2] + 0.5)) <= 12;
  const bedDist = myBed ? Math.hypot(me.at.x - (myBed[0] + 0.5), me.at.z - (myBed[2] + 0.5)) : Infinity;

  // 2. Their beds, nearest first; their base is where a respawned player is.
  const enemyBeds = beds.filter((b) => b.team !== team && b.state === 'standing');
  // On a team, the bed nearest my own (not nearest me): every rusher picks the same one.
  const from = role === 'solo' ? me.at : { x: bed.at[0], z: bed.at[2] };
  const pushable = [...enemyBeds].sort((a, b) => Math.hypot(a.at[0] - from.x, a.at[2] - from.z) - Math.hypot(b.at[0] - from.x, b.at[2] - from.z));
  const target = pushable[0] ?? null;
  const targetBed = target ? target.at : null;
  const targetDist = targetBed ? Math.hypot(targetBed[0] + 0.5 - me.at.x, targetBed[2] + 0.5 - me.at.z) : Infinity;
  const needBlocks = targetBed ? Math.max(48, skills.voidCellsToward(targetBed[0] + 0.5, targetBed[2] + 0.5) + 6) : 48;
  // What the rest of the crossing takes from where I stand now: a bridge already built counts for nothing.
  const needNow = targetBed ? skills.voidCellsToward(targetBed[0] + 0.5, targetBed[2] + 0.5) + 4 : 0;

  // 2b. A foe at my bed -- or close enough to hit me, or close enough that turning back can still save it -- first.
  const atBed = (f) => myBed ? Math.hypot((f.x ?? 0) - (myBed[0] + 0.5), (f.z ?? 0) - (myBed[2] + 0.5)) : Infinity;
  const intruder = myBed ? foes.find((f) => atBed(f) <= 14) ?? null : null;
  const answers = role === 'rusher' ? bedDist <= 20 || foeDist <= 6 : (bedDist <= 26 || foeDist <= 12 || targetDist > 12);
  if (intruder && answers) {
    if (!(skills.setting('bridgeDefence') && myBed && !skills.flag('housePushing') && skills.holdGroundAgainst(intruder, foeDist))) {
      await skills.fight(intruder, { summary: `meeting ${intruder.name || intruder.id} at my bed` });
      return;
    }
  }

  // 3b. The closing zone (the beds are gone by then): inside it, unless a foe is on me.
  if (!(foe && foeDist <= 6)) {
    const zoneWalk = skills.keepInZone();
    if (zoneWalk) { await zoneWalk; return; }
  }

  // 4. Their bed in my reach is broken now, before anything else.
  if (targetBed && targetDist <= 4.2) {
    await skills.breakBed(targetBed, { summary: `breaking the ${target.team} bed!` });
    return;
  }

  // 5. A foe on me is fought -- unless they are on the void's ground and I am not: then the wait costs them the cross.
  if (foe && foeDist <= 8 && !(skills.setting('bridgeDefence') && myBed && !skills.flag('housePushing') && skills.holdGroundAgainst(foe, foeDist))) {
    await skills.fight(foe);
    return;
  }

  // 6. The shop: a sword first, then the blocks for the crossing, then armour and the full shop's extras.
  const buy = (key) => skills.buy(key, 1).ok;
  if (shop === 'wool') {
    if (iron >= 4 && blocks < needBlocks) buy('wool');
  } else {
    const wantSword = shop === 'full' && emerald >= 3 && sword < 7 ? 'diamond_sword'
      : gold >= 7 && sword < 6 ? 'iron_sword'
        : iron >= 10 && sword < 5 && blocks >= 16 ? 'stone_sword' : null;
    // Keep 14 iron back while the stone sword is still the next purchase (10 for it, 4 for the wool its 16 blocks need).
    const woolAt = shop !== 'wool' && sword < 5 ? 14 : 4;
    if (wantSword) buy(wantSword);
    else if (iron >= woolAt && blocks < needBlocks) buy('wool');
    else if (shop === 'full' && gold >= 12 && kitArmor < 2) buy('iron_armor');
    else if (shop === 'full' && gold >= 3 && c.count('golden_apple') < 1) buy('gapple');
    else if (iron >= 24 && kitArmor < 1) buy('chain_armor');
    else if (shop === 'full' && diamond >= 8) buy('sharpness');
    else if (shop === 'full' && diamond >= 5 && skills.teamUpgrade(team, 'protection') < 1) buy('protection');
    else if (shop === 'full' && emerald >= 6 && kitArmor < 3) buy('diamond_armor');
    else if (shop === 'full' && emerald >= 4 && c.count('ender_pearl') < 1) buy('pearl');
  }

  // T1. The defender covers the bed: a layer of blocks on it and all round it, the nearest gap first.
  if (role === 'defender' && myBed && blocks > 0 && !(foe && foeDist <= 8)) {
    const facing = skills.baseFacing(team);
    const head = [myBed[0] + (facing.x ?? 0), myBed[1], myBed[2] + (facing.z ?? 0)];
    const gaps = bedCover(myBed, head).filter((c) => skills.isAir(c))
      .sort((a, b) => near(me, a[0] + 0.5, a[2] + 0.5) - near(me, b[0] + 0.5, b[2] + 0.5));
    if (gaps.length) {
      if (near(me, gaps[0][0] + 0.5, gaps[0][2] + 0.5) > 3.2) {
        await skills.goTo([gaps[0][0] + 0.5, myBed[1], gaps[0][2] + 0.5], { bridge: false, stopWithin: 2.2, summary: 'going to cover the bed' });
        return;
      }
      const placed = skills.place(gaps[0]);
      if (placed?.ok) { skills.say(`covering the bed (${gaps.length - 1} to go)`); return; }
    }
  }

  // T2. The collector: the team upgrades from its diamonds, then the generators away from home.
  const collecting = role === 'collector' && elapsed < 240;
  if (collecting) {
    // The next upgrade, bought at the team upgrades keeper (within 6 blocks): with its diamonds, carried home.
    const next = UPGRADE_ORDER.find(([key, level]) => skills.teamUpgrade(team, key) < level) ?? null;
    const cost = next ? upgradeCost(next[0], next[1], 'large') : null;
    if (next && cost !== null && diamond >= cost && !(foe && foeDist <= 10)) {
      if (!buy(next[0])) {
        const at = skills.baseKeepers(team)?.upgrades;
        if (at) { await skills.goTo([at.x, at.y, at.z], { bridge: blocks > 0, stopWithin: 3, summary: `taking ${cost} diamonds home for ${next[0]}` }); return; }
      }
    }
    if (sword >= 5 && blocks >= 16 && !(foe && foeDist <= 10)) {
      const gens = objectivesOf(view, 'generator', { team: null }).filter((g) => !String(g.id).startsWith('f-'));
      const worth = (g) => (g.stock?.emerald ?? 0) * 3 + (g.stock?.diamond ?? 0);
      const byDistance = (a, b) => near(me, a.at[0], a.at[2]) - near(me, b.at[0], b.at[2]);
      // The nearest one with something on it; with nothing anywhere, wait at the nearest diamond generator.
      const gen = gens.filter((g) => worth(g) > 0).sort(byDistance)[0] ?? gens.filter((g) => String(g.id).startsWith('d')).sort(byDistance)[0] ?? null;
      if (gen) {
        await skills.collectIfReached(gen.id, gen.at, { bridge: blocks > 0, stopWithin: 0.8, summary: `collecting the ${gen.id} generator for the team` });
        return;
      }
    }
  }

  // 6b. A stocked diamond or emerald generator near me (hard), unless a foe can punish the detour or their bed is mine.
  if (shop === 'full' && !(foe && foeDist <= 10) && !(skills.flag('housePushing') && foes.length === 0)) {
    for (const gen of objectivesOf(view, 'generator', { team: null })) {
      if (String(gen.id).startsWith('f-')) continue;
      if (((gen.stock?.diamond ?? 0) + (gen.stock?.emerald ?? 0)) <= 0) continue;
      // An emerald generator is worth a longer walk than a diamond one.
      if (near(me, gen.at[0], gen.at[2]) > ((gen.stock?.emerald ?? 0) > 0 ? 18 : 10)) continue;
      await skills.collectIfReached(gen.id, gen.at, {
        bridge: me.carrying.blocks > 0, stopWithin: 0.8, summary: `collecting the ${gen.id} generator`,
      });
      return;
    }
  }

  // 8b. The forge, while it is safe: iron and gold are the fight's real currency.
  const wantsIron = (blocks < needBlocks && iron < 4) || (shop !== 'wool' && sword < 5 && iron < 10) || (shop !== 'wool' && kitArmor < 1 && iron < 24);
  // Gold only for what the shop buys next: the iron sword, then the hard shop's iron armour and its one apple.
  const wantsGold = shop !== 'wool' && (
    (sword < 6 && gold < 7)
    || (shop === 'full' && kitArmor < 2 && gold < 12)
    || (shop === 'full' && c.count('golden_apple') < 1 && gold < 3)
  );
  // A respawn takes the kit with it: re-gear at home whenever the sword is still the starting one and the foe is far.
  const regear = shop !== 'wool' && foeDist > 26 && (sword < 5 || (blocks < 8 && iron < 4))
    && near(me, forge.at[0], forge.at[2]) < 26;
  // 7. When to go -- decided before the forge step, because that step returns early every tick.
  if (!skills.flag('housePushing') && !(role === 'defender' && myBed) && !collecting) {
    const killWindow = skills.flag('houseSawFoe') && elapsed > 25 && foes.length === 0
      && (sword >= 6 || shop === 'wool' || targetDist <= 40);
    const gearedPush = elapsed >= (shop === 'wool' ? 40 : 55) && blocks >= needNow && foeDist > 25
      && (shop === 'wool' || sword >= 6);
    // A team's rushers go as soon as they have a sword and the blocks: the defender is home.
    const rush = role === 'rusher' && elapsed >= 40 && blocks >= needBlocks && sword >= 5 && foeDist > 12;
    if (!myBed || rush || killWindow || gearedPush || elapsed >= 480 || skills.flag('housePushWanted') || (elapsed >= 150 && foeDist > 40 && sword >= 6)) {
      skills.setFlag('housePushing', true);
      skills.setFlag('housePushWanted', true);
    }
  }

  // Short of the blocks the crossing still needs and no iron to buy them: the forge, not the void.
  const pushing = skills.flag('housePushing');
  // (A rusher on its way goes by islands, not the straight line needNow measures: it turns back only when it is out.)
  const stranded = Boolean(targetBed && pushing && iron < 4 && (role === 'rusher' ? (atHomeBase ? blocks < needBlocks : blocks < 4) : blocks < needNow));
  if ((stranded || regear || (!pushing && (wantsIron || wantsGold))) && (stranded || regear || foeDist > 26 || !foe)) {
    await skills.collectIfReached(`f-${team}`, forge.at, {
      bridge: false, stopWithin: 1.2, summary: `collecting at the ${team} forge`,
    });
    return;
  }

  // 9. Their bed: bridge to it. (Blocks short are the shop's and the forge's job, above, before I set foot on the void.)
  if (targetBed && pushing) {
    // A rusher leaves home with the blocks for the whole way (it may go round), and turns back only when it is out.
    const short = role === 'rusher' ? blocks < 4 || (atHomeBase && blocks < needBlocks) : blocks < 4 || blocks < needNow;
    if (short) {
      await skills.collectIfReached(`f-${team}`, forge.at, {
        bridge: false, stopWithin: 1.2, summary: 'out of blocks: back for more',
      });
      return;
    }
    if (role === 'rusher') {
      const atHome = Math.hypot(me.at.x - (bed.at[0] + 0.5), me.at.z - (bed.at[2] + 0.5)) <= 12;
      if (atHome) skills.setFlag('rushViaDone', null);
      // R1. Go as a pair: at the front of my island, wait (up to 15 s) for the other rusher, and cross together.
      const partners = new Set(rushPartners(view));
      const partner = skills.teammates().filter((t) => partners.has(t.id))
        .sort((a, b) => near(me, a.x, a.z) - near(me, b.x, b.z))[0] ?? null;
      if (atHome && partner && near(me, partner.x, partner.z) > 6) {
        const since = skills.flag('rushWaitSince') ?? elapsed;
        skills.setFlag('rushWaitSince', since);
        if (elapsed - since < 15) {
          const facing = skills.baseFacing(team);
          await skills.goTo([bed.at[0] + 0.5 + (facing.x ?? 0) * 4, bed.at[1], bed.at[2] + 0.5 + (facing.z ?? 0) * 4], { bridge: false, stopWithin: 1.5, summary: 'waiting for my partner to rush' });
          return;
        }
      } else skills.setFlag('rushWaitSince', null);
      // R2. The way round: by a diamond island off the middle, when it is not far out of the way.
      const key = `${target.team}`;
      if (skills.flag('rushViaDone') !== key) {
        const gens = objectivesOf(view, 'generator', { team: null }).filter((g) => String(g.id).startsWith('d'));
        const via = flankVia(gens, { x: bed.at[0] + 0.5, z: bed.at[2] + 0.5 }, { x: targetBed[0] + 0.5, z: targetBed[2] + 0.5 });
        if (via && near(me, via.x, via.z) > 2.5) {
          await skills.collectIfReached(via.id, [via.x, via.y, via.z], { bridge: blocks > 0, stopWithin: 0.8, summary: `rushing the ${target.team} bed by the ${via.id} island` });
          return;
        }
        skills.setFlag('rushViaDone', key);
      }
    }
    await skills.goTo([targetBed[0] + 0.5, targetBed[1], targetBed[2] + 0.5], {
      bridge: blocks > 0 || skills.creative(), stopWithin: 2.2, summary: `bridging to the ${target.team} bed`,
    });
    return;
  }

  // 10. Their bed is down: the last kill is the game. Hunt them where they respawn and farm.
  const enemyTeams = skills.baseTeams().filter((id) => id !== team);
  if (!target) {
    if (foe) { await skills.fight(foe); return; }
    const spawn = enemyTeams[0] ? skills.baseSpawn(enemyTeams[0]) : null;
    if (spawn) {
      await skills.goTo([spawn.x, spawn.y, spawn.z], {
        bridge: blocks > 0 || skills.creative(), stopWithin: 2.0, summary: 'hunting the last player at their base',
      });
      return;
    }
  }

  // 11. Not time to push: hold the ground their rush must cross to reach my bed.
  if (myBed) {
    const facing = skills.baseFacing(team);
    const gx = myBed[0] + 0.5 + (facing.x ?? 0) * 3;
    const gz = myBed[2] + 0.5 + (facing.z ?? 0) * 3;
    const gy = myBed[1];
    const spot = skills.standable(gx, gy, gz) ? { x: gx, y: gy, z: gz } : { x: myBed[0] + 0.5, y: myBed[1], z: myBed[2] + 0.5 };
    if (foe) skills.faceToward(foe.x ?? 0, (foe.y ?? 31) + 1.2, foe.z ?? 0);
    else skills.faceToward(spot.x + (facing.x ?? 0), gy + 1.2, spot.z + (facing.z ?? 0));
    await skills.goTo([spot.x, spot.y, spot.z], { bridge: false, stopWithin: 0.9, summary: 'holding the way to my bed' });
    return;
  }

  // No bed of mine and nothing seen: go at their base anyway.
  const foot = enemyTeams[0] ? skills.baseBedFoot(enemyTeams[0]) : null;
  if (foot) {
    await skills.goTo([foot[0] + 0.5, foot[1], foot[2] + 0.5], {
      bridge: blocks > 0 || skills.creative(), stopWithin: 2.2, summary: 'pushing their base',
    });
  }
}
