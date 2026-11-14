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
import { objectivesOf } from '../../skills/view.mjs';

const near = (me, x, z) => Math.hypot((x ?? 0) - me.at.x, (z ?? 0) - me.at.z);

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
  const bedDist = myBed ? Math.hypot(me.at.x - (myBed[0] + 0.5), me.at.z - (myBed[2] + 0.5)) : Infinity;

  // 2. Their beds, nearest first; their base is where a respawned player is.
  const enemyBeds = beds.filter((b) => b.team !== team && b.state === 'standing');
  const pushable = [...enemyBeds].sort((a, b) => near(me, a.at[0], a.at[2]) - near(me, b.at[0], b.at[2]));
  const target = pushable[0] ?? null;
  const targetBed = target ? target.at : null;
  const targetDist = targetBed ? Math.hypot(targetBed[0] + 0.5 - me.at.x, targetBed[2] + 0.5 - me.at.z) : Infinity;
  const needBlocks = targetBed ? Math.max(48, skills.voidCellsToward(targetBed[0] + 0.5, targetBed[2] + 0.5) + 6) : 48;
  // What the rest of the crossing takes from where I stand now: a bridge already built counts for nothing.
  const needNow = targetBed ? skills.voidCellsToward(targetBed[0] + 0.5, targetBed[2] + 0.5) + 4 : 0;

  // 2b. A foe at my bed -- or close enough to hit me, or close enough that turning back can still save it -- first.
  const atBed = (f) => myBed ? Math.hypot((f.x ?? 0) - (myBed[0] + 0.5), (f.z ?? 0) - (myBed[2] + 0.5)) : Infinity;
  const intruder = myBed ? foes.find((f) => atBed(f) <= 14) ?? null : null;
  if (intruder && (bedDist <= 26 || foeDist <= 12 || targetDist > 12)) {
    if (!(skills.setting('bridgeDefence') && myBed && !skills.flag('housePushing') && skills.holdGroundAgainst(intruder, foeDist))) {
      await skills.fight(intruder, { summary: `meeting ${intruder.name || intruder.id} at my bed` });
      return;
    }
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
  if (!skills.flag('housePushing')) {
    const killWindow = skills.flag('houseSawFoe') && elapsed > 25 && foes.length === 0
      && (sword >= 6 || shop === 'wool' || targetDist <= 40);
    const gearedPush = elapsed >= (shop === 'wool' ? 40 : 55) && blocks >= needNow && foeDist > 25
      && (shop === 'wool' || sword >= 6);
    if (!myBed || killWindow || gearedPush || elapsed >= 480 || skills.flag('housePushWanted') || (elapsed >= 150 && foeDist > 40 && sword >= 6)) {
      skills.setFlag('housePushing', true);
      skills.setFlag('housePushWanted', true);
    }
  }

  // Short of the blocks the crossing still needs and no iron to buy them: the forge, not the void.
  const pushing = skills.flag('housePushing');
  const stranded = Boolean(targetBed && pushing && blocks < needNow && iron < 4);
  if ((stranded || regear || (!pushing && (wantsIron || wantsGold))) && (stranded || regear || foeDist > 26 || !foe)) {
    await skills.collectIfReached(`f-${team}`, forge.at, {
      bridge: false, stopWithin: 1.2, summary: `collecting at the ${team} forge`,
    });
    return;
  }

  // 9. Their bed: bridge to it. (Blocks short are the shop's and the forge's job, above, before I set foot on the void.)
  if (targetBed && pushing) {
    if (blocks < 4 || blocks < needNow) {
      await skills.collectIfReached(`f-${team}`, forge.at, {
        bridge: false, stopWithin: 1.2, summary: 'out of blocks: back for more',
      });
      return;
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
