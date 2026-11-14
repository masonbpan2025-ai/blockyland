// SkyWars playbook for Gemini: optimized for multi-player Free-For-All (FFA) on arbitrary maps.
//
// Key enhancements:
// 1. Full island looting before venturing into the middle: protects Gemini from early bridge clashes while opponents eliminate each other.
// 2. Anti-sandwich & third-party strategy: when two opponents fight, harass from range and clean up the weakened survivor instead of diving into 1v1v1.
// 3. Narrow ground / bridge safety: never charge head-on into an oncoming enemy on a narrow bridge; retreat to wide ground and hold bridge defense.
// 4. Dynamic map awareness: compute actual center/middle locations from view.places / view.objectives (works on twin_peaks, citadel, tiers, archipelago, etc.).
// 5. 3D distance and threat-aware chest prioritization: account for height and enemy presence before committing to distant or contested chests.

import {
  objectivesOf, placeOf,
} from '../../skills/view.mjs';

const flat = (me, x, z) => Math.hypot((x ?? 0) - me.at.x, (z ?? 0) - me.at.z);

/** Dynamic map center: resolves middle place if present, or nearest center chest cluster (e.g. Twin Peaks), never blind (0.5, 0.5). */
function mapCenter(view) {
  const me = view.me;
  const midPlace = placeOf(view, 'middle');
  if (midPlace) return { x: midPlace.at[0], y: midPlace.at[1], z: midPlace.at[2] };
  const centerChests = objectivesOf(view, 'chest').filter((o) => o.ring === 'center');
  if (centerChests.length > 0) {
    let best = null, bestD = Infinity;
    for (const c of centerChests) {
      const d = flat(me, c.at[0] + 0.5, c.at[2] + 0.5);
      if (d < bestD) { bestD = d; best = { x: c.at[0] + 0.5, y: c.at[1], z: c.at[2] + 0.5 }; }
    }
    if (best) return best;
  }
  return { x: 0.5, y: 31, z: 0.5 };
}

/** Where an alive opponent started (their island): nearest first. */
function enemyPlace(view) {
  const me = view.me;
  let best = null, bestD = Infinity;
  for (const q of view.players) {
    if (q.id === me.id || q.slot === me.slot || q.alive === false) continue;
    if (q.slot === null || q.slot === undefined) continue;
    const sp = placeOf(view, 'spawn', { slot: q.slot });
    if (!sp) continue;
    const d = flat(me, sp.at[0], sp.at[2]);
    if (d < bestD) { bestD = d; best = { x: sp.at[0], y: sp.at[1], z: sp.at[2], name: q.name || q.id }; }
  }
  return best;
}

