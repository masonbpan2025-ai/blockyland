// Bed Wars: Gemini team playbook for five-team (4v4v4v4v4) Bed Wars.
// Coordinates our 4 squad players (Gemini1-4) via teamRadio for forge split, bed defense, tool-equipped rushing, and early zone migration.

import { objectivesOf } from '../../skills/view.mjs';
import { upgradeCost } from '../../../../../../../src/mods/bedwars/shop.js';
import { teamRadio } from '../../teamRadio.mjs';

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
 * The way round to a bed: a diamond island off the middle that is not much out of the way. Null: go straight.
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

/** The upgrades the team buys, in order: trap first, then armor, swords, forge. */
const UPGRADE_ORDER = [['protection', 1], ['sharpness', 1], ['forge', 1], ['protection', 2], ['healPool', 1]];

export async function playBedWars({ view, skills }) {
  const me = view.me;
  // The lobby is a new game: clock & radio start clean.
  if (view.phase !== 'playing') {
    skills.resetClock('bedwars');
    teamRadio.reset();
  }

  // 1. Auto-select team in lobby if unassigned.
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
  const kitPickaxe = me.kit?.pickaxe ?? 0;
  const kitShears = Boolean(me.kit?.shears);
  const sword = skills.bestWeaponDamage();
  const myBed = bedStanding ? bed.at : null;
  const atHomeBase = Math.hypot(me.at.x - (bed.at[0] + 0.5), me.at.z - (bed.at[2] + 0.5)) <= 12;
  const bedDist = myBed ? Math.hypot(me.at.x - (myBed[0] + 0.5), me.at.z - (myBed[2] + 0.5)) : Infinity;

  // Register state with Team Radio
  teamRadio.register(skills.botInstance ? skills.botInstance() : me);
  teamRadio.team = team;
  teamRadio.updatePlayer(me.id, {
    id: me.id, name: me.name, role, x: me.at.x, y: me.at.y, z: me.at.z,
    health: skills.health(), blocks, sword, diamonds: diamond, emeralds: emerald, alive: me.alive,
  });
  if (bedStanding) teamRadio.bed = bed.at;
  if (forge) teamRadio.base = { x: forge.at[0], y: forge.at[1], z: forge.at[2] };

  // Calculate timing & Bed Destruction / Zone Schedule
  const timeLimit = skills.timeLimit ? skills.timeLimit() : ((view.elapsed ?? 0) + (view.timeLeft ?? 360));
  const bedDestructionAt = timeLimit * 0.6; // 216s in practice (360s limit), 360s in real (600s limit)
  // Start migrating 50s before Bed Destruction so every bot reaches the middle plateau BEFORE the void rises
  const evacuateTime = Math.max(50, bedDestructionAt - 50);
  const isEvacuating = elapsed >= evacuateTime;
  if (isEvacuating) teamRadio.evacuation = true;

  // 2. Base Threat & Interception
  const atBed = (f) => myBed ? Math.hypot((f.x ?? 0) - (myBed[0] + 0.5), (f.z ?? 0) - (myBed[2] + 0.5)) : Infinity;
  const localIntruder = myBed ? foes.find((f) => atBed(f) <= 18) ?? null : null;
  if (localIntruder) teamRadio.reportThreat(localIntruder, atBed(localIntruder));
  const activeThreat = teamRadio.getThreat();
  const intruder = localIntruder || (activeThreat && atHomeBase ? foes.find((f) => f.id === activeThreat.id) : null);

  // 2a. Opening Forge Clustering (0s - 22s):
  // Standing within 3 blocks of forge shares full iron/gold to all teammates (4x team economy!).
  if (elapsed < 22 && !intruder && myBed) {
    if (near(me, forge.at[0], forge.at[2]) > 1.2) {
      await skills.collectIfReached(`f-${team}`, forge.at, { bridge: false, stopWithin: 1.0, summary: 'grouping at forge for resource split' });
      return;
    }
    await skills.collectIfReached(`f-${team}`, forge.at, { bridge: false, stopWithin: 1.0, summary: 'collecting at forge' });
    return;
  }

  // 2b. Intruder response: Defender (or any home teammate) intercepts attacker before they reach bed
  const isDefender = role === 'defender';
  const shouldDefend = isDefender || (bedDist <= 22 && intruder);
  if (intruder && shouldDefend) {
    if (skills.setting('bridgeDefence') && myBed && !skills.flag('housePushing') && skills.holdGroundAgainst(intruder, foeDist)) {
      skills.faceToward(intruder.x ?? 0, (intruder.y ?? 31) + 1.2, intruder.z ?? 0);
      if (skills.throwAt && foeDist > 4.5 && foeDist < 16) {
        skills.throwAt(intruder);
      }
    } else {
      await skills.fight(intruder, { summary: `intercepting ${intruder.name || intruder.id} at base` });
      return;
    }
  }

  // 3. ZONE EVACUATION & CENTER DOMINANCE PHASE:
  // Before beds are destroyed and the closing zone shrinks to 9m, migrate the entire squad into the middle island.
  if (isEvacuating) {
    const mid = skills.middleIsland();
    const midTopY = (mid.y ?? 30) + 1; // Top surface of the middle island (above the rising void floor!)
    const targetMid = [mid.x, midTopY, mid.z];
    const distToMid = Math.hypot(me.at.x - mid.x, me.at.z - mid.z);

    // If at base / near shop, purchase essential survival equipment
    if (atHomeBase) {
      if (iron >= 4 && blocks < 32) skills.buy('wool', 2);
      if (shop === 'full' && gold >= 12 && kitArmor < 2) skills.buy('iron_armor');
      if (shop === 'full' && gold >= 3 && c.count('golden_apple') < 1) skills.buy('gapple');
      if (shop === 'full' && emerald >= 3 && sword < 7) skills.buy('diamond_sword');
    }

    // Direct melee defense if enemy is within striking reach
    if (foe && foeDist <= 6) {
      await skills.fight(foe, { summary: 'defending in zone' });
      return;
    }

    // If not yet on the top surface of the middle island, march to middle
    if (distToMid > Math.max(3, (mid.r ?? 10) - 2) || me.at.y < (mid.y ?? 30)) {
      if (blocks < 4 && iron >= 4) {
        skills.buy('wool', 1);
      }
      await skills.goTo(targetMid, {
        bridge: blocks > 0 || skills.creative(),
        stopWithin: 2.5,
        summary: 'migrating to top of middle island for zone dominance',
      });
      return;
    }

    // Once in middle island, keep strictly inside the closing zone
    const zoneWalk = skills.keepInZone({ margin: 3 });
    if (zoneWalk) { await zoneWalk; return; }

    // Collect middle emerald generators if available
    for (const gen of objectivesOf(view, 'generator', { team: null })) {
      if (String(gen.id).startsWith('e') && (gen.stock?.emerald ?? 0) > 0 && near(me, gen.at[0], gen.at[2]) <= 8) {
        await skills.collectIfReached(gen.id, gen.at, { bridge: false, stopWithin: 0.8, summary: 'collecting middle emeralds' });
        return;
      }
    }

    // Engage any enemy entering or on the middle island
    if (foe && foeDist <= 12) {
      await skills.fight(foe, { summary: 'holding middle island' });
      return;
    }

    // Hold center of middle island with squad
    await skills.goTo(targetMid, { bridge: false, stopWithin: 2.0, summary: 'holding middle island center' });
    return;
  }

  // 4. Enemy Target & Bed Breaking (Normal Phase)
  const enemyBeds = beds.filter((b) => b.team !== team && b.state === 'standing');
  const from = role === 'solo' ? me.at : { x: bed.at[0], z: bed.at[2] };
  const target = teamRadio.getPrimaryTarget(enemyBeds, from);
  const targetBed = target ? target.at : null;
  const targetDist = targetBed ? Math.hypot(targetBed[0] + 0.5 - me.at.x, targetBed[2] + 0.5 - me.at.z) : Infinity;
  const needBlocks = targetBed ? Math.max(48, skills.voidCellsToward(targetBed[0] + 0.5, targetBed[2] + 0.5) + 6) : 48;
  const needNow = targetBed ? skills.voidCellsToward(targetBed[0] + 0.5, targetBed[2] + 0.5) + 4 : 0;

  // 4b. Break target bed immediately when in reach
  // With progressive digging, continue digging until broken without interrupting!
  if (targetBed && targetDist <= 4.2) {
    const r = await skills.breakBed(targetBed, { summary: `breaking the ${target.team} bed!` });
    if (r?.digging) {
      // Actively digging on the bed or covering block; maintain focus
      return;
    }
    if (r?.ok || r?.brokeBed) {
      teamRadio.clearPrimaryTarget(target.team);
      return;
    }
    return;
  }

  // 5. Fight enemy within 8m unless bridge defense holds ground
  if (foe && foeDist <= 8 && !(skills.setting('bridgeDefence') && myBed && !skills.flag('housePushing') && skills.holdGroundAgainst(foe, foeDist))) {
    await skills.fight(foe);
    return;
  }

  // 6. Shop purchases with tool support (pickaxe, shears, end stone, traps)
  const buy = (key) => skills.buy(key, 1).ok;
  if (shop === 'wool') {
    if (iron >= 4 && blocks < needBlocks) buy('wool');
  } else {
    // Weapons
    const wantSword = shop === 'full' && emerald >= 3 && sword < 7 ? 'diamond_sword'
      : gold >= 7 && sword < 6 ? 'iron_sword'
        : iron >= 10 && sword < 5 && blocks >= 16 ? 'stone_sword' : null;
    const woolAt = shop !== 'wool' && sword < 5 ? 14 : 4;
    if (wantSword) buy(wantSword);
    else if (iron >= woolAt && blocks < needBlocks) buy('wool');
    // Tools: Pickaxe (10 iron) & Shears (20 iron) are permanent and drastically cut digging time!
    else if (role === 'rusher' && kitPickaxe < 1 && iron >= 10) buy('pickaxe');
    else if (role === 'rusher' && !kitShears && iron >= 20) buy('shears');
    else if (role === 'collector' && kitPickaxe < 1 && iron >= 10) buy('pickaxe');
    // Bed Defense: End Stone (24 iron for 12 blocks) takes 15s to break by hand!
    else if (role === 'defender' && myBed && iron >= 24 && blocks < 32) buy('end_stone');
    else if (role === 'defender' && myBed && gold >= 4 && blocks < 32) buy('wood');
    // Traps: 1 diamond for blindness/slowness trap
    else if (shop === 'full' && diamond >= 1 && skills.teamTraps && skills.teamTraps(team).length === 0) buy('its_a_trap');
    // Armor & Potions
    else if (shop === 'full' && gold >= 12 && kitArmor < 2) buy('iron_armor');
    else if (shop === 'full' && gold >= 3 && c.count('golden_apple') < 1) buy('gapple');
    else if (iron >= 24 && kitArmor < 1) buy('chain_armor');
    else if (shop === 'full' && diamond >= 8) buy('sharpness');
    else if (shop === 'full' && diamond >= 5 && skills.teamUpgrade(team, 'protection') < 1) buy('protection');
    else if (shop === 'full' && emerald >= 6 && kitArmor < 3) buy('diamond_armor');
    else if (shop === 'full' && emerald >= 4 && c.count('ender_pearl') < 1) buy('pearl');
  }

  // T1. Defender covers the bed (8 surrounding blocks)
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

  // T2. Collector: team upgrades & remote generators
  const collecting = role === 'collector' && elapsed < 240;
  if (collecting) {
    if (diamond >= 1 && skills.teamTraps && skills.teamTraps(team).length === 0) {
      if (!buy('its_a_trap')) {
        const at = skills.baseKeepers(team)?.upgrades;
        if (at) { await skills.goTo([at.x, at.y, at.z], { bridge: blocks > 0, stopWithin: 3, summary: 'taking diamond home for trap' }); return; }
      }
    }
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
      const gen = gens.filter((g) => worth(g) > 0).sort(byDistance)[0] ?? gens.filter((g) => String(g.id).startsWith('d')).sort(byDistance)[0] ?? null;
      if (gen) {
        await skills.collectIfReached(gen.id, gen.at, { bridge: blocks > 0, stopWithin: 0.8, summary: `collecting the ${gen.id} generator for the team` });
        return;
      }
    }
  }

  // 6b. Nearby generator pickup
  if (shop === 'full' && !(foe && foeDist <= 10) && !(skills.flag('housePushing') && foes.length === 0)) {
    for (const gen of objectivesOf(view, 'generator', { team: null })) {
      if (String(gen.id).startsWith('f-')) continue;
      if (((gen.stock?.diamond ?? 0) + (gen.stock?.emerald ?? 0)) <= 0) continue;
      if (near(me, gen.at[0], gen.at[2]) > ((gen.stock?.emerald ?? 0) > 0 ? 18 : 10)) continue;
      await skills.collectIfReached(gen.id, gen.at, {
        bridge: me.carrying.blocks > 0, stopWithin: 0.8, summary: `collecting the ${gen.id} generator`,
      });
      return;
    }
  }

  // 8. Forge resource collection
  const wantsIron = (blocks < needBlocks && iron < 4) || (shop !== 'wool' && sword < 5 && iron < 10) || (shop !== 'wool' && kitArmor < 1 && iron < 24);
  const wantsGold = shop !== 'wool' && (
    (sword < 6 && gold < 7)
    || (shop === 'full' && kitArmor < 2 && gold < 12)
    || (shop === 'full' && c.count('golden_apple') < 1 && gold < 3)
  );
  const regear = shop !== 'wool' && foeDist > 26 && (sword < 5 || (blocks < 8 && iron < 4)) && near(me, forge.at[0], forge.at[2]) < 26;

  // 7. When to go
  if (!skills.flag('housePushing') && !(role === 'defender' && myBed) && !collecting) {
    const killWindow = skills.flag('houseSawFoe') && elapsed > 25 && foes.length === 0 && (sword >= 6 || shop === 'wool' || targetDist <= 40);
    const gearedPush = elapsed >= (shop === 'wool' ? 35 : 45) && blocks >= needNow && foeDist > 25 && (shop === 'wool' || sword >= 6);
    const rush = role === 'rusher' && elapsed >= 25 && blocks >= needBlocks && sword >= 5 && foeDist > 12;
    if (!myBed || rush || killWindow || gearedPush || elapsed >= 480 || skills.flag('housePushWanted') || (elapsed >= 150 && foeDist > 40 && sword >= 6)) {
      skills.setFlag('housePushing', true);
      skills.setFlag('housePushWanted', true);
    }
  }

  const pushing = skills.flag('housePushing');
  const stranded = Boolean(targetBed && pushing && iron < 4 && (role === 'rusher' ? (atHomeBase ? blocks < needBlocks : blocks < 4) : blocks < needNow));
  if ((stranded || regear || (!pushing && (wantsIron || wantsGold))) && (stranded || regear || foeDist > 26 || !foe)) {
    await skills.collectIfReached(`f-${team}`, forge.at, {
      bridge: false, stopWithin: 1.2, summary: `collecting at the ${team} forge`,
    });
    return;
  }

  // 9. Rushing: bridge to target bed as a pair
  if (targetBed && pushing) {
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
      const partners = new Set(rushPartners(view));
      const partner = skills.teammates().filter((t) => partners.has(t.id))
        .sort((a, b) => near(me, a.x, a.z) - near(me, b.x, b.z))[0] ?? null;
      if (atHome && partner && near(me, partner.x, partner.z) > 6) {
        const since = skills.flag('rushWaitSince') ?? elapsed;
        skills.setFlag('rushWaitSince', since);
        if (elapsed - since < 8) {
          const facing = skills.baseFacing(team);
          await skills.goTo([bed.at[0] + 0.5 + (facing.x ?? 0) * 4, bed.at[1], bed.at[2] + 0.5 + (facing.z ?? 0) * 4], { bridge: false, stopWithin: 1.5, summary: 'waiting for partner to rush' });
          return;
        }
      } else skills.setFlag('rushWaitSince', null);

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

  // 10. Post-Bed Elimination / Hunt
  const enemyTeams = skills.baseTeams().filter((id) => id !== team);
  if (!target) {
    if (foe) { await skills.fight(foe); return; }
    const spawn = enemyTeams[0] ? skills.baseSpawn(enemyTeams[0]) : null;
    if (spawn) {
      await skills.goTo([spawn.x, spawn.y, spawn.z], {
        bridge: blocks > 0 || skills.creative(), stopWithin: 2.0, summary: 'hunting surviving players',
      });
      return;
    }
  }

  // 11. Hold Ground
  if (myBed) {
    const facing = skills.baseFacing(team);
    const gx = myBed[0] + 0.5 + (facing.x ?? 0) * 3.5;
    const gz = myBed[2] + 0.5 + (facing.z ?? 0) * 3.5;
    const gy = myBed[1];
    const spot = skills.standable(gx, gy, gz) ? { x: gx, y: gy, z: gz } : { x: myBed[0] + 0.5, y: myBed[1], z: myBed[2] + 0.5 };
    if (foe) skills.faceToward(foe.x ?? 0, (foe.y ?? 31) + 1.2, foe.z ?? 0);
    else skills.faceToward(spot.x + (facing.x ?? 0), gy + 1.2, spot.z + (facing.z ?? 0));
    await skills.goTo([spot.x, spot.y, spot.z], { bridge: false, stopWithin: 0.9, summary: 'holding the way to my bed' });
    return;
  }

  // No bed of mine: push remaining enemy base
  const foot = enemyTeams[0] ? skills.baseBedFoot(enemyTeams[0]) : null;
  if (foot) {
    await skills.goTo([foot[0] + 0.5, foot[1], foot[2] + 0.5], {
      bridge: blocks > 0 || skills.creative(), stopWithin: 2.2, summary: 'pushing enemy base',
    });
  }
}