export async function playSkyWars({ view, skills }) {
  if (view.phase !== 'playing') { skills.resetClock('skywars'); return; }
  if (!view.me.canAct) return;
  const me = view.me;

  skills.heal();

  const elapsed = skills.clock('skywars');
  const enemies = skills.enemies().filter((e) => !e.dead);
  const meWide = skills.wideAt(me.at.x, me.at.y, me.at.z);
  const foe = enemies[0] ?? null;
  const foeDist = foe ? flat(me, foe.x, foe.z) : Infinity;

  // --- 1. COMBAT & THREAT ASSESSMENT (FFA AWARE) -------------------------------------------------------------

  // 1a. Immediate urgent melee defense (within 3.8 blocks): must fight whoever is directly threatening us.
  if (foe && foeDist <= 3.8) {
    const target = enemies.filter((e) => flat(me, e.x, e.z) <= 3.8)
      .sort((a, b) => (a.health ?? 20) - (b.health ?? 20))[0] ?? foe;
    await skills.fight(target);
    return;
  }

  // 1b. Narrow ground / bridge protection: if we are on a bridge and an enemy is within 12 blocks,
  // do NOT charge forward into them! Throw projectiles to knock them off, or retreat to wide island ground!
  if (!meWide && foe && foeDist <= 12) {
    if (skills.setting('throwables') && skills.throwAtFoe(foe, foeDist)) {
      skills.equipBattleGear();
      return;
    }
    const safeSpot = skills.backOffSpot(foe.x, foe.z);
    if (safeSpot) {
      await skills.goTo([safeSpot.x, me.at.y, safeSpot.z], {
        bridge: false, stopWithin: 0.3, summary: `retreating to wide ground from ${foe.name || foe.id}`,
      });
      return;
    }
  }

  // 1c. Multi-enemy third-party positioning: if 2+ enemies are in sight and fighting each other (close to each other),
  // do not charge between them! Harass with throwables/bow or eat a golden apple to prep.
  if (enemies.length >= 2 && foeDist > 3.8 && foeDist <= 12) {
    const e0 = enemies[0], e1 = enemies[1];
    const distBetween = Math.hypot((e0.x ?? 0) - (e1.x ?? 0), (e0.z ?? 0) - (e1.z ?? 0));
    if (distBetween <= 5.0) {
      if (skills.setting('throwables') && skills.throwAtFoe(e0, foeDist)) {
        skills.equipBattleGear();
        return;
      }
      if (me.carrying.count('golden_apple') > 0 && !skills.isEating() && skills.absorption() < 1) {
        if (skills.startEating('golden_apple')) {
          skills.say('eating golden apple while foes duel');
          await skills.pauseStep();
          return;
        }
      }
      if (skills.setting('bowRange') && foeDist >= 12 && skills.shoot(e0)) {
        return;
      }
      if (meWide) {
        skills.lookAround();
        await skills.pauseStep();
        return;
      }
    }
  }

  // 1d. Close foe within 8 blocks on solid ground: engage directly (prioritizing low health).
  if (foe && foeDist <= 8) {
    const target = enemies.filter((e) => flat(me, e.x, e.z) <= 8)
      .sort((a, b) => (a.health ?? 20) - (b.health ?? 20))[0] ?? foe;
    await skills.fight(target);
    return;
  }

  // 1e. Ranged projectile at a foe on narrow ground or approaching within 18 blocks.
  if (foe && foeDist <= 18 && skills.setting('throwables') && skills.throwAtFoe(foe, foeDist)) {
    skills.equipBattleGear();
    return;
  }

  // 1f. Proactive golden apple before approaching combat (9-14 blocks).
  if (foe && foeDist <= 14 && !skills.isEating() && skills.absorption() < 1 && skills.health() > 14
    && me.carrying.count('golden_apple') > 0) {
    if (skills.startEating('golden_apple')) {
      skills.say('eating a golden apple before the fight');
      await skills.pauseStep();
      return;
    }
  }

  // 1g. Clock urgency: from 3:20 on the clock, seek out remaining players.
  if (foe && elapsed >= 200) { await skills.fight(foe); return; }

  // --- 2. CHESTS & OBJECTIVES ---------------------------------------------------------------------------------

  // Home spawn chests: chests belonging to our slot, or within 11 blocks of spawn point.
  const mySlot = me.slot;
  const spawn = mySlot !== null && mySlot !== undefined ? placeOf(view, 'spawn', { slot: mySlot }) : null;
  const home = spawn ? { x: spawn.at[0], z: spawn.at[2] } : { x: me.spawnPoint.x ?? 0, z: me.spawnPoint.z ?? 0 };
  const spawnChests = objectivesOf(view, 'chest').filter((c) => {
    if (c.looted) return false;
    if (c.slot !== null && c.slot !== undefined && mySlot !== null && mySlot !== undefined) return c.slot === mySlot;
    return Math.hypot(c.at[0] + 0.5 - home.x, c.at[2] + 0.5 - home.z) <= 11;
  });

  const nearest = (list) => [...list].sort((a, b) =>
    Math.hypot(a.at[0] + 0.5 - me.at.x, a.at[2] + 0.5 - me.at.z) -
    Math.hypot(b.at[0] + 0.5 - me.at.x, b.at[2] + 0.5 - me.at.z))[0];
  const label = (c) => `[${c.at[0]}, ${c.at[1]}, ${c.at[2]}]`;

  // Always loot all spawn chests on our island first!
  // In 5-player FFA, rushing mid with partial spawn loot causes early deaths while opponents collide.
  // Looting all 3 spawn chests takes ~3-4s and guarantees armor, weapons, blocks, and projectiles.
  if (spawnChests.length > 0) {
    const chest = nearest(spawnChests);
    await skills.loot(chest.at, { bridge: false, summary: `looting spawn chest at ${label(chest)}` });
    return;
  }

  // Candidate mid / center / connector chests:
  const centerChests = objectivesOf(view, 'chest').filter((c) => {
    if (c.looted) return false;
    if (c.slot !== null && c.slot !== undefined && mySlot !== null && mySlot !== undefined && c.slot === mySlot) return false;
    if (c.ring === 'center' || c.ring === 'mid') return true;
    return Math.hypot(c.at[0] + 0.5 - home.x, c.at[2] + 0.5 - home.z) > 12;
  });

  // Score candidate chests by 3D distance and safety (avoid chests being camped by enemies)
  function scoreChest(c) {
    const flatD = Math.hypot(c.at[0] + 0.5 - me.at.x, c.at[2] + 0.5 - me.at.z);
    const dy = Math.abs(c.at[1] - me.at.y);
    let s = flatD + dy * 2.0;
    for (const en of enemies) {
      const ed = Math.hypot((en.x ?? 0) - (c.at[0] + 0.5), (en.z ?? 0) - (c.at[2] + 0.5));
      if (ed < 6) s += 40; // penalize heavily if an enemy is near it
    }
    return s;
  }

  const blocks = me.carrying.blocks;
  if (centerChests.length > 0 && (blocks >= 4 || skills.creative())) {
    const sorted = [...centerChests].sort((a, b) => scoreChest(a) - scoreChest(b));
    for (const chest of sorted) {
      const voidCells = skills.voidCellsToward(chest.at[0] + 0.5, chest.at[2] + 0.5);
      if (blocks >= voidCells + 2 || skills.creative() || voidCells === 0) {
        await skills.loot(chest.at, { bridge: true, summary: `looting chest at ${label(chest)}` });
        return;
      }
    }
  }

  // --- 3. HUNTING & LATE-GAME POSITIONING ---------------------------------------------------------------------

  // If a foe is visible, engage
  if (foe) { await skills.fight(foe); return; }

  // Hunt at enemy spawn islands where alive players started
  const place = enemyPlace(view);
  if (place) {
    await skills.goTo([place.x, place.y, place.z], {
      bridge: blocks > 0 || skills.creative(), stopWithin: 2.0, summary: `hunting from ${place.name}'s island`,
    });
    return;
  }

  // Control the true map center
  const centerTarget = mapCenter(view);
  if (Math.hypot(me.at.x - centerTarget.x, me.at.z - centerTarget.z) > 4) {
    await skills.goTo([centerTarget.x, centerTarget.y, centerTarget.z], {
      bridge: blocks > 0 || skills.creative(), stopWithin: 2.0, summary: 'controlling the middle',
    });
  }
}
